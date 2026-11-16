// node scripts/pack-ice-textures.mjs
// Builds the ice PBR set from the CC0 noise library (assets/source-library/noise):
//   ice-detail.png        R inner veins, G milky cloud, B fracture lines
//   ice-normal-rough.png  RG tangent-space normal (z rebuilt in the shader), B roughness
// Lossless and linear: packed channels must not bleed into each other.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { iceHeight, iceRoughness, packNormal } from './lib/ice-pack-math.mjs';

const SOURCE = 'assets/source-library/noise';
const OUT = 'public/assets/textures/ice';
const SIZE = 512;

async function grey(file, invert = false) {
  const data = await sharp(`${SOURCE}/${file}.png`).greyscale().resize(SIZE, SIZE).raw().toBuffer();
  return Float32Array.from(data, (v) => (invert ? 255 - v : v) / 255);
}

const veins = await grey('marble/marble-03', true);   // dark veins become bright inclusions
const cloud = await grey('milky/milky-05');           // wisps of frosted cloud
const cracks = await grey('cracks/cracks-07', true);  // fracture web as a mask
const ripple = await grey('marble/marble-05');        // flowing melt ridges
const pits = await grey('craters/craters-07');        // melt pocks

const height = iceHeight({ ripple, pits, cracks, size: SIZE });
const normal = packNormal(height, SIZE, 5.5);
const rough = iceRoughness({ cloud, cracks, pits });

const detail = Buffer.alloc(SIZE * SIZE * 3);
const surface = Buffer.alloc(SIZE * SIZE * 3);
for (let i = 0; i < SIZE * SIZE; i += 1) {
  detail[i * 3] = Math.round(veins[i] * 255);
  detail[i * 3 + 1] = Math.round(cloud[i] * 255);
  detail[i * 3 + 2] = Math.round(cracks[i] * 255);
  surface[i * 3] = normal[i * 2];
  surface[i * 3 + 1] = normal[i * 2 + 1];
  surface[i * 3 + 2] = Math.round(rough[i] * 255);
}
await mkdir(OUT, { recursive: true });
const raw = { width: SIZE, height: SIZE, channels: 3 };
await sharp(detail, { raw }).png({ compressionLevel: 9 }).toFile(`${OUT}/ice-detail.png`);
await sharp(surface, { raw }).png({ compressionLevel: 9 }).toFile(`${OUT}/ice-normal-rough.png`);
console.log('wrote', `${OUT}/ice-detail.png`, `${OUT}/ice-normal-rough.png`);
