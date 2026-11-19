import { footprintSideLength, frontDoor } from './ShapeSidePlacement.js';
import { decorateFacade } from './ShapeCityDetails.js';

/**
 * A realm's architectural grammar. Every kit blueprint reads these instead of hard-coding a
 * look, so one blueprint becomes a Lumeshire townhouse, a Frostgard log house or a goblin
 * stilt hut. Defaults are the soft diorama language of the craft workshops.
 */
export const CITY_STYLE_DEFAULTS = Object.freeze({
  surface: 'plaster', facade: 'timber', stonework: 'fieldstone', shed: 'planks',
  footprint: 'rounded', corner: 0.35, gable: 'width', scale: 1, storey: 2.8, thickness: 0.3, taper: 1,
  roof: { family: 'gable', pitch: 0.55, overhang: 0.5, sweep: 0.45, sag: 0.1 },
  door: 'arched', window: 'square', shutters: true, windowBoxes: true, chimney: true, ivy: 0.45, age: 0.3,
  base: { style: 'plinth', height: 0.68, out: 0.1 }, stilts: 0, flatCrown: null,
  details: ['windows'], surroundings: [], yard: { surface: 'masonry', height: 1, depth: 4.6 },
  tower: { surface: 'masonry', stonework: 'fieldstone', footprint: 'oval', roof: 'cone', crown: null },
  wall: { surface: 'masonry', stonework: 'fieldstone', crown: { style: 'parapet', height: 0.7 } },
  path: { floor: 'stone', railing: 'stone' },
});

const NESTED = ['roof', 'base', 'tower', 'wall', 'path', 'yard'];

/** Later layers win; nested groups merge one level deep (`base: null` removes the plinth). */
export function cityStyle(...layers) {
  return layers.filter(Boolean).reduce((style, layer) => {
    const next = { ...style, ...layer };
    for (const key of NESTED) if (layer[key] && style[key]) next[key] = { ...style[key], ...layer[key] };
    return next;
  }, {});
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const r2 = (v) => Math.round(v * 100) / 100;
/** Dormers belong on eaves: any side of a hip, the long sides of a gable, never a gable end. */
const eaveSide = (family, axis, side) => family === 'hip' || (family === 'gable' && (axis === 'depth') === (side === 'left' || side === 'right'));
const list = (v) => (Array.isArray(v) ? v : [v]);

/** Sill height of a storey: ground windows sit a little higher than upper ones. */
export const sill = (h, levels, storey = 0) => r2((h * storey) / levels + (storey ? 0.85 : 1));

export const door = (id, side, f = 0, extra = {}) => ({ id, role: 'door', side, f, bottom: 0, width: 1.05, height: 2.15, ...extra });
export const arch = (id, side, f = 0, extra = {}) => ({ id, role: 'arch', side, f, bottom: 0, width: 2.2, height: 2.4, ...extra });
export const win = (id, side, f, bottom, extra = {}) => ({ id, role: 'window', side, f, bottom, width: 0.85, height: 1.1, ...extra });
export const slit = (id, side, f, bottom, extra = {}) => ({ id, role: 'slit', side, f, bottom, width: 0.14, height: 1.2, profile: 'square', ...extra });
export const feature = (id, kind, side, f, extra = {}) => ({ id, kind, side, f, ...extra });

/** `f` places along a side from -1 (left end) to 1 (right end) of its usable straight run. */
function place(items, footprint, h, st) {
  return items.filter(Boolean).map(({ f, ...item }) => {
    if (item.role) {
      item.profile ??= item.role === 'window' ? st.window : st.door;
      item.bottom = r2(Math.min(item.bottom, h - 0.5));
      item.height = r2(Math.min(item.height, h - item.bottom - 0.05));
    }
    if (item.kind) item.width = r2(clamp(item.width ?? 2, 0.6, 8));
    if (item.side === undefined || item.at !== undefined) return item;
    const usable = Math.max(0, footprintSideLength(footprint, item.side) / 2 - (item.width ?? 1) / 2 - 0.12);
    const along = list(f ?? 0).map((v) => r2(v * usable));
    return { ...item, along: along.length === 1 ? along[0] : along };
  });
}

/** Authored openings and features, then the realm's facade details unless the shape opts out. */
const detailed = (st, o, host, openings, features) =>
  (o.decorate === false ? { openings, features } : decorateFacade(st, host, openings, features));

/** One building volume in the realm's grammar. Dimensions are before the realm's `scale`. */
export function volume(st, id, label, o) {
  const w = r2(o.w * st.scale), d = r2(o.d * st.scale), levels = o.levels ?? 1;
  const h = r2(o.h ?? (o.storey ?? st.storey) * levels);
  const roof = { ...st.roof, ...o.roof }, axis = o.axis ?? st.gable;
  const conical = ['cone', 'bell', 'spire'].includes(roof.family);
  const span = ['gable', 'shed'].includes(roof.family) ? (axis === 'width' ? d : w) : Math.min(w, d);
  const family = o.footprint ?? st.footprint;
  const footprint = family === 'oval' ? { family, width: w, depth: d }
    : { family, width: w, depth: d, cornerRadius: r2(Math.min(o.corner ?? st.corner, Math.min(w, d) / 2 - 0.05)) };
  const surface = o.surface ?? st.surface, base = o.base === undefined ? st.base : o.base;
  const crown = o.crown ?? (roof.family === 'flat' ? st.flatCrown : null);
  return {
    kind: 'curved-volume', id, label, position: o.at ?? [0, 0],
    ...(o.rotation ? { rotation: o.rotation } : {}), ...(o.elevation ? { elevation: o.elevation } : {}),
    footprint, height: h, levels,
    thickness: Math.floor(clamp(o.thickness ?? st.thickness, 0.12, Math.min(w, d) / 5) * 100) / 100,
    taper: o.taper ?? st.taper, surface,
    ...(surface === 'plaster' ? { facade: o.facade ?? st.facade } : {}),
    stonework: o.stonework ?? st.stonework,
    roof: roof.family === 'flat' ? { family: 'flat' } : {
      family: roof.family, axis, overhang: roof.overhang, sweep: roof.sweep, sag: conical ? 0 : roof.sag,
      rise: r2(clamp(roof.rise ?? roof.pitch * span * (conical ? 1.3 : 1), 0.4, 12)),
    },
    shutters: o.shutters ?? st.shutters, windowBoxes: o.windowBoxes ?? st.windowBoxes,
    chimney: o.chimney ?? st.chimney, ivyDensity: o.ivy ?? st.ivy, age: o.age ?? st.age,
    ...(base && base.style !== 'none' ? { base: { ...base, height: Math.min(base.height, h / 2) } } : {}),
    ...(crown ? { crown } : {}), ...(o.stages ? { stages: o.stages } : {}),
    ...(o.interior ? { interior: o.interior } : {}),
    ...(o.stilts ? { stilts: true } : {}),
    ...detailed(st, o, { footprint, h, levels, surface, roof: { family: roof.family, axis } },
      place(o.openings ?? [], footprint, h, st),
      place((o.features ?? []).filter((f) => f && (f.kind !== 'dormer' || eaveSide(roof.family, axis, f.side))), footprint, h, st)),
  };
}

/** Outbuilding in the realm's shed material: no plinth, no window boxes, rougher. */
export const shed = (st, id, label, o) => volume(st, id, label, {
  surface: st.shed, base: null, windowBoxes: false, chimney: false, shutters: st.shutters, decorate: false,
  age: Math.min(1, st.age + 0.15), corner: Math.min(st.corner, 0.2), ...o,
  roof: { sweep: Math.min(st.roof.sweep, 0.35), sag: Math.min(0.3, st.roof.sag + 0.05), ...o.roof },
});

export function wall(st, id, label, o) {
  const s = st.wall, surface = o.surface ?? s.surface;
  return {
    kind: 'curved-wall', id, label, position: o.at ?? [0, 0], ...(o.rotation ? { rotation: o.rotation } : {}),
    surface, stonework: o.stonework ?? s.stonework, length: r2(o.length), bend: o.bend ?? 0,
    height: o.height, thickness: o.thickness ?? (surface === 'planks' ? 0.22 : 0.45),
    ...(o.crown === true && s.crown ? { crown: s.crown } : {}),
    ...(o.base ? { base: o.base } : {}), ...(o.automaticGates === false ? { automaticGates: false } : {}),
    openings: (o.openings ?? []).map((g) => ({ role: 'arch', profile: surface === 'planks' ? 'square' : st.door, bottom: 0, ...g,
      height: Math.min(g.height ?? o.height, o.height) })),
  };
}

export function path(st, id, label, o) {
  const { at, ...rest } = o;
  return { kind: 'traversal', id, label, position: at ?? [0, 0], width: 1.6, elevation: 0, rise: 0, mode: 'auto',
    style: { floor: st.path.floor, railing: st.path.railing, supports: st.path.railing }, ...rest };
}

/** Local offset of a volume (in its own frame) to world, matching placeShapePoint. */
export function beside(volumeLike, [lx, lz]) {
  const a = ((volumeLike.rotation ?? 0) * Math.PI) / 180, [px, pz] = volumeLike.position;
  return [r2(px + lx * Math.cos(a) - lz * Math.sin(a)), r2(pz + lx * Math.sin(a) + lz * Math.cos(a))];
}

/** Stairs that climb from the ground up to `rise` at a volume's front door (local +z face). */
export function frontStair(st, host, id, rise, { along = 0, gap = 0.2, timber = false } = {}) {
  const length = r2(Math.max(1.6, rise * 1.7)), d = host.footprint.depth;
  return path(st, id, 'Front steps', { at: beside(host, [along, d / 2 + gap + length / 2]),
    rotation: (host.rotation ?? 0) - 90, length, width: 1.4, rise, mode: 'stairs',
    ...(timber ? { style: { floor: 'timber', supports: 'timber', railing: 'timber' } } : {}) });
}

/** Lift every volume flagged `stilts` onto a pier-supported deck with a stair, when the realm builds on stilts. */
export function raiseOnStilts(st, primitives) {
  return primitives.flatMap(({ stilts, ...p }) => {
    if (!stilts || !(st.stilts > 0)) return [p];
    const lifted = { ...p, elevation: r2((p.elevation ?? 0) + st.stilts) };
    const w = p.footprint.width, d = p.footprint.depth, timber = { floor: 'timber', supports: 'timber', railing: 'timber' };
    return [lifted,
      path(st, `${p.id}-deck`, 'Stilt deck', { at: p.position, rotation: p.rotation ?? 0, length: Math.min(32, r2(w + 1.2)),
        width: Math.min(8, r2(d + 1.2)), elevation: lifted.elevation, mode: 'walkway', support: 'piers', railing: false, style: timber }),
      // The ladder climbs to the front door, wherever along the front it is.
      frontStair(st, p, `${p.id}-ladder`, lifted.elevation, { along: frontDoor(p.openings)?.along ?? 0, gap: 0.6, timber: true })];
  });
}
