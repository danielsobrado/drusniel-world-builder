import * as THREE from 'three/webgpu';
import { ShapeMesh } from './ShapeMesh.js';
import { buildShapeWalls } from './ShapeWallBuilder.js';
import { buildShapeRoof } from './ShapeRoofBuilder.js';
import { buildShapeSupports, buildShapeTraversal } from './ShapeTraversalBuilder.js';
import { buildShapeIvy } from './ShapeIvyBuilder.js';
import { shapeProductDomains } from './ShapeProductDomains.js';
import { buildShapeFloors } from './ShapeFloorBuilder.js';
import { buildShapeFacade } from './ShapeFacadeBuilder.js';

const builders = new Map([
  [
    'walls',
    (plan, meshes, recipe) => {
      buildShapeWalls(plan, meshes, recipe);
      if (plan.primitive.roof) buildShapeFloors(plan, meshes);
    },
  ],
  ['roof', buildShapeRoof],
  ['facade', buildShapeFacade],
  ['ivy', buildShapeIvy],
  ['supports', (plan, meshes) => buildShapeSupports(plan, meshes.trim)],
  ['traversal', buildShapeTraversal],
]);
const slots = Object.freeze({
  walls: 'mortar',
  roof: 'roof',
  trim: 'stone',
  inserts: 'wood',
  glazing: 'recess',
  deck: 'stone',
  foliage: 'foliage',
  metal: 'metal',
});

export function buildRegisteredShape(
  plan,
  materials,
  recipe,
  domains = shapeProductDomains(plan, recipe),
) {
  const meshes = Object.fromEntries(Object.keys(slots).map((key) => [key, new ShapeMesh()]));
  for (const domain of domains) {
    const build = builders.get(domain);
    if (!build) throw new Error(`Unknown shape product domain: ${domain}.`);
    build(plan, meshes, recipe);
  }
  const parts = [];
  try {
    for (const [family, mesh] of Object.entries(meshes)) {
      const geometry = mesh.geometry();
      if (!geometry) continue;
      geometry.userData.workshopSemantic = {
        id: plan.id,
        label: plan.primitive.label,
        kind: 'structure',
        attachmentSurface: null,
      };
      parts.push({
        geometry,
        material: materials[slots[family]],
        matrix: new THREE.Matrix4(),
        materialRegion: {
          id: `${plan.id}:${family}`,
          componentId: plan.id,
          label: `${plan.primitive.label} · ${family}`,
          family:
            family === 'trim'
              ? 'stone'
              : family === 'inserts'
                ? 'wood'
                : family === 'deck'
                  ? 'stone'
                  : family === 'glazing'
                    ? 'recess'
                    : family,
          connected: true,
        },
      });
    }
    return parts;
  } catch (error) {
    for (const part of parts) part.geometry.dispose();
    throw error;
  }
}
