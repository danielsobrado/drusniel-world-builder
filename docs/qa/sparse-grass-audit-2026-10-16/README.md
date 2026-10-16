# Sparse grass screenshot review — October 16, 2026

[Improvement plan](../../plans/sparse-grass-look-and-feel-plan-2026-10-16.md)
· [Contact sheet](contact-sheet.jpg)

Six accepted views, each retained as an unchanged 1600 × 900 clean PNG and a
successive HUD PNG. The labeled JPEG contact sheet is a downscaled browsing aid.
No retouching, image generation or additional color grading was applied.

| View | Canonical X, Z (m) | Camera-cell biome | Pitch (radians) |
| --- | --- | --- | --- |
| [Savanna](random-03.png) | 10087, −4015 | 3 | −0.08 |
| [Grassland](random-04.png) | −1869, −4003 | 4 | −0.08 |
| [Taiga](random-09.png) | −2847, −6683 | 9 | −0.08 |
| [Tundra](random-10.png) | −4117, −14839 | 10 | −0.08 |
| [Grassland ground](random-04-ground.png) | −1869, −4003 | 4 | −0.65 |
| [Taiga ground](random-09-ground.png) | −2847, −6683 | 9 | −0.65 |

**One requested view was rejected.** The October 15 manifest's `random-06`
location (3135, 7229), previously ID 6, resolves to grassland ID 4 in the captured
runtime. No screenshot was retained for it. The raw report therefore records
`captureValid: false`, six completed poses and one failure. Do not describe the
whole seven-view request as passing. Every retained pose independently passed
readiness and its expected biome check; source integrity held and browser errors
were zero. Biome labels identify the camera cell, not everything in the image.

## Conditions

- Runtime frozen at `f75420e129f423f2aa279d67ffe9ca2a71ba020f`, served on port 5178.
  Later concurrent commits are outside these captures.
- Windows headed Playwright Chromium; NVIDIA Lovelace WebGPU, fallback false.
- Viewport 1600 × 900, DPR 1, FOV 68°, player eye height 1.7 m. Yaw and full poses
  are in [manifest.json](manifest.json).
- Generator seed 918273, version 1, height scale 24 m. Four accepted ordinary
  poses replay the [October 15 manifest](../visual-audit-2026-10-15/manifest.json);
  the two downward views change only the requested pitch.
- Highfield preset, paused noon, manual weather off. Regional atmosphere,
  wind, particles and biome snow remain active. HUD and clean images are
  successive frames and must not be treated as identical-frame comparisons.
- Production camera-cut transaction and `prepareVisualPose`: minimum 16-second
  preparation and 60 consecutive complete terrain/scenery/collision-ready frames.
  Static lighting also settles. Each retained pose records those results.
- The existing immutable-source server freezes its declared source, configuration
  and tree-atlas files. Other asset paths still use the shared checkout. This task
  did not edit them; their immutability is not established by the source hash.

These are visual investigation captures, not FPS measurements or acceptance of
wind, temporal stability, all biomes, other quality tiers, or WebGL rendering.

## Evidence and reproduction

- [report.json](report.json): actual camera/origin/biome, readiness, lighting,
  resources, adapter, failures, browser errors, source checks and PNG SHA-256s.
- [source-snapshot.json](source-snapshot.json): frozen revision and file hashes.
- [capture-script.mjs](capture-script.mjs): exact capture script, archived without
  edits. Its hash matches `captureScriptSha256` in the report. It expects to run
  from `tmp/` and reads the retained October 15 manifest.
- [diagnostics.json](diagnostics.json) and [diagnostic-script.mjs](diagnostic-script.mjs):
  reproducible mathematical probes of patch-cover bounds and growth-noise height
  plateaus. They are not GPU measurements. The script checks the two relevant
  source hashes against the capture snapshot before running.

Serve the historical runtime without switching the shared checkout:

```bash
node scripts/serve-world-visual-snapshot.mjs f75420e129f423f2aa279d67ffe9ca2a71ba020f 5178
```

Copy `capture-script.mjs` to `tmp/capture-sparse-grass-2026-10-16.mjs`, then change
its `out` directory to a new directory under `tmp` before executing it. Preserve
this evidence. On this WSL setup, launch that file with native Windows Node.js
and installed Windows Playwright Chromium; the existing QA guide explains the
[hardware-browser route](../../perf-qa.md). The script acquires the shared browser
QA lock. Its one rejected historical forest pose is expected on this revision.

The frozen runtime does not freeze future versions of the imported QA helpers;
check them against the retained source hashes for an exact historical rerun.
The live wind/particle frame cannot be reproduced pixel-for-pixel. Changes to
the copied script should produce a different script hash in the new report.
