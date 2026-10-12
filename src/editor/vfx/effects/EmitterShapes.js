import { sampleRange } from '../math/vfxRandom.js';

/**
 * Emitter shapes. Each writes position and velocity into a spawn params
 * object for particle `index` of `count`; `random` is the simulator's.
 *
 * Shapes are plain records so recipes read like data:
 *   { kind: 'sphere', center, radius, speed: [4, 9], up: 0.4 }
 */

const scratch = { x: 0, y: 0, z: 0 };

function basis(normal) {
  const nx = normal.x;
  const ny = normal.y;
  const nz = normal.z;
  const helperX = Math.abs(ny) < 0.95 ? 0 : 1;
  const helperY = Math.abs(ny) < 0.95 ? 1 : 0;
  let tx = helperY * nz;
  let ty = -helperX * nz;
  let tz = helperX * ny - helperY * nx;
  const length = Math.hypot(tx, ty, tz) || 1;
  tx /= length; ty /= length; tz /= length;
  return {
    tx, ty, tz,
    bx: ny * tz - nz * ty,
    by: nz * tx - nx * tz,
    bz: nx * ty - ny * tx,
  };
}

const SHAPES = {
  /** Point burst in random directions; `up` biases upward, `hemisphere` clips below. */
  sphere(shape, params, random) {
    random.direction(scratch);
    if (shape.hemisphere && scratch.y < 0) scratch.y = -scratch.y;
    scratch.y += shape.up ?? 0;
    const length = Math.hypot(scratch.x, scratch.y, scratch.z) || 1;
    const dx = scratch.x / length;
    const dy = scratch.y / length;
    const dz = scratch.z / length;
    // `shell` spawns on the surface (a breaking sphere); otherwise through the volume.
    const r = (shape.radius ?? 0) * (shape.shell ? 1 : Math.cbrt(random()));
    const speed = sampleRange(shape.speed ?? 0, random);
    params.x = shape.center.x + dx * r;
    params.y = shape.center.y + dy * r;
    params.z = shape.center.z + dz * r;
    params.vx = dx * speed;
    params.vy = dy * speed + (shape.lift ?? 0);
    params.vz = dz * speed;
  },

  /** Expanding ring in the plane of `normal` (default ground). */
  ring(shape, params, random, index, count) {
    const normal = shape.normal ?? { x: 0, y: 1, z: 0 };
    const frame = basis(normal);
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + random() * (shape.jitter ?? 0.3);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = frame.tx * cos + frame.bx * sin;
    const dy = frame.ty * cos + frame.by * sin;
    const dz = frame.tz * cos + frame.bz * sin;
    const r = sampleRange(shape.radius ?? 0, random);
    const speed = sampleRange(shape.speed ?? 0, random);
    const lift = sampleRange(shape.lift ?? 0, random);
    params.x = shape.center.x + dx * r + normal.x * (shape.height ?? 0);
    params.y = shape.center.y + dy * r + normal.y * (shape.height ?? 0);
    params.z = shape.center.z + dz * r + normal.z * (shape.height ?? 0);
    params.vx = dx * speed + normal.x * lift;
    params.vy = dy * speed + normal.y * lift;
    params.vz = dz * speed + normal.z * lift;
  },

  /** Cone from `origin` along `direction`, half-angle in radians. */
  cone(shape, params, random) {
    const direction = shape.direction;
    const frame = basis(direction);
    const angle = random() * Math.PI * 2;
    const spread = Math.tan(shape.angle ?? 0.4) * Math.sqrt(random());
    let dx = direction.x + (frame.tx * Math.cos(angle) + frame.bx * Math.sin(angle)) * spread;
    let dy = direction.y + (frame.ty * Math.cos(angle) + frame.by * Math.sin(angle)) * spread;
    let dz = direction.z + (frame.tz * Math.cos(angle) + frame.bz * Math.sin(angle)) * spread;
    const length = Math.hypot(dx, dy, dz) || 1;
    dx /= length; dy /= length; dz /= length;
    const speed = sampleRange(shape.speed ?? 0, random);
    const start = sampleRange(shape.offset ?? 0, random);
    params.x = shape.origin.x + dx * start;
    params.y = shape.origin.y + dy * start;
    params.z = shape.origin.z + dz * start;
    params.vx = dx * speed;
    params.vy = dy * speed + (shape.lift ?? 0);
    params.vz = dz * speed;
  },

  /** Points along a segment, optional jitter; velocity is up plus spread. */
  line(shape, params, random, index, count) {
    const t = shape.random === false ? (index + 0.5) / Math.max(1, count) : random();
    const jitter = shape.jitter ?? 0;
    params.x = shape.from.x + (shape.to.x - shape.from.x) * t + random.signed() * jitter;
    params.y = shape.from.y + (shape.to.y - shape.from.y) * t + random.signed() * jitter * 0.3;
    params.z = shape.from.z + (shape.to.z - shape.from.z) * t + random.signed() * jitter;
    const spread = shape.spread ?? 0;
    params.vx = random.signed() * spread;
    params.vy = sampleRange(shape.lift ?? 0, random);
    params.vz = random.signed() * spread;
  },

  /** Uniform over a ground disc, snapped to the terrain when `ground` is given. */
  disk(shape, params, random) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * (shape.radius ?? 1);
    const minimum = shape.innerRadius ?? 0;
    const radius = minimum + r * (1 - minimum / Math.max(1e-3, shape.radius ?? 1));
    params.x = shape.center.x + Math.cos(angle) * radius;
    params.z = shape.center.z + Math.sin(angle) * radius;
    params.y = shape.ground
      ? shape.ground(params.x, params.z) + sampleRange(shape.height ?? 0, random)
      : shape.center.y + sampleRange(shape.height ?? 0, random);
    const outward = sampleRange(shape.outward ?? 0, random);
    params.vx = Math.cos(angle) * outward + random.signed() * (shape.spread ?? 0);
    params.vy = sampleRange(shape.lift ?? 0, random);
    params.vz = Math.sin(angle) * outward + random.signed() * (shape.spread ?? 0);
  },

  /** A single point with an explicit velocity. */
  point(shape, params, random) {
    params.x = shape.center.x;
    params.y = shape.center.y;
    params.z = shape.center.z;
    const spread = shape.spread ?? 0;
    params.vx = (shape.velocity?.x ?? 0) + random.signed() * spread;
    params.vy = (shape.velocity?.y ?? 0) + random.signed() * spread;
    params.vz = (shape.velocity?.z ?? 0) + random.signed() * spread;
  },
};

export function placeOnShape(shape, params, random, index, count) {
  const place = SHAPES[shape.kind];
  if (!place) throw new Error(`Unknown emitter shape "${shape.kind}".`);
  place(shape, params, random, index, count);
}

export { basis as tangentBasis };
