/** Species mixture for an individual biome's meadow stand.
 * Values scale the existing rye-like, fescue-like, low cover and seed-head
 * components. Their 0..2 limits keep height, shading and width envelopes stable.
 */
export const MEADOW_STAND_DEFAULT = Object.freeze({
  rye: 1,
  fescue: 1,
  cover: 1,
  seeds: 1,
});

const LIMITS = Object.freeze({ min: 0, max: 2 });
const KEYS = Object.freeze(Object.keys(MEADOW_STAND_DEFAULT));

export function resolveMeadowStand(source, path) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`Invalid editor configuration: ${path} must be a stand object.`);
  }
  const unknown = Object.keys(source).find(key => !KEYS.includes(key));
  if (unknown) throw new Error(`Invalid editor configuration: ${path}.${unknown} is unknown.`);
  const stand = { ...MEADOW_STAND_DEFAULT, ...source };
  for (const key of KEYS) {
    const value = stand[key];
    if (!Number.isFinite(value) || value < LIMITS.min || value > LIMITS.max) {
      throw new Error(`Invalid editor configuration: ${path}.${key} must be in [0, 2].`);
    }
  }
  return Object.freeze(stand);
}

export function meadowStandWeights(profile) {
  const stand = profile.stand ?? MEADOW_STAND_DEFAULT;
  return KEYS.map(key => stand[key]);
}
