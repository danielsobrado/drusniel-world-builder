import { path, shed, volume, wall } from './ShapeCityParts.js';

/** Low stone piece (basin, plinth, column) in the realm's masonry: no windows, flat stone top. */
const stonework = (st, id, label, o) => volume({ ...st, scale: 1 }, id, label, { surface: 'masonry', roof: { family: 'flat' }, crown: null,
  base: null, chimney: false, windowBoxes: false, shutters: false, interior: 'none', decorate: false, footprint: 'oval', ...o });

const bench = (st, id, at, rotation) => wall(st, id, 'Bench wall', { at, rotation, length: 3.2, bend: 0.5, height: 0.55, thickness: 0.5,
  automaticGates: false });

/** Civic squares that knit a city together, in the realm's stone and paving. */
export const PLAZA_BLUEPRINTS = {
  'plaza-fountain': (st) => [
    stonework(st, 'basin', 'Fountain basin', { w: 5.2, d: 5.2, h: 1, thickness: 0.4 }),
    stonework(st, 'column', 'Fountain column', { w: 2, d: 2, h: 2.6, thickness: 0.3, taper: 0.65 }),
    ...[[0, 6.5, 90], [0, -6.5, 90], [6.5, 0, 0], [-6.5, 0, 0]].map(([x, z, rotation], i) => path(st, `walk-${i + 1}`, 'Square walk',
      { at: [x, z], rotation, length: 6.4, width: 2.4, mode: 'walkway', railing: false, support: 'none' })),
    ...[[5.5, 5.5, 135], [-5.5, 5.5, 45], [-5.5, -5.5, -45], [5.5, -5.5, -135]].map(([x, z, r], i) => bench(st, `bench-${i + 1}`, [x, z], r)),
  ],

  'plaza-market': (st) => [
    stonework(st, 'cross-step', 'Market cross steps', { w: 4, d: 4, h: 1, footprint: 'rounded', corner: 0.2, thickness: 0.4 }),
    stonework(st, 'cross-shaft', 'Market cross', { elevation: 1, w: 2, d: 2, h: 4.2, footprint: 'rounded', corner: 0.1, thickness: 0.3, taper: 0.65,
      roof: st.tower.roof === 'flat' ? { family: 'flat' } : { family: st.tower.roof === 'bell' ? 'bell' : 'cone', rise: 1.2, overhang: 0.2, sweep: 0.5 } }),
    ...[[0, -7, 0], [6.5, 0, -90], [0, 7, 180], [-6.5, 0, 90]].map(([x, z, rotation], i) => shed(st, `stall-${i + 1}`, 'Market stall', {
      at: [x, z], rotation, w: 3.4, d: 2.6, storey: 2.3, roof: { family: 'hip', rise: 1, overhang: 0.55, sweep: 0.5 },
      openings: [{ id: 'counter', role: 'arch', side: 'front', f: 0, bottom: 0, width: 2.6, height: 2 }] })),
    wall(st, 'square-edge', 'Square edge wall', { at: [0, 11], length: 16, bend: -2, height: 0.8, thickness: 0.45,
      openings: [{ id: 'way', at: 0.5, width: 2.4 }] }),
    path(st, 'market-walk', 'Market walk', { at: [0, 6.5], rotation: 90, length: 9, width: 2.4, mode: 'walkway', railing: false, support: 'none' }),
  ],
};
