# Coastal rendering findings

## The angular band came from submerged swash wetness

The original band remains visible with optical refraction disabled, with a flat water surface and with the entire water mesh hidden. The exposed bed shows the same edge in both unlit color and roughness. Disabling the seabed swash contribution removes the abrupt step. The depth and bed-height views show the underlying shelf. [Diagnostic captures](screenshots/02-depth-diagnostics/)

The boundary crosses the interiors of both wire grids. Water coverage, ocean classification and the waterline fade reach full weight there. White water-opacity output extends across both sides at this refractive high-tier pose. The hard material step is visible between samples from adjacent depths on the same seabed surface, including away from the streamed page border. The terrain and water meshes use the same fixed 2 m grid in the captured area.

The terrain shader samples ocean appearance inside a bounded height range. Below 17 m of depth it returns zero. Inside that boundary it returned a full ocean weight for an uninterrupted ocean, even as the other bed properties were already fading. Analytic swash uses that weight for submerged wetness. Crossing the sampling limit therefore applied a step to darkening and material roughness before refraction or transparency sampled the bed. The step followed the height contour over the triangles.

The terrain ocean weight now uses the existing 10–17 m seabed fade, reaching zero at the same cutoff as the texture reads. It shares the fade calculation with the other sediment properties and the shelter response. The raw classification still supplies shelter reconstruction. Sand, reefs, the submerged wetness response, surface displacement and foam continue to use their existing models. The shoreline is outside the adjusted depth range.

The change uses the same terrain and water geometry, textures, samplers and terrain page data. The same world-space height subtraction and chunk-slot bindings continue to work after an origin snap or terrain edit. The shader integration test fails against the original identity expression and passes with the shared fade.

## Diagnostic ranges

These are shader values before presentation and color conversion. Canvas pixels include the normal render and display pipeline.

| View | Values |
| --- | --- |
| Terrain and water wire | Orange terrain triangles and cyan water triangles aligned to the real 2 m shared grids |
| Raw water depth | Black at 0 m, white at 12 m |
| Displaced surface height relative to still field | Black at −1 m, middle gray at zero, white at +1 m |
| Water-field bed height and geometric terrain height | Black at −16 m, white at 0 m of world elevation |
| Coverage, ocean identity, waterline fade, final opacity | Black at 0, white at 1 |
| Spectral transmission | Linear RGB channel transmission from 0 to 1 |
| Depth palette | Resolved RGB sea palette before water composite |
| Seabed albedo, normal and roughness | Unlit material outputs. World height uses the terrain mesh. Normal axes are mapped from [−1, 1] to [0, 1]. |
| Shore distance | Black at 0 m, white at 80 m |
| Breaker | Black at zero breaker forcing, white at full forcing |

The [canonical transects](logs/curved-coast-transects.json) compare CPU water queries, the resident worker's half-float values, the triangle-interpolated bed, and a flat-normal spectral transmission reference. All 127 samples intersect ocean coverage of 1, and the near transect crosses the `17:83` / `17:82` page boundary. The largest difference between a rendered triangle bed height and the field's reconstructed bed height is 0.026 m across these samples.

The samples include RGB8 readings from the depth, coverage, palette, transmission and opacity captures at each nominal still-water projection. Those channels include the display transform, and displacement can shift the actual surface fragment. The [negative-coordinate beach transect](logs/signed-beach-transect.json) crosses `-71:58` / `-70:58` and records 63 ocean and 12 dry samples.

Four screen-space probe pairs straddled the suspect seabed contour at 16.81–17.62 m deep. Across four pixels, the sum of absolute 8-bit RGB changes fell from 105–242 before the fix to 0–10 after it. A separate pair at the shelf lip traverses 15.64–13.16 m of projected seabed. It retains a visible contrast after the fix and in the swash-off capture. The wireframes and height field show the slope there. [Raw pixel and ray samples](logs/seabed-edge-probes.json)

## Foliage at 16 interstage variables

The pulled `main` contains the varying reduction from `3e418938`. It packs the three tint channels and the dry-patch factor of the understory into one `vec4`, preserving the shader inputs. The older error log preceded that change. A headed RTX 4080 run requested a device limit of 16, confirmed that effective limit on the device, and rendered the overhead headland with zero browser or WebGPU validation errors. The physical adapter reports 28. The capture validates the restricted device on that adapter. [Restricted-device capture](screenshots/08-grass-and-foliage/device-16-headland.png) · [Previous validation errors](../coastal-review-2026-11-20/logs/gpu-headland.json)

## Foreground grass streaks

The streaks disappear when the distant meadow cards are hidden and remain when the near blade meshes are hidden. The cards intentionally rotate around a vertical axis to face the camera. From above, their projected height shrinks and the billboard clumps read as short parallel lines. The focused improvement is an elevation-aware fade from cards to the existing terrain grass cover, with a separate aerial and eye-level comparison. [Cards hidden](screenshots/08-grass-and-foliage/no-grass-cards.png) · [Blades hidden](screenshots/08-grass-and-foliage/no-grass-blades.png)

## Water acceptance

The earlier measured-navigation timeout came from waiting for the focus position to change after page autostart. The pulled runner now waits for the QA API, explicitly restarts at the discovered spawn, verifies the position, then waits for recording. The native foreground gate still covers discovery and measurement. The Windows self-start path separately failed with `spawn EINVAL` when it tried to execute `npm.cmd` directly. The runner now invokes the local Vite entry point through `process.execPath` and includes the native focus record in early focus failures.

The headed RTX 4080 run launched its own server and passed every route, focus, caustics and pacing gate with zero browser or GPU validation errors. It recorded 10.3 ms frame p95, 0.07% hitches and a 0.70 ms maximum on the isolated projected-caustic effect. The complete passage included entering water, swimming, diving, surfacing and returning dry. [Hardware acceptance report](logs/water-acceptance-headed.json)

On Windows, the original headless binary reported an NVIDIA adapter and then failed `requestDevice()` with `DynamicLib.Open: dxil.dll Windows Error: 87`. The app selected its WebGL renderer and the route harness timed out during discovery before a swim attempt. The full Chromium binary created both core and compatibility WebGPU devices under the same headless flags. Windows headless acceptance now launches that channel. [Device probe](logs/headless-device-probe.json)

The first full Chromium headless run completed all navigation phases on the NVIDIA backend with zero browser or GPU validation errors. It measured 19.2 ms frame p95 and a 9.90 ms maximum on the isolated projected-caustic effect, above the 4 ms gate. The frozen-snapshot repeat passed every gate with 19.3 ms frame p95, 1.20% hitches and a 0.50 ms maximum on the isolated effect. The headed result supplies the native-foreground timing evidence. [First full Chromium run](logs/water-acceptance-headless.json) · [Passing headless repeat](logs/water-acceptance-headless-retry.json)

## Surf and shelter

The fixed-camera series uses water moments at 123.4, 124.6, 126.0 and 127.6 seconds. Narrow foam and the wet front change position in the normal beach sequence. Storm frames show wider breaking crests, more offshore whitecaps and stronger waterline foam. The inner cove shows a quieter run-up, including in the storm. The calm controls reduce offshore wave amplitude and swash run-up height to 30% while preserving the shoreline and camera. The normal swash remains subtle from the aerial views.

The two headland probes measured CPU transmission of `1.000` windward and `0.224` in the lee. Their corresponding water-field appearance samples measured `0.998` and `0.226`. The cove controls measured `0.230` and `0.248` with diffraction on and `0.996` and `1.000` with it off. Persistent swash reported 698 eligible input texels at the exposed beach and 840 at the cove. At the rocky storm pose, 20 airborne droplets were visible at 130.533 s and 4 remained at 131.033 s. The wave sequence and shelter comparisons use the shipped surf forcing and opacity settings for normal and storm. [Headland and cove](screenshots/05-headland-and-cove/) · [Surf and foam](screenshots/06-surf-and-foam/)

Low and medium also receive the corrected seabed transition through the shared terrain material. Low still reveals distant seabed silhouettes through its cheaper transparency, as seen in the prior low-tier beach review. Medium retains directional surface shading and the paler shallows of its optical fallback. High and ultra show the stronger spectral color and the moving shallow-water detail. [Matched four-tier capture](screenshots/07-quality-comparison/) · [Previous low-tier beach](../coastal-review-2026-11-20/screenshots/01-open-beach/low.png)

## Remaining issues by severity

1. **Medium.** Curved-coast medium-tier median frame intervals exceeded the 5% review threshold in both pairs. The fresh pair measured 4.90 to 5.50 ms, with p95 at 7.70 ms. [Performance review](performance.md)
2. **Low.** Far meadow cards read as repeated streaks in steep aerial views. The grass controls isolate the card layer. [Grass captures](screenshots/08-grass-and-foliage/)
3. **Low.** The low-tier fallback reveals distant seabed silhouettes. Normal swash remains subtle in wide aerial views. [Quality captures](screenshots/07-quality-comparison/) · [Surf captures](screenshots/06-surf-and-foam/)
