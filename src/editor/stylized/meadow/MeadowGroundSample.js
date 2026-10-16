import { sampleSurfaceMaskChannel } from '../../world/SurfaceMaskSampling.js';
import { acceptsMeadowHabitat } from './meadowHabitat.js';
import { sampleHeight } from '../scatterMath.js';
import { hash2d } from './meadowGrassGeometry.js';
import { createMeadowPathSampler } from './MeadowPathSampler.js';
import { forestDensitySamplerFromGrid } from '../forest/ForestFloor.js';

export const MIN_GRASS_STRENGTH = 0.02;
const sampleMask = (pixels, size, x, z, channel) => sampleSurfaceMaskChannel(pixels, size, size, x, z, channel);
function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The identical ground rule runs against immutable job inputs on either thread. */
export function createMeadowGroundSample(snapshot, { forest = null, paths = null } = {}) {
  const { page, descriptor, chunkSize, tileSize, eligible, shapeTable, growth, worldSeed, rocks, flatten } = snapshot;
  const mask = page.surfaceMaskPixels;
  paths ??= createMeadowPathSampler(snapshot.pathConfig);
  forest ??= snapshot.forest ? forestDensitySamplerFromGrid(snapshot.forest) : null;
  const pathResult = { path: 0, blocked: false };
  return (x, z, rank, out) => {
    const localX = x / tileSize - descriptor.originCellX;
    const localZ = -z / tileSize - descriptor.originCellZ;
    if (localX < 0 || localZ < 0 || localX >= chunkSize || localZ >= chunkSize) return false;
    const tile = page.tiles[Math.floor(localZ) * chunkSize + Math.floor(localX)];
    if (!eligible[tile]) return false;
    const coverage=mask?sampleMask(mask,chunkSize,localX,localZ,1):1;
    const density=growth?growth.profiles[growth.table[tile]].density:1;
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
    // Canopy suppression, as the clump scatter did it: a stem survives where its
    // own roll is under the forest floor's grass density.
    if (forest && hash2d(rank, 91) >= forest(x - descriptor.centerWorldX, z - descriptor.centerWorldZ)) return false;
    // Nothing grows under a rock; round its foot the stand is pressed flatter.
    for (const rock of rocks) {
      const distance = Math.hypot(x - rock.x, z - rock.z);
      if (distance < rock.radius) return false;
      if (distance < rock.reach) {
        strength *= 1 - flatten * (1 - smoothstep(rock.radius, rock.reach, distance));
      }
    }
    if (strength < MIN_GRASS_STRENGTH) return false;
    out.height = sampleHeight(page, localX, localZ, chunkSize);
    out.strength = strength;
    out.shape = shapeTable[tile];
    out.path = path;
    return true;
  };
}
