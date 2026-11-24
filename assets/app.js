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
  body: store.get("body", []),
  checkins: store.get("checkins", {}),
  bench: store.get("bench", []), sims: store.get("sims", []), suppLog: store.get("suppLog", {}), deleted: store.get("deleted", []),
  settings: Object.assign({ kneeStage: 1, raceDate: null, theme: "system", targetMin: 80 }, store.get("settings", {})),
  week: monday(now()), planMode: "woche", exCat: "Alle", exQ: ""
};
const saveLogs = () => { store.set("logs", S.logs); scheduleSync(); };
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
  return `<svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--surface-2)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="prog" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${off}" style="--len:${c}"/></svg>`;
}
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); }
const greeting = () => { const h = new Date().getHours(); return h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : "Guten Abend"; };
const kneeColor = v => v == null ? "var(--rest)" : v <= 2 ? "var(--good)" : v <= 4 ? "var(--warn)" : "var(--bad)";

/* ---------- Kraftwerte, Rekorde, Tagesform ---------- */
const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const e1rm = (w, r) => w > 0 && r > 0 ? w * (1 + Math.min(r, 15) / 30) : 0;
function exHistory(id) {
  return S.logs.filter(l => l.sets && l.sets[id]).map(l => {
    const best = l.sets[id].reduce((b, x) => { const v = e1rm(num(x.w), num(x.r)); return v > b.v ? { v, w: num(x.w), r: num(x.r) } : b; }, { v: 0 });
    return { date: l.date, rpe: l.rpe, sets: l.sets[id], best };
  }).filter(h => h.best.v > 0).sort((a, b) => a.date.localeCompare(b.date));
}
const fmtKg = v => String(Math.round(v * 2) / 2).replace(".", ",");
/* Doppelte Progression: alle Sätze am oberen Ende der Wdh Spanne und RPE höchstens 8, dann mehr Gewicht */
function suggest(st) {
  const h = exHistory(st.ex); const last = h[h.length - 1]; if (!last) return null;
  const top = parseInt((st.reps.match(/\d+/g) || []).pop()) || 0;
  const ws = last.sets.map(x => num(x.w)).filter(Boolean); if (!ws.length || !top) return null;
  const w = Math.max(...ws);
  const allTop = last.sets.length >= (st.sets || 1) && last.sets.every(x => num(x.r) >= top);
  const e = S.plan.exercises[st.ex];
  const step = e && e.cat === "Beine" && /Gerät/.test(e.equip) ? 5 : 2.5;
  if (allTop && (last.rpe == null || last.rpe <= 8)) return { w: w + step, up: step, text: `+${fmtKg(step)} kg, letztes Mal alle Sätze geschafft` };
  return { w, up: 0, text: "Gewicht halten, Wiederholungen steigern" };
}
/* Tagesform: Garmin wenn aktuell, sonst eigener Check in */
function readinessToday() {
  const today = iso(now());
  const g = S.garmin && S.garmin.readiness;
  const full = g && (g.hrv != null || g.restingHr != null);
  if (g && full && g.score != null && (!g.date || g.date >= iso(addD(now(), -1)))) return { src: "garmin", score: g.score, g };
  const c = S.checkins[today];
  if (c) return { src: "check", score: Math.round(((c.sleep + c.energy + (6 - c.sore)) - 3) / 12 * 100), c };
  return null;
}
const scoreCol = v => v >= 70 ? "var(--good)" : v >= 45 ? "var(--warn)" : "var(--bad)";
const scoreTxt = v => v >= 70 ? "Bereit für Vollgas" : v >= 45 ? "Normal trainieren" : "Heute leichter machen";

/* ---------- Heute ---------- */
function renderHeute() {
  const t = now(), p = phaseOf(t), rd = pd(raceDate());
  const list = sessionsFor(t);
  const main = list.find(k => sess(k).dur) || list[0] || "ruhe";
  const s = sess(main);
  const done = isDone(iso(t), main);
  const left = Math.max(0, days(t, rd));
  const extra = list.filter(k => k !== main).map(k => sess(k).name);
  let nextD = null, nextK = null;
  if (!s.dur || done) for (let i = 1; i <= 7 && !nextK; i++) { const d = addD(t, i); const k = sessionsFor(d).find(x => sess(x).dur); if (k) { nextD = d; nextK = k; } }
  const pend = pendingPlayer();
  const nEx = s.blocks.reduce((a, b) => a + b.items.length, 0);
  const photos = [...new Set(s.blocks.flatMap(b => b.items.map(i => i.ex)).filter(x => x && window.ExPhotos && window.ExPhotos[x]))].slice(0, 4);

  const ph = S.plan.phases.filter(x => x.from <= raceDate());
  const track = ph.map(x => { const a = pd(x.from), b = pd(x.to), tot = days(a, b) + 1, pr = Math.max(0, Math.min(1, (days(a, t) + 1) / tot)); return `<span class="t-${x.color}" title="${esc(x.name)}"><i style="width:${(t < a ? 0 : pr) * 100}%"></i></span>`; }).join("");

  // Tagesform
  const r = readinessToday();
  let form;
  if (r && r.src === "check") form = "";
  else if (r) {
    const kv = r.src === "garmin"
      ? `<div><b class="num">${r.g.hrv ?? "-"}</b><span>HRV ms</span></div><div><b class="num">${r.g.restingHr ?? "-"}</b><span>Ruhepuls</span></div><div><b class="num">${r.g.sleepH ?? "-"}</b><span>Schlaf h</span></div><div><b class="num">${r.g.bodyBattery ?? "-"}</b><span>Body Battery</span></div>`
      : `<div><b class="num">${r.c.sleep}/5</b><span>Schlaf</span></div><div><b class="num">${r.c.energy}/5</b><span>Energie</span></div><div><b class="num">${r.c.sore}/5</b><span>Muskelkater</span></div><div><button class="link" data-checkin="edit">Ändern</button></div>`;
    form = `<div class="card"><div class="card-h"><h3>Tagesform</h3><span class="pill">${r.src === "garmin" ? "Garmin" : "Check in"}</span></div>
      <div class="ring-wrap"><div class="ring">${ring(r.score / 100, scoreCol(r.score))}<div class="v"><div><b>${r.score}</b><span>von 100</span></div></div></div><div class="kv">${kv}</div></div>
      <p class="form-tip" style="--c:${scoreCol(r.score)}">${scoreTxt(r.score)}${r.score < 45 && s.dur ? ". Kürze heute jede Übung um einen Satz." : ""}</p></div>`;
  } else {
    const scale = (k, l, lo, hi) => `<div class="ci"><span>${l}</span><div class="scale s5" data-ci="${k}">${[1, 2, 3, 4, 5].map(v => `<button data-v="${v}" aria-label="${l} ${v} von 5">${v}</button>`).join("")}</div><div class="scale-l"><span>${lo}</span><span>${hi}</span></div></div>`;
    form = `<div class="card"><div class="card-h"><h3>Wie fühlst du dich?</h3><span class="pill">10 Sek</span></div>
      ${scale("sleep", "Schlaf", "schlecht", "super")}${scale("energy", "Energie", "leer", "voll")}${scale("sore", "Muskelkater", "keiner", "stark")}
      <p class="muted" style="font-size:12.5px;margin-top:10px">Ersetzt die Garmin Werte, bis intervals.icu verbunden ist.</p></div>`;
  }

  const ws = monday(t);
  const strip = DN.map((dn, i) => {
    const d = addD(ws, i), ks = sessionsFor(d);
    const dots = ks.filter(k => sess(k).dur || k === "race").map(k => `<i class="t-${sess(k).type}${isDone(iso(d), k) ? " done" : ""}"></i>`).join("");
    return `<button class="${iso(d) === iso(t) ? "today" : ""}" data-day="${iso(d)}" aria-label="${DL[i]} ${fmt(d)}"><span class="d">${dn}</span><span class="n">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }).join("");
  const weekDone = S.logs.filter(l => l.date >= iso(ws) && l.date <= iso(addD(ws, 6))).length;
  const weekPlan = DN.reduce((a, _, i) => a + sessionsFor(addD(ws, i)).filter(k => sess(k).dur && sess(k).type !== "rest").length, 0);
  const coach = S.coach && S.coach.message ? `<div class="card span coach-card"><div class="coach"><div class="av" aria-hidden="true"></div><div><p class="eyebrow" style="margin-bottom:6px">Coach · ${esc(S.coach.updated ? fmt(new Date(S.coach.updated)) : "")}</p><p>${esc(S.coach.message)}</p></div></div></div>` : "";
  const ks = S.plan.kneeStages[S.settings.kneeStage];

  $("#v-heute").innerHTML = `
    <header class="head"><div><p class="eyebrow">${DL[wd(t)]}, ${fmt(t)} · KW ${kw(t)}${p ? " · " + esc(p.name) : ""}</p><h1 id="h-heute">Heute</h1></div>
      <button class="icon-btn" data-open="settings" aria-label="Einstellungen"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg></button></header>
    ${dialsHtml()}
    ${pend ? `<div class="banner t-${sess(pend.k).type}"><span class="dot"></span><div class="tx"><b>Training läuft: ${esc(sess(pend.k).name)}</b><span>Übung ${pend.i + 1} von ${sess(pend.k).blocks.reduce((a, b) => a + b.items.length, 0)}</span></div><button class="btn accent small" data-resume>Fortsetzen</button><button class="icon-btn" data-resume="drop" aria-label="Laufendes Training verwerfen">${ICON.close}</button></div>` : ""}
    ${!S.settings.introDone ? `<div class="card intro"><div class="card-h"><h3>So funktioniert die App</h3></div><ol class="howlist"><li><span><b>Training starten</b> führt dich Übung für Übung durch. Haken setzen, die Pause läuft automatisch.</span></li><li><span><b>Gewichte</b> werden vorgeschlagen. Schaffst du alle Wiederholungen, legt die App automatisch drauf.</span></li><li><span><b>Nach dem Training</b> Anstrengung und Knie bewerten. Daraus passe ich den Plan an.</span></li><li><span>Tippe auf einen <b>Tag in der Woche</b> oder ein <b>Übungsbild</b>, um Details zu sehen.</span></li></ol><button class="btn primary small" data-intro style="margin-top:14px">Verstanden</button></div>` : ""}
    <div class="grid today">
      <article class="hero t-${s.type}">
        ${done ? `<span class="pill good done-badge">${ICON.check.replace("<svg", '<svg style="width:14px;height:14px"')} Erledigt</span>` : ""}
        <span class="tag">${esc(s.tag)} · Heute</span>
        <h2>${esc(s.name)}</h2>
        <p class="goal">${esc(s.goal)}</p>
        ${extra.length ? `<p class="muted" style="font-size:13px">Dazu: ${esc(extra.join(", "))}</p>` : ""}
        ${photos.length ? `<div class="thumbs" aria-hidden="true">${photos.map(x => `<img src="assets/ex/${window.ExPhotos[x].id}-0.jpg" alt="" loading="lazy">`).join("")}${nEx > photos.length ? `<span>+${nEx - photos.length}</span>` : ""}</div>` : ""}
        <div class="meta">
          ${s.dur ? `<div><b class="num">${s.dur}</b><span>Minuten</span></div>` : ""}
          ${nEx ? `<div><b class="num">${nEx}</b><span>Übungen</span></div>` : ""}
          <div><b>${esc(TYPE[s.type])}</b><span>Typ</span></div>
        </div>
        <div class="actions">
          ${s.type === "football" ? `<button class="btn ${done ? "ghost" : "accent"} grow" data-quicklog="${main}" data-date="${iso(t)}">${done ? "Nochmals eintragen" : main === "spiel" ? "Spiel eintragen" : "Fussball eintragen"}</button>${!pend ? `<button class="btn ghost" data-start="${main}" data-date="${iso(t)}">${ICON.play} Aktivierung</button>` : ""}`
            : s.blocks.length && s.dur && !pend ? `<button class="btn ${done ? "ghost" : "accent"} grow" data-start="${main}" data-date="${iso(t)}">${ICON.play} ${done ? "Nochmals" : "Training starten"}</button>` : ""}
          <button class="btn ghost" data-sess="${main}" data-date="${iso(t)}">Details</button>
        </div>
        ${nextK ? `<button class="next-up" data-sess="${nextK}" data-date="${iso(nextD)}"><span class="eyebrow">Nächstes Training</span><b>${days(t, nextD) === 1 ? "Morgen" : DL[wd(nextD)]} · ${esc(sess(nextK).name)}</b><span class="muted">${esc(sess(nextK).tag)} · ${sess(nextK).dur} Min</span></button>` : ""}
      </article>
      <div class="grid">
        ${form}
        <div class="card t-accent paris"><div class="card-h"><h3>Paris</h3><button class="pill accent" data-goto="paris">Zeitrechner</button></div>
          <div style="display:flex;align-items:flex-end;gap:12px"><span class="big-num num">${left}</span><span class="muted" style="padding-bottom:8px">Tage bis zum Start<br>${fmt(rd)} ${rd.getFullYear()}</span></div>
          <div class="phase-track">${track}</div>
          <div class="phase-labels"><span>${p ? esc(p.name) : "Plan"}</span><span>${p ? "bis " + fmt(pd(p.to)) : ""}</span></div>
        </div>
      </div>
      ${coach}
      ${heuteExtras(main)}
      <div class="card span"><div class="card-h"><h3>Diese Woche</h3><span class="muted num" style="font-size:13px">${weekDone} / ${weekPlan}${isDeload(t) ? " · Entlastung" : ""}</span></div>
        <div class="progress" style="margin:-4px 0 14px"><span style="width:${Math.min(100, weekPlan ? weekDone / weekPlan * 100 : 0)}%;background:var(--accent)"></span></div><div class="strip">${strip}</div></div>
      <div class="card span"><div class="card-h"><h3>Knie Stufe</h3><button class="btn ghost small" data-open="knee">Alle Stufen</button></div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div class="stepper"><button class="icon-btn" data-knee="-1" aria-label="Stufe runter">${ICON.minus}</button><b class="num">${S.settings.kneeStage}</b><button class="icon-btn" data-knee="1" aria-label="Stufe rauf">${ICON.plus}</button></div>
          <div style="min-width:0;flex:1"><b>${esc(ks.name)}</b><p class="muted">${esc(ks.text)}</p></div>
        </div>${kneeAdviceHtml()}</div>
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
  } else if (S.planMode === "paris") {
    body = parisCalc();
  } else {
    const cur = phaseOf(t);
    body = `<div class="phases">${S.plan.phases.map(p => {
      const wk = p.days.map((ks, i) => `<span><b>${DN[i]}</b>${esc(ks.map(k => sess(k).name).join(" + "))}</span>`).join("");
      return `<article class="phase t-${p.color}${cur && cur.id === p.id ? " now" : ""}"><span class="stripe"></span><div><p class="eyebrow">${cur && cur.id === p.id ? "Jetzt" : (p.to < iso(t) ? "Abgeschlossen" : "Kommt")}</p><h3>${esc(p.name)}</h3><p class="when num">${fmt(pd(p.from))} bis ${fmt(pd(p.to))}</p><p>${esc(p.goal)}</p><div class="wk">${wk}</div></div></article>`;
    }).join("")}</div>`;
  }
  $("#v-plan").innerHTML = `<header class="head"><div><p class="eyebrow">Mitte Januar Fussball · April Paris</p><h1>Plan</h1></div>
    <div class="seg" role="group" aria-label="Ansicht"><button data-mode="woche" aria-pressed="${S.planMode === "woche"}">Woche</button><button data-mode="phasen" aria-pressed="${S.planMode === "phasen"}">Phasen</button><button data-mode="paris" aria-pressed="${S.planMode === "paris"}">Paris</button></div></header>${body}`;
}

/* Hyrox Doubles Zeitrechner: Vorlage 1:15:30, wird auf die Zielzeit skaliert */
const HX = [["Lauf", 300, "run"], ["SkiErg 1000 m", 225], ["Lauf", 300, "run"], ["Sled Push 50 m", 180], ["Lauf", 300, "run"], ["Sled Pull 50 m", 240], ["Lauf", 300, "run"], ["Burpee Broad Jumps 80 m", 210], ["Lauf", 300, "run"], ["Rudern 1000 m", 240], ["Lauf", 300, "run"], ["Farmers Carry 200 m", 105], ["Lauf", 300, "run"], ["Sandbag Lunges 100 m", 240], ["Lauf", 300, "run"], ["Wall Balls 100", 330]];
const HX_ROX = 360, HX_BASE = HX.reduce((a, x) => a + x[1], 0) + HX_ROX;
const hms = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
function parisCalc() {
  const target = S.settings.targetMin * 60, k = target / HX_BASE;
  const pace = 300 * k, runT = 8 * pace, stT = HX.filter(x => !x[2]).reduce((a, x) => a + x[1] * k, 0);
  let acc = 0;
  const rows = HX.map(([n, sec, run], i) => { acc += sec * k + HX_ROX * k / 16; return `<div class="split${run ? " run" : ""}"><span class="no num">${run ? "R" + (i / 2 + 1) : "S" + Math.ceil(i / 2)}</span><span class="tx">${esc(n)}${run ? " 1 km" : ""}</span><span class="num">${hms(sec * k)}</span><span class="num muted">${hms(acc)}</span></div>`; }).join("");
  return `${simCard()}<div class="card hx" style="margin-top:14px"><p class="eyebrow">Zielzeit Doubles</p><div class="hx-t"><b class="big-num num" id="hxOut">${hms(target)}</b></div>
    <input type="range" id="hxRange" min="60" max="110" step="1" value="${S.settings.targetMin}" aria-label="Zielzeit in Minuten">
    <div class="kv" style="margin-top:14px"><div><b class="num">${hms(pace)}</b><span>Pace pro km</span></div><div><b class="num">${hms(runT)}</b><span>8 km Laufen</span></div><div><b class="num">${hms(stT)}</b><span>Stationen</span></div><div><b class="num">${hms(HX_ROX * k)}</b><span>Roxzone Wechsel</span></div></div></div>
    <div class="card" style="margin-top:14px"><div class="card-h"><h3>Splits</h3><span class="muted" style="font-size:12px">Zeit · kumuliert</span></div><div class="splits">${rows}</div>
    <p class="muted" style="font-size:12.5px;margin-top:12px">Richtwerte für Doubles: Ihr lauft beide jeden Kilometer, die Stationen teilt ihr. Im Training siehst du an deiner Laufpace, ob die Zielzeit realistisch ist.</p></div>`;
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
  $("#exList").innerHTML = list.length ? list.map(([id, e]) => `<button class="exitem t-${CAT_TYPE[e.cat] || "rest"}" data-ex="${id}"><span class="ic anim-mini" data-anim="${id}" data-still></span><span class="tx"><b>${esc(e.name)}</b><span>${esc(e.cat)} · ${esc(e.equip)}</span></span></button>`).join("")
    : `<div class="empty"><b>Keine Übung gefunden.</b><span>Versuche einen anderen Begriff oder wähle «Alle».</span></div>`;
  scanAnim($("#exList"));
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
    : `<div class="empty span"><b>Garmin Daten sind privat.</b><span>So siehst du sie auf diesem Gerät:</span><ol><li>Die Garmin Daten liegen privat im Repository training-data.</li><li>Unter Einstellungen bei «Sync über GitHub» deinen Schlüssel eintragen.</li><li>Danach erscheinen Schlaf, Aktivitäten und Verlauf hier.</li></ol></div>`;

  const acts = ((S.garmin && S.garmin.activities) || []).slice(0, 8);
  // Körpergewicht
  const B = S.body.slice().sort((a, b) => a.date.localeCompare(b.date));
  const BK = B.filter(x => x.kg), bPts = BK.slice(-30).map(x => ({ v: x.kg, l: fmt(pd(x.date)) }));
  const bLast = BK[BK.length - 1], b4 = BK.filter(x => x.date <= iso(addD(t, -28))).pop();
  const bDelta = bLast && b4 ? bLast.kg - b4.kg : null;
  const bvs = bPts.map(x => x.v);
  const bodyCard = `<div class="card chart"><div class="card-h"><h3>Körpergewicht</h3><span class="num muted">${bLast ? fmtKg(bLast.kg) + " kg" : ""}${bDelta != null ? ` <span style="color:${bDelta <= 0 ? "var(--good)" : "var(--warn)"}">${bDelta > 0 ? "+" : ""}${fmtKg(bDelta)}</span>` : ""}</span></div>
    ${bPts.length >= 2 ? lineChart(bPts, { min: Math.floor(Math.min(...bvs) - 1), max: Math.ceil(Math.max(...bvs) + 1), color: "var(--endurance)", label: "Körpergewicht", unit: " kg" }) : `<p class="muted">Wiege dich 1 bis 2 Mal pro Woche morgens nüchtern. Ab zwei Werten erscheint der Verlauf.</p>`}
    ${(() => { const wv = B.filter(x => x.waist).slice(-1)[0], w0 = B.filter(x => x.waist)[0]; return wv ? `<p class="muted" style="font-size:13px;margin-top:8px">Bauchumfang ${fmtKg(wv.waist)} cm${w0 && w0 !== wv ? ` · seit Start ${wv.waist - w0.waist > 0 ? "+" : ""}${fmtKg(wv.waist - w0.waist)} cm` : ""}</p>` : ""; })()}
    <form class="row" id="bodyForm" style="margin-top:12px"><input class="input num" id="bodyKg" inputmode="decimal" placeholder="kg" aria-label="Gewicht in kg" style="flex:1;min-width:100px"><input class="input num" id="bodyWaist" inputmode="decimal" placeholder="Bauch cm" aria-label="Bauchumfang in cm auf Höhe Bauchnabel" style="flex:1;min-width:100px"><button class="btn primary small" type="submit">Eintragen</button></form></div>`;
  // Heatmap 12 Wochen
  const hmStart = addD(ws, -77); let hm = "";
  for (let w = 0; w < 12; w++) { hm += `<div class="hm-col">`; for (let d = 0; d < 7; d++) { const day = addD(hmStart, w * 7 + d), ds = iso(day); const m = S.logs.filter(l => l.date === ds).reduce((a, l) => a + (l.dur || 30), 0); const lv = day > t ? -1 : m === 0 ? 0 : m < 40 ? 1 : m < 75 ? 2 : 3; hm += `<i class="l${lv}" title="${fmt(day)}${m ? " · " + m + " Min" : ""}"></i>`; } hm += `</div>`; }
  // Rekorde
  const prs = Object.keys(S.plan.exercises).map(id => { const h = exHistory(id); if (!h.length) return null; const b = h.reduce((x, y) => y.best.v > x.best.v ? y : x); return { id, b }; }).filter(Boolean).sort((a, b) => b.b.best.v - a.b.best.v).slice(0, 6);
  const logs = L.slice(0, 30).map(l => { const s = sess(l.session); const d = pd(l.date);
    return `<div class="logrow"><div class="dt"><b>${d.getDate()}</b>${MON[d.getMonth()]}</div><div class="tx"><b>${esc(s ? s.name : "Einheit")}</b><span>${[l.dur ? l.dur + " Min" : "", l.rpe ? "RPE " + l.rpe : "", l.note || ""].filter(Boolean).map(esc).join(" · ")}</span></div>
      <div style="display:flex;gap:6px;align-items:center">${l.knee != null ? `<span class="kb" style="--c:${kneeColor(l.knee)}" title="Knie">K ${l.knee}</span>` : ""}<button class="icon-btn" style="width:32px;height:32px" data-del="${esc(l.id)}" aria-label="Eintrag löschen">${ICON.close}</button></div></div>`; }).join("");

  $("#v-fortschritt").innerHTML = `<header class="head"><div><p class="eyebrow">Logbuch und Garmin</p><h1>Fortschritt</h1></div>
    <div class="row"><button class="btn ghost small" data-review="${iso(wd(t) >= 5 ? ws : addD(ws, -7))}">Rückblick</button><button class="btn ghost small" data-open="log">${ICON.plus} Eintrag</button></div></header>
    <div class="stats"><div class="stat"><b class="num">${thisWeek}</b><span>Einheiten diese Woche</span></div><div class="stat"><b class="num">${minutes}</b><span>Minuten in 4 Wochen</span></div><div class="stat"><b class="num">${streak}</b><span>Wochen in Folge mit 4+</span></div></div>
    <div class="cols">
      ${historyCard()}
      <div class="card chart"><div class="card-h"><h3>Einheiten pro Woche</h3><span class="muted" style="font-size:12px">Ziel 5</span></div>${bars}</div>
      <div class="card chart"><div class="card-h"><h3>Knie</h3><span class="muted" style="font-size:12px">0 bis 10</span></div>${lineChart(K, { min: 0, max: 10, color: "var(--accent)", label: "Knieschmerz", band: [3, 10, "var(--bad)"] })}</div>
      ${loadCard()}
      ${benchCard()}
      ${bodyCard}
      ${photoCard()}
      ${simCard()}
      <div class="card"><div class="card-h"><h3>Aktivität</h3><span class="muted" style="font-size:12px">12 Wochen</span></div><div class="heat">${hm}</div><div class="heat-l"><span>weniger</span><i class="l1"></i><i class="l2"></i><i class="l3"></i><span>mehr</span></div></div>
      ${prs.length ? `<div class="card"><div class="card-h"><h3>Bestwerte</h3><span class="muted" style="font-size:12px">bester Satz</span></div><div class="items">${prs.map(x => `<button class="item" data-ex="${x.id}"><span class="tx"><b>${esc(S.plan.exercises[x.id].name)}</b><span>${fmt(pd(x.b.date))}</span></span><span class="dose">${fmtKg(x.b.best.w)} kg × ${x.b.best.r}</span></button>`).join("")}</div></div>` : ""}
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
  scanAnim($("#sheetBody"));
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#sheetClose").focus(), 30);
}
function closeSheet() { $("#sheet").hidden = true; $("#backdrop").hidden = true; if ($("#player").hidden) document.body.style.overflow = ""; if (lastFocus && lastFocus.isConnected) lastFocus.focus(); }

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
  const H = exHistory(id), hv = H.map(h => Math.round(h.best.v)), best = H.length ? H.reduce((x, y) => y.best.v > x.best.v ? y : x) : null;
  const histChart = H.length >= 2 ? `<div class="chart"><p class="block-t">Kraftverlauf (geschätztes Maximum)</p>${lineChart(H.slice(-20).map(h => ({ v: Math.round(h.best.v), l: fmt(pd(h.date)) })), { min: Math.floor(Math.min(...hv) * .9), max: Math.ceil(Math.max(...hv) * 1.05), color: "var(--accent)", label: "Kraftverlauf", unit: " kg" })}</div>` : "";
  openSheet(`<div class="anim t-${CAT_TYPE[e.cat] || "rest"}" data-anim="${id}"></div><div><p class="eyebrow">${esc(e.cat)} · ${esc(e.equip)}</p><h2 id="sheetTitle" style="margin-top:8px">${esc(e.name)}</h2></div>
    <a class="btn ghost block" href="https://www.youtube.com/results?search_query=${encodeURIComponent((e.yt || e.name) + " Ausführung")}" target="_blank" rel="noopener">${ICON.play} Video ansehen</a>
    <div><p class="block-t">So gehts</p><ol class="howlist">${e.how.map(h => `<li>${esc(h)}</li>`).join("")}</ol></div>
    <div class="callout t-gym"><b>Typischer Fehler:</b> ${esc(e.err)}</div>
    <div><p class="block-t">Alternative</p><p>${esc(e.alt)}</p></div>
    ${best ? `<div class="stats" style="margin:0"><div class="stat"><b class="num">${fmtKg(best.best.w)}</b><span>kg Bestwert</span></div><div class="stat"><b class="num">${best.best.r}</b><span>Wdh dabei</span></div><div class="stat"><b class="num">${H.length}</b><span>Trainings</span></div></div>` : ""}
    ${histChart}
    ${hist.length ? `<div><p class="block-t">Deine letzten Gewichte</p><div class="items">${hist.map(l => `<div class="item static"><span class="tx"><b>${fmt(pd(l.date))}</b></span><span class="dose">${l.sets[id].filter(x => x.w || x.r).map(x => (x.w || "-") + " kg × " + (x.r || "-")).join("  ")}</span></div>`).join("")}</div></div>` : ""}`);
}
function settingsSheet() {
  openSheet(`<h2 id="sheetTitle">Einstellungen</h2>
    <div class="field"><label for="setRace">Renntag in Paris (${esc(S.plan.race.window)})</label><input class="input" type="date" id="setRace" value="${raceDate()}" min="2027-04-08" max="2027-04-12"></div>
    ${settingsExtras()}
    <p class="muted" style="font-size:12.5px">Übungsfotos: Free Exercise DB (gemeinfrei). Plan Version ${S.plan.version} · Stand ${fmt(pd(S.plan.updated))}${S.garmin && S.garmin.updated ? " · Garmin " + fmt(new Date(S.garmin.updated)) : ""}</p>`);
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

const scanAnim = root => { if (window.ExAnim) window.ExAnim.scan(root); };

/* ---------- Training Player ---------- */
const P = { k: null, date: null, steps: [], i: 0, start: 0, timer: null, sets: {}, rest: null, list: false };
const mmss = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
function lastSets(ex) { const l = S.logs.filter(x => x.sets && x.sets[ex] && x.sets[ex].some(s => s.w || s.r)).sort((a, b) => b.date.localeCompare(a.date))[0]; return l ? l.sets[ex] : null; }
const isStrength = st => /^\d/.test(st.reps) && st.sets > 1 && !/(Min|m |km|s$|s je|Schritte|Wdh in)/.test(st.reps + " ");
const targetReps = st => (st.reps.match(/\d+/) || [""])[0];
function timedSec(st) {
  if (isStrength(st) || /\bbis\b/.test(st.reps)) return 0;
  const m = st.reps.match(/(\d+)\s*Min\b/); if (m) return +m[1] * 60;
  const x = st.reps.match(/(\d+)\s*s\b/); return x ? +x[1] : 0;
}
const stepName = st => { const e = st.ex && S.plan.exercises[st.ex]; return e ? e.name : st.reps; };
const savePlayer = () => store.set("player", { k: P.k, date: P.date, i: P.i, start: P.start, sets: P.sets, saved: Date.now() });
const clearPlayer = () => { try { localStorage.removeItem("pp27.player"); } catch {} };
function pendingPlayer() { const p = store.get("player", null); return p && p.k && S.plan.sessions[p.k] && Date.now() - p.saved < 12 * 3600e3 ? p : null; }

function startPlayer(k, date, resume) {
  const s = sess(k);
  P.k = k; P.date = date; P.i = 0; P.start = Date.now(); P.sets = {}; P.list = false;
  if (resume) { P.i = resume.i; P.start = resume.start; P.sets = resume.sets || {}; }
  P.steps = []; s.blocks.forEach(b => b.items.forEach(it => P.steps.push({ ...it, block: b.title })));
  P.i = Math.min(P.i, P.steps.length - 1);
  closeSheet();
  $("#player").hidden = false; $("#player").className = "player t-" + s.type;
  document.body.style.overflow = "hidden";
  clearInterval(P.timer); P.timer = setInterval(() => { const el = $("#pTime"); if (el) el.textContent = mmss((Date.now() - P.start) / 1000); }, 1000);
  try { navigator.wakeLock && navigator.wakeLock.request("screen").then(l => P.lock = l).catch(() => {}); } catch {}
  savePlayer(); renderPlayer();
}
function ensureRows(i) {
  const st = P.steps[i];
  if (P.sets[i]) return P.sets[i];
  const sg = st.ex && isStrength(st) ? suggest(st) : null;
  return (P.sets[i] = Array.from({ length: st.sets || 1 }, () => ({ w: sg ? fmtKg(sg.w) : "", r: "", d: false })));
}
const stepDone = i => !!P.sets[i] && P.sets[i].every(x => x.d);
function renderPlayer() {
  const s = sess(P.k), st = P.steps[P.i], e = st.ex && S.plan.exercises[st.ex];
  const n = P.steps.length, rows = ensureRows(P.i), strength = isStrength(st), prev = st.ex ? lastSets(st.ex) : null;
  const tsec = timedSec(st), allDone = rows.every(x => x.d), next = P.steps[P.i + 1];
  const setRows = rows.map((r, j) => strength
    ? `<div class="set${r.d ? " done" : ""}"><span class="no">${j + 1}</span><input inputmode="decimal" aria-label="Satz ${j + 1} Gewicht in kg" placeholder="kg" value="${esc(r.w)}" data-set="${j}" data-f="w"><input inputmode="numeric" aria-label="Satz ${j + 1} Wiederholungen" placeholder="${esc(targetReps(st))}" value="${esc(r.r)}" data-set="${j}" data-f="r"><button class="ok${r.d ? " on" : ""}" data-done="${j}" aria-label="Satz ${j + 1} erledigt" aria-pressed="${r.d}">${ICON.check}</button></div>`
    : `<div class="set${r.d ? " done" : ""}" style="grid-template-columns:34px 1fr 48px"><span class="no">${j + 1}</span><span style="font-weight:600">${esc(st.reps)}</span><button class="ok${r.d ? " on" : ""}" data-done="${j}" aria-label="Durchgang ${j + 1} erledigt" aria-pressed="${r.d}">${ICON.check}</button></div>`).join("");
  const kneeNote = st.ex === "treadmill" && (s.knee || P.k === "ausdLang" || P.k === "hx3" || P.k === "simu") ? `<div class="callout t-accent"><b>Knie Stufe ${S.settings.kneeStage}:</b> ${esc(S.plan.kneeStages[S.settings.kneeStage].text)}</div>` : "";
  const overview = P.list ? `<div class="p-list" role="list">${P.steps.map((x, j) => `<button class="p-li${j === P.i ? " cur" : ""}" data-jump="${j}" role="listitem"><span class="ck${stepDone(j) ? " on" : ""}">${stepDone(j) ? ICON.check : j + 1}</span><span class="tx"><b>${esc(stepName(x))}</b><span>${esc(x.block)} · ${x.sets > 1 ? x.sets + " × " : ""}${esc(x.reps)}</span></span></button>`).join("")}</div>` : "";
  const nextBtn = P.i < n - 1 ? `<button class="btn ${allDone ? "accent" : "primary"}" id="pNext">${allDone ? "Nächste Übung" : "Weiter"} ${ICON.right}</button>` : `<button class="btn accent" id="pFinish">${ICON.check} Abschliessen</button>`;
  $("#player").innerHTML = `
    <div class="p-top"><button class="icon-btn" id="pClose" aria-label="Training beenden">${ICON.close}</button><div class="tx"><b>${esc(s.name)}</b><span class="num" id="pTime">${mmss((Date.now() - P.start) / 1000)}</span></div><button class="pill num p-count" id="pList" aria-expanded="${P.list}" aria-label="Alle Übungen anzeigen">${P.i + 1} / ${n} ${P.list ? ICON.close.replace("<svg", '<svg style="width:12px;height:12px"') : "☰"}</button></div>
    <div class="p-prog" aria-hidden="true">${P.steps.map((_, j) => `<i class="${stepDone(j) ? "on" : j === P.i ? "cur" : ""}"></i>`).join("")}</div>
    ${overview}
    <div class="p-body"${P.list ? " hidden" : ""}>
      ${e ? `<button class="anim anim-btn" data-anim="${st.ex}" data-ex="${st.ex}" aria-label="Anleitung ${esc(e.name)} öffnen"></button>` : ""}
      <div><p class="eyebrow">${esc(st.block)}</p><h2 style="margin-top:8px">${esc(stepName(st))}</h2></div>
      <div class="p-target"><span class="big num">${st.sets > 1 ? st.sets + " × " : ""}${esc(st.reps)}</span>${st.rest ? `<span class="pill">Pause ${st.rest >= 60 ? (st.rest / 60).toString().replace(".", ",") + " Min" : st.rest + " s"}</span>` : ""}${st.cue ? `<span class="pill accent">${esc(st.cue)}</span>` : ""}</div>
      ${kneeNote}
      ${strength && st.ex && suggest(st) ? `<div class="sug${suggest(st).up ? " up" : ""}"><b>${suggest(st).up ? "↑ " : ""}${fmtKg(suggest(st).w)} kg</b><span>${esc(suggest(st).text)}</span></div>` : ""}
      ${prev && strength ? `<p class="last">Letztes Mal: ${prev.filter(x => x.w || x.r).map(x => (x.w || "-") + " kg × " + (x.r || "-")).join(", ")}</p>` : ""}
      ${tsec && !allDone ? `<button class="btn accent block" id="pTimer">${ICON.play} Timer starten · ${mmss(tsec)}</button>` : ""}
      ${strength ? `<div class="set-h"><span>Satz</span><span>kg</span><span>Wdh</span><span></span></div>` : ""}
      <div class="sets">${setRows}</div>
      ${strength && !allDone ? `<p class="hint">Gewicht eintragen und Haken setzen. Leere Wiederholungen zählen als ${esc(targetReps(st))}.</p>` : ""}
      ${allDone && next ? `<div class="up-next"><span class="eyebrow">Als nächstes</span><b>${esc(stepName(next))}</b><span class="muted">${next.sets > 1 ? next.sets + " × " : ""}${esc(next.reps)}</span></div>` : ""}
      ${e ? `<button class="btn ghost" data-ex="${st.ex}">${ICON.info} So gehts</button>` : ""}
    </div>
    <div class="p-foot"><button class="btn ghost" id="pPrev" ${P.i === 0 ? "disabled" : ""} aria-label="Vorherige Übung">${ICON.left}</button>${nextBtn}</div>`;
  scanAnim($("#player"));
}
function go(i) { stopRest(); P.i = Math.max(0, Math.min(P.steps.length - 1, i)); P.list = false; savePlayer(); renderPlayer(); const b = $(".p-body"); if (b) b.scrollTop = 0; }

/* Countdown Overlay: Pause zwischen Sätzen oder Arbeitszeit bei Zeitübungen */
function countdown(sec, { label, sub, then, work }) {
  stopRest();
  const el = document.createElement("div"); el.className = "rest" + (work ? " work" : ""); el.id = "rest";
  P.rest = { end: Date.now() + sec * 1000, total: sec, el, then };
  el.innerHTML = `<div class="rest-in"><p class="eyebrow">${esc(label)}</p><div class="ring" id="rRing"></div>${sub ? `<p class="rest-sub">${sub}</p>` : ""}<div class="row"><button class="btn ghost" id="rMinus">−15 s</button><button class="btn ghost" id="rPlus">+15 s</button></div><button class="btn primary" id="rSkip">${work ? "Fertig" : "Pause überspringen"}</button></div>`;
  el.style.setProperty("--c", getComputedStyle($("#player")).getPropertyValue("--c"));
  document.body.appendChild(el);
  const draw = () => {
    if (!P.rest) return;
    const left = Math.max(0, (P.rest.end - Date.now()) / 1000);
    $("#rRing").innerHTML = ring(left / P.rest.total, "var(--c,var(--accent))", 230, 12) + `<div class="v"><div><b class="num">${mmss(Math.ceil(left))}</b></div></div>`;
    if (left <= 0) { buzz([120, 80, 120]); endRest(); }
  };
  draw(); P.rest.iv = setInterval(draw, 250);
  $("#rSkip").focus();
}
function stopRest() { if (P.rest) { clearInterval(P.rest.iv); P.rest.el.remove(); P.rest = null; } }
function endRest() { const f = P.rest && P.rest.then; stopRest(); if (f) f(); }

function afterCheck(j) {
  const st = P.steps[P.i], rows = P.sets[P.i], n = P.steps.length;
  const open = rows.filter(x => !x.d).length;
  if (open > 0) { if (st.rest) countdown(st.rest, { label: "Pause", sub: `Als nächstes: Satz ${rows.findIndex(x => !x.d) + 1} von ${rows.length}` }); return; }
  if (P.i >= n - 1) { renderPlayer(); toast("Letzte Übung geschafft"); return; }
  const nx = P.steps[P.i + 1];
  if (st.rest) countdown(st.rest, { label: "Pause", sub: `Als nächstes: <b>${esc(stepName(nx))}</b>`, then: () => go(P.i + 1) });
  else setTimeout(() => go(P.i + 1), 450);
}
function closePlayer() { clearInterval(P.timer); stopRest(); try { P.lock && P.lock.release(); } catch {} $("#player").hidden = true; document.body.style.overflow = ""; }
function askClose() {
  const any = Object.values(P.sets).some(a => a.some(x => x.d));
  openSheet(`<h2 id="sheetTitle">Training beenden?</h2><p class="muted">${any ? "Du hast schon Sätze erledigt. Speichere das Training, damit es im Logbuch erscheint." : "Noch nichts erledigt."}</p>
    <div class="stack">${any ? `<button class="btn accent block" id="cSave">Speichern und beenden</button>` : ""}<button class="btn primary block" id="cBack">Weitermachen</button><button class="btn ghost block" id="cDrop">Verwerfen</button></div>`);
  $("#cBack").addEventListener("click", closeSheet);
  if (any) $("#cSave").addEventListener("click", () => { closeSheet(); finishPlayer(); });
  $("#cDrop").addEventListener("click", e => { if (e.currentTarget.dataset.c !== "1") { e.currentTarget.dataset.c = "1"; e.currentTarget.textContent = "Wirklich verwerfen?"; e.currentTarget.style.color = "var(--bad)"; return; } closeSheet(); closePlayer(); clearPlayer(); renderHeute(); toast("Training verworfen"); });
}
function finishPlayer() {
  const mins = Math.max(1, Math.round((Date.now() - P.start) / 60000));
  const s = sess(P.k);
  const doneSets = Object.values(P.sets).reduce((a, r) => a + r.filter(x => x.d).length, 0);
  let kg = 0; P.steps.forEach((st, i) => { if (P.sets[i] && isStrength(st)) P.sets[i].forEach(x => { if (x.d) kg += (parseFloat(String(x.w).replace(",", ".")) || 0) * (parseInt(x.r || targetReps(st)) || 0); }); });
  const recs = [];
  P.steps.forEach((st, i) => { if (!st.ex || !P.sets[i] || !isStrength(st)) return; const old = exHistory(st.ex).reduce((m, h) => Math.max(m, h.best.v), 0); P.sets[i].filter(x => x.d).forEach(x => { const v = e1rm(num(x.w), num(x.r || targetReps(st))); if (old > 0 && v > old + 0.01 && !recs.find(r => r.ex === st.ex)) recs.push({ ex: st.ex, w: num(x.w), r: x.r || targetReps(st) }); }); });
  closePlayer();
  if (recs.length) buzz([60, 40, 60, 40, 120]);
  openSheet(`${recs.length ? `<div class="pr-banner"><span class="eyebrow">Neuer Bestwert</span>${recs.map(r => `<b>${esc(S.plan.exercises[r.ex].name)} · ${fmtKg(r.w)} kg × ${r.r}</b>`).join("")}</div>` : ""}<div><p class="eyebrow">Geschafft</p><h2 id="sheetTitle" style="margin-top:8px">${esc(s.name)}</h2></div>
    <div class="stats" style="margin:0"><div class="stat"><b class="num">${mins}</b><span>Minuten</span></div><div class="stat"><b class="num">${doneSets}</b><span>Sätze</span></div><div class="stat"><b class="num">${kg ? Math.round(kg).toLocaleString("de-CH") : "-"}</b><span>kg bewegt</span></div></div>
    ${finishFields()}<button class="btn accent block" id="fSave">Speichern</button>`);
  bindScales();
  $("#fSave").addEventListener("click", () => {
    const sets = {};
    P.steps.forEach((st, i) => { if (st.ex && P.sets[i] && isStrength(st)) { const v = P.sets[i].filter(x => x.d && (x.w || x.r)).map(x => ({ w: x.w, r: x.r || targetReps(st) })); if (v.length) sets[st.ex] = (sets[st.ex] || []).concat(v); } });
    S.logs.push({ id: uid(), date: P.date, session: P.k, dur: mins, ...readFinish(), sets, ts: new Date().toISOString() });
    saveLogs(); clearPlayer(); closeSheet(); renderAll(); toast("Training gespeichert");
  });
}

/* Tagesansicht aus der Wochenleiste */
function daySheet(date) {
  const d = pd(date), ks = sessionsFor(d);
  const real = ks.filter(k => sess(k).dur);
  if (real.length === 1 && ks.length === 1) return sessionSheet(real[0], date);
  openSheet(`<div><p class="eyebrow">${DL[wd(d)]}, ${fmt(d)}</p><h2 id="sheetTitle" style="margin-top:8px">${real.length ? "Dein Tag" : "Ruhetag"}</h2></div>
    <div class="ss" style="display:flex;flex-direction:column;gap:8px">${ks.map(k => { const s = sess(k), dn2 = isDone(date, k); return `<button class="srow t-${s.type}" data-sess="${k}" data-date="${date}"><span class="bar"></span><span class="tx"><b>${esc(s.name)}</b><span>${esc(s.tag)}${s.dur ? " · " + s.dur + " Min" : ""}</span></span>${s.dur ? `<span class="ck${dn2 ? " on" : ""}">${dn2 ? ICON.check : ""}</span>` : ""}</button>`; }).join("") || '<p class="muted">Kein Training geplant.</p>'}</div>`);
}

/* ================= Erweiterungen ================= */
const icon = (p, s = 18) => `<svg viewBox="0 0 24 24" style="width:${s}px;height:${s}px">${p}</svg>`;
const parseTime = s => { const m = String(s || "").trim().match(/^(?:(\d+):)?(\d{1,2})[:.,](\d{1,2})$/) || String(s || "").trim().match(/^(\d+)$/); if (!m) return 0; if (m.length === 2) return +m[1]; return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]); };
const saveKey = (k, v) => { store.set(k, v); scheduleSync(); };

/* ---------- Belastungsampel (Sitzungs RPE × Minuten, akut 7 Tage zu chronisch 28 Tage) ---------- */
const sessLoad = l => (l.dur || 0) * (l.rpe || 5);
function loadStats(ref = now()) {
  const sum = (a, b) => S.logs.filter(l => l.date >= iso(a) && l.date <= iso(b)).reduce((x, l) => x + sessLoad(l), 0);
  const acute = sum(addD(ref, -6), ref), chronic = sum(addD(ref, -27), ref) / 4;
  const ratio = chronic > 0 ? acute / chronic : null;
  let st;
  if (ratio == null || chronic < 400) st = { c: "rest", lvl: 0, t: "Baut sich auf", a: "Nach 2 bis 3 Wochen mit Einträgen (Minuten und Anstrengung) zeigt die Ampel deine Belastung." };
  else if (ratio > 1.5) st = { c: "bad", lvl: 3, t: "Zu viel auf einmal", a: "Deutlich mehr als du gewohnt bist. Nächste Gym oder Ausdauer Einheit locker oder Ruhetag. Fussball normal." };
  else if (ratio > 1.3) st = { c: "warn", lvl: 2, t: "Hohe Belastung", a: "Gut für Fortschritt, aber nicht lange halten. Schlaf und Essen im Blick." };
  else if (ratio < 0.8) st = { c: "warn", lvl: 1, t: "Weniger als üblich", a: "Eine Entlastungswoche ist ok. Sonst wieder ins normale Volumen zurück." };
  else st = { c: "good", lvl: 1, t: "Im grünen Bereich", a: "Belastung passt zu dem, was du gewohnt bist." };
  return { acute, chronic, ratio, st };
}
const loadGroup = l => { const s = sess(l.session); return s ? (s.type === "accent" ? "hyrox" : s.type) : "gym"; };
function loadCard() {
  const L = loadStats(), ws = monday(now());
  const weeks = []; for (let i = 7; i >= 0; i--) weeks.push(addD(ws, -7 * i));
  const G = ["football", "gym", "hyrox", "endurance"], GN = { football: "Fussball", gym: "Gym", hyrox: "Hyrox", endurance: "Ausdauer" };
  const data = weeks.map(w => { const o = {}; G.forEach(g => o[g] = 0); S.logs.filter(l => l.date >= iso(w) && l.date <= iso(addD(w, 6))).forEach(l => { const g = loadGroup(l); if (o[g] != null) o[g] += sessLoad(l); }); return o; });
  const mx = Math.max(1500, ...data.map(o => G.reduce((a, g) => a + o[g], 0)));
  const W = 340, H = 150, bw = (W - 20) / 8;
  const bars = data.map((o, i) => { let y = H - 22; return G.map(g => { const h = o[g] / mx * (H - 36); y -= h; return h > 0 ? `<rect x="${10 + i * bw + 6}" y="${y}" width="${bw - 12}" height="${h}" fill="var(--${g})" rx="2"/>` : ""; }).join("") + `<text x="${10 + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${kw(weeks[i])}</text>`; }).join("");
  return `<div class="card"><div class="card-h"><h3>Belastung</h3><span class="pill ${L.st.c === "good" ? "good" : L.st.c === "rest" ? "" : "warn"}">${L.ratio ? L.ratio.toFixed(2).replace(".", ",") : "-"}</span></div>
    <div class="amp"><div class="lights"><i class="${L.st.c === "good" ? "on g" : ""}"></i><i class="${L.st.c === "warn" ? "on y" : ""}"></i><i class="${L.st.c === "bad" ? "on r" : ""}"></i></div><div><b>${esc(L.st.t)}</b><p class="muted" style="font-size:13px">${esc(L.st.a)}</p></div></div>
    <div class="chart" style="margin-top:12px"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Belastung pro Woche">${bars}</svg></div>
    <div class="legend">${G.map(g => `<span><i style="background:var(--${g})"></i>${GN[g]}</span>`).join("")}</div></div>`;
}

/* ---------- Knie Ampel ---------- */
const RUN_SESS = ["laufRW", "ausdLang", "hx3", "simu", "spiel"];
function kneeAdvice() {
  const st = S.settings.kneeStage, max = S.plan.kneeStages.length - 1, since = S.settings.kneeStageSince || "2000-01-01";
  const recent = S.logs.filter(l => l.knee != null && l.date >= iso(addD(now(), -7)));
  if (st > 0 && recent.some(l => l.knee >= 4)) return { dir: -1, c: "bad", t: `Das Knie meldete diese Woche ${Math.max(...recent.map(l => l.knee))} von 10. Eine Stufe zurück und Physio fragen.` };
  const runs = S.logs.filter(l => RUN_SESS.includes(l.session) && l.knee != null && l.date >= since).sort((a, b) => a.date.localeCompare(b.date));
  const last2 = runs.slice(-2);
  if (st < max && last2.length === 2 && last2.every(l => l.knee <= 2)) return { dir: 1, c: "good", t: `Zwei Läufe mit höchstens 2 von 10. Bereit für Stufe ${st + 1}: ${S.plan.kneeStages[st + 1].name}.` };
  const need = 2 - last2.filter(l => l.knee <= 2).length;
  return { dir: 0, c: "warn", t: need > 0 ? `Noch ${need} Lauf${need > 1 ? "e" : ""} mit Knie höchstens 2 von 10 auf dieser Stufe, dann geht es weiter.` : "Stufe halten." };
}
function kneeAdviceHtml() {
  const a = kneeAdvice();
  return `<div class="knee-adv ${a.c}"><span class="dot"></span><p>${esc(a.t)}</p>${a.dir ? `<button class="btn small ${a.dir > 0 ? "accent" : "ghost"}" data-kneeset="${S.settings.kneeStage + a.dir}">${a.dir > 0 ? "Stufe rauf" : "Stufe runter"}</button>` : ""}</div>`;
}
function setKnee(v) { S.settings.kneeStage = Math.max(0, Math.min(S.plan.kneeStages.length - 1, v)); S.settings.kneeStageSince = iso(now()); saveSettings(); scheduleSync(); }

/* ---------- Benchmarks ---------- */
const TESTS = [
  { id: "run1k", name: "1 km Lauf", sub: "Laufband 1 Prozent, Vollgas", knee: true },
  { id: "ski1k", name: "1000 m SkiErg", sub: "Damper 5 bis 6" },
  { id: "row1k", name: "1000 m Rudern", sub: "Damper 5 bis 6" },
  { id: "wb100", name: "100 Wall Balls", sub: "Medizinball 6 kg, 3 m Ziel" }
];
const benchLast = () => S.bench.reduce((m, b) => b.date > m ? b.date : m, "");
const benchDue = () => { const l = benchLast(); return !l || days(pd(l), now()) >= 42; };
function benchCard() {
  const rows = TESTS.map(tt => {
    const h = S.bench.filter(b => b.test === tt.id).sort((a, b) => a.date.localeCompare(b.date));
    if (!h.length) return `<div class="bench"><div class="tx"><b>${tt.name}</b><span>${tt.sub}</span></div><span class="muted num">offen</span></div>`;
    const best = Math.min(...h.map(x => x.sec)), first = h[0].sec, last = h[h.length - 1];
    const imp = first > last.sec ? Math.round((first - last.sec) / first * 100) : 0;
    const pts = h.slice(-8), mx = Math.max(...pts.map(x => x.sec)), mn = Math.min(...pts.map(x => x.sec));
    const spark = pts.length > 1 ? `<svg viewBox="0 0 60 22" class="spark"><polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${pts.map((x, i) => `${i * 60 / (pts.length - 1)},${mx === mn ? 11 : 3 + (x.sec - mn) / (mx - mn) * 16}`).join(" ")}"/></svg>` : "";
    return `<div class="bench"><div class="tx"><b>${tt.name}</b><span>Bestzeit ${hms(best)}${imp ? ` · <em class="good">${imp} Prozent schneller</em>` : ""}</span></div>${spark}<b class="num">${hms(last.sec)}</b></div>`;
  }).join("");
  const l = benchLast();
  return `<div class="card"><div class="card-h"><h3>Benchmarks</h3><button class="btn ghost small" data-bench="new">${ICON.plus} Test</button></div>
    <div class="benches">${rows}</div><p class="muted" style="font-size:12.5px;margin-top:10px">${l ? `Letzter Test ${fmt(pd(l))}. Nächster ab ${fmt(addD(pd(l), 42))}.` : "Alle 6 Wochen testen. Am besten am Samstag statt der Gym Einheit."}</p></div>`;
}
let SW = null;
function benchSheet(test) {
  openSheet(`<h2 id="sheetTitle">Benchmark eintragen</h2>
    <div class="chips" role="group" aria-label="Test" style="flex-wrap:wrap">${TESTS.map(tt => `<button class="chip" data-btest="${tt.id}" aria-pressed="${tt.id === (test || TESTS[0].id)}">${tt.name}</button>`).join("")}</div>
    <div class="sw"><b class="big-num num" id="swOut">0:00</b><div class="row"><button class="btn accent" id="swGo">${ICON.play} Stoppuhr</button><button class="btn ghost" id="swReset">Zurücksetzen</button></div></div>
    <div class="field"><label for="bTime">Zeit (Minuten:Sekunden)</label><input class="input num" id="bTime" inputmode="numeric" placeholder="z.B. 3:45"></div>
    <div class="field"><label for="bDate">Datum</label><input class="input" type="date" id="bDate" value="${iso(now())}"></div>
    <p class="muted" style="font-size:12.5px" id="bHint">${TESTS[0].knee ? "Beim Lauf: nur ab Knie Stufe 4. Sonst den Test auf dem Velo ersetzen oder auslassen." : ""}</p>
    <button class="btn accent block" id="bSave">Speichern</button>`);
  SW = { t0: 0, acc: 0, iv: null };
}
function swDraw() { const s = SW.acc + (SW.t0 ? (Date.now() - SW.t0) / 1000 : 0); const o = $("#swOut"); if (o) o.textContent = mmss(s); return s; }

/* ---------- Hyrox Simulation ---------- */
const SIM = { on: false, t0: 0, seg: 0, splits: [], who: {}, iv: null, segT0: 0 };
const simTarget = i => HX[i][1] * (S.settings.targetMin * 60 / HX_BASE) + HX_ROX * (S.settings.targetMin * 60 / HX_BASE) / 16;
function startSim() {
  Object.assign(SIM, { on: true, t0: Date.now(), seg: 0, splits: [], who: {}, segT0: Date.now() });
  const el = $("#player"); el.hidden = false; el.className = "player t-hyrox"; document.body.style.overflow = "hidden";
  try { navigator.wakeLock && navigator.wakeLock.request("screen").then(l => SIM.lock = l).catch(() => {}); } catch {}
  clearInterval(SIM.iv); SIM.iv = setInterval(simTick, 200); renderSim();
}
function simTick() { const a = $("#simTot"), b = $("#simSeg"); if (a) a.textContent = hms((Date.now() - SIM.t0) / 1000); if (b) { const s = (Date.now() - SIM.segT0) / 1000, tg = simTarget(SIM.seg); b.textContent = hms(s); b.style.color = s > tg ? "var(--bad)" : "var(--fg)"; } }
function renderSim() {
  const i = SIM.seg, seg = HX[i], run = !!seg[2], who = SIM.who[i] || "beide";
  const cum = SIM.splits.reduce((a, x) => a + x, 0), tgCum = HX.slice(0, i).reduce((a, _, j) => a + simTarget(j), 0);
  const delta = i ? cum - tgCum : 0;
  $("#player").innerHTML = `<div class="p-top"><button class="icon-btn" id="simStop" aria-label="Simulation beenden">${ICON.close}</button><div class="tx"><b>Hyrox Simulation</b><span class="num">Ziel ${hms(S.settings.targetMin * 60)}</span></div><span class="pill num">${i + 1} / 16</span></div>
    <div class="p-prog" aria-hidden="true">${HX.map((_, j) => `<i class="${j < i ? "on" : j === i ? "cur" : ""}"></i>`).join("")}</div>
    <div class="p-body sim">
      <p class="eyebrow">Gesamt</p><b class="big-num num" id="simTot">${hms((Date.now() - SIM.t0) / 1000)}</b>
      ${i ? `<p class="num ${delta > 0 ? "bad" : "good"}" style="font-weight:700">${delta > 0 ? "+" : "−"}${hms(Math.abs(delta))} zum Plan</p>` : ""}
      <div class="sim-seg"><p class="eyebrow">${run ? "Lauf " + (i / 2 + 1) + " von 8" : "Station " + Math.ceil(i / 2)}</p><h2>${esc(seg[0])}${run ? " 1 km" : ""}</h2>
        <div class="row" style="align-items:baseline;gap:14px"><b class="num seg-t" id="simSeg">0:00</b><span class="muted num">Ziel ${hms(simTarget(i))}</span></div>
        ${run ? "" : `<div class="seg" role="group" aria-label="Wer macht die Station">${[["ich", "Ich"], ["beide", "Geteilt"], ["partner", "Partner"]].map(([v, l]) => `<button data-who="${v}" aria-pressed="${who === v}">${l}</button>`).join("")}</div>`}
      </div>
      ${HX[i + 1] ? `<p class="muted">Danach: ${esc(HX[i + 1][0])}</p>` : ""}
    </div>
    <div class="p-foot"><button class="btn ghost" id="simBack" ${i === 0 ? "disabled" : ""} aria-label="Letzten Split zurücknehmen">${ICON.left}</button><button class="btn accent" id="simSplit">${i < 15 ? "Split · weiter" : "Ziel"}</button></div>`;
}
function simSplit() {
  const now_ = Date.now(); SIM.splits.push((now_ - SIM.segT0) / 1000); SIM.segT0 = now_; buzz(30);
  if (SIM.seg >= 15) return endSim(true);
  SIM.seg++; renderSim();
}
function endSim(save) {
  clearInterval(SIM.iv); try { SIM.lock && SIM.lock.release(); } catch {}
  $("#player").hidden = true; document.body.style.overflow = ""; SIM.on = false;
  if (!save || !SIM.splits.length) return;
  const rec = { id: uid(), date: iso(now()), total: SIM.splits.reduce((a, x) => a + x, 0), splits: SIM.splits.map(x => Math.round(x)), who: SIM.who, segs: SIM.splits.length, target: S.settings.targetMin };
  S.sims.push(rec); saveKey("sims", S.sims);
  S.logs.push({ id: uid(), date: rec.date, session: "simu", dur: Math.round(rec.total / 60), rpe: 9, note: `Simulation ${rec.segs}/16 in ${hms(rec.total)}`, ts: new Date().toISOString() }); saveLogs();
  simResult(rec); renderAll();
}
function simResult(r) {
  const rows = r.splits.map((s, i) => { const tg = simTarget(i), d = s - tg; return `<div class="split${HX[i][2] ? " run" : ""}"><span class="no num">${HX[i][2] ? "R" + (i / 2 + 1) : "S" + Math.ceil(i / 2)}</span><span class="tx">${esc(HX[i][0])}${r.who[i] && r.who[i] !== "beide" ? ` · ${r.who[i] === "ich" ? "ich" : "Partner"}` : ""}</span><span class="num">${hms(s)}</span><span class="num ${d > 0 ? "bad" : "good"}">${d > 0 ? "+" : "−"}${hms(Math.abs(d))}</span></div>`; }).join("");
  openSheet(`<div><p class="eyebrow">Simulation · ${fmt(pd(r.date))}</p><h2 id="sheetTitle" class="num" style="margin-top:8px">${hms(r.total)}</h2><p class="muted">${r.segs} von 16 Abschnitten · Ziel ${r.target} Min</p></div><div class="splits">${rows}</div>`);
}
function simCard() {
  const L = S.sims.slice().sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="card"><div class="card-h"><h3>Simulationen</h3><button class="btn accent small" data-sim="start">${ICON.play} Starten</button></div>
    ${L.length ? `<div class="items">${L.slice(0, 5).map(r => `<button class="item" data-simres="${r.id}"><span class="tx"><b>${fmt(pd(r.date))}</b><span>${r.segs} von 16 Abschnitten</span></span><span class="dose">${hms(r.total)}</span></button>`).join("")}</div>`
      : `<p class="muted">Stoppuhr mit 16 Splits: Laufen und Stationen. Pro Station tippst du an, wer sie macht. Am Schluss siehst du jeden Abschnitt im Vergleich zur Zielzeit.</p>`}</div>`;
}

/* ---------- Körpermasse und Fotos (Fotos nur auf dem Gerät, IndexedDB) ---------- */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("pp27", 1); r.onupgradeneeded = () => r.result.createObjectStore("photos", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function photoAll() { try { const db = await idb(); return await new Promise(res => { const q = db.transaction("photos").objectStore("photos").getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch { return []; } }
async function photoPut(p) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("photos", "readwrite"); t.objectStore("photos").put(p); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function photoDel(id) { const db = await idb(); return new Promise(res => { const t = db.transaction("photos", "readwrite"); t.objectStore("photos").delete(id); t.oncomplete = res; }); }
async function shrink(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const sc = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement("canvas");
  c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return new Promise(res => c.toBlob(res, "image/jpeg", 0.8));
}
function photoCard() {
  setTimeout(fillPhotos, 0);
  return `<div class="card"><div class="card-h"><h3>Fortschrittsfotos</h3><label class="btn ghost small" for="photoIn">${ICON.plus} Foto</label><input type="file" id="photoIn" accept="image/*" hidden></div>
    <div id="photoBox"><p class="muted">Alle 4 Wochen ein Foto, gleiches Licht, gleiche Pose. Die Fotos bleiben nur auf diesem Gerät.</p></div></div>`;
}
async function fillPhotos() {
  const box = $("#photoBox"); if (!box) return;
  const P2 = (await photoAll()).sort((a, b) => a.date.localeCompare(b.date)); if (!P2.length) return;
  const url = p => URL.createObjectURL(p.blob);
  const first = P2[0], last = P2[P2.length - 1];
  box.innerHTML = `${P2.length > 1 ? `<div class="compare"><figure><img src="${url(first)}" alt="Foto vom ${fmt(pd(first.date))}"><figcaption>${fmt(pd(first.date))}</figcaption></figure><figure><img src="${url(last)}" alt="Foto vom ${fmt(pd(last.date))}"><figcaption>${fmt(pd(last.date))}</figcaption></figure></div>` : ""}
    <div class="pgrid">${P2.slice().reverse().map(p => `<button class="pthumb" data-photodel="${p.id}" aria-label="Foto vom ${fmt(pd(p.date))} löschen"><img src="${url(p)}" alt=""><span>${fmt(pd(p.date))}</span></button>`).join("")}</div>`;
}

/* ---------- Supplements ---------- */
const SUPP_IDEAS = [["Kreatin", "5 g", "08:00"], ["Vitamin D3", "", "08:00"], ["Magnesium", "", "21:30"], ["Omega 3", "", "08:00"], ["Protein Shake", "nach dem Training", ""], ["Elektrolyte", "beim Training", ""]];
const supps = () => S.settings.supps || [];
function suppCard() {
  const list = supps(), today = iso(now()), done = S.suppLog[today] || [];
  if (!list.length) return `<div class="card span"><div class="card-h"><h3>Supplements</h3></div><p class="muted">Trag ein, was du nimmst. Die App hakt täglich ab und kann dich über den Kalender erinnern.</p><button class="btn ghost small" data-open="supps" style="margin-top:10px">Supplements einrichten</button></div>`;
  let streak = 0; for (let i = 1; i < 365; i++) { const d = S.suppLog[iso(addD(now(), -i))] || []; if (list.every(x => d.includes(x.id))) streak++; else break; }
  return `<div class="card span"><div class="card-h"><h3>Supplements</h3><span class="muted num" style="font-size:13px">${done.filter(id => list.some(x => x.id === id)).length} / ${list.length}${streak ? ` · ${streak} Tage am Stück` : ""}</span></div>
    <div class="supps">${list.map(x => { const on = done.includes(x.id); return `<button class="supp${on ? " on" : ""}" data-supp="${x.id}" aria-pressed="${on}"><span class="ck">${on ? ICON.check : ""}</span><span class="tx"><b>${esc(x.name)}</b><span>${[x.dose, x.time].filter(Boolean).map(esc).join(" · ")}</span></span></button>`; }).join("")}</div>
    <button class="link" data-open="supps" style="margin-top:10px">Bearbeiten</button></div>`;
}
function suppSheet() {
  const list = supps();
  openSheet(`<h2 id="sheetTitle">Supplements</h2>
    <div class="items">${list.length ? list.map(x => `<div class="item static"><span class="tx"><b>${esc(x.name)}</b><span>${[x.dose, x.time ? x.time + " Uhr" : ""].filter(Boolean).map(esc).join(" · ")}</span></span><button class="icon-btn" style="width:32px;height:32px" data-suppdel="${x.id}" aria-label="${esc(x.name)} entfernen">${ICON.close}</button></div>`).join("") : `<div class="item static"><span class="tx"><span>Noch nichts eingetragen.</span></span></div>`}</div>
    <div><p class="block-t">Vorschläge</p><div class="chips" style="flex-wrap:wrap">${SUPP_IDEAS.filter(i => !list.some(x => x.name === i[0])).map(i => `<button class="chip" data-suppadd="${esc(i.join("|"))}">${ICON.plus.replace("<svg", '<svg style="width:12px;height:12px;vertical-align:-1px"')} ${esc(i[0])}</button>`).join("")}</div></div>
    <form id="suppForm" class="stack"><div class="row"><input class="input" id="sName" placeholder="Name" required style="flex:2;min-width:140px"><input class="input" id="sDose" placeholder="Menge" style="flex:1;min-width:90px"></div>
    <div class="row"><label class="muted" for="sTime" style="align-self:center;font-size:13px">Erinnerung</label><input class="input" type="time" id="sTime" style="flex:1"><button class="btn primary" type="submit">Hinzufügen</button></div></form>
    <p class="muted" style="font-size:12.5px">Erinnerungen kommen über den Kalender. Unter Einstellungen «Kalender exportieren».</p>`);
}

/* ---------- Kalender (ICS) ---------- */
function icsExport() {
  const tz = "Europe/Zurich", p2 = n => String(n).padStart(2, "0");
  const dt = (d, hm) => { const [h, m] = (hm || "18:00").split(":"); return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(h)}${p2(m)}00`; };
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Plan Paris 27//DE", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Plan Paris 27"];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const end = addD(pd(raceDate()), 2);
  for (let d = now(); d <= end; d = addD(d, 1)) {
    sessionsFor(d).forEach(k => {
      const s = sess(k); if (!s.dur || k === "knie") return;
      const fb = s.type === "football";
      L.push("BEGIN:VEVENT", `UID:${iso(d)}-${k}@paris27`, `DTSTAMP:${stamp}`, `DTSTART;TZID=${tz}:${dt(d, fb ? S.settings.timeFb : S.settings.timeTrain)}`, `DURATION:PT${s.dur}M`, `SUMMARY:${s.tag}: ${s.name}`, `DESCRIPTION:${s.goal.replace(/[,;]/g, " ")}`, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${s.name}`, `TRIGGER:-PT${fb ? 90 : 60}M`, "END:VALARM", "END:VEVENT");
    });
  }
  supps().filter(x => x.time).forEach(x => L.push("BEGIN:VEVENT", `UID:supp-${x.id}@paris27`, `DTSTAMP:${stamp}`, `DTSTART;TZID=${tz}:${dt(now(), x.time)}`, "DURATION:PT5M", "RRULE:FREQ=DAILY", `SUMMARY:${x.name}${x.dose ? " " + x.dose : ""}`, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${x.name}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT"));
  const nb = benchLast() ? addD(pd(benchLast()), 42) : addD(now(), 4);
  L.push("BEGIN:VEVENT", `UID:bench-${iso(nb)}@paris27`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${iso(nb).replace(/-/g, "")}`, "SUMMARY:Benchmark Tests fällig", "END:VEVENT", "END:VCALENDAR");
  const blob = new Blob([L.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "plan-paris-27.ics"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast("Kalender Datei erstellt");
}

/* ---------- Wochenrückblick ---------- */
function reviewSheet(ws) {
  const we = addD(ws, 6), inW = l => l.date >= iso(ws) && l.date <= iso(we);
  const L = S.logs.filter(inW), planned = DN.reduce((a, _, i) => a + sessionsFor(addD(ws, i)).filter(k => sess(k).dur && k !== "knie").length, 0);
  const mins = L.reduce((a, l) => a + (l.dur || 0), 0), load = L.reduce((a, l) => a + sessLoad(l), 0);
  const knees = L.filter(l => l.knee != null).map(l => l.knee), kAvg = knees.length ? knees.reduce((a, b) => a + b, 0) / knees.length : null;
  const prs = Object.keys(S.plan.exercises).map(id => { const h = exHistory(id); const before = h.filter(x => x.date < iso(ws)).reduce((m, x) => Math.max(m, x.best.v), 0); const inside = h.filter(x => x.date >= iso(ws) && x.date <= iso(we)); const top = inside.reduce((m, x) => x.best.v > m.best.v ? x : m, { best: { v: 0 } }); return before > 0 && top.best.v > before ? { id, top } : null; }).filter(Boolean);
  const bw = S.body.filter(x => x.date <= iso(we)).sort((a, b) => a.date.localeCompare(b.date)), bNow = bw[bw.length - 1], bPrev = bw.filter(x => x.date < iso(ws)).pop();
  const nws = addD(ws, 7), next = DN.map((dn, i) => { const d = addD(nws, i); const ks = sessionsFor(d).filter(k => sess(k).dur && k !== "knie"); return ks.length ? `<span><b>${dn}</b>${esc(ks.map(k => sess(k).name).join(" + "))}</span>` : ""; }).join("");
  const sc = planned ? Math.round(Math.min(1, L.length / planned) * 100) : (L.length >= 4 ? 100 : L.length >= 2 ? 70 : 0);
  openSheet(`<div><p class="eyebrow">Wochenrückblick · KW ${kw(ws)}</p><h2 id="sheetTitle" style="margin-top:8px">${sc >= 90 ? "Starke Woche" : sc >= 60 ? "Solide Woche" : L.length ? "Durchzogene Woche" : "Pause Woche"}</h2><p class="muted">${fmt(ws)} bis ${fmt(we)}</p></div>
    <div class="stats" style="margin:0"><div class="stat"><b class="num">${planned ? L.length + "/" + planned : L.length}</b><span>Einheiten</span></div><div class="stat"><b class="num">${mins}</b><span>Minuten</span></div><div class="stat"><b class="num">${load ? String(Math.round(load / 100) / 10).replace(".", ",") + "k" : "-"}</b><span>Belastung</span></div></div>
    <div class="items">
      <div class="item static"><span class="tx"><b>Knie</b><span>Durchschnitt aus ${knees.length} Einträgen</span></span><span class="dose">${kAvg != null ? kAvg.toFixed(1).replace(".", ",") + " / 10" : "-"}</span></div>
      <div class="item static"><span class="tx"><b>Körpergewicht</b><span>${bPrev ? "Veränderung zur Vorwoche" : "letzter Wert"}</span></span><span class="dose">${bNow ? fmtKg(bNow.kg) + " kg" + (bPrev ? ` (${bNow.kg - bPrev.kg > 0 ? "+" : ""}${fmtKg(bNow.kg - bPrev.kg)})` : "") : "-"}</span></div>
      <div class="item static"><span class="tx"><b>Bestwerte</b><span>${prs.length ? prs.map(x => esc(S.plan.exercises[x.id].name)).join(", ") : "keine neuen"}</span></span><span class="dose">${prs.length}</span></div>
    </div>
    <div><p class="block-t">Nächste Woche · KW ${kw(nws)}</p><div class="phase" style="display:block;padding:12px"><div class="wk" style="margin:0">${next}</div></div></div>
    <div class="row"><button class="btn ghost" data-review="${iso(addD(ws, -7))}">${ICON.left} Vorwoche</button>${iso(nws) <= iso(monday(now())) ? `<button class="btn ghost" data-review="${iso(nws)}">Folgewoche ${ICON.right}</button>` : ""}</div>`);
}

/* ---------- Sync über privates GitHub Repository ---------- */
const SYNC_KEYS = ["logs", "body", "checkins", "bench", "sims", "suppLog"];
let syncT = null, syncBusy = false;
function scheduleSync() { if (!S.settings.ghToken || !S.settings.ghRepo) return; clearTimeout(syncT); syncT = setTimeout(() => ghSync().catch(() => {}), 2500); }
const b64e = s => btoa(unescape(encodeURIComponent(s))), b64d = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
function mergeData(r) {
  const del = new Set([...(S.deleted || []), ...((r && r.deleted) || [])]); S.deleted = [...del];
  const byId = (a = [], b = []) => { const m = new Map(); [...a, ...b].forEach(x => x && x.id && m.set(x.id, x)); return [...m.values()].filter(x => !del.has(x.id)); };
  const byDate = (a = [], b = []) => { const m = new Map(); [...b, ...a].forEach(x => x && x.date && m.set(x.date, { ...m.get(x.date), ...x })); return [...m.values()]; };
  S.logs = byId(r.logs, S.logs); S.bench = byId(r.bench, S.bench); S.sims = byId(r.sims, S.sims);
  S.body = byDate(S.body, r.body); S.checkins = { ...(r.checkins || {}), ...S.checkins };
  const sl = { ...(r.suppLog || {}) }; Object.entries(S.suppLog).forEach(([d, ids]) => sl[d] = [...new Set([...(sl[d] || []), ...ids])]); S.suppLog = sl;
  if (r.settings && r.settings.supps && !(S.settings.supps || []).length) S.settings.supps = r.settings.supps;
}
async function ghSync(manual) {
  const { ghToken, ghRepo } = S.settings; if (!ghToken || !ghRepo || syncBusy) return;
  syncBusy = true;
  try {
    const url = `https://api.github.com/repos/${ghRepo}/contents/logbuch.json`, h = { Authorization: "Bearer " + ghToken, Accept: "application/vnd.github+json" };
    let sha, remote = {};
    const r = await fetch(url, { headers: h, cache: "no-store" });
    if (r.ok) { const j = await r.json(); sha = j.sha; remote = JSON.parse(b64d(j.content)); } else if (r.status !== 404) throw new Error("Lesen fehlgeschlagen (" + r.status + ")");
    mergeData(remote);
    SYNC_KEYS.forEach(k => store.set(k, S[k])); store.set("deleted", S.deleted); saveSettings();
    const out = { updated: new Date().toISOString(), deleted: S.deleted, settings: { supps: S.settings.supps || [], kneeStage: S.settings.kneeStage }, logs: S.logs, body: S.body, checkins: S.checkins, bench: S.bench, sims: S.sims, suppLog: S.suppLog };
    const w = await fetch(url, { method: "PUT", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ message: "Logbuch " + iso(now()), content: b64e(JSON.stringify(out, null, 1)), sha }) });
    if (!w.ok) throw new Error("Schreiben fehlgeschlagen (" + w.status + ")");
    S.settings.lastSync = new Date().toISOString(); S.settings.syncErr = ""; saveSettings();
    if (manual) { toast("Synchronisiert"); renderAll(); }
  } catch (e) { S.settings.syncErr = String(e.message || e); saveSettings(); if (manual) toast("Sync: " + S.settings.syncErr); }
  finally { syncBusy = false; }
}
function settingsExtras() {
  const st = S.settings;
  return `<div><p class="block-t">Kalender und Erinnerungen</p><div class="row"><div class="field" style="flex:1"><label for="tTrain">Training um</label><input class="input" type="time" id="tTrain" value="${st.timeTrain || "18:00"}"></div><div class="field" style="flex:1"><label for="tFb">Fussball um</label><input class="input" type="time" id="tFb" value="${st.timeFb || "19:30"}"></div></div>
    <button class="btn primary block" data-ics style="margin-top:10px">Kalender exportieren</button><p class="muted" style="font-size:12.5px;margin-top:6px">Alle Trainings bis Paris, mit Erinnerung vorher, dazu deine Supplements täglich. Auf dem iPhone die Datei öffnen und «Alle hinzufügen» wählen. Ändert sich der Plan, nochmals exportieren.</p></div>
    <div><p class="block-t">Supplements</p><button class="btn ghost block" data-open="supps">${supps().length ? supps().length + " eingetragen · Bearbeiten" : "Einrichten"}</button></div>
    <div><p class="block-t">Sync über GitHub</p>
      <div class="field"><label for="ghRepo">Privates Repository</label><input class="input" id="ghRepo" value="${esc(st.ghRepo || "jamiro-sys/training-data")}" autocomplete="off"></div>
      <div class="field" style="margin-top:8px"><label for="ghToken">Zugangsschlüssel (Fine grained token)</label><input class="input" id="ghToken" type="password" value="${esc(st.ghToken || "")}" autocomplete="off" placeholder="github_pat_..."></div>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-sync="save">Speichern und synchronisieren</button>${st.ghToken ? `<button class="btn ghost" data-sync="off">Trennen</button>` : ""}</div>
      <p class="muted" style="font-size:12.5px;margin-top:6px">${st.lastSync ? "Zuletzt " + new Date(st.lastSync).toLocaleString("de-CH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + ". " : ""}${st.syncErr ? `<span style="color:var(--bad)">${esc(st.syncErr)}.</span> ` : ""}Der Schlüssel öffnet dein privates Repository: Die App liest dort Garmin Daten und Coach Notiz und sichert Logbuch, Gewicht, Tests und Supplements in logbuch.json. Fotos bleiben auf dem Gerät. Der Schlüssel bleibt nur in diesem Browser.</p></div>`;
}

/* ---------- Karten auf Heute ---------- */
function heuteExtras(main) {
  const t = now(), out = [];
  if (wd(t) === 6 || wd(t) === 0) { const ws = wd(t) === 6 ? monday(t) : monday(addD(t, -1)); out.push(`<button class="card span review-cta" data-review="${iso(ws)}"><span class="eyebrow">Wochenrückblick</span><b>KW ${kw(ws)} ansehen</b><span class="muted">Einheiten, Bestwerte, Knie und was nächste Woche kommt</span></button>`); }
  if (benchDue() && iso(t) >= "2026-11-28") out.push(`<div class="card span bench-due"><div><span class="eyebrow">Benchmark fällig</span><b>${benchLast() ? "6 Wochen seit dem letzten Test" : "Erster Test: deine Ausgangswerte"}</b><span class="muted">SkiErg, Rudern, Wall Balls${S.settings.kneeStage >= 4 ? " und 1 km Lauf" : ""}. Ersetzt die Gym Einheit am Samstag.</span></div><button class="btn accent small" data-bench="new">Eintragen</button></div>`);
  const L = loadStats(); if (L.st.lvl >= 2) out.push(`<div class="card span"><div class="amp"><div class="lights"><i class="${L.st.c === "warn" ? "on y" : ""}"></i><i class="${L.st.c === "bad" ? "on r" : ""}"></i></div><div><b>${esc(L.st.t)}</b><p class="muted" style="font-size:13px">${esc(L.st.a)}</p></div></div></div>`);
  out.push(suppCard());
  return out.join("");
}

/* ---------- Kennzahlen Ringe: Erholung, Belastung, Schlaf ---------- */
const gDay = date => ((S.garmin && S.garmin.days) || []).find(d => d.date === date) || null;
const rpeFromHr = hr => hr ? Math.max(3, Math.min(9, (hr - 95) / 8)) : 5;
function dayLoad(date) {
  const L = S.logs.filter(l => l.date === date);
  if (L.length) return L.reduce((a, l) => a + sessLoad(l), 0);
  return ((S.garmin && S.garmin.activities) || []).filter(a => a.date === date).reduce((a, x) => a + (x.durMin || 0) * rpeFromHr(x.avgHr), 0);
}
const strainOf = load => Math.round(21 * (1 - Math.exp(-load / 700)) * 10) / 10;
function recoveryFor(date) {
  const c = S.checkins[date];
  const g = gDay(date), gr = S.garmin && S.garmin.readiness;
  if (gr && gr.date === date && (gr.hrv != null || gr.restingHr != null)) return gr.score;
  if (c) return Math.round(((c.sleep + c.energy + (6 - c.sore)) - 3) / 12 * 100);
  if (g && g.sleepH != null) return Math.max(5, Math.min(100, Math.round(70 + 5 * (g.sleepH - 7.5))));
  return null;
}
function sleepFor(date) {
  const g = gDay(date); if (g && g.sleepH != null) return { h: g.sleepH, pct: Math.min(100, Math.round(g.sleepH / 8 * 100)) };
  const c = S.checkins[date]; if (c) return { h: null, pct: c.sleep * 20 };
  return null;
}
const recCol = v => v == null ? "var(--faint)" : v >= 67 ? "var(--good)" : v >= 34 ? "var(--warn)" : "var(--bad)";
const hm = h => h == null ? "" : Math.floor(h) + ":" + String(Math.round((h % 1) * 60)).padStart(2, "0");
function dial(key, val, max, label, color, opts = {}) {
  const size = 108, sw = 9, r = (size - sw) / 2, c = 2 * Math.PI * r, pct = val == null ? 0 : Math.max(0, Math.min(1, val / max));
  return `<button class="dial" data-dial="${key}" aria-label="${label}: ${val == null ? "keine Daten" : val + (opts.unit || "")}">
    <span class="dial-ring"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="trk" stroke-width="${sw}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="prog" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" style="--len:${c}"/></svg>
    <span class="dial-v"><b class="num" ${val == null ? "" : `data-count="${val}" data-dec="${opts.dec || 0}"`}>${val == null ? "?" : val}</b>${opts.unit && val != null ? `<i>${opts.unit}</i>` : ""}</span></span>
    <span class="dial-l" style="--c:${color}">${label}</span>${opts.sub ? `<span class="dial-s">${opts.sub}</span>` : ""}</button>`;
}
function dialsHtml() {
  const d = iso(now()), y = iso(addD(now(), -1)), rec = recoveryFor(d) ?? recoveryFor(y), st = strainOf(dayLoad(d)), sl = sleepFor(d) || sleepFor(y);
  return `<section class="dials" aria-label="Kennzahlen heute">
    ${dial("rec", rec, 100, "Erholung", recCol(rec), { unit: "%", sub: rec == null ? "Check in" : rec >= 67 ? "Bereit" : rec >= 34 ? "Normal" : "Erholen" })}
    ${dial("strain", st, 21, "Belastung", "var(--strain)", { dec: 1, sub: st >= 14 ? "Hoch" : st >= 10 ? "Mittel" : "Leicht" })}
    ${dial("sleep", sl ? sl.pct : null, 100, "Schlaf", "var(--sleep)", { unit: "%", sub: sl && sl.h ? hm(sl.h) + " h" : "keine Daten" })}
  </section>`;
}
function barSeries(vals, labels, color, max, fmtV = v => v) {
  const W = 340, H = 150, n = vals.length, bw = (W - 16) / n;
  return `<svg viewBox="0 0 ${W} ${H}" class="bars" role="img">${vals.map((v, i) => { const h = v == null ? 0 : Math.max(3, v / max * (H - 42)); const col = typeof color === "function" ? color(v) : color; return `<rect x="${8 + i * bw + bw * .18}" y="${H - 22 - h}" width="${bw * .64}" height="${h}" rx="${Math.min(5, bw * .3)}" fill="${v == null ? "var(--surface-2)" : col}" style="--i:${i}"/>${v != null && (i === n - 1 || n <= 14) ? `<text x="${8 + i * bw + bw / 2}" y="${H - 28 - h}" text-anchor="middle">${fmtV(v)}</text>` : ""}<text x="${8 + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${labels[i]}</text>`; }).join("")}</svg>`;
}
function dialSheet(key) {
  const ds = []; for (let i = 13; i >= 0; i--) ds.push(addD(now(), -i));
  const lab = ds.map(d => DN[wd(d)].slice(0, 1));
  const avg = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  if (key === "rec") {
    const v = ds.map(d => recoveryFor(iso(d))), a = avg(v);
    openSheet(`<div><p class="eyebrow">Erholung · 14 Tage</p><h2 id="sheetTitle" style="margin-top:8px">${v[13] != null ? v[13] + " %" : "Noch offen"}</h2><p class="muted">${a != null ? "Schnitt " + Math.round(a) + " %. " : ""}Grün ab 67 Prozent: bereit für hohe Belastung. Gelb: normal trainieren. Rot: Erholung vor Intensität.</p></div>
      <div class="chart">${barSeries(v, lab, recCol, 100, x => x)}</div>
      <div class="callout"><b>Quelle:</b> Garmin HRV und Ruhepuls, sonst dein Check in, sonst die Schlafdauer.</div>`);
  } else if (key === "strain") {
    const v = ds.map(d => { const s = strainOf(dayLoad(iso(d))); return s || null; }), a = avg(v);
    openSheet(`<div><p class="eyebrow">Belastung · 14 Tage</p><h2 id="sheetTitle" style="margin-top:8px">${String(strainOf(dayLoad(iso(now())))).replace(".", ",")} von 21</h2><p class="muted">${a != null ? "Schnitt an Trainingstagen " + String(Math.round(a * 10) / 10).replace(".", ",") + ". " : ""}Aus Minuten mal Anstrengung deiner Einträge, sonst aus Dauer und Puls der Garmin Aktivitäten.</p></div>
      <div class="chart">${barSeries(v, lab, "var(--strain)", 21, x => String(x).replace(".", ","))}</div>${loadCard()}`);
  } else {
    const v = ds.map(d => { const g = gDay(iso(d)); return g && g.sleepH != null ? g.sleepH : null; }), a = avg(v);
    openSheet(`<div><p class="eyebrow">Schlaf · 14 Tage</p><h2 id="sheetTitle" style="margin-top:8px">${v[13] != null ? hm(v[13]) + " Std" : v[12] != null ? hm(v[12]) + " Std" : "Keine Daten"}</h2><p class="muted">${a != null ? "Schnitt " + hm(a) + " h. " : ""}Ziel 8 Stunden. In Trainingsphasen mit Fussball eher mehr.</p></div>
      <div class="chart">${barSeries(v, lab, x => x >= 7.5 ? "var(--sleep)" : x >= 6.5 ? "color-mix(in srgb,var(--sleep) 60%,var(--surface-2))" : "var(--bad)", 10, x => hm(x))}</div>`);
  }
}
/* Langzeit aus dem Garmin Archiv: Minuten pro Monat nach Sportart, Kilometer und Fitness */
function historyCard() {
  const H = S.history; if (!H || !H.activities) return "";
  const A = Object.values(H.activities); if (!A.length) return "";
  const grp = t => /Soccer|Football/i.test(t) ? "football" : /Run/i.test(t) ? "run" : /Ride|Cycl|Bike/i.test(t) ? "bike" : /Weight|Strength|Training/i.test(t) ? "gym" : "other";
  const GC = { football: "var(--football)", run: "var(--hyrox)", bike: "var(--endurance)", gym: "var(--gym)", other: "var(--rest)" }, GN = { football: "Fussball", run: "Laufen", bike: "Velo", gym: "Kraft", other: "Andere" };
  const months = []; const d0 = now(); for (let i = 11; i >= 0; i--) { const m = new Date(d0.getFullYear(), d0.getMonth() - i, 1); months.push(m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0")); }
  const data = months.map(m => { const o = { football: 0, run: 0, bike: 0, gym: 0, other: 0 }; A.filter(a => a.date && a.date.startsWith(m)).forEach(a => o[grp(a.type)] += a.durMin || 0); return o; });
  const mx = Math.max(300, ...data.map(o => Object.values(o).reduce((a, b) => a + b, 0)));
  const W = 340, Hh = 150, bw = (W - 16) / 12;
  const bars = data.map((o, i) => { let yy = Hh - 22; return Object.keys(GC).map(k => { const h = o[k] / mx * (Hh - 34); yy -= h; return h > 0 ? `<rect x="${8 + i * bw + bw * .18}" y="${yy}" width="${bw * .64}" height="${h}" rx="2" fill="${GC[k]}" style="--i:${i}"/>` : ""; }).join("") + `<text x="${8 + i * bw + bw / 2}" y="${Hh - 6}" text-anchor="middle">${MON[+months[i].slice(5) - 1].slice(0, 1)}</text>`; }).join("");
  const yr = A.filter(a => a.date >= iso(addD(now(), -365)));
  const km = yr.filter(a => grp(a.type) === "run").reduce((a, x) => a + (x.km || 0), 0), fb = yr.filter(a => grp(a.type) === "football").length, hrs = yr.reduce((a, x) => a + (x.durMin || 0), 0) / 60;
  const days = Object.entries(H.days || {}).sort((a, b) => a[0].localeCompare(b[0])), ctl = days.filter(([, v]) => v.ctl != null);
  const ctlNow = ctl.length ? ctl[ctl.length - 1][1].ctl : null, ctl90 = ctl.filter(([k]) => k <= iso(addD(now(), -90))).pop();
  return `<div class="card" style="grid-column:1/-1"><div class="card-h"><h3>Langzeit · 12 Monate</h3><span class="muted" style="font-size:12px">${A.length} Aktivitäten im Archiv</span></div>
    <div class="stats" style="margin-bottom:12px"><div class="stat"><b class="num">${Math.round(hrs)}</b><span>Stunden</span></div><div class="stat"><b class="num">${Math.round(km)}</b><span>Lauf km</span></div><div class="stat"><b class="num">${fb}</b><span>Fussball</span></div></div>
    <div class="chart"><svg viewBox="0 0 ${W} ${Hh}" class="bars" role="img" aria-label="Minuten pro Monat">${bars}</svg></div>
    <div class="legend">${Object.keys(GC).map(k => `<span><i style="background:${GC[k]}"></i>${GN[k]}</span>`).join("")}</div>
    ${ctlNow != null ? `<p class="muted" style="font-size:13px;margin-top:10px">Fitness (CTL aus intervals.icu): <b style="color:var(--fg)">${Math.round(ctlNow)}</b>${ctl90 ? `, vor 3 Monaten ${Math.round(ctl90[1].ctl)}` : ""}.</p>` : ""}</div>`;
}
/* Zahlen hochzählen */
function countUp(root = document) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.querySelectorAll("[data-count]").forEach(el => {
    const to = parseFloat(el.dataset.count), dec = +el.dataset.dec || 0, t0 = performance.now(), dur = 900;
    const step = t => { const e = Math.min(1, (t - t0) / dur), v = to * (1 - Math.pow(1 - e, 3)); el.textContent = dec ? v.toFixed(dec).replace(".", ",") : Math.round(v); if (e < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

/* ---------- Events ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-goto],[data-checkin],[data-resume],[data-intro],[data-jump],[data-start],[data-sess],[data-ex],[data-day],[data-week],[data-mode],[data-cat],[data-open],[data-knee],[data-setknee],[data-quicklog],[data-del],[data-theme-set],[data-done]");
  if (!t) return;
  const d = t.dataset;
  if (d.resume !== undefined) { const r = pendingPlayer(); if (d.resume === "drop") { clearPlayer(); renderHeute(); return toast("Training verworfen"); } return r && startPlayer(r.k, r.date, r); }
  if (d.goto === "paris") { S.planMode = "paris"; location.hash = "plan"; return renderPlan(); }
  if (d.checkin === "edit") { delete S.checkins[iso(now())]; store.set("checkins", S.checkins); return renderHeute(); }
  if (d.intro !== undefined) { S.settings.introDone = true; saveSettings(); return renderHeute(); }
  if (d.start) return startPlayer(d.start, d.date);
  if (d.quicklog) return logSheet(d.quicklog, d.date);
  if (d.sess) return sessionSheet(d.sess, d.date);
  if (d.ex) return exerciseSheet(d.ex);
  if (d.day) return daySheet(d.day);
  if (d.week) { S.week = d.week === "0" ? monday(now()) : addD(S.week, 7 * +d.week); return renderPlan(); }
  if (d.mode) { S.planMode = d.mode; return renderPlan(); }
  if (d.cat) { S.exCat = d.cat; return renderUebungen(); }
  if (d.open === "settings") return settingsSheet();
  if (d.open === "knee") return kneeSheet();
  if (d.open === "log") return logSheet(null, iso(now()));
  if (d.open === "supps") return suppSheet();
  if (d.knee) { setKnee(S.settings.kneeStage + +d.knee); return renderHeute(); }
  if (d.setknee) { setKnee(+d.setknee); closeSheet(); renderAll(); return toast("Knie Stufe " + d.setknee); }
  if (d.themeSet) { S.settings.theme = d.themeSet; saveSettings(); applyTheme(); t.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === t)); return; }
  if (d.del) {
    if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.style.background = "var(--bad)"; t.style.color = "var(--bg)"; t.setAttribute("aria-label", "Nochmals tippen zum Löschen"); toast("Nochmals tippen zum Löschen"); setTimeout(() => { if (t.isConnected) { t.dataset.confirm = ""; t.style.background = ""; t.style.color = ""; } }, 3000); return; }
    S.logs = S.logs.filter(l => l.id !== d.del); S.deleted.push(d.del); store.set("deleted", S.deleted); saveLogs(); renderAll(); return toast("Gelöscht");
  }
  if (d.done !== undefined && t.closest("#player")) {
    const j = +d.done, st = P.steps[P.i], row = P.sets[P.i][j]; row.d = !row.d;
    if (row.d && isStrength(st) && !row.r) row.r = targetReps(st);
    savePlayer(); renderPlayer();
    if (row.d) { buzz(25); afterCheck(j); }
  }
  if (d.jump !== undefined) return go(+d.jump);
});
document.addEventListener("input", e => {
  const el = e.target; if (el.dataset.set === undefined || !el.closest("#player")) return;
  const rows = P.sets[P.i], j = +el.dataset.set; rows[j][el.dataset.f] = el.value;
  // Gewicht in die folgenden, noch offenen Sätze übernehmen
  if (el.dataset.f === "w") rows.forEach((r, k) => { if (k > j && !r.d) { r.w = el.value; const inp = document.querySelector(`#player [data-set="${k}"][data-f="w"]`); if (inp) inp.value = el.value; } });
  savePlayer();
});
document.addEventListener("click", e => {
  if (e.target.closest("#pClose")) return askClose();
  if (e.target.closest("#pList")) { P.list = !P.list; return renderPlayer(); }
  if (e.target.closest("#pNext")) return go(P.i + 1);
  if (e.target.closest("#pPrev")) return go(P.i - 1);
  if (e.target.closest("#pFinish")) return finishPlayer();
  if (e.target.closest("#pTimer")) { const st = P.steps[P.i]; const j = P.sets[P.i].findIndex(x => !x.d); return countdown(timedSec(st), { label: stepName(st), sub: st.sets > 1 ? `Durchgang ${j + 1} von ${st.sets}` : "", work: true, then: () => { const row = P.sets[P.i][j]; if (row && !row.d) { row.d = true; savePlayer(); renderPlayer(); afterCheck(j); } } }); }
  if (e.target.closest("#rSkip")) return endRest();
  if (e.target.closest("#rPlus") && P.rest) { P.rest.end += 15000; P.rest.total += 15; }
  if (e.target.closest("#rMinus") && P.rest) { P.rest.end -= 15000; }
  if (e.target.closest("#exportBtn")) exportLogs();
});
// Check in: drei Skalen, gespeichert sobald alle gewählt sind
document.addEventListener("click", e => {
  const b = e.target.closest("[data-ci] button"); if (!b) return;
  const sc = b.parentElement; sc.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
  const pick = k => { const x = document.querySelector(`[data-ci="${k}"] [aria-pressed="true"]`); return x ? +x.dataset.v : null; };
  const c = { sleep: pick("sleep"), energy: pick("energy"), sore: pick("sore") };
  if (c.sleep && c.energy && c.sore) { S.checkins[iso(now())] = c; saveKey("checkins", S.checkins); setTimeout(renderHeute, 250); toast("Tagesform gespeichert"); }
});
document.addEventListener("change", e => { if (e.target.id === "hxRange") renderPlan(); });
document.addEventListener("submit", e => {
  if (e.target.id !== "bodyForm") return; e.preventDefault();
  const kg = num($("#bodyKg").value), waist = num($("#bodyWaist").value);
  if ((kg && (kg < 30 || kg > 250)) || (waist && (waist < 40 || waist > 200)) || (!kg && !waist)) return toast("Bitte Gewicht in kg oder Bauchumfang in cm eingeben");
  const d = iso(now()), old = S.body.find(x => x.date === d) || { date: d };
  S.body = S.body.filter(x => x.date !== d).concat({ ...old, ...(kg ? { kg } : {}), ...(waist ? { waist } : {}) }); saveKey("body", S.body); renderFortschritt(); toast("Gespeichert");
});
document.addEventListener("input", e => {
  if (e.target.id !== "hxRange") return;
  S.settings.targetMin = +e.target.value; saveSettings();
  const o = $("#hxOut"); if (o) o.textContent = hms(S.settings.targetMin * 60);
});
document.addEventListener("change", e => { if (e.target.id === "importFile") importLogs(e.target.files[0]); });
$("#sheetClose").addEventListener("click", closeSheet);
$("#backdrop").addEventListener("click", closeSheet);
$("#openSettings").addEventListener("click", settingsSheet);
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#sheet").hidden) closeSheet(); else if (P.rest) endRest(); else if (!$("#player").hidden) askClose(); } });
// Wochen im Plan mit Wischen wechseln
let sx = null, sy = null;
$("#v-plan").addEventListener("touchstart", e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
$("#v-plan").addEventListener("touchend", e => { if (sx == null || S.planMode !== "woche") return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { S.week = addD(S.week, dx < 0 ? 7 : -7); renderPlan(); } }, { passive: true });

function exportLogs() {
  const data = JSON.stringify({ exported: new Date().toISOString(), settings: S.settings, logs: S.logs, body: S.body, checkins: S.checkins }, null, 2);
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

/* ---------- Events Erweiterungen ---------- */
document.addEventListener("click", async e => {
  const q = sel => e.target.closest(sel);
  let b;
  if ((b = q("[data-dial]"))) return dialSheet(b.dataset.dial);
  if ((b = q("[data-kneeset]"))) { setKnee(+b.dataset.kneeset); renderAll(); return toast("Knie Stufe " + S.settings.kneeStage); }
  if ((b = q("[data-review]"))) return reviewSheet(pd(b.dataset.review));
  if ((b = q("[data-bench]"))) return benchSheet();
  if ((b = q("[data-btest]"))) { b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); const tt = TESTS.find(x => x.id === b.dataset.btest); $("#bHint").textContent = tt.knee ? "Beim Lauf: nur ab Knie Stufe 4." : tt.sub; return; }
  if (q("#swGo")) { if (SW.t0) { SW.acc += (Date.now() - SW.t0) / 1000; SW.t0 = 0; clearInterval(SW.iv); $("#swGo").innerHTML = ICON.play + " Weiter"; $("#bTime").value = mmss(swDraw()); buzz(30); } else { SW.t0 = Date.now(); SW.iv = setInterval(swDraw, 200); $("#swGo").textContent = "Stopp"; } return; }
  if (q("#swReset")) { clearInterval(SW.iv); SW = { t0: 0, acc: 0, iv: null }; swDraw(); $("#swGo").innerHTML = ICON.play + " Stoppuhr"; return; }
  if (q("#bSave")) {
    const test = (document.querySelector("[data-btest][aria-pressed='true']") || {}).dataset?.btest, sec = parseTime($("#bTime").value);
    if (!test || sec < 20) return toast("Bitte Zeit eingeben, z.B. 3:45");
    clearInterval(SW && SW.iv);
    const prev = S.bench.filter(x => x.test === test).reduce((m, x) => Math.min(m, x.sec), Infinity);
    S.bench.push({ id: uid(), test, sec, date: $("#bDate").value || iso(now()) }); saveKey("bench", S.bench);
    closeSheet(); renderAll(); return toast(sec < prev && prev !== Infinity ? "Neue Bestzeit!" : "Test gespeichert");
  }
  if (q("[data-sim]")) return startSim();
  if (q("#simSplit")) return simSplit();
  if (q("#simBack")) { const last = SIM.splits.pop(); if (last != null) { SIM.seg--; SIM.segT0 = Date.now() - ((Date.now() - SIM.segT0) / 1000 + last) * 1000; renderSim(); } return; }
  if ((b = q("[data-who]"))) { SIM.who[SIM.seg] = b.dataset.who; return renderSim(); }
  if (q("#simStop")) {
    openSheet(`<h2 id="sheetTitle">Simulation beenden?</h2><p class="muted">${SIM.splits.length} von 16 Abschnitten geschafft.</p><div class="stack">${SIM.splits.length ? `<button class="btn accent block" id="simSave">Speichern</button>` : ""}<button class="btn primary block" id="simCont">Weitermachen</button><button class="btn ghost block" id="simDrop">Verwerfen</button></div>`);
    return;
  }
  if (q("#simSave")) { closeSheet(); return endSim(true); }
  if (q("#simCont")) return closeSheet();
  if (q("#simDrop")) { closeSheet(); return endSim(false); }
  if ((b = q("[data-simres]"))) { const r = S.sims.find(x => x.id === b.dataset.simres); return r && simResult(r); }
  if ((b = q("[data-photodel]"))) {
    if (b.dataset.c !== "1") { b.dataset.c = "1"; b.classList.add("confirm"); toast("Nochmals tippen zum Löschen"); setTimeout(() => { b.dataset.c = ""; b.classList.remove("confirm"); }, 3000); return; }
    await photoDel(b.dataset.photodel); renderFortschritt(); return toast("Foto gelöscht");
  }
  if ((b = q("[data-supp]"))) {
    const d = iso(now()), cur = new Set(S.suppLog[d] || []); cur.has(b.dataset.supp) ? cur.delete(b.dataset.supp) : (cur.add(b.dataset.supp), buzz(20));
    S.suppLog[d] = [...cur]; saveKey("suppLog", S.suppLog); return renderHeute();
  }
  if ((b = q("[data-suppdel]"))) { S.settings.supps = supps().filter(x => x.id !== b.dataset.suppdel); saveSettings(); scheduleSync(); suppSheet(); return renderHeute(); }
  if ((b = q("[data-suppadd]"))) { const [name, dose, time] = b.dataset.suppadd.split("|"); S.settings.supps = supps().concat({ id: uid(), name, dose, time }); saveSettings(); scheduleSync(); suppSheet(); return renderHeute(); }
  if (q("[data-ics]")) { S.settings.timeTrain = $("#tTrain").value || "18:00"; S.settings.timeFb = $("#tFb").value || "19:30"; saveSettings(); return icsExport(); }
  if ((b = q("[data-sync]"))) {
    if (b.dataset.sync === "off") { S.settings.ghToken = ""; S.settings.lastSync = ""; saveSettings(); settingsSheet(); return toast("Sync getrennt"); }
    S.settings.ghRepo = ($("#ghRepo").value.trim() || "jamiro-sys/training-data").replace(/^https:\/\/github\.com\//, "").replace(/\/$/, ""); S.settings.ghToken = $("#ghToken").value.trim(); saveSettings();
    await ghSync(true); await reloadPrivate(); return settingsSheet();
  }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "suppForm") return; e.preventDefault();
  const name = $("#sName").value.trim(); if (!name) return;
  S.settings.supps = supps().concat({ id: uid(), name, dose: $("#sDose").value.trim(), time: $("#sTime").value }); saveSettings(); scheduleSync(); suppSheet(); renderHeute(); toast(name + " hinzugefügt");
});
document.addEventListener("change", async e => {
  if (e.target.id !== "photoIn" || !e.target.files[0]) return;
  try { const blob = await shrink(e.target.files[0]); await photoPut({ id: uid(), date: iso(now()), blob }); renderFortschritt(); toast("Foto gespeichert"); }
  catch { toast("Foto konnte nicht gespeichert werden"); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && SIM.on && $("#sheet").hidden) { e.stopImmediatePropagation(); $("#simStop").click(); } }, true);

/* ---------- Navigation ---------- */
const VIEWS = ["heute", "plan", "uebungen", "fortschritt"];
function route() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "heute";
  VIEWS.forEach(x => { const el = $("#v-" + x); el.hidden = x !== v; if (x === v) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); countUp(el); } });
  document.querySelectorAll(".rail a").forEach(a => a.dataset.view === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  if (v === "plan") renderPlan();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
function applyTheme() { document.documentElement.setAttribute("data-theme", "dark"); }
function renderAll() { renderHeute(); renderPlan(); renderUebungen(); renderFortschritt(); countUp($("#v-heute")); }

/* ---------- Start ---------- */
/* Persönliche Daten liegen im privaten Repository und werden mit dem eigenen Schlüssel gelesen */
const dataRepo = () => S.settings.ghRepo || "jamiro-sys/training-data";
async function privGet(path) {
  if (!S.settings.ghToken) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${dataRepo()}/contents/${path}`, { headers: { Authorization: "Bearer " + S.settings.ghToken, Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
    if (!r.ok) return null; return JSON.parse(await r.text());
  } catch { return null; }
}
async function reloadPrivate() {
  const [g, c, h] = await Promise.all([privGet("garmin.json"), privGet("coach.json"), privGet("garmin-history.json")]);
  S.garmin = g; S.coach = c; S.history = h; renderAll();
}
async function load(path, fallback) { try { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw 0; return await r.json(); } catch { return fallback; } }
(async () => {
  applyTheme();
  const [plan, garmin, coach] = await Promise.all([load("data/plan.json", null), privGet("garmin.json"), privGet("coach.json")]);
  privGet("garmin-history.json").then(h => { S.history = h; if (h && S.plan) renderFortschritt(); });
  if (!plan) { $("#v-heute").innerHTML = `<div class="empty"><b>Plan konnte nicht geladen werden.</b><span>Prüfe die Internetverbindung und lade die Seite neu.</span></div>`; return; }
  S.plan = plan; S.garmin = garmin; S.coach = coach;
  window.ExPhotos = Object.fromEntries(Object.entries(plan.exercises).filter(([, e]) => e.photo).map(([k, e]) => [k, { id: e.photo, fit: e.photoFit }]));
  if (S.settings.kneeStage >= plan.kneeStages.length) S.settings.kneeStage = 1;
  renderAll(); route();
  if (S.settings.ghToken) ghSync().then(renderAll).catch(() => {});
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
})();
