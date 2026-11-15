// node scripts/pack-noise-textures.mjs
// Packs the CC0 noise library (assets/source-library/noise) into the runtime
// world-noise strip: one 256 px square per layer, three greyscale noises in
// R, G and B. Lossless: a lossy codec bleeds one channel into the next.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { WORLD_NOISE_LAYER_NAMES, WORLD_NOISE_SIZE } from '../src/editor/stylized/worldNoiseLayout.js';
import { stretchToTarget } from './lib/noise-pack-math.mjs';

const SOURCE = 'assets/source-library/noise';
const OUT = 'public/assets/textures/noise/world-noise.png';
/** Layer -> [R, G, B] sources; a leading `!` inverts (lines become ridges). */
const LAYERS = {
  macro: ['perlin/perlin-12', 'perlin/perlin-06', 'perlin/perlin-17'],
  meso: ['perlin/perlin-24', 'super-noise/super-noise-09', 'melt/melt-09'],
  micro: ['grainy/grainy-09', 'craters/craters-05', 'cracks/cracks-09'],
  water: ['!vein/vein-13', '!voronoi/voronoi-10', 'perlin/perlin-05'],
  sky: ['voronoi/voronoi-04', 'super-perlin/super-perlin-10', 'turbulence/turbulence-01'],
};

async function channel(spec) {
  const invert = spec.startsWith('!');
  const file = `${SOURCE}/${invert ? spec.slice(1) : spec}.png`;
  // Resize a 3x3 mosaic and crop its centre, so the filter wraps at the edges.
  const { width, height } = await sharp(file).metadata();
  const tile = await sharp(file).greyscale().toBuffer();
  const mosaic = await sharp({ create: { width: width * 3, height: height * 3, channels: 3, background: '#000' } })
    .composite(Array.from({ length: 9 }, (_, i) => ({ input: tile, left: (i % 3) * width, top: Math.floor(i / 3) * height })))
    .png().toBuffer();
  const grey = await sharp(mosaic).resize(WORLD_NOISE_SIZE * 3, WORLD_NOISE_SIZE * 3)
    .extract({ left: WORLD_NOISE_SIZE, top: WORLD_NOISE_SIZE, width: WORLD_NOISE_SIZE, height: WORLD_NOISE_SIZE })
    .greyscale().raw().toBuffer();
  const values = Float32Array.from(grey, (value) => (invert ? 255 - value : value) / 255);
  return stretchToTarget(values);
}

const size = WORLD_NOISE_SIZE;
const strip = Buffer.alloc(size * size * 3 * WORLD_NOISE_LAYER_NAMES.length);
for (const [index, name] of WORLD_NOISE_LAYER_NAMES.entries()) {
  const channels = await Promise.all(LAYERS[name].map(channel));
  const offset = index * size * size * 3;
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    for (let c = 0; c < 3; c += 1) strip[offset + pixel * 3 + c] = Math.round(channels[c][pixel] * 255);
  }
  console.log(name, LAYERS[name].join(' | '));
}
await mkdir('public/assets/textures/noise', { recursive: true });
await sharp(strip, { raw: { width: size, height: size * WORLD_NOISE_LAYER_NAMES.length, channels: 3 } })
  .png({ compressionLevel: 9 }).toFile(OUT);
console.log('wrote', OUT);
