"""Domain types for dogwatch.

Two layers, deliberately separate:

  Track     — one Frigate object id. Short-lived. Frigate drops and re-acquires
              ids on occlusion, on a dog leaving frame, and on a flat dog falling
              below threshold.
  DogState  — one actual dog. Long-lived. Exactly two of these exist for the
              lifetime of the process.

The stillness timer lives on DogState, never on Track. On a Track it would reset
every time Frigate re-acquired the dog and would therefore never fire — silently,
and in the direction that fails to tell you something is wrong.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Identity(str, Enum):
    CAGE_DOG = "cage_dog"
    ROAM_DOG = "roam_dog"
    UNKNOWN = "unknown"


class Confidence(str, Enum):
    """How much to trust an identity assignment.

    Surfaced all the way to the summariser prompt so it can hedge instead of
    inventing certainty about a sick animal.
    """
    CERTAIN = "certain"        # two dogs visible, exactly one in the crate
    INFERRED = "inferred"      # one dog visible, position implies which
    AMBIGUOUS = "ambiguous"    # can't tell


class ActivityState(str, Enum):
    ACTIVE = "active"
    RESTING = "resting"
    OUT_OF_VIEW = "out_of_view"


@dataclass(frozen=True)
class Detection:
    """One parsed Frigate event, normalised.

    Coordinates are fractions of the frame (0..1), never pixels. A pixel
    threshold silently becomes wrong the moment the camera or resolution
    changes; a normalised one does not.
    """
    ts: float
    event_type: str            # new | update | end
    obj_id: str
    camera: str
    label: str                 # dog | person
    score: float | None
    zones: tuple[str, ...]
    # centroid: what we measure movement with
    cx: float
    cy: float
    # bottom centre: what Frigate itself uses to decide zone membership
    bx: float
    by: float
    area: float                # normalised
    stationary: bool
    motionless_count: int
    position_changes: int

    @property
    def ended(self) -> bool:
        return self.event_type == "end"

    @staticmethod
    def from_frigate(payload: dict[str, Any], width: int, height: int,
                     ts: float | None = None) -> "Detection | None":
        """Parse a frigate/events payload. Returns None if unusable."""
        after = payload.get("after") or payload.get("before")
        if not isinstance(after, dict):
            return None
        obj_id = after.get("id")
        if not obj_id:
            return None
        box = after.get("box") or []
        if len(box) != 4:
            return None
        try:
            x1, y1, x2, y2 = (float(v) for v in box)
        except (TypeError, ValueError):
            return None
        if width <= 0 or height <= 0:
            return None

        # frame_time is when the frame was captured; prefer it over wall clock
        # so replay of a capture reproduces the original timing exactly.
        when = ts
        if when is None:
            when = after.get("frame_time") or after.get("start_time") or 0.0

        zones = after.get("current_zones") or []
        if not isinstance(zones, list):
            zones = []

        return Detection(
            ts=float(when),
            event_type=str(payload.get("type", "update")),
            obj_id=str(obj_id),
            camera=str(after.get("camera", "")),
            label=str(after.get("label", "")),
            score=_maybe_float(after.get("score")),
            zones=tuple(str(z) for z in zones),
            cx=((x1 + x2) / 2.0) / width,
            cy=((y1 + y2) / 2.0) / height,
            bx=((x1 + x2) / 2.0) / width,
            by=y2 / height,
            area=abs((x2 - x1) * (y2 - y1)) / (width * height),
            stationary=bool(after.get("stationary")),
            motionless_count=int(after.get("motionless_count") or 0),
            position_changes=int(after.get("position_changes") or 0),
        )


def _maybe_float(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


@dataclass
class Track:
    """One Frigate object id, while it lives."""
    obj_id: str
    label: str
    camera: str
    first_seen: float
    last_seen: float
    last: Detection
    ended: bool = False
    zones_ever: set[str] = field(default_factory=set)
    n_updates: int = 0

    @classmethod
    def start(cls, det: Detection) -> "Track":
        t = cls(
            obj_id=det.obj_id, label=det.label, camera=det.camera,
            first_seen=det.ts, last_seen=det.ts, last=det,
        )
        t.zones_ever.update(det.zones)
        t.n_updates = 1
        return t

    def update(self, det: Detection) -> None:
        self.last = det
        self.last_seen = det.ts
        self.zones_ever.update(det.zones)
        self.n_updates += 1
        if det.ended:
            self.ended = True

    def is_live(self, now: float, window: float) -> bool:
        return not self.ended and (now - self.last_seen) <= window

    def in_zone(self, zone: str) -> bool:
        return zone in self.last.zones


@dataclass
class Incident:
    """One firing of one rule, with the debounce state machine.

    clear -> pending -> notified -> (cooling) -> clear
    """
    rule: str
    subject: str                    # dog id, or "room" for room-level rules
    state: str = "clear"            # clear | pending | notified
    since: float | None = None      # when the condition first became true
    notified_at: float | None = None
    # Whether THIS occurrence actually sent something. An occurrence suppressed
    # by cooldown must not later emit a "resolved" for an alert you never got.
    announced: bool = False
    # Fired, but held back by quiet hours. Recorded for the journal; its resolve
    # is recorded too, and neither is sent.
    fired_silently: bool = False
    detail: str = ""

    def reset(self) -> None:
        self.state = "clear"
        self.since = None
        self.announced = False
        self.fired_silently = False
        self.detail = ""


@dataclass
class DogState:
    """One actual dog. Survives any number of Tracks."""
    dog_id: str
    name: str
    state: ActivityState = ActivityState.OUT_OF_VIEW
    state_since: float = 0.0
    confidence: Confidence = Confidence.AMBIGUOUS

    current_track_id: str | None = None
    last_seen: float | None = None
    last_pos: tuple[float, float] | None = None

    # Anchor for the stillness measurement. Moves only when the dog has
    # genuinely travelled further than min_movement from it.
    anchor_pos: tuple[float, float] | None = None
    anchor_ts: float = 0.0

    zones: tuple[str, ...] = ()
    # Distance accumulated this minute, for the rollup.
    movement_accum: float = 0.0
    detections_this_minute: int = 0

    incidents: dict[str, Incident] = field(default_factory=dict)

    def set_state(self, new: ActivityState, now: float) -> bool:
        """Returns True if the state actually changed."""
        if new is self.state:
            return False
        self.state = new
        self.state_since = now
        return True

    def still_for(self, now: float) -> float:
        """Seconds since the dog last moved beyond the movement threshold."""
        if self.anchor_ts == 0.0:
            return 0.0
        return max(0.0, now - self.anchor_ts)

    def incident(self, rule: str) -> Incident:
        inc = self.incidents.get(rule)
        if inc is None:
            inc = Incident(rule=rule, subject=self.dog_id)
            self.incidents[rule] = inc
        return inc
