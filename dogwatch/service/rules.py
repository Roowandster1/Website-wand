"""Alert rules and the debounce state machine.

Every rule runs through the same incident FSM:

    clear ──(condition true)──► pending ──(held confirm_for)──► notified
      ▲                            │                               │
      └────(condition false)───────┘                (condition false) ──► clear

`confirm_for` kills flapping. `cooldown` kills repeats. One notification per
occurrence, and a "resolved" only for occurrences that actually announced
themselves — you should never get an all-clear for an alarm you never heard.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import Config, RuleCfg
from .models import ActivityState, Incident


@dataclass(frozen=True)
class AlertEvent:
    ts: float
    rule: str
    subject: str          # dog id, or "room" / "system"
    action: str           # fired | resolved
    detail: str
    # True when quiet hours held this back. Still recorded, never sent.
    suppressed: bool = False

    def format(self, names: dict[str, str]) -> str:
        who = names.get(self.subject, self.subject)
        if self.action == "resolved":
            return f"Resolved — {who}: {self.detail}"
        return f"{who}: {self.detail}"


def step(inc: Incident, active: bool, now: float, cfg: RuleCfg,
         detail: str = "", *, quiet: bool = False,
         resolve_detail: str = "back to normal") -> list[AlertEvent]:
    """Advance one incident by one tick. Returns any alerts to record.

    `quiet` means quiet hours are in force for this rule: the occurrence is
    recorded but never sent, and — crucially — its eventual resolve is silenced
    too. Otherwise you would get an all-clear at 7am for an alarm that never
    reached you at 4am.
    """
    out: list[AlertEvent] = []

    if active:
        if inc.state == "clear":
            inc.state = "pending"
            inc.since = now
            inc.announced = False
        if inc.state == "pending":
            held = now - (inc.since if inc.since is not None else now)
            if held >= cfg.confirm_for_seconds:
                in_cooldown = (
                    inc.notified_at is not None
                    and (now - inc.notified_at) < cfg.cooldown_seconds
                )
                inc.state = "notified"
                inc.detail = detail
                if in_cooldown:
                    # Real, but too soon after the last one to be worth a ping.
                    inc.announced = False
                elif quiet:
                    inc.notified_at = now
                    inc.announced = False
                    inc.fired_silently = True
                    out.append(AlertEvent(now, inc.rule, inc.subject, "fired",
                                          detail, suppressed=True))
                else:
                    inc.notified_at = now
                    inc.announced = True
                    out.append(AlertEvent(now, inc.rule, inc.subject, "fired", detail))
        return out

    # condition is false
    if inc.state == "notified":
        if cfg.notify_on_resolve:
            if inc.announced:
                out.append(AlertEvent(now, inc.rule, inc.subject, "resolved",
                                      resolve_detail))
            elif inc.fired_silently:
                # Recorded for the journal, still not sent — you never heard the
                # original, so an all-clear would only confuse.
                out.append(AlertEvent(now, inc.rule, inc.subject, "resolved",
                                      resolve_detail, suppressed=True))
        inc.reset()
    elif inc.state == "pending":
        inc.reset()          # never confirmed: no alert, and no noise about it
    return out


class RuleEngine:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.room_incidents: dict[str, Incident] = {}
        self.last_frigate_seen: float | None = None

    def _room(self, rule: str, subject: str = "room") -> Incident:
        inc = self.room_incidents.get(rule)
        if inc is None:
            inc = Incident(rule=rule, subject=subject)
            self.room_incidents[rule] = inc
        return inc

    def note_frigate_alive(self, ts: float) -> None:
        self.last_frigate_seen = ts

    def evaluate(self, tracker, now: float) -> list[AlertEvent]:
        events: list[AlertEvent] = []
        rules = self.cfg.alerts.rules
        quiet = self.cfg.alerts.quiet_hours

        # ---- per-dog rules ------------------------------------------------
        for dog_cfg in self.cfg.dogs:
            st = tracker.dogs[dog_cfg.id]

            r = rules.get("stillness")
            if r and r.enabled and dog_cfg.stillness.enabled:
                visible = st.state is not ActivityState.OUT_OF_VIEW
                exempt = tracker.stillness_exempt(dog_cfg, st)
                still = st.still_for(now)
                active = visible and not exempt and still >= dog_cfg.stillness.after_seconds
                detail = (
                    f"hasn't shifted position in {still/3600:.1f}h"
                    + (f" (in {', '.join(st.zones)})" if st.zones else "")
                )
                events += step(
                    st.incident("stillness"), active, now, r, detail,
                    quiet=quiet.suppresses("stillness", now),
                    resolve_detail="has shifted position",
                )

            r = rules.get("absence")
            if r and r.enabled and dog_cfg.id in (r.params.get("dogs") or [dog_cfg.id]):
                after = float(r.params.get("after_minutes", 20)) * 60.0
                gone = (
                    st.state is ActivityState.OUT_OF_VIEW
                    and st.last_seen is not None
                    and (now - st.last_seen) >= after
                )
                detail = (
                    f"not visible for {(now - st.last_seen)/60:.0f} min"
                    if st.last_seen else "not visible"
                )
                events += step(
                    st.incident("absence"), gone, now, r, detail,
                    quiet=quiet.suppresses("absence", now),
                    resolve_detail="visible again",
                )

        # ---- room-level rules ---------------------------------------------
        r = rules.get("bark_burst")
        if r and r.enabled:
            window = float(r.params.get("within_minutes", 5)) * 60.0
            need = int(r.params.get("count", 6))
            n = tracker.barks_within(now, window)
            # Never names a dog: Frigate cannot attribute a bark to one.
            detail = f"{n} barking events in {window/60:.0f} min"
            events += step(
                self._room("bark_burst"), n >= need, now, r, detail,
                quiet=quiet.suppresses("bark_burst", now),
                resolve_detail="barking has settled",
            )

        # ---- dead man's switch --------------------------------------------
        r = rules.get("frigate_silent")
        if r and r.enabled and self.last_frigate_seen is not None:
            after = float(r.params.get("after_minutes", 10)) * 60.0
            silent = (now - self.last_frigate_seen) >= after
            detail = (
                f"no data from Frigate for {(now - self.last_frigate_seen)/60:.0f} min "
                "— the monitor may be down"
            )
            events += step(
                self._room("frigate_silent", "system"), silent, now, r, detail,
                quiet=quiet.suppresses("frigate_silent", now),
                resolve_detail="Frigate is reporting again",
            )

        return events
