/**
 * `base`/`warm`/`color` drive the shared material colour and mortar tint.
 *
 * `ramp` and `outlier` drive per-stone vertex colour. Each ramp is centred on
 * `base` and stays inside one stone family, with a rare desaturated `outlier`
 * so a few blocks read as distinctly different stone. This is the "stable
 * per-stone tint" layer of 05-…md §8, deliberately narrow: the section warns
 * that strong uncoordinated variation makes a wall unreadable.
 */

function hexToRgb(hex) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
  ];
}

function assertRgbTriple(channels, label) {
  if (!Array.isArray(channels) || channels.length !== 3) {
    throw new Error(`${label} must contain exactly three channels.`);
  }
  for (let index = 0; index < 3; index += 1) {
    const channel = channels[index];
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
      throw new Error(`${label}[${index}] must be an integer 0–255, got ${channel}.`);
    }
  }
}

/**
 * Freeze a complete stone palette after validating nested colour data.
 * Exported for unit tests that assert invalid descriptors fail.
 */
export function defineStonePalette(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Stone palette descriptor is required.');
  }
  assertRgbTriple(input.base, 'base');
  assertRgbTriple(input.warm, 'warm');
  if (!Array.isArray(input.ramp) || input.ramp.length < 2 || input.ramp.length > 8) {
    throw new Error('ramp must contain between 2 and 8 colour stops.');
  }
  for (let index = 0; index < input.ramp.length; index += 1) {
    assertRgbTriple(input.ramp[index], `ramp[${index}]`);
  }
  if (input.outlier != null) assertRgbTriple(input.outlier, 'outlier');
  if (typeof input.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(input.color)) {
    throw new Error('color must be a six-digit hex colour.');
  }
  const chance = input.outlierChance ?? 0;
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
    throw new Error(`outlierChance must be between 0 and 1, got ${chance}.`);
  }
  const declared = hexToRgb(input.color);
  // Legacy granite/limestone/sandstone colours drift a few levels from `base`
  // (shared material tint vs per-stone ramp). Soft limestone is authored exact;
  // keep a small tolerance so converting those entries stays value-preserving.
  for (let index = 0; index < 3; index += 1) {
    if (Math.abs(declared[index] - input.base[index]) > 8) {
      throw new Error(
        `color ${input.color} does not match base [${input.base.join(', ')}].`,
      );
    }
  }

  return Object.freeze({
    base: Object.freeze([...input.base]),
    warm: Object.freeze([...input.warm]),
    color: input.color,
    ramp: Object.freeze(input.ramp.map((stop) => Object.freeze([...stop]))),
    outlier: input.outlier ? Object.freeze([...input.outlier]) : null,
    outlierChance: chance,
  });
}

export const STONE_PALETTES = Object.freeze({
  granite: defineStonePalette({
    base: [137, 143, 146],
    warm: [165, 154, 136],
    color: '#91979a',
    ramp: [
      [137, 143, 146], [152, 150, 141], [124, 130, 134], [143, 148, 138],
    ],
    outlier: [110, 116, 112],
    outlierChance: 0.1,
  }),
  limestone: defineStonePalette({
    base: [194, 180, 148],
    warm: [220, 202, 154],
    color: '#c4b794',
    ramp: [
      [194, 180, 148], [214, 198, 156], [178, 166, 140], [196, 188, 160],
    ],
    outlier: [162, 158, 132],
    outlierChance: 0.1,
  }),
  /**
   * Pale, low-saturation limestone for `soft-limestone-rubble`. Kept separate
   * from `limestone` so existing workshop assets and walls stay warm yellow.
   */
  'soft-limestone': defineStonePalette({
    base: [188, 186, 176],
    warm: [198, 194, 181],
    color: '#bcbab0',
    ramp: [
      [188, 186, 176],
      [196, 193, 181],
      [180, 181, 175],
      [191, 189, 180],
    ],
    outlier: [166, 168, 164],
    outlierChance: 0.045,
  }),
  sandstone: defineStonePalette({
    base: [187, 122, 78],
    warm: [220, 159, 98],
    color: '#bd8056',
    ramp: [
      [187, 122, 78], [214, 155, 96], [170, 110, 72], [192, 140, 96],
    ],
    outlier: [150, 132, 96],
    outlierChance: 0.12,
  }),
  /**
   * Light, warm field stone for `rounded-fieldstone`: cream, beige, sand and a
   * cool grey-green, so neighbouring pillow stones separate by hue as well as by
   * their shadowed joints. Brighter than `soft-limestone`, far calmer than
   * `limestone`.
   */
  'warm-fieldstone': defineStonePalette({
    base: [204, 190, 164],
    warm: [218, 204, 176],
    color: '#ccbea4',
    ramp: [
      [204, 190, 164],
      [216, 205, 184],
      [190, 181, 164],
      [211, 190, 154],
      [184, 182, 166],
    ],
    outlier: [156, 146, 128],
    outlierChance: 0.05,
  }),

  /**
   * `glade-sandstone`: one warm peach-to-sand hue, as in the references —
   * gentle per-stone variation, a few lighter blocks, nothing dark.
   *
   * Construction stones use palette values directly as linear vertex-colour
   * multipliers. The references' sRGB peach (#ecbc88 and neighbours) stored
   * as-is displayed as a pale cream the cool sky light turned grey; fully
   * converted to linear it turned muddy brown, because the references also owe
   * their brightness to warm bounce light this scene does not have. These are
   * the sRGB values raised to 1.4 — warm and still high-key. A little below
   * full value, so the tone mapper keeps their saturation in sunlight.
   */
  'glade-sandstone': defineStonePalette({
    base: [242, 152, 78],
    warm: [246, 160, 84],
    color: '#f2984e',
    ramp: [
      [244, 156, 82],
      [236, 146, 74],
      [248, 166, 92],
      [240, 152, 80],
      [230, 140, 70],
    ],
    outlier: [250, 178, 102],
    outlierChance: 0.06,
  }),
});

/**
 * Per-tile roof colour ramps. Before 2026-07-25 the roof material carried no
 * vertex colours at all, so every tile was one flat hue and the geometry could
 * not read as separate tiles.
 */
export const ROOF_PALETTES = Object.freeze({
  terracotta: Object.freeze({
    ramp: Object.freeze([
      [188, 96, 58], [208, 120, 68], [166, 82, 52], [198, 142, 88],
    ]),
    outlier: [128, 132, 88],
    outlierChance: 0.14,
  }),
  slate: Object.freeze({
    ramp: Object.freeze([
      [92, 104, 96], [78, 88, 86], [108, 116, 104], [86, 96, 110],
    ]),
    outlier: [120, 112, 96],
    outlierChance: 0.12,
  }),
});

/** Mean of a roof style's ramp, as a 0..1 vertex colour. */
export function roofPaletteMean(topStyle) {
  const { ramp } = ROOF_PALETTES[topStyle] ?? ROOF_PALETTES.terracotta;
  return [0, 1, 2].map((channel) => ramp.reduce((sum, colour) => sum + colour[channel], 0) / ramp.length / 255);
}

export const PLASTER_PALETTES = Object.freeze({
  masonry: Object.freeze({ base: [134, 132, 121], shadow: [96, 99, 91] }),
  ochre: Object.freeze({ base: [218, 161, 61], shadow: [173, 112, 39] }),
  limewash: Object.freeze({ base: [218, 209, 177], shadow: [166, 157, 130] }),
  rose: Object.freeze({ base: [190, 116, 99], shadow: [145, 78, 70] }),
});

