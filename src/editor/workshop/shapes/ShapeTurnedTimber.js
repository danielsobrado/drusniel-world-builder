/** Profiled balusters stay in the shared timber batch, with smooth radial normals. */
export function buildShapeTurnedTimber(mesh, base, height, radius, detail, tint) {
  const profile = detail >= 2 ? [[0, 0.65], [0.1, 0.65], [0.16, 1], [0.22, 0.7],
    [0.4, 0.45], [0.52, 0.95], [0.64, 0.95], [0.78, 0.45], [0.88, 0.65], [1, 0.65]] : [[0, 0.75], [1, 0.75]];
  const sides = detail >= 2 ? 8 : 6;
  for (let row = 0; row < profile.length - 1; row++) {
    const [a, ra] = profile[row], [b, rb] = profile[row + 1];
    const slope = (ra - rb) * radius / ((b - a) * height), length = Math.hypot(1, slope);
    for (let i = 0; i < sides; i++) {
      const angles = [i * Math.PI * 2 / sides, (i + 1) * Math.PI * 2 / sides];
      const point = (angle, y, r) => [base[0] + Math.cos(angle) * r * radius, base[1] + y * height, base[2] + Math.sin(angle) * r * radius];
      const normal = (angle) => [Math.cos(angle) / length, slope / length, Math.sin(angle) / length];
      const [u, v] = angles;
      mesh.quad(point(u, a, ra), point(u, b, rb), point(v, b, rb), point(v, a, ra), tint,
        [[i / sides, a], [i / sides, b], [(i + 1) / sides, b], [(i + 1) / sides, a]],
        [normal(u), normal(u), normal(v), normal(v)]);
    }
  }
  for (const [y, r] of [profile[0], profile.at(-1)]) for (let i = 0; i < sides; i++) {
    const point = (angle) => [base[0] + Math.cos(angle) * r * radius, base[1] + y * height, base[2] + Math.sin(angle) * r * radius];
    const points = [point(i * Math.PI * 2 / sides), point((i + 1) * Math.PI * 2 / sides), [base[0], base[1] + y * height, base[2]]];
    mesh.triangle(...(y ? points.toReversed() : points), tint);
  }
}
