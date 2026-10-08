import { createRoofSurface } from '../village/HouseRoofSurface.js';
import { createShapeWallSurface } from './ShapeWallSurface.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';

const profiles = Object.freeze({
  cone: (t, p) => p.rise * (1 - t),
  bell: (t, p) => p.rise * (1 - ((1 - p.sweep * 0.8) * t + p.sweep * 0.8 * (2 * t - t * t))),
  spire: (t, p) => p.rise * (1 - t) ** (1.35 + p.sweep * 0.4),
  flat: () => 0,
});

export function createShapeRoofSurface(plan) {
  const p = plan.primitive,
    roof = p.roof,
    wall = createShapeWallSurface(plan);
  const halfWidth = (p.footprint.width * p.taper) / 2,
    halfDepth = (p.footprint.depth * p.taper) / 2;
  const patch = ['gable', 'hip'].includes(roof.family)
    ? createRoofSurface({
        x0: -halfWidth - p.thickness / 2,
        x1: halfWidth + p.thickness / 2,
        z0: -halfDepth - p.thickness / 2,
        z1: halfDepth + p.thickness / 2,
        wallTop: p.height,
        rise: roof.rise,
        overhang: roof.overhang,
        sweep: roof.sweep,
        sag: roof.sag,
        hip: roof.family === 'hip' ? 1 : 0,
      })
    : null;
  const angle = (p.rotation * Math.PI) / 180;
  const outline = plan.curve.samples.map((sample) =>
    wall.point(sample.distance, p.height, p.thickness / 2 + roof.overhang),
  );
  function local(x, z) {
    const dx = x - p.position[0],
      dz = z - p.position[1];
    return [
      dx * Math.cos(angle) + dz * Math.sin(angle),
      -dx * Math.sin(angle) + dz * Math.cos(angle),
    ];
  }
  function heightAt(x, z) {
    const [lx, lz] = local(x, z);
    if (patch) return p.elevation + patch.height(patch.ridgeDistance(lx, lz), lx);
    const dx = x - p.position[0],
      dz = z - p.position[1];
    let radius = Infinity;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length];
      const ax = a[0] - p.position[0],
        az = a[2] - p.position[1],
        ex = b[0] - a[0],
        ez = b[2] - a[2];
      const cross = dx * ez - dz * ex;
      if (Math.abs(cross) < tolerance.length * tolerance.length) continue;
      const r = (ax * ez - az * ex) / cross,
        edge = (ax * dz - az * dx) / cross;
      if (r > 0 && edge >= -tolerance.intersection && edge <= 1 + tolerance.intersection)
        radius = Math.min(radius, r);
    }
    const t = Number.isFinite(radius) ? Math.min(1, 1 / radius) : 0;
    return p.elevation + p.height + 0.08 + profiles[roof.family](t, roof);
  }
  function point(distance, t, lift = 0) {
    const outer = wall.point(distance, p.height, p.thickness / 2 + roof.overhang);
    let x = p.position[0] + (outer[0] - p.position[0]) * t;
    let z = p.position[1] + (outer[2] - p.position[1]) * t;
    if (roof.family === 'gable') {
      const [along, across] = local(outer[0], outer[2]);
      x = p.position[0] + along * Math.cos(angle) - across * t * Math.sin(angle);
      z = p.position[1] + along * Math.sin(angle) + across * t * Math.cos(angle);
    }
    const y = patch
      ? heightAt(x, z)
      : p.elevation + p.height + 0.08 + profiles[roof.family](t, roof);
    return [x, y + lift, z];
  }
  return { point, heightAt, wall };
}
