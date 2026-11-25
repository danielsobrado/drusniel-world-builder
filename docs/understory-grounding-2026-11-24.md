# Understory grounding

Shrubs, ferns and ground plants read as pasted on: pale and flat beside the grass,
with near-black stems and a dark pool at their foot. Six causes, mostly in the
shared understory material path (`stylized/AuthoredFoliageMaterial.js`,
`BushRenderAssets.js`, `flora/biomeUnderstoryPrototypes.js`, `forest/foliageLight.js`).

## Causes and fixes

1. **Authored bushes were metallic.** glTF's `metallicFactor` defaults to 1, and the
   bush GLBs (`bush.glb`, `stylized_bush.glb`, the juniper, thorn and hibiscus
   bushes) never set it; the sapling also packs metalness into its ORM texture.
   Metal has no diffuse term, so those shrubs took no sun and were lit by the sky
   fill and the HDR reflection alone: flat, pale and cool next to the Lambert
   grass. `cloneAuthoredNodeMaterial(…, { lit: true })` now makes every lit plant
   dielectric (`metalness = 0`, no `metalnessMap`).
2. **The foot was darkened three times.** A fixed 0.60 AO floor, times the
   ground-contact term, times a sky fill cut to 0.42 at the base, drew a black
   base under every plant, even alone on open ground. `understoryFootShade`
   now follows the grass (`meadowPigment`'s `groundAo`): the foot darkens only as
   far as the ground field's contact shade says, and the whole plant takes the
   same canopy shade the grass takes under crowns. The foot keeps 0.7 of the
   fill, and the soil tint covers the lowest 22% of the plant at up to 55%.
3. **Stem cards stood vertical under a high sun.** The sapling's trunk is a
   vertical card; at noon the sun only grazed it, and with the puff normal barely
   bent at the bottom it stayed a black bar in sunlit grass (with a flat grey
   albedo and no emission it still rendered at sRGB ~46). The lower 40% of a
   plant now leans its normal to the terrain's (`seatPlantNormal`, read from the
   existing ground-contact field, applied in `applySkywardNormal`), so the foot
   shades like the ground it stands in. Bush proxies get the same seat.

4. **No shade under a shrub.** Bushes cast no shadow-map shadow
   (`BUSH_CAST_SHADOW`); their footprint in the contact shade was 0.56 strong,
   and its quadratic falloff dropped below the terrain's 0.1 darkening ramp by
   half the radius. Grass tips took only 55% of the contact shade, so in a
   meadow the shade never reached the top of the sward. Bushes now paint at 0.95
   over a 1 m base radius (`contactShade.js`), and grass tips take 85%
   (`meadowPigment.js`). That share also deepens the grass round trunks and
   stones, which were already painted at 1 and 0.8.
5. **A cooler hue than the grass.** The understory ramp is the configured meadow
   palette, but the grass's own pigment pipeline (ground style, stand tones,
   straw seeds, warm transmission) renders the sward warmer. Measured at noon,
   red/green matched (0.80 to 0.77) and only blue was high (blue/green 0.6 to
   0.45). `resolveFoliagePalette` keeps 0.68 of the ramp's linear blue, which
   covers near plants, bush proxies and floating leaves in one place.

6. **Flat crowns.** Shrubs cast no shadow on themselves and have no baked sky
   visibility, so inner and underside leaves took the same sun and sky as the
   shell and a crown read as one flat sheet. `crownInteriorVisibilityNode`
   (`forest/TreeFoliageSurface.js`) estimates it per vertex from the bounds
   ellipsoid: 1 on the shell, 0.45 at the core, and up to 28% less on the
   underside. It scales the sky fill and ambient occlusion, gates transmission
   (`foliageVisibilityNode`, as the trees' baked visibility does) and takes half
   of it off the albedo in place of self-shadow (`CROWN_SELF_SHADE`). Bush
   proxies use the same, so the LOD swap keeps the depth. It stays moderate:
   stronger, the stems inside a crown go black again.

No new texture, sampler, scene light or `viewport*Texture` node, and one float
varying per material: scene light or `viewport*Texture` node:
the ground normal and contact shade come from varyings the material already had.

## Not changed

The pine crowns (`stylized-pine-near-*`) carry a physical material with
roughness 0; they are trees, outside this change.

## Captures

`qa:look` at noon, clear (`--only forest-off-12,grassland-off-12,core-deciduous-off-12,core-rainforest-off-12 --no-gates`),
before on `10f1b931`, after with the change; left before, right after:

- [Grassland](qa/understory-grounding-2026-11-24/grassland-detail.jpg) — stem bases lit like the ground and blended into it, no black pool.
- [Forest](qa/understory-grounding-2026-11-24/forest-detail.jpg) — the shrub now sits in the grass's value range.
- [Rainforest](qa/understory-grounding-2026-11-24/core-rainforest-detail.jpg) — plant bases less of a dark blob.
- Full frames: [grassland](qa/understory-grounding-2026-11-24/grassland-before-after.jpg),
  [forest](qa/understory-grounding-2026-11-24/forest-before-after.jpg),
  [rainforest](qa/understory-grounding-2026-11-24/core-rainforest-before-after.jpg),
  [deciduous](qa/understory-grounding-2026-11-24/core-deciduous-before-after.jpg).
- Crown interior (item 6), captured back to back with only its files swapped, since
  other sessions share this checkout and runs minutes apart differ in scatter:
  [grassland](qa/understory-grounding-2026-11-24/grassland-crown.jpg),
  [forest](qa/understory-grounding-2026-11-24/forest-crown.jpg).

## Performance

`qa:perf --headed --qa chunk-cross --warmup 8 --duration 12 --settle --x 2005 --z 2941`
(rainforest start), A/B/A/B on the same dev server, A = the five shader files at
`HEAD`, NVIDIA Lovelace WebGPU, no fallback adapter:

| Run | Avg FPS | dt p50 / p95 / p99 ms | Hitches |
| --- | --- | --- | --- |
| B1 (change) | 72.2 | 13.5 / 24.5 / 33.0 | 8 |
| A1 (base) | 72.6 | 13.4 / 26.8 / 32.3 | 4 |
| B2 (change) | 72.3 | 13.5 / 27.0 / 32.6 | 3 |
| A2 (base) | 71.2 | 13.6 / 29.2 / 33.5 | 12 |

Neutral, above the 60 FPS floor. Absolute FPS sits below the usual band for this
route: other sessions shared the GPU, equally in both arms.

Shade and hue (items 4 and 5), same route and warmup, A = `a196e531`:

| Run | Avg FPS | dt p50 / p95 / p99 ms | Hitches |
| --- | --- | --- | --- |
| B1 (change) | 70.0 | 13.9 / 28.9 / 33.1 | 6 |
| A1 (base) | 70.7 | 13.7 / 29.8 / 33.8 | 11 |
| B2 (change) | 71.1 | 13.8 / 28.1 / 33.0 | 7 |
| A2 (base) | 72.1 | 13.4 / 28.5 / 32.3 | 5 |

Within run noise: two shader constants and a larger painted footprint, no new
work per frame.

Crown interior (item 6), same route and warmup, A = `9aea7b80`:

| Run | Avg FPS | dt p50 / p95 / p99 ms | Hitches |
| --- | --- | --- | --- |
| B1 (change) | 72.9 | 13.5 / 24.6 / 32.4 | 5 |
| A1 (base) | 72.4 | 13.5 / 25.6 / 31.9 | 2 |
| B2 (change) | 73.6 | 13.2 / 23.4 / 32.3 | 2 |
| A2 (base) | 73.2 | 13.5 / 22.0 / 32.3 | 3 |

Neutral.

## Follow-up (2026-11-25): AAA shrub models, biome variants & instance variation

1. **Rebuilt all shrub models with real scanned foliage/bark atlases** (`tools/blender/biome_understory/build_aaa_bushes.py`, `shrub_atlases.py`, `shrub_architecture.py`; `npm run build:aaa-bushes`). Replaced the bare V-stick / painted-fan temperate bushes (`stylized_bush`, `small_bush`, `bush2`, `bush`), the giant-triangle solid-leaf shrubs (`bush-boreal-juniper-01`, `bush-swamp-buttonbush-01`, `bush-arid-rooibos-01`), the legacy 148-triangle placeholders (`bush-meadow-gorse-01`, `bush-arid-ocotillo-01`, `bush-savanna-thorn-01`), the broken unnormalized `BLEND` `bamboo_bush`, and the undecimatable `bush-taiga-sapling-01` with 20 cohesive, dielectric (`metallicFactor: 0`), `alphaMode: MASK`, normal-mapped PBR models composed from the cached 2K CC0 Poly Haven foliage and bark scans (`shrub_04`, `island_tree_02`, `fir_tree_01`, `jacaranda_tree`, `didelta_spinosa`, and scanned barks). Every model uses 3-tier volumetric branching (inner skirt + mid-canopy + irregular outer shoots) at **539–1,638 triangles** (down ~10× from 15–16k triangles).
2. **Expanded biome shrub variety to 3–7 distinct species per biome** (`editor.config.yaml`, enforced in `tests/biomeContract.test.js`). Added 7 new biome species (`bush-woodland-shrub-04`, `bush-forest-rhododendron-01`, `bush-taiga-sapling-01`, `bush-boreal-bilberry-01`, `bush-wetland-willow-01`, `bush-tropical-palm-shrub-01`, `bush-steppe-sagebrush-01`, `bush-arid-didelta-01`) and wired previously unused `bush-meadow-gorse-01`, `bush-arid-ocotillo-01`, and `bush-savanna-thorn-01`, replacing duplicate rescaled entries so per-biome draw counts stay flat or lower while eliminating monocultures in desert (1 → 3), cold steppe (2 → 3), tundra (1 → 3), and badlands (1 → 4).
3. **Terrain-slope seating, non-uniform proportions & per-instance hue variation** (`src/editor/stylized/bushInstanceTransform.js`, `StylizedBushView.js`). Accepted shrubs now seat on slopes with gentle downhill root sink and partial ground-normal tilt (`24%`), deterministic volume-preserving XZ/Y aspect variation (`±13%`) + subtle organic lean (`±4°`), and a bounded warm/cool botanical hue shift (`±5.5%`) folded into the existing `instanceBiomeLook` attribute at zero extra shader cost.
4. **Expanded 100-triangle LOD proxy silhouettes** (`src/editor/stylized/BushRenderAssets.js`). Added `uprightSapling`, `lowMound`, `tallCane`, and `broadleafCrown` 5-lobe proxy profiles and mapped all 20 shrub species in `resolveBushProxyProfile`.

Visual captures (live WebGPU, `qa:look`, noon, clear): `docs/qa/shrub-aaa-2026-11-25/` (`grassland`, `forest`, `core-deciduous`, `core-rainforest`, `wetland`, `desert`) and `docs/qa/shrub-aaa-2026-11-25-taiga/` (`core-taiga`), plus Blender 20-shrub contact sheet in `tmp/understory/aaa-bushes/contact-sheet.png`.
Headed `qa:perf` could not acquire Windows native foreground activation in this session (`Windows could not activate the owned benchmark browser`), so hardware FPS A/B should be re-run when the desktop is unlocked/uncontested; triangle counts per shrub dropped ~10× and per-biome bush draw counts stayed flat or decreased.
