/** Bounded mutation journal for derived indices; entries remain ordinary Map data. */
export class RevisionedMap extends Map {
  revision = 0;
  changes = [];
  constructor(entries) {
    super();
    if (entries) for (const [key, value] of entries) super.set(key, value);
  }
  record(key) {
    this.revision++;
    this.changes.push({ revision: this.revision, key });
    if (this.changes.length > 128) this.changes.shift();
  }
  set(key, value) { super.set(key, value); this.record(key); return this; }
  delete(key) { const removed = super.delete(key); if (removed) this.record(key); return removed; }
  clear() { if (this.size) { super.clear(); this.record(null); } }
  changesSince(revision) {
    if (revision === this.revision) return [];
    if (!this.changes.length || revision < this.changes[0].revision - 1) return null;
    const changes = this.changes.filter(change => change.revision > revision);
    return changes.some(change => change.key === null) ? null : [...new Set(changes.map(change => change.key))];
  }
}
