# Water, rivers and sea: visual quality plan

Captured: October 16, 2026. Review completed: October 17, 2026. Status: **proposal; rendering changes are not implemented by this document**.

This plan targets a polished, stylized AAA presentation that belongs in Drusniel's world: convincing scale, readable depth and currents, coherent shore materials, restrained foam, and stable movement. Extra simulation complexity is justified only when it improves those qualities in the actual streamed world.

The first implementation pass should address **stepped shorelines and serrated crests, repeated inland surface patterns, and broad opaque foam**. These are visible defects in the new captures. Biome-specific banks, local river dynamics and reflection polish follow; a more expensive ocean simulation is a later option.

[Screenshot gallery and capture record](../qa/water-aaa-audit-2026-10-16/README.md) · [Contact sheet](../qa/water-aaa-audit-2026-10-16/contact-sheet.jpg) · [Exact poses](../qa/water-aaa-audit-2026-10-16/manifest.json) · [Raw capture report](../qa/water-aaa-audit-2026-10-16/report.json)

## 1. Evidence and scope

**Thirteen new views are accepted:** six procedural coast biomes, a player-height coast companion, a deep-sea view, four Eldara river biomes, and an Eldara lake bank. All passed readiness, expected biome and canonical water-kind checks; source integrity held and browser errors were zero. Locations were selected by seeded random sampling, stratified to cover distinct coast biomes and imported rivers. These are production-world captures, not material preview scenes. Source/configuration are frozen at `52914b1559ceda00526ca027b83a89775ced63a4`; the frozen server's declared files and hashes are retained with the evidence. Other public assets and the imported map remain shared checkout files; the map hash is recorded separately.

Capture conditions: native Windows headed Chromium, hardware NVIDIA Lovelace WebGPU, 1600 × 900, DPR 1, FOV 68°, Highfield at paused noon, manual weather off. Production camera cuts and the existing preparation helper require complete terrain, scenery and collision readiness, followed by 60 ready frames. Regional atmosphere, wind, particles and water animation remain active. Consecutive HUD and clean screenshots are different frames. Exact animated pixels are not reproducible from the pose alone.

Biome labels mean **the camera's actual Azgaar terrain ID**, not every visible bank or tree. Water labels use the canonical query at the recorded target. In particular, the procedural generator currently classifies its sampled water as ocean; a narrow inlet in a screenshot must not be mislabeled a river or lake. Rivers and the lake are sampled from imported Eldara geography.

The gallery records accepted and rejected views separately. A failed readiness attempt is evidence of a capture/preparation problem and must not become an accepted visual baseline. Server-console warnings announced a tree-impostor asset mismatch/runtime-bake fallback and a Three.js deprecation; zero browser errors does not mean zero warnings. Record or resolve the asset fallback before authoritative performance comparison. This pass does not establish FPS, audio quality, temporal stability, underwater quality, weather transitions, or cross-backend parity.

## 2. What is already implemented

Preserve this work and measure its remaining limits before replacing it:

| Existing system | Relevant implementation | Consequence for this plan |
| --- | --- | --- |
| Canonical water kinds, body IDs, depths, currents, river profiles and lake levels | `src/editor/water/WaterTerrainModel.js`, `RiverChannel.js`, `RiverReachProfile.js`, `LakeBodies.js`, `TerrainWaterQueries.js` | Improve presentation on the existing domain. Geometry and gameplay must continue to agree. |
| Streamed half-float coverage/surface/depth/shore field and byte flow/fall/plunge field | `WaterField.js`, `src/editor/stylized/StylizedWaterSlot.js` | Every extra field needs an explicit memory, upload and halo budget. Existing channels are occupied. |
| Depth absorption, scene-color refraction, Fresnel, contact foam | `StylizedWaterMaterial.js`, `WaterSurfaceResponse.js`, `config/water-visual.yaml` | Diagnose balance and composition; these are not missing features. |
| Shoreline depth fade and tapered surface height offset | `StylizedWaterMaterial.js` | The historical polygon-edge fix already exists. Remaining edge problems require new evidence, not reapplying that fix. |
| Five-component sea swell, detail normals, surf, whitecaps, crest transmission | `SeaSwell.js`, `SeaSurfaceShading.js`, `SeaDetailShading.js`, `SeaSurfNodes.js` | Retune energy, scale and exposure before considering a spectral ocean. |
| Shared sand/water swash front and wetness memory | `CoastSwashShading.js`, `CoastSandShading.js` | Test the handoff and physical width across slope changes. Avoid a second independent foam front. |
| Flow-advected inland normals, bank foam, falls and mist | `RiverSurfaceShading.js`, `WaterfallShading.js`, `mist/WaterfallMist.js` | Improve local flow variation, obstacle response and composition. |
| Fixed-pool local cube capture and optional planar capture with reprojection | `src/render/reflections/WaterReflectionController.js`, `PlanarReprojection.js` | Reflections already exist. Budgeted freshness and eligibility need examination. |
| Underwater optics, Snell window, projected caustic infrastructure | `src/editor/water/Underwater*`, `ProjectedWaterCaustics.js` | Add dedicated review coverage before calling these defective. |
| Water state events, water footsteps and geography-aware ambience | `PlayerWaterEvents.js`, `src/editor/audio/world_soundscape.js`, `soundscape_weights.js` | Reuse the existing event/audio boundary for interaction polish. |

The historical [water-domain contract](../architecture/water-domain-contract.md) still calls itself a proposal and describes an older flat-overlay runtime. Its invariants remain useful, but its “current limitation” section is not an accurate inventory of today's implementation. Updating that status is part of WQ-00.

The [October 15 ocean review](../qa/world-visual-quality-2026-10-14/ocean/README.md) already records fixes for deep-water spray puffs, pale crest stamps and a short foam repeat. New improvements must retain those tests and avoid reintroducing those effects. Its older performance and release status should not be treated as today's measurements.

## 3. Visual findings

The final per-view observations and acceptance status are recorded in the linked gallery. Observations from inspected captures:

| Evidence | Visible observation | Priority and next diagnostic |
| --- | --- | --- |
| [Desert coast](../qa/water-aaa-audit-2026-10-16/coast-01.png) | A rounded shaded rim separates wet water from the foreground sand. Large dry polygon cracks remain prominent close to the wash. The shallow cyan layer is much brighter than the dark band beyond it. | P0 contact isolation, then P1 wet substrate/optics calibration. Do not assume the rim is entirely geometry. |
| [Grassland coast overview](../qa/water-aaa-audit-2026-10-16/coast-04.png) | The shoreline has long angular/stepped sections; broad white foam covers much of the near-water strip. Large reflected sky shapes sit above a dark trough, with little intermediate roughness structure. | P0 contact and individual foam-source controls; P1 reflection/normal-scale review. |
| [Temperate forest coast](../qa/water-aaa-audit-2026-10-16/coast-06.png) | The inlet has a nearly uniform turquoise shelf, a sharp dark-blue transition, smooth bulky waves and a pale outlined bank. Its broad bare bank has little localized shore detail. It is canonically ocean, despite its lake-like framing. | P1 depth/bed calibration and shoreline ecology; P2 shelter-aware wave energy. Preserve canonical classification. |
| [Taiga coast](../qa/water-aaa-audit-2026-10-16/coast-09.png) | The mid-right wave crest has a clearly serrated triangular outline. The shelf is bright cyan with a sharp transition to a dark trough, and the near bank still has angular contour segments. | P0 displaced-grid/normal diagnosis in WQ-01; P1 cold-shore optical calibration. White airborne specks need particle-layer isolation before attribution to spray. |
| [Tundra coast](../qa/water-aaa-audit-2026-10-16/coast-10.png) | Pale/snow-covered ground and airborne snow coexist with a strongly aquamarine pool-like inlet. Shore outlines turn through hard corners, and foam obscures some of the shallow bed. | P0 contact/foam; P1 cold substrate, snow/wetness handoff and water optical profile. The visible water is canonically ocean. |
| [Wetland coast](../qa/water-aaa-audit-2026-10-16/coast-12.png) | The foreground shows the strongest stepped contact contour, including multiple bright angular bands. The curved swell also exposes regular facets. | Primary P0 shoreline and swash-ownership hero view; P1 wetland bank integration. |
| [Player-height coast](../qa/water-aaa-audit-2026-10-16/coast-04-player.png) | Near grass hides much of the contact edge. The visible water reads as long horizontal cyan/dark bands with large smooth swells. | Keep as a gameplay composition check; use the overview for contact diagnosis. It is not a strong close-up of the waterline. |
| [Deep sea](../qa/water-aaa-audit-2026-10-16/open-sea.png) | Fine dark ripples are present, but large soft cloud-reflection patches dominate parts of the crest field. Distant land is visible; this is a deep ocean-kind point, not proof of a land-free offshore horizon. | P1 reflection roughness/normal-scale integration; P2 wave hierarchy. Do not infer reflection shimmer from a still. |
| [Taiga river](../qa/water-aaa-audit-2026-10-16/river-09.png) | Repeated small bright motifs form strongly regular rows across a broad, straight reach. The smooth pale banks have little local roughness or shore structure. | P0 inland pattern isolation; P1 local current variation and bank detail. |
| [Temperate rainforest river](../qa/water-aaa-audit-2026-10-16/river-08.png) | Dense white mottling covers most of the channel; the near stones and edge lack a clear quieter surrounding pool/wake contrast. Banks read as broad uniform strips. | P0 distinguish foam from specular detail; P1 obstacle-aware flow and substrate variation. A static frame does not establish actual current direction. |
| [Wetland river](../qa/water-aaa-audit-2026-10-16/river-12.png) | Similar turquoise water and dense repeated bright mottling to the wooded river, despite a different environment. Long straight, smooth bank bands dominate the composition. | P0 pattern density; P1 sediment/organic-water profile and more varied local bank treatment. |
| [Deciduous forest river](../qa/water-aaa-audit-2026-10-16/river-06.png) | A distinct crosshatched grid appears in the bright central highlight. Dense small surface motifs repeat across the channel. Straight pale banks transition abruptly to green material. | Primary P0 inland normal/foam/glint isolation view; P1 wet bank material transition. |
| [Wetland lake](../qa/water-aaa-audit-2026-10-16/lake-bank.png) | Cloud reflection is present. A highly regular fine ripple pattern and broad bright near-bank mottling reduce the impression of clear, quiet shallows. The foreground edge is angular and sparsely dressed. | P0 inland pattern/contact controls; P1 roughness, depth cues and rooted shore ecology. No falling water is shown. |
| [Earlier desert phase](../qa/water-aaa-audit-2026-10-16/initial-attempt/coast-01.png) | At the same location, a different live wave phase produces a much broader white band than the retained retry image. | Review complete wave cycles. The two images are evidence of phase variation, not a before/after implementation comparison. |

The central review questions are:

1. Does the shallow water retain translucent gaps and reveal useful bed detail, or become a broad pale strip?
2. Does the shoreline look like a thin moving film over terrain, or a raised rim?
3. Can a river's downstream direction, slow margins and disturbed sections be read without UI?
4. Do cold, wooded, sandy and wetland shores retain their identities under the same water material?
5. Do reflections and the distant water surface belong to the visible sky and landscape?

Treat observations as established only where linked screenshots show them. Shader mechanisms below are hypotheses until an isolated control reproduces the issue. The current screenshots cannot prove texture swimming, periodic animation resets, shimmer, incorrect audio, or a frame-time regression.

## 4. Art direction and review targets

Water should have three readable scales: broad body shape and wave groups; localized current, breakers and reflections; then fine ripples and foam breakup. At player height, the first two should remain legible without needing a dense field of tiny highlights.

Adopt these reference targets for review:

| Context | Target appearance | Avoid |
| --- | --- | --- |
| Sheltered coast | Clear or softly tinted shallows, sparse broken swash, long quiet gaps | Offshore swell and a continuous white border on every small inlet |
| Exposed sea | Grouped long waves, narrow bright crests, sparse persistent foam trails, roughness increasing with wind | Broad pale stamps on every wave; adding more tiny waves to hide a weak silhouette |
| Sandy/desert bank | Sand visible under thin water; a damp transition connected to recent runup; sparse debris | Dry polygon-crack pattern continuing unchanged through saturated sand |
| Temperate forest river | A readable faster central current, slower pools and margins, dark wet stones, reflected canopy | A uniform glossy strip with the same turbulence at every point |
| Cold coast/taiga/tundra | Cooler stone/silt shore, snow retreating at wet contact, restrained sea color | Automatically copying warm beach sand and tropical shelf treatment into every coast |
| Wetland | Darker organic bed, controlled turbidity, quiet pools, rooted reed clusters and patches of open water | Uniform aquamarine water or evenly scattered plants across all depths |
| Lake | Fine wind ripples, credible reflected shore shapes, no river streaks without current | Strong ocean surf merely because the lake's elevation resembles sea level |

These are initial art hypotheses, not universal biome laws. Salinity, water depth, sediment, weather and shoreline substrate should control the result; biome supplies a prior. Keep the current 13 Azgaar terrain IDs `0–12` unchanged. Persist custom biome definitions and deterministic IDs `32–254` through the existing world representation.

## 5. Ordered implementation backlog

Each item should be a small reviewable change or sequence of changes on `main`. Each records before/after screenshots at the same poses, states its performance effect, and leaves an independent opt-out while being evaluated. Effort labels are relative scope, not delivery promises.

| ID | Priority | Result | Depends on | Scope |
| --- | --- | --- | --- | --- |
| WQ-00 | P0 | Reproducible diagnosis and trustworthy captures | — | Small |
| WQ-01 | P0 | Thin, coherent water/ground contact | WQ-00 | Medium |
| WQ-02 | P0 | Suppress inland repetition; restrain foam and give it age | WQ-00, WQ-01 for contact | Medium |
| WQ-03 | P1 | Explicit water identity and continuous visual profiles | WQ-00 | Medium |
| WQ-04 | P1 | Rivers with readable local current and disturbances | WQ-03 | Large |
| WQ-05 | P1 | Coherent reflections, highlights and shallow optics | WQ-01, WQ-03 | Medium |
| WQ-06 | P1 | Shore materials and ecology appropriate to each environment | WQ-01, WQ-03 | Medium |
| WQ-07 | P2 | Sea energy responds to wind, depth and shelter | WQ-02, WQ-03 | Medium; spectral option large |
| WQ-08 | P2 | Player interaction, transitions and sound reinforce water | WQ-03, WQ-04 | Medium |
| WQ-09 | P0 throughout | Stable streaming, quality tiers and performance acceptance | Every item | Continuous |

### WQ-00 — Make the comparisons diagnostic

**Deliverables**

- Retain this pass's random seed, manifest, map hash, source snapshot, original PNGs and failures. Add a future baseline suite that replays the manifest without resampling.
- Add captures with controlled water time and shared swash time, plus live-animation review sequences. Freezing only the water material while the terrain swash keeps moving invalidates contact comparisons.
- At a sandy coast, a cold coast, a forest river and the lake, isolate: all foam off; surf only; swash only; intersection foam only; spray off; reflections off; refraction off; sea displacement off. Preserve geometry and camera across controls.
- Add debug outputs for coverage, depth, shore distance, water kind, body ID, local flow, fall/plunge, refraction eligibility, reflection validity/age and material quality tier. Display these in development QA only.
- Record the ground preparation result, destination collision status, scenery queues, shader errors and active capture source. Investigate rejected cuts separately; do not lower readiness standards to obtain nicer screenshots.
- Update the architecture document's status and code map to reflect the implemented domain.

**Acceptance:** every comparison identifies the changed layer; identical canonical pose and source; no browser/GPU errors; 60 ready frames; no missing shoreline assets. Changes in lighting or animation phase are explicitly stated. A before/after image must not silently compare an unprepared scene with a prepared one.

### WQ-01 — Resolve the apparent shoreline thickness

**Problem to isolate:** the desert view shows a rounded, shaded band at the water/ground junction. A visual rim can arise from terrain shape, displaced water, the existing height offset, opacity/refraction, or the ground's wetness band. The screenshot alone does not identify which.

**Steps**

1. Sample CPU bed, still-water level and displaced surface on perpendicular shoreline transects. Overlay the rendered grid and ground/water ownership masks in a diagnostic fixture.
2. Disable swell, then refraction, then swash separately. Determine whether the rim is geometry, a color/roughness transition, or a compositing artifact.
3. Revisit the existing `shorelineFadeDepth` and tapered `heightOffset` together. Preserve a thin-water anti-z-fighting strategy; tune against both steep rock and very shallow sand rather than globally removing the offset.
4. Use one shared contact descriptor for water alpha, ground wetness, foam and refraction rejection. Preserve the complementary ground/water swash ownership already present.
5. Express the desired foam/contact width in surface meters. Height-only bands become very wide on a shallow beach; evaluate a bounded slope conversion or gradient-derived shore metric, with explicit flat-surface clamps.
6. If the visible contour remains limited by the 2 m terrain/water grid, prototype refinement only in nearby mixed wet/dry cells. Match shared edges and keep coarse distant geometry. Do not globally subdivide all resident water slots.
7. Any actual bed/shelf change belongs in deterministic generation, with CPU collision and worker outputs updated together and an appropriate generator/water-domain version change.
8. Reproduce the taiga view's serrated crest with wireframe, flat-color displacement and normal-only controls. Check depth-envelope derivatives, triangle orientation and shortest resolved wavelength. If geometric sampling is responsible, smooth/band-limit the displacement at coarse resolution or refine the bounded nearshore mesh; extra fragment-normal detail cannot fix a silhouette.

**Ownership:** `StylizedWaterMaterial.js`, `CoastSwashShading.js`, `WaterField.js`; only if geometry is proven responsible, `WaterTerrainModel.js`, `OceanBathymetry.js`, `BankProfile.js`.

**Acceptance:** at player height and 9 m overview, sand meets the water without a continuous raised slab, opaque overhang or exposed gap; the swash crosses the contact without double foam; below-surface rocks remain correctly occluded. The taiga crest must no longer show a repeated sawtooth silhouette through a complete wave cycle. Test beach slopes 1:4, 1:16 and 1:64, curved shorelines, terrain edits, chunk corners and a large origin rebase. Numeric domain agreement remains within the existing field-encoding tolerance.

### WQ-02 — Break inland repetition and give foam structure and lifespan

**Steps**

1. Attribute the broad white areas to surf, swash, whitecaps, intersection foam, or spray using WQ-00 controls. Do not assume all pale areas are foam; glint and crest transmission can contribute.
2. Isolate the forest river's crosshatched highlight and the taiga river's rows with inland foam off, detail normals off, sun glint off, and diagnostic UVs. `RiverSurfaceShading.js` samples one repeat-wrapped detail texture at `DETAIL_SCALE = 0.25` (a 4 m base tile), plus its micro and streak layers. That is a concrete repetition candidate, not proof that every bright mark has the same cause. The 320 m bounded origin prevents precision loss; it does not remove the smaller texture repeat.
3. For the responsible inland layers, separate low-frequency structure from fine detail. Evaluate world-stable macro modulation, independently phased/scaled detail samples and a nonidentical foam breakup field. Preserve downstream orientation; random rotation must not reverse visible flow. Start with the existing shared texture and bounded noise before adding new texture/compute passes. Apply the normal/glint correction to lakes as well as rivers.
4. Give each source a distinct role: narrow new breaker, irregular retreating trail, short contact accent, and sparse offshore whitecap. Avoid every source independently saturating the same area.
5. Retune the existing world-stable foam field thresholds and age decay to expose clear-water holes. Preserve coherent structures at a few meters, then add finer breakup within them. Keep the October 15 short-repeat and precision fixes.
6. Let generation depend on local wave/current energy; calm shallows should not foam simply because they fall inside a depth interval. Fade old foam by lifetime and travel distance.
7. For moving rivers, advect foam along the resolved local flow. Accumulate it only in justified slow pockets and downstream of disturbances. Start with analytic age/phase using existing fields; evaluate a small near-camera history field only if that cannot meet the visual target.
8. Shade foam as an aerated surface with softer highlights than clear water. Keep it readable in shadow and backlight without making it luminous at night.
9. Make spray intermittent at breaking zones, with depth-aware placement and short lifetimes. Retain the existing shallow-only emission rules and small particle sizes.

**Ownership:** `SeaSurfNodes.js`, `SeaSurfaceShading.js`, `RiverSurfaceShading.js`, `WaterSurfaceResponse.js`, `ambient/ParticleWaterDepth.js`, `config/water-visual.yaml`.

**Acceptance:** the forest river's crosshatched highlight and taiga river's repeated rows are no longer visible at the same poses. Check spatial repetition at the original tile offsets and multiple offsets in controlled normal/foam fixtures, together with chunk-seam and million-meter-origin controls. Clear-water gaps are visible throughout sheltered swash; opaque white bands do not cover an entire shallow bay; large whitecaps do not tile in obvious rows. Review 20 seconds of animation, slow pans and paused frames at near/mid distance. Use labeled foam masks to measure coverage before/after; agree a per-scene target after isolation, rather than using a universal “white pixel” threshold that also counts sky and reflections.

### WQ-03 — Resolve water profiles from explicit semantics

**Current limitation:** the CPU knows water kind/body identity, but the main water texture has no kind channel. `seaWaterMask` infers sea from height near sea level and negligible current. Most normal cases work; sea-level lakes and slow river mouths are ambiguity cases that need fixtures.

**Steps**

1. Design a small `WaterAppearanceResolver` that consumes canonical water kind/body ID plus available environmental inputs and returns optics, wave-energy, foam, shore substrate and ecology parameters.
2. Carry explicit identity to rendering. Use a per-slot uniform for homogeneous bodies where valid; assess a compact nearest-filtered classification field for mixed chunks. Never interpolate discrete IDs into fractional water types. Do not steal flow/fall/plunge channels or overload the terrain surface mask.
3. Keep optical properties continuous across biome boundaries and tributaries. Blend numeric sediment/absorption/roughness parameters using stable world coordinates or body/reach data; avoid changing the whole river color at a tile boundary.
4. Start with clear freshwater, organic freshwater, sediment-rich freshwater, sheltered marine and exposed marine profiles. These are visual presets, not replacement terrain categories or changes to canonical water kinds.
5. Separate exposure from water kind. A sheltered inlet can remain ocean while having little surf. Never reclassify an imported coastline merely because a camera sees a small patch of water.
6. Persist only authored/source profile inputs if customization is needed. Regenerate per-chunk presentation data. Use explicit schema/version handling for any added persisted fields; no legacy terrain-ID remapping.

**Acceptance:** a lake at sea level remains a lake visually; a low-current estuary transitions without a stripe; two neighboring biomes do not create a sharp color seam through one body. Save/reload, eviction/reload and origin shifts preserve profile resolution. Record added resident bytes and upload costs.

### WQ-04 — Make rivers read as flowing systems

**Steps**

1. Review the captured river cross-sections plus new upstream/downstream views. Separate straight reaches, bends, confluences, pools, drops and mouths; record width, gradient and current.
2. Preserve the downstream surface profile and existing river-to-lake behavior. Derive presentation variation from resolved reach data: smoother slow margins, faster central current, localized turbulence below drops and around rocks.
3. Existing flow vectors are primarily direction, including normalized extension into dry field vertices. Do not present their length as measured physical velocity. Introduce an explicit bounded visual speed/energy estimate if needed; document its units and separate it from gameplay drag/current.
4. Generate deterministic reach coordinates or equivalent local tangent information for directional detail, while preserving precision at Eldara's million-meter coordinates. Keep the current two-phase advection but verify that resets are invisible.
5. Add a bounded obstacle influence field from nearby eligible rocks/structures: upstream split, side acceleration and downstream wake. Build it from spatially local source data; no per-fragment search through arbitrary scene objects and no full-world simulation.
6. Place gravel bars and grouped bank stones by bank side, depth, slope and flow. Leave open reaches. An evenly spaced line of identical rocks would make the river look more procedural.
7. For falls, connect the upper lip, face, aerated impact patch and downstream recovery. Mist must emerge from the impact/face, not substitute for missing water geometry. Reuse `RiverFallSites` and existing whitewater channels.
8. Review why the sampled imported banks read as long, uniform channels. Start with bank materials and placement; if geometry is responsible, derive bounded width/asymmetry/erosion variation along a shared reach profile. Preserve the imported course, downstream continuity, tributary joins and collision agreement. Do not add independent per-chunk random bank displacement, and do not infer that every river on the map has this cross-section from these four views.

**Suggested module boundaries:** extend the domain/reach derivation separately from a `RiverVisualEnergy` resolver, an optional local obstacle-field producer, and small material nodes. Keep `RiverSurfaceShading.js` responsible for consuming fields, not querying world geography.

**Acceptance:** flow follows the channel through bends and joins; calm pool and rapid look distinct under identical lighting; foam never streams uphill or crosses dry banks. Confluences have no water step/wall. Review a walk along each bank, a crossing, a downstream flight, a rebase and an unload/revisit. Gameplay water samples stay unchanged for visual-only work.

### WQ-05 — Unify shallow optics, lighting and reflections

**Steps**

1. Calibrate depth cues with simple bed/rock swatches at known depths, then return to the real screenshots. Tune absorption length and scattering/tint separately so shallow water does not become a uniform blue coating.
2. Use sun angle, reflected environment, depth and surface roughness to organize bright areas. Compare the inland and sea Fresnel/glint responses under one controlled lighting rig; retain deliberate stylization while avoiding additive brightening that flattens waves.
3. Review actual reflection captures with validity, age, eligibility and capture origin displayed. Preserve the fixed scene-level pool and existing reprojection. Refine capture scheduling by visible importance within the existing work budget, not by updating every cube face every frame.
4. Confirm planar reflections are limited to suitable near-horizontal water. Sloped rivers/falls should use a graceful local-environment fallback. Check that blended fallback sky follows the current atmosphere.
5. Add/refine roughness-aware filtering if reflected trees sparkle or remain mirror-sharp on rough water. Current render targets disable generated mipmaps; a filtered reflection path needs an explicit implementation and cost review.
6. Preserve depth-aware refraction rejection at foreground objects, screen borders, and the near plane. Fade distortion in thin water and avoid a bright halo around every rock.
7. Review caustics separately. Water-surface caustics and projected caustics currently have zero configured intensity, while coastal bed caustics have their own nonzero setting. Do not claim the whole caustic system is disabled or turn every path up together.

**Ownership:** `StylizedWaterMaterial.js`, `SeaOpticsShading.js`, `RiverSurfaceShading.js`, `WaterReflectionController.js`, `PlanarReprojection.js`, `UnderwaterOpticsNodes.js`, `CoastSandShading.js`.

**Acceptance:** shore silhouettes reflect plausibly without detached duplicated objects; shallow stones have consistent refraction and wet contact; rough water reflects broader shapes than still water; night foam does not glow. Test noon, low sun, overcast and night at fixed exposure, plus fast camera turns and a rebase. No full-frame reflection/refraction cost appears on a wholly dry route.

### WQ-06 — Integrate banks, seabeds and biome character

**Steps**

1. Resolve a shoreline substrate from terrain/biome context, slope and water kind. Use warm sand selectively; add cool gravel/stone, organic mud and mixed silt responses using the existing material/asset pipeline.
2. Suppress dry cracks under sustained wetness and below the waterline. Blend saturated ground color, roughness and normal detail together. Keep the base dry biome material visible beyond the wet band.
3. Let snow coverage respond to the existing environmental snow rules and local wet contact. Do not turn every cold water body into ice; solid ice would require a separately scoped semantic/gameplay feature.
4. Create clustered shore detail rules: reeds rooted in appropriate shallow beds, moss on damp sheltered stones, sparse driftwood and pebbles, exposed roots where a bank supports them. Reuse `AquaticPlacement`, bank-rock placement and local water sampling.
5. Use low-frequency bed structure to explain color/depth changes, then small detail nearby. Cold or muddy shelves should not inherit the full warm reef treatment.
6. Place details through manifests/instancing and existing LOD queues. Add no per-stone scene objects for dense banks. Rebuild only locally affected placements after edits.

**Acceptance:** the six coast biome views remain distinguishable at the shore itself; vegetation roots contact the bed, floating vegetation stays on the surface, and dry plants do not populate deep/fast water. Snow, mud, sand and rock have credible wet transitions at player height. Revisit captures preserve placement identity and density.

### WQ-07 — Improve sea scale and exposure response

**Steps**

1. Keep the current five-component swell as the baseline. Tune long/medium/fine contributions independently at player height and overview; retain depth-limited amplitude and matching CPU surface queries.
2. Introduce a bounded exposure/shelter estimate where geography permits. Evaluate coarse derived coastal data or a small cached directional query; avoid unbounded shoreline ray marching per frame. Wind/exposure should modify wave energy smoothly over time.
3. Make shallow-wave transformation follow depth and shore direction without producing a synchronized stripe at every equal-depth contour. Test concave bays, opposing shores and narrow inlets.
4. Separate breaking intensity from crest brightness. Maintain a coherent dominant wave direction and occasional crossing detail, with distance filtering that removes subpixel shimmer.
5. Check the water horizon and residency boundary from both above and just above the surface. If distant water coverage is insufficient, assess a low-cost far-water representation with an explicit near/far handoff and no geography changes.
6. Consider a spectral/FFT ocean only as a later prototype if the existing swell cannot produce the agreed exposed-sea target. Require a side-by-side visual gain, CPU/GPU surface agreement strategy, quality fallback and full memory/timing evidence before adoption.

**Acceptance:** calm coast, exposed sea and storm have different energy while remaining recognizable as one water system; shelter suppresses open-sea surf; horizon and LOD transitions remain stable during motion. No visible phase jump on wind changes or origin rebases.

### WQ-08 — Add interaction and sensory continuity

Static screenshots do not assess these items. They are follow-up look-and-feel targets to verify in motion and with audio.

- Reuse `PlayerWaterEvents` for entry, exit, submerge and resurfacing. Add spatially bounded ripple/splash impulses where events actually intersect the canonical surface; use continuous movement sampling for a swimming wake, rather than inventing repeated entry events.
- Give slow wading, a fast entry and swimming distinct amplitudes and durations. Use a pooled event buffer and instanced effects; clip ripples to the correct body and shore. Event capacity, lifetime and offscreen policy must be explicit.
- Preserve existing underwater hysteresis. Review the crossing with waves, the near-plane edge, refraction, fog/extinction, Snell window and recovery above water. A cosmetic film must not obscure controls or persist too long.
- Audit the existing geography-aware surf/stream ambience and water footsteps. Add missing transition/bubble/splash responses only where listening confirms a gap. Crossfade by local water state and distance; do not restart a loop on chunk boundaries.
- Synchronize sound intensity and visible disturbance loosely by event/energy, without requiring audio to follow every shader wave crest.

**Acceptance:** one entry produces one appropriate event; a stationary swimmer does not emit a full-speed wake; exiting onto dry land stops new impulses; effects survive a rebase without jumping to the origin. Audio transitions do not click or restart at borders. Test dry → wade → swim → dive → surface → dry.

### WQ-09 — Verify cost, residency and quality fallback at every milestone

**Steps**

1. Before implementation, name the reference device, browser/backend, viewport, quality tier and frozen baseline. Record the existing water-route timings and resident resource counts. Keep capture readiness time separate from steady-state frame time.
2. After each milestone, replay the affected accepted poses and record shader/browser errors, preparation status and source hashes. Add a 20-second stationary sequence and a moving camera pass wherever animation, reflections or geometry changed.
3. Run sequential baseline/candidate performance pairs under the shared QA lock. Include a dry route, shoreline approach, river crossing and lake visit. Use the full movement/density matrix for generation, streaming or residency changes, following the repository guide rather than replacing its gates.
4. Repeat coast → river → lake → dry visits, unload/revisit and large-coordinate rebases. Record field textures, reflection targets, material variants and interaction-effect counts before and after. Explain legitimate warmup growth; reject continued resource growth.
5. Compare representative high, medium and low scenes. Keep body identity, shoreline contact and useful depth cues at every tier; reduce reflection refresh, surface detail and particles through explicit bounded options. Test supported backends and document any existing fixture/runtime limitation precisely.
6. Attach an acceptance record to each implementation change: evidence links, measured cost delta, domain/field checks, relevant movement checks, tier differences and remaining defects. Keep feature opt-outs during evaluation and remove temporary diagnostic cost from production defaults.

**Ownership:** existing visual QA and deterministic performance harnesses, material quality/variant bindings, field-slot lifetime and reflection/effect pools. No new global benchmark framework is needed.

**Acceptance:** all applicable repository gates below pass; no new dry-route water pass, growing resource count, missing collision/scenery or unresolved shader error. The final comparison identifies which visual targets improved and which were deferred. A prettier still cannot waive a streaming regression.

## 6. Architecture and performance guardrails

Follow [player movement performance QA](../perf-qa.md) before implementation. Visual inspection is not a performance result.

- Canonical water/terrain data own geography and gameplay. Render-only detail never changes where water exists, the collision bed or swimming depth.
- Use small focused modules: profile resolution, derived fields, shader layers and effect pools. Avoid making `StylizedWaterMaterial.js` an even larger world-query/configuration/geometry controller. Prefer composition with the existing shared material binding system.
- Keep canonical coordinates in CPU double precision; use wrapped/chunk-local pattern coordinates on the GPU. Preserve seam, large-coordinate and floating-origin tests.
- Preserve the dry-water culling and near-water refraction variant strategy. Viewport color/depth nodes can trigger whole-frame copies; hiding a mesh is not equivalent to compiling the branch out.
- Existing water fields cost `(chunkSize + 1)^2 × 12` bytes per slot for RGBA16F plus RGBA8, before staging/other resources. Specify every added field's format, halo, resident count, upload frequency and ownership. A mixed-body classification field must earn its additional sampler/bandwidth.
- Keep reflection targets, obstacle fields, foam histories and impulse buffers fixed-size or bounded by residency. Do not allocate one render target per water chunk or run a global simulation across Eldara.
- Terrain/bank generation and placement work should remain worker/locality friendly. No full-asset or whole-world rebuild for a local shore edit.
- High/ultra may add detail, but medium must retain correct water identity, useful depth cues and shoreline contact. Low should degrade predictably without changing geography. WebGL texture/sampler limits require explicit coverage; the previous full terrain-bake graph already documented a WebGL limit.

### Proposed budgets versus existing acceptance gates

| Measure | Requirement |
| --- | --- |
| Existing movement matrix | Preserve its p95 ≤ 33.3 ms, hitch rate ≤ 2%, collision and density gates, and full scenery recovery within 2 seconds. These are existing acceptance floors, not a claim of 60 FPS. |
| Premium visual target | Aim for 60 FPS at 1920 × 1080 on a named desktop reference device, with scene/frame-time breakdown. The current screenshots are 1600 × 900 and provide no proof of this target. |
| Incremental cost | Before each feature, declare a provisional GPU/CPU budget from the measured baseline. Investigate a repeatable >5% p95 regression or >1 ms added GPU p95, even if the broad matrix still passes. These are proposed review triggers, not measured results. |
| Dry-world cost | No new water capture/viewport pass on a dry route; no sustained water work proportional to total map size. |
| Resource lifetime | No upward trend in water textures, materials, field allocations or effect count across repeated coast/river/lake visits and origin rebases. |

## 7. Verification matrix

Do not multiply every expensive test by every possible setting. Use focused fixtures for behavior and a smaller real-world visual/movement matrix.

| Layer | Required evidence |
| --- | --- |
| Domain/field contracts | Existing water-domain, field-continuity, floating-origin, flow, river-reach, lake, refraction and foam tests; add tests for newly introduced behavior rather than string checks mirroring code. |
| New ambiguity fixtures | Sea-level lake; low-current river mouth; mixed ocean/river chunk; tributary join; local bed edit; long thin shore crossing a chunk corner. |
| Isolated rendering | Water/ground handoff, layer controls, known-depth swatches, shadowed foam, reflection validity and fallback. Use production nodes/materials. |
| Real-world stills | Replay all accepted poses from this audit, including imported million-meter coordinates. Retain failed captures separately. Add two player-height river views and a lake low-angle view. |
| Motion | 20-second stationary water sequences; slow pan; walk along bank; sprint toward/away from water; swim/dive/surface; origin rebase; leave/revisit. Inspect foam resets, shimmer, reflection jumps and LOD changes. |
| Lighting/weather | Four representative views under noon, low sun, overcast and night; one exposed-sea storm transition and one rain-on-lake sequence. Keep controls fixed between implementations. |
| Backends/tiers | High WebGPU world captures; medium and low representative water scenes; hardware WebGL production-material fixtures and an explicitly documented terrain-bake limitation if still present. |
| Performance | Sequential paired frozen-baseline/candidate runs under the shared browser QA lock; close unrelated rendering tabs for authoritative timing; repeat comparable pairs to distinguish variance. Run the deterministic water route and full movement/density matrix for streaming changes. |

Useful existing entry points (prefix shell commands with `rtk` in this checkout):

```powershell
rtk npm run qa:water:acceptance -- --headed
rtk npm run qa:environment:parity
rtk npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 12 --settle
rtk npm run qa:perf:matrix -- --headed
rtk npm run verify
```

Confirm each runner's options and output paths at implementation time. Never quote timings from a failed/fallback-adapter run. For a local material-only change, begin with the affected contracts and production shader fixture; expand to the movement matrix when it touches streaming/residency or changes whole-scene render work.

## 8. Suggested delivery sequence

1. **Diagnosis milestone:** finish WQ-00 controls at a sandy coast, a cold coast, a river and a lake. Resolve capture readiness failures. Agree four hero comparison views and retain the randomized audit as the broader regression set.
2. **Contact and repetition milestone:** implement WQ-01 and WQ-02 in separate small changes. First remove the forest river's crosshatched highlight, the wetland coast's stepped bands and the taiga crest's serration; then tune foam density/lifetime. Success is thinner shoreline contact and more readable water without losing the existing ocean anti-repetition fixes.
3. **Identity milestone:** introduce WQ-03 with explicit metadata/field budgets; implement WQ-06's substrate responses and WQ-05's calibrated optics against it. Review all sampled biomes before tuning one showcase scene further.
4. **Motion milestone:** implement WQ-04's local current variation, then WQ-07's exposure response. Introduce simulation history or spectral waves only if cheaper changes fail the agreed target.
5. **Experience milestone:** WQ-08 interaction/audio and underwater review, followed by cross-tier/backend checks and WQ-09 performance/resource acceptance.

Completion means the agreed visual targets pass in the real world and in motion, with reproducible evidence and the performance gates intact. A more attractive still or a passing unit suite alone is not completion.

## 9. Primary references

These references guide implementation choices; they are not evidence about Drusniel's current defects.

- [Naughty Dog: Rendering Rapids in Uncharted 4, SIGGRAPH 2016](https://www.advances.realtimerendering.com/s2016/index.html): the published abstract describes separating geometric and visual water motion and using inexpensive procedural components informed by reference simulation. Apply that separation to local river behavior; a full fluid solver is not a prerequisite for this plan.
- [Valve: Water Flow in Portal 2](https://cdn.fastly.steamstatic.com/apps/valve/2010/siggraph2010_vlachos_waterflow.pdf): flow-map reference for current-following surface detail. The engine already has two-phase flow advection; use this reference to assess directional continuity rather than proposing the same feature again.
- [Mark Finch / Cyan Worlds: Effective Water Simulation from Physical Models, GPU Gems](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models): separates geometry-scale waves from finer normal detail and connects wave parameters to physical meaning. Use that scale hierarchy before escalating to a different ocean simulation.

All specific priorities, budgets, module proposals and acceptance targets above are recommendations for this codebase, not claims copied from those references.
