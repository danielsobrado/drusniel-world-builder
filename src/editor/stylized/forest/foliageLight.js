import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

/**
 * A restrained sky fill shared by crowns and understory, updated once a frame.
 * Direct transmission uses the scene light's colour, intensity and shadows.
 */
export const foliageLight = Object.freeze({
  /** Transmission gain, applied to already-shadowed direct radiance. */
  strength: uniform(0.12),
  /** Sky fill lifting the canopy's shaded interior. */
  fill: uniform(0.3),
  skyColor: uniform(new THREE.Color('#ffffff')),
});

/**
 * Copies the hemisphere's linear colour and capped intensity into the fill.
 *
 * @param {{ directional?: THREE.DirectionalLight, hemisphere?: THREE.HemisphereLight } | null} sky
 */
export function syncFoliageLight(sky) {
  const hemisphere = sky?.hemisphere;
  if (hemisphere) foliageLight.skyColor.value.copy(hemisphere.color);
  else foliageLight.skyColor.value.setRGB(0, 0, 0);
  foliageLight.fill.value = Math.min(Math.max(hemisphere?.intensity ?? 0, 0) * 0.35, 0.7);
  // Light intensity and colour are already included in the lighting model.
  foliageLight.strength.value = sky?.directional ? 0.12 : 0;
}

export function foliageSkyFill(color, amount) {
  return color.mul(foliageLight.skyColor).mul(foliageLight.fill).mul(amount);
}

/** Only sky fill is emissive; sunlight must pass through the shadow system. */
export function treeFoliageEmission(crown) {
  return foliageSkyFill(crown, 0.28);
}
