import { assignParticleMaterialData } from '../../render/postprocessing/PostProcessingMaterialData.js';

/** Preserve the renderer's normal, velocity and material outputs in MRT passes. */
export function assignWeatherNodeOutput(material, rgba) {
  const weatherColor = rgba.toVar();
  material.colorNode = weatherColor.rgb;
  material.opacityNode = weatherColor.a;
  return assignParticleMaterialData(material);
}
