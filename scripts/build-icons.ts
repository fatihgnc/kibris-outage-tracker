import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

// Derives every PWA and Apple icon from the one hand-made source, `app/favicon.ico`,
// so the tab icon and the home-screen icon can never drift apart. Run by hand
// (`npm run build:icons`) whenever that .ico changes — the outputs are committed,
// so a normal build does no image work.

const root = process.cwd();
const source = join(root, 'app', 'favicon.ico');
const publicDir = join(root, 'public');
const appDir = join(root, 'app');

// Everything the launcher adds around the artwork is painted in the tile's own
// edge colour, sampled from the source, so the square never shows as a lighter
// or darker patch inside the icon.
type Rgb = { r: number; g: number; b: number };

/** The colour the tile fades to at its border, read at the middle of each side. */
async function edgeColour(frame: Buffer): Promise<Rgb> {
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const inset = Math.round(w * 0.06); // clear of the rounded corners' transparency
  const samples = [
    [w >> 1, inset],
    [w >> 1, h - 1 - inset],
    [inset, h >> 1],
    [w - 1 - inset, h >> 1],
  ];
  const total = samples.reduce(
    (acc, [x, y]) => {
      const i = (y * w + x) * info.channels;
      return { r: acc.r + data[i], g: acc.g + data[i + 1], b: acc.b + data[i + 2] };
    },
    { r: 0, g: 0, b: 0 },
  );
  const n = samples.length;
  return { r: Math.round(total.r / n), g: Math.round(total.g / n), b: Math.round(total.b / n) };
}

/**
 * How far the lit artwork reaches from the centre, as a fraction of the width.
 * Anything dark enough to read as background is ignored, so this measures the
 * island and its glow rather than the tile.
 */
async function contentRadius(frame: Buffer): Promise<number> {
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const cx = w / 2;
  const cy = h / 2;
  let max = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * info.channels;
      if (data[i + 3] < 200) continue;
      if (data[i] + data[i + 1] + data[i + 2] < 150) continue;
      max = Math.max(max, Math.hypot(x - cx, y - cy) / w);
    }
  }
  return max;
}

/**
 * `.ico` is a container sharp cannot open, so pull out the largest image it
 * holds. Every entry in this file is a PNG; a width byte of 0 means 256.
 */
function largestFrame(ico: Buffer): Buffer {
  const count = ico.readUInt16LE(4);
  let best = { width: 0, offset: 0, length: 0 };
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const width = ico[entry] || 256;
    if (width <= best.width) continue;
    best = { width, offset: ico.readUInt32LE(entry + 12), length: ico.readUInt32LE(entry + 8) };
  }
  if (!best.length) throw new Error(`no images found in ${source}`);
  const frame = ico.subarray(best.offset, best.offset + best.length);
  if (frame[0] !== 0x89 || frame[1] !== 0x50) {
    throw new Error(`the ${best.width}px frame is a bitmap, not a PNG — re-export the .ico`);
  }
  return frame;
}

/** Transparent-cornered tile, for surfaces that draw their own backdrop. */
async function transparent(frame: Buffer, size: number, target: string) {
  await sharp(frame).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(target);
}

/**
 * Android masks these to whatever shape the launcher likes, and the strictest
 * of those shapes is a circle covering the middle 80% — a radius of 0.4 widths.
 * The island's eastern tip reaches further than that, so the tile is shrunk by
 * whatever factor brings it inside, and the rest is flooded with the tile's own
 * edge colour.
 */
async function maskable(frame: Buffer, size: number, target: string, scale: number, ground: Rgb) {
  const inner = Math.round(size * scale);
  const inset = Math.round((size - inner) / 2);
  const art = await sharp(frame).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: ground } })
    .composite([{ input: art, top: inset, left: inset }])
    .png({ compressionLevel: 9 })
    .toFile(target);
}

/**
 * iOS ignores transparency and rounds the corners itself, so this one goes out
 * full-bleed with the rounded corners filled back in.
 */
async function opaque(frame: Buffer, size: number, target: string, ground: Rgb) {
  await sharp(frame)
    .resize(size, size, { kernel: 'lanczos3' })
    .flatten({ background: ground })
    .png({ compressionLevel: 9 })
    .toFile(target);
}

async function main() {
  const started = Date.now();
  const frame = largestFrame(readFileSync(source));
  const sourceSize = (await sharp(frame).metadata()).width ?? 0;
  const ground = await edgeColour(frame);
  // A little under the safe radius, so the tip is not sitting exactly on the cut.
  const scale = Math.min(1, (0.4 / (await contentRadius(frame))) * 0.96);
  mkdirSync(publicDir, { recursive: true });

  await Promise.all([
    transparent(frame, 192, join(publicDir, 'icon-192.png')),
    transparent(frame, 512, join(publicDir, 'icon-512.png')),
    maskable(frame, 192, join(publicDir, 'icon-maskable-192.png'), scale, ground),
    maskable(frame, 512, join(publicDir, 'icon-maskable-512.png'), scale, ground),
    opaque(frame, 180, join(appDir, 'apple-icon.png'), ground),
  ]);

  // A 512px target upscaled from a smaller source would go soft; say so rather
  // than shipping a blurry home-screen icon unnoticed.
  if (sourceSize < 512) {
    console.warn(`warning: source is only ${sourceSize}px — the 512px icons are upscaled`);
  }
  console.log(
    `icons written in ${Date.now() - started}ms from the ${sourceSize}px frame of app/favicon.ico — ` +
      `maskable art scaled to ${(scale * 100).toFixed(0)}% on rgb(${ground.r},${ground.g},${ground.b})`,
  );

  // Keep the writes above in step with what `app/manifest.ts` advertises.
  const manifest = readFileSync(join(appDir, 'manifest.ts'), 'utf8');
  for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png']) {
    if (!manifest.includes(name)) throw new Error(`${name} is not listed in app/manifest.ts`);
  }
}

main();
