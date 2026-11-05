export function watchConsole(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => errors.push(`failed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}

export async function openFilm(page, path = '/') {
  await page.goto(path);
  await page.waitForSelector('[data-testid=scene-ready]', { state: 'attached', timeout: 90_000 });
}

export const progress = (page) => page.evaluate(() => window.__liftoff.timeline.progress());

/** Waits until the scrubbed timeline has caught up with the scroll position. */
export async function settle(page, eps = 0.00008) {
  await page.waitForFunction((tolerance) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return Math.abs(window.__liftoff.timeline.progress() - scrollY / max) < tolerance;
  }, eps, { timeout: 15_000 });
}

export async function scrollToFraction(page, f) {
  await page.evaluate((v) => { window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * v); }, f);
  await settle(page);
}

/** Mean pixel brightness and spread of the current frame, from a real screenshot. */
export async function frameStats(page) {
  const buf = await page.screenshot({ type: 'png' });
  const sharp = (await import('sharp')).default;
  const s = await sharp(buf).removeAlpha().stats();
  const mean = s.channels.reduce((a, c) => a + c.mean, 0) / 3;
  const dev = s.channels.reduce((a, c) => a + c.stdev, 0) / 3;
  return { mean, dev };
}
