"""The setup doctor.

Its entire job is to be right when you are stood at the machine wondering why
nothing works, so every FAIL must carry a fix and the exit code must be usable
from a script.
"""

from service import doctor
from service.doctor import FAIL, OK, WARN, Check, check_config, render, run_all

from .helpers import make_config


def test_every_failing_or_warning_check_offers_a_fix():
    """A check that says something is broken without saying what to do is
    just anxiety."""
    cfg = make_config()
    groups, _, _ = run_all(cfg)
    for title, checks in groups:
        for c in checks:
            if c.status in (FAIL, WARN):
                assert c.fix, f"{title}/{c.name} reports a problem with no fix"


def test_missing_services_are_blocking_not_advisory():
    cfg = make_config(**{"mqtt.host": "127.0.0.1", "mqtt.port": 1})
    checks = doctor.check_services(cfg)
    assert any(c.status == FAIL and "MQTT" in c.name for c in checks)


def test_unnamed_dogs_are_flagged():
    cfg = make_config()
    for d in cfg.dogs:
        d.name = d.id
    names = [c for c in check_config(cfg) if c.name == "dog names"]
    assert names and names[0].status == WARN


def test_named_dogs_pass():
    cfg = make_config()          # helpers name them Bramble / Pip
    names = [c for c in check_config(cfg) if c.name == "dog names"]
    assert names and names[0].status == OK


def test_shadow_mode_on_is_correct_and_off_is_a_warning():
    on = [c for c in check_config(make_config()) if c.name == "shadow mode"]
    assert on and on[0].status == OK

    cfg = make_config(**{"alerts.shadow_mode": False})
    off = [c for c in check_config(cfg) if c.name == "shadow mode"]
    assert off and off[0].status == WARN
    assert "reviewing a day" in off[0].fix


def test_disabled_quiet_hours_warns_about_the_4am_problem():
    cfg = make_config(**{"alerts.quiet_hours.enabled": False})
    q = [c for c in check_config(cfg) if c.name == "quiet hours"]
    assert q and q[0].status == WARN
    assert "4am" in q[0].fix


def test_render_produces_a_line_per_check():
    groups = [("Bits", [Check(OK, "a"), Check(FAIL, "b", "broke", "do this")])]
    out = render(groups)
    assert "Bits" in out and "a" in out and "broke" in out and "do this" in out


def test_run_all_counts_failures_and_warnings():
    cfg = make_config(**{"mqtt.host": "127.0.0.1", "mqtt.port": 1})
    groups, fails, warns = run_all(cfg)
    assert fails >= 1
    assert isinstance(warns, int)
    assert [t for t, _ in groups] == ["Tools", "Camera", "Services",
                                      "Credentials", "Configuration"]
