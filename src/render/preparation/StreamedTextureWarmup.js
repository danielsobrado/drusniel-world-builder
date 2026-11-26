import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';
import { StagedTextureUploads } from './StagedTextureUploads.js';

const MIN_TEXTURE_BYTES = 128 * 1024;

function textureBytes(texture) {
  const mips = texture.mipmaps;
  if (mips?.length && mips.every(mip => mip.data?.byteLength)) {
    return mips.reduce((sum, mip) => sum + mip.data.byteLength, 0);
  }
  const image = texture.image;
  if (image?.data?.byteLength) return image.data.byteLength * (texture.generateMipmaps ? 4 / 3 : 1);
  return (image?.width ?? 0) * (image?.height ?? 0) * 4 * (texture.generateMipmaps ? 4 / 3 : 1);
}

function texturesFor(material) {
  const found = new Set();
  for (const item of Array.isArray(material) ? material : [material]) {
    for (const value of Object.values(item ?? {})) {
      if (value?.isTexture) found.add(value);
      // TSL texture nodes directly assigned to a material.
      if (value?.isTextureNode && value.value?.isTexture) found.add(value.value);
    }
  }
  return [...found];
}

/** Preinitialize one large ordinary texture at a time, via Three's public API. */
export class StreamedTextureWarmup {
  constructor(renderer) {
    this.renderer = renderer;
    this.completed = new WeakMap();
    this.jobs = new Map();
    this.staged = new StagedTextureUploads(renderer);
  }

  advance(mesh, material, bytesAvailable, shouldYield, budget, alreadySpent) {
    if (!this.renderer?.initTexture || !this.renderer.backend?.isWebGPUBackend) return { ready: true, bytes: 0 };
    let job = this.jobs.get(mesh);
    if (!job || job.material !== material) {
      if (job) this.cancel(mesh);
      job = { material, textures: texturesFor(material), index: 0 };
      this.jobs.set(mesh, job);
    }
    let bytes = 0;
    while (job.index < job.textures.length) {
      const texture = job.textures[job.index];
      const estimate = Math.ceil(textureBytes(texture));
      const ready = texture.version > 0 && texture.source?.dataReady !== false && texture.image?.complete !== false;
      const current = this.renderer._textures?.has?.(texture) && this.renderer._textures.get(texture).version === texture.version;
      if (!ready || current || (!this.renderer._textures && this.completed.get(texture) === texture.version) || estimate < MIN_TEXTURE_BYTES
          || texture.isRenderTargetTexture || texture.isDepthTexture || texture.isVideoTexture || texture.isExternalTexture
          || texture.isStorageTexture || texture.isCubeTexture || texture.isArrayTexture || texture.isDataArrayTexture || texture.isData3DTexture) {
        this.staged.cancel(texture);
        job.index++; continue;
      }
      const sliced = this.staged.advance(texture, Math.max(0, bytesAvailable - bytes), shouldYield);
      if (sliced) {
        bytes += sliced.bytes;
        if (!sliced.ready) return { ready: false, bytes };
        job.index++;
        this.completed.set(texture, texture.version);
        if (job.index < job.textures.length) return { ready: false, bytes };
        break;
      }
      if (shouldYield?.() || (budget ? !budget.canPublish(alreadySpent + bytes + estimate) : estimate > bytesAvailable - bytes && alreadySpent + bytes > 0)) {
        return { ready: false, bytes };
      }
      const start = performance.now();
      this.renderer.initTexture(texture);
      this.completed.set(texture, texture.version);
      job.index++;
      bytes += estimate;
      PerfCounters.inc('streamedTextureWarmupBytesEstimated', estimate);
      PerfCounters.inc('streamedTextureWarmupMs', performance.now() - start);
      if (job.index < job.textures.length) return { ready: false, bytes };
      break;
    }
    this.jobs.delete(mesh);
    return { ready: true, bytes };
  }

  cancel(mesh) {
    const job = this.jobs.get(mesh);
    if (job) this.staged.cancel(job.textures[job.index]);
    this.jobs.delete(mesh);
  }
  dispose() { this.staged.dispose(); this.jobs.clear(); }
}
