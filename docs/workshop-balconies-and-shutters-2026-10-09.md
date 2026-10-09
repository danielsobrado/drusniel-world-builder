# Workshop balconies, shutters and feature editing

This pass adds curved timber balconies, expressive shutters and direct placement
handles to the existing semantic workshop. It follows the workshop geometry
framework and extends the shared feature registry rather than adding archetype
branches to the editor or runtime.

## Authoring behavior

- **Curved balcony:** use `+ Curved balcony` under Architectural feature. Its deck
  follows the wall curve at the chosen elevation, including tapered and rotated
  hosts. Planks, turned balusters, continuous bevelled handrails and curved timber
  corbels share material batches. Neighboring walls clip the exposed geometry.
- **Shutter pose:** select a window and choose Natural variation, Open, Ajar or
  Closed. Natural variation stays anchored to the window ID when the window moves.
  Closed panels follow curved walls and retain the actual arched opening profile.
- **Feature handle:** select a balcony, bay, dormer, porch or buttress and pull its
  gold handle along the wall. Bays and balconies also move vertically. Existing
  contextual rules still anchor porches to doors and keep buttresses clear of
  openings. Projecting storeys retain their projection slider.
- **Starting designs:** `Timber manor with a balcony` and `Round tower with a curved
  balcony` join the fourteen existing designs.

## Geometry and state

Canonical data stores feature intent and each opening's `shutterPose`. Curves,
deck outlines, collision strips, floors, support profiles and mesh buffers remain
derived. Bake, history and renderer recovery preserve authored intent.

Balconies publish an exposed walkable deck and collision strips for its railing,
without creating an enclosed room or unsupported ground contacts. Generic floor
generation excludes feature-owned floors, avoiding a second stone layer over the
timber deck. These are workshop semantic products; this pass does not extend world
navigation or change the existing conservative runtime asset collision policy.

Balcony bounds participate in spatial neighbor discovery. Moving an adjacent wall
invalidates the clipped feature product. A balcony placement edit retains the
host's wall, roof, ground and ivy products when their dependencies do not change.
A shutter pose edit rebuilds the facade only. Distant detail retains balconies and
shutters, including their silhouette. Wood UVs on the new deck planks, shutter
panels and profiled rails are attached to the geometry rather than world position.

## Review corrections

- Feature spatial envelopes consistently use XZ coordinates. Child volumes,
  balcony render bounds and resolved buttress profiles expand the host envelope;
  exposed supports also participate in neighbor discovery.
- Buttresses resolve their profile against the wall at every height. Ground
  contacts and upper edges follow tapered walls, and the renderer consumes that
  resolved data. Host height and neighboring roof edits invalidate support
  geometry while distant products retain their buffers.
- Identical overlapping bodies retain exposed balconies. Duplicate roof relief
  still has one deterministic owner; clipping preserves geometry outside the
  neighboring envelope.
- Porches select doors using distance around the closed footprint, including the
  seam between its final and first segments.
- Vertical window, planter, bay and balcony drags preserve their perimeter
  anchor on tapered oval walls. Horizontal drags project from the wall anchor at
  the updated elevation. An unchanged support handle preserves authored intent
  rather than promoting an automatic opening-avoidance adjustment.
- Browser drag checks verify that the pointer captured the intended handle.

## Validation and artifacts

- Full repository suite: **3,456 tests passed**.
- Workshop shape suite: **118 tests passed**.
- Nineteen focused balcony/shutter tests cover shared handrail joints and normals,
  attached rail UVs, rotated/tapered frames, floor ownership, semantic dragging,
  cancel and replay, product reuse, shutter poses, curved closure, runtime LOD
  envelopes, neighboring-wall clipping/invalidation, rotated spatial envelopes
  and exposed geometry beside identical bodies. Expansion regressions cover
  tapered supports, roof and height invalidation, footprint seam anchoring and
  vertical direct editing.
- Hardware workshop browser QA: **38 checks passed**, covering sixteen presets and nineteen detail views,
  including real pointer drags, all shutter poses, undo/redo, Escape, bake and
  renderer recovery. The actual renderer uses NVIDIA Lovelace WebGPU, with no
  software fallback.
- Existing workshop compatibility QA: **27 assertions passed** on the headed
  production build, including planar/radial editing, opening assemblies, materials
  and composition roofs.
- Lint, production build and `git diff --check` pass. The build retains the
  existing large-chunk advisory.

Visual gallery: [comparison.html](../tmp/workshop-shapes-qa/comparison.html).
Machine-readable results: [report.json](../tmp/workshop-shapes-qa/report.json).
The gallery's previous-version toggle uses `tmp/workshop-next-before/`, preserving
the preceding fourteen-design pass.

Workshop-only changes do not alter terrain generation, chunk streaming or world
residency. Browser CPU edit measurements are cache/planning timings, not FPS or
pointer-to-presentation latency.
