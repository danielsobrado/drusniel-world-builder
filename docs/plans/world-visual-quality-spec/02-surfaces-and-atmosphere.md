# 02 — Surfaces and atmosphere

Parent: [world visual quality plan](../world-visual-quality-plan-2026-10-13.md).
Prerequisite: VQ-01–03 pass and their settled baseline is saved.
Implement VQ-04, VQ-05, then VQ-06. Values below are the selected release design.
They are not post-implementation measurements.

## VQ-04 — Replace white surface emission with bounded material drift

**Evidence.** Original desert poses 01/02 show broad bright streaks. The current
`src/editor/terrainMaterial.js` takes the maximum snow/sand mask and sends the
scalar into `emissiveNode`; `BlownStreaks.js` can return a mask above one under a
gust. These are confirmed code properties. Their exact contribution to each
bright pixel still requires the diagnostic captures below.

**Owners.** `src/editor/stylized/ambient/BlownStreaks.js`,
`src/editor/terrainMaterial.js`, `config/ambient-effects.yaml`,
`src/editor/stylized/ambient/ambientEffectsConfig.js`,
`src/editor/stylized/ambient/AmbientEffectsSystem.js`.
Add `src/editor/materials/TerrainDriftNodes.js` for material composition.

### Fixed settings

Write these keys under `ambientEffects.sandStreaks` and `snowStreaks`, extend the
resolver to retain them, and make the defaults agree. Colours are sRGB hex;
convert once with Three's colour handling before linear-space math.

| Key | Sand | Snow |
| --- | --- | --- |
| `enabled` | true | true |
| `strength` | 0.30 | 0.45 |
| `hardness` | 0.65 | 0.25 |
| `length` (m) | 1.40 | 3.00 |
| `width` (m) | 0.12 | 0.18 |
| `patch` (m) | 18 | 30 |
| `reach` (m) | 55 | 75 |
| `maxOpacity` | 0.16 | 0.22 |
| `color` | `#c7b18a` | `#dce6ea` |

Retain current region, preset, travel-speed and wind-direction ownership.
Move strength ownership into the ambient system: change the two published
streak-weight targets from `surfaceEffectWeight()` to the existing
`strengthWeight()`. Remove configured strength from the shader's give term,
leaving `(1-hardness) * weight * (1-packing)`. The published weight then includes
strength exactly once; do not multiply it again in the material. Document the
ownership in both resolver and driver. The CPU reference uses
`streakLift({ weight, strength: 1, hardness, packing })` for the shader's
remaining substrate weight/hardness/packing calculation.

### Formula and integration order

- Clamp the final result of `blownStreaks()` to `[0,1]`, after noise, gust and
  distance fade. Disabled effects return `null` as today.
- Expose `wetness` and `snow` from `createTerrainMaterialBakedSurface`'s existing
  samples, with zero fallback when unavailable. Do not allocate another texture.
- Sand substrate weight is
  `(1 - grassCoverage) * (1 - snow) * (1 - wetness)`; packing is `wetness`.
  The region uniform remains the spatial sand gate. Sand cannot appear on full
  snow or submerged/wet ground. Snow substrate weight is `snow`; its packing is
  `clamp(max(pathMask, footprints.pressed), 0, 1)`.
- Compute the two masks separately; do not `max()` them into a white value.
  Apply sand first, then snow, to the lit-material **albedo input**:
  `C1 = mix(C0, sandColor, sandMask * 0.16)`;
  `C2 = mix(C1, snowColor, snowMask * 0.22)`.
- Insert this blend after rain wetness colour and before snow detail,
  footprints/wake and frost. Keep existing roughness and normals. Footprints
  and packed trails remain legible above the drift.
- Remove only the blown-streak contribution to `emissiveNode`. Keep independent
  spell light and existing snow-scattering terms. Surface drift has no light
  source, and must darken with the material at night.
- Use canonical wind coordinates and existing travel wrapping. No additional
  particles, mesh sheets, samplers, depth reads or render passes.

### Tests and evidence

Extend `tests/blownStreaks.test.js`; add
`test/terrain-drift-composition.test.js`. Cover negative coordinates, direction
normalization, travel wrap, wind envelope 0/0.15/0.7/1/4, gust 0/1, weight 0/1,
packing 0/1, disabled paths and nonfinite config rejection. CPU reference outputs
must be finite, masks `[0,1]`, sand alpha `≤0.16`, snow alpha `≤0.22`; a fully wet
or snowy sand substrate has exactly zero sand alpha. An unlit material fixture
must remain black with drift enabled and all other emission explicitly off.

Add a fixed flat-ground fixture to
`scripts/fixtures/world-visual-surfaces.html` and its module
`scripts/fixtures/world-visual-surfaces.mjs`. Use a 20×20 m plane, perspective
camera `(0,1.7,8)` looking at `(0,0,0)`, FOV 68°, 800×600, colour management and
actual production material graph. Frozen time 10 seconds, wind +X, envelope 1,
gust 0.5, manual region weight 1. Render sand and snow with drift on/off under
noon and night. Production configs must feed the fixture, not copied shaders.

Before changing the graph, capture original poses 01/02 with these diagnostic
states: default; drift off; direct light off; surface normals flat. All other
state stays fixed per pair. After implementation, repeat default and drift off.
Write which switch affected the long bright streaks; do not claim that emission
explained unrelated shoreline or geometry marks.

Acceptance in the isolated fixture: drift may change a channel by no more than
its configured alpha in linear `[0,1]` colour; no clipping introduced by the drift
alone; night emission test passes. In the full scene retain the two post-change
pairs and require no shader/browser errors. Pixel-perfect before/after matching
is not a goal for an intentional material change.

```bash
node --test tests/blownStreaks.test.js test/terrain-drift-composition.test.js
```

## VQ-05 — Give exposed ground and forest floor distinct responses

Keep the four existing atlas families `grass`, `dirt`, `rock`, `snow`, all atlas
sizes and the seven baked channels. Six visual substrate responses below are
blends within that system, not six new terrain IDs or extra texture samplers.

**Owners.** `config/terrain-material-bake.yaml`,
`TerrainMaterialBakedNodes.js`, `TerrainMaterialBakeCpu.js`,
`TerrainMaterialBakeFarColor.js`, `TerrainMaterialFamilyConfig.js`,
`TerrainMaterialFeatureNodes.js`, `TerrainMaterialFeatureResponseNodes.js` under
`src/editor/materials/`. Add `TerrainSubstrateConfig.js`,
`TerrainSubstrateMath.js`, `TerrainSubstrateNodes.js` in that directory.

### Configuration

Add `families.substrates` with the following entries. `tintMix` is an albedo
blend weight, not a multiplier. The tint applies only to the exposed dirt
family share; rock, snow, painted paths and grass blades retain their own hues.

| Key | Dry roughness | Wet roughness | Tint | `tintMix` |
| --- | --- | --- | --- | --- |
| `sand` | 0.93 | 0.78 | `#b8a27c` | 0.18 |
| `mineral` | 0.90 | 0.64 | `#8a8170` | 0.10 |
| `litter` | 0.97 | 0.72 | `#63513d` | 0.22 |
| `mud` | 0.87 | 0.43 | `#555747` | 0.22 |

Keep the grass/rock/snow family roughness settings except set
`families.profiles.snow.roughness: 0.94` and `wetRoughness: 0.80`.
Make only these additional changes:

| Existing config path | Target |
| --- | --- |
| `families.mesoStrength` | 0.26 |
| `families.microStrength` | 0.08 |
| `families.microFadeStartDistance` | 18 |
| `families.microFadeEndDistance` | 70 |
| `families.features.litterStrength` | 0.22 |
| `families.features.lichenStrength` | 0.20 |
| `families.features.patchScaleMeters` | 13 (retain) |
| `families.features.detailScaleMeters` | 3.2 (retain) |
| `families.features.litterColor` | `#63513d` |
| `macro.strength` | 0.10 |

All other material-bake settings retain their baseline values. Do not modify
stochastic frequencies, normal strength or transition distances in this task.

### Selection and math

Inputs already exist: tile ID, normalized material weights, canopy C, wetness W,
shoreline H and path mask P. Clamp C/W/H/P to `[0,1]`. Read the exact tile ID from
the current tile data; do not infer it from colour. For custom biomes use their
existing material weights and the non-desert fallback below.

```
S = (tileId == 1 || tileId == 2) ? 1 : 0
M = max(W, H * 0.75)
L = C * (1 - M) * (1 - S)
sandWeight    = S * (1 - M)
litterWeight  = L
mudWeight     = M
mineralWeight = max(0, 1 - sandWeight - litterWeight - mudWeight)
```

These weights sum to one. Each substrate's roughness is
`mix(dryRoughness, wetRoughness, W)`. Replace the dirt family's contribution
with their weighted sum; retain grass/rock/snow weighted contributions and
existing genome/feature/weather offsets, then clamp `[0,1]`.
Substrate tint contribution is `dirtWeight * (1-P)` times its table `tintMix`;
combine the weighted tint once, not sequentially with order-dependent blending.
Under a canopy, the existing litter feature remains responsible for small
patches. Do not create leaf decals or duplicate litter masks.

Use the same pure substrate selection and colour recipe in the CPU far-colour
bake and near shader. Bake descriptors/cache keys include substrate config and a
new material recipe revision. A config change invalidates derived material
pages, not source terrain or user edits. No serialization migration.
A stale page still uses existing publication fading; it must never expose
uninitialized channel data. The CPU and TSL versions share constants and get
numerical parity tests over sampled input grids.

### Tests and gate

Add `test/terrain-substrate.test.js`, including all biome IDs 0–12, custom ID 32,
C/W/H/P at 0/0.5/1, each pure family and mixed families. Assert weights sum to
one within `1e-6`, monotonic wet roughness, no sand tint on full snow, path tint
exclusion, correct cache invalidation, and CPU/node fixture agreement.

Extend the surface fixture with six 4×4 m swatches: sand, mineral soil, forest
litter (C=1), wet mud (W=1), rock and snow. Capture at 3, 20, 60 and 140 m using
a camera aimed at the same plane centre; scale the fixture plane only for the
far shots so at least 10000 valid material pixels remain measurable. Render
matching CPU-baked and shader paths. Mean absolute sRGB channel error between
those paths must be ≤8/255 after excluding silhouette/background pixels;
roughness outputs in a dedicated unlit debug view agree within 2/255.

Require unchanged sampler count (terrain fragment sampler limit is already 16),
zero pipeline validation errors on WebGPU/WebGL, no extra framebuffer-copy nodes,
and no new meshes or draw calls for substrate selection. Save paired originals
01, 02, 05, 06, 10 and 11 after this task.

```bash
node --test test/terrain-substrate.test.js test/terrain-material-family.test.js test/terrain-material-family-lod.test.js test/terrain-material-bake-cache.test.js test/terrain-material-bake-cpu.test.js
```

## VQ-06 — Make humid atmosphere and tree LODs agree

**Confirmed code facts.** `JungleMist.js` uses `weight > 0.001` to enter the
branch but omits weight from optical depth. `jungleMistOutput.js` applies the
blend to supported near materials. `TreeImpostorMaterial.js` enables ordinary
scene fog, but its factory has no ambient-effects argument. Its reconstructed
world normal is assigned directly to `normalNode`, unlike the explicit
world-to-view conversion in meadow materials. Reproduce each behavior in a
fixture; do not treat capture 07 as proof of a single cause.

**Owners.** `JungleMist.js`, `jungleMistOutput.js`, `StylizedTreeView.js`,
`impostor/TreeImpostorMaterial.js`, tree impostor CPU/GPU factory call sites,
`StylizedTreeMaterials.js`, `src/editor/InfiniteTerrainView.js`.

### Required changes

1. Optical depth becomes
   `integral * banks * nearClear * density * quality * clamp(weight,0,4)`.
   Keep the early uniform branch. Validate density/weight finite and nonnegative.
2. Set jungle mist `density: 0.006`, `height: 6`, `maxDistance: 260`,
   `nearClear: [12,45]`, `pocketScale: 0.02`, `pocketStrength: 0.35`,
   `ceiling: 0.50`, `color: '#b7c6bc'`, retaining existing drift velocity.
   Write raw YAML using `nearStart: 12` / `nearEnd: 45` and let the resolver
   produce `nearClear`. Update defaults too.
3. Retain the existing ray integral and light-dependent mist colour. Clamp
   the final mist colour to nonnegative values; no arbitrary white emission.
   The existing hemisphere/sun values are its light source. Do not bake mist
   into albedo atlases or scale scene fog down to conceal a representation bug.
4. Turn `applyJungleMist` into an idempotent output **composer**: if no output
   exists, its input is Three's `output`; otherwise wrap the existing output.
   Store an applied marker in `material.userData`. A second invocation returns
   false and leaves the graph unchanged. Preserve alpha exactly. Do not silently
   skip mist on a material because another output effect is present.
5. Pass ambient config through both CPU and GPU impostor factories and apply
   the same output composer as near trees. Ensure rock, bush, ground-detail and
   aquatic opaque material factories use the same composer once when ambient
   mist is enabled; these objects must not remain isolated dark cutouts. Use
   their current shared materials, not material clones per instance. Water
   sheets keep their existing water-atmosphere implementation; test their
   boundary, do not apply two fog blends.
6. Convert the reconstructed impostor world normal with
   `normalize((cameraViewMatrix * vec4(worldNormal,0)).xyz)` before assigning
   `normalNode`. Keep the direction used for atlas view selection in its
   existing coordinate space. Add the conversion to both CPU/GPU paths through
   their shared factory, not duplicated implementations.
7. Leaf alpha remains production alpha: near authored cards retain existing
   source/config cutoff, impostors retain 0.5. Do not globally lower alpha to
   fill sparse crowns. No tree-count, foliage-rim, sun-intensity or bloom change.
8. Record the active render owner in QA diagnostics: `cinematic-god-rays`,
   `volumetric-god-rays`, `post-processing`, or `direct`. Derive it from the
   successful branch in `InfiniteTerrainView.render`; configuration alone is
   insufficient. Record finish application count and require exactly one in
   cinematic mode. Generic post-processing being bypassed is reported as such.

### Controlled fixture and thresholds

Add `scripts/fixtures/world-visual-trees.html` and `.mjs`; render the production
near tree, proxy and impostor representations of the **same** prototype, scale,
rotation and appearance seed, forced one at a time. Use tree-scene/tree-02,
forest-pack/tree-narrow-01 and alpine/tree10. Fixed phase, wind zero,
neutral grey background, camera FOV 35°, object projected height 240 pixels at
800×600. Fit camera distance from prototype bounds; record the exact value.

Run with sun at azimuth 0/90/180/270°, elevation 42°, then mist weights
0/0.25/0.5/1 at ray distances 10/40/100/240 m. For the mist-distance test, use
identical neutral material cards in each representation path to isolate
atmosphere from different geometry; do not compare differently shaped trees
pixel-for-pixel.

Gates:

- At weight zero the misted and unmisted output are identical within one byte
  per channel. At 10 m, mist amount is zero. At 100 m, optical depth is linear
  in weight before exponentiation; visible amount is monotonic and ≤0.50.
- Neutral cards in every path agree in mean linear RGB within 0.01 at the same
  depth/light. Tests include an existing output node and a double-apply call.
- For tree material interior pixels (alpha ≥0.9 in both captures), near versus
  impostor median linear luminance ratio is 0.80–1.25 and median RGB Euclidean
  error is ≤0.12. Compare at the same lighting and projected size. At least
  1000 shared interior pixels are required; otherwise the fixture fails.
- Crown alpha coverage of each existing impostor is 85–115% of its corresponding
  near render in the bake's matching view. A failure requires fixing atlas
  colour/normal/alpha generation and rebaking the existing asset, not new assets
  or a runtime density increase. Run the existing impostor baker and required
  validator after any bake change; preserve source asset identities.
- Zero shader errors in WebGPU/WebGL. Negative coordinates and a simulated
  `(8000000,-3000000)` origin shift preserve the atmosphere.

Extend `tests/jungleMist.test.js`, `test/jungle-mist-wiring.test.js` and
`tests/treeImpostorRuntime.test.js`; add
`test/vegetation-atmosphere-parity.test.js` and
`test/tree-impostor-normal-space.test.js`. The latter tests a rotating view and
fixed world light, not a string search for `cameraViewMatrix`.

```bash
node --test tests/jungleMist.test.js test/jungle-mist-wiring.test.js tests/treeImpostorRuntime.test.js test/vegetation-atmosphere-parity.test.js test/tree-impostor-normal-space.test.js
npm run validate:impostors:required
```

Repeat original 07 at its original pose and yaw+π, plus 06/08/09. Save mesh-only,
impostor-only and ordinary LOD fixture evidence separately from real-world
captures. If a pale-tree defect remains after all numerical gates pass, record
VQ-06 as failed with its isolated scene; do not retune unrelated exposure.
