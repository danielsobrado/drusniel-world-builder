# Stonehold meshlet prototype

**Decision. Keep standard instancing and the existing authored LODs for the
current Stonehold kit.** Native Three.js meshlets cut the main-view triangle
count by 29–36% in the overview, but increased CPU submission and total GPU
pass time. `three-virtual-geometry` cost about 4–4.6× the baseline GPU p95 on
these fixtures and accumulated tracked allocations during repeated reloads.
Revisit native meshlets when a denser source asset makes raster work the
measured bottleneck and its intended material qualifies for conversion.

## Original hardware results

Captured on 20 November 2026 in headed Chromium 151.0.7922.34, NVIDIA RTX 4080
(Lovelace), at 1280 × 720. All 12 retained runs held native foreground focus.
One interrupted timing attempt was discarded and repeated. The accepted run
logged zero browser or GPU validation errors. This is an isolated asset test
on one GPU.

Times are milliseconds. Each cell gives the range across the two retained runs
for p50, then p95.

| Fixture | Path | Frame p50 / p95 | Render CPU p50 / p95 | GPU render + compute p50 / p95 |
| --- | --- | ---: | ---: | ---: |
| Fang Shrine | Baseline | 0.2–0.3 / 0.4 | 0.1 / 0.2 | 0.147–0.148 / 0.170–0.172 |
| Fang Shrine | Native | 0.4 / 0.6–0.7 | 0.2 / 0.4 | 0.172–0.173 / 0.199–0.200 |
| Fang Shrine | External | 0.3–0.4 / 0.5–0.7 | 0.2 / 0.3–0.4 | 0.662 / 0.713–0.714 |
| Twin Outcrop | Baseline | 0.3 / 0.5–0.6 | 0.2 / 0.3–0.4 | 0.242–0.243 / 0.293–0.297 |
| Twin Outcrop | Native | 0.5 / 0.7–0.8 | 0.2–0.3 / 0.4–0.5 | 0.247–0.250 / 0.300–0.302 |
| Twin Outcrop | External | 0.4 / 1.3–1.4 | 0.2 / 1.2 | 1.211–1.219 / 1.334–1.341 |

Both arms lowered GPU render pass time. Native culling and LOD selection added
0.061–0.073 ms at p50. External compute added 0.569 ms for the shrine and
1.074–1.077 ms for the outcrop at p50. Native frame time peaked at 1.9 ms and
external at 2.4 ms across the timed routes. The baseline peaked at 1.4 ms.

| Fixture | Path | Main-view asset triangles, overview / distant | Direct / indirect draws, overview |
| --- | --- | ---: | ---: |
| Fang Shrine | Baseline | 336,192 / 336,192 | 4 / 0 |
| Fang Shrine | Native | 237,760 / 158,720 | 2 / 2 |
| Fang Shrine | External | 313,323 / 273,936 | 2 / 4 |
| Twin Outcrop | Baseline | 757,296 / 757,296 | 4 / 0 |
| Twin Outcrop | Native | 481,600 / 421,888 | 2 / 2 |
| Twin Outcrop | External | 684,950 / 584,439 | 2 / 4 |

The baseline uses one ordinary instance batch for both the main view and the
shadow pass. Reducing triangles had little opportunity to save draw calls on
these fixtures. The native triangle counts include meshlet padding.

## Compatibility and lifecycle

- **TownKit and fallback.** The real material uses double-sided rendering and
  alpha-to-coverage, which r187 excludes from its meshlet path. The external
  arm also leaves that material on standard instancing. The dusk and snow
  captures matched the baseline within 0.001% of pixels at the comparison
  threshold. Both forced WebGL cases drew on the standard path. [Three.js renderer integration and compatibility](https://github.com/mrdoob/three.js/pull/35191)
- **Shadows, reflections, and origin shifts.** In the non-reflection views the
  native and external captures differed from baseline by at most 0.48% and
  0.21% of pixels, respectively. The 8,192 m shift changed 0.75–1.38% on the
  baseline and 0.77–1.39% with meshlets. Native and external reflector captures
  differed by up to 0.48% and 1.62%. The external Fang Shrine reflection
  capture visibly drops part of the nearest shrine in the main view when the
  reflector is active. An earlier native trial with a front-sided reflector
  surface generated a WebGPU feedback-loop error. The accepted comparison
  routes the reflector surface through standard drawing and keeps meshlets
  active for the Stonehold asset.
- **Preparation.** Native preparation took 120–280 ms. The external import
  took 450–557 ms on first load and 31–54 ms on a cached import, followed by
  243–252 ms of compile time. External geometry replacement needed explicit
  precompilation to restore the asset reliably in the reload capture. After
  that change, each arm returned to within 0.02% of its pre-reload image.
- **Memory.** Renderer-tracked allocations at the first overview were
  49–51 MiB for baseline, 53–58 MiB for native and 107–108 MiB for external.
  After three release and reload cycles, baseline and native settled at
  49–52 MiB and 54–61 MiB. The external counter rose on every cycle and reached
  375–379 MiB despite disposing each import and retiring its pool. This is a
  production blocker pending allocation and disposal verification on the
  graphics backend.

The [original hardware report](qa/stonehold-meshlets/original.json) and
[baseline](qa/stonehold-meshlets/shrine-baseline-reflection.webp) and
[external reflector captures](qa/stonehold-meshlets/shrine-external-reflection.webp)
are committed. The complete screenshot set is in `tmp/stonehold-meshlets-hardware/`.
The earlier native reflector validation error is in
`tmp/stonehold-meshlets/report.json`. The earlier external reload mismatch is
in `tmp/stonehold-meshlets-verified/report.json`.

## Review follow-up

The dense test uses a deterministic, displaced cliff with 523,264 triangles.
Its conventional near and far meshes sample the same shape at 50,880 and
4,512 triangles. The stock-kit comparison also includes its shipped far meshes.
Both authored arms use the runtime's 100 m town-edge threshold and 20 m
hysteresis on a fixed batch. The runner verifies that both LODs draw on each
timed route. The dense arms share a front-sided stone PBR material with color
and normal maps. Their geometry detail differs by design, so the comparison
measures cost at those quality settings.

The 54 dense captures passed on the same RTX 4080 with zero browser or GPU
validation errors. GPU p95 in milliseconds across both runs follows. The
occlusion columns use native culling with hierarchical depth disabled or
enabled. The enabled arm retains Three.js's built-in occlusion heuristic.

| Resolution | Instances | Authored LODs | Native, occlusion off | Native, occlusion on |
| --- | ---: | ---: | ---: | ---: |
| 1080p | 1 | 0.125–0.126 | 0.410–0.414 | 0.398–0.410 |
| 1080p | 16 | 0.258–0.259 | 0.870–0.878 | 0.895–0.916 |
| 1080p | 100 | 0.785–0.786 | 1.421–1.520 | 1.325–1.449 |
| 1440p | 1 | 0.213–0.221 | 0.536–0.553 | 0.546–0.552 |
| 1440p | 16 | 0.364–0.366 | 1.158–1.217 | 1.160–1.174 |
| 1440p | 100 | 0.912 | 1.779–1.888 | 2.219–2.246 |
| 4K | 1 | 0.453–0.461 | 0.867–0.874 | 0.967–0.969 |
| 4K | 16 | 0.656–0.665 | 1.810–1.835 | 1.807–1.834 |
| 4K | 100 | 1.249–1.255 | 2.960–2.964 | 2.942–2.948 |

Authored LODs had the lowest GPU p95 in every cell. Native meshlets rendered
the denser source and layered rock detail. At 4K with 100 copies the first
native overview submitted 9.21 million padded main-view triangles with depth
culling disabled and 8.14 million with it enabled. The corresponding GPU p95
improvement was about 0.01 ms. This fixture provides a measured price for that
extra detail and a reason to retain authored LODs as the default.
[Dense capture JSON](qa/stonehold-meshlets/dense.json) ·
[Authored cliff](qa/stonehold-meshlets/cliff-authored.webp) ·
[Native cliff](qa/stonehold-meshlets/cliff-native.webp)

### Shipped LODs and visual gates

The 16 stock-kit timing captures also passed. The authored arm chose the
3,442-triangle far shrine on 226 of 480 pacing frames and the 11,712-triangle
far outcrop on 302 of 480 frames. The outcrop's GPU median fell from
0.241–0.243 ms with the near mesh held throughout to 0.093–0.094 ms with authored
switching. Its p95 remained close to 0.295 ms in both arms and was 0.303 ms with
native meshlets. The shrine's authored p95 was 0.172–0.173 ms, compared with
0.206–0.208 ms for native. [Stock-kit capture JSON](qa/stonehold-meshlets/kit.json)

The visual checks use reference renders with the subject hidden, shadows
disabled, and the reflector active with an empty scene. They measure silhouette
coverage, shadow gaps, reflected geometry, and foreground coverage when the
reflector activates. Each check counts the worst loss over 32 × 32 pixel tiles
with at least 64 selected pixels. The native arm passed all four checks for
both stock assets. With the external arm the nearest shrine lost foreground
coverage on 3,750 pixels. The worst tile lost 50.9%, above the 20% gate.

### Buffer lifetime

The Fang Shrine lifecycle probe counts WebGPU `createBuffer` and explicit
`GPUBuffer.destroy()` calls by usage. It also samples dedicated and shared
WDDM memory for Chromium's own GPU process after the queue drains. This probe
runs separately from the timing captures. Its control creates and destroys a
16-byte staging buffer and verifies that a second destroy does not double-count.

| Path | Tracked storage after reloads 1 / 2 / 3 | WDDM dedicated after reloads 1 / 2 / 3 |
| --- | ---: | ---: |
| Baseline | 0 / 0 / 0 MiB | 170.5 / 170.5 / 166.8 MiB |
| Native | 6.1 / 6.1 / 6.1 MiB | 176.8 / 176.8 / 176.8 MiB |
| External | 148.3 / 237.7 / 327.2 MiB | 317.8 / 411.5 / 495.7 MiB |

The external arm created 379.9 MiB of storage buffers and explicitly destroyed
52.7 MiB by the third reload. The 327.2 MiB difference tracks the WDDM growth
while the document is open. WDDM dedicated memory fell to 37.2 MiB after
navigating away. The storage category dominates the growth. The allocation
interception tracks explicit destroys, and WDDM reports process totals.
Neither identifies which live references retain individual buffers. The first
baseline WDDM sample was unavailable, and all three reload samples succeeded.
[Buffer lifecycle JSON](qa/stonehold-meshlets/buffers.json) ·
[Upstream geometry pool](https://github.com/elad12390/three-virtual-geometry/blob/main/src/core/runtime/GeometryPool.ts)

## Reproduce

The prototype runs in the existing `stonehold-qa.html` asset viewer. The query
parameters `meshlets=baseline|authored|native|external` and `material=static`
select the comparison. The viewer's default material is TownKit. `occlusion=1`
enables native hierarchical-depth culling. `module=Dense_Cliff` selects the
generated cliff in the authored and native modes.

```powershell
npm run dev -- --host 127.0.0.1 --port 5197 --strictPort
node scripts/run-stonehold-meshlet-qa.mjs --url http://127.0.0.1:5197
node scripts/run-stonehold-meshlet-qa.mjs --url http://127.0.0.1:5197 --suite buffers --out tmp/stonehold-buffers
node scripts/run-stonehold-meshlet-qa.mjs --url http://127.0.0.1:5197 --suite dense --out tmp/stonehold-dense
```

Close other app tabs and leave the Chromium QA window foreground. The runner
requires hardware WebGPU, timestamp queries and retained native foreground focus
on Windows. It writes the JSON report and screenshots to `tmp/stonehold-meshlets/`.
`--out` selects a different artifact directory. `--modes baseline,native` limits
the comparison to native meshlets and the baseline.

`npm run build:qa` builds the game and both standalone QA pages into
`tmp/qa-dist`. `npm run preview -- --outDir tmp/qa-dist` serves that build.
The production build has only the game entry. The dense runner also accepts
`--resolutions 1080,1440,2160` and `--copies 1,16,100` to select subsets.

## Method

- The original experiment compares 16 copies of the Fang Shrine (21,012
  triangles each) and Twin Outcrop (47,331 each), using their shipped near
  meshes. All three paths use the same
  opaque, front-sided material with the settlement rock texture and the same
  light, fog, and directional shadow map. The first comparison disables both
  occlusion systems and disables the external library's LOD blending. Both use
  their default one-pixel main-view error threshold.
- Each fixture runs baseline → native → external and then in reverse order on
  fresh pages in the same browser. After 100 warmup frames, a 480-frame camera
  orbit approaches and backs away from the scene with two abrupt turns. A
  separate pass samples 60 identical poses with GPU timestamps. Frame times
  come from animation callbacks, CPU times cover synchronous render submission,
  and GPU totals sum render and compute pass durations. GPU sums exclude queue
  wait and inter-pass gaps. The CPU and frame measurements exclude timestamp
  readbacks.
- A fresh external import uses one geometry pool sized to fit the full-detail
  workload. It uses the package's IndexedDB cache on subsequent imports.
  Startup metrics distinguish preparation from compile and time to first frame.
  Reported memory uses Three.js allocation estimates. Driver VRAM and process
  memory require separate measurements.
- The viewer records direct draw calls separately from indirect submissions.
  Three.js excludes indirect triangles from its regular counter. The native
  pipeline's main-view count includes padding to 64 triangles per cluster. The
  external pipeline reports main and shadow counts separately. Readback counters
  are sampled at stationary poses after rendering settles.
- The visual run captures near, overview, distant, a synthetic 8,192 m origin
  shift, three near/far geometry replacement and unload/reload cycles, and a
  planar reflector. It also checks snow and dusk with the real TownKit material,
  plus forced WebGL fallback. A screenshot diff counts pixels where any RGB
  channel changes by more than 20 of 255. The isolated viewer exercises the
  renderer's secondary-camera and resource paths. World chunk streaming,
  weather simulation, the water acceptance route, and workshop transactions
  remain unverified with meshlets.

## Upstream

- [Three.js r187 meshlet drawing pipeline](https://threejs.org/docs/pages/MeshletDrawingPipeline.html)
- [Three.js renderer integration and compatibility](https://github.com/mrdoob/three.js/pull/35191)
- [three-virtual-geometry setup and WebGPU requirements](https://elad12390.github.io/three-virtual-geometry/guide/getting-started)
