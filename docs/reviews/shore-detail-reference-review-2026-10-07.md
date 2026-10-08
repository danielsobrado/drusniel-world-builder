# Shore details reused from grass-test

All five reuse opportunities are implemented: lake-wave anchoring for lily
pads, local rock waterlines, coastal habitat placement, boulder support fitting,
and consistent surface anisotropy. This builds on the
[water-body rendering pass](water-body-reference-review-2026-10-07.md).

The donor is the user's `F:\Development\grass-test`; copying its code was
explicitly authorized. Its formulas and placement behavior are adapted to this
engine's canonical metres, streamed manifests, and floating origin.

## Reused behavior

| Behavior | Donor source under `grass-test/src` | Result here |
| --- | --- | --- |
| Floating lake flora | `water/LakeFlora.js`, `water/WaterMaterial.js` | Water and pads share the two broad wave definitions, converted from 2.8 donor units per metre. Shoreline fading and current damping agree. Packed canonical phases survive rebases. The plant clock continues during underwater suspension of land preparation. |
| Wet bank rocks | `water/RiverDetails.js`, `world/RockSurface.js`, `world/BeachScatter.js` | Each rock resolves nearby ocean, lake, or river height during manifest preparation. Its material uses that local level for darkening, gloss, and algae. Dry inland rocks remain dry; underwater wetness continues below the former two-metre cutoff. Fall contact expands the splash band. |
| Coastal ecology | `world/BeachScatter.js`, `world/BeachStarfish.js`, `world/CoastalGroundcover.js` | Shells, starfish, driftwood, and groundcover use species-specific ocean reach, dampness, clusters, and slope limits. Instances align to the terrain normal. Inland lakes at sea level do not acquire coastal debris. |
| Boulder support | `water/RiverDetails.js` | Centre and footprint samples seat rocks toward their lowest support. Unsupported cliff-spanning candidates are rejected. Render instances and collision consume the same fitted canonical records. |
| Texture filtering | `rendering/SurfaceAnisotropyController.js` | Eligible mipmapped surface textures receive hardware-clamped anisotropy as materials compile, including streamed TSL textures. Defaults are 16 on desktop and at most 4 on mobile. Render targets, depth textures, and floating-point data fields retain their existing filtering. |

The implementation is split into small helpers:
[lake waves](../../src/editor/water/LakeSurfaceWaves.js),
[surface placement](../../src/editor/stylized/DetailSurfacePlacement.js),
[shore habitat](../../src/editor/stylized/shoreHabitat.js),
[rock support](../../src/editor/stylized/rockGroundFit.js),
[rock water contact](../../src/editor/stylized/localRockWater.js), and
[anisotropy](../../src/render/SurfaceAnisotropyController.js).

Ocean distance is worker-prepared and read through a bounded fallback cache.
Both paths exclude lake and river water from the coast classification. Rock
fitting remains a yielding manifest stage with atomic publication. Water
contact probes are ordered nearest first: submerged rocks normally resolve with
one query, while dry banks retain the complete footprint search. No new GPU
water field, GPU readback, scene traversal per frame, or per-frame water-contact
queries were added. Azgaar terrain IDs and persisted biome definitions are
unchanged.

## WebGL correction

The comparison fixture exposed an existing instance-matrix binding defect:
WebGL beach details formed oversized triangles. The shared instance factory
now retains the standard matrix attribute for WebGL and keeps the storage
attribute for WebGPU. Production callers pass their renderer to select the
correct path. This also covers trees, bushes, rocks, objects, and roadside
details using that factory.

## Verification

- Full Node suite: **3,275 tests passed**. After the nearest-first rock-contact
  optimization, all **28 focused tests** passed, including the eight new
  behavioral tests and existing movement/collision preparation checks.
- **23 shore-detail checks passed** on hardware WebGPU and WebGL: lake motion,
  coastal filtering, support rejection, four-kilometre rebases, and backend
  parity. Both backends reported zero browser errors.
- **78 existing environment/water checks passed**, covering rivers, falls,
  foam, beach water, deep seas, lakes, reflections, and underwater optics.
- Final lint, production build, and `git diff --check` passed. Vite retains its
  existing large-chunk advisory.
- The gallery's six panels, twelve images, and both backend toggles passed a
  browser check without errors.

The dense beach fixture deliberately uses 512 candidates per chunk; production
remains at 96. It changes from 254 ocean and 254 inland-lake instances to 137
ocean and zero inland-lake instances. The support fixture changes from four
candidates to three supported rocks. These are isolated production-material
and placement fixtures, rather than a claim of pixel identity between worlds.

See the [comparison gallery](../../tmp/shore-details/comparison.html),
[shore checks](../../tmp/shore-details/after/report.json), and
[water regression checks](../../tmp/shore-details/water-regression/report.json).

## Hardware performance

Captures ran sequentially in headed Windows Chromium on the NVIDIA RTX 4080
Lovelace adapter, with WebGPU active, no software fallback, settled preparation,
and no concurrent builds, tests, or runtime edits. The frozen baseline contains
1,151 JS/YAML sources from `83eed6a9b9ad3522d7d94e05e4b264571c6d3d2c`, captured
before this pass. The implementation was committed by the user as
`88635f94db962f18a36fa01b8c76ce8ad117988a` while QA continued. The remaining runtime
edits are comments only.

### Chunk crossing

The deterministic route runs for 14 seconds after eight seconds of warmup and
settling, using the same spawn, seed, density, and run speed.

| Capture | Average FPS | Frame p95 | Hitches above 33.3 ms |
| --- | ---: | ---: | ---: |
| Baseline 1 | 149.48 | 8.60 ms | 0 |
| Baseline 2 | 136.37 | 11.17 ms | 1 |
| Intermediate implementation 1 | 143.76 | 9.10 ms | 0 |
| Intermediate implementation 2 | 122.38 | 13.55 ms | 5 |
| Final implementation | **153.48** | **8.50 ms** | **0** |

The final version includes the underwater clock correction and removal of
redundant water-contact probes. Every capture passed the frame-time, hitch-rate,
and collision gates. The final route started and ended with preparation queues
empty; collision p95 was 0.10 ms. Run-to-run variation prevents attributing the
entire FPS difference to the optimization.

Prepared placement arrays increased from 89,188,460 to 105,095,564 bytes:
approximately **15.17 MiB extra**, within the existing 192 MiB cache budget.
Final measured placement preparation averaged 0.165 ms per frame. The rock-fit
counter is cumulative work including warmup, not an individual frame cost.

### Water transitions

The same discovered ocean route traverses dry ground, swimming, diving,
surfacing, and return to dry ground. All captures completed the transitions
with stable body identity and origin, active projected caustics, and zero
browser/GPU validation errors.

| Unprofiled capture | Average FPS | Frame p95 | Hitches | Caustic effect maximum | Acceptance |
| --- | ---: | ---: | ---: | ---: | --- |
| Initial baseline | 170.34 | 7.80 ms | 1 | 23.60 ms | 12/13 |
| Initial updated | 159.40 | 8.90 ms | 3 | 24.30 ms | 12/13 |
| Repeated baseline | 155.48 | 9.80 ms | 6 | 0.40 ms | **13/13** |
| Repeated updated | 151.12 | 9.60 ms | 4 | 0.70 ms | **13/13** |

Both initial runs failed only the maximum post-effect CPU gate. Their isolated
spikes occurred at different points on the route. A diagnostic CPU profile of
the baseline did not reproduce the spike: all 13 gates passed, and no recorded
post-effect frame exceeded 4 ms. Profiling introduced a 526.8 ms frame stall,
so its FPS/max-frame numbers are excluded from the performance comparison.
The cause of the initial spikes remains unconfirmed; this pass does not claim
to fix that intermittent baseline behavior.

Repeated unprofiled runs passed all 13 gates. The updated repeat averaged
2.8% fewer FPS than its late baseline, with a slightly lower frame p95 and
fewer hitches. The whole caustic pipeline includes the scene render: its
repeated maximum was 28.60 ms for baseline and 9.00 ms for updated. The small
effect-only numbers do not describe that complete pipeline.

Raw captures, the diagnostic profile, and provenance are retained under
`tmp/shore-details/`. Key results are
[final movement](../../tmp/shore-details/perf-after-final.json),
[repeated baseline water](../../tmp/shore-details/water-before-repeat.json), and
[repeated updated water](../../tmp/shore-details/water-after-repeat.json).

## Reproduce

With the app serving on port 5183:

```powershell
rtk proxy node scripts/run-shore-details-qa.mjs --url http://localhost:5183 --out tmp/shore-details/after
rtk proxy node scripts/run-water-acceptance-qa.mjs --headed --url http://localhost:5183 --out tmp/shore-details/water-after-repeat.json
rtk proxy node scripts/run-perf-qa.mjs --headed --url http://localhost:5183 --qa chunk-cross --warmup 8 --duration 14 --speed run --settle --out tmp/shore-details/perf-after-final.json
```
