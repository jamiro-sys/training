/* Übungsanimationen: eine Strichfigur mit Gelenkwinkeln, Posen werden weich ineinander überblendet.
   Winkel in Grad. Beine und Arme: 0 = gerade nach unten, 90 = nach vorne (rechts), 180 = nach oben.
   Rumpf (T): 0 = aufrecht, positiv = nach vorne geneigt. Ankerpunkt: Hüfte, Fussgelenk oder Knie. */
(() => {
"use strict";
const LEN = { torso: 52, neck: 5, head: 8, thigh: 40, shin: 40, upper: 28, fore: 26, foot: 11 };
const R = Math.PI / 180;
const dn = (a, l) => [Math.sin(a * R) * l, Math.cos(a * R) * l];
const up = (a, l) => [Math.sin(a * R) * l, -Math.cos(a * R) * l];
const add = (p, v) => [p[0] + v[0], p[1] + v[1]];
const sub = (p, v) => [p[0] - v[0], p[1] - v[1]];
const lerp = (a, b, e) => a + (b - a) * e;
const ease = e => 0.5 - Math.cos(e * Math.PI) / 2;

function ik(root, target, l1, l2, bend) {
  const dx = target[0] - root[0], dy = target[1] - root[1];
  let d = Math.hypot(dx, dy); d = Math.min(d, l1 + l2 - 0.01);
  const a = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  const base = Math.atan2(dx, dy);
  const t1 = base + bend * a;
  const mid = [root[0] + Math.sin(t1) * l1, root[1] + Math.cos(t1) * l1];
  return { mid, end: [root[0] + Math.sin(base) * d, root[1] + Math.cos(base) * d] };
}

function geom(p) {
  const L1 = p.L1, L2 = p.L2 || p.L1, A1 = p.A1 || [0, 0], A2 = p.A2 || A1;
  let hip;
  if (p.at === "ankle") { const k = sub([p.x, p.y], dn(L1[1], LEN.shin)); hip = sub(k, dn(L1[0], LEN.thigh)); }
  else if (p.at === "ankle2") { const k = sub([p.x, p.y], dn(L2[1], LEN.shin)); hip = sub(k, dn(L2[0], LEN.thigh)); }
  else if (p.at === "knee") { hip = sub([p.x, p.y], dn(L1[0], LEN.thigh)); }
  else hip = [p.x, p.y];
  const g = { hip };
  const leg = (L, n, foot, F) => {
    if (foot) { const s = ik(hip, foot, LEN.thigh, LEN.shin, -1); g["knee" + n] = s.mid; g["ankle" + n] = s.end; }
    else { g["knee" + n] = add(hip, dn(L[0], LEN.thigh)); g["ankle" + n] = add(g["knee" + n], dn(L[1], LEN.shin)); }
    const f = (F || 0) * R; g["toe" + n] = add(g["ankle" + n], [Math.cos(f) * LEN.foot, Math.sin(f) * LEN.foot]);
  };
  leg(L1, 1, p.foot1, p.F1); leg(L2, 2, p.foot2, p.F2);
  g.shoulder = add(hip, up(p.T || 0, LEN.torso));
  g.neck = add(g.shoulder, up(p.T || 0, LEN.neck));
  g.head = add(g.shoulder, up(p.T || 0, LEN.neck + LEN.head));
  const arm = (A, n, hand) => {
    if (hand) { const s = ik(g.shoulder, hand, LEN.upper, LEN.fore, 1); g["elbow" + n] = s.mid; g["hand" + n] = s.end; }
    else { g["elbow" + n] = add(g.shoulder, dn(A[0], LEN.upper)); g["hand" + n] = add(g["elbow" + n], dn(A[1], LEN.fore)); }
  };
  arm(A1, 1, p.hand1); arm(A2, 2, p.hand2);
  return g;
}

function mix(a, b, e) {
  const o = { at: a.at };
  for (const k of ["x", "y", "T", "F1", "F2"]) o[k] = lerp(a[k] ?? b[k] ?? 0, b[k] ?? a[k] ?? 0, e);
  for (const k of ["L1", "L2", "A1", "A2"]) {
    const va = a[k] || (k === "L2" ? a.L1 : k === "A2" ? a.A1 : null), vb = b[k] || (k === "L2" ? b.L1 : k === "A2" ? b.A1 : null);
    if (va && vb) o[k] = [lerp(va[0], vb[0], e), lerp(va[1], vb[1], e)];
  }
  for (const k of ["foot1", "foot2", "hand1", "hand2"]) if (a[k] && b[k]) o[k] = [lerp(a[k][0], b[k][0], e), lerp(a[k][1], b[k][1], e)];
  return o;
}

/* ---------- Requisiten ---------- */
const P = (pt, dx = 0, dy = 0) => [pt[0] + dx, pt[1] + dy];
const ln = (a, b, w, c) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const PROP = {
  pad: (g, o) => { const c = P(g[o.on], o.dx || 0, o.dy || 0), w = (o.len || 18) / 2, a = (o.rot || 0) * R; return ln([c[0] - Math.cos(a) * w, c[1] - Math.sin(a) * w], [c[0] + Math.cos(a) * w, c[1] + Math.sin(a) * w], o.w || 7, o.c || "var(--anim-prop)"); },
  plate: (g, o) => `<circle cx="${(g[o.on][0] + (o.dx || 0)).toFixed(1)}" cy="${(g[o.on][1] + (o.dy || 0)).toFixed(1)}" r="${o.r || 13}" fill="var(--anim-accent)" opacity=".9"/>`,
  ball: (g, o, ball) => `<circle cx="${ball[0].toFixed(1)}" cy="${ball[1].toFixed(1)}" r="9" fill="var(--anim-accent)"/>`,
  kb: (g, o) => { const h = g[o.on]; return `<circle cx="${h[0].toFixed(1)}" cy="${(h[1] + 9).toFixed(1)}" r="7" fill="var(--anim-accent)"/>`; },
  grip: (g, o) => { const h = g[o.on]; return ln([h[0], h[1] - 6], [h[0], h[1] + 6], 4, "var(--anim-accent)"); },
  roller: (g, o) => { const h = P(g[o.on], o.dx || 0, o.dy || 0); return `<circle cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="${o.r || 6}" fill="var(--anim-accent)"/>`; },
  cable: (g, o) => ln(o.from, g[o.on], 1.6, "var(--anim-line)"),
  cableUp: (g, o) => ln([g[o.on][0], 6], g[o.on], 1.6, "var(--anim-line)"),
  db: (g, o) => { const h = g[o.on]; return ln([h[0] - 6, h[1]], [h[0] + 6, h[1]], 3, "var(--anim-accent)") + `<circle cx="${(h[0] - 7).toFixed(1)}" cy="${h[1].toFixed(1)}" r="4.5" fill="var(--anim-accent)"/><circle cx="${(h[0] + 7).toFixed(1)}" cy="${h[1].toFixed(1)}" r="4.5" fill="var(--anim-accent)"/>`; },
  bar: (g, o) => { const h = g[o.on]; return `<circle cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="${o.r || 4}" fill="var(--anim-accent)"/>`; },
  band: (g, o) => ln(g[o.a], g[o.b], 3, "var(--anim-accent)"),
  legplate: (g, o) => { const c = P(g.ankle1, 4, -4); return ln([c[0] - 13, c[1] - 13], [c[0] + 13, c[1] + 13], 6, "var(--anim-accent)") + ln(c, [c[0] + 40, c[1] - 40], 3, "var(--anim-prop)"); }
};

/* ---------- Übungen ---------- */
const stand = (x, extra = {}) => ({ at: "ankle", x, y: 164, T: 0, L1: [0, 0], A1: [0, 0], ...extra });
const A = {
  squatmachine: { frames: [{ at: "ankle", x: 125, y: 164, T: 8, L1: [0, 0], A1: [160, 25] }, { at: "ankle", x: 125, y: 164, T: 28, L1: [82, -32], A1: [160, 25] }],
    scene: `<path d="M60 168 L104 18" class="pr"/>`, props: [{ k: "pad", on: "shoulder", dx: -3, dy: -2, len: 22, rot: -10 }] },
  backsquat: { frames: [{ at: "ankle", x: 125, y: 164, T: 5, L1: [0, 0], A1: [150, 30] }, { at: "ankle", x: 125, y: 164, T: 40, L1: [88, -38], A1: [150, 30] }],
    props: [{ k: "plate", on: "shoulder", dx: -3, dy: -4, r: 14 }] },
  legpress: { frames: [{ at: "hip", x: 85, y: 128, T: -60, L1: [165, 95], A1: [20, 70], F1: -95 }, { at: "hip", x: 85, y: 128, T: -60, L1: [133, 128], A1: [20, 70], F1: -50 }],
    scene: `<path d="M94 138 L54 74 M70 140 H112 M96 140 V168" class="pr"/>`, props: [{ k: "legplate" }] },
  legpress1: { frames: [{ at: "hip", x: 85, y: 128, T: -60, L1: [165, 95], L2: [100, 15], A1: [20, 70], F1: -95 }, { at: "hip", x: 85, y: 128, T: -60, L1: [133, 128], L2: [100, 15], A1: [20, 70], F1: -50 }],
    scene: `<path d="M94 138 L54 74 M70 140 H112 M96 140 V168" class="pr"/>`, props: [{ k: "legplate" }] },
  hipthrust: { frames: [{ at: "ankle", x: 165, y: 164, T: -73, L1: [125, -15], A1: [73, 73] }, { at: "ankle", x: 165, y: 164, T: -90, L1: [90, 0], A1: [90, 90] }],
    scene: `<path d="M38 140 H96 M48 140 V168 M86 140 V168" class="pr"/>`, props: [{ k: "pad", on: "hip", dy: -8, len: 26, c: "var(--anim-accent)" }] },
  legcurl: { frames: [{ at: "hip", x: 100, y: 122, T: -8, L1: [90, 88], A1: [25, 70] }, { at: "hip", x: 100, y: 122, T: -8, L1: [90, -15], A1: [25, 70] }],
    scene: `<path d="M80 130 H128 M100 130 V168 M86 128 L78 68 M130 113 H150" class="pr"/>`, props: [{ k: "roller", on: "ankle1", dx: 3, r: 6 }] },
  legext: { frames: [{ at: "hip", x: 100, y: 122, T: -8, L1: [90, 0], A1: [25, 70] }, { at: "hip", x: 100, y: 122, T: -8, L1: [90, 85], A1: [25, 70] }],
    scene: `<path d="M80 130 H128 M100 130 V168 M86 128 L78 68" class="pr"/>`, props: [{ k: "roller", on: "ankle1", dx: 6, r: 6 }] },
  calfmachine: { frames: [{ at: "ankle", x: 140, y: 150, T: -5, L1: [90, 0], A1: [40, 80], F1: 0 }, { at: "ankle", x: 140, y: 143, T: -5, L1: [90, 0], A1: [40, 80], F1: 35 }],
    scene: `<path d="M146 154 H170 M150 154 V168" class="pr"/>`, props: [{ k: "pad", on: "hip", dy: 8, len: 40, rot: 0 }, { k: "pad", on: "knee1", dy: -8, len: 22, c: "var(--anim-accent)" }] },
  chestpress: { frames: [{ at: "hip", x: 95, y: 126, T: -8, L1: [88, 5], A1: [-75, 92] }, { at: "hip", x: 95, y: 126, T: -8, L1: [88, 5], A1: [86, 90] }],
    scene: `<path d="M86 134 L76 64 M78 134 H118 M95 134 V168" class="pr"/>`, props: [{ k: "grip", on: "hand1" }] },
  latpull: { frames: [{ at: "hip", x: 105, y: 128, T: -10, L1: [88, 0], A1: [172, 178] }, { at: "hip", x: 105, y: 128, T: -10, L1: [88, 0], A1: [-25, 165] }],
    scene: `<path d="M85 136 H128 M105 136 V168 M136 120 H156" class="pr"/>`, props: [{ k: "cableUp", on: "hand1" }, { k: "pad", on: "hand1", len: 20, w: 4, c: "var(--anim-accent)" }] },
  cablerow: { frames: [{ at: "hip", x: 85, y: 145, T: 25, L1: [100, 85], A1: [85, 88] }, { at: "hip", x: 85, y: 145, T: -8, L1: [100, 85], A1: [-50, 85] }],
    scene: `<path d="M58 153 H112 M85 153 V168 M172 128 V154 M204 120 V168" class="pr"/><circle cx="204" cy="128" r="4" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [204, 128] }, { k: "grip", on: "hand1" }] },
  shoulderpress: { frames: [{ at: "hip", x: 105, y: 126, T: -6, L1: [88, 3], A1: [15, 175] }, { at: "hip", x: 105, y: 126, T: -6, L1: [88, 3], A1: [178, 178] }],
    scene: `<path d="M96 134 L88 60 M88 134 H128 M105 134 V168" class="pr"/>`, props: [{ k: "grip", on: "hand1" }] },
  facepull: { frames: [{ at: "ankle", x: 110, y: 164, T: -5, L1: [10, -5], L2: [-12, 8], A1: [105, 100] }, { at: "ankle", x: 110, y: 164, T: -5, L1: [10, -5], L2: [-12, 8], A1: [170, 62] }],
    scene: `<path d="M225 8 V168" class="pr"/><circle cx="225" cy="40" r="4" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [225, 40] }, { k: "grip", on: "hand1" }] },
  backext: { frames: [{ at: "ankle", x: 178, y: 150, T: -150, L1: [45, 45], A1: [-120, 40] }, { at: "ankle", x: 178, y: 150, T: -45, L1: [45, 45], A1: [60, -110] }],
    scene: `<path d="M128 110 L192 168 M150 168 L170 130" class="pr"/>`, props: [{ k: "pad", on: "hip", dx: 6, dy: 10, len: 22, rot: 45 }, { k: "roller", on: "ankle1", dx: 4, dy: -6, r: 5 }] },
  cablecrunch: { frames: [{ at: "knee", x: 120, y: 160, T: 10, L1: [0, -90], A1: [170, 20], F1: 180 }, { at: "knee", x: 120, y: 160, T: 75, L1: [20, -90], A1: [120, 10], F1: 180 }],
    props: [{ k: "cableUp", on: "hand1" }] },
  pallof: { frames: [{ at: "ankle", x: 115, y: 164, T: 0, L1: [8, -8], L2: [-8, 8], A1: [15, 150] }, { at: "ankle", x: 115, y: 164, T: 0, L1: [8, -8], L2: [-8, 8], A1: [88, 90] }],
    scene: `<path d="M25 8 V168" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [25, 85] }, { k: "grip", on: "hand1" }], note: "Kabel kommt von der Seite" },
  sideplank: { mode: "cycle", frames: [{ at: "ankle2", x: 205, y: 158, T: -72, L1: [82, 82], L2: [82, 82], A1: [0, 90], A2: [79, 79] }, { at: "ankle2", x: 205, y: 158, T: -78, L1: [78, 78], L2: [78, 78], A1: [0, 90], A2: [79, 79] }, { at: "ankle2", x: 205, y: 158, T: -78, L1: [48, 48], L2: [78, 78], A1: [0, 90], A2: [79, 79] }, { at: "ankle2", x: 205, y: 158, T: -78, L1: [78, 78], L2: [78, 78], A1: [0, 90], A2: [79, 79] }], note: "Ansicht von vorne" },
  clamshell: { frames: [{ at: "hip", x: 120, y: 150, T: -90, L1: [70, -110], L2: [70, -110], A1: [90, 100], A2: [-90, 45] }, { at: "hip", x: 120, y: 150, T: -90, L1: [120, -60], L2: [70, -110], A1: [90, 100], A2: [-90, 45] }],
    props: [{ k: "band", a: "knee1", b: "knee2" }], note: "Seitenlage" },
  lateralwalk: { frames: [{ at: "hip", x: 100, y: 88, T: 0, L1: [22, 10], L2: [-22, -10], A1: [35, -20], A2: [-35, 20], F2: 180 }, { at: "hip", x: 100, y: 86, T: 0, L1: [35, 20], L2: [-22, -10], A1: [35, -20], A2: [-35, 20], F2: 180 }, { at: "hip", x: 120, y: 88, T: 0, L1: [22, 10], L2: [-28, -14], A1: [35, -20], A2: [-35, 20], F2: 180 }],
    props: [{ k: "band", a: "knee1", b: "knee2" }], note: "Ansicht von vorne" },
  singlebridge: { frames: [{ at: "ankle", x: 150, y: 164, T: -92, L1: [140, 24], L2: [105, 105], A1: [90, 90] }, { at: "ankle", x: 150, y: 164, T: -122, L1: [96, 3], L2: [122, 122], A1: [90, 90] }] },
  stepdown: { frames: [{ at: "ankle", x: 115, y: 128, T: 3, L1: [0, 0], L2: [8, 4], A1: [15, 10], A2: [-10, 5] }, { at: "ankle", x: 115, y: 128, T: 18, L1: [60, -25], L2: [30, 25], A1: [75, 80] }],
    scene: `<rect x="84" y="130" width="62" height="38" rx="3" class="pr-fill"/>` },
  foamroll: { frames: [{ at: "hip", x: 100, y: 140, T: -75, L1: [80, 80], L2: [78, 78], A1: [0, 90], A2: [80, 80] }, { at: "hip", x: 130, y: 140, T: -75, L1: [80, 80], L2: [78, 78], A1: [0, 90], A2: [80, 80] }],
    scene: `<circle cx="148" cy="153" r="9" fill="var(--anim-accent)"/>`, note: "Seitenlage" },
  hipflexor: { frames: [{ at: "hip", x: 110, y: 125, T: 0, L1: [90, 0], L2: [-13, -90], A1: [30, 60], F2: 160 }, { at: "hip", x: 118, y: 126, T: -10, L1: [90, -8], L2: [-25, -90], A1: [35, 60], F2: 160 }] },
  crosstrainer: { frames: [{ at: "hip", x: 105, y: 84, T: 5, L1: [18, -8], L2: [-15, 10], A1: [45, 95], A2: [20, 110] }, { at: "hip", x: 105, y: 84, T: 5, L1: [-15, 10], L2: [18, -8], A1: [20, 110], A2: [45, 95] }],
    scene: `<path d="M60 168 H180 M168 168 L172 70" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [172, 74] }, { k: "cable", on: "hand2", from: [172, 74] }] },
  row: { mode: "cycle", frames: [{ at: "ankle", x: 125, y: 142, T: 28, L1: [150, 35], A1: [82, 88], F1: -60 }, { at: "ankle", x: 125, y: 142, T: 12, L1: [96, 90], A1: [85, 88], F1: -60 }, { at: "ankle", x: 125, y: 142, T: -22, L1: [96, 90], A1: [-55, 80], F1: -60 }],
    scene: `<path d="M18 156 H206" class="pr"/><circle cx="206" cy="128" r="16" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [192, 128] }, { k: "pad", on: "hip", dy: 8, len: 20, w: 6 }] },
  skierg: { frames: [{ at: "ankle", x: 105, y: 164, T: 0, L1: [0, 0], A1: [165, 172] }, { at: "ankle", x: 105, y: 164, T: 48, L1: [35, -15], A1: [25, 15] }],
    scene: `<path d="M190 8 V168" class="pr"/><circle cx="190" cy="18" r="5" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [190, 18] }, { k: "grip", on: "hand1" }] },
  bike: { mode: "crank", hip: [92, 92], T: 55, center: [128, 140], r: 15, hand: [156, 96],
    scene: `<path d="M80 96 H104 M92 98 L128 140 L160 108 L156 96" class="pr"/><circle cx="66" cy="142" r="24" class="pr"/><circle cx="186" cy="142" r="24" class="pr"/><circle cx="128" cy="140" r="15" class="pr-thin"/>` },
  treadmill: { mode: "cycle", speed: 0.55, frames: [{ at: "hip", x: 105, y: 80, T: 10, L1: [32, 8], L2: [-28, -75], A1: [-35, 55], A2: [35, 115] }, { at: "hip", x: 105, y: 83, T: 10, L1: [5, -5], L2: [15, -80], A1: [-5, 85], A2: [5, 95] }, { at: "hip", x: 105, y: 80, T: 10, L1: [-28, -75], L2: [32, 8], A1: [35, 115], A2: [-35, 55] }, { at: "hip", x: 105, y: 83, T: 10, L1: [15, -80], L2: [5, -5], A1: [5, 95], A2: [-5, 85] }],
    scene: `<path d="M36 167 H192 M186 167 L196 92 H176" class="pr"/>` },
  wallball: { mode: "cycle", frames: [{ at: "ankle", x: 110, y: 164, T: 30, L1: [88, -38], A1: [15, 150] }, { at: "ankle", x: 110, y: 164, T: 0, L1: [0, 0], A1: [170, 175] }, { at: "ankle", x: 110, y: 164, T: 0, L1: [0, 0], A1: [170, 175], ball: [168, 16] }, { at: "ankle", x: 110, y: 164, T: 0, L1: [0, 0], A1: [170, 175] }],
    scene: `<path d="M184 0 V168 M176 10 V30" class="pr"/>`, props: [{ k: "ball" }] },
  farmers: { mode: "cycle", speed: 0.7, frames: [{ at: "hip", x: 105, y: 84, T: 0, L1: [20, 0], L2: [-18, -15], A1: [0, 0] }, { at: "hip", x: 105, y: 85, T: 0, L1: [0, 0], L2: [5, -35], A1: [0, 0] }, { at: "hip", x: 105, y: 84, T: 0, L1: [-18, -15], L2: [20, 0], A1: [0, 0] }, { at: "hip", x: 105, y: 85, T: 0, L1: [5, -35], L2: [0, 0], A1: [0, 0] }],
    props: [{ k: "kb", on: "hand2" }, { k: "kb", on: "hand1" }] },
  bbj: { mode: "cycle", speed: 1.4, frames: [
      { at: "hip", x: 90, y: 84, T: 0, L1: [0, 0], A1: [0, 0] },
      { at: "hip", x: 98, y: 128, T: 60, L1: [82, -30], A1: [20, 0] },
      { at: "hip", x: 103, y: 128, T: 69, L1: [-69, -69], A1: [0, 0] },
      { at: "hip", x: 98, y: 154, T: 85, L1: [-85, -85], A1: [175, 0] },
      { at: "hip", x: 103, y: 128, T: 69, L1: [-69, -69], A1: [0, 0] },
      { at: "hip", x: 98, y: 128, T: 60, L1: [82, -30], A1: [20, 0] },
      { at: "hip", x: 150, y: 62, T: 15, L1: [30, -25], L2: [25, -35], A1: [160, 170] },
      { at: "hip", x: 185, y: 128, T: 45, L1: [80, -30], A1: [60, 40] },
      { at: "hip", x: 190, y: 84, T: 0, L1: [0, 0], A1: [0, 0] }], noLoopBack: true },
  sblunge: { frames: [{ at: "hip", x: 110, y: 84, T: 0, L1: [0, 0], L2: [0, 0], A1: [160, 25] }, { at: "hip", x: 110, y: 112, T: 0, L1: [70, 17], L2: [-18, -75], A1: [160, 25], F2: 20 }],
    props: [{ k: "pad", on: "shoulder", dy: -3, len: 28, w: 11, c: "var(--anim-accent)" }] },
  sledpush: { frames: [{ at: "hip", x: 95, y: 100, T: 58, L1: [45, -5], L2: [-35, -40], A1: [95, 92] }, { at: "hip", x: 97, y: 100, T: 58, L1: [-35, -40], L2: [45, -5], A1: [95, 92] }],
    scene: `<path d="M194 64 V128 M176 128 H234 L228 142 H182 Z" class="pr"/><circle cx="214" cy="116" r="11" fill="var(--anim-accent)"/>` },
  sledpull: { frames: [{ at: "hip", x: 75, y: 116, T: -28, L1: [70, 25], L2: [75, 30], A1: [70, 92], A2: [30, 60] }, { at: "hip", x: 75, y: 116, T: -28, L1: [70, 25], L2: [75, 30], A1: [30, 60], A2: [70, 92] }],
    scene: `<path d="M204 150 H236 L230 164 H210 Z" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [206, 152] }, { k: "cable", on: "hand2", from: [206, 152] }] },
  cableabd: { frames: [{ at: "ankle2", x: 100, y: 164, T: 0, L1: [4, 4], L2: [0, 0], A1: [25, -30], A2: [-40, -10], F2: 180 }, { at: "ankle2", x: 100, y: 164, T: 0, L1: [32, 32], L2: [0, 0], A1: [25, -30], A2: [-40, -10], F2: 180 }],
    scene: `<path d="M28 20 V168" class="pr"/>`, props: [{ k: "cable", on: "ankle1", from: [28, 160] }], note: "Ansicht von vorne" }
};

A.gymbike = A.bike;
A.copenhagen = { ...A.sideplank, frames: A.sideplank.frames.slice(0, 2), mode: undefined, scene: `<rect x="186" y="128" width="46" height="10" rx="3" class="pr-fill"/><path d="M192 138 V168 M226 138 V168" class="pr"/>`, note: "Oberes Bein auf der Bank" };
A.kbaround = { frames: [
  { at: "ankle2", x: 100, y: 164, T: 0, L1: [10, 0], L2: [-10, 0], A1: [40, 15], A2: [20, 55], F2: 180 },
  { at: "ankle2", x: 100, y: 164, T: 0, L1: [10, 0], L2: [-10, 0], A1: [-20, -55], A2: [-40, -15], F2: 180 }],
  props: [{ k: "kb", on: "hand1" }], note: "Ansicht von vorne" };


/* ---------- Weitere Übungen (gym80 und Lieblingsübungen) ---------- */
Object.assign(A, {
  benchmachine: { frames: [{ at: "hip", x: 100, y: 126, T: -90, L1: [85, 0], A1: [45, 180] }, { at: "hip", x: 100, y: 126, T: -90, L1: [85, 0], A1: [178, 180] }],
    scene: `<rect x="24" y="133" width="92" height="9" rx="4" class="pr-fill"/><path d="M40 142 V168 M100 142 V168" class="pr"/><path d="M20 30 V168" class="pr"/>`, props: [{ k: "pad", on: "hand1", len: 22, w: 5, c: "var(--anim-accent)" }] },
  inclinedb: { frames: [{ at: "hip", x: 100, y: 124, T: -60, L1: [82, 5], A1: [25, 165] }, { at: "hip", x: 100, y: 124, T: -60, L1: [82, 5], A1: [150, 150] }],
    scene: `<path d="M104 134 L62 62" class="pr" style="stroke-width:9"/><path d="M96 134 H120 M104 134 V168" class="pr"/>`, props: [{ k: "db", on: "hand1" }] },
  inclinefly: { frames: [{ at: "hip", x: 100, y: 124, T: -60, L1: [82, 5], A1: [70, 85] }, { at: "hip", x: 100, y: 124, T: -60, L1: [82, 5], A1: [150, 152] }],
    scene: `<path d="M104 134 L62 62" class="pr" style="stroke-width:9"/><path d="M96 134 H120 M104 134 V168" class="pr"/>`, props: [{ k: "grip", on: "hand1" }] },
  cablechest: { frames: [{ at: "hip", x: 105, y: 128, T: 0, L1: [88, 0], A1: [-70, 92] }, { at: "hip", x: 105, y: 128, T: 0, L1: [88, 0], A1: [86, 90] }],
    scene: `<path d="M84 136 H126 M105 136 V168 M44 20 V168" class="pr"/><circle cx="44" cy="80" r="4" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [44, 80] }, { k: "grip", on: "hand1" }] },
  seatedrow: { frames: [{ at: "hip", x: 92, y: 130, T: 12, L1: [85, 5], A1: [82, 86] }, { at: "hip", x: 92, y: 130, T: 12, L1: [85, 5], A1: [-45, 80] }],
    scene: `<path d="M72 138 H112 M92 138 V168 M128 70 V120 M150 70 V168" class="pr"/>`, props: [{ k: "grip", on: "hand1" }] },
  lateralmachine: { frames: [{ at: "ankle2", x: 100, y: 164, T: 0, L1: [8, 0], L2: [-8, 0], A1: [12, 8], A2: [-12, -8], F2: 180 }, { at: "ankle2", x: 100, y: 164, T: 0, L1: [8, 0], L2: [-8, 0], A1: [86, 92], A2: [-86, -92], F2: 180 }], note: "Ansicht von vorne" },
  reversefly: { frames: [{ at: "hip", x: 120, y: 120, T: 0, L1: [6, 0], L2: [-6, 0], A1: [22, 10], A2: [-22, -10] }, { at: "hip", x: 120, y: 120, T: 0, L1: [6, 0], L2: [-6, 0], A1: [92, 95], A2: [-92, -95] }], note: "Ansicht von hinten" },
  szcurl: { frames: [{ at: "hip", x: 96, y: 128, T: 18, L1: [88, 0], A1: [55, 60] }, { at: "hip", x: 96, y: 128, T: 18, L1: [88, 0], A1: [55, 165] }],
    scene: `<path d="M118 92 L150 120" class="pr" style="stroke-width:7"/><path d="M76 136 H112 M96 136 V168 M150 120 V168" class="pr"/>`, props: [{ k: "bar", on: "hand1", r: 5 }] },
  pushdown: { frames: [{ at: "ankle", x: 112, y: 164, T: 8, L1: [6, -6], L2: [-6, 6], A1: [12, 100] }, { at: "ankle", x: 112, y: 164, T: 8, L1: [6, -6], L2: [-6, 6], A1: [12, 12] }],
    scene: `<path d="M176 8 V168" class="pr"/><circle cx="168" cy="16" r="4" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [168, 16] }, { k: "grip", on: "hand1" }] },
  cablecurl1: { frames: [{ at: "ankle", x: 110, y: 164, T: 0, L1: [6, -6], L2: [-6, 6], A1: [6, 8] }, { at: "ankle", x: 110, y: 164, T: 0, L1: [6, -6], L2: [-6, 6], A1: [8, 160] }],
    scene: `<path d="M176 8 V168" class="pr"/><circle cx="168" cy="158" r="4" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [168, 158] }, { k: "grip", on: "hand1" }] },
  pullup: { frames: [{ at: "hip", x: 118, y: 128, T: 0, L1: [10, -25], hand1: [124, 16], hand2: [112, 16] }, { at: "hip", x: 118, y: 84, T: 0, L1: [20, -35], hand1: [124, 16], hand2: [112, 16] }],
    scene: `<path d="M70 16 H170 M76 16 V168 M164 16 V168" class="pr"/>` },
  rdl: { frames: [{ at: "ankle", x: 112, y: 164, T: 0, L1: [4, -4], A1: [0, 0] }, { at: "ankle", x: 112, y: 164, T: 78, L1: [-12, 12], A1: [0, 0] }], props: [{ k: "db", on: "hand1" }] },
  nordic: { frames: [{ at: "knee", x: 108, y: 160, T: 0, L1: [0, -90], A1: [25, 150], F1: 180 }, { at: "knee", x: 108, y: 160, T: 42, L1: [-42, -90], A1: [80, 120], F1: 180 }],
    scene: `<rect x="40" y="152" width="30" height="10" rx="4" class="pr-fill"/>` },
  dbpress: { frames: [{ at: "hip", x: 105, y: 126, T: -6, L1: [88, 3], A1: [15, 175] }, { at: "hip", x: 105, y: 126, T: -6, L1: [88, 3], A1: [178, 178] }],
    scene: `<path d="M96 134 L88 60" class="pr" style="stroke-width:8"/><path d="M88 134 H128 M105 134 V168" class="pr"/>`, props: [{ k: "db", on: "hand1" }] }
});
A.facepull = { frames: [{ at: "hip", x: 90, y: 158, T: -8, L1: [86, 92], A1: [105, 100], F1: -80 }, { at: "hip", x: 90, y: 158, T: -8, L1: [86, 92], A1: [168, 60], F1: -80 }],
  scene: `<path d="M226 8 V168" class="pr"/><circle cx="226" cy="104" r="4" class="pr"/>`, props: [{ k: "cable", on: "hand1", from: [226, 104] }, { k: "grip", on: "hand1" }] };

/* ---------- Zeichnen ---------- */
function crankPose(a, t) {
  const th = t * Math.PI * 2;
  const f1 = [a.center[0] + Math.cos(th) * a.r, a.center[1] + Math.sin(th) * a.r];
  const f2 = [a.center[0] - Math.cos(th) * a.r, a.center[1] - Math.sin(th) * a.r];
  return { at: "hip", x: a.hip[0], y: a.hip[1], T: a.T, L1: [0, 0], foot1: f1, foot2: f2, hand1: a.hand, hand2: a.hand, F1: 10 * Math.sin(th), F2: -10 * Math.sin(th) };
}
function draw(id, t, still) {
  const a = A[id]; if (!a) return "";
  let p, ball = null;
  if (a.mode === "crank") p = crankPose(a, t);
  else {
    const fr = a.frames, n = fr.length;
    const seq = a.mode === "cycle" ? fr.length : (fr.length - 1) * 2;
    const pos = (t * seq) % seq;
    let i = Math.floor(pos), e = pos - i;
    let ia, ib;
    if (a.mode === "cycle") { ia = i; ib = a.noLoopBack && i === n - 1 ? i : (i + 1) % n; }
    else { const leg = i < n - 1; ia = leg ? i : 2 * (n - 1) - i; ib = leg ? i + 1 : ia - 1; }
    e = still ? 0 : ease(e);
    p = mix(fr[ia], fr[ib], e);
    if (a.props && a.props.some(x => x.k === "ball")) {
      const ga = geom(fr[ia]), gb = geom(fr[ib]);
      const ba = fr[ia].ball || P(ga.hand1, 0, -8), bb = fr[ib].ball || P(gb.hand1, 0, -8);
      ball = [lerp(ba[0], bb[0], e), lerp(ba[1], bb[1], e)];
    }
  }
  const g = geom(p);
  // Charakter: verjüngte Gliedmassen, Shirt in der Farbe der Einheit, Shorts, Schuhe, Haare
  const f = n => n.toFixed(1);
  const taper = (a, b, r1, r2, c) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    return `<path d="M${f(a[0] + nx * r1)} ${f(a[1] + ny * r1)}L${f(b[0] + nx * r2)} ${f(b[1] + ny * r2)}L${f(b[0] - nx * r2)} ${f(b[1] - ny * r2)}L${f(a[0] - nx * r1)} ${f(a[1] - ny * r1)}Z" fill="${c}"/><circle cx="${f(a[0])}" cy="${f(a[1])}" r="${r1}" fill="${c}"/><circle cx="${f(b[0])}" cy="${f(b[1])}" r="${r2}" fill="${c}"/>`;
  };
  const mixP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const C = far => ({ skin: far ? "var(--ch-skin2)" : "var(--ch-skin)", shirt: far ? "var(--ch-shirt2)" : "var(--ch-shirt)", shorts: far ? "var(--ch-shorts2)" : "var(--ch-shorts)", shoe: far ? "var(--ch-shoe2)" : "var(--ch-shoe)" });
  const leg = (n, c) => taper(g.hip, g["knee" + n], 7, 5.2, c.skin) + taper(g["knee" + n], g["ankle" + n], 5.2, 3.6, c.skin) + taper(g.hip, mixP(g.hip, g["knee" + n], .55), 7.8, 6.8, c.shorts) + taper(g["ankle" + n], g["toe" + n], 4, 3.2, c.shoe);
  const arm = (n, c) => taper(g.shoulder, g["elbow" + n], 5, 4, c.skin) + taper(g["elbow" + n], g["hand" + n], 4, 3, c.skin) + taper(g.shoulder, mixP(g.shoulder, g["elbow" + n], .42), 5.8, 5.4, c.shirt) + `<circle cx="${f(g["hand" + n][0])}" cy="${f(g["hand" + n][1])}" r="3.4" fill="${c.skin}"/>`;
  const T = (p.T || 0) * R, fw = [Math.cos(T), Math.sin(T)];
  let s = `<line x1="4" y1="168.5" x2="236" y2="168.5" stroke="var(--anim-line)" stroke-width="1"/>` + (a.scene || "") + `<g stroke="none">`;
  const props = (a.props || []).map(o => PROP[o.k](g, o, ball)).join("") + `</g>`;
  const N = C(false), F = C(true);
  s += leg(2, F) + arm(2, F);
  s += `<circle cx="${f(g.hip[0])}" cy="${f(g.hip[1])}" r="8.6" fill="var(--ch-shorts)"/>` + taper(g.hip, g.shoulder, 8.8, 10.6, N.shirt) + taper(g.shoulder, g.neck, 3.6, 3.6, N.skin);
  s += `<circle cx="${f(g.head[0] - fw[0] * 1.8)}" cy="${f(g.head[1] - fw[1] * 1.8 - 0.8)}" r="9" fill="var(--ch-hair)"/><circle cx="${f(g.head[0] + fw[0] * 0.9)}" cy="${f(g.head[1] + fw[1] * 0.9 + 0.6)}" r="8.2" fill="${N.skin}"/>`;
  s += leg(1, N) + arm(1, N);
  return s + props;
}

const live = new Set();
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
function svgFor(id, t, still) { return `<svg viewBox="0 0 240 176" role="img" aria-label="Animation ${id}">${draw(id, t, still)}</svg>`; }
function mount(el) {
  const id = el.dataset.anim, ph = (window.ExPhotos || {})[id];
  const still = el.dataset.still !== undefined;
  if (ph && el.dataset.mode !== "figur") {
    const src = n => `assets/ex/${ph.id}-${n}.jpg`, fit = ph.fit ? ` style="object-fit:${ph.fit}"` : "";
    el.classList.add("has-photo");
    el.innerHTML = still ? `<img src="${src(0)}" alt="" loading="lazy" decoding="async">`
      : `<div class="ph"><img src="${src(0)}" alt=""${fit} decoding="async"><img class="b" src="${src(1)}" alt=""${fit} decoding="async"></div>` + (A[id] && el.tagName !== "BUTTON" ? `<button class="anim-toggle" data-animtoggle>Als Figur</button>` : "");
    return;
  }
  el.classList.remove("has-photo");
  if (!A[id]) { el.hidden = true; return; }
  el.innerHTML = svgFor(id, 0, true) + (A[id].note ? `<span class="anim-note">${A[id].note}</span>` : "") + (ph && el.tagName !== "BUTTON" ? `<button class="anim-toggle" data-animtoggle>Als Foto</button>` : "");
  if (still) return;
  live.add(el); if (live.size === 1) requestAnimationFrame(loop);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-animtoggle]"); if (!b) return;
  e.stopPropagation();
  const el = b.closest("[data-anim]"); el.dataset.mode = el.dataset.mode === "figur" ? "foto" : "figur"; live.delete(el); mount(el);
});
let t0 = performance.now();
function loop(now) {
  for (const el of live) {
    if (!el.isConnected) { live.delete(el); continue; }
    const id = el.dataset.anim, a = A[id];
    const period = a.mode === "crank" ? 1200 : (a.mode === "cycle" ? a.frames.length : (a.frames.length - 1) * 2) * 1100 / (a.speed || 1);
    let t = ((now - t0) % period) / period;
    if (reduce.matches) { const steps = a.mode === "cycle" ? a.frames.length : 2; t = Math.floor(t * steps) / steps; }
    const svg = el.firstElementChild; if (svg) svg.innerHTML = draw(id, t, reduce.matches);
  }
  if (live.size) requestAnimationFrame(loop);
}
window.ExAnim = { has: id => !!A[id], ids: () => Object.keys(A), svg: (id, t) => svgFor(id, t, false), mount, scan(root = document) { root.querySelectorAll("[data-anim]:not([data-mounted])").forEach(el => { el.dataset.mounted = "1"; mount(el); }); } };
})();
