import { createShapeWallSurface } from './ShapeWallSurface.js';
import { placeShapePoint } from './ShapePaths.js';
import { pointInShape } from './ShapeEnvelope.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';
import { shapeRoofReach } from './ShapeCrown.js';
import { createShapeRoofHeightField } from './ShapeRoofHeight.js';

const profiles = Object.freeze({
  cone: (t, p) => p.rise * (1 - t),
  bell: (t, p) => p.rise * (1 - ((1 - p.sweep * 0.8) * t + p.sweep * 0.8 * (2 * t - t * t))),
  spire: (t, p) => p.rise * (1 - t) ** (1.35 + p.sweep * 0.4),
  flat: () => 0,
});

export function createShapeRoofSurface(plan) {
  const p = plan.primitive;
  const roof = p.roof;
  const wall = createShapeWallSurface(plan);
  const field = createShapeRoofHeightField(p);
  const angle = (p.rotation * Math.PI) / 180;
  function local(x, z) {
    if (field) return field.local(x, z);
    const dx = x - p.position[0];
    const dz = z - p.position[1];
    return [
      dx * Math.cos(angle) + dz * Math.sin(angle),
      -dx * Math.sin(angle) + dz * Math.cos(angle),
    ];
  }
  const outline = plan.curve.samples.map((sample) => {
    const outer = wall.point(sample.distance, p.height - 1e-4, shapeRoofReach(p));
    return field?.family === 'shed' ? field.clipOutlinePoint(outer) : outer;
  });
  function heightAt(x, z) {
    if (field) return field.heightAt(x, z);
    const dx = x - p.position[0];
    const dz = z - p.position[1];
    let radius = Infinity;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const ax = a[0] - p.position[0];
      const az = a[2] - p.position[1];
      const ex = b[0] - a[0];
      const ez = b[2] - a[2];
      const cross = dx * ez - dz * ex;
      if (Math.abs(cross) < tolerance.length * tolerance.length) continue;
      const r = (ax * ez - az * ex) / cross;
      const edge = (ax * dz - az * dx) / cross;
      if (r > 0 && edge >= -tolerance.intersection && edge <= 1 + tolerance.intersection) {
        radius = Math.min(radius, r);
      }
    }
    const t = Number.isFinite(radius) ? Math.min(1, 1 / radius) : 0;
    return p.elevation + p.height + 0.08 + profiles[roof.family](t, roof);
  }
  function point(distance, t, lift = 0) {
    const outer = wall.point(distance, p.height - 1e-4, shapeRoofReach(p));
    let x = p.position[0] + (outer[0] - p.position[0]) * t;
    let z = p.position[1] + (outer[2] - p.position[1]) * t;
    if (roof.family === 'gable') {
      const [lx, lz] = local(outer[0], outer[2]);
      const localX = field.depthAxis ? lx * t : lx;
      const localZ = field.depthAxis ? lz : lz * t;
      x = p.position[0] + localX * Math.cos(angle) - localZ * Math.sin(angle);
      z = p.position[1] + localX * Math.sin(angle) + localZ * Math.cos(angle);
    } else if (field?.family === 'shed') {
      [x, z] = field.shedPoint(outer, t);
    }
    const y = field
      ? heightAt(x, z)
      : p.elevation + p.height + 0.08 + profiles[roof.family](t, roof);
    return [x, y + lift, z];
  }
  function normalAt(x, z) {
    const delta = 0.003;
    const dx = (heightAt(x + delta, z) - heightAt(x - delta, z)) / (2 * delta);
    const dz = (heightAt(x, z + delta) - heightAt(x, z - delta)) / (2 * delta);
    const length = Math.hypot(dx, 1, dz);
    return [-dx / length, 1 / length, -dz / length];
  }
  /**
   * Convex creases a capping row must cover: a hip roof's ridge and its four hips (or a shed's
   * high crest), clipped to the real eaves outline, as world polylines sampled every `step` m.
   */
  function ridgeLines(step = 0.2) {
    if (!field) return [];
    const eaves = outline.map((v) => [v[0], v[2]]);
    const world = (along, across) => placeShapePoint(p, field.depthAxis ? [across, along] : [along, across]);
    if (field.family === 'shed') {
      const span = field.alongReach * 2;
      const count = Math.max(2, Math.ceil(span / step));
      const line = [];
      for (let i = 0; i <= count; i++) {
        const [x, z] = world(-field.alongReach + (span * i) / count, field.highEdge + 0.04);
        if (pointInShape([x, z], eaves)) line.push([x, heightAt(x, z), z]);
      }
      return line.length > 1 ? [line] : [];
    }
    if (roof.family !== 'hip' || !field.patch) return [];
    const patch = field.patch;
    const trace = (count, at) => {
      const line = [];
      for (let i = 0; i <= count; i++) {
        const [x, z] = world(...at(i / count));
        if (!pointInShape([x, z], eaves)) break;
        line.push([x, heightAt(x, z), z]);
      }
      return line;
    };
    const lines = [];
    if (patch.ridgeHalf > step) {
      lines.push(trace(Math.ceil((patch.ridgeHalf * 2) / step), (s) => [-patch.ridgeHalf + 2 * patch.ridgeHalf * s, 0]));
    }
    const hipLength = Math.hypot(patch.hipRun, patch.eaves);
    for (const sa of [-1, 1]) {
      for (const sc of [-1, 1]) {
        lines.push(trace(Math.ceil(hipLength / step), (r) => [sa * (patch.ridgeHalf + r * patch.hipRun), sc * r * patch.eaves]));
      }
    }
    return lines.filter((line) => line.length > 1);
  }
  /** Sloped verge/rake polylines on gable and shed ends, clipped to the real eaves outline. */
  function vergeLines(step = 0.22) {
    if (!field || !['gable', 'shed'].includes(roof.family)) return [];
    const eaves = outline.map((v) => [v[0], v[2]]);
    const world = (along, across) => placeShapePoint(p, field.depthAxis ? [across, along] : [along, across]);
    const alongEdge = field.alongHalf + p.thickness / 2 + Math.min(0.12, roof.overhang * 0.28);
    const minAcross = roof.family === 'shed'
      ? field.highEdge + 0.04
      : -(field.acrossHalf + p.thickness / 2 + roof.overhang * 0.88);
    const maxAcross = field.acrossHalf + p.thickness / 2 + roof.overhang * 0.88;
    const span = maxAcross - minAcross;
    const rawCount = Math.max(2, Math.ceil(span / step));
    const count = roof.family === 'gable' && rawCount % 2 === 1 ? rawCount + 1 : rawCount;
    const lines = [];
    for (const sign of [-1, 1]) {
      const line = [];
      for (let i = 0; i <= count; i++) {
        const [x, z] = world(sign * alongEdge, minAcross + (span * i) / count);
        if (pointInShape([x, z], eaves)) line.push([x, heightAt(x, z), z]);
      }
      if (line.length > 1) lines.push(line);
    }
    return lines;
  }
  return { point, heightAt, normalAt, uvAt: (x, z) => local(x, z), wall, outline, ridgeLines, vergeLines };
}
