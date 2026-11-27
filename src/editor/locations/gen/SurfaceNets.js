/**
 * Naive surface nets over a `DensityGrid`: one vertex per cell the surface
 * crosses, one quad per grid edge it cuts. Shared vertices and gradient normals
 * make junctions between openings seamless, which stitched tubes never are.
 *
 * @returns {{ positions: Float32Array, normals: Float32Array, indices: Uint32Array }}
 *   normals point into open air.
 */
export function extractSurface(grid) {
  return finish(extractSurfaceSteps(grid));
}

function finish(steps) {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

const VERTEX_BATCH = 1024;
const TRIANGLE_BATCH = 3072;

export function* extractSurfaceSteps(grid) {
  const { nx, ny, nz, sy, sz, data, voxel, min } = grid;
  const cellVertex = new Int32Array(sz * 2).fill(-1);
  const positions = [];
  const indices = [];
  const corner = new Float32Array(8);
  const offsets = [0, 1, sy, sy + 1, sz, sz + 1, sz + sy, sz + sy + 1];
  // Corner pairs joined by a cube edge; bit 0 = x, bit 1 = y, bit 2 = z.
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };

  for (let k = 0; k < nz - 1; k += 1) {
    const current = (k % 2) * sz, previous = sz - current;
    cellVertex.fill(-1, current, current + sz);
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const row = i + j * sy;
        const base = row + k * sz;
        const slot = current + row, prior = previous + row;
        let mask = 0;
        for (let c = 0; c < 8; c += 1) {
          corner[c] = data[base + offsets[c]];
          if (corner[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let px = 0, py = 0, pz = 0, crossings = 0;
        for (const [a, b] of edges) {
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
          const t = corner[a] / (corner[a] - corner[b]);
          px += (a & 1) + ((b & 1) - (a & 1)) * t;
          py += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          pz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          crossings += 1;
        }
        cellVertex[slot] = positions.length / 3;
        positions.push(min.x + (i + px / crossings) * voxel,
          min.y + (j + py / crossings) * voxel, min.z + (k + pz / crossings) * voxel);
        const solid = (mask & 1) === 1;
        // Each cut edge leaving corner 0 is shared by four cells, all already visited.
        if (j > 0 && k > 0 && solid !== (((mask >> 1) & 1) === 1)) {
          quad(cellVertex[slot], cellVertex[slot - sy], cellVertex[prior - sy], cellVertex[prior], solid);
        }
        if (i > 0 && k > 0 && solid !== (((mask >> 2) & 1) === 1)) {
          quad(cellVertex[slot], cellVertex[prior], cellVertex[prior - 1], cellVertex[slot - 1], solid);
        }
        if (i > 0 && j > 0 && solid !== (((mask >> 4) & 1) === 1)) {
          quad(cellVertex[slot], cellVertex[slot - 1], cellVertex[slot - 1 - sy], cellVertex[slot - sy], solid);
        }
      }
      yield;
    }
  }

  const count = positions.length / 3;
  const normals = new Float32Array(count * 3);
  const normal = { x: 0, y: 0, z: 0 };
  for (let v = 0; v < count; v += 1) {
    grid.gradient(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], normal);
    normals[v * 3] = normal.x; normals[v * 3 + 1] = normal.y; normals[v * 3 + 2] = normal.z;
    if ((v + 1) % VERTEX_BATCH === 0) yield;
  }
  const result = { positions: new Float32Array(positions), normals, indices: new Uint32Array(indices) };
  yield* faceTowardNormalsSteps(result);
  result.indices = yield* removeDegenerateTriangleSteps(result.positions, result.indices);
  return result;
}

/**
 * Drops zero-area or hairline sliver triangles so derivative normals (`dFdx`/`dFdy`)
 * and rasterization never emit black spikes along sharp fracture creases.
 */
export function removeDegenerateTriangles(positions, indices, minAreaSq = 1e-8) {
  return finish(removeDegenerateTriangleSteps(positions, indices, minAreaSq));
}

function* removeDegenerateTriangleSteps(positions, indices, minAreaSq = 1e-8) {
  const kept = [];
  for (let t = 0; t < indices.length; t += 3) {
    if (t > 0 && t % TRIANGLE_BATCH === 0) yield;
    const ia = indices[t], ib = indices[t + 1], ic = indices[t + 2];
    if (ia === ib || ib === ic || ic === ia) continue;
    const a = ia * 3, b = ib * 3, c = ic * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz >= minAreaSq) {
      kept.push(ia, ib, ic);
    }
  }
  return kept.length === indices.length ? indices : new Uint32Array(kept);
}

/**
 * Feature-preserving Taubin (λ/μ) surface smoothing for glacial ice volumes.
 * Eliminates visible voxel quad faceting on curved melt-tubes and pillars while
 * preserving sharp fracture edges (via neighbor-normal crease weighting) and
 * locking walkable floor Y height so navigation never drifts.
 *
 * @param {{ positions: Float32Array, normals: Float32Array, indices: Uint32Array }} surface
 * @param {import('./DensityGrid.js').DensityGrid} grid
 * @param {{ passes?: number, lambda?: number, mu?: number, creaseCos?: number }} [options]
 */
export function smoothSurfaceTaubin(surface, grid, {
  passes = 2,
  lambda = 0.42,
  mu = -0.44,
  creaseCos = 0.72,
} = {}) {
  const { positions, normals, indices } = surface;
  const count = positions.length / 3;
  const sum = new Float32Array(positions.length);
  const weight = new Float32Array(count);

  const step = (factor) => {
    sum.fill(0);
    weight.fill(0);
    for (let t = 0; t < indices.length; t += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const a = indices[t + corner];
        const b = indices[t + ((corner + 1) % 3)];
        const a3 = a * 3, b3 = b * 3;
        const align = normals[a3] * normals[b3] + normals[a3 + 1] * normals[b3 + 1] + normals[a3 + 2] * normals[b3 + 2];
        if (align < creaseCos) continue;
        const w = (align - creaseCos) / (1 - creaseCos);
        sum[a3] += (positions[b3] - positions[a3]) * w;
        sum[a3 + 1] += (positions[b3 + 1] - positions[a3 + 1]) * w;
        sum[a3 + 2] += (positions[b3 + 2] - positions[a3 + 2]) * w;
        weight[a] += w;
        sum[b3] += (positions[a3] - positions[b3]) * w;
        sum[b3 + 1] += (positions[a3 + 1] - positions[b3 + 1]) * w;
        sum[b3 + 2] += (positions[a3 + 2] - positions[b3 + 2]) * w;
        weight[b] += w;
      }
    }
    for (let v = 0; v < count; v += 1) {
      if (weight[v] <= 1e-5) continue;
      const v3 = v * 3;
      const inv = factor / weight[v];
      // Preserve walkable floor elevation and clamp step so sharp creases never fold inside-out.
      const yLock = normals[v3 + 1] > 0.72 ? 0.15 : 1;
      const maxMove = grid.voxel * 0.22;
      const dx = Math.max(-maxMove, Math.min(maxMove, sum[v3] * inv));
      const dy = Math.max(-maxMove, Math.min(maxMove, sum[v3 + 1] * inv * yLock));
      const dz = Math.max(-maxMove, Math.min(maxMove, sum[v3 + 2] * inv));
      positions[v3] += dx;
      positions[v3 + 1] += dy;
      positions[v3 + 2] += dz;
    }
  };

  for (let pass = 0; pass < passes; pass += 1) {
    step(lambda);
    step(mu);
  }

  // Re-evaluate smooth SDF gradient normals at the relaxed positions and re-verify triangle winding.
  const n = { x: 0, y: 0, z: 0 };
  for (let v = 0; v < count; v += 1) {
    const v3 = v * 3;
    grid.gradient(positions[v3], positions[v3 + 1], positions[v3 + 2], n);
    normals[v3] = n.x;
    normals[v3 + 1] = n.y;
    normals[v3 + 2] = n.z;
  }
  faceTowardNormals(surface);
  surface.indices = removeDegenerateTriangles(positions, indices);
}

/** Winds every triangle to agree with its vertices' normals. */
function faceTowardNormals(surface) { finish(faceTowardNormalsSteps(surface)); }

function* faceTowardNormalsSteps({ positions: p, normals: n, indices }) {
  for (let t = 0; t < indices.length; t += 3) {
    if (t > 0 && t % TRIANGLE_BATCH === 0) yield;
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const facing = (uy * vz - uz * vy) * (n[a] + n[b] + n[c])
      + (uz * vx - ux * vz) * (n[a + 1] + n[b + 1] + n[c + 1])
      + (ux * vy - uy * vx) * (n[a + 2] + n[b + 2] + n[c + 2]);
    if (facing < 0) { const swap = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = swap; }
  }
}

/**
 * Averages a per-vertex attribute with its mesh neighbours, in place. One
 * vertex on a flake of noise can catch a light its neighbours cannot; without
 * this it shows as a single bright triangle fan.
 */
export function smoothAttribute(indices, array, size, passes = 1) {
  return finish(smoothAttributeSteps(indices, array, size, passes));
}

export function* smoothAttributeSteps(indices, array, size, passes = 1) {
  const count = array.length / size;
  const sum = new Float32Array(array.length), weight = new Float32Array(count);
  for (let pass = 0; pass < passes; pass += 1) {
    sum.set(array);
    weight.fill(1);
    for (let t = 0; t < indices.length; t += 3) {
      if (t % TRIANGLE_BATCH === 0) yield;
      for (let corner = 0; corner < 3; corner += 1) {
        const a = indices[t + corner], b = indices[t + (corner + 1) % 3];
        for (let c = 0; c < size; c += 1) {
          sum[a * size + c] += array[b * size + c];
          sum[b * size + c] += array[a * size + c];
        }
        weight[a] += 1; weight[b] += 1;
      }
    }
    for (let v = 0; v < count; v += 1) {
      if (v % VERTEX_BATCH === 0) yield;
      for (let c = 0; c < size; c += 1) array[v * size + c] = sum[v * size + c] / weight[v];
    }
  }
}

/**
 * Splits an indexed mesh into one mesh per `cell`-metre column, so the renderer
 * can cull the parts of a large cave that are behind the camera.
 *
 * @param {{ indices: Uint32Array, attributes: Record<string, { array: Float32Array, size: number }> }} mesh
 * @returns {Array<{ indices: Uint32Array, attributes: Record<string, { array: Float32Array, size: number }> }>}
 */
export function splitByColumns(mesh, cell) {
  return splitMesh(mesh, cell, false);
}

/** Preserve every triangle and baked vertex attribute; only partition ownership. */
export function splitByCells(mesh, cell) {
  return splitMesh(mesh, cell, true);
}

function splitMesh(mesh, cell, vertical) {
  const position = mesh.attributes.position.array;
  const buckets = new Map();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t] * 3;
    const key = vertical ? `${Math.floor(position[a] / cell)},${Math.floor(position[a + 1] / cell)},${Math.floor(position[a + 2] / cell)}`
      : `${Math.floor(position[a] / cell)},${Math.floor(position[a + 2] / cell)}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, bucket = []);
    bucket.push(mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]);
  }
  const names = Object.keys(mesh.attributes);
  return [...buckets.values()].map((triangles) => {
    const remap = new Map();
    const indices = new Uint32Array(triangles.length);
    triangles.forEach((vertex, slot) => {
      if (!remap.has(vertex)) remap.set(vertex, remap.size);
      indices[slot] = remap.get(vertex);
    });
    const attributes = {};
    for (const name of names) {
      const { array, size } = mesh.attributes[name];
      const out = new Float32Array(remap.size * size);
      for (const [from, to] of remap) {
        for (let c = 0; c < size; c += 1) out[to * size + c] = array[from * size + c];
      }
      attributes[name] = { array: out, size };
    }
    return { indices, attributes };
  });
}
