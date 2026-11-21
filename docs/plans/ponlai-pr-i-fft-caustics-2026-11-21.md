# PR I follow-on [P9] — Underwater caustics from the offshore FFT

Follow-on of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-21.md), deferred there by [I.7](ponlai-pr-i-phase-i7-optics-evaluation-2026-11-21.md) to its own PR. Evidence: [`docs/qa/ponlai-pr-i-fft-caustics-2026-11-21/`](../qa/ponlai-pr-i-fft-caustics-2026-11-21/README.md).

**Status:** built, verified and pushed, but **off by default**. `water.sea.offshoreFft.caustics.enabled: false`.
- **Correct and free.** The shader matches its CPU twin on hardware. Off is byte-identical. On, it costs nothing measurable, and water acceptance passes with it on.
- **Invisible on this world.** On the current bathymetry the I.4 geography gives the FFT full weight only on the ~24 m offshore floor. There, water absorption leaves about 6 % of any caustic light, for the web and the FFT alike, so native captures show no difference beyond run-to-run noise (§6).
- **Stop rule.** Under the plan's stop rule (no demonstrated improvement), it ships as a tested option, not a default. §8 lists the two ways it could earn the default.

## 1. Where caustics actually show

The audit found three caustic paths. In the shipped config only one of them is visible:

| Path | Where | Shipped state |
| --- | --- | --- |
| Surface caustic web (`causticWeb`, StylizedWaterMaterial) | Shallows seen from above | `water.caustics.intensity: 0`, so it adds nothing. Offshore, the sea is also opaque from above (I.7 §3), so no bed shows there |
| Projected caustics (`buildProjectedCaustics`) | Underwater, without optics | `projectedCaustics.intensity: 0`, and the optics path replaces it |
| Underwater optics lattice (`godsEndCausticLattice`, UnderwaterOpticsNodes) | The bed seen from underwater, high and ultra | **Live**: `causticStrength 1.4`, fading with depth (`exp(−0.12·depth)`) and within 45 m |

So FFT caustics belong in the underwater optics post. The water material is untouched: its plain variant stays at 16 sampled textures, and every water shader stays byte-identical.

## 2. Design

**Source: refracted-light convergence.** The FFT's slope s = ∇h bends the sun's rays. At bed depth D, a ray lands displaced by δ = a·s, where a = (1 − 1/η)·D (small-slope Snell). A patch of surface therefore maps onto the bed through the Jacobian J = I + a·∂s/∂x, and the bed receives irradiance I = 1/|det J|. A flat sea gives exactly 1; light converges under crests and spreads under troughs.

- **∂s/∂x** comes from forward differences of the FFT output itself: three taps per cascade, six in all, of the slope texture the water already computes. There is no second FFT, no extra pass, no readback and no per-slot work.
- **Added light** is max(I − 1, 0), capped at a focus of 6×, like the web it replaces. |det J| keeps folds bright rather than black.
- **Traced along the sun.** Each bed point samples the surface point whose refracted sun ray lights it: offset = sun.xz / sun.y · D, using the post's refracted sun direction.
- **Bounded resolution, chosen by depth, never by the camera.** Waves focus at a depth that grows with their length, so a fixed fine mip saturates in deep water. In the GPU fixture at 0.5 m, p99 hit the cap at 10 m and the mean was 3–5× the web's. Each cascade samples the mip whose texel is nearest 0.5 m down to 3 m of depth; beyond that the texel grows as √(D/3) (§4). Caustic cells widen with depth, as real ones do.
- **Precision.** The cascade UV origins are the camera's canonical position reduced modulo each tile in double precision on the CPU (`writeCascadeUvOrigins`). The shader adds the bed point's offset from the camera (|offset| ≤ 45 m). No world position reaches f32.
- **Determinism.** The FFT texture is already a function of the absolute water clock (I.2), and it is prepared in `beforeMainRender` before the underwater post draws.

**Use: the I.4 geography, continuous.**

  W = smoothstep(7, 14, bedDepth)            per pixel, from the bed depth the post reconstructs
    · smoothstep(24, 40, shore) · exposure · ocean · coverage · available     at the camera, per frame (CPU)

The second line is exactly `offshoreFftWeight` without its depth factor, evaluated on the CPU twins (`getCanonicalWater`, `sampleWorldStoreSeaExposure`). The bed's caustic pattern is `mix(web, fft·strength, W)`. Every factor is C¹, so there is no seam. `available` is 0 until the FFT publishes and after it fails, and then only the web shows.

**Lifetime.** The post owns its own `OceanFftBinding` and mirrors the surface view's live output every frame (`OceanFftBinding.mirror`). A tier change disposes the surface view's binding, but the post never points at a disposed texture, and swapping the value keeps the layout, so nothing recompiles.

**Off switch.** `water.sea.offshoreFft.caustics: { enabled, strength }`, validated by `resolveOffshoreFft`, with unknown keys rejected. Off, or with no FFT on the tier or backend (low, medium, WebGL), no caustic node is built and the underwater shader is the original (§5).

## 3. Files

| File | Change |
| --- | --- |
| `src/editor/water/fft/OceanFftCaustics.js` (new) | Levels, lever, Jacobian excess (TSL and CPU twin), camera weight |
| `src/editor/water/fft/OceanFftConfig.js` | `caustics` group, validated |
| `src/editor/water/fft/OceanFftSampling.js` | `OceanFftBinding.mirror` |
| `src/editor/water/UnderwaterOpticsNodes.js` | `fftCaustics` input; the web expression is unchanged when it is null |
| `src/editor/water/UnderwaterCausticsPostProcess.js` | Builds the FFT caustic inputs with the pipeline; per-frame mirror, origins, camera weight |
| `src/editor/water/UnderwaterViewController.js` | Passes the live binding, the settings and the geography query |
| `src/editor/water/TerrainWaterQueries.js` | `getCanonicalOffshoreGeography` (CPU inputs of the I.4 weight) |
| `config/water-visual.yaml` | `offshoreFft.caustics: { enabled: false, strength: 1 }` |
| `test/ocean-fft-caustics.test.js` (new) | Pure parts: levels, depth level, lever, Jacobian, camera weight, config, wiring |
| `scripts/ocean-fft-qa/caustics.js` (new), `main.js`, `scripts/run-ocean-fft-qa.mjs` | GPU fixture case `fftCaustics` |
| `scripts/lib/ocean-fft-scene.mjs` | The in-app inspection also hashes the underwater post's fragment WGSL |
| `scripts/run-fft-caustics-review.mjs` (new) | Native underwater captures and perf, caustics off/on |

## 4. GPU fixture (`npm run qa:ocean-fft`, case `fftCaustics`)

RTX 4080, Chromium, native WebGPU, three r187; [`logs/ocean-fft-qa-report.json`](../qa/ponlai-pr-i-fft-caustics-2026-11-21/logs/ocean-fft-qa-report.json).

- **Parity.** One cascade at a time, at texel centres and level 0, so every tap is exactly one texel. The shader's excess matches `causticExcessCpu` computed on the read-back RG16F layer within **1.5e-6** (cascade 0, 272 of 512 points lit) and **5.5e-6** (cascade 1, 236 lit).
- **No FFT.** With the binding on its fallback, the excess is exactly 0.
- **Every other case** still passes, with 0 validation errors. The one console error is the fixture's deliberate device-loss simulation.

**Calibration at the shipped levels** (48 m × 48 m patch, t = 126 s, 10 m/s reference wind; the web is the shipped 5.5 m lattice):

| Bed depth | FFT mean | FFT p99 | Lit share (> 0.25) | Web mean |
| --- | --- | --- | --- | --- |
| 3 m | 0.071 | 0.46 | 7.7 % | 0.181 |
| 7 m | 0.114 | 0.77 | 17.4 % | 0.181 |
| 10 m | 0.149 | 1.08 | 22.0 % | 0.181 |
| 14 m | 0.190 | 1.50 | 26.4 % | 0.181 |
| 20 m | 0.220 | 1.75 | 28.3 % | 0.181 |

Across the blend band (7–14 m), the FFT network's mean light is 0.11–0.19 against the web's 0.18. So at `strength: 1` the cross-fade keeps the bed's average brightness, and only the pattern changes. Nothing reaches the cap in this band.

Rejected texel growth laws, from the same fixture:

| Texel growth with depth | Mean at 10 m / 14 m | p99 at 14 m | Verdict |
| --- | --- | --- | --- |
| Fixed 0.5 m | 0.48 / 0.90 | 5.0 (cap) | Folds into noise; 3–5× the web |
| ∝ D | 0.050 / 0.038 | 0.24 | Fades out with depth |
| **∝ √D** (shipped) | 0.149 / 0.190 | 1.50 | Bounded, comparable to the web |

## 5. Shader proof: off is byte-identical

These are fragment WGSL hashes read from the cached pipelines at the I.0 offshore pose (`run-coastal-review --ocean-fft-inspect`). The baseline is `8bb0106b`, served frozen. Off and on are this change, served frozen; `--water-patch` sets the switch.

| Tier | Shader | Baseline | Caustics off | Caustics on |
| --- | --- | --- | --- | --- |
| high | underwater post | 2 textures, `274b91bb` | 2, **`274b91bb`** | 3, `c63819d8` |
| ultra | underwater post | 2, `2be89d4b` | 2, **`2be89d4b`** | 3, `d85e5f29` |
| high | water plain / refraction | 16 `a95839db` / 21 `a48570fb` | identical | identical |
| ultra | water plain / refraction | 16 `2b90c273` / 21 `42e2018f` | identical | identical |

- **Off:** the underwater post equals the baseline on both tiers.
- **On:** the post gains one sampled texture, the FFT array (3 against WebGPU's 16 per stage).
- **Water shaders** are untouched in every case; the plain variant stays at 16.
- **In-app state, on:** the FFT is available, the camera weight at the offshore pose is 1, and the cascade levels are [0, 2].

## 6. Native underwater captures, before and after

RTX 4080, Chromium, native WebGPU, 1600×900, high tier, water clock frozen at 126.0 s (`scripts/run-fft-caustics-review.mjs`, frozen snapshot server). The player dives to the bed with the dive key held, so buoyancy cannot move the pose. Variants: web (off), FFT (on), and web again (A/A).

**Where the FFT can own the bed.** A bathymetry scan (`logs/bathymetry-scan.txt`) found the same profile on every coast: a 30–40 m shelf, then a flat floor at 23–24 m. Depth follows shore distance (7.5 m at 22 m out, 11.8 m at 30 m, 19.5 m at 40 m). The I.4 geography needs depth ≥ 7–14 m **and** shore distance ≥ 24–40 m, so it reaches full weight only on the 24 m floor, where the caustic reach `exp(−0.12·depth)` is 0.056.

| Pose | Bed depth / shore distance at the camera | FFT state |
| --- | --- | --- |
| `offshore-bed`: open floor, looking seaward | 24.0 m / 48 m | available, camera weight 1 |
| `shelf-toe`: foot of the shelf, looking up the slope to 7 m | 22.4 m / 43.9 m | available, camera weight 1 |

Mean absolute RGB difference (0–255), from `image-diff.mjs`:

| Pose | Full frame A/A (web vs web) | Full frame A/B (web vs FFT) | Lower third A/A | Lower third A/B | Lower-third mean brightness |
| --- | --- | --- | --- | --- | --- |
| offshore-bed | 8.12 | 8.14 | 6.49 | 6.50 | ≈ 5 |
| shelf-toe | 7.54 | 7.72 | 3.87 | 3.94 | ≈ 5 |

The A/B differences equal the A/A noise. That noise is the animated light shafts, which run on the render clock rather than the water clock. The bed itself is near black (≈ 5/255) at this depth with either pattern. The screenshots are in `screenshots/`.

## 7. Performance and acceptance

**Underwater A/B/A**, same run, poses as in §6, uncapped (vsync and the frame limit off), 10 s per variant. All six timings passed the Windows native foreground check, and the player stayed submerged throughout.

| Pose | Variant | Frame p50 / p95 / p99 (ms) | GPU p50 (ms) |
| --- | --- | --- | --- |
| offshore-bed | web | 4.1 / 5.3 / 6.4 | 2.797 |
| offshore-bed | **FFT** | 4.3 / 5.6 / 6.7 | 2.798 |
| offshore-bed | web again | 4.4 / 6.0 / 7.2 | 2.788 |
| shelf-toe | web | 5.4 / 6.6 / 7.7 | 3.281 |
| shelf-toe | **FFT** | 5.4 / 6.9 / 7.8 | 3.273 |
| shelf-toe | web again | 5.3 / 6.8 / 8.3 | 3.261 |

The FFT variant falls inside the A/A spread on every statistic. The six extra texture taps and the Jacobian are not measurable next to the post's existing lattice and the scene pass. Above water the post is not drawn, so the surface frame is unaffected by construction. The water shaders are byte-identical (§5).

**Water acceptance**, `npm run qa:water:acceptance -- --headed` against the frozen snapshot with caustics **on** (`logs/water-acceptance-caustics-on.json`):
- **Pass**: performance-authoritative, with native foreground focus held.
- **Frames:** p95 11.1 ms, hitch rate 0.001, 0 GPU validation errors.
- **Route:** submerged for 59 frames.
- **Projected caustics:** active for 4,949 frames; post CPU at most **0.30 ms**, which includes the new per-frame camera query and cascade origins.

## 8. Not done, and what would change the verdict

- **Visible benefit.** The verdict is "no demonstrated improvement", so the default stays off. Either of two things would change it:
  - **Bathymetry** with open, exposed sea over a 5–14 m bed, for example reefs or banks offshore. The FFT would then own beds that are shallow enough to show light.
  - **A design change:** give caustics their own geography (for example depth 3–12 m without the shore-distance factor), so the FFT drives caustics on the shelf too. That decouples caustics from the sea surface the player sees there (authored surf, not the FFT), and it is a call for the owner, not this PR.
- **The light shafts** move on the render clock, not the water clock, so underwater A/B captures carry their motion as noise. Freezing them for QA would sharpen future underwater comparisons.
- **Only shipped bathymetry was tested.** The mid-depth behaviour is covered by the GPU fixture statistics (§4), not by in-app captures.
- **Single GPU** (RTX 4080).

