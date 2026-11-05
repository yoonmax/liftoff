import * as THREE from 'three';

// Surface for the fictional lf-1 "meridian", painted once at load onto canvases. Each body gets four layers that are
// drawn together so they agree: albedo, roughness and metalness (ORM), and a height field that is differentiated
// into a true normal map. Weld ridges, rivets, hatches and frost catch light because they exist in the height field,
// and weathering is ordered the way it happens: paint, panels, welds, then soot and rain on top.
const FONT = '"Jost Variable", Jost, "Helvetica Neue", Arial, sans-serif';
const small = () => (typeof innerWidth !== 'undefined' && innerWidth < 800 ? 0.5 : 1);

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h)); return [c, c.getContext('2d', { willReadFrequently: true })]; }

function tex(c, srgb = false, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  return t;
}

const rngOf = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

/** Central differences of a grey canvas, wrapping around the vehicle and clamped along it. */
function normalFromHeight(c, strength) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const [cn, n] = canvas(w, h);
  const img = n.createImageData(w, h), d = img.data;
  const at = (x, y) => src[(y * w + x) * 4];
  for (let y = 0; y < h; y++) {
    const yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const xl = x === 0 ? w - 1 : x - 1, xr = x === w - 1 ? 0 : x + 1;
      const dx = (at(xr, y) - at(xl, y)) / 255 * strength;
      const dy = (at(x, yu) - at(x, yd)) / 255 * strength; // canvas rows run opposite to v
      const il = 1 / Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      d[i] = (-dx * il * 0.5 + 0.5) * 255; d[i + 1] = (-dy * il * 0.5 + 0.5) * 255; d[i + 2] = (il * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  n.putImageData(img, 0, 0);
  return cn;
}

function noiseSpeckle(ctx, w, h, amount, seed = 12345) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  let s = seed;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const n = ((s & 255) / 255 - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Broad tonal drift: the thing that most separates a painted surface from a flat colour. */
function blotches(ctx, w, h, count, tint, maxAlpha, seed, stretch = 2.4) {
  const rnd = rngOf(seed);
  for (let i = 0; i < count; i++) {
    const x = rnd() * w, y = rnd() * h, r = (0.03 + rnd() * rnd() * 0.22) * w;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, tint.replace('A', (rnd() * maxAlpha).toFixed(3))); g.addColorStop(1, tint.replace('A', '0'));
    ctx.save(); ctx.translate(x, y); ctx.scale(1, stretch); ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r); ctx.restore();
  }
}

function runs(ctx, w, y0, y1, count, color, maxLen, seed, alpha = 0.09) {
  const rnd = rngOf(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = rnd() * w, y = y0 + rnd() * (y1 - y0), l = maxLen * (0.15 + rnd() * rnd() * 1.4);
    ctx.globalAlpha = 0.012 + rnd() * alpha;
    ctx.fillRect(x, y, 0.8 + rnd() * 3.4, l);
  }
  ctx.globalAlpha = 1;
}

function bodyMaps({ w = 2048, h = 4096, y0, y1, paint, normalStrength = 3.2 }) {
  const k = small(); w = Math.round(w * k); h = Math.round(h * k);
  const [ca, a] = canvas(w, h), [co, o] = canvas(w / 2, h / 2), [ch, b] = canvas(w, h);
  const toPx = (y) => (1 - (y - y0) / (y1 - y0)) * h;
  const px = (y0v, y1v) => [toPx(y1v), toPx(y0v) - toPx(y1v)];
  const c = {
    a, o, b, w, h, toPx, y0, y1, k,
    /** albedo */ bandA(yA, yB, color) { const [t, s] = px(yA, yB); a.fillStyle = color; a.fillRect(0, t, w, s); },
    /** roughness, metalness */ bandO(yA, yB, rough, metal = 0) { const [t, s] = px(yA, yB); o.fillStyle = `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`; o.fillRect(0, t / 2, w / 2, s / 2); },
    /** height, 128 neutral */ bandH(yA, yB, v) { const [t, s] = px(yA, yB); b.fillStyle = `rgb(${v},${v},${v})`; b.fillRect(0, t, w, s); },
    /** one rectangle in all three layers at once, u in 0..1, metres along the body */
    rect(u, yA, du, dy, { color, rough, metal = 0, height }) {
      const x = u * w, wd = du * w, [t, s] = px(yA, yA + dy);
      if (color) { a.fillStyle = color; a.fillRect(x, t, wd, s); }
      if (rough !== undefined) { o.fillStyle = `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`; o.fillRect(x / 2, t / 2, wd / 2, s / 2); }
      if (height !== undefined) { b.fillStyle = `rgb(${height},${height},${height})`; b.fillRect(x, t, wd, s); }
    },
  };
  a.fillStyle = '#aeaba0'; a.fillRect(0, 0, w, h);
  o.fillStyle = 'rgb(0,125,0)'; o.fillRect(0, 0, w / 2, h / 2);
  b.fillStyle = 'rgb(128,128,128)'; b.fillRect(0, 0, w, h);
  paint(c);
  return { map: tex(ca, true), roughnessMap: tex(co), metalnessMap: tex(co), normalMap: tex(normalFromHeight(ch, normalStrength)) };
}

/** Rolled plates, each with its own slight tone and sheen, and an actual weld bead between them. */
function plates(c, yA, yB, ringEvery, seams, { seed = 1, tone = 0.03, weld = '#6d7074', stagger = true, rivetRows = true } = {}) {
  const { a, o, b, w, toPx, k } = c;
  const rnd = rngOf(seed);
  const rows = Math.round((yB - yA) / ringEvery);
  for (let r = 0; r < rows; r++) {
    const y0 = yA + r * ringEvery, y1 = y0 + ringEvery, top = toPx(y1), hgt = toPx(y0) - top;
    const off = stagger && r % 2 ? 0.5 / seams : 0;
    for (let i = 0; i < seams; i++) {
      const x = ((i / seams + off) % 1) * w, wd = w / seams;
      const v = rnd() - 0.5;
      a.fillStyle = v > 0 ? `rgba(255,252,244,${v * tone * 2})` : `rgba(30,32,38,${-v * tone * 2})`;
      a.fillRect(x, top, wd, hgt); if (x + wd > w) a.fillRect(x - w, top, wd, hgt);
      const rv = Math.round(112 + rnd() * 34);
      o.fillStyle = `rgba(0,${rv},0,0.55)`; o.fillRect(x / 2, top / 2, wd / 2, hgt / 2); if (x + wd > w) o.fillRect((x - w) / 2, top / 2, wd / 2, hgt / 2);
      // vertical weld bead
      a.fillStyle = weld; a.globalAlpha = 0.36; a.fillRect(x - k, top, 2 * k, hgt); a.globalAlpha = 1;
      b.fillStyle = 'rgb(168,168,168)'; b.fillRect(x - 1.5 * k, top, 3 * k, hgt);
      b.fillStyle = 'rgb(112,112,112)'; b.fillRect(x - 3.5 * k, top, 1.5 * k, hgt); b.fillRect(x + 2 * k, top, 1.5 * k, hgt);
    }
  }
  for (let r = 0; r <= rows; r++) {
    const py = toPx(yA + r * ringEvery);
    a.fillStyle = 'rgba(30,31,34,.5)'; a.fillRect(0, py - 2.5 * k, w, 5 * k); // the shadow line a ring frame leaves
    a.fillStyle = weld; a.globalAlpha = 0.7; a.fillRect(0, py - 1.2 * k, w, 2.4 * k); a.globalAlpha = 1;
    b.fillStyle = 'rgb(188,188,188)'; b.fillRect(0, py - 2 * k, w, 4 * k);
    b.fillStyle = 'rgb(96,96,96)'; b.fillRect(0, py - 4.5 * k, w, 2 * k); b.fillRect(0, py + 2.5 * k, w, 2 * k);
    if (rivetRows) {
      for (const dy of [-9, 9]) for (let x = 0; x < w; x += 9.5 * k) {
        b.fillStyle = 'rgb(132,132,132)'; b.fillRect(x, py + dy * k, 1.8 * k, 1.8 * k);
        a.fillStyle = 'rgba(60,60,64,.26)'; a.fillRect(x, py + dy * k + 1 * k, 1.8 * k, 1.2 * k);
      }
    }
  }
}

function hatch(c, u, y, du, dy, color) {
  const { a, b, w, toPx, k } = c;
  const x = u * w, t = toPx(y + dy), wd = du * w, hg = toPx(y) - t;
  if (color) { a.fillStyle = color; a.fillRect(x, t, wd, hg); }
  a.strokeStyle = 'rgba(28,29,32,.72)'; a.lineWidth = 1.6 * k; a.strokeRect(x, t, wd, hg);
  b.fillStyle = 'rgb(144,144,144)'; b.fillRect(x, t, wd, hg);
  b.strokeStyle = 'rgb(70,70,70)'; b.lineWidth = 2 * k; b.strokeRect(x, t, wd, hg);
  const step = 11 * k;
  for (let i = step; i < wd; i += step) { for (const yy of [t + 4 * k, t + hg - 5 * k]) { a.fillStyle = 'rgba(40,40,44,.5)'; a.fillRect(x + i, yy, 1.6 * k, 1.6 * k); } }
}

function stencil(c, text, u, y, size, color = '#23262a', { rotate = 0, weight = 400, track = 0, align = 'left' } = {}) {
  const { a, w, toPx, k } = c;
  a.save(); a.translate(u * w, toPx(y)); if (rotate) a.rotate(rotate);
  a.fillStyle = color; a.font = `${weight} ${size * k}px ${FONT}`; a.textBaseline = 'middle'; a.textAlign = align;
  if ('letterSpacing' in a) a.letterSpacing = `${track * k}px`;
  a.fillText(text, 0, 0); a.restore();
}

/** Frost grows where liquid oxygen chills the wall: speckled crust, rougher and raised, broken up by the plate tone. */
function frost(c, yA, yB, seed = 21) {
  const { a, o, b, w, toPx, k } = c;
  const rnd = rngOf(seed);
  const top = toPx(yB), bot = toPx(yA), span = bot - top;
  const g = a.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, 'rgba(236,243,250,.62)'); g.addColorStop(0.72, 'rgba(236,243,250,.42)'); g.addColorStop(1, 'rgba(236,243,250,0)');
  a.fillStyle = g; a.fillRect(0, top, w, span);
  const n = Math.round(9000 * k * k);
  for (let i = 0; i < n; i++) {
    const v = rnd(), x = rnd() * w, y = top + Math.pow(rnd(), 1.3) * span, r = (0.8 + rnd() * rnd() * 5.4) * k;
    const fade = 1 - (y - top) / span;
    a.fillStyle = `rgba(248,251,255,${(0.05 + v * 0.26) * fade})`; a.fillRect(x, y, r, r * (0.6 + rnd()));
    if (i % 2 === 0) { const h = Math.round(128 + 80 * v * fade); b.fillStyle = `rgb(${h},${h},${h})`; b.fillRect(x, y, r, r); }
    if (i % 3 === 0) { o.fillStyle = `rgba(0,235,0,${0.35 * fade})`; o.fillRect(x / 2, y / 2, r, r); }
  }
  // meltwater tracks where the frost has run
  runs(a, w, top, bot, 240, '#eef3f8', 90 * k, seed + 3, 0.1);
}

function soot(c, yA, yB, strength, seed = 5) {
  const { a, o, w, toPx, k } = c;
  const top = toPx(yB), bot = toPx(yA);
  const g = a.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, 'rgba(20,18,16,0)'); g.addColorStop(0.55, `rgba(22,20,18,${0.3 * strength})`); g.addColorStop(1, `rgba(14,13,12,${0.86 * strength})`);
  a.fillStyle = g; a.fillRect(0, top, w, bot - top);
  // Combustion streaks climb the wall in tongues, not a clean gradient.
  const rnd = rngOf(seed);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * w, wd = (6 + rnd() * rnd() * 90) * k, l = (bot - top) * (0.15 + rnd() * rnd() * 0.95);
    const t = a.createLinearGradient(0, bot - l, 0, bot);
    const al = (0.02 + rnd() * 0.2) * strength;
    t.addColorStop(0, 'rgba(18,16,14,0)'); t.addColorStop(1, `rgba(16,14,12,${al})`);
    a.fillStyle = t; a.fillRect(x, bot - l, wd, l);
  }
  runs(a, w, top, bot, 900, '#141210', 200 * k, seed + 1, 0.14 * strength);
  const r = o.createLinearGradient(0, top / 2, 0, bot / 2);
  r.addColorStop(0, 'rgba(0,210,0,0)'); r.addColorStop(1, 'rgba(0,225,0,.8)');
  o.fillStyle = r; o.fillRect(0, top / 2, w / 2, (bot - top) / 2);
}

export function stageOneMaps() {
  return bodyMaps({
    y0: 3, y1: 53,
    paint(c) {
      const { a, o, b, w, h, toPx, k } = c;
      blotches(a, w, h, 90, 'rgba(38,36,30,A)', 0.07, 31);
      blotches(a, w, h, 60, 'rgba(255,252,242,A)', 0.07, 37);
      noiseSpeckle(a, w, h, 5);
      noiseSpeckle(b, w, h, 3, 777);
      plates(c, 6.2, 47, 5.1, 8, { seed: 9 });
      // Aft skirt: bare metal, heat-blued, with a band of stringers cut into the height field.
      c.bandA(3, 6.2, '#6c6a66'); c.bandO(3, 6.2, 0.46, 1); c.bandH(3, 6.2, 128);
      for (let i = 0; i < 3; i++) { const gy = 3.4 + i; const g = a.createLinearGradient(0, toPx(gy + 1), 0, toPx(gy)); g.addColorStop(0, 'rgba(46,58,92,0)'); g.addColorStop(0.5, 'rgba(46,58,92,.22)'); g.addColorStop(1, 'rgba(120,80,40,.18)'); a.fillStyle = g; a.fillRect(0, toPx(gy + 1), w, toPx(gy) - toPx(gy + 1)); }
      // Intertank: a dark corrugated collar between the two propellants
      c.bandA(27.9, 31.4, '#1d1f22'); c.bandO(27.9, 31.4, 0.62, 0.4); c.bandH(27.9, 31.4, 118);
      // Frost-pale oxygen section above it
      frost(c, 31.4, 47);
      soot(c, 6.2, 22, 1, 5);
      // rain and dust tracks run down from every ring frame
      for (let y = 11.3; y < 47; y += 5.1) runs(a, w, toPx(y), toPx(y) + 40 * k, 420, '#3a3a38', 150 * k, Math.round(y * 13), 0.1);
      // Identity: a graphite collar and one warm hairline, the only colour on the vehicle
      c.bandA(47, 53, '#15171a'); c.bandO(47, 53, 0.42, 0.5); c.bandH(47, 53, 124);
      for (let y = 47.1; y < 53; y += 0.31) { a.fillStyle = 'rgba(92,98,110,.1)'; a.fillRect(0, toPx(y), w, 2 * k); c.bandH(y, y + 0.05, 136); }
      for (let i = 0; i < 12; i++) { const x = i / 12 * w; a.fillStyle = 'rgba(70,74,84,.5)'; a.fillRect(x, toPx(53), 1.6 * k, toPx(47) - toPx(53)); b.fillStyle = 'rgb(160,160,160)'; b.fillRect(x, toPx(53), 3 * k, toPx(47) - toPx(53)); }
      c.bandA(45.62, 45.86, '#c8863c'); c.bandO(45.62, 45.86, 0.34, 1);
      c.bandA(44.1, 45.5, '#191b1e'); c.bandO(44.1, 45.5, 0.5, 0); c.bandH(44.1, 45.5, 128);
      // Access hatches, placed where a technician would need them
      for (const [u, y, du, dy] of [[0.07, 8.4, 0.05, 1.5], [0.57, 8.4, 0.05, 1.5], [0.32, 13.6, 0.035, 1], [0.82, 17.8, 0.035, 1], [0.13, 24.6, 0.05, 1.8], [0.64, 24.6, 0.05, 1.8], [0.42, 35, 0.03, 0.9], [0.91, 41.2, 0.03, 0.9]]) hatch(c, u, y, du, dy, 'rgba(190,188,180,.5)');
      // The wordmark runs up the tank, twice, large enough to read from the road.
      for (const u of [0.25, 0.75]) stencil(c, 'liftoff', u + 0.012, 11.5, 310, '#17191c', { rotate: -Math.PI / 2, weight: 300 });
      // Quiet technical marks
      for (const u of [0.02, 0.52]) {
        stencil(c, 'lf-1 meridian', u, 43.2, 24);
        stencil(c, 'oxidiser vent', u + 0.04, 30 + 2.4, 18);
        stencil(c, 'kerosene fill', u + 0.13, 11.8, 18);
        stencil(c, 'no step', u + 0.09, 6.9, 16);
        stencil(c, 'stage 1', u + 0.3, 24, 20);
      }
      // Hazard ticks by the umbilical
      for (let i = 0; i < 16; i++) { a.fillStyle = '#1a1c1f'; a.fillRect(0.38 * w + i * 8 * k, toPx(9.2), 4 * k, 18 * k); }
      // Paint gloss drifts, and scuffs catch the light
      runs(o, w / 2, 0, h / 2, 800, 'rgb(0,200,0)', 90 * k, 9, 0.2);
      runs(o, w / 2, 0, h / 2, 800, 'rgb(0,70,0)', 90 * k, 11, 0.2);
    },
  });
}

export function upperMaps() {
  return bodyMaps({
    y0: 53, y1: 78, h: 2048, w: 2048,
    paint(c) {
      const { a, o, b, w, h, toPx, k } = c;
      blotches(a, w, h, 44, 'rgba(38,36,30,A)', 0.05, 41);
      blotches(a, w, h, 30, 'rgba(255,252,242,A)', 0.06, 43);
      noiseSpeckle(a, w, h, 4, 991);
      plates(c, 53.5, 64, 3.5, 6, { seed: 15 });
      c.bandA(63.7, 64, '#15171a'); c.bandO(63.7, 64, 0.5, 0.3);
      c.bandA(53, 53.5, '#15171a');
      runs(a, w, toPx(64), toPx(53.5), 300, '#35332f', 80 * k, 15, 0.08);
      for (const u of [0.1, 0.6]) stencil(c, 'stage 2', u, 56.4, 26);
      for (const [u, y] of [[0.2, 59.6], [0.7, 59.6], [0.44, 57], [0.94, 57]]) hatch(c, u, y, 0.04, 1, 'rgba(190,188,180,.5)');
      // Fairing: composite skin, bone white, acoustic panel joints, and a long graphite shoulder. Note the fairing's
      // u runs 0..1 across each half, so anything centred at 0.5 lands in the middle of a half.
      const fairTop = toPx(78), fairBot = toPx(64);
      a.fillStyle = '#b8b5aa'; a.fillRect(0, fairTop, w, fairBot - fairTop);
      o.fillStyle = 'rgb(0,104,0)'; o.fillRect(0, fairTop / 2, w / 2, (fairBot - fairTop) / 2);
      b.fillStyle = 'rgb(128,128,128)'; b.fillRect(0, fairTop, w, fairBot - fairTop);
      blotches(a, w, h, 20, 'rgba(38,36,30,A)', 0.045, 47);
      for (let y = 66.6; y < 77; y += 2.6) { const py = toPx(y); a.fillStyle = 'rgba(60,60,60,.28)'; a.fillRect(0, py, w, 1.6 * k); b.fillStyle = 'rgb(104,104,104)'; b.fillRect(0, py - k, w, 2.5 * k); }
      for (let i = 0; i < 8; i++) { const x = (i + 0.5) / 8 * w; a.fillStyle = 'rgba(70,70,70,.2)'; a.fillRect(x, fairTop, 1.2 * k, fairBot - fairTop); b.fillStyle = 'rgb(108,108,108)'; b.fillRect(x - k, fairTop, 2 * k, fairBot - fairTop); }
      // Split-line: a real, dark seam on both edges of each half
      for (const x of [0, w - 3 * k]) { a.fillStyle = '#17181a'; a.fillRect(x, fairTop, 3 * k, fairBot - fairTop); b.fillStyle = 'rgb(60,60,60)'; b.fillRect(x, fairTop, 3 * k, fairBot - fairTop); }
      c.bandA(64, 65.7, '#15171a'); c.bandO(64, 65.7, 0.46, 0.4);
      c.bandA(65.86, 65.94, '#c8863c'); c.bandO(65.86, 65.94, 0.34, 1);
      runs(a, w, fairTop, fairBot, 260, '#5a564e', 60 * k, 19, 0.06);
      stencil(c, 'liftoff', 0.5, 70.2, 170, '#15171a', { weight: 300, align: 'center' });
      runs(o, w / 2, 0, h / 2, 300, 'rgb(0,190,0)', 50 * k, 13, 0.16);
    },
  });
}

export function boosterMaps() {
  return bodyMaps({
    y0: 2, y1: 39, w: 1024, h: 2048, normalStrength: 2.6,
    paint(c) {
      const { a, o, b, w, h, toPx, k } = c;
      a.fillStyle = '#2b2c2e'; a.fillRect(0, 0, w, h);
      o.fillStyle = 'rgb(0,132,0)'; o.fillRect(0, 0, w / 2, h / 2);
      blotches(a, w, h, 30, 'rgba(120,118,112,A)', 0.05, 61, 3);
      noiseSpeckle(a, w, h, 7, 313);
      plates(c, 4, 34, 6, 4, { seed: 23, weld: '#6a6c70', tone: 0.06, stagger: false });
      // Steel factory joints between the cast segments
      for (const y of [10, 16, 22, 28]) { c.bandA(y - 0.16, y + 0.16, '#6f7175'); c.bandO(y - 0.16, y + 0.16, 0.38, 1); c.bandH(y - 0.16, y + 0.16, 176); }
      c.bandA(2, 4, '#5c5a56'); c.bandO(2, 4, 0.48, 1);
      soot(c, 4, 13, 0.7, 29);
      // Nose in bone, separated from the body by a hairline
      c.bandA(33.4, 39, '#b4b1a7'); c.bandO(33.4, 39, 0.44, 0);
      c.bandA(33.26, 33.4, '#c8863c'); c.bandO(33.26, 33.4, 0.34, 1);
      runs(a, w, toPx(39), toPx(33.4), 120, '#47443e', 50 * k, 33, 0.07);
      for (const u of [0.15, 0.65]) { stencil(c, 'lf-1 sb', u, 30.6, 26); stencil(c, 'liftoff', u + 0.1, 12, 120, '#c9c6bc', { rotate: -Math.PI / 2, weight: 300 }); }
      void b;
    },
  });
}

export function foilMaps() {
  const S = 1024, [ca, a] = canvas(S, S), [cb, b] = canvas(S, S);
  a.fillStyle = '#c29235'; a.fillRect(0, 0, S, S);
  b.fillStyle = '#808080'; b.fillRect(0, 0, S, S);
  const rnd = rngOf(77);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S, sz = 12 + rnd() * rnd() * 150, rot = rnd() * Math.PI, sh = rnd();
    for (const ctx of [a, b]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.lineTo(sz * (0.3 + rnd()), -sz * 0.3); ctx.lineTo(sz * 0.7, sz * 0.5); ctx.closePath();
      if (ctx === a) ctx.fillStyle = sh > 0.5 ? `rgba(255,216,120,${0.04 + sh * 0.14})` : `rgba(86,52,8,${0.05 + sh * 0.18})`;
      else { const v = Math.round(sh * 255); ctx.fillStyle = `rgba(${v},${v},${v},.34)`; }
      ctx.fill(); ctx.restore();
    }
  }
  // the taped seams of a hand-made blanket
  a.fillStyle = 'rgba(70,44,10,.5)'; for (const p of [S * 0.25, S * 0.75]) { a.fillRect(p, 0, 4, S); a.fillRect(0, p, S, 4); }
  return { map: tex(ca, true, true), bumpMap: tex(cb, false, true) };
}

export function solarMaps() {
  const W = 1024, H = 512, [ca, a] = canvas(W, H), [cr, r] = canvas(W, H);
  a.fillStyle = '#0a1226'; a.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(0,70,0)'; r.fillRect(0, 0, W, H);
  const nx = 16, ny = 8, cw = W / nx, ch = H / ny;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = 10 + ((i * 7 + j * 13) % 9);
    a.fillStyle = `rgb(${v + 22},${v + 40},${v + 96})`;
    a.fillRect(i * cw + 2, j * ch + 2, cw - 4, ch - 4);
    a.fillStyle = 'rgba(180,190,210,.35)';
    for (let k = 1; k < 5; k++) a.fillRect(i * cw + 2, j * ch + k * ch / 5, cw - 4, 0.8);
    a.fillStyle = 'rgba(190,196,214,.5)'; a.fillRect(i * cw + cw / 2 - 0.6, j * ch + 2, 1.2, ch - 4);
  }
  a.fillStyle = '#b08f4a'; a.fillRect(0, H - 6, W, 6); a.fillRect(0, 0, W, 6); a.fillRect(0, 0, 5, H); a.fillRect(W - 5, 0, 5, H);
  return { map: tex(ca, true), roughnessMap: tex(cr) };
}
