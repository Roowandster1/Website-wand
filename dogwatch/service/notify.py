"""Notification sinks.

Shadow mode is enforced here, at the single point where anything leaves the
process, rather than at each call site — so a rule cannot accidentally bypass it.
"""

from __future__ import annotations

import logging
from typing import Protocol

log = logging.getLogger("dogwatch.notify")


class Notifier(Protocol):
    def send(self, text: str) -> bool: ...


class LogNotifier:
    """Used in shadow mode, in replay, and in tests. Records everything."""

    def __init__(self) -> None:
        self.sent: list[str] = []

    def send(self, text: str) -> bool:
        self.sent.append(text)
        log.info("NOTIFY %s", text)
        return True


class TelegramNotifier:
    def __init__(self, token: str, chat_ids: list[int], timeout: float = 10.0) -> None:
        if not token:
            raise ValueError("TELEGRAM_BOT_TOKEN is not set")
        self.token = token
        self.chat_ids = chat_ids
        self.timeout = timeout
        self.sent: list[str] = []

    def send(self, text: str) -> bool:
        import httpx

        ok = True
        for chat_id in self.chat_ids:
            try:
                r = httpx.post(
                    f"https://api.telegram.org/bot{self.token}/sendMessage",
                    json={"chat_id": chat_id, "text": text,
                          "disable_web_page_preview": True},
                    timeout=self.timeout,
                )
                if r.status_code >= 400:
                    log.error("telegram %s: %s", r.status_code, r.text[:300])
                    ok = False
            except Exception as exc:                    # network, DNS, timeout
                # A failed notification must never take the monitor down with it.
                log.error("telegram send failed: %s", exc)
                ok = False
        self.sent.append(text)
        return ok


class ShadowNotifier:
    """Wraps a real notifier and sends nothing.

    Phase 5 ships behind this: it records exactly what would have gone out so you
    can read a day of it before granting permission to actually send.
    """

    def __init__(self, inner: Notifier | None = None) -> None:
        self.inner = inner
        self.sent: list[str] = []

    def send(self, text: str) -> bool:
        self.sent.append(text)
        log.info("SHADOW (not sent) %s", text)
        return True
