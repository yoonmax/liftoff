import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { frame, track } from '../experience/ExperienceController.js';
import { G } from '../experience/Uniforms.js';
import { portalVert, portalFrag } from '../shaders/transition/portal.glsl.js';
import { lerp, smoothstep } from '../animation/Interpolation.js';
import { interfaceBus } from '../interface/interfaceBus.js';

// The destination, and nobody built it for us. Three things: an iris of long black blades around the aperture, a deep
// colonnade of thin fins behind and around them that gives the structure a real depth to fly into, and an outer crown
// of monoliths. All of it is lit from the inside by the aperture once it opens, so the light is what reveals its shape.
const segVert = /* glsl */`
attribute vec4 aSeg; // ring angle, radius, depth offset, seed
uniform float uRot, uFold, uTime, uTwist, uOpen;
varying vec3 vN, vW; varying vec3 vP; varying float vSeed;
void main() {
  float a = aSeg.x + uRot;
  float c = cos(a), s = sin(a);
  mat3 R = mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
  // Each piece tips outward from a closed bud as the structure opens, staggered around the ring, and turns on its own
  // axis like an iris blade.
  float local = (1.0 - uFold);
  float tip = local * 1.35 * (0.75 + 0.5 * aSeg.w);
  float ct = cos(tip), st = sin(tip);
  mat3 T = mat3(1.0, 0.0, 0.0, 0.0, ct, st, 0.0, -st, ct);
  float tw = uTwist * mix(1.0, 0.0, uFold) + 0.42 * uTwist;
  float cw = cos(tw), sw = sin(tw);
  mat3 W = mat3(cw, sw, 0.0, -sw, cw, 0.0, 0.0, 0.0, 1.0);
  vec3 p0 = T * (W * position);
  vec3 r = R * (p0 + vec3(0.0, aSeg.y * mix(0.62, 1.0, uFold), aSeg.z));
  vec4 w = modelMatrix * vec4(r, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * (R * (T * (W * normal))));
  vP = position;
  vSeed = aSeg.w;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const segFrag = /* glsl */`
precision highp float;
uniform vec3 uSun, uSunColor, uCam, uBox, uCenter; uniform float uLights, uTime, uOpen, uSeam;
uniform sampler3D uNoise;
varying vec3 vN, vW, vP; varying float vSeed;
void main() {
  vec3 N = normalize(vN), V = normalize(uCam - vW);
  float ndl = max(dot(N, uSun), 0.0);
  // Honed basalt, with faint strata that run the length of each piece.
  vec3 q = vP / uBox;
  float strata = texture(uNoise, vec3(q.x * 0.3 + vSeed, q.y * 2.4, q.z * 0.3 + vSeed * 3.1)).g;
  float grain = texture(uNoise, vW * 0.0018).r;
  vec3 albedo = vec3(0.036, 0.035, 0.038) * (0.72 + strata * 0.36 + grain * 0.3);
  vec3 col = albedo * ndl * uSunColor * 5.0;
  // Backlit edges, the only way to read a black slab against a star
  float fres = pow(1.0 - max(dot(N, V), 0.0), 9.0);
  col += uSunColor * fres * max(dot(V, -uSun) * 0.5 + 0.5, 0.0) * 0.1;
  col += uSunColor * pow(max(dot(N, normalize(uSun + V)), 0.0), 120.0) * 0.14;
  // The aperture lights every face turned towards it, falling off with distance. This is what reveals the structure.
  vec3 toC = uCenter - vW; float dc = length(toC); toC /= dc;
  float pl = max(dot(N, toC), 0.0);
  float att = 1.0 / (1.0 + dc * dc * 0.00000052);
  vec3 warm = vec3(1.0, 0.62, 0.32);
  col += (albedo * 7.0 + vec3(0.001)) * pl * att * warm * uOpen * uOpen * 3.2;
  vec3 H = normalize(toC + V);
  col += warm * pow(max(dot(N, H), 0.0), 60.0) * att * uOpen * uOpen * 0.8;
  // Thin luminous seams, only ever cut into the inner edge
  float seed = fract(vSeed * 17.3);
  float flicker = smoothstep(seed * 0.8, seed * 0.8 + 0.2, uLights);
  // One slot of light down each slab, soft at its ends: firelight through a gap, not a lit strip.
  float seamX = smoothstep(0.022, 0.006, abs(q.x - 0.34 * (seed - 0.5))) * smoothstep(0.95, 0.5, abs(q.y));
  float faceOn = smoothstep(0.75, 0.95, abs(N.z));
  vec3 glow = mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.74, 0.46), seed);
  col += glow * seamX * step(0.3, seed) * faceOn * flicker * 2.1 * uSeam;
  gl_FragColor = vec4(col, 1.0);
}`;

/** A blade or monolith: tapered in plan, with chamfered edges that catch the light, never a plain box. */
function pieceGeometry(wTop, wBase, h, depth, bevel) {
  const s = new THREE.Shape();
  const hw0 = wBase / 2, hw1 = wTop / 2, hh = h / 2;
  // Square-shouldered, with one corner sheared: an architectural slab, nothing that could read as a pencil or a petal.
  s.moveTo(-hw0, -hh); s.lineTo(hw0, -hh); s.lineTo(hw1, hh * 0.82); s.lineTo(hw1 * 0.5, hh); s.lineTo(-hw1, hh); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function makeRing(count, radius, wTop, wBase, h, d, seed, { offset = 0, zSpread = 0, zStep = 0 } = {}) {
  const base = pieceGeometry(wTop, wBase, h, d, Math.min(wTop, d) * 0.05);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', base.attributes.position); g.setAttribute('normal', base.attributes.normal); if (base.index) g.setIndex(base.index);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const attr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const z = zSpread ? (rnd() - 0.5) * zSpread : 0;
    attr.set([i / count * Math.PI * 2 + offset, radius + (rnd() - 0.5) * radius * 0.02, z + i * zStep, rnd()], i * 4);
  }
  g.setAttribute('aSeg', new THREE.InstancedBufferAttribute(attr, 4));
  g.instanceCount = count;
  return { g, box: new THREE.Vector3(Math.max(wTop, wBase) / 2, h / 2, d / 2) };
}

export const GATE_START = 13200, GATE_END = -1;

/** Where the gate stands, from progress alone: the same formula the film and the lens both need. */
export function gatePosition(out) {
  const fly = track.approach;
  const d = lerp(GATE_START, -40, Math.pow(fly, 1.45));
  return out.set(frame.anchor.x, frame.anchor.y + lerp(1200, 0, smoothstep(0, 1, fly)), frame.anchor.z - d);
}

export function SpaceStation() {
  const root = useRef(), portalM = useRef();
  const stuff = useMemo(() => {
    const shared = { uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uCam: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uLights: { value: 0 }, uTime: G.uTime, uNoise: G.uNoise, uOpen: { value: 0 } };
    const mk = (box, seam = 0) => new THREE.ShaderMaterial({ vertexShader: segVert, fragmentShader: segFrag, side: THREE.FrontSide, uniforms: { ...shared, uRot: { value: 0 }, uFold: { value: 0 }, uTwist: { value: 0 }, uBox: { value: box }, uSeam: { value: seam } } });
    // Iris blades, long and overlapping, right around the opening.
    const r1 = makeRing(14, 3100, 1040, 1240, 2100, 150, 1);
    // The colonnade: many thin fins set deep, which sweep past as the camera enters.
    const r2 = makeRing(44, 4300, 110, 120, 1300, 2600, 2, { offset: 0.1, zSpread: 900 });
    const r3 = makeRing(30, 4700, 170, 180, 1150, 1900, 7, { offset: 0.05, zSpread: 800 });
    // Outer crown of monoliths, irregular and far apart.
    const r4 = makeRing(12, 6500, 1100, 1240, 2500, 420, 3, { offset: 0.05, zSpread: 800 });
    const portal = new THREE.ShaderMaterial({ vertexShader: portalVert, fragmentShader: portalFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uNoise: G.uNoise, uTime: G.uTime, uOpen: { value: 0 }, uHover: { value: 0 } } });
    return { shared, rings: [{ ...r1, m: mk(r1.box, 1) }, { ...r2, m: mk(r2.box) }, { ...r3, m: mk(r3.box) }, { ...r4, m: mk(r4.box, 0.7) }], portal, pos: new THREE.Vector3() };
  }, []);
  useEffect(() => () => { stuff.rings.forEach((r) => { r.g.dispose(); r.m.dispose(); }); stuff.portal.dispose(); }, [stuff]);
  useEffect(() => { interfaceBus.gatePos = stuff.pos; return () => { interfaceBus.gatePos = null; }; }, [stuff]);

  useFrame(() => {
    gatePosition(stuff.pos);
    const vis = track.arrivalVis > 0 && frame.p < 0.975;
    root.current.visible = vis;
    if (!vis) return;
    const fly = track.approach;
    root.current.position.copy(stuff.pos);
    root.current.updateMatrixWorld(true);
    const sh = stuff.shared;
    sh.uSun.value.copy(frame.sunDir);
    sh.uSunColor.value.copy(frame.sunColor);
    sh.uCam.value.copy(frame.nearPos);
    sh.uCenter.value.copy(stuff.pos);
    sh.uLights.value = track.lightsOn;
    sh.uOpen.value = track.portal;
    const u = track.unfold, t = G.uTime.value;
    const set = (r, rot, fold, twist = 0) => { const m = stuff.rings[r].m.uniforms; m.uRot.value = rot; m.uFold.value = fold; m.uTwist.value = twist; };
    set(0, fly * 0.7 + t * 0.002, smoothstep(0.3, 0.92, u), 0.9);
    set(1, -fly * 0.34 - t * 0.0012, smoothstep(0.12, 0.82, u));
    set(2, fly * 0.24 + t * 0.0009, smoothstep(0.18, 0.86, u));
    set(3, fly * 0.14 + t * 0.0006, smoothstep(0, 0.66, u));
    stuff.portal.uniforms.uOpen.value = track.portal;
    stuff.portal.uniforms.uHover.value = interfaceBus.portalHover ?? 0;
    portalM.current.visible = track.portal > 0.001;
  });

  return (
    <group ref={root}>
      {stuff.rings.map((r, i) => <mesh key={i} geometry={r.g} material={r.m} frustumCulled={false} />)}
      <mesh ref={portalM} material={stuff.portal} frustumCulled={false} renderOrder={15}><planeGeometry args={[4600, 4600]} /></mesh>
    </group>
  );
}
