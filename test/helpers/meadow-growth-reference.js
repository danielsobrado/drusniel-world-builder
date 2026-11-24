import { meadowAccentRows, MEADOW_PLANT_FIELD, MEADOW_PLANT_SHAPES } from '../../src/editor/stylized/meadow/meadowGrassShapes.js';
import { meadowGrowthShare, meadowNoiseNumber, meadowTuftOccupancy } from '../../src/editor/stylized/meadow/meadowGrowthMath.js';
import { meadowMicrohabitatNumber } from '../../src/editor/stylized/meadow/meadowMicrohabitat.js';
import { MEADOW_STAND_DEFAULT } from '../../src/editor/stylized/meadow/meadowStandProfiles.js';
import {
  MEADOW_CARD_HEIGHT_CONTRAST,
  MEADOW_CARD_STATURE,
  MEADOW_GAP_RAMP,
  MEADOW_SHORT_FLOOR,
  MEADOW_SHORT_STAND,
  MEADOW_TUFT_DEFAULTS,
} from '../../src/editor/stylized/meadow/meadowTuftField.js';

const clamp = value => Math.max(0, Math.min(1, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** CPU equivalent of the shared canonical-space lush/dry/worn mask. */
export function meadowAreaStyleReference(x, z, strength) {
  if (strength === 0) return { lush: 0, dry: 0, worn: 0, height: 1 };
  const warp = meadowNoiseNumber(x / 7 + 71.3, z / 7 + 11.9) - 0.5;
  const area = meadowNoiseNumber(x / 28 + 3.7 + warp * 1.3, z / 28 + 29.1 + warp * 1.3)
    + warp * 0.35;
  const bare = meadowNoiseNumber(x / 19 + 47.9 - warp * 1.1, z / 19 + 83.3 - warp * 1.1)
    + warp * 0.3;
  const lush = (1 - smooth(0.3, 0.5, area)) * strength;
  const dry = smooth(0.5, 0.74, area) * strength;
  const worn = smooth(0.58, 0.8, bare) * (1 - lush) * strength;
  return {
    lush, dry, worn,
    height: lerp(1, 0.86, dry) * lerp(1, 0.72, worn),
  };
}

/** Matches the species drift, seed-head and stature multipliers in the shader. */
export function meadowSpeciesHeightReference(x, z, rank, weights = MEADOW_STAND_DEFAULT) {
  const drift = meadowNoiseNumber(x / 6.5 + 13.1, z / 6.5 + 57.3);
  const cover = meadowNoiseNumber(x / 2.7 + 91.7, z / 2.7 + 23.9);
  const rye = clamp((1 - smooth(0.3, 0.42, drift)) * weights.rye);
  const fescue = clamp(smooth(0.58, 0.7, drift) * weights.fescue);
  const clover = clamp(smooth(0.66, 0.76, cover) * (1 - rye) * weights.cover);
  const phase = rank * 0.754877;
  const seedRank = phase - Math.floor(phase) + (weights.seeds - 1) * 0.05;
  const seeds = smooth(0.93, 0.95, seedRank) * rye * clamp(weights.seeds);
  return {
    height: lerp(lerp(lerp(1, 1.12, rye), 0.82, fescue), 0.62, clover)
      * lerp(1, 1.3, seeds),
    rye, fescue, clover, seeds,
  };
}

/**
 * CPU reference of the meadow's settled height before per-stem dirt, creature
 * interaction, snow and LOD shrinking. Cards use the same area field as blades.
 */
export function meadowRenderedHeightReference(profile, x, z, {
  rank = 0,
  cards = false,
  tuftSettings = MEADOW_TUFT_DEFAULTS,
  areaStrength = 1,
} = {}) {
  const occupancy = meadowTuftOccupancy(x, z);
  const area = meadowAreaStyleReference(x, z, areaStrength * (profile.areaStyle ?? 1));
  const accentShift = meadowMicrohabitatNumber(0, area, profile.microhabitat).accentShift;
  const accent = meadowAccentRows(profile);
  const plantNoise = meadowNoiseNumber(
    x / MEADOW_PLANT_FIELD.meters + MEADOW_PLANT_FIELD.offset[0],
    z / MEADOW_PLANT_FIELD.meters + MEADOW_PLANT_FIELD.offset[1],
  ) + accentShift;
  const plant = plantNoise > accent.high[1] ? accent.high
    : plantNoise < accent.low[1] ? accent.low : [MEADOW_PLANT_SHAPES[profile.shape], 0, 1, 1];
  const effectiveShape = plant[0] === MEADOW_PLANT_SHAPES.slender ? 'slender' : 'other';
  const crowned = meadowGrowthShare(
    meadowNoiseNumber(x / profile.patchMeters, z / profile.patchMeters),
    occupancy, tuftSettings.height, tuftSettings.moundHeight, effectiveShape,
  );
  const micro = meadowMicrohabitatNumber(crowned, area, profile.microhabitat);
  const share = cards ? lerp(0.5, micro.share, MEADOW_CARD_HEIGHT_CONTRAST) : micro.share;
  const short = profile.shortHeight * MEADOW_SHORT_FLOOR;
  const stand = cards ? { height: MEADOW_CARD_STATURE } : meadowSpeciesHeightReference(x, z, rank, profile.stand);
  const shortness = 1 - smooth(...MEADOW_SHORT_STAND, profile.tallHeight);
  const gap = lerp(1, smooth(...MEADOW_GAP_RAMP, occupancy), tuftSettings.gapCut * shortness);
  return {
    height: lerp(short, profile.tallHeight, share) * stand.height * area.height * gap * plant[2],
    micro, area, stand, accentHeight: plant[2], accentWidth: plant[3],
    share, gap, effectiveShape,
  };
}
