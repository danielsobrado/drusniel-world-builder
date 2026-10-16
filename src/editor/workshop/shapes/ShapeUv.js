/** Face coordinates measured from its first edge, invariant under rigid transforms. */
export function shapeFaceUvs(points) {
  const origin = points[0], edge = points[1].map((v, k) => v - origin[k]);
  const length = Math.hypot(...edge) || 1, u = edge.map(v => v / length);
  const across = points[2].map((v, k) => v - origin[k]);
  const n = [u[1] * across[2] - u[2] * across[1], u[2] * across[0] - u[0] * across[2], u[0] * across[1] - u[1] * across[0]];
  const nl = Math.hypot(...n) || 1;
  const v = [(n[1] * u[2] - n[2] * u[1]) / nl, (n[2] * u[0] - n[0] * u[2]) / nl, (n[0] * u[1] - n[1] * u[0]) / nl];
  return points.map(p => [u.reduce((sum, x, k) => sum + (p[k] - origin[k]) * x, 0), v.reduce((sum, x, k) => sum + (p[k] - origin[k]) * x, 0)]);
}
