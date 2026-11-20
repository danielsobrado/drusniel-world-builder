import { SEA_SWELL_COMPONENTS } from './SeaSwell.js';
import { seaExposure } from './WaterAppearance.js';
import { WATER_KIND_OCEAN } from './WaterConstants.js';

const RAY_WEIGHTS = Object.freeze([0.12, 0.22, 0.32, 0.22, 0.12]);
const MAX_CACHE_POINTS = 2048;

export const SEA_DIFFRACTION_DEFAULTS = Object.freeze({
  enabled: false,
  latticeStepMeters: 16,
  rayStepMeters: 10,
  rayReachMeters: 80,
  angularSpreadRadians: 0.42,
  minimumTransmission: 0.22,
  offshoreFadeStartMeters: 40,
  offshoreFadeEndMeters: 90,
  phaseLagMeters: 3,
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const smoothstep = (start, end, value) => {
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
};

export function resolveSeaDiffraction(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('water.sea.surf.diffraction must be an object.');
  }
  const settings = { ...SEA_DIFFRACTION_DEFAULTS, ...source };
  if (typeof settings.enabled !== 'boolean') {
    throw new TypeError('water.sea.surf.diffraction.enabled must be boolean.');
  }
  const ranges = {
    latticeStepMeters: [4, 64], rayStepMeters: [2, 32],
    rayReachMeters: [20, 160], angularSpreadRadians: [0, 0.8],
    minimumTransmission: [0.05, 1], offshoreFadeStartMeters: [0, 150],
    offshoreFadeEndMeters: [10, 250], phaseLagMeters: [0, 10],
  };
  for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
    const value = settings[key];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new RangeError(`water.sea.surf.diffraction.${key} must be within [${minimum}, ${maximum}].`);
    }
  }
  if (settings.rayStepMeters > settings.rayReachMeters
      || settings.offshoreFadeStartMeters >= settings.offshoreFadeEndMeters) {
    throw new RangeError('water.sea.surf.diffraction reach and offshore fade ranges must increase.');
  }
  return Object.freeze(settings);
}

/** Tile edits can affect any ray from the four surrounding lattice points. */
export function seaDiffractionTileHalo(settings, tileSizeMeters) {
  if (!settings?.enabled) return 0;
  const reach = settings.rayReachMeters ?? SEA_DIFFRACTION_DEFAULTS.rayReachMeters;
  const step = settings.latticeStepMeters ?? SEA_DIFFRACTION_DEFAULTS.latticeStepMeters;
  return Math.ceil((reach + step) / tileSizeMeters);
}

function isOcean(sample) {
  return sample?.kind === WATER_KIND_OCEAN && sample.coverage > 0.5;
}

/**
 * Fixed incident-direction visibility from the dominant swell.
 * Angular probes produce soft diffraction at headlands without a GPU ray march.
 */
export function createSeaDiffractionSampler({ sampleWater, tileSizeMeters, settings }) {
  if (typeof sampleWater !== 'function') throw new TypeError('Sea diffraction needs a water sampler.');
  if (!Number.isFinite(tileSizeMeters) || tileSizeMeters <= 0) {
    throw new RangeError('Sea diffraction tileSizeMeters must be positive.');
  }
  const config = resolveSeaDiffraction(settings);
  if (!config.enabled) return () => 1;

  const wave = SEA_SWELL_COMPONENTS[0];
  const reach = config.rayReachMeters;
  const steps = Math.ceil(reach / config.rayStepMeters);
  const directions = RAY_WEIGHTS.map((weight, index) => {
    const angle = (index - 2) * config.angularSpreadRadians / 2;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    return { x: wave.x * cosine - wave.z * sine,
      z: wave.x * sine + wave.z * cosine, weight };
  });
  const cache = new Map();
  const visibilityAt = (gridX, gridZ) => {
    const key = `${gridX}:${gridZ}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const x = gridX * config.latticeStepMeters / tileSizeMeters;
    const z = -gridZ * config.latticeStepMeters / tileSizeMeters;
    let visible = 0;
    for (const direction of directions) {
      let blocked = false;
      for (let step = 1; step <= steps; step++) {
        const distance = Math.min(reach, step * config.rayStepMeters) / tileSizeMeters;
        if (!isOcean(sampleWater(x + direction.x * distance, z - direction.z * distance))) {
          blocked = true;
          break;
        }
      }
      if (!blocked) visible += direction.weight;
    }
    const transmission = config.minimumTransmission
      + (1 - config.minimumTransmission) * Math.min(1, visible + 1e-12);
    if (cache.size >= MAX_CACHE_POINTS) cache.clear();
    cache.set(key, transmission);
    return transmission;
  };

  return (cellX, cellZ, shoreDistance = 0) => {
    if (!Number.isFinite(cellX) || !Number.isFinite(cellZ)) {
      throw new RangeError('Sea diffraction coordinates must be finite.');
    }
    if (shoreDistance >= config.offshoreFadeEndMeters) return 1;
    const x = cellX * tileSizeMeters / config.latticeStepMeters;
    const z = -cellZ * tileSizeMeters / config.latticeStepMeters;
    const ix = Math.floor(x), iz = Math.floor(z);
    const tx = smoothstep(0, 1, x - ix), tz = smoothstep(0, 1, z - iz);
    const north = visibilityAt(ix, iz) * (1 - tx) + visibilityAt(ix + 1, iz) * tx;
    const south = visibilityAt(ix, iz + 1) * (1 - tx) + visibilityAt(ix + 1, iz + 1) * tx;
    const transmission = north * (1 - tz) + south * tz;
    return transmission + (1 - transmission)
      * smoothstep(config.offshoreFadeStartMeters, config.offshoreFadeEndMeters,
        Math.max(0, shoreDistance));
  };
}

/** The shadow's additional optical path delays crests behind a headland. */
export function seaDiffractionPhaseDelay(exposure, shoreDistance, waveNumber, settings) {
  if (!settings?.enabled) return 0;
  const reference = seaExposure(shoreDistance);
  const transmission = clamp(exposure / reference, 0, 1);
  return (transmission - 1) * settings.phaseLagMeters * waveNumber;
}
