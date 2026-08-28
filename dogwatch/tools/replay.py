#!/usr/bin/env python3
"""Run a capture through the whole dogwatch pipeline, offline.

No broker, no camera, no waiting — a simulated day completes in under a second.
Use it to check rule behaviour and tune thresholds before anything is live.

    python3 tools/replay.py day.jsonl --config dogwatch.yml.example
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from service.app import Dogwatch          # noqa: E402
from service.config import load           # noqa: E402
from service.ledger import Ledger         # noqa: E402


def hhmm(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%H:%M")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("capture")
    ap.add_argument("--config", default="dogwatch.yml.example")
    ap.add_argument("--db", default=":memory:")
    ap.add_argument("--tick", type=float, default=30.0)
    ap.add_argument("--timeline", action="store_true", help="print the activity timeline")
    ap.add_argument("--digest", action="store_true",
                    help="print the digest the summariser would send to Claude")
    ap.add_argument("--digest-hours", type=float, default=None,
                    help="window for --digest (default: the summariser default)")
    args = ap.parse_args()

    cfg = load(args.config, env={})
    for d in cfg.dogs:
        if d.name == d.id:
            d.name = "Bramble" if d.id == "cage_dog" else "Pip"

    ledger = Ledger(args.db)
    app = Dogwatch(cfg, ledger)

    t0 = time.perf_counter()
    app.run_replay(args.capture, tick_every=args.tick)
    elapsed = time.perf_counter() - t0

    rows = ledger.minutes(0, 4e9)
    span = (min(r["minute_ts"] for r in rows), max(r["minute_ts"] for r in rows)) if rows else (0, 0)

    print(f"\nReplayed {Path(args.capture).name} in {elapsed:.2f}s "
          f"({'shadow mode' if cfg.alerts.shadow_mode else 'LIVE SENDS'})")
    print(f"minute rows: {len(rows)}   span: {hhmm(span[0])}-{hhmm(span[1])}")

    print("\n--- Alerts ---")
    alerts = ledger.recent_alerts(0)
    if not alerts:
        print("  (none)")
    for a in alerts:
        if a["action"].endswith("_quiet"):
            tag = "quiet hours — recorded only"
        else:
            tag = "would send" if a["shadow"] else "SENT"
        print(f"  {hhmm(a['ts'])}  {a['action']:8s} {a['rule']:15s} "
              f"{a['subject']:10s} [{tag}]  {a['detail']}")

    print("\n--- Per-dog totals ---")
    all_stats = ledger.summary_stats(0, 4e9)
    room = all_stats.pop('__room__', None)
    if room:
        print(f"  room: {room['barks']} bark events, "
              f"{room['care_minutes']} care minutes")
    for dog, s in sorted(all_stats.items()):
        name = next((d.name for d in cfg.dogs if d.id == dog), dog)
        print(f"  {name} ({dog})")
        print(f"      minutes tracked : {s['minutes']}")
        print(f"      active/resting  : {s['active']} / {s['resting']}")
        print(f"      out of view     : {s['out_of_view']}")
        print(f"      longest still   : {s['longest_still_seconds']/3600:.1f}h")
        print(f"      care minutes    : {s['care_minutes']}")
        vis = s["visible_minutes"]
        print(f"      visible         : {vis}")
        print(f"      ambiguous ident : {s['ambiguous_minutes']} of {vis} visible "
              f"({100*s['ambiguous_minutes']/max(vis,1):.0f}%)")

    if args.timeline:
        print("\n--- Timeline (compressed runs) ---")
        runs = ledger.runs(0, 4e9)
        by_dog: dict[str, list] = {}
        for r in runs:
            by_dog.setdefault(r.dog, []).append(r)
        for dog, rs in sorted(by_dog.items()):
            name = next((d.name for d in cfg.dogs if d.id == dog), dog)
            print(f"\n  {name}:  {len(rs)} runs from "
                  f"{sum(r.minutes for r in rs)} minute rows")
            for r in rs:
                if r.minutes < 2:
                    continue
                z = ",".join(r.zones) or "-"
                print(f"    {hhmm(r.start_ts)}-{hhmm(r.end_ts + 60)} "
                      f"{r.state:11s} {r.minutes:4d}min  {z:<18s} "
                      f"conf={r.confidence}")
    if args.digest:
        from service.summarise import build_digest, build_request

        hours = args.digest_hours or cfg.summariser.default_window_hours
        end = max(r["minute_ts"] for r in rows) + 60 if rows else 0
        start = end - hours * 3600
        digest = build_digest(ledger, cfg, start, end)
        print("\n--- Digest sent to Claude "
              f"({hours:.0f}h window, {len(digest)} chars) ---")
        print(digest)

        body = build_request(cfg, digest, [])
        approx_in = len(digest) // 4 + len(body["system"][0]["text"]) // 4
        img = cfg.summariser.max_images
        print(f"\n  model {body['model']}, effort {body['output_config']['effort']}")
        print(f"  ~{approx_in} text tokens + up to {img} images (~{img * 1000} tokens)")
        est = (approx_in + img * 1000) / 1e6 * 5.0 + 800 / 1e6 * 25.0
        print(f"  estimated cost per /update: ${est:.3f}")

    ledger.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
