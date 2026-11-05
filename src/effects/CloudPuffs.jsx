import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { frame } from '../experience/ExperienceController.js';
import { G } from '../experience/Uniforms.js';
import { assets } from '../performance/AssetPreloader.js';
import { MAX_COUNTS, QUALITY, useQuality } from '../performance/QualityManager.js';
import { smoothstep } from '../animation/Interpolation.js';

// Billboards at their true height around the flight line, there for the moment the vehicle punches through the
// deck that the planet shader draws at a distance.
const vert = /* glsl */`
attribute vec4 aP; attribute vec2 aB; uniform float uTime; uniform vec3 uCam;
varying vec2 vUv; varying vec2 vCell; varying float vA; varying float vH; varying vec2 vRot;
void main() {
  vec3 pos = aP.xyz; float size = aP.w;
  vec4 mv = viewMatrix * vec4(pos, 1.0);
  float a = aB.y + uTime * 0.004, c = cos(a), s = sin(a);
  vRot = vec2(c, s);
  mv.xy += vec2(position.x * c - position.y * s, position.x * s + position.y * c) * size;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 0.5 + 0.5;
  vCell = vec2(mod(aB.x, 4.0), floor(aB.x / 4.0));
  float d = length(pos - uCam);
  vA = smoothstep(size * 0.25, size * 1.1, d) * (1.0 - smoothstep(7000.0, 13000.0, d));
  vH = pos.y;
}`;
const frag = /* glsl */`
precision highp float; uniform sampler2D uAtlas; uniform vec3 uLit, uShade; uniform float uGain; varying vec2 vUv; varying vec2 vCell; varying float vA; varying float vH; varying vec2 vRot;
void main() {
  vec3 t = texture2D(uAtlas, (vCell + vUv) * 0.25).rgb;
  float d = t.b; if (d < 0.01) discard;
  vec2 n2 = t.rg * 2.0 - 1.0; n2 = vec2(n2.x * vRot.x - n2.y * vRot.y, n2.x * vRot.y + n2.y * vRot.x);
  float l = 0.5 + 0.5 * normalize(vec3(n2, 0.5)).y;
  vec3 c = mix(uShade, uLit, l * l);
  float a = smoothstep(0.04, 0.95, d) * vA * uGain * 0.72;
  gl_FragColor = vec4(c * a, a);
}`;

const subscribe = (cb) => { assets.listeners.add(cb); return () => assets.listeners.delete(cb); };

export function CloudPuffs() {
  const ref = useRef();
  const loaded = useSyncExternalStore(subscribe, () => assets.loaded.has('smokeAtlas'));
  const tier = useQuality((s) => s.tier);
  const geo = useMemo(() => {
    const n = MAX_COUNTS.puffs; let s = 55; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const P = new Float32Array(n * 4), B = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, R = 300 + Math.pow(rnd(), 0.7) * 7000;
      // deck centred at 13 km, a second thin layer at 7 km gives early parallax
      const low = rnd() < 0.3, y = low ? 6300 + rnd() * 1000 : 11600 + Math.pow(rnd(), 1.4) * 3400;
      P.set([Math.cos(a) * R, y, Math.sin(a) * R, 900 + rnd() * 2100], i * 4);
      B.set([Math.floor(rnd() * 16), rnd() * 6.28], i * 2);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4));
    g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 2));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uAtlas: { value: null }, uTime: G.uTime, uCam: { value: new THREE.Vector3() }, uLit: { value: new THREE.Color(0.1, 0.12, 0.18) }, uShade: { value: new THREE.Color(0.016, 0.022, 0.046) }, uGain: { value: 1 } },
  }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => { mat.uniforms.uAtlas.value = assets.textures.smokeAtlas; }, [loaded, mat]);
  useEffect(() => { geo.instanceCount = QUALITY[tier].puffs; }, [geo, tier]);
  useFrame(() => {
    const a = frame.altitude;
    const vis = loaded && a > 1 && a < 40;
    ref.current.visible = vis;
    if (!vis) return;
    mat.uniforms.uCam.value.copy(frame.nearPos);
    mat.uniforms.uGain.value = smoothstep(1, 3, a) * (1 - smoothstep(18, 36, a));
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}
