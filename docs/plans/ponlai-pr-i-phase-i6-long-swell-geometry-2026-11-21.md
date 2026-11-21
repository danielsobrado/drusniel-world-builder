# PR I phase I.6 — Wind-driven long swell as CPU-parity wave geometry

Part of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-21.md). It follows [I.5 weather and stability](ponlai-pr-i-phase-i5-weather-and-stability-2026-11-21.md). Approved separately by the user, as the plan requires for this phase. Evidence: [`docs/qa/ponlai-pr-i-phase-i6-2026-11-21/`](../qa/ponlai-pr-i-phase-i6-2026-11-21/README.md).

**Status:** done and enabled (`water.sea.offshoreFft.geometry.enabled: true`).

- The open sea now has real wave height from a **wind-driven long swell**: 16 deterministic Fourier modes, 48–160 m.
- The CPU water query used by gameplay and the vertex shader evaluate the same modes, amplitudes and water clock. They agree to **0.6 µm** on hardware.
- There is no GPU readback and no per-query FFT, and the authored waves are untouched.

## 1. Design (plan §6.6, Strategy A)

**Why not the dense FFT.** The 128² FFT runs on the GPU only. Using its height would leave `seaSurfaceOffset` (swimming, wading, collisions) on different waves, which the plan rejects. Reading it back each frame would stall, and evaluating 32k modes per CPU query is far too slow.

**What instead.** A sparse set of K = 16 modes that both sides can evaluate in O(K):

| | |
| --- | --- |
| Band | λ 48–160 m: longer than the longest authored carrier (42 m) and the FFT normals (≤ 7.5 m), so no wave energy is counted twice |
| Modes | 4 log-spaced bins (seeded wavelength inside each: 145, 109, 77, 58 m) × 4 directions 90° apart (seeded rotation per bin), seeded phases |
| Fixed | Wave number, direction and phase never change, so a weather change can never shift or rotate the field |
| Weather | Only amplitudes change: `a_i = √(2 · V_bin · w_i)`. V_bin is the JONSWAP variance of the bin at the I.5 wind (same `resolveFftWind`, same fetch), and w_i is the Donelan–Banner spreading toward the mode, normalized over the bin's directions. Energy matches the exact band integral within 0.2 % |
| Tempo | Deep-water dispersion × the carriers' 0.55 phase-speed scale, so both swells keep one tempo |
| Time | Each mode's ω·t is taken from the **absolute water clock** in double precision once per frame, so pause, seek and replay are exact |
| Space | Per chunk, each mode's phase at the chunk centre in double precision (like the carriers' origins); the shader adds `k·(local·d)` with \|local\| ≤ 64 m |

**Energy split (plan checklist).** The five carriers keep 100 % of their amplitudes and storm scale, and the new modes sit in a disjoint band above them. Both grow in a storm, but in different wavelengths, so nothing is multiplied twice.

| Wind | Long-swell RMS height | Σ\|a\| (max height) | For comparison: carriers RMS |
| --- | --- | --- | --- |
| 4.5 m/s (still air) | 0.008 m | 0.02 m | 0.39 m |
| 10 m/s (reference) | 0.116 m | 0.33 m | 0.39 m |
| 24 m/s (storm) | 0.659 m | 2.28 m | 1.02 m (storm scale 2.6) |

A calm sea is unchanged in practice. The reference breeze adds a gentle long roll, and a storm adds a large irregular swell, Hs ≈ 2.6 m in this band.

## 2. Files

| File | Role |
| --- | --- |
| `src/editor/water/OceanSwellModes.js` (new) | Pure: mode set, wind → amplitudes, amplitude bound, spatial and time phases, `sampleOceanSwellCpu` (height and slope) |
| `src/editor/water/OceanSwellState.js` (new) | Per-frame shared state: easing amplitudes, time phases, frame uniforms; `oceanSwellOffset` / `oceanSwellWeight` (CPU), `oceanSwellHeadroom`, `settleOceanSwell` |
| `src/editor/stylized/OceanSwellNodes.js` (new) | TSL twin: height and slope from per-chunk origins and the frame uniforms |
| `src/editor/water/seaState.js` | `configureSea` configures the swell. `updateSeaState({ …, weather })` advances it on the same call that advances the water clock. `seaSurfaceOffset` = authored + long swell |
| `src/editor/stylized/SeaSurfaceShading.js` | With an ocean mask and origins: displacement += weighted swell height, and the swell slope joins the existing `seaSwellSlope` varying. Off: original expressions |
| `StylizedWaterMaterial.js`, `SharedWaterMaterials.js`, `StylizedWaterSlot.js` | Per-chunk origins (4 vec4, computed on descriptor change) and per-object binding. Slot bounds headroom 6 m + the swell's storm-ceiling bound |
| `src/editor/water/fft/OceanFftConfig.js`, `config/water-visual.yaml` | `offshoreFft.geometry.enabled` (validated; code default off, shipped on) |
| `src/main.js` | Passes the resolved wind to `updateSeaState` (the same scratch object as I.5) |
| `scripts/ocean-fft-qa/integration.js` | GPU `swellParity` case |
| `test/ocean-swell-geometry.test.js` (new) | 7 tests (§7) |

Not modified: `SeaSwell.js` (the five carriers), `SeaSurf*` (breakers), `TerrainWaterQueries.js` (it already routes through `seaSurfaceOffset`), the FFT runtime and normals, foam, whitecaps, and the ice pipeline.

## 3. Where the swell stands

`weight = smoothstep(7, 14, depth) · smoothstep(24, 40, shoreDistance) · clamp(exposure)`. That is the I.4 offshore blend, from `offshoreFft.blend`, and the shader also multiplies by `ocean · coverage`.

- **Zero in the surf zone and over the shelf** (depth < 7 m or shore < 24 m), so breakers, swash, foam lines and wet sand never move.
- **Zero in the lee** (exposure 0). Coves and headlands keep their sheltered water.
- **Real ocean only.** Lakes and rivers get none, on the CPU (the query only applies it to ocean kind) and in the shader (`appearance.ocean`).
- **Independent of the GPU FFT.** The weight never includes FFT availability. Gameplay height must not depend on whether WebGPU or the FFT initialized, and the CPU twin can't see either.
- **Tiers.** It exists exactly where the authored swell exists: wherever `configureSea` runs (flow quality) and the shader builds sea nodes. On low the shader is byte-identical (`ca02d814`) and the CPU query has no swell either.

## 4. CPU/GPU parity

| Check | Result |
| --- | --- |
| GPU compute vs CPU twin (`swellParity`): the real TSL nodes, storm amplitudes, water time 98,765 s, 15 points in chunks near −4.2 Mm, +4.2 Mm and the origin, including chunk corners | Max height error **5.8e-7 m** (heights up to 1.61 m), max slope error 4.3e-8 |
| Node: f32 shader phase arithmetic vs CPU at ±4.2 Mm | < 1e-4 m |
| Node: slope = finite-difference gradient of height | < 1e-5 |
| Node: `seaSurfaceOffset` = authored + swell offshore; unchanged nearshore; seek back reproduces exactly | Exact |
| Uniform arrays = CPU arrays (amplitude, time phase) | Exact (< 1e-12) |

The vertex path also multiplies by `swing` (the last metre of depth) and `ice.open`, as it already did for the authored displacement. The CPU query never did either, an existing tolerance. The swell's weight is 0 at those depths, so it adds nothing there.

## 5. Weather and determinism

- **Amplitudes** are recomputed from the resolved wind every frame (cheap: 4 bins × 16-point quadrature), then eased exponentially (≈95 % in `transitionSeconds`) with frame time.
- **Snaps:** the first weather sample, and QA through `settleOceanSwell`.
- **Phases** never move, so easing changes heights smoothly. The largest per-frame amplitude step in a storm-to-calm change is < 3 cm, by test.
- **Determinism:** CPU queries and the GPU read the same per-frame arrays, so gameplay and render agree within the frame. Over time, the result is a deterministic function of the weather timeline and frame times. A networked game would need to replicate the eased amplitudes, or snap them, instead of easing locally.

## 6. Bounds, culling and reflections

- **Slot bounds:** the headroom grows from 6 m to 6 m + 3.34 m. That is the swell's Cauchy–Schwarz upper bound at 2.4 × the reference wind, the storm ceiling of the wind mapping, so crests are never culled. The bound holds for every heading (test).
- **Shadows and reflections:** they use the same displaced materials and slot meshes. The reflection controller samples `getCanonicalWater` at chunk centres, which now includes the swell, consistent with the drawn surface.
- **Varyings:** none added (12 on high and ultra, as before). Textures and samplers are unchanged (16 / 13 plain, 21 / 14 refraction).

## 7. Tests

| Check | Result |
| --- | --- |
| `test/ocean-swell-geometry.test.js` | 7 pass. Covered: the mode set (deterministic, disjoint band, 90° spacing); amplitudes (energy within 0.2 % of the exact integral, zero at calm, downwind > 4× upwind, bound for every heading, RMS ranges); the CPU twin (gradient, f32 shader phases at ±4.2 Mm); state (off → 0 and no headroom, snap, continuous easing, settle exact, uniforms = CPU); weight (surf zone, lee, continuity); `seaSurfaceOffset` (nearshore unchanged, offshore = authored + swell, clock seek exact); config and shader contract (no new varying, off path original, never gated on GPU) |
| GPU fixture `npm run qa:ocean-fft` | All cases pass, including `swellParity`; 0 validation errors |
| In-app inspection (high, low) | 0 failures; counts in §6; low byte-identical |
| Water acceptance, swell on | 13/13 functional gates (enter, swim, dive to 7.67 m, surface, dry, stable body and origin), 0 GPU errors. The timing is not authoritative: the window lost foreground focus |
| `npm test` | 5,069 pass, 0 fail |
| `npm run lint` | No issues |
| `npm run build` | Exit 0; existing chunk-size warnings only |

## 8. Performance

`run-coastal-review.mjs --perf`, swell on / off / on (A / B / A′, by toggling the YAML), I.0 poses, focus verified on all 9 timings. Values are GPU render p50 / p95 in ms.

| Pose | On (A) | Off | On (A′) |
| --- | --- | --- | --- |
| offshore-calm / high | 3.80 / 5.14 | 3.69 / 3.91 | 3.74 / 3.80 |
| offshore-calm / ultra | 3.77 / 3.81 | 3.74 / 5.08 | 3.96 / 5.38 |
| cove / high | 5.06 / 7.11 | 5.02 / 7.10 | 5.06 / 7.03 |

The cost is about 0.05–0.1 ms GPU at p50: 16 sin/cos per water vertex, with the fragment unchanged. The p95 columns swing by more than that between A and A′ and are noise. CPU, measured in Node: 12.8 µs per frame for the amplitudes and time phases, and 0.9 µs per gameplay water query.

## 9. Visual result

Offshore captures at midday (reference, 24 m/s wind and storm) and in the evening wind are in `screenshots/`, with `compare-i5-left-i6-right.png` placing them beside the I.5 captures:
- In strong wind, the swell shows as larger irregular rolling swell, with an undulating horizon line where I.5 had a flat one.
- At the reference breeze it is a gentle long roll.

Sky and exposure differ between the two runs because of run order (auto-exposure and cloud history), not the swell.

## 10. Not verified

- **Swimming in open deep water:** the water-acceptance route is coastal, where the swell's weight is 0, so it checks that nothing broke rather than riding the swell. Offshore swimming relies on the exact CPU/GPU parity above.
- **Dynamic boats and AI:** none exist yet. `sampleOceanSwellCpu` already returns the slope they will need, but `TerrainWaterQueries` exposes height only.
- **100 km travel:** covered by the per-chunk double-precision origins and the ±4.2 Mm parity checks, not by a recorded long walk.
- **Coastal capture set:** not re-captured with the swell. The weight is the I.4 blend, which those captures validated, and it is 0 at every coastal fixture's shoreline.
- **Single GPU:** only the RTX 4080 was run.

## 11. Rollback

`water.sea.offshoreFft.geometry.enabled: false` restores the I.5 shaders and the CPU heights exactly: the off path keeps the original expressions, and the swell contributes 0.
