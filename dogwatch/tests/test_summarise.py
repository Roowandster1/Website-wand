"""The digest and request the summariser builds.

These guard the honesty properties: no invented certainty, no dog-attributed
barks, no reporting a dog as absent when it was merely off camera.
"""

from service.ledger import Ledger
from service.summarise import SYSTEM_PROMPT, build_digest, build_request, summarise

from .helpers import make_config

M = 60


def seed(led, *, dog="cage_dog", start=0, states=("resting",) * 60,
         confidence="certain", zones=("cage",)):
    for i, st in enumerate(states):
        led.write_minute(start + i * M, dog, state=st, confidence=confidence,
                         movement=0.0, still_seconds=i * 60, zones=zones,
                         detections=2, person_present=False, barks=0)
    led.commit()


def test_digest_never_attributes_barks_to_a_dog():
    """Frigate cannot tell which dog barked. The digest must not imply it can."""
    cfg = make_config()
    led = Ledger(":memory:")
    seed(led)
    for i in range(60):
        led.write_minute(i * M, "__room__", state="room", confidence="n/a",
                         movement=0, still_seconds=0, zones=(), detections=0,
                         person_present=False, barks=2)
    led.commit()

    d = build_digest(led, cfg, 0, 60 * M)
    assert "120 barking events" in d
    assert "cannot tell which dog barked" in d
    # No bark count may appear inside either dog's section.
    cage_section = d.split("=== Bramble")[1].split("===")[0]
    assert "bark" not in cage_section.lower()


def test_digest_carries_confidence_on_every_timeline_row():
    cfg = make_config()
    led = Ledger(":memory:")
    seed(led, confidence="inferred")
    d = build_digest(led, cfg, 0, 60 * M)
    rows = [ln for ln in d.splitlines() if "resting (" in ln]
    assert rows
    assert all("confidence: inferred" in r for r in rows)


def test_digest_warns_when_identity_was_ambiguous():
    cfg = make_config()
    led = Ledger(":memory:")
    seed(led, confidence="ambiguous")
    d = build_digest(led, cfg, 0, 60 * M)
    assert "IDENTITY WARNING" in d
    assert "could not be sure which dog" in d


def test_digest_has_no_warning_when_identity_was_certain():
    cfg = make_config()
    led = Ledger(":memory:")
    seed(led, confidence="certain")
    d = build_digest(led, cfg, 0, 60 * M)
    assert "IDENTITY WARNING" not in d


def test_out_of_view_is_reported_as_not_detected_never_as_a_timeline_entry():
    """Off camera is not the same as absent, and must not read like it."""
    cfg = make_config()
    led = Ledger(":memory:")
    seed(led, dog="roam_dog", states=("out_of_view",) * 60,
         confidence="ambiguous", zones=())
    d = build_digest(led, cfg, 0, 60 * M)
    assert "not detected 60min" in d
    assert "out_of_view (" not in d, "off-camera stretches must not fill the timeline"


def test_system_prompt_states_the_honesty_rules():
    for phrase in [
        "CANNOT tell them apart visually",
        "room-level",
        "NOT a vet",
        "does NOT mean the dog was",
    ]:
        assert phrase in SYSTEM_PROMPT, f"missing guard: {phrase}"


def test_request_shape_matches_the_documented_api():
    cfg = make_config()
    led = Ledger(":memory:")
    seed(led)
    body = build_request(cfg, build_digest(led, cfg, 0, 60 * M),
                         [("image/jpeg", "AAAA"), ("image/jpeg", "BBBB")])

    assert body["model"] == "claude-opus-5"
    assert body["thinking"] == {"type": "adaptive"}
    assert body["output_config"]["effort"] == "low"
    # stable system prefix is cached so repeated /update calls stay cheap
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}

    content = body["messages"][0]["content"]
    assert [c["type"] for c in content] == ["image", "image", "text"]
    assert content[0]["source"]["type"] == "base64"
    assert content[0]["source"]["media_type"] == "image/jpeg"


def test_dry_run_makes_no_network_call(monkeypatch):
    cfg = make_config()
    led = Ledger(":memory:")
    seed(led)

    def boom(*a, **k):
        raise AssertionError("dry run must not touch the network")

    monkeypatch.setattr("service.summarise.fetch_snapshots", boom)
    out = summarise(cfg, led, 0, 60 * M, dry_run=True, with_images=False)
    assert out.dry_run is True
    assert "dry run" in out.text
    assert SYSTEM_PROMPT in out.text


def test_cost_estimate_is_in_the_expected_range():
    from service.summarise import Summary
    s = Summary(text="x", input_tokens=11_000, output_tokens=800)
    assert 0.03 < s.approx_cost_usd < 0.12
