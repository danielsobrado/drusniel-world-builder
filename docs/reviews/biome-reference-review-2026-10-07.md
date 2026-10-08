# Biome appearance and reference optimizations — 2026-10-07

This pass compares the current world builder with the user's
`F:\Development\grass-test` at `3d27252e4b989cda6094bdabedd4750c5db2ba21`.
The starting world-builder revision is
`88635f94db962f18a36fa01b8c76ce8ad117988a`, including the existing two
comment-only runtime edits and the untracked shore-detail report. Those edits
are retained. The reference checkout is unchanged.

## Changes

| Gap | Reference source | Implementation |
| --- | --- | --- |
| Meadow appearance still used the older cinematic defaults | `public/visual-refinement.yaml` | Use the final root brightness, canopy depth, gradient, fill, backlight, height/width variation, curve and patch colors. Scales use the existing 2.8 donor units per metre. Density and streaming distances are unchanged. |
| Ground beneath different grass palettes shared one green tint | `src/rendering/MeadowPalette.js` | Terrain reads its biome ID from the existing tile texture alpha and uses the same root/tip palette and broad patches as the blades and cards. A small lookup texture uses sampler-free loads. The CPU far-color bake receives matching linear root colors, retaining its rock, dirt, snow, canopy and wetness composition. |
| Broad dry patches were missing from the meadow | `src/rendering/MeadowPalette.js` | Add the reference's dry patch scale, thresholds, strength and pigment. Shared shader helpers keep the ground, blades and cards consistent. |
| Constant per-stem pigment noise ran in fragment shading | Reference's grass shader feature and batching policies | Compute the root and tip pigment in the vertex stage and interpolate them. This also moves the path-fringe calculation while retaining the height gradient, root shade and per-stem value variation in fragment shading. No instance attribute, density reduction or new draw is required. Live patch-scale and palette uniforms remain live. |
| Empty foliage meshes still entered renderer preparation | `src/rendering/skipEmptyDraws.js` | Skip zero-count instanced draws through a renderer-scoped hook. Preserve GPU indirect draws, count-one warmup, arguments, receiver, disposal and renderer recovery. |

The lookup costs **8 KiB per shared terrain material**, uploaded once. Its CPU
root/tip tables occupy 6 KiB; the far-color worker request carries the 3 KiB
root table. It adds no streamed texture field, biome remapping, placement
candidates or per-frame upload. Standard Azgaar IDs remain `0–12`, and the
palette lookup accepts custom IDs through `254`.

## Existing useful optimizations retained

The reference's major systems are already integrated: compact grass templates,
stable ranks and LOD thinning, compensation and card handoff, prepared terrain
normals, compact uploads, instanced vegetation, compressed foliage with
coverage-preserving mips, texture sharing, deferred draw preparation, bounded
residency, turn envelopes and occlusion. The latest dense-meadow pages and
stable sparse bands are more appropriate to this streamed world than copying
the donor's finite-field allocation again.

The donor's global `Object3D` matrix patch is not added. This engine freezes
the scene and instance anchors and updates static LOD mesh transforms locally.
Its terrain and collision own their streaming and revision contracts. The
donor's finite-landscape terrain streamer is not a replacement for those systems.

Fine detail visibility already exists behind `detailVisibility`; its existing
acceptance condition requires a measured benefit before enabling it. Cascaded
shadows are a quality option rather than a performance optimization. Water,
shore detail and snow behavior have separate existing reference reviews.

The donor's turf texture blending is also not copied: this engine already has
stochastic material-family sampling, detail normals and distance bands, and its
complete terrain shader uses the WebGPU sampler budget. The pigment lookup
therefore uses texture loads rather than adding another filtered sampler.

## Verification and review

- **3,282 Node tests pass**, including seven new behavioral tests for linear
  palette matching, custom biome IDs, far-color material preservation, dry
  settings and renderer hook lifecycle/indirect-draw preservation.
- Lint, the natural UI check, production build and `git diff --check` pass.
  Vite retains its existing large-chunk advisory.
- **34 hardware visual checks pass** on WebGPU and WebGL, with zero browser
  errors: six biome palettes, blade/card shaders, four-kilometre origin shifts
  and backend parity. Biome fixtures retain identical stem populations.
- The gallery compares deterministic cameras, lighting, density and animation
  time. Its live-world images have independent sky/wind timing and are context
  captures, not pixel comparisons.

See [the comparison gallery](../../tmp/biome-reference/comparison.html) and
[visual acceptance](../../tmp/biome-reference/after/report.json).
Baseline images are capture-only. An initial baseline acceptance attempt
failed the first rebase pixel gate; the updated implementation passes all
rebase gates at the same thresholds. An initial fixture navigation's missing
favicon was corrected; its failed run is excluded. The first frozen-server
startup did not compile YAML modules correctly and is likewise excluded from
performance evidence. The baseline loader was corrected before valid captures.

## Hardware performance

Captures run sequentially in headed Windows Chromium on NVIDIA Lovelace
hardware WebGPU at 1280 × 720, with successful preparation settle, zero browser
errors and HMR disabled. Baseline runtime sources are frozen in
`tmp/biome-reference/baseline-sources.json`; the updated sources are recorded
in `after-sources.json`. Sources, shaders, viewport, density and world seed
remain fixed within each capture. Builds and tests run outside measured movement.

The route uses `chunk-cross`, an eight-second warmup, fourteen seconds of
running and a separate fifteen-second recovery observation.

| Capture | Average FPS | p95 (ms) | Hitches >33.3 ms | Extra settle |
| --- | ---: | ---: | ---: | ---: |
| Baseline 1 | 145.39 | 9.00 | 0 | 29.2 s |
| Baseline 2 | 145.92 | 9.10 | 0 | 28.5 s |
| Updated, initial | 148.90 | 8.80 | 1 | 19.1 s |

All three captures pass frame-time, hitch-rate and collision gates and recover
to ready after stopping. The small FPS difference lies within normal variation;
it does not establish an isolated speedup from either optimization. The updated
initial capture precedes the final correction that preserves live patch-scale
uniforms; final acceptance is recorded separately below.

### First full updated acceptance matrix

The first matrix of the final runtime has one failed gate: **high-grass hitch rate 2.02%**,
against the unchanged 2% limit. It is retained as
[matrix-initial.json](../../tmp/biome-reference/matrix-initial.json); it must not
be described as a passing full matrix. Every case settled successfully, used
hardware WebGPU, had complete frame buffers and zero browser errors, and
passed collision readiness.

| Case | FPS | p95 (ms) | Hitches | Hitch rate |
| --- | ---: | ---: | ---: | ---: |
| Standard | 160.14 | 8.20 | 0 | 0% |
| Dense forest | 159.07 | 8.30 | 0 | 0% |
| High grass | 115.50 | 13.37 | 28 | **2.02%** |
| Dense mixed | 110.59 | 14.46 | 24 | 1.81% |
| Construction approach | 118.08 | 10.70 | 0 | 0% |

The high-grass run reached 159.9 ms maximum frame time; dense mixed reached
270.3 ms. The largest recorded high-grass stalls coincide with expensive render
submission. Phase timing alone does not isolate the API/driver cause. Compare
the frozen baseline and repeats before attributing that behavior to pigment or
empty-draw changes.

[Water acceptance](../../tmp/biome-reference/water-after.json) passes all
13 gates, with 8.9 ms frame p95, 0.02% hitches and zero GPU validation errors.
The projected-caustic post-effect CPU maximum is 0.3 ms; its full pipeline,
including the scene pass, reaches 46.7 ms. The effect-only figure is not the
complete rendering cost.

### Follow-up captures and preparation recovery

Later captures of the same frozen configurations show substantial throughput
variation. They must also be considered when assessing performance:

| Capture | FPS | p95 (ms) | Hitches | Preparation ready after stopping |
| --- | ---: | ---: | ---: | --- |
| Baseline, late chunk-cross | 129.88 | 11.30 | 1 | Yes, 0.4 s |
| Updated, final chunk-cross | 107.02 | 14.20 | 5 | Yes, 8.5 s |
| Baseline, high grass | 105.26 | 14.60 | 11 | Yes, 8.9 s |
| Updated, high-grass repeat | 98.89 | 15.70 | 10 | **No, after 15 s** |
| Updated, high-grass turn revisit | 95.11 | 15.70 | 6 | **No, after 15 s** |

Reports are retained as `perf-before-late.json`, `perf-after-final.json`,
`perf-before-high-grass.json` and `perf-after-high-grass-repeat.json` in
`tmp/biome-reference`. The revisit turns the camera by 180 degrees halfway
through movement. All five captures pass the frame-p95 and hitch-rate limits,
but those limits do not establish complete grass coverage or timely recovery.
The updated dense repeat ends recovery with 22 preparation jobs and 128 meadow
tasks; the turn revisit ends with 46 jobs, 166 meadow tasks and 80 draw tasks.
The baseline dense capture also has a preparation backlog during movement,
then recovers within the observation window.

The late updated standard capture is slower than its baseline capture and
ends movement with 2.34 million triangles versus 4.25 million for the baseline.
The final first-matrix standard case reached 160.14 FPS, while the unchanged
runtime's repeated standard case reached 120.75 FPS. Rendered populations and
preparation throughput vary despite fixed routes, seeds and initial settle.
These captures **do not demonstrate an isolated optimization speedup or rule
out a performance regression**. The wider reference blades, shader work and
preparation timing are not isolated from one another here. Dense-grass
preparation remains a concrete limitation, retained in the reports rather than
hidden by a passing frame-time gate.

### Full matrix repeat

The unchanged final runtime's second full matrix **passes every gate**, with
the same 33.3 ms frame-p95 limit and 2% hitch-rate limit. The first failure is
retained above; this repeat establishes a passing capture, not consistently
complete grass coverage. The matrix does not perform post-stop recovery.

| Case | FPS | p95 (ms) | Hitches | Hitch rate |
| --- | ---: | ---: | ---: | ---: |
| Standard | 120.75 | 15.87 | 7 | 0.48% |
| Dense forest | 142.05 | 9.30 | 1 | 0.06% |
| High grass | 109.19 | 13.50 | 15 | 1.15% |
| Dense mixed | 117.45 | 11.78 | 20 | 1.42% |
| Construction approach | 96.18 | 14.50 | 2 | 0.17% |

All cases settled before measurement, used NVIDIA Lovelace hardware WebGPU,
retained complete frame buffers, had zero browser errors and passed collision
readiness. Dense grass still ends movement with a preparation backlog.
The full matrix and per-case reports are retained as
[matrix-repeat.json](../../tmp/biome-reference/matrix-repeat.json) and
`matrix-repeat-<case>.json`.

[Repeated water acceptance](../../tmp/biome-reference/water-repeat.json) also
passes all 13 gates: 10.8 ms frame p95, 0.07% hitches, zero GPU validation
errors, 0.3 ms maximum post-effect CPU time and 33.2 ms maximum full caustic
pipeline CPU time.

### Isolated pigment-stage check

An additional fixed-scene check changes only the root/tip pigment evaluation
stage. Both variants retain the updated configuration, dry patches, path
fringe, terrain material, 24,862 stems, camera and animation time. Runs use
hardware WebGPU at 720 × 480, in fragment/vertex/vertex/fragment order, with
one 600-frame warmup and three measured 600-frame batches per run. The GPU
queue is drained every three submissions. There are no streaming jobs and no
browser errors.

Measured submission-and-drain time ranges from **1.23–1.60 ms/frame** for
fragment pigment and **1.18–1.34 ms/frame** for vertex pigment. This supports
retaining vertex pigment in this near-grass scene; it does not measure the
whole game or establish gains for every distance and LOD. The raw samples and
temporary variant-server/runner sources are retained in
[pigment-benchmark.json](../../tmp/biome-reference/pigment-benchmark.json),
`pigment-bench-vite.mjs` and `bench-pigment.mjs`.

## Reproduce

```powershell
rtk proxy npm run qa:biomes:appearance -- --url http://127.0.0.1:5173 --out tmp/biome-reference/after
rtk proxy node scripts/run-perf-qa.mjs --headed --url http://127.0.0.1:5173 --qa chunk-cross --warmup 8 --duration 14 --settle --drain-seconds 15 --grass-diagnostics --out tmp/biome-reference/perf-after-final.json
rtk proxy node scripts/run-perf-matrix.mjs --headed --url http://127.0.0.1:5173 --warmup 8 --duration 12
```

The visual fixture intentionally isolates production materials; it does not
claim identical landscape generation or lighting between the two applications.
