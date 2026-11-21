# PR I phase I.2 — GPU FFT verification evidence

Evidence for the [Phase I.2 report](../../plans/ponlai-pr-i-phase-i2-webgpu-fft-2026-11-21.md).

## Reproduce

Serve the working tree (`npm run dev`, or the `dev` launch configuration on port 5174), then run, on Windows with a hardware GPU:

```text
npm run qa:ocean-fft -- --url http://localhost:5174 --out tmp/ocean-fft-qa/report.json
```

Add `--no-benchmark` for correctness only (about 1 minute). The fixture page is `ocean-fft-qa.html`. It creates its own WebGPU renderer and loads nothing of the world.

## Contents

- `logs/ocean-fft-qa-report.json` holds the full run on the RTX 4080:
  - adapter, features and limits
  - every CPU/GPU comparison, with maximum, RMS and relative error for the f32 result and the RG16F texture
  - time-contract, cascade-isolation, spectrum-rebuild, lifecycle and leak checks
  - per-phase GPU timestamps and throughput for 64²×1, 128²×2 and 256²×2
  - paused, disabled and time-jump costs, and renderer restart timing

Two console errors are expected in that run:
- A favicon 404, since fixed by the page's `data:` icon.
- The deliberate simulated device loss of the lifecycle check.
