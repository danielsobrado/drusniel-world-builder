# Storm snow field: spatially varied, GPU-only storm snow (2026-11-21)

**Status:** shipped on, behind `weatherEffects.snowField.enabled`
(`config/weather-effects.yaml`). It follows the approach of the offshore FFT ocean
([PR I](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-22.md)).

## 1. What changed

Before, storm snow on the ground was one number for the whole world.
`SnowCover` integrated `stormFrame.snow` over minutes, and `main.js` wrote the
result into `stormSnowCoverUniform`, so everything whitened and melted together.

Now a small camera-centred GPU field scales that number per point:

- **Builds faster** on lee slopes, open flats and hollows. **Builds slower** on
  windward faces, steep faces (past ~35°) and, on the terrain, under a canopy.
- **Drifts with the wind:** a drift pattern, streaked along the prevailing wind,
  varies the build rate. It creeps downwind while snow is falling.
- **Melts unevenly:** during a thaw, sun-facing slopes lose their snow first.
  Thin spots, such as windward faces and the low parts of the drift pattern,
  go before deep drifts.

It is visual only. Nothing is read back to the CPU, and there is no CPU twin,
because no gameplay reads storm snow.

### Coverage contract

Coverage stays where `CLAUDE.md` and
[surface coatings](../surface-coatings-2026-11-28.md) put it. The field lays no
snow and adds no second snow coverage system. It only replaces the
storm-snow **input** that each surface's existing mask already reads:

```
local cover = saturate(SnowCover.value × gain(x))
```

`stormSnowCoverAt(renderXZ)` and `stormSnowCoverAtCanonical(canonicalXZ)` live in
`snowFieldState.js`. Each reader swaps them in where it used `stormSnowCoverUniform`:

| Reader | File | Position used |
| --- | --- | --- |
| Terrain storm snow (+ canopy shelter) | `materials/TerrainStormSnowNodes.js` | `positionWorld.xz` (fragment) |
| Authored rocks | `stylized/rockWeathering.js` | `positionWorld.xz` |
| Alpine crags | `stylized/alpine/AlpineRockMaterial.js` | world `p.xz` |
| Tree crowns and trunks, impostors | `stylized/forest/canopySnow.js` (`withStormSnow`) | `positionWorld.xz` |
| Meadow blade flattening | `stylized/meadow/meadowGrowthNodes.js` | `instance.canonical` (vertex) |
| Meadow blade frost colour | `stylized/meadow/meadowPigment.js` | `blade.canonical` (vertex) |

`MacroFarTerrainView` keeps the global value. The far terrain lies outside the
field's window anyway, and the field fades back to the global cover towards the
window's edge (from 40 % of the half-window).

Snow country is unchanged. Baked snow stays under `max(baked, storm)` in every
reader, and `SnowCover` never melts there (`holdShare`). So the melt pattern
never starts there, and a storm can only add snow.

## 2. How it works (the PR I approach)

| PR I principle | Here |
| --- | --- |
| GPU owns the field, computed once in a shared pass | `SnowFieldPass`: one 128² full-screen pass into an RGBA16F target (`storm-snow-field`). Readers do one texture fetch. |
| Nothing read back | No readback. The pass is not drawn while `SnowCover` is 0, or when its inputs have not changed (a held cover under a still wind). |
| CPU twin only for gameplay | None. |
| World-anchored, double-precision origins | Window centre snapped to whole 4 m texels in canonical metres (`snapWindowCenter`). The drift pattern's origin is computed in double precision and wrapped by the periodic-noise period (`driftPatternOrigin`), so the shader only adds a small offset from the centre. |
| Absolute clocks, deterministic | The field is a pure function of position, cover, melt phase, drift offset, wind and sun. Under a snapped storm (`stormSnap=1`) the drift offset holds still, and `SnowCover.snap` resets the phase. `settleLighting` calls `snowField.settle()`, which finishes the ground patch at once. |
| Validated YAML with a proven off switch | `weatherEffects.snowField`, validated by `resolveSnowFieldConfig`, with `?snowField=0|1` for QA. Off, the pass is never built, and every reader gets `stormSnowCoverUniform` itself (§4). |
| Native A/B before claiming wins | §5. |

### Inputs per texel

- **Ground:** its own `LocalGroundHeight` patch (129² over 512 m, rebuilt in the
  background each time the camera moves 64 m, with a 1 ms yield per frame).
  From it come the gradient (slope, lee and sun aspect) and a 4-tap Laplacian
  (hollows and crests). This is the same patch class that the ambient particles
  and the valley mist use, with its own extent.
- **Wind:** `worldWindUniforms.prevailing`, the direction the world wind pass
  resolves, including the storm's curves. Lee means the face's downhill
  direction lies along the wind. The drift creeps at
  `driftSpeed × snowfall × worldWindCamera.envelope`.
- **Sun:** the sky's `sunDirection` node. Sun-facing means the downhill
  direction points toward the sun's azimuth, faded out as the sun sets.
- **Storm:** `SnowCover.value` and its new `melting` phase. The phase eases from
  0 to 1 over `meltPhaseSeconds` (60 s) once the snow is melting, and back while
  it builds or holds. It switches the field from the build pattern to the melt
  pattern.

### Gain

```
build = max(0, (flatGain + leeGain·lee + hollowGain·hollow − steepLoss·flatGain·steep)
               × (1 + driftContrast·(2·drift − 1)))
melt  = build × (1 − sunMelt·sunFacing)
gain  = mix(build, melt, melting)
```

Defaults: `flatGain 1.15`, `leeGain 0.6`, `hollowGain 0.35`, `steepLoss 0.6`,
`driftContrast 0.7`, drift streaks 70 m along and 18 m across the wind,
`driftSpeed 0.25 m/s`, `sunMelt 0.65`. On the terrain only,
`canopyShelter 0.3` takes up to 30 % off the cover under a closed canopy. The
earlier decision that "a canopy is no shelter" still holds: a full storm still
whitens the floor, but later than open ground.

## 3. Files

| File | Role |
| --- | --- |
| `src/editor/weather/storm/snowField/snowFieldConfig.js` | Defaults, validation, `?snowField` override, registration for materials |
| `src/editor/weather/storm/snowField/snowFieldState.js` | Target, uniforms, `snapWindowCenter`, the reader helpers |
| `src/editor/weather/storm/snowField/SnowFieldPass.js` | The pass, `driftPatternOrigin`, `createSnowFieldPass` (returns null when off) |
| `src/editor/weather/storm/SnowCover.js` | `melting` phase, `meltPhaseSeconds`, QA `frozen` hold |
| `src/main.js`, `src/config/loadEditorConfig.js` | Builds the pass and updates and draws it after the cover each frame; resolves the config |
| `src/editor/performance/qa/WorldVisualQa.js` | `settleLighting` settles the field |
| `tests/stormSnowField.test.js` | Config, off identity, WGSL generation on and off, snapping, drift origin, phase and freeze |
| `scripts/snow-field-wgsl-hashes.mjs` | Node WGSL hashes of the device-free readers, for any source tree |
| `scripts/run-snow-field-review.mjs` | Native storm and thaw captures, in-app reader WGSL, field microbenchmark |

## 4. Off switch: byte-identical shaders

**Node, device-free readers.** `node scripts/snow-field-wgsl-hashes.mjs` was run on
HEAD `8bb0106b`'s tree (`git archive` into `tmp/`) and on this tree with
`--field off` and `--field on`. Hashes are vertex:fragment, sha256/12.

| Reader | HEAD 8bb0106b | Field off | Field on |
| --- | --- | --- | --- |
| alpine rock / WebGPU | `05b959615df5:0b96b4bd89f9` | identical | differs |
| alpine rock / WebGL | `bd93daa02570:55e5b268e506` | identical | differs |
| rock weathering / WebGPU | `60db4c195957:348886b53d9c` | identical | differs |
| rock weathering / WebGL | `214192155605:828196f14d11` | identical | differs |
| crown (dithered) / WebGPU | `a6c6b6110ae4:75c9097a601d` | identical | differs |
| crown (dithered) / WebGL | `15dab93f50e5:20632babfa3d` | identical | differs |
| trunk (dithered) / WebGPU | `d95dcaf155f9:150510f32710` | identical | differs |
| trunk (dithered) / WebGL | `e43138b8104c:a8934e11c311` | identical | differs |

**Why the graph cannot change.** Off, `stormSnowCoverAt` and
`stormSnowCoverAtCanonical` return the `stormSnowCoverUniform` node object
itself (`tests/stormSnowField.test.js` asserts this). The terrain adds its
canopy term only when the field is on. So every off graph is the original
graph, node for node.

**In the app, every reader.** `run-snow-field-review.mjs` reads the vertex and
fragment WGSL from the cached pipeline of every terrain, meadow, rock and tree
material in view. It does this at the rainforest-slope storm pose, on HEAD
`8bb0106b` (snapshot server, port 5217) and on `3af7bb12` with `?snowField=0` and `=1`:

- **Off against HEAD: 94 of 94 shaders are identical.** That covers
  `terrain-slot-0` (fragment `b0c0ec83` on both), the meadow blades (vertex
  `a07a9cb1` on both), cards, ground detail, flowers, bushes, rocks, crags
  and trees. Three ground-detail meshes carry different instance numbers in
  the two runs; matched by material, they are identical too.
- **On against off: 76 of 94 change.** For example, the terrain fragment
  becomes `af835dba` and the blade vertex `e721c0e3`. The other 18 do not read
  storm snow.

**No GPU work when off.** `createSnowFieldPass` returns null. No target is
allocated, because readers create it lazily and are never asked to. There is no
pass and no ground patch.

## 5. Native results

Hardware WebGPU (NVIDIA Lovelace, not a fallback adapter), 1600×900, headed
Playwright. Off and on were served from frozen snapshots:
`serve-world-visual-snapshot.mjs 3af7bb12` with `?snowField=0|1`, and HEAD `8bb0106b`.

### 5.1 Captures: storm and thaw at a fixed hour

`node scripts/run-snow-field-review.mjs --url http://localhost:5218` runs
three elevated poses over temperate ground that has no baked snow:
deciduous hills (-1945, 7795), grassland rise (-8956, 7737) and a rainforest
slope (-1997, -2889). It uses hour 10 and `settleLighting`, and captures two
states:

- **storm:** `?storm=1&stormKind=snow&stormSnap=1`, cover 1.
- **thaw:** a clear sky with `SnowCover.frozen = { value: 0.55, melting: 1 }`,
  for a thaw at fixed time.

All 12 captures completed with no browser errors. In the app, every field-on
window centre lay on whole 4 m texels: (-1944, 7796), (-8956, 7736) and
(-1996, -2888).

Mean absolute pixel difference, on against off:

| State | Deciduous hills | Grassland rise | Rainforest slope |
| --- | --- | --- | --- |
| storm (cover 1) | 3.9 (12.6 % of pixels > 8) | 1.1 (1.2 %) | 3.5 (11.1 %) |
| thaw (cover 0.55, melting) | 17.0 (39.4 %) | 7.4 (29.8 %) | 19.2 (45.8 %) |

The difference figures include sky and tree-sway noise: cloud animation is not
frozen by the QA clock (PR I.4 found the same).

**Reading.** Under a full storm, `saturate(cover × gain)` is 1 almost everywhere,
so the field changes little. Only the windward and steep faces and the low parts
of the drift pattern stay thinner, which is intended. During a thaw the field
is what you see: off, the whole slope stays an even 55 % white. On, open ground
and lee drifts stay white while sun-facing banks and thin spots go green first,
in soft patches several metres across.

**Known issue: chunk seam.** In the rainforest-slope thaw, one melted
patch ends on a straight line that matches a terrain-chunk boundary. The off
capture shows a faint seam in the same place, from the terrain bake's per-chunk
inputs (the lateness term reads `macroTint` and the ridge curvature). The thaw
sits right on the coverage threshold there, so the field makes the seam stand
out. Follow-up: find which baked input steps across that chunk edge. It is not
in the field, which is continuous in canonical space.

Captures: `tmp/snow-field-review/orphan/{off,on}/{storm,thaw}/*.png`;
side-by-side sheets (off | on | ×6 difference) in `tmp/snow-field-review/compare/`.

### 5.2 Field pass cost

`benchField` in the review script forces 200 draws, drains the queue, and
subtracts 200 empty submits, five rounds. It runs at cover 1 with the browser
held in the native foreground (`passed: true`, focus never lost):

| Round | 1 | 2 | 3 | 4 | 5 | **median** |
| --- | --- | --- | --- | --- | --- | --- |
| ms per pass | 0.099 | 0.009 | 0.077 | 0.053 | 0.037 | **0.053** |

So the pass costs about **0.05 ms** of GPU time, well under the 0.3 ms budget.
It is drawn only while there is storm snow, and then only when an input
changes: the window moves 64 m, the drift creeps during snowfall, or the sun
moves during a thaw. A held storm under a still wind draws nothing per frame.
In the `qa:perf` GPU timestamp samples (every 8th frame) the pass never showed
up during a walk, because it was not being drawn.

### 5.3 Frame A/B in a storm (`qa:perf`)

`npm run qa:perf -- --headed --qa move --speed walk --x -1945 --z 7795 --yaw 20
--warmup 20 --duration 12 --settle --gpuTimings 1`, against the `3af7bb12`
snapshot with `?storm=1&stormKind=snow&stormSnap=1&snowField=0|1`, in the order
on, off, (on), off, on. Every run below held the native foreground. The second
field-on run (`on-b`) lost focus and was discarded; `on-c` replaced it.

| Run | fps | frame p50 / p95 / p99 (ms) | hitches | GPU avg / p50 / p95 (ms) |
| --- | --- | --- | --- | --- |
| on-a | 100.5 | 9.5 / 13.5 / 16.1 | 0 | 4.56 / 4.41 / 5.14 |
| off-a | 98.8 | 9.6 / 13.5 / 17.4 | 1 | 4.63 / 4.40 / 6.88 |
| off-b | 98.6 | 9.6 / 13.7 / 17.2 | 1 | 4.51 / 4.35 / 5.15 |
| on-c | 96.0 | 9.8 / 14.1 / 26.8 | 1 | 4.59 / 4.45 / 6.48 |

GPU average, on minus off: (4.56 + 4.59)/2 − (4.63 + 4.51)/2 = **+0.005 ms**.
The two sides overlap run to run, and on-c's p99 comes from its single hitch.
The timestamp sampler (every 8th frame) caught the snow pass once in on-a, at
0.002 ms. While walking, it is drawn only when the 512 m window steps.

A first attempt at `--warmup 8` without `--settle` failed the harness gate on
**both** sides: streaming and pipeline compiles caused hitches of up to 1.8 s.
Those numbers are not authoritative and are not used.

## 6. Follow-ups

- The chunk seam the thaw exposes (§5.1): find which baked terrain input steps
  across that chunk edge.
- Settlement roofs take no storm snow yet (storm plan §5.2 follow-up). When
  they do, they should read `stormSnowCoverAt`, so the field applies to them
  too.
- The far terrain (`MacroFarTerrainView`) keeps the global cover by design. A
  coarser second window would only be worth it if a distant thaw reads too
  uniform.
