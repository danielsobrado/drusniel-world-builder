import { shapeRandom } from './ShapeMesh.js';
import { createShapeTraversalSurface } from './ShapeTraversalSurface.js';

export function buildShapeSupports(plan, mesh) {
  for (const support of plan.supports ?? []) {
    const [x, y, z] = support.position;
    const scale = Math.min(1, y / 0.35), shaft = y - 0.22 * scale;
    mesh.box([x, shaft / 2, z], [0.38, shaft, 0.38], [0.9, 0.9, 0.9]);
    mesh.box([x, 0.12 * scale, z], [0.62, 0.24 * scale, 0.62], [0.88, 0.88, 0.88]);
    mesh.box([x, y - 0.16 * scale, z], [0.58, 0.18 * scale, 0.58], [1, 1, 1]);
  }
}

export function buildShapeTraversal(plan, meshes, recipe) {
  const p = plan.primitive,
    length = plan.curve.length;
  const point = createShapeTraversalSurface(plan);
  const count = plan.steps || Math.max(8, Math.ceil(length / 0.25)),
    half = p.width / 2;
  for (let i = 0; i < count; i++) {
    const t0 = i / count,
      t1 = (i + 1) / count;
    const v = 0.88 + shapeRandom(recipe.seed, plan.id, 'deck', i) * 0.12;
    // Stair treads are horizontal between consecutive risers.
    const a = point(t0, -half),
      b = point(t0, half),
      c = point(t1, half),
      d = point(t1, -half);
    if (plan.steps) a[1] = b[1] = d[1] = c[1];
    const bottom = [a, b, c, d].map((v) => [v[0], v[1] - 0.24, v[2]]);
    meshes.deck.quad(a, d, c, b, [v, v, v]);
    meshes.deck.quad(bottom[0], bottom[1], bottom[2], bottom[3], [v * 0.8, v * 0.8, v * 0.8]);
    for (let k = 0; k < 4; k++)
      meshes.deck.quad([a, b, c, d][k], [a, b, c, d][(k + 1) % 4], bottom[(k + 1) % 4], bottom[k], [
        v,
        v,
        v,
      ]);
    if (p.railing)
      for (const side of [-1, 1]) {
        const railA = point(t0, side * (half + 0.04), 0.95),
          railB = point(t1, side * (half + 0.04), 0.95);
        (meshes.rails ?? meshes.trim).beam(railA, railB, 0.085, 0.085, [0.85, 0.85, 0.85]);
      }
  }
  if (p.railing) {
    const posts = Math.max(2, Math.ceil(length / 0.9));
    for (let i = 0; i <= posts; i++)
      for (const side of [-1, 1])
        (meshes.rails ?? meshes.trim).beam(
          point(i / posts, side * (half + 0.04), 0.02),
          point(i / posts, side * (half + 0.04), 1),
          0.09,
          0.09,
          [1, 1, 1],
        );
  }
  if (p.support === 'arch' && plan.mode === 'bridge') {
    // A continuous stone arch band spans the same path as the deck.
    const segments = 32;
    for (let i = 0; i < segments; i++) {
      const t0 = 0.08 + (0.84 * i) / segments,
        t1 = 0.08 + (0.84 * (i + 1)) / segments;
      const soffit = [];
      for (const side of [-1, 1]) {
        const a = point(t0, side * half, -0.3),
          b = point(t1, side * half, -0.3);
        const dropA = Math.min(
          a[1] - 0.06,
          0.24 + (1 - Math.sin(Math.PI * t0)) * Math.max(0, a[1] - 0.3),
        );
        const dropB = Math.min(
          b[1] - 0.06,
          0.24 + (1 - Math.sin(Math.PI * t1)) * Math.max(0, b[1] - 0.3),
        );
        const c = [b[0], b[1] - dropB, b[2]],
          d = [a[0], a[1] - dropA, a[2]];
        soffit.push([d, c]);
        if (side < 0) meshes.trim.quad(a, b, c, d, [0.86, 0.86, 0.86]);
        else meshes.trim.quad(d, c, b, a, [0.86, 0.86, 0.86]);
      }
      meshes.trim.quad(soffit[0][0], soffit[1][0], soffit[1][1], soffit[0][1], [0.76, 0.76, 0.76]);
    }
  }
  buildShapeSupports(plan, meshes.supports ?? meshes.trim);
}
