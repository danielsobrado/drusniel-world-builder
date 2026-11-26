# Adaptive distant town decorations — implementation and acceptance

Control: 366f1015573bf87e2b1ad36be22f4cfb119b8486. Use the same final candidate SHA with the flag off and on to isolate this feature. No GitHub Actions.

## Activation

```text
?townDecorationAdmission=1
?townDecorationAdmission=1&rendererAdmissionBudget=1&regionalInstancePublicationBudget=1
```

```yaml
townDecorationAdmission: false
townDecorationBudget:
  triangleBudget: 60000
  drawBudget: 24
  protectMeters: 100
  omitDistanceMeters: 180
  refreshMeters: 6
  recoveryRatio: 0.85
```

The limits are per resident town and apply only to eligible secondary modules, not all town geometry. They estimate main-pass geometry and mesh draw groups before frustum culling; they are not measured GPU timing or hard renderer-wide limits. Initial values are not hardware-calibrated.

## Policy

- Explicit simplification classification: Barrel, Crate, Cargo_Pile, Basket_Cluster, Woodpile, Flower_Box, Bench, Bush, Street_Bunting and Tavern_Table_Set. A module must be recognized by the existing TownPrefabCatalog, exterior, and have known geometry and a cheaper nonempty far representation (except eligible bunting omission). The existing TownMesh far-kit savings threshold still applies. Unknown or unsupported modules keep the original rendering path.
- The omission classification is intentionally narrower: only Street_Bunting, and only if the loaded kit metadata identifies no module colliders and no building-prefab use. Missing metadata prevents omission. No new omission for barrels, crates, market props or other collidable objects. The existing split-town prop reach still applies outside protection; this phase does not change collision ownership or the legacy maximum prop reach.
- Building structure, roofs, doors, interiors, stairs, floors, fences, lights, landmarks, market stalls, cultural monuments and other unclassified geometry remain on their existing paths. No asset replacement, layout changes or modifications to physics, interaction or placement seeds.
- Protect the streaming focus, actual active camera and walker (when available) in canonical metres, including one refresh-distance margin. Protected placements use their near geometry. Normal continuous movement receives a conservative margin; a teleport or an extended scheduler delay can expose a previously selected distant representation until the next admitted refresh.
- Begin from the existing whole-town or split-town LOD selection. Retain baseline hysteresis separately from budget-driven tier selection. Sparse demand retains baseline quality. Pressure first simplifies distant groups using existing far kit meshes, then omits eligible distant bunting if necessary. Group decisions check triangle savings and avoid exceeding the larger of the current and configured draw-group counts. Recovery uses 85% of the configured limits. Protected or unsupported geometry may make the target infeasible; report overflow, never force unsafe removal.
- Selection scans placements in 64-item slices; the existing TownStreamer selection queue owns scheduling. Compare the captured focus points with current ones before each publication, including while waiting for upload allowance. A partially completed town selection invalidates its cached LOD so it cannot be mistaken for a complete selection. Initial off-scene preparation follows existing town publication behavior. A completed earlier module is retained if a later one is cancelled.
- Both near and far rows of one module are published together through the existing TownInstancePublication writer, including count/visibility and remembered placement order. Shared canPublish admission uses the existing conservative dirty-span estimate. Whole-town structural LOD changes do not overwrite independent decorative tiers. The implementation does not allocate an additional GPU mesh or material.
- RegionalRenderCost.selectedTown already observes visible tier counts and matrices, so the existing regional geometry sampler can see selected decoration costs. This is a separate per-town policy, not a new decision variable inside the regional/global admission allocator.

## Diagnostics

- townDecorationSelections (completed town selections)
- townDecoration.requestedTriangles / selectedTriangles
- townDecoration.requestedDraws / selectedDraws
- townDecoration.requestedInstances / protectedInstances
- townDecoration.simplified / omitted / overflow
- Existing townInstanceRowsCopied, attributeBytesUploaded, framePublicationUploadBytes and townLodPlacementsEvaluated

The townDecoration.* gauges aggregate the last completed selections of resident towns; during a partial selection they may lag the actual published meshes. Overflow is a count of towns whose eligible decoration estimate remains over either target. Compare actual renderer draw/triangle counts and measured shadow/reflection costs independently.

## Tests

12 isolated regression cases passed using the committed JavaScript selection, config, publication and instance-method source with mock Three.js objects and URL parsing. Covers the explicit module taxonomy, collider and prefab exclusions, missing and zero-cost far geometry, protected focus/camera/walker, draw and triangle limits, omission, recovery, baseline LOD hysteresis, atomic tier publication, cancellation, structural LOD independence and flag validation.

Full Node/npm suite, lint, build, asset-kit verification, browser rendering and hardware acceptance have not been run here. No FPS improvement or actual eligible module count is claimed. The loaded far-kit geometry and collider metadata must be checked on the real assets.

```sh
npm ci
node --test test/town-decoration-admission.test.js
npm run lint
npm test
npm run build
```

Test the same final revision with flags off/on, identical scene seed, time, quality, camera, driver and viewport. Use headed native WebGPU on RTX 4080 plus WebGL fallback. Run settlement-approach/revisit and stationary town routes in multiple cultures (including Stonehold, Frostgard and goblin towns). Compare frame P50/P95/P99/P99.9, actual GPU pass timings, draw calls, triangles, upload bytes, queue backlog and screenshots.

| Scenario | Acceptance |
| --- | --- |
| Small town approaching from outside | Protected props recover near detail; structural LOD unchanged |
| Large split city | Distant eligible near props use the lighter tier only under pressure; no added disappearance of collidable props |
| Market, inn and street furniture | Collision shapes and interaction unchanged; no invisible obstacle introduced by the new policy |
| Bunting | Omission only with confirmed non-collidable/non-prefab metadata and beyond omission distance |
| Missing far kit | No forced removal of unsupported modules |
| Tight draw target | No uncontrolled near/far draw-group proliferation |
| Walk, orbit, teleport and rebase | Actual camera/walker protection; stale preparation cancels; recovery converges without persistent holes |
| Slow upload allowance | Old module remains visible until complete replacement; no duplicate or partial near/far publication |
| Flags off | Legacy output retained |

## Remaining work

- TODO: replace grouped greedy selection with measured per-module costs only if profiling warrants the complexity. Current sorted subset changes can cause additional row uploads when the visible prefix changes; final module commit remains atomic and may be oversized.
- TODO: verify the actual kit's useful far variants, quantify savings, and calibrate distance and budgets with accepted screenshots.
- TODO: integrate global town-decoration allocation, environmental effect budgets, independent cave/geology admission and the spatial performance overlay.
- TODO: measured GPU feedback for shadow/reflection admission and truly oversized instance publication slicing.
