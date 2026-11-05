import gsap from 'gsap';

// Every animated scene parameter is a numeric channel on one plain object, tweened by a single paused
// GSAP timeline whose duration is exactly 1 (timeline time == journey progress). Because all segments are
// explicit fromTo tweens with immediateRender off, seeking to any time produces the same values no matter
// which direction or how fast the playhead arrived there.
const CHANNELS = {
  // journey clock used by altitude and travel curves
  climb: [[0, 0], [1, 1, 'none']],
  // launch sequence
  padLights: [[0, 1], [0.112, 1], [0.142, 0.16], [0.24, 0.05, 'none']],
  glow: [[0.105, 0], [0.142, 1], [0.335, 1, 'none'], [0.345, 0]],
  thrust: [[0.136, 0], [0.152, 0.34, 'power2.out'], [0.178, 1, 'power2.in'], [0.333, 1, 'none'], [0.34, 0, 'power2.out']],
  vapor: [[0, 0.65], [0.1, 0.8], [0.135, 1.4], [0.2, 0.6], [0.25, 0]],
  launchT: [[0.136, 0], [0.34, 1, 'none']],
  shake: [[0.14, 0], [0.18, 1], [0.235, 0.75], [0.3, 0.26], [0.34, 0.1], [0.36, 0]],
  heat: [[0.138, 0], [0.165, 1], [0.235, 0.7], [0.28, 0]],
  pitch: [[0.232, 0], [0.3, 0.42], [0.37, 1.32], [0.5, 1.5]],
  // staging
  boosterSep: [[0.276, 0], [0.322, 1, 'none']],
  stageSep: [[0.338, 0], [0.4, 1, 'none']],
  vac: [[0.343, 0], [0.349, 1, 'power2.in'], [0.402, 1, 'none'], [0.412, 0], [0.5, 0, 'none'], [0.512, 0.7], [0.566, 0.7, 'none'], [0.578, 0]],
  fairing: [[0.408, 0], [0.47, 1, 'none']],
  wings: [[0.43, 0], [0.478, 1, 'power2.inOut']],
  centerShift: [[0.338, 0], [0.37, 1, 'power1.inOut']],
  roll: [[0.416, 0], [0.462, 1.5708]],
  // light and exposure
  farGain: [[0, 1.5], [0.2, 1.5], [0.25, 1.1], [0.29, 0.72], [0.33, 0.56], [0.36, 0.42], [0.5, 0.42, 'none'], [0.6, 0.5], [0.7, 0.5]],
  sunNear: [[0.3, 0], [0.34, 0.5], [0.355, 1], [0.6, 1, 'none'], [0.66, 0.92]],
  bloom: [[0, 0.8], [0.14, 1], [0.18, 1.5], [0.3, 1], [0.345, 1.35], [0.38, 0.9], [0.55, 0.8], [0.72, 0.8], [0.8, 1.1], [0.88, 0.9], [0.962, 3.2], [0.982, 0.45]],
  grain: [[0, 1]],
  // how strongly the frame's one light throws shafts and flares through the lens
  shafts: [[0, 0], [0.312, 0], [0.336, 1], [0.372, 0.55], [0.42, 0.28], [0.56, 0.22], [0.62, 0.4], [0.72, 0.42], [0.752, 0.5], [0.782, 1], [0.812, 0.7], [0.84, 0.18], [0.872, 0.3], [0.915, 0.9], [0.95, 1], [0.966, 0.3], [0.985, 0.9], [1, 0.9]],
  dust: [[0.2, 0], [0.24, 1], [0.32, 0.9], [0.36, 0]],
  // cosmos path weights: each carries the camera from one region to the next
  orbitDrift: [[0.37, 0], [0.5, 1, 'none'], [0.62, 1.6, 'none']],
  toMoon: [[0.495, 0], [0.585, 1, 'sine.inOut']],
  lunarPass: [[0.555, 0], [0.655, 1, 'none']],
  toBelt: [[0.64, 0], [0.676, 1, 'power2.inOut']],
  beltTravel: [[0.612, 0], [0.72, 1, 'none']],
  beltVis: [[0.606, 0], [0.636, 1], [0.70, 1, 'none'], [0.722, 0]],
  giantPath: [[0.625, 0], [0.82, 1, 'none']],
  ringRocks: [[0.725, 0], [0.74, 1], [0.758, 1, 'none'], [0.772, 0]],
  sunSwap: [[0.628, 0], [0.655, 1]],
  sunSwap2: [[0.8, 0], [0.86, 1]],
  // nebula
  nebula: [[0.778, 0], [0.815, 1], [0.852, 1, 'none'], [0.876, 0]],
  nebulaTravel: [[0.775, 0], [0.88, 1, 'none']],
  // arrival
  arrivalVis: [[0.838, 0], [0.87, 1]],
  approach: [[0.855, 0], [0.962, 1, 'none']],
  unfold: [[0.875, 0], [0.942, 1, 'sine.inOut']],
  lightsOn: [[0.885, 0], [0.925, 1]],
  portal: [[0.905, 0], [0.948, 1]],
  whiteout: [[0.938, 0], [0.954, 1, 'power2.in'], [0.973, 1, 'none'], [0.984, 0, 'sine.out']],
  closing: [[0.968, 0], [0.971, 1, 'none']],
};

export const CHANNEL_NAMES = Object.keys(CHANNELS);

export function createTrack() {
  const t = {};
  for (const [name, keys] of Object.entries(CHANNELS)) t[name] = keys[0][1];
  return t;
}

export function createTimeline(track) {
  const tl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });
  tl.set({}, {}, 1); // pins total duration to exactly 1
  for (const [name, keys] of Object.entries(CHANNELS)) {
    for (let i = 1; i < keys.length; i++) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1, ease = 'sine.inOut'] = keys[i];
      if (t1 <= t0) continue;
      tl.fromTo(track, { [name]: v0 }, { [name]: v1, duration: t1 - t0, ease, overwrite: false }, t0);
    }
  }
  tl.progress(0);
  return tl;
}

/** Writes the correct value of every channel directly, without relying on prior playhead history. */
export function seekTimeline(tl, track, p) {
  tl.progress(p, true);
}
