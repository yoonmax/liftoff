import * as THREE from 'three';
import { SHOTS } from './SplinePaths.js';
import { framingFor } from './FramingPresets.js';
import { clamp, lerp, smoothstep, smootherstep, monotoneCurve } from '../animation/Interpolation.js';

// Pure mapping from timeline channels to the state of the whole film for one instant. It never reads the
// previous frame, so the picture depends only on progress and aspect ratio.

export const PAD_DECK = 8.4;
export const EARTH_R = 6371;
export const MOON_R = 1737;
export const GIANT_R = 60000;
export const ARRIVAL_R = 9000;

const n = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
export const MOON_POS = n(0.42, 0.3, -0.86).multiplyScalar(72000);
export const SUN_A = n(Math.cos(15 * Math.PI / 180), -Math.sin(15 * Math.PI / 180), 0.08);
// On the pad it is blue hour; by the time the sky has gone black the sun is back where the sunrise on the limb needs it.
const SUN_DAWN = n(Math.cos(8.2 * Math.PI / 180), -Math.sin(8.2 * Math.PI / 180), 0.08);
export const SUN_B = n(0.74, 0.27, 0.62);
export const SUN_C = n(0.0, 0.1, -1.0);
// Behind the white, the star is just clearing the horizon of the new world: the film ends on the sunrise it began for.
const SUN_D = n(0.0, -0.405, -1.0);
export const GIANT_POS = new THREE.Vector3(-3.8e6, 1.4e6, -8.2e6);
export const RING_NORMAL = n(0.16, 0.96, 0.22);
export const ARRIVAL_POS = new THREE.Vector3(-3.6e6, 1.2e6, -2.4e7);

// altitude (km) against progress
const ALT = monotoneCurve(
  [0.183, 0.195, 0.21, 0.225, 0.24, 0.255, 0.27, 0.285, 0.3, 0.32, 0.34, 0.36, 0.375, 0.4, 0.43, 0.46, 0.5, 0.56],
  [0, 0.018, 0.12, 0.55, 2.2, 6, 12, 22, 38, 68, 108, 165, 240, 420, 780, 1350, 2300, 3600],
);
const DOWNRANGE = monotoneCurve(
  [0.24, 0.3, 0.34, 0.37, 0.4, 0.45, 0.5, 0.56],
  [0, 1.8, 5.2, 10, 20, 42, 66, 80],
);
export const altitudeKm = ALT;

// The low lunar pass runs along a great circle towards Earth, placed so the sun sits about 7 degrees above the local
// horizon. Long shadows, and Earth rises over the limb during the pass.
const moonFrame = (() => {
  const a = MOON_POS.clone().negate().normalize(), s = SUN_A.clone();
  const c = a.dot(s), wantA = 0.2, wantS = 0.19;
  const det = 1 - c * c;
  const alpha = (wantA - c * wantS) / det, beta = (wantS - c * wantA) / det;
  const inPlane = a.clone().multiplyScalar(alpha).addScaledVector(s, beta);
  const cross = new THREE.Vector3().crossVectors(a, s);
  const start = inPlane.addScaledVector(cross, Math.sqrt(Math.max(0, 1 - inPlane.lengthSq())) / cross.length()).normalize();
  const axis = new THREE.Vector3().crossVectors(start, a).normalize();
  return { start, axis };
})();

const giantBasis = (() => {
  const y = RING_NORMAL.clone();
  const x = new THREE.Vector3(1, 0, 0).addScaledVector(y, -y.x).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z);
})();
// Camera route around the ringed planet in units of its radius, in the ring-plane frame.
const GIANT_ROUTE = new THREE.CatmullRomCurve3([
  [62, 30, 94], [32, 16, 50], [14, 7.2, 22], [6.6, 3.1, 10.2], [3.7, 1.25, 5.5], [2.5, 0.42, 3.4], [1.86, 0.02, 2.5],
  [0.95, -0.72, 2.7], [-0.75, -1.2, 2.6], [-2.2, -1.5, 1.6], [-3.1, -1.5, -0.9], [-3.6, -1.46, -3.1], [-6, -2.3, -5.2], [-11, -4, -9.2], [-24, -8.5, -20],
].map((a) => new THREE.Vector3(a[0], a[1], a[2]).applyMatrix4(giantBasis)), false, 'centripetal');

const qTmp = new THREE.Quaternion(), qA = new THREE.Quaternion(), vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vD = new THREE.Vector3();
const mTmp = new THREE.Matrix4(), eul = new THREE.Euler(), Y = new THREE.Vector3(0, 1, 0);
const EARTH_POS = new THREE.Vector3(0, 0, 0);
const arcA = new THREE.Vector3(), moonAnchor = new THREE.Vector3(), giantAnchor = new THREE.Vector3(), arrivalAnchor = new THREE.Vector3();

export function createFrame() {
  return {
    p: 0, aspect: 1.6, shotId: 'hero',
    nearPos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 38,
    cosmos: new THREE.Vector3(), // camera position, km, with Earth at the origin
    altitude: 0, cameraAltitude: 0.002, downrange: 0,
    rocketPos: new THREE.Vector3(), rocketQuat: new THREE.Quaternion(), rocketDir: new THREE.Vector3(0, 1, 0), anchor: new THREE.Vector3(),
    sunDir: SUN_A.clone(), sunColor: new THREE.Color(1, 0.97, 0.93),
    speedKms: 0,
  };
}

const keyed = (arr, u) => {
  if (arr.length === 2) return lerp(arr[0], arr[1], u);
  const x = clamp(u) * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(x)), t = x - i;
  const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(arr.length - 1, i + 2)];
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
};

function bodyPos(name) {
  if (name === 'moon') return MOON_POS;
  if (name === 'giant') return GIANT_POS;
  if (name === 'arrival') return ARRIVAL_POS;
  return EARTH_POS;
}
const bodyR = (name) => (name === 'moon' ? MOON_R : name === 'giant' ? GIANT_R : name === 'arrival' ? ARRIVAL_R : EARTH_R);

const pivotA = new THREE.Vector3(), pivotB = new THREE.Vector3(), pivotAxis = new THREE.Vector3();
const radial = new THREE.Vector3(), heading = new THREE.Vector3(), lookV = new THREE.Vector3(), upV = new THREE.Vector3(), rightV = new THREE.Vector3(), trueUp = new THREE.Vector3();

/** Sets lookV and upV for a composed shot. */
function composedLook(s, u, f) {
  if (s.look === 'dir') { lookV.set(s.dir[0], s.dir[1], s.dir[2]).normalize(); upV.set(0, 1, 0); return; }
  if (s.look === 'pivot') {
    // The camera swings around the subject from one body to the other, and the whole sky turns behind it.
    const k = smootherstep(s.pivot[0], s.pivot[1], u);
    pivotA.copy(bodyPos(s.bodyA)).sub(f.cosmos).normalize();
    pivotB.copy(bodyPos(s.bodyB)).sub(f.cosmos).normalize();
    pivotAxis.crossVectors(pivotA, pivotB);
    if (pivotAxis.lengthSq() < 1e-6) pivotAxis.set(0, 1, 0);
    pivotAxis.normalize();
    const ang = Math.acos(clamp(pivotA.dot(pivotB), -1, 1));
    lookV.copy(pivotA).applyAxisAngle(pivotAxis, ang * k);
    upV.set(s.upFixed[0], s.upFixed[1], s.upFixed[2]).normalize();
    return;
  }
  if (s.look === 'body') {
    lookV.copy(bodyPos(s.body)).sub(f.cosmos).normalize();
    if (s.upFixed) upV.set(s.upFixed[0], s.upFixed[1], s.upFixed[2]).normalize(); else upV.set(0, 1, 0);
    return;
  }
  // horizon: stand on a body, look along the surface towards something, with the limb a set angle below centre
  radial.copy(f.cosmos).sub(bodyPos(s.body));
  const dist = radial.length(); radial.divideScalar(dist);
  const dip = Math.acos(Math.min(1, bodyR(s.body) / dist));
  if (s.toward === 'east') heading.set(Math.cos(f.downrange), -Math.sin(f.downrange), 0);
  else if (s.toward === 'sun') heading.copy(f.sunDir);
  else heading.copy(bodyPos(s.toward)).sub(f.cosmos).normalize();
  heading.addScaledVector(radial, -heading.dot(radial)).normalize();
  heading.applyAxisAngle(radial, lerp(s.az[0], s.az[1], u) * Math.PI / 180);
  const el = lerp(s.above[0], s.above[1], u) * Math.PI / 180 - dip;
  lookV.copy(heading).multiplyScalar(Math.cos(el)).addScaledVector(radial, Math.sin(el));
  upV.copy(radial);
}

function poseOf(s, p, f, track, framing, out) {
  const u = clamp((p - s.from) / (s.to - s.from));
  out.u = u;
  // A long lens zooms in ratios, not degrees: an eased path keeps the subject growing at a steady rate on screen.
  out.fov = (s.fovEase ? s.fov[0] * Math.pow(s.fov[1] / s.fov[0], Math.pow(u, s.fovEase)) : lerp(s.fov[0], s.fov[1], u)) + framing.fovAdd;
  out.roll = keyed(s.roll, u) * Math.PI / 180;
  out.comp = s.comp;
  if (s.look) {
    composedLook(s, u, f);
    const halfV = out.fov * Math.PI / 360, tanV = Math.tan(halfV), tanH = tanV * f.aspect;
    const dist = keyed(s.rocket.dist, u) * (s.rocket.dist[1] < 0 ? 1 : framing.h);
    rightV.crossVectors(lookV, upV).normalize();
    trueUp.crossVectors(rightV, lookV);
    const x = keyed(s.rocket.x, u) * framing.compX, y = keyed(s.rocket.y, u);
    const reach = Math.max(Math.abs(dist), 40);
    out.pos.copy(f.anchor).addScaledVector(lookV, -dist).addScaledVector(rightV, -x * reach * tanH).addScaledVector(trueUp, -y * reach * tanV);
    return out;
  }
  s.cam.at(u, vA);
  const k = s.fit === 'v' ? framing.v : framing.h;
  if (s.space === 'rocket') vA.multiplyScalar(k).add(f.anchor);
  else vA.multiplyScalar(k);
  out.pos.copy(vA);
  return out;
}

const poseA = { pos: new THREE.Vector3() }, poseB = { pos: new THREE.Vector3() };

function orient(s, pose, f, framing, out) {
  if (s.look) {
    composedLook(s, pose.u, f);
    vB.copy(lookV); vC.copy(upV);
    if (s.offset) { // nudges a body off-centre
      mTmp.lookAt(vA.set(0, 0, 0), vB, vC);
      out.setFromRotationMatrix(mTmp);
      const halfV = pose.fov * Math.PI / 360, halfH = Math.atan(Math.tan(halfV) * f.aspect);
      eul.set(s.offset[1] * halfV, -s.offset[0] * framing.compX * halfH, pose.roll);
      return out.multiply(qTmp.setFromEuler(eul));
    }
  } else if (s.aimTrack) {
    // From the blended camera position, so a dissolve between shots never loses sight of the subject.
    vB.copy(f.rocketPos).addScaledVector(f.rocketDir, s.aimTrack.y).sub(f.nearPos).normalize();
    vC.set(s.up[0], s.up[1], s.up[2]).normalize();
  } else {
    s.aimC.at(pose.u, vB);
    if (s.space === 'rocket') vB.add(f.anchor);
    vB.sub(f.nearPos).normalize();
    vC.set(s.up[0], s.up[1], s.up[2]).normalize();
  }
  mTmp.lookAt(vA.set(0, 0, 0), vB, vC);
  out.setFromRotationMatrix(mTmp);
  // composition offset: moves the subject by a fraction of the half-frame
  const halfV = pose.fov * Math.PI / 360, halfH = Math.atan(Math.tan(halfV) * f.aspect);
  const narrowY = s.narrowY ? s.narrowY * framing.compY : 0;
  eul.set((pose.comp[1] + narrowY) * halfV, pose.comp[0] * framing.compX * halfH, pose.roll);
  out.multiply(qTmp.setFromEuler(eul));
  return out;
}

export function computeFrame(track, p, aspect, f) {
  f.p = p; f.aspect = aspect;
  const framing = framingFor(aspect);

  // ---- vehicle
  const alt = ALT(p);
  f.altitude = alt;
  f.downrange = DOWNRANGE(p) * Math.PI / 180;
  // Past the turn the vehicle flies along its orbit, so its attitude follows the curve of the Earth.
  const pitch = track.pitch + f.downrange * smoothstep(0.37, 0.44, p);
  const lookMoon = smoothstep(0.5, 0.56, p);
  const lookOn = smoothstep(0.6, 0.67, p);
  // Pitch tilts the stack east; later it points along whatever the journey is heading towards.
  f.rocketDir.set(Math.sin(pitch), Math.cos(pitch), 0).normalize();
  if (lookMoon > 0) { vA.copy(MOON_POS).normalize(); f.rocketDir.lerp(vA, lookMoon).normalize(); }
  if (lookOn > 0) f.rocketDir.lerp(vA.set(0, 0, -1), lookOn).normalize();
  f.rocketPos.set(0, PAD_DECK + Math.min(alt * 1000, 60000), 0);
  f.rocketQuat.setFromUnitVectors(Y, f.rocketDir);
  // A slow roll sets the solar wings level with the horizon for the deep-space shots.
  if (track.roll > 0) f.rocketQuat.multiply(qTmp.setFromAxisAngle(Y, track.roll));
  // The focus point slides from the middle of the full stack to the upper stage after separation.
  f.anchor.copy(f.rocketPos).addScaledVector(f.rocketDir, lerp(39, 66, track.centerShift));

  // ---- the sun: one star near Earth and the Moon, another out past the giant, a third at the destination
  f.sunDir.copy(SUN_DAWN).lerp(SUN_A, smoothstep(0.2, 0.285, p)).lerp(SUN_B, track.sunSwap).lerp(SUN_C, track.sunSwap2).lerp(SUN_D, track.closing).normalize();
  f.sunColor.setRGB(1, lerp(0.965, 0.9, track.sunSwap2), lerp(0.92, 0.78, track.sunSwap2));

  // ---- camera position in the cosmos (the vehicle's, since a few hundred metres mean nothing at this scale)
  const th = f.downrange;
  const r = EARTH_R + alt;
  arcA.set(Math.sin(th) * r, Math.cos(th) * r, 0);
  f.cosmos.copy(arcA);
  if (track.toMoon > 0) {
    const pass = track.lunarPass;
    const ang = lerp(-0.26, 0.42, pass);
    const lowAlt = lerp(1500, 34, smoothstep(0, 0.4, pass)) + lerp(0, 900, smoothstep(0.68, 1, pass));
    moonAnchor.copy(moonFrame.start).applyAxisAngle(moonFrame.axis, ang).multiplyScalar(MOON_R + lowAlt).add(MOON_POS);
    f.cosmos.lerp(moonAnchor, track.toMoon);
  }
  if (track.toBelt > 0 || track.giantPath > 0) {
    GIANT_ROUTE.getPoint(track.giantPath, giantAnchor).multiplyScalar(GIANT_R).add(GIANT_POS);
    // Leave the Moon on an arc: a straight line to the giant would pass through it.
    if (track.toBelt < 1) f.cosmos.addScaledVector(arcA.copy(moonAnchor).sub(MOON_POS).normalize(), 2.6e6 * Math.sin(track.toBelt * Math.PI));
    f.cosmos.lerp(giantAnchor, track.toBelt);
  }
  const arrivalW = smoothstep(0.82, 0.868, p);
  if (arrivalW > 0) {
    // low over an unknown world, flying towards its star; behind the white, the camera settles lower still
    const fly = track.approach;
    const lift = lerp(lerp(1700, 760, fly), 1000, track.closing);
    arrivalAnchor.set(0, ARRIVAL_R + lift, lerp(4200, -600, fly)).add(ARRIVAL_POS);
    f.cosmos.lerp(arrivalAnchor, arrivalW);
  }

  // ---- which shots are on screen
  let a = -1, b = -1;
  for (let i = 0; i < SHOTS.length; i++) {
    if (p >= SHOTS[i].from && p <= SHOTS[i].to) { if (a < 0) a = i; else { b = i; break; } }
  }
  if (a < 0) a = p < SHOTS[0].from ? 0 : SHOTS.length - 1;
  const sA = SHOTS[a], sB = b >= 0 ? SHOTS[b] : null;
  const w = sB ? smootherstep(sB.from, sA.to, p) : 0;
  f.shotId = w > 0.5 && sB ? sB.id : sA.id;
  poseOf(sA, p, f, track, framing, poseA);
  if (sB) poseOf(sB, p, f, track, framing, poseB);
  f.nearPos.copy(poseA.pos); if (sB) f.nearPos.lerp(poseB.pos, w);
  f.fov = sB ? lerp(poseA.fov, poseB.fov, w) : poseA.fov;

  // Near the ground the camera's own height matters: lying on the concrete is not the same as being at the top of the tower.
  const camAlt = Math.max(0.0018, alt + (f.nearPos.y - f.rocketPos.y) / 1000);
  f.cameraAltitude = camAlt;
  if (alt < 300) { f.cosmos.normalize().multiplyScalar(EARTH_R + camAlt); }

  // ---- orientation (needs the cosmos position for body-relative shots)
  orient(sA, poseA, f, framing, f.quat);
  if (sB) f.quat.slerp(orient(sB, poseB, f, framing, qA), w);

  return f;
}
