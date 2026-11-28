// Ground continuity QA: does every object family sit in the same light as the ground?
// For each view it captures D00 (lit), D01 (albedo), D16 (direct), D17 (indirect) and
// D24 (material family), then reports per family the mean linear luma in each mode and
// its effective light, D00 / D01, against the terrain's under the same canopy (D09:
// a stone in a clearing is compared with open ground, not with the shaded floor of
// the wood behind it). A family lit on its own scale
// (a glowing boulder, a black shrub, a bright trunk on a dark floor) stands out as a
// light ratio far from the terrain's.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { stillmeadowPose } from './lib/stillmeadow-pose.mjs';
import { loadWscCameras, runWscCapture, settlePose } from './lib/wsc-capture.mjs';
import { WSC_MATERIAL_FAMILIES } from '../src/editor/performance/qa/wscDiagnosticModes.js';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: '' },
    out: { type: 'string', default: 'tmp/wsc-ground-continuity' },
    views: { type: 'string', default: 'B14-C06,B14-C04,B14-C01' },
    // Re-run the analysis on an earlier capture in `out`.
    'analyse-only': { type: 'boolean', default: false },
  },
});
const MODES = ['D00', 'D01', 'D16', 'D17', 'D09', 'D24'];
const LIT = MODES.slice(0, 4);
/** Canopy bands the comparison is made within: open, partial, closed. */
const CANOPY_BANDS = 3;
const CAMERAS = await loadWscCameras();
const views = args.views.split(',');

if (!args['analyse-only']) await runWscCapture({
  suite: 'ground-continuity',
  out: args.out,
  url: args.url,
  modes: MODES,
  sheetColumns: MODES.length,
  shoot: async (page, take) => {
    const approach = await page.evaluate(() => window.__worldVisualQa.loadStillmeadow(18));
    const lighting = CAMERAS.lightingConditions.clear;
    for (const view of views) {
      const pose = stillmeadowPose(approach, CAMERAS.locations.B14.cameras[view.replace('B14-', '')]);
      await take(view, { pose, lighting, settled: await settlePose(page, pose, lighting) });
    }
  },
});

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
async function pixels(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, count: info.width * info.height };
}

const report = {};
for (const view of views) {
  const file = (mode) => path.resolve(args.out, `${view}-${mode}.png`);
  const family = await pixels(file('D24'));
  const modes = Object.fromEntries(await Promise.all(LIT.map(async (m) => [m, await pixels(file(m))])));
  const canopy = await pixels(file('D09'));
  // D24 is unlit, untonemapped and drawn without the post graph, so each family reaches the
  // canvas as its exact sRGB bytes; anti-aliased edges fall outside the tolerance and are skipped.
  const palette = Object.values(WSC_MATERIAL_FAMILIES);
  const owner = new Int16Array(family.count).fill(-1);
  for (let i = 0; i < family.count; i += 1) {
    const o = i * 3;
    owner[i] = palette.findIndex(({ rgb }) => Math.abs(family.data[o] - rgb[0]) <= 3
      && Math.abs(family.data[o + 1] - rgb[1]) <= 3 && Math.abs(family.data[o + 2] - rgb[2]) <= 3);
  }
  const luma = (d, o) => 0.2126 * linear(d[o] / 255) + 0.7152 * linear(d[o + 1] / 255) + 0.0722 * linear(d[o + 2] / 255);
  // D09 draws canopy as green 0.05 → 0.92 (linear) inside the WSC window.
  const band = (o) => Math.min(CANOPY_BANDS - 1, Math.floor(Math.max(0, Math.min(1,
    (linear(canopy.data[o + 1] / 255) - 0.05) / 0.87)) * CANOPY_BANDS));
  const sums = palette.map(() => Array.from({ length: CANOPY_BANDS }, () => ({ n: 0, ...Object.fromEntries(LIT.map(m => [m, 0])) })));
  for (let i = 0; i < family.count; i += 1) {
    if (owner[i] < 0) continue;
    const o = i * 3;
    const cell = sums[owner[i]][band(o)];
    cell.n += 1;
    for (const m of LIT) cell[m] += luma(modes[m].data, o);
  }
  const light = (cell) => cell.D00 / Math.max(cell.D01, 1e-4);
  const ground = sums[palette.findIndex(({ id }) => id === 'terrain')];
  const stats = {};
  for (const [index, { id }] of palette.entries()) {
    const cells = sums[index];
    const n = cells.reduce((sum, cell) => sum + cell.n, 0);
    if (n < 400) continue;
    const mean = Object.fromEntries(LIT.map(m => [m, cells.reduce((sum, cell) => sum + cell[m], 0) / n]));
    // Pixel-weighted, over the bands where the terrain itself is seen enough to compare.
    let weight = 0;
    let ratio = 0;
    cells.forEach((cell, b) => {
      if (cell.n < 100 || ground[b].n < 200) return;
      weight += cell.n;
      ratio += cell.n * light(cell) / light(ground[b]);
    });
    stats[id] = { pixels: n, ...mean, light: mean.D00 / Math.max(mean.D01, 1e-4),
      canopyBands: cells.map(cell => cell.n), lightVsTerrain: weight ? ratio / weight : null };
  }
  report[view] = stats;
  console.log(`\n${view}`);
  console.table(Object.fromEntries(Object.entries(stats).map(([id, s]) => [id, {
    px: s.pixels, D00: s.D00.toFixed(4), D01: s.D01.toFixed(4), D16: s.D16.toFixed(4), D17: s.D17.toFixed(4),
    light: s.light.toFixed(3), 'vs terrain (same canopy)': s.lightVsTerrain?.toFixed(2) ?? 'n/a',
  }])));
}
await writeFile(path.resolve(args.out, 'ground-continuity.json'), `${JSON.stringify(report, null, 2)}\n`);
