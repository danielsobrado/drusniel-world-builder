import * as THREE from 'three/webgpu';
import { box, extrudedProfile, rod, stoneBlock, stoneBox } from '../gen/propKit.js';

const P = (x, y, z) => ({ x, y, z });

/** A point `along` the local X axis (turned by `yaw`), `rise` up and `across` its Z axis, from `at`. */
function local(at, yaw, along, rise, across = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return P(at.x + along * c + across * s, at.y + rise, at.z - along * s + across * c);
}

/**
 * A smith's anvil standing on `at`, its working face `height` metres up: splayed
 * feet with the arch between them, a pinched waist, the body with its heel and
 * the step down to the table, a tapering horn, and the hardy and pritchel holes
 * in a polished face plate.
 */
export function anvil(b, at, { yaw = 0, scale = 1, tint = 0x6c7078, faceTint = 0x9aa0aa } = {}) {
  const k = scale;
  const profile = (points) => points.map(([x, y]) => [x * k, y * k]);
  const shape = (points, depth, bevel) => extrudedProfile(profile(points), depth * k, { bevel: bevel * k, yaw, at });
  b.prop('iron', [
    // Feet: wide at the floor, the arch between them cut up from below.
    shape([[-0.62, 0], [-0.36, 0], [-0.28, 0.07], [0.28, 0.07], [0.36, 0], [0.62, 0], [0.6, 0.09],
      [0.46, 0.14], [0.36, 0.27], [-0.36, 0.27], [-0.46, 0.14], [-0.6, 0.09]], 0.58, 0.03),
    // Waist.
    shape([[-0.36, 0.26], [0.36, 0.26], [0.27, 0.49], [-0.27, 0.49]], 0.36, 0.025),
    // Body: heel overhanging to the left, the table stepping down toward the horn on the right.
    shape([[-0.62, 0.48], [0.36, 0.48], [0.56, 0.6], [0.62, 0.72], [0.62, 0.74], [0.4, 0.74], [0.4, 0.82],
      [-0.98, 0.82], [-0.98, 0.7], [-0.76, 0.6]], 0.42, 0.03),
  ], tint);
  // The hardened face plate, a shade brighter where the hammer keeps it clean.
  b.prop('iron', box(1.36 * k, 0.03 * k, 0.4 * k, local(at, yaw, -0.29 * k, 0.835 * k), yaw), faceTint);
  // Horn: a cone from the table's end, lifting slightly toward its point.
  b.prop('iron', [
    rod(local(at, yaw, 0.6 * k, 0.69 * k), local(at, yaw, 1.0 * k, 0.72 * k), 0.12 * k, 0.07 * k, 12),
    rod(local(at, yaw, 1.0 * k, 0.72 * k), local(at, yaw, 1.36 * k, 0.76 * k), 0.07 * k, 0.012 * k, 12),
  ], tint);
  // Hardy (square) and pritchel (round) holes near the heel, dark in the polished face.
  b.prop('iron', box(0.055 * k, 0.012 * k, 0.055 * k, local(at, yaw, -0.82 * k, 0.852 * k), yaw), 0x151517);
  b.prop('iron', rod(local(at, yaw, -0.66 * k, 0.846 * k), local(at, yaw, -0.66 * k, 0.858 * k), 0.017 * k, 0.017 * k, 10), 0x151517);
}

/**
 * A chimney stack laid in courses from `at` (its foot) up `height` metres: each
 * course its own slightly different stone, a projecting string course every few,
 * the whole battered in toward the top, and a corbelled cap.
 */
export function coursedStack(b, material, at, width, height, depth, {
  batter = 0.08, tint = 0xffffff, course = 0.58, cap = true,
} = {}) {
  const count = Math.max(2, Math.round(height / course));
  const step = height / count;
  const base = new THREE.Color(tint);
  for (let index = 0; index < count; index += 1) {
    const t = index / count;
    const shrink = 1 - batter * t;
    const band = index > 0 && index % 4 === 0;
    const out = band ? 1.07 : 1;
    const tone = base.clone().multiplyScalar(0.9 + ((index * 0.618) % 1) * 0.16).getHex();
    b.prop(material, stoneBlock(width * shrink * out, step, depth * shrink * out,
      P(at.x, at.y + index * step, at.z), { bevel: band ? 0.035 : 0.05, irregular: 0.06 }), tone);
  }
  if (!cap) return;
  // Corbelled cap: two courses stepping out, then the cap slab.
  const top = at.y + height, shrink = 1 - batter;
  b.prop(material, stoneBlock(width * shrink * 1.08, 0.22, depth * shrink * 1.08, P(at.x, top, at.z), { bevel: 0.03 }), tint);
  b.prop(material, stoneBlock(width * shrink * 1.16, 0.2, depth * shrink * 1.16, P(at.x, top + 0.22, at.z), { bevel: 0.03 }), tint);
  b.prop(material, stoneBlock(width * shrink * 0.92, 0.16, depth * shrink * 0.92, P(at.x, top + 0.42, at.z), { bevel: 0.025 }), tint);
}

/**
 * An open riveted quench tank standing on `at`: plate walls, a rolled rim, iron
 * bands round it, and rivet heads along the bands.
 */
export function quenchTank(b, at, { width = 1.25, height = 0.68, depth = 0.85, yaw = 0, tint = 0x5e626a } = {}) {
  const wall = 0.045;
  const parts = [
    // The floor plate sits inside the walls, not flush with their outer faces.
    stoneBox(width - wall * 2, 0.06, depth - wall * 2, local(at, yaw, 0, 0.03), { yaw, bevel: 0.01, irregular: 0 }),
    stoneBox(width, height, wall, local(at, yaw, 0, height / 2, depth / 2 - wall / 2), { yaw, bevel: 0.01, irregular: 0 }),
    stoneBox(width, height, wall, local(at, yaw, 0, height / 2, -depth / 2 + wall / 2), { yaw, bevel: 0.01, irregular: 0 }),
    stoneBox(wall, height, depth - wall * 2, local(at, yaw, width / 2 - wall / 2, height / 2), { yaw, bevel: 0.01, irregular: 0 }),
    stoneBox(wall, height, depth - wall * 2, local(at, yaw, -width / 2 + wall / 2, height / 2), { yaw, bevel: 0.01, irregular: 0 }),
  ];
  b.prop('iron', parts, tint);
  // Rolled rim and two bands, a little proud of the plate.
  for (const [y, h] of [[height - 0.02, 0.05], [height * 0.62, 0.06], [height * 0.18, 0.06]]) {
    b.prop('iron', [
      stoneBox(width + 0.03, h, 0.02, local(at, yaw, 0, y, depth / 2 + 0.01), { yaw, bevel: 0.006, irregular: 0 }),
      stoneBox(width + 0.03, h, 0.02, local(at, yaw, 0, y, -depth / 2 - 0.01), { yaw, bevel: 0.006, irregular: 0 }),
      // The end straps are a touch narrower, so they tuck under the side straps at the corners.
      stoneBox(0.02, h * 0.9, depth + 0.01, local(at, yaw, width / 2 + 0.01, y), { yaw, bevel: 0.006, irregular: 0 }),
      stoneBox(0.02, h * 0.9, depth + 0.01, local(at, yaw, -width / 2 - 0.01, y), { yaw, bevel: 0.006, irregular: 0 }),
    ], 0x4b4f56);
  }
  // Rivet heads along the bands on the two long faces.
  const rivets = [];
  for (const y of [height * 0.62, height * 0.18]) {
    for (let along = -width / 2 + 0.1; along <= width / 2 - 0.1 + 1e-6; along += (width - 0.2) / 6) {
      for (const side of [-1, 1]) {
        const from = local(at, yaw, along, y, side * (depth / 2 + 0.02));
        const to = local(at, yaw, along, y, side * (depth / 2 + 0.034));
        rivets.push(rod(from, to, 0.014, 0.009, 6));
      }
    }
  }
  b.prop('iron', rivets, 0x3f4248);
}
