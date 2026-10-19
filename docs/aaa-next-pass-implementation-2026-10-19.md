# Next visual pass implementation — October 19, 2026

Status: **in progress**. Implements the [random-biome review plan](plans/aaa-next-pass-plan-2026-10-18.md).
The [baseline gallery](qa/random-world-review-2026-10-18/index.html) contains eighteen
views; fourteen are error-free and four cold-biome images are diagnostic due to
the recorded collider ownership failure. Runtime work starts from `3575b90e`
(rendering/performance source `8b178832`), after the intervening performance work.

## Delivery status

| Package | Current result | Remaining acceptance |
| --- | --- | --- |
| Q0 collision | Conservative trunk bounds retain the canonical placement anchor while the capsule remains at its actual transformed trunk; failing glacier pose now captures without errors | Movement/collision QA |
| N0 evidence | Eighteen baseline views, original failures, replay metadata and image-specific observations retained | Material/fog controls and current-runtime A/B evidence |
| N1 distance | Overlapping regional extinction is bounded while climate identity, local mist and weather remain owned by their existing systems | Four-light and ordinary-view review; timing |
| N2 paths | Analytic contour-gradient normalization keeps path width spatially consistent; terrain, grass, flowers and clearance share it | GPU parity/path fixture, world replay and residency/timing |
| N3 trees/floor | Authored bark reflectance grade, deeper root seating, restrained weathering, litter/understory rebalance; all 29 tree atlases rebuilt | Four-light tree fixtures and world comparison; pale floor investigation |
| N4 habitats | Separate woodland pigments, species eligibility, reed/broadleaf motion response, embedded rocks; existing population budgets retained | Full biome gallery, LOD/motion and residency checks |
| N5 shores | Body-aware damp-bank roughness replaces universal 0.38 gloss; diagnostic controls retained | Original river replay and water route |
| N6 surfaces | Relief derivatives retain physical scale; mineral/litter/mud separation strengthened; interrupted filtered ground-cover marks replace continuous stripes | World controls, four lights, temporal and timing checks |
| N7 geography | Conditional, separate new-world version; existing/imported geography preserved | Demonstrate need after composition changes |
| N8 feel | Pending | Movement, contact, HUD and listening review |
| N9 release | Full verification passes: 6,895 tests, lint, UI generation check, required assets and production build | Candidate matrix, resources, persistence and final evidence |

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
shoulder width and stable worker/main grass exclusion. The first combined world
batch (`first-slice/`, source `5d6f6420`) captures 03, 05, 06 and the previously
failing 11 with full readiness and zero errors. GPU path checks remain required.

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

## Material and habitat implementation

The optional bark grade operates on linear reflectance. It reduces the painted
black/gold contrast while preserving ordered values and warm hue; it adds no
emission. Root seating changes from 0.05 to 0.12 m using the existing slope-aware
fit. The forest floor uses cooler humus and stronger brown litter. Leafy floor
assets gain selection weight within the same placement budget. Birch-profile
`tree-03` is restricted to compatible damp temperate/wetland roots; the existing
large broadleaf models supply tropical broadleaf eligibility. There are no new
models or per-piece scene objects.

Woodland IDs 5/6 share a muted pair; rainforest IDs 7 and 8 retain separate
pigments. The lookup remains within its eight-palette limit. Reeds have less
rest curvature and wind compliance than slender meadow blades; broad leaves sit
between them. The response is packed in spare components of the existing growth
uniform. Near blades and far cards consume it without another attribute or pass.
Rocks use 0.14 m burial, shared with their collision source.

All 29 tree impostors were rebuilt with hardware WebGPU and KTX2 encoding.
Required validation passes with signature `tree-impostor-v8-25a57e2c`.

Terrain relief previously normalized position derivatives while retaining height
derivatives in pixel units. The corrected surface gradient uses matching units.
The analytic ramp fixture agrees with its expected normal at three zoom levels
on WebGPU and WebGL (maximum error below 0.000001). This establishes the metric
correction; attribution of the historic river scallops still needs its world
control. Damp banks now target roughness 0.64–0.74 according to organic/cold
context; rain and moving liquid swash keep their existing responses.

The incoming [shore review](plans/water-shore-quality-review-2026-10-19.md)
establishes independent card-layer rows and fine directional terrain marks.
Terrain cover now uses short noise-based marks in irregular patches, filtered
against the pixel footprint. It reuses existing periodic origins. A canonical
toroidal translation decorrelates adjacent meadow tile sequences before ground
sampling, on both main and worker compaction paths. Rank prefixes, instance
budgets and wind anchoring remain intact. Fifty-five meadow tests pass, including
spatial uniformity, prefixes, large coordinates, eviction replay, habitat density,
path exclusion and continuous wind.

## Capture and timing caveats

The first current-runtime matrix is exploratory. Dense-mixed lost native focus;
construction exceeded the hitch gate, and a CPU build overlapped part of that
batch. It is retained under `baseline-performance/` and is not an authoritative
baseline/candidate comparison. New measurements must run without capture/video
or CPU builds and retain their native-focus verdicts.

The initial material diagnostic batch failed on an unresolved bare TSL import;
the helper now resolves the frozen Vite dependency URL. A fresh forest control
batch passes. Grass eligibility is full in the pale area and the narrow path
occupies only part of it. Matte terrain retains the pale floor, so this is not
the same specular-only failure as the river bank. Local mist and material weights
are the next controls; a cause is not assumed from the screenshot.

Imported camera-cut readiness includes the far terrain added by intervening
performance work. A river attempt timed out there and a fresh retry was terminated
after seven minutes without completing loading/preparation. Both remain failed
evidence. The capture runner can record a longer preparation timeout and reload
between poses; it still requires every readiness flag. These preparation waits
are not movement timing measurements.
