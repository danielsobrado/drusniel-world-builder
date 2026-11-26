/**
 * Backwards-compatible GroundContact facade over World Surface Context (WSC).
 *
 * Existing consumers (`meadowPigment`, `meadowBladeShape`, `StylizedFlowerMaterial`,
 * `barkWeathering`, `rockWeathering`, `AlpineRockMaterial`, `AuthoredFoliageMaterial`,
 * `BushRenderAssets`, `biomeUnderstoryPrototypes`, `GroundContactDeformer`) continue to
 * import from this module with identical semantics — while automatically gaining
 * PR 1's explicit per-texel validity and validity-weighted bilinear sampling.
 */
export {
  WSC_RESOLUTION as GROUND_CONTACT_RESOLUTION,
  WSC_SPAN_M as GROUND_CONTACT_SPAN_M,
  wscGeoTexture as groundContactGeoTexture,
  wscBaseTexture as groundContactSoilTexture,
  wscEcoTexture as groundContactEcoTexture,
  wscUniforms as groundContactUniforms,
  clearWorldSurfaceContext as clearGroundContactField,
  sampleWorldSurfaceContextAt as sampleGroundContactAt,
  sampleWorldSurfaceContextVarying as sampleGroundContactVarying,
  sampleWorldSurfaceContextCpu as sampleGroundContactCpu,
} from '../worldSurfaceContext/WorldSurfaceContextState.js';
