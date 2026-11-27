import * as THREE from 'three/webgpu';
import {
  attribute, cameraPosition, cameraViewMatrix, color, dot, float, mix, mx_noise_float, normalLocal, normalView,
  normalWorld, normalize, positionGeometry, positionLocal, positionWorld, smoothstep, varying, vec3, vec4,
} from 'three/tsl';
import { coldStoneSurface } from '../rockSnowSurface.js';
import { snowCoat } from '../surfaceCoatings/SnowCoat.js';
import { surfaceCoatings } from '../surfaceCoatings/SurfaceCoatingConfig.js';
import { blendCoat, coatDetailFade } from '../../../render/materials/surfaceLayers/PbrCoatBlend.js';
import { PREVAILING_WIND } from '../../materials/SnowAccumulation.js';
import { SNOW_GROUND_COLOR, snowDeposition } from '../snowDeposition.js';
import { snowLightUniforms } from '../sky/skyLight.js';
import { stormSnowCoverAt } from '../../weather/storm/snowField/snowFieldState.js';
import { sampleWorldSurfaceContextVarying } from '../worldSurfaceContext/WorldSurfaceContextState.js';
import { applyWorldSurfaceContact } from '../worldSurfaceContext/WorldSurfaceContactNodes.js';
import { publishCoatCoverage } from '../surfaceCoatings/CoatCoverage.js';

const SNOW = '#eef3f8';
/** AlpineRockView sinks each unit rock to put the ground here, in its own space (0.5 - BURIAL below centre). */
const GROUND_Y = -0.15;
/** Vertex puff thickness (in unit-rock space) on snow-capped upper shelves & lee aprons. */
const SNOW_CAP_PUFF = 0.055;

/** Fractured alpine stone in world metres with basalt normal/roughness relief, frost rime & drifted snow caps. */
export function createAlpineRockMaterial() {
  const material = new THREE.MeshStandardNodeMaterial({ name: 'alpine-rock' });
  const instanceSnow = attribute('instanceSnow', 'float');
  // Subtle vertex puffing on upper snow-capped shelves so snow pillows over jagged crag ledges.
  const capPuff = smoothstep(0.42, 0.85, normalLocal.y).mul(instanceSnow).mul(SNOW_CAP_PUFF);
  const puffDir = normalize(normalLocal.mul(0.55).add(vec3(0, 0.85, 0)));
  material.positionNode = positionLocal.add(puffDir.mul(capPuff));

  const p = positionWorld.toVar();
  const n = normalize(normalWorld).toVar();
  const settings = surfaceCoatings();
  // Warm weathered canyon/mountain stone on dry crags (e.g. Stonehold Badlands),
  // transitioning cleanly to cold blue-slate alpine granite where snow lies.
  const cragTint = mix(color('#c6bfb2'), color('#a4b0be'), instanceSnow.smoothstep(0.1, 0.65));
  const cold = coldStoneSurface({
    point: p,
    normal: n,
    baseNormal: normalView,
    detailFade: coatDetailFade(settings.detail),
    rimeAmount: instanceSnow.smoothstep(0.2, 0.85).mul(0.55),
    tint: cragTint,
  });

  // Anisotropically wind-streaked breakup replaces round cow-spot noise blotches.
  const wind = vec3(PREVAILING_WIND[0], 0, PREVAILING_WIND[1]).normalize();
  const along = dot(p, wind);
  const across = p.x.mul(wind.z.negate()).add(p.z.mul(wind.x));
  const stretched = vec3(along.mul(0.22), p.y.mul(0.75), across.mul(0.58));
  const breakup = mx_noise_float(stretched).mul(0.60).add(mx_noise_float(p.mul(1.75)).mul(0.40)).toVar();

  const groundContact = sampleWorldSurfaceContextVarying(p.xz, 'alpineRock');
  const objectLevel = varying(positionGeometry.y.sub(GROUND_Y).div(1.15));
  const groundLevel = mix(objectLevel, p.y.sub(groundContact.height).div(2.0), groundContact.validity);

  const ledgeBoost = cold.perturbedUp.sub(n.y).max(0).mul(0.58);
  const { cover: snow, skirt, cap, apron, thickness } = snowDeposition({
    snow: instanceSnow.max(stormSnowCoverAt(p.xz)),
    breakup: breakup.mul(0.62),
    ledgeBoost,
    crevice: cold.crevice,
    surfaceHeight: cold.height,
    centre: [0, 0, 0],
    groundY: GROUND_Y,
    height: 1.15,
    levelNode: groundLevel,
  });

  // When snow is sparse or absent, blend a mineral scree / WSC surface collar into the crag base (PR 4),
  // while keeping base contact AO active even on snowy crags (`aoMask: float(1)`).
  const screeContact = applyWorldSurfaceContact({
    surface: { color: cold.color, roughness: cold.roughness, normal: cold.normal },
    wsc: groundContact,
    profile: 'alpineRock',
    worldY: p.y,
    fallbackHeight: positionGeometry.y.sub(GROUND_Y),
    fallbackAlbedo: color('#6b6a66'),
    noiseOffset: breakup.sub(0.5),
    mask: snow.oneMinus(),
    aoMask: float(1),
  });
  const snowBounce = vec3(0.76, 0.86, 1.0)
    .mul(instanceSnow.smoothstep(0.35, 0.9))
    .mul(n.y.smoothstep(0.65, -0.35))
    .mul(p.y.sub(groundContact.height).clamp(0, 3.0).smoothstep(2.8, 0.2))
    .mul(0.045);
  const groundedStone = screeContact.color.add(snowBounce);
  const stoneNormalBase = screeContact.normal;
  const stoneRoughness = screeContact.roughness;

  // Soften crag top cap normals toward sky-up and align basal snow apron normal to WSC terrain slope.
  const upView = normalize(cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz);
  const capSmoothNormal = normalize(mix(
    normalView,
    upView,
    cap.mul(smoothstep(0.30, 0.85, n.y)).mul(mix(float(0.40), float(0.68), thickness)),
  ));
  const groundViewNormal = normalize(cameraViewMatrix.mul(vec4(groundContact.normal, 0)).xyz);
  const apronAlign = apron.mul(groundContact.validity).mul(0.86).clamp(0, 0.90);
  const snowBaseNormal = normalize(mix(capSmoothNormal, groundViewNormal, apronAlign));

  const coat = snowCoat(p, n, snow, settings);
  // Subtle blue skylight fill on side-facing snow + soft powder velvet rim on crag caps.
  const view = normalize(cameraPosition.sub(p));
  const velvet = float(1).sub(dot(n, view).clamp(0, 1)).pow(2.5).mul(0.12);
  const snowFacing = mix(n.y, float(1), apronAlign.mul(0.8));
  const shadeFill = mix(snowLightUniforms.shadeTint, vec3(1, 1, 1), smoothstep(0.32, 0.86, snowFacing));
  const skirtBaseColor = mix(color(SNOW_GROUND_COLOR), groundContact.albedo.max(vec3(0.45)), groundContact.validity.mul(0.55));
  const snowColor = mix(color(SNOW), skirtBaseColor, skirt)
    .mul(shadeFill)
    .mul(snowLightUniforms.brightness.max(0.84))
    .mul(coat?.tint ?? vec3(1))
    .add(vec3(0.85, 0.92, 1.0).mul(velvet).mul(apron.oneMinus()));
  const snowRoughness = settings.snow.enabled ? settings.snow.roughness : 0.78;
  const snowNormal = (coat && settings.snow.enabled) ? coat.normal(snowBaseNormal) : snowBaseNormal;
  const surface = blendCoat(
    { color: groundedStone, roughness: stoneRoughness, normal: stoneNormalBase },
    { color: snowColor, roughness: float(snowRoughness).add(coat?.roughness ?? 0), normal: snowNormal },
    snow,
  );
  material.colorNode = surface.color;
  material.roughnessNode = surface.roughness;
  material.normalNode = surface.normal;
  publishCoatCoverage(material, { snow });
  return material;
}
