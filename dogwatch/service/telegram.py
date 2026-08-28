"""Telegram long-polling for incoming commands.

Runs on a background thread and hands messages to the main loop through a
queue, because the rest of the service is synchronous and this is one socket.

Two things here are safety-relevant rather than cosmetic:

* **The chat allowlist.** A bot token is effectively public — anyone who finds
  the bot can message it. Without an allowlist a stranger could send `quiet 8h`
  or `out` and silently disable the monitor. Unknown chats are dropped with no
  reply at all; replying would confirm the bot exists to someone probing.

* **Offset persistence.** Telegram redelivers un-acknowledged updates. Without
  storing the offset, every restart replays the backlog — so a `quiet 8h` sent
  yesterday would take effect again this morning.
"""

from __future__ import annotations

import logging
import queue
import threading
import time
from dataclasses import dataclass
from typing import Callable

log = logging.getLogger("dogwatch.telegram")

API = "https://api.telegram.org"


@dataclass(frozen=True)
class Incoming:
    chat_id: int
    text: str
    ts: float
    update_id: int


def http_transport(token: str, timeout: float = 30.0) -> Callable:
    """Real transport. Kept injectable so tests never touch the network."""
    def call(method: str, params: dict) -> dict:
        import httpx

        r = httpx.get(f"{API}/bot{token}/{method}", params=params, timeout=timeout)
        r.raise_for_status()
        return r.json()

    return call


class TelegramPoller:
    def __init__(self, token: str, allowed_chat_ids: list[int], *,
                 get_offset: Callable[[], int] | None = None,
                 set_offset: Callable[[int], None] | None = None,
                 transport: Callable | None = None,
                 long_poll_seconds: int = 25) -> None:
        self.token = token
        self.allowed = {int(c) for c in allowed_chat_ids}
        self._get_offset = get_offset or (lambda: 0)
        self._set_offset = set_offset or (lambda _v: None)
        self.transport = transport or http_transport(token)
        self.long_poll_seconds = long_poll_seconds

        self.queue: "queue.Queue[Incoming]" = queue.Queue(maxsize=200)
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.dropped_unknown_chat = 0

    # -- one polling cycle, synchronous and testable -----------------------

    def poll_once(self) -> list[Incoming]:
        offset = self._get_offset()
        payload = self.transport("getUpdates", {
            "offset": offset,
            "timeout": self.long_poll_seconds,
            "allowed_updates": '["message"]',
        })
        if not isinstance(payload, dict) or not payload.get("ok"):
            log.warning("getUpdates returned not-ok: %s", str(payload)[:200])
            return []

        out: list[Incoming] = []
        highest = offset - 1
        for upd in payload.get("result") or []:
            uid = int(upd.get("update_id", 0))
            highest = max(highest, uid)

            msg = upd.get("message") or {}
            chat_id = (msg.get("chat") or {}).get("id")
            text = msg.get("text") or ""
            if chat_id is None or not text:
                continue
            if int(chat_id) not in self.allowed:
                # Silently ignored. No reply — that would confirm the bot to a
                # prober — but the offset still advances so it is not re-read.
                self.dropped_unknown_chat += 1
                log.warning("ignoring message from unknown chat id %s", chat_id)
                continue
            out.append(Incoming(int(chat_id), text.strip(),
                                float(msg.get("date") or time.time()), uid))

        if highest >= offset:
            # Acknowledge everything seen, including what we dropped.
            self._set_offset(highest + 1)
        return out

    # -- background thread -------------------------------------------------

    def _run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                for msg in self.poll_once():
                    try:
                        self.queue.put_nowait(msg)
                    except queue.Full:
                        log.error("command queue full; dropping %r", msg.text[:40])
                backoff = 1.0
            except Exception as exc:
                # A Telegram outage must never stop MQTT ingest or the ledger.
                log.warning("telegram poll failed (%s); retrying in %.0fs", exc, backoff)
                self._stop.wait(backoff)
                backoff = min(backoff * 2, 60.0)

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="telegram-poll",
                                        daemon=True)
        self._thread.start()
        log.info("telegram polling started for %d chat id(s)", len(self.allowed))

    def stop(self) -> None:
        self._stop.set()

    def drain(self) -> list[Incoming]:
        """Everything received since the last drain. Never blocks."""
        out: list[Incoming] = []
        while True:
            try:
                out.append(self.queue.get_nowait())
            except queue.Empty:
                return out
