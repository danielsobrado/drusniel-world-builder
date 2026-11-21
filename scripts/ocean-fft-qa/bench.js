import { OceanFftRuntime } from '../../src/editor/water/fft/OceanFftRuntime.js';
import { CASCADE_CANDIDATES } from '../../src/editor/water/fft/OceanFftConstants.js';
import { realSpectra } from './cases.js';
import { liveSummary } from './instrument.js';

/**
 * GPU timing of the ocean FFT (PR I phase I.2). Compute and output-pass times
 * come from WebGPU timestamp queries (renderer.resolveTimestampsAsync), never
 * from render-pass totals of a scene. Mip generation has no timestamp in r187,
 * so the whole transform is also timed as back-to-back GPU throughput.
 */

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const summary = (values) => ({
  samples: values.length, median: median(values), mean: values.reduce((a, b) => a + b, 0) / (values.length || 1),
  min: Math.min(...values), max: Math.max(...values),
});

const TOPOLOGIES = {
  '64²×1': { size: 64, cascades: [CASCADE_CANDIDATES[0]] },
  '128²×2': { size: 128, cascades: CASCADE_CANDIDATES },
  '256²×2 (research)': { size: 256, cascades: CASCADE_CANDIDATES },
};

async function timePhases(renderer, runtime, iterations) {
  const { kernels, resources } = runtime;
  const phases = { evolve: [], rows: [], columns: [], output: [] };
  await renderer.resolveTimestampsAsync('compute');
  await renderer.resolveTimestampsAsync('render');
  for (let i = 0; i < iterations; i++) {
    kernels.tick.value = (i * 4099) % (2 ** 22);
    for (const phase of ['evolve', 'rows', 'columns']) {
      renderer.compute(kernels[phase]);
      phases[phase].push(await renderer.resolveTimestampsAsync('compute'));
    }
    const previous = renderer.getRenderTarget();
    resources.output.texture.generateMipmaps = false;
    kernels.outputQuads.forEach((quad, layer) => { renderer.setRenderTarget(resources.output, layer); quad.render(renderer); });
    renderer.setRenderTarget(previous);
    phases.output.push(await renderer.resolveTimestampsAsync('render'));
  }
  return Object.fromEntries(Object.entries(phases).map(([key, values]) => [key, summary(values)]));
}

/** Full runtime.prepare per frame: GPU timestamps of its compute pass and output passes. */
async function timeTransforms(renderer, runtime, iterations, startTime) {
  const compute = [], output = [], cpu = [];
  await renderer.resolveTimestampsAsync('compute');
  await renderer.resolveTimestampsAsync('render');
  for (let i = 0; i < iterations; i++) {
    const started = performance.now();
    runtime.prepare(startTime + (i + 1) / 60);
    cpu.push(performance.now() - started);
    compute.push(await renderer.resolveTimestampsAsync('compute'));
    output.push(await renderer.resolveTimestampsAsync('render'));
  }
  return { computeMs: summary(compute), outputPassesMs: summary(output), cpuPrepareMs: summary(cpu) };
}

/** Wall time of K back-to-back transforms (compute + output + mips) until the queue drains. */
async function throughput(device, runtime, count, startTime) {
  await device.queue.onSubmittedWorkDone();
  const started = performance.now();
  for (let i = 0; i < count; i++) runtime.prepare(startTime + i / 60);
  await device.queue.onSubmittedWorkDone();
  return (performance.now() - started) / count;
}

export async function benchmarkTopologies(ctx, { iterations = 120, throughputCount = 300 } = {}) {
  const { renderer, runtime, device } = ctx;
  const rows = {};
  for (const [label, { size, cascades }] of Object.entries(TOPOLOGIES)) {
    const spectra = realSpectra(size, 1234, cascades);
    const configureStarted = performance.now();
    runtime.configure({ size, tileSizes: cascades.map((c) => c.tileSizeMeters), spectra });
    const configureMs = performance.now() - configureStarted;
    const warmStarted = performance.now();
    runtime.prepare(0);
    await runtime.settled();
    await device.queue.onSubmittedWorkDone();
    const firstTransformMs = performance.now() - warmStarted;
    for (let i = 0; i < 30; i++) runtime.prepare(1 + i / 60);
    await device.queue.onSubmittedWorkDone();
    const transforms = await timeTransforms(renderer, runtime, iterations, 100);
    rows[label] = {
      size, cascades: cascades.length, state: runtime.state, diagnostics: runtime.diagnostics(),
      live: liveSummary(ctx.stats), configureMs, firstTransformMs,
      phasesMs: await timePhases(renderer, runtime, iterations), ...transforms,
      throughputMsPerTransform: await throughput(device, runtime, throughputCount, 1000),
    };
  }
  return rows;
}

/** Disabled runtime, paused clock, time jump: what each issues. */
export async function benchmarkClockStates(ctx) {
  const { renderer, runtime, stats, device } = ctx;
  runtime.configure({ size: 128, tileSizes: CASCADE_CANDIDATES.map((c) => c.tileSizeMeters), spectra: realSpectra(128) });
  runtime.prepare(50);
  await runtime.settled();
  await device.queue.onSubmittedWorkDone();
  const measure = async (label, fn, count) => {
    const submits = stats.submits, transforms = runtime.counters.transforms;
    await renderer.resolveTimestampsAsync('compute');
    const started = performance.now();
    for (let i = 0; i < count; i++) fn(i);
    const cpuMs = (performance.now() - started) / count;
    const gpuComputeMs = await renderer.resolveTimestampsAsync('compute');
    return { label, calls: count, cpuMsPerCall: cpuMs, submits: stats.submits - submits, transforms: runtime.counters.transforms - transforms, gpuComputeMsTotal: gpuComputeMs };
  };
  return {
    paused: await measure('paused clock (same time)', () => runtime.prepare(50), 1000),
    jump: await measure('time jump +1000 s', () => runtime.prepare(1050), 1),
  };
}

/** A disabled runtime on its own instrumented renderer must issue nothing at all. */
export async function benchmarkDisabled(createRenderer) {
  const { renderer, stats } = await createRenderer();
  const runtime = new OceanFftRuntime(renderer, { enabled: false });
  const before = { submits: stats.submits, buffers: stats.liveBuffers.size, pipelines: stats.computePipelines };
  const started = performance.now();
  for (let i = 0; i < 1000; i++) runtime.prepare(i / 60);
  const cpuMsPerCall = (performance.now() - started) / 1000;
  const result = {
    state: runtime.state, cpuMsPerCall, submits: stats.submits - before.submits,
    buffersCreated: stats.liveBuffers.size - before.buffers, computePipelines: stats.computePipelines - before.pipelines,
    transforms: runtime.counters.transforms,
  };
  result.pass = result.submits === 0 && result.buffersCreated === 0 && result.computePipelines === 0 && result.transforms === 0;
  runtime.dispose();
  renderer.dispose();
  return result;
}
