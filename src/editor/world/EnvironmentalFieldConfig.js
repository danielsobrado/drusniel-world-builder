const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PATH = 'environmentalFields';

export const DEFAULT_BIOME_ENVIRONMENTAL_PRIOR = Object.freeze({
  temperature: 0.1,
  moisture: 0.45,
  fertility: 0.5,
  geology: 0.45,
});

export const DEFAULT_ENVIRONMENTAL_FIELDS = Object.freeze({
  enabled: true,
  climate: Object.freeze({
    lapseRatePerKm: 0.42,
    solarDirection: Object.freeze([0.35, -0.9367]),
    solarWarmth: 0.16,
    solarDrying: 0.14,
    prevailingWind: Object.freeze([0.8, 0.6]),
    windExposureGain: 0.45,
    concavityMoistureGain: 1.8,
    ridgeSoilLoss: 1.4,
    waterMoistureReachCells: 20,
    waterMoistureGain: 0.26,
    generatorClimateBlend: 0.65,
    variation: Object.freeze({
      macroMeters: 280,
      mesoMeters: 52,
      geologyMeters: 420,
      temperatureSwing: 0.10,
      moistureSwing: 0.15,
      fertilitySwing: 0.18,
    }),
  }),
  ecotone: Object.freeze({
    minRadiusCells: 6,
    maxRadiusCells: 18,
    warpMeters: 36,
    warpReachCells: 9,
    widthScaleMeters: 110,
    snowOutlierStrength: 0.42,
    thermalSteppeSoil: '#968d7d',
  }),
  biomePriors: Object.freeze({
    0: Object.freeze({ temperature: 0.05, moisture: 1.0, fertility: 0.0, geology: 0.5 }),
    1: Object.freeze({ temperature: 0.86, moisture: 0.06, fertility: 0.07, geology: 0.2 }),
    2: Object.freeze({ temperature: -0.26, moisture: 0.14, fertility: 0.18, geology: 0.68 }),
    3: Object.freeze({ temperature: 0.62, moisture: 0.28, fertility: 0.44, geology: 0.3 }),
    4: Object.freeze({ temperature: 0.2, moisture: 0.46, fertility: 0.74, geology: 0.38 }),
    5: Object.freeze({ temperature: 0.58, moisture: 0.64, fertility: 0.78, geology: 0.34 }),
    6: Object.freeze({ temperature: 0.18, moisture: 0.62, fertility: 0.8, geology: 0.44 }),
    7: Object.freeze({ temperature: 0.68, moisture: 0.92, fertility: 0.86, geology: 0.28 }),
    8: Object.freeze({ temperature: 0.14, moisture: 0.88, fertility: 0.84, geology: 0.48 }),
    9: Object.freeze({ temperature: -0.42, moisture: 0.52, fertility: 0.46, geology: 0.62 }),
    10: Object.freeze({ temperature: -0.68, moisture: 0.38, fertility: 0.22, geology: 0.76 }),
    11: Object.freeze({ temperature: -0.94, moisture: 0.62, fertility: 0.02, geology: 0.9 }),
    12: Object.freeze({ temperature: 0.12, moisture: 0.94, fertility: 0.76, geology: 0.16 }),
  }),
});

function fail(path, message) {
  throw new Error(`Invalid environmental field configuration: ${path} ${message}.`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function inRange(value, path, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(path, `must be within [${min}, ${max}]`);
  }
  return value;
}

function positive(value, path) {
  if (!Number.isFinite(value) || value <= 0) {
    fail(path, 'must be positive');
  }
  return value;
}

function unitVector2(value, path) {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(path, 'must be a 2-element vector');
  }
  const x = Number(value[0]);
  const z = Number(value[1]);
  const length = Math.hypot(x, z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || length <= 1e-6) {
    fail(path, 'must be a non-zero finite 2-element vector');
  }
  return Object.freeze([x / length, z / length]);
}

function resolveBiomePrior(row, path) {
  if (!isRecord(row)) fail(path, 'must be an object');
  return Object.freeze({
    temperature: inRange(row.temperature, `${path}.temperature`, -1, 1),
    moisture: inRange(row.moisture, `${path}.moisture`, 0, 1),
    fertility: inRange(row.fertility, `${path}.fertility`, 0, 1),
    geology: inRange(row.geology, `${path}.geology`, 0, 1),
  });
}

function resolveBiomePriors(rawPriors) {
  const source = rawPriors === undefined ? DEFAULT_ENVIRONMENTAL_FIELDS.biomePriors : rawPriors;
  if (!isRecord(source)) fail(`${PATH}.biomePriors`, 'must be an object');
  const priors = {};
  for (const [key, row] of Object.entries(source)) {
    const id = Number(key);
    const valid = Number.isInteger(id) && ((id >= 0 && id <= 12) || (id >= 32 && id <= 254));
    if (!/^\d+$/.test(key) || !valid) {
      fail(`${PATH}.biomePriors.${key}`, 'must use a valid terrain tile id (0–12 or 32–254)');
    }
    priors[id] = resolveBiomePrior(row, `${PATH}.biomePriors.${key}`);
  }
  for (let id = 0; id <= 12; id += 1) {
    if (!priors[id]) {
      priors[id] = DEFAULT_ENVIRONMENTAL_FIELDS.biomePriors[id];
    }
  }
  return Object.freeze(priors);
}

/**
 * Resolves and validates `config/environmental-fields.yaml` plus the `?envField=0|1`
 * A/B query switch.
 */
export function resolveEnvironmentalFieldConfig(source, search = '') {
  if (source !== undefined && !isRecord(source)) {
    fail(PATH, 'must be an object');
  }
  const raw = source ?? {};
  const defaults = DEFAULT_ENVIRONMENTAL_FIELDS;
  let enabled = raw.enabled === undefined ? defaults.enabled : raw.enabled;
  if (typeof enabled !== 'boolean') fail(`${PATH}.enabled`, 'must be boolean');

  if (typeof search === 'string' && search.length > 0) {
    const flag = new URLSearchParams(search).get('envField');
    if (flag === '0') enabled = false;
    else if (flag === '1') enabled = true;
  }

  const rawClimate = raw.climate ?? {};
  if (!isRecord(rawClimate)) fail(`${PATH}.climate`, 'must be an object');
  const rawVar = rawClimate.variation ?? {};
  if (!isRecord(rawVar)) fail(`${PATH}.climate.variation`, 'must be an object');

  const climate = Object.freeze({
    lapseRatePerKm: inRange(rawClimate.lapseRatePerKm ?? defaults.climate.lapseRatePerKm, `${PATH}.climate.lapseRatePerKm`, 0, 3),
    solarDirection: unitVector2(rawClimate.solarDirection ?? defaults.climate.solarDirection, `${PATH}.climate.solarDirection`),
    solarWarmth: inRange(rawClimate.solarWarmth ?? defaults.climate.solarWarmth, `${PATH}.climate.solarWarmth`, 0, 1),
    solarDrying: inRange(rawClimate.solarDrying ?? defaults.climate.solarDrying, `${PATH}.climate.solarDrying`, 0, 1),
    prevailingWind: unitVector2(rawClimate.prevailingWind ?? defaults.climate.prevailingWind, `${PATH}.climate.prevailingWind`),
    windExposureGain: inRange(rawClimate.windExposureGain ?? defaults.climate.windExposureGain, `${PATH}.climate.windExposureGain`, 0, 2),
    concavityMoistureGain: inRange(rawClimate.concavityMoistureGain ?? defaults.climate.concavityMoistureGain, `${PATH}.climate.concavityMoistureGain`, 0, 10),
    ridgeSoilLoss: inRange(rawClimate.ridgeSoilLoss ?? defaults.climate.ridgeSoilLoss, `${PATH}.climate.ridgeSoilLoss`, 0, 10),
    waterMoistureReachCells: inRange(rawClimate.waterMoistureReachCells ?? defaults.climate.waterMoistureReachCells, `${PATH}.climate.waterMoistureReachCells`, 1, 64),
    waterMoistureGain: inRange(rawClimate.waterMoistureGain ?? defaults.climate.waterMoistureGain, `${PATH}.climate.waterMoistureGain`, 0, 1),
    generatorClimateBlend: inRange(rawClimate.generatorClimateBlend ?? defaults.climate.generatorClimateBlend, `${PATH}.climate.generatorClimateBlend`, 0, 1),
    variation: Object.freeze({
      macroMeters: positive(rawVar.macroMeters ?? defaults.climate.variation.macroMeters, `${PATH}.climate.variation.macroMeters`),
      mesoMeters: positive(rawVar.mesoMeters ?? defaults.climate.variation.mesoMeters, `${PATH}.climate.variation.mesoMeters`),
      geologyMeters: positive(rawVar.geologyMeters ?? defaults.climate.variation.geologyMeters, `${PATH}.climate.variation.geologyMeters`),
      temperatureSwing: inRange(rawVar.temperatureSwing ?? defaults.climate.variation.temperatureSwing, `${PATH}.climate.variation.temperatureSwing`, 0, 0.5),
      moistureSwing: inRange(rawVar.moistureSwing ?? defaults.climate.variation.moistureSwing, `${PATH}.climate.variation.moistureSwing`, 0, 0.5),
      fertilitySwing: inRange(rawVar.fertilitySwing ?? defaults.climate.variation.fertilitySwing, `${PATH}.climate.variation.fertilitySwing`, 0, 0.5),
    }),
  });

  const rawEcotone = raw.ecotone ?? {};
  if (!isRecord(rawEcotone)) fail(`${PATH}.ecotone`, 'must be an object');
  const minRadiusCells = rawEcotone.minRadiusCells ?? defaults.ecotone.minRadiusCells;
  const maxRadiusCells = rawEcotone.maxRadiusCells ?? defaults.ecotone.maxRadiusCells;
  if (!Number.isInteger(minRadiusCells) || minRadiusCells < 1 || minRadiusCells > 28) {
    fail(`${PATH}.ecotone.minRadiusCells`, 'must be an integer within [1, 28]');
  }
  if (!Number.isInteger(maxRadiusCells) || maxRadiusCells < minRadiusCells || maxRadiusCells > 28) {
    fail(`${PATH}.ecotone.maxRadiusCells`, 'must be an integer within [minRadiusCells, 28]');
  }
  const thermalSteppeSoil = rawEcotone.thermalSteppeSoil ?? defaults.ecotone.thermalSteppeSoil;
  if (typeof thermalSteppeSoil !== 'string' || !HEX_COLOR.test(thermalSteppeSoil)) {
    fail(`${PATH}.ecotone.thermalSteppeSoil`, 'must be a #rrggbb colour');
  }
  const ecotone = Object.freeze({
    minRadiusCells,
    maxRadiusCells,
    warpMeters: positive(rawEcotone.warpMeters ?? defaults.ecotone.warpMeters, `${PATH}.ecotone.warpMeters`),
    warpReachCells: inRange(rawEcotone.warpReachCells ?? defaults.ecotone.warpReachCells, `${PATH}.ecotone.warpReachCells`, 0, 20),
    widthScaleMeters: positive(rawEcotone.widthScaleMeters ?? defaults.ecotone.widthScaleMeters, `${PATH}.ecotone.widthScaleMeters`),
    snowOutlierStrength: inRange(rawEcotone.snowOutlierStrength ?? defaults.ecotone.snowOutlierStrength, `${PATH}.ecotone.snowOutlierStrength`, 0, 1),
    thermalSteppeSoil,
  });

  return Object.freeze({
    enabled,
    climate,
    ecotone,
    biomePriors: resolveBiomePriors(raw.biomePriors),
  });
}

/**
 * Returns a biome's environmental prior, inferring sensible defaults for custom
 * biomes (32–254) from `biomeLooks` metadata when no explicit prior exists.
 */
export function resolveBiomePriorForTile(tileId, envConfig, biomeLooks = null) {
  const explicit = envConfig?.biomePriors?.[tileId];
  if (explicit) return explicit;
  const aridSand = biomeLooks?.arid?.sand?.includes?.(tileId);
  const aridMineral = biomeLooks?.arid?.mineral?.includes?.(tileId);
  const snowGround = biomeLooks?.snow?.ground?.[tileId] ?? 0;
  const glacier = biomeLooks?.glacier?.[tileId] ?? 0;
  if (aridSand) return { temperature: 0.72, moisture: 0.08, fertility: 0.1, geology: 0.25 };
  if (aridMineral) return { temperature: -0.25, moisture: 0.14, fertility: 0.18, geology: 0.7 };
  if (glacier > 0.3 || snowGround > 0.7) return { temperature: -0.75, moisture: 0.45, fertility: 0.14, geology: 0.8 };
  if (snowGround > 0.1) return { temperature: -0.35, moisture: 0.45, fertility: 0.35, geology: 0.6 };
  return DEFAULT_BIOME_ENVIRONMENTAL_PRIOR;
}
