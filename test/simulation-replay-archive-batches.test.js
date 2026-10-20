import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemorySaveStore } from '../src/sim/persistence/snapshot.js';
import { readReplayArchives, REPLAY_ARCHIVE_BATCH_SIZE } from '../src/sim/persistence/ReplayArchiveReader.js';
import { checksumCanonical } from '../src/sim/persistence/canonicalSerialize.js';

async function fixture(count) {
  const store = createInMemorySaveStore();
  for (let i = 0; i < count; i++) {
    const commands = [{ id: `command:${i}` }];
    await store.putArchive(String(i), { kind: 'command-segment', start: i,
      previous: i === 0 ? null : String(i - 1), commands, checksum: checksumCanonical(commands) });
  }
  return { store, header: { head: String(count - 1), commands: count, segments: count } };
}
const collect = async iterator => { const commands = []; for await (const command of iterator) commands.push(command); return commands; };

test('long replay batches archive access, retains one payload window and preserves exact order', async () => {
  const { store, header } = await fixture(1000);
  let chains = 0, batches = 0, reads = 0;
  const get = store.getArchive.bind(store), chain = store.getArchiveChain.bind(store), batch = store.getArchives.bind(store);
  store.getArchive = async id => { reads++; return get(id); };
  store.getArchiveChain = async (head, limit) => { chains++; assert.equal(limit, REPLAY_ARCHIVE_BATCH_SIZE); return chain(head, limit); };
  store.getArchives = async ids => { if (ids.length) batches++; assert.ok(ids.length <= REPLAY_ARCHIVE_BATCH_SIZE); return batch(ids); };
  const commands = await collect(readReplayArchives(store, header));
  assert.deepEqual(commands.map(command => command.id), Array.from({ length: 1000 }, (_, i) => `command:${i}`));
  assert.equal(chains, 32); assert.equal(batches, 32);
  assert.equal(reads, 1992, 'only the bounded oldest window is retained, rather than all campaign payloads');
});

test('short replay uses each archived payload once', async () => {
  const { store, header } = await fixture(20);
  let reads = 0;
  const get = store.getArchive.bind(store);
  store.getArchive = async id => { reads++; return get(id); };
  await collect(readReplayArchives(store, header));
  assert.equal(reads, 20);
});

test('archive batches reject cycles, missing data, corrupt commands and changed replay metadata', async () => {
  for (const mode of ['cycle', 'missing', 'checksum', 'changed']) {
    const { store, header } = await fixture(40);
    const get = store.getArchive.bind(store);
    let reads = 0;
    store.getArchive = async id => {
      const record = await get(id); reads++;
      if (mode === 'cycle' && id === '39') record.payload.previous = '39';
      if (mode === 'missing' && id === '10') return { ok: false };
      if (mode === 'checksum' && id === '10') record.payload.commands[0].id = 'corrupt';
      if (mode === 'changed' && reads > 40 && id === '20') record.payload.previous = 'wrong-chain';
      return record;
    };
    await assert.rejects(collect(readReplayArchives(store, header)), /history_archive/);
  }
});
