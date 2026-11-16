const DEFAULT_TRUNK_CLEARANCE = 0.58;
const DEFAULT_BUSH_CLEARANCE = 0.62;
const MIN_TRUNK_RADIUS = 0.45;
const MIN_BUSH_RADIUS = 0.45;
const MIN_FOOTPRINT_EXTENT = 0.15;

/**
 * Measures the local XZ half-extents and vertical span of a detail/understory
 * prototype from its geometry parts at unit scale.
 */
export function computePrototypeFootprint(parts = []) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const part of parts) {
    const geometry = part?.geometry;
    if (!geometry) continue;
    if (!geometry.boundingBox && typeof geometry.computeBoundingBox === 'function') {
      geometry.computeBoundingBox();
    }
    const box = geometry.boundingBox;
    if (!box) continue;
    if (box.min.x < minX) minX = box.min.x;
    if (box.max.x > maxX) maxX = box.max.x;
    if (box.min.y < minY) minY = box.min.y;
    if (box.max.y > maxY) maxY = box.max.y;
    if (box.min.z < minZ) minZ = box.min.z;
    if (box.max.z > maxZ) maxZ = box.max.z;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) {
    return Object.freeze({ halfX: MIN_FOOTPRINT_EXTENT, halfZ: MIN_FOOTPRINT_EXTENT, height: 0 });
  }
  return Object.freeze({
    halfX: Math.max(MIN_FOOTPRINT_EXTENT, Math.abs(minX), Math.abs(maxX)),
    halfZ: Math.max(MIN_FOOTPRINT_EXTENT, Math.abs(minZ), Math.abs(maxZ)),
    height: Number.isFinite(minY) && Number.isFinite(maxY) ? Math.max(0, maxY - minY) : 0,
  });
}

/**
 * Collects obstacle circles `{ x, z, radius }` around `chunkX, chunkZ` (including
 * adjacent chunks so long props like fallen logs cannot clip across chunk borders
 * into neighbouring tree trunks, rocks, bushes, or solid deadwood).
 */
export function collectChunkObstacleCircles(chunkX, chunkZ, {
  treePlacementsProvider = null,
  rockBlockersProvider = null,
  bushPlacementsProvider = null,
  debrisPlacementsProvider = null,
  debrisFootprintsProvider = null,
  trunkClearance = DEFAULT_TRUNK_CLEARANCE,
} = {}) {
  const obstacles = [];
  let treeCount = 0;
  if (typeof treePlacementsProvider === 'function') {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const trees = treePlacementsProvider(chunkX + dx, chunkZ + dz);
        if (!Array.isArray(trees) || trees.length === 0) continue;
        treeCount += trees.length;
        for (const tree of trees) {
          const radius = Math.max(MIN_TRUNK_RADIUS, trunkClearance * (tree.scale ?? 1));
          obstacles.push({ x: tree.x, z: tree.z, radius });
        }
      }
    }
  }
  const rockSnapshot = typeof rockBlockersProvider === 'function'
    ? rockBlockersProvider(chunkX, chunkZ)
    : null;
  const rockPlacements = Array.isArray(rockSnapshot)
    ? rockSnapshot
    : (rockSnapshot?.placements ?? []);
  for (const rock of rockPlacements) {
    if ((rock.radius ?? 0) > 0) obstacles.push(rock);
  }
  const rockSig = rockSnapshot?.signature ?? rockPlacements.length;

  let bushCount = 0;
  if (typeof bushPlacementsProvider === 'function') {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const bushes = bushPlacementsProvider(chunkX + dx, chunkZ + dz);
        if (!Array.isArray(bushes) || bushes.length === 0) continue;
        bushCount += bushes.length;
        for (const bush of bushes) {
          obstacles.push({
            x: bush.x,
            z: bush.z,
            radius: Math.max(MIN_BUSH_RADIUS, DEFAULT_BUSH_CLEARANCE * (bush.scale ?? 1)),
          });
        }
      }
    }
  }

  let debrisCount = 0;
  if (typeof debrisPlacementsProvider === 'function') {
    const footprints = typeof debrisFootprintsProvider === 'function' ? debrisFootprintsProvider() : null;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const debris = debrisPlacementsProvider(chunkX + dx, chunkZ + dz);
        if (!Array.isArray(debris) || debris.length === 0) continue;
        debrisCount += debris.length;
        const zones = collectDebrisGrassZones(debris, footprints);
        for (const zone of zones) {
          if (zone.kind === 'log') {
            for (const s of [0, 0.5, 1]) {
              obstacles.push({
                x: zone.x0 + (zone.x1 - zone.x0) * s,
                z: zone.z0 + (zone.z1 - zone.z0) * s,
                radius: zone.radius,
              });
            }
          } else {
            obstacles.push({ x: zone.x, z: zone.z, radius: zone.radius });
          }
        }
      }
    }
  }

  const baseSig = `t${treeCount}:r${rockSig}`;
  const extras = [
    typeof bushPlacementsProvider === 'function' ? `b${bushCount}` : null,
    typeof debrisPlacementsProvider === 'function' ? `d${debrisCount}` : null,
  ].filter(Boolean);
  return {
    obstacles,
    signature: extras.length > 0 ? `${baseSig}:${extras.join(':')}` : baseSig,
  };
}

/**
 * Tests whether a candidate's oriented XZ footprint (scaled by `candidate.scale`
 * and rotated by `candidate.rotationY`) intersects any obstacle circle.
 */
export function footprintHitsObstacle(candidate, footprint, obstacles = []) {
  if (!obstacles || obstacles.length === 0) return false;
  const scale = candidate.scale ?? 1;
  const hx = (footprint?.halfX ?? candidate.radius ?? MIN_FOOTPRINT_EXTENT) * scale;
  const hz = (footprint?.halfZ ?? candidate.radius ?? MIN_FOOTPRINT_EXTENT) * scale;
  const yaw = candidate.rotationY ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  for (let i = 0; i < obstacles.length; i += 1) {
    const obs = obstacles[i];
    const dx = obs.x - candidate.x;
    const dz = obs.z - candidate.z;
    const r = obs.radius ?? 0;
    const maxReach = Math.hypot(hx, hz) + r;
    if (dx * dx + dz * dz >= maxReach * maxReach) continue;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const cx = Math.max(-hx, Math.min(hx, lx));
    const cz = Math.max(-hz, Math.min(hz, lz));
    const ox = lx - cx;
    const oz = lz - cz;
    if (ox * ox + oz * oz < r * r) return true;
  }
  return false;
}

/**
 * Checks walk-path clearance across both the center and the two ends of an
 * elongated footprint so fallen logs cannot protrude into trails.
 */
export function pathBlockedForFootprint(pathClearance, candidate, footprint) {
  if (!pathClearance) return false;
  const baseRadius = candidate.radius ?? 0;
  if (pathClearance.blocks(candidate.x, candidate.z, baseRadius)) return true;
  if (!footprint) return false;
  const scale = candidate.scale ?? 1;
  const hx = footprint.halfX * scale;
  const hz = footprint.halfZ * scale;
  const longHalf = Math.max(hx, hz);
  const shortHalf = Math.min(hx, hz);
  if (longHalf <= Math.max(baseRadius, shortHalf * 1.4)) return false;
  const yaw = candidate.rotationY ?? 0;
  const dirX = hx >= hz ? Math.cos(yaw) : Math.sin(yaw);
  const dirZ = hx >= hz ? -Math.sin(yaw) : Math.cos(yaw);
  const tipOffset = Math.max(0, longHalf - shortHalf);
  return pathClearance.blocks(candidate.x + dirX * tipOffset, candidate.z + dirZ * tipOffset, shortHalf)
    || pathClearance.blocks(candidate.x - dirX * tipOffset, candidate.z - dirZ * tipOffset, shortHalf);
}

/**
 * Emits spine circles `{ x, z, radius, reach, phase }` for solid deadwood placements
 * (logs and stumps), skipping flat litter carpets.
 */
export function collectDebrisContactFootprints(placements = [], footprints = [], out = []) {
  if (!Array.isArray(placements) || placements.length === 0) return out;
  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    const fp = footprints?.[p.prototypeIndex];
    if (!fp) continue;
    const maxH = Math.max(fp.halfX, fp.halfZ);
    const height = fp.height ?? 1;
    if (maxH < 0.45 || height < 0.14) continue;
    const scale = p.scale ?? 1;
    const hx = fp.halfX * scale;
    const hz = fp.halfZ * scale;
    const longHalf = Math.max(hx, hz);
    const shortHalf = Math.min(hx, hz);
    const phase = ((Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233)) * 43758.5453) % 1) * Math.PI * 2;
    if (longHalf >= shortHalf * 1.8 && longHalf >= 0.9) {
      const yaw = p.rotationY ?? 0;
      const dirX = hx >= hz ? Math.cos(yaw) : Math.sin(yaw);
      const dirZ = hx >= hz ? -Math.sin(yaw) : Math.cos(yaw);
      const radius = Math.max(0.24, Math.min(0.36, shortHalf * 0.56));
      const reach = radius + 0.55 * scale;
      const span = Math.max(0.4, longHalf - radius * 0.7);
      for (const s of [-1, 0, 1]) {
        out.push({
          x: p.x + dirX * span * s,
          z: p.z + dirZ * span * s,
          radius,
          reach,
          phase: phase + s * 1.1,
        });
      }
    } else if (height >= 0.25) {
      const radius = Math.max(0.34, longHalf * 0.58);
      out.push({ x: p.x, z: p.z, radius, reach: radius + 0.55 * scale, phase });
    }
  }
  return out;
}

/**
 * Oriented capsule and root-collar zones for cohesive grass parting/hugging and
 * tight contact AO under solid logs, branches, and stumps (never leaf litter).
 */
export function collectDebrisGrassZones(placements = [], footprints = [], out = []) {
  if (!Array.isArray(placements) || placements.length === 0) return out;
  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    const fp = footprints?.[p.prototypeIndex];
    if (!fp) continue;
    const maxH = Math.max(fp.halfX, fp.halfZ);
    const height = fp.height ?? 1;
    if (maxH < 0.45 || height < 0.14) continue;
    const scale = p.scale ?? 1;
    const hx = fp.halfX * scale;
    const hz = fp.halfZ * scale;
    const longHalf = Math.max(hx, hz);
    const shortHalf = Math.min(hx, hz);
    const phase = ((Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233)) * 43758.5453) % 1) * Math.PI * 2;
    if (longHalf >= shortHalf * 1.8 && longHalf >= 0.85) {
      const yaw = p.rotationY ?? 0;
      const dirX = hx >= hz ? Math.cos(yaw) : Math.sin(yaw);
      const dirZ = hx >= hz ? -Math.sin(yaw) : Math.cos(yaw);
      // Actual wood core radius (~0.24 m log vs wider stub bounding box) so grass hugs close.
      const radius = Math.max(0.14, Math.min(0.34, shortHalf * 0.52));
      const collar = radius + 0.34 * scale;
      const reach = radius + 0.82 * scale;
      const span = Math.max(0.3, longHalf - radius * 0.65);
      out.push({
        kind: 'log',
        x0: p.x - dirX * span,
        z0: p.z - dirZ * span,
        x1: p.x + dirX * span,
        z1: p.z + dirZ * span,
        x: p.x,
        z: p.z,
        radius,
        collar,
        reach,
        phase,
      });
    } else if (height >= 0.25) {
      const radius = Math.max(0.3, longHalf * 0.55);
      const collar = radius + 0.26 * scale;
      const reach = radius + 0.65 * scale;
      out.push({ kind: 'stump', x: p.x, z: p.z, radius, collar, reach, phase });
    }
  }
  return out;
}
