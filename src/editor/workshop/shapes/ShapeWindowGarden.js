import { shapeRandom } from './ShapeMesh.js';

const flowers = [[0.72, 0.12, 0.2], [0.93, 0.84, 0.56], [0.77, 0.57, 0.64]];

/** Folded leaves fill the planter while keyed blossoms retain their colors through edits. */
export function buildShapeWindowGarden(mesh, surface, { seed, id, opening, a, width, top, offset }) {
  const count = Math.max(5, Math.ceil(width / 0.09));
  for (let i = 0; i < count; i++) {
    const random = (key) => shapeRandom(seed, id, 'window-garden', `${opening.id}:${i}:${key}`);
    const u = a + 0.08 + (width - 0.16) * (i + 0.5) / count;
    const y = top + 0.08 + random('height') * 0.12, depth = offset - 0.08 - random('depth') * 0.16;
    const stem = surface.point(u, top - 0.025, depth), head = surface.point(u, y, depth);
    mesh.beam(stem, head, 0.009, 0.009, [0.055, 0.22, 0.04]);
    for (let leaf = 0; leaf < 4; leaf++) {
      const angle = leaf * Math.PI / 2 + random('leaf-turn') * Math.PI;
      const baseY = top + 0.035 + (leaf % 2) * 0.025;
      const du = Math.cos(angle) * 0.085, dd = Math.sin(angle) * 0.07;
      const base = surface.point(u, baseY, depth), tip = surface.point(u + du, baseY + 0.065, depth + dd);
      const mid = surface.point(u + du * 0.52, baseY + 0.07, depth + dd * 0.52);
      const left = surface.point(u + du * 0.48 - dd * 0.38, baseY + 0.045, depth + dd * 0.48 + du * 0.38);
      const right = surface.point(u + du * 0.48 + dd * 0.38, baseY + 0.045, depth + dd * 0.48 - du * 0.38);
      const tint = [0.08 + random('leaf-color') * 0.04, 0.27 + random('leaf-color') * 0.08, 0.045];
      for (const points of [[base, left, mid], [left, tip, mid], [tip, right, mid], [right, base, mid]])
        mesh.triangle(...points, tint);
    }
    const tint = flowers[Math.floor(random('flower') * flowers.length)];
    const radius = 0.035 + random('size') * 0.017;
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * 2 / 5;
      const point = (angle) => surface.point(u + Math.cos(angle) * radius, y + 0.012, depth + Math.sin(angle) * radius);
      const petals = [point(angle + 0.5), point(angle - 0.5)];
      mesh.triangle(head, ...(surface.clockwise ? petals : petals.toReversed()), tint);
    }
  }
}
