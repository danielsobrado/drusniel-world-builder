import { Fn, clamp, color, float, mix, oneMinus, smoothstep, vec3, vec4 } from 'three/tsl';

/**
 * Ground properties driven by the world-noise layers that ride in the family
 * atlas (worldNoiseLayout.js), so the terrain needs no sampler of its own:
 *
 *   macro  R soil moisture (darker, smoother damp ground), G large colour patches
 *   meso   G grass and moss clusters on turf, B staining streaks on rock
 *   micro  R grain, G pits, at walking distance
 *
 * One multiplier serves the near, mid and far bands alike. Its fades depend on
 * camera distance only, so the bands agree wherever they cross over. Tints are
 * grey-centred like the bake's macro tint (`#808080` is neutral), and every
 * field is centred on the layers' neutral 0.5, so the ground is unchanged until
 * the noise file has arrived.
 */
export function createTerrainWorldNoiseShaping({ noise, weights, cameraDistance, config }) {
  if (!noise || !config?.enabled) return null;
  const tint = (hex) => color(hex).mul(2);
  const turf = weights.r;
  const soil = weights.r.add(weights.g);
  const bare = oneMinus(weights.a);
  const mesoVisibility = oneMinus(smoothstep(config.mesoFadeStartDistance, config.mesoFadeEndDistance, cameraDistance));
  const microVisibility = oneMinus(smoothstep(config.microFadeStartDistance, config.microFadeEndDistance, cameraDistance));

  const moisture = noise.macro.r.sub(0.5).mul(2);
  const damp = moisture.mul(0.5).add(0.5);
  const moistureShade = float(1).sub(moisture.mul(config.moistureDarkening).mul(soil));
  const patchTint = mix(vec3(1), mix(tint(config.patchCool), tint(config.patchWarm), noise.macro.g), bare.mul(config.patchStrength));

  // Clusters, not speckle: a threshold on the mottle, thicker where the soil is damp.
  const moss = smoothstep(config.mossLevel, config.mossLevel + 0.22, noise.meso.g)
    .mul(turf).mul(mix(0.45, 1, damp)).mul(mesoVisibility).mul(config.mossStrength);
  const stain = smoothstep(0.5, 0.82, noise.meso.b).mul(weights.b).mul(mesoVisibility).mul(config.stainStrength);

  const pits = oneMinus(smoothstep(config.pitLevel - 0.16, config.pitLevel, noise.micro.g));
  const grain = noise.micro.r.sub(0.5).mul(2 * config.grainStrength).sub(pits.mul(config.pitStrength));

  const multiplier = patchTint
    .mul(moistureShade)
    .mul(mix(vec3(1), tint(config.mossTint), moss))
    .mul(mix(vec3(1), tint(config.stainTint), stain))
    .mul(float(1).add(grain.mul(microVisibility).mul(bare)));
  const roughnessOffset = pits.mul(config.pitStrength).mul(microVisibility)
    .sub(moisture.mul(config.moistureRoughness).mul(soil));
  // Read by the near, mid and far colours and the roughness: one variable, so
  // the taps are emitted once rather than at every reader (see the note in
  // TerrainMaterialStochasticNodes.js).
  const shaping = Fn(() => vec4(multiplier, roughnessOffset).toVar())();
  return { multiplier: shaping.xyz, roughnessOffset: shaping.w };
}

export function applyTerrainWorldNoiseColor(colorNode, shaping) {
  return shaping ? clamp(colorNode.mul(shaping.multiplier), vec3(0), vec3(1)) : colorNode;
}
