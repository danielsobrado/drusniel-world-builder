import { completeIterator } from '../ResumableIterator.js';

const equal = (a, b) => a && b && a.objectId === b.objectId && a.matrix === b.matrix
  && a.quantizedFade === b.quantizedFade && a.ditherDirection === b.ditherDirection;

/** Current dense rows and ID-to-row lookup. Local edits touch only their own rows. */
export class InstanceLodRows {
  constructor(bands = ['near', 'coarse', 'shell']) {
    this.bands = bands;
    this.buckets = Object.fromEntries(bands.map(band => [band, []]));
    this.indices = Object.fromEntries(bands.map(band => [band, new Map()]));
    this.versions = Object.fromEntries(bands.map(band => [band, 0]));
  }

  replace(buckets, transitions) {
    const baseVersions = { ...this.versions };
    const changedRows = {};
    for (const band of this.bands) {
      const old = this.buckets[band], next = buckets[band];
      const same = old.length === next.length && old.every((row, i) => equal(row, next[i]));
      if (!same) this.versions[band]++;
      changedRows[band] = same ? [] : null;
      this.indices[band] = new Map(next.map((row, i) => [row.objectId, i]));
    }
    this.buckets = buckets;
    return this.plan(transitions, baseVersions, changedRows);
  }

  patch(changes, transitions) {
    return completeIterator(this.iteratePatch(changes, transitions));
  }

  /** Copy only touched prototype storage before a cancellable publication. */
  *fork() {
    const copy = new InstanceLodRows(this.bands);
    for (const band of this.bands) {
      const rows = this.buckets[band];
      for (let i = 0; i < rows.length; i++) {
        copy.buckets[band].push(rows[i]);
        copy.indices[band].set(rows[i].objectId, i);
        if (i % 64 === 63) yield;
      }
      copy.versions[band] = this.versions[band];
      yield;
    }
    return copy;
  }

  *iteratePatch(changes, transitions) {
    const baseVersions = { ...this.versions }, changedRows = {};
    for (const band of this.bands) {
      const rows = this.buckets[band], indices = this.indices[band], dirty = new Set();
      let changed = false, visits = 0;
      for (const [id, representations] of changes) {
        if (visits++ > 0 && visits % 64 === 1) yield;
        const next = representations.find(row => row.band === band);
        const index = indices.get(id);
        if (next) {
          if (index === undefined) {
            indices.set(id, rows.length); dirty.add(rows.length); rows.push(next); changed = true;
          } else if (!equal(rows[index], next)) {
            rows[index] = next; dirty.add(index); changed = true;
          }
        } else if (index !== undefined) {
          const tail = rows.pop(); indices.delete(id); changed = true;
          if (index < rows.length) { rows[index] = tail; indices.set(tail.objectId, index); dirty.add(index); }
        }
      }
      if (changed) this.versions[band]++;
      changedRows[band] = [...dirty].filter(index => index < rows.length);
    }
    return this.plan(transitions, baseVersions, changedRows);
  }

  plan(transitions, baseVersions, changedRows) {
    // Buckets are current retained storage, not historical snapshots. Versions
    // let a publisher that missed an intermediate plan fall back to a full write.
    return Object.freeze({ buckets: this.buckets, signatures: Object.freeze({ ...this.versions }),
      baseVersions, changedRows, transitions });
  }
}
