"""Track bookkeeping, identity resolution, and per-dog state.

Identity is resolved by geography. The dogs look alike; the crate does not.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .config import Config
from .models import (
    ActivityState,
    Confidence,
    Detection,
    DogState,
    Identity,
    Track,
)


@dataclass(frozen=True)
class Assignment:
    identity: Identity
    confidence: Confidence


class TrackRegistry:
    """Live Frigate object ids."""

    def __init__(self, live_window: float, reap_after: float) -> None:
        self.live_window = live_window
        self.reap_after = reap_after
        self.tracks: dict[str, Track] = {}

    def observe(self, det: Detection) -> Track:
        tr = self.tracks.get(det.obj_id)
        if tr is None:
            tr = Track.start(det)
            self.tracks[det.obj_id] = tr
        else:
            tr.update(det)
        return tr

    def reap(self, now: float) -> list[str]:
        """Drop ended tracks and ones Frigate stopped talking about.

        Frigate does occasionally miss an `end` event, so a timeout is required
        as well — otherwise a phantom dog lingers forever and identity
        resolution reports two dogs when there is one.
        """
        dead = [
            oid for oid, t in self.tracks.items()
            if t.ended or (now - t.last_seen) > self.reap_after
        ]
        for oid in dead:
            del self.tracks[oid]
        return dead

    def live(self, now: float, label: str | None = None) -> list[Track]:
        return [
            t for t in self.tracks.values()
            if t.is_live(now, self.live_window) and (label is None or t.label == label)
        ]


def resolve_identity(
    live_dogs: list[Track],
    cage_zone: str,
    *,
    cage_dog_away: bool = False,
) -> dict[str, Assignment]:
    """Map live dog tracks to identities.

    The truth table this implements is documented in the README. The important
    property is that it returns AMBIGUOUS rather than guessing — a confidently
    wrong claim about which dog is which is worse than an honest "not sure".
    """
    out: dict[str, Assignment] = {}
    if not live_dogs:
        return out

    in_cage = [t for t in live_dogs if t.in_zone(cage_zone)]
    out_cage = [t for t in live_dogs if not t.in_zone(cage_zone)]

    # The user has told us the crated dog is out of the room (physio, vet, a
    # carry outside). Anything we can see is therefore the roamer.
    if cage_dog_away:
        if len(live_dogs) == 1:
            out[live_dogs[0].obj_id] = Assignment(Identity.ROAM_DOG, Confidence.INFERRED)
        else:
            for t in live_dogs:
                out[t.obj_id] = Assignment(Identity.UNKNOWN, Confidence.AMBIGUOUS)
        return out

    # Both dogs visible and exactly one is in the crate — the only case we can
    # be genuinely certain about.
    if len(live_dogs) == 2 and len(in_cage) == 1:
        out[in_cage[0].obj_id] = Assignment(Identity.CAGE_DOG, Confidence.CERTAIN)
        out[out_cage[0].obj_id] = Assignment(Identity.ROAM_DOG, Confidence.CERTAIN)
        return out

    # One dog visible — position implies which, but the other could be anywhere.
    if len(live_dogs) == 1:
        t = live_dogs[0]
        ident = Identity.CAGE_DOG if t.in_zone(cage_zone) else Identity.ROAM_DOG
        out[t.obj_id] = Assignment(ident, Confidence.INFERRED)
        return out

    # Two or more, and the crate does not separate them.
    for t in live_dogs:
        out[t.obj_id] = Assignment(Identity.UNKNOWN, Confidence.AMBIGUOUS)
    return out


class DogTracker:
    """Owns the registry and exactly one DogState per configured dog."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.registry = TrackRegistry(
            cfg.tracking.live_window_seconds, cfg.tracking.reap_after_seconds
        )
        self.dogs: dict[str, DogState] = {
            d.id: DogState(dog_id=d.id, name=d.name) for d in cfg.dogs
        }
        self.cage_dog_away = False
        self.last_person_in_cage: float | None = None
        self.assignments: dict[str, Assignment] = {}
        # Room-level, because Frigate cannot attribute a bark to a dog.
        self.bark_times: list[float] = []

    # -- ingest ------------------------------------------------------------

    def on_detection(self, det: Detection) -> None:
        if det.label not in ("dog", "person"):
            return
        self.registry.observe(det)

        if det.label == "person" and self.cfg.cage_zone in det.zones:
            # You, repositioning him. This is care, not an incident, and it must
            # reset the stillness clock or the alert fires an hour after you
            # already did the thing it would ask you to do.
            self.last_person_in_cage = det.ts
            cage = self.cfg.cage_dog
            if cage.stillness.reset_on_person:
                st = self.dogs[cage.id]
                st.anchor_pos = None
                st.anchor_ts = det.ts

    def on_bark(self, ts: float) -> None:
        self.bark_times.append(ts)
        # keep an hour of history; the burst rule never looks further back
        cutoff = ts - 3600.0
        self.bark_times = [t for t in self.bark_times if t >= cutoff]

    def set_cage_dog_away(self, away: bool) -> None:
        self.cage_dog_away = away

    # -- periodic ----------------------------------------------------------

    def tick(self, now: float) -> None:
        """Re-resolve identity and roll each dog's state forward."""
        self.registry.reap(now)
        live_dogs = self.registry.live(now, label="dog")
        self.assignments = resolve_identity(
            live_dogs, self.cfg.cage_zone, cage_dog_away=self.cage_dog_away
        )

        by_identity: dict[str, Track] = {}
        confidence: dict[str, Confidence] = {}
        for tr in live_dogs:
            a = self.assignments.get(tr.obj_id)
            if a is None or a.identity is Identity.UNKNOWN:
                continue
            # If two tracks somehow claim one identity, prefer the fresher.
            prev = by_identity.get(a.identity.value)
            if prev is None or tr.last_seen > prev.last_seen:
                by_identity[a.identity.value] = tr
                confidence[a.identity.value] = a.confidence

        for dog_cfg in self.cfg.dogs:
            st = self.dogs[dog_cfg.id]
            tr = by_identity.get(dog_cfg.id)
            if tr is None:
                st.set_state(ActivityState.OUT_OF_VIEW, now)
                st.current_track_id = None
                st.confidence = Confidence.AMBIGUOUS
                st.zones = ()
                continue
            self._apply(st, dog_cfg, tr, confidence.get(dog_cfg.id, Confidence.INFERRED), now)

    def _apply(self, st: DogState, dog_cfg, tr: Track, conf: Confidence, now: float) -> None:
        det = tr.last
        pos = (det.cx, det.cy)

        # Did we actually lose sight of this dog, or was it simply lying still?
        #
        # Frigate stops running detection on stationary objects, so a long gap
        # between updates on a CONTINUOUS track id is the normal signature of a
        # dog lying still — Frigate's tracker is vouching for it being the same
        # object throughout. That is evidence of stillness, not absence, and
        # re-anchoring on it would throw away the very signal we need.
        #
        # A long gap that also comes with a NEW track id is different: Frigate
        # lost the object and re-acquired it. We cannot vouch for the interval,
        # so we re-anchor rather than claim a stillness duration we never
        # observed.
        track_changed = (
            st.current_track_id is not None and st.current_track_id != tr.obj_id
        )
        gap = (det.ts - st.last_seen) if st.last_seen is not None else 0.0
        gap_blind = track_changed and gap > self.cfg.tracking.live_window_seconds

        if st.anchor_pos is None or gap_blind:
            st.anchor_pos = pos
            st.anchor_ts = det.ts
        else:
            moved = math.dist(pos, st.anchor_pos)
            if moved >= dog_cfg.stillness.min_movement:
                st.anchor_pos = pos
                st.anchor_ts = det.ts

        if st.last_pos is not None:
            st.movement_accum += math.dist(pos, st.last_pos)

        st.current_track_id = tr.obj_id
        st.last_seen = det.ts
        st.last_pos = pos
        st.zones = det.zones
        st.confidence = conf
        st.detections_this_minute += 1

        # Frigate's own stationary flag corroborates our measurement; ours is
        # authoritative because it survives track churn and Frigate's does not.
        resting = det.stationary or st.still_for(now) > 30.0
        st.set_state(ActivityState.RESTING if resting else ActivityState.ACTIVE, now)

    # -- queries -----------------------------------------------------------

    def stillness_exempt(self, dog_cfg, st: DogState) -> bool:
        return any(z in st.zones for z in dog_cfg.stillness.exempt_zones)

    def barks_within(self, now: float, seconds: float) -> int:
        return sum(1 for t in self.bark_times if t >= now - seconds)

    def reset_minute_counters(self) -> None:
        for st in self.dogs.values():
            st.movement_accum = 0.0
            st.detections_this_minute = 0
