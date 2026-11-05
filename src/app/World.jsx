import { useEffect, useMemo, useRef } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { useUI } from '../interface/useUI.js';
import { nextTier } from '../performance/QualityManager.js';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { experience, frame, track, timeline } from '../experience/ExperienceController.js';
import { computeFrame } from '../camera/CameraController.js';
import { createNoiseVolume, G } from '../experience/Uniforms.js';
import { RenderPipeline } from '../effects/RenderPipeline.jsx';
import { QUALITY, useQuality } from '../performance/QualityManager.js';
import { interfaceBus } from '../interface/interfaceBus.js';
import { assets } from '../performance/AssetPreloader.js';
import { Sky } from '../objects/Sky.jsx';
import { Earth } from '../objects/Earth.jsx';
import { Rocket } from '../objects/Rocket.jsx';
import { LaunchComplex } from '../objects/LaunchComplex.jsx';
import { NearLights } from '../objects/NearLights.jsx';
import { EngineExhaust } from '../effects/EngineExhaust.jsx';
import { LaunchSmoke } from '../effects/LaunchSmoke.jsx';
import { Sparks } from '../effects/Sparks.jsx';
import { TravelDust } from '../effects/TravelDust.jsx';
import { CloudPuffs } from '../effects/CloudPuffs.jsx';
import { Moon, GasGiant, ArrivalPlanet, Nebula } from '../objects/Bodies.jsx';
import { AsteroidField } from '../objects/AsteroidField.jsx';
import { SpaceStation } from '../objects/SpaceStation.jsx';

const IS_REDUCED = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Runs first each frame: progress to channels to camera, then writes the uniforms everything shares. */
function Director({ farCam, nearCam }) {
  const { size, gl } = useThree();
  const clock = useRef(0);
  const shakeV = useMemo(() => new THREE.Euler(), []);
  const qs = useMemo(() => new THREE.Quaternion(), []);
  const tier = useQuality((s) => s.tier);
  const sway = useRef({ x: 0, y: 0 });
  const qFocus = useMemo(() => new THREE.Quaternion(), []), mFocus = useMemo(() => new THREE.Matrix4(), []), zero = useMemo(() => new THREE.Vector3(), []), up = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const reduced = IS_REDUCED();
    clock.current += reduced ? 0 : Math.min(dt, 0.1);
    G.uTime.value = clock.current;
    const q = QUALITY[tier];
    G.uSteps.value = q.atmoSteps; G.uLightSteps.value = q.lightSteps;
    G.uPx.value = gl.getPixelRatio() * Math.max(0.8, Math.min(1.25, size.height / 900));

    const p = timeline.progress();
    const aspect = size.width / size.height;
    experience.progress = p; experience.aspect = aspect;
    computeFrame(track, p, aspect, frame);

    nearCam.position.copy(frame.nearPos);
    nearCam.quaternion.copy(frame.quat);
    let fov = frame.fov;
    // Interaction sits on top of the film: a click eases the lens towards its subject, and the pointer adds a
    // whisper of parallax. Neither touches progress, so at rest the frame is exactly what the timeline says.
    const fc = interfaceBus.focus;
    if (fc.weight > 0.001 && fc.dir) {
      qFocus.setFromRotationMatrix(mFocus.lookAt(zero, fc.dir, up.set(0, 1, 0).applyQuaternion(frame.quat)));
      nearCam.quaternion.slerp(qFocus, fc.weight * 0.62);
      fov *= 1 - fc.weight * 0.2;
    }
    if (!reduced) {
      const k = Math.min(1, dt * 2.2);
      sway.current.x += (interfaceBus.pointer.x - sway.current.x) * k;
      sway.current.y += (interfaceBus.pointer.y - sway.current.y) * k;
      const t = clock.current;
      shakeV.set((sway.current.y * 0.006) + Math.sin(t * 0.21) * 0.0022, (-sway.current.x * 0.009) + Math.sin(t * 0.13 + 1.2) * 0.003, Math.sin(t * 0.17) * 0.0012);
      nearCam.quaternion.multiply(qs.setFromEuler(shakeV));
    }
    nearCam.fov = fov; nearCam.aspect = aspect; nearCam.near = 0.6; nearCam.far = 90000;
    if (!reduced && track.shake > 0) {
      const t = clock.current, a = track.shake * 0.0026;
      shakeV.set(Math.sin(t * 37) * a + Math.sin(t * 91.3) * a * 0.6, Math.sin(t * 43.1) * a + Math.sin(t * 77.7) * a * 0.5, Math.sin(t * 29.7) * a * 0.6);
      nearCam.quaternion.multiply(qs.setFromEuler(shakeV));
    }
    nearCam.updateProjectionMatrix();
    nearCam.updateMatrixWorld(true);
    farCam.quaternion.copy(nearCam.quaternion);
    farCam.fov = nearCam.fov; farCam.aspect = aspect;
    farCam.updateProjectionMatrix();
    farCam.updateMatrixWorld(true);
    G.uCamRot.value.setFromMatrix4(nearCam.matrixWorld);
    const tanV = Math.tan(nearCam.fov * Math.PI / 360);
    G.uTan.value.set(tanV * aspect, tanV);
  }, -10);
  return null;
}

export function World() {
  const { gl } = useThree();
  const nebulaPass = useRef(null);
  const rig = useRef(null);
  const set = useMemo(() => {
    const noise = createNoiseVolume();
    G.uNoise.value = noise;
    const near = new THREE.PerspectiveCamera(38, 1.6, 0.6, 90000);
    interfaceBus.camera = near;
    return { farScene: new THREE.Scene(), nearScene: new THREE.Scene(), farCam: new THREE.PerspectiveCamera(38, 1.6, 1, 1e6), nearCam: near, noise };
  }, []);
  useEffect(() => () => set.noise.dispose(), [set]);
  useEffect(() => { if (window.__liftoff) window.__liftoff.scenes = { far: set.farScene, near: set.nearScene }; if (window.__liftoff) window.__liftoff.gl = gl; }, [set, gl]);
  useEffect(() => { gl.setClearColor(0x000000, 1); gl.toneMapping = THREE.NoToneMapping; gl.outputColorSpace = THREE.LinearSRGBColorSpace; }, [gl]);

  // Compile every shader before the curtain lifts, so no chapter stalls the first time it appears.
  const assetsReady = useUI((s) => s.assetsReady);
  useEffect(() => {
    if (!assetsReady) return undefined;
    let live = true;
    const hidden = [];
    const reveal = (scene) => scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    (async () => {
      try {
        reveal(set.farScene); reveal(set.nearScene);
        await gl.compileAsync(set.farScene, set.farCam);
        await gl.compileAsync(set.nearScene, set.nearCam);
        // Upload every texture now: a foil or solar-cell map first seen in orbit would otherwise stall that very frame.
        const seen = new Set();
        const up = (t) => { if (t?.isTexture && !seen.has(t)) { seen.add(t); gl.initTexture(t); } };
        for (const s of [set.farScene, set.nearScene]) s.traverse((o) => {
          const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
          for (const m of ms) { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap']) up(m[k]); if (m.uniforms) for (const u of Object.values(m.uniforms)) up(u.value); }
        });
        // And draw the whole film once, everything visible, into a tiny target. This uploads all geometry, so that the
        // moment the probe first appears is not also the moment its meshes go to the GPU.
        const tiny = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
        const prev = gl.getRenderTarget();
        const auto = gl.autoClear;
        // Frames ran while the compile was awaited, and each one re-hid whatever its progress says is hidden.
        reveal(set.farScene); reveal(set.nearScene);
        gl.setRenderTarget(tiny); gl.autoClear = true;
        gl.render(set.farScene, set.farCam);
        gl.render(set.nearScene, set.nearCam);
        gl.setRenderTarget(prev); gl.autoClear = auto;
        tiny.dispose();
      } catch (e) { console.warn('shader precompile skipped', e); }
      if (live) useUI.getState().set({ ready: true });
    })();
    return () => { live = false; };
  }, [assetsReady, gl, set]);

  // Textures for later chapters arrive after the curtain lifts. They go to the GPU as they land, not when first seen.
  const allAssets = useUI((s) => s.allAssets);
  useEffect(() => {
    if (!allAssets) return;
    for (const t of Object.values(assets.textures)) if (t?.isTexture) gl.initTexture(t);
  }, [allAssets, gl]);

  return (
    <>
      <PerformanceMonitor
        ms={500} iterations={6} threshold={0.8} flipflops={3}
        onChange={({ fps }) => {
          const q = useQuality.getState();
          if (!q.auto) return;
          const t = nextTier(q.tier, fps);
          if (t !== q.tier) q.autoStep(t);
        }}
      />
      <Director farCam={set.farCam} nearCam={set.nearCam} />
      {createPortal(<><Sky camera={set.farCam} /><Earth /><Moon /><GasGiant /><ArrivalPlanet /><Nebula passRef={nebulaPass} /></>, set.farScene)}
      {createPortal(<>
        <NearLights />
        <LaunchComplex />
        <Rocket rig={rig} />
        <EngineExhaust />
        <LaunchSmoke />
        <Sparks />
        <CloudPuffs />
        <TravelDust />
        <AsteroidField />
        <SpaceStation />
      </>, set.nearScene)}
      <RenderPipeline farScene={set.farScene} nearScene={set.nearScene} farCam={set.farCam} nearCam={set.nearCam} nebula={nebulaPass} />
    </>
  );
}
