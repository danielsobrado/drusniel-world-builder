# Procedural workshop shapes

The workshop now exposes **Build → Freeform shapes**. Choose a starting design,
add buildings, curved walls, or paths, and edit the selected shape with its
gold handles or the controls. Ctrl+Z/Shift+Ctrl+Z undo and redo shape edits;
Escape cancels a handle drag. The material tool assigns existing area presets.
**Bake game object** saves the authored composition into Objects.

The [visual polish follow-up](workshop-visual-polish-2026-10-08.md) adds bevels,
overlapping slate, roof craft, door hardware, planted window boxes and refined
workshop lighting. It records the updated validation and geometry cost.

## Included designs and controls

- Rounded cottage; bell-roof turret; oval garden pavilion; joined cottage and
  turret; raised cottage with a terrace and stairs; arched garden bridge;
  curved courtyard walls; timber pavilion with a ramp; half-timber cottage;
  garden wall with a path gate.
- Rounded/oval footprints, height, thickness, taper, placement, and rotation.
- Gable, hip, bell, cone, spire, and flat roof profiles, with height, overhang,
  sweep, and ridge sag controls.
- Arched doors, windows, and open arches positioned along curved walls.
- Square lintels, editable openings on garden walls, half-timber framing,
  gable posts, and window shutters. Facade choices have their own preview domain.
- Plaster, masonry, and planks; foundation courses; window mullions; roof tiles
  and verge trim; opening-aware branching ivy with varied, folded, lobed leaves.
  Curved walls receive masonry and opening trim on both faces.
- Automatic slope selection for walkways, ramps, and stairs; bridges, railings,
  and suppressible supports. Raised buildings receive deterministic piers.
- A crossing path creates a resolved gate in a garden wall: a full-height gap
  in a low wall or an arch in a taller wall. Select the wall to hide a gate,
  restore hidden gates, disable automatic gates, or **Keep as opening**. Kept
  openings retain promotion provenance and survive moving the path.

## Implementation boundary

This follows the [geometry framework](architecture/workshop-geometry-framework.md)
and extends the capabilities described in the
[opportunity review](research/workshop-procedural-shape-opportunities-2026-10-08.md).
It is a working authoring and geometry slice, not completion of every phase in
the [implementation plan](plans/workshop-geometry-framework-plan-2026-08-19.md).

`shapes/ShapeRegistry.js` registers renderer-free volume, wall, and traversal
normalizers/planners. Presets author these capabilities without adding core
archetypes. The form's Freeform selection projects into the existing composition
recipe rather than introducing a new runtime archetype.

`WorkshopShapeSession` uses the existing semantic document, command bus, preview
transaction, and history. Pointer previews remain outside committed state; one
gesture commits one history entry. Canonical records persist parameters,
opening intent, and suppression keys. Meshes and repeated decorative pieces
remain derived. Explicit semantic ownership reaches the component pipeline
through `ShapeComponents`; geometry bounds serve presentation only.

Curve sampling, wall cuts, masonry/planks, and ivy share wall surface coordinates.
Roof tiles and roof height queries share profile surfaces. Collision slabs,
height-dependent envelopes, floors, room boundaries, portals, and landing sockets
are published from the same plans. Custom profile footprints are validated as
simple, convex, and enclosing their local origin; concave profile roofs are
rejected explicitly.

Neighbor queries use the existing spatial index. Contact records and supports
carry deterministic derivation keys and source provenance. Wall/roof masks and
supports are resolved products; they do not create authored scene entities.

`WorkshopShapeCache` stages products by shape and consumer domain: walls/floors,
roof, facade, supports, ivy, and traversal. A roof-height edit preserves wall and ivy
buffers. An edit to an isolated wall preserves other shapes and their resources.
Failed builds leave the prior cache intact and dispose staged resources. Scene
owners detach retired meshes before disposal. Repeated pieces accumulate into
shared material buffers, with stable entity/domain/cell variation keys.

`ShapePathGateReaction` uses spatial candidates and the shared curve intersection
kernel. It detects crossings, skips tangential/elevated/edge cases, gives explicit
openings priority, and resolves overlap/suppression deterministically in one pass.
Output is capped at 64 total openings per host. The resolved opening list feeds
wall cuts, masonry, ivy exclusions, collision gaps and portals. Canonical authored
openings are untouched until the user chooses **Keep as opening**.

`ShapeIvyLayout` gives each root/branch/leaf a stable key. Wall-height edits clip
the same growth pattern; they do not reroll existing leaves. Leaf fans and stem
ribbons share the foliage buffer. `ShapeFacadeBuilder` clips framing against
openings, neighbors and the roof height field; shutters follow window host frames.
Changing facade/shutters reuses the wall, roof and ivy products.
The attached-structure test also verifies that these edits preserve neighboring
turret products.

## Validation

- Full Node suite after review: **3,342 passed**.
- Shape and detail suites: **51 passed**, including persistence, gesture history,
  spatial indexing, exclusions, support suppression, domain reuse/disposal,
  failed-build atomicity, roof-surface agreement, floor elevations, custom
  footprint validation, near/coarse silhouette preservation, resolved path gates,
  promotion/suppression, facade buffer reuse, and stable ivy growth/exclusions.
- `npm run lint`, `npm run build`, and `git diff --check`: passed. The production
  build retains the existing large-chunk advisory.
- Shape browser QA: **20 interaction checks passed**, all ten designs captured,
  no console/page errors. This drives actual handle dragging and the material
  palette, then checks bake, renderer recovery, switching workshop modes, and
  access through the main workshop radial menu, gate suppression/promotion/rule
  toggles, and facade/shutter controls preserving the other GPU buffers.
- Existing workshop browser QA: **28 interaction assertions passed** across
  planar/radial openings, assemblies, imported materials, and skeleton roofs.
  This was captured in the initial shape pass. Its obsolete palette selectors
  were updated, and the standalone QA entry loads the shared radial-palette
  stylesheet.

Both browser captures used headed Chromium with a hardware NVIDIA Lovelace
WebGPU adapter (`fallback: false`). The shape runner rejects software adapters.
It also verifies WebGPU on the actual renderer backend and records the renderer
device's adapter information, rather than relying only on a separate adapter request.
Its dedicated Vite server disables live reload/file watching so concurrent
workspace changes do not navigate away from an in-progress browser assertion.
The screenshot gallery is [comparison.html](../tmp/workshop-shapes-qa/comparison.html),
with a toggle to compare the eight original designs against the prior captures;
machine-readable evidence is in
[shape report](../tmp/workshop-shapes-qa/report.json),
[existing workshop report](../tmp/workshop-qa/report.json), and
[full test log](../tmp/workshop-shapes-qa/tests.log).

| Captured design | Preview batches | Source vertices |
| --- | ---: | ---: |
| Rounded cottage | 9 | 61,548 |
| Bell-roof turret | 8 | 126,726 |
| Oval pavilion | 6 | 44,958 |
| Cottage and turret | 17 | 114,102 |
| Terraced cottage | 12 | 65,004 |
| Garden bridge | 1 | 4,968 |
| Curved courtyard | 6 | 57,252 |
| Half-timber cottage | 9 | 82,986 |
| Garden wall and path gate | 4 | 51,648 |
| Timber pavilion and ramp | 11 | 62,601 |

These counts describe the domain-separated editable previews. Baked runtime
products can merge compatible material batches. Generation timing in the shape
report is instrumentation, not a movement/frame-performance claim; a reused
product legitimately records no generation work.

The initial-pass GTAO comparison recorded p95 **0.8115 ms** without AO and
**1.0750 ms** with AO: **32.47%**, above its 25% relative target. Its interaction
assertions passed; that performance target did not. AO settings and world
streaming/residency behavior were not changed. No movement-performance
improvement is claimed or inferred from these workshop captures.

## Code review fixes

The review covered the shape capabilities, semantic editing and recovery,
resolved chemistry, geometry builders, resource cache, UI integration, and QA
runner. Regression tests reproduced 13 failures before fixes; the review adds
15 focused tests and seven browser interaction checks.

- Shape updates preserve IDs and kinds. Session replacement validates the
  complete composition before cancelling a gesture, and the shape editor
  requires at least one registered construction shape.
- Recovery captures committed composition alongside committed history. An
  unfinished preview is discarded on restoration; undo and redo restore the
  correct states. Baking completes a pending gesture exactly once.
- Sliders and handles use shared editing limits, including low walls, tall
  buildings and descending traversal. Lowering a host fits its openings in
  the same command; narrowing its footprint adapts excessive wall thickness.
- Custom outlines display their actual family and retain semantic paths during
  supported edits. Unsupported width/depth or length/bend controls and handles
  are disabled instead of silently ignoring changes.
- Resolved openings fit the host's height and path ends. Wall cuts, trim,
  shutters, collision gaps and portal dimensions use that same resolved list;
  direct resolution preserves authored intent.
- Roof bounds include wall thickness. Tall wall openings no longer remove the
  gable above them, and joined-volume roof masks also hide covered eave trim.
- Generated curve IDs remain within the kernel's 64-character limit even for
  maximum-length shape IDs. Rendered stair treads, gameplay routes and gates
  share a height policy that avoids floating-point skips at tread boundaries.
  Short support caps and footings stay between the ground and raised floor.
- Handle gestures ignore other pointers, cancel on lost pointer capture, and
  restore the previous orbit-control state. QA releases its browser, server and
  lock even when writing the report fails, and reports server startup failures.

## Remaining work

Player collision still consumes the existing conservative workshop envelope;
the newly published floors, portal gaps, and traversal routes are not yet wired
into player navigation. Bridges and stairs therefore have geometry and saved
semantics, but this change does not establish walk-through/playable interiors.

Contact masks currently use sampled surfaces and do not provide a complete
arbitrary roof-union solver. Explicit roof profiles remain authored choices.
Paths currently create gates in freeform garden walls. Automatic doors through
closed building volumes, spiral stairs, terrain-aware foundations, and promotion
of other automatic detail families remain future slices. Gate detection requires
a centerline crossing; tangent/parallel contacts, paths passing above/below a wall,
and crossings without sufficient end clearance leave the wall intact.
