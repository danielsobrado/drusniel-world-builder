# Initial instance buffer upload slicing

Starting main: d8cea2dc0da035ccf0564eb55b252a6c8abfd5cd. The intervening world-surface PR9 commit (foliage and impostor bark lighting, sky and ambient improvements, QA captures) is retained. No GitHub Actions.

## Activation

```text
?initialInstanceUploadSlicing=1
?initialInstanceUploadSlicing=1&slicedInstancePublication=1&rendererAdmissionBudget=1
```

```yaml
initialInstanceUploadSlicing: false
initialInstanceUploadBudget:
  sliceBytes: 262144
  maxDetachedBytes: 33554432
  maxAllocationsPerFrame: 2
  maxRestarts: 3
```

Independent opt-in. Requires the existing streamed draw preparation to be enabled and an initialized WebGPU backend. The previous resident-update slicing flag is not required. Keep both off by default until hardware acceptance.

## Why extend the existing path?

StagedGeometryUploads already slices detached first-use geometry/index buffers and direct storage matrices when individually at least 256 KiB. BudgetedAttributeInitialization handles special meadow attributes. StreamedDrawPreparation owns draw readiness, preparation passes, GPU upload estimates, a shared deferred-work/byte reservation, and gameplay visibility. Do not duplicate these paths.

A newly active pool can still have many smaller instance attributes whose aggregate upload is expensive. An initially unused pool can be marked prepared after initial-scene warmup despite the direct matrix not being resident. New near/proxy/scenery pools also need explicit first-use registration before entering gameplay draws.

## Changes

- InitialInstancePreparation tracks storage-backed scenery meshes created by StylizedLodRuntime, via weak renderer/mesh bindings. After a count publication, register an unprepared positive-count mesh with its renderer's StreamedDrawPreparation. Covers ordinary and lazy tree near/proxy/fallback pools, canopy clusters, understory, rocks, snow caps, bushes and other users of the same instanced renderer factory/writer. No additional scene traversal per frame. Registration is deduplicated by the existing pending set.
- When the optional mode is active, initial-scene marking preserves already warmed pools with resident direct matrices, but does not claim unallocated storage matrices are prepared. Unused pools stay dormant. Discovery likewise avoids enqueuing an empty direct pool. Explicit material preparation keeps its own ownership.
- An unfinished first-use pool that returns to zero count cancels its detached staging and stays invisible, unless an explicit staged material request still owns the job. Existing idle retirement and renderer disposal release tracked jobs. Other warmup requests are unaffected. The existing hidePending/revealPending and isolated preparation pass control visibility.
- StagedGeometryUploads includes all compatible nonempty instance vertex attributes on storage-backed InstancedMesh objects, plus direct storage matrices, even below the old individual-size threshold. Large compatible static geometry and index buffers continue using the existing staging path. Small static geometry and standard derived/interleaved instance matrix/color paths are left on conventional preparation. Storage vec3 layouts and other repacked/unsupported attributes are not staged by the direct adapter.
- The new optional configuration reduces the whole streamed preparation local upload slice to 256 KiB; existing meadow, texture and geometry stages share the allowance and DeferredWorkBudget.remainingUploadBytes. Detached geometry writes use four-byte-aligned byte ranges, including padding for odd Uint16 indices. The counter counts actual aligned writeBuffer payloads. No separate new uploader or extra duplicate resident GPU allocation.
- Allocate at most two detached geometry buffers per beginFrame across preparation jobs, with 32 MiB maximum tracked detached allocation bytes. This cap also applies to existing staged static geometry when the flag is active. The allocations themselves are indivisible GPU allocations. The staging memory cap is not a bound on all resident/driver-in-flight memory.
- Detached buffers are not installed into Three's attribute map until complete. If the CPU version or same-size array changes, reuse the detached allocation and restart its upload at zero, up to three restarts per attribute. Invalid layout/size changes, device mismatch, capacity exhaustion and excessive churn abandon detached staging and use conventional first-draw preparation. Removed attributes are released. Normal Three allocation wins over a detached copy. Before adoption recheck version, array, device, size and existing buffer; use Three's attribute manager to establish normal accounting and disposal ownership. Clear dirty ranges only for the adopted matching version. Preserve existing legacy behavior when the flag is off, including version-change replacement allocations.
- Once a mesh's sliced buffers are complete, perform its existing isolated zero-geometry preparation pass before gameplay visibility. Limit one newly staged mesh per preparation draw batch when active to avoid duplicate pending shared geometry adoption. An aged reservation estimates the remaining unsliced work plus the configured slice. After fallback it reserves the conventional estimate to avoid starvation. Do not bypass the existing draw-cost or shared upload admission.

## Scope and limitations

This is a first-use **upload** improvement for eligible registered runtime meshes. It does not defer the startup scene warmup, change initial CPU typed-array creation, split a single GPU createBuffer, guarantee all shader compilation is asynchronous, or provide a strict physical upload cap for the entire renderer. CPU/GPU allocation, textures without slicing support, ordinary InstancedMesh matrices and colors, unsupported attributes, capacity/mutation fallback, shader compilation, and the existing oversized publication exception can still cause first-use spikes.

A pending newly active mesh is hidden until ready, as with the existing streamed preparation. It does not retain the old LOD representation until all replacement meshes are prepared; fast movement can show delayed scenery or LOD holes. Verify this visually, especially with regionalLazyTrees=1 and a constrained budget. No changes to scene collision, navigation, authored placements, bounds, materials, shader algorithms or LOD selection. No new global budget across all allocation types.

GPU tree impostor record buffers can be created by compute before a normal draw; that first-use path is not included. Town standard matrix/color bindings are not assumed direct, and existing skipWarmup ownership remains unchanged. Initial town preparation, bulk town decoration changes, terrain textures and cave location initialization need separate contracts. The previous slicedInstancePublication feature covers eligible resident changes; it remains independent. Both may operate in one frame against the same shared publication allowance. Private Three.js r187 backend/attribute manager APIs require real browser validation and re-verification after dependency upgrades.

## Diagnostics

- initialInstanceSlicedBytes: actual aligned detached geometry write payload (all staged geometry under the optional mode).
- initialInstanceAllocations, initialInstanceAdoptedBuffers: detached allocations and adoption counts.
- initialInstanceDetachedBytes: current tracked detached allocation gauge.
- initialInstanceRestarts, initialInstanceDormantCancellations: discarded progress and inactive pool cancellation.
- initialInstanceFallbacks and initialInstanceFallback.{layout,capacity,mutation,device}: explicit opt-out reasons.
- Existing stagedGeometryAllocationBytes, stagedGeometryUploadBytes, streamedDrawInitialUploadBytes and framePublicationUploadBytes remain authoritative for their existing counters. Do not add diagnostic counters to shared upload accounting a second time.

## Verification

15 isolated checks passed: three existing staged-geometry regression cases, six new detached-buffer cases and six new registration/configuration cases. Executed exact committed source logic using mocked Three geometry/attributes, renderer/backend and GPU buffers, URL parsing and unused texture warmup dependency. Covers odd index padding, legacy source restart, normal publication precedence, small instance attributes, direct storage eligibility, shared allocation limit, same-size source mutation, capacity/mutation fallback, removed attributes, dormant/active/warmed registration, hidden readiness, cancellation, explicit material request ownership, renderer isolation, WebGL/disabled path and validated independent flag.

Full npm test suite, lint, production build, browser visual checks and actual device validation were not performed. The tests are committed with normal Three.js imports for local execution.

```sh
npm ci
node --test test/staged-geometry-uploads.test.js test/initial-instance-preparation.test.js test/sliced-instance-publication.test.js
npm run lint
npm test
npm run build
```

Compare same final SHA, identical seeds, routes, resolution, quality settings, browser/driver, backend, and viewport focus. First run with all features off, then first-use mode alone, then resident slicing alone, then both and renderer admission. Keep existing streamed draw preparation enabled. Use lazy tree prototypes and previously unvisited regions. Record first visit and revisit separately; do not conflate warmup with runtime.

| Scenario | Acceptance |
| --- | --- |
| Previously unused forest/rock/bush prototype | Compatible buffers stage before first gameplay draw; no partial transforms/fades or corrupted material attributes |
| Many small instance buffers | Aligned sliced payloads respect local/shared allowance; allocation count <= configured limit |
| Resident revisit | Existing ready pools do not enter another first-use job |
| Lazy tree pool, rock snow caps, canopy clusters | No missing instances, incorrect shadow/appearance, persistent holes or excessive publication delay |
| Rapid camera movement, teleport, prototype retirement | Dormant/canceled jobs release detached storage; no stale adoption or stranded pending mesh |
| Continuous source changes | Same-size restarts reuse allocation; bounded churn fallback remains visible once conventionally prepared |
| Shared static geometry | No duplicate adopted storage or destruction of resident buffers |
| Low memory cap | Fallback counted; no hidden mesh stuck forever |
| WebGL or flag off | Existing normal draw/geometry preparation path |
| Repeated entry/exit, device loss, disposal | No detached leaks, validation errors or duplicate GPU upload |
| Actual performance | Compare P50/P95/P99/P99.9, max allocation/first-draw CPU time, host upload bytes, fallback count, render-context timings and VRAM |

Reject persistent missing scenery, severe pop-in, device validation failures, invalid resources or frame-tail regressions. Quantify both reduced upload spikes and first-use display latency before enabling.

## Remaining work

- TODO: retain prior LOD until replacement draw preparation finishes, with bounded residency and fallback.
- TODO: compute-created impostor buffer initialization, bulk settlement decoration/interior publication and standard instance matrix/color ownership.
- TODO: first-use texture and shader costs, actual GPU feedback on far shadows/reflections, complete diagnostics and hardware calibration.
