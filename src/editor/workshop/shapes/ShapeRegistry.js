import { normalizeShapeVolume, planShapeVolume } from './ShapeVolume.js';
import { normalizeShapeWall, planShapeWall } from './ShapeWall.js';
import { normalizeShapeTraversal, planShapeTraversal } from './ShapeTraversal.js';

/** Renderer-free capabilities; presets never change the core archetype dispatcher. */
const capabilities = new Map();
for (const [kind, normalize, plan] of [
  ['curved-volume', normalizeShapeVolume, planShapeVolume],
  ['curved-wall', normalizeShapeWall, planShapeWall],
  ['traversal', normalizeShapeTraversal, planShapeTraversal],
]) {
  if (capabilities.has(kind)) throw new Error(`Duplicate shape capability: ${kind}.`);
  capabilities.set(kind, Object.freeze({ normalize, plan }));
}

export function shapeCapability(kind) {
  return capabilities.get(kind) ?? null;
}

export function planRegisteredShape(primitive) {
  const capability = shapeCapability(primitive.kind);
  if (!capability) throw new Error(`Unknown shape capability: ${primitive.kind}.`);
  return capability.plan(primitive);
}
