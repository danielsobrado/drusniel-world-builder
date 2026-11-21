# PR I phase I.6 — Long swell geometry evidence

Evidence for the [Phase I.6 report](../../plans/ponlai-pr-i-phase-i6-long-swell-geometry-2026-11-21.md). RTX 4080, Windows 11, Chromium, native WebGPU.

## Reproduce

Serve the working tree (`npm run dev`), then:

```text
npm run qa:ocean-fft -- --url http://localhost:5174 --out tmp/ocean-fft-qa-i6/full.json --no-benchmark
node scripts/run-coastal-review.mjs --url http://localhost:5174 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --only offshore-calm/high,offshore-calm/low --ocean-fft-inspect --out tmp/ponlai-i6/inspect
node scripts/run-coastal-review.mjs --url http://localhost:5174 --fixtures docs/qa/ponlai-pr-i-phase-i5-2026-11-21/poses.json --only calm-ref-day,wind-day,storm-day,wind-evening --out tmp/ponlai-i6/captures-on
node scripts/run-coastal-review.mjs --url http://localhost:5174 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --only offshore-calm/high,offshore-calm/ultra,cove/high --perf --out tmp/ponlai-i6/perf-on
npm run qa:water:acceptance -- --headed --url http://localhost:5174/
```

For the perf A/B, toggle `water.sea.offshoreFft.geometry.enabled` between runs.

## Contents

- `logs/ocean-fft-qa-report.json`: the GPU fixture, including `swellParity` (CPU twin vs TSL nodes on the GPU).
- `logs/inspect.json`: water WGSL texture/sampler/varying counts and hashes on high and low, with the swell on.
- `logs/perf-geometry-on-a.json`, `-off.json`, `-on-b.json`: the A / B / A′ frame timings (all focus-verified).
- `logs/water-acceptance.json`: the water acceptance run with the swell on.
- `screenshots/swell-on-*.png`: offshore reference, wind and storm at midday, and wind in the evening.
- `screenshots/compare-i5-left-i6-right.png`: the same poses as I.5 (left) and with the long swell (right).
