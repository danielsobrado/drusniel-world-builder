import { isStoneKind } from './SettlementStones.js';
import { isTrimKind } from './SettlementTrim.js';

/**
 * Kinds whose mesh the settlement view builds itself — loose stone and trim —
 * rather than asking the workshop for a recipe. They are small, pooled under
 * the town's style, and drawn in one tier.
 */
export function isCraftedKind(kind) {
  return isStoneKind(kind) || isTrimKind(kind);
}
