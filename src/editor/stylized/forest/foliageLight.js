import * as THREE from 'three/webgpu';
import { cameraPosition, dot, normalize, positionWorld, uniform } from 'three/tsl';

/**
 * The sun and sky as foliage sees them, after grass-test's `foliageLight`
 * (Gods' End `CinematicLighting`): shared by every textured crown and written
 * once a frame from the sky's directional and hemisphere lights.
 */
export const foliageLight = Object.freeze({
  direction: uniform(new THREE.Vector3(0.35, 0.85, 0.25).normalize()),
  color: uniform(new THREE.Color('#ffe0ae')),
  /** Sun strength for light passing through the leaves. */
  strength: uniform(0.3),
  /** Sky fill lifting the canopy's shaded interior. */
  fill: uniform(0.3),
});

/**
 * Copies the sky's lights into the foliage uniforms, with the donor's caps.
 *
 * @param {{ directional?: THREE.DirectionalLight, hemisphere?: THREE.HemisphereLight } | null} sky
 */
export function syncFoliageLight(sky) {
  const sun = sky?.directional;
  if (!sun) return;
  const direction = foliageLight.direction.value.copy(sun.position);
  if (sun.target) direction.sub(sun.target.position);
  if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);
  direction.normalize();
  foliageLight.color.value.copy(sun.color);
  foliageLight.strength.value = Math.min(sun.intensity * 0.12, 0.8);
  foliageLight.fill.value = Math.min((sky.hemisphere?.intensity ?? 0) * 0.35, 0.7);
}

/** Sunlight through the leaves toward the viewer (the donor's `foliageBacklight`). */
export function foliageBacklight(leafColor, amount) {
  const view = normalize(cameraPosition.sub(positionWorld));
  const transmission = dot(view.negate(), foliageLight.direction).max(0).pow(2.2);
  return leafColor.mul(foliageLight.color).mul(transmission).mul(foliageLight.strength).mul(amount);
}
