import { describe, it, expect } from 'vitest';
import { createTrack, createTimeline, seekTimeline, CHANNEL_NAMES } from '../../src/experience/CinematicTimeline.js';
import { computeFrame, createFrame } from '../../src/camera/CameraController.js';

const snapshot = (t) => CHANNEL_NAMES.map((k) => t[k]);
const expectClose = (a, b, eps = 1e-6) => a.forEach((v, i) => { if (Math.abs(v - b[i]) > eps) throw new Error(`${CHANNEL_NAMES[i]}: ${v} vs ${b[i]}`); });

describe('cinematic timeline', () => {
  it('has a duration of exactly 1, so timeline time equals journey progress', () => {
    const t = createTrack(); const tl = createTimeline(t);
    expect(tl.duration()).toBeCloseTo(1, 6);
  });

  it('every channel is finite at arbitrary progress', () => {
    const t = createTrack(); const tl = createTimeline(t);
    for (let i = 0; i <= 500; i++) { seekTimeline(tl, t, i / 500); for (const k of CHANNEL_NAMES) expect(Number.isFinite(t[k])).toBe(true); }
  });

  it('gives identical values whichever route the playhead took to get there', () => {
    const probes = [0, 0.05, 0.1, 0.137, 0.176, 0.2, 0.3, 0.345, 0.37, 0.41, 0.5, 0.57, 0.63, 0.7, 0.77, 0.85, 0.91, 0.965, 0.98, 1];
    const fresh = createTrack(); const reference = probes.map((p) => {
      const t = createTrack(); const tl = createTimeline(t); seekTimeline(tl, t, p); return snapshot(t);
    });
    // forward, backward, random jumps, rapid scrub over the same timeline instance
    const t = fresh; const tl = createTimeline(t);
    for (let i = 0; i < probes.length; i++) { seekTimeline(tl, t, probes[i]); expectClose(snapshot(t), reference[i]); }
    for (let i = probes.length - 1; i >= 0; i--) { seekTimeline(tl, t, probes[i]); expectClose(snapshot(t), reference[i]); }
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 400; n++) { const i = Math.floor(rnd() * probes.length); seekTimeline(tl, t, rnd()); seekTimeline(tl, t, probes[i]); expectClose(snapshot(t), reference[i]); }
  });
});

describe('camera path', () => {
  const sample = (p, aspect = 16 / 9, tl, t, f) => { seekTimeline(tl, t, p); computeFrame(t, p, aspect, f); return f; };

  for (const aspect of [16 / 9, 9 / 19]) {
    it(`has no teleports or sudden rotations at aspect ${aspect.toFixed(2)}`, () => {
      const t = createTrack(); const tl = createTimeline(t); const f = createFrame();
      const N = 4000;
      let prevPos = null, prevQuat = null, prevFov = null;
      let worstRot = 0, worstRotAt = 0, worstFov = 0, worstFovAt = 0, worstMove = 0, worstMoveAt = 0;
      for (let i = 0; i <= N; i++) {
        const p = i / N;
        sample(p, aspect, tl, t, f);
        expect(f.nearPos.toArray().every(Number.isFinite)).toBe(true);
        expect(f.cosmos.toArray().every(Number.isFinite)).toBe(true);
        expect(f.quat.toArray().every(Number.isFinite)).toBe(true);
        if (prevPos && p < 0.966) {
          const rot = 2 * Math.acos(Math.min(1, Math.abs(prevQuat.dot(f.quat))));
          if (rot > worstRot) { worstRot = rot; worstRotAt = p; }
          if (Math.abs(f.fov - prevFov) > worstFov) { worstFov = Math.abs(f.fov - prevFov); worstFovAt = p; }
          const mv = prevPos.distanceTo(f.nearPos);
          if (mv > worstMove && p > 0.34) { worstMove = mv; worstMoveAt = p; }
        }
        prevPos = f.nearPos.clone(); prevQuat = f.quat.clone(); prevFov = f.fov;
      }
      // One scroll tick is about 1/1500 of the journey: 2.67 of these samples.
      expect(worstRot, `rotation spike at ${worstRotAt}`).toBeLessThan(0.05);
      expect(worstFov, `fov jump at ${worstFovAt}`).toBeLessThan(0.3);
      expect(worstMove, `position jump at ${worstMoveAt}`).toBeLessThan(25);
    });
  }

  it('altitude only ever increases', () => {
    const t = createTrack(); const tl = createTimeline(t); const f = createFrame();
    let last = -1;
    for (let i = 0; i <= 1000; i++) { sample(i / 1000, 16 / 9, tl, t, f); expect(f.altitude).toBeGreaterThanOrEqual(last - 1e-9); last = f.altitude; }
  });

  it('is a pure function of progress', () => {
    const t = createTrack(); const tl = createTimeline(t);
    const a = createFrame(), b = createFrame();
    sample(0.42, 1.6, tl, t, a); sample(0.9, 1.6, tl, t, b); sample(0.42, 1.6, tl, t, b);
    expect(a.nearPos.distanceTo(b.nearPos)).toBeLessThan(1e-6);
    expect(a.cosmos.distanceTo(b.cosmos)).toBeLessThan(1e-3);
    expect(Math.abs(a.quat.dot(b.quat))).toBeGreaterThan(1 - 1e-9);
  });
});
