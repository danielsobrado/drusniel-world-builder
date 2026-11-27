/**
 * Procedural crags, connected mountain shoulders, scree aprons, and boulder clusters:
 * deterministic per-cell rock placements fed by local terrain relief.
 */

export const ALPINE_CELL_METERS = 32;
export const ALPINE_ROCK_KINDS = 4;
/** Rise over run where a slope starts to break into rock, and where it is flat enough for boulders. */
const CRAG_SLOPE = 0.5;
const BOULDER_SLOPE = 0.3;
const CRAG_SHARE = 0.55;
const CLUSTER_SHARE = 0.1;
const CLUSTER_SIZE = 5;
const CLUSTER_SPREAD_METERS = 9;
const LOWLAND_CRAG_THRESHOLD = 0.22;
const MOUNTAIN_SHOULDER_THRESHOLD = 0.45;
const SCREE_THRESHOLD = 0.15;

function hash(x, z, salt) {
  let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ Math.imul(salt | 0, 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 15), 0x297a2d39);
  value ^= value >>> 13;
  return (value >>> 0) / 0x100000000;
}

function rock(cellX, cellZ, salt, x, z, scale, stretch, extra = null) {
  const entry = {
    x,
    z,
    scale,
    stretch,
    yaw: hash(cellX, cellZ, salt + 1) * Math.PI * 2,
    kind: Math.floor(hash(cellX, cellZ, salt + 2) * ALPINE_ROCK_KINDS),
  };
  if (extra) Object.assign(entry, extra);
  return entry;
}

function buildScreeFan(cellX, cellZ, x, z, here, maxCount = 6) {
  const scree = here.screeFactor ?? 0;
  if (scree <= SCREE_THRESHOLD) return [];
  const dx = here.dx ?? 0;
  const dz = here.dz ?? 0;
  const gradLen = Math.hypot(dx, dz);
  // Slope gradient points uphill; scree aprons spill downslope.
  const downX = gradLen > 1e-4 ? -dx / gradLen : Math.cos(hash(cellX, cellZ, 80) * Math.PI * 2);
  const downZ = gradLen > 1e-4 ? -dz / gradLen : Math.sin(hash(cellX, cellZ, 80) * Math.PI * 2);
  const perpX = -downZ;
  const perpZ = downX;
  const count = Math.max(3, Math.min(maxCount, Math.round(3 + scree * 4)));
  const stones = [];
  for (let i = 0; i < count; i += 1) {
    const progress = (i + hash(cellX, cellZ, 90 + i)) / count;
    const distance = 2 + progress * (9 + scree * 7);
    const spread = (hash(cellX, cellZ, 110 + i) - 0.5) * (4 + distance * 0.7);
    const sizeMix = hash(cellX, cellZ, 130 + i);
    // Larger angular blocks stay upslope; smaller talus settles toward the toe.
    const scale = (1 - progress * 0.55) * (1.2 + sizeMix * 1.15) + 0.45;
    stones.push(rock(
      cellX,
      cellZ,
      150 + i * 3,
      x + downX * distance + perpX * spread,
      z + downZ * distance + perpZ * spread,
      scale,
      0.58 + sizeMix * 0.3,
      {
        burial: 0.46 + (1 - progress) * 0.08 + hash(cellX, cellZ, 170 + i) * 0.06,
        tiltFactor: 0.72,
      },
    ));
  }
  return stones;
}

/** Deterministic rock set in one cell, or `null` when empty. */
export function alpineRocksInCell(cellX, cellZ, ground) {
  const x = (cellX + 0.1 + 0.8 * hash(cellX, cellZ, 1)) * ALPINE_CELL_METERS;
  const z = (cellZ + 0.1 + 0.8 * hash(cellX, cellZ, 2)) * ALPINE_CELL_METERS;
  const roll = hash(cellX, cellZ, 3);
  if (roll >= Math.max(CRAG_SHARE, CLUSTER_SHARE)) return null;
  const here = ground(x, z);
  if (!here.allowed) return null;

  // Legacy path when ground() omits mountainFactor (preserves existing unit test contracts).
  if (here.mountainFactor === undefined) {
    if (here.slope >= CRAG_SLOPE) {
      const scale = 5 + 13 * hash(cellX, cellZ, 4) ** 2;
      return [rock(cellX, cellZ, 10, x, z, scale, 1.1 + hash(cellX, cellZ, 5) * 0.9)];
    }
    if (here.slope > BOULDER_SLOPE || roll >= CLUSTER_SHARE) return null;
    const rocks = [];
    for (let i = 0; i < CLUSTER_SIZE; i += 1) {
      const angle = hash(cellX, cellZ, 20 + i) * Math.PI * 2;
      const reach = CLUSTER_SPREAD_METERS * Math.sqrt(hash(cellX, cellZ, 30 + i));
      const size = hash(cellX, cellZ, 40 + i);
      // One large stone with smaller ones around it, not a sprinkle of equals.
      const scale = i === 0 ? 2.2 + size * 2.4 : 0.5 + size * size * 1.5;
      rocks.push(rock(cellX, cellZ, 50 + i * 3, x + Math.cos(angle) * reach, z + Math.sin(angle) * reach, scale, 0.75 + size * 0.3));
    }
    return rocks;
  }

  const mountainFactor = here.mountainFactor;
  const screeFactor = here.screeFactor ?? 0;

  if (here.slope >= CRAG_SLOPE) {
    // Lowland slopes (e.g., isolated tundra mounds) get deeply buried boulders instead of monolith spires.
    if (mountainFactor < LOWLAND_CRAG_THRESHOLD) {
      const count = 2 + Math.floor(hash(cellX, cellZ, 6) * 2);
      const rocks = [];
      for (let i = 0; i < count; i += 1) {
        const angle = hash(cellX, cellZ, 14 + i) * Math.PI * 2;
        const reach = i === 0 ? 0 : 2.2 + hash(cellX, cellZ, 18 + i) * 3.5;
        const size = hash(cellX, cellZ, 22 + i);
        rocks.push(rock(
          cellX,
          cellZ,
          26 + i * 3,
          x + Math.cos(angle) * reach,
          z + Math.sin(angle) * reach,
          1.4 + size * 1.8,
          0.62 + size * 0.28,
          { burial: 0.44 + hash(cellX, cellZ, 30 + i) * 0.08, tiltFactor: 0.65 },
        ));
      }
      return rocks;
    }

    const mountainScaleBoost = 0.65 + mountainFactor * 0.6;
    const scale = (4.5 + 11.5 * hash(cellX, cellZ, 4) ** 2) * mountainScaleBoost;
    const rocks = [
      rock(cellX, cellZ, 10, x, z, scale, 1.0 + hash(cellX, cellZ, 5) * 0.8, {
        burial: 0.42,
        tiltFactor: 0.55,
      }),
    ];

    // Connected shoulder blocks anchor the primary crag into the massif rather than standing solo.
    if (mountainFactor >= MOUNTAIN_SHOULDER_THRESHOLD) {
      const shoulders = 2 + Math.floor(hash(cellX, cellZ, 7) * 2);
      const baseAngle = hash(cellX, cellZ, 8) * Math.PI * 2;
      for (let i = 0; i < shoulders; i += 1) {
        const angle = baseAngle + (i - (shoulders - 1) * 0.5) * 1.25 + (hash(cellX, cellZ, 12 + i) - 0.5) * 0.4;
        const dist = scale * (0.45 + hash(cellX, cellZ, 16 + i) * 0.35);
        const shoulderScale = scale * (0.42 + hash(cellX, cellZ, 20 + i) * 0.25);
        rocks.push(rock(
          cellX,
          cellZ,
          30 + i * 3,
          x + Math.cos(angle) * dist,
          z + Math.sin(angle) * dist,
          shoulderScale,
          0.72 + hash(cellX, cellZ, 24 + i) * 0.45,
          { burial: 0.48, tiltFactor: 0.6 },
        ));
      }
    }

    if (screeFactor > SCREE_THRESHOLD) {
      rocks.push(...buildScreeFan(cellX, cellZ, x, z, here, 4));
    }
    return rocks;
  }

  // Foot-of-mountain talus / scree aprons even below steep crag slopes.
  if (screeFactor > SCREE_THRESHOLD && roll < CRAG_SHARE * 0.75) {
    return buildScreeFan(cellX, cellZ, x, z, here, 6);
  }

  if (here.slope > BOULDER_SLOPE || roll >= CLUSTER_SHARE) return null;
  const rocks = [];
  for (let i = 0; i < CLUSTER_SIZE; i += 1) {
    const angle = hash(cellX, cellZ, 20 + i) * Math.PI * 2;
    const reach = CLUSTER_SPREAD_METERS * Math.sqrt(hash(cellX, cellZ, 30 + i));
    const size = hash(cellX, cellZ, 40 + i);
    // Larger buried core boulder ringed by half-embedded companion stones.
    const scale = i === 0 ? 2.1 + size * 2.1 : 0.45 + size * size * 1.45;
    rocks.push(rock(
      cellX,
      cellZ,
      50 + i * 3,
      x + Math.cos(angle) * reach,
      z + Math.sin(angle) * reach,
      scale,
      0.7 + size * 0.28,
      { burial: 0.4 + hash(cellX, cellZ, 65 + i) * 0.14, tiltFactor: 0.65 },
    ));
  }
  return rocks;
}
