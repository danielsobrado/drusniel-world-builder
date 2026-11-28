import { estimateAttributeSubrangeBytes, markAttributeSubrangeUpdated } from '../attributeUpload.js';
import { ITERATOR_PENDING } from '../ResumableIterator.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { waitForInitialInstanceDraws } from './InstanceLodHandoff.js';

const PATCH_PAGE_ROWS = 64;

/** CPU-only dirty rows. Live attributes and draw counts remain untouched until commit. */
export class InstancePublicationPlan {
  constructor() {
    this.patches = new Map();
    this.spans = new Map();
    this.finalizers = [];
    this.replacementDraws = new Set();
    this.stagedRows = 0;
  }

  record(attribute, index, values, offsetX = 0, offsetZ = 0) {
    let patch = this.patches.get(attribute);
    if (!patch) this.patches.set(attribute, patch = []);
    const { itemSize } = attribute;
    let page = patch.at(-1);
    if (!page || page.count === PATCH_PAGE_ROWS) {
      page = { count: 0, rows: new Uint32Array(PATCH_PAGE_ROWS), values: new Float32Array(PATCH_PAGE_ROWS * itemSize) };
      patch.push(page);
    }
    const offset = page.count * itemSize;
    page.rows[page.count++] = index;
    for (let i = 0; i < itemSize; i++) {
      page.values[offset + i] = values[i] - (i === 12 ? offsetX : i === 14 ? offsetZ : 0);
    }
    this.stagedRows++;
  }

  span(attribute, range, counter = 'attributeBytesUploaded') {
    if (!attribute || range.max < range.min) return;
    const previous = this.spans.get(attribute);
    if (previous) {
      previous.min = Math.min(previous.min, range.min);
      previous.max = Math.max(previous.max, range.max);
    } else this.spans.set(attribute, { attribute, min: range.min, max: range.max, counter });
  }

  bytes() {
    let bytes = 0;
    for (const span of this.spans.values()) bytes += estimateAttributeSubrangeBytes(span.attribute, span.min, span.max);
    return bytes;
  }

  *publish(getBudget, beforeCommit = null) {
    yield* waitForInitialInstanceDraws(this.replacementDraws);
    const budget = getBudget();
    const uploaded = budget?.slicedInstanceUploads ? yield* budget.slicedInstanceUploads.stage(this, getBudget) : false;
    if (!uploaded) yield* admitSceneryPublication(getBudget, () => this.bytes());
    beforeCommit?.();
    return this.commit(uploaded);
  }

  commit(uploaded = false) {
    for (const [attribute, pages] of this.patches) {
      const { array, itemSize } = attribute;
      for (const page of pages) {
        let start = 0;
        while (start < page.count) {
          let end = start + 1;
          while (end < page.count && page.rows[end] === page.rows[end - 1] + 1) end++;
          array.set(page.values.subarray(start * itemSize, end * itemSize), page.rows[start] * itemSize);
          start = end;
        }
      }
    }
    let bytes = 0;
    if (!uploaded) for (const span of this.spans.values()) {
      const dither = span.counter === 'sceneryDitherQueuedBytes';
      const queued = markAttributeSubrangeUpdated(span.attribute, span.min, span.max,
        { counter: dither ? 'attributeBytesUploaded' : span.counter });
      if (dither) PerfCounters.inc(span.counter, queued);
      bytes += queued;
    }
    for (const finalize of this.finalizers) finalize();
    this.patches.clear();
    this.spans.clear();
    this.finalizers.length = 0;
    this.replacementDraws.clear();
    PerfCounters.inc('sceneryPublicationCommits');
    PerfCounters.inc('sceneryPublicationQueuedBytes', bytes);
    PerfCounters.inc('sceneryPublicationStagedAttributeRows', this.stagedRows);
    this.stagedRows = 0;
    return bytes;
  }
}

/** One atomic publication shares the existing frame allowance. Recheck pending
 * ranges after each wait: the renderer may have consumed them in the meantime. */
export function* admitSceneryPublication(getBudget, bytesFor) {
  let bytes = bytesFor();
  let budget = getBudget();
  while (budget && !budget.canPublish(bytes)) {
    PerfCounters.inc('sceneryPublicationDeferred');
    yield ITERATOR_PENDING;
    budget = getBudget();
    bytes = bytesFor();
  }
  PerfCounters.inc('sceneryPublicationEstimatedBytes', bytes);
  if (budget && bytes > budget.maxUploadBytes) PerfCounters.inc('sceneryPublicationOversizedBytes', bytes);
  return bytes;
}
