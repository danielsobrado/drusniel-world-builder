import * as THREE from 'three/webgpu';
import { color, mix, normalGeometry, positionGeometry, smoothstep, vec2, vec3 } from 'three/tsl';
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
 * Lengthwise bark fissures and upward lichen/moss patches so logs, stumps,
 * and fallen branches have grain detail instead of flat vertex-shaded quads.
 */
function deadwoodSurfaceColor() {
  const at = positionGeometry.xz;
  const fissures = stylizedFbm2(vec2(at.x.mul(16), at.y.mul(4.5))).mul(0.5).add(0.5);
  const grain = stylizedFbm2(positionGeometry.xy.mul(22)).mul(0.5).add(0.5);
  const moss = stylizedFbm2(at.mul(3.4).add(7.1)).mul(0.5).add(0.5);
  const sky = smoothstep(0.15, 0.75, normalGeometry.y);
  const bark = vec3(mix(0.48, 1.24, fissures.mul(0.65).add(grain.mul(0.35)).smoothstep(0.2, 0.85)));
  const lichen = sky.mul(moss.smoothstep(0.42, 0.82)).mul(0.55);
  return mix(bark, bark.mul(color('#6f8e48')), lichen);
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
