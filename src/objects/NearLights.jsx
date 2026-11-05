import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { frame, track } from '../experience/ExperienceController.js';
import { QUALITY, useQuality } from '../performance/QualityManager.js';
import { lerp, smoothstep } from '../animation/Interpolation.js';

// A metal surface is only ever a picture of its surroundings, so each place the vehicle visits gets its own picture:
// the blue hour and floodlights on the pad, a huge blue planet filling the lower half of the sky in orbit, a grey
// plain under a black sky at the Moon, deep black with warm stars beyond it, and copper light at the end.
const ENV_FRAG = /* glsl */`
uniform vec3 uZenith, uHorizon, uGround, uGlow, uGlowDir; uniform float uHorizonY, uHorizonW, uGlowK;
varying vec3 vD;
void main(){
  vec3 d = normalize(vD);
  float t = smoothstep(uHorizonY - uHorizonW, uHorizonY + uHorizonW, d.y);
  vec3 c = mix(uGround, mix(uHorizon, uZenith, smoothstep(0.0, 0.7, d.y - uHorizonY)), t);
  c += uGlow * pow(max(dot(d, uGlowDir), 0.0), uGlowK);
  gl_FragColor = vec4(c, 1.0);
}`;
const ENV_DEFS = {
  pad: {
    zenith: [0.02, 0.05, 0.13], horizon: [0.2, 0.26, 0.44], ground: [0.02, 0.024, 0.032], glow: [1.3, 0.6, 0.3], glowDir: [1, 0.05, 0], horizonY: 0, horizonW: 0.03, glowK: 6,
    panels: [[-34, 2, 26, 12, 40, [1, 0.92, 0.8], 3.2], [30, 6, -30, 8, 44, [0.74, 0.84, 1], 3], [-10, -6, -38, 20, 18, [0.9, 0.86, 0.8], 1.2], [26, -6, 30, 22, 6, [0.92, 0.94, 1], 1]],
  },
  orbit: {
    zenith: [0.001, 0.001, 0.002], horizon: [0.3, 0.5, 0.95], ground: [0.1, 0.2, 0.42], glow: [9, 8.6, 8], glowDir: [0.74, 0.27, 0.62], horizonY: -0.1, horizonW: 0.05, glowK: 180,
    panels: [],
  },
  moon: {
    zenith: [0.0008, 0.0008, 0.001], horizon: [0.3, 0.3, 0.3], ground: [0.13, 0.13, 0.13], glow: [10, 9.8, 9.4], glowDir: [0.96, -0.2, 0.08], horizonY: -0.2, horizonW: 0.03, glowK: 220,
    panels: [],
  },
  deep: {
    zenith: [0.002, 0.003, 0.006], horizon: [0.01, 0.012, 0.02], ground: [0.004, 0.004, 0.006], glow: [8, 7.4, 6.4], glowDir: [0.74, 0.27, 0.62], horizonY: 0, horizonW: 0.2, glowK: 140,
    panels: [],
  },
  arrive: {
    zenith: [0.01, 0.008, 0.01], horizon: [0.46, 0.27, 0.15], ground: [0.1, 0.05, 0.03], glow: [9, 6.6, 4], glowDir: [0, 0.1, -1], horizonY: -0.25, horizonW: 0.12, glowK: 26,
    panels: [],
  },
};
const ENV_ORDER = [[0.36, 'pad'], [0.56, 'orbit'], [0.645, 'moon'], [0.87, 'deep'], [2, 'arrive']];

function bakeEnvironment(gl, def, pm) {
  const scene = new THREE.Scene();
  const uniforms = {
    uZenith: { value: new THREE.Vector3(...def.zenith) }, uHorizon: { value: new THREE.Vector3(...def.horizon) }, uGround: { value: new THREE.Vector3(...def.ground) },
    uGlow: { value: new THREE.Vector3(...def.glow) }, uGlowDir: { value: new THREE.Vector3(...def.glowDir).normalize() }, uHorizonY: { value: def.horizonY }, uHorizonW: { value: def.horizonW }, uGlowK: { value: def.glowK },
  };
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms, fragmentShader: ENV_FRAG,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  })));
  for (const [x, y, z, sx, sy, c, i] of def.panels) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] * i, c[1] * i, c[2] * i), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m);
  }
  const rt = pm.fromScene(scene, 0.02);
  scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  return rt;
}

export function NearLights() {
  const { gl, scene } = useThree();
  const sun = useRef(), tgt = useRef(), fill = useRef();
  const tier = useQuality((s) => s.tier);
  const envs = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const out = {};
    for (const k of Object.keys(ENV_DEFS)) out[k] = bakeEnvironment(gl, ENV_DEFS[k], pm);
    pm.dispose();
    return out;
  }, [gl]);
  useEffect(() => { scene.environment = envs.pad.texture; return () => { scene.environment = null; Object.values(envs).forEach((e) => e.dispose()); }; }, [envs, scene]);
  const { shadow } = QUALITY[tier];
  useEffect(() => {
    gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFShadowMap;
  }, [gl]);
  useEffect(() => {
    const l = sun.current;
    l.castShadow = shadow > 0;
    if (shadow > 0) { l.shadow.mapSize.set(shadow, shadow); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.06; if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } const c = l.shadow.camera; c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 360; c.updateProjectionMatrix(); }
  }, [shadow]);
  const v = useMemo(() => new THREE.Vector3(), []), ground = useMemo(() => new THREE.Color(), []), groundB = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const p = frame.p;
    v.copy(frame.anchor);
    tgt.current.position.copy(v);
    sun.current.position.copy(v).addScaledVector(frame.sunDir, 180);
    tgt.current.updateMatrixWorld();
    sun.current.intensity = track.sunNear * 3.1;
    sun.current.color.copy(frame.sunColor);
    // The sun's shadow map needs no work on the night side of the planet.
    sun.current.shadow.autoUpdate = track.sunNear > 0.002;
    // Earth's reflected light fills the vehicle in orbit; twilight fills it on the ground.
    // Up in the blue hour, the sky itself is the only light on the vehicle; the flood lights are long gone.
    const skylit = smoothstep(0.19, 0.23, p) * (1 - smoothstep(0.31, 0.345, p));
    fill.current.intensity = (lerp(0.1, 0.2, smoothstep(0.34, 0.4, p)) + skylit * 0.85) * (1 - smoothstep(0.62, 0.72, p) * 0.8);
    fill.current.color.setRGB(0.42, 0.56, 0.86);
    ground.setRGB(0.04, 0.06, 0.1);
    groundB.setRGB(0.16, 0.3, 0.5);
    fill.current.groundColor.copy(ground).lerp(groundB, smoothstep(0.34, 0.4, p) * (1 - smoothstep(0.55, 0.62, p)));
    // Swap the picture at the moments the frame hides it, easing the reflections down and back up across the join.
    let dip = 1, name = 'arrive';
    for (const [end, k] of ENV_ORDER) { if (p < end) { name = k; dip = Math.min(smoothstep(0, 0.012, end - p), 1); break; } }
    for (const [end] of ENV_ORDER) { const d = p - end; if (d >= 0 && d < 0.012) dip = Math.min(dip, smoothstep(0, 0.012, d)); }
    const tex = envs[name].texture;
    if (scene.environment !== tex) scene.environment = tex;
    scene.environmentIntensity = lerp(0.62, 0.62, smoothstep(0.3, 0.4, p)) * dip;
  });
  return (
    <>
      <directionalLight ref={sun} />
      <object3D ref={tgt} />
      <hemisphereLight ref={fill} />
    </>
  );
}
