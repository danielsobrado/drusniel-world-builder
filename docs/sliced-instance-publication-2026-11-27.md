# Byte-exact sliced instance publication

Starting main: 0eb364df17aa54d91cd2be87a5cc70bac7ddc47c. Three intervening world-surface and tree-impostor commits since measured GPU admission were retained. No GitHub Actions.

## Activation

```text
?slicedInstancePublication=1
?slicedInstancePublication=1&rendererAdmissionBudget=1&spatialPerformanceOverlay=1
```

```yaml
slicedInstancePublication: false
instanceSliceBudget:
  sliceBytes: 262144
  maxStagingBytes: 16777216
  maxCopyRanges: 8192
  maxWritesPerSlice: 64
```

The independent feature enables the existing staged scenery publication path for trees, rocks and bushes. Shared deferred-work/upload budgeting must be enabled. The previous regionalInstancePublicationBudget flag is not additionally required. Defaults remain off pending hardware acceptance.

## Implementation

Previously one large publication could pass canPublish's oversized exception and upload a large dirty span in one frame. Simply splitting writes to live buffers would expose inconsistent matrices, fades, surface and appearance fields, bounds, counts and anchors.

InstancePublicationPlan continues to prepare dirty rows in CPU pages. For an eligible oversized plan, SlicedInstanceUploads:

1. Validates all patched attributes against the initialized r187 renderer attribute map and WebGPU backend data. Requires resident identity-mapped unpadded Float32 attributes with StaticDrawUsage, matching CPU/GPU attribute version, no pending ranges, exact GPU buffer size, COPY_DST usage and unmapped state. The matrix storage-buffer path and existing GPU impostor inputs are candidates; uninitialized or derived buffers are not assumed safe. No new geometry or shader variant.
2. Packs exact changed rows into one scratch buffer; adjacent source and destination runs merge. Holes are not reuploaded. The full transaction must fit the staging and copy-command bounds. The shared scratch owner serializes transactions; preparation yields per CPU patch page.
3. Writes scratch slices with queue.writeBuffer, at most 256 KiB and 64 calls per shared frame, and never beyond the remaining DeferredWorkBudget allowance. Every payload byte is charged once to publicationCustomAttributeBytes and scenerySliceUploadedBytes. Four-byte granularity permits splitting within a page. No oversized exception for scratch writes. No live GPU attribute, draw count, CPU row or bounds changes during staging.
4. Rechecks buffer identities, versions, device and budget before submitting a single encoder containing scratch-to-live GPU copies, then publishes CPU mirrors and existing finalizers synchronously in the same scheduler step. Queue ordering preserves the old buffer contents for earlier submitted draws. Buffer and attribute identities are retained; no cached bind group swap. Do not mark the copied attributes dirty again: the GPU copy already carries the new rows. Final GPU copy bytes are counted separately, not double charged as host upload.
5. Releases scratch after submission or cancellation. StagedViewRebuild cancels abandoned generators on focus/prototype/revision changes and disposal so their finally blocks release resources. No live publication during a canceled scratch stage. If eligibility or destination state fails, fall back to existing publication; synchronous GPU staging exceptions disable further slicing for that adapter and fall back. No explicit wait on GPU completion.

The adapter uses private r187 backend and renderer attribute interfaces, as other renderer integrations do. Validate on the pinned Three.js revision and reverify on upgrades. CPU patch copying/finalizers and GPU copy encoding/submission are still atomic at the end; up to maxCopyRanges copy commands and maxStagingBytes device-local copies can remain expensive. Scratch allocation adds temporary GPU memory; the cap is per live shared staging transaction, not a hard bound on driver-retained in-flight memory. CPU scratch pages also consume memory.

## Scope and fallback

- Trees, near/proxy rocks, bushes and the compatible GPU tree impostor record attributes use the new path if all touched attributes qualify. Auxiliary/CPU impostor finalizers and camera-driven uploads are not sliced here. Rock snow-cap synchronization added by concurrent work is preserved and can issue additional uploads.
- First-time GPU attribute creation, WebGL, derived interleaved matrix buffers, dynamic/padded/dirty attributes, oversized scratch or copy lists and invalidated transactions retain the normal publication path, including its existing oversized allowance. This is not a renderer-wide strict physical upload cap.
- Towns are deliberately unchanged: ordinary split updates already publish per placement with both tiers coherent, and TownMesh uses standard InstancedMesh matrices rather than the proven scenery StorageInstancedBufferAttribute path. Town decoration/interior bulk selections and first-time town preparation require their own residency-safe integration; do not assume the backing GPU buffer is the CPU matrix attribute.
- Terrain, geology, meadow buffers, textures and other publication types keep their existing policies. Hardware asynchronous validation/device loss and other unrelated renderer uploads are not covered by the local byte counter. No FPS or latency gain claimed.

## Diagnostics

scenerySliceUploadedBytes, scenerySliceGpuCopyBytes, scenerySliceCommits, scenerySliceCopyRanges, scenerySliceDeferred, scenerySliceFallbacks, scenerySliceInvalidated, scenerySliceFailures, scenerySliceAbandoned enter the QA counter report. scenerySliceStagingBytes is a current staging-allocation gauge. Existing framePublicationUploadBytes includes the scratch host bytes via publicationCustomAttributeBytes. Compare upload and final GPU-copy costs separately. A nonzero fallback count indicates a plan did not receive strict slicing, not necessarily a rendering failure.

## Validation

Nine isolated tests passed with exact committed scheduler, attribute range, plan, adapter and configuration logic plus mocked WebGPU buffers and URL parser. They verify packed sparse rows and repeated rows, 32-byte artificial test limits, shared frame allowance and single owner, old CPU/GPU values before commit, cancellation and focus changes, eligibility, stale destination fallback, staging/copy cap fallback and configuration. Full Node/npm suite, lint, build, device validation and actual WebGPU rendering were not executed here.

```sh
npm ci
node --test test/sliced-instance-publication.test.js test/scenery-instance-publication.test.js tests/attributeUpload.test.js test/scatter-instance-rows.test.js tests/viewRebuildQueue.test.js
npm run lint
npm test
npm run build
```

Use headed WebGPU on RTX 4080 and WebGL fallback with identical seed, route, resolution, quality and driver. Compare same final SHA with regionalInstancePublicationBudget=1 and slicedInstancePublication=0 versus slicedInstancePublication=1. Test the slice path alone and combined with renderer admission. Capture P50/P95/P99/P99.9, max deferred CPU unit, GPU render times, queued host bytes, scratch bytes, copy ranges, commit/fallback counts and screenshots. Inspect actual GPU data/rendering, not just CPU mirrors.

| Scenario | Acceptance |
| --- | --- |
| Dense resident forest approach/revisit | Eligible scratch upload <= configured slice and remaining frame allowance; no missing/floating trees or incompatible LOD fades |
| Large resident rock and bush updates | Matrix, biome and surface appearance match control; concurrent snow-cap behavior preserved |
| Multiple consumers compete | One scratch allocation; no double accounting, starvation or abandoned owner |
| Focus teleport / rebase / prototype replacement | Canceled scratch destroyed, prior publication retained; eventual correct anchors and bounds |
| Sparse dirty rows | Exact payload bytes instead of intervening unchanged rows |
| Final commit | No duplicate attribute upload or excessive CPU/GPU tail latency |
| First visit / lazy prototype / WebGL | Normal safe fallback; no direct copy to nonresident/derived buffers |
| Device validation / renderer teardown | No invalid buffer usage or leaked scratch; synchronous failure falls back |
| Flag off | Legacy behavior and no scratch allocations |

Require real GPU data and visual parity before enabling by default. If final copy/CPU commit still dominates, reduce transaction granularity rather than claiming upload slicing solves all hitches.

## Remaining work

- TODO: safe new-buffer initialization and first-use upload slicing; actual GPU validation of resident-copy integration.
- TODO: byte-exact town decoration/interior and initial allocation publication; adapt town matrix ownership only after shader/binding parity.
- TODO: auxiliary impostor and rock snow-cap updates, other geometry and texture uploads, exact global upload accounting and reduced final commit cost.
- TODO: measured shadow/reflection feedback, expanded spatial diagnostics and hardware calibration.
