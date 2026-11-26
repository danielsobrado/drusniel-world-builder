export {
  GroundContactField as WorldSurfaceContextField,
  buildBiomeSoilPalette,
} from '../groundContact/GroundContactField.js';
export {
  WSC_BORDER_FADE_M,
  WSC_DEFAULT_ROUGHNESS_BYTE,
  WSC_RESOLUTION,
  WSC_SPAN_M,
  clearWorldSurfaceContext,
  sampleWorldSurfaceContextAt,
  sampleWorldSurfaceContextCpu,
  sampleWorldSurfaceContextVarying,
  wscBaseTexture,
  wscEcoTexture,
  wscGeoTexture,
  wscUniforms,
} from './WorldSurfaceContextState.js';
export {
  TERRAIN_SURFACE_CONSTANTS,
  bilinearTexelCoords,
  createTerrainSurfaceEvaluator,
  resolveTerrainWorldNoiseMean,
  sampleMaterialBakeChannels,
  sampleRgba8Bilinear,
  srgbByteToLinear,
} from './TerrainSurfaceEvaluator.js';
