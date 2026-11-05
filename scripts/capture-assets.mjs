// Captures the real frames used by the WebGL fallback, the social card, the README and its animated preview.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:5231/';
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const open = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${base}?p=0&tier=high`);
  await page.waitForSelector('[data-testid=ready]', { state: 'attached', timeout: 90000 });
  await page.waitForTimeout(1500);
  return page;
};
const seek = (page, p, wait = 500) => page.evaluate((v) => { window.__liftoff.seek(v); }, p).then(() => page.waitForTimeout(wait));
fs.mkdirSync('public/stills', { recursive: true }); fs.mkdirSync('docs/screens', { recursive: true });

const page = await open(1600, 900);
const stillsAt = { prelaunch: 0.0, ignition: 0.186, ascent: 0.346, orbit: 0.47, lunar: 0.595, beyond: 0.72, arrival: 0.915 };
const shots = { hero: 0, ignition: 0.17, crossing: 0.346, orbit: 0.47, lunar: 0.595, belt: 0.67, giant: 0.72, eclipse: 0.75, nebula: 0.826, gate: 0.915, closing: 0.995 };
for (const [n, p] of Object.entries(shots)) { await seek(page, p); await sharp(await page.screenshot()).jpeg({ quality: 84 }).toFile(`docs/screens/${n}.jpg`); }
await page.addStyleTag({ content: '.hud,.titles,.spots{display:none !important}' });
for (const [n, p] of Object.entries(stillsAt)) { await seek(page, p); await sharp(await page.screenshot()).resize(1600).jpeg({ quality: 78 }).toFile(`public/stills/${n}.jpg`); }
await seek(page, 0.346); await sharp(await page.screenshot()).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toFile('public/og.jpg');
await page.close();

const phone = await open(390, 844);
for (const [n, p] of [['phone-hero', 0], ['phone-orbit', 0.47], ['phone-giant', 0.74]]) { await seek(phone, p); await sharp(await phone.screenshot()).jpeg({ quality: 84 }).toFile(`docs/screens/${n}.jpg`); }
await phone.close();

// Animated preview: a real scrub through the film.
const reel = await open(640, 360);
const frames = [];
for (let i = 0; i <= 64; i++) {
  const p = Math.min(1, 0.09 + (i / 64) * 0.905);
  await seek(reel, p, 120);
  frames.push(await sharp(await reel.screenshot()).removeAlpha().png().toBuffer());
}
await reel.close();
await sharp(frames, { join: { animated: true } }).gif({ delay: 110, colours: 200, effort: 8, dither: 0.6 }).toFile('docs/journey.gif');
await browser.close();
