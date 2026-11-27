# Underground surface GPU reclamation — reversible texture stage

Base: 1cc6ae93fb3ff28d1b92406939cb86dd08aa3045. No GitHub Actions.

## Activation

```text
?locationSurfaceReclamation=1
```

Independent of cave geometry streaming. Off by default. Only the pinned Three r187 WebGPU texture lifecycle is supported.

## Ownership and lifecycle

The world frame loop already stops while a location is active. After a successful entry and five seconds of dwell, sample every 500 ms. Consider only explicit CPU-backed terrain slot tile, height, mask and forest-floor textures, plus water slot field, flow, appearance and obstacle textures. Skip render targets, storage textures, mipmapped textures, unknown layouts, loading slots, pending preparation and textures shared by a protected slot. Protect the return anchor using distance to the slot footprint, not just its center. Keep the original canonical anchor across linked location transitions.

Retire up to four textures per sample, farthest first, capped at 32 MiB of source payload. The Three texture disposal event releases renderer resources and invalidates bind groups; CPU arrays and slot references are unchanged. No material or visibility changes. Actual GPU allocation bytes may differ from source payload due to format conversion, alignment, and backend accounting.

On exit stop retirement and restore tracked textures nearest first behind the loading screen, before swapping to the surface. Use renderer.initTexture on current CPU data with at most four textures and 2 MiB of source payload per scheduling batch. No texture larger than the restore byte target is retired. A frame yield separates batches. Aborting the transition on runtime teardown prevents additional uploads; an ordinary restore failure falls back to the normal renderer first-use upload path. A device loss leaves recovery to the existing recovery path. No strict GPU completion fence or CPU time guarantee is added.

The cave scene remains active during warmup, so the peak during return can include both cave allocations and restored surface allocations. No guarantee of lower exit latency. Only committed surface slot textures are targeted: geometry shared by slot bounds wrappers must never be disposed independently, and GPU-produced textures cannot be restored by copying CPU data.

## Configuration

```yaml
locationStructureBudget:
  surfaceReclamationEnabled: false
  surfaceProtectMeters: 192
  surfaceIdleMs: 5000
  surfaceSampleMs: 500
  surfaceEvictionsPerSample: 4
  surfaceMaxEvictedBytes: 33554432
  surfaceRestoreBytesPerFrame: 2097152
  surfaceRestoresPerFrame: 4
```

Counters: locationSurface.evictions, locationSurface.evictedBytes, locationSurface.pendingTextures, locationSurface.pendingBytes, locationSurface.restores, locationSurface.restoredBytes, locationSurface.restoreFailures.

## Acceptance

```sh
npm ci
node --test test/location-surface-residency.test.js
npm run lint
npm test
npm run build
```

Seven tests cover dwell and limits, return order, pending and shared protection, linked entry, cancellation, fail-open errors, configuration. Browser validation must compare identical routes with flag off and on: enter from dry and coastal terrain, wait > 5s, travel through linked locations, return and revisit. Record renderer memory, source-payload counters, GPU/CPU frame tails, return time, screenshots, vegetation and water field integrity. Test quick return, failed entry, disposal during return and device loss. Compare actual accounting before/during/after. Do not assume 32 MiB savings; eligible resident textures may be smaller or all protected.

## Remaining

TODO: owner-specific retirement for inactive vegetation and rock pages, including CPU-authoritative instance state and GPU compute regeneration.
TODO: town resource ownership and restore integration, GPU-generated terrain bake textures, ocean FFT state, reflection targets and atmospheric resources. Avoid blanket scene disposal or releasing shared geometry attributes.
TODO: profile peak cave entry memory; this stage starts after successful entry and does not reclaim resources during cave preparation.

## Meadow instance buffer extension

Enable with both `locationSurfaceReclamation=1` and `locationSurfaceMeadowReclamation=1`. This is opt-in separately from textures. Meadow pages expose owner enumeration; only `instancePosition`, `instanceRotation`, `instanceData`, and `instanceTile` packed float vertex attributes are eligible. CPU page slots, counts, tile order, and shared template position/UV/profile/index buffers remain intact. No storage or indirect buffers. Pending draw-preparation or publication pages are excluded. The nearest canonical tile footprint controls page protection (`surfaceMeadowProtectMeters: 32`); any near tile protects the whole page. The existing texture reclamation and meadow attribute eviction share the same total source-payload cap, sample count and restoration batch limits. Restore uses the pinned Three r187 attribute manager to recreate complete individual buffers and clear stale update ranges. It does not perform a render, or publish an incomplete buffer. Each eligible attribute must fit within the restore byte budget. The manager invalidates vertex-state generations when buffers are destroyed. Restore rechecks live ownership between batches. Counters: `locationSurface.meadowEvictions`, `locationSurface.meadowEvictedBytes`, `locationSurface.pendingMeadowAttributes`, `locationSurface.meadowRestores`, `locationSurface.meadowRestoredBytes`.

Run `node --test test/location-meadow-residency.test.js test/location-surface-residency.test.js`. Compare grass blade and card visibility, tile ranks/fades and floating-origin behavior before and after exit. Test with draw preparation and initial upload slicing enabled and disabled. Check GPU validation, memory and upload/frame tails. The 32 MiB cap is shared, not additional. Full test suite and real GPU validation remain pending. Tree/rock pools, compute-backed impostor buffers and other resource owners are not changed.

## Scenery instance buffer extension

Enable with `locationSurfaceReclamation=1&locationSurfaceSceneryReclamation=1`. Meadow reclamation remains independently configurable. The existing surface coordinator enumerates explicit tree near/proxy/fallback/cluster/understory, rock near/proxy/snow-cap, and bush near/proxy instance pools. It also enumerates CPU impostor batches and their CPU reflection companions. Only CPU-written packed float instance attributes and direct storage mat4 instance matrices qualify. Static prototype/index buffers, arbitrary node attributes, compute-backed impostors and indirect buffers are excluded. Storage matrices are restored as STORAGE, not VERTEX. Three's attribute generations allow bind groups to refresh following retirement.

Pool bounds are measured in canonical coordinates using the instance anchor. Unknown or invalid bounds protect the entire pool. Empty scatter pools are eligible; a pool intersecting the 64 m scenery protection radius is retained in full. CPU impostors use all source record positions and radii, not just the last camera's compacted draw count. Pending draw preparation and staged/queued scenery rebuilds are protected. No per-instance GPU suballocation, geometry disposal, or regeneration. Individual buffers exceeding the existing restore batch byte limit are excluded. Shared cap and batch targets are unchanged.

Counters: locationSurface.sceneryEvictions, locationSurface.sceneryEvictedBytes, locationSurface.pendingSceneryAttributes, locationSurface.sceneryRestores, locationSurface.sceneryRestoredBytes.

Run `node --test test/location-scenery-residency.test.js test/location-meadow-residency.test.js test/location-surface-residency.test.js`. Test forest and rock-heavy entrances, floating origin shifts, zero-count pools, linked caves, active LOD handoffs, CPU/GPU impostor modes and reflection companions. Compare before/after matrices, dither, tint, snow, morphology, visibility and GPU validation errors. Record renderer-accounted memory and actual GPU frame tails; global pools may span the protected radius and remain resident. No guaranteed savings. GPU compute impostor lifecycle, spatial subdivision of global scenery pools, town and ocean resources remain separate work. Full build and hardware acceptance required before enabling by default.

## GPU impostor suspension and regeneration

Enable with `locationSurfaceReclamation=1&locationSurfaceGpuImpostorReclamation=1`. Separately opt-in from CPU scenery and meadow reclamation. The GPU impostor owner publishes a conservative canonical XZ bound alongside each complete record publication; no full-record scan during underground sampling. The existing scenery protection radius protects overlapping batches. Only explicitly named packed storage inputs (transform, parameters, appearance, frustum planes), visible-index output and indirect draw arguments are eligible. Pending compute, draw preparation and tree publication are protected. Large buffers beyond the existing restoration batch target are excluded.

Before any buffer retirement, invalidate the batch's cull result and hide its draw. CPU record data, materials, atlas, geometry, compute graph and uniforms remain intact. Restore storage and indirect allocations using the pinned Three manager with the appropriate attribute type. The restored visible indices and indirect count are not authoritative. On the first applicable surface camera update, submit reset and cull synchronously (not deferred into the shared compute list) and reveal only after successful submission. Empty batches submit reset only. Subsequent record publication cannot reveal an invalid draw prematurely. No GPU readback. A warmup failure falls back to regular compute/binding initialization; visibility remains guarded. The first surface update may incur mandatory compute dispatches, and restored allocations are not fenced for GPU completion.

Counters: locationSurface.impostorEvictions, locationSurface.impostorEvictedBytes, locationSurface.pendingImpostorAttributes, locationSurface.impostorRestores, locationSurface.impostorRestoredBytes, locationSurface.impostorRegenerations.

Run `node --test test/location-gpu-impostor-residency.test.js test/location-scenery-residency.test.js test/location-meadow-residency.test.js test/location-surface-residency.test.js`. In real WebGPU, compare before/after cull counts and screenshots for unchanged and changed camera, zero-record batches, rebases, linked locations and pending tree publication. Check draw-argument and visible-index regeneration, bind-group validation, memory and first surface frame. Test with initial instance upload slicing enabled/disabled and with CPU reflection companions. No GPU acceptance yet. Town architecture, GPU terrain bake, ocean, reflections and atmosphere remain separate phases.
