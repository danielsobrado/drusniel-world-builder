// node scripts/pack-deadwood-noise.mjs
// Packs three tileable CC0 greyscale noises from assets/source-library/noise/
// into public/assets/textures/noise/deadwood-noise.png:
//   R: streak/streak-10       (gnarled wood grain & knot swirl)
//   G: cracks/cracks-09       (drying checks, fissures, end-grain cracks)
//   B: super-noise/super-noise-05 (organic moss & lichen cushion breakup)
// Lossless RGBA/RGB PNG so channels stay independent.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { stretchToTarget } from './lib/noise-pack-math.mjs';

const SOURCE = 'assets/source-library/noise';
const OUT = 'public/assets/textures/noise/deadwood-noise.png';
const SIZE = 256;
const CHANNELS = ['streak/streak-10', 'cracks/cracks-09', 'super-noise/super-noise-05'];

async function sampleChannel(spec) {
  const file = `${SOURCE}/${spec}.png`;
  const { width, height } = await sharp(file).metadata();
  const tile = await sharp(file).greyscale().toBuffer();
  const mosaic = await sharp({
    create: { width: width * 3, height: height * 3, channels: 3, background: '#000' },
  })
    .composite(
      Array.from({ length: 9 }, (_, i) => ({
        input: tile,
        left: (i % 3) * width,
        top: Math.floor(i / 3) * height,
      })),
    )
    .png()
    .toBuffer();
  const grey = await sharp(mosaic)
    .resize(SIZE * 3, SIZE * 3)
    .extract({ left: SIZE, top: SIZE, width: SIZE, height: SIZE })
    .greyscale()
    .raw()
    .toBuffer();
  return stretchToTarget(Float32Array.from(grey, (value) => value / 255));
}

const channels = await Promise.all(CHANNELS.map(sampleChannel));
const rgb = Buffer.alloc(SIZE * SIZE * 3);
for (let pixel = 0; pixel < SIZE * SIZE; pixel += 1) {
  for (let c = 0; c < 3; c += 1) rgb[pixel * 3 + c] = Math.round(channels[c][pixel] * 255);
}
await mkdir('public/assets/textures/noise', { recursive: true });
await sharp(rgb, { raw: { width: SIZE, height: SIZE, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT);
console.log('wrote', OUT, CHANNELS.join(' | '));
