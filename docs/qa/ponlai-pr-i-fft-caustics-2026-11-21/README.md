# PR I [P9] follow-on — FFT caustics evidence

Evidence for the [FFT caustics report](../../plans/ponlai-pr-i-fft-caustics-2026-11-22.md). RTX 4080, Windows 11, Chromium, native WebGPU.

## Reproduce

Serve a frozen snapshot of the source to test, for example `node scripts/serve-world-visual-snapshot.mjs <commit> 5220`. Then run:

```text
npm run qa:ocean-fft -- --url http://localhost:5220 --no-benchmark --out tmp/fft-caustics/ocean-fft-qa/report.json
node scripts/run-coastal-review.mjs --url http://localhost:5220 --fixtures docs/qa/ponlai-pr-i-phase-i0-2026-11-21/poses.json --only offshore-calm/high,offshore-calm/ultra --ocean-fft-inspect [--water-patch '{"sea":{"offshoreFft":{"caustics":{"enabled":true}}}}'] --out tmp/fft-caustics/inspect
node scripts/run-fft-caustics-review.mjs --url http://localhost:5220 --perf --duration-ms 10000 --out tmp/fft-caustics/captures
node scripts/run-fft-caustics-review.mjs --url http://localhost:5220 --scan "2240,-10500,2240,-10900,20"
npm run qa:water:acceptance -- --headed --url http://localhost:5220
node docs/qa/ponlai-pr-i-fft-caustics-2026-11-21/image-diff.mjs docs/qa/ponlai-pr-i-fft-caustics-2026-11-21/screenshots
```

The captures here were served from `07ff0aee`. That commit has the same `src` as `fe760ad3`, but with `caustics.enabled: true` in the YAML. The review script sets the switch explicitly for each variant.

## Contents

- `screenshots/<pose>-{web,fft,web-repeat}.png`: underwater at the frozen water clock (126 s); caustics off, on, then off again.
- `logs/ocean-fft-qa-report.json`: the GPU fixture, including `fftCaustics`.
- `logs/inspect-{base,off,on}.json`: underwater post and water WGSL hashes. Base is `8bb0106b`.
- `logs/underwater-captures-and-perf.json`: capture states and the focus-verified A/B/A timings.
- `logs/water-acceptance-caustics-on.json`: the acceptance run with caustics on (trimmed).
- `logs/bathymetry-scan.txt`: bed depth and shore distance along four coasts.
