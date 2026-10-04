# Gods' End exploration migration

The source is the owner's `/home/drusniel/drusniel-gods-end` project. Shared math,
render preparation, camera-follow, touch UI, recovery coordination, root fitting,
alpha coverage, mesh simplification, and serpent geometry/material/skin code were
copied or adapted from that project. Fixed map coordinates and its independent
terrain/player loop were replaced with this editor's canonical terrain queries,
floating origin, existing player physics, semantic documents, and bounded pools.

`config/exploration.yaml` controls each feature independently.

- Frame budgets measure fixed CPU work and give queued vegetation work the
  remaining allowance. Root fitting participates in resumable manifest jobs;
  collision and player physics retain their existing mandatory readiness policy.
- New streamed draws prepare against the real scene/pass cache in small batches.
  Pending draws are hidden until prepared; preparation restores visibility,
  parenting, draw ranges and shadow state and invalidates temporal history.
- Settlement residents represent existing Azgaar burg populations. Stable IDs,
  deterministic wandering, collision-free settlement footprints, animation fades,
  and baked four-stage mesh LODs provide a bounded cosmetic projection. They do
  not create population or authoritative simulation entities. A population query
  provider can connect a future live simulation to the same projection.
- Tree root planes and burial depths are fitted once per cached manifest. Trunk
  vertices conform near the base, leaves share the resulting placement, and
  naturally generated trees with excessive root overhang are rejected.
- Tree albedo atlases have offline, coverage-preserving mip chains at the runtime
  alpha cutoff. Existing PNGs remain the bake sources. Runtime loads the baked
  RGBA chains without canvas scans or CPU downsampling.
- Renderer device loss captures the current world, inventory, camera/player pose,
  origin, edit history and workshop draft. Recovery rebuilds GPU resources from
  authoring state and has a two-attempt limit. If recovery fails, the error screen
  offers the captured world for download.
- Serpents stream from seeded eligible Azgaar biome regions or explicit canonical
  `entries[].home` anchors. Their original locomotion and three species retain
  local trail coordinates around each anchor. Load/unload hysteresis bounds the
  pool, and a worker paints a bounded cache of shared procedural skins.
- The viewport's **Scenic tour** button starts a terrain-cleared local route.
  **Stop tour**, Escape, completion or loading a different world returns the
  original view. Route coordinates are canonical and ahead-of-camera terrain is
  requested through the existing streaming scheduler.
- Primary touch devices in a small viewport start with capped pixel ratio and the
  low post-processing preset. Walking exposes analog movement, touch look, run,
  recenter, jump/up and dive controls in the viewport. Editing and overlays hide
  the controls. Desktop pointer-lock behavior remains available.

Regenerate and validate artifacts with:

```bash
npm run bake:resident-lods
npm run bake:impostor-mips
npm run validate:resident-lods
npm run validate:impostors
npm run verify
```

The character preparation pipeline also rebakes resident LODs. Production asset
validation checks source/settings hashes for resident LODs and validates every
foliage mip payload. `npm run qa:exploration` exercises the features in headed
hardware WebGPU Chromium; on this WSL machine invoke the script with native
Windows Node, as with the performance harness in `docs/perf-qa.md`.

Validation on 2026-10-04:

- `npm run verify`: production asset validation, all 3,052 tests, and the Vite
  production build passed. The existing large-bundle warning remains.
- Hardware browser acceptance used NVIDIA Lovelace WebGPU, with no fallback
  adapter. Residents loaded four baked geometry stages on imported Eldara burgs
  around canonical coordinates (-908,103, 900,234). Serpent locomotion stayed
  finite after rebasing, and worker skins completed. The scenic route maintained
  its 18 m terrain clearance and returned the original view.
- Destroying the actual WebGPU device recreated the editor in one attempt with
  exactly one world canvas. Authoring document values, player view and origin survived; world undo and
  redo remained usable, including an edit already in the redo stack. A closed workshop draft regained its derived
  preview and usable semantic undo/redo history. Export timestamps are regenerated
  by `toDocument()` and are excluded from authoring-value comparison.
- Touch emulation at 390 × 844 and device scale factor 3 enabled analog movement,
  touch look and the mobile profile, with renderer pixel ratio capped at 1.
  Tapping Edit returned to editing and hid the touch controls.
  This checks browser integration; physical phone performance is unmeasured.

Two deterministic `chunk-cross` captures used 8 s warmup, settled streaming,
12 s measured movement and a 1280 × 720 viewport on the same hardware adapter:

| Capture | Average FPS | p95 frame (ms) | Hitches >33.3 ms | Collision gate |
| --- | ---: | ---: | ---: | --- |
| Before, run 1 | 69.36 | 33.15 | 4.81% | Pass |
| Before, run 2 | 86.19 | 30.24 | 2.61% | Pass |
| Migrated, run 1 | 71.33 | 30.73 | 2.81% | Pass |
| Migrated, run 2 | 68.35 | 31.30 | 2.81% | Pass |

The final p95 values remain within the baseline range, while hitch rates still
exceed the 2% performance gate. These captures do not establish an overall FPS
improvement: baseline variation is substantial. Both final runs used the baked
impostors (668 instances) and fitted 980 tree roots; collision p95 was 0.1 ms.
Raw reports are `tmp/gods-end-{baseline,baseline-2,final-1,final-2}.json`.

The full hardware matrix used its standard 8 s warmup and 10 s measured
movement. Its requested density multipliers were applied and all five collision
gates passed. Construction had 96 resident wall modules and 6,892 stones.

| Matrix case | Average FPS | p95 frame (ms) | Hitches >33.3 ms |
| --- | ---: | ---: | ---: |
| Standard | 69.60 | 31.23 | 3.45% |
| Dense forest | 69.88 | 30.73 | 2.73% |
| High grass | 66.51 | 32.39 | 4.22% |
| Dense mixed | 67.32 | 31.50 | 4.02% |
| Construction ring | 60.67 | 34.09 | 6.14% |

**The matrix gate failed.** Every movement case exceeded the 2% hitch-rate
limit, and construction also exceeded the 33.3 ms p95 limit. The default
construction matrix route is not the dedicated approaching-wall scenario
described in `docs/perf-qa.md`; these are the matrix's own regression checks.

The water runner found its shoreline route but stayed dry: the player remained
near its starting position against natural-prop collisions, so entry, swim,
dive, surface, exit and active-caustic acceptance were not established. Its
initial samples also reported the existing rock manifest selector being
unavailable before rock variants loaded (`this.prototypeIndexForRoll is not a
function` in unchanged `StylizedRockView.js`). Readiness subsequently recovered.
Water rendering recorded zero GPU validation errors, 14.5 ms frame p95 and a
0.91% hitch rate, but those timing results do not validate swimming.

Reports are `tmp/perf-matrix-latest.json` and
`tmp/water-acceptance-latest.json`. Neither the performance thresholds nor the
water acceptance requirements were relaxed.
