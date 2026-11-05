import { describe, it, expect } from 'vitest';
import { CHAPTERS, chapterAt, chapterEntry, chapterById } from '../../src/experience/ChapterRegistry.js';
import { missionClock, readouts } from '../../src/experience/MissionProfile.js';
import { monotoneCurve, band } from '../../src/animation/Interpolation.js';
import { initialTier, nextTier, QUALITY, TIERS } from '../../src/performance/QualityManager.js';

describe('chapters', () => {
  it('are seven contiguous ranges covering the whole journey', () => {
    expect(CHAPTERS).toHaveLength(7);
    expect(CHAPTERS[0].start).toBe(0);
    expect(CHAPTERS[6].end).toBe(1);
    for (let i = 1; i < 7; i++) expect(CHAPTERS[i].start).toBe(CHAPTERS[i - 1].end);
  });
  it('resolve from progress, including the end', () => {
    expect(chapterAt(0).id).toBe('prelaunch');
    expect(chapterAt(0.1).id).toBe('ignition');
    expect(chapterAt(0.999).id).toBe('arrival');
    expect(chapterAt(1).id).toBe('arrival');
  });
  it('each have an entry and a held still inside their own range', () => {
    for (const c of CHAPTERS) {
      expect(chapterAt(chapterEntry(c)).id).toBe(c.id);
      expect(chapterAt(c.still).id).toBe(c.id);
      expect(chapterById(c.id)).toBe(c);
      expect(c.summary.length).toBeGreaterThan(10);
    }
  });
});

describe('mission profile', () => {
  it('counts down to zero at liftoff and up afterwards', () => {
    expect(missionClock(0)).toMatch(/^t− /);
    expect(missionClock(0.183)).toBe('t+ 00:00');
    expect(missionClock(0.3)).toMatch(/^t\+ /);
  });
  it('runs out of numbers in deep space rather than inventing them', () => {
    expect(readouts(0.7).c[1]).toBe('no signal');
    expect(readouts(0.95).b[1]).toBe('unknown');
  });
});

describe('interpolation', () => {
  it('monotone curve never overshoots its keys', () => {
    const f = monotoneCurve([0, 1, 2, 3], [0, 10, 10, 100]);
    let last = -1;
    for (let i = 0; i <= 300; i++) { const v = f(i / 100); expect(v).toBeGreaterThanOrEqual(last - 1e-9); expect(v).toBeLessThanOrEqual(100 + 1e-9); last = v; }
    expect(f(1)).toBeCloseTo(10); expect(f(1.5)).toBeCloseTo(10);
  });
  it('band is zero outside and one inside', () => {
    expect(band(0, 1, 2, 3, 4)).toBe(0); expect(band(2.5, 1, 2, 3, 4)).toBe(1); expect(band(5, 1, 2, 3, 4)).toBe(0);
  });
});

describe('quality', () => {
  it('has the four named tiers, in rising cost', () => {
    expect(TIERS).toEqual(['low', 'balanced', 'high', 'ultra']);
    for (let i = 1; i < 4; i++) expect(QUALITY[TIERS[i]].atmoSteps).toBeGreaterThan(QUALITY[TIERS[i - 1]].atmoSteps);
  });
  it('picks a cautious start for software and phones', () => {
    expect(initialTier({ renderer: 'Google SwiftShader' })).toBe('low');
    expect(initialTier({ isMobile: true, memory: 3 })).toBe('low');
    expect(initialTier({ renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro)', cores: 12 })).toBe('high');
  });
  it('steps down when slow, up only with headroom, and never automatically to ultra', () => {
    expect(nextTier('high', 20)).toBe('balanced');
    expect(nextTier('low', 20)).toBe('low');
    expect(nextTier('balanced', 60)).toBe('high');
    expect(nextTier('high', 60)).toBe('high');
    expect(nextTier('balanced', 45)).toBe('balanced');
  });
});
