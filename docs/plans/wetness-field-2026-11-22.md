# Ground wetness field — spatially varied, GPU-only rain wetness

**Status:** implemented in `6a33c372`, tuned in `929237ba` after the bare-soil and town captures (§6.1), on `main`. **On by default** since 2026-11-22 (`stylizedSurface.wetness.field.enabled: true`; `?wetnessField=0` turns it off). Evidence: [`docs/qa/wetness-field-2026-11-21/`](../qa/wetness-field-2026-11-21/).

It applies the offshore FFT ocean's approach (PR I) to rain wetness: the GPU owns the visual field and computes it in one shared pass, nothing is read back, world-space patterns go through double-precision origins, a YAML switch proves itself byte-identical when off, and timings come from native hardware runs.

## 1. What changed for the player

Before, ground wetness was one global value (`SurfaceWetness`), so a storm darkened every patch of exposed ground by the same amount and the puddles followed one curve. With the field on, within about 100 m of the camera:

- **Rain darkens unevenly.** A ~32 m CC0 mottle varies the film between 55 % and 100 %, and slopes shed water: from tan 0.35 to tan 1 the film falls to 40 %.
- **Puddles pool in hollows and on flats.** Each point's puddle *spread* combines:
  - how far the ground sits below its ~6 m ring;
  - flatness;
  - a broad (~85 m) CC0 field for where the soil holds water;
  - the mottle;
  - sun exposure, only while the ground dries (scaled by how far the fast clock has fallen), so a storm at noon still pools.

  The terrain's own baked slope and curvature (`shape`) still decide the exact outline, as before.
- **Runoff on steep slopes.** Slopes never soak through and never pool.
- **Patchy drying.** Three ground clocks run side by side:
  - one that dries in 0.45 × `drySeconds`;
  - one that holds water for 1.5 ×;
  - standing water, which fills over 3 × `wetSeconds` and dries over 2.5 × `drySeconds`.

  The sun speeds all three: half speed at night, 1.2 × under a high sun. Each texel mixes the two film clocks by how well it *retains* water (sun-facing, steep and raised ground dries first; shaded hollows last), so drying spreads in patches. Puddles are on the slowest clock and go last.

Beyond the window the ground keeps the global value, faded in over the outer 20 % of the half-window, so there is no edge.

## 2. Design

| PR I principle | Here |
| --- | --- |
| GPU owns the visual field, one shared pass | `WetnessFieldPass`: one 128² full-screen pass (RGBA8: R film, G puddle spread), shared by the terrain and the settlement paving |
| No readback | None. Nothing on the CPU reads the field |
| CPU twin only when gameplay reads it | Gameplay does not read wetness, so there is no twin. The CPU keeps only the three scalar clocks |
| World-anchored, double-precision origins | Noise origins come from `PatternOrigins` (macro 512 m, meso 32 m tiles, wrapped in double precision at the window centre). The lookup is in **render space** (`positionWorld.xz − corner`, where `corner` is computed in double precision on the CPU every frame), so a floating-origin rebase moves window and ground together |
| Window snapped to whole texels | The window *is* the field's own `LocalGroundHeight` patch (256 m, 128 samples, 2.016 m step, centre snapped to whole steps in canonical metres; rebuilt after 32 m of drift under the deferred-work budget). Texel *i* is height sample *i*, so a rebuild moves the field by whole texels and the same ground keeps the same value |
| Absolute clocks, deterministic | The field is a pure function of the clocks, the terrain and the sun, with no per-texel history. Fixed weather and time give a fixed field, and any window can be drawn fresh. `WorldVisualQa.settleLighting` calls `wetnessField.settle()` and waits a frame |
| Validated YAML, off switch proven byte-identical | `stylizedSurface.wetness.field { enabled, intervalSeconds }`, validated, plus `?wetnessField=0\|1`. Off: identical WGSL/GLSL (§4), no pass constructed |
| Native hardware A/B | §5 |

**Cadence.** A draw happens only when needed (`wetnessFieldNeedsRender`):

- the window changed;
- after `intervalSeconds` (0.25 s), a clock or the sun moved by more than half an 8-bit step.

Dry from the start, nothing is drawn. Settled rain or settled drying draws nothing either.

**Inputs per texel** (`wetnessFieldModel.js`, plain TSL so Node tests evaluate it):

- 13 height loads (centre, gradient, 8-tap ring at 3 texels);
- two layers of the shared CC0 world-noise array (`worldNoise.js`), which is loaded on idle and was already resident;
- the sky's sun uniform;
- the clocks.

No procedural noise.

**Consumers.** Only existing wetness inputs were rewired; no parallel system:

| Reader | Field on | Field off |
| --- | --- | --- |
| Terrain rain film (`RainWetnessShading`) | `field.film × exposure` | `surfaceWetnessUniform × exposure` (unchanged) |
| Terrain puddles (`PuddleShading`) | gate on the puddle clock; spread = `field.puddle`; the sine "broken" term is dropped (the field carries CC0 break-up) | unchanged |
| Settlement paving | the stone family with `wetness = field.film` | town stone clock (unchanged) |
| Foliage, bark, debris, impostors, building walls and roofs | global clocks (unchanged): wet leaves and walls don't pool | same |
| Rocks | no rain-wetness input exists (only coastal impact), so none was added | — |

## 3. Files

| File | Change |
| --- | --- |
| `src/editor/weather/wetness/wetnessField.js` (new) | Field target, window uniforms, `sampleWetnessField`, build-time registry |
| `src/editor/weather/wetness/wetnessFieldModel.js` (new) | Per-texel model |
| `src/editor/weather/wetness/WetnessFieldPass.js` (new) | Owner: height patch, pattern origins, pass, cadence, `forTerrain` |
| `src/editor/weather/surfaceWetness.js` | Three ground clocks (`groundWetnessClocksUniform`), sun drying rate |
| `src/editor/weather/surfaceWetnessConfig.js` | `field` settings, validation, `?wetnessField` |
| `RainWetnessShading.js`, `PuddleShading.js`, `SettlementPavingMaterial.js` | Read the field when registered on; otherwise the old graph |
| `terrainMaterial.js` | One argument: `field: rainWetness.field` |
| `main.js`, `loadEditorConfig.js`, `WorldVisualQa.js`, `editor.config.yaml` | Wiring, registration, settle, setting |
| `test/wetness-field.test.js` (new) | Model, clocks, cadence, settings, off/on wiring |
| `scripts/wetness-field-wgsl-hashes.mjs` (new) | Device-free off-switch proof |
| `scripts/run-wetness-field-qa.mjs` (new) | Native captures, in-app WGSL hashes, field pass timing |

## 4. Off switch: byte-identical shaders

Device-free WGSL and GLSL (`node scripts/wetness-field-wgsl-hashes.mjs <tree> --field off|on`, vertex:fragment SHA-256 prefixes). The pre-field tree is `3af7bb12`, from `git archive`:

| Reader | Backend | Pre-field `3af7bb12` | This tree, off | This tree, on |
| --- | --- | --- | --- | --- |
| Terrain wetness wiring (rain film + puddles) | WebGPU | `17f03ab9c129:c62ff194de4f` | **same** | `6700124138ac:c9774d59455f` |
| | WebGL | `66b81db36019:457ea6384506` | **same** | `dcf258f17370:e9f726475f6a` |
| Settlement paving | WebGPU | `ae8ef50d3632:9ec22f35d8a0` | **same** | `cf06574f0afe:473c978ddfe1` |
| | WebGL | `6a942ba97262:8c2037063163` | **same** | `8e6400be496b:4294ad31de4e` |

**In the app** (`run-wetness-field-qa.mjs --hashes`): the fragment WGSL hash of the first visible mesh of every node material in the scene, at the grassland pose after the captures, native WebGPU. Builds compared:

- `3af7bb12`, the pre-field snapshot (`base/report.json`; its capture shots fail by design, since that code has no ground clocks to set);
- `6a33c372` with `?wetnessField=0` (`off/`);
- `6a33c372` with `?wetnessField=1` (`on/`).

| Comparison | Distinct name\|hash pairs | Differences |
| --- | --- | --- |
| pre-field vs field off | 110 vs 110 | **none: identical sets** |
| pre-field vs field on | 110 vs 112 | The terrain's unnamed standard material (`af835dba`) is replaced by two field-reading variants (`900fb523`, `a543cc4c`). A desert ice-plant scan streamed into the on run only |

So with the field off the whole scene's fragment shaders, terrain included, are byte-identical to the pre-field build.

With the field off, `WetnessFieldPass.forTerrain` returns null: no pass, no render target draw, no height patch, and no CPU work beyond the three clock updates.

## 5. Performance

**Field pass alone** (`run-wetness-field-qa.mjs --timing`): 60 forced draws, each bracketed by WebGPU timestamp queries with tracking off between them. Snapshot server `6a33c372`, grassland pose, 1600×900. Two runs:

| Run | p50 | p95 | max |
| --- | --- | --- | --- |
| 1 | 0.003 ms | 0.004 ms | 6.19 ms (one outlier) |
| 2 | 0.004 ms | 0.004 ms | 6.34 ms (one outlier) |

That is about **0.004 ms** per draw, against the 0.3 ms budget. The pass draws at most 4×/s while the clocks move and not at all when they are settled.

**Scene A/B.** `qa:perf --headed --qa move --speed walk --warmup 4 --duration 10 --gpuTimings 1` against snapshot `6a33c372`. Rain ramps in from dry (`storm=0.8&stormKind=rain`, no snap), so the ground clocks move and the field draws throughout: the worst case. Runs alternated off, on, off, on. **All four passed the native foreground-focus check.**

| Run | Field | Frame p50 | Frame p95 | Hitches | GPU render avg / p50 | CPU update p50 |
| --- | --- | --- | --- | --- | --- | --- |
| A | off | 10.7 ms | 82.2 ms | 24 | 1.50 / 0.96 ms | 8.3 ms |
| B | on | 10.5 ms | 102.3 ms | 26 | 1.21 / 0.97 ms | 8.4 ms |
| A′ | off | 10.5 ms | 112.0 ms | 24 | 1.64 / 1.02 ms | 8.2 ms |
| B′ | on | 10.5 ms | 89.0 ms | 27 | 1.29 / 0.95 ms | 8.1 ms |

- Frame p50, GPU render and CPU update do not move.
- Frame p95 and hitch counts are dominated by chunk streaming on this route. Their off/off spread (82 → 112 ms) is wider than any off/on difference.
- The sampled GPU passes (every 8th frame) did not happen to land on a field draw. Its cost comes from the dedicated timing above.
- The CPU side is the field's height patch: 16k height samples per 32 m of travel, run under the deferred-work budget like the valley-fog patch. Hitches did not rise beyond the off/off spread.
- Reports: `docs/qa/wetness-field-2026-11-21/perf/{off-a,on-b,off-a2,on-b2}.json`.

## 6. Captures

Matched field-off and field-on captures from `run-wetness-field-qa.mjs`:

- **Setup:** grassland pose (−1869, −4003), from the ground and from 30 m up, noon, 1600×900, native hardware WebGPU.
- **Weather states:** the ground clocks are set by integrating `SurfaceWetness` from dry (exact for any step), after `settleLighting`:
  - dry;
  - mid-rain: 35 s of rain, clocks 0.89 / 0.69 / 0.30;
  - heavy rain: storm, saturated;
  - drying: soaked, then 150 s dry at noon, clocks 0 / 0.50 / 0.70.
- **Results:** 0 failures and 0 browser errors in both runs.
- **Sheets:** `compare-grassland.jpg` and `compare-grassland-air.jpg` (off | on), with 960×540 JPEGs per shot under `off/` and `on/` (the full-size PNGs were not committed).

By eye:

- **Dry:** identical apart from tree variants streamed differently between the two runs.
- **Drying (aerial):** the clearest change. With the field off, the global value (0.37) is below the puddle threshold, so no water stands anywhere. With it on, the puddle clock is still at 0.70, so broken patches of standing water remain in the dirt clearing and along the track, and the sunlit slopes have dried. This is the "puddles last, sunny slopes first" behaviour.
- **Rain:** under storm light both read as dark wet ground. The field's unevenness is hard to see at this grass-covered pose, because grass covers most of the soil.

Not captured:

- A bare-soil, road or town pose, where the film's mottling and runoff should read more clearly. This is the first thing to look at before turning the field on by default.
- Motion through a window rebuild.

### 6.1 Bare soil and town (2026-11-22)

Two more poses, same four weather states:

- **desert:** (−5791, −27), flat bare sand, looking slightly down;
- **town:** Cyvazin, burg 18 of the frozen Eldara map (the settlement perf town), standing on its main street facing the centre.

The first field-on desert run found a bug. In heavy rain at noon the field drew **no puddles at all**, where the field-off path floods every flat into sheets of water. The cause: the sun term cut puddle capacity during the storm itself, and at noon open flat ground faces the sun squarely, so capacity fell to the noise floor. `929237ba` makes the sun act only while the ground dries (× `1 − clocks.x`, which is 0 while rain keeps the fast clock full). The same commit widens the film mottle from 0.8–1 to 0.55–1, because the film darkens albedo linearly by `darkening` (0.3), so the old range moved it by only a few percent and soaked ground looked flat. A test now pins "a noon storm still pools".

Re-captured every pose with the tuned field (`tuned/`, snapshot `929237ba`):

- **Desert** (`compare-desert.jpg`: rows off | first field | tuned): with the tuned field, heavy rain leaves separate puddles on the flats instead of the field-off flood or the first field's none. Mid-rain darkens without standing water (the puddle clock is at 0.30, below its 0.45 start), by design.
- **Town** (`compare-town.jpg`: off | tuned): storm fog dominates both rain shots, so paving wetness cannot be judged by eye. On the lower street the tuned run is darker (mean luma 62 vs 75 in rain; 77 vs 79 dry, which is run-to-run noise). In both runs a hard horizontal line crosses the street at mid-distance. It exists with the field off too, and looks like the paving mesh's draw edge: past it the field-off terrain floods into a pale, sky-reflecting sheet, while with the tuned field it stays mostly dark, so the field makes the line less visible.
- **Grassland aerial** (`compare-grassland-air-tuned.jpg`: off | tuned): drying still leaves patchy puddles and damp ground in the clearing.
- **Cost:** field pass 0.004 ms GPU at p50 and p95 over 60 timestamped draws (one 7 ms outlier); all 16 shots and the 4 field-off town shots captured with 0 failures and 0 browser errors.

## 7. Checks

| Check | Result |
| --- | --- |
| `test/wetness-field.test.js` + existing wetness tests | 12 / 12 pass |
| `npm test` | 4,691 pass. Two failures unrelated to this change: `render-probe-lock` (fails while another session holds the hardware QA lock) and `workshop-procedural-shapes` (timeout, seen hanging by other sessions too) |
| ESLint on changed files | No issues |

## 8. Not verified / limits

- Single GPU (RTX-class desktop, see the reports' adapter field).
- Puddle outlines still come from the terrain's baked per-chunk shape, so the field cannot open puddles where that shape sees no hollow; it decides how full each basin is.
- Beyond ~100 m the ground uses the global value (by design: the window is 256 m).
- Paving is in the town captures, but storm fog hides it; its wetness is confirmed only by the luma difference, not by eye. Its off switch is proven device-free (§4).
- The hard line at the paving's draw edge in rain comes from existing code and is not fixed here.
- The tuned model's in-app shader hashes were not re-measured. The off path does not include the model: device-free, `929237ba` with the field off hashes the same as its ancestor `b607b261` for all four shaders. The paving fragment hash itself moved after `6a33c372` (`9ec22f35d8a0` → `417cbb76a0f6` on WebGPU) through another session's shader commits, not this field.
- Turned **on by default** on 2026-11-22 after these captures.
