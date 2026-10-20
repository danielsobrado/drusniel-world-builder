import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const port = Number(process.env.SIMULATION_QA_PORT ?? 5323), url = `http://127.0.0.1:${port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'drusniel-simulation-qa-'));
const server = spawn(process.execPath, ['scripts/serve-world-visual-snapshot.mjs', sourceSha, String(port)], { stdio: 'pipe' });
const errors = [], logs = []; let context;
server.stderr.on('data', data => logs.push(String(data)));
async function page() {
  context = await chromium.launchPersistentContext(profile, { headless: true, args: ['--disable-gpu', '--no-sandbox'] });
  const page = await context.newPage();
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${url}/__worldVisualSource`);
  return page;
}

try {
  const started = Date.now();
  while (true) {
    try { if ((await fetch(`${url}/__worldVisualSource`)).ok) break; } catch { /* starting */ }
    if (Date.now() - started > 30000 || server.exitCode !== null) throw new Error(`QA server failed: ${logs.join('')}`);
    await new Promise(done => setTimeout(done, 100));
  }
  const first = await page();
  const saved = await first.evaluate(async () => {
    const { createSimulationWorld, createMiniCampaignFixture } = await import('/src/sim/index.js');
    const { createIndexedDbSaveStore } = await import('/src/sim/persistence/IndexedDbSaveStore.js');
    const store = createIndexedDbSaveStore({ databaseName: 'simulation-storage-qa', namespace: 'campaign' });
    const config = { persistence: { journalSegmentCommands: 4, maxPendingJournalSegments: 2,
      maximumCommandsBetweenSnapshots: 8, maximumReasonLogEntries: 3 } };
    const world = createSimulationWorld({ campaign: createMiniCampaignFixture(), config, saveStore: store });
    const id = world.queries().list('settlement')[0].id, commandIds = [];
    for (let i = 0; i < 32; i++) {
      await world.flushHistory();
      const result = world.dispatch('sim.patchEntity', { kind: 'settlement', id, dataPatch: { name: `Town ${i}` } });
      if (!result.ok) throw new Error(result.code);
      commandIds.push(result.command.id); world.reasonLog.push(`reason-${i}`);
    }
    await world.save('resume');
    const snapshot = world.snapshot(), checksum = world.checksum();
    await store.beginSave('resume', { marker: 'interrupted-save' });
    const defaultWorld = createSimulationWorld({ campaign: createMiniCampaignFixture() });
    if (defaultWorld.saveStore.kind !== 'indexeddb') throw new Error('Browser default store is not persistent');
    await defaultWorld.save('default-adapter');
    return { config, commandIds, checksum, snapshotChecksum: snapshot.snapshotChecksum };
  });
  await context.close(); context = null;
  const second = await page();
  const restored = await second.evaluate(async saved => {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const { createSimulationWorld, createMiniCampaignFixture } = await import('/src/sim/index.js');
    const { createIndexedDbSaveStore } = await import('/src/sim/persistence/IndexedDbSaveStore.js');
    const store = createIndexedDbSaveStore({ databaseName: 'simulation-storage-qa', namespace: 'campaign' });
    const world = createSimulationWorld({ campaign: createMiniCampaignFixture(), config: saved.config, saveStore: store });
    check((await world.load('resume')).ok, 'restart load failed');
    check(world.checksum() === saved.checksum, 'restart state checksum changed');
    check(world.snapshot().snapshotChecksum === saved.snapshotChecksum, 'restart snapshot checksum changed');
    const ids = []; for await (const command of world.readJournal()) ids.push(command.id);
    check(JSON.stringify(ids) === JSON.stringify(saved.commandIds), 'archived replay order changed');
    check(world.reasonLog.length === 3, 'diagnostic window grew');
    const defaults = createSimulationWorld({ campaign: createMiniCampaignFixture() });
    check((await defaults.load('default-adapter')).ok, 'default browser adapter was not durable');
    const other = createIndexedDbSaveStore({ databaseName: 'simulation-storage-qa', namespace: 'other-campaign' });
    check(!(await other.load('resume')).ok, 'campaign namespace leaked');
    const a = await store.beginSave('overlap', { revision: 1 }), b = await store.beginSave('overlap', { revision: 2 });
    await store.commitSave('overlap', a.transactionId); check((await store.load('overlap')).payload.revision === 1, 'first transaction crossed');
    await store.commitSave('overlap', b.transactionId); check((await store.load('overlap')).payload.revision === 2, 'second transaction crossed');
    const c = await store.beginSave('overlap', { revision: 3 });
    const put = IDBObjectStore.prototype.put; let aborted = false;
    try {
      IDBObjectStore.prototype.put = function(...args) { if (this.name === 'saves') throw new Error('injected_commit_failure'); return put.apply(this, args); };
      await store.commitSave('overlap', c.transactionId);
    } catch (error) { aborted = error.message === 'injected_commit_failure'; }
    finally { IDBObjectStore.prototype.put = put; }
    check(aborted && (await store.load('overlap')).payload.revision === 2, 'failed transaction replaced valid manifest');
    check((await store.commitSave('overlap', c.transactionId)).ok, 'failed transaction lost its pending payload');
    const original = await store.load('resume'); await store.save('corrupt', original.payload);
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('simulation-storage-qa', 1); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('saves', 'readwrite'), saves = tx.objectStore('saves');
        const key = JSON.stringify(['campaign', 'corrupt']), read = saves.get(key);
        read.onsuccess = () => { const record = read.result; record.payload.snapshot.worldRevision++; saves.put(record, key); };
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    const before = world.checksum(), corruption = await world.load('corrupt');
    check(corruption.code === 'save_checksum_mismatch' && world.checksum() === before, 'corrupt load mutated state');
    return { stateChecksum: world.checksum(), snapshotChecksum: world.snapshot().snapshotChecksum,
      archivedCommands: ids.length, history: world.getHistoryStatus(),
      checks: ['browser-restart', 'default-persistent-adapter', 'exact-state-and-snapshot-checksum',
        'interrupted-save-preserves-manifest', 'namespace-isolation', 'overlapping-transactions',
        'aborted-commit-and-retry', 'archive-order', 'bounded-reason-log', 'corrupt-load-isolation'] };
  }, saved);
  assert.deepEqual(errors, []);
  const report = { kind: 'simulation-indexeddb-qa', sourceSha, passed: true, browserRestarted: true,
    gpuUsed: false, errors, ...restored };
  const output = process.argv[2] ?? 'tmp/simulation-persistence-qa.json';
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context?.close(); server.kill('SIGTERM'); await rm(profile, { recursive: true, force: true });
}
