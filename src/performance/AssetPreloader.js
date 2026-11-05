import * as THREE from 'three';

// Downloads textures with true byte-level progress, decodes them off the main thread and hands back
// three.js textures. Sizes are known up front so the bar never overshoots even if a server omits headers.
const BASE = import.meta.env?.BASE_URL ?? '/';
export const MANIFEST = {
  earthNight: { url: 'textures/earth_night.webp', srgb: true, stage: 'critical', bytes: 175e3 },
  earthMask: { url: 'textures/earth_mask.webp', stage: 'critical', bytes: 70e3 },
  earthClouds: { url: 'textures/earth_clouds.webp', stage: 'critical', bytes: 640e3 },
  smokeAtlas: { url: 'textures/smoke_atlas.webp', stage: 'critical', bytes: 82e3 },
  earthDay: { url: 'textures/earth_day.webp', srgb: true, stage: 'orbit', bytes: 925e3 },
  moonColor: { url: 'textures/moon_color.webp', srgb: true, stage: 'lunar', bytes: 256e3 },
  moonHeight: { url: 'textures/moon_height.webp', stage: 'lunar', bytes: 83e3 },
  craterTile: { url: 'textures/crater_tile.webp', stage: 'lunar', bytes: 140e3, repeat: true },
};

const fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
fallback.needsUpdate = true;

export const assets = { textures: {}, listeners: new Set(), progress: 0, loaded: new Set() };
for (const k of Object.keys(MANIFEST)) assets.textures[k] = fallback;

function emit() { for (const l of assets.listeners) l(); }

async function fetchBytes(url, known, onDelta) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url}: ${res.status}`);
  if (!res.body) { const b = await res.blob(); onDelta(known); return b; }
  const reader = res.body.getReader(); const parts = []; let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); seen += value.length;
    onDelta(Math.min(value.length, Math.max(0, known - seen + value.length)));
  }
  return new Blob(parts, { type: res.headers.get('content-type') || 'image/webp' });
}

async function loadOne(key, gl, tally) {
  const m = MANIFEST[key];
  const blob = await fetchBytes(BASE + m.url, m.bytes, (d) => { tally.seen += d; tally.onProgress?.(tally.seen / tally.total); });
  const bmp = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const tex = new THREE.Texture(bmp);
  tex.colorSpace = m.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = m.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.min(8, gl?.capabilities?.getMaxAnisotropy?.() ?? 1);
  tex.flipY = false;
  tex.needsUpdate = true;
  gl?.initTexture?.(tex);
  assets.textures[key] = tex;
  assets.loaded.add(key);
  emit();
  return tex;
}

/** Loads whichever assets a stage needs. Resolves once they are all usable. */
export function loadStage(stages, gl, onProgress) {
  const keys = Object.keys(MANIFEST).filter((k) => stages.includes(MANIFEST[k].stage) && !assets.loaded.has(k));
  const total = keys.reduce((s, k) => s + MANIFEST[k].bytes, 0);
  const tally = { seen: 0, total: Math.max(total, 1), onProgress };
  if (!keys.length) { onProgress?.(1); return Promise.resolve(); }
  return Promise.all(keys.map((k) => loadOne(k, gl, tally))).then(() => onProgress?.(1));
}

export const stagesFor = (p) => (p < 0.3 ? ['critical'] : p < 0.5 ? ['critical', 'orbit'] : ['critical', 'orbit', 'lunar']);
export const isLoaded = (key) => assets.loaded.has(key);
