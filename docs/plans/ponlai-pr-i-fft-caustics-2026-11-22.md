# PR I follow-on [P9] — Underwater caustics from the offshore FFT

Follow-on of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-22.md), deferred there by [I.7](ponlai-pr-i-phase-i7-optics-evaluation-2026-11-21.md) to its own PR. Evidence: [first iteration](../qa/ponlai-pr-i-fft-caustics-2026-11-21/README.md) (I.4 geography) and [shelf iteration](../qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/README.md).

**Status:** built, verified and pushed, but **off by default**. `water.sea.offshoreFft.caustics.enabled: false`.
- **Correct and free.** The shader matches its CPU twin on hardware. Off is byte-identical. On, the GPU cost is within noise. Water acceptance passed with the first iteration on. For the shelf iteration every functional gate passes, but its run lost foreground focus, so the timing is not authoritative (§8).
- **Visible now, but not clearly better.** The first iteration followed the I.4 offshore geography, which put the FFT only on the ~24 m floor, where it was invisible (§6). On 2026-11-22 caustics got their own geography, a 2–6 m bed-depth band on any ocean water, and a finer texel law for the shelf (§2, §8). On a 7 m shelf plateau the FFT now draws soft, wind-aligned bands at the web's average brightness. They are broader and less crisp than the web's thin lines: a different look in stills, not a demonstrated improvement.
- **Stop rule.** It ships as a tested option. Turning it on is an art call (§9).

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
- **Bounded resolution, chosen by depth, never by the camera.** Waves focus at a depth that grows with their length, so a fixed fine mip saturates in deep water, and a coarse one filters out the short waves that focus on the shelf. The texel is 0.25 m to 3 m of depth, grows ∝ D until it meets 0.5·√(D/3) at 12 m, then follows that (`causticTexel`). Each cascade's level is continuous, log2(texel / its texel), clamped to its mips. The GPU fixture holds the mean excess at 0.15–0.17 from 3 m to 20 m, against the web's 0.18 (§4). Caustic cells widen with depth, as real ones do.
- **Precision.** The cascade UV origins are the camera's canonical position reduced modulo each tile in double precision on the CPU (`writeCascadeUvOrigins`). The shader adds the bed point's offset from the camera (|offset| ≤ 45 m). No world position reaches f32.
- **Determinism.** The FFT texture is already a function of the absolute water clock (I.2), and it is prepared in `beforeMainRender` before the underwater post draws.

**Use: a caustic depth band, continuous.**

  W = smoothstep(2, 6, bedDepth)        per pixel, from the bed depth the post reconstructs
    · ocean · coverage · available       at the camera, per frame (CPU)

The bed's caustic pattern is `mix(web, fft·strength, W)`. The band is `caustics.depthStartMeters` / `depthEndMeters`. Every factor is C¹, so there is no seam. `available` is 0 until the FFT publishes and after it fails, and then only the web shows. The web keeps the surf-zone shallows and all inland water.

*Why not the I.4 geography.* The first iteration used W = smoothstep(7, 14, bedDepth) · smoothstep(24, 40, shore) · exposure (`offshoreFftWeight` without its depth factor). Every coast of this world is a 30–40 m shelf dropping to a 23–24 m floor, so that weight is 1 only on the floor, where `exp(−0.12·depth)` leaves 6 % of any caustic light (§6). The trade-off of the band: on the shelf the visible sea surface is the authored coastal sea, not the FFT, so the caustics there do not come from the waves the player sees from below; only the water clock is shared.

**Lifetime.** The post owns its own `OceanFftBinding` and mirrors the surface view's live output every frame (`OceanFftBinding.mirror`). A tier change disposes the surface view's binding, but the post never points at a disposed texture, and swapping the value keeps the layout, so nothing recompiles.

**Off switch.** `water.sea.offshoreFft.caustics: { enabled, strength, depthStartMeters, depthEndMeters }`, validated by `resolveOffshoreFft`, with unknown keys rejected. Off, or with no FFT on the tier or backend (low, medium, WebGL), no caustic node is built and the underwater shader is the original (§5).

## 3. Files

| File | Change |
| --- | --- |
| `src/editor/water/fft/OceanFftCaustics.js` (new) | Texel law, levels, lever, Jacobian excess (TSL and CPU twin), camera weight, depth band |
| `src/editor/water/fft/OceanFftConfig.js` | `caustics` group, validated |
| `src/editor/water/fft/OceanFftSampling.js` | `OceanFftBinding.mirror` |
| `src/editor/water/UnderwaterOpticsNodes.js` | `fftCaustics` input; the web expression is unchanged when it is null |
| `src/editor/water/UnderwaterCausticsPostProcess.js` | Builds the FFT caustic inputs with the pipeline; per-frame mirror, origins, camera weight |
| `src/editor/water/UnderwaterViewController.js` | Passes the live binding, the settings and the geography query |
| `src/editor/water/TerrainWaterQueries.js` | `getCanonicalOffshoreGeography` (ocean and coverage at the camera) |
| `config/water-visual.yaml` | `offshoreFft.caustics: { enabled: false, strength: 1, depthStartMeters: 2, depthEndMeters: 6 }` |
| `test/ocean-fft-caustics.test.js` (new) | Pure parts: levels, depth level, lever, Jacobian, camera weight, config, wiring |
| `scripts/ocean-fft-qa/caustics.js` (new), `main.js`, `scripts/run-ocean-fft-qa.mjs` | GPU fixture case `fftCaustics` |
| `scripts/lib/ocean-fft-scene.mjs` | The in-app inspection also hashes the underwater post's fragment WGSL |
| `scripts/run-fft-caustics-review.mjs` (new) | Native underwater captures and perf, caustics off/on; `--strength`, `--scan` |

## 4. GPU fixture (`npm run qa:ocean-fft`, case `fftCaustics`)

RTX 4080, Chromium, native WebGPU, three r187; [`logs/ocean-fft-qa-report.json`](../qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/logs/ocean-fft-qa-report.json) (all cases pass, 0 validation errors; the one console error is the fixture's deliberate device-loss simulation).

- **Parity.** One cascade at a time, at texel centres and level 0, so every tap is exactly one texel. The shader's excess matches `causticExcessCpu` computed on the read-back RG16F layer within **1.5e-6** (cascade 0, 272 of 512 points lit) and **5.5e-6** (cascade 1, 236 lit).
- **No FFT.** With the binding on its fallback, the excess is exactly 0.

**Calibration at the shipped law** (48 m × 48 m patch, t = 126 s, 10 m/s reference wind; the web is the shipped 5.5 m lattice):

| Bed depth | Texel | FFT mean | FFT p99 | Lit share (> 0.25) | Web mean |
| --- | --- | --- | --- | --- | --- |
| 2 m | 0.25 m | 0.090 | 0.63 | 11.9 % | 0.181 |
| 3 m | 0.25 m | 0.159 | 1.22 | 23.2 % | 0.181 |
| 5 m | 0.42 m | 0.161 | 1.18 | 23.7 % | 0.181 |
| 7 m | 0.58 m | 0.160 | 1.17 | 23.7 % | 0.181 |
| 10 m | 0.83 m | 0.149 | 1.09 | 22.0 % | 0.181 |
| 14 m | 1.08 m | 0.150 | 1.08 | 22.1 % | 0.181 |
| 20 m | 1.29 m | 0.168 | 1.27 | 24.0 % | 0.181 |

At `strength: 1` the FFT keeps the bed's average brightness at every depth the band covers, and nothing reaches the cap. At 2 m the band gives the FFT no weight yet.

Texel laws compared in the same fixture ([`logs/texel-law-experiment.json`](../qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/logs/texel-law-experiment.json); r = max(D, 3)/3):

| Texel law | Mean at 3 / 7 / 14 / 20 m | p99 at 14 m | Verdict |
| --- | --- | --- | --- |
| Fixed 0.5 m | — / — / 0.90 / — | 5.0 (cap) | Folds into noise at depth; 3–5× the web |
| 0.5 m ∝ D | — / — / 0.038 / — | 0.24 | Fades out with depth |
| 0.5·√r (first iteration) | 0.066 / 0.102 / 0.150 / 0.168 | 1.08 | Too faint on the shelf: invisible in captures at 7 m |
| 0.25·√r | 0.159 / 0.329 / 0.698 / 0.897 | 5.0 (cap) | Visible on the shelf, saturates past 10 m |
| 0.35·√r | 0.096 / 0.188 / 0.319 / 0.456 | 3.0 | Still grows with depth |
| **min(0.25·r, 0.5·√r)** (shipped) | 0.159 / 0.160 / 0.150 / 0.168 | 1.08 | Flat, comparable to the web |

## 5. Shader proof: off is byte-identical

These are fragment WGSL hashes read from the cached pipelines at the I.0 offshore pose (`run-coastal-review --ocean-fft-inspect`). The baseline is `8bb0106b`, served frozen. Off and on are this change, served frozen; `--water-patch` sets the switch. The shelf iteration was re-inspected from a frozen snapshot of `1edafc49`.

| Tier | Shader | Baseline | Caustics off (both iterations) | On, first iteration | On, shelf iteration |
| --- | --- | --- | --- | --- | --- |
| high | underwater post | 2 textures, `274b91bb` | 2, **`274b91bb`** | 3, `c63819d8` | 3, `382b3837` |
| ultra | underwater post | 2, `2be89d4b` | 2, **`2be89d4b`** | 3, `d85e5f29` | 3, `d0404cd` |
| high | water plain / refraction | 16 `a95839db` / 21 `a48570fb` | identical | identical | identical |
| ultra | water plain / refraction | 16 `2b90c273` / 21 `42e2018f` | identical | identical | identical |

- **Off:** the underwater post equals the baseline on both tiers. In the shelf re-inspection the `offshore-calm/high` pose timed out loading (180 s, the GPU was shared); its high-tier sibling `offshore-calm/calm-motion` supplied the high hashes.
- **On:** the post gains one sampled texture, the FFT array (3 against WebGPU's 16 per stage).
- **Water shaders** are untouched in every case; the plain variant stays at 16.
- **In-app state, on:** the FFT is available, the camera weight is 1, and the cascade levels are [−0.84, 1.05] (cascade 0 clamps to its base mip until the texel law reaches it).

## 6. First iteration (I.4 geography, 2026-11-21): native captures

RTX 4080, Chromium, native WebGPU, 1600×900, high tier, water clock frozen at 126.0 s (`scripts/run-fft-caustics-review.mjs`, frozen snapshot server). Evidence in [`docs/qa/ponlai-pr-i-fft-caustics-2026-11-21/`](../qa/ponlai-pr-i-fft-caustics-2026-11-21/README.md). The player dives to the bed with the dive key held, so buoyancy cannot move the pose. Variants: web (off), FFT (on), and web again (A/A).

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

## 7. First iteration: performance and acceptance

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

## 8. Shelf iteration (2026-11-22): native captures, performance, acceptance

Same rig and frozen water clock as §6; evidence in [`docs/qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/`](../qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/README.md). A scan of one coast (`logs/shelf-bathymetry-scan.txt`) found a 7 m plateau 20 m out and a slope from 1 m to 24 m over about 40 m.

| Pose | Bed depth / shore distance at the camera | FFT state |
| --- | --- | --- |
| `shelf-plateau`: 7 m plateau, looking toward the beach over 7–2 m beds | 8.0 m / 22 m | available, camera weight 1 |
| `shelf-slope`: mid-slope, looking up it to 1 m | 13.3 m / 29.7 m | available, camera weight 1 |

**What changes on screen.** The steps, at `shelf-plateau` (the `stretch.mjs` crops show the bed with levels ×5):
- **Shelf band alone, old 0.5·√r texel:** the FFT draws nothing visible, where the web shows thin lines.
- **Strength 2.5:** broad bands appear, 1–3 m wide.
- **Shipped law:** soft, wind-aligned bands across the 4–8 m bed at the web's average brightness. They are broader and less crisp than the web's lines.
- **Up the slope:** both patterns are faint against the deeper bed.

Mean absolute RGB difference (0–255):

| Pose | Full frame A/A (web vs web) | Full frame A/B (web vs FFT) | Lower third A/A | Lower third A/B | Lower-third mean, web / FFT / web |
| --- | --- | --- | --- | --- | --- |
| shelf-plateau | 7.79 | 10.66 | 5.05 | 5.69 | 35.5 / 36.0 / 34.3 |
| shelf-slope | 10.17 | 8.92 | 4.79 | 3.64 | 16.7 / 17.3 / 18.5 |

On the plateau the A/B difference exceeds the A/A noise (the light shafts): the change is real there. On the slope it is inside the noise. The bed is lit at 16–36/255 here, against ≈ 5/255 on the 24 m floor (§6).

**Underwater A/B/A**, same run, uncapped, 10 s per variant. All six timings passed the Windows native foreground check, and the player stayed submerged throughout.

| Pose | Variant | Frame p50 / p95 / p99 (ms) | GPU p50 (ms) |
| --- | --- | --- | --- |
| shelf-plateau | web | 8.2 / 11.5 / 15.5 | 3.831 |
| shelf-plateau | **FFT** | 8.2 / 13.1 / 15.9 | 3.649 |
| shelf-plateau | web again | 5.2 / 6.6 / 7.9 | 3.526 |
| shelf-slope | web | 5.9 / 7.5 / 10.4 | 3.460 |
| shelf-slope | **FFT** | 8.1 / 12.1 / 15.0 | 3.214 |
| shelf-slope | web again | 4.8 / 6.7 / 8.0 | 3.339 |

GPU p50 for the FFT sits inside the web runs' spread at both poses. The shader is the same six taps and Jacobian as §7, plus one `min`. Frame times were noisy in this run: the shared machine ran other sessions' QA between the lock-held runs, and even the A/A pair differs by up to 3 ms at p50. The frame-time cost is therefore not resolved here. The clean first-iteration run (§7) and the GPU timings both put it within noise.

**Water acceptance** with caustics **on** (`npm run qa:water:acceptance -- --headed`, frozen snapshot `e35fbb06`; [`logs/water-acceptance-caustics-on.json`](../qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/logs/water-acceptance-caustics-on.json)): **every functional gate passes, but the run is not performance-authoritative**, so the overall result is `pass: false`.
- **Gates (all pass):** route found, water entered, swimming reached, submerged for 58 frames, surfaced, returned dry, body identity and floating origin stable, projected caustics active for 5,562 frames with post CPU at most **0.30 ms**, frame p95 **10 ms**, hitch rate 0.0009, 0 GPU validation errors.
- **Not authoritative:** the browser lost native foreground focus about 3.4 s into the run, when another desktop window came to the front. An earlier attempt aborted at route discovery for the same reason, when the user's Chrome took focus. A focus-held acceptance run for this iteration needs an idle desktop. The first iteration passed one with the same post path (§7).

## 9. Not done, and what would change the verdict

- **The art call.** On the shelf the FFT now visibly changes the bed: moving, wind-driven bands in place of the authored lattice, at the same average light. Whether that reads better in motion is for the owner to judge. To try it, set `caustics.enabled: true`; raise `strength` for bolder bands.
- **Crisper lines** would need detail the bounded texel deliberately filters out. A 0.25 m texel at every depth saturates past 10 m (§4). A camera-footprint term, to resolve finer only near the camera, is the next lever. It would need its own aliasing check in motion.
- **Surface mismatch on the shelf.** The surface above the shelf is the authored coastal sea, not the FFT (§2).
- **The light shafts** move on the render clock, not the water clock, so underwater A/B captures carry their motion as noise.
- **A focus-held water acceptance run** for the shelf iteration (§8).
- **Still captures only**, at one water time. Motion and temporal stability were not measured.
- **Single GPU** (RTX 4080).
