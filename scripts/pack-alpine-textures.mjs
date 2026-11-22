// node scripts/pack-alpine-textures.mjs
// Packs CC0 tileable noises from assets/source-library/noise/ into one RGB image
// loaded on demand by alpine/ice locations (never at startup):
//   public/assets/textures/ice/alpine-detail-pack.png
//     R: alpine rock couloir & scree chute gullies (cracks-02, inverted)
//     G: wind-drifted snowfield & ridge warp turbulence (turbulence-04)
//     B: directional snow-streak & coarse woven/bark grain (streak-06)
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { normalizeChannel } from './lib/snow-ice-pack-math.mjs';

const SOURCE = 'assets/source-library/noise';
const SIZE = 512;

async function grey(file, invert = false) {
  const data = await sharp(`${SOURCE}/${file}.png`).greyscale().resize(SIZE, SIZE).raw().toBuffer();
  const out = Float32Array.from(data, (v) => (invert ? 255 - v : v) / 255);
  return normalizeChannel(out);
}

function packRgb(r, g, b) {
  const out = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    out[i * 3] = Math.round(r[i] * 255);
    out[i * 3 + 1] = Math.round(g[i] * 255);
    out[i * 3 + 2] = Math.round(b[i] * 255);
  }
  return out;
}

await mkdir('public/assets/textures/ice', { recursive: true });

const couloirs = await grey('cracks/cracks-02', true);
const driftTurbulence = await grey('turbulence/turbulence-04', false);
const windStreak = await grey('streak/streak-06', false);

await sharp(packRgb(couloirs, driftTurbulence, windStreak), { raw: { width: SIZE, height: SIZE, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toFile('public/assets/textures/ice/alpine-detail-pack.png');

console.log('wrote public/assets/textures/ice/alpine-detail-pack.png');
