# Staged scenery instance publication — implementation and acceptance

Control before this phase: ba185505b0266e904ff66f1714a4b821b2b177be. Other work was committed concurrently to main (including WSC PR 6). For a clean A/B, use the same final candidate SHA with the new flag off and on, rather than treating the old branch tip as an otherwise identical control. No GitHub Actions.

## Activation

```yaml
regionalInstancePublicationBudget: false
```

Enable independently with `?regionalInstancePublicationBudget=1`, or combine with `?rendererAdmissionBudget=1&regionalInstancePublicationBudget=1`. The shared DeferredWorkBudget must be attached. There is no second upload allowance.

## Implementation

- Tree near, proxy, fallback, canopy clusters, understory and GPU impostor records, plus rock and bush near/proxy buffers, use cancellable staged publications when the flag is enabled.
- Instance comparisons use the same Float32 encoding and attribute writers as the legacy path. Dirty matrix, dither, tint, morphology, root-plane, surface, plant-root and biome-look values are prepared in 64-row slices. The staged path stores changed attribute rows in typed pages and copies contiguous runs in bulk.
- Dirty range estimation uses the same pending-range merge algorithm as actual publication, including the eight-range collapse policy. This measures **incremental queued attribute bytes**, not physical driver transfers. Existing pending ranges can be consumed between frames; recalculate the estimate at each admission attempt.
- Scatter row storage is forked only for touched prototypes, with copying and patching resumable. Live storage, matrices, draw counts, visible tiers, bounds and canonical anchor remain unchanged until commit. The old representation survives a cancelled or deferred build.
- Full and partial replacement bounding spheres are prepared from the anchor-relative float32 rows in slices; partial bounds conservatively expand previous bounds. Plant-motion padding follows the legacy writer. A geometry whose bounding sphere is unavailable uses the legacy bounds path.
- GPU impostor record attributes join the same publication plan and retain the existing cull invalidation/count logic. CPU impostor record replacement and auxiliary record selection are committed together, but their later camera-driven compaction is not byte-estimated by this plan.
- At publication, wait for the existing shared canPublish allowance before changing live data. Reuse existing attribute counters, including custom attribute bytes, so other consumers observe the publication without double counting.
- All visible changes publish atomically; row encoding, retained scatter patch construction and bounds scanning are resumable, but the final typed-array copies and dirty marking are not spread across frames. This intentionally avoids rendering a partially replaced batch. The scheduler's existing oversized-publication exception permits one oversized publication on an otherwise empty allowance. No strict hardware upload cap is claimed.

## Remaining risks

The extra temporary typed pages and forked row storage cost CPU memory and preparation turns. Profile their high-water mark and frame latency. The actual renderer may upload previously queued data or allocate an entire newly created buffer independently of the incremental estimate. GPU impostor compute/plane uploads, CPU/auxiliary impostor camera compaction, lazy pool initialization, final scatter placement-list reconstruction and renderer upload submission are outside the new staged row budget. Large atomic commits and prolonged contention may still produce spikes or delayed visibility. The existing scheduler rotates consumers, and stale focus/prototype/manifest work follows the existing cancellation behavior; measure starvation under sustained streaming. Do not enable by default until validated.

## QA counters

- sceneryPublicationEstimatedBytes and sceneryPublicationQueuedBytes
- sceneryPublicationStagedAttributeRows and sceneryPublicationCommits
- sceneryPublicationDeferred and sceneryPublicationOversizedBytes
- attributeBytesUploaded, publicationCustomAttributeBytes, treeImpostorAttributeBytesUploaded
- framePublicationUploadBytes, frameMaxDeferredUnitMs, frameDeferredUnitOverruns
- Existing scenery preparation backlog, tree/rock/bush instance counts and renderer admission diagnostics

The new counters are included in buildPerfReport's measuredCounters. Compare per-publication estimate with newly queued bytes, not aggregate physical GPU transfers. An oversized counter indicates use of the shared scheduler's escape hatch, not a successful hard-cap assertion.

## Validation

27 isolated cases passed using the exact committed JavaScript logic with mocked Three.js attributes/matrix/sphere dependencies and browser globals: 10 new publication cases, 9 existing attribute range cases and 8 existing scatter cases. The new cases cover range collapse, typed pages, byte parity, identical legacy attribute output, cancellation, shared budget rechecks, scatter cross-fades and rebase, GPU/CPU impostor publication and staged bounds.

The container has Node but GitHub DNS is unavailable; repository dependency installation and the actual Node test runner, lint, build, asset validation and hardware QA have not been completed. No measured frame-time improvement is claimed.

```sh
npm ci
node --test test/scenery-instance-publication.test.js tests/attributeUpload.test.js test/scatter-instance-rows.test.js
node --test test/renderer-admission.test.js test/regional-admission.test.js test/regional-render-cost.test.js test/regional-spatial-budget.test.js tests/treeLodCameraDistance.test.js
npm run lint
npm test
npm run build
npm run validate:assets:production
```

Run identical routes on headed WebGPU (RTX 4080) and WebGL fallback, with the same seed, backend, viewport, quality, time, camera and driver. Use the same candidate with flag off/on, then test combined renderer admission.

| Route | Acceptance |
| --- | --- |
| Dense forest approach and LOD cross-fade | No holes, stale fades, incorrect trunk/crown positions or partial tier swaps; compare bytes, CPU/GPU P95/P99/P99.9 and peak deferred units |
| Town and forest boundary under upload contention | Mandatory town/terrain work continues; staged vegetation waits; eventually converges; no accumulating rebuild backlog |
| Rock and bush streaming | Stable unchanged rows, identical placement, collision and blockers; changed rows only |
| Anchor move, rapid camera movement and teleport | Retained geometry remains in correct canonical location until complete replacement; cancelled stages do not publish |
| Culled mesh with pending ranges | No lost dirty ranges or stale GPU values when it returns |
| GPU impostors and CPU/reflection fallback | Correct record counts, indirect reset and culling; identical visual transitions |
| Small upload allowance and oversized job | Expected deferral/oversized diagnostics; no infinite starvation or partial visible publication |
| Idle and repeated revisits | No unbounded staged memory or buffer growth; compare steady residency |
| Flags off | Legacy visual output and existing test behavior remain intact |

Save candidate SHA, flags, QA JSON, screenshots and hardware profiler captures. Reject candidate-only errors, changed collision/placement, persistent visual holes, memory growth or worse frame tails. Measure final commit CPU duration and staging overhead before changing the default.

## Next work

- TODO: Introduce budgeted GPU page/double-buffer publication for truly oversized batches if measurements justify its additional memory and binding cost.
- TODO: Integrate camera-driven CPU/auxiliary impostor compaction and actual first-upload cost with the shared allowance.
- TODO: Independently admit shadow and reflection passes using measured GPU pass timings, then add adaptive distant town decorations and environmental effect costs.
- TODO: Spatial QA overlay for requested, admitted, selected and upload-deferred chunks.
