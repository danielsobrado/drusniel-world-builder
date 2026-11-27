# WSC closeout — §5 budgets and acceptance gates (2026-11-27)

The roadmap's §5 gates, measured against what each WSC PR (1–9) left on `main`. Hardware: RTX 4080,
`qa:perf --headed --qa diagonal --density dense-mixed --warmup 8 --duration 14`, served from a clean
export of `98fab99f` plus this change, so other sessions' uncommitted work was not in the build.

## How to A/B the WSC

- `node scripts/run-perf-qa.mjs … --wsc 0` (URL `?wsc=0`) leaves the WSC window unbuilt: no field
  rebuild, no upload, `validity 0` everywhere, so every receiver takes its pre-WSC path. The shaders
  still contain the WSC nodes, so this arm measures the CPU and upload, not shader compilation.
- `parse-perf-qa.mjs` prints `wsc cpu ms/frame` (`wscUpdateMs` over the measured frames) and the
  number of uploads (`wscUploads`); `wscBuildSlices` counts frames a build was spread over.

## Gates

| Gate | Budget | Measured | Status |
|---|---|---|---|
| WSC CPU field rebuild | < 0.5 ms amortised/frame | 0.22 and 0.32 ms/frame (two valid runs, 35–37 rebuilds in 14 s of running) | Met |
| …per rebuild (60 FPS floor) | — | ~10–11 ms each, on the frame it happened | **Fixed here**: every budgeted build is now sliced to 4 ms (was cold builds only); not yet re-measured on hardware |
| WSC GPU upload | < 0.25 ms amortised/frame | 256 KiB per upload (`RGBA16F` geo + 2 × `RGBA8`), 5.7–7.5 KiB/frame amortised | Met by size (upload time not isolated) |
| Incremental GPU shading | < 0.5 ms typical, < 1.0 ms p95 | Median frame unchanged with WSC on vs off (8.5/8.4 ms, 6.0/6.0 ms); mean +0.5–0.9 ms, carried by the rebuild spikes above | Not isolated: needs a shader variant without WSC nodes, which `?wsc=0` does not build |
| Extra per-material samplers | 0 | 0: all three WSC textures are read through `bilinearTexels` (`texture(…).setSampler(false)`, a `textureLoad`) | Met (static) |
| Streaming hitch regression | none beyond `qa:perf` thresholds | Post-warmup hitches 18 vs 16 and 17 vs 16 (on vs off); p99 60 vs 40 ms and 32 vs 27 ms | Within noise on hitch count; the p99 gap is the rebuild spike the slicing addresses |
| Visual gates (`qa:wsc:pr0` rerun) | ΔE00 / LOD / origin / validity | Each PR re-measured its own scenes (pr-02 … pr-09 READMEs); the full 215-shot rerun did not boot (see below) | Open |

## What could not be run

The machine was shared with three Unity editors and other agents' desktop automation the whole
afternoon. Headed Chrome lost foreground focus mid-run and was throttled to ~1 FPS (15 frames in
12 s, `the headed browser lost foreground focus`); headless Chrome has no WebGPU here. That left two
valid pairs (above), whose absolute FPS drifted 88 → 130 between pairs, so only paired, same-arm-order
deltas are quoted. The `qa:wsc:pr0` rerun timed out waiting for the page to boot for the same reason.

To close the open rows on a quiet machine:

```
npm run dev -- --port 5301 --strictPort
node scripts/run-perf-qa.mjs --headed --qa diagonal --density dense-mixed --warmup 8 --duration 14 --wsc 1 --url http://localhost:5301
node scripts/run-perf-qa.mjs --headed --qa diagonal --density dense-mixed --warmup 8 --duration 14 --wsc 0 --url http://localhost:5301
npm run qa:wsc:pr0 -- --url http://localhost:5301
```

Alternate the two arms at least three times. The sliced rebuild should take p99 toward the
`--wsc 0` arm and show `wscBuildSlices` > 0 with `wsc cpu ms/frame` unchanged.
