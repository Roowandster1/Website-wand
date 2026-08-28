"""Care logging: the record the camera cannot produce.

The load-bearing property is that camera-derived presence and hand-logged care
are never merged or confused — a paralysed dog's bladder schedule is not
something a bounding box can attest to.
"""

from service.commands import CARE_KINDS, Command, handle, parse_command
from service.ledger import Ledger
from service.summarise import build_digest
from service.tracking import DogTracker

from .helpers import make_config


def app_bits(**over):
    cfg = make_config(**over)
    return cfg, DogTracker(cfg), Ledger(":memory:")


def test_care_words_parse_including_synonyms():
    assert parse_command("pee").kind == "pee"
    assert parse_command("wee").kind == "pee"
    assert parse_command("expressed").kind == "pee"
    assert parse_command("poo").kind == "poo"
    assert parse_command("fed").kind == "fed"
    assert parse_command("meds").kind == "meds"
    assert parse_command("/water").kind == "water"


def test_a_note_after_the_word_is_captured():
    c = parse_command("pee slightly cloudy today")
    assert c.kind == "pee"
    assert c.note == "slightly cloudy today"


def test_logging_care_writes_a_row_against_the_paralysed_dog():
    cfg, tk, led = app_bits()
    handle(Command("care", kind="pee", note="fine"), cfg, tk, led, 1000.0)
    rows = led.care_between(0, 2000)
    assert len(rows) == 1
    assert rows[0]["kind"] == "pee"
    assert rows[0]["dog"] == "cage_dog"
    assert rows[0]["source"] == "manual"
    assert rows[0]["note"] == "fine"


def test_the_reply_reports_the_gap_since_the_last_one():
    """When you log a bladder expression, 'last one 5.0h ago' is the single most
    useful thing the reply can tell you."""
    cfg, tk, led = app_bits()
    handle(Command("care", kind="pee"), cfg, tk, led, 1000.0)
    reply = handle(Command("care", kind="pee"), cfg, tk, led, 1000.0 + 5 * 3600)
    assert "5.0h ago" in reply


def test_the_first_entry_reports_no_gap():
    cfg, tk, led = app_bits()
    reply = handle(Command("care", kind="pee"), cfg, tk, led, 1000.0)
    assert "ago" not in reply
    assert "Logged bladder expression" in reply


def test_digest_keeps_owner_logged_and_camera_seen_strictly_apart():
    cfg, tk, led = app_bits()
    led.write_care(1000.0, "pee", dog="cage_dog", note="", source="manual")
    led.write_visit("roam_dog", "water_food", 1200.0, 1320.0, "inferred")
    led.commit()

    d = build_digest(led, cfg, 0, 5000)
    assert "LOGGED BY THE OWNER" in d
    assert "SEEN BY THE CAMERA" in d
    # The camera section must disclaim what it cannot know.
    assert "never that it drank" in d
    owner_block = d.split("LOGGED BY THE OWNER")[1].split("SEEN BY THE CAMERA")[0]
    assert "water_food" not in owner_block


def test_an_empty_care_log_is_explicitly_not_evidence_of_neglect():
    cfg, tk, led = app_bits()
    led.write_visit("cage_dog", "water_food", 1200.0, 1320.0, "certain")
    led.commit()
    d = build_digest(led, cfg, 0, 5000)
    assert "nothing recorded" in d
    assert "Do not infer neglect" in d


def test_silenced_alerts_are_flagged_as_unseen_in_the_digest():
    """The morning summary exists to surface what quiet hours suppressed. If the
    digest does not say the owner never saw it, the model cannot know to lead
    with it."""
    cfg, tk, led = app_bits()
    led.write_alert(1000.0, "stillness", "cage_dog", "fired_quiet", True, "7h still")
    led.write_alert(2000.0, "absence", "cage_dog", "fired_muted", True, "gone 30m")
    led.commit()
    d = build_digest(led, cfg, 0, 5000)
    assert d.count("has NOT seen this yet") == 2


def test_every_care_synonym_maps_to_a_known_kind():
    for word, kind in CARE_KINDS.items():
        assert parse_command(word).kind == kind, word
