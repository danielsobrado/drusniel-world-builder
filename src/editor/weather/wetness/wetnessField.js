/**
 * The ground wetness as materials see it: one small texture around the camera
 * (`WetnessFieldPass` fills it), and the global wetness value that stands in
 * beyond it and before the first render.
 *
 * Module state, like the wind field's, because the materials that read it are
 * built long before the pass exists. Whether materials sample it at all is
 * decided once, at configuration (`registerWetnessField`): with the field off
 * they build the exact graph they built before it existed.
 *
 * Texel layout (RGBA8): R film wetness, G puddle spread. Texel i sits on the
 * height patch's sample i, so the window is the patch's (whole texels in
 * canonical metres, snapped by LocalGroundHeight).
 */

import * as THREE from 'three/webgpu';
import { float, max, mix, smoothstep, texture, vec2 } from 'three/tsl';
import { frameUniform as uniform } from '../../../render/FrameUniforms.js';
import { groundWetnessClocksUniform, surfaceWetnessUniform } from '../surfaceWetness.js';
import { PUDDLE_CLOCK_START } from './wetnessFieldModel.js';

export const WETNESS_FIELD_SIZE = 128;
/** Metres the field spans: about 2 m per texel. */
export const WETNESS_FIELD_METRES = 256;
/** Share of the half-window over which the field fades to the global value. */
const EDGE_FADE_START = 0.4;
/** Mean of the field's puddle spread over open flats, for the ground beyond it. */
const FALLBACK_PUDDLE = 0.6;

let enabled = false;

/** @param {{ enabled: boolean }} field resolved `stylizedSurface.wetness.field` */
export function registerWetnessField(field) {
  enabled = field?.enabled === true;
}

export function wetnessFieldEnabled() {
  return enabled;
}

export const wetnessFieldTarget = new THREE.RenderTarget(WETNESS_FIELD_SIZE, WETNESS_FIELD_SIZE, {
  type: THREE.UnsignedByteType,
  format: THREE.RGBAFormat,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  wrapS: THREE.ClampToEdgeWrapping,
  wrapT: THREE.ClampToEdgeWrapping,
  depthBuffer: false,
  generateMipmaps: false,
});
wetnessFieldTarget.texture.name = 'ground-wetness-field';

export const wetnessFieldUniforms = Object.freeze({
  /** Render-space position of texel 0's sample (the window's minimum corner). */
  corner: uniform(new THREE.Vector2()),
  extent: uniform(WETNESS_FIELD_METRES),
  /** 0 until the first render: the global value stands everywhere. */
  active: uniform(0),
});

/**
 * Ground wetness at a render-space point.
 * @param {Node} renderXZ TSL vec2, render space (positionWorld.xz)
 * @returns {{ film: Node, puddle: Node, puddleClock: Node }} film wetness, puddle
 *   spread, and the clock that gates whether any puddle stands
 */
export function sampleWetnessField(renderXZ) {
  const { corner, extent, active } = wetnessFieldUniforms;
  const local = vec2(renderXZ).sub(corner).div(extent);
  const edge = max(local.x.sub(0.5).abs(), local.y.sub(0.5).abs());
  const inside = float(1).sub(smoothstep(EDGE_FADE_START, 0.5, edge)).mul(active);
  // Samples sit on the window's edges, texel centres half a texel in (LocalGroundHeight.heightNode).
  const texel = texture(wetnessFieldTarget.texture,
    local.clamp(0, 1).mul((WETNESS_FIELD_SIZE - 1) / WETNESS_FIELD_SIZE).add(0.5 / WETNESS_FIELD_SIZE));
  const puddleClock = groundWetnessClocksUniform.z;
  const globalPuddle = smoothstep(PUDDLE_CLOCK_START, 0.9, puddleClock).mul(FALLBACK_PUDDLE);
  return {
    film: mix(surfaceWetnessUniform, texel.r, inside),
    puddle: mix(globalPuddle, texel.g, inside),
    puddleClock,
  };
}
