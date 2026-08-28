"""Integration behaviour: mute, zone visits, the daily summary scheduler."""

import datetime as dt

from service.summarise import Summary

from .helpers import make_app, still_event

WATER_BOX = [830, 210, 950, 290]     # bottom-centre lands in water_food


def fake_summariser(calls):
    def fn(cfg, ledger, start, end):
        calls.append((start, end))
        return Summary(text="all fine")
    return fn


# --- mute -------------------------------------------------------------------

def test_mute_silences_delivery_but_still_records():
    """`quiet` must silence the phone, not the ledger — the morning summary
    still needs to know what happened while it was muted."""
    cfg, app, notifier = make_app(**{
        "dogs.0.stillness.after_minutes": 60,
        "alerts.rules.stillness.confirm_for_seconds": 0,
        "alerts.quiet_hours.enabled": False,
    })
    t = dt.datetime(2026, 3, 10, 12, 0).timestamp()
    app.tracker.mute_for(6 * 3600, t)

    for _ in range(200):
        app.handle("frigate/events", still_event(t), t)
        app.tick(t)
        t += 60.0

    rows = [r for r in app.ledger.recent_alerts(0) if r["rule"] == "stillness"]
    assert rows, "the incident must still be recorded"
    assert all(r["action"].endswith("_muted") for r in rows)
    assert notifier.sent == []


def test_alerts_resume_after_the_mute_expires():
    cfg, app, notifier = make_app(**{
        "dogs.0.stillness.after_minutes": 60,
        "alerts.rules.stillness.confirm_for_seconds": 0,
        "alerts.quiet_hours.enabled": False,
    })
    t = dt.datetime(2026, 3, 10, 12, 0).timestamp()
    app.tracker.mute_for(60, t)          # one minute only

    for _ in range(300):
        app.handle("frigate/events", still_event(t), t)
        app.tick(t)
        t += 60.0

    assert notifier.sent, "alerts must resume once the mute expires"


# --- zone visits ------------------------------------------------------------

def test_a_real_zone_visit_is_recorded_with_its_duration():
    cfg, app, _ = make_app()
    t = 1000.0
    for _ in range(6):                      # ~3 min at the bowl
        app.handle("frigate/events",
                   still_event(t, zones=("water_food",), box=WATER_BOX), t)
        app.tick(t)
        t += 30.0
    # leaves the zone
    app.handle("frigate/events", still_event(t, zones=("cage",)), t)
    app.tick(t)

    visits = app.ledger.visits_between(0, t + 1, zone="water_food")
    assert len(visits) == 1
    assert visits[0]["duration"] >= 120


def test_momentary_zone_clipping_is_not_a_visit():
    """A bounding box brushing a zone edge for a few seconds is jitter, not a
    trip to the water bowl."""
    cfg, app, _ = make_app(**{"care.min_visit_seconds": 20})
    t = 1000.0
    app.handle("frigate/events",
               still_event(t, zones=("water_food",), box=WATER_BOX), t)
    app.tick(t)
    t += 5.0
    app.handle("frigate/events", still_event(t, zones=("cage",)), t)
    app.tick(t)

    assert app.ledger.visits_between(0, t + 1, zone="water_food") == []


def test_untracked_zones_are_not_recorded_as_visits():
    cfg, app, _ = make_app()
    t = 1000.0
    for _ in range(6):
        app.handle("frigate/events", still_event(t, zones=("cage",)), t)
        app.tick(t)
        t += 30.0
    app.handle("frigate/events", still_event(t, zones=()), t)
    app.tick(t)
    assert app.ledger.visits_between(0, t + 1, zone="cage") == []


# --- daily summary ----------------------------------------------------------

def test_daily_summary_fires_once_at_the_configured_time():
    calls = []
    cfg, app, notifier = make_app(**{"daily_summary.enabled": True,
                                     "daily_summary.at": "08:00"})
    app.summarise_fn = fake_summariser(calls)

    t = dt.datetime(2026, 3, 10, 7, 0).timestamp()
    for _ in range(240):                    # 07:00 -> 11:00
        app.tick(t)
        t += 60.0

    assert len(calls) == 1, f"expected one summary, got {len(calls)}"
    assert any("Morning update" in m for m in notifier.sent)


def test_daily_summary_does_not_fire_before_its_time():
    calls = []
    cfg, app, _ = make_app(**{"daily_summary.enabled": True,
                              "daily_summary.at": "08:00"})
    app.summarise_fn = fake_summariser(calls)
    t = dt.datetime(2026, 3, 10, 6, 0).timestamp()
    for _ in range(60):
        app.tick(t)
        t += 60.0
    assert calls == []


def test_a_restart_after_the_summary_does_not_send_a_second():
    """The last-sent date lives in the ledger. Without that, a container
    restart at 08:05 sends the morning summary twice."""
    from service.app import Dogwatch

    calls = []
    cfg, app, notifier = make_app(**{"daily_summary.enabled": True,
                                     "daily_summary.at": "08:00"})
    app.summarise_fn = fake_summariser(calls)

    t = dt.datetime(2026, 3, 10, 8, 1).timestamp()
    app.tick(t)
    assert len(calls) == 1

    # restart: new Dogwatch, same ledger
    app2 = Dogwatch(cfg, app.ledger, notifier)
    app2.summarise_fn = fake_summariser(calls)
    app2.tick(t + 240)
    assert len(calls) == 1, "a restart must not resend the day's summary"


def test_a_late_start_does_not_send_a_morning_summary_in_the_evening():
    """If the box reboots at 20:00 and today's summary never went out, sending
    a 'morning update' then is nonsense."""
    calls = []
    cfg, app, notifier = make_app(**{"daily_summary.enabled": True,
                                     "daily_summary.at": "08:00",
                                     "daily_summary.grace_minutes": 120})
    app.summarise_fn = fake_summariser(calls)

    app.tick(dt.datetime(2026, 3, 10, 20, 0).timestamp())
    assert calls == []
    # ...and the day is marked done, so it does not fire on the next tick either
    app.tick(dt.datetime(2026, 3, 10, 20, 1).timestamp())
    assert calls == []


def test_the_next_day_gets_its_own_summary():
    calls = []
    cfg, app, _ = make_app(**{"daily_summary.enabled": True,
                              "daily_summary.at": "08:00"})
    app.summarise_fn = fake_summariser(calls)
    app.tick(dt.datetime(2026, 3, 10, 8, 1).timestamp())
    app.tick(dt.datetime(2026, 3, 11, 8, 1).timestamp())
    assert len(calls) == 2


def test_a_failing_summariser_reports_rather_than_crashing_the_monitor():
    cfg, app, notifier = make_app(**{"daily_summary.enabled": True,
                                     "daily_summary.at": "08:00"})

    def boom(*a, **k):
        raise RuntimeError("API down")

    app.summarise_fn = boom
    app.tick(dt.datetime(2026, 3, 10, 8, 1).timestamp())
    assert any("Could not build the summary" in m for m in notifier.sent)
