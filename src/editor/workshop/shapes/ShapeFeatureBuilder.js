import { buildShapeWalls } from './ShapeWallBuilder.js';
import { buildShapeRoof } from './ShapeRoofBuilder.js';
import { buildShapeFacade } from './ShapeFacadeBuilder.js';
import { buildShapeFloors } from './ShapeFloorBuilder.js';
import { createShapeRoofOcclusion, clipShapeRoofMesh, clipShapeMeshSet } from './ShapeRoofOcclusion.js';
import { createShapeWallSurface } from './ShapeWallSurface.js';
import { buildShapeBalcony } from './ShapeBalconyBuilder.js';

const tint = [0.9, 0.9, 0.9];
function point(frame, x, y, z) {
  return [frame.origin[0] + frame.tangent[0] * x + frame.outward[0] * z,
    frame.origin[1] + y, frame.origin[2] + frame.tangent[2] * x + frame.outward[2] * z];
}

function buttress(feature, mesh, host) {
  const f = feature.intent, width = Math.min(f.width, 0.7), height = Math.min(f.height, host.primitive.height * 0.86);
  const profile = [[0, -0.05], [f.depth, -0.05], [f.depth, 0.4], [f.depth * 0.28, height * 0.7], [f.depth * 0.18, height], [0, height]];
  const sides = [-1, 1].map((side) => profile.map(([z, y]) => point(feature.frame, side * width / 2, y, z)));
  for (let i = 1; i < profile.length - 1; i++) {
    mesh.triangle(sides[0][0], sides[0][i + 1], sides[0][i], tint);
    mesh.triangle(sides[1][0], sides[1][i], sides[1][i + 1], tint);
  }
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length;
    mesh.quad(sides[0][i], sides[0][j], sides[1][j], sides[1][i], tint);
  }
}

export function buildShapeFeatures(plan, meshes, recipe) {
  for (const feature of plan.features ?? []) {
    if (feature.balcony) { buildShapeBalcony(plan, feature, meshes, recipe); continue; }
    if (feature.solidSupport) { buttress(feature, clipShapeMeshSet(meshes, plan).trim, plan); continue; }
    const child = feature.child, occlusion = createShapeRoofOcclusion(child);
    const clipped = Object.fromEntries(Object.entries(meshes).map(([key, mesh]) => [key, clipShapeRoofMesh(mesh, occlusion)]));
    if (!feature.openSides) {
      buildShapeWalls(child, clipped, recipe);
      buildShapeFacade(child, clipped, recipe);
      buildShapeFloors(child, clipped);
    } else {
      const f = child.primitive, surface = createShapeWallSurface(child);
      for (const u of [0, child.curve.length * 0.25, child.curve.length * 0.5, child.curve.length * 0.75]) {
        const a = surface.point(u, 0.1), b = surface.point(u, f.height);
        clipped.inserts.beam(a, b, 0.14, 0.14, tint);
        clipped.trim.box([a[0], a[1] - 0.04, a[2]], [0.26, 0.16, 0.26], tint);
        const brace = surface.point(u + 0.42, f.height - 0.04);
        clipped.inserts.beam(surface.point(u, f.height - 0.55), brace, 0.095, 0.095, tint);
      }
      buildShapeFloors(child, clipped);
    }
    buildShapeRoof(child, meshes, recipe);
    if (feature.intent.kind === 'jetty') {
      const surface = createShapeWallSurface(child), count = Math.ceil(child.curve.length / 0.8);
      for (let i = 0; i < count; i++) {
        const u = child.curve.length * i / count;
        clipped.inserts.beam(surface.point(u, -0.05), surface.point(u, -0.55, -feature.intent.depth * 0.9), 0.14, 0.14, tint);
      }
    }
  }
}
