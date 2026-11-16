import * as THREE from 'three/webgpu';
import {
  attribute,
  clamp,
  color,
  dot,
  float,
  length,
  mix,
  normalGeometry,
  normalViewGeometry,
  normalWorld,
  positionGeometry,
  sin,
  smoothstep,
  texture,
  vec2,
  vec3,
} from 'three/tsl';
import { LOOK_SNOW_STEPS } from '../../biomes/BiomeLooks.js';
import { stylizedFbm2 } from '../StylizedNoiseNodes.js';
import { surfaceWetnessUniform } from '../../weather/surfaceWetness.js';
import { gradeBark, resolveBarkGrade } from './barkGrade.js';
import { acquireDeadwoodNoise } from './deadwoodNoise.js';
import { treeBarkEmission, understoryShadeEmission } from './foliageLight.js';
import { createProceduralBarkTextures } from './ProceduralBarkTextures.js';
import { barkBumpNormal, barkPackedNormal } from './TreeBarkMaterial.js';
import {
  createFallenBranchGeometry,
  createFallenLogGeometry,
  createLeafLitterGeometry,
  createMossMoundGeometry,
  createStumpGeometry,
} from './forestDebrisGeometry.js';

const BARK_UNDERTONES = Object.freeze({
  beech: '#9e9284',
  spruce: '#73583f',
  pine: '#855c3c',
  swamp: '#665b47',
});

function vertexColorRgb() {
  return attribute('color', 'vec3');
}

/** Cushions of moss stems modulated by tileable cushion noise and biome understory look. */
function mossSurfaceNodes({ baseUrl = '' } = {}) {
  const noise = acquireDeadwoodNoise(baseUrl);
  const dither = attribute('instanceDither', 'vec3');
  const look = attribute('instanceBiomeLook', 'vec4');
  const at = positionGeometry.xz.add(vec2(dither.y.mul(2.9), dither.y.mul(4.1)));
  const cushions = texture(noise.texture, at.mul(1.8)).b;
  const fine = texture(noise.texture, at.mul(4.6)).b;
  const patches = stylizedFbm2(at.mul(2.2).add(5.3)).mul(0.5).add(0.5);
  const relief = cushions.mul(0.65).add(fine.mul(0.35));
  const tufted = vec3(mix(0.68, 1.32, relief.smoothstep(0.22, 0.78)));
  const albedo = vertexColorRgb();
  const base = albedo.mul(mix(tufted, tufted.mul(color('#b9a46a')), patches.smoothstep(0.55, 0.9).mul(0.42)));
  const snowSteps = look.w.div(4).floor();
  const saturation = look.w.sub(snowSteps.mul(4));
  const toned = mix(vec3(dot(base, vec3(0.2126, 0.7152, 0.0722))), base, saturation).mul(look.xyz);
  const snowDepth = snowSteps.div(LOOK_SNOW_STEPS);
  const snowCap = smoothstep(0.18, 0.62, normalWorld.y.add(cushions.sub(0.5).mul(0.45)))
    .mul(snowDepth.mul(1.2).clamp(0, 1))
    .mul(snowDepth.smoothstep(0.08, 0.3));
  const colorNode = mix(toned, vec3(0.88, 0.91, 0.95), snowCap.mul(0.85));
  return {
    colorNode,
    normalNode: barkBumpNormal(relief.mul(0.024)),
    emissiveNode: understoryShadeEmission(colorNode),
  };
}

function deadwoodCoords(horizontal = false, offset = vec2(0)) {
  const scale = float(1.15);
  const pos = horizontal
    ? vec3(positionGeometry.y, positionGeometry.x, positionGeometry.z)
    : positionGeometry;
  const nrm = horizontal
    ? vec3(normalGeometry.y, normalGeometry.x, normalGeometry.z)
    : normalGeometry;
  const weights = nrm.abs().div(nrm.abs().dot(vec3(1)).max(1e-5));
  return {
    weights,
    coords: [
      pos.yz.mul(scale).add(offset),
      pos.zx.mul(scale).add(offset),
      pos.xy.mul(scale).add(offset),
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
 * - Calibrated bark albedo matching standing trees (without double-darkening by `canopyShade` or vertex bark)
 * - Multi-channel `deadwood-noise.png` for grain/silvering (R), fissures/checks (G), and patchy moss cushions (B)
 * - Clean cut-face mask (end caps on logs/branches, top saw cut on stumps) exempt from soil splash
 * - Biome moss & snow (`instanceBiomeLook`), `gradeBark`, rain wetness, and `treeBarkEmission`
 */
function deadwoodMaterial(
  barkTextures,
  {
    barkProfile = 'spruce',
    soilColor = '#5c4a30',
    floorColor = '#3b5233',
    barkGrade = null,
    baseUrl = '',
    horizontal = false,
    roughness = 0.94,
    bumpScale = 0.036,
  } = {},
) {
  const noise = acquireDeadwoodNoise(baseUrl);
  const dither = attribute('instanceDither', 'vec3');
  const instanceShift = vec2(dither.y.mul(3.7), dither.y.mul(5.3));
  const proj = deadwoodCoords(horizontal, instanceShift);
  const noiseProj = deadwoodCoords(horizontal, instanceShift.mul(0.5));

  const albedoTexNodes = [];
  const normalTexNodes = [];
  const albedoHeight = sampleTriplanar(barkTextures.albedoHeight, proj, albedoTexNodes);
  const normalRoughness = sampleTriplanar(barkTextures.normalRoughness, proj, normalTexNodes);
  const deadwoodNoise = sampleTriplanar(noise.texture, {
    weights: noiseProj.weights,
    coords: noiseProj.coords.map((c) => c.mul(0.85)),
  });
  const detailNoise = sampleTriplanar(noise.texture, {
    weights: noiseProj.weights,
    coords: noiseProj.coords.map((c) => c.mul(2.4)),
  });

  // Decode sRGB bark albedo to linear light and calibrate cleanly to match standing trees.
  const texLinear = albedoHeight.rgb.mul(albedoHeight.rgb);
  const texBark = texLinear.mul(1.38).mul(albedoHeight.a.mul(0.45).add(0.68));
  const speciesUndertone = color(BARK_UNDERTONES[barkProfile] ?? BARK_UNDERTONES.spruce);
  const liftedBark = mix(speciesUndertone, texBark, 0.82);

  const vertexAlbedo = vertexColorRgb();
  const vertexLuma = dot(vertexAlbedo, vec3(0.2126, 0.7152, 0.0722));
  const vertexAO = clamp(vertexLuma.div(0.26), 0.80, 1.08);

  const weathering = mix(0.90, 1.12, deadwoodNoise.r);
  const fissures = mix(0.84, 1.06, detailNoise.g);
  const sunSilver = smoothstep(0.48, 0.96, normalGeometry.y).mul(smoothstep(0.52, 0.88, deadwoodNoise.r)).mul(0.14);
  let barkSurface = liftedBark.mul(vertexAO).mul(weathering).mul(fissures);
  barkSurface = mix(barkSurface, barkSurface.add(vec3(0.09, 0.085, 0.08)), sunSilver);

  // End-grain cut/snapped faces: end caps (+-X) on logs/branches, sawn top (+Y above roots) on stumps.
  const isCutFace = horizontal
    ? smoothstep(0.64, 0.88, normalGeometry.x.abs())
    : smoothstep(0.68, 0.9, normalGeometry.y).mul(smoothstep(0.26, 0.44, positionGeometry.y));
  const endPos = horizontal ? positionGeometry.yz : positionGeometry.xz;
  const endDist = length(endPos);
  const ringWave = sin(endDist.mul(62).add(deadwoodNoise.r.mul(4.5)).add(dither.y.mul(6.28))).mul(0.5).add(0.5);
  const heartBase = mix(color('#866542'), color('#d4b483'), ringWave);
  const heartCracks = mix(0.62, 1.04, smoothstep(0.22, 0.68, detailNoise.g));
  const cutRings = heartBase.mul(clamp(vertexLuma.div(0.35), 0.84, 1.15)).mul(heartCracks);
  let surface = mix(barkSurface, cutRings, isCutFace);

  // Organic patchy moss & lichen islands on sky-facing bark (~25-35% cover so bark grain reads cleanly).
  const look = attribute('instanceBiomeLook', 'vec4');
  const snowSteps = look.w.div(4).floor();
  const saturation = look.w.sub(snowSteps.mul(4));
  const sky = smoothstep(0.22, 0.82, normalGeometry.y).mul(isCutFace.oneMinus());
  const cushionMask = deadwoodNoise.b.mul(0.68).add(detailNoise.b.mul(0.32)).smoothstep(0.54, 0.78);
  const mossCoverage = sky.mul(cushionMask).mul(0.72);
  const rawMoss = mix(color('#638632'), color(floorColor), 0.3);
  const litMoss = mix(rawMoss, color('#95b650'), detailNoise.b.mul(0.68));
  const biomeMoss = mix(vec3(dot(litMoss, vec3(0.2126, 0.7152, 0.0722))), litMoss, saturation).mul(look.xyz);
  surface = mix(surface, biomeMoss.mul(mix(0.84, 1.14, detailNoise.r)), mossCoverage);

  // Soil/duff collar restricted to actual ground-buried root toes, never cut end-grain faces.
  const groundTouch = smoothstep(0.03, -0.09, positionGeometry.y.add(deadwoodNoise.b.sub(0.5).mul(0.05)))
    .mul(isCutFace.oneMinus());
  surface = mix(surface, color(soilColor).mul(mix(0.88, 1.12, detailNoise.r)), groundTouch.mul(0.55));

  // Grade bark reflectance identically to standing trees, then blend snow & rain wetness.
  const graded = gradeBark(surface, resolveBarkGrade(barkGrade));
  const barkTinted = mix(graded, graded.mul(look.xyz), 0.2);

  const snowDepth = snowSteps.div(LOOK_SNOW_STEPS);
  const snowCap = smoothstep(0.16, 0.56, normalWorld.y.add(deadwoodNoise.b.sub(0.5).mul(0.48)))
    .mul(snowDepth.mul(1.2).clamp(0, 1))
    .mul(snowDepth.smoothstep(0.08, 0.3));
  const snowy = mix(barkTinted, vec3(0.88, 0.91, 0.95), snowCap.mul(0.88));

  const creviceWet = albedoHeight.a.oneMinus().mul(0.45).add(0.55);
  const wet = surfaceWetnessUniform.mul(creviceWet).clamp(0, 1);
  const finalAlbedo = mix(snowy, snowy.mul(vec3(0.52, 0.53, 0.56)), wet.mul(0.55));

  const packedSamples = proj.coords.map((coord) => {
    const packedNode = texture(barkTextures.normalRoughness, coord);
    normalTexNodes.push(packedNode);
    return barkPackedNormal(packedNode, coord);
  });
  const packedNormal = packedSamples[0].mul(proj.weights.x)
    .add(packedSamples[1].mul(proj.weights.y))
    .add(packedSamples[2].mul(proj.weights.z))
    .normalize();
  const crackBump = detailNoise.g.oneMinus().mul(0.012);
  const bumpNormal = barkBumpNormal(albedoHeight.a.mul(bumpScale).add(crackBump));
  const combinedNormal = packedNormal.add(bumpNormal.sub(normalViewGeometry)).normalize();
  const wetNormal = mix(combinedNormal, normalViewGeometry, wet.mul(0.22)).normalize();
  const normalNode = mix(wetNormal, normalViewGeometry, isCutFace.mul(0.6)).normalize();

  const dryRoughness = mix(normalRoughness.b.max(0.66), float(0.88), isCutFace.mul(0.55))
    .add(mossCoverage.mul(0.08)).clamp(0.4, 1);
  const roughnessNode = mix(dryRoughness, dryRoughness.min(0.32), wet.mul(0.65));

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
    bumpScale: 0.038,
  }),
  stump: Object.freeze({
    geometry: createStumpGeometry,
    roughness: 0.94,
    deadwood: true,
    horizontal: false,
    conform: false,
    bumpScale: 0.034,
  }),
  fallenBranch: Object.freeze({
    geometry: createFallenBranchGeometry,
    roughness: 0.94,
    deadwood: true,
    horizontal: true,
    conform: true,
    bumpScale: 0.028,
  }),
  leafLitter: Object.freeze({ geometry: createLeafLitterGeometry, roughness: 0.9, side: THREE.DoubleSide }),
  mossMound: Object.freeze({ geometry: createMossMoundGeometry, roughness: 1, moss: true }),
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
    if (builder.deadwood) {
      const deadwood = deadwoodMaterial(getBarkTextures(barkProfile), {
        ...environment,
        barkProfile,
        horizontal: builder.horizontal,
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
    } else {
      material = new THREE.MeshStandardNodeMaterial({
        vertexColors: true,
        roughness: builder.roughness,
        metalness: 0,
        side: builder.side ?? THREE.FrontSide,
      });
    }

    definitions.push({
      id,
      kind,
      barkProfile: builder.deadwood ? barkProfile : null,
      conform: entry.conform ?? builder.conform ?? false,
      radius: Number.isFinite(entry.radius) ? entry.radius : null,
      minCanopy: Number.isFinite(entry.minCanopy) ? entry.minCanopy : 0,
      parts: [{
        geometry: builder.geometry(),
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
