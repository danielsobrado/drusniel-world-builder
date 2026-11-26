import * as THREE from 'three/webgpu';
import {
  attribute, cameraPosition, color, dot, float, mix, mx_noise_float, normalLocal, normalView, normalWorld, normalize,
  positionGeometry, positionLocal, positionWorld, smoothstep, varying, vec3,
} from 'three/tsl';
import { coldStone } from '../rockSnowSurface.js';
import { snowCoat } from '../surfaceCoatings/SnowCoat.js';
import { surfaceCoatings } from '../surfaceCoatings/SurfaceCoatingConfig.js';
import { blendCoat } from '../../../render/materials/surfaceLayers/PbrCoatBlend.js';
import { PREVAILING_WIND } from '../../materials/SnowAccumulation.js';
import { SNOW_GROUND_COLOR, snowDeposition } from '../snowDeposition.js';
import { snowLightUniforms } from '../sky/skyLight.js';
import { stormSnowCoverAt } from '../../weather/storm/snowField/snowFieldState.js';
import { sampleWorldSurfaceContextVarying } from '../worldSurfaceContext/WorldSurfaceContextState.js';
import { applyWorldSurfaceContact } from '../worldSurfaceContext/WorldSurfaceContactNodes.js';

const SNOW = '#eef3f8';
/** AlpineRockView sinks each unit rock to put the ground here, in its own space (0.5 - BURIAL below centre). */
const GROUND_Y = -0.15;
/** Vertex puff thickness (in unit-rock space) on snow-capped upper shelves & lee aprons. */
const SNOW_CAP_PUFF = 0.055;

/** Stone projected in world space with wind-feathered, slightly puffed snow caps & drift skirts. */
export function createAlpineRockMaterial() {
  const material = new THREE.MeshStandardNodeMaterial({ name: 'alpine-rock' });
  const instanceSnow = attribute('instanceSnow', 'float');
  // Subtle vertex puffing on upper snow-capped shelves so snow pillows over jagged crag ledges.
  const capPuff = smoothstep(0.42, 0.85, normalLocal.y).mul(instanceSnow).mul(SNOW_CAP_PUFF);
  const puffDir = normalize(normalLocal.mul(0.55).add(vec3(0, 0.85, 0)));
  material.positionNode = positionLocal.add(puffDir.mul(capPuff));

  const p = positionWorld.toVar();
  const n = normalize(normalWorld).toVar();
  const stone = coldStone(p, n).toVar();
  // Anisotropically wind-streaked breakup replaces round cow-spot noise blotches.
  const wind = vec3(PREVAILING_WIND[0], 0, PREVAILING_WIND[1]).normalize();
  const along = dot(p, wind);
  const across = p.x.mul(wind.z.negate()).add(p.z.mul(wind.x));
  const stretched = vec3(along.mul(0.18), p.y.mul(0.65), across.mul(0.52));
  const breakup = mx_noise_float(stretched).mul(0.65).add(mx_noise_float(p.mul(1.6)).mul(0.35)).toVar();

  const groundContact = sampleWorldSurfaceContextVarying(p.xz, 'alpineRock');
  const objectLevel = varying(positionGeometry.y.sub(GROUND_Y).div(1.15));
  const groundLevel = mix(objectLevel, p.y.sub(groundContact.height).div(1.6), groundContact.validity);

  const { cover: snow, skirt } = snowDeposition({
    snow: instanceSnow.max(stormSnowCoverAt(p.xz)),
    breakup: breakup.mul(0.62),
    centre: [0, 0, 0],
    groundY: GROUND_Y,
    height: 1.15,
    levelNode: groundLevel,
  });
  // When snow is sparse or absent, blend a mineral scree / WSC surface collar into the crag base (PR 4).
  const screeContact = applyWorldSurfaceContact({
    surface: { color: stone, roughness: float(0.86), normal: normalView },
    wsc: groundContact,
    profile: 'alpineRock',
    worldY: p.y,
    fallbackHeight: positionGeometry.y.sub(GROUND_Y),
    fallbackAlbedo: color('#6b6a66'),
    noiseOffset: breakup.sub(0.5),
    mask: snow.oneMinus(),
  });
  const groundedStone = screeContact.color;
  const stoneNormalBase = screeContact.normal;
  const stoneRoughness = screeContact.roughness;

  const settings = surfaceCoatings();
  const coat = snowCoat(p, n, snow, settings);
  // Subtle blue skylight fill on side-facing snow + soft powder velvet rim on crag caps.
  const view = normalize(cameraPosition.sub(p));
  const velvet = float(1).sub(dot(n, view).clamp(0, 1)).pow(2.5).mul(0.14);
  const shadeFill = mix(snowLightUniforms.shadeTint, vec3(1, 1, 1), smoothstep(0.35, 0.88, n.y));
  const snowColor = mix(color(SNOW), color(SNOW_GROUND_COLOR), skirt)
    .mul(shadeFill)
    .mul(snowLightUniforms.brightness.max(0.84))
    .mul(coat?.tint ?? vec3(1))
    .add(vec3(0.85, 0.92, 1.0).mul(velvet));
  const snowRoughness = settings.snow.enabled ? settings.snow.roughness : 0.78;
  const surface = blendCoat(
    { color: groundedStone, roughness: stoneRoughness, normal: stoneNormalBase },
    { color: snowColor, roughness: float(snowRoughness).add(coat?.roughness ?? 0), normal: coat?.normal() },
    snow,
  );
  material.colorNode = surface.color;
  material.roughnessNode = surface.roughness;
  material.normalNode = (coat && settings.snow.enabled) ? surface.normal : stoneNormalBase;
  return material;
}
