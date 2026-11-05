import { test, expect } from '@playwright/test';
import { watchConsole, openFilm, progress, settle, scrollToFraction, frameStats } from './helpers.js';

test.describe('the film', () => {
  test('opens without errors and shows the brand in lowercase', async ({ page }) => {
    const errors = watchConsole(page);
    await openFilm(page);
    await expect(page).toHaveTitle('liftoff');
    await expect(page.locator('.brand')).toHaveAttribute('aria-label', /^liftoff/);
    await expect(page.locator('.wordmark').first()).toHaveAttribute('aria-label', 'liftoff');
    const text = await page.evaluate(() => document.body.innerText + document.title);
    expect(text).not.toMatch(/Liftoff|LIFTOFF|LiftOff|Lift Off/);
    await page.waitForTimeout(1500);
    const { dev } = await frameStats(page);
    expect(dev, 'the opening frame should not be a blank canvas').toBeGreaterThan(8);
    expect(errors).toEqual([]);
  });

  test('every chapter renders a real frame, with no console errors', async ({ page }) => {
    const errors = watchConsole(page);
    await openFilm(page, '/?p=0');
    await page.waitForSelector('[data-testid=ready]', { state: 'attached', timeout: 90_000 });
    for (const p of [0, 0.1, 0.176, 0.2, 0.3, 0.37, 0.45, 0.5, 0.595, 0.63, 0.72, 0.75, 0.83, 0.85, 0.91, 0.992, 1]) {
      await page.evaluate((v) => { window.__liftoff.seek(v); }, p);
      await page.waitForTimeout(280);
      const { dev } = await frameStats(page);
      expect(dev, `frame at progress ${p}`).toBeGreaterThan(4);
    }
    expect(errors).toEqual([]);
  });

  test('wheel scrolling drives progress forward and backward', async ({ page }) => {
    await openFilm(page);
    await page.waitForTimeout(1500);
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, 3200);
    await page.waitForTimeout(1200);
    const forward = await progress(page);
    expect(forward).toBeGreaterThan(0.01);
    await page.mouse.wheel(0, -1500);
    await page.waitForTimeout(1200);
    const back = await progress(page);
    expect(back).toBeLessThan(forward);
    expect(back).toBeGreaterThan(0);
  });

  test('progress lands on the same state however it was reached', async ({ page }) => {
    await openFilm(page);
    const sample = () => page.evaluate(() => {
      const L = window.__liftoff;
      return { alt: L.frame.altitude, thrust: L.track.thrust, near: L.frame.nearPos.toArray(), fair: L.track.fairing, nebula: L.track.nebula };
    });
    await scrollToFraction(page, 0.42);
    const direct = await sample();
    await scrollToFraction(page, 0.93);
    await scrollToFraction(page, 0.05);
    await scrollToFraction(page, 0.42);
    const roundabout = await sample();
    expect(Math.abs(roundabout.alt - direct.alt) / direct.alt).toBeLessThan(0.002);
    expect(roundabout.thrust).toBeCloseTo(direct.thrust, 2);
    expect(roundabout.fair).toBeCloseTo(direct.fair, 2);
    roundabout.near.forEach((v, i) => expect(Math.abs(v - direct.near[i])).toBeLessThan(40));
  });

  test('reload at a nonzero position restores the same chapter', async ({ page }) => {
    await openFilm(page);
    await scrollToFraction(page, 0.72);
    const before = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(350); // lets the throttled save land, as any real pause would
    await page.reload();
    await page.waitForSelector('[data-testid=scene-ready]', { state: 'attached', timeout: 90_000 });
    await settle(page);
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(40);
    expect(Math.abs((await progress(page)) - 0.72)).toBeLessThan(0.002);
    await expect(page.locator('.dock__name')).toHaveText('beyond');
  });

  test('chapter markers navigate, and back and forward follow', async ({ page }) => {
    await openFilm(page);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'chapter 04, orbit' }).click();
    await expect(page).toHaveURL(/#orbit$/);
    await expect(page.locator('.dock__name')).toHaveText('orbit', { timeout: 12_000 });
    await page.waitForTimeout(3500);
    await settle(page, 0.002);
    await page.getByRole('button', { name: 'chapter 06, beyond' }).click();
    await expect(page.locator('.dock__name')).toHaveText('beyond', { timeout: 12_000 });
    await page.waitForTimeout(3500);
    await page.goBack();
    await expect(page).toHaveURL(/#orbit$/);
    await expect(page.locator('.dock__name')).toHaveText('orbit', { timeout: 12_000 });
  });

  test('a deep link opens at its chapter', async ({ page }) => {
    await openFilm(page, '/#lunar');
    await settle(page);
    await expect(page.locator('.dock__name')).toHaveText('lunar passage', { timeout: 10_000 });
  });

  test('resizing keeps the canvas matched to the window', async ({ page }) => {
    await openFilm(page);
    await scrollToFraction(page, 0.45);
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(900);
    await settle(page, 0.0005);
    const box = await page.locator('.stage canvas').boundingBox();
    expect(Math.round(box.width)).toBe(900);
    expect(box.height).toBeGreaterThanOrEqual(900);
    expect(Math.abs((await progress(page)) - 0.45)).toBeLessThan(0.002);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('begin again returns to the launchpad without reloading', async ({ page }) => {
    await openFilm(page);
    await page.evaluate(() => { window.__marker = 'same page'; });
    await scrollToFraction(page, 1);
    await page.waitForTimeout(600);
    const begin = page.getByRole('button', { name: 'begin again' });
    await expect(begin).toBeVisible();
    await begin.click();
    await page.waitForFunction(() => window.__liftoff.timeline.progress() < 0.002, null, { timeout: 12_000 });
    expect(await page.evaluate(() => window.__marker)).toBe('same page');
    await expect(page.locator('.dock__name')).toHaveText('prelaunch');
  });

  test('sound stays silent until asked, and the toggle is real', async ({ page }) => {
    await page.addInitScript(() => {
      window.__audioStates = [];
      const C = window.AudioContext;
      window.AudioContext = class extends C { constructor(...a) { super(...a); window.__audioStates.push('created'); } };
    });
    await openFilm(page);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__audioStates.length)).toBe(0);
    const toggle = page.getByRole('button', { name: 'turn sound on' });
    await toggle.click();
    expect(await page.evaluate(() => window.__audioStates.length)).toBe(1);
    await expect(page.getByRole('button', { name: 'turn sound off' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('quality can be chosen by hand', async ({ page }) => {
    await openFilm(page);
    await page.locator('.quality .tool').click();
    await page.locator('.quality__menu button', { hasText: 'low' }).click();
    await expect(page.locator('.quality .tool')).toContainText('low');
    await page.waitForTimeout(500);
    const { dev } = await frameStats(page);
    expect(dev).toBeGreaterThan(4);
  });

  test('hotspots are keyboard-reachable and open without moving the film', async ({ page }) => {
    await openFilm(page);
    await page.waitForTimeout(1500);
    const before = await progress(page);
    const spot = page.getByRole('button', { name: /^nine engines/ });
    await spot.focus();
    await page.keyboard.press('Enter');
    await expect(spot).toHaveAttribute('aria-expanded', 'true');
    expect(await progress(page)).toBeCloseTo(before, 5);
  });

  test('the crater close-up opens and closes', async ({ page }) => {
    await openFilm(page);
    await page.waitForSelector('[data-testid=ready]', { state: 'attached', timeout: 90_000 });
    await scrollToFraction(page, 0.595);
    await page.getByRole('button', { name: 'look closer at this crater' }).click();
    await expect(page.locator('.inset-frame')).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'close the crater close-up' }).click();
    await expect(page.locator('.inset-frame')).toHaveCount(0);
  });

  test('the gate can be entered by click', async ({ page }) => {
    await openFilm(page);
    await page.waitForSelector('[data-testid=ready]', { state: 'attached', timeout: 90_000 });
    await scrollToFraction(page, 0.93);
    await page.getByRole('button', { name: 'enter the gate' }).click();
    await page.waitForFunction(() => window.__liftoff.timeline.progress() > 0.97, null, { timeout: 12_000 });
  });
});

test.describe('other ways of arriving', () => {
  test('reduced motion: held frames, no scrubbing, chapters reachable', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = watchConsole(page);
    await openFilm(page);
    await page.waitForTimeout(1200);
    await expect(page.locator('.reduced')).toContainText('prelaunch');
    expect(await progress(page)).toBe(0);
    await page.evaluate(() => { window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.5); });
    await page.waitForTimeout(1200);
    await expect(page.locator('.reduced')).toContainText('orbit');
    expect(await progress(page)).toBeCloseTo(0.47, 2);
    const a = await page.evaluate(() => window.__liftoff.frame.nearPos.toArray());
    await page.waitForTimeout(500);
    const b = await page.evaluate(() => window.__liftoff.frame.nearPos.toArray());
    expect(a).toEqual(b);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('no WebGL: a designed fallback rather than a broken canvas', async ({ page }) => {
    await page.goto('/?nowebgl');
    await expect(page.locator('.fallback')).toBeVisible();
    await expect(page.locator('.fallback section')).toHaveCount(7);
    expect(await page.locator('canvas').count()).toBe(0);
  });

  test('phone layout: no horizontal overflow and a working film', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = watchConsole(page);
    await openFilm(page);
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await scrollToFraction(page, 0.5);
    await page.waitForTimeout(400);
    const { dev } = await frameStats(page);
    expect(dev).toBeGreaterThan(4);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

test.describe('scrubbing backwards', () => {
  // Reduced to what the picture is made of: the state that decides every pixel, read at each stop on the way forward
  // and again on the way back. Smoke, sparks and staging are all closed-form, so nothing may differ.
  test('every stop looks the same on the way back as it did on the way forward', async ({ page }) => {
    await openFilm(page, '/?p=0&still');
    await page.waitForSelector('[data-testid=ready]', { state: 'attached', timeout: 90_000 });
    const stops = [0.05, 0.14, 0.18, 0.21, 0.29, 0.31, 0.345, 0.41, 0.46, 0.53, 0.6, 0.64, 0.7, 0.78, 0.83, 0.89, 0.93, 0.975, 0.995];
    const read = (p) => page.evaluate(async (v) => {
      const L = window.__liftoff;
      L.seek(v);
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      const t = Object.fromEntries(Object.entries(L.track).filter(([, x]) => typeof x === 'number')), f = L.frame;
      return { t, pos: f.nearPos.toArray(), quat: f.quat.toArray(), fov: f.fov, sun: f.sunDir.toArray(), cosmos: f.cosmos.toArray() };
    }, p);
    const forward = [];
    for (const p of stops) forward.push(await read(p));
    for (let i = stops.length - 1; i >= 0; i--) {
      const back = await read(stops[i]), a = forward[i];
      for (const k of Object.keys(a.t)) expect(Math.abs(back.t[k] - a.t[k]), `${k} at ${stops[i]}`).toBeLessThan(1e-6);
      ['pos', 'quat', 'sun'].forEach((k) => a[k].forEach((v, n) => expect(Math.abs(back[k][n] - v), `${k} at ${stops[i]}`).toBeLessThan(1e-4)));
      expect(back.fov).toBeCloseTo(a.fov, 5);
    }
  });

  test('a fast real scroll down and back lands on the same picture state, with titles reset', async ({ page }) => {
    await openFilm(page);
    await page.waitForTimeout(1200);
    await page.mouse.move(640, 360);
    for (let i = 0; i < 26; i++) { await page.mouse.wheel(0, 2600); await page.waitForTimeout(40); }
    await settle(page);
    const down = await progress(page);
    expect(down).toBeGreaterThan(0.015);
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, -2600); await page.waitForTimeout(30); }
    await settle(page);
    expect(await progress(page)).toBeLessThan(0.002);
    // At the top again, the opening title is back, sharp and at full opacity, and no other title is showing.
    const titles = await page.evaluate(() => [...document.querySelectorAll('[data-title]')].map((el) => ({ id: el.dataset.title, on: getComputedStyle(el).visibility === 'visible', o: getComputedStyle(el.querySelector('.tline')).opacity, f: getComputedStyle(el.querySelector('.tline')).filter })));
    const hero = titles.find((t) => t.id === 'hero');
    expect(hero.on).toBe(true);
    expect(Number(hero.o)).toBeGreaterThan(0.99);
    expect(hero.f).toMatch(/blur\(0(px|em)?\)|none/);
    expect(titles.filter((t) => t.on && t.id !== 'hero')).toEqual([]);
  });
});
