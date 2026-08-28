"""Wiring: source -> tracker -> ledger -> rules -> notifier.

The clock is a parameter everywhere, never `time.time()` inside the logic. That
is what lets a full simulated day run in under a second in the test suite, and
lets a recorded capture be replayed exactly.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from .config import Config
from .ledger import Ledger, minute_of
from .models import Confidence, Detection, Identity
from .notify import LogNotifier, Notifier, ShadowNotifier, TelegramNotifier
from .rules import RuleEngine

log = logging.getLogger("dogwatch")

# Pseudo-subject for facts that belong to the room rather than to a dog.
ROOM = "__room__"


class Dogwatch:
    def __init__(self, cfg: Config, ledger: Ledger, notifier: Notifier | None = None) -> None:
        from .tracking import DogTracker

        self.cfg = cfg
        self.ledger = ledger
        self.tracker = DogTracker(cfg)
        self.rules = RuleEngine(cfg)
        self.notifier = notifier or self._default_notifier(cfg)
        self.alerts_emitted: list = []

        self._current_minute: int | None = None
        self._person_this_minute = False
        self._barks_this_minute = 0
        self._last_tick = 0.0

    @staticmethod
    def _default_notifier(cfg: Config) -> Notifier:
        if cfg.alerts.shadow_mode:
            return ShadowNotifier()
        if cfg.telegram_token and cfg.chat_ids:
            return TelegramNotifier(cfg.telegram_token, cfg.chat_ids)
        log.warning("no Telegram credentials — falling back to logging only")
        return LogNotifier()

    # -- ingest ------------------------------------------------------------

    def handle(self, topic: str, payload: str, ts: float) -> None:
        prefix = self.cfg.topic_prefix
        self.rules.note_frigate_alive(ts)

        if topic == f"{prefix}/events":
            try:
                body = json.loads(payload)
            except json.JSONDecodeError:
                return
            det = Detection.from_frigate(
                body, self.cfg.detect_width, self.cfg.detect_height, ts=ts
            )
            if det is None:
                return
            self.tracker.on_detection(det)
            assignment = self.tracker.assignments.get(det.obj_id)
            dog = assignment.identity.value if assignment else None
            if dog == Identity.UNKNOWN.value:
                dog = None
            conf = assignment.confidence.value if assignment else Confidence.AMBIGUOUS.value
            self.ledger.write_event(det, dog, conf)
            if det.label == "person" and self.cfg.cage_zone in det.zones:
                self._person_this_minute = True

        elif f"/{self.cfg.camera}/audio/" in topic or "/audio/" in topic:
            leaf = topic.rsplit("/", 1)[-1]
            if leaf in ("dBFS", "rms", "transcription", "set", "state"):
                return
            if payload.strip().upper() == "ON":
                self.tracker.on_bark(ts)
                self._barks_this_minute += 1

    # -- periodic ----------------------------------------------------------

    def tick(self, now: float) -> list:
        self.tracker.tick(now)

        minute = minute_of(now)
        if self._current_minute is None:
            self._current_minute = minute
        elif minute != self._current_minute:
            self._flush_minute(self._current_minute)
            self._current_minute = minute

        events = self.rules.evaluate(self.tracker, now)
        names = {d.id: (d.name or d.id) for d in self.cfg.dogs}
        for ev in events:
            if not ev.suppressed:
                self.notifier.send(ev.format(names))
            action = f"{ev.action}_quiet" if ev.suppressed else ev.action
            self.ledger.write_alert(ev.ts, ev.rule, ev.subject, action,
                                    self.cfg.alerts.shadow_mode, ev.detail)
            self.alerts_emitted.append(ev)
        self._last_tick = now
        return events

    def _flush_minute(self, minute_ts: int) -> None:
        for dog_cfg in self.cfg.dogs:
            st = self.tracker.dogs[dog_cfg.id]
            self.ledger.write_minute(
                minute_ts, dog_cfg.id,
                state=st.state.value,
                confidence=st.confidence.value,
                movement=st.movement_accum,
                still_seconds=st.still_for(minute_ts + 60),
                zones=st.zones,
                detections=st.detections_this_minute,
                person_present=self._person_this_minute,
                barks=0,          # room-level; see the ROOM row below
            )
        # Barks belong to the room, not to a dog: Frigate cannot attribute a
        # bark to an animal. Writing them onto each dog's row would double-count
        # them and invite the summary to say which dog barked.
        self.ledger.write_minute(
            minute_ts, ROOM,
            state="room", confidence="n/a", movement=0.0, still_seconds=0.0,
            zones=(), detections=0,
            person_present=self._person_this_minute,
            barks=self._barks_this_minute,
        )
        self.tracker.reset_minute_counters()
        self._person_this_minute = False
        self._barks_this_minute = 0
        self.ledger.commit()

    def close(self) -> None:
        if self._current_minute is not None:
            self._flush_minute(self._current_minute)
        self.ledger.commit()

    # -- runners -----------------------------------------------------------

    def run_replay(self, path: str | Path, tick_every: float = 30.0) -> None:
        """Drive the whole pipeline from a capture, with a simulated clock."""
        from .source import replay

        next_tick: float | None = None
        for msg in replay(path):
            if next_tick is None:
                next_tick = msg.ts
            # Advance the simulated clock in tick_every steps so periodic logic
            # sees the same cadence it would live.
            while next_tick is not None and msg.ts >= next_tick:
                self.tick(next_tick)
                next_tick += tick_every
            self.handle(msg.topic, msg.payload, msg.ts)
        if next_tick is not None:
            self.tick(next_tick)
        self.close()

    def run_live(self) -> None:
        import time

        from .source import mqtt_stream

        interval = self.cfg.tracking.poll_interval_seconds
        next_tick = time.time()
        for msg in mqtt_stream(self.cfg.mqtt_host, self.cfg.mqtt_port,
                               f"{self.cfg.topic_prefix}/#", self.cfg.client_id):
            if msg.topic != "__tick__":
                self.handle(msg.topic, msg.payload, msg.ts)
            now = time.time()
            if now >= next_tick:
                self.tick(now)
                next_tick = now + interval
