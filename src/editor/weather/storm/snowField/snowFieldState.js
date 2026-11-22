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
 * The desert sand field rides the same texture (docs/plans/desert-sand-field-2026-11-22.md):
 * `stormSandCoverAt` reads its channel the same way against `SandCover`.
 *
 * Texel layout (RGBA16F): R snow gain, ≥ 0 (local cover = saturate(cover × gain));
 * G, B the snow's build and melt gains; A sand gain, ≥ 0 (1 with the sand field off).
 */

import * as THREE from 'three';
import { float, max, mix, smoothstep, texture } from 'three/tsl';
import { frameUniform as uniform } from '../../../../render/FrameUniforms.js';
import { stormSandCoverUniform, stormSnowCoverUniform } from '../stormGroundUniforms.js';
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
 * @param {object} [sample] this material's `stormFieldSample`, shared with its sand
 */
export function stormSnowCoverAt(renderXZ, sample = null) {
  if (!snowFieldConfig().enabled) return stormSnowCoverUniform;
  const { texel, inside } = sample ?? stormFieldSample(renderXZ);
  return stormSnowCoverUniform.mul(mix(float(1), texel.r, inside)).clamp(0, 1);
}

/**
 * As `stormSnowCoverAt`, for a canonical position (meadow blades, which only know
 * canonical metres). Never use this in a positionNode's own position.
 * @param {object} canonicalXZ TSL vec2
 */
export function stormSnowCoverAtCanonical(canonicalXZ) {
  if (!snowFieldConfig().enabled) return stormSnowCoverUniform;
  const { texel, inside } = fieldSample(canonicalXZ, snowFieldUniforms.windowCenterCanonical);
  return stormSnowCoverUniform.mul(mix(float(1), texel.r, inside)).clamp(0, 1);
}

/** Whether coverage readers compile the field (for readers that add their own term). */
export function snowFieldEnabled() {
  return snowFieldConfig().enabled;
}

/**
 * One fetch of the field at a render-space point, for a material that reads both
 * snow and sand: each texture node is its own sampler binding, and the terrain's
 * fragment stage has none to spare (TerrainSlotBindings). Build one per material:
 * a node shared between materials changes their WGSL.
 * @param {object} renderXZ TSL vec2
 * @returns {{ texel: object, inside: object }}
 */
export function stormFieldSample(renderXZ) {
  return fieldSample(renderXZ, snowFieldUniforms.windowCenter);
}

/**
 * The windblown sand a sandstorm has laid at a render-space point (fragment stage).
 * @param {object} renderXZ TSL vec2
 * @param {object} [sample] this material's `stormFieldSample`, shared with its snow
 */
export function stormSandCoverAt(renderXZ, sample = null) {
  const { texel, inside } = sample ?? stormFieldSample(renderXZ);
  return stormSandCoverUniform.mul(mix(float(1), texel.a, inside)).clamp(0, 1);
}

/**
 * How sheltered a render-space point lies from the sandstorm, 0 open … 1 a full
 * lee or hollow, from the sand gain (sand settles where the wind slackens). Its
 * own level-0 fetch, for a vertex stage.
 * @param {object} renderXZ TSL vec2
 * @param {{ flatGain: number, leeGain: number, hollowGain: number }} sand resolved sand field
 */
export function sandShelterAt(renderXZ, sand) {
  const { windowSize, active, windowCenter } = snowFieldUniforms;
  const local = renderXZ.sub(windowCenter).div(windowSize);
  const inside = float(1).sub(smoothstep(EDGE_FADE_START, 0.5, max(local.x.abs(), local.y.abs()))).mul(active);
  const gain = texture(snowFieldTarget().texture, local.add(0.5)).level(0).a;
  return gain.sub(sand.flatGain).div(Math.max(sand.leeGain + sand.hollowGain, 1e-3)).clamp(0, 1).mul(inside);
}

function fieldSample(position, center) {
  const { windowSize, active } = snowFieldUniforms;
  const local = position.sub(center).div(windowSize);
  const edge = max(local.x.abs(), local.y.abs());
  const inside = float(1).sub(smoothstep(EDGE_FADE_START, 0.5, edge)).mul(active);
  return { texel: texture(snowFieldTarget().texture, local.add(0.5)), inside };
}
