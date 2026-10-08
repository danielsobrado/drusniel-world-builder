# Workshop quality expansion

Active user objective: **do it all** from the six proposed workshop improvements.
Keep all six areas in scope until the current implementation and rendered results
prove them complete. The geometry framework and its semantic/resolved ownership,
local invalidation, deterministic variation, batching and persistence rules apply.

## Requirements and completion evidence

- [ ] Roof quality: smooth curved surface normals with crisp physical tile edges;
  continuous clipping at connected roofs/walls; valleys, flashing and connected
  trim. Evidence: deterministic seam and normal tests, joined-building close-ups,
  unchanged unrelated domain buffers, near/coarse silhouette checks.
- [ ] Controlled weathering: chipped masonry, subtly bowed timber, worn thresholds,
  plaster wear and foundation dampness. Evidence: stable local keys, exclusion and
  undo/replay checks, close-ups across materials and age settings.
- [ ] Architectural shapes: dormers, bay windows, projecting upper storeys, porches
  and buttresses, adapting to host curves, openings and roofs. Evidence: semantic
  authoring controls, geometry/contact tests, bake/load and undo/redo, captures of
  every feature and combinations through host resize/rotation.
- [ ] Grounding and vegetation: foundation transitions, entrance paving, grass
  clearance around steps, contextual moss, improved ivy leaves and tree silhouettes.
  Evidence: shared foundation/traversal/opening masks, captures at ground level,
  deterministic placement, material/LOD budgets.
- [ ] Connected style: timber/stone/trim/floor inheritance into attached stairs,
  supports and railings, with explicit overrides. Evidence: semantic resolution
  and persistence tests, local style invalidation, connected composition captures.
- [ ] Direct manipulation: draggable doors/windows, curve control-point editing,
  individual generated-detail movement and suppression. Evidence: real browser
  pointer tests, cancel/undo/redo, host adaptation, persistence and recovery.

## Shared verification

- [ ] Full test suite, lint, production build and diff checks.
- [ ] Hardware WebGPU browser QA and a reviewable before/after gallery.
- [ ] Geometry, draw batches, edit latency and cache-reuse measurements for the
  fixed fixtures; reduce detail at distance without losing new silhouettes.
- [ ] Player movement performance harness comparison if streaming/residency or
  terrain runtime behavior changes; workshop rendering measurements otherwise.
- [ ] Final requirement-by-requirement audit against current authoritative state.

## Progress

The previous polished workshop captures are preserved in
`tmp/workshop-expansion-before`. Implementation is in progress; no area is claimed
complete by this plan alone.
