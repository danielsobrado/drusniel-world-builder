// WSC PR 7 hardware capture: settlement ground at the PR 0 Stillmeadow cameras
// (B14-C05 terrain-to-road, B14-C06 foundations and paving) and the B18
// settlement-to-terrain transition, lit (D00) and unlit (D01), to read the
// earth paving, aprons and wall feet against PR 0's static TOWN_GROUND (DEF-13).
import { parseArgs } from 'node:util';
import { stillmeadowPose } from './lib/stillmeadow-pose.mjs';
import { loadWscCameras, runWscCapture, settlePose } from './lib/wsc-capture.mjs';

const { values: args } = parseArgs({
  options: {
    // Empty: an embedded Vite server that ignores file changes.
    url: { type: 'string', default: '' },
    out: { type: 'string', default: 'docs/qa/world-surface-context/pr-07' },
  },
});
const CAMERAS = await loadWscCameras();
const clear = CAMERAS.lightingConditions.clear;

await runWscCapture({
  suite: 'pr7',
  out: args.out,
  url: args.url,
  modes: ['D00', 'D01'],
  shoot: async (page, take) => {
    // Stillmeadow's cameras are offsets along its approach, as PR 0 placed them.
    const approach = await page.evaluate(() => window.__worldVisualQa.loadStillmeadow(18));
    for (const camId of ['C05', 'C06']) {
      const pose = stillmeadowPose(approach, CAMERAS.locations.B14.cameras[camId]);
      const settled = await settlePose(page, pose, clear);
      await take(`B14-${camId}-clear`, { pose, settled });
    }
    const pose = CAMERAS.locations.B18.cameras.C01;
    await take('B18-C01-clear', { pose, settled: await settlePose(page, pose, clear) });
  },
});
