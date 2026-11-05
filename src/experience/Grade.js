import * as THREE from 'three';
import { smoothstep } from '../animation/Interpolation.js';
import { ARRIVAL_POS, ARRIVAL_R, EARTH_R, GIANT_POS, GIANT_R, MOON_POS, MOON_R } from '../camera/CameraController.js';

// Each chapter has its own light and its own colour script, graded like a film rather than left to the renderer.
// Blue hour against fire, the neutral black of space, the charcoal monochrome of the Moon, warm ivory at the giant,
// saturated gas in the nebula, copper at the end. Stops are pure functions of progress, so the grade scrubs too.
const STOPS = [
  { p: 0.0, shadow: [0.78, 0.94, 1.26], high: [1.04, 0.99, 0.92], sat: 1.12, contrast: 1.06, exposure: 1.06 },
  { p: 0.13, shadow: [0.78, 0.94, 1.26], high: [1.04, 0.99, 0.92], sat: 1.12, contrast: 1.06, exposure: 1.06 },
  { p: 0.2, shadow: [0.8, 0.92, 1.24], high: [1.05, 0.98, 0.9], sat: 1.14, contrast: 1.08, exposure: 1.0 },
  { p: 0.3, shadow: [0.86, 0.95, 1.16], high: [1.03, 1.0, 0.95], sat: 1.08, contrast: 1.06, exposure: 1.0 },
  { p: 0.38, shadow: [0.94, 0.98, 1.08], high: [1.02, 1.0, 0.97], sat: 1.06, contrast: 1.1, exposure: 0.98 },
  { p: 0.5, shadow: [0.94, 0.98, 1.08], high: [1.02, 1.0, 0.97], sat: 1.06, contrast: 1.1, exposure: 0.98 },
  { p: 0.565, shadow: [0.98, 0.99, 1.03], high: [1.01, 1.0, 0.98], sat: 0.74, contrast: 1.14, exposure: 0.98 },
  { p: 0.63, shadow: [0.98, 0.99, 1.03], high: [1.01, 1.0, 0.98], sat: 0.74, contrast: 1.14, exposure: 0.98 },
  { p: 0.69, shadow: [0.95, 0.97, 1.05], high: [1.04, 1.0, 0.94], sat: 1.0, contrast: 1.12, exposure: 1.0 },
  { p: 0.78, shadow: [0.94, 0.97, 1.08], high: [1.05, 1.0, 0.93], sat: 1.06, contrast: 1.12, exposure: 1.0 },
  { p: 0.83, shadow: [0.92, 0.95, 1.14], high: [1.03, 0.99, 0.96], sat: 1.28, contrast: 1.16, exposure: 1.04 },
  { p: 0.87, shadow: [0.96, 0.96, 1.04], high: [1.05, 0.99, 0.92], sat: 1.1, contrast: 1.12, exposure: 1.0 },
  { p: 0.94, shadow: [1.08, 0.97, 0.9], high: [1.05, 0.99, 0.9], sat: 1.08, contrast: 1.12, exposure: 1.0 },
  { p: 1.0, shadow: [1.04, 0.96, 0.96], high: [1.05, 0.99, 0.91], sat: 1.1, contrast: 1.1, exposure: 1.0 },
];

const mix3 = (out, a, b, t) => out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);

export function gradeAt(p, out) {
  let i = 0;
  while (i < STOPS.length - 2 && p >= STOPS[i + 1].p) i++;
  const a = STOPS[i], b = STOPS[i + 1], t = smoothstep(a.p, b.p, p);
  mix3(out.shadow, a.shadow, b.shadow, t);
  mix3(out.high, a.high, b.high, t);
  out.sat = a.sat + (b.sat - a.sat) * t;
  out.contrast = a.contrast + (b.contrast - a.contrast) * t;
  out.exposure = a.exposure + (b.exposure - a.exposure) * t;
  return out;
}
export const createGrade = () => ({ shadow: new THREE.Vector3(), high: new THREE.Vector3(), sat: 1, contrast: 1, exposure: 1 });

const v = new THREE.Vector3(), rel = new THREE.Vector3(), qInv = new THREE.Quaternion();

/** How much of the sun clears one body from where the camera is: 0 behind it, 1 clear, with a soft grazing band. */
function clearance(cosmos, sun, center, radius, soft) {
  rel.copy(center).sub(cosmos);
  const d = rel.length();
  if (d <= radius) return 0;
  const sep = Math.acos(Math.max(-1, Math.min(1, rel.dot(sun) / d)));
  const ang = Math.asin(Math.min(1, radius / d));
  return smoothstep(ang - soft * 0.4, ang + soft, sep);
}

const EARTH_O = new THREE.Vector3(0, 0, 0);

/**
 * The frame's one light as the lens sees it: where it lands on screen, how much of it is unobstructed and what
 * colour it has become. Used by the light shafts, the streak and the flare. Pure, given the frame and the camera.
 */
export function lensLight(frame, track, camera, gate, out) {
  const p = frame.p;
  out.vis = 0;
  if (p > 0.905 && p < 0.967 && gate) {
    // Inside the gate the aperture is the light, not the star behind it.
    v.copy(gate).project(camera);
    out.uv.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    out.vis = v.z < 1 ? track.portal : 0;
    out.tint.set(1, 0.84, 0.62);
    return out;
  }
  const sun = frame.sunDir;
  v.copy(sun).applyQuaternion(qInv.copy(camera.quaternion).invert());
  if (v.z > -0.02) return out;
  const tanV = Math.tan(camera.fov * Math.PI / 360), tanH = tanV * camera.aspect;
  out.uv.set(0.5 + 0.5 * (v.x / -v.z) / tanH, 0.5 + 0.5 * (v.y / -v.z) / tanV);
  // Fades as the light leaves the frame, instead of snapping off at the edge.
  const over = Math.max(Math.abs(out.uv.x - 0.5), Math.abs(out.uv.y - 0.5));
  let vis = 1 - smoothstep(0.62, 0.95, over);
  if (vis <= 0) return out;
  const c = frame.cosmos;
  const earth = p < 0.68 ? clearance(c, sun, EARTH_O, EARTH_R, 0.02) : 1;
  vis *= earth;
  if (p > 0.45 && p < 0.68) vis *= clearance(c, sun, MOON_POS, MOON_R, 0.012);
  if (p > 0.63 && p < 0.86) vis *= clearance(c, sun, GIANT_POS, GIANT_R, 0.012);
  if (p > 0.84) vis *= clearance(c, sun, ARRIVAL_POS, ARRIVAL_R, 0.02);
  out.vis = vis;
  // Through the thick limb of the atmosphere the light is red; it whitens as it climbs clear.
  const redden = p < 0.68 ? 1 - smoothstep(0.0, 1.0, earth) * smoothstep(0.34, 0.385, p) : 0;
  out.tint.set(1, 0.9 - redden * 0.34, 0.8 - redden * 0.5);
  return out;
}
export const createLens = () => ({ uv: new THREE.Vector2(0.5, 0.5), vis: 0, tint: new THREE.Color(1, 1, 1) });
