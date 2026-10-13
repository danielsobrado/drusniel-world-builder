import { float } from 'three/tsl';

import { glazeWindowRecess } from '../../render/materials/townGlass.js';
import { gradeTownMaterial } from '../../render/materials/townGrade.js';
import { createWorkshopMaterials, hasPlasterWalls } from './ProceduralWorkshopMaterials.js';

/**
 * Workshop materials as a building is seen in the world: the shared town grade
 * (one palette, deeper joints, scan relief, moss, rain runs and a damp foot)
 * and the towns' leaded window glass
 * over the workshop's own synthesised surfaces. The workshop preview and baked
 * objects use this, so a house looks the same while authored, when placed and
 * inside a settlement (which grades its own pooled copies per instance).
 *
 * @param {object} recipe normalized workshop recipe
 */
export function createGradedWorkshopMaterials(recipe) {
  const materials = createWorkshopMaterials(recipe);
  const plastered = hasPlasterWalls(recipe);
  // A fixed offset per recipe: one building's weathering, stable across rebuilds.
  const seed = float(((Number(recipe.seed) || 0) * 0.6180339887) % 1);
  for (const [slot, material] of Object.entries(materials)) gradeTownMaterial(material, slot, { plastered, seed });
  // Leaded glass with a faintly lit room behind it, as in a town by day.
  glazeWindowRecess(materials.recess, { dusk: float(0), home: float(1) });
  return materials;
}
