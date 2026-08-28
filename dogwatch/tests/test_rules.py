"""The incident FSM — the part that decides whether you get spammed."""

from service.config import RuleCfg
from service.models import Incident
from service.rules import RuleEngine, step
from service.tracking import DogTracker

from .helpers import det, make_config

CFG = RuleCfg(enabled=True, confirm_for_seconds=120, cooldown_seconds=3600,
              notify_on_resolve=True)


def run(inc, seq, cfg=CFG):
    """seq is [(now, condition_active), ...]; returns the alerts emitted."""
    out = []
    for now, active in seq:
        out += step(inc, active, now, cfg, detail="d")
    return out


def test_fires_once_after_confirm_window():
    inc = Incident("stillness", "cage_dog")
    got = run(inc, [(0, True), (60, True), (119, True), (121, True), (200, True)])
    assert [e.action for e in got] == ["fired"]


def test_does_not_fire_before_confirm_window():
    inc = Incident("stillness", "cage_dog")
    got = run(inc, [(0, True), (60, True), (119, True)])
    assert got == []


def test_flap_shorter_than_confirm_window_is_silent():
    """The whole point of confirm_for: a condition that blinks true for 30s
    must not generate a notification, or you stop reading them."""
    inc = Incident("stillness", "cage_dog")
    got = run(inc, [(0, True), (30, True), (60, False), (90, True), (110, False)])
    assert got == []
    assert inc.state == "clear"


def test_resolved_is_emitted_after_a_real_alert():
    inc = Incident("stillness", "cage_dog")
    got = run(inc, [(0, True), (200, True), (300, False)])
    assert [e.action for e in got] == ["fired", "resolved"]


def test_stays_quiet_while_condition_persists():
    inc = Incident("stillness", "cage_dog")
    seq = [(t, True) for t in range(0, 4000, 60)]
    got = run(inc, seq)
    assert [e.action for e in got] == ["fired"], "one incident, one alert"


def test_cooldown_suppresses_a_rapid_second_occurrence():
    inc = Incident("stillness", "cage_dog")
    got = run(inc, [
        (0, True), (200, True),          # fires
        (300, False),                    # resolves
        (400, True), (600, True),        # true again, well inside cooldown
    ])
    assert [e.action for e in got] == ["fired", "resolved"]


def test_no_resolved_for_an_occurrence_that_was_suppressed():
    """You must never get an all-clear for an alarm you never received."""
    inc = Incident("stillness", "cage_dog")
    got = run(inc, [
        (0, True), (200, True), (300, False),      # fired + resolved
        (400, True), (600, True),                  # suppressed by cooldown
        (700, False),                              # clears again
    ])
    assert [e.action for e in got] == ["fired", "resolved"]


def test_fires_again_after_cooldown_expires():
    inc = Incident("stillness", "cage_dog")
    got = run(inc, [
        (0, True), (200, True), (300, False),
        (5000, True), (5200, True),
    ])
    assert [e.action for e in got] == ["fired", "resolved", "fired"]


# --- integration with real dog state ---------------------------------------

def build(**over):
    cfg = make_config(**over)
    return cfg, DogTracker(cfg), RuleEngine(cfg)


def test_stillness_alert_fires_for_the_crated_dog():
    cfg, tk, re_ = build(**{"dogs.0.stillness.after_minutes": 60,
                            "alerts.rules.stillness.confirm_for_seconds": 0})
    t = 1000.0
    tk.on_detection(det(t, "a", zones=("cage",), cx=0.2, cy=0.7))
    tk.tick(t); re_.evaluate(tk, t)

    events = []
    while t < 1000.0 + 4 * 3600:
        t += 60.0
        tk.on_detection(det(t, "a", zones=("cage",), cx=0.2, cy=0.7))
        tk.tick(t)
        events += re_.evaluate(tk, t)

    fired = [e for e in events if e.action == "fired" and e.rule == "stillness"]
    assert len(fired) == 1, f"expected exactly one alert, got {len(fired)}"
    assert fired[0].subject == "cage_dog"


def test_roaming_dog_asleep_in_its_bed_never_alerts():
    cfg, tk, re_ = build(**{"dogs.1.stillness.after_minutes": 60,
                            "alerts.rules.stillness.confirm_for_seconds": 0})
    t = 1000.0
    events = []
    while t < 1000.0 + 6 * 3600:
        tk.on_detection(det(t, "b", zones=("bed_roam",), cx=0.7, cy=0.8))
        tk.tick(t)
        events += re_.evaluate(tk, t)
        t += 60.0
    assert [e for e in events if e.subject == "roam_dog"] == []


def test_bark_burst_never_names_a_dog():
    """Frigate cannot attribute a bark to an animal. The alert must not pretend."""
    cfg, tk, re_ = build(**{"alerts.rules.bark_burst.confirm_for_seconds": 0,
                            "alerts.rules.bark_burst.count": 3,
                            "alerts.rules.bark_burst.within_minutes": 5})
    t = 1000.0
    for i in range(4):
        tk.on_bark(t + i)
    events = re_.evaluate(tk, t + 10)
    fired = [e for e in events if e.rule == "bark_burst"]
    assert len(fired) == 1
    assert fired[0].subject == "room"
    assert "cage_dog" not in fired[0].detail and "roam_dog" not in fired[0].detail


def test_frigate_silence_is_detected():
    cfg, tk, re_ = build(**{"alerts.rules.frigate_silent.confirm_for_seconds": 0,
                            "alerts.rules.frigate_silent.after_minutes": 10})
    re_.note_frigate_alive(1000.0)
    assert re_.evaluate(tk, 1200.0) == []
    events = re_.evaluate(tk, 1000.0 + 11 * 60)
    fired = [e for e in events if e.rule == "frigate_silent"]
    assert len(fired) == 1
    assert fired[0].subject == "system"


# --- quiet hours ------------------------------------------------------------

def test_quiet_hours_wraps_past_midnight():
    from service.config import QuietHours
    import datetime as dt

    q = QuietHours(enabled=True, start="22:30", end="07:00", suppress=("stillness",))

    def at(h, m=0):
        return dt.datetime(2026, 1, 15, h, m).timestamp()

    assert q.active_at(at(23, 0)) is True      # before midnight
    assert q.active_at(at(3, 0)) is True       # after midnight
    assert q.active_at(at(6, 59)) is True
    assert q.active_at(at(7, 0)) is False      # window is half-open
    assert q.active_at(at(12, 0)) is False
    assert q.active_at(at(22, 29)) is False
    assert q.active_at(at(22, 30)) is True


def test_quiet_hours_daytime_window_does_not_wrap():
    from service.config import QuietHours
    import datetime as dt

    q = QuietHours(enabled=True, start="09:00", end="17:00", suppress=("stillness",))
    assert q.active_at(dt.datetime(2026, 1, 15, 12).timestamp()) is True
    assert q.active_at(dt.datetime(2026, 1, 15, 3).timestamp()) is False


def test_quiet_hours_disabled_never_suppresses():
    from service.config import QuietHours
    import datetime as dt
    q = QuietHours(enabled=False, start="00:00", end="23:59", suppress=("stillness",))
    assert q.active_at(dt.datetime(2026, 1, 15, 12).timestamp()) is False


def test_quiet_hours_only_suppress_listed_rules():
    from service.config import QuietHours
    import datetime as dt
    night = dt.datetime(2026, 1, 15, 3).timestamp()
    q = QuietHours(enabled=True, start="22:30", end="07:00",
                   suppress=("stillness", "bark_burst"))
    assert q.suppresses("stillness", night) is True
    # Absence of the crated dog must still wake you.
    assert q.suppresses("absence", night) is False
    assert q.suppresses("frigate_silent", night) is False


def test_suppressed_alert_is_recorded_but_not_sent():
    """Quiet hours must silence the phone, not the ledger — the morning summary
    still needs to know he did not shift all night."""
    from service.ledger import Ledger
    from service.app import Dogwatch
    from service.notify import LogNotifier
    import datetime as dt

    cfg = make_config(**{
        "dogs.0.stillness.after_minutes": 60,
        "alerts.rules.stillness.confirm_for_seconds": 0,
        "alerts.quiet_hours.enabled": True,
        "alerts.quiet_hours.start": "22:30",
        "alerts.quiet_hours.end": "07:00",
    })
    notifier = LogNotifier()
    app = Dogwatch(cfg, Ledger(":memory:"), notifier)

    t = dt.datetime(2026, 1, 15, 1, 0).timestamp()      # 1am, inside quiet hours
    for _ in range(200):
        app.handle("frigate/events", _still_payload(t), t)
        app.tick(t)
        t += 60.0

    rows = app.ledger.recent_alerts(0)
    fired = [r for r in rows if r["rule"] == "stillness"]
    assert fired, "the incident should still be recorded"
    assert all(r["action"].endswith("_quiet") for r in fired)
    assert notifier.sent == [], "nothing may be sent during quiet hours"


def _still_payload(ts):
    import json
    body = {"id": "a", "camera": "dogs_main", "label": "dog", "frame_time": ts,
            "score": 0.8, "box": [80, 380, 300, 520], "current_zones": ["cage"],
            "stationary": True, "motionless_count": 9000, "position_changes": 1}
    return json.dumps({"type": "update", "before": body, "after": body})


def test_no_all_clear_for_an_alert_silenced_by_quiet_hours():
    """You must not get 'Resolved' at 7am for something you never heard at 4am."""
    inc = Incident("stillness", "cage_dog")
    out = []
    out += step(inc, True, 0, CFG, "still", quiet=True)      # fires, silenced
    out += step(inc, True, 200, CFG, "still", quiet=True)
    out += step(inc, False, 400, CFG, "moved", quiet=False)  # resolves in daylight
    assert [e.action for e in out] == ["fired", "resolved"]
    assert all(e.suppressed for e in out), "neither may be sent"


def test_normal_alert_still_gets_a_sendable_resolve():
    inc = Incident("stillness", "cage_dog")
    out = []
    out += step(inc, True, 0, CFG, "still")
    out += step(inc, True, 200, CFG, "still")
    out += step(inc, False, 400, CFG, "moved", resolve_detail="has shifted position")
    assert [(e.action, e.suppressed) for e in out] == [
        ("fired", False), ("resolved", False),
    ]
    assert out[1].detail == "has shifted position"
