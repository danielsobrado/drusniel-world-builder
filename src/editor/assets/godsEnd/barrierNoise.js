import * as THREE from 'three/webgpu';
import { mulberry32 as createRandom } from './houseTextureMath.js';

// Ported from drusniel-gods-end/src/world/BoundaryBarrierMaterial.js.
/** Deterministic, tileable value noise: no image download or per-frame CPU work. */
export function createBarrierNoise() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const random = createRandom(0xba771e);
  const octaves = [4, 8, 16].map(cells => ({ cells, grid: Array.from({ length: cells * cells }, random) }));
  const fade = t => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0, weight = 1, total = 0;
      for (const { cells, grid } of octaves) {
        const px = x / (size - 1) * cells, py = y / (size - 1) * cells;
        const ix = Math.floor(px), iy = Math.floor(py);
        const tx = fade(px - ix), ty = fade(py - iy);
        const at = (gx, gy) => grid[(gy % cells) * cells + gx % cells];
        value += THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), tx),
          THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), tx), ty) * weight;
        total += weight;
        weight *= 0.5;
      }
      const offset = (y * size + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = Math.round(value / total * 255);
      data[offset + 3] = 255;
    }
  }
  const result = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  result.name = 'BarrierSeamlessNoise';
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.magFilter = THREE.LinearFilter;
  result.minFilter = THREE.LinearMipmapLinearFilter;
  result.generateMipmaps = true;
  result.needsUpdate = true;
  return result;
}

