# Water and shore quality review — October 19, 2026

Status: visual review and implementation brief. This is not a declaration of
AAA quality or a completed rendering change.

## Direction

The strongest improvements are **removing visible construction patterns,
making banks read as natural materials, and composing vegetation into habitats**.
The reviewed water already has useful depth, ripples, reflection and light.
More effects or uniformly denser vegetation would leave the most conspicuous
problems intact.

Keep the polished stylized fantasy direction: readable shapes, restrained
surface detail, connected palettes, and believable responses to light and wind.
Use large masses, smaller groups and fine detail together. Avoid applying the
same contrast and detail density to every part of the frame.

This review concerns the coast, open sea and imported river in the
[October 18 gallery](../../tmp/visual-followup-2026-10-18/comparison.html).
The [annotated review](../../tmp/visual-followup-2026-10-19/review.html) connects
the observations to their exact image regions and diagnostic captures.

## Provenance and scope

Pulled clean `main` to `8b178832dec9010e88e71b046328e1f4278faffd` before review.
The earlier images use `3e20d115`; the terrain material, material modules, water
material and sea shading inspected here are unchanged between those revisions.
Later streaming/performance work is present on current main. The completed
[world look implementation](../world-look-implementation-2026-10-18.md) already
addresses plant lighting, wind structure, dead crowns, ground pigmentation and
flower habitats. Those items must not be restarted based on older evidence.

The final sync also brought in the [next world visual pass](aaa-next-pass-plan-2026-10-18.md),
tree broad-phase correction `61a5b892` and natural-trail width correction
`84ed5bf6`. The controls here remain evidence for frozen `8b178832`; they were
not rerun after that trail change. Replay grass coverage on the new head before
implementing placement changes. This focused review supplies the bank/card
diagnosis for that broader plan, rather than a competing habitat system.

Original images are retained without retouching. Annotation and zoom in the
review page are presentation aids, not simulated improvements. No proposed
look is presented as an engine screenshot.

Stills establish appearance at the sampled views. They do not establish motion,
sound, the quality of every biome or current performance. Another automated GPU
benchmark was active in a separate checkout during this review; no timings from
this pass may be used for performance acceptance.

## Priorities

| Order | Visible issue | Intended result | Delivery scope |
| --- | --- | --- | --- |
| 1 | Bright repeated scallops and large smooth grey ramps beside the river | Continuous bank lighting and readable sediment/rock, without a repeated bright seam | Isolate terrain normals, reflectance and surface color; correct the responsible term before art tuning |
| 2 | Long parallel strips and aligned fragments in the coastal ground cover | Irregular stands with soft edges and useful open ground; no rows at aerial or walking distances | Correct the confirmed card-layer rows and the separate terrain pattern while retaining density and LOD coverage |
| 3 | Bare shore looks like an even border around the water | A connected transition through wet sediment, patches of stones, roots and appropriate shore plants | Reuse shore/wetness/canopy/habitat fields; vary composition at existing placement budgets |
| 4 | Large cloud forms and a broad sun hotspot dominate the water | Readable swell, ripples and depth, with reflections strongest where the view warrants them | Calibrate normal variance, reflection filtering and highlight width together |
| 5 | Similarly bright tree crowns and weak middle-distance landmarks | Distinct foreground, tree groups and distant silhouettes | Tune canopy value and grouping; review atmosphere separately from terrain shape |
| 6 | Fine flecks and silhouettes need motion inspection | A clean image during turns, movement and streaming | Review temporal stability and player-height views before expanding content |

## 1. River banks: fix the light response, then the material

**Visible:** the near river edge has regularly spaced bright teeth. The opposite
bank is a broad, nearly uniform grey slope with an abrupt green boundary. The
near exposed surface is shiny enough to attract attention away from the river.
Trees and rocks cast shadows, so this is not simply a missing-shadow problem.

**Established by the retained controls:** the teeth remain when water geometry
is hidden and when water time changes. Water foam, caustics, refraction, detail
normals and captured reflections are not the source of this particular pattern.
The large central water highlight is a separate sun-glint contribution.

**New completed controls:** a frozen `8b178832` replay reproduces the teeth.
All five controls keep the water geometry hidden and change one terrain input
relative to that baseline:

| Control | Observed result | What it establishes |
| --- | --- | --- |
| Original terrain, water hidden | Bright teeth remain | Reproduces the bank artifact on current source |
| Roughness fixed at 1 | Bright teeth and broad specular glow disappear; faint bank structure remains | The conspicuous white artifact depends on the terrain specular response |
| Geometric face normals | Smooth teeth become hard faceted bands/triangles | The normal field changes the highlight's shape; face normals are not an acceptable final replacement |
| Constant grey albedo | Bright teeth remain | The repeated bright pattern is not painted into the base color |
| Unlit original albedo | Bright teeth disappear; faint underlying structure remains | Lighting creates the prominent white pattern; surface color still needs a separate art pass |

This narrows the correction to **terrain specular/normal coherence**, rather
than water effects or a painted white stripe. It does not yet distinguish baked
normal interpolation, detail derivatives and the wetness roughness override as
the exact generating term. Next isolate the baked normal from its detail
perturbation on a small river-slope fixture, then compare normal filtering and
material-specific wet roughness in the original world pose. Globally setting
roughness to 1 only hides the symptom and is not the proposed fix.

The successful report is
[`bank-retry/report.json`](../../tmp/visual-followup-2026-10-19/bank-retry/report.json):
hardware WebGPU, full readiness, fixed source and zero browser errors. Snapshot
SHA-256: `2e0a61a2e9b6653d08fa3da037d923a3ae054b365fce0f15b5e08940bc97f2a3`.
The first `bank/` attempt failed before applying a control because a browser
evaluation used an unresolved bare module import; it is retained with a failed
verdict. The retry uses a Vite-resolved diagnostic import module. These are
deliberately altered diagnostic views, not proposed final materials.

Source owners:

- `src/editor/materials/TerrainMaterialSurfaceGradientNodes.js`: decoded terrain
  normals and the screen-derivative detail perturbation.
- `src/editor/materials/TerrainMaterialBakedNodes.js` and
  `TerrainMaterialBakeCpu.js`: normal sampling, slope classification, substrate
  blending and near/far representation.
- `src/editor/terrainMaterial.js`: the water-context wetness override mixes
  roughness toward **0.38**. This is a code fact, not yet proof of the scallop cause.
- `config/terrain-material-bake.yaml`: slope-driven rock weights and substrate
  roughness/color profiles. A steep carved bank can look mineral; inspect the
  actual weights before replacing that material.

After correcting the artifact, make sediment and rock distinguishable. Use a
darker wet margin, muted silt/mud or sand according to the local habitat, broken
gravel deposits and exposed stone where supported by the substrate. Match their
roughness to their physical character. Do not make all wet ground mirror-smooth
or turn all river banks into beaches.

Keep material transitions irregular at metre scale and detail subordinate to
the bank shape. Ground vegetation should thin into exposed patches rather than
stop at a conspicuous painted boundary. Prefer existing substrate and water
context owners over a second shoreline-classification system.

**Acceptance:** no repeating bright teeth in the original river pose, a second
river heading and low-angle sunlight; useful material differentiation under
overcast light; no chunk seams or new camera-distance bands. Preserve imported
river course, bed/collision agreement and canonical water levels. Any actual
channel-shape change is a separate versioned geography task.

## 2. Grass: remove repetition at the responsible scale

**Visible:** the coastal left middle distance has long parallel green strips;
the foreground has sparse, similarly spaced upright fragments. This is visible
in settled stills and must not be dismissed as temporary loading.

Two current code paths correspond to different scales of repetition:

1. Terrain `groundCover` uses two sine-based strand directions with fixed
   global orientation. The primary direction is `[0.88, 0.47]`, frequency 2.8,
   and the cover blends in over 30–120 m. Noise warping already exists; simply
   adding another noise layer is not a sufficient diagnosis.
2. `meadowGrassGeometry.createStableInstances` produces the same R2 point
   sequence for each tile; `meadowGrassCompaction` translates it to the tile
   center. Blade yaw is already varied. Repeated tile coordinates are a code
   fact, but do not by themselves identify the strips in the screenshot.

**New completed layer controls** on frozen `8b178832` establish both contributions:

| Control | Observed result |
| --- | --- |
| Blades hidden | Sparse foreground stems disappear; the prominent rows of green clumps remain |
| Cards hidden | The prominent clump rows disappear; the near stems remain; finer parallel terrain marks are exposed |
| Blades and cards hidden | Fine directional terrain marks remain across the middle-distance land |

The [grass report](../../tmp/visual-followup-2026-10-19/grass/report.json)
passes source, hardware, readiness and browser-error checks. This establishes
**card-layer repetition plus a separate terrain pattern** in this view. It does
not prove that repeated tile coordinates alone cause the card rows. The next
card controls should separate placement, atlas silhouette and ground alignment
on slopes, with camera heading and height varied independently.

Inspect `meadowCardMaterial.js` and the card atlas alongside placement: clump
width, silhouette edges and the single root height must not form a conspicuous
row when the camera rises above the grass. Preserve good standing-height cover.

For terrain, replace the continuous directional read with short, low-contrast
streaks confined to irregular patches and quiet gaps. Filter fine detail against
the pixel footprint. Preserve the mean substrate color across distance bands.

For a demonstrated tile repeat, use a deterministic per-tile offset/rotation of
the placement sequence, with wrapping inside each tile, rather than fresh random
positions each update. Keep nested rank prefixes, worker/main agreement,
world-anchored wind and floating-origin invariance. Verify sparse and dense
stands: decorrelation must not introduce boundary gaps or density spikes.

**Acceptance:** no recognizable rows at 0°, 45° and 90° camera headings or when
seen from above; no persistent bare handoff ring; zero missing/below-density
eligible in-view tiles after recovery. Preserve current instance and residency
budgets. Compare the deterministic movement/revisit matrix if placement changes.

## 3. Shores: compose transitions instead of scattering ornaments

Use the existing signed water boundary, wetness, slope, canopy and habitat fields
to form several connected scales of composition. Suggested initial art ranges,
to be judged in-world rather than treated as universal constants:

| Scale | Role | Example |
| --- | --- | --- |
| 10–30 m | Larger groups and quiet open intervals | An exposed bank interrupted by one reed pocket and a stone outcrop |
| 2–8 m | Habitat patches | Damp sedges, roots beneath a tree, drifted gravel on a shallow margin |
| 0.1–1 m | Contact and material detail | Small stones, litter, wet darkening and short broken blades |

Use habitat-appropriate plant assets and retain empty ground where it makes
sense. Break the rhythm with varied group size, orientation and setback from
the water. Embed stones through placement/contact and group several around a
larger anchor rather than spacing identical pointed stones evenly.

The coast's white waterline also needs a motion check. Foam should appear in
broken stretches associated with wave energy and local contact. A continuous
uniform outline should not be the main device separating water from land.
Existing surf, swash and foam breakup already exist; tune their coupling after
the bank problem is isolated.

**Acceptance:** three separated coast/river positions, player and elevated
views, visibly distinct shore habitats, stable identities after eviction/return.
Redistribute existing candidates before raising counts. No new biome IDs,
extra residency ring or per-stone scene-object architecture.

## 4. Water: balance reflected forms and surface structure

**Visible:** large blue/white reflected cloud shapes dominate open water. At the
coast they compete with the shallow bed, while the river has a broad white sun
hotspot. Neither observation proves reflections should be removed.

The renderer already has several unequal swell components, crossing detail,
normal variance and roughness-dependent reflection filtering. The filter is a
bounded three-sample kernel; the reflection targets have no mip chain. Sea
roughness starts at 0.055 before storm and variance contributions. At that base
roughness the planar filter's outer offset is only about 0.275 source texels.
This gives a specific calibration point, not a measured per-pixel roughness map.

Owners: `SeaSurfaceShading.js`, `SeaRippleShading.js`, `RiverSurfaceShading.js`,
`StylizedWaterMaterial.js`, `src/render/reflections/WaterReflectionFilter.js`
and `WaterReflectionController.js`.

Recommended sequence:

1. Review fixed poses at grazing, ordinary standing and elevated angles, under
   clear and overcast light. Inspect roughness and normal variance directly.
2. Keep broad swell for shape, intermediate ripples for breaking reflected
   forms, and restrained fine detail close to the camera. Let exposure and wind
   select the mixture; avoid making every patch equally rough.
3. Calibrate filtering to the unresolved normal distribution and view footprint.
   Preserve strong grazing reflections and enough calm-water reflection to read
   the sky. Avoid solving the problem with global reflection opacity or blur.
4. Narrow/balance the river highlight only after comparing roughness and glint
   in multiple sun directions. Keep depth/absorption visible below it.

A larger reflection kernel or prefilter is conditional on these comparisons.
It needs a measured quality/cost case. Additional screen copies, reflection
targets and per-frame mip generation are not assumed free.

**Acceptance:** swell and depth remain readable in the three original views;
no stamped white crest pattern; no moving noise carpet, sparkle or smeared
reflections during a slow turn; water/CPU wave phases and waterline behavior
remain consistent. Repeat the water route and hardware timing gates.

## 5. Trees, depth and contact

The river canopy has many similarly bright green crowns against a smooth,
light floor. The coast has a useful curved outline, but tree spacing and the
uniform low growth make its middle distance feel evenly populated.

The recent tree morphology and lighting fixes remain foundations. Improve group
composition with connected canopy masses, occasional clearings and a restrained
mix of ages within the correct species/habitat. Review leaf interior shadow and
sky contribution under noon, backlight and overcast before changing saturation.
Connect roots to soil/litter patches and small understory groups.

For distance, compare fog-off and normal views while keeping exposure fixed.
Aim for three readable depth ranges. Do not remove all atmospheric perspective
or manufacture distant mountains to conceal flat source geography. An authored
landmark on existing land can add orientation without altering the map.

**Acceptance:** tree groups remain distinguishable at thumbnail size and retain
depth at full size; trunks and stones feel connected to the ground; near/far
representations retain color and silhouette during turns and revisits.

## Delivery and quality gate

Complete one **river-bank and adjacent meadow slice** first: artifact correction,
materials, shore composition, then reflection balance. Keep every existing
comparison pose, including awkward views. Expand to coast and lake only after
this slice holds up from player height and in motion.

For each package retain fixed-source before/after images and relevant layer
controls. Review at 1600 × 900 and 1920 × 1080, and with noon, overcast and low sun.
Use clips for slow pans, walk/sprint, stopping, shoreline crossing and returning
after eviction. Existing automated tests establish contracts; they do not award
an art-quality score.

Use [performance QA](../perf-qa.md) for acceptance: hardware WebGPU, isolated
rendering load, native foreground ownership, fixed sources, zero browser errors,
p95 ≤33.3 ms, hitch rate ≤2%, full scenery recovery ≤2 seconds and complete
recovered grass coverage. Report worst frames and resource/upload costs as well.
Those limits are the current project floor; a consistent 60 FPS target would
require separately specifying target hardware, resolution and a 16.7 ms budget.

## Primary references

These support the approach, not a claim that this renderer already matches the
referenced games or should copy their engine architecture.

- Guerrilla's [GPU-Based Procedural Placement in Horizon Zero Dawn](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn)
  describes artist-defined procedural rules assembling connected environments
  around the player. The applicable lesson here is habitat composition and
  controllable rules; migrating placement to GPU is not a prerequisite.
- Naughty Dog's [Rendering Rapids in Uncharted 4](https://advances.realtimerendering.com/s2016/index.html)
  separates geometric and visual water motion into controllable procedural
  components. This supports reviewing the scales together while preserving
  this project's canonical water model.
- The same course's [Temporal Antialiasing in Uncharted 4](https://advances.realtimerendering.com/s2016/index.html)
  discusses image cleanliness and shader aliasing in full game environments.
  Motion acceptance is essential; stills alone cannot establish it.
