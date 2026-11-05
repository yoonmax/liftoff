// Tiles captured stills into one image for design review. Usage: node scripts/contact-sheet.mjs <dir> <out.jpg> [cols] [tileWidth]
import sharp from 'sharp';
import fs from 'node:fs'; import path from 'node:path';
const [dir, out, cols = '3', tw = '640'] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => /\.(jpg|png)$/.test(f)).sort();
const c = +cols, w = +tw; const first = await sharp(path.join(dir, files[0])).metadata(); const h = Math.round(w * first.height / first.width);
const comps = await Promise.all(files.map(async (f, i) => ({ input: await sharp(path.join(dir, f)).resize(w, h).composite([{ input: Buffer.from(`<svg width="${w}" height="24"><rect width="70" height="20" fill="black" fill-opacity=".6"/><text x="4" y="15" fill="#fff" font-size="13" font-family="monospace">${f.replace(/\.\w+$/, '')}</text></svg>`), top: 0, left: 0 }]).toBuffer(), left: (i % c) * w, top: Math.floor(i / c) * h })));
await sharp({ create: { width: c * w, height: Math.ceil(files.length / c) * h, channels: 3, background: '#000' } }).composite(comps).jpeg({ quality: 85 }).toFile(out);
