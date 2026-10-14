# Runtime performance review — 2026-10-13

Reviewed the frame loop, streaming and preparation paths, collision residency,
and simulation queries on `main`, starting from clean commit
`9fb5ba6b8fe3b2b12ab008546f14c015cc57f4de`. This review fixes five verified
sources of unnecessary work. It does not establish that all frame-time targets
are met throughout the application.

## Findings and fixes

1. **Local collision updates copied the entire collider registry.** Both owner
   replacement and unload allocated a full `Map` of every resident collider.
   Replacement now stages only changed entries and affected spatial chunks;
   unload stages affected chunks. Neither publishes until chunk construction
   succeeds. Failures still retain the previous registry, readiness, and revision.
2. **Small movement queries scanned every resident collision chunk.** The query
   now looks up the intersected chunk rectangle when that rectangle is smaller
   than the resident set. Large/teleport queries retain the bounded resident scan.
   Inclusive boundaries, mirrored Z coordinates, deterministic ordering, and
   cross-chunk deduplication are preserved.
3. **Per-frame composition gauges recounted every collider.** Primitive/mesh
   counts now reuse the world's revision. Prototype BVHs remain checked live,
   because their resources can be disposed without a collision-world edit.
4. **Natural-provider diagnostics repeatedly summed unchanged chunk data.**
   Component totals are cached and invalidated on commit, unload, and disposal.
   Queue and error diagnostics remain live; reading status no longer rescans
   loaded chunks just to count colliders.
5. **Opportunity visibility used a quadratic hidden-record scan.** The visible
   records are already a subset of the unique query results, so hidden count is
   the difference in lengths. Public/discovered visibility, actor filtering,
   deterministic ordering, and immutable DTOs remain unchanged.

## Reproducible isolated measurements

Run `node scripts/benchmark-runtime-hotpaths.mjs [report-path]`. The benchmark
uses 256 chunks with 64 colliders each and 10,000 opportunities, warms each
operation, and reports the median of five batches. These are Node CPU timings,
not gameplay FPS measurements. The baseline used the same benchmark body with
the original runtime modules, before applying these fixes.

| Operation | Before, ms/call | After, ms/call |
| --- | ---: | ---: |
| Local query with 16,384 resident colliders | 0.001075 | 0.000175 |
| Composition gauges with 16,384 colliders | 0.039924 | 0.000158 |
| Replace 64 of 16,384 colliders | 1.355507 | 0.123209 |
| Visibility DTO for 10,000 opportunities | 140.000620 | 3.954220 |

Raw benchmark results are retained locally in
`tmp/performance-review/benchmark-before.json` and `benchmark-after.json`.

## Verification

`npm run verify` passed: lint, generated UI checks, production asset validation,
all **3,551 tests**, and the production build. The build still warns about large
bundles and plugin timing. The benchmark script also passes ESLint.

The new regression tests count visited chunks, registry entries, and entity IDs,
so they catch a return of the scaling defects without timing thresholds. They
also exercise collision seam queries against a brute-force oracle, rollback
after spatial-bin construction failures in replacement and unload, cache
invalidation, BVH disposal, and visibility rules. Four collision work-count
assertions failed against the original implementation and pass with the fixes.

The two original NVIDIA Lovelace WebGPU movement captures settled successfully:
117.63/109.64 FPS, frame p95 13.6/14.8 ms, 1/7 hitches, and zero browser errors.
The first changed-runtime capture retained the same collision signature
(`35d20c90`) and had zero browser errors, but vegetation preparation timed out
with 84 draws pending. Its 91.38 FPS is **not valid performance acceptance**.
A subsequent stationary capture settled and recovered successfully. Investigation
continues alongside the persistent grass-coverage issue reported on October 14;
no end-to-end FPS improvement is claimed from these captures.

## October 14: persistent grass coverage and preparation fairness

The reported middle-distance gaps remained while standing still. A settled
world capture also showed thin bands with zero missing tiles or capacity-lag
tiles. The blade population falls from 10,000 to 1,936 stems per tile at 14 m
and to 484 at 30 m; widening is capped at 3.5. Previously the card layer only
started appearing at 40 m. Matching screen-door masks do not preserve coverage
between independently placed blades and cards with different silhouettes.

Cards now arrive across the first blade density reduction (9.2–14 m with the
shipped settings), while blades retain their 40–50 m outgoing fade. Both shader
uniforms and card-tile selection use the incoming range, including configurations
with smaller card tiles. Blade counts, geometry detail, draw distances, wind,
and terrain/biome sampling are unchanged. The existing card geometry supplies
the additional coverage; earlier visibility does increase fragment work.

The timed-out performance capture also exposed draw-preparation starvation:
84 draws remained pending while earlier queues repeatedly consumed the shared
allowance. Draw preparation now reserves a turn after waiting four frames,
before the earlier queues run, and uses that reservation in the late render
phase. This spends the same shared allowance rather than granting another
per-queue minimum. Existing publications stay visible while replacement
materials prepare.

The scheduling regression reproduced zero publications under sustained earlier
work before the fix, then three publications in twelve frames after it, with
the same 0.25 ms shared allowance. Grass tests evaluate the actual material mask
graph, verify full card coverage in the sparse bands, exercise small-tile
selection, and cover custom distances and endpoint transitions.

The complete `npm run verify` passed again: **3,555 tests**, lint, generated UI
checks, production asset validation, and the production build.

Frozen-camera/wind A/B captures in three directions show the incoming cards
filling the thin middle-distance coverage. The scene settled in 24 seconds,
with no browser errors, missing tiles, or density-lag tiles. The same scene
retained 299,805 blades, 215,734 cards and 2,083,515 grass triangles. Images and
state are retained in `tmp/performance-review/grass-{before,after}-*.png` and
`grass-visual-final.json`. These are visual checks, not FPS benchmarks.

The first final NVIDIA Lovelace WebGPU diagonal capture (`after-2.json`) settled
in 23.1 seconds and measured **157.66 FPS, 8.3 ms frame p95, zero hitches** over
12 seconds, with no browser errors. Collision retained signature `35d20c90`.
At the movement endpoint 55 meadow tiles still needed preparation, as in both
baselines; the complete scenery queue drained 2.255 seconds after stopping
(baseline 5.710/8.994 seconds). Persistent distance-coverage gaps and transient
streaming lag are distinct: this change does not eliminate the latter.

The earlier baselines were 117.63/109.64 FPS with 13.6/14.8 ms p95. These figures
show that the final capture meets the frame gate, but do not isolate a percentage
FPS gain from these changes: browser/GPU contention from other sessions is not
controlled. The isolated work-count regressions and benchmark above establish
the collision/query scaling improvement independently.

### Dense grass upload bursts

The first full matrix passed standard, dense forest, dense mixed, construction,
and water, but high grass failed the hitch-rate gate: 35 hitches / 1,256 frames
(2.79%), 17.375 ms p95. Its hitch frames included roughly 10.5 MB of grass
attribute updates and 4.0–4.5 MB of new buffers in a single frame. Cached LOD
prefixes were published during layout refresh with no allowance for the GPU
uploads that publication triggers. CPU compaction timing alone did not bound
this work.

Meadow publication now admits up to 4 MiB of new source attributes per layer per
update, preferring in-view, nearer tiles. Already-prepared LOD changes use this
same allowance. A single oversized tile is allowed to progress; repacking and
retirement writes can add to the total GPU bytes, so this is not a hard cap on
all renderer uploads. Waiting transitions retain the previous grass and
completed rebuilds retain ownership of their old buffers until publication.
Density, sampling, and draw distance are unchanged.

The regression reproduces a 93,184-byte publication burst against a 14,336-byte
test allowance, then verifies bounded publication and eventual full readiness.
It also exercises ground revisions and an oversized tile, checking that pooled
buffers never overwrite grass still awaiting replacement. The failed matrix
and original high-grass report are preserved in
`tmp/performance-review/matrix-before-upload-fix.json` and
`high-grass-before-upload-fix.json`.

Commands used:

```sh
node scripts/run-perf-qa.mjs --headed --qa diagonal --warmup 8 --duration 12 --settle --drain-seconds 15 --out tmp/performance-review/before-1.json
```

Repeat with a unique output filename. Raw JSON reports and logs are retained in
`tmp/performance-review/` (ignored by Git).
