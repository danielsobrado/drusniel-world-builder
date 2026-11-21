# PR I phase I.8 — QA and rollout evidence

Evidence for the [Phase I.8 report](../../plans/ponlai-pr-i-phase-i8-qa-and-rollout-2026-11-21.md). RTX 4080, Windows 11, Chromium 151, native WebGPU, 1600×900. All browser runs used a frozen snapshot of `8bb0106b`.

## Reproduce

```text
node scripts/serve-world-visual-snapshot.mjs 8bb0106b 5217
node scripts/run-coastal-review.mjs --url http://127.0.0.1:5217 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --only offshore-calm/high,calm-motion,windy,storm,exposed/high,curved-coast/high,cove/high,headland/high,rocky/high --ocean-fft-inspect [--water-patch '{"sea":{"offshoreFft":{"enabled":false,"geometry":{"enabled":false}}}}'] --out tmp/ponlai-i8/captures-on
node scripts/run-coastal-review.mjs --url http://127.0.0.1:5217 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --perf [--water-patch …] --out tmp/ponlai-i8/perf-on-a
npm run qa:ocean-fft -- --url http://127.0.0.1:5217
npm run qa:water:acceptance -- --headed --url http://127.0.0.1:5217/
```

## Contents

- `screenshots/on/`, `screenshots/off/`: 8 places, all PR I features on (shipped) vs off.
- `screenshots/compare-*.png`: side-by-side sheets, off on the left.
- `logs/captures-on.json`, `logs/captures-off.json`: per pose, the FFT state, slot-origin check and water WGSL texture/sampler/varying counts and hashes.
- `logs/perf-on-a.json`, `perf-on-b.json`, `perf-off.json`: frame and GPU timings (A / A′ / off); `off/medium` was rejected for focus loss.
- `logs/ocean-fft-qa-report.json`: the full GPU fixture, including compute timestamps, lifecycle, the disabled path and swell parity. Its `source.commit` is the checkout's HEAD; the page was served from `8bb0106b`.
- `logs/water-acceptance.json`: the authoritative water acceptance pass.
- `logs/clean-export-npm-test-summary.txt`: `npm test` on a clean `git archive` export. The 5 failures are binary-asset checks the export does not carry.
