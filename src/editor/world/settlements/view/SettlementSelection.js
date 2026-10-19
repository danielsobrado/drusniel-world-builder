import { InstanceLodRows } from '../../../stylized/lod/InstanceLodRows.js';
import { InstanceAnchor } from '../../../stylized/lod/InstanceAnchor.js';
import { writeInstances } from '../../../stylized/lod/StylizedLodRuntime.js';
import { PerfCounters } from '../../../performance/qa/PerfCounters.js';

const SLICE = 32;

function publish(view, key, changes) {
  const rows = view.rows.get(key);
  if (!rows || rows.entry.state !== 'ready') { view.rows.delete(key); return; }
  const plan = rows.storage.patch(changes, 0);
  const x = rows.anchor.x, z = rows.anchor.z;
  rows.anchor.follow(view.origin);
  const rebased = x !== rows.anchor.x || z !== rows.anchor.z;
  for (const band of ['near', 'far']) {
    if (band === 'far' && !rows.entry.far) continue;
    const instances = plan.buckets[band];
    const tier = view.pool.tier(rows.entry, band, instances.length);
    const previous = rows.published[band];
    if (rebased || previous?.tier !== tier || previous.version !== plan.signatures[band]) {
      const partial = !rebased && previous?.tier === tier && previous.version === plan.baseVersions[band];
      writeInstances([tier.meshes], [instances], rows.anchor, partial ? [plan.changedRows[band]] : null);
      rows.published[band] = { tier, version: plan.signatures[band] };
      const anchor = rows.tiers.get(tier) ?? new InstanceAnchor();
      anchor.x = rows.anchor.x; anchor.z = rows.anchor.z; rows.tiers.set(tier, anchor);
    }
    for (const mesh of tier.meshes) rows.tiers.get(tier).place(mesh, view.origin);
  }
}

/** Bounded classification and row publication. Unvisited placements keep their
 * last complete instance; no whole-town buffer comparison on every fade frame. */
export function* settlementSelectionJob(view, focus, timestamp, settings) {
  const seen = new Map(), pending = new Map();
  let fading = false, shown = 0, buildings = 0, props = 0, units = 0;
  const flush = function* () {
    for (const [key, changes] of pending) { publish(view, key, changes); yield; }
    pending.clear();
  };
  for (const site of view.sites.values()) {
    if (!site.surfaces) continue;
    const source = { style: site.plan.profile.style, kind: '', variant: 0, surfaces: site.surfaces };
    for (const [index, placement] of (site.placements ?? []).entries()) {
      const id = `${site.id}:${index}`, distance = Math.hypot(placement.x - focus.x, placement.z - focus.z);
      const range = placement.small ? settings.smallRange : settings.farRange;
      // Elapsed wall time per placement keeps fade speed independent of how
      // many frames the town's classification needs.
      const fadeStep = placement.selectedAt === undefined ? 0
        : Math.max(0, Math.min(settings.fadeSeconds, (timestamp - placement.selectedAt) / 1000)) / settings.fadeSeconds;
      placement.selectedAt = timestamp;
      let entry = null;
      if (distance <= range + 20 || placement.shown > 0) {
        source.kind = placement.kind; source.variant = placement.variant;
        entry = view.pool.request(placement.key, source, distance);
      }
      if (entry?.state === 'ready') {
        const wantNear = !entry.far || distance < (placement.blend > .5 ? settings.nearOut : settings.nearIn);
        const blend = Math.max(0, Math.min(1, placement.blend + (wantNear ? fadeStep : -fadeStep)));
        const visible = Math.max(0, Math.min(1, placement.shown + (distance < range ? fadeStep : -fadeStep)));
        fading ||= blend !== placement.blend || visible !== placement.shown;
        // A newly prepared placement must get a second evaluation to start its fade.
        fading ||= visible < 1 && distance < range;
        placement.blend = blend; placement.shown = visible;
        let rows = view.rows.get(placement.key);
        if (!rows) {
          rows = { entry, storage: new InstanceLodRows(['near', 'far']), anchor: new InstanceAnchor(), published: {}, tiers: new Map() };
          view.rows.set(placement.key, rows);
        }
        rows.entry = entry;
        if (!seen.has(placement.key)) seen.set(placement.key, new Set());
        seen.get(placement.key).add(id);
        const representations = [];
        if (visible > 0 && (!view.culls || view.inView(placement))) {
          for (const [band, fade, direction] of [['near', visible * blend, 1], ['far', visible * (1 - blend), -1]]) {
            if (fade <= 0 || band === 'far' && !entry.far) continue;
            representations.push({ ...placement[band], band, fade, objectId: id,
              quantizedFade: Math.fround(fade), ditherDirection: direction });
          }
          shown++; if (index < site.plan.buildings.length) buildings++; else props++;
        }
        if (!pending.has(placement.key)) pending.set(placement.key, new Map());
        pending.get(placement.key).set(id, representations);
      }
      PerfCounters.inc('settlementPlacementsEvaluated');
      if (++units % SLICE === 0) { yield* flush(); yield; }
    }
  }
  yield* flush();
  // Eviction and culled/unready placements retire locally, under the same slices.
  for (const [key, rows] of view.rows) {
    if (rows.entry.state !== 'ready') { view.rows.delete(key); continue; }
    const inspected = new Set(), remove = new Map();
    for (const band of ['near', 'far']) for (const id of rows.storage.indices[band].keys()) {
      if (!inspected.has(id)) {
        inspected.add(id);
        if (!seen.get(key)?.has(id)) remove.set(id, []);
      }
      // Scan retained IDs under the same budget, even when none need removal.
      PerfCounters.inc('settlementRetirementRowsChecked');
      if (++units % SLICE === 0) {
        if (remove.size) { publish(view, key, remove); remove.clear(); }
        yield;
      }
    }
    if (remove.size) { publish(view, key, remove); yield; }
  }
  view.visibleBuildings = buildings; view.visibleProps = props;
  PerfCounters.set('settlementInstances', shown);
  return fading;
}

/** Rebase roots at mesh granularity; their retained instance rows stay untouched. */
export function placeSettlementRows(view) {
  for (const rows of view.rows.values()) for (const [tier, anchor] of rows.tiers) {
    if (tier.meshes.every(mesh => !mesh.parent)) { rows.tiers.delete(tier); continue; }
    for (const mesh of tier.meshes) anchor.place(mesh, view.origin);
  }
}
