# Workshop quality expansion

Active user objective: **do it all** from the six proposed workshop improvements.
Keep all six areas in scope until the current implementation and rendered results
prove them complete. The geometry framework and its semantic/resolved ownership,
local invalidation, deterministic variation, batching and persistence rules apply.

## Requirements and completion evidence

- [x] Roof quality: smooth curved surface normals with crisp physical tile edges;
  continuous clipping at connected roofs/walls; valleys, flashing and connected
  trim. Evidence: deterministic seam and normal tests, joined-building close-ups,
  unchanged unrelated domain buffers, near/coarse silhouette checks.
- [x] Controlled weathering: chipped masonry, subtly bowed timber, worn thresholds,
  plaster wear and foundation dampness. Evidence: stable local keys, exclusion and
  undo/replay checks, close-ups across materials and age settings.
- [x] Architectural shapes: dormers, bay windows, projecting upper storeys, porches
  and buttresses, adapting to host curves, openings and roofs. Evidence: semantic
  authoring controls, geometry/contact tests, bake/load and undo/redo, captures of
  every feature and combinations through host resize/rotation.
- [x] Grounding and vegetation: foundation transitions, entrance paving, grass
  clearance around steps, contextual moss, improved ivy leaves and tree silhouettes.
  Evidence: shared foundation/traversal/opening masks, captures at ground level,
  deterministic placement, material/LOD budgets.
- [x] Connected style: timber/stone/trim/floor inheritance into attached stairs,
  supports and railings, with explicit overrides. Evidence: semantic resolution
  and persistence tests, local style invalidation, connected composition captures.
- [x] Direct manipulation: draggable doors/windows, curve control-point editing,
  individual generated-detail movement and suppression. Evidence: real browser
  pointer tests, cancel/undo/redo, host adaptation, persistence and recovery.

## Shared verification

- [x] Full test suite, lint, production build and diff checks.
- [x] Hardware WebGPU browser QA and a reviewable before/after gallery.
- [x] Geometry, draw batches, edit latency and cache-reuse measurements for the
  fixed fixtures; reduce detail at distance without losing new silhouettes.
- [x] Player movement performance harness comparison if streaming/residency or
  terrain runtime behavior changes; workshop rendering measurements otherwise.
- [x] Final requirement-by-requirement audit against current authoritative state.

## Progress

The previous polished workshop captures are preserved in
`tmp/workshop-expansion-before`. All six areas are implemented and audited against
the current code, hardware captures and tests. See
[the implementation and evidence report](../workshop-quality-expansion-2026-10-08.md)
for the requirement audit, geometry budgets, measured editing costs and practical
limits. The shared workspace suite has 3,407 passing tests; the shape suite has
92; hardware shape QA has 33 passing checks; existing workshop QA has 27.

No terrain, streaming or world residency behavior was changed by this workshop
pass, so the conditional player movement comparison was not needed. Runtime LOD
validation accepts all four new architectural presets and preserves their
envelopes. The gallery contains fourteen designs and thirteen detail captures,
including coarse comparisons. Interactive opening edits measured 41.5–47.0 ms,
with neighboring products reused.
