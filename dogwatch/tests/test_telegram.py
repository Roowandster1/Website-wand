"""Telegram polling: allowlist, offset handling, failure isolation."""

from service.ledger import Ledger
from service.telegram import TelegramPoller


def fake_transport(batches):
    """Yields one getUpdates payload per call, then empty results forever."""
    calls = []

    def call(method, params):
        calls.append((method, dict(params)))
        if batches:
            return {"ok": True, "result": batches.pop(0)}
        return {"ok": True, "result": []}

    call.calls = calls
    return call


def upd(update_id, chat_id, text, date=1000):
    return {"update_id": update_id,
            "message": {"date": date, "text": text, "chat": {"id": chat_id}}}


def test_messages_from_allowed_chat_are_returned():
    t = fake_transport([[upd(1, 111, "update"), upd(2, 111, "status")]])
    p = TelegramPoller("tok", [111], transport=t)
    got = p.poll_once()
    assert [m.text for m in got] == ["update", "status"]


def test_messages_from_an_unknown_chat_are_dropped_silently():
    """A bot token is effectively public. A stranger sending `quiet 8h` must not
    be able to disable the monitor."""
    t = fake_transport([[upd(1, 999, "quiet 8h"), upd(2, 111, "status")]])
    p = TelegramPoller("tok", [111], transport=t)
    got = p.poll_once()
    assert [m.text for m in got] == ["status"]
    assert p.dropped_unknown_chat == 1


def test_no_reply_is_sent_to_an_unknown_chat():
    """Replying would confirm the bot exists to someone probing."""
    t = fake_transport([[upd(1, 999, "hello")]])
    p = TelegramPoller("tok", [111], transport=t)
    p.poll_once()
    assert all(m == "getUpdates" for m, _ in t.calls), "only polling, never sending"


def test_offset_advances_past_dropped_messages():
    """A dropped message must still be acknowledged, or it is re-fetched
    forever and the poller wedges."""
    seen = {}
    t = fake_transport([[upd(7, 999, "spam")]])
    p = TelegramPoller("tok", [111], transport=t,
                       get_offset=lambda: seen.get("o", 0),
                       set_offset=lambda v: seen.__setitem__("o", v))
    p.poll_once()
    assert seen["o"] == 8


def test_offset_survives_a_restart_via_the_ledger():
    """Telegram redelivers un-acknowledged updates. Without persistence a
    restart replays the backlog — yesterday's `quiet 8h` would fire again."""
    led = Ledger(":memory:")
    get = lambda: int(led.get_meta("telegram_offset", "0"))
    setr = lambda v: led.set_meta("telegram_offset", str(v))

    t1 = fake_transport([[upd(41, 111, "status")]])
    TelegramPoller("tok", [111], transport=t1, get_offset=get, set_offset=setr).poll_once()
    assert led.get_meta("telegram_offset") == "42"

    # "restart": a brand new poller reading the same ledger
    t2 = fake_transport([[]])
    TelegramPoller("tok", [111], transport=t2, get_offset=get, set_offset=setr).poll_once()
    assert t2.calls[0][1]["offset"] == 42


def test_offset_does_not_regress_on_an_empty_batch():
    seen = {"o": 100}
    t = fake_transport([[]])
    p = TelegramPoller("tok", [111], transport=t,
                       get_offset=lambda: seen["o"],
                       set_offset=lambda v: seen.__setitem__("o", v))
    p.poll_once()
    assert seen["o"] == 100


def test_a_not_ok_response_yields_nothing_and_does_not_raise():
    def bad(method, params):
        return {"ok": False, "description": "Unauthorized"}
    p = TelegramPoller("tok", [111], transport=bad)
    assert p.poll_once() == []


def test_non_text_updates_are_skipped():
    t = fake_transport([[{"update_id": 1, "message": {"chat": {"id": 111}}},
                         upd(2, 111, "status")]])
    p = TelegramPoller("tok", [111], transport=t)
    assert [m.text for m in p.poll_once()] == ["status"]


def test_drain_returns_and_clears():
    p = TelegramPoller("tok", [111], transport=fake_transport([]))
    from service.telegram import Incoming
    p.queue.put(Incoming(111, "a", 0.0, 1))
    p.queue.put(Incoming(111, "b", 0.0, 2))
    assert [m.text for m in p.drain()] == ["a", "b"]
    assert p.drain() == []
