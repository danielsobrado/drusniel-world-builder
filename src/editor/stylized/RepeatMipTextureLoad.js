import { float, floor, fract, int, length, max, mix, texture, textureSize, vec2 } from 'three/tsl';

/** Repeat-wrapped trilinear filtering without consuming a WebGPU sampler binding. */
export function repeatMipTextureLoad(map, point, dx, dy) {
  const handle = texture(map).setSampler(false);
  const baseSize = vec2(textureSize(handle));
  const maxLevel = baseSize.x.max(baseSize.y).log2().floor();
  const level = max(length(dx.mul(baseSize)), length(dy.mul(baseSize)))
    .max(1).log2().clamp(0, maxLevel);
  const low = floor(level);
  const high = low.add(1).min(maxLevel);
  const bilinear = (lod) => {
    const size = vec2(textureSize(handle, int(lod)));
    const texel = fract(point).mul(size).sub(0.5);
    const base = floor(texel);
    const weight = fract(texel);
    const load = (x, y) => texture(map, base.add(vec2(x, y)).mod(size))
      .setSampler(false).level(lod);
    return mix(mix(load(0, 0), load(1, 0), weight.x),
      mix(load(0, 1), load(1, 1), weight.x), weight.y);
  };
  return mix(bilinear(low), bilinear(high), level.sub(low).clamp(float(0), float(1)));
}
