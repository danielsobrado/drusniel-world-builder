# Ponlai integration — PR A: rendering foundation, version contract, configuration ownership and provenance

**Status:** implementation specification; not yet implemented  
**Date:** 2026-11-20  
**Target:** `main` of [Drusniel World Builder](https://github.com/danielsobrado/drusniel-world-builder)  
**Baseline inspected:** `e908deca926f14830755a2d17f92bc76915d0e3d` (2026-11-20)  
**Upstream reference:** [HuberyLL/ponlai](https://github.com/HuberyLL/ponlai) at `cca905649fe657458697a9e1b179113c97ce5e6e` (2026-11-17)  
**Programme:** PR A of twelve proposed incremental PRs (A–L), eight broad phases  
**Dependency:** none  
**Successor:** PR B — deterministic visual-capture metadata and profiling improvements  
**Risk:** low if this remains a foundation-only PR  
**Implementation policy:** main only; read current head before editing; never overwrite unrelated new commits; no GitHub Actions

> This is a specification for the **first implementation PR**, not a claim that the specified changes have already been made. File paths and code ownership below were checked against the baseline commit. Recheck them on current `main` when executing the PR.

## 1. Decision and exact outcome

PR A must make subsequent Ponlai-derived rendering changes safe, reviewable, attributable and reversible **without changing the image**. It creates the version and configuration contract, records provenance and the existing baseline, and identifies trustworthy tests. It must **not** add a new renderer, a second frame graph, a second GPU profiler or dormant shader modules.

The first accepted code PR must leave the user-facing world visually and functionally unchanged. It must clarify how later effects are turned on, how they consume current post-processing and environment ownership, and how their sources are licensed.

### Exit deliverables

1. **Version truth:** remove the incorrect description that Three.js is pinned to r186.1 when manifests specify `^0.187.0`; verify the resolved version from the lockfile without modifying dependencies just for the sake of matching Ponlai.
2. **A single written configuration ownership contract:** specify where new post-processing, environmental, ocean and QA settings belong; reuse present YAML files and resolvers; document defaults, precedence, validation and mobile policy.
3. **A provenance ledger/template:** record Ponlai's pinned commit, source files, original copyright/license, third-party caveats and adaptation mode for subsequent implementation PRs.
4. **An audited QA inventory:** map the existing local commands, deterministic fixtures, GPU timing limitations, diagnostic metadata and minimum baseline evidence required by PR B onward.
5. **Tests against silent configuration drift:** extend the existing resolver tests where useful, and add a minimal version/documentation consistency check only if it adds actual value. No new test runner or library.
6. **A PR handoff:** documented file touch list, validation output, known limitations, and explicit scope boundaries for PR B.

This is deliberately smaller than the generic research proposal for PR A. The research suggested introducing a config file and GPU profiler, but **both already exist** in today's project. Duplicating them would violate KISS/YAGNI and would complicate future ownership.

## 2. Verified baseline: what already exists

| Concern | Actual current owner | Verified fact | PR A decision |
| --- | --- | --- | --- |
| Application and dependency versions | `package.json`, `package-lock.json`, `README.md` | Manifests declare `three: ^0.187.0`; README still says “pinned to r186.1” | Correct documentation, do **not** blindly downgrade or repin |
| Bundler / Three integration | `vite.config.js` | Uses Vite, `three` deduplication and alias to `three/webgpu` | Preserve alias and existing import conventions |
| YAML compilation | `scripts/compiled-yaml-plugin.mjs` | Compiles `*.yaml?compiled` into module data through `js-yaml` | Reuse; do not add a second YAML loader |
| Rendering enhancement configuration | `config/render-enhancements.yaml` | Existing live flags: water reflections, cascades, crown shadows, anisotropy and others | Extend only when a feature is actually implemented |
| Rendering enhancement resolution | `src/config/RenderEnhancements.js` | Defaults, validation, URL overrides and mobile restrictions already exist | Retain existing keys/behaviour; document schema expansion conventions |
| Main config assembly | `src/config/loadEditorConfig.js` | Reads compiled enhancements, runs `resolveRenderEnhancements` and assigns `config.stylizedSurface.enhancements` | Do not create a competing config tree/loader |
| Post-processing authoring | `editor.config.yaml` under `stylizedSurface.postProcessing` | Already controls post-processing settings | Post-only features belong with this owner |
| Post-processing normalization | `src/render/postprocessing/PostProcessingSettings.js` | Normalizes settings, presets, ranges and diagnostic options | Later exposure/local-tone PRs extend this existing normalization |
| Scene rendering graph | `src/render/postprocessing/PostProcessingGraph.js` | Existing WebGPU/TSL MRT and TAA/TAAU, SSR, shafts, DOF, bloom and tonemap | Keep existing graph |
| Graph lifecycle | `src/render/postprocessing/PostProcessingController.js` | Owns graph lifecycle, history, fallback and output ownership | Keep current failure path |
| Post diagnostics | `src/render/postprocessing/PostProcessingDiagnostics.js` | Already records graph/reset state and optional GPU timings | Extend, do not replace |
| Performance profiler | `src/editor/performance/qa/GpuPassProfiler.js` | Sampled asynchronous WebGPU timestamp queries with CPU-safe fallback | No new `GpuFrameProfiler` in PR A/B |
| Movement QA driver | `src/editor/performance/qa/PerfQaHarness.js` | Owns route/settle/profiling/report lifecycle | Reuse for regressions |
| Browser QA entry point | `scripts/run-perf-qa.mjs` | Already accepts `--gpuTimings 1`, `--headed`, `--settle`, screenshots and JSON path | Do not introduce parallel CLI conventions |
| QA documentation | `docs/perf-qa.md`, `docs/rendering/post-processing.md` | Detailed hardware, streaming and post-order contracts | Update rather than repeat entire manuals |
| Renderer origin/world contracts | `editor.config.yaml`, `README.md` | 64-unit world chunks and floating-origin threshold of 4096 by default | Preserve canonical-coordinate semantics |
| Third-party acknowledgements | `THIRD_PARTY_NOTICES.md` | Repository already preserves third-party notices and license copies | Append accurate notices only when code/assets are adopted |
| Resolver tests | `test/render-enhancements.test.js` | Covers high-quality query, mobile shadow fallback and invalid reflection resolution | Extend tests in-place when a new option is introduced |
| Project rules | `AGENTS.md` | Commit to main; follow movement/performance QA for rendering work | Follow without branch/Actions work |

### 2.1 Critical correction: Three.js version

`README.md` currently states:

> Three.js is pinned to r186.1.

However `package.json` and the root package metadata in `package-lock.json` declare `"three": "^0.187.0"`. Ponlai declares `"three": "0.186.1"`. These facts **do not imply** that the project should be moved backwards to Ponlai's version.

The implementation should:

1. Read `package.json`, `package-lock.json` and the installed `node_modules/three/package.json` (if installed).
2. Record both the **manifest range** and the **resolved lockfile package version**.
3. Update only statements that describe **current** dependency state. Preserve historical r185/r186 workaround notes as dated historical notes where still relevant.
4. Run the existing post-processing and shader-build checks against the resolved Drusniel version.
5. Explain that Ponlai's r186.1 TSL/WebGPU examples are **algorithmic references**; every adapted node/API must compile on the version installed by Drusniel at implementation time.
6. Avoid changing dependency ranges or the lockfile in PR A unless current tests demonstrate a real compatibility defect. If a bump/rollback is required, justify it with a small isolated compatibility matrix.

**Proposed README wording:**

```markdown
Rendering uses Three.js WebGPU/TSL. The current dependency range is defined by
`package.json` and the resolved version by `package-lock.json`; consult those
files rather than assuming a fixed renderer revision.
```

For documentation that needs a version in a dated compatibility test, record the actual resolved semver and the test date. Do not claim “pinned” for a caret range.

### 2.2 Critical correction: GPU profiling already exists

`GpuPassProfiler` already samples render-pass timestamps asynchronously approximately every eight sampled frames by default. It reports aggregate render passes and explicitly states that its scope excludes CPU submission, uploads and compute work. `PostProcessingDiagnostics` has a different aggregate-timestamp scope and does not provide reliable independent timings for every TSL node. Neither should be misrepresented as a full-frame comprehensive GPU profiler.

**PR A:** document their limits, owners and report formats.  
**PR B:** enhance existing instrumentation and metadata if measurements show a gap.  
**Do not:** wrap the WebGPU backend again with an independently owned profiler or claim render-pass totals equal total GPU frame time.

### 2.3 Critical correction: render-enhancements YAML already exists

The checked config contains:

```yaml
detailVisibility: false
detailTurnMarginDegrees: 12
surfaceAnisotropy:
  enabled: true
  level: 16
waterReflections:
  enabled: true
  planar: true
  resolution: 256
  intervalMs: 500
  reachMeters: 96
shadowCascades: 1
crownShadows: true
snowRelief: true
roadsideLanterns: false
```

Those existing flags are **not all default-off**. PR A must not reset them or alter their visual quality as a side effect of preparing new optional techniques. The current `RenderEnhancements.js` fallback for `crownShadows` is false even though YAML enables it: distinguish **fallback defaults** from **effective shipped configuration**.

## 3. PR A scope and non-goals

### In scope

- Correct version and renderer compatibility statements in present-facing documents.
- Record the **existing** configuration paths and their authoritative owners.
- Define precise future option/validation conventions without introducing unused implementations.
- Define provenance/notice and asset-audit requirements, pinned to a real upstream commit.
- Add/update a concise baseline register and a documented acceptance recipe for the next PR.
- Add focused tests only where they prevent an identified current regression, especially default preservation and mobile override behavior.
- Record how to check rendering quality and version-specific API assumptions.

### Explicitly out of scope

- Adaptive HDR histogram metering, exposure adaptation or Purkinje colour shifts (PR C/D).
- Local tone mapping, bilateral grids or tone-curve changes (PR D).
- Atmosphere LUTs or new sky/environment controls (PR E).
- Chunk SH probes, ground bounce, cloud volumes, FFT ocean, dynamic resolution and clustered lights (PR F–L).
- A second renderer, frame graph, temporal AA implementation, UI settings system, YAML parser or profiling framework.
- Changing the current water/coast, sunlight/weather, shadows, vegetation, physics, gameplay or chunk-streaming visuals.
- Running GPU benchmarks in environments that lack a hardware WebGPU adapter and reporting the result as equivalent.
- Adding GitHub Actions, a new CI platform, a new dependency, a feature branch or a worktree.
- Bulk rewriting old documentation merely because historical files mention r186.

The target patch should be small, audit-friendly and reversible. A large refactor is a failed PR A even if all tests pass.

## 4. Exact configuration ownership contract

There are **three existing kinds of settings**. The contract is to use their actual owners rather than flattening all future features into one new `render_enhancements` object.

| Setting kind | Write location | Read/normalization owner | Examples |
| --- | --- | --- | --- |
| Artist/scene-facing post processing | `editor.config.yaml` → `stylizedSurface.postProcessing` | `src/render/postprocessing/PostProcessingSettings.js`, existing scene settings | tone mapping, exposure, bloom, TAA, eventually auto exposure/local tone |
| Environment/world optional rendering switches | `config/render-enhancements.yaml` | `src/config/RenderEnhancements.js` via `loadEditorConfig.js` | reflections, cascades, crown shadows; later optional atmosphere/FFT/probe feature availability where appropriate |
| QA-only controls and capture metadata | CLI arguments, QA fixture configuration or QA runner-owned test data | existing `scripts/run-*-qa.mjs` and `src/editor/performance/qa/*` | `--gpuTimings`, fixed camera, capture output, warm-up, settle, adapter recording |

Do **not** add the same `adaptiveExposure.enabled` flag to both scene post-processing settings and render-enhancements YAML. Future PR C must pick one owner (the post-processing settings) and keep the world enhancements file reserved for non-post features or truly global availability gates.

### 4.1 Schema rules for future PRs

1. Keep current root YAML keys backward compatible.
2. For a new optional feature, add only the keys actually consumed by that PR; all newly introduced expensive rendering features start disabled on existing saves/configs until acceptance proves otherwise.
3. Make the normalizer/resolver own defaults and validation. Do not scatter magic fallbacks through draw code.
4. Preserve `undefined`/omitted-key behavior, especially for old saved settings. Never let a missing key enable a new expensive shader.
5. Validate booleans strictly; validate finite numeric ranges, integer counts, known enums and required cross-field relationships.
6. Return normalized independent nested objects. Avoid shared mutable references to frozen defaults and avoid mutation leaks between calls.
7. Define a single URL-override precedence: compiled YAML → resolved defaults → existing known URL overrides → mobile/compatibility overrides. Keep any special UI/settings precedence explicit in the settings owner.
8. Avoid new query parameters until a working feature needs an A/B toggle. Never silently let unknown URL keys enable effects.
9. A mobile cap must be applied after desktop quality selection; explicit high presets must not bypass WebGPU/device restrictions.
10. A disabled feature must neither allocate GPU resources nor change the render graph topology or shader permutation.
11. A failed optional feature must log capability/failure once, and use the previous rendering path. No per-frame exception spam.
12. Settings exposed to the UI must use existing scene-settings persistence and normalization, not a second store.

### 4.2 Proposed shape, **future only**

The following example is **not** to be merged into PR A as unused config. PR C should introduce it within the existing `stylizedSurface.postProcessing` config and its normalizer when the histogram actually works:

```yaml
stylizedSurface:
  postProcessing:
    toneMapping:
      enabled: true
      mode: agx
      exposure: 1.0
    adaptiveExposure:
      enabled: false
      histogramBins: 128
      lowPercentile: 0.10
      highPercentile: 0.90
      minEv: -8
      maxEv: 16
      brightenSpeedEvPerSecond: 2.0
      darkenSpeedEvPerSecond: 1.0
```

All values are *initial proposals*, not current renderer measurements or a statement that this block already exists. Existing tone-mapping keys/presets must be merged correctly. Large GPU controls (such as histogram bucket count) should be fixed implementation constants unless they genuinely require user tuning.

A later optional global technique might add a namespaced key to `config/render-enhancements.yaml`, for example `atmosphere.enabled: false`, but this belongs to PR E, not PR A.

### 4.3 Specific validation regression tests to add or verify

Prefer adding to `test/render-enhancements.test.js` instead of creating another generic test suite:

- Omitted YAML fields resolve to the documented defaults.
- Existing YAML fields remain unchanged after resolver invocation.
- Two resolver calls do not share mutable nested state.
- `?enhancements=high` preserves the existing expected overrides.
- Mobile override restricts shadows/reflections regardless of the high preset.
- Existing invalid reflection resolution, invalid cascades and wrong boolean types fail predictably.
- New feature keys (in the PR that adds them) are rejected for wrong type/out-of-range numbers.
- Unknown new configuration keys are not accidentally read by render code. If stricter unknown-key behavior is introduced, enumerate legacy keys first and do not break existing installations.

Do not add tests that merely duplicate existing assertions; improve test coverage for a concrete omission identified during implementation.

## 5. License, provenance and assets: mandatory audit

### 5.1 Upstream truth

- Upstream repo: [HuberyLL/ponlai](https://github.com/HuberyLL/ponlai).
- Pinned research commit: [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e).
- Root [`LICENSE`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/LICENSE): MIT, **Copyright (c) 2026 Hubery**.
- Ponlai also maintains `LICENSES/`, `CREDITS.md`, `REUSE.toml` and an asset manifest/lock. Third-party asset licenses are not automatically MIT.
- Drusniel's existing destination for copied-source notices is `THIRD_PARTY_NOTICES.md`.

**In PR A we are not copying any Ponlai source or asset.** Do not falsely claim that copied code was introduced or append an unnecessary MIT block solely because we consulted a reference repository.

### 5.2 Register format

Add a small source-provenance register (suggested: `docs/research/ponlai-integration-provenance.md`) with the pinned upstream version and this table structure:

| Field | Required value |
| --- | --- |
| Component ID | Stable slug such as `histogram-metering` |
| Adopted in | Local commit/PR ID, once implemented |
| Upstream | `HuberyLL/ponlai` |
| Upstream commit | Full immutable SHA |
| Upstream source paths | Exact file paths and commit-pinned links |
| Local destination paths | Exact adapted files |
| Adaptation | `direct-copy`, `translated-adaptation`, `algorithm-reference`, or `independent-implementation` |
| Copyright / SPDX | Verified per-file notices; do not assume root license applies to all content |
| Required notice | Full license text or link to retained local license copy, as appropriate |
| Dependencies/assets | Separate license, source, SHA, authors and use restrictions |
| Changes | Precise delta from upstream: API, numeric precision, coordinate space, resource ownership |
| QA evidence | Tests and accepted visual/performance capture IDs |
| Reviewer/date | Responsible reviewer and acceptance date |

Only register components as **implemented** when they actually land. PR A can include “candidate only” rows clearly marked **not adopted**.

### 5.3 Research candidate inventory

| Candidate | Ponlai source path | Planned Drusniel PR | Copying status in PR A |
| --- | --- | --- | --- |
| HDR histogram and exposure | `packages/render/post/Metering.ts`, `Exposure.ts` | C | None |
| Local tone | `packages/render/post/LocalTone.ts` | D | None |
| Night/Purkinje | Locate exact current source before implementation | D | None |
| Physically based atmosphere | `packages/render/sky/Atmosphere.ts` | E | None |
| Ambient SH volume/relight | `packages/render/lighting/AmbientVolume.ts`, `AmbientRelight.ts` | F | None |
| Ground bounce | `packages/render/lighting/GroundBounce.ts` | G | None |
| Volumetric clouds | `packages/render/sky/Clouds.ts` | H | None |
| Offshore spectrum | `packages/render/ocean/OceanFFT.ts`, `OceanSpectrum.ts` | I | None |
| Dynamic resolution | `packages/render/post/DynamicResolution.ts` | J | None |
| Clustered light culling | Verify source path and license before work | L, conditional | None |

Every later coding PR must open its exact pinned upstream files, check file headers and transitive material dependencies, then select **copy/port vs independent implementation** explicitly. Physics/paper concepts alone are not equivalent to copying copyrighted implementation code.

### 5.4 Notice/asset rules

- For substantial copied or closely translated MIT code, retain applicable copyright and full MIT terms in the repository's third-party notices/license-copy convention.
- Preserve per-file SPDX headers where present and required.
- For original reimplementations based only on a published algorithm, cite the paper and upstream inspiration; do not invent copied-code provenance.
- Never import Ponlai's demonstration textures, HDRIs, sky maps, logos, fonts, models, downloaded asset bundles or proprietary third-party dependencies unless individually reviewed.
- Where an algorithm requires a texture, prioritize Drusniel's existing CC0 noise sources and document asset handling separately.
- Never infer that a `CREDITS.md` mention alone grants redistribution rights.
- Audit both redistributed build artefacts and source use if third-party content is introduced.

## 6. Exact PR A file touch plan

The **actual PR A implementation** should normally touch only the files below. If a file has changed on current main, follow its new owner and update this list before writing.

| Path | Intended change | Must not change |
| --- | --- | --- |
| `README.md` | Correct outdated Three.js “pinned r186.1” claim; point to current dependency/lock | Do not rewrite world/project introduction |
| `docs/rendering/post-processing.md` | Add a short, dated API-version note distinguishing historical r185/r186 workarounds from the current installed Three.js version | Do not delete still-used workarounds |
| `docs/research/ponlai-integration-provenance.md` (new) | Upstream pinned SHA, licensing rules, candidate registry and future-entry template | No false “already imported” claims |
| `docs/plans/ponlai-pr-a-render-foundation-2026-11-20.md` | This plan remains the authoritative PR A checklist | Do not turn it into a general all-phases proposal |
| `test/render-enhancements.test.js` (optional) | Only missing invariants for existing normalization/default/mobile paths | Do not add artificial placeholder options |
| `docs/perf-qa.md` (optional) | Add succinct pointer to profiler scope / baseline contract if missing | Do not reproduce the whole QA guide |
| `THIRD_PARTY_NOTICES.md` | **No change required for PR A** unless implementation unexpectedly copies code (which should be split out) | Do not add speculative legal notices |
| `config/render-enhancements.yaml` | **No new feature flag required yet**; optional doc-only clarification | Do not alter existing enabled visual features |
| `src/config/RenderEnhancements.js` | **No new feature logic required yet**; touch only for a demonstrated validation defect | Do not introduce unused schema |

This conservative touch list is intentional: PR A prepares a safe contract while PR B brings diagnostic functionality. A documentation-heavy PR A is more useful than a “framework” with no consumer.

## 7. Implementation procedure, step by step

### Step 0 — synchronize and inspect current head

Use the shared `main` checkout according to `AGENTS.md`. Record:

```bash
git status --short
git branch --show-current
git pull --ff-only
git rev-parse HEAD
git log -8 --oneline
```

If someone else has uncommitted work in this shared checkout, do **not** reset, stash, overwrite or stage their files. Stop the conflicting operation and work only on non-conflicting paths. This instruction is about safe collaboration, not permission to discard changes.

### Step 1 — document version evidence

```bash
node -p "require('./package.json').dependencies.three"
node -p "require('./package-lock.json').packages['node_modules/three']?.version"
node -p "require('./node_modules/three/package.json').version"
```

The third command requires dependencies installed. The lockfile entry and actual runtime may differ if dependencies are stale; use `npm ci` before authoritative testing. If there is no installed node_modules directory, do not guess the installed version.

Document the exact installed/locked version and compatibility baseline. Then adjust the current-version sentence in README. Avoid touching historical screenshots/QA reports that accurately describe an older build.

### Step 2 — audit configuration resolution

Trace:

```text
config/render-enhancements.yaml
     |
     v
scripts/compiled-yaml-plugin.mjs
     |
     v
src/config/loadEditorConfig.js
     |
     v
src/config/RenderEnhancements.js
     |
     v
config.stylizedSurface.enhancements
     |
     v
existing rendering feature consumers
```

Separately trace scene post:

```text
editor.config.yaml > stylizedSurface.postProcessing
     |
     v
src/render/postprocessing/PostProcessingSettings.js
     |
     v
existing scene settings/runtime and PostProcessingController
     |
     v
PostProcessingGraph
```

Read current scene-settings handoff/persistence before deciding where a future post-processing option is applied. Verify whether look overrides, preset resolution and saved-scene state affect effective values; record the precedence from code, not guesses.

Create a brief ownership table in the provenance/architecture document if needed. Do not add a second root config document or another parser.

### Step 3 — audit diagnostics and provenance

Read `GpuPassProfiler.js`, `PostProcessingDiagnostics.js`, `PerfQaHarness.js` and `docs/perf-qa.md`. Record which measurements are real GPU timings, aggregate placeholders, CPU timings, per-pass render timestamps or “unavailable”.

Pin Ponlai's commit and inspect root `LICENSE`, `LICENSES/`, `CREDITS.md`, `REUSE.toml` and source headers. Confirm the MIT holder spelling. Write the register template and explicitly mark all candidates **not adopted**.

### Step 4 — implement only justified checks/documentation

Correct version statements. Add missing resolver invariants if a concrete failing case is found. No unused flags, GPU buffers, shader passes or alternative framework.

Do not touch the dependency tree merely to align with upstream. If version-compatible TSL imports can be compiled, that is sufficient for PR A.

### Step 5 — validate and record evidence

Run the fast code checks:

```bash
npm ci
node --test test/render-enhancements.test.js
npm run qa:postprocessing
npm test
npm run build
```

On a machine where the full project prerequisites are available, also run `npm run lint` and `npm run verify`. The latter may require generated/prepared assets; record any such environmental blocker instead of calling it a source regression. The exact `qa:postprocessing` script is checked above; do not assume it tests a real WebGPU device.

For hardware smoke/baseline, start `npm run dev` in one process and run the established Playwright QA in another:

```bash
npm run qa:postprocessing:browser
npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 12 \
  --settle --gpuTimings 1 --drain-seconds 15 \
  --out tmp/ponlai-pr-a/chunk-cross.json \
  --screenshot tmp/ponlai-pr-a/chunk-cross.png
npm run qa:perf -- --headed --qa settlement-approach --warmup 8 --duration 12 \
  --settle --gpuTimings 1 --drain-seconds 15 \
  --out tmp/ponlai-pr-a/settlement-approach.json
```

The `--headed` route is intended for a real GPU-backed WebGPU browser. On the documented WSL2/Windows environment, use the existing `qa:perf:windows` wrapper when Linux Chromium cannot obtain a native adapter. Do not silently accept SwiftShader/WebGL/fallback adapter as authoritative GPU evidence. The runner's available scenario flag and asset prerequisites must be verified against the current code.

Save reports and screenshots under `tmp/ponlai-pr-a/` while working. Commit only the evidence that the project's existing evidence policy requires; do not add huge binary artifacts to the main repository by default.

### Step 6 — review and commit safely

```bash
git diff --check
git diff --stat
git status --short
git diff -- README.md docs/rendering/post-processing.md \
  docs/research/ponlai-integration-provenance.md \
  test/render-enhancements.test.js
```

Check for accidental changes in worlds, shaders, assets, generated manifests, configuration values, lockfiles, visual snapshots and unrelated files. Stage only PR A files and commit directly to `main`, following `AGENTS.md`. Never use `git add -A` indiscriminately in a shared checkout.

Suggested eventual commit subject:

```text
docs(render): establish Ponlai integration foundation and provenance
```

If there are extra test changes, include them in the same focused commit only if they check the contract; otherwise separate the change.

## 8. Baseline capture matrix for the programme

PR A does not need to manufacture ten new images, but it must identify a coherent baseline coverage set for PR B and later stages. These are scenario targets, **not claims that named fixtures already exist**.

| ID | Scene/look target | Risk exercised | First required by |
| --- | --- | --- | --- |
| `day-terrain` | Open biome in clear midday | global exposure, sky/terrain parity | B/C |
| `snow-shadow` | White snow against dark shade | highlight rolloff, adaptive exposure | B/C/D |
| `forest-interior` | Shaded trees against bright sky | local tone halos, undercanopy visibility | B/C/D/F |
| `sunset-horizon` | Sun low over distant terrain | scattering, aerial perspective | B/E |
| `moonlit-settlement` | Lanterns and dark street | night adaptation, bloom, clustered lights | B/C/D/L |
| `ocean-offshore` | Deep water far from coast | FFT swell and repeating spectra | B/I |
| `coastal-transition` | Breakers, swash, rocks | no double surf, water blend | B/I |
| `weather-cloud` | Overcast/storm view | cloud shadow, radiometric consistency | B/E/H |
| `origin-rebase` | Matched canonical view across origin snap | coordinate invariance, histories | B/E/F/H/I/J |
| `dense-settlement` | Representative lit buildings | local-light cost, overflow evidence | B/L |

For each capture, record as available: application SHA; Three.js resolved version; world seed/map; canonical camera coordinates and yaw/pitch; origin offset; sun/time; weather; relevant effective settings; viewport/DPR; GPU adapter; backend; whether fallback adapter was used; assets/chunks settled; warm-up/temporal state; screenshot path and SHA-256; frame timing; GPU timing scope and support; browser errors. Distinguish measured/known, not available, and pending fields. **Never fill missing metadata with fabricated defaults.**

PR B should extend current QA reports with missing fields before writing new exporters. Cross-device exact-pixel equality is not a sensible requirement; establish same-hardware repeatability first, then choose perceptual comparison metrics later.

## 9. Performance and reliability gates

### 9.1 PR A must be render-path neutral

Because PR A should not compile new shaders or allocate new GPU resources:

- Screenshot appearance should be identical for the same built sources and state, subject to normal QA nondeterminism.
- Render graph topology and render target inventory should not change.
- No new GPU memory allocations, compute dispatches or workgroups are expected.
- Startup, runtime or shader compilation performance must not regress because of new “foundation” infrastructure.
- The enabled/default feature set must not change across desktop/mobile or high/low presets.
- No change to canonical world data, chunk residency or floating-origin rules is permitted.

### 9.2 Do not misreport GPU data

`GpuPassProfiler`'s report scope is sampled **render passes**, not all GPU costs. Excluded work can include compute and uploads. A frame with smaller reported render-pass totals can still be slower. Record:

```text
gpuRender.supported
gpuRender.source
gpuRender.total / gpuRender.passes
gpuRender.sampleEvery
CPU frame p50/p95/p99
measured viewport and DPR
renderer backend, adapter and focus state
settlement readiness and browser errors
```

Use exact field names from the current generated report when storing evidence; the names above are conceptual until checked against `buildPerfReport.js`. The existing `PostProcessingDiagnostics` timing placeholders must not be described as real per-effect measurements when null.

### 9.3 Baseline acceptance rules

- Tests pass, build passes and no new console/shader compile errors.
- Browser QA on real WebGPU passes where available.
- Deterministic capture and perf report use the same build/snapshot.
- Settling is complete before measurement; otherwise report as **rejected** rather than “pass”.
- One unexpected crash or silent software-adapter fallback fails the hardware gate.
- Small frame-time differences in A-only documentation changes are measurement noise unless a reproducible code change explains them.
- Preserve any current project's stricter existing pass/fail thresholds from `docs/perf-qa.md`. Do not loosen them in this PR.
- If no hardware GPU is available, mark the hardware acceptance **pending**, not passed. Documentation/specification can be committed with explicit caveat, but no claim of rendering validation.

## 10. Failure modes and rollback

| Failure | Prevention | Response / rollback |
| --- | --- | --- |
| README wrongly claims a fixed Three.js release | Read manifest and installed lock | Correct only present-tense wording |
| Unnecessary Three.js downgrade breaks TSL | Do not change version for upstream parity | Revert dependency change; isolate compatibility work |
| YAML duplicate settings produce ambiguous precedence | Keep existing post and enhancements owners | Remove duplicate keys; test effective settings |
| Default-off plan accidentally disables current reflections/shadows | Preserve effective shipped YAML and resolver behavior | Revert config delta immediately |
| Mobile high preset bypasses caps | Keep mobile cap as final resolver step | Test high + mobile combination |
| “New profiler” monkeypatches backend alongside existing one | Reuse `GpuPassProfiler` | Remove duplicate and retain current QA owner |
| A historical r185 workaround is deleted as “old” | Treat docs/workarounds as code contracts until retested | Restore and test DPR/refraction path |
| Unlicensed asset slips in with Ponlai snippets | No assets in PR A; audit file by file later | Remove asset and its build outputs |
| Pinning only upstream `main` makes attribution irreproducible | Record full immutable SHA | Correct the provenance register |
| Rebased world visuals show different results | Do not change origin in PR A; preserve invariant | Revert unintended render changes |
| GPU QA silently uses software renderer | Validate adapter/backend from report | Reject run; rerun native headed path |
| Shared checkout overwrites newer changes | Re-read main and stage only intended paths | Do not force push/reset; reconcile before commit |

Rollback for PR A should be a clean revert of its bounded documentation/tests. No runtime flag is needed because no new rendering functionality is intended.

## 11. Review checklist / definition of done

### Baseline and version
- [ ] Current `main` SHA and date recorded in implementation evidence.
- [ ] Latest relevant commits reviewed; no older snapshot used to overwrite new work.
- [ ] Manifest Three.js range verified.
- [ ] Lockfile installed/resolved Three.js version verified or explicitly unavailable.
- [ ] README current-version claim corrected without mislabeling a caret range as pinned.
- [ ] Historical compatibility workarounds retained unless proved obsolete by QA.

### Architecture and configuration
- [ ] Existing render enhancements YAML/resolver mapped and preserved.
- [ ] Existing post-processing YAML/settings owner mapped and preserved.
- [ ] QA-only settings separated from scene/game configuration.
- [ ] Feature flag policy specifies off-by-default, strict validation and runtime-failure fallback.
- [ ] No unused options, new parser, duplicated scene store or unnecessary implementation scaffolding.
- [ ] No new image-affecting shader, pass, texture or lighting code.

### Provenance and legal
- [ ] Upstream Ponlai repository and full commit SHA pinned.
- [ ] MIT copyright holder verified, including license text.
- [ ] LICENSES/CREDITS/REUSE/asset restrictions noted.
- [ ] Copy vs algorithm reference distinction documented.
- [ ] Existing `THIRD_PARTY_NOTICES.md` convention respected.
- [ ] No unreviewed third-party assets copied.
- [ ] Candidate rows accurately state “not yet adopted”.

### Validation and handoff
- [ ] Existing renderer-enhancement tests pass.
- [ ] Existing post-processing QA passes or blockers documented.
- [ ] `npm test` and `npm run build` pass, or precise environment blockers recorded.
- [ ] Hardware WebGPU QA completed if hardware is available; fallback accurately labeled.
- [ ] No unintended file/config/asset/lockfile modifications.
- [ ] Exact test commands and results included in implementation summary.
- [ ] Diff reviewed and focused commit on `main`.
- [ ] PR B inherits concrete known metadata gaps rather than a vague “build profiler” task.

**PR A is rejected** if it introduces a second render graph/profiler/config loader, changes visible rendering, resets effective options, downgrades Three.js only to mirror Ponlai, copies unreviewed assets, or declares unmeasured GPU evidence a pass.

## 12. PR B handoff: what changes next, and only next

PR B will not begin from scratch: it should start with `GpuPassProfiler`, `PerfQaHarness`, `run-perf-qa.mjs`, `PostProcessingDiagnostics`, the post-processing browser QA, visual QA and existing output fixtures. The exact PR B plan should then implement:

1. A fixed, reproducible scenario-state/metadata contract layered on the current QA tools, including canonical camera coordinates and origin offset.
2. Explicit warm-up readiness (streaming, weather/light, history and assets) rather than guessing fixed animation frames are sufficient.
3. Deterministic capture metadata and stable per-scenario screenshot/report output paths.
4. An optional image comparator with tolerant same-hardware metrics, added only after repeated captures quantify nondeterministic variance.
5. GPU pass-scope clarity and improvements only where existing asynchronous query infrastructure can provide legitimate data.
6. A captured baseline matrix with a small set of meaningful scenes; expansion beyond that is driven by PR C–L requirements.

**B must not implement histogram exposure.** That begins in PR C once capture and timing evidence are reliable.

## 13. Useful immutable references

### Drusniel baseline

- [Root dependency manifest](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/package.json)
- [README](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/README.md)
- [YAML rendering enhancements](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/config/render-enhancements.yaml)
- [RenderEnhancements resolver](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/src/config/RenderEnhancements.js)
- [Configuration assembly](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/src/config/loadEditorConfig.js)
- [Post-processing settings](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/src/render/postprocessing/PostProcessingSettings.js)
- [Post-processing graph](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/src/render/postprocessing/PostProcessingGraph.js)
- [GPU pass profiler](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/src/editor/performance/qa/GpuPassProfiler.js)
- [Perf QA harness](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/src/editor/performance/qa/PerfQaHarness.js)
- [Existing QA guidance](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/docs/perf-qa.md)
- [Existing third-party notices](https://github.com/danielsobrado/drusniel-world-builder/blob/e908deca926f14830755a2d17f92bc76915d0e3d/THIRD_PARTY_NOTICES.md)

### Ponlai pinned source and licensing

- [Ponlai MIT LICENSE](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/LICENSE)
- [Ponlai CREDITS](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/CREDITS.md)
- [Ponlai LICENSES](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e/LICENSES)
- [Metering reference](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Metering.ts)
- [Local tone reference](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/LocalTone.ts)
- [Atmosphere reference](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/Atmosphere.ts)
- [Ambient SH reference](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientVolume.ts)
- [Ocean FFT reference](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/ocean/OceanFFT.ts)
- [Dynamic-resolution reference](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/DynamicResolution.ts)

### Published algorithm references, for later PRs

- [Sébastien Hillaire, A Scalable and Production Ready Sky and Atmosphere Rendering Technique, EGSR 2020](https://sebh.github.io/publications/egsr2020.pdf).
- [Ramamoorthi & Hanrahan, An Efficient Representation for Irradiance Environment Maps, SIGGRAPH 2001](https://graphics.stanford.edu/papers/envmap/).
- [Jerry Tessendorf, ocean simulation notes and reports](https://jtessen.people.clemson.edu/reports/index.html).
- [Olsson, Billeter & Assarsson, Clustered Deferred and Forward Shading, HPG 2012](https://diglib.eg.org/items/6342d4d6-5220-4376-a5c6-a153058f4a3c).

---

**Implementation summary:** PR A creates the documented, verified contract for controlled rendering enhancement. No added render work, no duplicate infrastructure, and no changes to the live world. The actual rendering programme begins only after this foundation and PR B's repeatable measurements are accepted.
