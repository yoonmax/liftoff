import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildRocket, BOOSTER_PIVOT, BOOSTER_Z } from './rocket/model.js';
import { frame, track } from '../experience/ExperienceController.js';
import { smoothstep, lerp } from '../animation/Interpolation.js';

const FAIR_PIVOT = new THREE.Vector3(0, 64, 0);

// The vehicle is one set of pieces whose every transform is a function of the staging channels.
export function Rocket({ rig }) {
  const rocket = useMemo(() => buildRocket(), []);
  const root = useRef();
  useEffect(() => () => rocket.dispose(), [rocket]);
  useEffect(() => {
    rig.current = root.current;
    root.current.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  }, [rig]);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const r = root.current;
    r.visible = frame.p < 0.966;
    if (!r.visible) return;
    r.position.copy(frame.rocketPos);
    r.quaternion.copy(frame.rocketQuat);

    // Boosters: thrown clear by their own small motors, noses tipping outward, then left behind as the core flies on.
    const bs = track.boosterSep;
    for (const b of rocket.boosters) {
      b.pivot.visible = bs < 0.999;
      const t = bs * 30, s = b.side;
      b.pivot.position.set(t * t * 0.012 * s, BOOSTER_PIVOT - t * t * 0.42 - t * 0.6, s * (BOOSTER_Z + t * 0.72 + t * t * 0.1));
      b.pivot.rotation.set(s * (smoothstep(0, 0.35, bs) * 0.28 + t * 0.03), t * 0.012, t * 0.018 * s);
    }

    // Spent first stage: falls behind and slowly tumbles out of the frame.
    const sep = track.stageSep;
    const s1 = rocket.stage1;
    s1.visible = sep < 0.999;
    if (sep > 0) {
      const t = sep * 62;
      s1.position.set(Math.sin(t * 0.06) * t * 0.1, -t * 0.32 - t * t * 0.34, t * t * 0.14);
      s1.rotation.set(t * t * 0.0012 + t * 0.012, 0, t * 0.016);
    } else { s1.position.set(0, 0, 0); s1.rotation.set(0, 0, 0); }

    // Fairing halves peel away from the probe, hinging about the base ring.
    const fr = track.fairing;
    const shown = fr < 0.999;
    rocket.fairA.visible = shown; rocket.fairB.visible = shown;
    if (fr > 0) {
      const t = fr * 34;
      const open = smoothstep(0, 0.18, fr);
      for (const [g, s] of [[rocket.fairA, 1], [rocket.fairB, -1]]) {
        g.position.set(0, -t * 0.02, s * (t * 1.25 + t * t * 0.09));
        g.rotation.set(s * (open * 0.42 + t * 0.03), 0, s * t * 0.012);
        tmp.copy(FAIR_PIVOT).applyEuler(g.rotation).sub(FAIR_PIVOT);
        g.position.sub(tmp);
      }
    } else { rocket.fairA.position.set(0, 0, 0); rocket.fairB.position.set(0, 0, 0); rocket.fairA.rotation.set(0, 0, 0); rocket.fairB.rotation.set(0, 0, 0); }

    // Solar wings: folded against the bus, then opening like a rigid accordion, one joint after the next.
    const w = track.wings;
    for (const wing of rocket.wings) {
      const a = wing.side;
      wing.root.rotation.y = a * lerp(1.5708, 0, smoothstep(0, 0.36, w));
      // Once open, the arrays tilt towards the sun, which sits roughly ahead of the vehicle.
      wing.root.rotation.z = 0.78 * smoothstep(0.66, 1, w);
      wing.segs[0].rotation.y = 0;
      for (let i = 1; i < wing.segs.length; i++) {
        const dir = i % 2 ? -1 : 1, from = 0.2 + (i - 1) * 0.18;
        wing.segs[i].rotation.y = dir * a * lerp(3.1, 0, smoothstep(from, from + 0.42, w));
      }
    }
    rocket.probe.visible = track.fairing > 0.001;

    rocket.materials.nozzleInner.emissiveIntensity = track.glow * 5 + track.thrust * 9;
    rocket.materials.vacInner.emissiveIntensity = track.vac * 6;
  });

  return (
    <group ref={root}>
      <primitive object={rocket.stage1} />
      {rocket.boosters.map((b) => <primitive key={b.side} object={b.pivot} />)}
      <primitive object={rocket.upper} />
      <primitive object={rocket.fairA} />
      <primitive object={rocket.fairB} />
      <primitive object={rocket.probe} />
    </group>
  );
}
