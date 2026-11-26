# r187 P2 evaluation — depth-only occlusion and prioritized requests

Date: 2026-11-26 | Decision: **neither promoted; both stay opt-in.**
Source: frozen snapshot of `f87676a5` served by `scripts/serve-world-visual-snapshot.mjs` on port 5264,
so concurrent edits in the shared checkout could not change an arm mid-run.
Hardware: RTX 4080 16 GB, driver 617.14, Windows 11 Pro 26300, headed Chromium (Playwright), WebGPU
(`meta.renderer.revision` 187). One run per arm; arms run back to back with identical commands.
Roadmap: [Three r187 roadmap](../../plans/three-r187-improvement-roadmap-2026-11-26.md) §7 (PR 03), §10 (PR 06).

## Culling arms (PR 03)

`npm run qa:perf -- --url <arm> --headed --qa settlement-approach --settle --revisit --turn-on-revisit --gpuTimings 1`

| Arm | Colour attachments | Avg FPS | Frame p50 / p95 ms | Hitches | GPU p95 ms | Proxy pass GPU ms | Submit CPU p95 ms | Draws | Triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ordinary draws | — | 57.7 | 15.05 / 34.6 | 57 | 8.71 | — | 15.3 | 389 | 55.2 M |
| Hi-Z, colour target (`?gpuOcclusion=1`) | 1 | 57.5 | 15.9 / 34.3 | 55 | 7.32 | 0.41 | 13.3 | 322 | 48.0 M |
| Hi-Z, depth-only (`&r187DepthOnlyOcclusion=1`) | 0 | 56.0 | 15.6 / 34.25 | 44 | 7.55 | 0.22 | 16.0 | 320 | 47.9 M |

- The depth-only target allocated with zero colour attachments, so the arm is valid. It halves the
  proxy pass's own GPU time (0.41 → 0.22 ms), but the whole-frame GPU p95 is within run noise
  of the colour-target arm.
- Hi-Z itself cuts GPU p95 by 16% and drops about 17% of draws and 13% of triangles, but the route is
  CPU-bound: frame p50 rises by ~0.6–0.9 ms and average FPS does not improve. Per frame, occlusion
  prepare costs ~1.2 ms of CPU, while the main pass gets ~1.4 ms cheaper (7.22 → 5.75 ms). The
  `renderScene*` counters accumulate over the whole session, including warmup and settle, so
  divide by their call count; the proxy render alone is ~0.5 ms.
- Gate (§7): 15% p95 improvement in the occlusion-heavy scene with no >5% standard-path
  regression. GPU time passes; frame time does not. With frame p95 at ~34 ms in every arm, the
  hard 60 FPS floor is limited by CPU and streaming hitches, not GPU raster.

**Decision:** keep `renderer.gpuOcclusion.enabled` and `r187.depthOnlyOcclusion` off. If Hi-Z is
enabled later, enable it with the depth-only target, which has the cheaper proxy pass.

### Follow-up: prepare CPU split and the duplicate scene walk (`04fffd75`)

A CPU profile of the depth-only arm split prepare (1.19 ms/frame) into collect 0.65, proxy render
0.45 and dispatch 0.10 ms. About a third of collect was `scene.updateMatrixWorld()`, which the main
pass then repeated in full. Once-per-mesh bounding-box scans of newly streamed settlement meshes
appeared too, but they are load-time costs, not per-frame ones. `04fffd75` skips the main pass's
walk on frames where collect already did it, and adds the accumulated counters
`gpuOcclusionPrepares`, `gpuOcclusionPrepareCpuMs`, `gpuOcclusionCollectCpuMs` and
`gpuOcclusionDispatchCpuMs`. The profile confirms the walk is gone from the draw path; the
remaining walks are streamed-preparation prewarms.

Same route, frozen snapshots, interleaved, two runs each (control `74a3df4e`, candidate `04fffd75`):

| Arm | Avg FPS | Frame p50 / p95 ms | Main pass CPU ms | Proxy CPU ms | GPU p95 ms | Draws |
| --- | --- | --- | --- | --- | --- | --- |
| Candidate, no occlusion | 70.95 / 71.49 | 13.1 / 16.9, 13.0 / 20.6 | 5.19 / 5.06 | — | 7.30 / 7.22 | 411 / 410 |
| Control, depth-only Hi-Z | 68.56 / 66.97 | 13.7 / 17.3, 14.0 / 19.0 | 4.95 / 6.22 | 0.39 / 0.39 | 7.37 / 7.33 | — |
| Candidate, depth-only Hi-Z | 68.21 / 70.09 | 13.8 / 17.1, 13.4 / 16.5 | 4.88 / 4.66 | 0.41 / 0.39 | 7.35 / 7.31 | 340 / 339 |

The whole route is faster on this `main` (~71 FPS) than in the first round (~58 FPS), and GPU p95
no longer differs between culled and unculled. Culling still saves ~0.4 ms of main-pass CPU, but
prepare costs ~1.1 ms, so Hi-Z remains a net loss on this route and stays off. The change keeps
the opt-in path cheaper and has no effect while occlusion is off. Hi-Z can only pay where the frame
is GPU-bound and dense with occluded geometry; re-evaluate it on such a route before more CPU work.

## Asset request arms (PR 06)

`npm run qa:assets:startup -- --url <arm> --headed --runs 3` (fresh context, cache disabled)

| Arm | Assets ready median ms | First frame median ms | KTX2 summed task median ms | Failed / cancelled |
| --- | --- | --- | --- | --- |
| Default | 14 226 | 61 003 | 11 948 | — |
| `?r187PrioritizedRequests=1` | 13 309 (−6.4%) | 59 276 (−2.8%) | 9 711 (−18.7%) | 0 / 0 |

The prioritized queue peaked at its 6-request limit, with a longest queue wait of 174 ms and no failures.
The first frame is dominated by the snapshot's cold Vite compile, which both arms share.

- Gate (§10): 20% readiness improvement. Measured −6.4%: below the gate.

**Decision:** keep `r187.prioritizedRequests` off. It is safe to enable (no failures, no
regressions), but its benefit has not met the gate.

## Not covered

Single run per arm. No forced-WebGL arms, near-plane, 180° turn, reflection/shadow views,
teleport or rebase checks for culling. No warm-cache (`--repeat-cache`) or shaped-network asset runs.
No visual review for culled objects missing from the image. Raw reports were in `tmp/r187/`, which is
not committed.
