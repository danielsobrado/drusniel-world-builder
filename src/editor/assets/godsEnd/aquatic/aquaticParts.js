import * as THREE from 'three/webgpu';
import { createGodsEndAquaticGeometry } from './aquaticGeometry.js';

/** Placeable aquatic catalog objects share the donor's procedural recipes. */
export function createGodsEndAquaticParts(asset) {
  const geometry = createGodsEndAquaticGeometry(asset.species);
  const floating = /lilypad$/i.test(asset.species);
  geometry.scale(floating ? asset.height : 1, asset.height, floating ? asset.height : 1);
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, 0, -center.z);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85,
    side: THREE.DoubleSide, transparent: floating, depthWrite: true });
  return [{ geometry, material, matrix: new THREE.Matrix4() }];
}
