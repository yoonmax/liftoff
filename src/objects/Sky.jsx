import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import vert from '../shaders/common/fullscreen.vert.glsl?raw';
import skyFrag from '../shaders/planet/sky.frag.glsl?raw';
import util from '../shaders/common/util.glsl?raw';
import { starsVert, starsFrag } from '../shaders/planet/stars.glsl.js';
import { frame, track } from '../experience/ExperienceController.js';
import { FULLSCREEN, G } from '../experience/Uniforms.js';
import { clamp, smoothstep } from '../animation/Interpolation.js';

const milkyFrag = /* glsl */`
precision highp float;
${util}
uniform mat3 uFace;
varying vec2 vUv;
void main() {
  vec3 rd = normalize(uFace * vec3(vUv * 2.0 - 1.0, 1.0));
  vec3 gn = normalize(vec3(0.42, 0.72, -0.55));
  float lat = dot(rd, gn);
  vec3 tang = normalize(cross(gn, vec3(0.0, 0.0, 1.0)));
  float along = dot(rd, tang);
  float bulge = exp(-pow((along - 0.72) / 0.42, 2.0));
  float w = 0.07 + 0.16 * bulge;
  float band = exp(-(lat * lat) / (w * w));
  float clouds = fbm3(rd * 1.9 + 3.1) * 0.55 + fbm3(rd * 5.3) * 0.3 + fbm3(rd * 13.0) * 0.15;
  float lanes = smoothstep(0.42, 0.62, fbm3(rd * 3.7 + vec3(lat * 2.0, 0.0, 1.0)) + 0.05);
  float dust = 1.0 - lanes * exp(-(lat * lat) / (w * w * 0.25)) * 0.82;
  float glow = band * (0.34 + clouds * 0.9) * dust;
  vec3 c = mix(vec3(0.22, 0.27, 0.36), vec3(0.62, 0.53, 0.44), bulge);
  // a little faint unresolved starlight everywhere, so deep space isn't a pure void
  vec3 col = c * glow * 0.04 + vec3(0.00045, 0.00055, 0.0009) * (0.5 + clouds);
  gl_FragColor = vec4(col, 1.0);
}`;

function bakeMilky(gl) {
  const size = 512;
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const mat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy,0.0,1.0); }`,
    fragmentShader: milkyFrag, depthTest: false, depthWrite: false, uniforms: { uFace: { value: new THREE.Matrix3() }, uNoise: G.uNoise },
  });
  const scene = new THREE.Scene(); const tri = new THREE.Mesh(FULLSCREEN, mat); tri.frustumCulled = false; scene.add(tri);
  const cam = new THREE.Camera();
  const faces = [ // cube face bases: right, up (flipped for cube orientation), forward
    [[0, 0, -1], [0, -1, 0], [1, 0, 0]], [[0, 0, 1], [0, -1, 0], [-1, 0, 0]], [[1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, -1, 0]], [[1, 0, 0], [0, -1, 0], [0, 0, 1]], [[-1, 0, 0], [0, -1, 0], [0, 0, -1]],
  ];
  const prevAuto = gl.autoClear; gl.autoClear = true;
  faces.forEach((f, i) => {
    mat.uniforms.uFace.value.set(f[0][0], f[1][0], f[2][0], f[0][1], f[1][1], f[2][1], f[0][2], f[1][2], f[2][2]);
    gl.setRenderTarget(rt, i);
    gl.render(scene, cam);
  });
  gl.setRenderTarget(null); gl.autoClear = prevAuto;
  mat.dispose();
  return rt;
}

function makeStars(count) {
  let s = 77; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pos = new Float32Array(count * 3), mag = new Float32Array(count), tint = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    pos.set([r * Math.cos(a), r * Math.sin(a), z], i * 3);
    const m = Math.pow(rnd(), 9); mag[i] = 0.05 + m * 2.4 + rnd() * 0.08;
    const t = rnd();
    const c = t < 0.15 ? [1.0, 0.8, 0.62] : t < 0.3 ? [0.75, 0.86, 1.0] : [0.96, 0.97, 1.0];
    tint.set(c, i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  return g;
}

export function Sky({ camera }) {
  const { gl } = useThree();
  const stuff = useMemo(() => {
    const milky = bakeMilky(gl);
    const sky = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: skyFrag, depthTest: false, depthWrite: false,
      uniforms: { uCamRot: G.uCamRot, uTan: G.uTan, uMilky: { value: milky.texture }, uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uSkyGain: { value: 1 }, uSunVis: { value: 0 } },
    });
    const stars = new THREE.ShaderMaterial({
      vertexShader: starsVert, fragmentShader: starsFrag, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
      uniforms: { uViewRot: { value: new THREE.Matrix3() }, uProj: { value: new THREE.Matrix4() }, uPx: G.uPx, uTime: G.uTime, uTwinkle: { value: 0 }, uGain: { value: 1 } },
    });
    return { milky, sky, stars, starGeo: makeStars(9000) };
  }, [gl]);
  useEffect(() => () => { stuff.milky.dispose(); stuff.sky.dispose(); stuff.stars.dispose(); stuff.starGeo.dispose(); }, [stuff]);

  const m4 = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const u = stuff.sky.uniforms, a = frame.cameraAltitude;
    u.uSun.value.copy(frame.sunDir);
    u.uSunColor.value.copy(frame.sunColor);
    u.uSunVis.value = 1;
    // Exposure adapts upward on the ground, downward once sunlight arrives; the sky obeys the same camera.
    u.uSkyGain.value = track.farGain * 1.0;
    m4.copy(camera.matrixWorldInverse);
    stuff.stars.uniforms.uViewRot.value.setFromMatrix4(m4);
    stuff.stars.uniforms.uProj.value.copy(camera.projectionMatrix);
    stuff.stars.uniforms.uTwinkle.value = 1 - smoothstep(30, 120, a);
    // The rising sun washes faint stars out of a real exposure; this is what the eye expects too.
    const sunUp = smoothstep(0.33, 0.372, frame.p) * (1 - smoothstep(0.62, 0.66, frame.p));
    // In the blue hour only the brightest stars are out yet; they come up as the sky goes black on the way out.
    const dusk = 1 - smoothstep(0.215, 0.29, frame.p);
    stuff.stars.uniforms.uGain.value = clamp(1.25 * (1 - sunUp * 0.78) * (1 - dusk * 0.72));
  });

  return (
    <group>
      <mesh geometry={FULLSCREEN} material={stuff.sky} frustumCulled={false} renderOrder={0} />
      <points geometry={stuff.starGeo} material={stuff.stars} frustumCulled={false} renderOrder={1} />
    </group>
  );
}
