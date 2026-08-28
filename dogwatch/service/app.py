"""Wiring: source -> tracker -> ledger -> rules -> notifier.

The clock is a parameter everywhere, never `time.time()` inside the logic. That
is what lets a full simulated day run in under a second in the test suite, and
lets a recorded capture be replayed exactly.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from . import frigate
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

        # Only wire the summariser up when there is a key to call with.
        self.summarise_fn = None
        if cfg.anthropic_key:
            from .summarise import summarise
            self.summarise_fn = summarise

        self._current_minute: int | None = None
        self._person_this_minute = False
        self._barks_this_minute = 0
        self._last_tick = 0.0

        # Zone dwell bookkeeping for care tracking.
        self._zones_prev: dict[str, set[str]] = {}
        self._zone_entered: dict[tuple[str, str], float] = {}

        # Telegram command polling, wired in run_live().
        self.poller = None
        self.dashboard = None

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

        self._track_zone_visits(now)

        events = self.rules.evaluate(self.tracker, now)
        names = {d.id: (d.name or d.id) for d in self.cfg.dogs}
        muted = self.tracker.is_muted(now)

        for ev in events:
            if ev.suppressed:
                action = f"{ev.action}_quiet"
            elif muted:
                # You asked for silence. Still recorded, so the morning summary
                # can tell you what happened while it was muted.
                action = f"{ev.action}_muted"
            else:
                action = ev.action
                self._deliver_alert(ev, names)
            self.ledger.write_alert(ev.ts, ev.rule, ev.subject, action,
                                    self.cfg.alerts.shadow_mode, ev.detail)
            self.alerts_emitted.append(ev)

        self._maybe_daily_summary(now)
        self._last_tick = now
        return events

    # -- alert delivery ----------------------------------------------------

    def _deliver_alert(self, ev, names: dict[str, str]) -> None:
        text = ev.format(names)
        image = None
        if (self.cfg.send_snapshots and ev.action == "fired"
                and not self.cfg.alerts.shadow_mode):
            track_id = None
            st = self.tracker.dogs.get(ev.subject)
            if st is not None:
                track_id = st.current_track_id
            # Best effort. A missing picture must never delay the text.
            image = frigate.snapshot_for_alert(
                self.cfg.frigate_base_url, self.cfg.camera, track_id
            )
        if image:
            self.notifier.send_photo(text, image)
        else:
            self.notifier.send(text)

    # -- care: zone visits -------------------------------------------------

    def _track_zone_visits(self, now: float) -> None:
        """Record presence in tracked zones, with duration.

        Presence only. This records that a dog was at the bowl, never that it
        drank — the camera cannot see the difference and the summary must not
        pretend otherwise.
        """
        tracked = set(self.cfg.care.track_zones)
        if not tracked:
            return
        for dog_cfg in self.cfg.dogs:
            st = self.tracker.dogs[dog_cfg.id]
            current = set(st.zones) & tracked
            prev = self._zones_prev.get(dog_cfg.id, set())

            for z in current - prev:
                self._zone_entered[(dog_cfg.id, z)] = now
            for z in prev - current:
                entered = self._zone_entered.pop((dog_cfg.id, z), None)
                if entered is None:
                    continue
                # Sub-threshold dwell is a bounding box clipping a zone edge,
                # not a visit.
                if now - entered >= self.cfg.care.min_visit_seconds:
                    self.ledger.write_visit(dog_cfg.id, z, entered, now,
                                            st.confidence.value)
            self._zones_prev[dog_cfg.id] = current

    # -- daily summary -----------------------------------------------------

    def _maybe_daily_summary(self, now: float) -> bool:
        ds = self.cfg.daily_summary
        if not ds.enabled:
            return False
        local = datetime.fromtimestamp(now)
        today = local.strftime("%Y-%m-%d")
        if self.ledger.get_meta("last_daily_summary") == today:
            return False

        target = ds.minutes_of_day()
        minute_now = local.hour * 60 + local.minute
        if minute_now < target:
            return False

        # Mark the day done either way, so a late start does not queue one up
        # for the next tick and then send a "morning" summary at midnight.
        self.ledger.set_meta("last_daily_summary", today)

        if minute_now - target > ds.grace_minutes:
            log.info("skipping daily summary: %d min past %s, outside the grace "
                     "window", minute_now - target, ds.at)
            return False

        self.send_summary(now, ds.window_hours, prefix="Morning update")
        return True

    def send_summary(self, now: float, hours: float, *,
                     prefix: str = "Update", chat_id: int | None = None) -> bool:
        if self.summarise_fn is None:
            log.info("summary requested but no ANTHROPIC_API_KEY is set")
            return False
        try:
            result = self.summarise_fn(self.cfg, self.ledger,
                                       now - hours * 3600, now)
        except Exception as exc:
            log.error("summary failed: %s", exc)
            self.notifier.send(f"Could not build the summary: {exc}", chat_id)
            return False
        self.notifier.send(f"{prefix} (last {hours:.0f}h):\n\n{result.text}", chat_id)
        return True

    # -- commands ----------------------------------------------------------

    def handle_command(self, chat_id: int, text: str, now: float) -> str:
        from . import commands

        cmd = commands.parse_command(text)
        if cmd.name == "none":
            return ""
        reply = commands.handle(cmd, self.cfg, self.tracker, self.ledger, now,
                                summarise_fn=self.summarise_fn)
        if reply:
            self.notifier.send(reply, chat_id)
        return reply

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
        if self.poller is not None:
            self.poller.stop()
        if self.dashboard is not None:
            self.dashboard.shutdown()
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

    def start_services(self) -> None:
        """Start the Telegram poller and dashboard, if configured."""
        if self.cfg.telegram_token and self.cfg.chat_ids:
            from .telegram import TelegramPoller

            self.poller = TelegramPoller(
                self.cfg.telegram_token, self.cfg.chat_ids,
                get_offset=lambda: int(self.ledger.get_meta("telegram_offset", "0")),
                set_offset=lambda v: self.ledger.set_meta("telegram_offset", str(v)),
            )
            self.poller.start()
        else:
            log.warning("no Telegram token or chat ids — commands are unavailable")

        if self.cfg.dashboard.enabled:
            from .dashboard import start_dashboard

            self.dashboard = start_dashboard(self.cfg, self.ledger, self.tracker)

    def drain_commands(self, now: float) -> int:
        if self.poller is None:
            return 0
        n = 0
        for msg in self.poller.drain():
            try:
                self.handle_command(msg.chat_id, msg.text, now)
                n += 1
            except Exception as exc:
                # A bad command must never take the monitor down.
                log.error("command %r failed: %s", msg.text[:40], exc)
                self.notifier.send(f"Sorry — that command failed: {exc}",
                                   msg.chat_id)
        return n

    def run_live(self) -> None:
        import time

        from .source import mqtt_stream

        self.start_services()
        interval = self.cfg.tracking.poll_interval_seconds
        next_tick = time.time()
        for msg in mqtt_stream(self.cfg.mqtt_host, self.cfg.mqtt_port,
                               f"{self.cfg.topic_prefix}/#", self.cfg.client_id):
            if msg.topic != "__tick__":
                self.handle(msg.topic, msg.payload, msg.ts)
            now = time.time()
            # Commands are drained every loop, not every tick, so a reply feels
            # immediate rather than up to poll_interval late.
            self.drain_commands(now)
            if now >= next_tick:
                self.tick(now)
                next_tick = now + interval
