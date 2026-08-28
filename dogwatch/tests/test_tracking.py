"""DogState behaviour — the layer that survives Frigate's track churn."""

from service.models import ActivityState
from service.tracking import DogTracker

from .helpers import det, make_config


def test_stillness_timer_survives_track_id_churn():
    """The single most important behaviour in the service.

    Frigate drops and re-acquires object ids constantly. If the stillness timer
    lived on the Track it would reset on every re-acquisition and would never
    fire — silently, and in the direction that fails to warn you.
    """
    cfg = make_config()
    tk = DogTracker(cfg)

    t = 1000.0
    # Same dog, same spot, but Frigate hands us a brand new id every 30s.
    for i in range(20):
        oid = f"track-{i}"                       # <- id changes every time
        tk.on_detection(det(t, oid, zones=("cage",), cx=0.20, cy=0.70,
                            event_type="new"))
        tk.tick(t)
        t += 30.0
        # end the old track, as Frigate would
        tk.on_detection(det(t - 1, oid, zones=("cage",), cx=0.20, cy=0.70,
                            event_type="end"))

    st = tk.dogs["cage_dog"]
    # ~10 minutes of genuine stillness, despite 20 different track ids.
    assert st.still_for(t) > 550, f"timer reset by churn: {st.still_for(t)}"


def test_movement_beyond_threshold_resets_the_timer():
    cfg = make_config()
    tk = DogTracker(cfg)

    tk.on_detection(det(1000.0, "a", zones=("cage",), cx=0.20, cy=0.70))
    tk.tick(1000.0)
    tk.on_detection(det(1300.0, "a", zones=("cage",), cx=0.20, cy=0.70))
    tk.tick(1300.0)
    assert tk.dogs["cage_dog"].still_for(1300.0) >= 300

    # A real shift, well beyond min_movement (0.02 of frame width).
    tk.on_detection(det(1310.0, "a", zones=("cage",), cx=0.32, cy=0.70))
    tk.tick(1310.0)
    assert tk.dogs["cage_dog"].still_for(1310.0) == 0.0


def test_jitter_below_threshold_does_not_reset_the_timer():
    """Bounding boxes wobble by a pixel or two. That is not movement."""
    cfg = make_config()
    tk = DogTracker(cfg)

    t = 1000.0
    tk.on_detection(det(t, "a", zones=("cage",), cx=0.200, cy=0.700))
    tk.tick(t)
    for i in range(30):
        t += 10.0
        jitter = 0.004 * (1 if i % 2 else -1)     # well under min_movement
        tk.on_detection(det(t, "a", zones=("cage",),
                            cx=0.200 + jitter, cy=0.700 - jitter))
        tk.tick(t)

    assert tk.dogs["cage_dog"].still_for(t) > 280


def test_person_in_cage_resets_the_stillness_clock():
    """You turning him is care, not an incident.

    Without this the alert fires an hour after you already did the thing it
    would have asked you to do.
    """
    cfg = make_config()
    tk = DogTracker(cfg)

    tk.on_detection(det(1000.0, "dog-a", zones=("cage",), cx=0.2, cy=0.7))
    tk.tick(1000.0)
    tk.on_detection(det(4000.0, "dog-a", zones=("cage",), cx=0.2, cy=0.7))
    tk.tick(4000.0)
    assert tk.dogs["cage_dog"].still_for(4000.0) >= 3000

    tk.on_detection(det(4010.0, "person-1", label="person", zones=("cage",)))
    assert tk.dogs["cage_dog"].still_for(4010.0) < 1.0


def test_person_elsewhere_does_not_reset_the_clock():
    cfg = make_config()
    tk = DogTracker(cfg)
    tk.on_detection(det(1000.0, "dog-a", zones=("cage",), cx=0.2, cy=0.7))
    tk.tick(1000.0)
    tk.on_detection(det(4000.0, "dog-a", zones=("cage",), cx=0.2, cy=0.7))
    tk.tick(4000.0)

    tk.on_detection(det(4010.0, "person-1", label="person", zones=("doorway",)))
    assert tk.dogs["cage_dog"].still_for(4010.0) >= 3000


def test_long_blind_gap_re_anchors_rather_than_claiming_unobserved_stillness():
    """If we could not see the dog, we must not claim it lay still.

    Re-acquiring at the same spot after an hour of nothing is not evidence of an
    hour of stillness — it is evidence of an hour of not knowing.
    """
    cfg = make_config()
    tk = DogTracker(cfg)

    tk.on_detection(det(1000.0, "a", zones=("cage",), cx=0.2, cy=0.7))
    tk.tick(1000.0)

    later = 1000.0 + 3600.0                        # far beyond live_window
    tk.on_detection(det(later, "b", zones=("cage",), cx=0.2, cy=0.7))
    tk.tick(later)

    assert tk.dogs["cage_dog"].still_for(later) == 0.0


def test_dog_not_visible_goes_out_of_view():
    cfg = make_config()
    tk = DogTracker(cfg)
    tk.on_detection(det(1000.0, "a", zones=("cage",)))
    tk.tick(1000.0)
    assert tk.dogs["cage_dog"].state is not ActivityState.OUT_OF_VIEW

    tk.tick(1000.0 + cfg.tracking.live_window_seconds + 1)
    assert tk.dogs["cage_dog"].state is ActivityState.OUT_OF_VIEW


def test_phantom_track_is_reaped_so_identity_does_not_report_two_dogs():
    """Frigate sometimes drops an `end`. Without a timeout the ghost lingers and
    every subsequent resolution reports two dogs and goes ambiguous."""
    cfg = make_config()
    tk = DogTracker(cfg)

    tk.on_detection(det(1000.0, "ghost", zones=("bed_roam",)))
    tk.tick(1000.0)

    t = 1000.0 + cfg.tracking.reap_after_seconds + 10
    tk.on_detection(det(t, "real", zones=("cage",), cx=0.2, cy=0.7))
    tk.tick(t)

    assert "ghost" not in tk.registry.tracks
    # One dog visible, in the crate -> resolvable, not ambiguous.
    assert tk.dogs["cage_dog"].current_track_id == "real"


def test_roaming_dog_asleep_in_its_own_bed_is_exempt():
    cfg = make_config()
    tk = DogTracker(cfg)
    tk.on_detection(det(1000.0, "a", zones=("bed_roam",), cx=0.7, cy=0.8))
    tk.tick(1000.0)
    st = tk.dogs["roam_dog"]
    assert tk.stillness_exempt(cfg.roam_dog, st) is True


def test_bark_window_counts_only_recent_barks():
    cfg = make_config()
    tk = DogTracker(cfg)
    for i in range(5):
        tk.on_bark(1000.0 + i)
    for i in range(3):
        tk.on_bark(2000.0 + i)
    assert tk.barks_within(2005.0, 60.0) == 3
    assert tk.barks_within(2005.0, 1200.0) == 8


def test_long_gap_on_a_continuous_track_is_stillness_not_absence():
    """The Frigate-stationary case, stated as a test.

    Frigate stops detecting on stationary objects, so a still dog produces a
    long gap between updates while keeping the same track id. That gap is
    evidence the dog lay still, not evidence we lost it — re-anchoring here
    would discard exactly the signal the stillness rule depends on.
    """
    cfg = make_config()
    tk = DogTracker(cfg)

    tk.on_detection(det(1000.0, "steady", zones=("cage",), cx=0.2, cy=0.7))
    tk.tick(1000.0)
    # One update, 50 minutes later, same id, same position — a stationary dog.
    tk.on_detection(det(4000.0, "steady", zones=("cage",), cx=0.2, cy=0.7,
                        stationary=True, motionless=15000))
    tk.tick(4000.0)

    assert tk.dogs["cage_dog"].still_for(4000.0) >= 3000
