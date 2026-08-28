#!/usr/bin/env python3
"""Generate a realistic 24-hour Frigate capture for testing without a camera.

Models the things that actually matter for this system:

  * Frigate's stationary behaviour — a still dog keeps its track id and produces
    updates only every `interval`, so long gaps are normal and are NOT absence.
  * Track churn for the roaming dog — new ids constantly as it leaves and
    re-enters frame.
  * Care events — a person entering the crate zone to reposition the dog.
  * Both dogs visible together, which is the only case identity is certain.

Scenarios:
  normal    a good day: regular care, both dogs behaving normally
  incident  nobody repositions the crated dog all afternoon — the stillness
            rule should catch it exactly once
  ambiguous both dogs loose together for long stretches — identity should
            degrade to ambiguous rather than guess

Usage:
    python3 tools/simulate_day.py --scenario incident --out day.jsonl
"""

from __future__ import annotations

import argparse
import json
import random

W, H = 1024, 576
CAGE_BOX = (80, 380, 300, 520)          # crate interior, roughly
BED_BOX = (620, 300, 830, 440)
WATER_BOX = (820, 200, 960, 300)
DOOR_BOX = (420, 40, 640, 200)


def box_at(base, dx=0.0, dy=0.0, jitter=0.0, rng=None):
    x1, y1, x2, y2 = base
    j = (lambda: rng.uniform(-jitter, jitter)) if (jitter and rng) else (lambda: 0.0)
    return [x1 + dx + j(), y1 + dy + j(), x2 + dx + j(), y2 + dy + j()]


def zones_for(box):
    """Frigate decides zone membership on the BOTTOM CENTRE of the box."""
    bx = (box[0] + box[2]) / 2
    by = box[3]
    out = []
    if 60 <= bx <= 320 and 340 <= by <= 540:
        out.append("cage")
    if 600 <= bx <= 850 and 280 <= by <= 460:
        out.append("bed_roam")
    if 800 <= bx <= 980 and 180 <= by <= 320:
        out.append("water_food")
    if 400 <= bx <= 660 and 20 <= by <= 220:
        out.append("doorway")
    return out


def emit(recs, ts, etype, oid, label, box, *, stationary, motionless,
         pos_changes, score=0.72):
    body = {
        "id": oid, "camera": "dogs_main", "label": label,
        "frame_time": ts, "score": round(score, 4), "top_score": round(score, 4),
        "box": [round(v) for v in box],
        "area": round(abs((box[2]-box[0]) * (box[3]-box[1]))),
        "current_zones": zones_for(box), "entered_zones": zones_for(box),
        "stationary": stationary, "motionless_count": motionless,
        "position_changes": pos_changes, "active": not stationary,
        "false_positive": False, "start_time": ts,
        "end_time": ts if etype == "end" else None,
    }
    recs.append({"t": ts, "topic": "frigate/events",
                 "payload": json.dumps({"type": etype, "before": body, "after": body})})


def still_segment(recs, start, end, oid, base, rng, *, label="dog",
                  interval=120.0, drift=0.0):
    """A dog lying still: ONE track id, sparse updates, tiny jitter.

    This is the Frigate-stationary signature the stillness rule depends on.
    """
    t = start
    ml = 0
    emit(recs, t, "new", oid, label, box_at(base, jitter=2, rng=rng),
         stationary=False, motionless=0, pos_changes=0)
    t += 8
    while t < end:
        ml += int(interval * 5)                       # 5 fps
        # tiny sub-threshold jitter — breathing, box wobble
        b = box_at(base, dx=rng.uniform(-3, 3) + drift * (t - start) / 3600,
                   dy=rng.uniform(-2, 2))
        emit(recs, t, "update", oid, label, b,
             stationary=True, motionless=ml, pos_changes=1)
        t += rng.uniform(interval * 0.8, interval * 1.2)
    return t


def shift_position(recs, t, oid, base, rng, dx, dy):
    """A real position change — a repositioning, or the dog shuffling."""
    b = box_at(base, dx=dx, dy=dy, jitter=3, rng=rng)
    emit(recs, t, "update", oid, "dog", b, stationary=False, motionless=0,
         pos_changes=2)
    return b


def roam_burst(recs, start, rng, n_tracks=3):
    """The roaming dog moving about: many short-lived track ids."""
    t = start
    for k in range(n_tracks):
        oid = f"{int(t)}.{k}-roam"
        target = rng.choice([BED_BOX, WATER_BOX, DOOR_BOX, BED_BOX])
        emit(recs, t, "new", oid, "dog", box_at(target, jitter=8, rng=rng),
             stationary=False, motionless=0, pos_changes=0)
        for j in range(rng.randint(2, 6)):
            t += rng.uniform(2, 9)
            emit(recs, t, "update", oid, "dog",
                 box_at(target, dx=j * 12, jitter=8, rng=rng),
                 stationary=False, motionless=j, pos_changes=j)
        t += 3
        emit(recs, t, "end", oid, "dog", box_at(target, dx=40, jitter=8, rng=rng),
             stationary=False, motionless=0, pos_changes=2)
        t += rng.uniform(20, 120)
    return t


def care_visit(recs, t, rng, cage_oid, cage_base):
    """You come in and reposition him. Person in the crate zone."""
    pid = f"{int(t)}-person"
    emit(recs, t, "new", pid, "person", box_at((150, 120, 330, 500), jitter=10, rng=rng),
         stationary=False, motionless=0, pos_changes=0, score=0.86)
    for j in range(4):
        emit(recs, t + j * 6, "update", pid, "person",
             box_at((150, 120, 330, 500), dx=j * 8, jitter=10, rng=rng),
             stationary=False, motionless=0, pos_changes=j, score=0.86)
    # the actual repositioning: dog's box genuinely moves
    shift_position(recs, t + 20, cage_oid, cage_base, rng,
                   dx=rng.uniform(30, 70), dy=rng.uniform(-15, 15))
    emit(recs, t + 40, "end", pid, "person", box_at((150, 120, 330, 500), jitter=10, rng=rng),
         stationary=False, motionless=0, pos_changes=2, score=0.86)


def build(scenario: str, seed: int, day_start: float) -> list[dict]:
    rng = random.Random(seed)
    recs: list[dict] = []
    recs.append({"t": day_start, "topic": "frigate/available", "payload": "online"})

    HOUR = 3600.0
    cage_oid = f"{int(day_start)}-cage"
    cage_base = list(CAGE_BOX)

    # Care visits: when someone repositions the crated dog.
    if scenario == "incident":
        # Morning care, then nothing all afternoon — the thing we want caught.
        care_times = [7.5, 9.0]
    elif scenario == "ambiguous":
        care_times = [7.5, 12.0, 16.0, 20.0]
    else:
        care_times = [7.5, 10.5, 13.5, 16.5, 19.5, 22.0]

    # --- the crated dog: one long-lived track, re-anchored at each care visit
    t = day_start
    for hour in care_times + [24.0]:
        seg_end = day_start + hour * HOUR
        if seg_end <= t:
            continue
        still_segment(recs, t, seg_end, cage_oid, cage_base, rng, interval=120.0)
        if hour < 24.0:
            care_visit(recs, seg_end, rng, cage_oid, cage_base)
            # he ends up somewhere slightly different
            cage_base = [v + rng.uniform(-25, 45) for v in cage_base]
        t = seg_end + 60

    # --- the roaming dog: active in bursts through the waking day
    for hour in range(6, 23):
        if scenario == "ambiguous" and 12 <= hour <= 18:
            # both dogs loose together near the crate — identity should degrade
            base = day_start + hour * HOUR
            for k in range(6):
                oid = f"{int(base)}.{k}-amb"
                b = box_at(CAGE_BOX, dx=rng.uniform(-20, 20), jitter=6, rng=rng)
                emit(recs, base + k * 90, "new", oid, "dog", b,
                     stationary=False, motionless=0, pos_changes=0)
                emit(recs, base + k * 90 + 30, "end", oid, "dog", b,
                     stationary=False, motionless=0, pos_changes=1)
            continue
        n = rng.randint(1, 4)
        roam_burst(recs, day_start + hour * HOUR + rng.uniform(0, 1800), rng, n)

    # --- barks
    n_barks = 40 if scenario != "normal" else 18
    for _ in range(n_barks):
        bt = day_start + rng.uniform(6 * HOUR, 23 * HOUR)
        recs.append({"t": bt, "topic": "frigate/dogs_main/audio/bark", "payload": "ON"})
        recs.append({"t": bt + 6, "topic": "frigate/dogs_main/audio/bark", "payload": "OFF"})
    if scenario == "incident":
        burst = day_start + 15.2 * HOUR
        for k in range(8):
            recs.append({"t": burst + k * 20, "topic": "frigate/dogs_main/audio/bark",
                         "payload": "ON"})
            recs.append({"t": burst + k * 20 + 5, "topic": "frigate/dogs_main/audio/bark",
                         "payload": "OFF"})

    recs.sort(key=lambda r: r["t"])
    return recs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scenario", default="normal",
                    choices=["normal", "incident", "ambiguous"])
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="day.jsonl")
    ap.add_argument("--day-start", type=float, default=1767225600.0,  # 2026-01-01 00:00 UTC
                    help="unix ts for midnight of the simulated day")
    args = ap.parse_args()

    recs = build(args.scenario, args.seed, args.day_start)
    with open(args.out, "w") as fh:
        for r in recs:
            fh.write(json.dumps(r) + "\n")
    print(f"{args.scenario}: wrote {len(recs)} records covering 24h to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
