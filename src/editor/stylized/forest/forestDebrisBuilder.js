import * as THREE from 'three/webgpu';

export const BARK = new THREE.Color('#967c64');
export const BARK_DARK = new THREE.Color('#665442');
export const EXPOSED_WOOD = new THREE.Color('#dcc498');
export const EXPOSED_DEEP = new THREE.Color('#b89a6c');
export const ROT_DARK = new THREE.Color('#2b1d14');
export const ROT_PUNK = new THREE.Color('#422e20');
export const MOSS = new THREE.Color('#5a7a36');
export const MOSS_LIGHT = new THREE.Color('#7f9c46');
export const LEAVES = Object.freeze(['#8a5a2b', '#a8742f', '#6e4a2a', '#94542a', '#b08a3e', '#5c4426'])
  .map((hex) => new THREE.Color(hex));
export const DECAYED = new THREE.Color('#463b2b');
export const SCRATCH = new THREE.Color();

export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | state);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function mottle(a, b) {
  return 0.5 + 0.25 * Math.sin(a * 2.3 + b * 1.7) + 0.25 * Math.sin(a * 5.1 - b * 3.3 + 1.2);
}

export function smoothstep(low, high, value) {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** Right-handed orthonormal frame where B = T x dir ensures outward grid & flip=true tip normals. */
export function tubeFrame(dx, dy, dz) {
  const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
  const dir = [dx / len, dy / len, dz / len];
  const ref = Math.abs(dir[0]) < 0.85 ? [1, 0, 0] : [0, 1, 0];
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
  return { dir, t: [tx, ty, tz], b: [bx, by, bz], len };
}

export function barkColor(a, b, moss = 0, exposed = 0, rot = 0) {
  SCRATCH.copy(BARK_DARK).lerp(BARK, mottle(a, b));
  if (moss > 0) SCRATCH.lerp(MOSS_LIGHT, Math.min(1, moss * 0.85));
  if (exposed > 0) SCRATCH.lerp(mottle(a * 2, b) > 0.5 ? EXPOSED_WOOD : EXPOSED_DEEP, Math.min(1, exposed));
  if (rot > 0) SCRATCH.lerp(mottle(b * 3, a) > 0.5 ? ROT_PUNK : ROT_DARK, Math.min(1, rot));
  return SCRATCH;
}

/** Shared vertex/index builder for procedural wood, root, moss, and bracket-fungus geometry. */
export class MeshBuilder {
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

  /** Closes `sides` columns of quads between `rows` rings written one after another. */
  grid(first, rows, sides) {
    for (let row = 0; row + 1 < rows; row += 1) {
      for (let side = 0; side < sides; side += 1) {
        const next = (side + 1) % sides;
        const a = first + row * sides + side;
        const b = first + row * sides + next;
        const c = a + sides;
        const d = b + sides;
        this.indices.push(a, c, b, b, c, d);
      }
    }
  }

  fan(centre, first, sides, flip = false) {
    for (let side = 0; side < sides; side += 1) {
      const a = first + side;
      const b = first + (side + 1) % sides;
      if (flip) this.indices.push(centre, b, a);
      else this.indices.push(centre, a, b);
    }
  }

  /** Stepped or cupped face: exposes fibrous heartwood rim and optional rotted center hollow. */
  endGrain(ring, sides, centreAt, flip, { cupDepth = 0, rotCenter = 0, jagX = 0, axisY = false } = {}) {
    const outer = this.positions.length / 3;
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const offset = (ring + side) * 3;
      const [x, y, z] = this.positions.slice(offset, offset + 3);
      this.vertex(
        x, y, z,
        SCRATCH.copy(BARK_DARK).lerp(EXPOSED_DEEP, 0.78),
        0.5 + Math.cos(angle) * 0.46,
        0.5 + Math.sin(angle) * 0.46,
      );
    }
    const inner = this.positions.length / 3;
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const offset = (ring + side) * 3;
      const [x, y, z] = this.positions.slice(offset, offset + 3);
      const scale = 0.54 + 0.10 * Math.sin(angle * 3 + 0.7);
      const jag = jagX * Math.sin(angle * 4 + 0.5);
      const signX = flip ? -1 : 1;
      const px = centreAt[0] + (x - centreAt[0]) * scale + (axisY ? 0 : jag + signX * cupDepth * 0.45);
      const py = centreAt[1] + (y - centreAt[1]) * scale + (axisY ? jag - cupDepth * 0.45 : 0);
      const pz = centreAt[2] + (z - centreAt[2]) * scale;
      const c = rotCenter > 0.5
        ? SCRATCH.copy(EXPOSED_DEEP).lerp(ROT_PUNK, 0.72)
        : SCRATCH.copy(EXPOSED_DEEP).lerp(EXPOSED_WOOD, 0.48);
      this.vertex(px, py, pz, c, 0.5 + Math.cos(angle) * 0.28, 0.5 + Math.sin(angle) * 0.28);
    }
    const centerColor = rotCenter > 0.25 ? ROT_DARK : EXPOSED_WOOD;
    const signX = flip ? -1 : 1;
    const centre = this.vertex(
      centreAt[0] + (axisY ? 0 : signX * cupDepth),
      centreAt[1] - (axisY ? cupDepth : 0),
      centreAt[2],
      centerColor,
      0.5,
      0.5,
    );
    this.fan(centre, inner, sides, flip);
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const a = outer + side;
      const b = outer + next;
      const c = inner + side;
      const d = inner + next;
      if (flip) this.indices.push(a, c, b, b, c, d);
      else this.indices.push(a, b, c, b, d, c);
    }
  }

  /** Appends a curved organic limb, root, or broken spur along waypoints and caps its tip. */
  curvedLimb(points, radii, sides, { seed = 0, capTip = true, rotTip = false, exposed = 0, moss = 0 } = {}) {
    const start = this.positions.length / 3;
    const rows = points.length;
    for (let row = 0; row < rows; row += 1) {
      const p = points[row];
      const prev = points[Math.max(0, row - 1)];
      const next = points[Math.min(rows - 1, row + 1)];
      const frame = tubeFrame(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]);
      const r = radii[row];
      const t = rows > 1 ? row / (rows - 1) : 0;
      for (let side = 0; side < sides; side += 1) {
        const angle = (side / sides) * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const ridge = 1 + 0.09 * Math.sin(angle * 3 + t * 4 + seed);
        this.vertex(
          p[0] + (frame.t[0] * c + frame.b[0] * s) * r * ridge,
          p[1] + (frame.t[1] * c + frame.b[1] * s) * r * ridge,
          p[2] + (frame.t[2] * c + frame.b[2] * s) * r * ridge,
          barkColor(t * 5 + seed, angle * 2, moss * (1 - t * 0.6), exposed * t, 0),
          side / sides,
          t,
        );
      }
    }
    this.grid(start, rows, sides);
    if (capTip) {
      const last = points[rows - 1];
      const prev = points[Math.max(0, rows - 2)];
      const frame = tubeFrame(last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]);
      const tipCentre = this.vertex(
        last[0] + frame.dir[0] * 0.012,
        last[1] + frame.dir[1] * 0.012,
        last[2] + frame.dir[2] * 0.012,
        rotTip ? ROT_DARK : EXPOSED_WOOD,
        0.5,
        0.5,
      );
      this.fan(tipCentre, start + (rows - 1) * sides, sides, true);
    }
  }

  /** Builds a deeply hollowed top pit inside a vertical stump ring using inward-facing wall winding. */
  hollowPit(rimRing, sides, centerY, pitDepth, rimRadius) {
    const start = this.positions.length / 3;
    const pitRings = 3;
    for (let r = 0; r < pitRings; r += 1) {
      const p = r / (pitRings - 1);
      for (let side = 0; side < sides; side += 1) {
        const angle = (side / sides) * Math.PI * 2;
        const offset = (rimRing + side) * 3;
        const [rx, ry, rz] = this.positions.slice(offset, offset + 3);
        const shrink = r === 0 ? 0.94 : (1 - p * 0.64);
        const yDrop = p * pitDepth + 0.015 * Math.sin(angle * 3 + r);
        const c = r === 0
          ? SCRATCH.copy(BARK_DARK).lerp(EXPOSED_DEEP, 0.6)
          : (r === 1 ? ROT_PUNK : ROT_DARK);
        this.vertex(
          rx * shrink,
          ry - yDrop,
          rz * shrink,
          c,
          0.5 + (rx * shrink) / (rimRadius * 2.2),
          0.5 + (rz * shrink) / (rimRadius * 2.2),
        );
      }
    }
    this.grid(start, pitRings, sides);
    const pitBottom = this.vertex(0, centerY - pitDepth - 0.02, 0, ROT_DARK, 0.5, 0.5);
    this.fan(pitBottom, start + (pitRings - 1) * sides, sides, true);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
