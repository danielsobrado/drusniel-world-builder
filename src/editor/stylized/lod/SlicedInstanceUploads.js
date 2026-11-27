import { StaticDrawUsage } from 'three/webgpu';
import { ITERATOR_PENDING } from '../ResumableIterator.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';

const COPY_SRC = 4;
const COPY_DST = 8;

/** Only already resident, unpadded, CPU-owned float attributes may bypass normal upload. */
export function residentInstanceTarget(renderer, attribute) {
  const backend = renderer?.backend;
  const attributes = renderer?._attributes;
  if (!backend?.isWebGPUBackend || !attributes?.has?.(attribute) || !backend.has?.(attribute)
      || backend.getBufferAttribute?.(attribute) !== attribute || attribute.usage !== StaticDrawUsage
      || !(attribute.array instanceof Float32Array) || attribute.isInterleavedBufferAttribute
      || !Array.isArray(attribute.updateRanges) || attribute.updateRanges.length || attributes.get(attribute).version !== attribute.version) return null;
  const data = backend.get(attribute), buffer = data.buffer;
  if (!buffer || data._paddedItemSize !== undefined || buffer.size !== attribute.array.byteLength
      || !(buffer.usage & COPY_DST) || buffer.mapState !== 'unmapped') return null;
  return { attribute, buffer, array: attribute.array, version: attribute.version };
}

function sameTarget(renderer, target) {
  const current = residentInstanceTarget(renderer, target.attribute);
  return current && current.buffer === target.buffer && current.array === target.array && current.version === target.version;
}

/** Pack the exact changed rows, not the broad dirty span. Adjacent copy runs merge. */
export function* prepareInstanceCopyPlan(renderer, publication, settings) {
  const pages = [], copies = [], targets = [];
  let bytes = 0;
  for (const [attribute, patchPages] of publication.patches) {
    const target = residentInstanceTarget(renderer, attribute);
    if (!target) return null;
    targets.push(target);
    const stride = attribute.itemSize * 4;
    for (const page of patchPages) {
      const size = page.count * stride;
      if (!size) continue;
      if (bytes + size > settings.maxStagingBytes) return null;
      pages.push({ values: page.values, elements: page.count * attribute.itemSize, offset: bytes });
      for (let row = 0; row < page.count; row++) {
        const destination = page.rows[row] * stride;
        if (destination + stride > target.buffer.size) return null;
        const source = bytes + row * stride;
        const last = copies.at(-1);
        if (last && last.buffer === target.buffer && last.source + last.size === source
            && last.destination + last.size === destination) last.size += stride;
        else {
          copies.push({ buffer: target.buffer, source, destination, size: stride });
          if (copies.length > settings.maxCopyRanges) return null;
        }
      }
      bytes += size;
      yield;
    }
  }
  return bytes ? { pages, copies, targets, bytes } : null;
}

/** One scratch allocation at a time. Live GPU/CPU rows are unchanged until the final copy. */
export class SlicedInstanceUploads {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.owner = null;
    this.frameId = null;
    this.frameBytes = 0;
    this.frameWrites = 0;
    this.failed = false;
  }

  *stage(publication, getBudget) {
    const budget = getBudget();
    const device = this.renderer?.backend?.device;
    if (this.failed || !device || !budget?.settings?.enabled || publication.bytes() <= this.settings.sliceBytes) return false;
    const plan = yield* prepareInstanceCopyPlan(this.renderer, publication, this.settings);
    if (!plan || plan.bytes > (device.limits?.maxBufferSize ?? Infinity)) {
      PerfCounters.inc('scenerySliceFallbacks');
      return false;
    }
    while (this.owner) {
      if (getBudget() !== budget || this.failed) return false;
      yield ITERATOR_PENDING;
    }
    if (getBudget() !== budget || !budget.settings.enabled || this.renderer.backend.device !== device
      || !plan.targets.every(target => sameTarget(this.renderer, target))) return false;
    const token = {};
    this.owner = token;
    let scratch = null;
    let submitted = false;
    try {
      scratch = device.createBuffer({ label: 'Scenery publication staging', size: plan.bytes, usage: COPY_SRC | COPY_DST });
      PerfCounters.set('scenerySliceStagingBytes', plan.bytes);
      for (const page of plan.pages) {
        let offset = 0;
        while (offset < page.elements) {
          if (getBudget() !== budget || !budget.settings.enabled || this.renderer.backend.device !== device) return false;
          const frame = budget.slack.frameId;
          if (frame !== this.frameId) {
            this.frameId = frame;
            this.frameBytes = 0;
            this.frameWrites = 0;
          }
          const allowance = Math.min(this.settings.sliceBytes - this.frameBytes, budget.remainingUploadBytes());
          const elements = Math.min(page.elements - offset, Math.floor(allowance / 4));
          if (elements <= 0 || this.frameWrites >= this.settings.maxWritesPerSlice) {
            PerfCounters.inc('scenerySliceDeferred');
            yield ITERATOR_PENDING;
            continue;
          }
          const bytes = elements * 4;
          device.queue.writeBuffer(scratch, page.offset + offset * 4, page.values, offset, elements);
          this.frameBytes += bytes;
          this.frameWrites++;
          offset += elements;
          PerfCounters.inc('scenerySliceUploadedBytes', bytes);
          PerfCounters.inc('publicationCustomAttributeBytes', bytes);
          yield;
        }
      }
      if (getBudget() !== budget || !budget.settings.enabled || !plan.targets.every(target => sameTarget(this.renderer, target)) || this.renderer.backend.device !== device) {
        PerfCounters.inc('scenerySliceInvalidated');
        return false;
      }
      const encoder = device.createCommandEncoder({ label: 'Scenery publication copy' });
      for (const copy of plan.copies) encoder.copyBufferToBuffer(scratch, copy.source, copy.buffer, copy.destination, copy.size);
      device.queue.submit([encoder.finish()]);
      submitted = true;
      PerfCounters.inc('scenerySliceCommits');
      PerfCounters.inc('scenerySliceGpuCopyBytes', plan.bytes);
      PerfCounters.inc('scenerySliceCopyRanges', plan.copies.length);
      return true;
    } catch (error) {
      this.failed = true;
      console.warn('Sliced instance publication disabled after GPU staging failure.', error);
      PerfCounters.inc('scenerySliceFailures');
      return false;
    } finally {
      scratch?.destroy();
      if (this.owner === token) this.owner = null;
      PerfCounters.set('scenerySliceStagingBytes', 0);
      if (!submitted) PerfCounters.inc('scenerySliceAbandoned');
    }
  }
}
