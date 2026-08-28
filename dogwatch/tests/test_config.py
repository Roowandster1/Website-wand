"""Config validation.

A monitoring system that silently misreads its own config is worse than one
that refuses to start, so every one of these must raise at load time.
"""

import copy
import tempfile

import pytest
import yaml

from service.config import ConfigError, load


def write(raw) -> str:
    with tempfile.NamedTemporaryFile("w", suffix=".yml", delete=False) as fh:
        yaml.safe_dump(raw, fh)
        return fh.name


def base():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    return copy.deepcopy(yaml.safe_load((root / "dogwatch.yml.example").read_text()))


def test_the_shipped_example_is_valid():
    load(write(base()), env={})


def test_rejects_two_dogs_anchored_the_same_way():
    raw = base()
    raw["dogs"][1]["identity"]["rule"] = "in_zone"
    with pytest.raises(ConfigError, match="exactly one"):
        load(write(raw), env={})


def test_rejects_an_unknown_identity_rule():
    raw = base()
    raw["dogs"][0]["identity"]["rule"] = "vibes"
    with pytest.raises(ConfigError, match="in_zone"):
        load(write(raw), env={})


def test_rejects_an_anchor_zone_that_is_not_defined():
    raw = base()
    raw["dogs"][0]["identity"]["zone"] = "nowhere"
    with pytest.raises(ConfigError, match="identity anchor zone"):
        load(write(raw), env={})


def test_rejects_an_exempt_zone_that_does_not_exist():
    """A typo here would silently mean the roaming dog alerts while asleep in
    its own bed — the exemption would just never match."""
    raw = base()
    raw["dogs"][1]["stillness"]["exempt_zones"] = ["bed_room"]   # typo
    with pytest.raises(ConfigError, match="never apply"):
        load(write(raw), env={})


def test_rejects_a_movement_threshold_given_in_pixels_by_mistake():
    """min_movement is a fraction of the frame. Someone will type 20 meaning
    pixels; that would mean the dog never counts as moving, ever."""
    raw = base()
    raw["dogs"][0]["stillness"]["min_movement"] = 20
    with pytest.raises(ConfigError, match="fractions of frame width"):
        load(write(raw), env={})


def test_rejects_reap_shorter_than_the_liveness_window():
    raw = base()
    raw["tracking"]["reap_after_seconds"] = 60
    raw["tracking"]["live_window_seconds"] = 180
    with pytest.raises(ConfigError, match="greater than live_window"):
        load(write(raw), env={})


def test_rejects_a_bad_quiet_hours_time():
    raw = base()
    raw["alerts"]["quiet_hours"]["start"] = "half past ten"
    with pytest.raises(ConfigError, match="HH:MM"):
        load(write(raw), env={})


def test_rejects_quiet_hours_naming_an_unknown_rule():
    raw = base()
    raw["alerts"]["quiet_hours"]["suppress"] = ["stilness"]       # typo
    with pytest.raises(ConfigError, match="not a configured rule"):
        load(write(raw), env={})


def test_rejects_an_invalid_effort_level():
    raw = base()
    raw["summariser"]["effort"] = "medium-rare"
    with pytest.raises(ConfigError, match="effort"):
        load(write(raw), env={})


def test_secrets_come_from_the_environment():
    cfg = load(write(base()),
               env={"TELEGRAM_BOT_TOKEN": "env-token", "ANTHROPIC_API_KEY": "env-key"})
    assert cfg.telegram_token == "env-token"
    assert cfg.anthropic_key == "env-key"


def test_a_token_written_into_the_yaml_is_ignored():
    """The YAML is committed to git. If someone pastes a token in there it must
    not be picked up, or the next commit leaks a live bot."""
    raw = base()
    raw["telegram"]["token"] = "leaked-from-yaml"
    raw["summariser"]["api_key"] = "also-leaked"
    cfg = load(write(raw), env={})
    assert cfg.telegram_token is None
    assert cfg.anthropic_key is None


def test_missing_secrets_are_none_not_a_crash():
    cfg = load(write(base()), env={})
    assert cfg.telegram_token is None
    assert cfg.anthropic_key is None
