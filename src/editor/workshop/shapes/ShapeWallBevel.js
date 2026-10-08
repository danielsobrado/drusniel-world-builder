/** A shallow dressed edge follows the host surface and the opening's clipped bands. */
export function addShapeWallBevel(mesh, surface, { u0, u1, low, high, offset, thickness, color, caps }) {
  const size = Math.min(0.018, (u1 - u0) * 0.18, (high[0] - low[0]) * 0.15, (high[1] - low[1]) * 0.15);
  if (size <= 0) return;
  const start = caps.start !== false, end = caps.end !== false;
  const inset = [u0 + (start ? size : 0), u1 - (end ? size : 0)];
  const at = (values, u) => values[0] + (values[1] - values[0]) * (u - u0) / (u1 - u0);
  const outer = [[u0, low[0]], [u1, low[1]], [u1, high[1]], [u0, high[0]]];
  const inner = [
    [inset[0], at(low, inset[0]) + size], [inset[1], at(low, inset[1]) + size],
    [inset[1], at(high, inset[1]) - size], [inset[0], at(high, inset[0]) - size],
  ];
  for (let i = 0; i < inner.length; i++) {
    const wear = Math.min(caps.wear?.[i] ?? 0, (u1 - u0) * 0.18, (high[i > 1 ? 1 : 0] - low[i > 1 ? 1 : 0]) * 0.18);
    inner[i][0] += (i === 0 || i === 3 ? 1 : -1) * wear;
    inner[i][1] += (i < 2 ? 1 : -1) * wear;
  }
  const points = (coordinates, lift) => coordinates.map(([u, y]) => surface.point(u, y, lift));
  const a = points(outer, offset), b = points(inner, offset + Math.sign(thickness) * size);
  const face = (vertices, uv, tint) => {
    if (surface.clockwise !== thickness < 0) mesh.quad(...vertices, tint, uv);
    else mesh.quad(...vertices.toReversed(), tint, uv.toReversed());
  };
  face(b, inner, color);
  for (let i = 0; i < 4; i++) {
    if ((i === 1 && !end) || (i === 3 && !start)) continue;
    const next = (i + 1) % 4, shade = i === 0 ? 0.72 : i === 2 ? 1.05 : 0.9;
    face([a[i], a[next], b[next], b[i]], [outer[i], outer[next], inner[next], inner[i]], color.map((c) => c * shade));
  }
}
