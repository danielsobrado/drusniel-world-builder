# Critical-path review fixes — 2026-10-19

The supplied review against `e94bdc05` identified four supported runtime costs
and a release-validation gap. Runtime fixes are in `7d8aa03f` on `main`.
**Hardware frame pacing and scenery recovery remain unverified**, following the
user's instruction to finish without the remaining foreground timing runs.
No density, LOD distance, terrain ID or visual quality setting was reduced.

## Findings and changes

1. **Synchronous settlement planning in the view and skyline.** Both now request
   canonical version-7 plans through the existing prioritized terrain worker
   pool. Each ID has its own request namespace and cancellation. World/store
   revisions invalidate pending requests, and late responses cannot repopulate
   evicted sites. Main-thread plan-grid installation yields between buildings
   and street segments; the view adopts the complete plan and index together.
   Unavailable, mismatched or failed plans block readiness with an explicit
   error. The deterministic planner itself, footprint grading and street masks
   are unchanged. Existing synchronous terrain-query APIs retain their contract;
   this is not a claim that every possible main-thread caller of `ensurePlan`
   has been removed.

2. **Whole-town instance selection and buffer comparisons.** Classification and
   stale-row retirement now run in resumable slices of at most 32 placements or
   retained IDs. The shared deferred-work gate is checked between slices and
   prototype publications. Each prototype retains near/far membership and ID to
   row indices; changed rows use local writes and tail swaps. Complete prior
   rows remain visible while work waits. Fade progression uses elapsed time per
   placement. Newly allocated tiers and anchor recentering still require a full
   write of that prototype, and staged capacity retains the old tier with its
   own coordinate anchor. Ordinary origin placement moves mesh roots without
   rewriting the retained instance matrices. Selection work is included in
   readiness.

3. **Grass retirement, repacking and metadata outside the source allowance.**
   A separate actual-write ledger accounts for all companion arrays across each
   layer's pages, including retirement repacks and reveal/origin metadata. A
   page predicts its writes before changing the published packed buffers. Pages
   that cannot commit retain their previous complete publication and expose
   pending work to readiness; coverage checks inspect the GPU publication rather
   than merely the new CPU source. Entirely retired pages can hide and recycle
   without uploading. Existing equal-size tail-hole reuse, dense LOD transfers,
   page capacities and stem sampling remain intact.

   The 768 KiB allowance is **not a universal hard ceiling**: one indivisible
   oversized page can progress on an otherwise empty update, as oversized source
   tiles could before. Mandatory origin metadata maintenance is also charged
   and may exceed the allowance; optional publication then waits. Counters expose
   both exceptions. This prevents several costly pages from silently repacking
   together; it does not prove that the cost of one large page meets the frame
   target. Stable-slot or shader-indirection redesigns remain contingent on
   hardware evidence.

4. **Broad LOD invalidation after an editor object edit.** Placement publication
   retains controller history and marks changed IDs. A still-camera evaluation
   revisits changed placements, active transitions and affected selected IDs.
   Unaffected band versions persist. Publishers use dirty row indices when the
   previous version matches, and fall back to a full write after missed versions
   or replacement capacity. Local matrix changes conservatively expand instance
   bounds without reading unrelated matrices. Camera changes still evaluate the
   full renderer. Detecting changed placement records and existing foundation
   publication can still scan the group; the entire editor update is not O(1).

5. **Unverified release acceptance.** The direct runner now fails after saving
   reports whose initial or revisit settling timed out. The default matrix adds
   imported settlement approach and a same-browser revisit with a 180-degree
   camera turn. Matrix gates require the town workload and revisit to be active
   and retain the existing frame, collision and meadow recovery requirements.
   Matrix summaries preserve measured work/upload counters and revisit reports.
   These harness changes close reporting gaps; they do not supply missing
   hardware acceptance evidence.

## Deterministic comparison

The same Node workloads ran against frozen source `b2a23b9f` and candidate
`7d8aa03f`. The baseline includes the concurrent biome-snow commit that arrived
after the original checkout at `a8047f7a`. This comparison measures work counts,
not FPS, driver transfers or frame latency. Raw results with full source SHAs:
[critical-path-work-counts-2026-10-19.json](research/critical-path-work-counts-2026-10-19.json).

| Workload | Baseline | Candidate |
| --- | ---: | ---: |
| One edit in 256 objects: classified placements | 256 | 1 |
| Same edit: matrix rows read by the instance writer | 256 | 1 |
| Same edit: published LOD bands | 3 | 1 |
| 1,000-placement city: largest classification unit | 1,000 | 32 |
| Settled city selection: matrix rows read | 1,000 | 0 |
| Settled city selection: total classified over the whole cycle | 1,000 | 1,000, spread over slices |
| Variable-size retirement: repack bytes per update | 3,010,560 | 1,010,688; 1,003,520; 996,352 |
| Grass stems after retirement completes | 57,216 | 57,216 |

The grass fixture starts with 48 populated tiles across three pages and removes
one differently sized tile from each page, forcing the variable-count repack
path. Candidate pages exceed the nominal allowance individually and therefore
publish alone. Total copied bytes stay identical; the burst is spread over
three updates. Existing equal-sized hole reuse is tested separately.

Reproduce without another branch or worktree:

```bash
mkdir -p tmp/critical-path-baseline
git archive b2a23b9f src | tar -x -C tmp/critical-path-baseline
node scripts/measure-critical-path-work.mjs tmp/critical-path-baseline tmp/critical-path-work.json
```

## Validation and remaining acceptance

Follow-up, 2026-10-20: the atlas was rebaked and full production verification now
passes, including 6,941 tests. See the
[second review report](critical-path-second-review-fixes-2026-10-20.md).
The results below remain the historical record of this October 19 pass.

- Full `npm test`: **6,926 passed**, zero failures, skips or cancellations.
- `npm run lint`, `npm run build`, `npm run check:natural-ui` and diff checks
  passed. Build retains the existing large-chunk advisory.
- New regressions verify exact worker/canonical plan equivalence and terrain
  masks, bounded index installation, stale-response rejection, queue namespace
  isolation, dense-town slices, origin stability, one-row object edits,
  variable-count grass recovery, charged origin metadata and settling gates.
- Native Windows Chromium rendered a small WebGPU instance fixture from the
  frozen `7d8aa03f` server on NVIDIA Lovelace with zero browser errors. Pixel
  checks passed for initial placement, a one-row move with other rows retained,
  and tail-swap removal/count shrink. This tests the changed writer's backend
  behavior, not whole-world appearance or frame pacing. Retained result:
  [critical-path-gpu-smoke-2026-10-19.json](research/critical-path-gpu-smoke-2026-10-19.json).
- `npm run verify` stopped at production tree-atlas source provenance:
  `StylizedTreeView.js` changed in concurrent commit `b2a23b9f`, but the existing
  atlas manifest still describes its previous source. No source-hash override
  or stale-atlas acceptance was added. The remaining unit/build stages were
  run independently as listed above. An atlas rebake and complete production
  asset validation remain required on the integrated release.

No current-commit hardware matrix, valid foreground CPU profile or two-second
scenery recovery claim is made. Release validation still needs the exact-source
headed hardware matrix, settlement cold preparation and traversal/revisit,
grass movement/reversal/LOD/teleport churn, editor-object changes, cold startup
and save/reload checks. The existing settlement route prepares its target plan
while deriving the approach street, so that route alone does not measure a cold
planner invocation; the canonical-worker regression covers that code path here.
Keep density, quality, settling, native focus and recovery gates unchanged.
