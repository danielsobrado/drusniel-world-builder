import { arch, door, feature, path, r2, shed, sill, volume, wall, win } from './ShapeCityParts.js';

const S = (st) => st.storey;

/** Inns: a roadside inn, a corner tavern and a courtyard lodge with a gallery. */
export const INN_BLUEPRINTS = {
  'inn-roadside': (st) => {
    const h = S(st) * 2, inn = volume(st, 'inn', 'Roadside inn', { w: 11, d: 6.6, levels: 2, ivy: Math.min(1, st.ivy + 0.15), stilts: true, openings: [
      door('door', 'front', 0, { width: 1.3, height: 2.3 }), win('tap', 'front', [-0.85, -0.45, 0.45, 0.85], 1, { width: 1 }),
      win('room', 'front', [-0.8, -0.3, 0.3, 0.8], sill(h, 2, 1)), win('back', 'back', [-0.6, 0, 0.6], sill(h, 2, 1)),
      win('gable', 'right', 0, sill(h, 2, 1))],
    features: [feature('upper-floor', 'jetty', undefined, undefined, { depth: 0.4 }), feature('porch', 'porch', 'front', 0, { width: 2.6, depth: 1.6, height: 2.7 }),
      feature('dormer', 'dormer', 'front', [-0.6, 0.6], { width: 1.5, depth: 1.4 })] });
    const stable = shed(st, 'stable', 'Stable', { at: [r2(-inn.footprint.width / 2 - 2.6 * st.scale), r2(2.2 * st.scale)], rotation: 90, w: 7.6, d: 4,
      storey: 2.8, openings: [door('stall', 'back', [-0.7, 0, 0.7], { width: 1.4, shutterPose: 'ajar' }), win('hay', 'left', 0, 1.6, { width: 0.8, height: 0.7 })] });
    return [inn, stable];
  },

  'inn-tavern': (st) => {
    const h = S(st) * 2, tavern = volume(st, 'tavern', 'Corner tavern', { w: 8, d: 7.2, levels: 2, roof: { family: 'hip' }, openings: [
      door('door', 'front', -0.3, { width: 1.2 }), win('tap', 'front', 0.7, 1, { width: 1.3 }), win('upper', 'front', [-0.6, 0.6], sill(h, 2, 1)),
      win('side', 'right', [-0.6, 0.6], 1), win('side-upper', 'right', 0, sill(h, 2, 1)), door('cellar', 'left', 0.4, { height: 1.9 })],
    features: [feature('bay', 'bay', 'right', 0, { width: 2.2, depth: 0.8, bottom: sill(h, 2, 1) - 0.4, height: 1.8 }),
      feature('door-hood', 'porch', 'front', -0.3, { width: 2, depth: 1.2, height: 2.6 })] });
    return [tavern, wall(st, 'beer-garden', 'Beer garden wall', { at: [r2(1 * st.scale), r2(tavern.footprint.depth / 2 + 3.6 * st.scale)],
      length: 9 * st.scale, bend: -2, height: 1, thickness: 0.35, openings: [{ id: 'garden-gate', at: 0.25, width: 1.4 }] })];
  },

  'inn-lodge': (st) => {
    const h = S(st) * 2, main = volume(st, 'lodge', 'Lodge house', { w: 12, d: 6, levels: 2, openings: [
      door('door', 'front', [-0.5, 0.5]), win('low', 'front', [-0.9, -0.15, 0.15, 0.9], 1), win('room', 'front', [-0.85, -0.5, -0.15, 0.15, 0.5, 0.85], sill(h, 2, 1)),
      door('gallery-door', 'front', 0, { bottom: r2(h / 2) })],
    features: [feature('dormer', 'dormer', 'back', [-0.5, 0.5], { width: 1.6, depth: 1.4 })] });
    const wingW = 8, wing = volume(st, 'wing', 'Guest wing', { at: [r2(main.footprint.width / 2 - 2.2 * st.scale), r2(main.footprint.depth / 2 + wingW * st.scale / 2 - 0.05)],
      rotation: 90, w: wingW, d: 4.4, levels: 2, openings: [door('door', 'front', [-0.5, 0.5]), win('window', 'front', [-0.75, 0, 0.75], sill(h, 2, 1))] });
    const galleryZ = r2(main.footprint.depth / 2 + 0.7);
    return [main, wing,
      path(st, 'gallery', 'Timber gallery', { at: [r2(-1 * st.scale), galleryZ], length: r2(8 * st.scale), width: 1.2, elevation: r2(h / 2), mode: 'walkway',
        support: 'piers', style: { floor: 'timber', supports: 'timber', railing: 'timber' } }),
      path(st, 'gallery-stair', 'Gallery stair', { at: [r2(-5.6 * st.scale), r2(galleryZ + 2.1)], rotation: -90, length: r2(Math.max(3, h * 0.65)), width: 1.1,
        rise: r2(h / 2), mode: 'stairs', style: { floor: 'timber', supports: 'timber', railing: 'timber' } }),
      wall(st, 'coach-wall', 'Coach yard wall', { at: [r2(-2.5 * st.scale), r2(main.footprint.depth / 2 + wingW * st.scale)], length: 9 * st.scale,
        height: 1.8, bend: 0, openings: [{ id: 'coach-gate', at: 0.45, width: 3 }] })];
  },
};

/** Shops: realms pick at least five of these trades. */
export const SHOP_BLUEPRINTS = {
  'shop-general': (st) => {
    const h = S(st) * 2;
    return [volume(st, 'store', 'General store', { w: 7.6, d: 5.6, levels: 2, stilts: true, openings: [
      door('door', 'front', 0), win('display', 'front', [-0.75, 0.75], 0.7, { width: 1.6, height: 1.3, shutterPose: 'open' }),
      win('upper', 'front', [-0.6, 0.6], sill(h, 2, 1)), door('loft-door', 'right', 0, { bottom: r2(h / 2), height: 1.7 })],
    features: [feature('awning', 'porch', 'front', 0, { width: 6, depth: 1.5, height: 2.6 })] })];
  },

  'shop-baker': (st) => {
    const bakery = volume(st, 'bakery', 'Bakery', { w: 6.6, d: 5.4, storey: S(st) * 1.15, openings: [
      door('door', 'front', 0.5), win('counter', 'front', -0.45, 0.8, { width: 1.6, height: 1.1, shutterPose: 'open' }), win('back', 'back', 0, 1)],
    features: [feature('dormer', 'dormer', 'front', 0, { width: 1.5, depth: 1.3 })] });
    return [bakery, volume(st, 'oven', 'Bread oven', { at: [r2(-bakery.footprint.width / 2 - 1.3 * st.scale), r2(-0.6 * st.scale)], w: 2.8, d: 2.6,
      footprint: 'oval', storey: 1.7, surface: 'masonry', taper: 0.85, thickness: 0.5, roof: { family: 'bell', rise: 1.3, sweep: 0.8, overhang: 0.1 },
      base: null, chimney: true, windowBoxes: false, shutters: false, openings: [arch('mouth', 'left', 0, { width: 0.8, height: 0.8, bottom: 0.4 })] })];
  },

  'shop-corner': (st) => {
    const h = S(st) * 2;
    return [volume(st, 'corner-shop', 'Corner shop', { w: 6.2, d: 6.2, levels: 2, roof: { family: 'hip' }, openings: [
      door('door', 'front', 0.6), win('front-display', 'front', -0.4, 0.7, { width: 1.8, height: 1.3 }),
      win('side-display', 'right', 0, 0.7, { width: 1.8, height: 1.3 }), win('upper', 'front', [-0.6, 0.6], sill(h, 2, 1)),
      win('side-upper', 'right', [-0.6, 0.6], sill(h, 2, 1))],
    features: [feature('upper-floor', 'jetty', undefined, undefined, { depth: 0.4 }),
      feature('corner-turret', 'turret', 'front', 1, { roof: 'cone', width: 1.6, height: 3, bottom: r2(h / 2 + 0.3) })] })];
  },

  'shop-stalls': (st) => [-1, 0, 1].map((i) => shed(st, `stall-${i + 2}`, 'Market stall', { at: [r2(i * 3.5 * st.scale), r2(Math.abs(i) * 0.6)],
    rotation: i * -8, w: 3.2, d: 2.6, storey: 2.4, roof: { family: 'hip', rise: 1.1, overhang: 0.55, sweep: 0.5 },
    openings: [arch('counter', 'front', 0, { width: 2.6, height: 2.1 }), arch('side', 'right', 0, { width: 1.6, height: 2.1 })] })),

  'shop-warehouse': (st) => {
    const h = S(st) * 2, store = shed(st, 'warehouse', 'Trade warehouse', { w: 9.6, d: 6.4, levels: 2, openings: [
      arch('loading', 'front', -0.4, { width: 2.6, height: 2.6 }), door('office', 'front', 0.7),
      door('hoist', 'front', 0.15, { bottom: r2(h / 2), height: 1.8, width: 1.2 }), win('upper', 'front', [-0.8, 0.8], sill(h, 2, 1))],
    features: [feature('hoist-landing', 'balcony', 'front', 0.15, { width: 1.9, depth: 0.8, bottom: r2(h / 2), height: 1 })] });
    return [store, path(st, 'loading-ramp', 'Loading ramp', { at: [r2(-1.6 * st.scale), r2(store.footprint.depth / 2 + 2.2)], rotation: -90, length: 3.4,
      width: 2.4, elevation: 0, rise: 0.4, mode: 'ramp', railing: false })];
  },

  'shop-curio-tower': (st) => {
    const h = S(st) * 3, tower = volume(st, 'curio', 'Curio tower shop', { w: 4.6, d: 4.6, levels: 3, roof: { family: 'hip' }, thickness: 0.35, openings: [
      door('door', 'front', 0), win('display', 'right', 0, 0.8, { width: 1.2, height: 1.2 }), win('mid', 'front', 0, sill(h, 3, 1)),
      win('top', 'front', 0, sill(h, 3, 2)), win('top-side', 'left', 0, sill(h, 3, 2), { shutterPose: 'closed' })],
    features: [feature('turret', 'turret', 'left', 0.8, { roof: 'spire', width: 1.5, height: 3, bottom: sill(h, 3, 2) })] });
    return [tower, shed(st, 'workroom', 'Workroom', { at: [r2(tower.footprint.width / 2 + 1.9 * st.scale - 0.05), 0.3], w: 3.8, d: 3.8, storey: 2.6,
      openings: [door('door', 'front', 0), win('window', 'right', 0, 1)] })];
  },
};

