// WSC PR 7 hardware capture: settlement ground at the PR 0 Stillmeadow cameras
// (B14-C05 terrain-to-road, B14-C06 foundations and paving) and the B18
// settlement-to-terrain transition, lit (D00) and unlit (D01), to read the
// earth paving, aprons and wall feet against PR 0's static TOWN_GROUND (DEF-13).
import { parseArgs } from 'node:util';
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
    const yaw = (approach.yawDegrees * Math.PI) / 180;
    for (const camId of ['C05', 'C06']) {
      const spec = CAMERAS.locations.B14.cameras[camId];
      const pose = {
        x: approach.settlementFixture.canonicalX - Math.sin(yaw) * spec.offsetForward,
        z: approach.settlementFixture.canonicalZ - Math.cos(yaw) * spec.offsetForward,
        yaw: yaw + (spec.yawOffset ?? 0),
        pitch: spec.pitch,
        mode: spec.mode,
        heightAboveGround: spec.heightAboveGround,
        fov: spec.fov,
      };
      const settled = await settlePose(page, pose, clear);
      await take(`B14-${camId}-clear`, { pose, settled });
    }
    const pose = CAMERAS.locations.B18.cameras.C01;
    await take('B18-C01-clear', { pose, settled: await settlePose(page, pose, clear) });
  },
});
