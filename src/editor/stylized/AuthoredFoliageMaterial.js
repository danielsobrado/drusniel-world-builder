import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { authoredTexture } from './AuthoredTextureNode.js';
import { gradePlantPart, resolveFoliagePalette } from './forest/foliagePalette.js';
import { foliageBacklight, foliageLight } from './forest/foliageLight.js';

/** Clone authored channels into a node material before assigning foliage nodes. */
export function cloneAuthoredNodeMaterial(source, { lit = false } = {}) {
  let material;
  const promote = lit && (source.isMeshBasicMaterial || source.isMeshBasicNodeMaterial);
  if (promote) material = new THREE.MeshLambertNodeMaterial();
  else if (source.isNodeMaterial) material = source.clone();
  else if (source.isMeshPhysicalMaterial) material = new THREE.MeshPhysicalNodeMaterial();
  else if (source.isMeshStandardMaterial) material = new THREE.MeshStandardNodeMaterial();
  else if (source.isMeshPhongMaterial) material = new THREE.MeshPhongNodeMaterial();
  else if (source.isMeshLambertMaterial) material = new THREE.MeshLambertNodeMaterial();
  else if (source.isMeshBasicMaterial) material = new THREE.MeshBasicNodeMaterial();
  else material = new THREE.MeshStandardNodeMaterial();
  if (promote || !source.isNodeMaterial) material.copy(source);
  // Several authored plant GLBs declare KHR_materials_unlit. Their albedo and
  // cutouts belong to the asset; their lighting belongs to the outdoor scene.
  if (promote) material.lights = true;
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
export function applyUnderstoryPalette(material, config, tileId = null, role = 'auto') {
  const color = gradePlantPart(authoredFoliageColor(material), resolveFoliagePalette(config, tileId), role);
  material.colorNode = color;
  const blossom = role === 'petal' || role === 'center';
  const fill = color.mul(foliageLight.fill).mul(blossom ? .1 : .14)
    .add(foliageBacklight(color, blossom ? .18 : .25));
  // Retain any authored emission (e.g. flower centres).
  material.emissiveNode = material.emissiveNode ? material.emissiveNode.add(fill) : fill;
  return material;
}
