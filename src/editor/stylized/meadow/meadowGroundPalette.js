import { MEADOW_GRASS_DEFAULTS } from './meadowGrassConfig.js';
import { resolveMeadowPalettes } from './meadowPalettes.js';

function linearColor(hex) {
  const packed = Number.parseInt(hex.slice(1), 16);
  return [16, 8, 0].map(shift => {
    const value = ((packed >>> shift) & 255) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
}

/** Small immutable lookup shared by terrain shading and its CPU far-color bake. */
export function createMeadowGroundPalette(config) {
  const source = config?.grass?.meadow;
  if (config?.grass?.system !== 'meadow' || !source || source.enabled === false || !source.palette) return null;
  const palette = resolveMeadowPalettes(source.palette, 'stylizedSurface.grass.meadow.palette');
  const appearance = { ...MEADOW_GRASS_DEFAULTS.appearance, ...source.appearance };
  const roots = new Float32Array(256 * 3);
  const tips = new Float32Array(256 * 3);
  const colors = palette.palettes.map(({ base, tip }) => ({ base: linearColor(base), tip: linearColor(tip) }));
  for (let id = 0; id < 256; id++) {
    const { base, tip } = colors[palette.table[id]];
    for (let channel = 0; channel < 3; channel++) {
      roots[id * 3 + channel] = (base[channel] + (tip[channel] - base[channel]) * appearance.groundTipMix)
        * palette.brightness;
      tips[id * 3 + channel] = tip[channel] * palette.brightness;
    }
  }
  return { roots, tips, appearance, brightness: palette.brightness };
}
