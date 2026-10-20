import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulationWorld, createMiniCampaignFixture } from '../src/sim/index.js';
import { createInMemorySaveStore, restoreWorldSnapshot } from '../src/sim/persistence/snapshot.js';

function boot(saveStore, persistence = {}) {
  const world = createSimulationWorld({ campaign: createMiniCampaignFixture(), saveStore,
    config: { persistence: { journalSegmentCommands: 8, maxPendingJournalSegments: 2,
      maximumCommandsBetweenSnapshots: 32, maximumReasonLogEntries: 5, ...persistence } } });
  const id = world.queries().list('settlement')[0].id;
  return { world, patch: i => world.dispatch('sim.patchEntity', { kind: 'settlement', id, dataPatch: { name: `Town ${i}` } }) };
}

test('a long campaign archives every command, bounds routine saves, and replays from streamed history', async () => {
  const store = createInMemorySaveStore(), { world, patch } = boot(store), initial = world.snapshot();
  for (let i = 0; i < 1000; i++) {
    if (!world.getHistoryStatus().pending || i % 8 === 0) await world.flushHistory();
    assert.equal(patch(i).ok, true);
    world.reasonLog.push(`reason-${i}`);
    const status = world.getHistoryStatus();
    assert.ok(status.residentCommands + status.pendingCommands <= 24);
  }
  await world.flushHistory(); await world.save('campaign');
  const saved = (await store.load('campaign')).payload;
  assert.ok(saved.journal.length < 8); assert.equal(saved.reasonLog.length, 5);
  assert.equal(saved.snapshot.commandRange.count, 1000);
  const checkpoint = await store.getArchive(saved.history.checkpoint);
  assert.equal(checkpoint.payload.kind, 'simulation-checkpoint'); restoreWorldSnapshot(checkpoint.payload.snapshot);
  const commands = []; for await (const command of world.readJournal()) commands.push(command);
  assert.equal(commands.length, 1000); assert.equal(new Set(commands.map(c => c.id)).size, 1000);
  const target = boot(store).world;
  const replayed = await target.replayJournalFromSnapshot(initial, world.readJournal());
  assert.equal(replayed.ok, true); assert.equal(replayed.appliedCount, 1000); assert.equal(target.checksum(), world.checksum());
  const resumed = boot(store).world;
  assert.equal((await resumed.load('campaign')).ok, true); assert.equal(resumed.checksum(), world.checksum());
  const restored = []; for await (const command of resumed.readJournal()) restored.push(command.id);
  assert.deepEqual(restored, commands.map(c => c.id));
});

test('archive failure retains history, rejects excess work before mutation, and recovers on retry', async () => {
  const store = createInMemorySaveStore(), original = store.putArchive.bind(store);
  let failed = true;
  store.putArchive = async (...args) => { if (failed) throw new Error('disk unavailable'); return original(...args); };
  const { world, patch } = boot(store, { journalSegmentCommands: 2, maxPendingJournalSegments: 1 });
  await world.save('previous');
  for (let i = 0; i < 4; i++) assert.equal(patch(i).ok, true);
  const before = world.checksum(), tick = world.clock.getTick();
  assert.equal(patch(4).code, 'history_archive_backpressure');
  assert.throws(() => world.stepDays(1), /history_archive_backpressure/);
  assert.equal(world.checksum(), before); assert.equal(world.clock.getTick(), tick);
  await assert.rejects(world.save('previous'), /disk unavailable/);
  assert.equal((await store.load('previous')).payload.snapshot.commandRange.count, 0);
  failed = false; await world.flushHistory(); assert.equal(patch(4).ok, true);
  const commands = []; for await (const command of world.readJournal()) commands.push(command);
  assert.equal(commands.length, 5); assert.equal(world.getHistoryStatus().errors.length, 0);
});

test('async day stepping preserves all daily and monthly commands across small archive limits', async () => {
  const { world } = boot(createInMemorySaveStore(), { journalSegmentCommands: 2, maxPendingJournalSegments: 1 });
  const oracle = createSimulationWorld({ campaign: createMiniCampaignFixture() });
  assert.equal(world.initializeSystems().ok, true); oracle.initializeSystems();
  await world.stepDaysAsync(90); oracle.stepDays(90);
  assert.equal(world.checksum(), oracle.checksum());
  const commands = []; for await (const command of world.readJournal()) commands.push(command);
  assert.equal(commands.filter(command => command.type === 'sim.dailyTick').length, 90);
  assert.equal(commands.filter(command => command.type === 'sim.monthlyTick').length, 3);
});

test('invalid history metadata cannot partially replace the live world', async () => {
  const store = createInMemorySaveStore(), { world, patch } = boot(store);
  patch(1); await world.save('invalid'); const payload = (await store.load('invalid')).payload;
  payload.history.commands = 10; await store.save('invalid', payload);
  const before = world.checksum();
  await assert.rejects(world.load('invalid'), /invalid_save_payload/); assert.equal(world.checksum(), before);
});

test('existing injected save-store interfaces can archive through reserved transactional slots', async () => {
  const memory = createInMemorySaveStore();
  const store = Object.fromEntries(['beginSave', 'commitSave', 'load'].map(key => [key, memory[key].bind(memory)]));
  const { world, patch } = boot(store, { journalSegmentCommands: 2 });
  for (let i = 0; i < 10; i++) { await world.flushHistory(); assert.equal(patch(i).ok, true); }
  await world.save('compatible');
  const resumed = boot(store, { journalSegmentCommands: 2 }).world;
  await resumed.load('compatible');
  const commands = []; for await (const command of resumed.readJournal()) commands.push(command);
  assert.equal(commands.length, 10); assert.equal(resumed.checksum(), world.checksum());
});

test('a rejected save begin never commits an older pending transaction', async () => {
  const store = createInMemorySaveStore(), { world } = boot(store);
  await store.beginSave('slot', { marker: 'unrelated' });
  store.beginSave = async () => ({ ok: false, code: 'quota_exceeded' });
  assert.deepEqual(await world.save('slot'), { ok: false, code: 'quota_exceeded' });
  assert.equal((await store.load('slot')).ok, false);
});

test('a browser without IndexedDB cannot silently create volatile saves', () => {
  const previous = globalThis.window;
  globalThis.window = {};
  try {
    assert.throws(() => createSimulationWorld({ campaign: createMiniCampaignFixture() }), /indexeddb_unavailable/);
    assert.equal(boot(createInMemorySaveStore()).world.saveStore.kind, 'memory', 'an explicit transient backend remains available');
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  }
});
