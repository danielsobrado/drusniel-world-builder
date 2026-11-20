# Ponlai integration — PR C: GPU HDR histogram metering and camera auto exposure

**Status:** **implementation specification only** — not implemented  
**Date:** 2026-11-20  
**Target:** [Drusniel World Builder](https://github.com/danielsobrado/drusniel-world-builder), directly on `main`  
**Drusniel code baseline inspected:** [`9b04e91f6c21df1771ead919f0313ff7c0b4799e`](https://github.com/danielsobrado/drusniel-world-builder/tree/9b04e91f6c21df1771ead919f0313ff7c0b4799e)  
**Ponlai code baseline inspected:** [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e)  
**Position:** PR C of A–L, Phase 2 of the rendering programme  
**Required evidence:** [PR A](ponlai-pr-a-render-foundation-2026-11-20.md) architecture/provenance and [PR B](ponlai-pr-b-deterministic-render-qa-2026-11-20.md) render regression/profiling  
**Next PR:** D — local tone mapping and optional Purkinje/night perception  
**Project requirements:** KISS, YAGNI, SOLID, separate constants, YAML configuration, production-quality exception/disposal/logging practices, no GitHub Actions, no new renderer, no conflicting edits on `main`

> **Source status and dependency gate.** On the inspected `main`, **PR A and PR B are Markdown specifications, not implemented features**. The implementation agent must check their actual completion and credible hardware baselines before starting C. The source locations and APIs in this document were inspected from GitHub at the pinned commits; they are not a guarantee that newer `main` will have identical code. Re-read current files, the latest commits and `AGENTS.md` before writing.

## 1. Product objective and strict scope

Implement a **small, optional, GPU-driven automatic exposure** that makes the player camera adapt smoothly to changes in visible scene brightness, while retaining:

- Drusniel's authored sky, biome and snow exposure intent.
- Existing `AgX`, `ACES`, `Neutral` and no-tone-map options.
- The **one scene MRT** plus existing AO/shafts/SSR/TAA/TAAU/DOF/bloom/tonemap order.
- Existing bloom thresholds and knee in **exposed HDR units**.
- Existing scene settings, presets, YAML loading and snapshot behavior.
- TAA/SSR history invalidation on teleport, resize, FOV, origin rebase, world load and graph rebuild.
- Base renderer fallback when optional post-processing fails.
- Mobile and lower-quality devices where the feature is **off by default** unless measured safe.

The result should look like a restrained camera, **not a brightness equalizer**. A dark forest may become readable after adaptation, but should remain a shaded forest. A moonlit village must remain visibly nighttime. A snowfield should not collapse to generic grey. A bright beach should retain apparent daylight.

**Default shipped behavior must be pixel-equivalent to current `main`:** auto exposure stays disabled on all existing settings/presets unless the user explicitly turns it on. No added compute, attachments, readback, render targets, events, buffer work or new shader permutations when disabled.

**PR C owns:** histogram metering, target exposure, temporal adaptation, sampling/compute scheduling, single-point integration into the existing post pipeline, configuration and UI controls, diagnostics, fallback and QA.

**PR C does not own:** bilateral/local tone (PR D); Purkinje/night colour shifts (PR D); physically based sky/atmosphere (PR E); illumination SH (F/G); clouds (H); FFT ocean (I); dynamic resolution controller (J); clustered lights (L). **Do not add Ponlai-style per-material irradiance MRT in this PR**; see the explicit tradeoff below.

## 2. Fundamental compatibility finding: Drusniel and Ponlai meter different signals

### 2.1 What Ponlai actually does — source-backed

[P1] `packages/render/post/Metering.ts` implements **two** histograms:

- `H_M`: log2 of `meterLight` illuminance, written by lit materials into a dedicated scene MRT channel, **excluding albedo/specular/emission**.
- `H_Y`: log2 of HDR image luminance, including visible bright areas, after scene composite and **before bloom**.
- A fixed grid of 512×256 sample positions (32×16 workgroup tiles of 16×16).
- 128 bins per histogram over 32 stops (quarter stop each), with integer fixed-point, two-bin tent splatting and atomic accumulation.
- GPU clear; histogram pass; small one-texel exposure-state pass.
- Percentile trimmed mean of `H_M` from 10% to 90%; highlight guard `H_Y` from 90% to 97%.
- Pre-exposure correction and optional sky metering anchor.
- One RGBA32F exposure state storing current EV, EV velocity, target EV and movement flag.

[P2] `packages/render/post/Exposure.ts` computes an illumination-based exposure target, a soft highlight guard and sky-aware bounds, then integrates a critically damped EV filter. [P3] `packages/render/post/PreExposure.ts` rescales **all** contributing HDR half-float writers to keep day/night radiance representable; [P4] `packages/render/lighting/MeterLight.ts` accumulates incident light in each material's lighting model. [P5] `packages/render/post/PipelinePasses.ts` and [P6] `Pipeline.ts` rely on Ponlai's **explicit custom FrameGraph** to order the passes and make their reads/writes legal.

**This is a sophisticated, interdependent system. Metering.ts is not a drop-in shader.** Its histogram algorithm is reusable; its irradiance signal, material MRT hooks, sky shares, pre-exposure scheme and frame-graph scheduler are not present as-is in Drusniel.

### 2.2 What Drusniel actually has — source-backed

[D1] `PostProcessingGraph` renders **one** HDR scene MRT with:

- `output` (RGBA16F / HDR linear);
- `normal` (RGBA8);
- `velocity` (RG16F);
- `material` (RGBA8, roughness/reactive/reflection-class/bloom-boost);
- depth attachment, accessed via `scenePass.getTextureNode('depth')`.

Then it builds AO → shafts → SSR → TAA/TAAU → DOF; bloom reads the resolved pre-DOF source; [D2] `ToneMappingNode` applies scalar exposure and colour grade, then the selected curve. **No `meterLight` MRT or physically based illumination measurement is currently exposed.**

[D3] `BloomNode` already prefilters its HDR source **after multiplying by exposure**; its pyramid carries exposed bloom values. [D2] adds that bloom without multiplying it by exposure twice. Any auto exposure must drive **both** consumers with the same factor in the same rendered frame.

[D4] `sceneExposure.js` carries a global authored `scale` from the biome/sky look. [D5] `StylizedSkyView.applyLook` writes this value, applies a compensating sky factor, and writes the base renderer's `toneMappingExposure` when the base renderer owns output. The post graph uses `scaledToneMapping(settings.toneMapping)` every frame.

[D6] `PostProcessingController` owns output path, topology, resources, precompile, temporal invalidation, failure and fallback. [D7] `PostProcessingHistory` owns TAA/SSR histories. [D8] `PostProcessingSettings` and [D9] `PostProcessingPresets` own settings normalization and persistence-facing config. [D10] `PostProcessingSettingsPanel` owns controls.

**Crucial prohibition:** [P4] achieves `meterLight` by merging `material.mrtNode`. [D11] explicitly warns not to attach per-material MRT overrides in Drusniel because they compiled incorrectly through non-MRT paths. PR C must **not** copy Ponlai's `writeMeter`, alter every material, or put a fifth MRT attachment into the existing scene pass without a separately justified architecture change and a dedicated cross-material shader QA.

### 2.3 Chosen implementation — honest description

**Use a two-distribution screen-space luminance approximation** from Drusniel's existing HDR colour/depth:

1. **Foreground luminance histogram** over visible non-sky pixels; a robust trimmed mean drives the main camera exposure.
2. **Full-frame luminance/highlight histogram**; bright percentiles restrain the camera from blowing out sun glints, white stone, snow or bright sky.
3. **Authored scene-look anchor and bounds** keep the look's intentional day/night/snow grading from being automatically cancelled.

This is **not** the same as Ponlai's albedo-independent irradiance meter. A black wall and a white wall under identical light can still affect the foreground luminance meter differently. This limitation is acceptable as a **PR C starting point only if QA proves the authored appearance remains stable**. If the results show objectionable albedo-dependent pumping, the correct response is to stop/roll back or request a separately scoped metering-attachment change, not silently copy Ponlai's material system.

Do not claim the implementation provides physically correct auto-exposure or night adaptation. It provides restrained, observable exposure compensation from image brightness, with a separate future upgrade path.

## 3. Exact code cross-reference: existing vs upstream

| Concern | Drusniel integration target | Ponlai reference | Decision |
| --- | --- | --- | --- |
| HDR acquisition | [D1] `PostProcessingGraph` `scenePass.getTextureNode('output')`, `postShaftOutput`, `preTaaOutput`, `resolvedOutput` | [P1] Metering constructor / `histogramPass` | Meter from existing **linear pre-bloom HDR**, no additional world render |
| Scene/sky selection | [D1] `scenePass.getTextureNode('depth')`; [D12] `PostProcessingFrameState` | [P1] `surfaceDepth` sky marker and shares | Build conservative depth-based sky classification; verify actual depth semantics; **do not copy Ponlai's -9e4 sentinel** |
| GPU histogram | [D1] current `three/webgpu` and `three/tsl` aliases; no histogram implementation | [P1] `METER_BINS`, `clearKernel`, `histogramKernel`, `trimmed` | Adapt integer bins/quantiles; verify r187 TSL API and scheduling on current renderer |
| Metering illuminance | [D1] no metering MRT; [D11] warns against per-material MRT | [P4] `meterKey`/`meterAmbient`/`writeMeter` | **Do not port.** Use foreground screen luminance and document albedo risk |
| Exposure target | [D4] `scaledToneMapping` + [D5] authored scene exposure | [P2] `exposureTarget` | Implement **relative EV compensation**, not absolute look replacement; sky/white bounds calibrated on Drusniel |
| Temporal adaptation | [D6] `updateFrame`/`finishFrame`, [D12] `deltaSeconds` | [P2] `exposureAdapt`, critically damped filter | GPU state update with explicit reset/snap, stable dt; no per-frame CPU readback |
| Pre-exposure | [D1] RGBA16F output, no `P` scaling contract | [P3] `preExposureStops`/`preExposure` | **Do not introduce in PR C.** Test overflow/subnormals and constrain range; separate proposal if necessary |
| Tonemap | [D2] `ToneMappingNode`/`toneMappingAdjustmentsReference` | [P6] `exposureRead` | Multiply HDR linear source by effective auto factor **once**, retain AgX/ACES/Neutral |
| Bloom | [D3] `BloomNode` `sampleLowPass13`/`this.exposure` | [P1, P5] histogram before bloom; bloom consumes exposure | Drive bloom prefilter and tonemap with **same factor**; no double bloom exposure |
| Settings and presets | [D8] `normalizePostProcessingSettings`; [D9] `POST_PROCESSING_PRESETS` | [P7] `ExposureLook.ts` sun/weather keys | Add `autoExposure` under existing post settings, default off; no second YAML tree |
| UI | [D10] `SECTIONS` and `createPostProcessingSettingsPanel` | [P7] tune keys (not UI implementation for us) | Add compact Auto Exposure group; defaults safe, no new panel framework |
| Graph identity | [D13] `createPostProcessingTopologySignature` | [P5] pass-resource declarations | Enabled/disabled and compile-time histogram configuration are topology; numeric EV limits are uniforms |
| History & reset | [D6], [D7], [D14] `PostProcessingInvalidation` | [P2] `snap`, [P3] `pending`, [P8] `TemporalRest` | Reset exposure on cuts/world/rebases; avoid reset on benign stream/LOD events |
| Failure path | [D6] `handleFailure` / `restoreRendererOutput` | [P5] frame-graph owned resources | Keep existing fallback; free histogram GPU resources; no per-frame repeated error |
| QA | [D15] post-processing QA; [D16] environment look; [D17] GPU profiler | [P9] Ponlai profiling methodology | Reuse PR B evidence and existing tests; compare A/B/A/B on hardware |
| Three.js version | [D18] package manifest resolves `three ^0.187.0`; [D19] Vite alias | [P1] uses Three.js r186-era TSL | Verify current node builders, barriers and render ordering; **never downgrade merely to copy API** |

## 4. Required architectural design spike: prove GPU scheduling first

**This is the highest-risk task.** Ponlai's [P5] explicit frame graph makes `scene → clear → histogram → meter → bloom → display` ordering obvious. Drusniel's [D1] uses a Three.js `RenderPipeline` with TSL graph dependencies and `rtt` helpers; it does not expose Ponlai's custom `FrameGraph` pass scheduler.

### 4.1 Hard functional invariants

PR C is not accepted until a minimal isolated prototype proves all these facts on the **installed** Three.js version:

1. The existing scene is rendered **once** per frame, not once for metering and once for display.
2. Histogram reads the **current frame's** pre-bloom HDR texture, or an explicitly documented previous-frame texture. Never silently read an uninitialized render target.
3. Histogram storage is cleared **before** accumulation each measured frame.
4. The adaptation state is written **after** histogram and is not overwritten/read while still in flight.
5. Bloom and tone mapping both use exposure from the **same logical frame**. If a deliberate one-frame lag is required for scheduling, both consume the **same previous-frame EV**, and diagnostics label it.
6. No `await renderer.getArrayBufferAsync(...)` or `readRenderTargetPixelsAsync` on the normal render path.
7. No CPU readback or synchronous GPU fence per frame.
8. Enabling/disabling or disposing the graph cannot leave stale storage bindings in another cached topology.
9. Texture read/write hazards, UAV/barrier requirements and storage texture formats pass WebGPU validation.
10. Failure causes a single diagnostic and immediate fallback, not a silently black screen.

### 4.2 Decision gate: implementability on current Three.js

Probe **actual** `three/tsl` exports and builder behavior at the locked version; do not assume APIs from Ponlai r186 are available/identical in Drusniel r187. Relevant examples: `Fn`, `atomicAdd`, `atomicStore`, `workgroupArray`, `workgroupBarrier`, `localId`, `storage`, `textureLoad`, `computeKernel`, `RenderPipeline`, `rtt`, `texture` and `QuadMesh`.

Recommended approach **if directly supported**: one graph-owned offscreen HDR input, an explicit ordered compute histogram, an exposure-state reduction and reuse of a GPU-visible 1×1 exposure state by downstream bloom/tonemap. In contrast to Ponlai, this must be an extension of the **existing graph**, not a second rendering framework.

Potential integration surfaces:

- A dedicated `HdrHistogramMeter.js` that owns buffer(s), compute nodes, clear/measure/reduce stages and diagnostics.
- A `GpuAutoExposure.js` that owns adaptation state, reset commands, and the node returned to bloom/tonemap.
- A thin scheduler adapter within [D1]/[D6] that arranges execution with proven TSL dependencies.

**If the current RenderPipeline cannot guarantee ordered compute after the scene pass without an extra scene draw: do not fake it.** Record the reproducer and block implementation. Assess either:

- a **minimal** documented scheduler boundary using supported renderer operations while preserving one scene render; or
- a smaller temporary GPU luminance-reduction path, clearly labelled non-histogram, to validate look/UX **but not claiming PR C completed**; or
- a separate prerequisite architectural PR to make existing render stages schedulable without replacing the whole graph.

An explicit, measured failure gate is preferable to a fragile callback that happens to work on one GPU.

### 4.3 Resource dependency model

```text
Existing one-pass HDR scene MRT
    |
Existing optional AO -> shafts -> SSR
    |
    +------------ [pre-TAA/visible scene HDR for meter]* -----------+
    |                                                               |
Existing optional TAA/TAAU                                         |
    |                                                               |
    +---------------- existing HDR source --------------------------+
                                                                    |
                [A] clear 2 x 128 uint histogram                    |
                                  |                                 |
                [B] fixed-grid HDR/depth histogram <----------------+
                                  |
                [C] trim foreground + highlight percentiles
                                  |
                [D] adapt previous EV in 1x1 GPU state
                                  |
                       effectiveExposureNode
                                  |
                    +-------------+-------------+
                    |                           |
        existing BloomNode prefiler      existing ToneMappingNode
        (HDR * effectiveExposure)        (HDR * effectiveExposure + exposed bloom)
                    |                           |
                    +-------------+-------------+
                                  |
                   existing selected tone curve
                                  |
                  existing display-linear vignette
                                  |
             existing single output-space conversion
                                  |
                  existing sharpen / film grain
```

*For precise source selection, use the current **post-SSR, pre-bloom** HDR that is semantically closest to Ponlai's composite. If avoiding TAA history feedback or additional scheduling forces metering from `preTaaOutput`, document/QA the difference. Use the same frame's full HDR image and never meter the already-exposed bloom. Do not meter screen-output sRGB, `renderOutput`, film grain, vignette or colour-converted pixels.*

### 4.4 Meter versus TAAU resolution

Fixed UV sample positions are crucial. A metering dispatch sized to the scene's dynamic render resolution would change at every TAAU scale and could alter both cost and response. Use a fixed sample grid and sample mapped normalized UV into the **actual** HDR target; clamp within its known pixel dimensions. Verify TSL camera jitter and texture sampling semantics across TAA and TAAU to avoid exposure shimmer. If the meter reads pre-TAA jitter, quantify EV variation per jitter index; optionally meter a stable resolved HDR node if it does not create a circular dependency.

The histogram does not depend on world coordinates, so floating-origin rebases affect it **only through the rendered view and reset events**, not through its bin math.

## 5. Proposed histogram mathematics, explicitly adapted from Ponlai

### 5.1 Input signal and validity

Let `C(u,v)` be **linear HDR RGB** at the selected scene texture; luminance:

```text
Y = dot(max(C, 0), vec3(0.2126, 0.7152, 0.0722))
```

The weights are conventional Rec.709 linear luminance. Clamp negative shader artifacts to zero; reject nonfinite luminance. Never take `log2(0)`.

Classify a pixel as foreground only if its depth reliably describes actual scene geometry. Investigate [D1]'s depth attachment and [D5]'s sky `depthWrite=false` to determine the clear-depth sentinel under WebGPU, projection and reverse-Z **as actually used**. Do not adopt Ponlai's `surfaceDepth < -9e4` condition; Drusniel's signal is different.

If depth is unavailable or cannot unambiguously separate sky/water, use a fallback metering mode with all-pixel weighting and visibly report it, or disable the optional effect. **Do not infer object class from RGB hue.**

### 5.2 Two distributions, not per-material illuminance

Create:

- `H_F`: foreground **visible HDR luminance**; excluded sky; used as the core key.
- `H_H`: full-frame visible HDR luminance (including bright sky/glints); used for highlight protection.

These are each 128-bin integer histograms. They are *not* `H_M` and `H_Y` from Ponlai: note the difference in code documentation and logs.

Initially, avoid special-case hand-tuned water/glass luminance rules. Where transparency, emissive particles or water dominate, the percentile trimming and sky/look bounds should handle the case; add masks **only after evidence** shows this is insufficient. Metering masks must not require new material data channels in PR C.

### 5.3 Numeric design

**Initial engineering proposal (not a measured optimal configuration):**

| Symbol | Initial proposed value | Reason |
| --- | ---: | --- |
| Histogram count | 2 | Foreground key + full highlight |
| Bins/histogram | 128 | Ponlai-proven quantile granularity |
| Log2 lower edge | -16 | HDR16F-range-inspired; actual scene-unit range requires calibration |
| Bins/stop | 4 | Quarter-stop bins |
| Fixed-point weight | 256 | Deterministic integer splats |
| Sample grid | 256×128 = 32,768 samples | Conservative starting cost; Ponlai uses 512×256 |
| Compute tile | 16×16 threads | 256 lanes/tile; benchmark alternative |
| Dispatch tiles | 16×8 = 128 | For proposed 256×128 grid |
| Foreground trim | 10th–90th weighted percentile | Robust central exposure, re-evaluate on dark/bright scenes |
| Highlight band | 90th–97th percentile of `H_H` | Protect bright few percent; sunlight/noon/snow validation needed |
| Log-domain epsilon | use clamped positive/nonfinite-safe definition | Avoid invalid/stale inputs |
| Disabled path | zero extra GPU memory/work | Required |

The 2×128-count uint32 global histogram occupies 1024 bytes raw (256 × 4). Workgroup storage also costs per group; count it from actual compiled shader. State could be two 1×1 RGBA32F textures (2 × 16 raw bytes before alignment/driver overhead); **these figures are arithmetic estimates, not measured allocation counts**. The memory bottleneck may be additional HDR RTTs or transient pipeline intermediates, not the histogram.

**Range risk:** Ponlai's fixed -16..+16 stop bin range works with `preExposure`. Drusniel has **no equivalent P**, so the same range may clip very dark/night or extremely bright frames. Start with instrumented pilot sampling of actual HDR values at sunrise/noon/night and choose a proven range. Record first/last bin occupancy. Do not call high occupancy normal without investigating underflow/overflow.

### 5.4 Atomic two-bin tent splat

For valid `Y > 0`:

```text
logY     = log2(Y)
v        = clamp((logY - LOW) * BINS_PER_STOP - 0.5, 0, BINS - 1)
i0       = clamp(floor(v), 0, BINS - 2)
fraction = clamp(v - i0, 0, 1)
w1       = round(fraction * ONE)
w0       = ONE - w1
atomicAdd(localBins[base + i0], w0)
atomicAdd(localBins[base + i0 + 1], w1)
```

**Properties to test:** total weight for each valid pixel is exactly `ONE`, sums are integer-order-independent, outside-range values accumulate in boundary bins rather than wrap, and invalid/zero values do not contribute. Accumulate locally into workgroup atomic memory where supported, barrier, and merge to global bins by lane (as in [P1]). If current Three.js cannot compile this pattern, a distinct staged reduction is permitted only after benchmark/validation.

### 5.5 Histogram clear + accumulation

1. Clear the **entire** 256-uint global histogram each frame before sampling, using a small compute pass or supported buffer clear with verified ordering.
2. Sample at the centre of each fixed UV grid cell, mapping to the scene texture size.
3. Read `C` and depth, classify foreground, add to `H_F` and/or `H_H`.
4. Group threads accumulate local bins and merge.
5. Run a small exposure reduction **after** accumulation. No implicit ordering assumption based only on JavaScript object construction.
6. Reset/invalidate on new graph, device replacement, world load and test-mode explicit event.
7. Do not touch buffers on disabled quality/legacy WebGL paths.

If the GPU method requires allocating one new HDR texture to force graph execution, include its size and per-frame cost in the acceptance report; reject a design that secretly duplicates the main scene pass.

### 5.6 Weighted percentile-trimmed log mean

For `H` with bin weights `h[i]`, total `T`, and low/high quantiles `q0,q1`:

```text
lo = q0 * T
hi = q1 * T
running = 0
sum = 0
acceptedWeight = 0

for i in 0 .. BINS-1:
    next = running + h[i]
    accepted = max(0, min(next, hi) - max(running, lo))
    centerStops = LOW + (i + 0.5) / BINS_PER_STOP
    sum += accepted * centerStops
    acceptedWeight += accepted
    running = next

logMean = sum / max(acceptedWeight, 1e-6)
hasReading = acceptedWeight > 0 && T >= ONE
```

This precisely handles bins straddling the percentile boundary, unlike naïvely selecting whole bins. It is the core idea from [P1] `buildMeter`/`trimmed`. Unit-test two-bin examples, empty distributions, all-black frames, single bright lights and strongly bimodal scenes.

### 5.7 Foreground and highlight target

Let:

- `m_F` = trimmed foreground mean in log2 scene HDR luminance;
- `m_H` = mean in the bright/full-frame band;
- `k` = proposed target exposure key for typical scene luminance;
- `k_H` = proposed highlight threshold key;
- `base` = current authored effective exposure from [D4]/[D8];
- `deltaEV` = **relative stops added** to the authored look.

An *unconstrained* screen-luminance exposure would set:

```text
candidate = log2(k) - m_F - log2(base)
highlightLimit = log2(k_H) - m_H - log2(base)
```

**Important consequence:** multiplying the final `base` by `2^candidate` approximately cancels authored `base`. That is **not acceptable** for Drusniel's snow-country looks or a dramatic night preset. Do not blindly implement this equation as final policy.

Instead use an **authored-scene-anchored** controller. Two defensible approaches:

**Approach A — recommended for initial PR C:** a small bounded **relative** compensation around the authored look, computed from changes relative to a **stable scene reference** for that sky/time/weather and use case. Define reference log luminance `m_ref` for the current authored look, not a global constant inferred from one screenshot; then:

```text
deltaRaw = m_ref - m_F
deltaHighlight = log2(highlightKey) - m_H - log2(base)
deltaEV = clamp(
    softMin(deltaRaw + compensationEV, deltaHighlight),
    sceneMinDeltaEV, sceneMaxDeltaEV
)
effectiveExposure = base * exp2(deltaEV)
```

The reference must be a documented measurement/lookup from existing look/lighting state, **not** an arbitrary frame captured at whatever camera happened to be active on startup, which would make the output path-dependent. The implementation must define and test how `m_ref` follows the sky preset, weather and authored look. If it cannot be derived reliably without a new physical-light buffer, restrict the feature to fixed exposure bounds and note limitations.

**Approach B — fallback for a very small first shipping feature:** compute a normal screen-luminance target, but clamp its relative `deltaEV` tightly **by scene class/sky look** and preserve user manual bias. This is simpler, but can visibly oppose authored art direction and must pass the scene tests. In that mode the settings and diagnostics must label `meteringMode: "screen-luminance-bounded"`; do not mislabel it as physically based.

Whichever is chosen, the final output must satisfy:

- **Existing authored `sceneExposure.scale` remains a first-class look control**.
- User manual exposure is not replaced by the meter.
- Night and snow scene brightness relationships remain semantically recognizable.
- Lack of foreground pixels has a stable sky-aware fallback (or holds authored exposure), **never divide by zero** or pump exposure until the sky becomes white.

The exact daylight/night offsets and highlight key must be calibrated from PR B captures; no universal constants from Ponlai's island looks should be copied without measurement.

### 5.8 Soft highlight guard

Ponlai [P2] uses a log-domain soft minimum with width 0.25 stops. For two candidate stop values `a` and `b` and width `s > 0`:

```text
softMinStops(a, b, s) =
  min(a, b) - s * log2(1 + exp2(-abs(a - b) / s))
```

This avoids an abrupt “corner” as the highlight guard becomes active. If the extra transcendental cost matters, compare a cheaper smooth minimum with a unit test and quality capture, but keep it continuous. The 0.25-stop softness is a **reference**, not a proven best setting for Drusniel.

Define a no-highlight-reading fallback to the foreground target, and a no-foreground-reading fallback to the authored/sky baseline; never manufacture 0EV from an uninitialized histogram without recording the reason.

## 6. Exact temporal adaptation in EV space

### 6.1 Required properties

- Frame-rate independent.
- Finite with large but finite `dt`.
- Doesn't oscillate or over-shoot badly on ordinary camera pans.
- Runs **on GPU** with a small persistent state, not via a per-frame JS readback.
- Snaps or resets at **camera cuts/world changes** where carrying the previous brightness would look wrong.
- Follows day/night/cloud transitions without turning them into instant brightness jumps, except where an explicit cut policy applies.
- Disabled mode returns the exact authored/manual exposure; it never updates GPU adaptation state.
- Same sky/view after a reset converges to the same target regardless of previous path, so PR B captures are reproducible.

### 6.2 Critically damped exact step (adapted from Ponlai [P2])

State `(EV, velocity)` in stops and stops/s. Given target `t`, time constant `tau` and `dt`:

```text
omega = 1 / max(tau, epsilon)
y = EV - t
c = (velocity + omega * y) * dt
decay = exp(-omega * dt)

newEV       = t + (y + c) * decay
newVelocity = (velocity - omega * c) * decay
```

If the new value lies outside the authored scene bounds, clamp EV and clear velocity. If snap/reset is requested, set EV directly to target and velocity to zero. Put the next target and a validity flag in the other state channels where useful.

**Direction naming:** “brighten” = EV rises as the scene becomes darker; “darken” = EV falls as the scene becomes brighter. Use unambiguous config names such as `brightenTauSeconds` and `darkenTauSeconds`, with unit tests. Ponlai's own parameters `up` and `down` are ~0.05 seconds for its authored scene; copying those without measuring would likely be too fast for our forest/cave transitions.

**Proposed start for QA only, not accepted shipping tuning:** `brightenTauSeconds: 0.35` and `darkenTauSeconds: 0.20`. These are adjustable and bounded. The filter's exact step handles variable frame rates; [D12] currently clamps frame delta to 0.1 seconds, so specify whether exposure should follow that **existing clamped delta** or actual monotonic real-time delta. A consistent policy is required on tab restore and frame gaps; never accidentally integrate a 30-second background pause and flash the scene.

### 6.3 GPU state lifecycle

Proposed (if scheduling is proven):

- Two 1×1 RGBA32F (or supported) GPU exposure state surfaces, ping-ponged.
- Channel layout: `(EV, velocity, targetEV, validOrMoved)`, explicitly documented.
- Read from last completed state; write current state once per frame.
- Use current frame camera/scene input, authoritative `dt` and `reset` uniform.
- Exchange write/read roles **only after a successfully rendered frame**, not on failed precompile/warmup.
- Initial state must be valid on first use: clamp/snap to target, not sample uninitialized VRAM.
- Discard or reset state on graph/resource regeneration and device loss.
- No stale async callback may mutate a newly created graph.

**If a full same-frame GPU state dependency cannot be expressed safely by the existing graph**, use a one-frame-delayed exposure state for **both** bloom and tone mapping with explicit QA. The frame's adapted state must still be ordered and persisted correctly. Do not drive tone mapping with `EV[n]` while bloom uses `EV[n-1]`.

### 6.4 Reset policy matrix

| Event | Expected exposure behavior | Existing trigger owner |
| --- | --- | --- |
| First enable/start | Snap to valid target, then normal smoothing | [D6] graph construction/init |
| Teleport / player spawn | Snap or fast-reset; no long remembered cave brightness | [D14] `CAMERA_TELEPORT`, `PLAYER_SPAWNED` |
| Active camera swap / FOV | Reset/reevaluate view; no invalid history | [D14] `ACTIVE_CAMERA_REPLACED`, `CAMERA_FOV_CHANGED` |
| World load/import/restore | Drop old-world exposure state | [D14] world events |
| Floating-origin rebase | Preserve radiometric target if view is visually unchanged; **do not blindly flash exposure** | [D14] `FLOATING_ORIGIN_REBASE`; compare canonical view |
| Render resize / TAAU scale | Keep EV if valid and viewport composition unchanged; reset/rebuild histogram sampling as required | [D14] `RESIZE`/`RENDER_SCALE_CHANGED` |
| Graph topology rebuild | Preserve EV only if resources and settings transition allow; otherwise snap safely | [D6] graph lifecycle |
| Long frame gap / tab hidden | Snap or bounded integration according to documented policy | [D6] `resetHistoryAfterGap` |
| World weather starts | Smooth as light evolves; do **not** snap merely for an animation event | [D14] `WEATHER_STARTED` reactive |
| Streamed chunk / LOD | Hold/smooth; **do not** reset on every tiny object transition | [D14] reactive events |
| Spell flash / lightning | Highlight guard and masking prevent permanent EV pump | [D5] `setLightningFlash`, spell events |
| Manual exposure change | Keep `deltaEV` as relative auto factor; user bias applies immediately | [D8] settings |
| Disable/re-enable | Dispose or park resources per scope, restart from valid target; no stale buffers | [D6] settings topology |
| Device loss / shader compile error | Existing manual look preserved, optional auto disabled until recovery | [D6] `handleFailure` |

The rebase case is especially important in a large streamed world: render-origin changes should not cause perceived exposure jumps when the same scene remains visible. An existing TAA history invalidation does **not automatically imply** auto-exposure must snap; the auto-exposure reset policy is a separate documented decision. Test both with canonical camera matching.

### 6.5 Temporal / metering feedback avoidance

- Histogram input must be **unexposed HDR** if measuring relative radiance, not already multiplied by auto exposure.
- Bloom is measured **before** being added: otherwise feedback may cause exposure oscillations.
- The exposure-state output cannot depend on downstream tone mapping or bloom resources it drives.
- The sky look has its own authored exposure compensation [D5]; avoid measuring an exposed display image and applying the result again.
- Do not tie meter target computation to previous `sceneExposure.scale` unless deliberate and mathematically accounted for.
- TAA jitter and post history may introduce small frame-to-frame luminance changes. The stable grid and smoothing should absorb them; test and quantify p95/p99 EV jitter with motion and static captures.
- **Do not add the pre-exposure `P` loop from Ponlai in PR C.** Doing so would require changes to all scene/haze/cloud/water/refraction HDR writers/readers and invalidate resource & history assumptions.

## 7. Bloom and tone-mapping integration — preserve present colour science

### 7.1 Current implementation is split across two consumers

[D1, D2, D3]:

```text
baseExposure = toneMapping.exposure * sceneExposure.scale

BloomNode:
  exposedLowPass = sampleLowPass13(unexposedHdr) * baseExposure
  bloomPyramid = softKnee(exposedLowPass, threshold, knee)

ToneMappingNode:
  colour = unexposedHdr * baseExposure
  colour += bloomPyramid * bloomIntensity
  grade(contrast, saturation)
  existing toneCurve(...)
```

**Preserve this invariant exactly.** The new factor is:

```text
autoFactor = exp2(relativeEV)
effectiveExposure = baseExposure * autoFactor
```

The **same** `effectiveExposure` must be used in bloom prefilter and tone-map colour. Bloom is already exposed, so adding it then applying exposure again would introduce double gain and visibly alter highlights.

### 7.2 Graph integration contract

- Extend `ToneMappingNode` to accept an exposure **node** or an injectable shared exposure provider without replacing its curve/colour-grade code.
- Extend `BloomNode` source prefilter exposure input similarly. Existing fixed numeric scalar paths should keep behaving exactly as before.
- Avoid separate auto exposure controllers inside ToneMappingNode and BloomNode.
- `PostProcessingGraph.updateUniforms` already calls `scaledToneMapping` once per frame; move the effective exposure computation into **one** graph-owned provider and make both consumers reference it.
- No CPU readback required to assign `this.exposure.value` every frame. GPU exposure state should be sampled by node graph once as a small shared dependency.
- If the feature is disabled, use the old `uniform(baseExposure)` branch, with no extra graph node/buffer allocation.
- Keep normal `AgX/ACES/Neutral` mapping and the existing `renderOutput` output-space conversion unchanged.
- Debug HDR colour view must be explicit about whether it displays raw HDR or exposed HDR. Prefer preserving current view semantics and adding a separate exposure diagnostic; do not silently change existing debug captures.

### 7.3 Tone-mapping disabled modes

The post graph can be enabled while `toneMapping.enabled` is false or mode `none`. Auto exposure could still multiply HDR and feed it to `NoToneMapping`, which might be expected when exposure control is on. Decide and document:

- Recommended: autoExposure is active only when post-processing is active; if `toneMapping.enabled=false`, keep the configured manual exposure semantics and optionally leave auto disabled because the output may clip.
- `preset: off` bypasses all post-processing and must never retain an active histogram compute stage.
- The base renderer's own `toneMappingExposure` should not be changed by the auto meter when it does not own the output. On graph failure the manual+sky exposure remains available as today.

## 8. Scene-aware safety: night, snow, coasts and storms

### 8.1 Night must stay night

Screen-based luminance metering tends to lift a dark scene to its target grey. Without illumination-based metering and authored keys, a full moon can become “overcast daylight.” Prevent this by:

1. Using the existing sky/day-night look as a bound/anchor, not just image average.
2. Keeping relative positive EV limited by a night-specific look policy; calibrate from [D16] `town-off-21` and `forest-off-21` where supported.
3. Excluding a few lamp pixels from main foreground mean by percentile clipping and using the highlight distribution to avoid blown out lamps.
4. Measuring dark-street readability separately from absolute sky brightness and lantern colour.
5. Avoiding frame-to-frame pumping as individual lights enter/leave the frame.

**Do not implement Purkinje blue shifting in PR C.** Ponlai's [P10] shader is a separate physiological appearance model with its own inputs and belongs to PR D.

### 8.2 Snow/alpine scenes must preserve authored exposure

[D5] explicitly uses `sceneExposure.scale` to stop down bright snow regions and partially compensates sky brightness. Test:

- pure snowfield with clear sky;
- snow beneath trees;
- clouded snow;
- alpine/snow boundary;
- sunlit white masonry/ice.

If camera metering flattens snow into an 18% grey field or cancels the snow-country exposure correction, PR C fails even if histogram math is correct. In the initial version, bounds and artistic bias take precedence over generic average-grey targets.

### 8.3 Coast/water and source-space consistency

Water and foam are already complex and can be reflective, emissive, refractive or depth-quirky. A specular sea-glitter patch can dominate the full-frame tail; it should protect highlights without pulling all terrain down dramatically. Validate the sky/foreground depth mask against **water geometry**, not only terrain. The same camera onshore and offshore should not oscillate exposure because surface depth was misclassified.

### 8.4 Caves, shaded forests and interior transitions

A move from open bright coast into a shaded rainforest/cave is the principal “camera adaptation” use case. The transition should be gradual, not delayed for seconds by shader compilation, with no big flicker when a tree canopy briefly covers the view. Track EV target and output factor over time; only measure the adaptation response after readiness. If the camera becomes almost completely occluded, bound the exposure and avoid clipping the moment the view opens again.

### 8.5 Clouds, sunlight and lightning

Cloud storms dim authored lighting; meter should adapt mildly, but cannot erase the weather contrast. Lightning and spells are transient bright sources: constrain/smooth their impact so the whole frame does not remain dark after a one-frame flash. Build temporal regression cases for a 1–5-frame bright impulse and a gradual 10-second cloud transition. **No special-case colour shifts or storm shortcuts in the histogram kernel**; such policy lives in the exposure controller/scene anchor.

## 9. Configuration: one authoritative location, default off

Per PR A, **post-processing settings belong in `editor.config.yaml` under `stylizedSurface.postProcessing`** and in [D8] `PostProcessingSettings.js`, not as a duplicate in `config/render-enhancements.yaml`.

### 9.1 Proposed YAML (add only once working)

```yaml
stylizedSurface:
  postProcessing:
    toneMapping:
      enabled: true
      mode: agx
      exposure: 1.0
      contrast: 1.0
      saturation: 1.0
    autoExposure:
      enabled: false
      meter: foreground-with-highlight-guard
      key: 0.18
      highlightKey: 2.0
      lowPercentile: 0.10
      highPercentile: 0.90
      highlightLowPercentile: 0.90
      highlightHighPercentile: 0.97
      brightenTauSeconds: 0.35
      darkenTauSeconds: 0.20
      minDeltaEV: -2.0
      maxDeltaEV: 1.0
      nightMaxDeltaEV: 0.5
      compensationEV: 0.0
      resetOnCameraCut: true
```

**All values other than the existing toneMapping block are *proposals***; they are not drawn from Drusniel measurements and should be adjusted/trimmed after the first A/B hardware captures. Especially `key`, `highlightKey`, `minDeltaEV`, `maxDeltaEV` and night limit require scene-specific calibration. Do not expose unproven hardware tuning knobs to ordinary users.

### 9.2 What stays as implementation constants, not YAML

Do not expose compile-time/dispatch details merely because Ponlai's source has constants. Put these in a small `AutoExposureConstants.js`:

```js
export const HISTOGRAM_BINS = 128;
export const HISTOGRAM_BINS_PER_STOP = 4;
export const HISTOGRAM_FIXED_POINT_WEIGHT = 256;
export const HISTOGRAM_TILE_SIZE = 16;
export const HISTOGRAM_SAMPLE_WIDTH = 256;
export const HISTOGRAM_SAMPLE_HEIGHT = 128;
```

These are proposed initial values for GPU validation; changing them requires topology/compile and regression testing. Ensure the shader, JavaScript allocator and test reference share one owner for each constant. The log range (and other compiled values) also belong there unless evidence justifies user-configurable tuning.

### 9.3 Normalization and preset semantics

[D8] `normalizePostProcessingSettings` must:

- Introduce a deeply frozen `autoExposure` default object with `enabled:false`.
- Strictly validate true booleans, finite stops/seconds, ordered percentile pairs, positive key values and valid enums.
- Warn/ignore unknown keys consistent with existing behavior; never silently activate an unrecognized mode.
- Preserve all existing snapshot/migration behavior when old saves omit `autoExposure`.
- Maintain deep-copy isolation and immutable settings.
- Keep quality/preset changes deliberate: PR C must **not automatically enable auto exposure in balanced/high/ultra**. Persist explicit user-enabled artistic choice only if that matches the existing preset semantics after code review.
- Ensure `preset: off` disables the graph completely regardless of the stored nested auto switch.
- Ensure mobile default-off even if desktop performance wins; enable mobile later only by specific measured tier.
- Create a new topology signature component only when `autoExposure.enabled=true`. Numeric EV changes should update uniforms, not rebuild shader pipelines.
- Do not create a second config loader or a `renderEnhancements.autoExposure` block.

[D9] `POST_PROCESSING_PRESETS` currently preserves selected artistic keys. The implementer must decide whether to put `autoExposure` in that preserved set, based on actual UI behavior: user-controlled opt-in should not mysteriously vanish on switching from high to low, nor should a prior high scene force the new lower-tier preset into unsupported GPU compute. Explicit capability/preset policy wins over accidental inheritance.

### 9.4 UI: compact and meaningful

Add a compact section to [D10], ideally under Tone Mapping:

- **Auto exposure** toggle (off by default).
- **Exposure compensation (EV)** [-2, +2] with 0 default, optionally behind advanced disclosure.
- **Adaptation speed** preset (fast/normal/slow) if user testing shows speed tuning useful; don't expose 12 GPU parameters.
- **Meter debug** read-only current target/EV/mode/status, optional advanced diagnostics.
- Preserve existing manual `toneMapping.exposure` slider, labelled as the **authored base exposure** when auto is enabled.

Avoid changing the editor's overall settings layout for this feature. As with other topology controls, toggling must not rebuild the graph on every slider movement. Show actual unsupported status if capability fallback occurred; never show “enabled” while the effect is silently inactive.

## 10. Feature topology, ownership, lifecycle and error paths

### 10.1 New modules (small and single-purpose)

| New source file | Ownership | Description |
| --- | --- | --- |
| `src/render/postprocessing/autoExposure/AutoExposureConstants.js` | constants only | Histogram grid, bins, stop range, named formats and bounds |
| `src/render/postprocessing/autoExposure/HistogramMath.js` | pure math + CPU references | Bin mapping, trim mean, soft guard, limits and deterministic tests |
| `src/render/postprocessing/autoExposure/HdrHistogramMeter.js` | one GPU resource owner | Histogram buffers, fixed-grid compute, clear/measure/reduce order |
| `src/render/postprocessing/autoExposure/ExposureAdaptation.js` | pure math reference | Critically damped exact step/snap and unit tests |
| `src/render/postprocessing/autoExposure/GpuAutoExposure.js` | state + lifecycle | Persistent EV state, reset, uniform inputs, fallback and bound GPU exposure node |
| `src/render/postprocessing/autoExposure/AutoExposureDiagnostics.js` | diagnostics | Validity, source type, EV, timings when legitimate, fallback reasons |

Keep modules reasonably small. If scheduling can be expressed cleanly without two separate meter/state classes, combine them rather than create abstractions for their own sake. Do not add generic “RenderEffectManager” or “FrameGraphAdapter” layers to carry one feature.

### 10.2 Existing modules to modify

| Existing file | Exact integration |
| --- | --- |
| [D1] `PostProcessingGraph.js` | Build metering only when enabled, select current HDR input, wire both exposure consumers, update state/uniforms, resize/dispose; no second world draw |
| [D2] `nodes/ToneMappingNode.js` | Support GPU exposure node input while preserving existing scalar/manual reference path |
| [D3] `nodes/BloomNode.js` | Receive same GPU exposure node for prefilter, maintain thresholds in exposed units |
| [D6] `PostProcessingController.js` | Lifecycle, fallback and reset policy; use established graph/resource ownership |
| [D8] `PostProcessingSettings.js` | Defaults, normalization, ranges, clamps, unknown-key warnings |
| [D9] `PostProcessingPresets.js` | Preserve explicit opt-in coherently across presets |
| [D10] `PostProcessingSettingsPanel.js` | Compact toggle/compensation/readout |
| [D13] `nodes/PostCommon.js` | Only enabled/compile-time state in topology signature |
| [D14] `PostProcessingInvalidation.js` | Forward relevant events into auto exposure reset/hold policy; avoid duplicate invalidation type system |
| [D20] `editor.config.yaml` | Optional block disabled by default |
| [D21] `PostProcessingDiagnostics.js` | Read-only exposure status if useful; do not mislabel GPU timing |
| [D15] browser QA | Add Auto off/on, scene comparison, no-shader-error assertions |
| [D16] look QA | Night/snow/coast/forest A/B matrix grounded in existing fixtures |

**Avoid modifying** `PostProcessingHistory.js` unless an actual narrow lifecycle need is demonstrated. TAA and exposure have different histories; use a separate state owner and event listener rather than adding many exposure-specific fields to the TAA history store.

### 10.3 Topology and resource keys

Current [D13] includes effect enables, AA, bloom levels, tone curve, render scale, SSR/shaft/DOF topology and debug view. Add `autoExposure` enabled to the signature **only where the feature is actually built**. Histogram bin/sample constants are compile-time; if they are ever made variable, incorporate them in the signature. A change to `compensationEV` or adaptation time constants is a uniform update, not a graph rebuild. A disabled graph must have no hidden compute pass or state texture.

### 10.4 Failure categories

- **Unsupported device:** No WebGPU compute/storage/texture format, or resource limit too low. Auto remains disabled, base exposure unchanged; record unsupported reason.
- **Shader compile/validation:** Existing [D6] `handleFailure` logs and restores base renderer output. Avoid indefinite retry of failed topology until user action/settings change.
- **GPU device loss:** Release resources, invalidate state generation; on rebuild start fresh.
- **Histogram invalid:** All black/zero valid samples, NaNs, high saturation at bin edges. Hold previous safe EV or use authored base without a hard flash.
- **Readback unsupported:** No impact in normal mode because no readback required. Diagnostic readbacks must be opt-in, asynchronous and bounded.
- **Resource disposal:** Clear pointers, avoid callbacks writing into a disposed graph, preserve idempotent dispose.
- **Settings invalid:** Reject/clamp through existing normalizer; don't let an invalid YAML number reach `exp2` on GPU.
- **Base/post bypass:** Renderer manual tone mapping remains correct; never double apply `sceneExposure.scale`.

Use existing console/error conventions in [D6] with structured context. Log capability failure once per topology, not in a per-frame loop. No silent black/white fallback image.

## 11. Pseudocode for implementation handoff

**This pseudocode describes required behavior, not verified drop-in TSL code.** The graphics API specifics must pass the section 4 scheduling spike before implementation.

### 11.1 Graph assembly

```js
function createOptionalAutoExposure({ renderer, sceneHdr, depth, settings, lifecycle }) {
  if (!settings.enabled) return null;
  const meter = new HdrHistogramMeter({ renderer, sceneHdr, depth });
  const adaptation = new GpuAutoExposure({ renderer, meter, lifecycle });
  return {
    effectiveExposureNode: adaptation.exposureFactorNode,
    beforeFrame: (state) => adaptation.updateInputs(state, settings),
    reset: (reason) => adaptation.reset(reason),
    dispose: () => { adaptation.dispose(); meter.dispose(); },
  };
}
```

The actual graph uses a single shared exposure factor:

```js
const base = scaledToneMapping(settings.toneMapping);
const auto = settings.autoExposure.enabled
  ? createOptionalAutoExposure({ /* shared graph dependencies */ })
  : null;

// A typed TSL node, not a CPU readback.
const effective = auto
  ? float(base.exposure).mul(auto.effectiveExposureNode)
  : uniform(base.exposure);

bloom = new BloomNode({ sourceNode: hdr, exposureNode: effective, /* ... */ });
tone  = new ToneMappingNode({ sourceNode: hdr, bloomNode: bloom.outputNode, exposureNode: effective, /* ... */ });
```

**Caution:** don't instantiate `float(base.exposure)` as a fixed constant if `base.exposure` changes with the current sky look every frame. Use an existing GPU uniform and update its value via [D1] `updateUniforms`. The example above is conceptual; the production implementation must keep runtime scene exposure dynamic and avoid topology rebuild when it changes.

### 11.2 Bin accumulation

```js
// GPU compute pseudocode; intentionally not exact Three.js syntax.
clearHistogram(256);

parallelFor(sampleGrid256x128, (uv) => {
  const hdr = loadLinearHdr(currentHdr, uv);
  const depth = loadDepth(currentDepth, uv);
  const y = luminance(max(hdr.rgb, 0));
  if (!finite(y) || y <= 0) return;
  splatUintHistogram(H_FULL, log2(y), ONE);
  if (isVerifiedForeground(depth)) splatUintHistogram(H_FOREGROUND, log2(y), ONE);
});

const foreground = trimmedLogMean(H_FOREGROUND, 0.10, 0.90);
const highlights = trimmedLogMean(H_FULL, 0.90, 0.97);
const target = anchoredExposureTarget(foreground, highlights, authoredLook, settings);
adaptAndWriteOneTexel(target, previousState, dt, resetFlag);
```

### 11.3 Pure CPU reference filter for testing

```js
export function stepExposureReference(ev, velocity, target, dt, tau, { minEV, maxEV, snap = false }) {
  if (snap) return { ev: target, velocity: 0 };
  if (![ev, velocity, target, dt, tau].every(Number.isFinite)) throw new TypeError("Nonfinite exposure input");
  if (dt < 0 || tau <= 0) throw new RangeError("Invalid exposure time");
  const omega = 1 / Math.max(tau, 1e-4);
  const y = ev - target;
  const c = (velocity + omega * y) * dt;
  const decay = Math.exp(-omega * dt);
  const next = target + (y + c) * decay;
  const vNext = (velocity - omega * c) * decay;
  if (next < minEV || next > maxEV) {
    return { ev: Math.max(minEV, Math.min(maxEV, next)), velocity: 0 };
  }
  return { ev: next, velocity: vNext };
}
```

Use the production constants module rather than magic numbers. The test reference may have additional validation; the runtime GPU node must never throw per pixel.

## 12. Exact acceptance matrix and tests

### 12.1 Pure math unit tests

Create small `node --test` tests (no GPU required):

- `HistogramMath`: one sample adds exactly 256 units; neighbouring bins sum correctly.
- Total histogram sum for 32,768 valid samples is exactly 8,388,608 (if all are valid and each contributes 256).
- Zero/negative/NaN/±Infinity inputs never produce overflow or a positive false count.
- Values at lower/upper bin edges accumulate correctly, without out-of-bounds access.
- Trimmed mean exact for one bin, two bins, uniform histogram, 10–90%, 90–97% and partly covered boundary bins.
- Empty foreground / all-sky / zero-weight cases return “no reading” rather than silently selecting arbitrary EV.
- Highlight soft minimum is continuous, finite and no greater than the smaller unconstrained input (for positive softness).
- EV target is monotonic as foreground luminance changes **when scene look and highlight conditions are fixed**.
- Authored base exposure stays exactly the same at `autoFactor=1`; disabled path matches manual numerically.
- Day/night bounds hold across white/black/bimodal synthetic scenes.
- Exact critically damped formula matches analytic step for constant target.
- Frame-rate invariance: 1×1 s versus 60×1/60 s (under the **same constant target**) within floating-point tolerance.
- Very small, zero and long dt; no NaN or negative exposure.
- Brighten/darken tau directions correct.
- Snap clears velocity, resets produce stable target regardless of prior state.
- All nested settings are immutable and normalized, including old saves/preset combinations.

### 12.2 Renderer graph tests

Extend existing tests under `test/postprocessing/`:

- Auto off → original topology signature and GPU allocations unchanged.
- Auto on → distinct topology signature, exactly one set of meter/state resources.
- Uniform-only compensation/time-constant changes keep topology unchanged.
- One scene MRT remains; no extra scene draw in compiled render graph.
- Bloom and tone map both use the same exposure factor; no double exposure.
- Render failures restore base renderer tone mapping/exposure (including sky scale).
- Dispose releases all buffers, textures, quads and listeners once.
- Resize/rebase/world change reset/hold policy follows the matrix in `6.4`.
- No post output-space double conversion; all existing tone modes still compile.
- No shader node invalidation from a disabled or unsupported auto mode.
- On low/mobile preset, old look and resource bounds remain unchanged.

### 12.3 Golden visual scenes (actual existing IDs)

Reuse [D16] `scripts/fixtures/environment-look-shots.json` and PR B (`not` invented scenes):

| Existing scene ID | What to measure | Required visual behavior |
| --- | --- | --- |
| `grassland-off-12` | Daytime baseline, sky/headroom | No washed-out scene, minimal idle drift |
| `forest-off-12` | Shaded tree interiors | Gradual readability with maintained shadows |
| `core-rainforest-off-12` | Dense canopy/tiny foliage | No exposure pump on dither or leaf gaps |
| `coast-off-12` | Glitter/white foam/horizon | Controlled highlights, turquoise/deep sea preserved |
| `town-off-21` | Night lamps and dark street | Remains night, emissive lights not blown out |
| `forest-off-18.6` | Sunset/sun angle | Warm gradient preserved, no jerks near sun |
| `core-taiga-snow-12` | Sunlit snow, shaded trunks | Snow stays white but textured, not grey |
| `glacier-off-12` | Extreme bright terrain | No clipping surge or lost snow detail |
| `snow-eye-off-12` | Extreme imported snow zone | Authored snow-country exposure remains effective |
| `forest-storm-12` | Overcast/rain lighting | Weather appears darker, not automatically normalised away |
| `town-rain-19` | Wet evening lamps | Stable relative brightness through weather |
| `forest-off-21` | Dark forest | Remains plausibly dark, no night→day conversion |

The existing `qa:look` runner supports these grounded cases; verify exact CLI IDs and dependencies before applying `--only`. Use [D15] `post-processing-capture` cases and `post-processing-route` (includes rebase) for settings/temporal transitions. PR B's same-source capture/report methodology must be ready before a visual PASS is claimed.

### 12.4 A/B comparative protocol

For each critical scene:

1. Capture fixed exposure baseline (`autoExposure.enabled=false`), same locked source and camera.
2. Capture auto enabled on the same hardware and effective scene state, allowing a documented settle period.
3. Collect a time series of `EV target`, `EV current`, valid sample counts, upper/lower bin occupancy and reset reason.
4. Compare histogram/EV diagnostics against a CPU reference on synthetic scenes.
5. Capture matching screenshot pairs, local/crop differences, annotated changes and a contact sheet for human review.
6. Run at least one deliberate brightness step (camera turns forest↔sky or room↔exterior) and a graded transition (weather/time).
7. Confirm no camera-cut/rebase flash and no post-history ghosting introduced.
8. Test auto exposure off → on → off, graph failure recovery, window resize/DPR change, and mobile/unsupported fallback.
9. Keep original visual regression gates intact; intentional image changes require explicit reviewed new reference evidence, not blanket tolerance loosening.
10. Record any untested environmental condition as pending, never as passed.

### 12.5 Performance and memory acceptance

Use PR B's measured timestamp-off vs timestamp-on methodology:

- **Timestamp-off** native hardware WebGPU baseline for authoritative frame pacing: existing `npm run qa:perf -- --headed --qa chunk-cross ...` and `settlement-approach`.
- **Timestamp-on** same scenario for sampled render passes; inspect `gpuRender.supported` and its explicit scope. It may not include compute work.
- Explicitly measure histogram/clear/reduction cost with legitimate GPU timestamp or whole-frame A/B timing; **never** infer compute time from `gpuRender`'s render-pass total alone.
- Check shader compilation/startup separately from steady-state runtime.
- No per-frame JS allocations or CPU↔GPU readbacks for the exposure loop.
- No new full-resolution HDR copy unless proven necessary and within budget.

**Proposed performance acceptance targets (to verify, not measured):**

| Device/run | Target | Interpretation |
| --- | --- | --- |
| User's desktop hardware WebGPU at 1280×720 | Auto-on extra steady-state GPU work **≤0.35 ms p95** | Aspirational; measure including compute; keep baseline |
| Desktop at 1600×900 | No material regression to existing frame/hitch/recovery gates | Authoritative local QA |
| Mobile | Feature disabled by default and zero added GPU work | Required |
| Disabled on desktop | No measurable histogram compute/resource allocation; identical old output | Required |
| Startup | No unnecessary eager histogram shader compile when off | Required |
| Movement | Existing `p95 ≤33.3 ms`, hitch rate `≤2%` and recovery gates from `docs/perf-qa.md` | Preserve project threshold |

**Important:** the 0.35 ms p95 is an engineering target, not a published or pre-measured claim. If a mobile/tile GPU cannot meet limits or lacks support, keep the option disabled. Shader build failures are failures even if FPS appears high.

### 12.6 GPU availability and QA integrity

Require native hardware WebGPU. The existing browser QA already rejects software/fallback adapters and records many errors. Do not call a SwiftShader run a hardware pass; do not treat a basic `npm test` pass as GPU runtime validation. For a WSL2 setup where Linux Chromium cannot obtain the hardware adapter, use the project `qa:perf:windows` route.

Run:

```bash
npm test
npm run lint
npm run build
npm run qa:postprocessing

# Requires the appropriate dev server and a real hardware WebGPU adapter:
npm run qa:postprocessing:browser -- --headed
npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 12 \
  --settle --drain-seconds 15 --gpuTimings 0 \
  --out tmp/ponlai-pr-c/chunk-cross-pacing.json
npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 12 \
  --settle --drain-seconds 15 --gpuTimings 1 \
  --out tmp/ponlai-pr-c/chunk-cross-gpu.json
```

Where PR B's `run-render-regression-qa.mjs` has been **implemented**, run its baseline and candidate suites; otherwise do not pretend the proposed command exists. Add a focused auto-exposure test suite with exact actual filenames after implementation. A visual QA server may use a different port from the perf runner; check runner docs.

## 13. Implementation sequence — exact order and stop gates

### C.0 — Current-main preflight

- [ ] Verify `main` current HEAD, latest commits, clean checkout and shared worktree status; never reset others' changes.
- [ ] Read `AGENTS.md`, `docs/perf-qa.md`, `docs/rendering/post-processing.md`.
- [ ] Verify PR A **implementation**, not only spec, and PR B deterministic capture/performance baseline availability.
- [ ] Record resolved Three.js version and TSL API compatibility; no automatic downgrade to Ponlai's version.
- [ ] Pin the Ponlai source commit, audit `LICENSE`, file headers and provenance convention before adapting.
- [ ] Capture baseline look and performance before image-affecting changes.

**Stop** if PR B baseline is absent or unreliable. Do not excuse missing capture validation because the algorithm is “correct”.

### C.1 — TSL GPU-ordering proof-of-concept

- [ ] Create a small **non-shipping** scratch probe using the current `PostProcessingGraph` and node builder.
- [ ] Prove one HDR scene render + ordered histogram clear, histogram accumulate, exposure reduce, bloom/tonemap consumers.
- [ ] Prove no GPU readback per frame and no resource hazards, on both TAA and TAAU.
- [ ] Prove two successive frames use the intended previous state and do not read uninitialized buffer memory.
- [ ] Measure compiler pipeline count, GPU passes, workgroups and shader errors.
- [ ] Remove scratch code that was only needed for the experiment.

**Stop** if render pass ordering requires an invasive rewrite. Document exactly what API fails and split the scheduling prerequisite rather than shipping incorrect exposure.

### C.2 — Pure math and settings

- [ ] Add one constants module and pure histogram/adaptation reference modules.
- [ ] Implement **screen-luminance** two-distribution estimator, with valid-count/fallback behavior.
- [ ] Design authored-look-relative target and night/snow bounds; test with CPU fixtures before GPU.
- [ ] Add `autoExposure` default-off settings in `PostProcessingSettings.js`.
- [ ] Add YAML under existing `stylizedSurface.postProcessing`; preserve existing fields.
- [ ] Extend preset, settings serialization and topology tests without enabling feature by default.
- [ ] Add a compact UI toggle/compensation; controls must not rebuild graph for numeric changes.

### C.3 — HDR histogram GPU implementation

- [ ] One histogram resource owner, fixed-grid sample placement, 128-bin workgroup atomic splat.
- [ ] Clear both histograms before accumulation; prove order.
- [ ] Read existing pre-bloom HDR + depth; verify depth sky classification on land, sea, fog and refractive surfaces.
- [ ] Implement two weighted trim means; report count/occupancy and unavailable input.
- [ ] Keep all resources absent in disabled graphs.
- [ ] Add an optional single-shot async diagnostic histogram readback for tests only, with generation safety; **never** per frame.
- [ ] Verify shader code and generated WGSL with current Three.js TSL, native WebGPU.

### C.4 — GPU EV state and reset

- [ ] Implement exact damped filter and one-texel persistent state.
- [ ] Bind authored base, look/night bounds, offset and timestep consistently.
- [ ] Snap on first frame and relevant hard cuts; smooth on normal weather/streaming transitions.
- [ ] Add explicit policy for tab resume, teleports, rebase, world change, FOV and graph rebuild.
- [ ] Ensure a failed frame cannot swap the EV state index as if the write succeeded.
- [ ] Ensure disposal and device-loss handling is safe and idempotent.

### C.5 — Single exposure factor in bloom and tone mapping

- [ ] Wire the **same** GPU factor to both [D3] bloom prefilter and [D2] tone mapping.
- [ ] Preserve current ordering; no new tone map, no second output transform.
- [ ] Preserve existing manual controls and authored `sceneExposure.scale`.
- [ ] Verify normal `NoToneMapping` and post-disabled behavior.
- [ ] Verify toneCurve, DOF and SSR do not gain accidental additional exposure.
- [ ] Feature off produces the exact old image and no hidden compute work.

### C.6 — Browser visual and performance review

- [ ] Capture day, night, snow, coast, forest, storm and dense-settlement A/B with PR B protocol.
- [ ] Measure and graph EV, EV target and per-frame response; compare CPU reference.
- [ ] Test teleport, rebase, resize, TAAU scale, sky preset change and failure fallback.
- [ ] Run standard `npm test`, `npm run build`, lint, post-processing browser QA and hardware movement matrix.
- [ ] Review screenshots/contact sheets and worst spatial differences manually.
- [ ] Record actual GPU compute cost or admit that only whole-frame cost was measurable.
- [ ] Keep hardware/mobile-off gates explicit.

### C.7 — Review, commit, rollback record

- [ ] Check no unrelated shaders, water/terrain/world data, asset manifests or dependencies changed.
- [ ] Ensure provenance ledger records exact upstream source/commit and nature of adaptation, retaining MIT notices if closely translated code was used.
- [ ] Confirm no third-party assets imported.
- [ ] Commit only relevant small files to `main` after reviewing the diff. No GitHub Actions.
- [ ] Document disabled-by-default release posture, known limitations and follow-up to PR D.

Suggested implementation commit title:

```text
feat(render): add optional GPU HDR histogram auto exposure
```

Do not label a code commit complete if the QA and GPU-ordering gates are unverified; document precisely what's blocked instead.

## 14. Risks, remedies and rollback

| Risk | Why this project is exposed | Mitigation / rollback |
| --- | --- | --- |
| Ponlai meter cannot be ported directly | Different scene MRT/material and FrameGraph architecture | Screen-space source; no `meterLight` material rewrite |
| New histogram duplicates scene render | RenderPipeline scheduling is unlike Ponlai's frame graph | C.1 explicit proof; stop if one-draw invariant fails |
| GPU storage read/write race | Compute clear/accumulate/reduce dependencies | Explicit ordered passes, debug validation and deterministic tests |
| Wrong depth sky classification | Sky depth writes disabled; water can have special depth | Inspect actual depth encodings on all scene classes; fallback/disable |
| Auto-exposure cancels authored snow look | Base scene exposure is intentionally non-neutral | Relative scene/look bounds and snow A/B gates |
| Dark night becomes bright daylight | Screen-luminance meter is albedo/view dependent | Night anchor, positive-EV cap and lamp-region QA |
| Bloom visually overexposed twice | Bloom prefilter already multiplies HDR by exposure | Shared factor; exposed bloom added without rescaling |
| Scene/bloom disagree by one frame | Meter scheduled after one consumer | Shared EV version for both; test per-frame |
| History resets create brightness flash | TAA invalidation reused blindly as EV snap | Dedicated reset policy, canonical rebase test |
| TAAU causes histogram shimmer | Changing scene resolution / jitter | Fixed UV sample grid; stable source; EV jitter diagnostics |
| Half-float under/overflow | Drusniel lacks Ponlai preExposure `P` | Bin occupancy checks and controlled fallback; no scope creep |
| Captured first frame contains unready pipeline | Existing QA uses warmup/settle, not perfect GPU compilation introspection | PR B source/readiness checks + independent A/A |
| GPU timestamp profiler misses compute | Current `GpuPassProfiler` covers render passes only | True compute scope/whole-frame A/B; explicit “unknown” |
| Mobile or fallback backend cannot run shader | WebGPU device feature/resource differences | Default-off, capabilities check, existing fallback |
| Graph failure leaves renderer in neutral tone mode | Post controller temporarily owns renderer output | Existing `try/finally` restore; unit tests |
| New resources survive enable/disable | Cached graph topology/resource reuse | Clear ownership, generation invalidation, idempotent dispose |
| Shared main receives unrelated commits | Concurrent code improvements | Reinspect HEAD and patch only current owners; no force push |
| Unlicensed code/asset | Copying Ponlai without file inspection | Provenance and MIT notice audit; no assets |

**Rollback:** switch `autoExposure.enabled: false` in the authoritative post-processing settings to restore exact existing rendering; if the implementation itself corrupts the graph or backend, revert the focused commit. A disabled mode must not merely multiply by 1 while still running compute: it should compile the original graph and allocate no feature resources.

## 15. Explicit acceptance checklist / definition of done

### Algorithm and colour
- [ ] Existing HDR scene pass used once; no second render of the world.
- [ ] Luminance metered from **linear HDR**, never display sRGB, vignette or grain.
- [ ] Two validated distributions (foreground and highlight), with documented screen-luminance limitation.
- [ ] Percentile trim correct and deterministic; invalid/missing samples safe.
- [ ] Authored base exposure and snow/night look preserved.
- [ ] EV smoothing finite, frame-rate independent and free from obvious pumping.
- [ ] Current EV and target visible through trustworthy diagnostic fields.
- [ ] Bloom and tonemap consume the same exposure factor and the same EV state generation.
- [ ] No tone-mapping/output colour conversion rewrite.
- [ ] Disabled output matches current main.

### Architecture
- [ ] Current Three.js r187+ actual API compatibility verified; no fake imported APIs.
- [ ] Histogram compute ordering validated on native WebGPU with no data races.
- [ ] No unnecessary per-material MRT, no physically based lighting system rewrite.
- [ ] Existing post controller owns lifecycle/fallback.
- [ ] Topology signature contains effect enable; uniform-only values do not rebuild.
- [ ] No CPU/GPU sync or readback on per-frame path.
- [ ] Workgroup/buffer/texture allocation is bounded and disposed.
- [ ] No GPU allocations or compute when disabled, including mobile.
- [ ] YAML/defaults/normalization and UI follow existing owners; current saves remain valid.
- [ ] No duplicated subsystem, extra dependencies or GitHub Actions.

### Validation
- [ ] PR B deterministic A/A and performance baseline exists or is explicitly completed first.
- [ ] CPU math unit tests pass.
- [ ] Browser shader compile, post modes and history reset tests pass.
- [ ] Night forest, night town, snow, glacier, coast, forest shadow, sunset and storm validated.
- [ ] Real WebGPU hardware, adapter, viewport, effective settings and source SHA recorded.
- [ ] TAA/TAAU temporal jitter measured and bounded; camera cut/rebase tested.
- [ ] Existing p95/hitch/collision/recovery gates unchanged and passing.
- [ ] GPU cost/latency reported accurately, including compute visibility limitations.
- [ ] Clear fallback/disposal/error tests; no repeated per-frame errors.
- [ ] Provenance updated with precise upstream origin if source closely adapted.
- [ ] Diff reviewed; code and document committed to `main` without overwriting newer work.

**PR C fails** if the GPU ordering is unproven, extra scene rendering is introduced, dark/snow looks are flattened, the bloom path doubles the exposure, HDR histograms are silently read from the prior/undefined frame, raw GPU timings are fabricated, or “disabled” still incurs rendering work.

## 16. PR D handoff

PR D will use the stable, measured `effectiveExposureNode` and the **same** HDR source to implement:

1. **Optional local tone mapping** using edge-aware luminance base/detail and spatially localized shadow/highlight compression (Ponlai `LocalTone.ts`). Must not brighten every dark pixel equally or introduce halos on silhouettes.
2. **Optional Purkinje/low-light colour appearance** from [P10] with a physical-light-aware scale or documented authored-look proxy, **not** from previous-frame exposure. No feedback loop through histogram.
3. Test blue-shift/night legibility under sky and local light, snow shadows and bright lamps; preserve game art intent.
4. Integrate into the existing graph; no second tone curve or new post-processing controller.

PR D must not be used to compensate for a broken or uncalibrated PR C exposure target.

## 17. Immutable references — Drusniel code (D)

The links are to the exact Drusniel revision inspected, not floating `main`.

- **[D1]** [`src/render/postprocessing/PostProcessingGraph.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingGraph.js#L1-L210) — `PostProcessingGraph`, `scenePass`, MRT attachments, HDR stage, `resolvedOutput`, bloom and tone mapping; [`updateUniforms`, `resize`, `dispose`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingGraph.js#L211-L340).
- **[D2]** [`src/render/postprocessing/nodes/ToneMappingNode.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/nodes/ToneMappingNode.js#L1-L115) — `toneMappingConstantForMode`, `toneMappingAdjustmentsReference`, `ToneMappingNode` and `updateUniforms`.
- **[D3]** [`src/render/postprocessing/nodes/BloomNode.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/nodes/BloomNode.js#L70-L220) — `sampleLowPass13`, `BloomNode`, exposed `this.exposure` prefilter, knee, pyramids and resize.
- **[D4]** [`src/render/sceneExposure.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/sceneExposure.js#L1-L15) — `sceneExposure.scale` and `scaledToneMapping`.
- **[D5]** [`src/editor/stylized/StylizedSkyView.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/editor/stylized/StylizedSkyView.js#L440-L495) — `applyLook`, authored scene exposure, sky compensation and `update`; [sky material and depth-write behavior](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/editor/stylized/StylizedSkyView.js#L180-L246).
- **[D6]** [`src/render/postprocessing/PostProcessingController.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingController.js#L1-L230) — graph owner, failure/restore, history, precompile and frame update; [`render`/`dispose`/`invalidate`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingController.js#L230-L350).
- **[D7]** [`src/render/postprocessing/PostProcessingHistory.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingHistory.js#L1-L190) — TAA/SSR validity, ping-pong history, reset counters and disposal.
- **[D8]** [`src/render/postprocessing/PostProcessingSettings.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingSettings.js#L1-L205) — immutable defaults and validation ranges; [`normalizePostProcessingSettings` and store](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingSettings.js#L206-L510).
- **[D9]** [`src/render/postprocessing/PostProcessingPresets.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingPresets.js#L1-L215) — `preserveArtistic`, preset application and quality tiers.
- **[D10]** [`src/editor/settings/PostProcessingSettingsPanel.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/editor/settings/PostProcessingSettingsPanel.js#L1-L230) — `SECTIONS`, `createPostProcessingSettingsPanel`, UI controls.
- **[D11]** [`docs/rendering/post-processing.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/docs/rendering/post-processing.md#L1-L115) — explicit MRT material-data contract and warning not to set per-material `material.mrtNode`.
- **[D12]** [`src/render/postprocessing/PostProcessingFrameState.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingFrameState.js#L1-L170) — per-frame deltaSeconds, current/render sizes, projection and temporal jitter.
- **[D13]** [`src/render/postprocessing/nodes/PostCommon.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/nodes/PostCommon.js#L1-L115) — `createPostProcessingTopologySignature` and effect identity.
- **[D14]** [`src/render/postprocessing/PostProcessingInvalidation.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingInvalidation.js#L1-L133) — hard reset and short reactive events, canonical rebase reason.
- **[D15]** [`scripts/run-post-processing-browser-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/scripts/run-post-processing-browser-qa.mjs#L83-L170), [`runCase`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/scripts/run-post-processing-browser-qa.mjs#L316-L399) — existing PP preset, screenshot, GPU/browser-error, history and graph QA.
- **[D16]** [`scripts/fixtures/environment-look-shots.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/scripts/fixtures/environment-look-shots.json#L1-L80), [`scripts/run-environment-look-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/scripts/run-environment-look-qa.mjs#L1-L135) — captured biomes, hours, weather, sky data and semantic look gates.
- **[D17]** [`src/editor/performance/qa/GpuPassProfiler.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/editor/performance/qa/GpuPassProfiler.js#L1-L110) — existing sampled render-pass-only timestamps, does not measure all compute.
- **[D18]** [`package.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/package.json) and [`package-lock.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/package-lock.json) — current dependency range and resolved dependency data.
- **[D19]** [`vite.config.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/vite.config.js#L1-L32) — Vite deduplication/`three/webgpu` alias.
- **[D20]** [`editor.config.yaml`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/editor.config.yaml) — authoritative `stylizedSurface.postProcessing` authoring block.
- **[D21]** [`src/render/postprocessing/PostProcessingDiagnostics.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/9b04e91f6c21df1771ead919f0313ff7c0b4799e/src/render/postprocessing/PostProcessingDiagnostics.js#L1-L115) — existing graph/history and optional aggregate timing status.

## 18. Immutable references — Ponlai code (P)

- **[P1]** [`packages/render/post/Metering.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Metering.ts#L1-L100) — exact two-histogram mathematical design and constants; [`Metering` buffer, GPU clear, workgroup atomics](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Metering.ts#L100-L190); [`buildMeter`, `clearPass`, `histogramPass` and `meterPass`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Metering.ts#L190-L310).
- **[P2]** [`packages/render/post/Exposure.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Exposure.ts#L1-L105) — target mathematics, sky window and exact critically damped adaptation; [`exposureTarget`/`exposureAdapt`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Exposure.ts#L105-L158).
- **[P3]** [`packages/render/post/PreExposure.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/PreExposure.ts#L1-L205) — whole-stop half-float pre-exposure contract, readback lifecycle and resets. **Reference only; out of scope.**
- **[P4]** [`packages/render/lighting/MeterLight.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/MeterLight.ts#L1-L100) — albedo-independent incident irradiance accumulation and `material.mrtNode` merge. **Incompatible with existing Drusniel MRT policy; do not copy.**
- **[P5]** [`packages/render/post/PipelinePasses.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/PipelinePasses.ts#L1-L225) and [metering pass declarations](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/PipelinePasses.ts) — custom frame-graph pass scheduling and metering dependencies. Contains an **explicit third-party tidewater MIT attribution** near the file header, so inspect notices if any code is adapted.
- **[P6]** [`packages/render/post/Pipeline.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Pipeline.ts) — frame graph, `exposureRead` in scene/pre-exposure units and resource flow.
- **[P7]** [`packages/render/look/ExposureLook.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/look/ExposureLook.ts#L1-L155) — sun/weather exposure keys and authoring system, **not** the same as Drusniel's sky looks.
- **[P8]** [`packages/render/post/TemporalRest.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/TemporalRest.ts#L1-L100) and [`Settled.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Settled.ts#L1-L115) — deterministic rest and readiness lessons, **do not port a second temporal renderer**.
- **[P9]** [`docs/reference/profile-frame.md`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/docs/reference/profile-frame.md#L55-L90) and [`tools/render/profile-frame.mjs`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/render/profile-frame.mjs#L67-L100) — measured GPU timestamp/pacing caveats.
- **[P10]** [`packages/render/post/Purkinje.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Purkinje.ts#L1-L103) — dark/rod colour shift model for PR D, **not PR C**.

### Published background used by Ponlai, not a substitute for inspected source

- [Sé́bastien Hillaire, EGSR 2020 atmospheric scattering](https://sebh.github.io/publications/egsr2020.pdf) — scene lighting/sky context for later PR E, not a ready-made exposure solution.
- [Hajime Patry, *Real-Time Samurai Cinema: Lighting, Atmosphere and Tonemapping in Ghost of Tsushima*, SIGGRAPH 2021](https://advances.realtimerendering.com/s2021/index.html) — motivation for incident-light metering and cinematic grading.
- [Lowe, Critically Damped Ease-In/Ease-Out Smoothing (Game Programming Gems 4, 2004)](https://www.gameenginebook.com/) — conceptual second-order response; Ponlai's implementation is the practical code reference.
- [Three.js WebGPU/TSL documentation](https://threejs.org/docs/#api/en/renderers/webgpu/WebGPURenderer) — verify the **installed revision** and actual current TSL compute/compiler behavior.

---

**Implementation handoff:** The practical first win is **restrained, optional, GPU-only camera exposure in Drusniel's existing post graph**, not a copy of Ponlai's entire physically based illuminance and pre-exposure architecture. Preserve the current art, meter before bloom, share one exposure factor across bloom and tonemap, and refuse to ship until GPU ordering and native hardware A/B evidence are proven.
