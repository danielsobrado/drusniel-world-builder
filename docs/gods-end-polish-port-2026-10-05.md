# Gods’ End polish ports — 2026-10-05

Six additions adapted from `/home/drusniel/drusniel-gods-end` at `95cc587`.
The recipient baseline is `a576da5`.

## Water

`config/water-visual.yaml` now enables `water.sea.surf` and `water.sea.detail`.
Surf follows local water depth, with variable wave sets, crest rolls and foam
trails. Crossing ripple trains use separate dispersion speeds and follow broad
swell motion. Medium and fine detail fades with camera distance.

These are nodes in the existing water material, with a shared packed detail map.
They add no scene passes or per-wave objects. CPU water-height queries use the
same surf formula as rendering, so swimming follows the displayed waves.
Nearshore phase advances into decreasing depth, with normals derived from the
displaced surface. Canonical pattern origins wrap before GPU upload; both seam tests and hardware
pixel checks cover distant coordinates and origin shifts. Set either `enabled`
to false to return that layer to its previous behavior. Lower water-quality
profiles retain their existing feature gates.

## Audio

Ambient calls use native WebAudio HRTF panners in listener-relative coordinates.
Their emitters remain anchored in canonical coordinates as the listener moves,
turns or rebases. Sea calls select positions from actual ocean samples. Each
call group allows at most two active voices; source completion and disposal
release its nodes. The existing ambient gain and master controls still apply.

Sample variations exhaust a shuffled bag before repeating. Loop buffers trim
at most 4,096 near-silent frames per end, across all channels, and cache the
result without changing buffers used for one-shots. Fetch/decode deduplication
and immediate fallback for unloaded one-shots remain in place.

## Configuration and lint

Vite compiles `*.yaml?compiled` into data modules using js-yaml’s default schema,
preserving anchor merges and explicit override precedence from the former parser.
YAML files remain the editable source, with development watch invalidation.
The config loader clones data before applying existing validation and runtime
overrides. Browser startup no longer parses these configuration files as YAML.

`npm run lint` checks undefined names, unused bindings and unreachable code.
It is the first `npm run verify` step. Existing unused imports and dead helpers
were removed to establish a clean lint baseline. The development toolchain
requires Node 22.13 or newer on the 22.x line, or Node 24 and newer.

## Exploration controls

Double-tap Shift while walking with the mouse captured to toggle fast travel.
The default multiplier is 3; holding Shift still applies the existing running
multiplier. The HUD shows the mode and the control. Configure it under
`speedBoost` in `config/exploration.yaml`.

The mode derives physics settings without mutating the saved player config.
Collision checks, not-ready blocking, swimming speeds and gravity keep their
existing rules. Pausing, UI blocking and input reset clear partial tap gestures.
The selected speed mode survives renderer recovery.

The deterministic movement harness accepts `explorationBoost=1` in its URL.
The QA-only `seaPolish=0` URL switch disables both new sea layers for A/B
controls; the resolved sea settings appear in the report. Reports record the
speed mode and effective player settings, allowing boosted travel
to be measured without keyboard timing or pointer-lock dependencies.

## Renderer recovery

Automatic backend selection retries WebGPU once, then uses WebGL for the second
failure. A startup device-loss guard rejects awaited initialization or shader
compilation even when the driver’s original promise never settles. Recovery
restores the captured editor state through the existing semantic state path.
The forced WebGL terrain renderer uses the existing procedural shading fallback
because WebGL counts texture-load inputs against its 16-unit fragment limit.
This renderer-only profile does not change the authoring config or terrain data;
WebGPU retains the full baked material graph.

`npm run qa:recovery` exercises a real second device loss and loss during restart.
It verifies backend selection, document/workshop state, player mode, speed mode,
player coordinates and physics, undo/redo, disabled WebGL bake pipelines and
canvas ownership. It also checks input from the focused Play button, keyboard
toggles, MP3 loading and HRTF panner motion. Use native Windows Node from WSL for hardware
browser tests, as described in `docs/perf-qa.md`.

## Initial validation — 2026-10-05

- Lint, generated UI check, production asset validation and production build pass.
- All 30 focused checks pass, covering compiled YAML, surf/seams/direction,
  audio voice limits, double-tap controls, recovery guarding and the movement harness.
- Full suite: 6,278 pass, 19 fail. The same 19 workshop and meadow test failures
  reproduce on the untouched baseline revision in a separate worktree.
- Hardware adapter: NVIDIA RTX 4080 / Lovelace; no software adapter.
- All 33 rendered-pixel checks pass on WebGPU and WebGL. Surf-on versus off
  changes mean RGB values by 2.81; motion changes them by 6.78. Origin rebasing
  changes mean RGB values by less than 0.002 on both backends.
- Actual keyboard toggles, MP3 decode/cache and HRTF voice movement pass.
- Repeated device loss and loss during restart both pass, with zero browser
  errors and preserved documents, workshop state, pose/mode, speed selection,
  undo/redo and a single viewport canvas.

Reports are in `tmp/gods-end-six-parity/report.json` and
`tmp/gods-end-six-recovery/report.json`. The two initial baseline movement runs settled and measured 135.21 / 150.03 FPS,
with p95 frame times of 12.2 / 8.8 ms and passing collision gates.

**Initial performance comparison blocked.** Subsequent movement captures did not settle
within 120 seconds; vegetation remained pending. The same happened with
`seaPolish=0`. DuneSandbox started immediately before those captures; Windows
GPU-engine counters measured about 84% utilization from that process, and total
GPU load remained around 95% with the QA browser closed. These are invalid A/B
measurements. Do not use their frame rates to claim a speedup or regression.
The later separate-worktree browser control also had asset-serving errors and
is invalid; only the original two error-free baseline captures are accepted.

The requested follow-up was two ordinary captures, boosted travel and the full
matrix after the competing GPU workload stopped:

```sh
npm run qa:perf:windows -- --url http://127.0.0.1:5183 --qa chunk-cross --warmup 8 --duration 12 --settle
npm run qa:perf:windows -- --url 'http://127.0.0.1:5183/?explorationBoost=1' --qa chunk-cross --warmup 8 --duration 12 --settle
# Native Windows Node from WSL:
node.exe "$(wslpath -w scripts/run-perf-matrix.mjs)" --url http://127.0.0.1:5183 --headed --warmup 8 --duration 12
```

Accept movement statistics only when `scenario.settle.settled` is true, hardware
WebGPU is identified, and browser errors are zero. At that stage, the full matrix and boosted
movement timings were unverified; the boosted not-ready collision policy was
covered by the physics test.


## Review fixes and validation — 2026-10-06

Three review findings are fixed:

- A focused Play button accepts movement, jumping and double-tap Shift after
  pointer capture. Editable controls and blocked UI retain their input guards.
- The stylized surface uses the terrain renderer's resolved backend profile,
  so WebGL fallback disables bake workers, cache and GPU bridge together.
- Compiled YAML resolves anchor merges with the former parser's precedence,
  including explicit overrides.

The input and YAML regressions fail before the fixes and pass afterward.
All 26 focused checks pass. Lint, generated UI checks, production asset
validation and the production build pass. The full suite reports 6,304 passing
and 21 failing tests; the identical 21 failure names reproduce on untouched
revision `1a6246e` in a separate worktree.

Both hardware recovery scenarios pass on NVIDIA Lovelace with zero browser
errors. They verify actual Play-button input and preserve exact player
coordinates and physics from a paused airborne pose, alongside the existing
state/history checks. Both end on WebGL with no bake runtime, bridge or GPU bake
slots. Report: `tmp/gods-end-review-recovery/report.json`.

Browser validation uses an isolated checkout of `1a6246e` plus the three runtime
fixes, avoiding reloads and rendering changes from concurrent snow work. The
checkout shares dependencies and missing local assets; its temporary Vite
configuration permits the shared texture decoder files.

The two ordinary follow-up movement captures settle and pass collision gates
with zero browser errors. They use the same 1280 × 720 hardware WebGPU viewport,
8 s warmup and 12 s measurement as the current-revision baseline captures.

| Capture | FPS | Frame p95 | Hitches >33.3 ms |
|---------|-----|-----------|------------------|
| Baseline 1 | 138.16 | 9.1 ms | 0 |
| Baseline 2 | 154.56 | 8.7 ms | 0 |
| Review fixes 1 | 145.13 | 11.0 ms | 4 (0.23%) |
| Review fixes 2 | 157.00 | 8.5 ms | 0 |

These small samples do not establish a speedup. Both follow-up captures pass the
matrix's 33.3 ms p95 and 2% hitch-rate limits. Reports are
`tmp/gods-end-review-before-{1,2}.json` and
`tmp/gods-end-review-after-{1,2}.json`.

Boosted chunk crossing also settles with zero browser errors and passing
collision gates: 117.44 FPS, 13.965 ms p95 and three hitches (0.21%). The report
records `explorationBoost: true` and effective walk speed 27 m/s, confirming the
configured 3× multiplier is active. Report: `tmp/gods-end-review-boosted.json`.

The matrix's five movement cases all settle, use hardware WebGPU, record zero
browser errors and pass collision gates. High grass and dense mixed exceed the
2% hitch-rate limit, so the matrix is not a passing performance acceptance.

| Density / scenario | FPS | Frame p95 | Hitch rate |
|--------------------|-----|-----------|------------|
| Standard | 156.57 | 8.500 ms | 0.05% |
| Dense forest | 148.78 | 9.090 ms | 0.06% |
| High grass | 109.15 | 20.525 ms | **3.29%** |
| Dense mixed | 106.59 | 19.360 ms | **3.13%** |
| Construction ring | 104.64 | 13.500 ms | 0.24% |

Construction retains 96 modules and 426 stones. The largest high-grass stall is
428.6 ms, with 426.9 ms recorded in the render phase; this evidence does not
identify a particular shader or GPU operation as its cause.

Water acceptance passes every gate: dry → swim → dive → surface → dry, stable
water-body identity, origin stability, active/bounded caustics, frame p95 and
hitch rate. The archived matrix and full case reports are
`tmp/gods-end-review-matrix.json` and `tmp/gods-end-review-matrix-data/`.

High grass repeats at 108.40 FPS, 15.62 ms p95 and 2.85% hitches (37).
Removing all three review runtime fixes from the isolated checkout reproduces
the failure on `1a6246e`: 106.10 FPS, 15.97 ms p95 and 3.22% hitches (41).
Both settle in about 44 s, record zero browser errors and pass collision gates.
This establishes that the high-grass stress failure predates these review fixes;
it does not attribute it to a particular shader or to the original ports.
Reports: `tmp/gods-end-review-high-grass-repeat.json` and
`tmp/gods-end-review-high-grass-baseline.json`. Dense mixed was not separately
retested on the unchanged baseline. The initial matrix remains a failed result.
