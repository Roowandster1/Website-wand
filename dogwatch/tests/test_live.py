"""The live loop and the real MQTT path.

Everything else is tested through replay. This covers the code that actually
runs unattended for months, plus the two robustness bugs that made a restart
lose the stillness clock and let the database grow without bound.
"""

import datetime as dt
import json
import os
import shutil
import socket
import subprocess
import time

import pytest

from service.app import Dogwatch
from service.ledger import Ledger
from service.models import ActivityState
from service.notify import LogNotifier
from service.source import Msg

from .helpers import make_app, make_config, still_event


# --- the loop, no broker ----------------------------------------------------

def test_run_live_ticks_on_the_configured_interval():
    cfg, app, _ = make_app(**{"tracking.poll_interval_seconds": 30})
    t = [1000.0]
    msgs = [Msg(1000.0 + i, "frigate/events", still_event(1000.0 + i)) for i in range(120)]

    def clock():
        t[0] += 1.0
        return t[0]

    ticks = []
    orig = app.tick
    app.tick = lambda now: (ticks.append(now), orig(now))[1]
    app.run_live(source=iter(msgs), clock=clock, start_services=False)

    # ~120 simulated seconds at a 30s interval
    assert 3 <= len(ticks) <= 6, f"unexpected tick count {len(ticks)}"


def test_a_malformed_message_does_not_end_the_run():
    """One bad payload must not take the monitor offline for the rest of the day."""
    cfg, app, _ = make_app()
    msgs = [
        Msg(1000.0, "frigate/events", "{not json"),
        Msg(1001.0, "frigate/events", still_event(1001.0)),
        Msg(1002.0, "frigate/events", json.dumps({"type": "update"})),   # no box
        Msg(1003.0, "frigate/events", still_event(1003.0)),
    ]
    app.run_live(source=iter(msgs), clock=lambda: 1100.0, start_services=False)
    rows = list(app.ledger.db.execute("SELECT COUNT(*) c FROM events"))
    assert rows[0]["c"] == 2, "the two good events must still be recorded"


def test_tick_marker_messages_are_not_treated_as_data():
    cfg, app, _ = make_app()
    app.run_live(source=iter([Msg(1000.0, "__tick__", "")]),
                 clock=lambda: 1000.0, start_services=False)
    assert list(app.ledger.db.execute("SELECT COUNT(*) c FROM events"))[0]["c"] == 0


# --- restart: the stillness anchor -------------------------------------------

def build(db_path, **over):
    cfg = make_config(**over)
    led = Ledger(db_path)
    return cfg, Dogwatch(cfg, led, LogNotifier())


def test_a_brief_restart_resumes_the_stillness_clock(tmp_path):
    """The bug this fixes: every restart used to reset the timer to zero, so on
    a box that restarts at all often the 4-hour alert would never fire."""
    db = str(tmp_path / "d.db")
    cfg, app = build(db)
    t = 1000.0
    for _ in range(40):
        app.handle("frigate/events", still_event(t), t)
        app.tick(t)
        t += 60.0
    before = app.tracker.dogs["cage_dog"].still_for(t)
    assert before > 2000
    app.close()

    # restart 20 seconds later — well inside live_window
    cfg2, app2 = build(db)
    app2.tick(t + 20)
    after = app2.tracker.dogs["cage_dog"].still_for(t + 20)
    assert after >= before, f"timer lost across restart: {before} -> {after}"


def test_a_long_outage_re_anchors_instead_of_claiming_unseen_stillness(tmp_path):
    """If we were down for an hour we cannot vouch for that hour."""
    db = str(tmp_path / "d.db")
    cfg, app = build(db)
    t = 1000.0
    for _ in range(40):
        app.handle("frigate/events", still_event(t), t)
        app.tick(t)
        t += 60.0
    app.close()

    cfg2, app2 = build(db)
    app2.tick(t + 3600)                      # an hour later
    assert app2.tracker.dogs["cage_dog"].still_for(t + 3600) == 0.0


def test_restore_is_a_no_op_on_a_fresh_database(tmp_path):
    cfg, app = build(str(tmp_path / "fresh.db"))
    assert app.restore_state(1000.0) is False


def test_corrupt_state_snapshot_does_not_crash_startup(tmp_path):
    db = str(tmp_path / "d.db")
    cfg, app = build(db)
    app.ledger.set_meta(app.STATE_KEY, "{{{ not json")
    assert app.restore_state(1000.0) is False


# --- retention ---------------------------------------------------------------

def test_retention_runs_once_a_day_and_removes_old_rows(tmp_path):
    """`raw_event_retention_days` was configured and did nothing; the events
    table grew forever."""
    db = str(tmp_path / "d.db")
    cfg, app = build(db, **{"storage.raw_event_retention_days": 30})
    now = dt.datetime(2026, 5, 10, 12, 0).timestamp()

    old = now - 45 * 86400
    app.handle("frigate/events", still_event(old), old)
    app.handle("frigate/events", still_event(now - 60), now - 60)
    app.ledger.commit()
    assert list(app.ledger.db.execute("SELECT COUNT(*) c FROM events"))[0]["c"] == 2

    assert app._maybe_prune(now) is True
    assert list(app.ledger.db.execute("SELECT COUNT(*) c FROM events"))[0]["c"] == 1
    # ...and not again the same day
    assert app._maybe_prune(now + 60) is False
    assert app._maybe_prune(now + 86400) is True


# --- the real MQTT path ------------------------------------------------------

def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


@pytest.mark.skipif(not shutil.which("mosquitto"), reason="no mosquitto binary")
def test_end_to_end_against_a_real_broker(tmp_path):
    """Frigate -> MQTT -> dogwatch -> SQLite, over a real broker.

    Everything else stubs the transport. This is the only test that proves the
    actual wire path works.
    """
    port = free_port()
    conf = tmp_path / "m.conf"
    conf.write_text(f"listener {port} 127.0.0.1\nallow_anonymous true\n")
    proc = subprocess.Popen(["mosquitto", "-c", str(conf)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):                       # wait for the broker
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.1)
        else:
            pytest.skip("broker did not start")

        import paho.mqtt.client as mqtt

        from service.source import mqtt_stream

        cfg = make_config(**{"mqtt.port": port, "mqtt.host": "127.0.0.1"})
        app = Dogwatch(cfg, Ledger(":memory:"), LogNotifier())

        pub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="pub")
        pub.connect("127.0.0.1", port, 30)
        pub.loop_start()

        stream = mqtt_stream("127.0.0.1", port, "frigate/#", "dogwatch-test")
        # mqtt_stream is a generator: nothing connects or subscribes until it is
        # first advanced. Prime it (the idle branch yields a __tick__ within a
        # second) before publishing, or the messages arrive with no subscriber.
        first = next(stream)
        assert first.topic in ("__tick__", "frigate/onConnect")
        time.sleep(0.4)

        now = time.time()
        for i in range(3):
            pub.publish("frigate/events", still_event(now + i), qos=1)
        pub.publish("frigate/dogs_main/audio/bark", "ON", qos=1)

        seen, deadline = 0, time.time() + 8
        for msg in stream:
            if msg.topic != "__tick__":
                app.handle(msg.topic, msg.payload, time.time())
                seen += 1
            if seen >= 4 or time.time() > deadline:
                break
        stream.close()
        pub.loop_stop()
        pub.disconnect()

        app.ledger.commit()
        n = list(app.ledger.db.execute("SELECT COUNT(*) c FROM events"))[0]["c"]
        assert n == 3, f"expected 3 dog events over the wire, got {n}"
        assert app.tracker.barks_within(time.time(), 300) == 1
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def test_our_own_onconnect_ping_does_not_count_as_frigate_being_alive():
    """The dead-man's switch must not be fed by the watchdog's own heartbeat.

    mqtt_stream publishes frigate/onConnect, and our own frigate/# subscription
    delivers it straight back — so without this, a dead Frigate could look alive.
    """
    cfg, app, _ = make_app()
    app.handle("frigate/onConnect", "", 1000.0)
    assert app.rules.last_frigate_seen is None

    app.handle("frigate/events", still_event(1000.0), 1000.0)
    assert app.rules.last_frigate_seen == 1000.0
