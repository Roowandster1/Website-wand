"""Identity resolution — the load-bearing idea in the whole system.

The dogs look alike. Everything downstream depends on this truth table being
right, and on it saying AMBIGUOUS rather than guessing when it cannot tell.
"""

from service.models import Confidence, Identity
from service.tracking import resolve_identity

from .helpers import track

CAGE = "cage"


def test_no_dogs_visible():
    assert resolve_identity([], CAGE) == {}


def test_single_dog_in_cage_is_the_crated_dog():
    t = track("a", zones=("cage",))
    got = resolve_identity([t], CAGE)
    assert got["a"].identity is Identity.CAGE_DOG
    # Only inferred: the roamer could also be in the crate, unseen.
    assert got["a"].confidence is Confidence.INFERRED


def test_single_dog_outside_cage_is_the_roamer():
    t = track("a", zones=("bed_roam",))
    got = resolve_identity([t], CAGE)
    assert got["a"].identity is Identity.ROAM_DOG
    assert got["a"].confidence is Confidence.INFERRED


def test_single_dog_in_no_zone_is_the_roamer():
    # Not in the crate is the whole test — an unzoned dog is on the floor.
    t = track("a", zones=())
    got = resolve_identity([t], CAGE)
    assert got["a"].identity is Identity.ROAM_DOG


def test_two_dogs_one_in_cage_is_the_only_certain_case():
    a = track("a", zones=("cage",))
    b = track("b", zones=("bed_roam",))
    got = resolve_identity([a, b], CAGE)
    assert got["a"].identity is Identity.CAGE_DOG
    assert got["b"].identity is Identity.ROAM_DOG
    assert got["a"].confidence is Confidence.CERTAIN
    assert got["b"].confidence is Confidence.CERTAIN


def test_two_dogs_both_in_cage_is_ambiguous():
    # The roamer climbing in with him. We genuinely cannot tell which is which.
    a = track("a", zones=("cage",))
    b = track("b", zones=("cage",))
    got = resolve_identity([a, b], CAGE)
    assert {v.identity for v in got.values()} == {Identity.UNKNOWN}
    assert {v.confidence for v in got.values()} == {Confidence.AMBIGUOUS}


def test_two_dogs_neither_in_cage_is_ambiguous():
    a = track("a", zones=("bed_roam",))
    b = track("b", zones=())
    got = resolve_identity([a, b], CAGE)
    assert {v.identity for v in got.values()} == {Identity.UNKNOWN}


def test_three_tracks_is_ambiguous_not_a_guess():
    # A false positive third detection must not silently become a dog.
    ts = [track(x, zones=("cage",) if x == "a" else ()) for x in ("a", "b", "c")]
    got = resolve_identity(ts, CAGE)
    assert len(got) == 3
    assert {v.identity for v in got.values()} == {Identity.UNKNOWN}


def test_cage_dog_away_single_dog_is_the_roamer_even_inside_the_cage():
    # You carried him out and told the bot. A dog in the crate is now the roamer
    # nosing around an empty crate — the geography rule must not override you.
    t = track("a", zones=("cage",))
    got = resolve_identity([t], CAGE, cage_dog_away=True)
    assert got["a"].identity is Identity.ROAM_DOG
    assert got["a"].confidence is Confidence.INFERRED


def test_cage_dog_away_two_dogs_is_ambiguous():
    # We were told one dog is out, yet we can see two. Something is wrong;
    # refuse to name them.
    a = track("a", zones=("cage",))
    b = track("b", zones=())
    got = resolve_identity([a, b], CAGE, cage_dog_away=True)
    assert {v.identity for v in got.values()} == {Identity.UNKNOWN}


def test_every_live_track_gets_an_assignment():
    # No track may be silently dropped — an unassigned track is a dog we stopped
    # accounting for.
    for zones_a, zones_b in [(("cage",), ()), ((), ()), (("cage",), ("cage",))]:
        a, b = track("a", zones=zones_a), track("b", zones=zones_b)
        got = resolve_identity([a, b], CAGE)
        assert set(got) == {"a", "b"}
