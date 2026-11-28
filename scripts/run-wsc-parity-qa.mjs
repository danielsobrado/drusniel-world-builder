// WSC PR 1 hardware parity: the GPU sampler (`sampleWorldSurfaceContextAt`), rendered
// into a float target and read back, against the CPU mirror on the same published
// window, at Stillmeadow's woodland and town views and right after a teleport, while
// part of the window is still unloaded (validity-weighted edges).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { stillmeadowPose } from './lib/stillmeadow-pose.mjs';
import { ROOT, loadWscCameras, runWscCapture, settlePose } from './lib/wsc-capture.mjs';

const { values: args } = parseArgs({
  options: { url: { type: 'string', default: '' }, out: { type: 'string', default: 'tmp/wsc-parity' } },
});
const CAMERAS = await loadWscCameras();
const report = {};
await runWscCapture({
  suite: 'parity',
  out: args.out,
  url: args.url,
  modes: ['D00'],
  shoot: async (page, take) => {
    const approach = await page.evaluate(() => window.__worldVisualQa.loadStillmeadow(18));
    const lighting = CAMERAS.lightingConditions.clear;
    for (const view of ['C01', 'C06']) {
      const pose = stillmeadowPose(approach, CAMERAS.locations.B14.cameras[view]);
      await take(`B14-${view}`, { pose, settled: await settlePose(page, pose, lighting) });
      report[`B14-${view}`] = await page.evaluate(() => window.__worldVisualQa.wscGpuParity());
    }
    // 2 km away, measured as soon as the first window publishes: unloaded texels inside it.
    const far = { ...stillmeadowPose(approach, CAMERAS.locations.B14.cameras.C01) };
    far.x += 2000;
    await page.evaluate(p => window.__worldVisualQa.cut(p), far);
    await page.waitForFunction(() => {
      const qa = window.__worldVisualQa;
      const d = qa.diagnostics();
      return qa.sampleGroundContactField(d.canonical.x, d.canonical.z).windowInside > 0;
    }, null, { timeout: 60000 });
    report.teleport = await page.evaluate(() => window.__worldVisualQa.wscGpuParity());
  },
});
await writeFile(path.resolve(ROOT, args.out, 'parity.json'), `${JSON.stringify(report, null, 2)}\n`);
for (const [view, r] of Object.entries(report)) {
  console.log(`${view}: ${r.valid}/${r.points} valid, ${r.failureCount} failures, max`, r.maxError);
}
if (Object.values(report).some(r => r.failureCount > 0)) process.exitCode = 1;
