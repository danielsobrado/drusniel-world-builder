/**
 * Gathers a town's rooms into a handful of meshes, one per material, with
 * their light baked in.
 *
 * A room has a fire, a few candles and a window or two. Real lights for every
 * room of a town would not scale, and the sun must not reach indoors at all, so
 * each vertex records what its room's lights give it: `fire` (warm, RGB) and
 * `sky` (daylight through openings, a scalar the material fades at dusk).
 * Large faces are cut into cells so that light falls off across them.
 *
 * Everything is given in the footprint frame of the building last `enter`ed —
 * x along the frontage, z toward the front, y absolute — and stored in
 * settlement-local space (x plan x, z minus plan z). No three.
 */

/** Largest cell, in metres, a lit face is cut into. */
const CELL = 1.1;
/** A face turned away from a light still catches this share of it, as bounce. */
const WRAP = 0.3;

export const INTERIOR_MATERIALS = Object.freeze(['wood', 'plaster', 'stone', 'plain', 'glow', 'sky', 'exterior']);

function emptyGroup() {
  return { positions: [], normals: [], colors: [], uvs: [], fire: [], sky: [] };
}

export class InteriorBuilder {
  constructor() {
    this.groups = new Map(INTERIOR_MATERIALS.map((key) => [key, emptyGroup()]));
    this.group = this.groups.get('plain');
    this.lights = [];
    this.at = null;
    this.toward = null;
  }

  /** Aim the builder at one building, and light what follows with `lights`. */
  enter(building, lights = []) {
    const sin = Math.sin(building.yaw);
    const cos = Math.cos(building.yaw);
    // +x is (cos, −sin) and +z is (sin, cos) in plan space, and local z is minus plan z.
    this.at = (x, y, z) => [building.x + cos * x + sin * z, y, -(building.z - sin * x + cos * z)];
    this.toward = (x, y, z) => [cos * x + sin * z, y, -(-sin * x + cos * z)];
    this.lights = lights;
  }

  /** Which material what follows is made of. */
  use(key) {
    this.group = this.groups.get(key);
    if (!this.group) throw new Error(`Unknown interior material: ${key}.`);
    return this;
  }

  /** What the room's lights give a point with normal `n`: `[fireR, fireG, fireB, sky]`. */
  lightAt(point, n) {
    const light = [0, 0, 0, 0];
    for (const source of this.lights) {
      const dx = source.at[0] - point[0];
      const dy = source.at[1] - point[1];
      const dz = source.at[2] - point[2];
      const distance = Math.hypot(dx, dy, dz) || 1e-3;
      const facing = Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / distance) * (1 - WRAP) + WRAP;
      const reach = facing * source.strength / (1 + (distance / source.radius) ** 2);
      if (source.sky) light[3] += reach;
      else for (let channel = 0; channel < 3; channel += 1) light[channel] += source.color[channel] * reach;
    }
    return light;
  }

  vertex(point, n, color, u, v) {
    const { group } = this;
    const light = this.lightAt(point, n);
    group.positions.push(...this.at(...point));
    group.normals.push(...this.toward(...n));
    group.colors.push(...color);
    group.uvs.push(u, v);
    group.fire.push(light[0], light[1], light[2]);
    group.sky.push(light[3]);
  }

  /**
   * A flat quad a→b→c→d (frame points), facing along `n`. Cut into cells when
   * it is large, so baked light varies across it. UVs follow the face in metres.
   */
  quad(a, b, c, d, n, color, density = 0.6) {
    const length = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    const columns = Math.max(1, Math.ceil(length(a, b) / CELL));
    const rows = Math.max(1, Math.ceil(length(a, d) / CELL));
    const cross = [
      (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]),
      (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]),
      (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]),
    ];
    // The footprint frame is a mirror image of settlement-local space (its z is
    // negated), so a face wound to look along `n` here looks the other way there.
    const outward = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0;
    const at = (s, t) => [0, 1, 2].map((axis) => {
      const near = a[axis] + (b[axis] - a[axis]) * s;
      const far = d[axis] + (c[axis] - d[axis]) * s;
      return near + (far - near) * t;
    });
    const width = length(a, b) * density;
    const height = length(a, d) * density;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const [s0, s1, t0, t1] = [column / columns, (column + 1) / columns, row / rows, (row + 1) / rows];
        const corners = [[s0, t0], [s1, t0], [s1, t1], [s0, t1]];
        for (const index of outward ? [0, 1, 2, 0, 2, 3] : [0, 3, 2, 0, 2, 1]) {
          const [s, t] = corners[index];
          this.vertex(at(s, t), n, color, s * width, t * height);
        }
      }
    }
  }

  /** One triangle (frame points), wound to face along `n`. */
  tri(a, b, c, n, color) {
    const cross = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const outward = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0;
    for (const point of outward ? [a, b, c] : [a, c, b]) this.vertex(point, n, color, point[0] * 0.6, point[2] * 0.6);
  }

  /** An upright rectangle from (ax, az) to (bx, bz) between two heights, facing `[fx, fz]`. */
  wall(ax, az, bx, bz, bottom, top, facing, color, density) {
    this.quad([ax, bottom, az], [bx, bottom, bz], [bx, top, bz], [ax, top, az], [facing[0], 0, facing[1]], color, density);
  }

  /** A level rectangle at height `y`, facing up or down. */
  slab(x0, x1, z0, z1, y, up, color, density) {
    this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, up ? 1 : -1, 0], color, density);
  }

  /** A box seen from outside: four sides, a top, and a bottom when it hangs in the air. */
  box(x0, x1, z0, z1, bottom, top, color, { underside = false, density } = {}) {
    this.wall(x0, z1, x1, z1, bottom, top, [0, 1], color, density);
    this.wall(x0, z0, x1, z0, bottom, top, [0, -1], color, density);
    this.wall(x1, z0, x1, z1, bottom, top, [1, 0], color, density);
    this.wall(x0, z0, x0, z1, bottom, top, [-1, 0], color, density);
    this.slab(x0, x1, z0, z1, top, true, color, density);
    if (underside) this.slab(x0, x1, z0, z1, bottom, false, color, density);
  }

  /** An upright prism — a cask, a pot, a candle — optionally wider in the belly, or drawn in toward its top. */
  prism(x, z, radius, bottom, top, color, { sides = 10, belly = 0, taper = 0, cap = true } = {}) {
    const rings = belly > 0 ? 3 : 1;
    const ringRadius = (ring) => radius * (1 + belly * Math.sin(Math.PI * ring / rings)) * (1 - taper * ring / rings);
    for (let ring = 0; ring < rings; ring += 1) {
      const [y0, y1] = [bottom + (top - bottom) * ring / rings, bottom + (top - bottom) * (ring + 1) / rings];
      const [r0, r1] = [ringRadius(ring), ringRadius(ring + 1)];
      for (let side = 0; side < sides; side += 1) {
        const [a0, a1] = [Math.PI * 2 * side / sides, Math.PI * 2 * (side + 1) / sides];
        const middle = (a0 + a1) / 2;
        this.quad(
          [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0], [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0],
          [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1], [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1],
          [Math.cos(middle), 0, Math.sin(middle)], color);
      }
    }
    if (!cap) return;
    for (let side = 0; side < sides; side += 1) {
      const [a0, a1] = [Math.PI * 2 * side / sides, Math.PI * 2 * (side + 1) / sides];
      this.tri([x, top, z], [x + Math.cos(a0) * radius, top, z + Math.sin(a0) * radius],
        [x + Math.cos(a1) * radius, top, z + Math.sin(a1) * radius], [0, 1, 0], color);
    }
  }

  /** A disc hung flat on a wall — a shield, a trencher — facing `[fx, fz]`. */
  disc(x, y, z, radius, facing, color, sides = 12) {
    const across = [facing[1], -facing[0]];
    const rim = (angle) => [x + across[0] * Math.cos(angle) * radius, y + Math.sin(angle) * radius, z + across[1] * Math.cos(angle) * radius];
    for (let side = 0; side < sides; side += 1) {
      const [a0, a1] = [Math.PI * 2 * side / sides, Math.PI * 2 * (side + 1) / sides];
      this.tri([x, y, z], rim(a0), rim(a1), [facing[0], 0, facing[1]], color);
    }
  }

  /** The gathered meshes, by material, as typed arrays; materials with nothing in them are left out. */
  arrays() {
    const result = {};
    for (const [key, group] of this.groups) {
      if (group.positions.length === 0) continue;
      result[key] = Object.fromEntries(Object.entries(group).map(([name, values]) => [name, new Float32Array(values)]));
    }
    return result;
  }
}
