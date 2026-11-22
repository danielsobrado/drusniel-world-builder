# FFT caustics, shelf iteration — evidence (2026-11-22)

Evidence for §4, §5 and §8 of [FFT caustics](../../plans/ponlai-pr-i-fft-caustics-2026-11-22.md). RTX 4080, Windows 11, Chromium, native WebGPU, high tier, 1600×900, water clock frozen at 126 s.

## Reproduce

Serve a frozen snapshot of the source under test, for example `node scripts/serve-world-visual-snapshot.mjs <commit> 5224`. Then run:

```text
npm run qa:ocean-fft -- --url http://localhost:5224 --out tmp/fft-caustics-shelf/ocean-fft-qa-report.json
node scripts/run-fft-caustics-review.mjs --url http://localhost:5224 --scan "2160,-10565,2320,-10565,8;2280,-10550,2280,-10610,12"
node scripts/run-fft-caustics-review.mjs --url http://localhost:5224 --poses docs/qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/poses.json --perf --out tmp/fft-caustics-shelf/captures [--strength 2.5]
node scripts/run-coastal-review.mjs --url http://localhost:5224 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --only offshore-calm/high,offshore-calm/ultra --ocean-fft-inspect [--water-patch '{"sea":{"offshoreFft":{"caustics":{"enabled":true}}}}'] --out tmp/fft-caustics-shelf/inspect
npm run qa:water:acceptance -- --headed --url http://localhost:<port of a snapshot with caustics.enabled: true>
node docs/qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/image-diff.mjs docs/qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/screenshots
node docs/qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/stretch.mjs docs/qa/ponlai-pr-i-fft-caustics-shelf-2026-11-22/screenshots shelf-plateau 300 250 1000 420
```

The captures, timings and inspection were served from `d70f9186`; acceptance from `e35fbb06`, the same tree with `caustics.enabled: true`. Both are dangling QA snapshots whose caustic sources equal `1edafc49`. The review script sets the switch explicitly for each variant.

## Contents

- `poses.json`: the two shelf poses.
- `screenshots/<pose>-{web,fft,web-repeat}.png`: caustics off, on, then off again.
- `screenshots/<pose>-stretch.png`: bed crops with levels ×5 (`stretch.mjs`), web / FFT / web from top to bottom.
- `screenshots/steps/`: the FFT at `shelf-plateau` on the way to the shipped law: shelf band with the old 0.5·√r texel, the same at strength 2.5, and a 0.25·√r texel.
- `logs/ocean-fft-qa-report.json`: the GPU fixture with the shipped law, every case.
- `logs/texel-law-experiment.json`: the candidate texel laws, compared in the same fixture.
- `logs/underwater-captures-and-perf.json`: capture states and the focus-verified A/B/A timings.
- `logs/inspect-{off,on}.json`: underwater post and water WGSL hashes, trimmed.
- `logs/shelf-bathymetry-scan.txt`: bed depth and shore distance across the shelf.
