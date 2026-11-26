# Spatial performance diagnostics

Control: 58cdc15e69a582f549fc901aada6ca7d6bcd9e94. This is the current main revision after the 13 concurrent commits following atmospheric admission; world-surface contact, terrain material and QA changes are retained. No GitHub Actions.

## Activation

```text
?spatialPerformanceOverlay=1
?spatialPerformanceOverlay=1&rendererAdmissionBudget=1
?spatialPerformanceOverlay=1&regionalGeometryCostBudget=1
```

```yaml
spatialPerformanceOverlay: false
spatialOverlay:
  refreshMs: 500
  radius: 8
```

The flag is independent and defaults off. The panel is a north-up, clickable chunk heatmap, not an extra world-space render pass. It appears in the lower-right of the world UI and hides inside instanced locations. Select a cell with the pointer or focus the canvas and use arrow keys; Focus returns to the sampled streaming focus. The radius controls display only; the regional sampler's spatialChunkRadius controls its collection window. A larger display radius can show unsampled cells. The panel can be collapsed.

## Metrics and interpretation

- Select pressure ratio, requested/selected triangles, requested/selected draw estimates or weighted demand. Select all layers or tree, rock, bush, blade, card, detail, town, water. Layer filters isolate diagnostic data, **not** scene visibility, physics, material residency or actual rendering.
- Grey means unavailable/unsampled data, not necessarily an empty chunk. Green-to-red encodes estimated cost against a configured local target. Amber outline indicates incomplete geometry data; blue marks protected admission rings; violet marks reduced factors or a spatial pressure signal. White square marks the sampled camera chunk and white outline marks selection. Protected/reduced styling takes precedence over unknown cost; inspect reasons for the complete status.
- Pressure heatmap is an explanatory requested-cost ratio (effective triangles/draws including estimated shadow and weighted reflection passes, or weighted demand when geometry is unavailable). It is not an exact allocator replay. Town reservation, unknown costs, hysteresis, fixed costs, global admission and transition overlap can make actual allocator decisions differ. The local pressure flag and active factors come from the completed sampler, not the heatmap colour.
- Selected cost reflects the observed representation at collection, which may precede newly admitted factors and their publication. A factor is an LOD/density control, not necessarily a direct proportion of triangles or draws. Unknown geometry is explicitly marked. Requested and selected cost include main-pass estimates; details also expose shadow and reflection counts and effective requested cost.
- The source covers resident sampled manifests, meadow tiles, town layouts/selected meshes and wet water slots; terrain, caves, geological views, atmospheric passes, legacy vegetation, shader cost, memory bandwidth, transparent overdraw and actual frustum/occlusion results are not comprehensively represented. Draw estimates can count shared batches in multiple chunks. No per-chunk measured GPU timings are implied.
- Global CPU fixed/deferred time, queued upload bytes, last allocation change/deferral counts and available asynchronous GPU render samples are shown separately. If an existing performance QA harness is capturing with gpuTimings=1 on a supported WebGPU backend, the panel reads its latest completed sample and shows the three most expensive measured render contexts. This is not a separate timestamp profiler and does not request readbacks itself. See docs/perf-qa.md. Timing excludes compute, CPU submission and uploads; sampled GPU and spatial collection timestamps can differ.

## Sampling and cost

When a regional budget is enabled, retain its completed sample, decisions and allocation stats; do not run another collector. A weighted-only controller still reports weighted-only data. If no budget is active, run an observation-only RegionalSceneryBudget with geometry estimates, using existing bounded spatialWorkItems and deferred work scheduling. It does not attach to scenery views, publish reductions, change revision, or overwrite active spatial admission gauges. It samples existing resident records without scheduling more manifests or touching cache residency. Collapsing the panel cancels and pauses only the independent observer; active admission continues unaffected. Reopening starts a fresh observation. Large focus jumps invalidate completed data, and the panel displays sample age and collection duration. Collection is incremental rather than a simultaneous snapshot of all scene state.

The display redraws at the configured interval, using at most (2 × radius + 1)^2 cells, and on interaction. The underlying sampler runs on its existing sampleIntervalMs. There is some extra CPU cost and retained sample data, particularly when using the overlay alone. Do not leave it enabled for final benchmark captures unless measuring the diagnostic overhead itself.

Export JSON downloads the complete latest sample, including cells outside the displayed radius, per-layer costs, option/transition estimates where available, canonical coordinates, settings, admission decisions, protection and reason labels, timestamps, global allocation stats and current global CPU/upload/GPU QA information. This is a diagnostic estimate, not a guarantee of GPU work actually executed.

## Tests and acceptance

10 isolated regression cases passed using exact committed configuration, sampler, cost, admission and spatial model code with a mock URL parser and an unused morphology compatibility dependency stub. Covers requested vs selected costs, layer filtering, unknown/unsampled data, protection, negative coordinates, export, observer-only isolation, bounded completion, teleport invalidation, capture with weighted-only active admission, pause/restart and independent flag validation. Browser DOM/canvas behavior, full npm tests, lint, production build and actual GPU capture were not run.

```sh
npm ci
node --test test/spatial-performance-overlay.test.js test/regional-spatial-budget.test.js test/regional-render-cost.test.js test/regional-admission.test.js test/renderer-admission.test.js
npm run lint
npm test
npm run build
```

| Scenario | Acceptance |
| --- | --- |
| Overlay alone | No changes to scenery factors, admissions or visible scene geometry |
| Active renderer admission | Reuse existing sample; protected cells, local pressure and actual reduced factors distinguishable |
| Forest, settlement and coast | Layer filters identify estimated costs without changing scene visibility |
| Negative coordinates / rebase / teleport | North-up map, correct canonical cells, stale samples cleared on large focus movement |
| Collapse / reopen | Independent observer cancels and restarts; existing admission keeps running |
| Location entry / exit | Panel hidden in location and restored on exit |
| GPU-enabled QA | Whole-renderer sampled timestamps separate from per-cell estimates |
| Export | Valid complete JSON with selected/requested estimates and configuration |
| Flag off | No mounted panel, retained diagnostics sample or independent observer |
| Performance | Quantify sampler and display overhead; compare overlay on/off independently from optimization flags |

## Remaining work

- TODO: actual per-region GPU attribution, terrain/geology/effect coverage, and precise per-cell admission deferral explanations. Current renderer-level deferral counters are not attributed to particular cells.
- TODO: optional safe scene-layer isolation with a separately verified rendering-only contract; data filters do not mutate render visibility.
- TODO: integrated hardware calibration and measured GPU feedback, then byte-exact oversized instance publication slicing.
