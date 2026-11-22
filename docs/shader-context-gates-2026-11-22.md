# Shader and pass context gates (2026-11-22)

Different parts of the world need different shading: desert or ice,
indoors or out, under water or above it, day or night, storm or clear. The
engine has **no single schedule** that maps an area to the shaders it needs.
Each feature carries its own gate. This page lists every gate, so we can see
what runs where, and spot work that runs where it does not apply.

## 1. How context reaches the GPU

There are four mechanisms, from cheapest to most expensive to switch:

| Mechanism | Switches | Cost when it does not apply | Example |
| --- | --- | --- | --- |
| **Values** in an always-compiled shader: uniforms, table rows by tile id | every frame, free | ALU of the inactive term, unless it sits behind a runtime `If` | biome-looks rows, regional sky, day/night, storm covers |
| **Runtime branch** (`If(weight > ε)`) inside a shader | per pixel, free | almost none: the branch is skipped | arid dressing, snow detail, rock detail, grass volume |
| **Pass on demand**: a field, compute or post pass drawn only while its context holds | per frame | none while idle | snow and sand field, snow deformation, ripples, underwater pipeline |
| **Shader variant**: a different material compiled for the context | needs a compile, so prewarm it or build it lazily | none for the variant not in use | water refraction near the camera, location (indoor) scenes |

Rules that follow from this (CLAUDE.md, the perf investigations):

- A biome is **rows in tables**, never a tile-id branch in code
  ([adding a biome](adding-a-biome.md)). The rows select values and runtime
  branches inside the shared shader.
- **Whole-frame nodes** (`viewportDepthTexture`, `viewportOpaqueMipTexture`)
  cost the same whether one mesh or forty use them, visible or not. Only a
  **variant without them** saves anything
  ([perf-investigation-2026-07-28](perf-investigation-2026-07-28.md)).
- Swapping variants at runtime causes pipeline compiles. So variants are few,
  are prewarmed or built lazily on approach, and are never swapped per biome.

## 2. Compile-time switches (config)

Each one compiles the feature in or out for the whole session. Off means
byte-identical shaders, wherever that is proven.

| Switch | Compiles | Default | Proof of off |
| --- | --- | --- | --- |
| `weatherEffects.snowField.enabled`, `?snowField` | storm-snow readers sample the field (terrain, rocks, crags, trees, meadow) | on | [storm-snow-field](plans/storm-snow-field-2026-11-21.md) §4 |
| `weatherEffects.sandField.enabled`, `?sandField` | terrain sand drift; sandstorm dust lee fetch; field alpha | on | [desert-sand-field](plans/desert-sand-field-2026-11-22.md) §3 |
| `stylizedSurface.wetness.field`, `?wetnessField` | ground wetness readers | on | [wetness-field](plans/wetness-field-2026-11-22.md) |
| `surfaceCoatings` (`registerSurfaceCoatings`) | snow and moss coats on rocks, towns, trunks | per config | [surface coatings](surface-coatings-2026-11-17.md) |
| `render-enhancements.yaml`: `snowRelief`, `crownShadows`, `shadowCascades`, `waterReflections`, `detailVisibility`, `oceanFft` (each with a `?` override; `?enhancements=high`) | terrain snow relief, crown shadow casters, cascades, reflection probes, the offshore FFT | see file | not hashed |
| `water-visual.yaml` `qualityTier` → `resolveWaterQualityFeatures` | water depth optics, foam, refraction, intersection foam | high | not hashed |
| Post-processing preset (off, low, balanced, high, ultra) | GTAO, bloom, DOF, grain, vignette in the graph | per preset | [post-processing](rendering/post-processing.md) |
| Location quality tier (`LocationCatalog` `quality.tiers`) | ice post, ice transmission (viewport nodes), ice layers | per tier | — |
| Mobile profile (`applyMobileStartupProfile`, `resolveRenderEnhancements` `mobile`) | one cascade, no water reflections | width < 768 | — |

## 3. Passes and compute: what runs each frame, and when

Costs are GPU times from the `qa:perf` timestamp sampler in a hot-desert
sandstorm walk (`docs/qa/desert-sand-field-2026-11-22/perf/on-b.json`),
unless another source is given. "—" means not measured.

| Pass | Gate | Cadence when active | GPU cost |
| --- | --- | --- | --- |
| World wind field (`WorldWindPass`, 128²) | **always** (grass and trees sway in calm air too) | every frame | 0.004 ms |
| Storm snow + sand field (`SnowFieldPass`, 128²) | snow or sand cover > 0, and that field enabled | when inputs change; **every frame while snow falls or sand blows** (the drift creeps) | 0.003 ms sampled, 0.018–0.05 ms bench |
| Ground wetness field (`WetnessFieldPass`, 128²) | inputs changed; not more often than `intervalSeconds` | bounded | 0.004 ms ([wetness report](plans/wetness-field-2026-11-22.md)) |
| Snow deformation sim (`GpuSnowDeformSim`, compute 512²) | snow country > 0.05 or storm snow cover > 0.05 | every frame | — |
| Spindrift and high-mountain snow (`GpuSnowComputeField`) | snow country weight > 0 (0 dispatches outside) | every frame | — |
| Water ripples (`RippleField`, 256²) | biome ripple settings enabled; skips once quiet | every frame while stirred | — |
| Coastal swash (`CoastalSwashField`) | WebGPU, coast enabled, camera near ocean (`nearOcean`) | every frame near a coast | — |
| Offshore FFT (`OceanFftController.prepare`) | sea and `offshoreFft` enabled, WebGPU, tier | **every frame, anywhere in the world** | `ocean-fft-slope` 0.004 ms; the FFT compute itself is not in that list |
| Grass trample field (`GrassTrampleField`) | `enabled` in config | every frame | — |
| Water reflections (`WaterReflectionController`) | enhancement enabled; water within `reachMeters` (96 m) | every `intervalMs` (500) | — |
| Hi-Z occlusion (`GpuOcclusion`) | enabled; probes every 30 frames when culling is not paying | per frame or per probe | — |
| Shadow map | sun | every frame | 0.13 ms |
| Post graph: GTAO, bloom (10 passes), output | preset | every frame | GTAO 0.04, bloom ~0.05, output 1.9 ms |
| Underwater pipeline (`UnderwaterCausticsPostProcess`) | camera submerged or at the waterline (`active`) | every frame under water; **not drawn above** | — |
| Settlement procedural surfaces (`SettlementProceduralBaker`) | a settlement approached | once per set, async | seconds, off the frame |
| Terrain material bake | chunk streamed in | per chunk, budgeted | — |

## 4. Inside the terrain shader

The terrain is one material for the whole world. It reads each biome's rows,
and the costly parts sit behind runtime branches.

| Feature | Gate | Kind |
| --- | --- | --- |
| Arid sand and mineral dressing | `arid` rows; `If(amount > .001)` | row + branch |
| Snow detail, snow surface, glacier ice | baked snow weight; glacier rows; `If` inside | row + branch |
| Snow deformation trenches | `gpuSnowDeformUniforms.active` and weight `If` | uniform + branch |
| Rock detail | `If(rock > 0.02)` | branch |
| Grass volume (far cover) | `If(mask > 0.002)` | branch |
| Feature cracks, transitions | `If` on base and reach | branch |
| Storm snow and desert sand | one shared field fetch per pixel, plus a few ALU | **always evaluated** (multiplied by cover 0 in clear weather) |
| Snow drift colour (`TerrainDriftNodes`) | weights | always evaluated (ALU only) |
| Wetness, puddles, rain ripples | wetness and rain uniforms | always evaluated |

## 5. By context

| Context | What changes | Mechanism |
| --- | --- | --- |
| **Biome** (desert, ice, wetland…) | terrain look, grass palette and habit, rocks, water tint, ripples, prints, dunes, snow columns | rows → values and branches; biome assets stream in (`StylizedVariantResidency`) |
| **Region** (macro climate, altitude) | sky, haze, fog, sun hardness | `SkyLookController` values ([sky-regions](sky-regions.md)) |
| **Snow country** | snow air, spindrift, deformation sim, regional snowfall | weight → passes on demand + values |
| **Weather** | precipitation particles, storm covers, wetness, wind gusts, sea state | `StormState` channels → values; field passes on demand |
| **Day and night** | sun, sky light, exposure, emissive | values only |
| **Near water** | refraction variant, reflections, ripples, swash | variant within range; passes on demand |
| **Under water** | fog, optics, caustics | separate pipeline drawn only under water |
| **Indoors (locations)** | its own `THREE.Scene`, materials, post, light pool; ice effects per site | separate scene; variant by site kind and quality tier |
| **Towns** | surface dressings | loaded on approach (`SettlementSurfaceLibrary`) |
| **Quality** | post graph, cascades, water features, location ice | compile-time per session |

## 6. Work that runs where it does not apply

These are found by reading the gates, not measured in each context.

1. **Offshore FFT runs inland.** `OceanFftController.prepare` steps the
   spectrum and dispatches the FFT every frame, even in a desert hundreds of
   kilometres from the sea. Its slope pass showed up in the desert perf run.
   A `nearOcean` gate like the coastal swash's would idle it inland. The
   compute cost is not measured.
2. **The storm field's ground patch rebuilds in clear weather.**
   `SnowFieldPass.update` calls `ground.update` every frame. This rebuilds a
   129² height patch on the CPU (1 ms yield per frame) each time the camera
   moves 64 m, even while snow and sand cover are both 0 and nothing draws.
   The wetness field does the same under the deferred-work budget. Fix: skip
   the patch while there is no cover to draw. Then it would need one
   `settle()` on the first storm frame.
3. **The storm field redraws every frame during snowfall and sandstorms.** The
   drift creeps continuously. The measured cost is about 0.2 ms CPU per frame
   in a sandstorm ([desert-sand-field](plans/desert-sand-field-2026-11-22.md)
   §4.3). Stepping the drift offset (e.g. 0.25 m) would bound it to a few
   draws a second.
4. **The grass trample field has no area gate** that this survey found. It
   draws every frame when enabled, including over deserts, snowfields and
   water. Check whether its update returns early off grass before changing it.
5. **Minor:** the terrain evaluates the storm-field fetch and the drift colour
   ALU everywhere. Both are cheap, and branching on the covers would not save
   the fetch's binding. Leave them.

Nothing on this list needs a per-area shader schedule. Each needs its gate
tightened in the same way as the gates in §3 that already work.

## 7. Keeping this page true

When adding a shader feature or a pass, add a row here: its gate, its
cadence, and its off proof or measured cost. A whole-frame node or a new pass
without a gate is the case to stop and ask about.
