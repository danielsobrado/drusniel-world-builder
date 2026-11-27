# GPU impostor initialization and LOD handover

Base: 6fa97290682dc8601377fc7fbf18f266260ee9f2. No GitHub Actions.

## Activation

```text
?initialInstanceUploadSlicing=1&slicedInstancePublication=1&regionalLazyTrees=1&rendererAdmissionBudget=1&spatialPerformanceOverlay=1
```

Uses existing opt-in initial instance settings, timeout and shared deferred-work budget. Requires staged scenery publication (slicedInstancePublication or regionalInstancePublicationBudget) and enabled streamed draw preparation for the readiness gate. No new configuration values. Defaults unchanged.

## Implementation

- Register dormant GPU impostor meshes with their explicit compute storage attributes (transform, parameter, appearance, visible index, frustum planes). Only compatible packed float and uint32 scalar storage is adopted through StagedGeometryUploads. Indirect draw storage retains the normal Three INDIRECT path and is included in the conventional upload estimate.
- Share the existing byte slice, detached allocation cap, per-frame allocation count and cancellation. No second uploader. Keep the zero-record replacement hidden, and do not implicitly mark it ready during initial scene marking or discovery.
- A staged zero-to-positive record publication adds the impostor mesh to the same replacement draw set as geometry. The existing handoff lease retains the previous publication while the new buffer set is prepared. After adoption, run the reset and cull pipelines with zero live records and a one-record dispatch size, then the isolated draw preparation. Never reset an active draw. Mark readiness through the existing preparation contract; timeout or bypass uses the previous conventional path.
- After a deferred tree publication completes, refresh impostor culling with the latest camera and current floating origin when initial slicing is enabled. This avoids drawing the previous indirect selection for a frame when publication occurs after the regular camera update. This refresh is not a new compute scheduler. Normal unchanged GPU views skip culling.
- Dispose cancels pending work before disposing storage and geometry. Completed allocations remain owned by Three. Existing tree residency and cancellation contracts remain intact.
- Counters: existing sceneryLodHandoff and initialInstance counters, plus treeImpostorInitialComputePrepared.

## Limits

This is an opt-in initialization and publication improvement, not a hard guarantee of shader compilation or GPU frame time. Individual allocations, pipeline compilation, indirect storage and final live cull are atomic. Preparation may upload empty buffers before publishing real records, increasing total host bytes; the existing resident slicing path can stage those records. Timeouts, unsupported layouts/backend, preparation bypass, startup warmup, async-only compute, CPU/auxiliary impostors and non-staged writers retain their existing behavior. Shader warmup with zero records is not hardware confirmation. No per-frame GPU workgroup budget or double-buffered live cull is introduced. TODO: measure actual compute cost and add admission without drawing stale indirect selections.

## Verification

```sh
npm ci
node --test test/staged-geometry-uploads.test.js test/initial-instance-preparation.test.js test/instance-lod-handoff.test.js test/tree-impostor-empty-batch.test.js test/scenery-instance-publication.test.js test/gpu-indirect-struct-wgsl.test.js
npm run lint
npm test
npm run build
```

Use headed RTX 4080 WebGPU with identical routes, seeds, viewport, quality and driver. Test untouched lazy tree atlases, geometry-to-impostor and reverse transitions, rapid camera movement, focus cancellation, rebase, device disposal, timeout and low detached capacity. Compare enabled versus disabled; verify no stale or invalid indirect counts, no premature mesh visibility, no GPU validation errors and no pending leaks. Record upload bytes, allocation count, scratch/detached memory, frame tails, draw readiness delay and first live cull cost. Repeat forced WebGL and CPU impostor paths.

Full npm/browser/hardware validation pending.
