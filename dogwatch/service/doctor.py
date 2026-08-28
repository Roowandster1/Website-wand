"""Setup checks.

Written for the moment you are stood at the machine at 9am wondering why
nothing works. Every check says what is wrong AND what to do about it, and
nothing here changes any state.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
from dataclasses import dataclass

from .config import Config

OK, WARN, FAIL, SKIP = "ok", "warn", "fail", "skip"

MARK = {OK: "  OK  ", WARN: " WARN ", FAIL: " FAIL ", SKIP: " --   "}


@dataclass
class Check:
    status: str
    name: str
    detail: str = ""
    fix: str = ""


def _port_open(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        socket.create_connection((host, port), timeout=timeout).close()
        return True
    except OSError:
        return False


def _http_ok(url: str, timeout: float = 4.0) -> tuple[bool, str]:
    try:
        import httpx

        r = httpx.get(url, timeout=timeout)
        return r.status_code < 400, f"HTTP {r.status_code}"
    except Exception as exc:
        return False, str(exc)[:90]


# --- individual checks ------------------------------------------------------

def check_tools() -> list[Check]:
    out = []
    for binary, why, fix in [
        ("ffprobe", "inspecting the camera stream", "apt install ffmpeg"),
        ("v4l2-ctl", "listing USB cameras", "apt install v4l-utils"),
        ("docker", "running Frigate", "https://docs.docker.com/engine/install/"),
    ]:
        if shutil.which(binary):
            out.append(Check(OK, binary))
        else:
            out.append(Check(WARN, binary, f"not installed — needed for {why}", fix))
    return out


def check_cameras() -> list[Check]:
    devs = sorted(p for p in os.listdir("/dev") if p.startswith("video")) \
        if os.path.isdir("/dev") else []
    if not devs:
        return [Check(FAIL, "camera device", "no /dev/video* found",
                      "Plug in the USB webcam, then re-run. "
                      "`v4l2-ctl --list-devices` shows what is attached.")]
    checks = [Check(OK, "camera device", f"/dev/{devs[0]}"
                    + (f" (+{len(devs)-1} more)" if len(devs) > 1 else ""))]

    if shutil.which("ffmpeg"):
        try:
            r = subprocess.run(
                ["ffmpeg", "-hide_banner", "-f", "v4l2", "-list_formats", "all",
                 "-i", f"/dev/{devs[0]}"],
                capture_output=True, text=True, timeout=15)
            sizes = [ln.strip() for ln in (r.stderr or "").splitlines()
                     if "Raw" in ln or "Compressed" in ln]
            if sizes:
                checks.append(Check(OK, "camera formats", sizes[0][:100],
                                    "Pick a video_size from these for the go2rtc "
                                    "line in frigate/config.yml"))
        except Exception:
            pass

    mics = ""
    if shutil.which("arecord"):
        try:
            r = subprocess.run(["arecord", "-l"], capture_output=True, text=True,
                               timeout=10)
            mics = r.stdout.strip()
        except Exception:
            pass
    if "card" in mics:
        checks.append(Check(OK, "microphone", mics.splitlines()[0][:90]))
    else:
        checks.append(Check(WARN, "microphone", "no ALSA capture device found",
                            "Bark detection needs audio. Without a mic, leave "
                            "audio disabled — everything else still works."))
    return checks


def check_services(cfg: Config) -> list[Check]:
    out = []
    if _port_open(cfg.mqtt_host, cfg.mqtt_port):
        out.append(Check(OK, "MQTT broker", f"{cfg.mqtt_host}:{cfg.mqtt_port}"))
    else:
        out.append(Check(FAIL, "MQTT broker",
                         f"nothing listening on {cfg.mqtt_host}:{cfg.mqtt_port}",
                         "docker compose up -d mosquitto"))

    ok, detail = _http_ok(f"{cfg.frigate_base_url}/api/version")
    if ok:
        out.append(Check(OK, "Frigate API", cfg.frigate_base_url))
    else:
        out.append(Check(FAIL, "Frigate API", f"{cfg.frigate_base_url} — {detail}",
                         "docker compose up -d frigate, then check "
                         "`docker logs dogwatch-frigate`"))
        return out

    ok, _ = _http_ok(f"{cfg.frigate_base_url}/api/{cfg.camera}/latest.jpg")
    if ok:
        out.append(Check(OK, "camera in Frigate", cfg.camera))
    else:
        out.append(Check(FAIL, "camera in Frigate",
                         f"`{cfg.camera}` is not producing frames",
                         "Check the go2rtc stream line in frigate/config.yml and "
                         "`./tools/check_stream.sh`"))

    # Are the zones the config depends on actually defined in Frigate?
    try:
        import httpx

        conf = httpx.get(f"{cfg.frigate_base_url}/api/config", timeout=5).json()
        zones = set((conf.get("cameras", {}).get(cfg.camera, {})
                     .get("zones", {}) or {}).keys())
        missing = [z for z in ([cfg.cage_zone] + list(cfg.care.track_zones))
                   if z not in zones]
        if missing:
            out.append(Check(FAIL, "zones in Frigate",
                             f"missing: {', '.join(missing)}",
                             "Draw them in Settings -> Debug -> Zones and paste "
                             "the coordinates into frigate/config.yml. Identity "
                             "resolution cannot work without the crate zone."))
        else:
            out.append(Check(OK, "zones in Frigate", ", ".join(sorted(zones))))
    except Exception as exc:
        out.append(Check(WARN, "zones in Frigate", str(exc)[:80]))
    return out


def check_credentials(cfg: Config) -> list[Check]:
    out = []
    if not cfg.telegram_token:
        out.append(Check(WARN, "Telegram token", "TELEGRAM_BOT_TOKEN is not set",
                         "Create a bot with @BotFather, put the token in .env. "
                         "Without it there are no alerts and no commands."))
    else:
        try:
            import httpx

            r = httpx.get(
                f"https://api.telegram.org/bot{cfg.telegram_token}/getMe", timeout=8)
            j = r.json()
            if j.get("ok"):
                out.append(Check(OK, "Telegram token",
                                 "@" + j["result"].get("username", "?")))
            else:
                out.append(Check(FAIL, "Telegram token",
                                 j.get("description", "rejected"),
                                 "Re-copy the token from @BotFather."))
        except Exception as exc:
            out.append(Check(WARN, "Telegram token", f"could not verify: {exc}"[:90]))

    if not cfg.chat_ids or cfg.chat_ids == [0]:
        out.append(Check(WARN, "Telegram chat id", "none configured",
                         "Run: python -m service telegram-setup"))
    else:
        out.append(Check(OK, "Telegram chat id",
                         ", ".join(str(c) for c in cfg.chat_ids)))

    if cfg.anthropic_key:
        out.append(Check(OK, "Anthropic key", "set"))
    else:
        out.append(Check(WARN, "Anthropic key", "ANTHROPIC_API_KEY is not set",
                         "The `update` summary is disabled without it. "
                         "Everything else works."))
    return out


def check_config(cfg: Config) -> list[Check]:
    out = []
    unnamed = [d.id for d in cfg.dogs if d.name == d.id]
    if unnamed:
        out.append(Check(WARN, "dog names", f"unnamed: {', '.join(unnamed)}",
                         "Set `name:` for each dog in dogwatch.yml — they appear "
                         "in every alert and summary."))
    else:
        out.append(Check(OK, "dog names",
                         ", ".join(d.name for d in cfg.dogs)))

    if cfg.alerts.shadow_mode:
        out.append(Check(OK, "shadow mode", "ON — nothing will be sent",
                         "Correct for the first day. Read a day of "
                         "would-have-sent output, then set shadow_mode: false."))
    else:
        out.append(Check(WARN, "shadow mode", "OFF — alerts will really send",
                         "Only do this after reviewing a day in shadow mode."))

    if cfg.alerts.quiet_hours.enabled:
        q = cfg.alerts.quiet_hours
        out.append(Check(OK, "quiet hours", f"{q.start}-{q.end}, "
                         f"suppressing {', '.join(q.suppress) or 'nothing'}"))
    else:
        out.append(Check(WARN, "quiet hours", "disabled",
                         "A stillness alert at 4am gets the system muted. "
                         "Consider enabling it."))

    db_dir = os.path.dirname(os.path.abspath(cfg.db_path)) or "."
    if os.access(db_dir, os.W_OK):
        out.append(Check(OK, "database path", cfg.db_path))
    else:
        out.append(Check(FAIL, "database path", f"{db_dir} is not writable",
                         f"mkdir -p {db_dir}"))
    return out


def run_all(cfg: Config) -> tuple[list[tuple[str, list[Check]]], int, int]:
    groups = [
        ("Tools", check_tools()),
        ("Camera", check_cameras()),
        ("Services", check_services(cfg)),
        ("Credentials", check_credentials(cfg)),
        ("Configuration", check_config(cfg)),
    ]
    fails = sum(1 for _, cs in groups for c in cs if c.status == FAIL)
    warns = sum(1 for _, cs in groups for c in cs if c.status == WARN)
    return groups, fails, warns


def render(groups) -> str:
    lines = []
    for title, checks in groups:
        lines.append(f"\n{title}")
        lines.append("-" * len(title))
        for c in checks:
            lines.append(f"[{MARK[c.status]}] {c.name:<22} {c.detail}")
            if c.fix and c.status in (FAIL, WARN):
                for ln in _wrap(c.fix, 68):
                    lines.append(f"{'':<32}{ln}")
    return "\n".join(lines)


def _wrap(text: str, width: int) -> list[str]:
    words, line, out = text.split(), "", []
    for w in words:
        if len(line) + len(w) + 1 > width:
            out.append("-> " + line if not out else "   " + line)
            line = w
        else:
            line = f"{line} {w}".strip()
    if line:
        out.append("-> " + line if not out else "   " + line)
    return out
