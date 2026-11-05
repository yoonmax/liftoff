import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import vert from '../shaders/common/fullscreen.vert.glsl?raw';
import util from '../shaders/common/util.glsl?raw';
import scatter from '../shaders/atmosphere/scatter.glsl?raw';
import moonFrag from '../shaders/planet/moon.frag.glsl?raw';
import giantFrag from '../shaders/planet/giant.frag.glsl?raw';
import arrivalFrag from '../shaders/planet/arrival.frag.glsl?raw';
import nebulaFrag from '../shaders/nebula/nebula.frag.glsl?raw';
import { frame, track } from '../experience/ExperienceController.js';
import { ARRIVAL_POS, ARRIVAL_R, GIANT_POS, GIANT_R, MOON_POS, MOON_R, RING_NORMAL } from '../camera/CameraController.js';
import { FULLSCREEN, G } from '../experience/Uniforms.js';
import { assets } from '../performance/AssetPreloader.js';
import { QUALITY, useQuality } from '../performance/QualityManager.js';
import { smoothstep } from '../animation/Interpolation.js';
import { interfaceBus } from '../interface/interfaceBus.js';

const subscribe = (cb) => { assets.listeners.add(cb); return () => assets.listeners.delete(cb); };
const loadedCount = () => assets.loaded.size;
const blendOpaque = { depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor };
const SHARED = () => ({ uCamRot: G.uCamRot, uTan: G.uTan, uNoise: G.uNoise, uTime: G.uTime });

export function Moon() {
  const ref = useRef();
  const v = useSyncExternalStore(subscribe, loadedCount);
  const tier = useQuality((s) => s.tier);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: `precision highp float;\n${util}\n${moonFrag}`, ...blendOpaque,
    uniforms: { ...SHARED(), uRo: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3() }, uGain: { value: 1 }, uReliefSteps: { value: 20 }, uLoaded: { value: 1 }, uPixel: { value: 0.001 }, uColor: { value: null }, uHeight: { value: null }, uTile: { value: null } },
  }), []);
  useEffect(() => { interfaceBus.moonMaterial = mat; return () => { interfaceBus.moonMaterial = null; mat.dispose(); }; }, [mat]);
  useEffect(() => { const t = assets.textures, u = mat.uniforms; u.uColor.value = t.moonColor; u.uHeight.value = t.moonHeight; u.uTile.value = t.craterTile; }, [v, mat]);
  useFrame(() => {
    const vis = frame.p > 0.36 && frame.p < 0.672;
    ref.current.visible = vis;
    if (!vis) return;
    const u = mat.uniforms;
    u.uRo.value.copy(frame.cosmos).sub(MOON_POS).divideScalar(MOON_R);
    u.uSun.value.copy(frame.sunDir);
    const closeness = smoothstep(4, 0.8, u.uRo.value.length() - 1);
    u.uReliefSteps.value = Math.max(2, Math.round(closeness * QUALITY[tier].moonRelief + 6));
    u.uPixel.value = 2 * G.uTan.value.y / G.uRes.value.y;
    u.uGain.value = 1 - smoothstep(0.648, 0.672, frame.p);
    // Depth order against Earth flips depending on which is nearer.
    ref.current.renderOrder = frame.cosmos.distanceTo(MOON_POS) < frame.cosmos.length() ? 12 : 9;
  });
  return <mesh ref={ref} geometry={FULLSCREEN} material={mat} frustumCulled={false} renderOrder={12} />;
}

function bakeRingTexture() {
  const W = 2048;
  let s = 1234; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const layers = []; for (let o = 0; o < 6; o++) { const n = 8 << o, pts = new Float32Array(n + 2); for (let i = 0; i < n + 2; i++) pts[i] = rnd(); layers.push({ n, pts, a: 0.5 / (1 << o) }); }
  const noise = (u0) => { const u = u0 - Math.floor(u0); let v = 0; for (const l of layers) { const x = u * l.n, i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f); v += l.a * (l.pts[i] * (1 - t) + l.pts[i + 1] * t); } return v / 0.97; };
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const data = new Uint8Array(W * 4);
  for (let i = 0; i < W; i++) {
    const u = i / (W - 1);
    const base = 0.2 + 0.86 * noise(u) * ss(0, 0.05, u) * (1 - ss(0.95, 1, u));
    const inner = 1 - ss(0.14, 0.2, u) * 0; // C ring is faint
    const c = ss(0.17, 0.26, u);
    // A broad central gap, a smaller outer gap, a fine scattering of ringlets
    const gapA = 1 - (1 - ss(0.585, 0.6, u)) * ss(0.525, 0.54, u) * 0.96;
    const gapB = 1 - (1 - ss(0.82, 0.824, u)) * ss(0.81, 0.814, u) * 0.86;
    const fine = 0.8 + 0.36 * (noise(u * 7 + 0.3) * 1.2 - 0.3);
    let a = base * (0.2 + 0.8 * c) * gapA * gapB * fine * inner;
    a = Math.max(0, Math.min(1, a * 1.08 + 0.02));
    const warm = noise(u * 2.1 + 0.6);
    const r = 176 + warm * 58, g = 160 + warm * 48, b = 138 + warm * 40;
    data.set([r, g, b, a * 255], i * 4);
  }
  const t = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.wrapS = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

export function GasGiant() {
  const ref = useRef();
  const stuff = useMemo(() => {
    const rings = bakeRingTexture();
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: `precision highp float;\n${util}\n${giantFrag}`, ...blendOpaque,
      uniforms: { ...SHARED(), uRo: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3() }, uRingN: { value: RING_NORMAL.clone() }, uGain: { value: 1 }, uRings: { value: rings } },
    });
    return { rings, mat };
  }, []);
  useEffect(() => () => { stuff.rings.dispose(); stuff.mat.dispose(); }, [stuff]);
  useFrame(() => {
    const vis = frame.p > 0.628 && frame.p < 0.858;
    ref.current.visible = vis;
    if (!vis) return;
    const u = stuff.mat.uniforms;
    u.uRo.value.copy(frame.cosmos).sub(GIANT_POS).divideScalar(GIANT_R);
    u.uSun.value.copy(frame.sunDir);
    u.uGain.value = smoothstep(0.63, 0.65, frame.p) * (1 - smoothstep(0.835, 0.858, frame.p));
  });
  return <mesh ref={ref} geometry={FULLSCREEN} material={stuff.mat} frustumCulled={false} renderOrder={13} />;
}

export function ArrivalPlanet() {
  const ref = useRef();
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: `precision highp float;\n${util}\n${scatter}\n${arrivalFrag}`, ...blendOpaque,
    uniforms: {
      ...SHARED(), uSteps: G.uSteps, uLightSteps: G.uLightSteps,
      uBetaR: { value: new THREE.Vector3(46, 22, 11) }, uBetaM: { value: 16 }, uBetaO: { value: new THREE.Vector3(0, 0, 0) }, uHR: { value: 0.0048 }, uHM: { value: 0.0016 }, uAtmoTop: { value: 0.042 }, uMieG: { value: 0.72 }, uSunPower: { value: 22 }, uTwilight: { value: 0 },
      uCamDir: { value: new THREE.Vector3(0, 1, 0) }, uCamH: { value: 0.1 }, uSun: { value: new THREE.Vector3() }, uGain: { value: 1 }, uLines: { value: 0 },
    },
  }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const g = track.arrivalVis;
    ref.current.visible = g > 0;
    if (!ref.current.visible) return;
    const u = mat.uniforms;
    const rel = u.uCamDir.value.copy(frame.cosmos).sub(ARRIVAL_POS);
    const d = rel.length(); rel.divideScalar(d);
    u.uCamH.value = Math.max(0.001, (d - ARRIVAL_R) / ARRIVAL_R);
    u.uSun.value.copy(frame.sunDir);
    u.uGain.value = g * 0.5;
    u.uLines.value = track.lightsOn;
  });
  return <mesh ref={ref} geometry={FULLSCREEN} material={mat} frustumCulled={false} renderOrder={14} />;
}

const nebulaComposite = /* glsl */`
precision highp float; uniform sampler2D uTex; uniform float uGain; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  // A small tent filter on the way up hides the march's jitter.
  vec4 t = texture2D(uTex, vUv) * 0.2;
  t += (texture2D(uTex, vUv + uTexel * vec2(1.5, 0.6)) + texture2D(uTex, vUv + uTexel * vec2(-1.5, -0.6)) + texture2D(uTex, vUv + uTexel * vec2(-0.6, 1.5)) + texture2D(uTex, vUv + uTexel * vec2(0.6, -1.5))) * 0.13;
  t += (texture2D(uTex, vUv + uTexel * vec2(2.6, -1.6)) + texture2D(uTex, vUv + uTexel * vec2(-2.6, 1.6)) + texture2D(uTex, vUv + uTexel * vec2(1.6, 2.6)) + texture2D(uTex, vUv + uTexel * vec2(-1.6, -2.6))) * 0.07;
  gl_FragColor = vec4(t.rgb * uGain, mix(1.0, t.a, uGain));
}`;

/** Rendered low-resolution into its own target because a full-screen march is the single heaviest effect here. */
export function Nebula({ passRef }) {
  const ref = useRef();
  const { size, gl } = useThree();
  const tier = useQuality((s) => s.tier);
  const q = QUALITY[tier];
  const stuff = useMemo(() => {
    const march = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: `precision highp float;\n${util}\n${nebulaFrag}`, depthTest: false, depthWrite: false,
      uniforms: { ...SHARED(), uSteps: { value: 20 }, uTravel: { value: 0 }, uDensity: { value: 1 } },
    });
    const composite = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy,1.0,1.0); }`, fragmentShader: nebulaComposite, ...blendOpaque,
      uniforms: { uTex: { value: null }, uGain: { value: 0 }, uTexel: { value: new THREE.Vector2() } },
    });
    const scene = new THREE.Scene(), tri = new THREE.Mesh(FULLSCREEN, march); tri.frustumCulled = false; scene.add(tri);
    return { march, composite, scene, cam: new THREE.Camera() };
  }, []);
  const rt = useMemo(() => {
    const d = gl.getPixelRatio();
    return new THREE.WebGLRenderTarget(Math.max(2, Math.floor(size.width * d * q.nebulaScale)), Math.max(2, Math.floor(size.height * d * q.nebulaScale)), { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }, [gl, size.width, size.height, q.nebulaScale]);
  useEffect(() => { stuff.composite.uniforms.uTex.value = rt.texture; stuff.composite.uniforms.uTexel.value.set(1 / rt.width, 1 / rt.height); return () => rt.dispose(); }, [rt, stuff]);
  useEffect(() => () => { stuff.march.dispose(); stuff.composite.dispose(); }, [stuff]);
  // One real draw up front, so the first frame of the nebula is not the frame that pays for linking the shader.
  useEffect(() => { const prev = gl.getRenderTarget(); gl.setRenderTarget(rt); gl.render(stuff.scene, stuff.cam); gl.setRenderTarget(prev); }, [gl, stuff, rt]);

  useEffect(() => {
    passRef.current = (renderer) => {
      if (track.nebula <= 0.001) return;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(stuff.scene, stuff.cam);
      renderer.setRenderTarget(prev);
    };
    return () => { passRef.current = null; };
  }, [passRef, rt, stuff]);

  useFrame(() => {
    const g = track.nebula;
    ref.current.visible = g > 0.001;
    if (!ref.current.visible) return;
    stuff.march.uniforms.uSteps.value = q.nebulaSteps;
    stuff.march.uniforms.uTravel.value = track.nebulaTravel * 3400;
    stuff.march.uniforms.uDensity.value = 1;
    stuff.composite.uniforms.uGain.value = g;
  });
  return <mesh ref={ref} geometry={FULLSCREEN} material={stuff.composite} frustumCulled={false} renderOrder={20} />;
}

