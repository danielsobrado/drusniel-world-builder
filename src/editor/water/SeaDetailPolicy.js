import { SEA_SWELL_COMPONENTS } from './SeaSwell.js';

export const SEA_DETAIL_DEFAULTS = Object.freeze({ enabled: false, textureWorldScale: 8,
  mediumScale: 2.1, fineScale: 5.7, mediumDistance: 120, fineDistance: 28,
  mediumStrength: 0.14, fineStrength: 0.055, orbitalAdvection: 0.8, advectionRatio: 0.9 });

export function resolveSeaDetail(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('water.sea.detail must be an object.');
  const result = { ...SEA_DETAIL_DEFAULTS, ...source };
  if (typeof result.enabled !== 'boolean') throw new Error('water.sea.detail.enabled must be boolean.');
  for (const [key, value] of Object.entries(result)) {
    const positive = ['textureWorldScale', 'mediumScale', 'fineScale', 'mediumDistance', 'fineDistance', 'advectionRatio'].includes(key);
    if (key !== 'enabled' && (!Number.isFinite(value) || value < 0 || (positive && value === 0))) {
      throw new Error(`water.sea.detail.${key} must be finite and within its supported range.`);
    }
  }
  if (result.fineDistance > result.mediumDistance || result.advectionRatio > 1
    || result.orbitalAdvection > 2 || result.fineScale > 16 || result.mediumScale > 8
    || result.mediumStrength > 1 || result.fineStrength > 1 || result.mediumDistance > 1000
    || result.textureWorldScale > 128) throw new Error('water.sea.detail settings exceed supported bounds.');
  return result;
}

/** Each rotated train gets its own wrapped UV origin, preserving chunk seams. */
export function seaDetailLayers(settings) {
  return [1, settings.mediumScale, settings.fineScale].flatMap((scale, index) => {
    const wave = SEA_SWELL_COMPONENTS[index];
    return [0.45, -0.42].map((turn, train) => {
      const c = Math.cos(turn), s = Math.sin(turn);
      const x = wave.x * c - wave.z * s, z = wave.x * s + wave.z * c;
      const frequency = scale * (train ? 1.13 : 1) / settings.textureWorldScale;
      const rippleLength = 1 / (frequency * 4);
      return { name: `seaDetail${index * 2 + train}`, index, x, z,
        basis: [[x * frequency, z * frequency], [-z * frequency, x * frequency]],
        speed: Math.sqrt(9.81 * rippleLength / (Math.PI * 2)) * 0.55 * settings.advectionRatio
          * frequency * (train ? 0.83 : 1),
      };
    });
  });
}

export function seaDetailPatternFrames(settings) {
  return Object.fromEntries(seaDetailLayers(settings).map(layer => [layer.name, { basis: layer.basis, period: 1 }]));
}
