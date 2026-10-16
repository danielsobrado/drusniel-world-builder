import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { waitForPerfRunLock } from '../scripts/perf-run-lock.mjs';
import { captureVisualSource, visualSourceStayedFixed } from '../scripts/lib/world-visual-source.mjs';
import { fileHash } from '../scripts/lib/world-visual-report.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(root, process.env.AAA_AUDIT_OUT ?? 'docs/qa/visual-audit-2026-10-16');
const url = process.env.AAA_AUDIT_URL ?? 'http://localhost:5182';
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
const report = { startedAt: new Date().toISOString(), warnings: [], errors: [], worlds: [] };
let browser;
try {
  const source = await captureVisualSource(url, root);
  report.sourceSha = source.sourceSha;
  report.scriptSha256 = await fileHash(fileURLToPath(import.meta.url));
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', message => {
    if (message.type() === 'warning') report.warnings.push({ text: message.text(), location: message.location() });
    if (message.type() === 'error') report.errors.push(message.text());
  });
  page.on('pageerror', error => report.errors.push(error.stack));
  await page.goto(`${url}/?qaVisual=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
  for (const world of ['procedural', 'eldara']) {
    if (world === 'eldara') await page.evaluate(() => window.__worldVisualQa.loadWorld('eldara'));
    const result = await page.evaluate(async () => {
      const tree = window.__editor.stylizedSurface.treeView;
      await tree.impostorReady;
      const settings = tree.config.lod.impostor;
      const manifest = await (await fetch(settings.manifest)).json();
      return {
        backend: window.__editor.terrainView.rendererBackendStatus.mode,
        settings, runtimeSignature: tree.prototypeSignature, manifestSignature: manifest.sourceSignature,
        signaturesMatch: tree.prototypeSignature === manifest.sourceSignature,
        prototypeCount: tree.prototypes.length, manifestPrototypeCount: manifest.prototypes.length,
        loadedAtlasCount: tree.impostorAtlases?.length ?? 0,
        impostorBatchCount: tree.impostorBatches?.length ?? 0,
        atlasSources: [...new Set((tree.impostorAtlases ?? []).map(atlas => atlas.source ?? 'unknown'))],
      };
    });
    report.worlds.push({ world, ...result });
    console.log(JSON.stringify({ world, ...result }));
  }
  report.sourceStayedFixed = visualSourceStayedFixed(source, await captureVisualSource(url, root));
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  await browser?.close(); release();
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(out, 'tree-atlas-probe.json'), JSON.stringify(report, null, 2) + '\n');
}
