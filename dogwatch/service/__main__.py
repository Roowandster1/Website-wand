"""dogwatch CLI.

    python -m service validate                 # check the config, exit
    python -m service replay day.jsonl         # run a capture through offline
    python -m service digest --hours 6         # what /update would send
    python -m service run                      # live, against MQTT
"""

from __future__ import annotations

import argparse
import logging
import sys
import time

from .app import Dogwatch
from .config import ConfigError, load
from .ledger import Ledger


def setup_logging(level: str, path: str | None) -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stderr)]
    if path:
        handlers.append(logging.FileHandler(path))
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s  %(message)s",
        handlers=handlers,
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="dogwatch")
    ap.add_argument("--config", default="dogwatch.yml")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("validate", help="load and check the config, then exit")
    p = sub.add_parser("replay", help="run a capture offline")
    p.add_argument("capture")
    p.add_argument("--db", default=":memory:")
    p = sub.add_parser("digest", help="print what /update would send")
    p.add_argument("--hours", type=float, default=None)
    p.add_argument("--db", default=None)
    sub.add_parser("run", help="run live against MQTT")

    args = ap.parse_args(argv)

    try:
        cfg = load(args.config)
    except (ConfigError, FileNotFoundError) as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2

    setup_logging(cfg.log_level, cfg.log_path if args.cmd == "run" else None)

    if args.cmd == "validate":
        print(f"config OK: {len(cfg.dogs)} dogs, "
              f"{len(cfg.alerts.rules)} rules, "
              f"shadow_mode={cfg.alerts.shadow_mode}, "
              f"quiet_hours={'on' if cfg.alerts.quiet_hours.enabled else 'off'}")
        if cfg.alerts.shadow_mode:
            print("NOTE: shadow mode is on — alerts are recorded, nothing is sent.")
        if not cfg.telegram_token:
            print("NOTE: TELEGRAM_BOT_TOKEN is not set — notifications disabled.")
        if not cfg.anthropic_key:
            print("NOTE: ANTHROPIC_API_KEY is not set — /update disabled.")
        return 0

    if args.cmd == "replay":
        ledger = Ledger(args.db)
        app = Dogwatch(cfg, ledger)
        app.run_replay(args.capture)
        for a in ledger.recent_alerts(0):
            print(f"{a['ts']:.0f} {a['action']:15s} {a['rule']:15s} "
                  f"{a['subject']:10s} {a['detail']}")
        ledger.close()
        return 0

    if args.cmd == "digest":
        from .summarise import build_digest

        ledger = Ledger(args.db or cfg.db_path)
        hours = args.hours or cfg.summariser.default_window_hours
        now = time.time()
        print(build_digest(ledger, cfg, now - hours * 3600, now))
        ledger.close()
        return 0

    if args.cmd == "run":
        ledger = Ledger(cfg.db_path)
        app = Dogwatch(cfg, ledger)
        logging.getLogger("dogwatch").info(
            "starting: shadow_mode=%s quiet_hours=%s db=%s",
            cfg.alerts.shadow_mode, cfg.alerts.quiet_hours.enabled, cfg.db_path,
        )
        try:
            app.run_live()
        except KeyboardInterrupt:
            pass
        finally:
            app.close()
            ledger.close()
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
