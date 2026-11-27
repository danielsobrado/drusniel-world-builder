# Phase 0 — LOD baseline and instrumentation

Status: instrumentation candidate; hardware acceptance pending. Starting main: b625625d3bd5f2c9ca6c3475af3f7aabb08e649a. No GitHub Actions.

## Scope

No LOD algorithm, thresholds, shader, resource ownership or production feature defaults change. `--lodBaseline 1` enables a QA-only sampler in the existing performance harness. It records planned tree, rock and bush chunk states every 100 ms during measurement, including target bands, overlapping physical-band candidates, data wait, sampled reversals and sampler CPU time. The spatial performance overlay shows the selected cell's planner state. Existing publication and handoff counter deltas are included in a separate report section. No sampler is allocated in ordinary QA without the flag.

These are planner observations, not submitted draws, actual GPU readiness or visible coverage. A sampled reversal is a lower bound; short events between samples can be missed. A pending age is data wait, not GPU handoff wait. Counter null means no observed delta, not evidence of zero. Attribute bytes are aggregate queued bytes, not fade-only actual transfers. Existing renderer totals are whole-renderer, not incremental LOD cost. Exact extra triangles/draws, pinned bytes, fade-only transfers, GPU readiness age and missing coverage remain uninstrumented. Record these as unavailable unless an independently validated measurement exists. Do not invent estimates or present these as a passing correctness gate.

## Local execution

Use Node matching package.json. Freeze the instrumentation commit and record its parent; use separate clean worktrees if comparing. Run from repo root:
```sh
npm ci
node --test test/lod-baseline-diagnostics.test.js tests/projectedLod.test.js tests/chunkLodPlanGolden.test.js test/instance-lod-handoff.test.js test/scenery-instance-publication.test.js test/sliced-instance-publication.test.js
npm run lint
npm test
npm run build
npm run validate:assets:production
```

Start the normal local Vite server. If the browser is missing install the repository Playwright Chromium; use native foreground headed NVIDIA WebGPU, verify adapter, no background focus changes and collision/settle gates. Record OS, GPU/driver, browser, Node, resolution, seed, settings, exact SHA, asset validation and every command. Use `tmp/lod-baseline/` for raw output; create it first. No automatic push of huge logs or profiles.

Run each scenario at least three times per arm, alternating arms on the same machine. 1280x720, device scale 1, warmup 8 s, measure 20 s, GPU timings, 16.667 ms hitch threshold. Increase duration identically if route does not cross an LOD boundary. Do not treat a default start with zero transitions as evidence.

```sh
npm run qa:perf -- --qa bog-cross --warmup 8 --duration 20 --settle --gpuTimings 1 --hitchMs 16.667 --headed --lodBaseline 1 --out tmp/lod-baseline/bog-cross-on-01.json
npm run qa:perf -- --qa chunk-cross --x -1869 --z -4003 --yaw 142.55359 --pitch -4.58366 --warmup 8 --duration 20 --settle --gpuTimings 1 --hitchMs 16.667 --headed --lodBaseline 1 --out tmp/lod-baseline/grassland-on-01.json
npm run qa:perf -- --qa settlement-approach --warmup 8 --duration 20 --settle --gpuTimings 1 --hitchMs 16.667 --headed --lodBaseline 1 --out tmp/lod-baseline/settlement-on-01.json
npm run qa:perf -- --qa construction-ring --warmup 8 --duration 20 --settle --gpuTimings 1 --hitchMs 16.667 --headed --lodBaseline 1 --out tmp/lod-baseline/construction-on-01.json
npm run qa:vegetation:lod -- --headed
```

Repeat with `--lodBaseline 0` and unique filenames. Also run the bog and settlement routes with existing readiness experiments enabled using a quoted `--url "http://localhost:5173/?initialInstanceUploadSlicing=1&slicedInstancePublication=1&rendererAdmissionBudget=1"`; compare only like-for-like flag sets. Check the actual URL and flags in reports. Use the existing vegetation QA and interactive scene for approach/retreat, rapid reversals, high-speed flight, snow, coastal rocks, rebase and cold/revisit. For manual routes record canonical poses, yaw/pitch, movement sequence, duration, flags, and paired before/after or continuous video evidence; do not claim an automated route if manual. Inspect `?spatialPerformanceOverlay=1` for selected cell details; collect separate overlay-on captures, not official performance timings.

## Evidence and gates

Commit results in `docs/qa/lod-transitions/phase-00/`:
- `README.md`: scope, exact measured SHA, hardware, flags, routes, command outcomes, per-arm results and verdict.
- `metrics.json`: per-run actual values and statuses, missing values null, include rejected runs and reason, no fabricated zeros. Include average FPS, P95/P99/P99.9/max frame time, GPU pass timing where supported, whole-renderer draws/triangles/memory, publication bytes, sampled planned transitions/pending/reversals, sampler time, and missing metrics list. If raw frame history is insufficient for a percentile, report null.
- `runs/`: compact representative unedited JSON reports (or compact extracts with provenance if oversized).
- `captures/`: representative annotated-by-filename PNGs, plus route/pose metadata in README. Keep generated bulk files under tmp and document location.

Gate: targeted tests, lint and build pass; full suite and production assets recorded (pre-existing failures reproduced on parent when possible). Require valid foreground WebGPU and comparable settled runs; keep invalid runs but exclude from comparisons. Verify at least one observed transition for applicable scenery routes. Verify no meaningful instrumentation-induced frame-time regression using alternating off/on runs; proposed 0.25 ms/frame amortized sampler CPU ceiling and 2% median steady-state GPU regression threshold are initial investigation thresholds, not automatic proof of equivalence. Report variance and insufficient samples. Check visual holes manually. Mark phase PARTIAL/BLOCKED if required evidence or measurement is absent. Do not enable experimental features or implement Phase 1 to conceal defects.

Use `git status`, inspect staged diff, commit only evidence files to main with `docs(qa): record LOD phase 0 baseline results`. Do not overwrite concurrent changes, force push, or create GitHub Actions.
