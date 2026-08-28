"""SQLite activity ledger.

Two granularities on purpose:

  events            append-only raw log. Chatty, but the thing you are glad to
                    have when a rule misbehaves and you need to know why.
  activity_minutes  one row per dog per minute. This is what /update reads:
                    six hours is ~360 rows per dog rather than tens of thousands
                    of raw events, which is the difference between a summary
                    that costs pennies and one that does not fit in a prompt.
"""

from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS events (
    id               INTEGER PRIMARY KEY,
    ts               REAL    NOT NULL,
    camera           TEXT,
    frigate_id       TEXT,
    dog              TEXT,
    confidence       TEXT,
    label            TEXT,
    event_type       TEXT,
    zones            TEXT,
    cx REAL, cy REAL, bx REAL, by REAL,
    score            REAL,
    stationary       INTEGER,
    motionless_count INTEGER,
    raw              TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts  ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_dog ON events(dog, ts);

CREATE TABLE IF NOT EXISTS activity_minutes (
    minute_ts      INTEGER NOT NULL,
    dog            TEXT    NOT NULL,
    state          TEXT,
    confidence     TEXT,
    movement       REAL    DEFAULT 0,
    still_seconds  REAL    DEFAULT 0,
    zones          TEXT,
    detections     INTEGER DEFAULT 0,
    person_present INTEGER DEFAULT 0,
    barks          INTEGER DEFAULT 0,
    PRIMARY KEY (minute_ts, dog)
);
CREATE INDEX IF NOT EXISTS idx_minutes_ts ON activity_minutes(minute_ts);

-- Small key/value store for things that must survive a restart: the Telegram
-- update offset (or a restart replays yesterday's commands) and the date of the
-- last daily summary (or a restart at 08:05 sends a second one).
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Things a person did, that no camera can see. For a paralysed dog on a
-- bladder-expression schedule this is the record that actually matters.
CREATE TABLE IF NOT EXISTS care_log (
    id     INTEGER PRIMARY KEY,
    ts     REAL NOT NULL,
    kind   TEXT NOT NULL,      -- fed | water | pee | poo | meds | note
    dog    TEXT,               -- NULL when it applies to both / unspecified
    note   TEXT,
    source TEXT NOT NULL       -- manual | camera
);
CREATE INDEX IF NOT EXISTS idx_care_ts ON care_log(ts);

-- Camera-derived zone visits. Presence and duration only: this records that a
-- dog was at the bowl, never that it drank.
CREATE TABLE IF NOT EXISTS zone_visits (
    id         INTEGER PRIMARY KEY,
    dog        TEXT NOT NULL,
    zone       TEXT NOT NULL,
    entered_ts REAL NOT NULL,
    left_ts    REAL,
    duration   REAL,
    confidence TEXT
);
CREATE INDEX IF NOT EXISTS idx_visits_ts ON zone_visits(entered_ts);

CREATE TABLE IF NOT EXISTS alerts (
    id      INTEGER PRIMARY KEY,
    ts      REAL NOT NULL,
    rule    TEXT,
    subject TEXT,
    action  TEXT,          -- fired | resolved
    shadow  INTEGER,       -- 1 = would have sent, sent nothing
    detail  TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);
"""


def minute_of(ts: float) -> int:
    return int(ts // 60 * 60)


@dataclass
class Run:
    """A stretch of consecutive minutes in the same state — what the summariser
    actually reads, instead of hundreds of near-identical rows."""
    dog: str
    state: str
    start_ts: int
    end_ts: int
    minutes: int
    movement: float
    zones: tuple[str, ...]
    detections: int
    barks: int
    confidence: str

    @property
    def duration_minutes(self) -> int:
        return self.minutes


class Ledger:
    def __init__(self, path: str | Path) -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.db.commit()

    def close(self) -> None:
        self.db.commit()
        self.db.close()

    # -- writes ------------------------------------------------------------

    def write_event(self, det, dog: str | None, confidence: str | None,
                    raw: dict[str, Any] | None = None) -> None:
        self.db.execute(
            "INSERT INTO events (ts, camera, frigate_id, dog, confidence, label, "
            "event_type, zones, cx, cy, bx, by, score, stationary, "
            "motionless_count, raw) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (det.ts, det.camera, det.obj_id, dog, confidence, det.label,
             det.event_type, ",".join(det.zones), det.cx, det.cy, det.bx, det.by,
             det.score, int(det.stationary), det.motionless_count,
             json.dumps(raw) if raw is not None else None),
        )

    def write_minute(self, minute_ts: int, dog: str, *, state: str,
                     confidence: str, movement: float, still_seconds: float,
                     zones: Sequence[str], detections: int,
                     person_present: bool, barks: int) -> None:
        """Upsert, so a restart mid-minute tops up rather than duplicating."""
        self.db.execute(
            "INSERT INTO activity_minutes (minute_ts, dog, state, confidence, "
            "movement, still_seconds, zones, detections, person_present, barks) "
            "VALUES (?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(minute_ts, dog) DO UPDATE SET "
            "  state=excluded.state, confidence=excluded.confidence, "
            "  movement=activity_minutes.movement + excluded.movement, "
            "  still_seconds=excluded.still_seconds, zones=excluded.zones, "
            "  detections=activity_minutes.detections + excluded.detections, "
            "  person_present=MAX(activity_minutes.person_present, excluded.person_present), "
            "  barks=activity_minutes.barks + excluded.barks",
            (minute_ts, dog, state, confidence, movement, still_seconds,
             ",".join(zones), detections, int(person_present), barks),
        )

    def write_alert(self, ts: float, rule: str, subject: str, action: str,
                    shadow: bool, detail: str) -> None:
        self.db.execute(
            "INSERT INTO alerts (ts, rule, subject, action, shadow, detail) "
            "VALUES (?,?,?,?,?,?)",
            (ts, rule, subject, action, int(shadow), detail),
        )

    def commit(self) -> None:
        self.db.commit()

    # -- meta key/value ----------------------------------------------------

    def get_meta(self, key: str, default: str | None = None) -> str | None:
        row = self.db.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default

    def set_meta(self, key: str, value: str) -> None:
        self.db.execute(
            "INSERT INTO meta (key, value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )
        self.db.commit()

    # -- care log ----------------------------------------------------------

    def write_care(self, ts: float, kind: str, *, dog: str | None = None,
                   note: str = "", source: str = "manual") -> None:
        self.db.execute(
            "INSERT INTO care_log (ts, kind, dog, note, source) VALUES (?,?,?,?,?)",
            (ts, kind, dog, note, source),
        )
        self.db.commit()

    def care_between(self, start_ts: float, end_ts: float) -> list[sqlite3.Row]:
        return list(self.db.execute(
            "SELECT * FROM care_log WHERE ts >= ? AND ts <= ? ORDER BY ts",
            (start_ts, end_ts),
        ))

    def last_care(self, kind: str) -> sqlite3.Row | None:
        return self.db.execute(
            "SELECT * FROM care_log WHERE kind = ? ORDER BY ts DESC LIMIT 1", (kind,)
        ).fetchone()

    # -- zone visits -------------------------------------------------------

    def write_visit(self, dog: str, zone: str, entered_ts: float,
                    left_ts: float, confidence: str) -> None:
        self.db.execute(
            "INSERT INTO zone_visits (dog, zone, entered_ts, left_ts, duration, "
            "confidence) VALUES (?,?,?,?,?,?)",
            (dog, zone, entered_ts, left_ts, max(0.0, left_ts - entered_ts), confidence),
        )

    def visits_between(self, start_ts: float, end_ts: float,
                       zone: str | None = None) -> list[sqlite3.Row]:
        q = ("SELECT * FROM zone_visits WHERE entered_ts >= ? AND entered_ts <= ?")
        args: list[Any] = [start_ts, end_ts]
        if zone:
            q += " AND zone = ?"
            args.append(zone)
        return list(self.db.execute(q + " ORDER BY entered_ts", args))

    def last_visit(self, zone: str, dog: str | None = None) -> sqlite3.Row | None:
        q = "SELECT * FROM zone_visits WHERE zone = ?"
        args: list[Any] = [zone]
        if dog:
            q += " AND dog = ?"
            args.append(dog)
        return self.db.execute(q + " ORDER BY entered_ts DESC LIMIT 1", args).fetchone()

    # -- reads -------------------------------------------------------------

    def minutes(self, start_ts: float, end_ts: float,
                dog: str | None = None) -> list[sqlite3.Row]:
        q = ("SELECT * FROM activity_minutes WHERE minute_ts >= ? AND minute_ts <= ?")
        args: list[Any] = [minute_of(start_ts), minute_of(end_ts)]
        if dog:
            q += " AND dog = ?"
            args.append(dog)
        q += " ORDER BY dog, minute_ts"
        return list(self.db.execute(q, args))

    def runs(self, start_ts: float, end_ts: float,
             dog: str | None = None) -> list[Run]:
        """Compress consecutive same-state minutes into runs.

        This is the compression that makes the summary affordable: a quiet
        six-hour afternoon collapses from 360 rows to a handful of lines.
        """
        rows = self.minutes(start_ts, end_ts, dog)
        out: list[Run] = []
        cur: Run | None = None
        prev_minute: int | None = None

        for r in rows:
            same = (
                cur is not None
                and cur.dog == r["dog"]
                and cur.state == r["state"]
                # a missing minute breaks the run; it is a gap, not continuity
                and prev_minute is not None
                and r["minute_ts"] == prev_minute + 60
            )
            if same and cur is not None:
                cur.end_ts = r["minute_ts"]
                cur.minutes += 1
                cur.movement += r["movement"] or 0.0
                cur.detections += r["detections"] or 0
                cur.barks += r["barks"] or 0
                zs = set(cur.zones) | set(filter(None, (r["zones"] or "").split(",")))
                cur.zones = tuple(sorted(zs))
                # The weakest confidence in a run is the run's confidence.
                if _rank(r["confidence"]) < _rank(cur.confidence):
                    cur.confidence = r["confidence"]
            else:
                if cur is not None:
                    out.append(cur)
                cur = Run(
                    dog=r["dog"], state=r["state"],
                    start_ts=r["minute_ts"], end_ts=r["minute_ts"], minutes=1,
                    movement=r["movement"] or 0.0,
                    zones=tuple(sorted(filter(None, (r["zones"] or "").split(",")))),
                    detections=r["detections"] or 0, barks=r["barks"] or 0,
                    confidence=r["confidence"] or "ambiguous",
                )
            prev_minute = r["minute_ts"]

        if cur is not None:
            out.append(cur)
        return out

    def summary_stats(self, start_ts: float, end_ts: float) -> dict[str, Any]:
        rows = self.minutes(start_ts, end_ts)
        per_dog: dict[str, dict[str, Any]] = {}
        for r in rows:
            d = per_dog.setdefault(r["dog"], {
                "minutes": 0, "active": 0, "resting": 0, "out_of_view": 0,
                "movement": 0.0, "barks": 0, "care_minutes": 0,
                "visible_minutes": 0, "ambiguous_minutes": 0,
                "longest_still_seconds": 0.0,
            })
            d["minutes"] += 1
            state = r["state"] or "out_of_view"
            if state in d:
                d[state] += 1
            d["movement"] += r["movement"] or 0.0
            d["barks"] += r["barks"] or 0
            d["care_minutes"] += 1 if r["person_present"] else 0
            # "Not on camera" and "on camera but we cannot tell which dog" are
            # completely different facts. Folding them together would let the
            # summary report a dog as unidentifiable when it simply was not
            # in frame.
            if state != "out_of_view":
                d["visible_minutes"] += 1
                if r["confidence"] == "ambiguous":
                    d["ambiguous_minutes"] += 1
            d["longest_still_seconds"] = max(
                d["longest_still_seconds"], r["still_seconds"] or 0.0
            )
        return per_dog

    def barks_by_hour(self, start_ts: float, end_ts: float) -> list[tuple[int, int]]:
        """Room-level bark counts bucketed by hour."""
        rows = self.db.execute(
            "SELECT CAST(minute_ts / 3600 AS INTEGER) * 3600 AS hour_ts, "
            "SUM(barks) AS n FROM activity_minutes "
            "WHERE dog = '__room__' AND minute_ts >= ? AND minute_ts <= ? "
            "GROUP BY hour_ts ORDER BY hour_ts",
            (minute_of(start_ts), minute_of(end_ts)),
        )
        return [(int(r["hour_ts"]), int(r["n"] or 0)) for r in rows]

    def recent_alerts(self, since_ts: float) -> list[sqlite3.Row]:
        return list(self.db.execute(
            "SELECT * FROM alerts WHERE ts >= ? ORDER BY ts", (since_ts,)
        ))

    # -- maintenance -------------------------------------------------------

    def prune(self, now: float, raw_days: int, minute_days: int) -> tuple[int, int]:
        e = self.db.execute("DELETE FROM events WHERE ts < ?",
                            (now - raw_days * 86400,)).rowcount
        m = self.db.execute("DELETE FROM activity_minutes WHERE minute_ts < ?",
                            (now - minute_days * 86400,)).rowcount
        # Zone visits are as chatty as raw events; the care log is small and
        # hand-written, so it is kept for as long as the minute rollup.
        self.db.execute("DELETE FROM zone_visits WHERE entered_ts < ?",
                        (now - raw_days * 86400,))
        self.db.commit()
        return e, m


_CONF_RANK = {"ambiguous": 0, "inferred": 1, "certain": 2}


def _rank(c: str | None) -> int:
    return _CONF_RANK.get(c or "ambiguous", 0)
