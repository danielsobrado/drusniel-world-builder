/** Keep the full terrain graph within WebGL's fragment texture-unit budget. */
export function terrainRendererProfile(config, rendererConfig) {
  if (!rendererConfig.forceWebGL || !config.materialBake?.enabled) return config;
  // WebGPU permits textureLoad-only inputs beyond its sampler limit. WebGL
  // counts those as texture units too. Use the existing procedural fallback
  // rather than binding seven bake maps plus the family atlas and snow detail.
  return { ...config, materialBake: { ...config.materialBake, enabled: false } };
}
