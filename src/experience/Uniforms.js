import * as THREE from 'three';

// Uniforms shared by every material. Materials hold references to these objects, so a single write per
// frame reaches all of them without React being involved.
export const G = {
  uTime: { value: 0 },
  uCamRot: { value: new THREE.Matrix3() },
  uTan: { value: new THREE.Vector2(1, 1) },
  uRes: { value: new THREE.Vector2(1, 1) },
  uNoise: { value: null },
  uPx: { value: 1 },
  uSteps: { value: 12 },
  uLightSteps: { value: 4 },
};

function periodicNoise(size, freq, seed) {
  // Gradient noise with tiling lattice.
  const n = freq, perm = new Int32Array(n * n * n * 3);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < perm.length; i += 3) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    perm[i] = Math.round(r * Math.cos(a) * 1000); perm[i + 1] = Math.round(r * Math.sin(a) * 1000); perm[i + 2] = Math.round(z * 1000);
  }
  const out = new Float32Array(size * size * size);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  let o = 0;
  for (let k = 0; k < size; k++) for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = i / size * n, y = j / size * n, z = k / size * n;
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = x - xi, fy = y - yi, fz = z - zi, u = fade(fx), v = fade(fy), w = fade(fz);
    let val = 0;
    for (let c = 0; c < 8; c++) {
      const ox = c & 1, oy = (c >> 1) & 1, oz = (c >> 2) & 1;
      const idx = (((xi + ox) % n) + ((yi + oy) % n) * n + ((zi + oz) % n) * n * n) * 3;
      const dot = (perm[idx] * (fx - ox) + perm[idx + 1] * (fy - oy) + perm[idx + 2] * (fz - oz)) / 1000;
      val += dot * (ox ? u : 1 - u) * (oy ? v : 1 - v) * (oz ? w : 1 - w);
    }
    out[o++] = val;
  }
  return out;
}

/** 64^3 tiling noise volume: red is low-frequency, green high-frequency. */
export function createNoiseVolume() {
  const S = 64;
  const a = periodicNoise(S, 8, 1234), b = periodicNoise(S, 16, 991), c = periodicNoise(S, 32, 4242);
  const data = new Uint8Array(S * S * S * 4);
  for (let i = 0; i < a.length; i++) {
    const lo = a[i] * 0.7 + b[i] * 0.3;
    data[i * 4] = Math.max(0, Math.min(255, (lo * 1.15 + 0.5) * 255));
    data[i * 4 + 1] = Math.max(0, Math.min(255, ((b[i] * 0.55 + c[i] * 0.45) * 1.25 + 0.5) * 255));
    data[i * 4 + 2] = 0; data[i * 4 + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, S, S, S);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

export const FULLSCREEN = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
})();
