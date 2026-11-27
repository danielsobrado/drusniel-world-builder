import { EquirectangularReflectionMapping, PMREMNode } from 'three/webgpu';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

const MIB = 1024 * 1024;
const MIN_PMREM_FACE = 256;

export function environmentShape(texture) {
  const image = texture.image;
  return { data: image?.data, width: image?.width, height: image?.height,
    type: texture.type, format: texture.format, mapping: texture.mapping,
    version: texture.version };
}

export function estimateEnvironmentFilterBytes(width) {
  if (!Number.isFinite(width) || width < 4) return 0;
  const face = Math.max(MIN_PMREM_FACE, 2 ** Math.floor(Math.log2(width / 4)));
  return Math.ceil(6 * face * face * 8 * 4 / 3);
}

function sameSource(surface, texture, shape) {
  if (surface.skyView?.environment?.surfaceTexture !== texture
      || surface.terrainView.scene?.environment !== texture
      || !texture.isDataTexture || texture.mapping !== EquirectangularReflectionMapping
      || !ArrayBuffer.isView(texture.image?.data) || texture.image.height <= 0) return false;
  const current = environmentShape(texture);
  return Object.keys(current).every(key => current[key] === shape?.[key]);
}

/** Use the WebGPU bundle's own per-renderer PMREM cache, not a parallel generator output. */
export function generateEnvironmentPMREM(renderer, texture) {
  const node = new PMREMNode(texture);
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const mip = renderer.getActiveMipmapLevel();
  const xr = renderer.xr.enabled;
  try {
    node.updateBefore({ renderer });
    return node._pmrem?.isPMREMTexture === true
      && node._pmrem.pmremVersion === texture.pmremVersion;
  } finally {
    renderer.setRenderTarget(target, face, mip);
    renderer.xr.enabled = xr;
    node.dispose();
  }
}

/** Upload and filter on separate yields; filter remains one indivisible Three operation. */
export async function warmLocationEnvironment({ surface, renderer, settings, entries, pause, signal,
  active, initial, reserved, generate = generateEnvironmentPMREM }) {
  if (!settings.surfaceEnvironmentWarmupEnabled || !settings.surfaceEnvironmentReclamationEnabled
      || typeof renderer.initTexture !== 'function') return;
  const entry = entries.find(item => item.environment
    && item.resource === surface.skyView?.environment?.surfaceTexture);
  if (!entry || !sameSource(surface, entry.resource, entry.environmentShape)) return;
  const texture = entry.resource;
  const sourceBytes = entry.sourceBytes;
  const filterBytes = estimateEnvironmentFilterBytes(texture.image.width);
  // A temporary generator also needs its own full-mip source cubemap.
  const peakCharge = sourceBytes + 2 * filterBytes;
  if (!Number.isFinite(sourceBytes) || sourceBytes <= 0 || !filterBytes
      || peakCharge > settings.surfaceEnvironmentWarmupMaxBytes
      || reserved + peakCharge > settings.surfaceTargetWarmupMaxBytes) return;
  const canFit = (base, extra) => {
    const total = renderer.info?.memory?.total;
    return Number.isFinite(total) && total >= 0 && Number.isFinite(base)
      && Math.max(total, base) + extra <= settings.surfaceAdaptiveHighMiB * MIB;
  };
  const safe = () => active() && !renderer._isDeviceLost
    && renderer.getRenderTarget?.() == null && renderer.getMRT?.() == null
    && renderer.xr?.isPresenting !== true;
  if (!canFit(initial + reserved, peakCharge)) return;
  await pause();
  signal?.throwIfAborted();
  if (!safe() || !sameSource(surface, texture, entry.environmentShape)
      || renderer._textures.has(texture) || !canFit(initial + reserved, peakCharge)) return;
  try {
    texture.needsUpdate = true;
    renderer.initTexture(texture);
    if (!renderer._textures.has(texture)) throw new Error('HDR source allocation was not registered.');
    PerfCounters.inc('locationSurface.environmentWarmupUploads');
    PerfCounters.inc('locationSurface.environmentWarmupSourceBytes', sourceBytes);
    const shape = environmentShape(texture);
    await pause();
    signal?.throwIfAborted();
    if (!safe() || !sameSource(surface, texture, shape) || !renderer._textures.has(texture)
        || !canFit(initial + reserved + sourceBytes, 2 * filterBytes)) return;
    if (!generate(renderer, texture)) throw new Error('PMREM generation did not publish a valid cache entry.');
    PerfCounters.inc('locationSurface.environmentWarmupFilters');
    PerfCounters.inc('locationSurface.environmentWarmupPeakChargeBytes', peakCharge);
  } catch (error) {
    if (signal?.aborted) throw error;
    PerfCounters.inc('locationSurface.environmentWarmupFailures');
    console.warn('Environment warmup unavailable; using normal environment rendering.', error);
  }
}
