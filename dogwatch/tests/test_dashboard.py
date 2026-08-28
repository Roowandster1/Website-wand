"""The dashboard payload and server.

The property that matters most here: the dashboard must distinguish an alert you
actually received from one that was silenced. That distinction is the whole
point of quiet hours, and a dashboard that blurs it would quietly undo it.
"""

import json
import re
import urllib.error
import urllib.request

from service.dashboard import PAGE, build_payload, start_dashboard
from service.ledger import Ledger

from .helpers import make_config

M = 60


def seeded(hours=6.0, now=100000.0):
    cfg = make_config(**{"dashboard.enabled": True, "dashboard.port": 0})
    led = Ledger(":memory:")
    start = now - hours * 3600
    for i in range(60):
        t = int((start + i * 60) // 60 * 60)
        led.write_minute(t, "cage_dog", state="resting", confidence="certain",
                         movement=0.0, still_seconds=i * 60, zones=("cage",),
                         detections=2, person_present=False, barks=0)
        led.write_minute(t, "roam_dog", state="active", confidence="inferred",
                         movement=0.4, still_seconds=0, zones=("bed_roam",),
                         detections=1, person_present=False, barks=0)
        led.write_minute(t, "__room__", state="room", confidence="n/a",
                         movement=0, still_seconds=0, zones=(), detections=0,
                         person_present=False, barks=1)
    led.write_care(start + 600, "pee", dog="cage_dog", note="ok", source="manual")
    led.write_visit("roam_dog", "water_food", start + 900, start + 1000, "inferred")
    led.commit()
    return cfg, led, now


def test_payload_has_every_section_the_page_renders():
    cfg, led, now = seeded()
    p = build_payload(cfg, led, 6.0, now=now)
    for key in ("dogs", "runs", "alerts", "barks", "care", "visits", "stats",
                "room_barks", "start", "end"):
        assert key in p, key
    assert p["room_barks"] == 60


def test_the_room_pseudo_dog_never_leaks_into_the_dogs_list():
    """`__room__` is a storage detail. Rendering it as a third dog would be
    absurd and would double-count barks."""
    cfg, led, now = seeded()
    p = build_payload(cfg, led, 6.0, now=now)
    assert [d["id"] for d in p["dogs"]] == ["cage_dog", "roam_dog"]
    assert all(r["dog"] != "__room__" for r in p["runs"])
    assert "__room__" not in p["stats"]


def test_silenced_alerts_are_marked_unseen():
    cfg, led, now = seeded()
    led.write_alert(now - 3600, "stillness", "cage_dog", "fired", True, "4h")
    led.write_alert(now - 3000, "stillness", "cage_dog", "fired_quiet", True, "4h")
    led.write_alert(now - 2400, "absence", "cage_dog", "fired_muted", True, "20m")
    led.commit()

    seen = {(a["rule"], a["action"]): a["seen"]
            for a in build_payload(cfg, led, 6.0, now=now)["alerts"]}
    assert seen[("stillness", "fired")] is True
    assert seen[("stillness", "fired_quiet")] is False
    assert seen[("absence", "fired_muted")] is False


def test_resolved_alerts_are_flagged_so_they_are_not_drawn_as_markers():
    cfg, led, now = seeded()
    led.write_alert(now - 1200, "stillness", "cage_dog", "resolved", True, "moved")
    led.commit()
    a = build_payload(cfg, led, 6.0, now=now)["alerts"][0]
    assert a["resolved"] is True


def test_care_and_camera_visits_stay_in_separate_lists():
    cfg, led, now = seeded()
    p = build_payload(cfg, led, 6.0, now=now)
    assert len(p["care"]) == 1 and p["care"][0]["source"] == "manual"
    assert len(p["visits"]) == 1 and p["visits"][0]["zone"] == "water_food"


def test_runs_match_the_ledger():
    cfg, led, now = seeded()
    p = build_payload(cfg, led, 6.0, now=now)
    expected = [r for r in led.runs(now - 6 * 3600, now) if r.dog != "__room__"]
    assert len(p["runs"]) == len(expected)


# --- the served page --------------------------------------------------------

def test_the_page_makes_no_external_requests():
    """It has to work on a LAN with no internet. One CDN reference would break
    that silently — the page would render, just without its chart library."""
    refs = re.findall(r"""(?:src|href)\s*=\s*["']([^"']+)""", PAGE)
    assert [u for u in refs if u.startswith(("http", "//"))] == []
    assert "cdn" not in PAGE.lower()


def test_the_page_offers_a_table_view():
    """The light-mode palette carries a sub-3:1 contrast warning, which the
    dataviz rules say obliges visible labels or a table view. Both are present."""
    assert "Table view" in PAGE
    assert "band-lbl" in PAGE


def test_server_serves_json_html_and_404s(tmp_path):
    cfg, led, now = seeded()
    srv = start_dashboard(cfg, led, now_fn=lambda: now)
    port = srv.server_address[1]
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/timeline.json?hours=6") as r:
            assert r.status == 200
            payload = json.loads(r.read())
        assert [d["id"] for d in payload["dogs"]] == ["cage_dog", "roam_dog"]

        with urllib.request.urlopen(f"http://127.0.0.1:{port}/") as r:
            body = r.read().decode()
        assert r.status == 200 and "<title>Dogwatch</title>" in body
        assert "__DEFAULT_HOURS__" not in body, "placeholder must be substituted"

        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/nope")
            raise AssertionError("expected 404")
        except urllib.error.HTTPError as e:
            assert e.code == 404
    finally:
        srv.shutdown()


def test_a_garbage_hours_parameter_does_not_raise():
    cfg, led, now = seeded()
    srv = start_dashboard(cfg, led, now_fn=lambda: now)
    port = srv.server_address[1]
    try:
        for q in ("hours=abc", "hours=", "hours=-5", "hours=999999"):
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/timeline.json?{q}") as r:
                assert r.status == 200
                p = json.loads(r.read())
                assert 1.0 <= p["hours"] <= 24 * 30
    finally:
        srv.shutdown()
