import { HouseWalls } from './HouseWalls.js';
import { UP, sub, add, scale, dot, cross, length, normalize, lerp3, smooth, faceAxes, FOUNDATION_DEPTH } from './houseMath.js';

export class HouseRoofs extends HouseWalls {
  gableRoof({
    x0, x1, z0, z1, axis = 'z', wallTop, ridgeY, overhang = 0.5, endOverhang = 0.4, thickness = 0.22,
    sweep = 1, sag = 0, material = 'roofTiles', gableMaterial = 'plaster', gableTint = 1, openEnds = [],
    segments = null, lengthSegments = null, tint = 1, ridgeBeam = true, purlins = 2, gableFrame = false, gableInset = 0,
    rafterTails = 0.8, hips = [0, 0],
  }) {
    // Local frame: `a` across the ridge, `b` along it.
    const alongZ = axis === 'z';
    const ca = alongZ ? (x0 + x1) / 2 : (z0 + z1) / 2;
    const halfIn = alongZ ? (x1 - x0) / 2 : (z1 - z0) / 2;
    const b0 = (alongZ ? z0 : x0) - endOverhang, b1 = (alongZ ? z1 : x1) + endOverhang;
    const halfOut = halfIn + overhang;
    const rise = ridgeY - wallTop;
    const drop = (d) => rise * Math.pow(Math.abs(d) / halfIn, sweep);
    const ridgeAt = (b) => {
      if (!sag) return ridgeY;
      const k = ((b - b0) / (b1 - b0)) * 2 - 1;
      return ridgeY - sag * (1 - k * k);
    };
    // Surface height at signed offset d from the ridge, position b along it.
    const heightAt = (d, b = (b0 + b1) / 2) => ridgeAt(b) - drop(d) * (ridgeAt(b) - wallTop) / rise;
    const point = (a, y, b) => (alongZ ? [ca + a, y, b] : [b, y, ca + a]);
    const nSeg = segments ?? (sweep === 1 ? 1 : 5);
    const nLen = lengthSegments ?? (sag ? 6 : 1);
    const ts = Array.from({ length: nSeg + 1 }, (_, i) => i / nSeg);
    const bs = Array.from({ length: nLen + 1 }, (_, i) => b0 + ((b1 - b0) * i) / nLen);
    // Arc length up the slope from the eave, for tile rows that follow it.
    const arc = (() => {
      const samples = 64, table = [0];
      let prev = [halfOut, heightAt(halfOut)];
      for (let i = 1; i <= samples; i += 1) {
        const d = halfOut * (1 - i / samples);
        const next = [d, heightAt(d)];
        table.push(table[i - 1] + Math.hypot(next[0] - prev[0], next[1] - prev[1]));
        prev = next;
      }
      return (t) => { const f = t * samples, i = Math.min(samples - 1, Math.floor(f)); return table[i] + (table[i + 1] - table[i]) * (f - i); };
    })();
    const roofTint = (s, t) => { const k = 0.78 + 0.22 * t; return typeof tint === 'number' ? tint * k : tint.map((c) => c * k); };
    // Hipped ends pull the ridge in: at height t a side slope spans
    // bAt(0, t)..bAt(1, t), and each hip is a triangle down to its eave.
    const bAt = (s, t) => (b0 + hips[0] * t) + ((b1 - hips[1] * t) - (b0 + hips[0] * t)) * s;
    for (const side of [1, -1]) {
      // t: 0 at the eave, 1 at the ridge. s runs along the ridge.
      const top = (s, t) => { const d = side * halfOut * (1 - t); const b = bAt(s, t); return point(d, heightAt(d, b), b); };
      const under = (s, t) => { const p = top(s, t); return [p[0], p[1] - thickness, p[2]]; };
      const sVals = bs.map((b) => (b - b0) / (b1 - b0));
      this.surface(material, top, sVals, ts, { uv: (s, t) => [bAt(s, t) * side, arc(t)], tint: roofTint, facing: UP });
      this.surface('planks', under, sVals, ts, { uv: (s, t) => [bAt(s, t), arc(t)], tint: 0.7, facing: [0, -1, 0] });
      // Eave edge and the two verge edges.
      const out = alongZ ? [side, 0, 0] : [0, 0, side];
      const eave = sVals.map((s) => [top(s, 0), under(s, 0)]);
      for (let i = 0; i + 1 < eave.length; i += 1) {
        this.poly('wood', [eave[i][1], eave[i + 1][1], eave[i + 1][0], eave[i][0]], { tint: 0.8, facing: out });
      }
      for (const [s, dir] of [[0, -1], [1, 1]]) {
        if (hips[s]) continue;
        for (let j = 0; j < nSeg; j += 1) {
          this.poly('wood', [under(s, ts[j]), under(s, ts[j + 1]), top(s, ts[j + 1]), top(s, ts[j])], { tint: 0.75, facing: alongZ ? [0, 0, dir] : [dir, 0, 0] });
        }
      }
    }
    for (const [end, dir] of [[0, -1], [1, 1]]) {
      if (!hips[end]) continue;
      const bEnd = end ? b1 : b0;
      const hipTop = (s, t) => {
        const d = halfOut * (1 - t);
        const b = bEnd - dir * hips[end] * t;
        return point((s * 2 - 1) * d, heightAt(d, b), b);
      };
      const hipUnder = (s, t) => { const p = hipTop(s, t); return [p[0], p[1] - thickness, p[2]]; };
      const out = alongZ ? [0, 0, dir] : [dir, 0, 0];
      const ratio = hips[end] / halfOut;
      this.surface(material, hipTop, [0, 0.5, 1], ts, { uv: (s, t, p) => [(alongZ ? p[0] : p[2]), arc(t) * ratio], tint: roofTint, facing: UP });
      this.surface('planks', hipUnder, [0, 1], ts, { uv: (s, t, p) => [(alongZ ? p[0] : p[2]), arc(t) * ratio], tint: 0.7, facing: [0, -1, 0] });
      this.poly('wood', [hipUnder(0, 0), hipUnder(1, 0), hipTop(1, 0), hipTop(0, 0)], { tint: 0.8, facing: out });
    }
    if (ridgeBeam) {
      const r0 = b0 + hips[0], r1 = b1 - hips[1];
      const rs = bs.map((b) => r0 + ((b - b0) / (b1 - b0)) * (r1 - r0));
      for (let i = 0; i + 1 < rs.length; i += 1) {
        this.beam('wood', point(0, ridgeAt(rs[i]) + 0.04, rs[i] - (i === 0 && !hips[0] ? 0.15 : 0)), point(0, ridgeAt(rs[i + 1]) + 0.04, rs[i + 1] + (i + 2 === rs.length && !hips[1] ? 0.15 : 0)), 0.24, { side: UP, tint: 0.75 });
      }
    }
    // Rafter tails under the eaves, from the wall line out to the fascia.
    if (rafterTails) {
      const bIn0 = alongZ ? z0 : x0, bIn1 = alongZ ? z1 : x1;
      const n = Math.max(1, Math.round((bIn1 - bIn0) / rafterTails));
      for (const side of [1, -1]) {
        for (let i = 0; i <= n; i += 1) {
          const b = bIn0 + ((bIn1 - bIn0) * i) / n;
          const dIn = side * (halfIn - 0.15), dOut = side * (halfOut - 0.05);
          const a = point(dIn, heightAt(dIn, b) - thickness - 0.08, b), c = point(dOut, heightAt(dOut, b) - thickness - 0.08, b);
          this.beam('wood', a, c, 0.12, { side: UP, tint: 0.7 });
        }
      }
    }
    // Purlin ends poke out of the gables under the roof.
    for (let i = 1; i <= (hips[0] || hips[1] ? 0 : purlins); i += 1) {
      for (const side of [1, -1]) {
        const d = side * halfIn * (i / (purlins + 1)) * 1.6;
        if (Math.abs(d) > halfOut - 0.1) continue;
        const y = heightAt(d) - thickness - 0.12;
        this.beam('wood', point(d, y, b0 - 0.35), point(d, y, b1 + 0.35), 0.16, { side: UP, tint: 0.7 });
      }
    }
    // Gable ends, fanned from the middle of the wall top (the region under
    // the profile is star-shaped from there even when the slopes are swept).
    const ends = [['start', alongZ ? z0 : x0, -1], ['end', alongZ ? z1 : x1, 1]];
    for (const [name, b, dir] of ends) {
      if (openEnds.includes(name) || hips[name === 'start' ? 0 : 1]) continue;
      const bb = b + dir * gableInset;
      const n = alongZ ? [0, 0, dir] : [dir, 0, 0];
      const outline = [];
      const steps = sweep === 1 ? 1 : 8;
      for (let i = 0; i <= steps; i += 1) outline.push(-halfIn + (halfIn * i) / steps);
      for (let i = 1; i <= steps; i += 1) outline.push((halfIn * i) / steps);
      const pts = outline.map((d) => point(d, heightAt(d, bb) - thickness, bb));
      const centre = point(0, wallTop - thickness, bb);
      const base = [point(halfIn, wallTop - thickness, bb), ...pts.reverse(), point(-halfIn, wallTop - thickness, bb)];
      for (let i = 0; i + 1 < base.length; i += 1) this.poly(gableMaterial, [centre, base[i], base[i + 1]], { tint: gableTint, normal: n, origin: [0, 0, 0] });
      if (gableFrame === true || (Array.isArray(gableFrame) && gableFrame.includes(name))) {
        const middle = point(0, 0, bb);
        const dirU = cross(UP, n);
        const wall = this.wall([middle[0] - dirU[0] * halfIn, middle[2] - dirU[2] * halfIn], n, halfIn * 2);
        const topY = heightAt(0, bb) - thickness;
        const collar = wallTop - thickness + (topY - wallTop) * 0.45;
        this.wallBeam(wall, halfIn, wallTop - thickness, halfIn, topY - 0.05, 0.2);
        const reach = (y) => { let d = halfIn; for (let k = 0; k < 20; k += 1) { d = halfIn * Math.pow(Math.max(0, (ridgeAt(bb) - y - thickness) / rise), 1 / sweep); } return d; };
        const w = reach(collar);
        this.wallBeam(wall, halfIn - w, collar, halfIn + w, collar, 0.18);
        this.wallBeam(wall, halfIn - w * 0.85, collar, halfIn - 0.1, topY - (topY - collar) * 0.35, 0.16);
        this.wallBeam(wall, halfIn + w * 0.85, collar, halfIn + 0.1, topY - (topY - collar) * 0.35, 0.16);
      }
    }
    return { heightAt: (d, b) => heightAt(d, b ?? (b0 + b1) / 2), ridgeAt, b0, b1, ca, halfIn, halfOut, alongZ, point };
  }

  /** Iron spikes along a ridge, with a sagging wire strung between them. */
  ridgeSpikes(roof, { count = 5, height = 1.1, wire = true, from = 0.05, to = 0.95 } = {}) {
    const tips = [];
    for (let i = 0; i < count; i += 1) {
      const b = roof.b0 + (roof.b1 - roof.b0) * (from + ((to - from) * i) / Math.max(1, count - 1));
      const y = roof.ridgeAt(b) + 0.1;
      const base = roof.point(0, y, b);
      const h = height * (0.85 + this.random() * 0.3);
      this.beam('metal', base, add(base, [0, h, 0]), 0.05);
      this.cylinder('metal', add(base, [0, h, 0]), 0.07, 0.28, 4, { topRadius: 0 });
      this.beam('metal', add(base, [-0.12, h * 0.8, 0]), add(base, [0.12, h * 0.8, 0]), 0.03);
      tips.push(add(base, [0, h * 0.7, 0]));
    }
    if (!wire) return;
    for (let i = 0; i + 1 < tips.length; i += 1) {
      const a = tips[i], b = tips[i + 1];
      const mid = add(lerp3(a, b, 0.5), [0, -0.25, 0]);
      this.beam('metal', a, mid, 0.025);
      this.beam('metal', mid, b, 0.025);
    }
  }


}
