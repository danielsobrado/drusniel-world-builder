import { AQUATIC_PLACEMENT_SURFACE } from '../../../water/AquaticPlacement.js';
import { WATER_KIND_LAKE, WATER_KIND_OCEAN } from '../../../water/WaterConstants.js';

export const GODS_END_AQUATIC_SPECIES = Object.freeze({
  seagrass: Object.freeze({
    height: 0.38,
    sway: 0.18,
    color: '#3f6b34',
    depth: Object.freeze([0.6, 4]),
    kinds: Object.freeze([WATER_KIND_OCEAN, WATER_KIND_LAKE]),
  }),
  kelp: Object.freeze({
    height: 1.5,
    sway: 0.3,
    color: '#4a5c2c',
    depth: Object.freeze([1.2, 9]),
    kinds: Object.freeze([WATER_KIND_OCEAN]),
  }),
  redAlgae: Object.freeze({
    height: 0.2,
    sway: 0.1,
    color: '#8c3f3a',
    depth: Object.freeze([0.8, 7]),
    kinds: Object.freeze([WATER_KIND_OCEAN, WATER_KIND_LAKE]),
  }),
  eelgrass: Object.freeze({
    height: 0.6,
    sway: 0.2,
    color: '#43682f',
    depth: Object.freeze([0.5, 5]),
    kinds: Object.freeze([WATER_KIND_LAKE]),
  }),
  waterweed: Object.freeze({
    height: 0.85,
    sway: 0.1,
    color: '#4f7434',
    depth: Object.freeze([0.8, 7]),
    kinds: Object.freeze([WATER_KIND_LAKE]),
  }),
  pondweed: Object.freeze({
    height: 1.1,
    sway: 0.08,
    color: '#3d5f2e',
    depth: Object.freeze([1, 8]),
    kinds: Object.freeze([WATER_KIND_LAKE]),
  }),
  lilyPad: Object.freeze({
    height: 0.26,
    // A pad is not rooted, so it rides the surface and only breathes with the swell.
    sway: 0.03,
    color: '#4c7a3a',
    depth: Object.freeze([0.4, 6]),
    kinds: Object.freeze([WATER_KIND_LAKE]),
    placement: AQUATIC_PLACEMENT_SURFACE,
    // Pads gather along the bank rather than out in the middle of a lake.
    shoreDistance: Object.freeze([0, 22]),
  }),
  floweringLilyPad: Object.freeze({
    height: 0.26, sway: 0.03, color: '#ffffff', depth: Object.freeze([0.4, 6]),
    kinds: Object.freeze([WATER_KIND_LAKE]), placement: AQUATIC_PLACEMENT_SURFACE,
    shoreDistance: Object.freeze([0, 22]),
  }),
});
