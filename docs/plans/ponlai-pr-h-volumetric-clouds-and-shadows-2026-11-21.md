# Ponlai integration — PR H: volumetric clouds and coherent cloud shadows

**Status:** DETAILED IMPLEMENTATION SPECIFICATION ONLY — no rendering implementation or hardware QA is claimed by this document.  
**Date:** 2026-11-21  
**Drusniel baseline inspected:** [`ec15cd09c263e1f45bea1c42affc2fd70541c91b`](https://github.com/danielsobrado/drusniel-world-builder/tree/ec15cd09c263e1f45bea1c42affc2fd70541c91b)  
**Ponlai baseline inspected:** [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e)  
**Roadmap:** after [PR G](ponlai-pr-g-ground-bounce-ambient-relighting-2026-11-21.md), before PR I offshore FFT.  
**Repository rules:** work directly on latest `main`; preserve concurrent ocean, forest and renderer changes; no GitHub Actions, branches or worktrees. Keep code small, KISS/YAGNI/SOLID, YAML config, strong error handling and native WebGPU QA.

> **Actual dependency status:** PRs E (physical atmosphere), F (SH probes) and G (ground bounce) are **specifications**, not currently implemented in the inspected baseline. PR H's core cloud renderer can be independently integrated into the **existing** StylizedSkyView/sky-look rig; optional physical-sky, environment-cubemap and probe relighting hookups must not be coded as if hypothetical E/F/G APIs exist.

> **Terminology:** Drusniel already has procedural **2D sky-dome clouds**, a separate 2D-procedural **ground shadow** calculation, a second cloud-transmission **sky dome render pass** for rays, and optional **volumetric god rays** (3D light scattering in post). It does **not** yet have a physically volumetric **cloud density raymarch**. PR H must unify sky appearance, cloud-ground shadow and shaft occlusion without mistaking volumetric shafts for volumetric clouds.

---

## 1. Desired visual outcome

### 1.1 Non-negotiable appearance

- Fair skies: individually readable cumulus with a rounded, detailed lit top, darker billowing bottom, thin bright silver edges near the sun, broken small gaps and real 3D parallax. No cotton cut-outs or 2D projected FBM blur.
- Cloudy skies: wider, connected stratocumulus masses with depth, mixed holes, softness below and visible form changes as weather/region changes; not an overcast grey mask pasted over the sky.
- Overcast and storms: lower continuous stratus, varied dark bases and bright diffused upper cover, occasional structurally believable breaks; no hard high-contrast checkerboard shadows under an even deck.
- Sunset: warm direct-scattered edges and cooler shaded sides; night: moonlit dark clouds, stars/moon attenuated by *transmittance*, not by an unrelated mask. No brightness increase when sun is below horizon.
- Ground: the same clouds on the same clock obstruct the sun's direct lighting once, with shadows projected correctly as the player flies/walks across negative/huge coordinates.
- Distance: clouds dissolve into the existing atmosphere, far fog and horizon; never a straight clipping line, obvious noise-tile repeat or camera-attached band.
- Motion: stable reprojection and cloud depth across camera turn, free flight, viewport resize, scene quality toggle, storm change, time scrub, floating-origin snap, player teleport and renderer recovery.
- No change to ocean/foam/water optics, snow glints, foliage direct transmission, material palettes, sky stars/moon, other god rays, world weather simulation or edited Azgaar tiles.
- H disabled: **no new GPU allocation, compute dispatch or shader variant** and old pixels/behaviour remain exactly the same.

### 1.2 Mandatory minimum shipping slice

1. A reusable **world-canonical 3D density** and cloud-layer shape with weather-driven cumulus–stratus interpolation.
2. A lower-resolution **volumetric view trace** that outputs scene-linear cloud radiance, transmittance and characteristic depth, and composites correctly into Drusniel's sky dome.
3. A **ground direct-light transmittance** field traced from the same density and consumed through the existing `receivedShadowNode` hook with sky-shadow synchronization.
4. No duplicate procedural cloud computation through the existing `cloudMaskScene` while H drives the sky, and no missing god-ray occlusion.
5. Camera, floating origin, weather, wind and night handling that is numerically stable and deterministic.
6. Bounded GPU resources and CPU work, quality tiers, shader/asset licensing, device-loss fallback and real hardware visual/performance QA.

### 1.3 Optional, gated expansions

- Temporal 4×4 interleave with cloud-depth reprojection when simpler quarter/half trace is measured insufficient and its history correctness is proven.
- Distant panorama and upper cirrus/fibre layer, prioritizing horizon stability and correct lighting rather than copying all Ponlai cloud layers at once.
- Multiple scattering orders, conservative slab/column diffusion, shafts through clouds, rain curtains, internal lightning and rainbows.
- Cloud environment reflection map/PMREM changes, **only** if a stable sky-environment publication path is implemented, staged and measured.
- PR F/G sky/bounce relighting from cloud-shaded light, **only** if F/G exist as real code; broad atmosphere integration with E if E exists.
- Optional lightning-point illumination with existing strike position and a separate transient render term outside temporal cloud history.

The mandatory minimum can ship without the optional effects if those are too costly or visually unstable. An “enabled” YAML key is not proof of implementing a listed feature.

### 1.4 Explicit exclusions

No whole-world cloud voxel atlas, per-terrain-chunk sky volumes, CFD, per-tree fragment cloud marches, whole-scene framebuffer copy from material shaders, duplicate directional sun, new exposure controller or fallback sky rig, global hard-coded 256 steps/pixel, overwriting PR G SH material prototypes, modifying Azgaar 0–12 or custom 32–254 IDs, duplicating storm scheduler/wind/time inputs, changing underwater location lighting or rewriting coastal ocean shaders.

Do not copy upstream fixed 4–9.2 km cloud heights, 12 km shadow span, 6,360 km Earth radius, entire island coordinate system, 256² shadow texture, literal multiple-scattering gains or proprietary/unknown binary noises without testing and provenance verification.

---

## 2. Verified current Drusniel code and critical integration risks

| Problem | Current owner | PR H action | What must not break |
| --- | --- | --- | --- |
| 2D sky layer | [D3] `StylizedSkyView.createSkyMaterial` | Optional H radiance/transmittance substitution | Sun, moon, stars, fog and authored look |
| Sky cloud mask | [D3] `cloudCoverageNode` using [D6/D7] FBM and packed noise | Keep exact off fallback; do not evaluate when H active | Sky legacy look and shader cost |
| Cloud colour/shading | [D8] `litCloudColorNode` derivatives, lightning uniform | Replace cloud lighting only in H path | Existing cloud core, edge, silver colour references |
| Ground shadow | [D4] `CloudShadow` procedural FBM, direct shadow hook | Replace source with same H density map when valid | Existing `receivedShadowNode` chain and LOD clones |
| Canonical drift | [D5] `AtmosphereMotion`, [D4] wrap | Stable CPU double/canonical origin, GPU-local coords | No tile seams at huge/negative X/Z |
| Sky look and preset | [D9–D14] sky looks, regional weather | Read resolved look and evolve cloud type/coverage | No second weather/clock authority |
| Storm/lightning | [D15–D17] storm and scheduler | Reuse current frame events and storm intensity | No scheduler duplication, temporal lightning ghosts |
| Game frame | [D18] main frame update | Publish look, weather, wind, camera once | No double cloud update on hidden cameras |
| God rays cloud pass | [D19/D20] god rays pipeline, cloud mask scene | Reuse H transmission where possible | Cloud shafts and cinematic effect |
| Render routing | [D21] `InfiniteTerrainView.render` | One pre-draw cloud update for all active branches | Cinematic/volumetric bypass post graph |
| Scene temporal | [D22–D26] TAA/MRT/history | Separate H view history, same invalidations | No double jitter or use of old-depth sky history |
| Wind source | [D28/D29] world-wind | Read same resolved prevailing wind, cloud layer separate | No per-fragment repeated gust texture fetch |
| Config and shader | [D2/D30] YAML validator | Add `stylizedSurface.sky.volumetricClouds` | Do not rename `godRays.volumetric` |
| Noise and licensing | [D31] CC0 source library | Generate stable original 3D noise or validated asset | Don't assume any unknown binary is CC0 |
| Performance/QA | [D32–D40] perf and fixtures | A/A/A/B screenshots and headed WebGPU | No false performance claim |

### 2.1 The present sky dome is not a physical cloud volume

[D3] builds `cloudCoverageNode` from a direction-dependent projected 2D field with `cloudMotionCoordinatesNode`, low FBM and [D7] noise erosion. It gates opacity by `cloudFloor/cloudCeiling`, shades through [D8] a screen derivative toward sun, blends a cloud colour on the clear sky and applies fog/exposure. This renders a stylized sky, not layers of cloud density with real optical path length.

Its two-octave ground shadow in [D4] uses a projected sun point and broad penumbra. That is *deliberately cheaper* and visually somewhat aligned with the sky, but not the same volume. [D3] also renders an independent cloud mask scene for [D19] god rays. H must avoid paying for all three legacy calculations **plus** new volumetric passes after enable.

### 2.2 The active render path bypasses post in important cases

[D21] `InfiniteTerrainView.render` calls `beforeMainRender(camera)`, then tries `godRays.render(camera)` first if technique is `volumetric` or `cinematic`, **returning** before `PostProcessingController.render`. The inspected YAML has `sky.godRays.technique: cinematic`, so an H update placed only in `PostProcessingGraph` would not execute in normal walking view.

Implement H frame preparation **after** weather/sky/camera updates but **before** *any* first actual scene draw. Use the existing pre-render hook or a small owned sky runtime stage with a frame token. Some underwater/reflection/prewarm paths draw separately: verify their correct fallback/readiness rather than invoking cloud tracing twice.

### 2.3 Overcast mean versus distinct shadow contrast

[D9] `overcastSkyLook` intentionally reduces distinct cloud shadow strength toward zero in heavy overcast/storm. The weather already darkens directional sun and changes ambient sky.

H must separate (a) **local pattern contrast** of a moving cloud's shadow from (b) **global mean transmission** of a covered cloud deck. Do not scale the already-overcast-dimmed `DirectionalLight.intensity` by a second strong Beer-law mean attenuation, or storm nights/daylight become twice as dark. Under a closed stratus deck, local shadow map should trend toward its **mean** rather than toward high-contrast black blotches.

### 2.4 Existing direct shadow hook is a compatibility boundary

[D4] `applyCloudShadow` writes `material.receivedShadowNode = (shadow) => (previous ? previous(shadow) : shadow).mul(cloudSunlightNode(sky))` once and marks material userData, preserving clones. New H must change only the **source of transmitted direct light** without installing a second hook that multiplies a cloud factor again.

The highest-risk detail: the shared terrain material already has a tightly constrained texture-sampler budget [D21/D45]. Adding an ordinary shadow-map sampler can exceed the portable **16 sampled textures**. A preflight compilation/real WebGPU test with terrain, wet snow and authored foliage must establish whether a shared cloud shadow texture is possible or an existing binding can be reused. If not, H shadows cannot be forced onto all materials; a low-cost common analytic fallback is an explicit **unsupported tier** until binding is fixed.

### 2.5 Wind and canonical world coordinates

[D5] `AtmosphereMotion` advects the legacy 2D projected cloud coordinates and adds evolving sine warp. [D4] wraps canonical coordinates by `512×cloudWorldScale` to protect float32 noise hashes; [D38] tests 8.3-million-metre positive/negative cases.

H's 3D field must use a **CPU double-precision canonical origin** with GPU-local position and a deterministic wrap, e.g. `mod((canonicalXZ + advectedWindXZ), tilePeriodMeters)`. A camera move changes the sampled view into a stationary weather field, not the field's absolute world anchor. Negative modulo must be positive, and a wrap boundary must be periodic in the 3D shape/weather maps, including derivative and mip continuity.

Use the existing weather/wind heading authority [D15/D17/D28] to set cloud drift; **do not sample** the camera-local 384 m world-wind texture at every 10 km cloud march point and mistake canopy-level gusts for 5 km cloud motion. A broad wind multiplier/profile with different height offsets is sufficient.

---

## 3. Ponlai implementation mapping: what to port conceptually

### 3.1 Source inventory and decisions

| Source | Verified role | Useful technique | Avoid copying |
| --- | --- | --- | --- |
| [P1] `packages/render/sky/Clouds.ts` | 1,477-line owner of cloud resources, weather, lighting, view histories, shadow and panorama | One cloud density owner, lifecycle, warmup, invalidation | Monolithic source and global island assumptions |
| [P2] `CloudModel.ts` | 500-line layout, shell, cloud types, noise, SHADOW_PHASES, checker order | Separate constants/quality profiles, deterministic sampling | Fixed 4–9.2 km cloud base, 12 km map, 256 steps as Drusniel defaults |
| [P3] `CloudKernels.ts` | 845-line shared density/march, empty-space bounds, cloud-light integration, shadow casting | Same density function for view and light, Beer–Lambert and early exit | All rainbows, diffusion, key-lobes and panorama in initial slice |
| [P4] `CloudView.ts` | 386-line sparse view trace, depth, high/flash and temporal resolve | Explicit depth/motion reprojection and independent history | Full 192-trace paused settle in a normal game frame |
| [P5] `CloudShadow.ts` | Sampling of computed shadow map and beam-corrected air shadow | Local direct/diffuse distinction, edge fade, validated cubic filter | Ponlai clipmap/world origin semantics |
| [P6] `materials/CloudNoise.ts` | Tileable 64³ Perlin-Worley noise, mips and synoptic field | Packed texture instead of many expensive procedural shader octaves | Copying `baseShape64.bin` without third-party asset licence review |
| [P7] `Sky.ts` | Atmosphere, cloud, sky/environment and scene light coordination | One lighting state/published sky generation | Assumed PR E existence |
| [P8] `SkyDome.ts` | Composite cloud in-scatter/transmittance with background sky/moon/stars | Premultiplied radiance and T-based compositing | Replacing whole stylized sky/look logic |
| [P9] `SkyTrack.ts` | Cloud wind/sky/light direction and weather publisher | Single clock/weather source | Another weather scheduler |
| [P10] `SkyBake.ts` | Incremental sky/PMREM baking and publication | Amortized environment update | Full expensive sky bake each cloud movement frame |
| [P11] `Weather.ts` | Weather-specific cloud type, coverage, key and wind | One parameterized volumetric model blending types | Replacing Drusniel climate/storm transitions |
| [P12] `Atmosphere.ts` | Physical sky LUT and cloud-light colour source | Future E integration | New atmosphere inside H |
| [P13] `Streaks.ts` | Upper wispy cirrus and fibre shading | Later thin-cloud layer | Mandatory separate noise/texture passes on low tier |
| [P14] `weather/Lightning.ts` | Positional lightning affecting cloud march | Flash response outside temporal colour history | Another thunder scheduler |
| [P15] `weather/VolumetricHaze.ts` | Atmospheric shafts and cloud-shadow beams | Later coherent cloud/shaft relationship | Double volumetric fog and god rays |
| [P16] `post/PreExposure.ts` | Scene radiance scale and separate cloud history storage | HDR precision hints | New exposure system while PR C is a document |
| [P17] `Quality.ts` | Cloud march/quality budget | One quality-to-constants mapping | Ported quality presets overriding user settings |

Ponlai starts with **one weather-parametrized 3D volume**. Weather defines which cloud shape is likely: stratus is a soft slab; cumulus makes taller billowing heaps; intermediate cloud types blend continuously. Its 2D weather field, 64³ shape texture and 3D erosion contribute to **both view optical density and shadow casting**. This conceptual identity matters more than its exact source loops.

### 3.2 Distinguish multiple cloud products

[P1–P5] do not produce a single texture:

- **View**: radiance, transmittance and cloud depth toward a camera ray, often subpixel and temporally reconstructed.
- **Shadow**: direct-key optical transmission along rays from terrain/material positions toward sun/moon, at a bounded ground-space resolution.
- **Panorama**: far-sky lower resolution clouds for reflections, directions beyond active view and sky environment updates.
- **Light auxiliaries**: sun-occlusion mean, column radiance under stratus, haze shadows, transient lightning and optional rain.
- **Shared source**: identical density, wind/coverage, shell, spectral extinction and light source *within the same published generation*.

Grafting `Clouds.sampleView` onto Drusniel's sky dome without also updating [D4] would leave ground shadows based on the old 2D noise. Grafting only a ground texture without a same-source view gives worse visible coherence. **Enable H only after both source consumers are validated**.

### 3.3 Licence/provenance

Ponlai's [P1–P5] headers credit two independent MIT sources:

- `tidewater`, Daniel Greenheck / DRG Software Solutions LLC, using an implementation chain including Sky Pro clouds.
- `VolumetricCloudsCS1` by Anthony Ibrahim, for internal cloud lightning, rain curtains and rainbow logic.
- [P6] additionally identifies David Hoskins' hash33 under MIT and `baseShape64.bin` attributed to tidewater.

When directly adapting code, preserve all relevant SPDX/copyright notices and check each upstream file header, third-party project, repository license, and binary asset licence separately. The project already has [D31] a CC0 **2D** noise library; it is suitable for some erosion/detail inputs but **not proof** that a copied 3D noise binary is CC0. Recommended: generate an original periodic 3D noise asset and commit its deterministic generator, derivation and provenance rather than copying a blob of uncertain lineage.

---

## 4. One canonical 3D density model

### 4.1 Coordinate system and shell geometry

World space is Drusniel's canonical coordinates, with **Y vertical** and X/Z horizontal. The cloud pattern must be stationary in this space apart from wind advection. CPU maintains the large coordinate in JS Number/double precision; shaders see bounded camera-relative positions or wrapped weather periods. No raw 8-million-metre X/Z is used as a direct noisy float32 hash input.

Proposed mapping at simulation time `t`:

```text
cameraCanonical = floatingOrigin.toCanonical(cameraRender.x, cameraRender.z)
cloudOffsetXZ = accumulatedPrevailingWind(t, weather)     # metres, double precision
worldXZ(t) = canonicalXZ - cloudOffsetXZ                 # sign chosen explicitly
localWeatherXZ = positiveModulo(worldXZ(t), weatherPeriodMeters)
localShapeXYZ = positiveModulo(
    (canonicalX - cloudOffsetX, worldY - shellBase, canonicalZ - cloudOffsetZ),
    3DNoiseRepeatPeriod
)

heightFraction = (worldY - shellBaseMeters) / max(shellThicknessMeters, epsilon)
```

- The **same** mapping function/normalization handles view march and shadow emitter ray positions. Camera-relative raymarch points are transformed into canonical space for low-frequency weather/shape sampling.
- Use positive modulo for negatives, especially X/Z below zero and crossing a wrapped period. Mips and derivatives at opposite edges must match.
- A small floating-origin rebase changes *render-space* origin, not the canonical cloud centre, drift or shadow map's world anchor. It should not reset history if camera pose and transformed canonical ray remain identical; if history reprojection cannot account for transform change, invalidate safely **without a visible flash**.
- The renderer should not generate a cloud field **per 128 m terrain chunk**. The cloud model is world procedural with one shared repeat period and a few quality textures.
- Rebase and teleport tests use existing [D38] 8.3-million / negative-coordinates reference plus world transform translations much larger than 10⁶ m.
- Low cloud base may intersect a mountain in a storm only if intentionally configured; otherwise ensure shell/environment clipping is physically plausible. A separate altitude guard may be necessary for high-fantasy tall world peaks, but not a global clamp to sea level zero.

### 4.2 Weather parameters are data, not branches

The resolved existing sky look [D9/D10/D13/D14] and storm frame [D15] produce one **CloudWeatherFrame** independent of render tier:

```text
CloudWeatherFrame {
  shellBottomMeters, shellThicknessMeters,
  coverage: 0..1,
  type: 0..1,              # 0 stratus, 1 cumulus
  typeSpread: 0..1,
  densityGain: >=0,
  baseSoftness: >0,
  topErosionStrength: >=0,
  farFadeMeters: >=0,
  meanCloudCover: 0..1,
  directContrast: 0..1,
  driftDirectionXZ, driftMetersPerSecond,
  lookGeneration, weatherGeneration, windGeneration,
  sunDirection, sunSceneLinearColor,
  moonDirection, moonSceneLinearColor,
  nightness: 0..1,
  lightningFlash, optionalStrikeData
}
```

These are **proposed semantic fields**, not known current class names. Implementation should derive them in one pure adapter and validate numbers; it must not re-interpret every field separately in `CloudShadow.js` and `StylizedSkyView.js`. Prefer normalized values with explicit units, immutable state snapshot, and stable generation IDs.

Suggested authored weather archetypes to **tune and verify**, not hardcode as a claimed physical truth:

| Look | Cloud type and shell idea | Coverage shape | Direct contrast policy |
| --- | --- | --- | --- |
| Clear | No volume or sparse high wisps | Mostly empty | Local clouds rare, near-zero |
| Fair | Tall separated cumulus | Soft bottom, eroded tall caps | Local shadows visible but restrained |
| Cloudy | Mixed stratus/cumulus | Wide connected masses, some holes | Moderate pattern and transmitted mean |
| Overcast | Low cohesive stratus | Continuous base with subtle holes and bulk | Tiny local shadow contrast |
| Rain/storm | Low thick layered cloud, variable relief | Wide overcast patches, dark underside | Existing look darkens direct; no second global blackout |
| Fog | Sky/low cloud blended into near fog | Soft low layer | Little visible moving shadow pattern |

**Do not** change the existing actual weather preset names or replace the storm physics; this is an H rendering adapter.

### 4.3 Density ingredients and safe bounds [P2/P3/P6]

At position `p` inside the active shell:

```text
h = clamp((p.y - shellBottom) / shellThickness, 0, 1)
weather = sampleTileableWeatherMap((p.xz - windOffset) / weatherScale)
coverage = saturate(weather.coverage + resolvedLook.coverage - 1)
type = saturate(look.type + (weather.type - 0.5) * typeSpread)

cumulusTop = cumulusTopFromSurplus(coverage, baseShape3D(p, LOD))
stratusTop = smoothSlabTop(coverage)
top = mix(stratusTop, cumulusTop, type)

lowerBase = smoothstep(-baseEdge, baseEdge, h)
upperTop = smoothstep(-topEdge, topEdge, top - h)
candidate = lowerBase * upperTop * localWeatherMask

erosionLod = clamp(log2(pixelFootprintMeters / finestErosionMeters), 0, maxMip)
erosion = erosion3D(p, erosionLod) * erosionStrength(h,type)
rho = clamp(candidate * (1 - erosion), 0, 1)
sigmaT = rho * extinctionAtDensityOne
```

- Never sample 3D fine erosion in a cell where coarse weather and height bounds prove density zero.
- The **conservative candidate bound must not falsely exclude density** after shape dilation. A false-negative density bound makes square cloud holes in both view and shadows.
- Use higher shape mip levels for coarse/grazing steps; explicit derivative/LOD in compute, no implicit fragment gradients in divergent compute or dynamic loop.
- Avoid sampling a procedural multi-octave 3D noise function 4–8 times for every march step. One 64³ packed RGBA8 tileable texture with generated mips is a strong candidate.
- 64³ RGBA8 base cost: `64³×4 = 1,048,576 bytes (~1.00 MiB)`. Full 3D mip pyramid cost roughly `8/7×base ≈ 1.14 MiB`, **not measured GPU allocation**.
- A 256² RG8 weather field costs `131,072 bytes (~128 KiB)` before mips. Choose procedural/packed texture size based on visible coarse weather and repeat period.
- [D31] source-library noise textures can be repacked and lazily loaded for erosion, but a **2D slice stack** can produce severe card-like streaks and inconsistent seam normals. Test 3D continuity before using it.
- Generate/validate any 3D binary offline: header magic/version, channel layout, dimensions, mip offsets/lengths, exact SHA-256 and license metadata; decode/create texture once, never rebuild under main render, handle load failure.
- Enforce finite positive shell thickness/extinction and bounded sampling distance; bad YAML or missing asset causes clear fallback to old cloud layer, never a black sky.

### 4.4 3D shape quality and art knobs

Use **two scales**: large cloud-body field from weather/shape plus fine erosion near exposed edges, not a dozen independent FBM fields. Preserve current cloud palette controls `cloudCore`, `cloudEdge`, `cloudRim` as art-direction inputs to physically derived scattering (e.g. tint strength), not the main source of shape geometry.

Top/bottom sculpt:

- **Cumulus**: billowy top, upward piles, ragged side erosion, relatively flat lower base with moderate volume shading.
- **Stratus**: broader, smoother continuous body and thinner variable edges, underside level varying enough to read form, but not severe puff-stacks.
- **Mixed**: linear blend of parameters in one density, not two full volumes requiring double march.
- **Cirrus** (optional): separate thin high-altitude layer with directional fibre noise and low optical thickness; avoid pretending lower cumulus erosion produces realistic cirrus.
- **Horizon**: distance fade and aerosol fog consistently with [D3]/[D14]/[D42], with no hard sky-sector cutoff.
- **Cloud shadow match**: use identical weather, noise and deformation for visual and shadow; only **sampling quality/LOD** differs.

Implement density as one small composable node builder used by view/shadow kernels, or a verified per-kernel TSL function with uniform references passed explicitly. Ponlai [P3] warns that sharing a TSL layout helper with **implicitly captured uniforms** can re-use the first shader's bindings under r186; test actual Three r187 or installed version. Explicit function arguments or generated within each pass may be safer until measured.

---

## 5. View raymarch: correct light, transmittance and depth

### 5.1 Ray–cloud shell intersection

For normalized ray direction `rd` from camera `C`, find entry/exit distances against altitude slab `y∈[base,top]`. In a flat-Earth near horizon model:

```text
if abs(rd.y) > epsilon:
    t0 = (base - cameraY) / rd.y
    t1 = (top  - cameraY) / rd.y
    enter = max(0, min(t0, t1))
    exit = min(farLimit, max(t0, t1))
else:
    enter/exit from bounded horizontal distance or none

if exit <= enter: return cloudRadiance=0, T=1, depth=invalid
```

**Issue:** flat altitude slabs at tiny positive `rd.y` extend to an impossible infinitely horizontal shell. For long horizon rays, use either (a) a bounded horizon distance and controlled fade, or (b) a **parabolic Earth-curvature approximation** as [P3] `heightAlongRay` uses `y + |xz|²/(2*R)`. An optional world radius is a rendering approximation, **not** a world topology/terrain curvature requirement.

- If camera is inside cloud volume, begin at zero and avoid negative-distance invalid samples; do not draw a separate horizon dome behind the same dense volume.
- If camera is above cloud tops (flying), march downward through the shell and allow visible sunlit cap surfaces. A sky-only projected 2D texture cannot produce this.
- If camera points downward toward terrain, account for scene depth/terrain geometry so clouds **behind terrain** are not drawn in front. Since the sky dome draws first and depthWrite=false, simply compositing H into the sky behind opaque terrain is acceptable for cameras **below** clouds. For cameras **inside/above** clouds, an offscreen cloud layer may need depth-aware composition against scene depth; gate flight support on that implementation.
- Don't sample scene depth from `viewportDepthTexture` inside a material; that triggers documented whole-frame copies. Use the **existing scene-pass depth** if a separate post cloud composite becomes necessary, only as an explicit measured architecture decision.

### 5.2 Integrate light with Beer–Lambert extinction

For each step length `Δs`:

```text
sigmaT = max(0, cloudDensity(p) * extinctionPerMeter)
stepT = exp(-sigmaT * deltaS)
stepOpacity = 1 - stepT

sourceLight = scatteringSource(p, rd, sun, moon, sky, cloudSelfShadow)
accumRadiance += accumulatedT * stepOpacity * sourceLight
weightedDepth += accumulatedT * stepOpacity * distanceFromCamera
opacityWeight += accumulatedT * stepOpacity
accumulatedT *= stepT

if accumulatedT < 1/256: break
if density candidate proves empty: advance coarsely
result = { radiance: accumRadiance, transmittance: accumulatedT,
           depth: weightedDepth/max(opacityWeight, eps) }
```

**Important:** here `sourceLight` is the **radiance source after normalising the scattering/extinction relationship**. In a full transport equation `dL/ds=-σ_t L + σ_s ∫p(ω,ω')L_in dω'`; if using `(1−e^-τ)`, the source must include albedo `σ_s/σ_t` (and angular phase if directional). Do not multiply the same `σ_t` twice.

On a constant-density constant-source test volume, one step and 64 steps yield the same integrated radiance/transmittance within numerical tolerance. Step count changes quality, not exposure. Check density zero returns `L=0,T=1` and a fully opaque shell approaches zero T without NaN.

### 5.3 Lighting source and phase function [P3]

Use current [D3] sun and [D12] moon direction/illumination in the scene's existing linear colour convention. The first physically informed approximation:

```text
mu = dot(viewDirection, incomingKeyDirection)
phaseF = HG(mu, forwardG)     # strong near forward/sun
phaseB = HG(mu, backwardG)    # softer back scatter
phase  = mix(phaseB, phaseF, forwardShare)

tauKey(p) = ∫_p_to_shell along key sigmaT(x) dx
keyTrans = exp(-tauKey)

sourceLight =
    singleScatteringAlbedo * (
        keyIrradianceRGB * keyTrans * phase
        + skyFillRadianceRGB * ambientPhase
    )
```

A normalized Henyey–Greenstein reference:

```text
HG(mu,g) = (1 - g*g) / (4π * pow(1 + g*g - 2*g*mu, 1.5))
for g in (-1+eps, 1-eps)
```

- Choose forward/backward asymmetry values only after calibration. [P2] has `forward≈0.8` and back negative; that does not mean the same numbers reproduce Drusniel's stylized sky, where sun and halo intensity have different units.
- A sky/ambient fill makes cloud undersides visible but cannot be a magic constant radiance at midnight. Use actual sky-look light/source intensity, not current 2D `cloudCore` emission independent of time.
- Direct key must be shadowed by cloud **self-occlusion** along the sun direction; sample a small fixed number of optical-depth taps, e.g. 3–6, with coarse mips and early-out. A single second full 32-step ray per view sample is likely too expensive.
- Test light tapping under shallow/grazing sun; avoid a ray crossing too many noise tile wraps and saturating to black.
- Optional powder effect can lift thick near-sun edges but must be a **bounded look term**, not an extra free global energy.
- Optional 2nd/3rd scattering orders: if enabled later, use scaled energy/asymmetry and verify total does not explode at overcast noon or raise dark winter night by several EV.
- Keep lightning temporary; no history ghost. `SkyLookController` remains single authority over storm background lighting.

### 5.4 Jitter, empty-space skipping, quality and early exit

- Each ray samples low-frequency weather bounds first. Where upper cloud is impossible, advance to next conservative weather cell or shell height interval instead of fine density.
- In possible cloud segments sample `rho`, integrate step, optionally adaptive finer steps on first density hit, coarser as opacity becomes high/distant.
- Use a stable blue-noise/low-discrepancy jitter per screen pixel **and frame sample index**. No tiled 4×4 noise visibly moving over a static sky; match reconstruction.
- Quality budget is a *maximum* number of samples, not a mandatory loop count. A clear sky must skip with negligible GPU work, even when H enabled.
- Set explicit min/max physical step length and conservative cap for sun-facing light taps. E.g. first prototype medium `maxViewSteps 48–64`, `maxLightTaps 3–4` and half-resolution trace; not 256/6 everywhere by default.
- Test ray above cloud, below cloud, inside cloud, horizontal horizon, strong overcast, cloud holes, fast movement and time scrub.
- Record actual samples per pixel (mean/p95) and early-exit ratio in a special QA counter; max loop count does not tell actual GPU cost.

### 5.5 HDR precision and light/exposure ownership

The H radiance output is **scene-linear** and independent of display AgX/ACES, cinematic finish, snow-stopped exposure or auto-exposure. [D3] sky currently applies `exposureCompensation` to the final sky colour. When H composits into that material, the cloud term must follow **the same chosen exposure contract exactly once**; never pre-expose the cloud in compute and also apply sky exposure compensation twice.

[P16] uses special power-of-two storage scaling for faint cloud nights and scene pre-exposure for view histories. Drusniel PR C is **not implemented yet**. H should start with validated RGBA16F scene-relative cloud radiance and a fixed/dynamic **internal storage factor** only if low-light quantization tests reveal a real problem; if used, document `encodedRGB = radiance * storageScale` and `decodedRGB = encodedRGB / storageScale`, update old history on scale change or reset coherently. Exposure and storage scale are different concepts.

- Stable moonlit night tests must not show half-float flecks or blue banding after output exposure.
- Very bright sun edge and lightning must not produce inf/NaN or clip beyond RGBA16F range; local caps should be grounded in scene-linear scale.
- Cloud lightning flash is a separate transient radiance contribution per current frame, not averaged into history; the user's existing [D16] flash lasts ~0.25 s and must not linger.
- Screen-space tone mapping, temporal antialiasing, bloom and fog remain downstream exactly once.

---

## 6. Ground cloud shadow from the *same* density

### 6.1 Optical-depth shadow trace

At a material/ground receiver `p`, for light direction unit `L` *toward the sun*:

```text
tau(p) = ∫_{t_enter}^{t_exit} sigmaT(p + t*L) dt
T_direct(p) = exp(-tau(p))
```

[P3] makes a 2D map by tracing from a camera-local surface reference plane into the shell with **16 mid-point samples**, early exiting if optical depth exceeds 12. The initial G-style SH probing/shadow source should never cause 3D cloud texture fetches per terrain pixel. Instead compute a bounded, cached **world-space cloud shadow map** and sample it once per eligible material, if the sampler budget allows.

Proposed first shadow map prototype (subject to GPU/quality QA, not absolute values):

```text
quality low:      128 x 128, 4,096 m world span, 4 phases, <=8 integration steps
quality balanced: 192 x 192, 6,144 m world span, 4 phases, <=12 integration steps
quality high:     256 x 256, 8,192 m world span, 8 phases, <=16 integration steps

linear texel size ≈ 32 m in all examples
```

The *visible sky clouds* may have multi-kilometre scale, but 32 m map cells are not a guarantee of detailed small shadow features. Validate source noise/sun penumbra against captured moving ground patterns and source/cloud phase. The upper tier may need a small near camera clipmap or physically wider penumbra, not blindly 512² shadow map.

### 6.2 Receiver elevation and sun angle

A map rendered at reference plane `Y_ref` must be sampled at a receiver higher than that plane by projecting along the same sunbeam:

```text
deltaY = p.y - referencePlaneY
L_vertical = max(lightDir.y, minShadowSlope)
projectedXZ = p.xz - (lightDir.xz / L_vertical) * deltaY
uv = (projectedXZ - shadowMapCenterCanonicalXZ) / mapWorldSpan + 0.5
```

This is the **parallax correction** for varying terrain elevations. It is particularly important on cliffs and mountain sides; sampling a zero-altitude map by raw world XZ alone can make the shadow displaced by hundreds of metres under a low sun.

- At grazing light, clamp/fade the detailed map near horizon. A slope floor is **numerical safety**, not physics: report when a ray is outside validated range.
- If the receiver lies in/above the actual cloud shell, a reference-ground shadow map may be wrong. Support those high-altitude receivers via a separate tested evaluation or use legacy/neutral fallback rather than claiming physically consistent shadows.
- A world-space shadow has **finite coverage**. Fade map sampling toward neutral at edges; never clamp all far terrain to the last dark texel. Under overcast, the fallback should respect existing mean weather light policy.
- Use one source cloud density for the view and shadow. Do not use a second weather/noise threshold solely for ground shadow after H enabled.

### 6.3 Shadow map scheduling and camera movement

Ponlai [P2] uses an interleaved 8-phase row-refresh pattern in its 256² map to avoid full refresh each frame; its map is about 47 m/texel. Drusniel needs additional **camera focus/movement** coherence because world travel is unbounded:

- Anchor map centre to a snapped **canonical texel cell**, not raw camera per-frame position.
- A camera shift by exact map texels must **reproject/scroll** existing coherent map values with their physical world positions, trace **only newly uncovered strips**, or conservatively perform a full bounded refresh before showing newly mapped data.
- **Do not** merely change map-to-UV transform while retaining old texels; that makes shadows swim relative to the visible cloud and terrain.
- On teleport, ensure old map is invalid by world coverage/source generation before sampling. Fallback to validated legacy/neutral direct light until a complete new source generation has been traced.
- When cloud source drift or sun angle changes, interleaved rows may represent slightly different times. Track age/version or keep max row age short enough that shadow edges do not shear into horizontal bands.
- Paused screenshot QA should explicitly force **all phases complete** within a bounded separate settling routine; don't report unrefreshed old cloud map as deterministic.
- Strong camera movement, rapid timelapse or storm switch may require full one-shot map refresh at a specific **measured budget**, not an unbounded 256²×16×N ray burst.

### 6.4 Avoid double lighting attenuation under an authored sky

Under the **existing** Drusniel sky [D3/D9], overcast and storm looks already reduce `directionalIntensity`. If a cloud map outputs full Beer-law transmission with mean `T_mean` and H multiplies it directly into the already reduced key, the mean cloud attenuation is counted **twice**.

Define two explicit, tested lighting ownership modes:

**Legacy authored-key mode (required first):**

```text
T_raw = exp(-tau_from_volume)
T_mean = measured spatial mean of T_raw over representative map region

extraPattern = clamp(T_raw / max(T_mean, epsilon), 0, 1)
effectiveDirectMultiplier = mix(1, extraPattern, cloudShadowContrast)
```

This only adds local relative **dimming** to the authorial key; brighter-than-mean holes saturate at 1. It's an intentionally art-directed conservative approximation, not a fully radiometrically correct transmittance replacement. It respects [D9] weakening local stripes under even overcast. If better energy conservation is needed, calibrate the authored light response and stop treating `T_mean` as already accounted before changing the formula.

**Physical-key mode (optional, only after PR E actually implemented):**

```text
effectiveDirectMultiplier = T_raw
# CRITICAL: remove any separate mean-cloud attenuation already applied to
# the same directional irradiance from the atmosphere/weather light owner.
```

Do **not** mix modes implicitly. Source state and QA should report which one is effective. Avoid making bright sky gaps exceed original clear-sky key intensity when normalizing around mean.

### 6.5 Material integration, ocean and sun glint

[D4] currently installs a **single** cloud direct-light modifier via `receivedShadowNode`. When H shadow target exists and is valid, make its sampler the new shared factor under the **same hook**; avoid chaining a second cloud shadow call. Existing cloud-disabled settings must compile no new cloud references.

- Standard snow [D44] draws directional glints from already-shadowed light. H should make its snow highlights vanish under cloud shadow exactly as before, not alter their indirect snow fill.
- Foliage transmission/wet highlights [D41] depend on already-shadowed sun in existing direct model. H cannot regress or double shade them.
- An ocean surface uses both diffuse illumination and **direct sun glint**. Ponlai [P5] distinguishes direct-beam attenuation and diffuse-through-cloud energy: use a **verified** water-sun glint sampler if Drusniel's actual sea material supports it; don't blindly apply a 2D map to every water/foam fragment.
- [D19] god rays use the sky cloud mask and may already account for cloud transmission. If H attenuates direct light and additionally applies a second cloud shaft mask, ensure it is physically modelling **beam visibility along air** rather than multiplying the same static mask twice.
- If sampler budget fails for shared terrain material (16 limit), H cannot silently force an extra sampler. Options: reuse an existing packed/shared field with validated slot semantics; integrate into an existing single shadow sampler; limit approved receivers; or retain legacy procedural shadow as a **documented fallback** while the new coherent texture source is not fully supported. Do not claim source coherence in that fallback.

### 6.6 Data format and debug

First texture format candidate `RG16F` or `RGBA16F`:

- R = direct beam transmittance `T_direct` (or normalized legacy-key multiplier by clearly documented mode).
- G = optional scattering-aware broad direct/cloud-deck transmittance used by shafts/air.
- B = optional **unscattered** direct beam for mirror-like water glint when physically justified.
- A = validity/confidence or reserved, not height unless needed.

Use **one texture** if possible. Filtering: direct bilinear is cheap but may draw angular square shadows when texels are large; Ponlai [P5] uses a four-bilinear-tap cubic B-spline approximation. Profile sampler cost against image QA: four additional samples on grass/terrain may be unacceptable. A small one-time blurred target is often cheaper than cubic lookup per every grass pixel. Under an opaque deck, shadows fade to the **mean**, not to full sun or black stripes.

Debug views required: cloud density slice, weather coverage/type, camera ray step count, view radiance, view T, view cloud depth, shadow raw T, shadow mean, effective authored multiplier, map age, source generation, map world UV, shadow edge and currently effective fallback reason.

---

## 7. Temporal reconstruction and history validation

### 7.1 First safe path before aggressive 4×4 interleave

Start with a **simple half-resolution cloud raymarch** and depth-aware bilateral upsample (the sky is mostly far depth; can use edge-aware filters on T/depth). This requires less history complexity. Compare quality and GPU time. If it meets the visual budget, **do not implement Ponlai's complex 4×4 interleave solely because upstream has it**.

If half-resolution is too costly, enable the 4×4 interleaved approach from [P4] as a separate measured tier:

- 16 distinct slots, one per 4×4 pixel block per frame.
- Ordered sample schedule `[0,10,2,8,5,15,7,13,1,11,3,9,4,14,6,12]` from [P2] (verify actual mapping to X/Y).
- One quarter-size sparse trace, a full/half output history with two ping-pong colour and depth textures.
- Running average/velocity-based alpha, bounded fresh contribution, neighbourhood min/max clamp, and explicit cloud-depth reprojection.
- A **camera cut** invalidates old reprojection and builds useful output immediately from current low-resolution/panorama data; do not show stale clouds from the previous location while 16 slots accumulate.

### 7.2 Camera plus wind motion vector

The same density point `P_now` that appears on current camera ray at cloud depth `d` was approximately at `P_prev = P_now - windVelocity*Δt` last frame. Previous camera transforms are canonical and must account for render-origin changes:

```text
P_now = currentCameraCanonical + currentRayCanonical * cloudCharacteristicDepth
P_prev = P_now - cloudAdvectionDelta
prevClip = previousViewProjectionCanonical * P_prev
prevUv = clipToUv(prevClip)
motionPixels = (prevUv - currentUv) * viewResolution
```

Use the **same cloud advection sign** as density sampling; a wrong sign makes clouds smear twice as fast in a wind. For transparent/semitransparent cloud, characteristic depth is an **opacity-weighted estimate**, not a surface depth; bias to current samples when depth confidence/opacity is low. For no cloud along ray, use far sky background/panorama, not a fake zero-depth reprojection.

History metadata: lookGeneration, shellVersion, weatherMaterialVersion, light-source ID, viewSize, projection/FOV, camera position/rotation, cloud canonical offset, sky radiance storage scale and renderer generation. A passing history validation requires all applicable values to match or be safely reconcilable.

### 7.3 History rejection table

| Event | Action |
| --- | --- |
| Small camera translation | Reproject with cloud depth and canonical camera delta |
| Small camera rotation | Project into prior unjittered camera basis; raise fresh weight |
| High angular velocity | More fresh slots/shorter history; measure cost |
| Teleport or large camera jump | Invalidate history, use immediate low-res/panorama fallback |
| FOV change | Reject incompatible history and update camera projection |
| World origin rebase, same canonical pose | Transform/reproject correctly; reject only if mathematically invalid |
| Weather front/type/shell jump | Invalidate or strongly shorten history based on measured source change |
| Sun/moon direct colour jump | Re-evaluate current cloud lighting promptly; avoid old gold cloud ghost after night switch |
| Lightning flash | **Separate transient render term**, never accumulate in long-term cloud colour history |
| Device resize/render scale change | Resize/rebind targets safely; no shader compile storm |
| Renderer/context loss | Drop GPU history, restore legacy sky and recreate lazily |
| Paused clock+camera | Deterministic settled output with an explicit bounded QA settle mode |
| DRS/TAA settings change | H history resolution policy independent of scene TAA, invalidate only truly incompatible data |

### 7.4 HDR transmittance representation

Use **radiance premultiplied by cloud-scattered opacity** plus actual transmittance `T∈[0,1]`, not conventional straight alpha = opacity. In [P4/P8] the compositing operator is:

```text
CloudLayerOverBackground(cloudRGB, transmittance, backgroundRGB)
    = cloudRGB + transmittance * backgroundRGB

# For nested layers F (front) over B (back):
C_total = C_front + T_front*C_back
T_total = T_front*T_back
```

No factor of `1−T` should be applied to cloudRGB a **second** time if it was already integrated using step opacity. Under clear sky, C=0,T=1 is exactly neutral. Under thick storm cloud, T≈0 and the cloud's own scattering dominates, with weather-dependent sky/dusk input.

### 7.5 Independent H history vs scene post TAA

[D22–D26] own scene HDR, velocities and TAA/TAAU. H may have its own temporal reconstruction, but sky pixels also pass through the active render path's post TAA/FXAA. Avoid *two* independent jitter patterns at once: use unjittered sky projection for H's cloud view and a coherent current jitter or explicit motion vector class when TAA consumes scene sky. Record which branch is active. Do not edit scene MRT layout purely to make cloud history work; only do so if a measured safe integration is impossible.

### 7.6 Depth and parallax to real scene

Near/far sky raymarch is correct while camera remains below clouds. In free-flight above/within the volume, clouds may geometrically overlap mountains, tall buildings, or camera-near fog. If H is drawn only in the background sky dome, it will incorrectly appear **behind** foreground terrain even when the cloud should pass in front.

**Required free-flight gate:** use existing scene depth from [D25] scene pass or an explicitly owned compositing pass and cloud characteristic depth to determine whether clouds lie in front, with correct mixed T. This is a new render topology and must be profiled; **do not** sample the viewport depth texture from arbitrary sky/terrain materials. Until this is implemented and validated, either limit H volumetric feature to sky-below-cloud viewpoints and use a safe legacy/extrapolated sky in high flight, or accurately report that cloud intersection with terrain is unsupported. Do not claim 3D camera flight support merely because noise is 3D.

---

## 8. Sky compositing and image-based lighting

### 8.1 Preserve existing sky, simply replace cloud contribution

[D3] already builds the clear gradient, sun disc/glow, moon/star fields, sun haze and fog. The H material integration should produce a cloud layer and composite it with the **same clear background**:

```text
C_clear = Drusniel authored sky gradient + sun/atmosphere
        + moon/stars as appropriate

C_withClouds = C_cloudScattered + T_cloud * C_clear
C_final = applyCurrentSkyFogAndHaze(C_withClouds, currentLook)
C_final = applyExistingSkyExposureFollowExactlyOnce(C_final)
```

Do not execute the old `cloudCoverageNode` and `litCloudColorNode` **on the H branch** or blend a second old cloud mask. Moon and stars should be **behind** cloud volume and occluded by cloud T, rather than being injected after cloud as unmasked emission. Lightning source should be inside cloud scene-linear illumination and still keep a non-cloud sky flash if existing weather logic does so.

### 8.2 Current sky exposure and cinematic finish

The inspected sky material multiplies its colour by `exposureCompensation` so the snowy terrain can stop scene exposure down while the sky follows less. H cloud shader must use exactly that same factor **once**, or a new deliberate shared sky-radiance contract if PR E exists. No additional AgX/ACES, local tone mapping, bloom or atmospheric scene exposure inside H. Scene HDR/post remains responsible for display transform. H should never force the global exposure to adapt to individual lightning flashes unless PR C metering's authorial flash policy deliberately allows it.

### 8.3 Fog/horizon and low stratus

The sky dome applies [D3] fog toward horizon and [D14] regional/storm sky changes. H must choose **one** fog application for cloud and clear sky, with altitude/depth awareness if available. For a low stratus base/haze:

- Fog may occlude distant clouds based on cloud characteristic distance. Do not apply both sky-horizon fog (already mixed) and a separate cloud-fog function at full strength.
- Fade small fair cumulus into horizon air before their repeated 3D noise creates a packed horizontal wall.
- Continuous low overcast may extend to horizon, but must carry its own base brightness and broad sky gradient rather than a hard flat horizon line.
- Test free-flight looking over cloud tops, horizon looking through tree silhouettes, valley mist mixing, alpine snow whiteout and wetland bog air.
- Heat shimmer [D42] distorts sky rays near horizon. The H view should sample cloud texture at the **same** distorted direction as clear background, not independently warp a second time or use expensive 3D raymarch for each shimmer pixel.

### 8.4 Reflection/environment consistency is optional but important

[D43] `sceneEnvironment` asynchronously loads a fixed CC0 HDR for material diffuse/specular IBL. Clouds changing in view but not in `scene.environment` may be perceptually inconsistent on shiny water/metal.

Do not update PMREM every frame to solve it. Candidate integration:

1. Preserve existing authored environment HDR for low/balanced quality until an alternative is validated.
2. Create a low-resolution **periodically refreshed cloud panorama** [P7/P8/P10], from the exact H density source and current sun/sky, used as an optional input to reflections and sky mean. Require resource scheduling, atlas validity and published generation.
3. If PR E has implemented a real atmospheric cubemap/LUT owner, use its **existing** publication hooks; H must not create a second environment baking pipeline.
4. During update, preserve old complete panorama until new complete generation is ready; stage new/old blend to avoid reflection popping, respecting GPU budget.
5. If sky reflections use a distinct fixed HDR deliberately for gameplay readability, document that as an intentional approximation; don't mislabel H as physically coherent IBL.
6. Preserve the hero armour's specular environment [D43] even when H panorama missing; don't bind a black/empty cubemap.

### 8.5 Sky diffuse illumination and SH probes if E/F/G implemented

If actual earlier code exists:

- Sky radiance SH and auto-exposure should consume **one** authoritative physical/environment source. H's panorama/mean transmittance may cause a **sky generation change**, not a geometry worker retrace.
- Ground key G bounce receives the new cloud **emitter-side** transmittance exactly once. No legacy cloud multiplication of the same sun bounce.
- Broad overcast alters sky radiance and mean irradiance, while distinct H cloud shadow attenuates direct sun locally. Avoid second mean darkness in sky SH or directional light.
- SH probes/relight should update bounded resident pages when broad sky state changes, not for every small moving cloud texel.
- No guessed names: PR E/F/G in inspected main are specs. H's initial code should expose a tiny documented data adapter but not import absent classes or spawn parallel probe managers.

---

## 9. Weather, thunder, wind and night cases

### 9.1 One clock, no new weather simulation

Current [D12] `dayNightCycle` is pure astronomy/time, [D10] `SkyLookController` smooths presets/biomes and storm, [D15] `StormState` controls cloud/wind/rain progression, and [D17] `weather_controller` advances lightning. [D18] writes the final look/flash each frame. H reads **these states** without adding another time source.

Under a paused game clock, cloud drift and lightning should follow whatever state/clock source is intentionally paused. If the current legacy cloud time is wall-clock timestamp despite paused day/night cycle, preserve that behaviour by default but make deterministic QA able to freeze it explicitly; don't silently reinterpret pause as zero wind for all weather.

### 9.2 Lightning inside clouds [P14]

Existing [D16] `LightningScheduler` emits frozen strike events with time, bearing, distance, kind (`sheet` versus `bolt`), and a flash envelope (about 0.25 s). [D3/D8] already add a lightning flash to the cloud deck/hemisphere.

Use existing strikes to derive a **position in canonical space** based on current camera/strike bearing and distance at event time. If a strike event does not expose altitude, use current resolved shell base + a bounded fraction of shell height for **visual-only** source; test storm/overcast source and avoid creating a bolt under water or beneath the terrain. Store the source for its short lifetime only, don't create persistent per-strike GPU lights or any extra shadow-map updates.

**No temporal ghost:** [P4] isolates flash radiance from normal cloud history; H must do the same. The existing `setLightningFlash` hemisphere intensity change remains, but if H also adds in-cloud light, cap the combined flash envelope to current look's intended energy. Don't create a second lightning scheduler.

### 9.3 Wind and drift

[D28] `WorldWindPass` generates a **128×128**, 384 m camera-local surface wind texture every frame; it represents near-ground gusts used for foliage/rain. H's 5–10 km cloud field should consume the same **prevailing direction and broad wind intensity** from weather rather than repeatedly sampling a tiny 384 m texture. Add a small, deterministic altitude-based veer/shear profile if it visibly improves clouds.

Use accumulated canonical displacement, not `timeSeconds*speed` in an unbounded float32 shader, to avoid drift overflow on a long simulation. Optional cloud evolution can have a cyclic phase with matching spatial/temporal period; avoid sine phase resets that change silhouettes at a wrapped period.

### 9.4 Storm intensity, overcast and darkening

- `clear/fair`: more open sky and high-contrast sunlit cumulus; local ground shadows may appear.
- `cloudy`: broader cloud families and more sky fill, less localized strong ground shadow.
- `overcast`: connected low stratus with diffuse bright/dark bottom relief but almost **no moving high-contrast pattern** in direct sunlight; weather already dims the key.
- `rain/storm`: dark grey/blue base, internal lightning, lower cloud shell and more front coverage, but not uniformly black at noon or washed to white by an arbitrary ambient term.
- `fog`: low haze merging into cloud base rather than unrelated second thick white overlay.
- `night`: no daylight sun scattering from a fictitious sun; moonlight and star occlusion follow actual night look and moon phase. Cloud data must be finite even when light intensity zero.
- `snow/taiga`: snow stopped-down terrain exposure must not make cloud underside neon or zenith oversaturated. Test sun-facing snow, cloud shadow and clear-sky winter baseline together.

### 9.5 No invented rainbows or shower controls

Ponlai [P3/P14] contains rain curtains and rainbow shader logic. Drusniel already has rain/snow/weather particles and thunder. These are **deferred options**: add only if their geometry, phase/scattering and clock can be driven by existing weather, and if the beauty cost is worthwhile. Do not generate extra screenspace rainfall or a constant perfect rainbow in all showers under H's core feature flag.

---

## 10. Performance, resource and pipeline budgets

### 10.1 Provisional memory model, not measured VRAM

The minimum system needs a 3D density source, a small weather/type map, a bounded ground cloud-shadow map, and view-trace output. Temporal reconstruction adds full/half-resolution ping-pong histories. The numbers below are arithmetic on **logical raw texel storage**, not driver allocations, row padding, backend texture residency or peak GPU memory.

| Resource | Candidate format/dimensions | Raw calculation | Budget / rationale |
| --- | --- | --- | --- |
| Shape noise | 64×64×64 RGBA8 | 64³×4 = **1,048,576 bytes** | ~1.00 MiB without mips, ~1.14 MiB complete 3D pyramid |
| Weather coverage/type | 256×256 RG8 | 256²×2 = **131,072 bytes** | ~128 KiB, low-frequency source can be smaller/bigger only after QA |
| Cloud ground shadow | 192×192 RGBA16F | 192²×8 = **294,912 bytes** | ~288 KiB, direct/scattered channels; one shared map |
| Cloud ground shadow (high) | 256×256 RGBA16F | 256²×8 = **524,288 bytes** | ~512 KiB, must benchmark all material receiver samplers |
| Half-resolution view at 1280×720 | 640×360 RGBA16F | 640×360×8 = **1,843,200 bytes** | ~1.76 MiB per cloud view target |
| Two colour histories | 2×640×360 RGBA16F | **3,686,400 bytes** | ~3.52 MiB, optional temporal |
| Two RGBA16F depth/metadata histories | 2×640×360 RGBA16F | **3,686,400 bytes** | ~3.52 MiB, may be packed more tightly |
| Quarter-trace | 320×180 RGBA16F | **460,800 bytes** | ~450 KiB if sparse trace genuinely helps |
| Lightning transient | Quarter-sized texture or one shader term | Quality-dependent | Do not allocate persistent full-resolution flashlight per strike |
| Panorama | 512×128 RGBA16F | **524,288 bytes** | ~512 KiB optional, excluding PMREM and staging |
| Accumulation auxiliary | box min/max, motion, depth and texture ping-pong | Multiple surfaces | Must be counted from actual allocated topology, not hidden |

**Architectural priority:** start with **no full temporal ping-pong** unless half-resolution single-frame raymarch is insufficient. After cost has been measured, use [P4] 4×4 temporal only when it improves GPU efficiency without introducing ghosting/resize compile stalls.

### 10.2 Shader samplers are the first hardware gate

[D45] terrain slot bindings already stress the **portable 16 texture-sampler** limit. Before adding a cloud-shadow texture to every material, run an actual WebGPU shader binding audit for terrain, snow, foliage, rock, town kit, grass and water. The available sampler count depends on current material graph, backend and which textures are samplerless. A shared cloud map **does not automatically** mean one free fragment sampler.

If terrain cannot compile with an additional cloud sampler, choose a tested alternative:

1. Replace an existing legacy cloud shadow sampler/analytic branch and free equivalent resources (preferred if bound).
2. Fold scalar cloud attenuation into an existing generated **shared input field**, but only if its canonical space, lifetime, format and resolution actually match.
3. Restrict the opt-in volume-shadow feature to supported material classes and retain legacy procedural [D4] for unsupported receivers.
4. If all fail, keep H volume view **off** or label shadow coherence as incomplete; do not ship a visual cloud whose shadow looks completely unrelated without an explicit scope concession and QA evidence.

Do not add `viewportDepthTexture` or `viewportOpaqueMipTexture` references to a cloud material: [D32] documents a whole-scene texture/depth copy and mip build triggered by even one such reference.

### 10.3 Proposed quality tiers as measured starting candidates

| Tier | View size | Max view steps | Max sun/light taps | Shadow | Temporal | Expected tradeoff |
| --- | --- | --- | --- | --- | --- | --- |
| Low | half display, or quarter if needed | 24–32 | 2 | 128², phased | off | Largest/simple clouds, fewer fine edges |
| Balanced | half display | 48 | 3 | 192², phased | optional | Main target; detail only around cloud edges |
| High | 0.66× display | 64 | 4 | 256², phased | optional | More stable thin silhouettes, modest rise in cost |
| Ultra | 0.75× display / sparse 4×4 | 80–96 | 5–6 | 256² or measured higher | required if sparse | User-selectable expensive tier only after evidence |

These are **not proven defaults**. A maximum view step cap does not mean every ray pays it. Every tier should skip clear sky, coarse march through empty regions, and stop when T falls below an agreed threshold. If low/high differences are visually indistinguishable at actual display size, collapse tiers rather than keep a redundant shader variant.

### 10.4 Hardware target and regression policy

[D32] contains historical native NVIDIA WebGPU performance with world p95 and strict normal-stage CPU/GPU budgets, and documents deferred scenery staging, GPU timestamp caveats and expensive god-ray cases. PR H may be a deliberately heavier new feature, but it **must have an explicit measured performance envelope** rather than being hidden inside the old sky stage.

Candidate initial gate at 1280×720 native NVIDIA WebGPU desktop, same scene and quality/seed:

- **Off:** zero H dispatches/targets/asset loads and **pixel-identical** old sky/ground cloud shadows.
- **Balanced on:** target incremental ≤1.0 ms GPU mean and near p95 total cloud stage for a scene where clouds are substantially visible, excluding existing rendering and without assuming compute timings appear in render stage counters. If >1.0 ms, require visual benefit and explicit opt-in rather than default-on.
- **Clear sky:** incremental GPU cost as close to zero as feasible; branch/skip and shadow readiness still overhead, so measure, do not assert absolute zero when enabled.
- **Worker:** no world terrain/scenery worker task or chunk commit backlog may be postponed by cloud data generation.
- **Movement and hitches:** do not add significant p95/p99 frame spikes or startup shader compile stalls, including first storm, first reflection camera, resize and renderer restart.
- **Memory:** bounded GPU allocations independent of elapsed travel/world size; retained old textures freed after resize/quality change/device recovery; no unbounded history arrays.
- **Dynamic sky:** a cloud shadow atlas update should not force a new terrain shader program, redraw the entire sun cascade twice, or rebuild a PMREM per frame.
- **Cold start:** lazy prewarm only when quality enabled and renderer ready, but first visible transition must not freeze the screen while building multiple 256-step compute kernels.
- **Low-power devices:** automatic fallback or low tier only after measured safe backend limits. Do not assume all WebGPU adapters share desktop compute limits or fast half-float filters.

### 10.5 Instrumentation names and evidence contract

Suggested GPU passes `cloudNoiseLoad`, `cloudViewTrace`, `cloudViewUpsample`, `cloudViewHistory`, `cloudShadowMap`, `cloudPanorama`, `cloudTotal`. Record presence/absence, not just numeric zero.

Suggested diagnostics:

```text
cloudEnabled, cloudEffectiveTier, cloudFallbackReason, cloudBackend
cloudSourceGeneration, weatherGeneration, lookGeneration, cameraFrameToken
cloudStorageBytes, cloudTransientBytes, cloudHistoryBytes, peakCloudGpuBytes
viewTraceResolution, viewStepMeanP95, viewEmptySkipShare, viewEarlyExitShare
shadowMapResolution, shadowSpanMetres, shadowTexelMetres
shadowGeneration, shadowValidRows, shadowMaxRowAgeFrames, shadowSkippedFrames
cloudMrtCompatibility, cloudSamplersPerReceiver, cloudShaderProgramCount
historyValidShare, motionRejectedShare, cameraCutResets
sourceAssetHash, assetLicenseStatus, currentSkyExposureScale
gpuCloudTraceMs, gpuCloudShadowMs, gpuCloudResolveMs, gpuTotalCloudMs
cpuCloudUpdateMs, frameP95P99Ms, gpuBackend, gpuTimingAvailable
```

When GPU compute dispatch timings are unavailable, report `null/unavailable` instead of “0.000 ms”. Use frame pacing with timestamps off and independent GPU capture when available. Do not conflate a single beauty-pass benchmark with overall device cost.

---

## 11. YAML, validation and safe feature modes

### 11.1 One configuration owner

Extend `editor.config.yaml → stylizedSurface.sky` and validate in [D30]. The existing `godRays.volumetric` means *volumetric god rays*; keep this name unchanged, and add a distinct nested `volumetricClouds`.

Proposed minimal user-visible schema (all proposed, not implemented):

```yaml
stylizedSurface:
  sky:
    volumetricClouds:
      enabled: false
      quality: balanced
      shadowLighting: authored
      temporal: auto
      cirrus: false
      internalLightning: false
      debugMode: off
```

Internal tier profiles and numeric clamps go in a **single constants/config normalization module**. Do not hardcode shell heights, weather coverage, extinction, view steps, shadow update budget and all the possible 50 look knobs into `StylizedSkyView`. Expose advanced authoring **only** when there are real validated use cases. Start with all optional effects off.

### 11.2 Validation

Validate exact enums and booleans, finite ranges, positive shell and steps, bounded intensity, conservative upper step limits, power-of-two noise period where algorithm requires it, texture dimensions supported by queried GPU limits, consistent 3D mip lengths, and no incompatible combinations (e.g. sparse temporal without history/depth). Fail invalid YAML at config loading with a clear field path. Renderer support failures are **runtime feature fallbacks**, not silent YAML mutation.

Avoid 0/NaN jitter or rays at horizon yielding infinity. Do not accept a request for an arbitrary 20,000 m cloud-layer thickness or a 4096² shadow map from a user-editable YAML flag without hardware/quality gates.

### 11.3 Feature/runtime states

```text
disabled
 -> no H shader/resources; current 2D sky + procedural cloud shadow + mask

waiting-for-renderer
 -> remain legacy, no invalid TextureNode
noise-loading
 -> legacy, asynchronously validate dimensions/mip/provenance
density-ready
 -> H view not yet visible until shadow mode coherently chosen
view-ready / shadow-unavailable
 -> legacy or explicitly diagnosed view-only development mode
view+shadow-ready
 -> atomically enable H sky and same-source shadow for supported receivers
history-warming
 -> valid fresh low-resolution current samples; old history not shown
feature-active
 -> one scene sky/cloud source, valid shadow generation and optional temporal
device-lost/unsupported
 -> switch back to validated legacy; free/rebuild GPU resources lazily
disposed
 -> all H resources removed, no stale callback/scene references
```

**Required semantics:** `enabled:false` is exact legacy rendering. A missing optional high cirrus/PMREM stage should **not** cause H core to fail. Missing *mandatory same-source shadow* means H remains a **development-only** visual experiment rather than claiming full coherent cloud integration.

### 11.4 Authored lighting versus physical atmosphere mode

Until E actually exists, `shadowLighting: authored` means local contrast modulates Drusniel's already weather-dimmed directional light, as `6.4` describes; it is not an absolute optical transfer.

If PR E is implemented and measured, an explicit new mode may use full `exp(-τ)` and remove duplicated weather mean attenuation in the **single sky light authority**. Never enable this mode based on the mere existence of the PR E Markdown plan.

---

## 12. Small-module source plan, explicit ownership

### 12.1 Suggested files (responsibilities, not a demand for 15 scaffolds)

| Proposed file | Purpose | Lifetime/owner |
| --- | --- | --- |
| `src/editor/stylized/clouds/CloudConfig.js` | Resolve YAML/default quality profiles, finite validation, capability policy | Pure module |
| `src/editor/stylized/clouds/CloudConstants.js` | Shell, quality, storage/format and shader constants separate from control flow | Pure module |
| `src/editor/stylized/clouds/CloudWeather.js` | Map existing [D9–D17] final sky/storm/wind into one immutable weather frame | Pure CPU |
| `src/editor/stylized/clouds/CloudCoordinates.js` | Canonical-to-GPU local periodic coordinates, wind drift and projection | Pure CPU + TSL helper |
| `src/editor/stylized/clouds/CloudNoise.js` | One generated/licensed periodic 3D noise + low-res weather map, async load/dispose | GPU resource |
| `src/editor/stylized/clouds/CloudDensityNodes.js` | Common 3D density, conservative bounds and explicit TSL uniform args | TSL |
| `src/editor/stylized/clouds/CloudLightingNodes.js` | Beer–Lambert, key optical depth, scattering phase, ambient fill | TSL |
| `src/editor/stylized/clouds/CloudViewPass.js` | View raymarch and low-res image/depth/T buffers | GPU |
| `src/editor/stylized/clouds/CloudShadowMap.js` | World-space shadow-map generation, phased update, altitude projection | GPU |
| `src/editor/stylized/clouds/CloudTemporal.js` | Optional history/reprojection/rejection/resize/flash isolation | GPU |
| `src/editor/stylized/clouds/CloudSkyAdapter.js` | Compose H cloud into existing [D3] sky and [D19] mask routes | Render node adapter |
| `src/editor/stylized/clouds/VolumetricCloudRuntime.js` | Own lifecycle, prewarm, readiness, frame updates and disposal | Small runtime coordinator |
| `src/editor/stylized/clouds/CloudDiagnostics.js` | Bounded counters, source generations, debug modes and QA capture | Diagnostics |
| `docs/rendering/volumetric-clouds.md` | Actual shipped behavior, algorithms, license, quality/perf data | Documentation |

**KISS requirement:** do not create all these files at once if small responsibilities belong together. At minimum split the pure model/coordinates, noise, view/shadow GPU outputs, and integration/lifecycle. Keep each file reviewably small; no 1500-line port of Ponlai's `Clouds.ts`.

### 12.2 Exact existing source edits

| Current file | Intended minimal change | Preserve |
| --- | --- | --- |
| [D3] `StylizedSkyView.js` | Own/inject H adapter and select cloud node **only when ready**; publish same-frame sky/light | Sun/moon/stars, clear horizon, fog/exposure compensation, disposal |
| [D4] `CloudShadow.js` | One shared cloud factor optionally reading H map, retain legacy analytic mode | Existing shadow-chain, cloned material userData, off compile-out |
| [D5] `AtmosphereMotion.js` | Reuse conventions, not 2D projection as 3D source | Existing phase/wrap for off |
| [D8] `sky/cloudLighting.js` | Legacy remains; H uses scattering rather than derivative cloud shading | Sky colour tuning and existing flash |
| [D9/D10] sky look/controller | Small pure CloudWeather adapter or publisher | Existing region/overcast/cycle easing |
| [D14–D17] storm/lightning | Read existing storm and per-strike events, no new schedule | Rain/snow, thunder, environment lamps |
| [D18] `main.js` | Wire current sky/weather/wind state before one H pre-draw hook; lifecycle | Current update ordering and failure handling |
| [D19] `StylizedGodRaysPostProcess.js` | Use H cloud mask/transmittance when enabled, otherwise old mask scene | Other god-rays techniques, fog, blur and cinematic pipeline |
| [D21] `InfiniteTerrainView.js` | One shared beforeMainRender stage; renderer route consistency | Current active path/occlusion wrapper, no double scene |
| [D22–D26] post stack | Subscribe to invalidation events if needed, no extra post graph unless flight requires it | TAA/MRT, DRS, camera, bloom/tonemap |
| [D28/D29] wind | Read prevailing resolved weather wind, no cloud-specific wind field render | 384 m camera-local foliage gust simulation |
| [D30] `validateEditorConfig.js` | Validate new sky.volumetricClouds subtree | Original sky/godRays/quality keys |
| [D31] noise source | Original generated tileable 3D asset and metadata, lazy cached | CC0 source library only/no unverified licensing |
| [D32–D40] tests/QA | Add H deterministic cases, settings and GPU acceptance report | Existing fixtures, no false success |
| [D42/D43] heat shimmer and env | Keep existing, optionally consume coherent H sky | No sky double warp, no black IBL |
| [D44/D45] snow/terrain materials | H factor from existing direct shadow hook and sampler-proof integration | Snow glints and 16-sampler budget |
| [D27] underwater | Explicit tested H fallback/one pre-draw hook; no duplicate draw | Existing water refraction and underwater volume |
| [D48/D49] coordinates and stylized view base | Only reuse existing origin and owned resources | No new inconsistent origin singleton |

### 12.3 Stable small public contracts

Recommended *conceptual* (not current implementation) interfaces:

```text
CloudFrame {
  frameToken,
  cameraCanonical,
  cameraRender,
  timeSeconds,
  lookGeneration, weatherGeneration, windGeneration,
  skyLinearKey, skyLinearAmbient,
  shell, cloudType, coverage, density,
  windDisplacementCanonicalXZ, lightningEvents
}

CloudOutputs {
  state: legacy | loading | active | unsupported | failed,
  generation, sourceVersion,
  view: { inScatteredRGB, transmittance, characteristicDepth },
  shadow: { texture, mapping, generation, effectiveLightingMode },
  farPanorama?: { texture, generation },
  diagnostics
}

CloudRuntime {
  prepare(frame) -> output snapshot (no duplicate per same frameToken)
  invalidate(reason)
  resize(renderSize, displaySize)
  prewarm(renderer)
  dispose()
}
```

The implementation should check current Three.js API and GPU target creation semantics before giving these names to real code. Keep GPU consumers on **stable node identity** when textures change, and avoid one shader class per camera or cloud weather mode.

### 12.4 Error handling

- Asset validation failure: capture URL/type/header/mip length and one throttled error, retain legacy sky; do not black out the horizon.
- GPU device lost: invalidate all H GPU targets and history, cancel stale async asset/shader work by generation; restore legacy until valid reinit.
- Unsupported sampler/storage format: one clear warning and deterministic fallback state, never unexpected implicit GPU readback.
- Shader compile failure: fail H feature atomically and preserve prior known-good render graph.
- Resize/quality change: create new buffers, stage node rebinding and dispose old after GPU-safe usage; no use-after-dispose.
- Sky look/content update while asset loads: stamp source generation and apply **latest** look on first ready update; do not publish old sunny weather when storm already started.
- Profiler failure: metrics `unavailable` without failing rendering; don't log every frame.
- No module-global run-state except existing shared shader uniforms where justified; own lifecycle through sky view/renderer resources.

---

## 13. Frame ordering, invalidations and swap atomicity

```text
simulation time / camera / floating origin (canonical)
       |
weather & StormState + DayNightCycle + regional SkyLookController
       |
prevailing wind and lightning event from existing controllers
       |
StylizedSkyView.applyLook + skyView.update
       |
CloudRuntime.prepare(frameToken, same authoritative state)
       |
+-------------------+---------------------+
| H view trace      | H shared shadow map |
| (optional history)| (phased + complete) |
+-------------------+---------------------+
       |
atomic source generation / ready marker
       |
sky render material uses H radiance+T  OR legacy cloud mix
materials use matching H cloud shadow OR legacy analytic cloud shadow
god rays use H transmission OR legacy cloudMaskScene
       |
**one** active render: cinematic / volumetric / post / direct
       |
existing scene HDR, fog, TAA/FXAA, output tonemap
```

**Atomicity:** a view drawn for cloud source generation `G+1` with a ground shadow map still encoding `G` can produce a visibly mismatched cloud and ground. Publish the new source only when shadow map has an acceptably complete current generation and both have matching time/position mapping, or keep old coherent source for a bounded transition. A debug developer mode may show view-only with an explicit marker; production cannot call it coherent.

| Event | Cloud density source | View/hist | Shadow map | Post/scene |
| --- | --- | --- | --- | --- |
| Camera small translation/turn | unchanged | reproject/more fresh samples | map recenter strips or same | active render remains |
| Camera teleport | unchanged | invalidate/warm with fresh sample | full new coverage before active | reset existing post history |
| Floating-origin rebase, canonical pose unchanged | unchanged | reproject canonical or safe reset | no new world bake, transform only | existing invalidation still applies |
| Large FOV change | unchanged | reset history/projection | same ground map if camera XZ stable | post reset |
| Render scale/viewport resize | unchanged | reallocate view size & rebind | unchanged unless quality | post resize |
| Quality tier change | same density config if only sampling | rebuild targets/history | rebuild map/reschedule | only known topology variant |
| Weather look coverage/type jump | new density generation | reset/short history | full coherent update | update sky look once |
| Small weather easing | updated uniforms/generation | adaptive weight | phased/limited refresh | no new material program |
| Broad wind change | integrated drift | motion reprojection | related shadow rebuild | no terrain worker |
| Lightning strike | transient only | current flash no history | no static shadow reallocation | existing flash and thunder |
| Time scrub/sun direction jump | density maybe unchanged | recompute light, invalidate if large | new light optical depth/shadow | existing sky/lighting |
| Camera high above cloud shell | same volume | depth-aware composite required | high-view shadow fallback | do not claim correct flight without gate |
| Scene environment/IBL async completion | unchanged | optional new sky source | optional mean light update | current HDR remains |
| Renderer device loss | retain CPU noise source bytes | dispose/reinit | dispose/reinit | legacy immediate fallback |
| H disabled | none | release | release | original sky and shadow |

A shadow-map **phase** must store exact generation+age. After teleport/sky jump, unrefreshed rows must be flagged invalid and cannot be sampled as if current. No scanning entire world edits: clouds are world-scale and do not bake into terrain geometry. No worker jobs per terrain chunk.

---
