import * as THREE from 'three/webgpu';
import { OrganicMeshBuilder, createSeededRng } from './floraMeshPrimitives.js';

const C = (hex) => new THREE.Color(hex);

function addBladeFan(b, cx, cy, cz, blades, len, width, colorB, colorT, rng) {
  for (let i = 0; i < blades; i += 1) {
    const a = (i / blades) * Math.PI * 2 + rng() * 0.4;
    b.addSculptedLeaf({
      origin: [cx, cy, cz],
      yaw: a,
      pitch: 0.35 + rng() * 0.55,
      length: len * (0.8 + rng() * 0.4),
      width,
      arch: len * 0.36,
      cup: 0.008,
      segments: 5,
      colorBase: colorB,
      colorTip: colorT,
    });
  }
}

// --- Biome 3: Savanna ---
function createSavannaTermiteStump() {
  const b = new OrganicMeshBuilder();
  const wood = C('#6a533e');
  const woodTip = C('#9a7d5c');
  const mound = C('#9c6844');
  const moundTop = C('#b8825a');
  // Hollow acacia snag fused with tall fluted earthen termite chimney + flying buttresses.
  b.addTube(
    [[-0.08, -0.07, 0], [-0.09, 0.2, 0.02], [-0.11, 0.44, 0.05], [-0.18, 0.72, 0.08], [-0.26, 0.98, 0.02]],
    [0.17, 0.14, 0.11, 0.08, 0.028],
    12,
    { colorBase: wood, colorTip: woodTip, fluteCount: 6, fluteDepth: 0.16 },
  );
  b.addTube(
    [[0.14, -0.08, -0.02], [0.16, 0.24, 0], [0.16, 0.52, -0.01], [0.14, 0.82, -0.03], [0.12, 1.16, -0.02]],
    [0.25, 0.21, 0.16, 0.11, 0.04],
    14,
    { colorBase: mound, colorTip: moundTop, fluteCount: 8, fluteDepth: 0.24, twist: 1.1 },
  );
  const flutes = [[0.24, 0.16, 0.62, 0.12], [-0.02, -0.22, 0.54, 0.1], [0.22, -0.18, 0.48, 0.1], [-0.22, 0.18, 0.36, 0.08]];
  for (const [fx, fz, h, r] of flutes) {
    b.addTube([[fx, -0.06, fz], [fx * 0.85, h * 0.5, fz * 0.85], [0.12, h, -0.02]], [r, r * 0.6, r * 0.25], 8, { colorBase: mound, colorTip: moundTop, fluteCount: 4, fluteDepth: 0.12 });
  }
  return b.build();
}

function createSavannaWaitABitThorn() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(301);
  const bark = C('#5d4938');
  const foliageB = C('#4c6b36');
  const foliageT = C('#74964c');
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + 0.2;
    const p1 = [Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2];
    const p2 = [Math.cos(a + 0.3) * 0.42, 0.56, Math.sin(a + 0.3) * 0.42];
    b.addTube([[0, -0.04, 0], p1, p2], [0.042, 0.025, 0.012], 6, { colorBase: bark, colorTip: C('#7a624a') });
    addBladeFan(b, p2[0], p2[1], p2[2], 8, 0.16, 0.032, foliageB, foliageT, rng);
    addBladeFan(b, p1[0], p1[1], p1[2], 5, 0.14, 0.028, foliageB, foliageT, rng);
  }
  return b.build();
}

function createSavannaAloeCandelabra() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#4a6e44');
  const leafT = C('#749862');
  const spike = C('#db5224');
  const tip = C('#f4a430');
  for (let layer = 0; layer < 3; layer += 1) {
    const n = 7 + layer * 2;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + layer * 0.4;
      b.addSculptedLeaf({
        origin: [0, 0.04 + layer * 0.04, 0],
        yaw: a,
        pitch: 0.22 + layer * 0.3,
        length: 0.38 - layer * 0.05,
        width: 0.072,
        arch: 0.05,
        cup: 0.024,
        segments: 4,
        serration: 0.16,
        colorBase: leafB,
        colorTip: leafT,
      });
    }
  }
  const branches = [[0, 0.25, 0], [-0.12, 0.72, 0.06], [0.11, 0.68, -0.07]];
  for (const [bx, by, bz] of branches) {
    b.addTube([[0, 0.14, 0], [bx * 0.6, by * 0.65, bz * 0.6], [bx, by + 0.16, bz]], [0.018, 0.013, 0.009], 5, { colorBase: leafB, colorTip: spike });
    b.addFacetedPrism({
      base: [bx, by + 0.12, bz],
      height: 0.18,
      radiusX: 0.034,
      radiusZ: 0.034,
      sides: 6,
      tiers: 4,
      taper: 0.85,
      colorBase: spike,
      colorTip: tip,
    });
  }
  return b.build();
}

function createSavannaBaobabSapling() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(303);
  const trunk = C('#8a725a');
  const upper = C('#9c8468');
  const leafB = C('#5b7c38');
  const leafT = C('#7ea44e');
  b.addTube(
    [[0, -0.06, 0], [0, 0.2, 0], [0.02, 0.46, 0], [0, 0.72, 0]],
    [0.19, 0.21, 0.16, 0.09],
    10,
    { colorBase: trunk, colorTip: upper, fluteCount: 6, fluteDepth: 0.09 },
  );
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const tip = [Math.cos(a) * 0.26, 0.88 + (i % 2) * 0.06, Math.sin(a) * 0.26];
    b.addTube([[0, 0.68, 0], tip], [0.05, 0.022], 6, { colorBase: trunk, colorTip: upper });
    addBladeFan(b, tip[0], tip[1], tip[2], 7, 0.18, 0.045, leafB, leafT, rng);
  }
  return b.build();
}

function createSavannaRedOatTussock() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(304);
  const straw = C('#b89a56');
  const oat = C('#9c5632');
  addBladeFan(b, 0, 0.02, 0, 14, 0.42, 0.026, C('#7e7838'), straw, rng);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const tip = [Math.cos(a) * 0.16, 0.48 + (i % 2) * 0.06, Math.sin(a) * 0.16];
    b.addTube([[0, 0.02, 0], [tip[0] * 0.5, 0.3, tip[2] * 0.5], tip], [0.008, 0.006, 0.004], 4, { colorBase: straw, colorTip: oat });
    b.addBlob({ center: tip, radiusX: 0.018, radiusY: 0.036, radiusZ: 0.018, rings: 3, sides: 5, colorBase: oat, colorTop: straw });
  }
  return b.build();
}

// --- Biome 32: Stonehold Badlands / Canyon ---
function createBadlandsBrittlebushSnag() {
  const b = new OrganicMeshBuilder();
  const pale = C('#baa992');
  const redRoot = C('#7e543e');
  b.addTube(
    [[0, -0.07, 0], [0.05, 0.18, -0.03], [0.07, 0.38, -0.02], [-0.08, 0.62, 0.06], [0.06, 0.88, 0.14], [0.16, 1.09, 0.06]],
    [0.16, 0.13, 0.11, 0.085, 0.055, 0.015],
    13,
    { colorBase: redRoot, colorTip: pale, fluteCount: 7, fluteDepth: 0.18, twist: 5.5 },
  );
  b.addTube([[-0.06, 0.52, 0.05], [-0.18, 0.66, -0.06], [-0.3, 0.78, -0.16]], [0.055, 0.036, 0.014], 7, { colorBase: pale, colorTip: pale, twist: 2.5 });
  b.addTube([[0.04, 0.36, -0.02], [0.24, 0.52, 0.16], [0.34, 0.64, 0.22]], [0.048, 0.028, 0.012], 7, { colorBase: redRoot, colorTip: pale });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    b.addTube([[0, 0.09, 0], [Math.cos(a) * 0.2, 0.01, Math.sin(a) * 0.2], [Math.cos(a) * 0.38, -0.05, Math.sin(a) * 0.38]], [0.058, 0.035, 0.014], 6, { colorBase: redRoot, colorTip: pale });
  }
  return b.build();
}

function createBadlandsChollaSkeleton() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(3201);
  const seg = C('#687c4a');
  const spine = C('#d4c89a');
  b.addTube([[0, -0.03, 0], [0.04, 0.22, 0], [0.02, 0.46, 0.04], [0, 0.66, 0.02]], [0.048, 0.042, 0.036, 0.026], 9, { colorBase: seg, colorTip: spine, fluteCount: 6, fluteDepth: 0.16 });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const baseY = 0.22 + (i % 3) * 0.12;
    const p1 = [Math.cos(a) * 0.17, baseY + 0.14, Math.sin(a) * 0.17];
    const p2 = [Math.cos(a + 0.3) * 0.28, baseY + 0.32 + rng() * 0.07, Math.sin(a + 0.3) * 0.28];
    b.addTube([[0.03, baseY, 0.02], p1, p2], [0.04, 0.035, 0.026], 8, { colorBase: seg, colorTip: spine, fluteCount: 6, fluteDepth: 0.18 });
    b.addTube([p1, [p1[0] + Math.cos(a - 0.5) * 0.14, baseY + 0.28, p1[2] + Math.sin(a - 0.5) * 0.14]], [0.03, 0.02], 6, { colorBase: seg, colorTip: spine });
  }
  return b.build();
}

function createBadlandsCenturyAgave() {
  const b = new OrganicMeshBuilder();
  const blueB = C('#4e6f68');
  const blueT = C('#7ea29c');
  for (let ring = 0; ring < 3; ring += 1) {
    const n = 8 + ring * 2;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + ring * 0.31;
      b.addSculptedLeaf({
        origin: [0, 0.05 + ring * 0.05, 0],
        yaw: a,
        pitch: 0.2 + ring * 0.34,
        length: 0.48 - ring * 0.07,
        width: 0.088,
        arch: 0.04,
        cup: 0.028,
        segments: 5,
        serration: 0.18,
        colorBase: blueB,
        colorTip: blueT,
      });
    }
  }
  b.addFacetedPrism({
    base: [0, 0.18, 0],
    height: 0.85,
    radiusX: 0.04,
    radiusZ: 0.04,
    sides: 6,
    tiers: 4,
    taper: 0.72,
    colorBase: blueB,
    colorTip: C('#cbb062'),
  });
  return b.build();
}

function createBadlandsMarigoldTuft() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(3202);
  const foliageB = C('#5d745a');
  const foliageT = C('#8ba084');
  const gold = C('#f0b624');
  addBladeFan(b, 0, 0.02, 0, 12, 0.18, 0.045, foliageB, foliageT, rng);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const d = 0.08 + (i % 2) * 0.05;
    const tip = [Math.cos(a) * d, 0.25 + (i % 3) * 0.04, Math.sin(a) * d];
    b.addTube([[0, 0.03, 0], tip], [0.008, 0.006], 4, { colorBase: foliageB, colorTip: foliageT });
    b.addBlossom({ center: tip, radius: 0.048, petals: 9, colorPetal: gold, colorCore: C('#c86814') });
  }
  return b.build();
}

function createBadlandsApachePlumeShrub() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(3203);
  const wood = C('#685648');
  const leaf = C('#5c7242');
  const plume = C('#d68494');
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + rng() * 0.25;
    const p1 = [Math.cos(a) * 0.14, 0.22, Math.sin(a) * 0.14];
    const p2 = [Math.cos(a) * 0.28, 0.52 + rng() * 0.1, Math.sin(a) * 0.28];
    b.addTube([[0, -0.02, 0], p1, p2], [0.024, 0.015, 0.008], 5, { colorBase: wood, colorTip: C('#84725e') });
    addBladeFan(b, p1[0], p1[1], p1[2], 5, 0.12, 0.028, leaf, C('#80965e'), rng);
    b.addBlossom({ center: p2, radius: 0.056, petals: 8, colorPetal: plume, colorCore: C('#e8d4d8'), cupDepth: 0.022 });
  }
  return b.build();
}

export const SAVANNA_BADLANDS_BIOME_FLORA = Object.freeze([
  // Biome 3: Savanna
  { id: 'savanna_termite_stump', tileIds: [3], paletteTileId: 3, kind: 'trunk', motionProfile: 'rigid', height: 1.15, weight: 0.6, conform: false, barkProfile: 'beech', createGeometry: createSavannaTermiteStump },
  { id: 'savanna_wait_a_bit_thorn', tileIds: [3], paletteTileId: 3, kind: 'understory', motionProfile: 'woody-shrub', height: 0.58, weight: 1.2, conform: false, createGeometry: createSavannaWaitABitThorn },
  { id: 'savanna_aloe_candelabra', tileIds: [3], paletteTileId: 3, kind: 'blossom', motionProfile: 'rigid', height: 0.88, weight: 1.1, conform: false, createGeometry: createSavannaAloeCandelabra },
  { id: 'savanna_baobab_sapling', tileIds: [3], paletteTileId: 3, kind: 'trunk', motionProfile: 'woody-shrub', height: 0.9, weight: 0.7, conform: false, barkProfile: 'beech', createGeometry: createSavannaBaobabSapling },
  { id: 'savanna_red_oat_tussock', tileIds: [3], paletteTileId: 3, kind: 'smallPlant', motionProfile: 'grass-tuft', height: 0.5, weight: 1.6, conform: true, createGeometry: createSavannaRedOatTussock },
  // Biome 32: Stonehold Badlands
  { id: 'badlands_brittlebush_snag', tileIds: [32], paletteTileId: 32, kind: 'trunk', motionProfile: 'rigid', height: 1.08, weight: 0.65, conform: false, barkProfile: 'spruce', createGeometry: createBadlandsBrittlebushSnag },
  { id: 'badlands_cholla_skeleton', tileIds: [32], paletteTileId: 32, kind: 'understory', motionProfile: 'rigid', height: 0.76, weight: 1.2, conform: false, createGeometry: createBadlandsChollaSkeleton },
  { id: 'badlands_century_agave', tileIds: [32], paletteTileId: 32, kind: 'understory', motionProfile: 'rigid', height: 1.02, weight: 1.1, conform: false, createGeometry: createBadlandsCenturyAgave },
  { id: 'badlands_desert_marigold_tuft', tileIds: [32], paletteTileId: 32, kind: 'blossom', motionProfile: 'grass-tuft', height: 0.32, weight: 1.5, conform: true, createGeometry: createBadlandsMarigoldTuft },
  { id: 'badlands_apache_plume_shrub', tileIds: [32], paletteTileId: 32, kind: 'blossom', motionProfile: 'woody-shrub', height: 0.62, weight: 1.3, conform: false, createGeometry: createBadlandsApachePlumeShrub },
]);
