# Three.js r187 adoption — implementation roadmap

Date: 2026-11-26 | Status: implementation candidate under hardware QA; phases 03 and 06 measured, not promoted. See [implementation and testing handoff](#19-implementation-and-testing-handoff).
Baseline inspected: [054d0d4](https://github.com/danielsobrado/drusniel-world-builder/commit/054d0d448ec6ae35578cd5f90bf0a2c13290f4fe).
Upstream target: [r187 / 7e89746](https://github.com/mrdoob/three.js/releases/tag/r187).

## 1. Goal and non-goals

The candidate pins the existing Three.js resolution to `0.187.0` in `package.json`. The project also declares three-mesh-bvh 0.9.13 and meshoptimizer ^1.2.0, with three-virtual-geometry 0.1.3 as a dev dependency. The goal is to improve the world exploration critical path, reduce shader and upload stalls, increase sustainable geometric and lighting quality and reduce reliance on private renderer contracts where upstream supports equivalent behavior.

Keep the simulation, save formats, floating origin, authored LODs, vegetation/impostors, terrain deformation, ocean FFT/coastal effects, World Surface Context (WSC), workshop and collision architecture intact. Preserve forced WebGL fallback. Never patch node_modules. No GitHub Actions; use the existing local scripts and actual hardware browser QA. All new tunable settings belong in the existing validated YAML configuration system; no magic tuning numbers scattered in code. Use narrow modules and deterministic disposal, existing logging and counters, explicit errors and actionable TODOs for incomplete work. No new dependency without measured justification.

Every implementing agent must fetch main immediately before work, inspect changes since the baseline, rebase/reconcile rather than overwriting newer work, and record its actual starting SHA. Work in independent commits; if several tasks edit the same file, integrate serially. Do not replace a mature subsystem solely because a new upstream API exists. Proposed new file names below are suggestions, not claims of existing files. All phase IDs denote logical change sets; they can be committed directly to main if requested.

## 2. Evidence and upstream map

Use r187-tagged sources rather than dev or the latest unversioned docs when deciding exact API contracts. Verify imports/constructor options against the installed package; this plan does not promise support for unverified combinations.

| Capability | Upstream evidence | Local opportunity |
| --- | --- | --- |
| Parallel compile, material side, pass configuration | [#34816](https://github.com/mrdoob/three.js/pull/34816), [#35016](https://github.com/mrdoob/three.js/pull/35016), [#35168](https://github.com/mrdoob/three.js/pull/35168) | StreamedDrawPreparation, postprocessing warmup |
| Shader sharing | [#34872](https://github.com/mrdoob/three.js/pull/34872), [#35007](https://github.com/mrdoob/three.js/pull/35007), [#35014](https://github.com/mrdoob/three.js/pull/35014) | Repeated vegetation and construction draws |
| NodeMaterialInstance | [#35269](https://github.com/mrdoob/three.js/pull/35269) | Evaluate compatible material instances; not a generic deduplication guarantee |
| Resource cleanup | [#34368](https://github.com/mrdoob/three.js/pull/34368), [#34664](https://github.com/mrdoob/three.js/pull/34664), [#34685](https://github.com/mrdoob/three.js/pull/34685), [#34821](https://github.com/mrdoob/three.js/pull/34821), [#35105](https://github.com/mrdoob/three.js/pull/35105) | GPU buffers, streamed materials, bundles, recovery |
| Drawing pipeline | [#35191](https://github.com/mrdoob/three.js/pull/35191), [tagged pipeline directory](https://github.com/mrdoob/three.js/tree/r187/examples/jsm/pipelines) | Explicit standard path; controlled meshlet/visibility research |
| BatchedMesh | [#34828](https://github.com/mrdoob/three.js/pull/34828), [#34829](https://github.com/mrdoob/three.js/pull/34829), [#35259](https://github.com/mrdoob/three.js/pull/35259), [#35272](https://github.com/mrdoob/three.js/pull/35272) | Heterogeneous settlement pieces |
| Depth targets and per-camera queries | [#34782](https://github.com/mrdoob/three.js/pull/34782), [#35066](https://github.com/mrdoob/three.js/pull/35066) | Occlusion and shadows |
| Loader HTTP controls | [#34936](https://github.com/mrdoob/three.js/pull/34936), [Loader.js](https://github.com/mrdoob/three.js/blob/r187/src/loaders/Loader.js), [FileLoader.js](https://github.com/mrdoob/three.js/blob/r187/src/loaders/FileLoader.js) | Asset request prioritization |
| Cube PMREM, EON diffuse | [#34585](https://github.com/mrdoob/three.js/pull/34585), [#34379](https://github.com/mrdoob/three.js/pull/34379) | Material/environment parity; WSC coordination |
| Shadow changes | [#34794](https://github.com/mrdoob/three.js/pull/34794), [#35203](https://github.com/mrdoob/three.js/pull/35203), [#35018](https://github.com/mrdoob/three.js/pull/35018), [#34783](https://github.com/mrdoob/three.js/pull/34783) | CSM and depth-only evaluation |
| Reflectors and temporal reprojection | [#34917](https://github.com/mrdoob/three.js/pull/34917), [#34977](https://github.com/mrdoob/three.js/pull/34977), [#34823](https://github.com/mrdoob/three.js/pull/34823), [#34793](https://github.com/mrdoob/three.js/pull/34793) | Planar and selective SSR comparison |
| UV atlases / MaterialX | [#34944](https://github.com/mrdoob/three.js/pull/34944), [#34523](https://github.com/mrdoob/three.js/pull/34523) | Offline/workshop baking |
| Probe baking / VXGI | [#35145](https://github.com/mrdoob/three.js/pull/35145), [#35265](https://github.com/mrdoob/three.js/pull/35265), [#35160](https://github.com/mrdoob/three.js/pull/35160) | Local interiors, experimental GI |

Additional authoritative reference: [186 → 187 migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#186--187). SSR/SSGI improvements must be confirmed in the tagged addon implementation and release notes before adoption; do not treat every desired feature as a new r187 feature.

### Existing measured evidence — do not repeat the failed experiment as a production migration

See [Stonehold meshlet QA](../stonehold-meshlet-qa-2026-11-19.md), [dense.json](../qa/stonehold-meshlets/dense.json), [buffers.json](../qa/stonehold-meshlets/buffers.json). The RTX 4080 tests used authored LODs, native clusters, and external virtual geometry. Authored LODs won GPU p95 at all tested dense-cliff counts/resolutions; native clusters rendered a denser source, so quality was not identical. At 1080p/100 copies, authored GPU p95 0.785–0.786 ms vs native 1.325–1.449 ms with occlusion. The external path accumulated 327.2 MiB tracked storage after three reloads and failed a reflection foreground coverage gate. Native meshlets reduced stock-kit submitted triangles but did not improve total time. Real TownKit uses double-sided and alpha-to-coverage materials excluded by the native path. Keep all of these defaults unchanged.

Upstream #35191 demonstrates substantial wins on raw vertex-bound workloads; it also reports a GPU regression on Sponza. It is not a prediction for this optimized world.

## 3. Shared implementation contract

### Configuration and capability routing

Extend config/render-enhancements.yaml and its existing parser/default validation; first trace existing settings consumers. Do not introduce a parallel configuration service. The following is a logical proposal; map keys into existing schema, avoid redundant aliases and register only when the owning PR lands.

```yaml
r187:
  preparation:
    asyncCompile: false
    referenceAttributeSharing: false
  drawing:
    pipeline: standard
    nativeMeshletExperiment: false
    visibilityBufferExperiment: false
    screenSpaceErrorPixels: 1.5
    nativeOcclusion: false
  assets:
    prioritizedRequests: false
    maxConcurrentRequests: 6
    maxConcurrentDecodes: 2
  lighting:
    depthOnlyOcclusion: false
    probeExperiment: false
  reflections:
    upstreamSsrExperiment: false
  postProcessing:
    ssgiExperiment: false
    vxgiExperiment: false
```

Initial limits are proposed, not measured. Existing upload budgets and render feature flags are authoritative; do not duplicate them. Keep all experimental flags off by default. Prefer existing logging, PerfCounters and diagnostics channels. Report the requested and effective pipeline, backend, fallback reason, capability flags and THREE.REVISION once per renderer generation; avoid per-frame logging.

Routing must distinguish actual WebGPU backend (not just renderer class), forced WebGL, required GPU features/limits and material eligibility. No per-frame pipeline switching; choose one pipeline per renderer lifecycle. Native meshlet pipeline owns its fallback; do not assume per-object opt-out exists without verifying r187 source. If safe selective routing cannot be achieved through supported APIs, limit to isolated QA. Never mix indirect owners for a geometry or camera pass. Device loss/recreation invalidates all old resource handles and pending work.

### Existing integrations (baseline)

- src/render/preparation/{DrawPreparation,StreamedDrawPreparation,SceneWarmup,BudgetedAttributeInitialization,StagedDrawPublication,DrawUploadEstimate}.js
- src/render/occlusion/{GpuOcclusion,occlusionBounds,occlusionShaders}.js; src/render/visibility/TurnEnvelopeFrustum.js
- src/editor/ObjectLodController.js; src/editor/stylized/lod/ObjectLodHierarchy.js
- src/render/reflections/{WaterReflectionController,ReflectionCapture,ReflectionCaptureSchedule,ReflectionShadowRegistry,PlanarReprojection,WaterReflectionFilter,WaterReflectionResidency}.js
- src/render/postprocessing/{PostProcessingGraph,PostProcessingController,PostProcessingHistory,PostProcessingResources,PostProcessingWarmup,PostProcessingInvalidation,PostProcessingPresets}.js
- src/render/shadows/CascadedSunShadows.js; src/editor/lifecycle/{RendererRecovery,RendererStartupGuard}.js
- src/editor/assets/sharedKtx2Loader.js; src/editor/stylized/StylizedSceneAssetCache.js; src/worldIdentity/AssetRegistry.js; config/asset-registry.yaml
- src/editor/water/fft/OceanFft*.js; src/render/materials/surfaceLayers/PbrCoatBlend.js; src/editor/materials/TerrainMaterialBakeCache.js
- docs/plans/world-surface-context-pr-00-baseline-2026-11-25.md and docs/qa/world-surface-context/pr-00/

## 4. PR 00 — r187 baseline and compatibility

Priority P0. Dependency: none. Do not change appearance deliberately.

1. Verify package-lock resolved version with npm ci, npm ls three and runtime REVISION. Audit duplicate Three copies and dependencies requiring older versions. Consider exact package pin 0.187.0 for private contracts; maintain lockfile reproducibility and do not silently upgrade to r188.
2. Search src/test/scripts for CubeUVReflectionMapping, PMREM generation, iridescenceThicknessRange, pixelationPass, addLight, struct storage access, compute count/dispatchSize, viewport/scissor, XR, and all renderer._* or backend private access. Create a compatibility inventory: caller, upstream tagged contract, tested backend, fallback, remove/retain decision.
3. Audit TSL implicit numeric promotion, integer indices, explicit casts, struct storage element access and compute outputs using deterministic tests. Review PMREM/color management and exposure changes before any material retuning. Capture exact same sun, sky, camera and weather as WSC PR00.
4. Verify private patches in src/render/{installViewportFramebufferSourcePatch,patchViewportFramebufferSources,skipEmptyDraws,UnusedSamplerBindings}.js, DrawPreparation and GpuOcclusion. Remove only with targeted reproducer demonstrating upstream covers the original problem.
5. Run baseline routes: stationary and walking Stonehold; dense coastal jungle; open meadow; mountain/cliff; sea-level and underwater FFT; settlement interior; workshop edit; fast turns/teleport/rebase; renderer recovery; forced WebGL. Add missing fixture only when existing fixture cannot reproduce issue.
6. Store baseline JSON, screenshots, actual hardware, OS, browser, adapter/driver, resolution, seed, exact SHA and config under docs/qa/three-r187/pr-00/. Report unavailable GPU timestamps as unavailable, never zero.

Exit: zero new validation/shader errors; resolved dependency verified; migration checklist complete; reproducible baseline. If a baseline test already fails, record it separately with reproduction and do not hide it.

## 5. PR 01 — compilation and draw preparation

Priority P0. Depends on 00. Expected benefit: lower CPU/shader p99 stalls, not guaranteed.

Local anchors: src/render/preparation/DrawPreparation.js and StreamedDrawPreparation.js; SceneWarmup.js; StagedDrawPublication.js; BudgetedAttributeInitialization.js; DrawUploadEstimate.js; src/render/postprocessing/PostProcessingWarmup.js; src/editor/performance/qa/PerfCounters.js.
Upstream: Renderer.compileAsync, PassNode compile changes, referenceAttribute, NodeMaterialInstance; consult tagged src/renderers/common/Renderer.js and TSL source.

Current DrawPreparation.withPreparationFrame modifies nodeFrame.frameId (pinned adapter) and suspends temporal callbacks; withDrawPreparation restricts visible branches and sets zero draw ranges through real nested passes. StreamedDrawPreparation already reserves work/upload budget after MAX_WAIT_FRAMES=4 and slices initial attributes at 768 KiB/frame. Preserve this behavior until measured replacement.

1. Add instrumentation for queue wait, CPU prepare ms, build/compile requests, completed/cancelled jobs, first-visible delay, upload bytes, oversized publication and first real render stalls. Keep diagnostic overhead off by default.
2. Classify preparation jobs by geometry/material/attribute layout, render context, actual light set, attachment formats, samples, depth, clipping, side, fog, skinning/morph/instancing and renderer generation. Use actual supported cache contracts; do not invent a key as a guarantee of Three program reuse. Track existing material identity and generation.
3. Build a bounded asynchronous precompile lane for eligible main-pass jobs. Invoke compileAsync only at a safe renderer scheduling boundary; no concurrent mutations to renderer state or scene. Use real target scene/camera/context where supported, preserve the old empty draw for nested passes until proven unnecessary.
4. Use queued -> preparing -> ready -> published or cancelled/failed states. Each completion verifies chunk/asset generation and renderer epoch before marking ready. Keep proxy/previous variant visible while pending. Reserve work and upload budget, preserve aged-job fairness, deduplicate in-flight requests, release reservations on all paths.
5. For repeated vegetation/construction test referenceAttribute against existing attribute nodes with equal vertex layout and per-instance values. Test different colors, winds, morphs and LODs; no shared mutable uniforms leaking between instances. Test NodeMaterialInstance separately for truly equivalent graph variants. Keep independent material instances where behavior differs.
6. Assert state restoration on exceptions, zero temporal-history contamination, valid shadow and reflection variants, no synchronous first-use compile on accepted route. Measure shader build and CPU p99 against the same baseline.

Tests: synthetic async completion after unload/recovery; rejection; different pass/material signatures; active light changes; zero-count geometry; temporal frame identity restoration; forced fallback. Run qa:perf, qa:postprocessing and qa:postprocessing:browser, qa:vegetation:lod, qa:recovery. Gate: target 30% fewer shader-related >33.3 ms spikes or lower attributable p99; no >5% overall p95 regression, no increase in permanently hidden objects. If upstream compile does not cover nested passes, retain existing preparation and ship only proven subchanges.

## 6. PR 02 — memory lifecycle and recovery

Priority P0. Depends on 00; coordinate with 01/06. Local: StreamedDrawPreparation, BudgetedAttributeInitialization, StagedDrawPublication, PostProcessingResources, PostProcessingHistory, WaterReflectionResidency, OceanFftGpuResources, StylizedSceneAssetCache, sharedKtx2Loader, RendererRecovery.

1. Inventory owner vs borrower for geometry, textures, materials, attributes, render targets, compute buffers, bind groups, loader caches and shared assets. Record create, retain, release, retire, dispose, renderer generation. Extend current cache ownership rather than add global resource manager unnecessarily.
2. Distinguish shared references from exclusive chunk allocations. Last release retires a resource; no destruction while queued preparation/compute/render still owns it. Use appropriate existing renderer submission/lifetime primitives; avoid waiting for queue completion on each frame. Dispose explicit GPU resources once, cancel queued publication first.
3. Audit r187 buffer disposal and cached pipeline replacement. Verify dispose semantics with controlled fixture before deleting custom cleanup. WeakRef/finalizers are not deterministic cleanup.
4. On renderer recovery, cancel old generation work, drain/retire through lifecycle, rebuild dependencies and reload only currently needed assets. Reject stale results.
5. Compare renderer.info estimates, instrumented buffer lifetime and process GPU memory separately; never call estimated allocations driver VRAM. Sample after warm-up and after queues settle.

Tests: two chunks sharing one texture; release order; failed initialization; stale decode; disposal idempotency; context loss with pending FFT/SSR/chunk; 50 repeated unload/reload and 20 teleports; five recovery cycles. Gate: no increasing retained tracked bytes across final ten identical settled cycles beyond measured cache high-water; no orphan handles or validation errors. External virtual geometry remains dev-only until its documented failure is independently resolved. Run qa:recovery, qa:ocean-fft, qa:water:acceptance, qa:assets:startup.

## 7. PR 03 — occlusion and drawing pipeline

Priority P1. Depends on 00/01/02 integration contracts.
Local: GpuOcclusion.js, occlusionBounds.js, occlusionShaders.js, TurnEnvelopeFrustum.js, ObjectLodController.js, ObjectLodHierarchy.js, PostProcessing nodes/HierarchicalDepthNode.js.
Upstream: #35191, #34782, #35066; inspect tagged standard/meshlet pipeline and renderer integration.

Current GpuOcclusion uses same-frame depth proxy, half-resolution max-depth pyramid, conservative bounds, indirect args and diagnostic-only readback. It checks REVISION === '187' and accesses backend device/buffers. Terrain proxies are necessary because shader-displaced flat terrain bounds are insufficient.

1. Record existing private bridge contract and check actual r187 drawing pipeline extension points. Prototype supported adapter; do not assume it exposes custom indirect argument ownership. Keep fallback intact if not sufficient.
2. Evaluate depth-only target in isolated proxy pass. Check depth sampling, texture usage, resize, format, clear and device limits. Keep depth convention (existing path rejects reversed/log depth) unless separately implemented and tested.
3. Maintain conservative culling: project bounds, expand pixel rectangle, choose pyramid level covering rectangle, compare nearest object depth against conservative max occluder depth plus bias. Near-plane crossing, invalid projections, missing depth or stale bounds => visible. Preserve displaced terrain proxies.
4. Keep per-camera visibility and indirect args independent; no reuse of main-camera results for reflection or shadow. Never allow standard and meshlet culling to write the same indirect buffer. Reuse a depth hierarchy only when resolution, depth convention, camera, epoch and producer timing match.
5. Track depth pass/compute cost, candidates, culled triangles, saved draws, per-pass GPU time, false-cull checks. Respect existing adaptive/probe policy; only add new hysteresis if proven necessary. No production GPU readback.
6. Verify culling with rapid 180-degree turn, narrow streets, near clip, shadow/reflection cameras, 8192m origin shift and teleport. Debug reference renders with culling off; any unexpected missing visible coverage blocks adoption.

Gate: 15% p95 improvement in occlusion-heavy representative scene or clear measured cost reduction, no >5% standard-path regression. If native pipeline cannot be safely routed, keep custom Hi-Z and ship only depth-target/adapter changes.

## 8. PR 04 — instancing, batching and bundles

Priority P1. Depends on 01/02; coordinate with 03 and WSC.
Local: ObjectLodController.js, ObjectLodHierarchy.js, StylizedSceneAssetCache.js, locations/generators/, locations/gen/PropOcclusionGrid.js; existing asset and workshop paths.
Upstream: tagged BatchedMesh.js, InstancedMesh.js and BundleGroup implementation; #35259, #34829, #35272.

1. Inventory draw counts and CPU submit cost by family: trees, grass, modular walls, trim, doors, roofs, props, monuments. Do not modify grass or impostor renderer unless measured bottleneck.
2. Compare standard InstancedMesh (same mesh/material), chunk-local BatchedMesh (different compatible geometries), and existing separate meshes/static BundleGroup (only if verified supported). Partition by chunk, material/alpha/side, vertex layout, cast/receive shadow, LOD and editability; no world-global batch.
3. Preserve logical object ID -> instance/batch ID mapping, transforms, picking, collision, selection and editing. Geometry/index/attribute layout compatibility is mandatory. Maintain bounds after insert/delete/transform and recycle IDs only after removal. Keep logical collision authoritative.
4. Evaluate batching only when material/weathering attributes and per-object WSC context remain correct. Preserve previous-frame transforms for temporal effects; rebuild/refresh static bundles when residency, material or geometry changes.
5. Test batch capacity growth, deletion, replacement, disposal, selection, edit/undo, LOD hysteresis, origin rebase, camera passes. Compare triangle counts, CPU submit, GPU time and buffer bytes at equal quality. Keep old path when it is faster.

Gate: target 15% CPU render submission p95 reduction in dense settlement, no picking/collision/visual regression. Separate geometry batching from unrelated authoring changes.

## 9. PR 05 — selective native meshlets

Priority P1 research; depends on 03/04 and resource lifecycle. Existing Stonehold QA is the mandatory baseline, not a production rollout.
Local: src/editor/performance/qa/StoneholdAssetQa.js, StoneholdDenseCliff.js, scripts/run-stonehold-meshlet-qa.mjs, test/stonehold-meshlet-qa.test.js, docs/stonehold-meshlet-qa-2026-11-19.md.
Upstream: [MeshletDrawingPipeline.js](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/pipelines/MeshletDrawingPipeline.js), [#35191](https://github.com/mrdoob/three.js/pull/35191).

1. Create capability/material audit by real material class, sidedness, alpha-to-coverage, blending, node inputs, displacement, skinning, morphs, shadows, reflection and picking. The upstream pipeline has internal standard fallback, but app-level eligibility cannot be assumed. Explicitly reject unsupported TownKit materials, water, vegetation, terrain and animated actors in first experiment.
2. Use renderer.drawingPipeline = new MeshletDrawingPipeline() in standalone WebGPU QA only; confirm constructor options in tagged source. Treat application screen-space-error config as a mapping, not an upstream option name. Test 1.0/1.5/2.0 px if supported. Clusters use 64 triangles in upstream design; do not implement another cluster builder initially.
3. Candidate fixtures: unique sculpted monument; raw high-detail cliff; dense fortress/city with occluded blocks; near/far travel through actual chunks. Compare authored LOD vs native with/without Hi-Z at 1080p/1440p/4K, 1/16/100 copies or representative world population, equal image quality where possible and separately a quality-uplift arm.
4. Track preparation wall time, CPU/GPU pass p50/p95/p99, actual/padded submitted triangles, indirect vs direct draws, storage bytes, first-visible delay, stalls and peak/settled memory. Include culling compute cost, shadow/reflector pass cost, not just beauty raster.
5. Use offline/prewarm or supported bounded preparation if upstream allows; synchronous large meshlet creation cannot occur during walking. Preserve authored collision mesh, gameplay IDs, chunk residency, WSC and fallback. No geometry rewrite for non-render consumers.
6. Test all Stonehold image gates including reflector foreground, silhouette, shadows, origin shift and reload. Add actual world streaming and workshop edit tests. Verify fallback material and forced WebGL; never route reflector surface into meshlets without proof of safe pass behavior.
7. Only consider opt-in world mode if 15% improvement at comparable quality OR documented visual uplift inside agreed budget, zero validation errors, stable memory, no first-use stutter. If selective routing or budgeted construction is unavailable, keep standalone experiment. Explicitly record no-go decisions per asset family.

## 10. PR 06 — network and asset streaming

Priority P1. Depends on 00; coordinate with 01/02. Local: config/asset-registry.yaml, src/worldIdentity/{AssetRegistry,AssetRegistryData}.js, src/editor/assets/sharedKtx2Loader.js, StylizedSceneAssetCache.js, scripts/optimize-runtime-assets.mjs, scripts/verify-asset-serving.mjs, existing startup QA.
Upstream: Loader/FileLoader #34936; inspect which derived loaders actually propagate cache and priority options.

1. Trace existing URL resolution, loader, manifest, cache and GPU publication path. Extend existing registry rather than invent parallel manifest. Keep free/local pack fallback, content hash/version, license/provenance, bounds, LOD and dependency IDs; optional packs must not be required for default world.
2. Separate network scheduling from GPU budget. Priorities: player/near collision and terrain, visible assets, soon-visible assets, distant upgrades, speculative prefetch. Use camera movement/chunk proximity, not FPS-dependent priority changes. Age waiting jobs and reserve critical capacity. Browser priority is a hint, not scheduling guarantee.
3. Deduplicate in-flight work by canonical URL/version plus decode options; subscriber reference counts; abort only when no subscriber needs a cancellable request. If underlying loader lacks cancellation, discard stale results and retire resources. Bound request and decode concurrency; use existing workers/decoders. Preserve GLTF dependencies and KTX2 loader lifecycle.
4. Keep old LOD/proxy until replacement has passed GPU budget and material readiness. No synchronously decoded giant asset on movement path. Use existing staged publication queue and generation check.
5. Configure optional external immutable asset URLs (Cloudflare-compatible CDN), hashed filenames, cache headers, CORS, correct MIME, integrity/version manifest and controlled retry. Never put commercial assets or access tokens in public source; browser-delivered assets remain accessible to clients, so only distribute assets with appropriate rights. Default CC0/free pack self-hostable.
6. Test throttled/cold/warm/offline/cache-disabled requests, 404, CORS error, decode error, rapid teleport cancellation, two consumers and duplicate URLs. Measure first interactive/first visible time, bytes fetched/decoded/published, queue wait, waste and p99 walking stalls.

Gate: no critical asset starvation, no broken world when optional pack unavailable, no duplicated requests for same active resource, target 20% improvement to p95 cold visible-asset readiness on fixed shaped network. Run qa:assets:startup, verify:asset-serving, validate:assets, qa:perf. Do not deploy infrastructure in this PR unless explicitly authorized.

## 11. PR 07 — shadows and lighting

Priority P1. Depends on 00 and 03 depth/camera contract. Local: CascadedSunShadows.js, ReflectionShadowRegistry.js, GpuOcclusion.js, editor/stylized/CloudShadow.js, FrameUniforms.js.
Upstream: #34794, #35203, #35018, #35047, #34783 and related TileShadowNode changes.

1. Measure existing cascade update count, draws/triangles, GPU shadow time and shadow memory per camera. Identify redundant updates, not just distant geometry.
2. Audit r187 shadow needsUpdate/autoUpdate and renderer state. Avoid manual duplicate refresh if upstream already handles it. Preserve existing cascade splits, stable texel snapping and shadow camera layers.
3. Test depth-only targets where no color output is consumed. Ensure comparison sampling, filtering, clear and depth format match. Keep separate depth conventions for unsupported modes.
4. If current cascade cache permits, invalidate static shadows on sun/cascade movement, relevant geometry/material/caster changes, chunk publication/rebase; dynamic casters use existing scheduling. Do not assume upstream has separate static/dynamic cache. Avoid visible stale shadows or sun-direction jumps.
5. Prototype tiled local shadows and clustered lighting only in isolated torch-heavy interiors; inspect supported tagged APIs and measure light count vs GPU. Add probe work under 09 so ownership is clear.

Tests: moving sun, weather, foliage animation, entering interior, quick camera turn, reflection/shadow pass, forced WebGL. Gate: target 10% shadow GPU p95 improvement in forest/settlement, no seams, missing casters, stale shadow or changed silhouette. Run qa:weather:browser, qa:environment:parity, qa:perf, qa:world:visual.

## 12. PR 08 — reflections, PMREM and water

Priority P1. Depends on 00/02, coordinate with 07/09. Local: src/render/reflections/, postprocessing/nodes/SelectiveSsrNode.js, HierarchicalDepthNode.js, src/editor/water/fft/, config/water-visual.yaml, config/water-domain.yaml.
Upstream: #34585, #34917, #34977, tagged SSR/Reflector addons. Check actual r187 multi-camera reflection limitations before adoption; retain existing planar system.

1. Audit environment generation and disposal under cube PMREM, color space, exposure and roughness lookup. Compare deterministic metallic/roughness spheres and real wet stone, terrain, ocean, snow across backend/lighting. Coordinate with WSC; do not retune global material colors to hide bugs.
2. Keep planar reflections for ocean/lakes, selective screen-space for local wetness and environment fallback for misses/distant surfaces. Preserve existing reflection schedule, reprojection and residency.
3. Compare tagged upstream SSR against custom SelectiveSsrNode in isolated identical inputs. Validate ray march in view space, depth thickness/hit validation, normal and roughness rejection, edge fade, off-screen/disocclusion fallback and temporal confidence. Adopt individual algorithm improvements only if matched to existing depth/normal/color contract.
4. Reject recursive feedback from sampling an attachment being written; use distinct sources/targets and explicit pass order. Per-camera history must not leak into main view. Reset on resize, camera cut, teleport, rebase, material/backend changes.
5. Do not change FFT spectra, wave breaking, foam, shoreline refraction, optical absorption, underwater caustics or physical gameplay water levels. Verify on sea, river, shallow shelf, storm, rock impact, wet road and interior pool.
6. Compare temporal shimmer, reflected geometry gaps, shoreline halos, off-screen fallback, GPU capture time and SSR cost. Gate: equal or better accepted image, target 10% reflection cost reduction or quality uplift within allocated budget. Run qa:water:acceptance, qa:ocean-fft, qa:postprocessing:browser, qa:environment:parity, qa:recovery.

## 13. PR 09 — indirect lighting and postprocessing

Priority P2. Depends on 00/02; coordinate with 07/08. Local: PostProcessingGraph, PostProcessingResources, PostProcessingHistory, PostProcessingMaterialData, PostProcessingInvalidation, PostProcessingPresets, nodes/AmbientOcclusionNode.js, TaaResolveNode.js, ToneMappingNode.js.
Upstream: tagged GTAO/SSGI (verify actual addon availability/parameters), probe grid, temporal reprojection, VXGI.

1. Establish contact shading, lighting and temporal baseline from WSC diagnostics. Avoid double-darkening baked AO and screen AO; retain material roughness and linear HDR workflow.
2. Compare existing AO against r187 compatible GTAO variant. Use existing depth/normal data; bilateral upsample using depth/normal thresholds and expose resolution scaling through existing presets. No added full-screen pass without profiling.
3. Isolated SSGI test: quarter/half resolution, linear HDR input, reconstruct view position, sample nearby diffuse radiance, reject invalid samples, temporally accumulate with motion/depth/normal validation, edge-aware upsample. Inspect actual API instead of assuming built-in resolution scale. Prevent feedback of previous GI into itself unless the chosen algorithm explicitly manages it.
4. Evaluate local LightProbeGrid in static interior/dungeon. Bake on load/offline where viable; fit volume to room, prevent cross-wall leakage, handle origin shifts and invalidate on relevant edit. Keep sky fill for outdoor regions and do not duplicate environmental irradiance. Preserve WebGL parity via supported probe backend or fallback.
5. VXGI isolated experiment only, not default Ultra. Track voxel volume size, memory, update time, light leaking, moving casters and disposal. Stop if unsupported or budget exceeded.
6. Suggested presets: Low no new GI; Medium existing AO; High optional scaled SSGI after gate; Ultra increased quality only if budget permits. Probes opt in per authored region. No global lighting change without reviewed screenshots.

Gate: visual improvement in contact shadows/indirect bounce with no persistent ghosting/leaks and GPU time within agreed preset budget; default path <=5% regression. Run qa:postprocessing, qa:postprocessing:browser, qa:look, qa:world:visual, qa:environment:parity.

## 14. PR 10 — procedural geometry and materials

Priority P2. Depends on 00; coordinate WSC and workshop work. Local: src/editor/workshop/shapes/, src/render/materials/surfaceLayers/PbrCoatBlend.js, TerrainMaterialBakeCache.js, scripts/optimize-runtime-assets.mjs, existing procedural-stone/procedural-texture-lab dependencies.
Upstream: #34944 UV atlas, #34624 tangents, MaterialX changes #34523 and #34576.

1. Evaluate tagged UV atlas generator on copied mesh data for secondary lightmap/bake UVs. Preserve original texture UVs, seams, indices, vertex colors, material groups and logical IDs. Do not run costly unwrap during interaction unless measured safe.
2. Verify atlas padding at target bake resolution, island overlap, degenerate faces and deterministic output. Bake high detail normals/AO to existing texture pipeline, retain color space and channel layout.
3. Generate/compare near/far representations for carved masonry, roofs, monuments; use existing meshoptimizer and authored LOD policy. Recompute tangent basis when required after UV/normal changes. Never alter collision topology without separate review.
4. Evaluate MaterialX only for supported import graphs and trusted assets; map to existing PBR/WSC semantics. Unsupported nodes report clear diagnostics and fallback. No second production material system.
5. Validate workshop edit/undo, export/import, picking, WSC wetness/snow/ground blending, chunk reload, WebGL. Run qa:workshop:kernel, qa:workshop:shapes, qa:construction:appearance, qa:construction:lod, validate:runtime-assets. Gate: improved visible detail or asset size without regression to edit latency, atlas seams or existing materials.

## 15. PR 11 — visibility buffer research

Priority P3. Depends on 05 validated infrastructure; no production dependency.
Upstream: [VisibilityBufferDrawingPipeline.js](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/pipelines/VisibilityBufferDrawingPipeline.js), #35191.

1. Implement standalone QA arm using tagged constructor/import verified at implementation. Compare standard, native meshlets and visibility buffer under equivalent scene content, quality and resolution. Keep separate renderer generations; no frame-by-frame swap.
2. Fixtures: dense city, raw high-poly cliff, large ruins, low-overdraw control, alpha/material fallback control. Record visibility-buffer memory, raster and compute cost, total GPU time, shading and CPU submission, startup and load/unload time.
3. Verify material reconstruction, gradients/texture mips, PBR normals, UVs, IDs/picking, shadows, reflection, temporal jitter, moving camera, rebase and device recovery. Reject unsupported semantics rather than approximate silently.
4. If an actual geometry-bound scene improves by >=15% at comparable quality, with no compatibility or memory blocker, write a separate rollout design. Otherwise retain QA-only and record no-go. Do not migrate main renderer or simulation as part of this research.

## 16. Dependency graph and integration schedule

00 -> 01, 02, 06 (06 can start design/loader tests in parallel).
01 + 02 -> 03 and 04 (coordinate shared render/preparation files).
03 + 04 -> 05; 05 -> 11.
00 + 03 depth contract -> 07; 00 + 02 -> 08; 07 + 08 interfaces -> 09.
10 can start after 00 in isolated workshop/offline code; coordinate WSC changes.
06 publication integration waits for 01/02 ownership contracts.
07/08/09/10 need not wait for meshlet research to finish. Treat no-go experimental results as valid completions, not reasons to block unrelated work.
Serial merge review for config schema, renderer creation, shared GPU lifecycle, postprocessing graph and common material files.

## 17. Benchmark protocol, budgets and acceptance

Use existing local scripts (package.json). Start with npm ci, npm run lint, npm test, npm run build; npm run verify when production asset corpus is available. Browser scripts may need npx playwright install chromium. Use documented script arguments, discover --help/source before invoking; do not invent flags. Relevant existing commands: qa:perf, qa:perf:matrix, qa:perf:windows, qa:postprocessing, qa:postprocessing:browser, qa:water:acceptance, qa:ocean-fft, qa:weather:browser, qa:assets:startup, qa:vegetation:lod, qa:environment:parity, qa:world:visual, qa:recovery, qa:biome-surface, qa:wsc:pr0. Meshlet runner reproduction documented in Stonehold QA.

For each A/B: same hardware, browser, viewport, resolution, seed, world/chunk residency, camera path, weather/time, config except one flag. Warm up at least 100 frames or until stable, collect at least 480 frames per route, three retained runs per arm (alternate order); separate cold-start runs and timestamp-readback diagnostics from timing runs. Retain foreground focus, report GPU adapter and actual timestamp support. Record CPU frame/callback/submit, GPU pass sum (not wall-clock latency), p50/p95/p99 and max; >16.7 and >33.3 ms frame counts, draw/triangle counts, compute, upload bytes, network/decode queue, memory high-water and settled memory. Include confidence/noise; rerun borderline regressions, never compare unlike quality. Screenshot fixed poses at identical exposure and temporal settling; preserve WSC D00–D25 capture conventions. Compare visual diffs and perform human review; do not approve a known bad image solely on global pixel percentage.

Initial engineering target: RTX 4080 1440p high quality, 60 FPS (16.67 ms frame interval). Proposed GPU allocation, not current measurements: terrain/architecture 4.17 ms; vegetation 3.33; shadows/lighting 2.50; water/reflections 2.00; post 3.00; compute/culling 0.83; reserve 0.83. Avoid double counting passes; sum exclusive categories. CPU and GPU can overlap; budget CPU separately. Preserve fallback hardware presets and permit quality uplift where explicitly reviewed.

| Gate | Target |
| --- | --- |
| Default route regression | <=5% p95 CPU/GPU and no meaningful p99 degradation beyond noise |
| Compile spikes | >=30% reduction in attributed >33.3 ms spikes when baseline supports comparison |
| New geometry pipeline | >=15% improvement at equal quality or explicit quality uplift within budget |
| Memory | No monotonic growth after repeated identical settled cycles; distinguish cache high-water |
| Validation/shader errors | Zero new errors; experimental backend must have zero |
| Correctness | No missing chunks, picking/collision changes, false culling, stale history, unapproved visual regressions |
| Fallback | Forced WebGL loads, navigates, streams and recovers; optional GPU features degrade safely |

These are proposed acceptance thresholds, not results or promises. If baseline does not meet the absolute frame budget, report measured delta rather than claim 60 FPS. If no qualifying benefit, keep flag off/remove unsuccessful prototype. Do not trade image quality for speed without documenting separate quality tiers and explicit approval.

### Required evidence per PR

Write docs/qa/three-r187/pr-NN/README.md (or existing equivalent) containing baseline and candidate SHA, flags/effective capabilities, exact local commands, unit/build results, fixture IDs, environment, A/B tables, limitations, before/after screenshot paths, decision (enable / keep opt-in / reject), rollback. Store compact JSON and representative screenshots only; large raw captures in tmp/ ignored by git. A failed run must remain visible in report. No fabricated hardware results; if implementing environment lacks WebGPU hardware, commit tests and mark hardware gate pending, do not enable new path by default.

### Completion checklist

- [ ] Re-read latest main and relevant phase dependencies.
- [ ] Confirm exact upstream r187 APIs with tagged implementation.
- [ ] Add narrow tests and config validation; keep old defaults.
- [ ] Run local tests, lint, build and relevant real browser QA.
- [ ] Record screenshots, timings, errors and fallback behavior.
- [ ] Verify resource lifecycle, origin shift, camera history and recovery.
- [ ] Review current concurrent changes and avoid overwriting them.
- [ ] Document rollback flag/revert scope and go/no-go.
- [ ] Commit only phase-related files; no GitHub Actions.

## 18. Decisions and open questions

- Standard instancing/authored LODs remain production default. Native meshlets and visibility buffer remain experimental until actual world QA proves their value.
- Prioritize 00–04 and 06. Visual work 07–10 can proceed independently where ownership permits.
- Do not enable external virtual geometry until independently fixing the measured storage retention and reflection failure.
- API feasibility of replacing private draw/occlusion adapters, selective meshlet eligibility, worker/offline preparation and loader cancellation is not established by this document. Each is an explicit investigation with a fallback/no-go branch.
- Exact configuration keys and new numerical budgets are proposed, not approved performance results. The existing YAML schema, frame budget and current main supersede suggestions when they conflict.
- This document is the master plan; individual phase implementation briefs can expand test matrices and exact symbols after inspecting the latest code.

## 19. Implementation and testing handoff

Implementation started from `1ca402d54179c7d08268316b3cc4286a1a348664` on `main`. Use that commit as the control when comparing this series. Unit tests, lint, builds and browser QA were deferred to the test machine. All performance targets and visual gates await evidence.

| Phase | Candidate code | Remaining work and promotion gate |
| --- | --- | --- |
| 00 | Exact Three.js pin, capability snapshot after renderer initialization, forced WebGL URL, source inventory below | Verify the installed package tree and run the defined baseline routes on both backends. |
| 01 | Streamed preparation counters for enqueue, wait, pass CPU, ready delay and cancellation. Stonehold compares startup `compileAsync` with first-use compilation. A separate fixture compares per-object graphs with `referenceAttribute` and `NodeMaterialInstance`. | Measure shader-related movement stalls and check shadow, reflection and post-processing coverage. Live async streaming requires a safe scheduling and retirement boundary. Existing r187 async work restores render-target and MRT state after yields. |
| 02 | Cancel detached staged draws immediately. Hold the transcoder lease during in-flight GLB decode. Allocate Hi-Z readback only for diagnostics. Stonehold can record 50 unload/reload cycles with settled GPU buffer accounting. | Verify recovery during pending uploads and decoding, and isolate world-level retention from allocator high-water marks. |
| 03 | `r187.depthOnlyOcclusion` selects a zero-color-attachment proxy target on actual WebGPU. The pass restores MRT, cube face, mip and target, and keeps the existing displaced-terrain proxies and indirect draw ownership. | **Measured 2026-11-26, not promoted** ([results](../qa/three-r187/p2-occlusion-and-requests-2026-11-26.md)): depth-only halves the proxy pass GPU time, Hi-Z cuts GPU p95 16%, but the route is CPU-bound and FPS does not improve; both flags stay off. `04fffd75` removed the main pass's duplicate scene walk; on the faster current route the GPU win is gone and prepare (~1.1 ms) still outweighs the ~0.4 ms main-pass saving. Re-evaluate only on a GPU-bound, occlusion-heavy route, with turn, rebase, reflection/shadow and WebGL arms. The public drawing pipeline does not expose an equivalent custom indirect-buffer handoff. |
| 04 | Stonehold compares separate draws and one local `BatchedMesh` for the same heterogeneous modules. The runner checks visual parity and matching pick IDs. | Measure the existing instanced world route and repeat the comparison in an actual dense settlement before production batching. |
| 05 | Native meshlet QA accepts `--lod-threshold`, mapped to upstream `lodThreshold`. The drawing suite compares raw standard geometry, native and native Hi-Z. Authored LODs remain a separate comparison. | Verify GPU time, visual quality, preparation stalls and memory. Production routing needs a supported eligibility and budgeted preparation path for real asset families. |
| 06 | `r187.prioritizedRequests` enables a bounded queue for cache-managed stylized GLBs. It coalesces resolved URL aliases, promotes queued shared requests, ages pending work and forwards the priority through dedicated GLTF loaders. Asset startup and movement reports expose queue metrics. | **Measured 2026-11-26, not promoted** ([results](../qa/three-r187/p2-occlusion-and-requests-2026-11-26.md)): cold-cache readiness −6.4% against the 20% gate, no failures; stays off. Independent network/decode limits and fetch cancellation have since landed. Remaining: warm-cache and shaped-network arms, malformed assets, CDN manifest rollout. |
| 07 | The r187 visual fixture captures one and two sun cascades and a moved sun. The world movement harness retains per-pass GPU and draw counters. | Measure forest and settlement cascades. Shadow caching and tiled local shadows require their own invalidation and torch-scene results. |
| 08 | The fixture compares cube PMREM with environment lighting off on both backends and captures upstream stochastic SSR with binary refinement on a fixed WebGPU scene. | Compare the real wet-stone, water and FFT routes against the production reflector and selective SSR. Check off-screen misses, edge fade, camera cuts and temporal shimmer. |
| 09 | Fixed WebGPU inputs for half-resolution GTAO, quarter/half-resolution SSGI and a bounded light-probe bake. | Check contact shading, light leakage and GPU cost. Temporal integration, regional probe adoption and VXGI remain follow-up experiments. |
| 10 | Offline secondary UV fixture preserves the source geometry, material groups and primary UVs. Tests check remapping and deterministic output. | Inspect padding, atlas seams and output on real workshop exports. Keep derived UVs separate from workshop state. MaterialX and detailed LOD baking are future comparisons. |
| 11 | Standalone visibility-buffer and Hi-Z arms with isolated renderer lifecycles in the Stonehold runner. | Confirm the candidate actually draws clusters, then run stock-kit fallback, shadow, reflector and origin checks. Extend to dense city and low-overdraw controls before considering rollout. |

### r187 compatibility source inventory

| Contract | Caller and decision | QA to run |
| --- | --- | --- |
| Renderer internals | Retain the viewport framebuffer reuse, empty-draw, sampler and QA adapters. Startup records backend selection once. The shipping renderer relies on the default `StandardDrawingPipeline`. | Run production startup, water and post-processing fixtures on WebGPU and forced WebGL. Check recovery and the WebGPU validation console. |
| Compilation, target and temporal state | Retain `DrawPreparation`, `SceneWarmup`, the post-processing precompile and the canvas/MRT frame-entry reset. The private node-frame ID and attribute/buffer bridges stay pinned to r187. | Exercise staged materials under nested shadows, water and temporal passes, then restart with preparation pending. |
| Struct buffers and dispatch | `GpuTreeImpostorBatch` and `GpuVoxelChunk` already index the indirect struct with `element(0)`. The tree culling path updates `dispatchSize`. | Run `test/gpu-indirect-struct-wgsl.test.js`, vegetation LOD and initial/late voxel publication. |
| Cube PMREM, TSL and color | Source search found no callers of the removed cube-UV mapping constant, node-valued `pixelationPass` settings, the old iridescence range or `library.addLight`. Verify representative numeric coercions, materials and cube PMREM visually before grading. | Compare WSC D00–D25 poses at the same exposure, time, weather and camera. Use the new PMREM and shader-sharing fixture as an API check. |
| Viewports and XR | Source search found no direct app XR camera or render-target viewport/scissor callers. Inspect effects using generated targets when changing pixel ratio or backend. | Run full-window and resized parity captures at device scale 1 and on a HiDPI display. |
| Dependency copies | The lockfile resolves `three@0.187.0` at the root and `0.185.1` under `procedural-texture-lab`. Vite already deduplicates `three` and aliases bare `three` to `three/webgpu`. Preserve the dependency's declared version when validating that the browser uses a single renderer copy. | Run `npm ls three --all`; expect the nested package in npm's dependency tree and `revision: "187"` in the world report. |

Tagged references for the changed contracts are [Renderer.js](https://github.com/mrdoob/three.js/blob/r187/src/renderers/common/Renderer.js), [Loader.js](https://github.com/mrdoob/three.js/blob/r187/src/loaders/Loader.js), [GLTFLoader.js](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/loaders/GLTFLoader.js), [MeshletDrawingPipeline.js](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/pipelines/MeshletDrawingPipeline.js), [SSR example](https://github.com/mrdoob/three.js/blob/r187/examples/webgpu_postprocessing_ssr.html), [SSGI example](https://github.com/mrdoob/three.js/blob/r187/examples/webgpu_postprocessing_ssgi.html), and [unwrapUVs.js](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/utils/unwrapUVs.js).

### Run first on the test machine

1. Pull `main`, record `git rev-parse HEAD`, and identify the GPU, driver, OS, browser, resolution and device scale. Use the same runtime asset corpus for control and candidate. Install dependencies and run the targeted tests before building. Record any failures and reproduce them on the control SHA where the test exists.

   ```sh
   git pull --ff-only origin main
   git rev-parse HEAD
   npm ci
   npm ls three --all
   node --test test/render-enhancements.test.js test/staged-draw-publication.test.js test/stylized-scene-asset-cache-lifecycle.test.js test/gpu-indirect-struct-wgsl.test.js test/stonehold-meshlet-qa.test.js test/r187-secondary-uv.test.js
   npm run lint
   npm test
   npm run build
   npx playwright install chromium
   ```

2. Start `npm run dev -- --port 5174` and keep the headed Chromium window in the foreground. Use [the movement QA protocol](../perf-qa.md) for settings, settled workload and report interpretation. Run the default matrix and recovery before comparing either opt-in. For forced WebGL, open `http://127.0.0.1:5174/?forceWebGL=1` in a fresh browser session. Check streaming, water, editor camera, workshop and walking. The recovery script also exercises a WebGPU-to-WebGL restart.

   ```sh
   npm run qa:perf:matrix -- --url http://127.0.0.1:5174 --headed --resources
   npm run qa:recovery -- --url http://127.0.0.1:5174 --out tmp/r187/recovery
   npm run qa:postprocessing:browser -- --url http://127.0.0.1:5174 --headed --outDir tmp/r187/postprocessing
   npm run qa:water:acceptance -- --url http://127.0.0.1:5174 --headed
   ```

3. Run the culling arms with identical cameras and scene settings. Compare ordinary draws, Hi-Z with one color attachment, and Hi-Z with zero. Use `meta.renderer`, `meta.occlusionColorAttachments`, GPU pass timing and visible coverage to confirm each arm. A `null` count means the proxy target did not allocate and no depth-only timing comparison is valid. Repeat with a near-plane crossing, quick 180° turn, reflection and shadow views, teleport and rebase. Review the scene against the ordinary-draw reference for missing objects.

   ```sh
   npm run qa:perf -- --url http://127.0.0.1:5174 --headed --qa settlement-approach --settle --revisit --turn-on-revisit --gpuTimings 1 --out tmp/r187/no-occlusion.json
   npm run qa:perf -- --url 'http://127.0.0.1:5174/?gpuOcclusion=1' --headed --qa settlement-approach --settle --revisit --turn-on-revisit --gpuTimings 1 --out tmp/r187/occlusion-color.json
   npm run qa:perf -- --url 'http://127.0.0.1:5174/?gpuOcclusion=1&r187DepthOnlyOcclusion=1' --headed --qa settlement-approach --settle --revisit --turn-on-revisit --gpuTimings 1 --out tmp/r187/occlusion-depth.json
   ```

4. Compare asset loading. The startup runner uses a fresh context and disables the cache by default. Repeat the pair with `--repeat-cache` for warm runs. Keep the same throttling profile or local proxy for the shaped-network pass. Check `sceneAssetRequests` and the existing startup resource timeline for duplicate GLBs, queue delay, concurrency, decode time and errors. Manually unload or teleport during a slow request and reload the same asset. Compare readiness against the default 20% improvement gate in §10.

   ```sh
   npm run qa:assets:startup -- --url http://127.0.0.1:5174 --headed --runs 3 --out tmp/r187/assets-default.json
   npm run qa:assets:startup -- --url 'http://127.0.0.1:5174/?r187PrioritizedRequests=1' --headed --runs 3 --out tmp/r187/assets-prioritized.json
   ```

5. Run the isolated comparisons serially. `drawing` uses the same dense source across arms, and `dense` compares against the authored LODs. At first run use 1080p and one or 16 copies, then increase toward representative workloads. Repeat the drawing command with `--lod-threshold 1` and `--lod-threshold 2` in distinct output directories. For compile A/B, run the same raw standard arm once with `--compile async` and once with `--compile on-demand` in fresh browser sessions and compare `compileMs`, `firstFrameMs` and `firstRenderCpuMs`.

   ```sh
   node scripts/run-stonehold-meshlet-qa.mjs --url http://127.0.0.1:5174 --suite drawing --modes baseline,native,native-hzb,visibility,visibility-hzb --resolutions 1080 --copies 1,16 --lod-threshold 1.5 --out tmp/r187/drawing
   node scripts/run-stonehold-meshlet-qa.mjs --url http://127.0.0.1:5174 --suite dense --resolutions 1080 --copies 1,16 --out tmp/r187/authored-lods
   node scripts/run-stonehold-meshlet-qa.mjs --url http://127.0.0.1:5174 --suite kit --modes baseline,native,visibility --out tmp/r187/kit-fallback
   node scripts/run-stonehold-meshlet-qa.mjs --url http://127.0.0.1:5174 --suite batch --out tmp/r187/batching
   node scripts/run-stonehold-meshlet-qa.mjs --url http://127.0.0.1:5174 --suite buffers --modes baseline,native --cycles 50 --out tmp/r187/buffers
   npm run qa:environment:parity -- --url http://127.0.0.1:5174 --r187 --out tmp/r187/environment
   ```

6. Inspect the screenshots under `tmp/r187/environment`. Compare the PMREM sphere roughness ladder across backends, the two-cascade sun movement, shader-sharing color parity, and visible SSR/GTAO/SSGI differences against their captured control. Save representative frames and rejected runs. Use the WSC camera manifest for world comparisons, and save retained A/B results under `docs/qa/three-r187/` with the evidence fields in §17. Record shader-builder counts as diagnostics and renderer/GPU-buffer estimates separately from driver memory. Restore the default flags by opening the base URL without the QA overrides. Keep rollout decisions pending until the relevant gates pass.
