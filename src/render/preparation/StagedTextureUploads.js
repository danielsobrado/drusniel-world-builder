import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';

const MAX_ROWS_PER_WRITE = 128;
const MAX_WRITES_PER_STEP = 32;

function levelsFor(texture, block, size) {
  const compressed = texture.isCompressedTexture === true;
  const mips = texture.mipmaps?.length ? texture.mipmaps : [texture.image];
  const levels = [];
  for (let mip = 0; mip < mips.length; mip++) {
    const image = mips[mip];
    if (!image || image.width !== Math.max(1, Math.floor(size.width / 2 ** mip))
      || image.height !== Math.max(1, Math.floor(size.height / 2 ** mip))) return null;
    const columns = Math.ceil(image.width / block.width);
    const rows = Math.ceil(image.height / block.height);
    const bytesPerRow = columns * block.byteLength;
    const data = image.data;
    if (compressed || texture.isDataTexture) {
      if (!ArrayBuffer.isView(data) || data.byteLength !== rows * bytesPerRow) return null;
    } else if (data || !image.width || !image.height || block.width !== 1 || block.height !== 1) return null;
    levels.push({ image, data, columns, rows, bytesPerRow, mip });
  }
  return levels;
}

/** The detached resource is invisible to Three until every source row is queued. */
export class StagedTextureUploads {
  constructor(renderer) { this.renderer = renderer; this.jobs = new Map(); this.unsupported = new WeakMap(); }

  get supported() {
    const { backend, _textures: manager } = this.renderer ?? {};
    return Boolean(backend?.isWebGPUBackend && backend.device?.queue?.writeTexture
      && backend.createTexture && backend.updateTexture && backend.delete
      && backend.textureUtils?._getBlockData && manager?.has && manager?.getSize
      && manager?.needsMipmaps && manager?.getMipLevels);
  }

  create(texture) {
    const { backend, _textures: manager } = this.renderer;
    if (manager.has(texture) || backend.get(texture).initialized
      || texture.isCompressedCubeTexture || texture.isCompressedArrayTexture
      || texture.isFramebufferTexture || texture.isHTMLTexture
      || texture.source?.dataReady !== true) return null;
    const size = manager.getSize(texture);
    if (size.depth !== 1 || !size.width || !size.height) return null;
    const needsMipmaps = manager.needsMipmaps(texture);
    const levels = needsMipmaps ? manager.getMipLevels(texture, size.width, size.height) : 1;
    const token = Object.create(texture);
    try {
      backend.createTexture(token, { ...size, needsMipmaps, levels });
      const data = backend.get(token);
      const descriptor = data.textureDescriptorGPU;
      const block = descriptor && backend.textureUtils._getBlockData(descriptor.format);
      const images = block?.byteLength && levelsFor(texture, block, size);
      // External images use exactly the backend's copy path, but crop by rows.
      if (!images || images.length > levels || (!images[0].data && !backend.device.queue.copyExternalImageToTexture)
        || (images.length !== levels && !(images.length === 1 && !texture.mipmaps?.length && texture.mipmapsAutoUpdate === true))) {
        this.releaseToken(token); return null;
      }
      return { token, block, images, version: texture.version, sourceVersion: texture.source.version,
        level: 0, row: 0, column: 0 };
    } catch (error) {
      this.releaseToken(token);
      console.warn('Texture staging allocation failed; using renderer upload.', error);
      return null;
    }
  }

  releaseToken(token) {
    const { backend } = this.renderer;
    const data = backend.get(token);
    // Unsupported formats can return the shared default texture; never destroy it.
    if (data.textureDescriptorGPU) data.texture?.destroy();
    backend.delete(token);
  }

  cancel(texture) {
    const job = this.jobs.get(texture);
    if (job) {
      texture.removeEventListener?.('dispose', job.onDispose);
      this.releaseToken(job.token);
    }
    this.jobs.delete(texture);
  }

  advance(texture, byteLimit, shouldYield) {
    if (!this.supported) return null;
    const { backend, _textures: manager } = this.renderer;
    let job = this.jobs.get(texture);
    if (job && (job.version !== texture.version || job.sourceVersion !== texture.source.version || manager.has(texture))) {
      this.cancel(texture); job = null;
    }
    if (manager.has(texture) || this.unsupported.get(texture) === texture.version) return null;
    if (!job) {
      if (shouldYield?.() || byteLimit <= 0) return { ready: false, bytes: 0 };
      job = this.create(texture);
      if (!job) { this.unsupported.set(texture, texture.version); return null; }
      job.onDispose = () => this.cancel(texture);
      texture.addEventListener?.('dispose', job.onDispose);
      this.jobs.set(texture, job);
    }
    let bytes = 0;
    const queue = backend.device.queue, gpu = backend.get(job.token).texture;
    const block = job.block;
    let writes = 0;
    try {
      while (job.level < job.images.length && writes++ < MAX_WRITES_PER_STEP && !shouldYield?.()) {
        const image = job.images[job.level];
        const remaining = byteLimit - bytes;
        const availableBlocks = Math.floor(remaining / block.byteLength);
        if (availableBlocks < 1) break;
        const columns = Math.min(image.columns - job.column, availableBlocks);
        const flipData = texture.isDataTexture && texture.flipY;
        const rows = !flipData && job.column === 0 && columns === image.columns
          ? Math.min(image.rows - job.row, Math.floor(remaining / image.bytesPerRow), MAX_ROWS_PER_WRITE) : 1;
        const x = job.column * block.width, y = job.row * block.height;
        const width = columns * block.width, height = rows * block.height;
        const count = columns * rows * block.byteLength;
        const dest = { texture: gpu, mipLevel: image.mip, origin: { x, y, z: 0 } };
        if (image.data) {
          const sourceRow = flipData ? image.rows - job.row - 1 : job.row;
          queue.writeTexture(dest, image.data, { offset: sourceRow * image.bytesPerRow + job.column * block.byteLength,
            bytesPerRow: image.bytesPerRow, rowsPerImage: image.rows }, { width, height, depthOrArrayLayers: 1 });
        } else {
          // WebGPU source origin is relative to the unflipped image.
          const sourceY = texture.flipY ? image.image.height - y - height : y;
          queue.copyExternalImageToTexture({ source: image.image, origin: { x, y: sourceY }, flipY: Boolean(texture.flipY) },
            { ...dest, premultipliedAlpha: texture.premultiplyAlpha }, { width, height, depthOrArrayLayers: 1 });
        }
        bytes += count;
        job.column += columns;
        if (job.column === image.columns) { job.column = 0; job.row += rows; }
        if (job.row === image.rows) { job.row = 0; job.level++; }
        PerfCounters.inc('stagedTextureUploadBytes', count);
        PerfCounters.inc('stagedTextureUploadSlices');
      }
    } catch (error) {
      this.cancel(texture);
      this.unsupported.set(texture, texture.version);
      PerfCounters.inc('stagedTextureUploadFailures');
      console.warn('Texture staging transfer failed; using renderer upload.', error);
      return { ready: false, bytes };
    }
    if (job.level !== job.images.length || shouldYield?.()) return { ready: false, bytes };
    this.adopt(texture, job);
    return { ready: true, bytes };
  }

  adopt(texture, job) {
    const { backend } = this.renderer;
    const data = backend.get(job.token);
    const create = backend.createTexture, update = backend.updateTexture;
    let transferred = false;
    // Synchronous, scoped adapter: the normal manager still owns versions,
    // generations, disposal, mip generation and callbacks. No async gap.
    backend.createTexture = function (target, options) {
      if (target !== texture) return create.call(this, target, options);
      Object.assign(this.get(target), data);
      transferred = true;
    };
    backend.updateTexture = function (target, options) {
      if (target !== texture || !transferred) return update.call(this, target, options);
    };
    try {
      this.renderer.initTexture(texture);
    } finally {
      backend.createTexture = create;
      backend.updateTexture = update;
      if (transferred) backend.delete(job.token);
      else this.releaseToken(job.token);
      texture.removeEventListener?.('dispose', job.onDispose);
      this.jobs.delete(texture);
    }
  }

  dispose() { for (const texture of this.jobs.keys()) this.cancel(texture); }
}
