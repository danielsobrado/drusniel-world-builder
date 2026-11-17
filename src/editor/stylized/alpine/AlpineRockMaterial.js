import * as THREE from 'three/webgpu';
import {
  attribute, color, float, mix, mx_noise_float, normalView, normalWorld, normalize, positionWorld, vec3,
} from 'three/tsl';
import { coldStone } from '../rockSnowSurface.js';
import { snowCoat } from '../surfaceCoatings/SnowCoat.js';
import { surfaceCoatings } from '../surfaceCoatings/SurfaceCoatingConfig.js';
import { blendCoat } from '../../../render/materials/surfaceLayers/PbrCoatBlend.js';
import { SNOW_GROUND_COLOR, snowDeposition } from '../snowDeposition.js';
import { stormSnowCoverUniform } from '../../weather/storm/stormGroundUniforms.js';

const SNOW = '#e8eef2';
/** AlpineRockView sinks each unit rock to put the ground here, in its own space (0.5 - BURIAL below centre). */
const GROUND_Y = -0.15;

/** Stone projected in world space so every instance differs, with snow settled on its upper faces. */
export function createAlpineRockMaterial() {
  const material = new THREE.MeshStandardNodeMaterial({ name: 'alpine-rock' });
  const p = positionWorld.toVar();
  const n = normalize(normalWorld).toVar();
  const stone = coldStone(p, n).toVar();
  // A finer octave too: a crag is tens of metres, and the broad one alone ran its skirt as a level band.
  const breakup = mx_noise_float(p.mul(0.35)).add(mx_noise_float(p.mul(1.4)).mul(0.5)).toVar();
  // Per crag (AlpineRockView): its biome's ground snow or its altitude's, so badlands crags stay bare.
  const { cover: snow, skirt } = snowDeposition({ snow: attribute('instanceSnow', 'float').max(stormSnowCoverUniform), breakup: breakup.mul(0.9), centre: [0, 0, 0], groundY: GROUND_Y, height: 1.15 });
  const settings = surfaceCoatings();
  const coat = snowCoat(p, n, snow, settings);
  const snowColor = mix(color(SNOW), color(SNOW_GROUND_COLOR), skirt).mul(coat?.tint ?? vec3(1));
  const snowRoughness = settings.snow.enabled ? settings.snow.roughness : 0.78;
  const surface = blendCoat({ color: stone, roughness: float(0.86), normal: normalView },
    { color: snowColor, roughness: float(snowRoughness).add(coat?.roughness ?? 0), normal: coat?.normal() }, snow);
  material.colorNode = surface.color;
  material.roughnessNode = surface.roughness;
  if (coat && settings.snow.enabled) material.normalNode = surface.normal;
  return material;
}
