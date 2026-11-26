import { PerfCounters } from '../performance/qa/PerfCounters.js';

/** Partition only generator-owned, non-colliding decoration records. */
export function buildDecorationBatches(records, settings, build) {
  if (!records.length) return [];
  if (!settings || records.some(record => ![record.px, record.py, record.pz].every(Number.isFinite))) {
    const mesh = build(records);
    return mesh ? [mesh] : [];
  }
  const cells = new Map();
  for (const record of records) {
    const key = [record.px, record.py, record.pz].map(value => Math.floor(value / settings.cellMeters)).join(':');
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(record);
  }
  const meshes = [];
  for (const batch of cells.values()) {
    const mesh = build(batch);
    if (!mesh) continue;
    mesh.computeBoundingSphere();
    const sphere = mesh.boundingSphere;
    if (sphere && Number.isFinite(sphere.radius) && [sphere.center.x, sphere.center.y, sphere.center.z].every(Number.isFinite)) {
      sphere.radius += settings.boundsPaddingMeters;
      mesh.frustumCulled = true;
      mesh.userData.locationDecoration = true;
    }
    meshes.push(mesh);
  }
  return meshes;
}

export function selectLocationDecorations(entries, point, settings) {
  let requested = 0, selected = 0, draws = 0, protectedCount = 0;
  const optional = [], admitted = new Set();
  for (const entry of entries) {
    requested += entry.triangles;
    const { center, radius } = entry.sphere;
    const distance = Math.max(0, Math.hypot(center.x - point.x, center.y - point.y, center.z - point.z) - radius);
    if (!Number.isFinite(distance) || distance <= settings.protectMeters + settings.refreshMeters) {
      admitted.add(entry);
      selected += entry.triangles;
      draws++;
      protectedCount++;
    } else if (distance <= settings.maxDistanceMeters + (entry.mesh.visible ? settings.recoveryMeters : 0)) {
      optional.push({ entry, distance: distance - (entry.mesh.visible ? settings.recoveryMeters : 0) });
    }
  }
  optional.sort((a, b) => a.distance - b.distance);
  for (const { entry } of optional) {
    if (draws >= settings.drawBudget || selected + entry.triangles > settings.triangleBudget) continue;
    admitted.add(entry);
    selected += entry.triangles;
    draws++;
  }
  return { admitted, requested, selected, draws, protectedCount,
    overflow: Math.max(0, selected - settings.triangleBudget), drawOverflow: Math.max(0, draws - settings.drawBudget) };
}

export class LocationDecorationAdmission {
  constructor(scene, settings) {
    this.settings = settings;
    this.entries = [];
    this.lastPoint = null;
    scene.traverse(mesh => {
      if (!mesh.userData?.locationDecoration || !mesh.boundingSphere || !mesh.isInstancedMesh) return;
      const geometry = mesh.geometry;
      const count = geometry.index?.count ?? geometry.attributes.position?.count;
      if (!Number.isFinite(count)) return;
      // These generator-owned meshes are identity-transformed in location space.
      this.entries.push({ mesh, sphere: mesh.boundingSphere, triangles: Math.floor(count / 3) * mesh.count });
    });
  }

  dispose() {
    this.entries.length = 0;
    this.lastPoint = null;
    for (const key of ['requested', 'selected', 'draws', 'protectedCount', 'overflow', 'drawOverflow']) PerfCounters.set(`locationDecoration.${key}`, 0);
  }

  update(point) {
    if (this.lastPoint && Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y, point.z - this.lastPoint.z) < this.settings.refreshMeters) return;
    this.lastPoint = { x: point.x, y: point.y, z: point.z };
    const result = selectLocationDecorations(this.entries, point, this.settings);
    for (const entry of this.entries) entry.mesh.visible = result.admitted.has(entry);
    for (const key of ['requested', 'selected', 'draws', 'protectedCount', 'overflow', 'drawOverflow']) {
      PerfCounters.set(`locationDecoration.${key}`, result[key]);
    }
  }
}
