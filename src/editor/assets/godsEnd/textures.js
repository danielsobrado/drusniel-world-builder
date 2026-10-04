/** Standalone donor generators. Factories return caller-owned textures. */
export { SURFACE_NAMES, TEXTURE_METRES, generateSurfaceData } from './houseTextureData.js';
export { createHouseSurfaceTextures } from './houseSurfaces.js';
export { LEAF_PALETTES, paintLeaf, createLeafTexture } from './leafTextures.js';
export { createGrassAtlasTexture } from './grassAtlas.js';
export { createBarrierNoise } from './barrierNoise.js';
export { createSeaDetailTexture, SEA_DETAIL_SLOPE_RANGE, SEA_DETAIL_MOMENT_SCALE } from './seaDetail.js';
export { createWaterDetailTexture } from '../../stylized/RiverSurfaceShading.js';
export { createWaterfallStrandPixels } from '../../stylized/waterfallStrandTexture.js';
export { createSprayPuffPixels } from '../../stylized/mist/sprayPuffTexture.js';
export { createScaleTileData, createSerpentPatternData } from '../../wildlife/serpentSkin.js';
export { acquireSnowTextures } from './snowTextures.js';
