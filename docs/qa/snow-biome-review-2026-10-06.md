# Snow biome comparison — 2026-10-06

Compared the local Gods’ End snow implementation and `screenshots/snow.jpg` with
the world builder. The ground now has sheltered powder, wind exposure, compacted
paths, centered cavity shading, and backlit scattering based on that reference.
Cold-biome groves consistently use snow-laden alpine conifers, and snowfall and
footfall powder have been brought closer to the donor. A full landscape match
still needs a separate lighting and exposed-rock pass.

## Reference and findings

Reference checkout: `/home/drusniel/drusniel-gods-end`. The relevant sources are
`public/snow.yaml`, `src/world/SnowSurface.js`, `src/world/snowShadingNodes.js`,
`src/world/snowNoiseNodes.js`, and `src/world/SnowAtmosphere.js`.

| Area | Before | Change |
| --- | --- | --- |
| Powder and wind | Relief used a fixed exposure of 0.55 everywhere. | Exposure responds to terrain aspect and a broad field; sheltered patches reduce relief and texture detail. |
| Paths | Dirt paint could cover snowy paths; compaction mainly reduced relief. | Snow suppresses dirt paint and its verge. Compacted routes become blue, smoother, and less grainy. |
| Cavities | Only packed-map AO was used. | The packed height channel now shapes crests and hollows, with cool cavity tint and distance filtering. |
| Roughness | Snow inherited the material family's 0.92 roughness. | Surface roughness defaults to 0.7, varies across relief, and approaches 0.4 under compaction. |
| Slopes | Planar relief could extend onto steep faces; height was wrapped before taking texture gradients. | Relief fades on steep faces; detail follows the surface tangent plane. Side projections run only where needed, and height derivatives stay continuous. |
| Light | Sparkles followed overall sky brightness; there was no transmission lobe. | Sparkles and scattering explicitly use the resolved snow normal and direct-light color/intensity. Backlit snow gains a restrained blue transmission lobe. |
| Trees | Generic green conifers competed with the snow-laden assets; biome tint could recolor painted snow. Mountain profiles stopped accepting trees at 30–40 m. | The two alpine crowns are preferred in taiga/tundra. Vertex-painted crowns keep their colors across mesh/impostor bands; loading proxies retain their average painted color. Sparse tundra stands fade between 620 and 700 m; glacier remains bare. |
| Snowfall | Regional snowfall was capped at 0.3 and its shader reduced both flake density and opacity. | Coverage drives snowfall from 0.2 to 0.7, with an eased transition at 1.2/s. The field uses the donor's single opacity fade and retains its existing 12,000 seeded flakes, three populations, gust integration, and origin handling. |
| Particles | Footfall powder used a flat sky-brightness multiplier. | Powder now has spherical diffuse lighting and warm forward scattering, with cool fill and bounded size for inactive slots. Existing diamond dust and ground spindrift remain active over snow. |

The Snow007C textures were already present and correctly shared. No new texture
assets, rendering passes, resident rings, terrain IDs, or collision displacement were
added. Tree candidate budgets remain unchanged, though the altitude fix permits
existing tree pools on previously bare mountain terrain. Biome preferences are
excluded from the impostor image signature, preserving existing baked atlases.
Azgaar glacier remains terrain ID 11 and tundra remains ID 10. Existing
accumulation, snow wakes, and footprints remain in use.

The new tuning block is `stylizedSurface.snowSurface` in
[editor.config.yaml](../../editor.config.yaml). It controls calm patches,
compaction, roughness, cavity strength, relief tone, and transmission. The existing
`enhancements.snowRelief` switch continues to control analytic relief.
Regional snowfall is tunable in [weather-effects.yaml](../../config/weather-effects.yaml).
`preferredTileIds` on an authored tree variant steers its species toward that
prototype in those biomes without bypassing its `tileIds` eligibility.

## Remaining opportunities

1. **Regional light balance.** Gods’ End lowers ambient/environment fill and
   strengthens a low, warm sun over snow. The builder currently increases ambient
   intensity in snow country. A separate preset-aware pass could make drifts and
   mountain silhouettes read closer to the reference while preserving night and
   weather transitions.
2. **Glazed steep rock.** Gods’ End adds patchy blue ice and frozen seepage where
   cliffs shed snow. The builder's current accumulation exposes rock there, but
   lacks that dedicated ice response. Keep it keyed to the canonical snow band
   and slope rather than introducing a new generic terrain ID.
3. **Compare a mountain scene as a whole.** The donor has a fixed authored valley
   and unusually large characters. The builder streams an Azgaar world at human
   scale. Match camera height, sun direction, weather, and slope before judging
   landscape parity from screenshots. The isolated surface checks below do not
   certify complete scene parity.

## Validation

The rendered acceptance fixture exercises the real snow detail and lighting
modules. It checks visible powder/compaction changes, unchanged snowless ground,
dark lighting, adjacent-chunk coordinates, and floating-origin rebasing. It also
captures negative canonical coordinates and exercises the actual baked normal
before and after bake readiness. The fallback now reads geometry directly so
using the normal in color, roughness, and lighting cannot recurse through the
material's own completed normal. The runner checks browser errors and
requires an identified hardware WebGPU adapter and shares the existing GPU lock.
The fixture also loads the real alpine GLBs through the production leaf material,
and checks visible falling/moving snow, diamond dust/spindrift, and footfall powder
that rises and settles. Fine ice grains are checked for local pixel contrast
instead of demanding that tiny crystals alter a large fraction of the image.
Night snowfall is compared under a dark sky and reduced sky-light uniforms.

```bash
npm run dev
node scripts/run-snow-surface-qa.mjs --url http://localhost:5173
```

From WSL, use native Windows Node to run the same script with hardware Chromium:

```bash
node.exe scripts/run-snow-surface-qa.mjs --url http://localhost:5173
```

Targeted snow, terrain-material, forest, weather, ambient, impostor, and wake tests:
172 passed. An additional 45 tree appearance, LOD, and impostor runtime checks
also pass (some overlap the targeted suite).
ESLint passed for the changed code. The production build passed.

All 16 rendered checks passed on NVIDIA Lovelace hardware WebGPU, with zero
browser errors. Results: `tmp/snow-biome-qa-final/report.json`.

- [Snowy crowns and falling flakes](../../tmp/snow-biome-qa-final/biome-snowfall.png)
- [Fine ice grains and spindrift](../../tmp/snow-biome-qa-final/biome-particles.png)
- [Footfall powder](../../tmp/snow-biome-qa-final/powder-kick.png)
- [Actual tundra movement capture](../../tmp/snow-review/snow-biome-after.png)

Performance captures and rendered results are recorded under
`tmp/snow-review*` and `tmp/snow-surface-qa-final`. The snow movement route starts
at `(-2072, 2264)` in the procedural world with seed 918273, then runs forward for
12 seconds using `chunk-cross`, eight seconds of warmup, and the settle gate.
Before/after sources are frozen separately for this route.

| Capture | FPS | Frame p95 / p99 (ms) | Maximum frame (ms) | Hitches >33.3 ms |
| --- | ---: | ---: | ---: | ---: |
| Original, first | 103.93 | 12.1 / 14.5 | 31.6 | 0 |
| Original, repeat | 100.96 | 12.6 / 18.95 | 34.4 | 3 |
| Updated biome, first | 117.26 | 10.5 / 13.79 | 33.3 | 1 |
| Updated biome, repeat | 114.95 | 10.72 / 13.15 | 28.9 | 0 |

All four passed the settle gate on the same hardware, with zero browser errors.
Terrain page assignments (80), uploads (56), and texture upload bytes (5,620,608)
were unchanged. Terrain commit p95 stayed at 0.1 ms; stylized p95 was 1.9–2.1 ms
originally and 1.6 ms after the changes. These route-specific results do not
certify every mountain or imported-world workload. The strict zero-hitch target
was missed in the first updated run; its lone frame included 16.1 ms in the player
phase. The repeat met the target.

Accepted originals: `snow-review-perf-snow-before-final.json` and
`snow-review-perf-biome-before-repeat.json`. Accepted updated captures:
`snow-review-perf-biome-after.json` and `snow-review-perf-biome-after-repeat.json`.
The earlier `snow-review-perf-snow-after-final.json` is the intermediate surface
pass before the tree/particle/snowfall extension.

Earlier distant-spawn captures were rejected: the initial snapshot did not allow
the shared Basis transcoder files, and subsequent distant runs hit the existing
object spatial-index bucket limit on an origin snap. Those reports are diagnostic
artifacts, not accepted performance evidence. Use the accepted files listed above.
