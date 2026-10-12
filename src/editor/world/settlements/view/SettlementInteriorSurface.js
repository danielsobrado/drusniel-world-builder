/**
 * Per-vertex surface tags of the settlement interior mesh, as [wood, firelight]:
 * wood wears the town's timber grain (SettlementInteriorMesh), firelight is the
 * hearth's stone, lit by its fire after dark. The interior builder appends the
 * room's row in the window table (SettlementWindowLight) as a third value.
 * Pure data.
 */
export const PLAIN = Object.freeze([0, 0]);
export const WOOD = Object.freeze([1, 0]);
export const FIRELIT = Object.freeze([0, 1]);
