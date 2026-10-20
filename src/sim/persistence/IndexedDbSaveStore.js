import { checksumCanonical } from './canonicalSerialize.js';

/** Atomic manifests and immutable replay segments, separate from editor saves. */
export function createIndexedDbSaveStore({ indexedDB = globalThis.indexedDB,
  databaseName = 'drusniel-simulation', namespace = 'default' } = {}) {
  if (!indexedDB) throw new Error('indexeddb_unavailable');
  const scope = slot => JSON.stringify([namespace, slot]);
  const envelope = payload => ({ payload, checksum: checksumCanonical(payload) });
  const verified = record => {
    if (!record) return { ok: false, code: 'missing_save' };
    if (checksumCanonical(record.payload) !== record.checksum) return { ok: false, code: 'save_checksum_mismatch' };
    return { ok: true, payload: record.payload };
  };

  function open() {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('saves'); db.createObjectStore('archives');
        db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true }).createIndex('scope', 'scope');
      };
      request.onerror = () => reject(request.error ?? new Error('indexeddb_open_failed'));
      request.onblocked = () => { blocked = true; reject(new Error('indexeddb_open_blocked')); };
      request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    });
  }

  async function transaction(names, mode, action) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(names, mode); let result, failure;
        const done = value => { result = value; };
        const read = (request, callback) => {
          request.onsuccess = () => {
            try { callback(request.result); }
            catch (error) { failure = error; tx.abort(); }
          };
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('indexeddb_transaction_failed'));
        try { action(tx, read, done); }
        catch (error) { failure = error; tx.abort(); }
      });
    } finally { db.close(); }
  }

  return {
    kind: 'indexeddb',
    async openIndexedDb() { const db = await open(); db.close(); return { kind: 'indexeddb', ready: true }; },
    async beginSave(slot, payload) {
      const record = { scope: scope(slot), ...envelope(payload) };
      return transaction(['pending'], 'readwrite', (tx, read, done) => {
        read(tx.objectStore('pending').add(record), id => done({ ok: true, slot, pending: true, transactionId: `save:${id}` }));
      });
    },
    async commitSave(slot, transactionId = null) {
      if (transactionId !== null && !/^save:\d+$/.test(transactionId)) return { ok: false, code: 'missing_pending_save' };
      return transaction(['pending', 'saves'], 'readwrite', (tx, read, done) => {
        const pending = tx.objectStore('pending');
        const request = transactionId === null ? pending.index('scope').openCursor(scope(slot))
          : pending.get(Number(/^save:(\d+)$/.exec(transactionId)?.[1]));
        read(request, value => {
          const record = transactionId === null ? value?.value : value;
          if (!record || record.scope !== scope(slot)) { done({ ok: false, code: 'missing_pending_save' }); return; }
          const check = verified(record);
          if (!check.ok) { done(check); return; }
          tx.objectStore('saves').put({ payload: record.payload, checksum: record.checksum }, scope(slot));
          pending.delete(record.id);
          done({ ok: true, slot, transactionId: `save:${record.id}` });
        });
      });
    },
    async abortSave(slot, transactionId = null) {
      if (transactionId !== null && !/^save:\d+$/.test(transactionId)) return { ok: true, slot, aborted: false, transactionId };
      return transaction(['pending'], 'readwrite', (tx, read, done) => {
        const pending = tx.objectStore('pending');
        read(transactionId === null ? pending.index('scope').openCursor(scope(slot))
          : pending.get(Number(/^save:(\d+)$/.exec(transactionId)?.[1])), value => {
          const record = transactionId === null ? value?.value : value;
          const found = record?.scope === scope(slot);
          if (found) pending.delete(record.id);
          done({ ok: true, slot, aborted: found, transactionId: found ? `save:${record.id}` : transactionId });
        });
      });
    },
    async save(slot, payload) { const result = await this.beginSave(slot, payload); return this.commitSave(slot, result.transactionId); },
    async load(slot) {
      return transaction(['saves'], 'readonly', (tx, read, done) => read(tx.objectStore('saves').get(scope(slot)), record => done(verified(record))));
    },
    async list() {
      return transaction(['saves'], 'readonly', (tx, read, done) => {
        read(tx.objectStore('saves').getAllKeys(), keys => done(keys.map(key => JSON.parse(key))
          .filter(([world]) => world === namespace).map(([, slot]) => slot).sort()));
      });
    },
    async putArchive(id, payload) {
      const record = envelope(payload);
      return transaction(['archives'], 'readwrite', (tx, read, done) => {
        const store = tx.objectStore('archives'), key = [namespace, id];
        read(store.get(key), previous => {
          if (previous && previous.checksum !== record.checksum) throw new Error('archive_conflict');
          store.put(record, key); done({ ok: true, id });
        });
      });
    },
    async getArchive(id) {
      return transaction(['archives'], 'readonly', (tx, read, done) => {
        read(tx.objectStore('archives').get([namespace, id]), record => done(verified(record)));
      });
    },
    async getArchives(ids) {
      if (ids.length === 0) return [];
      return transaction(['archives'], 'readonly', (tx, read, done) => {
        const records = new Array(ids.length);
        let remaining = ids.length;
        ids.forEach((id, index) => read(tx.objectStore('archives').get([namespace, id]), record => {
          records[index] = verified(record);
          if (--remaining === 0) done(records);
        }));
      });
    },
    async getArchiveChain(head, limit) {
      if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid_archive_batch_size');
      return transaction(['archives'], 'readonly', (tx, read, done) => {
        const records = [];
        const next = id => read(tx.objectStore('archives').get([namespace, id]), record => {
          const result = verified(record);
          records.push({ id, ...result });
          const previous = result.payload?.previous;
          if (!result.ok || previous === null || typeof previous !== 'string' || records.length >= limit) done(records);
          else next(previous);
        });
        next(head);
      });
    },
  };
}
