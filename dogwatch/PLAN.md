# Dogwatch — monitoring system for two dogs, one paralysed

## Context

Two dogs share a room. One is paralysed with a spinal injury and lives mainly in a
cage; the other has free roam. They look very similar. The owner wants to know what
they're doing during the day — particularly whether the paralysed one is OK — and
wants to ask for a natural-language summary of recent activity on demand.

This differs from the original brief in one important way. The brief led with a
"stillness alert"; the stated goal is activity *tracking* plus an on-demand
`update` summary. So the system is built as **an activity journal with a query
interface**, and alerting is a secondary consumer of that journal rather than the
core. Stillness detection stays — for a paralysed dog, "hasn't changed position in
4 hours" is a real pressure-sore repositioning cue — but it ships last, tuned
against real recorded data instead of guessed thresholds.

**Where the code lives:** `Website-wand/dogwatch/`, branch
`claude/dog-monitoring-system-yxz1w5`. Neither existing repo is a natural home
(one is a florist site, one a business site) — say the word if you'd rather this
be its own repo and I'll set that up instead.

---

## The two decisions everything else rests on

### Identity by geography, not appearance

Frigate cannot distinguish two similar dogs, and no amount of config will change
that. But the cage does it for us:

| Observation | Identity | Confidence |
|---|---|---|
| Dog centroid inside `cage` zone, only one dog detected | `bramble` (cage) | `inferred` |
| Two dogs detected, one inside `cage` | in-cage one is `bramble` | `certain` |
| Dog outside `cage` while `bramble` known present in cage | `roamer` | `certain` |
| Single dog outside cage, cage empty/unknown | `roamer` | `inferred` |
| Two dogs both outside cage | both | `ambiguous` |

Every ledger row carries `identity_confidence`. The summariser prompt receives it
and is instructed to hedge accordingly. This is deliberate: the whole value of the
system is trustworthy information about a sick animal, and a fabricated certainty
would destroy that.

State is kept for whether the cage dog is *currently in the cage at all* — flipped
by two-dog observations, and manually via a Telegram `/out` and `/in` command for
physio, vet trips, and carry-outs.

### The biggest technical risk, and where we find out

**Will Frigate reliably detect a paralysed dog lying flat inside a barred crate?**
The COCO `dog` class is trained overwhelmingly on standing and sitting dogs. A
flat, partially occluded, bar-obscured dog is close to a worst case.

This is genuinely unknown until tested, and everything downstream depends on it.
Phase 1 exists purely to answer it, before a line of service code is written. If
detection turns out unreliable, the fallbacks in order of preference are: a lower
`threshold` scoped to the cage zone; repositioning the camera to shoot down into
the crate rather than through the bars; or falling back to Frigate motion events
(not object detection) inside the cage zone, which loses identity but keeps the
activity signal.

---

## Hardware

You have no RTSP camera, but you have plenty that can become one.

**Recommendation: a USB webcam plugged into the Geekom, published as RTSP by
go2rtc.** No battery, no app to get suspended, no phone taken out of service, and
it's already sitting next to the machine doing the detection. The iPhone becomes a
useful *second* angle later via an RTSP app, not the primary.

| Role | Machine |
|---|---|
| Frigate, MQTT, dogwatch, recordings | Geekom, always on, Docker |
| Watchdog — alerts if the Geekom or Frigate goes silent | Pi |
| Camera 1 | USB webcam → go2rtc on the Geekom |
| Camera 2 (later, optional) | iPhone running an RTSP app |

The Pi watchdog matters more than it looks: a monitoring system that dies silently
is worse than none, because you'll trust it. It's Phase 6 but it is not optional.

Detector: Geekom is almost certainly Intel — `openvino` on the iGPU. Confirmed at
build time from `lscpu`; if it's a Ryzen part we use CPU detection at reduced fps
and revisit.

---

## Frigate configuration

Pinned to a specific Frigate release, with the config written **against that
version's own docs**, not from recall. Frigate's config schema has shifted
materially across 0.13→0.16 (audio detection and review/alert config especially),
so the build step is: pin version → read that version's reference → write config →
validate via Frigate's config-check endpoint before trusting it.

Shape of `config.yml`:

- **go2rtc stream** — `ffmpeg:device?video=/dev/video0` publishing h264 + audio,
  so both Frigate and VLC consume one normalised source.
- **One camera** `dogs_main`, detect stream at 1280x720 / 5fps, record stream at
  native. Recording retention: 3 days continuous, 14 days for event segments.
- **Objects**: `dog` **and `person`**. Person is not decoration — a person in the
  cage zone is almost certainly you repositioning the dog. That resets the
  stillness timer and gets logged as a *care event*, which is exactly the context
  the summary needs to avoid reporting "no movement for 5 hours" when you
  physically turned him twice.
- **Zones**: `cage`, `bed_roam`, `doorway`, `water_food`. The water/food zone is
  cheap and gives the journal genuinely useful entries.
- **Audio**: `bark` and `dog` sound classes enabled, with `min_volume` tuned.
  Honest limitation — **audio detection is room-level, not per-dog.** Frigate
  cannot attribute a bark to a specific animal, and the plan does not pretend
  otherwise; barks are logged against the room and the summary says "barking in
  the room", never "Bramble barked". Expect false positives from TV and
  conversation; budget a tuning pass.

---

## The Python service

Three containers: `frigate`, `mosquitto`, `dogwatch`. Single asyncio loop in
`dogwatch`, no threads, no external queue.

```
   MQTT (frigate/events, frigate/+/audio/#)
          │
    ┌─────▼─────────┐
    │  MqttIngest   │  parse, filter, normalise
    └─────┬─────────┘
          │
    ┌─────▼─────────┐   short-lived, one per Frigate object id
    │ TrackRegistry │   centroid deque, zones, last-move, reaper
    └─────┬─────────┘
          │  identity resolution (cage geography)
    ┌─────▼─────────┐   exactly TWO, long-lived, survive track churn
    │  DogState ×2  │   state, state_since, stillness timer, last seen
    └─────┬─────────┘
          │
    ┌─────┼──────────────┬─────────────────┐
    │     │              │                 │
┌───▼──────────┐  ┌──────▼──────┐  ┌───────▼────────┐
│ActivityLedger│  │ AlertEngine │  │ CommandListener│
│   (SQLite)   │  │ incident FSM│  │  Telegram poll │
└───┬──────────┘  └──────┬──────┘  └───────┬────────┘
    │                    │                 │ /update
    │             ┌──────▼─────────────────▼────────┐
    └────────────►│ Summariser → Claude → Telegram  │
                  └─────────────────────────────────┘
```

### How state is held — the part that's easy to get wrong

**A Frigate track is not a dog.** Frigate object ids die and are reborn constantly
on occlusion, on leaving frame, on a dog lying flat and dropping below threshold.
A still dog gets re-acquired repeatedly.

This is why there are two layers. If the stillness timer lived on the *track*, it
would reset every time Frigate re-acquired the dog — and would therefore **never
fire**, silently, forever. It lives on `DogState`, which is one of exactly two
long-lived objects that outlive any number of tracks.

- `Track` — `deque` of `(ts, cx, cy, w, h)` bounded at ~600 samples, current
  zones, score, first/last seen. Evicted on `end`, or by a reaper for tracks stale
  beyond a timeout (Frigate does drop end events).
- `DogState` — `current_track_id | None`, `state` (`active` / `resting` /
  `out_of_view`), `state_since`, `last_position`, `last_significant_move_ts`,
  `in_cage`, plus incident state.

**Centroids are stored normalised (0.0–1.0), not in pixels.** A pixel threshold
silently becomes wrong the moment you change camera resolution or swap the camera.
The YAML still expresses thresholds in pixels-at-a-reference-resolution because
that's how humans think about it, and it's converted once at config load.

### SQLite — three tables, two granularities

- `events` — append-only raw log. Every MQTT event of interest, with `raw_json`
  retained. This is the thing you'll be glad you have when a rule misbehaves.
- `activity_minutes` — **one row per dog per minute**: state, movement distance,
  zones occupied, detection count, bark count, person-present flag. This rollup is
  what makes `/update` fast and cheap: six hours is ~360 rows per dog instead of
  tens of thousands of raw events.
- `alerts` — incident history and cooldown bookkeeping.

WAL mode. The minute rollup is flushed by a background timer, not per-event.

### Alerting — debounce as a state machine

Each rule produces an `Incident` with an explicit FSM:

```
clear ──(condition true)──► pending ──(held for confirm_for)──► notified
  ▲                            │                                   │
  └────(condition false)───────┘                          (cooldown_s elapsed
                                                        + condition false) ──► clear
```

`confirm_for` kills flapping; `cooldown_s` kills repeat spam; one notification per
incident, with an optional single "resolved" message. Rules: stillness (zone-
exempt), absence-from-view, bark burst.

### The `/update` summariser

Triggered by `update` or `/update` in Telegram. Also `/status` for an instant
no-LLM state dump, and `/quiet 2h`.

**Honest scoping: this summarises stills and structured data, not video.** Sending
hours of footage to a model is neither practical nor affordable, and it isn't
necessary. What actually gets sent:

1. The `activity_minutes` rows for the window (default 6h), compressed into runs —
   `09:12–10:48 resting in cage, no position change; 10:48–10:51 active`.
2. **6–8 still frames**, sampled across the window from Frigate's stored event
   snapshots, ~600px wide.
3. A system prompt stating the two dogs look alike, that identity is inferred from
   location, that confidence levels are attached, and that it must report
   observable behaviour and **not** offer veterinary diagnosis.

Model: `claude-opus-5`, adaptive thinking, `output_config: {effort: "low"}` —
low effort is right for summarisation and is a cost lever that doesn't change
models. Server-side refusal fallback enabled. Stable system prompt gets a cache
breakpoint.

Cost, roughly: ~8 images (~8k tokens) + timeline (~3k) in, ~800 out.
At $5/M in and $25/M out that's **≈ $0.06–0.08 per update** — a few pence. Several
updates a day is comfortably under $10/month.

Implementation reads `python/claude-api/README.md` from the `claude-api` skill
before writing the call; the API surface has moved recently and it is not written
from memory.

### Configuration

Single `dogwatch.yml`: mqtt, frigate url, dogs and their identity rules, zone
meanings, per-rule thresholds/confirm/cooldown, summariser window and effort,
storage paths, chat ids.

**Secrets are not in the YAML** — Telegram bot token and Anthropic key come from
env/`.env`, because the YAML is going into git and a bot token in a repo is a bot
someone else owns.

---

## Build order

Each phase produces the information needed to make the next phase's decisions.
That's the whole point of the ordering — the alternative is guessing thresholds
against data that doesn't exist yet.

**Phase 0 — one stream.** Webcam → go2rtc → an RTSP URL. *Verify:* VLC plays it;
`ffprobe` reports a video stream and shows whether there's a usable audio track.
Nothing else gets built until this is solid.

**Phase 1 — Frigate seeing dogs.** Frigate + mosquitto, one camera, `dog` +
`person`, recording on. *Verify:* leave it running a full day, then review what it
caught and missed — **especially the paralysed dog lying in the crate.** Tune
threshold, check inference speed and CPU. This is the phase that tells you whether
the camera is in the wrong place, which is why no service code exists yet.

**Phase 2 — watch the MQTT firehose.** A ~50-line script subscribing to
`frigate/#` that pretty-prints. Run it an hour. *Verify:* you see how often object
ids churn, whether `current_zones` is trustworthy, what boxes look like. Phase 3's
design gets made from this data rather than my assumptions.

**Phase 3 — ledger only, zero alerts.** TrackRegistry, DogState, SQLite, `/status`.
No notifications at all. Run 2–3 days. *Verify by querying the DB:* does the
cage/roam identity split actually hold? What fraction of observations came out
`ambiguous`? This de-risks the hardest part with no possibility of alert spam.

**Phase 4 — the `/update` summariser.** Reads the ledger Phase 3 already filled.
Deliberately before alerts: it's the feature you actually want most, and it's
read-only over existing data, so it's the lowest-risk thing in the project.

**Phase 5 — alerts.** Stillness, absence, bark bursts, with the incident FSM.
Ships in **shadow mode first** — logs what it *would* have sent for a day, you
review that list, and only then does it get permission to send. Thresholds come
from the several days of real data now sitting in SQLite.

**Phase 6 — hardening.** Pi watchdog for Frigate silence, disk retention policy,
restart policies, a DB backup.

---

## Verification

- **Phase 0:** `ffprobe rtsp://…` shows streams; VLC renders.
- **Phase 1:** Frigate UI shows dog events at usable scores in cage *and* on open
  floor; inference speed and detector load within budget over 24h.
- **Phase 2:** raw MQTT dump reviewed by eye for id churn and zone accuracy.
- **Phase 3:** SQL over `activity_minutes` — identity split holds, ambiguity rate
  acceptable, minute rollup matches what the recordings show for a spot-checked
  hour.
- **Phase 4:** `/update` against a window whose footage you've watched, and check
  the summary against what actually happened. Confirm it hedges when identity was
  `inferred`.
- **Phase 5:** a day of shadow-mode alert logs reviewed before enabling sends;
  unit tests over the incident FSM with synthetic event sequences (fires once,
  respects cooldown, resets on person-in-cage).
- **Phase 6:** kill the Frigate container and confirm the Pi notices and tells you.

---

## Stated limitations

- Bark events are **room-level**, never per-dog. Frigate cannot attribute audio.
- Identity is inferred from location and will be `ambiguous` when both dogs are
  loose together. Logged honestly rather than guessed.
- Reliable detection of a flat dog behind bars is unproven until Phase 1.
- This is a welfare-monitoring convenience, not a medical device. It should never
  be the only thing standing between a sick animal and a vet.
