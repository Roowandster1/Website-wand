"""Telegram command handling.

Parsing and response-building are pure functions so they can be tested without
a bot token, a network, or a running Frigate.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from .config import Config
from .ledger import Ledger
from .models import ActivityState


@dataclass(frozen=True)
class Command:
    name: str                 # update | status | quiet | out | in | help | none
    hours: float | None = None
    minutes: float | None = None


_UPDATE = re.compile(r"^/?(update|summary|how are (they|the dogs))\b", re.I)
_STATUS = re.compile(r"^/?status\b", re.I)
_QUIET = re.compile(r"^/?quiet(?:\s+(\d+)\s*([hm])?)?", re.I)
_OUT = re.compile(r"^/?out\b", re.I)
_IN = re.compile(r"^/?in\b", re.I)
_HELP = re.compile(r"^/?(help|start)\b", re.I)
_HOURS = re.compile(r"(\d+(?:\.\d+)?)\s*h", re.I)


def parse_command(text: str) -> Command:
    t = (text or "").strip()
    if not t:
        return Command("none")

    if _UPDATE.match(t):
        m = _HOURS.search(t)
        return Command("update", hours=float(m.group(1)) if m else None)
    if _STATUS.match(t):
        return Command("status")
    if _OUT.match(t):
        return Command("out")
    if _IN.match(t):
        return Command("in")
    if _HELP.match(t):
        return Command("help")

    m = _QUIET.match(t)
    if m:
        n = float(m.group(1)) if m.group(1) else 60.0
        unit = (m.group(2) or "m").lower()
        return Command("quiet", minutes=n * 60 if unit == "h" else n)

    return Command("none")


HELP_TEXT = (
    "Commands:\n"
    "  update [6h]  — summarise what the dogs have been doing\n"
    "  status       — instant state, no AI call\n"
    "  quiet 2h     — mute alerts for a while\n"
    "  out / in     — tell me the crated dog has left / returned\n"
    "                 (stops me guessing identity while he's away)"
)


def status_text(cfg: Config, tracker, now: float) -> str:
    """Instant, free, no model call — deliberately the cheapest thing here."""
    lines = ["Right now:"]
    for dog_cfg in cfg.dogs:
        st = tracker.dogs[dog_cfg.id]
        name = dog_cfg.name or dog_cfg.id
        if st.state is ActivityState.OUT_OF_VIEW:
            when = (f", last seen {(now - st.last_seen)/60:.0f} min ago"
                    if st.last_seen else "")
            lines.append(f"  {name}: not on camera{when}")
            continue
        where = ", ".join(st.zones) or "no zone"
        still = st.still_for(now)
        hedge = "" if st.confidence.value == "certain" else f" ({st.confidence.value})"
        lines.append(
            f"  {name}: {st.state.value} in {where}{hedge}"
            + (f", still for {still/3600:.1f}h" if still > 300 else "")
        )
    if tracker.cage_dog_away:
        lines.append(f"  ({cfg.cage_dog.name} is marked as out)")
    barks = tracker.barks_within(now, 3600)
    lines.append(f"  barking in the last hour: {barks} events (room-level)")
    return "\n".join(lines)


def handle(cmd: Command, cfg: Config, tracker, ledger: Ledger, now: float,
           *, summarise_fn=None) -> str:
    if cmd.name == "help":
        return HELP_TEXT

    if cmd.name == "status":
        return status_text(cfg, tracker, now)

    if cmd.name == "out":
        tracker.set_cage_dog_away(True)
        return (f"Noted — {cfg.cage_dog.name} is out. I'll stop trying to identify "
                "him and won't raise absence alerts until you say `in`.")

    if cmd.name == "in":
        tracker.set_cage_dog_away(False)
        return f"Welcome back {cfg.cage_dog.name} — normal monitoring resumed."

    if cmd.name == "quiet":
        mins = cmd.minutes or 60.0
        return f"Alerts muted for {mins:.0f} minutes."

    if cmd.name == "update":
        hours = cmd.hours or cfg.summariser.default_window_hours
        hours = min(hours, cfg.summariser.max_window_hours)
        if summarise_fn is None:
            return "Summariser is not configured (no ANTHROPIC_API_KEY set)."
        result = summarise_fn(cfg, ledger, now - hours * 3600, now)
        stamp = datetime.fromtimestamp(now).strftime("%H:%M")
        head = f"Last {hours:.0f}h (as of {stamp})"
        if result.n_images:
            head += f", {result.n_images} frames"
        return f"{head}:\n\n{result.text}"

    return ""
