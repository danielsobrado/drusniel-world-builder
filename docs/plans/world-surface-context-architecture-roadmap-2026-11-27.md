# World Surface Context (WSC) — Reusable AAA Grounding & Environmental Integration Roadmap

> **Date:** 2026-11-25 (updated 2026-11-26 for PR 5 and PR 6, 2026-11-27 for PR 7, PR 8 and PR 9)  
> **PR 0 Baseline:** `054d0d44` (auditing production commit `b7183e59` on `main`; see [PR 0 Baseline Audit](world-surface-context-pr-00-baseline-2026-11-25.md))  
> **Engine Baseline:** Three.js `^0.187.0` (`WebGPURenderer`, TSL node materials), canonical signed world coordinates + floating render origin, `64 × 64` streamed terrain pages, Azgaar biome IDs `0–12` (plus custom `32–254`).

---

## 1. Architectural Thesis

The grounding disconnects observed in Stillmeadow (`B14`) and across 18 baseline locations (`B01`–`B18`) are the interaction of **five orthogonal layers**, not a single shader tint problem:

1. **Contact geometry** (terrain-conforming skirts / vertex seating, bounded morph zones)
2. **Surface-material continuity** (shared resolved unlit terrain albedo, roughness, and normals)
3. **Environmental coatings** (shared moss, snow, mud/dust, wetness via `PbrCoatBlend`)
4. **Ecological response** (bidirectional canopy, litter, contact occupancy, vegetation suppression)
5. **Lighting & ambient symmetry** (retiring conflicting unshadowed emissive fills and double-counted AO)

Rather than building a full Unreal-style Runtime Virtual Texture (RVT) page table up front, Drusniel evolves its existing camera-centred `GroundContactField` into a compact **World Surface Context (WSC)** built on three cleanly separated surface fields:

```text
A. Surface Geometry Field (`wscGeoTexture`, RGBA16F, NoColorSpace)
   R: height - baseHeight (m)
   G: terrain normal X
   B: terrain normal Z
   A: explicit per-texel validity (1 = resident finite terrain, 0 = unloaded/missing)

B. Resolved Surface Base Field (`wscBaseTexture`, RGBA8, NoColorSpace)
   RGB: sqrt(linear low-frequency unlit terrain albedo)
   A:   surface roughness (0..1)

C. Ecological Influence Field (`wscEcoTexture`, RGBA8, NoColorSpace)
   R: contact occlusion (0..1)
   G: canopy coverage (0..1)
   B: forest litter coverage (0..1)
   A: vegetation / grass coverage (0..1)
```

### Core Design Rules

- **Publish resolved unlit linear material state, never final lit/tone-mapped pixels.**
- **Zero sampler pressure:** all WSC reads use `bilinearTexels` / `textureLoad` (zero WebGPU sampler bindings) and prefer vertex-stage evaluation with compact varyings (`sampleWorldSurfaceContextVarying`).
- **Explicit per-texel validity:** validity-weighted bilinear filtering prevents height dips toward `0` and prevents missing/unloaded slots from leaking bogus soil colors across streaming edges.
- **Canonical coordinate stability:** window origins track canonical metres (`canonicalOrigin`) and update `renderOrigin = canonicalOrigin - floatingOrigin` every frame; procedural pattern phases wrap in canonical space.
- **No general scene SDF, no PDO hack, no translucent skirts everywhere:** use terrain heightfield separation `d = P.y - H(P.xz)` for heightfield grounding, opaque vertex-conformed skirts (or alpha-hashed transition strips where needed), and keep material identity outside the contact region.
- **Azgaar invariant:** preserve standard biome IDs `0–12` and custom biome IDs `32–254` untouched.

---

## 2. Production References Grounding This Design

- **Activision SIGGRAPH 2023 (*Large-Scale Terrain Rendering in Call of Duty*):** two-sided terrain integration combining bounded vertex morphing ("skirts") toward terrain height with low-resolution terrain surface color sampling for clutter/grass and mesh contact blending.
- **Ubisoft (*Far Cry 5 Terrain Rendering on Zeta*):** shared terrain shading on cliff/adjacent geometry and procedural terrain influence footprints.
- **Epic Games (*Unreal Engine Runtime Virtual Texturing*):** separation of unlit material state from display lighting (adopted conceptually via a bounded camera window before considering a page cache).
- **Sucker Punch (*Ghost of Tsushima*):** shared procedural placement/appearance fields for large-scale coherent grass.
- **Drusniel Ponlai PR-G Specification (`docs/plans/ponlai-pr-g-ground-bounce-ambient-relighting-2026-11-21.md`):** separation of linear diffuse reflectance from lighting/GI and explicit warning against stacking ambient bounce over legacy fake emissive fills.

---

## 3. Reconciled 9-PR Execution Roadmap (Updated With PR 0 Measurements)

PR 0 (`054d0d44`) validated every architectural hypothesis and introduced **one key sequencing refinement** in **PR 3**: unlit grass albedo (`D01`) is already **+19.4% to +75.5% brighter** than terrain, yet lit grass (`D00`) plunges to **−37.1% to −54.7% darker** due to a **32× emissive asymmetry** (`FOREST_FLOOR_FILL = 0.80` on terrain vs `appearance.fill = 0.025` on grass in `D18`) plus stacked root AO (`DS-01 ≈ 0.163×`). Consequently, PR 3 must remove the forest-floor/grass emissive asymmetry and `DS-01` root double-darkening alongside coverage conservation rather than deferring all fill alignment until PR 9.

| PR | Title | Core Deliverables | Key Verification Gate |
|---|---|---|---|
| **PR 0** | **Baseline, Audit & Visual Diagnostics** *(Complete: `054d0d44`)* | `D00`–`D25` diagnostic modes, 5-substrate fixture, 215 hardware WebGPU screenshots, 27 CIEDE2000 comparisons, Galleries A–H, 17-family audit. | Baseline frozen; `D00` zero overhead (`143.8 FPS` on fixture). |
| **PR 1** | **WSC Contract & Per-Texel Validity** *(Complete: `da7af5ff`)* | `WorldSurfaceContextState.js` 3-texture contract (`wscGeo`/`wscBase`/`wscEco`), validity-weighted bilinear sampling (TSL + CPU), backwards-compatible `GroundContactState` bridge, explicit per-texel validity (`DEF-08` fixed), one-sided edge-normal derivatives beside unloaded slots, smart saturated-budget retention on routine walking recenters, `D15` upgrade, comprehensive unit tests (missing slots, unloaded-edge normals, chunk edges, negative coords, recentering, floating-origin). Zero visual redesign. | Zero invalid texel leakage (`STR-TP01`); exact slope normals beside unloaded slots; canonical invariance across floating-origin rebases; `D00` parity. |
| **PR 2** | **Shared Resolved Low-Frequency Terrain Surface** *(Complete: `772d18a9`)* | Low-frequency unlit terrain surface evaluator (`TerrainSurfaceEvaluator.js`) that feature-mirrors the low-frequency pipeline of `terrainMaterial.js`, `MeadowGroundShading.js`, and `TerrainMaterialBakedNodes.js` (`substrates`, `genomes`, `weathering`, `worldNoise`, `proceduralDirt`, `naturalTrail`, `pathWear`, rock/snow/wetness roughness), with exact CPU-vs-GPU bilinear texel-centre filtering (`bilinearTexelCoords`, `sampleMaterialBakeChannels`, `sampleRgba8Bilinear`) verified by permanent unit tests, no obvious per-texel authored allocations in the 128×128 rebuild loop, and orthogonal contact-AO in `wscEcoTexture.r`. | Reproducible hardware WebGPU QA (`npm run qa:wsc:pr2-pr3`, [metrics.json](../qa/world-surface-context/pr-02-03/metrics.json), masked by `D24 terrain ∩ D15 valid interior`) paired per-pixel `D12` vs `D01`: Stillmeadow `C02` `median 4.55 / p95 9.19 ΔE00` (`meanColor 0.36`, `-0.37%` luma), `C05` `median 3.67 / p95 10.18` (`road-only median 3.63 / p95 8.70`, `natural-only median 3.88 / p95 13.53`), Temp. Rainforest `B03-C02` `median 4.29 / p95 8.17` (`-3.61%` luma), Grassland `B01-C02` `median 6.62 / p95 13.56` (`meanColor 3.43`, `+1.67%` luma; sub-metre turf micro-detail variance); `20 m` recenter `validCoverage 1.000 → 1.000`. |
| **PR 3** | **Grass/Ground Conservation & Floor Fill Symmetry** *(Complete: `f87676a5`)* | Migrated near grass blades (`meadowBladeMaterial.js`) & far cards (`meadowCardMaterial.js`) to `MeshStandardNodeMaterial` (`roughness: 0.90`, `metalness: 0`) for `scene.environment` HDR IBL parity with terrain; unified shared `FOREST_FLOOR_FILL = 0.62` (`foliageLight.js`) across terrain, blades, and cards; rewired `meadowPigment.js` onto WSC `wsc.albedo` + shared `resolveTerrainWorldNoiseMean()` while removing `DS-01` stacked root darkening; multiplied distant `terrainGrassVolume` by `bakedSurface.worldNoiseMultiplier`; published canopy/path-attenuated ecological coverage in `wscEcoTexture.a` and upgraded `D11`. | Reproducible hardware WebGPU QA (`npm run qa:wsc:pr2-pr3`, [metrics.json](../qa/world-surface-context/pr-02-03/metrics.json), [visual sheets](../qa/world-surface-context/pr-02-03/)): Stillmeadow `B14-C01` `D00 -37.1% → -2.44%` (`ΔE00 = 2.50`), `B14-C02` `D00 ΔE00 = 1.54` (`-9.29%`), Grassland `B01-C02` `D00 ΔE00 = 1.52` (`+5.40%`) / `D01 1.61`, Tropical Rainforest `B04-C02` `D00 -49.2% → +10.43%` (`ΔE00 = 3.01`), Deciduous `B02-C02` `D00 ΔE00 = 5.06`, Temp. Rainforest `B03-C02` `D00 ΔE00 = 5.93`; `D18` emissive symmetry confirmed (`terrain 0.0019` vs `grass 0.0064`); configured grass LOD sweep (`0, 12, 32, 45, 58, 95 m`) committed. |
| **PR 4** | **Generic Contact Material Blending** *(Complete: `74a3df4e`)* | Added YAML-configured per-family contact profiles ([config/wsc-contact.yaml](../../config/wsc-contact.yaml), `WorldSurfaceContactConfig.js`, registered in `loadEditorConfig.js`) and one pure TSL PBR contact helper (`applyWorldSurfaceContact` in `WorldSurfaceContactNodes.js`, composed via `PbrCoatBlend.blendCoat` with zero extra WebGPU samplers, identity-preserving grain modulation, validity-gated slope-normal blending, and orthogonal contact AO). Migrated all 7 material families: tree bark (`barkWeathering.js`, upgrading `DEF-06` from 0.15 m to a ragged 0.34 m root collar), authored rocks (`rockWeathering.js`), alpine rocks (`AlpineRockMaterial.js`), authored shrubs (`AuthoredFoliageMaterial.js`), bush proxies (`BushRenderAssets.js`), biome understory flora (`biomeUnderstoryPrototypes.js`), and forest debris deadwood + moss mounds (`forestDebrisPrototypes.js`, newly connected to WSC). | 51/51 WSC + shader + 8-family WGSL compilation tests pass (`tests/worldSurfaceContextPr4.test.js`); reproducible hardware WebGPU QA (`npm run qa:wsc:pr4`, [metrics.json](../qa/world-surface-context/pr-04/metrics.json), [pr4-contact-sheet.jpg](../qa/world-surface-context/pr-04/pr4-contact-sheet.jpg)): Stillmeadow `B14-C01` trunks `D00 ΔE00 = 3.89` with measured collar-vs-upper identity preservation (`base D01 ΔE00 = 15.15 / +39.6%` vs `upper 17.98 / +80.1%`), `B03-C02` fallen log debris `D00 -5.88%` luma, `B16` grass-sand rocks `D01 -5.28%`, `B17` seamless snow-rock collars preserving granite faces above. |
| **PR 5** | **Generic Geometry Conformer / Contact Skirt** *(Complete)* | Retired `groundSeating.applyShaderGroundConform` for one declarative TSL vertex morph, `applyGroundContactDeform` (`worldSurfaceContext/GroundContactDeformer.js`), driven by a per-profile `conform` block in [config/wsc-contact.yaml](../../config/wsc-contact.yaml) (`mode`, `bandShare`, `minBandMeters`, `buryMeters`, `maxOffsetMeters`; validated in `WorldSurfaceContactConfig.js`). Modes: `hug` (understory, bush proxies, ground details: base follows `H(vertex) − H(root)`, as before) and `settle` (authored boulders via `StylizedRockView`: only the non-planar residual `H(vertex) − plane(root)`, pull-down only, so a rim over a hollow or convex ridge lands on the ground while humps stay embedded and planar slopes are left to the CPU sink/tilt). The morph is band-faded, clamped, gated by WSC validity at vertex and root, and branch-skipped above the band; it lives in `positionNode`, which three's shadow override copies, so shadow depth matches. Opaque only: no alpha-hashed strips were needed. **Tree root plates deliberately stay on the CPU `TreeRootFitter`** (37-sample least-squares plane over the real root reach, sunk below every exact terrain sample), which already rules out floating roots; a WSC residual on trunks was built, measured at ≈ −3 FPS on dense-mixed (`82.9–86.5` vs `89` FPS) for 1 m-texel hump following, and removed. `StylizedLodRuntime` now keeps root-carrying meshes without a sway reach on incremental bounds. | `tests/worldSurfaceContextPr5.test.js` (CPU mirror `groundContactDeformOffset`: planar slope untouched, convex-ridge rim lands exactly within `maxOffsetMeters`, humps never lift, bounded, band fade, validity 0 → 0; WGSL compile reading `instancePlantRoot`); full suite 5215/5215 before the final trim. Headed RTX 4080 `qa:perf --qa diagonal --density dense-mixed --settle`, A/B/A/B/A/B: unmodified `89.35 / 88.85 / 87.43` FPS vs PR 5 `89.10 / 86.94 / 87.40` (paired A3/D3 identical; mean Δ ≈ 0.09 ms, within noise) — [pr-05 QA](../qa/world-surface-context/pr-05/README.md). `qa:wsc:pr4` captures before/after are visually identical (no regression on the B14/B03/B16/B17 scenes); those scenes are flat, so the slope gate rests on the CPU-mirror tests; the steepest-seated boulders near B02 and B15, captured along the contour in [contact-gaps QA](../qa/world-surface-context/contact-gaps/README.md), sit embedded with no lifted rim or uphill gap. |
| **PR 6** | **Bidirectional Ecological Footprints** *(Complete: `edb2fdc1`)* | One shared lobed footprint outline and phase (`groundContact/ecologicalFootprint.js`) for the meadow root-zone grass clearing and the trunk/bush/stone contact-shade duff (`contactShade.js`, trig-free per texel); multi-radius trunk footprints adding a canopy-weighted root-disturbance litter ring (`rootLitter*` in `contactShade` settings, `forestFloorTexture.b`); WSC `eco.a` vegetation coverage now carries trunk/stone grass suppression (`contactGrassSuppression`). Moisture deferred (no free eco channel). | Unit gate `tests/worldSurfaceContextPr6.test.js` (lobed iso-lines match the meadow outline; wide vs narrow lobe > 20/255 at equal distance); hardware captures ([pr-06](../qa/world-surface-context/pr-06/README.md)) show irregular patches in B02-C03 `D08`; paint cost 1.21 → 1.28 ms + 1.15 ms litter per 500-tree chunk. Trees-hidden top-down `D08` ([contact-gaps QA](../qa/world-surface-context/contact-gaps/README.md)) showed every footprint was one stamped triangle (a single 3rd harmonic); footprints are now per-placement mixes of the 1st/2nd/3rd/5th harmonics (±0.34), and the same view exposed and fixed chunk-edge seams in the forest floor, material bake and surface mask. |
| **PR 7** | **Settlements, Foundations & Roads** *(Complete: `b1e36fce`, tuned in the QA commit)* | Town walls meet the ground through the WSC `foundation` contact profile (`render/materials/townGroundContact.js`, wired in `townGrade.js`): the band follows the terrain height at the foot in a soil derived from the WSC terrain albedo (town-ground hue, value pulled halfway to `TOWN_GROUND`), and only vertices within 2.5 m of the ground line fetch the WSC (8 `textureLoad`s inside a vertex branch, one varying). Earth paving (lanes, gate approaches, building aprons) takes the same soil; `TOWN_GROUND` is only the fallback beyond the WSC window (`DEF-13`). Apron rims swell with plan-space noise instead of a ruled margin. Road shoulders/verges were already carried by the path paint's tread/verge split and are unchanged. | Unit gate `tests/worldSurfaceContextPr7.test.js`; hardware captures [pr-07](../qa/world-surface-context/pr-07/README.md) (`B14-C05`, `B14-C06`, `B18`) with a before/after of the B18 wall foot; `settlement-approach` perf: only fully valid run 73.3 FPS (PR 7), paired runs 71.5 → 70.4, low outliers in both arms from GPU contention. |
| **PR 8** | **Shared Environmental Coatings** *(Complete: `f3f136d9`, `207ab467`)* | One coverage contract (`surfaceCoatings/CoatCoverage.js`): rocks, alpine crags and snow caps, trunks, deadwood, the town kit, workshop houses, settlement snow and the terrain's baked snow publish the moss/snow/wet masks they lay (WeakMap, inherited at clone sites; `userData` died in `clone()`). One moss pigment (`surfaceCoatings.moss.palette`) replaces three per-material palettes; deadwood moss and trunk/deadwood snow are coats (colour, roughness, normal), not colour mixes. B17's boulder foot is a wind-swung drift with a clinging band (`snowDeposition.js`), alongside another agent's concurrent snow-cap geometry and cool contact AO. Mud/dust stays per surface. | `D22` upgraded to full ("Moss coat coverage", each surface's published coverage drawn in a clone of its own material) and `D23` made real; hardware captures ([pr-08](../qa/world-surface-context/pr-08/README.md)) show B17's thin uniform white rim replaced by banked, capped snow; `tests/worldSurfaceContextPr8.test.js`. |
| **PR 9** | **Lighting & Spatial Ground-Bounce Integration** *(Complete, partial gate)* | Spatial ambient for stones and bark (`worldSurfaceContext/WorldSurfaceAmbient.js`): canopy and contact from the WSC scale the sky fill, the local ground's albedo colours the bounce (hemisphere energy kept), one vertex fetch in one packed varying, exact parity outside the window; far impostors opt out. Cloud cover turns sun into sky light (`overcastSkyLook`: ambient ×1.6 at full cover, storm ladder still darkens, total light still falls). Ponlai PR-G probe GI stays a spec (its PR F dependency is absent); buildings keep their fill. | Gallery F re-measured ([pr-09](../qa/world-surface-context/pr-09/README.md)): rain on open ground +31 %, overcast +9 %, sunlit hours unchanged; woodland trunk-over-floor glow in D17 3.7× → 3.1×. Not met: woodland rain stays a grey wash (valley mist, not sky fog), bark still ~3× its floor (`BARK_FILL`, under concurrent rework); `DEF-14`'s black woodland twilight from PR 0 no longer reproduces (sunset woodland 0.0097 linear, readable). |

---

## 4. Target YAML Configuration Shape (Introduced Progressively PR 1–8)

```yaml
worldSurfaceContext:
  enabled: true
  resolution: 128
  spanMeters: 128
  recenterThresholdMeters: 16
  borderFadeMeters: 12
  contact:
    grass:      { blendHeightM: 0.08, surfaceShare: 0.65, normalShare: 0.15 }
    understory: { blendHeightM: 0.18, surfaceShare: 0.55, normalShare: 0.30 }
    tree:       { blendHeightM: 0.28, surfaceShare: 0.45, normalShare: 0.35 }
    rock:       { blendHeightM: 0.35, surfaceShare: 0.60, normalShare: 0.45 }
    foundation: { blendHeightM: 0.20, surfaceShare: 0.35, normalShare: 0.10 }
```

*(Contact numeric weights above are initial placeholders to be calibrated via PR 4/7 visual QA against the PR 0 baseline.)*

---

## 5. Engineering Budgets & Acceptance Gates

### Performance Budgets (Measured Against PR 0 Baseline)
- WSC CPU field rebuild: `< 0.5 ms` amortised/frame
- WSC GPU texture upload: `< 0.25 ms` amortised/frame
- Incremental GPU shading cost: `< 0.5 ms` typical scene (`< 1.0 ms` total GPU p95 increment)
- Additional per-material WebGPU samplers: `0` (via `textureLoad` / `bilinearTexels`)
- Streaming hitch regression: none beyond existing `qa:perf` thresholds

### Quantitative Visual QA Gates (Re-run `npm run qa:wsc:pr0` Each PR)
- **Same contact surface:** `ΔE00 > 5` inspect, `ΔE00 > 10` likely mismatch
- **LOD transition:** `|ΔLuma%| > 10%` inspect
- **Floating-origin roundtrip:** `ΔE00 > 1.0` fail (once cloud-phase lock is added)
- **Missing/unloaded WSC slots:** `validity === 0` strictly enforced; zero fallback leakage
