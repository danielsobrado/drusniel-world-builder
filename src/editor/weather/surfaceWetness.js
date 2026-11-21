import { frameUniform as uniform } from '../../render/FrameUniforms.js';
import { Vector3 } from 'three/webgpu';

import { DEFAULT_SURFACE_WETNESS } from './surfaceWetnessConfig.js';

/**
 * How wet exposed ground is, 0..1, shared by every material that darkens and
 * glistens in the rain. Rain wets quickly; the ground dries slowly after it
 * stops (after grass-test's EnvironmentState accumulators).
 */
export const surfaceWetnessUniform = uniform(0);

/** Stone, timber, roof: one climate clock, different absorption and runoff. */
export const buildingWetnessUniform = uniform(new Vector3());
const BUILDING_RATES = Object.freeze([
  { wet: 0.8, dry: 1 },
  { wet: 1.6, dry: 1.5 },
  { wet: 0.45, dry: 0.45 },
]);

/**
 * The wetness field's clocks (weather/wetness/): ground that dries first (sunny
 * slopes), ground that holds water (shaded flats), and standing water, which
 * needs sustained rain to pool and dries last. Each texel of the field mixes
 * them by how well it holds water, so drying is patchy without any per-texel
 * history: the field is a pure function of these clocks, the terrain and the sun.
 */
export const groundWetnessClocksUniform = uniform(new Vector3());
const GROUND_RATES = Object.freeze([
  { wet: 1, dry: 0.45 },
  { wet: 1.3, dry: 1.5 },
  { wet: 3, dry: 2.5 },
]);

/** Drying speed under the sun: half at night, a fifth faster than the base under a high sun. */
export function sunDryingRate(sunHeight) {
  const height = Number.isFinite(sunHeight) ? sunHeight : 1;
  return 0.5 + 0.7 * Math.max(0, Math.min(1, height * 2.5));
}

function approach(value, goal, dt, wetSeconds, drySeconds) {
  return value < goal ? Math.min(goal, value + dt / wetSeconds) : Math.max(goal, value - dt / drySeconds);
}

export class SurfaceWetness {
  constructor(config = DEFAULT_SURFACE_WETNESS, target = surfaceWetnessUniform, buildingTarget = buildingWetnessUniform) {
    this.config = config;
    this.target = target;
    this.value = 0;
    this.buildingTarget = buildingTarget;
    this.buildingValues = new Vector3();
    this.groundTarget = groundWetnessClocksUniform;
    this.groundValues = new Vector3();
  }

  /**
   * @param {number} dt seconds
   * @param {number} rain 0..1 rain intensity now
   * @param {number} [sunHeight] the sun direction's y, which speeds the field's drying
   */
  update(dt, rain, sunHeight = 1) {
    if (!(dt > 0) || !Number.isFinite(dt) || !Number.isFinite(rain)) return this.value;
    const goal = Math.max(0, Math.min(1, rain));
    this.value = approach(this.value, goal, dt, this.config.wetSeconds, this.config.drySeconds);
    BUILDING_RATES.forEach((rate, i) => {
      this.buildingValues.setComponent(i, approach(this.buildingValues.getComponent(i), goal, dt,
        this.config.wetSeconds * rate.wet, this.config.drySeconds * rate.dry));
    });
    this.buildingTarget.value.copy(this.buildingValues);
    const sun = sunDryingRate(sunHeight);
    GROUND_RATES.forEach((rate, i) => {
      this.groundValues.setComponent(i, approach(this.groundValues.getComponent(i), goal, dt,
        this.config.wetSeconds * rate.wet, this.config.drySeconds * rate.dry / sun));
    });
    this.groundTarget.value.copy(this.groundValues);
    this.target.value = this.value;
    return this.value;
  }
}
