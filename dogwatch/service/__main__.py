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


def _telegram_setup(cfg, wait_seconds: int) -> int:
    """Print the chat id to paste into dogwatch.yml.

    Finding this by hand means curling getUpdates and reading JSON, which is a
    silly thing to do while standing at a mini PC.
    """
    import time

    if not cfg.telegram_token:
        print("TELEGRAM_BOT_TOKEN is not set.\n\n"
              "  1. Open Telegram and message @BotFather\n"
              "  2. Send /newbot and follow the prompts\n"
              "  3. Put the token it gives you in .env as TELEGRAM_BOT_TOKEN\n"
              "  4. Run this again", file=sys.stderr)
        return 2

    from .telegram import TelegramPoller, http_transport

    transport = http_transport(cfg.telegram_token, timeout=15)
    try:
        me = transport("getMe", {})
    except Exception as exc:
        print(f"Could not reach Telegram: {exc}", file=sys.stderr)
        return 2
    if not me.get("ok"):
        print(f"Token rejected: {me.get('description')}", file=sys.stderr)
        return 2

    username = me["result"].get("username", "?")
    print(f"Bot is @{username}.\n")
    print(f"Now open Telegram, find @{username}, and send it any message.")
    print(f"Waiting up to {wait_seconds}s...\n")

    # Allowlist everything here — the whole point is to discover the id.
    poller = TelegramPoller(cfg.telegram_token, [], transport=transport,
                            long_poll_seconds=5)
    poller.allowed = None                    # sentinel: accept anything
    offset = [0]
    seen: dict[int, str] = {}
    deadline = time.time() + wait_seconds

    while time.time() < deadline and not seen:
        payload = transport("getUpdates", {"offset": offset[0], "timeout": 5})
        for upd in (payload.get("result") or []):
            offset[0] = max(offset[0], int(upd.get("update_id", 0)) + 1)
            msg = upd.get("message") or {}
            chat = msg.get("chat") or {}
            if chat.get("id") is not None:
                who = chat.get("username") or chat.get("first_name") or "you"
                seen[int(chat["id"])] = who

    if not seen:
        print("No message received. Make sure you pressed Start in the chat, "
              "then run this again.", file=sys.stderr)
        return 1

    print("Found:\n")
    for cid, who in seen.items():
        print(f"    chat id {cid}   ({who})")
    print("\nPut it in dogwatch.yml:\n")
    print("telegram:")
    print("  chat_ids:")
    for cid in seen:
        print(f"    - {cid}")
    print("\nOnly these ids are answered. Anyone else messaging the bot is "
          "ignored without a reply.")
    return 0


def _test_summary(cfg, args) -> int:
    """One real Claude call, so the wiring is proven before you depend on it."""
    import time

    from .ledger import Ledger
    from .summarise import summarise

    if not cfg.anthropic_key:
        print("ANTHROPIC_API_KEY is not set — put it in .env and try again.",
              file=sys.stderr)
        return 2

    ledger = Ledger(args.db or cfg.db_path)
    now = time.time()
    rows = ledger.minutes(now - args.hours * 3600, now)
    if not rows:
        print(f"No activity recorded in the last {args.hours:g}h, so there is "
              "nothing to summarise yet.\nLet the service run for a while "
              "first, or use --hours to widen the window.", file=sys.stderr)
        ledger.close()
        return 1

    print(f"Calling {cfg.summariser.model} (effort {cfg.summariser.effort}) "
          f"over the last {args.hours:g}h...\n")
    t0 = time.perf_counter()
    result = summarise(cfg, ledger, now - args.hours * 3600, now,
                       with_images=not args.no_images)
    took = time.perf_counter() - t0
    ledger.close()

    print(result.text)
    print("\n" + "-" * 60)
    print(f"{result.n_images} images | {result.input_tokens} in / "
          f"{result.output_tokens} out | {took:.1f}s | "
          f"about ${result.approx_cost_usd:.3f}")
    print("If that reads sensibly, `update` in Telegram will do the same thing.")
    return 0


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
    sub.add_parser("doctor", help="check the whole setup and say what is missing")
    p = sub.add_parser("telegram-setup", help="find your Telegram chat id")
    p.add_argument("--wait", type=int, default=90,
                   help="seconds to wait for you to message the bot")
    p = sub.add_parser("test-summary", help="make ONE real Claude call and price it")
    p.add_argument("--hours", type=float, default=6.0)
    p.add_argument("--db", default=None)
    p.add_argument("--no-images", action="store_true")

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

    if args.cmd == "doctor":
        from .doctor import render, run_all

        groups, fails, warns = run_all(cfg)
        print(render(groups))
        print()
        if fails:
            print(f"{fails} blocking problem(s), {warns} warning(s). "
                  "Fix the FAILs before going further.")
        elif warns:
            print(f"No blockers, {warns} warning(s). You can start Frigate and "
                  "watch it for a day.")
        else:
            print("All checks passed.")
        return 1 if fails else 0

    if args.cmd == "telegram-setup":
        return _telegram_setup(cfg, args.wait)

    if args.cmd == "test-summary":
        return _test_summary(cfg, args)

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
