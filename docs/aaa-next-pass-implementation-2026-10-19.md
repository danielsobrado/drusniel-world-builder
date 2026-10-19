# Next visual pass implementation — October 19, 2026

Status: **implementation delivered; merged visual/performance acceptance in progress**.
Implements the [random-biome review plan](plans/aaa-next-pass-plan-2026-10-18.md).
The [baseline gallery](qa/random-world-review-2026-10-18/index.html) contains eighteen
views; fourteen are error-free and four cold-biome images are diagnostic due to
the recorded collider ownership failure. Runtime work starts from `3575b90e`
(rendering/performance source `8b178832`), after the intervening performance work.

## Delivery status

| Package | Current result | Remaining acceptance |
| --- | --- | --- |
| Q0 collision | Conservative trunk bounds retain the canonical placement anchor; glacier and movement replays have no collision errors | Merged movement replay |
| N0 evidence | Eighteen-view implementation replay passes; fog/material controls and comparison sliders retained | Merged gallery |
| N1 distance | Regional extinction bounded; valley mist composes radiance after lighting; four-light mist contracts pass on both backends | Merged world review and timing |
| N2 paths | Contour-gradient normalization; shared terrain/grass/flower/clearance width; GPU path, LOD and continuity fixtures pass | Merged motion and timing |
| N3 trees/floor | Bark grade, measured root-plate seating, active burial configuration, litter/understory rebalance; all 29 atlases rebuilt after merge | Merged tree fixture and contact review |
| N4 habitats | Separate woodland pigments, species eligibility, reed/broadleaf motion response, embedded rocks; deterministic distribution and residency checks pass | Merged cold-biome looks and timing |
| N5 shores | Body-aware damp-bank roughness; original river and true marine ID 0 replay pass before merge; explicit relief separated from reflectance | Merged river controls and water route |
| N6 surfaces | Metric relief derivatives; substrate separation; filtered interrupted cover marks; four-light material and temporal fixtures pass | Merged relief review and timing |
| N7 geography | Conditional package not activated: no existing/imported geography regenerated | Future landmarks require separately versioned geography and route evidence |
| N8 feel | Five motion clips pass 85 checks; HUD passes 29 checks at four sizes; motion contact sheets reviewed | Merged motion; human sound-mix judgment remains ungraded |
| N9 release | Merged full verification passes: 6,909 tests, lint, UI generation, required assets and production build | Clean matched hardware matrices and resource comparison |

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
emission. Root burial changes from 0.05 to 0.12 m through the active
`config/exploration.yaml` owner, using the existing slope-aware fit.
The forest floor uses cooler humus and stronger brown litter. Leafy floor
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
The incoming biome-snow merge changed tree source inputs and required another
complete bake; its updated manifest and changed atlas bytes are committed.

Burial alone did not address the authored roots. Decoded meadow source meshes
have a surrounding root plate 0.034–0.350 m above an isolated downward tip;
the exact `tree8` plate is 0.287357 m above that tip. The fitter now measures
that visible low plate once per prototype, requires a radial flare across
multiple quadrants, scales its seat with the tree, and retains maximum sink,
slope and overhang rejection. Thin trunks and low branches are not
reclassified as root plates. Near, proxy and impostor placements share the
fit. Source hashes and measurements are in
[root-source evidence](plans/aaa-next-pass-2026-10-19-root-source.json).
Thirty-three focused root/exploration checks passed before integration.

Terrain relief previously normalized position derivatives while retaining height
derivatives in pixel units. The corrected surface gradient uses matching units.
The analytic ramp fixture agrees with its expected normal at three zoom levels
on WebGPU and WebGL (maximum error below 0.000001). This establishes the metric
correction. Damp banks now target roughness 0.64–0.74 according to organic/cold
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

The river replay exposed another distinct issue: the shader differentiated
family-atlas reflectance as though it were a height map. Pigment and variant
boundaries, including canonical-coordinate quantization on imported maps,
became rectangular bump highlights. The physical normal now receives the
explicit feature height only; family pigment remains in the surface colour.
This adds no texture, sampler, pass or geometry. Sixty focused terrain
material checks pass. The merged river controls determine its visual result.

## Review artifacts and merged scope

The [implementation gallery](qa/aaa-next-pass-implementation-2026-10-19/candidate/index.html)
contains 18/18 fully ready, error-free views at `970783f1`; its
[comparison sliders](qa/aaa-next-pass-implementation-2026-10-19/candidate/comparison.html)
use the original unretouched PNGs. Later
[root-contact views](qa/aaa-next-pass-implementation-2026-10-19/root-contact/index.html)
and [marine/river supplements](qa/aaa-next-pass-implementation-2026-10-19/supplements/index.html)
use `dbfbf83e`. These stages are retained independently, not relabelled as the
latest source. The real marine supplement is ID 0; the original coast cameras
sit in ID 4.

The pre-merge motion report covers seasonal forest, deciduous first/third
person, wetland and a synthetic route with actual eviction/return and origin
rebasing. All 85 checks pass, including feet/collision, field of view, input
release, two-second recovery, stable source IDs and growth assignments, one
audio owner and retained mute state. Videos are 1600 × 900 at verified 25 fps;
recording overhead is excluded from performance evidence. HUD contrast,
overlap and capture/input checks pass at 760 × 600, 1280 × 720, 1600 × 900 and
1920 × 1080. Automated audio lifecycle results do not grade the audible mix;
no new sound mix or camera controller was introduced.

The requested pull/merge/push brought in per-biome snow/canopy looks and grass
ground integration (`62ddd418`). The root configuration correction and relief
separation produce frozen runtime `f7dc2b53` for final replay and timings.
Canonical terrain identities and custom-biome persistence are unchanged.

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
the same specular-only failure as the river bank. The candidate controls then
confirm the baked ground is grass and disabling local mist removes the broad
pale areas. Valley weight is 0.3168 and jungle-mist weight is zero at that pose.
The responsible valley blend was applied to albedo before lighting, so surface
sun/fill illuminated its radiance a second time. It now composes the lit output
and preserves alpha, before the existing jungle-mist output composition. The
production valley settings use density 0.018, height 2.5 m, ceiling 9 m and a
restrained forward lobe, with the first 8–24 m clearing gradually. Local volumes
remain enabled. A GPU contract verifies the same mist radiance over surfaces
under zero, ordinary and strong lighting; final world replay is separate.

Imported camera-cut readiness includes the far terrain added by intervening
performance work. A river attempt timed out there and a fresh retry was terminated
after seven minutes without completing loading/preparation. Both remain failed
evidence. The capture runner can record a longer preparation timeout and reload
between poses; it still requires every readiness flag. These preparation waits
are not movement timing measurements.
