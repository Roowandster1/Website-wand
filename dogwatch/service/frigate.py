"""Minimal Frigate HTTP client.

Every call degrades to None rather than raising: a missing snapshot must never
stop an alert going out, and a Frigate hiccup must never take the monitor down.
"""

from __future__ import annotations

import logging

log = logging.getLogger("dogwatch.frigate")


def _get(url: str, params: dict | None = None, timeout: float = 10.0):
    try:
        import httpx
    except ImportError:
        return None
    try:
        r = httpx.get(url, params=params, timeout=timeout)
        r.raise_for_status()
        return r
    except Exception as exc:
        log.warning("frigate GET %s failed: %s", url, exc)
        return None


def latest_snapshot(base_url: str, camera: str) -> bytes | None:
    """The camera's current frame, with detection boxes drawn."""
    r = _get(f"{base_url}/api/{camera}/latest.jpg",
             {"h": 720, "bbox": 1, "timestamp": 1})
    return r.content if r is not None else None


def event_snapshot(base_url: str, event_id: str) -> bytes | None:
    r = _get(f"{base_url}/api/events/{event_id}/snapshot.jpg",
             {"quality": 80, "bbox": 1})
    return r.content if r is not None else None


def snapshot_for_alert(base_url: str, camera: str,
                       event_id: str | None) -> bytes | None:
    """Prefer the tracked object's own snapshot; fall back to the live frame."""
    if event_id:
        img = event_snapshot(base_url, event_id)
        if img:
            return img
    return latest_snapshot(base_url, camera)
