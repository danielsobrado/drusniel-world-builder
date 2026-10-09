function orientedQuad(mesh, points, normal, tint, normals, uvs) {
  const a = points[1].map((v, k) => v - points[0][k]), b = points[2].map((v, k) => v - points[0][k]);
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const reverse = cross.reduce((sum, v, k) => sum + v * normal[k], 0) < 0;
  mesh.quad(...(reverse ? points.toReversed() : points), tint, reverse ? uvs.toReversed() : uvs, reverse ? normals.toReversed() : normals);
}

/** Shared profile rings close curved handrail joints without overlapping end caps. */
export function buildShapeProfileRail(mesh, sample, length, width, height, detail, tint) {
  const w = width / 2, h = height / 2, bevel = detail >= 2 ? Math.min(width, height) * 0.16 : 0;
  const profile = bevel ? [[-w + bevel, -h], [w - bevel, -h], [w, -h + bevel], [w, h - bevel],
    [w - bevel, h], [-w + bevel, h], [-w, h - bevel], [-w, -h + bevel]] : [[-w, -h], [w, -h], [w, h], [-w, h]];
  const count = Math.max(1, Math.ceil(length / 0.16)), rings = [];
  const distances = [0];
  for (let j = 0; j < profile.length; j++) { const k = (j + 1) % profile.length;
    distances.push(distances.at(-1) + Math.hypot(profile[k][0] - profile[j][0], profile[k][1] - profile[j][1])); }
  for (let i = 0; i <= count; i++) {
    const t = i / count, center = sample(t), a = sample(Math.max(0, t - 0.001)), b = sample(Math.min(1, t + 0.001));
    const distance = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    const lateral = [-(b[2] - a[2]) / distance, 0, (b[0] - a[0]) / distance];
    rings.push({ center, lateral, points: profile.map(([x, y]) => [center[0] + lateral[0] * x, center[1] + y, center[2] + lateral[2] * x]) });
  }
  for (let i = 0; i < count; i++) for (let j = 0; j < profile.length; j++) {
    const k = (j + 1) % profile.length, dx = profile[k][0] - profile[j][0], dy = profile[k][1] - profile[j][1];
    const d = Math.hypot(dx, dy), normal = (ring) => [ring.lateral[0] * dy / d, -dx / d, ring.lateral[2] * dy / d];
    const a = rings[i], b = rings[i + 1], na = normal(a), nb = normal(b);
    orientedQuad(mesh, [a.points[j], b.points[j], b.points[k], a.points[k]], na, tint, [na, nb, nb, na],
      [[i * length / count, distances[j]], [(i + 1) * length / count, distances[j]],
        [(i + 1) * length / count, distances[j + 1]], [i * length / count, distances[j + 1]]]);
  }
  for (const [index, ring] of [rings[0], rings.at(-1)].entries()) {
    const next = index ? rings.at(-2) : rings[1], direction = ring.center.map((v, k) => v - next.center[k]);
    for (let j = 1; j < profile.length - 1; j++) {
      const points = [ring.points[0], ring.points[j], ring.points[j + 1]];
      const a = points[1].map((v, k) => v - points[0][k]), b = points[2].map((v, k) => v - points[0][k]);
      const dot = (a[1] * b[2] - a[2] * b[1]) * direction[0] + (a[2] * b[0] - a[0] * b[2]) * direction[1] + (a[0] * b[1] - a[1] * b[0]) * direction[2];
      const uvs = [profile[0], profile[j], profile[j + 1]];
      mesh.triangle(...(dot < 0 ? points.toReversed() : points), tint, dot < 0 ? uvs.toReversed() : uvs);
    }
  }
}
