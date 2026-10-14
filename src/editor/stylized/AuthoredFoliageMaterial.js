import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { authoredTexture } from './AuthoredTextureNode.js';
import { gradeUnderstory, resolveFoliagePalette } from './forest/foliagePalette.js';
import { foliageBacklight, foliageLight } from './forest/foliageLight.js';

/** Clone authored channels into a node material before assigning foliage nodes. */
export function cloneAuthoredNodeMaterial(source) {
  let material;
  if (source.isNodeMaterial) material = source.clone();
  else if (source.isMeshPhysicalMaterial) material = new THREE.MeshPhysicalNodeMaterial();
  else if (source.isMeshStandardMaterial) material = new THREE.MeshStandardNodeMaterial();
  else if (source.isMeshPhongMaterial) material = new THREE.MeshPhongNodeMaterial();
  else if (source.isMeshLambertMaterial) material = new THREE.MeshLambertNodeMaterial();
  else if (source.isMeshBasicMaterial) material = new THREE.MeshBasicNodeMaterial();
  else material = new THREE.MeshStandardNodeMaterial();
  if (!source.isNodeMaterial) material.copy(source);
  // NodeMaterial.copy skips inherited accessors such as Material.alphaTest.
  // Keep the authored cutoff when adding output effects or foliage nodes.
  material.alphaTest = source.alphaTest ?? 0;
  return material;
}

export function authoredFoliageColor(material) {
  const value = new THREE.Color(material.color ?? '#ffffff');
  const base = vec3(value.r, value.g, value.b);
  return material.map ? authoredTexture(material.map).rgb.mul(base) : base;
}

/** Green leaves share the meadow/canopy ramp; flowers and bark retain their paint. */
export function applyUnderstoryPalette(material, config, tileId = null) {
  const color = gradeUnderstory(authoredFoliageColor(material), resolveFoliagePalette(config, tileId));
  material.colorNode = color;
  const fill = color.mul(foliageLight.fill).mul(0.18).add(foliageBacklight(color, 0.35));
  // Retain any authored emission (e.g. flower centres).
  material.emissiveNode = material.emissiveNode ? material.emissiveNode.add(fill) : fill;
  return material;
}
