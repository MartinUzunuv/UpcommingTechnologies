/* ──────────────────────────────────────────────────────────────
   Upcoming Technologies — "Rising dot" scroll film

   One continuous shot. Native scroll drives a damped timeline;
   a single canvas renders the protagonist (the blue dot) and a
   particle system that moves through six formations:

     U (the mark) → field → sphere → lattice → globe → horizon

   Copy lives in the DOM (index.html, [data-t] = in-start in-end
   out-start out-end, in scroll units: 100 = one screen height).
   ────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const doc = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const film = $('#film');
  const stage = $('#stage');
  const frame = $('#frame');
  const canvas = $('#canvas');
  const ctx = canvas && canvas.getContext('2d');
  if (!film || !stage || !ctx) { doc.classList.remove('js'); return; }

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = mq.matches;
  const onMQ = e => { reduce = e.matches; };
  if (mq.addEventListener) mq.addEventListener('change', onMQ); else mq.addListener(onMQ);

  /* ───────── math ───────── */
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const span = (s, a, b) => clamp01((s - a) / (b - a));
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeIn = t => t * t * t;
  const lerpAngle = (a, b, t) => {
    const d = ((((b - a) % TAU) + TAU * 1.5) % TAU) - TAU / 2;
    return a + d * t;
  };
  const rng = seed => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const R = rng(20261113);

  /* ───────── timeline (scroll units) ───────── */
  const FILM = 1440;
  const SCENES = [
    [0, 'Point'], [70, 'Mark'], [295, 'Craft'], [505, 'Intelligence'],
    [705, 'Principles'], [995, 'Sofia'], [1205, 'Upcoming'],
  ];
  const HOLDS = [
    { f: 'U',       a: 0,    b: 290 },
    { f: 'field',   a: 370,  b: 500 },
    { f: 'sphere',  a: 570,  b: 700 },
    { f: 'lattice', a: 760,  b: 990 },
    { f: 'globe',   a: 1060, b: 1200 },
    { f: 'horizon', a: 1270, b: FILM },
  ];

  /* ───────── brand geometry (from the mark's 10 15 100 106 viewBox, centred, /53) ───────── */
  const LG = { R: 32 / 53, cy: 4 / 53, top: -22 / 53, half: 9 / 53, dotY: -32 / 53, dotR: 13 / 53 };
  const U_BOTTOM = LG.cy + LG.R + LG.half;
  const HY = 0.3;                      // horizon height (world)
  const LAT0 = 42.6977 * DEG;          // Sofia
  const LON0 = 23.3219 * DEG;
  const CAM_D = 4.2;
  const ACCENT = '#3B5BFF';

  /* ───────── particles ───────── */
  const small = Math.min(window.innerWidth, window.innerHeight) < 560 || window.innerWidth < 760;
  const weak = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
  const N = small ? 1500 : weak ? 2100 : 2800;

  const rnd = new Float32Array(N);
  const delay = new Float32Array(N);
  const swirl = new Float32Array(N * 3);
  const sparkle = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    rnd[i] = R();
    delay[i] = R();
    const u = R() * 2 - 1, a = R() * TAU, q = Math.sqrt(1 - u * u);
    swirl[i * 3] = q * Math.cos(a); swirl[i * 3 + 1] = u; swirl[i * 3 + 2] = q * Math.sin(a);
    sparkle[i] = R() < 0.035 ? 1 : 0;
  }

  /* U — dust inside the stroke of the mark */
  const uPos = new Float32Array(N * 3);
  {
    const L1 = LG.cy - LG.top, arc = Math.PI * LG.R, total = 2 * L1 + arc;
    for (let i = 0; i < N; i++) {
      const d = R() * total;
      let px, py;
      if (d < L1) { px = -LG.R; py = LG.top + d; }
      else if (d < L1 + arc) { const a = Math.PI - (d - L1) / LG.R; px = Math.cos(a) * LG.R; py = LG.cy + Math.sin(a) * LG.R; }
      else { px = LG.R; py = LG.cy - (d - L1 - arc); }
      const ang = R() * TAU, rr = Math.sqrt(R()) * LG.half;
      uPos[i * 3] = px + Math.cos(ang) * rr;
      uPos[i * 3 + 1] = py + Math.sin(ang) * rr;
      uPos[i * 3 + 2] = (R() - 0.5) * 0.03;
    }
  }

  /* field — an engineered grid surface */
  const fx = new Float32Array(N), fz = new Float32Array(N);
  {
    const cols = Math.round(Math.sqrt(N * 1.55)), rows = Math.ceil(N / cols);
    for (let i = 0; i < N; i++) {
      const c = i % cols, r = (i / cols) | 0;
      fx[i] = (c / (cols - 1) - 0.5) * 5.6;
      fz[i] = (r / (rows - 1) - 0.5) * 3.6;
    }
  }

  /* sphere — fibonacci points + a nearest-neighbour mesh */
  const sp = new Float32Array(N * 3);
  {
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - ((i + 0.5) * 2) / N, r = Math.sqrt(1 - y * y), th = ga * i;
      sp[i * 3] = Math.cos(th) * r; sp[i * 3 + 1] = y; sp[i * 3 + 2] = Math.sin(th) * r;
    }
  }
  let EDGES = new Uint16Array(0);
  const buildEdges = () => {
    const W = Math.ceil(N * 0.09), seen = new Set(), out = [];
    for (let i = 0; i < N; i++) {
      const xi = sp[i * 3], yi = sp[i * 3 + 1], zi = sp[i * 3 + 2];
      let b1 = -1, b2 = -1, b3 = -1, d1 = 9, d2 = 9, d3 = 9;
      const lo = Math.max(0, i - W), hi = Math.min(N - 1, i + W);
      for (let j = lo; j <= hi; j++) {
        if (j === i) continue;
        const dx = sp[j * 3] - xi, dy = sp[j * 3 + 1] - yi, dz = sp[j * 3 + 2] - zi;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < d3) {
          if (d < d2) {
            if (d < d1) { d3 = d2; b3 = b2; d2 = d1; b2 = b1; d1 = d; b1 = j; }
            else { d3 = d2; b3 = b2; d2 = d; b2 = j; }
          } else { d3 = d; b3 = j; }
        }
      }
      for (const j of [b1, b2, b3]) {
        if (j < 0) continue;
        const a = Math.min(i, j), b = Math.max(i, j), key = a * N + b;
        if (!seen.has(key)) { seen.add(key); out.push(a, b); }
      }
    }
    EDGES = new Uint16Array(out);
  };

  /* lattice — order; heat patterns per principle */
  let n = Math.floor(Math.cbrt(N)); if (n % 2 === 0) n -= 1;
  const n3 = n * n * n, c0 = (n - 1) >> 1, lstep = 1.9 / (n - 1);
  const latPos = new Float32Array(N * 3), latVis = new Float32Array(N);
  const latCross = new Uint8Array(N), latShell = new Uint8Array(N), latPath = new Int16Array(N).fill(-1);
  let pathLen = 0;
  {
    // a self-avoiding walk from the centre: "every decision traceable to its origin"
    const order = new Int16Array(n3).fill(-1);
    const p = [c0, c0, c0];
    const idx = q => q[0] + q[1] * n + q[2] * n * n;
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const W = rng(42);
    let dir = 0;
    order[idx(p)] = pathLen++;
    for (let k = 0; k < n * 5; k++) {
      const ok = dirs.map((d, di) => di).filter(di => {
        const q = [p[0] + dirs[di][0], p[1] + dirs[di][1], p[2] + dirs[di][2]];
        return q.every(v => v >= 0 && v < n) && order[idx(q)] < 0;
      });
      if (!ok.length) break;
      if (!(ok.includes(dir) && W() < 0.62)) dir = ok[(W() * ok.length) | 0];
      p[0] += dirs[dir][0]; p[1] += dirs[dir][1]; p[2] += dirs[dir][2];
      order[idx(p)] = pathLen++;
    }
    for (let i = 0; i < N; i++) {
      const k = i < n3 ? i : (i - n3) % n3;
      const ix = k % n, iy = ((k / n) | 0) % n, iz = (k / (n * n)) | 0;
      latPos[i * 3] = ix * lstep - 0.95;
      latPos[i * 3 + 1] = iy * lstep - 0.95;
      latPos[i * 3 + 2] = iz * lstep - 0.95;
      latVis[i] = i < n3 ? 1 : 0;
      if (i < n3) {
        latCross[i] = (ix === c0) + (iy === c0) + (iz === c0) >= 2 ? 1 : 0;
        latShell[i] = ix === 0 || iy === 0 || iz === 0 || ix === n - 1 || iy === n - 1 || iz === n - 1 ? 1 : 0;
        latPath[i] = order[k];
      }
    }
  }

  /* globe — a graticule aligned to Sofia's meridian and parallel */
  const sofia = [Math.cos(LAT0) * Math.sin(LON0), -Math.sin(LAT0), -Math.cos(LAT0) * Math.cos(LON0)];
  const glPos = new Float32Array(N * 3), glHeat = new Float32Array(N);
  {
    const lines = [];
    for (let k = 0; k < 12; k++) lines.push({ m: true, v: LON0 + k * 30 * DEG, len: 160 * DEG, hot: k === 0 });
    for (let k = -4; k <= 1; k++) {
      const lat = LAT0 + k * 30 * DEG;
      if (Math.abs(lat) <= 80 * DEG) lines.push({ m: false, v: lat, len: TAU * Math.cos(lat), hot: k === 0 });
    }
    const total = lines.reduce((s, l) => s + l.len, 0);
    let li = 0, acc = 0;
    for (let i = 0; i < N; i++) {
      const d = ((i + 0.5) / N) * total;
      while (li < lines.length - 1 && d > acc + lines[li].len) { acc += lines[li].len; li++; }
      const l = lines[li], u = (d - acc) / l.len;
      const lat = l.m ? (-80 + u * 160) * DEG : l.v;
      const lon = l.m ? l.v : u * TAU;
      const x = Math.cos(lat) * Math.sin(lon), y = -Math.sin(lat), z = -Math.cos(lat) * Math.cos(lon);
      glPos[i * 3] = x; glPos[i * 3 + 1] = y; glPos[i * 3 + 2] = z;
      const ang = Math.acos(Math.max(-1, Math.min(1, x * sofia[0] + y * sofia[1] + z * sofia[2])));
      const prox = Math.exp(-Math.pow(ang / 0.075, 2));
      const line = l.hot ? 0.22 + 0.6 * Math.exp(-Math.pow(ang / 0.55, 2)) : 0;
      glHeat[i] = Math.min(1, Math.max(prox, line));
    }
  }

  /* horizon — a line of light, densest at the centre */
  const hzX = new Float32Array(N), hzJ = new Float32Array(N), hzHeat = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = R() * 2 - 1;
    const x = Math.sign(v) * Math.pow(Math.abs(v), 1.8) * 4.2;
    hzX[i] = x;
    hzJ[i] = (R() + R() + R() - 1.5) * 0.016;
    hzHeat[i] = Math.exp(-x * x * 0.9) * 0.85;
  }

  const VIS = { U: null, field: null, sphere: null, lattice: latVis, globe: null, horizon: null };

  /* ───────── formations at time t ───────── */
  const ax = new Float32Array(3), ay = new Float32Array(3), az = new Float32Array(3);
  function fill(f, pos, heat, t, s) {
    switch (f) {
      case 'U':
        pos.set(uPos); heat.fill(0); return;

      case 'field': {
        const ring = (t * 0.5) % 3.2, ringFade = 1 - ring / 3.2;
        for (let i = 0; i < N; i++) {
          const x = fx[i], z = fz[i], j = i * 3;
          pos[j] = x;
          pos[j + 1] = 0.34 + 0.15 * Math.sin(x * 1.2 + t * 0.42) * Math.cos(z * 1.5 - t * 0.3) + 0.05 * Math.sin((x - z) * 2.7 + t * 0.66);
          pos[j + 2] = z;
          const d = Math.sqrt(x * x + (z - 0.1) * (z - 0.1)), rr = d - ring;
          heat[i] = Math.min(1, Math.exp(-d * d * 4) * 0.9 + Math.exp(-rr * rr * 30) * 0.55 * ringFade);
        }
        return;
      }

      case 'sphere': {
        for (let k = 0; k < 3; k++) {
          const w = t * (0.33 + k * 0.17) + k * 2.1, tilt = 0.6 + k * 1.1;
          ax[k] = Math.cos(w); ay[k] = Math.sin(w) * Math.cos(tilt); az[k] = Math.sin(w) * Math.sin(tilt);
        }
        for (let i = 0; i < N; i++) {
          const j = i * 3, bx = sp[j], by = sp[j + 1], bz = sp[j + 2];
          const k = 1 + 0.035 * Math.sin(t * 1.1 + by * 3.2 + bx * 1.7);
          pos[j] = bx * k; pos[j + 1] = by * k; pos[j + 2] = bz * k;
          let h = 0;
          for (let q = 0; q < 3; q++) {
            const d = bx * ax[q] + by * ay[q] + bz * az[q];
            if (d > 0.9) { const v = (d - 0.9) * 10; if (v * v > h) h = v * v; }
          }
          heat[i] = h;
        }
        return;
      }

      case 'lattice': {
        pos.set(latPos);
        const wP = span(s, 760, 782) * (1 - span(s, 834, 852));
        const wS = span(s, 846, 866) * (1 - span(s, 904, 922));
        const wA = span(s, 914, 930);
        const tp = span(s, 918, 978) * pathLen;
        for (let i = 0; i < N; i++) {
          let h = latCross[i] ? wP : 0;
          if (latShell[i] && wS * 0.8 > h) h = wS * 0.8;
          const pi = latPath[i];
          if (pi >= 0 && wA > 0) { const q = tp - pi; if (q > 0) { const v = wA * (q < 1.5 ? 1 : 0.9); if (v > h) h = v; } }
          heat[i] = h;
        }
        return;
      }

      case 'globe':
        pos.set(glPos); heat.set(glHeat); return;

      case 'horizon':
        for (let i = 0; i < N; i++) {
          const j = i * 3, x = hzX[i];
          pos[j] = x;
          pos[j + 1] = HY + hzJ[i] * (1 + 0.6 * Math.sin(t * 0.9 + x * 3.1));
          pos[j + 2] = 0;
        }
        heat.set(hzHeat);
        return;
    }
  }

  /* ───────── camera & hero, per formation ───────── */
  let wide = true, zLogo = 0.3, titleOy = 0.08;

  function camFor(f, s, t, o) {
    o.ry = 0; o.rx = 0; o.zoom = 0.5; o.ox = 0; o.oy = 0;
    o.size = 1.4; o.alpha = 0.85; o.z0 = -10; o.z1 = 10; o.fmin = 1; o.lines = 0;
    switch (f) {
      case 'U':
        o.zoom = zLogo; o.oy = -titleOy * easeInOut(span(s, 140, 192));
        o.size = 1.05; o.alpha = 0.8;
        break;
      case 'field': {
        const lp = span(s, 300, 560);
        o.ry = -0.55 + lp * 0.8; o.rx = 0.58 - lp * 0.06;
        o.zoom = wide ? 0.62 : 0.9; o.oy = wide ? 0.0 : -0.06;
        o.size = 1.35; o.alpha = 0.9; o.z0 = -1.4; o.z1 = 2.1; o.fmin = 0;
        break;
      }
      case 'sphere': {
        const lp = span(s, 520, 740);
        o.ry = t * 0.07 + lp * 1.6; o.rx = 0.32 - lp * 0.14;
        o.zoom = wide ? 0.44 : 0.62; o.ox = wide ? 0.2 : 0; o.oy = wide ? 0 : -0.15;
        o.size = 1.45; o.z0 = -0.7; o.z1 = 0.9; o.fmin = 0.16; o.lines = 1;
        break;
      }
      case 'lattice': {
        const s1 = easeInOut(span(s, 838, 862)), s2 = easeInOut(span(s, 908, 932));
        o.ry = Math.PI / 4 + (s1 + s2) * (Math.PI / 2) + span(s, 720, 1020) * 0.3;
        o.rx = 0.56 - s1 * 0.2 + s2 * 0.32;
        o.zoom = wide ? 0.36 : 0.5; o.ox = wide ? 0.22 : 0; o.oy = wide ? 0 : -0.16;
        o.size = 1.6; o.z0 = -1.3; o.z1 = 1.3; o.fmin = 0.28;
        break;
      }
      case 'globe': {
        const rot = easeInOut(span(s, 1020, 1125)), zp = easeInOut(span(s, 1118, 1200));
        o.ry = LON0 - 2.6 * (1 - rot); o.rx = lerp(0.12, LAT0, rot);
        o.zoom = lerp(wide ? 0.44 : 0.6, wide ? 1.2 : 1.35, zp);
        o.ox = wide ? lerp(0.2, 0.17, zp) : 0; o.oy = wide ? 0 : -0.15;
        o.size = 1.35; o.z0 = -0.25; o.z1 = 0.45; o.fmin = 0.08;
        break;
      }
      case 'horizon':
        o.zoom = wide ? 0.5 : 0.62; o.size = 1.2; o.alpha = 0.95;
        break;
    }
  }

  function heroFor(f, s, t, o) {
    o.x = 0; o.y = 0; o.z = 0; o.r = 0.07; o.glow = 1;
    switch (f) {
      case 'U': {
        const p1 = easeInOut(span(s, 70, 122)), p2 = easeInOut(span(s, 118, 170));
        o.y = lerp(lerp(0, 0.24, p1), LG.dotY, p2);
        o.r = lerp(0.13, LG.dotR, p1);
        o.glow = lerp(1.15, 0.5, p1);
        break;
      }
      case 'field':   o.y = -0.08; o.z = 0.1; o.r = 0.055; o.glow = 1.3; break;
      case 'sphere':  o.r = 0.12; o.glow = 1.8; break;
      case 'lattice': o.r = 0.065; o.glow = 1.2; break;
      case 'globe':   o.x = sofia[0]; o.y = sofia[1]; o.z = sofia[2]; o.r = 0.03; o.glow = 1.4; break;
      case 'horizon': {
        const rp = easeInOut(span(s, 1262, 1352));
        o.y = lerp(HY, HY - 0.56, rp); o.r = lerp(0.05, 0.15, rp); o.glow = lerp(0.8, 2.2, rp);
        break;
      }
    }
  }

  const CAM_KEYS = ['rx', 'zoom', 'ox', 'oy', 'size', 'alpha', 'z0', 'z1', 'fmin', 'lines'];
  const HERO_KEYS = ['x', 'y', 'z', 'r', 'glow'];
  const blend = (a, b, t, out, keys) => { for (const k of keys) out[k] = a[k] + (b[k] - a[k]) * t; };

  /* ───────── canvas state ───────── */
  let cw = 0, ch = 0, cssW = 1, cssH = 1, dpr = 1, baseScale = 1, unit = 1;
  let dprCap = 2;                      // lowered automatically if the device can't hold ~55fps
  const posA = new Float32Array(N * 3), posB = new Float32Array(N * 3);
  const heatA = new Float32Array(N), heatB = new Float32Array(N);
  const PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N);
  const PA = new Float32Array(N), PH = new Float32Array(N), PS = new Float32Array(N);
  const OK = new Uint8Array(N);
  const ca = {}, cb = {}, cm = {}, ha = {}, hb = {}, hm = {};
  let segA = 0, segB = 0, segM = 0;
  let dotIntro = 0;

  const sprite = rgb => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(0.36, `rgba(${rgb},1)`);
    gr.addColorStop(0.5, `rgba(${rgb},.32)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const spriteW = sprite('232,237,250');
  const spriteB = sprite('88,120,255');

  function segment(s) {
    for (let k = 0; k < HOLDS.length; k++) {
      const h = HOLDS[k];
      if (s <= h.b) {
        if (k === 0 || s >= h.a) { segA = segB = k; segM = 0; return; }
        const p = HOLDS[k - 1];
        segA = k - 1; segB = k; segM = (s - p.b) / (h.a - p.b); return;
      }
    }
    segA = segB = HOLDS.length - 1; segM = 0;
  }

  function render(s, t) {
    const W = cw, H = ch;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);

    segment(s);
    const A = HOLDS[segA], B = HOLDS[segB], morph = segA !== segB;
    const em = easeInOut(segM);

    camFor(A.f, s, t, ca); heroFor(A.f, s, t, ha);
    if (morph) {
      camFor(B.f, s, t, cb); heroFor(B.f, s, t, hb);
      blend(ca, cb, em, cm, CAM_KEYS); cm.ry = lerpAngle(ca.ry, cb.ry, em);
      blend(ha, hb, em, hm, HERO_KEYS);
    } else { Object.assign(cm, ca); Object.assign(hm, ha); }

    const wOf = f => (A.f === f ? (morph ? 1 - em : 1) : 0) + (morph && B.f === f ? em : 0);
    const k = baseScale * cm.zoom * dpr;
    const ox = W * (0.5 + cm.ox), oy = H * (0.5 + cm.oy);
    const cY = Math.cos(cm.ry), sY = Math.sin(cm.ry), cX = Math.cos(cm.rx), sX = Math.sin(cm.rx);

    /* dawn behind the horizon */
    const wHz = wOf('horizon');
    if (wHz > 0.001) {
      const rise = easeInOut(span(s, 1262, 1352)), amt = wHz * (0.25 + 0.75 * rise);
      const R0 = W * 0.62;
      ctx.save();
      ctx.translate(ox, oy + HY * k);
      ctx.scale(1, 0.4);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R0);
      g.addColorStop(0, `rgba(59,91,255,${(0.3 * amt).toFixed(3)})`);
      g.addColorStop(0.45, `rgba(59,91,255,${(0.08 * amt).toFixed(3)})`);
      g.addColorStop(1, 'rgba(59,91,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-R0, -R0, R0 * 2, R0 * 2);
      ctx.restore();
    }

    /* particles */
    const pAlpha = !morph && segA === 0 ? span(s, 262, 286) : 1;
    if (pAlpha > 0.001) {
      fill(A.f, posA, heatA, t, s);
      if (morph) fill(B.f, posB, heatB, t, s);
      const visA = VIS[A.f], visB = VIS[B.f];
      const spread = 0.75, swirlAmt = reduce ? 0 : 0.42;
      const zr = 1 / (cm.z1 - cm.z0), fm = 1 - cm.fmin;
      const sizeK = cm.size * dpr * (wide ? 1 : 0.9);
      const margin = 40 * dpr;
      const sparkleLvl = 0.7 * (1 - wOf('U')) * (1 - wOf('horizon'));

      for (let i = 0; i < N; i++) {
        OK[i] = 0;
        const j = i * 3;
        let x, y, z, h, v;
        if (!morph) {
          x = posA[j]; y = posA[j + 1]; z = posA[j + 2]; h = heatA[i]; v = visA ? visA[i] : 1;
        } else {
          let e = segM * (1 + spread) - delay[i] * spread;
          e = easeInOut(e < 0 ? 0 : e > 1 ? 1 : e);
          const w = Math.sin(Math.PI * e) * swirlAmt * (0.4 + rnd[i]);
          x = posA[j] + (posB[j] - posA[j]) * e + swirl[j] * w;
          y = posA[j + 1] + (posB[j + 1] - posA[j + 1]) * e + swirl[j + 1] * w;
          z = posA[j + 2] + (posB[j + 2] - posA[j + 2]) * e + swirl[j + 2] * w;
          h = heatA[i] + (heatB[i] - heatA[i]) * e;
          const va = visA ? visA[i] : 1, vb = visB ? visB[i] : 1;
          v = va + (vb - va) * e;
        }
        if (sparkle[i] && h < sparkleLvl) h = sparkleLvl;

        const x1 = x * cY + z * sY, z1 = z * cY - x * sY;
        const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
        const zz = z2 + CAM_D;
        if (zz < 0.35) continue;
        const p = CAM_D / zz;
        const px = ox + x1 * k * p, py = oy + y1 * k * p;
        if (px < -margin || px > W + margin || py < -margin || py > H + margin) continue;
        let f = (z2 - cm.z0) * zr; f = f < 0 ? 0 : f > 1 ? 1 : f;
        const a = pAlpha * cm.alpha * v * (1 - f * fm);
        if (a < 0.015) continue;
        OK[i] = 1; PX[i] = px; PY[i] = py; PZ[i] = z2; PA[i] = a; PH[i] = h;
        PS[i] = sizeK * p * (0.7 + 0.6 * rnd[i]);
      }

      if (cm.lines > 0.01 && EDGES.length) drawEdges(Math.pow(cm.lines, 3), W);

      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        if (!OK[i]) continue;
        const d = PS[i] * 2.6, r = d * 0.5, a = PA[i], h = PH[i];
        if (h < 0.06) {
          ctx.globalAlpha = a; ctx.drawImage(spriteW, PX[i] - r, PY[i] - r, d, d);
        } else {
          if (h < 0.94) { ctx.globalAlpha = a * (1 - h); ctx.drawImage(spriteW, PX[i] - r, PY[i] - r, d, d); }
          const d2 = d * (1 + 0.45 * h), r2 = d2 * 0.5;
          ctx.globalAlpha = Math.min(1, a * h * 1.15);
          ctx.drawImage(spriteB, PX[i] - r2, PY[i] - r2, d2, d2);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    /* the mark's stroke — drawn as a vector during the title card */
    if (!morph && segA === 0 && s > 70) {
      const sa = 1 - span(s, 262, 290), dp = easeInOut(span(s, 70, 124));
      if (sa > 0.001 && dp > 0.001) {
        const L = (2 * (LG.cy - LG.top) + Math.PI * LG.R) * k;
        ctx.save();
        ctx.globalAlpha = sa;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = LG.half * 2 * k;
        ctx.lineCap = 'round';
        ctx.setLineDash([L * dp, L * 2]);
        ctx.beginPath();
        ctx.moveTo(ox - LG.R * k, oy + LG.top * k);
        ctx.lineTo(ox - LG.R * k, oy + LG.cy * k);
        ctx.arc(ox, oy + LG.cy * k, LG.R * k, Math.PI, 0, true);
        ctx.lineTo(ox + LG.R * k, oy + LG.top * k);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* the protagonist */
    {
      const x = hm.x, y = hm.y, z = hm.z;
      const x1 = x * cY + z * sY, z1 = z * cY - x * sY;
      const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
      const p = CAM_D / Math.max(0.35, z2 + CAM_D);
      const hx = ox + x1 * k * p, hy = oy + y1 * k * p;
      let r = hm.r * k * p, glow = hm.glow;
      if (s < 72) {
        r *= dotIntro; glow *= dotIntro;
        if (!reduce) r *= 1 + 0.045 * Math.sin(t * 1.8) * (1 - span(s, 40, 70));
      }
      if (r > 0.2) {
        // signal rings: in the cold open, and again when the camera locks on Sofia
        const ringK = Math.max((1 - span(s, 16, 60)) * dotIntro, wOf('globe') * easeInOut(span(s, 1118, 1190)) * 0.9);
        if (ringK > 0.01 && !reduce) {
          ctx.strokeStyle = '#6F8BFF'; ctx.lineWidth = Math.max(1, dpr);
          for (let q = 0; q < 2; q++) {
            const ph = (t / 3.4 + q * 0.5) % 1;
            ctx.globalAlpha = (1 - ph) * (1 - ph) * 0.5 * ringK;
            ctx.beginPath(); ctx.arc(hx, hy, r * (1.6 + ph * 8), 0, TAU); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        const gr = r * (2.4 + glow * 2.8);
        const g = ctx.createRadialGradient(hx, hy, r * 0.5, hx, hy, gr);
        g.addColorStop(0, `rgba(59,91,255,${Math.min(0.55, 0.32 * glow).toFixed(3)})`);
        g.addColorStop(0.4, `rgba(59,91,255,${Math.min(0.2, 0.09 * glow).toFixed(3)})`);
        g.addColorStop(1, 'rgba(59,91,255,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, gr, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.fill();
      }
    }
  }

  function drawEdges(amt, W) {
    const lim = (W * 0.18) * (W * 0.18);
    const pass = (style, width, test) => {
      ctx.strokeStyle = style; ctx.lineWidth = width;
      ctx.beginPath();
      for (let e = 0; e < EDGES.length; e += 2) {
        const a = EDGES[e], b = EDGES[e + 1];
        if (!OK[a] || !OK[b] || !test(a, b)) continue;
        const dx = PX[a] - PX[b], dy = PY[a] - PY[b];
        if (dx * dx + dy * dy > lim) continue;
        ctx.moveTo(PX[a], PY[a]); ctx.lineTo(PX[b], PY[b]);
      }
      ctx.stroke();
    };
    ctx.globalAlpha = 1;
    const lw = Math.max(0.6, 0.65 * dpr);
    pass(`rgba(170,185,255,${(0.045 * amt).toFixed(3)})`, lw, (a, b) => PZ[a] + PZ[b] >= 0);
    pass(`rgba(200,210,255,${(0.12 * amt).toFixed(3)})`, lw, (a, b) => PZ[a] + PZ[b] < 0);
    pass(`rgba(88,120,255,${(0.75 * amt).toFixed(3)})`, lw * 1.6, (a, b) => PH[a] + PH[b] > 0.7);
  }

  /* ───────── DOM: captions & HUD ───────── */
  const caps = $$('.cap[data-t]').map(el => ({
    el,
    t: el.dataset.t.trim().split(/\s+/).map(Number),
    lines: $$('.ln__i', el),
    interactive: el.hasAttribute('data-interactive'),
    key: -1,
    on: null,
  }));
  let introCap = 0;

  function updateCaps(s) {
    for (const c of caps) {
      const [a, b, x, y] = c.t;
      const e = a < 0 ? introCap : span(s, a, b);
      const o = y === undefined ? 0 : span(s, x, y);
      const key = Math.round(e * 2000) * 4001 + Math.round(o * 2000);
      if (key === c.key) continue;
      c.key = key;
      const n = c.lines.length;
      const st = n > 1 ? Math.min(0.14, 0.5 / (n - 1)) : 0;
      for (let i = 0; i < n; i++) {
        const li = easeOut(clamp01((e - i * st) / (1 - st * (n - 1))));
        const lo = easeIn(clamp01((o - i * st * 0.6) / (1 - st * 0.6 * (n - 1))));
        const el = c.lines[i];
        el.style.transform = `translate3d(0,${((1 - li) * 110 - lo * 70).toFixed(2)}%,0)`;
        el.style.opacity = (li * (1 - lo)).toFixed(3);
        el.style.filter = lo > 0.002 && lo < 0.998 ? `blur(${(lo * 8).toFixed(1)}px)` : '';
      }
      c.el.style.setProperty('--vis', (easeOut(e) * (1 - o)).toFixed(3));
      const on = e > 0.002 && o < 0.998;
      if (on !== c.on) {
        c.on = on;
        if (c.interactive) c.el.inert = !on;
      }
    }
  }

  const hudIdx = $('#hudIdx'), hudName = $('#hudName'), hudTc = $('#hudTc'), hudFill = $('#hudFill');
  const hudBar = $('#hudBar'), cue = $('#cue'), curtain = $('.fx--curtain');
  if (hudBar) {
    for (const [at] of SCENES.slice(1)) {
      const tick = document.createElement('span');
      tick.className = 'hud__tick';
      tick.style.left = `${(at / FILM) * 100}%`;
      hudBar.appendChild(tick);
    }
  }
  const pad = v => String(v).padStart(2, '0');
  let lastScene = -1, lastTc = '', lastCue = -1, lastCurtain = -1;

  function updateHUD(s, sRaw) {
    let idx = 0;
    for (let i = 0; i < SCENES.length; i++) if (s >= SCENES[i][0]) idx = i;
    if (idx !== lastScene) {
      lastScene = idx;
      if (hudIdx) hudIdx.textContent = pad(idx + 1);
      if (hudName) hudName.textContent = SCENES[idx][1];
    }
    const p = clamp01(s / FILM);
    if (hudFill) hudFill.style.transform = `scaleX(${p.toFixed(4)})`;
    const secs = p * 96, whole = Math.floor(secs);
    const tc = `00:${pad((whole / 60) | 0)}:${pad(whole % 60)}:${pad(Math.floor((secs % 1) * 24))}`;
    if (tc !== lastTc && hudTc) { hudTc.textContent = tc; lastTc = tc; }

    const cueO = Math.round((1 - span(s, 2, 22)) * 100) / 100;
    if (cueO !== lastCue && cue) { cue.style.opacity = cueO; lastCue = cueO; }

    const kc = Math.round(span(sRaw, FILM, FILM + 100) * 500) / 500;
    if (kc !== lastCurtain) {
      lastCurtain = kc;
      frame.style.transform = kc > 0 ? `translate3d(0,${(-kc * cssH * 0.12).toFixed(1)}px,0) scale(${(1 - kc * 0.06).toFixed(4)})` : '';
      if (curtain) curtain.style.opacity = (kc * 0.7).toFixed(3);
    }
  }

  /* ───────── layout ───────── */
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    cssW = w; cssH = h;
    wide = w >= 760 && w / h > 0.95;
    dpr = Math.min(window.devicePixelRatio || 1, wide ? dprCap : Math.min(dprCap, 1.75));
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (W !== cw || H !== ch) { canvas.width = cw = W; canvas.height = ch = H; }

    baseScale = Math.min(w, h) * 0.5;
    const markPx = Math.max(120, Math.min(Math.min(w, h) * (wide ? 0.32 : 0.36), 290));
    zLogo = markPx / (2 * baseScale);
    titleOy = wide ? 0.08 : 0.1;
    unit = h / 100;
    film.style.height = `${Math.round((FILM + 200) * unit)}px`;

    const ks = baseScale * zLogo;
    stage.style.setProperty('--intro-top', `${Math.round(h / 2 + 0.62 * ks + 18)}px`);
    stage.style.setProperty('--title-top', `${Math.round(h / 2 - titleOy * h + U_BOTTOM * ks + Math.max(26, h * 0.045))}px`);
    stage.style.setProperty('--hz', `${Math.round(h / 2 + HY * baseScale * (wide ? 0.5 : 0.62))}px`);
    lastCurtain = -1;
    for (const c of caps) c.key = -1;
  }

  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; resize(); });
  });

  /* film grain */
  {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d'), id = g.createImageData(160, 160), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = (Math.random() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(id, 0, 0);
    stage.style.setProperty('--grain', `url(${c.toDataURL('image/png')})`);
  }

  /* ───────── navigation ───────── */
  const go = y => window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  $$('[data-go="top"]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); go(0); }));
  $$('[data-go="end"]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); go(doc.scrollHeight); }));

  const end = $('#contact');
  if (end && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      for (const en of entries) {
        if (en.intersectionRatio >= 0.4) end.classList.add('is-in');
        else if (!en.isIntersecting) end.classList.remove('is-in');
      }
    }, { threshold: [0, 0.4] }).observe(end);
  } else if (end) end.classList.add('is-in');

  /* ───────── loop ───────── */
  const DAMP = 4.6;
  let target = 0, cur = 0, primed = false, last = performance.now(), time = 0, readyAt = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;

    target = (window.scrollY - film.offsetTop) / unit;
    if (!primed || reduce) { cur = target; primed = true; }
    else {
      const d = target - cur;
      cur += d * (1 - Math.exp(-dt * DAMP));
      if (Math.abs(d) < 0.01) cur = target;
    }
    if (!reduce) time += dt;

    dotIntro = readyAt ? easeOut(clamp01((now - readyAt) / 1300)) : 0;
    introCap = readyAt ? clamp01((now - readyAt - 550) / 1500) : 0;

    const sRaw = Math.max(0, cur);
    if (sRaw >= FILM + 100) return;           // the end card fully covers the stage
    const s = Math.min(sRaw, FILM);
    updateCaps(s);
    updateHUD(s, sRaw);
    render(s, time);
    adapt(dt);
  }

  /* adaptive resolution: step the canvas density down if frames run long */
  let ema = 1 / 60, framesSince = 0;
  function adapt(dt) {
    if (document.hidden || dt <= 0 || dt >= 0.1) return;
    ema = ema * 0.94 + dt * 0.06;
    if (++framesSince < 90) return;
    if (ema > 0.0185 && dprCap > 1.25 && dpr > 1.01) {
      dprCap = Math.max(1, Math.min(dprCap, dpr) - 0.25);
      framesSince = 0; ema = 1 / 60;
      resize();
    }
  }

  const ready = () => {
    if (readyAt) return;
    readyAt = performance.now();
    doc.classList.add('is-ready');
  };

  resize();
  buildEdges();
  requestAnimationFrame(tick);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(ready, 120));
  setTimeout(ready, 1600);
})();
