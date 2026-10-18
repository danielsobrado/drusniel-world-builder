# World look implementation — October 18, 2026

Implementation of the [October 18 visual plan](plans/aaa-look-and-feel-plan-2026-10-18.md).
Status: in progress. Acceptance results below are updated only after execution.

The baseline world survey completed all 18 requested poses with matching biome
IDs, complete readiness, 29 valid tree atlases/batches, fixed source and zero
browser errors. Original media remain under `docs/qa/visual-audit-2026-10-18/`.
The first supplemental motion attempt exposed a harness call to a nonexistent
wind accessor; the script now uses the QA diagnostics and preserves that failed
attempt in its report. Capture validity is separate from visual acceptance.

## Delivery status

| Item | Implementation | Acceptance |
| --- | --- | --- |
| R0 evidence | Eighteen baseline world poses; source/config/map hashes; targeted tree surveys | Baseline stills passed; supplemental motion rerun pending |
| R1 plant motion | Explicit asset motion profiles; rooted rigid fallback for leaves/shrubs; matching normals and conservative bounds | CPU geometry/placement tests pass; GPU review pending |
| R2 plant appearance | Explicit material roles for authored flowers; restrained understory grading; procedural flowers use terrain stem pigments and world-space bent normals, cloud shadow and mist | Mixed-light GPU review pending |
| R3 grass/ground | Persistent stand-weighted substrate occlusion; lighter sparse roots | Ground palette unit tests pass; combined/distance GPU review pending |
| R4 tree shapes | Leafless dead state; living crown height retained; authored species no longer receive a second narrow/wide squeeze | Morphology/LOD tests pass; same-instance GPU review pending |
| R5 surfaces/contact | Pending | Pending |
| R6 habitat composition | Pending | Pending |
| R7 atmosphere/composition | Pending | Pending |
| R8 motion/interaction/HUD/sound | Pending | Pending |
| R9 release/performance | Frozen baseline hardware matrix running | Final matrix and verify pending |

## Diagnosed causes

- Leafy bushes and ground details shared the grass tuft's height-dependent bend.
  Assets without authored branch/leaf pivots now use a restrained whole-plant
  rotation. This preserves broad-leaf shape while retaining the shared wind
  field. Grass keeps flexible bending; aquatic plants retain their current path.
- Procedural flowers used a fixed view-space up normal and omitted the cloud
  and regional mist wrappers. Their roots also used a global color independent
  of the meadow's biome palette. Authored blossoms now explicitly distinguish
  stems, petals and centers, protecting yellow petals from the green mask.
- Sparse grass roots were much darker than their floor. Root shading is lifted
  while a bounded habitat-density contribution darkens the substrate of dense
  stands in both near shading and the CPU distant palette.
- The prominent odd tree in pose 06 is `tree:-15:99:85`, prototype 22,
  `broadleaf_tall`, age `dead`, about 11.14 m from the camera. Its crown scale
  was 0.4388 while its green foliage remained. Dead leaves now mask out in
  geometry representations. Living crowns retain their branch envelope.

## Resource and data contract

No new scene pass, screen-color/depth copy, terrain IDs, mesh population or
residency range is introduced by R1–R4. Rigid plant motion adds one three-float
instance root attribute (12 bytes per allocated instance) to affected batches,
updated only when placement or anchor changes. Shader profiles share graphs;
seeds remain instance data. Flower palette lookup adds a small nearest-filtered
table per slot and reads the slot's existing tile texture; disposal releases
the table. Runtime counters and hardware captures will quantify the complete
cost before acceptance.

Dead trees retain their existing identity and trunk/collision geometry. Species
selection and Azgaar IDs are preserved. Tree atlas source geometry/materials
remain unchanged; per-instance appearance is applied at runtime.

## Validation

- Focused CPU tests currently pass for rigid root/shape preservation, stable
  instance anchors, substrate means/custom IDs and tree morphology/LOD.
- Repository ESLint passes for the initial R1–R4 implementation.
- GPU visual, backend, performance and complete production verification remain
  required. Pending rows above are not release claims.
