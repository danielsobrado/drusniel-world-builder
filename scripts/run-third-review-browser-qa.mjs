import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.THIRD_REVIEW_QA_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__thirdReviewHost', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Review QA</title>' }));
  await page.goto(`${url}/__thirdReviewHost`);
  const workers = await page.evaluate(async () => {
    const { settlementReviewSource, settlementReviewMetadata: metadata } = await import('/scripts/lib/settlement-review-fixture.mjs');
    const { WorldChunkWorkerClient } = await import('/src/editor/world/WorldChunkWorkerClient.js');
    const { createWorldGenerator } = await import('/src/editor/world/WorldGeneratorFactory.js');
    const { generateBaseWorldChunk } = await import('/src/editor/world/generateWorldChunk.js');
    const { PerfCounters } = await import('/src/editor/performance/qa/PerfCounters.js');
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const source = settlementReviewSource();
    const client = new WorldChunkWorkerClient({ chunkSize: 8, generator: { toMetadata: () => metadata }, workerCount: 8 });
    PerfCounters.reset(); client.setBaseTerrain(source);
    try {
      const pages = await Promise.all(Array.from({ length: 8 }, (_, index) => client.request(index % 4 - 2, Math.floor(index / 4) - 1)));
      const visual = await client.request(0, 0, { settlementPlanId: 18 });
      check(visual.plan.id === 18, 'visual plan missing');
      check(PerfCounters.get('settlementWorkerPlansGenerated') === 1, 'cold city was planned more than once');
      check(PerfCounters.get('settlementMainThreadPlansGenerated') === 0, 'main thread generated a plan');
      client.workers[0].dispatchEvent(new ErrorEvent('error', { message: 'injected terrain replacement', cancelable: true }));
      await client.request(-1, -1);
      check(PerfCounters.get('settlementWorkerPlansGenerated') === 1, 'terrain replacement duplicated a canonical plan');
      client.settlementWorker.workers[0].dispatchEvent(new ErrorEvent('error', { message: 'injected authority replacement', cancelable: true }));
      await client.request(0, 0); await client.request(0, 0, { settlementPlanId: 18 });
      check(PerfCounters.get('settlementWorkerPlansGenerated') === 2, 'authority replacement did not restore canonical planning');
      const generatedBeforeOracle = PerfCounters.get('settlementMainThreadPlansGenerated');
      const expected = createWorldGenerator(metadata, source);
      for (const actual of pages) {
        const oracle = generateBaseWorldChunk({ chunkX: actual.chunkX, chunkZ: actual.chunkZ,
          chunkSize: 8, generator: metadata, worldGenerator: expected });
        for (const name of ['heights', 'tiles', 'tilePixels', 'surfaceMaskPixels', 'waterFieldPixels']) {
          check(actual[name].every((value, index) => value === oracle[name][index]), `${name} diverged from canonical generation`);
        }
      }
      return { terrainWorkers: 8, initialPlansGenerated: 1, plansAfterAuthorityReplacement: 2,
        mainThreadPlansBeforeOracle: generatedBeforeOracle, comparedPages: pages.length, canonicalArraysEqual: true };
    } finally { client.dispose(); }
  });
  const history = await page.evaluate(async () => {
    const { createIndexedDbSaveStore } = await import('/src/sim/persistence/IndexedDbSaveStore.js');
    const { readReplayArchives } = await import('/src/sim/persistence/ReplayArchiveReader.js');
    const { checksumCanonical } = await import('/src/sim/persistence/canonicalSerialize.js');
    const store = createIndexedDbSaveStore({ databaseName: `third-review-${crypto.randomUUID()}` });
    for (let index = 0; index < 1000; index++) {
      const commands = [{ id: `command:${index}` }];
      await store.putArchive(String(index), { kind: 'command-segment', previous: index ? String(index - 1) : null,
        start: index, commands, checksum: checksumCanonical(commands) });
    }
    let opens = 0;
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => { opens++; return open(...args); };
    const ids = [];
    try { for await (const command of readReplayArchives(store, { head: '999', segments: 1000, commands: 1000 })) ids.push(command.id); }
    finally { delete indexedDB.open; }
    if (ids.some((id, index) => id !== `command:${index}`) || ids.length !== 1000 || opens !== 64) throw new Error('archive batch replay failed');
    return { segments: 1000, databaseOpens: opens, commandOrderPreserved: true };
  });
  assert.deepEqual(errors, []);
  const report = { kind: 'third-review-browser-qa', passed: true, workers, history, errors };
  const output = process.argv[2] ?? 'tmp/third-review-browser-qa.json';
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
