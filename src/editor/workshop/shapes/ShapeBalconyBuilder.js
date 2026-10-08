import { createShapeBalconySurface } from './ShapeBalcony.js';
import { buildShapeTurnedTimber } from './ShapeTurnedTimber.js';
import { shapeRandom } from './ShapeMesh.js';
import { clipShapeMeshSet } from './ShapeRoofOcclusion.js';

function slab(mesh, quad, thickness, tint) {
  const cross = (quad[1][2] - quad[0][2]) * (quad[2][0] - quad[0][0]) - (quad[1][0] - quad[0][0]) * (quad[2][2] - quad[0][2]);
  const top = cross > 0 ? quad : quad.toReversed(), low = top.map(([x, y, z]) => [x, y - thickness, z]);
  mesh.quad(...top, tint); mesh.quad(...low.toReversed(), tint);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; mesh.quad(top[i], low[i], low[j], top[j], tint); }
}

export function buildShapeBalcony(host, feature, meshes, recipe) {
  const b = feature.balcony, f = feature.intent, point = createShapeBalconySurface(host, b);
  const wood = clipShapeMeshSet(meshes, host, { roofs: false }).inserts;
  const tint = (role, i) => { const v = 0.75 + shapeRandom(recipe.seed, host.id, `balcony-${role}`, `${f.id}:${i}`) * 0.18; return [v, v, v]; };
  const count = Math.ceil(b.width / (recipe.detail >= 2 ? 0.18 : 0.4)), gap = recipe.detail >= 2 ? 0.004 : 0;
  for (let i = 0; i < count; i++) {
    const a = b.start + b.width * i / count + gap, c = b.start + b.width * (i + 1) / count - gap;
    slab(wood, [point(a, 0, 0.015), point(c, 0, 0.015), point(c, 0, f.depth), point(a, 0, f.depth)], 0.14, tint('deck', i));
  }
  function railing(from, to, length, key) {
    const sections = Math.max(1, Math.ceil(length / 0.18));
    const sample = (t, y) => point(from[0] + (to[0] - from[0]) * t, y, from[1] + (to[1] - from[1]) * t);
    for (let i = 0; i < sections; i++) for (const y of [0.13, b.height])
      wood.beam(sample(i / sections, y), sample((i + 1) / sections, y), y === b.height ? 0.095 : 0.06, 0.075, tint('rail', key));
    const posts = Math.max(1, Math.ceil(length / 0.75));
    for (let i = 0; i <= posts; i++) wood.beam(sample(i / posts, 0), sample(i / posts, b.height + 0.045), 0.105, 0.105, tint('post', `${key}:${i}`));
    const balusters = Math.max(1, Math.ceil(length / 0.22));
    for (let i = 1; i < balusters; i++) buildShapeTurnedTimber(wood, sample(i / balusters, 0.17), Math.max(0.12, b.height - 0.23), 0.034, recipe.detail, tint('baluster', `${key}:${i}`));
  }
  const frontLength = b.outer.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - b.outer[i][0], p[2] - b.outer[i][2]), 0);
  railing([b.start, f.depth], [b.end, f.depth], frontLength, 'front');
  for (const [i, u] of [b.start, b.end].entries()) railing([u, 0.06], [u, f.depth], f.depth - 0.06, `side-${i}`);
  const supports = Math.max(2, Math.ceil(b.width / 1.2));
  const drop = Math.min(0.8, b.bottom + host.primitive.elevation + 0.02, f.depth * 0.7);
  for (let i = 0; i < supports; i++) {
    const u = b.start + b.width * (i + 0.5) / supports;
    wood.beam(point(u, -0.17, 0.03), point(u, -0.17, f.depth * 0.94), 0.12, 0.13, tint('joist', i));
    if (drop < 0.18) continue;
    const steps = recipe.detail >= 2 ? 8 : 2;
    for (let j = 0; j < steps; j++) {
      const sample = (t) => point(u, -0.16 - drop * (1 - Math.sin(t * Math.PI / 2)), 0.03 + (f.depth * 0.86 - 0.03) * t);
      wood.beam(sample(j / steps), sample((j + 1) / steps), 0.095, 0.105, tint('corbel', i));
    }
  }
}
