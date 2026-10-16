# Random map and biome screenshot review — October 16, 2026

[Detailed improvement plan](../../plans/aaa-look-and-feel-plan-2026-10-16.md) ·
[Clean/HUD gallery](index.html) · [Contact sheet](contact-sheet.jpg)

18 freshly captured views: 12 new random procedural locations covering all
land-biome IDs 1–12, two coastal supplements and four imported Eldara views.
Each has an unchanged 1600 × 900 clean PNG and a successive HUD PNG. The JPEG
contact sheet resizes and labels copies for browsing. No retouching, image
generation or extra color grading was applied.

**Capture checks passed:** 18/18 poses, all expected biome IDs matched, complete
terrain/scenery/collision readiness, 60 stable lighting frames, fixed source
snapshot, and zero browser errors. These checks establish capture integrity,
not visual-quality or performance acceptance.

**Confirmed rendering defect:** tree atlas loading falls back because the
runtime signature `tree-impostor-v7-ddf715ab` differs from the manifest's
`tree-impostor-v7-edb495ec`. A separate read-only browser probe at the same
revision found 29 prototypes but **zero loaded atlases and zero impostor
batches** on both procedural and Eldara worlds. Runtime baking is disabled.
The resulting simplified distant trees are part of the captured current
appearance. The capture runner monitors errors but does not fail on console
warnings; the separate probe retains those warnings. See
[tree-atlas-probe.json](tree-atlas-probe.json) and Q0 in the plan.

## Sampling and conditions

- Runtime frozen at `52914b1559ceda00526ca027b83a89775ced63a4`, port 5182.
- LCG seed `20261016`, 13,438 candidate cell pairs in `[-8000,8000)` per axis,
  first encountered point for each land biome. Each accepted point also draws
  a random yaw. `X=(cellX+0.5)*2`, `Z=-(cellZ+0.5)*2` metres.
- Generator seed 918273, version 1, height scale 24 m, sea level −1.5 m.
- Coastal views reuse the established coast fixture; the camera cell is ID 4,
  with marine water visible. The four Eldara views are seeded choices of
  existing forest/taiga/glacier/wetland fixtures, not newly random coordinates.
- Headed Windows Playwright Chromium, hardware NVIDIA Lovelace WebGPU,
  fallback false. Viewport 1600 × 900, DPR 1. Player FOV 68°, pitch −0.08
  radians, eye height 1.7 m. Coast overview: FOV 60°, pitch −0.45 radians,
  height above ground 30 m. Full requested/actual poses are retained.
- Paused Highfield noon, manual weather off. Regional atmosphere, wind,
  ambient particles and biome snow stay active. HUD/clean frames are
  successive images and cannot be treated as pixel-identical comparisons.
- Production camera-cut transaction and `prepareVisualPose`: at least 16
  seconds preparation, then 60 consecutive ready frames. The overview first
  prepares destination ground collision. Static lighting settles separately.
- Screenshots ran 21:00–21:10 Asia/Dubai; the probe followed at 21:10–21:11.
  Raw metadata timestamps use UTC.

This sample includes biome boundaries and does not estimate average appearance.
Biome labels describe the camera cell; adjacent habitats can appear in the
same image. Stills cannot establish motion, audio or frame pacing. No new
performance benchmark or settlement/workshop review was performed.

## Evidence

- [manifest.json](manifest.json): requested poses, selection method and settings.
- [report.json](report.json): actual poses, readiness, lights, adapter, tracked
  resources, placement counts, source checks and SHA-256 of all 36 PNGs.
- [source-snapshot.json](source-snapshot.json): immutable runtime/configuration/
  tree-atlas file hashes. Other asset files are served from the shared
  checkout; no such files were edited during this task. Their immutability is
  not established by this snapshot. The map and editor configuration hashes
  are recorded separately in the report.
- [capture-script.mjs](capture-script.mjs): exact executed script; hash matches
  `captureScriptSha256` in the report. It expects to run from `tmp/`.
- [tree-atlas-probe.mjs](tree-atlas-probe.mjs): exact read-only diagnostic script,
  also expected in `tmp/`; hash matches its JSON result. No atlases were baked
  and no runtime source/configuration was edited to work around the defect.
- [build-gallery.mjs](build-gallery.mjs): gallery/contact-sheet assembly script,
  run from the repository root. It only resizes copies and adds labels.

## Reproduction

Keep the retained evidence intact. Serve the frozen revision without switching
branches or creating a worktree:

```bash
node scripts/serve-world-visual-snapshot.mjs 52914b1559ceda00526ca027b83a89775ced63a4 5182
```

From a native Windows terminal in this checkout, with Node.js and Playwright
Chromium installed:

```powershell
Copy-Item docs/qa/visual-audit-2026-10-16/capture-script.mjs tmp/capture-aaa-audit-2026-10-16.mjs
Copy-Item docs/qa/visual-audit-2026-10-16/tree-atlas-probe.mjs tmp/probe-aaa-tree-atlas-2026-10-16.mjs
$env:AAA_AUDIT_URL = 'http://localhost:5182'
$env:AAA_AUDIT_OUT = 'tmp/aaa-audit-reproduction-2026-10-16'
node tmp/capture-aaa-audit-2026-10-16.mjs
node tmp/probe-aaa-tree-atlas-2026-10-16.mjs
```

The capture and probe use the shared hardware-browser lock. See
[perf-qa.md](../../perf-qa.md) for the Windows browser route from WSL.
The scripts import helpers from the current checkout: compare those helpers,
generator dependencies and configuration with the snapshot hashes for an exact
historical rerun. The capture script recomputes selection using that checkout;
compare its requested poses with the retained manifest or replay the manifest
when investigating a newer generator. Live wind/particle frames are not
pixel-reproducible. The gallery builder's output directory is fixed to this
archive; change it in a copied script before assembling a reproduction gallery.
