"""Fixtures for building Detections and Tracks without a live Frigate."""

from __future__ import annotations

from service.models import Detection, Track

W, H = 1024, 576


def det(
    ts: float,
    obj_id: str,
    *,
    label: str = "dog",
    zones: tuple[str, ...] = (),
    cx: float = 0.5,
    cy: float = 0.5,
    stationary: bool = False,
    event_type: str = "update",
    motionless: int = 0,
    score: float = 0.8,
) -> Detection:
    return Detection(
        ts=ts, event_type=event_type, obj_id=obj_id, camera="dogs_main",
        label=label, score=score, zones=zones,
        cx=cx, cy=cy, bx=cx, by=cy + 0.05, area=0.04,
        stationary=stationary, motionless_count=motionless, position_changes=0,
    )


def track(obj_id: str, *, zones: tuple[str, ...] = (), ts: float = 1000.0,
          label: str = "dog", cx: float = 0.5, cy: float = 0.5) -> Track:
    return Track.start(det(ts, obj_id, label=label, zones=zones, cx=cx, cy=cy))


def make_config(**overrides):
    """A Config built from the shipped example, with test-friendly overrides."""
    import copy
    import tempfile
    from pathlib import Path

    import yaml

    from service import config as cfgmod

    root = Path(__file__).resolve().parents[1]
    raw = yaml.safe_load((root / "dogwatch.yml.example").read_text())
    raw = copy.deepcopy(raw)
    raw["dogs"][0]["name"] = "Bramble"
    raw["dogs"][1]["name"] = "Pip"
    for k, v in overrides.items():
        cur = raw
        *path, leaf = k.split(".")
        for p in path:
            cur = cur[int(p)] if p.isdigit() else cur[p]
        cur[leaf] = v
    with tempfile.NamedTemporaryFile("w", suffix=".yml", delete=False) as fh:
        yaml.safe_dump(raw, fh)
        p = fh.name
    return cfgmod.load(p, env={})
