import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import compositeFrag from '../shaders/transition/composite.frag.glsl?raw';
import { track, frame } from '../experience/ExperienceController.js';
import { FULLSCREEN, G } from '../experience/Uniforms.js';
import { QUALITY, useQuality } from '../performance/QualityManager.js';
import { interfaceBus } from '../interface/interfaceBus.js';
import { useUI } from '../interface/useUI.js';
import { createGrade, createLens, gradeAt, lensLight } from '../experience/Grade.js';

const mInset = new THREE.Matrix4(), zero = new THREE.Vector3(), upInset = new THREE.Vector3();

const quadVert = /* glsl */`varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Jimenez dual filter: wide, stable bloom from a mip chain instead of a large gaussian.
const downFrag = /* glsl */`
precision highp float; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uFirst; varying vec2 vUv;
vec3 tap(vec2 o){
  vec3 c = texture2D(uSrc, vUv + o * uTexel).rgb;
  if (uFirst > 0.5) {
    // A soft knee keeps blacks black: only real highlights bloom, so the frame never goes milky.
    c = min(c, vec3(18.0));
    float l = max(c.r, max(c.g, c.b));
    c *= smoothstep(0.32, 1.25, l);
  }
  return c;
}
void main(){
  vec3 c = tap(vec2(0.0)) * 0.125;
  c += (tap(vec2(-2.0, 2.0)) + tap(vec2(2.0, 2.0)) + tap(vec2(-2.0, -2.0)) + tap(vec2(2.0, -2.0))) * 0.03125;
  c += (tap(vec2(-2.0, 0.0)) + tap(vec2(2.0, 0.0)) + tap(vec2(0.0, 2.0)) + tap(vec2(0.0, -2.0))) * 0.0625;
  c += (tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0)) + tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0))) * 0.125;
  gl_FragColor = vec4(c, 1.0);
}`;
const upFrag = /* glsl */`
precision highp float; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uWeight; varying vec2 vUv;
void main(){
  vec3 c = texture2D(uSrc, vUv).rgb * 4.0;
  c += (texture2D(uSrc, vUv + vec2(-1.0, 0.0) * uTexel).rgb + texture2D(uSrc, vUv + vec2(1.0, 0.0) * uTexel).rgb + texture2D(uSrc, vUv + vec2(0.0, 1.0) * uTexel).rgb + texture2D(uSrc, vUv + vec2(0.0, -1.0) * uTexel).rgb) * 2.0;
  c += texture2D(uSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture2D(uSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb + texture2D(uSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb + texture2D(uSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  gl_FragColor = vec4(c / 16.0 * uWeight, 1.0);
}`;
// Light shafts: a radial blur of the frame's highlights towards the light. Anything dark in front of it, a limb, a
// rocket, a slab of the gate, cuts a shadow through the rays by itself.
const shaftFrag = /* glsl */`
precision highp float; uniform sampler2D uSrc; uniform vec2 uLight; uniform float uJit; varying vec2 vUv;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  const int N = 30;
  vec2 st = (uLight - vUv) * 0.92 / float(N);
  vec2 uv = vUv + st * ign(gl_FragCoord.xy + uJit);
  vec3 c = vec3(0.0); float w = 1.0;
  for (int i = 0; i < N; i++) {
    vec3 s = texture2D(uSrc, uv).rgb;
    s = max(s - vec3(0.9), vec3(0.0));
    c += min(s, vec3(6.0)) * w;
    w *= 0.955; uv += st;
  }
  gl_FragColor = vec4(c / float(N), 1.0);
}`;
// Anamorphic streak: highlights smeared sideways only, in a few widening passes.
const streakFrag = /* glsl */`
precision highp float; uniform sampler2D uSrc; uniform float uStride, uKnee; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 c = vec3(0.0); float t = 0.0;
  for (int i = -3; i <= 3; i++) {
    float f = float(i), w = exp(-f * f * 0.22);
    vec3 s = texture2D(uSrc, vUv + vec2(f * uStride * uTexel.x, 0.0)).rgb;
    if (uKnee > 0.0) s = max(s - vec3(uKnee), vec3(0.0));
    c += s * w; t += w;
  }
  gl_FragColor = vec4(c / t, 1.0);
}`;

const makeRT = (w, h, samples = 0) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: samples >= 0, samples: Math.max(samples, 0), stencilBuffer: false });

/** Two-layer HDR frame: cosmos, then the metre-scale set over a cleared depth buffer, then bloom and grade. */
export function RenderPipeline({ farScene, nearScene, farCam, nearCam, nebula }) {
  const { gl, size, viewport } = useThree();
  const tier = useQuality((s) => s.tier);
  const q = QUALITY[tier];

  const res = useMemo(() => {
    const scene = new THREE.Scene(), cam = new THREE.Camera();
    const down = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: downFrag, depthTest: false, depthWrite: false, uniforms: { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } } });
    const up = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: upFrag, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, uniforms: { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } } });
    const composite = new THREE.ShaderMaterial({
      vertexShader: quadVert, fragmentShader: compositeFrag, depthTest: false, depthWrite: false,
      uniforms: {
        uHdr: { value: null }, uBloom: { value: null }, uShaft: { value: null }, uStreak: { value: null }, uBloomGain: { value: 1 }, uShaftGain: { value: 0 }, uStreakGain: { value: 0 }, uTime: G.uTime, uRes: G.uRes,
        uSat: { value: 1 }, uContrast: { value: 1 }, uExposure: { value: 1 }, uLens: { value: new THREE.Vector3() }, uLensTint: { value: new THREE.Color(1, 1, 1) }, uShadowTint: { value: new THREE.Vector3(1, 1, 1) }, uHighTint: { value: new THREE.Vector3(1, 1, 1) },
        uGrain: { value: 1 }, uVeil: { value: new THREE.Vector4(1, 1, 1, 0) }, uHeatA: { value: new THREE.Vector2() }, uHeatB: { value: new THREE.Vector2() }, uHeat: { value: 0 }, uAspect: { value: 1 }, uCA: { value: 1 }, uNoise: G.uNoise,
      },
    });
    const blit = new THREE.ShaderMaterial({
      vertexShader: quadVert, depthTest: false, depthWrite: false, uniforms: { uTex: { value: null } },
      fragmentShader: `precision highp float; uniform sampler2D uTex; varying vec2 vUv;
        void main(){ vec3 x = texture2D(uTex, vUv).rgb; x = clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); gl_FragColor = vec4(pow(x, vec3(1.0/2.2)),1.0); }`,
    });
    const shaft = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: shaftFrag, depthTest: false, depthWrite: false, uniforms: { uSrc: { value: null }, uLight: { value: new THREE.Vector2() }, uJit: { value: 0 } } });
    const streak = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: streakFrag, depthTest: false, depthWrite: false, uniforms: { uSrc: { value: null }, uStride: { value: 2 }, uKnee: { value: 0 }, uTexel: { value: new THREE.Vector2() } } });
    const tri = new THREE.Mesh(FULLSCREEN, down); tri.frustumCulled = false; scene.add(tri);
    return { scene, cam, tri, down, up, composite, blit, shaft, streak, grade: createGrade(), lens: createLens() };
  }, []);

  const targets = useMemo(() => {
    const dpr = gl.getPixelRatio();
    const w = Math.max(2, Math.floor(size.width * dpr)), h = Math.max(2, Math.floor(size.height * dpr));
    const hdr = makeRT(w, h, q.msaa);
    const chain = [];
    let cw = w, ch = h;
    for (let i = 0; i < q.bloomLevels; i++) { cw = Math.max(2, cw >> 1); ch = Math.max(2, ch >> 1); const rt = makeRT(cw, ch, 0); rt.depthBuffer = false; chain.push(rt); }
    G.uRes.value.set(w, h);
    const inset = makeRT(512, 512, 0);
    const small = (cw2, ch2) => { const rt = makeRT(Math.max(2, cw2), Math.max(2, ch2), 0); rt.depthBuffer = false; return rt; };
    const shaft = small(w >> 2, h >> 2);
    const streakA = small(w >> 2, h >> 3), streakB = small(w >> 2, h >> 3);
    return { hdr, chain, w, h, inset, shaft, streakA, streakB };
  }, [gl, size.width, size.height, viewport.dpr, q.msaa, q.bloomLevels]);

  // Render targets allocate on first bind. Bind the ones that only get used later now, not the moment the sun comes up.
  useEffect(() => {
    const prev = gl.getRenderTarget();
    for (const t of [targets.shaft, targets.streakA, targets.streakB, targets.inset]) { gl.setRenderTarget(t); gl.clear(true, false, false); }
    gl.setRenderTarget(prev);
  }, [gl, targets]);
  useEffect(() => () => { targets.hdr.dispose(); targets.inset.dispose(); targets.chain.forEach((t) => t.dispose()); targets.shaft.dispose(); targets.streakA.dispose(); targets.streakB.dispose(); }, [targets]);
  useEffect(() => () => { res.down.dispose(); res.up.dispose(); res.composite.dispose(); res.blit.dispose(); res.shaft.dispose(); res.streak.dispose(); }, [res]);

  // The post passes are not in any scene, so the shader precompile would miss them: compile them here. A pass used for the
  // first time halfway through the film would otherwise stall the frame in which the sun first clears the limb.
  useEffect(() => {
    // Some drivers only finish linking at the first draw, so each pass actually draws once, into a tiny target.
    const before = res.tri.material, tiny = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(tiny);
    for (const m of [res.down, res.up, res.composite, res.blit, res.shaft, res.streak]) { res.tri.material = m; gl.render(res.scene, res.cam); }
    gl.setRenderTarget(prev);
    tiny.dispose();
    res.tri.material = before;
  }, [gl, res]);

  useFrame(() => {
    const { hdr, chain } = targets;
    gl.autoClear = false;

    if (nebula?.current) nebula.current(gl);

    gl.setRenderTarget(hdr);
    gl.clear(true, true, false);
    gl.render(farScene, farCam);
    gl.clearDepth();
    gl.render(nearScene, nearCam);

    // bloom: downsample
    let src = hdr.texture, sw = hdr.width, sh = hdr.height;
    res.tri.material = res.down;
    for (let i = 0; i < chain.length; i++) {
      res.down.uniforms.uSrc.value = src;
      res.down.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      res.down.uniforms.uFirst.value = i === 0 ? 1 : 0;
      gl.setRenderTarget(chain[i]);
      gl.render(res.scene, res.cam);
      src = chain[i].texture; sw = chain[i].width; sh = chain[i].height;
    }
    // Everything the lens does comes off the same highlights, read before the bloom chain folds them together.
    gradeAt(frame.p, res.grade);
    lensLight(frame, track, nearCam, interfaceBus.gatePos, res.lens);
    const lens = res.lens, c = res.composite.uniforms;
    const shaftGain = track.shafts * lens.vis;
    if (shaftGain > 0.002 && q.shafts) {
      res.tri.material = res.shaft;
      res.shaft.uniforms.uSrc.value = chain[1].texture;
      res.shaft.uniforms.uLight.value.copy(lens.uv);
      res.shaft.uniforms.uJit.value = (frame.p * 613.7) % 17;
      gl.setRenderTarget(targets.shaft);
      gl.render(res.scene, res.cam);
    }
    if (q.streak) {
      res.tri.material = res.streak;
      const st = res.streak.uniforms, base = chain[Math.min(1, chain.length - 1)];
      let from = base.texture;
      [[2.2, 1.3], [8, 0], [28, 0]].forEach(([stride, knee], i) => {
        const to = i % 2 === 0 ? targets.streakA : targets.streakB;
        st.uSrc.value = from; st.uStride.value = stride; st.uKnee.value = knee;
        st.uTexel.value.set(1 / to.width, 1 / to.height);
        gl.setRenderTarget(to); gl.render(res.scene, res.cam);
        from = to.texture;
      });
    }

    // bloom: upsample, additively, back to the first mip. The widest levels are held back so that a bright sun gives
    // a clean glow rather than lifting the whole frame to grey.
    res.tri.material = res.up;
    for (let i = chain.length - 1; i > 0; i--) {
      res.up.uniforms.uSrc.value = chain[i].texture;
      res.up.uniforms.uWeight.value = i >= 4 ? 0.42 : i === 3 ? 0.62 : 0.86;
      res.up.uniforms.uTexel.value.set(1 / chain[i].width, 1 / chain[i].height);
      gl.setRenderTarget(chain[i - 1]);
      gl.render(res.scene, res.cam);
    }

    // composite
    c.uHdr.value = hdr.texture;
    c.uShaft.value = targets.shaft.texture;
    c.uStreak.value = targets.streakA.texture;
    c.uShaftGain.value = q.shafts ? shaftGain * 0.34 : 0;
    c.uStreakGain.value = q.streak ? 0.055 : 0;
    c.uLens.value.set(lens.uv.x, lens.uv.y, lens.vis * Math.min(1, track.shafts * 1.5));
    c.uLensTint.value.copy(lens.tint);
    c.uSat.value = res.grade.sat; c.uContrast.value = res.grade.contrast; c.uExposure.value = res.grade.exposure;
    c.uShadowTint.value.copy(res.grade.shadow); c.uHighTint.value.copy(res.grade.high);
    c.uBloom.value = chain[0].texture;
    c.uBloomGain.value = track.bloom;
    c.uGrain.value = q.grain * track.grain;
    c.uAspect.value = frame.aspect;
    const whiteMix = track.whiteout;
    const beginAgain = interfaceBus.veil;
    c.uVeil.value.set(
      beginAgain > 0 ? 0.0012 : 1.0,
      beginAgain > 0 ? 0.002 : 0.97,
      beginAgain > 0 ? 0.0045 : 0.9,
      Math.max(whiteMix, beginAgain),
    );
    c.uHeat.value = interfaceBus.heat.amount;
    c.uHeatA.value.copy(interfaceBus.heat.a);
    c.uHeatB.value.copy(interfaceBus.heat.b);
    res.tri.material = res.composite;
    gl.setRenderTarget(null);
    gl.render(res.scene, res.cam);

    // Optional lunar close-up: the same Moon shader through a long lens, drawn into a small window of the frame.
    const inset = useUI.getState().inset;
    const moonMat = interfaceBus.moonMaterial;
    if (inset && inset.dir && moonMat) {
      const savedRot = G.uCamRot.value.clone(), savedTan = G.uTan.value.clone();
      mInset.lookAt(zero, inset.dir, upInset.set(0, 1, 0));
      G.uCamRot.value.setFromMatrix4(mInset);
      G.uTan.value.set(0.05, 0.05);
      const uPix = moonMat.uniforms.uPixel.value;
      moonMat.uniforms.uPixel.value = 0.1 / targets.inset.height;
      res.tri.material = moonMat;
      gl.setRenderTarget(targets.inset);
      gl.clear(true, false, false);
      gl.render(res.scene, res.cam);
      moonMat.uniforms.uPixel.value = uPix;
      G.uCamRot.value.copy(savedRot); G.uTan.value.copy(savedTan);
      gl.setRenderTarget(null);
      const dpr = gl.getPixelRatio();
      const sidePx = Math.min(size.width, size.height) * 0.26 * dpr;
      const x = size.width * 0.54 * dpr, y = (size.height - size.height * 0.1) * dpr - sidePx;
      res.blit.uniforms.uTex.value = targets.inset.texture;
      res.tri.material = res.blit;
      gl.setViewport(x / dpr, y / dpr, sidePx / dpr, sidePx / dpr);
      gl.render(res.scene, res.cam);
      gl.setViewport(0, 0, size.width, size.height);
    }
  }, 1);

  return null;
}
