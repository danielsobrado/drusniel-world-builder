# Biome looks

`config/biome-looks.yaml` is the per-biome look table: one row per terrain tile
id (Azgaar's standard biomes 0–12, custom biomes 32–254) that every layer
dressing a biome reads its column from. `src/editor/biomes/BiomeLooks.js`
resolves it to dense per-tile tables; `applyBiomeLooks.js` hands the load-time
columns out before the layers' own validators run.

| Column | Read by | How |
|--------|---------|-----|
| `canopy` | trees (`forest/forestLeafTint.js`) | crown hue as a ratio against the species' lit crown |
| `snow.ground` | terrain bake and far terrain `snowBiomeCover`, grass gate | one source for both terrains, so they cannot drift apart |
| `snow.canopy` | tree meshes and impostors (`forest/canopySnow.js`) | per-instance snow, capped on upward-facing foliage |
| `snow.grass` | meadow palette and growth | tips lean to `snow.frost`, stands settle shorter; no extra palette or draw |
| `snow.air` | `SnowCountryWeight.value` | cooler, paler sky and haze (`snowCountryLook.js`), exposure, ambient snow region, frost, breath, soundscape |
| `snow.fall` | `SnowCountryWeight.snowfall` | regional snowfall (`weather/snow_system.js`, one instanced draw) |

Above the terrain's snow line every snow column reaches 1 whatever the biome.

## Canopy snow

Snow per tree is the larger of its biome's `snow.canopy` and the snow band at
its height, drifted ±20 % per grove. It costs no vertex buffer: a tree leaf part
is near WebGPU's eight, so it rides `instanceLeafTint.w` (now a vec4) on meshes,
and the integer part of the crown-width channel on impostors
(`TreeAppearance.packImpostorWidth`), whose appearance vec4 was full. The cap
keys on a blend of the card normal and the direction out of the crown's bounds:
card normals alone sprinkled white flecks through conifers. No texture, no
light; snow's shade takes the sky fill (`foliageLight.fill`) instead of the
leaf's transmission.

Crowns painted with snow (the alpine conifers' COLOR_0) keep their paint and
take the cap on top.

## A/B

`?biomeSnow=0` zeroes every snow column (docs/perf-qa.md). Measured on
2026-10-19 at the taiga pose (`chunk-cross`, warmup 25, two pairs, order
swapped): on 106.5 / 114.0 fps, p50 7.9 / 7.5 ms; off 92.7 / 80.7 fps, p50
7.7 / 8.0 ms. The 0.5–2 s stall at the start of motion appears in both.
