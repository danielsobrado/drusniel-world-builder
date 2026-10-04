// Ported from drusniel-gods-end/src/world/village/houseTextureData.js.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value-noise fbm: each octave is a random lattice of `period` cells
// that wraps, and the period doubles per octave, so every octave wraps at the
// texture edge. u, v in [0, 1) is one texture repeat.
export function makeFbm(random, basePeriod, octaves) {
  const layers = [], periods = [];
  for (let o = 0; o < octaves; o += 1) {
    const period = basePeriod << o;
    const values = new Float32Array(period * period);
    for (let i = 0; i < values.length; i += 1) values[i] = random();
    periods.push(period);
    layers.push(values);
  }
  let norm = 0;
  for (let o = 0, a = 0.5; o < octaves; o += 1, a *= 0.5) norm += a;
  return (u, v) => {
    let sum = 0, amplitude = 0.5 / norm;
    for (let o = 0; o < octaves; o += 1) {
      const period = periods[o], values = layers[o];
      const x = u * period, y = v * period;
      const xi = x | 0, yi = y | 0;
      const fx = x - xi, fy = y - yi;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const x0 = xi % period, y0 = yi % period;
      const x1 = x0 + 1 === period ? 0 : x0 + 1;
      const r0 = y0 * period, r1 = (y0 + 1 === period ? 0 : y0 + 1) * period;
      const a = values[r0 + x0], b = values[r0 + x1], c = values[r1 + x0], d = values[r1 + x1];
      sum += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amplitude;
      amplitude *= 0.5;
    }
    return sum;
  };
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const wrap = (x) => x - Math.floor(x);

/**
 * Runs `fn(u, v, out)` for every texel; fn writes r, g, b (0-1 albedo) and
 * height into `out`. Returns RGBA albedo and a tangent-space normal map
 * whose relief is `strength` texels of height per unit height step.
 */
export function render(size, strength, fn) {
  const color = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const out = new Float32Array(4);
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      fn((x + 0.5) / size, v, out);
      const i = y * size + x;
      color[i * 4] = clamp01(out[0]) * 255 + 0.5;
      color[i * 4 + 1] = clamp01(out[1]) * 255 + 0.5;
      color[i * 4 + 2] = clamp01(out[2]) * 255 + 0.5;
      color[i * 4 + 3] = 255;
      height[i] = out[3];
    }
  }
  const normal = new Uint8Array(size * size * 4);
  const mask = size - 1;
  for (let y = 0; y < size; y += 1) {
    const up = ((y + 1) & mask) * size, down = ((y - 1) & mask) * size, row = y * size;
    for (let x = 0; x < size; x += 1) {
      const dx = (height[row + ((x + 1) & mask)] - height[row + ((x - 1) & mask)]) * strength;
      const dy = (height[up + x] - height[down + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 4);
      const i = (row + x) * 4;
      normal[i] = (-dx * inv * 0.5 + 0.5) * 255 + 0.5;
      normal[i + 1] = (-dy * inv * 0.5 + 0.5) * 255 + 0.5;
      normal[i + 2] = (inv + 0.5) * 255 + 0.5;
      normal[i + 3] = 255;
    }
  }
  return { size, color, normal };
}

// Stone courses: rows of varying height, blocks of varying width with an
// offset per row. The course and block under each texel row/column come from
// lookup tables, and one result object is reused.
export function makeCourses(random, rows, minWidth, maxWidth, resolution = 1024) {
  const heights = [];
  for (let r = 0; r < rows; r += 1) heights.push(0.7 + random() * 0.6);
  const total = heights.reduce((a, b) => a + b, 0);
  const courses = [];
  let y = 0;
  for (let r = 0; r < rows; r += 1) {
    const h = heights[r] / total;
    const joints = [];
    let x = random();
    const start = x;
    while (x < start + 1 - minWidth * 1.2) {
      joints.push(wrap(x));
      x += minWidth + random() * (maxWidth - minWidth);
    }
    joints.sort((a, b) => a - b);
    const tints = joints.map(() => random());
    // Block index under each texel column (the block starting at or left of it).
    const blockAt = new Int16Array(resolution);
    for (let i = 0; i < resolution; i += 1) {
      const u = (i + 0.5) / resolution;
      let index = joints.length - 1;
      for (let j = 0; j < joints.length; j += 1) if (u < joints[j]) { index = j - 1; break; }
      blockAt[i] = index < 0 ? joints.length - 1 : index;
    }
    courses.push({ y0: y, y1: y + h, joints, tints, blockAt });
    y += h;
  }
  const courseAt = new Int16Array(resolution);
  for (let i = 0; i < resolution; i += 1) {
    const v = (i + 0.5) / resolution;
    let c = rows - 1;
    for (let r = 0; r < rows; r += 1) if (v < courses[r].y1) { c = r; break; }
    courseAt[i] = c;
  }
  const cell = { edge: 0, tint: 0, du: 0, dv: 0 };
  return (u, v) => {
    const course = courses[courseAt[Math.min(resolution - 1, (v * resolution) | 0)]];
    const { joints, tints } = course;
    const index = course.blockAt[Math.min(resolution - 1, (u * resolution) | 0)];
    const left = joints[index];
    const right = index + 1 < joints.length ? joints[index + 1] : joints[0] + 1;
    const du = wrap(u - left);
    const width = right - left;
    // Distance to the nearest joint, in texture units.
    cell.edge = Math.min(du, width - du, v - course.y0, course.y1 - v);
    cell.tint = tints[index];
    cell.du = du / width;
    cell.dv = (v - course.y0) / (course.y1 - course.y0);
    return cell;
  };
}

