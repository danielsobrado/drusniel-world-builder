import { decodeAzgaarCartographySource } from '../import/AzgaarCartographySource.js';
import { createVectorMapModel } from './worldMapVector.js';

const models = new WeakMap();

/**
 * The decoded Azgaar vector model for a campaign, built once and shared by the
 * world map overlay and the walking minimap. Keyed by the campaign object, so
 * importing or loading a world (which replaces it) builds a fresh model.
 *
 * Returns null for campaigns without detailed cartography; throws when the
 * cartography is present but cannot be decoded.
 */
export function getWorldVectorModel(campaign, baseTerrain) {
  if (!campaign?.cartography) return null;
  const cached = models.get(campaign);
  if (cached && cached.baseTerrain === baseTerrain) return cached.model;
  const model = createVectorMapModel(
    decodeAzgaarCartographySource(campaign.cartography),
    campaign,
    baseTerrain,
  );
  models.set(campaign, { baseTerrain, model });
  return model;
}
