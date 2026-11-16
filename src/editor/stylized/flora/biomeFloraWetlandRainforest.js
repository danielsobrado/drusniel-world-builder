import * as THREE from 'three/webgpu';
import { OrganicMeshBuilder, createSeededRng } from './floraMeshPrimitives.js';

const C = (hex) => new THREE.Color(hex);

// --- Biome 8: Temperate Rainforest ---
function createTemperateRainNurseStump() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(801);
  const bark = C('#4e3f32');
  const moss = C('#4c7b30');
  const shootB = C('#42742e');
  const shootT = C('#74a848');
  b.addTube([[0, -0.08, 0], [0.02, 0.36, 0], [0, 0.78, -0.02]], [0.24, 0.18, 0.15], 12, {
    colorBase: bark, colorTip: moss, fluteCount: 6, fluteDepth: 0.16,
  });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    b.addTube([[0, 0.24, 0], [Math.cos(a) * 0.44, -0.05, Math.sin(a) * 0.44]], [0.09, 0.025], 6, { colorBase: moss, colorTip: bark });
  }
  // Huckleberry sapling shoots bursting right out of the mossy crown.
  for (let s = 0; s < 5; s += 1) {
    const a = (s / 5) * Math.PI * 2;
    const tip = [Math.cos(a) * 0.2, 1.05 + (s % 2) * 0.12, Math.sin(a) * 0.2];
    b.addTube([[0, 0.72, 0], tip], [0.018, 0.008], 5, { colorBase: moss, colorTip: shootT });
    for (let k = 0; k < 5; k += 1) {
      b.addSculptedLeaf({ origin: tip, yaw: a + k * 1.3, pitch: 0.28 + rng() * 0.3, length: 0.12, width: 0.048, colorBase: shootB, colorTip: shootT });
    }
  }
  return b.build();
}

function createTemperateRainDevilsClub() {
  const b = new OrganicMeshBuilder();
  const cane = C('#5d583e');
  const leafB = C('#3f6e2a');
  const leafT = C('#6a9b46');
  const berry = C('#cf2f24');
  const stalks = [[0, 0, 0.88], [-0.12, 0.1, 0.74], [0.13, -0.08, 0.68]];
  for (const [sx, sz, h] of stalks) {
    b.addTube([[sx, -0.03, sz], [sx * 1.1, h * 0.55, sz * 1.1], [sx * 1.2, h, sz * 1.2]], [0.026, 0.02, 0.012], 6, {
      colorBase: cane, colorTip: C('#7a7052'), fluteCount: 5, fluteDepth: 0.12,
    });
    for (let k = 0; k < 5; k += 1) {
      b.addSculptedLeaf({
        origin: [sx * 1.15, h * 0.84, sz * 1.15],
        yaw: (k / 5) * Math.PI * 2 + sx * 3,
        pitch: 0.22,
        length: 0.28,
        width: 0.22,
        arch: 0.08,
        serration: 0.26,
        segments: 5,
        colorBase: leafB,
        colorTip: leafT,
      });
    }
    b.addFacetedPrism({
      base: [sx * 1.2, h * 0.9, sz * 1.2],
      height: 0.14,
      radiusX: 0.032,
      radiusZ: 0.032,
      sides: 5,
      tiers: 3,
      colorBase: berry,
      colorTip: C('#ee5642'),
    });
  }
  return b.build();
}

function createTemperateRainSalalThicket() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(803);
  const stem = C('#524634');
  const leafB = C('#355c28');
  const leafT = C('#588740');
  const bell = C('#eedbe4');
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const tip = [Math.cos(a) * 0.3, 0.36 + (i % 2) * 0.1, Math.sin(a) * 0.3];
    b.addTube([[0, -0.02, 0], [tip[0] * 0.5, 0.2, tip[2] * 0.5], tip], [0.022, 0.015, 0.008], 5, { colorBase: stem, colorTip: leafB });
    for (let k = 0; k < 6; k += 1) {
      b.addSculptedLeaf({ origin: tip, yaw: a + k * 1.05, pitch: 0.18 + rng() * 0.3, length: 0.15, width: 0.085, colorBase: leafB, colorTip: leafT });
    }
    b.addBlossom({ center: [tip[0], tip[1] - 0.02, tip[2]], radius: 0.036, petals: 5, tilt: [2.4, a, 0], colorPetal: bell, colorCore: C('#d880a8') });
  }
  return b.build();
}

function createTemperateRainTrilliumTrio() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#3c682d');
  const leafT = C('#629246');
  const white = C('#f4eff0');
  const stems = [[0, 0, 0.28], [-0.14, 0.1, 0.24], [0.14, -0.09, 0.22], [-0.08, -0.14, 0.2], [0.12, 0.14, 0.23]];
  for (const [sx, sz, h] of stems) {
    b.addTube([[sx * 0.5, 0, sz * 0.5], [sx * 0.8, h * 0.5, sz * 0.8], [sx, h, sz]], [0.009, 0.007, 0.005], 5, { colorBase: leafB, colorTip: leafT });
    for (let l = 0; l < 3; l += 1) {
      b.addSculptedLeaf({
        origin: [sx, h * 0.85, sz],
        yaw: (l / 3) * Math.PI * 2 + sx * 4,
        pitch: 0.12,
        length: 0.16,
        width: 0.12,
        arch: 0.03,
        colorBase: leafB,
        colorTip: leafT,
      });
    }
    b.addBlossom({ center: [sx, h + 0.03, sz], radius: 0.068, petals: 3, colorPetal: white, colorCore: C('#e0be4c'), cupDepth: 0.016 });
  }
  return b.build();
}

function createTemperateRainOxalisCarpet() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(805);
  const cloverB = C('#3e6d30');
  const cloverT = C('#6c9d4e');
  const blossom = C('#f3e8ee');
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + rng() * 0.3;
    const d = 0.06 + (i % 3) * 0.07;
    const px = Math.cos(a) * d;
    const pz = Math.sin(a) * d;
    const h = 0.08 + (i % 2) * 0.04;
    b.addTube([[px, 0, pz], [px, h, pz]], [0.006, 0.004], 4, { colorBase: cloverB, colorTip: cloverT });
    for (let k = 0; k < 3; k += 1) {
      b.addSculptedLeaf({ origin: [px, h, pz], yaw: a + (k / 3) * Math.PI * 2, pitch: 0.08, length: 0.085, width: 0.072, colorBase: cloverB, colorTip: cloverT });
    }
    if (i % 2 === 0) {
      b.addBlossom({ center: [px, h + 0.045, pz], radius: 0.038, petals: 5, colorPetal: blossom, colorCore: C('#d880a4') });
    }
  }
  return b.build();
}

// --- Biome 12: Wetland / Mire ---
function createWetlandCypressKnees() {
  const b = new OrganicMeshBuilder();
  const dark = C('#4b4034');
  const moss = C('#4e7532');
  const knees = [
    [0, 0, 0.64, 0.17],
    [-0.22, 0.14, 0.46, 0.115],
    [0.24, -0.1, 0.5, 0.125],
    [-0.14, -0.24, 0.38, 0.095],
    [0.18, 0.22, 0.36, 0.09],
    [-0.28, -0.05, 0.3, 0.08],
    [0.05, 0.28, 0.28, 0.075],
  ];
  for (const [kx, kz, h, r] of knees) {
    b.addTube(
      [[kx, -0.1, kz], [kx, h * 0.32, kz], [kx, h * 0.66, kz], [kx, h, kz]],
      [r * 1.18, r * 0.82, r * 0.52, r * 0.2],
      11,
      { colorBase: dark, colorTip: moss, fluteCount: 7, fluteDepth: 0.18 },
    );
  }
  return b.build();
}

function createWetlandPitcherPlantCluster() {
  const b = new OrganicMeshBuilder();
  const green = C('#557c36');
  const crimson = C('#a83846');
  const hood = C('#cc5c4e');
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const h = 0.28 + (i % 3) * 0.09;
    const leanX = Math.cos(a) * 0.13;
    const leanZ = Math.sin(a) * 0.13;
    b.addTube(
      [[0, -0.02, 0], [leanX * 0.4, h * 0.35, leanZ * 0.4], [leanX * 0.75, h * 0.7, leanZ * 0.75], [leanX, h, leanZ]],
      [0.015, 0.024, 0.036, 0.044],
      8,
      { colorBase: green, colorTip: crimson, fluteCount: 4, fluteDepth: 0.08, capEnd: false },
    );
    b.addSculptedLeaf({
      origin: [leanX, h, leanZ],
      yaw: a,
      pitch: -0.2,
      length: 0.09,
      width: 0.085,
      arch: 0.02,
      cup: 0.025,
      colorBase: crimson,
      colorTip: hood,
    });
  }
  b.addTube([[0, 0, 0], [0.02, 0.48, 0]], [0.009, 0.006], 4, { colorBase: green, colorTip: crimson });
  b.addBlossom({ center: [0.02, 0.48, 0], radius: 0.058, petals: 5, tilt: [Math.PI, 0, 0], colorPetal: crimson, colorCore: C('#e0c45c') });
  return b.build();
}

function createWetlandSkunkCabbageRosette() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#3d6d2d');
  const leafT = C('#6fa346');
  const hood = C('#6d2b46');
  for (let ring = 0; ring < 2; ring += 1) {
    const n = 7 + ring * 3;
    for (let i = 0; i < n; i += 1) {
      b.addSculptedLeaf({
        origin: [0, 0.02 + ring * 0.03, 0],
        yaw: (i / n) * Math.PI * 2 + ring * 0.35,
        pitch: 0.36 + ring * 0.24,
        length: 0.44 - ring * 0.08,
        width: 0.28,
        arch: 0.12,
        cup: 0.045,
        segments: 5,
        colorBase: leafB,
        colorTip: leafT,
      });
    }
  }
  b.addBlob({ center: [0, 0.13, 0], radiusX: 0.058, radiusY: 0.12, radiusZ: 0.058, rings: 5, sides: 8, ribAmp: 0.16, colorBase: hood, colorTop: C('#a85848') });
  return b.build();
}

function createWetlandBogMyrtleClump() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(1204);
  const bark = C('#554434');
  const leafB = C('#4c6b3a');
  const leafT = C('#779658');
  const catkin = C('#b87436');
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + rng() * 0.3;
    const tip = [Math.cos(a) * 0.28, 0.44 + rng() * 0.12, Math.sin(a) * 0.28];
    b.addTube([[0, -0.04, 0], [tip[0] * 0.5, 0.2, tip[2] * 0.5], tip], [0.025, 0.016, 0.008], 5, { colorBase: bark, colorTip: leafB });
    for (let k = 0; k < 7; k += 1) {
      b.addSculptedLeaf({ origin: tip, yaw: a + k * 0.9, pitch: 0.25 + rng() * 0.35, length: 0.14, width: 0.04, colorBase: leafB, colorTip: leafT });
    }
    b.addBlob({ center: tip, radiusX: 0.018, radiusY: 0.032, radiusZ: 0.018, rings: 3, sides: 5, colorBase: catkin, colorTop: C('#d89c4e') });
  }
  return b.build();
}

function createWetlandSundewSphagnumPad() {
  const b = new OrganicMeshBuilder();
  const sphagnum = C('#5c7e38');
  const sphagTop = C('#84a64c');
  const ruby = C('#b83244');
  b.addBlob({ center: [0, 0.05, 0], radiusX: 0.26, radiusY: 0.1, radiusZ: 0.24, rings: 5, sides: 10, ribAmp: 0.12, colorBase: sphagnum, colorTop: sphagTop });
  const rosettes = [[0, 0.15, 0], [-0.12, 0.12, 0.08], [0.11, 0.12, -0.07]];
  for (const [rx, ry, rz] of rosettes) {
    for (let i = 0; i < 7; i += 1) {
      b.addSculptedLeaf({
        origin: [rx, ry, rz],
        yaw: (i / 7) * Math.PI * 2,
        pitch: 0.18,
        length: 0.095,
        width: 0.038,
        cup: 0.012,
        colorBase: sphagTop,
        colorTip: ruby,
      });
    }
    b.addTube([[rx, ry, rz], [rx, ry + 0.14, rz]], [0.004, 0.003], 4, { colorBase: ruby, colorTip: C('#eddde2') });
    b.addBlossom({ center: [rx, ry + 0.14, rz], radius: 0.025, petals: 5, colorPetal: C('#f4eaee'), colorCore: ruby });
  }
  return b.build();
}

export const WETLAND_RAINFOREST_BIOME_FLORA = Object.freeze([
  // Biome 8: Temperate Rainforest
  { id: 'temperate_rain_nurse_stump', tileIds: [8], paletteTileId: 8, kind: 'trunk', motionProfile: 'rigid', height: 1.08, weight: 0.7, conform: false, barkProfile: 'spruce', createGeometry: createTemperateRainNurseStump },
  { id: 'temperate_rain_devils_club', tileIds: [8], paletteTileId: 8, kind: 'understory', motionProfile: 'broadleaf', height: 0.88, weight: 1.1, conform: false, createGeometry: createTemperateRainDevilsClub },
  { id: 'temperate_rain_salal_thicket', tileIds: [8], paletteTileId: 8, kind: 'understory', motionProfile: 'woody-shrub', height: 0.44, weight: 1.3, conform: false, createGeometry: createTemperateRainSalalThicket },
  { id: 'temperate_rain_trillium_trio', tileIds: [8], paletteTileId: 8, kind: 'blossom', motionProfile: 'grass-tuft', height: 0.28, weight: 1.4, conform: true, createGeometry: createTemperateRainTrilliumTrio },
  { id: 'temperate_rain_oxalis_carpet', tileIds: [8], paletteTileId: 8, kind: 'blossom', motionProfile: 'grass-tuft', height: 0.14, weight: 1.6, conform: true, createGeometry: createTemperateRainOxalisCarpet },
  // Biome 12: Wetland
  { id: 'wetland_cypress_knees', tileIds: [12], paletteTileId: 12, kind: 'trunk', motionProfile: 'rigid', height: 0.62, weight: 0.75, conform: false, barkProfile: 'swamp', createGeometry: createWetlandCypressKnees },
  { id: 'wetland_pitcher_plant_cluster', tileIds: [12], paletteTileId: 12, kind: 'blossom', motionProfile: 'flexible-stem', height: 0.48, weight: 1.3, conform: false, createGeometry: createWetlandPitcherPlantCluster },
  { id: 'wetland_skunk_cabbage_rosette', tileIds: [12], paletteTileId: 12, kind: 'understory', motionProfile: 'broadleaf', height: 0.44, weight: 1.2, conform: true, createGeometry: createWetlandSkunkCabbageRosette },
  { id: 'wetland_bog_myrtle_clump', tileIds: [12], paletteTileId: 12, kind: 'understory', motionProfile: 'woody-shrub', height: 0.52, weight: 1.3, conform: false, createGeometry: createWetlandBogMyrtleClump },
  { id: 'wetland_sundew_sphagnum_pad', tileIds: [12], paletteTileId: 12, kind: 'blossom', motionProfile: 'grass-tuft', height: 0.28, weight: 1.5, conform: true, createGeometry: createWetlandSundewSphagnumPad },
]);
