/** Iron straps, rivets and a ring pull all remain in the host's material batch. */
export function buildShapeOpeningCraft(opening, meshes, surface, recipe) {
  if (recipe.detail < 2 || opening.role !== 'door' || !meshes.metal) return;
  const center = opening.at * surface.length, width = opening.width;
  for (const y of [opening.bottom + opening.height * 0.18, opening.bottom + opening.height * 0.61]) {
    const a = center - width * 0.41, b = center + width * 0.32;
    meshes.metal.beam(surface.point(a, y, 0.028), surface.point(b, y, 0.028), 0.045, 0.018, [0.48, 0.49, 0.49]);
    for (const u of [a + 0.03, b - 0.03]) {
      const point = surface.point(u, y, 0.044);
      meshes.metal.box(point, [0.024, 0.025, 0.018], [0.9, 0.88, 0.77]);
    }
  }
  const u = center + width * 0.22, y = opening.bottom + opening.height * 0.45;
  const radius = Math.min(0.055, width * 0.07);
  for (let i = 0; i < 12; i++) {
    const ring = (angle, r) => surface.point(u + Math.cos(angle) * r, y + Math.sin(angle) * r * 1.16, 0.06);
    const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6;
    const vertices = [ring(a, radius), ring(b, radius), ring(b, radius - 0.012), ring(a, radius - 0.012)];
    meshes.metal.quad(...(surface.clockwise ? vertices : vertices.toReversed()), [1.2, 1.03, 0.64]);
  }
}
