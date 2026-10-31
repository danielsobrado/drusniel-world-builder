import { InstanceLodRows } from './InstanceLodRows.js';
import { writeInstances } from './StylizedLodRuntime.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';

const RETIRED = Object.freeze([]);
const NO_CHANGES = new Map();

function sameRepresentations(a, b) {
  return a.length === b.length && a.every((row, index) => row.band === b[index].band
    && row.fade === b[index].fade && row.ditherDirection === b[index].ditherDirection);
}

/** A chunk plan entry's drawn representations, every non-near band on the proxy renderers. */
export function drawnRepresentations(entry) {
  const drawn = [];
  for (const { band, fade, ditherDirection = 1 } of entry?.representations ?? []) {
    if (band !== 'culled' && fade > 0) drawn.push({ band: band === 'near' ? 'near' : 'proxy', fade, ditherDirection });
  }
  return drawn;
}

/**
 * Retained near/proxy rows of a chunked scatter layer. A rebuild stages each
 * resident chunk; one whose manifest and fades did not move costs a comparison
 * and keeps its records, matrices and rows. Nothing reaches the storage or the
 * GPU until `commit`, so an abandoned rebuild leaves the last publication whole.
 */
export class ScatterInstanceRows {
  /**
   * @param {string} name counter prefix
   * @param {(placement: object) => THREE.Matrix4} matrixFor
   * @param {(placement: object) => object} appearanceFor the row's seed, tint and surface fields
   */
  constructor(name, matrixFor, appearanceFor) {
    this.name = name;
    this.matrixFor = matrixFor;
    this.appearanceFor = appearanceFor;
    this.chunks = new Map();
    this.storage = [];
    this.rows = new WeakMap();
    this.anchorX = null;
    this.anchorZ = null;
  }

  begin() {
    return { chunks: new Map(), changes: [], manifestsChanged: false };
  }

  /** Matrix, appearance and one stable row identity per representation of a cross-fade. */
  placementRows(placement) {
    let rows = this.rows.get(placement);
    if (!rows) {
      rows = { matrix: this.matrixFor(placement), appearance: this.appearanceFor(placement), slots: [] };
      this.rows.set(placement, rows);
    }
    return rows;
  }

  change(job, placement, slot, representations) {
    (job.changes[placement.prototypeIndex] ??= new Map()).set(slot, representations);
  }

  *retire(job, { manifest, representations }) {
    if (representations.length === 0) return;
    for (const placement of manifest) {
      yield;
      const { slots } = this.placementRows(placement);
      for (let index = 0; index < representations.length; index += 1) this.change(job, placement, slots[index], RETIRED);
    }
  }

  /**
   * @param {object} job from `begin`
   * @param {string} key chunk key
   * @param {ReadonlyArray<object>} manifest same array while the chunk's content is unchanged
   * @param {ReadonlyArray<object>} representations from `drawnRepresentations`
   */
  *stageChunk(job, key, manifest, representations) {
    const published = this.chunks.get(key);
    job.chunks.set(key, { manifest, representations });
    if (published?.manifest !== manifest) job.manifestsChanged = true;
    else if (sameRepresentations(published.representations, representations)) return;
    if (published) yield* this.retire(job, published);
    for (const placement of manifest) {
      yield;
      const rows = this.placementRows(placement);
      for (const [index, representation] of representations.entries()) {
        const slot = rows.slots[index] ??= {};
        this.change(job, placement, slot, [{
          ...rows.appearance,
          objectId: slot,
          band: representation.band,
          matrix: rows.matrix,
          fade: representation.fade,
          quantizedFade: Math.fround(representation.fade),
          ditherDirection: representation.ditherDirection,
        }]);
      }
    }
  }

  /** Retire whatever chunks this rebuild did not stage. */
  *stageRetired(job) {
    for (const [key, published] of this.chunks) {
      if (job.chunks.has(key)) continue;
      job.manifestsChanged = true;
      yield* this.retire(job, published);
    }
  }

  /**
   * Publish a staged rebuild. Moving the anchor offsets every matrix, so that write
   * is complete; every other write visits only its changed rows, and instance
   * bounds tighten again at that anchor move.
   *
   * @returns {{ near: number, proxy: number, manifestsChanged: boolean }}
   */
  commit(job, nearRenderers, proxyRenderers, anchor) {
    const rebased = anchor.x !== this.anchorX || anchor.z !== this.anchorZ;
    this.anchorX = anchor.x;
    this.anchorZ = anchor.z;
    const near = [], proxy = [], nearRows = [], proxyRows = [];
    let changedRows = 0;
    for (let prototype = 0; prototype < nearRenderers.length; prototype += 1) {
      const storage = this.storage[prototype] ??= new InstanceLodRows(['near', 'proxy']);
      const plan = storage.patch(job.changes[prototype] ?? NO_CHANGES, 0);
      near.push(plan.buckets.near);
      proxy.push(plan.buckets.proxy);
      nearRows.push(plan.changedRows.near);
      proxyRows.push(plan.changedRows.proxy);
      changedRows += plan.changedRows.near.length + plan.changedRows.proxy.length;
    }
    PerfCounters.inc(`${this.name}RowsChanged`, changedRows);
    const nearCount = writeInstances(nearRenderers, near, anchor, rebased ? null : nearRows);
    const proxyCount = writeInstances(proxyRenderers, proxy, anchor, rebased ? null : proxyRows);
    this.chunks = job.chunks;
    return { near: nearCount, proxy: proxyCount, manifestsChanged: job.manifestsChanged };
  }

  /** Every staged placement, in stage order. */
  placements() {
    const placements = [];
    for (const { manifest } of this.chunks.values()) {
      for (const placement of manifest) placements.push(placement);
    }
    return placements;
  }
}
