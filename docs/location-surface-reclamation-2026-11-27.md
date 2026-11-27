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

## Town and settlement reclamation

Enable with `locationSurfaceReclamation=1&locationSurfaceTownReclamation=1`. Separately opt-in. Both playable kit towns and procedural settlements are discovered through the terrain view's existing runtime owners, not a global scene scan. Kit modules contribute only direct CPU-written storage matrices; ordinary wrapped instance matrices, instance colors, shared kit geometry, door modules and pending module/selection jobs are protected. Procedural buildings contribute published tier storage matrices, dither and biome-look attributes, only when no tier replacement or selection/compile/reveal job is active. Canonical tier anchors and conservative instance spheres determine protection.

Published settlement paving, interior spatial batches and skyline massing contribute explicitly owned packed float vertex and uint16/uint32 index attributes. Site ownership is recorded at successful installation and cleared on disposal; smoke, haze, sprites, staged meshes, morphs, skinning and indirect draws are excluded. Shared kit/procedural prototype vertex and index buffers are deliberately not reclaimed. Bounds use canonical site centres plus local bounding spheres; invalid bounds protect resources. A separate `surfaceTownProtectMeters: 96` controls protection. Whole pools intersecting the return radius remain resident. The shared 32 MiB cap and 2 MiB per-batch warmup target remain unchanged. No collision ownership, door state, layout, placement or mesh visibility changes. Restore uses Three's attribute manager with matching VERTEX, INDEX or STORAGE types; normal renderer fallback remains available. Oversized indivisible buffers remain resident.

Counters: locationSurface.townEvictions, locationSurface.townEvictedBytes, locationSurface.pendingTownAttributes, locationSurface.townRestores, locationSurface.townRestoredBytes.

Run `node --test test/location-town-residency.test.js test/location-surface-residency.test.js test/location-meadow-residency.test.js test/location-scenery-residency.test.js test/location-gpu-impostor-residency.test.js`. Compare kit and procedural settlement routes separately, including far skyline, paving, interiors, door states and collision after return. Test near/far tiers, floating-origin changes, interrupted selection/compilation, unload during restore, initial instance slicing on/off and repeated visits. Measure actual renderer-accounted memory and return frame tails. No hardware acceptance yet. Shared prototype geometry, wrapped kit attributes, GPU terrain bake, ocean, reflections and atmosphere remain separate work.

## Terrain material bake, ocean FFT and water reflection suspension

Enable independently with the master `locationSurfaceReclamation=1` and any of `locationSurfaceTerrainBakeReclamation=1`, `locationSurfaceOceanFftReclamation=1`, `locationSurfaceReflectionReclamation=1`. The terrain material bake is a CPU/worker-generated page copied into slot-owned DataTextures, not an exclusively GPU-generated field. The existing texture lifecycle can therefore reclaim the six physical channels (including the shared packed analysis map once), retaining bake cache leases, current keys and blending uniforms. Distant slots only; normal size, pending and residency checks apply.

FFT suspension accepts only a validated ACTIVE runtime, switches its binding to the existing zero-slope fallback, releases the compute resources/kernels and output, and retains the spectrum/weather and controller. The next ocean-visible prepare reconfigures and transforms at absolute water time; publication waits for first-dispatch validation. No unnecessary reconstruction on an inland exit. Device loss listeners are registered once per observed device; stale validation callbacks cannot overwrite a later configuration.

The local water reflection controller invalidates cube and planar validity, clears partial face progress, switches bindings to tiny matching render-target fallbacks and disposes both cube targets and the planar target. Capture cannot be retired while executing or the known queue pressure fence is busy. The normal near-water capture schedule regenerates the cube (six faces before publication) and then the planar reflection; full target storage is recreated on the next use. No synchronous six-face capture or FFT during the loading transition. Sky/environment probes, cave reflectors and main post-processing targets are excluded.

The two derived owners are indivisible reclamation units under the same 32 MiB shared cap; their regeneration is not a bounded upload batch. FFT uses topology-estimated allocation bytes; reflection uses renderer-accounted colour bytes or RGBA16F estimates (depth and backend overhead not counted). Owners exceeding remaining capacity are skipped. These are estimates, not measured VRAM. Counters: locationSurface.fftEvictions, locationSurface.fftEvictedBytes, locationSurface.fftRegenerations, locationSurface.reflectionEvictions, locationSurface.reflectionEvictedBytes, locationSurface.reflectionRegenerations, locationSurface.deferredWaterOwners.

Run `node --test test/location-water-resource-residency.test.js test/ocean-fft-resource-lifecycle.test.js test/ocean-fft-weather.test.js test/terrain-material-bake-gpu.test.js test/location-surface-residency.test.js`. Then run the full suite/build and real WebGPU QA: ocean, inland and lake entrances; partial cube capture, planar reflection, cold FFT warmup, repeated entries and origin changes. Verify output fallback, capture validity, binding/layout errors, ocean phase and visual parity after regeneration. The first ocean-visible frame may incur allocation/compute setup; the reflection schedule still controls capture cadence. GPU acceptance and measured savings are pending. Remaining work: other GPU-only fields, atmospheric resources, shared prototype geometry, hardware validation.

## Outdoor atmosphere, shadows, environment and post targets

Enable the master `locationSurfaceReclamation=1` and any of `locationSurfacePostReclamation=1`, `locationSurfaceAtmosphereReclamation=1`, `locationSurfaceShadowReclamation=1`, `locationSurfaceEnvironmentReclamation=1`. Each is disabled by default. The collector enumerates the world post-processing controller's retained graphs, TAA/SSR history, outdoor god-rays passes, volumetric ray/blur targets, cloud transmission and cinematic shaft targets, and the sky's directional/cascade shadow targets. Only renderer-accounted target allocations qualify. No global scene traversal, renderer-global targets or location-owned resources. Dispose target storage without destroying the graph, texture identity or settings. Mark temporal history invalid before release, clear dormant shaft initialization, and mark shadow maps dirty so far-cascade admission cannot reuse missing data. VSM shadow maps are excluded because their additional blur dependencies need separate handling.

The exclusive HDRLoader source is identified by the sky environment owner and must still be the scene environment. r187 PMREMNode's source dispose listener invalidates its cached filtered cube; the next use regenerates from retained CPU HDR data. Charge the renderer-accounted source bytes plus an estimated six-face RGBA16F mip chain to the shared cap. PMREM generator scratch is retained. Shared noise textures and shader-only procedural sky/clouds are not released. Outdoor contact-occlusion internals and unrelated probes remain protected.

The existing 32 MiB cap applies to these deferred targets individually, including renderer-accounted depth attachments where available. No forced recreation during the cave or exit; world draw passes allocate their targets as needed. This is a reclamation budget, not a per-frame regeneration budget. Large targets exceeding the remaining cap stay resident; the first surface frame can incur allocation/render costs. Counters: locationSurface.postEvictions, locationSurface.atmosphereEvictions, locationSurface.shadowEvictions, locationSurface.environmentEvictions and corresponding EvictedBytes; deferredOutdoorTargets, deferredEnvironmentTextures. No actual VRAM savings claimed.

Run `node --test test/location-atmosphere-residency.test.js test/location-surface-residency.test.js test/location-water-resource-residency.test.js`, full tests and build. On WebGPU verify repeated cave visits from daylight/night, fog/storm, volumetric/cinematic/screen shafts, TAA and SSR, multiple retained post topologies, resize underground, single and cascaded shadows including throttled far cascade, HDR/metal reflections and no changes to ice-cave SSR/bloom. Inspect memory-map deltas, GPU validation, first-return frames and temporal ghosting. Confirm source disposal triggers PMREM regeneration on r187. Hardware acceptance required before defaults change.

## Adaptive surface pressure policy

Opt in with `locationSurfaceReclamation=1&locationSurfaceAdaptiveReclamation=1` and enable the individual owner flags as required. With adaptive mode off, the original 32 MiB policy remains in effect. With adaptive mode on and valid `renderer.info.memory.total`, retain eligible resources until the configured high threshold (4096 MiB); then reclaim until the lower threshold (3584 MiB), the per-visit allocation charge cap (512 MiB), or exhaustion of eligible resources. A new visit resets pressure and charges; linked locations preserve the original visit state. Missing accounting falls back to the legacy policy while retaining the adaptive visit charge ceiling. The accounting is renderer-wide, including active underground resources, but the eviction candidates remain exclusively suspended outdoor resources. This does not estimate GPU capacity or query physical VRAM.

Priority combines accounted allocation size (when available), bounded return-anchor distance and configured regeneration-cost penalties for deferred owners and GPU impostors. Derived owner estimates remain estimates. The separate charge cap does not replace CPU upload-size checks, per-sample eviction count, protected ownership or the existing restore batches. Accounting is resampled between retirement attempts; no predicted bytes are subtracted from the renderer total. Deferred targets are indivisible and may cause the total to cross below the recovery target. No new scene scans, active cave eviction, or GPU readback. No guarantee that the target is achievable. Existing first-use regeneration can still spike on return; deferred regeneration scheduling is a separate TODO.

Counters: `locationSurface.adaptiveAccountingAvailable`, `locationSurface.adaptiveRendererBytes`, `locationSurface.adaptivePressure`, `locationSurface.adaptiveEvictedChargeBytes`. Charge is a mixture of renderer accounting and explicit owner/source estimates, not observed VRAM savings. The original pending-byte counter retains its previous semantics.

Run the location residency tests, lint, full tests and build locally (no GitHub Actions). Compare adaptive off/on on identical routes with low and high configured thresholds, under pressure in large caves, quick exits, linked caves and repeat visits. Capture renderer-accounted and externally measured memory separately, recovery behavior, protected allocations, frame p95/p99, return latency and visual parity. Verify missing accounting, device loss, and oversized target handling. Do not enable defaults until hardware acceptance.

## Predictive surface exit warmup

Opt in with `locationSurfaceReclamation=1&locationSurfaceExitWarmup=1` (adaptive pressure optional). While within 12 m in three-dimensional foot-position distance of an actual unlinked surface exit, stop new surface retirements and try to restore previously retired CPU-backed resources nearest the canonical return anchor first. Linked location portals do not trigger warmup. Attempts are spaced 250 ms apart; each uses the existing per-frame upload/count limits, a separate 32 MiB per-visit charge ceiling, and the adaptive low threshold as a renderer-accounted headroom ceiling even if adaptive reclamation is disabled. Missing memory accounting prevents speculative uploads. Pre-retirement allocation charges are retained for admission; source sizes still control upload batching. Successful speculative uploads are pinned until visit end to prevent repeated eviction/upload when walking away. Leaving the approach area restarts the normal dwell delay. A failed speculative upload stops further attempts for that visit and leaves the explicit exit restore available.

No GPU-derived target is warmed by this phase. PMREM, ocean FFT, reflections, outdoor render targets and shadow rendering remain owner-regenerated; no stale temporal history is published. GPU submission completion, first-frame latency and physical VRAM improvements are not guaranteed. TODO: owner-specific budgeted deferred regeneration and early cave resource retirement after the transition becomes irreversible.

Counters: `locationSurface.exitWarmupRestores`, `locationSurface.exitWarmupBytes`, `locationSurface.exitWarmupFailures`, `locationSurface.exitWarmupPinned`, `locationSurface.exitWarmupChargeBytes`. Run `node --test test/location-surface-residency.test.js` plus other location residency tests, lint and build. Compare approach, retreat, repeated approach, linked portals, quick exit, vertically adjacent exits, low/headroom-constrained renderer memory, and actual return on WebGPU. Compare frame tails and loading latency with flags off/on. No default change or GitHub Actions.

## Staged shadow allocation on explicit exit

Enable `locationSurfaceReclamation=1&locationSurfaceShadowReclamation=1&locationSurfaceShadowWarmup=1`. Independent of predictive exit warmup and adaptive reclamation. After normal CPU-backed restoration, use the pinned r187 `renderer.initRenderTarget` API for still-owned retired directional/cascade shadow targets, one allocation after each frame yield. Validate current ownership, dirty state, unchanged target dimensions/attachments, non-VSM mode and no pending far-cascade admission. Cube, XR, array, 3D, multiview and multisampled targets are not warmed. Missing renderer accounting or unsupported API skips the feature. The 128 MiB visit allocation-charge ceiling and 64 MiB individual target ceiling are configurable, with the adaptive high threshold as the renderer headroom limit. Conservative charges use the retirement estimate; no GPU completion guarantee.

Only storage is recreated, not shadow contents. Keep every owning shadow dirty; normal rendering must refresh it, including throttled far cascades. No outdoor draw, camera mutation or forced visibility. Any allocation error stops further speculative work; normal shadow rendering remains the fallback. Post-processing, atmospheric targets, PMREM, FFT and reflection regeneration are unchanged. TODO: budget actual shadow draw work without sampling invalid contents and release cave allocations earlier after irreversible transition.

Counters: `locationSurface.shadowWarmupTargets`, `locationSurface.shadowWarmupChargeBytes`, `locationSurface.shadowWarmupFailures`. Run `node --test test/location-atmosphere-residency.test.js test/location-surface-residency.test.js`, full tests/lint/build, and compare real WebGPU single/cascaded shadows on cave return including dirty far-cascade refresh, resize while underground, memory pressure, abort and device loss. Capture loading duration, first-return frame tails, GPU validation and shadow visual parity. Defaults remain off; no GitHub Actions.

## Shared staged allocation for outdoor post-processing and shadows

Enable `locationSurfaceReclamation=1&locationSurfacePostReclamation=1&locationSurfacePostWarmup=1`; the shadow warmup flags remain independent. Both use one transition scheduler, with a combined 128 MiB estimated allocation charge ceiling (`surfaceTargetWarmupMaxBytes`) and one target per frame yield. Shadows are considered first. Per-owner ceilings remain independently configurable: post 128 MiB total and 64 MiB per target by default. Renderer-accounted high threshold still limits headroom. These budgets apply to target storage only, not CPU-backed uploads or rendering/compute work.

Reclamation may retire all retained graphs, but warmup only admits the current topology when it matches the selected controller graph and is neither bypassed nor failed. The current scene pass, AO, screen-space shafts, depth hierarchy, SSR, bloom, DOF, sharpen and grain targets are eligible; TAA and SSR history targets only if their corresponding graph effects exist. Inactive variants, changed topology, resized targets and unsupported shapes are skipped. Recheck ownership after each frame yield. Invalidate post history before every admitted allocation; do not render the scene, latch history, switch renderer output or publish texture content. Actual passes retain their normal first-use behavior.

Counters: `locationSurface.postWarmupTargets`, `locationSurface.postWarmupChargeBytes`, `locationSurface.postWarmupFailures`, and shared `locationSurface.targetWarmupTargets`, `locationSurface.targetWarmupChargeBytes`, `locationSurface.targetWarmupFailures`. Run the location atmosphere and surface residency tests, then lint/full tests/build. On real WebGPU test TAA, SSR, AO, bloom, DOF, resize, changed settings while inside, disabled post chain, combined shadow/post ceiling, repeated cave exits and device loss. Compare output parity, frame tails and loading times. Allocation-only stage; GPU draw/compute scheduling, atmospheric targets, PMREM and ocean owners remain TODO. No defaults changed or GitHub Actions.
