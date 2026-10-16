# Grass performance results — October 16, 2026

Implements Phases 0–3 of the
[execution plan](plans/grass-performance-preserve-quality-2026-10-16.md).
Blade count, stem identities, LOD thresholds, fades and shaders are unchanged;
only how the same stems are prepared, sent and published changed.

Machine-readable medians, per-run values and raw-report hashes:
[ab-summary.json](qa/grass-performance-preserve-quality-2026-10-16/ab-summary.json).
Raw reports are in ignored `tmp/grass-perf/`.

## Method and limits

Native Windows, headed Playwright Chromium on hardware WebGPU, 1280×720, the
plan's diagonal route: `--warmup 8 --duration 12 --settle --drain-seconds 20
--grass-diagnostics`, three standard and three `--density high-grass` runs per
set, interleaved. Another session ran its own GPU captures on this machine at
the same time, so **FPS spread is large (A standard: 70–121 FPS) and FPS
differences are inconclusive**. One baseline high-grass run (34 FPS) is
clearly contaminated. Worker, clone and publication counters are measured on
the CPU and do not depend on GPU contention.

## What the new diagnostics showed (Phase 0)

New counters in `measuredCounters`: worker execution time (measured in the
worker), main-thread post/clone time, cloned bytes, worker idle gaps,
completion-to-publication wait, publication deferrals by cause, page repack
bytes, layer build turns.

Baseline, standard route, 12 s window:

- 777 jobs, **1.07 s** total worker execution (1.4 ms/job) against **31.7 s**
  of combined idle gaps: workers were ~95 % idle. Ranks prepared were the same
  in every set, so compute was never the bottleneck.
- Each job structured-cloned ~59 KB (the whole 128 m terrain page for an 8 m
  tile), 47 MB in total.
- A completed result waited **87–200 ms** before publication. The cause was
  the one-publication-per-layer-per-frame cap: **~27,000 cap deferrals versus
  248 deadline deferrals**.
- 84 % of marked attribute upload bytes (653 of 775 MB) were page repacking —
  later tiles rewritten when an earlier tile leaves a 16-tile page — not new
  grass (133 MB).

## Changes kept

**Phase 1 — pipelined shared dispatch** (`MeadowCompactionPool.js`). Each
worker may hold two jobs; the second waits in the worker's own message queue.
Either layer may use either worker (least loaded, ties stay home), but one
slot always stays free for the other layer, so cards wait at most one blade
job. No queue beyond the four slots; cancellation, promotion, failure fallback
and stale-result rejection are unchanged.

**Phase 2 — shared ground inputs** (`MeadowSharedGroundInputs.js`). The page,
canopy grid, growth/look tables, eligibility, path settings and seed are sent to
a worker once per content identity and referenced by key afterwards. The key
is built from object identity plus page revision, so a replaced settings
object, canopy grid or page and every terrain edit get a new key. The main
thread mirrors each worker's LRU (24 entries, 6 MB) and sends evictions in
message order; because a worker processes messages sequentially no pinning is
needed. Live terrain and published prefix buffers are never transferred.

**Phase 3 — byte-bound publication allowance** (`MeadowGrassField.js`).
Per layer and frame: up to four publications within 768 KB, replacing one
publication within 4 MB. A dense tile (~560 KB) still publishes alone and one
oversized tile may always progress, so the worst-case frame is unchanged for
dense bands; small sparse and card tiles no longer wait a frame each.

## Results (medians of three runs)

| Set | Route | Cloned KB/job | Result → publish wait | Cap deferrals | In-view missing / below density at stop | Grass ready after stop | FPS | p95 ms | Hitches |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A baseline | standard | 59.1 | 124 ms | ~27,000 | 10 / 5 | 1.74 s | 107 | 14.3 | 8 |
| B (1+2) | standard | 20.9 | 99 ms | — | 7 / 10 | 1.87 s | 118 | 12.2 | 3 |
| E (1+2+3) | standard | 20.9 | **1.6 ms** | **30** | **3 / 0** | **0.18 s** | 114 | 13.3 | 3 |
| A baseline | high grass | 124.5 | 202 ms | — | 7 / 4 | 1.75 s | 74* | 28.5* | 15* |
| B (1+2) | high grass | 83.4 | 113 ms | — | 3 / 3 | 1.93 s | 113 | 13.0 | 4 |
| E (1+2+3) | high grass | 83.6 | **17 ms** | 1,100 | 4 / 3 | **0.55 s** | 109 | 13.0 | 4 |

\* includes the contaminated 34 FPS baseline run; the other two were 74 and
114 FPS.

Main-thread post time roughly halved (A ≈ 59 ms → B ≈ 27 ms per 12 s on the
standard route). High-grass jobs still clone ~83 KB because the previous
promotion prefix is sent with them; reducing that is a remaining Phase 2 item.

Correctness captures on E: revisit with a 180° turn, edited world and chunk
crossing all had zero browser errors and zero worker failures, recovered, and
the revisit ended with zero in-view missing or below-density blade tiles.

## Experiment reverted

**Run-based page layout** (set C). A tile was allowed to occupy several stem
runs so a retiring tile's hole could be filled from the page tail instead of
shifting every later tile. Correct in a randomized churn test, but it
fragmented without bound (one tile reached 167 runs), and scattered ranges
collapse into one whole-page span in `markAttributeSubrangeUpdated`: marked
uploads rose to 1.2–2.4 GB per 12 s against 0.78 GB. Reverted; the repack
counter stays. A bounded variant would need hidden filler stems or per-tile
split caps and the remaining prize is ~0.5 MB of uploads per frame, so it is
not pursued.

## Still failing / next

Full scenery still first becomes ready ~3.1–3.4 s after stopping (gate: 2 s).
Grass is no longer the blocker: at the stop the tree-manifest (21 jobs,
oldest ~1.5 s), rock-manifest (14–20) and flower (9–11) queues remain. That is
placement-manifest scheduling, outside grass, and needs its own attribution.
The full hardware matrix and the deterministic visual fixtures were not run in
this pass; stem data is unchanged (worker output parity tests), but publication
timing changed.

`npm run verify` passed on the final candidate (3,711 tests and the production build).
