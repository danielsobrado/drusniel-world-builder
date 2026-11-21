import * as THREE from 'three/webgpu';
import { clamp, dFdx, dFdy, float, floor, int, length, log2, max, mix, texture, uniform, uniformArray, vec2 } from 'three/tsl';
import { mipLevelCount, unresolvedSlopeVariance } from './OceanFftFiltering.js';

/**
 * Shared shader-side view of the FFT output (PR I phase I.3): one per surface
 * view, bound by every water slot's material; the per-slot input is only the
 * cascade UV origin (OceanFftCoordinates). Not yet sampled by the water material
 * — I.4 calls `sampleOceanFftSlope` inside the sea detail slope.
 *
 * The texture node never points at a missing, half-written or disposed texture:
 * until the runtime publishes, and after it fails, it holds a 1×1 zero array
 * texture and `available` is 0. Swapping the value keeps the binding layout
 * (2D-array, filterable float), so it never recompiles a material.
 */
export class OceanFftBinding {
  constructor({ size, tileSizes }) {
    // One vec4 per slot carries the origins: two cascades at most.
    if (tileSizes.length < 1 || tileSizes.length > 2) throw new RangeError('ocean fft: the binding supports 1–2 cascades.');
    this.size = size;
    this.tileSizes = Object.freeze([...tileSizes]);
    this.levels = mipLevelCount(size);
    this.fallback = createFallbackTexture(tileSizes.length);
    this.texture = texture(this.fallback);
    this.available = uniform(0).setName('oceanFftAvailable');
    this.unresolved = uniformArray(new Array(tileSizes.length * this.levels).fill(0), 'float').setName('oceanFftUnresolvedSlope');
    this.generation = -1;
  }

  /** Point the shared texture at the runtime's completed output, or back at the fallback. */
  update(output) {
    const ready = !!output && output.size === this.size && output.tileSizes.length === this.tileSizes.length;
    this.texture.value = ready ? output.texture : this.fallback;
    this.available.value = ready ? 1 : 0;
    this.generation = ready ? output.generation : -1;
  }

  /** Per-level unresolved slope variance of each cascade's spectrum (OceanFftFiltering). */
  setSpectra(spectra) {
    const values = this.unresolved.array;
    spectra.forEach((spectrum, c) => {
      unresolvedSlopeVariance({ size: this.size, deltaK: spectrum.deltaK, power: spectrum.power })
        .forEach((value, level) => { values[c * this.levels + level] = value; });
    });
  }

  dispose() {
    this.update(null);
    this.fallback.dispose();
  }
}

function createFallbackTexture(layers) {
  const fallback = new THREE.DataArrayTexture(new Uint16Array(2 * layers), 1, 1, layers);
  fallback.format = THREE.RGFormat;
  fallback.type = THREE.HalfFloatType;
  fallback.colorSpace = THREE.NoColorSpace;
  fallback.wrapS = fallback.wrapT = THREE.RepeatWrapping;
  fallback.magFilter = THREE.LinearFilter;
  fallback.minFilter = THREE.LinearFilter;
  fallback.generateMipmaps = false;
  fallback.name = 'ocean-fft-slope-fallback';
  fallback.needsUpdate = true;
  return fallback;
}

/**
 * Pixel footprint in metres: the longer screen-space step of chunk-local metres,
 * so grazing views (stretched footprint) filter on their long axis — the sea
 * goes rough, not glittery, toward the horizon. Fragment stage only.
 */
export function pixelFootprint(localXZ) {
  return max(length(dFdx(localXZ)), length(dFdy(localXZ)));
}

/**
 * Summed FFT slope (∂H/∂x, ∂H/∂z, world axes) and the slope variance its mips
 * could not show, at chunk-local metres `localXZ` of a chunk whose per-slot
 * cascade origins are `origin` (vec4: u0, v0, u1, v1). `lod` overrides the
 * footprint LOD (QA, compute). Callers weight it by `binding.available`.
 * `lods` is each cascade's mip level (debug views).
 */
export function sampleOceanFftSlope(binding, { origin, localXZ, footprint = null, lod = null }) {
  const reach = footprint ?? (lod === null ? pixelFootprint(localXZ) : null);
  const maxLevel = binding.levels - 1;
  let slope = vec2(0), unresolved = float(0);
  const lods = [];
  binding.tileSizes.forEach((tile, c) => {
    const texel = tile / binding.size;
    const level = lod === null
      ? clamp(log2(max(reach, texel).div(texel)), 0, maxLevel).toVar(`oceanFftLod${c}`)
      : float(lod);
    lods.push(level);
    const cascadeOrigin = c === 0 ? origin.xy : origin.zw;
    // No fract(): the repeat sampler wraps, and continuous UVs keep derivatives seam-free.
    const uv = cascadeOrigin.add(localXZ.div(tile));
    slope = slope.add(binding.texture.sample(uv).depth(int(c)).level(level).xy);
    const low = floor(level), base = c * binding.levels;
    const lower = binding.unresolved.element(int(low).add(base));
    const upper = binding.unresolved.element(int(low).add(1).min(maxLevel).add(base));
    unresolved = unresolved.add(mix(lower, upper, level.sub(low)));
  });
  return { slope, unresolved, lods };
}
