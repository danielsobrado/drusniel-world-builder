import * as THREE from 'three/webgpu';
import { OceanFftRuntime } from '../../src/editor/water/fft/OceanFftRuntime.js';
import { CASCADE_CANDIDATES } from '../../src/editor/water/fft/OceanFftConstants.js';
import { benchmarkClockStates, benchmarkDisabled, benchmarkTopologies } from './bench.js';
import {
  candidate128Cases, cascadeIsolationCase, directionCase, F32_TOLERANCE, HALF_TOLERANCE, i1TableCase,
  proof64Cases, realSpectra, smallGridCases, spectrumRebuildCase, timeContractCases,
} from './cases.js';
import { instrumentDevice, liveSummary } from './instrument.js';
import { captureView, createSamplingScene, mipCase, orientationCase, rebaseCase, samplingCostCase, seamCase } from './sampling.js';

/**
 * Isolated GPU QA fixture for the ocean FFT (PR I phase I.2). Its own renderer
 * and canvas-less device; nothing of the app's scene is loaded. Driven by
 * scripts/run-ocean-fft-qa.mjs through window.__oceanFftQa.run().
 */

const status = document.getElementById('status');
const say = (text) => { status.textContent = text; };

async function createRenderer(options = {}) {
  const renderer = new THREE.WebGPURenderer({ antialias: false, trackTimestamp: true, powerPreference: 'high-performance', ...options });
  await renderer.init();
  const device = renderer.backend.device ?? null;
  return { renderer, device, stats: device ? instrumentDevice(device) : null };
}

async function adapterReport(renderer, device) {
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
  const info = device.adapterInfo ?? adapter?.info ?? {};
  return {
    three: THREE.REVISION, userAgent: navigator.userAgent, backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl',
    vendor: info.vendor, architecture: info.architecture, description: info.description,
    fallbackAdapter: adapter?.isFallbackAdapter ?? adapter?.info?.isFallbackAdapter ?? null,
    features: [...device.features].sort(),
    limits: {
      maxComputeWorkgroupStorageSize: device.limits.maxComputeWorkgroupStorageSize,
      maxComputeInvocationsPerWorkgroup: device.limits.maxComputeInvocationsPerWorkgroup,
      maxStorageBuffersPerShaderStage: device.limits.maxStorageBuffersPerShaderStage,
      maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
      maxTextureArrayLayers: device.limits.maxTextureArrayLayers,
    },
  };
}

async function lifecycleChecks(ctx) {
  const { renderer, stats } = ctx;
  const checks = {};
  try { new OceanFftRuntime(renderer); checks.secondRuntimeRejected = false; } catch { checks.secondRuntimeRejected = true; }

  const webgl = new THREE.WebGPURenderer({ forceWebGL: true, antialias: false });
  await webgl.init();
  const fallback = new OceanFftRuntime(webgl);
  checks.webglFallback = {
    state: fallback.state, reason: fallback.reason,
    configured: fallback.configure({ size: 64, tileSizes: [CASCADE_CANDIDATES[0].tileSizeMeters], spectra: realSpectra(64, 1, [CASCADE_CANDIDATES[0]]) }),
    prepared: fallback.prepare(1), output: fallback.output,
  };
  fallback.dispose();
  webgl.dispose();

  const { runtime } = ctx;
  const config = { size: 128, tileSizes: CASCADE_CANDIDATES.map((c) => c.tileSizeMeters), spectra: realSpectra(128) };
  runtime.configure(config);
  runtime.prepare(3);
  await runtime.settled();
  runtime.handleDeviceLost({ reason: 'qa-simulated', message: 'lifecycle check' });
  checks.deviceLost = { state: runtime.state, output: runtime.output, live: liveSummary(stats) };
  runtime.configure(config);
  runtime.prepare(4);
  checks.recovered = { state: await runtime.settled(), hasOutput: !!runtime.output };

  // Repeated configure / reconfigure / dispose must return every buffer and texture.
  runtime.dispose();
  await ctx.device.queue.onSubmittedWorkDone();
  const baseline = liveSummary(stats);
  const cycle = [{ size: 64, tileSizes: [CASCADE_CANDIDATES[0].tileSizeMeters], spectra: realSpectra(64, 1, [CASCADE_CANDIDATES[0]]) }, config];
  const pipelinesBefore = stats.computePipelines;
  for (let i = 0; i < 12; i++) {
    const again = new OceanFftRuntime(renderer);
    for (const c of cycle) {
      again.configure(c);
      again.prepare(i + 0.5);
      await again.settled();
    }
    again.dispose();
  }
  await ctx.device.queue.onSubmittedWorkDone();
  checks.leak = { baseline, after: liveSummary(stats), computePipelinesCreated: stats.computePipelines - pipelinesBefore };
  checks.leak.pass = checks.leak.after.buffers === baseline.buffers && checks.leak.after.textures === baseline.textures;
  ctx.runtime = new OceanFftRuntime(renderer);
  checks.pass = checks.secondRuntimeRejected && checks.webglFallback.state === 'unsupported' && !checks.webglFallback.configured
    && !checks.webglFallback.prepared && checks.deviceLost.state === 'failed' && checks.deviceLost.output === null
    && checks.recovered.state === 'active' && checks.leak.pass;
  return checks;
}

async function restartTiming() {
  const started = performance.now();
  const { renderer, device, stats } = await createRenderer();
  const initMs = performance.now() - started;
  const runtime = new OceanFftRuntime(renderer);
  runtime.configure({ size: 128, tileSizes: CASCADE_CANDIDATES.map((c) => c.tileSizeMeters), spectra: realSpectra(128) });
  runtime.prepare(1);
  const state = await runtime.settled();
  await device.queue.onSubmittedWorkDone();
  const coldMs = performance.now() - started;
  const warmStarted = performance.now();
  runtime.configure({ size: 128, tileSizes: CASCADE_CANDIDATES.map((c) => c.tileSizeMeters), spectra: realSpectra(128, 5) });
  runtime.prepare(2);
  await runtime.settled();
  await device.queue.onSubmittedWorkDone();
  const result = { state, rendererInitMs: initMs, coldStartMs: coldMs, warmReconfigureMs: performance.now() - warmStarted, errors: stats.errors };
  runtime.dispose();
  renderer.dispose();
  return result;
}

/** Rendered chunk planes near −4.2 Mm: rebase invariance, screenshots and sampling cost (PR I phase I.3). */
async function samplingScene(ctx, report, benchmark) {
  const parts = await createSamplingScene(ctx);
  const far = parts.FAR;
  const result = { rebase: await rebaseCase(ctx, parts) };
  const views = {
    'top-down-chunk-corner': { renderOrigin: [far, far], eye: [far + 64, 160, far + 65], look: [far + 64, 0, far + 64] },
    'grazing-horizon': { renderOrigin: [far, far], eye: [far, 6, far - 700], look: [far, 0, far + 400] },
    'high-altitude': { renderOrigin: [far, far], eye: [far - 200, 1200, far - 900], look: [far, 0, far] },
  };
  report.screenshots = {};
  for (const [name, view] of Object.entries(views)) report.screenshots[name] = await captureView(ctx, parts, view);
  if (benchmark) result.cost = await samplingCostCase(ctx, parts);
  parts.dispose();
  result.pass = result.rebase.pass;
  return result;
}

async function run({ benchmark = true } = {}) {
  const ctx = await createRenderer();
  ctx.runtime = new OceanFftRuntime(ctx.renderer);
  const report = { tolerances: { f32: F32_TOLERANCE, half: HALF_TOLERANCE }, adapter: await adapterReport(ctx.renderer, ctx.device) };
  const step = async (name, fn) => { say(`running ${name}`); report[name] = await fn(); };
  await step('smallGrids', () => smallGridCases(ctx));
  await step('i1Table', () => i1TableCase(ctx));
  await step('direction', () => directionCase(ctx));
  await step('proof64', () => proof64Cases(ctx));
  await step('candidate128', () => candidate128Cases(ctx));
  await step('timeContract', () => timeContractCases(ctx));
  await step('cascadeIsolation', () => cascadeIsolationCase(ctx));
  await step('spectrumRebuild', () => spectrumRebuildCase(ctx));
  await step('orientation', () => orientationCase(ctx));
  await step('seams', () => seamCase(ctx));
  await step('mips', () => mipCase(ctx));
  await step('scene', () => samplingScene(ctx, report, benchmark));
  await step('lifecycle', () => lifecycleChecks(ctx));
  await step('disabled', () => benchmarkDisabled(createRenderer));
  if (benchmark) {
    await step('clockStates', () => benchmarkClockStates(ctx));
    await step('topologies', () => benchmarkTopologies(ctx));
    await step('restart', () => restartTiming());
  }
  report.validationErrors = ctx.stats.errors;
  report.pipelines = { compute: ctx.stats.computePipelines, render: ctx.stats.renderPipelines, shaderModules: ctx.stats.shaderModules };
  const caseLists = ['smallGrids', 'i1Table', 'direction', 'proof64', 'candidate128'].map((key) => report[key]);
  report.pass = caseLists.every((list) => list.every((row) => row.pass))
    && ['timeContract', 'cascadeIsolation', 'spectrumRebuild', 'lifecycle', 'disabled', 'seams', 'mips', 'scene'].every((key) => report[key].pass)
    && report.orientation.every((row) => row.pass)
    && report.validationErrors.length === 0;
  ctx.runtime.dispose();
  ctx.renderer.dispose();
  say(report.pass ? 'pass' : 'FAIL');
  return report;
}

window.__oceanFftQa = { run };
say('ready');
