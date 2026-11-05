// Frame pacing while the film actually scrubs: scrolls the whole journey down and back with real scroll events and
// reports frame intervals (with a GPU readback each frame so queued work cannot flatter the number), the worst stretch
// of the film, and any main-thread long tasks. Usage: node scripts/measure-scrub.mjs <baseURL> [tier] [seconds] [w] [h]
import { chromium } from '@playwright/test';
const [base = 'http://127.0.0.1:5231/', tier = 'high', seconds = '40', w = '1440', h = '900'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
await page.goto(`${base}?tier=${tier}`);
await page.waitForSelector('[data-testid=ready]', { state: 'attached', timeout: 120000 });
await page.waitForTimeout(1800);
const res = await page.evaluate(async (secs) => {
  const L = window.__liftoff, gl = L.gl.getContext(), px = new Uint8Array(4);
  const long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch { /* not supported */ }
  const max = document.documentElement.scrollHeight - innerHeight;
  const T = secs * 1000, t0 = performance.now();
  const samples = []; let last = performance.now();
  await new Promise((done) => {
    const tick = () => {
      const now = performance.now(), u = (now - t0) / T;
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const n = performance.now();
      samples.push([n - last, L.timeline.progress()]); last = n;
      if (u >= 1) { done(); return; }
      const f = u < 0.5 ? u * 2 : 2 - u * 2;
      window.scrollTo(0, max * f);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return { samples, long, size: [L.gl.domElement.width, L.gl.domElement.height] };
}, +seconds);
const ms = res.samples.map((s) => s[0]).slice(5).sort((a, b) => a - b);
const pct = (q) => ms[Math.floor(q * (ms.length - 1))].toFixed(1);
console.log(`${tier} ${res.size.join('x')} frames ${ms.length}  p50 ${pct(0.5)}  p90 ${pct(0.9)}  p99 ${pct(0.99)}  max ${ms[ms.length - 1].toFixed(1)} ms`);
console.log('slow frames at progress:', res.samples.slice(5).filter((x) => x[0] > 33.4).map((x) => `${x[1].toFixed(3)}(${x[0].toFixed(0)})`).join(' ') || 'none');
console.log('over 33 ms:', ms.filter((v) => v > 33.4).length, ' over 50 ms:', ms.filter((v) => v > 50).length, ' long tasks:', res.long.length ? res.long.slice(0, 16).join(',') : 'none');
const buckets = {}; for (const [d, p] of res.samples.slice(5)) { const k = (Math.floor(p * 20) / 20).toFixed(2); (buckets[k] ||= []).push(d); }
console.log(Object.keys(buckets).sort().map((k) => { const a = buckets[k].sort((x, y) => x - y); return `${k}:${a[Math.floor(a.length / 2)].toFixed(0)}`; }).join(' '));
await browser.close();
