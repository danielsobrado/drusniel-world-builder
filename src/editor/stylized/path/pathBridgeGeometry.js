import * as THREE from 'three/webgpu';
import { bridgeDeckElevationAtT } from './pathBridgeField.js';

const STONE_BASE = [0.43, 0.41, 0.39];
const STONE_CAP = [0.50, 0.48, 0.45];
const TIMBER_STRINGER = [0.24, 0.17, 0.12];
const TIMBER_POST = [0.30, 0.21, 0.15];
const TIMBER_RAIL = [0.39, 0.29, 0.20];
const PLANK_WARM = [0.45, 0.34, 0.23];
const PLANK_COOL = [0.38, 0.31, 0.24];

function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

class BridgeMeshBuilder {
  constructor(anchorX = 0, anchorZ = 0) {
    this.anchorX = anchorX;
    this.anchorZ = anchorZ;
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
  }

  pushQuad(a, b, c, d, rgb, waterSurface) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    const shade = 0.88 + 0.12 * Math.max(0, ny);
    const baseIndex = this.positions.length / 3;
    const verts = [a, b, c, d];
    for (const p of verts) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      const wet = Number.isFinite(waterSurface) && p[1] < waterSurface + 0.28
        ? clamp01((waterSurface + 0.28 - p[1]) / 0.55)
        : 0;
      const damp = 1 - wet * 0.44;
      this.colors.push(
        rgb[0] * shade * damp * (1 - wet * 0.08),
        rgb[1] * shade * damp * (1 + wet * 0.04),
        rgb[2] * shade * damp * (1 - wet * 0.06),
      );
    }
    this.indices.push(
      baseIndex, baseIndex + 1, baseIndex + 2,
      baseIndex, baseIndex + 2, baseIndex + 3,
    );
  }

  /**
   * Emits a right-handed hexahedron given 8 corners:
   * `b00`=(u0,y0,w0), `b10`=(u1,y0,w0), `b11`=(u1,y0,w1), `b01`=(u0,y0,w1),
   * and matching `t00, t10, t11, t01` at the top face.
   */
  pushHex(b00, b10, b11, b01, t00, t10, t11, t01, rgb, waterSurface) {
    this.pushQuad(t00, t01, t11, t10, rgb, waterSurface); // +v top
    this.pushQuad(b00, b10, b11, b01, rgb, waterSurface); // -v bottom
    this.pushQuad(b10, t10, t11, b11, rgb, waterSurface); // +u front
    this.pushQuad(b01, t01, t00, b00, rgb, waterSurface); // -u back
    this.pushQuad(b01, b11, t11, t01, rgb, waterSurface); // +w right
    this.pushQuad(b00, t00, t10, b10, rgb, waterSurface); // -w left
  }

  toWorld(bridge, along, y, lateral) {
    return [
      (bridge.startX - this.anchorX) + bridge.dirX * along + bridge.perpX * lateral,
      y,
      (bridge.startZ - this.anchorZ) + bridge.dirZ * along + bridge.perpZ * lateral,
    ];
  }

  addBeamSegment(bridge, a0, y0Bot, y0Top, w0, w1, a1, y1Bot, y1Top, w2, w3, rgb) {
    const b00 = this.toWorld(bridge, a0, y0Bot, w0);
    const b10 = this.toWorld(bridge, a1, y1Bot, w2);
    const b11 = this.toWorld(bridge, a1, y1Bot, w3);
    const b01 = this.toWorld(bridge, a0, y0Bot, w1);
    const t00 = this.toWorld(bridge, a0, y0Top, w0);
    const t10 = this.toWorld(bridge, a1, y1Top, w2);
    const t11 = this.toWorld(bridge, a1, y1Top, w3);
    const t01 = this.toWorld(bridge, a0, y0Top, w1);
    this.pushHex(b00, b10, b11, b01, t00, t10, t11, t01, rgb, bridge.waterSurface);
  }

  addBox(bridge, alongCenter, halfLen, yBot, yTop, latCenter, halfLat, rgb) {
    this.addBeamSegment(
      bridge,
      alongCenter - halfLen, yBot, yTop, latCenter - halfLat, latCenter + halfLat,
      alongCenter + halfLen, yBot, yTop, latCenter - halfLat, latCenter + halfLat,
      rgb,
    );
  }

  build() {
    if (!this.indices.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function addStoneAbutments(builder, bridge) {
  const hw = bridge.halfWidth;
  const ends = [
    { a0: 0.0, a1: 0.72, thresholdOut: -0.04, thresholdIn: 0.42, baseY: bridge.groundA },
    { a0: bridge.length - 0.72, a1: bridge.length, thresholdOut: bridge.length + 0.04, thresholdIn: bridge.length - 0.42, baseY: bridge.groundB },
  ];

  for (let idx = 0; idx < 2; idx += 1) {
    const end = ends[idx];
    const tInner = idx === 0 ? end.a1 / bridge.length : end.a0 / bridge.length;
    const tOuter = idx === 0 ? end.a0 / bridge.length : end.a1 / bridge.length;
    const deckInner = bridgeDeckElevationAtT(bridge, tInner);
    const deckOuter = bridgeDeckElevationAtT(bridge, tOuter);
    const footY = Math.min(end.baseY, bridge.bedY) - 1.1;

    // Main stone pier block under end deck
    builder.addBeamSegment(
      bridge,
      end.a0, footY, deckInner - 0.06, -(hw + 0.26), hw + 0.26,
      end.a1, footY, deckInner - 0.06, -(hw + 0.26), hw + 0.26,
      STONE_BASE,
    );

    // Flared approach wingwalls framing the entry onto the deck
    for (const side of [-1, 1]) {
      const innerLat0 = side * (hw + 0.06);
      const innerLat1 = side * (hw + 0.36);
      const outerLat0 = side * (hw + 0.14);
      const outerLat1 = side * (hw + 0.48);
      const w0 = Math.min(innerLat0, innerLat1);
      const w1 = Math.max(innerLat0, innerLat1);
      const w2 = Math.min(outerLat0, outerLat1);
      const w3 = Math.max(outerLat0, outerLat1);
      if (idx === 0) {
        builder.addBeamSegment(
          bridge,
          -0.28, footY, deckOuter + 0.28, w2, w3,
          0.62, footY, deckInner + 0.14, w0, w1,
          STONE_CAP,
        );
      } else {
        builder.addBeamSegment(
          bridge,
          bridge.length - 0.62, footY, deckInner + 0.14, w0, w1,
          bridge.length + 0.28, footY, deckOuter + 0.28, w2, w3,
          STONE_CAP,
        );
      }
    }

    // Sloped stone threshold slab bridging earth soil onto timber planks
    const apronMinA = Math.min(end.thresholdOut, end.thresholdIn);
    const apronMaxA = Math.max(end.thresholdOut, end.thresholdIn);
    const yAtMinA = idx === 0 ? end.baseY - 0.05 : deckInner;
    const yAtMaxA = idx === 0 ? deckInner : end.baseY - 0.05;
    builder.addBeamSegment(
      bridge,
      apronMinA, yAtMinA - 0.14, yAtMinA + 0.01, -(hw + 0.06), hw + 0.06,
      apronMaxA, yAtMaxA - 0.14, yAtMaxA + 0.01, -(hw + 0.06), hw + 0.06,
      STONE_CAP,
    );
  }
}

function addArchedStringers(builder, bridge) {
  const hw = bridge.halfWidth;
  const segCount = Math.max(8, Math.ceil(bridge.length / 1.5));
  const latOffsets = hw >= 1.6
    ? [-(hw - 0.09), -(hw * 0.42), hw * 0.42, hw - 0.09]
    : [-(hw - 0.09), 0, hw - 0.09];
  const beamHalfWidth = 0.09;
  const beamDepth = 0.22;

  for (let i = 0; i < segCount; i += 1) {
    const t0 = 0.02 + (0.96 * i) / segCount;
    const t1 = 0.02 + (0.96 * (i + 1)) / segCount;
    const a0 = t0 * bridge.length;
    const a1 = t1 * bridge.length;
    const y0 = bridgeDeckElevationAtT(bridge, t0) - 0.06;
    const y1 = bridgeDeckElevationAtT(bridge, t1) - 0.06;

    for (const lat of latOffsets) {
      builder.addBeamSegment(
        bridge,
        a0, y0 - beamDepth, y0, lat - beamHalfWidth, lat + beamHalfWidth,
        a1, y1 - beamDepth, y1, lat - beamHalfWidth, lat + beamHalfWidth,
        TIMBER_STRINGER,
      );
    }
  }
}

function addDeckPlanksAndCurbs(builder, bridge, seed) {
  const hw = bridge.halfWidth;
  const pitch = 0.36;
  const plankHalfLen = 0.155;
  const startAlong = 0.48;
  const endAlong = bridge.length - 0.48;
  const count = Math.max(2, Math.floor((endAlong - startAlong) / pitch) + 1);

  for (let i = 0; i < count; i += 1) {
    const along = startAlong + ((endAlong - startAlong) * i) / Math.max(1, count - 1);
    const t = along / bridge.length;
    const h = hash1(seed + i * 3.17);
    const topY = bridgeDeckElevationAtT(bridge, t) + (h - 0.5) * 0.014;
    const botY = topY - 0.072;
    const latExtend = hw + (h - 0.5) * 0.04;
    const baseTint = h > 0.45 ? PLANK_WARM : PLANK_COOL;
    const tint = [
      baseTint[0] * (0.94 + h * 0.12),
      baseTint[1] * (0.94 + h * 0.12),
      baseTint[2] * (0.94 + h * 0.12),
    ];
    builder.addBox(bridge, along, plankHalfLen, botY, topY, 0, latExtend, tint);
  }

  // Wheel-guard curbs along both deck sides
  const segCount = Math.max(8, Math.ceil(bridge.length / 1.6));
  const curbHalf = 0.065;
  for (let i = 0; i < segCount; i += 1) {
    const t0 = (startAlong / bridge.length) + ((endAlong - startAlong) / bridge.length) * (i / segCount);
    const t1 = (startAlong / bridge.length) + ((endAlong - startAlong) / bridge.length) * ((i + 1) / segCount);
    const a0 = t0 * bridge.length;
    const a1 = t1 * bridge.length;
    const y0 = bridgeDeckElevationAtT(bridge, t0);
    const y1 = bridgeDeckElevationAtT(bridge, t1);
    for (const side of [-1, 1]) {
      const lat = side * (hw - 0.06);
      builder.addBeamSegment(
        bridge,
        a0, y0 - 0.01, y0 + 0.085, lat - curbHalf, lat + curbHalf,
        a1, y1 - 0.01, y1 + 0.085, lat - curbHalf, lat + curbHalf,
        TIMBER_POST,
      );
    }
  }
}

function addTrestlePiers(builder, bridge) {
  if (!bridge.piers?.length) return;
  const hw = bridge.halfWidth;
  const pileLats = hw >= 1.6 ? [-(hw - 0.14), 0, hw - 0.14] : [-(hw - 0.14), hw - 0.14];

  for (const pier of bridge.piers) {
    const along = pier.t * bridge.length;
    const deckY = bridgeDeckElevationAtT(bridge, pier.t);
    const capTop = deckY - 0.18;
    const capBot = capTop - 0.18;
    const footY = pier.bedY - 0.9;

    // Transverse pile cap
    builder.addBox(bridge, along, 0.14, capBot, capTop, 0, hw + 0.18, TIMBER_STRINGER);

    // Driven vertical pilings
    for (const lat of pileLats) {
      builder.addBox(bridge, along, 0.11, footY, capTop, lat, 0.11, TIMBER_STRINGER);
    }

    // Diagonal sway X-bracing between outer pilings above waterline
    const braceLow = Math.min(pier.waterY + 0.08, capBot - 0.65);
    const braceHigh = capBot - 0.04;
    if (braceHigh - braceLow > 0.35) {
      const leftW = pileLats[0];
      const rightW = pileLats[pileLats.length - 1];
      builder.addBeamSegment(
        bridge,
        along - 0.035, braceLow, braceLow + 0.11, leftW - 0.05, leftW + 0.05,
        along + 0.035, braceHigh - 0.11, braceHigh, rightW - 0.05, rightW + 0.05,
        TIMBER_POST,
      );
      builder.addBeamSegment(
        bridge,
        along - 0.035, braceHigh - 0.11, braceHigh, leftW - 0.05, leftW + 0.05,
        along + 0.035, braceLow, braceLow + 0.11, rightW - 0.05, rightW + 0.05,
        TIMBER_POST,
      );
    }
  }
}

function addRailings(builder, bridge) {
  const hw = bridge.halfWidth;
  const postStart = 0.42;
  const postEnd = bridge.length - 0.42;
  const bayCount = Math.max(3, Math.round((postEnd - postStart) / 1.85));
  const posts = [];
  for (let i = 0; i <= bayCount; i += 1) {
    const along = postStart + ((postEnd - postStart) * i) / bayCount;
    const t = along / bridge.length;
    posts.push({ along, y: bridgeDeckElevationAtT(bridge, t), isEnd: i === 0 || i === bayCount });
  }

  for (const side of [-1, 1]) {
    const lat = side * (hw + 0.04);
    for (const post of posts) {
      const half = post.isEnd ? 0.075 : 0.06;
      const height = post.isEnd ? 1.02 : 0.90;
      builder.addBox(bridge, post.along, half, post.y - 0.18, post.y + height, lat, half, TIMBER_POST);
      builder.addBox(
        bridge,
        post.along,
        half + 0.02,
        post.y + height,
        post.y + height + 0.045,
        lat,
        half + 0.02,
        TIMBER_RAIL,
      );
    }

    for (let i = 0; i < posts.length - 1; i += 1) {
      const p0 = posts[i];
      const p1 = posts[i + 1];
      // Top handrail
      builder.addBeamSegment(
        bridge,
        p0.along, p0.y + 0.77, p0.y + 0.85, lat - 0.052, lat + 0.052,
        p1.along, p1.y + 0.77, p1.y + 0.85, lat - 0.052, lat + 0.052,
        TIMBER_RAIL,
      );
      // Mid knee-rail
      builder.addBeamSegment(
        bridge,
        p0.along, p0.y + 0.40, p0.y + 0.46, lat - 0.038, lat + 0.038,
        p1.along, p1.y + 0.40, p1.y + 0.46, lat - 0.038, lat + 0.038,
        TIMBER_POST,
      );
    }
  }
}

export function buildPathBridgesGeometry(bridges, anchorX = 0, anchorZ = 0) {
  if (!bridges?.length) return null;
  const builder = new BridgeMeshBuilder(anchorX, anchorZ);
  for (let i = 0; i < bridges.length; i += 1) {
    const bridge = bridges[i];
    const seed = bridge.midX * 0.37 + bridge.midZ * 0.73 + i * 11;
    addStoneAbutments(builder, bridge);
    addArchedStringers(builder, bridge);
    addDeckPlanksAndCurbs(builder, bridge, seed);
    addTrestlePiers(builder, bridge);
    addRailings(builder, bridge);
  }
  return builder.build();
}

export function createPathBridgeMaterial() {
  return new THREE.MeshStandardNodeMaterial({
    name: 'path-bridge',
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04,
  });
}
