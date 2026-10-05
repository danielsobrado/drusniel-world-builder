/** Conservative horizontal camera cone; tile corners may intersect its edge. */
export function meadowTileInView(centerX, centerZ, camera, tileSize, cone) {
  if (!cone) return true;
  const x = centerX - camera.x, z = centerZ - camera.z;
  const depth = x * cone.x + z * cone.z;
  const side = Math.abs(x * cone.z - z * cone.x);
  const radius = tileSize / Math.SQRT2;
  return depth >= -radius
    && side <= Math.max(0, depth) * cone.tangent + radius * (1 + cone.tangent);
}
