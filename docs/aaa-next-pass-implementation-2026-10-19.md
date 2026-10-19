# Next visual pass implementation — October 19, 2026

Status: **in progress**. Implements the [random-biome review plan](plans/aaa-next-pass-plan-2026-10-18.md).
The [baseline gallery](qa/random-world-review-2026-10-18/index.html) contains eighteen
views; fourteen are error-free and four cold-biome images are diagnostic due to
the recorded collider ownership failure. Runtime work starts from `3575b90e`
(rendering/performance source `8b178832`), after the intervening performance work.

## Delivery status

| Package | Current result | Remaining acceptance |
| --- | --- | --- |
| Q0 collision | Conservative trunk bounds retain the canonical placement anchor while the capsule remains at its actual transformed trunk | Frozen world replay at the failing glacier position; movement/collision QA |
| N0 evidence | Eighteen baseline views, original failures, replay metadata and image-specific observations retained | Material/fog controls and current-runtime A/B evidence |
| N1 distance | Overlapping regional extinction is bounded while climate identity, local mist and weather remain owned by their existing systems | Four-light and ordinary-view review; timing |
| N2 paths | Analytic contour-gradient normalization keeps path width spatially consistent; terrain, grass, flowers and clearance share it | GPU parity/path fixture, world replay and residency/timing |
| N3 trees/floor | Investigation in progress | Implementation and acceptance |
| N4 habitats | Pending | Implementation and acceptance |
| N5 shores | Pending | Bank cause controls and implementation |
| N6 surfaces | Pending | Implementation and acceptance |
| N7 geography | Conditional, separate new-world version; existing/imported geography preserved | Demonstrate need after composition changes |
| N8 feel | Pending | Movement, contact, HUD and listening review |
| N9 release | Matched current-runtime baseline matrix running | Candidate matrix, resources, persistence and full verification |

## Changes and evidence

Q0 preserves ownership and stable IDs. A prototype's lower-trunk center can be
offset from its placement origin; rotation at a chunk boundary can place the
capsule completely outside its manifest owner. The broad-phase AABB now contains
both the capsule and the placement anchor. The capsule dimensions and position
are unchanged. Regression checks cover rotated offset trunks, ownership,
neighbour-chunk queries, deterministic rebuild and absence of a phantom collision
at the anchor. Twenty focused collision tests pass.

N2 uses the contour's analytic gradient to convert implicit field difference to
an approximate spatial distance. Previously the same field threshold produced
wide bare strips in low-gradient regions. The TSL and CPU calculations agree in
form, and the meadow sampler's conservative early-out accounts for the gradient
bound. Its preparation signature changes to `paths2`. Seventeen focused tests
pass, including numerical gradient checks at imported-world coordinates, physical
shoulder width and stable worker/main grass exclusion. GPU and world evidence
is still required.

N1 compresses the excess contribution of climate, regional personality and humid
air to a bounded regional multiplier. Neutral and clear air are unchanged;
time-of-day/weather density remains relative, and local valley mist retains its
own volume. The captured Eldara wetland's multiplier was 4.61: the configured
exponential distance term alone removed 98.6% of contrast at 300 m. The bounded
regional contribution retains over 40% transmission there. That is an analytic
control, not a screenshot or performance result. Sky/region tests pass.

Original screenshots are unretouched. Visual capture, movement recording and
hardware timing are separate workloads. Unfinished packages above are not
claimed as delivered.
