# Colour below the waterline — October 18, 2026

Split views now give submerged terrain the water body's blue-green colour while the head-submerged blend is still zero. The former head-only activation left the seabed looking dry when the camera straddled the surface.

The optical path reconstructs scene depth, finds the part of each ray below the current body's level and applies absorption there. Above-water geometry retains the unmodified scene sample. Activation follows the actual render camera inside a bounded band at the surface and stops on dry exit or when that camera rises clear. The global dive blend, player physics and land-streaming suspension are unchanged. This uses the existing high/ultra optical path and plain water variants; it adds no viewport copy or scene pass to that path.

[Before control](qa/waterline-color-fix-2026-10-18/world/before.png) · [After](qa/waterline-color-fix-2026-10-18/world/after.png) · [Just below the surface](qa/waterline-color-fix-2026-10-18/world/below.png)

The world captures use the reported position `(152.7, 416)`, yaw 90°, a fixed water clock and a camera 4 cm above/below its sampled surface. The head blend is deliberately held at zero to isolate this defect. The before control disables only waterline coverage in the same build. These are native renderer captures, without retouching. The separate traversal below exercises ordinary player physics.

## Verification

- `npm run verify`: **6,848 tests**, lint, generated UI, production asset validation and build pass for runtime change `a809db6a`. The subsequent QA-only change `5ce6d978` passes lint and adds the final backend comparisons.
- [Rendering report](qa/waterline-color-fix-2026-10-18/environment/report.json): **111 checks pass** on hardware WebGPU and WebGL. Thirty target the split view: visible wet-bed tint, preserved sky/dry-object colours, eye positions on either side of the line at head blend zero, elevated lakes, rebase, dry exit and high-camera bypass. The untinted-image negative control is rejected. Production water-sheet split views match across backends and assert zero redundant viewport copies.
- [World pose report](qa/waterline-color-fix-2026-10-18/world/report.json): three views at the reported location, fixed source and zero browser errors.
- [Water traversal](qa/waterline-color-fix-2026-10-18/water-acceptance.json.gz): dry entry, swimming, dive, surface, dry exit, water identity, origin and original frame/caustic gates all pass with native Windows foreground ownership. Frame-time p95 is **8.40 ms**, hitch rate **0.04%**, worst frame **165.3 ms**. Caustic post-effect peak is **0.30 ms**; the complete underwater pipeline, including scene rendering, peaks at **6.10 ms**, below the retained additional 33.3 ms peak check. These are acceptance observations, not a repeated-round speedup claim.

The frozen runtime is `5ce6d9782dba7c2b5171c9d3f95dc1ac47b08f17`; runtime and harness [source stability](qa/waterline-color-fix-2026-10-18/source-and-harness.json.gz) pass. [Artifact hashes](qa/waterline-color-fix-2026-10-18/artifacts.json) cover the original images and raw evidence. New capture files remain in this workspace under the existing `docs/qa/` ignore rule; this report and source changes are committed.

## Reproduction

Run these from the project checkout using native Windows Node for the hardware browser, following [performance QA](perf-qa.md):

```sh
node scripts/serve-world-visual-snapshot.mjs 5ce6d978 5266
node scripts/run-environment-parity-qa.mjs --url http://localhost:5266 --waterline --out tmp/waterline-review
node scripts/run-environment-parity-qa.mjs --url http://localhost:5266 --out tmp/environment-review
node scripts/run-water-acceptance-qa.mjs --headed --existing-server --url http://localhost:5266
```
