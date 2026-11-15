import { arch, door, feature, frontStair, r2, shed, sill, volume, wall, win } from './ShapeCityParts.js';

const S = (st) => st.storey;

/** Dwellings: every realm picks at least five, styled by its grammar. */
export const HOUSE_BLUEPRINTS = {
  'house-cottage': (st) => [volume(st, 'cottage', 'Cottage', { w: 7.2, d: 5.2, stilts: true, openings: [
    door('door', 'front', 0.2), win('window', 'front', [-0.75, 0.8], 1),
    win('back', 'back', [-0.5, 0.5], 1), win('gable', 'right', 0, 1, { shutterPose: 'ajar' })],
  features: [feature('dormer', 'dormer', 'back', 0, { width: 1.6, depth: 1.4 })] })],

  'house-townhouse': (st) => {
    const h = S(st) * 2;
    return [volume(st, 'townhouse', 'Townhouse', { w: 5.2, d: 6.8, levels: 2, axis: 'depth', stilts: true, openings: [
      door('door', 'front', -0.6), win('shop', 'front', 0.55, 0.9, { width: 1.3 }),
      win('upper', 'front', [-0.7, 0.7], sill(h, 2, 1)), win('side', 'right', [-0.5, 0.5], sill(h, 2, 1)),
      win('rear', 'back', 0, 1)],
    features: [feature('upper-floor', 'jetty', undefined, undefined, { depth: 0.45 })] })];
  },

  'house-longhouse': (st) => {
    const house = volume(st, 'longhouse', 'Longhouse', { w: 12, d: 5.4, storey: S(st) * 1.05, stilts: true, openings: [
      door('door', 'front', -0.35), win('window', 'front', [-0.85, 0.15, 0.55, 0.9], 1),
      win('back', 'back', [-0.6, 0, 0.6], 1), door('end-door', 'right', 0)],
    features: [feature('porch', 'porch', 'front', -0.35, { width: 2.4, depth: 1.6, height: 2.6 })] });
    return [house, shed(st, 'lean-to', 'Wood lean-to', { at: [r2(-house.footprint.width / 2 - 1.45), 0], w: 2.8, d: 4.4, storey: 2.3,
      roof: { family: 'hip', rise: 0.9 }, openings: [arch('open', 'left', 0, { width: 3, height: 2 })] })];
  },

  'house-double': (st) => {
    const h = S(st) * 2, a = volume(st, 'house-a', 'Tall half', { w: 6, d: 5.6, levels: 2, openings: [
      door('door', 'front', 0.5), win('low', 'front', -0.5, 1), win('upper', 'front', [-0.6, 0.6], sill(h, 2, 1)),
      win('side', 'left', 0, sill(h, 2, 1))] });
    const wb = 5.2, b = volume(st, 'house-b', 'Low half', { at: [r2((a.footprint.width + wb * st.scale) / 2 - 0.05), 0.35], w: wb, d: 5,
      storey: S(st) * 1.25, openings: [door('door', 'front', -0.4), win('low', 'front', 0.6, 1), win('side', 'right', 0, 1)],
      features: [feature('dormer', 'dormer', 'front', 0.6, { width: 1.4, depth: 1.3 })] });
    return [a, b];
  },

  'house-tower': (st) => {
    const h = S(st) * 3, tower = volume(st, 'tower-house', 'Tower house', { w: 5, d: 5, levels: 3, roof: { family: 'hip' },
      thickness: 0.4, openings: [door('door', 'front', 0), win('first', 'front', 0, sill(h, 3, 1)), win('top', 'front', [-0.6, 0.6], sill(h, 3, 2)),
        win('side', 'right', 0, sill(h, 3, 1)), win('side-top', 'left', 0, sill(h, 3, 2))] });
    return [tower, volume(st, 'wing', 'Hall wing', { at: [r2(tower.footprint.width / 2 + 2.6 * st.scale - 0.05), 0.4], w: 5.2, d: 4.4,
      openings: [door('door', 'front', 0.3), win('window', 'front', -0.6, 1), win('end', 'right', 0, 1)] })];
  },

  'house-courtyard': (st) => {
    const h = S(st) * 2, main = volume(st, 'main', 'Main range', { w: 9, d: 5, levels: 2, openings: [
      door('door', 'front', 0), win('low', 'front', [-0.7, 0.7], 1), win('upper', 'front', [-0.8, -0.25, 0.25, 0.8], sill(h, 2, 1)),
      win('back', 'back', [-0.5, 0.5], sill(h, 2, 1))] });
    const wingW = 6, wing = volume(st, 'wing', 'Side wing', { at: [r2(-main.footprint.width / 2 + 2.1 * st.scale), r2(main.footprint.depth / 2 + wingW * st.scale / 2 - 0.05)],
      rotation: 90, w: wingW, d: 4.2, openings: [door('door', 'back', 0), win('window', 'back', [-0.7, 0.7], 1)] });
    return [main, wing, wall(st, 'yard-wall', 'Yard wall', { at: [r2(1.4 * st.scale), r2(main.footprint.depth / 2 + wingW * st.scale)],
      length: 6.4 * st.scale, height: 1.5, bend: -0.6, openings: [{ id: 'yard-gate', at: 0.55, width: 1.8 }] })];
  },

  'house-hillside': (st) => {
    const lift = 1.4, under = volume(st, 'undercroft', 'Stone undercroft', { w: 7.6, d: 5.8, h: lift, surface: 'masonry', roof: { family: 'flat' },
      base: { style: 'batter', height: 0.7, out: 0.2 }, crown: null, chimney: false, windowBoxes: false, shutters: false,
      openings: [door('cellar', 'front', 0.55, { height: 1.3, width: 0.9, profile: 'square' })] });
    const house = volume(st, 'house', 'Terrace house', { elevation: lift, w: 7.2, d: 5.4, openings: [
      door('door', 'front', -0.45), win('window', 'front', [0.2, 0.8], 1), win('back', 'back', [-0.5, 0.5], 1), win('end', 'left', 0, 1)],
    features: [feature('balcony', 'balcony', 'right', 0, { width: 2.4, depth: 0.9, bottom: 1.2, height: 1 })] });
    return [under, house, frontStair(st, house, 'steps', lift, { along: r2(-1.4 * st.scale) })];
  },

  'house-round': (st) => {
    const hut = volume(st, 'roundhouse', 'Round house', { w: 6.2, d: 6.2, footprint: 'oval', storey: S(st) * 0.95, stilts: true,
      roof: { family: st.roof.family === 'gable' || st.roof.family === 'hip' ? 'cone' : st.roof.family, pitch: 0.55 },
      openings: [door('door', 'front', 0), win('window', 'right', 0, 1), win('window-left', 'left', 0, 1), win('back', 'back', 0, 1)] });
    return [hut, volume(st, 'store', 'Round store', { at: [r2(-3.9 * st.scale), r2(-1.5 * st.scale)], w: 3, d: 3, footprint: 'oval', storey: 2.3,
      roof: hut.roof.family === 'flat' ? { family: 'flat' } : { family: hut.roof.family, pitch: 0.6 }, chimney: false, windowBoxes: false,
      openings: [door('door', 'front', 0, { height: 1.8, width: 0.9 })] })];
  },
};

/** Farms: a farmstead, a barnyard with a raised granary, and a smallholder's croft. */
export const FARM_BLUEPRINTS = {
  'farm-farmstead': (st) => {
    const h = S(st) * 2, house = volume(st, 'farmhouse', 'Farmhouse', { w: 9, d: 6, levels: 2, openings: [
      door('door', 'front', -0.2), win('low', 'front', [-0.8, 0.4, 0.85], 1), win('upper', 'front', [-0.6, 0.6], sill(h, 2, 1)),
      win('back', 'back', [-0.5, 0.5], 1)], features: [feature('porch', 'porch', 'front', -0.2, { width: 2.2, depth: 1.4, height: 2.5 })] });
    const barn = shed(st, 'barn', 'Barn', { at: [r2(house.footprint.width / 2 + 3.4 * st.scale), r2(-1 * st.scale)], rotation: 90, w: 10, d: 6.4,
      storey: S(st) * 1.3, openings: [arch('barn-doors', 'back', 0, { width: 3, height: 3 }), win('hay', 'left', 0, 2.4, { width: 1, height: 0.8 })] });
    return [house, barn, wall(st, 'yard-fence', 'Farmyard wall', { at: [r2(1.5 * st.scale), r2(6.6 * st.scale)], length: 14 * st.scale, bend: -1.4,
      height: 1.1, surface: st.shed === 'planks' ? 'planks' : st.wall.surface, thickness: 0.3, openings: [{ id: 'cart-gate', at: 0.6, width: 2.8 }] })];
  },

  'farm-barnyard': (st) => {
    const barn = shed(st, 'great-barn', 'Great barn', { w: 12, d: 7, storey: S(st) * 1.4, roof: { family: 'gable' }, openings: [
      arch('threshing', 'front', 0, { width: 3.2, height: 3.4 }), arch('threshing-back', 'back', 0, { width: 3.2, height: 3.4 }),
      win('vent', 'front', [-0.8, 0.8], 2.4, { width: 0.5, height: 0.7, role: 'slit' }), door('side-door', 'right', 0)] });
    const granary = shed(st, 'granary', 'Raised granary', { at: [r2(-9 * st.scale), r2(1 * st.scale)], w: 3.6, d: 3.2, storey: 2.4, elevation: 1.2,
      roof: { family: 'hip' }, openings: [door('hatch', 'front', 0, { height: 1.7, width: 0.9 })] });
    return [barn, granary, frontStair(st, granary, 'granary-steps', 1.2, { timber: true }),
      wall(st, 'pen', 'Stock pen', { at: [r2(3 * st.scale), r2(7.8 * st.scale)], length: 10 * st.scale, bend: -3, height: 1, surface: 'planks', thickness: 0.2,
        openings: [{ id: 'pen-gate', at: 0.3, width: 1.6 }] })];
  },

  'farm-croft': (st) => {
    const croft = volume(st, 'croft', 'Croft house', { w: 6.6, d: 5, stilts: true, openings: [
      door('door', 'front', 0.3), win('window', 'front', -0.6, 1), win('back', 'back', 0, 1)] });
    const byre = shed(st, 'byre', 'Byre', { at: [r2(croft.footprint.width / 2 + 2.2 * st.scale - 0.05), 0.2], w: 4.4, d: 4.6, storey: 2.4,
      openings: [door('stall', 'front', 0, { width: 1.5 }), win('hay', 'right', 0, 1.4, { width: 0.8, height: 0.6 })] });
    return [croft, byre, wall(st, 'field-wall', 'Field wall', { at: [r2(-1 * st.scale), r2(7 * st.scale)], length: 16 * st.scale, bend: -2.2,
      height: 0.9, thickness: 0.5, surface: 'masonry', stonework: 'fieldstone', openings: [{ id: 'field-gap', at: 0.7, width: 1.8 }] })];
  },
};
