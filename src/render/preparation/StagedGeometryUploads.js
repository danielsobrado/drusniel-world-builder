import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';

const MIN_STAGED_BYTES = 256 * 1024;
const WORD_BYTES = 4;

function descriptor(attribute, index = false) {
  if (!attribute?.isBufferAttribute || attribute.isInterleavedBufferAttribute || !attribute.array) return null;
  const storage = attribute.isStorageBufferAttribute || attribute.isStorageInstancedBufferAttribute;
  const array = attribute.array;
  if (index ? storage || !(array instanceof Uint16Array || array instanceof Uint32Array)
    : !(array instanceof Float32Array) || (storage ? attribute.itemSize === 3 : attribute.itemSize > 4)) return null;
  if (array.byteLength < MIN_STAGED_BYTES) return null;
  const type = index ? AttributeType.INDEX : storage ? AttributeType.STORAGE : AttributeType.VERTEX;
  return { attribute, type };
}

/** Only layouts the pinned backend does not repack. Ordinary instance matrices
 * and colors may be wrapped by Three's nodes; storage attributes are direct. */
export function stagedGeometryAttributes(mesh) {
  const geometry = mesh.geometry;
  const candidates = Object.values(geometry?.attributes ?? {}).map(attribute => descriptor(attribute));
  candidates.push(descriptor(geometry?.index, true));
  if (mesh.instanceMatrix?.isStorageInstancedBufferAttribute) candidates.push(descriptor(mesh.instanceMatrix));
  return [...new Map(candidates.filter(Boolean).map(entry => [entry.attribute, entry])).values()];
}

export class StagedGeometryUploads {
  constructor(renderer) {
    this.renderer = renderer;
    this.jobs = new Map();
  }

  get supported() {
    const { backend, _attributes: manager } = this.renderer;
    return Boolean(backend?.isWebGPUBackend && backend.device && manager?.update && manager?.has);
  }

  advance(mesh, byteLimit, shouldYield, excluded = []) {
    if (!this.supported) return { ready: true, bytes: 0, attributes: [] };
    const { backend } = this.renderer;
    const entries = stagedGeometryAttributes(mesh).filter(entry => !excluded.includes(entry.attribute));
    let jobs = this.jobs.get(mesh);
    if (!jobs) this.jobs.set(mesh, jobs = new Map());
    let bytes = 0;
    const attributes = [];
    for (const entry of entries) {
      const { attribute } = entry;
      let job = jobs.get(attribute);
      if (backend.get(attribute).buffer) {
        job?.buffer.destroy();
        jobs.delete(attribute);
        continue;
      }
      if (job && (job.version !== attribute.version || job.array !== attribute.array)) {
        job.buffer.destroy(); jobs.delete(attribute); job = null;
      }
      if (!job) {
        if (shouldYield?.() || byteLimit - bytes < WORD_BYTES) return { ready: false, bytes, attributes };
        const flags = GPUBufferUsage;
        const usage = entry.type === AttributeType.INDEX ? flags.INDEX
          : entry.type === AttributeType.STORAGE ? flags.STORAGE | flags.VERTEX : flags.VERTEX;
        const size = Math.ceil(attribute.array.byteLength / WORD_BYTES) * WORD_BYTES;
        const started = performance.now();
        const buffer = backend.device.createBuffer({ size, usage: usage | flags.COPY_SRC | flags.COPY_DST, label: attribute.name });
        job = { ...entry, array: attribute.array, version: attribute.version, buffer, offset: 0, size };
        jobs.set(attribute, job);
        PerfCounters.inc('stagedGeometryAllocationBytes', size);
        PerfCounters.inc('stagedGeometryAllocationMs', performance.now() - started);
      }
      if (job.offset < job.size) {
        if (shouldYield?.()) return { ready: false, bytes, attributes };
        const length = Math.min(job.size - job.offset, Math.floor((byteLimit - bytes) / WORD_BYTES) * WORD_BYTES);
        if (length <= 0) return { ready: false, bytes, attributes };
        const source = new Uint8Array(job.array.buffer, job.array.byteOffset, job.array.byteLength);
        const direct = Math.min(length, Math.floor((source.length - job.offset) / WORD_BYTES) * WORD_BYTES);
        if (direct > 0) backend.device.queue.writeBuffer(job.buffer, job.offset, source, job.offset, direct);
        if (direct < length) {
          const tail = new Uint8Array(WORD_BYTES);
          tail.set(source.subarray(job.offset + direct));
          backend.device.queue.writeBuffer(job.buffer, job.offset + direct, tail);
        }
        job.offset += length; bytes += length;
        PerfCounters.inc('stagedGeometryUploadBytes', length);
        if (job.offset < job.size) return { ready: false, bytes, attributes };
      }
      attributes.push(attribute);
    }
    return { ready: true, bytes, attributes };
  }

  adopt(mesh) {
    const { backend, _attributes: manager } = this.renderer;
    const jobs = this.jobs.get(mesh);
    if (!jobs) return;
    for (const [attribute, job] of jobs) {
      const data = backend.get(attribute);
      if (data.buffer || attribute.version !== job.version || attribute.array !== job.array || job.offset !== job.size) {
        job.buffer.destroy();
        continue;
      }
      data.buffer = job.buffer;
      try { manager.update(attribute, job.type); }
      catch (error) { if (data.buffer === job.buffer) delete data.buffer; job.buffer.destroy(); throw error; }
      attribute.clearUpdateRanges();
    }
    this.jobs.delete(mesh);
  }

  cancel(mesh) {
    const jobs = this.jobs.get(mesh);
    if (!jobs) return;
    for (const job of jobs.values()) job.buffer.destroy();
    this.jobs.delete(mesh);
  }

  dispose() { for (const mesh of this.jobs.keys()) this.cancel(mesh); }
}
