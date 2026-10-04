import { createObjectCatalog } from '../../objectCatalogSchema.js';

export function createGodsEndObjectCatalog(entries, tileByKey, tileSize) {
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new Error('Gods’ End catalog requires a positive tile size.');
  const terrain = [...tileByKey].filter(([, tile]) => tile.terrainClass !== 'water').map(([key]) => key);
  const raw = entries.map((entry) => ({
    ...entry, model: 'godsEndAsset',
    footprint: { width: Math.max(1, Math.ceil(entry.asset.dimensions[0] / tileSize)),
      depth: Math.max(1, Math.ceil(entry.asset.dimensions[2] / tileSize)) },
    foundation: { mode: entry.category === 'building' ? 'terrace' : 'conform', maxSlopeDegrees: 30,
      maxDepth: entry.asset.kind === 'house' ? 6 : 3, alignToNormal: false, color: '#71685d' },
    allowedTerrain: terrain,
    collision: { policy: entry.collision === 'none' ? 'none' : 'solid', profile: 'godsEndAsset' },
  }));
  const validated = createObjectCatalog(raw, tileByKey);
  return Object.freeze(validated.map((definition, index) => Object.freeze({
    ...definition, asset: Object.freeze({ ...entries[index].asset, collision: entries[index].collision }),
  })));
}

/** Collision derives from the import's authored metadata; it is independent of loaded render meshes. */
export function createGodsEndColliderDescriptions(definition) {
  const { dimensions, collision } = definition.asset;
  if (collision === 'none') return Object.freeze([]);
  const [width, height, depth] = dimensions;
  const description = collision === 'trunk'
    ? { type: 'capsule', position: [0, 0, 0], dimensions: [Math.max(0.06, Math.min(width, depth) * 0.055), height * 0.7, 0] }
    : { type: 'box', position: [0, height / 2, 0], dimensions: [width, height, depth] };
  if (collision === 'trunk') description.dimensions[2] = description.dimensions[0];
  return Object.freeze([Object.freeze({ ...description, partId: 'authored-asset', rotationY: 0,
    position: Object.freeze(description.position), dimensions: Object.freeze(description.dimensions) })]);
}
