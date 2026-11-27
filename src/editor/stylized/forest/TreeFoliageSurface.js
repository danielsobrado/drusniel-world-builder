import { Color } from 'three/webgpu';
import { attribute, cos, float, materialAO, materialRoughness, mix, normalWorld, positionGeometry, positionView, sin, smoothstep, uv, vec3 } from 'three/tsl';
import { surfaceWetnessUniform } from '../../weather/surfaceWetness.js';
import { resolveTreeFoliageSettings } from './treeSurfaceSettings.js';
import { setRuntimeUserData } from '../../../render/materials/runtimeUserData.js';

/** Outward multi-lobe puff normal computed on the GPU in prototype space (no extra buffers). */
export function crownPuffNormalNode(bounds, puffStrength = 0.34, upBias = 0.22) {
  const center = vec3(...bounds.min.map((value, i) => (value + bounds.max[i]) / 2));
  const half = vec3(...bounds.min.map((value, i) => Math.max(0.05, (bounds.max[i] - value) / 2)));
  const rel = positionGeometry.sub(center).div(half);
  const macro = rel.add(vec3(0, upBias, 0));
  const macroDir = macro.div(macro.length().max(0.00001));
  if (!(puffStrength > 0)) return macroDir;
  // Soft low-frequency canopy undulation keeps lighting continuous across the whole tree crown.
  const phase = rel.mul(2.1);
  const puff = vec3(
    sin(phase.x).mul(cos(phase.y.add(0.6))).mul(cos(phase.z.sub(0.4))),
    cos(phase.x.sub(0.5)).mul(sin(phase.y)).mul(cos(phase.z.add(0.3))).add(0.24),
    cos(phase.x.add(0.4)).mul(cos(phase.y.sub(0.5))).mul(sin(phase.z)),
  );
  const fine = rel.mul(4.3);
  const subPuff = vec3(
    cos(fine.x.add(1.1)).mul(sin(fine.y.sub(0.3))),
    sin(fine.x.sub(0.4)).mul(cos(fine.z.add(0.7))).add(0.15),
    sin(fine.y.add(0.8)).mul(cos(fine.z.sub(0.6))),
  ).mul(0.32);
  const combined = macroDir.add(puff.add(subPuff).mul(puffStrength));
  return combined.div(combined.length().max(0.00001));
}

/**
 * Bounded outer-rim tuft ruffling in prototype space so silhouettes break into
 * soft layered pillows along outer normal peaks without disturbing trunk/inner geometry.
 */
export function crownRimRuffleNode(bounds, rimRuffle = 0.28) {
  const center = vec3(...bounds.min.map((value, i) => (value + bounds.max[i]) / 2));
  const half = vec3(...bounds.min.map((value, i) => Math.max(0.05, (bounds.max[i] - value) / 2)));
  const rel = positionGeometry.sub(center).div(half);
  const radialLen = rel.length();
  const dir = rel.add(vec3(0, 0.12, 0));
  const outDir = dir.div(dir.length().max(0.00001));
  const outerPeak = smoothstep(0.60, 0.96, radialLen).mul(smoothstep(-0.30, 0.55, rel.y));
  const coarse = sin(positionGeometry.x.mul(5.7).add(positionGeometry.z.mul(4.1)))
    .mul(cos(positionGeometry.y.mul(5.3).sub(positionGeometry.x.mul(2.9))));
  const fine = cos(positionGeometry.z.mul(11.3).sub(positionGeometry.y.mul(7.1)))
    .mul(sin(positionGeometry.x.mul(9.7).add(positionGeometry.z.mul(6.1))));
  const tuftWave = coarse.mul(0.65).add(fine.mul(0.35));
  const halfSpanMin = Math.max(0.05, Math.min(...bounds.min.map((value, i) => (bounds.max[i] - value) * 0.5)));
  const amplitude = halfSpanMin * 0.032 * rimRuffle;
  return outDir.mul(tuftWave.mul(0.65).add(0.35)).mul(outerPeak).mul(amplitude);
}

/**
 * Analytic sky visibility for a crown with no baked one (shrubs): leaves deep in
 * the bounds ellipsoid and on its underside see less sky, as the trees' baked
 * `canopyVisibility` does. Per vertex; 1 on the outer shell, `floor` at the core.
 */
export function crownInteriorVisibilityNode(bounds, floor = 0.45) {
  const center = vec3(...bounds.min.map((value, i) => (value + bounds.max[i]) / 2));
  const half = vec3(...bounds.min.map((value, i) => Math.max(0.05, (bounds.max[i] - value) / 2)));
  const rel = positionGeometry.sub(center).div(half);
  const shell = smoothstep(0.2, 0.95, rel.length());
  const top = smoothstep(-0.9, 0.5, rel.y);
  return mix(float(floor), float(1), shell).mul(mix(0.72, 1, top)).toVarying('crownInteriorVisibility');
}

/** Occlusion has a floor, retaining readable crown interiors and donor AO. */
export function canopyVisibilityNode(visibility, settings) {
  return mix(float(1), visibility.clamp(settings.minimumVisibility, 1), settings.occlusionStrength);
}

/** Thickness is an optical estimate when the asset has no thickness texture. */
export function leafThicknessNode(settings, visibility, alpha = float(1), luminance = float(0.5)) {
  return float(settings.thickness).mul(mix(0.7, 1.2, visibility.oneMinus()))
    .mul(mix(0.7, 1, alpha.clamp(0, 1)))
    .mul(mix(1.15, 0.85, luminance.clamp(0, 1))).clamp(0.02, 1);
}

export function configureTreeFoliageSurface(material, {
  settings = resolveTreeFoliageSettings(), visibility = float(1), alpha = float(1),
  color = vec3(0.5), bounds = null,
} = {}) {
  if (!settings.enabled) return { visibility: float(1) };
  const sky = canopyVisibilityNode(visibility, settings);
  material.foliageTransmissionNode = float(settings.transmission);
  material.foliageThicknessNode = leafThicknessNode(settings, visibility, alpha, color.dot(vec3(0.2126, 0.7152, 0.0722)));
  material.foliageTransmissionColorNode = vec3(...new Color(settings.transmissionColor).toArray());
  material.foliageAbsorptionNode = float(settings.absorption);
  material.foliageVisibilityNode = sky;
  material.foliageWrapDiffuseNode = float(settings.wrapDiffuse);
  material.foliageRimGlowNode = float(settings.rimGlow);
  material.foliageWetnessNode = surfaceWetnessUniform.mul(settings.wetStrength).mul(sky)
    .mul(normalWorld.y.abs().mul(0.35).add(0.65).clamp(0, 1));
  material.foliageNeedleSpecularNode = float(settings.needleSpecular);
  material.foliageWetRoughnessNode = float(settings.wetRoughness);
  if (material.isMeshStandardNodeMaterial) {
    const dry = material.roughnessNode ?? materialRoughness;
    material.foliageDryRoughnessNode = dry;
    material.roughnessNode = mix(dry, dry.min(settings.wetRoughness), material.foliageWetnessNode);
  }
  if (settings.needleSpecular > 0 && bounds) {
    const coords = uv(material.map?.channel ?? 0);
    material.foliageNeedleDirectionNode = positionView.dFdy().mul(coords.dFdx().x)
      .sub(positionView.dFdx().mul(coords.dFdy().x)).add(vec3(0, 0.00001, 0)).normalize();
  }
  material.aoNode = (material.aoNode ?? materialAO).mul(sky);
  if (bounds && settings.normalBlend > 0) {
    // Normal adjustment happens before instancing; authored geometry stays intact.
    material.foliageShapeNormalNode = crownPuffNormalNode(bounds, settings.puffStrength);
    // Sheltered interior seams blend strongly toward the canopy-wide normal to erase cluster-on-cluster creases.
    const interiorBlend = Math.min(0.92, settings.normalBlend + 0.08);
    material.foliageNormalBlendNode = mix(float(interiorBlend), float(settings.normalBlend), sky);
  }
  if (bounds && settings.rimRuffle > 0) {
    material.foliageRimRuffleNode = crownRimRuffleNode(bounds, settings.rimRuffle);
  }
  material.userData.treeFoliageSurface = settings;
  setRuntimeUserData(material, 'canopyVisibilityNode', visibility);
  return { visibility: sky };
}

/** LOD snow must mask both the film lobe and the PBR roughness adjustment. */
export function applyTreeFoliageSnowSurface(material, cap) {
  if (material.foliageThicknessNode) material.foliageSnowNode = cap;
  if (material.foliageWetnessNode) material.foliageWetnessNode = material.foliageWetnessNode.mul(cap.oneMinus());
  if (material.foliageNeedleSpecularNode) material.foliageNeedleSpecularNode = material.foliageNeedleSpecularNode.mul(cap.oneMinus());
  if (material.foliageDryRoughnessNode) {
    const dry = material.foliageDryRoughnessNode;
    const wet = mix(dry, dry.min(material.foliageWetRoughnessNode), material.foliageWetnessNode);
    material.roughnessNode = mix(wet, float(0.95), cap);
  }
}

export function treeGeometryVisibility(hasCanopyVisibility) {
  return hasCanopyVisibility ? attribute('canopyVisibility', 'float') : float(1);
}
