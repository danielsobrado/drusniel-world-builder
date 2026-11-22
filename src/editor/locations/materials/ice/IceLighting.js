import {
  clamp, dot, float, length, max, mix, normalize, positionWorld, pow, reflect, smoothstep, vec3,
} from 'three/tsl';
import {
  bakedDirection, bakedLight, bakedShade, geometryNormal, locationLight, viewDirection,
} from '../LocationShading.js';
import {
  ICE_F0, iceDualSpecular, iceIridescence, iceSubsurfaceScatter, schlickFresnel,
} from './IceBrdf.js';

/**
 * Physically-based lighting integrator for glacial ice and crystal materials.
 *
 * Replaces legacy Blinn-Phong with energy-conserving Cook-Torrance GGX + wet
 * meltwater clearcoat (`iceDualSpecular`), dual-lobe backlit subsurface scattering
 * (`iceSubsurfaceScatter`), and restrained grazing thin-film iridescence — while
 * consuming the exact same `locationLight` uniforms, dynamic lantern pool, carried
 * lamp, and baked irradiance/occlusion attributes as the rest of the location system.
 */
export function shadeIceSurface({
  albedo,
  normal,
  roughness,
  f0 = ICE_F0,
  wrap = 0.85,
  clearcoat = float(0.55),
  coatRoughness = 0.055,
  thickness = bakedShade.y,
  scatter = float(0.25),
  absorption = vec3(0.45, 0.09, 0.045),
  sssStrength = float(0.45),
  iridescence = float(0.12),
  iridescencePhase = float(0),
  emissive = vec3(0),
  bare = float(1),
}) {
  const wrapped = (n, l) => clamp(dot(n, l).add(wrap).div(float(1).add(wrap)), 0, 1);
  const directionality = clamp(length(bakedDirection), 0, 1);
  const toLight = normalize(bakedDirection.add(vec3(0, 1e-4, 0)));
  const relight = mix(
    float(1),
    clamp(wrapped(normal, toLight).div(max(wrapped(geometryNormal, toLight), 0.22)), 0.35, 1.32),
    directionality,
  );

  const occlusion = clamp(bakedShade.x, 0, 1);
  const diffuseAO = mix(float(0.42), float(1), occlusion);
  const localAO = mix(float(0.48), float(1), occlusion);
  const ambientAO = mix(float(0.50), float(1), occlusion);
  const specAO = occlusion.mul(occlusion);

  const ambient = mix(locationLight.ambientDown, locationLight.ambientUp, normal.y.mul(0.5).add(0.5)).mul(ambientAO);

  // Carried explorer lamp
  const toCarried = locationLight.carriedPosition.sub(positionWorld);
  const carriedDistance = length(toCarried);
  const carriedDirection = toCarried.div(max(carriedDistance, 1e-3));
  const carriedFade = clamp(float(1).sub(pow(carriedDistance.div(max(locationLight.carriedRange, 1e-3)), 2)), 0, 1);
  const carried = locationLight.carriedColor
    .mul(carriedFade.mul(carriedFade))
    .div(carriedDistance.mul(carriedDistance).mul(0.18).add(1))
    .mul(localAO);

  const ndv = clamp(dot(normal, viewDirection), 0.01, 1);
  const fresnel = schlickFresnel(ndv, f0);
  const coatWeight = clearcoat.mul(bare);

  // Baked directional GGX + wet clearcoat specular & backlit subsurface transport.
  const bakedSpec = bakedLight.mul(directionality).mul(specAO).mul(
    iceDualSpecular({ normal, toLight, roughness, clearcoat: coatWeight, coatRoughness, f0 }),
  );
  const bakedSss = bakedLight.mul(
    iceSubsurfaceScatter({ normal, toLight, thickness, scatter, absorption }),
  ).mul(sssStrength).mul(bare);

  // Carried lamp GGX + clearcoat specular & local subsurface scatter.
  const carriedSpec = carried.mul(specAO).mul(
    iceDualSpecular({ normal, toLight: carriedDirection, roughness, clearcoat: coatWeight, coatRoughness, f0 }),
  );
  const carriedSss = carried.mul(
    iceSubsurfaceScatter({ normal, toLight: carriedDirection, thickness, scatter, absorption }),
  ).mul(sssStrength.mul(0.45)).mul(bare);

  // Dynamic practical lanterns (bridge lamps, torches, vault beacons, shrine flame):
  // cast vivid warm/cool GGX specular highlights AND warm subsurface glow through thin ice!
  let dynDiffuse = vec3(0);
  let dynSpecular = vec3(0);
  let dynSss = vec3(0);
  for (const slot of locationLight.dynamicLights) {
    const toDyn = slot.position.sub(positionWorld);
    const dynDist = length(toDyn);
    const dynDir = toDyn.div(max(dynDist, 1e-3));
    const dynRange = max(slot.params.x, 1e-3);
    const dynRadius = max(slot.params.y, 0.75);
    const dynFade = clamp(float(1).sub(pow(dynDist.div(dynRange), 2)), 0, 1);
    const dynCore = float(1).div(float(1).add(pow(dynDist.div(dynRadius), 2)));
    const dynScatter = float(1).div(float(1).add(pow(dynDist.div(dynRadius.mul(2.4)), 2)));
    const dynAtten = dynFade.mul(dynFade).mul(dynCore.mul(0.60).add(dynScatter.mul(0.40)));
    const dynIrrad = slot.color.mul(dynAtten).mul(localAO);

    dynDiffuse = dynDiffuse.add(dynIrrad.mul(wrapped(normal, dynDir)));
    dynSpecular = dynSpecular.add(
      dynIrrad.mul(specAO).mul(
        iceDualSpecular({ normal, toLight: dynDir, roughness, clearcoat: coatWeight, coatRoughness, f0 }),
      ),
    );
    dynSss = dynSss.add(
      dynIrrad.mul(
        iceSubsurfaceScatter({ normal, toLight: dynDir, thickness, scatter, absorption }),
      ).mul(sssStrength.mul(0.85)).mul(bare),
    );
  }

  // Subtle multi-lobe ambient reflection from the cavern dome + grazing iridescence tint.
  const smooth = clamp(roughness.oneMinus(), 0, 1);
  const mirroredDir = reflect(viewDirection.negate(), normal);
  const domeEnv = mix(locationLight.ambientDown, locationLight.ambientUp, mirroredDir.y.mul(0.5).add(0.5));
  const iridTint = iceIridescence(ndv, iridescencePhase, iridescence.mul(bare));
  const envReflect = domeEnv.mul(fresnel).mul(smooth.mul(smooth)).mul(specAO)
    .mul(vec3(0.55).add(iridTint.mul(0.85)));

  // Soft highlight knee on direct specular so crystal glints stay sparkling in HDR without blowing out flat.
  const rawSpec = bakedSpec.add(carriedSpec).add(dynSpecular).mul(vec3(1).add(iridTint.mul(0.35)));
  const specLuma = dot(rawSpec, vec3(0.2126, 0.7152, 0.0722));
  const specular = rawSpec.div(specLuma.mul(0.18).add(1));

  // Soft HDR direct diffuse knee (matching LocationShading.js calibration).
  const rawDirect = bakedLight.mul(relight).mul(diffuseAO)
    .add(carried.mul(wrapped(normal, carriedDirection)))
    .add(dynDiffuse);
  const directLuma = dot(rawDirect, vec3(0.2126, 0.7152, 0.0722));
  const compressedLuma = directLuma.div(directLuma.mul(0.15).add(1));
  const softDirect = rawDirect.mul(compressedLuma.div(max(directLuma, 1e-4)));
  const warmRatio = clamp(rawDirect.r.sub(rawDirect.b).div(max(directLuma, 0.05)), 0, 1);
  const highlightTarget = mix(vec3(compressedLuma), vec3(compressedLuma).mul(vec3(1.04, 0.99, 0.90)), warmRatio);
  const desatShare = smoothstep(0.75, 3.4, directLuma).mul(0.36);
  const totalDiffuse = ambient.add(mix(softDirect, highlightTarget, desatShare));

  const subsurface = bakedSss.add(carriedSss).add(dynSss);
  return albedo.mul(totalDiffuse).add(subsurface).add(specular).add(envReflect).add(emissive);
}
