import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { frame, track } from '../experience/ExperienceController.js';
import { G } from '../experience/Uniforms.js';
import { MAX_COUNTS, QUALITY, useQuality } from '../performance/QualityManager.js';
import { band, lerp } from '../animation/Interpolation.js';
import { interfaceBus } from '../interface/interfaceBus.js';

// A box of motes wrapped around the camera. Their offset comes only from distance travelled, so speed is felt
// without any per-frame state. Ice crystals on the ascent, rock dust in the belt, glowing motes in the nebula.
const vert = /* glsl */`
attribute vec4 aS; // position in unit cube, seed
uniform vec3 uCam, uTravel, uDir; uniform float uBox, uStreak, uSize, uPx, uTime; uniform vec2 uRes, uMouse; uniform float uMouseOn;
varying vec2 vQ; varying float vF; varying float vSeed;
void main() {
  vec3 p = mod(aS.xyz * uBox + uTravel + sin(uTime * 0.13 + aS.w * 40.0) * uBox * 0.004, uBox) - uBox * 0.5;
  float dist = length(p);
  vec3 w = uCam + p;
  vec4 a = projectionMatrix * viewMatrix * vec4(w, 1.0);
  vec4 b = projectionMatrix * viewMatrix * vec4(w + uDir * uStreak, 1.0);
  vec2 sa = a.xy / a.w, sb = b.xy / b.w;
  if (uMouseOn > 0.001) {
    // Motes shy away from the cursor, like dust around a hand in a sunbeam.
    vec2 d = (sa - uMouse) * vec2(uRes.x / uRes.y, 1.0);
    float k = exp(-dot(d, d) * 7.0) * uMouseOn * 0.16;
    sa += normalize(d + 1e-4) * k; sb += normalize(d + 1e-4) * k;
  }
  vec2 asp = vec2(uRes.y / uRes.x, 1.0);
  vec2 d = (sb - sa) / asp;
  float len = length(d);
  vec2 dirn = len > 1e-4 ? d / len : vec2(0.0, 1.0);
  vec2 n = vec2(-dirn.y, dirn.x);
  float sz = uSize / max(a.w, 1.0) * (0.5 + aS.w);
  sz = max(sz, 0.0016 * uPx);
  vQ = position.xy;
  vec2 q = n * position.x * sz + dirn * position.y * (sz + len * 0.5);
  vec2 mid = (sa + sb) * 0.5;
  gl_Position = vec4(mid + q * asp, a.z / a.w, 1.0);
  if (a.w < 0.5) gl_Position = vec4(2.0);
  vF = smoothstep(uBox * 0.5, uBox * 0.28, dist) * smoothstep(1.0, 8.0, dist);
  vSeed = aS.w;
}`;
const frag = /* glsl */`
precision highp float; uniform vec3 uColor; uniform float uGain; uniform vec3 uColorB; varying vec2 vQ; varying float vF; varying float vSeed;
void main() { float d = length(vQ); float m = exp(-d * d * 3.2) * (1.0 - smoothstep(0.8, 1.0, d)); vec3 c = mix(uColor, uColorB, step(0.72, vSeed)); gl_FragColor = vec4(c * m * vF * uGain, 1.0); }`;

export function TravelDust() {
  const ref = useRef();
  const tier = useQuality((s) => s.tier);
  const geo = useMemo(() => {
    const n = MAX_COUNTS.dust; let s = 31; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const S = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) S[i] = rnd();
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setAttribute('aS', new THREE.InstancedBufferAttribute(S, 4));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTravel: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3() }, uBox: { value: 400 }, uStreak: { value: 8 }, uSize: { value: 0.6 }, uPx: G.uPx, uTime: G.uTime, uRes: G.uRes, uColor: { value: new THREE.Color(1, 1, 1) }, uColorB: { value: new THREE.Color(1, 1, 1) }, uGain: { value: 1 }, uMouse: { value: new THREE.Vector2() }, uMouseOn: { value: 0 } },
  }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => { geo.instanceCount = QUALITY[tier].dust; }, [geo, tier]);
  const mouseOn = useRef(0);

  useFrame((_, dt) => {
    const p = frame.p, u = mat.uniforms;
    const air = track.dust, belt = band(p, 0.61, 0.64, 0.75, 0.776), neb = track.nebula, arrive = band(p, 0.86, 0.885, 0.94, 0.965);
    const gain = air + belt + neb + arrive;
    ref.current.visible = gain > 0.002;
    if (!ref.current.visible) return;
    u.uCam.value.copy(frame.nearPos);
    if (air > belt && air > neb && air > arrive) {
      u.uTravel.value.set(0, frame.altitude * 1400, 0);
      u.uDir.value.set(0, Math.min(90, frame.altitude * 18 + 2), 0);
      u.uBox.value = 500; u.uSize.value = 0.9;
      u.uColor.value.setRGB(0.55, 0.64, 0.86); u.uColorB.value.setRGB(1.1, 1.0, 0.9);
      u.uGain.value = air * 0.22;
    } else if (neb > belt && neb > arrive) {
      u.uTravel.value.set(0, 0, track.nebulaTravel * 3600);
      u.uDir.value.set(0, 0, 0.5);
      u.uBox.value = 560; u.uSize.value = 1.7;
      u.uColor.value.setRGB(1.0, 0.72, 0.44); u.uColorB.value.setRGB(0.46, 0.8, 1.0);
      u.uGain.value = neb * 1.05;
    } else if (arrive > belt) {
      u.uTravel.value.set(0, 0, track.approach * 2900);
      u.uDir.value.set(0, 0, 3);
      u.uBox.value = 520; u.uSize.value = 1.1;
      u.uColor.value.setRGB(1.0, 0.84, 0.6); u.uColorB.value.setRGB(1, 0.95, 0.9);
      u.uGain.value = arrive * 0.75;
    } else {
      u.uTravel.value.set(0, 0, lerp(0, 5200, track.giantPath * 2.4));
      u.uDir.value.set(0, 0, 11);
      u.uBox.value = 620; u.uSize.value = 1.0;
      u.uColor.value.setRGB(0.75, 0.73, 0.68); u.uColorB.value.setRGB(1.0, 0.86, 0.66);
      u.uGain.value = belt * 0.42;
    }
    const want = neb > 0.4 && interfaceBus.pointerActive ? 1 : 0;
    mouseOn.current += (want - mouseOn.current) * Math.min(1, dt * 3);
    u.uMouseOn.value = mouseOn.current;
    u.uMouse.value.copy(interfaceBus.pointer);
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={12} />;
}
