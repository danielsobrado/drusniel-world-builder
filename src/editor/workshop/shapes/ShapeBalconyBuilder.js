import { createShapeBalconySurface } from './ShapeBalcony.js';
import { buildShapeTurnedTimber } from './ShapeTurnedTimber.js';
import { shapeRandom } from './ShapeMesh.js';
import { clipShapeMeshSet } from './ShapeRoofOcclusion.js';
import { buildShapeProfileRail } from './ShapeProfileRail.js';

function slab(mesh, quad, thickness, tint) {
  const cross = (quad[1][2] - quad[0][2]) * (quad[2][0] - quad[0][0]) - (quad[1][0] - quad[0][0]) * (quad[2][2] - quad[0][2]);
  const top = cross > 0 ? quad : quad.toReversed(), low = top.map(([x, y, z]) => [x, y - thickness, z]);
  const width = Math.hypot(top[1][0] - top[0][0], top[1][2] - top[0][2]), depth = Math.hypot(top[3][0] - top[0][0], top[3][2] - top[0][2]);
  const uvs = [[0, 0], [width, 0], [width, depth], [0, depth]];
  mesh.quad(...top, tint, uvs); mesh.quad(...low.toReversed(), tint, uvs.toReversed());
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, length = Math.hypot(top[j][0] - top[i][0], top[j][2] - top[i][2]);
    mesh.quad(top[i], low[i], low[j], top[j], tint, [[0, 0], [0, thickness], [length, thickness], [length, 0]]); }
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
  const placedPosts = new Set();
  function railing(from, to, length, key) {
    const sample = (t, y) => point(from[0] + (to[0] - from[0]) * t, y, from[1] + (to[1] - from[1]) * t);
    for (const y of [0.13, b.height]) buildShapeProfileRail(wood, (t) => sample(t, y), length, 0.075,
      y === b.height ? 0.095 : 0.06, recipe.detail, tint('rail', key));
    const posts = Math.max(1, Math.ceil(length / 0.75));
    for (let i = 0; i <= posts; i++) {
      const base = sample(i / posts, 0), identity = base.map((v) => Math.round(v * 1e5)).join(':');
      if (placedPosts.has(identity)) continue;
      placedPosts.add(identity); wood.beam(base, sample(i / posts, b.height + 0.045), 0.105, 0.105, tint('post', `${key}:${i}`));
    }
    const balusters = Math.max(1, Math.ceil(length / 0.22));
    for (let i = 1; i < balusters; i++) {
      const t = i / balusters;
      if (Math.abs(t * posts - Math.round(t * posts)) * length / posts < 0.085) continue;
      buildShapeTurnedTimber(wood, sample(t, 0.17), Math.max(0.12, b.height - 0.23), 0.034, recipe.detail, tint('baluster', `${key}:${i}`));
    }
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
