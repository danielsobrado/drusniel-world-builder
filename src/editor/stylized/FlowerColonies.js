import { hash32 } from './scatterMath.js';

const smooth = t => t * t * (3 - 2 * t);
const random = (x, z, salt) => hash32(Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ salt) / 0xffffffff;
const mix = (a, b, t) => a + (b - a) * t;

/** World-stable colonies shared by worker and main-thread scatter. */
export function flowerColony(x, z, source = {}) {
  if (source.enabled !== true) return { coverage: 1, variety: null };
  const meters = source.patchMeters ?? 18;
  if (!Number.isFinite(meters) || meters < 4 || meters > 128) throw new Error('Flower colony patchMeters must be in [4, 128]');
  const px = x / meters, pz = z / meters, ix = Math.floor(px), iz = Math.floor(pz);
  const tx = smooth(px - ix), tz = smooth(pz - iz);
  const value = mix(mix(random(ix, iz, 919), random(ix + 1, iz, 919), tx),
    mix(random(ix, iz + 1, 919), random(ix + 1, iz + 1, 919), tx), tz);
  const coverage = smooth(Math.max(0, Math.min(1, (value - .28) / .4)));
  return { coverage, variety: random(ix, iz, 1723) < .5 ? 0 : 1 };
}
