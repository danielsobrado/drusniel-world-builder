import { WATER_QUALITY_LOW } from '../water/WaterQuality.js';

/** Use the world material graphs that fit WebGL2's 16 fragment texture units. */
export function terrainRendererProfile(config, rendererConfig) {
  if (!rendererConfig.forceWebGL) return config;
  return {
    ...config,
    materialBake: config.materialBake && { ...config.materialBake, enabled: false },
    water: config.water && {
      ...config.water,
      qualityTier: WATER_QUALITY_LOW,
      coast: { ...config.water.coast, enabled: false },
    },
    ambientEffects: config.ambientEffects && {
      ...config.ambientEffects,
      snowStreaks: { ...config.ambientEffects.snowStreaks, enabled: false },
      sandStreaks: { ...config.ambientEffects.sandStreaks, enabled: false },
    },
  };
}
