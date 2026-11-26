// Holt Garmin Daten über intervals.icu (Aktivitäten, Schlaf, HRV, Ruhepuls) und schreibt garmin.json und garmin-history.json.
// Benötigt INTERVALS_API_KEY und INTERVALS_ATHLETE_ID (z.B. i123456). Schreibt nach DATA_DIR (im Workflow: privates Repository).
import { readFile, writeFile } from "node:fs/promises";

const KEY = process.env.INTERVALS_API_KEY, ID = process.env.INTERVALS_ATHLETE_ID, DIR = process.env.DATA_DIR || "data";
if (!KEY || !ID) { console.log("Keine intervals.icu Zugangsdaten gesetzt, nichts zu tun."); process.exit(0); }

const iso = d => d.toISOString().slice(0, 10);
const today = new Date();
// Archiv: beim ersten Lauf die ganze Historie ab 2024 holen, danach die letzten 42 Tage
const hist = JSON.parse(await readFile(`${DIR}/garmin-history.json`, "utf8").catch(() => "null")) || { days: {}, activities: {} };
// Ganze Historie neu holen, wenn das Archiv leer ist oder noch keine HRV und keinen Ruhepuls enthält (z.B. nach neuer Garmin Freigabe)
// Zusätzlich jeden Sonntagmorgen alles neu holen, falls Garmin ältere Werte nachliefert
const firstRun = !Object.keys(hist.days).length || !Object.values(hist.days).some(d => d.hrv != null) || (today.getUTCDay() === 0 && today.getUTCHours() < 12);
const oldest = firstRun ? new Date("2024-01-01T00:00:00Z") : new Date(today.getTime() - 41 * 864e5);
const auth = "Basic " + Buffer.from("API_KEY:" + KEY).toString("base64");
async function get(path) {
  const r = await fetch(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(ID)}/${path}`, { headers: { Authorization: auth, Accept: "application/json" } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}
const num = (v, f = 1) => (v == null || Number.isNaN(+v)) ? null : Math.round(+v * f) / f;
const mean = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

const [wellness, acts] = await Promise.all([
  get(`wellness?oldest=${iso(oldest)}&newest=${iso(today)}`),
  get(`activities?oldest=${iso(oldest)}&newest=${iso(today)}`)
]);

// Archiv nachführen: jeder Tag und jede Aktivität bleibt dauerhaft gespeichert
for (const w of wellness) hist.days[w.id] = {
  hrv: num(w.hrv), restingHr: num(w.restingHR), sleepH: w.sleepSecs ? num(w.sleepSecs / 3600, 10) : null, sleepScore: num(w.sleepScore),
  readiness: num(w.readiness), weight: num(w.weight, 10), steps: num(w.steps), stress: num(w.stress), spO2: num(w.spO2),
  ctl: num(w.ctl, 10), atl: num(w.atl, 10)
};
for (const a of acts) if (!a._note && a.moving_time != null) hist.activities[a.id] = {
  date: String(a.start_date_local || "").slice(0, 10), start: String(a.start_date_local || "").slice(0, 16) || null, src: "garmin", type: a.type, name: a.name,
  durMin: a.moving_time ? Math.round(a.moving_time / 60) : null, km: a.distance ? num(a.distance / 1000, 100) : null,
  avgHr: num(a.average_heartrate), maxHr: num(a.max_heartrate), load: num(a.icu_training_load), elev: num(a.total_elevation_gain)
};
// Strava: alle Aktivitäten, auch die ohne Garmin (Zwift, Whoop, Gym). Token liegt im privaten Repository,
// Client ID und Secret der eigenen Strava API App als Secrets STRAVA_CLIENT_ID und STRAVA_CLIENT_SECRET.
const SID = process.env.STRAVA_CLIENT_ID, SSEC = process.env.STRAVA_CLIENT_SECRET, tokPath = `${DIR}/strava-token.json`;
const fam = t => /Soccer|Football/i.test(t) ? "football" : /Run/i.test(t) ? "run" : /Ride|Cycl|Bike/i.test(t) ? "bike" : /Row|Ski/i.test(t) ? "row" : /Weight|Strength|Crossfit|HIIT|Workout/i.test(t) ? "gym" : "other";
function isDup(a) {
  return Object.values(hist.activities).some(g => g.src !== "strava" && g.date === a.date && fam(g.type) === fam(a.type) && (
    g.start && a.start ? Math.abs(Date.parse(g.start + ":00Z") - Date.parse(a.start + ":00Z")) <= 15 * 60e3 : Math.abs((g.durMin || 0) - (a.durMin || 0)) <= Math.max(5, 0.2 * (a.durMin || 0))));
}
let stok = JSON.parse(await readFile(tokPath, "utf8").catch(() => "null"));
if (stok && stok.refresh_token && SID && SSEC) {
  try {
    if (!stok.access_token || (stok.expires_at || 0) * 1000 < Date.now() + 120e3) {
      const r = await fetch("https://www.strava.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: SID, client_secret: SSEC, grant_type: "refresh_token", refresh_token: stok.refresh_token }) });
      if (!r.ok) throw new Error("Token erneuern: HTTP " + r.status);
      const j = await r.json();
      stok = { ...stok, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at, updated: new Date().toISOString() };
      await writeFile(tokPath, JSON.stringify(stok, null, 1) + "\n");
    }
    // Beim ersten Mal die ganze Historie ab 2024, danach die letzten 42 Tage
    const after = Math.floor((hist.stravaFull ? today.getTime() - 41 * 864e5 : Date.parse("2024-01-01T00:00:00Z")) / 1000);
    let list = [];
    for (let page = 1; page <= 20; page++) {
      const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`, { headers: { Authorization: "Bearer " + stok.access_token } });
      if (!r.ok) throw new Error("Aktivitäten: HTTP " + r.status);
      const j = await r.json(); list = list.concat(j); if (j.length < 100) break;
    }
    let added = 0, dup = 0;
    for (const x of list) {
      const t = x.sport_type || x.type, sec = x.moving_time || x.elapsed_time || 0;
      const a = { date: String(x.start_date_local || "").slice(0, 10), start: String(x.start_date_local || "").slice(0, 16), src: "strava", device: x.device_name || null, type: t, name: x.name,
        durMin: sec ? Math.round(sec / 60) : null, km: x.distance ? num(x.distance / 1000, 100) : null, avgHr: num(x.average_heartrate), maxHr: num(x.max_heartrate),
        load: null, effort: num(x.suffer_score), watts: num(x.average_watts), kj: num(x.kilojoules), elev: num(x.total_elevation_gain) };
      if (isDup(a)) { dup++; delete hist.activities["s" + x.id]; continue; }
      hist.activities["s" + x.id] = a; added++;
    }
    hist.stravaFull = true;
    console.log(`Strava: ${added} Aktivitäten übernommen, ${dup} schon über Garmin vorhanden.`);
  } catch (e) { console.log("Strava übersprungen: " + e.message); }
} else if (stok) console.log("Strava: Secrets STRAVA_CLIENT_ID und STRAVA_CLIENT_SECRET fehlen.");

hist.updated = new Date().toISOString();
await writeFile(`${DIR}/garmin-history.json`, JSON.stringify(hist) + "\n");

// Pulszonen automatisch: klassisches 5 Zonen Modell in Prozent der HFmax.
// HFmax = höchster plausibler Maximalpuls der letzten 12 Monate, Ruhepuls = Schnitt der letzten 28 Tage.
{
  const since = iso(new Date(today.getTime() - 365 * 864e5)), since28 = iso(new Date(today.getTime() - 28 * 864e5));
  const maxs = Object.values(hist.activities).filter(a => a.date >= since && a.maxHr && a.maxHr < 215).map(a => a.maxHr).sort((a, b) => b - a);
  const hfMax = maxs.length >= 3 ? Math.round((maxs[0] + maxs[1] + maxs[2]) / 3) : (maxs[0] || null);
  const rhr = Object.entries(hist.days).filter(([d, v]) => d >= since28 && v.restingHr).map(([, v]) => v.restingHr);
  const hrv = Object.entries(hist.days).filter(([d, v]) => d >= since28 && v.hrv).map(([, v]) => v.hrv);
  if (hfMax) {
    const prof = JSON.parse(await readFile(`${DIR}/profil.json`, "utf8").catch(() => "{}"));
    const P = [[50, 60, "Erholung", "Ausrollen, lockere Tage"], [60, 70, "Grundlage", "Rolle und lockere Läufe, sprechen in ganzen Sätzen"], [70, 80, "Aerob", "zügige Dauerläufe, Hyrox Renntempo"], [80, 90, "Schwelle", "Intervalle 4 bis 8 Minuten"], [90, 100, "Maximal", "kurze Antritte, Spielszenen"]];
    prof.model = "5 Zonen, Prozent der HFmax";
    prof.hfMax = hfMax;
    prof.hfMaxSource = `Schnitt der 3 höchsten Maximalpulse aus ${maxs.length} Aktivitäten der letzten 12 Monate`;
    if (rhr.length) prof.hfRest = Math.round(rhr.reduce((a, b) => a + b, 0) / rhr.length);
    if (hrv.length) prof.hrvBase = Math.round(hrv.reduce((a, b) => a + b, 0) / hrv.length);
    prof.zones = P.map(([lo, hi, name, use], i) => ({ z: "Zone " + (i + 1), name, use, pct: `${lo} bis ${hi} %`, lo: Math.round(hfMax * lo / 100), hi: Math.round(hfMax * hi / 100) }));
    prof.zoneHf = Object.fromEntries(prof.zones.map((z, i) => [i + 1, `${z.lo} bis ${z.hi}`]));
    prof.bikeHf = prof.zoneHf;
    prof.sleepTarget = prof.sleepTarget || 7.5;
    prof.zonesUpdated = new Date().toISOString();
    await writeFile(`${DIR}/profil.json`, JSON.stringify(prof, null, 1) + "\n");
  }
}

const runKm = {}, bikeMin = {};
for (const a of acts) {
  const d = String(a.start_date_local || "").slice(0, 10), t = String(a.type || "");
  if (/Run/i.test(t)) runKm[d] = (runKm[d] || 0) + (a.distance || 0) / 1000;
  if (/Ride/i.test(t)) bikeMin[d] = (bikeMin[d] || 0) + (a.moving_time || 0) / 60;
}

const cut = iso(new Date(today.getTime() - 41 * 864e5));
const days = wellness.filter(w => w.id >= cut).map(w => ({
  date: w.id,
  hrv: num(w.hrv),
  restingHr: num(w.restingHR),
  sleepH: w.sleepSecs ? num(w.sleepSecs / 3600, 10) : null,
  runKm: runKm[w.id] ? num(runKm[w.id], 10) : 0,
  bikeMin: bikeMin[w.id] ? Math.round(bikeMin[w.id]) : 0,
  readiness: num(w.readiness),
  bodyBattery: num(w.bodyBattery)
})).sort((a, b) => a.date.localeCompare(b.date));

const last = [...days].reverse().find(d => d.hrv != null || d.restingHr != null || d.sleepH != null) || null;
let readiness = null;
if (last) {
  const base = days.filter(d => d.date < last.date).slice(-28);
  const hrvB = mean(base.map(d => d.hrv)), rhrB = mean(base.map(d => d.restingHr));
  let score = last.readiness;
  if (score == null) {
    score = 70;
    if (last.hrv != null && hrvB) score += 60 * (last.hrv / hrvB - 1);
    if (last.restingHr != null && rhrB) score -= 3 * (last.restingHr - rhrB);
    if (last.sleepH != null) score += 5 * (last.sleepH - 7.5);
    score = Math.max(5, Math.min(100, Math.round(score)));
  }
  readiness = { score, label: score >= 70 ? "Bereit" : score >= 45 ? "Normal" : "Erholen", hrv: last.hrv, restingHr: last.restingHr, sleepH: last.sleepH, bodyBattery: last.bodyBattery, date: last.date };
}

// Letzte Aktivitäten aus dem Archiv, Garmin und Strava zusammen
const activities = Object.entries(hist.activities).filter(([, a]) => a.date >= cut)
  .sort((a, b) => String(b[1].start || b[1].date).localeCompare(String(a[1].start || a[1].date)))
  .slice(0, 20)
  .map(([id, a]) => ({ id, date: a.date, type: a.type, name: a.name, src: a.src || "garmin", device: a.device || null, durMin: a.durMin, km: a.km != null ? num(a.km, 10) : null, avgHr: a.avgHr }));

const out = { updated: new Date().toISOString(), source: "intervals.icu (Garmin) und Strava", readiness, days, activities };
const prev = await readFile(`${DIR}/garmin.json`, "utf8").catch(() => "");
const strip = s => s.replace(/"updated":\s*"[^"]*"/, "");
const next = JSON.stringify(out, null, 1) + "\n";
if (prev && strip(prev) === strip(next)) { console.log("Keine neuen Daten."); process.exit(0); }
await writeFile(`${DIR}/garmin.json`, next);
console.log(`Geschrieben: ${days.length} Tage, ${activities.length} Aktivitäten, Bereitschaft ${readiness ? readiness.score : "offen"}.`);
