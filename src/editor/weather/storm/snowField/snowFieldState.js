/**
 * The storm snow field as coverage readers see it: a camera-centred texture of
 * how fast a storm's snow builds (and, thawing, how long it lasts) at each
 * point, relative to the one global `SnowCover`. `SnowFieldPass` fills it.
 *
 * It only scales the existing storm-snow input each surface's coverage mask
 * already reads (docs/surface-coatings-2026-11-17.md): it lays no snow itself.
 * With the field off, `stormSnowCoverAt` returns `stormSnowCoverUniform`
 * itself, so every reader compiles to the WGSL it had before.
 *
 * Texel layout (RGBA16F): R gain, ≥ 0 (local cover = saturate(cover × gain)).
 */

import * as THREE from 'three';
import { float, max, mix, smoothstep, texture } from 'three/tsl';
import { frameUniform as uniform } from '../../../../render/FrameUniforms.js';
import { stormSnowCoverUniform } from '../stormGroundUniforms.js';
import { snowFieldConfig } from './snowFieldConfig.js';

/** Share of the half-window over which the field fades back to the global cover. */
const EDGE_FADE_START = 0.4;

let target = null;

/** The field texture, sized from the registered config when first asked for. */
export function snowFieldTarget() {
  if (target) return target;
  const { resolution } = snowFieldConfig();
  target = new THREE.RenderTarget(resolution, resolution, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    generateMipmaps: false,
  });
  target.texture.name = 'storm-snow-field';
  return target;
}

export const snowFieldUniforms = Object.freeze({
  /** Render-space centre of the window. */
  windowCenter: uniform(new THREE.Vector2(0, 0)),
  /** The same centre in canonical metres (whole texels, so float32 holds it well under one). */
  windowCenterCanonical: uniform(new THREE.Vector2(0, 0)),
  windowSize: uniform(512),
  /** 0 until the field has been drawn once: readers fall back to the global cover. */
  active: uniform(0),
});

/**
 * Snap a window centre to whole texels in canonical metres, so the field
 * neither swims as the camera moves nor jumps on a floating-origin rebase.
 * @returns {{ x: number, z: number }}
 */
export function snapWindowCenter(canonicalX, canonicalZ, texelMetres) {
  return {
    x: Math.round(canonicalX / texelMetres) * texelMetres,
    z: Math.round(canonicalZ / texelMetres) * texelMetres,
  };
}

/**
 * The storm's snow cover at a render-space point, for a coverage mask.
 * @param {object} renderXZ TSL vec2 (e.g. `positionWorld.xz` in a fragment stage)
 */
export function stormSnowCoverAt(renderXZ) {
  if (!snowFieldConfig().enabled) return stormSnowCoverUniform;
  return coverFromOffset(renderXZ.sub(snowFieldUniforms.windowCenter));
}

/**
 * As `stormSnowCoverAt`, for a canonical position (meadow blades, which only know
 * canonical metres). Never use this in a positionNode's own position.
 * @param {object} canonicalXZ TSL vec2
 */
export function stormSnowCoverAtCanonical(canonicalXZ) {
  if (!snowFieldConfig().enabled) return stormSnowCoverUniform;
  return coverFromOffset(canonicalXZ.sub(snowFieldUniforms.windowCenterCanonical));
}

/** Whether coverage readers compile the field (for readers that add their own term). */
export function snowFieldEnabled() {
  return snowFieldConfig().enabled;
}

function coverFromOffset(offset) {
  const { windowSize, active } = snowFieldUniforms;
  const local = offset.div(windowSize);
  const edge = max(local.x.abs(), local.y.abs());
  const inside = float(1).sub(smoothstep(EDGE_FADE_START, 0.5, edge)).mul(active);
  const gain = mix(float(1), texture(snowFieldTarget().texture, local.add(0.5)).r, inside);
  return stormSnowCoverUniform.mul(gain).clamp(0, 1);
}
