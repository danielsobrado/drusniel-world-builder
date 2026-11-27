# Procedural settlement publication slicing

Base: fb9375ecdc111642f97d379120242c7f606dd03b. No GitHub Actions.

## Activation

```text
?initialInstanceUploadSlicing=1&slicedInstancePublication=1&rendererAdmissionBudget=1&spatialPerformanceOverlay=1
```

Use procedural settlements (not the alternative kit town renderer) and enabled deferred-work and streamed draw preparation. Existing opt-in flags and shared limits; no new budget.

## Implementation

- SettlementView receives the existing DeferredWorkBudget. Selection retains its 32-placement classification slices and stops polling on ITERATOR_PENDING.
- SettlementRowPublication retains desired dense rows and separate published versions. Stage matrix, dither, biome and bounds changes for both bands of one prototype using the existing InstancePublicationPlan, then share the single resident scratch uploader and admission gate. A missed publication forces a complete rewrite from authoritative desired rows; no deep clone per selection slice.
- Capacity growth may hold its previous tier until both draw preparation and replacement rows complete. A prepared but held tier remains detached. The old tier is disposed only after the new counts, bounds, anchor and rows commit. Multiple growth requests continue to use the existing cancellation/ownership path.
- Anchor proposals are snapshots. Old tier anchors remain in place during staging, even when the floating origin changes again. At commit, place the new anchor relative to the current origin. Ordinary small rebases remain mesh-only.
- Cancellation explicitly closes selection generators before reset or pruning, releases scratch, and invalidates sent markers for unfinished batches. Desired rows can survive a cancelled pass; published versions and anchors do not advance until commit.
- Counters: settlementTierPreparationWaits, settlementRowPublicationCommits, settlementSlicedPublicationCommits and existing shared slicing counters.

## Limits and TODO

The slice path is enabled only with a configured shared WebGPU uploader and enabled deferred budget. Other paths preserve conventional publication. Hidden capacity preparation uses existing draw readiness (including bypass), not a guarantee of actual shader compilation success. Without streamed draw preparation, growth retains legacy immediate retirement. Capacity allocation, geometry cloning, final GPU copy encoding and final CPU mirror updates are still indivisible per transaction; unsupported or not-yet-resident buffers fall back to conventional uploads. A held capacity tier can remain allocated until the next valid selection or eviction. Per-prototype near/far transactions do not promise a site-wide atomic replacement. Merged interiors, paving, skyline buffers and independent pass budgets remain outside this change. TODO: measure actual capacity/rebase hitches and investigate detached allocation slicing for large prototype construction. Hardware acceptance pending.

## Verification

```sh
npm ci
node --test test/settlement-selection-budget.test.js test/settlement-tier-publication.test.js test/settlement-view-starved-slice.test.js test/sliced-instance-publication.test.js test/staged-geometry-uploads.test.js
npm run lint
npm test
npm run build
```

Compare identical procedural town/capital approaches on headed RTX 4080 WebGPU with flags off, initial slicing only, resident slicing only and combined. Include repeated capacity growth, turn and movement during fades, rebase across anchor reach during scratch staging, another rebase before commit, site eviction/reset/disable during a pending publication, revisit and forced WebGL. Verify old tiers survive until replacement counts and anchors publish, no stale rows or lost placements, no scratch leaks, no premature skyline disappearance or GPU validation failures. Measure P95/P99/P99.9, allocation/CPU preparation spikes, shared upload bytes, memory and time-to-visible. Full npm/browser validation pending.
