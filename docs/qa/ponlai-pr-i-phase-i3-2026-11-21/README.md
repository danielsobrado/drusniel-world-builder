# PR I phase I.3 — World sampling evidence

Evidence for the [Phase I.3 report](../../plans/ponlai-pr-i-phase-i3-world-sampling-and-quality-2026-11-21.md). RTX 4080, Windows 11, Chromium, native WebGPU.

## Reproduce

Serve the working tree (`npm run dev`), then:

```text
npm run qa:ocean-fft -- --url http://localhost:5174 --out tmp/ocean-fft-qa-i3/full.json
node scripts/run-coastal-review.mjs --url http://localhost:5174 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --only offshore-calm --ocean-fft-inspect [--query oceanFft=1] --out tmp/ponlai-i3/inspect-on
node scripts/run-coastal-review.mjs --url http://localhost:5174 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --only offshore-calm/high,offshore-calm/ultra,cove/high,cove/ultra --perf [--query oceanFft=1] --out tmp/ponlai-i3/perf-on
```

## Contents

- `logs/ocean-fft-qa-report.json`: the full isolated-fixture run: orientation, seam, mip, rebase, teleport and sampling-cost cases, capture metadata (`scene.captures`), live GPU allocations, and the source commit with a dirty-tree flag. Its one console error is the deliberate simulated device loss.
- `logs/inspect-on.json`, `logs/inspect-off.json`: per tier, the runtime state, the slot-origin check and the water WGSL texture/sampler/varying counts and hashes, with and without `oceanFft=1`.
- `logs/perf-off-a.json`, `logs/perf-on.json`, `logs/perf-off-b.json`: frame timings of the A / FFT / A′ runs (from `b5935abd`), trimmed to timings and counters.
- `screenshots/`: 15 fixture captures (slope visualization, not the water material):
  - top-down: `world-origin`, `negative-xz`, `top-down-chunk-corner`, `huge-positive`, `rebased-render-origin`
  - other angles: `low-altitude`, `grazing-horizon`, `high-altitude`
  - grazing debug views: `grazing-slope-x`, `-slope-z`, `-normal`, `-mip-level`, `-unresolved`, `-resolved`
  - `fft-disabled`
