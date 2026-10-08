import * as THREE from 'three/webgpu';
import { proceduralNormalTexture, surfaceRoughnessTexture } from '../ProceduralWorkshopMaterials.js';

// Only immutable CPU pixels are cached. Every product owns its GPU texture objects.
const pixels = new Map();
function surfaceMap(key, create) {
  let texture;
  if (!pixels.has(key)) {
    texture = create();
    if (pixels.size >= 32) pixels.delete(pixels.keys().next().value);
    pixels.set(key, texture.image);
  } else {
    const image = pixels.get(key);
    texture = new THREE.DataTexture(image.data, image.width, image.height, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }
  texture.generateMipmaps = true;
  return texture;
}

/** Neutral micro-surfaces preserve artist-selected tints and inherited material presets. */
export function applyShapeSurfaceMaterials(materials, recipe, retained) {
  for (const [slot, kind, strength, roughness, index] of [
    ['mortar', 'plaster', 0.18, 245, 0], ['stone', 'granite', 0.2, 232, 1],
    ['wood', 'timber', 0.38, 214, 2], ['roof', 'granite', 0.12, 201, 3],
  ]) {
    const material = materials[slot];
    if (!retained.has(material)) continue;
    if (recipe.detail >= 2) {
      const seed = recipe.seed + index * 317;
      material.normalMap = surfaceMap(`${kind}:${seed}`, () => proceduralNormalTexture(kind, seed));
      material.normalScale = new THREE.Vector2(strength, strength);
    }
    const seed = recipe.seed + index * 719;
    material.roughnessMap = surfaceMap(`rough:${roughness}:${seed}`, () => surfaceRoughnessTexture(seed, { base: roughness, variation: 16 }));
    material.envMapIntensity = 0.55;
  }
  materials.recess.color.set('#365560');
  materials.recess.roughness = 0.3;
  materials.recess.metalness = 0.12;
  materials.recess.emissive.set('#a36c34');
  materials.recess.emissiveIntensity = 0.08;
}
