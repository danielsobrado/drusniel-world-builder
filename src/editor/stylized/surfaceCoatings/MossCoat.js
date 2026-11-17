import { float, mix } from 'three/tsl';
import { coatDetailFade, perturbByHeight } from '../../../render/materials/surfaceLayers/PbrCoatBlend.js';
import { surfaceCoatings } from './SurfaceCoatingConfig.js';

/**
 * The moss coat's appearance over a mat whose colour the caller paints: soft
 * cushions (`pillow`, 0..1) with tufts inside them (`tuft`, 0..1), both from
 * noise the surface already samples. Cushion and tuft heights tilt the normal
 * and shade the low ground between cushions, so moss reads as a pile growing
 * on the stone rather than paint on it. Where it grows stays the caller's mask.
 *
 * @returns {{ color, roughness, normal: (base) => import('three/tsl').Node|null }}
 *   normal() takes the base's view normal, so a mat follows the stone's own
 *   relief, and returns null when the moss coat is disabled.
 */
export function mossCoat({ color, pillow, tuft, settings = surfaceCoatings() }) {
  const { moss } = settings;
  if (!moss.enabled) return { color, roughness: null, normal: () => null };
  const lift = pillow.mul(0.7).add(tuft.mul(0.3));
  return {
    color: color.mul(mix(float(1 - moss.recessShade), float(1), lift)),
    roughness: float(moss.roughness).add(tuft.sub(0.5).mul(0.06)).clamp(0, 1),
    normal(base) {
      const height = pillow.mul(moss.pillowHeight).add(tuft.mul(moss.tuftHeight))
        .mul(coatDetailFade(settings.detail));
      return perturbByHeight(base, height);
    },
  };
}
