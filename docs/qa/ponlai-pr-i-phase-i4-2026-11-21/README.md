# PR I phase I.4 — Offshore normal integration evidence

Evidence for the [Phase I.4 report](../../plans/ponlai-pr-i-phase-i4-offshore-normal-integration-2026-11-21.md). RTX 4080, Windows 11, Chromium, native WebGPU, 1600×900.

## Reproduce

Serve the working tree (`npm run dev`), then:

```text
npm run qa:ocean-fft -- --url http://localhost:5174 --out tmp/ocean-fft-qa-i4/full.json
node scripts/run-coastal-review.mjs --url http://localhost:5174 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --only offshore-calm --ocean-fft-inspect [--query oceanFft=1] --out tmp/ponlai-i4/inspect-on
node scripts/run-coastal-review.mjs --url http://localhost:5174 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --only offshore-calm/high,offshore-windy/high,offshore-storm/high,exposed/high,curved-coast/high,cove/high,headland/high,rocky/high [--query oceanFft=1] --out tmp/ponlai-i4/captures-on
node scripts/run-coastal-review.mjs --url http://localhost:5174 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --only offshore-calm/high,cove/high --perf [--query oceanFft=1] --out tmp/ponlai-i4/perf-on
npm run qa:water:acceptance -- --headed --url "http://localhost:5174/?oceanFft=1"
```

## Contents

- `screenshots/off/`, `screenshots/on/`: matched captures at 8 poses (offshore calm, windy and storm at 126.0 s; exposed beach; curved coast; cove; headland; rocky shore).
- `screenshots/compare-*.png`: off | on | ×8 difference sheets.
  - `compare-aa-vs-fft.png` puts an off-vs-off (A/A) difference beside the off-vs-on one. The cloud and sky motion between runs shows in both.
- `screenshots/crop-*.png`: full-resolution water crops. Offshore is off over on; the shelf crop is off, off again, on.
- `logs/ocean-fft-qa-report.json`: the isolated GPU fixture, including `blendWeight` and `rippleSplit`.
- `logs/inspect-*.json`: water WGSL texture/sampler/varying counts and hashes per tier, FFT off and on. The off-high job was re-run (`inspect-off-high-rerun.json`) after a dev-server reload interrupted the first.
- `logs/perf-*.json`: frame timings.
  - `off-c`, `on2` and `off-d` are the focus-verified set.
  - `off-a`, `on` and `off-b` are the first set; 8 of its 12 timings failed the focus check and are kept as rejected.
- `logs/water-acceptance-fft-on.json`: the water acceptance run with the FFT forced on.
