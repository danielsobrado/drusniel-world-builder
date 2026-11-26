import { sampleSurfaceMaskChannel } from '../../world/SurfaceMaskSampling.js';
import { acceptsMeadowHabitat } from './meadowHabitat.js';
import { sampleHeight } from '../scatterMath.js';
import { hash2d } from './meadowGrassGeometry.js';
import { createMeadowPathSampler } from './MeadowPathSampler.js';
import { forestDensitySamplerFromGrid } from '../forest/ForestFloor.js';
import { BIOME_BLUR_CELLS } from '../../world/BiomeFieldBlur.js';
import {
  CANOPY_FLOOR_PATCH_SALT,
  canopyFloorCover,
  ecotoneJitter,
  grassPatchCover,
  grassStandDensity,
} from '../../world/GrassPatchiness.js';
import { ROOT_LOBE, footprintLobe } from '../groundContact/ecologicalFootprint.js';

/** Cells a stem may reach across to mix neighboring biome silhouettes. */
const ECOTONE_REACH_CELLS = 0.9;
/** Decorrelates the density tap's jitter from the silhouette's. */
const DENSITY_TAP_SHIFT = 311.7;

export const MIN_GRASS_STRENGTH = 0.02;
const sampleMask = (pixels, size, x, z, channel) => sampleSurfaceMaskChannel(pixels, size, size, x, z, channel);
function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The identical ground rule runs against immutable job inputs on either thread. */
export function createMeadowGroundSample(snapshot, { forest = null, paths = null } = {}) {
  const { page, descriptor, chunkSize, tileSize, eligible, shapeTable, growth, worldSeed, rocks, flatten, roots = [] } = snapshot;
  const mask = page.surfaceMaskPixels;
  paths ??= createMeadowPathSampler(snapshot.pathConfig);
  forest ??= snapshot.forest ? forestDensitySamplerFromGrid(snapshot.forest) : null;
  const pathResult = { path: 0, blocked: false };
  const jitter = { x: 0, z: 0 };
  const last = chunkSize - 1;
  return (x, z, rank, out) => {
    const localX = x / tileSize - descriptor.originCellX;
    const localZ = -z / tileSize - descriptor.originCellZ;
    if (localX < 0 || localZ < 0 || localX >= chunkSize || localZ >= chunkSize) return false;
    const ownTile = page.tiles[Math.floor(localZ) * chunkSize + Math.floor(localX)];
    if (!eligible[ownTile]) return false;
    // Clamp to this page so the result never depends on neighboring residency.
    ecotoneJitter(x, z, ECOTONE_REACH_CELLS, jitter);
    const reachX = Math.min(last, Math.max(0, Math.floor(localX + jitter.x)));
    const reachZ = Math.min(last, Math.max(0, Math.floor(localZ + jitter.z)));
    const reached = page.tiles[reachZ * chunkSize + reachX];
    const tile = eligible[reached] ? reached : ownTile;
    const coverage=mask?sampleMask(mask,chunkSize,localX,localZ,1):1;
    // Density from a wider tap (BIOME_BLUR_CELLS): averaged over stems it is
    // the blurred density the surface mask bakes its islands from, so a thin
    // biome's stand thins in over ~10 m instead of at the border. Read live,
    // so settings affect islands before pages rebuild.
    ecotoneJitter(x + DENSITY_TAP_SHIFT, z - DENSITY_TAP_SHIFT, BIOME_BLUR_CELLS, jitter);
    const tapX = Math.min(last, Math.max(0, Math.floor(localX + jitter.x)));
    const tapZ = Math.min(last, Math.max(0, Math.floor(localZ + jitter.z)));
    const tapped = page.tiles[tapZ * chunkSize + tapX];
    const densityTile = eligible[tapped] ? tapped : tile;
    const biomeDensity=growth?growth.profiles[growth.table[densityTile]].density:1;
    const density=growth
      ?grassPatchCover(x/tileSize,-z/tileSize,biomeDensity,worldSeed)*grassStandDensity(x,z,biomeDensity,worldSeed)
      :1;
    if(!acceptsMeadowHabitat(x,z,worldSeed,coverage,density))return false;
    let strength=.30+.70*coverage;
    let path = 0;
    if (mask) {
      strength *= 1 - smoothstep(0.15, 0.6, sampleMask(mask, chunkSize, localX, localZ, 2));
      path = sampleMask(mask, chunkSize, localX, localZ, 0);
    }
    const pathSample=paths.sample(x,z,coverage,path,pathResult);
    if(pathSample.blocked)return false;
    path=pathSample.path;
    // Path shoulder: the stand thins and shortens toward the edge, never a hard grass line.
    if (pathSample.shoulder > 0) {
      if (hash2d(rank, 97) < pathSample.shoulder * 0.8) return false;
      strength *= 1 - 0.45 * pathSample.shoulder;
    }
    // Canopy grass gathers into its own islands instead of an even speckle.
    if (forest) {
      const floor = forest(x - descriptor.centerWorldX, z - descriptor.centerWorldZ);
      if (floor < 1) {
        const keep = canopyFloorCover(x / tileSize, -z / tileSize, floor, worldSeed ^ CANOPY_FLOOR_PATCH_SALT)
          * grassStandDensity(x, z, floor, worldSeed ^ CANOPY_FLOOR_PATCH_SALT);
        if (hash2d(rank, 91) >= keep) return false;
      }
    }
    // Nothing grows under a rock; round its foot collar tufts part outward to
    // soften the rock-to-ground intersection before outer blades flatten slightly.
    out.rotSin = NaN;
    out.rotCos = NaN;
    for (const rock of rocks) {
      const dx = x - rock.x;
      const dz = z - rock.z;
      const distance = Math.hypot(dx, dz);
      if (distance < rock.radius) return false;
      if (distance < rock.reach) {
        const t = smoothstep(rock.radius, rock.reach, distance);
        const collarWidth = Math.min(0.55, (rock.reach - rock.radius) * 0.6);
        if (distance < rock.radius + collarWidth && distance > 1e-4) {
          out.rotSin = -dx / distance;
          out.rotCos = dz / distance;
          const collarBoost = 1 + 0.14 * (1 - smoothstep(rock.radius, rock.radius + collarWidth, distance));
          strength = Math.min(1.2, strength * collarBoost * (1 - flatten * 0.45 * (1 - t)));
        } else {
          strength *= 1 - flatten * (1 - t);
        }
      }
    }
    // Root, bush, & deadwood zones: clears tightly under wood/shrubs, parts collar tufts outward.
    for (const root of roots) {
      if (root.kind === 'bush') {
        const dx = x - root.x;
        const dz = z - root.z;
        const distSq = dx * dx + dz * dz;
        if (distSq >= root.reach * root.reach) continue;
        const dist = Math.sqrt(distSq);
        if (dist < root.radius * 0.45) return false;
        const keep = 0.25 + 0.75 * smoothstep(root.radius * 0.45, root.reach, dist);
        if (hash2d(rank, 95) >= keep) return false;
        strength *= 0.55 + 0.45 * smoothstep(root.radius * 0.45, root.reach, dist);
        if (dist < root.reach && dist > 1e-4 && Number.isNaN(out.rotSin)) {
          out.rotSin = -dx / dist;
          out.rotCos = dz / dist;
        }
        continue;
      }
      if (root.kind === 'log') {
        const vx = root.x1 - root.x0;
        const vz = root.z1 - root.z0;
        const segLenSq = vx * vx + vz * vz;
        const t = segLenSq > 1e-6
          ? Math.max(0, Math.min(1, ((x - root.x0) * vx + (z - root.z0) * vz) / segLenSq))
          : 0.5;
        const dx = x - (root.x0 + vx * t);
        const dz = z - (root.z0 + vz * t);
        const distSq = dx * dx + dz * dz;
        if (distSq >= root.reach * root.reach) continue;
        const dist = Math.sqrt(distSq);
        const edgeJitter = 1 + 0.16 * Math.sin(t * 14 + root.phase);
        const spineWave = 0.72 + 0.22 * Math.sin(t * 11 + root.phase) + 0.12 * Math.cos(t * 19 - root.phase);
        const coreR = root.radius * spineWave;
        if (dist < coreR) return false;
        const collarEnd = root.collar * edgeJitter;
        const minKeep = root.older ? 0.38 : 0.24;
        const keep = dist < collarEnd
          ? minKeep + (1 - minKeep) * smoothstep(coreR, collarEnd, dist)
          : 1;
        if (hash2d(rank, 93) >= keep) return false;
        if (dist < collarEnd && dist > 1e-4) {
          // Sheltered moisture beside the log produces slightly fuller collar tufts parted outward.
          const collarBoost = 1 + 0.24 * (1 - smoothstep(coreR, collarEnd, dist));
          strength = Math.min(1.25, strength * collarBoost);
          out.rotSin = -dx / dist;
          out.rotCos = dz / dist;
        }
        continue;
      }
      const dx = x - root.x;
      const dz = z - root.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= root.reach * root.reach) continue;
      const dist = Math.sqrt(distanceSquared);
      if (root.kind === 'stump') {
        const angle = Math.atan2(dz, dx);
        const lobe = 1 + ROOT_LOBE * (0.65 * Math.cos(4 * angle + root.phase) + 0.45 * Math.cos(3 * angle - root.phase * 0.7));
        const coreR = root.radius * lobe * 0.58;
        if (dist < coreR) return false;
        const keep = smoothstep(coreR, root.reach * lobe, dist);
        if (hash2d(rank, 93) >= keep) return false;
        if (dist < root.collar * lobe && dist > 1e-4) {
          strength *= 0.9 + 0.25 * keep;
          out.rotSin = -dx / dist;
          out.rotCos = dz / dist;
        }
        continue;
      }
      const lobe = footprintLobe(dx, dz, root.phase);
      const keep = smoothstep(root.radius, root.reach, dist / lobe);
      if (hash2d(rank, 93) >= keep) return false;
      strength *= 0.55 + 0.45 * keep;
    }
    if (strength < MIN_GRASS_STRENGTH) return false;
    out.height = sampleHeight(page, localX, localZ, chunkSize);
    out.strength = strength;
    out.shape = shapeTable[tile];
    out.path = path;
    return true;
  };
}
