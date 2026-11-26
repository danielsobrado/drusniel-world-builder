# r187 PR 04 — draw inventory and batching evaluation

Date: 2026-11-26 | Decision: **no batching promoted; no production code changed.**
Source: frozen snapshot of `05cc6c84` (`scripts/serve-world-visual-snapshot.mjs`), dev mode, WebGPU.
Hardware: RTX 4080 16 GB, driver 617.14, Windows 11 Pro 26300, headed Chromium (Playwright).
Roadmap: [Three r187 roadmap](../../plans/three-r187-improvement-roadmap-2026-11-26.md) §8.
Route: `settlement-approach` (frozen Azgaar burg), Hi-Z occlusion off.

## 1. Inventory by family

Method: an in-page probe wrapped every scene mesh's `onBeforeRender`/`onAfterRender` for 4 s
(222 frames) during the approach, keyed by pass (main camera vs orthographic shadow camera) and
by the object's top three ancestor names. The CPU figure is the time between the two callbacks,
which is one draw's `renderObject` work. The page is not cross-origin isolated, so the timer is
coarse; these are averages over thousands of samples and include the probe's own overhead.

| Family [pass] | Draws/frame | CPU ms/frame | µs/draw | Triangles/frame | Already instanced |
| --- | --- | --- | --- | --- | --- |
| Trees [main] | 27.0 | 1.21 | 45 | 3.56 M | 78% |
| Settlement paving + interiors [main] | 102.0 | 1.11 | 11 | 3.77 M | no |
| Terrain [main] | 18.0 | 0.69 | 39 | 0.15 M | no (one slot per chunk) |
| Bushes [main] | 12.5 | 0.44 | 35 | 2.35 M | yes |
| Grass [main] | 15.0 | 0.37 | 25 | 0.08 M | own renderer (out of scope) |
| Trees [shadow] | 12.0 | 0.34 | 29 | 3.54 M | yes |
| Rocks [main] / [shadow] | 11.0 / 11.0 | 0.34 / 0.31 | 31 / 28 | 0.04 M | yes |
| Flowers [main] | 10.0 | 0.29 | 29 | 0.01 M | no |
| Settlement buildings (walls, trim, doors, roofs, landmarks) [main] | 5.5 | 0.18 | 32 | 0.07 M | yes, per module and LOD |
| Hero, sky, falling leaves | 7.0 | 0.27 | — | — | — |
| Settlement buildings during staged publication [main + shadow] | 8.8 | 5.08 | ~570 | — | yes |

- The building kit (modular walls, trim, doors, roofs, landmarks) already reaches the renderer as
  one `InstancedMesh` per module type and LOD: 5.5 steady draws for the whole town.
- The ~570 µs draws are buildings in their first frames after staged publication
  (`StreamedDrawPreparation`): pipeline and upload work at 0.0–0.4 draws per frame. That is
  load-time cost, owned by PR 01/02, and batching does not touch it.
- Trees, rocks and bushes are already instanced, and their per-draw cost is in node and material
  updates, not draw count.
- The only large non-instanced family is **settlement paving and interiors**: 102 draws, one
  `Mesh` per material role (wood, stone, plaster, plain, sky, glow, exterior) per 256 m cell, split
  into parts at `INTERIOR_BATCH_MAX_VERTICES` (262 140, about 90 k triangles each). They are
  already spatial/material batches (`InteriorBatchStore`), with cheap unlit materials.

## 2. Stonehold batching candidate

`node scripts/run-stonehold-meshlet-qa.mjs --url <snapshot> --suite batch --out tmp/r187/batching`
(720p, 16 copies, 3 interleaved repeats per mode, no browser errors):

| Module | Mode | Draws | Render CPU p50 / p95 ms | GPU p95 ms |
| --- | --- | --- | --- | --- |
| Stonehold_Fang_Shrine | separate | 26 | 0.10–0.20 / 0.20–0.30 | 0.182–0.183 |
| Stonehold_Fang_Shrine | `BatchedMesh` | 17 | 0.10 / 0.20–0.30 | 0.180–0.184 |
| Stonehold_Twin_Outcrop | separate | 27 | 0.20 / 0.30 | 0.186–0.187 |
| Stonehold_Twin_Outcrop | `BatchedMesh` | 17 | 0.10–0.20 / 0.20–0.40 | 0.183–0.185 |

Batching removes nine or ten draws at equal GPU time. The CPU difference is below timer resolution at
this scale, so the fixture cannot show a submission saving.

## 3. Upper bound for the only candidate family

Before building a settlement `BatchedMesh`, the probe measured the most it could save: toggle all
96 resident `settlement-interior-*` meshes invisible and visible, 3 s windows, five pairs, at the
settled end pose of the route (camera still).

| Windows | Draws/frame | `drawSubmission` CPU ms/frame (per window) | Mean |
| --- | --- | --- | --- |
| Visible | 393–423 | 7.67, 7.06, 17.11, 7.63, 8.32 | 7.67 (outlier excluded) |
| Hidden | 294–328 | 6.20, 9.52, 6.77, 9.11, 8.27 | 7.97 |

Hiding them removes ~95–100 draws per frame, but submission CPU does not fall beyond window-to-window
noise, which was raised by streaming still in flight. The per-draw inventory puts the whole family at
~1.1 ms/frame, about 12% of the route's ~9.3 ms render-submission p95. That is below the 15% gate
even if batching made those draws free. It would not: a WebGPU `BatchedMesh` still issues one
indexed draw per sub-geometry without native multi-draw, it saves only the per-object `renderObject`
overhead, and merging the parts would undo the bounded per-batch uploads that staged publication
relies on.

## Decision

No family can reach the 15% render-submission p95 gate through batching on this route:

- The building kit is already instanced per module.
- Trees, rocks and bushes are already instanced, and their cost is per-material, not per-draw.
- The one non-instanced family has a measured upper bound below the gate.

The existing instanced and spatial-batch paths stay. Nothing is shipped behind a flag, so there is no
picking, collision, selection or WSC risk to test. The batching comparison (`StoneholdBatchComparison`)
remains a QA fixture. The CPU budget on this route is per-material node work and staged-publication
first draws, which belong to PRs 01 and 02, not to draw count.

## Not covered

One inventory capture and one upper-bound session. No BundleGroup arm (not verified as supported for
this pipeline), no dense-city route beyond the frozen burg, no forced-WebGL comparison. The probe
scripts were run from `tmp/r187/` (`draw-inventory.mjs`, `upper-bound.mjs`) and are not committed.
