import * as THREE from 'three/webgpu';
import {
  attribute,
  clamp,
  color,
  dot,
  float,
  mix,
  normalGeometry,
  normalViewGeometry,
  normalWorld,
  positionGeometry,
  positionWorld,
  smoothstep,
  texture,
  vec2,
  vec3,
} from 'three/tsl';
import { LOOK_SNOW_STEPS } from '../../biomes/BiomeLooks.js';
import { stylizedFbm2 } from '../StylizedNoiseNodes.js';
import { meadowPatchOnPlant } from '../understoryPatch.js';
import { surfaceWetnessUniform } from '../../weather/surfaceWetness.js';
import { sampleWorldSurfaceContextVarying } from '../worldSurfaceContext/WorldSurfaceContextState.js';
import { applyWorldSurfaceContact } from '../worldSurfaceContext/WorldSurfaceContactNodes.js';
import { gradeBark, resolveBarkGrade } from './barkGrade.js';
import { acquireDeadwoodNoise } from './deadwoodNoise.js';
import { treeBarkEmission, understoryShadeEmission } from './foliageLight.js';
import { createProceduralBarkTextures } from './ProceduralBarkTextures.js';
import { barkBumpNormal, barkPackedNormal } from './TreeBarkMaterial.js';
import {
  createArchedRootBridgeGeometry,
  createFallenBranchGeometry,
  createFallenLogGeometry,
  createFungiClusterGeometry,
  createHollowNurseTrunkGeometry,
  createLeafLitterGeometry,
  createMossMoundGeometry,
  createRootWadGeometry,
  createShelfFungusLogGeometry,
  createSnappedSnagGeometry,
  createSplitTimberLogGeometry,
  createStumpGeometry,
} from './forestDebrisGeometry.js';
import { blendCoat } from '../../../render/materials/surfaceLayers/PbrCoatBlend.js';
import { mossCoat } from '../surfaceCoatings/MossCoat.js';
import { snowCoat } from '../surfaceCoatings/SnowCoat.js';
import { surfaceCoatings } from '../surfaceCoatings/SurfaceCoatingConfig.js';
import { publishCoatCoverage } from '../surfaceCoatings/CoatCoverage.js';

const BARK_UNDERTONES = Object.freeze({
  beech: '#7a654e',
  spruce: '#73583f',
  pine: '#7c5539',
  swamp: '#665b47',
});

function vertexColorRgb() {
  return attribute('color', 'vec3');
}

/** Cushions of moss stems modulated by multi-scale pillow noise, peaty humus skirt, and biome meadow tone. */
function mossSurfaceNodes({ baseUrl = '', soilColor = '#5c4a30', floorColor = '#3b5233', config = null } = {}) {
  const noise = acquireDeadwoodNoise(baseUrl);
  const dither = attribute('instanceDither', 'vec3');
  const look = attribute('instanceBiomeLook', 'vec4');
  const at = positionGeometry.xz.add(vec2(dither.y.mul(2.9), dither.y.mul(4.1)));
  const pillows = texture(noise.texture, at.mul(3.6)).b;
  const fine = texture(noise.texture, at.mul(10.5)).b;
  const crevices = texture(noise.texture, at.mul(7.2)).g;
  const spore = texture(noise.texture, at.mul(5.4)).r;
  const patches = stylizedFbm2(at.mul(2.4).add(5.3)).mul(0.5).add(0.5);

  const relief = pillows.mul(0.5).add(fine.mul(0.5));
  const cushionShade = vec3(mix(0.28, 1.34, relief.smoothstep(0.22, 0.78)))
    .mul(mix(0.56, 1.12, crevices.smoothstep(0.18, 0.72)));
  const mossBase = mix(vertexColorRgb(), color(floorColor), 0.36);
  const dryTips = mix(mossBase, mossBase.mul(color('#b7a362')), patches.smoothstep(0.48, 0.86).mul(0.5));
  const texturedMoss = dryTips.mul(cushionShade).mul(mix(0.8, 1.2, spore));

  // WSC generic contact collar (PR 4): blends cushion rim into actual sloped terrain
  // albedo, roughness, and slope normal instead of static hardcoded soilColor.
  const mossWsc = sampleWorldSurfaceContextVarying(positionWorld.xz, 'mossMound');
  const mossBump = barkBumpNormal(relief.mul(0.085).add(crevices.mul(0.032)));
  const mossContact = applyWorldSurfaceContact({
    surface: { color: texturedMoss, roughness: float(0.96), normal: mossBump },
    wsc: mossWsc,
    profile: 'mossMound',
    fallbackHeight: positionGeometry.y,
    fallbackAlbedo: color(soilColor).mul(mix(0.82, 1.12, spore)),
    noiseOffset: pillows.sub(0.5),
  });
  const grounded = mossContact.color;
  const patched = config ? meadowPatchOnPlant(grounded, config) : grounded;

  const snowSteps = look.w.div(4).floor();
  const saturation = look.w.sub(snowSteps.mul(4));
  const toned = mix(vec3(dot(patched, vec3(0.2126, 0.7152, 0.0722))), patched, saturation).mul(look.xyz);
  const snowDepth = snowSteps.div(LOOK_SNOW_STEPS);
  const snowCap = smoothstep(0.18, 0.62, normalWorld.y.add(pillows.sub(0.5).mul(0.45)))
    .mul(snowDepth.mul(1.2).clamp(0, 1))
    .mul(snowDepth.smoothstep(0.14, 0.38));
  const colorNode = mix(toned, vec3(0.88, 0.91, 0.95), snowCap.mul(0.85));
  return {
    colorNode,
    normalNode: mossContact.normal,
    roughnessNode: mossContact.roughness,
    emissiveNode: understoryShadeEmission(colorNode),
  };
}

function deadwoodCoords(horizontal = false, offset = vec2(0), axisScale = vec2(1.4, 0.55)) {
  const weights = normalGeometry.abs().div(normalGeometry.abs().dot(vec3(1)).max(1e-5));
  if (horizontal) {
    // Fallen trunks lie along +X, so both top (nrm.y) and side (nrm.z) map V lengthwise along X
    // to keep bark fissures and wood fibers aligned with the grain rather than wrapped across it.
    return {
      weights,
      coords: [
        positionGeometry.zy.mul(axisScale.x).add(offset),
        vec2(positionGeometry.z, positionGeometry.x).mul(axisScale).add(offset),
        vec2(positionGeometry.y, positionGeometry.x).mul(axisScale).add(offset),
      ],
    };
  }
  return {
    weights,
    coords: [
      vec2(positionGeometry.z, positionGeometry.y).mul(axisScale).add(offset),
      positionGeometry.xz.mul(axisScale.x).add(offset),
      vec2(positionGeometry.x, positionGeometry.y).mul(axisScale).add(offset),
    ],
  };
}

function sampleTriplanar(map, { weights, coords }, collector = null) {
  const taps = coords.map((coord) => {
    const node = texture(map, coord);
    if (collector) collector.push(node);
    return node;
  });
  return taps[0].mul(weights.x).add(taps[1].mul(weights.y)).add(taps[2].mul(weights.z));
}

/**
 * Deadwood shader shared by fallen logs, stumps, and fallen branches:
 * - Grain-aligned triplanar bark with softened plate relief so logs read as longitudinal bark rather than scales
 * - Multi-channel `deadwood-noise.png` driving longitudinal fibers/silvering (R), cracks (G), and moss/lichen (B)
 * - Semantic vertex-color regions from geometry (`BARK`, `EXPOSED_WOOD`, `ROT_DARK/PUNK`, `MOSS` pockets)
 * - Biome moss, crustose lichen, damp humus collar, snow cap, rain wetness, and `treeBarkEmission`
 */
export function deadwoodMaterial(
  barkTextures,
  {
    barkProfile = 'spruce',
    soilColor = '#5c4a30',
    floorColor = '#3b5233',
    barkGrade = null,
    config = null,
    baseUrl = '',
    horizontal = false,
    olderWood = false,
    roughness = 0.94,
    bumpScale = 0.016,
  } = {},
) {
  const noise = acquireDeadwoodNoise(baseUrl);
  const dither = attribute('instanceDither', 'vec3');
  const instanceShift = vec2(dither.y.mul(3.7), dither.y.mul(5.3));
  const barkScale = horizontal ? vec2(2.1, 0.46) : vec2(1.9, 0.64);
  const grainScale = horizontal ? vec2(2.8, 0.44) : vec2(2.4, 0.62);
  const proj = deadwoodCoords(horizontal, instanceShift, barkScale);
  const fiberProj = deadwoodCoords(horizontal, instanceShift.mul(0.5), grainScale);

  const albedoTexNodes = [];
  const normalTexNodes = [];
  const albedoHeight = sampleTriplanar(barkTextures.albedoHeight, proj, albedoTexNodes);
  const normalRoughness = sampleTriplanar(barkTextures.normalRoughness, proj, normalTexNodes);
  const deadwoodNoise = sampleTriplanar(noise.texture, proj);
  const fiberNoise = sampleTriplanar(noise.texture, fiberProj);
  const detailNoise = sampleTriplanar(noise.texture, {
    weights: proj.weights,
    coords: proj.coords.map((c) => c.mul(1.45)),
  });

  // Decode sRGB bark albedo and blend with weathered deadwood undertone so every species reads with textured grain.
  const texLinear = albedoHeight.rgb.mul(albedoHeight.rgb);
  const texBark = texLinear.mul(1.28).mul(albedoHeight.a.mul(0.24).add(0.84));
  const speciesUndertone = color(BARK_UNDERTONES[barkProfile] ?? BARK_UNDERTONES.spruce);
  const scanWeight = barkProfile === 'beech' ? 0.36 : (barkProfile === 'pine' ? 0.54 : 0.60);
  const subtleBark = mix(speciesUndertone, texBark, scanWeight);

  // Semantic vertex masks authored by forestDebrisGeometry.
  const vertexAlbedo = vertexColorRgb();
  const vertexLuma = dot(vertexAlbedo, vec3(0.2126, 0.7152, 0.0722));
  const vertexGreenBias = vertexAlbedo.g.sub(vertexAlbedo.r);
  const exposedMask = smoothstep(0.14, 0.26, vertexAlbedo.r.sub(vertexAlbedo.b))
    .mul(smoothstep(0.22, 0.38, vertexLuma));
  const rotMask = smoothstep(0.048, 0.022, vertexLuma)
    .mul(smoothstep(0.015, -0.005, vertexGreenBias))
    .mul(exposedMask.oneMinus());
  const mossBias = smoothstep(0.0, 0.032, vertexGreenBias);

  const barkAO = clamp(vertexLuma.div(0.22), 0.84, 1.08);
  const isHardwood = barkProfile === 'beech';
  const longitudinalGrain = mix(isHardwood ? 0.82 : 0.88, isHardwood ? 1.18 : 1.14, fiberNoise.r);
  const crackPattern = smoothstep(isHardwood ? 0.20 : 0.18, isHardwood ? 0.66 : 0.62, detailNoise.g);
  const cracks = mix(isHardwood ? 0.66 : 0.78, 1.06, crackPattern);
  const barkMottle = mix(color('#5f4c37'), color('#8f785d'), deadwoodNoise.b);
  const weatheredBase = isHardwood ? mix(subtleBark, barkMottle, 0.44) : subtleBark;
  const topSky = smoothstep(0.24, 0.82, normalGeometry.y);
  const sunSilver = topSky.mul(smoothstep(0.58, 0.92, deadwoodNoise.r)).mul(isHardwood ? 0.08 : 0.12);
  let barkSurface = weatheredBase.mul(barkAO).mul(longitudinalGrain).mul(cracks);
  barkSurface = mix(barkSurface, barkSurface.add(vec3(0.06, 0.056, 0.050)), sunSilver);

  // Fibrous splintered & stripped wood (aligned along trunk grain, without repeating bullseye rings).
  const fiberTone = mix(color('#866b49'), color('#cbb38a'), fiberNoise.r);
  const fiberChecks = mix(0.68, 1.05, smoothstep(0.18, 0.64, fiberNoise.g));
  const splinterShade = clamp(vertexLuma.div(0.45), 0.78, 1.12);
  let exposedWood = fiberTone.mul(fiberChecks).mul(splinterShade);
  exposedWood = mix(exposedWood, color('#a8a092'), topSky.mul(fiberNoise.r).mul(olderWood ? 0.34 : 0.20));

  // Punky dark rot inside cavities, collapsed saddles, and weathered stump tops.
  const punkPits = deadwoodNoise.g.mul(0.55).add(detailNoise.b.mul(0.45));
  const rotSurface = mix(color('#322318'), color('#4e3827'), fiberNoise.r.mul(0.75))
    .mul(mix(0.74, 1.08, punkPits));

  let surface = mix(barkSurface, exposedWood, exposedMask);
  const decayPatch = olderWood
    ? deadwoodNoise.b.mul(detailNoise.g.oneMinus()).smoothstep(0.32, 0.62).mul(0.55)
    : float(0);
  const rotAmount = rotMask.max(decayPatch);
  surface = mix(surface, rotSurface, rotAmount);

  // Selective crustose lichen flecks on weathered upper bark and older stump flanks.
  const lichenNoise = deadwoodNoise.b.mul(detailNoise.r);
  const lichenMask = smoothstep(olderWood ? 0.42 : 0.50, 0.68, lichenNoise)
    .mul(topSky.max(float(horizontal ? 0.15 : 0.38)))
    .mul(exposedMask.oneMinus())
    .mul(rotAmount.oneMinus())
    .mul(olderWood ? 0.62 : 0.38);
  const lichenColor = mix(color('#7c8a6e'), color('#a2ab90'), detailNoise.r);
  surface = mix(surface, lichenColor, lichenMask);

  // Organic patchy moss on top saddles, damp contact pockets, and root-pocket cushions.
  const look = attribute('instanceBiomeLook', 'vec4');
  const snowSteps = look.w.div(4).floor();
  const saturation = look.w.sub(snowSteps.mul(4));
  const dampCollar = smoothstep(0.42, -0.35, normalGeometry.y).mul(smoothstep(-0.09, 0.10, positionGeometry.y));
  const cushionMask = deadwoodNoise.b.mul(detailNoise.r).mul(2.0).smoothstep(olderWood ? 0.42 : 0.50, olderWood ? 0.70 : 0.78);
  const rawMossWeight = topSky.mul(cushionMask)
    .max(dampCollar.mul(cushionMask).mul(0.85))
    .max(mossBias.mul(cushionMask.mul(0.7).add(0.3)).mul(0.85));
  const mossCoverage = rawMossWeight.mul(exposedMask.oneMinus()).mul(olderWood ? 0.64 : 0.48);
  // The shared moss pigment (surfaceCoatings.moss.palette), leaning a little to the floor it lies on.
  const coatSettings = surfaceCoatings();
  const mossPalette = coatSettings.moss.palette;
  const rawMoss = mix(mix(color(mossPalette.deep), color(mossPalette.dark), deadwoodNoise.g), color(floorColor), 0.2);
  const litMoss = mix(rawMoss, color(mossPalette.light), detailNoise.b.mul(0.64));
  const biomeMoss = mix(vec3(dot(litMoss, vec3(0.2126, 0.7152, 0.0722))), litMoss, saturation).mul(look.xyz);

  // Grade bark reflectance identically to standing trees, then compose normals & roughness
  // with the generic WSC contact collar (PR 4) so logs & stumps seamlessly hug sloped terrain.
  const graded = gradeBark(surface, resolveBarkGrade(barkGrade));
  const barkTinted = mix(graded, graded.mul(look.xyz), 0.22);

  const packedSamples = proj.coords.map((coord) => {
    const packedNode = texture(barkTextures.normalRoughness, coord);
    normalTexNodes.push(packedNode);
    return barkPackedNormal(packedNode, coord);
  });
  const packedNormal = packedSamples[0].mul(proj.weights.x)
    .add(packedSamples[1].mul(proj.weights.y))
    .add(packedSamples[2].mul(proj.weights.z))
    .normalize();
  const normalMix = barkProfile === 'beech' ? 0.24 : (barkProfile === 'pine' ? 0.34 : 0.44);
  const softenedBarkNormal = mix(normalViewGeometry, packedNormal, normalMix).normalize();
  const crackBump = detailNoise.g.oneMinus().mul(isHardwood ? 0.011 : 0.008).add(fiberNoise.r.mul(isHardwood ? 0.012 : 0.009));
  const heightWeight = barkProfile === 'beech' ? 0.30 : (barkProfile === 'pine' ? 0.46 : 0.62);
  const heightRelief = mix(fiberNoise.r, albedoHeight.a, heightWeight);
  const bumpNormal = barkBumpNormal(heightRelief.mul(bumpScale).add(crackBump));
  const combinedNormal = softenedBarkNormal.add(bumpNormal.sub(normalViewGeometry)).normalize();
  const creviceWet = albedoHeight.a.oneMinus().mul(0.45).add(0.55);
  const wet = surfaceWetnessUniform.mul(creviceWet).clamp(0, 1);
  const wetNormal = mix(combinedNormal, normalViewGeometry, wet.mul(0.22)).normalize();
  const baseWoodNormal = mix(wetNormal, normalViewGeometry, exposedMask.mul(0.42)).normalize();

  const baseWoodRoughness = mix(normalRoughness.b.max(0.72), float(0.92), exposedMask.mul(0.5))
    .max(rotAmount.mul(0.98))
    .clamp(0.45, 1);

  // The moss coat over the finished wood (colour, roughness and cushion relief),
  // as on stones and trunks; graded bark does not grade the moss on it.
  const mossLayer = mossCoat({
    color: biomeMoss.mul(mix(0.84, 1.14, detailNoise.r)),
    pillow: deadwoodNoise.b,
    tuft: detailNoise.r,
    settings: coatSettings,
  });
  const mossed = blendCoat({ color: barkTinted, roughness: baseWoodRoughness, normal: baseWoodNormal }, {
    color: mossLayer.color,
    roughness: mossLayer.roughness ?? baseWoodRoughness,
    normal: mossLayer.normal(baseWoodNormal) ?? undefined,
  }, mossCoverage);

  const debrisWsc = sampleWorldSurfaceContextVarying(positionWorld.xz, 'debris');
  const humusFallback = config
    ? meadowPatchOnPlant(mix(color(soilColor), biomeMoss, deadwoodNoise.b.mul(0.55)), config)
    : mix(color(soilColor), biomeMoss, deadwoodNoise.b.mul(0.55));
  const soilWaveNoise = deadwoodNoise.b.sub(0.5).mul(0.7).add(detailNoise.g.sub(0.5).mul(0.3));
  const debrisContact = applyWorldSurfaceContact({
    surface: mossed,
    wsc: debrisWsc,
    profile: 'debris',
    fallbackHeight: positionGeometry.y,
    fallbackAlbedo: humusFallback.mul(mix(0.78, 1.08, detailNoise.r)),
    noiseOffset: soilWaveNoise,
    mask: exposedMask.oneMinus(),
    heightScale: horizontal ? float(0.8) : float(1.0),
  });

  const snowDepth = snowSteps.div(LOOK_SNOW_STEPS);
  const snowCap = smoothstep(0.16, 0.56, normalWorld.y.add(deadwoodNoise.b.sub(0.5).mul(0.48)))
    .mul(snowDepth.mul(1.2).clamp(0, 1))
    .mul(snowDepth.smoothstep(0.14, 0.38));
  // The terrain's Snow007C coat, in the log's own frame, as on stones, trunks and roofs.
  const snowCover = snowCap.mul(0.88);
  const snowLayer = snowCoat(positionGeometry, normalGeometry, snowCover, coatSettings);
  const snowed = blendCoat(debrisContact, {
    color: vec3(0.88, 0.91, 0.95).mul(snowLayer?.tint ?? vec3(1)),
    roughness: float(coatSettings.snow.enabled ? coatSettings.snow.roughness : 0.78).add(snowLayer?.roughness ?? 0),
    normal: snowLayer?.normal() ?? undefined,
  }, snowCover);
  const finalAlbedo = mix(snowed.color, snowed.color.mul(vec3(0.52, 0.53, 0.56)), wet.mul(0.55));
  const normalNode = snowed.normal;
  const roughnessNode = mix(snowed.roughness, snowed.roughness.min(0.32), wet.mul(0.65));

  // Deadwood and moss already fold `attribute('color')` into their custom colorNodes; keeping
  // `vertexColors: false` avoids Three.js NodeMaterial multiplying diffuseColor by `vColor` twice.
  const material = new THREE.MeshStandardNodeMaterial({
    vertexColors: false,
    roughness,
    metalness: 0,
    side: THREE.FrontSide,
    colorNode: finalAlbedo,
    normalNode,
    roughnessNode,
    emissiveNode: treeBarkEmission(finalAlbedo, { height: float(0.45), up: normalWorld.y }),
  });

  publishCoatCoverage(material, { moss: mossCoverage, snow: snowCover, wet });

  return {
    material,
    swapScannedBark(scan) {
      if (!scan?.albedoHeight || !scan?.normalRoughness) return false;
      for (const node of albedoTexNodes) node.value = scan.albedoHeight;
      for (const node of normalTexNodes) node.value = scan.normalRoughness;
      material.needsUpdate = true;
      return true;
    },
  };
}

const KINDS = Object.freeze({
  fallenLog: Object.freeze({
    geometry: createFallenLogGeometry,
    roughness: 0.94,
    deadwood: true,
    horizontal: true,
    conform: true,
    bumpScale: 0.024,
  }),
  stump: Object.freeze({
    geometry: createStumpGeometry,
    roughness: 0.94,
    deadwood: true,
    horizontal: false,
    conform: false,
    bumpScale: 0.024,
  }),
  fallenBranch: Object.freeze({
    geometry: createFallenBranchGeometry,
    roughness: 0.94,
    deadwood: true,
    horizontal: true,
    conform: true,
    bumpScale: 0.020,
  }),
  leafLitter: Object.freeze({ geometry: createLeafLitterGeometry, roughness: 0.9, side: THREE.DoubleSide }),
  mossMound: Object.freeze({ geometry: createMossMoundGeometry, roughness: 1, moss: true }),
  fungiCluster: Object.freeze({ geometry: createFungiClusterGeometry, roughness: 0.74, fungi: true }),
  snappedSnag: Object.freeze({ geometry: createSnappedSnagGeometry, roughness: 0.94, deadwood: true, horizontal: false, conform: false, bumpScale: 0.024 }),
  rootWad: Object.freeze({ geometry: createRootWadGeometry, roughness: 0.94, deadwood: true, horizontal: false, conform: false, bumpScale: 0.024 }),
  hollowNurseTrunk: Object.freeze({ geometry: createHollowNurseTrunkGeometry, roughness: 0.94, deadwood: true, horizontal: true, conform: true, bumpScale: 0.024 }),
  archedRootBridge: Object.freeze({ geometry: createArchedRootBridgeGeometry, roughness: 0.94, deadwood: true, horizontal: true, conform: false, bumpScale: 0.022 }),
  splitTimberLog: Object.freeze({ geometry: createSplitTimberLogGeometry, roughness: 0.92, deadwood: true, horizontal: true, conform: true, bumpScale: 0.024 }),
  shelfFungusLog: Object.freeze({ geometry: createShelfFungusLogGeometry, roughness: 0.93, deadwood: true, horizontal: true, conform: true, bumpScale: 0.024 }),
});

/** Turns `stylizedSurface.forestDebris.variants` into prototype definitions. */
export function createForestDebrisPrototypes(layer = {}, environment = {}) {
  const definitions = [];
  const barkByProfile = new Map();
  const getBarkTextures = (profile = 'spruce') => {
    if (!barkByProfile.has(profile)) {
      barkByProfile.set(profile, createProceduralBarkTextures({ profile, resolution: 256 }));
    }
    return barkByProfile.get(profile);
  };

  for (const [id, entry] of Object.entries(layer.variants ?? {})) {
    const kind = entry?.kind ?? id;
    const builder = KINDS[kind];
    if (!builder || entry.enabled === false) continue;

    let material;
    let swapScannedBark = null;
    const barkProfile = entry.barkProfile ?? 'spruce';
    const olderWood = Boolean(
      entry.olderWood
      ?? (entry.variant === 'nurse' || entry.variant === 'hollow' || entry.variant === 'weathered'),
    );
    if (builder.deadwood) {
      const deadwood = deadwoodMaterial(getBarkTextures(barkProfile), {
        ...environment,
        barkProfile,
        horizontal: builder.horizontal,
        olderWood,
        roughness: builder.roughness,
        bumpScale: builder.bumpScale,
      });
      material = deadwood.material;
      swapScannedBark = deadwood.swapScannedBark;
    } else if (builder.moss) {
      const mossNodes = mossSurfaceNodes(environment);
      material = new THREE.MeshStandardNodeMaterial({
        vertexColors: false,
        roughness: builder.roughness,
        metalness: 0,
        side: builder.side ?? THREE.FrontSide,
        ...mossNodes,
      });
    } else if (builder.fungi) {
      const dither = attribute('instanceDither', 'vec3');
      const fungiHue = mix(vertexColorRgb(), vertexColorRgb().mul(vec3(1.12, 0.94, 0.84)), dither.y);
      const fungiAlbedo = fungiHue.mul(smoothstep(-0.02, 0.04, positionGeometry.y).mul(0.35).add(0.65));
      material = new THREE.MeshStandardNodeMaterial({
        vertexColors: false,
        roughness: builder.roughness,
        metalness: 0,
        side: builder.side ?? THREE.FrontSide,
        colorNode: fungiAlbedo,
        emissiveNode: understoryShadeEmission(fungiAlbedo),
      });
    } else {
      material = new THREE.MeshStandardNodeMaterial({
        vertexColors: true,
        roughness: builder.roughness,
        metalness: 0,
        side: builder.side ?? THREE.FrontSide,
      });
    }

    const geometryOptions = entry.variant ? { variant: entry.variant } : undefined;
    definitions.push({
      id,
      kind,
      variant: entry.variant ?? null,
      olderWood,
      barkProfile: builder.deadwood ? barkProfile : null,
      conform: entry.conform ?? builder.conform ?? false,
      radius: Number.isFinite(entry.radius) ? entry.radius : null,
      minCanopy: Number.isFinite(entry.minCanopy) ? entry.minCanopy : 0,
      minShoreClearance: Number.isFinite(entry.minShoreClearance) ? entry.minShoreClearance : 0,
      affinity: entry.affinity ?? null,
      parts: [{
        geometry: builder.geometry(geometryOptions),
        material,
        kind: 'detail',
        instanceBiomeLook: Boolean(builder.deadwood || builder.moss),
      }],
      tileIds: entry.tileIds ?? null,
      weight: entry.weight ?? 1,
      syncScannedBark(barkScans) {
        if (!swapScannedBark || !(barkScans instanceof Map)) return false;
        const scan = barkScans.get(barkProfile);
        return scan ? swapScannedBark(scan) : false;
      },
    });
  }
  return definitions;
}
