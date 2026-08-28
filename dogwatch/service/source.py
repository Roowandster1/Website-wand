"""Event sources.

Replay and live MQTT present the same interface, so the entire pipeline can be
exercised against a recorded capture with no broker, no camera and no waiting.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator, NamedTuple


class Msg(NamedTuple):
    ts: float
    topic: str
    payload: str


def replay(path: str | Path) -> Iterator[Msg]:
    """Yield messages from a tools/mqtt_watch.py --out capture."""
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if "topic" not in rec or "payload" not in rec:
                continue
            yield Msg(float(rec.get("t", 0.0)), str(rec["topic"]), str(rec["payload"]))


def mqtt_stream(host: str, port: int, topic: str, client_id: str,
                queue_size: int = 10000) -> Iterator[Msg]:
    """Yield live messages from the broker. Blocks."""
    import queue
    import time

    import paho.mqtt.client as mqtt

    q: "queue.Queue[Msg]" = queue.Queue(maxsize=queue_size)

    def on_connect(client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            client.subscribe(topic)
            client.publish("frigate/onConnect", "")

    def on_message(client, userdata, msg):
        try:
            q.put_nowait(Msg(time.time(), msg.topic,
                             msg.payload.decode("utf-8", errors="replace")))
        except queue.Full:
            pass          # drop rather than block the network thread

    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    c.on_connect = on_connect
    c.on_message = on_message
    c.connect(host, port, keepalive=60)
    c.loop_start()
    try:
        while True:
            try:
                yield q.get(timeout=1.0)
            except queue.Empty:
                yield Msg(time.time(), "__tick__", "")
    finally:
        c.loop_stop()
        c.disconnect()
