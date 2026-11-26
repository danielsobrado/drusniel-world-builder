import { estimateAttributeSubrangeBytes, markAttributeSubrangeUpdated } from '../attributeUpload.js';
import { ITERATOR_PENDING } from '../ResumableIterator.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';

/** CPU-only dirty rows. Live attributes and draw counts remain untouched until commit. */
export class InstancePublicationPlan {
  constructor() {
    this.patches = new Map();
    this.spans = [];
    this.finalizers = [];
  }

  record(attribute, index, values, offsetX = 0, offsetZ = 0) {
    let patch = this.patches.get(attribute);
    if (!patch) this.patches.set(attribute, patch = { rows: [], values: [] });
    patch.rows.push(index);
    for (let i = 0; i < attribute.itemSize; i++) {
      patch.values.push(Math.fround(values[i] - (i === 12 ? offsetX : i === 14 ? offsetZ : 0)));
    }
  }

  span(attribute, range, counter = 'attributeBytesUploaded') {
    if (attribute && range.max >= range.min) this.spans.push({ attribute, min: range.min, max: range.max, counter });
  }

  bytes() {
    return this.spans.reduce((total, span) => total + estimateAttributeSubrangeBytes(span.attribute, span.min, span.max), 0);
  }

  commit() {
    for (const [attribute, patch] of this.patches) {
      const { array, itemSize } = attribute;
      for (let row = 0; row < patch.rows.length; row++) {
        const offset = patch.rows[row] * itemSize;
        const source = row * itemSize;
        for (let i = 0; i < itemSize; i++) array[offset + i] = patch.values[source + i];
      }
    }
    let bytes = 0;
    for (const span of this.spans) bytes += markAttributeSubrangeUpdated(span.attribute, span.min, span.max, { counter: span.counter });
    for (const finalize of this.finalizers) finalize();
    this.patches.clear();
    this.spans.length = 0;
    this.finalizers.length = 0;
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
