import * as THREE from 'three/webgpu';
import {
  float,
  max,
  oneMinus,
  smoothstep,
  sqrt,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { bilinearLoad } from '../../materials/TerrainSlotBindings.js';
import { frameUniform } from '../../../render/FrameUniforms.js';

/**
 * Shared camera-centred GPU ground-contact field (`1 m` texels over `128 m`).
 *
 * Supplies every nearby scattered material (grass blades, flowers, trees, rocks,
 * alpine crags, bushes, and ground details) with exact local ground elevation,
 * terrain normal, contact AO, canopy shade, and biome-matched soil/litter colour
 * purely in shaders — with zero GPU readbacks, zero sampler bindings (`bilinearLoad`
 * uses `textureLoad`), and zero extra vertex buffers.
 *
 * Texel layouts:
 * - `groundContactGeoTexture` (`RGBA16F`): R = height - baseHeight (m),
 *   G = terrain normal X, B = terrain normal Z, A = contactShade (0..1).
 * - `groundContactSoilTexture` (`RGBA8`, `NoColorSpace`): RGB = sqrt(linearSoil),
 *   A = canopyShade (0..1).
 */
export const GROUND_CONTACT_RESOLUTION = 128;
export const GROUND_CONTACT_SPAN_M = 128;
const BORDER_FADE_M = 12;

const geoPixels = new Uint16Array(GROUND_CONTACT_RESOLUTION * GROUND_CONTACT_RESOLUTION * 4);
const soilPixels = new Uint8Array(GROUND_CONTACT_RESOLUTION * GROUND_CONTACT_RESOLUTION * 4);

export const groundContactGeoTexture = new THREE.DataTexture(
  geoPixels,
  GROUND_CONTACT_RESOLUTION,
  GROUND_CONTACT_RESOLUTION,
  THREE.RGBAFormat,
  THREE.HalfFloatType,
);
groundContactGeoTexture.name = 'ground-contact-geo';
groundContactGeoTexture.colorSpace = THREE.NoColorSpace;
groundContactGeoTexture.minFilter = THREE.LinearFilter;
groundContactGeoTexture.magFilter = THREE.LinearFilter;
groundContactGeoTexture.wrapS = THREE.ClampToEdgeWrapping;
groundContactGeoTexture.wrapT = THREE.ClampToEdgeWrapping;
groundContactGeoTexture.generateMipmaps = false;
groundContactGeoTexture.needsUpdate = true;

export const groundContactSoilTexture = new THREE.DataTexture(
  soilPixels,
  GROUND_CONTACT_RESOLUTION,
  GROUND_CONTACT_RESOLUTION,
  THREE.RGBAFormat,
  THREE.UnsignedByteType,
);
groundContactSoilTexture.name = 'ground-contact-soil';
groundContactSoilTexture.colorSpace = THREE.NoColorSpace;
groundContactSoilTexture.minFilter = THREE.LinearFilter;
groundContactSoilTexture.magFilter = THREE.LinearFilter;
groundContactSoilTexture.wrapS = THREE.ClampToEdgeWrapping;
groundContactSoilTexture.wrapT = THREE.ClampToEdgeWrapping;
groundContactSoilTexture.generateMipmaps = false;
groundContactSoilTexture.needsUpdate = true;

export const groundContactUniforms = Object.freeze({
  /** Render-space minimum (x, z) corner of the field window. */
  renderOrigin: frameUniform(new THREE.Vector2()),
  /** Canonical minimum (x, z) corner (snapped to whole metres). */
  canonicalOrigin: frameUniform(new THREE.Vector2()),
  inverseSpan: frameUniform(1 / GROUND_CONTACT_SPAN_M),
  fadeFraction: frameUniform(BORDER_FADE_M / GROUND_CONTACT_SPAN_M),
  baseHeight: frameUniform(0),
  /** 0 until populated: every shader reader falls back cleanly to its defaults. */
  active: frameUniform(0),
});

export function clearGroundContactField() {
  groundContactGeoTexture.image.data.fill(0);
  groundContactSoilTexture.image.data.fill(0);
  groundContactGeoTexture.needsUpdate = true;
  groundContactSoilTexture.needsUpdate = true;
  groundContactUniforms.baseHeight.value = 0;
  groundContactUniforms.active.value = 0;
}

function reconstructNormal(nx, nz, inside) {
  const bx = nx.mul(inside);
  const bz = nz.mul(inside);
  const ny = sqrt(max(float(0.01), float(1).sub(bx.mul(bx)).sub(bz.mul(bz))));
  return vec3(bx, ny, bz);
}

/**
 * Samples the ground-contact field at an XZ coordinate (vertex or fragment stage).
 * Uses `bilinearLoad` (`textureLoad`), so it consumes zero WebGPU samplers.
 *
 * @param {object} xzNode TSL `vec2` in render space (default) or canonical metres
 * @param {{ canonical?: boolean }} [options]
 */
export function sampleGroundContactAt(xzNode, { canonical = false } = {}) {
  const origin = canonical ? groundContactUniforms.canonicalOrigin : groundContactUniforms.renderOrigin;
  const uv = xzNode.sub(origin).mul(groundContactUniforms.inverseSpan);
  const fade = groundContactUniforms.fadeFraction;
  const inside = smoothstep(0, fade, uv.x)
    .mul(smoothstep(0, fade, uv.y))
    .mul(oneMinus(smoothstep(oneMinus(fade), 1, uv.x)))
    .mul(oneMinus(smoothstep(oneMinus(fade), 1, uv.y)))
    .mul(groundContactUniforms.active);
  const clampedUv = uv.clamp(vec2(0), vec2(1));
  const geo = bilinearLoad(groundContactGeoTexture, clampedUv);
  const soil = bilinearLoad(groundContactSoilTexture, clampedUv);
  const height = geo.r.add(groundContactUniforms.baseHeight);
  const normal = reconstructNormal(geo.g, geo.b, inside);
  const contact = geo.a.clamp(0, 1).mul(inside);
  const soilColor = soil.rgb.mul(soil.rgb);
  const canopy = soil.a.clamp(0, 1).mul(inside);
  return { height, normal, contact, soilColor, canopy, inside };
}

/**
 * Evaluates the ground-contact field in the vertex stage and forwards compact
 * varyings to the fragment shader (zero fragment-stage texture fetches).
 *
 * @param {object} xzNode TSL `vec2` (typically `positionWorld.xz`)
 * @param {string} prefix unique varying prefix per material family
 * @param {{ canonical?: boolean }} [options]
 */
export function sampleGroundContactVarying(xzNode, prefix, options = {}) {
  const raw = sampleGroundContactAt(xzNode, options);
  const vGeo = varying(vec4(raw.height, raw.normal.x, raw.normal.z, raw.inside), `${prefix}GroundGeo`);
  const vSoil = varying(vec4(raw.soilColor, raw.contact), `${prefix}GroundSoil`);
  const vCanopy = varying(raw.canopy, `${prefix}GroundCanopy`);
  const inside = vGeo.w.clamp(0, 1);
  return {
    height: vGeo.x,
    normal: reconstructNormal(vGeo.y, vGeo.z, float(1)),
    inside,
    soilColor: vSoil.xyz,
    contact: vSoil.w.clamp(0, 1),
    canopy: vCanopy.clamp(0, 1),
  };
}
