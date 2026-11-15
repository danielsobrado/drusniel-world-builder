/** A shallow dressed edge follows the host surface and the opening's clipped bands. */
export function addShapeWallBevel(mesh, surface, { u0, u1, low, high, offset, thickness, color, caps }) {
  const size = Math.min(caps.bevelSize ?? 0.018, (u1 - u0) * 0.18, (high[0] - low[0]) * 0.15, (high[1] - low[1]) * 0.15);
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
  // A hand-cut stone's face is raised and faceted by its relief; a plain dressed face is flat.
  const lift = (u, y) => offset + Math.sign(thickness) * (size + (caps.relief ? caps.relief(u, y) : 0));
  const a = points(outer, offset), b = inner.map(([u, y]) => surface.point(u, y, lift(u, y)));
  const outward = surface.clockwise !== thickness < 0;
  const grain = (uv) => (caps.grainAlong === 'u' ? uv.map(([u, v]) => [v, u]) : uv);
  const face = (vertices, uv, tint) => {
    uv = grain(uv);
    if (outward) mesh.quad(...vertices, tint, uv);
    else mesh.quad(...vertices.toReversed(), tint, uv.toReversed());
  };
  // Only the piece holding the stone's crown is faceted around it; every other piece of a curved
  // stone lies on the same relief surface, so neighbouring pieces meet without creases.
  if (caps.relief && caps.crown[0] >= inner[0][0] && caps.crown[0] <= inner[1][0]) {
    const cu = caps.crown[0];
    // Between the bed and cap edges at the crown's own position, so a raking gable cap still bounds it.
    const t = (cu - inner[0][0]) / Math.max(1e-6, inner[1][0] - inner[0][0]);
    const bed = inner[0][1] + (inner[1][1] - inner[0][1]) * t, cap = inner[3][1] + (inner[2][1] - inner[3][1]) * t;
    const cy = Math.max(bed, Math.min(cap, caps.crown[1]));
    const c = surface.point(cu, cy, lift(cu, cy));
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4, uv = grain([inner[i], inner[next], [cu, cy]]);
      if (outward) mesh.triangle(b[i], b[next], c, color, uv);
      else mesh.triangle(c, b[next], b[i], color, uv.toReversed());
    }
  } else face(b, inner, color);
  for (let i = 0; i < 4; i++) {
    if ((i === 1 && !end) || (i === 3 && !start)) continue;
    const next = (i + 1) % 4, shade = i === 0 ? 0.72 : i === 2 ? 1.05 : 0.9;
    face([a[i], a[next], b[next], b[i]], [outer[i], outer[next], inner[next], inner[i]], color.map((c) => c * shade));
  }
}
