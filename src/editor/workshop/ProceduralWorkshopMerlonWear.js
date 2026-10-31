/** Share of merlons that have lost their top to weather or siege. */
const BROKEN_SHARE = 0.14;

/**
 * One merlon's wear: most stand a little short of the line, a few are broken
 * down, and each sits slightly out of true, so a parapet stops reading as a comb.
 *
 * @param {() => number} random seeded PRNG in [0, 1)
 * @param {number} height the merlon as built
 * @returns {{ height: number, lean: number }} height left, and its roll in radians
 */
export function wornMerlon(random, height) {
  const broken = random() < BROKEN_SHARE;
  const left = broken ? 0.5 + random() * 0.2 : 0.86 + random() * 0.14;
  return { height: height * left, lean: (random() - 0.5) * (broken ? 0.12 : 0.03) };
}
