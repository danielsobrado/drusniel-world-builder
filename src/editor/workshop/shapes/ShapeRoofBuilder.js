import { createShapeRoofSurface } from './ShapeRoofSurface.js';
import { createShapeRoofOcclusion, clipShapeRoofMesh } from './ShapeRoofOcclusion.js';
import { buildShapeRoofTiles } from './ShapeRoofTiles.js';
import { buildShapeRoofCraft } from './ShapeRoofCraft.js';
import { buildShapeRoofJunctions } from './ShapeRoofJunctionBuilder.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';
import { shapeWallCoreMesh, SHAPE_MASONRY_CORE_TONE } from './ShapeMasonryCourses.js';
import { buildShapeProfileRail } from './ShapeProfileRail.js';
import { shapeStoneTint } from './ShapeMasonryCourses.js';
import { addWallPatch, wallSolidBands } from './ShapeWallSurface.js';
import { hasShapeRuin } from './ShapeRuin.js';

// Overhangs show boarded sarking from below; bare slate there reads as a hole in the roof.
const SOFFIT_TONE = Object.freeze([0.78, 0.74, 0.7]);

export function buildShapeRoof(plan, sourceMeshes, recipe) {
  if (plan.roofReplaced) return;
  const p = plan.primitive;
  if (p.roof.family === 'flat' && hasShapeRuin(p) && p.ruin.amount >= 0.25) return;
  const surface = createShapeRoofSurface(plan),
    length = plan.curve.length;
  const mask = createShapeRoofOcclusion(plan), hidden = mask.hidden;
  const meshes = Object.fromEntries(Object.entries(sourceMeshes).map(([slot, mesh]) => [slot, clipShapeRoofMesh(mesh, mask)]));
  meshes.trim = clipShapeRoofMesh(sourceMeshes.trim, createShapeRoofOcclusion(plan, { roofMargin: 0.12 }));
  const rings = p.roof.family === 'flat' ? 1 : recipe.detail >= 2 ? 20 : 10;
  const samples = plan.curve.samples.length;
  const paved = p.roof.family === 'flat' && plan.crown && meshes.deck;
  const deckTone = shapeStoneTint(recipe, plan).map((v) => v * 0.78);
  const roofQuad = (quad, color, solid = false) => {
    const area = quad.reduce((sum, a, i) => {
      const b = quad[(i + 1) % quad.length];
      return sum + a[0] * b[2] - b[0] * a[2];
    }, 0);
    if (Math.abs(area) < tolerance.length * tolerance.length) return false;
    const top = surface.wall.clockwise ? quad : quad.toReversed();
    (paved || meshes.roof).quad(...top, paved ? deckTone : color, top.map((v) => surface.uvAt(v[0], v[2])), top.map((v) => surface.normalAt(v[0], v[2])));
    if (solid) {
      const underside = quad.map(([x, y, z]) => [x, y - 0.06, z]);
      if (surface.wall.clockwise) meshes.inserts.quad(...underside.toReversed(), SOFFIT_TONE);
      else meshes.inserts.quad(...underside, SOFFIT_TONE);
    }
    return true;
  };
  for (let row = 0; row < rings; row++) {
    const t0 = row / rings,
      t1 = (row + 1) / rings;
    for (let i = 0; i < samples; i++) {
      const u0 = plan.curve.samples[i].distance,
        u1 = i + 1 < samples ? plan.curve.samples[i + 1].distance : length;
      const quad = [
        surface.point(u0, t0),
        surface.point(u0, t1),
        surface.point(u1, t1),
        surface.point(u1, t0),
      ];
      roofQuad(quad, [0.94, 0.97, 1], true);
    }
  }
  // Close the wall up to the roof surface; split around any gable-triangle openings above wall height.
  const core = shapeWallCoreMesh(plan, meshes, recipe);
  const coreTone = core === meshes.walls ? [1, 1, 1] : SHAPE_MASONRY_CORE_TONE;
  const gableOpenings = (plan.openings ?? p.openings ?? []).filter((o) => o.bottom + o.height > p.height + tolerance.length);
  const wallBoundaries = plan.curve.samples.map((s) => s.distance);
  if (plan.curve.closed) wallBoundaries.push(length);
  for (const o of gableOpenings) {
    const steps = Math.max(2, Math.min(16, Math.ceil(o.width / 0.04)));
    for (let k = 0; k <= steps; k++) {
      const d = o.at * length - o.width / 2 + (o.width * k) / steps;
      wallBoundaries.push(plan.curve.closed ? ((d % length) + length) % length : Math.max(0, Math.min(length, d)));
    }
  }
  const wallDistances = [...new Set(wallBoundaries)].sort((a, b) => a - b);
  const gableTopDrop = p.surface === 'masonry' && recipe.detail >= 2 ? 0.04 : 0;
  for (let i = 0; i < wallDistances.length - 1; i++) {
    const u0 = wallDistances[i],
      u1 = wallDistances[i + 1];
    const a = surface.wall.point(u0, p.height, p.thickness / 2),
      b = surface.wall.point(u1, p.height, p.thickness / 2);
    const h0 = Math.max(p.height, surface.heightAt(a[0], a[2]) - p.elevation);
    const h1 = Math.max(p.height, surface.heightAt(b[0], b[2]) - p.elevation);
    if (h0 <= p.height + tolerance.length && h1 <= p.height + tolerance.length) continue;
    const mid = (u0 + u1) / 2;
    const hasGableGap = gableOpenings.length > 0 && surface.wall.gaps(mid).some((g) => g.top > p.height + tolerance.length);
    if (!hasGableGap) {
      const c = [b[0], Math.max(b[1], surface.heightAt(b[0], b[2]) - gableTopDrop), b[2]];
      const d = [a[0], Math.max(a[1], surface.heightAt(a[0], a[2]) - gableTopDrop), a[2]];
      if (surface.wall.clockwise) core.quad(a, b, c, d, coreTone);
      else core.quad(d, c, b, a, coreTone);
      continue;
    }
    const maxH = Math.max(h0, h1);
    for (const band of wallSolidBands(surface.wall, u0, u1, p.height, maxH, false)) {
      const top = [Math.min(band.top[0], h0), Math.min(band.top[1], h1)];
      const bottom = [Math.min(band.bottom[0], top[0]), Math.min(band.bottom[1], top[1])];
      if (Math.max(top[0] - bottom[0], top[1] - bottom[1]) < tolerance.length) continue;
      addWallPatch(core, surface.wall, u0, u1, bottom, top, p.thickness / 2, p.thickness, coreTone, {
        ...(p.surface === 'masonry' ? { sideMesh: meshes.trim, sideColor: SHAPE_MASONRY_CORE_TONE } : {}),
        start: true,
        end: true,
      });
    }
  }
  buildShapeProfileRail(meshes.trim, t => surface.point(t * length, 1), length, 0.1, 0.12,
    recipe.detail, shapeStoneTint(recipe, plan).map((v) => v * 0.8), { closed: true, step: recipe.detail >= 2 ? 0.32 : 0.55 });
  buildShapeRoofCraft(plan, meshes, recipe, surface, hidden);
  if (recipe.detail >= 2 && p.roof.family !== 'flat') buildShapeRoofTiles(plan, meshes.roof, surface, recipe, () => false);
  buildShapeRoofJunctions(plan, meshes.flashing, surface);
}
