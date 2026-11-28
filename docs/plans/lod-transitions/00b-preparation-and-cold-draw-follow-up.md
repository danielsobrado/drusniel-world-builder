# Phase 0B preparation and cold-draw follow-up

Starting main 3a35f3f5. Preserve the accepted gallery and historical measurements; this is a new candidate, not measured acceptance.

## Changes and scope

- The existing streamed-draw guard also covers auxiliary camera selection. It hides pending first-use draws inside the reflection selection and restores visibility, preserving prepared fallback materials.
- Ground detail uses the existing atomic staged publication path when regionalInstancePublicationBudget or slicedInstancePublication is enabled. Unfinished scatter work outside the current window is released, nested manifest progress is tracked, and disposal cancels the staged job. Tree assembly cannot cancel current requested manifests when an older plan publishes.
- Ambient and valley ground texture publications share the upload limit. Pending environmental ground jobs get alternating reserved turns from the same existing deferred allowance. No additional frame floor is granted.
- With --lodSubmissionDiagnostics 1, the actual backend draw hook measures CPU-known direct instanced draw groups and logical triangles/instances with packed dither fades. It excludes indirect draws, counts those exclusions, and does not infer GPU-visible coverage, transition-only extra cost versus a counterfactual or driver memory. Use a separate diagnostic run because scanning CPU fade attributes may perturb pacing.
- Pipeline, buffer, render-object and bind-group creation times are attributed to the active render target in perf QA. Compare reflection face and main scene samples before proposing new real-pass warmups. The previous asynchronous compilation experiment is not reinstated.
- Vegetation QA records missing UV attribute queries with geometry and material identity. Optional queries are not shader errors. The generic warning alone does not identify its source. Do not add fabricated UVs or change the signed impostor bake inputs until the actual failing geometry is identified.

## Local execution

Run npm ci, npm run lint, npm test, npm run build, npm run validate:assets:production. Then run focused tests:
```sh
node --test test/pending-scatter-window.test.js test/environmental-ground-turn.test.js test/lod-direct-submission-diagnostics.test.js test/uv-attribute-diagnostics.test.js test/render-layer-isolation.test.js tests/streamedMaterialPreparation.test.js tests/viewRebuildQueue.test.js test/scatter-instance-rows.test.js test/lod-baseline-diagnostics.test.js tests/valleyFog.test.js
npm run qa:vegetation:lod -- --headed --out tmp/lod-phase-0b/gallery-post-review
npm run qa:perf -- --qa lod-revisit --duration 60 --warmup 8 --settle --settleTimeout 240 --headed --gpuTimings 1 --lodBaseline 1 --lodSubmissionDiagnostics 1 --resources --out tmp/lod-phase-0b/direct-submission-revisit.json
```

Repeat the original default and flagged arms on isolated foreground native RTX 4080 WebGPU. Use actual original route coordinates and flags from the evidence; verify no geometry holes, no regressions in fog/ambient appearance, readiness and memory budgets, and no new diagnostic stalls. Keep instrumented submission runs separate from clean pacing comparisons. Investigate per-target creation counters on the first reflection face and cold terrain draw, distinguish shader creation from submission/upload and driver waits, and fix measured causes rather than just raising timeouts. Complete missing reversal, motion, snow/coast/mountain and three-valid-run-per-arm evidence. Exact GPU incremental transition cost, pinned bytes and in-world missing pixels remain outstanding. Record new evidence under docs/qa/lod-transitions/phase-0b/ without rewriting original evidence. No GitHub Actions.
