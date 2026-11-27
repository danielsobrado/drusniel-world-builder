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
  mix,
  modelWorldMatrix,
  normalLocal,
  normalView,
  normalWorld,
  normalize,
  positionLocal,
  positionWorld,
  smoothstep,
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
 * - Basal snowbank vertices (`uv.y > 0.5`) conform vertically to sloped WSC
 *   terrain (`wsc.height`) so drifted banks never float or clip on hillsides,
 *   while their outer feather ring (`uv.x -> 0`) aligns normal and albedo smoothly
 *   into the surrounding snowfield.
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
    roughness: 0.82,
    metalness: 0,
  });

  const uvNode = uv();
  const thickness = uvNode.x;
  const isBank = uvNode.y.smoothstep(0.35, 0.65);

  const snowAmount = snowSource === 'instanceSnow'
    ? attribute('instanceSnow', 'float').clamp(0, 1)
    : attribute('instanceBiomeLook', 'vec4').w.div(4).floor().div(LOOK_SNOW_STEPS).clamp(0, 1);

  // Vertex conform: clamp basal snowbank height in real metres above WSC terrain
  // so 8.5x formation keystones grow natural knee-high snowbanks instead of cones.
  material.positionNode = Fn(() => {
    const pos = vec3(positionLocal).toVar('snowCapPos');
    // Slightly deflate upper caps under lighter snowfall so thickness reflects local snow depth.
    const capScale = mix(float(0.65), float(1.0), snowAmount.smoothstep(0.35, 0.95));
    const capOffset = normalLocal.mul(capScale.sub(1).mul(0.05)).mul(isBank.oneMinus());
    pos.addAssign(capOffset);

    If(isBank.greaterThan(0.05), () => {
      const vertexWorld = modelWorldMatrix.mul(vec4(pos, 1));
      const vGround = sampleWorldSurfaceContextAt(vertexWorld.xz, GEO_ONLY);
      const feather = float(1).sub(thickness).clamp(0, 1);
      // Clamp basal snowbank crest height in real metres (<= 0.42 m above terrain)
      // so 8.5x formation keystones grow natural knee-high snowbanks instead of tall cones.
      const maxWorldAbove = thickness.mul(0.42).sub(feather.mul(0.03));
      const rawAbove = vertexWorld.y.sub(vGround.height);
      const clampedAbove = clamp(rawAbove, float(-0.04), maxWorldAbove);
      const bankDelta = clampedAbove.sub(rawAbove);
      pos.y.addAssign(bankDelta.mul(vGround.validity));
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
  const bankAlign = isBank.mul(float(1).sub(thickness.mul(0.55))).mul(groundContact.validity).clamp(0, 0.92);
  const baseNormal = normalize(mix(normalView, groundViewNormal, bankAlign));
  const finalNormal = coat?.normal(baseNormal) ?? baseNormal;

  // Powder velvet grazing rim + cool skylight shadow fill + soft inner rock-seam AO.
  const view = normalize(cameraPosition.sub(world));
  const velvet = float(1).sub(dot(n, view).clamp(0, 1)).pow(2.4).mul(0.14).mul(isBank.oneMinus().add(thickness.mul(0.4)));
  const snowFacing = mix(n.y, float(1), bankAlign.mul(0.85));
  const shadeFill = mix(snowLightUniforms.shadeTint, vec3(1, 1, 1), smoothstep(0.24, 0.84, snowFacing));

  // Subtle blue occlusion where the upper cap's underside or snowbank crest tucks into rock.
  const innerSeam = isBank.mul(thickness.smoothstep(0.62, 1.0)).mul(0.16)
    .add(isBank.oneMinus().mul(thickness.smoothstep(0.55, 0.15)).mul(0.18));
  const seamAo = mix(vec3(1, 1, 1), vec3(0.76, 0.85, 0.97), innerSeam.clamp(0, 0.34));

  const groundSnow = mix(color(SNOW_GROUND_COLOR), groundContact.albedo.max(vec3(0.45)), groundContact.validity.mul(0.65));
  const baseTint = mix(color(CAP_SNOW_COLOR), groundSnow, isBank.mul(float(1).sub(thickness.mul(0.45))));
  const snowColor = baseTint
    .mul(shadeFill)
    .mul(seamAo)
    .mul(snowLightUniforms.brightness.max(0.84))
    .mul(coat?.tint ?? vec3(1))
    .add(vec3(0.84, 0.92, 1.0).mul(velvet));

  const baseRoughness = coatSettings.snow.enabled ? coatSettings.snow.roughness : 0.82;
  material.colorNode = snowColor;
  material.roughnessNode = float(baseRoughness).add(coat?.roughness ?? 0).clamp(0.45, 0.98);
  material.normalNode = finalNormal;
  publishCoatCoverage(material, { snow: float(1) });
  applyJungleMist(material, ambientEffects);
  material.needsUpdate = true;
  return material;
}
