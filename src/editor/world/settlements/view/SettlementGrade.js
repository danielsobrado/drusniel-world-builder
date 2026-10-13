import { attribute } from 'three/tsl';

import { gradeTownMaterial } from '../../../../render/materials/townGrade.js';

export { TOWN_GROUND } from '../../../../render/materials/townGrade.js';

/**
 * Grade one workshop material for a settlement: the shared town grade
 * (render/materials/townGrade.js), its weathering shifted by each instance's
 * stable seed so a street of one pooled variant is not weathered alike.
 *
 * @param {object} material a workshop material (ProceduralWorkshopMaterials)
 * @param {string} slot its material family
 * @param {{ plastered?: boolean }} [options] whether the `mortar` family is a rendered wall
 */
export function gradeSettlementMaterial(material, slot, { plastered = true } = {}) {
  gradeTownMaterial(material, slot, { plastered, seed: attribute('instanceDither', 'vec3').y });
}
