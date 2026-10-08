# Workshop procedural shape opportunities

Date: 2026-10-08  
Scope: code review and proposed implementation slices; no runtime geometry changes

The strongest opportunity is to let users compose and reshape curved buildings,
with roofs and details adapting to their edits. The project already has a rich
village generator. The remaining work is to make that richness available through
the semantic construction tools and to connect neighboring shapes coherently.

This review follows the [geometry framework](../architecture/workshop-geometry-framework.md),
[implementation plan](../plans/workshop-geometry-framework-plan-2026-08-19.md), and
[public-behavior research](tiny-glade-workshop-behavior-review-2026-08-19.md).

## What already exists

| Capability | Current implementation | Implication |
| --- | --- | --- |
| Village buildings | `ProceduralWorkshopArchetypeCatalog.js` lists 13 house designs, including cottages, taverns, a chapel, and a generated house grammar. | New building names alone would add less value than more editable shape combinations. |
| Expressive pitched roofs | `village/HouseRoofSurface.js` supports sweep, ridge sag, and hipped ends. `HouseRoof.js` builds the corresponding roof surfaces and detail. | Reuse this math when bringing roof profiles into semantic construction. |
| Architectural detail | Existing masonry, shingles, timber frames, dormers, opening assemblies, and ivy modules. | Adapt these consumers to shared surfaces and masks rather than rebuilding them separately for each new shape. |
| Semantic foundations | Documents, commands, preview transactions, history, curve projection, topology remaps, spatial indexing, and dirty domains exist. | The supporting kernels are usable; the next step is an end-to-end geometry and interaction slice. |
| Composition | Rectangle, circle, and polyline-wall records have stable semantic entity IDs and derived material/gameplay products. | This is the starting point for reusable construction capabilities. |

## Gaps observed in the code

1. **Composition is not exposed by the live form.**
   [`ProceduralWorkshopUi.readInput()`](../../src/editor/workshop/ProceduralWorkshopUi.js#L385)
   does not include a composition document. The visible Build selector and radial
   configuration select recipe archetypes. A backend-only shape expansion would
   therefore need interaction and persistence wiring before users could author it.

2. **Composition geometry has a narrow shape vocabulary.**
   [`ProceduralWorkshopCompositionGenerator.js`](../../src/editor/workshop/ProceduralWorkshopCompositionGenerator.js)
   builds rectangles from four box walls, circles from a cylinder shell with a
   cone or flat cap, and walls from separate straight boxes. The standalone
   legacy tower already has tapering behavior; that does not provide a general
   editable profile for composition volumes.

3. **Chemistry is still largely a target for composition.**
   [`planWorkshopComposition()`](../../src/editor/workshop/ProceduralWorkshopComposition.js#L304)
   returns empty structural contacts, suppressed faces, supports, portals, and
   stair sockets. Existing legacy openings and stairs should not be confused with
   a general system that resolves these relationships between authored shapes.

4. **Local invalidation has not become local preview construction.**
   [`generatePreview()`](../../src/editor/workshop/ProceduralWorkshopUi.js#L645)
   awaits a composition plan, then calls `createPreviewParts()` and clears the
   old preview. The worker currently plans semantic composition data, not the
   expensive geometry. The Phase 4 report explicitly retains legacy geometry
   authority. New local tools need to consume dirty plans and replace affected
   products instead of extending this full-preview path.

5. **Some variation keys still depend on build order.**
   [`HouseKit.seedOffset()`](../../src/editor/workshop/village/HouseKit.js#L29)
   advances a counter, and default stone/shading keys consume it. This is a
   code-level risk to appearance stability when earlier emitted pieces change;
   it was not visually reproduced in this review. New detail should use entity,
   domain, and local-cell keys.

## Shape families worth building

The ordering below reflects expected visual value and architectural reuse, not
measured development estimates.

| Priority | Shape family | Concrete designs | Why it helps |
| --- | --- | --- | --- |
| 1 | Curved footprints and walls | Rounded cottage, oval pavilion, horseshoe courtyard, curved garden wall | Adds silhouette variety through one curve-aware wall capability. |
| 2 | Shared roof profiles | Bell roof on a round turret, swept cottage gable, low pavilion hip, slender spire | Makes massing expressive and brings existing roof math under user control. |
| 3 | Wall and volume profiles | Battered tower base, tapered tower, projecting upper storey, stepped plinth | Improves proportions and the transition from ground to roof. |
| 4 | Connected building chemistry | Cottage with a turret, joined cottage wings, gateway between curved walls | Makes combinations read as one structure through wall suppression, roof trimming, and joins. |
| 5 | Adaptive connections | Terrace with steps, tower-wrapping stair, small arch bridge, raised walkway | Creates useful compositions and architectural rhythm; requires traversal and support semantics. |
| 6 | Context detail | Opening-aware planks, continuous corner masonry, roof verge trim, restrained vegetation | Gives the shapes tactile depth while retaining visual clarity. |

Bell roofs and curved gables are proposed design directions for this project,
not claims about Tiny Glade's internal implementation. Tiny Glade's official
[product description](https://store.steampowered.com/app/2198150/Tiny_Glade/)
does establish the relevant public behavior: procedural pieces adapt to
construction, paths can create doors, and raised buildings receive supports.

## Recommended first implementation slice

**Build a semantic curved-wall tool with a rounded cottage shell and a curved
courtyard wall as its two visual fixtures.** The cottage begins as a structural
shell; it becomes a finished building once openings and roof integration pass
their respective gates.

This advances Phases 5 and 6 of the existing plan before adding complex presets.
The two fixtures prove that a closed building footprint and an open wall can
share construction capabilities.

### Authoring and interaction

- Store a stable `CurvePath` and wall intent: elevation, height, thickness, and
  profile. Reuse line/arc/quadratic segments and the central tolerance policy.
- Offer rectangle, rounded rectangle, circle, and open arc as tool starting
  shapes. Presets create semantic entities and relationships.
- Drag corner radius, control points, wall height, and thickness through preview
  patches. Commit one gesture as one history entry; cancellation drops the patch.
- Persist the authored construction document through the workshop's read, bake,
  load, and runtime-recovery paths.

### Planning and geometry

- Add the planned wall planner/builder boundary and deterministic builder
  registration. Keep identity and surface ownership known before triangulation.
- Resolve continuous inner/outer envelopes and endpoint/corner treatments.
  Closely sampled boxes are insufficient for clean joins.
- Derive collision, room boundaries, cover, and foundation contacts from the
  same shape plan. Tapered profiles must publish their height-dependent envelope.
- Publish wall-local surface coordinates for later openings and detail.
- Consume dirty entity/domain sets to rebuild affected wall products and their
  actual dependents. Reuse untouched geometry and materials.

### Acceptance criteria

- Rounded cottage and curved-wall fixtures render without visible segment gaps.
- Dragging a corner preserves stable entity/segment lineage and valid topology.
- Editing one of two disconnected walls preserves the other's plan and geometry
  resource identity.
- Save/load and undo/redo restore identical authored data and derived output.
- Geometry remains finite through deterministic degenerate-preview cases.
- Near/coarse/shell outputs preserve the characteristic curve silhouette.
- Record edit latency, regenerated entities, generated vertices, batches, and
  resource disposal with deterministic fixtures. Establish a baseline before
  setting performance targets.

## Follow-on slices

**Openings and surfaces:** attach doors/windows in wall-local coordinates, publish
cut and exclusion masks, then adapt masonry/planks and ivy. A moved door should
change nearby surface pieces while retaining unrelated detail keys. Use the
existing opening assemblies and generated-output controls.

**Roof profiles:** introduce the planned roof solver registry, wrapping existing
flat/gable/hip/cone and straight-skeleton behavior. Adapt the village roof surface
math for semantic sweep/sag/hip controls and add a round bell profile through the
same solver boundary. Profiled roofs must provide surface sampling for tiles and
attachments; changing only the roof mesh would leave those consumers misaligned.
Preserve explicit roof choices or report a deterministic fallback when connected
footprints require a different solver.

**Joins and supports:** derive neighboring wall treatments, shared-face
suppression, roof junctions, and foundations in the resolved layer. Automatic
outputs need provenance, deterministic keys, and promotion/suppression behavior.

**Traversal:** implement the existing generalized traversal plan before bridge
and spiral-stair presets. Store a path/network and resolve walkways, steps,
landings, railings, and supports according to context. Navigation and collision
must agree with the resolved traversal.

The resulting preset set could include a rounded cottage, bell-roof turret,
courtyard pavilion, cottage-and-turret cluster, terraced cottage, and garden
bridge. Each would compose shared capabilities rather than add another core
archetype branch.

## Visual direction

- Establish readable massing first: a substantial base, clear entrance, roof
  overhang, and a small number of secondary volumes.
- Make variation intentional: modest asymmetry, coherent stone courses, and
  controlled roof sweep. Use stable local variation rather than uniformly
  roughening every surface.
- Keep physical trim and surface relief concentrated at corners, openings,
  eaves, and the foundation where they affect shape and light.
- Use deterministic camera/light/material fixtures to judge silhouette,
  junctions, and detail at both workshop and world viewing distances.

## Validation performed for this review

All 35 existing tests passed:

- `npm run qa:workshop:kernel`: 13 passed.
- `npm run qa:workshop:curves`: 15 passed.
- `npm run qa:workshop:locality`: 7 passed.

These results establish the reviewed kernels' existing contracts. They do not
establish visual quality, live composition authoring, or frame performance.
This review made no runtime changes and ran no browser or movement benchmark.
For subsequent streaming-sensitive changes, compare frozen before/after builds
with the deterministic harness in [perf-qa.md](../perf-qa.md), using headed
hardware WebGPU captures and a scene that actually includes the new shapes.
