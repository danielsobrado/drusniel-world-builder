# Desert sand field and world-wind weather particles (2026-11-22)

**Status:** shipped on, behind `weatherEffects.sandField.enabled`
(`config/weather-effects.yaml`, `?sandField=0|1`). It applies the
[storm snow field](storm-snow-field-2026-11-21.md)'s techniques to desert
ground and the weather particles. Commits: `b74d7a3b`, `0752bce0`, `a8600363`,
`8ca4d4f7`, `8c5ea1c2`.

## 1. What changed

### 1.1 Particles follow the world wind

The weather particles used to read the UI's fixed `weatherWindX/Z` directly.
Now they read the world wind (`wind/worldWindState.js`), which the UI wind
still steers through `WorldWindPass`:

| System | Before | Now |
| --- | --- | --- |
| Sandstorm dust and haze | UI wind direction; speed fixed by intensity | Prevailing world wind direction (`worldWindUniforms.prevailing`). Speed × the gust at the camera over the mean (`worldWindCamera.envelope` ÷ mean, clamped 0.4–2.5), integrated into its own clock so a gust never jumps a puff |
| Rain (WebGPU field and WebGL) | UI wind × camera gust | Camera sample direction × the UI-default speed it was tuned under × camera gust, as the snow already did |
| Sunbeam motes, wind ribbons | UI wind | Prevailing direction. Their travel is time × speed, so a varying speed would sweep every mote; only the direction follows |
| Snow | already the camera sample | unchanged |

The sandstorm dust takes the *prevailing* direction, not the local sample.
Every puff's position depends on the direction, so the field's curl would
swing the whole cloud around the camera.

A sandstorm is now a gale for the world: `stormTargetForSettings` gives
`sandstorm` a wind channel equal to its level. Grass, trees, sea and the wind
bed answer it, and the field's drift creeps at the storm's envelope. The dead
`applyWindWeatherToMaterials`/`clampWindWeatherSettings` helpers and the
`windX/Z` plumbing into rain, snow, sandstorm, motes and ribbons are gone.

**Dust thins in the lee.** With the sand field on, each sandstorm puff makes
one level-0 fetch of the field per vertex at its centre (`sandShelterAt`). It
loses up to `dustThinning` (0.5) of its alpha where the sand gain says the
wind slackens. There is no per-pixel fetch. Off, the dust compiles as before.

### 1.2 Windblown sand on desert ground

During a sandstorm, desert biomes gather sand in lee hollows, at the foot of
slopes and outcrops, and in streaks along the wind. They keep it afterwards,
and it blows away over `fadeSeconds` (40 min).

- **`SandCover`** (`weather/storm/SandCover.js`) mirrors `SnowCover`. It builds
  toward the sandstorm's intensity over `buildSeconds` (300 s), fades over
  `fadeSeconds`, snaps under `?stormSnap=1`, and holds `frozen = { value }` for
  QA. `main.js` writes it into `stormSandCoverUniform`. The input is
  `weatherController.sandstorm`, the dust's own intensity.
- **No second pass.** `SnowFieldPass` writes a sand gain into its alpha
  channel. It reuses the same slope, lee, hollow, steep and drift terms, with
  its own gains:
  `sand = max(0, (flatGain + leeGain·lee + hollowGain·hollow − steepLoss·flatGain·steep) × (1 + driftContrast·(2·drift − 1)))`.
  Sand does not melt, so there is no sun term. The pass draws while either
  cover lies. The drift creeps at `max(snowFall, sandFall)`, and a frozen
  `SandCover` holds it still. The snow channels R, G and B are untouched.
  With sand off, alpha stays `1` and the pass compiles as before.
- **On the terrain, only on desert rows.** Desert is the biome-looks
  `arid: sand` row (hot desert 1, Stonehold Badlands 32), matched the way
  `AridSubstrateNodes` matches it. It is never a tile-id branch.
  `TerrainStormSandNodes.js` splits the work into three nodes:
  - `stormSandDrift`: sand cover × field gain, broken by the macro tint as storm
    snow is. It is zero past sand's angle of repose (~34°) and on open water.
  - `withStormSand`: lays the drift into the bare-ground weight,
    `dirt = max(baked, drift)`, and the other families give way in proportion,
    as `withStormSnow` does for snow. Drifts bury the stone, scrub and litter
    between them. Storm snow is laid after it, so snow covers sand.
  - `withFreshSandColor`: lifts the final colour by `paleness × drift` (0.25).
    A hot desert's erg is already all bare ground, so weights alone showed
    nothing there (§5.1). Fresh windblown sand is finer and paler than the
    wind-sorted lag, and that is what shows the drifts on an erg.
- **One fetch.** The terrain's fragment stage has no sampler to spare. The
  terrain builds one `stormFieldSample` and passes it to both the sand and the
  snow reader. A field fetch shared *between* materials changes their WGSL:
  `positionWorld.xz` swizzles are cached objects. So the sample is built per
  material and never cached globally.

Rocks and meadow take no dusting. Their files (`rockWeathering.js`, the meadow
blade materials) carry other sessions' uncommitted work, and the task allowed
skipping them.

## 2. Files

| File | Role |
| --- | --- |
| `weather/sandstorm_system.js`, `rain_system.js`, `snow_system.js`, `meadow.js`, `wind.js`, `weather_settings.js`, `weather_controller.js` | Particles on the world wind; `sandstorm` getter |
| `weather/storm/StormState.js` | Sandstorm wind channel |
| `weather/storm/SandCover.js` | Build, fade, snap, QA hold |
| `weather/storm/snowField/sandFieldConfig.js` | Defaults, validation, `?sandField` override, registration |
| `weather/storm/snowField/SnowFieldPass.js` | Sand gain in alpha; draws for either cover |
| `weather/storm/snowField/snowFieldState.js` | `stormFieldSample`, `stormSandCoverAt`, `sandShelterAt` |
| `weather/storm/stormGroundUniforms.js` | `stormSandCoverUniform` |
| `materials/TerrainStormSandNodes.js`, `TerrainMaterialBakedNodes.js`, `TerrainStormSnowNodes.js` | Drift, weight lay, fresh-sand colour, shared fetch |
| `weather/rainNodeMaterial.js` | Dust lee thinning (one vertex fetch) |
| `config/loadEditorConfig.js` | Resolves the config; `?weather=<mode>` opens on that weather |
| `main.js` | Builds `SandCover`, feeds the pass |
| `config/weather-effects.yaml`, `config/biome-looks.yaml` | `sandField` block; `arid` column notes the sand |
| `tests/desertSandField.test.js` | Config, rows, off identity, WGSL on (WebGPU and WebGL), `SandCover`, gale and gust |
| `scripts/sand-field-wgsl-hashes.mjs` | Device-free WGSL hashes for any source tree |
| `scripts/run-sand-field-review.mjs` | Native captures, in-app WGSL, field-pass bench, relief scout |

## 3. Off switch: byte-identical shaders, no GPU work

**Node, device-free** (`node scripts/sand-field-wgsl-hashes.mjs [root] --sand on|off`,
vertex:fragment sha256/12, `docs/qa/desert-sand-field-2026-11-22/node-wgsl-*.json`).
The base is the tree before these commits:

| Shader | Base | Off | On |
| --- | --- | --- | --- |
| storm field pass / WebGPU | `e433f3ae5039:6e1edacdb735` | identical | differs |
| storm field pass / WebGL | `0ccb01e90b06:66be2b663f93` | identical | differs |
| sandstorm dust / WebGPU | `2f9d8e6fdbcf:215bb6f475bb` | identical | differs |
| sandstorm dust / WebGL | `f1ecf34f7d70:b5cc40346a10` | identical | differs |
| sandstorm haze, alpine rock, crown (both backends) | — | identical | identical |

The storm-snow readers (alpine rock, rock weathering, crown, trunk) also hash
identically with the snow field on, before and after the `snowFieldState`
refactor (`scripts/snow-field-wgsl-hashes.mjs --field on`).

**In the app, every material in view.** `run-sand-field-review.mjs` reads the
WGSL of every terrain, meadow, rock, tree and weather material from the cached
pipelines, at the tor-field pose during a sandstorm. The base is commit
`fa9843a1`: `8c5ea1c2` with only this work's files restored to `fe237f7c`, so
other sessions' commits in between do not count.

- **Off against base: 82 of 82 identical**, including `terrain-slot-0`
  (fragment `440f4776` on both) and the sandstorm puffs.
- **On against off: 2 of 82 change:** the terrain (`b6d8c92`) and
  `weather-sandstorm-puffs`. Nothing else reads the sand.

**No GPU work when off.** The pass draws for sand only while
`sandCover > 0` *and* the sand is on. With both snow and sand off,
`createSnowFieldPass` returns null as before. `SandCover` is a few CPU
operations per frame.

## 4. Native results

Hardware WebGPU (NVIDIA Lovelace, not a fallback adapter), 1600×900, headed
Playwright, served from a frozen snapshot of `8c5ea1c2`
(`serve-world-visual-snapshot.mjs`) with `?sandField=0|1`.

### 4.1 Captures: sandstorm and aftermath at 15:00

`node scripts/run-sand-field-review.mjs --url http://localhost:5241 --poses …`
uses three elevated views (45 m, pitch −0.5) over the procedural world's hot
desert. The scout (`--scout 8`) picked them for relief and tors:

- `tor-flats` (−12049, 1413): the erg's edge against savanna.
- `scrub-band` (9375, −11): the erg against a scrub band.
- `tor-field` (−5687, −85): open erg with a tor field.

The `storm` state is `setLighting({ weather: 'sandstorm' })` with
`SandCover.frozen = { value: 1 }`. The `after` state is clear weather with
`SandCover.frozen = { value: 0.5 }`. All 12 captures completed with no
browser errors. Every window centre lay on whole 4 m texels: (−12048, 1412),
(9376, −12) and (−5688, −84).

Mean absolute pixel difference, on against off (% of pixels > 8):

| State | tor-flats | scrub-band | tor-field |
| --- | --- | --- | --- |
| storm | 4.1 (19.0 %) | 5.9 (29.5 %) | 8.8 (51.6 %) |
| after | 3.7 (6.0 %) | 3.3 (5.6 %) | 3.9 (10.2 %) |

**Reading.** In the aftermath the change is confined to the desert tiles. The
difference stops at the lobed border with the savanna. There, drifts read as
soft paler sand, streaked along the wind and heaviest in the lee band below
the rise. In the storm, the larger difference is mostly the dust: it thins
in streaky lee bands across the whole view, desert or not, because the dust
is not biome-limited. Evidence is in `docs/qa/desert-sand-field-2026-11-22/`
(`compare-off-on-diff.jpg` is off | on | ×6 difference;
`after-tor-field-closeup-off-top-on-bottom.jpg`; per-pose JPEGs; JSON). The
difference figures include cloud and dust motion, which the QA clock does not
freeze.

### 4.2 Field pass cost

`benchField` forces 200 draws, drains the queue and subtracts 200 empty
submits, five rounds. It runs with sand cover 1 and sand on, with the browser
held in the native foreground (`passed: true`):

| Round | 1 | 2 | 3 | 4 | 5 | **median** |
| --- | --- | --- | --- | --- | --- | --- |
| ms per pass | 0.018 | 0.011 | 0.058 | 0.022 | 0.015 | **0.018** |

An earlier round, which lost focus and is not used, gave a median of 0.055 ms.
The snow report measured 0.05 ms. The pass is well under its 0.3 ms budget
either way.

### 4.3 Frame A/B in a sandstorm (`qa:perf`)

`npm run qa:perf -- --url "http://localhost:5241/?weather=sandstorm&sandField=0|1"
--headed --qa move --speed walk --x -5687 --z -85 --yaw 80 --warmup 20
--duration 12 --settle --gpuTimings 1`, in the order on, off, on, off, on, off.
The first pair (`a`) lost the native foreground and is discarded. Both later
pairs held it.

| Run | fps | frame p50 / p95 / p99 (ms) | hitches | GPU avg / p50 / p95 (ms) | field pass (sampled) |
| --- | --- | --- | --- | --- | --- |
| on-b | 124.0 | 7.3 / 11.7 / 14.7 | 2 | 2.170 / 2.077 / 2.827 | 0.003 |
| off-b | 127.4 | 7.1 / 11.0 / 17.0 | 2 | 2.142 / 2.063 / 2.839 | — |
| on-c | 125.6 | 7.2 / 11.2 / 17.1 | 4 | 2.158 / 2.067 / 2.638 | 0.003 |
| off-c | 128.4 | 6.9 / 11.1 / 17.5 | 4 | 2.140 / 2.044 / 2.801 | — |

GPU average, on minus off: **+0.023 ms**. Frames are about 0.2 ms slower on
(fps −3 at ~126; the render phase 5.04 vs 4.93 ms in pair b).

Most of that is CPU. While a sandstorm blows, the drift creeps every frame,
so the pass is re-drawn every frame, as it already is during snowfall. Its
GPU cost stays 0.003 ms in the sampled timestamps. The 60 FPS floor is far
off. If the CPU share ever matters, a follow-up can bound the cadence by
stepping the drift offset, for snow and sand alike (§6).

## 5. Findings on the way

1. **The erg is already bare ground.** In the procedural world's hot deserts
   the erg is the dirt family, dressed as rippled sand by `AridSubstrateNodes`.
   The brown speckled ground beside them is savanna (tile 3), not desert.
   Laying drifts into the dirt weight alone changed almost nothing (first
   review: aftermath differences 1.4–2.2). Laying them into the grass family,
   tried once, turned the erg green. Hence `withFreshSandColor` (§1.2).
2. **`WorldVisualQa.setLighting` owns the weather.** It resets the mode to its
   own `weather` argument (default off). A review must pass the sandstorm
   through it.
3. **Sharing a texture node across materials changes their WGSL** (§1.2). The
   first refactor of `snowFieldState` cached the fetch by position node and
   changed the crown and trunk WGSL with the snow field on. It is now built
   per material.
4. `0752bce0` alone did not parse: `withStormSnow` already declared `field`.
   `8ca4d4f7` fixed it, and both went out in the same push. The node tests now
   build storm snow over storm sand.

## 6. Follow-ups

- Bound the field pass's cadence during snowfall and sandstorms: step the
  drift offset (e.g. by 0.25 m) so the pass is re-drawn a few times a second,
  not every frame (§4.3).
- Rocks and meadow could take a sand dusting through their existing coverage
  masks, once the sessions editing `rockWeathering.js` and the meadow
  materials have landed.
- Cold desert (`arid: mineral`) takes no sand: its gravel would need its own
  drift look.
