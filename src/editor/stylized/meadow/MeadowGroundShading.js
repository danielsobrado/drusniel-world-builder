import * as THREE from 'three/webgpu';
import { ivec2, mix, texture } from 'three/tsl';
import { createMeadowGroundPalette } from './meadowGroundPalette.js';
import { resolveMeadowGroundDetail } from './meadowGroundDetailConfig.js';
import { meadowPatchColors } from './meadowColorNodes.js';
import { meadowCanopyView } from './meadowCanopy.js';

/**
 * Read biome pigment from tile alpha; no new terrain sampler or instance attribute.
 * Rows: 0 root, 1 tip, 2 litter colour + amount, 3 moss / soil / streaks
 * (meadowGroundDetailConfig.js), 4 canopy colour + strength (meadowCanopy.js).
 * The map is float and nearest-filtered, so it binds no sampler.
 *
 * `root` is the ground seen through the stand: the soil-side root from above,
 * leaning to the canopy's own colour as the view grazes.
 */
export function createMeadowGroundShading(config, tileSample, worldXZ) {
  const palette = createMeadowGroundPalette(config);
  if (!palette) return null;
  const detail = resolveMeadowGroundDetail(config.grass.meadow.groundDetail);
  const data = new Float32Array(256 * 5 * 4);
  for (let id = 0; id < 256; id++) {
    for (let channel = 0; channel < 3; channel++) {
      data[id * 4 + channel] = palette.roots[id * 3 + channel];
      data[(256 + id) * 4 + channel] = palette.tips[id * 3 + channel];
    }
  }
  if (detail) {
    data.set(detail.litter, 512 * 4);
    data.set(detail.amounts, 768 * 4);
  }
  data.set(palette.canopies, 1024 * 4);
  const map = new THREE.DataTexture(data, 256, 5, THREE.RGBAFormat, THREE.FloatType);
  map.name = 'meadow-ground-biome-pigment';
  map.minFilter = map.magFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  const id = tileSample.a.mul(255).round().toInt();
  const { tint, dry, dryColor } = meadowPatchColors(worldXZ, palette.appearance);
  const dryPigment = dryColor.mul(palette.brightness);
  const row = index => texture(map, ivec2(id, index)).setSampler(false);
  const soilRoot = mix(row(0).rgb.mul(tint), dryPigment, dry);
  const tip = mix(row(1).rgb.mul(tint), dryPigment.mul(1.06), dry.mul(0.45));
  const canopy = row(4);
  const canopyColor = mix(canopy.rgb.mul(tint), dryPigment, dry);
  return {
    root: mix(soilRoot, canopyColor, meadowCanopyView(canopy.a)),
    tip,
    detail: detail ? { litter: row(2), amounts: row(3), settings: detail } : null,
    map,
    dispose: () => map.dispose(),
  };
}
