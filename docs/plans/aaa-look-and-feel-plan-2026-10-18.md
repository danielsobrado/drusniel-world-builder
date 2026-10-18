# World look and feel: fresh screenshot review and detailed plan

Date: **October 18, 2026**. Status: **proposed implementation backlog**.
This task captures and reviews the current world; it does not change production
rendering, assets, generation, vegetation populations, or gameplay.

The first delivery should address the four problems raised during this review:
**leafy understory moves like grass, flower colors feel disconnected, grass and
ground have too much contrast, and some trees have implausible shapes.** These
affect ordinary exploration more than adding another visual effect.

The target remains a polished stylized fantasy world. Its plants should share
the same light and wind while responding according to their structure. Ground,
roots, vegetation and water should describe one habitat. Distant scenery should
retain enough shape to make places recognizable.

[Screenshot gallery](../qa/visual-audit-2026-10-18/index.html) ·
[Full contact sheet](../qa/visual-audit-2026-10-18/contact-sheet.jpg) ·
[Capture report](../qa/visual-audit-2026-10-18/report.json)

The small [pose manifest](aaa-look-and-feel-2026-10-18-poses.json) is versioned
with this plan so coordinates and camera settings remain available independently
of the local image archive.

## 1. Evidence and capture contract

- Frozen runtime: `74bb4b07da02acd78f2c1f05d4475130f5b7a8a3` on `main`.
- Twelve newly sampled procedural land locations, one per Azgaar ID **1–12**.
  LCG seed `20261018`; **24,309** candidate cells in `[-8000,8000)` on each
  axis. Keep the first occurrence per biome and draw a random yaw on acceptance.
  World coordinates are `X=(cellX+0.5)*2`, `Z=-(cellZ+0.5)*2` metres.
- Procedural generator seed `918273`, version 1, height scale 24 m. Sampling is
  stratified by biome, not proportional to area. Edges, paths and awkward views
  remain in the sample; these are not selected beauty shots.
- Two established coast views and four seeded choices from established Eldara
  fixtures supplement the random positions. Those six coordinates are not new
  random samples. The coast camera is on grassland ID 4, overlooking water;
  this is not an ID 0 camera-cell test.
- Headed Windows Chromium, NVIDIA Lovelace hardware WebGPU, 1600 × 900, DPR 1.
  Player views use FOV 68°, pitch −0.08 radians. Aerial views retain their
  manifest camera settings.
- Highfield at paused noon, manual weather off. Regional air, wind, particles
  and biome snowfall remain active. HUD and clean images are successive frames.
- Production camera cuts, full terrain/scenery/collision readiness, at least
  16 seconds of preparation and 60 consecutive ready frames, plus separate
  static-light convergence. Aerial views first prepare ground collision.
- Require valid tree assets, matching camera-cell biome, fixed source and no
  browser errors. Keep original PNGs and hashes. The contact sheet is only a
  downscaled browsing aid.

The capture result and supplemental motion evidence are recorded in the
[capture notes](../qa/visual-audit-2026-10-18/README.md). Screenshots and video
remain local under the existing `docs/qa/` ignore rule. The plan and capture
scripts are versioned. No image generation, retouching or added color grading
is used.

**Limits:** one position does not characterize a whole biome. The label names
the cell at the camera, not every plant or water body in the frame. Stills cannot
prove wind quality, temporal stability, input feel or sound quality. The
supplemental fixed-camera foliage recording is a narrow motion inspection,
not a movement benchmark. HUD FPS values are not performance evidence.

## 2. Current foundations to preserve

The [October 17 implementation record](../qa/aaa-implementation-2026-10-17/README.md)
and [October 18 waterline fix](../waterline-color-fix-2026-10-18.md) already cover
substantial work. Do not restart their completed tasks based on older images.

| Existing behavior | Consequence for this plan |
| --- | --- |
| Current tree manifests load 29 asset atlases and 29 batches, with the v8 signature and normal encoding. | A strange-looking tree now needs a specific prototype, placement or representation diagnosis. Do not assume the old missing-atlas failure. |
| Near and far terrain share substrate means; ground continuity has GPU fixture coverage. | Strong local grass/soil contrast still needs art review. It does not by itself demonstrate that the old distance-fade bug has returned. |
| Meadow blades already have rounded-width normal shaping, a restrained rib, configured transmission and reduced distant widening. | Keep these improvements. Work on stand depth, silhouette variety and integration rather than implementing them twice. |
| Forest habitat profiles, canopy suppression, regional character and instanced detail layers exist. | Tune and extend these owners. Do not build a competing ecology system. |
| Water has explicit kinds, organic/cold context, signed shore data, shared wave time and interaction pools. | Diagnose residual shoreline appearance through the current domain. Do not infer water kind from cyan pixels or terrain biome alone. |
| Resting HUD layout and performance recovery were improved and accepted in retained QA. | Recheck them after changes; old failures are historical evidence, not current verdicts. |

The [October 17 grass plan](grass-aaa-look-plan-2026-10-17.md) is useful background,
but parts of its code diagnosis predate the subsequent implementation. In
particular, do not repeat its old claims that rounded normals or the configured
transmission power are absent.

## 3. Fresh screenshot observations

These are descriptions of visible pixels. Root-cause proposals follow separately.

| View | Canonical X, Z (m) | Observation and work item |
| --- | --- | --- |
| [01 · Hot desert](../qa/visual-audit-2026-10-18/random-01.png) | −5701, 55 | Directional sand relief is visible, but its continuous parallel rhythm dominates a broad pale foreground. Sparse rocks and a pale tree belt give little middle-distance structure. R5, R7. |
| [02 · Cold desert](../qa/visual-audit-2026-10-18/random-02.png) | 503, −1537 | Ground has different small relief from hot sand, yet a similar yellow-beige overall read. A thin green shore fringe, isolated stones and very pale distant trees carry most of the detail. R3, R5, R7. |
| [03 · Savanna](../qa/visual-audit-2026-10-18/random-03.png) | 14677, 2771 | A broad exposed route leads between a leafy tree and gold grass toward water. Grass edges are conspicuous; pale gaps break up the far field. The left tree has a useful connected trunk/crown silhouette. R3, R5, R6. |
| [04 · Grassland](../qa/visual-audit-2026-10-18/random-04.png) | 13903, 4581 | Dense, similarly bright blades dominate the foreground. Short and tall swaths are present, but exposed ground and blade roots still read as separate surfaces. A pale horizon belt loses crown detail. R2, R3, R4. |
| [05 · Tropical seasonal forest](../qa/visual-audit-2026-10-18/random-05.png) | 13373, −1475 | This view reads as open grassland with white-beige strips and distant trees. Pink/yellow flowers repeat among strongly aligned blades. The sampled direction alone cannot establish missing forest cover. R1–R4, R6. |
| [06 · Temperate deciduous forest](../qa/visual-audit-2026-10-18/random-06.png) | −1831, −12711 | A prominent tall tree has a bare branching upper crown and a compact green mass below it. Sparse short blades expose smooth green terrain; small plants and flowers look detached from the floor. R1–R4. |
| [07 · Tropical rainforest](../qa/visual-audit-2026-10-18/random-07.png) | 12941, −1569 | Pale, flat-looking leafy understory at right differs from the deeper green meadow. Pink/yellow flowers are isolated accents. The white-barked tree at left warrants checking its source and biome eligibility. R1–R4, R6. |
| [08 · Temperate rainforest](../qa/visual-audit-2026-10-18/random-08.png) | 9091, 5753 | Narrow columnar crowns mix with conifers and broadleaf forms above a smooth exposed floor. Bright small flower clusters punctuate sparse grass; little readable litter is visible in this frame. R2–R4, R6. |
| [09 · Taiga](../qa/visual-audit-2026-10-18/random-09.png) | 7917, 6633 | Tiny dark-green blades, pale gaps, purple/yellow flowers and scattered narrow leafy trees produce weak taiga identity in this heading. Bright water at left belongs in a body-aware review. R2–R4, R6. |
| [10 · Tundra](../qa/visual-audit-2026-10-18/random-10.png) | 15001, 8221 | Short dark growth is strongly separated from pale ground; lush green bands appear across the upper slope. Review the actual neighboring IDs and weights before changing classification. R3, R6. |
| [11 · Glacier](../qa/visual-audit-2026-10-18/random-11.png) | −8553, −10021 | Fine snow relief is visible, with sparse rocks and neighboring vegetation in the distance. Broad pale terrain has weak large-scale shape; snow particles supply much of the activity. R5, R7. |
| [12 · Wetland](../qa/visual-audit-2026-10-18/random-12.png) | −7705, −10605 | A turquoise shoreline has a readable wet band and reflections. At right, tall thin stems meet a bright smooth ground patch abruptly. Pointed isolated stones and mixed green/orange crowns need stronger local context. R3, R4, R6. |

Supplemental coastal and imported observations appear in the capture notes and
are used to check whether findings also survive a different world and scale.

![Grass/ground integration and the unusual tree in view 06](../qa/visual-audit-2026-10-18/random-06.png)

![Understory, flower palette and vegetation identity in view 07](../qa/visual-audit-2026-10-18/random-07.png)

## 4. Delivery order

S/M/L describe relative scope, not delivery dates. Every implementation item
must retain the same-pose before/after evidence and its relevant performance
gate. Start with the four user-reported problems.

| ID | Priority / scope | Deliverable | Dependency |
| --- | --- | --- | --- |
| R0 | P0 / S | Retained evidence, layer/prototype diagnosis and review fixtures | Capture baseline first |
| R1 | P1 / M | Structure-aware wind for bushes, broad leaves, flowers and tufts | R0 |
| R2 | P1 / M | A shared lighting and palette contract for flowers and understory | R0; review alongside R3 |
| R3 | P1 / M | Coherent grass/ground value, contact, coverage and habitat edges | R0 |
| R4 | P1 / M | Correct suspicious tree silhouettes and consistent representations | R0; palette input from R2 |
| R5 | P2 / M | Stronger sand, mineral, snow and rock material scale | R3 |
| R6 | P2 / M–L | Distinct forest floors, shore habitats and biome composition | R1–R4 |
| R7 | P2 / M; geography L | Calibrated atmosphere and useful landscape depth | R3–R6; geography is a separate versioned stage |
| R8 | P2 / M | Movement, interaction, sound and HUD acceptance | R1–R7; baseline checks start now |
| R9 | P0 gate / continuous | Performance, persistence, resource and release verification | Every package |

**First review slice:** fix the leafy plant at 07, the flower cluster at 07/08,
the grass/ground relationship at 06/10, and the tall tree at 06. Show the ordinary
player views together. A solution that makes one isolated asset look better but
makes the four-frame scene set less coherent is not ready to expand.

## 5. R0 — Make each defect attributable

1. Replay this manifest without resampling. Add reverse, downward and close
   views only as labeled supplements; retain the original random frames.
2. At 06/07/08/09 record each visible suspect's layer, stable placement ID,
   prototype index, source asset/group, source cell biome, scale, LOD and
   material path. Project those IDs onto a development-only annotated image.
3. Compare normal rendering with ground-only, blades-only, understory-only,
   flowers-only, neutral albedo, normal visualization, fog-off and wind-off
   controls. Change one layer at a time; do not treat the isolation view as the
   target appearance.
4. Keep shadow, exposure, time, camera and animation phase identical for each
   controlled A/B. Record live animation separately. Record actual render path
   and finishing count; do not assume every mode uses the same post pipeline.
5. At biome edges, retain a small map of canonical IDs, habitat weights,
   canopy, moisture, path and water-kind data. At flat horizons use the existing
   `WorldVisualNeighborhood` survey before attributing absent relief to fog.
6. Record content integrity separately from scenery readiness and artistic
   quality. Complete queues do not prove that a malformed prototype is good art.

**Owners:** `scripts/capture-world-audit-2026-10-18.mjs`,
`scripts/capture-foliage-audit-2026-10-18.mjs`,
`src/editor/performance/qa/WorldVisualQa.js`, `WorldVisualNeighborhood.js`,
`src/editor/stylized/BiomeAssetPalette.js` and the existing browser fixtures.

**Done when:** each primary defect has a stable reproduction, an identified
render layer and a testable hypothesis. Failed captures remain labeled failures.

## 6. R1 — Give leafy understory an appropriate wind response

**Evidence:** the user's motion report; leafy foreground assets in 07; code in
`groundDetailWind.js`, `BushRenderAssets.js` and `StylizedGroundDetailView.js`.
Both bushes and authored ground details call `groundDetailWindPosition`, which
uses normalized vertex height squared and one downwind bend. It has no leaf
pivot, branch rigidity or plant-specific response input. Sharing the wind field
is useful; sharing that deformation across structurally different plants is
the problem to investigate first.

### Implementation

1. Inventory the active prototypes and classify their motion in asset metadata:
   `grass-tuft`, `flexible-stem`, `broadleaf`, `woody-shrub`, `fern-frond`,
   `rigid` and separately existing aquatic motion. These are proposed response
   profiles, never new terrain IDs or inference from mesh names at runtime.
2. Keep one canonical wind direction, gust envelope and time source. Resolve
   profile parameters through a small configuration module, then pass uniform
   parameters or compact authored attributes into shared shader graphs.
3. Keep the existing coherent bend for actual grass tufts. For woody shrubs,
   hold roots and the lower stem nearly still, use small slow branch rotation,
   and let leaves flutter by a much smaller, faster motion.
4. For broad leaves, bend the petiole/stem, then rotate the leaf around its
   attachment. Preserve the leaf's broad silhouette and approximate area.
   A leaf should not stretch into a ribbon or fold the whole plant to the same
   curvature as surrounding blades. Ferns need flex along the frond, with a
   stable rachis and restrained leaflet motion.
5. Prefer authored pivot/stiffness/part-role attributes prepared offline. Where
   those are missing, start with a conservative low-amplitude rigid plant sway;
   do not guess a detailed skeleton from height alone. Keep metadata and vertex
   channels compact and document their byte cost.
6. Audit local-versus-instance coordinates, root pivot and nonuniform scale.
   The same world wind must give comparable world-space motion to small and
   large instances without moving the root. Rotate shading normals consistently
   with the deformation; reuse the displacement in shadows/depth and temporal
   motion handling where those paths exist.
7. Fade fine flutter before it becomes subpixel noise. Keep the low-frequency
   gust phase continuous through LOD switches, material variants and floating
   origin changes. Do not create per-plant CPU updates or one material per seed.

### Review and acceptance

- Film identical close and player-height views for calm, ordinary wind and a
  strong gust. Include a shrub, broad leaf, grass tuft and flower in one frame.
- Their gust arrival agrees, but their stiffness and secondary motion differ.
  Broad leaves retain their shape; woody bases do not behave like soft blades.
- Proposed geometry checks: anchored vertices move less than 1 mm; designated
  rigid leaf edges change length by less than 2% in the fixture. These are new
  test targets, not measurements from this audit.
- Review a low sun, moving shadows, camera turns and LOD crossings for flicker,
  normal discontinuities and temporal trails. Verify rebase continuity.
- Preserve current instance populations and residency. Record added vertex
  attributes, material variants, compile cost and GPU cost in R9.

**Owners:** `groundDetailWind.js`, `BushRenderAssets.js`,
`StylizedGroundDetailView.js`, `plantSway.js`,
`src/editor/weather/wind/worldWindState.js`; use `forest/foliageWind.js` as an
existing structural example, without blindly copying tree amplitudes to shrubs.

## 7. R2 — Integrate flowers and understory with the scene palette

**Evidence:** 05–09 and the user's color report. Purple/yellow flower clusters
have a flat accent treatment; the foreground leafy plant in 07 is much paler
than surrounding grass.

There are at least two relevant production paths. Procedural flower cards use
`StylizedFlowerMaterial.js`: configured petal/stem colors, a global bottom color
blend and a fixed `normalNode`. Authored foliage uses `AuthoredFoliageMaterial`
and `foliagePalette`: a green-pixel mask grades leaves, while non-green petals
retain their paint and foliage fill is added. The existence of different paths
is confirmed; which contribution dominates each visible mismatch still needs R0.

### Implementation

1. Identify card flowers versus authored flower meshes in the diagnostic image.
   Record texture color space, source paint, material class, alpha cutoff,
   normals, light response, fog/mist and finishing path for both.
2. Introduce a small resolved appearance contract for **stem, leaf, petal and
   center**. Share scene illumination and regional palette context. Preserve
   recognizable flower colors; do not run petals through a green-leaf ramp.
3. Make stem/root colors agree with nearby plant pigments and substrate under
   the same light. Use explicit material/vertex roles when available. Retain
   the current color-mask approach only as a documented fallback for untagged
   assets; yellow-green petals must not accidentally become leaves.
4. Establish a restrained palette per habitat: a dominant flower family and
   one occasional accent, with deterministic patch variation. Use a continuous
   numeric grade at ecotones, while species eligibility remains discrete. Keep
   custom biome definitions on the same resolver path.
5. Inspect the flower card's fixed normal in a controlled camera orbit. If it
   causes camera-dependent or excessively flat lighting, supply a correct
   bent surface normal with the same coordinate convention as the rest of the
   scene. Compare sky fill, cloud shadow, local shadow and regional mist across
   card flowers, authored flowers, grass and trees.
6. Audit inherited emission and added fill explicitly. Ordinary blossoms should
   not appear self-lit at dusk or under canopy. Keep intentionally luminous
   fantasy species an explicit asset property, not a side effect of material
   conversion. Do not lower global exposure to compensate for a few plants.
7. After shading matches, tune scale, colony size and frequency. Avoid identical
   mixed bouquets stamped throughout every forest and taiga. Reuse the existing
   stable scatter and habitat rules before adding any species assets.

**Acceptance:** a mixed asset lineup reads as one lighting setup at noon, low
sun, overcast and night. Petals remain distinct but do not overpower foliage in
an ordinary wide shot. Stems visually connect to the stand. Color, alpha coverage
and mist remain consistent across distance and origin rebasing. Retain reference
swatches and linear-color measurements after approving the first lineup; do not
pick arbitrary global saturation multipliers in advance.

**Owners:** `StylizedFlowerMaterial.js`, `StylizedFlowerView.js`,
`AuthoredFoliageMaterial.js`, `forest/foliagePalette.js`,
`forest/foliageLight.js`, `BiomePrototypeSelector.js`,
`editor.config.yaml` flower and variant definitions.

## 8. R3 — Connect grass, exposed ground and their boundaries

**Evidence:** 04/06/08/09/10/12 and the user's contrast report. Dense stands have
very bright leaves over an exposed ground plane; sparse stands produce many
small dark marks on smooth pale or green ground. Wetland 12 has a particularly
clear division between fine upright stems and the adjacent bare patch.

### Implementation

1. Measure the actual cause in grass-hidden and ground-only captures. Separate
   albedo mismatch, root shading, substrate exposure, blade thickness, contact
   shadow, canopy response and distance handoff. Preserve the existing shared
   near/far substrate mean and its accepted tests.
2. Define a shared local descriptor for root pigment, substrate, coverage,
   canopy and moisture using existing fields. Ground and vegetation should
   agree about where the stand grows and where soil is exposed.
3. Tune the dense-stand interior as a coordinated response: darker gaps under
   dense cover, readable lower stems and lit tips. Reduce excessive root/soil
   discontinuity without making ground and grass one flat color. Use bounded
   coverage-driven shading or existing contact data first; do not add a global
   AO pass or blade shadows as the initial fix.
4. In sparse habitats, make the exposed ground carry credible mineral grains,
   litter, moss or thatch and cluster the surviving stems into plants. Do not
   hide weak ground by increasing every biome's grass density. Keep tundra
   sparse and deserts open.
5. Review blade width against plant height, pixel coverage and distance. Short
   stems must not become triangular punctuation; distant survivors must not
   turn into repeated broad strips. Check the current reduced widening before
   changing the stable LOD prefix or compaction rules.
6. Coordinate edge treatment across ground color, blade acceptance, height,
   clump coverage and authored plants. Use the same world-stable habitat/path/
   shoreline influence. An irregular edge still needs a coherent ecological
   cause; independent noise in every layer produces colored borders.
7. Compare the six existing ground fixture distances plus blade/card handoffs
   from player, downward and grazing views. Extend mean-color coverage tests
   with representative *combined scene* images; a passing average-luminance
   test does not guarantee convincing local contrast.

**Acceptance:** 06/10 retain intentional exposed ground but lose the pasted-on
stubble read; 04 retains lush height and depth without a bright carpet beneath
it; 12 has a believable transition into its bank. No camera-following value
ring, row pattern or sudden change in plant scale appears during a slow walk.
Contact remains convincing in shade, low sun, wet conditions and at a rebase.

**Owners:** `meadow/MeadowGroundShading.js`, `meadowGroundMean.js`,
`meadowGroundDetail.js`, `meadowBladeMaterial.js`, `meadowBladeShape.js`,
`meadowCardMaterial.js`, `terrainMaterial.js`, `contactShade.js`,
`src/editor/world/GrassHabitatCoverage.js`, `GrassHabitatHalo.js`.

## 9. R4 — Diagnose and repair the trees that look wrong

**Evidence:** the bare upper crown in 06, narrow column-like forms in 08,
white-barked foreground tree in 07, weak conifer identity in the sampled 09
heading, and pale distant tree belts in 01/04/05. These are several different
questions; they should not receive one global foliage tint or density fix.

### Implementation

1. Tag the exact suspicious instances and resolve their effective source
   prototype after palette overrides. Check the source tile and neighboring
   biomes. A tree visible from taiga may be placed across its boundary.
2. Render each suspect in an isolated turntable at near mesh, proxy and impostor
   distances. Show the authored source beside the assembled runtime tree.
   Inspect trunk/crown grouping, transforms, pivot, scales and alpha coverage.
3. For 06, determine whether the bare top is intentional damage/deadwood,
   incorrect trunk-to-crown assembly, missing foliage, alpha loss or a
   representation defect. If it is intentional, give that state a coherent
   silhouette and appropriate rarity; a green puff on a bare spear should not
   accidentally stand in for an ordinary healthy tree.
   Test morphology explicitly: `forest/TreeAppearance.js` computes vertical
   crown scale as `crownScale * foliageDensity` while trunk scale is a separate
   channel. Its proxy path already guards the exposed-pole problem. Compare
   the suspect's actual age/morphology against neutral morphology using the
   same prototype before changing the source model or applying another clamp.
4. For 07/09, trace `ForestSpeciesRegistry` species-to-prototype selection,
   tile eligibility, preferred tiles and the final `BiomeAssetPalette`
   override. Record when fallback geometry is used for a species. Separately,
   the bush/detail `BiomePrototypeSelector` can use the whole set when no
   variant claims a biome; expose that case in the understory diagnostics too.
   Choose explicit valid defaults rather than hiding an eligibility gap.
5. Improve only the confirmed source/group/normal/alpha defect. A shape defect
   needs corrected geometry or grouping; a lighting defect needs material or
   normal repair. Preserve correct root pivots and collision alignment.
6. If an asset/material change invalidates an atlas, rebuild it offline with
   its matching normal atlas, mips, compressed derivatives and manifest.
   Require the runtime signature and production validators to pass. Do not
   enable runtime baking or disable integrity checking as a shortcut.
7. Compare healthy/dead, young/mature and narrow/broad silhouettes in the same
   biome lineup. Variation should look related, with rare exceptions supported
   by habitat or state. Keep large hero forms, ordinary canopy masses and sparse
   young trees at distinct scales without increasing candidate budgets first.
8. Diagnose pale distance belts with fog-off and representation controls.
   Establish distance and sky exposure before tuning haze; a loaded impostor
   can still be overly pale in a particular composition.

**Acceptance:** each suspect has a recorded cause and corrected same-instance
view. Crown and trunk remain connected in all LODs and viewing directions;
source species and resolved biome rules are visible in QA. The existing
four-light tree and atlas-normal tests pass. Walk toward and around the trees:
there must be no crown inflation, color flash, root jump or missing-card step.

**Owners:** `StylizedTreePrototypes.js`, `StylizedTreeView.js`,
`StylizedTreeMaterials.js`, `TreeLodAssembler.js`, `forest/ForestSpeciesRegistry.js`,
`TreeManifestStore.js`, `forest/TreeRootFitter.js`, `stylized/impostor/`, and
`scripts/bake-tree-impostors.mjs` / `validate-impostors.mjs`.

## 10. R5 — Improve surface scale and object contact

**Sand and cold desert:** retain the new distinction between ripples and mineral
relief. In 01, break the long uninterrupted parallel ripple rhythm into coherent
patches whose orientation follows a broad wind/slope field. Keep quiet sand
between them. Change phase, amplitude and wavelength gradually; do not stack
unrelated high-frequency noise. In 02, strengthen mineral color/roughness and
irregular aggregate structure so cold desert is identifiable without the label.

**Snow:** keep fine sparkle, wake and compaction. Add readable windward/leeward
surface organization and larger drift groupings before more microdetail.
Surface shading cannot create a distant ridge silhouette: any actual drift or
landform displacement must have an explicit geometry/collision strategy. Treat
the broad flat glacier view as a composition question as well as a material one.

**Stones and roots:** retain the restored material range and authored UVs. Review
the isolated pointed bank stones in 12 as groups: one main mass, smaller broken
companions, partial burial, shared sediment and appropriate wet contact. Vary
orientation only within plausible support. Use the existing deterministic rock
and root-fit machinery rather than scattering more upright stones everywhere.

**Acceptance:** surfaces communicate sand, mineral soil, snow and damp bank at
both player scale and thumbnail scale. Their detail filters away without a
color change, moiré or sparkle crawl. Roots/rocks meet the terrain under four
lighting conditions and across edited slopes. New samplers or geometry require
an explicit budget; the terrain material already has a constrained sampler set.

**Owners:** `materials/TerrainMaterialMicroDetailNodes.js`,
`TerrainMaterialFeatureResponseNodes.js`, `config/terrain-material-bake.yaml`,
`stylized/SnowReliefShading.js`, `SnowSurfaceShading.js`, `StylizedRockView.js`,
`rockWeathering.js`, `contactShade.js` and `forest/treeRootFit.js`.

## 11. R6 — Give biomes a composition, not only a hue

Use the existing `ForestHabitatField`, `ForestBiomeProfiles`,
`RegionalCharacterField`, `BiomeAssetPalette` and instanced detail layers.
Define ecological patches shared by substrate and plants; do not create a new
independent scatter system for each aesthetic request.

| ID / biome | Specific visual brief | Primary check |
| --- | --- | --- |
| 0 Marine | Distinct exposed/sheltered water, readable shallows, sparse justified shore life | Actual water kind, depth and exposure; add a true marine-cell view in implementation QA |
| 1 Hot desert | Wind-organized sand, quiet open space, occasional mineral/rock anchors | Avoid continuous ruler-like ripple fields |
| 2 Cold desert | Cooler mineral aggregates, gravel/erosion structure, restrained dry plants | Distinguishable from warm sand without snowing over everything |
| 3 Savanna | Straw/green clumps, open routes, sparse groves and coherent riparian bands | Avoid a uniform crop field or oversized identical tufts |
| 4 Grassland | Rich meadow with broad height masses, quiet gaps and sparse flower colonies | Dense interior depth and readable route edges |
| 5 Tropical seasonal forest | Open woodland linked by dry litter, seasonal canopy and shade patches | Distinct from both grassland and evergreen rainforest |
| 6 Temperate deciduous forest | Connected broadleaf canopy, litter floor, shade-tolerant understory | Healthy tree silhouette and grounded trunks |
| 7 Tropical rainforest | Multiple vegetation heights, broad leaves with stiff petioles, damp organic floor | Leaf motion and palette coherence at player height |
| 8 Temperate rainforest | Moss/duff, damp timber and coherent conifer/broadleaf masses | Avoid a smooth lawn beneath scattered columns |
| 9 Taiga | Conifer-led silhouette where source habitat supports it, needle litter, moss and low shrubs | Confirm species eligibility before tuning populations |
| 10 Tundra | Low cushions/tufts, exposed mineral ground, restrained frost/snow patches | Sparse cover remains a designed habitat, not missing meadow |
| 11 Glacier | Treeless local ice/snow, wind-carved surface groups and clear rock relationships | Separate surface polish from actual large landforms |
| 12 Wetland | Rooted reed colonies, damp organic margins, open-water gaps and moisture gradients | Verify canonical water body; not every wetland viewpoint faces a swamp |

Implementation order: approve 06/07 floor and vegetation lineups; apply the
same rules to 08/09; then 03/04 and the 10 boundary; finally shoreline/wetland
composition. Use moisture, canopy, slope, substrate and stable region inputs
to correlate details. Allow intentional glades and open ground. Verify absence
claims with reverse views and a short route before adding content.

For water, first isolate any remaining broad band into foam, wet sand, shallow
optics, reflection, displaced geometry or light. Reuse the explicit water kind
and appearance context. Keep the recent split-view coloring and shared swash
clock. Any shoreline refinement must preserve CPU water/collision agreement,
adjacent chunk continuity and bounded resident slots.

**Acceptance:** three separated positions per biome, including at least one
core and one edge where available, communicate related habitat structure.
Unlabeled frames should be distinguishable by silhouette and substrate, not
only global tint. New details remain batched, deterministic and locally rebuilt.

## 12. R7 — Establish depth, atmosphere and memorable places

1. At 01/04/05, compare depth-binned tree silhouettes with atmosphere disabled,
   then restore air, canopy fill and finishing separately. Preserve gradual
   aerial perspective while keeping useful middle-distance crown separation.
   Do not globally remove fog to make a few tree belts darker.
2. Build a consistent value hierarchy: grounded foreground, readable middle
   distance, softer far terrain and sky. Keep sunny leaves bright, but prevent
   broad pale sheets from obscuring all terrain form.
3. Review repeated bright motes and white airborne shapes in the dry/forest
   captures. Identify the emitting system first, then tune habitat, time,
   luminance, size and frequency. Ambient effects should support place and
   weather; they should not be the main detail in every open view.
4. Use the neighborhood height survey to separate flat source geography from
   limited visibility. Try existing groves, paths, rock groups and exposed
   banks as local composition anchors before modifying terrain generation.
5. If ordinary routes still lack destination silhouettes, make a separate,
   opt-in, versioned landscape pass: connected ridges and valleys, stronger
   drainage forms, rare outcrops and clearings. Specify metre scale, frequency,
   collision, water and far-terrain representation before implementation.
   Preserve imported Eldara geography and existing saves by default.

**Acceptance:** noon, low sun, overcast and night keep the same place readable.
Atmosphere does not conceal a bad LOD transition. The player can identify useful
landscape anchors while moving, with intentional open spaces retained. Any
generation extension passes deterministic regeneration, chunk-seam, water and
collision checks; its performance is measured separately from material tuning.

**Owners:** `stylized/sky/SkyLookController.js`, `regionalSkyLook.js`,
`stylized/ambient/`, `config/ambient-effects.yaml`, `world/MacroFarTerrainView.js`,
and, only for the later geography stage, `world/ProceduralWorldGenerator.js`.

## 13. R8 — Review how the world feels during ordinary play

The four user-reported problems must survive motion review. A convincing still
does not establish stable foliage, comfortable locomotion or good sound.

- Record first- and third-person walk, sprint, turn, stop and return through
  the approved forest/meadow slice. Include a rebase and a cold entry into an
  unseen chunk. Watch grass/ground contrast and vegetation population while
  moving and for two seconds after stopping.
- Review R1 wind and leaf motion at several frame rates, with camera motion
  and without it. Watch for detached shadows, shimmer, billboarding, velocity
  errors, sudden stiffness changes and bends that intersect the ground.
- Walk through grass, broadleaf plants and reeds. Existing interaction must
  match plant structure, respect rigid stems and recover without an elastic
  whole-plant snap. Avoid adding mandatory camera bob or FOV changes as polish.
- Review footstep/brush sounds against the actual material, moisture and plant
  contact. Check wind, bird/insect and water ambience levels and transitions.
  These are follow-up listening tasks, not defects proven by screenshots.
- Compare normal HUD captures over bright snow, dark canopy and busy meadow
  at 1280 × 720, 1600 × 900 and 1920 × 1080. Preserve the recent compact resting
  controls, readable status, keyboard input and clean capture mode. Record any
  actual issue before changing layout again.

**Owners:** `player/`, `audio/world_soundscape.js`, `audio/ambient_soundscape.js`,
`stylized/meadow/meadowInteractionBend.js`, `player/hud/` and the existing visual
motion/HUD harnesses.

## 14. R9 — Performance, architecture and release gates

Read and follow [player movement performance QA](../perf-qa.md) before any
rendering, terrain, streaming or residency implementation. This review performs
no runtime A/B and makes no speedup or regression claim.

### Per-package evidence

1. Freeze baseline and candidate sources. Hold hardware, viewport, quality,
   weather, route, populations and cache conditions constant. Use the restored
   intended asset workload, not an old proxy-only capture.
2. Run the focused visual fixture and the affected deterministic movement route.
   Use repeated matched captures when claiming performance equivalence or a
   speedup. Record p50/p95/p99, hitch rate, worst frame, streaming work, uploads,
   shader/pipeline work, CPU/GPU memory and post-stop recovery.
3. Retain hardware WebGPU, native foreground ownership, settled start, valid
   collision, source stability and browser-error checks. An invalid capture
   does not become an acceptable result because its FPS is high.
4. Preserve the existing matrix gates: measured p95 ≤33.3 ms, hitch rate ≤2%,
   full scenery recovery within two seconds and no missing/below-density
   in-view grass at recovery. Keep the complete water and collision gates.
   Passing those ceilings is not permission to spend the remaining frame time:
   compare against the matched baseline and explain any material regression.
5. Start R1–R4 with unchanged residency, candidate budgets and populations.
   Count added attributes, shader variants, samplers and passes. A screen-color
   or depth sample can impose a scene-wide copy cost; do not add one without
   proving its complete pipeline cost.

### Data and implementation constraints

- Preserve canonical Azgaar IDs **0–12** in order, and persisted custom biome
  definitions with deterministic IDs **32–254**. Motion/appearance profiles
  are derived data. Add no legacy terrain remapping.
- Use canonical coordinates, stable IDs, bounded caches and instanced batches.
  Keep sampling and expensive preparation out of the per-frame main-thread
  path. Invalidate known local edits locally; preserve worker/main parity.
- Split configuration resolution, math, shader construction and browser QA into
  focused modules. Keep existing composition roots small and responsibilities
  explicit. Do not turn a general renderer into asset-name branches.
- Reuse checked-in assets first. Any content gap needs a named species/role,
  license/provenance, scale, material, LOD and memory specification before new
  asset work. No general asset-pack replacement is proposed.
- Workshop geometry and settlement authoring are outside the sampled scope.
  If later work reaches them, first read the workshop framework, implementation
  plan and Tiny Glade behavior review required by `AGENTS.md`. Preserve semantic
  authoring, deterministic resolved chemistry and derived geometry.

### Final release package

- All retained 18 world views replayed, plus the approved close/reverse/edge
  supplements; clean and HUD variants, source/config/map hashes and diagnostics.
- R1 motion lineup and world route; R2 mixed-material four-light lineup;
  R3 combined ground/grass and distance fixtures; R4 suspect-tree turntables,
  normal/alpha/impostor checks and actual loaded-atlas integrity.
- WebGPU and WebGL correctness fixtures where the feature supports both, plus
  low/balanced/high quality review. Hardware performance claims use the accepted
  WebGPU route; fallback images are not substituted into that comparison.
- Full vegetation/construction/water performance matrix, then `npm run verify`.
  Include dry/wet, biome-edge, terrain-edit, origin-rebase and reload/persistence
  cases relevant to the changed systems.
- A final artifact index with pass/fail, remaining limitations, original media
  and before/after comparisons. Keep failed intermediate evidence. A successful
  capture runner is not itself artistic acceptance.

## 15. Review checkpoints

| Checkpoint | Reviewable result | Continue when |
| --- | --- | --- |
| C0 · Diagnosis | Named plants/trees, layer controls, fixed poses | Each primary issue has a confirmed owner and a discriminating test |
| C1 · User priorities | 06/07/08/10 before/after, mixed plant motion clip | Leafy plants retain structure, flowers belong to the lighting, ground/grass connect, suspect tree is explained and repaired |
| C2 · Biome rollout | Three positions per biome and representative edges | Habitat identity improves without uniform density or flattened palettes |
| C3 · Environment integration | Coast/snow/desert/imported set under four lights | Materials, atmosphere and large forms agree across scales |
| C4 · Ordinary play | Walk/sprint/turn/contact/audio/HUD review | Visual quality holds during interaction and the unchanged performance gates pass |

R1–R4 are the immediate recommendation. Surface, habitat and landscape work
follows once those four defects are resolved in the same ordinary player views.
