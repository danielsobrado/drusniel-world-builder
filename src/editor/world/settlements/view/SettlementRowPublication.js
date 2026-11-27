import { InstanceAnchor } from '../../../stylized/lod/InstanceAnchor.js';
import { InstancePublicationPlan, admitSceneryPublication } from '../../../stylized/lod/InstancePublicationPlan.js';
import { iterateInstanceWrites, writeInstances } from '../../../stylized/lod/StylizedLodRuntime.js';
import { ITERATOR_PENDING } from '../../../stylized/ResumableIterator.js';
import { PerfCounters } from '../../../performance/qa/PerfCounters.js';

function markPublished(rows, band, tier, version, proposed, origin) {
  rows.published[band] = { tier, version };
  const anchor = rows.tiers.get(tier) ?? new InstanceAnchor();
  anchor.x = proposed.x; anchor.z = proposed.z;
  rows.tiers.set(tier, anchor);
  for (const mesh of tier.meshes) anchor.place(mesh, origin);
}

/** Desired rows may advance before a cancellable publication; published versions never do. */
export function* publishSettlementRows(view, key, changes, budget = null) {
  const rows = view.rows.get(key);
  if (!rows || rows.entry.state !== 'ready') { view.rows.delete(key); return true; }
  const entry = rows.entry;
  const plan = rows.storage.patch(changes, 0);
  const proposed = rows.anchor.proposed(view.origin);
  const rebased = proposed.x !== rows.anchor.x || proposed.z !== rows.anchor.z;
  const sliced = Boolean(budget?.settings?.enabled && budget.slicedInstanceUploads);
  const selections = [];
  for (const band of ['near', 'far']) {
    if (band === 'far' && !entry.far) continue;
    const instances = plan.buckets[band];
    const tier = view.pool.tier(entry, band, instances.length, sliced);
    const previous = rows.published[band];
    const changed = rebased || previous?.tier !== tier || previous.version !== plan.signatures[band];
    const partial = !rebased && previous?.tier === tier && previous.version === plan.baseVersions[band];
    selections.push({ band, tier, instances, changed, dirty: partial ? [plan.changedRows[band]] : null });
  }
  if (!sliced) {
    rows.anchor.x = proposed.x; rows.anchor.z = proposed.z;
    for (const { band, tier, instances, changed, dirty } of selections) {
      if (changed) {
        writeInstances([tier.meshes], [instances], proposed, dirty);
        markPublished(rows, band, tier, plan.signatures[band], proposed, view.origin);
      } else for (const mesh of tier.meshes) rows.tiers.get(tier).place(mesh, view.origin);
      // A held growth may survive cancellation or a configuration change.
      view.pool.publications?.completeRows(tier);
    }
    return true;
  }

  const isCurrent = () => !view.disposed && view.enabled !== false && view.rows.get(key) === rows
    && rows.entry === entry && entry.state === 'ready' && selections.every(({ band, tier }) => entry[band] === tier);
  const changed = selections.filter(selection => selection.changed);
  if (!changed.length) {
    for (const { tier } of selections) for (const mesh of tier.meshes) rows.tiers.get(tier).place(mesh, view.origin);
    return true;
  }
  // Warm hidden replacement pools before staging rows. Old capacity tiers remain live.
  while (isCurrent() && changed.some(({ tier }) => tier.publication && !tier.publication.prepared)) {
    PerfCounters.inc('settlementTierPreparationWaits');
    yield ITERATOR_PENDING;
  }
  if (!isCurrent()) return false;
  const publication = new InstancePublicationPlan();
  for (const { tier, instances, dirty } of changed) {
    yield* iterateInstanceWrites([tier.meshes], [instances], proposed, dirty, publication);
    if (!isCurrent()) return false;
  }
  const uploaded = yield* budget.slicedInstanceUploads.stage(publication, () => budget, isCurrent);
  if (!isCurrent()) return false;
  if (!uploaded) yield* admitSceneryPublication(() => isCurrent() ? budget : null, () => publication.bytes());
  if (!isCurrent()) return false;
  publication.commit(uploaded);
  rows.anchor.x = proposed.x; rows.anchor.z = proposed.z;
  for (const { band, tier, changed: dirty } of selections) {
    if (dirty) markPublished(rows, band, tier, plan.signatures[band], proposed, view.origin);
    else for (const mesh of tier.meshes) rows.tiers.get(tier).place(mesh, view.origin);
  }
  for (const { tier } of selections) view.pool.publications?.completeRows(tier);
  PerfCounters.inc('settlementRowPublicationCommits');
  if (uploaded) PerfCounters.inc('settlementSlicedPublicationCommits');
  return true;
}
