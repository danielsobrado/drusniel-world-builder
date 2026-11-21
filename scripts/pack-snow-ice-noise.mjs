// node scripts/pack-snow-ice-noise.mjs
// Generates lossless packed runtime textures for the snow & glacier shaders:
//   public/assets/textures/snow/snow-grain-rnm.png    RGBA: RG spherical-grain normal, B cavity, A height
//   public/assets/textures/snow/snow-drift-pack.png   RGB:  R sastrugi height, G pillow height, B sparkle mask
//   public/assets/textures/ice/glacier-depth-pack.png RGB:  R sharp cracks, G glacial veins, B melt scallops
// Source textures come from the CC0 library in assets/source-library/noise/ (AGENTS.md).
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { buildSnowGrainRnmPixels, normalizeChannel } from './lib/snow-ice-pack-math.mjs';

const SOURCE = 'assets/source-library/noise';
const SIZE = 512;

async function grey(file, invert = false) {
  const data = await sharp(`${SOURCE}/${file}.png`).greyscale().resize(SIZE, SIZE).raw().toBuffer();
  const out = Float32Array.from(data, (v) => (invert ? 255 - v : v) / 255);
  return normalizeChannel(out);
}

function blendChannels(a, b, weightB) {
  const out = new Float32Array(a.length);
  const wA = 1 - weightB;
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] * wA + b[i] * weightB;
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

await mkdir('public/assets/textures/snow', { recursive: true });
await mkdir('public/assets/textures/ice', { recursive: true });

// 1. Offline-baked 3-octave spherical-cap snow grain normal + cavity + height (Snowflow MIT).
const grainPixels = buildSnowGrainRnmPixels(SIZE);
await sharp(grainPixels, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile('public/assets/textures/snow/snow-grain-rnm.png');
console.log('wrote public/assets/textures/snow/snow-grain-rnm.png');

// 2. Snow drift & puffiness pack (CC0 noise library: directional wind sastrugi + soft pillow mounds).
const sastrugi = blendChannels(await grey('super-perlin/super-perlin-05'), await grey('gabor/gabor-03'), 0.22);
const pillow = await grey('perlin/perlin-05');
const crystal = await grey('grainy/grainy-05');
await sharp(packRgb(sastrugi, pillow, crystal), { raw: { width: SIZE, height: SIZE, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toFile('public/assets/textures/snow/snow-drift-pack.png');
console.log('wrote public/assets/textures/snow/snow-drift-pack.png');

// 3. Glacier interior fracture, vein, and melt-scallop pack (CC0 noise library).
const cracks = await grey('cracks/cracks-05', true);
const veins = await grey('vein/vein-07', true);
const scallops = await grey('voronoi/voronoi-05');
await sharp(packRgb(cracks, veins, scallops), { raw: { width: SIZE, height: SIZE, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toFile('public/assets/textures/ice/glacier-depth-pack.png');
console.log('wrote public/assets/textures/ice/glacier-depth-pack.png');
