# Phase 0B — baseline remediation and acceptance

Starting main: c1f7419ccefa2f82472161f8587c5d5e9f93e088. Original evidence: docs/qa/lod-transitions/phase-00. Do not change that historical evidence. No GitHub Actions.

## Candidate changes
- Fix equal-score adaptive texture ranking to prefer farther candidates. Existing cap and protection retained.
- Remove four reported unused bindings. Variant-installation and terrain/WSC fixes from 488ebdaa and 835582c1 are already in main.
- Vegetation fixture explicitly completes the resumable variant installer and registers its published roots. Uses localhost by default. Production residency behavior is unchanged by this fixture.
- Settle reports distinguish current blockers, last blockers, streak and per-check counts. Opt-in sampler records preparation detail at one-second intervals. Do not relax readiness to pass tests.
- Cancel queued tree manifests outside the requested visible representation set, retaining the existing cache and shared scheduler. Measure tree-manifest completed-job latency and queue age.
- Conifer proxy horizontal envelope expands to authored leaf dimensions without adding geometry or changing the vertical connector. This is a candidate silhouette fix; confirm actual views and material/lighting match.
- Reduce diagnostic allocations; stop sampling after the existing storage cap, expose renderer-accounted bytes when available. Counters track queued packed dither bytes (not fade-only actual transfers), successful sliced GPU copies and lease time (not full GPU-readiness latency).
- Add lod-reversal and lod-revisit routes; construction corridor faces its length. Separate optional video captures from official timing.
- Existing grass page allocation/upload and staged geometry paths are already budgeted experimentally. The baseline hitches occur outside CPU phase timers; do not assume their source or alter production defaults without A/B evidence.

## Local execution and gates
Use a clean pinned checkout, Node version from package.json, native foreground RTX 4080 WebGPU, no parallel browsers or CPU-heavy work. Preserve all concurrent commits. Run npm ci, npm run lint, npm test, npm run build and npm run validate:assets:production. Reproduce any failures with exact assertion and compare the parent; do not weaken tests or replace fixture data with guesses. The old report listed azgaar-world-guidance, location-extra-props, location-structure-prefetch, rock-formations, terrain-material-bake-lod, terrain-material-family-lod, variant-installation and StylizedVariantResidency. Verify latest status rather than assuming each remains broken.

Targeted:
```sh
node --test test/location-surface-residency.test.js test/lod-baseline-diagnostics.test.js test/lod-baseline-motion-routes.test.js tests/PerfQaSettleGate.test.js tests/treeProxyGeometry.test.js test/instance-lod-handoff.test.js test/scenery-instance-publication.test.js test/sliced-instance-publication.test.js test/perf-qa-revisit-origin.test.js tests/constructionPerfQaFixture.test.js
npm run qa:vegetation:lod -- --headed --url http://localhost:5173 --out tmp/lod-phase-0b/gallery
```

### Asset bake
Use the repository's bake and encode pipeline, from a clean checkout with the source assets present. Inspect scripts/bake-tree-impostors.mjs and docs/gpu-impostor-initialization-2026-11-27.md first; execute the supported generation commands (npm run bake:impostors, npm run bake:impostor-mips and npm run encode:impostor-ktx2 as applicable), then npm run validate:impostors:required and npm run validate:assets:production. Never update source signatures without regenerating corresponding textures. Commit actual generated assets separately; record hashes, sizes and validation. If the bake is blocked, state why; do not mark passed.

### Hitches and readiness
Repeat the Phase 0 alternating matrix with three valid runs per arm, both flags unchanged and the documented initialInstanceUploadSlicing/slicedInstancePublication/rendererAdmissionBudget combination. Increase settle timeout to 240 seconds for a separately labeled arm; keep the 120-second arm for comparability. Inspect the new settle samples and exact blocked queues, do not treat a longer wait as an optimization. Include the grass route with existing --grass-diagnostics, --resources and separate --cpu-profile runs; use existing reports for meadow allocation, queueing, initial upload slicing, GPU pass timing and first-use fallbacks. Trace the four 216–329 ms hitches to specific operations before production changes; reproduce in off/on experiments and record unresolved spikes.

### Motion and visual evidence
```sh
npm run qa:perf -- --qa lod-reversal --x -1869 --z -4003 --yaw 142.55359 --pitch -4.58366 --duration 20 --warmup 8 --settle --settleTimeout 240 --headed --gpuTimings 1 --lodBaseline 1 --out tmp/lod-phase-0b/reversal.json
npm run qa:perf -- --qa lod-revisit --x -1869 --z -4003 --duration 60 --warmup 8 --settle --settleTimeout 240 --headed --gpuTimings 1 --lodBaseline 1 --out tmp/lod-phase-0b/revisit.json
npm run qa:free-flight -- --url http://localhost:5173 --out tmp/lod-phase-0b/flight
```
Repeat the relevant routes with --video-dir tmp/lod-phase-0b/videos and unique output names, marked visual-only; video recording perturbs performance. Use existing post-processing-route for rotation and rebase (verify originSnapCount), and free-flight QA for movement and rebase. Run manual or reproducible camera-script snow/coast/mountain views; document coordinates, orientation, seed, weather, flags, route and footage. Verify a real LOD boundary crossing, not simply a route name. Verify whether cold-region visit actually evicted resources; do not infer eviction from teleport alone. Construction end pose must show the fixture; capture an additional in-corridor pose if needed.

## Evidence
Commit to docs/qa/lod-transitions/phase-0b/README.md, metrics.json, runs/, captures/ (force-add only this evidence directory if ignored). Keep large video/raw traces under tmp/lod-phase-0b and document paths and hashes; commit compact screenshots and representative report extracts. Include tested SHA, hardware, command outcomes, rejected runs, memory coverage, known missing metrics and reproducible defects. Separate assets, source fixes and evidence commits. Require three comparable valid runs, no new errors, no missing geometry on captured routes and a demonstrated hitch improvement before claiming remediation. Exact incremental GPU transition triangles/draws, pinned transition bytes and automated missing-pixel coverage are not implemented by this candidate. Mark PARTIAL/BLOCKED if these or other acceptance gates remain unavailable. No force pushes or GitHub Actions.
