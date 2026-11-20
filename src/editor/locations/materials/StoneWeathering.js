import { abs, clamp, color, float, max, mix, pow, smoothstep, vec3 } from 'three/tsl';
import { bakedShade, geometryNormal, triplanarWeights } from './LocationShading.js';
import { NOISE, locationNoise, triplanarNoise } from './locationNoise.js';

/**
 * Age on worked stone and metal, opt-in per material profile. Both read the
 * baked occlusion, so dirt and corrosion gather where they would: in joints,
 * under mouldings and round anything that stands on something else.
 */

const unit = (node) => node.mul(0.5).add(0.5);

/**
 * `profile.weathering`: `{ tone, speckle, grime, streaks, dust }`, each 0..1.
 * Quarry tone drift between beds, mineral flecks, grime in crevices, soot and
 * seep streaks down vertical faces, and dust settled on ledges.
 */
export function weatherDressedStone({ point, albedo, roughness }, weathering) {
  const { tone = 0.5, speckle = 0.5, grime = 0.5, streaks = 0.5, dust = 0.4 } = weathering;
  const occluded = clamp(float(1).sub(bakedShade.x), 0, 1);
  const up = geometryNormal.y;
  const vertical = float(1).sub(abs(up));

  // Beds of the quarry: warm and cool stone a metre or two across, not one flat beige.
  const bed = unit(locationNoise(NOISE.patch, point.mul(vec3(0.42, 0.9, 0.42)).add(vec3(7.1, 0, 3.3))));
  const bedTint = mix(color('#b9b3ab'), color('#d2c7b6'), bed);
  let out = mix(albedo, albedo.mul(bedTint).mul(1.18), float(tone));

  // Mineral flecks: dark mica and the odd pale quartz grain.
  const fleck = locationNoise(NOISE.grit, point.mul(38));
  const dark = smoothstep(0.62, 0.8, fleck).mul(speckle);
  const pale = smoothstep(0.66, 0.84, locationNoise(NOISE.grit, point.mul(29).add(vec3(5.2, 1.3, 8.8)))).mul(speckle);
  out = out.mul(mix(float(1), float(0.62), dark)).mul(mix(float(1), float(1.22), pale.mul(0.7)));
  let rough = mix(roughness, roughness.mul(0.72), pale.mul(0.6));

  // Grime packed into what the light cannot reach.
  const dirt = pow(occluded, float(1.4)).mul(unit(locationNoise(NOISE.mottle, point.mul(2.3))).mul(0.6).add(0.55)).mul(grime);
  out = mix(out, out.mul(color('#5b5249')), clamp(dirt.mul(1.3), 0, 0.85));
  rough = mix(rough, float(0.95), dirt.mul(0.5));

  // Streaks: water and smoke run down a wall, so the noise is stretched along height.
  const run = unit(locationNoise(NOISE.mottle, point.mul(vec3(3.1, 0.22, 3.1))));
  const streak = smoothstep(0.55, 0.85, run).mul(vertical).mul(streaks);
  out = out.mul(mix(float(1), float(0.68), streak));

  // Hairline stone fractures & basal floor dampness grounding columns into the flagstones.
  const cracksRaw = triplanarNoise(NOISE.cracks, point.mul(18.0), triplanarWeights(geometryNormal));
  const crackLine = smoothstep(float(0.32), float(0.08), cracksRaw).mul(grime);
  out = mix(out, out.mul(color('#2d2926')), crackLine.mul(0.62));
  rough = mix(rough, float(0.96), crackLine.mul(0.55));

  const basalDamp = smoothstep(float(1.35), float(0.0), point.y).mul(vertical).mul(grime);
  out = out.mul(mix(float(1), float(0.74), basalDamp.mul(0.75)));
  rough = mix(rough, roughness.mul(0.82), basalDamp.mul(0.4));

  // Dust settles on anything facing up, thicker where it is sheltered.
  const settled = smoothstep(0.55, 0.95, up).mul(dust).mul(occluded.mul(0.6).add(0.4));
  out = mix(out, max(out, color('#a59c90').mul(0.9)), settled.mul(0.55));
  rough = mix(rough, float(0.96), settled.mul(0.6));

  return { albedo: out, roughness: rough };
}

/**
 * `profile.patina`: `{ color, amount, spread }`. Verdigris on bronze, rust on
 * iron: it blooms in occluded places and in patches elsewhere, and where it
 * lies the surface stops being bare metal.
 */
export function patinate({ point, albedo, roughness, metalness }, patina) {
  const { amount = 0.6, spread = 0.35 } = patina;
  const occluded = clamp(float(1).sub(bakedShade.x), 0, 1);
  const patch = unit(locationNoise(NOISE.mottle, point.mul(1.7).add(vec3(2.2, 9.1, 4.4))));
  const pit = unit(locationNoise(NOISE.pits, point.mul(11)));
  const cover = clamp(smoothstep(0.35, 0.9, occluded.add(patch.mul(spread)).add(pit.mul(0.18))).mul(amount), 0, 1);
  const crust = color(patina.color).mul(mix(float(0.75), float(1.15), pit));
  return {
    albedo: mix(albedo, crust, cover),
    roughness: mix(roughness, float(0.88), cover),
    metalness: mix(metalness, float(0.08), cover),
  };
}
