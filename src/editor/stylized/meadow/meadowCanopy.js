import { abs, cameraPosition, mix, normalize, positionWorld, smoothstep } from 'three/tsl';

/**
 * What a stand looks like where its ground shows: the average of the blades the
 * eye actually sees, not the soil under them. Seen from the side, a stand shows
 * its upper stems, so the gaps between them should carry that colour; from
 * above, the root and litter show through. The terrain under the grass, the far
 * bake and each stem's foot all use this one definition so blade and ground
 * meet at the same value.
 */

/** Canopy pigment from a root and tip, as numbers (CPU bake) or TSL nodes. */
export function meadowCanopyColor(root, tip, tipMix) {
  if (Array.isArray(root)) return root.map((value, channel) => value + (tip[channel] - value) * tipMix);
  return mix(root, tip, tipMix);
}

/**
 * How much of the canopy the ground shows from here: 0 looking straight down,
 * 1 at a grazing angle. Stems stand upright, so the elevation of the view is
 * what decides how much of them stands between the eye and the ground.
 */
export function meadowCanopyView(strength) {
  const view = normalize(cameraPosition.sub(positionWorld));
  return smoothstep(0.1, 0.85, abs(view.y).oneMinus()).mul(strength);
}
