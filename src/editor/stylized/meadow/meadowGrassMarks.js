import * as THREE from 'three/webgpu';
import { clamp, dot, floor, fract, Fn, If, mix, sin, smoothstep, step, texture, uniformArray, vec2, vec4 } from 'three/tsl';

import { GRASS_MARK, GRASS_MARK_KINDS } from './MeadowInteractionMap.js';

/**
 * What a spell leaves on the meadow, by `GRASS_MARK` kind: the pigment a marked
 * blade turns toward. Root and tip share the colour; the root takes it darker.
 */
const MARK_COLORS = Object.freeze({
  [GRASS_MARK.SCORCH]: [0.022, 0.018, 0.015],
  [GRASS_MARK.SINGE]: [0.3, 0.19, 0.07],
  [GRASS_MARK.WITHER]: [0.19, 0.16, 0.13],
  [GRASS_MARK.FROST]: [0.56, 0.7, 0.84],
  [GRASS_MARK.ACID]: [0.36, 0.44, 0.04],
  [GRASS_MARK.MOON]: [0.42, 0.52, 0.72],
  [GRASS_MARK.BLOOM]: [0.2, 0.55, 0.06],
  [GRASS_MARK.SICKLY]: [0.4, 0.38, 0.1],
});

/**
 * Tints a blade's root and tip pigment by the spell mark under its base, read
 * from the interaction map's G (amount) and B (kind). Called where the pigment
 * is still per-vertex, so it costs one texture read per blade vertex and no
 * new varyings.
 *
 * @param {object} interaction uniforms.spellGround
 * @param {object} base blade base node (render space)
 * @param {object} root vec3 pigment node
 * @param {object} tip vec3 pigment node
 */
export function applyGrassMarks(interaction, base, root, tip) {
  const colors = uniformArray(
    Array.from({ length: GRASS_MARK_KINDS }, (_, kind) => new THREE.Color(...(MARK_COLORS[kind] ?? [1, 1, 1]))),
    'color',
  );
  const windowUv = base.xz.sub(interaction.center).div(interaction.worldSize).add(0.5);
  const inside = step(0, windowUv.x).mul(step(windowUv.x, 1)).mul(step(0, windowUv.y)).mul(step(windowUv.y, 1));
  // Skipped while no spell has marked anything: one uniform compare per vertex.
  const sample = Fn(() => {
    const read = vec4(0, 0, 0, 1).toVar();
    If(interaction.active.greaterThan(0), () => {
      read.assign(texture(interaction.texture, windowUv.clamp(0, 1)));
    });
    return read;
  })();
  // Not every blade takes the mark as fully: a burnt or frosted patch stays ragged.
  const speckle = fract(sin(dot(base.xz, vec2(12.9898, 78.233))).mul(43758.5453));
  // The map fades a mark linearly; hold it near full for the first half, then let it go.
  const amount = smoothstep(0, 0.5, sample.g).mul(inside).mul(mix(0.55, 1, speckle));
  const kind = clamp(floor(sample.b.mul(GRASS_MARK_KINDS)), 0, GRASS_MARK_KINDS - 1).toInt();
  const mark = colors.element(kind);
  return {
    root: mix(root, mark.mul(0.75), amount),
    tip: mix(tip, mark, amount),
  };
}
