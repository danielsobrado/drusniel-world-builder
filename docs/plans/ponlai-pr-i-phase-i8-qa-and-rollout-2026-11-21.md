# PR I phase I.8 — Full QA, performance, visual review and rollout

Part of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-22.md). It follows [I.7](ponlai-pr-i-phase-i7-optics-evaluation-2026-11-21.md). Evidence: [`docs/qa/ponlai-pr-i-phase-i8-2026-11-21/`](../qa/ponlai-pr-i-phase-i8-2026-11-21/).

**Status:** done. **Rollout decision: keep the offshore FFT normals and the long-swell geometry enabled by default** (§8).

## 1. Method

- **Frozen source.** Three other sessions were editing this checkout during the QA, so every browser run used a frozen snapshot of `8bb0106b`, the last PR I commit: `scripts/serve-world-visual-snapshot.mjs 8bb0106b 5217` serves `src`/`config` from git and never reads the working tree. Each manifest records `sourceRevision: 8bb0106b…`.
- **Off without editing the YAML.** `run-coastal-review.mjs --water-patch '{"sea":{"offshoreFft":{"enabled":false,"geometry":{"enabled":false}}}}'` deep-merges into the served water config, which turns off the FFT normals and the long swell together (all of PR I's runtime features).
- **Package checks** ran on a clean `git archive` export of `8bb0106b`, with `node_modules` joined by a junction.
- **Hardware:** RTX 4080, Windows 11, Chromium 151, native WebGPU, 1600×900. Every timing passes the harness's native-foreground check or is rejected.

## 2. Math, shader and equivalence checks (plan §13.1, §13.2)

| Check | Result |
| --- | --- |
| §13.1 math: spectrum, Gaussian modes, DFT oracle, coordinates, filtering, weather, swell modes, blend | Node suites `ocean-fft-*`, `ocean-swell-geometry` pass (in `npm test`) |
| §13.2 real shader builds, in-app on all four tiers | Inspected at 9 poses, on and off (`logs/captures-*.json`) |
| On: plain / refraction water fragment | 16 textures, 13 samplers, 12 varyings / 21, 14, 12; FFT referenced; hashes `a95839db` / `a48570fb` at every pose |
| Off: plain / refraction | 15, 12, 12 / 20, 13, 12: the pre-PR I counts, no FFT reference; hashes `9f1cc5ea` / `6dee5f22` |
| Chunk origins in-app | 42–49 slots per pose, max error 0 |
| Off equivalence | Per phase, the off path was proven byte-identical to its predecessor (I.3 §9, I.4 §9, I.6 §6). Since then the only water-shader changes are I.7's deliberate fixes (reflection gate, foam evolution), which apply on and off alike |

## 3. Package checks

| Check | Result |
| --- | --- |
| `npm run lint` (clean export) | Exit 0 |
| `npm run build` (clean export) | Exit 0, built in 11 s |
| `npm test` (clean export) | 5,066 / 5,071. The 5 failures check binary assets that `git archive` does not carry: Blender GLBs, source-asset signatures, upright bakes, Stonehold export, city kits. The same revision passed 5,071 / 5,071 in the full working tree (I.7 §6) |

## 4. Real scenes, FFT on vs off (plan §13.4)

Using the I.0 pose fixtures, high tier, fixed water clock: 19 captures per side across 8 places. Offshore calm, windy and storm come with their 124.6 / 126.0 / 127.6 s sequences, plus the exposed beach, curved coast, sheltered cove, headland and rocky shore (impact and decay). Both sides: 0 failures, 0 GPU or network alerts.

The FFT side was further covered earlier in PR I:
- synthetic and far-negative positions: the I.3 fixture at −4.2 Mm and +4.2 Mm, and I.6 parity;
- the island and cove control: the I.0 cove pose.

Review (`screenshots/compare-*.png`, off on the left):
- **Open sea:** the FFT adds fine, irregular wind chop where the off sea is smooth between swells. A storm reads the same, since fog and rain dominate.
- **Coasts:** the beach, shallows, foam line, cove interior and rocky shore are indistinguishable between off and on. Offshore past the shelf, the water reads a touch deeper blue with chop, because the added roughness spreads the sky reflection.
- **No contour bands** in either column, thanks to the I.7 reflection fix.

## 5. Native timing: A / A′ / off (plan §9)

`run-coastal-review.mjs --perf`, I.0 benchmark poses and tiers, 5 s settle and 8 s measured. Three runs back to back on the frozen snapshot: on (A), on (A′, the noise floor), off. GPU render p50 / average in ms; the render passes include the water shader and exclude the FFT compute.

| Pose / tier | A | A′ | Off | On − off (p50) |
| --- | --- | --- | --- | --- |
| offshore / high | 3.74 / 3.85 | 3.79 / 3.90 | 3.62 / 3.72 | +0.12–0.17 |
| exposed beach / high | 4.24 / 4.38 | 4.17 / 4.29 | 4.10 / 4.23 | +0.07–0.14 |
| curved coast / high | 4.92 / 5.08 | 4.89 / 5.01 | 4.73 / 4.83 | +0.16–0.19 |
| sheltered cove / high | 5.26 / 5.37 | 5.24 / 5.35 | 4.91 / 5.00 | **+0.33–0.35** |
| offshore / ultra | 3.76 / 3.87 | 3.74 / 3.83 | 3.62 / 3.69 | +0.12–0.14 |
| offshore / medium | 3.37 / 3.45 | 3.36 / 3.43 | 3.36 / 3.50 * | 0 |
| offshore / low | 2.82 / 2.86 | 2.83 / 2.87 | 2.83 / 2.94 | 0 |

\* Rejected: focus was lost 2.9 s into the off/medium timing. It is kept in `logs/perf-off.json`.

- **Noise:** A and A′ agree within 0.07 ms of GPU p50.
- **Frame time:** frame p50 ran 4.5–6.8 ms in all three runs. That is about 1.4 ms above I.6's figures because of CPU contention from the parallel sessions' dev servers, and it is the same in A, A′ and off.
- **Cost on high and ultra:** 0.07–0.19 ms of GPU render at the offshore and open coastal poses. That is the FFT normals, the long-swell vertex modes and the extra binding.
  - The **cove costs 0.33–0.35 ms**, above the plan's provisional 0.2 ms fragment target. The cove view has the most refraction-variant water near the camera.
  - Every pose stays below 6 ms of GPU time, far inside the hard 60 FPS floor (16.7 ms).
- **Medium and low** have no FFT, and their costs equal the off run's.
- **FFT compute:** 0.055 ms plus 0.009 ms of output passes (timestamped, I.2 and I.3; re-measured on the frozen snapshot: 0.055 ms compute plus 0.010 ms output, median).
- **Dispatch accounting:** the in-app counter `oceanFftTransforms` grows by one per frame (4,000–15,000 per run, matching frames), never per slot. Per slot the cost is one vec4 FFT origin plus four vec4 swell origins, written only on descriptor change. 1 vs 49 slots changes nothing in the FFT.

## 6. Lifecycle (plan I.8)

| Behaviour | Evidence |
| --- | --- |
| First load | The FFT controller is built with the view; the binding holds a zero fallback until the first published output; the first weather sample snaps (I.5) |
| Water time freeze, seek, replay | `prepare` skips when the tick, spectrum and field are unchanged (I.2 `clockStates`); the swell reads the absolute clock and seeks back exactly (I.6 test) |
| Speedup | Absolute-time evaluation: any clock rate gives the same field at the same time (I.2 `timeContract`) |
| Downgrade | A tier change reloads the world; the FFT is absent on medium and low (timings above, in-app inspection I.3) |
| Camera rebase | Rebase and teleport pixel-identical (I.3 fixture); chunk origins max error 0 in-app |
| Renderer and device recovery | GPU fixture on the frozen snapshot: all cases pass, 0 validation errors. A second runtime is rejected; WebGL reports unsupported; a simulated device loss fails (the authored sea stays) and then recovers to active with output; no leak across a cycle. Renderer restart: cold start 57 ms, warm reconfigure 13 ms. The report's `source.commit` is the checkout's HEAD; the page itself was served from `8bb0106b` |
| Disabled path | 0 submits, 0 buffers, 0 pipelines, 0 transforms |
| CPU/GPU swell parity | Max height error 5.8e-7 m on heights up to 1.61 m |
| Water acceptance | **Authoritative pass** on the frozen snapshot with the FFT and swell on: 13/13 gates, native focus held, 0 GPU errors. The route reaches 8.13 m depth (63 submerged frames, full underwater blend), surfaces and exits; origin snaps 0; projected caustics active and CPU-bounded (max 0.3 ms). The first focus-verified acceptance run in PR I (earlier ones lost focus) |

## 7. Reviews

**Round 1 — numerical correctness and shader complexity.**
- The coordinates, spectrum, filtering, weather transition and swell parity are all tested and checked on the GPU.
- The shader adds 1 texture and 1 sampler, and no varyings.
- One finding still open, carried from I.6: CPU heights ignore the vertex path's `swing` and ice factors. This is pre-existing, and the swell's weight is 0 where they apply.

**Round 2 — resource lifecycle and performance.**
- One runtime per view, fixed dispatches, no readbacks, zero fallback, guarded uploads.
- The cove's 0.34 ms exceeds the provisional target. Not optimized in this phase: it is inside the 60 FPS floor, and the user-facing gain is large.

**Fixes made during PR I review** (all re-benchmarked above): the I.3 per-frame allocation, I.5's power-not-amplitude transition, I.7's contour-band reflection bug and slow foam.

## 8. Rollout decision

**Keep enabled** (`water.sea.offshoreFft.enabled: true`, `geometry.enabled: true`).

Every functional gate holds:
- correct off path;
- shaders within the app's limits;
- stable at planet scale;
- CPU/GPU swell parity 5.8e-7 m;
- unchanged near shore;
- an authoritative water-acceptance pass.

The quality delta is visible in every open-water scene, and the cost is 0.07–0.35 ms of GPU on high and ultra, nothing on medium and low. Rollback is one setting each.

## 9. Licensing

The Stockham stage scheme and output-pass pattern were adapted from Ponlai `OceanFFT.ts` (MIT, "Copyright (c) 2026 Hubery", pinned `cca90564`). It is now recorded in `THIRD_PARTY_NOTICES.md` (commit `85b9b323`).

## 10. Rejected and retained measurements

- **I.4:** 8 of 12 timings rejected for focus loss (`docs/qa/ponlai-pr-i-phase-i4-2026-11-21/logs/perf-*`).
- **I.4 and I.6 water acceptance:** 13/13 functional gates, but timing not authoritative because of focus loss.
- **I.8:** off/medium (focus).
- **I.7:** the gust-patch experiment's measurements.

All are kept in the phase evidence folders.

## 11. Not verified

- Other GPUs and adapters (AMD, Intel, Apple, software/WebGL): only the RTX 4080 was run.
- A real `GPUDevice.destroy()` device loss (simulated only).
- Swimming in open deep water: the acceptance route is coastal.
