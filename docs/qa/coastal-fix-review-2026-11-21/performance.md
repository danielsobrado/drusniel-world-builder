# Coastal rendering performance

Windows 11 Pro build 26300, Intel Core i7-13700KF, NVIDIA GeForce RTX 4080 driver 617.14 and headed Chromium 151.0.7922.34. The baseline uses the pulled `ec15cd09` snapshot. The candidate uses the immutable `7e587b3a` runtime snapshot.

The coastal runner measures eight seconds per settled aerial pose at 1600 × 900 with device scale 1. The script confirms NVIDIA Lovelace hardware WebGPU and records native Windows foreground ownership during each measurement. The before and after arms use the same resolution, camera, start pose, world seed, live water clock and quality settings. Static screenshots use a separate fixed water clock.

Frame intervals include the whole application. CPU render time measures submission inside the terrain render call. GPU percentages use sampled render-pass timestamps. GPU compute and buffer transfers are outside that timer. Worker water generation is measured per resident page and includes generation, flow, appearance and encoding. Cold generation time depends on concurrent worker load.

The seabed change adds zero field bytes, textures, samplers or render passes. The same per-slot field and appearance allocations serve every quality tier. Known texture payload comes from resident pages and the swash input and state fields. Driver memory is outside the coastal harness's accounting.

Both arms reported 3,312,400 bytes of water-field, flow and appearance payload across 49 resident pages in every pair. Swash input payload was 32 KiB at high, 128 KiB at ultra and zero at medium and low in both arms.

## Initial pairs

Values are median / p95 in milliseconds. All six pairs retained native foreground focus. The candidate visual run recorded zero browser errors and zero GPU validation or network alerts. Its warnings include the existing Three.js deprecations, missing UV attributes on some geometry and unreachable shader code. [Baseline timing log](logs/baseline-timings.json) · [Candidate timing log](logs/candidate-final.json)

| Scene | Tier | Frame interval | Render CPU | GPU render | Worker generation | Frame change |
| --- | --- | --- | --- | --- | --- | --- |
| Exposed beach | high | 4.80 / 7.00 → 4.80 / 7.90 | 3.80 / 5.60 → 3.70 / 6.20 | 4.12 / 4.51 → 4.07 / 4.38 | 61.70 / 105.00 → 55.50 / 89.10 | 0.0% / +12.9% |
| Curved coast | high | 5.00 / 7.30 → 5.00 / 7.40 | 4.00 / 5.80 → 4.10 / 5.90 | 4.73 / 4.93 → 4.80 / 5.41 | 44.50 / 82.50 → 39.20 / 110.20 | 0.0% / +1.4% |
| Sheltered cove | high | 5.20 / 7.10 → 5.30 / 7.80 | 4.10 / 5.90 → 4.20 / 6.10 | 4.86 / 5.16 → 5.00 / 5.55 | 56.00 / 111.50 → 53.70 / 97.30 | +1.9% / +9.9% |
| Curved coast | ultra | 5.10 / 7.00 → 5.40 / 7.30 | 4.10 / 5.50 → 4.40 / 5.80 | 4.80 / 6.42 → 4.96 / 6.27 | 42.30 / 98.10 → 50.80 / 102.40 | +5.9% / +4.3% |
| Curved coast | medium | 5.00 / 7.10 → 5.40 / 7.60 | 4.00 / 5.70 → 4.30 / 6.20 | 4.54 / 4.94 → 4.51 / 4.74 | 52.10 / 118.00 → 45.10 / 113.70 | +8.0% / +7.0% |
| Curved coast | low | 5.20 / 7.60 → 4.80 / 6.60 | 4.20 / 6.20 → 3.90 / 5.30 | 3.91 / 4.13 → 3.94 / 4.38 | 52.90 / 97.10 → 39.90 / 99.70 | −7.7% / −13.2% |

## Timing repeats

The first exposed high run exceeded the 10% p95 threshold. The curved ultra and medium runs exceeded the 5% median threshold. The repeats use the same poses, options and source snapshots. Both exposed high and curved ultra met the review thresholds on repeat. Curved medium exceeded the median threshold on both comparisons, with the fresh pair measuring 4.90 to 5.50 ms. Render submission median rose by 0.50 ms and sampled GPU render median rose by 0.04 ms in that pair. The timings establish a repeatable benchmark difference without isolating its cause. [Baseline repeats](logs/baseline-timing-repeat.json) · [Fresh medium baseline](logs/medium-baseline-repeat.json) · [Candidate repeats](logs/candidate-timing-repeat.json)

| Scene | Tier | Frame interval | Render CPU | GPU render | Worker generation | Frame change |
| --- | --- | --- | --- | --- | --- | --- |
| Exposed beach | high | 4.90 / 7.00 → 4.40 / 6.50 | 3.80 / 5.50 → 3.40 / 5.10 | 4.18 / 4.78 → 4.05 / 4.53 | 59.50 / 102.70 → 60.50 / 104.40 | −10.2% / −7.1% |
| Curved coast | ultra | 5.10 / 7.10 → 5.10 / 7.60 | 4.10 / 5.60 → 4.20 / 5.90 | 4.78 / 6.30 → 4.81 / 6.32 | 38.10 / 91.30 → 45.00 / 97.60 | 0.0% / +7.0% |
| Curved coast | medium | 4.90 / 7.10 → 5.50 / 7.70 | 3.90 / 5.70 → 4.40 / 6.10 | 4.71 / 6.07 → 4.75 / 5.14 | 43.00 / 91.40 → 48.10 / 112.50 | +12.2% / +8.5% |
