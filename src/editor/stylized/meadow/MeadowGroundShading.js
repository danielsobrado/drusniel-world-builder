import * as THREE from 'three/webgpu';
import { ivec2, mix, texture } from 'three/tsl';
import { createMeadowGroundPalette } from './meadowGroundPalette.js';
import { meadowPatchColors } from './meadowColorNodes.js';

/** Read biome pigment from tile alpha; no new terrain sampler or instance attribute. */
export function createMeadowGroundShading(config, tileSample, worldXZ) {
  const palette = createMeadowGroundPalette(config);
  if (!palette) return null;
  const data = new Float32Array(256 * 2 * 4);
  for (let id = 0; id < 256; id++) {
    for (let channel = 0; channel < 3; channel++) {
      data[id * 4 + channel] = palette.roots[id * 3 + channel];
      data[(256 + id) * 4 + channel] = palette.tips[id * 3 + channel];
    }
  }
  const map = new THREE.DataTexture(data, 256, 2, THREE.RGBAFormat, THREE.FloatType);
  map.name = 'meadow-ground-biome-pigment';
  map.minFilter = map.magFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  const id = tileSample.a.mul(255).round().toInt();
  const { tint, dry, dryColor } = meadowPatchColors(worldXZ, palette.appearance);
  const dryPigment = dryColor.mul(palette.brightness);
  const root = texture(map, ivec2(id, 0)).setSampler(false).rgb.mul(tint);
  const tip = texture(map, ivec2(id, 1)).setSampler(false).rgb.mul(tint);
  return {
    root: mix(root, dryPigment, dry),
    tip: mix(tip, dryPigment.mul(1.06), dry.mul(0.45)),
    dispose: () => map.dispose(),
  };
}
