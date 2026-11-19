import { pointInShape } from './ShapeEnvelope.js';
import { shapeStoneTint, shapeStoneTone } from './ShapeMasonryCourses.js';

function taperedBox(mesh, [cx, y0, cz], [w0, d0], [w1, d1], height, color, detail = 2, [fx, fz] = [0, 1], [tx, tz] = [1, 0]) {
  const y1 = y0 + height;
  const ring = (y, w, d) => {
    const hw = w / 2, hd = d / 2;
    return [
      [cx - tx * hw - fx * hd, y, cz - tz * hw - fz * hd],
      [cx + tx * hw - fx * hd, y, cz + tz * hw - fz * hd],
      [cx + tx * hw + fx * hd, y, cz + tz * hw + fz * hd],
      [cx - tx * hw + fx * hd, y, cz - tz * hw + fz * hd],
    ];
  };
  const bot = ring(y0, w0, d0), top = ring(y1, w1, d1);
  // Ensure consistent outward orientation when (tangent x outward) points down vs up
  const ccw = tx * fz - tz * fx < 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const shade = i === 2 ? 1.02 : i === 0 ? 0.88 : 0.94;
    const quad = [bot[i], bot[j], top[j], top[i]];
    mesh.quad(...(ccw ? quad : quad.toReversed()), color.map((c) => c * shade));
  }
  if (detail >= 2) {
    const cap = [top[0], top[1], top[2], top[3]];
    mesh.quad(...(ccw ? cap : cap.toReversed()), color.map((c) => c * 1.06));
  }
  const baseCap = [bot[3], bot[2], bot[1], bot[0]];
  mesh.quad(...(ccw ? baseCap : baseCap.toReversed()), color.map((c) => c * 0.72));
}

function addFlaredCap(meshes, [cx, topY, cz], [w, d], tint, fx, fz, tx, tz, detail) {
  // Stepped necking band + flared crown + open recessed flue well
  taperedBox(meshes.trim, [cx, topY - 0.14, cz], [w * 1.04, d * 1.04], [w * 1.18, d * 1.18], 0.09, tint.map((c) => c * 0.94), detail, [fx, fz], [tx, tz]);
  taperedBox(meshes.trim, [cx, topY - 0.05, cz], [w * 1.18, d * 1.18], [w * 1.34, d * 1.34], 0.11, tint.map((c) => c * 1.04), detail, [fx, fz], [tx, tz]);
  // Dark flue interior plate seated just inside the crown
  const flueW = Math.max(0.18, w * 0.56), flueD = Math.max(0.18, d * 0.56);
  const hw = flueW / 2, hd = flueD / 2;
  const pts = [
    [cx - tx * hw - fx * hd, topY + 0.055, cz - tz * hw - fz * hd],
    [cx + tx * hw - fx * hd, topY + 0.055, cz + tz * hw - fz * hd],
    [cx + tx * hw + fx * hd, topY + 0.055, cz + tz * hw + fz * hd],
    [cx - tx * hw + fx * hd, topY + 0.055, cz - tz * hw + fz * hd],
  ];
  const darkMesh = meshes.roof ?? meshes.glazing ?? meshes.trim;
  darkMesh.quad(...(tx * fz - tz * fx < 0 ? pts : pts.toReversed()), [0.09, 0.09, 0.09]);
}

function addRoofFlashing(meshes, [cx, roofY, cz], [w, d], surface, fx, fz, tx, tz) {
  if (!meshes.flashing || !surface) return;
  const hw = w / 2 + 0.14, hd = d / 2 + 0.14;
  const iw = w / 2 - 0.02, id = d / 2 - 0.02;
  const outer = [
    [cx - tx * hw - fx * hd, cz - tz * hw - fz * hd],
    [cx + tx * hw - fx * hd, cz + tz * hw - fz * hd],
    [cx + tx * hw + fx * hd, cz + tz * hw + fz * hd],
    [cx - tx * hw + fx * hd, cz - tz * hw + fz * hd],
  ].map(([x, z]) => [x, surface.heightAt(x, z) + 0.045, z]);
  const inner = [
    [cx - tx * iw - fx * id, cz - tz * iw - fz * id],
    [cx + tx * iw - fx * id, cz + tz * iw - fz * id],
    [cx + tx * iw + fx * id, cz + tz * iw + fz * id],
    [cx - tx * iw + fx * id, cz - tz * iw + fz * id],
  ].map(([x, z]) => [x, Math.max(roofY, surface.heightAt(x, z) + 0.14), z]);
  const eaves = surface.outline?.map((v) => [v[0], v[2]]);
  const ccw = tx * fz - tz * fx < 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    if (eaves && !pointInShape([(outer[i][0] + outer[j][0]) * 0.5, (outer[i][2] + outer[j][2]) * 0.5], eaves)) continue;
    const quad = [outer[i], outer[j], inner[j], inner[i]];
    meshes.flashing.quad(...(ccw ? quad : quad.toReversed()), [0.84, 0.89, 0.92]);
  }
}

/** Tapered coursed masonry chimney rising out of a roof slope. */
export function buildShapeRoofChimney(plan, detail, meshes, recipe, surface) {
  if (!meshes.trim) return;
  const [x, base, z] = detail.position;
  const height = Math.max(0.7, detail.top - base);
  const tint = shapeStoneTint(recipe, plan);
  if (recipe.detail < 2) {
    taperedBox(meshes.trim, [x, base, z], [0.64, 0.6], [0.48, 0.46], height, tint, 1);
    addFlaredCap(meshes, [x, detail.top, z], [0.48, 0.46], tint, 0, 1, 1, 0, 1);
    return;
  }
  const courses = Math.max(4, Math.ceil(height / 0.22));
  const stepH = height / courses;
  for (let i = 0; i < courses; i++) {
    const t0 = i / courses, t1 = (i + 1) / courses;
    const w0 = 0.68 - t0 * 0.18, d0 = 0.64 - t0 * 0.16;
    const w1 = 0.68 - t1 * 0.18, d1 = 0.64 - t1 * 0.16;
    const tone = shapeStoneTone(recipe, plan, 'chimney-stone', i);
    taperedBox(meshes.trim, [x, base + i * stepH, z], [w0, d0], [w1, d1], stepH - 0.008, tone, 2);
  }
  // Small dark flue vent slit on the upper stack front
  if (meshes.glazing && height > 0.9) {
    meshes.glazing.box([x, detail.top - 0.34, z + 0.25], [0.14, 0.16, 0.05], [0.14, 0.14, 0.14]);
  }
  addFlaredCap(meshes, [x, detail.top, z], [0.5, 0.48], tint, 0, 1, 1, 0, 2);
  addRoofFlashing(meshes, [x, base, z], [0.68, 0.64], surface, 0, 1, 1, 0);
}

/**
 * Grounded or wall-engaged stone chimney stack with optional stepped lower hearth breast,
 * corner quoins, roof flashing collar, flue slit and flared chimney crown.
 */
export function buildShapeFeatureChimney(plan, feature, meshes, recipe, roofSurface) {
  const c = feature.chimney;
  if (!c || !meshes.trim) return;
  const [cx, baseY, cz] = c.center;
  const [fx, fz] = c.outward;
  const [tx, tz] = c.tangent;
  const tint = shapeStoneTint(recipe, plan);
  const detail = recipe.detail >= 2 ? 2 : 1;
  const totalH = c.topY - baseY;
  const grounded = c.bottom <= 0.15;
  const breastTop = grounded ? Math.min(totalH * 0.42, c.breastHeight) : 0;

  // Corbelled underside if elevated above ground
  if (!grounded && c.bottom > 0.15) {
    const corbelH = Math.min(0.75, c.bottom);
    const steps = detail >= 2 ? 3 : 1;
    for (let s = 0; s < steps; s++) {
      const f = (s + 1) / steps;
      const y0 = baseY - corbelH * (1 - s / steps);
      taperedBox(meshes.trim, [cx - fx * (1 - f) * c.depth * 0.22, y0, cz - fz * (1 - f) * c.depth * 0.22],
        [c.width * (0.4 + 0.6 * f), c.depth * (0.4 + 0.6 * f)], [c.width * (0.4 + 0.6 * f), c.depth * (0.4 + 0.6 * f)],
        corbelH / steps - 0.006, tint.map((v) => v * (0.8 + 0.05 * s)), detail, [fx, fz], [tx, tz]);
    }
  }

  // Lower stepped hearth plinth breast
  if (breastTop > 0.2) {
    const bw = c.width * 1.32, bd = c.depth * 1.28;
    const step1 = breastTop * 0.58;
    const off1 = bd * 0.14;
    taperedBox(meshes.trim, [cx + fx * off1, baseY, cz + fz * off1], [bw, bd], [bw * 0.96, bd * 0.96],
      step1, tint.map((v) => v * 0.86), detail, [fx, fz], [tx, tz]);
    taperedBox(meshes.trim, [cx + fx * off1 * 0.45, baseY + step1, cz + fz * off1 * 0.45],
      [bw * 0.94, bd * 0.94], [c.width, c.depth], breastTop - step1, tint.map((v) => v * 0.92), detail, [fx, fz], [tx, tz]);
  }

  // Main shaft from breastTop up to roof line, then tapered upper stack
  const shaftY0 = baseY + breastTop;
  const roofH = Math.max(shaftY0 + 0.2, Math.min(c.topY - 0.6, c.roofY));
  const topW = c.width * 0.68, topD = c.depth * 0.68;
  if (detail < 2) {
    if (roofH > shaftY0 + 0.05) {
      taperedBox(meshes.trim, [cx, shaftY0, cz], [c.width, c.depth], [c.width * 0.9, c.depth * 0.9], roofH - shaftY0, tint, 1, [fx, fz], [tx, tz]);
    }
    const stackH = Math.max(0.5, c.topY - roofH);
    taperedBox(meshes.trim, [cx, roofH, cz], [c.width * 0.9, c.depth * 0.9], [topW, topD], stackH, tint, 1, [fx, fz], [tx, tz]);
    addFlaredCap(meshes, [cx, Math.max(c.topY, roofH + stackH), cz], [topW, topD], tint, fx, fz, tx, tz, 1);
    return;
  }

  const course = 0.28;
  const stackCourses = Math.max(4, Math.ceil((c.topY - shaftY0) / course));
  const dh = (c.topY - shaftY0) / stackCourses;
  for (let i = 0; i < stackCourses; i++) {
    const y0 = shaftY0 + i * dh, y1 = y0 + dh;
    const t0 = Math.max(0, (y0 - shaftY0) / Math.max(0.4, c.topY - shaftY0));
    const t1 = Math.max(0, (y1 - shaftY0) / Math.max(0.4, c.topY - shaftY0));
    const w0 = c.width + (topW - c.width) * (t0 * t0 * 0.6 + t0 * 0.4);
    const d0 = c.depth + (topD - c.depth) * (t0 * t0 * 0.6 + t0 * 0.4);
    const w1 = c.width + (topW - c.width) * (t1 * t1 * 0.6 + t1 * 0.4);
    const d1 = c.depth + (topD - c.depth) * (t1 * t1 * 0.6 + t1 * 0.4);
    const tone = shapeStoneTone(recipe, plan, 'feature-chimney', `${feature.intent.id}:${i}`);
    taperedBox(meshes.trim, [cx, y0, cz], [w0, d0], [w1, d1], dh - 0.008, tone, 2, [fx, fz], [tx, tz]);
  }
  // Flue vent slot seated flush against the upper outward shaft face
  if (meshes.glazing && c.topY - roofH > 0.55) {
    const ventY = c.topY - 0.42;
    const tv = Math.max(0, (ventY - shaftY0) / Math.max(0.4, c.topY - shaftY0));
    const ventD = c.depth + (topD - c.depth) * (tv * tv * 0.6 + tv * 0.4);
    const ventOff = ventD * 0.5;
    taperedBox(meshes.glazing, [cx + fx * ventOff, ventY - 0.09, cz + fz * ventOff], [0.14, 0.04], [0.14, 0.04], 0.18, [0.12, 0.12, 0.12], 1, [fx, fz], [tx, tz]);
  }
  addFlaredCap(meshes, [cx, c.topY, cz], [topW, topD], tint, fx, fz, tx, tz, 2);
  if (roofSurface && c.roofY > baseY && c.roofY < c.topY) {
    addRoofFlashing(meshes, [cx, c.roofY, cz], [c.width * 0.95, c.depth * 0.95], roofSurface, fx, fz, tx, tz);
  }
}
