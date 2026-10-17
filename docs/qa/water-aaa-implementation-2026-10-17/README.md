# Water appearance implementation — October 17, 2026

Status: runtime implemented; final world replay and paired performance verification in progress. This record will retain the completed results before the change is closed.

The [October 16 audit](../water-aaa-audit-2026-10-16/README.md) identified a repeated inland surface pattern, thick/stepped shoreline accents, broad coastal foam and limited local water character. The [implementation plan](../../plans/water-aaa-look-and-feel-plan-2026-10-16.md) supplies the intended art direction and conditional follow-up experiments.

## Delivered behavior

| Area | Implementation |
| --- | --- |
| Shoreline contact | The streamed render field retains signed surface-to-bed distance on dry vertices, so interpolation finds the physical zero crossing. Depth optics clamp only after sampling. Water lift is 2.5 cm with a depth taper; swash foam width is measured in surface meters. Object-intersection foam no longer draws a second line along the shallow bed. |
| Inland repetition | The crossed-cosine slope texture became a stochastic periodic slope field, with independent foam noise, continuous macro distortion and two differently oriented detail samples. The rational basis preserves the 320 m origin wrap. Lakes receive the same correction. |
| Foam | Fresh coastal foam and retreating trails have higher breakup thresholds and finer independent detail. Age decay leaves clear-water gaps. Inland disturbance depends on local incline and obstacles, rather than treating every normalized river direction as full-speed turbulence. |
| Water identity | A worker-generated RGBA8 appearance field carries explicit water kind, organic/cold context and local exposure. Kind is nearest sampled. Ground coverage decodes kinds before filtering, so a none/lake boundary cannot interpolate into a fictitious ocean. Sea-level lakes and slow rivers retain their identity. |
| River motion | Visual advection slows near banks and upstream of eligible rocks. A resumable RG8 obstacle field supplies local downstream disturbance and upstream slowing; its gradient bends visual flow around the obstruction. Gameplay currents and imported river courses remain canonical. |
| Reflections | Roughness filters the existing cube and planar captures with a fixed three-tap footprint. No new capture target or render pass is added. Diagnostic state reports validity, age, origin and pending cube face. |
| Banks and substrate | Cold/organic context changes marine bank and bed response; wet bank roughness/color follows the local water field. Dry crack detail is suppressed by shoreline wetness. Existing rooted and floating ecology remains in the placement system, with floating plants aligned to the reduced water lift. |
| Sea hierarchy | Large swell follows a bounded shore-distance exposure estimate shared with CPU surface queries. A lower depth-phase frequency improves coarse-grid crest sampling. Fine wind ripples retain their own shallow-water envelope, so shelter does not erase all surface detail. |
| Player interaction | Entry and resurfacing events plus traveled-distance sampling feed eight pooled ripple impulses. One preallocated mesh batch follows CPU water height, fades with age and masks points against the impulse's body/kind. Stationary swimmers and camera cuts do not emit a continuous wake. |
| Quality and lifetime | Low quality retains depth optics and explicit water identity while omitting expensive effects. Fields, reflection targets and ripple storage are bounded, prewarmed where appropriate and disposed with their owners. |

The runtime introduces no terrain-ID remapping or imported-geography migration. The CPU domain still reports nonnegative depth. Negative depth exists only in the derived render field to retain the shoreline crossing.

## Root-cause evidence

The production-shader diagnostic reproduced almost perfect correlation at the old 4 m and 8 m inland offsets on both WebGPU and WebGL. The candidate correlations are approximately 0.04–0.16. Shared-edge and advection-reset checks pass at local and million-meter coordinates. The initial fixture also had a favicon 404; its HTML was repaired, and the retained final fixtures have zero browser errors.

Fixed-time world controls showed that disabling water foam removed the broad pale coastal bands. Reflection/refraction controls were retained separately. This led to foam coverage/lifetime changes rather than changing sky exposure to hide them.

The original audit ran live water, while the implementation replay freezes shared water time at 123.4 seconds. Original-to-implementation screenshots therefore compare appearance and spatial defects, not identical animation frames. Controlled shader readbacks and fixed-time layer comparisons provide the narrower causal checks.

## Verification

- All **3,722 automated tests pass**, including signed bank crossings, explicit body kinds, negative-coordinate context continuity, rock wake direction/seams and bounded interaction state.
- Production build passes. Targeted lint passes for changed code. Full lint reports four pre-existing unused imports in the two archived sparse-grass capture scripts; those files are unchanged from the frozen baseline and are preserved as evidence.
- Final appearance fixture: **50 checks on each backend**, covering repetition, seams, advection resets, explicit sea-level lake/river identity and twelve phases of the actual coastal foam mask.
- Existing ocean foam fixture: **30 checks on each backend**, retaining origin precision, former-repeat rejection and crest-color behavior.
- Environment parity: **78 checks**, including actual production water, terrain/water classification, reflected scenery, motion, underwater optics and rebases on hardware WebGPU and WebGL.
- The final map replay uses the original thirteen saved poses, hardware headed Chromium, 1600 × 900, DPR 1, noon Highfield, manual weather off and full preparation gates. Performance results are recorded separately after that browser closes.

Hardware: NVIDIA GeForce RTX 4080, 16,376 MiB reported memory, driver 617.14. Frozen implementation runtime: `ad7ffb49185914a2fa5039c18bc047ebf4e3c289`; baseline: `68afbd1e5e52f83e4a24498491817732b6a1b401`.

## Resource and work budgets

| Resource | Bound |
| --- | --- |
| Primary + flow fields | Existing 12 bytes per vertex |
| Kind/context field | Additional 4 bytes per vertex, uploaded with each worker page |
| Local obstacle field | Additional 2 bytes per vertex; resident slots only, rebuilt from cached local rock manifests |
| 49 slots of 65 × 65 vertices | 3,726,450 source bytes total (3.55 MiB), up from 2.37 MiB; excludes CPU pages, staging and driver overhead |
| Obstacle producer | Resumable rows/rocks, approximately 0.65 ms per scheduled flush under the shared scenery budget; individual steps and uploads remain measurable costs |
| Reflections | Existing two cubes and optional one planar target; filtering samples them without allocating new targets |
| Player ripples | Eight impulses, 32 ring segments, fixed geometry arrays, at most 30 Hz geometry refresh; no viewport texture or full-frame pass |

Shader pattern coordinates remain chunk local with double-precision wrapped origins. The obstacle producer does not request additional rock manifests or grow residency. Readiness includes pending obstacle publications. Water-slot bytes are included explicitly in the visual resource report.

## Reproduction

Start a frozen implementation server, then replay into a new directory:

```powershell
rtk proxy node scripts/serve-world-visual-snapshot.mjs ad7ffb49185914a2fa5039c18bc047ebf4e3c289 5238
rtk proxy node scripts/run-water-visual-review.mjs --url http://localhost:5238 --out tmp/water-visual-replay --manifest docs/qa/water-aaa-audit-2026-10-16/manifest.json
```

The two commands run in separate terminals. The replay holds the shared hardware-browser lock. `--water-time live` enables normal animation; `--poses coast-09,river-06` selects a smaller review. `--variants foam-off,glint-off,normals-off,reflections-off,refraction-off,swell-off,height-offset-off` creates labeled water-layer controls. Water controls leave the ground material in its normal state, so they must not be described as disabling ground swash.

Useful acceptance commands:

```powershell
rtk proxy node scripts/run-world-visual-grass-qa.mjs --fixture water-appearance --url http://localhost:5238 --out tmp/water-appearance-fixture
rtk proxy node scripts/run-world-visual-grass-qa.mjs --fixture water-foam --url http://localhost:5238 --out tmp/water-foam-fixture
rtk npm run qa:environment:parity -- --url http://localhost:5238
rtk npm run qa:perf:matrix -- --headed --url http://localhost:5238
```

Independent visual options include `water.foam.enabled`, `water.riverSurface.obstacles`, `water.riverSurface.glintStrength`, `water.interaction.enabled` and `enhancements.waterReflections.roughnessFiltering`. These are configuration/development controls, with no added implementation UI in gameplay.

## Limits and conditional follow-up

This pass retains the existing terrain/water mesh resolution. It does not add a spectral ocean, global fluid solver, foam-history targets or new bank meshes. Those are conditional prototypes in the plan, requiring visual benefit and a separate measured budget. Local exposure is a shore-distance proxy rather than a wind-fetch simulation. Reflection filtering is a bounded spatial approximation rather than a prefiltered radiance hierarchy.

Existing geography-aware ambience, water footsteps, falls and underwater transitions are preserved. The visual audit does not establish a need for additional sound assets. New species/art packs, ice gameplay and hydraulic bank erosion are not inferred from the sampled stills.

The browser still warns about the existing tree-impostor manifest/source mismatch and runtime-bake fallback, plus a Three.js deprecation. The same fallback appears in the baseline. CLI impostor validation passes; this record does not certify that runtime asset path. Zero capture errors does not mean zero warnings.
