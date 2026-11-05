// Real GPU frame times: each sample forces completion with a one-pixel readback, so queued work can't flatter the
// number. Usage: node scripts/measure-performance.mjs <baseURL> [width] [height]
import { chromium } from '@playwright/test';
const [base = 'http://127.0.0.1:5231/', w = '1440', h = '900'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const POINTS = [0, 0.186, 0.27, 0.346, 0.47, 0.595, 0.67, 0.72, 0.75, 0.83, 0.915];
for (const tier of ['low', 'balanced', 'high', 'ultra']) {
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
  await page.goto(`${base}?p=0&tier=${tier}`);
  await page.waitForSelector('[data-testid=ready]', { state: 'attached', timeout: 120000 });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async (points) => {
    const L = window.__liftoff, gl = L.gl.getContext();
    const px = new Uint8Array(4), out = {};
    const raf = () => new Promise(requestAnimationFrame);
    for (const p of points) {
      L.seek(p);
      for (let i = 0; i < 5; i++) await raf();
      const t = [];
      for (let i = 0; i < 24; i++) {
        await raf();
        const a = performance.now();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        t.push(performance.now() - a);
      }
      // frame interval, including the readback wait
      const s = []; let last = performance.now();
      for (let i = 0; i < 24; i++) { await raf(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const n = performance.now(); s.push(n - last); last = n; }
      s.sort((x, y) => x - y);
      out[p] = +s[12].toFixed(1);
    }
    return { out, size: [L.gl.domElement.width, L.gl.domElement.height], info: L.gl.info.render.calls };
  }, POINTS);
  console.log(tier, `${res.size[0]}x${res.size[1]}`, JSON.stringify(res.out));
  await page.close();
}
await browser.close();
