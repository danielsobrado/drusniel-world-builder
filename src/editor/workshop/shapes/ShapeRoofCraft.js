import { placeShapePoint } from './ShapePaths.js';
import { shapeRandom } from './ShapeMesh.js';
import { buildShapeRoofCap } from './ShapeRoofCap.js';
import { buildShapeRoofChimney } from './ShapeChimneyBuilder.js';
import { shapeStoneTint } from './ShapeMasonryCourses.js';

function addRidgeEndBlock(mesh, center, tangent, width, height, color, hidden) {
  const half = width / 2;
  const a = [center[0] - tangent[0] * half, center[1] - tangent[1] * half, center[2] - tangent[2] * half];
  const b = [center[0] + tangent[0] * half, center[1] + tangent[1] * half, center[2] + tangent[2] * half];
  if (hidden([a, b])) return;
  mesh.beam(a, b, width, height, color);
}

function buildVergeTrim(plan, meshes, recipe, surface, hidden) {
  const p = plan.primitive;
  const vergeMesh = p.surface === 'masonry' ? meshes.trim : (meshes.inserts ?? meshes.trim);
  if (!vergeMesh || !surface.vergeLines) return;
  const stone = p.surface === 'masonry';
  const tint = stone ? shapeStoneTint(recipe, plan).map((v) => v * 0.9) : [0.76, 0.72, 0.66];
  const centerX = p.position[0], centerZ = p.position[1];
  for (const line of surface.vergeLines()) {
    if (line.length < 2) continue;
    // Push outward half-width slightly inward toward building center so verge barge/coping tucks under slates.
    const midPt = line[line.length >> 1];
    const ox = midPt[0] - centerX, oz = midPt[2] - centerZ;
    const len = Math.hypot(ox, oz) || 1;
    const [nx, nz] = p.roof.axis === 'depth' ? [0, Math.sign(oz) || 1] : [Math.sign(ox) || 1, 0];
    const inS = 0.09, outS = 0.07, drop = 0.14, topDrop = 0.025;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      if (hidden([a, b])) continue;
      const it0 = [a[0] - nx * inS, a[1] - topDrop, a[2] - nz * inS];
      const it1 = [b[0] - nx * inS, b[1] - topDrop, b[2] - nz * inS];
      const ot0 = [a[0] + nx * outS, a[1] - topDrop - 0.01, a[2] + nz * outS];
      const ot1 = [b[0] + nx * outS, b[1] - topDrop - 0.01, b[2] + nz * outS];
      const ob0 = [ot0[0], ot0[1] - drop, ot0[2]];
      const ob1 = [ot1[0], ot1[1] - drop, ot1[2]];
      const ib0 = [it0[0], it0[1] - drop, it0[2]];
      const ib1 = [it1[0], it1[1] - drop, it1[2]];
      // Ensure outward normals point away from roof interior
      const crossY = (b[0] - a[0]) * nz - (b[2] - a[2]) * nx;
      const orient = (q) => (crossY > 0 ? q : q.toReversed());
      vergeMesh.quad(...orient([ot0, ot1, ob1, ob0]).toReversed(), tint);
      vergeMesh.quad(...orient([ob0, ob1, ib1, ib0]).toReversed(), tint.map((c) => c * 0.78));
      vergeMesh.quad(...orient([it0, it1, ot1, ot0]).toReversed(), tint.map((c) => c * 1.04));
      if (recipe.detail >= 2 && stone && i % 2 === 0 && len > 0) {
        const dropPt = [(it0[0] + ot1[0]) * 0.5, (a[1] + b[1]) * 0.5 - drop - 0.04, (it0[2] + ot1[2]) * 0.5];
        if (!hidden([dropPt])) vergeMesh.box(dropPt, [0.14, 0.09, 0.14], tint.map((c) => c * 0.85));
      }
    }
  }
}

export function buildShapeRoofCraft(plan, meshes, recipe, surface, hidden) {
  const p = plan.primitive;
  if (p.roof.family === 'gable') {
    const depthAxis = p.roof.axis === 'depth';
    const half = ((depthAxis ? p.footprint.depth : p.footprint.width) * p.taper) / 2 + p.thickness / 2 + p.roof.overhang;
    const count = Math.ceil((half * 2) / 0.38);
    const line = Array.from({ length: count + 1 }, (_, i) => {
      const x = -half + (half * 2 * i) / count;
      const [wx, wz] = placeShapePoint(p, depthAxis ? [0, x] : [x, 0]);
      return [wx, surface.heightAt(wx, wz), wz];
    });
    buildShapeRoofCap(meshes.roof, line, surface, (i) => {
      const v = 0.86 + shapeRandom(recipe.seed, p.id, 'ridge-cap', i) * 0.12;
      return [v, v, v];
    }, hidden);
    if (recipe.detail >= 2 && meshes.trim && line.length >= 2) {
      const tint = shapeStoneTint(recipe, plan).map((v) => v * 0.94);
      const run = Math.hypot(line.at(-1)[0] - line[0][0], line.at(-1)[2] - line[0][2]) || 1;
      const dir = [(line.at(-1)[0] - line[0][0]) / run, 0, (line.at(-1)[2] - line[0][2]) / run];
      for (const end of [line[0], line.at(-1)]) {
        addRidgeEndBlock(meshes.trim, [end[0], end[1] + 0.09, end[2]], dir, 0.26, 0.22, tint, hidden);
      }
      const midIdx = line.length >> 1;
      if (line.length > 5) {
        addRidgeEndBlock(meshes.trim, [line[midIdx][0], line[midIdx][1] + 0.06, line[midIdx][2]], dir, 0.22, 0.16, tint, hidden);
      }
    }
  }
  // Hip/shed crest caps cover convex creases and high edges that flat tiles cannot follow.
  for (const [index, line] of surface.ridgeLines().entries()) {
    buildShapeRoofCap(meshes.roof, line, surface, (i) => {
      const v = 0.86 + shapeRandom(recipe.seed, p.id, 'hip-cap', `${index}:${i}`) * 0.12;
      return [v, v, v];
    }, hidden);
  }
  buildVergeTrim(plan, meshes, recipe, surface, hidden);
  if (['cone', 'bell', 'spire'].includes(p.roof.family) && meshes.metal) {
    const top = surface.point(0, 0);
    const profile = [[0, 0.055], [0.045, 0.08], [0.085, 0.042], [0.17, 0.028], [0.29, 0]];
    for (let band = 1; band < profile.length; band++) {
      for (let i = 0; i < 12; i++) {
        const point = (ring, index) => {
          const [y, radius] = profile[ring];
          const angle = (index * Math.PI) / 6;
          return [top[0] + Math.cos(angle) * radius, top[1] + y, top[2] + Math.sin(angle) * radius];
        };
        const quad = [point(band - 1, i), point(band, i), point(band, i + 1), point(band - 1, i + 1)];
        if (!hidden(quad)) meshes.metal.quad(...quad, [1.12, 0.93, 0.67]);
      }
    }
  }
  for (const detail of plan.decorations ?? []) {
    if (detail.role !== 'chimney') continue;
    const [x, , z] = detail.position;
    if (hidden([[x, detail.top + 0.09, z]])) continue;
    buildShapeRoofChimney(plan, detail, meshes, recipe, surface);
  }
}
