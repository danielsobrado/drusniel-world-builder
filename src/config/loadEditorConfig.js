import yaml from 'js-yaml';
import enhancementsSource from '../../config/render-enhancements.yaml?raw';
import { resolveRenderEnhancements } from './RenderEnhancements.js';
import ambientEffectsConfigSource from '../../config/ambient-effects.yaml?raw';
import azgaarGuidanceConfigSource from '../../config/azgaar-guidance.yaml?raw';
import collisionConfigSource from '../../config/collision.yaml?raw';
import culturesConfigSource from '../../config/cultures.yaml?raw';
import configSource from '../../editor.config.yaml?raw';
import explorationConfigSource from '../../config/exploration.yaml?raw';
import { applyMobileStartupProfile } from '../editor/exploration/MobileProfile.js';
import { resolveExplorationConfig } from '../editor/exploration/ExplorationConfig.js';
import terrainMaterialBakeConfigSource from '../../config/terrain-material-bake.yaml?raw';
import waterConfigSource from '../../config/water-domain.yaml?raw';
import waterVisualConfigSource from '../../config/water-visual.yaml?raw';
import weatherEffectsConfigSource from '../../config/weather-effects.yaml?raw';
import { resolveWeatherEffects } from '../editor/weather/WeatherEffectsConfig.js';
import { createCollisionConfig } from '../editor/collision/CollisionConfig.js';
import { registerCollisionConfig } from '../editor/collision/CollisionPlayerBridge.js';
import { createTerrainMaterialBakeConfig } from '../editor/materials/TerrainMaterialBakeConfig.js';
import { resolveSurfaceWetnessConfig } from '../editor/weather/surfaceWetnessConfig.js';
import { resolveAmbientEffectsConfig } from '../editor/stylized/ambient/ambientEffectsConfig.js';
import {
  applyWaterDomainConfig,
  validateWaterDomainConfig,
} from '../editor/water/WaterConfig.js';
import { validateUnderwaterConfig } from '../editor/water/UnderwaterConfig.js';
import {
  applyWaterVisualConfig,
  validateWaterContentConfig,
} from '../editor/water/WaterVisualConfig.js';
import { validateEditorConfig } from './validateEditorConfig.js';
import { validateFarTerrainConfig } from './validateFarTerrainConfig.js';
import { validateImportConfig } from './validateImportConfig.js';
import { validateStylizedLodConfig } from './validateStylizedLodConfig.js';
import { resolveCultureCatalog } from '../sim/config/cultureCatalog.js';

function runtimeSearch() {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function applyRuntimeOverrides(config) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('bakeImpostors') === '1') {
    config.renderer.forceWebGL = true;
  }
}

export function loadEditorConfig() {
  const config = yaml.load(configSource);
  config.simulation ??= {};
  config.simulation.cultureCatalog = resolveCultureCatalog(yaml.load(culturesConfigSource));
  config.stylizedSurface.enhancements = resolveRenderEnhancements(yaml.load(enhancementsSource), runtimeSearch(),
    { mobile: typeof window !== 'undefined' && window.innerWidth < 768 });
  config.exploration = resolveExplorationConfig(yaml.load(explorationConfigSource));
  config.weatherEffects = resolveWeatherEffects(yaml.load(weatherEffectsConfigSource));
  config.stylizedSurface.trees.rootFit = config.exploration.treeRoots;
  config.import.azgaarGuidance = yaml.load(azgaarGuidanceConfigSource);
  config.stylizedSurface.materialBake = createTerrainMaterialBakeConfig(
    yaml.load(terrainMaterialBakeConfigSource),
  );
  config.stylizedSurface.wetness = resolveSurfaceWetnessConfig(config.stylizedSurface.wetness);
  config.stylizedSurface.ambientEffects = resolveAmbientEffectsConfig(
    yaml.load(ambientEffectsConfigSource)?.ambientEffects,
  );
  applyWaterDomainConfig(config, yaml.load(waterConfigSource));
  applyWaterVisualConfig(config, yaml.load(waterVisualConfigSource));
  config.collision = createCollisionConfig(yaml.load(collisionConfigSource), runtimeSearch());
  applyRuntimeOverrides(config);
  applyMobileStartupProfile(config);
  validateEditorConfig(config);
  validateFarTerrainConfig(config.world?.farTerrain);
  validateImportConfig(config);
  validateWaterDomainConfig(config);
  validateUnderwaterConfig(config.player.water.underwater);
  validateWaterContentConfig(config);
  validateStylizedLodConfig(config);
  registerCollisionConfig(config.collision);
  return Object.freeze(config);
}
