// Faces are open unless the padded source-voxel slab proves they are solid.
const AXES = ['x', 'y', 'z'];
const SURFACE_MARGIN_VOXELS = 2;

export class LocationPortalGraph {
  static build(grid, settings) {
    if (grid.open || !Number.isFinite(grid.voxel) || grid.voxel <= 0) return null;
    const stride = Math.max(1, Math.ceil(settings.portalCellMeters / grid.voxel));
    const samples = [grid.nx, grid.ny, grid.nz];
    const dimensions = samples.map(n => Math.ceil((n - 1) / stride));
    const count = dimensions.reduce((a, b) => a * b, 1);
    if (!Number.isSafeInteger(count) || count < 1 || count > settings.portalMaxCells || dimensions.some(n => n < 1)) return null;
    const graph = new LocationPortalGraph(grid.min, grid.voxel, stride, samples, dimensions);
    const pitches = [1, grid.sy, grid.sz];
    let reads = 0;
    function openFace(axis, cell) {
      const lo = cell.map(n => n * stride);
      const hi = lo.map((n, a) => Math.min(n + stride, samples[a] - 1));
      lo[axis] = hi[axis];
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.max(0, lo[a] - SURFACE_MARGIN_VOXELS);
        hi[a] = Math.min(samples[a] - 1, hi[a] + SURFACE_MARGIN_VOXELS);
      }
      for (let z = lo[2]; z <= hi[2]; z++) {
        for (let y = lo[1]; y <= hi[1]; y++) {
          const base = y * pitches[1] + z * pitches[2];
          for (let x = lo[0]; x <= hi[0]; x++) {
            if (++reads > settings.portalMaxSampleReads) return null;
            if (!(grid.data[base + x] < 0)) return true;
          }
        }
      }
      return false;
    }
    for (let z = 0; z < dimensions[2]; z++) {
      for (let y = 0; y < dimensions[1]; y++) {
        for (let x = 0; x < dimensions[0]; x++) {
          const cell = [x, y, z], from = graph.id(cell);
          for (let axis = 0; axis < 3; axis++) {
            if (cell[axis] + 1 >= dimensions[axis]) continue;
            const open = openFace(axis, cell);
            if (open === null) return null;
            if (!open) continue;
            const next = cell.slice();
            next[axis]++;
            const to = graph.id(next);
            const bounds = graph.bounds(cell);
            bounds.min[axis] = bounds.max[axis];
            graph.edges[from].push({ to, bounds });
            graph.edges[to].push({ to: from, bounds });
            graph.portalCount++;
          }
        }
      }
    }
    return graph;
  }

  constructor(origin, voxel, stride, samples, dimensions) {
    this.origin = AXES.map(a => origin[a]);
    this.cellSize = voxel * stride;
    this.dimensions = dimensions;
    this.max = this.origin.map((v, a) => v + (samples[a] - 1) * voxel);
    this.count = dimensions.reduce((a, b) => a * b, 1);
    this.edges = Array.from({ length: this.count }, () => []);
    this.portalCount = 0;
    this.queue = new Int32Array(this.count);
  }

  id([x, y, z]) { return x + this.dimensions[0] * (y + this.dimensions[1] * z); }

  bounds(cell) {
    const min = cell.map((n, a) => this.origin[a] + n * this.cellSize);
    return { min, max: min.map((n, a) => Math.min(n + this.cellSize, this.max[a])) };
  }

  // Closed bounds deliberately include cells on both sides of a shared face.
  cellsFor(min, max) {
    if (min.some((v, a) => !Number.isFinite(v) || !Number.isFinite(max[a]) || v > max[a]
        || v < this.origin[a] || max[a] > this.max[a])) return null;
    const lo = min.map((v, a) => Math.max(0, Math.ceil((v - this.origin[a]) / this.cellSize) - 1));
    const hi = max.map((v, a) => Math.min(this.dimensions[a] - 1, Math.floor((v - this.origin[a]) / this.cellSize)));
    const ids = [];
    for (let z = lo[2]; z <= hi[2]; z++) {
      for (let y = lo[1]; y <= hi[1]; y++) {
        for (let x = lo[0]; x <= hi[0]; x++) ids.push(this.id([x, y, z]));
      }
    }
    return ids;
  }

  reachable(seeds, result, accepts = () => true) {
    result.fill(0);
    let head = 0, tail = 0;
    for (const id of seeds) {
      if (result[id]) continue;
      result[id] = 1;
      this.queue[tail++] = id;
    }
    while (head < tail) {
      for (const edge of this.edges[this.queue[head++]]) {
        if (result[edge.to] || !accepts(edge.bounds)) continue;
        result[edge.to] = 1;
        this.queue[tail++] = edge.to;
      }
    }
    return tail;
  }
}
