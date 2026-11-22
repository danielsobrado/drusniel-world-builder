// node scripts/pack-ice-cave-textures.mjs
// Packs CC0 tileable noises from assets/source-library/noise/ into one RGB image
// loaded on demand by Frostgard ice locations (never at startup):
//   public/assets/textures/ice/ice-cave-crystal-pack.png
//     R: sharp fracture crack web (cracks-05, inverted)
//     G: interconnected caustic web filaments (voronoi-03 inverted + vein-07)
//     B: high-frequency micro-facet crystal sparkle seed (grainy-05)
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

await mkdir('public/assets/textures/ice', { recursive: true });

const cracks = await grey('cracks/cracks-05', true);
// Invert voronoi-03 so cell borders (not centers) form bright interconnected caustic web ridges,
// blended with vein-07 for fine organic optical filament breakup.
const voronoiWeb = await grey('voronoi/voronoi-03', true);
const veinWeb = await grey('vein/vein-07', false);
const causticWeb = blendChannels(voronoiWeb, veinWeb, 0.28);
const sparkleGrain = await grey('grainy/grainy-05');

await sharp(packRgb(cracks, causticWeb, sparkleGrain), { raw: { width: SIZE, height: SIZE, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toFile('public/assets/textures/ice/ice-cave-crystal-pack.png');

console.log('wrote public/assets/textures/ice/ice-cave-crystal-pack.png');
