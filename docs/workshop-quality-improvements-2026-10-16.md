# Workshop quality improvements — 2026-10-16

The [review plan](plans/workshop-quality-review-2026-10-16.md) is implemented and
validated. The [comparison gallery](../tmp/workshop-shapes-qa/comparison.html)
contains matched before/after views, editing details and material-lighting checks.

## Construction and materials

- Window crossbars follow the glass's actual host surface. Regression checks
  sample their rendered triangles on translated, rotated and tapered walls.
- Beams emit their buffers directly with longitudinal grain and end coordinates.
  Wall fronts, backs, returns and bevels have explicit nondegenerate UVs. Curved
  timber belts, crossbars and planter boards orient grain along the member.
- Quiet albedo grain is neutral because composition materials already contain
  the palette. Normal/roughness tuning preserves imported overrides and the
  existing independent GPU texture ownership.
- Slate courses use physical slope distance, with stable eave-relative keys,
  restrained joint/tint variation and existing smooth surface normals. A closed
  swept profile replaces separate eave boxes. Near detail retains tile relief;
  coarse detail retains the structural silhouette.
- Ridge and hip cap stations now meet without daylight gaps. Seated side skirts
  and closed ends cover the openings beneath the caps; their closed-mesh and
  outward-winding regression covers the construction independently of images.

## Planting, paving and interiors

Ivy has uneven growth patches, lateral stems and a density control. Changing its
density preserves existing leaf keys and unrelated products. Window-box planting
has varied spacing and grouped blossoms. Dampness follows ground contact and a
stable shelter preference.

Feature-product keys retain geometric neighbor dependencies while excluding
unrelated neighbor dressing. An ivy-density edit reuses bay and porch geometry.

Entrance paving has continuous bedding and staggered stones, clipped around
porches, other entrances and the full width of connected ground-level traversal.
Clipping consumes resolved relationships and derived traversal surfaces.

Interior treatments are authored as Automatic, None, Paving or Paving and bench.
Their generated outputs have provenance and suppression keys. Interior paving
owns its floor surface, preventing duplicate generic floors. Horizontal polygon
triangulation supports concave outlines and holes; profile authoring retains its
existing convex-footprint invariant.

## Editing

The inspector offers Shape, Roof, Openings, Features, Dressing and Advanced
contexts. Numeric values are editable in physical units alongside sliders;
Shift+Arrow provides fine increments. A gesture commits one history entry and
Escape cancels a pending numeric edit. The inspector context survives renderer
recovery.

The browser cancellation fixture also verifies that Escape keeps the workshop
open; the field handles that key before the dialog's close shortcut.

Chimneys, window-box planting, ivy density and interior treatment have independent
controls. The existing combined craft switch remains in Advanced for saved-state
compatibility. Generated detail labels distinguish automatic and user placement,
and expose existing hide/reset behavior. Hovered and active handles have labels.

## Responsiveness and resource cost

The CPU profile identified repeated quadratic arc-length integration and
allocation work. Workshop surface samplers now compile the kernel's same table
once and reproduce its points/tangents within 1e-10 in the regression fixtures.
This is confined to derived workshop sampling.

Warm CPU planning/build medians from three repetitions of five measured edits
per fixture, in milliseconds:

| Fixture | Before | After, profiled run | After, repeat run |
| --- | ---: | ---: | ---: |
| Rounded cottage | 22.3 | 39.8 | 20.4 |
| Buttressed chapel | 32.8 | 33.6 | 27.2 |
| Balcony tower | 198.2 | 39.6 | 29.6 |
| Cottage and turret | 59.8 | 41.4 | 47.1 |

The tower's reduction is consistent and substantially larger than the observed
variance. Cottage/chapel timings remain sensitive to load and profiling; these
runs do not establish a universal speedup or a frame-rate claim. Geometry costs
remain material-batched. Existing LOD, cache reuse and disposal tests apply.

The browser harness now records real pointer gestures on the same four fixtures:
frame intervals, synchronous render-call timing, pointer-to-first-render-call and
pointer-to-updated-geometry submission proxies, long tasks and geometry buffer
bytes. These proxies do not measure physical display latency.

The final NVIDIA Lovelace WebGPU run recorded the following p95 values in
milliseconds. Each fixture has eight pointer samples, so these are short-run
measurements, not long-run latency guarantees.

| Fixture | Pointer to submission | Pointer to updated geometry submission | Frame interval | Geometry MiB |
| --- | ---: | ---: | ---: | ---: |
| Rounded cottage | 7.8 | 107.5 | 68.2 | 4.32 |
| Buttressed chapel | 4.8 | 106.7 | 73.5 | 10.48 |
| Balcony tower | 4.2 | 87.1 | 58.1 | 8.93 |
| Cottage and turret | 3.5 | 97.1 | 60.2 | 8.99 |

"Pointer to updated geometry submission" measures from the input event until a render
call observes an increased completed geometry revision. It includes the preview
debounce and build; it is not a GPU upload fence or a display measurement.
The earlier run reached 51.5 ms pointer submission and 126.3 ms updated-geometry
submission. Frame spikes and long tasks remain visible in the saved samples;
the final run's largest frame interval was 170.5 ms.

Initial review ceilings for this workstation and these four fixtures are:
warm CPU build p50 60 ms / p95 120 ms, pointer-submission p95 60 ms,
updated-geometry submission p95 150 ms, frame-interval p95 100 ms,
12 MiB geometry attributes/index buffers and 32 editable preview batches.
The measured runs fit these ceilings. They are advisory budgets for subsequent
comparisons on the same device, not universal CI timing assertions. GPU texture,
driver and total browser memory are outside the geometry-buffer count.

## Validation and artifacts

- Workshop shape suite: **143 tests passed**.
- Repository suite: **3,697 tests passed**.
- Lint and production build passed; existing Vite chunk/import advisories remain.
- **41 browser interaction checks passed**, with no page or console errors, on
  the real NVIDIA Lovelace WebGPU adapter.
- **160 model captures passed**: 64 near and 64 coarse views across all sixteen
  presets, plus 16 neutral and 16 grazing-light views. Sources stayed unchanged
  within each run; interaction and capture source hashes match.
- Inspected all sixteen overview captures together and the timber, bay/porch,
  roof-valley and material close-ups. The cap contact review identified and
  removed the remaining skyline gaps before final capture.

The [retained validation record](qa/workshop-quality-validation-2026-10-16.json)
preserves source fingerprints, check names, counts, CPU summaries, buffer sizes,
latency distributions and budget definitions. Local image files remain in `tmp/`.

Local artifacts:

- Before captures and CPU report: `tmp/workshop-quality-before-2026-10-16/`.
- After CPU reports: `tmp/workshop-quality-after-cpu.json` and
  `tmp/workshop-quality-after-cpu-repeat.json`.
- Full test log: `tmp/workshop-quality-full-tests.log`.
- Shape test log: `tmp/workshop-quality-tests.log`.
- Final gallery: [comparison.html](../tmp/workshop-shapes-qa/comparison.html).

The review matrix records source hashes before/after capture and rejects changes
during a run. Near and coarse stage views cover all sixteen presets; neutral and
grazing-light views cover four representative material/connection fixtures. Stage
and grazing captures replay the preceding baseline cameras. The preceding neutral
baseline timed out waiting for another hardware run; neutral views provide a
separate material check.

Reproduce the final checks:

```powershell
rtk npm run qa:workshop:shapes
rtk npm run qa:workshop:shapes:browser
rtk proxy node scripts/review-workshop-shapes.mjs --matrix --reference=tmp/workshop-quality-before-2026-10-16 --out=tmp/workshop-shapes-qa/review
rtk proxy node scripts/write-workshop-quality-gallery.mjs --evidence=docs/qa/workshop-quality-validation-2026-10-16.json
```
