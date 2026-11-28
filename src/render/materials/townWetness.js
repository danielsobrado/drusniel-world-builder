import { float, mix, smoothstep } from 'three/tsl';
import { buildingWetnessUniform } from '../../editor/weather/surfaceWetness.js';
import { wetCoat } from '../../editor/stylized/surfaceCoatings/WetCoat.js';

export const TOWN_WET_FAMILIES = Object.freeze({
  stone: { wetness: buildingWetnessUniform.x, darkening: 0.22, roughness: 0.32 },
  plaster: { wetness: buildingWetnessUniform.x, darkening: 0.16, roughness: 0.58 },
  mortar: { wetness: buildingWetnessUniform.x, darkening: 0.24, roughness: 0.55 },
  timber: { wetness: buildingWetnessUniform.y, darkening: 0.28, roughness: 0.48 },
  roof: { wetness: buildingWetnessUniform.z, darkening: 0.18, roughness: 0.24 },
});

/** Rain exposure approximation: ledges soak, walls take less, undersides stay dry.
 * Apply before snow. Does not claim to detect shelter inside arbitrary buildings.
 */
export function wetTownSurface(color, roughness, up, family) {
  const exposure = smoothstep(-0.3, 0.1, up).mul(mix(float(0.45), float(1), up.max(0)));
  const wet = family.wetness.mul(exposure).clamp();
  // The shared wet coat (WetCoat.js); each family's porosity and film roughness.
  return wetCoat({ color, roughness: float(roughness) }, { amount: wet, darkening: family.darkening, roughness: family.roughness });
}
