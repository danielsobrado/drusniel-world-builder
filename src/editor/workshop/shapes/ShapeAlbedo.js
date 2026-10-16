import * as THREE from 'three/webgpu';
import { shapeRandom } from './ShapeMesh.js';

/** Quiet material grain; tile joints and timber edges are already real geometry. */
export function shapeAlbedoTexture(slot, seed, topStyle) {
  const size = 128, data = new Uint8Array(size * size * 4);
  const base = slot === 'wood' ? [110, 76, 49] : topStyle === 'terracotta' ? [190, 146, 119] : [137, 144, 153];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = slot === 'wood' ? Math.sin(x * 0.82 + Math.sin(y * Math.PI / 64) * 0.55) * 4 : 0;
    const noise = (shapeRandom(seed, slot, 'grain', `${x}:${y}`) - 0.5) * 5;
    const i = (y * size + x) * 4;
    for (let k = 0; k < 3; k++) data[i + k] = base[k] + grain + noise;
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8; texture.needsUpdate = true;
  return texture;
}
