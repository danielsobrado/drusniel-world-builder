import { SEA_SWELL_COMPONENTS } from './SeaSwell.js';
import { directionalCarriers, evaluateDirectionalSurfCpu, surfCarrierFrames, surfShoalingGain } from './SeaSurfMath.js';
import { seaExposure } from './WaterAppearance.js';
import { seaRefractionPhaseShift } from './SeaRefractionMath.js';
import { seaDiffractionPhaseDelay } from './SeaDiffraction.js';

const TAU = Math.PI * 2;
const CREST_PHASE = Math.PI * 0.5;
const EPSILON = 1e-6;

export const impactClamp = value => Math.max(0, Math.min(1, value));

export function impactCrestIndex(phase) {
  return Math.floor((phase - CREST_PHASE) / TAU);
}

export function impactHash(id, crest, index = 0) {
  let hash = 2166136261;
  const value = String(id) + ':' + String(crest) + ':' + String(index);
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  }
  return ((hash >>> 0) + 0.5) / 4294967296;
}

export function impactWaveSample(x, z, water, time, surf, sea, storm,
  exposure = seaExposure(Math.max(0, water.shoreDistance ?? 0))) {
  const depth = Math.max(water.depth ?? 0, 0.25);
  const shoreDistance = Math.max(0, water.shoreDistance ?? 0);
  const wave = SEA_SWELL_COMPONENTS[0];
  const directional = surf?.enabled && surf.model === 'directionalBreakers';
  const carrier = directional ? directionalCarriers[0] : wave;
  const frames = directional ? surfCarrierFrames(carrier, 0, surf.directional) : null;
  const oblique = frames?.surfOblique0.wave ?? [carrier.waveNumber * carrier.x, carrier.waveNumber * carrier.z];
  const phase = carrier.phase + time * carrier.angularSpeed
    + (directional ? shoreDistance * surf.directional.waveNumbers[0] : 0)
    + (directional ? seaRefractionPhaseShift(depth, shoreDistance, carrier, 0, surf) : 0)
    + (directional ? seaDiffractionPhaseDelay(
      exposure, shoreDistance, carrier.waveNumber, surf.diffraction) : 0)
    + x * oblique[0] + z * oblique[1];
  const swellHeight = 2 * sea.amplitude * (1 + storm * (sea.stormScale - 1)) * exposure;
  if (!directional) {
    return { phase, crest: impactCrestIndex(phase), height: swellHeight, breaking: impactClamp(1 - depth / 3) };
  }
  const sample = evaluateDirectionalSurfCpu(x, z, depth, shoreDistance, time, surf, sea, storm, exposure);
  const gain = surfShoalingGain(depth, surf.breaking);
  return {
    phase, crest: impactCrestIndex(phase),
    height: swellHeight * gain,
    breaking: sample.breaking,
  };
}

export function impactIntensity({ height, breaking, exposed, reachable }, settings) {
  return impactClamp(
    height / settings.referenceWaveHeightMeters
    * (0.25 + 0.75 * impactClamp(breaking))
    * Math.min(1, Math.max(0, (exposed - settings.exposedHeightThresholdMeters) / 0.45))
    * impactClamp(reachable),
  );
}

export function impactContactPoint(rock, directionX, directionZ) {
  const length = Math.max(Math.hypot(directionX, directionZ), EPSILON);
  const dx = directionX / length, dz = directionZ / length;
  return {
    x: rock.x - dx * rock.radius * 0.85,
    z: rock.z - dz * rock.radius * 0.85,
    directionX: dx, directionZ: dz,
  };
}

export function impactDroplet(event, index, settings) {
  const a = impactHash(event.rockId, event.crestId, index * 3);
  const b = impactHash(event.rockId, event.crestId, index * 3 + 1);
  const c = impactHash(event.rockId, event.crestId, index * 3 + 2);
  const spread = (a - 0.5) * 1.7;
  const along = settings.horizontalSpeedMin
    + (settings.horizontalSpeedMax - settings.horizontalSpeedMin) * event.intensity * (0.4 + 0.6 * b);
  const up = settings.verticalSpeedMin
    + (settings.verticalSpeedMax - settings.verticalSpeedMin) * event.intensity * (0.45 + 0.55 * c);
  return {
    vx: event.directionX * along - event.directionZ * spread,
    vy: up, vz: event.directionZ * along + event.directionX * spread,
    life: settings.minLifetimeSeconds + (settings.maxLifetimeSeconds - settings.minLifetimeSeconds) * c,
    size: 0.025 + 0.065 * b, opacity: 0.45 + 0.5 * event.intensity,
  };
}

export function impactDecay(previous, dt, lifetime) {
  return previous * Math.exp(-Math.max(0, dt) / lifetime);
}
