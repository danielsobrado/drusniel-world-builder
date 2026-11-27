import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  attribute,
  cameraPosition,
  cameraViewMatrix,
  clamp,
  color,
  dot,
  float,
  interleavedGradientNoise,
  mix,
  modelWorldMatrix,
  normalLocal,
  normalView,
  normalWorld,
  normalize,
  positionLocal,
  positionWorld,
  screenCoordinate,
  sin,
  smoothstep,
  step,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import { LOOK_SNOW_STEPS } from '../../biomes/BiomeLooks.js';
import { snowLightUniforms } from '../sky/skyLight.js';
import { snowCoat } from '../surfaceCoatings/SnowCoat.js';
import { surfaceCoatings } from '../surfaceCoatings/SurfaceCoatingConfig.js';
import { publishCoatCoverage } from '../surfaceCoatings/CoatCoverage.js';
import { SNOW_GROUND_COLOR } from '../snowDeposition.js';
import { sampleWorldSurfaceContextAt, sampleWorldSurfaceContextVarying } from '../worldSurfaceContext/WorldSurfaceContextState.js';
import { applyJungleMist } from '../ambient/jungleMistOutput.js';

const CAP_SNOW_COLOR = '#eff4f9';
const GEO_ONLY = Object.freeze({ includeBase: false, includeEco: false });

/**
 * Shared near-LOD material for volumetric procedural snow caps and basal
 * snowbanks (`RockSnowCapGeometry.js`).
 *
 * - Basal snowbank vertices (`uv.y > 0.5`) conform vertically in world-scale-aware
 *   metres to sloped WSC terrain (`wsc.height`) and screen-door dither-feather
 *   their outer perimeter seamlessly into the surrounding snowfield.
 * - Upper snow caps (`uv.y < 0.5`) carry subtle pillowed subsurface rim glow,
 *   cool skylight shade, Snow007C micro-grain/normals, and subtle seam occlusion.
 * - Zero extra WebGPU samplers (reuses sampler-free `SnowCoat` + existing WSC).
 */
export function createRockSnowCapMaterial({
  snowSource = 'biomeLook',
  ambientEffects = null,
} = {}) {
  const material = new THREE.MeshStandardNodeMaterial({
    name: 'rock-snow-cap',
    roughness: 0.84,
    metalness: 0,
    alphaTest: 0.5,
  });

  const uvNode = uv();
  const thickness = uvNode.x;
  const isBank = uvNode.y.smoothstep(0.35, 0.65);

  const snowAmount = snowSource === 'instanceSnow'
    ? attribute('instanceSnow', 'float').clamp(0, 1)
    : attribute('instanceBiomeLook', 'vec4').w.div(4).floor().div(LOOK_SNOW_STEPS).clamp(0, 1);

  // Vertex conform: clamp basal snowbank height in real world metres above WSC terrain
  // (dividing delta by instance world Y scale so 8.5x formation keystones never overshoot).
  material.positionNode = Fn(() => {
    const pos = vec3(positionLocal).toVar('snowCapPos');
    // Slightly deflate upper caps under lighter snowfall so thickness reflects local snow depth.
    const capScale = mix(float(0.65), float(1.0), snowAmount.smoothstep(0.35, 0.95));
    const capOffset = normalLocal.mul(capScale.sub(1).mul(0.05)).mul(isBank.oneMinus());
    pos.addAssign(capOffset);

    If(isBank.greaterThan(0.05), () => {
      const vertexWorld = modelWorldMatrix.mul(vec4(pos, 1));
      const vGround = sampleWorldSurfaceContextAt(vertexWorld.xz, GEO_ONLY);
      const scaleY = modelWorldMatrix.mul(vec4(0, 1, 0, 0)).xyz.length().max(0.01);
      const feather = float(1).sub(thickness).clamp(0, 1);
      // Clamp basal snowbank crest height in real metres (<= 0.24 m above terrain)
      // and tuck outer toe smoothly below the snowfield.
      const maxWorldAbove = thickness.mul(0.24).sub(feather.mul(0.03));
      const rawAbove = vertexWorld.y.sub(vGround.height);
      const clampedAbove = clamp(rawAbove, float(-0.04), maxWorldAbove);
      const bankDeltaLocal = clampedAbove.sub(rawAbove).div(scaleY);
      pos.y.addAssign(bankDeltaLocal.mul(vGround.validity));
    });
    return pos;
  })();

  const world = positionWorld;
  const n = normalize(normalWorld);
  const groundContact = sampleWorldSurfaceContextVarying(world.xz, 'rock');
  const coatSettings = surfaceCoatings();
  const coat = snowCoat(world, n, float(1), coatSettings);

  // Align basal snowbank normal smoothly to the WSC terrain slope so the snowbank
  // dissolves into the snowfield without a lighting step at its perimeter.
  const groundViewNormal = normalize(cameraViewMatrix.mul(vec4(groundContact.normal, 0)).xyz);
  const bankAlign = isBank.mul(float(1).sub(thickness.mul(0.45))).mul(groundContact.validity).clamp(0, 0.95);
  const baseNormal = normalize(mix(normalView, groundViewNormal, bankAlign));
  const finalNormal = coat?.normal(baseNormal) ?? baseNormal;

  // Powder velvet grazing rim + cool skylight shadow fill + soft inner rock-seam AO.
  const view = normalize(cameraPosition.sub(world));
  const velvet = float(1).sub(dot(n, view).clamp(0, 1)).pow(2.4).mul(0.14).mul(isBank.oneMinus().add(thickness.mul(0.3)));
  const snowFacing = mix(n.y, float(1), bankAlign.mul(0.85));
  const shadeFill = mix(snowLightUniforms.shadeTint, vec3(1, 1, 1), smoothstep(0.24, 0.84, snowFacing));

  // Cool glacial blue occlusion where the snowbank meets rock AND matching WSC
  // terrain contact shadow so the snowbank blends cleanly into blue-shaded snowfields.
  const innerSeam = isBank.mul(thickness.smoothstep(0.54, 1.0)).mul(0.28)
    .add(isBank.oneMinus().mul(thickness.smoothstep(0.55, 0.15)).mul(0.18));
  const terrainContactShadow = isBank.mul(groundContact.contact.smoothstep(0.04, 0.68)).mul(0.42).mul(groundContact.validity);
  const seamAo = mix(vec3(1, 1, 1), vec3(0.54, 0.72, 0.96), innerSeam.add(terrainContactShadow).clamp(0, 0.56));

  // Match the snowfield's resolved WSC albedo and cool shade depth along the basal bank.
  const toeFactor = isBank.mul(float(1).sub(thickness.mul(0.65))).clamp(0, 1);
  const wscGround = mix(color(SNOW_GROUND_COLOR), groundContact.albedo, groundContact.validity);
  const capLit = color(CAP_SNOW_COLOR)
    .mul(shadeFill)
    .mul(snowLightUniforms.brightness.max(0.84))
    .mul(coat?.tint ?? vec3(1));
  const bankLit = wscGround
    .mul(mix(shadeFill, snowLightUniforms.shadeTint.mul(0.52).add(vec3(0.48)), bankAlign.mul(0.82)))
    .mul(mix(coat?.tint ?? vec3(1), vec3(1, 1, 1), toeFactor.mul(0.4)))
    .mul(float(0.78));
  const snowColor = mix(capLit, bankLit, isBank)
    .mul(seamAo)
    .add(vec3(0.84, 0.92, 1.0).mul(velvet).mul(toeFactor.oneMinus()));

  // Organic scalloped screen-door dissolve on the basal snowbank perimeter so
  // it feathers invisibly into the snowfield under TAA without any hard polygon rim.
  const edgeWave = sin(world.x.mul(1.7).add(world.z.mul(1.3)))
    .mul(sin(world.z.mul(2.1).sub(world.x.mul(0.9))))
    .mul(0.18);
  const bankCoverage = smoothstep(0.08, 0.78, thickness.add(edgeWave)).clamp(0, 1);
  const coverage = mix(float(1), bankCoverage, isBank);
  material.opacityNode = step(interleavedGradientNoise(screenCoordinate.xy), coverage);

  const baseRoughness = coatSettings.snow.enabled ? coatSettings.snow.roughness : 0.84;
  material.colorNode = snowColor;
  material.roughnessNode = float(baseRoughness).add(coat?.roughness ?? 0).clamp(0.45, 0.98);
  material.normalNode = finalNormal;
  publishCoatCoverage(material, { snow: float(1) });
  applyJungleMist(material, ambientEffects);
  material.needsUpdate = true;
  return material;
}
