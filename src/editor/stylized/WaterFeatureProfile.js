import { waterFieldHasCoverage } from '../water/WaterField.js';
import { WATER_KIND_OCEAN, WATER_KIND_LAKE, WATER_KIND_RIVER } from '../water/WaterConstants.js';

export const WATER_FEATURES = Object.freeze({ OCEAN: 1, INLAND: 2, FALL: 4, ICE: 8 });
export const ALL_WATER_FEATURES = 15;

/** Include dry edge samples: their appearance and flow interpolate across the shore. */
export function waterFeatureProfile(page) {
  if (!waterFieldHasCoverage(page?.waterFieldPixels)) return 0;
  const appearance = page.waterAppearancePixels, flow = page.waterFlowPixels;
  if (!appearance?.length || appearance.length !== page.waterFieldPixels.length) return ALL_WATER_FEATURES;
  let features = 0;
  let cold = false;
  let canFreeze = false;
  for (let i = 0; i < appearance.length; i += 4) {
    const kind = appearance[i];
    if (kind === WATER_KIND_OCEAN) features |= WATER_FEATURES.OCEAN;
    else if (kind === WATER_KIND_LAKE || kind === WATER_KIND_RIVER) features |= WATER_FEATURES.INLAND;
    else if (kind !== 0 || (page.waterFieldPixels[i] & 0x7fff)) return ALL_WATER_FEATURES;
    cold ||= appearance[i + 2] > 0;
    canFreeze ||= kind === WATER_KIND_LAKE || kind === WATER_KIND_OCEAN;
    if (flow?.[i + 2] || flow?.[i + 3]) features |= WATER_FEATURES.FALL;
  }
  if (cold && canFreeze) features |= WATER_FEATURES.ICE;
  if (!flow || flow.length !== appearance.length) features |= WATER_FEATURES.FALL;
  return features || ALL_WATER_FEATURES;
}
