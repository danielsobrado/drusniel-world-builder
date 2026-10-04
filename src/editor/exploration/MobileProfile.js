import { isTouchPrimary } from '../player/touchInput.js';
import { applyPostProcessingPreset } from '../../render/postprocessing/PostProcessingPresets.js';

export function usesMobileProfile(settings, runtime = globalThis) {
  const shortSide = Math.min(runtime.innerWidth ?? Infinity, runtime.innerHeight ?? Infinity);
  return settings.enabled && shortSide <= settings.maxShortSide
    && (!settings.requireCoarsePointer || isTouchPrimary(runtime));
}

export function applyMobileStartupProfile(config, runtime = globalThis) {
  if (!usesMobileProfile(config.exploration.mobile, runtime)) return;
  config.renderer.maxPixelRatio = Math.min(config.renderer.maxPixelRatio, config.exploration.mobile.pixelRatioCap);
  config.stylizedSurface.postProcessing = applyPostProcessingPreset(config.exploration.mobile.initialQuality,
    config.stylizedSurface.postProcessing);
}
