import { DensityGrid } from './DensityGrid.js';
import { extractSurface } from './SurfaceNets.js';

self.addEventListener('message', ({ data }) => {
  try {
    const grid = Object.assign(Object.create(DensityGrid.prototype), data);
    const surface = extractSurface(grid);
    self.postMessage({ surface }, [surface.positions.buffer, surface.normals.buffer, surface.indices.buffer]);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
