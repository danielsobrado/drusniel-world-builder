import { contactShadeRadius } from '../contactShade.js';
import { collectDebrisGrassZones } from '../UnderstoryClearance.js';

const NEIGHBOR_OFFSETS = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]);

function overlapsChunk(x, z, centerX, centerZ, half, radius) {
  return Math.abs(x - centerX) <= half + radius && Math.abs(z - centerZ) <= half + radius;
}

/**
 * Collects contact-shade footprints affecting one terrain chunk, including
 * overlapping neighbours from adjacent chunks so patches never clip on chunk
 * seams, plus bushes and resident alpine rocks.
 */
export function collectChunkContactShadeSources({
  descriptor,
  chunkWorldSize,
  settings,
  treeView,
  rockView,
  bushView,
  forestDebrisView,
  alpineRockView,
}) {
  const sources = [];
  const debrisSources = [];
  const half = chunkWorldSize * 0.5;
  const cx = descriptor.centerWorldX;
  const cz = descriptor.centerWorldZ;

  for (const [dx, dz] of NEIGHBOR_OFFSETS) {
    const nx = descriptor.chunkX + dx;
    const nz = descriptor.chunkZ + dz;
    const isOwn = dx === 0 && dz === 0;
    const trees = isOwn
      ? (treeView?.manifestStore?.get(nx, nz, rockView) ?? [])
      : (treeView?.manifestStore?.peek(nx, nz) ?? []);
    for (const placement of trees) {
      const scale = placement.heightScale ?? placement.scale ?? 1;
      const radius = contactShadeRadius(settings, 'tree', scale);
      if (!isOwn && !overlapsChunk(placement.x, placement.z, cx, cz, half, radius)) continue;
      sources.push({ x: placement.x, z: placement.z, radius, strength: settings.treeStrength });
    }

    const chunkKey = `${nx}:${nz}`;
    const bushes = bushView?.manifestCache?.get(chunkKey)?.placements ?? [];
    for (const placement of bushes) {
      const scale = placement.scale ?? 1;
      const radius = contactShadeRadius(settings, 'bush', scale);
      if (!isOwn && !overlapsChunk(placement.x, placement.z, cx, cz, half, radius)) continue;
      sources.push({ x: placement.x, z: placement.z, radius, strength: settings.bushStrength });
    }

    const debrisPlacements = forestDebrisView?.manifestCache?.get(chunkKey)?.placements ?? [];
    for (const zone of collectDebrisGrassZones(debrisPlacements, forestDebrisView?.prototypeFootprints)) {
      if (zone.kind === 'log') {
        const shadeRadius = Math.max(0.58, zone.radius + 0.42);
        const pad = (zone.span ?? 1.8) + shadeRadius;
        if (!isOwn && !overlapsChunk(zone.x, zone.z, cx, cz, half, pad)) continue;
        const entry = {
          x0: zone.x0, z0: zone.z0, x1: zone.x1, z1: zone.z1,
          x: zone.x, z: zone.z,
          radius: shadeRadius,
          strength: Math.min(1, settings.rockStrength * 1.2),
        };
        sources.push(entry);
        debrisSources.push({ ...entry, radius: Math.max(0.95, zone.collar + 0.42), strength: 0.85 });
      } else {
        const shadeRadius = Math.max(0.75, zone.radius + 0.45);
        if (!isOwn && !overlapsChunk(zone.x, zone.z, cx, cz, half, shadeRadius)) continue;
        const entry = {
          x: zone.x, z: zone.z,
          radius: shadeRadius,
          strength: Math.min(1, settings.rockStrength * 1.25),
        };
        sources.push(entry);
        debrisSources.push({ ...entry, radius: Math.max(1.1, zone.collar + 0.45), strength: 0.9 });
      }
    }
  }

  const rockFootprints = rockView?.prototypeEllipses ?? null;
  for (const placement of rockView?.getPlacements() ?? []) {
    const scale = placement.scale ?? 1;
    const radius = contactShadeRadius(settings, 'rock', scale);
    if (!overlapsChunk(placement.x, placement.z, cx, cz, half, radius)) continue;
    const ellipse = rockFootprints?.[placement.prototypeIndex];
    if (ellipse && Math.abs(ellipse.ratio - 1) > 0.14) {
      sources.push({
        x: placement.x,
        z: placement.z,
        radius,
        radiusX: radius * ellipse.scaleX,
        radiusZ: radius * ellipse.scaleZ,
        rotationY: placement.rotationY ?? 0,
        strength: settings.rockStrength,
      });
    } else {
      sources.push({ x: placement.x, z: placement.z, radius, strength: settings.rockStrength });
    }
  }

  if (alpineRockView?.residency) {
    for (const cellRocks of alpineRockView.residency.values()) {
      for (const rock of cellRocks ?? []) {
        const radius = Math.max(1.2, (rock.scale ?? 1) * 0.95);
        if (!overlapsChunk(rock.x, rock.z, cx, cz, half, radius)) continue;
        sources.push({ x: rock.x, z: rock.z, radius, strength: settings.rockStrength * 0.9 });
      }
    }
  }

  return { sources, debrisSources };
}

/** Stable key for `updateForestGroundTextures`, tracking neighbours and bushes. */
export function buildChunkContactShadeKey({
  descriptor,
  treeView,
  rockView,
  bushView,
  forestDebrisView,
  alpineRockView,
}) {
  let trees = 0;
  let rocks = 0;
  let bushes = 0;
  let debris = 0;
  for (const [dx, dz] of NEIGHBOR_OFFSETS) {
    const nx = descriptor.chunkX + dx;
    const nz = descriptor.chunkZ + dz;
    const isOwn = dx === 0 && dz === 0;
    const key = `${nx}:${nz}`;
    const tList = isOwn
      ? (treeView?.manifestStore?.get(nx, nz, rockView) ?? [])
      : (treeView?.manifestStore?.peek(nx, nz) ?? []);
    trees += tList.length;
    rocks += rockView?.placementsByChunk?.get(key)?.length ?? 0;
    bushes += bushView?.manifestCache?.get(key)?.placements?.length ?? 0;
    debris += forestDebrisView?.manifestCache?.get(key)?.placements?.length ?? 0;
  }
  const alpine = alpineRockView?.residency?.cells?.size ?? 0;
  return `${trees}:${rocks}:${bushes}:${debris}:${alpine}`;
}
