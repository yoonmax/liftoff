import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { exhaustVert, exhaustFrag } from '../shaders/exhaust/exhaust.glsl.js';
import { frame, track } from '../experience/ExperienceController.js';
import { G } from '../experience/Uniforms.js';
import { smoothstep, lerp } from '../animation/Interpolation.js';
import { QUALITY, useQuality } from '../performance/QualityManager.js';
import { PAD_DECK } from '../camera/CameraController.js';
import { interfaceBus } from '../interface/interfaceBus.js';
import { BOOSTER_Z } from '../objects/rocket/model.js';

function makeMaterial(hot, mid, cool) {
  return new THREE.ShaderMaterial({
    vertexShader: exhaustVert, fragmentShader: exhaustFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: {
      uNoise: G.uNoise, uTime: G.uTime, uThrust: { value: 0 }, uLen: { value: 80 }, uR0: { value: 2.8 }, uR1: { value: 8 }, uSteps: { value: 12 }, uGroundY: { value: 8 }, uOriginY: { value: 0 }, uCos: { value: 1 }, uVac: { value: 0 }, uBoost: { value: 1 }, uSplit: { value: 0 }, uScale: { value: new THREE.Vector3(1, 1, 1) },
      uHot: { value: new THREE.Color(...hot) }, uMid: { value: new THREE.Color(...mid) }, uCool: { value: new THREE.Color(...cool) },
    },
  });
}

const CYL = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 24, 1); g.translate(0, -0.5, 0); return g; })();

export function EngineExhaust() {
  const first = useRef(), upper = useRef(), light = useRef(), stack = useRef();
  const tier = useQuality((s) => s.tier);
  const mats = useMemo(() => ({ a: makeMaterial([1.0, 0.92, 0.78], [1.0, 0.52, 0.16], [0.75, 0.17, 0.035]), b: makeMaterial([0.86, 0.92, 1.0], [0.5, 0.68, 1.0], [0.28, 0.32, 0.72]) }), []);
  useEffect(() => () => { mats.a.dispose(); mats.b.dispose(); }, [mats]);
  const a = useMemo(() => new THREE.Vector3(), []), b = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const steps = QUALITY[tier].dust > 800 ? 16 : QUALITY[tier].dust > 400 ? 12 : 8;
    const r = stack.current;
    r.position.copy(frame.rocketPos); r.quaternion.copy(frame.rocketQuat);

    // First stage plume: tight at sea level, ballooning as the air thins out.
    const thrust = track.thrust, alt = frame.altitude;
    const expand = smoothstep(2, 70, alt);
    const f = first.current; f.visible = thrust > 0.002;
    if (f.visible) {
      const u = mats.a.uniforms;
      const len = lerp(lerp(30, 118, thrust), 340, expand), R0 = lerp(2.0, 3.0, thrust), R1 = lerp(lerp(3.4, 8.2, thrust), 74, expand);
      const split = BOOSTER_Z * (1 - smoothstep(0, 0.06, track.boosterSep));
      f.scale.set(R1 * 1.18 + split, len, R1 * 1.18 + split);
      u.uSplit.value = split;
      u.uScale.value.copy(f.scale);
      u.uLen.value = len; u.uR0.value = R0; u.uR1.value = R1; u.uThrust.value = thrust; u.uSteps.value = steps;
      u.uGroundY.value = PAD_DECK - 8; u.uOriginY.value = frame.rocketPos.y; u.uCos.value = frame.rocketDir.y;
      u.uVac.value = expand; u.uBoost.value = lerp(lerp(0.13, 0.1, thrust), 0.045, expand);
      u.uTime.value = G.uTime.value;
    }
    // Upper stage vacuum flame: a thin ice-blue blade, barely there.
    const v = track.vac, up = upper.current; up.visible = v > 0.002;
    if (up.visible) {
      const u = mats.b.uniforms, len = 26, R1 = 2.0;
      up.position.set(0, 47.2, 0); up.scale.set(R1 * 1.18, len, R1 * 1.18);
      u.uScale.value.copy(up.scale);
      u.uLen.value = len; u.uR0.value = 0.9; u.uR1.value = R1; u.uThrust.value = v; u.uSteps.value = steps; u.uOriginY.value = 1e9; u.uVac.value = 1; u.uBoost.value = 0.2;
    }

    // Engine light on everything near it.
    const l = light.current;
    l.position.copy(frame.rocketPos).addScaledVector(frame.rocketDir, -3);
    const fire = track.glow * 0.03 + thrust;
    const flicker = 0.92 + 0.08 * Math.sin(G.uTime.value * 31) + 0.05 * Math.sin(G.uTime.value * 57);
    // A fierce light in the trench; in thin air it mostly lights the base of the vehicle and nothing else.
    l.intensity = lerp(95000, 9000, smoothstep(0.15, 3, alt)) * fire * flicker;

    // Screen-space segment for the shimmer in the composite.
    interfaceBus.heat.amount = track.heat * (frame.p < 0.3 ? 1 : 0);
    if (interfaceBus.heat.amount > 0) {
      const cam = interfaceBus.camera;
      if (cam) {
        a.copy(frame.rocketPos).addScaledVector(frame.rocketDir, -2).project(cam);
        b.copy(frame.rocketPos).addScaledVector(frame.rocketDir, -44).project(cam);
        interfaceBus.heat.a.set(a.x * 0.5 + 0.5, a.y * 0.5 + 0.5);
        interfaceBus.heat.b.set(b.x * 0.5 + 0.5, b.y * 0.5 + 0.5);
      }
    }
  });

  return (
    <>
      <group ref={stack}>
        <mesh ref={first} geometry={CYL} material={mats.a} frustumCulled={false} renderOrder={8} />
        <mesh ref={upper} geometry={CYL} material={mats.b} frustumCulled={false} renderOrder={8} />
      </group>
      <pointLight ref={light} color={new THREE.Color(1, 0.55, 0.22)} decay={2} distance={1400} />
    </>
  );
}
