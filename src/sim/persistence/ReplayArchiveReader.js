import { checksumCanonical } from './canonicalSerialize.js';

export const REPLAY_ARCHIVE_BATCH_SIZE = 32;

function validate(record, expected = null) {
  const segment = record?.payload;
  if (!record?.ok || segment?.kind !== 'command-segment' || !Array.isArray(segment.commands)
    || !Number.isSafeInteger(segment.start) || segment.start < 0 || segment.commands.length === 0
    || (segment.previous !== null && typeof segment.previous !== 'string')
    || checksumCanonical(segment.commands) !== segment.checksum
    || (expected && (expected.previous !== segment.previous || expected.start !== segment.start
      || expected.length !== segment.commands.length || expected.checksum !== segment.checksum))) {
    throw new Error('invalid_history_archive');
  }
  return segment;
}

/** Validate the whole chain before yielding; retain at most one batch of payloads. */
export async function* readReplayArchives(store, header) {
  const stack = [], seen = new Set();
  let cache = new Map(), id = header.head, end = header.commands;
  while (id !== null) {
    const records = store.getArchiveChain
      ? await store.getArchiveChain(id, REPLAY_ARCHIVE_BATCH_SIZE)
      : [{ id, ...await store.getArchive(id) }];
    if (!records.length || records.length > REPLAY_ARCHIVE_BATCH_SIZE) throw new Error('invalid_history_archive');
    cache = new Map();
    for (const record of records) {
      if (record.id !== id || seen.has(id)) throw new Error('history_archive_cycle');
      seen.add(id);
      const segment = validate(record);
      if (segment.start + segment.commands.length !== end) throw new Error('invalid_history_archive');
      stack.push({ id, previous: segment.previous, start: segment.start,
        length: segment.commands.length, checksum: segment.checksum });
      cache.set(id, record);
      end = segment.start; id = segment.previous;
    }
  }
  if (end !== 0 || stack.length !== header.segments) throw new Error('incomplete_history_archive');
  stack.reverse();
  for (let offset = 0; offset < stack.length; offset += REPLAY_ARCHIVE_BATCH_SIZE) {
    const batch = stack.slice(offset, offset + REPLAY_ARCHIVE_BATCH_SIZE);
    const missing = batch.filter(entry => !cache.has(entry.id)).map(entry => entry.id);
    const records = store.getArchives ? await store.getArchives(missing)
      : await Promise.all(missing.map(key => store.getArchive(key)));
    if (records.length !== missing.length) throw new Error('invalid_history_archive');
    const loaded = new Map(missing.map((key, index) => [key, records[index]]));
    for (const entry of batch) {
      const segment = validate(cache.get(entry.id) ?? loaded.get(entry.id), entry);
      for (const command of segment.commands) yield structuredClone(command);
    }
    cache.clear();
  }
}
