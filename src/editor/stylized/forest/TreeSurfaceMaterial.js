import * as THREE from 'three/webgpu';
import { materialEmissive } from 'three/tsl';
import { cloneAuthoredNodeMaterial } from '../AuthoredFoliageMaterial.js';
import { foliageMaterialClass } from './FoliageNodeMaterial.js';

/** Preserve authored surface channels; the tree supplies its graded colour separately. */
export function createTreeSurfaceMaterial(source, { foliage = false } = {}) {
  let material;
  if (foliage) {
    // Keep Standard/Physical PBR donors intact, and promote Lambert/unlit/generated
    // tree crowns to matte Standard so crowns share scene.environment IBL parity
    // with terrain, meadow grass, bark, rocks, towns, and tree impostors.
    if (source?.isMaterial && (
      source.isMeshStandardMaterial || source.isMeshStandardNodeMaterial
      || source.isMeshPhysicalMaterial || source.isMeshPhysicalNodeMaterial
    )) {
      material = cloneAuthoredNodeMaterial(source, { lit: true });
    } else {
      material = new (foliageMaterialClass(THREE.MeshStandardNodeMaterial))({ roughness: 0.9, metalness: 0 });
      if (source?.isMaterial) {
        for (const key of [
          'map', 'normalMap', 'normalMapType', 'bumpMap', 'bumpScale', 'aoMap', 'aoMapIntensity',
          'emissiveMap', 'emissiveIntensity', 'alphaMap', 'opacity', 'alphaTest', 'flatShading',
          'normalNode', 'emissiveNode',
        ]) {
          if (source[key] !== undefined) material[key] = source[key];
        }
        if (source.normalScale) material.normalScale.copy(source.normalScale);
        if (source.emissive) material.emissive.copy(source.emissive);
      }
    }
  } else {
    material = source?.isMaterial
      ? cloneAuthoredNodeMaterial(source, { lit: true })
      : new THREE.MeshLambertNodeMaterial();
  }
  // Colour is explicitly included in the tree's colour AND sky-fill nodes. Letting
  // NodeMaterial multiply COLOR_0 again would square it in direct lighting only.
  material.vertexColors = false;
  if (foliage) material.side = THREE.DoubleSide;
  else material.side = source?.side ?? THREE.FrontSide;
  return material;
}

/** Add the outdoor fill without discarding an authored emissive channel. */
export function addTreeEmission(material, fill) {
  const authored = material.emissiveNode
    ?? (material.emissiveMap || material.emissive?.getHex() ? materialEmissive : null);
  material.emissiveNode = authored ? authored.add(fill) : fill;
  return material;
}
