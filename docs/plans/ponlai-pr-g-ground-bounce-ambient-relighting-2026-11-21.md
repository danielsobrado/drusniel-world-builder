# Ponlai integration — PR G: ground bounce, ambient relighting and material receivers

**Status:** IMPLEMENTATION SPECIFICATION ONLY. No production feature code or QA results are claimed by this document.  
**Date:** 2026-11-21  
**Drusniel baseline:** [`3e418938f8d57c67bcb56cf9082233b291054210`](https://github.com/danielsobrado/drusniel-world-builder/tree/3e418938f8d57c67bcb56cf9082233b291054210)  
**Ponlai baseline:** [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e)  
**Roadmap:** PR G, Phase 4 of A–L; follows [PR F streamed SH visibility probes](ponlai-pr-f-streamed-ambient-sh-probes-2026-11-20.md); next is PR H volumetric clouds.  
**Project rules:** work on latest `main`, commit directly, no GitHub Actions, no branch/worktree, preserve concurrent changes. KISS/YAGNI/SOLID, YAML config, correct error/logging, measured performance, Azgaar IDs unchanged.

> **Critical dependency:** PR F is a specification, not yet implemented on the inspected `main`. The directory `src/editor/lighting/probes/` was absent. Any PR G implementation must first verify and, where necessary, complete PR F's actual worker/SH/streamed GPU/material contract. **Do not import proposed F class names as if they existed.** Writing PR G's document is not implementing G or F.

## 1. What the renderer should achieve

Extend a verified PR F outdoor **sky visibility SH9** pilot to deliver *coherent coloured indirect light*, preserving direct sunlight, existing shadows, water appearance, HDR and atmosphere.

- **Ground bounce:** shaded faces next to warm soil, sunlit paving, rock or pale sand receive local, normal-dependent reflected illumination, not a flat universal warm hemisphere.
- **Sky-bounced colour:** terrain, wet litter, limestone, snow and green undergrowth reflect different colours when lit by the broad sky. A clear opening is brighter than a covered cliff base; directional sky SH remains meaningful.
- **Sun/moon changes:** sky-source colour and key direction can change without retracing static probe geometry. A rock behind a cliff does not glow as though the sun shines through it.
- **Coastal return:** only if validated, shallow water casts restrained blue/green indirect light on near-coastal stone; deep/turbid water does not create a glowing turquoise wall. The existing sea surface and foam shader remain.
- **Multiple eligible receivers:** the terrain from F and at least one additional outdoor class, preferably stone/boulders, use the same radiometric source. Tree bark/leaves, grass and town structures are additional gated integrations.
- **No double light:** the project already has artistic sky/ground fill as `emissiveNode`; physical bounced irradiance must replace/rebalance those terms for participating materials, not simply add over them.
- **Streaming-safe:** world remains unbounded, negative world coordinates and floating origin work, and probes never hold up terrain visibility.

### Scope and deliverables

1. Worker-baked **static RGB SH9 one-bounce transfer** from diffuse surfaces under a known white-sky reference, with canonical source versioning and low-priority scheduling.
2. One coherent **relit RGB irradiance** field combining existing F visibility/sky with G static bounce; bounded resident GPU output.
3. Optional **local dynamic sunlit-ground** bounce target, updated only on actual shadow/sky/camera/terrain changes, with strict GPU and shadow-source gate.
4. Optional coastal **diffuse waterbody/seafloor reflected radiance**, separately validated and initially off.
5. PBR ambient integration that preserves the project's current custom `SnowLightingModel`, foliage direct-light wrappers, specular IBL and the two main rendering paths.
6. Correct handling of old canopy/rock/building fake fills and camera-global town hemisphere bounce.
7. Source-referenced CPU SH tests, synthetic geometry fixtures, visual A/B and movement/GPU QA with rollback.

### Explicit exclusions

No recursive GI/path tracing, whole-world 3D texture, material-wide monkey patch, duplicate sky rig, new exposure controller, terrain-worker hot-path rays, whole-screen viewport texture fetch, forced material-recompile per slot, universal per-pixel SH9 reads on every grass blade, generic blue sea emissive, new Azgaar save schema, or mixing dedicated underground location light bakes into the outdoor renderer. Do **not** copy Ponlai's 2 m finite-island grid, magic gains or 256×256 island bounce map as-is.

## 2. Exact architecture comparison — which code owns each problem

| Concern | Actual Drusniel owner | Actual Ponlai owner | Adaptation |
| --- | --- | --- | --- |
| PR dependency | [D1] PR F specification | [P1–P3] probe bake/relight/sample | Verify real F API first, do not create a parallel GI manager |
| World geometry | [D2/D3] YAML and `src/main.js` | [P1] island `AmbientProbes` | `world.chunkSize=64` × `map.tileSize=2` → **128 m streamed chunks**, up to 49 resident slots |
| Slot/material sharing | [D4/D5] `InfiniteTerrainView` and `TerrainSlotBindings` | [P8] `AmbientVolume` | One shared terrain material, no new sample-sampler count beyond WebGPU limits |
| Static albedo | [D25/D26] terrain CPU bake and TSL material family | [P9] `BounceGround` source | Derive verified **linear diffuse** reflectance; never read display pixels as albedo |
| SH projection | PR F proposed SH basis | [P6/P7] `Harmonics`/`ProbeFormat` | **Same SH9**, y up, Gaunt angular product, cosine convolution once |
| Static bounce | [D27] edited canonical terrain; F worker | [P1] `hitRadiance` | Worker-side one bounce, memoized hit visibility, bounded trace + halo, separate cache |
| Relighting | [D8/D9] sky/look/environment | [P2/P4] `AmbientRelight`/`AmbientGrade` | One sky source and one output, geometry and sky generations separate |
| Key/shadow | [D8/D10/D29] directional sun, cloud shadows and CSM | [P5] `GroundBounce` | Bounded local emitter map; **prove shadow API** before enabling |
| Ocean | [D21–D24] sea optics, depth and state | [P5/P2] sea return | Depth/Fresnel/attenuation-informed, not global turquoise fill |
| Terrain/snow | [D6/D7] terrain and snow model | [P11] indirect model | Compose existing direct and new indirect hooks, avoid losing snow glints |
| Rock/fill | [D11/D17] rock emission, surface weathering | [P3] sample | Preferred second receiver; fade fake sky/ground fill only when valid |
| Trees/bark | [D11–D15] trees and foliage model | [P3/P10] vegetation receiver | Preserve transmission, wet sparkle, normal maps, snow and LOD clones |
| Grass | [D16] double-sided Lambert instancing | [P10] meadow canopy | Optional, low-resolution/vertex sampling only if cost/quality justifies |
| Towns | [D18/D19/D20] town emission and global hemisphere re-tint | [P9] island palette | Distinguish **camera-global** legacy town colour from physical per-object bounce |
| Occlusion | [D30/D31] GTAO/cinematic contact | [P3/P4] diffuse/specular occlusion | No doubled canopy, contact or IBL suppression |
| Dedicated locations | [D32/D33] location indirect surfels/vertex bake | [P1/P5] outdoor bounce | Remain separate loading-screen lighting architecture |
| Performance | [D34–D39] native WebGPU QA & scripts | [P2/P5/P8] compute/RTT and staged writes | No terrain stall or 49 shader compilations |

**Important code facts from current main:**

- [D3] constructs `WorldChunkWorkerClient` and `WorkerBackedWorldStore` with `config.world.chunkSize` and `config.map.tileSize`. Even though `map.chunkSize` separately says 32, **terrain chunks are 128 m**, not 64 m.
- [D5] reports one shared terrain material for all 49 slots; a per-slot material program formerly took ~0.6 s to build and triggered very large first-player-frame stalls. It also explicitly documents the portable 16-fragment-sampler limit.
- [D7] sets `material.setupLightingModel = () => new SnowLightingModel(...)` to preserve shadowed direct snow glints. G must **compose**, never overwrite it.
- [D13] wraps `setupLightingModel` and delegates `model.direct` for foliage transmission, wet highlights and relief. G cannot replace this method blindly.
- [D11] contains `treeFoliageEmission`, `treeBarkEmission`, `rockShadeEmission`, `understoryShadeEmission` and `buildingShadeEmission`. These *already* add sky/ground fill to material emission and must not be added again via GI.
- [D20] `SettlementGroundBounce` alters `HemisphereLight.groundColor` based on the **nearest town to the viewer**. This is a legacy art-directed approximation, **not** a spatial bounce field.
- [D9] `scene.environment` supplies diffuse IBL **and metallic reflections**. Do not disable it globally.
- [D10] `applyCloudShadow` modifies `material.receivedShadowNode`, attenuating *direct* sunlight. A separate ground emitter pass must sample cloud transmittance **once at the emitting patch**.

## 3. Ponlai: exact reusable design and deliberate exclusions

### 3.1 Static one-bounce transfer [P1]

`packages/island/world/AmbientProbes.ts` traces fixed-order spherical Fibonacci directions (`RAYS=128`), with a second set of cosine-weighted hit rays (`SECONDARY=16`). Each opaque surface hit's `hitRadiance(v)` computes its outward normal, estimates sky visibility by tracing another hemisphere, multiplies by the material's **linear albedo**, and memoizes the response. The result is then projected to **nine SH coefficients** in a fixed order. Sea and foliage in-scatter are separate channels.

**Reuse:** the *principle* that baked coloured reflected-light transfer is geometry/material dependent, but **sky-colour independent**; stable basis, deterministic accumulation, memoized hit visibility, relocation and invalidity.

**Reject for G:** the finite island geometry, 2 m voxel/probe sampling, fixed level count tied to bamboo/sea-zero, literal island albedos, entire 80-float probe layout, open-sea edge column, and 128×16 rays over 1,156 high-tier F probes × 49 chunks. All have different costs/scales here.

### 3.2 Relighting [P2] and SH math [P6/P7]

Ponlai's `AmbientRelight.ts` separates **four components** before cosine convolution:

1. **Sky:** sky RGB SH9 angularly multiplied by probe sky visibility using `shProduct` (Gaunt triple integral).
2. **Sky-bounced RGB:** pre-baked reflected-sky transfer times the broad sky's mean radiance.
3. **Key-bounced light:** directional sun/moon bounce lobe, attenuated by scene/cloud visibility.
4. **Sea-reflected light:** depth/sea-visibility-dependent sky + key term.

It computes a final SH9 RGB irradiance field, optionally applies a directionality boost and deringing, then packs **seven RGBA16F slabs** per probe for materials.

**Mathematical contract:**

```text
radianceSH_i = ∫ L(ω) Y_i(ω) dω
visibilitySH_j = ∫ V(ω) Y_j(ω) dω
angularProductSH_k = Σ_i Σ_j skySH_i * visibilitySH_j * Gaunt(i,j,k)
Gaunt(i,j,k) = ∫ Y_i Y_j Y_k dω

E(n) = Σ_i cosineLobe[band(i)] * radianceSH_i * Y_i(n)
cosineLobe = [π, 2π/3, π/4] for bands 0,1,2
```

**Never** multiply matching coefficients `skySH[i] * visibilitySH[i]` to approximate the product; that is not spherical-harmonic multiplication. Never cosine-convolve twice; raw transfer source and irradiance output have distinct units.

### 3.3 GroundBounce [P5] — different from static sky bounce

The upstream `GroundBounce.ts` is explicitly annotated:

```text
Adapted from tidewater by Daniel Greenheck
SPDX-FileCopyrightText: Copyright (c) 2026 DRG Software Solutions LLC
SPDX-License-Identifier: MIT
```

It draws a `256×256` half-float map of **sunlit ground response per unit key**, using surface albedo, ground/sea depth, sun shadow-map visibility and cloud input. It applies a binomial blur, reads the map under downward-facing receivers with a height/surround attenuation, and injects through `builder.context.irradiance` in `GroundBounceLightingModel`. It updates only when sun-shadow steps, sea/field inputs or mapped coordinates change.

**Reuse:** separation of dynamically illuminated *emitters* from passively illuminated *receivers*, correct shadow-domain attenuations, local height and normal response, update-on-change, diffuse BRDF injection.

**Do not copy:** `sunShadow.currentPCFVisibility`, `shared.shoreXform`, `WaveMaps.bounceLayer`, fixed 256² target, arbitrary ``BOUNCE_GAIN=9.4`/`SURROUND=0.6`, sea level 0 or exact water Fresnel coefficients. Those belong to Ponlai/tidewater's rendering architecture, not ours. Retain licence attribution in any adapted code.

### 3.4 AmbientSample/Grade/Volume [P3/P4/P8]

- [P3] replaces environment **diffuse** for participating receivers while preserving specular. It samples SH9 with normal/view bias, trilinear neighbourhoods and a receiver-specific weight, differentiating sky visibility from local bounced irradiance. Metal/specular correction uses a bounded ratio with an environmental floor.
- [P4] is an *art direction* table layered over calculated sky and bounce; do not copy fixed gain keys and call them physics. Start energy-neutral and tune by evidence.
- [P8] swaps resource nodes/texture targets only **after preparation**, without rebuilding existing shader graphs; its single island 3D volume itself is not suitable for an unbounded world.
- [P9] sources bounce albedo from the island's real material palette. [P10] separately models meadow canopy direct-key attenuation. [P12] has its own GGX split-sum lookup, **not** a required dependency for Drusniel's current Three.js BRDF.
- [P13] provides local bounded solid-occlusion ideas; use F's canonical scene snapshot rather than implementing a competing geometry ray-tracer.

## 4. G.0 — mandatory prerequisite audit

Before code, inspect **latest** `main` and require:

- [ ] Actual F CPU probe sample format, stable SH basis, static world/canopy geometry revision and halo rules.
- [ ] F GPU residency and **one neutral fallback** with chunk slot generation checks and bounded pages.
- [ ] F sky SH source, coherent published sky generation, **unconvolved radiance or explicit conversion**, and terrain pilot in the ambient diffuse lighting stage.
- [ ] F worker lane isolated from terrain critical jobs; real native WebGPU performance evidence.
- [ ] Confirm PR E physically based atmosphere exists **as code** or else use current [D8/D9] authored sky/HDR fallback. Earlier PR E document is not a runtime implementation.
- [ ] Inspect installed Three.js PhysicalLightingModel and Lambert lighting methods for exact indirect diffuse/specular placement and compatible composability.
- [ ] Audit [D7] snow direct override, [D13] foliage model wrapping, [D20] town hemisphere mutation, [D11] existing faux bounced emission.
- [ ] Confirm source-geometry edit revision is **independent of sky/look generation**.
- [ ] Save baseline from current commit with source hashes, display backend, raw shader compile count and world dimensions.

**Hard stop:** if F is missing, not diffuse-correct or debug-only, first complete a separately reviewed F implementation. Do **not** make one giant PR that introduces F and G and claims all steps passed without evidence. A detailed blocker report counts as analysis, not G completion.

---

## 5. Static one-bounce RGB SH transfer — formulas and implementation

### 5.1 Why G needs two separate light representations

**F sky visibility** is a function `V_p(ω)∈[0,1]`: the fraction of sky visible from probe `p` toward direction `ω`. It is independent of sky colour or the albedo of surrounding solids.

**G bounced sky transfer** is different: a direction from the probe hits nearby terrain/stone/vegetation, which then reflects some broad sky light toward the probe. It is an **RGB angular radiance distribution**, not another AO factor. Computing it once for a unit reference sky lets the actual outdoor sky relight it without worker ray tracing.

Dynamic **sunlit ground bounce** is a third source: a surface directly illuminated by the moving sun/optional moon reflects light. Do not add its contribution a second time through an SH key lobe.

### 5.2 Normalized uniform reference-sky estimator

For a primary ray from probe `p` toward direction `ω_k`, let it hit a diffuse point `h_k` with unit surface normal `n_h`, linear diffuse albedo `ρ_c(h)` and primary-ray transmittance `T_k`.

For a *unit-radiance upper sky* (white, radiance `L_ref=1` in the upper hemisphere, zero below), incident reference irradiance at a hit is

```text
E_ref(h) = ∫_{upper sky} V_h(ω') max(dot(n_h,ω'),0) dω'
v_cos(h) = E_ref(h) / π                    # dimensionless, 0..1
L_reflected,c(h) = ρ_c(h) * E_ref(h) / π = ρ_c(h) * v_cos(h)
```

The **Lambert** factor `1/π` is included in `L_reflected`. This is outgoing **radiance**, not the final irradiance received by the shaded mesh. If the hit is black, bounced radiance is zero. An upward fully sky-exposed Lambert material under unit upper-sky radiance reflects `ρ`. A ceiling with no visible upper sky receives zero.

Estimate `v_cos(h)` with a fixed sample set on the **cosine-weighted hemisphere centered on `n_h`** (or a fixed full-sphere quadrature with explicit cosine weights), tracing geometry/medium visibility at the hit. Cache this value by stable surface-hit element, material-source revision and normal where possible. Do not choose the secondary sequence from current frame or worker completion order.

### 5.3 Project bounced radiance into nine real spherical harmonics

```text
B_{i,c}(p) ≈ (4π/N_primary) Σ_{k=0..N_primary−1}
           T_k * [ρ_c(h_k) * v_cos(h_k)] * Y_i(ω_k)

  i = 0..8 in F/Ponlai SH9 y-up order
  c = red, green, blue
  sky escapes contribute to F sky visibility, not the bounce term
  opaque hits contribute reflected radiance, not sky visibility
  sea hits are tagged separately; not generic dry diffuse albedo
```

This is **one** bounce only. Do not recursively sample G's own bounced field when calculating hit visibility. Secondary ray transmittance through a mean foliage medium can be included but requires one shared canopy-source revision with F. Invalid/buried probe handling, normal offsets, world edit halo and deterministic boundary ownership remain F's responsibility.

At runtime under a **uniform-colour approximation** for sky-bounced indirect light:

```text
B_skyRuntime,{i,c} = B_{i,c} * L_skyMean,c
E_skyBounce,c(n) = Σ_i k_band(i) * B_skyRuntime,{i,c} * Y_i(n)
```

The **mean sky** must be a **linear radiance**, sampled over the intended upper hemisphere. It must not be average displayed HDR/tone-mapped RGB or contain direct sun-disc radiance a second time. The approximation changes bounce colour with sky/weather without a geometry rebake, but does not reproduce all directional warm-orange sky features of sunset. Keep direct sky in full SH from F.

### 5.4 SH product, convolution and units

One correctly combined relight:

```text
C_sky,c = ProductSH(VisibilitySH, SkyRadianceSH_c)    # Gaunt triple integral
C_indirect,c = C_sky,c + G.skyBounce * B_skyRuntime,c
E_indirect,c(n) = Σ_i CosineLobe_i * C_indirect,{i,c} * Y_i(n)
```

- Never multiply matching SH coefficients element-by-element; product requires the Gaunt matrix (or exact reference quadrature).
- Convolve **once** from radiance to irradiance with SH band multipliers `π, 2π/3, π/4`.
- The final Lambert material uses `E/π` times **diffuse albedo**, with the appropriate Fresnel/metalness handling in the existing PBR lighting model.
- SH coefficients can be negative. Clamp bad **reconstructed irradiance** to nonnegative, not individual source coefficients.
- Optional deringing and directionality boost must not act as hidden brightness gain.
- If PR F's *actual* published sky field is already convolved, document its units and adjust G rather than convolve again.

### 5.5 Coarser bounce lattice is deliberate

The inspected default 128 m terrain chunk and proposed F high tier at 8 m + four vertical levels is `(128/8+1)^2×4=1,156` visibility probes. Running 96 primary × many secondary rays on *every* high probe would make static baking expensive across 49 streamed chunks.

**Candidate first G lattice:** 16 m X/Z spacing, three terrain-relative height levels:

```text
columns = 128/16 + 1 = 9
levels = 3
bounceProbeCount = 9*9*3 = 243
primaryRays = 48 per bounce probe
primaryRaysPerChunk = 11,664

# Secondary rays are memoized per unique hit, NOT 11,664 × 8 unconditionally.
```

Use the same canonical lattice origin as F; 16 m G positions align to every other F 8 m X/Z column. These are candidate knobs, not measurements. Compare 16 m versus 8 m near-camera at an actual cliff, town wall and rock cluster; reserve tighter near-field levels only if the look improves enough for the added CPU/GPU cost.

**CPU raw bounce coefficient example:** 243 probes × 27 RGB SH floats × 4 bytes = **26,244 bytes/chunk**; 49 such pages = **1,285,956 bytes (~1.23 MiB)**, excluding metadata, relocated offsets, halo, cache and GPU output. This is intentionally smaller than copying Ponlai's 80 floats/probe × all 1,156 F sites.

### 5.6 Cache/source keys and reproducibility

```text
BouncePage {
  geometryWorldId, generatorVersion, chunkKey,
  tileSize, chunkSize, globalLatticeOrigin, verticalProfile,
  terrainEditHaloHash, forestEditHaloHash, structuralOccluderHash,
  materialPaletteHash, albedoProxyVersion,
  traceReach, hitTraceReach, primaryRayCount, secondaryRayCount,
  bounceFormatVersion,
  coefficients: Float32Array[probeCount*27],
  validity: Uint8Array[probeCount],
  relocation: Float32Array[probeCount*3],
  coverageFlags,
  contentHash
}
```

**Do not put** current sun azimuth, cloud animation time, scene exposure or sky RGB in the cached static bounce key. Source geometry/albedo changes require an affected halo invalidation; a change in sky look requires GPU relight only. Source support radius for dirty pages must cover **primary ray reach + secondary hit visibility reach + interpolation margin**, unlike a pure F visibility halo.

For two neighbouring owners, shared world-boundary probe coefficients must be **bit-identical** for identical source hashes. Determinism requires stable hit ordering, globally canonical coordinates (including negative values), fixed secondary directions, deterministic caches (never object insertion order when summation changes) and Float64 accumulation followed by deliberate Float32 packing.

---

## 6. Actual material/albedo sourcing from Drusniel

### 6.1 The CPU bake is the right starting point, not rendered colour

[D25] `TerrainMaterialBakeCpu` already builds terrain material-family weights, far colours, wetness, canopy and shoreline data from tiles, heights and edited source arrays. [D26] `TerrainMaterialBakedNodes` mixes actual material families, snow, macro tint, roughness, wetness and normal rules.

For ground bounce, the input is **linear diffuse reflectance** before lighting, emission, HDR exposure, fog and tone mapping. Do **not** blindly use `farColor` as physical albedo: verify its encoding, intended compositing and colour space first. Build a small pure adapter from the **existing source material family**, with unit tests comparing against a neutral-lit TSL material. No new unrelated biome-ID → five colours table.

Suggested pure worker-safe snapshot interface:

```text
sampleBounceSurface(canonicalX, canonicalZ, height, sourceRevision) -> {
  linearAlbedo: [r,g,b],           # nonnegative, physically bounded for diffuse
  normal: [nx,ny,nz],
  type: land | dry-rock | snow | shallow-seafloor | unsupported,
  coverage: terrain | canopy | structure | missing,
  materialVersion
}
```

- Snow from weather/region can change rapidly: choose a stable winter profile or a **dynamic modifier** in relight, not a million worker rebakes during snowfall.
- Wet surfaces may darken and change roughness: use a bounded moisture adjustment from current weather if validated, otherwise keep stable underlying dry geometry and mark the bounce approximate.
- Rock albedo is actual stone material, not its reflected sun highlight. Metal F0/specular cannot be converted directly to Lambert bounce.
- Town cobbles and medieval material palettes [D18/D19] can contribute only with source data and semantic revision; no per-frame traversal of all town meshes.
- Preserve Azgaar 0–12 and deterministic 32–254 terrain identifiers. A tile classification isn't automatically a reflectance value.
- Static canopy ray transmittance must read the **same canonical forest/habitat** snapshot as F. [D40] `CanopyVisibility` is **prototype-local**, not a world-space tree coverage texture.

### 6.2 No invented sun/sky energy

[D8] sets authoritative hemisphere and directional light, sky look and exposure; [D9] loads HDR environment asynchronously and scales it. These are currently *art-directed*, not necessarily physically calibrated. If PR E is still unimplemented, G must use a clearly labelled stylized calibration with a fixed linear reference, not claim lux/radiance equivalence. Output ratios can be normalised to existing ambient look **per receiver and same normal** while preserving specular reflection.

When the actual PR E physical sky source exists, consume its published **scene-linear**, pre-exposure-independent sky radiance SH and geometry generation. Do not change `sceneExposure.scale` to make bounced light look brighter.

---

## 7. Optional dynamic key bounce around the camera

### 7.1 Different energy source from static sky bounce

A sunlit diffuse ground emitter `g` emits

```text
E_key(g) = max(dot(n_ground, directionToKey), 0)
           * KeyIrradiance * ShadowVisibility(g) * CloudTransmission(g)

L_out(g) = LinearAlbedo(g) * E_key(g) / π

E_received(p,n) = ∫_{visible ground}
                  L_out(g) * max(dot(n, directionToGroundPatch),0) dω
```

No constant ground-bounce emission at night when the sun is down. Moon is supported only if an actual moon key/irradiance source exists. Static G sky-bounced transfer **excludes the sun disc**, so key bounce may be added **once**. Choose either a key-lobe contribution in SH or an explicit ground map per participating receiver; **never add both copies of the same key reflection**.

### 7.2 Bounded map, not Ponlai's island target

Recommended prototype: a **focus-relative** local `~192 m square` around camera at `~192²` texels (1 m/texel) or matched quality tier, not a world-sized texture and not a map for each of 49 chunks. Geometry/height and albedo must be pulled from F's existing prepared stream or one small local field. Use a **single** shared GPU texture, with current canonical world-to-local UV, RGBA16F including ground-height alpha.

- Receivers outside the actual map coverage **fade out** extra key bounce; do not clamp to the bright edge's last texel.
- Compute sunlit ground albedo × `max(n_ground·key,0)` × actual shadow × cloud exactly **once at emitting surface**.
- Blur with validated normalized binomial weights (compare exact 5×5 CPU reference; Ponlai uses a nine-bilinear-tap approximation). Do not blur a high snow ridge's bounce across a deep valley as if no wall separates them.
- Approximate receiver-facing view from `(1−N.y)/2`, surface height delta, horizontal normal projected sampling, and spatial falloff. This is **not** visibility-correct indirect illumination through narrow rooms. Restrict to appropriate open-air receiver classes.
- Weather- and player-motion-driven updates must be **dirty signature / budget** based, not unconditional frame-map renders.
- Device loss, missing shadow-map API or WebGL fallback returns **zero extra key bounce**, not the old map from an unrelated chunk.

### 7.3 Shadow sampler is a hard technical gate

Ponlai uses its custom `sunShadow.currentPCFVisibility`. Drusniel's [D8] `DirectionalLight` and [D29] `CascadedSunShadows` do **not** expose that Ponlai method. G must prove current installed Three.js TSL can sample the **same** direct-light shadow correctly within a local bounce pass, including cascade transitions and depth/normal bias.

A minimal spike must render a single lit ground patch and vertical blocker:

- Prove lit versus blocked bounce texels match actual direct shadow.
- Prove shadow resources exist when the bounce pass executes; avoid an extra shadow render per frame.
- Prove correct same-frame (or explicitly versioned one-frame) ordering, no read-while-write.
- Use [D10] shared cloud-transmission field **at the emitter**; don't multiply receiver cloud a second time.
- Check 30°, grazing and sun below horizon, world rebase and active cinematic/volumetric pipeline.
- No safe TSL shadow sampler → **do not ship this optional map**, or disclose a terrain-only approximate occlusion fallback with tested limitations; never pretend it's accurate beneath buildings.

### 7.4 Signature and scheduling

```text
dirtySignature = (
  canonicalMapCellOrigin, terrainPageVersion, albedoVersion,
  realShadowGeneration, sunOrMoonDirection, keyColorIntensity,
  cloudFieldVersion, seaLevelIfNeeded, outputTier
)
```

Recompute on meaningful changes. Cap work by a measured FPS/visual error budget; 8 Hz is a **starting experiment**, not guaranteed suitable for moving cloud shadows or rapidly rotating sun. When the sky is paused at fixed inputs, output should be frame-independent without a temporal “warmup” inside GI. When camera teleports, make the old target immediately invalid by canonical coverage/source generation, and fade to G static sky bounce while a new map prepares.

---

## 8. Coastal water bounce — narrow, physically defensible option

### 8.1 Inputs and current coast architecture

- [D21] `SeaOptics.js`: the existing colour/absorption/scattering settings and quality tier.
- [D22] `SeaOpticsShading.js`: depth-dependent visible lagoon/shallow/deep colour; **not** automatically a material diffuse albedo proxy.
- [D23] `seaState.js`: current world sea level, waves and weather state, with default inspected YAML `seaLevel: -1.5`, not Ponlai's sea level 0.
- [D24] `OceanDistanceField`: coastal region source and world/tile sampling. This alone isn't a full bathymetry solver.
- New coastal rendering improvements have landed after F's document. Re-open latest before implementing G; preserve wave refraction, swash, foam, rock impact, water optics and WebGPU fixes.

### 8.2 First-pass optical derivation

For depth `d≥0` below sea and optical absorption/backscatter per RGB channel, approximate a floor-and-waterbody **upwelling diffuse radiance**, separate from specular Fresnel reflection at the sea surface:

```text
k_rgb = absorption_rgb + backscatter_rgb           # verify against current sea optics
T_column = exp(-k_rgb * d * PATH_LENGTH_FACTOR)
L_floor = (seafloorAlbedo_rgb / π) * E_down_rgb * T_column
L_body = (waterbodyDiffuseReflectance_rgb / π) * E_down_rgb * (1 - T_column)
L_seaReturn = EntryExitTransmission_rgb * (L_floor + L_body)
```

This is a **coarse low-frequency approximation**, not a full vector radiative-transfer or the existing water BRDF. Align actual units/coefficients with [D21/D22]. Do not port Ponlai's `FLOOR_THROUGH=0.934×0.525` or constant `FLOOR_PATH=3.2` without a local optical validation.

- A shallow clear lagoon can create restrained teal return on *nearby downward-facing dry cliff stone*.
- The same deep/turbid region must have much less **floor** return, not white-blue emission.
- Foam, wave normals, specular sky reflection and water refraction stay in the water renderer. Never treat displayed water blue as an albedo texture.
- Only emit within a bounded shoreline radius and with valid depth/sea-level source; missing inputs → sea bounce off with diagnostics.
- Sky and key contributions to sea return must be separated, and cloud/shadow applied at emitting point once.
- No global underwater lighting change, no sea-return contribution to static **sky-visibility** coefficients.
- Test still water and storm, high/low sun, sea-level edits, rock overhangs and far deep water. No physically validated data → leave this optional part **pending**, not faked.

---

## 9. One coherent relight target and GPU budget

### 9.1 Combine in radiance, output irradiance

```text
C_sky = ProductSH(F.visibilitySH, skyRadianceSH)
C_bounceSky = G.whiteSkyBounceSH * skyMeanRadiance
C_total = C_sky + C_bounceSky * skyBounceGrade
          + optionalUniqueKeySH + optionalSeaSH

E_total(n) = Σ_i cosineLobe_i * C_total_i * Y_i(n)
```

When the dynamic local ground map is active, `optionalUniqueKeySH` must be zero if it contains the same reflected key energy. The ground map is then separately added in the **indirect irradiance** slot exactly once.

Ponlai's seven RGBA16F slabs are a candidate output: `7×4×2=56 bytes/probe`, so at F high 1,156 probes = **64,736 bytes/chunk**, ×49 = **3,172,064 bytes ≈ 3.03 MiB** raw relit output. That excludes static F visibility, G RGB transfer, GPU staging/atlas overhead and other copies. Full Ponlai 80-float static storage copied at 1,156 probes = 369,920 bytes/chunk, ×49 = **18,126,080 bytes (~17.29 MiB)**, largely unneeded in G.

**Recommended arrangement:**

1. Keep F immutable visibility pages and G immutable white-sky bounce transfer as **two versions of source data**, but only one per-resident GPU **relit RGB SH** field.
2. If G is on 16 m grid and F on 8 m, upsample G in a bounded GPU relight pass using matched canonical columns; don't make every terrain/grass pixel sample both sources and do two 8-corner SH gathers.
3. Group relight by **dirty sky generation/new page**, not every frame if inputs unchanged.
4. Stage a complete page or generation before material readers switch. Never interpolate across adjacent atlas pages that belong to different geometry or sky generations.
5. Bind a valid **neutral** fallback; missing G should behave like F sky-only, not zero ambient or last chunk's light.
6. Use the existing [D5] per-object binding/slot-token pattern, **no 49 new material programs** and no 17th fragment sampler.
7. Support a proven WebGPU compute output path, with documented fallback on WebGL/software, not a silently wrong shader.
8. Device loss frees and rebuilds GPU buffers but leaves CPU geometry cache valid; origin rebase only updates small transform uniforms.
9. Optional debug-only readback/hash can compare paused page with fresh load, but never read back every production frame.

### 9.2 SH deringing and artistic gain

[P6] `shDeringWindow`/`shWindow` can suppress negative reconstructed irradiance. Test **convolved** SH9 before/after a window against brute-force directional integration. Preserve constant-band energy within an agreed reference tolerance. A directionality boost `shTowardDelta` is **off by default**; compare 0 vs ≤0.25 if visually justified. Gains for sunny/overcast/moonlit scenes are **small configurable grade multipliers**, not values copied from Ponlai `BOUNCE_GAIN=9.4` or hidden auto exposure compensation.

### 9.3 GPU/CPU metrics to retain

```text
activeVisibilityProbes, activeBounceTransferProbes
readyBounceChunks, staleGenerationDrops, invalidProbes
sourceGeometryHash, sourceMaterialHash, skyGeneration, relightGeneration
bakePrimaryRays, bakeUniqueHitCount, bakeSecondaryRays
workerQueueP50P95, cacheHitMiss, cancelledJobs
gpuRelightDispatches, gpuRelightTargetBytes, gpuGroundMapBytes
textureUploadBytes, shaderProgramCount, activeReceiverClasses
frameP95P99, hitchCount, terrainCommitWait, renderPath, gpuBackend
```

Classify GPU timing measurements accurately: render-pass samples do **not** include compute/upload by default, and unavailable timestamp queries aren't zero-cost execution.

---

## 10. Material receiver integration — no doubled lighting

### 10.1 Fundamental rule: replace ambient irradiance, not add glowing pixels

At each opted-in material, the new physical/stylized indirect response should enter the existing **indirect-diffuse PBR calculation**. Keep direct sun and moon, contact shadows, shadowed transmitted sunlight, rough specular environment reflections, actual emissive, and the user's colour palette intact.

```text
directDiffuse/directSpecular = EXISTING_UNCHANGED
environmentSpecular         = EXISTING_UNCHANGED
ambientSkyDiffuse            = blend(existingAmbientSkyDiffuse,
                                     E_probeSky, receiverWeight)
ambientBounceDiffuse         = E_bouncedSky
                              + E_uniqueKeyGroundMap
                              + E_optionalSea
finalIndirectDiffuse         = BRDF(diffuseAlbedo, roughness, metalness,
                                    ambientSkyDiffuse + ambientBounceDiffuse)
legacyArtSkyGroundEmission   = fadeOutOldSkyGroundFill(whereProbeIsValid)
actualEmissiveAndAir         = EXISTING_UNCHANGED
post/exposure                = EXISTING_UNCHANGED
```

A small relative-visibility ratio applied to the **existing ambient sky component** may be safer while a first receiver is validated. Never multiply final `material.colorNode` or output HDR to fake bounced light; that darkens sunlight, true emission and specular indiscriminately. Never change `HemisphereLight.intensity` globally to “compensate” for one local surface. If the exact current Three.js lighting model cannot isolate the ambient contribution safely, **do not enable that receiver**.

### 10.2 Terrain: compose the snow model [D6/D7]

Current terrain material [D6] is shared among up to 49 chunks. It calls `applySnowLighting(material, snowSurface.sunResponse...)`. [D7] returns a new `SnowLightingModel extends PhysicalLightingModel` whose `direct` calls `super.direct` and conditionally adds an already-shadowed snow sun glint.

**Bug to avoid:** setting `material.setupLightingModel = () => new BounceLightingModel(...)` after snow **removes the snow direct contribution**. Calling `applySnowLighting` after bounce **removes bounce**.

Required approach:

1. Inspect the actual installed Three.js version's `PhysicalLightingModel` and its `indirect/indirectDiffuse/indirectSpecular` context and output nodes.
2. Create a **small compositional extension**: use the original returned model and wrap the **indirect** method, or provide a combined model that retains the existing snow `direct` override.
3. Prove no change to already-shadowed direct glints, snow wet/ice specular and Fresnel. Do not fork all of Three.js's lighting code or import Ponlai's full GGX replacement.
4. Bind the **same** G probe field to all terrain slot meshes via [D5] stable node identity/`onObjectUpdate`, or a single atlas. No 49 independent shader graphs.
5. When G data is missing or invalid, fallback to F/legacy **per slot** with no black flash or previously visited chunk's brightness.
6. Selectively reduce the existing `floorFill = foliageSkyFill(...).mul(forestFloor)` from [D6] only if equivalent sky contribution is now delivered through indirect lighting. Preserve forest-floor G-contact texture and the snowy/wetness feature layers.
7. Verify rain, snow, moss, forest dirt, spell-light emission and coast surf mask remain as authored.

### 10.3 Second approved receiver: rocks [D17/D11]

**Recommendation:** implement rocks and boulders **before** broad tree/grass/town coverage. Their stable geometry, visible underside and existing PBR normal/roughness make extra reflected light easy to validate.

- [D17] `createStylizedRockMaterial` already supplies weathering/wetness and `rockShadeEmission` as an artistic sky + ground + distance-air term.
- A receiver adapter should use geometric/render-space normal and a bias **outside** the rock, sample G once from the canonical lattice, and add only the new indirect term to its proper BRDF stage.
- Fade old **sky fill** and **ground bounce** emission on the rock in proportion to valid G coverage. Preserve its **distance-air** in-scatter, if a separate authorial choice remains desirable, and preserve actual authored emissive.
- Validate dark basalt, pale limestone, wet coastal stones, snow-covered stone and mountain talus. Do not make every rock artificially warm from a nearby **camera** town.
- Rocks may be instanced/material shared; do not create an independent material program for every rock instance.
- An unsupported rock material **keeps legacy lighting** rather than being silently reclassified as a valid receiver.

### 10.4 Tree foliage and bark [D11–D15/D40]

The existing outdoor tree chain is **not one generic PBR class**:

- [D12] `TreeSurfaceMaterial.js` preserves authored emissive and clones materials.
- [D13] `FoliageNodeMaterial.js` wraps `setupLightingModel` and modifies **direct** lighting to handle leaf transmission, foliage thickness, wet film, snow and relief. G must *delegate*, never overwrite or mutate a shared base model such that its source's direct contribution disappears.
- [D14] `StylizedTreeMaterials.js` constructs leaf colour, opacity and `treeFoliageEmission`.
- [D15] `TreeBarkMaterial.js` builds bark PBR/height/normal/wetness and `treeBarkEmission`.
- [D40] `CanopyVisibility.js` bakes **prototype-local** canopy visibility, not an outdoor world-volume sky-probe buffer. It can still supply fine self-shadowing independently.

#### Bark pilot

Bark is more straightforward than leaves; sample near the bark surface with a small geometric normal bias, optionally biased up the trunk to avoid probe mixing inside it. Compare shadow-side bark warm fill near grass, snow and bare rock. Existing `treeBarkEmission` contains **sky fill + ground bounce + air fog**: convert the first two only when G ready; retain the air term and true authored emission.

#### Leaves and thin-sheet energy

- Direct transmission currently uses **already-shadowed direct light**. G's diffuse irradiance should not multiply that transmission by a second canopy shadow.
- A translucent two-sided leaf is not opaque Lambert. Model wrap/thin-side response separately; preserve leaf/needle color, transparency and snow masking.
- Use a **probe point above canopy/leaf root** or stable crown anchor, not each wind-animated leaf normal as a sampling coordinate. Otherwise G causes shimmering and worker or GPU field churn.
- For the SH band response, test full L2 first in one leaf, then a lower-band approximation only when quality/performance data supports it.
- If slow or visually worse, defer leaves. Terrain + rocks are the minimum G receiver acceptance; tree coverage is an optional separate gate.

### 10.5 Grass and meadow [D16]

Current grass is a `MeshLambertNodeMaterial` with double-sided cards, displaced normals, bespoke translucency/opacity and LOD/instancing. It may not share the `PhysicalLightingModel` hook used by terrain and rock.

- Confirm its exact current Lambert indirect-light hook before touching it. Do not assume a PhysicalLightingModel extension works.
- Prefer one bounce sample at the **blade base / root**, with stable canonical X/Z, then interpolate to blade height; never make each wind-bending blade pull a different probe every frame.
- Benchmark **vertex-level** or per-instance bounce versus fragment-level SH9 × up to eight neighbouring samples. Dense grass covers many screen pixels and already consumes shader bandwidth.
- Keep existing sunlight, grass self-shade, canopy attenuation, movement and alpha-test exact.
- A 16 m bounce field lacks 1 m tussock detail; don't exaggerate gains to make the effect show at overview.
- If GPU cost, shader complexity or visual noise is unacceptable, leave grass on legacy/sky-only F lighting and document why.

### 10.6 Buildings, town lighting and camera-global hemisphere [D18–D20]

[D20] `SettlementGroundBounce.update(town)` rewrites `light.groundColor` based on the **nearest town to the viewer**, with a tuned daylight luminance. That is an effective **legacy style adjustment**, but not physically local.

- Do not remove the town system globally while unconverted walls, roofs and medieval props still use it.
- A G-converted outdoor town wall should use the colour of the actual emitting nearby paving/stone, not the camera-nearest town hue added on top of G.
- If material uses `buildingShadeEmission` in [D18/D19], fade its **ground/sky fill terms** only on converted valid receivers, preserving genuine flame/lantern emissive, distance air and weather coating.
- Preserve **cultural material palette** (granite, terracotta, dark slate, plaster, timber). No universal beige bounce.
- Walls/roofs/portals have possible light leaks: require **structural occluder provider** from authored semantic geometry, a revision channel, cross-wall tests and deterministic LOD ownership before enable.
- No per-frame scene-graph loop over thousands of town pieces to infer surfels. If not supported by semantic data, keep G off for walls and record TODO.
- Town ground itself may still contribute a **terrain-only** colour bounce proxy when its paving family is valid, without requiring all building receivers in G.

### 10.7 Specular/environment occlusion and metal [D9/D30/P3]

G's diffuse bounce **does not** justify scaling metallic environment reflections by the same occlusion factor:

```text
envDiffuse   = existing diffuse sky/environment contribution
envSpecular  = prefiltered scene.environment * PBR BRDF
probeDiffuse = sky visibility + bounced sky + optional unique key/sea

# Optional correction only if the same spectral/angle/unit reference is established:
specularOcclusion = clamp(
    matchedLocalFrontIrradiance / max(matchedEnvironmentIrradiance, referenceFloor),
    minValue, 1
) * geometricHorizonVisibility(Nshading, Ngeometry, view, roughness)
```

- The numerator/denominator require the **same** incident-light convention. A diffuse irradiance divided by glossy radiance is not a valid ratio.
- Use geometric normal and roughness-dependent reflection cone/horizon if adapting [P3], and use bounded values that do not turn metal black or paint bright chrome like stone.
- [D30] GTAO is already a post composite; [D31] god-rays contact AO may replace it in cinematic path. Test no double-darkening of stone joints/grass under foliage.
- Do not disable environment HDR. [D9] makes it essential for hero armour and other metallic assets.
- Leave `specularOcclusion.enabled=false` unless exact PBR hook and controls pass independent verification.

### 10.8 Dedicated locations remain separate [D32/D33]

The project already has `src/editor/locations/gen/IndirectBounce.js`, a **different** deterministic one-bounce, surfel/visibility-tested system feeding baked underground geometry, with separate `LocationShading` lamps. It operates in unique load-screen locations and **must not** import the outdoor probe streaming or sun-ground map. Its ray visibility methodology can be a CPU reference, but its source geometry, runtime light and versioning are different.

---

## 11. YAML configuration and runtime states

### 11.1 One owner: extend the **actual F config**, not a competing root

PR F recommends `editor.config.yaml → stylizedSurface.sky.ambientProbes`, but this is **not yet implemented** at the source baseline. G must first inspect the actual F config owner and extend it. If F uses a different existing validated location, **follow that** instead of creating duplicate keys.

Illustrative proposal, disabled until genuinely implemented and QA approved:

```yaml
stylizedSurface:
  sky:
    ambientProbes:
      enabled: false
      bounce:
        enabled: false
        quality: balanced
        receivers: [terrain, rocks]
        skyGain: 1.0
        sunGround:
          enabled: false
          strength: 1.0
        seaReturn:
          enabled: false
          strength: 1.0
        specularOcclusion:
          enabled: false
        debugMode: off
```

Keep user-facing settings minimal. Grid spacing, vertical samples, ray counts, secondary reach, cache limits, output packing and GPU/worker budgets belong in a **single validated quality profile** (or appropriately existing F constants). Do not allow many independent YAML knobs to create impossible grid combinations. Ranges must be finite, physical metres correct and exact enum values validated; rejected input should have actionable configuration errors.

### 11.2 State machine, source readiness and neutral fallback

```text
off
  -> no G worker, RTT, GPU field, shader variant or extra sampler
waiting-F
  -> diagnose; preserve existing look
static-bounce-baking
  -> F sky-only output and legacy fill continue
transfer-ready, sky-not-ready
  -> do not sample black/empty GPU target
relight-ready
  -> bind matching geometrySource + skyGeneration atomically
dynamic-ground-unavailable
  -> zero *extra* key bounce, keep other valid terms
coast-unsupported
  -> sea term zero, not generic teal
renderer-fallback
  -> F/legacy as validated, no background compute
dispose
  -> worker jobs cancelled or generations invalidated, textures freed
```

Expose effective `supportedReceivers`, `sourceVersion`, `skyGeneration`, `outputGeneration`, `shadowGeneration`, `readyCoverage` and `fallbackReason` in existing diagnostics. A shader having compiled **does not** mean a physically valid relight has been published.

### 11.3 Source and debug flags

Proposed debug modes: `off | sky | static-bounce | sun-ground | sea | validity | seam | receiver-coverage | diffuse-only | specular-only`. All are opt-in and must not change normal runtime data. Debug heatmap must show **which** term drives brightness, with linear scale legend and input version, not only a final attractive screenshot.

### 11.4 Minimum feature matrix

| Feature | Default | Hard prerequisite |
| --- | --- | --- |
| G static white-sky bounce | **off** | Real F CPU/GPU, common SH basis, linear albedo |
| G terrain receiver | **off** | Correct PBR indirect composability incl. snow |
| G rocks receiver | **off** | Valid world sample + rock material adapter |
| G local sun-ground target | **off** | Proven same-shadow-sampler and draw ordering |
| G water/sea return | **off** | Valid depth/optical units and no duplication |
| G bark/leaves/grass/town | **off** | Dedicated material compatibility + LOD/visibility QA |
| G specular occlusion | **off** | Matching radiometric reference and PBR hook |

G can be released at terrain+rocks with only static sky bounce if the optional sun-ground/coast/more receivers fail cost or correctness gates. Do not label optional work “done” just because the YAML can enable it.

---

## 12. Proposed modular source layout and edits

### 12.1 New module responsibilities (not a mandate to create every file)

| Proposed path | One responsibility |
| --- | --- |
| `src/editor/lighting/probes/BounceConstants.js` | SH/profile/format constants separated from runtime code; reuse F constants |
| `src/editor/lighting/probes/BounceTransfer.js` | Pure one-bounce source SH projection, fixed-order secondary visibility |
| `src/editor/lighting/probes/BounceAlbedo.js` | Validated worker-side linear albedo adapter for terrain and static receivers |
| `src/editor/lighting/probes/BouncePage.js` | Compact versioned binary metadata, exact source/halo hashes and validity |
| `src/editor/lighting/probes/BounceResidency.js` | Low-priority optional jobs/LRU/eviction/cancellation; preferably reuse F worker |
| `src/editor/lighting/probes/BounceRelight.js` | One sky+static bounce combined SH irradiance output, coherent generations |
| `src/editor/lighting/probes/BounceGpuAtlas.js` | Bounded staging/upload, neutral target, atlas slot generation and dispose |
| `src/editor/lighting/probes/GroundBounceMap.js` | Optional local sun-key RTT and shadow/sky signature |
| `src/editor/lighting/probes/GroundBounceNodes.js` | Shared small emitter/receiver samples, height and normal falloff |
| `src/editor/lighting/probes/SeaBounceNodes.js` | Only if coastal optical model validated; may live beside existing sea optics |
| `src/editor/lighting/probes/AmbientReceiverModel.js` | Safe PhysicalLightingModel **indirect** composition without losing direct snow |
| `src/editor/lighting/probes/BounceDiagnostics.js` | Per-term/source/coverage/perf counters, debug readback |
| `docs/rendering/ambient-bounce.md` | Implementation/units/material support, licences and QA evidence |

Prefer **fewer files initially** if small responsibilities naturally fit existing F modules. No generic GI framework, material scanner, event bus, “configure every object” manager or copy of F's coordinate/SH helpers.

### 12.2 Existing file integration, minimised

| Existing source | Change | Forbidden side effect |
| --- | --- | --- |
| [D3] `src/main.js` | Wire lifecycle only via existing resource owners | No second sky/light rig |
| [D4] `InfiniteTerrainView.js` | Relight/map schedule and same slot/source version, existing render phase | No terrain first-frame delay |
| [D5] `TerrainSlotBindings.js` | Optional one shared atlas/samplerless receiver binding | No 49 material programs |
| [D6/D7] terrain/snow model | Correct ambient indirect composition | No missing snow glint |
| [D8/D9] sky/environment | Publish/read consistent sky source and scale; no new exposure | No lost IBL reflections |
| [D10] cloud | Reuse emitter cloud transmittance, canonical origin/clock | No duplicate cloud noise or double shade |
| [D11] foliage fill | Split legacy fake sky/ground/air for converted receivers only | No global scene colour change |
| [D12–D15] trees/bark | Optional composer, preserve wet/snow/transmission/LOD | No class monkeypatch breaking clones |
| [D16] grass | Only if measured cheap; root-based field | No costly per-fragment 7-slab×8 gather |
| [D17] rocks | Preferred extra receiver pilot | No rock glow on top of existing emission |
| [D18–D20] town | Later explicit receiver, avoid camera-global hue duplication | No unconverted town darkening |
| [D21–D24] sea | Read source only; do not rewrite water renderer | No lost foam/refraction/wet rocks |
| [D25/D26] bake | Extract worker-safe albedo **only if source correct** | No GPU readback on move |
| [D27/D28] world coords/store | Same canonical edit revision and neighbour halo | No new world-save format |
| [D29] shadows | Access same real CSM shadow if public API supports | No second shadow-map render |
| [D30/D31] AO | Only carefully balanced material-specific AO interaction | No blanket GTAO removal |
| [D32/D33] location lighting | No production change | No cross-location probe leakage |
| [D34/D35/D39] QA | Add comparison coverage and source diagnostics | No false success in software GPU |

---

## 13. Update graph and exact invalidation

```text
canonical Azgaar terrain + edited height + family albedo + forest/structure
                       |
                       v
             F visibility geometry snapshot
                       |
           +-----------+------------+
           |                        |
      F SH visibility       G low-priority static RGB bounce
           |                        |
           +-----------+------------+
                       v
         bounded resident GPU source pages
                       ^
sky radiance SH / look generation (same sky authority)
                       |
                       v
        G combined sky + white-sky-bounce relight
                       |
             one RGB SH output field
                       |
 optional sun ground RTT from real shadow + cloud / sea
                       |
                       v
             opted-in material indirect
                       |
  direct sun, snow, vegetation transmission and metal IBL unchanged
                       |
              existing HDR scene + post
```

| Event | Retrace F sky visibility? | Retrace G static bounce? | Relight GPU? | Update key ground map? |
| --- | --- | --- | --- | --- |
| Sky colour/time broad change | no | no | yes | if key changes |
| Cloud field moves | no | no | only if broad sky changes | yes, within budget |
| Moon/sun intensity changes | no | no | sky/key term only | yes if supported |
| Material palette changes | only if geometry/occluder changes | affected material halo | affected resident | local covered map |
| Terrain sculpt / undo | affected F halo | affected G primary+secondary halo | changed pages | intersecting local map |
| Forest planted/felled | if canopy provider in F | affected canopy source halo | affected pages | maybe shadow changes |
| Town structure edit | only with approved structural provider | only with approved material/occluder source | affected pages | covered map |
| Player walks within stable region | no | no | no | shift map only at required texel coverage |
| New streamed terrain chunk | cache or F worker | cache or low-priority G worker | newly ready page only | not necessarily |
| Floating origin snaps | **no** | **no** | **no** | **no** if canonical coverage same |
| Teleport | no for old data | no for old data | new resident pages | new map coverage |
| Device loss | CPU pages remain | CPU pages remain | recreate GPU targets | recreate RTT |
| Disabled G | no new work | no new work | no G dispatch | none |

- G source hash includes material family version/terrain/forest/structure revision and full primary + secondary ray support radius; sky colour/time never part of **static** cache key.
- A late worker result must pass **canonical chunk key, source generation, slot token and source config version** checks before uploading. An old chunk's light must not appear for a recycled slot.
- Adjacent owners must bake identical shared boundary probes from the same canonical halo; first-load, revisit, different worker concurrency, undo/redo produce identical hashes.
- Paused render with same sky and material source must not require temporal convergence inside G; TAA outside G still needs normal settle.
- If an edit invalidates geometry for a visible receiver, fall back to F/legacy or an explicitly allowed short grace period, not to a static stale bounce that leaks through raised walls.
- Renderer device loss/quality switch must free old GPU targets only when no current frame reads them, and leave CPU source caches safe for replay.

---

## 14. Test plan: reference mathematics, user visuals and real hardware

### 14.1 Mathematical CPU tests, no renderer

1. `shBasis` axes and order match F and [P7] (+X/+Y/+Z and negative Z).
2. Under a unit upper-hemisphere white sky, an exposed upward Lambert hit with albedo 1 emits outgoing radiance 1; a black hit emits zero.
3. Under occluded hit sky, bounce magnitude decreases monotonically with visibility, all else fixed.
4. Red/blue albedo influences only correct linear RGB channels; SRGB encoding/decoding validated explicitly.
5. Primary angular projection into SH9 matches fixed high-sample quadrature on analytic scenes.
6. Gaunt sky×visibility product matches direct quadrature for band-limited test functions; no coefficient-wise product mistake.
7. Cosine convolution applied once; Lambert divide-by-π only at final material BRDF.
8. Input sky mean ×2 → bounced sky irradiance ×2; **geometry page hash unchanged**.
9. Sun key strength ×2 → distinct key ground term ×2, sky-only white-transfer unchanged.
10. Sun below horizon and no moon → key ground term zero; no hidden daytime constant.
11. Cloud transmittance 0 at emitting patch → direct-key ground emitter zero; no second receiver cloud multiply.
12. Dark cliff between emitter/receiver → blocked or explicitly unsupported, never falsely labelled occlusion-correct.
13. Signed SH coefficients accepted, reconstructed final RGB finite/nonnegative after deliberate window/clamp.
14. Static bake same world/edits/seed/profile → identical Float32 page across worker counts/completion orders.
15. Edits in G primary+secondary support range invalidate page; distant edits don't.
16. Negative canonical chunks and translated equivalent geometry match; origin rebase does not change source bytes.
17. Float16 packed SH output reconstruction tested at dark night, overcast, noon and bright snow to choose acceptable error.
18. Invalid/buried probe relocation and interpolation must not borrow bright light from the other side of a wall.
19. No unbounded cache key/worker scratch growth after a long linear traversal and repeated revisits.
20. Sea depth and optical functions monotonic for **floor** return in deepening same-turbidity water, with finite nonnegative outputs.

### 14.2 Material and GPU renderer tests

- A snow terrain material **with G off and G on** retains identical shadowed directional glints from [D7].
- The same 49 terrain slots share a single shader graph (or unchanged known number of render-route variants), not 49 builds.
- Rock PBR normal, roughness, emissive and wetness unaffected by G on/off except physically local diffuse.
- Bark and foliage custom `direct` wrappers remain active if those receiver options are implemented. Alpha-cut leaf transmission retains backlight but not sun glow inside key shadows.
- A night lantern or actual emissive window retains source brightness; G does not fade the true emissive channel.
- Metallic hero armour and wet rocks retain `scene.environment` specular reflections.
- Town outside/inside boundary shows no view-camera-dependent GI colour discontinuity; unconverted town buildings retain legacy [D20] treatment.
- Dedicated locations and underground vertex lighting remain untouched.
- No 17th fragment sampler, MRT output override, full-screen viewport copy or new shader variant per rock/tree instance.
- Direct, postprocessing, volumetric/cinematic god rays and WebGPU/WebGL fallback paths maintain supported semantics and sane output.
- Missing G bounce while F sky is ready results in F sky-only shading, not black/old chunk.

### 14.3 Synthetic scenes for unbiased reference

| Scene | Required comparison |
| --- | --- |
| Open grey plane + pure black box | Zero bounce from black; sky unaffected |
| Bright sand floor / white wall | Warm tinted lower wall, soft falloff with height |
| Half red / half blue floor | Receiver tracks true source region without chunk squares |
| Grass patch / dry rock | Modest green bounce only on faces looking toward grass |
| 90° cliff corner | No bright sky/sun leaking through cliff |
| Thin wall and gap | Probe normal/view bias and invalid fallback prevent bright-side leak |
| Dense canopy / clearing | Different sky visibility and coloured floor return, no double darkness |
| Dark soil under fresh snow | Bounce shifts colour with snow condition without per-frame static rebake |
| Shallow clear lagoon / deep bay | Bright bottom return in shallows, reduced floor return in deep water |
| Sloped mountains and negative coords | Correct canonical/normal sample and large-world precision |
| Forced rebase / teleport / stream eviction | No stale atlas page, momentary flash or unexpected worker rebake |

### 14.4 Verified real look fixture names [D35]

Existing `scripts/fixtures/environment-look-shots.json` has 38 known shots. Use their **actual** IDs, not guesses:

| Fixture | Check |
| --- | --- |
| `forest-off-12` | Forest floor/bark contrast and emission rebalancing |
| `forest-air-off-12` | Crown/skyline and air in-scatter stay natural |
| `core-rainforest-off-12` | Dense understory readable, no luminous leaves |
| `core-temperate-rainforest-off-12` | Cold wet litter and directional bounce |
| `core-taiga-off-12` | Needle/bark and soil |
| `core-taiga-snow-12` | Snow bounce and glints remain |
| `core-deciduous-off-12` | Canopy and litter contrast |
| `grassland-off-12` | Open sky near-neutral |
| `wetland-off-12` | Mud/water albedo correctness |
| `wetland-rain-12` | Wetness/cloud changes do not static-rebake |
| `coast-off-12` | Cliff/shore rocks, water shader untouched |
| `coast-storm-12` | Sea return and cloud shadow coherence |
| `desert-off-12` | Sand response, no washed tan globe |
| `tundra-off-12` | Open large terrain and quality |
| `glacier-off-12` | Snowfield cool reflectance |
| `forest-off-18.6` | Sunset sky-vs-key energy separation |
| `forest-off-21` | No fake sun bounce at night |
| `town-off-12` | Cobble/wall material and legacy town hue |
| `town-off-21` | Lamps and night contrast preserved |
| `town-rain-19` | Wet rainy dusk and specular |

For each, capture identical pose/time/weather/seed and **G-off (F baseline) / G sky bounce / dynamic key-only / combined** plus debug component heatmaps. First compare **A/A** on the same build to calibrate noise from temporal effects/streaming. Capture a nearby shaded rock, floor, bark and cliff seam crop; whole-image mean can hide a leak.

### 14.5 Numeric quality and performance gates

**Correctness must pass:**

- Zero NaN/Inf/negative displayed irradiance and zero GPU validation errors.
- No unshadowed sun bounce behind a tested opaque cliff, and no source shown as “occlusion correct” if structural blockers weren't included.
- No shared boundary probe mismatch under identical version/halo inputs.
- No geometry ray retrace solely because sun/weather/sky changes.
- No additional sun/sky/canopy AO contribution counted twice; validate per-term decomposition.
- No stale chunk/slot light after eviction/teleport/edits.
- No dark/saturated tile square from probe atlas interpolation at 128 m boundaries.
- No missing snow direct glint, foliage transmission or metallic environment reflections.
- No change to Azgaar IDs, terrain persistence, material family ownership or ocean VFX.

**Performance targets are proposals, NOT measurements:**

- Off: **zero** G worker work, GPU allocations and additional shader variants.
- On, initial terrain+rocks: target **≤0.5 ms incremental mean or close p95** GPU stage at fixed 1280×720 desktop; normal project budget in [D34] may be tighter (+0.20 ms GPU/+0.25 ms CPU reported in older controlled comparison). Do not quietly exceed it without a measured quality tradeoff.
- No regression to terrain first-visible-page latency, moving chunk-commit budget, p95/p99 frame pacing and hitch count. A GPU pass timestamp alone does not include asynchronous uploads and all compute.
- Worker jobs may be costly; they must be low priority, cancellable and bounded; record p50/p95 job, queue wait, scratch buffers, cache hit rate and cancelled generations.
- Dynamic key ground map only if update cadence/shadow sampling and memory budget pass in **native headed WebGPU** at baseline and player movement.
- No accumulated textures as user crosses hundreds of chunks; total live GPU pages bounded by F/G residence limit and local map.
- At night/overcast, data still appears plausible at low luminance; half precision and exposure changes must not quantize shaded areas to black.

### 14.6 Run commands and evidence policy

Existing scripts confirmed in inspected `package.json` (new G-specific flags/scripts must be implemented separately):

```bash
git status --short
git branch --show-current
git log -15 --oneline

npm test
npm run lint
npm run build

npm run qa:perf -- --headed --qa chunk-cross --warmup 8 --duration 12 --settle
npm run qa:perf -- --headed --qa edited-world --warmup 8 --duration 12 --settle
npm run qa:perf -- --headed --qa object-town --warmup 8 --duration 12 --settle
npm run qa:look
npm run qa:postprocessing:browser
npm run qa:world:visual

# WSL: launch real native Windows Chromium WebGPU when Linux browser is software:
npm run qa:perf:windows -- --qa chunk-cross --warmup 8 --duration 12 --settle
```

Use the project's existing `docs/perf-qa.md` native hardware validation and snapshot format. Save ignored evidence under `tmp/ponlai-pr-g/`: `source.json`, `radiometry.json`, `worker.json`, `gpu.json`, `coverage.json`, `seams.json`, `edited-world.json`, `look-captures/` and `abo/`. Record adapter/vendor, render route, active world chunk dimensions, sky/source SHA, all tunables, timestamps source, durations, percentile summaries, screenshot paths, rejected captures and blockers.

**This document makes no claim that tests/hardware QA were run.** The future implementation must actually execute and report them.

---

## 15. Implementation roadmap with stop gates

Follow these **separate, reviewable implementation slices**, integrate only after checking current `main` and existing code, and do not let an optional failure weaken the minimum correctness of static sky bounce. Each phase produces its own small tests or screenshots and must preserve changes committed by other sessions.

### G.0 — Latest-main + dependency and shading-model audit (mandatory)

- [ ] Check `git status`, active branch `main`, last 15+ commits and [D42] `AGENTS.md`; never overwrite newer renderer, coast or forest work.
- [ ] Open actual PR F code. If only the PR F Markdown exists, **stop G and implement/test F first**; record exact missing modules, test evidence and blocker. No guessed import/class names.
- [ ] Verify F's worker-safe visibility SH9 data, canonical X/Z/chunk/halo, stable source hashes, normal/view bias, GPU atlas/residency and neutral fallback.
- [ ] Verify F's terrain ambient diffuse hook does not add sky illumination via a general `emissiveNode`/final-colour multiplication.
- [ ] Resolve source sky SH from implemented PR E (if any), else documented existing [D8]/[D9] authored look, with exact scene-linear and sun-disc exclusion semantics.
- [ ] Inspect installed Three.js's `PhysicalLightingModel`, `LambertLightingModel`, and actual material `setupLightingModel`/`indirect` lifecycle. Do not trust Ponlai's customized Three.js methods as drop-in equivalents.
- [ ] Read [D7] snow, [D13] foliage, [D10] cloud, [D20] camera-global town bounce, [D11] emissive fill before choosing a model composition strategy.
- [ ] Confirm runtime `worldStore.chunkSize=64` and `tileSize=2` from [D3] (128 m terrain chunk), the effective GPU backend, shader sampler count, time/sky look and sample-mode path.
- [ ] Save current baseline screenshots and native WebGPU performance with QA settle and A/A calibration in `tmp/ponlai-pr-g/`. A software/WebGL run is not authoritative performance evidence.

**Stop:** PR F code absent, ambiguous sky units, incompatible lighting model hook, broken or non-headless-ready QA, or unexpected latest changes. Fix/report prerequisites rather than starting a speculative “GI” subsystem.

### G.1 — Real linear albedo proxy + deterministic worker bounce

- [ ] Implement pure `BounceAlbedo` from vetted terrain/bake materials [D25/D26], not screen-space colour or approximate per-biome ID colours.
- [ ] Verify sRGB-to-linear conversion and source palette values against controlled neutral lighting fixtures (grass, pale stone, basalt, snowy ground, mud/litter).
- [ ] Share F's canonical height, forest/structure occluder snapshot and geometry revision, with **extended halo** for primary+secondary rays.
- [ ] Implement fixed-order hit-surface normal, secondary sky-visibility estimator, memoized result for repeated hits, and one Lambert bounce.
- [ ] Start with **16 m bounce spacing, 3 height levels, 48 primary rays** per probe as a budgeted prototype — not mandated production settings.
- [ ] Project the reflected radiance to RGB SH9, test Y-up, SH band order, sign, fixed sample order, normal and secondary-hemisphere orientation.
- [ ] Add source material hash, world generator/edited terrain/forest revision and `bounceFormatVersion` to separate cache entry.
- [ ] Set cancellable low priority, bound scratch arrays and worker jobs and ensure no main-thread synchronous fallback when the worker is unavailable.
- [ ] Test stream order, adjacent boundary equality, edit/undo, huge/negative coordinates, origin rebase, worker failure and invalidation.
- [ ] Save actual per-chunk bounce time, rays, hit-cache reuse and memory before approving quality presets.

**Stop:** blocking terrain jobs, stale albedo on edit, ray-through-cliff false bounce, worker nondeterminism, source hash mismatch or unbounded bake time/memory. Lower resolution before inventing GPU ray tracing.

### G.2 — Unified sky + bounced-sky SH relight

- [ ] Extend F's *actual* relight output; avoid creating a second, independently sampled “bounce GI” texture alongside F's field.
- [ ] Combine sky SH × sky visibility SH using Gaunt product; multiply white-sky bounced transfer by **one** linear sky mean RGB scale.
- [ ] Preserve exact radiance/irradiance/BRDF conversion and exclude direct sun disc.
- [ ] Use SH9 until calibrated; optional deringing must pass energy/colour difference tests and must not artificially brighten deep canopy.
- [ ] Produce one bounded resident RGB SH output (e.g. 7×RGBA16F slabs) and stage an **entire matching source/sky generation** before showing it.
- [ ] Measure upsampling G's 16 m source at F's 8 m nodes once in compute versus sampling both on every fragment; choose smaller GPU cost.
- [ ] Preserve shared program and [D5] samplerless binding constraints, including post/cinematic route shader compile.
- [ ] Confirm G missing → F sky-only, never black/undefined or stale other-chunk bounce.
- [ ] Debug readback/hash **only** during QA to verify static paused output.
- [ ] Test new sky/hour/weather switching yields new relight and **zero additional geometry ray tracing**.

**Stop:** per-component double accumulation, SH basis mismatch, incorrect cosine twice, atlas seam, >16 fragment samplers, per-slot shader program recompilation, invalid GPU resource lifetime or changed baseline with feature off.

### G.3 — Proper terrain indirect + one real rock receiver

- [ ] Create a small PBR indirect model composition that preserves [D7] `SnowLightingModel.direct` and existing TSL lighting context.
- [ ] Opt in terrain only behind valid F/G sky+geometry readiness; test forest floor R canopy and G contact separately from probe visibility.
- [ ] Transition old `foliageSkyFill` in terrain's `floorFill` selectively without removing true spell emission, snow detail and jungle air/fog.
- [ ] Add a specific adapter for [D17] PBR rocks/boulders; preserve authored colour, roughness, normals, moss/snow, rain wetness and coastal rock material state.
- [ ] Fade only the former rock sky/ground fill emission where probe bounce is ready; keep independently authored distance-air effect.
- [ ] Run rocky forest, pale cliff, shaded granite and wet coast A/B; inspect *normal-dependent* bounce, not brightness alone.
- [ ] Validate existing `scene.environment` PBR specular and metal reflection remain unchanged.
- [ ] Count real shader programs: one shared terrain program (per known render-path variant), no per-rock instance clones.
- [ ] Verify no material switches from physical to fake unlit and no surface emission is counted twice.

**Stop:** general `emissiveNode` or `colorNode` multiply, loss of snow glint, metallic cut-out, retained full old rock fill alongside bounced light, over-dark canopy or cost greater than visual gain.

### G.4 — Optional local sunlit ground map, gated on real shadow access

- [ ] Build **tiny proof** that the installed Three.js TSL renderer can sample the same directional/CSM shadow visibility used by direct lighting [D8/D29] within the requested pass.
- [ ] Validate shadow generation ordering in direct, post, volumetric and cinematic paths; do not trigger duplicate full-scene shadow redraw.
- [ ] If the shadow gate fails, leave this slice disabled, document unsupported source, and keep G sky bounce correct.
- [ ] Create one bounded local RTT around camera with canonical world UV, ground-height/linear albedo and valid rectangle metadata.
- [ ] Share [D10] cloud transmission at the **emitter**, not the receiver, with the same weather clock and wrapped coordinates.
- [ ] Use key irradiance × Lambert response × actual shadow/cloud **once**, and a validated normalized blur of local ground response.
- [ ] Incorporate receiver geometric normal, height difference, view/facing and local range, avoiding light through vertical solids.
- [ ] Choose **one** key-bounce mode: local RTT OR directional bounced-probe SH, never both for same key energy.
- [ ] Update on meaningful shadow/source/map footprint signature changes and only within measured GPU budget.
- [ ] Validate missing shadow/cloud/RTT, sunrise, sun below horizon, moon if supported, teleport, origin rebase and device loss.

**Stop:** current renderer does not expose a safe shadow sampler, blue/green surface glow behind a solid, >one sky/key attenuation, read-write hazard, new viewport copies or newly expensive shadow update.

### G.5 — Optional coast return, only with consistent optics

- [ ] Re-open the latest coastal commits and [D21–D24] sea optics/levels before code changes.
- [ ] Prove linear seafloor albedo, depth and attenuation scale against the actual sea material. Don't convert rendered turquoise visual colour to diffuse radiance.
- [ ] Separate diffuse floor return and waterbody backscatter from surface Fresnel/specular/refraction/foam.
- [ ] Ensure sea level -1.5 m default and dynamically driven source, no Ponlai zero-level assumption.
- [ ] Bound shore-distance and surface-facing influence; deep water does not retain shallow floor bounce.
- [ ] Only share source versions; do not rewrite advanced sea rendering or wave texture array just for G.
- [ ] Test lagoon, deep bay, sandstone cliff, wet granite, night, storm and camera jumps.
- [ ] Leave `seaReturn.enabled=false` with a documented pending item if no validated depth/optical contract.

**Stop:** generic turquoise emission, deep-water brightness incorrectly rising, double water BRDF or overwriting new ocean work.

### G.6 — Optional additional outdoor receivers and specular occlusion

- [ ] After rock pilot, attempt **bark** first, composing [D13] direct transmission/wet/snow wrappers and [D12/D15] authored emission.
- [ ] Only then test selected leaves; use stable crown point, thin-sheet response and preserved alpha/LOD transitions.
- [ ] For grass [D16], evaluate root/vertex probe sampling cost before any fragment SH9 implementation.
- [ ] For town walls [D18–D20], require structural occluder source, material palette and semantic revision; avoid camera-global town hue in local physically bounced result.
- [ ] Keep unconverted buildings/trees/grass on legacy emission and hemisphere system.
- [ ] Test optional specular/environment occlusion only after correct matching units and existing GTAO/SSGI interaction understood. Preserve metallic armour reflection.
- [ ] Do not broaden material tagging to “all meshes” unless explicit adapters, LOD and per-type QA exist.

**Stop:** duplicate thin-leaf transmission, missing wet highlights, breakage in material clones, new shadow leaks through interiors, or 49×/N-instances shader multiplication. Optional slices may remain pending.

### G.7 — Combined QA, performance and two review passes

- [ ] Run pure math, CPU source, deterministic worker, GPU pack/read, lighting composition and lifecycle tests from `14`.
- [ ] Execute `npm test`, `npm run lint`, `npm run build` and existing visual/movement/post QA commands.
- [ ] Capture **A/A** and A/B/A from same hardware, source SHA, render size and camera/look for forest, rainforest, stone coast, snow, town and night.
- [ ] Native WebGPU compare GPU timestamps **and** separate CPU/frame pacing with timestamps off; report GPU compute/transfer scopes explicitly unavailable when unsupported.
- [ ] Check 128 m seam, float-origin rebases, negative coords, huge imported Azgaar mountain, fast travel and resuming streaming after editor reset.
- [ ] Check all dynamic weather/time transitions and feature on/off/rebuild/dispose cycles.
- [ ] Verify no initial huge worker GPU shader compilation, >16 samplers, new whole-screen copy/mips or growing LRU memory.
- [ ] Review each code path for fatal GPU/device error handling, resource disposal, strong logging with throttling and defensible defaults.
- [ ] Review known limitations and rejected screenshot captures; no false performance claim from unheaded/software GPU.

**Stop:** any hard correctness condition, significant new stutter or undocumented visual regression. Resolve them before enabling a tier.

### G.8 — Final implementation commit and release rollback

- [ ] Recheck latest `main` and integrate without overwriting newer changes. Keep files focused and clearly owned, not giant god object.
- [ ] Confirm no GitHub Actions, feature branches or worktrees.
- [ ] Preserve Ponlai **and** tidewater copyright/MIT notices on directly adapted implementation fragments, including third-party asset/source scrutiny.
- [ ] Document exact visual support and fallback: terrain+rocks required, bark/grass/sea/key-map optional.
- [ ] Update `docs/rendering/ambient-bounce.md` with maths, scene units, YAML keys, storage format, supported GPUs, QA results and known limitations.
- [ ] One rollback `ambientProbes.bounce.enabled: false` must return pixel-identically to the validated F-only scene and release G resources.
- [ ] Record native hardware QA report, p95/p99, GPU cost/bytes, shader counts, screenshots, source IDs and explicit pending TODOs.
- [ ] Don't mark G fully completed when PR F is still a plan or only Markdown/docs have changed.

**Proposed later code commit title (not this document commit):**

```text
feat(lighting): add streamed SH sky bounce and validated terrain and rock receivers
```

---

## 16. Definition of done and rejection conditions

### Mandatory source and math correctness

- [ ] Actual PR F code, tests and active valid outdoor receiver are verified **before** G code starts.
- [ ] One shared SH9 basis/sky radiance source with **one** angular Gaunt product, **one** cosine convolution and a clear Lambert BRDF division.
- [ ] A unit white sky and diffuse albedo yield physically interpretable one-bounce transfer; no impossible negative/NaN irradiance.
- [ ] Static geometry albedo comes from real material-family source, not screen-space display RGB or arbitrary colour-by-biome ID.
- [ ] Signed Y-up/negative-Z/canonical index convention works for negative and enormous world positions.
- [ ] All F/G shared boundary probes produce identical source coefficients under same source version; terrain edit halo includes secondary source reach.
- [ ] Sun/key and sea source energy cannot be counted a second time through other terms.
- [ ] Changed sun/weather/sky never cause static geometry retrace.
- [ ] Source bin/layout version, source hash, sky generation and GPU output generation available in diagnostics.

### Mandatory production renderer behaviour

- [ ] One coherent sky+G bounced-sky **indirect field**, no extra global scene sun, second environment, or independent “GI-as-emissive”.
- [ ] Terrain and **one more PBR exterior receiver**, preferably rocks, actually render bounced indirect **at the correct lighting-model stage**.
- [ ] Snow shadows and glints [D7], wet reflections, authored roughness/material IDs, grass blade alpha/transmission and remaining true emissions stay valid.
- [ ] Old terrain/rock faux sky and ground fill is disabled or blended **only while receiving equivalent G bounce**, not globally.
- [ ] Unconverted towns/trees/rooms retain prior look; [D20] camera-global town hemisphere remains in place for those legacy receivers.
- [ ] Metallic armour and wet rock environment IBL and existing contact AO remain coherent, no universal black metal.
- [ ] Dedicated load-screen location bake and light/lamps unaffected.
- [ ] No extra full scene viewport copy, unneeded shadow pass, 17th sampler, lost MRT data or per-slot shader compilation.

### Mandatory streaming, quality, performance and fallback

- [ ] Disabled G runs **zero** G workers, dispatches or GPU allocations and restores F/legacy pixels exactly.
- [ ] No stale previous-chunk bounce when a terrain slot recycles, camera teleports, resets or edits; neutral sky-only fallback reliable.
- [ ] CPU/GPU residency and worker caches bounded over unbounded traversal and repeated revisits.
- [ ] No terrain first-visible-page latency or critical upload queue regression; workers prioritised correctly.
- [ ] Native WebGPU QA for the **same** 38-fixture world, paired sample A/A/A/B/A and stage profiling; screenshots reviewed in forest, rock, coast, snow, town, sunset/night.
- [ ] Measured memory, shader/sampler counts, direct/indirect term intensity, frame p95/p99/hitches and worker p95 before claiming performance safe.
- [ ] All device fallback/unsupported shading paths explicit and stable.
- [ ] Code review, tests, docs, source license/provenance completed on newest `main`.

### Optional slices have their own real gates

- [ ] Dynamic sun-ground map: only if existing CSM/directional shadow visibility and renderer ordering are demonstrably correct.
- [ ] Coastal return: only if floor/water absorption and cloud/key energy are correctly separated.
- [ ] Bark/leaves/grass/town: only if existing material hooks, LOD/alpha/semantic occluders and performance pass.
- [ ] Specular probe occlusion: only if identical radiance conventions and roughness-dependent visibility are validated.

**Reject G** if: F remains unimplemented but G claims success; sky multiplied by SH visibility coefficients element-wise; geometry rebaked on each cloud frame; bounce emitted as flat global colour; snow model direct lost; water renderer overwritten; shadows sampled without validating API; 49 material recompiles; previous chunk lighting sampled after slot reassignment; fake bright interior bounce; unbounded resource residency; no GPU proof; or specification is represented as completed feature.

---

## 17. PR H handoff — volumetric clouds and coherent shadows

Next PR H will implement volumetric/cloud layers. PR G should leave **these narrow real interfaces**, only once actual source code exists:

1. **Sky source**: one scene-linear SH9/mean-sky publisher with generation, no duplicate exposure or sun-disc energy.
2. **Cloud transmission field**: shared existing [D10] canonical world-position wrap, weather clock, cloud source version and a sunlight attenuation query for *emitting* ground patches. PR H can change the cloud algorithm without rewriting G's bounce physics.
3. **Light sources**: one authoritative [D8] sun/moon directional colour/intensity state; no duplicate sun shadow maps.
4. **Ground map dirty contract**: sun shadow generation, cloud field generation, canonical coverage and source albedo revision; a weather change updates the map, not the CPU geometry bake.
5. **Relight contract**: G recomputes SH sky+static bounce only when source environment generation or resident probe pages change; a cloud moving without changing mean sky does not invalidate worker data.
6. **Receiver policy**: explicit supported terrain/rocks and optional vegetation, town, metal; avoid all-object material mutation.
7. **GPU budgets**: bounded GPU compute/update/upload costs so cloud rays can coexist with shadow and postprocessing.
8. **Debug and test evidence**: cloud-shading at emitter vs receiver, A/A unchanged baseline, spot/night differences, source versions and existing screenshot QA.

Do not let PR H “improve cloud lighting” by applying the same attenuation to G's received bounce twice, reducing sky SH under the same cloud a second time, or overwriting the direct sun shadow path.

---

## 18. Immutable Drusniel source references — [D1] to [D43]

The exact source baseline used in this plan is [Drusniel `3e418938f8d57c67bcb56cf9082233b291054210`](https://github.com/danielsobrado/drusniel-world-builder/tree/3e418938f8d57c67bcb56cf9082233b291054210). All source links below are **immutable commit-pinned URLs**, not floating `main` pointers. Re-audit latest `main` during code implementation; do not overwrite newer enhancements.

- **[D1]** [`docs/plans/ponlai-pr-f-streamed-ambient-sh-probes-2026-11-20.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/docs/plans/ponlai-pr-f-streamed-ambient-sh-probes-2026-11-20.md) — PR F contract; verifies the present dependency is a specification, not executable probe code.
- **[D2]** [`editor.config.yaml`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/editor.config.yaml#L1-L78) — map.tileSize=2, map.chunkSize=32, world.chunkSize=64 and 49-slot residency.
- **[D3]** [`src/main.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/main.js#L283-L326) — actual worker/store wiring; config.world.chunkSize with map.tileSize means 128 m terrain chunks.
- **[D4]** [`src/editor/InfiniteTerrainView.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/InfiniteTerrainView.js#L110-L256) — slot geometry, common material and per-object source bindings; its worker/commit and render-path code is in the same file.
- **[D5]** [`src/editor/materials/TerrainSlotBindings.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/materials/TerrainSlotBindings.js#L1-L134) — samplerless texture loads, stable onObjectUpdate and one shader program across 49 slots.
- **[D6]** [`src/editor/terrainMaterial.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/terrainMaterial.js#L605-L688) — snow model application, existing floorFill emission and cloud-shadow composition.
- **[D7]** [`src/editor/stylized/SnowLightingModel.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/SnowLightingModel.js#L1-L29) — current PhysicalLightingModel direct override and setupLightingModel replacement that G must preserve.
- **[D8]** [`src/editor/stylized/StylizedSkyView.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/StylizedSkyView.js#L259-L462) — single scene sun/hemisphere/HDR authority, active look and output exposure writes.
- **[D9]** [`src/editor/stylized/sky/sceneEnvironment.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/sky/sceneEnvironment.js#L1-L76) — asynchronous HDR env loading, environment intensity, metallic/specular IBL.
- **[D10]** [`src/editor/stylized/CloudShadow.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/CloudShadow.js#L1-L129) — canonical cloud coordinate wrap, cloud uniforms and receivedShadowNode direct-only attenuation.
- **[D11]** [`src/editor/stylized/forest/foliageLight.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/forest/foliageLight.js#L1-L211) — legacy sky/ground/air fake fill for terrain, bark, rocks, understory and buildings.
- **[D12]** [`src/editor/stylized/forest/TreeSurfaceMaterial.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/forest/TreeSurfaceMaterial.js#L1-L26) — authored emission preservation and tree material cloning.
- **[D13]** [`src/editor/stylized/forest/FoliageNodeMaterial.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/forest/FoliageNodeMaterial.js#L1-L117) — direct lighting adapter for leaf transmission, wet sparkle, needle specular and snow.
- **[D14]** [`src/editor/stylized/StylizedTreeMaterials.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/StylizedTreeMaterials.js#L53-L175) — leaf material, alpha test and treeFoliageEmission.
- **[D15]** [`src/editor/stylized/forest/TreeBarkMaterial.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/forest/TreeBarkMaterial.js#L1-L174) — bark PBR and wetness/normal/legacy bounce emission.
- **[D16]** [`src/editor/stylized/StylizedGrassMaterial.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/StylizedGrassMaterial.js#L56-L481) — double-sided Lambert instanced blade and custom normals/transmission.
- **[D17]** [`src/editor/stylized/StylizedRockView.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/StylizedRockView.js#L68-L124) — best second PBR receiver with existing rockShadeEmission.
- **[D18]** [`src/editor/towns/TownKitMaterial.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/towns/TownKitMaterial.js#L114-L287) — town PBR material atlas and authored ground/sky emission.
- **[D19]** [`src/render/materials/townGrade.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/render/materials/townGrade.js#L1-L145) — culturally distinct material family colour grade and buildingShadeEmission.
- **[D20]** [`src/editor/world/settlements/view/SettlementGroundBounce.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/world/settlements/view/SettlementGroundBounce.js#L1-L66) — camera-nearest-town modifies global hemisphere.groundColor; not physically local.
- **[D21]** [`src/editor/water/SeaOptics.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/water/SeaOptics.js#L1-L96) — current water/lagoon/shallow/deep optical settings.
- **[D22]** [`src/editor/stylized/SeaOpticsShading.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/SeaOpticsShading.js#L1-L65) — visual water depth colour/scattering, not a bounce albedo source by default.
- **[D23]** [`src/editor/water/seaState.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/water/seaState.js#L1-L74) — sea level and live water/weather state; default scene sea level -1.5 m.
- **[D24]** [`src/editor/water/OceanDistanceField.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/water/OceanDistanceField.js#L1-L22) — coastal shoreline distance provider.
- **[D25]** [`src/editor/materials/TerrainMaterialBakeCpu.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/materials/TerrainMaterialBakeCpu.js#L155-L403) — CPU terrain family/material/wetness/shoreline source for vetted linear albedo.
- **[D26]** [`src/editor/materials/TerrainMaterialBakedNodes.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/materials/TerrainMaterialBakedNodes.js#L128-L457) — TSL terrain family surfaces and PBR roughness/albedo blend.
- **[D27]** [`src/editor/world/InfiniteWorldStore.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/world/InfiniteWorldStore.js#L102-L177) — canonical edited world store and revision events; undo/load in later ranges.
- **[D28]** [`src/editor/world/WorldCoordinates.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/world/WorldCoordinates.js#L1-L154) — negative world-Z convention, signed-safe chunk keys and cell/chunk transforms.
- **[D29]** [`src/render/shadows/CascadedSunShadows.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/render/shadows/CascadedSunShadows.js#L1-L26) — current light CSM setup, not Ponlai sunShadow.currentPCFVisibility.
- **[D30]** [`src/render/postprocessing/nodes/AmbientOcclusionNode.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/render/postprocessing/nodes/AmbientOcclusionNode.js#L1-L94) — GTAO and post AO compositing.
- **[D31]** [`src/editor/stylized/GodRaysContactOcclusion.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/GodRaysContactOcclusion.js) — cinematic/volumetric contact AO, separate from post GTAO.
- **[D32]** [`src/editor/locations/gen/IndirectBounce.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/locations/gen/IndirectBounce.js#L1-L226) — existing **separate underground** deterministic indirect-bounce surfels.
- **[D33]** [`src/editor/locations/materials/LocationShading.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/locations/materials/LocationShading.js#L1-L188) — dedicated location lighting and carried lamp; not outdoor GI receiver.
- **[D34]** [`docs/perf-qa.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/docs/perf-qa.md#L1-L195) — authoritative movement native WebGPU hitches, staging and profiling gates.
- **[D35]** [`scripts/fixtures/environment-look-shots.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/scripts/fixtures/environment-look-shots.json) — 38 verified authored biome, town, weather, day/night visual shots.
- **[D36]** [`scripts/run-environment-look-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/scripts/run-environment-look-qa.mjs) — existing deterministic screenshot/look gate runner.
- **[D37]** [`src/editor/stylized/sky/skyLight.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/sky/skyLight.js#L1-L82) — unlit sea/fog sky colour ratio, not physical SH sky radiance.
- **[D38]** [`src/render/postprocessing/PostProcessingGraph.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/render/postprocessing/PostProcessingGraph.js) — HDR/MRT post graph and viewport texture hazards.
- **[D39]** [`package.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/package.json) — actual npm scripts: test/lint/build, perf, look, postprocessing, world visuals.
- **[D40]** [`src/editor/stylized/forest/CanopyVisibility.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/forest/CanopyVisibility.js#L1-L83) — prototype-local foliage visibility, not a global probe volume.
- **[D41]** [`src/editor/stylized/forest/TreeSurfaceMaterial.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/forest/TreeSurfaceMaterial.js) — additional authored emission owner and clone contract; see D12.
- **[D42]** [`AGENTS.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/AGENTS.md) — repo rules, Azgaar ID and performance QA requirements, no branches/Actions.
- **[D43]** [`src/editor/world/TerrainCommitQueue.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/world/TerrainCommitQueue.js#L1-L144) — critical terrain memcpy/commit frame budget; G worker cannot block it.

## 19. Immutable Ponlai source references — [P1] to [P14]

Upstream Ponlai studied at [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e). These are **concrete source-code references**. A port should record source lineage per adapted algorithm/module; do not copy a whole foreign renderer or island geometry.

- **[P1]** [`packages/island/world/AmbientProbes.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/AmbientProbes.ts#L1-L224) — world-anchored island probe design, 2 m lattice, 128 primary/16 secondary rays; see same file lines 490–781 for hitRadiance/project/merge.
- **[P2]** [`packages/render/lighting/AmbientRelight.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientRelight.ts#L590-L925) — RGB SH sky×visibility, static sky bounce, key/sea contributions, deringing and seven GPU output slabs.
- **[P3]** [`packages/render/lighting/AmbientSample.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientSample.ts#L203-L457) — trilinear probe receiver sampling, normal/view bias and ambient diffuse replacement with specular occlusion.
- **[P4]** [`packages/render/lighting/AmbientGrade.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientGrade.ts#L1-L330) — time/weather-dependent art-direction gains, not universal lighting coefficients.
- **[P5]** [`packages/render/lighting/GroundBounce.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/GroundBounce.ts#L1-L341) — tidewater-derived ground RTT, sunlit diffuse albedo, exact-source shadow, blur, receiver falloff, dirty signature; preserve header MIT attribution.
- **[P6]** [`packages/render/lighting/Harmonics.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/Harmonics.ts#L1-L368) — SH9 real basis operations, Gaunt triple product, cosine lobe, deringing and directionality boost.
- **[P7]** [`packages/render/lighting/ProbeFormat.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/ProbeFormat.ts#L1-L40) — Y-up SH9 order and full 80-float upstream static probe format.
- **[P8]** [`packages/render/lighting/AmbientVolume.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientVolume.ts#L1-L255) — single finite-island buffer, staged GPU swap, seven RGBA16F SH irradiance slabs.
- **[P9]** [`packages/island/materials/BounceGround.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/materials/BounceGround.ts#L1-L38) — albedo sourced from real terrain and seabed material palettes, not display colours.
- **[P10]** [`packages/render/lighting/MeadowCanopy.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/MeadowCanopy.ts#L1-L118) — sun/key through vegetation canopy, independent from static indirect SH bounce.
- **[P11]** [`packages/render/lighting/GroundBounce.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/GroundBounce.ts#L362-L512) — PhysicalLightingModel indirectDiffuse/indirectSpecular/direct integration and environment BRDF.
- **[P12]** [`packages/render/lighting/EnvironmentBRDF.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/EnvironmentBRDF.ts#L1-L97) — optional custom 32×32 GGX split-sum BRDF, not needed to port with G.
- **[P13]** [`packages/island/world/SkyOcclusion.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/SkyOcclusion.ts#L1-L155) — bounded sky/contact geometry and sparse scene-field concepts.
- **[P14]** [`LICENSE`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/LICENSE) — Ponlai root MIT (audit tidewater headers and assets separately).

### 19.1 Additional focused source ranges

- [Ponlai `AmbientProbes.ts` secondary hit ray radiance, lines 490–622](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/AmbientProbes.ts#L490-L622) — secondary hemisphere, diffuse hit albedo, memoized reflected radiance and transmittance.
- [Ponlai `AmbientProbes.ts` SH projection and baking, lines 625–675](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/AmbientProbes.ts#L625-L675) — fixed-order SH9 projection and deterministic probe arrays.
- [Ponlai `AmbientProbes.ts` merge/fill, lines 696–781](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/AmbientProbes.ts#L696-L781) — canonical island chunk merge, invalid probe filling and boundary handling; not an infinite-world atlas.
- [Ponlai `AmbientRelight.ts` update/day/night/sky gains, lines 670–775](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientRelight.ts#L670-L775) — sky-source and dynamic key parameter publication without ray rebake.
- [Ponlai `AmbientRelight.ts` SH/sea/sky compute relight, lines 799–925](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientRelight.ts#L799-L925) — direct sky×visibility via Gaunt, sky mean bounced RGB, sun key lobes and seven-slab output.
- [Ponlai `GroundBounce.ts` source model and RTT, lines 167–254](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/GroundBounce.ts#L167-L254) — emitter albedo, sun shadow and blur.
- [Ponlai `GroundBounce.ts` map reader/dirty scheduling, lines 255–341](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/GroundBounce.ts#L255-L341) — receiver-facing/height attenuation, signature update and irradiance path.
- [Ponlai `GroundBounce.ts` PBR receiver model, lines 362–512](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/GroundBounce.ts#L362-L512) — correct indirect BRDF integration, material model composition reference.
- [Drusniel `SnowLightingModel.js` custom direct override](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/SnowLightingModel.js#L8-L28) — must retain glints and original direct sunlight shadowing.
- [Drusniel `FoliageNodeMaterial.js` custom direct wrapper](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/forest/FoliageNodeMaterial.js#L69-L113) — must retain wet highlight, leaf transmission and snow.
- [Drusniel `foliageLight.js` legacy emitted light components](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/stylized/forest/foliageLight.js#L111-L211) — split sky, reflected ground and separately authored air, not double all.
- [Drusniel `SettlementGroundBounce.js` global town hue](https://github.com/danielsobrado/drusniel-world-builder/blob/3e418938f8d57c67bcb56cf9082233b291054210/src/editor/world/settlements/view/SettlementGroundBounce.js#L39-L66) — one global viewer-dependent colour should not masquerade as spatial GI.

### 19.2 Underlying rendering research and attribution

- [Jasmin Patry, *Real-Time Samurai Cinema: Lighting, Atmosphere, and Tonemapping in Ghost of Tsushima*, SIGGRAPH 2021](https://advances.realtimerendering.com/s2021/) — sky-visibility and one-bounce SH light transfer, relighting and artistic grading.
- [Peter-Pike Sloan, *Stupid Spherical Harmonics (SH) Tricks*, GDC 2008](https://www.ppsloan.org/publications/StupidSH36.pdf) — SH basis, Gaunt product and efficient low-order sky lighting.
- [Ramamoorthi & Hanrahan, *An Efficient Representation for Irradiance Environment Maps*, SIGGRAPH 2001](https://graphics.stanford.edu/papers/envmap/) — cosine convolution and low-order diffuse irradiance.
- [Majercik et al., *Scaling Probe-Based Real-Time Dynamic Global Illumination for Production*, JCGT 2021](https://jcgt.org/published/0010/02/01/) — probe bias/relocation, leakage and quality.
- [Daniel Greenheck, `tidewater`](https://github.com/dgreenheck/tidewater) — expressly credited by Ponlai's `GroundBounce.ts` header, MIT. **Retain copyright/SPDX** when incorporating code. Verify third-party dependencies/asset licenses individually.

### 19.3 Final implementation contract

**One coherent bounded outdoor lighting field** combines F's world-aligned sky visibility, G's static reflected-sky SH transfer and (where proven safe) one unique dynamic sunlit-ground or sea contribution. The field is updated through source/versioned relight, never unbounded geometry retracing. Approved terrain and rock PBR material receivers get this illumination through **indirect lighting**, not a second glowing emission, while unchanged receivers continue to render correctly.

**PR F remains a prerequisite. The present PR G file is a detailed source-linked design specification only, and this Markdown commit does not implement or test it.**
