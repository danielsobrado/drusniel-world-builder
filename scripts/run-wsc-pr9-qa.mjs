// WSC PR 9 hardware capture: lighting and weather consistency (PR 0 Gallery F).
// Stillmeadow's woodland approach (B14-C01) and the grassland (B01-C01) at
// sunrise, clear noon, overcast, sunset and rain in D00; at sunset also D16
// direct-only and D17 indirect + emissive, to split a collapse between the sun
// and the fills.
import { parseArgs } from 'node:util';
import { loadWscCameras, runWscCapture, settlePose } from './lib/wsc-capture.mjs';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: '' },
    out: { type: 'string', default: 'docs/qa/world-surface-context/pr-09' },
    // `woodland` for Stillmeadow alone while iterating.
    scenes: { type: 'string', default: 'woodland,grassland' },
  },
});
const CAMERAS = await loadWscCameras();
const HOURS = ['sunrise', 'clear', 'overcast', 'sunset', 'rain'];
const scenes = args.scenes.split(',');

/** One view under each lighting condition: D00 always, plus D16/D17 at sunset. */
async function sweep(page, take, name, pose) {
  for (const hour of HOURS) {
    const lighting = CAMERAS.lightingConditions[hour];
    const settled = await settlePose(page, pose, lighting);
    await take(`${name}-${hour}`, { pose, lighting, settled }, { modes: hour === 'sunset' ? ['D00', 'D16', 'D17'] : ['D00'] });
  }
}

await runWscCapture({
  suite: 'pr9',
  out: args.out,
  url: args.url,
  modes: ['D00'],
  sheetColumns: 7,
  shoot: async (page, take) => {
    // The procedural world is the page's own; Stillmeadow loads the Eldara map after it.
    if (scenes.includes('grassland')) await sweep(page, take, 'B01-C01', CAMERAS.locations.B01.cameras.C01);
    if (!scenes.includes('woodland') && !scenes.includes('trunks')) return;
    // Stillmeadow's cameras are offsets along its approach, as PR 0 placed them.
    const approach = await page.evaluate(() => window.__worldVisualQa.loadStillmeadow(18));
    const yaw = (approach.yawDegrees * Math.PI) / 180;
    const stillmeadow = (camId) => {
      const spec = CAMERAS.locations.B14.cameras[camId];
      return {
        x: approach.settlementFixture.canonicalX - Math.sin(yaw) * spec.offsetForward,
        z: approach.settlementFixture.canonicalZ - Math.cos(yaw) * spec.offsetForward,
        yaw: yaw + (spec.yawOffset ?? 0), pitch: spec.pitch, mode: spec.mode,
        heightAboveGround: spec.heightAboveGround, fov: spec.fov,
      };
    };
    if (scenes.includes('woodland')) await sweep(page, take, 'B14-C01', stillmeadow('C01'));
    // DEF-10: trunk bases and understory under the canopy, lit and indirect-only, at noon.
    if (scenes.includes('trunks')) {
      for (const camId of ['C03', 'C04']) {
        const pose = stillmeadow(camId);
        const lighting = CAMERAS.lightingConditions.clear;
        await take(`B14-${camId}-clear`, { pose, lighting, settled: await settlePose(page, pose, lighting) }, { modes: ['D00', 'D17'] });
      }
    }
  },
});
