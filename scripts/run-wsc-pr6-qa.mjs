// WSC PR 6 hardware capture: ecological footprints at the PR 0 deciduous-forest
// cameras (B02-C02 trunk close-up, B02-C03 canopy aerial), D00 plus the raw
// ecological channels D08 contact, D10 litter and D11 vegetation coverage, so the
// lobed footprints can be read against PR 0's circular stamps (DEF-09).
import { parseArgs } from 'node:util';
import { SETTLE, loadWscCameras, prepareVisualPose, runWscCapture, settlePose } from './lib/wsc-capture.mjs';

const { values: args } = parseArgs({
  options: {
    // Empty: an embedded Vite server that ignores file changes.
    url: { type: 'string', default: '' },
    out: { type: 'string', default: 'docs/qa/world-surface-context/pr-06' },
  },
});
const CAMERAS = await loadWscCameras();

await runWscCapture({
  suite: 'pr6',
  out: args.out,
  url: args.url,
  modes: ['D00', 'D08', 'D10', 'D11'],
  shoot: async (page, take) => {
    const loc = CAMERAS.locations.B02;
    // As PR 0 resolved it: a canopy pose found from C01, shared by the other cameras.
    await prepareVisualPose(page, { ...loc.cameras.C01, mode: 'player', heightAboveGround: 1.7 }, SETTLE);
    const found = await page.evaluate(p => window.__worldVisualQa.findCanopyPose(p), { ...loc.cameras.C01, tileId: loc.tileId, canopy: true });
    for (const camId of ['C02', 'C03']) {
      const pose = found ? { ...loc.cameras[camId], x: found.x, z: found.z } : loc.cameras[camId];
      const settled = await settlePose(page, pose, CAMERAS.lightingConditions.clear);
      await take(`B02-${camId}-clear`, { pose, settled });
    }
  },
});
