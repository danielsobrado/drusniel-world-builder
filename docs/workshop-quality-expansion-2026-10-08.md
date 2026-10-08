# Workshop quality expansion

Date: 2026-10-08. Scope: all six requested workshop improvements.

The workshop now has fourteen starting designs, including roof dormers, curved
bays with timber porches, projecting upper storeys and buttressed stone chapels.
Features remain authored semantic modifiers. Their walls, roofs, openings,
supports, contacts and gameplay plans are deterministic derived products built
through the shared volume and surface builders.

The review gallery is `tmp/workshop-shapes-qa/comparison.html`. Its before toggle
uses the preserved captures in `tmp/workshop-expansion-before`. The gallery also
includes close-ups of each new feature, aging, connected timber and crossed roof
valleys, plus three coarse-detail comparisons.

## Requirement audit

| Requested improvement | Result and evidence |
| --- | --- |
| Roof quality | Smooth surface normals and local roof UVs; physical tile lips retain flat normals. Continuous triangle clipping preserves exposed roof portions at walls and roof joins. Derived valleys and tapered-wall flashing use stable keys, suppression and a matte lead finish. Normal, clipping, deterministic ownership and junction regressions pass; crossed-gable and turret captures show the contacts. |
| Controlled weathering | Stable chipped masonry edges, continuously bowed timber, worn door thresholds, irregular plaster wear and foundation dampness. The age control preserves roof and ivy products. Cell variation stays unchanged through host height edits. The aged cottage close-up shows the result, with shared opening and neighbor exclusions. |
| Architectural shapes | All five features have authoring controls, transactional edits and stable IDs. Dormers orient their gables toward the host facade; bays join the host shell; porches adapt to doors; projecting floors expand curved/custom footprints, replace the roof and rehost chimneys; buttresses avoid openings. Feature envelopes participate in spatial neighbor contacts. Tests cover rotated hosts, finite geometry, persistence, custom curves and distant cache reuse. Browser checks resize, remove, undo and bake every feature. |
| Grounding and vegetation | Foundation skirts, contextual moss and entrance paving share foundation, opening, feature and traversal masks. Stage grass and flowers clear these masks. Ivy uses softened leaf outlines; tree crowns use smooth deformed geometry. Fixed ground and connected-stair captures verify placement. Vegetation remains batched and deterministic. |
| Connected style | Floors, trim, supports and railings inherit from a connected semantic host. Explicit property and material-area overrides take priority; host floor overrides reach attached walkways. Cycle ownership is deterministic. Timber pavilion and ramp captures, material tests and browser overrides verify the result. |
| Direct editing | Door/window handles follow curved tapered walls. Footprint points and quadratic controls preserve curve lineage. Chimneys and planters support individual movement, suppression and reset through host-local semantic overrides. Real pointer checks cover commit, undo/redo and cancellation; bake and renderer recovery preserve the composition. |

## Locality and ownership

Walls and facade layers now clip continuously against neighboring wall envelopes.
This prevents a partial vertical contact, such as a projecting floor, from
discarding the entire lower wall band. Porch floor geometry also clips against
the host rather than overlapping its floor.

Feature contacts use a spatial index over resolved owner and child bounds. Thin
neighbor records propagate replacement-roof ownership without circular plans.
Only nearby products receive new contact dependencies. Neighbor openings are
excluded from wall-envelope keys because an envelope cut does not consume them.

An interactive drag builds changed products at detail 1 while retaining existing
settled products. Releasing the pointer upgrades only the changed domains to the
requested detail. Weathering edits reuse roof/ivy buffers; chimney moves reuse
wall/facade buffers; isolated edits retain other buildings' GPU products.

Repeated detail stays inside material buffers. There are no scene objects per
brick, tile, leaf or feature detail. Preview domains remain separate for editing;
baking merges products by material and preset. Single-building fixtures stay
within eight material batches, including the lead flashing finish.

## Validation

- `npm test`: **3,407 passed** in the shared workspace.
- `npm run qa:workshop:shapes`: **92 passed**, including runtime distance-tier
  acceptance for all four new architectural presets.
- Hardware shape browser QA: **33 interaction checks passed**, fourteen preset
  captures and thirteen detail captures, with no page or console errors. Both
  adapter and actual renderer report NVIDIA Lovelace WebGPU, without fallback.
- Lint, production build and `git diff --check` pass. The production build keeps
  the existing large-chunk advisory.
- Existing workshop browser compatibility: **27 assertions passed** through
  `node scripts/run-workshop-qa.mjs --runs 1 --headed`, including planar and radial
  editing, opening assemblies, imported materials, skeleton roofs and baking.
  Its result is recorded in `tmp/workshop-qa/report.json`.

### Fixed-fixture geometry

Vertex counts are source geometry at detail 2. Buffer bytes are position, normal,
color, UV and any index attributes for editable preview geometry; they exclude
materials, textures and the stage.

| Fixture | Preview batches | Source vertices | Geometry bytes | Detail 1 vertices |
| --- | ---: | ---: | ---: | ---: |
| Dormer cottage | 18 | 156,420 | 6,882,480 | 88,401 |
| Bay and porch cottage | 18 | 162,315 | 7,141,860 | — |
| Projecting townhouse | 12 | 139,422 | 6,134,568 | 74,634 |
| Buttressed chapel | 13 | 239,778 | 10,550,232 | 49,986 |
| Aged cottage | 13 | 100,929 | 4,440,876 | — |
| Connected timber pavilion | 13 | 89,994 | 3,959,736 | — |
| Crossed gable roofs | 23 | 173,046 | 7,614,024 | — |

The new feature silhouettes remain at coarse detail while tile relief, masonry
bevels and small wear are reduced. Close-ups were reviewed at both tiers.

### Edit measurements

On the hardware browser, five warmed opening edits in the cottage/turret fixture
took **41.5–47.0 ms** for planning and local geometry regeneration. Planning cost
was **7.1–8.2 ms**, and generation cost was **34.3–39.5 ms**. Each edit rebuilt four
cottage domains and preserved the turret's cached products. The final detail-2
upgrade took **74.3 ms** and likewise preserved the turret.

These are CPU planning/cache-build timings, not pointer-to-presentation latency
or GPU frame timings. They establish local reuse and the measured editing cost;
they do not establish 60 FPS during regeneration.

## Practical limits

This pass changes workshop products and stage presentation. It does not change
terrain generation, chunk streaming or world residency; the player movement
performance matrix was therefore not rerun for this pass. Unrelated concurrent
world and settlement changes are outside this report.

The existing conservative player collision envelope and incomplete connection
of room/portal/floor plans to player navigation remain. The earlier GTAO relative
performance-gate limitation remains documented in the procedural shapes report.
The new features publish semantic gameplay plans, including open porch posts and
buttress contacts; this does not claim a new world navigation implementation.

The captures prove the reviewed designs and viewpoints. They support the visual
improvement without certifying every possible user-authored curve or combination
as release-ready AAA content.
