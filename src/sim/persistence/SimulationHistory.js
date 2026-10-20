import { checksumCanonical } from './canonicalSerialize.js';

const positive = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`invalid_history_limit:${name}`);
  return value;
};

export function boundedReasonLog(limit) {
  positive(limit, 'reasonLogEntries');
  const rows = [];
  Object.defineProperty(rows, 'push', { value(...items) {
    const kept = items.length > limit ? items.slice(-limit) : items;
    const excess = this.length + kept.length - limit;
    if (excess > 0) this.splice(0, excess);
    return Array.prototype.push.apply(this, kept);
  } });
  return rows;
}

/** Bounded resident tail and pending writes. Archives keep every accepted command. */
export class SimulationHistory {
  constructor({ journal, store, config }) {
    this.journal = journal;
    if (!store?.beginSave || !store.commitSave || !store.load) throw new Error('invalid_simulation_save_store');
    this.store = store.putArchive && store.getArchive ? store : {
      async putArchive(id, payload) {
        const slot = `__replay_archive__:${id}`, pending = await store.beginSave(slot, payload);
        return pending.ok ? store.commitSave(slot, pending.transactionId) : pending;
      },
      getArchive: id => store.load(`__replay_archive__:${id}`),
    };
    this.segmentSize = positive(config.journalSegmentCommands, 'journalSegmentCommands');
    this.maxPending = positive(config.maxPendingJournalSegments, 'maxPendingJournalSegments');
    this.checkpointInterval = positive(config.maximumCommandsBetweenSnapshots, 'maximumCommandsBetweenSnapshots');
    this.pending = new Map();
    this.session = globalThis.crypto.randomUUID(); this.sequence = 0;
    this.header = { version: 1, head: null, segments: 0, commands: 0, checkpoint: null, checkpointCommands: 0 };
  }
  get count() { return this.header.commands + this.journal.count; }
  canAccept(count = 1) {
    const queued = [...this.pending.values()].reduce((sum, job) => sum + (job.payload.commands?.length ?? 0), 0);
    return this.journal.count + queued + count <= this.segmentSize * (this.maxPending + 1);
  }
  append(command) {
    this.journal.append(command);
    this.seal();
  }
  seal() {
    while (this.journal.count >= this.segmentSize && this.pending.size < this.maxPending) {
      if (!this.store.putArchive) break;
      const commands = this.journal.take(this.segmentSize), id = `${this.session}:${++this.sequence}`;
      const payload = { kind: 'command-segment', previous: this.header.head,
        start: this.header.commands, commands, checksum: checksumCanonical(commands) };
      this.header = { ...this.header, head: id, segments: this.header.segments + 1,
        commands: this.header.commands + commands.length };
      this.enqueue(id, payload);
    }
  }
  enqueue(id, payload) {
    const job = { payload, error: null, promise: null };
    this.pending.set(id, job); this.write(id, job);
  }
  write(id, job) {
    job.error = null;
    job.promise = Promise.resolve().then(() => this.store.putArchive(id, job.payload)).then(result => {
      if (!result.ok) throw new Error(result.code ?? 'history_archive_failed');
      this.pending.delete(id);
    }).catch(error => { job.error = error; });
  }
  maybeCheckpoint(snapshot) {
    if (!this.store.putArchive || this.count - this.header.checkpointCommands < this.checkpointInterval
      || this.pending.size >= this.maxPending) return;
    const id = `${this.session}:checkpoint:${++this.sequence}`;
    const payload = { kind: 'simulation-checkpoint', snapshot: snapshot(),
      journal: this.journal.list(), history: structuredClone(this.header) };
    this.header = { ...this.header, checkpoint: id, checkpointCommands: this.count };
    this.enqueue(id, payload);
  }
  async flush() {
    // Capture only the writes already owned at entry. Live commands may continue.
    const owned = [...this.pending.entries()];
    for (const [id, job] of owned) if (job.error) this.write(id, job);
    await Promise.all(owned.map(([, job]) => job.promise));
    const failed = owned.find(([, job]) => job.error);
    if (failed) throw failed[1].error;
  }
  restore(header = null) {
    if (!header) return;
    if (header.version !== 1 || !Number.isSafeInteger(header.commands) || header.commands < 0
      || !Number.isSafeInteger(header.segments) || header.segments < 0
      || (header.head !== null && typeof header.head !== 'string')
      || (header.segments === 0) !== (header.head === null)
      || (header.segments === 0) !== (header.commands === 0) || header.segments > header.commands
      || !Number.isSafeInteger(header.checkpointCommands) || header.checkpointCommands < 0
      || header.checkpointCommands > header.commands + this.journal.count
      || (header.checkpoint !== null && typeof header.checkpoint !== 'string')) throw new Error('invalid_save_payload:history');
    this.header = structuredClone(header);
  }
  async *readCommands() {
    const header = structuredClone(this.header), tail = this.journal.list();
    await this.flush();
    const stack = [], seen = new Set();
    let id = header.head, end = header.commands;
    while (id !== null) {
      if (seen.has(id)) throw new Error('history_archive_cycle'); seen.add(id);
      const record = await this.store.getArchive(id), segment = record.payload;
      if (!record.ok || segment?.kind !== 'command-segment' || !Array.isArray(segment.commands)
        || checksumCanonical(segment.commands) !== segment.checksum || segment.start + segment.commands.length !== end) {
        throw new Error('invalid_history_archive');
      }
      stack.push(id); end = segment.start; id = segment.previous;
    }
    if (end !== 0 || stack.length !== header.segments) throw new Error('incomplete_history_archive');
    // Only IDs accumulate during explicit history reads; old payloads stream one segment at a time.
    for (const key of stack.reverse()) {
      const record = await this.store.getArchive(key);
      if (!record.ok || checksumCanonical(record.payload.commands) !== record.payload.checksum) throw new Error('invalid_history_archive');
      for (const command of record.payload.commands) yield structuredClone(command);
    }
    for (const command of tail) yield command;
  }
  getStatus() {
    return { residentCommands: this.journal.count, archivedCommands: this.header.commands,
      checkpoint: this.header.checkpoint, checkpointCommands: this.header.checkpointCommands,
      pendingCommands: [...this.pending.values()].reduce((sum, job) => sum + (job.payload.commands?.length ?? 0), 0),
      segments: this.header.segments, pending: this.pending.size,
      errors: [...this.pending.values()].flatMap(job => job.error ? [job.error.message] : []) };
  }
}
