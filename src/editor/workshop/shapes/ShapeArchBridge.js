import { shapeRandom } from './ShapeMesh.js';

const DECK = 0.24;
const RING = 0.26;
const SPRING = 0.1;
const COURSE = 0.28;
const STONE = 0.55;
const RELIEF = 0.025;
const PARAPET = { height: 0.5, thickness: 0.22, coping: 0.1, overhang: 0.04 };
const MORTAR = [0.6, 0.58, 0.55];

/** Builds faced, coursed masonry along a traversal path: one shared frame for every piece. */
function bridgeFrame(plan, point) {
  const samples = Math.max(24, Math.ceil(plan.curve.length / 0.2));
  const at = (t, y, lateral) => { const q = point(t, lateral); return [q[0], y, q[2]]; };
  const outward = (t, lateral, side) => {
    const a = point(t, lateral), b = point(t, lateral + side);
    return [b[0] - a[0], 0, b[2] - a[2]];
  };
  // Emits a quad facing `facing`, whichever winding the path curvature produced.
  const quad = (mesh, corners, facing, tone) => {
    const [a, b, c] = corners, u = b.map((v, k) => v - a[k]), w = c.map((v, k) => v - a[k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    mesh.quad(...(n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2] >= 0 ? corners : corners.toReversed()), tone);
  };
  /** A proud block between two path stations, with sloping bottom and top edges. */
  const block = (mesh, ta, tb, low, high, lateral, side, relief, tone) => {
    const face = lateral + side * relief, out = outward((ta + tb) / 2, lateral, side);
    const f = [at(ta, low[0], face), at(tb, low[1], face), at(tb, high[1], face), at(ta, high[0], face)];
    const r = [at(ta, low[0], lateral), at(tb, low[1], lateral), at(tb, high[1], lateral), at(ta, high[0], lateral)];
    quad(mesh, f, out, tone);
    const along = at(tb, low[1], lateral).map((v, k) => v - at(ta, low[0], lateral)[k]);
    const shade = tone.map((v) => v * 0.82);
    quad(mesh, [f[3], f[2], r[2], r[3]], [0, 1, 0], tone);
    quad(mesh, [f[0], f[1], r[1], r[0]], [0, -1, 0], shade);
    quad(mesh, [f[0], f[3], r[3], r[0]], along.map((v) => -v), shade);
    quad(mesh, [f[1], f[2], r[2], r[1]], along, shade);
  };
  return { samples, at, outward, quad, block };
}

/** Staggered courses of proud stones on one face, clipped between two height profiles. */
function coursedFace(frame, mesh, { lateral, side, length, n, stoneTone, key, low, high }) {
  const stations = Array.from({ length: n + 1 }, (_, i) => i / n);
  const floor = Math.max(0, Math.min(...stations.map(low))), ceiling = Math.max(...stations.map(high));
  const step = STONE / length, joint = 0.012 / length;
  for (let row = Math.floor(floor / COURSE); row * COURSE < ceiling; row++) {
    const y0 = row * COURSE + 0.012, y1 = (row + 1) * COURSE - 0.012, shift = ((row % 2) * step) / 2;
    for (let cell = -1; cell * step < 1; cell++) {
      const c0 = Math.max(0, cell * step + shift + joint), c1 = Math.min(1, (cell + 1) * step + shift - joint);
      if (c1 <= c0) continue;
      const cuts = [c0, ...stations.filter((t) => t > c0 && t < c1), c1], tone = stoneTone(key, `${row}:${cell}`);
      for (let k = 0; k < cuts.length - 1; k++) {
        const ends = [cuts[k], cuts[k + 1]];
        const top = ends.map((t) => Math.min(y1, high(t) - 0.012)), bottom = ends.map((t, j) => Math.min(top[j], Math.max(y0, low(t) + 0.012)));
        if (top[0] - bottom[0] < 0.03 && top[1] - bottom[1] < 0.03) continue;
        frame.block(mesh, ends[0], ends[1], bottom, top, lateral, side, RELIEF, tone);
      }
    }
  }
}

export function buildShapeArchBridge(plan, meshes, recipe, point, { parapet }) {
  const p = plan.primitive, half = p.width / 2, frame = bridgeFrame(plan, point), detail = recipe.detail >= 2;
  const random = (domain, key) => shapeRandom(recipe.seed, plan.id, domain, key);
  const stoneTone = (domain, key) => { const v = 0.8 + random(domain, key) * 0.18, warm = random(`${domain}-warm`, key) - 0.5;
    return [v + warm * 0.04, v, v - warm * 0.05]; };
  const deckBottom = (t) => point(t, 0)[1] - DECK;
  const apex = Math.min(deckBottom(0.5) - RING - 0.06, deckBottom(SPRING) + 1.5);
  // The intrados springs from the ground; a span too low for a visible opening stays solid.
  const intrados = (t) => apex < 0.35 || t <= SPRING || t >= 1 - SPRING ? null
    : apex * Math.sin((Math.PI * (t - SPRING)) / (1 - 2 * SPRING));
  const bottom = (t) => intrados(t) ?? -0.05;
  const n = frame.samples, station = (i) => i / n;
  const length = plan.curve.length;

  for (const side of [-1, 1]) {
    const lateral = side * half;
    // Mortar backing: one continuous face, so joints never show sky.
    for (let i = 0; i < n; i++) {
      const ta = station(i), tb = station(i + 1);
      const face = [frame.at(ta, bottom(ta), lateral), frame.at(tb, bottom(tb), lateral),
        frame.at(tb, deckBottom(tb), lateral), frame.at(ta, deckBottom(ta), lateral)];
      frame.quad(meshes.trim, face, frame.outward((ta + tb) / 2, lateral, side), detail ? MORTAR : [0.84, 0.82, 0.78]);
    }
    // Coursed spandrel stones, clipped to the arch ring below and the deck above.
    if (detail) coursedFace(frame, meshes.trim, { lateral, side, length, n, stoneTone, key: `spandrel:${side}`,
      low: (t) => bottom(t) + (intrados(t) === null ? 0 : RING), high: deckBottom });
    // Voussoirs: a ring of wedge stones around the opening, proud of the spandrel.
    if (apex >= 0.35) {
      const count = Math.max(7, Math.ceil(((1 - 2 * SPRING) * length) / 0.34) | 1);
      for (let k = 0; k < count; k++) {
        const ta = SPRING + ((1 - 2 * SPRING) * k) / count + (detail ? 0.006 / length : 0);
        const tb = SPRING + ((1 - 2 * SPRING) * (k + 1)) / count - (detail ? 0.006 / length : 0);
        const low = [ta, tb].map((t) => Math.max(0, intrados(t) ?? 0));
        const high = [ta, tb].map((t, j) => Math.min(deckBottom(t) - 0.02, low[j] + RING));
        frame.block(meshes.trim, ta, tb, low, high, lateral, side, RELIEF * 1.8, stoneTone('voussoir', k).map((v) => Math.min(1, v * 1.06)));
      }
    }
  }
  // Barrel soffit under the arch, and solid end faces where the bridge meets the ground.
  for (let i = 0; i < n; i++) {
    const ta = station(i), tb = station(i + 1);
    if (intrados(ta) === null || intrados(tb) === null) continue;
    frame.quad(meshes.trim, [frame.at(ta, intrados(ta), -half), frame.at(tb, intrados(tb), -half),
      frame.at(tb, intrados(tb), half), frame.at(ta, intrados(ta), half)], [0, -1, 0], [0.7, 0.68, 0.64]);
  }
  for (const t of [0, 1]) {
    const along = point(Math.min(1, t + 0.01), 0).map((v, k) => v - point(Math.max(0, t - 0.01), 0)[k]);
    frame.quad(meshes.trim, [frame.at(t, -0.05, -half), frame.at(t, -0.05, half), frame.at(t, deckBottom(t), half),
      frame.at(t, deckBottom(t), -half)], t ? along : along.map((v) => -v), [0.8, 0.78, 0.74]);
  }
  if (parapet) buildBridgeParapets(plan, meshes, point, frame, { half, detail, stoneTone });
}

function buildBridgeParapets(plan, meshes, point, frame, { half, detail, stoneTone }) {
  const n = frame.samples, length = plan.curve.length, top = (t) => point(t, 0)[1] + PARAPET.height;
  for (const side of [-1, 1]) {
    const outer = side * half, inner = side * (half - PARAPET.thickness);
    for (let i = 0; i < n; i++) {
      const ta = i / n, tb = (i + 1) / n;
      for (const [lateral, facing] of [[outer, side], [inner, -side]]) {
        frame.quad(meshes.trim, [frame.at(ta, point(ta, lateral)[1], lateral), frame.at(tb, point(tb, lateral)[1], lateral),
          frame.at(tb, top(tb), lateral), frame.at(ta, top(ta), lateral)], frame.outward((ta + tb) / 2, lateral, facing), [0.82, 0.8, 0.76]);
      }
    }
    for (const t of [0, 1]) {
      const along = point(Math.min(1, t + 0.01), 0).map((v, k) => v - point(Math.max(0, t - 0.01), 0)[k]);
      frame.quad(meshes.trim, [frame.at(t, point(t, 0)[1], inner), frame.at(t, point(t, 0)[1], outer),
        frame.at(t, top(t), outer), frame.at(t, top(t), inner)], t ? along : along.map((v) => -v), [0.8, 0.78, 0.74]);
    }
    if (detail) for (const [lateral, facing] of [[outer, side], [inner, -side]]) {
      coursedFace(frame, meshes.trim, { lateral, side: facing, length, n, stoneTone, key: `parapet:${lateral}`,
        low: (t) => point(t, 0)[1], high: top });
    }
    // Coping stones overhang both faces; their joints follow the path, not world axes.
    const count = Math.max(4, Math.ceil(length / 0.62));
    for (let k = 0; k < count; k++) {
      const gap = detail ? 0.008 / length : 0, ta = k / count + gap, tb = (k + 1) / count - gap;
      const low = [ta, tb].map(top), high = low.map((v) => v + PARAPET.coping), tone = stoneTone('coping', `${side}:${k}`);
      const o = side * (half + PARAPET.overhang), i = side * (half - PARAPET.thickness - PARAPET.overhang);
      frame.quad(meshes.trim, [frame.at(ta, high[0], i), frame.at(tb, high[1], i), frame.at(tb, high[1], o), frame.at(ta, high[0], o)], [0, 1, 0], tone);
      for (const [lateral, facing] of [[o, side], [i, -side]]) {
        frame.quad(meshes.trim, [frame.at(ta, low[0], lateral), frame.at(tb, low[1], lateral), frame.at(tb, high[1], lateral),
          frame.at(ta, high[0], lateral)], frame.outward((ta + tb) / 2, lateral, facing), tone.map((v) => v * 0.9));
      }
      for (const [t, sign] of [[ta, -1], [tb, 1]]) {
        const along = point(Math.min(1, t + 0.01), 0).map((v, j) => sign * (v - point(Math.max(0, t - 0.01), 0)[j]));
        frame.quad(meshes.trim, [frame.at(t, top(t), i), frame.at(t, top(t), o), frame.at(t, top(t) + PARAPET.coping, o),
          frame.at(t, top(t) + PARAPET.coping, i)], along, tone.map((v) => v * 0.85));
      }
    }
  }
}

/** Setts laid in staggered courses across the deck, raised over a darker bedding. */
export function buildShapeDeckSetts(plan, mesh, recipe, point, count) {
  if (recipe.detail < 2) return;
  const half = plan.primitive.width / 2, lanes = Math.max(2, Math.round(plan.primitive.width / 0.42));
  for (let i = 0; i < count; i++) {
    const t0 = i / count, t1 = (i + 1) / count, shift = (i % 2) * 0.5;
    for (let lane = -1; lane < lanes; lane++) {
      const a = Math.max(-half, -half + ((lane + shift) * 2 * half) / lanes + 0.018);
      const b = Math.min(half, -half + ((lane + shift + 1) * 2 * half) / lanes - 0.018);
      if (b - a < 0.06) continue;
      const v = 0.8 + shapeRandom(recipe.seed, plan.id, 'sett', `${i}:${lane}`) * 0.2;
      const lift = 0.012 + shapeRandom(recipe.seed, plan.id, 'sett-lift', `${i}:${lane}`) * 0.008;
      const span = (t1 - t0) * 0.06;
      const corners = [point(t0 + span, a, lift), point(t0 + span, b, lift), point(t1 - span, b, lift), point(t1 - span, a, lift)];
      const u = corners[1].map((x, k) => x - corners[0][k]), w = corners[2].map((x, k) => x - corners[0][k]);
      const up = u[2] * w[0] - u[0] * w[2];
      mesh.quad(...(up >= 0 ? corners : corners.toReversed()), [v, v * 0.98, v * 0.95]);
    }
  }
}
