#!/usr/bin/env node
/**
 * Fetches the CC0 surface textures settlements are dressed in.
 *
 * Every set in `SETTLEMENT_SURFACE_SETS` comes from Poly Haven
 * (https://polyhaven.com, CC0 1.0 Universal): colour, OpenGL normal and the
 * packed AO/roughness/metalness map, taken at 1K
 * and reduced to 512 px WebP, which is all a street or a wall needs at the
 * texel density they are drawn at. Outputs land in
 * `public/assets/textures/settlement/<set>-{color,normal,arm}.webp`; the
 * sources are listed in THIRD_PARTY_NOTICES.md.
 *
 * Usage: npm run fetch:settlement-textures [-- --out <dir>] [-- --only a,b]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SETTLEMENT_SURFACE_SETS } from '../src/editor/world/settlements/surfaces/SettlementDressing.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 512;

const MAPS = Object.freeze({ color: 'Diffuse', normal: 'nor_gl', arm: 'arm' });

function option(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? null : process.argv[index + 1];
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchSurface(name, assetId, outDir, neutralMean = 0) {
  const files = JSON.parse((await download(`https://api.polyhaven.com/files/${assetId}`)).toString('utf8'));
  for (const [suffix, map] of Object.entries(MAPS)) {
    const url = files[map]?.['1k']?.jpg?.url;
    if (!url) throw new Error(`Poly Haven asset ${assetId} has no 1K ${map} map.`);
    const output = path.join(outDir, `${name}-${suffix}.webp`);
    let image = sharp(await download(url)).resize(SIZE, SIZE, { kernel: 'lanczos3' });
    // A surface its material tints is stored neutral at a fixed mean brightness,
    // so the tint lands as authored instead of a shade darker.
    if (suffix === 'color' && neutralMean > 0) {
      const { channels } = await image.clone().greyscale().stats();
      image = image.greyscale().linear(neutralMean / channels[0].mean, 0).toColourspace('srgb');
    }
    await image
      // Normals and packed data must not be chroma-smeared into their neighbours.
      .webp(suffix === 'color' ? { quality: 88 } : { quality: 92, smartSubsample: false })
      .toFile(output);
    console.log(`${path.relative(rootDir, output)}  ←  ${assetId} ${map}`);
  }
}

const outDir = path.resolve(rootDir, option('--out') ?? 'public/assets/textures/settlement');
const only = option('--only')?.split(',');
const extra = option('--asset');
fs.mkdirSync(outDir, { recursive: true });
const entries = extra
  ? extra.split(',').map((id) => [id, { source: id }])
  : Object.entries(SETTLEMENT_SURFACE_SETS).filter(([name, set]) => set.source && (!only || only.includes(name)));
for (const [name, set] of entries) await fetchSurface(name, set.source, outDir, set.neutralMean);
