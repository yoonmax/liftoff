import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import groundFrag from '../shaders/ground/ground.frag.glsl?raw';
import { frame, track } from '../experience/ExperienceController.js';
import { G } from '../experience/Uniforms.js';
import { smoothstep } from '../animation/Interpolation.js';
import { PAD_DECK } from '../camera/CameraController.js';
import { QUALITY, useQuality } from '../performance/QualityManager.js';

// The launch site: a low artificial mound of wet concrete, a massive pedestal over the flame trench, a lattice service
// tower, xenon searchlights on the ground throwing beams through the mist, and the far buildings that give it scale.
const DECK = PAD_DECK;
export { PAD_DECK };

/** Height of the mound. The pad is landform, not a slab: it eases into the surrounding ground over a hundred metres. */
export const MOUND_H = 2.4;
export const groundHeight = (r) => MOUND_H * (1 - smoothstep(50, 170, r));

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

class BeamSet {
  constructor() { this.list = []; }
  add(a, b, t) { this.list.push([new THREE.Vector3(...a), new THREE.Vector3(...b), t]); }
  build(material) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geo, material, this.list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.list.forEach(([a, b, t], i) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      q.setFromUnitVectors(up, d.divideScalar(len));
      s.set(t, len, t); c.addVectors(a, b).multiplyScalar(0.5);
      m.compose(c, q, s); mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }
}

function buildLattice() {
  const beams = new BeamSet();
  // Main tower: rectangular truss 12m square, 96m tall, set back at x = +24
  const cx = 24, cz = -7, W = 6, top = 94;
  const lv = 6;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    beams.add([cx + sx * W, 0, cz + sz * W], [cx + sx * W, top, cz + sz * W], 0.66);
    beams.add([cx + sx * (W - 0.8), 0, cz + sz * W], [cx + sx * (W - 0.8), top, cz + sz * W], 0.2);
  }
  for (let y = 0; y < top; y += lv) {
    const y1 = y + lv;
    for (const [ax, az, bx, bz] of [[W, W, -W, W], [-W, W, -W, -W], [-W, -W, W, -W], [W, -W, W, W]]) {
      beams.add([cx + ax, y1, cz + az], [cx + bx, y1, cz + bz], 0.34);
      const flip = Math.floor(y / lv) % 2 === 0;
      beams.add(flip ? [cx + ax, y, cz + az] : [cx + bx, y, cz + bz], flip ? [cx + bx, y1, cz + bz] : [cx + ax, y1, cz + az], 0.2);
      // Half-height sub-bracing makes the truss read as heavy industrial steel instead of a diagram.
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      beams.add([cx + mx, y, cz + mz], [cx + mx, y1, cz + mz], 0.1);
    }
    beams.add([cx - W, y1, cz], [cx + W, y1, cz], 0.14); beams.add([cx, y1, cz - W], [cx, y1, cz + W], 0.14);
    beams.add([cx - W, y1, cz - W], [cx + W, y1, cz + W], 0.09);
    if (y % 12 === 0) { // service platforms, grated and railed
      for (let i = -6; i <= 6; i++) beams.add([cx - W - 1.8, y1 + 0.1, cz + i * 1.1], [cx + W + 1.8, y1 + 0.1, cz + i * 1.1], 0.07);
      for (const dz of [-W - 1.8, W + 1.8]) {
        beams.add([cx - W - 1.8, y1 + 1.1, cz + dz], [cx + W + 1.8, y1 + 1.1, cz + dz], 0.05);
        for (let i = -3; i <= 3; i++) beams.add([cx + i * 2.6, y1, cz + dz], [cx + i * 2.6, y1 + 1.1, cz + dz], 0.04);
      }
      beams.add([cx - W - 1.8, y1 + 1.1, cz - W - 1.8], [cx - W - 1.8, y1 + 1.1, cz + W + 1.8], 0.05);
    }
  }
  // Stairs zigzag inside; elevator guides run the full height
  for (let y = 0; y < top - 6; y += 3) { beams.add([cx + 2.4, y, cz + 2], [cx - 2.4, y + 1.5, cz + 2], 0.07); beams.add([cx - 2.4, y + 1.5, cz + 2], [cx + 2.4, y + 3, cz + 2], 0.07); }
  for (const dx of [-2.8, 2.8]) beams.add([cx + dx, 0, cz - 2], [cx + dx, top, cz - 2], 0.16);
  // Service arms reaching for the vehicle, each ending at an umbilical plate on the skin.
  const arm = (y, h = 2.2) => {
    const x0 = cx - W, x1 = 3.72, z = cz + 4, z2 = -0.62, len = x0 - x1;
    for (const dy of [0, h]) for (const dz of [-1.1, 1.1]) beams.add([x0, y + dy, z + dz], [x1, y + dy, z2 + dz], 0.2);
    const steps = Math.round(len / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = x0 + (x1 - x0) * t, zc = z + (z2 - z) * t;
      beams.add([x, y, zc - 1.1], [x, y + h, zc - 1.1], 0.09); beams.add([x, y, zc + 1.1], [x, y + h, zc + 1.1], 0.09);
      beams.add([x, y, zc - 1.1], [x, y, zc + 1.1], 0.07); beams.add([x, y + h, zc - 1.1], [x, y + h, zc + 1.1], 0.07);
      if (i < steps) { const nx = x0 + (x1 - x0) * (i + 1) / steps, nz = z + (z2 - z) * (i + 1) / steps; beams.add([x, y, zc - 1.1], [nx, y + h, nz - 1.1], 0.05); beams.add([x, y + h, zc + 1.1], [nx, y, nz + 1.1], 0.05); }
    }
    // A bundle of hoses running along underneath
    for (const dz of [-0.5, 0, 0.5]) beams.add([x0, y - 0.3, z + dz], [x1, y - 0.5, z2 + dz], 0.12);
  };
  arm(DECK + 60, 2.6);
  arm(DECK + 43, 2.0);
  arm(DECK + 15, 2.0);

  // Lightning mast above the tower, guyed
  beams.add([cx, top, cz], [cx, top + 26, cz], 0.4);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) beams.add([cx, top + 22, cz], [cx + sx * W, top, cz + sz * W], 0.05);
  // Hold-down clamps on the mount ring, leaving room for the boosters along the z axis
  for (const a of [Math.PI * 0.14, Math.PI * 0.86, Math.PI * 1.14, Math.PI * 1.86, Math.PI * 0.32, Math.PI * 0.68, Math.PI * 1.32, Math.PI * 1.68]) {
    const c = Math.cos(a), s = Math.sin(a), r0 = 7.6, r1 = 4.15;
    beams.add([c * r0, DECK - 0.1, s * r0], [c * r1, DECK + 3.3, s * r1], 0.46);
    beams.add([c * r1, DECK + 3.3, s * r1], [c * (r1 - 0.42), DECK + 3.8, s * (r1 - 0.42)], 0.56);
    beams.add([c * (r0 + 0.7), DECK + 0.1, s * (r0 + 0.7)], [c * (r1 + 0.8), DECK + 2.5, s * (r1 + 0.8)], 0.2);
  }
  // Far lightning towers
  for (const [x, z] of [[-172, -128], [188, -154], [-96, 210], [196, 174]]) {
    beams.add([x, 0, z], [x, 118, z], 1.1);
    for (let y = 0; y < 118; y += 8) { beams.add([x - 1.7, y, z], [x + 1.7, y + 8, z], 0.16); beams.add([x + 1.7, y, z], [x - 1.7, y + 8, z], 0.16); beams.add([x, y, z - 1.7], [x, y + 8, z + 1.7], 0.16); }
  }
  // Floodlight masts
  for (const [x, z] of FLOOD_MASTS) {
    beams.add([x, 0, z], [x, 37, z], 0.8);
    beams.add([x - 3.2 * Math.sign(z), 37, z - 3.2 * Math.sign(x)], [x + 3.2 * Math.sign(z), 37, z + 3.2 * Math.sign(x)], 0.5);
    beams.add([x - 3.2 * Math.sign(z), 38.4, z - 3.2 * Math.sign(x)], [x + 3.2 * Math.sign(z), 38.4, z + 3.2 * Math.sign(x)], 0.5);
  }
  // Water deluge: risers around the mount, and the mains that feed them across the mound
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.26, c = Math.cos(a), s = Math.sin(a);
    beams.add([c * 46, MOUND_H + 0.4, s * 46], [c * 13, MOUND_H + 0.4, s * 13], 0.56);
    beams.add([c * 13, MOUND_H + 0.4, s * 13], [c * 11.6, DECK - 0.3, s * 11.6], 0.46);
    beams.add([c * 18, MOUND_H, s * 18], [c * 18, MOUND_H + 7, s * 18], 0.4);
    beams.add([c * 18, MOUND_H + 7, s * 18], [c * 15.5, MOUND_H + 8.2, s * 15.5], 0.3);
  }
  return beams;
}

function buildBlocks() {
  const parts = [];
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; };
  // The pedestal: four huge piers, with open bays on the x axis where the flame comes out along the trench.
  const pierW = 6.4, pierH = DECK - MOUND_H - 1.1;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const g = new THREE.CylinderGeometry(pierW * 0.54, pierW * 0.72, pierH, 4, 1); g.rotateY(Math.PI / 4); g.translate(sx * 9, MOUND_H + pierH / 2, sz * 9.6); parts.push(g);
  }
  // Bays stay open on x; z sides are closed by walls, so the fire only leaves the two ways it is meant to
  parts.push(box(10, pierH, 3.4, 0, MOUND_H, 11.4)); parts.push(box(10, pierH, 3.4, 0, MOUND_H, -11.4));
  // Mount table: an octagonal ring with a hole for engines and boosters
  const ring = new THREE.LatheGeometry([[7.1, DECK - 1.3], [13.4, DECK - 1.3], [13.4, DECK - 0.3], [12.6, DECK], [7.1, DECK]].map((p) => new THREE.Vector2(p[0], p[1])), 8, Math.PI / 8);
  parts.push(ring);
  const inner = new THREE.CylinderGeometry(7.1, 7.1, 1.3, 8, 1, true); inner.rotateY(Math.PI / 8); inner.scale(-1, 1, 1); inner.translate(0, DECK - 0.65, 0); parts.push(inner);
  // Flame deflector, a dark wedge inside the trench that splits the exhaust both ways
  const wedge = new THREE.CylinderGeometry(0.1, 7, 4.2, 4, 1); wedge.rotateY(Math.PI / 4); wedge.scale(0.5, 1, 1.5); wedge.translate(0, MOUND_H + 1.2, 0); parts.push(wedge);
  // Tower foot, control bunker, generator sheds
  parts.push(box(16, 2.6, 16, 24, MOUND_H - 0.4, -7));
  parts.push(box(30, 3, 14, -30, 0.6, -56));
  parts.push(box(7, 5, 5, -24, 1, -52));
  parts.push(box(16, 3.4, 7, 58, 0.5, 76));
  parts.push(box(9, 2.6, 6, -64, 0.8, -28));
  // A few low sheds, kept small so the rocket stays the only vertical in the frame
  const r = rng(11);
  for (let i = 0; i < 18; i++) { const a = r() * Math.PI * 2, R = 330 + r() * 620, w = 12 + r() * 30, h = 3 + r() * 7; parts.push(box(w, h, 12 + r() * 26, Math.cos(a) * R, 0, Math.sin(a) * R)); }
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

function buildSpheres() {
  const parts = [];
  for (const [x, z, r] of [[150, -96, 9.5], [176, -82, 9.5], [204, 40, 8.2], [226, 56, 8.2]]) {
    const s = new THREE.SphereGeometry(r, 32, 22); s.translate(x, r + 4.2, z); parts.push(s);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const c = new THREE.CylinderGeometry(0.34, 0.34, r + 3.2, 6); c.translate(x + Math.cos(a) * r * 0.82, (r + 3.2) / 2, z + Math.sin(a) * r * 0.82); parts.push(c); }
  }
  return mergeGeometries(parts.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; }), false);
}

const beadVert = /* glsl */`
attribute vec3 aPos; attribute vec3 aColor; attribute vec2 aSize; // aSize: world radius, kind (0 steady, 1 beacon, 2 flood)
uniform float uPx, uPad, uTime; varying vec3 vC; varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  vUv = position.xy;
  float d = -mv.z;
  float beacon = aSize.y > 0.5 && aSize.y < 1.5 ? smoothstep(0.0, 0.2, sin(uTime * 2.2 + aPos.x * 0.3)) : 1.0;
  float flood = aSize.y > 1.5 ? 1.0 : 0.0;
  // Keep lights a legible size when far, without shrinking to nothing, and dim them instead of letting them grow.
  float floor_ = d * 0.0013 * uPx;
  float size = max(aSize.x, floor_);
  float dim = min(1.0, aSize.x / max(floor_, 1e-3));
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  vC = aColor * beacon * mix(max(uPad, 0.26), uPad * uPad, flood) * mix(dim * dim, 1.0, 0.25);
}`;
const beadFrag = /* glsl */`
precision highp float; varying vec3 vC; varying vec2 vUv;
void main() { float d = length(vUv); float m = exp(-d * d * 7.5) * (1.0 - smoothstep(0.75, 1.0, d)); gl_FragColor = vec4(vC * m, 1.0); }`;

function buildBeads() {
  const r = rng(21), items = [];
  const add = (x, y, z, c, size, kind = 0) => items.push({ x, y, z, c, size, kind });
  // Floodlight batteries on masts
  for (const [x, z] of FLOOD_MASTS) for (let i = 0; i < 6; i++) for (const j of [0, 1]) add(x + (i - 2.5) * 0.9 * Math.sign(z), 36 + j * 1.3, z + (i - 2.5) * 0.9 * Math.sign(x), [22, 19, 15], 0.9, 2);
  // Tower beacons and platform lamps
  for (let y = 12; y < 92; y += 12) { add(30.6, y, -0.6, [7, 5, 2.8], 0.3); add(17.4, y, -13.6, [6, 4.2, 2.3], 0.28); add(17.4, y, -0.4, [8, 7.4, 6.4], 0.28); }
  add(24, 120.6, -7, [40, 0.8, 0.5], 0.9, 1); add(24, 95, -7, [24, 0.6, 0.4], 0.5, 1);
  for (const [x, z] of [[-172, -128], [188, -154], [-96, 210], [196, 174]]) { add(x, 118.5, z, [34, 0.7, 0.4], 0.9, 1); add(x, 60, z, [14, 0.4, 0.2], 0.5, 1); }
  // Searchlight heads, hard and bright, down at ground level
  for (const l of SEARCHLIGHTS) add(l.pos[0], l.pos[1], l.pos[2], [l.color[0] * 50, l.color[1] * 50, l.color[2] * 50], 1.05, 2);
  // Perimeter road: sparse sodium lamps that fade towards the horizon, not a string of fairy lights
  for (let k = 0; k < 4; k++) {
    const a0 = 0.2 + k * 1.5708;
    for (let i = 0; i < 26; i++) { const R = 190 + i * 96; for (const side of [-1, 1]) add(Math.cos(a0) * R - Math.sin(a0) * 7 * side, 6.5, Math.sin(a0) * R + Math.cos(a0) * 7 * side, [3.2, 1.8, 0.7], 0.42); }
  }
  // Distant facility lights, clustered around the buildings they belong to
  for (let c = 0; c < 22; c++) {
    const a = r() * Math.PI * 2, R = 900 + Math.pow(r(), 0.7) * 3600, n = 5 + Math.floor(r() * 16), warm = r() > 0.2;
    const cx = Math.cos(a) * R, cz = Math.sin(a) * R;
    for (let i = 0; i < n; i++) add(cx + (r() - 0.5) * 150, 3 + r() * 11, cz + (r() - 0.5) * 150, warm ? [4.4, 2.5, 1.0] : [2.8, 3.4, 4.6], 0.55);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  const pos = new Float32Array(items.length * 3), col = new Float32Array(items.length * 3), size = new Float32Array(items.length * 2);
  items.forEach((b, i) => { pos.set([b.x, b.y, b.z], i * 3); col.set(b.c, i * 3); size.set([b.size, b.kind], i * 2); });
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
  geo.instanceCount = items.length;
  return geo;
}

export const FLOOD_MASTS = [[-96, -92], [-24, 132], [104, 86], [92, -94]];
const FLOOD_COLORS = [[1, 0.86, 0.62], [0.82, 0.88, 1], [1, 0.84, 0.6], [0.82, 0.88, 1]];

// Xenon searchlights: the only real lights on the vehicle at night. A warm key from the camera side, which throws the
// shadows, a cool rim from behind on each flank, and a warm kicker from the tower side.
const SEARCHLIGHTS = [
  { pos: [-84, 3.6, 68], aim: [0, 66, 0], color: [1, 0.9, 0.76], i: 38000, angle: 0.36, shadow: true, beam: 0.06 },
  { pos: [-44, 3.2, -92], aim: [-4, 74, 0], color: [0.66, 0.8, 1], i: 46000, angle: 0.36, beam: 0.07 },
  { pos: [86, 3.2, 62], aim: [2, 58, 0], color: [1, 0.82, 0.62], i: 26000, angle: 0.34, beam: 0.055 },
  { pos: [76, 3.2, -66], aim: [0, 80, 0], color: [0.7, 0.82, 1], i: 38000, angle: 0.34, beam: 0.06 },
];
// Two more beams that light nothing but the air, crossing above the vehicle.
const SKY_BEAMS = [
  { pos: [-120, 3, 22], aim: [28, 260, -60], color: [0.74, 0.85, 1], beam: 0.042 },
  { pos: [112, 3, 34], aim: [-46, 260, -40], color: [0.74, 0.85, 1], beam: 0.04 },
];

const beamVert = /* glsl */`
attribute float aAlong; attribute vec3 aTint; attribute float aGain;
varying vec3 vN, vW, vTint; varying float vAlong, vGain;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vAlong = aAlong; vTint = aTint; vGain = aGain;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const beamFrag = /* glsl */`
precision highp float;
uniform vec3 uCam; uniform float uPad, uTime; uniform sampler3D uNoise;
varying vec3 vN, vW, vTint; varying float vAlong, vGain;
void main() {
  vec3 V = normalize(uCam - vW);
  // A cone's surface faces the eye most at its axis and turns edge-on at its silhouette: that is a soft-edged beam.
  float f = abs(dot(normalize(vN), V));
  float core = pow(f, 3.2);
  float along = exp(-vAlong * 3.1) * smoothstep(0.0, 0.015, vAlong);
  // Mist drifts through the light
  float n = texture(uNoise, vW * 0.0065 + vec3(0.0, -uTime * 0.011, uTime * 0.006)).r;
  float n2 = texture(uNoise, vW * 0.021 + vec3(uTime * 0.012, 0.0, 0.0)).g;
  float mist = 0.42 + 1.2 * smoothstep(0.34, 0.72, n * 0.72 + n2 * 0.34);
  // Close to the lens the beam thins out, so that passing through one never draws its surface across the frame.
  float away = smoothstep(26.0, 240.0, length(uCam - vW));
  gl_FragColor = vec4(vTint * vGain * core * along * mist * uPad * away, 1.0);
}`;

function buildBeams() {
  const list = [...SEARCHLIGHTS, ...SKY_BEAMS], parts = [];
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  for (const l of list) {
    const from = new THREE.Vector3(...l.pos), dir = new THREE.Vector3(...l.aim).sub(from).normalize();
    const L = 620;
    const g = new THREE.CylinderGeometry(L * 0.075, 0.28, L, 64, 1, true);
    g.translate(0, L / 2, 0);
    const pos = g.attributes.position, n = pos.count;
    const al = new Float32Array(n), tint = new Float32Array(n * 3), gain = new Float32Array(n);
    for (let i = 0; i < n; i++) { al[i] = pos.getY(i) / L; tint.set(l.color, i * 3); gain[i] = l.beam; }
    g.setAttribute('aAlong', new THREE.BufferAttribute(al, 1));
    g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
    g.setAttribute('aGain', new THREE.BufferAttribute(gain, 1));
    g.deleteAttribute('uv');
    g.applyQuaternion(q.setFromUnitVectors(up, dir));
    g.translate(from.x, from.y, from.z);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  return mergeGeometries(parts, false);
}

export function LaunchComplex() {
  const { scene } = useThree();
  const root = useRef(), lights = useRef([]), last = useRef({ y: -1, n: 0, tier: '' });
  const tier = useQuality((s) => s.tier);
  const stuff = useMemo(() => {
    // Red oxide primer, the colour real launch towers end up: warm steel against the blue hour.
    const steel = new THREE.MeshStandardMaterial({ color: 0x5c3f36, roughness: 0.62, metalness: 0.55 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x47494c, roughness: 0.84, metalness: 0.04 });
    const tankWhite = new THREE.MeshStandardMaterial({ color: 0xbcbfc2, roughness: 0.42, metalness: 0.3 });
    const beams = buildLattice().build(steel);
    beams.castShadow = true;
    const blocks = new THREE.Mesh(buildBlocks(), concrete);
    const spheres = new THREE.Mesh(buildSpheres(), tankWhite);
    blocks.frustumCulled = false; spheres.frustumCulled = false; blocks.castShadow = true; blocks.receiveShadow = true;

    const lightsPos = FLOOD_MASTS.map((m) => new THREE.Vector4(m[0], 38, m[1], 0));
    const ground = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: groundFrag, transparent: true, depthWrite: true, side: THREE.DoubleSide,
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uTime: G.uTime, uNoise: G.uNoise, uLights: { value: lightsPos }, uLightColors: { value: FLOOD_COLORS.map((c) => new THREE.Vector3(...c)) },
        uFlame: { value: new THREE.Vector4(0, DECK, 0, 0) }, uPad: { value: 1 }, uSmoke: { value: 0 }, uSun: { value: new THREE.Vector3() }, uRocketY: { value: DECK },
      },
    });
    // The ground is one surface from the pedestal out to the horizon, so there is no slab edge to give the set away.
    const rings = [0, 12, 40, 50, 66, 82, 100, 118, 136, 154, 170, 240, 600, 3000, 6500];
    const groundGeo = new THREE.LatheGeometry(rings.map((r) => new THREE.Vector2(r, groundHeight(r))), 128);
    const beadGeo = buildBeads();
    const beads = new THREE.ShaderMaterial({ vertexShader: beadVert, fragmentShader: beadFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: G.uPx, uPad: { value: 1 }, uTime: G.uTime } });
    const beamGeo = buildBeams();
    const beamMat = new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, uniforms: { uCam: { value: new THREE.Vector3() }, uPad: { value: 1 }, uTime: G.uTime, uNoise: G.uNoise } });
    return { steel, concrete, tankWhite, beams, blocks, spheres, ground, groundGeo, beadGeo, beads, beamGeo, beamMat };
  }, []);
  useEffect(() => () => {
    for (const k of ['steel', 'concrete', 'tankWhite', 'ground', 'beads', 'beamMat']) stuff[k].dispose();
    stuff.blocks.geometry.dispose(); stuff.spheres.geometry.dispose(); stuff.beadGeo.dispose(); stuff.groundGeo.dispose(); stuff.beamGeo.dispose(); stuff.beams.dispose();
  }, [stuff]);

  // Haze for the ordinary lit materials, so distant buildings melt into the horizon instead of cutting out of it.
  const fog = useMemo(() => new THREE.FogExp2(new THREE.Color(0.03, 0.055, 0.115), 0.00034), []);
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);

  const { shadow } = QUALITY[tier];
  useEffect(() => {
    const l = lights.current[0];
    if (!l) return;
    l.castShadow = shadow > 0;
    if (shadow > 0) {
      l.shadow.mapSize.set(shadow, shadow); l.shadow.bias = -0.00025; l.shadow.normalBias = 0.05;
      l.shadow.camera.near = 30; l.shadow.camera.far = 320;
      if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
    }
    last.current.n = 0;
  }, [shadow]);

  useFrame(() => {
    const vis = frame.altitude < 90;
    root.current.visible = vis;
    fog.density = 0.00034 * (1 - smoothstep(0.1, 1.2, frame.altitude));
    // The lights stay in the scene with their intensity at zero. Hiding them would change the light count, which makes
    // three.js relink every lit material on the vehicle: a visible stall in the middle of the climb, in both directions.
    lights.current.forEach((l, i) => { if (l) l.intensity = vis ? SEARCHLIGHTS[i].i * track.padLights : 0; });
    if (!vis) return;
    const u = stuff.ground.uniforms;
    u.uCam.value.copy(frame.nearPos);
    u.uPad.value = track.padLights;
    const h = frame.rocketPos.y;
    u.uRocketY.value = h;
    u.uFlame.value.set(0, h + 1, 0, (track.glow * 0.14 + track.thrust * 3.2) * (1 - smoothstep(60, 900, h)));
    u.uSun.value.copy(frame.sunDir);
    stuff.beads.uniforms.uPad.value = track.padLights;
    stuff.beamMat.uniforms.uCam.value.copy(frame.nearPos);
    stuff.beamMat.uniforms.uPad.value = track.padLights * track.padLights;
    // The key's shadow map only redraws while something it can see is moving.
    const key = lights.current[0];
    if (key && key.castShadow) {
      const moved = h !== last.current.y || last.current.n < 4;
      key.shadow.autoUpdate = false;
      if (moved && track.padLights > 0.02) { key.shadow.needsUpdate = true; last.current.y = h; last.current.n++; }
    }
  });

  return (
    <>
    {SEARCHLIGHTS.map((l, i) => (
      <spotLight key={i} ref={(o) => { lights.current[i] = o; }} position={l.pos} angle={l.angle} penumbra={0.6} decay={2} distance={0} color={new THREE.Color(...l.color)} />
    ))}
    {SEARCHLIGHTS.map((l, i) => <SpotTarget key={i} lights={lights} i={i} at={l.aim} />)}
    <group ref={root}>
      <mesh frustumCulled={false} renderOrder={1} geometry={stuff.groundGeo} material={stuff.ground} />
      <primitive object={stuff.beams} />
      <primitive object={stuff.blocks} />
      <primitive object={stuff.spheres} />
      <mesh geometry={stuff.beadGeo} material={stuff.beads} frustumCulled={false} renderOrder={6} />
      <mesh geometry={stuff.beamGeo} material={stuff.beamMat} frustumCulled={false} renderOrder={5} />
    </group>
    </>
  );
}

function SpotTarget({ lights, i, at }) {
  const ref = useRef();
  useEffect(() => { if (lights.current[i] && ref.current) lights.current[i].target = ref.current; }, [lights, i]);
  return <object3D ref={ref} position={at} />;
}

