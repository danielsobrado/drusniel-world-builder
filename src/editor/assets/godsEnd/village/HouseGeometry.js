import * as THREE from 'three';
import { TEXTURE_METRES } from '../houseTextureData.js';
import { UP, sub, add, scale, dot, cross, length, normalize, lerp3, smooth, faceAxes, FOUNDATION_DEPTH } from './houseMath.js';

export class HouseGeometry {
  constructor({ seed = 1, grimeHeight = 0, palette = {} } = {}) {
    this.parts = new Map();
    this.grimeHeight = grimeHeight;
    // Per-surface colour multipliers: each house's own shade of stone, roof
    // and timber from the shared generated textures.
    this.palette = palette;
    let a = seed >>> 0;
    this.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  #part(material) {
    let part = this.parts.get(material);
    if (!part) {
      const tint = this.palette[material] ?? 1;
      part = { positions: [], normals: [], uvs: [], colors: [], indices: [], tint: typeof tint === 'number' ? [tint, tint, tint] : tint };
      this.parts.set(material, part);
    }
    return part;
  }

  // Ambient occlusion baked into the vertex colour: grime rising from the
  // ground and darker faces that look down (soffits, jetty undersides).
  #shade(point, normal, tint, palette) {
    const ground = 0.55 + 0.45 * smooth(0, 1.3, point[1] - this.grimeHeight);
    const facing = normal[1] < -0.3 ? 0.55 : normal[1] > 0.5 ? 1.05 : 1;
    const base = typeof tint === 'number' ? [tint, tint, tint] : tint;
    const s = ground * facing;
    return [base[0] * s * palette[0], base[1] * s * palette[1], base[2] * s * palette[2]];
  }

  #vertex(part, point, normal, uv, tint) {
    part.positions.push(point[0], point[1], point[2]);
    part.normals.push(normal[0], normal[1], normal[2]);
    part.uvs.push(uv[0], uv[1]);
    const c = this.#shade(point, normal, tint, part.tint);
    part.colors.push(c[0], c[1], c[2]);
    return part.positions.length / 3 - 1;
  }

  /**
   * A planar convex polygon (CCW seen from its front), fanned from its first
   * point. UVs project on the face axes in metres / texture size.
   */
  poly(material, points, { tint = 1, uAxis = null, origin = [0, 0, 0], uvOffset = [0, 0], normal = null, facing = null } = {}) {
    const part = this.#part(material);
    // Winding follows the wanted normal (or facing hint), whatever order the
    // caller listed the points in.
    let gn = normalize(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    const want = normal ?? facing;
    if (want && dot(gn, want) < 0) { points = [...points].reverse(); gn = scale(gn, -1); }
    const n = normal ?? gn;
    const { u, v } = faceAxes(n, uAxis);
    const tile = TEXTURE_METRES[material] ?? 1;
    const base = part.positions.length / 3;
    for (const p of points) {
      const d = sub(p, origin);
      this.#vertex(part, p, n, [dot(d, u) / tile + uvOffset[0], dot(d, v) / tile + uvOffset[1]], tint);
    }
    for (let i = 1; i + 1 < points.length; i += 1) part.indices.push(base, base + i, base + i + 1);
  }

  /**
   * A grid surface P(s, t) over the given parameter values, with smooth vertex
   * normals from its partial differences. uv(s, t) returns metres.
   */
  surface(material, fn, sValues, tValues, { uv, tint = 1, facing = null } = {}) {
    const part = this.#part(material);
    const tile = TEXTURE_METRES[material] ?? 1;
    const base = part.positions.length / 3;
    const eps = 1e-3;
    // Flip the whole grid when its natural normal opposes `facing`.
    let flip = false;
    if (facing) {
      const sm = (sValues[0] + sValues[sValues.length - 1]) / 2, tm = (tValues[0] + tValues[tValues.length - 1]) / 2;
      const n = cross(sub(fn(sm + eps, tm), fn(sm - eps, tm)), sub(fn(sm, tm + eps), fn(sm, tm - eps)));
      flip = dot(n, facing) < 0;
    }
    for (const t of tValues) {
      for (const s of sValues) {
        const p = fn(s, t);
        const ds = sub(fn(s + eps, t), fn(s - eps, t));
        const dt = sub(fn(s, t + eps), fn(s, t - eps));
        let n = normalize(cross(ds, dt));
        if (flip) n = scale(n, -1);
        const [mu, mv] = uv(s, t, p);
        this.#vertex(part, p, n, [mu / tile, mv / tile], typeof tint === 'function' ? tint(s, t, p) : tint);
      }
    }
    const row = sValues.length;
    for (let j = 0; j + 1 < tValues.length; j += 1) {
      for (let i = 0; i + 1 < row; i += 1) {
        const a = base + j * row + i, b = a + 1, c = a + row, d = c + 1;
        if (flip) part.indices.push(a, c, b, b, c, d);
        else part.indices.push(a, b, c, b, d, c);
      }
    }
  }

  /** An oriented box: centre, half extents along its own axes (x, y, z). */
  orientedBox(material, centre, axes, half, { tint = 1, faces = 'all', grainAxis = 0 } = {}) {
    const [ax, ay, az] = axes;
    const corner = (sx, sy, sz) => add(add(add(centre, scale(ax, sx * half[0])), scale(ay, sy * half[1])), scale(az, sz * half[2]));
    const grain = axes[grainAxis];
    const normals = { px: ax, nx: scale(ax, -1), py: ay, ny: scale(ay, -1), pz: az, nz: scale(az, -1) };
    const quads = {
      px: [corner(1, -1, 1), corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1)],
      nx: [corner(-1, -1, -1), corner(-1, -1, 1), corner(-1, 1, 1), corner(-1, 1, -1)],
      py: [corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, -1), corner(-1, 1, -1)],
      ny: [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)],
      pz: [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)],
      nz: [corner(1, -1, -1), corner(-1, -1, -1), corner(-1, 1, -1), corner(1, 1, -1)],
    };
    for (const [key, points] of Object.entries(quads)) {
      if (faces !== 'all' && !faces.includes(key)) continue;
      const n = normals[key];
      // Grain along the box's long axis unless the face is its end grain.
      const along = Math.abs(dot(n, grain)) > 0.9 ? null : grain;
      this.poly(material, points, { tint, uAxis: along, normal: n, origin: centre });
    }
  }

  /** Axis-aligned box from min to max corners, optionally turned about y. */
  box(material, min, max, { tint = 1, faces = 'all', rotY = 0, pivot = null } = {}) {
    const centre = scale(add(min, max), 0.5);
    const half = scale(sub(max, min), 0.5);
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const axes = [[c, 0, -s], [0, 1, 0], [s, 0, c]];
    let at = centre;
    if (rotY && pivot) {
      const d = sub(centre, pivot);
      at = [pivot[0] + d[0] * c + d[2] * s, centre[1], pivot[2] - d[0] * s + d[2] * c];
    }
    const grainAxis = half[0] >= half[1] && half[0] >= half[2] ? 0 : half[2] >= half[1] ? 2 : 1;
    this.orientedBox(material, at, axes, half, { tint, faces, grainAxis });
  }

  /** A square-section beam from a to b; `side` orients its cross-section. */
  beam(material, a, b, size, { tint = 1, side = null, depth = null } = {}) {
    const dir = normalize(sub(b, a));
    let x = side ? normalize(sub(side, scale(dir, dot(side, dir)))) : cross(dir, Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : UP);
    x = normalize(x);
    const y = cross(dir, x);
    const len = length(sub(b, a));
    this.orientedBox(material, scale(add(a, b), 0.5), [dir, x, y], [len / 2, (depth ?? size) / 2, size / 2], { tint, grainAxis: 0 });
  }

  /** A capped cylinder or cone frustum standing on `base`. */
  cylinder(material, base, radius, height, segments = 6, { topRadius = radius, tint = 1, cap = true } = {}) {
    const ring = (y, r) => Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      return [base[0] + Math.cos(a) * r, base[1] + y, base[2] + Math.sin(a) * r];
    });
    const bottom = ring(0, radius), top = ring(height, topRadius);
    for (let i = 0; i < segments; i += 1) {
      const j = (i + 1) % segments;
      const out = [Math.cos(((i + 0.5) / segments) * Math.PI * 2), 0, Math.sin(((i + 0.5) / segments) * Math.PI * 2)];
      if (topRadius > 0) this.poly(material, [bottom[j], bottom[i], top[i], top[j]], { tint, facing: out });
      else this.poly(material, [bottom[j], bottom[i], top[i]], { tint, facing: out });
    }
    if (cap && topRadius > 0) this.poly(material, top, { tint, facing: UP });
  }


  build(materials, offset = [0, 0, 0]) {
    const group = new THREE.Group();
    for (const [name, part] of this.parts) {
      if (!part.indices.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(part.uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(part.colors, 3));
      const count = part.positions.length / 3;
      geometry.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(part.indices, 1) : new THREE.Uint16BufferAttribute(part.indices, 1));
      if (offset[0] || offset[1] || offset[2]) geometry.translate(offset[0], offset[1], offset[2]);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, materials[name]);
      mesh.name = name;
      group.add(mesh);
    }
    return group;
  }
}
