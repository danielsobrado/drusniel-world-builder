import { AttributeType } from 'three/src/renderers/common/Constants.js';
import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';
import { isDirectInstanceMesh, initialComputeDraw } from './InitialInstancePreparation.js';

const MIN_STAGED_BYTES = 256 * 1024;
const WORD_BYTES = 4;

function descriptor(attribute, index = false, minBytes = MIN_STAGED_BYTES, explicitStorage = false) {
  if (!attribute?.isBufferAttribute || attribute.isInterleavedBufferAttribute || !attribute.array) return null;
  const storage = attribute.isStorageBufferAttribute || attribute.isStorageInstancedBufferAttribute;
  const array = attribute.array;
  if (index ? storage || !(array instanceof Uint16Array || array instanceof Uint32Array)
    : (!(array instanceof Float32Array) && !(explicitStorage && storage && array instanceof Uint32Array && attribute.itemSize === 1))
      || (storage ? attribute.itemSize === 3 : attribute.itemSize > 4)) return null;
  if (array.byteLength === 0 || array.byteLength < minBytes) return null;
  const type = index ? AttributeType.INDEX : storage ? AttributeType.STORAGE : AttributeType.VERTEX;
  return { attribute, type };
}

/** Only layouts the pinned backend does not repack. Ordinary instance matrices
 * and colors may be wrapped by Three's nodes; storage attributes are direct. */
export function stagedGeometryAttributes(mesh, includeSmallInstances = false) {
  const geometry = mesh.geometry;
  const candidates = Object.values(geometry?.attributes ?? {}).map(attribute => descriptor(attribute, false,
    includeSmallInstances && (attribute.isInstancedBufferAttribute || attribute.isStorageInstancedBufferAttribute)
      ? WORD_BYTES : MIN_STAGED_BYTES));
  candidates.push(descriptor(geometry?.index, true));
  if (mesh.instanceMatrix?.isStorageInstancedBufferAttribute) {
    candidates.push(descriptor(mesh.instanceMatrix, false, includeSmallInstances ? WORD_BYTES : MIN_STAGED_BYTES));
  }
  return [...new Map(candidates.filter(Boolean).map(entry => [entry.attribute, entry])).values()];
}

export class StagedGeometryUploads {
  constructor(renderer, settings = null) {
    this.renderer = renderer;
    this.settings = settings;
    this.jobs = new Map();
    this.fallbacks = new WeakSet();
    this.detachedBytes = 0;
    this.allocations = 0;
  }

  get supported() {
    const { backend, _attributes: manager } = this.renderer ?? {};
    return Boolean(backend?.isWebGPUBackend && backend.device && manager?.update && manager?.has);
  }

  beginFrame() { this.allocations = 0; }

  entries(mesh) {
    const entries = stagedGeometryAttributes(mesh, Boolean(this.settings && isDirectInstanceMesh(mesh)));
    const compute = this.settings && initialComputeDraw(mesh);
    if (compute?.isDormant()) {
      for (const attribute of compute.storageAttributes) {
        if (!attribute.isStorageBufferAttribute || attribute.isIndirectStorageBufferAttribute) continue;
        const entry = descriptor(attribute, false, WORD_BYTES, true);
        if (entry) entries.push(entry);
      }
    }
    return [...new Map(entries.map(entry => [entry.attribute, entry])).values()];
  }

  needsInitialInstanceUpload(mesh) {
    if (!this.supported || !isDirectInstanceMesh(mesh)) return false;
    return !this.renderer.backend.get(mesh.instanceMatrix).buffer;
  }

  drop(jobs, attribute, destroy = true) {
    const job = jobs.get(attribute);
    if (!job) return;
    if (destroy) job.buffer.destroy();
    jobs.delete(attribute);
    this.detachedBytes -= job.size;
    if (this.settings) PerfCounters.set('initialInstanceDetachedBytes', this.detachedBytes);
  }

  fallback(mesh, bytes, reason) {
    this.cancel(mesh);
    this.fallbacks.add(mesh);
    PerfCounters.inc('initialInstanceFallbacks');
    PerfCounters.inc(`initialInstanceFallback.${reason}`);
    return { ready: true, bytes, attributes: [] };
  }

  advance(mesh, byteLimit, shouldYield, excluded = []) {
    if (!this.supported || this.fallbacks.has(mesh)) return { ready: true, bytes: 0, attributes: [] };
    const { backend, _attributes: manager } = this.renderer;
    const entries = this.entries(mesh).filter(entry => !excluded.includes(entry.attribute));
    let jobs = this.jobs.get(mesh);
    if (!jobs) this.jobs.set(mesh, jobs = new Map());
    const wanted = new Set(entries.map(entry => entry.attribute));
    for (const attribute of jobs.keys()) if (!wanted.has(attribute)) this.drop(jobs, attribute);
    let bytes = 0;
    const attributes = [];
    for (const entry of entries) {
      const { attribute } = entry;
      let job = jobs.get(attribute);
      if (backend.get(attribute).buffer) {
        this.drop(jobs, attribute);
        continue;
      }
      if (this.settings && (manager.has(attribute) || (backend.getBufferAttribute && backend.getBufferAttribute(attribute) !== attribute))) {
        return this.fallback(mesh, bytes, 'layout');
      }
      if (job && (job.version !== attribute.version || job.array !== attribute.array || job.type !== entry.type)) {
        if (this.settings) {
          if (job.restarts >= this.settings.maxRestarts || job.type !== entry.type
              || job.size !== Math.ceil(attribute.array.byteLength / WORD_BYTES) * WORD_BYTES) return this.fallback(mesh, bytes, 'mutation');
          job.restarts++;
          job.version = attribute.version;
          job.array = attribute.array;
          job.offset = 0;
          PerfCounters.inc('initialInstanceRestarts');
        } else {
          this.drop(jobs, attribute);
          job = null;
        }
      }
      if (!job) {
        if (shouldYield?.() || byteLimit - bytes < WORD_BYTES) return { ready: false, bytes, attributes };
        const flags = GPUBufferUsage;
        const usage = entry.type === AttributeType.INDEX ? flags.INDEX
          : entry.type === AttributeType.STORAGE ? flags.STORAGE | flags.VERTEX : flags.VERTEX;
        const size = Math.ceil(attribute.array.byteLength / WORD_BYTES) * WORD_BYTES;
        if (this.settings) {
          if (size > (backend.device.limits?.maxBufferSize ?? Infinity) || this.detachedBytes + size > this.settings.maxDetachedBytes) {
            return this.fallback(mesh, bytes, 'capacity');
          }
          if (this.allocations >= this.settings.maxAllocationsPerFrame) return { ready: false, bytes, attributes };
        }
        const started = performance.now();
        const buffer = backend.device.createBuffer({ size, usage: usage | flags.COPY_SRC | flags.COPY_DST, label: attribute.name });
        job = { ...entry, array: attribute.array, version: attribute.version, buffer, offset: 0, size, restarts: 0, device: backend.device };
        jobs.set(attribute, job);
        this.detachedBytes += size;
        this.allocations++;
        PerfCounters.inc('stagedGeometryAllocationBytes', size);
        PerfCounters.inc('stagedGeometryAllocationMs', performance.now() - started);
        if (this.settings) {
          PerfCounters.inc('initialInstanceAllocations');
          PerfCounters.set('initialInstanceDetachedBytes', this.detachedBytes);
        }
      }
      if (job.device !== backend.device) return this.fallback(mesh, bytes, 'device');
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
        if (this.settings) PerfCounters.inc('initialInstanceSlicedBytes', length);
        if (job.offset < job.size) return { ready: false, bytes, attributes };
      }
      attributes.push(attribute);
    }
    return { ready: true, bytes, attributes };
  }

  adopt(mesh) {
    const { backend, _attributes: manager } = this.renderer;
    this.fallbacks.delete(mesh);
    const jobs = this.jobs.get(mesh);
    if (!jobs) return;
    for (const [attribute, job] of jobs) {
      const data = backend.get(attribute);
      if (data.buffer || job.device !== backend.device || attribute.version !== job.version || attribute.array !== job.array || job.offset !== job.size
          || (this.settings && manager.has(attribute))) {
        this.drop(jobs, attribute);
        continue;
      }
      data.buffer = job.buffer;
      try { manager.update(attribute, job.type); }
      catch (error) {
        if (data.buffer === job.buffer) delete data.buffer;
        this.drop(jobs, attribute);
        throw error;
      }
      attribute.clearUpdateRanges();
      this.drop(jobs, attribute, false);
      if (this.settings) PerfCounters.inc('initialInstanceAdoptedBuffers');
    }
    this.jobs.delete(mesh);
  }

  cancel(mesh) {
    this.fallbacks.delete(mesh);
    const jobs = this.jobs.get(mesh);
    if (!jobs) return;
    for (const attribute of jobs.keys()) this.drop(jobs, attribute);
    this.jobs.delete(mesh);
  }

  dispose() { for (const mesh of this.jobs.keys()) this.cancel(mesh); }
}
