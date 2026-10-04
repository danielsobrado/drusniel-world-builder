import { HouseRoofs } from './HouseRoofs.js';
import { UP, sub, add, scale, dot, cross, length, normalize, lerp3, smooth, faceAxes, FOUNDATION_DEPTH } from './houseMath.js';

export class HouseBuilder extends HouseRoofs {
  chimney({ x, z, w = 0.9, d = 0.9, y0, y1, material = 'stone', pots = 2, tint = 1, capTint = 0.8 }) {
    this.box(material, [x - w / 2, y0, z - d / 2], [x + w / 2, y1, z + d / 2], { tint, faces: ['px', 'nx', 'pz', 'nz'] });
    this.box(material, [x - w / 2 - 0.12, y1, z - d / 2 - 0.12], [x + w / 2 + 0.12, y1 + 0.18, z + d / 2 + 0.12], { tint: capTint });
    for (let i = 0; i < pots; i += 1) {
      const px = pots === 1 ? x : x - w / 4 + (w / 2) * (i / (pots - 1));
      this.cylinder('metal', [px, y1 + 0.18, z], 0.13, 0.35 + (i % 2) * 0.15, 6, { tint: 1.3 });
    }
  }

  /** A dormer on a roof slope facing `facing` (+x, -x, +z, -z). */
  dormer(roof, { at, offset, w = 1.1, h = 1.1, facing, material = 'plaster', roofMaterial = 'roofTiles', tint = 1 }) {
    // `offset`: distance of the dormer face from the ridge line; `at`:
    // position along the ridge.
    const sign = facing.startsWith('-') ? -1 : 1;
    const base = roof.heightAt(sign * offset, at) - 0.2;
    const depth = offset;
    const alongZ = roof.alongZ;
    const faceA = sign * offset;
    const backA = sign * Math.max(0.2, offset - depth);
    const pa = (a, y, b) => roof.point(a, y, b);
    const lo = Math.min(faceA, backA), hi = Math.max(faceA, backA);
    const min = pa(lo, base, at - w / 2), max = pa(hi, base + h, at + w / 2);
    this.box(material, [Math.min(min[0], max[0]), base, Math.min(min[2], max[2])], [Math.max(min[0], max[0]), base + h, Math.max(min[2], max[2])], { tint, faces: ['px', 'nx', 'pz', 'nz'] });
    const n = alongZ ? [sign, 0, 0] : [0, 0, sign];
    const centre = pa(faceA, 0, at);
    const dirU = cross(UP, n);
    const wall = this.wall([centre[0] - dirU[0] * w / 2, centre[2] - dirU[2] * w / 2], n, w);
    this.window(wall, w / 2, base + 0.2, w * 0.55, h * 0.6, { sill: false, mullion: false });
    // Its own little gable roof, ridge running back into the main slope.
    const rMin = pa(lo, 0, at - w / 2), rMax = pa(hi, 0, at + w / 2);
    this.gableRoof({
      x0: Math.min(rMin[0], rMax[0]), x1: Math.max(rMin[0], rMax[0]), z0: Math.min(rMin[2], rMax[2]), z1: Math.max(rMin[2], rMax[2]),
      axis: alongZ ? 'x' : 'z', wallTop: base + h, ridgeY: base + h + w * 0.55, overhang: 0.15, endOverhang: 0.15,
      thickness: 0.1, material: roofMaterial, gableMaterial: material, openEnds: [sign > 0 ? 'start' : 'end'], ridgeBeam: false, purlins: 0,
    });
  }

  /** A straight run of steps rising from `from` to `to` (x, z, y). */
  stairs(material, from, to, width, steps, { tint = 1, solid = true } = {}) {
    const dir = normalize([to[0] - from[0], 0, to[2] - from[2]]);
    const side = [dir[2], 0, -dir[0]];
    const run = Math.hypot(to[0] - from[0], to[2] - from[2]) / steps;
    const riseStep = (to[1] - from[1]) / steps;
    for (let i = 0; i < steps; i += 1) {
      const c = add(from, add(scale(dir, run * (i + 0.5)), [0, 0, 0]));
      const yTop = from[1] + riseStep * (i + 1);
      const yBottom = solid ? from[1] - 0.2 : yTop - riseStep - 0.1;
      this.orientedBox(material, [c[0], (yTop + yBottom) / 2, c[2]], [dir, UP, side], [run / 2 + 0.02, (yTop - yBottom) / 2, width / 2], { tint: tint * (0.9 + this.random() * 0.2) });
    }
  }

  /** A hanging sign on an iron bracket, out from a wall. */
  sign(wall, u, y, { out = 1.1 } = {}) {
    const root = this.at(wall, u, y, 0.05), tip = this.at(wall, u, y, out);
    this.beam('metal', root, tip, 0.05);
    this.beam('metal', this.at(wall, u, y - 0.4, 0.05), this.at(wall, u, y, out * 0.6), 0.04);
    const c = this.at(wall, u, y - 0.55, out * 0.75);
    const across = normalize(cross(UP, [wall.normal[0], 0, wall.normal[2]]));
    this.orientedBox('planks', c, [[wall.normal[0], 0, wall.normal[2]], UP, across], [0.3, 0.4, 0.04], { tint: 0.9 });
  }


}
