# PR I phase I.5 — Weather integration evidence

Evidence for the [Phase I.5 report](../../plans/ponlai-pr-i-phase-i5-weather-and-stability-2026-11-21.md). RTX 4080, Windows 11, Chromium, native WebGPU, 1600×900, high water tier.

## Reproduce

Serve the working tree (`npm run dev`), then, for each of FFT on (`--query oceanFft=1`) and FFT off:

```text
node scripts/run-coastal-review.mjs --url http://localhost:5174 --fixtures docs/qa/ponlai-pr-i-phase-i5-2026-11-21/poses.json --ocean-fft-inspect [--query oceanFft=1] --out tmp/ponlai-i5/captures-on
```

`poses.json` is the I.0 offshore pose under five weathers. Each weather is captured at dawn (06:30), day (12:00), evening (18:30) and night (23:00), except moderate, which is day only.

| Fixture | Weather | FFT wind (resolved, then settled) |
| --- | --- | --- |
| `offshore-calm-ref` | off | 10 m/s reference breeze along the primary swell |
| `offshore-calm` | `meadow` (weather on, no storm wind) | 6.1 m/s |
| `offshore-moderate` | `wind` at intensity 0.35 | 11.4 m/s |
| `offshore-wind` | `wind` at intensity 1 (the storm system's full wind) | 24 m/s |
| `offshore-storm` | `storm` at intensity 1 | 24 m/s |

## Contents

- `screenshots/off/`, `screenshots/on/`: the 17 matched captures.
- `screenshots/compare-*.png`: water crops (off left, on right):
  - day, wind, storm and dawn;
  - evening and night;
  - the wind ladder: calm → moderate → reference → strong → calm evening.
- `screenshots/crop-night-moonlight-off-on.png`: the night moonlight patch, off | on.
- `logs/captures-on.json`, `logs/captures-off.json`: failures (none), GPU and network alerts (none), and per capture the FFT state and its settled spectrum wind (`transitioning: false` on every capture).
