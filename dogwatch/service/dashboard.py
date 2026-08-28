"""Read-only local dashboard.

Served from the box that holds the data. A hosted page could never read a SQLite
file on your Geekom, so this runs here, on the LAN.

stdlib `http.server` and inline SVG on purpose: **no new dependencies and no CDN**.
This machine is meant to run unattended for months, and every dependency is a
future breakage. The page makes no external requests at all.

SECURITY: read-only, but unauthenticated. It reveals when the house is empty.
Keep it on the LAN; do not port-forward it.
"""

from __future__ import annotations

import json
import logging
import socketserver
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .config import Config
from .ledger import Ledger

log = logging.getLogger("dogwatch.dashboard")


def build_payload(cfg: Config, ledger: Ledger, hours: float,
                  now: float | None = None) -> dict:
    now = time.time() if now is None else now
    start, end = now - hours * 3600, now
    names = {d.id: (d.name or d.id) for d in cfg.dogs}

    stats = ledger.summary_stats(start, end)
    room = stats.pop("__room__", None) or {}

    runs = [
        {"dog": r.dog, "state": r.state, "start": r.start_ts,
         "end": r.end_ts + 60, "minutes": r.minutes,
         "zones": list(r.zones), "confidence": r.confidence}
        for r in ledger.runs(start, end)
        if r.dog != "__room__"
    ]

    alerts = []
    for a in ledger.recent_alerts(start):
        if a["ts"] > end:
            continue
        action = a["action"]
        alerts.append({
            "ts": a["ts"], "rule": a["rule"], "subject": a["subject"],
            "action": action, "detail": a["detail"],
            # Whether the owner actually received it — the distinction the whole
            # quiet-hours design turns on.
            "seen": not (action.endswith("_quiet") or action.endswith("_muted")),
            "resolved": action.startswith("resolved"),
        })

    return {
        "generated_at": now,
        "start": start,
        "end": end,
        "hours": hours,
        "dogs": [{"id": d.id, "name": names[d.id], "paralysed": d.paralysed}
                 for d in cfg.dogs],
        "runs": runs,
        "alerts": alerts,
        "barks": [{"ts": h, "count": n} for h, n in ledger.barks_by_hour(start, end)],
        "room_barks": room.get("barks", 0),
        "care": [{"ts": c["ts"], "kind": c["kind"], "dog": c["dog"],
                  "note": c["note"] or "", "source": c["source"]}
                 for c in ledger.care_between(start, end)],
        "visits": [{"dog": v["dog"], "zone": v["zone"], "entered": v["entered_ts"],
                    "duration": v["duration"] or 0.0, "confidence": v["confidence"]}
                   for v in ledger.visits_between(start, end)],
        "stats": {k: v for k, v in stats.items()},
    }


def start_dashboard(cfg: Config, ledger: Ledger, tracker=None,
                    now_fn=None) -> ThreadingHTTPServer:
    """Start the server on a background thread. Returns it so it can be shut down."""

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            # The page loads nothing external; say so, so a stray URL cannot.
            self.send_header("Content-Security-Policy",
                             "default-src 'none'; style-src 'unsafe-inline'; "
                             "script-src 'unsafe-inline'; connect-src 'self'")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            u = urlparse(self.path)
            if u.path in ("/", "/index.html"):
                html = PAGE.replace("__DEFAULT_HOURS__",
                                    str(int(cfg.dashboard.default_hours)))
                self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
                return
            if u.path == "/api/timeline.json":
                q = parse_qs(u.query)
                try:
                    hours = float(q.get("hours", [cfg.dashboard.default_hours])[0])
                except ValueError:
                    hours = cfg.dashboard.default_hours
                hours = max(1.0, min(hours, 24 * 30))
                payload = build_payload(cfg, ledger, hours,
                                        now=now_fn() if now_fn else None)
                self._send(200, json.dumps(payload).encode("utf-8"),
                           "application/json; charset=utf-8")
                return
            self._send(404, b"not found", "text/plain")

        def log_message(self, fmt, *args):        # quieten stdlib access logging
            log.debug(fmt, *args)

    class Server(ThreadingHTTPServer):
        daemon_threads = True
        allow_reuse_address = True

    srv = Server((cfg.dashboard.host, cfg.dashboard.port), Handler)
    threading.Thread(target=srv.serve_forever, name="dashboard",
                     daemon=True).start()
    log.info("dashboard on http://%s:%d (read-only, no auth — keep it on the LAN)",
             cfg.dashboard.host, cfg.dashboard.port)
    return srv


# The whole page: no external requests, no CDN, no build step.
# Colours are the validated palette; "not detected" is deliberately a hatched
# neutral rather than a hue, because absence of knowledge must not look like a
# measurement.
PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dogwatch</title>
<style>
  :root {
    color-scheme: light;
    --plane:#f9f9f7; --surface:#fcfcfb;
    --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
    --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,0.10);
    --active:#2a78d6; --resting:#1baf7a; --absent:#e1e0d9;
    --c-certain:#256abf; --c-inferred:#5598e7; --c-ambiguous:#86b6ef;
    --critical:#d03b3b; --warning:#fab219; --good:#0ca30c;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --plane:#0d0d0d; --surface:#1a1a19;
      --ink:#fff; --ink-2:#c3c2b7; --muted:#898781;
      --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,0.10);
      --active:#3987e5; --resting:#199e70; --absent:#2c2c2a;
      --c-certain:#184f95; --c-inferred:#3987e5; --c-ambiguous:#86b6ef;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --plane:#0d0d0d; --surface:#1a1a19;
    --ink:#fff; --ink-2:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,0.10);
    --active:#3987e5; --resting:#199e70; --absent:#2c2c2a;
    --c-certain:#184f95; --c-inferred:#3987e5; --c-ambiguous:#86b6ef;
  }
  * { box-sizing: border-box; }
  body {
    margin:0; background:var(--plane); color:var(--ink);
    font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
  }
  .wrap { max-width:1100px; margin:0 auto; padding:24px 20px 64px; }
  header { display:flex; flex-wrap:wrap; gap:12px; align-items:baseline;
           justify-content:space-between; margin-bottom:4px; }
  h1 { font-size:20px; margin:0; font-weight:600; letter-spacing:-0.01em; }
  .sub { color:var(--muted); font-size:13px; }
  .controls { display:flex; gap:6px; flex-wrap:wrap; margin:16px 0 20px; }
  .controls button {
    font:inherit; font-size:13px; padding:5px 12px; cursor:pointer;
    background:var(--surface); color:var(--ink-2);
    border:1px solid var(--border); border-radius:999px;
  }
  .controls button[aria-pressed="true"] { background:var(--ink); color:var(--surface);
                                          border-color:var(--ink); }
  .card { background:var(--surface); border:1px solid var(--border);
          border-radius:10px; padding:18px 18px 14px; margin-bottom:18px; }
  .card h2 { font-size:14px; margin:0 0 2px; font-weight:600; }
  .card .note { color:var(--muted); font-size:12px; margin:0 0 14px; }
  .tiles { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); }
  .tile { background:var(--surface); border:1px solid var(--border);
          border-radius:10px; padding:14px 16px; }
  .tile .k { color:var(--muted); font-size:12px; }
  .tile .v { font-size:26px; font-weight:600; letter-spacing:-0.02em; margin-top:2px; }
  .tile .x { color:var(--ink-2); font-size:12px; }
  .legend { display:flex; gap:16px; flex-wrap:wrap; font-size:12px;
            color:var(--ink-2); margin:2px 0 12px; }
  .legend span { display:inline-flex; align-items:center; gap:6px; }
  .sw { width:11px; height:11px; border-radius:3px; display:inline-block; }
  svg { display:block; width:100%; overflow:visible; }
  .lbl { fill:var(--muted); font-size:11px; }
  .rowname { fill:var(--ink); font-size:13px; font-weight:600; }
  .band-lbl { fill:#fff; font-size:10px; font-weight:600; pointer-events:none; }
  table { border-collapse:collapse; width:100%; font-size:13px;
          font-variant-numeric:tabular-nums; }
  th,td { text-align:left; padding:6px 10px; border-bottom:1px solid var(--grid); }
  th { color:var(--muted); font-weight:600; font-size:12px; }
  .pill { display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px;
          border:1px solid var(--border); color:var(--ink-2); }
  #tip { position:fixed; pointer-events:none; opacity:0; transition:opacity .08s;
         background:var(--ink); color:var(--surface); font-size:12px; line-height:1.4;
         padding:7px 10px; border-radius:7px; max-width:280px; z-index:9; }
  .empty { color:var(--muted); font-size:13px; padding:8px 0; }
  details { margin-top:10px; } summary { cursor:pointer; color:var(--ink-2); font-size:13px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Dogwatch</h1>
      <div class="sub" id="range">loading…</div>
    </div>
    <button id="theme" class="pill" style="cursor:pointer;background:none">theme</button>
  </header>

  <div class="controls" id="ranges"></div>
  <div class="tiles" id="tiles"></div>

  <div class="card">
    <h2>Activity</h2>
    <p class="note">What each dog was doing. Hatched grey means not detected on
      camera &mdash; that is missing information, not an absent dog.</p>
    <div class="legend" id="legend"></div>
    <svg id="timeline"></svg>
  </div>

  <div class="card">
    <h2>Identity confidence</h2>
    <p class="note">The dogs look alike, so identity comes from location. This is
      how often that was actually certain.</p>
    <div class="legend" id="conflegend"></div>
    <svg id="confidence"></svg>
  </div>

  <div class="card">
    <h2>Barking</h2>
    <p class="note">Room-level. Frigate cannot tell which dog barked.</p>
    <svg id="barks"></svg>
  </div>

  <div class="card">
    <h2>Care and routine</h2>
    <p class="note">Logged by you, and zone presence seen by the camera &mdash;
      kept apart, because the camera cannot tell that a dog drank or toileted.</p>
    <div id="care"></div>
  </div>

  <div class="card">
    <h2>Alerts</h2>
    <div id="alerts"></div>
  </div>

  <details>
    <summary>Table view (all activity runs)</summary>
    <div class="card" style="margin-top:10px"><div id="table"></div></div>
  </details>
</div>
<div id="tip" role="status"></div>

<script>
const HOURS_DEFAULT = __DEFAULT_HOURS__;
const STATE = {
  active:      {c:"var(--active)",  label:"Active"},
  resting:     {c:"var(--resting)", label:"Resting"},
  out_of_view: {c:"var(--absent)",  label:"Not detected"}
};
const CONF = {
  certain:   {c:"var(--c-certain)",   label:"Certain"},
  inferred:  {c:"var(--c-inferred)",  label:"Inferred"},
  ambiguous: {c:"var(--c-ambiguous)", label:"Ambiguous"},
  "n/a":     {c:"var(--absent)",      label:"n/a"}
};
const PAD = {l:96, r:16, t:10, b:26};
const tip = document.getElementById("tip");
let data = null, hours = HOURS_DEFAULT;

const ZONE = {water_food:"water & food", bed_roam:"bed", cage:"crate",
              toilet_area:"toilet area", doorway:"doorway"};
const zn = z => ZONE[z] || z;
const dogName = id => (data.dogs.find(d => d.id===id)||{}).name || id;
const hhmm = t => new Date(t*1000).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
const dayhm = t => new Date(t*1000).toLocaleString([], {weekday:"short",hour:"2-digit",minute:"2-digit"});
const dur = m => m < 60 ? m+" min" : (m/60).toFixed(1)+" h";
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function showTip(e, html){ tip.innerHTML = html; tip.style.opacity = 1;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(e.clientX+14, innerWidth-r.width-10)+"px";
  tip.style.top  = Math.max(e.clientY-r.height-12, 8)+"px"; }
function hideTip(){ tip.style.opacity = 0; }

function el(tag, attrs, kids){
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in (attrs||{})) n.setAttribute(k, attrs[k]);
  (kids||[]).forEach(c => n.appendChild(c));
  return n;
}

function timeAxis(svg, W, y){
  const {start,end} = data, span = end-start;
  const stepH = span > 86400*3 ? 12 : span > 86400 ? 6 : span > 21600 ? 3 : 1;
  const step = stepH*3600;
  const first = Math.ceil(start/step)*step;
  for (let t=first; t<=end; t+=step){
    const x = PAD.l + (t-start)/span * (W-PAD.l-PAD.r);
    svg.appendChild(el("line",{x1:x,x2:x,y1:PAD.t,y2:y,stroke:"var(--grid)","stroke-width":1}));
    const lab = el("text",{x:x,y:y+16,"text-anchor":"middle",class:"lbl"});
    lab.textContent = span > 86400 ? dayhm(t) : hhmm(t);
    svg.appendChild(lab);
  }
}

function renderTimeline(){
  const svg = document.getElementById("timeline");
  svg.innerHTML = "";
  const W = svg.clientWidth || 900, ROW = 46, BAND = 30;
  const dogs = data.dogs, {start,end} = data, span = Math.max(end-start,1);
  const H = PAD.t + dogs.length*ROW + PAD.b;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("height", H);

  // Hatch for "not detected": absence of knowledge should not read as a value.
  const defs = el("defs");
  const pat = el("pattern",{id:"nodata",width:6,height:6,patternUnits:"userSpaceOnUse",
                            patternTransform:"rotate(45)"});
  pat.appendChild(el("rect",{width:6,height:6,fill:"var(--surface)"}));
  pat.appendChild(el("rect",{width:2.5,height:6,fill:"var(--absent)"}));
  defs.appendChild(pat); svg.appendChild(defs);

  timeAxis(svg, W, PAD.t + dogs.length*ROW);
  const x = t => PAD.l + (Math.max(start,Math.min(end,t))-start)/span*(W-PAD.l-PAD.r);

  dogs.forEach((d,i) => {
    const y = PAD.t + i*ROW;
    const nm = el("text",{x:0,y:y+BAND/2+5,class:"rowname"});
    nm.textContent = d.name; svg.appendChild(nm);

    svg.appendChild(el("rect",{x:PAD.l,y:y,width:W-PAD.l-PAD.r,height:BAND,
                               rx:5,fill:"var(--surface)",stroke:"var(--grid)"}));

    data.runs.filter(r => r.dog === d.id).forEach(r => {
      const x0 = x(r.start), x1 = x(r.end);
      const w = Math.max(x1-x0-2, 1);              // 2px surface gap between fills
      if (w <= 0) return;
      const st = STATE[r.state] || STATE.out_of_view;
      const fill = r.state === "out_of_view" ? "url(#nodata)" : st.c;
      const rect = el("rect",{x:x0,y:y,width:w,height:BAND,rx:4,fill:fill});
      rect.addEventListener("mousemove", e => showTip(e,
        `<b>${esc(d.name)} &middot; ${esc(st.label)}</b><br>` +
        `${hhmm(r.start)}&ndash;${hhmm(r.end)} (${dur(r.minutes)})<br>` +
        (r.zones.length ? `in ${esc(r.zones.map(zn).join(", "))}<br>` : "") +
        `identity: ${esc(r.confidence)}<br>` +
        `<span style="opacity:.7">state for the whole stretch &mdash; not the same as ` +
        `unbroken stillness</span>`));
      rect.addEventListener("mouseleave", hideTip);
      svg.appendChild(rect);

      // Direct label on wide runs — the relief the light-mode contrast needs.
      if (w > 74 && r.state !== "out_of_view"){
        const t = el("text",{x:x0+7,y:y+BAND/2+4,class:"band-lbl"});
        t.textContent = st.label.toLowerCase()+" "+dur(r.minutes);
        svg.appendChild(t);
      }
    });

    // Care events, as ticks on the band. Without these a dog that lay still
    // all day renders as one featureless bar, even on a day with six visits.
    data.care.filter(c => !c.dog || c.dog === d.id).forEach(c => {
      const cx = x(c.ts);
      const g = el("g");
      g.appendChild(el("line",{x1:cx,x2:cx,y1:y+BAND-9,y2:y+BAND,
                               stroke:"var(--surface)","stroke-width":3}));
      g.appendChild(el("line",{x1:cx,x2:cx,y1:y+BAND-8,y2:y+BAND,
                               stroke:"var(--ink)","stroke-width":1.5}));
      const L = {pee:"bladder expressed",poo:"bowel movement",fed:"fed",
                 water:"given water",meds:"medication"};
      g.addEventListener("mousemove", e => showTip(e,
        `<b>${esc(L[c.kind]||c.kind)}</b><br>${hhmm(c.ts)} &middot; logged by you` +
        (c.note ? `<br>&ldquo;${esc(c.note)}&rdquo;` : "")));
      g.addEventListener("mouseleave", hideTip);
      svg.appendChild(g);
    });

    // Alerts for this dog, as markers above its band.
    data.alerts.filter(a => a.subject === d.id && !a.resolved).forEach(a => {
      const ax = x(a.ts);
      const m = el("path",{d:`M${ax},${y-3} l5,-9 l-10,0 z`,
        fill: a.seen ? "var(--critical)" : "var(--warning)",
        stroke:"var(--surface)","stroke-width":1.5});
      m.addEventListener("mousemove", e => showTip(e,
        `<b>&#9650; ${esc(a.rule)}</b><br>${hhmm(a.ts)} &middot; ${esc(a.detail)}<br>` +
        (a.seen ? "sent to you" : "silenced &mdash; you were not notified")));
      m.addEventListener("mouseleave", hideTip);
      svg.appendChild(m);
    });
  });

  document.getElementById("legend").innerHTML =
    Object.values(STATE).map(s =>
      `<span><i class="sw" style="background:${s.c}"></i>${s.label}</span>`).join("") +
    `<span><i class="sw" style="background:var(--critical)"></i>Alert sent</span>` +
    `<span><i class="sw" style="background:var(--warning)"></i>Alert silenced</span>` +
    `<span><i class="sw" style="width:2px;border-radius:0;background:var(--ink)"></i>Care logged by you</span>`;
}

function renderConfidence(){
  const svg = document.getElementById("confidence");
  svg.innerHTML = "";
  const W = svg.clientWidth || 900, ROW = 30, BAND = 14;
  const dogs = data.dogs, {start,end} = data, span = Math.max(end-start,1);
  const H = PAD.t + dogs.length*ROW + PAD.b;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
  timeAxis(svg, W, PAD.t + dogs.length*ROW);
  const x = t => PAD.l + (Math.max(start,Math.min(end,t))-start)/span*(W-PAD.l-PAD.r);

  dogs.forEach((d,i) => {
    const y = PAD.t + i*ROW;
    const nm = el("text",{x:0,y:y+BAND,class:"rowname"}); nm.textContent = d.name;
    svg.appendChild(nm);
    data.runs.filter(r => r.dog === d.id && r.state !== "out_of_view").forEach(r => {
      const x0 = x(r.start), w = Math.max(x(r.end)-x0-2, 1);
      const c = CONF[r.confidence] || CONF["n/a"];
      const rect = el("rect",{x:x0,y:y,width:w,height:BAND,rx:3,fill:c.c});
      rect.addEventListener("mousemove", e => showTip(e,
        `<b>${esc(c.label)}</b><br>${hhmm(r.start)}&ndash;${hhmm(r.end)}<br>` +
        (r.confidence === "ambiguous"
          ? "both dogs visible, crate did not separate them"
          : r.confidence === "inferred"
            ? "one dog visible; position implies which"
            : "both dogs visible, exactly one in the crate")));
      rect.addEventListener("mouseleave", hideTip);
      svg.appendChild(rect);
    });
  });
  document.getElementById("conflegend").innerHTML =
    ["certain","inferred","ambiguous"].map(k =>
      `<span><i class="sw" style="background:${CONF[k].c}"></i>${CONF[k].label}</span>`).join("");
}

function renderBarks(){
  const svg = document.getElementById("barks"); svg.innerHTML = "";
  const W = svg.clientWidth || 900, H = 150, base = H-PAD.b;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
  const {start,end} = data, span = Math.max(end-start,1);
  const max = Math.max(1, ...data.barks.map(b => b.count));
  svg.appendChild(el("line",{x1:PAD.l,x2:W-PAD.r,y1:base,y2:base,
                             stroke:"var(--axis)","stroke-width":1}));
  const t0 = el("text",{x:PAD.l-8,y:PAD.t+10,"text-anchor":"end",class:"lbl"});
  t0.textContent = max+"/h"; svg.appendChild(t0);
  timeAxis(svg, W, base);
  const bw = Math.max(2, (W-PAD.l-PAD.r)/Math.max(data.barks.length,1) - 2);
  data.barks.forEach(b => {
    if (!b.count) return;
    const x = PAD.l + (b.ts-start)/span*(W-PAD.l-PAD.r);
    const h = (b.count/max)*(base-PAD.t-6);
    const r = el("rect",{x:x, y:base-h, width:bw, height:h, rx:3, fill:"var(--active)"});
    r.addEventListener("mousemove", e => showTip(e,
      `<b>${b.count} bark events</b><br>${dayhm(b.ts)}<br>room-level &mdash; not attributable to a dog`));
    r.addEventListener("mouseleave", hideTip);
    svg.appendChild(r);
  });
  if (!data.barks.some(b => b.count)){
    const t = el("text",{x:PAD.l,y:base/2,class:"lbl"});
    t.textContent = "no bark events in this window"; svg.appendChild(t);
  }
}

function renderTiles(){
  const box = document.getElementById("tiles");
  box.innerHTML = data.dogs.map(d => {
    const s = data.stats[d.id];
    if (!s) return `<div class="tile"><div class="k">${esc(d.name)}</div>
      <div class="v">&mdash;</div><div class="x">no data</div></div>`;
    const vis = s.visible_minutes || 0;
    const amb = vis ? Math.round(100*s.ambiguous_minutes/vis) : 0;
    return `<div class="tile">
      <div class="k">${esc(d.name)}${d.paralysed ? " &middot; paralysed" : ""}</div>
      <div class="v">${(s.longest_still_seconds/3600).toFixed(1)}h</div>
      <div class="x">longest unbroken stillness</div>
      <div class="x" style="margin-top:8px">on camera ${vis} of ${s.minutes} min
        &middot; identity unclear ${amb}%</div>
    </div>`;
  }).join("") + `<div class="tile">
      <div class="k">Room</div><div class="v">${data.room_barks||0}</div>
      <div class="x">bark events</div>
      <div class="x" style="margin-top:8px">${data.care.length} care entries logged</div>
    </div>`;
}

function renderCare(){
  const box = document.getElementById("care");
  const L = {pee:"bladder expressed",poo:"bowel movement",fed:"fed",
             water:"given water",meds:"medication"};
  let html = "<h3 style='font-size:13px;margin:0 0 6px'>Logged by you</h3>";
  html += data.care.length
    ? `<table><tr><th>Time</th><th>What</th><th>Note</th></tr>` +
      data.care.map(c => `<tr><td>${dayhm(c.ts)}</td><td>${esc(L[c.kind]||c.kind)}</td>
        <td>${esc(c.note)}</td></tr>`).join("") + "</table>"
    : `<div class="empty">Nothing logged in this window. That means nothing was
        typed in &mdash; not that nothing happened.</div>`;

  html += "<h3 style='font-size:13px;margin:16px 0 6px'>Seen by the camera</h3>";
  if (data.visits.length){
    const agg = {};
    data.visits.forEach(v => {
      const k = v.dog+"|"+v.zone;
      agg[k] = agg[k] || {dog:v.dog, zone:v.zone, n:0, secs:0};
      agg[k].n++; agg[k].secs += v.duration;
    });
    html += `<table><tr><th>Dog</th><th>Place</th><th>Visits</th><th>Total</th></tr>` +
      Object.values(agg).map(a => {
        const nm = dogName(a.dog);
        return `<tr><td>${esc(nm)}</td><td>${esc(zn(a.zone))}</td><td>${a.n}</td>
          <td>${Math.round(a.secs/60)} min</td></tr>`;}).join("") +
      `</table><div class="empty">Presence only &mdash; this shows a dog was there,
        never that it drank, ate or toileted.</div>`;
  } else html += `<div class="empty">No tracked zone visits in this window.</div>`;
  box.innerHTML = html;
}

function renderAlerts(){
  const box = document.getElementById("alerts");
  if (!data.alerts.length){ box.innerHTML = `<div class="empty">No alerts.</div>`; return; }
  box.innerHTML = `<table><tr><th>Time</th><th>Rule</th><th>Who</th><th>Detail</th>
    <th>Delivered</th></tr>` + data.alerts.map(a => `<tr>
      <td>${dayhm(a.ts)}</td><td>${esc(a.rule.replace(/_/g," "))}</td>
      <td>${esc(a.subject === "room" || a.subject === "system"
                ? a.subject : dogName(a.subject))}</td>
      <td>${esc(a.detail)}</td>
      <td>${a.resolved ? '<span class="pill">resolved</span>'
            : a.seen ? '<span class="pill">sent</span>'
                     : '<span class="pill">silenced</span>'}</td></tr>`).join("")
    + "</table>";
}

function renderTable(){
  document.getElementById("table").innerHTML =
    `<table><tr><th>Dog</th><th>From</th><th>To</th><th>State</th><th>Length</th>
      <th>Where</th><th>Identity</th></tr>` +
    data.runs.map(r => {
      return `<tr><td>${esc(dogName(r.dog))}</td><td>${dayhm(r.start)}</td>
        <td>${dayhm(r.end)}</td>
        <td>${esc((STATE[r.state]||{}).label||r.state)}</td><td>${dur(r.minutes)}</td>
        <td>${esc(r.zones.map(zn).join(", "))}</td><td>${esc(r.confidence)}</td></tr>`;
    }).join("") + "</table>";
}

function renderAll(){
  document.getElementById("range").textContent =
    `${dayhm(data.start)} to ${dayhm(data.end)} · ${data.runs.length} activity runs`;
  renderTiles(); renderTimeline(); renderConfidence(); renderBarks();
  renderCare(); renderAlerts(); renderTable();
}

async function load(h){
  hours = h;
  document.querySelectorAll("#ranges button").forEach(b =>
    b.setAttribute("aria-pressed", String(Number(b.dataset.h) === h)));
  const r = await fetch(`/api/timeline.json?hours=${h}`);
  data = await r.json();
  renderAll();
}

document.getElementById("ranges").innerHTML =
  [["6h",6],["24h",24],["48h",48],["7 days",168]].map(([l,h]) =>
    `<button data-h="${h}" aria-pressed="false">${l}</button>`).join("");
document.querySelectorAll("#ranges button").forEach(b =>
  b.addEventListener("click", () => load(Number(b.dataset.h))));
document.getElementById("theme").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  document.documentElement.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
});
addEventListener("resize", () => { if (data) renderAll(); });
load(HOURS_DEFAULT);
setInterval(() => load(hours), 60000);
</script>
</body>
</html>
"""
