#!/usr/bin/env python3
"""
Phase 2 — watch Frigate's MQTT firehose and characterise it.

This exists to answer questions the dogwatch service's design depends on, using
real data instead of assumptions:

  1. How much do Frigate object ids churn? (Does one dog = one track, or many?)
  2. When a dog goes still, how long until we hear anything? (Sizes the stillness
     detector, and tells us whether polling is needed alongside events.)
  3. Is `current_zones` trustworthy?
  4. How often is the cage/roam identity split unambiguous?
  5. What is the real message rate and topic mix?

Everything received is also appended to a JSONL file so Phase 3 can be designed
and unit-tested offline against a real recording rather than synthetic data.

Usage:
    pip install -r tools/requirements.txt
    python3 tools/mqtt_watch.py --out phase2.jsonl

    # then leave it running for at least an hour, ideally a full day
    # Ctrl-C prints the final report

    # replay a capture later, without a broker:
    python3 tools/mqtt_watch.py --replay phase2.jsonl
"""

from __future__ import annotations

import argparse
import json
import signal
import statistics
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None  # only needed for live capture, not for --replay


# --------------------------------------------------------------------------
# Track bookkeeping
# --------------------------------------------------------------------------

@dataclass
class TrackObs:
    """What we learned about one Frigate object id over its life."""
    obj_id: str
    label: str
    camera: str
    first_seen: float
    last_seen: float
    n_messages: int = 0
    zones_seen: Counter = field(default_factory=Counter)
    max_motionless: int = 0
    position_changes: int = 0
    ever_stationary: bool = False
    gaps: list[float] = field(default_factory=list)
    ended: bool = False

    @property
    def lifetime(self) -> float:
        return self.last_seen - self.first_seen


class Stats:
    def __init__(self, width: int, height: int, cage_zone: str,
                 live_window: float = 180.0) -> None:
        self.width = width
        self.height = height
        self.cage_zone = cage_zone
        # How long after its last update a track still counts as 'present'.
        # A stationary dog can go minutes between updates, so a window that is
        # too short makes a dog that is plainly there look absent. Set this from
        # the p95 gap this tool reports, not from a guess.
        self.live_window = live_window
        self.started = time.time()
        self.topic_counts: Counter = Counter()
        self.tracks: dict[str, TrackObs] = {}
        self.audio_events: Counter = Counter()
        # Samples of "how many dogs were visible, and how many in the cage"
        self.occupancy_samples: Counter = Counter()
        self.zone_missing = 0
        self.zone_present = 0

    # -- ingest ------------------------------------------------------------

    def record_event(self, payload: dict[str, Any], now: float) -> str | None:
        """Handle a frigate/events payload. Returns a printable one-liner."""
        etype = payload.get("type", "?")
        after = payload.get("after") or payload.get("before") or {}
        obj_id = after.get("id")
        if not obj_id:
            return None

        label = after.get("label", "?")
        camera = after.get("camera", "?")
        zones = after.get("current_zones") or []
        stationary = bool(after.get("stationary"))
        motionless = int(after.get("motionless_count") or 0)
        pos_changes = int(after.get("position_changes") or 0)
        score = after.get("score")
        box = after.get("box") or []

        if zones:
            self.zone_present += 1
        else:
            self.zone_missing += 1

        tr = self.tracks.get(obj_id)
        if tr is None:
            tr = TrackObs(
                obj_id=obj_id, label=label, camera=camera,
                first_seen=now, last_seen=now,
            )
            self.tracks[obj_id] = tr
        else:
            gap = now - tr.last_seen
            if gap > 0:
                tr.gaps.append(gap)
            tr.last_seen = now

        tr.n_messages += 1
        tr.max_motionless = max(tr.max_motionless, motionless)
        tr.position_changes = max(tr.position_changes, pos_changes)
        tr.ever_stationary = tr.ever_stationary or stationary
        for z in zones:
            tr.zones_seen[z] += 1
        if etype == "end":
            tr.ended = True

        # Identity feasibility: among currently-live dog tracks, how many are in
        # the cage zone right now?
        self._sample_occupancy(now)

        cx = cy = bx = by = None
        if len(box) == 4:
            x1, y1, x2, y2 = box
            cx = ((x1 + x2) / 2) / self.width
            cy = ((y1 + y2) / 2) / self.height
            bx = ((x1 + x2) / 2) / self.width      # bottom-centre: what Frigate
            by = y2 / self.height                   # uses for zone membership

        pos = f"c=({cx:.3f},{cy:.3f}) b=({bx:.3f},{by:.3f})" if cx is not None else "box=?"
        flag = "STILL" if stationary else "move "
        return (
            f"{etype:6s} {label:6s} {obj_id[-6:]} {flag} "
            f"ml={motionless:<4d} pc={pos_changes:<3d} "
            f"score={score if score is None else round(score, 2):<5} "
            f"zones={','.join(zones) or '-':<20s} {pos}"
        )

    def _sample_occupancy(self, now: float) -> None:
        live_dogs = [
            t for t in self.tracks.values()
            if t.label == "dog" and not t.ended
            and (now - t.last_seen) < self.live_window
        ]
        in_cage = sum(1 for t in live_dogs if self.cage_zone in t.zones_seen)
        self.occupancy_samples[(len(live_dogs), in_cage)] += 1

    def record_audio(self, topic: str, payload: str) -> None:
        if payload.strip().upper() == "ON":
            self.audio_events[topic.split("/")[-1]] += 1

    # -- reporting ---------------------------------------------------------

    def report(self) -> str:
        elapsed = max(time.time() - self.started, 1.0)
        hours = elapsed / 3600.0
        out: list[str] = []
        A = out.append

        A("")
        A("=" * 78)
        A(f"  PHASE 2 REPORT — {elapsed/60:.1f} minutes observed")
        A("=" * 78)

        A("")
        A("Messages by topic:")
        for topic, n in self.topic_counts.most_common(15):
            A(f"    {n:7d}  {topic}")

        dogs = [t for t in self.tracks.values() if t.label == "dog"]
        people = [t for t in self.tracks.values() if t.label == "person"]

        A("")
        A("-" * 78)
        A("Q1. Track id churn — does one dog stay one track?")
        A("-" * 78)
        A(f"    distinct dog tracks    : {len(dogs)}  ({len(dogs)/hours:.1f}/hour)")
        A(f"    distinct person tracks : {len(people)}")
        if dogs:
            lifetimes = sorted(t.lifetime for t in dogs)
            A(f"    dog track lifetime     : median {statistics.median(lifetimes):.0f}s  "
              f"min {lifetimes[0]:.0f}s  max {lifetimes[-1]:.0f}s")
            short = sum(1 for t in dogs if t.lifetime < 30)
            A(f"    tracks under 30s       : {short}/{len(dogs)} "
              f"({100*short/len(dogs):.0f}%)")
            A("")
            A("    Reading: high churn (many short tracks) means the DogState layer")
            A("    must absorb re-acquisition. Low churn means Frigate's stationary")
            A("    tracking is holding ids and the design gets simpler.")

        A("")
        A("-" * 78)
        A("Q2. When a dog goes still, how long until we hear anything?")
        A("-" * 78)
        all_gaps = [g for t in dogs for g in t.gaps]
        if all_gaps:
            all_gaps.sort()
            p50 = all_gaps[len(all_gaps)//2]
            p95 = all_gaps[int(len(all_gaps)*0.95)]
            A(f"    gap between updates    : median {p50:.1f}s  p95 {p95:.1f}s  "
              f"max {all_gaps[-1]:.1f}s")
            A(f"    max motionless_count   : "
              f"{max((t.max_motionless for t in dogs), default=0)} frames")
            A(f"    tracks ever stationary : "
              f"{sum(1 for t in dogs if t.ever_stationary)}/{len(dogs)}")
            A("")
            A("    Reading: if the max gap is large, event-driven stillness detection")
            A("    alone will be blind for that long. Anything approaching the alert")
            A("    threshold means the service also needs to poll Frigate's HTTP API")
            A("    rather than waiting for MQTT.")
        else:
            A("    (no dog tracks with multiple updates yet)")

        A("")
        A("-" * 78)
        A("Q3. Is current_zones trustworthy?")
        A("-" * 78)
        total_z = self.zone_present + self.zone_missing
        if total_z:
            A(f"    updates with a zone    : {self.zone_present}/{total_z} "
              f"({100*self.zone_present/total_z:.0f}%)")
        zone_hist: Counter = Counter()
        for t in dogs:
            for z, n in t.zones_seen.items():
                zone_hist[z] += n
        for z, n in zone_hist.most_common():
            A(f"      {z:<20s} {n}")
        if not zone_hist:
            A("      (no zone hits — check your zone coordinates in the Frigate UI)")

        A("")
        A("-" * 78)
        A("Q4. Identity feasibility — can cage-vs-roam actually separate them?")
        A("-" * 78)
        A(f"    liveness window: {self.live_window:.0f}s "
          f"(a track counts as present this long after its last update)")
        A("    (live dogs visible, of which in cage) -> observations")
        total_occ = sum(self.occupancy_samples.values()) or 1
        ambiguous = 0
        for (n_dogs, n_cage), n in sorted(self.occupancy_samples.items()):
            verdict = ""
            if n_dogs == 2 and n_cage == 1:
                verdict = "  <- ideal: unambiguous"
            elif n_dogs == 1:
                verdict = "  <- inferable"
            elif n_dogs >= 2 and n_cage != 1:
                verdict = "  <- AMBIGUOUS"
                ambiguous += n
            A(f"      ({n_dogs} dogs, {n_cage} in cage): {n:6d} "
              f"({100*n/total_occ:4.1f}%){verdict}")
        A("")
        A(f"    ambiguity rate: {100*ambiguous/total_occ:.1f}%")
        A("    Reading: if this is low, identity-by-geography works and Phase 3")
        A("    proceeds as planned. If it is high, the summariser must hedge much")
        A("    harder, or the cage needs its own dedicated camera.")

        A("")
        A("-" * 78)
        A("Q5. Audio / bark events")
        A("-" * 78)
        if self.audio_events:
            for k, n in self.audio_events.most_common():
                A(f"    {k:<15s} {n} ({n/hours:.1f}/hour)")
            A("")
            A("    Reading: cross-check these against what actually happened. A high")
            A("    rate usually means min_volume is too low and you are detecting")
            A("    the television.")
        else:
            A("    No audio events seen.")
            A("    Either nothing barked, or the stream carries no audio, or")
            A("    min_volume is too high. Check Settings -> Debug -> Audio in the")
            A("    Frigate UI for live RMS levels.")

        A("")
        A("=" * 78)
        return "\n".join(out)


# --------------------------------------------------------------------------
# Runner
# --------------------------------------------------------------------------

def make_handler(stats: Stats, sink, quiet: bool):
    def handle(topic: str, raw: str, now: float) -> None:
        stats.topic_counts[topic] += 1
        if sink is not None:
            sink.write(json.dumps({"t": now, "topic": topic, "payload": raw}) + "\n")
            sink.flush()

        if topic.endswith("/events"):
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                return
            line = stats.record_event(payload, now)
            if line and not quiet:
                ts = time.strftime("%H:%M:%S", time.localtime(now))
                print(f"[{ts}] {line}", flush=True)

        elif "/audio/" in topic and not topic.endswith(("dBFS", "rms", "transcription")):
            stats.record_audio(topic, raw)
            if not quiet and raw.strip().upper() == "ON":
                ts = time.strftime("%H:%M:%S", time.localtime(now))
                print(f"[{ts}] AUDIO  {topic.split('/')[-1]}", flush=True)

        elif topic == "frigate/available" and not quiet:
            print(f"*** frigate/available = {raw}", flush=True)

    return handle


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", type=int, default=1883)
    ap.add_argument("--topic", default="frigate/#")
    ap.add_argument("--out", help="append everything received to this JSONL file")
    ap.add_argument("--replay", help="replay a JSONL capture instead of connecting")
    ap.add_argument("--width", type=int, default=1024, help="detect width, for normalising boxes")
    ap.add_argument("--height", type=int, default=576, help="detect height")
    ap.add_argument("--cage-zone", default="cage")
    ap.add_argument("--live-window", type=float, default=180.0,
                    help="seconds a track stays 'present' after its last update; "
                         "set from the p95 gap reported in Q2")
    ap.add_argument("--every", type=int, default=600,
                    help="print an interim report every N seconds (0 to disable)")
    ap.add_argument("--quiet", action="store_true", help="stats only, no per-event lines")
    args = ap.parse_args()

    stats = Stats(args.width, args.height, args.cage_zone, args.live_window)

    # ---- replay mode -----------------------------------------------------
    if args.replay:
        handle = make_handler(stats, None, args.quiet)
        with open(args.replay) as fh:
            first = None
            for line in fh:
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if first is None:
                    first = rec["t"]
                    stats.started = first
                handle(rec["topic"], rec["payload"], rec["t"])
        print(stats.report())
        return 0

    # ---- live mode -------------------------------------------------------
    if mqtt is None:
        print("paho-mqtt is not installed. pip install -r tools/requirements.txt",
              file=sys.stderr)
        return 1

    sink = open(args.out, "a") if args.out else None
    handle = make_handler(stats, sink, args.quiet)

    def on_connect(client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            print(f"connect failed: {reason_code}", file=sys.stderr)
            return
        client.subscribe(args.topic)
        print(f"connected to {args.host}:{args.port}, subscribed to {args.topic}")
        print("Leave this running for at least an hour. Ctrl-C for the report.\n")
        # ask Frigate to republish current state
        client.publish("frigate/onConnect", "")

    def on_message(client, userdata, msg):
        try:
            raw = msg.payload.decode("utf-8", errors="replace")
        except Exception:
            return
        handle(msg.topic, raw, time.time())

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="dogwatch-mqtt-watch")
    client.on_connect = on_connect
    client.on_message = on_message

    stop = False

    def on_sigint(_sig, _frm):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, on_sigint)
    signal.signal(signal.SIGTERM, on_sigint)

    try:
        client.connect(args.host, args.port, keepalive=60)
    except OSError as exc:
        print(f"could not connect to broker at {args.host}:{args.port}: {exc}",
              file=sys.stderr)
        return 1

    client.loop_start()
    last_report = time.time()
    try:
        while not stop:
            time.sleep(0.5)
            if args.every and (time.time() - last_report) >= args.every:
                print(stats.report(), flush=True)
                last_report = time.time()
    finally:
        client.loop_stop()
        client.disconnect()
        if sink:
            sink.close()
        print(stats.report())
        if args.out:
            print(f"Raw capture written to {args.out}")
            print(f"Replay it any time with:  python3 {sys.argv[0]} --replay {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
