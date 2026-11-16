import * as THREE from 'three/webgpu';

/**
 * The fallen and growing things of a forest floor, built in code: every shape
 * carries bark, heartwood, moss, leaf, and UV data, so each kind renders with
 * one instanced draw while supporting triplanar + UV bark/grain/moss shading.
 */
const BARK = new THREE.Color('#9a8068');
const BARK_DARK = new THREE.Color('#665442');
const HEARTWOOD = new THREE.Color('#d6ba8d');
const HEARTWOOD_RING = new THREE.Color('#a6875e');
const MOSS = new THREE.Color('#5b7a38');
const MOSS_LIGHT = new THREE.Color('#7f9c46');
const LEAVES = Object.freeze(['#8a5a2b', '#a8742f', '#6e4a2a', '#94542a', '#b08a3e', '#5c4426'])
  .map((hex) => new THREE.Color(hex));
const SCRATCH = new THREE.Color();
const DECAYED = new THREE.Color('#463b2b');

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | state);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value in 0..1 for mottling bark and moss. */
function mottle(a, b) {
  return 0.5 + 0.25 * Math.sin(a * 2.3 + b * 1.7) + 0.25 * Math.sin(a * 5.1 - b * 3.3 + 1.2);
}

function smoothstep(low, high, value) {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

class MeshBuilder {
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

  /** A sawn or broken face: warm sapwood outer ring, heartwood centre, outward normals. */
  endGrain(ring, sides, centreAt, flip, cupDepth = 0) {
    const outer = this.positions.length / 3;
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const offset = (ring + side) * 3;
      const [x, y, z] = this.positions.slice(offset, offset + 3);
      this.vertex(
        x, y, z,
        SCRATCH.copy(BARK_DARK).lerp(HEARTWOOD_RING, 0.72),
        0.5 + Math.cos(angle) * 0.46,
        0.5 + Math.sin(angle) * 0.46,
      );
    }
    const inner = this.positions.length / 3;
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const offset = (ring + side) * 3;
      const [x, y, z] = this.positions.slice(offset, offset + 3);
      const scale = 0.62 + 0.04 * Math.sin(angle * 3);
      this.vertex(
        centreAt[0] + (x - centreAt[0]) * scale,
        centreAt[1] + (y - centreAt[1]) * scale - cupDepth * 0.45,
        centreAt[2] + (z - centreAt[2]) * scale,
        SCRATCH.copy(HEARTWOOD_RING).lerp(HEARTWOOD, 0.55),
        0.5 + Math.cos(angle) * 0.28,
        0.5 + Math.sin(angle) * 0.28,
      );
    }
    const centre = this.vertex(
      centreAt[0],
      centreAt[1] - cupDepth,
      centreAt[2],
      HEARTWOOD,
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

function barkColor(a, b, moss) {
  SCRATCH.copy(BARK_DARK).lerp(BARK, mottle(a, b));
  if (moss > 0) SCRATCH.lerp(MOSS_LIGHT, moss * 0.85);
  return SCRATCH;
}

/** Cut stump: spreading surface roots dipping into soil, tilted notched saw cut, mossy collar. */
export function createStumpGeometry({ radius = 0.34, height = 0.62, roots = 5 } = {}) {
  const builder = new MeshBuilder();
  const sides = 16;
  const rings = 7;
  const cutTilt = 0.16;
  for (let ring = 0; ring < rings; ring += 1) {
    const t = ring / (rings - 1);
    const leanX = Math.sin(t * Math.PI * 0.5) * 0.03;
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const twist = angle + t * 0.18;
      const lobe = Math.abs(Math.cos(twist * roots * 0.5 + 0.6)) ** 1.5;
      const uneven = 0.88 + 0.12 * Math.sin(angle * 2 + 1);
      const flare = (1 - t) ** 2.8;
      const sinkTuck = ring === 0 ? 0.96 : 1.0;
      const reach = radius
        * (0.95 + 0.05 * Math.sin(angle * 7))
        * (1 + flare * (0.38 + 1.85 * lobe))
        * uneven
        * sinkTuck;
      const x = Math.cos(angle) * reach + leanX;
      const z = Math.sin(angle) * reach;
      // Roots arch above duff near the trunk and dive downward at their outer lobes.
      const rootArch = (1 - t) * (1 - t) * lobe * 0.08 * (ring === 0 ? -0.9 : 1);
      const notch = t === 1 ? (x * cutTilt + Math.max(0, x) * 0.06) : 0;
      const y = -0.22 + t * (height + 0.22) + rootArch + notch;
      const moss = smoothstep(0.1, 0.8, Math.sin(angle) * 0.65 + 0.45 - t * 0.48 + (mottle(angle * 3, t * 6) - 0.5))
        * (1 - t * 0.45);
      builder.vertex(x, y, z, barkColor(angle * 4, t * 7, moss), (side / sides) * 2.0, t * height);
    }
  }
  builder.grid(0, rings, sides);
  builder.endGrain((rings - 1) * sides, sides, [0.03, height + 0.01, 0], true, 0.015);
  return builder.build();
}

/** Tapered bent trunk lying in the soil, fluted root flare, knots, angled capped limb stubs. */
export function createFallenLogGeometry({ length = 3.6, radius = 0.24 } = {}) {
  const builder = new MeshBuilder();
  const sides = 12;
  const rings = 10;
  const half = length / 2;
  const ringCentre = (t) => [
    -half + t * length,
    radius * 0.46 + Math.sin(t * Math.PI) * 0.05 - Math.max(0, 0.2 - t) * 0.06,
    Math.sin(t * 2.6) * 0.22,
  ];
  for (let ring = 0; ring < rings; ring += 1) {
    const t = ring / (rings - 1);
    const [cx, cy, cz] = ringCentre(t);
    const rootFlare = 1 - smoothstep(0, 0.28, t);
    const burl = Math.exp(-((t - 0.56) ** 2) / 0.012) * 0.14;
    const baseReach = radius * (1.06 - 0.46 * t) * (1 + 0.05 * Math.sin(t * 9) + burl);
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const up = Math.sin(angle);
      const cosA = Math.cos(angle);
      const furrow = 1 + 0.075 * Math.cos(angle * 7 + t * 3.5) + (mottle(t * 14, angle * 2.5) - 0.5) * 0.14;
      const buttress = 1 + rootFlare * (0.18 + 0.34 * Math.max(0, Math.cos(angle * 4 + 0.4)));
      const reach = baseReach * furrow * buttress;
      const moss = smoothstep(0.05, 0.72, up + (mottle(t * 9, angle * 2) - 0.5) * 0.82) * 0.85;
      builder.vertex(
        cx,
        cy + up * reach,
        cz + cosA * reach,
        barkColor(t * 10, angle * 3, moss),
        (side / sides) * 1.5,
        t * length,
      );
    }
  }
  builder.grid(0, rings, sides);
  // (y=sin, z=cos) around X requires flip=false at foot (-X) and flip=true at tip (+X).
  // Keep end caps nearly flush so trunks read as sawn/snapped logs rather than pointed cones.
  const foot = ringCentre(0);
  builder.endGrain(0, sides, [foot[0] - 0.012, foot[1], foot[2]], false, 0.008);
  const tip = ringCentre(1);
  builder.endGrain((rings - 1) * sides, sides, [tip[0] + 0.018, tip[1] + 0.005, tip[2]], true, 0.006);

  const addStub = (tPos, dx, dy, dz, baseR) => {
    const stub = builder.positions.length / 3;
    const [bx, by, bz] = ringCentre(tPos);
    const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
    const dir = [dx / len, dy / len, dz / len];
    const ref = Math.abs(dir[0]) < 0.85 ? [1, 0, 0] : [0, 1, 0];
    // Right-handed cross frame where B = T x dir so (c-a) x (b-a) = dir x B = +T (outward normals).
    let tx = ref[1] * dir[2] - ref[2] * dir[1];
    let ty = ref[2] * dir[0] - ref[0] * dir[2];
    let tz = ref[0] * dir[1] - ref[1] * dir[0];
    const tLen = Math.max(1e-5, Math.hypot(tx, ty, tz));
    tx /= tLen;
    ty /= tLen;
    tz /= tLen;
    const bxAxis = ty * dir[2] - tz * dir[1];
    const byAxis = tz * dir[0] - tx * dir[2];
    const bzAxis = tx * dir[1] - ty * dir[0];
    const startX = bx;
    const startY = by + radius * 0.28;
    const startZ = bz + Math.sign(dz || 1) * radius * 0.24;
    for (let ring = 0; ring < 3; ring += 1) {
      const t = ring / 2;
      const collar = t === 0 ? 1.32 : 1 - t * 0.56;
      const reach = baseR * collar;
      const cx = startX + t * dx;
      const cy = startY + t * dy;
      const cz = startZ + t * dz;
      for (let side = 0; side < 5; side += 1) {
        const angle = (side / 5) * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        builder.vertex(
          cx + (tx * c + bxAxis * s) * reach,
          cy + (ty * c + byAxis * s) * reach,
          cz + (tz * c + bzAxis * s) * reach,
          barkColor(t * 4 + tPos * 9, angle, t < 0.4 ? 0.2 : 0),
          side / 5,
          t * len,
        );
      }
    }
    builder.grid(stub, 3, 5);
    const tipCentre = builder.vertex(
      startX + dx * 1.03,
      startY + dy * 1.03,
      startZ + dz * 1.03,
      HEARTWOOD_RING,
      0.5,
      0.5,
    );
    builder.fan(tipCentre, stub + 2 * 5, 5, true);
  };
  addStub(0.28, 0.16, 0.24, -0.22, 0.068);
  addStub(0.58, 0.28, 0.34, 0.24, 0.078);
  addStub(0.79, 0.18, 0.16, -0.15, 0.052);
  return builder.build();
}

/** A forked, curved dead branch resting on the ground with bark taper and end grain. */
export function createFallenBranchGeometry({ length = 2.2, radius = 0.045 } = {}) {
  const builder = new MeshBuilder();
  const limb = (from, to, startRadius, { rows = 5, sides = 6, capEnds = true, arch = 0.03 } = {}) => {
    const first = builder.positions.length / 3;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const step = [dx, dy, dz];
    const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
    for (let ring = 0; ring < rows; ring += 1) {
      const t = ring / (rows - 1);
      const reach = startRadius * (1 - t * 0.68);
      const kinkZ = Math.sin(t * Math.PI * 1.4 + from[0] * 1.7) * 0.055;
      const kinkY = Math.sin(t * Math.PI) * arch;
      const cx = from[0] + dx * t;
      const cy = from[1] + dy * t + kinkY;
      const cz = from[2] + dz * t + kinkZ;
      for (let side = 0; side < sides; side += 1) {
        const angle = (side / sides) * Math.PI * 2;
        const up = Math.sin(angle);
        const ridge = 1 + 0.09 * Math.sin(angle * 3 + t * 5 + from[0]) + 0.05 * Math.sin(t * 9);
        const r = reach * ridge;
        const moss = smoothstep(0.15, 0.78, up + (mottle(t * 9 + from[0], angle * 2) - 0.5) * 0.8) * 0.76;
        builder.vertex(
          cx,
          cy + up * r,
          cz + Math.cos(angle) * r,
          barkColor(t * 7 + from[0], angle * 3, moss),
          side / sides,
          t * len,
        );
      }
    }
    builder.grid(first, rows, sides);
    if (capEnds) {
      const invLen = 0.04 / len;
      builder.endGrain(first, sides, [from[0] - step[0] * invLen, from[1], from[2] - step[2] * invLen], false);
      builder.endGrain(
        first + (rows - 1) * sides,
        sides,
        [to[0] + step[0] * invLen, to[1], to[2] + step[2] * invLen],
        true,
      );
    } else {
      const tipRing = first + (rows - 1) * sides;
      const tipCentre = builder.vertex(to[0], to[1], to[2], barkColor(9, 1, 0.25), 0.5, 0.5);
      builder.fan(tipCentre, tipRing, sides, true);
    }
  };
  const half = length / 2;
  limb([-half, 0.05, -0.02], [half, 0.032, 0.12], radius, { rows: 5, sides: 6, capEnds: true, arch: 0.035 });
  limb([-half * 0.12, 0.055, 0.03], [half * 0.52, 0.13, 0.48], radius * 0.62, { rows: 4, sides: 5, capEnds: false, arch: 0.02 });
  limb([half * 0.22, 0.048, 0.07], [half * 0.74, 0.09, -0.26], radius * 0.46, { rows: 3, sides: 5, capEnds: false, arch: 0.015 });
  return builder.build();
}

/** A drift of fallen leaves: flat bent diamonds, denser toward the middle. */
export function createLeafLitterGeometry({ radius = 1.7, leaves = 72, seed = 0x51ea } = {}) {
  const builder = new MeshBuilder();
  const random = createRandom(seed);
  for (let index = 0; index < leaves; index += 1) {
    const distance = radius * Math.sqrt(random()) * (0.5 + random() * 0.5);
    const place = random() * Math.PI * 2;
    const yaw = random() * Math.PI * 2;
    const size = 0.05 + random() * 0.05;
    const x = Math.cos(place) * distance;
    const z = Math.sin(place) * distance;
    const y = 0.015 + random() * 0.03;
    const color = LEAVES[Math.floor(random() * LEAVES.length)].clone()
      .lerp(DECAYED, random() * 0.65).multiplyScalar(0.8 + random() * 0.35);
    const along = [Math.cos(yaw) * size, Math.sin(yaw) * size];
    const across = [-along[1] * 0.55, along[0] * 0.55];
    const first = builder.positions.length / 3;
    builder.vertex(x + along[0], y + 0.012, z + along[1], color, 0.5, 0);
    builder.vertex(x + across[0], y, z + across[1], color, 1, 0.5);
    builder.vertex(x - along[0], y + 0.012, z - along[1], color, 0.5, 1);
    builder.vertex(x - across[0], y, z - across[1], color, 0, 0.5);
    builder.indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
  }
  const geometry = builder.build();
  const normals = geometry.getAttribute('normal');
  for (let index = 0; index < normals.count; index += 1) normals.setXYZ(index, 0, 1, 0);
  return geometry;
}

/** A soft cushion of moss, lobed so it does not read as half a ball. */
export function createMossMoundGeometry({ radius = 0.5, height = 0.18 } = {}) {
  const builder = new MeshBuilder();
  const sides = 16;
  const rings = 5;
  for (let ring = 0; ring < rings; ring += 1) {
    const t = ring / (rings - 1);
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const lobe = 1 + 0.18 * Math.sin(angle * 3 + 0.4) + 0.12 * Math.sin(angle * 5) + 0.07 * Math.sin(angle * 7 + 1.3);
      const reach = radius * lobe * Math.cos(t * Math.PI * 0.46);
      SCRATCH.copy(MOSS).lerp(MOSS_LIGHT, mottle(angle * 3, t * 5) * (0.45 + t * 0.55));
      builder.vertex(
        Math.cos(angle) * reach,
        -0.05 + Math.sin(t * Math.PI * 0.5) * (height + 0.02),
        Math.sin(angle) * reach,
        SCRATCH,
        0.5 + Math.cos(angle) * (1 - t) * 0.5,
        0.5 + Math.sin(angle) * (1 - t) * 0.5,
      );
    }
  }
  builder.grid(0, rings, sides);
  const top = builder.vertex(0, height, 0, MOSS_LIGHT, 0.5, 0.5);
  builder.fan(top, (rings - 1) * sides, sides, true);
  return builder.build();
}
