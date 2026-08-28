# Setting up Dogwatch

Roughly an hour of actual work, spread over two days — because two of the steps
are "leave it running and see what happens", and those are the steps that matter
most.

Everything runs on the Geekom. At any point, this tells you what is wrong:

```bash
python3 -m service --config dogwatch.yml doctor
```

It exits non-zero if something is blocking, so you can keep re-running it until
it's quiet.

---

## Before you start

- [ ] A **USB webcam** plugged into the Geekom. If it has a microphone, you also
      get bark detection; if not, everything else still works.
- [ ] **Docker** installed.
- [ ] A **Telegram account** (free).
- [ ] Optional: an **Anthropic API key**, for the `update` summary. Everything
      else works without it.

### Get the code and install everything

On the Geekom, running **Linux** (see the note below if it came with Windows):

```bash
git clone -b claude/dog-monitoring-system-yxz1w5 \
  https://github.com/Roowandster1/Website-wand.git
cd Website-wand/dogwatch
./install.sh
```

`install.sh` installs ffmpeg, v4l-utils, Docker, sqlite3 and the Python
dependencies, creates `.env` and `dogwatch.yml` from the examples, lists your
camera and its supported resolutions, and finishes by running the doctor. It is
idempotent — re-run it whenever you like, it will not overwrite a config you
have edited.

The code lives in the `dogwatch/` folder of a website repo, which is an odd
home for it. It is entirely self-contained, so it can be split into its own
repository whenever you want.

> **If the Geekom came with Windows** — most do — you have three options. The
> constraint is narrower than "Windows doesn't work": a **USB webcam** cannot be
> passed through to Docker on Windows. Video arriving over the network is fine.
>
> | Route | Camera | Trade |
> |---|---|---|
> | **Ubuntu on the Geekom** | USB webcam | Best. Full speed, hardware acceleration. ~1 hour to install |
> | Keep Windows + Docker Desktop | network/RTSP only | An old phone running an RTSP app, or a cheap wifi camera. CPU detection only |
> | Raspberry Pi | USB webcam | Works today, Geekom untouched. One camera, low fps, external disk for recordings |
>
> `install.sh` refuses to run where it cannot work rather than half-installing.
> The step-by-step Ubuntu install is in the setup checklist.

---

## Step 1 — Get a picture (15 min)

Nothing else matters until this works.

```bash
v4l2-ctl --list-devices          # find your camera, usually /dev/video0
arecord -l                       # microphones, if any
./tools/check_stream.sh /dev/video0
```

That last command prints the resolutions your camera actually supports. Put one
of them into the `go2rtc` line in `frigate/config.yml`:

```yaml
go2rtc:
  streams:
    dogs_main:
      - "ffmpeg:device?video=0&video_size=1280x720#video=h264"
```

Then start Frigate and check the stream:

```bash
docker compose up -d mosquitto frigate
./tools/check_stream.sh                       # checks the RTSP restream
vlc rtsp://127.0.0.1:8554/dogs_main
```

**Gate: you can see your dogs in VLC.** If `check_stream.sh` warns that there is
no audio track, bark detection won't work — either add the audio input (the
commented line in `frigate/config.yml`) or accept it and move on.

---

## Step 2 — Teach Frigate the room (20 min, then leave it a day)

Open **http://localhost:8971** → Settings → Debug → Zones, and draw:

| Zone | Where | Why it matters |
|---|---|---|
| `cage` | tightly around the crate interior | **This is how the dogs are told apart.** Everything depends on it |
| `bed_roam` | the roaming dog's bed | stillness there is normal, and exempt from alerts |
| `water_food` | around the bowls | care tracking |
| `doorway` | the door | tells the journal who came and went |

Paste the coordinates it gives you into `frigate/config.yml`, replacing the
placeholders, then `docker compose restart frigate`.

**Camera placement matters more than anything else here.** Frigate's detector was
trained mostly on standing and sitting dogs; a paralysed dog lying flat behind
crate bars is close to a worst case. If you can, point the camera **down into the
crate** rather than through the bars.

Now leave it running for a full day and look at the Explore tab.

**Gate: does it reliably detect the paralysed dog lying in the crate?**
This is the one question that decides whether the whole thing is useful. If it
doesn't, in order of preference: lower `objects.filters.dog.min_score`, move the
camera to look down into the crate, or fall back to motion events in the cage
zone (which loses identity but keeps the activity signal).

While you're there: Settings → Debug → **Audio** shows live RMS levels. Set
`audio.min_volume` just above your room's quiet baseline, or you will detect the
television.

---

## Step 3 — Watch the real data (1 hour)

```bash
python3 tools/mqtt_watch.py --out phase2.jsonl
# leave it an hour, ideally a day. Ctrl-C for the report.
```

It answers, from your room rather than my assumptions: how much object ids churn,
how long a still dog goes between updates, whether zones are trustworthy, and how
often the crate actually separates the two dogs.

**Take the p95 gap it reports and put it in `dogwatch.yml`** as
`tracking.live_window_seconds`. Too small and a dog lying plainly in view gets
scored as absent.

Then replay your own data through the whole pipeline:

```bash
python3 tools/replay.py phase2.jsonl --timeline
```

---

## Step 4 — Telegram (10 min)

1. Message **@BotFather** on Telegram, send `/newbot`, follow the prompts.
2. Put the token in `.env` as `TELEGRAM_BOT_TOKEN`.
3. Find your chat id:

```bash
python3 -m service --config dogwatch.yml telegram-setup
```

It waits for you to message the bot, then prints the id to paste into
`dogwatch.yml`. **Only listed ids are answered** — a bot token is effectively
public, and without that allowlist a stranger could send `quiet 8h` and silently
disable your monitor.

---

## Step 5 — Name the dogs and start the service

In `dogwatch.yml`, set both `name:` fields. They appear in every alert and
summary.

```bash
python3 -m service --config dogwatch.yml doctor      # should be quiet now
docker compose up -d
```

Send `status` to your bot. You should get an instant reply.

Dashboard: **http://\<geekom\>:8080**

> Read-only, but **unauthenticated** — it reveals when the house is empty. Keep
> it on your LAN; don't port-forward it.

---

## Step 6 — Leave it in shadow mode for a day

`alerts.shadow_mode: true` is the default. The service records every alert it
*would* have sent and sends nothing.

After a day:

```bash
sqlite3 storage/dogwatch.db \
  "SELECT datetime(ts,'unixepoch','localtime'), rule, subject, action, detail
   FROM alerts ORDER BY ts;"
```

Read that list and ask: *would I have wanted every one of these on my phone?*
Tune the thresholds in `dogwatch.yml` until the answer is yes. Only then:

```yaml
alerts:
  shadow_mode: false
```

On the simulated days, a normal day produces **zero** notifications and an
incident day produces three. If your real numbers are wildly different, the
thresholds need work — not the code.

---

## Step 7 — The summary (optional)

Put `ANTHROPIC_API_KEY` in `.env`, then prove the wiring before you rely on it:

```bash
python3 -m service --config dogwatch.yml test-summary --hours 6
```

One real API call, printing the summary and what it cost (~$0.06). If it reads
sensibly, `update` in Telegram does the same thing.

---

## Daily use

```
update [6h]   what have they been doing
status        instant, free, no AI call
quiet 2h      mute alerts (quiet 0 to unmute)
out / in      the crated dog has left / come back

pee / poo     bladder expression, bowel movement
fed / water   meals and drinks
meds          medication
```

Care words take a note: `pee slightly cloudy`. The reply tells you how long since
the last one — the useful part on a bladder schedule.

---

## When something breaks

| Symptom | Try |
|---|---|
| anything at all | `python3 -m service --config dogwatch.yml doctor` |
| no dogs detected | Frigate UI → Explore. Lower `dog.min_score`, or move the camera |
| the wrong dog named | check the `cage` zone is tight around the crate |
| bark spam | raise `audio.min_volume` (Settings → Debug → Audio) |
| alerts too chatty | raise `after_minutes`, or `confirm_for_seconds` |
| nothing on Telegram | `doctor` checks the token; is your chat id in `dogwatch.yml`? |
| service won't start | `docker logs dogwatch-service` |

---

## Two things to keep in mind

**This is a welfare-monitoring convenience, not a medical device.** It should
never be the only thing between a sick animal and a vet.

**It cannot see everything.** Barks are room-level and can't be attributed to a
dog. Identity is inferred from location and degrades to "not sure" when both dogs
are loose together. Zone visits mean a dog was *at* the bowl, never that it drank.
The summaries are written to hedge accordingly — a confident but wrong claim
about a sick animal is the worst thing this could do.
