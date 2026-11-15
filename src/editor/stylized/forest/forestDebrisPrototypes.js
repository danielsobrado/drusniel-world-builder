import * as THREE from 'three/webgpu';
import { color, float, length, mix, mx_noise_float, normalGeometry, positionGeometry, sin, smoothstep, vec2, vec3, vertexColor } from 'three/tsl';
import { stylizedFbm2 } from '../StylizedNoiseNodes.js';
import { barkBumpNormal } from './TreeBarkMaterial.js';
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

/** Shared procedural bark/wood relief height field for both albedo crevices and bump normal. */
function deadwoodReliefHeight() {
  const along = positionGeometry.x.mul(3.2).add(positionGeometry.z.mul(0.7));
  const around = positionGeometry.y.mul(14).add(positionGeometry.z.mul(11));
  const fissures = stylizedFbm2(vec2(along, around)).mul(0.5).add(0.5);
  const grain = mx_noise_float(positionGeometry.mul(22)).mul(0.5).add(0.5);
  return fissures.mul(0.68).add(grain.mul(0.32));
}

/**
 * Uses the mesh's vertex albedo (`bark`, `heartwood`, `moss`) modulated by
 * lengthwise bark fissures, saw-cut growth rings, biome-matched moss, and a
 * soil/litter collar where the trunk rests on the ground.
 */
function deadwoodSurfaceColor({ soilColor = '#5c4a30', floorColor = '#3b5233' } = {}) {
  const at = positionGeometry.xz;
  const albedo = vertexColor().rgb;
  const relief = deadwoodReliefHeight();
  const grain = mx_noise_float(positionGeometry.mul(20)).mul(0.5).add(0.5);
  const barkDetail = vec3(mix(0.52, 1.32, relief.smoothstep(0.2, 0.82)));

  // Concentric growth rings on cut/snapped ends (top stump face & log end faces)
  const endDist = length(vec2(positionGeometry.y, positionGeometry.z));
  const ringDist = mix(endDist, length(at), smoothstep(0.55, 0.85, normalGeometry.y));
  const ringWave = sin(ringDist.mul(58).add(grain.mul(2.8))).mul(0.5).add(0.5);
  const cutRings = vec3(mix(0.76, 1.2, ringWave));
  const isCutFace = smoothstep(0.68, 0.9, normalGeometry.y.max(normalGeometry.x.abs()));
  let surface = albedo.mul(mix(barkDetail, cutRings, isCutFace));

  // Crisp tufted moss on upward/damp surfaces (avoiding cut faces), harmonized with biome floor
  const mossMacro = stylizedFbm2(at.mul(7.5).add(7.1)).mul(0.5).add(0.5);
  const mossTuft = mx_noise_float(positionGeometry.mul(26)).mul(0.5).add(0.5);
  const sky = smoothstep(0.16, 0.72, normalGeometry.y).mul(isCutFace.mul(0.65).oneMinus());
  const lichen = sky.mul(mossMacro.mul(0.7).add(mossTuft.mul(0.3)).smoothstep(0.4, 0.68)).mul(0.58);
  const mossTone = mix(color('#526e2d'), color(floorColor), 0.35);
  surface = mix(surface, surface.mul(mix(mossTone, color('#83a252'), mossTuft.mul(0.65))), lichen);

  // Biome-matched soil/duff collar at the base so trunks blend smoothly into ground litter
  const soilNoise = stylizedFbm2(at.mul(6.5).add(2.3)).mul(0.05);
  const soilFoot = smoothstep(0.09, -0.06, positionGeometry.y.add(soilNoise));
  return mix(surface, color(soilColor), soilFoot.mul(0.78));
}

function deadwoodSurfaceNormal() {
  return barkBumpNormal(deadwoodReliefHeight().mul(float(0.045)));
}

const KINDS = Object.freeze({
  fallenLog: Object.freeze({ geometry: createFallenLogGeometry, roughness: 0.94, colorNode: deadwoodSurfaceColor, normalNode: deadwoodSurfaceNormal }),
  stump: Object.freeze({ geometry: createStumpGeometry, roughness: 0.94, colorNode: deadwoodSurfaceColor, normalNode: deadwoodSurfaceNormal }),
  fallenBranch: Object.freeze({ geometry: createFallenBranchGeometry, roughness: 0.94, colorNode: deadwoodSurfaceColor, normalNode: deadwoodSurfaceNormal }),
  leafLitter: Object.freeze({ geometry: createLeafLitterGeometry, roughness: 0.9, side: THREE.DoubleSide }),
  mossMound: Object.freeze({ geometry: createMossMoundGeometry, roughness: 1, colorNode: mossSurfaceColor }),
});

/** Turns `stylizedSurface.forestDebris.variants` into prototype definitions. */
export function createForestDebrisPrototypes(layer = {}, environment = {}) {
  const definitions = [];
  for (const [id, entry] of Object.entries(layer.variants ?? {})) {
    const builder = KINDS[entry?.kind ?? id];
    if (!builder || entry.enabled === false) continue;
    definitions.push({
      id,
      parts: [{
        geometry: builder.geometry(),
        material: new THREE.MeshStandardNodeMaterial({
          vertexColors: true,
          roughness: builder.roughness,
          metalness: 0,
          side: builder.side ?? THREE.FrontSide,
          ...(builder.colorNode ? { colorNode: builder.colorNode(environment) } : {}),
          ...(builder.normalNode ? { normalNode: builder.normalNode() } : {}),
        }),
        kind: 'detail',
      }],
      tileIds: entry.tileIds ?? null,
      weight: entry.weight ?? 1,
    });
  }
  return definitions;
}
