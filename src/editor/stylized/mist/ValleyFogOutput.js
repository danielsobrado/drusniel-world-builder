import { mix, output, vec4 } from 'three/tsl';

/** In-scattered radiance is composed once after surface lighting. Preserve any
 * prior output and alpha; material reflectance must remain independent of mist.
 */
export function applyValleyFogOutput(material, fog) {
  if (!fog) return;
  const lit = material.outputNode ?? output;
  material.outputNode = vec4(mix(lit.rgb, fog.color, fog.amount), lit.a);
}
