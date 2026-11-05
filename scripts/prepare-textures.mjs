// Converts the downloaded NASA source images into the WebP textures the site ships.
// Usage: node scripts/prepare-textures.mjs <source-dir>
// Expected inputs: earth-day/day.jpg, earth-night/night.jpg, moon-color/color.jpg, moon-height/height.jpg
// Sources and licences are documented in README.md.
import sharp from 'sharp';
import path from 'node:path';

const src = process.argv[2];
if (!src) { console.log('source dir not given, skipping NASA texture conversion'); process.exit(0); }
const out = (n) => path.join('public/textures', n);
sharp.cache(false);

const big = { limitInputPixels: false };

await sharp(path.join(src, 'earth-day/day.jpg'), big).resize(5400, 2700).webp({ quality: 80, effort: 5 }).toFile(out('earth_day.webp'));

// Ocean mask derived from the day map: open water is dark and blue-dominant, shallow water is teal.
{
  const { data, info } = await sharp(path.join(src, 'earth-day/day.jpg'), big).resize(2048, 1024).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const blue = b - Math.max(r, g * 0.92);
    const v = Math.min(1, Math.max(0, (blue + 2) / 14)) * (r < 110 ? 1 : 0);
    mask[i] = Math.round(v * 255);
  }
  await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } }).blur(0.8).webp({ quality: 82 }).toFile(out('earth_mask.webp'));
}

await sharp(path.join(src, 'earth-night/night.jpg')).resize(2880, 1440).webp({ quality: 78, effort: 5 }).toFile(out('earth_night.webp'));
await sharp(path.join(src, 'moon-color/color.jpg')).webp({ quality: 80, effort: 5 }).toFile(out('moon_color.webp'));
await sharp(path.join(src, 'moon-height/height.jpg')).webp({ quality: 88, effort: 5 }).toFile(out('moon_height.webp'));
console.log('nasa textures written');
