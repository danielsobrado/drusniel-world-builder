# Frame hitch remediation — 2026-11-26

Baseline: `3aa63757124ce78624d192efd5080b98c60c2498`.

## Implemented

- Share scene hierarchy tracking between reflection and draw preparation consumers; reference-count registry ownership.
- Remove aged streamed draw publication bypass; retain one indivisible oversized upload on an otherwise empty upload budget.
- Admit draw preparation batches using observed per-mesh CPU cost and account for attempted uploads.
- Rotate blocked cells behind untried cells, prioritize nearby cells, and rotate town LOD jobs.
- Budget geology matrix and scalar updates and publish only changed spans.
- Slice town LOD selection loops, gate resident tier transitions and interior publication, and maintain coherent near/far slot maps.
- Account for queue sort CPU work and avoid sorting terrain commits with zero allowance.
- Prefer strict reflection reservation when available; keep the existing anti-starvation fallback.
- Report frame and GPU tail percentiles.

## Remaining work and risks

TODO: General GPU buffer initialization needs ownership-aware staging for geometry, index, matrix/storage and texture resources. The pinned Three r187 backend changes layout for some attribute types; do not preallocate an arbitrary buffer as a vertex buffer.

TODO: Shader preparation still performs synchronous real-pass rendering. Validate warmup and movement-aware prefetch and per-material/pass cost scheduling on actual WebGPU. The observed-cost batch cap cannot interrupt one costly compile.

TODO: Initial town preparation and interior commits still contain indivisible work. Partition by spatial cell if measured tail exceeds the target; preserve collision and door consistency.

TODO: Reflection estimates are CPU-only; integrate non-blocking GPU timing and camera-specific vegetation selection. Keep a bounded staleness policy. Overlay reconciliation still periodically scans registry objects.

TODO: Geology uses compacted slots rather than a persistent spatial slot allocator. Add progressive cell publication, conservative bounds, and spatial batches only after visual comparison. Pending cells are retried fairly; dependency notification is not yet implemented.

TODO: Establish hard work-unit limits across remaining terrain, vegetation, resource disposal and queues; distinguish admitted oversized jobs from measured backend upload bytes.

## Acceptance

Compare the baseline and candidate on the same machine, browser, renderer, viewport, world seed, quality settings and movement script. Use the existing `npm run qa:perf` / `npm run qa:perf:windows` harnesses; run cold and warm captures for city approach/revisit, rotation, forest, coast, snow, chunk crossings and teleport, plus a long session.

Targets at 144 Hz: median <= 6.94 ms, p95 <= 8.33 ms, p99 <= 12 ms, p99.9 <= 20 ms, no streaming frames > 33.3 ms. These are proposed goals, not measured results. Record CPU/GPU pass timings, upload bytes, queue age and hitch attribution; compare visual captures and check for missing or duplicate instances.

Validation status: regression tests added, but full npm test, lint, build and RTX 4080 acceptance have not been run in the remote editing environment.
