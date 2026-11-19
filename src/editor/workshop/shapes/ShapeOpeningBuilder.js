import { addWallPatch } from './ShapeWallSurface.js';
import { shapeRandom } from './ShapeMesh.js';
import { buildShapeOpeningCraft } from './ShapeOpeningCraft.js';
import { shapeOpeningRise } from './ShapeOpenings.js';
import { shapeStoneTint, shapeStoneTone } from './ShapeMasonryCourses.js';

function buildArchVoussoirs(plan, meshes, recipe, surface, o, dress) {
  if (recipe.detail < 2 || o.profile === 'square' || o.width < 0.45) return;
  const p = plan.primitive;
  const center = o.at * surface.length;
  const ultra = recipe.detail >= 3;
  const count = ultra
    ? Math.max(9, Math.min(17, Math.round(o.width / 0.16) | 1))
    : Math.max(7, Math.min(13, Math.round(o.width / 0.22) | 1));
  const springY = o.bottom + o.height - shapeOpeningRise(o);
  const fullDepth = p.kind === 'curved-wall' ? 0.1 : p.thickness + 0.14;
  const outerOff = p.thickness / 2 + 0.095;
  for (let i = 0; i < count; i++) {
    const u0 = center - o.width / 2 + (o.width * i) / count + 0.004;
    const u1 = center - o.width / 2 + (o.width * (i + 1)) / count - 0.004;
    const mid = (u0 + u1) / 2;
    const top = [u0, u1].map((u) => Math.max(springY, surface.gaps(u).find((g) => g.opening.id === o.id)?.top ?? o.bottom + o.height));
    const ceil = surface.ceiling ? surface.ceiling(mid) : p.height;
    if (Math.max(...top) >= ceil - 0.02) continue;
    const keystone = i === (count >> 1);
    const band = keystone ? 0.19 : 0.15;
    const proud = keystone ? 0.022 : 0;
    const tone = shapeStoneTone(recipe, plan, 'voussoir', `${o.id}:${i}`).map((v) => v * (keystone ? 1.07 : 1.02));
    for (const side of p.kind === 'curved-wall' ? [-1, 1] : [1]) {
      addWallPatch(
        meshes.trim,
        surface,
        u0,
        u1,
        top,
        top.map((y) => Math.min(ceil, y + band)),
        (outerOff + proud) * side,
        (fullDepth + proud) * side,
        tone,
        { bevel: true, bevelSize: 0.014, start: true, end: true },
      );
    }
  }
}

function buildOpeningMullions(meshes, surface, o, p, ceiling, dress) {
  if (!o.mullions || o.mullions === 'none') return;
  const center = o.at * surface.length;
  const topY = Math.min(ceiling, o.bottom + o.height - shapeOpeningRise(o) * 0.25) - 0.04;
  if (topY <= o.bottom + 0.15) return;
  if (o.mullions === 'post') {
    const wood = meshes.inserts ?? meshes.trim;
    wood.beam(surface.point(center, o.bottom + 0.02, 0.04), surface.point(center, topY, 0.04), 0.11, 0.11, [0.85, 0.85, 0.85]);
    const springY = o.bottom + o.height - shapeOpeningRise(o);
    if (springY > o.bottom + 0.5 && springY < topY - 0.15) {
      wood.beam(
        surface.point(center - o.width * 0.44, springY, 0.04),
        surface.point(center + o.width * 0.44, springY, 0.04),
        0.09,
        0.09,
        [0.82, 0.82, 0.82],
      );
    }
    return;
  }
  const metal = meshes.metal ?? meshes.inserts ?? meshes.trim;
  const bars = Math.max(2, Math.min(6, Math.round(o.width / 0.34)));
  for (let i = 1; i < bars; i++) {
    const u = center - o.width / 2 + (o.width * i) / bars;
    const barTop = Math.min(ceiling, surface.gaps(u).find((g) => g.opening.id === o.id)?.top ?? topY) - 0.03;
    if (barTop > o.bottom + 0.12) {
      metal.beam(surface.point(u, o.bottom + 0.02, 0.02), surface.point(u, barTop, 0.02), 0.035, 0.035, [0.46, 0.47, 0.48]);
    }
  }
  const midY = o.bottom + (topY - o.bottom) * 0.55;
  metal.beam(
    surface.point(center - o.width * 0.46, midY, 0.02),
    surface.point(center + o.width * 0.46, midY, 0.02),
    0.032,
    0.032,
    dress.map((c) => c * 0.5),
  );
}

export function buildShapeOpenings(plan, meshes, recipe, surface) {
  const p = plan.primitive;
  const dress = shapeStoneTint(recipe, plan);
  const fullDepth = p.kind === 'curved-wall' ? 0.09 : p.thickness + 0.14;
  const trim = (u0, u1, y0, y1, offset, thickness, color, caps) => {
    for (const side of p.kind === 'curved-wall' ? [-1, 1] : [1]) {
      addWallPatch(
        meshes.trim,
        surface,
        u0,
        u1,
        y0,
        y1,
        offset * side,
        thickness * side,
        color,
        { bevel: recipe.detail >= 2, ...caps },
      );
    }
  };
  for (const o of plan.openings ?? p.openings ?? []) {
    const center = o.at * surface.length;
    const half = o.width / 2;
    const ceil = surface.ceiling ? surface.ceiling(center) : p.height;
    const radius = shapeOpeningRise(o);
    const jambTop = Math.min(ceil, o.bottom + o.height - radius);
    const jambW = o.role === 'slit' ? 0.08 : 0.14;
    if (jambTop > o.bottom + 0.02) {
      trim(center - half - jambW, center - half, o.bottom, jambTop, p.thickness / 2 + 0.08, fullDepth, dress);
      trim(center + half, center + half + jambW, o.bottom, jambTop, p.thickness / 2 + 0.08, fullDepth, dress);
    }
    const steps = o.role === 'door' ? Math.max(8, Math.ceil(o.width / 0.12)) : o.role === 'slit' ? 4 : 24;
    for (let i = 0; i < steps; i++) {
      const u0 = center - half + (o.width * i) / steps;
      const u1 = center - half + (o.width * (i + 1)) / steps;
      const top = [u0, u1].map(
        (u) => surface.gaps(u).find((g) => g.opening.id === o.id)?.top ?? Math.min(ceil, o.bottom + o.height),
      );
      if (!(o.profile === 'square' && o.bottom + o.height >= ceil)) {
        const capH = o.profile === 'square' ? 0.14 : 0.12;
        trim(
          u0 + (o.role === 'door' ? 0.004 : 0),
          u1 - (o.role === 'door' ? 0.004 : 0),
          top,
          top.map((y) => Math.min(ceil, y + capH)),
          p.thickness / 2 + 0.085,
          fullDepth,
          dress,
          { start: i === 0, end: i === steps - 1 },
        );
      }
      if (o.role === 'slit') {
        addWallPatch(meshes.walls, surface, u0, u1, o.bottom, top, -p.thickness / 2 + 0.06, 0.02, [0.06, 0.06, 0.07]);
      } else if (o.role !== 'arch') {
        const mesh = o.role === 'door' ? meshes.inserts : meshes.glazing;
        const tint = o.role === 'door'
          ? 0.72 + shapeRandom(recipe.seed, plan.id, 'door-planks', `${o.id}:${i}`) * 0.2
          : 0.78;
        addWallPatch(
          mesh,
          surface,
          u0 + (o.role === 'door' ? 0.004 : 0),
          u1 - (o.role === 'door' ? 0.004 : 0),
          o.bottom + 0.03,
          top.map((y) => y - 0.04),
          o.role === 'window' ? -0.02 : 0,
          0.025,
          [tint, tint, tint],
        );
      }
    }
    if (recipe.detail >= 2 && o.profile === 'square' && o.bottom + o.height < ceil - 0.18 && ['window', 'door', 'slit'].includes(o.role)) {
      const hoodY = Math.min(ceil, o.bottom + o.height + 0.13);
      trim(center - half - 0.13, center + half + 0.13, hoodY - 0.04, hoodY + 0.04, p.thickness / 2 + 0.135, 0.16, dress.map((c) => c * 1.04));
    }
    buildArchVoussoirs(plan, meshes, recipe, surface, o, dress);
    buildOpeningMullions(meshes, surface, o, p, ceil, dress);
    buildShapeOpeningCraft(o, meshes, surface, recipe);
    if (o.role === 'door' || (o.role === 'arch' && o.bottom < 0.08 && p.elevation < 0.2)) {
      const count = o.role === 'door' ? 12 : 6;
      for (let i = 0; i < count; i++) {
        const a = center - half + (o.width * i) / count;
        const b = a + o.width / count;
        const worn = (u) => o.bottom + (o.role === 'arch' ? 0.06 : 0.045 - p.age * 0.026 * Math.sin(Math.PI * (u - center + half) / o.width) ** 2);
        const reach = o.role === 'arch' ? p.thickness / 2 + 0.28 : p.thickness / 2 + 0.25;
        const points = [
          surface.point(a, worn(a), reach),
          surface.point(b, worn(b), reach),
          surface.point(b, worn(b), -p.thickness / 2),
          surface.point(a, worn(a), -p.thickness / 2),
        ];
        meshes.trim.quad(...(surface.clockwise ? points : points.toReversed()), [0.88, 0.88, 0.85]);
      }
      if (o.role === 'arch' && p.kind === 'curved-volume') {
        trim(center - half - 0.1, center + half + 0.1, 0, 0.065, p.thickness / 2 + 0.28, p.thickness + 0.3, dress.map((c) => c * 0.94));
      }
    }
    if (o.role === 'window' || o.role === 'slit') {
      const sillPad = o.role === 'slit' ? 0.1 : 0.16;
      trim(
        center - half - sillPad,
        center + half + sillPad,
        o.bottom - 0.08,
        o.bottom + 0.02,
        p.thickness / 2 + (o.role === 'slit' ? 0.12 : 0.16),
        o.role === 'slit' ? 0.18 : 0.23,
        dress,
      );
    }
    if (o.role === 'window') {
      meshes.inserts.beam(
        surface.point(center, o.bottom + 0.03, 0.045),
        surface.point(center, Math.min(ceil, o.bottom + o.height) - 0.04, 0.045),
        0.06,
        0.06,
        dress,
      );
      // Glass follows the host curve, so its crossbar follows that same surface.
      const count = Math.max(2, Math.ceil(o.width / 0.065));
      const y = o.bottom + o.height * 0.5;
      for (let i = 0; i < count; i++) {
        const a = center - half + (o.width * i) / count;
        const b = center - half + (o.width * (i + 1)) / count;
        addWallPatch(meshes.inserts, surface, a, b, y - 0.0275, y + 0.0275, 0.075, 0.055, [1, 1, 1],
          { start: i === 0, end: i === count - 1, grainAlong: 'u' });
      }
    }
  }
}
