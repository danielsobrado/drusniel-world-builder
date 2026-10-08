import * as THREE from 'three/webgpu';
import { getComponentTransform } from '../ProceduralWorkshopComponentTransforms.js';

/** Owners are authored primitives. Bounds measure presentation only; no component classification. */
export function createShapeComponents(recipe, entries) {
  const components = new Map();
  for (const primitive of recipe.composition.primitives) {
    const owned = entries.filter((entry) => entry.semanticHint?.id === primitive.id);
    if (!owned.length) continue;
    const bounds = new THREE.Box3().makeEmpty();
    for (const entry of owned) bounds.union(entry.bounds);
    const transform = getComponentTransform(recipe.componentTransforms, primitive.id);
    const component = {
      id: primitive.id,
      label: primitive.label,
      kind: 'structure',
      parentId: null,
      entries: owned,
      bounds,
      center: bounds.getCenter(new THREE.Vector3()),
      size: bounds.getSize(new THREE.Vector3()),
      pivot: new THREE.Vector3(primitive.position[0], primitive.elevation, primitive.position[1]),
      frameYaw: 0,
      storedTransform: transform,
      transform,
      transformPolicy: 'free',
      attachmentSurface: null,
    };
    for (const entry of owned) entry.componentId = primitive.id;
    components.set(primitive.id, Object.freeze(component));
  }
  return components;
}
