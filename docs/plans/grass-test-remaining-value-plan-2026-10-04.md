# Useful remaining work from grass-test

Date: 2026-10-04  
Status: implemented; integrated hardware acceptance in progress (2026-10-05)  
Host audited: `1a876ea`, clean working tree before this documentation change  
Donor audited: `F:\Development\grass-test` at `95cc587`  
Scope: selective additions to the current world builder, with its existing world and rendering ownership

## Recommendation

Establish a current integrated baseline, add startup/shader diagnostics, and test
whether finer vegetation visibility pays for its CPU and upload cost. Then add
local water reflections, followed by optional cascaded shadows and richer snow
shading. Keep automatic roadside dressing as a separate, lower-priority feature.

Water reflections offer the clearest remaining visual improvement. Diagnostics
and vegetation visibility come first because recent ports have changed the
workload, and the existing performance investigation still has open frame-time
and construction-backlog acceptance items.

The original assessment below was based on source inspection. Implementation,
settings, verification and remaining acceptance are recorded in
[the implementation report](../grass-test-improvements-2026-10-05.md).
Effort labels describe relative complexity, not delivery dates or measured speedups.

## What is already present

The September [merge plan](grass-test-merge-plan-2026-09-24.md) and
[handover](grass-test-handover.md) are historical records. Their open-item lists
must not be treated as the current implementation backlog.

| Area | Current evidence | Decision |
| --- | --- | --- |
| Meadow grass, wind, interactions, trees and tropical/alpine vegetation | `src/editor/stylized/meadow/`, `StylizedSurfaceViewBase.js`, `editor.config.yaml` | Improve specific gaps; do not port these systems again. |
| Characters, settlement residents, serpents, touch controls, scenic tours and renderer recovery | [Exploration migration](../gods-end-migration.md), `src/editor/exploration/ExplorationRuntime.js` | Already integrated; preserve their existing ownership. |
| Rain, snowfall and cinematic light shafts | [Weather migration](../gods-end-weather-migration.md) | Code is present; integrated visual/performance acceptance remains a separate task. |
| Snow textures, glints, footprints, wake and powder | [Texture port](../gods-end-texture-port.md), `SnowSurfaceShading.js`, `deformation/`, `powder/` | Only the missing surface treatment belongs in this plan. |
| Village objects, lanterns, plants and material library | [Objects and textures](../gods-end-objects-and-textures.md) | Reuse published assets; another bulk asset import has little value. |
| River detail, foam, sea detail, refraction and selective SSR | `RiverSurfaceShading.js`, `StylizedWaterMaterial.js`, [post-processing](../rendering/post-processing.md) | Add local scene-reflection sources, preserving existing optics and post-processing. |
| Frame budgets, draw preparation, Hi-Z and tree-impostor culling | `DeferredWorkBudget.js`, `src/render/preparation/`, `src/render/occlusion/`, `stylized/impostor/` | Target remaining vegetation batches; do not replace these systems. |
| Loading progress and asset telemetry | `LoadingTracker.js`, `AssetStartupTelemetry.js` | Extend diagnostics rather than adding another loading interface. |
| Imported route geometry and trail grading | `src/editor/import/AzgaarRoutes.js`, `src/editor/world/TrailGrading.js` | Reuse these for any roadside dressing. |

## Ordered delivery

| Step | Useful gap | Priority | Effort | Depends on |
| --- | --- | --- | --- | --- |
| G0 | Current integrated acceptance and reference scenes | Required baseline | Small-medium | Current checkout |
| G1 | Startup spans and shader/resource creation attribution | High | Small-medium | G0 |
| G2 | Budgeted visibility selection for ground detail and understory | High, conditional on measured benefit | Medium | G0-G1 |
| G3a | Bounded local water reflection probes | High visual value | Medium-high | G0-G1; compatible visibility policy |
| G3b | Budgeted planar reflections on flat water | Optional quality tier | Medium-high | G3a |
| G4 | Cascaded sun shadows | Medium | Medium | G0-G1; compatible visibility policy |
| G5 | Wind-shaped, slope-aware snow surface detail | Medium | Medium | G0-G1 |
| G6 | Deterministic roadside lantern placement | Lower; separate feature | Medium-high end to end | Route identity and generated-object editing contract |

G2 is a measured experiment, not a prerequisite to shipping every visual feature.
If it does not help, retain current visibility and continue with G3. G4 and G5
can be implemented independently after their baseline fixtures exist. Each row
should remain a reviewable change with its own evidence.

## G0. Validate the current integrated scene

**Gap:** the latest ports do not share one fully validated performance snapshot.
The [movement investigation](../perf-investigation-2026-10-04.md) explicitly
measures a frozen runtime that excludes later weather/workshop changes. The
weather migration records deferred browser acceptance; the texture migration
records an invalid movement comparison caused by concurrent workload.

1. Freeze the starting revision, configuration, world/seed, viewport, adapter
   and runtime asset versions. Record any local patch. Keep unrelated runtime
   edits and other rendering tabs out of the measurement session.
2. Run the existing checks for weather, imported assets, textures, exploration,
   post-processing and water as applicable. Resolve newly exposed failures
   before attributing a result to a new port.
3. Record three standard movement baselines, dense forest/ground-cover cases,
   a sustained route with a turn/revisit, approaching construction and actual
   swimming/diving. Record settle duration and post-stop recovery separately.
4. Save deterministic reference poses: river with trees/buildings, lake/sea with
   off-screen reflectors, dense understory during turns, a shadowed building,
   snow slopes and a settlement road. Freeze time, weather and animation time
   for still-image comparisons; add moving captures where temporal behavior matters.

Use the donor as an appearance reference, not as a same-workload benchmark: its
fixed landscape differs from this streamed world. Fixtures must use published
local assets and run without the donor checkout.

**Done when:** reports identify the exact workload and actual hardware backend;
all failures and unmeasured items are explicit; the current integrated scene has
a reproducible baseline. A failed gate remains a failure, not a new acceptable
threshold. Existing regressions are tracked separately from the new feature.

## G1. Add shader and startup diagnostics

**Donor:** `src/debug/LoadingProfiler.js`, `src/debug/gpuCreationHooks.js`,
`src/rendering/ShaderCompileDiagnostics.js`, `scripts/browser/measure-loading.mjs`.

**Host:** `src/editor/performance/AssetStartupTelemetry.js`,
`src/editor/ui/LoadingTracker.js`, `src/render/preparation/`,
`scripts/run-asset-startup-qa.mjs`.

- Extend the existing report with overlapping startup spans: config, asset
  decode/transcode, terrain/scenery readiness, material construction, pass
  preparation, first frame and interactive readiness. Do not sum overlapping
  spans into total startup time.
- Add opt-in material-family counts and CPU timing for node building, pipeline
  creation and initial resource uploads. Include all preparation paths; wrapping
  only `compileAsync` misses the actual-pass warmup already used here.
- Add generated shader size/sample diagnostics where the pinned renderer exposes
  them reliably. Keep any internal Three.js hooks in a small adapter with cleanup
  on disposal and recovery. Unsupported hooks report unavailable.
- Reuse existing loading UI. Put detailed technical output in reports/debug tools.
  Keep collection bounded and disabled by default.
- Measure cold and repeat visits separately, with explicit browser-cache policy.
  A single slow run is not evidence of a regression.

**Acceptance:** failed/cancelled spans close correctly; recovery installs hooks
once; disposal restores them; disabled mode collects no history. Compare startup
reports and a normal movement run with diagnostics disabled. CPU API-call time
must never be labeled GPU execution time. Any later GPU timestamp measurements
must be reported separately with capability support.

## G2. Cull individual ground-detail instances conservatively

**Donor:** `src/foliage/InstanceViewCuller.js`,
`src/rendering/TurnEnvelopeFrustum.js`; integration examples in `UnderstorySystem.js`
and `MeadowDetails.js`.

**Host:** `src/editor/stylized/StylizedGroundDetailView.js`,
`StylizedBushView.js`, `lod/StylizedLodRuntime.js`, `lod/InstanceAnchor.js` and
`src/editor/performance/DeferredWorkBudget.js`.

The host already culls whole instanced meshes and individual tree impostors.
The useful gap is finer visibility within ground-detail/understory batches.

1. Instrument eligible instance counts, submitted counts, visibility CPU time
   and upload bytes before adding filtering. Start with ground detail and the
   tropical layer; expand to bushes only if those results justify it.
2. Cache padded bounds per placement revision. Include wind displacement and
   use local coordinates relative to `InstanceAnchor`; convert camera/frustum
   coordinates consistently after rebasing.
3. Adapt movement/rotation thresholds, a configurable turn margin and incremental
   selection. Charge work to the existing shared allowance; do not add the donor's
   independent per-system progress floors or a second global budget.
4. Preserve complete placement manifests, biome rules, density and collision
   records. Visibility produces disposable render selections only. Publish
   instance matrices and all companion attributes together, with stable IDs.
5. Keep a conservative selection while work is pending. A teleport, large turn,
   camera switch, resize or projection change must not expose missing vegetation
   while waiting for a stale selection to rebuild. Fall back to complete resident
   batches when the old envelope no longer covers the view.
6. Design for every render pass. Main-camera filtering must not remove off-screen
   shadow casters or objects visible in reflection captures. Initially filter only
   eligible non-shadow-casting detail and use complete resident sets for other
   passes, or provide a verified union/per-pass selection. Restore pass state.

**Acceptance:** correct coverage at frustum edges and during fast turns; stable
negative/large-coordinate and origin-shift behavior; no collider or generation
changes; coherent attributes during partial work. Compare straight movement,
turn/revisit and dense scenes with identical resident populations. Ship enabled
only if frame-time benefit exceeds run variance and CPU/uploads/settle do not
regress. Fewer submitted instances alone is insufficient.

## G3. Reflect the local scene in water

**Donor:** `src/water/WaterReflection.js`, `ReflectionBudget.js`,
`PlanarReprojection.js`, `reflectionMask.js` and their use in `WaterSurface.js`.

**Host:** `src/editor/stylized/RiverSurfaceShading.js`,
`StylizedWaterMaterial.js`, `src/editor/water/`, `InfiniteTerrainView.js` and
`src/render/postprocessing/`.

The river shader currently derives reflected color from a sky gradient. Selective
SSR already exists, but cannot supply scenery absent from the screen.

### G3a. Local cached probes

- Add a reflection resource owner for the terrain view, separate from water
  shading. Start with one bounded local probe around the active water area;
  never allocate a capture per terrain chunk.
- Select anchors from canonical water data. Respect resident availability and
  use a sky fallback while capture data is pending, invalid or unsupported.
- Refresh on meaningful local scene/lighting changes with coalescing and a
  bounded cadence. Do not invalidate every capture for every animated blade.
  Teleports, world loads, origin changes and device recovery need explicit handling.
- Exclude the water's own reflection path and overlays from captures; prevent
  recursive captures. Render off-screen scene content using a valid capture
  selection rather than the main camera's compacted list.
- Keep targets in scene-linear HDR. Define one reflection weighting contract
  with Fresnel and SSR so reflected energy is not added twice. Preserve existing
  refraction, foam, underwater transitions and viewport-copy policy.

### G3b. Optional planar captures

- Add planar capture for eligible lake/sea surfaces on an explicit higher quality
  setting. Sloping river reaches and waterfalls continue using probe/sky fallback.
- Start with one selected planar surface and a bounded target pool. Use the donor's
  cadence, overscan and rotation reprojection concepts, with fallback outside the
  valid capture. Translation/parallax error remains a refresh trigger.
- Budget actual scene passes. A cube probe update can cost six renders; limiting
  the number of surfaces alone does not bound that work. Face-by-face scheduling
  requires a deliberate implementation and must publish a coherent completed probe.
- Prewarm capture variants, integrate history invalidation, and release/recreate
  targets correctly on resize, disposal and renderer recovery. Disabled quality
  must allocate no capture targets and perform no capture work.

**Acceptance:** a bank tree/building remains reflected as it leaves the screen;
fast turns and movement do not leave obvious stale-image swimming; no seams
between water chunks; correct day/night, large-coordinate, origin and underwater
behavior. Validate probe-only, planar-only and SSR combinations. Measure capture
spikes, target memory, pass counts, startup and the full water acceptance route.
Keep new quality modes opt-in until their measured costs are documented.

## G4. Add optional cascaded shadows

**Donor:** `src/rendering/CinematicLighting.js`, especially its `CSMShadowNode`
setup, cascade fade and mobile single-map fallback.

**Host:** `src/editor/stylized/StylizedSkyView.js`, the existing sky light uniforms,
quality settings and render preparation.

The host uses one directional shadow map with a fixed extent. Adapt cascade
management around that same lighting authority; do not import a second sky or sun.

- Start with two cascades on an explicit high-quality setting. Retain the current
  single-map path for lower tiers, mobile and unsupported configurations.
- Keep shadow distance independent of the very distant terrain backdrop. Tune
  splits, bias and fading using nearby buildings, foliage and sloping terrain.
- Update the active camera and cascade bounds on mode/FOV changes, resize and
  floating-origin rebases. Verify jittered main passes and reflection cameras do
  not accidentally leave cascades configured for the wrong view.
- Include appropriate off-screen casters, existing proxy policies and draw
  preparation. Make cascade resource ownership and disposal explicit.

**Acceptance:** improved nearby shadow detail at useful distance; no visible
split bands, rebase jumps or new self-shadow artifacts in fixed and moving
captures. Record shadow passes, memory and frame tails in forest, construction
and combined water-reflection scenes. Enable by preset only after budget evidence.

## G5. Finish the useful snow surface treatment

**Donor:** `src/world/SnowSurface.js`, `snowNoiseNodes.js` and `snowShadingNodes.js`.

**Host:** `src/editor/stylized/SnowSurfaceShading.js`, `SnowDetailShading.js`,
`deformation/FootprintShading.js`, `deformation/SnowWakeShading.js` and
`src/editor/terrainMaterial.js`.

The missing portion is wind-shaped fine relief, detail blending over multiple
scales, better steep-slope projection and packed-path appearance. Existing snow
coverage, glints, texture leases, footprints, wake and powder remain the base.

- Split noise/relief math, appearance settings and material composition into
  focused modules. Reuse the current wind direction and snow/path masks.
- Add filtered ridges and ripples, fading detail by pixel footprint. Improve
  slope-aware texture projection and compacted-path roughness/color. Start with
  shading/normal detail; do not change authoritative terrain height or collision.
- Compose with the existing deformation response without applying footprint or
  wake depth twice. Keep snowless regions on a cheap coherent branch.
- Use bounded, origin-stable coordinates and continuous neighboring-chunk phases.
  Preserve texture sharing and sampler limits; inspect generated shaders for
  repeated node expansion before adding more layers.

**Acceptance:** visible improvement at walking distance, on steep slopes and
on paths; no sparkle/shimmer regression with temporal AA off; consistent appearance
across chunk borders and origin shifts. Capture snow, rain-to-snow and snowless
cases; report shader size, preparation time, sampler use and frame cost.

## G6. Optional roadside dressing

**Donor:** `src/world/PathLanterns.js` supplies route projection, paired offsets,
orientation and exclusion checks. Its fixed authored stations and full route
scans do not transfer directly to a campaign-scale world.

**Host:** `src/editor/import/AzgaarRoutes.js`, `src/editor/world/TrailGrading.js`,
settlement queries, existing object catalogs, and generated-object editing.

This is more than copying a small placement helper. Use a separate feature change
after confirming how world-generated props support promotion and suppression.

- Limit the initial feature to lantern pairs along imported roads near settlements,
  with explicit density and residency caps. Arbitrary painted road tiles lack a
  semantic centerline and are outside the first version.
- Reuse indexed, graded route samples in canonical meters. Derive candidates from
  stable route identity, station distance and side; handle duplicate/missing source
  route IDs explicitly rather than relying on array order or camera traversal.
- Reject path, river, slope, building and traversal-clearance conflicts. Recompute
  only the affected local neighborhood after terrain/content changes. Keep distant
  roads unloaded; batch repeated props and their existing collision representations.
- Treat results as derived placements. Store source/rule provenance and user
  suppression/overrides; promote deliberate edits through ordinary semantic
  commands. Undo, redo and save/load must preserve these decisions without saving
  generated meshes or causing suppressed lanterns to reappear.
- Reuse the existing lantern assets and emissive materials. Dynamic lights and
  broader road furniture are separate scope, not implied by the placement port.

Follow the [geometry framework](../architecture/workshop-geometry-framework.md),
[implementation plan](workshop-geometry-framework-plan-2026-08-19.md) and
[behavior review](../research/tiny-glade-workshop-behavior-review-2026-08-19.md)
where generated details interact with construction/workshop semantics. World
route provenance must not be forced into an unrelated workshop definition.

**Acceptance:** deterministic placements through reload, different visit order
and rebasing; no road obstruction; correct collider readiness; local invalidation;
stable promotion/suppression through save/load and undo/redo. No one-scene-object
per decorative component and no whole-route rebuild for a local edit.

## Work deliberately excluded

- Replacing streamed Azgaar terrain with the donor's static landscape, terrain
  bake, boundary barrier or fixed-coordinate biome regions.
- Replacing player physics with Rapier, or introducing a second renderer,
  post-processing graph, audio owner, lifecycle manager or frame scheduler.
- Reimporting already published characters, village houses, plants or textures.
- Replacing the current meadow atlas or adding another minimap/loading screen.
- Porting underwater visibility changes wholesale: the host deliberately suspends
  land preparation, and any extra draw suppression needs separate evidence.
- A standalone anisotropy port: existing materials already configure anisotropy;
  investigate a specific filtering defect before adding another controller.
- New simulation behavior for cosmetic NPCs, a general road editor, dynamic
  lantern lighting or physics-changing snow. None follows from these donor ports.

Keep Azgaar standard biome IDs `0-12`, deterministic custom IDs `32-254`, native
semantic persistence, floating-origin precision and existing local edit behavior.
There is no legacy terrain-ID migration work in this plan.

## Shared validation and completion rules

Follow [player movement performance QA](../perf-qa.md). Commands below are for
native Windows PowerShell with a dev server already running; use the documented
Windows bridge if executing from WSL. Run captures sequentially.

```powershell
rtk npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 12 --speed run --settle --drain-seconds 15 --out tmp/grass-test-remaining/standard.json
rtk npm run qa:perf -- --headed --qa diagonal --warmup 8 --duration 60 --speed run --settle --revisit --turn-on-revisit --drain-seconds 15 --out tmp/grass-test-remaining/revisit.json
rtk npm run qa:perf:matrix -- --headed
rtk npm run qa:weather:browser -- --headed --url http://localhost:5173
rtk npm run qa:gods-end-assets -- --headed --url http://localhost:5173
rtk node scripts/run-procedural-texture-qa.mjs --url http://localhost:5173/
rtk npm run verify
```

Use separate filenames for each repeated baseline/candidate run. Extend existing
harnesses for new fixtures and counters rather than creating a competing harness.
Run the checks affected by each implementation, then the required integrated
checks; this documentation-only plan does not require browser or runtime tests.

- Require actual hardware WebGPU, successful settle, complete captures and no
  browser/shader errors. Keep scene density, population, LOD distances and asset
  readiness identical for performance comparisons.
- Compare at least three unprofiled runs per side for claimed improvements.
  Profile separately for attribution. Report p50/p95/p99, hitches, CPU, uploads,
  draw/pass counts, retained memory, readiness and post-stop recovery, not FPS alone.
- Preserve existing matrix gates, including p95 at most 33.3 ms, hitches at most
  2%, collision acceptance and the full water route. Those stress gates do not
  establish the stricter 144 Hz / 6.94 ms target. Track the open strict target
  independently and explain changes outside observed baseline variance.
- Keep optional visual features independently switchable. Record their incremental
  cost and combined cost before changing default presets. Disabled paths must
  release owned resources and avoid background work.
- Add behavioral tests for the new contracts: deterministic selection/publication,
  pass restoration, invalidation, resource lifetime and semantic edits. Verify
  appearance in the actual renderer; source-text assertions alone are insufficient.
- Record donor provenance and existing licenses for copied code/assets. All runtime
  paths must resolve locally without access to `F:\Development\grass-test`.
- A change is complete only with its implementation, appropriate tests, hardware
  evidence where rendering changes, updated documentation and stated limitations.
  If an experiment has no useful measured benefit, close it with that evidence
  rather than enabling additional production complexity.

## Implementation checklist

- [ ] G0: current integrated baseline and reusable visual fixtures
- [ ] G1: opt-in shader/startup diagnostics
- [ ] G2: vegetation visibility experiment and evidence-based adoption decision
- [ ] G3a: bounded local water probes
- [ ] G3b: optional planar captures and SSR integration
- [ ] G4: optional cascaded shadows
- [ ] G5: richer snow surface treatment
- [ ] G6: optional semantic roadside dressing

The first implementation slice is **G0 + G1**. The first new rendering feature to
evaluate is **G2**; the first appearance feature is **G3a**.
