/**
 * Pure tileable spherical-cap snow grain baker (ported from Noniv/snowflow_demo's
 * `detailBake.fragment.wgsl`, MIT, Maksymilian Dendura) and channel-packing helpers
 * for CC0 snow/glacier noise maps.
 */

function fract(x) {
  return x - Math.floor(x);
}

/** Deterministic tileable 2D hash matching Snowflow's `hash22` wrap semantics. */
export function hashTile22(ix, iy, period) {
  const wx = ((ix % period) + period) % period;
  const wy = ((iy % period) + period) % period;
  let p3x = fract(wx * 0.1031);
  let p3y = fract(wy * 0.1030);
  let p3z = fract(wx * 0.0973);
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d;
  p3y += d;
  p3z += d;
  return [fract((p3x + p3y) * p3z), fract((p3x + p3z) * p3y)];
}

/**
 * Packed spherical-cap snow grain octave at normalized UV (u, v) in [0, 1).
 * Returns [height, cavity].
 */
export function sphericalGrainOctave(u, v, cells) {
  const gpx = u * cells;
  const gpy = v * cells;
  const gix = Math.floor(gpx);
  const giy = Math.floor(gpy);
  let h = 0;
  let cav = 1;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const idx = gix + dx;
      const idy = giy + dy;
      const [rx, ry] = hashTile22(idx, idy, cells);
      const [r2x, r2y] = hashTile22(idx + 37, idy + 91, cells);
      const cx = idx + 0.25 + rx * 0.5;
      const cy = idy + 0.25 + ry * 0.5;
      const radius = 0.30 + r2x * 0.26;
      const d = Math.hypot(gpx - cx, gpy - cy) / radius;
      if (d < 1) {
        const dome = Math.sqrt(Math.max(0, 1 - d * d)) * (0.55 + r2y * 0.45);
        if (dome > h) h = dome;
        const c = 1 - (1 - d) * 0.5;
        if (c < cav) cav = c;
      }
    }
  }
  return [h, cav];
}

/**
 * Generates Snowflow's 3-octave tileable spherical-cap snow grain texture:
 * RGBA Uint8Array (R, G tangent-space normal XY, B cavity AO, A normalized height).
 */
export function buildSnowGrainRnmPixels(size, grainScale = 0.0115) {
  const heights = new Float32Array(size * size);
  const cavities = new Float32Array(size * size);
  let minH = Infinity;
  let maxH = -Infinity;

  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const a = sphericalGrainOctave(u, v, 26);
      const b = sphericalGrainOctave(fract(u + 0.37), fract(v + 0.11), 61);
      const c = sphericalGrainOctave(fract(u + 0.71), fract(v + 0.53), 137);
      const h = a[0] + b[0] * 0.42 + c[0] * 0.17;
      const cav = a[1] * 0.55 + b[1] * 0.30 + c[1] * 0.15;
      const idx = y * size + x;
      heights[idx] = h;
      cavities[idx] = cav;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }

  const out = new Uint8Array(size * size * 4);
  const invSpan = maxH > minH ? 1 / (maxH - minH) : 1;
  const e = 1 / size;
  const at = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const dx = (at(x + 1, y) - at(x - 1, y)) / (2 * e);
      const dy = (at(x, y + 1) - at(x, y - 1)) / (2 * e);
      const nx = -dx * grainScale;
      const ny = -dy * grainScale;
      const invLen = 1 / Math.hypot(nx, ny, 1);
      const o = idx * 4;
      out[o] = Math.round(Math.max(0, Math.min(1, nx * invLen * 0.5 + 0.5)) * 255);
      out[o + 1] = Math.round(Math.max(0, Math.min(1, ny * invLen * 0.5 + 0.5)) * 255);
      out[o + 2] = Math.round(Math.max(0, Math.min(1, cavities[idx])) * 255);
      out[o + 3] = Math.round(Math.max(0, Math.min(1, (heights[idx] - minH) * invSpan)) * 255);
    }
  }
  return out;
}

/** Stretches a greyscale Float32Array to full [0, 1] dynamic range for crisp packing. */
export function normalizeChannel(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo;
  const out = new Float32Array(values.length);
  if (!(span > 1e-6)) return out.fill(0.5);
  for (let i = 0; i < values.length; i += 1) out[i] = (values[i] - lo) / span;
  return out;
}
