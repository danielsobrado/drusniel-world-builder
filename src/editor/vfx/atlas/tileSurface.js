import { TILE_PADDING_PX, TILE_SIZE } from './ParticleAtlasLayout.js';

/**
 * One tile being painted: a float RGBA buffer plus helpers that turn a scalar
 * coverage field into the atlas channel convention (normal xy, detail,
 * coverage). Painters work in (u, v) ∈ [0, 1]² with v = 0 at the bottom.
 */
export function createTileSurface(size = TILE_SIZE) {
  const pixels = new Float32Array(size * size * 4);
  const coordinate = (index) => (index + 0.5) / size;
  return {
    size,
    pixels,
    coordinate,
    set(x, y, r, g, b, a) {
      const offset = (y * size + x) * 4;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = a;
    },
    clear() {
      pixels.fill(0);
      for (let offset = 0; offset < pixels.length; offset += 4) {
        pixels[offset] = 0.5;
        pixels[offset + 1] = 0.5;
      }
    },
  };
}

/** Samples `fn(u, v)` over the tile into a fresh Float32Array grid. */
export function sampleGrid(size, fn) {
  const grid = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      grid[y * size + x] = fn((x + 0.5) / size, v, x, y);
    }
  }
  return grid;
}

function gridAt(grid, size, x, y) {
  const cx = x < 0 ? 0 : x >= size ? size - 1 : x;
  const cy = y < 0 ? 0 : y >= size ? size - 1 : y;
  return grid[cy * size + cx];
}

/** Fades coverage to zero inside the padding band so mips stay clean. */
function paddingMask(x, y, size) {
  const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
  if (edge >= TILE_PADDING_PX + 1) return 1;
  return Math.max(0, (edge - TILE_PADDING_PX + 1) / 2);
}

/**
 * Writes coverage, detail and a normal into the surface.
 *
 * The normal blends a spherical bulge (the billboard reads as a ball of
 * smoke) with the coverage gradient (billows read as lumps).
 *
 * @param {object} surface
 * @param {Float32Array} coverage
 * @param {Float32Array | null} detail
 * @param {{ bulge?: number, bump?: number, normals?: Float32Array | null }} options
 */
export function writeShadedTile(surface, coverage, detail, options = {}) {
  const { size } = surface;
  const bulge = options.bulge ?? 0;
  const bump = options.bump ?? 0;
  const normals = options.normals ?? null;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const alpha = Math.min(1, Math.max(0, coverage[index])) * paddingMask(x, y, size);
      let nx = 0;
      let ny = 0;
      if (normals) {
        nx = normals[index * 2];
        ny = normals[index * 2 + 1];
      } else {
        const u = (x + 0.5) / size - 0.5;
        const v = (y + 0.5) / size - 0.5;
        const gx = gridAt(coverage, size, x + 1, y) - gridAt(coverage, size, x - 1, y);
        const gy = gridAt(coverage, size, x, y + 1) - gridAt(coverage, size, x, y - 1);
        nx = u * 2 * bulge - gx * bump;
        ny = v * 2 * bulge - gy * bump;
      }
      const length = Math.hypot(nx, ny);
      if (length > 0.97) {
        nx *= 0.97 / length;
        ny *= 0.97 / length;
      }
      const d = detail ? Math.min(1, Math.max(0, detail[index])) : alpha;
      surface.set(x, y, nx * 0.5 + 0.5, ny * 0.5 + 0.5, d, alpha);
    }
  }
}

/** Distance from (u, v) to the tile centre, scaled so 1 is the usable edge. */
export function radialDistance(u, v) {
  return Math.hypot(u - 0.5, v - 0.5) / 0.46;
}

export function gaussian(value, width) {
  return Math.exp(-(value * value) / (width * width));
}

export function saturate(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smooth(edge0, edge1, value) {
  const t = saturate((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
