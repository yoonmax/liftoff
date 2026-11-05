// Renders chosen moments of the film and saves them. Usage: node scripts/capture-stills.mjs <outdir> p1,p2,... [width] [height] [baseURL]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [out = 'stills', list = '0,0.1,0.2,0.3,0.45,0.6,0.75,0.9,1', w = '1440', h = '810', base = 'http://127.0.0.1:5230/', tier = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 900)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 900)));
await page.goto(`${base}?p=0&still${tier ? '&tier=' + tier : ''}`);
await page.waitForSelector('[data-testid=ready]', { state: 'attached', timeout: 60000 });
await page.waitForTimeout(1300); // loader fade
for (const p of list.split(',')) {
  await page.evaluate((v) => { window.__liftoff.seek(parseFloat(v)); }, p);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/p${String(p).padEnd(5, '0')}.jpg`, type: 'jpeg', quality: 82 });
}
console.log([...new Set(errors)].slice(0, 12).join('\n') || 'no console errors');
await browser.close();
