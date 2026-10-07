import * as THREE from 'three/webgpu';
import { AQUATIC_PLACEMENT_SURFACE } from '../water/AquaticPlacement.js';
import { GODS_END_AQUATIC_SPECIES as KINDS } from '../assets/godsEnd/aquatic/aquaticSpecies.js';
import { createGodsEndAquaticGeometry } from '../assets/godsEnd/aquatic/aquaticGeometry.js';
import { applyAquaticSway } from './aquaticSway.js';
import { attribute, positionLocal, vec3 } from 'three/tsl';
import { plantSwayTime } from './plantSway.js';
import { lakeWaveRise } from '../water/LakeSurfaceWaves.js';

/**
 * Water plants — after grass-test's sea algae (seagrass, kelp, red tufts) and its
 * lake flora (eelgrass, waterweed, pondweed, lily pads).
 *
 * All of it is generated, so like the shore layer it costs no asset and installs at
 * boot. The placement is the donor's own rule inverted into the water field this
 * project already has: `evaluateAquaticPlacement` takes a depth band, a placement
 * mode and a set of water kinds, which is exactly the vocabulary the donor encodes
 * in its own species table — seagrass shallowest, kelp deeper, tufts scattered
 * across both, pads floating.
 *
 * Depth is the species' niche, so the bands overlap deliberately: a bed that is
 * only seagrass to 3 m and only kelp past it has a line across it. Each species
 * peaks at its own depth and thins either side, which is what the donor's clusters
 * do.
 *
 * Ribbons are authored one metre tall and scaled here, so the sway shader can read
 * the blade's height straight off its vertical coordinate. Sway amounts are the
 * donor's: 0.3 for kelp, 0.18 for seagrass, 0.1 for the algae.
 */
export const AQUATIC_FLORA_KINDS = Object.freeze(Object.keys(KINDS));

function materialFor(kind, entry, height, clock) {
  const material = new THREE.MeshStandardNodeMaterial({
    color: entry.color ?? '#ffffff',
    vertexColors: true,
    roughness: entry.roughness ?? 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: kind.placement === AQUATIC_PLACEMENT_SURFACE,
    depthWrite: true,
  });
  if (kind.placement === AQUATIC_PLACEMENT_SURFACE) {
    const surface = attribute('instanceSurface', 'vec3');
    // positionLocal is already instanced here: rise is in metres and must not
    // inherit the plant's scale. Stable CPU phases survive origin rebases.
    material.positionNode = positionLocal.add(vec3(0, lakeWaveRise([surface.x, surface.y], clock).mul(surface.z), 0));
    material.roughness = entry.roughness ?? 0.55;
    return material;
  }
  return applyAquaticSway(material, { amount: entry.sway ?? kind.sway, height });
}

/**
 * Turns the configured layer into prototype definitions for the aquatic view.
 *
 * @param {object} layer `stylizedSurface.aquaticPlants`
 */
export function createAquaticFloraPrototypes(layer = {}, water = {}, { clock = plantSwayTime } = {}) {
  const definitions = [];
  for (const [id, entry] of Object.entries(layer.proceduralVariants ?? {})) {
    const spec = entry?.kind ?? id;
    const kind = KINDS[spec];
    if (!kind || entry?.enabled === false) continue;
    const geometry = createGodsEndAquaticGeometry(spec, { seed: entry.seed ?? 77103 });
    // Only the height is scaled: the blade's width and spread are its proportions,
    // and scaling those with it would make kelp as broad as it is tall.
    const height = kind.height * (entry.heightScale ?? 1);
    geometry.scale(1, height, 1);
    if (kind.placement === AQUATIC_PLACEMENT_SURFACE) geometry.scale(height, 1, height);
    geometry.computeBoundingSphere();
    const [minimumDepth, maximumDepth] = kind.depth;
    definitions.push({
      id,
      parts: [{
        geometry,
        material: materialFor(kind, entry, height, clock),
        kind: 'detail',
        instanceSurface: kind.placement === AQUATIC_PLACEMENT_SURFACE,
      }],
      heightOffset: kind.placement === AQUATIC_PLACEMENT_SURFACE
        ? (water.heightOffset ?? 0.12) + 0.035 : layer.heightOffset ?? 0,
      // The water rule the view hands to `evaluateAquaticPlacement`: niche depth,
      // which bodies it lives in, and rooted or floating.
      water: {
        placement: kind.placement ?? 'rooted',
        minimumDepth: entry.minimumDepth ?? (kind.placement === AQUATIC_PLACEMENT_SURFACE
          ? minimumDepth : Math.max(minimumDepth, height * (layer.maxScale ?? 1.3) + 0.12)),
        maximumDepth: entry.maximumDepth ?? maximumDepth,
        minimumCoverage: entry.minimumCoverage ?? 0.5,
        minimumShoreDistance: entry.minimumShoreDistance
          ?? kind.shoreDistance?.[0]
          ?? 0,
        maximumShoreDistance: entry.maximumShoreDistance
          ?? kind.shoreDistance?.[1]
          ?? Number.POSITIVE_INFINITY,
        allowedKinds: entry.allowedKinds ?? kind.kinds,
      },
      tileIds: entry.tileIds ?? null,
      weight: entry.weight ?? 1,
    });
  }
  return definitions;
}
