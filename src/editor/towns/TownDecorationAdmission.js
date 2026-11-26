import { isTownProp } from './TownPrefabCatalog.js';
import { TOWN_LOD_FAR, TOWN_LOD_SPLIT } from './TownLod.js';

const SIMPLIFIABLE = new Set(['Barrel', 'Crate', 'Cargo_Pile', 'Basket_Cluster', 'Woodpile',
  'Flower_Box', 'Bench', 'Bush', 'Street_Bunting', 'Tavern_Table_Set']);
const OMITTABLE = new Set(['Street_Bunting']);
const NONE = 0, NEAR = 1, FAR = 2;

function tierCost(meshes) {
  let triangles = 0, draws = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const count = geometry?.index?.count ?? geometry?.attributes?.position?.count;
    if (!Number.isFinite(count) || count < 0) return null;
    const start = Math.max(0, geometry.drawRange?.start ?? 0);
    const length = Math.max(0, Math.min(count - start, geometry.drawRange?.count ?? Infinity));
    const tris = Math.floor(length / 3);
    if (tris > 0) { triangles += tris; draws++; }
  }
  return { triangles, draws };
}

/** Only explicitly classified secondary props participate; unknown metadata fails closed. */
export function townDecorationMetadata(module, instances, kit) {
  if (!isTownProp(module) || !SIMPLIFIABLE.has(module) || instances.interior) return null;
  const near = tierCost(instances.nearMeshes);
  const far = instances.farMeshes.length ? tierCost(instances.farMeshes) : null;
  if (!near || !near.triangles || (instances.farMeshes.length && !far)) return null;
  const colliders = kit?.moduleColliders;
  const prefabParts = kit?.prefabs;
  const canOmit = OMITTABLE.has(module) && colliders && typeof colliders === 'object'
    && (!Object.hasOwn(colliders, module) || (Array.isArray(colliders[module]) && !colliders[module].length))
    && prefabParts && typeof prefabParts === 'object'
    && Object.values(prefabParts).every(prefab => Array.isArray(prefab.parts) && !prefab.parts.some(part => part.m === module));
  const cheaperFar = far && far.triangles < near.triangles;
  if (!cheaperFar && !canOmit) return null;
  return { module, near, far, cheaperFar: Boolean(cheaperFar), canOmit: Boolean(canOmit) };
}

function costFor(meta, nearCount, farCount) {
  return { triangles: nearCount * meta.near.triangles + farCount * (meta.far?.triangles ?? 0),
    draws: (nearCount ? meta.near.draws : 0) + (farCount ? meta.far?.draws ?? 0 : 0) };
}
const sum = (a, b) => ({ triangles: a.triangles + b.triangles, draws: a.draws + b.draws });
const minus = (a, b) => ({ triangles: a.triangles - b.triangles, draws: a.draws - b.draws });
const fits = (cost, limit) => cost.triangles <= limit.triangles && cost.draws <= limit.draws;

export function decorationPointsChanged(previous, next, meters) {
  if (!previous || previous.length !== next.length) return true;
  return next.some((point, i) => Math.hypot(point.x - previous[i].x, point.z - previous[i].z) >= meters);
}

function distanceToPoints(x, z, points) {
  let nearest = Infinity;
  for (const point of points) nearest = Math.min(nearest, Math.hypot(x - point.x, z - point.z));
  return nearest;
}

/** Main-pass geometry estimate for secondary modules only; no new collider or layout state. */
export function* planTownDecorations(modules, points, lod, lodSettings, settings, wasPressured = false) {
  const plans = [];
  let requested = { triangles: 0, draws: 0 }, requestedInstances = 0, protectedInstances = 0;
  const focus = points[0];
  const protectedDistance = settings.protectMeters + settings.refreshMeters;
  for (const instances of modules) {
    const meta = instances.decoration;
    if (!meta) continue;
    const tiers = new Uint8Array(instances.count), distances = new Float64Array(instances.count);
    let nearCount = 0, farCount = 0, nearest = Infinity;
    for (let i = 0; i < instances.count; i++) {
      const x = instances.values[i * 4], z = instances.values[i * 4 + 2];
      const distance = distanceToPoints(x, z, points);
      const protectedNow = distance <= protectedDistance;
      distances[i] = distance;
      const d = Math.hypot(x - focus.x, z - focus.z);
      const previousTier = instances.decorationTiers?.[i];
      let tier = NEAR;
      if (!protectedNow && meta.far) {
        if (lod === TOWN_LOD_FAR) tier = FAR;
        else if (lod === TOWN_LOD_SPLIT) {
          const keep = lodSettings.splitRadius + (previousTier === NEAR ? lodSettings.hysteresis : 0);
          const reach = instances.farReach + (previousTier === FAR ? lodSettings.hysteresis : 0);
          tier = d <= keep ? NEAR : d <= reach ? FAR : NONE;
        }
      }
      if (protectedNow) protectedInstances++;
      tiers[i] = tier;
      if (tier === NEAR) nearCount++;
      else if (tier === FAR) farCount++;
      if (tier !== NONE) { requestedInstances++; nearest = Math.min(nearest, distance); }
      if ((i & 63) === 63) yield;
    }
    const cost = costFor(meta, nearCount, farCount);
    requested = sum(requested, cost);
    plans.push({ instances, meta, tiers, distances, nearCount, farCount, nearest, cost });
    yield;
  }
  const limit = { triangles: settings.triangleBudget, draws: settings.drawBudget };
  const recovery = { triangles: limit.triangles * settings.recoveryRatio, draws: limit.draws * settings.recoveryRatio };
  const pressured = !fits(requested, limit) || (wasPressured && !fits(requested, recovery));
  let selected = requested, simplified = 0, omitted = 0;
  if (pressured) {
    // Grouped changes avoid paying a new draw for each placement.
    const ordered = plans.slice().sort((a, b) => b.nearest - a.nearest || (a.meta.module < b.meta.module ? -1 : 1));
    for (const plan of ordered) {
      if (fits(selected, recovery)) break;
      if (!plan.meta.cheaperFar) continue;
      let count = 0;
      for (let i = 0; i < plan.tiers.length; i++) {
        if (plan.tiers[i] === NEAR && plan.distances[i] > protectedDistance) count++;
        if ((i & 63) === 63) yield;
      }
      if (!count) continue;
      const nextCost = costFor(plan.meta, plan.nearCount - count, plan.farCount + count);
      const next = sum(minus(selected, plan.cost), nextCost);
      if (next.draws > Math.max(selected.draws, limit.draws)) continue;
      for (let i = 0; i < plan.tiers.length; i++) {
        if (plan.tiers[i] === NEAR && plan.distances[i] > protectedDistance) plan.tiers[i] = FAR;
        if ((i & 63) === 63) yield;
      }
      plan.nearCount -= count; plan.farCount += count; plan.cost = nextCost;
      selected = next; simplified += count;
      yield;
    }
    for (const plan of ordered) {
      if (fits(selected, recovery)) break;
      if (!plan.meta.canOmit) continue;
      let near = 0, far = 0;
      for (let i = 0; i < plan.tiers.length; i++) {
        if (plan.distances[i] >= settings.omitDistanceMeters && plan.distances[i] > protectedDistance) {
          if (plan.tiers[i] === NEAR) near++;
          else if (plan.tiers[i] === FAR) far++;
          plan.tiers[i] = NONE;
        }
        if ((i & 63) === 63) yield;
      }
      if (!near && !far) continue;
      const nextCost = costFor(plan.meta, plan.nearCount - near, plan.farCount - far);
      selected = sum(minus(selected, plan.cost), nextCost);
      plan.nearCount -= near; plan.farCount -= far; plan.cost = nextCost;
      omitted += near + far;
      yield;
    }
  }
  return { plans, pressured, requested, selected, requestedInstances, protectedInstances, simplified, omitted,
    overflow: !fits(selected, limit) };
}
