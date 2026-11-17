import { float, mix, smoothstep } from 'three/tsl';

/**
 * Where moss grows, given how well it could (`potential`, 0..1: biome, material
 * and orientation) and a stable organic `field`. Potential moves the threshold
 * the field must clear, so a damp, mossy stone grows larger patches and a dry
 * one smaller ones — each fully moss — instead of one translucent green film.
 * Zero potential grows nothing, whatever the field.
 *
 * @param {object} options
 * @param {import('three/tsl').Node} options.field patch field, in the units of the thresholds
 * @param {import('three/tsl').Node} options.potential 0..1
 * @param {number} options.sparse threshold at no potential
 * @param {number} options.dense threshold at full potential
 * @param {number} options.edge half-width of the soft rim
 */
export function mossGrowth({ field, potential, sparse, dense, edge }) {
  const p = float(potential).clamp(0, 1);
  const threshold = mix(float(sparse), float(dense), p);
  return smoothstep(threshold.sub(edge), threshold.add(edge), field).mul(smoothstep(0, 0.04, p));
}
