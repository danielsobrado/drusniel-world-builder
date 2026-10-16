import {
  attribute, cos, float, modelWorldMatrix, positionGeometry, positionLocal, sin, uniform, vec3, vec4,
} from 'three/tsl';
import { canonicalFromRender, sampleWorldWind, windWaveCoordinates } from '../../weather/wind/worldWindState.js';

const TWO_PI = Math.PI * 2;

/**
 * The slow, whole-tree layer of tree wind, shared by bark and crown so the crown
 * never parts from its trunk. A tree is pivoted at the ground and is much
 * stiffer than grass: it mostly leans with the wind's strength and sways only a
 * degree or two around that lean, on its own slow period rather than the
 * meadow's wave. Each tree gets a full-circle phase so a forest does not sway
 * in lockstep like a field.
 *
 * Returns the bend plus the per-tree terms the crown's branch and leaf layers
 * reuse.
 */
export function treeSwayField({ config, time, rootY = 0, topY = 1 }) {
  const root = uniform(rootY);
  const height = uniform(Math.max(0.001, topY - rootY));
  const r = positionGeometry.y.sub(root).div(height).clamp(0, 1);
  const world = modelWorldMatrix.mul(vec4(positionLocal, 1));
  const field = sampleWorldWind(world.xz);
  const wave = windWaveCoordinates(canonicalFromRender(world.xz));
  const phase = attribute('instanceDither', 'vec3').y.mul(TWO_PI);
  const trees = config.trees;
  const strength = trees.windStrength;
  const speed = trees.swaySpeed ?? 0.85;
  // Gusts still reach trees, compressed: a 3x gust leans a crown ~1.7x, not 3x.
  const gust = field.envelope.clamp(0.35, 3).sqrt();
  const compliance = float(1).div(attribute('instanceMorphology', 'vec3').z.clamp(0.65, 1.35));
  // Two incommensurate periods keep the sway from reading as a metronome. The
  // wave term lets a gust roll across a forest slowly instead of per tree.
  const travelling = wave.along.mul(0.06);
  const sway = sin(time.mul(speed).add(phase).add(travelling)).mul(0.65)
    .add(sin(time.mul(speed * 1.73).add(phase.mul(1.9)).add(1.3)).mul(0.35));
  const angle = sway.mul(trees.swayAmplitude ?? 0.2).add(trees.windLean ?? 0.35)
    .mul(strength).mul(gust).mul(compliance).clamp(-0.1, 0.1);
  // Bend grows with the square of height above the root: the base stays planted
  // and the trunk curves into the crown instead of hinging.
  const bend = angle.mul(r.mul(r));
  const reach = sin(bend).mul(height).mul(r);
  const offset = vec3(
    field.direction.x.mul(reach),
    cos(bend).sub(1).mul(height).mul(r),
    field.direction.y.mul(reach),
  );
  return { offset, r, height, field, gust, phase, world };
}

export function treeBendPosition(options) {
  return positionLocal.add(treeSwayField(options).offset);
}
