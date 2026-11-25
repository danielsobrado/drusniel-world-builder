# World Surface Context (WSC) — Reusable AAA Grounding & Environmental Integration Roadmap

> **Date:** 2026-11-25  
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
| **PR 1** | **WSC Contract & Per-Texel Validity** *(Active)* | `WorldSurfaceContextState.js` 3-texture contract (`wscGeo`/`wscBase`/`wscEco`), validity-weighted bilinear sampling (TSL + CPU), backwards-compatible `GroundContactState` bridge, explicit per-texel validity (`DEF-08` fixed), `D15` upgrade, comprehensive unit tests (missing slots, chunk edges, negative coords, recentering, floating-origin). Zero visual redesign. | Zero invalid texel leakage (`STR-TP01`); canonical invariance across floating-origin rebases; `D00` parity. |
| **PR 2** | **Shared Resolved Low-Frequency Terrain Surface** | Extract pure shared low-frequency unlit terrain surface evaluator from `terrainMaterial.js` / `MeadowGroundShading.js` and publish linear albedo + roughness into `wscBaseTexture` (replacing static `buildBiomeSoilPalette` table). | `D12` vs `D01` drops from `ΔE00 = 11.5–14.0` to **`< 2.0`** across Stillmeadow, Temp. Rainforest, and Grassland. |
| **PR 3** | **Grass/Ground Conservation & Floor Fill Symmetry** | Share statistical canopy pigmentation & actual ecological coverage across near blades (`0–50 m`), far cards (`40–90 m`), and terrain `groundCover` (`30–120 m`); resolve `FOREST_FLOOR_FILL (0.80)` vs grass `0.025` asymmetry and `DS-01` stacked root darkening so sparse woodland blades no longer invert against a neon green floor. | Stillmeadow `C01`/`C02` lit blades no longer flip `−37%..−55%` darker; `Gallery G` LOD `|ΔLuma%| < 10%`; `D11` matches blade density. |
| **PR 4** | **Generic Contact Material Blending** | Introduce one pure TSL contact helper (`applyWorldSurfaceContact`) combining base PBR state, WSC surface state, and YAML contact profiles via `PbrCoatBlend`. Migrate tree bark (`SOIL_REACH` upgrade), rocks, shrubs/understories, fallen logs/stumps, and moss mounds off hardcoded soil constants while preserving material identity away from contact. | `B14-C03` trunk seam & `B16`/`B17` rock seams drop below `ΔE00 < 5–8` without erasing bark/stone identity. |
| **PR 5** | **Generic Geometry Conformer / Contact Skirt** | Evolve `groundSeating.js` into a declarative `GroundContactDeformer` for vegetation, root plates, and selected rocks (bounded vertex morph + material blend per Activision SIGGRAPH 2023; opaque default or alpha-hashed transition strips). | Zero floating/clipping skirts on slopes; consistent shadow-pass depth. |
| **PR 6** | **Bidirectional Ecological Footprints** | Expand forest-floor influence into multi-radius trunk contact, root disturbance, canopy coverage, litter probability, grass suppression, and moisture driving both terrain appearance and vegetation distribution. | Smooth organic transitions around trees/boulders without circular stamp rings (`DEF-09`). |
| **PR 7** | **Settlements, Foundations & Roads** | Foundation contact profiles/aprons and road shoulder/verge/compaction influence driven by object footprints/foundations; migrate buildings off static `TOWN_GROUND`. | `B14-C05`/`C06` and `B18` show organic foundation/road transitions across biomes. |
| **PR 8** | **Shared Environmental Coatings** | Unify moss, snow, mud/dust, and wetness masks across terrain, bark, rocks, debris, and buildings using `PbrCoatBlend` and canonical wrapped coordinates; remove hardcoded per-material moss palettes and hard snow collars (`B17`). | `D22` upgraded from partial to full; `B17` Snow-Rock contrast drops cleanly. |
| **PR 9** | **Lighting & Spatial Ground-Bounce Integration** | Integrate spatial ambient/ground bounce (aligned with Ponlai PR-G) and retire/rebalance remaining unattenuated fake emissive fills (`ROCK_FILL 3.5`, `BUILDING_FILL 2.2`, `BARK_FILL 0.78`) and woodland twilight collapse (`DEF-14`). | `Gallery F` lighting/weather consistency across sunrise/noon/overcast/sunset/night/rain without double-lighting. |

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
