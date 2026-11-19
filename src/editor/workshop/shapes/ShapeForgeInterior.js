import { pointInShape } from './ShapeEnvelope.js';
import { shapeRandom } from './ShapeMesh.js';
import { shapeStoneTint } from './ShapeMasonryCourses.js';

function localTransform(primitive) {
  const angle = (primitive.rotation * Math.PI) / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const base = primitive.elevation + ((primitive.terrace ?? 0) > 0.05 ? 0.145 : 0.065);
  return (x, y, z) => [
    primitive.position[0] + x * cos - z * sin,
    base + y,
    primitive.position[1] + x * sin + z * cos,
  ];
}

function addLocalBox(mesh, toWorld, [cx, cy, cz], [w, h, d], color) {
  if (!mesh) return;
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const p = [
    toWorld(cx - hw, cy - hh, cz - hd), toWorld(cx + hw, cy - hh, cz - hd),
    toWorld(cx + hw, cy + hh, cz - hd), toWorld(cx - hw, cy + hh, cz - hd),
    toWorld(cx - hw, cy - hh, cz + hd), toWorld(cx + hw, cy - hh, cz + hd),
    toWorld(cx + hw, cy + hh, cz + hd), toWorld(cx - hw, cy + hh, cz + hd),
  ];
  for (const face of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]]) {
    mesh.quad(...face.map((i) => p[i]), color);
  }
}

function addTaperedHood(mesh, toWorld, [cx, y0, cz], [w0, d0], [w1, d1], h, color) {
  if (!mesh) return;
  const ring = (y, w, d) => [
    toWorld(cx - w / 2, y, cz - d / 2), toWorld(cx + w / 2, y, cz - d / 2),
    toWorld(cx + w / 2, y, cz + d / 2), toWorld(cx - w / 2, y, cz + d / 2),
  ];
  const bot = ring(y0, w0, d0), top = ring(y0 + h, w1, d1);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    mesh.quad(bot[i], bot[j], top[j], top[i], color);
  }
  mesh.quad(top[3], top[2], top[1], top[0], color);
}

/**
 * Blacksmith workshop interior: coursed masonry forge hearth with glowing embers,
 * tapered smoke hood, horn anvil on an oak block, and a banded quenching tub.
 */
export function buildShapeForgeInterior(plan, meshes, recipe, room) {
  const p = plan.primitive;
  const toWorld = localTransform(p);
  const innerW = Math.max(0.8, p.footprint.width - p.thickness * 2 - 0.35);
  const innerD = Math.max(0.8, p.footprint.depth - p.thickness * 2 - 0.35);
  const stone = shapeStoneTint(recipe, plan);
  const detail = recipe.detail >= 2;
  const hearthX = innerW >= 2.2 ? -innerW * 0.22 : 0;
  const hearthZ = -innerD * 0.22;
  const worldHearth = toWorld(hearthX, 0, hearthZ);
  if (!pointInShape([worldHearth[0], worldHearth[2]], room)) return;

  // Stone hearth firebox + raised hearth table + back chimney cheek
  const hw = Math.min(1.15, innerW * 0.42), hd = Math.min(0.82, innerD * 0.42);
  addLocalBox(meshes.trim, toWorld, [hearthX, 0.38, hearthZ], [hw, 0.76, hd], stone.map((c) => c * 0.86));
  addLocalBox(meshes.trim, toWorld, [hearthX, 0.78, hearthZ], [hw + 0.08, 0.08, hd + 0.08], stone.map((c) => c * 0.96));
  addLocalBox(meshes.trim, toWorld, [hearthX, 1.05, hearthZ - hd * 0.34], [hw * 0.92, 0.56, hd * 0.3], stone.map((c) => c * 0.82));

  // Glowing coal bed + dark soot bowl
  const glowMesh = meshes.glow ?? meshes.trim;
  addLocalBox(meshes.roof ?? meshes.trim, toWorld, [hearthX, 0.825, hearthZ + hd * 0.05], [hw * 0.62, 0.04, hd * 0.54], [0.1, 0.09, 0.09]);
  const coals = detail ? 8 : 2;
  for (let i = 0; i < coals; i++) {
    const rx = (shapeRandom(recipe.seed, p.id, 'forge-coal-x', i) - 0.5) * hw * 0.44;
    const rz = (shapeRandom(recipe.seed, p.id, 'forge-coal-z', i) - 0.5) * hd * 0.36;
    const sz = 0.08 + shapeRandom(recipe.seed, p.id, 'forge-coal-s', i) * 0.07;
    addLocalBox(glowMesh, toWorld, [hearthX + rx, 0.86, hearthZ + hd * 0.05 + rz], [sz, sz * 0.65, sz], [1, 0.74, 0.38]);
  }

  // Iron smoke hood rising toward the ceiling
  const hoodBottom = Math.min(p.height - 0.55, 1.48);
  const hoodTop = Math.min(p.height - 0.06, 2.25);
  if (hoodTop > hoodBottom + 0.2) {
    const metal = meshes.metal ?? meshes.trim;
    addTaperedHood(metal, toWorld, [hearthX, hoodBottom, hearthZ], [hw * 1.04, hd * 0.92], [0.36, 0.34], hoodTop - hoodBottom, [0.34, 0.35, 0.36]);
    if (detail) {
      for (const side of [-1, 1]) {
        metal.beam(toWorld(hearthX + side * hw * 0.42, 0.82, hearthZ - hd * 0.3), toWorld(hearthX + side * hw * 0.42, hoodBottom + 0.03, hearthZ + hd * 0.32), 0.035, 0.035, [0.3, 0.3, 0.32]);
      }
    }
  }

  // Horn anvil on oak stump positioned in front-right of hearth
  const anvilX = innerW >= 2.2 ? Math.min(innerW * 0.24, 0.95) : 0;
  const anvilZ = innerW >= 2.2 ? Math.min(innerD * 0.14, 0.35) : innerD * 0.25;
  const worldAnvil = toWorld(anvilX, 0, anvilZ);
  if (pointInShape([worldAnvil[0], worldAnvil[2]], room)) {
    const wood = meshes.inserts ?? meshes.trim;
    const metal = meshes.metal ?? meshes.trim;
    addLocalBox(wood, toWorld, [anvilX, 0.24, anvilZ], [0.38, 0.48, 0.38], [0.76, 0.72, 0.66]);
    addLocalBox(metal, toWorld, [anvilX, 0.52, anvilZ], [0.3, 0.08, 0.22], [0.4, 0.41, 0.42]);
    addLocalBox(metal, toWorld, [anvilX, 0.61, anvilZ], [0.18, 0.12, 0.15], [0.38, 0.39, 0.4]);
    addLocalBox(metal, toWorld, [anvilX - 0.02, 0.71, anvilZ], [0.42, 0.1, 0.2], [0.5, 0.51, 0.52]);
    if (detail) {
      addLocalBox(metal, toWorld, [anvilX + 0.26, 0.72, anvilZ], [0.18, 0.06, 0.1], [0.54, 0.55, 0.56]);
    }
  }

  // Staved water quenching tub when space allows
  if (detail && innerW >= 2.8) {
    const tubX = -innerW * 0.32, tubZ = innerD * 0.18;
    const worldTub = toWorld(tubX, 0, tubZ);
    if (pointInShape([worldTub[0], worldTub[2]], room)) {
      const wood = meshes.inserts ?? meshes.trim;
      const metal = meshes.metal ?? meshes.trim;
      addLocalBox(wood, toWorld, [tubX, 0.26, tubZ], [0.48, 0.52, 0.48], [0.74, 0.7, 0.64]);
      addLocalBox(metal, toWorld, [tubX, 0.18, tubZ], [0.51, 0.04, 0.51], [0.35, 0.36, 0.38]);
      addLocalBox(metal, toWorld, [tubX, 0.42, tubZ], [0.51, 0.04, 0.51], [0.35, 0.36, 0.38]);
      addLocalBox(meshes.glazing ?? meshes.trim, toWorld, [tubX, 0.49, tubZ], [0.4, 0.03, 0.4], [0.35, 0.52, 0.58]);
    }
  }
}
