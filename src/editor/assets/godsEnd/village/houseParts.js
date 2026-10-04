import { Matrix4 } from 'three';
import { getSurfaceMaterial } from '../../proceduralSurfaces.js';
import { createHouseBuilder } from './houseCatalog.js';

const SURFACES = Object.freeze({ stone: 'stoneBlock', darkStone: 'darkStone', plaster: 'plaster',
  wood: 'timber', planks: 'plank', deck: 'deck', roofTiles: 'roofTile', roofSlate: 'shingle', window: 'window', metal: 'iron' });

export function createGodsEndHouseParts(asset) {
  const builder = createHouseBuilder(asset.design);
  const materials = Object.fromEntries([...builder.parts.keys()].map((surface) => {
    const material = getSurfaceMaterial(SURFACES[surface], surface === 'metal' ? '#2a2724' : null).clone();
    material.vertexColors = true;
    material.userData.sharedSurface = false;
    if (surface === 'metal') { material.roughness = 0.55; material.metalness = 0.6; }
    return [surface, material];
  }));
  const { min, max } = asset.bounds;
  const group = builder.build(materials, [-(min[0] + max[0]) / 2, -asset.groundY, -(min[2] + max[2]) / 2]);
  // The donor already batches all details into one buffer per surface.
  return group.children.map((mesh) => ({ geometry: mesh.geometry, material: mesh.material, matrix: new Matrix4() }));
}
