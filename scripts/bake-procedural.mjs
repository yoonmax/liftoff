// Bakes the original procedural textures: a cloud map, a tiling crater height map and a smoke atlas.
// Everything here is generated from seeded noise, so the output is original and reproducible.
import sharp from 'sharp';

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry(90210);
const perm = new Uint8Array(512); { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const G = []; for (let i = 0; i < 256; i++) { const z = rng() * 2 - 1, a = rng() * Math.PI * 2, s = Math.sqrt(1 - z * z); G.push([s * Math.cos(a), s * Math.sin(a), z]); }
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  const g = (ix, iy, iz, dx, dy, dz) => { const c = G[perm[(perm[(perm[(X + ix) & 255] + Y + iy) & 255] + Z + iz) & 255]]; return c[0] * dx + c[1] * dy + c[2] * dz; };
  return lerp(lerp(lerp(g(0,0,0,fx,fy,fz), g(1,0,0,fx-1,fy,fz), u), lerp(g(0,1,0,fx,fy-1,fz), g(1,1,0,fx-1,fy-1,fz), u), v),
              lerp(lerp(g(0,0,1,fx,fy,fz-1), g(1,0,1,fx-1,fy,fz-1), u), lerp(g(0,1,1,fx,fy-1,fz-1), g(1,1,1,fx-1,fy-1,fz-1), u), v), w);
}
function fbm(x, y, z, oct, gain = 0.5, lac = 2.03) { let a = 0.5, s = 0, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * noise3(x * f + i * 7.1, y * f - i * 3.3, z * f + i * 1.7); n += a; a *= gain; f *= lac; } return s / n; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------- clouds: 4096 x 2048 equirectangular, seamless across the dateline
async function bakeClouds() {
  const W = 4096, H = 2048, buf = Buffer.alloc(W * H);
  const cyclones = [];
  for (const [lat, n] of [[48, 6], [-50, 7], [16, 2], [-18, 1]]) for (let i = 0; i < n; i++) {
    const la = (lat + (rng() - 0.5) * 18) * Math.PI / 180, lo = rng() * Math.PI * 2;
    cyclones.push({ c: [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)], r: 0.13 + rng() * 0.16, s: Math.sign(lat) * (0.7 + rng() * 1.1) });
  }
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - (j + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat), deg = Math.abs(lat * 180 / Math.PI);
    // Climate bands: wet tropics, dry subtropics, stormy mid-latitudes.
    const itcz = Math.exp(-Math.pow((lat * 180 / Math.PI - 4) / 9, 2));
    const storm = Math.exp(-Math.pow((deg - 54) / 16, 2));
    const dry = Math.exp(-Math.pow((deg - 26) / 9, 2));
    const cover = 0.015 + 0.045 * itcz + 0.085 * storm - 0.1 * dry;
    for (let i = 0; i < W; i++) {
      const lon = (i + 0.5) / W * Math.PI * 2;
      let x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      for (const cy of cyclones) {
        const dx = x - cy.c[0], dy = y - cy.c[1], dz = z - cy.c[2], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > cy.r * cy.r * 9) continue;
        const a = cy.s * Math.exp(-d2 / (cy.r * cy.r)), ca = Math.cos(a), sa = Math.sin(a);
        const k = cy.c, kd = k[0] * x + k[1] * y + k[2] * z;
        const cx = k[1] * z - k[2] * y, cyy = k[2] * x - k[0] * z, cz = k[0] * y - k[1] * x;
        x = x * ca + cx * sa + k[0] * kd * (1 - ca);
        y = y * ca + cyy * sa + k[1] * kd * (1 - ca);
        z = z * ca + cz * sa + k[2] * kd * (1 - ca);
      }
      const wx = fbm(x * 2.1, y * 2.1, z * 2.1, 3), wy = fbm(x * 2.1 + 5.2, y * 2.1 + 1.3, z * 2.1 + 8.1, 3), wz = fbm(x * 2.1 + 9.1, y * 2.1 + 3.7, z * 2.1 + 2.2, 3);
      const qx = x + wx * 0.34, qy = y * 1.6 + wy * 0.24, qz = z + wz * 0.34;
      const base = fbm(qx * 2.6, qy * 2.6, qz * 2.6, 3);
      const mid = fbm(qx * 8.5 + wy, qy * 8.5, qz * 8.5 - wx, 4, 0.55);
      const fine = fbm(qx * 26, qy * 26, qz * 26, 3, 0.5);
      const n = base * 1.0 + mid * 0.62 + fine * 0.13 + cover;
      let c = sstep(-0.02, 0.26, n);
      // Popcorn cumulus over the tropics, where the big systems thin out.
      const pop = fbm(qx * 16, qy * 16, qz * 16, 3, 0.55);
      c = Math.max(c * (0.72 + 0.28 * sstep(0.02, 0.2, n + mid * 0.5)), sstep(0.1, 0.34, pop + cover * 0.9 + base * 0.5) * 0.34);
      const cirrus = fbm(x * 9 + wx * 2.4, y * 34 + wy * 3, z * 9 + wz * 2.4, 4);
      c = Math.max(c, sstep(0.08, 0.34, cirrus + cover * 0.8) * 0.3);
      buf[j * W + i] = Math.round(Math.pow(c, 1.25) * 255);
    }
    if (j % 512 === 0) console.log('clouds', j);
  }
  await sharp(buf, { raw: { width: W, height: H, channels: 1 } }).webp({ quality: 74, effort: 5 }).toFile('public/textures/earth_clouds.webp');
}

// ---------------- crater tile: R height, G/B tangent-space normal, seamless
async function bakeCraters() {
  const N = 1024, h = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, b = j / N * Math.PI * 2;
    const r = 1.2, x = Math.cos(a) * r, y = Math.sin(a) * r, z = Math.cos(b) * r, w = Math.sin(b) * r;
    h[j * N + i] = (fbm(x * 2 + z * 0.6, y * 2 + w * 0.6, (z + w) * 1.4, 6, 0.55)) * 0.12;
  }
  const count = 5200;
  for (let n = 0; n < count; n++) {
    const u = Math.pow(rng(), 5.0), R = 2.6 + u * 120, cx = rng() * N, cy = rng() * N;
    const depth = Math.pow(R, 0.9) * 0.0042, rim = depth * 0.2, age = 0.45 + rng() * 0.55;
    const ext = Math.ceil(R * 2.1);
    for (let dy = -ext; dy <= ext; dy++) for (let dx = -ext; dx <= ext; dx++) {
      const d = Math.hypot(dx, dy) / R; if (d > 2.1) continue;
      const ix = ((Math.floor(cx) + dx) % N + N) % N, iy = ((Math.floor(cy) + dy) % N + N) % N;
      let v = 0;
      if (d < 1) { const q = d * d; v = -depth * (1 - q) * (1 - q * 0.2) + rim * sstep(0.62, 1, d); }
      else v = rim * Math.pow(1 - sstep(1, 2.1, d), 2.4);
      if (R > 40 && d < 0.14) v += depth * 0.32 * (1 - d / 0.14);
      h[iy * N + ix] = h[iy * N + ix] * (d < 1 ? 1 - 0.9 * age * (1 - sstep(0.75, 1, d)) : 1) + v * age;
    }
  }
  let mn = 1e9, mx = -1e9; for (const v of h) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const rgb = Buffer.alloc(N * N * 3);
  const at = (x, y) => h[((y % N) + N) % N * N + ((x % N) + N) % N];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = (at(i + 1, j) - at(i - 1, j)) * 34, dy = (at(i, j + 1) - at(i, j - 1)) * 34;
    const k = rgb.length && j * N * 3 + i * 3;
    rgb[k] = Math.round((at(i, j) - mn) / (mx - mn) * 255);
    rgb[k + 1] = Math.round(Math.max(0, Math.min(1, dx * 0.5 + 0.5)) * 255);
    rgb[k + 2] = Math.round(Math.max(0, Math.min(1, dy * 0.5 + 0.5)) * 255);
  }
  await sharp(rgb, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 84, effort: 5, smartSubsample: false }).toFile('public/textures/crater_tile.webp');
}

// ---------------- smoke atlas: 4 x 4 cauliflower billows. RG normal, B density.
// Each cell is a real height field, the union of many sphere caps over a domain-warped base, so the normal has the
// crisp creases of turbulent steam. Density has a firm edge that erodes into wisps, and reaches zero inside the cell.
async function bakeSmoke() {
  const C = 256, A = 4, N = C * A, rgb = Buffer.alloc(N * N * 3);
  const height = new Float32Array(C * C), density = new Float32Array(C * C);
  for (let cell = 0; cell < A * A; cell++) {
    const ox = cell * 13.7, oy = cell * 5.3;
    const caps = [];
    const big = 7 + Math.floor(rng() * 5);
    for (let i = 0; i < big; i++) { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.42; caps.push([Math.cos(a) * r, Math.sin(a) * r, 0.2 + rng() * 0.2]); }
    // Smaller lobes grow on the surface of the large ones, and smaller ones again on those.
    for (let lvl = 0; lvl < 2; lvl++) {
      const parents = caps.slice(), per = lvl === 0 ? 5 : 3, scale = lvl === 0 ? 0.42 : 0.4;
      for (const [px, py, pr] of parents) for (let k = 0; k < per; k++) {
        if (caps.length > 240) break;
        const a = rng() * Math.PI * 2, r = pr * (0.55 + rng() * 0.5);
        caps.push([px + Math.cos(a) * r, py + Math.sin(a) * r, pr * scale * (0.7 + rng() * 0.6)]);
      }
    }
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      const u = (i + 0.5) / C * 2 - 1, v = (j + 0.5) / C * 2 - 1;
      const wx = u + fbm(u * 2.8 + ox, v * 2.8 + oy, 1.3, 3) * 0.2, wy = v + fbm(u * 2.8 + ox + 4, v * 2.8 + oy + 7, 8.1, 3) * 0.2;
      let h = 0, cover = 0;
      for (const [bx, by, br] of caps) {
        const q = br * br - (wx - bx) ** 2 - (wy - by) ** 2;
        if (q > 0) { const z = Math.sqrt(q); if (z > h) h = z; cover = Math.max(cover, Math.min(1, z / (br * 0.42))); }
      }
      const det = fbm(u * 7.3 + ox, v * 7.3 + oy, 3.1, 4, 0.55);
      const edge = 1 - sstep(0.66, 0.97, Math.hypot(u, v));
      height[j * C + i] = h * (0.92 + det * 0.3);
      const eroded = sstep(0.1, 0.62, cover + det * 0.55 - 0.1);
      density[j * C + i] = eroded * edge;
    }
    const at = (a, x, y) => a[Math.max(0, Math.min(C - 1, y)) * C + Math.max(0, Math.min(C - 1, x))];
    const cx = (cell % A) * C, cy = Math.floor(cell / A) * C;
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      const nx = (at(height, i - 1, j) - at(height, i + 1, j)) * 42, ny = (at(height, i, j - 1) - at(height, i, j + 1)) * 42;
      const l = Math.hypot(nx, ny, 1);
      const k = ((cy + j) * N + cx + i) * 3;
      rgb[k] = Math.round((nx / l * 0.5 + 0.5) * 255);
      rgb[k + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      rgb[k + 2] = Math.round(at(density, i, j) * 255);
    }
  }
  await sharp(rgb, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 88, effort: 5, smartSubsample: false }).toFile('public/textures/smoke_atlas.webp');
}

const only = process.argv[2];
if (!only || only === 'clouds') await bakeClouds();
if (!only || only === 'craters') await bakeCraters();
if (!only || only === 'smoke') await bakeSmoke();
console.log('procedural textures written');
