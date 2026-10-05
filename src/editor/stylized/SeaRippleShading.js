import { cameraPosition, cos, float, mix, oneMinus, positionWorld, smoothstep, texture, vec2 } from 'three/tsl';
import { SEA_SWELL_COMPONENTS } from '../water/SeaSwell.js';
import { seaDetailLayers } from '../water/SeaDetailPolicy.js';
import { SEA_DETAIL_SLOPE_RANGE, SEA_DETAIL_MOMENT_SCALE } from '../assets/godsEnd/seaDetail.js';

/** Crossing, dispersive ripple trains from Gods' End, without canonical float coordinates. */
export function createSeaRippleNodes({ map, patterns, localXZ, phases, amplitude, time, strength, settings }) {
  const orbit = SEA_SWELL_COMPONENTS.slice(0, 3).reduce((sum, wave, index) =>
    sum.add(vec2(wave.x, wave.z).mul(cos(phases[index]).mul(wave.weight))), vec2(0))
    .mul(amplitude).mul(settings.orbitalAdvection).toVarying('seaRippleOrbit');
  const distance = cameraPosition.distance(positionWorld);
  const medium = oneMinus(smoothstep(settings.mediumDistance * 0.55, settings.mediumDistance, distance));
  const fine = oneMinus(smoothstep(settings.fineDistance * 0.55, settings.fineDistance, distance));
  let slope = vec2(0);
  for (const layer of seaDetailLayers(settings)) {
    const uv = patterns.latticePoint(layer.name, localXZ.add(orbit))
      .add(vec2(time.mul(layer.speed).mod(1), 0));
    const sample = texture(map, uv);
    const localSlope = sample.rg.mul(2).sub(1).mul(SEA_DETAIL_SLOPE_RANGE);
    const variance = sample.a.mul(SEA_DETAIL_MOMENT_SCALE).sub(localSlope.dot(localSlope)).max(0);
    const filtered = localSlope.div(variance.mul(4).add(1));
    const rotated = vec2(filtered.x.mul(layer.x).sub(filtered.y.mul(layer.z)),
      filtered.x.mul(layer.z).add(filtered.y.mul(layer.x)));
    const weight = layer.index === 0 ? 0.78 : layer.index === 1 ? 0.22 : 1;
    const fade = layer.index === 2 ? fine.mul(settings.fineStrength) : medium.mul(settings.mediumStrength);
    slope = slope.add(rotated.mul(fade).mul(weight * 0.62));
  }
  // Avoid independent short waves overwhelming steep carrier faces.
  return slope.mul(strength).mul(mix(float(0.4), float(1), smoothstep(0.1, 0.7, strength)));
}
