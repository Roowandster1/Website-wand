"""Load and validate dogwatch.yml.

Validation is deliberately strict and happens at startup. A monitoring system
that silently misreads its own config is worse than one that refuses to boot.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


class ConfigError(ValueError):
    """Raised with a message naming the exact key at fault."""


@dataclass
class StillnessCfg:
    enabled: bool = True
    min_movement: float = 0.02
    after_minutes: float = 240.0
    reset_on_person: bool = True
    exempt_zones: tuple[str, ...] = ()

    @property
    def after_seconds(self) -> float:
        return self.after_minutes * 60.0


@dataclass
class DogCfg:
    id: str
    name: str
    paralysed: bool
    rule: str                 # in_zone | not_in_zone
    zone: str
    stillness: StillnessCfg


@dataclass
class TrackingCfg:
    live_window_seconds: float = 180.0
    poll_interval_seconds: float = 30.0
    reap_after_seconds: float = 600.0


@dataclass
class RuleCfg:
    enabled: bool = False
    confirm_for_seconds: float = 120.0
    cooldown_seconds: float = 3600.0
    notify_on_resolve: bool = True
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class QuietHours:
    """Overnight suppression.

    A stillness alert is a repositioning cue, not an emergency, and one that
    fires at 4am gets the whole system muted — after which it protects nothing.
    Suppressed occurrences are still recorded, so the morning summary can tell
    you he did not shift all night.

    Rules NOT listed in `suppress` still wake you. Absence of the crated dog and
    a dead monitor should never be silenced.
    """
    enabled: bool = False
    start: str = "22:30"
    end: str = "07:00"
    suppress: tuple[str, ...] = ()

    def _minutes(self, hhmm: str, key: str) -> int:
        try:
            h, m = hhmm.split(":")
            h, m = int(h), int(m)
        except (ValueError, AttributeError):
            raise ConfigError(
                f"alerts.quiet_hours.{key} must be HH:MM, got {hhmm!r}"
            ) from None
        if not (0 <= h < 24 and 0 <= m < 60):
            raise ConfigError(f"alerts.quiet_hours.{key} is not a valid time: {hhmm!r}")
        return h * 60 + m

    def active_at(self, ts: float) -> bool:
        """True if local time at `ts` falls inside the quiet window.

        Handles a window that wraps past midnight, which is the normal case.
        """
        if not self.enabled:
            return False
        import datetime as _dt
        local = _dt.datetime.fromtimestamp(ts)
        now = local.hour * 60 + local.minute
        start = self._minutes(self.start, "start")
        end = self._minutes(self.end, "end")
        if start == end:
            return False
        if start < end:
            return start <= now < end
        return now >= start or now < end        # wraps midnight

    def suppresses(self, rule: str, ts: float) -> bool:
        return rule in self.suppress and self.active_at(ts)


@dataclass
class AlertsCfg:
    shadow_mode: bool = True
    rules: dict[str, RuleCfg] = field(default_factory=dict)
    quiet_hours: QuietHours = field(default_factory=QuietHours)


@dataclass
class SummariserCfg:
    default_window_hours: float = 6.0
    max_window_hours: float = 24.0
    max_images: int = 8
    image_max_width: int = 600
    model: str = "claude-opus-5"
    effort: str = "low"
    max_tokens: int = 2000
    hedge_on_ambiguous_identity: bool = True


@dataclass
class Config:
    mqtt_host: str
    mqtt_port: int
    topic_prefix: str
    client_id: str
    frigate_base_url: str
    camera: str
    detect_width: int
    detect_height: int
    dogs: list[DogCfg]
    zones: dict[str, dict[str, Any]]
    tracking: TrackingCfg
    alerts: AlertsCfg
    summariser: SummariserCfg
    chat_ids: list[int]
    send_snapshots: bool
    db_path: str
    raw_event_retention_days: int
    minute_retention_days: int
    log_level: str
    log_path: str | None

    # Secrets never come from the YAML — that file is committed.
    telegram_token: str | None = None
    anthropic_key: str | None = None

    # -- derived helpers ---------------------------------------------------

    @property
    def cage_zone(self) -> str:
        for d in self.dogs:
            if d.rule == "in_zone":
                return d.zone
        raise ConfigError("no dog has an `identity.rule: in_zone` — "
                          "one dog must anchor identity to a zone")

    def dog(self, dog_id: str) -> DogCfg:
        for d in self.dogs:
            if d.id == dog_id:
                return d
        raise KeyError(dog_id)

    @property
    def cage_dog(self) -> DogCfg:
        for d in self.dogs:
            if d.rule == "in_zone":
                return d
        raise ConfigError("no in_zone dog configured")

    @property
    def roam_dog(self) -> DogCfg:
        for d in self.dogs:
            if d.rule == "not_in_zone":
                return d
        raise ConfigError("no not_in_zone dog configured")


# --------------------------------------------------------------------------

def _req(d: dict[str, Any], key: str, where: str) -> Any:
    if key not in d:
        raise ConfigError(f"missing required key `{key}` in {where}")
    return d[key]


def _num(v: Any, key: str, *, minimum: float | None = None) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise ConfigError(f"`{key}` must be a number, got {v!r}") from None
    if minimum is not None and f < minimum:
        raise ConfigError(f"`{key}` must be >= {minimum}, got {f}")
    return f


def load(path: str | Path, env: dict[str, str] | None = None) -> Config:
    env = dict(os.environ if env is None else env)
    raw = yaml.safe_load(Path(path).read_text()) or {}
    if not isinstance(raw, dict):
        raise ConfigError("top level of the config must be a mapping")

    mqtt = raw.get("mqtt") or {}
    frig = raw.get("frigate") or {}
    detect_width = int(_num(frig.get("detect_width", 1024), "frigate.detect_width", minimum=1))
    detect_height = int(_num(frig.get("detect_height", 576), "frigate.detect_height", minimum=1))

    # ---- dogs ----------------------------------------------------------
    dogs_raw = raw.get("dogs") or []
    if not isinstance(dogs_raw, list) or not dogs_raw:
        raise ConfigError("`dogs` must be a non-empty list")

    dogs: list[DogCfg] = []
    seen_ids: set[str] = set()
    for i, d in enumerate(dogs_raw):
        where = f"dogs[{i}]"
        if not isinstance(d, dict):
            raise ConfigError(f"{where} must be a mapping")
        did = str(_req(d, "id", where))
        if did in seen_ids:
            raise ConfigError(f"duplicate dog id `{did}`")
        seen_ids.add(did)

        ident = d.get("identity") or {}
        rule = str(ident.get("rule", ""))
        if rule not in ("in_zone", "not_in_zone"):
            raise ConfigError(
                f"{where}.identity.rule must be `in_zone` or `not_in_zone`, got {rule!r}"
            )
        zone = str(_req(ident, "zone", f"{where}.identity"))

        s = d.get("stillness") or {}
        exempt = s.get("exempt_zones") or []
        if not isinstance(exempt, list):
            raise ConfigError(f"{where}.stillness.exempt_zones must be a list")
        still = StillnessCfg(
            enabled=bool(s.get("enabled", True)),
            min_movement=_num(s.get("min_movement", 0.02),
                              f"{where}.stillness.min_movement", minimum=0.0),
            after_minutes=_num(s.get("after_minutes", 240),
                               f"{where}.stillness.after_minutes", minimum=1.0),
            reset_on_person=bool(s.get("reset_on_person", True)),
            exempt_zones=tuple(str(z) for z in exempt),
        )
        if still.min_movement >= 0.5:
            raise ConfigError(
                f"{where}.stillness.min_movement is {still.min_movement} — that is half "
                "the frame. Values are fractions of frame width; try 0.01-0.05."
            )

        name = str(d.get("name") or "").strip()
        dogs.append(DogCfg(id=did, name=name or did, paralysed=bool(d.get("paralysed")),
                           rule=rule, zone=zone, stillness=still))

    n_in_zone = sum(1 for d in dogs if d.rule == "in_zone")
    n_not = sum(1 for d in dogs if d.rule == "not_in_zone")
    if n_in_zone != 1 or n_not != 1:
        raise ConfigError(
            "identity resolution needs exactly one `in_zone` dog and one "
            f"`not_in_zone` dog; got {n_in_zone} and {n_not}"
        )

    # ---- zones ---------------------------------------------------------
    zones = raw.get("zones") or {}
    if not isinstance(zones, dict):
        raise ConfigError("`zones` must be a mapping")
    anchor = dogs[0].zone if dogs[0].rule == "in_zone" else dogs[1].zone
    if anchor not in zones:
        raise ConfigError(
            f"the identity anchor zone `{anchor}` is not listed under `zones`. "
            "It must also exist in frigate/config.yml or identity will never resolve."
        )

    # ---- tracking ------------------------------------------------------
    t = raw.get("tracking") or {}
    tracking = TrackingCfg(
        live_window_seconds=_num(t.get("live_window_seconds", 180),
                                 "tracking.live_window_seconds", minimum=1.0),
        poll_interval_seconds=_num(t.get("poll_interval_seconds", 30),
                                   "tracking.poll_interval_seconds", minimum=1.0),
        reap_after_seconds=_num(t.get("reap_after_seconds", 600),
                                "tracking.reap_after_seconds", minimum=1.0),
    )
    if tracking.reap_after_seconds <= tracking.live_window_seconds:
        raise ConfigError(
            "tracking.reap_after_seconds must be greater than live_window_seconds, "
            "or tracks are reaped while still considered present"
        )

    # ---- alerts --------------------------------------------------------
    a = raw.get("alerts") or {}
    defaults = a.get("defaults") or {}
    d_confirm = _num(defaults.get("confirm_for_seconds", 120),
                     "alerts.defaults.confirm_for_seconds", minimum=0.0)
    d_cool = _num(defaults.get("cooldown_seconds", 3600),
                  "alerts.defaults.cooldown_seconds", minimum=0.0)
    d_resolve = bool(defaults.get("notify_on_resolve", True))

    rules: dict[str, RuleCfg] = {}
    for name, spec in (a.get("rules") or {}).items():
        spec = spec or {}
        if not isinstance(spec, dict):
            raise ConfigError(f"alerts.rules.{name} must be a mapping")
        known = {"enabled", "confirm_for_seconds", "cooldown_seconds", "notify_on_resolve"}
        rules[str(name)] = RuleCfg(
            enabled=bool(spec.get("enabled", False)),
            confirm_for_seconds=_num(spec.get("confirm_for_seconds", d_confirm),
                                     f"alerts.rules.{name}.confirm_for_seconds", minimum=0.0),
            cooldown_seconds=_num(spec.get("cooldown_seconds", d_cool),
                                  f"alerts.rules.{name}.cooldown_seconds", minimum=0.0),
            notify_on_resolve=bool(spec.get("notify_on_resolve", d_resolve)),
            params={k: v for k, v in spec.items() if k not in known},
        )
    q = a.get("quiet_hours") or {}
    sup = q.get("suppress") or []
    if not isinstance(sup, list):
        raise ConfigError("alerts.quiet_hours.suppress must be a list of rule names")
    quiet = QuietHours(
        enabled=bool(q.get("enabled", False)),
        start=str(q.get("start", "22:30")),
        end=str(q.get("end", "07:00")),
        suppress=tuple(str(x) for x in sup),
    )
    quiet.active_at(0.0)          # validate the time strings now, not at 4am
    for name in quiet.suppress:
        if name not in rules:
            raise ConfigError(
                f"alerts.quiet_hours.suppress names `{name}`, which is not a "
                "configured rule"
            )
    alerts = AlertsCfg(shadow_mode=bool(a.get("shadow_mode", True)), rules=rules,
                       quiet_hours=quiet)

    # ---- summariser ----------------------------------------------------
    s = raw.get("summariser") or {}
    effort = str(s.get("effort", "low"))
    if effort not in ("low", "medium", "high", "xhigh", "max"):
        raise ConfigError(
            f"summariser.effort must be one of low/medium/high/xhigh/max, got {effort!r}"
        )
    summariser = SummariserCfg(
        default_window_hours=_num(s.get("default_window_hours", 6),
                                  "summariser.default_window_hours", minimum=0.1),
        max_window_hours=_num(s.get("max_window_hours", 24),
                              "summariser.max_window_hours", minimum=0.1),
        max_images=int(_num(s.get("max_images", 8), "summariser.max_images", minimum=0)),
        image_max_width=int(_num(s.get("image_max_width", 600),
                                 "summariser.image_max_width", minimum=64)),
        model=str(s.get("model", "claude-opus-5")),
        effort=effort,
        max_tokens=int(_num(s.get("max_tokens", 2000), "summariser.max_tokens", minimum=1)),
        hedge_on_ambiguous_identity=bool(s.get("hedge_on_ambiguous_identity", True)),
    )
    if summariser.default_window_hours > summariser.max_window_hours:
        raise ConfigError("summariser.default_window_hours exceeds max_window_hours")

    # ---- telegram / storage / logging ----------------------------------
    tg = raw.get("telegram") or {}
    chat_ids_raw = tg.get("chat_ids") or []
    if not isinstance(chat_ids_raw, list):
        raise ConfigError("telegram.chat_ids must be a list")
    chat_ids = [int(c) for c in chat_ids_raw if str(c).lstrip("-").isdigit()]

    st = raw.get("storage") or {}
    lg = raw.get("logging") or {}

    cfg = Config(
        mqtt_host=str(mqtt.get("host", "localhost")),
        mqtt_port=int(_num(mqtt.get("port", 1883), "mqtt.port", minimum=1)),
        topic_prefix=str(mqtt.get("topic_prefix", "frigate")),
        client_id=str(mqtt.get("client_id", "dogwatch")),
        frigate_base_url=str(frig.get("base_url", "http://frigate:5000")).rstrip("/"),
        camera=str(frig.get("camera", "dogs_main")),
        detect_width=detect_width,
        detect_height=detect_height,
        dogs=dogs,
        zones={str(k): (v or {}) for k, v in zones.items()},
        tracking=tracking,
        alerts=alerts,
        summariser=summariser,
        chat_ids=chat_ids,
        send_snapshots=bool(tg.get("send_snapshots", True)),
        db_path=str(st.get("db_path", "./storage/dogwatch.db")),
        raw_event_retention_days=int(_num(st.get("raw_event_retention_days", 30),
                                          "storage.raw_event_retention_days", minimum=1)),
        minute_retention_days=int(_num(st.get("minute_retention_days", 365),
                                       "storage.minute_retention_days", minimum=1)),
        log_level=str(lg.get("level", "INFO")).upper(),
        log_path=str(lg["path"]) if lg.get("path") else None,
        telegram_token=env.get("TELEGRAM_BOT_TOKEN") or None,
        anthropic_key=env.get("ANTHROPIC_API_KEY") or None,
    )

    # Cross-check the exempt zones actually exist, or the exemption is a no-op
    # that silently makes the dog alert while asleep in its own bed.
    for d in cfg.dogs:
        for z in d.stillness.exempt_zones:
            if z not in cfg.zones:
                raise ConfigError(
                    f"dog `{d.id}` exempts stillness in zone `{z}`, but that zone is "
                    "not defined under `zones` — the exemption would never apply"
                )
    return cfg
