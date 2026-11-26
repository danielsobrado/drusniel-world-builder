# WSC PR 5 QA — Ground Contact Deformer (2026-11-26)

Hardware: NVIDIA GeForce RTX 4080, headed Chromium WebGPU, `npm run dev`.

## Performance A/B

`npm run qa:perf -- --headed --qa diagonal --density dense-mixed --warmup 8 --duration 14 --settle`

| Run | Variant | avg FPS | dt p50 / p95 (ms) |
|---|---|---|---|
| A1 | unmodified `main` | 89.35 | 10.5 / 14.1 |
| A2 | unmodified `main` | 88.85 | 10.6 / 14.6 |
| A3 | unmodified `main` | 87.43 | 10.8 / 15.0 |
| D1 | PR 5 (plants hug + rocks settle) | 89.10 | 10.7 / 14.0 |
| D2 | PR 5 | 86.94 | 10.8 / 15.0 |
| D3 | PR 5 | 87.40 | 10.75 / 15.0 |

Mean 88.54 vs 87.81 FPS (≈ 0.09 ms); the paired A3/D3 runs are identical.

### Rejected: WSC residual on tree trunks

| Run | Variant | avg FPS |
|---|---|---|
| B1–B4 | PR 5 + trunk residual (0.8 m band) | 86.47 / 86.08 / 85.83 / 86.21 |
| C1 | trunk and rock conform off | 89.37 |
| C2 | trunk residual only | 82.86 |
| C3 | trunk residual, 0.1 m band | 86.49 |

Bisection put the whole cost on trunk vertices (~850 near trees × main + shadow
cascades). `TreeRootFitter` already sinks root plates below every exact terrain
sample, so the trunk conform was removed rather than optimised.

## Visual

`node scripts/run-wsc-pr4-qa.mjs --out <dir>` was run on both arms: the B14
trunk/understory, B03 debris and B16/B17 rock captures are visually identical (no
regression). Those scenes are flat, so the "no floating rims on slopes" gate is
covered by the CPU-mirror tests in `tests/worldSurfaceContextPr5.test.js`; a
convex-slope boulder capture is still to be added.
