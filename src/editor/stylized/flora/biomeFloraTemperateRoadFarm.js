import * as THREE from 'three/webgpu';
import { OrganicMeshBuilder, createSeededRng } from './floraMeshPrimitives.js';

const C = (hex) => new THREE.Color(hex);

function addLeafSpray(b, origin, count, len, w, baseC, tipC, rng, pitchMin = 0.25) {
  for (let i = 0; i < count; i += 1) {
    const yaw = (i / count) * Math.PI * 2 + rng() * 0.45;
    b.addSculptedLeaf({
      origin,
      yaw,
      pitch: pitchMin + rng() * 0.48,
      roll: (rng() - 0.5) * 0.35,
      length: len * (0.85 + rng() * 0.3),
      width: w,
      arch: len * 0.28,
      cup: 0.012,
      segments: 4,
      colorBase: baseC,
      colorTip: tipC,
    });
  }
}

// --- Biome 4: Grassland ---
function createGrasslandHawthornStump() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(401);
  const bark = C('#5d493a');
  const barkTip = C('#7c6452');
  const leafB = C('#4c7634');
  const leafT = C('#74a24d');
  b.addRootCollar({ center: [0, 0, 0], radius: 0.34, height: 0.08, sides: 10, colorBase: bark, colorTop: leafB });
  b.addTube([[0, -0.07, 0], [0.04, 0.28, 0.02], [-0.02, 0.62, -0.03]], [0.18, 0.14, 0.1], 9, {
    colorBase: bark, colorTip: barkTip, fluteCount: 5, fluteDepth: 0.14,
  });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const tip = [Math.cos(a) * 0.28, 0.72 + (i % 2) * 0.1, Math.sin(a) * 0.28];
    b.addTube([[0, 0.52, 0], tip], [0.032, 0.012], 5, { colorBase: bark, colorTip: barkTip });
    addLeafSpray(b, tip, 7, 0.14, 0.052, leafB, leafT, rng);
    b.addBlossom({ center: tip, radius: 0.042, petals: 5, colorPetal: C('#f2ede4'), colorCore: C('#d88078') });
  }
  return b.build();
}

function createGrasslandGorseThicket() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(402);
  const spineB = C('#44642e');
  const spineT = C('#6a8e3e');
  const gold = C('#f0bc1c');
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 + rng() * 0.25;
    const p1 = [Math.cos(a) * 0.18, 0.22, Math.sin(a) * 0.18];
    const p2 = [Math.cos(a) * 0.34, 0.44 + rng() * 0.1, Math.sin(a) * 0.34];
    b.addTube([[0, -0.03, 0], p1, p2], [0.024, 0.015, 0.008], 5, { colorBase: spineB, colorTip: spineT });
    addLeafSpray(b, p1, 5, 0.13, 0.025, spineB, spineT, rng);
    b.addBlossom({ center: p2, radius: 0.052, petals: 5, colorPetal: gold, colorCore: C('#c86e14'), cupDepth: 0.02 });
  }
  return b.build();
}

function createGrasslandYarrowClump() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(403);
  const leafB = C('#4b6e35');
  const leafT = C('#729650');
  const cream = C('#f0e9d4');
  const pink = C('#e2a6b8');
  addLeafSpray(b, [0, 0.02, 0], 10, 0.24, 0.048, leafB, leafT, rng, 0.2);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + 0.15;
    const tx = Math.cos(a) * 0.12;
    const tz = Math.sin(a) * 0.12;
    const h = 0.36 + (i % 2) * 0.08;
    b.addTube([[0, 0.02, 0], [tx * 0.6, h * 0.5, tz * 0.6], [tx, h, tz]], [0.01, 0.007, 0.005], 4, { colorBase: leafB, colorTip: leafT });
    b.addBlossom({ center: [tx, h, tz], radius: 0.068, petals: 7, colorPetal: i % 2 === 0 ? cream : pink, colorCore: C('#e0ba48'), cupDepth: 0.008 });
  }
  return b.build();
}

function createGrasslandThistleRosette() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#4e6e42');
  const leafT = C('#789c62');
  const bloom = C('#a83b98');
  for (let i = 0; i < 8; i += 1) {
    b.addSculptedLeaf({
      origin: [0, 0.03, 0],
      yaw: (i / 8) * Math.PI * 2,
      pitch: 0.18 + (i % 2) * 0.18,
      length: 0.28,
      width: 0.088,
      arch: 0.04,
      serration: 0.24,
      colorBase: leafB,
      colorTip: leafT,
    });
  }
  for (let i = 0; i < 3; i += 1) {
    const a = i * 2.1;
    const tx = Math.cos(a) * 0.08;
    const tz = Math.sin(a) * 0.08;
    const h = 0.44 - i * 0.06;
    b.addTube([[0, 0.03, 0], [tx, h, tz]], [0.014, 0.009], 5, { colorBase: leafB, colorTip: leafT });
    b.addBlob({ center: [tx, h, tz], radiusX: 0.032, radiusY: 0.035, radiusZ: 0.032, rings: 4, sides: 7, colorBase: leafB, colorTop: bloom });
    b.addBlossom({ center: [tx, h + 0.035, tz], radius: 0.05, petals: 8, colorPetal: bloom, colorCore: C('#e090d4'), cupDepth: 0.025 });
  }
  return b.build();
}

function createGrasslandPoppyTuft() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(405);
  const green = C('#4b7136');
  const greenT = C('#749b52');
  const scarlet = C('#d93829');
  addLeafSpray(b, [0, 0.02, 0], 13, 0.23, 0.056, green, greenT, rng);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const rad = i % 2 === 0 ? 0.12 : 0.08;
    const tip = [Math.cos(a) * rad, 0.34 + (i % 3) * 0.06, Math.sin(a) * rad];
    b.addTube([[0, 0.02, 0], [tip[0] * 0.5, tip[1] * 0.55, tip[2] * 0.5], tip], [0.008, 0.006, 0.004], 4, { colorBase: green, colorTip: greenT });
    b.addBlossom({ center: tip, radius: 0.068, petals: 6, tilt: [0.15, a, 0], colorPetal: scarlet, colorCore: C('#221c1e'), cupDepth: 0.03 });
  }
  return b.build();
}

// --- Biome 6: Temperate Deciduous Forest ---
function createDeciduousCoppiceStool() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(601);
  const bark = C('#5d4d3e');
  const moss = C('#5e7c38');
  const leafB = C('#4d7834');
  const leafT = C('#7ea84c');
  b.addBlob({ center: [0, 0.08, 0], radiusX: 0.26, radiusY: 0.12, radiusZ: 0.24, rings: 4, sides: 10, ribAmp: 0.16, colorBase: bark, colorTop: moss });
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + 0.25;
    const mid = [Math.cos(a) * 0.18, 0.45, Math.sin(a) * 0.18];
    const tip = [Math.cos(a) * 0.34, 0.88 + (i % 2) * 0.14, Math.sin(a) * 0.34];
    b.addTube([[Math.cos(a) * 0.08, 0.08, Math.sin(a) * 0.08], mid, tip], [0.048, 0.03, 0.012], 6, { colorBase: moss, colorTip: bark });
    addLeafSpray(b, tip, 7, 0.18, 0.068, leafB, leafT, rng);
  }
  return b.build();
}

function createDeciduousBrambleArch() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(602);
  const cane = C('#6a3c3c');
  const leafB = C('#456a30');
  const leafT = C('#6c9446');
  const berry = C('#261e2c');
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const pts = [];
    for (let s = 0; s <= 4; s += 1) {
      const t = s / 4;
      const dist = t * 0.62;
      pts.push([Math.cos(a) * dist, Math.sin(t * Math.PI) * 0.38 + (1 - t) * 0.04, Math.sin(a) * dist]);
    }
    b.addTube(pts, [0.018, 0.015, 0.013, 0.01, 0.006], 5, { colorBase: cane, colorTip: leafB });
    for (let k = 1; k < 4; k += 1) {
      addLeafSpray(b, pts[k], 4, 0.14, 0.055, leafB, leafT, rng, 0.1);
    }
    b.addBlob({ center: pts[2], radiusX: 0.025, radiusY: 0.028, radiusZ: 0.025, rings: 3, sides: 6, colorBase: berry, colorTop: C('#4a2d4c') });
  }
  return b.build();
}

function createDeciduousRhododendronClump() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(603);
  const bark = C('#5b4a3a');
  const leafB = C('#385a2c');
  const leafT = C('#567e3e');
  const bloom = C('#d478b6');
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const tip = [Math.cos(a) * 0.28, 0.42 + (i % 2) * 0.1, Math.sin(a) * 0.28];
    b.addTube([[0, -0.02, 0], [tip[0] * 0.5, 0.22, tip[2] * 0.5], tip], [0.032, 0.02, 0.012], 5, { colorBase: bark, colorTip: leafB });
    addLeafSpray(b, tip, 7, 0.22, 0.072, leafB, leafT, rng, 0.18);
    b.addBlossom({ center: [tip[0], tip[1] + 0.05, tip[2]], radius: 0.068, petals: 6, colorPetal: bloom, colorCore: C('#edd4eb'), cupDepth: 0.024 });
  }
  return b.build();
}

function createDeciduousFoxgloveSpire() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(604);
  const leafB = C('#456832');
  const leafT = C('#6a924a');
  const magenta = C('#c84e94');
  addLeafSpray(b, [0, 0.02, 0], 8, 0.24, 0.078, leafB, leafT, rng, 0.18);
  for (let s = 0; s < 2; s += 1) {
    const ox = (s - 0.5) * 0.1;
    const h = 0.72 - s * 0.12;
    b.addTube([[ox, 0, 0], [ox * 1.2, h * 0.5, 0.03], [ox * 1.4, h, 0.06]], [0.015, 0.011, 0.006], 5, { colorBase: leafB, colorTip: leafT });
    for (let k = 0; k < 6; k += 1) {
      const f = 0.42 + (k / 5) * 0.5;
      const ba = k * 0.9;
      b.addBlossom({
        center: [ox + Math.cos(ba) * 0.032, h * f, 0.03 + Math.sin(ba) * 0.032],
        radius: 0.036,
        petals: 5,
        tilt: [1.1, ba, 0],
        colorPetal: magenta,
        colorCore: C('#edd8e6'),
        cupDepth: 0.026,
      });
    }
  }
  return b.build();
}

function createDeciduousWoodAnemonePatch() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(605);
  const leafB = C('#4a6e34');
  const leafT = C('#729a4c');
  const white = C('#f4f0e8');
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + rng() * 0.3;
    const d = 0.08 + (i % 2) * 0.09;
    const px = Math.cos(a) * d;
    const pz = Math.sin(a) * d;
    addLeafSpray(b, [px, 0.05, pz], 4, 0.12, 0.048, leafB, leafT, rng, 0.15);
    const h = 0.18 + (i % 2) * 0.05;
    b.addTube([[px, 0, pz], [px * 1.1, h, pz * 1.1]], [0.006, 0.004], 4, { colorBase: leafB, colorTip: leafT });
    b.addBlossom({ center: [px * 1.1, h, pz * 1.1], radius: 0.052, petals: 6, colorPetal: white, colorCore: C('#ead454') });
  }
  return b.build();
}

// --- Biome 13: Road Verge ---
function createRoadMilestoneStump() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(1301);
  const bark = C('#685644');
  const weathered = C('#8b7d6a');
  const nettleB = C('#4a6e34');
  const nettleT = C('#6d9448');
  b.addTube([[0, -0.07, 0], [0, 0.22, 0], [0, 0.48, 0], [0, 0.78, 0]], [0.17, 0.15, 0.14, 0.13], 14, { colorBase: bark, colorTip: weathered, fluteCount: 7, fluteDepth: 0.1 });
  // Iron ring detail + basal verge nettle sprays & root buttresses.
  b.addBlob({ center: [0.14, 0.62, 0], radiusX: 0.025, radiusY: 0.04, radiusZ: 0.04, rings: 3, sides: 6, colorBase: C('#4a4e52'), colorTop: C('#6e7276') });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    b.addTube([[0, 0.08, 0], [Math.cos(a) * 0.3, -0.05, Math.sin(a) * 0.3]], [0.055, 0.018], 6, { colorBase: bark, colorTip: bark });
  }
  addLeafSpray(b, [0.14, 0.02, 0.09], 9, 0.19, 0.06, nettleB, nettleT, rng);
  addLeafSpray(b, [-0.14, 0.02, -0.09], 8, 0.17, 0.055, nettleB, nettleT, rng);
  addLeafSpray(b, [-0.12, 0.02, 0.14], 6, 0.15, 0.05, nettleB, nettleT, rng);
  return b.build();
}

function createRoadChicoryStalk() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(1302);
  const green = C('#4d6e3a');
  const tip = C('#709454');
  const blue = C('#5d8ce6');
  addLeafSpray(b, [0, 0.02, 0], 7, 0.19, 0.055, green, tip, rng, 0.14);
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    const h = 0.42 + (i % 2) * 0.14;
    const tx = Math.cos(a) * 0.14;
    const tz = Math.sin(a) * 0.14;
    b.addTube([[0, 0.02, 0], [tx * 0.5, h * 0.55, tz * 0.5], [tx, h, tz]], [0.009, 0.007, 0.005], 4, { colorBase: green, colorTip: tip });
    b.addBlossom({ center: [tx, h, tz], radius: 0.046, petals: 9, colorPetal: blue, colorCore: C('#b8d2f4') });
    b.addBlossom({ center: [tx * 0.6, h * 0.68, tz * 0.6], radius: 0.036, petals: 8, tilt: [0.6, a, 0], colorPetal: blue, colorCore: C('#b8d2f4') });
  }
  return b.build();
}

function createRoadMulleinSpire() {
  const b = new OrganicMeshBuilder();
  const felt = C('#6a825c');
  const feltT = C('#98ad82');
  const yellow = C('#efd042');
  for (let i = 0; i < 10; i += 1) {
    b.addSculptedLeaf({
      origin: [0, 0.03 + (i % 2) * 0.03, 0],
      yaw: (i / 10) * Math.PI * 2,
      pitch: 0.22 + (i % 3) * 0.14,
      length: 0.24,
      width: 0.095,
      arch: 0.04,
      cup: 0.02,
      segments: 4,
      colorBase: felt,
      colorTip: feltT,
    });
  }
  b.addTube([[0, 0.05, 0], [0, 0.52, 0], [0, 0.96, 0]], [0.028, 0.02, 0.01], 6, { colorBase: felt, colorTip: feltT });
  for (let k = 0; k < 8; k += 1) {
    const a = k * 1.8;
    const y = 0.52 + k * 0.052;
    b.addBlossom({ center: [Math.cos(a) * 0.03, y, Math.sin(a) * 0.03], radius: 0.032, petals: 5, tilt: [1.1, a, 0], colorPetal: yellow, colorCore: C('#d6841c') });
  }
  return b.build();
}

function createRoadPlantainWheel() {
  const b = new OrganicMeshBuilder();
  const leafB = C('#486c32');
  const leafT = C('#6e964a');
  const spike = C('#8a8c58');
  for (let layer = 0; layer < 2; layer += 1) {
    const n = 9 + layer * 3;
    for (let i = 0; i < n; i += 1) {
      b.addSculptedLeaf({
        origin: [0, 0.015 + layer * 0.015, 0],
        yaw: (i / n) * Math.PI * 2 + layer * 0.25,
        pitch: 0.06 + layer * 0.14,
        length: 0.21 - layer * 0.03,
        width: 0.085,
        arch: 0.022,
        cup: 0.018,
        segments: 4,
        colorBase: leafB,
        colorTip: leafT,
      });
    }
  }
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    b.addTube([[0, 0.02, 0], [Math.cos(a) * 0.04, 0.14, Math.sin(a) * 0.04], [Math.cos(a) * 0.07, 0.24, Math.sin(a) * 0.07]], [0.008, 0.011, 0.006], 5, { colorBase: leafT, colorTip: spike });
  }
  return b.build();
}

function createRoadBlackberryHedgerow() {
  return createDeciduousBrambleArch();
}

// --- Biome 14: Farm / Meadow Orchard ---
function createFarmPollardWillowStump() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(1401);
  const bark = C('#6a5844');
  const osier = C('#a48a3e');
  const leafB = C('#557c3a');
  const leafT = C('#7ea654');
  b.addTube([[0, -0.06, 0], [0, 0.36, 0], [0, 0.68, 0]], [0.2, 0.17, 0.24], 10, { colorBase: bark, colorTip: bark, fluteCount: 6, fluteDepth: 0.1 });
  b.addBlob({ center: [0, 0.72, 0], radiusX: 0.26, radiusY: 0.13, radiusZ: 0.24, rings: 4, sides: 10, ribAmp: 0.15, colorBase: bark, colorTop: C('#84725c') });
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    const tip = [Math.cos(a) * 0.3, 1.18 + (i % 2) * 0.14, Math.sin(a) * 0.3];
    b.addTube([[Math.cos(a) * 0.12, 0.76, Math.sin(a) * 0.12], [Math.cos(a) * 0.2, 0.98, Math.sin(a) * 0.2], tip], [0.024, 0.016, 0.008], 5, { colorBase: osier, colorTip: leafT });
    addLeafSpray(b, tip, 5, 0.16, 0.03, leafB, leafT, rng);
  }
  return b.build();
}

function createFarmSunflowerTrio() {
  const b = new OrganicMeshBuilder();
  const stalk = C('#527434');
  const leafT = C('#749a4a');
  const petal = C('#f4bf22');
  const seedCore = C('#38281c');
  const stems = [
    { x: 0, z: 0, h: 1.05, r: 0.14, yaw: 0.2 },
    { x: -0.18, z: 0.12, h: 0.84, r: 0.11, yaw: 0.8 },
    { x: 0.17, z: -0.1, h: 0.76, r: 0.1, yaw: -0.7 },
  ];
  for (const s of stems) {
    b.addTube([[s.x, -0.02, s.z], [s.x * 1.1, s.h * 0.55, s.z * 1.1], [s.x * 1.15, s.h, s.z * 1.15]], [0.024, 0.019, 0.013], 6, { colorBase: stalk, colorTip: leafT });
    for (let k = 0; k < 4; k += 1) {
      b.addSculptedLeaf({
        origin: [s.x, s.h * (0.28 + k * 0.16), s.z],
        yaw: s.yaw + k * 1.6,
        pitch: 0.28,
        length: 0.22,
        width: 0.13,
        arch: 0.06,
        colorBase: stalk,
        colorTip: leafT,
      });
    }
    b.addBlossom({
      center: [s.x * 1.15, s.h, s.z * 1.15],
      radius: s.r,
      petals: 12,
      tilt: [0.65, s.yaw, 0],
      colorPetal: petal,
      colorCore: seedCore,
      cupDepth: 0.015,
    });
  }
  return b.build();
}

function createFarmLavenderMound() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(1403);
  const sageB = C('#567360');
  const sageT = C('#7e9d88');
  const violet = C('#8458c4');
  b.addBlob({ center: [0, 0.14, 0], radiusX: 0.28, radiusY: 0.15, radiusZ: 0.28, rings: 4, sides: 10, ribAmp: 0.1, colorBase: sageB, colorTop: sageT });
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 + rng() * 0.3;
    const rad = 0.08 + (i % 3) * 0.07;
    const sx = Math.cos(a) * rad;
    const sz = Math.sin(a) * rad;
    const h = 0.36 + (i % 2) * 0.09;
    b.addTube([[sx, 0.16, sz], [sx * 1.25, h, sz * 1.25]], [0.008, 0.006], 4, { colorBase: sageT, colorTip: violet });
    b.addFacetedPrism({ base: [sx * 1.25, h - 0.02, sz * 1.25], height: 0.09, radiusX: 0.016, radiusZ: 0.016, sides: 5, tiers: 3, colorBase: violet, colorTip: C('#b48ae6') });
  }
  return b.build();
}

function createFarmCornMaizeSheaf() {
  const b = new OrganicMeshBuilder();
  const stalk = C('#587d38');
  const tassel = C('#cbb058');
  const stalks = [[0, 0, 1.18], [-0.14, 0.1, 1.04], [0.15, -0.08, 1.1], [-0.08, -0.14, 0.96]];
  for (const [sx, sz, h] of stalks) {
    b.addTube([[sx, -0.02, sz], [sx, h * 0.5, sz], [sx, h, sz]], [0.022, 0.017, 0.009], 6, { colorBase: stalk, colorTip: tassel });
    for (let k = 0; k < 5; k += 1) {
      b.addSculptedLeaf({
        origin: [sx, h * (0.2 + k * 0.15), sz],
        yaw: k * 1.7 + sx * 4,
        pitch: 0.42,
        length: 0.34,
        width: 0.055,
        arch: 0.12,
        colorBase: stalk,
        colorTip: C('#84a652'),
      });
    }
    b.addBlob({ center: [sx + 0.03, h * 0.56, sz], radiusX: 0.028, radiusY: 0.068, radiusZ: 0.028, rings: 3, sides: 5, colorBase: C('#a8b468'), colorTop: C('#e0be5a') });
  }
  return b.build();
}

function createFarmCloverHayPatch() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(1405);
  const leaf = C('#4c7634');
  const leafT = C('#74a24e');
  const clover = C('#c65288');
  addLeafSpray(b, [0, 0.03, 0], 14, 0.14, 0.058, leaf, leafT, rng, 0.12);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    const tx = Math.cos(a) * 0.11;
    const tz = Math.sin(a) * 0.11;
    const h = 0.18 + (i % 2) * 0.05;
    b.addTube([[tx * 0.5, 0.02, tz * 0.5], [tx, h, tz]], [0.007, 0.005], 4, { colorBase: leaf, colorTip: leafT });
    b.addBlob({ center: [tx, h + 0.015, tz], radiusX: 0.028, radiusY: 0.026, radiusZ: 0.028, rings: 3, sides: 6, colorBase: clover, colorTop: C('#e68ab4') });
  }
  return b.build();
}

export const TEMPERATE_ROAD_FARM_BIOME_FLORA = Object.freeze([
  // Biome 4: Grassland
  { id: 'grassland_hawthorn_stump', tileIds: [4], paletteTileId: 4, kind: 'trunk', motionProfile: 'woody-shrub', height: 0.85, weight: 0.65, conform: false, barkProfile: 'beech', createGeometry: createGrasslandHawthornStump },
  { id: 'grassland_gorse_thicket', tileIds: [4], paletteTileId: 4, kind: 'blossom', motionProfile: 'woody-shrub', height: 0.52, weight: 1.2, conform: false, createGeometry: createGrasslandGorseThicket },
  { id: 'grassland_yarrow_clump', tileIds: [4], paletteTileId: 4, kind: 'blossom', motionProfile: 'flexible-stem', height: 0.44, weight: 1.4, conform: true, createGeometry: createGrasslandYarrowClump },
  { id: 'grassland_thistle_rosette', tileIds: [4], paletteTileId: 4, kind: 'blossom', motionProfile: 'flexible-stem', height: 0.46, weight: 1.2, conform: true, createGeometry: createGrasslandThistleRosette },
  { id: 'grassland_poppy_tuft', tileIds: [4], paletteTileId: 4, kind: 'blossom', motionProfile: 'flexible-stem', height: 0.42, weight: 1.5, conform: true, createGeometry: createGrasslandPoppyTuft },
  // Biome 6: Temperate Deciduous Forest
  { id: 'deciduous_coppice_stool', tileIds: [6], paletteTileId: 6, kind: 'trunk', motionProfile: 'woody-shrub', height: 0.96, weight: 0.75, conform: false, barkProfile: 'beech', createGeometry: createDeciduousCoppiceStool },
  { id: 'deciduous_bramble_arch', tileIds: [6], paletteTileId: 6, kind: 'understory', motionProfile: 'woody-shrub', height: 0.42, weight: 1.2, conform: false, createGeometry: createDeciduousBrambleArch },
  { id: 'deciduous_rhododendron_clump', tileIds: [6], paletteTileId: 6, kind: 'blossom', motionProfile: 'woody-shrub', height: 0.55, weight: 1.1, conform: false, createGeometry: createDeciduousRhododendronClump },
  { id: 'deciduous_foxglove_spire', tileIds: [6], paletteTileId: 6, kind: 'blossom', motionProfile: 'flexible-stem', height: 0.74, weight: 1.3, conform: false, createGeometry: createDeciduousFoxgloveSpire },
  { id: 'deciduous_wood_anemone_patch', tileIds: [6], paletteTileId: 6, kind: 'blossom', motionProfile: 'grass-tuft', height: 0.24, weight: 1.5, conform: true, createGeometry: createDeciduousWoodAnemonePatch },
  // Biome 13: Road Verge
  { id: 'road_milestone_stump', tileIds: [13], paletteTileId: 13, kind: 'trunk', motionProfile: 'rigid', height: 0.78, weight: 0.55, conform: false, barkProfile: 'beech', createGeometry: createRoadMilestoneStump },
  { id: 'road_chicory_stalk', tileIds: [13], paletteTileId: 13, kind: 'blossom', motionProfile: 'flexible-stem', height: 0.54, weight: 1.4, conform: true, createGeometry: createRoadChicoryStalk },
  { id: 'road_mullein_spire', tileIds: [13], paletteTileId: 13, kind: 'blossom', motionProfile: 'flexible-stem', height: 0.96, weight: 1.1, conform: false, createGeometry: createRoadMulleinSpire },
  { id: 'road_plantain_wheel', tileIds: [13], paletteTileId: 13, kind: 'smallPlant', motionProfile: 'grass-tuft', height: 0.24, weight: 1.6, conform: true, createGeometry: createRoadPlantainWheel },
  { id: 'road_blackberry_hedgerow', tileIds: [13], paletteTileId: 13, kind: 'understory', motionProfile: 'woody-shrub', height: 0.42, weight: 1.1, conform: false, createGeometry: createRoadBlackberryHedgerow },
  // Biome 14: Farm / Orchard Meadow
  { id: 'farm_pollard_willow_stump', tileIds: [14], paletteTileId: 14, kind: 'trunk', motionProfile: 'woody-shrub', height: 1.24, weight: 0.65, conform: false, barkProfile: 'beech', createGeometry: createFarmPollardWillowStump },
  { id: 'farm_sunflower_trio', tileIds: [14], paletteTileId: 14, kind: 'blossom', motionProfile: 'flexible-stem', height: 1.06, weight: 1.2, conform: false, createGeometry: createFarmSunflowerTrio },
  { id: 'farm_lavender_mound', tileIds: [14], paletteTileId: 14, kind: 'blossom', motionProfile: 'woody-shrub', height: 0.46, weight: 1.4, conform: true, createGeometry: createFarmLavenderMound },
  { id: 'farm_corn_maize_sheaf', tileIds: [14], paletteTileId: 14, kind: 'understory', motionProfile: 'flexible-stem', height: 1.18, weight: 1.2, conform: false, createGeometry: createFarmCornMaizeSheaf },
  { id: 'farm_clover_hay_patch', tileIds: [14], paletteTileId: 14, kind: 'blossom', motionProfile: 'grass-tuft', height: 0.24, weight: 1.6, conform: true, createGeometry: createFarmCloverHayPatch },
]);
