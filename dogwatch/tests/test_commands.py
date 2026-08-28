from service.commands import Command, handle, parse_command, status_text
from service.ledger import Ledger
from service.tracking import DogTracker

from .helpers import det, make_config


def test_bare_word_update_works_not_just_slash_command():
    """The user said they want to type 'update' — not '/update'."""
    assert parse_command("update").name == "update"
    assert parse_command("/update").name == "update"
    assert parse_command("Update").name == "update"
    assert parse_command("how are they").name == "update"


def test_update_accepts_a_window():
    assert parse_command("update 12h").hours == 12
    assert parse_command("/update 3h").hours == 3
    assert parse_command("update").hours is None


def test_other_commands_parse():
    assert parse_command("/status").name == "status"
    assert parse_command("out").name == "out"
    assert parse_command("in").name == "in"
    assert parse_command("/help").name == "help"
    assert parse_command("quiet 2h").minutes == 120
    assert parse_command("quiet").minutes == 60
    assert parse_command("random chatter").name == "none"


def test_update_window_is_capped_at_the_configured_maximum():
    cfg = make_config(**{"summariser.max_window_hours": 24})
    tk, led = DogTracker(cfg), Ledger(":memory:")
    seen = {}

    def fake(c, l, start, end):
        seen["hours"] = (end - start) / 3600
        from service.summarise import Summary
        return Summary(text="ok")

    handle(Command("update", hours=999), cfg, tk, led, 100000.0, summarise_fn=fake)
    assert seen["hours"] == 24


def test_status_needs_no_model_call_and_hedges_on_confidence():
    cfg = make_config()
    tk = DogTracker(cfg)
    tk.on_detection(det(1000.0, "a", zones=("cage",), cx=0.2, cy=0.7))
    tk.tick(1000.0)
    out = status_text(cfg, tk, 1000.0)
    assert "Bramble" in out
    # One dog visible -> inferred, and the text must say so rather than assert.
    assert "inferred" in out
    assert "room-level" in out


def test_out_stops_identity_guessing():
    cfg = make_config()
    tk, led = DogTracker(cfg), Ledger(":memory:")
    msg = handle(Command("out"), cfg, tk, led, 0.0)
    assert tk.cage_dog_away is True
    assert "Bramble" in msg
    handle(Command("in"), cfg, tk, led, 0.0)
    assert tk.cage_dog_away is False


def test_update_without_an_api_key_says_so_rather_than_failing():
    cfg = make_config()
    tk, led = DogTracker(cfg), Ledger(":memory:")
    out = handle(Command("update"), cfg, tk, led, 0.0, summarise_fn=None)
    assert "not configured" in out
