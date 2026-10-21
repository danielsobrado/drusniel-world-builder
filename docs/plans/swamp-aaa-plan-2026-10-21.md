# Swamp AAA look plan (2026-10-21)

**Goal:** Grukmar's bogs should read like the Valheim swamp references: a dark,
blue-green, fog-choked forest of huge gnarled trunks and bare branch lattices.
The ground is mossy mud islands threaded with still, black, reflective water,
dressed with a dense reed and fern understory and lit by a few warm points of
fire or wisp-light. Performance is tuned afterwards; this plan is only about
the look.

## 0. Where the swamps are (done)

Commit `cbb542ab` converts low-lying (h ≤ 23), river- or water-adjacent
Grukmar taiga to Wetland (biome 12) in both `maps/Eldara …map` and `…Full….json`.
Grukmar goes from 80 to 267 wetland cells out of 633 land cells, the most of
any realm. Burg cells keep their biome.

## Status (2026-10-21)

Built and committed on `main` (`e758ae27` and later). Each item names where
it lives.

| Area | What exists now |
|---|---|
| Trees | `tools/blender/swamp_trees/build_swamp_trees.py` builds three buttressed, fluted swamp giants and a broken snag. Each is one bark mesh on the procedural `swamp` bark profile plus one vertex-coloured leaf mesh carrying twig sprays, sparse leaves and hanging moss. They are the only crowns of `wetland_sparse`, mixed about 11:1 with the scene's dark spruces. The wetland habitat reaches 300 m and keeps at least 0.75 of the regional woodland channel (`regionalForestFloor`). They never merge into far-band canopy blobs (`trees.unclusteredSpecies`). |
| Water | `water/BogPools.js` lays bog ground around a 32 m-lattice water table, with noise islands and pools down to 0.9 m (water domain v4). Bog water is tannin-black, mirror-smooth and foamless (`WaterAppearanceNodes`). |
| Margins | Procedural cattail stands in the aquatic layer (emergent, 0.02–0.45 m water). The existing lily pads and pondweed now find bog pools too. |
| Ground | `soil` column in `config/biome-looks.yaml` (peat for tile 12). `stylized/bog/BogGroundShading.js` pulls the ground toward peat and wet mud at the waterline. The sedge is short, dark and patchy. |
| Understory | `build_swamp_understory.py`: fern, mossy log, stump and cypress knees as tile-12 ground details. Shrubs leave the bog. |
| Air | Bog overcast (`SkyLookController`), `bogMurkLook` (teal murk over sky, fog and cloud, plus `skyFog` fading the dome), and fog beyond the regional bound. The jungle ground mist, spores, midges and fireflies now also run in the `wetland` ambient region. |
| Light | `bogWisps`: slow emissive will-o'-wisps over the pools. `stylized/bog/BogVents.js` with the `bogGasFlame` recipe: swamp-gas flames that catch on dry bog islands in turns, at most three at once. Each has a flickering virtual light and ground pool. No scene lights. |

Also done (2026-10-21, later the same day):

- **Glowing fungi:** `swamp-fungi-01`, toadstools on a rotten stub with an
  emissive cap material (glTF emissive strength 2.5) as a tile-12 ground
  detail, under canopy.
- **Wading sound:** a footfall with at least 4 cm of water over the foot
  splashes (`GlbCharacterView`, `SPLASH_DEPTH`), so ankle-deep bog pools
  sound wet below wading depth.
- **Hanging moss:** swamp crowns opt out of the canopy grade
  (`canopyGrade: false` on the tree variant). The moss keeps its painted
  grey and the leaves their olive.
- **QA:**
  - `npm run qa:world:visual -- --suite bog --out …` captures four frozen
    poses (`BOG_VISUAL_POSES`): `bog-pools` and `bog-forest`, each at ground
    level and from above.
  - `npm run qa:perf -- --headed --qa bog-cross --warmup 8 --settle` runs
    through the swamp forest (`BogCrossFixture`).
- **Heap:** every QA browser runs with an 8 GB JS heap (`docs/perf-qa.md`).

The "rounded lumps on the horizon" were never the far terrain. They were the
tree fallback proxy, drawn for every distant tree whenever the impostor atlas
no longer matches the tree sources. **Any change to a tree GLB, leaf colour or
tree-material option needs `npm run bake:impostors`.** Check
`__worldVisualQa.diagnostics().assetIntegrity.ready` after such a change.

`bog-cross` baseline on this machine (RTX 4080, headed, warmup 8, settled; two
runs). It was recorded with the swamp in place, as there is no pre-swamp build
of this route to A/B against:

| Run | avg FPS | hitches | p50 ms | p95 ms | p99 ms | max ms |
|---|---|---|---|---|---|---|
| 1 | 96.4 | 7 | 9.3 | 14.4 | 29.5 | 120.1 |
| 2 | 98.2 | 7 | 9.0 | 13.8 | 31.2 | 173.7 |

Still open: the app's JS heap itself (2.3–3.3 GB at ordinary poses) and the
tab crash near Grukmar towns. Both are outside the swamp work.

## Today vs target (as planned)

| Layer | Today | Target (reference) |
|---|---|---|
| Trees | `wetland_sparse` = reused birch/meadow GLBs, olive crown, density 0.5 | Giant swamp trunks (flared, twisted, moss-streaked) with bare, fine branch lattices; dead snags; a few dark conifers |
| Understory | Reed-shaped grass, generic bushes, wetland aquatic weeds | Reeds and cattails at water edges, ferns and sedge tussocks on islands, fallen mossy logs, root knees, stumps, fungi |
| Water | Lakes and rivers only; tile 12 tints them `organic` | Standing pools everywhere in the bog, black-green and mirror-still, with duckweed and debris |
| Ground | Tile 12 only adds bake wetness | Peat mud, moss carpet, wet sheen near pools, dark wet band at the waterline |
| Air | `CLIMATE_AIR.wetland` fog ×2.6 | Dense blue-green distance fog, low ground mist on the water, sun dimmed |
| Light | Nothing biome-specific | Will-o-wisps, swamp gas fires, faintly glowing fungi, all virtual |

## Phases

Each phase is a separate commit, with a QA screenshot from the same Grukmar
bog camera (section 8).

### 1. Atmosphere (cheapest, biggest change)

- `src/editor/stylized/sky/regionalSkyLook.js` `CLIMATE_AIR.wetland`: set fog
  tint to desaturated teal (~`#5d7470`), `fogDensityScale` to 3.5–4,
  `directionalIntensity` to ~0.55, and sun glow down. Reference 1's palette is
  teal fog over near-black greens.
- Add a wetland ground mist by reusing the `JungleMist` pattern
  (`src/editor/stylized/ambient/JungleMist.js`) gated by a new `wetland` region
  weight. Its band sits 0–3 m above the water table and drifts with
  `sampleWorldWind`.
- `src/editor/stylized/ambient/ambientRegions.js`: add a `wetland` weight
  (tile 12, half for tile 8). In `config/ambient-effects.yaml`, point
  `midges`, `fireflies` and a slow pollen/spore field at `region: wetland`.
- `src/editor/_clod_shims/biome_visual_state.js`: replace the constant stub
  with a per-biome value so `morningMist` rises in wetland (sunbeam motes).
- Regional grade: there is no per-biome colour grade yet. Add one uniform
  pair (tint, saturation) to the existing `ToneMappingNode`, driven by the
  region weights the way snow country drives exposure. No new pass.

### 2. Swamp water: standing pools

This is the defining feature, and nothing exists for it yet.

- **Water table:** in the terrain detail field for tile 12, lower the ground
  in noise-shaped basins (domain-warped cellular noise, 30–60% coverage) to
  just below a per-cell bog water level. That level is the cell height minus
  ~0.3 m, smoothed across the wetland region. Islands keep their height.
  Rule: the depressions belong in terrain generation, so read
  `docs/perf-qa.md` first and A/B with `qa:perf`.
- **Surface:** extend `StaticWaterSample`/`WaterField` so tile 12 reports a
  static water surface at that level. The existing water slot then meshes
  the pools. The `organic` appearance (`WaterAppearanceNodes.js`) already darkens
  tile 12; push it further: near-opaque black-green body, absorption up,
  roughness low so it mirrors the trees.
- **No refraction in the bog.** Swamp water is opaque, so its chunks always
  compile the non-refractive variant (`createMaterial(false)` in
  `StylizedWaterSlot.js`). This avoids the `viewport*Texture` whole-frame
  cost (see CLAUDE.md) and is also correct for murk.
- **Surface life:** add a duckweed/algae mask (low-frequency noise, thicker
  along banks and in calm pockets) as an albedo layer that also kills the
  reflection. Add floating leaf and twig debris as decals in the same mask.
  Reuse `RainRippleShading.js` for rain, and add slow concentric ripples
  under midges.
- **Shore contact:** a dark wet mud band and a thin scum line where pools
  meet islands, reusing `ShoreContactNodes.js` with a wetland profile (no
  foam).

### 3. Ground surface

- Add terrain surface layers for tile 12 in `config/terrain-material-bake.yaml`:
  peat mud (dark brown, low roughness when wet), moss carpet (on islands and
  under canopy) and leaf litter. They are blended by slope, distance to the
  water table, and canopy.
- `TerrainWetlandWetness.js`: drive wetness by height above the water table,
  not only slope, so ground darkens and gloss rises toward the pools.
- Meadow on tile 12: lower `groundDetail` brightness and shift the palette
  toward the reference's deep green (`grass.meadow.palette.byTileId.12`).
  Thin the grass to clumps on islands and none in pools.

### 4. Swamp trees (the silhouette)

- Add a new species `swamp_giant` to `ForestSpeciesRegistry.js` with
  morphology in `morphology/constants.js`:
  - trunk 1.5–3 m wide, strong base flare and buttress roots
  - lean and twist noise, with a split or fork in some trunks
  - crown made of fine bare branches with sparse dark leaves (leaf density ~0.15)
- Bark: dark wet bark with a moss mask that grows on upward faces and
  thickens toward the base (vertex colour / AO baked per the workshop rules),
  plus a wet gloss at the base.
- Add `swamp_snag` (dead, broken top, no leaves) and keep a few dark
  conifers, as in the references.
- Update the wetland mix in `ForestBiomeProfiles.js`:
  `swamp_giant 0.55, swamp_snag 0.2, conifer_narrow 0.1, wetland_sparse 0.15`.
  Raise density, since the references are a closed forest, and allow trees
  standing in shallow water (`waterMaximum`), rooted on small root mounds.
- **Hanging moss:** procedural strand cards (alpha-tested, wind via
  `foliageWind.js`) attached to branch tips during tree generation, on
  `swamp_giant` and `swamp_snag` only.
- Impostors and LOD: regenerate through the existing
  `StylizedTreePrototypes`/`TreeLodAssembler` path. Only trees may block the
  first frame, and these are trees.

### 5. Understory: a `wetlandKit` layer

Copy the `tropicalKit` layer pattern. The wiring list is in
`StylizedSurfaceViewBase.js`, `BiomeAssetPalette.js`, the validators,
`SceneSettingsBase.js`, `PlacementPreparationWindow.js`, the QA vegetation view
and the asset scripts. Use `tileIds: [12]` and stream through
`StylizedVariantResidency`. Nothing is added to `bootstrapLayers`.

Placement zones are keyed to the new water table:

| Zone | Contents |
|---|---|
| Open water | Lily pads and pondweed (existing `aquaticPlants`), duckweed (shader) |
| Water edge (±0.5 m) | Cattails and reed stands in dense clumps, sedge |
| Mud islands | Fern clusters (existing `fern_01/02.glb`, unused today), sedge tussocks, low shrubs |
| Under canopy | Fallen mossy logs, root knees, stumps, bracket and glow fungi |

- Procedural (no GLB, `proceduralFlora.js` + `appendProceduralPrototypes`, as
  `shoreLife` does): cattails, reeds, logs, root knees, stumps and fungi.
- Authored: ferns. Hero logs come later via the Blender kit if the
  procedural ones fall short.
- Clumping: use cluster noise rather than uniform scatter, because the
  references read as patches.

### 6. Lights and glow (all virtual)

No scene lights (CLAUDE.md).

- **Will-o-wisps:** a few drifting particles per bog cell from the spell VFX
  atlas, one instanced draw, with emissive and bloom. The nearest one feeds
  the `spellWorldLight` uniforms only when no spell owns them, so it lights
  terrain and meadow.
- **Swamp gas fires** (reference 1's flames): rare vents on islands.
  Each is a flame particle column with a ground light pool, plus a
  reflection streak on the water through SSR.
- **Glow fungi:** emissive vertex colour on the fungi prototypes, with a
  pulse uniform. They only show in the dark.
- Ambient fireflies at dusk already exist; route them to `wetland`.

### 7. Sound

Already wired: frogs, mosquitoes, `wetland-01.mp3` and mud footsteps. Add
a water-wading footstep when the player is below the water table.

### 8. QA

- Add a Grukmar bog pose to `WorldVisualQa`. Pick a burg near a converted
  cluster, e.g. Bogril (cell 5471) or Stiaghel (6135), and capture
  ground-level and elevated shots like the references.
- Compare each phase against the references for silhouette, palette and
  fog depth.
- Run a `qa:perf` A/B on phases 2, 4 and 5 (terrain, trees, scatter), at the
  same `--warmup`, before tuning.

## Order

1 → 2 → 4 → 5 → 3 → 6. Atmosphere and water set the mood, trees set the
silhouette, and understory, ground and lights refine it.
