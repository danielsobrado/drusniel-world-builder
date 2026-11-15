import * as THREE from 'three/webgpu';
import { color, float, length, mix, mx_noise_float, normalGeometry, normalViewGeometry, positionGeometry, sin, smoothstep, texture, vec2, vec3, vertexColor } from 'three/tsl';
import { stylizedFbm2 } from '../StylizedNoiseNodes.js';
import { createProceduralBarkTextures } from './ProceduralBarkTextures.js';
import { barkBumpNormal, barkPackedNormal } from './TreeBarkMaterial.js';
import {
  createFallenBranchGeometry,
  createFallenLogGeometry,
  createLeafLitterGeometry,
  createMossMoundGeometry,
  createStumpGeometry,
} from './forestDebrisGeometry.js';

/**
 * Cushions of moss stems a few centimetres across, darker between them, with
 * broad dry patches, modulating the vertex albedo cleanly.
 */
function mossSurfaceColor() {
  const at = positionGeometry.xz;
  const cushions = stylizedFbm2(at.mul(16)).mul(0.5).add(0.5);
  const patches = stylizedFbm2(at.mul(2.2).add(5.3)).mul(0.5).add(0.5);
  const tufted = vec3(mix(0.45, 1.2, cushions.smoothstep(0.25, 0.75)));
  const albedo = vertexColor().rgb;
  return albedo.mul(mix(tufted, tufted.mul(color('#b9a46a')), patches.smoothstep(0.55, 0.9).mul(0.6)));
}

function deadwoodCoords(horizontal = false) {
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
    coords: [pos.yz.mul(scale), pos.zx.mul(scale), pos.xy.mul(scale)],
  };
}

function sampleDeadwoodTriplanar(map, { weights, coords }) {
  return texture(map, coords[0]).mul(weights.x)
    .add(texture(map, coords[1]).mul(weights.y))
    .add(texture(map, coords[2]).mul(weights.z));
}

/**
 * Uses scanned/procedural bark albedo + vertex albedo (`bark`, `heartwood`, `moss`)
 * with triplanar bark height/normal relief, cut growth rings, biome-matched moss,
 * and a litter/soil collar where the trunk meets the ground.
 */
function deadwoodNodes(barkTextures, { soilColor = '#5c4a30', floorColor = '#3b5233', horizontal = false } = {}) {
  const at = positionGeometry.xz;
  const proj = deadwoodCoords(horizontal);
  const albedoHeight = sampleDeadwoodTriplanar(barkTextures.albedoHeight, proj);
  const normalRoughness = sampleDeadwoodTriplanar(barkTextures.normalRoughness, proj);

  // Decode sRGB bark texture to linear albedo and combine with per-vertex bark/heartwood/moss albedo.
  const texAlbedo = albedoHeight.rgb.mul(albedoHeight.rgb);
  const texShade = texAlbedo.mul(1.35).mul(albedoHeight.a.mul(0.38).add(0.72));
  const vertexAlbedo = vertexColor().rgb;
  const barkSurface = mix(vertexAlbedo.mul(texShade), texAlbedo, 0.42);

  // Concentric growth rings on cut/snapped ends (top stump face & log end faces)
  const grain = mx_noise_float(positionGeometry.mul(20)).mul(0.5).add(0.5);
  const endDist = length(vec2(positionGeometry.y, positionGeometry.z));
  const ringDist = mix(endDist, length(at), smoothstep(0.55, 0.85, normalGeometry.y));
  const ringWave = sin(ringDist.mul(58).add(grain.mul(2.8))).mul(0.5).add(0.5);
  const cutRings = vertexAlbedo.mul(mix(0.78, 1.22, ringWave));
  const isCutFace = smoothstep(0.68, 0.9, normalGeometry.y.max(normalGeometry.x.abs()));
  let surface = mix(barkSurface, cutRings, isCutFace);

  // Crisp tufted moss on upward/damp surfaces (avoiding cut faces), harmonized with biome floor
  const mossMacro = stylizedFbm2(at.mul(7.5).add(7.1)).mul(0.5).add(0.5);
  const mossTuft = mx_noise_float(positionGeometry.mul(26)).mul(0.5).add(0.5);
  const sky = smoothstep(0.14, 0.72, normalGeometry.y).mul(isCutFace.mul(0.7).oneMinus());
  const lichen = sky.mul(mossMacro.mul(0.7).add(mossTuft.mul(0.3)).smoothstep(0.38, 0.66)).mul(0.62);
  const mossTone = mix(color('#526e2d'), color(floorColor), 0.35);
  surface = mix(surface, surface.mul(mix(mossTone, color('#83a252'), mossTuft.mul(0.65))), lichen);

  // Biome-matched soil/duff collar at the base so trunks blend smoothly into ground litter
  const soilNoise = stylizedFbm2(at.mul(6.5).add(2.3)).mul(0.05);
  const soilFoot = smoothstep(0.1, -0.06, positionGeometry.y.add(soilNoise));
  const colorNode = mix(surface, color(soilColor), soilFoot.mul(0.8));

  const packedSamples = proj.coords.map(c => barkPackedNormal(texture(barkTextures.normalRoughness, c), c));
  const packedNormal = packedSamples[0].mul(proj.weights.x)
    .add(packedSamples[1].mul(proj.weights.y))
    .add(packedSamples[2].mul(proj.weights.z))
    .normalize();
  const bumpNormal = barkBumpNormal(albedoHeight.a.mul(0.032));
  const barkNormal = packedNormal.add(bumpNormal.sub(normalViewGeometry)).normalize();
  const normalNode = mix(barkNormal, normalViewGeometry, isCutFace.mul(0.65)).normalize();
  const roughnessNode = mix(normalRoughness.b, float(0.86), isCutFace.mul(0.5));

  return { colorNode, normalNode, roughnessNode };
}

const KINDS = Object.freeze({
  fallenLog: Object.freeze({ geometry: createFallenLogGeometry, roughness: 0.94, deadwood: true, horizontal: true }),
  stump: Object.freeze({ geometry: createStumpGeometry, roughness: 0.94, deadwood: true, horizontal: false }),
  fallenBranch: Object.freeze({ geometry: createFallenBranchGeometry, roughness: 0.94, deadwood: true, horizontal: true }),
  leafLitter: Object.freeze({ geometry: createLeafLitterGeometry, roughness: 0.9, side: THREE.DoubleSide }),
  mossMound: Object.freeze({ geometry: createMossMoundGeometry, roughness: 1, colorNode: mossSurfaceColor }),
});

/** Turns `stylizedSurface.forestDebris.variants` into prototype definitions. */
export function createForestDebrisPrototypes(layer = {}, environment = {}) {
  const definitions = [];
  let barkTextures = null;
  const getBarkTextures = () => {
    barkTextures ??= createProceduralBarkTextures({ profile: 'spruce', resolution: 256 });
    return barkTextures;
  };
  for (const [id, entry] of Object.entries(layer.variants ?? {})) {
    const builder = KINDS[entry?.kind ?? id];
    if (!builder || entry.enabled === false) continue;
    const nodes = builder.deadwood
      ? deadwoodNodes(getBarkTextures(), { ...environment, horizontal: builder.horizontal })
      : { ...(builder.colorNode ? { colorNode: builder.colorNode(environment) } : {}) };
    definitions.push({
      id,
      parts: [{
        geometry: builder.geometry(),
        material: new THREE.MeshStandardNodeMaterial({
          vertexColors: true,
          roughness: builder.roughness,
          metalness: 0,
          side: builder.side ?? THREE.FrontSide,
          ...nodes,
        }),
        kind: 'detail',
      }],
      tileIds: entry.tileIds ?? null,
      weight: entry.weight ?? 1,
    });
  }
  return definitions;
}
