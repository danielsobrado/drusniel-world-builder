// WSC ground-contact gates owed by PR 5 and PR 6 (hardware WebGPU):
//  - PR 6: the B02 canopy floor straight down with trees hidden, so the trunk/bush
//    footprints in D08 contact and D10 litter are not occluded by crowns.
//  - PR 5: the steepest boulder near each site, seen along the contour, so a
//    floating downhill rim or an uphill gap would show; plus the understory round it.
import { parseArgs } from 'node:util';
import { SETTLE, loadWscCameras, prepareVisualPose, runWscCapture, settlePose } from './lib/wsc-capture.mjs';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: '' },
    out: { type: 'string', default: 'docs/qa/world-surface-context/contact-gaps' },
    sites: { type: 'string', default: 'B02,B15' },
  },
});
const CAMERAS = await loadWscCameras();
const CLEAR = CAMERAS.lightingConditions.clear;

/** The steepest-seated boulder within 90 m of the camera (runs in the page). */
function steepestRock() {
  const e = window.__editor;
  const view = e.stylizedSurface.rockView;
  const cam = e.terrainView.floatingOrigin.toCanonical(e.viewModeController.camera.position.x, e.viewModeController.camera.position.z);
  const height = (x, z) => e.terrainView.getCanonicalHeight(x, z);
  let best = null;
  for (const p of view?.getPlacements?.() ?? []) {
    if (Math.hypot(p.x - cam.x, p.z - cam.z) > 90) continue;
    const radius = view.config.rocks.radius * p.scale;
    if (radius < 0.35) continue;
    // Slope across the footprint from exact terrain, and convexity (centre above its
    // ring), where a planar seat would lift a rim.
    const r = Math.max(radius, 0.75);
    const gx = (height(p.x + r, p.z) - height(p.x - r, p.z)) / (2 * r);
    const gz = (height(p.x, p.z + r) - height(p.x, p.z - r)) / (2 * r);
    let ring = 0;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ring += height(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
    }
    const convexity = height(p.x, p.z) - ring / 8;
    const score = Math.hypot(gx, gz) + Math.max(0, convexity) * 2;
    if (!best || score > best.score) best = { x: p.x, z: p.z, radius, gx, gz, convexity, score };
  }
  return best;
}

await runWscCapture({
  suite: 'contact-gaps',
  out: args.out,
  url: args.url,
  modes: ['D00', 'D08', 'D10', 'D11'],
  shoot: async (page, take) => {
    const b02 = CAMERAS.locations.B02;
    await prepareVisualPose(page, { ...b02.cameras.C01, mode: 'player', heightAboveGround: 1.7 }, SETTLE).catch(() => {});
    const canopy = await page.evaluate(p => window.__worldVisualQa.findCanopyPose(p), { ...b02.cameras.C01, tileId: b02.tileId, canopy: true });
    const top = { ...b02.cameras.C03, ...(canopy ? { x: canopy.x, z: canopy.z } : {}), heightAboveGround: 34, pitch: -1.5 };
    await take('B02-top-notrees', { pose: top, settled: await settlePose(page, top, CLEAR) }, { layers: { trees: false } });

    for (const site of args.sites.split(',')) {
      await settlePose(page, { ...CAMERAS.locations[site].cameras.C01, mode: 'player', heightAboveGround: 1.7 }, CLEAR);
      const rock = await page.evaluate(steepestRock);
      if (!rock) continue;
      // Along the contour (perpendicular to the gradient), so the slope reads in profile.
      const slope = Math.hypot(rock.gx, rock.gz) || 1;
      const distance = Math.max(3.2, rock.radius * 4.2);
      const camX = rock.x - (rock.gz / slope) * distance;
      const camZ = rock.z + (rock.gx / slope) * distance;
      const pose = {
        x: camX, z: camZ, yaw: Math.atan2(camX - rock.x, camZ - rock.z), pitch: -0.22,
        mode: 'fly', heightAboveGround: Math.max(0.9, rock.radius * 1.3), fov: 55,
      };
      await take(`${site}-slope-rock`, { rock, pose, settled: await settlePose(page, pose, CLEAR) });
    }
  },
});
