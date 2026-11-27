// WSC PR 8 hardware capture: shared environmental coatings. B17 snow-to-rock on
// the WSC fixture (the PR 0 "hard snow collar") wide and at one boulder's foot,
// and moss on the B03 rainforest logs and B02 trunks, in D00 lit, D01 albedo,
// D22 moss coverage and D23 snow coverage.
import { parseArgs } from 'node:util';
import { SETTLE, loadWscCameras, prepareVisualPose, runWscCapture, settlePose } from './lib/wsc-capture.mjs';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: '' },
    out: { type: 'string', default: 'docs/qa/world-surface-context/pr-08' },
    // `snow` for B17 alone while iterating on the drift; `snow,moss` for the full set.
    scenes: { type: 'string', default: 'snow,moss' },
  },
});
const CAMERAS = await loadWscCameras();
const CLEAR = CAMERAS.lightingConditions.clear;

/** The rock nearest the camera ahead of it, for a close look at its foot (runs in the page). */
function nearestRockAhead() {
  const e = window.__editor;
  const cam = e.viewModeController.camera;
  const at = e.terrainView.floatingOrigin.toCanonical(cam.position.x, cam.position.z);
  const yaw = e.playerController.yaw;
  const forward = [-Math.sin(yaw), -Math.cos(yaw)];
  let best = null;
  for (const p of e.stylizedSurface.rockView?.getPlacements?.() ?? []) {
    const dx = p.x - at.x;
    const dz = p.z - at.z;
    const ahead = dx * forward[0] + dz * forward[1];
    const distance = Math.hypot(dx, dz);
    if (ahead < 2 || distance > 40) continue;
    if (!best || distance < best.distance) best = { x: p.x, z: p.z, distance, radius: e.stylizedSurface.rockView.config.rocks.radius * p.scale };
  }
  return best;
}

await runWscCapture({
  suite: 'pr8',
  out: args.out,
  url: args.url,
  modes: ['D00', 'D01', 'D22', 'D23'],
  shoot: async (page, take) => {
    // The fixture loader ends with the harness's strict 60-frame settle, which a shared
    // GPU can keep flickering; the fixture is in place either way and settlePose checks it.
    await page.evaluate(() => window.__worldVisualQa.loadWscFixture())
      .catch(error => console.warn(`[wsc-pr8] fixture settle: ${String(error.message).slice(0, 80)}`));
    const b17 = CAMERAS.locations.B17.cameras.C01;
    await take('B17-C01-clear', { pose: b17, settled: await settlePose(page, b17, CLEAR) });
    const rock = await page.evaluate(nearestRockAhead);
    if (rock) {
      const distance = Math.max(2.4, rock.radius * 3.2);
      const yaw = b17.yaw;
      const pose = {
        x: rock.x + Math.sin(yaw) * distance, z: rock.z + Math.cos(yaw) * distance, yaw,
        pitch: -0.2, mode: 'fly', heightAboveGround: Math.max(0.8, rock.radius), fov: 55,
      };
      await take('B17-rock-foot', { rock, pose, settled: await settlePose(page, pose, CLEAR) });
    }
    if (!args.scenes.split(',').includes('moss')) return;
    const b03 = CAMERAS.locations.B03.cameras.C02;
    await take('B03-C02-clear', { pose: b03, settled: await settlePose(page, b03, CLEAR) });
    const b02 = CAMERAS.locations.B02;
    await prepareVisualPose(page, { ...b02.cameras.C01, mode: 'player', heightAboveGround: 1.7 }, SETTLE).catch(() => {});
    const canopy = await page.evaluate(p => window.__worldVisualQa.findCanopyPose(p), { ...b02.cameras.C01, tileId: b02.tileId, canopy: true });
    const pose = canopy ? { ...b02.cameras.C02, x: canopy.x, z: canopy.z } : b02.cameras.C02;
    await take('B02-C02-clear', { pose, settled: await settlePose(page, pose, CLEAR) });
  },
});
