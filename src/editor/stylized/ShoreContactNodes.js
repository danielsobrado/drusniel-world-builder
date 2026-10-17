import { abs, length, max, select, vec2 } from 'three/tsl';

/** Convert a vertical front gap to surface metres using its local gradient.
 * Width stays bounded on flat shelves and slopes; no higher derivatives.
 */
export function surfaceGradient(heightGap, localXZ) {
  const dx = localXZ.dFdx(), dy = localXZ.dFdy();
  const hx = heightGap.dFdx(), hy = heightGap.dFdy();
  const determinant = dx.x.mul(dy.y).sub(dx.y.mul(dy.x));
  const divisor = max(abs(determinant), 1e-10).mul(select(determinant.lessThan(0), -1, 1));
  return vec2(hx.mul(dy.y).sub(hy.mul(dx.y)), hy.mul(dx.x).sub(hx.mul(dy.x))).div(divisor);
}

export function shoreContactDistance(heightGap, localXZ) {
  const gradient = surfaceGradient(heightGap, localXZ);
  const hx = heightGap.dFdx(), hy = heightGap.dFdy();
  const slope = max(length(gradient), .035);
  return { distance: abs(heightGap).div(slope), footprint: abs(hx).add(abs(hy)).div(slope) };
}
