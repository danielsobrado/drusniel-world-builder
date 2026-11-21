import * as THREE from 'three/webgpu';

/**
 * QA-only GPU instrumentation for the ocean FFT fixture: counts pipelines,
 * submits and live buffers/textures on a renderer's device, collects
 * uncaptured validation errors, and reads FFT output back. Never used by the app.
 */

const FORMAT_BYTES = { rg16float: 4, rgba16float: 8, r32float: 4, rg32float: 8, rgba32float: 16, rgba8unorm: 4, bgra8unorm: 4 };

export function instrumentDevice(device) {
  const stats = {
    computePipelines: 0, renderPipelines: 0, shaderModules: 0, submits: 0,
    liveBuffers: new Map(), liveTextures: new Map(), errors: [],
  };
  const wrap = (name, after) => {
    const original = device[name].bind(device);
    device[name] = (...args) => after(original(...args), ...args);
  };
  const count = (key) => (result) => { stats[key]++; return result; };
  wrap('createComputePipeline', count('computePipelines'));
  wrap('createComputePipelineAsync', count('computePipelines'));
  wrap('createRenderPipeline', count('renderPipelines'));
  wrap('createRenderPipelineAsync', count('renderPipelines'));
  wrap('createShaderModule', count('shaderModules'));
  const track = (map, bytes) => (object, descriptor) => {
    map.set(object, { label: descriptor?.label ?? '', bytes: bytes(descriptor) });
    const destroy = object.destroy.bind(object);
    object.destroy = () => { map.delete(object); destroy(); };
    return object;
  };
  wrap('createBuffer', track(stats.liveBuffers, (d) => d.size));
  wrap('createTexture', track(stats.liveTextures, textureBytes));
  const submit = device.queue.submit.bind(device.queue);
  device.queue.submit = (buffers) => { stats.submits++; return submit(buffers); };
  device.addEventListener('uncapturederror', (event) => stats.errors.push(event.error?.message ?? String(event.error)));
  return stats;
}

function textureBytes({ size, format, mipLevelCount = 1 }) {
  const [w, h, layers = 1] = Array.isArray(size) ? size : [size.width, size.height ?? 1, size.depthOrArrayLayers ?? 1];
  let texels = 0;
  for (let level = 0; level < mipLevelCount; level++) texels += Math.max(1, w >> level) * Math.max(1, h >> level);
  return texels * layers * (FORMAT_BYTES[format] ?? 0);
}

export function liveSummary(stats) {
  const sum = (map) => [...map.values()].reduce((total, entry) => total + entry.bytes, 0);
  return {
    buffers: stats.liveBuffers.size, bufferBytes: sum(stats.liveBuffers),
    textures: stats.liveTextures.size, textureBytes: sum(stats.liveTextures),
  };
}

/** The f32 result buffer (interleaved complex, every cascade). QA readback only. */
export async function readResult(renderer, runtime) {
  return new Float32Array(await renderer.getArrayBufferAsync(runtime.resources.ping));
}

/** One RG16F output layer decoded to interleaved f32 (R = ∂H/∂x, G = ∂H/∂z). QA readback only. */
export async function readOutputLayer(renderer, runtime, layer) {
  const { size } = runtime.resources.topology;
  const raw = await renderer.readRenderTargetPixelsAsync(runtime.resources.output, 0, 0, size, size, 0, layer);
  const halves = raw instanceof Uint16Array ? raw : new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  if (halves.length !== 2 * size * size) throw new Error(`unexpected RG16F readback length ${halves.length}`);
  return Float32Array.from(halves, (half) => THREE.DataUtils.fromHalfFloat(half));
}

/** Run `fn` inside a validation error scope; returns the error message or null. */
export async function withValidation(device, fn) {
  device.pushErrorScope('validation');
  let thrown = null;
  try { await fn(); } catch (error) { thrown = error; }
  const error = await device.popErrorScope();
  if (thrown) throw thrown;
  return error?.message ?? null;
}
