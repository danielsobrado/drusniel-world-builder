import * as THREE from 'three/webgpu';
import { LEAF_PALETTES, paintLeaf } from '../../assets/godsEnd/leafTextures.js';

const SIZE = 256;
const ZONES = ['green', 'yellow', 'white'];

/** One array sample chooses a donor leaf palette without atlas-edge bleeding. */
export function createFallingLeafTexture(palette = null) {
  const data = new Uint8Array(SIZE * SIZE * 4 * ZONES.length);
  for (let layer = 0; layer < ZONES.length; layer += 1) {
    const zone = ZONES[layer];
    let colors = LEAF_PALETTES[zone];
    if (palette) {
      const tone = new THREE.Color().fromArray(palette[layer]).convertLinearToSRGB().toArray();
      colors = {
        base: tone.map((value) => value * 0.65), light: tone,
        vein: tone.map((value) => Math.min(1, value * 1.1 + 0.08)),
      };
    }
    data.set(paintLeaf(colors, zone.length * 7919), layer * SIZE * SIZE * 4);
  }
  const texture = new THREE.DataArrayTexture(data, SIZE, SIZE, ZONES.length);
  texture.name = 'Gods End falling leaves';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
