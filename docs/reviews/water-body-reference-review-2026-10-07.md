# Sea, beach and lake reference pass — 2026-10-07

Reference: the user's `F:\Development\grass-test`, including `WaterMaterial.js`,
`seaDetail.js`, `CoastField.js`, `GroundMaterial.js` and the beach, lake and
underwater screenshots. The user explicitly authorized direct reuse of this code.

## Implemented

- Separate sunny/storm sea palettes: aquamarine lagoon, clear shelf, dark blue
  offshore water. RGB absorption and depth distances are converted from the
  donor's 2.8 units per metre. Inland water keeps its existing optical response.
- Sea wave normals drive refraction and sky reflection. The sea now has the
  donor's sharp/broad sun glint, with roughness from the detail texture's filtered
  second moment, and a stronger grazing reflection.
- Breaking surf and contact foam sample the donor's packed foam texture instead
  of smooth procedural blobs. Shoreline foam uses the same height-based front,
  clock and wrapped origins on water and sand, with complementary ground/water
  coverage. Sea foam uses the pale coastal color.
- Warm sand, a pale submerged bed, reef mottling and shallow caustics, following
  the reference's beach treatment. These execute inside a coastal band. Separate
  wrapped origins preserve every grain/noise/wave frequency at planet scale.
- Terrain reads the existing water field without another sampler to distinguish
  ocean from elevated lakes and inland river reaches. It allocates no per-slot
  texture or additional streaming data. A shared 1×1 neutral texture covers the
  period before a water slot is available.
- Beach bands use interpolated rendered height, keeping narrow swash fronts
  smooth between terrain vertices instead of stepping over height-map texels.
- Shared vertex/fragment texture bindings are remapped by shader symbol when
  unused samplers are removed. Uniform buffer aliases retain their actual GPU
  layout. This fixes the full-world terrain pipeline exposed by the water-field
  read; two regression tests cover shared texture indices and buffer collisions.
- Still inland water can use the existing planar capture. Flowing river faces
  remain ineligible. Cached reflections distort with the same ripple normals as
  refraction. Desktop defaults now enable the budgeted reflection pool at 128
  pixels and a 500 ms capture interval; the high preset uses 256/250. Mobile and
  explicit opt-outs remain available.
- The existing underwater optics already port the reference's extinction,
  caustics, sun shafts and Snell window. Optional clocks make their appearance
  fixtures deterministic; production uses the existing renderer clock.

Generation, hydrology, swimming heights, collision, biome IDs and persistence
are unchanged. The sand treatment changes the derived ground material.

## Visual and code validation

The production-material fixture includes beach animation and a 4096 m rebase,
calm/storm deep water, still lake ripples, cube-only versus planar reflection,
underwater shelf, Snell window, deep water and an underwater rebase. Lighting
targets are rebased with the scene. The reference and updated captures use the
same scene and cameras.

- 78 pixel checks passed on hardware WebGPU and WebGL, with zero browser errors.
- Beach rebase mean channel error: 0.0045/255 on WebGPU.
- Underwater rebase mean channel error: 0.6243/255 on WebGPU.
- Calm lake animation changes 0.0571/255 across the whole image; planar
  eligibility changes 0.4883/255 against the same cube-only capture.
- 238 focused water/terrain tests and all 3267 repository tests passed.
- Lint and production build passed. Build retains the existing bundle-size warning.

The complete terrain bake graph is compiled and captured on hardware WebGPU,
using the same adapter-limited device policy as the app. Coastal production
terrain is also compared across both backends with the material bake disabled:
the complete bake graph exceeds WebGL's existing 16-texture-unit limit. The
water, reflection, swash and sand fixtures use both backends.

Artifacts under ignored `tmp/water-bodies/` include the fixed before/after
captures, [interactive comparison](../../tmp/water-bodies/comparison.html),
[pixel-check report](../../tmp/water-bodies/after/report.json), full/focused test
logs and the frozen baseline source snapshot. The baseline capture-only run
verifies the hardware backend and browser errors; new behavior checks apply
to the updated implementation.

## Hardware performance comparison

Both servers use the same current engine and assets. The baseline substitutes
the water/ground/reflection modules and configuration frozen before this pass
(`2bd8517`); working files are never rolled back. Browser captures run
sequentially under the shared hardware QA lock on the NVIDIA Lovelace adapter.
Builds and CPU test suites run outside these measurements.

| Settled chunk-cross | Baseline FPS / p95 | Updated FPS / p95 | Hitches, baseline / updated |
| --- | --- | --- | --- |
| 1 | 142.20 / 9.20 ms | 148.56 / 8.80 ms | 1 / 1 |
| 2 | 134.16 / 11.78 ms | 146.62 / 8.90 ms | 2 / 1 |

All four runs settled and recorded zero browser errors. These pairs show no
repeatable movement slowdown; two pairs do not establish a statistically
significant speed improvement.

The dry/swim/dive/surface/dry route passed all 13 acceptance gates in both
versions, including swimming, submersion, resurfacing, returning dry, stable
body identity, active projected caustics, frame-time and CPU bounds. Both
runs settled and recorded zero browser and GPU validation errors.

| Water acceptance | Baseline | Updated |
| --- | --- | --- |
| Average FPS | 176.39 | 163.94 |
| Frame-time p95 | 7.80 ms | 8.60 ms |
| Hitches above 33.3 ms | 0 | 1 |
| Hitch rate | 0 | 0.0001 |
| Maximum caustic post-effect CPU | 1.10 ms | 0.30 ms |
| Maximum whole caustic pipeline CPU | 7.20 ms | 26.80 ms |

The updated route is slightly slower in this single comparison and has a
transient 26.80 ms caustic pipeline cost, primarily its scene render. The
0.30 ms post-effect figure excludes that scene pass. Its one 38.60 ms hitch
has 4.20 ms recorded render work; it is a separate frame from the pipeline
peak. The acceptance thresholds pass, but these captures do not establish
unchanged underwater worst-case performance.
