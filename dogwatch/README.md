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
├── docker-compose.yml        Frigate 0.17.2 + Mosquitto + the service
├── Dockerfile
├── frigate/config.yml        camera, zones, dog+person detection, bark audio
├── mosquitto/mosquitto.conf
├── dogwatch.yml.example      service config — copy to dogwatch.yml
├── .env.example              secrets — copy to .env, never committed
├── service/
│   ├── models.py             Detection, Track, DogState, Incident
│   ├── config.py             strict config loading and validation
│   ├── tracking.py           track registry + identity resolution
│   ├── ledger.py             SQLite: raw events, minute rollup, run compression
│   ├── rules.py              alert rules and the incident state machine
│   ├── summarise.py          the /update digest and Claude call
│   ├── commands.py           command parsing, care logging, responses
│   ├── telegram.py           long-polling, offset persistence, chat allowlist
│   ├── dashboard.py          local read-only web dashboard (stdlib only)
│   ├── frigate.py            snapshot client
│   ├── notify.py             Telegram / shadow / log sinks
│   ├── source.py             live MQTT and replay, same interface
│   └── app.py                wiring
├── tests/                    121 tests, no broker or camera required
└── tools/
    ├── check_stream.sh       Phase 0 — prove the camera works
    ├── mqtt_watch.py         Phase 2 — characterise the real event stream
    ├── simulate_day.py       generate a realistic 24h capture
    └── replay.py             run a capture through the whole pipeline
```

## Setting it up

**[SETUP.md](SETUP.md)** is the step-by-step guide. At any point:

```bash
python3 -m service --config dogwatch.yml doctor
```

checks the camera, broker, Frigate, zones, credentials and config, says what is
wrong and what to do about it, and exits non-zero if something is blocking.

## Working on it without hardware

The entire pipeline runs offline against a recorded or simulated capture. A
simulated day completes in about 0.2 seconds, so rule changes can be checked
immediately.

```bash
pip install -r requirements.txt
python3 -m pytest tests/ -q

# generate a day and run it through everything
python3 tools/simulate_day.py --scenario incident --out day.jsonl
python3 tools/replay.py day.jsonl --timeline --digest
```

Scenarios: `normal` (good care all day), `incident` (nobody repositions the
crated dog all afternoon), `ambiguous` (both dogs loose together, identity
should degrade rather than guess).

`--digest` prints exactly what `/update` would send to Claude, and the estimated
cost, without making an API call.

Once you have a real capture from Phase 2, replay that instead — it is the same
command, and far better evidence than any simulation.

## CLI

```bash
python -m service --config dogwatch.yml doctor         # check the whole setup
python -m service --config dogwatch.yml telegram-setup # find your chat id
python -m service --config dogwatch.yml test-summary   # one real Claude call
python -m service --config dogwatch.yml validate       # check config, exit
python -m service --config dogwatch.yml replay f.jsonl
python -m service --config dogwatch.yml digest --hours 6
python -m service --config dogwatch.yml run            # live
```

## Telegram commands

```
update [6h]   summarise what the dogs have been doing
status        instant state — no model call, free
quiet 2h      mute alerts for a while (quiet 0 to unmute)
out / in      the crated dog has left / returned

pee / poo     bladder expression, bowel movement
fed / water   meals and drinks
meds          medication given
```

`update` works as a bare word, not just `/update`. Any care word takes an
optional note: `pee slightly cloudy`. The reply tells you how long since the last
one of that kind — which for a bladder-expression schedule is the useful part.

**Only the chat ids in `dogwatch.yml` are answered.** A bot token is effectively
public; without that allowlist a stranger could send `quiet 8h` and silently
disable the monitor. Unknown chats are ignored with no reply at all.

## The morning summary

Quiet hours deliberately silence overnight alerts, so `daily_summary` is where
you find out what you missed. It leads with anything that was suppressed. The
last-sent date is stored in the database, so a restart cannot send it twice, and
a reboot at 20:00 will not fire a "morning" summary in the evening.

## Dashboard

`http://<geekom>:8080` — activity bands per dog, identity confidence over time,
bark counts, the care log and alert history, with a table view for everything.

Care events appear as ticks on the activity band. That matters: a crated dog
that lies still all day is one flat bar, and the ticks are what show the day
actually had a shape.

> **Read-only, but unauthenticated.** It reveals when the house is empty. Keep it
> on your LAN and do not port-forward it. The page makes no external requests at
> all — no CDN, no fonts, no telemetry — so it works with the internet down.

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

### Phase 3 — the ledger

**Built.** TrackRegistry → DogState → SQLite, plus `status`. Run it for 2–3 days
with `shadow_mode: true`, then query the database: does the identity split hold
in practice?

```sql
-- how often could we actually tell the dogs apart?
SELECT dog, confidence, COUNT(*) FROM activity_minutes
WHERE state != 'out_of_view' GROUP BY dog, confidence;
```

Set `tracking.live_window_seconds` from the p95 gap Phase 2 reported before
trusting any of these numbers.

### Phase 4 — the `/update` summariser

**Built.** Reads the ledger. Sends a compressed timeline plus up to 8 sampled
still frames to Claude — **stills and structured data, not video.** Measured at
roughly **$0.06 per update** on the simulated days.

Check the digest before spending anything: `python3 tools/replay.py day.jsonl --digest`.

### Phase 5 — alerts

**Built, shipping in shadow mode.** Alerts can also be muted on demand with
`quiet 2h`; muted and quiet-hour occurrences are still recorded and still reach
the morning summary, so silencing your phone never silences the record. Stillness, absence, bark bursts and a
Frigate-silence dead-man's switch, each with an incident state machine
(`confirm_for` kills flapping, `cooldown` kills repeats).

`alerts.shadow_mode: true` records what it *would* have sent and sends nothing.
Read a full day of that before flipping it. Thresholds in `dogwatch.yml` are
starting points, not recommendations — tune them against your own recorded data.

**Quiet hours are on by default** (22:30–07:00, suppressing `stillness` and
`bark_burst`). Replaying a normal day showed a stillness alert at 04:02 on an
otherwise fine night: correct in principle, but an alert that wakes you at 4am
for a non-emergency gets the system muted, after which it protects nothing.
Suppressed occurrences are still recorded, so the morning `update` can tell you
he did not shift all night. `absence` and `frigate_silent` are never silenced.

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
  events. A long gap on a *continuous* track id is read as stillness; a long gap
  with a *new* track id is read as "we lost him", and re-anchors rather than
  claiming a stillness duration nobody observed.
- Everything is tested against simulated and replayed data. **None of it has met
  a real camera yet** — Phase 0 and 1 are still the gates that matter.

---

## Versions

Frigate is pinned to **0.17.2** (stable, 2026-06-28) and `frigate/config.yml`
declares `version: 0.17-0`. Frigate changes config keys between minor versions —
if you bump the image tag, read that release's notes and re-validate the config
before trusting it.
