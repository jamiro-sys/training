// Holt Garmin Daten über intervals.icu und schreibt data/garmin.json.
// Benötigt die GitHub Secrets INTERVALS_API_KEY und INTERVALS_ATHLETE_ID (z.B. i123456).
import { readFile, writeFile } from "node:fs/promises";

const KEY = process.env.INTERVALS_API_KEY, ID = process.env.INTERVALS_ATHLETE_ID;
if (!KEY || !ID) { console.log("Keine intervals.icu Zugangsdaten gesetzt, nichts zu tun."); process.exit(0); }

const iso = d => d.toISOString().slice(0, 10);
const today = new Date(), oldest = new Date(today.getTime() - 41 * 864e5);
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

const runKm = {}, bikeMin = {};
for (const a of acts) {
  const d = String(a.start_date_local || "").slice(0, 10), t = String(a.type || "");
  if (/Run/i.test(t)) runKm[d] = (runKm[d] || 0) + (a.distance || 0) / 1000;
  if (/Ride/i.test(t)) bikeMin[d] = (bikeMin[d] || 0) + (a.moving_time || 0) / 60;
}

const days = wellness.map(w => ({
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

const activities = acts
  .sort((a, b) => String(b.start_date_local).localeCompare(String(a.start_date_local)))
  .slice(0, 14)
  .map(a => ({ date: String(a.start_date_local).slice(0, 10), type: a.type, name: a.name, durMin: a.moving_time ? Math.round(a.moving_time / 60) : null, km: a.distance ? num(a.distance / 1000, 10) : null, avgHr: num(a.average_heartrate) }));

const out = { updated: new Date().toISOString(), source: "intervals.icu (Garmin)", readiness, days, activities };
const prev = await readFile("data/garmin.json", "utf8").catch(() => "");
const strip = s => s.replace(/"updated":\s*"[^"]*"/, "");
const next = JSON.stringify(out, null, 1) + "\n";
if (prev && strip(prev) === strip(next)) { console.log("Keine neuen Daten."); process.exit(0); }
await writeFile("data/garmin.json", next);
console.log(`Geschrieben: ${days.length} Tage, ${activities.length} Aktivitäten, Bereitschaft ${readiness ? readiness.score : "offen"}.`);
