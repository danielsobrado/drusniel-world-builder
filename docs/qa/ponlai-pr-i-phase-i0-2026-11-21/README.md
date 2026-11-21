# PR I phase I.0 — offshore and coastal water baseline

Evidence for the [Phase I.0 audit](../../plans/ponlai-pr-i-phase-i0-audit-and-baseline-2026-11-21.md). Everything here was captured on the frozen `a6e09d59` runtime snapshot before any FFT code existed, so it is the "before" arm for every later PR I comparison.

## Reproduce

Serve the frozen source, then run each tool against it (Windows, headed hardware WebGPU):

```text
node scripts/serve-world-visual-snapshot.mjs a6e09d59 5217
node scripts/probe-ocean-fft-capabilities.mjs --url http://127.0.0.1:5217 --out tmp/ocean-fft-probe/capabilities.json
node scripts/run-coastal-review.mjs --url http://127.0.0.1:5217 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --out tmp/ponlai-i0/captures
node scripts/run-coastal-review.mjs --url http://127.0.0.1:5217 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --out tmp/ponlai-i0/perf-a --perf
node scripts/run-coastal-review.mjs --url http://127.0.0.1:5217 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --out tmp/ponlai-i0/perf-b --perf
node scripts/run-environment-parity-qa.mjs --url http://127.0.0.1:5217 --out tmp/ponlai-i0/environment-parity
npm run qa:water:acceptance -- --headed --url http://127.0.0.1:5217
```

For an A/B, serve the candidate revision on another port and run the same commands with the same `poses.json`.

## Contents

- `poses.json` — offshore calm / windy / storm over deep, fully exposed water (shore distance at the 48 m cap, depth 23–25 m), plus the exposed beach, curved coast, sheltered cove, headland and rocky-shore poses of the 2026-11-20/21 coastal reviews. Benchmarks: offshore calm (all four tiers), exposed, curved coast and cove (high).
- `screenshots/` — fixed-clock captures (123.4 s, then 124.6 / 126.0 / 127.6 s for the motion sequences) and selected WebGPU environment-parity frames (`09-parity/`: negative canonical coordinates, rebase, underwater, sea-level lake).
- `logs/` — capture manifest with poses, adapter, source hashes and scene state; perf manifests (A/A); capability probe; environment-parity report; water acceptance report.
