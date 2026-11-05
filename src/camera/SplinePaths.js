import * as THREE from 'three';

// Shots are the film's shot list. Every shot owns a spline for the camera and one for its focus target;
// `from`/`to` bound it on the global progress axis and consecutive shots overlap so one dissolves into the
// next. `space: 'pad'` paths are in launch-site metres, `space: 'rocket'` paths are metres relative to the
// vehicle, and `aimBody` points the lens at a celestial body. `fit` says which axis framing protects on
// narrow screens.
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function curve(points) {
  if (points.length === 1) { const v = V(points[0]); return { at: (_, o) => o.copy(v) }; }
  const c = new THREE.CatmullRomCurve3(points.map(V), false, 'centripetal');
  return { at: (u, o) => c.getPoint(u, o) };
}

function shot(s) {
  return { up: [0, 1, 0], fov: [38, 38], roll: [0, 0], comp: [0, 0], fit: 'h', space: 'rocket', ...s, cam: s.path ? curve(s.path) : null, aimC: s.aim ? curve(s.aim) : null };
}

export const SHOTS = [
  // ---- 01 prelaunch
  shot({ id: 'hero', from: 0, to: 0.036, space: 'pad', path: [[-76, 2.7, 42], [-71, 2.8, 39], [-62, 3.6, 35]], aim: [[0, 36, 0], [0, 36, 0], [0, 36, 0]], fov: [50, 49], comp: [0.42, 0.0], narrowY: 0.2, fit: 'v' }),
  shot({ id: 'climb', from: 0.012, to: 0.082, space: 'pad', path: [[-52, 9, 36], [-36, 12, 14], [-30, 26, -6], [-25, 44, -15], [-25, 64, -14], [-36, 84, -6]], aim: [[0, 16, 0], [0, 15, 0], [0, 28, 0], [0, 46, 0], [0, 62, 0], [0, 68, 0]], fov: [46, 26], comp: [-0.14, 0] }),
  shot({ id: 'reveal', from: 0.06, to: 0.12, space: 'pad', path: [[-62, 92, 8], [-118, 78, 84], [-178, 44, 142], [-214, 22, 166]], aim: [[0, 60, 0], [0, 50, 0], [0, 40, 0], [0, 36, 0]], fov: [30, 30], comp: [0.05, 0], fit: 'v' }),
  // ---- 02 ignition
  shot({ id: 'ignite', from: 0.105, to: 0.195, space: 'pad', path: [[-205, 9, 158], [-176, 6, 136], [-150, 4.6, 116], [-124, 3.6, 95]], aim: [[0, 30, 0], [0, 32, 0], [0, 36, 0], [0, 42, 0]], fov: [28, 33], comp: [0, 0.02], fit: 'v' }),
  // ---- 03 ascent
  shot({ id: 'track', from: 0.185, to: 0.27, space: 'pad', path: [[-124, 3.6, 95], [-300, 7, 232], [-1100, 60, 850], [-3300, 420, 2520], [-6200, 2100, 4700]], aimTrack: { y: 34, lead: 0.2 }, fov: [33, 1.9], fovEase: 1.32, fit: 'v' }),
  shot({ id: 'follow', from: 0.246, to: 0.31, path: [[-310, -430, 300], [-150, -150, 170], [-92, -40, 134]], aim: [[0, -30, 0], [0, -30, 0], [0, -24, 0]], fov: [12, 44], fovEase: 1.25, roll: [0, -2], fit: 'v' }),
  shot({ id: 'pull', from: 0.29, to: 0.345, path: [[-96, -36, 140], [-140, -16, 196], [-204, 22, 252]], aim: [[0, -20, 0], [0, -8, 0], [24, 6, 0]], fov: [28, 46], roll: [-2, -6], fit: 'v' }),
  // From here on the shots are composed rather than plotted: the lens direction is defined by what must be on
  // screen (a limb at a chosen height, a body), and the camera is then placed so the vehicle lands on a chosen
  // spot of the frame. x and y are fractions of the half-frame.
  shot({ id: 'crossing', from: 0.325, to: 0.4, look: 'horizon', body: 'earth', toward: 'east', az: [14, 26], above: [3.5, 9], rocket: { dist: [330, 190], x: [-0.2, -0.3], y: [0.05, 0.02] }, fov: [46, 46], roll: [-5, -2] }),
  // ---- 04 orbit
  shot({ id: 'orbit-a', from: 0.392, to: 0.452, look: 'horizon', body: 'earth', toward: 'east', az: [26, 62], above: [8, 6], rocket: { dist: [190, 92, 74], x: [-0.3, -0.32, -0.3], y: [0.02, 0.12, 0.22] }, fov: [46, 46], roll: [-2, 0] }),
  shot({ id: 'orbit-b', from: 0.44, to: 0.535, look: 'horizon', body: 'earth', toward: 'east', az: [62, 92], above: [6, 3], rocket: { dist: [74, 96, 310], x: [-0.3, -0.34, -0.52], y: [0.22, 0.26, 0.46] }, fov: [46, 50], roll: [0, 2] }),
  // ---- 05 lunar passage
  shot({ id: 'translunar', from: 0.505, to: 0.6, look: 'pivot', bodyA: 'earth', bodyB: 'moon', pivot: [0.22, 0.68], rocket: { dist: [210, 130, 100, 90], x: [-0.44, -0.3, 0.1, 0.34], y: [0.3, 0.2, -0.12, -0.34] }, fov: [50, 40], roll: [2, 0], upFixed: [0.1, 1, 0.1] }),
  shot({ id: 'lowpass', from: 0.538, to: 0.641, look: 'horizon', body: 'moon', toward: 'earth', az: [-13, -4], above: [6, 16], rocket: { dist: [90, 120], x: [0.34, 0.54], y: [-0.34, -0.42] }, fov: [50, 54], roll: [0, 2] }),
  // ---- 06 beyond
  shot({ id: 'belt', from: 0.612, to: 0.72, look: 'dir', dir: [0.02, 0.02, -1], rocket: { dist: [120, 110], x: [0.5, 0.1, -0.22, 0.2, -0.1], y: [-0.42, -0.3, -0.18, -0.32, -0.26] }, fov: [54, 60], roll: [2, -5, 6, -3, 4] }),
  shot({ id: 'giant', from: 0.708, to: 0.775, look: 'body', body: 'giant', offset: [0.2, 0.06], rocket: { dist: [110, 170], x: [-0.1, -0.6], y: [-0.26, -0.56] }, fov: [60, 64], roll: [4, 16] }),
  shot({ id: 'eclipse', from: 0.765, to: 0.828, look: 'body', body: 'giant', offset: [0, 0.02], rocket: { dist: [170, 240], x: [-0.6, -0.58], y: [-0.56, -0.5] }, fov: [64, 54], roll: [16, 4] }),
  shot({ id: 'nebula', from: 0.797, to: 0.872, look: 'dir', dir: [0.02, 0.05, -1], rocket: { dist: [240, 110], x: [-0.58, -0.3], y: [-0.5, -0.36] }, fov: [54, 56], roll: [4, -2] }),
  // ---- 07 arrival
  shot({ id: 'arrive', from: 0.852, to: 0.92, look: 'dir', dir: [0, 0.03, -1], rocket: { dist: [110, 92], x: [-0.3, -0.42], y: [-0.36, -0.52] }, fov: [50, 42], roll: [-2, 0] }),
  shot({ id: 'gate', from: 0.91, to: 0.967, look: 'dir', dir: [0, 0.0, -1], rocket: { dist: [92, 44, -34], x: [-0.42, -0.62, -0.7], y: [-0.52, -0.82, -1.1] }, fov: [42, 60] }),
  // closing frame: behind the white, the camera is somewhere new
  shot({ id: 'closing', from: 0.966, to: 1.01, look: 'horizon', body: 'arrival', toward: 'sun', az: [0, 0], above: [11.5, 11], rocket: { dist: [60, 60], x: [0, 0], y: [0, 0] }, fov: [46, 44] }),
];
