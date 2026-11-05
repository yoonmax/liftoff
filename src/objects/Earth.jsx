import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import vert from '../shaders/common/fullscreen.vert.glsl?raw';
import util from '../shaders/common/util.glsl?raw';
import scatter from '../shaders/atmosphere/scatter.glsl?raw';
import earthFrag from '../shaders/planet/earth.frag.glsl?raw';
import { frame, track } from '../experience/ExperienceController.js';
import { EARTH_R } from '../camera/CameraController.js';
import { FULLSCREEN, G } from '../experience/Uniforms.js';
import { assets } from '../performance/AssetPreloader.js';
import { smoothstep } from '../animation/Interpolation.js';

const subscribe = (cb) => { assets.listeners.add(cb); return () => assets.listeners.delete(cb); };
const snapshot = () => assets.loaded.size;
export const useAssetsVersion = () => useSyncExternalStore(subscribe, snapshot);

/**
 * World to earth-fixed rotation that stands the launch site on +Y with east along +X. Fictional site, real coast.
 * The map's u = 0 is 180 degrees west, so a true longitude is offset by half a turn to reach texture space.
 */
function padBasis(latDeg, lonDeg) {
  const la = latDeg * Math.PI / 180, lo = (lonDeg + 180) * Math.PI / 180;
  const up = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo));
  const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), up).normalize().negate();
  // Local world axes: X east, Y up, Z south. The map's coordinates are left-handed (z grows with longitude), so true
  // south is up cross east here. Using east cross up instead would render a mirror image of the planet.
  const south = new THREE.Vector3().crossVectors(up, east);
  return new THREE.Matrix3().set(east.x, up.x, south.x, east.y, up.y, south.y, east.z, up.z, south.z);
}

export const ATMO_EARTH = {
  uBetaR: { value: new THREE.Vector3(36.95, 86.0, 210.9) },
  uBetaM: { value: 120 },
  uBetaO: { value: new THREE.Vector3(4.1, 12, 0.54) },
  uHR: { value: 0.00126 },
  uHM: { value: 0.00028 },
  uAtmoTop: { value: 0.0157 },
  uMieG: { value: 0.8 },
  uSunPower: { value: 22 },
  uTwilight: { value: 1 },
};

export function Earth() {
  const v = useAssetsVersion();
  const ref = useRef();
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: `precision highp float;\n${util}\n${scatter}\n${earthFrag}`,
    depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
    uniforms: {
      ...ATMO_EARTH,
      uCamRot: G.uCamRot, uTan: G.uTan, uNoise: G.uNoise, uTime: G.uTime, uRes: G.uRes, uSteps: G.uSteps, uLightSteps: G.uLightSteps,
      uCamDir: { value: new THREE.Vector3(0, 1, 0) }, uCamH: { value: 1e-6 }, uSun: { value: new THREE.Vector3() },
      uEarthRot: { value: padBasis(28.6, -80.6) }, uDay: { value: null }, uNight: { value: null }, uMask: { value: null }, uClouds: { value: null },
      uGain: { value: 1 }, uCloudDrift: { value: 0 }, uLoaded: { value: 1 },
    },
  }), []);
  useEffect(() => () => mat.dispose(), [mat]);

  useEffect(() => {
    const t = assets.textures, u = mat.uniforms;
    u.uDay.value = t.earthDay; u.uNight.value = t.earthNight; u.uMask.value = t.earthMask; u.uClouds.value = t.earthClouds;
  }, [v, mat]);

  useFrame(() => {
    const m = ref.current; if (!m) return;
    // Beyond the Moon, Earth is only a memory.
    const vis = 1 - smoothstep(0.65, 0.672, frame.p);
    m.visible = vis > 0;
    if (!m.visible) return;
    const u = mat.uniforms;
    u.uCamDir.value.copy(frame.cosmos).normalize();
    const dist = frame.cosmos.length();
    u.uCamH.value = Math.max(0.0018, dist - EARTH_R) / EARTH_R;
    u.uSun.value.copy(frame.sunDir);
    u.uGain.value = track.farGain * vis;
    u.uTwilight.value = 1 - smoothstep(0.222, 0.3, frame.p);
    u.uCloudDrift.value = G.uTime.value * 0.00022;
  });

  return <mesh ref={ref} geometry={FULLSCREEN} material={mat} frustumCulled={false} renderOrder={10} />;
}
