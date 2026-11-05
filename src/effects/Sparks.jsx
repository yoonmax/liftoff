import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { frame, track } from '../experience/ExperienceController.js';
import { G } from '../experience/Uniforms.js';
import { MAX_COUNTS, QUALITY, useQuality } from '../performance/QualityManager.js';
import { FILM_SECONDS } from './LaunchSmoke.jsx';
import { smoothstep } from '../animation/Interpolation.js';

// Ballistic sparks thrown off the mount at ignition. Stateless like the smoke: position is f(age).
const vert = /* glsl */`
attribute vec4 aV; // velocity, birth
attribute vec2 aR; // life, seed
uniform float uT, uGain; uniform vec3 uOrigin; uniform vec2 uViewport; uniform float uPx;
varying float vB; varying vec2 vQ;
void main() {
  float age = uT - aV.w;
  if (age < 0.0 || age > aR.x) { gl_Position = vec4(2.0); return; }
  vec3 p = uOrigin + aV.xyz * age + vec3(0.0, -6.5, 0.0) * age * age;
  vec3 vel = aV.xyz + vec3(0.0, -13.0, 0.0) * age;
  vec3 p2 = p - vel * 0.045;
  if (p.y < 0.4) { gl_Position = vec4(2.0); return; }
  vec4 a = projectionMatrix * viewMatrix * vec4(p, 1.0), b = projectionMatrix * viewMatrix * vec4(p2, 1.0);
  vec2 sa = a.xy / a.w, sb = b.xy / b.w;
  vec2 d = sb - sa; float l = max(length(d * uViewport), 1e-3);
  vec2 n = vec2(-d.y, d.x) * uViewport / l / uViewport;
  vQ = position.xy;
  vec2 pos = mix(sa, sb, position.y * 0.5 + 0.5) + n * position.x * 0.0016 * uPx;
  gl_Position = vec4(pos, a.z / a.w, 1.0);
  vB = uGain * (1.0 - age / aR.x);
}`;
const frag = /* glsl */`
precision highp float; varying float vB; varying vec2 vQ;
void main() { float m = (1.0 - abs(vQ.x)) * (0.5 + 0.5 * vQ.y); gl_FragColor = vec4(vec3(1.0, 0.56, 0.22) * vB * m * 16.0, 1.0); }`;

export function Sparks() {
  const ref = useRef();
  const tier = useQuality((s) => s.tier);
  const geo = useMemo(() => {
    const n = MAX_COUNTS.sparks; let s = 98; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const V = new Float32Array(n * 4), R = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, sp = 16 + rnd() * 64, up = 0.1 + Math.pow(rnd(), 2) * 0.75;
      V.set([Math.cos(a) * sp, up * sp, Math.sin(a) * sp, 0.2 + Math.pow(rnd(), 0.8) * 13], i * 4);
      R.set([0.9 + rnd() * 2.8, rnd()], i * 2);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setAttribute('aV', new THREE.InstancedBufferAttribute(V, 4));
    g.setAttribute('aR', new THREE.InstancedBufferAttribute(R, 2));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uGain: { value: 1 }, uOrigin: { value: new THREE.Vector3(0, 7, 0) }, uViewport: { value: new THREE.Vector2(1, 1) }, uPx: G.uPx } }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => { geo.instanceCount = QUALITY[tier].sparks; }, [geo, tier]);
  useFrame(() => {
    const vis = frame.p > 0.13 && frame.p < 0.23;
    ref.current.visible = vis;
    if (!vis) return;
    mat.uniforms.uT.value = track.launchT * FILM_SECONDS;
    mat.uniforms.uGain.value = smoothstep(0, 0.3, track.thrust);
    mat.uniforms.uViewport.value.copy(G.uRes.value);
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={9} />;
}
