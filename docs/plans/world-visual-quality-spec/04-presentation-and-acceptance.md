# 04 — Presentation and release acceptance

Parent: [world visual quality plan](../world-visual-quality-plan-2026-10-13.md).
Prerequisites: VQ-01–10. VQ-11 has a UI part and a fixed finish change;
VQ-12 verifies the result in motion; VQ-13 is the release gate.

## VQ-11 — Quiet exploration HUD and one controlled finish

**Owners.** `src/editor/player/hud/PlayerHud.js`, `HudMetrics.js`,
`HudKeyHints.js`, `playerHud.css`, `src/editor/ui/NaturalPlayerSettings.js`,
`src/editor/ui/NaturalPlayerSettings.css`, `editor.config.yaml`.
Add `src/editor/player/hud/HudVisibilityController.js` and wire it from the
existing view-mode composition. Do not put DOM policy in terrain rendering.

### Fixed UI behavior

- Normal exploration shows reticle, minimap, relevant status and controls for
  the existing 8-second introduction. Preserve the current control labels and
  fade timer. Remove the persistent “Explore at your own pace” tagline.
  Keep scene name but limit it to one line, maximum width 240 px with ellipsis.
- Performance metrics are **off by default**. Add a Player settings checkbox
  labelled **“Show performance counters”**, storing a boolean in local storage
  under `world.hud.metrics.v1`. False when absent/invalid. The checkbox updates
  the HUD immediately. When off, stop its sampling/update work as well as
  hiding the element. Do not disable the actual performance harness counters.
- Add a Player settings button **“Hide HUD for screenshots”** with shortcut
  **F8**. F8 toggles capture mode when the viewport owns input and there is no
  modal/text input focus; ignore repeats and prevent the default on a handled
  event. Pressing Escape restores the HUD before applying the existing pause
  action. Returning to edit mode also restores it. Capture mode is not persisted.
- Capture mode hides viewport presentation roots: player HUD, spell dock,
  free-flight hints, diagnostic overlays, map/heading labels and editor chrome
  overlaying the canvas. Register those roots explicitly with the visibility
  controller through `data-capture-ui`; do not hide arbitrary body descendants.
  The settings button closes its own settings panel before requesting capture
  mode; it does not force-close another active modal. It is
  not a way to hide errors or a loading screen: refuse entry while a modal is
  blocking, an error overlay is active or the world has not loaded.
- The visibility controller applies one root state attribute and CSS rules.
  Preserve each component's own `hidden`, ARIA and view-mode state so restore
  returns to the correct UI. Hide registered roots from hit-testing and the
  accessibility tree while captured; restore their previous state afterwards.
  `WorldVisualQa.setCaptureUi()` uses this controller, not separate CSS injection.
- Visibility does not pause world simulation, unlock the pointer, change mode,
  alter camera position, change render size/exposure or reset any scenery.
  Keep the F8 exit shortcut active in capture mode. In Player settings include
  helper text **“Press F8 or Escape to show the HUD again.”**

### CSS values

Use a shared small backing for visible scene legend/key text and metrics when
enabled: background `rgba(16,24,22,0.82)`, text `#f2f1e8`, secondary text
`#d2d9ce`, border `1px solid rgba(242,241,232,0.14)`, border radius 8 px,
padding 10 px 12 px. No backdrop blur for these two blocks. Legend gap 10 px,
key column gap 16 px, scene font 12 px/1.3, label font 11 px/1.35. Insets 24 px
at viewport width≥1024; 16 px below. Retain current minimap size and position.
At widths≤760, preserve the existing hidden key row and keep metrics above the
minimap if explicitly enabled. Do not overlap the spell dock or modal controls.

Add `:focus-visible` outline `2px solid #d9bd76`, offset 3 px, to the new button
and checkbox wrapper. Honour existing reduced-motion styles. Require text
contrast ≥4.5:1 against the **composited** backing over white, black, sand and
water test backgrounds; measure with the standard sRGB luminance calculation.
This is a local UI test, not a claim that a full accessibility audit was done.

### Finish and lighting values

Set only `stylizedSurface.cinematicFinish.vignette: 0.10` and `grain: 0.006`.
Keep saturation 1.04, contrast 1.12, lift `[0.004,0.006,0.012]`,
gain `[1.02,1,0.97]`, highlightDesaturation 0.35, bloom strength 0.09,
radius 0.3 and threshold 2.1. Keep renderer tone mapping/exposure, sun/fill,
cloud scale/density/sharpness, shadow maps, global scene fog and god-rays
settings unchanged. These are fixed decisions: correcting surfaces and local
atmosphere takes precedence over changing every lighting preset.

Generic post-processing remains as configured. In cinematic walking mode the
cinematic owner applies the finish exactly once; do not duplicate it in the
bypassed generic pipeline. On a backend where that owner is unavailable, retain
the existing fallback and report its identity. Backend fallback performance
never qualifies as hardware WebGPU performance acceptance.

### Tests and gate

Add `test/hud-visibility-controller.test.js`; extend
`test/player-hud-state.test.js`. Use DOM/browser behavior to verify hide/restore,
metrics default and persistence, no sampling when metrics are off, F8 focus and
repeat rules, Escape, return to edit, modal/error guard, dispose/listener cleanup,
and restoring already-hidden components. Test view-mode changes while hidden.

Add HUD checks to the new visual runner at 1600×900, 1280×720 and 760×600.
Capture over sand, snow, dark woodland and water. Assert no element overlap
between legend, minimap, spell dock and enabled metrics using bounding boxes.
Assert all capture-registered roots are absent from a capture screenshot and
accessible again on restore. Camera/renderer/world-state snapshots before and
after toggling must match, excluding normal elapsed animation time.

Run `npm run qa:postprocessing` and the browser post-processing QA, plus VQ-03's
active-owner diagnostics. Isolated fixtures set grain to zero for comparisons;
real-world captures and performance use the production value 0.006.

```bash
node --test test/hud-visibility-controller.test.js test/player-hud-state.test.js
npm run qa:postprocessing
```

## VQ-12 — Validate motion, interaction and all lighting cases

No new locomotion/audio feature is part of this task. Fix regressions caused by
VQ-01–11 in their owning modules; do not add camera bob or new sound effects.

### Lighting suite

Use original poses 01, 02, 04, 06, 07, 10, 11 and 12, plus the new actual glacier
pose if 11 changed biome. For each pose, capture four states below; wait for
resolved static sky colour, light-intensity and fog values to converge (maximum
component change <0.001 for 60 consecutive frames), then apply the normal full
readiness gate. Exclude continuously animated wind/gust, cloud offsets and
particle positions from this convergence predicate; report their state without
requiring them to stop.

| Case ID | Sky preset | Paused hour | Manual weather |
| --- | --- | --- | --- |
| `day` | `highfield` | 12 | off |
| `low-sun` | `emberfall` | 18 | off |
| `overcast` | `highfield` | 12 | rain, intensity 1; use existing full-overcast response |
| `night` | `moonrise` | 0 | off |

Apply the preset after pausing the day/night clock so the clock does not replace
its selected look. Keep regional climate enabled and record its resolved values.
Before each case start fresh weather state; advance its wetness simulation for
20 seconds before waiting for final readiness. Do not carry overcast wetness
into the following dry case. Warmup is excluded from performance measurements.

For each case save final clean PNG and ground/vegetation debug masks in the
isolated fixtures. The numerical surface and atmosphere gates in chapter 02
must pass under each light. A dark night is allowed; self-lit sand, lost alpha,
nonfinite pixels, silhouette holes and double finishing are not. Do not raise
night exposure to match daylight histograms.

### Motion suite

Use four starts: original 04 (meadow), 06 (woodland), 05 (shore vicinity), 10
(snow). Use their stored yaw/pitch, Highfield at noon and default weather.
Require full preparation before recording. For each start run the same
20-second control sequence using the actual player input/movement path:

| Elapsed seconds | Input |
| --- | --- |
| 0–2 | stationary |
| 2–6 | W, ordinary walk |
| 6–10 | W+Shift, sprint |
| 10–12 | release movement, stationary |
| 12–13 | turn yaw smoothly by +π at π rad/s; no translation |
| 13–17 | W, ordinary walk at the new heading |
| 17–20 | stationary recovery |

Use elapsed simulation time to interpolate the turn, not a one-frame camera cut.
Run first-person, then repeat in third-person from a reset pose. Keep first-person
FOV 68°, third-person configured FOV 45°, walk 9 m/s and configured sprint
multiplier. Collision remains active; record actual travel and contacts. If an
obstacle prevents a segment, record it and add the matching open-ground
controlled fixture; do not move the start to a prettier route.

Store video using Playwright recording at 1600×900 and store actual frame times,
canonical camera/player poses, collision state, scenery queues and meadow
coverage in JSON. Video frame rate is the recorder's output and must be reported;
never label it a 60 FPS capture without verifying that. Video runs are separate
from authoritative performance runs because recording adds overhead.

Also run the existing deterministic performance routes with revisit and turn
coverage. A flat synthetic 256×256 m grass/forest fixture supplies an unobstructed
route when natural geometry blocks the real-world clip. This fixture uses real
chunk loading/eviction, foliage, collision and origin rebasing; it must not be
an isolated all-resident mesh pretending to test streaming.

### Motion gates

- No fall through terrain, unintended mode switch, stuck input after a cut, or
  collision query error. The existing collision QA gates remain unchanged.
- On the synthetic route, once warmup is complete, **zero visible missing near
  meadow tiles** within 12 m of the camera. Measure expected visible eligible
  tile keys versus published eligible keys; non-grass tiles do not count missing.
  Far requested tiles outside the frustum do not count as missing near ground.
- At each stop, all requested scenery must settle within **2 seconds**, then
  remain settled for the rest of the stop (the 10–12 segment may use its final
  frame to satisfy the limit). Report time, maximum queue depths and missing
  tile area. A final image taken after a long wait cannot substitute for this.
- Returning to a canonical region yields the same sorted stable placement IDs
  and growth profile assignments as before eviction. LOD representation counts
  may vary with camera, but source placement identity may not.
- Grass interaction passes VQ-10 at walk/sprint and recovers without below-ground
  triangles. Third-person feet and camera continue to pass existing movement
  and camera tests. Do not “fix” camera clearance by making trees non-colliding.
- Temporal fixture: use static black background, one production tree and a
  deterministic 180° pan over 1 second. After stopping, compare frames at
  t=0.25 and 1 second against a newly reset stationary render at the same pose;
  on pixels outside a 2-pixel dilation of the true silhouette, changed pixels
  with RGB error >8/255 must be <1% of the frame. Freeze wind/grain/particles
  for this test. This detects trails; it does not measure normal leaf motion.
- Wind, water and existing ambience transitions receive a functional check:
  no new console/audio errors, no duplicated ambience controller, no added
  AudioContext, no loss of the existing mute state. Record that listening
  quality is not automatically graded; do not claim a new sound-design pass.

Add `test/world-visual-motion-sequence.test.js` for exact input timing,
release-on-failure, camera turn and report schema. Extend the runner's motion
suite with browser assertions. Execute existing `qa:exploration`,
`qa:free-flight`, `qa:collision`, `qa:vegetation:lod` and `qa:recovery`.

## VQ-13 — Execute acceptance and publish evidence

### Order and environment

1. Finish and commit each task's focused tests before collecting authoritative
   captures. All source/config/asset changes must have a SHA; uncommitted live
   source edits and HMR invalidate a run.
2. Close all other rendering pages and stop any other performance run. Keep one
   Vite server, one browser lock and one visible test page. Record browser
   version, GPU vendor/architecture, driver information when exposed, OS,
   resolution, DPR, quality, preset and exact command.
3. Use Windows Chromium hardware WebGPU from WSL. Adapter `fallback` must be
   false, backend exactly `webgpu`, and description must not contain SwiftShader,
   llvmpipe, lavapipe, WARP or Basic Render. A browser page without a real adapter
   is **blocked/invalid**, not a passing test at a slower speed.
4. Run the deterministic isolated fixture suites on both WebGPU and WebGL.
   WebGL is compatibility coverage only; report its results separately.
5. Run visual/motion capture, then stop video recording and run performance.
   Do not run screenshots, asset baking or another browser in parallel with
   performance. Independent CPU tests may run together outside those captures.

The current workspace's native runtime is `/mnt/f/nodejs/node.exe`.
Verify it exists; if not, discover Windows Node through PowerShell exactly as
`scripts/run-perf-qa-windows.mjs` already does. This is an environment lookup,
not a change of benchmark backend. Convert entry-point paths with `wslpath`.

```bash
# Terminal 1 (reuse an existing server if already running on this port).
npm run dev -- --host 0.0.0.0

# Terminal 2: repository checks; must all pass.
npm run verify

# Hardware performance route, production config, matching both baselines.
npm run qa:perf:windows -- --qa chunk-cross --warmup 8 --duration 12 --settle --drain-seconds 15 --revisit --turn-on-revisit --grass-diagnostics --viewportWidth 1600 --viewportHeight 900

# Native Windows commands from WSL; safe, fixed task-specific variable.
VQ_WINDOWS_NODE=/mnt/f/nodejs/node.exe
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-perf-matrix.mjs")" --headed --warmup 8 --duration 12 --viewportWidth 1600 --viewportHeight 900
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-world-visual-qa.mjs")" --suite all --out tmp/world-visual-quality/after --baseline tmp/world-visual-quality/baseline
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-biome-appearance-qa.mjs")"
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-environment-parity-qa.mjs")"
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-vegetation-lod-qa.mjs")"
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-water-acceptance-qa.mjs")"
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-post-processing-browser-qa.mjs")"
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-weather-shader-qa.mjs")"
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-free-flight-qa.mjs")"
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-exploration-qa.mjs")"
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-collision-acceptance.mjs")"
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-renderer-recovery-qa.mjs")"
"$VQ_WINDOWS_NODE" "$(wslpath -w "$PWD/scripts/run-asset-startup-qa.mjs")"
```

Run the chunk-cross command **three times** on the settled VQ-03 baseline and
three times on the finished implementation. Copy each report immediately into
`tmp/world-visual-quality/{baseline,after}/perf/run-{1,2,3}` before a runner
can overwrite its latest-report files. Run the full matrix once at each of
those two revisions. Do not check out an old revision over the shared checkout
or create a worktree: collect the baseline before continuing implementation.
For the first VQ-03 baseline use `--suite original --out
tmp/world-visual-quality/baseline` without `--baseline`; the final `--suite all`
compares original poses to that baseline and validates later fixtures against
their specified numerical references, not nonexistent old fixtures.
A late missing baseline cannot be reconstructed from the old unsettled JPEGs.

### Exact release gates

| Category | Required result |
| --- | --- |
| Repository | `npm run verify` succeeds, with no skipped or weakened required checks |
| Browser | 0 page errors, console errors, uncaught rejections and GPU validation errors |
| Preparation | Every accepted pose ready for 60 consecutive frames within 120 s; no ignored queues |
| Coverage | Original 12 retained, 3 current views per land biome, marine fixture, 5 imported seed points, prescribed lighting/motion suites |
| Biomes | Azgaar IDs and custom definitions preserved; procedural glacier predicate and override tests pass |
| Surface/atmosphere | All numeric fixture gates in VQ-04–06 pass on both backends |
| Vegetation | VQ-08/09 density/height/edge/LOD/rebase gates pass; no new density or residency budget |
| Interaction/HUD | VQ-10/11 tests and screenshot assertions pass |
| Streaming motion | Zero missing eligible near tiles after warmup; ≤2 s post-stop scenery recovery |
| Existing perf matrix | Every case p95≤33.3 ms, hitch rate≤2%, collision valid, settled, density multipliers applied, ≥12 construction walls, masonry>0, water acceptance true |
| Chunk-cross hitch target | Zero post-warmup frames >33.3 ms in all 3 release runs, following the stricter performance-guide target |
| Comparative frame time | Median of run p95s and median of run p99s each ≤baseline median×1.10; absolute matrix gates still apply |
| Terrain/stylized CPU | Terrain commit p95<2 ms; stylized build p95<4 ms; zero generator tile samples in main-thread page commit |
| Memory/uploads | Peak resident tracked CPU+GPU resource bytes and total route upload bytes each ≤settled VQ-03 baseline×1.10, same route/config; report raw counters and calculation |
| Render cost | No added full-screen depth/opaque colour copy, terrain sampler count≤16, no new per-biome grass draw splitting |
| Provenance | All artifact hashes, source SHAs, config hashes, render-owner data and adapter identities present |

The matrix's ≤2% hitch threshold does not override the stricter chunk-cross
release target. If the base branch already fails a required gate, keep the
failure visible and report release acceptance blocked; do not label it a pass
because the new version is only slightly worse or because it predates this work.
Use the task failure rule in the parent document.

Track resource bytes through existing geometry/texture/instance counters; add
missing byte accounting for new allocations in their owners. Never report a
precise GPU memory total from JavaScript heap size. If the browser exposes no
exact GPU allocation total, label the metric **tracked resource bytes**, list
included resource classes and use the same accounting on both revisions.
The matrix still verifies rendering populations so missing content cannot buy a
false performance pass.

### Final artifacts

Create `docs/qa/world-visual-quality-implementation-2026-10-14.md` as the release
report. Keep that planned filename even if execution finishes later; record
actual execution dates inside. Create `docs/qa/world-visual-quality-2026-10-14/`
with these files/directories:

```
manifest.json
report.json
README.md
baseline/                 # lossless original-pose baseline captures
final/                    # original, additional, imported and marine captures
lighting/                 # complete prescribed light matrix
fixtures/                 # numeric surface, atmosphere, LOD and HUD evidence
motion/                   # frame/state JSON and 4 contact sheets, one per start
perf/                     # 3 baseline + 3 final reports and both matrix reports
```

Keep full videos under `tmp/world-visual-quality/after/motion/`, record their
paths and hashes in the manifest, and state that they are local noncommitted
artifacts. Commit the state JSON and contact sheets so the report is reviewable
without the large recordings. A contact sheet uses frames at 0,6,10,12,13,17,20 s,
labelled with actual capture timestamp and camera mode; it never mixes revisions.

The release report must contain:

1. VQ-01–13 table: implementation commit, tests, result, artifact links.
2. Before/after table for all original poses, with historical/current biome IDs
   and exact pose links. Explain the intentional reclassification at pose 11.
3. Confirmed causes versus merely observed symptoms; explicitly state whether
   the pending bush job, pale trees and pose-08 stubs were reproduced and fixed.
4. Numeric baseline/final performance and coverage table, all three raw runs,
   not just the best frame rate. Any invalid run remains listed with its reason.
5. Existing-world procedural classification behavior, asset/bake changes,
   backend compatibility and any failed/blocked gate.
6. Link back to the immutable original audit and to this specification.

Link the report from `docs/qa/README.md` and update the parent plan's task
completion table with the report, without deleting the design specification.
Validate all local links and hashes, run `git diff --check`, commit the finished
implementation/report on `main`, then push `main`. Do not claim release complete
until the final report's `passed` is true and the push succeeds.

## Task dependency and evidence checklist

| Task | Depends on | Minimum retained evidence |
| --- | --- | --- |
| VQ-01 | performance guide read | cut/query tests, 20-cut browser report |
| VQ-02 | VQ-01 | pre-fix queue timeline, contracts tests, settled revisits |
| VQ-03 | VQ-02 | permanent runner tests, fixed pose manifest, fresh baseline |
| VQ-04 | VQ-03 | desert diagnostic pairs, drift fixture/tests |
| VQ-05 | VQ-04 | six substrate fixtures, cache/parity tests |
| VQ-06 | VQ-05 | tree/mist/normal/alpha fixtures, original 07 before/after |
| VQ-07 | VQ-06 | glacier boundary tests, imported-ID/height/override checks |
| VQ-08 | VQ-07 | chunk-edge masks, density/rebase tests, original 02 pair |
| VQ-09 | VQ-08 | all growth rows, LOD/parity, imported/coast captures |
| VQ-10 | VQ-09 | bend sweep, refresh-rate recovery, original 08 sequence |
| VQ-11 | VQ-10 | HUD screenshots/assertions, active finish report |
| VQ-12 | VQ-11 | lighting matrix, first/third-person motion, recovery metrics |
| VQ-13 | all above | verify output, hardware comparisons, complete linked report |
