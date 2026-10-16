import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { MeadowWorkerCompaction } from './MeadowWorkerCompaction.js';
import { MeadowSharedGroundInputs } from './MeadowSharedGroundInputs.js';

const WORKER_COUNT = 2;
/**
 * Jobs a worker may hold. The second waits in the worker's own message queue,
 * so a worker starts it as soon as the first finishes instead of idling until
 * the layer's next frame turn.
 */
const JOBS_PER_WORKER = 2;
const outputBuffers = output => output ? ['position', 'rotation', 'data'].map(name => output[name].buffer) : [];
function clonedBytes(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return 0;
  if (ArrayBuffer.isView(value)) return value.buffer.byteLength;
  let bytes = 0;
  for (const key in value) bytes += clonedBytes(value[key], depth + 1);
  return bytes;
}

/**
 * No unbounded queue: tiles dispatch in the layer's current visibility order,
 * at most `JOBS_PER_WORKER` per worker. Either layer may use either worker, but
 * one slot always stays free for the other layer, so far cards keep a turn
 * while blade promotions are continuously busy.
 */
export class MeadowCompactionPool {
  constructor({ workerFactory = () => new Worker(new URL('./meadowCompaction.worker.js', import.meta.url), { type: 'module' }),
    workerCount = WORKER_COUNT, jobsPerWorker = JOBS_PER_WORKER } = {}) {
    this.workers = [];
    this.pending = new Map();
    this.templates = new Map();
    this.jobsPerWorker = jobsPerWorker;
    this.serial = 0;
    this.failed = false;
    this.disposed = false;
    try {
      for (let i = 0; i < workerCount; i++) {
        const worker = workerFactory();
        worker.meadowJobs = 0;
        worker.meadowShared = new MeadowSharedGroundInputs();
        this.workers.push(worker);
        worker.addEventListener('message', event => this.complete(event.data));
        worker.addEventListener('error', () => this.fail());
        worker.addEventListener('messageerror', () => this.fail());
      }
    } catch { this.fail(); }
  }

  register(template) {
    if (this.failed || this.templates.has(template)) return;
    const id = this.templates.size;
    this.templates.set(template, id);
    this.hasCards ||= Boolean(template.userData.meadow.cards);
    const definition = { count: template.instanceCount, meadow: template.userData.meadow,
      attributes: Object.fromEntries(['instancePosition', 'instanceRotation', 'instanceData']
        .map(name => [name, template.getAttribute(name).array])) };
    try {
      for (const worker of this.workers) worker.postMessage({ type: 'template', id, definition });
    } catch { this.fail(); }
  }

  create(options) {
    this.register(options.template);
    return new MeadowWorkerCompaction(this, options);
  }

  static kindOf(template) {
    return template.userData.meadow.cards ? 1 : 0;
  }

  /** The least-loaded worker with a free slot, preferring the kind's home worker on ties. */
  workerFor(template) {
    if (this.failed || this.disposed || this.workers.length === 0) return null;
    const kind = MeadowCompactionPool.kindOf(template);
    if (this.hasCards && this.workers.length > 1) {
      let own = 0;
      for (const job of this.pending.values()) own += Number(job.kind === kind);
      if (own >= this.workers.length * this.jobsPerWorker - 1) return null;
    }
    const home = this.workers[kind % this.workers.length];
    let best = null;
    for (const worker of this.workers) {
      if (worker.meadowJobs >= this.jobsPerWorker) continue;
      if (!best || worker.meadowJobs < best.meadowJobs
          || (worker.meadowJobs === best.meadowJobs && worker === home)) best = worker;
    }
    return best;
  }

  hasCapacity(template) {
    return this.failed || this.workerFor(template) !== null;
  }

  templateForCapacity(template, capacity) {
    return [...this.templates.keys()].find(candidate => candidate.instanceCount === capacity
      && candidate.userData.meadow.tileSize === template.userData.meadow.tileSize
      && candidate.userData.meadow.cards === template.userData.meadow.cards) ?? template;
  }

  dispatch(task) {
    if (this.failed || this.disposed) return;
    const worker = this.workerFor(task.template);
    if (!worker) return;
    this.register(task.template);
    if (this.failed) return;
    const id = ++this.serial;
    const output = task.recycled;
    const capacity = task.template.instanceCount;
    const ground = worker.meadowShared.request(task.options.snapshot);
    const previous = task.result ? { output: task.result.output, capacity: task.result.capacity } : null;
    const request = { type: 'build', id, templateId: this.templates.get(task.template),
      ...ground.fields, centerX: task.options.centerX, centerZ: task.options.centerZ, previous, output };
    task.pending = true;
    task.recycled = null;
    const started = performance.now();
    if (worker.meadowJobs === 0 && Number.isFinite(worker.meadowIdleSince)) {
      PerfCounters.inc('meadowWorkerIdleGapMs', started - worker.meadowIdleSince);
    }
    worker.meadowJobs += 1;
    this.pending.set(id, { worker, task, capacity, started, kind: MeadowCompactionPool.kindOf(task.template) });
    try {
      worker.postMessage(request, outputBuffers(output));
      PerfCounters.inc('meadowWorkerRequests');
      PerfCounters.inc('meadowWorkerPostMs', performance.now() - started);
      PerfCounters.inc('meadowWorkerClonedBytes', ground.bytes + clonedBytes(previous));
    } catch { this.fail(); }
  }

  complete(message) {
    const job = this.pending.get(message?.id);
    if (!job || this.disposed) return;
    const output = message.output;
    if (message.error || message.capacity !== job.capacity || !Number.isInteger(output?.count)
        || output.count < 0 || output.count > job.capacity
        || output.position?.length !== job.capacity * 4 || output.rotation?.length !== job.capacity * 2
        || output.data?.length !== job.capacity * 4) {
      this.fail(); return;
    }
    this.pending.delete(message.id);
    job.worker.meadowJobs -= 1;
    if (job.worker.meadowJobs === 0) job.worker.meadowIdleSince = performance.now();
    job.task.complete(message.output, message.capacity);
    PerfCounters.inc('meadowWorkerRanksPrepared', message.capacity - (message.previousCapacity ?? 0));
    PerfCounters.inc('meadowWorkerCompleteMs', performance.now() - job.started);
    if (Number.isFinite(message.execMs)) PerfCounters.inc('meadowWorkerExecMs', message.execMs);
  }

  fail() {
    if (this.failed) return;
    this.failed = true;
    for (const { task } of this.pending.values()) task.pending = false;
    this.pending.clear();
    this.releaseWorkers();
    PerfCounters.inc('meadowWorkerFailures');
  }

  releaseWorkers() {
    for (const worker of this.workers) {
      worker.terminate();
      worker.meadowShared?.clear();
    }
    this.workers.length = 0;
  }

  dispose() {
    this.disposed = true;
    this.releaseWorkers();
    this.pending.clear();
    this.templates.clear();
  }
}
