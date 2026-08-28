"""The /update summariser.

Summarises **stills and structured data, not video**. Sending hours of footage
to a model is neither practical nor affordable, and it is not necessary: the
minute rollup already knows what happened, and a handful of frames tells the
model what it looked like.

Roughly 11k input tokens and 800 output per call — about $0.06-0.08 on Opus 5.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .config import Config
from .ledger import Ledger, Run

log = logging.getLogger("dogwatch.summarise")

SYSTEM_PROMPT = """\
You summarise a home monitoring log for two dogs so their owner knows how the \
day went. You are given a structured activity timeline and a few still frames.

Critical context about identity:
- The two dogs look very similar. The system CANNOT tell them apart visually.
- Identity is inferred from LOCATION: a dog in the crate zone is the paralysed \
dog; a dog elsewhere is the roaming dog.
- Every entry carries a confidence: `certain` (both dogs were visible and only \
one was in the crate), `inferred` (one dog visible, position implies which), or \
`ambiguous` (could not tell).
- When confidence is `inferred`, hedge — say "probably" or "the dog in the \
crate". When it is `ambiguous`, say plainly that you could not tell which dog. \
NEVER present an ambiguous or inferred observation as certain. An owner acting \
on a confident but wrong claim about a sick animal is the worst outcome here.

Other things you must respect:
- Bark events are room-level. The system cannot attribute a bark to a specific \
dog, so never say which dog barked.
- "Out of view" means not detected on camera. It does NOT mean the dog was \
absent, and must not be reported as the dog going missing.
- A person in the crate zone is the owner attending to the paralysed dog. Treat \
this as care, and note it — it is usually the most important thing in the day.
- You are NOT a vet. Describe what was observed. Do not diagnose, do not \
speculate about illness, and do not offer medical advice. If something looks \
genuinely unusual, say what you observed and suggest they look at the footage.

Write 4-8 short sentences in plain British English. Lead with the paralysed \
dog. Be specific about times and durations. If the day was unremarkable, say so \
briefly rather than padding."""


def _fmt_clock(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%H:%M")


def _fmt_duration(minutes: int) -> str:
    if minutes < 60:
        return f"{minutes}min"
    h, m = divmod(minutes, 60)
    return f"{h}h{m:02d}" if m else f"{h}h"


def build_digest(ledger: Ledger, cfg: Config, start: float, end: float,
                 min_run_minutes: int = 2) -> str:
    """Compress the ledger into a compact timeline the model can read cheaply."""
    names = {d.id: (d.name or d.id) for d in cfg.dogs}
    lines: list[str] = []
    lines.append(f"WINDOW: {_fmt_clock(start)} to {_fmt_clock(end)} "
                 f"({(end - start) / 3600:.1f} hours)")

    stats = ledger.summary_stats(start, end)
    runs = ledger.runs(start, end)
    room = stats.pop("__room__", None)
    if room:
        lines.append(f"ROOM: {room['barks']} barking events detected "
                     "(the system cannot tell which dog barked)")
        if room["care_minutes"]:
            lines.append(f"ROOM: a person was at the crate during "
                         f"{room['care_minutes']} minutes of this window")

    for dog_cfg in cfg.dogs:
        did = dog_cfg.id
        s = stats.get(did)
        label = names[did] + (" (paralysed, mainly crated)" if dog_cfg.paralysed
                              else " (roams freely)")
        lines.append("")
        lines.append(f"=== {label} ===")
        if not s:
            lines.append("  no data recorded in this window")
            continue

        vis = s["visible_minutes"]
        lines.append(
            f"  on camera {vis} of {s['minutes']} minutes; "
            f"active {s['active']}min, resting {s['resting']}min, "
            f"not detected {s['out_of_view']}min"
        )
        lines.append(f"  longest unbroken stillness: "
                     f"{s['longest_still_seconds'] / 3600:.1f} hours")
        if s["care_minutes"]:
            lines.append(f"  minutes with a person in the crate zone (care): "
                         f"{s['care_minutes']}")
        if vis and s["ambiguous_minutes"]:
            pct = 100 * s["ambiguous_minutes"] / vis
            lines.append(
                f"  IDENTITY WARNING: {pct:.0f}% of the time this dog was visible, "
                "the system could not be sure which dog it was looking at"
            )

        # Only report stretches the dog was actually on camera. Pages of
        # "out_of_view" tell the model nothing the summary line above did not
        # already say, and crowd out the parts that matter.
        dog_runs = [
            r for r in runs
            if r.dog == did and r.minutes >= min_run_minutes
            and r.state != "out_of_view"
        ]
        if dog_runs:
            lines.append("  timeline (periods on camera only):")
            for r in dog_runs:
                where = ", ".join(r.zones) if r.zones else "no zone"
                lines.append(
                    f"    {_fmt_clock(r.start_ts)}-{_fmt_clock(r.end_ts + 60)} "
                    f"{r.state} ({_fmt_duration(r.minutes)}) in {where} "
                    f"[confidence: {r.confidence}]"
                )
        else:
            lines.append("  not detected on camera long enough to build a timeline")

    # --- care: two sources, never merged ---------------------------------
    care = ledger.care_between(start, end)
    visits = ledger.visits_between(start, end)

    if care or visits:
        lines.append("")
        lines.append("=== care and routine ===")

    if care:
        lines.append("  LOGGED BY THE OWNER (reliable — a person typed these):")
        for c in care:
            label = {"pee": "bladder expressed", "poo": "bowel movement",
                     "fed": "fed", "water": "given water",
                     "meds": "medication given"}.get(c["kind"], c["kind"])
            note = f" — \"{c['note']}\"" if c["note"] else ""
            lines.append(f"    {_fmt_clock(c['ts'])} {label}{note}")
    else:
        lines.append("  LOGGED BY THE OWNER: nothing recorded in this window.")
        lines.append("    (This means nothing was typed in, NOT that nothing "
                     "happened. Do not infer neglect from an empty log.)")

    if visits:
        lines.append("  SEEN BY THE CAMERA (presence only — this shows a dog was "
                     "AT a place, never that it drank, ate or toileted):")
        by_zone: dict[tuple[str, str], list[float]] = {}
        for v in visits:
            by_zone.setdefault((v["dog"], v["zone"]), []).append(v["duration"] or 0.0)
        for (dog, zone), durs in sorted(by_zone.items()):
            who = names.get(dog, dog)
            total = sum(durs) / 60.0
            lines.append(f"    {who} was at `{zone}` {len(durs)} times, "
                         f"{total:.0f} min in total")

    alerts = [a for a in ledger.recent_alerts(start) if a["ts"] <= end]
    if alerts:
        lines.append("")
        lines.append("=== alerts raised in this window ===")
        for a in alerts:
            if a["action"].endswith("_quiet"):
                why = " (overnight — silenced, the owner has NOT seen this yet)"
            elif a["action"].endswith("_muted"):
                why = " (alerts were muted — the owner has NOT seen this yet)"
            else:
                why = ""
            lines.append(f"  {_fmt_clock(a['ts'])} {a['rule']} / {a['subject']}: "
                         f"{a['detail']}{why}")
    return "\n".join(lines)


def fetch_snapshots(cfg: Config, start: float, end: float,
                    max_images: int) -> list[tuple[str, str]]:
    """Sample still frames from Frigate. Returns [(media_type, base64), ...].

    Degrades to an empty list if Frigate is unreachable — a summary with no
    pictures is much better than no summary.
    """
    if max_images <= 0:
        return []
    try:
        import httpx
    except ImportError:
        log.warning("httpx not installed; skipping snapshots")
        return []

    out: list[tuple[str, str]] = []
    try:
        r = httpx.get(
            f"{cfg.frigate_base_url}/api/events",
            params={"camera": cfg.camera, "after": int(start), "before": int(end),
                    "limit": 200, "labels": "dog"},
            timeout=10.0,
        )
        r.raise_for_status()
        events = r.json()
    except Exception as exc:
        log.warning("could not list Frigate events for snapshots: %s", exc)
        return []

    events = [e for e in events if e.get("has_snapshot")]
    if not events:
        return []

    # Spread the samples across the window rather than taking the first N,
    # which would all come from the same few minutes.
    step = max(1, len(events) // max_images)
    for ev in events[::step][:max_images]:
        try:
            r = httpx.get(
                f"{cfg.frigate_base_url}/api/events/{ev['id']}/snapshot.jpg",
                params={"quality": 70, "bbox": 0},
                timeout=10.0,
            )
            r.raise_for_status()
            out.append(("image/jpeg", base64.standard_b64encode(r.content).decode()))
        except Exception as exc:
            log.warning("snapshot %s failed: %s", ev.get("id"), exc)
    return out


def build_request(cfg: Config, digest: str,
                  images: list[tuple[str, str]]) -> dict[str, Any]:
    """The exact request body, built separately so it can be inspected dry."""
    content: list[dict[str, Any]] = []
    for media_type, data in images:
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": data},
        })
    content.append({
        "type": "text",
        "text": (
            f"Here is the activity log.\n\n{digest}\n\n"
            f"{len(images)} still frames from this window are attached above, "
            "sampled across it. Summarise how the dogs have been."
        ),
    })
    return {
        "model": cfg.summariser.model,
        "max_tokens": cfg.summariser.max_tokens,
        # Stable prefix — cached so repeated /update calls only pay for the
        # digest and images.
        "system": [{"type": "text", "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"}}],
        "thinking": {"type": "adaptive"},
        "output_config": {"effort": cfg.summariser.effort},
        "messages": [{"role": "user", "content": content}],
    }


@dataclass
class Summary:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    n_images: int = 0
    dry_run: bool = False

    @property
    def approx_cost_usd(self) -> float:
        # Opus 5: $5 / MTok in, $25 / MTok out.
        return self.input_tokens / 1e6 * 5.0 + self.output_tokens / 1e6 * 25.0


def summarise(cfg: Config, ledger: Ledger, start: float, end: float, *,
              dry_run: bool = False,
              with_images: bool = True) -> Summary:
    digest = build_digest(ledger, cfg, start, end)
    images = (fetch_snapshots(cfg, start, end, cfg.summariser.max_images)
              if with_images else [])
    body = build_request(cfg, digest, images)

    if dry_run:
        preview = (
            f"[dry run — no API call made]\n\n"
            f"model      : {body['model']}\n"
            f"effort     : {cfg.summariser.effort}\n"
            f"images     : {len(images)}\n"
            f"digest     : {len(digest)} chars\n\n"
            f"--- system prompt ---\n{SYSTEM_PROMPT}\n\n"
            f"--- user content ---\n{digest}"
        )
        return Summary(text=preview, n_images=len(images), dry_run=True)

    import anthropic

    client = anthropic.Anthropic(api_key=cfg.anthropic_key) if cfg.anthropic_key \
        else anthropic.Anthropic()

    resp = client.beta.messages.create(
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        **body,
    )

    if getattr(resp, "stop_reason", None) == "refusal":
        return Summary(text="Could not produce a summary for this window.",
                       n_images=len(images))

    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    usage = getattr(resp, "usage", None)
    return Summary(
        text=text.strip() or "(no summary returned)",
        input_tokens=getattr(usage, "input_tokens", 0) or 0,
        output_tokens=getattr(usage, "output_tokens", 0) or 0,
        n_images=len(images),
    )
