import { createShapeWallSurface } from './ShapeWallSurface.js';

/** A deck follows the host curve at its floor height; rails stay vertical above it. */
export function resolveShapeBalcony(host, intent) {
  const surface = createShapeWallSurface(host), p = host.primitive;
  const bottom = Math.min(intent.bottom, p.height - 0.15);
  const width = Math.min(intent.width, surface.length * 0.45);
  const start = intent.at * surface.length - width / 2, end = start + width;
  const count = Math.max(2, Math.ceil(width / 0.2));
  const point = (u, y, depth) => {
    const position = surface.point(u, bottom, p.thickness / 2 + depth);
    position[1] += y; return position;
  };
  const inner = [], outer = [];
  for (let i = 0; i <= count; i++) {
    const u = start + width * i / count;
    inner.push(point(u, 0, 0.015)); outer.push(point(u, 0, intent.depth));
  }
  const height = Math.min(intent.height, 1.4), points = [...inner, ...outer];
  const bounds = { min: [Math.min(...points.map((v) => v[0])) - 0.08, Math.max(-0.26, p.elevation + bottom - 1.03), Math.min(...points.map((v) => v[2])) - 0.08],
    max: [Math.max(...points.map((v) => v[0])) + 0.08, p.elevation + bottom + height + 0.12, Math.max(...points.map((v) => v[2])) + 0.08] };
  return { bottom, width, start, end, height, bounds,
    footprint: [...outer, ...inner.toReversed()].map(([x, , z]) => [x, z]),
    inner, outer };
}

export function createShapeBalconySurface(host, balcony) {
  const surface = createShapeWallSurface(host), p = host.primitive;
  return (u, y, depth) => {
    const position = surface.point(u, balcony.bottom, p.thickness / 2 + depth);
    position[1] += y; return position;
  };
}
