import * as THREE from 'three/webgpu';
import { color, length, mix, mx_noise_float, normalGeometry, positionGeometry, sin, smoothstep, vec2, vec3 } from 'three/tsl';
import { stylizedFbm2 } from '../StylizedNoiseNodes.js';
import {
  createFallenBranchGeometry,
  createFallenLogGeometry,
  createLeafLitterGeometry,
  createMossMoundGeometry,
  createStumpGeometry,
} from './forestDebrisGeometry.js';

/**
 * Cushions of moss stems a few centimetres across, darker between them, with
 * broad dry patches: the flat vertex colour alone read as a green plastic disc.
 */
function mossSurfaceColor() {
  const at = positionGeometry.xz;
  const cushions = stylizedFbm2(at.mul(16)).mul(0.5).add(0.5);
  const patches = stylizedFbm2(at.mul(2.2).add(5.3)).mul(0.5).add(0.5);
  // A multiplier: the material's vertexColors already applies the moss colour.
  const tufted = vec3(mix(0.35, 1.15, cushions.smoothstep(0.25, 0.75)));
  return mix(tufted, tufted.mul(color('#b9a46a')), patches.smoothstep(0.55, 0.9).mul(0.6));
}

/**
 * Lengthwise bark fissures, saw-cut growth rings, tufted moss, and basal duff
 * grounding so logs, stumps, and fallen branches blend naturally into the soil.
 */
function deadwoodSurfaceColor() {
  const at = positionGeometry.xz;
  const fissures = stylizedFbm2(vec2(positionGeometry.x.add(positionGeometry.z).mul(14), positionGeometry.y.mul(3.8))).mul(0.5).add(0.5);
  const grain = mx_noise_float(positionGeometry.mul(20)).mul(0.5).add(0.5);
  const bark = vec3(mix(0.42, 1.24, fissures.mul(0.62).add(grain.mul(0.38)).smoothstep(0.22, 0.82)));

  // Concentric growth rings on upward saw-cut end grain (separate from side bark)
  const ringWave = sin(length(at).mul(58).add(grain.mul(2.8))).mul(0.5).add(0.5);
  const cutRings = vec3(mix(0.76, 1.18, ringWave));
  const isTopCut = smoothstep(0.68, 0.90, normalGeometry.y);
  let surface = mix(bark, cutRings, isTopCut);

  // Crisp tufted moss on upward/damp surfaces (avoiding cut center)
  const mossMacro = stylizedFbm2(at.mul(7.5).add(7.1)).mul(0.5).add(0.5);
  const mossTuft = mx_noise_float(positionGeometry.mul(26)).mul(0.5).add(0.5);
  const sky = smoothstep(0.18, 0.72, normalGeometry.y).mul(isTopCut.mul(0.65).oneMinus());
  const lichen = sky.mul(mossMacro.mul(0.7).add(mossTuft.mul(0.3)).smoothstep(0.42, 0.68)).mul(0.65);
  surface = mix(surface, surface.mul(mix(color('#4e6a2a'), color('#7b9c4a'), mossTuft)), lichen);

  // Warm soil/duff collar at the base so root flares and log undersides blend smoothly into ground litter
  const soilNoise = stylizedFbm2(at.mul(6.5).add(2.3)).mul(0.05);
  const soilFoot = smoothstep(0.08, -0.06, positionGeometry.y.add(soilNoise));
  return mix(surface, color('#6d5939'), soilFoot.mul(0.75));
}

const KINDS = Object.freeze({
  fallenLog: Object.freeze({ geometry: createFallenLogGeometry, roughness: 0.95, colorNode: deadwoodSurfaceColor }),
  stump: Object.freeze({ geometry: createStumpGeometry, roughness: 0.95, colorNode: deadwoodSurfaceColor }),
  fallenBranch: Object.freeze({ geometry: createFallenBranchGeometry, roughness: 0.95, colorNode: deadwoodSurfaceColor }),
  leafLitter: Object.freeze({ geometry: createLeafLitterGeometry, roughness: 0.9, side: THREE.DoubleSide }),
  mossMound: Object.freeze({ geometry: createMossMoundGeometry, roughness: 1, colorNode: mossSurfaceColor }),
});

/** Turns `stylizedSurface.forestDebris.variants` into prototype definitions. */
export function createForestDebrisPrototypes(layer = {}) {
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
          ...(builder.colorNode ? { colorNode: builder.colorNode() } : {}),
        }),
        kind: 'detail',
      }],
      tileIds: entry.tileIds ?? null,
      weight: entry.weight ?? 1,
    });
  }
  return definitions;
}
