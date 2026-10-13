# World visual quality plan — 2026-10-13

Status: screenshot review and implementation plan. No production rendering,
generation, configuration, or asset changes are included in this pass.

The target is a polished stylized fantasy world: convincing materials, coherent
plant scale, distinct habitats, readable landscape silhouettes, and consistent
detail while moving. Keep the current art direction. More grass, stronger bloom,
or higher texture resolution alone will not deliver that result.

## Capture method and limits

Review started on **October 13** and completed on **October 14, 2026**. The
original twelve land-biome images were captured on October 13 at revision
`9fb5ba6b`, using the default procedural world, seed **918273**, and unchanged
`editor.config.yaml`. The existing in-progress screenshots were subsequently
committed in `209f89d1`; this document completes their review.

Locations were selected reproducibly: LCG seed **20261013**, 250,000 random cell
pairs in `[-8000, 8000)` on each axis, retaining the first occurrence of each
biome. A random yaw was drawn when a biome was first encountered. Cells are
2 metres wide; the conversion is `X = (cellX + 0.5) * 2`,
`Z = -(cellZ + 0.5) * 2`. This is deliberately broad, stratified sampling, not
an area-weighted assessment or a search for the best views.

The captures use headed Windows Chromium, **hardware WebGPU on NVIDIA Lovelace**,
1600 × 900 CSS pixels at device scale 1, first-person FOV 68°, pitch −0.08 radians,
and the **Highfield** day preset with the clock paused at 12:00. Manual weather
is off. Regional atmosphere, snow particles, wind and foliage animation remain
live, so these are qualitative observations, not deterministic pixel comparisons.
The HUD is retained as evidence of the current exploration presentation.

**Readiness limitation:** all twelve images have 49 resident terrain chunks,
zero pending terrain loads/commits, ready player collision, and zero pending
material/field/meadow/draw/variant tasks. However, **none passed the complete
scenery settle gate**: one build-queue entry remained pending. Spot checks
identified `bushBuildQueue`. The harness waited 16 seconds after entering each
pose, then up to 30 seconds for 60 consecutive ready frames. An earlier desert
inspection also retained that queue entry after a longer wait. Keep the images
for visible material and composition findings, but treat exact vegetation
population and absence claims as provisional. Browser page/console errors were
zero during the retained procedural capture run. These are not accepted
performance baselines; the HUD FPS numbers are not benchmark results.

An initial Eldara jump failed with `Object spatial operation exceeds 262144
buckets`; those failed attempts are excluded from the image set. Subsequent
capture navigation resets the terrain predictor and requests the destination
resident set before allowing a frame at the new pose. This is a capture-harness
workaround, not an engine fix or evidence that ordinary teleporting is correct.

Full coordinates, camera state, biome verification, resolved sky values and
readiness snapshots are in
[procedural-captures.json](../qa/visual-audit-2026-10-13/procedural-captures.json).
The [provenance record](../qa/visual-audit-2026-10-13/provenance.json) includes
the source revision, sampling counts, configuration hash and image hashes.
An additional marine/imported-world capture attempt after resuming the review
was interrupted by a live application reload and shader initialization. No
loading-screen images are retained. Marine, imported mountain and settlement
views remain explicit follow-up coverage; the twelve linked images are the
evidence for this pass.
The review does not establish animation quality, audio quality, settlement or
workshop appearance, or coverage at other quality tiers.

## Screenshot inventory and observations

Each link opens the original **1600 × 900** browser capture. The ID is the
canonical biome at the camera, not a claim that the whole frame contains only
one biome. Border cases are retained rather than replaced with beauty shots.

| ID / screenshot | Canonical X, Z (metres) | What is visible |
| --- | --- | --- |
| [01 · Hot desert](../qa/visual-audit-2026-10-13/procedural-01.jpg) | -5,667, 93 | Broad white streaks and pale, low-contrast sand dominate; little foreground or horizon structure. |
| [02 · Cold desert](../qa/visual-audit-2026-10-13/procedural-02.jpg) | 501, -2,833 | Bright streaks on bare ground; a dense grass wall creates a hard habitat edge; cyan water beyond. |
| [03 · Savanna](../qa/visual-audit-2026-10-13/procedural-03.jpg) | -14,373, -3,467 | Gold palette reads as dry grassland, but nearly uniform tall blades resemble a crop; little foreground variation. |
| [04 · Grassland](../qa/visual-audit-2026-10-13/procedural-04.jpg) | -8,957, 7,737 | Greener than savanna, with similar blade height and rhythm; repeated broadleaf silhouettes along the horizon. |
| [05 · Tropical seasonal forest](../qa/visual-audit-2026-10-13/procedural-05.jpg) | -15,817, -3,703 | Useful close bark and root silhouette; bright turf reaches the trunk; cyan shallows and a dark water band need integration. |
| [06 · Temperate deciduous forest](../qa/visual-audit-2026-10-13/procedural-06.jpg) | -1,945, 7,795 | Strong tree/grass shapes, but the woodland floor stays meadow-like; little visible litter or shaded understory. |
| [07 · Tropical rainforest](../qa/visual-audit-2026-10-13/procedural-07.jpg) | 2,005, 2,941 | Nearby trees become pale cutouts in front of a darker distant tree line; inconsistent depth and vegetation appearance. |
| [08 · Temperate rainforest](../qa/visual-audit-2026-10-13/procedural-08.jpg) | -1,997, -2,889 | Bare foreground patch contains triangular grass remnants; investigate deformation/coverage before altering density. |
| [09 · Taiga](../qa/visual-audit-2026-10-13/procedural-09.jpg) | -15,631, -11,255 | Cooler grass palette, but sparse, nearly bare conifers provide weak taiga identity; sharp snow boundary at right. |
| [10 · Tundra](../qa/visual-audit-2026-10-13/procedural-10.jpg) | -4,803, 14,351 | Snow surface has some relief, but broad white coverage and sparse conifers leave little tundra-specific structure. |
| [11 · Glacier](../qa/visual-audit-2026-10-13/procedural-11.jpg) | 75, -7,561 | Thin white glacier patch meets lush turf and broadleaf forest abruptly; a procedural biome-classification issue as well as a blend issue. |
| [12 · Wetland](../qa/visual-audit-2026-10-13/procedural-12.jpg) | 9,647, 1,483 | This direction reads much like meadow/woodland; wetland identity is weak in the facing view, with water only on the minimap. |

Representative evidence:

![Cold desert: bright streaks and a hard grass boundary](../qa/visual-audit-2026-10-13/procedural-02.jpg)

![Tropical rainforest: pale nearby tree silhouettes and darker distant trees](../qa/visual-audit-2026-10-13/procedural-07.jpg)

![Procedural glacier: narrow snow patch beside dense grass and broadleaf trees](../qa/visual-audit-2026-10-13/procedural-11.jpg)

## Highest-impact findings

| Priority | Evidence | Improvement to pursue |
| --- | --- | --- |
| P0 | Bare-ground captures 01 and 02 have long, very bright streaks and little readable surface relief. | Diagnose emission versus surface shading; restore sand/soil value range and texture scale. |
| P0 | Capture 02 shows dense grass ending at a hard, dark-edged boundary. | Blend coverage, height and ground color across the habitat edge; verify it is not incomplete preparation. |
| P0 | Capture 07 has pale, almost white tree silhouettes in front of a darker distant tree line. | Diagnose inconsistent atmosphere or lighting between tree representations; keep depth ordering coherent. |
| P1 | Captures 03–05 are dominated by closely packed, similarly tall blades. Savanna and grassland already differ in color, but share a crop-like structure. | Improve plant height hierarchy, patch size, gaps and species silhouettes before increasing density. |
| P1 | Capture 05 places bright turf right up to a large trunk and a saturated cyan shore. | Connect forest floor, roots, bank material, shallows and vegetation through local habitat rules. |
| P2 | The HUD competes with the terrain at the bottom of every shot; pale labels lose contrast against pale ground. | Separate exploration and editing presentation, improve contrast, and provide clean capture mode. |

Capture 08 also exposes a bare patch filled with small triangular grass remnants;
identify whether interaction deformation, placement or a detail transition owns
it before changing density. Captures 09–10 have unusually sparse conifer crowns;
check crown assets, alpha coverage and LOD before adding more trees. In capture 12,
the wetland's facing view reads much like meadow. Check its shore-facing view and
habitat weights before concluding that water or wetland assets are absent.

**Another P0 boundary issue:** capture 11 shows a narrow white glacier patch next
to lush green grass and broadleaf trees. This is a procedural low-elevation
sample, not an alpine panorama. `ProceduralWorldGenerator.sampleBaseTile` assigns
glacier above `heightScale * 0.9`, or **21.6 m** at the captured default, before
its climate tests. Revisit that classification and its neighborhood continuity;
adding snow detail alone cannot fix the resulting landscape transition.

The current renderer already has useful foundations: biome-dependent palettes,
authored tree silhouettes, detailed bark, dense groundcover, water depth color,
and atmospheric separation of distant trees. Preserve those systems and improve
how they combine. A single random viewpoint does not establish the average
quality of its whole biome.

## Implementation order

### 1. Make the visual baseline trustworthy

- [ ] Resolve the stationary scenery-preparation backlog recorded with the
  screenshots. Identify the owning queue and whether its pending entry represents
  missing visible content, continuous replacement, or stale bookkeeping. Do not
  make the readiness gate pass by ignoring work that can change the image.
- [ ] Treat a teleport as a camera cut in streaming prediction. Diagnose the
  large-coordinate object-index failure before using cross-continent jumps as
  a visual review workflow. A cut must not create an enormous object query
  spanning unrelated resident or predicted areas.
- [ ] Establish saved review poses with camera, canonical coordinates, biome,
  sky preset, weather, render path, and preparation status. Add a clean capture
  toggle that hides the HUD and debug counters without changing the scene.

**Likely owners:** `InfiniteTerrainView`, `ObjectView.residentObjectCellBounds`,
`ObjectSpatialIndex`, `StylizedSurfaceViewBase.getPreparationStatus`, vegetation
build queues, and the existing performance harness. These are investigation
entry points, not confirmed root causes.

**Acceptance:** all review locations finish terrain, collision, material and
scenery preparation; repeated visits produce the same populations; camera cuts
and floating-origin rebases produce no browser errors. Preserve normal movement
prefetch. Capture the same views again before judging final placement density.

### 2. Restore ground-material readability

- [ ] Isolate the bright, stretched streaks visible on bare ground. Compare the
  same pose with blown surface streaks, direct light, and material normals disabled
  one at a time in a diagnostic capture. Record which change removes the defect.
- [ ] Start with the existing airborne sand/snow emission path: the terrain
  material feeds `airStreak` into `emissiveNode`. That is a plausible source of
  bright marks, not proof that every mark is emission. Check the underlying
  surface, shore masks, UV scale and distance filtering as well.
- [ ] Tune drifting sand to sparse, wind-driven, sand-colored movement. Preserve
  readable ground under it. Snow drift should retain cool shadow and warm light
  separation without turning broad surfaces into featureless white.
- [ ] Give sand, dry mineral soil, forest litter, wet mud, rock and snow distinct
  roughness and detail scale. Reuse the existing stochastic material families,
  terrain bake and weathering system. Keep broad color variation quieter than
  the landform; reserve fine detail for distances where it resolves.

**Likely owners:** [terrain material](../../src/editor/terrainMaterial.js),
[blown streaks](../../src/editor/stylized/ambient/BlownStreaks.js),
[ambient settings](../../config/ambient-effects.yaml), and
[terrain material settings](../../config/terrain-material-bake.yaml).

**Acceptance:** the ground remains identifiable at eye height in noon, low sun,
overcast and night views. Wind streaks do not dominate a still frame. Near detail
fades without stretched bands, obvious repeating stamps, or an abrupt change in
surface brightness. Validate dry ground separately from shore and snow.

### 3. Improve vegetation scale and habitat structure

- [ ] Reduce the impression of one continuous crop at the player's feet.
  Compose low turf, taller clumps, occasional seed heads, and exposed ground in
  patches with intentional scale. Retain dense cover where the habitat calls
  for it; improve silhouette and distribution before raising instance counts.
- [ ] Break up abrupt bare-ground-to-grass edges with a narrow, irregular fringe
  of shorter and sparser plants. Keep soil color, root color, blades, far cards
  and terrain cover consistent through the transition.
- [ ] Make canopy cover affect composition as well as density: litter and roots
  beneath trees, shrubs at woodland edges, low shade-tolerant cover in interiors,
  and taller grasses in openings. Reuse the habitat and regional fields.
- [ ] Vary tree age, trunk proportions and crown outline within ecological
  groups. Use small groves and clearings with readable negative space. Avoid
  equidistant scatter and repeating isolated silhouettes on the skyline.
- [ ] Check species, silhouette and groundcover together for each canonical
  biome. A different green or yellow tint is only one part of its identity.

**Likely owners:** meadow blade/card materials and look tables,
`ForestHabitatField`, `RegionalCharacterField`, species and prototype selection,
`BiomeAssetPalette`, `groundDetails`, and `tropicalKit` configuration.
Existing palette and blade-family support is already implemented; this is a
composition and tuning pass, with targeted new silhouettes only where needed.

**Acceptance:** savanna, grassland, tropical forest, temperate forest, taiga and
wetland remain distinguishable with the biome label hidden. Review a close view,
a 30–80 m view, and the far handoff. A 180° turn and a chunk crossing must preserve
ground coverage and crown color without a rectangular density edge.

### 4. Compose the landscape at three scales

- [ ] At landscape scale, give each region a readable sequence of ridges,
  valleys, water and occasional landmarks. Preserve broad quiet areas, but give
  a player a reason to choose a direction. Prioritize silhouettes visible from
  ordinary player poses, not just elevated beauty shots.
- [ ] At medium scale, use rock groups, drainage lines, woodland edges and
  shoreline shelves to connect the foreground to the horizon. Vary grouping
  and orientation according to slope, erosion, water and exposure.
- [ ] At close range, concentrate small stones, fallen wood, roots, moss and
  other detail around believable anchors. Avoid adding a uniform debris layer
  everywhere. Use bounded instance batches and the current residency budgets.
- [ ] Make coasts and wetlands read as connected terrain: uneven banks,
  intermittent wet edges, shallows with depth variation, and vegetation that
  follows saturation. Evaluate foam, water color and shore detail as one scene.
- [ ] Give cold terrain its own forms: exposed rock, sheltered snow pockets,
  wind-scoured ridges and occasional ice. Tundra should remain visually distinct
  from glacier. Extend the existing slope/snow system instead of replacing it.
- [ ] Review procedural glacier classification against climate and surrounding
  terrain. Retain ID 11, but avoid isolated snow strips in otherwise warm,
  low-elevation vegetation. Keep imported Azgaar biome identity authoritative;
  this procedural-generator correction must not reclassify imported biomes.

**Likely owners:** canonical guidance, `ProceduralWorldGenerator`,
`AzgaarMacroWorldGenerator`, `MountainRidges`, `MacroFarTerrainView`, scatter
fields, water/shore systems and snow accumulation. Separate local detail changes
from changes to continental relief so their effects can be reviewed independently.

**Acceptance:** three uncurated views per target biome show a coherent foreground,
middle distance and horizon. Imported mountains retain silhouette and material
continuity where the streamed mesh meets the distant backdrop. Landmark/detail
placement is deterministic across eviction, reload and origin rebasing.

### 5. Balance light, atmosphere and screen presentation

- [ ] Tune the key/fill ratio and material values together. Preserve shape on
  bright sand and snow and readable trunks beneath foliage. Use contact shading
  to anchor objects without making an entire grass patch uniformly dark.
- [ ] Review regional haze at close, middle and far distances. Retain atmospheric
  depth while keeping useful contrast in nearby woodland and ridges. Reserve
  dense mist for conditions and terrain that support it.
- [ ] Investigate the pale-tree discontinuity in capture 07 before reducing fog
  globally. Compare the mesh, proxy and impostor paths with identical light and
  regional atmosphere, then isolate any mist composition pass. Preserve canopy
  hue and opacity across their transitions.
- [ ] Review cloud scale and softness against the terrain. The sky should support
  the landscape's scale rather than become its sharpest or brightest pattern.
- [ ] Verify the active walk-mode finish before changing generic post-processing
  settings. The configured god-rays path has its own cinematic finish. TAA,
  bloom and contact occlusion already exist; check which path actually owns them.
- [ ] Unify the HUD's visual hierarchy: quieter inactive controls, readable
  labels over bright ground, consistent spacing, and optional diagnostic counters.
  Preserve access to tools while allowing an unobstructed exploration view.

**Likely owners:** `SkyLookController`, `regionalSkyLook`, `StylizedSkyView`,
`cinematicFinish`, the god-rays/post-processing integration and player HUD styles.

**Acceptance:** compare fixed poses in Highfield, low sun, overcast and moonlight.
No preset loses ground shape or turns shaded foliage into an unrelated palette.
Check HUD contrast over sand, snow, deep shade and water. Avoid judging exposure
from a single biome or applying an extra global grade on top of an existing one.

### 6. Validate feel in motion

These are follow-up checks; still screenshots do not establish their quality.

- [ ] Record short walk, sprint, stop and 180° turn sequences in open meadow,
  dense woodland, a shoreline and snow. Inspect grass/card changes, tree
  impostors, temporal ghosting, cloud motion and shadow stability at normal speed.
- [ ] Check third-person camera clearance and easing, foot contact, stride,
  grass response and water entry together. Use the existing camera, locomotion
  and interaction systems before introducing new effects.
- [ ] Review wind, steps, water and region ambience against what is on screen.
  Test biome and weather transitions for abrupt visual or audio changes.

**Acceptance:** no visible uncovered strip appears during ordinary travel;
stopping does not reveal a late wave of scenery; camera turns preserve readable
foliage. Report recovery time and visible coverage alongside frame time.

## Delivery batches and gates

| Batch | Deliverable | Scope / dependency |
| --- | --- | --- |
| A | Reliable capture poses; fix or isolate the preparation and camera-cut issues | Runtime diagnosis first; prerequisite for density decisions |
| B | One desert and one cold-surface material pass, with explicit diagnostic A/Bs | Small to medium; reuse current shader and bake structure |
| C | One meadow/woodland boundary and one wetland slice at near/mid/far distance | Medium; depends on A, then propagate proven rules by biome |
| D | Imported mountain/coast composition and distant-terrain continuity | Larger; terrain and scatter work require deterministic comparison |
| E | Lighting matrix, HUD refinement, and motion/interaction acceptance | After material and composition changes; review all prior poses |

For every batch, retain original and updated images at the same poses. Make one
major visual change at a time. A reviewer should be able to identify the intended
improvement without needing a technical explanation.

Before any terrain, rendering, streaming or residency implementation, follow
[player movement performance QA](../perf-qa.md). Run the baseline and changed
versions on the same hardware, sources, resolution, density, route and sky
conditions. Close other rendering tabs and require hardware WebGPU, zero browser
errors and successful settle for authoritative comparisons.

```bash
npm run qa:perf:windows -- --qa chunk-cross --warmup 8 --duration 12 --settle --drain-seconds 15 --revisit --turn-on-revisit --grass-diagnostics
# Use native Windows Node from WSL for the full hardware matrix:
node.exe scripts/run-perf-matrix.mjs --headed --warmup 8 --duration 12
```

Preserve the matrix's p95 ≤33.3 ms and hitch-rate ≤2% limits, collision readiness,
and density checks. The stricter zero post-warmup hitch target remains desirable.
Also compare scenery readiness, missing visible meadow tiles, post-stop recovery,
resident populations, upload bytes and memory. A cheaper but incomplete scene is
not an acceptable improvement. No performance win is claimed by this review.

## Constraints and work to avoid

- Keep all 13 Azgaar biome IDs `0–12` distinct. Persist custom definitions with
  deterministic IDs in `32–254`; do not add the former terrain-ID remapping.
- Preserve canonical-coordinate continuity in textures, wind, scatter and
  material transitions. Check negative coordinates and floating-origin rebases.
- Do not raise global scatter density or residency radius to disguise composition
  or loading problems. Measure both preparation and rendering cost.
- Do not add expensive water/depth-copy effects without measuring their whole
  scene cost, as described in the performance guide.
- Reuse existing stochastic materials, biome palettes, authored assets, regional
  sky, snow, weather and interaction systems. Confirm a missing capability in
  the current implementation before planning a replacement.
- Settlement and workshop quality need separate close-range captures. If later
  landmark work changes building geometry, follow the
  [workshop geometry framework](../architecture/workshop-geometry-framework.md),
  [implementation plan](workshop-geometry-framework-plan-2026-08-19.md), and
  [public-behavior review](../research/tiny-glade-workshop-behavior-review-2026-08-19.md).
  Keep semantic authoring authoritative and generated detail deterministic and batched.

## Related work

The [biome appearance review](../reviews/biome-reference-review-2026-10-07.md)
already records palette parity and preparation limitations. The
[snow review](../qa/snow-biome-review-2026-10-06.md) describes existing snow
shading and remaining lighting/rock work. [Regional skies](../sky-regions.md)
already provide climate-dependent atmosphere. Use these as implementation
context; their earlier performance numbers are not measurements of this capture.
