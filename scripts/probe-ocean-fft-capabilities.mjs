import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// PR I phase I.0: what the app's own WebGPU device can do for an offshore FFT, and where
// the world's ocean is deep enough to need one. Probes only; it builds no FFT.
const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const url = new URL(option('--url', 'http://127.0.0.1:5217'));
const out = path.resolve(option('--out', 'tmp/ocean-fft-probe/capabilities.json'));
// Canonical rays from the coastal QA poses toward open water: [label, x, z, dirX, dirZ].
const rays = [
  ['exposed-beach', -9022, -7492, 23, -26], ['exposed-beach-east', -9022, -7492, 1, 0],
  ['exposed-beach-south', -9022, -7492, 0, -1], ['curved-coast', 2176, -10604, 1, 0],
  ['curved-coast-north', 2176, -10604, 0, 1], ['headland', 2376, -4538, 0.45, -1],
  ['rocky', -5397, 13552, 0.06, 1],
];

const browser = await chromium.launch({ headless: false, args: [
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default', '--enable-gpu-rasterization',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  await page.goto(new URL('/?qaVisual=1&gpuTimings=1', url).href, { waitUntil: 'commit' });
  await page.waitForFunction(() => !!window.__worldVisualQa, null, { timeout: 180000 });
  const report = await page.evaluate(async (rays) => {
    const e = window.__editor, renderer = e.terrainView.renderer, backend = renderer.backend;
    // The same adapter request the backend makes; r187 does not keep its adapter.
    const adapter = backend.adapter ?? await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance', featureLevel: 'compatibility' });
    const device = backend.device, U = GPUTextureUsage;
    const scoped = async (fn) => {
      device.pushErrorScope('validation');
      let value = null, thrown = null;
      try { value = await fn(); } catch (error) { thrown = error.message; }
      const error = await device.popErrorScope();
      return { ok: !thrown && !error, error: thrown ?? error?.message ?? null, value };
    };
    const texture = (format, usage, extra = {}) => scoped(() => {
      const t = device.createTexture({ size: [128, 128, extra.layers ?? 1], format, usage,
        mipLevelCount: extra.mips ?? 1, dimension: '2d' });
      t.destroy();
    });
    const formats = {};
    for (const format of ['rgba16float', 'rg16float', 'r32float', 'rg32float', 'rgba32float']) {
      formats[format] = {
        storage: (await texture(format, U.STORAGE_BINDING | U.TEXTURE_BINDING)).ok,
        render: (await texture(format, U.RENDER_ATTACHMENT | U.TEXTURE_BINDING)).ok,
        mippedArray2Layer: (await texture(format, U.RENDER_ATTACHMENT | U.TEXTURE_BINDING | U.STORAGE_BINDING,
          { layers: 2, mips: 8 })).ok,
      };
    }
    const lane = `var<workgroup> a: array<vec4f, 256>; var<workgroup> b: array<vec4f, 256>; var<workgroup> c: array<vec4f, 256>;
      @group(0) @binding(0) var<storage, read_write> data: array<vec4f>;
      @compute @workgroup_size(256) fn main(@builtin(local_invocation_index) i: u32, @builtin(workgroup_id) g: vec3u) {
        let at = g.x * 256u + i; a[i] = data[at]; b[i] = data[at] * 2.0; c[i] = data[at] * 3.0;
        for (var s = 0u; s < 8u; s++) { workgroupBarrier(); let o = (i + (1u << s)) % 256u;
          let v = a[o] + b[o] - c[o]; workgroupBarrier(); a[i] = v; }
        data[at] = a[i]; }`;
    const pipeline = await scoped(() => device.createComputePipelineAsync({ layout: 'auto',
      compute: { module: device.createShaderModule({ code: lane }), entryPoint: 'main' } }));
    // Compute-pass timestamps: does this device time compute at all (not an FFT benchmark).
    let computeTiming = { supported: device.features.has('timestamp-query'), samplesNs: [] };
    if (computeTiming.supported && pipeline.ok) {
      const lines = 128 * 2, buffer = device.createBuffer({ size: lines * 256 * 16, usage: GPUBufferUsage.STORAGE });
      const bind = device.createBindGroup({ layout: pipeline.value.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer } }] });
      const query = device.createQuerySet({ type: 'timestamp', count: 2 });
      const resolve = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      const read = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      for (let run = 0; run < 24; run++) {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass({ timestampWrites: { querySet: query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } });
        pass.setPipeline(pipeline.value); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(lines); pass.end();
        encoder.resolveQuerySet(query, 0, 2, resolve, 0); encoder.copyBufferToBuffer(resolve, 0, read, 0, 16);
        device.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const [begin, end] = new BigInt64Array(read.getMappedRange());
        computeTiming.samplesNs.push(Number(end - begin)); read.unmap();
      }
      buffer.destroy(); query.destroy(); resolve.destroy(); read.destroy();
      computeTiming.workload = `${lines} workgroups x 256 threads, 3x4 KiB workgroup arrays, 16 barriers (probe shader, not an FFT)`;
    }
    const pick = (limits, names) => Object.fromEntries(names.map(name => [name, limits?.[name] ?? null]));
    const limitNames = ['maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupSizeX',
      'maxComputeWorkgroupsPerDimension', 'maxStorageBuffersPerShaderStage', 'maxStorageTexturesPerShaderStage',
      'maxStorageBufferBindingSize', 'maxSampledTexturesPerShaderStage', 'maxSamplersPerShaderStage',
      'maxInterStageShaderVariables', 'maxTextureArrayLayers', 'maxTextureDimension2D', 'maxBufferSize',
      'maxStorageBuffersInFragmentStage', 'maxStorageTexturesInFragmentStage'];
    const view = e.terrainView, origin = view.floatingOrigin.getState();
    const survey = rays.map(([label, x, z, dx, dz]) => {
      const length = Math.hypot(dx, dz), samples = [];
      for (let d = 0; d <= 640; d += 16) {
        const wx = x + dx / length * d, wz = z + dz / length * d, w = view.getCanonicalWater(wx, wz);
        samples.push({ d, x: Math.round(wx), z: Math.round(wz), kind: w.kind,
          depth: +(w.surfaceHeight - w.bedHeight).toFixed(2), shoreDistance: +(w.shoreDistance ?? 0).toFixed(1) });
      }
      return { label, samples };
    });
    return {
      threeRevision: window.__THREE__ ?? null,
      backend: view.rendererBackendStatus?.mode, compatibilityMode: backend.compatibilityMode ?? null,
      trackTimestamp: backend.trackTimestamp === true, hasTimestamp: backend.hasTimestamp ?? null,
      adapter: adapter?.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture,
        device: adapter.info.device, description: adapter.info.description, isFallbackAdapter: adapter.info.isFallbackAdapter ?? null } : null,
      adapterFeatures: adapter ? [...adapter.features].sort() : null, deviceFeatures: [...device.features].sort(),
      adapterLimits: pick(adapter?.limits, limitNames), deviceLimits: pick(device.limits, limitNames),
      formats, workgroupPipeline12KiB: { ok: pipeline.ok, error: pipeline.error }, computeTiming,
      deviceLostHandler: typeof renderer.onDeviceLost === 'function',
      floatingOrigin: origin, oceanSurvey: survey,
    };
  }, rays);
  report.userAgent = await page.evaluate(() => navigator.userAgent);
  report.browser = browser.version();
  report.capturedAt = new Date().toISOString();
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2) + '\n');
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
