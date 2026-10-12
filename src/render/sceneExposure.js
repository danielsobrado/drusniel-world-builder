/**
 * A scale on the configured exposure that the world's look may set, the way
 * a camera stops down for a bright snowfield (snowCountryLook). It reaches
 * both output paths: the base renderer's `toneMappingExposure` (written by the
 * sky) and the post-processing graph's tone mapping, which owns the output
 * while it runs and reads the scale here every frame.
 */
export const sceneExposure = { scale: 1 };

/** The post graph's tone-mapping settings with the scene's exposure scale applied. */
export function scaledToneMapping(toneMapping) {
  if (sceneExposure.scale === 1) return toneMapping;
  return { ...toneMapping, exposure: (toneMapping?.exposure ?? 1) * sceneExposure.scale };
}
