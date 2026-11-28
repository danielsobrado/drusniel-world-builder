# Phase 0B follow-up

The vegetation gallery now passes with every configured prototype in frame.
Hardware acceptance remains partial. The recovered grassland reports show
fewer long stalls and better frame-time tails than Phase 0, but a cold water
reflection capture still stalls rendering.

## Vegetation

The gallery runs with a stopped world loop, a separate scene, and an
orthographic frame shared by each near/proxy pair. Both representations use
identity instance morphology and ground tilt, with wind set to zero. The
WebGPU readback writes rows in their original order. The final 335-check run
used frozen source `83e7f72fdddfd73f369586a091088a10b762aba0` with snapshot
SHA-256 `baf3fa55656f2535abb85185a4dfda81fdc6e2562d9d0b9c78a7d6c322e0abcb`.
The readback lives in `scripts/fixtures` and the editor runtime contract test
passes without exceptions for the gallery.

| Check | Result |
| --- | --- |
| Functional, geometry and capture checks | 335/335 |
| Configured prototypes | 40/40 trees, 26/26 bushes |
| Tile coverage | 132/132 pass, 0 clipped, least occupied tile 2.73% |
| Browser output | 0 errors, 14 distinct warnings, including one missing `uv` warning |

The first isolated captures were upside down despite passing the coverage
checks. The upright rerun exposed clipping in both views of bush 24. Zero wind
and neutral ground tilt produce fully framed views without changing the
coverage thresholds. Raw attempts and the final gallery are in
`tmp/lod-phase-0b/gallery-isolated`, `gallery-upright`, `gallery-neutral`, and
`gallery-final`.
The [neutral gallery report](runs/vegetation-gallery-neutral.json) and
[representative captures](captures/gallery-neutral/) are retained here.

In the pine pair for indices 0–3, near crown widths are 198, 203, 198, and
219 pixels. The proxies measure 212, 219, 212, and 231 pixels in the same
512-pixel frames. The crown meets the trunk in each view. The proxy replaces
gaps and fine branch tips with solid tiers. This difference is most obvious
on the sparse source trees. The capture also shows broader filled crowns on
the flat-canopy trees 37–39 and a simplified mass for the arching leaves of
bush 24. These are visible simplifications. In-world handoff behavior requires
motion footage.

## Hardware provenance

The recovered matrix used native foreground RTX 4080 WebGPU (NVIDIA Lovelace,
driver 617.14), Node 22.21.1 and Playwright Chromium. It ran the frozen
`ffc77ceca793107f6df1cceb268678555b27fdfd` export at 1280 × 720, scale 1,
8 s warmup, 20 s measurement, GPU samples every eighth frame and the 16.667 ms
hitch threshold. The [report extracts](runs/hardware-report-extracts.json)
retain each URL, source path, SHA-256, settle and collision outcomes, timing
percentiles, renderer gauges where available, and the relevant per-frame
stalls. The original matrix logs record exit code and competing process
checks. Passes require native focus, settled preparation, ready assets and
collision, a complete frame buffer, and zero browser errors.

The recovery supplies 31 valid matrix runs. Each bog arm has three. Each
grassland, construction and settlement arm reported here has two, including
the separate 240 s settlement and construction arms. The full per-arm counts
and deltas against the [original baseline](../phase-00/metrics.json) are in
[metrics.json](metrics.json). The cached files and guard logs were copied to
`tmp/lod-phase-0b/recovered/`. Phase 0 arms without three valid samples have
no comparative delta.

| Grassland median | Phase 0 off | 0B off, 2 runs | Phase 0 on | 0B on, 2 runs |
| --- | ---: | ---: | ---: | ---: |
| Average FPS | 71.410 | 75.745 | 71.190 | 76.045 |
| p95 frame time | 27.500 ms | 22.830 ms | 26.690 ms | 23.960 ms |
| p99.9 frame time | 223.206 ms | 63.292 ms | 237.168 ms | 89.848 ms |
| Run maximum frame time | 289.100 ms | 340.350 ms | 306.700 ms | 331.700 ms |

These are cumulative differences across main commits. The tails improved
while the median of each run's maximum increased. The longest recovered
default grassland interval was 372.9 ms. Phase 0 had no matched grassland
readiness-experiment arm. The two combined experiment results in 0B are
a separate comparison, with a 19.968 ms median p95 and 45.983 ms median p99.9.

The final code commit passes all 5,689 unit tests and the production build.
The 62 Phase 0B and gallery layout tests passed, and the focused rerun after
moving the fixture passed 12 tests, including the unchanged WebGPU runtime
contract. Lint and production asset validation pass. The earlier full run
failed at `webGpuRuntimeContract.test.js` because the gallery readback was
under `src/editor`. The fixture move resolves that assertion.

The validated 40 impostor atlases came from `18122c36`. Their KTX2 files total
1,956,437 bytes. The manifest SHA-256 is
`d1463b5e8f53ce7dc8185572fbfa905fa3d42161330bfa94435cea407c518df5`, with
source signature `tree-impostor-v10-37c40d28`. No rebake was needed on current
main.

## Grassland hitches

Phase 0 had four gaps longer than 150 ms in each of its six accepted grassland
runs. RAF delta records elapsed time up to the current callback. The preceding
callback shows three overruns in `stylizedVariantApplyMs` and one in the first
water reflection cube face. For example, Phase 0 instrumented run 01 records
290.2, 218.7 and 219.5 ms gaps after 273.9, 208.9 and 204.3 ms of variant
application. Its 306.1 ms gap follows a 283.7 ms reflection capture.

All four recovered default runs have one gap over 150 ms each (307.8, 372.9,
352.2 and 311.2 ms). The three vegetation installer stalls are absent after
the resumable variant installation work already on main. The remaining gaps
follow 299–359 ms of CPU time in the first reflection face, dominated by a
`RocksStylized_M` submission. In the two combined experiment runs the worst
frames were 51.4 and 288.9 ms. The latter still contains a 286 ms reflection.
The earlier async precompile trial added approximately 487–518 ms main-draw
stalls and was reverted in `ffc77cec`. The raw A/B reports include three
focus failures. Their pacing figures remain excluded from the accepted matrix.

The opt-in report now links hitch intervals to their preceding callback and
sampler cost. It measures mean CPU-observed readiness wait for completed
replacement draw leases, separately from cancelled and timed-out leases.
GPU completion latency, transition-only pinned bytes, extra submitted draws
and triangles, fade-only transfers, and automated in-world missing pixels are
still unavailable.

## Settle blockers and sampler spikes

| Instrumented recovered run 01 | Additional settle wait | Last sampled vegetation blocker |
| --- | ---: | --- |
| Bog | 59.2 s | Staged tree build at ~58.46 s |
| Grassland | 66.8 s | Staged ground detail at ~66.22 s |
| Settlement | 90.5 s | Ambient ground and valley fog at ~89.32 s, after queued scenery finished |
| Construction | 70.3 s | Staged ground detail and construction readiness at ~66.98 s |

On these runs the named staged builders were unfinished even after manifest,
variant, meadow, and initial draw queues drained. Queue work and geology were
common earlier blockers. Extending the timeout does not accelerate them.
Both settlement and construction now settle within 120 s, a functional
improvement over the timed-out Phase 0 arms.

The longest recovered sampler call took 19.1 ms on construction experiment
run 02, frame 466, across 299 planner states. The next interval was 37.2 ms.
It is similar to the 22.1 ms Phase 0 grassland sample. The reports identify
where elapsed CPU time accumulated but do not identify whether GC or
preemption contributed. The sampled-session average remained 0.036 ms/frame
on that run. This does not clear the spike as a pacing concern.

## Motion

The clean `lod-reversal` run started at x −1869, z −4003, yaw 142.55359°,
pitch −4.58366°, with no browser errors. It settled after 107.5 s. The
planner reported up to 20 tree, 14 rock and 16 bush chunks transitioning,
with overlap in up to six tree and six bush chunks. It sampled no in-flight
reversal. The 322.7 ms maximum followed a 311.9 ms reflection capture.

The clean 60 s `lod-revisit` run settled after 93.7 s. It snapped origin at
15.004 and 30.008 s, then returned to canonical x −1869, z −4003. It recorded
up to 32 tree, 49 rock and 25 bush chunks transitioning. The cold region had a
632.4 ms gap after a 630.0 ms `terrain-slot` draw in the main pass, and a
270.1 ms gap after a 269.8 ms cube reflection capture. The run reported no
resource eviction counters. It establishes rebase and a revisit, with GPU
resource eviction unverified.

The first `post-processing-route` capture is rejected. Frame-budget
warmup skipped the settle gate and the rebase coordinate stopped short of the
threshold. The route now waits when `--settle` is requested and teleports
past the configured threshold. The first free-flight attempt also failed
the ascent assertion after the fixed 250 ms hold. Its runner now checks
actual displacement with a bounded hold, retaining the original 1 m gate.
