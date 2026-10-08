import { createProceduralObjectLodParts } from '../../../workshop/ProceduralAssetManager.js';
import { createProceduralWorkshopComponentParts } from '../../../workshop/ProceduralWorkshopComponentParts.js';
import { buildingRecipe } from '../SettlementBuildingCatalog.js';

/**
 * A pooled settlement mesh as plain typed arrays.
 *
 * Generating a house takes ~0.1 s, which is a visibly dropped frame every time
 * a new variant comes into range. This is the part of that work with no GPU in
 * it — the workshop's geometry — reduced to transferable buffers, so it can run
 * in a worker (settlementMesh.worker.js) and the main thread only uploads the
 * result. The same function serves the synchronous fallback, so there is one
 * mesh format and one install path whether or not a worker exists.
 */

function slotOf(part) {
  return part.material?.userData?.workshopSlot ?? 'stone';
}

function pack(part, transfer) {
  // Bake the part's matrix in: instances are placed whole.
  const geometry = part.geometry.clone().applyMatrix4(part.matrix);
  const attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    attributes[name] = { array: attribute.array, itemSize: attribute.itemSize, normalized: attribute.normalized };
    transfer.add(attribute.array.buffer);
  }
  const index = geometry.index?.array ?? null;
  if (index) transfer.add(index.buffer);
  return { slot: slotOf(part), attributes, index };
}

/**
 * @param {object} style a settlement style (SettlementProfile)
 * @param {string} kind
 * @param {number} variant
 * @returns {{ data: { archetype: string, near: object[], far: ?object[] }, transfer: ArrayBuffer[] }}
 *   `far` is set only for masonry, whose far tier is a second generation pass;
 *   a house's far tier is a subset of its near parts and is chosen at install.
 */
export function buildSettlementMeshData(style, kind, variant) {
  const recipe = buildingRecipe(style, kind, variant);
  const nearParts = createProceduralWorkshopComponentParts(recipe);
  const transfer = new Set();
  let lod = null;
  try {
    const near = nearParts.map((part) => pack(part, transfer));
    let far = null;
    if (recipe.archetype !== 'house' && recipe.archetype !== 'prop') {
      lod = createProceduralObjectLodParts({ recipe }, nearParts, {});
      if (lod) far = lod.shell.map((part) => pack(part, transfer));
    }
    return { data: { archetype: recipe.archetype, near, far }, transfer: [...transfer] };
  } finally {
    for (const part of new Set([...nearParts, ...(lod?.coarse ?? []), ...(lod?.shell ?? [])])) part.geometry.dispose();
  }
}
