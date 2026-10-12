/**
 * Lightning geometry by midpoint displacement, plus forks. Returns polylines;
 * recipes turn each segment into an axis-aligned BOLT sprite.
 */

function displace(points, random, roughness, depth) {
  if (depth === 0) return points;
  const next = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const offset = length * roughness;
    next.push({
      x: (a.x + b.x) * 0.5 + random.signed() * offset,
      y: (a.y + b.y) * 0.5 + random.signed() * offset,
      z: (a.z + b.z) * 0.5 + random.signed() * offset,
    }, b);
  }
  return displace(next, random, roughness * 0.92, depth - 1);
}

/**
 * @param {{x,y,z}} from
 * @param {{x,y,z}} to
 * @param {() => number} random simulator random (has .signed())
 * @param {{ depth?: number, roughness?: number, forks?: number, forkLength?: number }} [options]
 * @returns {{ trunk: Array<{x,y,z}>, forks: Array<Array<{x,y,z}>> }}
 */
export function buildLightningPath(from, to, random, options = {}) {
  const depth = options.depth ?? 6;
  const roughness = options.roughness ?? 0.13;
  const trunk = displace([{ ...from }, { ...to }], random, roughness, depth);
  const forks = [];
  const forkCount = options.forks ?? 6;
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  for (let fork = 0; fork < forkCount; fork += 1) {
    const startIndex = 2 + Math.floor(random() * (trunk.length - 4));
    const start = trunk[startIndex];
    const along = trunk[Math.min(trunk.length - 1, startIndex + 2)];
    const forkLength = length * (options.forkLength ?? 0.18) * (0.4 + random() * 0.8);
    const dx = along.x - start.x + random.signed() * 0.8;
    const dy = along.y - start.y + random.signed() * 0.6 - 0.2;
    const dz = along.z - start.z + random.signed() * 0.8;
    const norm = Math.hypot(dx, dy, dz) || 1;
    const end = {
      x: start.x + dx / norm * forkLength,
      y: start.y + dy / norm * forkLength,
      z: start.z + dz / norm * forkLength,
    };
    forks.push(displace([{ ...start }, end], random, roughness * 1.1, Math.max(2, depth - 3)));
  }
  return { trunk, forks };
}

/**
 * Emits one axial sprite per polyline segment.
 * @param {object} fx
 * @param {string} typeId
 * @param {Array<{x,y,z}>} points
 * @param {object} [overrides] extra burst overrides (sizeScale, emissiveScale…)
 */
export function emitPolyline(fx, typeId, points, overrides = {}) {
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-4) continue;
    fx.burst(typeId, 1, { kind: 'point', center: { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5 } }, {
      ...overrides,
      axis: { x: dx / length, y: dy / length, z: dz / length },
      // Overlap neighbours slightly so joints never show gaps.
      axisLength: length * 1.18,
      rotation: 0,
    });
  }
}
