// node scripts/pack-sand-noise.mjs
// Generates the lossless packed runtime texture for desert & coastal sand shaders:
//   public/assets/textures/sand/sand-detail-pack.png
//     RG: tileable tangent-space micro-grain + wind-ripple normal
//     B:  directional wind-combed sand wave & mineral streak height
//     A:  quartz sparkle & fine mineral grain variation
// Source textures come from the CC0 library in assets/source-library/noise/ (AGENTS.md).
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { normalizeChannel } from './lib/snow-ice-pack-math.mjs';
import { buildSandDetailPackPixels } from './lib/sand-pack-math.mjs';

const SOURCE = 'assets/source-library/noise';
const SIZE = 512;
const OUT = 'public/assets/textures/sand/sand-detail-pack.png';

async function grey(file, invert = false) {
  const data = await sharp(`${SOURCE}/${file}.png`).greyscale().resize(SIZE, SIZE).raw().toBuffer();
  const out = Float32Array.from(data, (v) => (invert ? 255 - v : v) / 255);
  return normalizeChannel(out);
}

await mkdir('public/assets/textures/sand', { recursive: true });

const [grain, ripple, broad] = await Promise.all([
  grey('grainy/grainy-05'),
  grey('gabor/gabor-05'),
  grey('perlin/perlin-05'),
]);

const pixels = buildSandDetailPackPixels({ size: SIZE, grain, ripple, broad });
await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT);
console.log(`wrote ${OUT}`);
