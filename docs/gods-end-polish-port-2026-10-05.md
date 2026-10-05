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

Vite compiles `*.yaml?compiled` into data modules using js-yaml’s JSON schema.
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
undo/redo and canvas ownership. It also checks actual keyboard toggles, MP3
loading and HRTF panner motion. Use native Windows Node from WSL for hardware
browser tests, as described in `docs/perf-qa.md`.

## Validation

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

**Performance comparison pending.** Subsequent movement captures did not settle
within 120 seconds; vegetation remained pending. The same happened with
`seaPolish=0`. DuneSandbox started immediately before those captures; Windows
GPU-engine counters measured about 84% utilization from that process, and total
GPU load remained around 95% with the QA browser closed. These are invalid A/B
measurements. Do not use their frame rates to claim a speedup or regression.
The later separate-worktree browser control also had asset-serving errors and
is invalid; only the original two error-free baseline captures are accepted.

After the competing GPU workload is stopped, rerun two ordinary captures,
boosted travel and the full matrix:

```sh
npm run qa:perf:windows -- --url http://127.0.0.1:5183 --qa chunk-cross --warmup 8 --duration 12 --settle
npm run qa:perf:windows -- --url 'http://127.0.0.1:5183/?explorationBoost=1' --qa chunk-cross --warmup 8 --duration 12 --settle
# Native Windows Node from WSL:
node.exe "$(wslpath -w scripts/run-perf-matrix.mjs)" --url http://127.0.0.1:5183 --headed --warmup 8 --duration 12
```

Accept movement statistics only when `scenario.settle.settled` is true, hardware
WebGPU is identified, and browser errors are zero. The full matrix and boosted
movement timings remain unverified; the boosted not-ready collision policy is
covered by the physics test.
