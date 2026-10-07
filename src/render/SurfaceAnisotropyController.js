import { NearestMipmapNearestFilter, NearestMipmapLinearFilter,
  LinearMipmapNearestFilter, LinearMipmapLinearFilter, UnsignedByteType } from 'three/webgpu';
const MIP_FILTERS = new Set([NearestMipmapNearestFilter, NearestMipmapLinearFilter,
  LinearMipmapNearestFilter, LinearMipmapLinearFilter]);

export function resolveSurfaceAnisotropy(source = {}, maximum = 16) {
  const requested = Number(source.level ?? 16);
  return source.enabled === false ? 1 : Math.max(1, Math.min(
    Number.isFinite(requested) ? Math.round(requested) : 16, maximum, 16,
  ));
}

export function isSurfaceTexture(texture) {
  if (!texture?.isTexture || texture.isRenderTargetTexture || texture.isDepthTexture
    || texture.isDataArrayTexture || texture.isData3DTexture || !MIP_FILTERS.has(texture.minFilter)) return false;
  // Height, mask and material-bake fields must retain textureLoad/nearest
  // semantics and non-filtering bindings. Packed byte detail maps are eligible.
  if (texture.isDataTexture && texture.type !== UnsignedByteType) return false;
  return texture.generateMipmaps || texture.mipmaps?.length > 1 || texture.isCompressedTexture;
}

/** Donor policy applied as each streamed material compiles, including TSL maps. */
export function installSurfaceAnisotropy(renderer, settings = {}) {
  const previous = renderer.debug.onNodeBuilderCreated;
  const apply = builder => {
    const level = resolveSurfaceAnisotropy(settings, renderer.getMaxAnisotropy());
    const textures = new Set();
    for (const value of Object.values(builder.material ?? {})) if (value?.isTexture) textures.add(value);
    for (const uniforms of Object.values(builder.uniforms ?? {})) {
      if (!Array.isArray(uniforms)) continue;
      for (const entry of uniforms) if (entry.node?.value?.isTexture) textures.add(entry.node.value);
    }
    for (const texture of textures) {
      if (!isSurfaceTexture(texture) || texture.anisotropy === level) continue;
      texture.anisotropy = level;
      texture.needsUpdate = true;
    }
  };
  const hook = (builder, target) => {
    previous?.(builder, target);
    const build = builder.build, buildAsync = builder.buildAsync;
    const restore = () => { builder.build = build; if (buildAsync) builder.buildAsync = buildAsync; };
    builder.build = function (...args) {
      restore(); const result = build.apply(this, args); apply(this); return result;
    };
    if (buildAsync) builder.buildAsync = async function (...args) {
      restore(); const result = await buildAsync.apply(this, args); apply(this); return result;
    };
  };
  renderer.debug.onNodeBuilderCreated = hook;
  return { dispose() { if (renderer.debug.onNodeBuilderCreated === hook) renderer.debug.onNodeBuilderCreated = previous; } };
}
