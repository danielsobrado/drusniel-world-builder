import * as THREE from 'three/webgpu';

/**
 * Procedural forest-floor deadwood silhouettes with semantic vertex colors:
 * - Bark (`BARK` / `BARK_DARK`): medium neutral brown for furrowed bark shading
 * - Exposed wood (`EXPOSED_WOOD` / `EXPOSED_DEEP`): high R-B warm buff for fibrous split wood
 * - Decayed rot (`ROT_DARK` / `ROT_PUNK`): dark umber for hollowed heart-rot cavities
 * - Moss/humus (`MOSS` / `MOSS_LIGHT`): green-biased damp moss & root-bed cushions
 * Every solid shape provides UVs and verified outward-facing normals.
 */
const BARK = new THREE.Color('#967c64');
const BARK_DARK = new THREE.Color('#665442');
const EXPOSED_WOOD = new THREE.Color('#dcc498');
const EXPOSED_DEEP = new THREE.Color('#b89a6c');
const ROT_DARK = new THREE.Color('#2b1d14');
const ROT_PUNK = new THREE.Color('#422e20');
const MOSS = new THREE.Color('#5a7a36');
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

function mottle(a, b) {
  return 0.5 + 0.25 * Math.sin(a * 2.3 + b * 1.7) + 0.25 * Math.sin(a * 5.1 - b * 3.3 + 1.2);
}

function smoothstep(low, high, value) {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** Right-handed orthonormal frame where B = T x dir ensures outward grid & flip=true tip normals. */
function tubeFrame(dx, dy, dz) {
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

function barkColor(a, b, moss = 0, exposed = 0, rot = 0) {
  SCRATCH.copy(BARK_DARK).lerp(BARK, mottle(a, b));
  if (moss > 0) SCRATCH.lerp(MOSS_LIGHT, Math.min(1, moss * 0.85));
  if (exposed > 0) SCRATCH.lerp(mottle(a * 2, b) > 0.5 ? EXPOSED_WOOD : EXPOSED_DEEP, Math.min(1, exposed));
  if (rot > 0) SCRATCH.lerp(mottle(b * 3, a) > 0.5 ? ROT_PUNK : ROT_DARK, Math.min(1, rot));
  return SCRATCH;
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
      const scale = 0.56 + 0.08 * Math.sin(angle * 3 + 0.7);
      const jag = jagX * Math.sin(angle * 4 + 0.5);
      const px = centreAt[0] + (x - centreAt[0]) * scale + (axisY ? 0 : jag);
      const py = centreAt[1] + (y - centreAt[1]) * scale - cupDepth * 0.45 + (axisY ? jag : 0);
      const pz = centreAt[2] + (z - centreAt[2]) * scale;
      const c = rotCenter > 0.5
        ? SCRATCH.copy(EXPOSED_DEEP).lerp(ROT_PUNK, 0.65)
        : SCRATCH.copy(EXPOSED_DEEP).lerp(EXPOSED_WOOD, 0.55);
      this.vertex(px, py, pz, c, 0.5 + Math.cos(angle) * 0.28, 0.5 + Math.sin(angle) * 0.28);
    }
    const centerColor = rotCenter > 0.25 ? ROT_DARK : EXPOSED_WOOD;
    const centre = this.vertex(
      centreAt[0],
      centreAt[1] - cupDepth,
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
    // Descending y along `grid` flips cross product cleanly inward into the hollow cavity.
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

const STUMP_PRESETS = Object.freeze({
  jagged: { height: 0.78, roots: 4, leanX: 0.11, leanZ: 0.04, topMode: 'jagged', phase: 0.35 },
  hollow: { height: 0.54, roots: 5, leanX: -0.05, leanZ: 0.03, topMode: 'hollow', phase: 1.7 },
  weathered: { height: 0.46, roots: 6, leanX: 0.04, leanZ: -0.05, topMode: 'weathered', phase: 2.9 },
});

/** Irregular stump with asymmetric meandering roots, exposed bark-loss wood, decay cavities, and cleft cushions. */
export function createStumpGeometry({
  radius = 0.34,
  variant = 'hollow',
  height: heightOverride,
  roots: rootsOverride,
} = {}) {
  const preset = STUMP_PRESETS[variant] ?? STUMP_PRESETS.hollow;
  const height = heightOverride ?? preset.height;
  const roots = rootsOverride ?? preset.roots;
  const builder = new MeshBuilder();
  const sides = 24;
  const rings = 11;

  for (let ring = 0; ring < rings; ring += 1) {
    const t = ring / (rings - 1);
    const leanX = Math.sin(t * Math.PI * 0.7) * preset.leanX;
    const leanZ = Math.sin(t * Math.PI * 0.6) * preset.leanZ;
    for (let side = 0; side < sides; side += 1) {
      const baseAngle = (side / sides) * Math.PI * 2;
      const serpent = baseAngle + Math.sin(t * 2.4 + baseAngle * 2 + preset.phase) * 0.14 + t * 0.2;
      // Asymmetric root amplitudes avoid repeating star spokes.
      const asymRoot = 0.78 + 0.36 * Math.sin(baseAngle + preset.phase) + 0.18 * Math.cos(baseAngle * 2 - preset.phase);
      const lobe = (Math.abs(Math.cos(serpent * roots * 0.5 + preset.phase)) ** 1.7) * asymRoot;
      const flare = (1 - t) ** 2.35;
      const knuckle = Math.exp(-((t - 0.28) ** 2) / 0.025) * lobe * 0.16;
      const toePlunge = Math.max(0, 0.22 - t) / 0.22;
      const sinkTuck = 1 - toePlunge * toePlunge * 0.16;
      const barkLossDent = (Math.sin(baseAngle - 1.1 - preset.phase) > 0.55 && t > 0.25 && t < 0.85) ? 0.91 : 1.0;
      const reach = radius
        * (0.90 + 0.08 * Math.sin(baseAngle * 3 + t * 2 + preset.phase))
        * (1 + flare * (0.34 + 1.28 * lobe) + knuckle)
        * barkLossDent
        * sinkTuck;
      const x = Math.cos(baseAngle) * reach + leanX;
      const z = Math.sin(baseAngle) * reach + leanZ;
      const rootArch = Math.sin(Math.min(1, t / 0.35) * Math.PI) * lobe * 0.055 - toePlunge * (0.08 + 0.06 * lobe);

      let topContour = x * 0.15;
      if (preset.topMode === 'jagged') {
        const shard = Math.max(0, Math.sin(baseAngle * 2 + preset.phase)) * 0.18
          + 0.08 * Math.cos(baseAngle * 5 - 0.6);
        topContour = t > 0.72 ? shard * smoothstep(0.72, 1.0, t) : 0;
      } else if (preset.topMode === 'hollow') {
        const sideBreach = Math.max(0, Math.cos(baseAngle + 0.9)) * 0.11;
        topContour = (0.04 * Math.sin(baseAngle * 4 + 0.4) - sideBreach) * smoothstep(0.65, 1.0, t);
      } else {
        topContour = (x * 0.20 + 0.045 * Math.sin(baseAngle * 3 + 0.9)) * smoothstep(0.6, 1.0, t);
      }

      const y = -0.22 + t * (height + 0.22) + rootArch + topContour;
      const moss = smoothstep(0.05, 0.76, Math.sin(baseAngle + preset.phase) * 0.6 + 0.42 - t * 0.55) * (1 - t * 0.45);
      const exposed = barkLossDent < 1.0 ? smoothstep(0.25, 0.6, t) * 0.88 : (preset.topMode === 'jagged' && t > 0.88 ? 0.7 : 0);
      const rot = preset.topMode === 'hollow' && Math.cos(baseAngle + 0.9) > 0.45 && t > 0.62 ? 0.75 : 0;
      builder.vertex(x, y, z, barkColor(baseAngle * 4, t * 7 + preset.phase, moss, exposed, rot), (side / sides) * 2.0, t * height);
    }
  }
  builder.grid(0, rings, sides);

  const topCenterY = height + (preset.topMode === 'jagged' ? 0.08 : -0.01);
  if (preset.topMode === 'hollow') {
    builder.hollowPit((rings - 1) * sides, sides, height, height * 0.48, radius);
  } else if (preset.topMode === 'jagged') {
    builder.endGrain((rings - 1) * sides, sides, [preset.leanX, topCenterY, preset.leanZ], true, {
      cupDepth: -0.05, rotCenter: 0.35, jagX: 0.06, axisY: true,
    });
  } else {
    builder.endGrain((rings - 1) * sides, sides, [preset.leanX, height, preset.leanZ], true, {
      cupDepth: 0.045, rotCenter: 0.75, jagX: 0.03, axisY: true,
    });
  }

  // Asymmetric humus/moss cushions nestled into root pockets to soften floor union.
  for (let i = 0; i < roots; i += 1) {
    const a = ((i + 0.5 + 0.14 * Math.sin(i * 2.3 + preset.phase)) / roots) * Math.PI * 2;
    const dist = radius * (0.86 + 0.12 * Math.cos(i * 1.9));
    const cx = Math.cos(a) * dist;
    const cz = Math.sin(a) * dist;
    const first = builder.positions.length / 3;
    const cSides = 8;
    const cRings = 3;
    for (let r = 0; r < cRings; r += 1) {
      const rt = r / (cRings - 1);
      const rad = radius * (0.55 + 0.1 * ((i + 1) % 2)) * Math.cos(rt * Math.PI * 0.45);
      const yy = -0.06 + Math.sin(rt * Math.PI * 0.5) * 0.1;
      for (let s = 0; s < cSides; s += 1) {
        const ang = (s / cSides) * Math.PI * 2;
        const wob = 1 + 0.14 * Math.sin(ang * 3 + i + preset.phase);
        builder.vertex(
          cx + Math.cos(ang) * rad * wob,
          yy,
          cz + Math.sin(ang) * rad * wob,
          barkColor(i * 3.1, rt * 4, 0.74, 0, 0.18),
          0.5 + Math.cos(ang) * 0.4,
          0.5 + Math.sin(ang) * 0.4,
        );
      }
    }
    builder.grid(first, cRings, cSides);
    const cTop = builder.vertex(cx, 0.048, cz, barkColor(i * 3.1, 4, 0.82), 0.5, 0.5);
    builder.fan(cTop, first + (cRings - 1) * cSides, cSides, true);
  }
  return builder.build();
}

const LOG_PRESETS = Object.freeze({
  split: {
    curveZ: 0.075, baseHeight: 0.34, dropTip: 0.08, troughPos: 0.56,
    footMode: 'snapped', tipMode: 'splintered', blazeSide: 1, phase: 0.4,
  },
  uprooted: {
    curveZ: -0.065, baseHeight: 0.44, dropTip: 0.22, troughPos: 0.72,
    footMode: 'rootPlate', tipMode: 'broken', blazeSide: -1, phase: 1.8,
  },
  nurse: {
    curveZ: 0.085, baseHeight: 0.22, dropTip: 0.05, troughPos: 0.48,
    footMode: 'rotEnd', tipMode: 'rotEnd', blazeSide: 0, phase: 3.1,
  },
});

/**
 * Fallen trunk with varied archetypes (`split`, `uprooted`, `nurse`), irregular
 * bark-loss troughs, localized rot pockets, root plates, and terrain embedding.
 */
export function createFallenLogGeometry({ length = 3.6, radius = 0.24, variant = 'split' } = {}) {
  const preset = LOG_PRESETS[variant] ?? LOG_PRESETS.split;
  const builder = new MeshBuilder();
  const sides = 16;
  const rings = 20;
  const half = length / 2;
  const ringCentre = (t) => [
    -half + t * length,
    radius * preset.baseHeight + Math.sin(t * Math.PI * 0.85) * 0.035 - t * preset.dropTip * radius
      - ((1 - Math.sin(t * Math.PI)) * 0.03),
    Math.sin(t * Math.PI * 0.95) * preset.curveZ + Math.sin(t * Math.PI * 2.1 + preset.phase) * 0.022,
  ];

  for (let ring = 0; ring < rings; ring += 1) {
    const t = ring / (rings - 1);
    const [cx, cy, cz] = ringCentre(t);
    const rootFlare = (1 - smoothstep(0, 0.34, t)) * (preset.footMode === 'rootPlate' ? 1.45 : 1.0);
    const swell = Math.exp(-((t - 0.28) ** 2) / 0.015) * 0.1 + Math.exp(-((t - 0.68) ** 2) / 0.012) * 0.08;
    const waist = 1 - Math.exp(-((t - 0.46) ** 2) / 0.025) * 0.08;
    const baseReach = radius * (1.10 - 0.44 * t) * waist * (1 + 0.06 * Math.sin(t * 9 + preset.phase) + swell);

    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const up = Math.sin(angle);
      const cosA = Math.cos(angle);
      const twist = angle - t * 0.8;
      const asym = 1 + 0.08 * Math.cos(twist * 5 + t * 3 + preset.phase)
        + 0.05 * Math.sin(twist * 3 - t * 4.8)
        + (mottle(t * 13 + preset.phase, angle * 2.5) - 0.5) * 0.14;
      const buttress = 1 + rootFlare * (0.18 + 0.40 * Math.max(0, Math.cos(angle * 4 + preset.phase)));
      const groundFlank = Math.exp(-((up + 0.45) ** 2) / 0.15);
      const apron = 1 + groundFlank * (0.15 + 0.18 * mottle(t * 11 + preset.phase, cosA * 3.1));

      // Localized bark-loss trough & rot pocket on the upper flank.
      const inTrough = Math.exp(-((t - preset.troughPos) ** 2) / 0.028)
        * Math.max(0, up * 0.7 + cosA * preset.blazeSide * 0.65);
      const troughDent = 1 - inTrough * 0.18;
      const reach = baseReach * asym * buttress * apron * troughDent;

      const tipJag = t === 1
        ? (preset.tipMode === 'splintered'
          ? (0.11 * Math.max(0, Math.sin(angle * 2 + 0.6)) + 0.05 * Math.cos(angle * 5))
          : 0.03 * Math.sin(angle * 3 + preset.phase))
        : 0;
      const footJag = t === 0 ? (-0.03 * Math.sin(angle * 3 + preset.phase)) : 0;

      const moss = smoothstep(0.46, 0.84, up * 0.48 + mottle(t * 7.5 + preset.phase, angle * 3.1) * 0.72)
        * (variant === 'nurse' ? 0.82 : 0.58);
      const exposed = inTrough > 0.24 ? smoothstep(0.24, 0.55, inTrough) * 0.9 : 0;
      const rot = (variant === 'nurse' && inTrough > 0.45) ? 0.75 : (inTrough > 0.58 ? 0.65 : 0);

      builder.vertex(
        cx + tipJag + footJag,
        cy + up * reach - (up < -0.5 ? 0.03 : 0),
        cz + cosA * reach,
        barkColor(t * 10 + preset.phase, angle * 3, moss, exposed, rot),
        (side / sides) * 1.5,
        t * length,
      );
    }
  }
  builder.grid(0, rings, sides);

  const foot = ringCentre(0);
  builder.endGrain(0, sides, [foot[0] - 0.04, foot[1], foot[2]], false, {
    cupDepth: 0.015, rotCenter: preset.footMode === 'rotEnd' ? 0.9 : 0.45, jagX: 0.02,
  });
  const tip = ringCentre(1);
  builder.endGrain((rings - 1) * sides, sides, [tip[0] + 0.12, tip[1] + 0.005, tip[2]], true, {
    cupDepth: preset.tipMode === 'splintered' ? -0.02 : 0.018,
    rotCenter: preset.tipMode === 'rotEnd' ? 0.95 : 0.35,
    jagX: 0.02,
  });

  // Crooked broken limb & empty socket collar.
  const stubAt = (tPos, waypoints, radii, seed, exposed = 0.5) => {
    const [bx, by, bz] = ringCentre(tPos);
    builder.curvedLimb(
      waypoints.map(([wx, wy, wz]) => [bx + wx, by + radius * 0.22 + wy, bz + wz]),
      radii, 6, { seed, capTip: true, rotTip: exposed < 0.3, exposed },
    );
  };
  if (variant === 'split') {
    stubAt(0.32, [[0, 0, -0.04], [0.07, 0.10, -0.14], [0.16, 0.18, -0.22]], [0.075, 0.052, 0.036], 1.2, 0.8);
    stubAt(0.70, [[0, 0, 0.04], [0.08, 0.09, 0.10], [0.15, 0.14, 0.15]], [0.068, 0.045, 0.028], 3.7, 0.2);
  } else if (variant === 'uprooted') {
    stubAt(0.55, [[0, 0, 0.04], [0.11, 0.15, 0.13], [0.24, 0.25, 0.21]], [0.082, 0.055, 0.035], 2.4, 0.75);
    stubAt(0.82, [[0, 0, -0.03], [0.09, 0.08, -0.10], [0.18, 0.12, -0.18]], [0.054, 0.038, 0.022], 4.8, 0.6);
  } else {
    stubAt(0.38, [[0, 0, 0.04], [0.05, 0.06, 0.08]], [0.075, 0.045], 6.1, 0.1);
  }

  // Asymmetric foot root claws (extended into an upturned root plate on `uprooted`).
  const [fx, fy, fz] = ringCentre(0.05);
  const rootClaws = variant === 'uprooted'
    ? [
      [[fx + 0.08, fy - 0.01, fz + 0.08], [fx - 0.08, fy - 0.08, fz + 0.24], [fx - 0.24, -0.09, fz + 0.38]],
      [[fx + 0.08, fy + 0.05, fz - 0.07], [fx - 0.06, fy + 0.22, fz - 0.22], [fx - 0.18, fy + 0.34, fz - 0.32]],
      [[fx + 0.06, fy + 0.08, fz + 0.04], [fx - 0.08, fy + 0.28, fz + 0.16], [fx - 0.16, fy + 0.42, fz + 0.24]],
      [[fx + 0.07, fy - 0.03, fz - 0.06], [fx - 0.10, fy - 0.08, fz - 0.24], [fx - 0.26, -0.10, fz - 0.38]],
    ]
    : [
      [[fx + 0.08, fy - 0.02, fz + 0.08], [fx - 0.09, fy - 0.07, fz + 0.24], [fx - 0.24, -0.09, fz + 0.36]],
      [[fx + 0.08, fy - 0.02, fz - 0.08], [fx - 0.08, fy - 0.07, fz - 0.23], [fx - 0.22, -0.09, fz - 0.35]],
    ];
  rootClaws.forEach((pts, idx) => {
    builder.curvedLimb(pts, [0.095, 0.062, 0.03], 6, { seed: 7 + idx * 1.9, capTip: true, moss: 0.45 });
  });

  return builder.build();
}

/** A forked, curved dead branch resting on the ground with bark taper and end grain. */
export function createFallenBranchGeometry({ length = 2.2, radius = 0.045 } = {}) {
  const builder = new MeshBuilder();
  const limb = (from, to, startRadius, { rows = 9, sides = 8, capEnds = true, arch = 0.03 } = {}) => {
    const first = builder.positions.length / 3;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const step = [dx, dy, dz];
    const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
    for (let ring = 0; ring < rows; ring += 1) {
      const t = ring / (rows - 1);
      const reach = startRadius * (1 - t * 0.68);
      const kinkZ = Math.sin(t * Math.PI * 1.5 + from[0] * 1.7) * 0.065;
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
      const invLen = 0.025 / len;
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
  limb([-half, 0.045, -0.02], [half, 0.028, 0.12], radius, { rows: 9, sides: 8, capEnds: true, arch: 0.032 });
  limb([-half * 0.12, 0.05, 0.03], [half * 0.52, 0.12, 0.48], radius * 0.62, { rows: 6, sides: 6, capEnds: false, arch: 0.02 });
  limb([half * 0.22, 0.045, 0.07], [half * 0.74, 0.085, -0.26], radius * 0.46, { rows: 5, sides: 6, capEnds: false, arch: 0.015 });
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

/** Multi-hummock cluster of overlapping rounded moss cushions that tuck into soil without conical peaks. */
export function createMossMoundGeometry({ radius = 0.5, height = 0.18 } = {}) {
  const builder = new MeshBuilder();
  const hummock = (cx, cz, rScale, hScale, sides, rings, phase) => {
    const first = builder.positions.length / 3;
    const baseR = radius * rScale;
    const peakH = height * hScale;
    for (let ring = 0; ring < rings; ring += 1) {
      const t = ring / (rings - 1);
      const profileR = Math.cos(t * Math.PI * 0.44);
      const profileY = Math.sin(t * Math.PI * 0.5);
      for (let side = 0; side < sides; side += 1) {
        const angle = (side / sides) * Math.PI * 2;
        const lobe = 1
          + 0.14 * Math.sin(angle * 3 + phase)
          + 0.09 * Math.sin(angle * 5 - phase * 0.7)
          + 0.05 * Math.cos(angle * 7 + phase * 1.3);
        const pillowRipple = 1 + 0.08 * mottle(angle * 2.5 + phase, t * 4);
        const reach = baseR * lobe * profileR;
        const x = cx + Math.cos(angle) * reach;
        const z = cz + Math.sin(angle) * reach;
        const y = -0.05 + profileY * (peakH + 0.045) * pillowRipple;
        const mixT = Math.min(1, mottle(angle * 3 + phase, t * 5) * (0.35 + t * 0.65));
        SCRATCH.copy(MOSS).lerp(MOSS_LIGHT, mixT);
        builder.vertex(x, y, z, SCRATCH, 0.5 + (x / (radius * 1.6)), 0.5 + (z / (radius * 1.6)));
      }
    }
    builder.grid(first, rings, sides);
    const top = builder.vertex(cx, peakH, cz, MOSS_LIGHT, 0.5 + (cx / (radius * 1.6)), 0.5 + (cz / (radius * 1.6)));
    builder.fan(top, first + (rings - 1) * sides, sides, true);
  };

  hummock(0, 0, 0.74, 1.0, 14, 5, 0.4);
  hummock(-radius * 0.52, radius * 0.30, 0.48, 0.72, 12, 4, 2.1);
  hummock(radius * 0.48, -radius * 0.34, 0.44, 0.64, 10, 4, 4.0);
  hummock(radius * 0.24, radius * 0.50, 0.36, 0.52, 10, 4, 5.4);
  return builder.build();
}

/** Cluster of woodland fungi (stems + domed/wavy caps) suited to damp logs, tree bases, and shade. */
export function createFungiClusterGeometry({ radius = 0.22, count = 5, seed = 0x6675 } = {}) {
  const builder = new MeshBuilder();
  const random = createRandom(seed);
  const stemColor = new THREE.Color('#cfc3a8');
  const capTones = [
    new THREE.Color('#b6783c'),
    new THREE.Color('#8e532b'),
    new THREE.Color('#c89c58'),
    new THREE.Color('#774426'),
  ];
  const stemSides = 5;
  const capSides = 7;

  for (let m = 0; m < count; m += 1) {
    const angle = (m / count) * Math.PI * 2 + random() * 0.8;
    const spread = m === 0 ? 0.02 : radius * (0.32 + random() * 0.55);
    const bx = Math.cos(angle) * spread;
    const bz = Math.sin(angle) * spread;
    const stemH = 0.055 + random() * 0.075;
    const capR = 0.032 + random() * 0.038;
    const leanX = Math.cos(angle) * (0.015 + random() * 0.028);
    const leanZ = Math.sin(angle) * (0.015 + random() * 0.028);
    const capHue = capTones[m % capTones.length];

    // Stem cylinder leaning gently outward.
    const stemStart = builder.positions.length / 3;
    for (let ring = 0; ring < 3; ring += 1) {
      const t = ring / 2;
      const sr = (0.010 + (1 - t) * 0.004) * (capR / 0.05);
      const sx = bx + leanX * t;
      const sy = -0.02 + t * stemH;
      const sz = bz + leanZ * t;
      for (let side = 0; side < stemSides; side += 1) {
        const a = (side / stemSides) * Math.PI * 2;
        builder.vertex(sx + Math.cos(a) * sr, sy, sz + Math.sin(a) * sr, stemColor, side / stemSides, t * 0.5);
      }
    }
    builder.grid(stemStart, 3, stemSides);

    // Flared cap dome over the stem tip.
    const tx = bx + leanX;
    const ty = -0.02 + stemH;
    const tz = bz + leanZ;
    const capStart = builder.positions.length / 3;
    for (let ring = 0; ring < 2; ring += 1) {
      const rt = ring === 0 ? 1.0 : 0.58;
      const ry = ring === 0 ? ty - 0.005 : ty + capR * 0.34;
      const colorMix = SCRATCH.copy(capHue).multiplyScalar(ring === 0 ? 0.78 : 1.0);
      for (let side = 0; side < capSides; side += 1) {
        const a = (side / capSides) * Math.PI * 2;
        const wob = 1 + 0.12 * Math.sin(a * 3 + m * 1.7);
        builder.vertex(
          tx + Math.cos(a) * capR * rt * wob,
          ry,
          tz + Math.sin(a) * capR * rt * wob,
          colorMix,
          0.5 + Math.cos(a) * 0.4 * rt,
          0.5 + Math.sin(a) * 0.4 * rt,
        );
      }
    }
    builder.grid(capStart, 2, capSides);
    const capTop = builder.vertex(tx, ty + capR * 0.46, tz, capHue, 0.5, 0.5);
    builder.fan(capTop, capStart + capSides, capSides, true);
  }
  return builder.build();
}
