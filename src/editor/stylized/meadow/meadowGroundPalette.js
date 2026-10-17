import { MEADOW_GRASS_DEFAULTS } from './meadowGrassConfig.js';
import { resolveMeadowPalettes } from './meadowPalettes.js';
import { linearColor } from './meadowColorSpace.js';
import { resolveMeadowGroundDetail } from './meadowGroundDetailConfig.js';
import { meadowGroundMean } from './meadowGroundMean.js';
export { linearColor } from './meadowColorSpace.js';

/** Small immutable lookup shared by terrain shading and its CPU far-color bake. */
export function createMeadowGroundPalette(config) {
  const source = config?.grass?.meadow;
  if (config?.grass?.system !== 'meadow' || !source || source.enabled === false || !source.palette) return null;
  const palette = resolveMeadowPalettes(source.palette, 'stylizedSurface.grass.meadow.palette');
  const appearance = { ...MEADOW_GRASS_DEFAULTS.appearance, ...source.appearance };
  const roots = new Float32Array(256 * 3);
  const tips = new Float32Array(256 * 3);
  const colors = palette.palettes.map(({ base, tip }) => ({ base: linearColor(base), tip: linearColor(tip) }));
  const detail = resolveMeadowGroundDetail(source.groundDetail);
  const soil = linearColor(config.dirt?.color ?? '#63513d');
  for (let id = 0; id < 256; id++) {
    const { base, tip } = colors[palette.table[id]];
    for (let channel = 0; channel < 3; channel++) {
      roots[id * 3 + channel] = (base[channel] + (tip[channel] - base[channel]) * appearance.groundTipMix)
        * palette.brightness;
      tips[id * 3 + channel] = tip[channel] * palette.brightness;
    }
    if (detail) {
      const root = Array.from(roots.subarray(id * 3, id * 3 + 3));
      roots.set(meadowGroundMean(root, soil, detail.litter.subarray(id * 4, id * 4 + 4),
        detail.amounts.subarray(id * 4, id * 4 + 4), detail.strength), id * 3);
    }
  }
  return { roots, tips, appearance, brightness: palette.brightness };
}
