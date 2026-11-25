import { REVISION } from 'three/webgpu';

/** Record once the backend has finished choosing a device, including automatic fallback. */
export function inspectRendererCapabilities(renderer, { forceWebGL = false, requestedPipeline = 'standard',
  effectivePipeline = 'standard' } = {}) {
  const backend = renderer.backend;
  const webgpu = backend?.isWebGPUBackend === true;
  const mode = webgpu ? 'webgpu' : backend?.isWebGLBackend ? 'webgl' : 'unknown';
  const device = webgpu ? backend.device : null;
  return Object.freeze({
    revision: REVISION,
    backend: mode,
    requestedBackend: forceWebGL ? 'webgl' : 'webgpu',
    requestedPipeline,
    effectivePipeline,
    fallbackReason: !webgpu && (!forceWebGL || requestedPipeline !== 'standard') ? 'webgpu-unavailable' : null,
    compileAsync: typeof renderer.compileAsync === 'function',
    timestampQuery: device?.features?.has('timestamp-query') ?? false,
    storageBuffersPerShaderStage: device?.limits?.maxStorageBuffersPerShaderStage ?? null,
    maxStorageBufferBindingSize: device?.limits?.maxStorageBufferBindingSize ?? null,
  });
}
