import {
  abs,
  dot,
  floor,
  fract,
  mix,
  oneMinus,
  sin,
  smoothstep,
  vec2,
} from 'three/tsl';
import { heightRelief } from './heightRelief.js';

const MICRO_FADE_START_METERS = 5;
const MICRO_FADE_END_METERS = 30;
const PRIMARY_CELLS_PER_METER = 1.65; // ~0.6 m soil clods & pebble clusters
const FINE_CELLS_PER_METER = 5.4; // ~0.18 m surface grain & rock pitting

function hash21(p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123));
}

function valueNoise2D(p) {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  const a = hash21(i);
  const b = hash21(i.add(vec2(1, 0)));
  const c = hash21(i.add(vec2(0, 1)));
  const d = hash21(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/**
 * Walking-distance 0.1–1.5 m surface microgeometry in screen derivatives using zero
 * texture samplers. Adds crisp gravel, soil clods, rock fractures, and wind grain
 * near the player and fades smoothly beyond 30 m to avoid specular aliasing.
 */
export function applyTerrainMicrogeometryNormal({
  surfaceNormal,
  worldXZ,
  materialWeights,
  pathMask,
  waterMask,
  cameraDistance,
}) {
  const distanceFade = oneMinus(smoothstep(MICRO_FADE_START_METERS, MICRO_FADE_END_METERS, cameraDistance));
  const landMask = oneMinus(smoothstep(0.05, 0.35, waterMask));
  const trailDamping = oneMinus(pathMask.mul(0.55));
  const weightSum = materialWeights.r
    .add(materialWeights.g)
    .add(materialWeights.b)
    .add(materialWeights.a)
    .max(0.0001);

  const grass = materialWeights.r.div(weightSum);
  const dirt = materialWeights.g.div(weightSum);
  const rock = materialWeights.b.div(weightSum);
  const snow = materialWeights.a.div(weightSum);

  const coarseGrain = valueNoise2D(worldXZ.mul(PRIMARY_CELLS_PER_METER)).sub(0.5);
  const fineGrain = valueNoise2D(worldXZ.mul(FINE_CELLS_PER_METER).add(vec2(13.7, 29.1))).sub(0.5);
  const rockStriation = abs(valueNoise2D(vec2(
    worldXZ.x.mul(1.9).add(worldXZ.y.mul(0.6)),
    worldXZ.y.mul(3.4).sub(worldXZ.x.mul(0.5)),
  )).sub(0.5)).mul(-2).add(1);

  // Material-responsive relief amplitude (metres): rough on rock/soil, softer on deep snow.
  const roughnessAmp = grass.mul(0.012)
    .add(dirt.mul(0.022))
    .add(rock.mul(0.045))
    .add(snow.mul(0.009));

  const microHeight = coarseGrain.mul(0.65)
    .add(fineGrain.mul(0.35))
    .mul(roughnessAmp)
    .add(rockStriation.sub(0.5).mul(rock.mul(0.028)))
    .mul(distanceFade)
    .mul(landMask)
    .mul(trailDamping);

  return heightRelief(surfaceNormal, microHeight);
}
