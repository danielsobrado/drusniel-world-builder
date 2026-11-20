# Ponlai integration — PR B: deterministic rendering QA, reproducible captures and trustworthy GPU timing

**Status:** implementation specification — **not yet implemented**  
**Date:** 2026-11-20  
**Destination:** [Drusniel World Builder](https://github.com/danielsobrado/drusniel-world-builder), directly on `main`  
**Local-code inspection baseline:** [`c5ecf1405350b063ca3efd90313cb21b18d676b8`](https://github.com/danielsobrado/drusniel-world-builder/tree/c5ecf1405350b063ca3efd90313cb21b18d676b8)  
**Reference code inspected:** [Ponlai `cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e)  
**Prerequisite:** [PR A specification](ponlai-pr-a-render-foundation-2026-11-20.md), especially version/provenance/configuration ownership  
**Next implementation:** PR C, HDR histogram auto exposure  
**Architecture constraint:** preserve Drusniel's present render graph, visual QA harness, performance harness, floating-origin system, and test infrastructure  
**Working practice:** re-read current `main` and `AGENTS.md` before implementing; commit to `main`; never overwrite unrelated work; **no GitHub Actions**

> **Source accuracy:** “Local” below means the code of Drusniel's GitHub repository, not an unverified local filesystem checkout. Paths, functions, and source links were checked against the pinned repository commits. PR A is currently a committed **specification**, not proof that its implementation has landed. Re-audit current `main` before altering any file. All proposed PR B files and CLI flags are labelled **new**.

## 1. Executive engineering decision

**Do not port Ponlai's capture framework wholesale.** Drusniel already implements most of the lower-level functionality: fixed world poses, source-state verification, screenshot hashing, render-only canvas captures, image metrics, WebGPU adapter guards, exclusive browser-GPU locks, streaming settle checks, preset/post-processing captures, timed movement scenarios, and sampled asynchronous render-pass GPU timestamps.

PR B should **connect and harden those existing components** so later PRs C–L can answer four questions without guesswork:

1. **Same scene?** Are the canonical world position, map, weather, time, quality settings, viewport, origin and render graph in a matched state?
2. **Actually ready?** Are terrain/vegetation/chunks, shader pipelines, weather, shadows and the temporal resolve ready, with no loading overlay or stale history contaminating the capture?
3. **Real visual regression?** Does the image differ beyond that exact view's measured same-build A/A noise, including localized missing objects and coherent one-level colour shifts?
4. **Real performance regression?** Are CPU pacing and GPU render-pass numbers from the same hardware, appropriate workload, comparable source snapshots and correctly labelled timestamp scope?

A green report must never hide incomplete preparation, an unknown adapter, browser errors, a changing development server, incorrect world coordinates, a partially compiled shader, or an uncalibrated comparison threshold.

### What lands in PR B

- One **small, documented QA capture manifest v1** shared by existing QA reports, not a new scene-state store.
- A **thin baseline-collection orchestration command** that drives existing runners and validates their outputs. It must reuse existing adapters and locking rather than opening its own competing browser.
- Metadata capture for source/build identity, effective scene/camera, screenshot dimensions, settings, readiness and GPU attribution, added to existing capture outputs wherever those facts are already available.
- Repeated A/A captures and a **local image-diff gate** built on the project's existing `sharp` dependency and `rendered-image-metrics.mjs`. Reuse its metrics rather than starting a new image-processing implementation.
- A **temporal/rest readiness contract** appropriate to Drusniel's TAA/TAAU. It may begin with diagnostic/read-only checks, falling back to explicitly qualified capture results where no reliable readout exists.
- Correct handling of **timed runs with timestamps off vs on**; never treat sampled pass timestamps as complete frame GPU cost.
- Unit tests, browser smoke captures and a complete evidence package with explicit “accepted”, “rejected”, “pending hardware” or “insufficient repeatability” status.

### Not in PR B

- Exposure metering, physically based atmosphere, SH probes, clouds, FFT ocean, dynamic resolution or clustered lights.
- New colour-space processing, render targets, TAA history buffers, shaders or shader-node graph.
- Production UI changes; gameplay, physics, terrain generation, chunk cache or asset modifications.
- Replacing existing `run-world-visual-qa.mjs`, `run-environment-look-qa.mjs`, `run-perf-qa.mjs` or `GpuPassProfiler.js`.
- Copying Ponlai's island-specific camera definitions, fixed pixel crop rectangles, Python `uv` workflow, GPU-lock implementation, persistent-browser slots, frame-pacer code or renderer internals.
- Absolute image thresholds copied from Ponlai, or exact-pixel gates asserted across different GPUs/browser versions.
- GitHub Actions, new build dependencies, mandatory external services, large binary artefacts committed by default.

## 2. Verified source-to-source mapping — both repositories

Every row identifies **what actually exists**, its relevant function/contract and **exactly what PR B should do**. Linked source lines are pinned to the inspected commits; line numbers reflect that snapshot and can shift on `main`.

| Concern | Drusniel implementation to extend | Ponlai implementation to study | Direct integration decision |
| --- | --- | --- | --- |
| Visual case orchestration | [D1] `run-world-visual-qa.mjs`, esp. `prepareVisualPose` and per-pose loop (lines 66–111) | [P1] `capture-set.mjs`, per-view repeat/reference and scene jumps (lines 43–109) | **Reuse** Drusniel captures; add A/A pair and baseline manifest without a second capture engine |
| Look matrix: biome, time, weather | [D2] `run-environment-look-qa.mjs`; [D3] `environment-look-shots.json` | [P2] `profile-frame.mjs` `SCENES` (lines 127–155); [P3] parity methods | Reference existing pose IDs and weather/hour fixture combinations; do **not** copy island scenes |
| Frozen source validity | [D4] `captureVisualSource` / `visualSourceStayedFixed`; [D5] `repositoryState` / `validateVisualReport` | [P4] `reference.mjs` `ensureReference` and key/`complete.json` contract (lines 1–105) | Add small manifest identity and atomic publication; **extend** existing source-hash checks |
| Camera readiness and chunk preparation | [D6] `prepareVisualPose`; [D7] `PerfQaSettleGate.update`; [D8] `PerfQaHarness.settleReadiness` | [P5] `Settled.ts` `SettleFrame`, `watchPipelines` and `Settled` (lines 5–115) | Use existing readiness signals; add missing read-only capture blockers only, do not copy Ponlai's GPU device wrappers |
| Temporal still-frame convergence | [D9] `PostProcessingQaCaptures`; [D10] `PostProcessingDiagnostics`; [D11] post-processing QA `settleFrames` | [P6] `TemporalRest.ts` `restKey` / `restEpoch` (lines 1–60); [P5] `Settled.ts` | Derive and record Drusniel-specific TAA/TAAU validity and stable history; do **not** install another temporal resolve |
| Screenshot source and canvas | [D12] `captureWorldCanvas` selects active renderer DOM canvas; [D1] clean HUD capture | [P7] `capture-browser.mjs`, CDP screenshot/readiness and device-pixel-ratio caveat (lines 34–132) | Keep Playwright canvas screenshots initially; CDP acceleration **only if** benchmark demonstrates a capture bottleneck |
| Multi-capture image metrics | [D13] `compareRenderedImages` / `imageMetrics`; [D2] look metrics & gates | [P8] `diff-set.py` (lines 1–81); [P9] `parity/README.md` (lines 27–85) | Extend local JS metrics with windows/crops and per-scene A/A noise; no Python dependency |
| Island-specific regions | Drusniel has biome/pose fixtures and separate world/canvas capture [D3, D12] | [P10] `compare-captures.py` fixed cliff/meadow/open-water/glare rectangles (lines 39–63) | **Do not port** Ponlai's hard-coded 1672×941 crops; use normalized ROIs/metadata tied to Drusniel views |
| QA source/artefact hashes | [D1] `fileHash` and `report.artifacts`; [D5] report verification | [P4] `reference.mjs` immutable keys, `complete.json` last, A/A coverage (lines 17–89) | Introduce a minimal versioned capture-set manifest; omit full profile-slot/reference library |
| GPU workload exclusion | [D14] `perf-run-lock.mjs` `waitForPerfRunLock` used by browser suites | [P11] `profile-frame.mjs` GPU lock and sampling methodology; [P12] profile methodology | **Reuse current lock**; nested orchestration must never acquire it before invoking a child that acquires it |
| Render-pass timestamp sampling | [D15] `GpuPassProfiler` `beginFrame` / `endFrame` / `report` / `dispose` | [P11] timestamp modes `on/off/both` (lines 67–85); [P12] measurement caveats | Preserve current asynchronous sampled profiler; add attribution/diagnostic quality, not new backend wrapping |
| Postprocessing aggregate diagnostics | [D10] `PostProcessingDiagnostics.requestGpuTimings` / `snapshot` | [P11] profiling by scene and pass | Keep separate from `gpuRender`: `totalPost` is aggregate/nullable, not a real per-effect breakdown |
| Frame timing and report shape | [D16] `buildPerfReport` `summary`, `renderSubmissionCpu`, `gpuRender`; [D17] `PerfQaHarness.finish` | [P11, P12] separate GPU costs and no-timestamps frame-rate runs | Add a comparison label to report metadata; do not relabel CPU render submission as GPU time |
| Browser WebGPU validation | [D18] `run-perf-qa.mjs` adapter/backend guard; [D11] post-processing browser QA adapter checks | [P7] browser launch/readiness and GPU queue observations | Reuse Drusniel's known-good adapter guard; keep fallback/software runs invalid for GPU acceptance |
| Visual source/renderer recovery | [D1] `source stayed fixed` gate; [D19] post-processing graph/recovery docs | [P5, P6] stable/rest state changes invalidate settled signal | Ensure resize, camera mode changes, rebase and history reset force new readiness, not stale accepted captures |

### Exact upstream reuse vs adaptation

**Reimplement in Drusniel conventions, not verbatim:** immutable reference keys, A/A calibration, crop/window statistics, temporal comparison strategies, consistency between source and screenshot manifest.

**Learn from, but avoid copying:** Ponlai's `__PONLAI__` globals, island `SceneJump` page-state contract, `TemporalRest` implementation, `watchPipelines` device monkeypatch, macOS QoS tweaks, Python CLI, GPU lock scheduling and warmed browser profile caches. Drusniel has different browser, renderer, streaming, QA and source-verification ownership.

**Original license context:** Ponlai is MIT at the pinned commit; verify each adapted file and separate third-party material under [Ponlai LICENSE](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/LICENSE), [CREDITS](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/CREDITS.md) and [LICENSES](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e/LICENSES). PR B can be independent orchestration; if any code is closely translated, record its specific source/notice under PR A's provenance contract.

## 3. Existing system ownership — avoid building a second QA framework

### 3.1 World-visual path already in production

From [D1], [D4], [D5], [D6], [D12] (source-verified):

```text
scripts/run-world-visual-qa.mjs
  captureVisualSource(baseUrl, repo)
    -> frozen server snapshot or repositoryState
  captureVisualHarness(...) + selected world/pose fixture
  acquire existing shared browser GPU lock
  launch headed Chromium; verify native WebGPU adapter
  __worldVisualQa.loadWorld(world) when necessary
  prepareVisualPose(page, pose)
    -> ground settle first for free-flight poses
    -> cut to pose
    -> existing runtime settle
  __worldVisualQa.diagnostics()
  asset integrity and biome checks
  page screenshot (HUD), captureWorldCanvas (clean renderer)
  fileHash(artifacts)
  captureVisualSource after capture
  visualSourceStayedFixed and validateVisualReport
  report.json / passed-or-failed process exit
```

**Do not rewrite this.** The missing features are: a reusable capture reference identity, per-shot repeated A/A evidence, calibrated cross-version comparisons and consistent metadata validation with the other runners.

### 3.2 Existing look/lighting path

[D2] already runs **38** biome/hour/weather captures (per [docs/perf-qa.md](../perf-qa.md)); [D3] includes procedural grassland, forest, rainforest, wetland, coast, desert, imported tundra/glacier/snow and town, at various times and weather. Its current image comparison uses [D13]. Reusing its IDs avoids inventing poses that are not available in source.

[D2] also uses [D14]'s exclusive hardware browser lock, `captureVisualSource`, `prepareVisualPose`, asset readiness checks, sky/storm diagnostics, and a contact sheet.

Gaps to address: make each scene's state and artefact provenance easier to compare between commits; avoid accepting a screenshot taken while temporal or lighting state still changes; calibrate image thresholds using multiple A/A samples; preserve the existing semantic look gates separately.

### 3.3 Post-processing path

[D11] already builds a matrix of `off`, `low`, `balanced`, `high` and `ultra`, TAAU scales 0.85 and 0.67, shafts, DOF, vignette, grain and every debug view. [D9] enumerates its capture locations and a movement/rebase route. [D10] records graph builds/history resets and aggregate/nullable GPU timings. [D19] describes a one-graph HDR MRT pipeline, TAA/TAAU, reactive invalidation and fallback.

PR B must not duplicate those preset cases. It needs to preserve their names and add **scene/capture metadata** and **repeatability checks** where genuinely missing. A screenshot taken after [D11]'s fixed `settleFrames` alone is not proof that a streamed environment, pending GPU pipeline or TAA history has converged. Capture readiness must be based on current runtime signals and measured repeat variance.

### 3.4 Performance path

[D17] uses [D7] to require 60 consecutive ready frames by default, after warm-up, checking collision, streaming, construction and vegetation. It then measures phases and calls [D16]. At finish, [D17] attaches `gpuRender = this.gpuProfiler.report()`. [D15] samples asynchronously, by default every eight frames.

[D18] already checks actual WebGPU/adapter rather than merely successful browser startup, accepts `--gpuTimings 1` and `--screenshot`, and checks asset integrity, browser errors, foreground focus and readiness. [docs/perf-qa.md](../perf-qa.md) states existing matrix gates (p95 frame time 33.3 ms, hitch rate 2%, recovery and collision gates). **These gates remain authoritative.**

**Important:** [D16] initializes `gpuRender` to `null` because GPU readings are attached later by [D17]. Do not infer from that literal that the profiler is disabled or broken.

### 3.5 Source image comparison

[D13] already computes image coverage delta, silhouette mask difference, mean colour error and brightness ratio. That is useful for material/biome relationship checks. It is **insufficient as the only regression gate**: a tiny but obvious missing lamp, flower or rock can be diluted by an entire 1600×900 frame. Ponlai's [P8, P9] identify this failure mode and use spatial windows and named crops.

Do **not** silently repurpose the established `compareRenderedImages` thresholds. Add an optional, separate **parity metric** with its own calibrated thresholds and leave the semantic look gates intact.

## 4. New architecture and dataflow, minimal and SOLID

```text
Existing scene fixtures: environment-look-shots.json / world-visual poses / PP poses
                            |
                  QA-only YAML policy [NEW]
                            |
                 Thin baseline orchestrator [NEW]
                            |
              +-------------+--------------+
              |             |              |
     world visual QA    environment look    existing perf/PP QA
              |             |              |
              +-------------+--------------+
                            |
                 QA capture manifest [NEW]
           (normalized read-only metadata + hashes)
                            |
                  A/A sample identity
                            |
             JS image-parity comparator [NEW]
                    /                 \
          semantic existing gates   per-window/crop parity
                    \                 /
                        verdict
                            |
          report.json + PNGs + diff crops (tmp)
                            |
               PR C-L evidence contract
```

The orchestrator owns **sequence and validation**, not browser state, renderer state, GPU locks, terrain loading, temporal history or resource allocation. It must reuse existing scenario IDs, preserve the actual runner's exit status and reject partial artifacts.

### Proposed small files

| Path | Purpose | Existing/new |
| --- | --- | --- |
| `scripts/fixtures/render-regression.yaml` | QA suite selection, existing fixture references and comparison policy; no app-visible runtime config | **New** |
| `scripts/lib/render-regression-config.mjs` | YAML validation and normalization using installed `js-yaml`, no duplicate parser framework | **New** |
| `scripts/lib/render-capture-manifest.mjs` | Normalize, validate and atomically publish capture manifest v1 | **New** |
| `scripts/lib/render-parity-metrics.mjs` | Image diff with bounds/windows/ROIs on top of [D13] | **New** |
| `scripts/run-render-regression-qa.mjs` | Narrow CLI to collect/compare evidence by invoking current runners | **New** |
| `test/render-capture-manifest.test.js` | Pure manifest validation and source-state tests | **New** |
| `test/render-parity-metrics.test.js` | Synthetic images, A/A calibration and spatial/regional tests | **New** |
| `scripts/lib/world-visual-report.mjs` | Only if common manifest hookup is needed; keep existing validation | Existing, **small modification** |
| `scripts/lib/world-visual-source.mjs` | Only if stable source fingerprint data cannot be reused directly | Existing, **small modification if necessary** |
| `scripts/run-world-visual-qa.mjs` | Optional capture metadata/manifest hook; no changes to rendering | Existing, **minimal modification** |
| `scripts/run-environment-look-qa.mjs` | Optional repeat/capture hook or report normalization; preserve current look gates | Existing, **minimal modification** |
| `scripts/run-post-processing-browser-qa.mjs` | Optional normalized output fields and repeat check; no changes to PP graph | Existing, **minimal modification** |
| `scripts/run-perf-qa.mjs` | Optional source/setting identity and two-arm provenance output | Existing, **minimal modification** |
| `src/editor/performance/qa/GpuPassProfiler.js` | Only fix specific sampled-timestamp issues found by tests; no second profiler | Existing, **prefer unchanged** |
| `src/render/postprocessing/PostProcessingDiagnostics.js` | No new passes; preserve existing nullability and labels | Existing, **prefer unchanged** |
| `docs/rendering/render-regression-qa.md` | Actual commands, calibration and evidence conventions | **New** |

Avoid growing any script into a sprawling orchestrator. Split only when the code has two clear responsibilities. Prefer writing integration adapters around existing exports instead of duplicating implementations. If three existing runners already record a field, normalize it **after capture** rather than adding three copies of the same logic.

### Configuration ownership

This is **QA-only**, not a new `config/render-enhancements.yaml` feature. Do not expose it to the runtime renderer or scene-save format.

Suggested initial YAML shape (**proposed**, not yet deployed):

```yaml
schemaVersion: 1

capture:
  viewport:
    width: 1600
    height: 900
    deviceScaleFactor: 1
  requireHardwareWebGpu: true
  requireSettled: true
  requireCleanSource: true
  requireSourceUnchanged: true
  repeatsPerScene: 3
  outputRoot: tmp/render-regression
  includeHud: false

suites:
  fast:
    - source: environment-look
      shot: grassland-off-12
    - source: environment-look
      shot: forest-off-12
    - source: environment-look
      shot: coast-off-12
    - source: environment-look
      shot: town-off-21
  extended:
    - source: environment-look
      shot: core-rainforest-off-12
    - source: environment-look
      shot: core-taiga-snow-12
    - source: environment-look
      shot: glacier-off-12
    - source: environment-look
      shot: snow-eye-off-12
    - source: environment-look
      shot: forest-off-18.6
    - source: environment-look
      shot: forest-storm-12

comparison:
  colorSpace: srgb8
  windowPixels: 32
  requireSameViewport: true
  requireSameRendererBackend: true
  requireSameBrowserBuild: true
  # Must be calibrated from same-build A/A captures first.
  calibration: required
  thresholds: null

profiling:
  scenarios:
    - chunk-cross
    - settlement-approach
  warmupSeconds: 8
  measureSeconds: 12
  settle: true
  timestampComparison: separate-runs
```

**Validation:** every `source/shot` pair must resolve to an existing registered fixture. The IDs in the example are grounded in [D3]. Disallow unknown keys, duplicate names, path traversal, nonfinite numbers, negative durations, nonsensical viewport sizes, and fractional repeat counts. Require repeat count ≥2 for parity calibration. A threshold of `null` means **fail closed on parity acceptance** (the QA can still report images and metrics for calibration); it must not mean “allow anything”.

`repeatsPerScene: 3` is a **proposed starting measurement count**, not a statistically validated threshold for all scenes/hardware. Increase when the observed noise distribution requires it.

If invoking the existing `qa:look` suite for individual shots is slow or violates its dependent reference gates, use the runner's existing `--only` selection semantics and preserve any automatically included comparison shots. Do not modify its semantic gate behaviour to accommodate new parity capture.

## 5. Capture manifest v1: exact contract

### 5.1 Identity: three separate concepts

**Source identity** (which code and content produced the pixels):

- Git commit SHA.
- Clean working tree, or immutable `__worldVisualSource` snapshot with file hash.
- Relevant renderer version from installed/lockfile.
- Hash of each referenced QA fixture, config, world data and capture-tool source.
- Build/preview identity; a development server whose files changed during a capture is unacceptable.

**Scenario identity** (what was viewed):

- Stable suite/shot ID (not a free-text file path).
- Actual world/map identity and seed/hash.
- Canonical world camera coordinates and orientation (document degrees/radians explicitly).
- Render-relative camera position **and** floating-origin offset, not one ambiguous `x/z` pair.
- Weather, sun/hour, lighting overrides, post-processing preset and **resolved** settings.
- Actual viewport CSS size, DPR, drawing-buffer size, output colour space and render scale.
- Relevant screenshot mode (HUD vs renderer-only) and temporal AA mode.

**Run identity** (how, where and when):

- Browser exact build/version; OS and GPU adapter details.
- Actual renderer backend WebGPU (not just `navigator.gpu` available), fallback status.
- Capture readiness state including blockers, asset integrity and temporal validity.
- Measurement/capture mode, warm/cold cache, repeat index and run order.
- Artefact relative path, SHA-256, dimensions, optional diff/ROI metadata.
- QA errors/warnings, timing source and whether device timestamps are supported.
- Capture start/end timestamps, without incorporating wall-clock into the comparison key.

A change in source SHA does not automatically mean changed pixels; it means a new **reference identity**. To compare two commits, require an explicit pair of source identities and matching scenario/hardware configuration. A clean new reference cannot be retroactively inferred from a live working tree that has since changed.

### 5.2 Example report envelope

This is a **shape**, not claimed current output. Fields are illustrative, null explicitly means not measured.

```json
{
  "kind": "drusniel-render-regression",
  "schemaVersion": 1,
  "suite": "fast",
  "source": {
    "gitSha": "actual-40-character-sha",
    "dirtyFiles": [],
    "frozenSourceSha256": null,
    "threeResolvedVersion": null,
    "fixtureSha256": "actual-hash-if-known"
  },
  "environment": {
    "browserVersion": null,
    "adapter": {
      "backend": "webgpu",
      "vendor": null,
      "architecture": null,
      "description": null,
      "fallback": false
    },
    "viewport": {
      "widthCssPx": 1600,
      "heightCssPx": 900,
      "deviceScaleFactor": 1,
      "drawingBufferWidthPx": null,
      "drawingBufferHeightPx": null
    }
  },
  "shots": [
    {
      "id": "grassland-off-12",
      "world": {
        "id": "procedural",
        "seed": null,
        "sourceHash": null
      },
      "camera": {
        "canonical": { "x": -1869, "y": null, "z": -4003 },
        "renderRelative": null,
        "originOffset": null,
        "yawRadians": 2.488,
        "pitchRadians": -0.08,
        "fovDegrees": 68
      },
      "lighting": { "hour": 12, "weather": "off" },
      "rendering": {
        "postPreset": null,
        "temporalMode": null,
        "historyResetCount": null,
        "readySignal": null
      },
      "readiness": { "passed": false, "blockers": ["not-yet-measured"] },
      "captures": [],
      "comparison": { "status": "uncalibrated" }
    }
  ],
  "result": {
    "status": "pending-hardware",
    "reasons": []
  }
}
```

Never output strings like `"actual-40-character-sha"` as accepted hashes. The concrete code must validate real SHA formats. The placeholder example above shows structure only; it is deliberately **not** a valid accepted manifest.

### 5.3 Manifest production rules

- Store one `report.json` per suite/arm, plus one per-scene JSON if a scene needs diagnostic detail; avoid duplicating megabytes of per-frame data.
- Write temporary `.pending`/`.tmp` files and rename to the final manifest **after** all listed artefacts exist and hashes validate (Ponlai [P4]'s `complete.json` principle).
- On crash, retain a `failed.json` or partial logs for investigation, but never advertise the incomplete capture as an accepted reference.
- Refuse to treat stale/missing screenshot paths as valid, including path traversal outside the configured output directory.
- Keep output and reference directories keyed by full source SHA, browser version, fixture/capture-policy hash and scenario ID; sanitize IDs.
- A browser build change requires fresh A/A calibration or explicit browser-equivalence evidence. Never reuse cross-driver exact-pixel thresholds by assumption.
- Hash the **original PNG bytes** for artefact integrity. Compare **decoded pixels** for visual equivalence because PNG encoding may differ.
- On current source mismatch during live capture, reject **that run**, not silently update the expected baseline to whichever commit is newest.
- Distinguish error types: `not-ready`, `incompatible-hardware`, `source-changed`, `calibration-required`, `visual-regression`, `profiling-unsupported` and `runner-failed`.

### 5.4 Atomic publication pseudocode

```js
async function publishCaptureManifest(outputDir, manifest) {
  const normalized = validateCaptureManifest(manifest);
  await assertDeclaredArtifactsExist(outputDir, normalized);
  await assertArtifactHashesMatch(outputDir, normalized);
  await writeJsonAtomic(outputDir, "complete.json", normalized);
  return normalized;
}
```

The `validateCaptureManifest` and `writeJsonAtomic` routines should be pure/small where possible. The exact filenames are proposed. Locking must cover concurrent writers to the same reference key or fail with a clear conflict; never let one writer replace another accepted reference mid-run. A standalone GPU lock **does not** serialize offline manifest writers.

## 6. Readiness contract: streamed world, weather, shader and temporal history

### 6.1 What Drusniel already checks

[D7] has `PerfQaSettleGate.update(readiness, waitedSeconds)` with a 60-frame stable streak and timeout. [D8] aggregates collision, streaming, construction and vegetation readiness; [D6] asks the runtime visual harness to settle at a camera pose. [D11] currently waits a configured number of frames after post-processing changes. [D19] documents history reset reasons and reactive events.

This is stronger than a fixed “wait five seconds” rule. PR B must preserve it and **close only genuine gaps**.

### 6.2 What Ponlai's code teaches

[P5] `Settled.ts` maintains a scene-settled signal based on a keyed scene state, outstanding pipeline/bake work, stable light/shadow state and finished loading-overlay fade. [P6] `TemporalRest.ts` uses camera projection/view, clock, resolution and scene epoch to reason about whether a temporal rest is actually from one stable scene. [P7] records `exact`, `tolerance`, `capped` and `converged` capture statuses and explains why restarting the capture loop can itself disturb temporal convergence.

**Port the invariant, not the implementation:** the QA capture must be taken from a coherent, quiet Drusniel rendering state. Do not duplicate Ponlai's `TemporalRest` or its GPU device `watchPipelines` monkeypatch, and do not pause/restart our render loop without demonstrating that doing so preserves TAAU history.

### 6.3 Proposed read-only readiness snapshot

Extend the current visual/PP QA diagnostics **only where missing**:

```js
{
  worldReady: true,
  streamingReady: true,
  vegetationReady: true,
  constructionReady: true,
  assetIntegrityReady: true,
  postProcessing: {
    graphReady: true,
    historyResetCount: 7,
    lastResetReason: "camera-cut",
    taaColourValid: true,
    taaDepthValid: true,
    ssrValid: null,
    stableFramesSinceReset: 32,
    captureStable: null
  },
  weather: {
    transitionPending: false,
    shadowUpdatePending: null
  },
  loadingOverlayHidden: true,
  pendingGpuPipelineCount: null
}
```

`null` means the signal is unavailable and must be explicitly reported. Never pretend `pendingGpuPipelineCount: 0` unless a legitimate existing renderer/diagnostics owner exposes it. If no reliable pending-pipeline signal exists, use fresh-context repeated captures to characterize the risk and mark that readiness component `unverified`.

The capture gate must not inspect private Three.js internals every frame or introduce backend monkeypatching solely for test readiness. If a missing async-pipeline signal turns out essential, add it behind QA instrumentation using a stable supported callback with proper disposal and error handling, with a dedicated design review.

### 6.4 State machine for each still capture

```text
LOAD
  -> WORLD_READY       [existing runtime QA harness is available]
  -> SETTLE_STREAMING  [terrain, objects, vegetation, collision]
  -> APPLY_SCENE       [time/weather/look/PP settings/camera]
  -> SETTLE_WORLD      [current visual QA settle contract]
  -> SETTLE_TEMPORAL   [history reset count stable + validity + observed settling]
  -> CAPTURE           [capture actual renderer canvas]
  -> VERIFY            [source, state, dimensions, artifact hash, errors]
  -> ACCEPT or REJECT
```

Any world change, camera cut, FOV/resize, origin rebase, weather transition, setting topology rebuild or history-reset counter increment **restarts the relevant settling window**. Do not carry over a readiness result from the previous shot in the same browser.

**Timeout is not a degraded pass.** Save a diagnostic screenshot and blockers, then mark rejected or pending appropriately.

### 6.5 Observed frame stability: use sparingly

Still scenes with truly static presentation may be sampled twice after preparation to observe pixel stability. But weather, water, leaves and dither can keep changing by design; screenshot A/A noise and temporal convergence have to be treated differently.

- First use authoritative world/PP readiness and stable history counters.
- If comparing consecutive **still** frames, record distinct-pixel counts and colour deltas; do not demand zero changes for animated water/foliage/weather.
- Use a bounded stability window and report a separate `still-changing` status, **not** fabricated “settled” after the cap.
- In dynamic scenes, capture at a controlled simulation time/state or label them **motion/semantic-only** instead of applying frozen-pixel parity.
- Do not advance the simulation clock simply to find a “stable” frame unless the fixture explicitly controls clock advancement.
- Do not invent direct access to a screenshot readback buffer: WebGPU's presented canvas may not be safely readable by `drawImage` after presentation, as [P7] warns.

### 6.6 Floating-origin correctness

Drusniel has an effectively unbounded canonical world and a floating origin; its default rebase threshold is set in `editor.config.yaml`. A matching camera in canonical coordinates may have a **different render-relative position** depending on origin snaps. A QA report must capture both.

At capture:

```text
cameraCanonicalXZ = floatingOrigin.toCanonical(cameraRenderXZ)
cameraRenderXZ    = actual camera/player/viewport XZ
originOffsetXZ    = floatingOrigin.getState() (record the raw documented fields)
```

Those are **conceptual** operations; follow actual source APIs and coordinate conventions, including any camera/player differences, rather than blindly applying this pseudocode. Verify existing report fields: [D17] `buildPostProcessingCaptureSnapshot` already records an origin snapshot and camera pose; reuse it. A rebase during capture should invalidate/readiness-reset relevant post histories. The comparison must assert same **canonical** viewpoint, not assume render-relative `x/z` equality proves it.

Add a dedicated rebase QA scenario using [D9]'s existing phase route; do not synthesize an unsupported teleporter or a new global world state.

## 7. Image-difference algorithms and calibration

### 7.1 Why whole-frame average is insufficient

A one-level change across a whole surface or a small missing item may be imperceptible to a single whole-frame mean. [P8, P9] explicitly check pixel counts, small windows, named crops and mean **signed** changes. [D13]'s coverage/mean colour metrics are valuable but not a substitute for spatial parity.

### 7.2 Pixel-space contract

- Decode PNGs with existing `sharp`.
- Require identical width, height, channel interpretation and colour space. Compare renderer-only screenshots to renderer-only screenshots; do not compare HUD to clean canvas.
- Convert to a consistent 8-bit RGB presentation-space representation for screenshot parity; alpha handling must be explicit (composite on a fixed background only if captures require it).
- Record original `width/height/DPR` and file SHA-256. Do **not** resize the primary images before pixel/window comparison.
- Normalize region-of-interest (ROI) definitions to `[0,1]` rectangle coordinates in the YAML or derive via per-scene metadata; never borrow Ponlai's fixed cliff/meadow boxes.
- Reject out-of-bounds ROIs and invalid masks. Small targets such as lanterns should use named crops verified visually against that fixture.
- For exposure changes, also report luminance distribution and shadows/highlights **as observations**, but do not use those alone as the safety gate.

### 7.3 Core per-pixel and window metrics

For two RGB images `R` and `T` with pixel index `p` and channel `c`:

```text
delta[p,c] = int(T[p,c]) - int(R[p,c])

maxChannelError[p]  = max_c(abs(delta[p,c]))
meanAbsError        = sum_p,c(abs(delta[p,c])) / (3 * pixels)
meanSignedDrift[c]  = sum_p(delta[p,c]) / pixels
pixelsAboveLevel(k) = count_p(maxChannelError[p] > k)

For every non-overlapping or sliding window W:
  windowMeanAbsError[W]      = mean(|delta| inside W)
  windowMeanSignedDrift[W,c] = mean(delta[channel c] inside W)
  windowPixelsAbove(k)[W]   = count/maxRatio of differing pixels

For every named ROI:
  calculate all the same metrics independently
```

Recommended **candidate** initial window size: 32×32 pixels, informed by [P8] but not adopted as an accepted constant until calibration. The number of windows and the selected ROI definitions must be recorded. Aggregate fixed grid windows are cheaper and deterministic; supplement with sliding windows or worst-region crops only if the fixed grid misses deliberate synthetic defects.

**Important:** calculate integer sums or numerically stable reductions so repeated comparisons cannot differ based on thread execution order. Every result must identify the colour space and whether alpha was composited. Avoid an expensive per-pixel JS object allocation.

### 7.4 Calibration from A/A, not guessed thresholds

For each fixture and hardware/browser/quality configuration:

1. Capture at least three fresh-load same-build runs, with distinct contexts and an independent source/readiness validation. For high-value scenes also repeat from a different preceding view to expose stale scene state.
2. Compute all pairwise A/A metrics. Record worst and distribution, per scene, per ROI and per window.
3. Determine allowable thresholds from **measured intra-build variance** plus an explicitly documented measurement margin. Do not derive “pass” values from one arbitrary Ponlai screenshot.
4. Run synthetic defect tests: one missing small object-sized patch; one uniformly shifted small region; a one-level coherent colour shift; a small positional displacement; a high-contrast pixel defect; TAA-like diffuse speckle.
5. Confirm thresholds **pass A/A but fail each specified synthetic defect class**. If both cannot be achieved, mark the view unfit for pixel-parity gating and use a different fixture/mask or semantic assertion, not a loose global threshold.
6. Validate calibration against a second independent A/A round, not only the samples used to set thresholds.
7. Store the thresholds, scene ID, calibration source SHA, adapter/browser family, version and full measured noise envelope. Any changed rendering mode/viewport/browser invalidates or requires revalidation.
8. Future visual-change PRs should review a side-by-side contact sheet and worst crops, not only a single numeric score.

For **deterministic opaque static** scenes where repeated same-build captures genuinely match exactly, require decoded-pixel equality. For TAA/TAAU, animated coast/weather/foliage, allow only the measured A/A tolerance; no global “all temporal captures get ±20” shortcut.

### 7.5 Comparison verdict pseudocode

```js
function compareCapturePair(reference, candidate, calibration) {
  assertCompatibleCaptureIdentity(reference, candidate);
  const metrics = measureSpatialDifferences(reference.pixels, candidate.pixels, calibration.rois);
  const violations = checkCalibratedLimits(metrics, calibration);
  return {
    status: violations.length === 0 ? "passed" : "visual-regression",
    metrics,
    violations
  };
}
```

For repeated captures, report **all pairings**, the best admissible pairing and the worst A/A pairing. A single lucky best pairing should not erase an unstable candidate; enforce candidate A/A consistency first. Ponlai permits a bounded recapture for temporal variance [P8]; Drusniel can adopt that policy **only** when a documented calibration has justified it.

A green decision requires compatible scene/source identities, clean readiness, verified hardware and calibrated comparison policy **in addition** to image metrics.

### 7.6 Report useful diagnostic images

On mismatch, save under the suite's own output directory:

- Original reference and current capture (unchanged).
- A clipped/max-channel heatmap clearly labelled by amplification factor.
- Worst 3–5 windows as 1:1 before/after/diff crops.
- Named ROI pair crops (e.g. shadow edge, shoreline, lantern, forest foliage).
- A small contact sheet for human review.

Use `sharp` for compositing/resizing; do not introduce Python/Pillow/NumPy solely to emulate [P8]. For large capture sets, bound intermediate memory and output sizes. A diff tool must run on existing captures without requiring a GPU.

## 8. GPU timing methodology and profiling improvements

### 8.1 Existing Drusniel timing scopes

[D15] `GpuPassProfiler`:

- Starts only when requested and WebGPU backend timestamp tracking is available.
- Hooks render-context `beginRender` to attach names to timestamp IDs.
- Samples approximately every 8 frames by default.
- Calls `renderer.resolveTimestampsAsync('render')` out of the animation path.
- Writes timing stats only for supported timestamp data.
- Reports explicit scope: **sampled render passes; excludes CPU submission, uploads and compute work**.
- Restores patched backend `beginRender` during `dispose()`.

[D10] `PostProcessingDiagnostics` separately records an aggregate `totalPost` when possible and retains named per-effect timing keys as `null` until independently observable. Do not merge these to claim one effect's GPU millisecond cost.

[D16, D17] separately report CPU animation phases, `renderSubmissionCpu` and `gpuRender`. These have different meanings.

### 8.2 What Ponlai adds methodologically

[P11, P12] distinguish timestamp-on profiling from user-visible frame pacing: Chrome timestamps can materially affect scheduling. Ponlai's report describes up to a quarter faster measured frame pacing with timestamps enabled **on its tested setup**. That number is evidence of a potential bias, **not a universal correction factor** to apply to Drusniel.

PR B must define **two linked runs** for baseline and candidate:

**Run 1 — player-visible pacing**
- Same scene/movement route, headed browser, hardware WebGPU and focus.
- `gpuTimings=0`.
- Measure frame p50/p95/p99, hitch rate, FPS, CPU phases and recovery.

**Run 2 — diagnostic GPU pass sampling**
- Same source/snapshot, scenario, hardware, viewport and workload, with `gpuTimings=1`.
- Measure `gpuRender.supported`, `source`, `sampleEvery`, per-context `passes` and total.
- Use these to locate expensive passes, **not** as an absolute whole-frame GPU denominator.

Interleave A/B/A/B runs on a quiet machine where possible. No other GPU-intensive process or QA task should overlap. Note that browser/browser-cache warming influences results; preserve run order. Readiness and A/A validation are separate gates.

### 8.3 Specific implementation constraints

- Add a small typed-ish JS report field such as `profileMode: "pacing" | "gpu-pass-sampled"` and a `pairedRunKey` derived from scenario, source, configuration and hardware. These are **QA metadata**, not user settings.
- If GPU timestamp support is unavailable, record `supported: false` or `null` and reason. Never coerce unavailable to 0 ms.
- Ensure pending async samples resolve or are bounded/explicitly omitted at the end of a run. Do **not** block the render loop to wait for timestamps; an end-of-run bounded async drain is acceptable if already supported.
- If a device is lost, backend recreated or profiler disposed, discard obsolete timestamp generations and report that event. [D15] already uses a generation check; tests should cover it rather than replacing the algorithm.
- Check the existing profiler's backend patch ownership. Never add another wrapper to `backend.beginRender` just to improve labels.
- Keep diagnostic mode off during ordinary gameplay.
- Preserve existing stage/perf budgets; record pass names such as `shadow/depth` and `offscreen` as observed, and never claim the generic `offscreen` pass is specifically AO/cloud/ocean without a proven render target/label.
- If direct node-level GPU profiling requires invasive renderer changes, defer it to a later, separately profiled task. PR B's purpose is **measurement trust**, not a new instrumentation framework.

### 8.4 Test ideas for existing GPU profiler

Use a fake backend in small unit tests, matching [D15]'s actual constructor contract:

- Not requested → no monkeypatch, no samples.
- Unsupported renderer/backend → `supported: false`.
- Proper begin/end/readback → one non-negative sample with correct aggregation.
- Rejected readback → error captured; later behaviour explicit.
- Repeated reset while readback pending → stale generation not accepted.
- `dispose()` is idempotent; restores the exact previous callback if still owned.
- A second profiler attempting to instrument the same backend is refused or handled without corrupting the previous owner; if this cannot occur with current lifecycle, document rather than overengineer.
- Context names include stable semantics where the source provides them. IDs may change; compare logical categories, not brittle numeric IDs.
- Timestamp scopes cannot be mistaken for milliseconds of CPU render submission.

Do not mark a fake-timing unit test as evidence that hardware timestamp support is present.

## 9. Exact phased PR B implementation sequence

### B.0 — Rebase the plan to the live code before touching anything

1. Follow `AGENTS.md` (shared `main` only), inspect `git status --short`, fetch/pull safely and read last commits.
2. Verify PR A's **implementation**, not just its plan, actually landed. If only the PR A spec exists, implement its small prerequisite version/provenance changes first in an appropriately focused commit or mark as pending; never imply the prerequisite is done.
3. Check current `package.json`/`package-lock.json`. Do not pin Three.js r186.1 merely to align with Ponlai.
4. Inspect QA scripts for newer changes not represented by this snapshot.
5. Record original config/capture-test hashes and tool versions before modifications.

### B.1 — Establish the manifest parser and pure data contract

Create `scripts/fixtures/render-regression.yaml`, `render-regression-config.mjs` and `render-capture-manifest.mjs`.

- Read YAML through the existing installed `js-yaml` package in Node scripts, as appropriate; no separate YAML dependency.
- Keep constants in the QA YAML or a small dedicated constants module, not mixed throughout orchestration code.
- Resolve suite/shot references using existing fixtures. Never duplicate world coordinates.
- Validate manifests and canonical-vs-render coordinate field units.
- Implement atomic final manifest publication, artifact hashes and safe relative paths.
- Write unit tests before modifying browser runners.

**Acceptance B.1:** all validator tests pass; missing hash/scene/malformed path/incompatible viewport fail; original runners still work unmodified.

### B.2 — Normalize existing capture metadata

Use adapters that take the actual reports from [D1], [D2], [D11] and [D18] and turn them into the `CaptureManifestV1` representation. Insert read-only fields into existing runners **only when otherwise unavailable**.

Record source+fixture SHA, version, actual viewport/DPR, browser/adapter/backend, scene identity, canonical/view-relative pose and origin, weather/time, PP mode, history validity, readiness blocker list, screenshot hash and browser errors.

**Avoid:** initializing another dynamic scene settings object; modifying world data to obtain metadata; serializing huge scene graphs; sampling GPU memory APIs that do not exist.

**Acceptance B.2:** two captures of one fixed pose have identical scenario IDs and expected metadata; source mutation is rejected; changing a world setting alters scenario identity, not just the screenshot.

### B.3 — Build an A/A capture collection mode

Implement the thin `run-render-regression-qa.mjs` orchestrator. It may launch existing scripts sequentially as subprocesses with explicit arguments and captured stdout/exit status, or call exported functions if the existing code can safely be reused without intrusive refactoring.

- Default to a **fast subset** of four grounded environment-look shot IDs; expand later.
- Preserve the shared [D14] hardware QA lock. The outer orchestrator must **not** acquire the same lock before a child runner acquires it.
- Produce at least two truly independent scene loads per selected shot, not merely duplicate one PNG.
- Verify all images are complete/readable, scene/adapter/source state is unchanged and all original runner gates passed.
- Use isolated `tmp/render-regression/<source-key>/<run-id>/` paths. Never overwrite a golden capture in-place.
- Save a readable evidence summary and a machine-readable manifest.
- Do not alter the shipped renderer to simulate a static captured world.

**Acceptance B.3:** cold and warm captures reported separately; no skipped/partial shot silently passes; shared GPU lock remains effective.

### B.4 — Introduce spatial parity comparison and calibrated thresholds

Implement `render-parity-metrics.mjs` as a pure comparison library using `sharp` and [D13]'s design:

- Decoded-image strict size matching.
- Per-pixel channel delta and count above severity thresholds.
- Global and per-window mean absolute/signed errors.
- Named normalized ROIs and worst-crop export.
- A/A noise collection and threshold calibration metadata.
- Synthetic regression battery to prove misses are detected.
- Explicit `uncalibrated` status where no trustworthy measured thresholds exist.
- No redefinition of existing `qa:look` semantic thresholds.

**Acceptance B.4:** synthetic one-level region shift, a missing small 16×16 object, a changed lamp-sized patch and displaced feature are detectable at calibrated thresholds; A/A pairs from current hardware pass. If not achievable, report the limitation and restrict gate coverage.

### B.5 — Strengthen readiness without new renderer infrastructure

First evaluate current `__worldVisualQa.settle`, [D7, D8], [D9, D10, D11] and capture outputs:

- Which blockers are already present?
- Is a post-processing history reset immediately before screenshot detectable?
- Can the capture read a stable frame count since the latest reset?
- Does an image-changing weather transition remain active after the existing world settle reports ready?
- Does a hidden loading overlay actually finish before capture?

Add only a **read-only** diagnostic/QA gate for missing signals. If the time/weather state inherently animates, configure the shot as a controlled-time or motion-only scenario instead of forcing exact stillness.

**Acceptance B.5:** injected unready/late-reset/overlay conditions produce rejected captures with reasons; a clean static capture reports its actual settling state; no render-loop overhead with QA disabled.

### B.6 — Pair authoritative pacing and GPU-pass diagnostics

Add a minimal metadata linkage to [D18] reports or the orchestrator's output, not new timestamps:

- Use two independent runs per scene: `--gpuTimings 0` (pacing) and `--gpuTimings 1` (render-pass diagnostics).
- Preserve existing readiness/collision/recovery/focus/adapter gates.
- Record `renderSubmissionCpu` and `gpuRender` separately.
- If QA tooling already emits enough metadata, normalize it after completion rather than modifying [D15].
- Only consider a code change to `GpuPassProfiler` with a specific reproduced bug and regression test.

**Acceptance B.6:** JSON identifies source, adapter, mode, scenario and timer scope; unsupported GPU timings appear as unsupported; no render-loop-blocking readback introduced.

### B.7 — Review, documentation, evidence and completion

Run existing local tests and browser QA, record machine/browser/capture state and create at least one accepted baseline set if suitable hardware is present.

Build a concise `docs/rendering/render-regression-qa.md` page with examples, calibration methods and rejected-run handling. PR C must be able to add histogram exposure without inventing new screenshot validation infrastructure.

Commit only PR B files to `main`; do not add generated artifact floods or unrelated changes.

## 10. Actual existing commands vs new proposed command

**Existing, verified from `package.json` and scripts:**

```bash
npm test
npm run lint
npm run build
npm run qa:postprocessing
npm run qa:postprocessing:browser -- --quick --headed

# Requires app server:
npm run dev

# Headed GPU browser with established movement settling and timestamp sampling:
npm run qa:perf -- --headed --qa chunk-cross \
  --warmup 8 --duration 12 --settle \
  --gpuTimings 1 --drain-seconds 15 \
  --out tmp/render-regression/chunk-cross-gpu.json

# Authoritative pacing mode: no timestamp queries:
npm run qa:perf -- --headed --qa chunk-cross \
  --warmup 8 --duration 12 --settle \
  --gpuTimings 0 --drain-seconds 15 \
  --out tmp/render-regression/chunk-cross-pacing.json

# Existing look test (server is expected on port 5174):
npm run qa:look -- --only grassland-off-12,forest-off-12
```

The QA package scripts themselves are authoritative for exact run syntax, and server ports differ by runner. The proposed orchestrator should discover/validate the right URL for each rather than assume all existing scripts use one port. On WSL2, use the established `qa:perf:windows` wrapper to reach actual hardware WebGPU when native WSL Chromium is software-only.

**Proposed PR B command (not yet available):**

```bash
node scripts/run-render-regression-qa.mjs \
  --config scripts/fixtures/render-regression.yaml \
  --suite fast \
  --out tmp/render-regression/pr-b-fast

node scripts/run-render-regression-qa.mjs \
  --config scripts/fixtures/render-regression.yaml \
  --suite fast \
  --reference tmp/render-regression/accepted-reference \
  --out tmp/render-regression/pr-b-check
```

Document exact CLI flags after implementation. Prefer `npm run qa:render-regression` alias if it adds value, but do not create aliases duplicating every existing QA script. No GitHub Actions.

## 11. Acceptance matrix and budgets

### 11.1 Required scenario selection

| Scenario | Source already present | Why it matters | PR B acceptance |
| --- | --- | --- | --- |
| `grassland-off-12` | [D3] | Exposure/headroom and dense vegetation | A/A calibration + exact state metadata |
| `forest-off-12` | [D3] | Deep shadow versus open sky | Readiness + localized window gate |
| `coast-off-12` | [D3] | Moving water/foam under sunlight | Temporal variance characterized; exact parity only if valid |
| `town-off-21` | [D3] | Night lighting and bloom | Named ROI, lighting/PP metadata |
| `forest-off-18.6` | [D3] | Golden-hour colour drift | Extended suite, colour metrics |
| `core-rainforest-off-12` | [D3] | Fine foliage/dither | Extended suite, temporal noise |
| `core-taiga-snow-12` | [D3] | Snow highlights and shade | Extended suite, bright-region sensitivity |
| `glacier-off-12` | [D3] | High luminance/reflectance | Extended suite, clipping awareness |
| `forest-storm-12` | [D3] | Weather and animated shadows | Motion or controlled-time semantics |
| `chunk-cross` | [D8, D18] | Streaming/terrain and rebase-sensitive pacing | Hardware perf, p95, hitch and recovery |
| `settlement-approach` | [D18] and [docs/perf-qa.md](../perf-qa.md) | Dense settlements, preparation and lighting | Hardware perf + focus and preparation gates |
| PP rebase route | [D9, D11] | TAA reset and history correctness | No stale image or false capture readiness |

**Do not** expand to every world/biome in PR B's first default run. Keep `fast` small; `extended` is opt-in. This follows YAGNI while retaining representative coverage for PR C and later.

### 11.2 Gates with concrete pass/fail criteria

| Gate | Required pass condition |
| --- | --- |
| Build and unit tests | `npm test`, relevant focused tests, `npm run build` pass |
| Code quality | `npm run lint` passes, or exact unrelated/pre-existing failures recorded |
| Source identity | Clean checkout/frozen source; source hash matches before and after each capture |
| Fixture identity | Every ID resolves to an actual fixture; correct world/map/hash and effective scene state |
| Hardware | Real WebGPU renderer, non-software adapter, supported browser; otherwise hardware gate **pending**, not passed |
| Readiness | Existing world preparation passes; no pending known blockers; no silent timeout |
| Temporal state | Valid known TAA/TAAU readiness, or explicitly unverified and excluded from exact parity |
| Screenshot | Correct renderer canvas, dimensions, visible rendered content, stable file SHA |
| A/A repeatability | At least two independently loaded captures; worst error documented and classification accurate |
| Parity | Calibrated global **and** spatial/crop thresholds pass; missing calibration is **not** success |
| Synthetic defects | Small missing/recoloured patch, coherent low-level shift and displacement are caught by calibrated gates |
| Movement | Existing p95 ≤33.3 ms and hitch rate ≤2% gates preserved; stronger scene-specific requirements remain |
| Recovery | Settlement/chunk streaming and collision readiness gates preserved |
| GPU report | Distinguishes sampled render passes, unsupported timers, aggregate post and CPU submission |
| Intrusiveness | No new production render pass, GPU resource or frame-loop readback; QA-disabled visual/perf parity |
| Files | No unrelated edited/uncommitted files overwritten; no forced pushes or asset churn |
| Licensing | Reference/adaptation origins documented and notices added only for actually adapted code |

The **existing performance thresholds** are not new numbers inferred from Ponlai: they come from Drusniel's [`docs/perf-qa.md`](../perf-qa.md). The image-parity thresholds, by contrast, are **TBD until calibrated**, which is an explicit release gate.

### 11.3 QA effort/performance estimates — not measured facts

- Capturing extra A/A copies should add capture wall time, but should **not** change normal game frame time when QA is disabled.
- Storing full-resolution uncompressed RGB for one 1600×900 screenshot occupies approximately 4.32 MB for RGB8 or 5.76 MB for RGBA8 (simple arithmetic; excludes decode/object/encoder overhead). Avoid retaining many full frames in memory concurrently.
- A 32×32 pixel grid on 1600×900 has 50×29 = 1,450 windows when using ceil for the last partial row; each window metric can be aggregated in a single pixel pass.
- A dedicated per-window/per-ROI diff pass may consume CPU but runs **offline after capture**, not during gameplay.
- GPU-pass timestamps may affect frame pacing; expect to measure that bias on the user's hardware rather than importing Ponlai's magnitude.

No claim of proven runtime speed, screenshot repeatability or visual fidelity should be made until local hardware captures and tests execute.

## 12. Focused test specification

### Unit: `test/render-capture-manifest.test.js`

- Valid manifest round-trips after normalization.
- Missing SHA and malformed SHA/UUID/version are rejected where required.
- Duplicate scene IDs and empty capture sets rejected.
- Unknown fixture IDs rejected.
- Source changed during run rejected.
- Wrong viewport/DPR/colour space rejected.
- Canonical/render-relative position metadata cannot be conflated silently.
- Invalid artifact path (absolute or traversal) rejected.
- Missing PNG and corrupted artifact hash rejected.
- Atomic publication makes `complete.json` visible only after all files validate.
- Interrupted write leaves diagnostics but not a successful manifest.
- Browser build changed → reference key mismatch or explicit revalidation.
- Screenshot encoding differs but decoded pixels match → visual comparison passes.
- Unsupported GPU timing stays `null`/unsupported.

### Unit: `test/render-parity-metrics.test.js`

Use generated RGB buffers, no GPU:

- Identical pixels → exactly zero difference.
- 1-pixel strong colour change increases max error and exactly one differing-pixel count.
- Uniform +1 shift over a 32×32 region changes signed means, including when whole-frame MAE is tiny.
- A 16×16 patch removed is detected by at least one local window or named ROI.
- Subtle small-feature displacement appears in worst crops and fails the synthetic calibration test.
- Channel negative shift is not lost by unsigned integer underflow.
- 3-channel and 4-channel input handling is explicit and tested.
- Different dimensions / invalid ROI / missing crop reject cleanly.
- Partial 32px right/bottom windows are covered correctly.
- A/A measured jitter is distinguishable from synthetic regression when thresholds permit.
- No calibration → `uncalibrated`, not `passed`.
- Input arrays are not mutated and output ordering is deterministic.

### Integration: existing browser QA

- World-visual pose reports valid with clean and HUD images, hash validation and zero browser errors.
- Environment look retains its existing semantic gate pass/fail.
- Post-processing quick suite preserves its existing preset and history-reset assertions.
- Known camera cut or resize resets capture readiness; old accepted captures cannot be reused under a different viewport.
- After origin rebase, a canonical camera snapshot remains coherent while render-relative changes are recorded.
- On unsupported hardware, capture returns a clear infrastructure status rather than inventing a green run.

### GPU-profiler unit coverage if relevant

- Timestamp support checks, asynchronous readback, zero/nonfinite filtering and stale-generation rejection.
- Restore exact original backend callback on disposal; no double instrumentation.
- CPU and GPU timing labels remain separate in normalized report.

Do not add slow browser integration tests to the default `node --test` glob if they require a running local Vite server or a hardware GPU. Keep hardware tests as explicit local QA commands, not intermittently failing unit tests.

## 13. Failure modes and rollback plan

| Failure mode | Underlying hazard | Prevention |
| --- | --- | --- |
| Equal pixels while shader still compiling | Three.js can skip a draw pending async pipeline | Use runtime readiness plus independent repeat; do not treat immediate equal frames as enough |
| Broken TAA parity after pause/restart | Temporal history changes during capture | Use existing running history and settled status; no new loop pausing until verified |
| Weather/waves never become pixel-static | Legitimate animation | Controlled clock, motion-only semantic assertions or documented nondeterminism |
| Stale origin/pose | Canonical coordinates confused with local | Record both spaces and actual origin offset |
| False FPS improvement from timestamp mode | GPU queries influence scheduling | Separate runs with timestamps on/off |
| Generic offscreen pass mislabelled “clouds” | Render-context name not specific | Keep observed pass labels and source/coverage limitations |
| Source changed during dev-server capture | Hot-reload and partial rebuild | Verify frozen source before and after; reject run |
| Reference silently overwritten | Partial or concurrent writer | Immutable keys, atomic complete manifest, conflict refusal |
| One screenshot PNG has changed encoder | Byte hash differs despite same pixels | Integrity uses SHA-256; visual equality uses decoded pixels |
| Mean error misses a small object | Whole-frame dilution | Per-window, ROI and worst-crop checks |
| A/A threshold too loose | Hide real image regression | Synthetic injection tests and separate calibration-validation round |
| A/A threshold too tight | Fail on ordinary temporal noise | Per-scene calibrated temporal classification |
| Heavy image diff blocks gameplay | Diff called during frame | Offline-only comparison after capture |
| Incomplete report marked pass | Runner crashes after writing PNG | Publish complete manifest last; preserve failure diagnostics |
| Nested GPU locks deadlock | Orchestrator and child both acquire same lock | Only existing child runner acquires shared lock |
| Software WebGPU accepted as GPU baseline | Misleading timing | Reject fallback/unknown adapter |
| A PR adds an unwanted new QA dependency | Unnecessary maintenance | Use installed `sharp`, `js-yaml`, Playwright and Node test |
| Another session modifies `main` | Shared checkout contention | Inspect latest head and stage only owned paths; no force-push |

**Rollback:** revert the small QA-only PR B changes. Remove the new `qa:render-regression` alias if added. Retain existing world-visual, environment-look, post-processing and performance QA commands untouched. Generated `tmp` references are not production assets. No rendering feature flag or GPU resource cleanup should be needed because production rendering was not changed.

## 14. Commit procedure and review checklist

### Recommended developer sequence

```bash
git status --short
git branch --show-current
git pull --ff-only
git rev-parse HEAD
git log -10 --oneline

# Verify current QA owners and existing scripts before modifications:
node --test test/render-enhancements.test.js
npm run qa:postprocessing
npm test
npm run build

# Once PR B pure implementation is written:
node --test test/render-capture-manifest.test.js
node --test test/render-parity-metrics.test.js
npm run lint
npm run build
git diff --check
git diff --stat
git status --short
```

Start the Vite server separately for browser acceptance. Do not interpret browser-only scripts as complete when only `npm test` passed. Preserve `tmp` evidence and relevant contact sheets for review; do not commit huge generated image sets without specific justification.

When complete, stage only the PR B files. Direct commit to `main` is project policy (see `AGENTS.md`), but respect other sessions' simultaneous modifications. Do not reset/stash/force-push their work.

Suggested commit summary, **when implementation actually lands**:

```text
test(render): add source-pinned repeatable visual and GPU QA baselines
```

### Definition of done

- [ ] Current main/Three.js version verified and recorded.
- [ ] PR A prerequisite implementation status explicitly checked, not assumed.
- [ ] All referenced source paths confirmed against current local checkout.
- [ ] QA-only YAML policy validated; existing runtime/render config unchanged.
- [ ] One manifest normalizer, no new browser/render/QA framework.
- [ ] All selected fixture IDs resolve to existing Drusniel scenes.
- [ ] Clean source, adapter, viewport, canonically matched camera and source-stability requirements enforced.
- [ ] Capture readiness includes existing streamer/asset checks and handles temporal uncertainty explicitly.
- [ ] Separate A/A calibration and true before/after comparison with local error gates.
- [ ] Synthetic regression battery proves small changes are not hidden by global means.
- [ ] Reports include hashes, repeat identities, accepted/rejected reasons and readable diff crops.
- [ ] Hardware p95/hitch/recovery gates preserved.
- [ ] Timestamp-on and timestamp-off methods separated; sampled GPU render timings never called whole-frame GPU cost.
- [ ] Unit/build/lint and relevant hardware browser QA results reported accurately.
- [ ] No production shader/graph changes and no new GUI behaviour.
- [ ] No unrelated changes overwritten; no GitHub Actions.
- [ ] PR C can use the same baseline and gating contract for HDR exposure before/after.

## 15. PR C handoff: HDR exposure will depend on these guarantees

Once PR B provides reliable, source-pinned captures, PR C can add histogram exposure metering to the existing `PostProcessingGraph`/`PostProcessingSettings` (as laid out in PR A), with clear A/B controls for:

- Static dark forest vs bright sky: adaptation versus local tone.
- Grassland noon: bright headroom not clipped.
- Sunset: warm sun/sky preserved.
- Night street: legibility without automatic “daylight” pumping.
- Snow/glacier: bright target whites without overexposure.
- Rapid cave/forest/open-field transitions: response curve without visible flicker.
- World rebase and camera cut: no stale exposure/temporal history.
- Hot reload, resize, WebGPU recovery and mobile preset: fallback remains valid.
- GPU time: exposure pass cost measured with existing sampled timestamps, while actual frame pacing comes from timestamp-off runs.

PR C is **not** authorised to implement its histogram until the PR B comparison can distinguish intentional brightness adaptation from calibration drift and world/scene mismatches.

---

## 16. Immutable source references — Drusniel (D)

These are executable/working source files, not paraphrased research bullets.

- **[D1]** [`scripts/run-world-visual-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/run-world-visual-qa.mjs#L1-L112) — actual world/pose execution, source and artifact hashing, WebGPU check, capture and report verdict.
- **[D2]** [`scripts/run-environment-look-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/run-environment-look-qa.mjs#L1-L125) — 38 look captures, time/weather, GPU lock, asset readiness, look metrics and contact sheet.
- **[D3]** [`scripts/fixtures/environment-look-shots.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/fixtures/environment-look-shots.json#L1-L65) — verified pose and scene IDs (grassland, coast, rainforest, snow, town and more).
- **[D4]** [`scripts/lib/world-visual-source.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/lib/world-visual-source.mjs#L1-L16) — `captureVisualSource`, `visualSourceStayedFixed`.
- **[D5]** [`scripts/lib/world-visual-report.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/lib/world-visual-report.mjs#L1-L27) — `repositoryState`, `fileHash`, `validateVisualReport`.
- **[D6]** [`scripts/lib/world-visual-prepare-pose.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/lib/world-visual-prepare-pose.mjs#L1-L19) — `prepareVisualPose` and fly/ground settling.
- **[D7]** [`src/editor/performance/qa/PerfQaSettleGate.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/src/editor/performance/qa/PerfQaSettleGate.js#L1-L39) — 60-frame streak, timeout and blockers.
- **[D8]** [`src/editor/performance/qa/PerfQaHarness.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/src/editor/performance/qa/PerfQaHarness.js#L338-L520) — `settleReadiness`, `settlePhase`, `finish` and `buildPostProcessingCaptureSnapshot`.
- **[D9]** [`src/editor/performance/qa/PostProcessingQaCaptures.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/src/editor/performance/qa/PostProcessingQaCaptures.js#L1-L175) — static scene definitions, TAA/streaming/rebase movement phases.
- **[D10]** [`src/render/postprocessing/PostProcessingDiagnostics.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/src/render/postprocessing/PostProcessingDiagnostics.js#L1-L120) — aggregate/nullable timings, graph-build and temporal reset diagnostics.
- **[D11]** [`scripts/run-post-processing-browser-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/run-post-processing-browser-qa.mjs#L83-L166) and [capture implementation](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/run-post-processing-browser-qa.mjs#L272-L399) — presets, scene controls, frame waits, history counters, screenshots and errors.
- **[D12]** [`scripts/lib/world-visual-canvas.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/lib/world-visual-canvas.mjs#L1-L9) — screenshots the active world renderer canvas, not minimap/auxiliary canvas.
- **[D13]** [`scripts/lib/rendered-image-metrics.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/lib/rendered-image-metrics.mjs#L1-L40) — existing coverage, silhouette, mean colour and brightness comparisons.
- **[D14]** [`scripts/perf-run-lock.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/perf-run-lock.mjs#L1-L75) — cross-suite hardware browser GPU lock, ownership, timeout/recovery.
- **[D15]** [`src/editor/performance/qa/GpuPassProfiler.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/src/editor/performance/qa/GpuPassProfiler.js#L1-L100) — existing async timestamp sampling, scope and disposal.
- **[D16]** [`src/editor/performance/qa/buildPerfReport.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/src/editor/performance/qa/buildPerfReport.js#L120-L267) — frame percentiles, CPU phases, scenario report and placeholder GPU field.
- **[D17]** [`PerfQaHarness.finish` and `buildPostProcessingCaptureSnapshot`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/src/editor/performance/qa/PerfQaHarness.js#L420-L545) — report finalization, actual GPU profiler attachment and origin-aware post capture.
- **[D18]** [`scripts/run-perf-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/run-perf-qa.mjs#L43-L113), [WebGPU adapter guard](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/run-perf-qa.mjs#L172-L225), [capture provenance and gates](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/run-perf-qa.mjs#L428-L487).
- **[D19]** [`docs/rendering/post-processing.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/docs/rendering/post-processing.md#L1-L165) — live graph, history resets, post-processing/renderer ownership and fallback.
- **[D20]** [`docs/perf-qa.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/docs/perf-qa.md) — existing native hardware QA instructions, source/settle/matrix pass criteria and instrumentation meanings.
- **[D21]** [`scripts/compiled-yaml-plugin.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c5ecf1405350b063ca3efd90313cb21b18d676b8/scripts/compiled-yaml-plugin.mjs) — built-in YAML handling; PR B's Node-only fixture reader can use installed `js-yaml` directly.

## 17. Immutable source references — Ponlai (P)

Every referenced upstream source is pinned to the same immutable commit; copying the implementation verbatim is **not** the objective.

- **[P1]** [`tools/kit/parity/capture-set.mjs`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/kit/parity/capture-set.mjs#L1-L112) — reference/check modes, fresh-load repeats, page reuse, artefacts, A/A and capture errors.
- **[P2]** [`tools/render/profile-frame.mjs`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/render/profile-frame.mjs#L1-L160) — profiled scene definitions, mode selection, separate timestamp and pacing captures.
- **[P3]** [`tools/kit/parity/README.md`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/kit/parity/README.md#L1-L104) — byte-exact vs temporal parity and tolerance calibration methodology.
- **[P4]** [`tools/kit/reference.mjs`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/kit/reference.mjs#L1-L165) — immutable commit-keyed reference manifests, tool-source hash, browser-build tracking, atomic complete publication, coverage and stale-claim handling.
- **[P5]** [`packages/render/post/Settled.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Settled.ts#L1-L115) — readiness based on scene key, pending GPU work, lighting and no loading overlay.
- **[P6]** [`packages/render/post/TemporalRest.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/TemporalRest.ts#L1-L66) — history convergence keyed on camera/view/projection, clock, resolution, epoch and stable scene inputs.
- **[P7]** [`tools/kit/capture-browser.mjs`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/kit/capture-browser.mjs#L1-L159) — capture/browser profile behavior, readiness, screenshot alternatives, DPR pitfalls and GPU queue.
- **[P8]** [`tools/kit/diff-set.py`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/kit/diff-set.py#L1-L82) — A/A floor, temporal tolerance, local windows, per-crop/drift gates, worst-region export.
- **[P9]** [`tools/kit/parity/README.md`, “How a tolerance is set”](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/kit/parity/README.md#L65-L85) — quantitative calibration and deliberate synthetic regressions.
- **[P10]** [`tools/kit/compare-captures.py`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/kit/compare-captures.py#L1-L66) — simple same-view regional comparison, **fixed to Ponlai's own island at 1672×941**, unsuitable as a direct port.
- **[P11]** [`tools/render/profile-frame.mjs`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/render/profile-frame.mjs#L67-L100) — GPU locking and timestamp scope, performance-profile commands.
- **[P12]** [`docs/reference/profile-frame.md`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/docs/reference/profile-frame.md#L57-L90) — test conditions and why frame pacing with timestamps enabled is not authoritative.

### Source-difference notes the implementer must respect

1. **Language and libraries:** Ponlai's capture pixel tools use Python plus NumPy/Pillow; Drusniel already has Node/Playwright/Sharp. Port **metrics and methods**, not infrastructure.
2. **Scene model:** Ponlai's fixed island scene and `establishScene` cannot represent Drusniel's canonical world positions, Azgaar atlas, infinite streaming, floating origin and resident chunk lifecycles.
3. **Temporal AA:** Ponlai uses an explicit deterministic `TemporalRest`; Drusniel has its own TAA/TAAU and history-reset contract. A new rest implementation would risk changing output and duplicate state.
4. **Profiler scope:** Ponlai's profile system categorizes its own frame stages. Drusniel's `GpuPassProfiler` is render-pass-only and samples one in eight frames by default. Don't equate fields with similar names until coverage matches.
5. **Adapter:** WebGPU success alone does not establish hardware validity; Drusniel's native hardware guards already reject common software backends.
6. **Reference storage:** Ponlai has a sophisticated shared commit-keyed library and persistent browser slots. PR B needs a small immutable manifest, not its entire agent/CI/local-worktree infrastructure.
7. **Quality targets:** Ponlai's single-island capture resolutions/crops and its browser-measured timestamp bias are not universal thresholds or parameters for Drusniel.
8. **Rendering impact:** This PR improves evidence and validation. It should not make Drusniel look different; any such change is an unintended regression.

---

**Implementation handoff:** Build a thin, source-pinned regression-evidence layer over Drusniel's *existing* QA tooling; explicitly borrow Ponlai's reproducibility methodology, not its island-specific code or renderer architecture. Only once PR B is measured and accepted should PR C start HDR auto-exposure.
