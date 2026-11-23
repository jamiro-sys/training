/* Plan Paris 27 · App
   Daten: data/plan.json (Plan), data/garmin.json und data/coach.json (werden täglich aktualisiert).
   Logbuch und Einstellungen liegen im Browser (localStorage) und lassen sich exportieren. */
(() => {
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DN = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const MON = ["Jan", "Feb", "März", "Apr", "Mai", "Juni", "Juli", "Aug", "Sep", "Okt", "Nov", "Dez"];
const TYPE = { gym: "Gym", endurance: "Ausdauer", football: "Fussball", hyrox: "Hyrox", rest: "Erholung", accent: "Rennen" };
const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>'
};

/* ---------- Datum ---------- */
const pd = s => new Date(s + "T12:00:00");
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const wd = d => (d.getDay() + 6) % 7;
const monday = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); return addD(x, -wd(x)); };
const fmt = d => d.getDate() + ". " + MON[d.getMonth()];
const days = (a, b) => Math.round((b - a) / 864e5);
const kw = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); };
const now = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };

/* ---------- Speicher ---------- */
const store = {
  get(k, f) { try { const v = localStorage.getItem("pp27." + k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem("pp27." + k, JSON.stringify(v)); return true; } catch { return false; } }
};

const S = {
  plan: null, garmin: null, coach: null,
  logs: store.get("logs", []),
  settings: Object.assign({ kneeStage: 1, raceDate: null, theme: "system" }, store.get("settings", {})),
  week: monday(now()), planMode: "woche", exCat: "Alle", exQ: ""
};
const saveLogs = () => store.set("logs", S.logs);
const saveSettings = () => store.set("settings", S.settings);
const raceDate = () => S.settings.raceDate || S.plan.race.date;

/* ---------- Plan Logik ---------- */
function phaseOf(d) { const s = iso(d); return S.plan.phases.find(p => s >= p.from && s <= p.to) || null; }
function sessionsFor(d) {
  const s = iso(d), rd = raceDate();
  if (s === rd) return ["race"];
  const p = phaseOf(d);
  if (!p) return [];
  let list = p.days[wd(d)].slice();
  const diff = days(d, pd(rd));
  if (diff > 0 && diff <= 2) list = ["ruhe"];
  if (diff < 0 && diff >= -2) list = ["ruhe"];
  return list;
}
const sess = k => S.plan.sessions[k];
const isDone = (date, k) => S.logs.some(l => l.date === date && l.session === k);
const isDeload = d => { const p = phaseOf(d); return !!(p && p.deload && p.deload.includes(iso(monday(d)))); };

/* ---------- Rendering Helfer ---------- */
function ring(pct, color, size = 112, stroke = 10) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--surface-2)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset .6s ease"/></svg>`;
}
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); }
const greeting = () => { const h = new Date().getHours(); return h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : "Guten Abend"; };
const kneeColor = v => v == null ? "var(--rest)" : v <= 2 ? "var(--good)" : v <= 4 ? "var(--warn)" : "var(--bad)";

/* ---------- Heute ---------- */
function renderHeute() {
  const t = now(), p = phaseOf(t), rd = pd(raceDate());
  const list = sessionsFor(t);
  const main = list.find(k => sess(k).dur) || list[0] || "ruhe";
  const s = sess(main);
  const done = isDone(iso(t), main);
  const left = Math.max(0, days(t, rd));
  const extra = list.filter(k => k !== main).map(k => sess(k).name);

  // Phasenfortschritt
  const ph = S.plan.phases.filter(x => x.from <= raceDate());
  const track = ph.map(x => {
    const a = pd(x.from), b = pd(x.to), tot = days(a, b) + 1, pr = Math.max(0, Math.min(1, (days(a, t) + 1) / tot));
    return `<span class="t-${x.color}" title="${esc(x.name)}"><i style="width:${(t < a ? 0 : pr) * 100}%"></i></span>`;
  }).join("");

  // Garmin
  const g = S.garmin && S.garmin.readiness;
  const gUpdated = S.garmin && S.garmin.updated;
  let readiness;
  if (g && g.score != null) {
    const col = g.score >= 70 ? "var(--good)" : g.score >= 45 ? "var(--warn)" : "var(--bad)";
    readiness = `<div class="card"><div class="card-h"><h3>Bereitschaft</h3><span class="pill">${esc(g.label || "Garmin")}</span></div>
      <div class="ring-wrap"><div class="ring">${ring(g.score / 100, col)}<div class="v"><div><b>${g.score}</b><span>von 100</span></div></div></div>
      <div class="kv">
        <div><b class="num">${g.hrv ?? "-"}</b><span>HRV ms</span></div>
        <div><b class="num">${g.restingHr ?? "-"}</b><span>Ruhepuls</span></div>
        <div><b class="num">${g.sleepH ?? "-"}</b><span>Schlaf h</span></div>
        <div><b class="num">${g.bodyBattery ?? "-"}</b><span>Body Battery</span></div>
      </div></div>
      ${gUpdated ? `<p class="muted" style="font-size:12px;margin-top:12px">Stand ${esc(new Date(gUpdated).toLocaleString("de-CH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</p>` : ""}</div>`;
  } else {
    readiness = `<div class="card"><div class="card-h"><h3>Bereitschaft</h3><span class="pill">Garmin</span></div>
      <div class="ring-wrap"><div class="ring">${ring(0, "var(--faint)")}<div class="v"><div><b class="muted">?</b><span>offen</span></div></div></div>
      <p class="muted">Sobald Garmin über intervals.icu verbunden ist, siehst du hier jeden Morgen HRV, Ruhepuls, Schlaf und deine Tagesform.</p></div></div>`;
  }

  // Woche
  const ws = monday(t);
  const strip = DN.map((dn, i) => {
    const d = addD(ws, i), ks = sessionsFor(d);
    const dots = ks.filter(k => sess(k).dur || k === "race").map(k => `<i class="t-${sess(k).type}${isDone(iso(d), k) ? " done" : ""}"></i>`).join("");
    return `<button class="${iso(d) === iso(t) ? "today" : ""}" data-day="${iso(d)}" aria-label="${DL[i]} ${fmt(d)}"><span class="d">${dn}</span><span class="n">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }).join("");

  const coach = S.coach && S.coach.message ? `<div class="card span"><div class="coach"><div class="av" aria-hidden="true"></div><div><p>${esc(S.coach.message)}</p><p class="when">Coach Notiz · ${esc(S.coach.updated ? fmt(new Date(S.coach.updated)) : "")}</p></div></div></div>` : "";
  const ks = S.plan.kneeStages[S.settings.kneeStage];

  $("#v-heute").innerHTML = `
    <header class="head"><div><p class="eyebrow">${DL[wd(t)]}, ${fmt(t)} · KW ${kw(t)}</p><h1 id="h-heute">${greeting()}</h1></div>
      <button class="icon-btn" data-open="settings" aria-label="Einstellungen"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg></button></header>
    <div class="grid today">
      <article class="hero t-${s.type}">
        ${done ? `<span class="pill good done-badge">${ICON.check.replace("<svg", '<svg style="width:14px;height:14px"')} Erledigt</span>` : ""}
        <span class="tag">${esc(s.tag)} · Heute</span>
        <h2>${esc(s.name)}</h2>
        <p class="goal">${esc(s.goal)}</p>
        ${extra.length ? `<p class="muted" style="font-size:13px">Dazu: ${esc(extra.join(", "))}</p>` : ""}
        <div class="meta">
          ${s.dur ? `<div><b class="num">${s.dur}</b><span>Minuten</span></div>` : ""}
          ${s.blocks.length ? `<div><b class="num">${s.blocks.reduce((a, b) => a + b.items.length, 0)}</b><span>Übungen</span></div>` : ""}
          <div><b>${esc(TYPE[s.type])}</b><span>Typ</span></div>
        </div>
        <div class="actions">
          ${s.blocks.length && s.dur ? `<button class="btn accent" data-start="${main}" data-date="${iso(t)}">${ICON.play} Training starten</button>` : ""}
          <button class="btn ghost" data-sess="${main}" data-date="${iso(t)}">Details</button>
        </div>
      </article>
      <div class="grid">
        ${readiness}
        <div class="card t-accent"><div class="card-h"><h3>Paris</h3><span class="pill accent">${esc(S.plan.race.division)}</span></div>
          <div style="display:flex;align-items:flex-end;gap:12px"><span class="big-num num">${left}</span><span class="muted" style="padding-bottom:8px">Tage bis zum Start<br>${fmt(rd)} ${rd.getFullYear()}</span></div>
          <div class="phase-track">${track}</div>
          <div class="phase-labels"><span>${p ? esc(p.name) : "Plan"}</span><span>${p ? "bis " + fmt(pd(p.to)) : ""}</span></div>
        </div>
      </div>
      ${coach}
      <div class="card span"><div class="card-h"><h3>Diese Woche</h3><span class="muted" style="font-size:13px">${S.logs.filter(l => l.date >= iso(ws) && l.date <= iso(addD(ws, 6))).length} erledigt${isDeload(t) ? " · Entlastungswoche" : ""}</span></div><div class="strip">${strip}</div></div>
      <div class="card span"><div class="card-h"><h3>Knie Stufe</h3><button class="btn ghost small" data-open="knee">Alle Stufen</button></div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div class="stepper"><button class="icon-btn" data-knee="-1" aria-label="Stufe runter">${ICON.minus}</button><b class="num">${S.settings.kneeStage}</b><button class="icon-btn" data-knee="1" aria-label="Stufe rauf">${ICON.plus}</button></div>
          <div style="min-width:0;flex:1"><b>${esc(ks.name)}</b><p class="muted">${esc(ks.text)}</p></div>
        </div></div>
    </div>`;
}

/* ---------- Plan ---------- */
function renderPlan() {
  const t = now();
  let body;
  if (S.planMode === "woche") {
    const ws = S.week, we = addD(ws, 6), p = phaseOf(ws) || phaseOf(we);
    const rows = DN.map((dn, i) => {
      const d = addD(ws, i), ks = sessionsFor(d);
      const ss = ks.map(k => { const s = sess(k); const dn2 = isDone(iso(d), k);
        return `<button class="srow t-${s.type}" data-sess="${k}" data-date="${iso(d)}"><span class="bar"></span><span class="tx"><b>${esc(s.name)}</b><span>${esc(s.tag)}${s.dur ? " · " + s.dur + " Min" : ""}</span></span>${s.dur ? `<span class="ck${dn2 ? " on" : ""}" aria-label="${dn2 ? "erledigt" : "offen"}">${dn2 ? ICON.check : ""}</span>` : ""}</button>`; }).join("");
      return `<div class="day${iso(d) === iso(t) ? " today" : ""}"><div class="dl"><span>${dn}</span><b>${d.getDate()}</b></div><div class="ss">${ss || '<span class="muted">Ausserhalb des Plans</span>'}</div></div>`;
    }).join("");
    body = `<div class="weeknav"><button class="icon-btn" data-week="-1" aria-label="Vorherige Woche">${ICON.left}</button>
      <div class="t"><h2>KW ${kw(ws)}</h2><p class="muted" style="font-size:13px">${fmt(ws)} bis ${fmt(we)}${p ? " · " + esc(p.name) : ""}</p></div>
      ${iso(ws) !== iso(monday(t)) ? `<button class="btn ghost small" data-week="0">Heute</button>` : ""}
      <button class="icon-btn" data-week="1" aria-label="Nächste Woche">${ICON.right}</button></div>
      ${p ? `<p class="muted" style="margin-bottom:12px">${esc(p.goal)}</p>` : ""}
      ${isDeload(ws) ? `<div class="callout deload t-gym"><b>Entlastungswoche.</b> Gym und Ausdauer mit 40 Prozent weniger Volumen. Fussball normal.</div>` : ""}
      <div class="days">${rows}</div>`;
  } else {
    const cur = phaseOf(t);
    body = `<div class="phases">${S.plan.phases.map(p => {
      const wk = p.days.map((ks, i) => `<span><b>${DN[i]}</b>${esc(ks.map(k => sess(k).name).join(" + "))}</span>`).join("");
      return `<article class="phase t-${p.color}${cur && cur.id === p.id ? " now" : ""}"><span class="stripe"></span><div><p class="eyebrow">${cur && cur.id === p.id ? "Jetzt" : (p.to < iso(t) ? "Abgeschlossen" : "Kommt")}</p><h3>${esc(p.name)}</h3><p class="when num">${fmt(pd(p.from))} bis ${fmt(pd(p.to))}</p><p>${esc(p.goal)}</p><div class="wk">${wk}</div></div></article>`;
    }).join("")}</div>`;
  }
  $("#v-plan").innerHTML = `<header class="head"><div><p class="eyebrow">Mitte Januar Fussball · April Paris</p><h1>Plan</h1></div>
    <div class="seg" role="group" aria-label="Ansicht"><button data-mode="woche" aria-pressed="${S.planMode === "woche"}">Woche</button><button data-mode="phasen" aria-pressed="${S.planMode === "phasen"}">Phasen</button></div></header>${body}`;
}

/* ---------- Übungen ---------- */
const CAT_TYPE = { Beine: "gym", "Oberkörper": "gym", Rumpf: "gym", Knie: "football", Mobility: "rest", Ausdauer: "endurance", Hyrox: "hyrox" };
function renderUebungen() {
  const ex = S.plan.exercises;
  const cats = ["Alle", ...new Set(Object.values(ex).map(e => e.cat))];
  const q = S.exQ.trim().toLowerCase();
  const list = Object.entries(ex).filter(([, e]) => (S.exCat === "Alle" || e.cat === S.exCat) && (!q || (e.name + " " + e.equip + " " + e.cat).toLowerCase().includes(q)));
  const view = $("#v-uebungen");
  if (!view.dataset.ready) {
    view.innerHTML = `<header class="head"><div><p class="eyebrow">${Object.keys(ex).length} Übungen</p><h1>Übungen</h1></div></header>
      <label class="search">${ICON.search}<input id="exSearch" type="search" placeholder="Suchen, z.B. Beinpresse" aria-label="Übung suchen" autocomplete="off"></label>
      <div class="chips" id="exChips" role="group" aria-label="Kategorie"></div><div class="exlist" id="exList"></div>`;
    view.dataset.ready = "1";
    $("#exSearch").addEventListener("input", e => { S.exQ = e.target.value; renderUebungen(); });
  }
  $("#exChips").innerHTML = cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === S.exCat}">${esc(c)}</button>`).join("");
  $("#exList").innerHTML = list.length ? list.map(([id, e]) => `<button class="exitem t-${CAT_TYPE[e.cat] || "rest"}" data-ex="${id}"><span class="ic">${esc(e.name.slice(0, 2))}</span><span class="tx"><b>${esc(e.name)}</b><span>${esc(e.cat)} · ${esc(e.equip)}</span></span></button>`).join("")
    : `<div class="empty"><b>Keine Übung gefunden.</b><span>Versuche einen anderen Begriff oder wähle «Alle».</span></div>`;
}

/* ---------- Fortschritt ---------- */
function lineChart(points, { min, max, color, label, unit = "", band }) {
  const W = 340, H = 140, l = 30, r = 10, t = 12, b = 22;
  if (points.length < 2) return `<p class="muted">Ab zwei Werten erscheint hier der Verlauf.</p>`;
  const x = i => l + i * (W - l - r) / (points.length - 1);
  const y = v => t + (max - v) * (H - t - b) / (max - min);
  const ticks = [min, (min + max) / 2, max].map(v => Math.round(v));
  let g = ticks.map(v => `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${l - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join("");
  if (band) g += `<rect x="${l}" y="${y(band[1])}" width="${W - l - r}" height="${y(band[0]) - y(band[1])}" fill="${band[2]}" opacity=".08"/>`;
  const pts = points.map((p, i) => `${x(i)},${y(p.v)}`).join(" ");
  g += `<polygon points="${l},${H - b} ${pts} ${W - r},${H - b}" fill="${color}" opacity=".12"/>`;
  g += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>`;
  const last = points[points.length - 1];
  g += `<circle cx="${x(points.length - 1)}" cy="${y(last.v)}" r="4.5" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`;
  g += `<text x="${l}" y="${H - 6}">${esc(points[0].l)}</text><text x="${W - r}" y="${H - 6}" text-anchor="end">${esc(last.l)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}, zuletzt ${last.v}${unit}">${g}</svg>`;
}
function renderFortschritt() {
  const t = now(), ws = monday(t);
  const L = S.logs.slice().sort((a, b) => (b.date + (b.ts || "")).localeCompare(a.date + (a.ts || "")));
  const thisWeek = L.filter(l => l.date >= iso(ws)).length;
  const minutes = L.filter(l => l.date >= iso(addD(t, -27))).reduce((a, l) => a + (l.dur || 0), 0);
  // Serie: Wochen in Folge mit mindestens 4 Einheiten
  let streak = 0; for (let i = 1; i < 60; i++) { const a = iso(addD(ws, -7 * i)), b = iso(addD(ws, -7 * i + 6)); if (S.logs.filter(l => l.date >= a && l.date <= b).length >= 4) streak++; else break; }

  const K = S.logs.filter(l => l.knee != null).sort((a, b) => a.date.localeCompare(b.date)).slice(-24).map(l => ({ v: l.knee, l: fmt(pd(l.date)) }));
  // Wochenbalken
  const weeks = []; for (let i = 7; i >= 0; i--) weeks.push(addD(ws, -7 * i));
  const counts = weeks.map(w => { const a = iso(w), b = iso(addD(w, 6)); const ls = S.logs.filter(l => l.date >= a && l.date <= b); return { n: ls.length, m: ls.reduce((s, l) => s + (l.dur || 0), 0) }; });
  const mx = Math.max(6, ...counts.map(c => c.n));
  const W = 340, H = 140, bw = (W - 20) / 8;
  const bars = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Einheiten pro Woche">${counts.map((c, i) => { const h = c.n / mx * (H - 40); return `<rect x="${10 + i * bw + 5}" y="${H - 22 - h}" width="${bw - 10}" height="${Math.max(h, 2)}" rx="5" fill="${i === 7 ? "var(--accent)" : "var(--surface-2)"}"/><text x="${10 + i * bw + bw / 2}" y="${H - 26 - h}" text-anchor="middle">${c.n || ""}</text><text x="${10 + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${kw(weeks[i])}</text>`; }).join("")}<line x1="10" x2="${W - 10}" y1="${H - 22 - 5 / mx * (H - 40)}" y2="${H - 22 - 5 / mx * (H - 40)}" stroke="var(--faint)" stroke-dasharray="3 4"/></svg>`;

  // Garmin
  const gd = (S.garmin && S.garmin.days) || [];
  const gChart = (key, label, color, unit) => { const pts = gd.filter(d => d[key] != null).slice(-28).map(d => ({ v: d[key], l: fmt(pd(d.date)) })); if (pts.length < 2) return ""; const vs = pts.map(p => p.v); const mn = Math.floor(Math.min(...vs) * .95), mxv = Math.ceil(Math.max(...vs) * 1.05); return `<div class="card chart"><div class="card-h"><h3>${label}</h3><span class="num muted">${pts[pts.length - 1].v}${unit}</span></div>${lineChart(pts, { min: mn, max: mxv, color, label, unit })}</div>`; };
  const garminCharts = gd.length ? gChart("hrv", "HRV", "var(--hyrox)", " ms") + gChart("restingHr", "Ruhepuls", "var(--accent)", " bpm") + gChart("sleepH", "Schlaf", "var(--endurance)", " h") + gChart("runKm", "Laufkilometer pro Tag", "var(--football)", " km")
    : `<div class="empty span"><b>Garmin Daten folgen.</b><span>So verbindest du Garmin:</span><ol><li>Gratis Konto auf intervals.icu erstellen und Garmin verbinden.</li><li>API Key und Athleten ID als GitHub Secrets hinterlegen.</li><li>Ab dann holt die Seite die Werte jeden Morgen und Abend automatisch.</li></ol></div>`;

  const acts = ((S.garmin && S.garmin.activities) || []).slice(0, 8);
  const logs = L.slice(0, 30).map(l => { const s = sess(l.session); const d = pd(l.date);
    return `<div class="logrow"><div class="dt"><b>${d.getDate()}</b>${MON[d.getMonth()]}</div><div class="tx"><b>${esc(s ? s.name : "Einheit")}</b><span>${[l.dur ? l.dur + " Min" : "", l.rpe ? "RPE " + l.rpe : "", l.note || ""].filter(Boolean).map(esc).join(" · ")}</span></div>
      <div style="display:flex;gap:6px;align-items:center">${l.knee != null ? `<span class="kb" style="--c:${kneeColor(l.knee)}" title="Knie">K ${l.knee}</span>` : ""}<button class="icon-btn" style="width:32px;height:32px" data-del="${esc(l.id)}" aria-label="Eintrag löschen">${ICON.close}</button></div></div>`; }).join("");

  $("#v-fortschritt").innerHTML = `<header class="head"><div><p class="eyebrow">Logbuch und Garmin</p><h1>Fortschritt</h1></div>
    <button class="btn ghost small" data-open="log">${ICON.plus} Eintrag</button></header>
    <div class="stats"><div class="stat"><b class="num">${thisWeek}</b><span>Einheiten diese Woche</span></div><div class="stat"><b class="num">${minutes}</b><span>Minuten in 4 Wochen</span></div><div class="stat"><b class="num">${streak}</b><span>Wochen in Folge mit 4+</span></div></div>
    <div class="cols">
      <div class="card chart"><div class="card-h"><h3>Einheiten pro Woche</h3><span class="muted" style="font-size:12px">Ziel 5</span></div>${bars}</div>
      <div class="card chart"><div class="card-h"><h3>Knie</h3><span class="muted" style="font-size:12px">0 bis 10</span></div>${lineChart(K, { min: 0, max: 10, color: "var(--accent)", label: "Knieschmerz", band: [3, 10, "var(--bad)"] })}</div>
      ${garminCharts}
      ${acts.length ? `<div class="card"><h3 style="margin-bottom:8px">Garmin Aktivitäten</h3><div class="loglist">${acts.map(a => { const d = pd(a.date); return `<div class="logrow"><div class="dt"><b>${d.getDate()}</b>${MON[d.getMonth()]}</div><div class="tx"><b>${esc(a.name || a.type)}</b><span>${[a.durMin ? a.durMin + " Min" : "", a.km ? a.km + " km" : "", a.avgHr ? "Ø " + a.avgHr + " bpm" : ""].filter(Boolean).join(" · ")}</span></div><span></span></div>`; }).join("")}</div></div>` : ""}
      <div class="card" style="grid-column:1/-1"><div class="card-h"><h3>Logbuch</h3><div class="row"><button class="btn ghost small" id="exportBtn">Export</button><label class="btn ghost small" for="importFile">Import</label><input type="file" id="importFile" accept="application/json" hidden></div></div>
        ${logs ? `<div class="loglist">${logs}</div>` : `<div class="empty"><b>Noch keine Einträge.</b><span>Starte ein Training unter «Heute» oder trage eine Einheit mit «Eintrag» nach. Die Einträge bleiben auf diesem Gerät gespeichert. Mit Export kannst du sie sichern oder an Claude schicken.</span></div>`}
      </div>
    </div>`;
}

/* ---------- Sheets ---------- */
let lastFocus = null;
function openSheet(html) {
  lastFocus = document.activeElement;
  $("#sheetBody").innerHTML = html; $("#sheet").hidden = false; $("#backdrop").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#sheetClose").focus(), 30);
}
function closeSheet() { $("#sheet").hidden = true; $("#backdrop").hidden = true; document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); }

function itemRow(it) {
  const e = it.ex && S.plan.exercises[it.ex];
  const dose = (it.sets > 1 ? it.sets + " × " : "") + it.reps;
  if (!e) return `<div class="item static"><span class="tx"><b>${esc(it.reps)}</b></span></div>`;
  return `<button class="item" data-ex="${it.ex}"><span class="tx"><b>${esc(e.name)}</b>${it.cue ? `<span>${esc(it.cue)}</span>` : ""}</span><span class="dose">${esc(dose)}</span></button>`;
}
function sessionSheet(k, date) {
  const s = sess(k), d = pd(date);
  const kneeNote = s.knee || k === "ausdLang" || k === "hx3" || k === "simu" ? `<div class="callout t-accent"><b>Knie Stufe ${S.settings.kneeStage}:</b> ${esc(S.plan.kneeStages[S.settings.kneeStage].text)}</div>` : "";
  openSheet(`<div><p class="eyebrow">${DL[wd(d)]}, ${fmt(d)} · ${esc(s.tag)}${s.dur ? " · " + s.dur + " Min" : ""}</p><h2 id="sheetTitle" style="margin-top:8px">${esc(s.name)}</h2><p class="muted" style="margin-top:8px">${esc(s.goal)}</p></div>
    ${kneeNote}
    ${s.blocks.map(b => `<div><p class="block-t">${esc(b.title)}</p><div class="items">${b.items.map(itemRow).join("")}</div></div>`).join("")}
    ${s.note ? `<div class="callout"><b>Hinweis:</b> ${esc(s.note)}</div>` : ""}
    ${s.dur ? `<div class="row">${s.blocks.length ? `<button class="btn accent" data-start="${k}" data-date="${date}">${ICON.play} Starten</button>` : ""}<button class="btn ghost" data-quicklog="${k}" data-date="${date}">${isDone(date, k) ? "Nochmals eintragen" : "Als erledigt eintragen"}</button></div>` : ""}`);
}
function exerciseSheet(id) {
  const e = S.plan.exercises[id];
  const hist = S.logs.filter(l => l.sets && l.sets[id] && l.sets[id].some(x => x.w)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  openSheet(`<div><p class="eyebrow">${esc(e.cat)} · ${esc(e.equip)}</p><h2 id="sheetTitle" style="margin-top:8px">${esc(e.name)}</h2></div>
    <div><p class="block-t">So gehts</p><ol class="howlist">${e.how.map(h => `<li>${esc(h)}</li>`).join("")}</ol></div>
    <div class="callout t-gym"><b>Typischer Fehler:</b> ${esc(e.err)}</div>
    <div><p class="block-t">Alternative</p><p>${esc(e.alt)}</p></div>
    ${hist.length ? `<div><p class="block-t">Deine letzten Gewichte</p><div class="items">${hist.map(l => `<div class="item static"><span class="tx"><b>${fmt(pd(l.date))}</b></span><span class="dose">${l.sets[id].filter(x => x.w || x.r).map(x => (x.w || "-") + " kg × " + (x.r || "-")).join("  ")}</span></div>`).join("")}</div></div>` : ""}`);
}
function settingsSheet() {
  openSheet(`<h2 id="sheetTitle">Einstellungen</h2>
    <div class="field"><label for="setRace">Renntag in Paris (${esc(S.plan.race.window)})</label><input class="input" type="date" id="setRace" value="${raceDate()}" min="2027-04-08" max="2027-04-12"></div>
    <div class="field"><label>Darstellung</label><div class="seg" role="group" aria-label="Darstellung">${[["system", "Automatisch"], ["dark", "Dunkel"], ["light", "Hell"]].map(([v, l]) => `<button data-theme-set="${v}" aria-pressed="${S.settings.theme === v}">${l}</button>`).join("")}</div></div>
    <div class="callout t-endurance"><b>Daten:</b> Plan und Garmin Werte kommen aus dem GitHub Repository und werden täglich aktualisiert. Dein Logbuch liegt nur auf diesem Gerät. Sichere es ab und zu mit Export unter Fortschritt.</div>
    <p class="muted" style="font-size:12.5px">Plan Version ${S.plan.version} · Stand ${fmt(pd(S.plan.updated))}${S.garmin && S.garmin.updated ? " · Garmin " + fmt(new Date(S.garmin.updated)) : ""}</p>`);
  $("#setRace").addEventListener("change", e => { if (e.target.value) { S.settings.raceDate = e.target.value; saveSettings(); renderAll(); toast("Renntag gespeichert"); } });
}
function kneeSheet() {
  openSheet(`<h2 id="sheetTitle">Knie links aussen</h2>
    <p class="muted">Schmerz an der Aussenseite, der erst nach rund 2 km kommt, passt oft zum Läuferknie (Tractus iliotibialis). Das ist keine Diagnose. Lass es von einer Physiotherapeutin oder einem Sportarzt anschauen.</p>
    <div class="callout"><b>Ampelregel:</b> Bis 2 von 10 beim Laufen ist ok, wenn es am nächsten Morgen weg ist. Ab 3 abbrechen, gehen und nächstes Mal eine Stufe zurück.</div>
    <div class="items">${S.plan.kneeStages.map((k, i) => `<button class="item" data-setknee="${i}"><span class="tx"><b>Stufe ${i} · ${esc(k.name)}</b><span>${esc(k.text)}</span></span>${i === S.settings.kneeStage ? '<span class="pill accent">aktuell</span>' : ""}</button>`).join("")}</div>
    <div><p class="block-t">Lauftipps</p><ol class="howlist"><li>Schrittfrequenz um 5 bis 10 Prozent erhöhen, kürzere Schritte.</li><li>Flach laufen, kein langes Bergab. Laufband mit 1 Prozent Steigung.</li><li>Schuhe prüfen, nach dem Marathon eventuell abgelaufen.</li><li>Hüftkraft ist der Schlüssel: Abduktor, Seitstütz, Step Down.</li></ol></div>`);
}
function logSheet(k, date) {
  const opts = Object.entries(S.plan.sessions).filter(([, s]) => s.dur).map(([id, s]) => `<option value="${id}"${id === k ? " selected" : ""}>${esc(s.name)} (${esc(s.tag)})</option>`).join("");
  const s = k ? sess(k) : null;
  openSheet(`<h2 id="sheetTitle">Einheit eintragen</h2>
    <div class="row"><div class="field" style="flex:1;min-width:140px"><label for="qDate">Datum</label><input class="input" type="date" id="qDate" value="${date || iso(now())}"></div>
    <div class="field" style="flex:1;min-width:110px"><label for="qDur">Minuten</label><input class="input num" type="number" inputmode="numeric" id="qDur" value="${s ? s.dur : ""}" min="0" max="400"></div></div>
    <div class="field"><label for="qSess">Einheit</label><select class="input" id="qSess">${opts}</select></div>
    ${finishFields()}
    <button class="btn accent block" id="qSave">Speichern</button>`);
  bindScales();
  $("#qSave").addEventListener("click", () => {
    const rec = { id: uid(), date: $("#qDate").value, session: $("#qSess").value, dur: +$("#qDur").value || null, ...readFinish(), ts: new Date().toISOString() };
    if (!rec.date) return toast("Bitte ein Datum wählen");
    S.logs.push(rec); saveLogs(); closeSheet(); renderAll(); toast("Gespeichert");
  });
}
function finishFields() {
  return `<div class="field t-accent"><label>Anstrengung (RPE)</label><div class="scale" data-scale="rpe">${Array.from({ length: 10 }, (_, i) => `<button type="button" data-v="${i + 1}" aria-pressed="false">${i + 1}</button>`).join("")}</div><div class="scale-l"><span>locker</span><span>maximal</span></div></div>
    <div class="field t-gym"><label>Knie (0 = schmerzfrei)</label><div class="scale k" data-scale="knee">${Array.from({ length: 11 }, (_, i) => `<button type="button" data-v="${i}" aria-pressed="false">${i}</button>`).join("")}</div></div>
    <div class="field"><label for="qNote">Notiz</label><textarea class="input" id="qNote" maxlength="500" placeholder="Gefühl, Gewichte, Zeiten"></textarea></div>`;
}
function bindScales() {
  document.querySelectorAll("[data-scale]").forEach(sc => sc.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    sc.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  }));
}
function readFinish() {
  const pick = n => { const b = document.querySelector(`[data-scale="${n}"] [aria-pressed="true"]`); return b ? +b.dataset.v : null; };
  return { rpe: pick("rpe"), knee: pick("knee"), note: ($("#qNote").value || "").trim() };
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- Training Player ---------- */
const P = { k: null, date: null, steps: [], i: 0, start: 0, timer: null, sets: {}, rest: null };
function startPlayer(k, date) {
  const s = sess(k);
  P.k = k; P.date = date; P.i = 0; P.start = Date.now(); P.sets = {};
  P.steps = []; s.blocks.forEach(b => b.items.forEach(it => P.steps.push({ ...it, block: b.title })));
  closeSheet();
  $("#player").hidden = false; $("#player").className = "player t-" + s.type;
  document.body.style.overflow = "hidden";
  clearInterval(P.timer); P.timer = setInterval(tick, 1000);
  try { navigator.wakeLock && navigator.wakeLock.request("screen").then(l => P.lock = l).catch(() => {}); } catch {}
  renderPlayer();
}
const mmss = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
function tick() { const el = $("#pTime"); if (el) el.textContent = mmss((Date.now() - P.start) / 1000); }
function lastSets(ex) { const l = S.logs.filter(x => x.sets && x.sets[ex] && x.sets[ex].some(s => s.w || s.r)).sort((a, b) => b.date.localeCompare(a.date))[0]; return l ? l.sets[ex] : null; }
const isStrength = st => /^\d/.test(st.reps) && st.sets > 1 && !/(Min|m |km|s$|s je|Schritte|Wdh in)/.test(st.reps + " ");
function renderPlayer() {
  const s = sess(P.k), st = P.steps[P.i], e = st.ex && S.plan.exercises[st.ex];
  const n = P.steps.length;
  if (!P.sets[P.i]) P.sets[P.i] = Array.from({ length: st.sets || 1 }, () => ({ w: "", r: "", d: false }));
  const rows = P.sets[P.i];
  const strength = isStrength(st);
  const prev = st.ex ? lastSets(st.ex) : null;
  const setRows = rows.map((r, j) => strength
    ? `<div class="set${r.d ? " done" : ""}"><span class="no">${j + 1}</span><input inputmode="decimal" aria-label="Satz ${j + 1} Gewicht kg" placeholder="${prev && prev[j] && prev[j].w ? esc(prev[j].w) : "kg"}" value="${esc(r.w)}" data-set="${j}" data-f="w"><input inputmode="numeric" aria-label="Satz ${j + 1} Wiederholungen" placeholder="${esc((st.reps.match(/\d+/) || [""])[0])}" value="${esc(r.r)}" data-set="${j}" data-f="r"><button class="ok${r.d ? " on" : ""}" data-done="${j}" aria-label="Satz ${j + 1} erledigt" aria-pressed="${r.d}">${ICON.check}</button></div>`
    : `<div class="set${r.d ? " done" : ""}" style="grid-template-columns:34px 1fr 48px"><span class="no">${j + 1}</span><span style="font-weight:600">${esc(st.reps)}</span><button class="ok${r.d ? " on" : ""}" data-done="${j}" aria-label="Durchgang ${j + 1} erledigt" aria-pressed="${r.d}">${ICON.check}</button></div>`).join("");
  const kneeNote = st.ex === "treadmill" && (s.knee || P.k === "ausdLang" || P.k === "hx3" || P.k === "simu") ? `<div class="callout t-accent"><b>Knie Stufe ${S.settings.kneeStage}:</b> ${esc(S.plan.kneeStages[S.settings.kneeStage].text)}</div>` : "";
  $("#player").innerHTML = `
    <div class="p-top"><button class="icon-btn" id="pClose" aria-label="Training beenden">${ICON.close}</button><div class="tx"><b>${esc(s.name)}</b><span class="num" id="pTime">${mmss((Date.now() - P.start) / 1000)}</span></div><span class="pill num">${P.i + 1} / ${n}</span></div>
    <div class="p-prog" aria-hidden="true">${P.steps.map((_, j) => `<i class="${j < P.i ? "on" : j === P.i ? "cur" : ""}"></i>`).join("")}</div>
    <div class="p-body">
      <div><p class="eyebrow">${esc(st.block)}</p><h2 style="margin-top:8px">${esc(e ? e.name : st.reps)}</h2></div>
      <div class="p-target"><span class="big num">${st.sets > 1 ? st.sets + " × " : ""}${esc(st.reps)}</span>${st.rest ? `<span class="pill">Pause ${st.rest >= 60 ? (st.rest / 60).toString().replace(".", ",") + " Min" : st.rest + " s"}</span>` : ""}${st.cue ? `<span class="pill accent">${esc(st.cue)}</span>` : ""}</div>
      ${kneeNote}
      ${prev && strength ? `<p class="last">Letztes Mal: ${prev.filter(x => x.w || x.r).map(x => (x.w || "-") + " × " + (x.r || "-")).join(", ")}</p>` : ""}
      ${strength ? `<div class="set-h"><span>Satz</span><span>kg</span><span>Wdh</span><span></span></div>` : ""}
      <div class="sets">${setRows}</div>
      ${e ? `<button class="btn ghost" data-ex="${st.ex}">${ICON.info} So gehts</button>` : ""}
    </div>
    <div class="p-foot"><button class="btn ghost" id="pPrev" ${P.i === 0 ? "disabled" : ""}>${ICON.left} Zurück</button>${P.i < n - 1 ? `<button class="btn primary" id="pNext">Weiter ${ICON.right}</button>` : `<button class="btn accent" id="pFinish">Abschliessen</button>`}</div>`;
}
function startRest(sec) {
  if (!sec) return;
  stopRest();
  const el = document.createElement("div"); el.className = "rest"; el.id = "rest";
  const end = Date.now() + sec * 1000; P.rest = { end, total: sec, el };
  el.innerHTML = `<div class="rest-in"><p class="eyebrow">Pause</p><div class="ring" id="rRing"></div><div class="row"><button class="btn ghost" id="rMinus">−15 s</button><button class="btn ghost" id="rPlus">+15 s</button></div><button class="btn primary" id="rSkip">Weiter</button></div>`;
  document.body.appendChild(el);
  const draw = () => { const left = Math.max(0, (P.rest.end - Date.now()) / 1000); $("#rRing").innerHTML = ring(left / P.rest.total, "var(--c,var(--accent))", 230, 12) + `<div class="v"><div><b class="num">${mmss(Math.ceil(left))}</b></div></div>`; if (left <= 0) { try { navigator.vibrate && navigator.vibrate([120, 80, 120]); } catch {} stopRest(); } };
  el.style.setProperty("--c", getComputedStyle($("#player")).getPropertyValue("--c"));
  draw(); P.rest.iv = setInterval(draw, 250);
  $("#rSkip").focus();
}
function stopRest() { if (P.rest) { clearInterval(P.rest.iv); P.rest.el.remove(); P.rest = null; } }
function closePlayer() { clearInterval(P.timer); stopRest(); try { P.lock && P.lock.release(); } catch {} $("#player").hidden = true; document.body.style.overflow = ""; }
function finishPlayer() {
  const mins = Math.max(1, Math.round((Date.now() - P.start) / 60000));
  const s = sess(P.k);
  closePlayer();
  openSheet(`<div><p class="eyebrow">Geschafft · ${mins} Min</p><h2 id="sheetTitle" style="margin-top:8px">${esc(s.name)}</h2></div>${finishFields()}<button class="btn accent block" id="fSave">Speichern</button>`);
  bindScales();
  $("#fSave").addEventListener("click", () => {
    const sets = {};
    P.steps.forEach((st, i) => { if (st.ex && P.sets[i] && isStrength(st)) { const v = P.sets[i].filter(x => x.w || x.r).map(x => ({ w: x.w, r: x.r })); if (v.length) sets[st.ex] = (sets[st.ex] || []).concat(v); } });
    S.logs.push({ id: uid(), date: P.date, session: P.k, dur: mins, ...readFinish(), sets, ts: new Date().toISOString() });
    saveLogs(); closeSheet(); renderAll(); toast("Training gespeichert");
  });
}

/* ---------- Events ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-start],[data-sess],[data-ex],[data-day],[data-week],[data-mode],[data-cat],[data-open],[data-knee],[data-setknee],[data-quicklog],[data-del],[data-theme-set],[data-done]");
  if (!t) return;
  const d = t.dataset;
  if (d.start) return startPlayer(d.start, d.date);
  if (d.quicklog) return logSheet(d.quicklog, d.date);
  if (d.sess) return sessionSheet(d.sess, d.date);
  if (d.ex) return exerciseSheet(d.ex);
  if (d.day) { S.week = monday(pd(d.day)); S.planMode = "woche"; location.hash = "plan"; return; }
  if (d.week) { S.week = d.week === "0" ? monday(now()) : addD(S.week, 7 * +d.week); return renderPlan(); }
  if (d.mode) { S.planMode = d.mode; return renderPlan(); }
  if (d.cat) { S.exCat = d.cat; return renderUebungen(); }
  if (d.open === "settings") return settingsSheet();
  if (d.open === "knee") return kneeSheet();
  if (d.open === "log") return logSheet(null, iso(now()));
  if (d.knee) { S.settings.kneeStage = Math.max(0, Math.min(S.plan.kneeStages.length - 1, S.settings.kneeStage + +d.knee)); saveSettings(); return renderHeute(); }
  if (d.setknee) { S.settings.kneeStage = +d.setknee; saveSettings(); closeSheet(); renderAll(); return toast("Knie Stufe " + d.setknee); }
  if (d.themeSet) { S.settings.theme = d.themeSet; saveSettings(); applyTheme(); t.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === t)); return; }
  if (d.del) {
    if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.style.background = "var(--bad)"; t.style.color = "var(--bg)"; t.setAttribute("aria-label", "Nochmals tippen zum Löschen"); toast("Nochmals tippen zum Löschen"); setTimeout(() => { if (t.isConnected) { t.dataset.confirm = ""; t.style.background = ""; t.style.color = ""; } }, 3000); return; }
    S.logs = S.logs.filter(l => l.id !== d.del); saveLogs(); renderAll(); return toast("Gelöscht");
  }
  if (d.done !== undefined && t.closest("#player")) {
    const j = +d.done, row = P.sets[P.i][j]; row.d = !row.d;
    const st = P.steps[P.i];
    renderPlayer();
    if (row.d && st.rest && P.sets[P.i].some(x => !x.d)) startRest(st.rest);
  }
});
document.addEventListener("input", e => {
  const el = e.target; if (el.dataset.set === undefined || !el.closest("#player")) return;
  P.sets[P.i][+el.dataset.set][el.dataset.f] = el.value;
});
document.addEventListener("click", e => {
  if (e.target.closest("#pClose")) { const any = Object.values(P.sets).some(a => a.some(x => x.d)); if (any) return finishPlayer(); return closePlayer(); }
  if (e.target.closest("#pNext")) { P.i++; renderPlayer(); $(".p-body").scrollTop = 0; }
  if (e.target.closest("#pPrev")) { P.i--; renderPlayer(); }
  if (e.target.closest("#pFinish")) finishPlayer();
  if (e.target.closest("#rSkip")) stopRest();
  if (e.target.closest("#rPlus") && P.rest) { P.rest.end += 15000; P.rest.total += 15; }
  if (e.target.closest("#rMinus") && P.rest) { P.rest.end -= 15000; }
  if (e.target.closest("#exportBtn")) exportLogs();
});
document.addEventListener("change", e => { if (e.target.id === "importFile") importLogs(e.target.files[0]); });
$("#sheetClose").addEventListener("click", closeSheet);
$("#backdrop").addEventListener("click", closeSheet);
$("#openSettings").addEventListener("click", settingsSheet);
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (P.rest) stopRest(); else if (!$("#sheet").hidden) closeSheet(); } });

function exportLogs() {
  const data = JSON.stringify({ exported: new Date().toISOString(), settings: S.settings, logs: S.logs }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "logbuch-" + iso(now()) + ".json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  if (navigator.clipboard) navigator.clipboard.writeText(data).then(() => toast("Exportiert und kopiert"), () => toast("Exportiert"));
}
function importLogs(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => { try { const d = JSON.parse(r.result); const ids = new Set(S.logs.map(l => l.id)); const add = (d.logs || []).filter(l => l && l.id && l.date && !ids.has(l.id)); S.logs = S.logs.concat(add); saveLogs(); renderAll(); toast(add.length + " Einträge importiert"); } catch { toast("Datei nicht lesbar"); } };
  r.readAsText(file);
}

/* ---------- Navigation ---------- */
const VIEWS = ["heute", "plan", "uebungen", "fortschritt"];
function route() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "heute";
  VIEWS.forEach(x => { $("#v-" + x).hidden = x !== v; });
  document.querySelectorAll(".rail a").forEach(a => a.dataset.view === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  if (v === "plan") renderPlan();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
function applyTheme() { const t = S.settings.theme; if (t === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); }
function renderAll() { renderHeute(); renderPlan(); renderUebungen(); renderFortschritt(); }

/* ---------- Start ---------- */
async function load(path, fallback) { try { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw 0; return await r.json(); } catch { return fallback; } }
(async () => {
  applyTheme();
  const [plan, garmin, coach] = await Promise.all([load("data/plan.json", null), load("data/garmin.json", null), load("data/coach.json", null)]);
  if (!plan) { $("#v-heute").innerHTML = `<div class="empty"><b>Plan konnte nicht geladen werden.</b><span>Prüfe die Internetverbindung und lade die Seite neu.</span></div>`; return; }
  S.plan = plan; S.garmin = garmin; S.coach = coach;
  if (S.settings.kneeStage >= plan.kneeStages.length) S.settings.kneeStage = 1;
  renderAll(); route();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
})();
