import { HouseGeometry } from './HouseGeometry.js';
import { UP, dot, cross, normalize, smooth, FOUNDATION_DEPTH } from './houseMath.js';

export class HouseWalls extends HouseGeometry {
  walls(material, { x0, x1, z0, z1, y0, y1, tint = 1, skip = [], topShade = 0.7 }) {
    const walls = [
      { name: 'front', a: [x0, z1], b: [x1, z1], normal: [0, 0, 1] },
      { name: 'right', a: [x1, z1], b: [x1, z0], normal: [1, 0, 0] },
      { name: 'back', a: [x1, z0], b: [x0, z0], normal: [0, 0, -1] },
      { name: 'left', a: [x0, z0], b: [x0, z1], normal: [-1, 0, 0] },
    ].map((w) => ({ ...w, y0, y1, length: Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), dir: normalize([w.b[0] - w.a[0], 0, w.b[1] - w.a[1]]) }));
    const ys = [y0];
    for (const cut of [this.grimeHeight + 0.4, this.grimeHeight + 1.3, y1 - topShade]) if (cut > y0 + 0.1 && cut < y1 - 0.1) ys.push(cut);
    ys.push(y1);
    ys.sort((a, b) => a - b);
    // The wall darkens toward its head (shadowed under eaves and jetties).
    const shade = (s, t) => {
      const k = topShade ? 1 - 0.35 * smooth(y1 - topShade, y1, t) : 1;
      return typeof tint === 'number' ? tint * k : tint.map((c) => c * k);
    };
    for (const w of walls) {
      if (skip.includes(w.name)) continue;
      this.surface(material, (s, t) => [w.a[0] + (w.b[0] - w.a[0]) * s, t, w.a[1] + (w.b[1] - w.a[1]) * s], [0, 1], ys, {
        uv: (s, t, p) => [dot(p, w.dir), t], tint: shade,
      });
    }
    return Object.fromEntries(walls.map((w) => [w.name, w]));
  }

  /** A wall descriptor from its start (x, z), outward normal and length. */
  wall(a, normal, length, y0 = 0, y1 = 0) {
    const n = normalize(normal);
    return { a, normal: n, dir: cross(UP, n), length, y0, y1 };
  }

  /**
   * The foundation under a storey: its walls continued `depth` metres below
   * `top` (the design's ground line). On a slope the house stands level at
   * the uphill ground and this plinth fills the drop on the downhill side;
   * the rest stays under the terrain.
   */
  plinth(material, { x0, x1, z0, z1, top = 0, depth = FOUNDATION_DEPTH, tint = 1 }) {
    return this.walls(material, { x0, x1, z0, z1, y0: top - depth, y1: top + 0.02, tint, topShade: 0 });
  }

  /** A point on a wall: `u` metres along it, height `y`, `d` metres out. */
  at(wall, u, y, d = 0) {
    return [wall.a[0] + wall.dir[0] * u + wall.normal[0] * d, y, wall.a[1] + wall.dir[2] * u + wall.normal[2] * d];
  }

  /** A flat panel on a wall face (window glass, door leaves, signs). */
  panel(material, wall, u0, u1, y0, y1, d, { tint = 1, origin = null } = {}) {
    const o = origin ?? this.at(wall, u0, y0, d);
    this.poly(material, [this.at(wall, u0, y0, d), this.at(wall, u1, y0, d), this.at(wall, u1, y1, d), this.at(wall, u0, y1, d)], { tint, origin: o, normal: wall.normal });
  }

  /** A beam lying on a wall face between two (u, y) points. */
  wallBeam(wall, u0, y0, u1, y1, size = 0.2, { material = 'wood', d = 0.06, tint = 1 } = {}) {
    const n = [wall.normal[0], 0, wall.normal[2]];
    this.beam(material, this.at(wall, u0, y0, d), this.at(wall, u1, y1, d), size, { side: n, depth: size * 0.7, tint });
  }

  /**
   * Half-timbering on a wall band: sill and head rails, posts every
   * `spacing` metres, and braces in the bays that have no window.
   */
  timberFrame(wall, { y0, y1, spacing = 1.6, rails = [], braces = 'diagonal', openings = [], size = 0.2, tint = 1, inset = 0 }) {
    const L = wall.length;
    this.wallBeam(wall, -size / 2 + inset, y0, L + size / 2 - inset, y0, size, { tint });
    this.wallBeam(wall, -size / 2 + inset, y1, L + size / 2 - inset, y1, size, { tint });
    for (const y of rails) this.wallBeam(wall, inset, y, L - inset, y, size * 0.8, { tint });
    const bays = Math.max(1, Math.round((L - 2 * inset) / spacing));
    const step = (L - 2 * inset) / bays;
    for (let i = 0; i <= bays; i += 1) this.wallBeam(wall, inset + i * step, y0, inset + i * step, y1, size, { tint });
    if (braces === 'none') return;
    for (let i = 0; i < bays; i += 1) {
      const u0 = inset + i * step, u1 = u0 + step;
      if (openings.some(([a, b]) => a < u1 - 0.05 && b > u0 + 0.05)) continue;
      const flip = braces === 'cross' || (braces === 'diagonal' && (i < bays / 2));
      if (braces === 'cross') {
        this.wallBeam(wall, u0, y0, u1, y1, size * 0.8, { tint, d: 0.05 });
        this.wallBeam(wall, u0, y1, u1, y0, size * 0.8, { tint, d: 0.07 });
      } else if (flip) this.wallBeam(wall, u0, y0, u1, y1, size * 0.8, { tint });
      else this.wallBeam(wall, u0, y1, u1, y0, size * 0.8, { tint });
    }
  }

  /** A leaded window with a timber frame, sill and optional shutters. */
  window(wall, u, y, w, h, { frame = 'wood', mullion = true, sill = true, tint = 1, shutters = false, arch = false } = {}) {
    const u0 = u - w / 2, u1 = u + w / 2;
    // The glass sits just proud of the wall, so no hole is cut.
    this.panel('window', wall, u0, u1, y, y + h, 0.03, { tint });
    if (arch) {
      this.stoneArch(wall, u, y, w, h);
      return;
    }
    const f = 0.12;
    this.wallBeam(wall, u0 - f / 2, y + h, u1 + f / 2, y + h, f, { material: frame, d: 0.07, tint });
    this.wallBeam(wall, u0, y, u0, y + h, f, { material: frame, d: 0.07, tint });
    this.wallBeam(wall, u1, y, u1, y + h, f, { material: frame, d: 0.07, tint });
    if (mullion) this.wallBeam(wall, u, y, u, y + h, f * 0.6, { material: frame, d: 0.06, tint });
    if (sill) this.wallBeam(wall, u0 - 0.12, y - 0.04, u1 + 0.12, y - 0.04, 0.12, { material: frame, d: 0.1, tint });
    if (shutters) {
      this.panel('planks', wall, u0 - w * 0.5 - 0.05, u0 - 0.07, y, y + h, 0.09, { tint: 0.8 });
      this.panel('planks', wall, u1 + 0.07, u1 + w * 0.5 + 0.05, y, y + h, 0.09, { tint: 0.8 });
    }
  }

  /** Voussoirs around a round-headed opening, in the light stone. */
  stoneArch(wall, u, y, w, h, { material = 'stone', blocks = 7, tint = 1.35 } = {}) {
    const r = w / 2, spring = y + h - r;
    const t = 0.22;
    for (let i = 0; i < blocks; i += 1) {
      const a0 = Math.PI - (i / blocks) * Math.PI, a1 = Math.PI - ((i + 1) / blocks) * Math.PI;
      const am = (a0 + a1) / 2;
      const inner = [u + Math.cos(am) * (r + t / 2), spring + Math.sin(am) * (r + t / 2)];
      const half = (r + t) * Math.sin((a0 - a1) / 2) * 0.92;
      const tangent = [-Math.sin(am), Math.cos(am)];
      this.wallBeam(wall, inner[0] - tangent[0] * half, inner[1] - tangent[1] * half, inner[0] + tangent[0] * half, inner[1] + tangent[1] * half, t, { material, d: 0.08, tint: tint * (0.9 + this.random() * 0.2) });
    }
    // Jambs down to the sill.
    for (const side of [-1, 1]) {
      for (let yy = y; yy < spring - 0.05; yy += 0.36) {
        const top = Math.min(spring, yy + 0.32);
        const off = (Math.floor((yy - y) / 0.36) % 2) * 0.06;
        this.wallBeam(wall, u + side * (r + t / 2 + off / 2), yy, u + side * (r + t / 2 + off / 2), top, t + off, { material, d: 0.08, tint: tint * (0.9 + this.random() * 0.2) });
      }
    }
    if (h > r) this.panel('window', wall, u - r, u + r, spring, spring + r * 0.98, 0.03);
  }

  /** A plank door, optionally round-headed in a stone arch. */
  door(wall, u, w, h, { arch = false, y = 0, tint = 0.85 } = {}) {
    const u0 = u - w / 2, u1 = u + w / 2;
    const top = arch ? y + h - w / 2 : y + h;
    this.panel('planks', wall, u0, u1, y, top, 0.04, { tint });
    if (arch) {
      // A fan of plank wedges fills the round head.
      const r = w / 2, segs = 5;
      for (let i = 0; i < segs; i += 1) {
        const a0 = Math.PI * (i / segs), a1 = Math.PI * ((i + 1) / segs);
        this.poly('planks', [this.at(wall, u, top, 0.04), this.at(wall, u + Math.cos(a0) * r, top + Math.sin(a0) * r, 0.04), this.at(wall, u + Math.cos(a1) * r, top + Math.sin(a1) * r, 0.04)], { tint, normal: wall.normal });
      }
      this.stoneArch(wall, u, y, w, h, { blocks: 7 });
      return;
    }
    const f = 0.16;
    this.wallBeam(wall, u0 - f, top + f / 2, u1 + f, top + f / 2, f, { d: 0.08 });
    this.wallBeam(wall, u0 - f / 2, y, u0 - f / 2, top, f, { d: 0.08 });
    this.wallBeam(wall, u1 + f / 2, y, u1 + f / 2, top, f, { d: 0.08 });
    // Ledges across the leaf.
    this.wallBeam(wall, u0, y + 0.35, u1, y + 0.35, 0.1, { material: 'planks', d: 0.07, tint: tint * 0.8 });
    this.wallBeam(wall, u0, top - 0.35, u1, top - 0.35, 0.1, { material: 'planks', d: 0.07, tint: tint * 0.8 });
  }

  /** Alternating long-and-short dressed stones up a wall corner. */
  quoins(wall, end, y0, y1, { material = 'stone', course = 0.42, tint = 1.1, d = 0.05 } = {}) {
    const u = end === 'start' ? 0 : wall.length;
    const inward = end === 'start' ? 1 : -1;
    let i = 0;
    for (let y = y0; y + 0.1 < y1; y += course, i += 1) {
      const long = i % 2 === 0 ? 0.7 : 0.42;
      const top = Math.min(y1, y + course - 0.04);
      const a = this.at(wall, u - inward * 0.05, y, d), b = this.at(wall, u + inward * long, top, d);
      this.box(material, [Math.min(a[0], b[0]) - (wall.normal[0] ? 0.06 : 0), y, Math.min(a[2], b[2]) - (wall.normal[2] ? 0.06 : 0)],
        [Math.max(a[0], b[0]) + (wall.normal[0] ? 0.06 : 0), top, Math.max(a[2], b[2]) + (wall.normal[2] ? 0.06 : 0)], { tint: tint * (0.85 + this.random() * 0.3) });
    }
  }

  /** Joist ends projecting under a jetty or eave, along a wall. */
  joists(wall, y, { spacing = 0.8, out = 0.45, size = 0.18, tint = 1, material = 'wood' } = {}) {
    const n = Math.max(1, Math.round(wall.length / spacing));
    for (let i = 0; i <= n; i += 1) {
      const u = (i / n) * wall.length;
      this.beam(material, this.at(wall, u, y, -0.1), this.at(wall, u, y, out), size, { tint, side: UP });
    }
  }

}
