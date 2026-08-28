"""Ledger writes, run compression, and the stats the summariser reads."""

from service.ledger import Ledger, minute_of

from .helpers import det

M = 60


def mk(tmp_path=None):
    return Ledger(":memory:")


def fill(led, dog, start_minute, states, *, confidence="certain", barks=0):
    for i, s in enumerate(states):
        led.write_minute(
            start_minute + i * M, dog, state=s, confidence=confidence,
            movement=0.5 if s == "active" else 0.0,
            still_seconds=0.0 if s == "active" else i * 60,
            zones=("cage",) if dog == "cage_dog" else ("bed_roam",),
            detections=3, person_present=False, barks=barks,
        )
    led.commit()


def test_minute_of_floors_to_the_minute():
    assert minute_of(1000.0) == 960
    assert minute_of(1019.9) == 960
    assert minute_of(1020.0) == 1020


def test_write_and_read_back_an_event():
    led = mk()
    d = det(1000.0, "a", zones=("cage",), cx=0.2, cy=0.7)
    led.write_event(d, "cage_dog", "certain", raw={"type": "update"})
    led.commit()
    rows = list(led.db.execute("SELECT * FROM events"))
    assert len(rows) == 1
    assert rows[0]["dog"] == "cage_dog"
    assert rows[0]["zones"] == "cage"
    assert rows[0]["confidence"] == "certain"


def test_minute_upsert_accumulates_rather_than_duplicating():
    """A restart mid-minute must top the row up, not create a second one."""
    led = mk()
    for _ in range(3):
        led.write_minute(960, "cage_dog", state="resting", confidence="certain",
                         movement=0.1, still_seconds=120, zones=("cage",),
                         detections=2, person_present=False, barks=1)
    led.commit()
    rows = list(led.db.execute("SELECT * FROM activity_minutes"))
    assert len(rows) == 1
    assert rows[0]["detections"] == 6
    assert rows[0]["barks"] == 3
    assert abs(rows[0]["movement"] - 0.3) < 1e-9


def test_runs_compress_consecutive_same_state_minutes():
    led = mk()
    fill(led, "cage_dog", 0, ["resting"] * 120 + ["active"] * 3 + ["resting"] * 60)
    runs = led.runs(0, 200 * M, "cage_dog")
    assert [r.state for r in runs] == ["resting", "active", "resting"]
    assert [r.minutes for r in runs] == [120, 3, 60]
    # 183 rows became 3 lines — this is what makes /update affordable.
    assert len(runs) == 3


def test_a_missing_minute_breaks_a_run():
    """A gap is not continuity. Merging across it would claim we observed
    something we did not."""
    led = mk()
    fill(led, "cage_dog", 0, ["resting"] * 5)
    fill(led, "cage_dog", 10 * M, ["resting"] * 5)   # 5-minute hole
    runs = led.runs(0, 100 * M, "cage_dog")
    assert len(runs) == 2
    assert all(r.state == "resting" for r in runs)


def test_runs_are_separated_per_dog():
    led = mk()
    fill(led, "cage_dog", 0, ["resting"] * 10)
    fill(led, "roam_dog", 0, ["active"] * 10)
    runs = led.runs(0, 100 * M)
    assert {r.dog for r in runs} == {"cage_dog", "roam_dog"}
    assert len(runs) == 2


def test_run_confidence_is_the_weakest_in_the_run():
    """A run that was ambiguous for part of its life must not be reported as
    certain — that is precisely the overclaiming we are trying to avoid."""
    led = mk()
    fill(led, "cage_dog", 0, ["resting"] * 5, confidence="certain")
    fill(led, "cage_dog", 5 * M, ["resting"] * 5, confidence="ambiguous")
    fill(led, "cage_dog", 10 * M, ["resting"] * 5, confidence="certain")
    runs = led.runs(0, 100 * M, "cage_dog")
    assert len(runs) == 1                    # one continuous resting stretch
    assert runs[0].confidence == "ambiguous"


def test_summary_stats_totals():
    led = mk()
    fill(led, "cage_dog", 0, ["resting"] * 50 + ["active"] * 10, barks=1)
    stats = led.summary_stats(0, 100 * M)
    assert stats["cage_dog"]["minutes"] == 60
    assert stats["cage_dog"]["resting"] == 50
    assert stats["cage_dog"]["active"] == 10
    assert stats["cage_dog"]["barks"] == 60


def test_prune_drops_old_rows_only():
    import time
    led = mk()
    now = time.time()
    d_old = det(now - 40 * 86400, "old", zones=())
    d_new = det(now - 60, "new", zones=())
    led.write_event(d_old, None, None)
    led.write_event(d_new, None, None)
    led.write_minute(minute_of(now - 400 * 86400), "cage_dog", state="resting",
                     confidence="certain", movement=0, still_seconds=0,
                     zones=(), detections=0, person_present=False, barks=0)
    led.write_minute(minute_of(now - 60), "cage_dog", state="resting",
                     confidence="certain", movement=0, still_seconds=0,
                     zones=(), detections=0, person_present=False, barks=0)
    led.commit()
    ev, mi = led.prune(now, raw_days=30, minute_days=365)
    assert ev == 1 and mi == 1
    assert list(led.db.execute("SELECT COUNT(*) c FROM events"))[0]["c"] == 1
    assert list(led.db.execute("SELECT COUNT(*) c FROM activity_minutes"))[0]["c"] == 1


def test_alerts_record_shadow_mode():
    led = mk()
    led.write_alert(1000.0, "stillness", "cage_dog", "fired", True, "4h still")
    led.write_alert(2000.0, "stillness", "cage_dog", "resolved", True, "moved")
    led.commit()
    rows = led.recent_alerts(0)
    assert [r["action"] for r in rows] == ["fired", "resolved"]
    assert all(r["shadow"] == 1 for r in rows)
