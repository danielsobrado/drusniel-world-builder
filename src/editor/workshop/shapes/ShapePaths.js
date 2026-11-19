import { CurvePath } from '../curves/CurvePath.js';
import { createShapeCurveSampler } from './ShapeCurveSampler.js';
import {
  curveSegmentLength,
  evaluateCurveSegment,
} from '../curves/CurveSegment.js';
import { WORKSHOP_GEOMETRY_TOLERANCE as tolerance } from '../curves/GeometryTolerancePolicy.js';

function pathId(id) {
  if (id.length <= 59) return `${id}-path`;
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${id.slice(0, 50)}-${(hash >>> 0).toString(16).padStart(8, '0')}-path`;
}

/** Intent-to-curve adapters. Segment and point ids depend on roles, never sampling density. */
export function roundedFootprint(id, width, depth, radius) {
  const x = width / 2,
    z = depth / 2;
  const r = Math.min(radius, x * 0.98, z * 0.98);
  const positions =
    r <= tolerance.length
      ? [
          [-x, -z],
          [x, -z],
          [x, z],
          [-x, z],
        ]
      : [
          [-x + r, -z],
          [x - r, -z],
          [x, -z + r],
          [x, z - r],
          [x - r, z],
          [-x + r, z],
          [-x, z - r],
          [-x, -z + r],
        ];
  const centers = [
    [x - r, -z + r],
    [x - r, z - r],
    [-x + r, z - r],
    [-x + r, -z + r],
  ];
  return new CurvePath({
    id: pathId(id),
    closed: true,
    points: positions.map((position, index) => ({
      id: `p-${index}`,
      position,
    })),
    segments: positions.map((_, index) => ({
      id: `edge-${index}`,
      kind: r > tolerance.length && index % 2 === 1 ? 'arc' : 'line',
      startId: `p-${index}`,
      endId: `p-${(index + 1) % positions.length}`,
      ...(r > tolerance.length && index % 2 === 1 ? { center: centers[(index - 1) / 2] } : {}),
    })),
  });
}

export function polygonFootprint(id, width, depth, sides = 8, radius = 0) {
  const count = Math.max(3, Math.min(64, Math.round(sides)));
  const start = -Math.PI / 2 - Math.PI / count;
  const raw = Array.from({ length: count }, (_, index) => {
    const angle = start + (index * Math.PI * 2) / count;
    return [Math.cos(angle), Math.sin(angle)];
  });
  const maxX = Math.max(...raw.map(([x]) => Math.abs(x))) || 1;
  const maxZ = Math.max(...raw.map(([, z]) => Math.abs(z))) || 1;
  const vertices = raw.map(([x, z]) => [(x / maxX) * (width / 2), (z / maxZ) * (depth / 2)]);
  if (radius <= tolerance.length) {
    return new CurvePath({
      id: pathId(id),
      closed: true,
      points: vertices.map((position, index) => ({ id: `p-${index}`, position })),
      segments: vertices.map((_, index) => ({
        id: `edge-${index}`,
        kind: 'line',
        startId: `p-${index}`,
        endId: `p-${(index + 1) % count}`,
      })),
    });
  }
  const points = [];
  const segments = [];
  for (let i = 0; i < count; i++) {
    const prev = vertices[(i - 1 + count) % count];
    const curr = vertices[i];
    const next = vertices[(i + 1) % count];
    const ax = prev[0] - curr[0], az = prev[1] - curr[1], lenA = Math.hypot(ax, az) || 1;
    const bx = next[0] - curr[0], bz = next[1] - curr[1], lenB = Math.hypot(bx, bz) || 1;
    const ua = [ax / lenA, az / lenA], ub = [bx / lenB, bz / lenB];
    const dot = Math.max(-0.99, Math.min(0.99, ua[0] * ub[0] + ua[1] * ub[1]));
    const halfAngle = Math.acos(dot) / 2;
    const tanHalf = Math.max(0.15, Math.tan(halfAngle));
    const trim = Math.min(radius / tanHalf, lenA * 0.42, lenB * 0.42);
    const inPt = [curr[0] + ua[0] * trim, curr[1] + ua[1] * trim];
    const outPt = [curr[0] + ub[0] * trim, curr[1] + ub[1] * trim];
    points.push({ id: `p-${i}-in`, position: inPt }, { id: `p-${i}-out`, position: outPt });
    segments.push({
      id: `corner-${i}`,
      kind: 'quadratic',
      startId: `p-${i}-in`,
      endId: `p-${i}-out`,
      control: curr,
    });
    segments.push({
      id: `edge-${i}`,
      kind: 'line',
      startId: `p-${i}-out`,
      endId: `p-${(i + 1) % count}-in`,
    });
  }
  return new CurvePath({ id: pathId(id), closed: true, points, segments });
}

export function ovalFootprint(id, width, depth) {
  // Quadratic arcs keep ellipses in the existing curve vocabulary.
  const x = width / 2,
    z = depth / 2;
  const positions = [
    [x, 0],
    [0, z],
    [-x, 0],
    [0, -z],
  ];
  const controls = [
    [x, z],
    [-x, z],
    [-x, -z],
    [x, -z],
  ];
  return new CurvePath({
    id: pathId(id),
    closed: true,
    points: positions.map((position, index) => ({
      id: `p-${index}`,
      position,
    })),
    segments: positions.map((_, index) => ({
      id: `edge-${index}`,
      kind: 'quadratic',
      startId: `p-${index}`,
      endId: `p-${(index + 1) % 4}`,
      control: controls[index],
    })),
  });
}

export function arcWallPath(id, length, bend) {
  return new CurvePath({
    id: pathId(id),
    closed: false,
    points: [
      { id: 'p-start', position: [-length / 2, 0] },
      { id: 'p-end', position: [length / 2, 0] },
    ],
    segments: [
      {
        id: 'edge-main',
        kind: 'quadratic',
        startId: 'p-start',
        endId: 'p-end',
        control: [0, bend],
      },
    ],
  });
}

export function sampleShapePath(pathInput, spacing = 0.25) {
  const path = new CurvePath(pathInput);
  const sampler = createShapeCurveSampler(path);
  const samples = [];
  let offset = 0;
  for (const segment of path.listSegments()) {
    const length = curveSegmentLength(segment);
    const count = Math.max(1, Math.ceil(length / spacing));
    for (let index = 0; index < count; index++) {
      const t = index / count;
      const evaluated = sampler.segmentPoint(segment.id, length * t);
      samples.push({
        ...evaluated,
        distance: offset + length * t,
        segmentId: segment.id,
      });
    }
    offset += length;
  }
  if (!path.closed) {
    const segment = path.listSegments().at(-1);
    samples.push({
      ...evaluateCurveSegment(segment, 1),
      distance: offset,
      segmentId: segment.id,
    });
  }
  return { path: path.toJSON(), samples, length: offset, closed: path.closed };
}

export function placeShapePoint(primitive, point, scale = 1) {
  const angle = (primitive.rotation * Math.PI) / 180;
  const x = point[0] * scale,
    z = point[1] * scale;
  return [
    primitive.position[0] + x * Math.cos(angle) - z * Math.sin(angle),
    primitive.position[1] + x * Math.sin(angle) + z * Math.cos(angle),
  ];
}

export function shapeBounds(points, padding = 0) {
  return {
    min: [
      Math.min(...points.map((p) => p[0])) - padding,
      Math.min(...points.map((p) => p[1])) - padding,
    ],
    max: [
      Math.max(...points.map((p) => p[0])) + padding,
      Math.max(...points.map((p) => p[1])) + padding,
    ],
  };
}
