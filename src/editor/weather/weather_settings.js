import * as THREE from "three";
function clampStormWeatherSettings(settings) {
  return {
    enabled: settings.enabled,
    intensity: THREE.MathUtils.clamp(settings.intensity, 0, 1.6)
  };
}
function isWeatherVisible(settings) {
  return settings.enabled && settings.intensity > 1e-3;
}
function applyStormWeatherToMaterials(settings, materials) {
  for (const material of materials) material.setIntensity(settings.intensity);
}
export {
  applyStormWeatherToMaterials,
  clampStormWeatherSettings,
  isWeatherVisible
};
