import { clamp, monotoneCurve } from '../animation/Interpolation.js';
import { altitudeKm } from '../camera/CameraController.js';

// A stylised, entirely fictional mission profile. Nothing here is telemetry from any real vehicle; the interface
// says so on screen. Altitude comes from the same curve that flies the camera, so the numbers match the picture.
const CLOCK = monotoneCurve([0, 0.1, 0.183, 0.3, 0.37, 0.5, 0.63], [-600, -60, 0, 148, 540, 5400, 266000]);
const SPEED = monotoneCurve([0.183, 0.24, 0.3, 0.34, 0.37, 0.45, 0.5, 0.54, 0.62], [0, 0.42, 1.8, 3.1, 7.7, 7.6, 7.4, 10.8, 1.65]);

export function missionClock(p) {
  const s = Math.round(CLOCK(p));
  const a = Math.abs(s), h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), sec = a % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `t${s < 0 ? '−' : '+'} ${h > 0 ? `${h}:` : ''}${pad(m)}:${pad(sec)}`;
}

export const missionSpeed = (p) => SPEED(clamp(p, 0, 0.62));

const fmt = (x, d = 1) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** The three readouts for a moment in the film. Deep space deliberately runs out of numbers. */
export function readouts(p) {
  if (p < 0.183) return { a: ['altitude', '0 km'], b: ['velocity', '0 km/s'], c: ['clock', missionClock(p)] };
  if (p < 0.63) {
    const alt = altitudeKm(p);
    const altText = alt < 10 ? `${fmt(alt, 2)} km` : `${fmt(alt, 0)} km`;
    return { a: ['altitude', p < 0.5 ? altText : 'cislunar'], b: ['velocity', `${fmt(missionSpeed(p), 2)} km/s`], c: ['clock', missionClock(p)] };
  }
  if (p < 0.85) return { a: ['altitude', 'n/a'], b: ['velocity', 'unknown'], c: ['clock', 'no signal'] };
  return { a: ['altitude', 'n/a'], b: ['velocity', 'unknown'], c: ['clock', 'no signal'] };
}
