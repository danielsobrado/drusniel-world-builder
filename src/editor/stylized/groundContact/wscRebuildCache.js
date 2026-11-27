// Lets a WSC recentre copy the texels it already built instead of evaluating
// the whole 128x128 window again. A texel depends only on its world position and
// the chunks its samples reach (its own, plus one half-texel away for the
// normal), so it is reusable when it was inside the previous window and none of
// those chunks changed. That holds only while texel inputs follow the contract
// in wscTexelWriter.js. Heights are kept raw (as doubles) so a new base height
// re-encodes them exactly as a full rebuild would.

/** Recorded for a chunk whose slot changed while a build spread over frames read it. */
export const STALE_SIGNATURE = '#stale';

export function slotChunkSignature(slot) {
  return `${slot.descriptor.key}:${slot.pageRevision}:${slot.forestFloorKey ?? ''}:${slot.materialBake?.descriptor?.key ?? ''}`;
}

export class WscRebuildCache {
  constructor(resolution) {
    const texels = resolution * resolution;
    this.resolution = resolution;
    this.geo = new Uint16Array(texels * 4);
    this.base = new Uint8Array(texels * 4);
    this.eco = new Uint8Array(texels * 4);
    this.heights = new Float64Array(texels);
    this.signatures = new Map();
    this.valid = false;
    this.originX = 0;
    this.originZ = 0;
    this.noiseVersion = -1;
  }

  invalidate() {
    this.valid = false;
  }

  /**
   * Returns a per-texel reuse test for a window at (originX, originZ), or null
   * when nothing can be reused. `chunkX`/`chunkZ` map a world coordinate to its
   * chunk index exactly as the rebuild does.
   */
  plan({ originX, originZ, step, halfStep, noiseVersion, slotsByChunk, chunkX, chunkZ }) {
    if (!this.valid || noiseVersion !== this.noiseVersion) return null;
    const res = this.resolution;
    const dx = (originX - this.originX) / step;
    const dz = (originZ - this.originZ) / step;
    if (!Number.isInteger(dx) || !Number.isInteger(dz) || Math.abs(dx) >= res || Math.abs(dz) >= res) return null;

    // Chunk indices each texel column/row samples (own, minus and plus half a texel).
    const columns = new Int32Array(res * 3);
    const rows = new Int32Array(res * 3);
    for (let i = 0; i < res; i += 1) {
      const x = originX + (i + 0.5) * step;
      const z = originZ + (i + 0.5) * step;
      columns.set([chunkX(x), chunkX(x - halfStep), chunkX(x + halfStep)], i * 3);
      rows.set([chunkZ(z), chunkZ(z - halfStep), chunkZ(z + halfStep)], i * 3);
    }
    // One string lookup per chunk the window touches, not per texel.
    const minX = Math.min(...columns), minZ = Math.min(...rows);
    const width = Math.max(...columns) - minX + 1;
    const same = new Uint8Array(width * (Math.max(...rows) - minZ + 1));
    for (let cz = minZ, i = 0; i < same.length; cz += 1) {
      for (let cx = minX; cx < minX + width; cx += 1, i += 1) {
        const key = `${cx}:${cz}`;
        const slot = slotsByChunk.get(key);
        same[i] = (slot ? slotChunkSignature(slot) : null) === (this.signatures.get(key) ?? null) ? 1 : 0;
      }
    }
    const unchanged = (cx, cz) => same[(cz - minZ) * width + cx - minX] === 1;
    return {
      sourceIndex(ix, iz) {
        const sx = ix + dx;
        const sz = iz + dz;
        if (sx < 0 || sz < 0 || sx >= res || sz >= res) return -1;
        const c = ix * 3, r = iz * 3;
        return unchanged(columns[c], rows[r]) && unchanged(columns[c + 1], rows[r]) && unchanged(columns[c + 2], rows[r])
          && unchanged(columns[c], rows[r + 1]) && unchanged(columns[c], rows[r + 2]) ? sz * res + sx : -1;
      },
    };
  }

  /**
   * Records the window just written so the next recentre can reuse it.
   * `signatures` maps each chunk key to the signature its texels were built
   * from; a chunk that changed during the build must carry a value no slot can
   * match (STALE_SIGNATURE) so the next build re-evaluates it.
   */
  store({ originX, originZ, noiseVersion, signatures, geo, base, eco, heights }) {
    this.heights.set(heights);
    this.geo.set(geo);
    this.base.set(base);
    this.eco.set(eco);
    this.signatures = new Map(signatures);
    this.originX = originX;
    this.originZ = originZ;
    this.noiseVersion = noiseVersion;
    this.valid = true;
  }
}
