# PR I phase I.4 — Offshore normal-only material integration

Part of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-21.md). It follows [I.3 world sampling and quality](ponlai-pr-i-phase-i3-world-sampling-and-quality-2026-11-21.md). Evidence: [`docs/qa/ponlai-pr-i-phase-i4-2026-11-21/`](../qa/ponlai-pr-i-phase-i4-2026-11-21/README.md).

**Status:** done, shipped **off** (`water.sea.offshoreFft.enabled: false`), as the plan requires until I.5 drives the spectrum from the weather.

- On high and ultra water with WebGPU, the FFT's short-wave slopes now replace the medium ripple band (groups 0 and 1) on open, deep, exposed sea. The fine band, swell, surf, rain and wakes are untouched.
- Its unresolved slope variance replaces the medium band's variance in the roughness.
- With the feature off, every water shader is byte-identical to before on all four tiers.
- Wave heights, displacement, foam placement and CPU water queries never see the FFT.

## 1. Source and prerequisites

Built on `main` at `f32764a1` (I.3 complete), so I.3 was available and is used as is:
- `OceanFftController` and `OceanFftBinding` (one per surface view);
- `sampleOceanFftSlope` (footprint LOD plus the unresolved-variance table);
- the per-slot `oceanFftOrigin`.

Three.js r187. Hardware: RTX 4080, Windows 11, Chromium, native WebGPU.

## 2. Files

| File | Change |
| --- | --- |
| `src/editor/stylized/SeaRippleShading.js` | Also returns `mediumSlope` / `fineSlope` / `mediumVariance` / `fineVariance`, sharing every texture sample with the unchanged `slope` / `variance` |
| `src/editor/stylized/SeaDetailShading.js` | Legacy two-octave path (detail disabled): both octaves are medium, fine is zero |
| `src/editor/water/fft/OceanFftBlendNodes.js` (new) | `offshoreFftWeight` (TSL) and its CPU twin; `composeOffshoreDetail` |
| `src/editor/water/fft/OceanFftConfig.js` (new) | `resolveOffshoreFft`: defaults and validation of `water.sea.offshoreFft` |
| `src/editor/stylized/SeaSurfaceShading.js` | Optional `oceanFft` input; composes the detail slope and roughness through the blend |
| `src/editor/stylized/StylizedWaterMaterial.js` | Accepts `oceanFft` and `oceanFftOrigin`; passes them on only with an appearance texture (real ocean mask) |
| `src/editor/stylized/SharedWaterMaterials.js` | Passes the view's binding to both variants |
| `src/editor/stylized/StylizedSurfaceViewBase.js` | Request = `water.sea.offshoreFft.enabled` or `?oceanFft=1` |
| `src/editor/water/SeaConfig.js`, `config/water-visual.yaml` | `offshoreFft` validated and shipped off |
| `src/config/RenderEnhancements.js` | Comment only: `?oceanFft=1` is now a QA override |
| `scripts/ocean-fft-qa/integration.js`, `main.js`, `run-ocean-fft-qa.mjs` | GPU cases: blend weight against its twin, and ripple split against the legacy total |
| `test/ocean-fft-blend.test.js` (new) | Config, boundary values, continuity, band ownership and the composition contract |

Not modified: `SeaSwell.js`, `SeaSurf.js`, `SeaSurfMath.js`, `SeaSurfNodes.js`, `TerrainWaterQueries.js`, `water-domain-contract.md`, swimming and navigation, `FrozenWaterNodes.js`, the reflection controller and the diffraction code.

## 3. Shader architecture

```text
createSeaSurfaceNodes
  swellSlope / surf slope                        (unchanged)
  detail = createSeaDetailNodes(...)             medium (groups 0,1) + fine (group 2), shared samples
  if oceanFft && oceanMask:                      ← only real ocean, only when the view has an FFT
      B      = offshoreFftWeight(depth, shore, exposure, ocean·coverage, available)
      slope  = fine·g + mix(medium·g, fft·k, B)                 g = 1 + 1.2·storm,  k = slopeStrength
      var    = fineVar + mix(mediumVar, unresolved·k², B)
  else:                                          ← the original expressions, byte-identical WGSL
      slope  = detail.slope·g ; var = detail.variance
  surfaceSlope = swell/surf + slope + rain/interaction ripple
  normal       = normalize(−sx, 1, −sz)          (the one existing normal)
  roughness    = 0.055 + 0.09·storm + rain + 0.16·√var          (unchanged formula)
  displacement                                   (unchanged; never reads the FFT)
```

- **Replacement, not stacking.** At B = 0 the result is exactly the legacy sum. At B = 1 the authored medium band contributes nothing, and in between the transition is continuous.
- **Storm gain** stays on the authored bands only. The FFT spectrum carries its own wind energy, so applying the gain again would double it.
- **One FFT generation for both variants.** The refractive and plain variants share the same binding node and the same per-object origins. The reflection captures use the same material within the frame the FFT was prepared for (`prepare` runs first in `beforeMainRender`).
- **Warm-up, failure and loss.** The binding always points at a valid texture: the zero fallback until the first published output, and again after a failure or device loss. In those states `available = 0`, so B = 0 and the authored medium detail carries the sea. A zero weight is never relied on to hide an invalid binding.

## 4. Medium/fine separation and legacy parity

| Group | Wavelengths | Band |
| --- | --- | --- |
| 0 | 2.00 / 1.77 m | medium → FFT offshore |
| 1 | 0.95 / 0.84 m | medium → FFT offshore |
| 2 | 0.35 / 0.31 m | fine, kept |

Amplitude, `0.62 × weight` gains, the medium and fine camera-distance fades, the `strength` shaping, filtering, orbital advection, pattern coordinates and the texture lease are unchanged. Medium and fine accumulate the same per-layer terms as the total, then take the same post-gain.

Parity evidence:
- **FFT off, in the app:** water WGSL hashes are identical to `f32764a1` on every tier and variant (§9). The off graph is the original graph.
- **GPU, real ripple nodes at −4.2 Mm, grazing view:** |total − (medium + fine)| ≤ 7.5e-9 for slopes up to 0.095, and ≤ 4.7e-10 for variance. That is f32 reassociation only (`rippleSplit` in the fixture report).
- **Node:** groups 0 and 1 are medium (4 trains) and group 2 is fine (2 trains). Medium wavelengths lie inside the FFT's 7.5–0.5 m band and fine ones below it.

## 5. Coastal blend

```text
B = smoothstep(7, 14, depth) · smoothstep(24, 40, shoreDistance) · clamp(exposure) · clamp(ocean · coverage) · available
```

I.0 Decision F's thresholds, held in `water.sea.offshoreFft.blend`:
- Depth starts at 7 m, where the breakers have handed off to the carriers, and is full at 14 m, below the 10–17 m seabed fade end.
- Shore distance must end inside the field's 48 m cap (`config/water-domain.yaml`). The validator rejects any `shoreEndMeters` above 48, so a fade that could never complete cannot be configured.
- Exposure is applied once. The legacy medium band's own `mix(0.35, 1, exposure)` shelter is swapped out with it, not applied twice.

| Input | Weight |
| --- | --- |
| depth 0 / 7 / 10.5 / 14 | 0 / 0 / 0.5 / 1 |
| shore 0 / 24 / 32 / 40 / 48 | 0 / 0 / 0.5 / 1 / 1 |
| exposure 0 / 0.5 / 1 | 0 / 0.5 / 1 |
| ocean 0 / 1 | 0 / 1 |
| available 0 | 0 |

Continuity: the largest change per centimetre of depth or shore distance is < 0.0025, from 0 to 50 m. There is no step at 7, 14, 17, 24 or 40 m. On the GPU, the TSL weight matches the CPU twin on 480 combinations of those values (max error 4.0e-8).

**Ocean only.** B uses `appearance.ocean`, never `seaWaterMask`'s sea-level heuristic. Without an appearance texture, which is the case for standalone fixtures, the material builds no FFT nodes at all. Lakes at sea level and rivers get B = 0.

**Ice.** Frozen water is composed after the sea shading (`createFrozenWaterNodes`, `ice.color` / `ice.open`). It covers the FFT-shaded surface exactly as it covered the authored ripples, so no extra gate was needed and nothing moved in the ice pipeline.

## 6. Roughness

The existing term `0.16·√variance` takes the composed variance:

```text
variance = fineVariance + mix(mediumVariance, unresolvedFft · k², B)
```

- Both are mean-square slope `E[sx² + sz²]`: the donor's second moment minus its squared mean, and I.3's spectral table. Variance is mixed, never RMS.
- Resolved FFT slope goes to the normal and unresolved FFT variance to the roughness, so filtered energy is counted once.
- FFT off: the formula and its input are the original nodes.
- The storm's own `+0.09·storm` is unchanged and is not applied to the FFT variance a second time.
- The mix of non-negative terms is non-negative, so `√` never sees a negative value. The final clamp `[0.05, 0.48]` is unchanged.
- Distant water: as the footprint grows, the resolved FFT slope fades through the mips while the unresolved variance rises toward the cascade total (I.3 §8). The far sea gets rougher instead of flat or glittering.

## 7. Configuration

```yaml
water.sea.offshoreFft:
  enabled: false
  slopeStrength: 1          # [0, 2]
  blend: { depthStartMeters: 7, depthEndMeters: 14, shoreStartMeters: 24, shoreEndMeters: 40 }
```

- Sizes and cascades per tier stay in `OceanFftQuality`, their single owner: low and medium off, high and ultra 128²×2, WebGPU only.
- `?oceanFft=1` forces it on for QA A/B.
- Invalid values, unknown keys and fades that could not complete throw at load.

## 8. Runtime lifecycle

Unchanged from I.3: one controller per surface view, `prepare(waterVisualClock.value)` first in `beforeMainRender`, and no FFT work per slot, per material or per reflection capture.

Material compilation:
- **Feature off:** no binding is passed, so there is no FFT node, texture, sampler or uniform in any graph.
- **Feature on:** the two shared variants compile once each, as before. Output swaps after compile keep the binding layout (I.3 §10), so streaming compiles nothing new.

## 9. Shader resources

From each variant's cached pipeline WGSL at the I.0 offshore pose (`--ocean-fft-inspect`):

| Tier | Variant | Off: textures / samplers / varyings, hash | On: textures / samplers / varyings, hash |
| --- | --- | --- | --- |
| high | plain | 15 / 12 / 12, `6eb6cc2` | **16 / 13 / 12**, `8b0754f7` |
| high | refraction | 20 / 13 / 12, `6a9b2b63` | **21 / 14 / 12**, `53d9c750` |
| ultra | plain | 15 / 12 / 12, `bd2026a2` | 16 / 13 / 12, `b30d2b5d` |
| ultra | refraction | 20 / 13 / 12, `563efbbb` | 21 / 14 / 12, `6b989acc` |
| medium | both | 14 / 12 / 12, `25f44842` | unchanged (FFT off on medium) |
| low | both | 6 / 5 / 4, `ca02d814` | unchanged |

- **Off hashes equal I.3's** (`f32764a1`) on every row.
- **On:** +1 sampled texture (one `texture_2d_array` for both cascades) and +1 sampler, **0 new varyings**. Material variants stay at 2.
- The plain variant sits exactly at 16 sampled textures. Refraction goes from 20 to 21, within the 32 the app already requests because the terrain needs 17 (`src/render/deviceLimits.js`). A strict-16 device cannot run the world today, independently of water, so the FFT does not raise the minimum. Samplers stay at or below 14 of the spec's 16.

## 10. Screenshots

Matched FFT-off / FFT-on captures, using `run-coastal-review.mjs` with the I.0 poses, high tier, 1600×900:
- the same world, pose, weather preset and fixed water-clock sequence;
- the offshore poses at 124.6 / 126.0 / 127.6 s.

`docs/qa/ponlai-pr-i-phase-i4-2026-11-21/screenshots/{off,on}/`, with `compare-*.png` off | on | ×8 difference sheets.

**Cloud animation is not frozen by the water clock** (I.0). The two runs differ in sky, cloud reflections, rain streaks and tree sway, and the difference images show it. A second FFT-off run (A/A) at the exposed beach, curved coast and headland separates that noise from the FFT: at the headland, the shelf-contour lines in the difference appear just as strongly in A/A, so they are cloud reflections, not the FFT.

Review, by eye at full resolution:

1. **Repeated ripple lines** (offshore calm, windy, curved coast): off shows long, parallel, smooth medium ripples between the swells. On replaces them with irregular, non-repeating wind chop at every distance up to the horizon, which is the intended improvement.
2. **Shimmer and bright specular bands:** none in the stills. The far field filters to roughness rather than glitter. Temporal shimmer needs motion review (§15).
3. **Sudden offshore normal change:** none. The chop fades in over the shelf.
4. **FFT tile boundaries and chunk seams:** none visible. The 57.3 / 15.45 m tiles do not read as a grid.
5. **Storm:** rain and wind texture dominate. Storm water is not noisier with the FFT, because no storm gain is applied to it.
6. **Fine close-up ripples:** kept (group 2 untouched).
7. **Shelter** (cove, headland): the difference is near zero inside the cove and behind the headland, and rises only on open water beyond the shelf.
8. **Foam and waterline:** unchanged; the difference at the beach and shallows is zero.

Not captured in-app: underwater, waterline and far-negative coordinates. The environment-parity fixture builds its own water without the surface view, so it cannot carry the FFT. Underwater is exercised by the water-acceptance run with the FFT on (§12). Far-negative sampling is covered by the I.3 GPU seam and capture cases at −4.2 Mm.

## 11. Performance

`run-coastal-review.mjs --perf` at the I.0 poses: 5 s settle, 8 s measured, live water clock, high tier unless noted, run back to back. Values are p50 / p95 (ms). GPU render is the sampled render passes, which include the water fragment shader and exclude the FFT compute.

**Authoritative pairs** (native foreground focus verified on every timing). Runs: A (off), FFT (on), A′ (off).

| Pose | Frame A | Frame FFT | Frame A′ | GPU render A | GPU render FFT | GPU render A′ | GPU avg A / FFT / A′ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| offshore-calm | 8.3 / 10.1 † | 4.1 / 5.7 | 3.9 / 5.5 | 4.17 / 5.50 † | 3.72 / 4.21 | 3.60 / 4.75 | 4.30 † / 3.79 / 3.73 |
| cove | 5.3 / 6.9 | 5.4 / 7.4 | 5.3 / 6.8 | 4.94 / 7.00 | 5.04 / 5.31 | 4.93 / 6.64 | 5.09 / 5.11 / 5.11 |
| offshore-calm, ultra (first set) | 4.1 / 6.1 | 4.1 / 6.1 | — | 3.86 / 4.21 | 3.75 / 4.16 | — | 3.89 / 3.84 / — |

† A one-off CPU stall during that run (render CPU p50 7.1 ms against 3.1 ms in the other two); A′ is the clean baseline.

- **Water fragment cost:** about **+0.1 ms** GPU render p50 offshore and in the cove (3.72 vs 3.60, 5.04 vs 4.93). GPU averages move by 0.00–0.06 ms; frame p50 by ≤ 0.2 ms.
  - That is within the 0.2 ms target, and within this harness's A/A′ spread, which reaches 1 ms at p95.
  - The ultra pair shows no measurable difference.
- **FFT compute:** 0.055 ms plus 0.009–0.010 ms of output passes (timestamped, I.2 and I.3), against the 0.5 ms target.
- **Memory:** 1.29 MiB of buffers plus a 174,768-byte output array (I.3). Per slot, one vec4 uniform.
- **Dispatches:** 15 per transform, 0 when the clock is unchanged. Never per slot, per material or per reflection capture.
- **Shaders:** 2 variants, compiled once each. No per-chunk compile and no extra viewport copies.
- **Rejected measurements:** a first set of 12 timings (offshore high and ultra, curved coast, cove). 8 of them failed the foreground-focus check (`logs/perf-off-a|on|off-b.json`) and are kept but not used. Their values agree with the tables above.
- **Not measured separately:** shader compile time, reflection capture timing and streaming stability. The coastal runner reports none of these, and none of the code they depend on changed.

## 12. Water height and gameplay

- **CPU:** no file on the CPU water path changed (§2). `TerrainWaterQueries`, `SeaSwell`, `SeaSurf` and `SeaSurfMath` are byte-identical, so `waterHeight(x, z, t)` is the same with the FFT on and off by construction.
- **GPU displacement:** `createSeaSurfaceNodes`' `displacement` reads only the swell and surf. A test asserts that the displacement code references neither `oceanFft` nor the composed detail.

- **Water acceptance with the FFT forced on** (`npm run qa:water:acceptance -- --headed --url …/?oceanFft=1`, high tier): **all 13 functional gates pass**, with 0 GPU validation errors.
  - The route enters the water, swims, dives to 7.67 m (63 submerged frames, full underwater blend), surfaces and returns dry.
  - Body identity is stable, origin snaps are 0, and projected caustics are active and CPU-bounded.
  - The run's timing is **not authoritative**: another window took the foreground 57 s in (`capture.focus.native`), so the harness marked it failed even though every gate passed. Its frame p95 of 10.8 ms is from the unfocused window and is not comparable to I.0's 7.9 ms. Log: `logs/water-acceptance-fft-on.json`.

## 13. Tests

| Check | Result |
| --- | --- |
| `test/ocean-fft-blend.test.js` | 6 tests: config, boundary values, continuity, band ownership, composition contract |
| GPU fixture `npm run qa:ocean-fft` | All cases pass, including `blendWeight` (480 cases, 4.0e-8) and `rippleSplit` (7.5e-9); 0 validation errors |
| In-app inspection, flag off and on, 4 tiers | 0 failures; hashes in §9 |
| Coastal captures off / on / off2 | 0 failures, 0 GPU or network alerts |
| Water acceptance, FFT on | 13/13 functional gates; timing not authoritative (focus lost) |
| `npm test` | 5,054 pass, 0 fail (includes `water-floating-origin`, `sea-swell`, `water-quality`, `water-shader-performance-contract`, `water-slot-bounds`, `water-visual-clock`) |
| `npm run lint` | No issues |
| `npm run build` | Exit 0; existing chunk-size warnings only |
| `qa:world:visual`, `qa:look` | Not run: their fixtures do not build the surface view's water, so the FFT (default off) cannot reach them, and the off shaders are byte-identical |

## 14. Reviews

**Review A — correctness and architecture.**
- Medium/fine ownership: groups 0 and 1 to the FFT, group 2 kept.
- Bands are disjoint: medium 2.0–0.84 m inside the 7.5–0.5 m FFT band, fine 0.35 / 0.31 m below it.
- The blend is geographic only, and ocean kind comes from `appearance.ocean`.
- X/Z slope orientation was verified on the GPU in I.2 and I.3. The shared normal convention `(−sx, 1, −sz)` is the sea's own.
- Roughness is in variance units, with the storm gain applied once.
- Displacement and CPU queries are untouched; feature-off parity is byte-identical; the binding is never invalid.
- Config validation rejects unreachable fades.
- Finding, documented rather than changed: in the legacy two-octave donor path (`detail.enabled: false`, not shipped), the 8 m octave sits just above the FFT's 7.5 m band. It is treated as medium because the path has no separate fine band.

**Review B — performance and visual quality.**
- One sample per FFT cascade; no duplicated donor samples, since the split shares the existing ones; the off graph is unchanged.
- In the on graph the legacy total and its variance are not emitted (only the composed values are referenced).
- No viewport textures and no new passes; dispatch count fixed; 0 varyings.
- The mip/LOD view from I.3 shows no rings. Offshore repetition is reduced (§10), the coastal fade is smooth, and reflections reuse the frame's output.
- No change was needed after the review. One QA fix: the ripple-split case first read its magnitude from the alpha channel, which the background also clears to 1, so its "non-trivial" guard was blind. It now uses a colour channel.

## 15. Known limitations

- **Fixed offshore spectrum.** 10 m/s wind along the primary swell, with seed 1234 (`OFFSHORE_FFT_WIND`). Calm and storm presets get the same FFT chop. Driving it from the resolved weather is I.5, which is why the feature ships off.
- **No legacy camera-distance fade on the FFT band.** The authored medium band faded out by 120 m from the camera; the FFT instead filters by footprint, so detail now extends to the horizon as roughness. This is intended, but it is a visible change in the far field.
- **Temporal stability** (shimmer under motion, glint flicker) was judged from stills and the I.3 mip view, not from a recorded sequence.
- **Single GPU.** Only the RTX 4080 was run.

## 16. Phase I.5 handoff

- **Wind and storm:** replace `OFFSHORE_FFT_WIND` in `OceanFftController` with the resolved weather wind and storm. Rebuild h0 through `runtime.setSpectrum` and `binding.setSpectra` (the unresolved table must follow the spectrum) on meaningful revisions only, with deterministic smoothing.
- **Storm:** keep the storm gain off the FFT band; the spectrum's wind speed carries it.
- **Time:** keep `prepare(waterVisualClock.value)` once per frame, never per reflection capture.
- **Enable:** consider shipping `offshoreFft.enabled: true` once calm and storm look right across the day.
