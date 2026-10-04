import * as THREE from 'three/webgpu';
import { generateSurfaceData, SURFACE_NAMES, TEXTURE_METRES } from './houseTextureData.js';

export { SURFACE_NAMES, TEXTURE_METRES };

// These names are the world builder catalog's existing material vocabulary.
export const HOUSE_SURFACE_ALIASES = Object.freeze({
  stoneBlock: 'stone', darkStone: 'darkStone', plaster: 'plaster', timber: 'wood',
  plank: 'planks', deck: 'deck', roofTile: 'roofTiles', shingle: 'roofSlate', window: 'window',
});

export function houseSurfaceProperties(name) {
  if (!SURFACE_NAMES.includes(name)) throw new Error(`Unknown Gods End surface: ${name}.`);
  return {
    color: '#ffffff', density: 1 / TEXTURE_METRES[name], normalStrength: 1,
    roughness: name === 'window' ? 0.35 : 0.9, metalness: name === 'window' ? 0.2 : 0,
  };
}

/** The caller owns this pair; the catalog cache and Workshop share it. */
export function createHouseSurfaceTextures(name) {
  const pixels = generateSurfaceData(name);
  const create = (data, colorSpace, size = pixels.size) => {
    const texture = new THREE.DataTexture(data, size, size);
    texture.name = `gods-end-${name}-${colorSpace === THREE.SRGBColorSpace ? 'color' : 'normal'}`;
    texture.colorSpace = colorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.userData.sharedSurface = true;
    texture.needsUpdate = true;
    return texture;
  };
  return Object.freeze({
    map: create(pixels.color, THREE.SRGBColorSpace),
    normalMap: create(pixels.normal, THREE.NoColorSpace),
    roughnessMap: create(new Uint8Array([255, 255, 255, 255]), THREE.NoColorSpace, 1),
  });
}
