import * as THREE from 'three/webgpu';
import { OrganicMeshBuilder, createSeededRng } from './floraMeshPrimitives.js';

const C = (hex) => new THREE.Color(hex);

// --- Biome 9: Taiga ---
function createTaigaPineWindfallSnag() {
  const b = new OrganicMeshBuilder();
  const bark = C('#5a4534');
  const resin = C('#8c6b48');
  const lichen = C('#849474');
  b.addTube(
    [[0, -0.08, 0], [0.04, 0.26, -0.02], [0.06, 0.56, -0.01], [-0.04, 0.88, 0.04], [-0.14, 1.3, 0.08]],
    [0.2, 0.16, 0.13, 0.1, 0.038],
    13,
    { colorBase: bark, colorTip: resin, fluteCount: 7, fluteDepth: 0.16 },
  );
  const stubs = [[0.46, 0.28, 0.12], [0.64, -0.26, -0.14], [0.84, 0.22, -0.22], [1.0, -0.2, 0.2], [1.14, 0.12, 0.16]];
  for (const [sy, dx, dz] of stubs) {
    b.addTube([[0, sy, 0], [dx, sy - 0.05, dz], [dx * 1.45, sy + 0.02, dz * 1.45]], [0.046, 0.028, 0.01], 6, { colorBase: resin, colorTip: lichen });
  }
  for (let r = 0; r < 6; r += 1) {
    const a = (r / 6) * Math.PI * 2 + 0.3;
    b.addTube([[0, 0.12, 0], [Math.cos(a) * 0.24, 0.02, Math.sin(a) * 0.24], [Math.cos(a) * 0.45, -0.06, Math.sin(a) * 0.45]], [0.075, 0.044, 0.018], 6, { colorBase: bark, colorTip: bark });
  }
  return b.build();
}

function createTaigaLabradorTeaBush() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(902);
  const twig = C('#584434');
  const leafB = C('#3a5c32');
  const leafT = C('#62844c');
  const umbel = C('#f0ece2');
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + rng() * 0.25;
    const tip = [Math.cos(a) * 0.26, 0.38 + rng() * 0.1, Math.sin(a) * 0.26];
    b.addTube([[0, -0.02, 0], [tip[0] * 0.5, 0.19, tip[2] * 0.5], tip], [0.024, 0.015, 0.008], 5, { colorBase: twig, colorTip: leafB });
    for (let k = 0; k < 7; k += 1) {
      b.addSculptedLeaf({ origin: tip, yaw: a + k * 0.9, pitch: 0.2 + rng() * 0.35, length: 0.12, width: 0.036, colorBase: leafB, colorTip: leafT });
    }
    b.addBlossom({ center: [tip[0], tip[1] + 0.03, tip[2]], radius: 0.044, petals: 6, colorPetal: umbel, colorCore: C('#d8bc62') });
  }
  return b.build();
}

function createTaigaCloudberryMat() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#4c6b32');
  const leafT = C('#74964c');
  const amber = C('#e49428');
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const d = 0.07 + (i % 3) * 0.08;
    const px = Math.cos(a) * d;
    const pz = Math.sin(a) * d;
    b.addSculptedLeaf({ origin: [px, 0.04, pz], yaw: a, pitch: 0.15, length: 0.14, width: 0.12, serration: 0.24, segments: 5, colorBase: leafB, colorTip: leafT });
    if (i % 2 === 0) {
      b.addTube([[px, 0.02, pz], [px, 0.13, pz]], [0.007, 0.005], 4, { colorBase: leafB, colorTip: amber });
      b.addBlob({ center: [px, 0.15, pz], radiusX: 0.024, radiusY: 0.022, radiusZ: 0.024, rings: 3, sides: 6, ribAmp: 0.14, colorBase: amber, colorTop: C('#f6c248') });
    }
  }
  return b.build();
}

function createTaigaLingonberryTussock() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(904);
  const leafB = C('#365a2c');
  const leafT = C('#557e40');
  const ruby = C('#c62e34');
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const tip = [Math.cos(a) * 0.2, 0.14 + (i % 2) * 0.05, Math.sin(a) * 0.2];
    b.addTube([[0, -0.02, 0], tip], [0.012, 0.006], 4, { colorBase: C('#524032'), colorTip: leafB });
    for (let k = 0; k < 5; k += 1) {
      b.addSculptedLeaf({ origin: tip, yaw: a + k * 1.2, pitch: 0.15 + rng() * 0.25, length: 0.09, width: 0.042, colorBase: leafB, colorTip: leafT });
    }
    b.addBlob({ center: [tip[0], tip[1] + 0.02, tip[2]], radiusX: 0.018, radiusY: 0.018, radiusZ: 0.018, rings: 3, sides: 5, colorBase: ruby, colorTop: C('#ea5458') });
  }
  return b.build();
}

function createTaigaHorsetailReedPatch() {
  const b = new OrganicMeshBuilder();
  const stem = C('#4c7238');
  const tip = C('#7ea452');
  for (let s = 0; s < 5; s += 1) {
    const a = (s / 5) * Math.PI * 2;
    const rad = s === 0 ? 0.02 : 0.11;
    const ox = Math.cos(a) * rad;
    const oz = Math.sin(a) * rad;
    const h = 0.42 + (s % 2) * 0.1;
    b.addTube([[ox, -0.02, oz], [ox, h, oz]], [0.011, 0.006], 5, { colorBase: stem, colorTip: tip });
    for (let ring = 0; ring < 3; ring += 1) {
      const ry = h * (0.35 + ring * 0.22);
      for (let w = 0; w < 6; w += 1) {
        const wa = (w / 6) * Math.PI * 2 + ring * 0.5;
        b.addTube([[ox, ry, oz], [ox + Math.cos(wa) * 0.09, ry + 0.04, oz + Math.sin(wa) * 0.09]], [0.004, 0.002], 4, { colorBase: stem, colorTip: tip });
      }
    }
  }
  return b.build();
}

// --- Biome 10: Tundra ---
function createTundraKrummholzBirch() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(1001);
  const bark = C('#6c5e54');
  const pale = C('#a4968c');
  const leafB = C('#5a7234');
  const leafT = C('#849848');
  // Wind-sheared horizontal crawling trunk pinned against the permafrost.
  b.addTube(
    [[-0.36, -0.04, 0], [-0.1, 0.08, 0.05], [0.18, 0.14, -0.06], [0.44, 0.2, 0.04]],
    [0.11, 0.08, 0.055, 0.025],
    8,
    { colorBase: bark, colorTip: pale, fluteCount: 4, fluteDepth: 0.12 },
  );
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3;
    const origin = [-0.14 + t * 0.52, 0.08 + t * 0.1, Math.sin(i * 1.9) * 0.06];
    const tip = [origin[0] + 0.12, origin[1] + 0.16, origin[2] + (i % 2 === 0 ? 0.14 : -0.14)];
    b.addTube([origin, tip], [0.026, 0.01], 5, { colorBase: bark, colorTip: pale });
    for (let k = 0; k < 5; k += 1) {
      b.addSculptedLeaf({ origin: tip, yaw: rng() * Math.PI * 2, pitch: 0.18, length: 0.085, width: 0.052, colorBase: leafB, colorTip: leafT });
    }
  }
  return b.build();
}

function createTundraArcticWillowMat() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#5a6e4a');
  const leafT = C('#889a72');
  const catkin = C('#e4dfd4');
  b.addBlob({ center: [0, 0.05, 0], radiusX: 0.27, radiusY: 0.09, radiusZ: 0.25, rings: 5, sides: 11, ribAmp: 0.15, colorBase: leafB, colorTop: leafT });
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const sx = Math.cos(a) * 0.15;
    const sz = Math.sin(a) * 0.15;
    b.addSculptedLeaf({ origin: [sx, 0.08, sz], yaw: a, pitch: 0.15, length: 0.12, width: 0.058, segments: 4, colorBase: leafB, colorTip: leafT });
    b.addBlob({ center: [sx * 0.8, 0.15, sz * 0.8], radiusX: 0.017, radiusY: 0.034, radiusZ: 0.017, rings: 3, sides: 6, colorBase: C('#c8b674'), colorTop: catkin });
  }
  return b.build();
}

function createTundraCrowberryCushion() {
  const b = new OrganicMeshBuilder();
  const base = C('#3a542d');
  const rust = C('#6a6c34');
  const berry = C('#221b2c');
  const lobes = [[0, 0.06, 0, 0.22, 0.095], [-0.15, 0.04, 0.09, 0.15, 0.075], [0.14, 0.04, -0.09, 0.14, 0.075], [0.04, 0.04, 0.15, 0.12, 0.065]];
  for (const [cx, cy, cz, rx, ry] of lobes) {
    b.addBlob({ center: [cx, cy, cz], radiusX: rx, radiusY: ry, radiusZ: rx, rings: 5, sides: 9, ribAmp: 0.14, colorBase: base, colorTop: rust });
  }
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    b.addBlob({ center: [Math.cos(a) * 0.12, 0.13, Math.sin(a) * 0.12], radiusX: 0.015, radiusY: 0.015, radiusZ: 0.015, rings: 3, sides: 5, colorBase: berry, colorTop: C('#463858') });
  }
  return b.build();
}

function createTundraCottonGrassTuft() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(1004);
  const sedge = C('#5d7038');
  const straw = C('#9c8e50');
  const puff = C('#f4f2ec');
  for (let i = 0; i < 10; i += 1) {
    b.addSculptedLeaf({
      origin: [0, 0.01, 0],
      yaw: (i / 10) * Math.PI * 2,
      pitch: 0.35 + rng() * 0.3,
      length: 0.24,
      width: 0.022,
      arch: 0.09,
      colorBase: sedge,
      colorTip: straw,
    });
  }
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + 0.2;
    const tip = [Math.cos(a) * 0.11, 0.32 + (i % 2) * 0.06, Math.sin(a) * 0.11];
    b.addTube([[0, 0.01, 0], tip], [0.007, 0.004], 4, { colorBase: sedge, colorTip: straw });
    b.addBlob({ center: tip, radiusX: 0.028, radiusY: 0.026, radiusZ: 0.028, rings: 4, sides: 7, ribAmp: 0.1, colorBase: C('#d6d4cc'), colorTop: puff });
  }
  return b.build();
}

function createTundraReindeerLichenClump() {
  const b = new OrganicMeshBuilder();
  const base = C('#8a987e');
  const tip = C('#dfe5d4');
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    const rad = i === 0 ? 0.02 : 0.14;
    const ox = Math.cos(a) * rad;
    const oz = Math.sin(a) * rad;
    b.addBlob({ center: [ox, 0.055 + (i % 2) * 0.02, oz], radiusX: 0.065, radiusY: 0.06, radiusZ: 0.065, rings: 4, sides: 7, ribAmp: 0.22, ribFreq: 5, colorBase: base, colorTop: tip });
  }
  return b.build();
}

// --- Biome 11: Glacier ---
function createGlacierPenitentesCluster() {
  const b = new OrganicMeshBuilder();
  const baseIce = C('#6898bd');
  const sunTip = C('#e4f2fc');
  for (let i = 0; i < 8; i += 1) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const x = (col - 1.5) * 0.17 + row * 0.05;
    const z = (row - 0.5) * 0.22;
    const h = 0.58 + ((i * 3) % 4) * 0.14;
    b.addFacetedPrism({
      base: [x, -0.06, z],
      height: h,
      radiusX: 0.065,
      radiusZ: 0.12,
      sides: 6,
      tiers: 5,
      tilt: [0.18, 0.15, -0.1],
      taper: 0.88,
      colorBase: baseIce,
      colorTip: sunTip,
    });
  }
  return b.build();
}

function createGlacierBlueSeracSpur() {
  const b = new OrganicMeshBuilder();
  const deepBlue = C('#4580b4');
  const frostTip = C('#d4ebf8');
  b.addFacetedPrism({ base: [0, -0.1, 0], height: 1.26, radiusX: 0.27, radiusZ: 0.22, sides: 8, tiers: 7, tilt: [0.1, 0.3, -0.08], taper: 0.78, colorBase: deepBlue, colorTip: frostTip });
  const shards = [
    [-0.22, 0.12, 0.82, 0.16, 0.15, [0.22, 0.1, 0.18]],
    [0.22, -0.1, 0.72, 0.15, 0.14, [-0.15, -0.2, -0.22]],
    [-0.08, -0.24, 0.56, 0.14, 0.13, [-0.26, 0.5, 0.1]],
    [0.14, 0.22, 0.48, 0.13, 0.12, [0.28, -0.4, -0.12]],
    [-0.32, -0.04, 0.38, 0.11, 0.1, [0.12, 0.3, 0.34]],
  ];
  for (const [bx, bz, h, rx, rz, tilt] of shards) {
    b.addFacetedPrism({ base: [bx, -0.08, bz], height: h, radiusX: rx, radiusZ: rz, sides: 7, tiers: 5, tilt, taper: 0.82, colorBase: deepBlue, colorTip: frostTip });
  }
  return b.build();
}

function createGlacierFrostCrystalRose() {
  const b = new OrganicMeshBuilder();
  const iceB = C('#6ba6d2');
  const iceT = C('#ecf7ff');
  b.addBlob({ center: [0, 0.04, 0], radiusX: 0.22, radiusY: 0.08, radiusZ: 0.22, rings: 4, sides: 9, colorBase: iceB, colorTop: iceT });
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * Math.PI * 2;
    b.addFacetedPrism({
      base: [Math.cos(a) * 0.08, 0.03, Math.sin(a) * 0.08],
      height: 0.34 + (i % 3) * 0.09,
      radiusX: 0.04,
      radiusZ: 0.02,
      sides: 6,
      tiers: 4,
      tilt: [Math.sin(a) * 0.65, a, -Math.cos(a) * 0.65],
      taper: 0.68,
      colorBase: iceB,
      colorTip: iceT,
    });
  }
  return b.build();
}

function createGlacierPressureRidgeHeave() {
  const b = new OrganicMeshBuilder();
  const shadowIce = C('#4f83ad');
  const ridgeTip = C('#dff0fa');
  const slabs = [
    { base: [-0.12, -0.08, 0], h: 0.58, rx: 0.26, rz: 0.065, tilt: [0.42, 0.2, 0.15] },
    { base: [0.14, -0.08, 0.06], h: 0.64, rx: 0.24, rz: 0.06, tilt: [-0.38, -0.1, -0.18] },
    { base: [0.02, -0.08, -0.18], h: 0.48, rx: 0.22, rz: 0.055, tilt: [0.28, 0.6, 0.22] },
    { base: [-0.04, -0.08, 0.22], h: 0.42, rx: 0.2, rz: 0.05, tilt: [-0.32, -0.5, -0.14] },
    { base: [-0.26, -0.08, -0.14], h: 0.36, rx: 0.17, rz: 0.045, tilt: [0.22, 0.9, 0.28] },
    { base: [0.26, -0.08, 0.16], h: 0.34, rx: 0.16, rz: 0.045, tilt: [-0.24, -0.8, -0.26] },
  ];
  for (const s of slabs) {
    b.addFacetedPrism({ base: s.base, height: s.h, radiusX: s.rx, radiusZ: s.rz, sides: 7, tiers: 5, tilt: s.tilt, taper: 0.35, colorBase: shadowIce, colorTip: ridgeTip });
  }
  return b.build();
}

function createGlacierFrozenLichenSnag() {
  const b = new OrganicMeshBuilder();
  const darkWood = C('#5b5450');
  const rimeTip = C('#d4e4ef');
  b.addTube(
    [[0, -0.08, 0], [-0.03, 0.18, 0.01], [-0.04, 0.42, 0.02], [0.08, 0.74, -0.04], [0.14, 1.06, 0.04]],
    [0.17, 0.14, 0.12, 0.08, 0.028],
    13,
    { colorBase: darkWood, colorTip: rimeTip, fluteCount: 7, fluteDepth: 0.16 },
  );
  b.addTube([[0.06, 0.62, -0.03], [0.18, 0.72, -0.12], [0.3, 0.82, -0.2]], [0.05, 0.032, 0.014], 7, { colorBase: darkWood, colorTip: rimeTip });
  b.addTube([[-0.02, 0.46, 0.02], [-0.22, 0.6, 0.16], [-0.32, 0.68, 0.22]], [0.042, 0.026, 0.012], 6, { colorBase: darkWood, colorTip: rimeTip });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    b.addFacetedPrism({ base: [Math.cos(a) * 0.12, -0.06, Math.sin(a) * 0.12], height: 0.38 + i * 0.05, radiusX: 0.11, radiusZ: 0.1, sides: 6, tiers: 4, tilt: [0.16, a, 0.1], taper: 0.7, colorBase: C('#689ec4'), colorTip: rimeTip });
  }
  return b.build();
}

export const COLD_ALPINE_BIOME_FLORA = Object.freeze([
  // Biome 9: Taiga
  { id: 'taiga_pine_windfall_snag', tileIds: [9], paletteTileId: 9, kind: 'trunk', motionProfile: 'rigid', height: 1.28, weight: 0.65, conform: false, barkProfile: 'spruce', createGeometry: createTaigaPineWindfallSnag },
  { id: 'taiga_labrador_tea_bush', tileIds: [9], paletteTileId: 9, kind: 'blossom', motionProfile: 'woody-shrub', height: 0.46, weight: 1.3, conform: false, createGeometry: createTaigaLabradorTeaBush },
  { id: 'taiga_cloudberry_mat', tileIds: [9], paletteTileId: 9, kind: 'blossom', motionProfile: 'grass-tuft', height: 0.18, weight: 1.5, conform: true, createGeometry: createTaigaCloudberryMat },
  { id: 'taiga_lingonberry_tussock', tileIds: [9], paletteTileId: 9, kind: 'smallPlant', motionProfile: 'woody-shrub', height: 0.2, weight: 1.4, conform: true, createGeometry: createTaigaLingonberryTussock },
  { id: 'taiga_horsetail_reed_patch', tileIds: [9], paletteTileId: 9, kind: 'smallPlant', motionProfile: 'flexible-stem', height: 0.52, weight: 1.4, conform: false, createGeometry: createTaigaHorsetailReedPatch },
  // Biome 10: Tundra
  { id: 'tundra_krummholz_dwarf_birch', tileIds: [10], paletteTileId: 10, kind: 'trunk', motionProfile: 'woody-shrub', height: 0.36, weight: 0.85, conform: true, barkProfile: 'beech', createGeometry: createTundraKrummholzBirch },
  { id: 'tundra_arctic_willow_mat', tileIds: [10], paletteTileId: 10, kind: 'understory', motionProfile: 'rigid', height: 0.18, weight: 1.4, conform: true, createGeometry: createTundraArcticWillowMat },
  { id: 'tundra_crowberry_cushion', tileIds: [10], paletteTileId: 10, kind: 'smallPlant', motionProfile: 'rigid', height: 0.15, weight: 1.5, conform: true, createGeometry: createTundraCrowberryCushion },
  { id: 'tundra_cotton_grass_tuft', tileIds: [10], paletteTileId: 10, kind: 'blossom', motionProfile: 'grass-tuft', height: 0.36, weight: 1.5, conform: true, createGeometry: createTundraCottonGrassTuft },
  { id: 'tundra_reindeer_lichen_clump', tileIds: [10], paletteTileId: 10, kind: 'smallPlant', motionProfile: 'rigid', height: 0.14, weight: 1.5, conform: true, createGeometry: createTundraReindeerLichenClump },
  // Biome 11: Glacier (formations, crystals & rime snag)
  { id: 'glacier_penitentes_cluster', tileIds: [11], paletteTileId: 11, kind: 'ice', ice: true, motionProfile: 'rigid', height: 0.98, weight: 1.3, conform: false, createGeometry: createGlacierPenitentesCluster },
  { id: 'glacier_blue_serac_spur', tileIds: [11], paletteTileId: 11, kind: 'ice', ice: true, motionProfile: 'rigid', height: 1.24, weight: 1.1, conform: false, createGeometry: createGlacierBlueSeracSpur },
  { id: 'glacier_frost_crystal_rose', tileIds: [11], paletteTileId: 11, kind: 'ice', ice: true, motionProfile: 'rigid', height: 0.45, weight: 1.5, conform: true, createGeometry: createGlacierFrostCrystalRose },
  { id: 'glacier_pressure_ridge_heave', tileIds: [11], paletteTileId: 11, kind: 'ice', ice: true, motionProfile: 'rigid', height: 0.62, weight: 1.2, conform: false, createGeometry: createGlacierPressureRidgeHeave },
  { id: 'glacier_frozen_lichen_snag', tileIds: [11], paletteTileId: 11, kind: 'trunk', motionProfile: 'rigid', height: 1.04, weight: 0.7, conform: false, barkProfile: 'spruce', createGeometry: createGlacierFrozenLichenSnag },
]);
