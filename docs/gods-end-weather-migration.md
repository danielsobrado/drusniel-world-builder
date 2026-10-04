# Gods' End weather and texture port

Source: the owner's `/home/drusniel/drusniel-gods-end` checkout.

The precipitation materials and cinematic light shafts are adapted to the
world builder's existing scene, weather controller, terrain/water impacts,
lighting authority and floating origin. Azgaar terrain IDs and world generation
are unchanged.

| Source | World builder integration |
| --- | --- |
| `src/weather/RainSystem.js` | `CinematicRainField.js`, used by `RainWeatherSystem` on WebGPU |
| `src/weather/SnowfallSystem.js` | `snowfall/SnowfallField.js` and `snowfallFieldMaterial.js`, used by `SnowWeatherSystem` on WebGPU |
| `CinematicPipeline.js` light-shaft passes | `GodsEndLightShafts.js`, selected as the `cinematic` god-ray technique |
| `src/world/village/houseTextureData.js` and `src/foliage/leafTextures.js` | Shared `assets/godsEnd` generators, catalog materials, workshop surface presets, and falling-leaf textures |
| `src/water/seaDetail.js` | Shared procedural sea-detail texture and streamed water shading |
| `src/world/snowTextures.js` | Shared snow surface maps and terrain detail shading |

Choose **Rain** or **Snow** in the weather panel. Configure particle counts,
columns, dimensions and snow populations in `config/weather-effects.yaml`.
The donor's lengths and speeds are multiplied by `1.8 / 5` to suit the world
builder's human-sized characters. The rain field spans the existing local
weather area and retains terrain-aware ground and water splashes.

The snow field shares one four-vertex quad between 12,000 flakes. Its fine,
medium and defocused populations keep separate sizes, opacity, fall speed and
lens fading. Seeded population data survives scene reconstruction. Wind drift
uses the donor's analytic gust integral. Canonical position phases are reduced
in double precision on the CPU before shader upload, keeping snowfall stable
through floating-origin snaps without large float32 world coordinates.
The existing snow-country weather policy remains active.

In **Scene settings → God rays → Technique**, **Gods' End** selects the donor's
four-depth-tap sun-source mask and 32-sample radial march. Both passes run at
quarter width and height. The result is added in scene radiance ahead of the
existing cinematic grade, bloom, tone mapping and FXAA. Low-angle sunlight
produces shafts; midday and an off-screen sun suppress them. Snow-country air
raises shaft strength, while the sky controller supplies light tint and strength.
The existing volumetric and screen-space techniques remain selectable and saved
scene settings keep their chosen technique.

Dormant shaft targets warm once, then skip GPU work. Both targets and particle
geometry are released with their owning systems. WebGL keeps its existing
precipitation shaders.

Code port complete. Browser acceptance and performance validation are deferred
at the owner's request; the migration is not yet validated visually.

Commands for the later validation pass:

```bash
node --test test/gods-end-weather.test.js test/snowfall-field.test.js tests/godRaysScreen.test.js
npm test
npm run build
npm run qa:weather:browser -- --headed --url http://localhost:5173
npm run qa:perf:windows -- --qa chunk-cross --warmup 8 --duration 12 --settle
```

For WSL shader acceptance, run `scripts/run-weather-shader-qa.mjs` using native
Windows Node with `--headed --url http://localhost:5173`, while Linux Vite serves
the checkout. The browser runner verifies hardware WebGPU, enters the walking
view, switches each weather mode, records particle counts, and checks both
cinematic shaft targets. Close other rendering tabs and avoid overlapping QA
runs before comparing performance reports.
