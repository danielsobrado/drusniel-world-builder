import { addWallPatch } from './ShapeWallSurface.js';
import { shapeRandom } from './ShapeMesh.js';
import { shapeOpeningRise } from './ShapeOpenings.js';
import { SHAPE_COURSE_HEIGHT } from './ShapeProfile.js';
import { shapeStoneTone } from './ShapeMasonryCourses.js';

export function isMonumentalGate(opening) {
  return (opening.role === 'arch' || opening.role === 'door') && opening.width >= 1.7;
}

/**
 * Multi-order sculpted stone gate arch: stepped pier plinths, irregular coursed jamb stones,
 * projecting molded impost capitals, radiating outer & recessed inner voussoirs, and a
 * course-vaulted stone passageway soffit so wide castle gates have zero flat straight tunnels.
 */
export function buildMonumentalGateArch(plan, meshes, recipe, surface, o) {
  const p = plan.primitive;
  const detail = recipe.detail >= 2;
  const ultra = recipe.detail >= 3;
  const center = o.at * surface.length;
  const half = o.width / 2;
  const ceil = surface.ceiling ? surface.ceiling(center) : p.height;
  const rise = shapeOpeningRise(o);
  const springY = Math.min(ceil, o.bottom + o.height - rise);
  const faces = p.kind === 'curved-wall' ? [-1, 1] : [1];
  const halfT = p.thickness / 2;
  const tone = (domain, key, boost = 1) => shapeStoneTone(recipe, plan, domain, `${o.id}:${key}`).map((v) => v * boost);
  const rand = (lane, key) => shapeRandom(recipe.seed, plan.id, `gate-${lane}`, `${o.id}:${key}`);

  const patchThrough = (u0, u1, y0, y1, pad, color, caps = {}) => {
    addWallPatch(meshes.trim, surface, u0, u1, y0, y1, halfT + pad, p.thickness + pad * 2, color, {
      bevel: detail,
      ...caps,
    });
  };

  // 1. Stepped molded stone plinth bases flanking the gate piers.
  const baseH = Math.min(0.48, Math.max(0.26, (springY - o.bottom) * 0.22));
  const pierW = 0.29;
  for (const s of [-1, 1]) {
    const a = s < 0 ? center - half - pierW - 0.1 : center + half;
    const b = s < 0 ? center - half : center + half + pierW + 0.1;
    patchThrough(a, b, o.bottom, o.bottom + baseH * 0.6, 0.23, tone('pier-base', `${s}:0`, 0.96), { bevelSize: 0.02 });
    patchThrough(a + (s < 0 ? 0.045 : 0), b - (s < 0 ? 0 : 0.045), o.bottom + baseH * 0.6, o.bottom + baseH, 0.185, tone('pier-base', `${s}:1`, 1.03), { bevelSize: 0.018 });
  }

  // 2. Irregular hand-cut coursed jamb stones up each pier (never one flat straight vertical bar).
  const impostH = 0.2;
  const jambStart = o.bottom + baseH;
  const jambEnd = Math.max(jambStart, springY - impostH);
  const courses = Math.max(2, Math.ceil((jambEnd - jambStart) / SHAPE_COURSE_HEIGHT));
  const courseH = courses > 0 ? (jambEnd - jambStart) / courses : 0;
  for (const s of [-1, 1]) {
    for (let row = 0; row < courses; row++) {
      const y0 = jambStart + row * courseH + 0.008;
      const y1 = jambStart + (row + 1) * courseH - 0.008;
      if (y1 - y0 < 0.06) continue;
      const alt = row % 2 === 0 ? 1.15 : 0.86;
      const w = pierW * alt + (rand('jamb-w', `${s}:${row}`) - 0.5) * 0.048;
      const proud = (rand('jamb-p', `${s}:${row}`) - 0.35) * 0.028;
      const a = s < 0 ? center - half - w : center + half;
      const b = s < 0 ? center - half : center + half + w;
      const depthBlocks = detail ? Math.max(1, Math.min(3, Math.round(p.thickness / 0.6))) : 1;
      for (let d = 0; d < depthBlocks; d++) {
        const zPad = 0.165 + proud;
        const zA = halfT + zPad - ((p.thickness + zPad * 2) * d) / depthBlocks;
        const zThick = (p.thickness + zPad * 2) / depthBlocks - (depthBlocks > 1 ? 0.01 : 0);
        addWallPatch(
          meshes.trim,
          surface,
          a,
          b,
          y0,
          y1,
          zA,
          zThick,
          tone('jamb', `${s}:${row}:${d}`, 0.98 + (d === 0 || d === depthBlocks - 1 ? 0.05 : -0.05)),
          { bevel: detail, bevelSize: 0.018 },
        );
      }
    }
    // 3. Projecting two-tier molded stone impost capital right at the arch springing line.
    if (springY > o.bottom + baseH + 0.15) {
      const a = s < 0 ? center - half - pierW - 0.11 : center + half - 0.025;
      const b = s < 0 ? center - half + 0.025 : center + half + pierW + 0.11;
      patchThrough(a, b, springY - impostH, springY - impostH * 0.42, 0.21, tone('impost', `${s}:0`, 0.99), { bevelSize: 0.018 });
      patchThrough(a - (s < 0 ? 0.05 : 0.018), b + (s < 0 ? 0.018 : 0.05), springY - impostH * 0.42, springY + 0.025, 0.26, tone('impost', `${s}:1`, 1.09), { bevelSize: 0.02 });
    }
  }

  // 4. Double-order recessed stone arch: bold outer radiating voussoirs + inner vaulted stone tunnel ring.
  const count = ultra ? 15 : detail ? 11 : 7;
  const gapAt = (u) => Math.max(springY, surface.gaps(u).find((g) => g.opening.id === o.id)?.top ?? Math.min(ceil, o.bottom + o.height));
  const vaultCourses = detail ? Math.max(2, Math.min(4, Math.round(p.thickness / 0.55))) : 1;
  for (let i = 0; i < count; i++) {
    const u0 = center - half + (o.width * i) / count;
    const u1 = center - half + (o.width * (i + 1)) / count;
    const mid = (u0 + u1) / 2;
    const top = [u0, u1].map(gapAt);
    const localCeil = surface.ceiling ? surface.ceiling(mid) : ceil;
    if (Math.max(...top) >= localCeil - 0.02) continue;
    const keystone = i === (count >> 1);
    const jitterBand = (rand('vous-h', i) - 0.5) * 0.045;
    const jitterProud = (rand('vous-p', i) - 0.4) * 0.026;
    const outerBand = (keystone ? 0.4 : 0.3) + jitterBand;
    const innerBand = 0.18;
    const outerOff = halfT + 0.205 + (keystone ? 0.038 : 0) + jitterProud;
    const outerDepth = Math.min(0.28, halfT * 0.45 + 0.16);

    // Outer bold stepped voussoir ring on each exterior face
    for (const side of faces) {
      addWallPatch(
        meshes.trim,
        surface,
        u0 + 0.006,
        u1 - 0.006,
        top.map((y) => y + 0.04),
        top.map((y) => Math.min(localCeil, y + outerBand)),
        side * outerOff,
        side * outerDepth,
        tone('voussoir-outer', `${side}:${i}`, keystone ? 1.1 : 1.04),
        { bevel: detail, bevelSize: 0.018, start: true, end: true },
      );
    }

    // Inner recessed arch order + vaulted stone soffit across the full tunnel thickness
    const innerStart = halfT + 0.12;
    const totalDepth = p.thickness + 0.24;
    const stepD = totalDepth / vaultCourses;
    for (let v = 0; v < vaultCourses; v++) {
      const zOff = innerStart - v * stepD;
      const zThick = stepD - (vaultCourses > 1 ? 0.01 : 0);
      const exterior = v === 0 || v === vaultCourses - 1;
      addWallPatch(
        meshes.trim,
        surface,
        u0 + 0.004,
        u1 - 0.004,
        top.map((y) => y - 0.015),
        top.map((y) => Math.min(localCeil, y + innerBand)),
        zOff,
        zThick,
        tone('voussoir-vault', `${i}:${v}`, exterior ? 0.96 : 0.84),
        { bevel: detail && exterior, bevelSize: 0.014, start: true, end: true },
      );
    }
  }
}

/** Heavy double-leaf Gothic panelled fortress doors for wide closed castle portals. */
export function buildMonumentalGateDoors(plan, meshes, recipe, surface, o) {
  const detail = recipe.detail >= 2;
  const center = o.at * surface.length;
  const half = o.width / 2;
  const rise = shapeOpeningRise(o);
  const springY = o.bottom + o.height - rise;
  const gapAt = (u) => surface.gaps(u).find((g) => g.opening.id === o.id)?.top ?? o.bottom + o.height;
  const planks = Math.max(10, Math.min(18, Math.round(o.width / 0.18) & ~1));
  const leafOff = 0.03;
  const leafSides = plan.primitive.kind === 'curved-wall' ? [1, -1] : [1];

  // Individual recessed vertical oak planks with a crisp central meeting gap between the two doors
  for (let i = 0; i < planks; i++) {
    const u0 = center - half + (o.width * i) / planks;
    const u1 = center - half + (o.width * (i + 1)) / planks;
    const midSeam = i === planks / 2 - 1 || i === planks / 2;
    const leftGap = i === planks / 2 ? 0.018 : 0.005;
    const rightGap = i === planks / 2 - 1 ? 0.018 : 0.005;
    const top = [u0, u1].map((u) => gapAt(u) - 0.03);
    const tint = 0.68 + shapeRandom(recipe.seed, plan.id, 'gate-plank', `${o.id}:${i}`) * 0.2;
    addWallPatch(
      meshes.inserts,
      surface,
      u0 + leftGap,
      u1 - rightGap,
      o.bottom + 0.03,
      top,
      leafOff,
      0.06,
      [tint, tint, tint],
      { bevel: detail && !midSeam, bevelSize: 0.008 },
    );
  }

  if (!detail) return;

  // Raised central meeting stile + Gothic pointed-panel wooden ribs on each door face
  const frameTone = [0.62, 0.58, 0.54];
  addWallPatch(meshes.inserts, surface, center - 0.045, center + 0.045, o.bottom + 0.04, gapAt(center) - 0.04, 0.055, 0.11, frameTone, { bevel: true, bevelSize: 0.008 });
  for (const faceSign of leafSides) {
    const railOff = faceSign * 0.052;
    const railThick = faceSign * 0.032;
    const ribOff = faceSign * 0.048;
    for (const y of [o.bottom + 0.24, o.bottom + (springY - o.bottom) * 0.54, springY - 0.14]) {
      if (y > o.bottom + 0.1 && y < springY) {
        addWallPatch(meshes.inserts, surface, center - half + 0.05, center - 0.05, y - 0.055, y + 0.055, railOff, railThick, frameTone, { grainAlong: 'u' });
        addWallPatch(meshes.inserts, surface, center + 0.05, center + half - 0.05, y - 0.055, y + 0.055, railOff, railThick, frameTone, { grainAlong: 'u' });
      }
    }
    // Pointed Gothic panel ribs on each leaf
    for (const s of [-1, 1]) {
      const leafCenter = center + s * (half * 0.5);
      const leafHalf = half * 0.34;
      const ribBottom = o.bottom + 0.3;
      const ribSpring = Math.min(springY - 0.2, o.bottom + o.height * 0.56);
      const ribApex = Math.min(gapAt(leafCenter) - 0.14, ribSpring + leafHalf * 1.1);
      if (ribApex > ribSpring + 0.12) {
        for (const side of [-1, 1]) {
          const edgeU = leafCenter + side * leafHalf;
          meshes.inserts.beam(surface.point(edgeU, ribBottom, ribOff), surface.point(edgeU, ribSpring, ribOff), 0.055, 0.036, frameTone);
          meshes.inserts.beam(surface.point(edgeU, ribSpring, ribOff), surface.point(leafCenter, ribApex, ribOff), 0.055, 0.036, frameTone);
        }
      }
    }

    // Forged iron strap hinges, studs, and twin ring handles
    if (!meshes.metal) continue;
    const iron = [0.42, 0.44, 0.46];
    const ironOff = faceSign * 0.062;
    const studOff = faceSign * 0.072;
    for (const s of [-1, 1]) {
      for (const y of [o.bottom + 0.42, springY - 0.32]) {
        const a = s < 0 ? center - half + 0.04 : center + 0.16;
        const b = s < 0 ? center - 0.16 : center + half - 0.04;
        meshes.metal.beam(surface.point(a, y, ironOff), surface.point(b, y, ironOff), 0.058, 0.022, iron);
        for (let k = 0; k < 4; k++) {
          const u = a + ((b - a) * (k + 0.5)) / 4;
          meshes.metal.box(surface.point(u, y, studOff), [0.028, 0.028, 0.02], [0.75, 0.74, 0.7]);
        }
      }
      const ringU = center + s * 0.2;
      const ringY = o.bottom + Math.min(1.35, (springY - o.bottom) * 0.52);
      const r = 0.075;
      for (let i = 0; i < 10; i++) {
        const pt = (ang, rad) => surface.point(ringU + Math.cos(ang) * rad, ringY + Math.sin(ang) * rad * 1.12, studOff);
        const a = (i * Math.PI * 2) / 10, b = ((i + 1) * Math.PI * 2) / 10;
        const verts = [pt(a, r), pt(b, r), pt(b, r - 0.016), pt(a, r - 0.016)];
        meshes.metal.quad(...((surface.clockwise === (faceSign > 0)) ? verts : verts.toReversed()), [0.95, 0.85, 0.58]);
      }
    }
  }
}
