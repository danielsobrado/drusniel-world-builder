# Gods' End rendering and navigation migration

Five additional areas are adapted from the owner's `drusniel-gods-end` checkout
(source HEAD `95cc587`). They use the World Builder's existing terrain queries,
floating origin, input ownership, rendering budgets, and bounded asset loaders.

| Area | Donor source | Integration |
| --- | --- | --- |
| Cached planar reflection sampling | `src/water/PlanarReprojection.js` | `src/render/reflections/PlanarReprojection.js`, owned by `WaterReflectionController` |
| Compressed foliage albedos | `scripts/vegetationKtx2Mips.mjs`, `scripts/encode-vegetation-ktx2.mjs` | Offline tree atlas encoder and `FoliageKtx2Loader` |
| Free-flight navigation | `src/player/FreeFlyController.js` | Separate camera owned by `ViewModeController` |
| Angular visibility margins | `src/rendering/TurnEnvelopeFrustum.js` | Budgeted ground-detail selection |
| Rendered-pixel acceptance | `scripts/browser/check-environment-parity.mjs` | Paired WebGPU/WebGL foliage, frost, and reflection fixtures |

## Reflections and visibility

Perspective water samples a cached planar capture using the mirrored view ray.
Capture translation is excluded from the projection, preserving the reflected
view during camera turns. Translation retains a bounded parallax approximation
until the next capture; nearby reflected objects can still require a refresh.
Orthographic orbit cameras use positional projection. The existing capture pool,
refresh interval, water-height checks, revision invalidation and rebase policy
remain the owners of capture work. WebGL's oblique clipping now subtracts the
actual fourth projection row, which also handles orthographic cameras.

Reflections remain optional in `config/render-enhancements.yaml`. For a preview,
use `?waterCube=1&waterPlanar=1`.

Ground-detail filtering expands each perspective frustum edge by an angle rather
than a fixed projection multiplier. `detailTurnMarginDegrees` defaults to 12 and
accepts 8–45 degrees. This covers the selector's pending camera turns across
portrait, ultrawide and offset projections. Orbit cameras retain their existing
conservative positional envelope. Full resident buffers stay available during
selection rebuilds and auxiliary captures. Enable filtering with
`detailVisibility: true` or `?detailVisibility=1`.

## Tree atlas preparation

All 29 tree albedo atlases have a committed ETC1S KTX2 derivative. Compression is
enabled by `stylizedSurface.lod.impostor.compressed` in `editor.config.yaml`.
`?impostorCompression=0` selects the RGBA fallback for comparisons. Failed
transcoding or invalid compressed dimensions/mips also fall back to that baked
chain. Normal/mask atlases retain their existing format.

The encoder uses coverage-preserving source mips at the material's 0.5 cutoff,
sharpens alpha without changing its cutoff mask, and omits levels smaller than
8 pixels on either axis. Runtime transcoding uses two workers at most and
releases them after loading. The manifest records source and payload hashes,
encoder version, dimensions, mip count and alpha cutoff. Production validation
rejects stale or corrupt compressed artifacts.

Install Khronos KTX-Software **4.4.2** and put `toktx` on PATH, or set `TOKTX` to
its executable. Committed assets need no encoder to run or validate.

```bash
# Full bake: PNG sources, RGBA mip fallback, KTX2 derivatives, then validation.
npm run bake:impostors

# Re-encode existing PNG sources with an explicit encoder.
npm run bake:impostor-ktx2 -- --encoder /path/to/toktx
npm run validate:impostors:required
```

The full bake also accepts `--encoder`; both commands respect `TOKTX`. WSL can
use a Windows `toktx.exe` path and converts its input/output paths automatically.
Runtime compression policy does not enter the tree source signature.

The KTX2 albedos total **1,378,242 bytes**, versus **4,889,802 bytes** for their
PNG sources. In the hardware fixture, one transcoded albedo used 349,440 bytes
of mip payload versus 1,398,108 for its RGBA fallback. These figures exclude
driver padding and the unchanged normal atlases.

## Free flight

Click **Fly** or press `F`. `WASD` moves relative to the view; `Space` rises,
`Ctrl` descends, `Shift` applies the speed multiplier, and pointer-lock mouse
movement looks around. `F` or `Esc` restores the previous view and paused state.
`config/exploration.yaml` supplies `freeFly.enabled`, `moveSpeed`,
`fastMultiplier` and `lookSensitivity`.

Flight settles in-progress editing before taking input, pauses walking physics,
and streams around its own camera. Overlays block movement, blur clears held
keys, and world rebases shift all camera poses together. Device recovery restores
the flight pose and its return state. Loading a different world ends flight.

## Verification

Run against a development server with a hardware browser:

```bash
npm run qa:environment:parity -- --url http://localhost:5173
npm run qa:free-flight -- --url http://localhost:5173
npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 12 --settle
npm run qa:perf -- --headed --url 'http://localhost:5173/?detailVisibility=1' \
  --viewportWidth 2560 --viewportHeight 720 --warmup 8 --duration 12 --settle \
  --revisit --turn-on-revisit
npm run verify
```

The browser runners share the performance browser lock and reject errors or
software WebGPU adapters. On this WSL machine they were run with native Windows
Node, following [the performance guide](perf-qa.md). Pixel artifacts are written
under `tmp/environment-parity`; flight artifacts go under `tmp/free-flight-qa`.

On 2026-10-05, NVIDIA Lovelace WebGPU and hardware WebGL passed all 23 pixel
checks. Compressed foliage coverage changed by 2.28% near and 1.60% far. Frost
raised brightness by 2.79× without changing coverage. A cached capture after an
8 m translation and 8° turn differed from a refreshed capture by 0.734 on the
0–255 mean RGB error scale. Rebased and orthographic captures passed on both
backends. Full-world flight passed movement, overlay blocking, rebasing, return
to paused walking, and actual device-loss recovery with no browser errors. The
full editor loaded all 29 albedos as compressed asset textures.

`npm run verify` passed production asset validation, generated UI validation,
all 6,268 tests, and the production build. The existing large-bundle warning
remains. Re-encoding a representative atlas reproduced its published hash;
an unavailable encoder was also checked to fail before replacing bake sources.

Settled `chunk-cross` captures used 8 seconds of warmup and 12 seconds of
movement at 1280 × 720 on the same hardware:

| Capture | Average FPS | p95 frame (ms) | Hitches >33.3 ms |
| --- | ---: | ---: | ---: |
| Before, run 1 | 93.56 | 17.815 | 10 |
| Before, run 2 | 114.93 | 12.600 | 1 |
| Migrated, run 1 | 154.21 | 8.500 | 0 |
| Migrated, run 2 | 153.16 | 8.425 | 0 |

All four captures settled, had zero browser errors, and passed the collision
gate with 0.1 ms collision p95. These runs show no movement regression; baseline
variation prevents attributing the FPS difference to compression alone. Raw
reports are `tmp/gods-end-five-{baseline,baseline-2,after,after-2}.json`.

The 2560 × 720 visibility-enabled route and its revisit with a 180° turn also
settled and passed collision with zero browser errors. Their frame p95 values
were 9.20 and 12.54 ms, with 4 and 6 hitches. The final ground-detail selections
submitted 316/655 and 254/651 eligible instances. The report is
`tmp/gods-end-five-visibility-turn.json`; it uses a different viewport from the
baseline comparison above.

Production asset verification also rebuilt the existing resident LOD cache with
the lockfile's meshoptimizer 1.2.0; its previous manifest named 1.3.0.
