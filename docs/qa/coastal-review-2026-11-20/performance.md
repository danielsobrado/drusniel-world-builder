# Coastal performance

Windows 11 Pro build 26300, Intel Core i7-13700KF, NVIDIA GeForce RTX 4080, driver 32.0.16.1714. Headed Playwright Chromium 151.0.7922.34 used the NVIDIA Lovelace hardware WebGPU adapter at 1600 × 900 and device scale 1.

## Method

The [beach and cove poses](poses.json) hold camera, procedural seed, weather, clock hour, resolution and production quality settings constant inside each diffraction pair. Each pose uses the application's normal camera cut and waits for streamed terrain, collision and scenery to settle. Runs sample eight seconds of live frame intervals after warm-up. Each tier and diffraction combination starts with its own resolved configuration. Native Windows foreground ownership and DOM focus are checked in the timing window. Lost-focus rows are recorded as diagnostics and excluded from frame pacing thresholds.

The CPU column covers the frame from the movement hook to the end of render. Render submission, swash CPU, rock candidate refresh, and spray CPU are measured inside their respective runtime calls. GPU numbers are native timestamps on sampled render passes and exclude GPU compute and buffer transfers. Frame intervals include the whole application. Worker generation is measured around water field and appearance preparation and includes classification, depth, flow and encoding. Cold page times can vary with concurrent worker load.

The [timing log](logs/frame-timing.json) includes sample counts, foreground state, rejected attempts, buffer upload counters, and CPU and GPU summaries.

## Original baseline

Revision `72c9d90cb2bc3d508631a61f7b9ca83b4a056d40`, open beach, high quality. Both runs passed native focus. Median and p95 are in milliseconds.

| Diffraction | Frame interval | CPU after movement hook | Render CPU | GPU render | Worker water generation, 49 pages |
| --- | --- | --- | --- | --- | --- |
| Off | 4.40 / 7.20 | 3.90 / 6.60 | 3.40 / 5.70 | 4.19 / 5.58 | 57.20 / 95.30 |
| On | 4.50 / 7.20 | 4.00 / 6.50 | 3.40 / 5.70 | 4.10 / 4.68 | 57.70 / 90.80 |

Enabling diffraction raised the open-beach median by 2.3% and left p95 at 7.20 ms. This pair is within the 5% median and 10% p95 review thresholds. The sampled GPU decrease is descriptive. With 29 to 31 GPU samples per arm, it does not establish a GPU speedup.

## Cost and allocation

- Diffraction can probe five angles with eight samples each per lattice point with the shipped YAML. It uses a cached 16 m lattice, terminates each ray on land, and skips offshore samples beyond 90 m. The off/on worker timings include the lattice and probe cost. They do not isolate each ray or the appearance color calculations.
- Terrain shelter adds four conditional appearance texture loads in the eligible coastal height band. The existing RGBA8 appearance channel stores exposure, so diffraction adds no texture allocation or render pass.
- A 65 × 65 page carries 16,900 bytes of appearance data and 67,600 bytes for the field, flow and appearance combined. At 49 resident pages this is about 3.16 MiB of payload. This excludes renderer allocation, alignment and texture overhead.
- A high swash window has 1 MiB of ping-pong state and 32 KiB of input. Ultra uses 4 MiB of state and 128 KiB of input. Both use up to two passes per simulation step at 30 Hz. The per-case dispatch counts are in the timing log. No GPU compute duration was isolated.
- The rock field holds 256 KiB. Full high/ultra spray attribute capacity is 24/72 KiB. The runtime now uploads those buffers when emission or rebasing changes their version. The original open-beach control wrote 2,506,752 bytes of spray attributes during eight seconds and one impact.
- The allocation figures describe known texture and attribute payload. Total GPU memory usage was unavailable in the harness.

The repeated high-tier beach pair used the versioned spray buffers. The diffraction-off trace wrote 49,152 bytes over three rock impacts, down 98.0% from 2,506,752 bytes in the earlier diffraction-off trace with one impact. The final diffraction-on trace wrote 24,576 bytes over one impact. Event timing varied between live runs. The byte counters confirm that writes occur on changes to the attributes, and the rocky-shore captures show that spray still renders.

## Candidate timings

Median / p95 in milliseconds. The last column gives the diffraction-on change in median / p95 where both arms passed native foreground validation on the same snapshot. The timing log preserves CPU submission, per-page worker timings and the separate swash, candidate refresh and spray counters for each arm.

| Scene | Tier | Frame off | Frame on | CPU off → on | GPU render off → on | Pacing change or limit |
| --- | --- | --- | --- | --- | --- | --- |
| Beach | low | 3.90 / 5.60 | 4.10 / 6.20 | 3.40 / 4.90 → 3.60 / 5.50 | 3.78 / 4.04 → 3.92 / 4.54 | 5.1% / 10.7% |
| Beach | medium | 4.10 / 6.40 | 4.10 / 6.90 | 3.70 / 5.80 → 3.60 / 6.30 | 4.05 / 4.51 → 4.04 / 5.28 | 0.0% / 7.8% |
| Beach | high | 4.60 / 6.90 | 4.50 / 7.00 | 4.20 / 6.20 → 4.00 / 6.30 | 4.20 / 4.79 → 4.06 / 5.36 | -2.2% / 1.4% |
| Beach | ultra | 4.30 / 7.10 | 4.90 / 6.80 | 3.80 / 6.50 → 4.50 / 6.20 | 4.04 / 5.40 → 4.35 / 4.88 | Different source snapshots |
| Cove | low | 4.50 / 5.90 | 4.50 / 5.90 | 4.10 / 5.40 → 4.10 / 5.40 | 4.21 / 4.64 → 4.22 / 4.55 | 0.0% / 0.0% |
| Cove | medium | 5.00 / 7.00 | 4.90 / 6.40 | 4.50 / 6.30 → 4.50 / 5.80 | 4.70 / 5.53 → 4.71 / 4.76 | Foreground incomplete |
| Cove | high | 5.10 / 9.70 | 5.30 / 8.00 | 4.60 / 9.20 → 4.70 / 7.20 | 4.90 / 6.94 → 5.15 / 5.69 | Foreground incomplete |
| Cove | ultra | 5.00 / 10.00 | 5.70 / 13.00 | 4.60 / 9.50 → 5.20 / 12.80 | 4.87 / 5.46 → 5.47 / 7.63 | Foreground incomplete |

The medium and high beach pairs stayed within the review thresholds, and the low cove pair was flat. The low beach pair narrowly exceeded both thresholds at +5.1% median and +10.7% p95. Its small absolute changes of 0.20 ms and 0.60 ms warrant a repeat before changing the shader. The remaining pairs give diagnostic CPU and GPU readings. A like-for-like pacing conclusion remains open where the native Windows focus check failed or valid arms came from different snapshots.
