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
