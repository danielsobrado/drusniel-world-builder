# World screenshot audit — October 15, 2026

[Improvement plan](../../plans/aaa-look-and-feel-plan-2026-10-15.md) ·
[Screenshot gallery](index.html) · [Contact sheet](contact-sheet.jpg)

18 fresh views, each retained as an unchanged clean PNG and an ordinary HUD PNG
at 1600 × 900. The JPEG contact sheet is a labeled, downscaled browsing aid;
judge fine detail from the PNGs. No image generation, retouching, or color grading
was applied to the captures.

**Capture validity passed:** all 18 requested poses reached complete readiness,
all expected source biome IDs matched, the source snapshot stayed fixed, and
there were zero browser errors. This does not establish visual-quality or
performance acceptance. Existing motion and alpine-impostor failures are linked
in the plan and remain unresolved by this review.

## Selection and conditions

- Twelve new procedural locations: one for every land-biome ID 1–12. LCG seed
  `20261015`, 3,776 candidate cell pairs in `[-8000,8000)` per axis, retaining the
  first occurrence of each ID. Yaw consumes another random draw on acceptance.
  Coordinates use `X=(cellX+0.5)*2`, `Z=-(cellZ+0.5)*2` metres.
- Procedural world seed `918273`, generator version 1, height scale 24 m.
- Two targeted views reuse the established marine-coast fixture, with the camera
  on grassland ID 4. Four more use the same random stream to select an existing
  Eldara forest, taiga, glacier and wetland view. These six are supplements, not
  newly randomized map coordinates.
- Frozen runtime `a0c9b11c0fdea6c14ea6c58e6e3951713c53c313`, served on local port
  5176 using the existing immutable-source server. Runtime source, configuration
  and tree-atlas hashes are retained in [source-snapshot.json](source-snapshot.json).
  That server freezes its declared files; other assets are served from the
  checkout. No asset files were edited during this audit. The Eldara map hash
  and configuration hash are also recorded separately.
- Windows headed Chromium, NVIDIA Lovelace hardware WebGPU, fallback false;
  viewport 1600 × 900, DPR 1. Player FOV 68°, pitch −0.08 radians. The coast
  overview uses height above ground 30 m, FOV 60°, pitch −0.45 radians.
- Paused Highfield noon, manual weather off; regional atmosphere, wind, particles
  and biome snow remain active. HUD and clean captures are successive frames.
- The production camera-cut transaction navigates each pose. The existing
  `prepareVisualPose` helper requires complete terrain/scenery/collision readiness
  and 60 consecutive ready frames after a minimum 16-second wait. Static
  lighting must converge separately. The aerial pose first prepares ground
  collision using the existing helper.

One sample per biome is broad coverage, not an average-quality estimate.
Canonical ID describes the cell at the camera, not every object in its view.
No settlement, workshop, motion, audio or hardware performance claim is made.

## Files and reproduction

- [manifest.json](manifest.json): original requested poses, sampling and settings.
- [report.json](report.json): actual poses, readiness, lighting, adapter,
  placement counts, timestamps, source checks, browser errors and SHA-256 of all
  36 PNGs. `captureValid` is a capture-integrity result only.
- [capture-script.mjs](capture-script.mjs): exact script used; its hash is in the
  report. It is archived here for provenance and expects to execute from `tmp/`.
- [index.html](index.html): local gallery with clean/HUD toggle and original links.

From the repository root, with dependencies and Playwright Chromium installed:

```powershell
# Terminal 1: frozen original revision, without switching branches.
rtk proxy node scripts/serve-world-visual-snapshot.mjs a0c9b11c0fdea6c14ea6c58e6e3951713c53c313 5176

# Terminal 2: copy to the expected script location.
rtk proxy powershell -NoProfile -Command "Copy-Item -LiteralPath 'docs/qa/visual-audit-2026-10-15/capture-script.mjs' -Destination 'tmp/capture-aaa-audit-2026-10-15.mjs'"
```

Before running the copied script, change its `out` directory to a new directory
under `tmp` to preserve this evidence. That edit changes the script hash in the
new report, as it should. The archived script generates candidate poses from the
checkout's generator/config and reads its existing shore manifest; for an exact
historical repeat on a later revision, replay this retained manifest instead or
explicitly compare the selected poses. A frozen runtime alone does not freeze a
future checkout's selection code. The saved wind/particle frames cannot be
reproduced pixel-for-pixel because their animation remains live.

```powershell
rtk proxy node tmp/capture-aaa-audit-2026-10-15.mjs
```

The script takes the shared hardware-browser QA lock. Do not use these capture
wait times or HUD counters as performance measurements. Rendering changes need
the dedicated deterministic routes in [perf-qa.md](../../perf-qa.md).
