# Lighting and atmosphere

Highfield's first lighting pass reuses the regional sky, day/night clock,
hemisphere fill, HDR environment, directional shadows and aerial perspective.
Geometry, shadow-map resolution and render passes are unchanged.

| Benchmark condition | Time selector | Weather mode | Intensity |
| --- | --- | --- | --- |
| Clear midday | Highfield (day) | off | 0 |
| Golden-hour sunset | Emberfall (golden hour) | off | 0 |
| Dry overcast midday | Highfield (day) | overcast | 1 |

Highfield uses a restrained blue sky, warm sunlight and less ambient fill to
retain shaded form. Emberfall keeps a warm low sun against cooler fill with
slightly denser distance haze. Their exposure scales are 0.96 and 0.94; the
existing scene finish still owns tone mapping and grading.

Overcast is weather layered over any time or regional look. It closes the
cloud deck, reduces direct light relative to fill, widens the existing shadow
filter and removes distinct cloud shadows at full cover. It starts no rain or
storm system and adds no rain wetness. Regional snowfall still follows the
existing snow-country rules. Choosing another weather mode clears the cloud
cover through the existing transition.

The HDR environment previously retained its morning intensity throughout the
day/night and weather cycle. Its intensity now follows resolved linear light
energy from the sun and hemisphere, relative to the configured sky. A late HDR
load uses the latest scale. The reference is explicitly the configured look,
instead of the default meadow preset. Exposure is applied only at the output.
The existing HDR texture is reused; this is an indirect-light approximation,
not real-time global illumination or a dynamically recaptured reflection.

## Reproducible acceptance

```sh
node --test test/lighting-atmosphere.test.js test/sky-look.test.js test/sky-region.test.js tests/SkyAmbient.test.js test/weather-controller.test.js
npm run dev
node scripts/run-world-visual-lighting-qa.mjs --highfield --out tmp/lighting-atmosphere/visual
npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 12 --settle --drain-seconds 5 --out tmp/lighting-atmosphere/perf.json
```

The three-view capture holds the grassland pose (`original-04`), geometry and
camera fixed, uses fresh contexts, and checks scenery readiness, converged
lighting, loaded HDR, zero rain wetness, one cinematic finish and browser
errors. It records the resolved look and environment intensity. As with the
full lighting suite, use a clean committed checkout or the immutable source
server for accepted captures.

Compare performance with the same route and hardware before and after, following
[the movement QA guide](perf-qa.md). Acceptance budgets remain p95 at or below
33.3 ms and hitch rate at or below 2%, with successful settling and hardware
WebGPU. Investigate streaming counters and CPU phases before adding lighting
passes. The earlier scenic-tour hitch counts are not a measured baseline for
this change.

Accepted on hardware on 2026-10-31 (NVIDIA WebGPU, frozen copies of the code).
The three-view capture passes. It first showed blue holes under full overcast:
the look lowered cloud density by a fixed offset, and a clear-skied region raised
it back, so density now eases to an absolute lid. Regional personality cannot
reopen it.

`chunk-cross`, one focused run each side, 0e359b28 before and this pass after:

| | FPS | p50 | p95 | p99 | Hitches |
| --- | --- | --- | --- | --- | --- |
| Before | 130.0 | 7.2 ms | 10.8 ms | 17.4 ms | 3 (0.19%) |
| After | 109.9 | 7.9 ms | 15.9 ms | 32.4 ms | 9 (0.68%) |

That is inside the p95 and hitch-rate budgets, but it is a visible cost, not
noise-level, and one run a side cannot apportion it. The p99 sits just under the
33.3 ms hitch line, so bisect the shader changes before spending more there.
