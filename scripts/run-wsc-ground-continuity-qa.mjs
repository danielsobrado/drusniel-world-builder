// Ground continuity QA: does every object family sit in the same light as the ground?
// For each view it captures D00 (lit), D01 (albedo), D16 (direct), D17 (indirect) and
// D24 (material family), then reports per family the mean linear luma in each mode and
// its effective light, D00 / D01, against the terrain's. A family lit on its own scale
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
const MODES = ['D00', 'D01', 'D16', 'D17', 'D24'];
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
  const modes = Object.fromEntries(await Promise.all(MODES.slice(0, 4).map(async (m) => [m, await pixels(file(m))])));
  // D24 is unlit, untonemapped and drawn without the post graph, so each family reaches the
  // canvas as its exact sRGB bytes; anti-aliased edges fall outside the tolerance and are skipped.
  const palette = Object.values(WSC_MATERIAL_FAMILIES);
  const owner = new Int16Array(family.count).fill(-1);
  for (let i = 0; i < family.count; i += 1) {
    const o = i * 3;
    owner[i] = palette.findIndex(({ rgb }) => Math.abs(family.data[o] - rgb[0]) <= 3
      && Math.abs(family.data[o + 1] - rgb[1]) <= 3 && Math.abs(family.data[o + 2] - rgb[2]) <= 3);
  }
  const stats = {};
  for (const [index, { id }] of palette.entries()) {
    const sums = Object.fromEntries(MODES.slice(0, 4).map(m => [m, 0]));
    let n = 0;
    for (let i = 0; i < family.count; i += 1) {
      if (owner[i] !== index) continue;
      const o = i * 3;
      n += 1;
      for (const m of MODES.slice(0, 4)) {
        const d = modes[m].data;
        sums[m] += 0.2126 * linear(d[o] / 255) + 0.7152 * linear(d[o + 1] / 255) + 0.0722 * linear(d[o + 2] / 255);
      }
    }
    if (n < 400) continue;
    const mean = Object.fromEntries(Object.entries(sums).map(([m, s]) => [m, s / n]));
    stats[id] = { pixels: n, ...mean, light: mean.D00 / Math.max(mean.D01, 1e-4) };
  }
  const ground = stats.terrain?.light ?? null;
  for (const s of Object.values(stats)) s.lightVsTerrain = ground ? s.light / ground : null;
  report[view] = stats;
  console.log(`\n${view}`);
  console.table(Object.fromEntries(Object.entries(stats).map(([id, s]) => [id, {
    px: s.pixels, D00: s.D00.toFixed(4), D01: s.D01.toFixed(4), D16: s.D16.toFixed(4), D17: s.D17.toFixed(4),
    light: s.light.toFixed(3), 'vs terrain': s.lightVsTerrain?.toFixed(2),
  }])));
}
await writeFile(path.resolve(args.out, 'ground-continuity.json'), `${JSON.stringify(report, null, 2)}\n`);
