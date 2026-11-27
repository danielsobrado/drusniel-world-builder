import { extractSurfaceSteps } from './SurfaceNets.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';

const COPY_VALUES = 256 * 1024;
const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

export async function extractSurfaceCooperatively(grid, sliceMs, { clock = () => performance.now(), pause = yieldTask, signal } = {}) {
  const iterator = extractSurfaceSteps(grid);
  let started = clock();
  for (;;) {
    signal?.throwIfAborted();
    const step = iterator.next();
    if (step.done) return step.value;
    if (clock() - started >= sliceMs) {
      await pause();
      started = clock();
    }
  }
}

async function snapshot(grid, sliceMs, signal) {
  signal?.throwIfAborted();
  const data = new Float32Array(grid.data.length);
  let started = performance.now();
  for (let offset = 0; offset < data.length; offset += COPY_VALUES) {
    signal?.throwIfAborted();
    data.set(grid.data.subarray(offset, offset + COPY_VALUES), offset);
    if (performance.now() - started >= sliceMs) {
      await yieldTask();
      started = performance.now();
    }
  }
  signal?.throwIfAborted();
  const { min, voxel, nx, ny, nz, sy, sz, open, cap } = grid;
  return { min, voxel, nx, ny, nz, sy, sz, open, cap, data };
}

function runWorker(worker, input, timeoutMs, signal) {
  let timeout, abort;
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(() => reject(new Error('Location surface worker timed out.')), timeoutMs);
    const fail = event => {
      event.preventDefault?.();
      reject(new Error(event.message ?? 'Location surface worker failed.'));
    };
    worker.addEventListener('error', fail);
    worker.addEventListener('messageerror', fail);
    worker.addEventListener('message', ({ data }) => {
      if (data?.error) reject(new Error(data.error));
      else {
        const surface = data?.surface;
        if (!(surface?.positions instanceof Float32Array) || !(surface.normals instanceof Float32Array)
            || !(surface.indices instanceof Uint32Array) || surface.positions.length !== surface.normals.length
            || surface.positions.length % 3 || surface.indices.length % 3) {
          reject(new Error('Invalid location surface worker result.'));
        } else resolve(surface);
      }
    });
    try { worker.postMessage(input, [input.data.buffer]); }
    catch (error) { reject(error); }
  }).finally(() => {
    clearTimeout(timeout);
    if (abort) signal?.removeEventListener('abort', abort);
  });
}

/** Preserve the authoritative density grid for collision, lighting and portals. */
export async function prepareLocationSurface(grid, settings, {
  signal,
  workerFactory = () => new Worker(new URL('./locationSurface.worker.js', import.meta.url), { type: 'module' }),
} = {}) {
  signal?.throwIfAborted();
  const started = performance.now();
  try {
    if (settings.generationWorker && grid.data.byteLength <= settings.generationMaxCopyBytes) {
      let worker;
      try {
        const input = await snapshot(grid, settings.generationSliceMs, signal);
        signal?.throwIfAborted();
        worker = workerFactory();
        const result = await runWorker(worker, input, settings.generationWorkerTimeoutMs, signal);
        signal?.throwIfAborted();
        PerfCounters.inc('locationGeneration.workerCompleted');
        return result;
      } catch (error) {
        signal?.throwIfAborted();
        PerfCounters.inc('locationGeneration.workerFallbacks');
        console.warn('Location surface worker unavailable; using cooperative extraction.', error);
      } finally {
        worker?.terminate();
      }
    }
    PerfCounters.inc('locationGeneration.cooperativeRuns');
    return await extractSurfaceCooperatively(grid, settings.generationSliceMs, { signal });
  } finally {
    PerfCounters.inc('locationGeneration.surfaceMs', performance.now() - started);
  }
}
