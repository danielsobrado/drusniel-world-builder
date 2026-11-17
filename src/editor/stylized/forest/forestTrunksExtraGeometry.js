import * as THREE from 'three/webgpu';
import {
  BARK_DARK,
  EXPOSED_DEEP,
  EXPOSED_WOOD,
  MeshBuilder,
  MOSS,
  ROT_DARK,
  ROT_PUNK,
  SCRATCH,
  barkColor,
  mottle,
  smoothstep,
} from './forestDebrisBuilder.js';

const POLYPORE_RIM = new THREE.Color('#d8c49a');
const POLYPORE_BAND = new THREE.Color('#8e532b');

function appendBracketFan(builder, x, y, z, yaw, width, depth, thickness = 0.018) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const toWorld = (lx, ly, lz) => [x + lx * cos - lz * sin, y + ly, z + lx * sin + lz * cos];
  const segments = 6;
  const topOuter = [];
  const botOuter = [];
  const topInner = builder.vertex(...toWorld(0, thickness * 0.5, 0), POLYPORE_BAND, 0.1, 0.5);
  const botInner = builder.vertex(...toWorld(0, -thickness * 0.6, 0), ROT_PUNK, 0.1, 0.5);
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angle = (t - 0.5) * Math.PI * 0.92;
    const wave = 1 + 0.12 * Math.sin(t * Math.PI * 4);
    const px = Math.cos(angle) * depth * wave;
    const pz = Math.sin(angle) * width * 0.5 * wave;
    const archY = Math.sin(t * Math.PI) * 0.008;
    topOuter.push(builder.vertex(...toWorld(px, thickness * 0.25 + archY, pz), POLYPORE_RIM, 0.9, t));
    botOuter.push(builder.vertex(...toWorld(px, -thickness * 0.25 + archY, pz), EXPOSED_DEEP, 0.9, t));
  }
  for (let i = 0; i < segments; i += 1) {
    builder.indices.push(topInner, topOuter[i + 1], topOuter[i]);
    builder.indices.push(botInner, botOuter[i], botOuter[i + 1]);
    builder.indices.push(topOuter[i], topOuter[i + 1], botOuter[i], botOuter[i], topOuter[i + 1], botOuter[i + 1]);
  }
}

function appendWoodSplinter(builder, bx, by, bz, dx, dy, dz, width, sides = 5, length = 0.16) {
  const dirLen = Math.max(1e-4, Math.hypot(dx, dy, dz));
  const ux = dx / dirLen;
  const uy = dy / dirLen;
  const uz = dz / dirLen;
  const points = [
    [bx, by, bz],
    [bx + ux * length * 0.55, by + uy * length * 0.55, bz + uz * length * 0.55],
    [bx + ux * length, by + uy * length, bz + uz * length],
  ];
  builder.curvedLimb(points, [width, width * 0.55, width * 0.12], sides, {
    seed: Math.round((bx + bz) * 30),
    capTip: true,
    exposed: 0.95,
  });
}

/** High standing storm-snapped trunk snag with spiraled bark flutes, jagged crown splinters, and sprawling buttress claws. */
export function createSnappedSnagGeometry({ height = 1.38, radius = 0.28 } = {}) {
  const builder = new MeshBuilder();
  const sides = 18;
  const rings = 12;

  for (let ring = 0; ring < rings; ring += 1) {
    const t = ring / (rings - 1);
    const flare = 1 + 0.65 * Math.pow(1 - t, 2.8);
    const taper = 1 - t * 0.34;
    const leanX = Math.sin(t * Math.PI * 0.8) * 0.08 + t * t * 0.09;
    const leanZ = Math.cos(t * Math.PI * 0.6) * 0.04;
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const twist = angle + t * 0.85;
      const flute = 1 + 0.14 * Math.sin(twist * 5) + 0.06 * Math.cos(twist * 10);
      const breakSlant = t > 0.72 ? (t - 0.72) * (0.28 * Math.cos(angle + 0.4) + 0.18 * Math.sin(angle * 3)) : 0;
      const y = -0.08 + t * (height + 0.08) + breakSlant;
      const exposed = t > 0.78 && Math.sin(angle * 2 + 0.6) > 0.1 ? smoothstep(0.76, 0.98, t) * 0.8 : 0;
      const moss = smoothstep(0.45, 0.0, t) * Math.max(0, Math.sin(angle + 1.2)) * 0.75;
      const r = radius * flare * taper * flute;
      builder.vertex(
        leanX + Math.cos(angle) * r,
        y,
        leanZ + Math.sin(angle) * r,
        barkColor(t * 7, angle * 3, moss, exposed, 0),
        side / sides,
        t * height * 2.2,
      );
    }
  }
  builder.grid(0, rings, sides);
  const topRing = (rings - 1) * sides;
  builder.endGrain(topRing, sides, [0.09, height - 0.06, 0.02], true, { cupDepth: 0.08, rotCenter: 0.3, jagX: 0.05, axisY: true });

  // 6 spreading claw buttress roots gripping and burying naturally into the forest floor.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.32;
    const reach = radius * (2.15 + 0.28 * Math.sin(i * 2.1));
    builder.curvedLimb(
      [
        [Math.cos(a) * radius * 0.62, 0.26, Math.sin(a) * radius * 0.62],
        [Math.cos(a + 0.08) * radius * 1.38, 0.09, Math.sin(a + 0.08) * radius * 1.38],
        [Math.cos(a + 0.14) * reach, -0.065, Math.sin(a + 0.14) * reach],
      ],
      [radius * 0.35, radius * 0.21, radius * 0.075],
      7,
      { seed: 11 + i, moss: 0.85, rotTip: true },
    );
  }

  // Basal moss-humus skirt blending the root crown smoothly into the forest floor.
  for (let m = 0; m < 4; m += 1) {
    const ma = (m / 4) * Math.PI * 2 + 0.7;
    const mx = Math.cos(ma) * radius * 1.15;
    const mz = Math.sin(ma) * radius * 1.15;
    builder.curvedLimb(
      [[mx * 0.5, 0.02, mz * 0.5], [mx, 0.04, mz], [mx * 1.45, -0.05, mz * 1.45]],
      [0.09, 0.085, 0.04],
      6,
      { seed: 25 + m, moss: 0.95 },
    );
  }

  // Torn jagged crown splinters & two snapped lateral branch stubs.
  for (let s = 0; s < 5; s += 1) {
    const a = (s / 5) * Math.PI * 2 + 0.2;
    const r = radius * 0.45;
    appendWoodSplinter(
      builder,
      0.09 + Math.cos(a) * r,
      height - 0.05,
      0.02 + Math.sin(a) * r,
      Math.cos(a) * 0.06,
      0.24 + (s % 2) * 0.08,
      Math.sin(a) * 0.06,
      0.04,
      5,
      0.22 + (s % 2) * 0.06,
    );
  }
  builder.curvedLimb(
    [[0.12, height * 0.56, 0.11], [0.3, height * 0.66, 0.24], [0.42, height * 0.72, 0.32]],
    [radius * 0.3, radius * 0.2, radius * 0.1],
    6,
    { seed: 31, exposed: 0.85 },
  );
  builder.curvedLimb(
    [[-0.08, height * 0.42, -0.14], [-0.26, height * 0.48, -0.28]],
    [radius * 0.26, radius * 0.14],
    6,
    { seed: 37, exposed: 0.75 },
  );
  return builder.build();
}

/** Windthrown tipped-up tree root wad: dramatic vertical root plate wall, tangled grasping roots & broken butt bole. */
export function createRootWadGeometry({ radius = 0.76 } = {}) {
  const builder = new MeshBuilder();
  // Short uprooted trunk butt lying into -X.
  const trunkSides = 16;
  const trunkRows = 8;
  for (let row = 0; row < trunkRows; row += 1) {
    const t = row / (trunkRows - 1);
    const x = -0.05 - t * 1.1;
    const cy = 0.22 - t * 0.11;
    const r = 0.28 * (1 - t * 0.28) * (1 + 0.28 * Math.pow(1 - t, 2));
    for (let side = 0; side < trunkSides; side += 1) {
      const a = (side / trunkSides) * Math.PI * 2;
      const flute = 1 + 0.12 * Math.sin(a * 5 + t * 2);
      const moss = smoothstep(0.1, 0.75, Math.sin(a)) * 0.75;
      builder.vertex(
        x,
        cy + Math.sin(a) * r * flute,
        Math.cos(a) * r * flute,
        barkColor(t * 6, a * 2, moss, t > 0.8 ? 0.6 : 0, 0),
        side / trunkSides,
        t * 2,
      );
    }
  }
  builder.grid(0, trunkRows, trunkSides);
  builder.endGrain((trunkRows - 1) * trunkSides, trunkSides, [-1.18, 0.11, 0], true, { cupDepth: 0.06, jagX: 0.04 });

  // Vertical soil-clogged root plate mound around x ~ 0.08.
  const discSides = 16;
  const discRings = 4;
  const discStart = builder.positions.length / 3;
  for (let ring = 0; ring < discRings; ring += 1) {
    const t = ring / (discRings - 1);
    const scale = 1 - t * 0.76;
    const xOffset = 0.06 + t * 0.14;
    for (let side = 0; side < discSides; side += 1) {
      const a = (side / discSides) * Math.PI * 2;
      const wobble = 0.85 + 0.22 * Math.sin(a * 4 + 0.7);
      const py = 0.42 + Math.sin(a) * radius * 0.74 * scale * wobble;
      const pz = Math.cos(a) * radius * scale * wobble;
      const c = t > 0.5 ? ROT_PUNK : BARK_DARK;
      SCRATCH.copy(c).lerp(MOSS, Math.max(0, Math.sin(a)) * 0.35);
      builder.vertex(xOffset, Math.max(-0.08, py), pz, SCRATCH, side / discSides, t);
    }
  }
  builder.grid(discStart, discRings, discSides);
  const plateCenter = builder.vertex(0.22, 0.42, 0, ROT_DARK, 0.5, 0.5);
  builder.fan(plateCenter, discStart + (discRings - 1) * discSides, discSides, true);

  // 7 sprawling gnarled surface & sinker roots radiating off the vertical wall.
  for (let i = 0; i < 7; i += 1) {
    const a = ((i / 7) - 0.5) * Math.PI * 1.15;
    const spread = 0.58 + 0.24 * Math.sin(i * 1.9);
    const wy = Math.max(-0.04, 0.36 + Math.cos(a) * spread * 0.85);
    const wz = Math.sin(a) * spread;
    builder.curvedLimb(
      [
        [0.04, 0.32 + Math.cos(a) * 0.18, Math.sin(a) * 0.18],
        [0.18, wy * 0.78 + 0.08, wz * 0.65],
        [0.34 + 0.14 * Math.sin(i), wy, wz],
      ],
      [0.095, 0.058, 0.018],
      6,
      { seed: 50 + i, moss: 0.45, exposed: 0.35 },
    );
  }
  return builder.build();
}

/** Massive hollowed old-growth nurse trunk with roof break-in trough, damp rot pit, lateral feeder roots, and moss pillows. */
export function createHollowNurseTrunkGeometry({ length = 1.95, radius = 0.34 } = {}) {
  const builder = new MeshBuilder();
  const sides = 18;
  const rows = 13;
  const half = length * 0.5;

  for (let row = 0; row < rows; row += 1) {
    const t = row / (rows - 1);
    const x = -half + t * length;
    const archY = Math.sin(t * Math.PI) * 0.05;
    const swell = 1 + 0.25 * Math.exp(-Math.pow((t - 0.15) * 4, 2));
    const r = radius * swell * (1 - t * 0.24);
    for (let side = 0; side < sides; side += 1) {
      const a = (side / sides) * Math.PI * 2;
      const up = Math.sin(a);
      // Carve an upper longitudinal rot-channel along the middle 55% of the trunk.
      const channelMask = smoothstep(0.22, 0.38, t) * smoothstep(0.86, 0.7, t);
      const carve = up > 0.35 ? channelMask * Math.pow((up - 0.35) / 0.65, 1.4) * 0.52 : 0;
      const radial = r * (1 - carve) * (1 + 0.09 * Math.sin(a * 4 + t * 5));
      const moss = smoothstep(0.18, 0.72, up) * (0.65 + 0.35 * mottle(t * 7, a * 2)) * (1 - carve * 0.7);
      const rot = carve > 0.2 ? smoothstep(0.15, 0.45, carve) * 0.85 : 0;
      const exposed = carve > 0.08 && carve <= 0.28 ? 0.65 : 0;
      builder.vertex(
        x,
        r * 0.58 + archY + Math.sin(a) * radial,
        Math.cos(a) * radial,
        barkColor(t * 9, a * 2.5, moss, exposed, rot),
        side / sides,
        t * length * 1.4,
      );
    }
  }
  builder.grid(0, rows, sides);
  builder.endGrain(0, sides, [-half - 0.06, radius * 0.58, 0], false, { cupDepth: 0.12, rotCenter: 0.9 });
  builder.endGrain((rows - 1) * sides, sides, [half + 0.05, radius * 0.48, 0], true, { cupDepth: 0.09, rotCenter: 0.7 });

  // Staggered shelf fungi & moss humps nestled along the sides.
  const conks = [
    [-0.36, radius * 0.78, radius * 0.82, 0.4, 0.11, 0.08],
    [-0.22, radius * 0.66, radius * 0.86, 0.55, 0.09, 0.07],
    [0.28, radius * 0.7, -radius * 0.78, -2.5, 0.12, 0.085],
    [0.44, radius * 0.58, -radius * 0.74, -2.3, 0.095, 0.07],
  ];
  for (const [bx, by, bz, yaw, w, d] of conks) appendBracketFan(builder, bx, by, bz, yaw, w, d);
  return builder.build();
}

/** Gnarled overhanging stilt-root arch where a mossy parent trunk vaults on 4 tangled prop roots. */
export function createArchedRootBridgeGeometry({ span = 1.42, archHeight = 0.52 } = {}) {
  const builder = new MeshBuilder();
  const half = span * 0.5;
  // Main arched bridge trunk segment.
  const bridgePts = [];
  const bridgeRadii = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const x = -half + t * span;
    const y = 0.08 + Math.sin(t * Math.PI) * archHeight;
    const z = Math.sin(t * Math.PI * 2) * 0.08;
    bridgePts.push([x, y, z]);
    bridgeRadii.push(0.15 + 0.04 * Math.sin(t * Math.PI));
  }
  builder.curvedLimb(bridgePts, bridgeRadii, 12, { seed: 71, capTip: true, moss: 0.85, exposed: 0.2 });

  // 4 sweeping buttress/stilt legs descending into mossy humus pads.
  const legSpecs = [
    [[-0.38, 0.34, 0.04], [-0.46, 0.18, 0.24], [-0.54, -0.05, 0.42]],
    [[-0.34, 0.36, -0.04], [-0.42, 0.17, -0.24], [-0.48, -0.05, -0.4]],
    [[0.36, 0.34, 0.04], [0.45, 0.16, 0.25], [0.55, -0.05, 0.41]],
    [[0.32, 0.36, -0.05], [0.42, 0.17, -0.25], [0.5, -0.05, -0.43]],
  ];
  legSpecs.forEach((pts, idx) => {
    builder.curvedLimb(pts, [0.115, 0.082, 0.045], 7, { seed: 81 + idx, moss: 0.72, rotTip: false });
  });
  return builder.build();
}

/** Lightning-riven fallen log splayed into two cleft halves with jagged golden heartwood splinters. */
export function createSplitTimberLogGeometry({ length = 1.75, radius = 0.22 } = {}) {
  const builder = new MeshBuilder();
  const half = length * 0.5;
  const rows = 10;
  const sides = 10;

  // Build two divergent cleft halves slightly parted in Z and rotated open.
  for (const halfSign of [-1, 1]) {
    const start = builder.positions.length / 3;
    const cleftAngle = halfSign * 0.18;
    const zSpread = halfSign * 0.09;
    for (let row = 0; row < rows; row += 1) {
      const t = row / (rows - 1);
      const x = -half + t * length;
      const spread = zSpread * (0.35 + t * 0.85);
      const cy = radius * 0.62 + (halfSign > 0 ? 0.02 : 0) + t * 0.03;
      const reach = radius * (1 - t * 0.18);
      for (let side = 0; side < sides; side += 1) {
        // Half-cylinder cross-section closing flat along the cleft seam.
        const st = side / (sides - 1);
        const theta = cleftAngle + (halfSign > 0 ? -Math.PI * 0.5 + st * Math.PI : Math.PI * 0.5 + st * Math.PI);
        const onFlat = side === 0 || side === sides - 1;
        const localR = onFlat ? reach * 0.32 : reach * (0.94 + 0.09 * Math.sin(theta * 4 + t * 5));
        const exposed = onFlat ? 0.95 : 0.15;
        const moss = onFlat ? 0 : smoothstep(0.25, 0.8, Math.sin(theta)) * 0.55;
        builder.vertex(
          x,
          cy + Math.sin(theta) * localR,
          spread + Math.cos(theta) * localR,
          barkColor(t * 7 + halfSign, side * 1.4, moss, exposed, 0),
          st,
          t * length,
        );
      }
    }
    builder.grid(start, rows, sides);
    const footCenter = builder.vertex(-half - 0.02, radius * 0.62, zSpread * 0.35, EXPOSED_WOOD, 0.5, 0.5);
    const tipCenter = builder.vertex(half + 0.02, radius * 0.65, zSpread * 1.2, EXPOSED_WOOD, 0.5, 0.5);
    builder.fan(footCenter, start, sides, false);
    builder.fan(tipCenter, start + (rows - 1) * sides, sides, true);
  }

  // Heartwood splinters jutting along the lightning cleave.
  appendWoodSplinter(builder, -0.25, radius * 0.88, -0.01, 0.28, 0.14, 0.04, 0.028, 5, 0.28);
  appendWoodSplinter(builder, 0.15, radius * 0.86, 0.02, -0.24, 0.16, -0.04, 0.026, 5, 0.24);
  appendWoodSplinter(builder, 0.55, radius * 0.82, 0.05, 0.22, 0.12, 0.08, 0.025, 5, 0.2);
  return builder.build();
}

/** Damp old-growth deadwood log densely colonized with tiered fan polypore brackets and velvet moss cap. */
export function createShelfFungusLogGeometry({ length = 1.65, radius = 0.24 } = {}) {
  const builder = new MeshBuilder();
  const half = length * 0.5;
  const sides = 16;
  const rows = 10;

  for (let row = 0; row < rows; row += 1) {
    const t = row / (rows - 1);
    const x = -half + t * length;
    const archY = Math.sin(t * Math.PI) * 0.04;
    const r = radius * (1.06 - t * 0.22);
    for (let side = 0; side < sides; side += 1) {
      const a = (side / sides) * Math.PI * 2;
      const up = Math.sin(a);
      const barkRidge = 1 + 0.11 * Math.sin(a * 6 + t * 5);
      const moss = smoothstep(0.1, 0.72, up) * (0.72 + 0.25 * mottle(t * 8, a * 2));
      builder.vertex(
        x,
        r * 0.62 + archY + Math.sin(a) * r * barkRidge,
        Math.cos(a) * r * barkRidge,
        barkColor(t * 8, a * 2, moss, 0, up < -0.4 ? 0.45 : 0),
        side / sides,
        t * length * 1.4,
      );
    }
  }
  builder.grid(0, rows, sides);
  builder.endGrain(0, sides, [-half - 0.04, radius * 0.62, 0], false, { cupDepth: 0.08, rotCenter: 0.65 });
  builder.endGrain((rows - 1) * sides, sides, [half + 0.04, radius * 0.52, 0], true, { cupDepth: 0.06, rotCenter: 0.5 });

  // Two opposing colonies of tiered bracket polypores hugging the bole.
  const brackets = [
    [-0.45, radius * 0.85, radius * 0.88, 0.42, 0.14, 0.1],
    [-0.36, radius * 1.0, radius * 0.8, 0.5, 0.12, 0.09],
    [-0.25, radius * 0.78, radius * 0.9, 0.35, 0.11, 0.085],
    [-0.1, radius * 0.92, radius * 0.84, 0.48, 0.13, 0.095],
    [0.08, radius * 0.76, -radius * 0.86, -2.55, 0.14, 0.1],
    [0.2, radius * 0.94, -radius * 0.78, -2.65, 0.12, 0.085],
    [0.34, radius * 0.8, -radius * 0.82, -2.5, 0.1, 0.08],
    [0.44, radius * 0.96, -radius * 0.74, -2.6, 0.09, 0.07],
  ];
  for (const [bx, by, bz, yaw, w, d] of brackets) appendBracketFan(builder, bx, by, bz, yaw, w, d);
  return builder.build();
}
