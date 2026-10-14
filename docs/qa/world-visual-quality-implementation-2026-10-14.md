# World visual quality implementation — 2026-10-14

Status: implementation in progress. Release acceptance is not yet established.
Specification: [world visual quality plan](../plans/world-visual-quality-plan-2026-10-13.md).
Original evidence: [biome screenshot audit](visual-audit-2026-10-13/README.md).

## Runtime foundation

Camera cuts replace destination chunk descriptors before changing the origin and
pose. Object queries now cover individual resident chunks rather than a rectangle
spanning distant chunks. Overlapping query results and selection are deduplicated.
The cut coordinator blocks movement until the destination collision is ready.
Unit verification includes superseded asynchronous cuts and negative/large world
coordinates. A browser check exposed a collision-status field mismatch; the
coordinator now reads the production nested `collision.ready` field.

The required 120-second stationary cold-desert reproduction at canonical
`(501,-2833)` produced **120 ready samples**, zero pending bush work, and zero
browser errors on the runtime loaded from `b9cbea08`.
[Raw preparation timeline](world-visual-quality-2026-10-14/bush-before.json).
The original October 13 stuck bush entry did not reproduce at this location on
the current branch, which includes the independent `31b73999` preparation fix.
This observation does not establish that all twelve locations settle.

Preparation now reports staged replacements, in-flight/apply-pending assets and
known failures. It counts iterator advancement rather than just scheduling a
job. Scenery first turns rotate through six consumers within the existing shared
allowance. Animated meadow/layout updates remain per frame, while compaction is
budgeted. Chunk focus is copied into resumable work so a mutable focus object
cannot conceal an obsolete generation.

The permanent dev-only visual adapter uses the camera-cut transaction, full
readiness checks, original canonical poses, hardware adapter verification,
source/config hashes, and lossless captures. Unavailable later suites fail
explicitly. No unimplemented suite is represented as passing.

The focused runtime/capture tests pass. The full Node suite passed **6,664 tests**
after updating the old scenery scheduling fixture to exercise the new scheduler.
Lint and whitespace checks passed. Full hardware gates and appearance work are
pending; no visual or frame-rate improvement is claimed yet.

## Task status

| Task | State |
| --- | --- |
| VQ-01 | Implemented; long-cut browser acceptance pending |
| VQ-02 | Implemented; twelve-pose settle/revisit gate pending |
| VQ-03 | Original capture runner implemented; settled baseline pending |
| VQ-04–06 | Pending prerequisite baseline |
| VQ-07–10 | Pending surface/atmosphere gates |
| VQ-11 | Capture visibility core implemented; public HUD settings/finish pending |
| VQ-12–13 | Pending implementation and release verification |
