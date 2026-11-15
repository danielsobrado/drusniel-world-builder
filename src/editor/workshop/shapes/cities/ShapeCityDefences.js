import { arch, door, feature, path, r2, sill, slit, volume, wall, win } from './ShapeCityParts.js';

const towerVolume = (st, id, label, o) => {
  const t = st.tower;
  return volume(st, id, label, { surface: t.surface, stonework: t.stonework, footprint: t.footprint, shutters: false, windowBoxes: false,
    chimney: false, ivy: st.ivy * 0.6, thickness: 0.45, base: { style: 'batter', height: 1.4, out: 0.3 },
    roof: t.roof === 'flat' ? { family: 'flat' } : { family: t.roof, pitch: t.roof === 'spire' ? 0.9 : 0.6 },
    crown: t.roof === 'flat' ? (t.crown ?? { style: 'parapet', height: 0.7 }) : t.crown, ...o });
};

/** Towers: a watchtower, a keep tower and a gate tower, each in the realm's tower grammar. */
export const TOWER_BLUEPRINTS = {
  'tower-watch': (st) => [towerVolume(st, 'watchtower', 'Watchtower', { w: 4.8, d: 4.8, h: 10, levels: 3, openings: [
    door('door', 'front', 0), slit('loop', 'right', 0, 3.6), slit('loop-left', 'left', 0, 5.2), slit('loop-back', 'back', 0, 3.6),
    win('watch', 'front', 0, 7.2, { height: 1.4 })] })],

  'tower-keep': (st) => [towerVolume(st, 'keep', 'Keep tower', { w: 6.4, d: 6.4, h: 12.5, levels: 4, footprint: 'rounded', corner: 0.25,
    roof: st.tower.roof === 'flat' ? { family: 'flat' } : { family: 'hip', pitch: 0.55 },
    crown: st.tower.roof === 'flat' ? st.tower.crown ?? { style: 'parapet', height: 0.75 } : { style: 'corbelled', projection: 0.35, height: 0.8, corbelSpacing: 0.7 },
    openings: [door('door', 'front', 0, { width: 1.2, height: 2.4 }), slit('loop', 'front', [-0.6, 0.6], 4), win('hall', 'front', 0, sill(12.5, 4, 2), { height: 1.6 }),
      win('top', 'right', 0, sill(12.5, 4, 3)), slit('side', 'left', 0, 5)],
    features: [feature('buttress', 'buttress', 'front', [-1, 1], { width: 0.7, depth: 0.9, height: 5 })] })],

  'tower-gate': (st) => {
    const gate = towerVolume(st, 'gate-tower', 'Gate tower', { w: 6, d: 6, h: 9, levels: 2, footprint: 'rounded', corner: 0.2,
      roof: st.tower.roof === 'flat' ? { family: 'flat' } : { family: 'hip', pitch: 0.5 },
      openings: [arch('gate', 'front', 0, { width: 2.8, height: 3.8 }), arch('gate-in', 'back', 0, { width: 2.8, height: 3.8 }),
        win('guard', 'front', 0, 5.6, { height: 1.3 })] });
    const half = gate.footprint.width / 2, wallH = Math.min(6, 4.8 * st.scale);
    return [gate, ...[-1, 1].map((s) => wall(st, `wall-${s < 0 ? 'left' : 'right'}`, 'Curtain wall', { at: [r2(s * (half + 4.4)), 0], length: 9,
      height: wallH, thickness: 1, crown: true, automaticGates: false }))];
  },

  'tower-signal': (st) => [towerVolume(st, 'signal', 'Signal tower', { w: 3.6, d: 3.6, h: 13, levels: 4, taper: 0.92, openings: [
    door('door', 'front', 0), door('platform-door', 'front', 0, { bottom: 9.6 }), slit('loop', 'right', 0, 5), win('high', 'back', 0, 9.8)],
  features: [feature('platform', 'balcony', 'front', 0, { width: 3.4, depth: 1, bottom: 9.6, height: 1.05 })] })],
};

/** Walls and stairs in the realm's materials. */
export const WALL_BLUEPRINTS = {
  'wall-town': (st) => [wall(st, 'curtain', 'Town wall', { length: 18, bend: 1.4, height: 5, thickness: 1.1, crown: true,
    base: { style: 'batter', height: 1, out: 0.25 }, openings: [{ id: 'town-gate', at: 0.5, width: 3, height: 3.6 }], automaticGates: false }),
  towerVolume(st, 'bastion', 'Wall bastion', { at: [9.4, 0.8], w: 4.6, d: 4.6, h: 6.4, levels: 2, openings: [slit('loop', 'front', [-0.5, 0.5], 2.6)] })],

  'wall-garden': (st) => [wall(st, 'garden', 'Garden wall', { length: 12, bend: 3, height: 1.3, thickness: 0.4, surface: st.wall.surface,
    openings: [{ id: 'garden-gate', at: 0.6, width: 1.5 }] }),
  wall(st, 'garden-low', 'Low garden wall', { at: [-4.8, 4.2], rotation: 70, length: 6, bend: 1.2, height: 0.9, thickness: 0.4 })],

  'wall-palisade': (st) => [wall(st, 'palisade', 'Palisade', { length: 16, bend: 2, height: 3.4, surface: 'planks', thickness: 0.35,
    openings: [{ id: 'palisade-gate', at: 0.45, width: 2.6, height: 2.8 }], automaticGates: false }),
  path(st, 'fighting-step', 'Fighting step', { at: [3.6, -1.6], length: 6, width: 1.2, elevation: 2.2, mode: 'walkway', support: 'piers',
    style: { floor: 'timber', supports: 'timber', railing: 'timber' } }),
  path(st, 'step-ladder', 'Step ladder', { at: [8.6, -1.6], rotation: 180, length: 3.6, width: 1, rise: 2.2, mode: 'stairs',
    style: { floor: 'timber', supports: 'timber', railing: 'timber' } })],

  'wall-retaining': (st) => [wall(st, 'retaining', 'Terrace retaining wall', { length: 14, bend: 1.6, height: 1.8, thickness: 0.7,
    base: { style: 'batter', height: 0.7, out: 0.2 }, automaticGates: false }),
  path(st, 'terrace', 'Terrace walk', { at: [-0.4, -1.4], length: 12, width: 2, elevation: 1.8, mode: 'walkway', support: 'none', railing: false }),
  path(st, 'terrace-steps', 'Terrace steps', { at: [4, 1.8], rotation: -90, length: 3.6, width: 1.5, rise: 1.8, mode: 'stairs' })],
};

/** A solid stone terrace for stairs to climb, so a flight always arrives somewhere. */
const terrace = (st, id, label, o) => volume({ ...st, scale: 1 }, id, label, { surface: 'masonry', stonework: st.wall.stonework, roof: { family: 'flat' },
  crown: null, interior: 'none', chimney: false, windowBoxes: false, shutters: false, ivy: Math.max(0.3, st.ivy), corner: 0.2,
  base: { style: 'batter', height: 0.7, out: 0.2 }, ...o });

export const STAIR_BLUEPRINTS = {
  'stair-switchback': (st) => [
    terrace(st, 'terrace', 'Upper terrace', { at: [0, -2.7], w: 9, d: 5, h: 2.4 }),
    path(st, 'flight-1', 'Lower flight', { at: [0.6, 2.3], rotation: 180, length: 4.4, width: 1.4, rise: 1.2, mode: 'stairs' }),
    path(st, 'landing', 'Landing', { at: [-2.6, 1.4], rotation: 90, length: 2.6, width: 1.8, elevation: 1.2, mode: 'walkway', support: 'piers' }),
    path(st, 'flight-2', 'Upper flight', { at: [0, 0.6], length: 3.4, width: 1.4, elevation: 1.2, rise: 1.2, mode: 'stairs' })],

  'stair-bridge': (st) => [
    path(st, 'bridge', 'Arched bridge', { length: 9, width: 2.4, elevation: 1.2, mode: 'bridge', support: 'arch' }),
    path(st, 'approach-west', 'West steps', { at: [-6.6, 0], length: 4.2, width: 2.2, rise: 1.2, mode: 'stairs' }),
    path(st, 'approach-east', 'East steps', { at: [6.6, 0], rotation: 180, length: 4.2, width: 2.2, rise: 1.2, mode: 'stairs' })],

  'stair-grand': (st) => [
    terrace(st, 'terrace', 'Upper terrace', { at: [0, -5.2], w: 11, d: 4, h: 2.4 }),
    path(st, 'grand', 'Grand stair', { rotation: -90, length: 6, width: 3.6, rise: 2.4, mode: 'stairs', railing: false }),
    ...[-1, 1].map((s) => wall(st, `cheek-${s < 0 ? 'left' : 'right'}`, 'Stair cheek wall', { at: [r2(s * 2.2), 0], rotation: 90, length: 6.4,
      height: 1.4, thickness: 0.45, automaticGates: false }))],
};
