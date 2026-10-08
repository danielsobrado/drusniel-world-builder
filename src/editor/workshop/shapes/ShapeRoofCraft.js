import { placeShapePoint } from './ShapePaths.js';
import { shapeRandom } from './ShapeMesh.js';

export function buildShapeRoofCraft(plan, meshes, recipe, surface, hidden) {
  const p = plan.primitive;
  if (p.roof.family === 'gable') {
    const half = p.footprint.width * p.taper / 2 + p.thickness / 2 + p.roof.overhang;
    const count = Math.ceil(half * 2 / 0.38);
    for (let i = 0; i < count; i++) {
      const x0 = -half + half * 2 * i / count + 0.008, x1 = -half + half * 2 * (i + 1) / count - 0.008;
      const point = (x, t) => {
        const [wx, wz] = placeShapePoint(p, [x, Math.cos(t) * 0.095]);
        const [rx, rz] = placeShapePoint(p, [x, 0]);
        return [wx, surface.heightAt(rx, rz) + 0.025 + Math.sin(t) * 0.09, wz];
      };
      const v = 0.86 + shapeRandom(recipe.seed, p.id, 'ridge-cap', i) * 0.12;
      for (let arc = 0; arc < 6; arc++) {
        const a = arc * Math.PI / 6, b = (arc + 1) * Math.PI / 6;
        const quad = [point(x0, a), point(x0, b), point(x1, b), point(x1, a)];
        if (!hidden(quad)) meshes.roof.quad(...quad.toReversed(), [v, v, v]);
      }
    }
  }
  if (['cone', 'bell', 'spire'].includes(p.roof.family)) {
    const top = surface.point(0, 0);
    const profile = [[0, 0.055], [0.045, 0.08], [0.085, 0.042], [0.17, 0.028], [0.29, 0]];
    for (let band = 1; band < profile.length; band++) for (let i = 0; i < 12; i++) {
      const point = (ring, index) => {
        const [y, radius] = profile[ring], angle = index * Math.PI / 6;
        return [top[0] + Math.cos(angle) * radius, top[1] + y, top[2] + Math.sin(angle) * radius];
      };
      const quad = [point(band - 1, i), point(band, i), point(band, i + 1), point(band - 1, i + 1)];
      if (!hidden(quad)) meshes.metal.quad(...quad, [1.12, 0.93, 0.67]);
    }
  }
  for (const detail of plan.decorations ?? []) {
    if (detail.role !== 'chimney') continue;
    const [x, base, z] = detail.position, height = detail.top - base;
    if (hidden([[x, detail.top + 0.09, z]])) continue;
    const count = Math.max(3, Math.ceil(height / 0.25));
    for (let i = 0; i < count; i++) {
      const v = 0.73 + shapeRandom(recipe.seed, p.id, 'chimney-stone', i) * 0.18;
      meshes.trim.box([x, base + height * (i + 0.5) / count, z], [0.52, height / count - 0.01, 0.5], [v * 1.02, v, v * 0.94]);
    }
    // Four coping stones retain an actual open flue, with a dark interior below.
    for (const side of [-1, 1]) {
      meshes.trim.box([x + side * 0.25, detail.top + 0.02, z], [0.16, 0.13, 0.68], [1, 1, 1]);
      meshes.trim.box([x, detail.top + 0.02, z + side * 0.25], [0.36, 0.13, 0.16], [1, 1, 1]);
    }
    meshes.roof.box([x, detail.top - 0.12, z], [0.35, 0.03, 0.35], [0.08, 0.08, 0.08]);
  }
}
