# Workshop improvement plan — 2026-10-16

Status: proposed implementation sequence; analysis only.

The next pass should make the existing designs look consistently constructed and
feel easier to edit. The strongest gains are fixing curved window assemblies and
texture coordinates, then improving roof scale, vegetation and ground contact.
Keep the current warm, stylized medieval direction.

This plan builds on the [geometry framework](../architecture/workshop-geometry-framework.md),
its [implementation sequence](workshop-geometry-framework-plan-2026-08-19.md),
and the [completed quality expansion](workshop-quality-expansion-2026-10-08.md).
Roof intersections, bevels, weathering, architectural features, direct handles,
local product caching and distance tiers already exist. The work below improves
their quality and coverage; it does not restart those systems.

## Evidence and limits

Reviewed the current comparison gallery and twelve representative overview/detail
images, relevant builders, and the existing hardware QA report. Ran small CPU
geometry probes for window-bar placement and UV stability. No new browser,
performance or full test run was performed for this analysis.

Review began at `617d1df7`. Pavilion paving and benches were being edited in the
shared checkout and landed during review as `124c8ed0`. Treat that interior work
as implemented, with the generalization checks below still worth doing.

The [audit record](../qa/workshop-improvement-audit-2026-10-16.json) retains the
numeric findings, source/image hashes, and historical QA measurements. Gallery
files under `tmp/` are mutable; their hashes identify the inspected versions.

| Finding | Evidence | Priority |
| --- | --- | --- |
| Window crossbars disappear into curved glass, leaving short visible ends | The timber facade, weathering and jetty close-ups show the interruption. `ShapeOpeningBuilder` emits a straight horizontal beam between curved endpoints. A midpoint probe found 24 window instances with the bar center behind the glass by more than its 27.5 mm half-thickness; the range was approximately 30–171 mm. This is a geometric diagnostic, not a rendered visibility count. | P0 |
| Texture coordinates need a consistent local frame | Translating a generic beam by 3.25 m changes its UVs. `ShapeMesh.triangle` defaults to `[x, z + y]`; `beam` discards the box's UV attribute. The cottage wall builder also produces 168 degenerate UV triangles among 7,054 trim triangles. These defects warrant correction; they do not explain every visible stripe by themselves. | P0 |
| Roofing looks overly regular and its scale varies with roof proportions | Slate and valley close-ups show long repeated bands and a second, smaller texture pattern. Tile rows currently depend on roof rise rather than distance along the slope. Eaves are separate short box beams, producing conspicuous joints on curves. | P1 |
| Ivy, window-box planting and entrance paving repeat too predictably | Weathering and facade views show narrow vertical ivy runs, similarly spaced flowers and rectangular paving patches. Ivy roots use 0.8 m stations and rows use 0.27 m steps; paving uses a fixed five-row layout at detailed settings. Stable identity is already present and must survive changes. | P1 |
| The inspector asks users to manage too many controls at once | The gallery shows a long scrolling form. Chimney and window boxes share one checkbox; numeric properties expose sliders and read-only outputs. Handles already work, so improve context and precision around that existing path. | P1 |
| Editing cost needs measurement beyond cache timing | The saved report records five opening edits at 44.3–51.8 ms CPU planning/build time and an 80.1 ms settled rebuild, with the neighboring turret reused. These are not FPS or pointer-to-display measurements. | P1 |

Relevant images: [facade](../../tmp/workshop-shapes-qa/timber-facade-detail.png),
[window and ground detail](../../tmp/workshop-shapes-qa/weathering-ground-detail.png),
[stone and balcony](../../tmp/workshop-shapes-qa/balcony-tower-detail.png),
[roof valley](../../tmp/workshop-shapes-qa/roof-valley-detail.png),
[bay and porch](../../tmp/workshop-shapes-qa/bay-porch-detail.png).

## 0. Establish a reproducible review baseline

Extend the existing capture scripts with a manifest containing commit, dirty
source hashes, normalized recipe, seed, detail tier, camera position/target,
lighting and actual renderer adapter. Capture from a stable source snapshot and
flag a run if relevant source hashes change while it is running.

Keep clean model captures alongside separate UI captures. Use all sixteen presets
at near and coarse detail, four fixed angles, and close-ups of the affected parts.
Add a neutral/grazing-light check for surface mapping and small joins. Compare
against the immediately preceding accepted pass; keep older galleries as history.

**Done when:** every before/after pair has matching recipe, camera, lighting and
detail settings, and its manifest identifies the source that produced it. The
gallery clearly separates interaction checks, numerical geometry checks and
human visual review.

## 1. Correct window assemblies and validate architectural contacts

Start with `ShapeOpeningBuilder.js` and `ShapeWallSurface.js`.

- Make the horizontal bar follow the same surface as the existing curved glass,
  with a consistent clearance. Use the actual opening profile to bound the bar.
  A future planar-window variant should put both glass and frame in one local
  plane; mixing a straight bar with curved glass is the current defect.
- Exercise rounded, oval, tapered and rotated hosts, including windows near a
  corner and the footprint seam. Include the bay and projecting storey children.
- Preserve the shutter corner checks. When a selected open pose cannot fit,
  expose that placement constraint in the inspector and keep the valid ajar or
  closed choices discoverable.
- Review bay roof contacts, porch-to-wall connections, eave corners and railing
  ends at close range. Record any remaining intersections as reproducible
  fixtures before changing the corresponding solver.

**Done when:** crossbars are continuous and visible across eligible windows at
near/coarse detail, stay within the opening, and remain attached through resize,
rotation, taper, undo/redo and bake/load. Retain unaffected product buffers.

## 2. Fix texture mapping before retuning the material palette

Start with `ShapeMesh.js`, `ShapeWallSurface.js`, `ShapeWallBevel.js`,
`ShapeSurfaceMaterials.js` and callers that currently omit UVs.

- Give beams longitudinal UVs in physical units, plus appropriate end-grain
  coordinates. Reuse the local mapping approach already present on profiled
  rails and shutter panels.
- Give caps, reveals, bevels, soffits and boxes nondegenerate face coordinates.
  Keep stone/plaster scale consistent across flat faces, curved walls and returns.
- Make translation and rotation preserve the attached texture; define whether
  resizing adds material coverage or stretches it for each surface family.
- After mapping is correct, reduce overly strong wood banding and reconcile the
  roof albedo's small tile pattern with the actual slate geometry. Tune stone,
  plaster, wood and metal roughness under the same neutral light.
- Preserve existing material overrides, region selection, texture ownership and
  bounded CPU pixel caching. Avoid a separate material or texture per piece.

**Done when:** translated/rotated fixtures retain the same local material pattern;
mapped faces have valid UV area; grain follows timber members; cap and reveal
textures have plausible scale. Visual checks must include non-integer movement,
curved surfaces, near/coarse detail and imported material overrides.

## 3. Improve roof construction and controlled variation

Start with `ShapeRoofTiles.js`, `ShapeRoofSurface.js`, `ShapeRoofCraft.js` and the
existing profile/junction builders.

- Lay out tile courses by distance along the roof slope and local perimeter,
  preserving a consistent physical tile size when pitch or footprint changes.
- Use bounded, stable variation in tile width, exposed edge, overlap and tint.
  Keep consistent courses and avoid cracks or tiny clipped fragments.
- Replace visible box-by-box eave joints with a continuous swept fascia profile
  and deliberate corners/end caps. Reuse the profile framework where suitable.
- Review hips, ridge ends, valleys and chimney flashing as connected details.
  Maintain the existing smooth top normals, physical lips and occlusion masks.
- Anchor layout keys to stable local surface cells so a nearby feature edit does
  not reroll the entire roof.

**Done when:** wide/shallow and narrow/steep versions have comparable slate scale;
gable, hip and bell roofs retain a clean silhouette; joins have no visible gaps
or overlapping caps; coarse detail retains the silhouette without near tile cost.

## 4. Make weathering, planting and ground contact more contextual

Start with `ShapeIvyLayout.js`, `ShapeIvyBuilder.js`, `ShapeWindowGarden.js`,
`ShapeGrounding.js` and the existing semantic exclusion masks.

- Distribute ivy as several uneven connected growth patches with quieter areas
  between them. Vary branch spread, leaf scale and clustering while retaining
  stable root/branch/leaf identity.
- Give window boxes less uniform flower spacing and clearer plant groupings.
  Keep doors, windows, handles, walkways and railing clearance readable.
- Build entrance paving with bedding beneath its joints, staggered courses and
  controlled boundary wear. Join it to an attached path or porch where semantics
  establish that connection; avoid overlapping rectangular patches.
- Use ground contact, shelter and authored age to place dampness and wear.
  Avoid uniform dirt or noise across the entire building.
- Generalize the new pavilion interior carefully: an open arch should not
  permanently imply a compulsory bench. Resolve optional interior treatments
  with provenance and suppression through the existing framework. Verify
  concave rooms, floor ownership and entrance clearance. The current bedding
  triangle fan deserves a concave-footprint fixture before broader use.

**Done when:** a density/age edit preserves unaffected detail keys; vegetation
respects semantic masks; paving has no exposed green grid through its bedding;
interior furnishings remain optional and cannot obstruct entrances. Concave-room
behavior is validated rather than assumed from the oval pavilion.

## 5. Make existing editing capabilities easier to discover and control

Build on `WorkshopShapeFields`, `WorkshopShapeEditor`, the semantic session and
direct handles; follow the [interaction roadmap](../workshop-aaa-sota-implementation-plan.md)
incrementally.

- Show contextual property groups for the selected building, opening, roof,
  feature or generated detail. Keep an advanced inspector available.
- Add editable numeric values with units alongside sliders, precise keyboard
  increments, visible focus and labels for the active handle.
- Separate chimney, window-box planting and future interior treatment choices.
  Preserve existing defaults and save/load behavior.
- Make inherited, authored and automatically resolved choices understandable.
  Surface existing pin/suppress/reset actions where the selected detail supports
  them, without presenting mesh or renderer terminology to the user.
- Route new controls through semantic commands. Keep one gesture/one undo entry,
  Escape cancellation, pointer capture and keyboard access.

**Done when:** a user can place a window, enter its exact dimensions, move a
balcony, suppress a generated detail and undo each action without searching a
long unrelated control list. Browser tests cover those tasks using real input.

## 6. Measure responsiveness and spend geometry where it is visible

Instrumentation begins in step 0; optimize after the structural changes have
stable fixtures. Extend the existing direct-edit QA and product-cache counters.

- Record planning, generation, upload/submission, long tasks and frame intervals
  during real drags. Name any pointer-to-updated-frame proxy precisely; do not
  label a CPU timer or a pair of animation frames as physical display latency.
- Profile representative cottage, chapel, tower and joined-building edits.
  The saved chapel has 252,276 source vertices, the tower 208,065, and the joined
  cottage/turret 28 editable preview batches. These are baseline costs, not proof
  of a frame-rate problem, and are not baked runtime draw-call counts.
- Profile `ShapeMesh.beam` allocations, repeated surface sampling and changed
  domain builds. Optimize the dominant cost first; direct buffer emission and
  finer local layout reuse are candidates, not presumed wins.
- Keep lightweight drag feedback and upgrade changed products after settling.
  Do not add microgeometry to coarse tiers or recreate unchanged neighbors.
- Compare repeated runs on the same hardware. Set numerical responsiveness and
  memory budgets from the measured baseline, target device and observed variance.

**Done when:** the selected bottleneck improves outside run-to-run noise, local
reuse and deterministic replay still pass, and the visual changes have accounted
for geometry, memory and draw cost. Existing runtime LOD envelope tests pass.
If work reaches terrain, world rendering or residency, run the deterministic
[movement performance QA](../perf-qa.md) before and after.

## Implementation order and boundaries

Ship reviewable increments: baseline → window fix → UV fix → roof detail →
vegetation/ground/interior rules → contextual controls and measured optimizations.
Use focused regressions for each defect, the existing shape/browser suites for
integration, and full lint/build/tests at the combined acceptance point.

The first implementation slice should be the curved window crossbar fix with
matching close-up evidence. The UV contract is the next shared improvement and
should land before additional material polishing.

Leave new building families, decorative object libraries and a full editor
rewrite for later. World navigation is a separate integration milestone: arches,
stairs and balconies must ultimately use their room/portal/floor semantics for
player access, but a convincing workshop capture does not establish that runtime
behavior. Validate it explicitly when that milestone is scheduled.
