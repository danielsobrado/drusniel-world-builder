import { CurvePath } from '../curves/CurvePath.js';
import {
  curveSegmentLength,
  curveSegmentPointAtLength,
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
  const samples = [];
  let offset = 0;
  for (const segment of path.listSegments()) {
    const length = curveSegmentLength(segment);
    const count = Math.max(1, Math.ceil(length / spacing));
    for (let index = 0; index < count; index++) {
      const t = index / count;
      const evaluated = curveSegmentPointAtLength(segment, length * t);
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
