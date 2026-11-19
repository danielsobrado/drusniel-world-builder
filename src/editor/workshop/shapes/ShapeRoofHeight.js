import { createRoofSurface } from '../village/HouseRoofSurface.js';
import { placeShapePoint } from './ShapePaths.js';

/**
 * Analytic height field for rectangular-framed roofs (`gable`, `hip`, `shed`) in world XZ.
 * Kept free of `ShapeWallSurface` so wall surfaces, opening resolution and roof surfaces share
 * one exact ceiling height without circular dependencies.
 */
export function createShapeRoofHeightField(primitive) {
  const roof = primitive.roof;
  if (!roof || !['gable', 'hip', 'shed'].includes(roof.family)) return null;
  const halfWidth = (primitive.footprint.width * primitive.taper) / 2;
  const halfDepth = (primitive.footprint.depth * primitive.taper) / 2;
  const depthAxis = roof.axis === 'depth';
  const alongHalf = depthAxis ? halfDepth : halfWidth;
  const acrossHalf = depthAxis ? halfWidth : halfDepth;
  const angle = (primitive.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const local = (x, z) => {
    const dx = x - primitive.position[0];
    const dz = z - primitive.position[1];
    return [dx * cos + dz * sin, -dx * sin + dz * cos];
  };

  if (roof.family === 'shed') {
    const highWall = -(acrossHalf + primitive.thickness / 2);
    const highEdge = highWall - 0.06;
    const lowWall = acrossHalf + primitive.thickness / 2;
    const lowEave = lowWall + roof.overhang;
    const span = Math.max(1e-4, lowEave - highWall);
    const wallRatio = (lowWall - highWall) / span;
    const blend = Math.min(1, Math.max(0, roof.sweep)) * 0.6;
    const profile = (r) => (1 - blend) * r + blend * (2 * r - r * r);
    const wallProfile = profile(wallRatio) || 1;
    const alongReach = alongHalf + primitive.thickness / 2 + roof.overhang;
    const highHeight = (along) => {
      const t = alongReach > 0 ? Math.max(-1, Math.min(1, along / alongReach)) : 0;
      return primitive.height + roof.rise - roof.sag * Math.max(0, 1 - t * t);
    };
    const heightAtLocal = (along, across) => {
      const r = Math.max(0, (across - highWall) / span);
      const high = highHeight(along);
      return high - ((high - primitive.height) * profile(r)) / wallProfile;
    };
    return {
      family: 'shed',
      depthAxis,
      alongHalf,
      acrossHalf,
      highEdge,
      alongReach,
      lowEave,
      local,
      heightAt(x, z) {
        const [lx, lz] = local(x, z);
        const along = depthAxis ? lz : lx;
        const across = depthAxis ? lx : lz;
        return primitive.elevation + heightAtLocal(along, across);
      },
      clipOutlinePoint(worldPoint) {
        const [lx, lz] = local(worldPoint[0], worldPoint[2]);
        const clipped = depthAxis ? [Math.max(highEdge, lx), lz] : [lx, Math.max(highEdge, lz)];
        const [wx, wz] = placeShapePoint(primitive, clipped);
        return [wx, worldPoint[1], wz];
      },
      shedPoint(outerPoint, t) {
        const [lx, lz] = local(outerPoint[0], outerPoint[2]);
        const outerAlong = depthAxis ? lz : lx;
        const outerAcross = Math.max(highEdge, depthAxis ? lx : lz);
        const across = highEdge + (outerAcross - highEdge) * t;
        return placeShapePoint(primitive, depthAxis ? [across, outerAlong] : [outerAlong, across]);
      },
    };
  }

  const patch = createRoofSurface({
    x0: -alongHalf - primitive.thickness / 2,
    x1: alongHalf + primitive.thickness / 2,
    z0: -acrossHalf - primitive.thickness / 2,
    z1: acrossHalf + primitive.thickness / 2,
    wallTop: primitive.height,
    rise: roof.rise,
    overhang: roof.overhang,
    sweep: roof.sweep,
    sag: roof.sag,
    hip: roof.family === 'hip' ? 1 : 0,
  });
  return {
    family: roof.family,
    depthAxis,
    alongHalf,
    acrossHalf,
    patch,
    local,
    heightAt(x, z) {
      const [lx, lz] = local(x, z);
      const along = depthAxis ? lz : lx;
      const across = depthAxis ? lx : lz;
      return primitive.elevation + patch.height(patch.ridgeDistance(along, across), along);
    },
  };
}
