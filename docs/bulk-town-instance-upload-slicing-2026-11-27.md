# Bulk town instance upload slicing

Base: 30fb3b5fcddb97b947fb3d2a1cab0f2bb383c404. No GitHub Actions.

## Activation

```text
?initialInstanceUploadSlicing=1&slicedInstancePublication=1&townDecorationAdmission=1&rendererAdmissionBudget=1&spatialPerformanceOverlay=1
```

Existing flags and YAML slice limits are reused. Defaults unchanged. First-use and resident slicing can be enabled independently. Opted-in WebGPU towns use storage-backed matrices; WebGL/disabled towns retain ordinary attributes.

## Implementation

- TownMesh uses direct storage-backed matrices when either slice flag is enabled on WebGPU. Packed instance colors remain ordinary vec3 attributes (storage vec3 would be padded). Initial staging uses the existing shared geometry uploader via explicit stagedDrawPublication for detached town roots; compatible colors join the same queue.
- Bulk interior subsets and near/far decoration selections use a CPU-only InstancePublicationPlan above the existing slice threshold. They share one scratch owner, write-byte allowance, memory limit, copy-range limit and commit. Counts, slot mappings, visibility and CPU rows remain unchanged until copy submission. Near/far selections commit together per module. Small or ineligible transactions retain the existing sparse writer and admission.
- Stale decoration requests are checked during staging and before copy submission. Cancellation releases scratch without publishing. The existing WAIT_FOR_TOWN_PUBLICATION scheduling boundary is reused. Animated door modules retain conventional resident writes. Per-placement split city updates and initial offline split are unchanged.
- Counters: townSlicedPublicationCommits, townSlicedPublicationFallbacks and existing scenerySlice/initialInstance counters.

## Limits and TODO

Requires initialized WebGPU, shared deferred budget and streamed draw preparation for first use. Uninitialized resident targets, unsupported layouts, pending writes, capacity and device failures can fall back. Individual allocation, shader compilation, final copies and previous-motion buffer costs are not hard capped. The scratch path can increase temporary memory/latency. Procedural settlement prototype tiers already use direct matrices and staged draw publication; SettlementSelection resident writes remain on bounded classification slices, including potentially large rebases. Merged procedural interiors, paving and skyline are outside this change. TODO: extend resident publication to those producers after validating rebase/retirement lifecycle. No hardware acceptance claimed.

## Verification

```sh
npm ci
node --test test/sliced-instance-publication.test.js test/staged-geometry-uploads.test.js test/towns/town-sparse-publication.test.js test/towns/town-budgeted-tier-publication.test.js test/town-decoration-admission.test.js test/settlement-tier-publication.test.js
npm run lint
npm test
npm run build
```

Compare identical headed WebGPU routes with flags disabled, initial slicing only, resident slicing only and both. Visit untouched cities, split boundaries, large interior/furniture selections, decorations, animated doors, rapid reversals, teleport/unload during scratch upload and low shared budget. Verify coverage, seed colors, shadows, motion vectors, collision alignment, no validation errors, cancellation and scratch/detached memory. Record frame tails, upload bytes, draw preparation latency and GPU timings. Repeat forced WebGL. Full npm and hardware validation pending.
