# Next world visual pass — random biome review

Date: **October 18, 2026**. Status: **implementation authorized October 19; baseline review retained below**.

Implementation results: [delivery and limits](../aaa-next-pass-implementation-2026-10-19.md)
and [validation summary](aaa-next-pass-2026-10-19-validation.json).
The visual implementation is delivered; matched timing was cancelled at the
user's request and remains unverified. Conditional geography was not activated.

The next visual pass should make the world feel like a connected landscape:
readable middle distances, materials that belong together, convincing contact
between trees and soil, and habitats that remain recognizable while walking.
Keep the established stylized fantasy direction. The target is consistent art
direction and convincing scale throughout ordinary exploration.

This is a fresh review after the [completed world-look work](../world-look-implementation-2026-10-18.md).
Its plant motion, lit flowers, dead-tree correction, substrate continuity and
cloud shading are the starting point. Do not reopen those completed tasks based
on their old screenshots. The [water follow-up](../water-visual-followup-2026-10-18.md)
contains a separate, still-open bank-shading diagnosis that this plan retains.

[New screenshot gallery](../qa/random-world-review-2026-10-18/index.html) ·
[Contact sheet](../qa/random-world-review-2026-10-18/contact-sheet.jpg) ·
[Replay poses and compact evidence](aaa-next-pass-2026-10-18-evidence.json)

## 1. Evidence and limits

The capture uses frozen `main` at `000c8126b199a1eadfe79000543d6e6e9b8df0b9`,
NVIDIA Lovelace hardware WebGPU, headed Windows Chromium, 1600 × 900 and DPR 1.
Highfield is paused at noon with manual weather off. Wind, regional atmosphere
and biome particles remain live; clean and HUD images are consecutive frames.

Selection seed **2026101802** produces the first encountered location for each
of the twelve land-biome IDs in **2,076** random cell candidates. Coordinates
span cells `[-8000, 8000)` on each axis; accepted points consume another random
draw for yaw. The procedural world uses seed **918273**, generator version 1,
24 m height scale and −1.5 m sea level. This is sampling stratified by biome,
not by land area. It intentionally retains edges and awkward compositions.
Two established coast views and four seeded selections from existing imported
Eldara fixtures supplement the twelve new positions. Those six are labeled
supplements, not newly discovered random locations.

Every accepted view must have the expected camera-cell biome, loaded tree
assets, terrain/scenery/collision readiness and converged static lighting.
Preparation waits at least 16 seconds and requires 60 consecutive ready frames.
Aerial cuts first prepare ground collision. The frozen source and artifact
hashes are retained in the local capture report.

Screenshots establish appearance at these positions. They do not establish
motion quality, sound quality, stutter, shader cost or coverage of an entire
biome. A camera-cell label does not describe everything in the frame. The coast
camera is on grassland ID 4 looking at marine water; it is not a camera-cell
test of marine ID 0. Aerial imported views are not equivalent to player views.
The eight-direction neighborhood samples are diagnostic samples, not area
coverage measurements.

Original media and full reports stay local under the existing `docs/qa/` ignore
rule. The compact evidence file, this plan and capture helpers are versioned.
There is no image generation, retouching or extra grading in the originals.

## 2. Screenshot findings

The inventory and the image-specific observations follow below.
Visible symptoms and proposed explanations are kept separate throughout this
plan. Acceptance of a capture means it is usable evidence, not that its art is
finished.

| View | World / camera biome | X, Z (m) | Observation | Work |
| --- | --- | --- | --- | --- |
| [random-01 · Hot desert](../qa/random-world-review-2026-10-18/random-01.png) | procedural / 1 | 14469, 2829 | Broad pale sand foreground; nearby ripples are readable but dominate the quiet surface. A green/gold strip, wide pale route and washed-out tree belt divide the view into flat layers. | N1, N2, N6 |
| [random-02 · Cold desert](../qa/random-world-review-2026-10-18/random-02.png) | procedural / 2 | -4795, -8123 | Cold-desert relief is mottled rather than rippled, but the broad foreground still reads yellow-green/beige beside lush distant grass. A straight-looking bare route reaches the horizon. | N1, N2, N6 |
| [random-03 · Savanna](../qa/random-world-review-2026-10-18/random-03.png) | procedural / 3 | 9629, 269 | A wide bare strip separates the eye from the grove/water. Pale gaps climb the right slope; short green blades and taller gold grass meet abruptly. The nearest tree silhouette is readable. | N1, N2, N4 |
| [random-04 · Grassland](../qa/random-world-review-2026-10-18/random-04.png) | procedural / 4 | -7953, 5071 | The meadow has useful height waves, but the bright green exposed floor and repeated blade rows dominate at close range; distant trees form a thin pale belt. Small flower accents are quieter than the earlier baseline. | N1, N2, N4 |
| [random-05 · Tropical seasonal forest](../qa/random-world-review-2026-10-18/random-05.png) | procedural / 5 | -15339, -2063 | A close mature trunk has strong black/gold vertical bark and broad dark root wedges against an almost continuous meadow floor. This is the clearest tree-ground material integration case. | N3, N4 |
| [random-06 · Temperate deciduous forest](../qa/random-world-review-2026-10-18/random-06.png) | procedural / 6 | 13103, -9155 | Dense broadleaf crowns frame broad smooth pale floor strips with thin low grass; trunk feet remain dark and angular. The nearby sampled cells remain deciduous forest. | N2, N3, N4 |
| [random-07 · Tropical rainforest](../qa/random-world-review-2026-10-18/random-07.png) | procedural / 7 | -719, 477 | Pale trunks and flatter bright-green leaf masses stand beside darker, heavily painted tree families. Repeated short grass covers much of the foreground; layered tropical understory is weak in this direction. | N3, N4 |
| [random-08 · Temperate rainforest](../qa/random-world-review-2026-10-18/random-08.png) | procedural / 8 | -435, -14775 | Conifers and broadleaf trees share a largely smooth olive floor with scattered grass patches. White airborne flecks are conspicuous; the floor gives few moss/fern/wood cues in this view. | N1, N3, N4 |
| [random-09 · Taiga **[diagnostic]**](../qa/random-world-review-2026-10-18/random-09.png) | procedural / 9 | -15841, 5561 | Dark short grass forms a fine repetitive foreground field beside a broad bare path. Narrow tree forms, bright water and a greener neighboring slope provide weak needle-floor/cold-forest cues in this heading. | N2, N3, N4 |
| [random-10 · Tundra **[diagnostic]**](../qa/random-world-review-2026-10-18/random-10.png) | procedural / 10 | -9659, -13947 | Snow-covered coast has readable water and sparse vegetation, but scattered upright dark stones look isolated and similarly oriented. Large blue/cyan water shapes dominate the middle distance; the low horizon has little relief. | N5, N6, conditional N7 |
| [random-11 · Glacier **[diagnostic]**](../qa/random-world-review-2026-10-18/random-11.png) | procedural / 11 | -8231, 10353 | Fine snow relief is readable, but almost the entire ground is a pale gently rolling sheet. Snowfall supplies much of the depth cue; green neighboring trees mark a fairly abrupt edge at left. | N1, N4, N6; QA blocker Q0 |
| [random-12 · Wetland **[diagnostic]**](../qa/random-world-review-2026-10-18/random-12.png) | procedural / 12 | -9575, 4745 | Tall yellow-green reed-like growth fills the foreground, with a thin glimpse of water and a broad pale strip at right. The silhouette still resembles an enlarged meadow; wet substrate and pool/colony structure are hard to read. | N2, N4, N5 |
| [marine-coast · Marine coast (targeted supplement)](../qa/random-world-review-2026-10-18/marine-coast.png) | procedural / 4 | -2077, 1731 | The shallow bed and wet edge are readable; a broad dark water band and bright reflected sky compete with the finer shore scale. Sparse stones are isolated. | N5, N6 |
| [marine-coast-overview · Marine coast (targeted supplement)](../qa/random-world-review-2026-10-18/marine-coast-overview.png) | procedural / 4 | -2077, 1731 | Elevated view exposes the contrast between bright cyan shallows, dark water and large cloud reflections. Use it with the player view to balance roughness and reflection scale. | N5 |
| [eldara-forest-overview · Eldara Temperate deciduous forest](../qa/random-world-review-2026-10-18/eldara-forest-overview.png) | eldara / 6 | -7134127, 1081563 | The imported forest has useful rolling relief and clear route shapes, but heavy green-grey haze compresses tree groups and the ground into one distant value. | N1, N2, N4 |
| [eldara-taiga-reverse · Eldara Taiga](../qa/random-world-review-2026-10-18/eldara-taiga-reverse.png) | eldara / 9 | -982683, 371387 | Dark low grass, narrow repeated trees and a broad open floor dominate; forest-floor and conifer-cohort variation would strengthen the local identity. | N3, N4 |
| [eldara-glacier-reverse · Eldara Glacier](../qa/random-world-review-2026-10-18/eldara-glacier-reverse.png) | eldara / 11 | -2747061, 316061 | A very broad snowy slope has fine texture and active snowfall, but few intermediate-scale anchors or rock exposures in this heading. | N6; conditional N7 |
| [eldara-wetland-reverse · Eldara Wetland](../qa/random-world-review-2026-10-18/eldara-wetland-reverse.png) | eldara / 12 | 993673, 1701497 | Dense grass fills the foreground while heavy grey-green air hides the distance. The frame gives few visible pool, wet-substrate or reed-colony cues. | N1, N4, N5 |

![Tree-ground and forest-floor integration](../qa/random-world-review-2026-10-18/random-06.png)

![Cold-coast material and stone scale](../qa/random-world-review-2026-10-18/random-10.png)

## 3. Art direction and scale contract

Use the same visual vocabulary across terrain, foliage, rocks, water and sky.
Each frame should offer a clear foreground material, an intelligible group of
objects in the middle distance, and an atmospheric background. Open habitats
can remain empty; they still need readable shape, surface and scale.

| Scale | Desired read | Practical implementation |
| --- | --- | --- |
| Centimetres to 1 m | Material response and plant structure | Filtered normals/roughness, restrained litter, blade thickness and root contact; detail fades before it shimmers |
| 1–15 m | Credible objects and ground contact | Tree bases, rock families, layered understory, worn trail margins and wet sediment |
| 15–150 m | Habitat composition | Tree cohorts, open corridors, grass-height districts, reed colonies, exposed mineral shelves |
| 150 m and beyond | Place identity and distance | Recognizable silhouettes, broad terrain forms, controlled haze and stable far representations |

Palette rules: grassland can be fresh green; forest shade should gain depth
without turning black; cold ground needs mineral/cool cues; warm sand needs dry
material cues; wetland water must share its bank's organic context. Retain quiet
areas between accents. Flowers, glints and small props should not become the
strongest repeated contrast in every habitat.

Create a small reference board from the actual captured scenes: approved
ground/leaf/bark/water swatches, a tree-and-rock scale lineup, and four lighting
states. This defines the project's own target and makes review decisions
repeatable. Any later external reference research is a separate art task.

## 4. Delivery order

S/M/L are relative scope, not calendar commitments. Assign one named owner to
each package during implementation; engineering and environment-art roles are
listed to make the handoff explicit.

| Package | Priority / scope | Deliverable | Depends on |
| --- | --- | --- | --- |
| N0 | P0 / S | Reproducible scenes and discriminating controls | This evidence |
| N1 | P1 / M | Clearer middle distance and coherent scene values | N0 |
| N2 | P1 / M | Habitat boundaries and paths that belong to their ground | N0; review with N1 |
| N3 | P1 / M | Tree-root, bark and forest-floor integration | N0; approved N1 values |
| N4 | P2 / M–L | Distinct biome composition at unchanged population budgets | N2–N3 |
| N5 | P2 / M | Shoreline, water and bank coherence | N0; N2 |
| N6 | P2 / M | Desert, snow and rock material hierarchy | N1–N2 |
| N7 | P3 / L | Optional new-world geography and landmarks | Evidence that existing forms are insufficient |
| N8 | P2 / M | Movement, interaction, sound and presentation review | Baseline first; repeat after N1–N6 |
| N9 | P0 / continuous | Correctness, residency and performance acceptance | Every package |

**First review slice:** use views 01, 03, 04 and 05 together. Diagnose pale
distance, exposed strips, the open meadow floor and the close tree base. Make
one controlled change per cause, then review the combined result in those
ordinary player frames. Roll out to the complete inventory only when the
combined scene improves. Larger geography work is a separate decision after
this slice.

## 5. N0 — Diagnose before changing defaults

**Owner:** rendering engineer with environment-art review.

1. Replay the retained positions exactly. Add reverse and downward views as
   labeled supplements. Keep unsuccessful or unattractive random views.
2. For the pale horizons, capture distance-fog-off, regional-mist-off,
   neutral-finishing and normal production controls separately. Record tree
   distance and representation. Reducing fog cannot reveal terrain absent from
   the height source.
3. For the bright gaps, visualize canonical biome IDs, blended material
   weights, trail/road mask, water coverage, grass eligibility and active LOD.
   A bare pixel may be a path, sand, a low-density habitat or a streaming defect;
   these require different fixes.
4. For dark tree feet, capture albedo-only, neutral lighting, shadow-off and
   ordinary lighting using the same instance. Inspect its source mesh, root
   penetration, texture, scale and material before assigning blame to shadows.
5. Keep plant motion and water clocks fixed for pixel A/B controls. Record live
   movement separately. Record backend, render path and finishing count.
6. For imported scenery, retain source heights and biome IDs in the diagnostic
   output. Distinguish the camera's biome from the roots of each visible tree.

Extend existing QA controls in `WorldVisualQa`, `WorldVisualVegetation` and
`WorldVisualNeighborhood`; do not put diagnostic switches in ordinary player
UI. Use the existing fixture runners for isolated material checks.

**Done when:** every P1 issue has an image, a stable instance or surface owner,
an A/B control that isolates it, and a named implementation owner. An unconfirmed
explanation remains a hypothesis in the task record.

## 6. N1 — Restore distance and value separation

**Evidence:** the pale tree belt in 01–04 and the contrast between their bright
sky and low-contrast horizon. **Hypotheses:** combined distance fog, regional
air, tree representation and finishing may compress the same distance band.
The screenshots alone cannot select one of these causes.

**Owner:** rendering engineer; art director approves the value hierarchy.

1. Use a fixed tree/rock lineup at approximately 10, 40, 100 and 250 m. Capture
   toward and away from the sun at dawn, noon, overcast and dusk. Keep exposure
   stable within each A/B.
2. Identify where contrast disappears. Adjust the owning term once; ensure
   terrain, authored plants, procedural grass, tree meshes and impostors use
   compatible regional air and lighting.
3. Preserve color separation between near shaded foliage and distant foliage.
   Keep cloud undersides and horizon tone legible without raising global
   saturation or crushing bark shadows.
4. Inspect shadow-map coverage and root contact after the value correction.
   Measure the current path before considering a shadow-cascade change. A new
   shadow pass needs its own quality/performance comparison.
5. Inspect bright airborne glints at daytime exposure. Use spatially and
   ecologically appropriate occurrence and scale; test their complete motion
   cycle before choosing a particle population change.

**Existing owners:** `stylized/sky/SkyLookController.js`, `SkyLook.js`,
`regionalSkyLook.js`, `sunHaze.js`, `stylized/mist/ValleyFogShading.js`,
`stylized/ambient/`, `render/sceneExposure.js`, `editor.config.yaml`.

**Acceptance:** approved distance lineup retains distinct foreground, middle
and background layers under all four lights; no white silhouette belt around
the middle-distance trees; no halos at LOD changes; local bark and grass remain
readable in shadow. Ordinary player screenshots must improve alongside the
isolated lineup. Keep the existing finishing path applied once.

## 7. N2 — Make biome edges, grass gaps and paths intentional

**Evidence:** sand/vegetation separation in 01–02, the wide bare strip and pale
upslope gaps in 03, and the closely related green floor/blade values in 04.
Neighborhood diagnostics already confirm mixed IDs around the desert cameras;
green neighboring vegetation is not proof of incorrect desert classification.
In 06, all eight samples at 16 m and all eight at 64 m are ID 6, despite the
broad pale strips in the image. A forest floor/path/material control is therefore
more informative there than assuming the strips are another biome. Those sparse
samples still do not classify every pixel of the visible ground.

**Owner:** terrain/material engineer and environment artist.

1. Give each exposed strip an identity using N0's masks. Fix missing eligible
   grass through preparation/publication if that is the cause. Do not conceal
   it with ground paint or relax the readiness gate.
2. For real biome transitions, derive substrate pigment, grass height and
   patch breakup from compatible continuous fields. Keep the canonical tile
   IDs intact. Use broad transition structure with smaller edge incursions;
   several independent noisy contours should not create white channels.
3. Preserve the established near/far substrate mean. Tune local root/soil
   relationships and intermediate-scale variation, not the previously fixed
   mean-normalization behavior. Check ground-only, grass-only and combined.
4. Give actual trails habitat-specific material treatment: pale compacted dry
   soil, darker forest humus, damp mud, or snow compression as appropriate.
   Share one path mask across terrain, grass suppression and object clearance.
5. Inspect trail width and edge rhythm at player scale. Narrow unused branches
   or soften shoulders only when the semantic route allows it. Place occasional
   verge plants and embedded stones in the existing instanced detail owners.
   Keep walking lanes and collision clearance readable.
6. Check paths across slopes, chunks, biome boundaries and terrain edits.
   Any path-field change must preserve deterministic appearance after reload
   and origin rebasing.

**Existing owners:** `world/BiomeFieldBlur.js`, `world/BiomeBoundaryWarp.js`,
`world/GrassHabitatCoverage.js`, `stylized/meadow/meadowGroundDetail.js`,
`meadowGroundPalette.js`, `meadowGroundDetailConfig.js`,
`stylized/path/terrainPathPaint.js`, `stylized/forest/PathClearanceField.js`,
`stylized/naturalTrailMath.js`.

**Acceptance:** every retained exposed strip has a diagnosed role; no unexplained
chunk-aligned or LOD-following gap; ground/blade transitions retain the same
substrate mean at 4, 15, 34, 70 and 150 m; a walk across the edge has no brightness
ring or moving pigment patch; actual trails remain navigable and visible.

## 8. N3 — Integrate trees with the forest floor

**Evidence:** 05 has broad dark root wedges and high-contrast vertical bark
against a fairly uniform bright grass floor. Its central visible tree is
`tree:-120:16:14`, prototype 19, `/assets/trees/meadow/tree8.glb`, mature
`tropical_tall`, rooted in ID 5, approximately 7.64 m from the camera. This is
a new contact/material review. The earlier dead-green-crown defect remains fixed.
View 07 also mixes pale trunks and flat bright leaf masses with the darker
painted trees. The two nearest visible trees there are prototype 17,
`/assets/trees/tree-scene/tree-03.glb`, rooted in ID 7. Review their material and
asset style together with the meadow tree family; a white trunk alone does not
establish an invalid tropical species.

**Owner:** environment artist with foliage/material engineer.

1. Inspect the source tree under neutral, flat and production lighting. Separate
   baked texture darkness, surface normals, geometric root shape and real
   contact shadow. Adjust the responsible input rather than brightening every
   tree globally.
2. Establish comparable bark texel density across common prototypes. Preserve
   useful painted structure while reducing oversized black/gold stripes that
   compete with the whole scene at walking distance.
   Put the pale `tree-scene` and darker `meadow` families in the same light and
   scale lineup; align leaf value, normal response and bark treatment before
   altering their biome eligibility.
3. Check the root mesh against local terrain. Use bounded, slope-aware seating
   and existing contact/placement data. Avoid a universal dark circular decal.
4. Shape the surrounding habitat: litter and exposed roots close to the trunk,
   shade-tolerant low growth farther out, grass in clearings. Canopy coverage
   should influence that distribution. Retain sparse and worn clearings.
5. Add only the missing silhouette classes justified by the shots: low fern or
   leaf clusters, occasional fallen branch/log, and restrained moss. Prefer
   existing assets and batched instances. A new model needs scale, material,
   collision, wind profile and LOD acceptance together.
6. If geometry, texture or tree palette changes, rebuild and validate affected
   impostors and signatures. Verify leafless/dead states and living crowns
   through all representations; retain the recent structural-wind fixes.

**Existing owners:** `stylized/StylizedTreeMaterials.js`, `BiomeAssetPalette.js`,
`forest/ForestHabitatField.js`, `forest/ForestBiomeProfiles.js`,
`StylizedGroundDetailView.js`, `StrategicDetailPlacement.js`,
`meadow/meadowGroundDetailConfig.js`, and `stylized/impostor/`.

**Acceptance:** the exact tree in 05 has a believable foot in normal player
view; neutral controls explain its remaining shadow; no dark root skirt or
floating root edge on representative slopes; canopy shade, litter and clearing
vegetation read as one habitat. Near mesh and distant representations agree.

## 9. N4 — Give every biome a consistent composition brief

The table defines future art targets. It does not claim every missing cue is
a current defect, or that every scene in a biome must contain every cue.
Use three separated positions, a reverse view and a neighboring-biome edge
before changing an entire biome profile.

| Azgaar ID | Habitat brief | Placement/material work |
| --- | --- | --- |
| 0 Marine | Deep/open water, shallows and readable coast scale | Water-body-aware optics; sparse shore debris and coastal rock groups; add a true ID 0 validation pose |
| 1 Hot desert | Warm dry mineral surface, quiet sand, sparse landmarks | Ripple districts, exposed rock shelves, hardy low scrub at eligible margins |
| 2 Cold desert | Cooler mineral ground and exposed gravel | Angular rubble, restrained dusty vegetation, different roughness/relief from hot sand |
| 3 Savanna | Open golden grass with isolated grove structure | Dry/wet height districts, broad crowns where eligible, sparse exposed earth with worn edges |
| 4 Grassland | Open meadow with local height/seed-head variation | Maintain grass motion and quiet flower colonies; occasional copses; coherent exposed thatch |
| 5 Tropical seasonal forest | Trees and grass responding to seasonal/open canopy | Drier litter, broadleaf cohorts, rooted understory; preserve sunlit openings |
| 6 Temperate deciduous forest | Varied broadleaf stands with leaf litter | Young/mature cohorts, restrained saplings, clearings and root contact |
| 7 Tropical rainforest | Layered canopy, broad leaves and humid depth | Sparse grass under heavy canopy, grouped understory, species-appropriate root/trunk language |
| 8 Temperate rainforest | Cool damp forest, moss and large trunks | Fern/moss pockets, fallen wood, moist stones and uneven gaps |
| 9 Taiga | Recognizable conifer structure and needle floor | Conifer cohorts, low shrub/lichen, occasional deadwood; check each tree's root biome |
| 10 Tundra | Low plants, exposed stone, patchy snow/lichen | Wind-shaped low mats, meaningful bare ground, protected damp pockets |
| 11 Glacier | Snow mass, ice/rock exposure and readable slopes | Wind/concavity-driven drifts, compressed ridges and blue-grey shadow structure |
| 12 Wetland | Saturated substrate, reed/sedge colonies and open pools | Organic shore material, irregular reed heights and natural gaps, damp root contact |

Use `RegionalCharacterField`, `ForestHabitatField`, `BiomePrototypeSelector`,
`BiomeAssetPalette` and the existing placement manifests. Rebalance cohorts and
patches before raising totals. A denser rainforest is not automatically a
better rainforest; its hierarchy and under-canopy floor must be convincing.

**Acceptance:** a reviewer can point to the intended habitat cues in each
approved view; neighboring habitats blend without losing identity; candidate
and worker/main results agree; the same stable placements return after eviction,
reload and rebasing. Record population changes rather than hiding their cost.

## 10. N5 — Connect water, banks and shore vegetation

**Owner:** water/terrain engineer with environment-art review.

1. Preserve the body-aware optics and fixed split-waterline behavior. Record
   water kind, depth, organic/cold context, shore distance and body level for
   every shore diagnosis. Cyan pixels alone do not identify a wrong water kind.
2. Carry forward the separate imported-river finding: fixed bright bank scallops
   survive hidden water sheets and water-effect controls. Next isolate terrain
   roughness, normals and baked substrate. Do not file it as unresolved foam.
3. Art-direct the cross-section from water to dry ground: shallow bed, wet mud
   or pebbles, damp vegetation, dry bank. Use the signed shore field and actual
   terrain height, with irregular but coherent widths.
4. Group reeds, sedges, stones and driftwood by substrate, moisture, slope and
   exposure. Add gaps and occasional anchors. Keep continuous open margins
   where they serve traversal; avoid equal-spaced decorative rows.
5. Review large reflected clouds, sun glint and fine ripples together from
   player and aerial heights. Keep useful reflections while balancing their
   scale and roughness against the water body. Inspect motion before changing
   the reflection update interval.
6. Verify dry approach, entry, swim, dive, surface and dry exit after changes.
   Shore plants and bank materials must remain plausible on elevated inland
   water as well as the ocean.

**Existing owners:** `water/WaterAppearance.js`, `WaterOptics.js`,
`WaterDistanceField.js`, `stylized/ShoreContactNodes.js`, `shoreHabitat.js`,
`riverbankRocks.js`, `StrategicDetailPlacement.js`, `materials/`,
`config/water-visual.yaml` and `config/terrain-material-bake.yaml`.

**Acceptance:** same-pose coast/river/wetland comparisons show a readable wet-to-dry
sequence; bank highlights have an attributed control; no repeating foam stamps
or new shoreline seams; ordinary water traversal passes the existing water QA.
Any extra scene/color/depth copy must be explicitly identified and budgeted.

## 11. N6 — Strengthen ground and rock scale

**Owner:** material engineer and environment artist.

1. Keep existing sand ripple districts, mineral tint, snow relief and substrate
   means. Audit their visible effect under the final N1 exposure before changing
   their parameters again.
2. Separate microdetail from landform. Hot sand needs quiet intervals and changes
   in ripple direction; cold desert needs mineral/gravel structure. Repeated
   fine relief should not carry an otherwise featureless entire foreground.
3. Give rocks a family hierarchy: occasional large anchor, related smaller
   fragments and partially buried stones with aligned geological character.
   Preserve open terrain. Reuse instanced rock owners and slope/water context.
4. Tune rock/ground contact, roughness and pigment together. Match apparent
   detail scale to bark, terrain and plants. Avoid sharp isolated props whose
   footing has no sediment, snow or vegetation response.
5. For snow, use existing wind, slope and concavity fields to distinguish drift,
   exposed rock and compressed surface. Preserve broad white forms while giving
   shaded slopes enough value structure. Verify snow cover at low-altitude
   biome cells as well as elevated imported terrain.
6. Review near/far and large-coordinate controls. No camera-relative noise,
   sudden normal-loss ring or detail that sparkles during a slow pan.

**Existing owners:** `materials/TerrainMaterialFeatureNodes.js`,
`TerrainMaterialWeatheringNodes.js`, `TerrainMaterialBakeFarColor.js`,
`stylized/RockManifestStore.js`, `StylizedRockView.js`, `SnowReliefShading.js`,
`SnowSurfaceShading.js`, `config/terrain-material-bake.yaml`.

**Acceptance:** hot sand, cold mineral ground and snow remain distinct without
their labels; representative stones look seated; surface structure survives
four lights and quality tiers; the existing near/far continuity fixtures pass.

## 12. N7 — Optional geography and recognizable places

**Owner:** world-generation engineer and environment artist. This is conditional
scope, following the earlier plan's deferred geography stage.

Survey actual elevations at 64, 256, 1,024 and 4,096 m before blaming atmosphere
for flat views. The current procedural generator combines smooth noise bands
at a 24 m height scale. Taller landmarks require source shape or placed content;
post-processing cannot create a valley or ridge silhouette.

If the approved value/composition pass still lacks place identity, prototype
three terrain briefs in a new opt-in generator version: a rolling grassland
basin, a wooded ridge/valley system, and an exposed cold upland. Define traversable
grades, watershed continuity, ridgeline scale and vista spacing together. Test
collision, shore geometry, editing and distant terrain from the start.

For existing and imported worlds, preserve elevations and water courses.
Consider bounded derived natural landmarks using the existing regional fields
and manifests: an outcrop group, distinctive grove, marsh pool edge or fallen
tree cluster. Stable world coordinates and seeds must determine placement.
Do not add a separate world generator just for background scenery.

**Acceptance:** approved player routes gain recognizable destinations and
silhouettes; version-1 worlds and imported saves retain their geography; new
generator metadata survives save/load; no new terrain-ID remapping. Architectural
landmarks are outside this pass. If later work reaches workshop geometry, first
follow the framework, implementation plan and Tiny Glade review required by
`AGENTS.md`, preserving semantic authoring and deterministic resolved chemistry.

## 13. N8 — Verify the feel during ordinary exploration

Still images cannot establish the following quality. These are planned reviews,
not reported motion/audio defects from this capture.

| Review | Concrete route/check | Desired result |
| --- | --- | --- |
| Foliage motion | Stand, walk, sprint and stop beside 05/07; calm and gusty wind | Recent structure-aware plant motion remains intact; trunks, leaves and grass respond at suitable scales |
| LOD and streaming | Walk outward, turn 180°, return; first and third person | No visible density wall, missing eligible ground cover, shade jump or delayed scene repair |
| Contact feedback | Cross grass, dirt, stone, wet bank and snow | Footstep sound, disturbance, particles and wetness agree with the actual surface |
| Camera | Slopes, tight trees, shore, mode switch | Stable eye height and framing; no ground clipping or sudden waterline/exposure flash; optional head motion stays user-controlled |
| Soundscape | Listen at biome interiors and edges, with mute toggled | Distinct but restrained ambience, gradual transitions, useful footstep/brush balance, no stacked playback |
| HUD | Rest, movement, interaction and capture mode at 760/1280/1600/1920 widths | Useful action feedback, readable prompts and minimal obstruction of scenery; focus and hotkeys still behave |

Use the existing `WorldVisualMotion`, exploration/player controllers, audio
surface/soundscape owners and HUD controller. Add no new audio context or
competing camera controller. Human listening is required for the sound mix;
automated lifecycle tests do not establish it.

## 14. N9 — Quality and performance acceptance

Read and follow [player movement performance QA](../perf-qa.md) before any
implementation affecting terrain, streaming, rendering or residency. This
planning task changes none of those systems and makes no new FPS claim.

**Implementation constraints**

- Preserve canonical Azgaar IDs **0–12**, in order. Persist custom definitions
  with deterministic IDs **32–254**. Material blend channels may share physical
  properties without replacing terrain identity. Add no legacy tile migration.
- Keep placement deterministic, world anchored, and equal across worker/main
  paths. Respect local invalidation and bounded preparation queues.
- Share existing habitat fields and material inputs. Small owners should handle
  palette, placement, material response and QA separately; do not grow a central
  renderer or add biome-specific core branches for data-driven differences.
- Prefer existing instancing and atlases. Track texture/geometry/placement bytes,
  instances, shader variants, scene passes and copy costs for each package.
- Keep quality, resolution, draw distance and populations matched in timing A/B
  runs. If an art change intentionally redistributes populations, report totals
  and spatial distribution separately. Do not disguise a quality reduction as
  an optimization.
- A new depth/color-sampling material can trigger a whole-scene copy. Compile
  optional paths out when disabled; culling a mesh is not proof that the cost
  disappeared. Share the existing water/post pipeline where applicable.

**Required evidence per implementation package**

1. Native before/after screenshots at these poses, plus the package's targeted
   controls. Record source/config/map hashes, readiness, backend and artifacts.
2. Meaningful focused tests for any changed classification, material mean,
   stable placement, world-coordinate or persistence contract. Do not add tests
   that merely repeat configuration constants.
3. Existing WebGPU/WebGL material correctness fixtures where both paths are
   supported. Use hardware WebGPU for timing. Inspect low/balanced/high presets
   for coherent art, not merely lack of exceptions.
4. Deterministic movement baseline and candidate under identical settings,
   including standard/dense-forest/high-grass/dense-mixed, construction and water.
   Require successful settle, zero browser errors and valid native/DOM focus.
   Keep screenshots/video recording out of timing runs.
5. Preserve the current matrix ceilings: measured p95 **≤33.3 ms**, hitch rate
   **≤2%**, collision gates, complete required populations, full scenery recovery
   **within two seconds** and no missing/below-density in-view grass at recovery.
   Respect the construction and water-specific checks as well.
6. Passing those ceilings alone is not equivalence. As a proposed project
   budget, review any package with more than **5% median p95 regression** or
   **10% tracked resource growth** across three matched baseline/candidate
   rounds. These are planning thresholds, not measured outcomes or replacements
   for the existing gates. Report noise, worst frames and actual memory scope.
7. Reload, terrain edit, biome paint, origin rebase and evict/return checks for
   affected systems. Custom biome definitions must survive unchanged.
8. Finish implementation with `npm run verify`, then archive a single index
   naming accepted and failed evidence. Capture validity, artistic approval and
   performance acceptance are three separate verdicts.

The [performance remediation plan](performance-remediation-2026-10-18.md)
identifies a settlement-readiness gap. These nature views do not close it.
Any future settlement/architectural route must first include that subsystem in
readiness and workload identity before using its performance as acceptance.

## 15. Review checkpoints and handoff

| Checkpoint | Review package | Exit condition |
| --- | --- | --- |
| C0 | Inventory, masks, fog/material controls, tree identity | Each P1 symptom has a discriminating diagnosis |
| C1 | Combined 01/03/04/05 player screenshots, four-light controls | Distance, paths, meadow floor and tree contact improve together |
| C2 | All retained views plus three positions per land biome and edges | Habitat identity and composition remain coherent across worlds |
| C3 | Coasts, wetland, cold ground and snow at both camera scales | Materials, water/banks and atmosphere agree; open water ID 0 is explicitly covered |
| C4 | Ordinary movement clips, listening review and unchanged QA gates | Quality survives motion, interaction, streaming and persistence |
| C5 | Optional geography prototype | Source-shape need is demonstrated and versioning is reviewed separately |

Each implementation handoff should contain: the symptom and shot IDs; confirmed
cause; owning modules/assets; proposed parameter or algorithm change; bounded
cost; before/after and motion evidence; test results; and remaining limitations.
Retain rejected attempts so the next session can distinguish an abandoned
direction from work still to do.

## 16. Capture result and implementation baseline

Eighteen views were retained: fourteen from error-free batches and four cold
biome views marked diagnostic. All eighteen reached recorded readiness and
matched their expected camera-cell IDs, but the cold batch logged seven repeated
collision errors for `tree:tree%3A-64%3A-80%3A63:trunk`, owner chunk `-64:-80`.
`CollisionWorld.replaceOwnerChunk` rejected its AABB for not overlapping the
canonical owner. Investigate profile offset, resolved prototype, transform and
ownership together in `TreeCollisionProvider`/`TreeCollisionProfiles`; preserve
the owner invariant and stable source identity. Add a boundary/rotation regression
case and replay 11 plus movement before accepting the fix. This is Q0, ahead
of appearance changes. No runtime fix is claimed by the baseline capture.

The first long browser attempt stalled after five views. Fresh focused batches
completed all requested views; both the timeout evidence and the cold errors
remain in the local archive. These stills are not timing measurements.

A launcher environment mistake in the earlier attempt overwrote the older
`visual-audit-2026-10-18/manifest.json` and `report.json`. Its screenshots were
untouched. Its pose manifest was restored from the tracked copy, and the lost
successful report is explicitly marked unavailable; it was not reconstructed.
The failed launch and correction are recorded in the local archive. The capture
runner now refuses nonempty output directories.

Runtime implementation starts from current `main` after pulling on October 19.
The screenshot baseline remains its actual October 18 frozen revision. Before
making timing comparisons, capture a matched current-runtime baseline; the
intervening performance changes must not be attributed to this art pass.

