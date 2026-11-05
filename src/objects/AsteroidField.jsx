import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { frame, track } from '../experience/ExperienceController.js';
import { G } from '../experience/Uniforms.js';
import { MAX_COUNTS, QUALITY, useQuality } from '../performance/QualityManager.js';

// Instanced rocks: several displaced base shapes, each rotating by journey distance so the field is deterministic.
// The belt thins out and flattens until it has become the ring sheet of the planet ahead.
function hashNoise(seed) {
  // Small periodic-free lattice noise, enough to break up large shapes with fractured detail.
  const T = new Float32Array(4096); let s = seed; for (let i = 0; i < 4096; i++) { s = (s * 16807) % 2147483647; T[i] = s / 2147483647; }
  const h = (x, y, z) => T[((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & 4095];
  const lerp3 = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    return lerp3(lerp3(lerp3(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp3(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v), lerp3(lerp3(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp3(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  };
}

function rockGeometry(seed, detail, lumpy) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position;
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const noise = hashNoise(seed + 7);
  // Rubble is broken, not melted. The body starts as a sphere cut by a handful of random planes, which gives it flat
  // fractured faces and hard edges in silhouette; everything finer is laid on top of that.
  const cuts = []; const nCuts = 11 + Math.floor(rnd() * 9);
  for (let i = 0; i < nCuts; i++) { const z = rnd() * 2 - 1, a = rnd() * 6.283, r = Math.sqrt(1 - z * z); cuts.push([r * Math.cos(a), r * Math.sin(a), z, 0.62 + rnd() * 0.32]); }
  const blobs = []; for (let i = 0; i < 12; i++) { const z = rnd() * 2 - 1, a = rnd() * 6.283, r = Math.sqrt(1 - z * z); blobs.push([r * Math.cos(a), r * Math.sin(a), z, 0.1 + rnd() * rnd() * 0.6, (rnd() - 0.6) * 0.34]); }
  const craters = []; for (let i = 0; i < 46; i++) { const z = rnd() * 2 - 1, a = rnd() * 6.283, r = Math.sqrt(1 - z * z); craters.push([r * Math.cos(a), r * Math.sin(a), z, 0.022 + rnd() * rnd() * rnd() * 0.3]); }
  const sx = 0.72 + rnd() * 0.56, sy = 0.56 + rnd() * 0.46, sz = 0.72 + rnd() * 0.56;
  const v = new THREE.Vector3();
  const rough = detail > 8;
  const ao = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let h = 1;
    // Radial distance to the nearest cutting plane along this direction.
    for (const c of cuts) { const d = v.x * c[0] + v.y * c[1] + v.z * c[2]; if (d > 0.02) h = Math.min(h, c[3] / d); }
    const face = h;
    for (const b of blobs) { const d = v.x * b[0] + v.y * b[1] + v.z * b[2]; const w = Math.max(0, 1 - (1 - d) / b[3]); h += b[4] * w * w * lumpy; }
    let pit = 0;
    for (const c of craters) {
      const d = Math.acos(Math.min(1, v.x * c[0] + v.y * c[1] + v.z * c[2])) / c[3];
      if (d < 1.4) { const dh = d < 1 ? -0.34 * c[3] * (1 - d * d) : 0.13 * c[3] * (1.4 - d) / 0.4; h += dh; if (d < 1) pit = Math.max(pit, 1 - d); }
    }
    if (rough) {
      // Ridged fractures at several scales, so a close pass still finds detail.
      let a = 0.075, f = 3.1, n = 0; for (let o = 0; o < 5; o++) { n += a * (1 - Math.abs(2 * noise(v.x * f + 3, v.y * f + 7, v.z * f + 11) - 1)); a *= 0.52; f *= 2.2; }
      h += n - 0.075;
    }
    // Hollows hold less light: a cheap ambient occlusion baked per vertex from how far the surface sits below its hull.
    ao[i] = Math.max(0.22, Math.min(1, 1 - (face - h) * 3.2 - pit * 0.45));
    pos.setXYZ(i, v.x * h * sx, v.y * h * sy, v.z * h * sz);
  }
  g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  g.computeVertexNormals();
  return g;
}

const rockVert = /* glsl */`
attribute vec4 aOffset; // xyz position in field, w scale
attribute vec4 aAxis;   // spin axis, spin rate
attribute vec3 aTint; attribute float aAO;
uniform float uTravel, uLength, uSpin, uFadeNear, uFadeFar;
uniform vec3 uCam;
varying vec3 vN, vW, vO; varying vec3 vT; varying float vF; varying float vAO;
vec3 rot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
void main() {
  float z = aOffset.z + uTravel;
  vec3 c = vec3(aOffset.xy, z) + uCamBase;
  float a = aAxis.w * uSpin;
  float dd = length(c - uCam);
  // Rocks grow out of the distance rather than popping or dithering in.
  float grow = smoothstep(uFadeFar, uFadeFar * 0.55, dd);
  vec3 p = rot(position, aAxis.xyz, a) * aOffset.w * grow;
  vN = normalize(rot(normal, aAxis.xyz, a));
  vO = position;
  vAO = aAO;
  vec3 w = p + c;
  vW = w;
  vT = aTint;
  float d = length(c - uCam);
  vF = smoothstep(uFadeFar, uFadeFar * 0.6, d) * smoothstep(0.0, 60.0, d);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const rockFrag = /* glsl */`
precision highp float;
uniform sampler3D uNoise; uniform vec3 uSun, uSunColor, uCam, uFill; uniform float uSunI;
varying vec3 vN, vW, vO; varying vec3 vT; varying float vF; varying float vAO;
void main() {
  vec3 q = vO;
  float dist = length(uCam - vW);
  float n1 = texture(uNoise, q * 0.21).r, n2 = texture(uNoise, q * 0.63).r, n3 = texture(uNoise, q * 1.9).r;
  float e = 0.05;
  // Bump from a smooth noise band, fading with distance so far rocks never shimmer.
  vec3 g = vec3(texture(uNoise, (q + vec3(e, 0.0, 0.0)) * 0.63).r - n2, texture(uNoise, (q + vec3(0.0, e, 0.0)) * 0.63).r - n2, texture(uNoise, (q + vec3(0.0, 0.0, e)) * 0.63).r - n2);
  float m1 = texture(uNoise, q * 2.4).g, e2 = 0.02;
  vec3 g2 = vec3(texture(uNoise, (q + vec3(e2, 0.0, 0.0)) * 2.4).g - m1, texture(uNoise, (q + vec3(0.0, e2, 0.0)) * 2.4).g - m1, texture(uNoise, (q + vec3(0.0, 0.0, e2)) * 2.4).g - m1);
  vec3 N = normalize(vN - (g * 1.05 + g2 * 0.75) * smoothstep(1400.0, 80.0, dist));
  vec3 V = normalize(uCam - vW);
  float ndl = max(dot(N, uSun), 0.0);
  // Dark carbonaceous rock with lighter dust settled in patches: it should look like coal in sunlight, not plaster.
  float dustPatch = smoothstep(0.46, 0.66, n1 * 0.7 + n2 * 0.3);
  float fineN = texture(uNoise, q * 6.1).g;
  vec3 albedo = vT * mix(0.78, 1.0, dustPatch) * (0.8 + (n2 - 0.5) * 0.3 + (n3 - 0.5) * 0.34 + (fineN - 0.5) * 0.3);
  vec3 col = albedo * pow(ndl, 1.1) * uSunColor * uSunI * mix(0.66, 1.0, vAO);
  col += albedo * uFill * (0.5 + 0.5 * N.y) * vAO;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0) * max(dot(V, -uSun) * 0.5 + 0.5, 0.0);
  col += uSunColor * rim * 0.05 * uSunI * vAO;
  gl_FragColor = vec4(col, 1.0);
}`;

function makeSet(count, opts) {
  let s = opts.seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const O = new Float32Array(count * 4), A = new Float32Array(count * 4), T = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const { x, y, z, scale } = opts.place(rnd, i);
    O.set([x, y, z, scale], i * 4);
    const az = rnd() * 2 - 1, ang = rnd() * 6.283, r = Math.sqrt(1 - az * az);
    A.set([r * Math.cos(ang), r * Math.sin(ang), az, (rnd() - 0.5) * 8], i * 4);
    const w = rnd();
    const c = w < 0.5 ? [0.135, 0.124, 0.112] : w < 0.82 ? [0.105, 0.103, 0.104] : [0.17, 0.136, 0.104];
    { const b = 0.72 + rnd() * 0.56; T.set(c.map((v) => v * b), i * 3); }
  }
  return { O, A, T };
}

const makeMaterial = (uniforms) => new THREE.ShaderMaterial({ vertexShader: `uniform vec3 uCamBase;\n${rockVert}`, fragmentShader: rockFrag, uniforms });

function Rocks({ count, tierCount, place, seed, detail, lumpy, channelVis, travelFn, spin, fadeFar, shapes = 5 }) {
  const group = useRef();
  const made = useMemo(() => {
    const geos = [], mats = [];
    const uniforms = {
      uTravel: { value: 0 }, uSpin: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCamBase: { value: new THREE.Vector3() }, uNoise: G.uNoise, uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uSunI: { value: 3 }, uFill: { value: new THREE.Color(0.012, 0.014, 0.018) }, uFadeFar: { value: fadeFar }, uFadeNear: { value: 0 }, uLength: { value: 0 },
    };
    const mat = makeMaterial(uniforms);
    const per = Math.ceil(count / shapes);
    for (let k = 0; k < shapes; k++) {
      const base = rockGeometry(seed * 13 + k * 97 + 1, detail, lumpy);
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', base.attributes.position); g.setAttribute('normal', base.attributes.normal); g.setAttribute('aAO', base.attributes.aAO); if (base.index) g.setIndex(base.index);
      const set = makeSet(per, { seed: seed + k * 991, place, shapes: [base] });
      g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(set.O, 4));
      g.setAttribute('aAxis', new THREE.InstancedBufferAttribute(set.A, 4));
      g.setAttribute('aTint', new THREE.InstancedBufferAttribute(set.T, 3));
      g.instanceCount = per;
      geos.push(g);
    }
    mats.push(mat);
    return { geos, mat, per };
  }, [count, place, seed, detail, lumpy, shapes, fadeFar]);
  useEffect(() => () => { made.geos.forEach((g) => g.dispose()); made.mat.dispose(); }, [made]);
  useEffect(() => { for (const g of made.geos) g.instanceCount = Math.min(made.per, Math.ceil(tierCount / made.geos.length)); }, [tierCount, made]);

  useFrame(() => {
    const vis = channelVis();
    group.current.visible = vis > 0.002;
    if (!group.current.visible) return;
    const u = made.mat.uniforms, t = travelFn();
    u.uTravel.value = t;
    u.uSpin.value = spin();
    u.uCam.value.copy(frame.nearPos);
    u.uCamBase.value.copy(frame.anchor);
    u.uSun.value.copy(frame.sunDir);
    u.uSunColor.value.copy(frame.sunColor);
    u.uSunI.value = 2.05;
    u.uFadeFar.value = fadeFar * Math.max(vis, 0.001);
  });
  return (
    <group ref={group}>
      {made.geos.map((g, i) => <mesh key={i} geometry={g} material={made.mat} frustumCulled={false} />)}
    </group>
  );
}

// Hero rocks with hand-placed positions along the flight line, so the camera always has something to weave around.
const HEROES = [[-230, -40, -900, 90], [280, 60, -1500, 130], [-360, 110, -2300, 180], [190, -110, -2900, 70], [-210, 150, -3500, 105], [340, -60, -4200, 210], [-300, -80, -5000, 88], [240, 120, -5700, 150], [-150, -130, -6300, 60]];

export function AsteroidField() {
  const tier = useQuality((s) => s.tier);
  const q = QUALITY[tier];
  const heroPlace = useMemo(() => (rnd, i) => {
    if (i < HEROES.length) { const h = HEROES[i]; return { x: h[0], y: h[1], z: h[2], scale: h[3] }; }
    const a = rnd() * 6.283, R = 190 + rnd() * 560;
    return { x: Math.cos(a) * R, y: Math.sin(a) * R * 0.5, z: -rnd() * 8800 + 200, scale: 14 + rnd() * rnd() * 74 };
  }, []);
  const beltPlace = useMemo(() => (rnd) => {
    const a = rnd() * 6.283, R = 240 + Math.pow(rnd(), 0.6) * 2100, z = -rnd() * 9000 + 500;
    return { x: Math.cos(a) * R, y: Math.sin(a) * R * 0.42, z, scale: 1.8 + Math.pow(rnd(), 5.5) * 96 };
  }, []);
  const ringPlace = useMemo(() => (rnd) => {
    const a = rnd() * 6.283, R = 40 + Math.pow(rnd(), 0.5) * 1700;
    return { x: Math.cos(a) * R, y: (rnd() - 0.5) * 34, z: Math.sin(a) * R * 2.2 - rnd() * 400, scale: 0.7 + Math.pow(rnd(), 5) * 26 };
  }, []);
  const heroCount = tier === 'low' ? 15 : tier === 'balanced' ? 24 : 30;

  return (
    <>
      <Rocks
        count={30} tierCount={heroCount} place={heroPlace} seed={707} detail={44} lumpy={1} fadeFar={3400} shapes={3}
        channelVis={() => track.beltVis} travelFn={() => track.beltTravel * 8200} spin={() => track.beltTravel * 12}
      />
      <Rocks
        count={MAX_COUNTS.rocks} tierCount={q.rocks} place={beltPlace} seed={101} detail={5} lumpy={1} fadeFar={3400}
        channelVis={() => track.beltVis} travelFn={() => track.beltTravel * 8200} spin={() => track.beltTravel * 12}
      />
      <Rocks
        count={MAX_COUNTS.ringRocks} tierCount={q.ringRocks} place={ringPlace} seed={303} detail={2} lumpy={0.8} fadeFar={1500} shapes={3}
        channelVis={() => track.ringRocks} travelFn={() => (frame.p - 0.732) * 42000} spin={() => frame.p * 90}
      />
    </>
  );
}
