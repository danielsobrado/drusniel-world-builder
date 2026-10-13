# World visual quality plan — 2026-10-13

Status: screenshot review and implementation plan. No production rendering,
generation, configuration, or asset changes are included in this pass.

The target is a polished stylized fantasy world: convincing materials, coherent
plant scale, distinct habitats, readable landscape silhouettes, and consistent
detail while moving. Keep the current art direction. More grass, stronger bloom,
or higher texture resolution alone will not deliver that result.

## Capture method and limits

<!-- CAPTURE_METHOD -->

## Screenshot inventory and observations

<!-- SCREENSHOT_INVENTORY -->

## Highest-impact findings

| Priority | Evidence | Improvement to pursue |
| --- | --- | --- |
| P0 | Bare-ground captures 01 and 02 have long, very bright streaks and little readable surface relief. | Diagnose emission versus surface shading; restore sand/soil value range and texture scale. |
| P0 | Capture 02 shows dense grass ending at a hard, dark-edged boundary. | Blend coverage, height and ground color across the habitat edge; verify it is not incomplete preparation. |
| P0 | Capture 07 has pale, almost white tree silhouettes in front of a darker distant tree line. | Diagnose inconsistent atmosphere or lighting between tree representations; keep depth ordering coherent. |
| P1 | Captures 03–05 are dominated by closely packed, similarly tall blades. Savanna and grassland already differ in color, but share a crop-like structure. | Improve plant height hierarchy, patch size, gaps and species silhouettes before increasing density. |
| P1 | Capture 05 places bright turf right up to a large trunk and a saturated cyan shore. | Connect forest floor, roots, bank material, shallows and vegetation through local habitat rules. |
| P2 | The HUD competes with the terrain at the bottom of every shot; pale labels lose contrast against pale ground. | Separate exploration and editing presentation, improve contrast, and provide clean capture mode. |

<!-- ADDITIONAL_FINDINGS -->

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
