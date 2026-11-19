import { vec3 } from 'three/tsl';

import {
  MEADOW_ACCENT_MOTION_SHAPES,
  MEADOW_GRASS_SHAPES,
  MEADOW_PLANT_SHAPES,
} from './meadowGrassShapes.js';

/** Shape-specific wind, resting bend, and curvature without another uniform array. */
export function meadowPlantMotion(name) {
  const baseName = Object.hasOwn(MEADOW_ACCENT_MOTION_SHAPES, name)
    ? MEADOW_ACCENT_MOTION_SHAPES[name] : name;
  const profile = Object.hasOwn(MEADOW_GRASS_SHAPES, baseName)
    ? MEADOW_GRASS_SHAPES[baseName] : null;
  if (!profile) throw new Error(`Unknown meadow plant shape: ${name}`);
  return [profile.wind, profile.rest, profile.curve];
}

export function meadowPlantMotionNodes(shape) {
  const slender = vec3(...meadowPlantMotion('slender'));
  const reed = vec3(...meadowPlantMotion('reed'));
  const broadleaf = vec3(...meadowPlantMotion('broadleaf'));
  return shape.lessThan(MEADOW_PLANT_SHAPES.slender + 0.5).select(slender,
    shape.lessThan(MEADOW_PLANT_SHAPES.reed + 0.5).select(reed,
      shape.lessThan(MEADOW_PLANT_SHAPES.broadleaf + 0.5).select(broadleaf,
        shape.lessThan(MEADOW_PLANT_SHAPES.lance + 0.5).select(broadleaf, reed))));
}
