"""Notification sinks.

Shadow mode is enforced here, at the single point where anything leaves the
process, rather than at each call site — so a rule cannot accidentally bypass it.
"""

from __future__ import annotations

import logging
from typing import Protocol

log = logging.getLogger("dogwatch.notify")


class Notifier(Protocol):
    def send(self, text: str, chat_id: int | None = None) -> bool: ...

    def send_photo(self, caption: str, image: bytes) -> bool: ...


class LogNotifier:
    """Used in shadow mode, in replay, and in tests. Records everything."""

    def __init__(self) -> None:
        self.sent: list[str] = []
        self.photos: list[tuple[str, int]] = []

    def send(self, text: str, chat_id: int | None = None) -> bool:
        self.sent.append(text)
        log.info("NOTIFY %s", text)
        return True

    def send_photo(self, caption: str, image: bytes) -> bool:
        self.sent.append(caption)
        self.photos.append((caption, len(image)))
        log.info("NOTIFY+PHOTO (%d bytes) %s", len(image), caption)
        return True


class TelegramNotifier:
    def __init__(self, token: str, chat_ids: list[int], timeout: float = 10.0) -> None:
        if not token:
            raise ValueError("TELEGRAM_BOT_TOKEN is not set")
        self.token = token
        self.chat_ids = chat_ids
        self.timeout = timeout
        self.sent: list[str] = []
        self.photos: list[tuple[str, int]] = []

    def send(self, text: str, chat_id: int | None = None) -> bool:
        import httpx

        ok = True
        # A command reply goes back to whoever asked; an alert broadcasts.
        for chat_id in ([chat_id] if chat_id is not None else self.chat_ids):
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

    def send_photo(self, caption: str, image: bytes) -> bool:
        """Send the frame with the alert as its caption.

        Falls back to a plain text message if the upload fails — you should get
        the alert even when the picture does not arrive.
        """
        import httpx

        ok = True
        for chat_id in self.chat_ids:
            try:
                r = httpx.post(
                    f"https://api.telegram.org/bot{self.token}/sendPhoto",
                    data={"chat_id": chat_id, "caption": caption[:1024]},
                    files={"photo": ("snapshot.jpg", image, "image/jpeg")},
                    timeout=self.timeout * 3,      # uploads are slower
                )
                if r.status_code >= 400:
                    log.error("telegram sendPhoto %s: %s", r.status_code, r.text[:300])
                    ok = False
            except Exception as exc:
                log.error("telegram sendPhoto failed: %s", exc)
                ok = False
        if not ok:
            return self.send(caption)
        self.sent.append(caption)
        self.photos.append((caption, len(image)))
        return True


class ShadowNotifier:
    """Wraps a real notifier and sends nothing.

    Phase 5 ships behind this: it records exactly what would have gone out so you
    can read a day of it before granting permission to actually send.
    """

    def __init__(self, inner: Notifier | None = None) -> None:
        self.inner = inner
        self.sent: list[str] = []
        self.photos: list[tuple[str, int]] = []

    def send(self, text: str, chat_id: int | None = None) -> bool:
        self.sent.append(text)
        log.info("SHADOW (not sent) %s", text)
        return True

    def send_photo(self, caption: str, image: bytes) -> bool:
        self.sent.append(caption)
        self.photos.append((caption, len(image)))
        log.info("SHADOW (not sent, %d byte photo) %s", len(image), caption)
        return True
