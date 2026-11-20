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
