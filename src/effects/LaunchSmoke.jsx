import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { smokeVert, smokeFrag } from '../shaders/particles/smoke.glsl.js';
import { frame, track } from '../experience/ExperienceController.js';
import { altitudeKm } from '../camera/CameraController.js';
import { G } from '../experience/Uniforms.js';
import { assets } from '../performance/AssetPreloader.js';
import { MAX_COUNTS, QUALITY, useQuality } from '../performance/QualityManager.js';
import { smoothstep } from '../animation/Interpolation.js';
import { PAD_DECK } from '../camera/CameraController.js';

// launchT runs from 0 to 1 across this many "film seconds"
export const FILM_SECONDS = 60;
const launchToProgress = (t) => 0.136 + t * (0.34 - 0.136);

const QUAD = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]);
const subscribe = (cb) => { assets.listeners.add(cb); return () => assets.listeners.delete(cb); };

function buildParticles(count) {
  let s = 4242; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const A = new Float32Array(count * 4), P = new Float32Array(count * 3), V = new Float32Array(count * 3), B = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const r = rnd();
    let birth, life, s0, s1, kind, px = 0, py = 0, pz = 0, vx = 0, vy = 0, vz = 0;
    if (r < 0.16) {
      // vapor: boil-off curling from vents and low ground haze, alive before ignition
      kind = 2; life = 7 + rnd() * 9; birth = 0;
      if (rnd() < 0.55) {
        const y = [30, 46, 58, 44, 33][Math.floor(rnd() * 5)] + PAD_DECK + rnd() * 1.5, a = rnd() * Math.PI * 2;
        px = Math.cos(a) * 3.2; py = y; pz = Math.sin(a) * 3.2;
        vx = Math.cos(a) * (1.0 + rnd() * 1.6) + 0.5; vy = -0.3 - rnd() * 1.1; vz = Math.sin(a) * (1.0 + rnd() * 1.6);
        s0 = 0.9 + rnd(); s1 = 5 + rnd() * 6;
      } else {
        const a = rnd() * Math.PI * 2, R = 14 + rnd() * 150;
        px = Math.cos(a) * R; py = 1.2 + rnd() * 3; pz = Math.sin(a) * R;
        vx = (rnd() - 0.5) * 1.3; vy = 0.05; vz = (rnd() - 0.5) * 1.3;
        s0 = 10 + rnd() * 14; s1 = 24 + rnd() * 30;
      }
    } else if (r < 0.62) {
      // trench billow: flame deflected out along the ground, both sides of the pad
      kind = 0; birth = 0.8 + Math.pow(rnd(), 0.72) * 21; life = 16 + rnd() * 24;
      const side = rnd() < 0.5 ? -1 : 1, spread = (rnd() - 0.5) * 0.9;
      const dirX = side * Math.cos(spread) * 0.85, dirZ = Math.sin(spread) + 0.24 * side;
      px = dirX * 9; py = 1.4 + rnd() * 3; pz = dirZ * 9;
      const sp = 28 + rnd() * 54;
      vx = dirX * sp; vy = 2 + rnd() * 6; vz = dirZ * sp;
      s0 = 5 + rnd() * 5; s1 = 26 + rnd() * 34;
    } else {
      // column: the trail left behind in still air
      kind = 1;
      const t = Math.pow(rnd(), 0.66) * 0.62; birth = 13.8 + t * (FILM_SECONDS - 13.8); life = 30 + rnd() * 30;
      const prog = launchToProgress(birth / FILM_SECONDS);
      const y = altitudeKm(prog) * 1000;
      const w = 2.5 + y * 0.008;
      const a = rnd() * Math.PI * 2;
      // Left well below the nozzles and moving down, so the trail can never swallow the vehicle that made it.
      px = Math.cos(a) * w * rnd(); py = Math.max(PAD_DECK + 4, y - 30 - y * 0.03); pz = Math.sin(a) * w * rnd();
      vx = (rnd() - 0.5) * 7; vy = -9 - rnd() * 12; vz = (rnd() - 0.5) * 7;
      s0 = 4 + y * 0.006; s1 = 15 + y * 0.03 + rnd() * 12;
    }
    A.set([birth, life, s0, s1], i * 4);
    P.set([px, py, pz], i * 3);
    V.set([vx, vy, vz], i * 3);
    B.set([rnd(), Math.floor(rnd() * 16), rnd() * Math.PI * 2, kind], i * 4);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(QUAD, 3));
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 3));
  g.setAttribute('aV', new THREE.InstancedBufferAttribute(V, 3));
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4));
  return g;
}

export function LaunchSmoke() {
  const ref = useRef();
  const loaded = useSyncExternalStore(subscribe, () => assets.loaded.has('smokeAtlas'));
  const tier = useQuality((s) => s.tier);
  const geo = useMemo(() => buildParticles(MAX_COUNTS.smoke), []);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: smokeVert, fragmentShader: smokeFrag, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uT: { value: 0 }, uTime: G.uTime, uPadVapor: { value: 1 }, uFade: { value: 1 }, uFlood: { value: 1 }, uFlameI: { value: 0 }, uFlamePos: { value: new THREE.Vector3() }, uAtlas: { value: null }, uAmbient: { value: new THREE.Color(0.03, 0.05, 0.095) }, uFlameY: { value: 0 }, uCamDist: { value: 0 } },
  }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => { mat.uniforms.uAtlas.value = assets.textures.smokeAtlas; }, [loaded, mat]);
  useEffect(() => { geo.instanceCount = QUALITY[tier].smoke; }, [geo, tier]);

  useFrame(() => {
    const u = mat.uniforms;
    const vis = frame.altitude < 90 && loaded;
    ref.current.visible = vis;
    if (!vis) return;
    u.uT.value = track.launchT * FILM_SECONDS;
    u.uPadVapor.value = track.vapor * (1 - smoothstep(0.4, 3, frame.altitude));
    u.uFade.value = 1 - smoothstep(30, 80, frame.altitude);
    u.uFlood.value = track.padLights;
    u.uFlameI.value = (track.glow * 0.04 + track.thrust) * 5.2 * (1 - smoothstep(0.4, 4, frame.altitude));
    u.uFlamePos.value.copy(frame.rocketPos).addScaledVector(frame.rocketDir, -8);
    u.uFlamePos.value.y = Math.max(u.uFlamePos.value.y, 4);
  });

  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={7} />;
}
