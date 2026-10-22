# Performance remediation results — 2026-10-22

All eight findings in the [review and fix plan](plans/performance-remediation-2026-10-21.md)
have runtime fixes and regression coverage. Visual configuration, assets, terrain
IDs, population rules, distances, densities, texture resolution and shader effects
were not reduced. Hardware release acceptance remains open for the reasons below;
this report does not claim an FPS speedup.

## Implemented changes

| Finding | Change | Evidence |
| --- | --- | --- |
| F01: cold queries plan cities synchronously | Interactive minimap, ambient ground, valley fog, hover, resident, collision, tour and camera-cut consumers prepare canonical plans through the existing worker service. Bootstrap index installation is bounded too. Imported river profiles and valley reaches are prepared in the settlement worker before world publication. Distant terrain shares the active generator and retries exact missing plans asynchronously. | Cold Eldara import, player teleport, fly cut and tour generated **zero main-thread plans** on hardware WebGPU. Exact river, water, macro-terrain, collision and grading comparisons pass. Failed or superseded loads preserve the current world. |
| F02: retained settlement data grows with travel | Each main/worker field owns a bounded cache: 32 plans and a 32 MiB estimated allowance by default. It clears plan, index and skyline payloads together on stable registry entries. Independent live terrain, site, skyline and installation owners pin their dependencies. | A 24-town generated-plan soak with a two-entry allowance evicts 22 towns, stays within its allowance, and regenerates the first plan, skyline and graded heights exactly. Cache status exposes pinned exceptions, evictions and retained skyline bytes. |
| F03: skyline hides before buildings are published | Handover requires this site's actual building variants, completed fades, published tiers and current camera-selection epoch. Props and unrelated variants do not block it. | Delayed, failed, staged and retired tier tests pass. The browser cold-city check observed retained skyline coverage during incomplete selection and no skyline hidden before coverage was complete. |
| F04: ground textures rebuild in a single burst | Ambient particles **and valley fog** stage their existing 64×64, 128 m patches on the shared allowance. Canonical patches survive rebases; edits invalidate them; replacements publish atomically. | First slice makes at most 65 height calls including its base; following slices make at most 64. A pure rebase makes zero calls. Final half-float texels and edited terrain tests pass. |
| F05: minimap redraw scans and resamples everything | A detached raster job reuses exact unchanged cell samples, queries local object bounds, coalesces invalidations and publishes the bitmap with its coordinates. | At most 256 height/tile samples per yielded slice. Repeating a window takes zero new terrain samples. Fractional-lattice raster parity, shifted-window reuse, local object queries and multiple recenter publication tests pass. Production resolution remains 192×192. |
| F06: kit-town classification scans all placements outside the budget | Preparation builds a spatial index while producing the existing matrices. Resumable near/far and interior selection use local candidates and stable slots through the shared budget. Initial publication remains complete. | A 10,000-placement fixture yields over 100 times during initialization. Its later small movement evaluates fewer than 30 placements. Exact near/far membership, matrix ordering, cancellation, rebase, collision and door publication tests pass. |
| F07: capacity growth clones static vertex arrays | Growing settlement tiers retain immutable CPU vertex/index arrays behind distinct attribute wrappers. New instance storage and the existing staged replacement keep their own lifetimes. | Array identity tests prove zero immutable-array copies on growth. Tests against the installed Three.js WebGPU/common and WebGL geometry managers prove retiring an old tier cannot delete replacement attributes. This does **not** claim zero GPU uploads or shared GPU buffers. |
| F08: late fallback acquires an orphaned texture reference | Release is terminal and idempotent. Async fallback honors released/disposed owners. Partial photographed loads dispose successful textures on failure. | Seven async ownership tests cover rejection after release, independent owners, library disposal, partial loads, success after release, fallback failure and disposal during recipe fetch. All released reference maps become empty. |

The numeric generator APIs remain available to explicit synchronous callers and
standalone backends. These changes preserve canonical grading rather than
substituting ungraded or placeholder heights. River preparation is transient
derived data; it does not change the save schema. Internal source clones retain
preparation for rollback, while mutable exported/input documents do not retain a
stale preparation cache.

The cache's JavaScript byte estimate is an eviction policy, not a heap reading.
Live pins and an indivisible oversized plan can exceed it and are reported.
Exact skyline arrays enter tracked resource accounting without double counting
the arrays already attached to scene geometry. Neither number is driver GPU memory.

## Validation

- **3,947 tests passed**, zero failed, skipped or cancelled, including the final
  temporary river-cache ownership cleanup; lint and production build passed.
  The changed browser QA callers also await world publication.
- The cold-city browser fixture used the frozen Eldara map, burg 18 (Cyvazin),
  1,130 planned buildings and 2,488 props, a 1280×720 viewport at DPR 1, and the
  NVIDIA Lovelace hardware WebGPU adapter. It checked import, cold player/fly
  cuts, full scenery readiness, skyline coverage, a scenic tour, ambient patch
  resolution and browser errors. The settled overview was visually inspected.
- Frozen source `a1f4859e` passed the first complete browser check: 2,885 observed
  frames, 2,416 retaining a skyline during incomplete building coverage, zero
  early hides, zero main-thread plans and zero browser errors. A repeat on
  `a61809ae` passed again after the final temporary-cache ownership cleanup:
  2,861 observed frames, 2,391 retaining coverage, zero early hides, zero
  main-thread plans and zero browser errors. Its frozen runtime archive SHA-256
  is `04ece78e13e396ea252d0e7ff8e1e5f404d5da49d4e6e08cee1f3474d0d200f9`.
- `npm run verify` passed lint, UI generation and the object, authored, extracted,
  runtime, wildlife and character asset validators, then stopped at the existing
  stale forest-recipe manifest. Required tree-impostor and resident-LOD validators
  also passed when run separately. The forest recipe mismatch reproduces on the
  pre-implementation baseline: expected signature `afa9f14a`, manifest `ee9f560b`.
  Forest recipes and baked assets were not regenerated as part of this work.

Implementation and raw local evidence are under
`tmp/performance-implementation-2026-10-21/`: `final-snapshot.json`,
`cold-functional-qa.json`, `cold-city-overview.png`, the `final3-*` logs,
`verify-final.log` and `matrix-final-rerun.log`. Frozen ordinary archives were
used to avoid concurrent checkout edits; no branch or worktree was created.
The source tree also received independent settlement-layout commits during this
work. Their visual differences are not attributed to these performance fixes.
The [compact evidence record](research/performance-remediation-evidence-2026-10-22.json)
preserves source/config fingerprints, correctness observations and the failed
acceptance status in the repository.

## Acceptance still open

The full headed matrix was attempted with its existing thresholds. Its standard
case selected hardware WebGPU and reported no browser errors, but the native
foreground monitor rejected the capture. Other cases could not activate their
owned browser windows. That standard case also reported 2,119.6 ms to full
scenery recovery, exceeding the unchanged 2,000 ms gate; its timings are not
accepted evidence. No threshold was relaxed and no missing case was counted as
a pass. Headless fallback selected WebGL and was rejected as well.

Functional GPU checks used headed Chromium with background-occlusion throttling
disabled, without controlling foreground. Their correctness observations are
useful; their frame times are not performance acceptance measurements.

An earlier standard-route baseline/candidate pair had p95 frame times of
14.08/13.30 ms and identical tracked resource totals of 377,672,532 bytes. It was
one pair, preceded the final river/import fixes, and was not isolated sufficiently
to establish a speedup. It is retained as exploratory evidence only.

- [x] Implement F01–F08 with ownership, work-count and behavior regressions.
- [x] Preserve visual settings and exact sampled/generated data in the tests.
- [x] Complete a real imported-city correctness check on hardware WebGPU.
- [ ] Resolve the pre-existing forest manifest mismatch and obtain a complete
  green `npm run verify`.
- [ ] Repeat at least two comparable baseline and final-candidate headed captures
  and pass the full matrix, kit-city, edited-world, water and camera-turn routes
  with exclusive foreground, unchanged density and full scenery recovery gates.
- [ ] Finish matched-time motion/transition comparisons and a long browser
  main/worker heap and GPU-memory soak. The deterministic cache soak does not
  replace those checks.

Use the existing commands and quality gates in [performance QA](perf-qa.md) for
the remaining acceptance work. The implementation is complete; these checks are
explicitly not recorded as passed.
