# Dogwatch

Activity monitoring for two dogs — one paralysed and mainly crated, one with free
roam — built on Frigate NVR, MQTT and a custom Python service.

The goal is an **activity journal you can ask questions of**, not an alarm system.
Send `update` on Telegram and get a summary of what the dogs have been doing.
Alerting exists, but it is a secondary consumer of the journal and ships last.

> **This is a welfare-monitoring convenience, not a medical device.** It should
> never be the only thing between a sick animal and a vet.

---

## How the dogs are told apart

They look alike, and no detector will separate them. **Location does it instead:**
a dog in the crate is the paralysed one, a dog on the floor is the roamer.

Frigate decides zone membership using the **bottom centre** of the bounding box,
which is what we want — a dog lying flat still has its bottom edge on the crate
floor.

Every observation is stored with an `identity_confidence`:

| Situation | Identity | Confidence |
|---|---|---|
| Two dogs visible, one in the crate | both known | `certain` |
| One dog visible, in the crate | crated dog | `inferred` |
| One dog visible, outside the crate | roamer | `inferred` |
| Two dogs visible, neither or both in the crate | unknown | `ambiguous` |

The `/update` summariser is given this and told to hedge accordingly. A
confidently wrong summary about a sick dog is worse than an honest uncertain one.

---

## Layout

```
dogwatch/
├── docker-compose.yml        Frigate 0.17.2 + Mosquitto
├── frigate/config.yml        camera, zones, dog+person detection, bark audio
├── mosquitto/mosquitto.conf
├── dogwatch.yml.example      service config (Phase 3+)
├── .env.example              secrets — copy to .env, never committed
└── tools/
    ├── check_stream.sh       Phase 0 — prove the camera works
    └── mqtt_watch.py         Phase 2 — characterise the real event stream
```

---

## Build order

Each phase produces the information the next phase needs. **Do not skip ahead** —
the thresholds in `dogwatch.yml` are meant to come from your recorded data, not
from a guess.

### Phase 0 — one working stream

Nothing else matters until this works.

```bash
cp .env.example .env          # fill in TZ at minimum

# What camera do you have, and what can it do?
v4l2-ctl --list-devices
ffmpeg -f v4l2 -list_formats all -i /dev/video0
arecord -l                    # microphones — needed for bark detection

./tools/check_stream.sh /dev/video0
```

Set `video_size` in the `go2rtc` block of `frigate/config.yml` to a resolution the
camera actually reports. Then:

```bash
docker compose up -d
./tools/check_stream.sh       # checks rtsp://127.0.0.1:8554/dogs_main
vlc rtsp://127.0.0.1:8554/dogs_main
```

**Gate:** ffprobe reports a video stream and VLC plays it.
If there is no *audio* stream, bark detection cannot work — uncomment the audio
variant of the go2rtc line, adjust `hw:1,0` to match `arecord -l`, and re-check.
Find this out now, not in Phase 5.

### Phase 1 — Frigate seeing dogs

Open <http://localhost:8971>, then draw your zones in
**Settings → Debug → Zones** and paste the coordinates into `frigate/config.yml`.
The placeholder coordinates in there are guesses and will be wrong for your room.
Draw `cage` tightly around the crate interior — everything downstream depends on it.

Leave it running a full day, then review what it caught in the Explore tab.

**Gate — the biggest risk in the project:** does Frigate reliably detect the
paralysed dog lying flat inside the crate? A COCO-trained detector sees mostly
standing and sitting dogs; flat, occluded and behind bars is close to a worst
case. If detection is unreliable, in order of preference:

1. Lower `objects.filters.dog.min_score` further and re-test.
2. **Move the camera to look down into the crate** rather than through the bars.
3. Fall back to motion events inside the cage zone — loses identity, keeps the
   activity signal.

Also check: inference speed and CPU load in **Settings → Metrics**, and live RMS
levels in **Settings → Debug → Audio** to set `audio.min_volume` just above your
room's quiet baseline. Set it too low and you will detect the television.

### Phase 2 — characterise the real event stream

```bash
pip install -r tools/requirements.txt
python3 tools/mqtt_watch.py --out phase2.jsonl
# leave running at least an hour, ideally a full day. Ctrl-C for the report.
```

It answers, from your data:

- **Q1** How much do object ids churn? (One dog = one track, or many?)
- **Q2** When a dog goes still, how long until the next update? Frigate stops
  running detection on stationary objects, so a still dog goes quiet. If the p95
  gap approaches your alert threshold, the service must poll Frigate's HTTP API
  rather than wait for MQTT.
- **Q3** Is `current_zones` trustworthy?
- **Q4** How often is the cage/roam split unambiguous?
- **Q5** What is the real bark rate, and is it mostly the TV?

Re-run the analysis on the capture any time, without a broker:

```bash
python3 tools/mqtt_watch.py --replay phase2.jsonl
```

**Feed the answers into `dogwatch.yml`.** In particular set
`tracking.live_window_seconds` above the p95 gap from Q2 — the default of 180s is
a starting point, and a window that is too short scores a dog that is plainly
lying there as absent.

**Gate:** you can state, from your own data, how often identity is ambiguous.

### Phase 3 — the ledger, no alerts

TrackRegistry → DogState → SQLite, plus a `/status` command. **No notifications
at all.** Run 2–3 days, then query the database: does the identity split hold in
practice? De-risks the hardest part with no possibility of alert spam.

### Phase 4 — the `/update` summariser

Reads the ledger Phase 3 has been filling. Deliberately before alerts: it is the
feature you actually want, and it is read-only over data that already exists.

Sends a compressed activity timeline plus 6–8 sampled still frames to Claude —
**stills and structured data, not video.** Roughly $0.06–0.08 per update.

### Phase 5 — alerts

Stillness, absence, bark bursts, with a proper incident state machine
(`confirm_for` kills flapping, `cooldown` kills spam). Ships with
`alerts.shadow_mode: true` — it logs what it *would* have sent for a day, you read
that log, and only then does it get permission to send.

### Phase 6 — hardening

Pi watchdog for Frigate silence, disk retention, restart policies, DB backup.

---

## Known limitations

- **Bark events are room-level.** Frigate cannot attribute a bark to a specific
  dog, and nothing here pretends otherwise.
- **Identity is inferred from location** and will be `ambiguous` when both dogs
  are loose together. Logged honestly rather than guessed.
- **Reliable detection of a flat dog behind bars is unproven** until Phase 1.
- Frigate stops detecting on stationary objects, so a still dog produces few
  events. The service must poll as well as subscribe.

---

## Versions

Frigate is pinned to **0.17.2** (stable, 2026-06-28) and `frigate/config.yml`
declares `version: 0.17-0`. Frigate changes config keys between minor versions —
if you bump the image tag, read that release's notes and re-validate the config
before trusting it.
