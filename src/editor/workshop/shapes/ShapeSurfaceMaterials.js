import * as THREE from 'three/webgpu';
import { proceduralNormalTexture, surfaceRoughnessTexture, surfaceBumpTexture } from '../ProceduralWorkshopMaterials.js';
import { getSurfaceTexture } from '../ProceduralWorkshopTextureConfig.js';
import { shapeAlbedoTexture } from './ShapeAlbedo.js';

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
    ['wood', 'timber', 0.16, 220, 2], ['roof', 'granite', 0.10, 211, 3],
  ]) {
    const material = materials[slot];
    if (!retained.has(material)) continue;
    const explicit = getSurfaceTexture(recipe.surfaceTextures, slot === 'mortar' ? 'walls' : slot);
    if (explicit || material.map?.userData?.sharedSurface) continue;
    const replace = (key, texture) => {
      const previous = material[key]; material[key] = texture;
      if (previous && previous !== texture && !previous.userData?.sharedSurface) previous.dispose();
    };
    if (recipe.detail >= 2) {
      const seed = recipe.seed + index * 317;
      replace('normalMap', surfaceMap(`${kind}:${seed}`, () => proceduralNormalTexture(kind, seed)));
      material.normalScale = new THREE.Vector2(strength, strength);
    }
    const seed = recipe.seed + index * 719;
    replace('roughnessMap', surfaceMap(`rough:${roughness}:${seed}`, () => surfaceRoughnessTexture(seed, { base: roughness, variation: 16 })));
    if (slot === 'wood' || (slot === 'roof' && recipe.detail >= 2)) {
      const texture = surfaceMap(`albedo:${slot}:${seed}:${recipe.topStyle}`, () => shapeAlbedoTexture(slot, seed, recipe.topStyle));
      texture.colorSpace = THREE.SRGBColorSpace; replace('map', texture);
      replace('bumpMap', surfaceMap(`bump:${slot}:${seed}`, () => surfaceBumpTexture(seed, 0.2)));
      material.bumpScale = 0.018;
    }
    material.envMapIntensity = 0.55;
  }
  materials.recess.color.set('#365560');
  materials.recess.roughness = 0.3;
  materials.recess.metalness = 0.12;
  materials.recess.emissive.set('#a36c34');
  materials.recess.emissiveIntensity = 0.08;
}
