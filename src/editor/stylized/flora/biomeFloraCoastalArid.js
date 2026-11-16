import * as THREE from 'three/webgpu';
import { OrganicMeshBuilder, createSeededRng } from './floraMeshPrimitives.js';

const C = (hex) => new THREE.Color(hex);

function addCrownFoliage(b, cx, cy, cz, count, leafColor, tipColor, leafLen, leafW, rng) {
  for (let i = 0; i < count; i += 1) {
    const yaw = (i / count) * Math.PI * 2 + rng() * 0.4;
    b.addSculptedLeaf({
      origin: [cx, cy, cz],
      yaw,
      pitch: 0.25 + rng() * 0.55,
      roll: (rng() - 0.5) * 0.4,
      length: leafLen * (0.85 + rng() * 0.35),
      width: leafW,
      arch: leafLen * 0.22,
      cup: 0.012,
      segments: 4,
      colorBase: leafColor,
      colorTip: tipColor,
    });
  }
}

// --- Biome 0: Marine / Coastal ---
function createCoastalDriftwoodSnag() {
  const b = new OrganicMeshBuilder();
  const silver = C('#b8ae9e');
  const dark = C('#6a6258');
  b.addTube(
    [[-0.08, -0.08, 0.04], [0, 0.28, 0], [0.14, 0.62, -0.06], [0.28, 0.94, 0.08], [0.36, 1.18, 0.14]],
    [0.18, 0.14, 0.11, 0.075, 0.025],
    10,
    { colorBase: dark, colorTip: silver, fluteCount: 5, fluteDepth: 0.14, twist: 2.2, capEnd: true },
  );
  b.addTube(
    [[0.12, 0.58, -0.05], [0.02, 0.78, -0.24], [-0.14, 0.96, -0.34]],
    [0.065, 0.042, 0.014],
    7,
    { colorBase: dark, colorTip: silver, fluteCount: 3, fluteDepth: 0.1 },
  );
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    b.addTube(
      [[0, 0.12, 0], [Math.cos(a) * 0.24, 0.04, Math.sin(a) * 0.24], [Math.cos(a) * 0.48, -0.05, Math.sin(a) * 0.48]],
      [0.07, 0.042, 0.014],
      6,
      { colorBase: dark, colorTip: silver },
    );
  }
  const barnacle = C('#d4cfc2');
  for (let i = 0; i < 6; i += 1) {
    const a = i * 1.05;
    b.addFacetedPrism({
      base: [Math.cos(a) * 0.15, 0.03 + (i % 2) * 0.04, Math.sin(a) * 0.15],
      height: 0.035,
      radiusX: 0.025,
      radiusZ: 0.025,
      sides: 5,
      tiers: 2,
      taper: 0.5,
      colorBase: dark,
      colorTip: barnacle,
    });
  }
  return b.build();
}

function createCoastalSeaBuckthorn() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(101);
  const bark = C('#685645');
  const barkTip = C('#847463');
  const leafBase = C('#5d7d5e');
  const leafTip = C('#84a682');
  const berry = C('#ea7b22');
  for (let br = 0; br < 5; br += 1) {
    const a = (br / 5) * Math.PI * 2 + rng() * 0.3;
    const mid = [Math.cos(a) * 0.2, 0.26 + rng() * 0.1, Math.sin(a) * 0.2];
    const tip = [Math.cos(a + 0.2) * 0.42, 0.48 + rng() * 0.16, Math.sin(a + 0.2) * 0.42];
    b.addTube([[0, -0.03, 0], mid, tip], [0.038, 0.024, 0.011], 6, { colorBase: bark, colorTip: barkTip });
    addCrownFoliage(b, tip[0], tip[1], tip[2], 7, leafBase, leafTip, 0.17, 0.035, rng);
    addCrownFoliage(b, mid[0], mid[1], mid[2], 5, leafBase, leafTip, 0.15, 0.032, rng);
    for (let k = 0; k < 4; k += 1) {
      b.addBlob({
        center: [mid[0] + (rng() - 0.5) * 0.07, mid[1] + 0.02 + rng() * 0.04, mid[2] + (rng() - 0.5) * 0.07],
        radiusX: 0.02,
        radiusY: 0.022,
        radiusZ: 0.02,
        rings: 3,
        sides: 5,
        ribAmp: 0,
        colorBase: berry,
        colorTop: C('#ff9f44'),
      });
    }
  }
  return b.build();
}

function createCoastalSeaHolly() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(102);
  const leafB = C('#4c6e68');
  const leafT = C('#749ea2');
  const head = C('#5d7cc0');
  const core = C('#a8b8ea');
  addCrownFoliage(b, 0, 0.02, 0, 8, leafB, leafT, 0.24, 0.085, rng);
  for (let s = 0; s < 5; s += 1) {
    const a = (s / 5) * Math.PI * 2 + 0.2;
    const rx = Math.cos(a) * (0.06 + (s % 2) * 0.06);
    const rz = Math.sin(a) * (0.06 + (s % 2) * 0.06);
    const h = s === 0 ? 0.44 : 0.28 + (s % 2) * 0.08;
    b.addTube([[0, 0, 0], [rx * 0.5, h * 0.55, rz * 0.5], [rx, h, rz]], [0.015, 0.011, 0.008], 5, {
      colorBase: leafB,
      colorTip: head,
    });
    b.addBlossom({
      center: [rx, h, rz],
      radius: 0.075,
      petals: 7,
      tilt: [(rng() - 0.5) * 0.25, a, (rng() - 0.5) * 0.25],
      colorPetal: leafT,
      colorCore: core,
      cupDepth: -0.012,
    });
    b.addBlob({
      center: [rx, h + 0.022, rz],
      radiusX: 0.024,
      radiusY: 0.032,
      radiusZ: 0.024,
      rings: 4,
      sides: 6,
      ribAmp: 0.14,
      colorBase: head,
      colorTop: core,
    });
  }
  return b.build();
}

function createCoastalBeachPeaTangle() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(103);
  const stem = C('#5b7c3c');
  const leaf = C('#6a9145');
  const leafTip = C('#8bb25e');
  const petal = C('#b84e88');
  for (let r = 0; r < 6; r += 1) {
    const a = (r / 6) * Math.PI * 2 + rng() * 0.3;
    const pts = [];
    for (let k = 0; k < 4; k += 1) {
      const dist = 0.05 + k * 0.12;
      pts.push([Math.cos(a + k * 0.12) * dist, 0.025 + Math.sin(k * 0.8) * 0.02, Math.sin(a + k * 0.12) * dist]);
    }
    b.addTube(pts, [0.012, 0.01, 0.008, 0.005], 5, { colorBase: stem, colorTip: leaf });
    for (let p = 1; p < pts.length; p += 1) {
      for (const side of [-1, 1]) {
        b.addSculptedLeaf({
          origin: pts[p],
          yaw: a + side * 1.1,
          pitch: 0.18 + rng() * 0.25,
          length: 0.085,
          width: 0.048,
          arch: 0.015,
          segments: 3,
          colorBase: leaf,
          colorTip: leafTip,
        });
      }
    }
    if (r % 2 === 0) {
      const end = pts[2];
      b.addBlossom({
        center: [end[0], end[1] + 0.055, end[2]],
        radius: 0.048,
        petals: 5,
        tilt: [0.3, a, 0],
        colorPetal: petal,
        colorCore: C('#e5c0db'),
        cupDepth: 0.016,
      });
    }
  }
  return b.build();
}

function createCoastalSamphireTuft() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(104);
  const green = C('#5d8850');
  const redTip = C('#b85948');
  for (let s = 0; s < 10; s += 1) {
    const a = (s / 10) * Math.PI * 2 + rng() * 0.4;
    const rad = 0.03 + rng() * 0.12;
    const h = 0.16 + rng() * 0.15;
    const tipColor = s % 3 === 0 ? redTip : C('#7ca560');
    const pts = [
      [Math.cos(a) * rad * 0.3, -0.02, Math.sin(a) * rad * 0.3],
      [Math.cos(a) * rad * 0.7, h * 0.45, Math.sin(a) * rad * 0.7],
      [Math.cos(a) * rad, h, Math.sin(a) * rad],
    ];
    b.addTube(pts, [0.018, 0.015, 0.011], 6, { colorBase: green, colorTip: tipColor });
    b.addTube(
      [pts[1], [pts[1][0] + Math.cos(a + 0.8) * 0.06, h * 0.78, pts[1][2] + Math.sin(a + 0.8) * 0.06]],
      [0.012, 0.008],
      5,
      { colorBase: green, colorTip: tipColor },
    );
  }
  return b.build();
}

// --- Biome 1: Hot Desert ---
function createDesertPetrifiedTrunk() {
  const b = new OrganicMeshBuilder();
  const core = C('#a87c5a');
  const outer = C('#c7b194');
  b.addTube(
    [[0, -0.08, 0], [0.03, 0.14, -0.01], [0.05, 0.36, -0.03], [-0.03, 0.62, 0.04], [-0.1, 0.84, 0.07], [-0.16, 1.02, 0.09]],
    [0.22, 0.18, 0.15, 0.12, 0.085, 0.042],
    14,
    { colorBase: core, colorTip: outer, fluteCount: 8, fluteDepth: 0.16, twist: 2.2 },
  );
  b.addTube(
    [[-0.02, 0.56, 0.04], [0.1, 0.68, -0.06], [0.22, 0.82, -0.15], [0.32, 0.94, -0.22]],
    [0.078, 0.056, 0.038, 0.014],
    8,
    { colorBase: core, colorTip: outer, fluteCount: 4, fluteDepth: 0.1 },
  );
  b.addTube(
    [[0.02, 0.4, -0.02], [-0.14, 0.54, 0.14], [-0.26, 0.66, 0.22]],
    [0.062, 0.04, 0.014],
    7,
    { colorBase: core, colorTip: outer },
  );
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    b.addTube(
      [[0, 0.1, 0], [Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2], [Math.cos(a) * 0.42, -0.06, Math.sin(a) * 0.42]],
      [0.068, 0.042, 0.016],
      6,
      { colorBase: core, colorTip: outer },
    );
    b.addBlob({
      center: [Math.cos(a + 0.3) * 0.25, -0.02, Math.sin(a + 0.3) * 0.25],
      radiusX: 0.14,
      radiusY: 0.06,
      radiusZ: 0.12,
      rings: 4,
      sides: 7,
      ribAmp: 0.12,
      colorBase: outer,
      colorTop: C('#d7c4a0'),
    });
  }
  return b.build();
}

function createDesertPricklyPear() {
  const b = new OrganicMeshBuilder();
  const pad = C('#5d8242');
  const rim = C('#7aa156');
  const bloom = C('#ea9030');
  const pads = [
    { pos: [0, 0.1, 0], tilt: [0.08, 0.2, 0.12], rx: 0.13, ry: 0.16, rz: 0.04 },
    { pos: [-0.12, 0.34, 0.02], tilt: [-0.1, 0.7, 0.35], rx: 0.12, ry: 0.14, rz: 0.036 },
    { pos: [0.13, 0.32, -0.03], tilt: [0.15, -0.5, -0.32], rx: 0.11, ry: 0.13, rz: 0.035 },
    { pos: [-0.18, 0.55, 0.06], tilt: [0.12, 1.1, 0.22], rx: 0.095, ry: 0.11, rz: 0.03 },
    { pos: [0.18, 0.52, -0.05], tilt: [-0.1, -0.8, -0.18], rx: 0.09, ry: 0.105, rz: 0.03 },
    { pos: [0.02, 0.25, 0.11], tilt: [0.35, 0.1, -0.1], rx: 0.1, ry: 0.12, rz: 0.034 },
  ];
  for (const p of pads) {
    const start = b.positions.length / 3;
    b.addBlob({
      center: [0, 0, 0],
      radiusX: p.rx,
      radiusY: p.ry,
      radiusZ: p.rz,
      rings: 5,
      sides: 10,
      ribAmp: 0.07,
      colorBase: pad,
      colorTop: rim,
    });
    const euler = new THREE.Euler(...p.tilt);
    const vec = new THREE.Vector3();
    for (let i = start * 3; i < b.positions.length; i += 3) {
      vec.set(b.positions[i], b.positions[i + 1], b.positions[i + 2]).applyEuler(euler);
      b.positions[i] = p.pos[0] + vec.x;
      b.positions[i + 1] = p.pos[1] + vec.y;
      b.positions[i + 2] = p.pos[2] + vec.z;
    }
  }
  b.addBlossom({ center: [-0.19, 0.67, 0.06], radius: 0.052, petals: 8, colorPetal: bloom, colorCore: C('#d83a2c') });
  b.addBlossom({ center: [0.19, 0.64, -0.05], radius: 0.048, petals: 8, colorPetal: C('#f4b432'), colorCore: C('#c84426') });
  return b.build();
}

function createDesertBarrelCactusCluster() {
  const b = new OrganicMeshBuilder();
  const base = C('#4c6f3a');
  const ridge = C('#779954');
  const yellow = C('#ecc034');
  const barrels = [
    { c: [0, 0.16, 0], rx: 0.2, ry: 0.22 },
    { c: [-0.21, 0.1, 0.12], rx: 0.12, ry: 0.14 },
    { c: [0.19, 0.11, -0.11], rx: 0.13, ry: 0.15 },
  ];
  for (const k of barrels) {
    b.addBlob({
      center: k.c,
      radiusX: k.rx,
      radiusY: k.ry,
      radiusZ: k.rx,
      rings: 6,
      sides: 14,
      ribAmp: 0.16,
      ribFreq: 7,
      colorBase: base,
      colorTop: ridge,
    });
  }
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    b.addBlossom({
      center: [Math.cos(a) * 0.06, 0.37, Math.sin(a) * 0.06],
      radius: 0.036,
      petals: 6,
      colorPetal: yellow,
      colorCore: C('#d86026'),
      cupDepth: 0.015,
    });
  }
  return b.build();
}

function createDesertJoshuaAgave() {
  const b = new OrganicMeshBuilder();
  const bladeB = C('#536f5e');
  const bladeT = C('#849e8a');
  const stalk = C('#847448');
  for (let layer = 0; layer < 3; layer += 1) {
    const n = 7 + layer * 2;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + layer * 0.37;
      b.addSculptedLeaf({
        origin: [0, 0.06 + layer * 0.05, 0],
        yaw: a,
        pitch: 0.18 + layer * 0.36,
        length: 0.44 - layer * 0.06,
        width: 0.075,
        arch: -0.02,
        cup: 0.02,
        segments: 4,
        serration: 0.14,
        colorBase: bladeB,
        colorTip: bladeT,
      });
    }
  }
  b.addTube([[0, 0.15, 0], [0, 0.65, 0], [0, 1.02, 0]], [0.036, 0.026, 0.014], 7, { colorBase: stalk, colorTip: C('#d6c076') });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    b.addBlossom({
      center: [Math.cos(a) * 0.04, 0.9 + i * 0.03, Math.sin(a) * 0.04],
      radius: 0.045,
      petals: 6,
      colorPetal: C('#ebe2c2'),
      colorCore: C('#bfa84e'),
    });
  }
  return b.build();
}

function createDesertCreosoteScrub() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(105);
  const dark = C('#4a3b30');
  const leaf = C('#5a6b38');
  const tip = C('#7f8f4d');
  for (let s = 0; s < 6; s += 1) {
    const a = (s / 6) * Math.PI * 2 + rng() * 0.3;
    const p1 = [Math.cos(a) * 0.14, 0.24, Math.sin(a) * 0.14];
    const p2 = [Math.cos(a - 0.2) * 0.32, 0.56 + rng() * 0.14, Math.sin(a - 0.2) * 0.32];
    b.addTube([[0, -0.03, 0], p1, p2], [0.026, 0.017, 0.008], 5, { colorBase: dark, colorTip: C('#6e5c48') });
    addCrownFoliage(b, p2[0], p2[1], p2[2], 6, leaf, tip, 0.12, 0.032, rng);
    addCrownFoliage(b, p1[0], p1[1], p1[2], 4, leaf, tip, 0.1, 0.028, rng);
    b.addBlossom({ center: p2, radius: 0.032, petals: 5, colorPetal: C('#e6bc32'), colorCore: C('#a87226') });
  }
  return b.build();
}

// --- Biome 2: Cold Desert / Steppe ---
function createSteppeTwistedJuniperSnag() {
  const b = new OrganicMeshBuilder();
  const grey = C('#9c8e7e');
  const heart = C('#b8895a');
  b.addTube(
    [[0, -0.07, 0], [-0.05, 0.16, 0.03], [-0.08, 0.34, 0.06], [0.06, 0.56, 0.12], [-0.05, 0.76, 0.04], [-0.16, 0.94, -0.06], [-0.25, 1.08, -0.1]],
    [0.17, 0.14, 0.12, 0.098, 0.078, 0.052, 0.016],
    14,
    { colorBase: grey, colorTip: heart, fluteCount: 7, fluteDepth: 0.2, twist: 5.5 },
  );
  b.addTube(
    [[0.04, 0.52, 0.08], [0.16, 0.62, 0.16], [0.28, 0.69, 0.23], [0.4, 0.74, 0.29]],
    [0.068, 0.048, 0.03, 0.012],
    8,
    { colorBase: grey, colorTip: heart, fluteCount: 4, twist: 3.2 },
  );
  b.addTube(
    [[-0.04, 0.68, 0.04], [-0.2, 0.78, -0.16], [-0.32, 0.84, -0.24]],
    [0.046, 0.028, 0.01],
    7,
    { colorBase: grey, colorTip: heart, twist: 2.4 },
  );
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    b.addTube(
      [[0, 0.08, 0], [Math.cos(a) * 0.2, 0.01, Math.sin(a) * 0.2], [Math.cos(a) * 0.4, -0.05, Math.sin(a) * 0.4]],
      [0.064, 0.038, 0.014],
      7,
      { colorBase: grey, colorTip: grey, fluteCount: 3, fluteDepth: 0.1 },
    );
  }
  return b.build();
}

function createSteppeBigSagebrush() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(201);
  const bark = C('#6a6058');
  const silverB = C('#6c7f72');
  const silverT = C('#9aaea0');
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + rng() * 0.3;
    const p1 = [Math.cos(a) * 0.14, 0.2, Math.sin(a) * 0.14];
    const p2 = [Math.cos(a) * 0.28, 0.44 + rng() * 0.1, Math.sin(a) * 0.28];
    b.addTube([[0, -0.03, 0], p1, p2], [0.034, 0.022, 0.011], 6, { colorBase: bark, colorTip: silverB, fluteCount: 4, fluteDepth: 0.1 });
    addCrownFoliage(b, p2[0], p2[1], p2[2], 8, silverB, silverT, 0.14, 0.042, rng);
  }
  addCrownFoliage(b, 0, 0.38, 0, 8, silverB, silverT, 0.15, 0.045, rng);
  return b.build();
}

function createSteppeCushionBuckwheat() {
  const b = new OrganicMeshBuilder();
  const matB = C('#5d6e4a');
  const matT = C('#84946e');
  const gold = C('#e4be36');
  const tufts = [
    [0, 0.06, 0, 0.24, 0.11],
    [-0.14, 0.04, 0.08, 0.15, 0.08],
    [0.14, 0.04, -0.06, 0.14, 0.08],
  ];
  for (const [cx, cy, cz, rx, ry] of tufts) {
    b.addBlob({ center: [cx, cy, cz], radiusX: rx, radiusY: ry, radiusZ: rx, rings: 4, sides: 9, ribAmp: 0.12, colorBase: matB, colorTop: matT });
  }
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const d = 0.06 + (i % 2) * 0.09;
    const sx = Math.cos(a) * d;
    const sz = Math.sin(a) * d;
    const h = 0.22 + (i % 3) * 0.04;
    b.addTube([[sx, 0.1, sz], [sx * 1.15, h, sz * 1.15]], [0.009, 0.006], 4, { colorBase: matT, colorTip: C('#9a7e48') });
    b.addBlossom({ center: [sx * 1.15, h, sz * 1.15], radius: 0.038, petals: 6, colorPetal: gold, colorCore: C('#d87424') });
  }
  return b.build();
}

function createSteppeEphedraJointfir() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(203);
  const woody = C('#5a4b3d');
  const stem = C('#627f44');
  const tip = C('#89a45c');
  b.addBlob({ center: [0, 0.04, 0], radiusX: 0.13, radiusY: 0.07, radiusZ: 0.13, rings: 4, sides: 8, ribAmp: 0.14, colorBase: woody, colorTop: woody });
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2 + rng() * 0.2;
    const spread = 0.12 + rng() * 0.22;
    const h = 0.34 + rng() * 0.24;
    const mid = [Math.cos(a) * spread * 0.5, h * 0.55, Math.sin(a) * spread * 0.5];
    const end = [Math.cos(a) * spread, h, Math.sin(a) * spread];
    b.addTube([[0, 0.04, 0], mid, end], [0.015, 0.011, 0.006], 5, { colorBase: stem, colorTip: tip });
    if (i % 2 === 0) {
      b.addTube(
        [mid, [mid[0] + Math.cos(a + 0.6) * 0.08, h * 0.85, mid[2] + Math.sin(a + 0.6) * 0.08]],
        [0.009, 0.004],
        4,
        { colorBase: stem, colorTip: tip },
      );
    }
  }
  return b.build();
}

function createSteppeRabbitbrushClump() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(204);
  const base = C('#687450');
  const sage = C('#8ca072');
  const plume = C('#ebb428');
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 + rng() * 0.2;
    const p1 = [Math.cos(a) * 0.12, 0.22, Math.sin(a) * 0.12];
    const p2 = [Math.cos(a) * 0.24, 0.48 + rng() * 0.1, Math.sin(a) * 0.24];
    b.addTube([[0, -0.02, 0], p1, p2], [0.022, 0.014, 0.008], 5, { colorBase: base, colorTip: sage });
    addCrownFoliage(b, p1[0], p1[1], p1[2], 5, base, sage, 0.13, 0.022, rng);
    b.addBlossom({ center: p2, radius: 0.055, petals: 7, colorPetal: plume, colorCore: C('#d48418'), cupDepth: 0.015 });
  }
  return b.build();
}

export const COASTAL_ARID_BIOME_FLORA = Object.freeze([
  // Biome 0: Marine / Coastal
  { id: 'coastal_driftwood_snag', tileIds: [0], paletteTileId: 0, kind: 'trunk', motionProfile: 'rigid', height: 1.18, weight: 0.7, conform: false, barkProfile: 'beech', createGeometry: createCoastalDriftwoodSnag },
  { id: 'coastal_sea_buckthorn', tileIds: [0], paletteTileId: 0, kind: 'understory', motionProfile: 'woody-shrub', height: 0.6, weight: 1.1, conform: false, createGeometry: createCoastalSeaBuckthorn },
  { id: 'coastal_sea_holly', tileIds: [0], paletteTileId: 0, kind: 'blossom', motionProfile: 'flexible-stem', height: 0.45, weight: 1.3, conform: true, createGeometry: createCoastalSeaHolly },
  { id: 'coastal_beach_pea_tangle', tileIds: [0], paletteTileId: 0, kind: 'blossom', motionProfile: 'grass-tuft', height: 0.15, weight: 1.4, conform: true, createGeometry: createCoastalBeachPeaTangle },
  { id: 'coastal_samphire_tuft', tileIds: [0], paletteTileId: 0, kind: 'smallPlant', motionProfile: 'grass-tuft', height: 0.3, weight: 1.5, conform: true, createGeometry: createCoastalSamphireTuft },
  // Biome 1: Hot Desert
  { id: 'desert_petrified_trunk', tileIds: [1], paletteTileId: 1, kind: 'trunk', motionProfile: 'rigid', height: 0.96, weight: 0.6, conform: false, barkProfile: 'beech', createGeometry: createDesertPetrifiedTrunk },
  { id: 'desert_prickly_pear', tileIds: [1], paletteTileId: 1, kind: 'understory', motionProfile: 'rigid', height: 0.68, weight: 1.2, conform: false, createGeometry: createDesertPricklyPear },
  { id: 'desert_barrel_cactus_cluster', tileIds: [1], paletteTileId: 1, kind: 'smallPlant', motionProfile: 'rigid', height: 0.42, weight: 1.3, conform: true, createGeometry: createDesertBarrelCactusCluster },
  { id: 'desert_joshua_agave', tileIds: [1], paletteTileId: 1, kind: 'understory', motionProfile: 'rigid', height: 1.02, weight: 1.0, conform: false, createGeometry: createDesertJoshuaAgave },
  { id: 'desert_creosote_scrub', tileIds: [1], paletteTileId: 1, kind: 'understory', motionProfile: 'woody-shrub', height: 0.64, weight: 1.3, conform: false, createGeometry: createDesertCreosoteScrub },
  // Biome 2: Cold Desert / Steppe
  { id: 'steppe_twisted_juniper_snag', tileIds: [2], paletteTileId: 2, kind: 'trunk', motionProfile: 'rigid', height: 1.06, weight: 0.6, conform: false, barkProfile: 'spruce', createGeometry: createSteppeTwistedJuniperSnag },
  { id: 'steppe_big_sagebrush', tileIds: [2], paletteTileId: 2, kind: 'understory', motionProfile: 'woody-shrub', height: 0.52, weight: 1.4, conform: false, createGeometry: createSteppeBigSagebrush },
  { id: 'steppe_cushion_buckwheat', tileIds: [2], paletteTileId: 2, kind: 'blossom', motionProfile: 'grass-tuft', height: 0.28, weight: 1.4, conform: true, createGeometry: createSteppeCushionBuckwheat },
  { id: 'steppe_ephedra_jointfir', tileIds: [2], paletteTileId: 2, kind: 'understory', motionProfile: 'flexible-stem', height: 0.54, weight: 1.2, conform: false, createGeometry: createSteppeEphedraJointfir },
  { id: 'steppe_rabbitbrush_clump', tileIds: [2], paletteTileId: 2, kind: 'blossom', motionProfile: 'woody-shrub', height: 0.56, weight: 1.3, conform: false, createGeometry: createSteppeRabbitbrushClump },
]);
