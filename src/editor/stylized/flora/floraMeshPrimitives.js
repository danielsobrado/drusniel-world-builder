import * as THREE from 'three/webgpu';

const SCRATCH_COLOR = new THREE.Color();

export function createSeededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function orthoFrame(dx, dy, dz) {
  const len = Math.max(1e-5, Math.hypot(dx, dy, dz));
  const dir = [dx / len, dy / len, dz / len];
  const ref = Math.abs(dir[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0];
  let tx = ref[1] * dir[2] - ref[2] * dir[1];
  let ty = ref[2] * dir[0] - ref[0] * dir[2];
  let tz = ref[0] * dir[1] - ref[1] * dir[0];
  const tLen = Math.max(1e-5, Math.hypot(tx, ty, tz));
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;
  const bx = ty * dir[2] - tz * dir[1];
  const by = tz * dir[0] - tx * dir[2];
  const bz = tx * dir[1] - ty * dir[0];
  return { dir, t: [tx, ty, tz], b: [bx, by, bz] };
}

/**
 * Reusable high-detail botanical and sculptural mesh builder. Produces single-draw
 * indexed `BufferGeometry` with finite positions, UVs, semantic RGB vertex colors,
 * and computed outward vertex normals.
 */
export class OrganicMeshBuilder {
  positions = [];
  colors = [];
  uvs = [];
  indices = [];

  vertex(x, y, z, color, u = 0, v = 0) {
    this.positions.push(x, y, z);
    this.colors.push(color.r, color.g, color.b);
    this.uvs.push(u, v);
    return this.positions.length / 3 - 1;
  }

  tri(a, b, c) {
    this.indices.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  connectGrid(first, rows, sides, closed = true) {
    const segs = closed ? sides : sides - 1;
    for (let r = 0; r + 1 < rows; r += 1) {
      for (let s = 0; s < segs; s += 1) {
        const next = closed ? (s + 1) % sides : s + 1;
        const a = first + r * sides + s;
        const b = first + r * sides + next;
        const c = a + sides;
        const d = b + sides;
        this.indices.push(a, c, b, b, c, d);
      }
    }
  }

  /** Appends an extruded fluted stem, root, cane, or gnarled trunk along 3D waypoints. */
  addTube(points, radii, sides, {
    colorBase,
    colorTip,
    fluteCount = 0,
    fluteDepth = 0,
    twist = 0,
    capStart = false,
    capEnd = true,
  }) {
    const start = this.positions.length / 3;
    const rows = points.length;
    for (let r = 0; r < rows; r += 1) {
      const t = rows > 1 ? r / (rows - 1) : 0;
      const p = points[r];
      const prev = points[Math.max(0, r - 1)];
      const next = points[Math.min(rows - 1, r + 1)];
      const frame = orthoFrame(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]);
      const baseR = Array.isArray(radii) ? radii[r] : radii * (1 - t * 0.4);
      SCRATCH_COLOR.copy(colorBase).lerp(colorTip ?? colorBase, t);
      for (let s = 0; s < sides; s += 1) {
        const angle = (s / sides) * Math.PI * 2;
        const mod = fluteCount > 0 ? 1 + fluteDepth * Math.sin(angle * fluteCount + t * twist) : 1;
        const radius = baseR * mod;
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        this.vertex(
          p[0] + (frame.t[0] * ca + frame.b[0] * sa) * radius,
          p[1] + (frame.t[1] * ca + frame.b[1] * sa) * radius,
          p[2] + (frame.t[2] * ca + frame.b[2] * sa) * radius,
          SCRATCH_COLOR,
          s / sides,
          t,
        );
      }
    }
    this.connectGrid(start, rows, sides, true);
    if (capStart) {
      const p0 = points[0];
      const c0 = this.vertex(p0[0], p0[1], p0[2], colorBase, 0.5, 0.5);
      for (let s = 0; s < sides; s += 1) {
        this.tri(c0, start + s, start + ((s + 1) % sides));
      }
    }
    if (capEnd) {
      const last = points[rows - 1];
      const endRow = start + (rows - 1) * sides;
      const c1 = this.vertex(last[0], last[1], last[2], colorTip ?? colorBase, 0.5, 0.5);
      for (let s = 0; s < sides; s += 1) {
        this.tri(c1, endRow + ((s + 1) % sides), endRow + s);
      }
    }
  }

  /**
   * Appends a sculpted 3D double-curved leaf blade with midrib crease, taper, arch,
   * and optional marginal serration. Oriented from `origin` along `(yaw, pitch, roll)`.
   */
  addSculptedLeaf({
    origin = [0, 0, 0],
    yaw = 0,
    pitch = 0.35,
    roll = 0,
    length = 0.35,
    width = 0.14,
    arch = 0.08,
    cup = 0.025,
    segments = 5,
    serration = 0,
    colorBase,
    colorTip,
  }) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);

    const toWorld = (lx, ly, lz) => {
      // Roll around local X (blade axis), pitch up around Z, yaw around Y.
      const rx = lx;
      const ry = ly * cr - lz * sr;
      const rz = ly * sr + lz * cr;
      const px = rx * cp - ry * sp;
      const py = rx * sp + ry * cp;
      const pz = rz;
      return [
        origin[0] + px * cy - pz * sy,
        origin[1] + py,
        origin[2] + px * sy + pz * cy,
      ];
    };

    const rowVerts = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const along = t * length;
      const drop = Math.sin(t * Math.PI) * arch - t * t * arch * 1.45;
      const profile = Math.sin(Math.pow(t, 0.72) * Math.PI);
      const ser = serration > 0 && i > 0 && i < segments ? (1 + (i % 2 === 0 ? serration : -serration * 0.5)) : 1;
      const halfW = Math.max(0.002, width * 0.5 * profile * ser);
      SCRATCH_COLOR.copy(colorBase).lerp(colorTip ?? colorBase, t);
      const midColor = SCRATCH_COLOR.clone().multiplyScalar(0.88);
      const lIdx = this.vertex(...toWorld(along, drop + cup, -halfW), SCRATCH_COLOR, 0, t);
      const mIdx = this.vertex(...toWorld(along, drop - cup * 0.4, 0), midColor, 0.5, t);
      const rIdx = this.vertex(...toWorld(along, drop + cup, halfW), SCRATCH_COLOR, 1, t);
      rowVerts.push([lIdx, mIdx, rIdx]);
    }
    for (let i = 0; i < segments; i += 1) {
      const [l0, m0, r0] = rowVerts[i];
      const [l1, m1, r1] = rowVerts[i + 1];
      this.quad(l0, l1, m1, m0);
      this.quad(m0, m1, r1, r0);
    }
  }

  /** Appends a cupped 3D multi-petal blossom with raised center receptacle. */
  addBlossom({
    center = [0, 0.3, 0],
    radius = 0.08,
    petals = 6,
    tilt = [0, 0, 0],
    colorPetal,
    colorCore,
    cupDepth = 0.024,
  }) {
    const euler = new THREE.Euler(tilt[0], tilt[1], tilt[2]);
    const v = new THREE.Vector3();
    const toWorld = (lx, ly, lz) => {
      v.set(lx, ly, lz).applyEuler(euler);
      return [center[0] + v.x, center[1] + v.y, center[2] + v.z];
    };
    const coreIdx = this.vertex(...toWorld(0, cupDepth * 0.45, 0), colorCore, 0.5, 0.5);
    const ringCount = petals;
    const baseRing = [];
    for (let p = 0; p < ringCount; p += 1) {
      const a = (p / ringCount) * Math.PI * 2;
      baseRing.push(this.vertex(
        ...toWorld(Math.cos(a) * radius * 0.28, 0, Math.sin(a) * radius * 0.28),
        colorCore,
        0.5,
        0.5,
      ));
    }
    for (let p = 0; p < ringCount; p += 1) {
      this.tri(coreIdx, baseRing[(p + 1) % ringCount], baseRing[p]);
      const a = (p / ringCount) * Math.PI * 2;
      const da = (Math.PI / ringCount) * 0.85;
      const tipColor = SCRATCH_COLOR.copy(colorPetal);
      const midA = this.vertex(
        ...toWorld(Math.cos(a - da) * radius * 0.72, cupDepth * 0.7, Math.sin(a - da) * radius * 0.72),
        tipColor,
        0.2,
        0.6,
      );
      const midB = this.vertex(
        ...toWorld(Math.cos(a + da) * radius * 0.72, cupDepth * 0.7, Math.sin(a + da) * radius * 0.72),
        tipColor,
        0.8,
        0.6,
      );
      const outer = this.vertex(
        ...toWorld(Math.cos(a) * radius, cupDepth, Math.sin(a) * radius),
        tipColor.clone().multiplyScalar(1.12),
        0.5,
        1,
      );
      this.tri(baseRing[p], midA, outer);
      this.tri(baseRing[p], outer, midB);
      this.tri(baseRing[p], midB, baseRing[(p + 1) % ringCount]);
    }
  }

  /** Appends an asymmetric organic mound, cushion, berry, or pebble cluster via warped sphere grid. */
  addBlob({
    center = [0, 0, 0],
    radiusX = 0.2,
    radiusY = 0.14,
    radiusZ = 0.2,
    rings = 5,
    sides = 10,
    ribAmp = 0.08,
    ribFreq = 5,
    phase = 0,
    colorBase,
    colorTop,
  }) {
    const start = this.positions.length / 3;
    const south = this.vertex(center[0], center[1] - radiusY, center[2], colorBase, 0.5, 0);
    for (let r = 1; r < rings; r += 1) {
      const vFrac = r / rings;
      const phi = -Math.PI * 0.5 + vFrac * Math.PI;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      SCRATCH_COLOR.copy(colorBase).lerp(colorTop ?? colorBase, vFrac);
      for (let s = 0; s < sides; s += 1) {
        const theta = (s / sides) * Math.PI * 2;
        const wob = 1 + ribAmp * Math.sin(theta * ribFreq + phase + vFrac * 2);
        this.vertex(
          center[0] + cp * Math.cos(theta) * radiusX * wob,
          center[1] + sp * radiusY,
          center[2] + cp * Math.sin(theta) * radiusZ * wob,
          SCRATCH_COLOR,
          s / sides,
          vFrac,
        );
      }
    }
    const north = this.vertex(center[0], center[1] + radiusY, center[2], colorTop ?? colorBase, 0.5, 1);
    for (let s = 0; s < sides; s += 1) {
      this.tri(south, start + 1 + ((s + 1) % sides), start + 1 + s);
    }
    this.connectGrid(start + 1, rings - 1, sides, true);
    const lastRow = start + 1 + (rings - 2) * sides;
    for (let s = 0; s < sides; s += 1) {
      this.tri(north, lastRow + s, lastRow + ((s + 1) % sides));
    }
  }

  /** Appends a faceted crystalline spire, cactus paddle, or glacial blade along an upright taper. */
  addFacetedPrism({
    base = [0, 0, 0],
    height = 0.6,
    radiusX = 0.14,
    radiusZ = 0.14,
    sides = 6,
    tiers = 4,
    tilt = [0, 0, 0],
    colorBase,
    colorTip,
    taper = 0.8,
  }) {
    const euler = new THREE.Euler(tilt[0], tilt[1], tilt[2]);
    const vec = new THREE.Vector3();
    const toWorld = (lx, ly, lz) => {
      vec.set(lx, ly, lz).applyEuler(euler);
      return [base[0] + vec.x, base[1] + vec.y, base[2] + vec.z];
    };
    const start = this.positions.length / 3;
    for (let r = 0; r < tiers; r += 1) {
      const t = r / (tiers - 1);
      const scale = Math.max(0.08, 1 - taper * Math.pow(t, 1.4));
      const y = t * height;
      SCRATCH_COLOR.copy(colorBase).lerp(colorTip ?? colorBase, t);
      for (let s = 0; s < sides; s += 1) {
        const a = (s / sides) * Math.PI * 2;
        const wob = 1 + 0.08 * Math.sin(a * 3 + r);
        this.vertex(
          ...toWorld(Math.cos(a) * radiusX * scale * wob, y, Math.sin(a) * radiusZ * scale * wob),
          SCRATCH_COLOR,
          s / sides,
          t,
        );
      }
    }
    this.connectGrid(start, tiers, sides, true);
    const apex = this.vertex(...toWorld(0, height * 1.04, 0), colorTip ?? colorBase, 0.5, 1);
    const topRow = start + (tiers - 1) * sides;
    for (let s = 0; s < sides; s += 1) {
      this.tri(apex, topRow + ((s + 1) % sides), topRow + s);
    }
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
