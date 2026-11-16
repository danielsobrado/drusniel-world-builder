import * as THREE from 'three/webgpu';
import { OrganicMeshBuilder } from './floraMeshPrimitives.js';

const C = (hex) => new THREE.Color(hex);

// --- Biome 5: Tropical Seasonal Forest ---
function createSeasonalTeakStump() {
  const b = new OrganicMeshBuilder();
  const bark = C('#6a543c');
  const top = C('#a68b64');
  const leaf = C('#557f34');
  b.addTube([[0, -0.08, 0], [0, 0.16, 0], [0, 0.44, 0], [0, 0.72, 0]], [0.23, 0.18, 0.16, 0.14], 14, {
    colorBase: bark, colorTip: top, fluteCount: 7, fluteDepth: 0.22,
  });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    b.addTube(
      [[Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12], [Math.cos(a) * 0.34, 0.06, Math.sin(a) * 0.34], [Math.cos(a) * 0.5, -0.06, Math.sin(a) * 0.5]],
      [0.085, 0.055, 0.02],
      7,
      { colorBase: bark, colorTip: bark },
    );
    b.addSculptedLeaf({ origin: [Math.cos(a) * 0.08, 0.6, Math.sin(a) * 0.08], yaw: a, pitch: 0.38, length: 0.22, width: 0.095, segments: 5, colorBase: leaf, colorTip: C('#84aa4c') });
  }
  return b.build();
}

function createSeasonalBambooCulmClump() {
  const b = new OrganicMeshBuilder();
  const caneB = C('#627e36');
  const caneT = C('#9eb856');
  const leaf = C('#528034');
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    const rad = i === 0 ? 0.02 : 0.12;
    const ox = Math.cos(a) * rad;
    const oz = Math.sin(a) * rad;
    const h = 0.88 + (i % 3) * 0.16;
    b.addTube(
      [[ox, -0.04, oz], [ox * 1.4, h * 0.45, oz * 1.4], [ox * 1.9, h, oz * 1.9]],
      [0.028, 0.024, 0.015],
      7,
      { colorBase: caneB, colorTip: caneT, fluteCount: 3, fluteDepth: 0.04 },
    );
    for (let k = 0; k < 4; k += 1) {
      b.addSculptedLeaf({
        origin: [ox * 1.7, h * (0.68 + k * 0.08), oz * 1.7],
        yaw: a + k * 1.4,
        pitch: 0.25,
        length: 0.2,
        width: 0.036,
        arch: 0.07,
        colorBase: leaf,
        colorTip: caneT,
      });
    }
  }
  return b.build();
}

function createSeasonalHeliconiaCluster() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#3a6e2e');
  const leafT = C('#68a042');
  const crimson = C('#d63428');
  const gold = C('#ecc22c');
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    b.addSculptedLeaf({
      origin: [0, 0.04, 0],
      yaw: a,
      pitch: 0.55 + (i % 2) * 0.2,
      length: 0.58,
      width: 0.16,
      arch: 0.14,
      cup: 0.03,
      segments: 5,
      colorBase: leafB,
      colorTip: leafT,
    });
  }
  for (let c = 0; c < 3; c += 1) {
    const a = c * 2.1 + 0.4;
    const x = Math.cos(a) * 0.1;
    const z = Math.sin(a) * 0.1;
    b.addTube([[0, 0.04, 0], [x, 0.72, z]], [0.018, 0.012], 5, { colorBase: leafB, colorTip: crimson });
    for (let bIdx = 0; bIdx < 4; bIdx += 1) {
      b.addSculptedLeaf({
        origin: [x, 0.56 + bIdx * 0.055, z],
        yaw: a + (bIdx % 2 === 0 ? 0 : Math.PI),
        pitch: 0.35,
        length: 0.14 - bIdx * 0.015,
        width: 0.055,
        arch: -0.02,
        cup: 0.025,
        colorBase: crimson,
        colorTip: gold,
      });
    }
  }
  return b.build();
}

function createSeasonalCycadCrown() {
  const b = new OrganicMeshBuilder();
  const trunk = C('#5a4636');
  const cone = C('#b87836');
  const frondB = C('#3e6a2e');
  const frondT = C('#6c9b46');
  b.addTube([[0, -0.04, 0], [0, 0.24, 0], [0, 0.44, 0]], [0.16, 0.14, 0.11], 9, {
    colorBase: trunk, colorTip: C('#7a624a'), fluteCount: 7, fluteDepth: 0.14, twist: 2.0,
  });
  b.addBlob({ center: [0, 0.5, 0], radiusX: 0.055, radiusY: 0.1, radiusZ: 0.055, rings: 4, sides: 7, ribAmp: 0.14, colorBase: trunk, colorTop: cone });
  for (let ring = 0; ring < 2; ring += 1) {
    const n = 8 + ring * 2;
    for (let i = 0; i < n; i += 1) {
      b.addSculptedLeaf({
        origin: [0, 0.42 + ring * 0.04, 0],
        yaw: (i / n) * Math.PI * 2 + ring * 0.35,
        pitch: 0.28 + ring * 0.32,
        length: 0.56 - ring * 0.08,
        width: 0.11,
        arch: 0.18,
        serration: 0.28,
        segments: 5,
        colorBase: frondB,
        colorTip: frondT,
      });
    }
  }
  return b.build();
}

function createSeasonalLantanaBush() {
  const b = new OrganicMeshBuilder();
  const wood = C('#5a4a38');
  const leafB = C('#476c30');
  const leafT = C('#6d9646');
  const orange = C('#ea6c24');
  const gold = C('#f4bc32');
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const tip = [Math.cos(a) * 0.26, 0.38 + (i % 2) * 0.08, Math.sin(a) * 0.26];
    b.addTube([[0, -0.02, 0], tip], [0.024, 0.01], 5, { colorBase: wood, colorTip: leafB });
    for (let k = 0; k < 5; k += 1) {
      b.addSculptedLeaf({ origin: tip, yaw: a + k * 1.2, pitch: 0.25, length: 0.13, width: 0.058, colorBase: leafB, colorTip: leafT });
    }
    b.addBlossom({ center: [tip[0], tip[1] + 0.03, tip[2]], radius: 0.048, petals: 7, colorPetal: orange, colorCore: gold });
  }
  return b.build();
}

// --- Biome 7: Tropical Rainforest ---
function createRainforestButtressSnag() {
  const b = new OrganicMeshBuilder();
  const bark = C('#4f3f32');
  const moss = C('#4e7630');
  const vine = C('#5e8240');
  b.addTube([[0, -0.08, 0], [0.02, 0.26, -0.01], [0.04, 0.58, -0.02], [-0.04, 0.96, 0.05], [0.02, 1.32, 0.02]], [0.23, 0.18, 0.15, 0.12, 0.06], 14, {
    colorBase: bark, colorTip: moss, fluteCount: 6, fluteDepth: 0.2,
  });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    b.addTube(
      [[Math.cos(a) * 0.12, 0.46, Math.sin(a) * 0.12], [Math.cos(a) * 0.34, 0.16, Math.sin(a) * 0.34], [Math.cos(a) * 0.54, -0.07, Math.sin(a) * 0.54]],
      [0.095, 0.058, 0.02],
      7,
      { colorBase: bark, colorTip: moss },
    );
  }
  const vinePts = [];
  const vineRadii = [];
  for (let step = 0; step <= 11; step += 1) {
    const t = step / 11;
    const ang = t * Math.PI * 4.2;
    const rad = 0.2 - t * 0.09;
    vinePts.push([Math.cos(ang) * rad, t * 1.18, Math.sin(ang) * rad]);
    vineRadii.push(0.025 - t * 0.01);
    if (step > 2 && step % 2 === 0) {
      b.addSculptedLeaf({ origin: [Math.cos(ang) * rad, t * 1.18, Math.sin(ang) * rad], yaw: ang, pitch: 0.2, length: 0.14, width: 0.075, colorBase: vine, colorTip: C('#88b256') });
    }
  }
  b.addTube(vinePts, vineRadii, 6, { colorBase: vine, colorTip: C('#7ea450') });
  return b.build();
}

function createRainforestTreeFern() {
  const b = new OrganicMeshBuilder();
  const trunk = C('#48382a');
  const frondB = C('#3a682c');
  const frondT = C('#68a044');
  b.addTube([[0, -0.06, 0], [0.02, 0.26, 0], [0.03, 0.56, 0.01], [0, 0.86, 0.02]], [0.12, 0.1, 0.085, 0.07], 10, {
    colorBase: trunk, colorTip: C('#6a543c'), fluteCount: 7, fluteDepth: 0.14,
  });
  for (let layer = 0; layer < 2; layer += 1) {
    const n = 9 + layer * 3;
    for (let i = 0; i < n; i += 1) {
      b.addSculptedLeaf({
        origin: [0, 0.8 + layer * 0.06, 0.02],
        yaw: (i / n) * Math.PI * 2 + layer * 0.3,
        pitch: 0.26 + layer * 0.28,
        length: 0.64 - layer * 0.12,
        width: 0.21,
        arch: 0.24,
        serration: 0.34,
        segments: 5,
        colorBase: frondB,
        colorTip: frondT,
      });
    }
  }
  return b.build();
}

function createRainforestMonsteraPatch() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#2f5c28');
  const leafT = C('#5c9142');
  const spathe = C('#ece5c6');
  for (let i = 0; i < 11; i += 1) {
    const a = (i / 11) * Math.PI * 2 + 0.15;
    const h = 0.2 + (i % 3) * 0.13;
    const ox = Math.cos(a) * (0.1 + (i % 2) * 0.06);
    const oz = Math.sin(a) * (0.1 + (i % 2) * 0.06);
    b.addTube([[0, 0, 0], [ox * 0.5, h * 0.55, oz * 0.5], [ox, h, oz]], [0.015, 0.012, 0.009], 5, { colorBase: leafB, colorTip: leafT });
    b.addSculptedLeaf({
      origin: [ox, h, oz],
      yaw: a,
      pitch: 0.14,
      length: 0.35,
      width: 0.26,
      arch: 0.1,
      cup: 0.025,
      serration: 0.3,
      segments: 5,
      colorBase: leafB,
      colorTip: leafT,
    });
  }
  b.addTube([[0, 0.05, 0], [0.04, 0.38, -0.02]], [0.015, 0.01], 5, { colorBase: leafB, colorTip: spathe });
  b.addBlob({ center: [0.04, 0.44, -0.02], radiusX: 0.032, radiusY: 0.075, radiusZ: 0.032, rings: 4, sides: 6, colorBase: spathe, colorTop: C('#f6e896') });
  return b.build();
}

function createRainforestBirdOfParadise() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#38682c');
  const leafT = C('#629644');
  const orange = C('#ea661e');
  const blue = C('#4c68c4');
  for (let i = 0; i < 10; i += 1) {
    const yaw = (i / 10) * Math.PI * 1.4 - Math.PI * 0.7;
    b.addSculptedLeaf({
      origin: [0, 0.04, 0],
      yaw,
      pitch: 0.58 + (i % 3) * 0.14,
      length: 0.62,
      width: 0.16,
      arch: 0.16,
      cup: 0.028,
      segments: 5,
      colorBase: leafB,
      colorTip: leafT,
    });
  }
  for (let f = 0; f < 3; f += 1) {
    const fx = (f - 1) * 0.16;
    const fz = (f % 2) * 0.08;
    b.addTube([[0, 0.05, 0], [fx * 0.5, 0.36, fz * 0.5], [fx, 0.68 - f * 0.06, fz]], [0.016, 0.013, 0.01], 5, { colorBase: leafB, colorTip: leafT });
    b.addSculptedLeaf({ origin: [fx, 0.68 - f * 0.06, fz], yaw: f * 1.1, pitch: 0.12, length: 0.2, width: 0.062, segments: 5, colorBase: orange, colorTip: blue });
    b.addBlossom({ center: [fx, 0.72 - f * 0.06, fz], radius: 0.06, petals: 5, tilt: [0.5, f, 0], colorPetal: orange, colorCore: blue });
  }
  return b.build();
}

function createRainforestBromeliadEpiphyte() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#426b2e');
  const leafT = C('#74a248');
  const torch = C('#df3438');
  const torchT = C('#f4a238');
  for (let layer = 0; layer < 3; layer += 1) {
    const n = 7 + layer * 2;
    for (let i = 0; i < n; i += 1) {
      b.addSculptedLeaf({
        origin: [0, 0.04 + layer * 0.04, 0],
        yaw: (i / n) * Math.PI * 2 + layer * 0.4,
        pitch: 0.22 + layer * 0.28,
        length: 0.36 - layer * 0.06,
        width: 0.075,
        arch: 0.1,
        cup: 0.025,
        segments: 4,
        colorBase: leafB,
        colorTip: leafT,
      });
    }
  }
  b.addFacetedPrism({
    base: [0, 0.12, 0],
    height: 0.26,
    radiusX: 0.048,
    radiusZ: 0.048,
    sides: 7,
    tiers: 5,
    taper: 0.68,
    colorBase: torch,
    colorTip: torchT,
  });
  return b.build();
}

export const TROPICAL_BIOME_FLORA = Object.freeze([
  // Biome 5: Tropical Seasonal Forest
  { id: 'seasonal_teak_stump', tileIds: [5], paletteTileId: 5, kind: 'trunk', motionProfile: 'rigid', height: 0.72, weight: 0.65, conform: false, barkProfile: 'pine', createGeometry: createSeasonalTeakStump },
  { id: 'seasonal_bamboo_culm_clump', tileIds: [5], paletteTileId: 5, kind: 'understory', motionProfile: 'flexible-stem', height: 1.04, weight: 1.1, conform: false, createGeometry: createSeasonalBambooCulmClump },
  { id: 'seasonal_heliconia_cluster', tileIds: [5], paletteTileId: 5, kind: 'blossom', motionProfile: 'broadleaf', height: 0.74, weight: 1.2, conform: false, createGeometry: createSeasonalHeliconiaCluster },
  { id: 'seasonal_cycad_crown', tileIds: [5], paletteTileId: 5, kind: 'understory', motionProfile: 'fern-frond', height: 0.65, weight: 1.1, conform: false, createGeometry: createSeasonalCycadCrown },
  { id: 'seasonal_lantana_bush', tileIds: [5], paletteTileId: 5, kind: 'blossom', motionProfile: 'woody-shrub', height: 0.46, weight: 1.3, conform: false, createGeometry: createSeasonalLantanaBush },
  // Biome 7: Tropical Rainforest
  { id: 'rainforest_buttress_snag', tileIds: [7], paletteTileId: 7, kind: 'trunk', motionProfile: 'rigid', height: 1.32, weight: 0.65, conform: false, barkProfile: 'pine', createGeometry: createRainforestButtressSnag },
  { id: 'rainforest_tree_fern', tileIds: [7], paletteTileId: 7, kind: 'understory', motionProfile: 'fern-frond', height: 0.96, weight: 1.1, conform: false, createGeometry: createRainforestTreeFern },
  { id: 'rainforest_monstera_patch', tileIds: [7], paletteTileId: 7, kind: 'broadleaf', motionProfile: 'broadleaf', height: 0.5, weight: 1.3, conform: false, createGeometry: createRainforestMonsteraPatch },
  { id: 'rainforest_bird_of_paradise', tileIds: [7], paletteTileId: 7, kind: 'blossom', motionProfile: 'broadleaf', height: 0.74, weight: 1.2, conform: false, createGeometry: createRainforestBirdOfParadise },
  { id: 'rainforest_bromeliad_epiphyte', tileIds: [7], paletteTileId: 7, kind: 'blossom', motionProfile: 'rigid', height: 0.36, weight: 1.4, conform: true, createGeometry: createRainforestBromeliadEpiphyte },
]);
