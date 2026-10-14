# 03 — Biome composition

Parent: [world visual quality plan](../world-visual-quality-plan-2026-10-13.md).
Prerequisites: VQ-01–06. Execute VQ-07 through VQ-10 in order. All dimensions
are metres unless explicitly stated. Biome IDs remain canonical source data.

## VQ-07 — Correct procedural glaciers and separate tundra from ice

**Owners.** `src/editor/world/ProceduralWorldGenerator.js`,
`src/editor/materials/SnowAccumulation.js`,
`src/editor/world/ChunkRenderPixels.js`, `config/terrain-material-bake.yaml`,
`editor.config.yaml`. Add `src/editor/world/proceduralBiomeClassification.js`.

### Classification

Extract a pure function
`classifyProceduralBiome({ height, temperature, moisture, heightScale, seaLevel })`.
Keep the four-corner height average and existing climate sampling unchanged.
Replace the early `height > heightScale * 0.9` glacier shortcut with:

```
if (height <= seaLevel) return 0;
if (temperature < -0.70
    && moisture > -0.15
    && height > Math.max(seaLevel + 8, heightScale * 0.55)) return 11;
```

Then execute the current remaining climate branches in their current order,
unchanged. This makes cold climate mandatory; elevation alone can no longer
paint ice into a warm forest. Do not add majority-vote tile smoothing, recursive
neighbor classification or cached neighbor queries inside `sampleBaseTile`.
The rendered edge will be softened by VQ-08 while terrain IDs stay discrete.

Keep `sampleBaseHeight`, `sampleClimate`, sea level, rivers and final height
sampling bit-identical. Imported `AzgaarMacroWorldGenerator` classification is
untouched. User tile/height overrides remain authoritative. Keep world format
and generator version fields unchanged: this is the selected bug fix to the
current procedural recipe, not a second supported historical recipe. Existing
unedited procedural cells may regenerate with corrected biome IDs on load;
state this explicitly in the implementation report. Do not rewrite saved edits,
add migrations or preserve the defective warm-glacier shortcut for old saves.
Invalidate in-memory derived pages through existing generator replacement/reset
paths and include the classification recipe revision in relevant derived-cache
keys. Source biome edits invalidate their existing local halo as usual.

At the plan revision, an independent one-million-cell sample with seed 20261014
found 817 candidates satisfying the new glacier predicate. This is a reachability
check of the chosen predicate, not a visual or performance result. VQ-03's exact
manifest selection remains the authoritative sample because yaw draws and
minimum-distance rejection alter its random sequence.

### Cold-surface settings

- Set `classification.snowBiomeCover.10` to **0.35**, from 0.7; keep ID 11 at
  **1.0**. Retain altitude snow line 700, fade 250, slope maximum 0.55 and all
  existing snow patch/wind/concavity values. Both material bake and grass mask
  must consume the same `snowAtPoint` result.
- Add biome 10 to meadow grass eligibility. Its short, sparse profile is fixed
  in VQ-09; snow coverage still suppresses it through the shared surface mask.
  Biome 11 has no grass and no trees. Do not put evergreen forest on a glacier.
- Keep the two alpine tree assets' `tileIds` and `preferredTileIds` at **[10]**,
  removing 9 from both. Add **[9]** as `preferredTileIds` for the existing
  forest-pack `tree-wide-01`, `tree-wide-02`, `tree-wide-03`, `tree-narrow-01`.
  Retain their species and scales. Taiga therefore uses those green conifer
  crowns; tundra uses existing snow-painted alpine silhouettes. Do not change
  alpha cutoffs or increase tree budgets to achieve this distinction.
- Keep tundra's current tree habitat elevation limits and species mapping.
  This task does not invent a new treeline generator.

### Tests and gates

Add `test/procedural-biome-classification.test.js` with exact boundary tests:
sea-level equality returns 0; temperature -0.70, moisture -0.15 and height equal
to the threshold do not return 11; just-inside values do; heightScale 24 and
240 both respect the normalized threshold; warm high terrain never returns 11.
For the twelve old poses record before/after biome IDs. Pose 11 must cease to
be glacier; do not require its replacement ID to be an arbitrary chosen biome.

For seeds 1, 918273 and 20261014, compare 4096 deterministic sampled heights
before/after: base and final height values must match exactly. Compare source
Azgaar IDs before/after at 4096 imported cells and all thirteen synthetic source
IDs: exact equality. Save/load a world with custom ID 32 and explicit tile and
height edits across the old glacier pose: IDs, definitions and overrides survive.

Extend `test/snow-accumulation.test.js`, `test/snow-biome-ecology.test.js` and
`test/surface-mask-waterline.test.js`. At height 20, slope 0, curvature 0,
patch 0.5: tundra snow is 0.35, glacier snow 1; at altitude 950 both may be full
snow; at slope ≥0.55 neither holds surface snow. Near and far use the same rule.

```bash
node --test test/procedural-biome-classification.test.js test/snow-accumulation.test.js test/snow-biome-ecology.test.js test/surface-mask-waterline.test.js
```

Repeat old pose 11 and freeze the new VQ-03 manifest. Imported glacier stays 11.
A procedural warm patch becoming ordinary vegetation is the intended result;
claiming to have improved an alpine panorama from that old shot is incorrect.

## VQ-08 — Replace hard grass boundaries with a shared coverage field

**Owners.** `src/editor/world/ChunkRenderPixels.js`, worker page preparation,
`src/editor/stylized/meadow/MeadowGroundSampler.js`, `meadowGrassCompaction.js`,
`src/editor/materials/TerrainMaterialBakeCpu.js`, `TerrainMaterialBakedNodes.js`,
`src/editor/stylized/meadow/MeadowGroundShading.js`.
Add `src/editor/world/GrassHabitatCoverage.js`.

### Field definition

The surface mask already uses R=path, G=grass eligibility, B=water, A=255. Keep
this layout; change G from a binary flag to a continuous **coverage potential**.
Do not add a sampled texture or reinterpret the canonical tile buffer.

- A cell is eligible when its tile is in grass `tileIds`, snow cover <0.5 and
  water occupancy <1. Otherwise coverage is exactly zero. Keep hard path
  exclusions from the existing system; painted paths remain separate.
- Compute distance **inside** the eligible area to the nearest ineligible cell
  using a two-pass 8-neighbor chamfer transform in the existing worker stage.
  Cardinal cost 1, diagonal cost sqrt(2). Reuse the road-distance algorithm's
  mechanics, with separate scratch storage and no change to the road result.
- Coverage width is **8 m**. Use a halo of
  `ceil(8/tileSize) + 2` cells for this field, combined with the larger existing
  road/water halo. Obtain halo classification with the same height/snow/water
  rules as core cells; never pad a missing neighbor with bare ground. A uniform
  eligible halo with no ineligible seed produces full coverage, not infinity
  encoded into a byte.
- For an eligible cell with chamfer distance D in cells,
  `edge = smoothstep(0, 8, max(0,D-0.5)*tileSize)`.
  Write `G = round(edge*255)`. Ineligible cells remain zero. This inward fringe
  keeps vegetation out of hot/cold desert, deep water and glaciers.
- Worker and synchronous fallback call the same pure helper. No procedural
  neighbor sampling during main-thread page commit. Local edit invalidation
  includes the new halo; adjacent pages agree at their shared edge.

### Consumers

1. `MeadowGroundSampler`: retain tile eligibility; remove the current
   `sampleMask(...G) < 0.5` rejection. Bilinearly read G as E. Accept a stem
   only when its stable coverage roll is `< E * profileDensity`, with the profile
   supplied by VQ-09. Use a different hash channel from the existing forest
   rejection, so they do not produce correlated stripes. The roll must derive
   from canonical candidate identity and world seed, never slot/tile residency.
   Use the existing integer `hash32` utility with
   `xCm = Math.round(x*100)`, `zCm = Math.round(z*100)` and
   `roll = hash32(Math.imul(xCm,0x1f123bb5) ^ Math.imul(zCm,0x5f356495)
   ^ worldSeed ^ 1201) / 4294967296`. JavaScript bitwise coercion is intentional;
   the input coordinates are canonical, not rebased floats.
2. Surviving stem strength gains a multiplier `mix(0.30,1,E)` before the current
   water/rock/path/deformation terms. Do not shorten every rejected stem into a
   visible triangle. Rejected candidates must not enter the output buffer.
3. Far cards use the same continuous field and density rule at each card's
   canonical centre. Terrain groundcover colour reads the same E, including in
   its far-colour bake. Full canopy and path responses continue to apply once.
4. Extend bake input/descriptor plumbing to consume the shared coverage data.
   Include coverage recipe revision in page/bake cache fingerprints. Do not
   rescan the generator per fragment or independently re-create a different
   edge in the shader. Normal page publication fading remains active.

### Tests and gate

Add `test/grass-habitat-coverage.test.js` with flat half-plane, diagonal border,
isolated eligible island, all eligible, all ineligible, snow border, water border,
negative chunk coordinates and an edited cell at a chunk corner. At tileSize 2,
raw half-plane eligible-cell E at distances 1,3,5,7,9 m is approximately
0.043, 0.316, 0.684, 0.957, 1 (allow 1/255 quantization). The ineligible side is
always zero. Overlapping halo outputs match byte-for-byte across chunk builds.

Add `test/meadow-habitat-compaction.test.js`: 100000 fixed candidates in a flat
eligible fixture, coverage 0/.25/.5/1. Accepted fraction agrees with E times
profileDensity within 0.01. Repeat in reverse order and after origin rebasing:
same accepted canonical IDs. Near and card queries at an identical canonical
point return the same coverage. Different channels for forest and edge are
verified by a fixture with both probabilities 0.5: approximately 0.25 survive.

Create a half-desert/half-grass fixture with boundary through a chunk interior,
then a chunk edge. Capture at eye height at 2, 8, 30 and 70 m from the border.
The full-height stand begins ≥8 m inside eligibility; no blade appears on the
ineligible side. Rendering counts and field samples, not a subjective review,
establish this condition. Revisit original pose 02 after readiness passes.

```bash
node --test test/grass-habitat-coverage.test.js test/meadow-habitat-compaction.test.js test/surface-mask-invalidation.test.js tests/meadowCompactionReuse.test.js
```

## VQ-09 — Lock vegetation scale, forest floor and shoreline identity

### Meadow growth profiles

Add `grass.meadow.growth` to `editor.config.yaml` and resolve it in new
`src/editor/stylized/meadow/meadowGrowthProfiles.js`. Add
`meadowGrowthMath.js` and `meadowGrowthNodes.js` in that directory for CPU reference
and TSL evaluation respectively; keep validation separate from node construction.
Each row has
`shortHeight`, `tallHeight`, `width`, `density`, `patchMeters` and shape.
Heights/widths are world metres before wind, interaction and strength reduction.
Density is an acceptance probability against the current candidate count,
not an increase in candidates or LOD reach.

| Biome ID | Short height | Tall height | Width | Density | Patch size | Shape |
| --- | --- | --- | --- | --- | --- | --- |
| 0 marine | 0 | 0 | 0 | 0 | 12 | slender |
| 1 hot desert | 0 | 0 | 0 | 0 | 12 | slender |
| 2 cold desert | 0 | 0 | 0 | 0 | 12 | slender |
| 3 savanna | 0.25 | 0.85 | 0.038 | 0.72 | 14 | slender |
| 4 grassland | 0.18 | 0.55 | 0.045 | 0.92 | 9 | slender |
| 5 tropical seasonal forest | 0.16 | 0.50 | 0.060 | 0.85 | 11 | broadleaf |
| 6 temperate deciduous | 0.12 | 0.38 | 0.042 | 0.85 | 10 | slender |
| 7 tropical rainforest | 0.14 | 0.48 | 0.065 | 0.82 | 12 | broadleaf |
| 8 temperate rainforest | 0.12 | 0.36 | 0.046 | 0.78 | 10 | broadleaf |
| 9 taiga | 0.10 | 0.28 | 0.035 | 0.65 | 12 | slender |
| 10 tundra | 0.06 | 0.16 | 0.028 | 0.28 | 7 | slender |
| 11 glacier | 0 | 0 | 0 | 0 | 12 | slender |
| 12 wetland | 0.28 | 0.95 | 0.042 | 0.82 | 13 | reed |

Use `N = meadowNoise(canonicalXZ / patchMeters)` with the existing noise
implementation, then `tall = smoothstep(0.55,0.75,clamp(N,0,1))` and
`height = mix(shortHeight,tallHeight,tall)`.
Keep the existing stable per-blade width variation 0.88–1.12. Replace the old
global height-range multiplication for mapped IDs; do not apply it again.
Far cards use the same patch N and height multiplied by **1.125**; near blades
use 1.0. Retain existing far-card width, coverage compensation and handoff.

For eligible custom biome IDs without a growth override, use grassland's growth
row and the custom biome's existing palette/eligibility. A noneligible custom
biome stays empty. IDs 13/14, where already used for authored special surfaces,
keep their existing eligibility rules; 14 gets the grassland growth row and 13
remains governed by its path rule. This adds no noncanonical natural biome.

### GPU storage, validation and colour

- Extend the existing look code to
  `shape + 3 * (palette + 8 * growthProfile)`. Growth index 0 is the fallback;
  deduplicate exact growth records in ascending terrain-ID order, maximum 16.
  Use `Uint16Array` for lookup tables that store the encoded code. A far card
  stores `lookCode*4 + atlasVariant` as today. Decode shape, palette and growth
  explicitly; the atlas cell remains `shape*4 + atlasVariant`, not the full code.
- Store growth values in two uniform vec4 arrays of length 16:
  `(shortHeight,tallHeight,width,patchMeters)` and `(density,0,0,0)`.
  CPU compaction reads the same resolved records. Add no vertex buffer,
  instance attribute, per-biome draw or sampled texture. `instanceData.z/w`
  remain wind phase/variation. Every encoded value must round-trip exactly.
- Maximum meadow palettes stays 8. Retain all current palette pairs and add
  only biome 10: base `#666746`, tip `#a3a07a`. IDs 5/6 retain the base palette;
  growth and canopy floor differentiate them. Set the shape mapping to the table.
- Set `meadow.appearance.rootBrightness` to **0.48**, `canopyDepth` to **0.50**,
  `lodWidenMax` to **2.0**. Retain every other appearance value. These replace
  the near-black edge root and excessive far widening without adding plants.
- Validate finite heights ≥0, tall≥short, width>0 for nonzero density,
  density `[0,1]`, patchMeters `[2,64]`, profile count≤16 and palette count≤8.
  Reject invalid settings with the exact config path. Configuration participates
  in compaction/material revision keys; live changes rebuild only affected
  meadow tiles, retaining old complete publication until replacement is ready.

### Forest floor and existing detail layers

Set `trees.forestFloor` values to:

```
grassCoreDensity: 0.28
grassEdgeDensity: 0.78
flowerCoreDensity: 0.10
flowerEdgeDensity: 0.48
bushCoreDensity: 0.28
bushEdgeDensity: 0.95
groundCoreColor: '#46503a'
groundStrength: 0.38
```

Reuse `ForestHabitatField`, `ForestFloor`, existing litter material features and
existing ground-detail canopy rules. Keep tree candidateBudgetPerChunk 144,
maxAcceptedPerChunk 72, groveMix 0.16, age selection and morphology unchanged:
age/grove variation already exists. Do not implement a second tree-age system.
Keep groundDetails perChunk 240, tropicalKit 128, all detail/shadow/residency
budgets and existing densityByTile values. Do not add uniform debris, new log
meshes or seed-head assets. Existing ferns, roots and accents supply that layer.

### Wetland and coast

The wetland-facing audit shot does not prove water is missing. Keep water-domain
geometry and distribution. Make the **surface response** legible through reeds,
mud, damp ground and the existing aquatic-plant layer:

- In material analysis for ID 12 only, set visual wetness
  `W = max(existingW, 0.35 + 0.35 * (1-smoothstep(0.05,0.25,slope)))`.
  This is shading saturation, not a new water body or collision depth. Pass the
  resolved W into VQ-05 and the existing far-colour bake exactly once.
- Keep inland water optics unchanged. Set only sea sunny palette values in
  `config/water-visual.yaml` to lagoon `#3caca8`, shallow `#25858e`,
  deep `#123d50`. Keep storm palette, absorption, depth thresholds, foam,
  reflections/refraction and surf settings unchanged. This moderates the cyan
  sea in poses 02/05; it is not a new water shader.
- Existing shore wetness, rock groups and reeds keep their canonical placement.
  Test continuous depth colour across existing lagoon/deep thresholds. If a
  dark straight band comes from geometry or LOD, do not pretend the palette
  fixed it: require `qa:water:acceptance` and retain the failing view as a gate.

### Imported regression poses and unreviewed landscape scope

Use these fixed canonical Eldara seed points, import hash recorded by VQ-03:

| ID | X, Z | Purpose |
| --- | --- | --- |
| `eldara-forest` | -7134127, 1081563 | woodland and long-coordinate materials |
| `eldara-taiga` | -982683, 371387 | conifers and treeline |
| `eldara-tundra` | -4995717, 970835 | tundra material and elevation snow |
| `eldara-glacier` | -2747061, 316061 | imported ID 11 and near/far terrain seam |
| `eldara-wetland` | 993673, 1701497 | wet surface and shore-facing vegetation |

At each point first capture yaw 0 and π, pitch -0.08 at ground+1.7 m. Then
capture a fly overview at the same X/Z, ground+80 m, yaw 0, pitch -0.45,
FOV 60°. Do not replace uninteresting or awkward views. Record biome IDs;
if the checked-in map no longer matches the expected ID, fail provenance and
regenerate an explicitly versioned manifest rather than silently relabeling.

For shore-facing views at original 05/12 and `eldara-wetland`, sample the
existing water field on an 8 m grid in a 1024 m radius, find the nearest water
point with depth≥0.5 m, and aim toward it (same standing position). Ties sort
by squared distance, then canonical Z, then X. If no such point exists, retain
the original view and report no shore target; that is allowed for a wetland
biome but does not satisfy the coast fixture below.

Marine fixture: start at the audit's marine candidate `(-1893,1803)`, find the
nearest dry land point on the same 8 m grid within 4096 m whose nearest water
point is ≤32 m away; tie-break as above. Stand there, aim at that water point,
record canonical land/water coordinates, then capture ground+1.7 m and +30 m.
Failure to find a pair fails marine coverage. Selection runs in the harness
setup, outside measured frames, and the resulting pose is frozen in the manifest.

These views verify existing medium/far composition. No new mountain ridges,
shore shelves, landmarks or terrain sculpting is in this release. A seam is a
correctness failure: near and far must use matching classification/colour and
canonical origin; fix the divergent consumer instead of altering the landform.

### Tests and gate

Add `test/meadow-growth-profiles.test.js` (all rows, ranges, invalid configs,
custom fallback), extend `test/meadow-ground-palette.test.js`,
`test/meadow-lod-handoff.test.js`, `tests/meadowGrass.test.js`, and add
`test/taiga-prototype-selection.test.js`, `test/wetland-substrate.test.js`.
Verify look encoding for all 256 IDs and every valid shape/palette/profile/card
variant; verify finite geometry bounds after shortened/taller profiles.
Conifer selection must choose forest-pack assets for ID 9 and alpine assets
for ID 10 for 10000 fixed candidates, preserving eligibility and stable IDs.

In the biome appearance fixture add IDs 5/6/10 and the new growth profiles.
For no-wind, no-interaction blades sample 10000 candidates per biome: height
falls inside the table range, width inside its 0.88–1.12 multiplier, density
matches the specified probability within 0.01 before forest/edge filtering.
Near and far evaluate identical patch height before the 1.125 card multiplier.
At 40–50 m handoff compare a fixed projected ground rectangle: coverage changes
by ≤5 percentage points, median RGB error ≤12/255 with temporal effects off.
Use the existing fixture rebase/backend parity thresholds unchanged.

Capture original 03–10/12, all new current-biome poses, and imported/marine poses.
Ground cover must be fully prepared, not merely cheaper because it failed to
load. Confirm no new material sampler, grass buffer binding, instance candidate
budget or residency radius, and no per-biome draw splitting.

```bash
node --test test/meadow-growth-profiles.test.js test/meadow-ground-palette.test.js test/meadow-lod-handoff.test.js tests/meadowGrass.test.js test/taiga-prototype-selection.test.js test/wetland-substrate.test.js
npm run qa:biomes:appearance
npm run qa:vegetation:lod
npm run qa:water:acceptance
```

Use native Windows Node for browser commands from this WSL environment, as
specified in chapter 04. Do not count software-browser output as acceptance.

## VQ-10 — Fix grass folding through the ground

**Confirmed risk.** `foldUnderBody` in `meadowBladeShape.js` computes
`cos(amount * π/2 * 3 * heightRatio)`. At intermediate blade heights this becomes
negative, placing vertices below the root. This is a concrete mathematical
failure, not proof that it explains every triangular remnant in screenshot 08.

**Owners.** `src/editor/stylized/meadow/meadowBladeShape.js`,
`MeadowInteractionMap.js`, `MeadowGrassField.js`. Add
`src/editor/stylized/meadow/meadowInteractionBend.js` for pure reference math.

Replace the body fold with an arc having maximum tip tangent **80°**:

```
a = clamp(press,0,1) * (80 * PI / 180)
r = clamp(vertexHeight / max(bladeHeight,1e-5),0,1)
if a < 1e-4: horizontal = 0; vertical = bladeHeight*r
else:
  horizontal = bladeHeight * (1-cos(a*r)) / a
  vertical   = bladeHeight * sin(a*r) / a
```

Here `bladeHeight` is the current profile/coverage-adjusted stem height, not the
old global 0.64. Use the existing stable fold direction, calculated from the
canonical stem identity so it survives rebases. Blend the already wind-deformed
centreline toward this arc by `smoothstep(0,0.15,press)`; retain ribbon half-width
around the centreline rather than collapsing both side vertices together.
Clamp the folded centreline's Y to `[0,bladeHeight]`, leave the root fixed, and
retain existing dirt/path/footprint suppression. Apply the body and spell maximum
press once. Do not remove terrain collision, add ground holes or increase grass
density to hide the stubs.

Make body-press recovery independent of display refresh: pass elapsed seconds
into `MeadowInteractionMap.update`; recover red-channel press using
`factor = pow(0.94, clamp(dtSeconds,0,0.1)*60)` and float CPU accumulation,
quantizing only when writing texture bytes. Use one Float32 press value per
texel; scroll and clear it with the red-channel body-press buffer, including
origin/cut handling, and account for its bytes in QA. Preserve mark-type channels and
their existing lifetimes. First update uses dt=0; the existing upload interval
stays 2 frames, with a final upload when the map becomes empty. A large camera
cut clears the local transient body press once; persistent world deformation
and spell marks retain their existing ownership, not a blanket terrain reset.

Add `test/meadow-interaction-bend.test.js`; extend
`test/meadow-interaction-press-disc.test.js` and
`tests/meadowInteractionCadence.test.js`. Sweep press 0–1 in 0.01 increments,
height ratio 0–1 in 0.01 increments, and all growth profiles. Root stays fixed,
all coordinates are finite, no centreline is below ground, and the upright
limit is continuous within `1e-4 m`. At equal elapsed time, 30/60/144 Hz body
recovery agrees within 1 texture byte; a press initially 1 falls below 0.03
after one second without stamping. Rebase does not rotate the folded trail.

Capture original 08 with interaction cleared, stamped, and one second after
leaving the stamped area. Also record its ordinary untouched view. If clearing
interaction does not remove a visible bare patch, do not call that patch an
interaction fix; VQ-08/09's coverage diagnostics must explain its actual mask.

```bash
node --test test/meadow-interaction-bend.test.js test/meadow-interaction-press-disc.test.js tests/meadowInteractionCadence.test.js test/meadow-spell-marks.test.js
```
