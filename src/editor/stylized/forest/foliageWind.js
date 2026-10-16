import {
  atan, cameraPosition, positionGeometry, positionLocal, sin, smoothstep, vec2, vec3,
} from 'three/tsl';
import { treeSwayField } from './treeSway.js';

/**
 * Crown wind in three layers, the way production tree shaders split it:
 *
 * 1. The whole-tree bend from `treeSwayField`, pivoted at the ground and shared
 *    with the bark, so the crown rides its trunk.
 * 2. Branches: outer foliage bobs on its own phase, keyed to the branch's
 *    azimuth around the trunk and its height, so one side of a crown can rise
 *    while the other settles. Foliage near the trunk barely moves.
 * 3. Leaves: a small, fast flutter with a per-card phase, faded out with
 *    distance before it turns into temporal noise.
 *
 * Phase uses canonical world coordinates and the instance seed; changing the
 * instance anchor or render origin cannot reset a crown's motion.
 */
export function foliageWindPosition({ config, time, rootY = 0, topY = 1, flutter = true }) {
  const { offset, r, height, field, gust, phase, world } = treeSwayField({ config, time, rootY, topY });
  const trees = config.trees;
  const strength = trees.windStrength;
  const direction = field.direction;
  const local = positionGeometry;
  // Prototypes are pivoted on the trunk axis, so distance from it in xz is how
  // far out along a branch this foliage hangs.
  const outward = smoothstep(0.04, 0.45, local.xz.length().div(height));
  const branchWeight = outward.mul(r);
  // sin(2θ) wraps cleanly across atan's ±π seam.
  const branchPhase = atan(local.z, local.x).mul(2).add(r.mul(4.1)).add(phase);
  const branchSpeed = trees.branchSpeed ?? 1.9;
  const branchWave = sin(time.mul(branchSpeed).add(branchPhase)).mul(0.7)
    .add(sin(time.mul(branchSpeed * 2.3).add(branchPhase.mul(1.4)).add(0.7)).mul(0.3));
  const branchReach = branchWave.mul(strength * (trees.branchAmplitude ?? 0.06))
    .mul(height).mul(branchWeight).mul(gust);
  // Branch tips mostly bob vertically and give a little downwind.
  let displaced = offset.add(vec3(direction.x.mul(0.4), 1, direction.y.mul(0.4)).mul(branchReach));
  if (flutter) {
    const across = vec2(direction.y.negate(), direction.x);
    const distanceFade = smoothstep(config.wind?.flutter?.fadeStart ?? 22, config.wind?.flutter?.fadeEnd ?? 38,
      world.xyz.sub(cameraPosition).length()).oneMinus();
    const leafPhase = local.x.mul(5.3).add(local.y.mul(3.1)).add(local.z.mul(4.7)).add(phase.mul(3));
    const leafWave = sin(time.mul(trees.flutterSpeed ?? 7).add(leafPhase));
    const leaf = leafWave.mul(strength * (trees.flutterAmplitude ?? 0.35) * 0.4)
      .mul(branchWeight).mul(distanceFade).mul(gust);
    displaced = displaced.add(vec3(across.x.mul(leaf), leaf.mul(0.6), across.y.mul(leaf)));
  }
  return positionLocal.add(displaced);
}
