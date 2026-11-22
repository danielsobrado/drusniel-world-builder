import { abs, clamp, color, float, max, mix, normalize, pow, smoothstep, vec3 } from 'three/tsl';
import { bakedShade, geometryNormal } from './LocationShading.js';
import { NOISE, locationNoise } from './locationNoise.js';

const unit = (node) => node.mul(0.5).add(0.5);

/**
 * Pure-shader 3D surface-connection grounding for interior stone, masonry,
 * timber, iron, bronze, debris, and ice junctions.
 *
 * Reads `bakedShade.w` (3D seam clearance: 0 where an object meets rock, floor,
 * ceiling, or an intersecting structure; 1 in the open) and `bakedShade.x`
 * (baked contact AO) to paint a noise-torn dust/mortar/grime/frost fillet,
 * suppress metallic/specular seam glare, and soften normal discontinuities at
 * polygon intersections — with zero GPU readbacks and zero extra samplers.
 */
export function applySurfaceSeamBlend({
  point,
  albedo,
  normal,
  roughness,
  metalness,
  profile,
}) {
  if (profile.water || profile.seam === false) {
    return { albedo, normal, roughness, metalness };
  }
  const cfg = typeof profile.seam === 'object' && profile.seam !== null ? profile.seam : {};
  const strength = float(cfg.strength ?? (profile.contactDust ? 0.72 : 0.56));
  const seamColorHex = cfg.color ?? (profile.contactDust ? '#655a4d' : '#4a4642');
  const dampShare = float(cfg.damp ?? 0);
  const sootShare = float(cfg.soot ?? 0);
  const frostShare = float(cfg.frost ?? 0);

  const seamContact = clamp(float(1).sub(bakedShade.w), 0, 1);
  const occluded = clamp(float(1).sub(bakedShade.x), 0, 1);

  // Dual-scale world-space noise tears the seam margin so junctions never read as painted bands.
  const mottle = unit(locationNoise(NOISE.mottle, point.mul(1.85).add(vec3(2.7, 5.1, 8.3))));
  const fine = unit(locationNoise(NOISE.patch, point.mul(4.2).add(vec3(7.4, 1.9, 3.6))));
  const breakup = mottle.mul(0.62).add(fine.mul(0.38));

  const raggedSeam = smoothstep(0.08, 0.78, seamContact.add(breakup.sub(0.5).mul(0.36))).mul(strength);
  const seamCore = pow(seamContact, float(1.45)).mul(mix(float(0.65), float(1.15), breakup)).clamp(0, 1);
  const vertical = float(1).sub(abs(geometryNormal.y));
  const upward = smoothstep(0.25, 0.85, geometryNormal.y);

  // Dust / mortar / mineral grit gathers in horizontal creases and climbs a few decimetres up vertical feet.
  const filletMask = clamp(
    raggedSeam.mul(mix(float(0.75), float(1.15), max(upward, occluded.mul(0.6)))),
    0,
    0.88,
  );
  const seamTint = color(seamColorHex).mul(mix(float(0.84), float(1.14), fine));
  // Anchor seam dust partially to local albedo luminance so dark basalt and pale frost-rock stay harmonious.
  const localLuma = albedo.r.mul(0.2126).add(albedo.g.mul(0.7152)).add(albedo.b.mul(0.0722));
  const balancedSeam = mix(seamTint.mul(localLuma.mul(1.25).add(0.35)), seamTint, frostShare.mul(0.65).add(0.35));

  let outAlbedo = mix(albedo, balancedSeam, filletMask.mul(0.62));

  // Optional forge soot / smoky crease darkening on vertical ribs, piers, and ceilings.
  const sootMask = clamp(seamCore.mul(sootShare).mul(mix(float(0.7), float(1.2), vertical)), 0, 0.72);
  outAlbedo = outAlbedo.mul(float(1).sub(sootMask.mul(0.45)));

  // Optional capillary dampness darkens the base collar slightly and lowers roughness softly.
  const dampMask = clamp(seamCore.mul(dampShare).mul(mix(float(0.55), float(1.15), vertical)), 0, 0.75);
  outAlbedo = outAlbedo.mul(float(1).sub(dampMask.mul(0.26)));

  // Tight recessed micro-AO right at the intersection crease grounds props into floors and walls.
  const creviceShade = float(1).sub(seamCore.mul(0.24).mul(float(1).sub(frostShare.mul(0.65))));
  outAlbedo = outAlbedo.mul(creviceShade);

  // Matte dust/frost roughness inside seams, tempered where capillary dampness sits.
  let outRoughness = mix(roughness, max(roughness, float(0.95)), filletMask.mul(0.78));
  outRoughness = mix(outRoughness, float(0.58), dampMask.mul(0.52));

  // Dust, patina, or frost dulls metallic feet where iron/bronze meets stone or ice.
  const outMetalness = metalness.mul(float(1).sub(filletMask.mul(0.55)));

  // Soften sharp bump/block normal transitions right inside the tightest intersection seam.
  const outNormal = normalize(mix(normal, geometryNormal, seamCore.mul(0.42)));

  return {
    albedo: outAlbedo,
    normal: outNormal,
    roughness: clamp(outRoughness, 0.12, 0.98),
    metalness: clamp(outMetalness, 0, 1),
  };
}
