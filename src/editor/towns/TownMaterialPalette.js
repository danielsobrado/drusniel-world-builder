import { TOWN_SKINS, bannerColourFor, skinFor } from './TownSkins.js';

/**
 * Regional looks for the one shared town material.
 *
 * Every town draws its opaque surfaces with TownKitMaterial and its windows
 * with TownGlassMaterial. What changes per town is table values: its city skin
 * (TownSkins: frost, imperial, sun, marsh, plains), the stone of its culture's
 * style, its render finish, its culture's banner colour, ashlar for grand or
 * frozen towns, thatch on hamlets, and snow. Materials are cached per resolved
 * look, so a world needs only a handful however many towns it has, and they all
 * share one pipeline.
 */

const STONE_TINT = Object.freeze({
  granite: [0.9, 0.93, 0.97],
  limestone: [1.03, 1.01, 0.97],
  sandstone: [1.08, 0.97, 0.82],
});

/** Render finishes, kept close to the kit's cream so per-house variation reads. */
const FINISH_TINT = Object.freeze({
  limewash: [1.04, 1.03, 1.0],
  ochre: [1.03, 0.93, 0.76],
  rose: [1.03, 0.9, 0.85],
  masonry: [0.94, 0.92, 0.89],
});

/** How much render wears back to stone, by skin (towns of the frost hold little). */
const WEAR = Object.freeze({ frost: 0.4, imperial: 0.35, sun: 0.8, marsh: 1, plains: 0.9, heartland: 0.9 });

function multiply(...tints) {
  return tints.filter(Boolean).reduce((acc, t) => [acc[0] * t[0], acc[1] * t[1], acc[2] * t[2]], [1, 1, 1]);
}

/** A town's material look, derived from its layout and climate. */
export function townLook(layout, climate = {}) {
  const stone = String(layout.styleKey ?? '').split('-')[0] || 'limestone';
  const finishes = layout.finishes?.length ? layout.finishes : ['limewash'];
  const skin = skinFor({
    family: layout.family,
    biome: climate.biome ?? null,
    snow: climate.snow ?? 0,
    capital: layout.capital,
    citadel: layout.citadel,
    rank: layout.rank,
  });
  return Object.freeze({
    skin,
    stone,
    finish: finishes[Math.abs(layout.settlementId | 0) % finishes.length],
    family: layout.family,
    thatch: layout.rank === 0 && layout.family !== 'Med' && skin !== 'frost',
    banner: bannerColourFor(layout.culture, layout.settlementId),
  });
}

/**
 * The table values a look writes into the town material: tints keyed by kit
 * material name, material swaps, snow amount and render wear. Pure.
 */
export function resolveLook(look) {
  const skin = TOWN_SKINS[look.skin] ?? TOWN_SKINS.heartland;
  const stone = multiply(STONE_TINT[look.stone], skin.stone);
  const timber = multiply(skin.timber);
  const roof = multiply(skin.roof);
  const tints = {
    M_stone: stone,
    M_stone_ashlar: stone,
    M_timber: timber,
    M_planks: timber,
    M_clapboard: timber,
    M_roof: roof,
    M_thatch: roof,
    M_plaster: multiply(FINISH_TINT[look.finish], skin.plaster),
    M_cloth_blue: look.banner,
  };
  const swaps = {};
  if (skin.ashlar) swaps.M_stone = 'M_stone_ashlar';
  if (look.thatch) swaps.M_roof = 'M_thatch';
  const snow = skin.snow ?? 0;
  const key = [look.skin, look.stone, look.finish, look.thatch ? 't' : '', look.banner.map((v) => v.toFixed(3))].join('|');
  return Object.freeze({ key, tints, swaps, snow, wear: WEAR[look.skin] ?? 0.9 });
}

export class TownMaterialPalette {
  /**
   * @param {object} assets TownKitAssets (its atlas and glass source must be loaded)
   * @param {{createKit: Function, createGlass: Function}} factories material constructors
   */
  constructor(assets, factories) {
    this.assets = assets;
    this.factories = factories;
    this.cache = new Map();
    this.glass = null;
  }

  /** The opaque town material for a look. */
  kitMaterial(look) {
    const resolved = resolveLook(look);
    if (!this.cache.has(resolved.key)) {
      this.cache.set(resolved.key, this.factories.createKit(this.assets.atlas, resolved));
    }
    return this.cache.get(resolved.key);
  }

  glassMaterial() {
    this.glass ??= this.factories.createGlass(this.assets.glassSource);
    return this.glass;
  }

  dispose() {
    for (const material of this.cache.values()) material.dispose();
    this.cache.clear();
    this.glass?.dispose();
    this.glass = null;
  }
}
