import { oneMinus, positionWorld } from 'three/tsl';

import { surfaceWetnessUniform } from '../weather/surfaceWetness.js';
import { sampleWetnessField, wetnessFieldEnabled } from '../weather/wetness/wetnessField.js';
import { SURFACE_COATING_DEFAULTS } from './surfaceCoatings/SurfaceCoatingConfig.js';
import { wetCoat } from './surfaceCoatings/WetCoat.js';

/**
 * Share of its albedo soaked ground keeps, rain film and standing water
 * together (the wet coat's floor). Stacked on the bog's peat and the shore's damp
 * band, the uncapped product took wetland and wet sand to near black.
 */
export const WET_ALBEDO_FLOOR = SURFACE_COATING_DEFAULTS.wet.albedoFloor;
/** Extra darkening of standing water over the rain film, before the floor. */
const PUDDLE_DARKENING = 0.25;

/**
 * Rain-soaked ground: darker, and smoother so the sun glints off it. Snow
 * stays as it is and a canopy shelters what lies under it. Roughness only
 * falls, so already-wet shores keep their baked sheen.
 *
 * @param {object} options
 * @param {Node} options.snow 0..1 snow cover
 * @param {Node} options.canopy 0..1 canopy over the ground
 * @param {object} options.config resolved stylizedSurface.wetness
 */
export function createRainWetnessShading({ snow, canopy, config }) {
  const exposure = oneMinus(snow).mul(oneMinus(canopy.mul(config.canopyShelter)));
  // With the field on, the ground's own wetness here; off, the one global value.
  const field = wetnessFieldEnabled() ? sampleWetnessField(positionWorld.xz) : null;
  const wet = (field ? field.film : surfaceWetnessUniform).mul(exposure);
  return {
    wet,
    /** The wetness field's sample here, for the puddles; null with the field off. */
    field,
    /** 0..1 open to the rain: not snowed over, not under a canopy. */
    exposure,
    /** @param {Node} [puddle] 0..1 standing water, which darkens a little further */
    apply(color, roughness, puddle = null) {
      // The shared wet coat (WetCoat.js), as on towns, bark, deadwood and rocks.
      return wetCoat({ color, roughness }, {
        amount: wet, darkening: config.darkening, roughness: config.wetRoughness,
        soak: puddle ? puddle.mul(PUDDLE_DARKENING) : null,
      });
    },
  };
}
