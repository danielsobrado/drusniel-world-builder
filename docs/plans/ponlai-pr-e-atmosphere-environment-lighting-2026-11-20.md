# Ponlai integration — PR E: physically based atmosphere and coherent environment lighting

**Status:** **Detailed implementation specification — no rendering code implemented by this commit**  
**Date:** 2026-11-20  
**Target repository:** [Drusniel World Builder](https://github.com/danielsobrado/drusniel-world-builder), shared `main` only  
**Drusniel source inspected:** [`075834d7adcdba92547694385f135507b4e6f426`](https://github.com/danielsobrado/drusniel-world-builder/tree/075834d7adcdba92547694385f135507b4e6f426)  
**Ponlai source inspected:** [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e)  
**Position:** PR E of PRs A–L; Phase 3 of the Ponlai adaptation programme  
**Dependencies:** [PR A foundation](ponlai-pr-a-render-foundation-2026-11-20.md) · [PR B deterministic QA](ponlai-pr-b-deterministic-render-qa-2026-11-20.md) · [PR C HDR exposure](ponlai-pr-c-hdr-histogram-auto-exposure-2026-11-20.md) · [PR D local tone/night perception](ponlai-pr-d-local-tone-purkinje-2026-11-20.md)  
**Next:** PR F — chunk ambient irradiance / spherical harmonics; PR G — ground bounce / relight  
**Guiding requirements:** preserve Azgaar semantics, streamed large world, floating origin, authored lighting and active rendering modes; small SOLID modules, separate constants, YAML configuration, real hardware QA, no GitHub Actions

> **State caveat.** At the revision inspected, the preceding PRs **A–D are Markdown implementation plans only**. This PR must not assume a new renderer, histogram meter, `effectiveExposureNode`, night-perception controller or PR B screenshot harness exists merely because a plan describes it. Inspect current `main` and prove prerequisites before code work. This document is a design handoff, not a claim of working physical sky, GPU profiling or passing QA.

## 1. Goal and exact scope

Upgrade the **clear-sky atmospheric light** behind Drusniel's established cloud/weather art direction so that:

1. The daytime sky exhibits plausible **Rayleigh blue**, **Mie/aerosol forward glow** and solar reddening at low elevation.
2. Dawn and dusk resolve into continuous, direction-dependent gradients without hard seams, dark horizon bands, or sudden colour/brightness jumps.
3. The same resolved sky state can consistently drive **direct sun colour**, **hemisphere/ambient illumination**, **material image-based lighting/reflections** and **aerial-perspective colour**.
4. Mountain silhouettes, far-terrain atmosphere and coast horizon meet the sky naturally in **near and far** cameras.
5. The camera still sees Drusniel's authored regional and snow-country atmosphere, without losing dark moonlit scenes, overcast storm character, stars, clouds, cloud shadows, sun shafts or underwater fog.
6. No duplicated lights, exposure gain, environment sampler, tone curve, scene render, cloud system or shader framework are introduced.
7. All existing render paths (ordinary post-processing, cinematic/volumetric/screen-space god rays and direct fallback) have explicit behavior.

**Product priority:** physically informed **and visually coherent**. “Physically based” describes the scattering computation and its relative optical behaviour, **not** an assertion that today's Drusniel scene intensities are calibrated in real lux or spectral radiance.

**Default:** `atmosphere.mode: stylized` (existing output, zero new LUT work). `physical` is opt-in until verified. A prototype that only changes a blue sky material without synchronising sun, IBL and haze **does not complete PR E**.

### Deliverables

- A physically based clear-air LUT generator with explicit format, resource ownership, cache invalidation and deterministic warm-up.
- A Drusniel light-unit adapter that makes atmospheric sun colour/ambient/reflection luminance comparable to the current authored look.
- A single, opt-in physical-clear-sky branch of [D1] `StylizedSkyView` **behind the existing cloud/sky composition**; no cloud replacement.
- Opt-in atmosphere-consistent daytime light and HDR environment/reflection path, with the existing CC0 HDR environment retained as fallback.
- An explicitly designed atmospheric/aerial fog bridge replacing—not duplicating—overlapping clear-air haze where possible, while weather/underwater/mist remain correct.
- Existing YAML/defaults/validation, diagnostics, cross-path QA, GPU cost and rollback.

### Explicitly out of scope

- Procedural **volumetric** clouds and cloud shadows overhaul (PR H).
- Per-chunk diffuse spherical harmonics, probe grids and bounce (PRs F/G).
- Ocean FFT or coastal optical rework (PR I). **Only** ensure it sees coherent sky/sun/reflection inputs.
- Planet geometry or curvature changes to Azgaar terrain, chunk borders, settlements, navmesh or water coastlines.
- A new sky clock, weather system, star catalogue, moon textures or astronomical model.
- Spectral multi-wavelength scattering beyond the project's usable RGB approximation.
- Migrating Ponlai's complete `Sky`, `FrameGraph`, `SkyBake` or private Three.js PMREM internals.
- Multi-kilometre real volumetric froxel fog as a new default. If correct RGB aerial composition cannot fit current render routes, retain the existing atmospheric-fog owner and classify that part as an approximation.
- Automatically changing existing high/ultra quality output until the opt-in feature is approved.

## 2. Ground truth: Drusniel sky and lighting already exist and have one scene owner

### 2.1 Current sky material and light authority

**[D1]** `src/editor/stylized/StylizedSkyView.js` creates a **camera-following sphere** and a custom `MeshBasicNodeMaterial`:

- Vertical authored `lowColor`→`highColor` gradient.
- Sun disc and directional glow based on `sunDirection`.
- Existing clouds from `cloudCoverageNode` and `litCloudColorNode`, lightning flash and moon/star additions.
- Existing horizon/whiteout fog on the sky dome, a distinct effect from material fog.
- `exposureCompensation`, which partly offsets the snow-country/scene exposure scale.
- A separate cloud-transmission dome for god-rays.
- One scene-wide `HemisphereLight` and `DirectionalLight`. It explicitly removes fallback lighting added earlier, to avoid a double unshadowed sun.
- Two-cascade shadow support from [D2] `CascadedSunShadows` if configured.
- Scene `FogExp2` plus [D3] `SunHazeFog` assigned to `scene.fogNode`.
- An asynchronously loaded [D4] `sceneEnvironment` CC0 HDR: it provides reflection/fill for physically based standard materials.
- [D5] `skyLightUniforms` for water/mist/custom materials, with relative light brightness/tint and sun colour.

**[D1] `StylizedSkyView.applyLook` is the single point that writes most lighting values**: current sky, sun direction, hemisphere sky/ground colour/intensity, directional sun colour/intensity, fog and cloud shadows, scene-environment intensity, snow tint/light, cinematic look grade and `sceneExposure.scale`. `StylizedSkyView.update` keeps the sky/directional positions camera-relative and clouds sampled from wrapped **canonical world coordinates**.

This is valuable architecture. **Do not create a parallel atmosphere controller that writes competing lights.** The proposed atmosphere can be a **dependency owned by this sky view**, with one well-defined resolved lighting state handed to existing receivers.

### 2.2 Current sky look is not a static “day/night” toggle

**[D6] `SkyLookController`** blends preset time, regional climate, overcast, storm, snow-country and bog atmosphere. It updates its sky view through `applyLook`, not a per-shader clock.

**[D7] `SkyLook`** defines continuous `nightness`, `sunElevation`, `sunAzimuth`, `directionalIntensity`, `ambientIntensity`, `fogDensityScale`, `skyFog`, `whiteout` and colours.

**[D8] `dayNightCycle.js`** owns deterministic time/position/phase and explicitly says it is *not* a second lighting authority. The existing cycle can traverse a 24-hour day over 600 real seconds in the inspected config; a naive atmosphere rebake on every slight elevation change would be expensive.

**[D9] `snowCountryLook`** changes the sky, haze, cold/warm tint and snow-region exposure **relative to existing look**, so moonlit snow stays moonlit and snow brightness does not clip.

**[D10] `lookGrade`** already shifts night/storm saturation/contrast/lift. PR E must not introduce another post-grade or night tint to “fix” lighting.

### 2.3 The existing scene environment is a real dependency, not an optional decoration

[D4] `applySceneEnvironment` loads an equirectangular HDR file once via `HDRLoader`, sets `EquirectangularReflectionMapping`, and writes `scene.environment` / `scene.environmentIntensity`. The default source is Poly Haven **Zwartkops Straight Morning** (CC0) at a low authoring intensity. It is currently scaled with `environmentLightScale(look, configuredLook)`, not physically rebuilt as the sky changes.

Why it matters: [D4] explicitly notes that metallic armour and standard surfaces otherwise look **black** in the absence of environment reflections. A sky replacement that merely sets `scene.environment = null` at night or while a bake runs is a regression.

A correct PR E needs a clear **owned handoff**:

- Preserve existing static HDR source until a valid dynamic environment has compiled, baked and passed sanity checks.
- Never publish a half-populated/black PMREM texture.
- Preserve metallic reflections and standard-material roughness response.
- Keep sunset direction broadly consistent among **visible** sun/sky, glass, polished stone, water and metal reflections.
- Do not claim equivalence between IBL brightness and hemisphere-light brightness without a tested unit mapping.

### 2.4 Existing aerial haze/fog is already directional and distant

**[D3] `SunHazeFog`** currently combines a sun-facing warm/away-facing cool direction term with an exponential-height aerial factor, plus scene `FogExp2`. It copies active fog each frame; when underwater replaces the sky fog, the special atmosphere is intentionally disabled.

**[D11] `MacroFarTerrainView`** displays enormous imported Azgaar continents/mountains as a single camera-relative backdrop; far-terrain has its own atmospheric fading and code paths. **[D12] `CloudShadow`** wraps canonical coordinates before noise to avoid float32 instability at extreme world distances.

**[D13] `UnderwaterCausticsPostProcess`** and the existing water optics have independent underwater haze/caustics. PR E **must not** leave the sky's clear-air fog active when the camera dives or layer two full-scene hazes over water.

**[D14] `StylizedGodRaysPostProcess`** has independent screen/cinematic/volumetric render pipelines and a separate volumetric height fog path. **[D15] `InfiniteTerrainView.render`** selects cinematic/volumetric god rays before the ordinary post graph. A sky-state and scene-light change affects all paths, but any **screen-space** aerial composition inserted into only one post graph does not.

### 2.5 Other existing light receivers to audit

| Consumer | Grounded owner | Requirement |
| --- | --- | --- |
| Directional sun and its shadow | [D1, D2] | One physical/author-blended sun vector; shadows and source disk agree |
| Standard PBR construction/characters | [D4] `scene.environment` | Reflection brightness and hue consistent with dynamic sky; no missing HDR during updates |
| Hemisphere diffuse | [D1, D16] `skyAmbientColor` | Coherent sky/ground fill, not second illumination added on top |
| Water/mist/custom materials | [D5] `skyLightUniforms` | Preserve existing normalized contract; document any physical-source adapter |
| Snow/alpine | [D9], [D5] `snowLightUniforms` | White remains detailed; cold shadows and authored exposure survive |
| Cloud masses/rims | [D17] `cloudLighting.js` | Same sun direction/light tint as new atmosphere, not a separate scattering layer |
| Cloud shadows | [D12] | Shadow positions canonical/wrapped; not rebaked when atmosphere LUT changes |
| Sky stars and moon | [D1, D18] `starField.js` | Existing nighttime visuals preserved, no unintended night light floor |
| Main fog/sky horizon | [D3], [D1] | One clear-air optical attenuation/composite, matching far terrain |
| Giant Azgaar backdrop | [D11] | 2–90 km skyline blends to physical horizon without changing terrain geometry |
| Day/night/weather | [D6–D8] | One authored input, no new clock or region registry |
| Filmic output | [D19] post graph and [D20] god-rays finish | Scene-linear data; no baked tone mapping; no second exposure |

## 3. What Ponlai actually implements and what can be safely adapted

### 3.1 [P1] `Atmosphere.ts` — LUT-based clear-air scattering

Ponlai's `Atmosphere` is not a simple 2D gradient. It implements a Hillaire-inspired and Elek-style parametrized solution in TSL, with some author-calibrated extensions:

- Planet-scale spherical approximation: **RG=6360 km** ground radius; **RT=6460 km** atmosphere top.
- RGB Rayleigh coefficients with an exponential density scale height (8 km).
- Mie/aerosol scattering/extinction with an approximate 1.2 km density scale height and Cornette–Shanks forward phase.
- Ozone absorption in an altitude layer, with density/column tuning.
- Atmospheric transmittance and multiple-scattering LUTs.
- A separate in-scattering table indexed by solar elevation, view elevation and observer altitude, packed into 2D textures.
- Sun/moon rows cut from that table for a sky view and a height/elevation fog table.
- Horizon-aware parameterization and B-spline sampling to avoid hard crossings between ground-intersecting and sky-intersecting rays.
- One part of its light computed using the *Earth shadow* and solar/lunar phase/attenuation.
- Sky radiance after reintroducing Rayleigh and Mie phase functions and current body illuminance.
- Explicit invalidation: static atmosphere medium changes rebuild expensive LUTs; body direction/view altitude changes rebuild smaller “cut” textures.

**Upstream table resolutions from the pinned code** (not recommendations or measured Drusniel costs):

| Ponlai resource | Format/shape in [P1] | Critical behaviour |
| --- | --- | --- |
| Transmittance | 256×64 | Optical extinction to top atmosphere |
| Multiple scatter | 192×32 | Scattering response across sun cos elevation / height |
| Inscatter atlas | 89×21 = 1869 columns, 96 rows, two components | Solar elevation × view elevation × observer altitude |
| Sky slice | 512×2, two components | Separate sun and moon rows |
| Fog slice | 128×(2×16), two components | Sun/moon × view angle × altitude |
| Shadow-mean texture | 256×(2×32) | Earth-shadow response |
| Texture type | Float32 LUT targets in upstream | **Does not imply** portable or cheap target formats in Drusniel |

This is a sizeable system. A slimmed first shipping PR E may use the **paper's more conventional transmittance + multiple scattering + sky-view LUT**, with a bounded height/fog approximation, provided the visible sky/environment results meet agreed quality. Copying a 1,200-line upstream class or all nine GPU quads as-is would violate KISS and couple our engine to Ponlai's unrelated weather/sky scheduler.

### 3.2 [P2] `Sky.ts` and [P3] `SkyTrack.ts` — one atmospheric state across consumers

Ponlai's `Sky` composes atmosphere, clouds, sun/moon/night sky, haze, reflections and baked environment. `SkyTrack` owns the moving sun, moon, weather and their continuous keys. In Ponlai, a single cloud field feeds visible sky, IBL, cloud shadows, haze and water reflection, reducing disagreement between them.

**Adapt this idea, not the giant class.** Drusniel already has [D1, D6, D12] cloud/sky/look ownership. Make the derived atmospheric products consistent; do not import Ponlai's clock, weather, night and sea systems.

### 3.3 [P4] `SkyBake.ts` — environment/irradiance products with deterministic publication

Ponlai bakes reflected sky panoramas, roughness-filtered environment maps and irradiance, sometimes spreading work across frames and cross-fading finished products. Source highlights:

- Explicit scene change/first bake waits for shader warm-up before publishing; an unready shader once produced **empty irradiance** and gross exposure errors.
- The initial bake fills both transition endpoints from a valid first state.
- Periodic updates are spread over small pass budgets, then published atomically.
- A stale/in-flight bake is versioned so only current state is published.
- The exposed environment is not black/null while a later bake is pending.
- Ponlai uses private Three.js `PMREMGenerator` internals via [P5] `Environment.ts` to split the GGX filter pipeline. **Do not copy private hooks** without a supported, version-pinned reason and dedicated QA.
- The upstream occasionally reads small irradiance products back for explicit bakes; **do not add per-frame GPU readback** to Drusniel.

In Drusniel, a conservative starting approach is **explicit full low-resolution bake on controlled scene changes** or a **supported publicly exposed incremental PMREM path**, rather than private-function patches. A queued, bounded, generation-keyed rebake is essential for a rapidly animating day/night cycle.

### 3.4 [P6] `SkyDome.ts` — sky and environment must see the same source

Ponlai separates the physically scattered **sky light** from a **visible sun disk**, clouds, moon/stars and long-distance haze. It generates an equirectangular panorama from the same sky state for reflection/irradiance. This is the most important interoperability principle for Drusniel.

Our procedural clouds, sun disk and snow sky tint can stay. Change only the **clear-air source** and the **light/reference** backing them, then match environment and haze.

### 3.5 [P7] `Radiometry.ts` — radiometric units and half-float limits

Ponlai uses `SCENE_RADIANCE_SCALE=1/16` and explicitly distinguishes scene radiance, illuminance, display exposure and HDR range. That scale was chosen to make its sunlight fit float16 with their own pre-exposure system.

**Never copy 1/16, `SUN_ILLUMINANCE=11` or the island's sun/angular/exposure gains as unquestioned Drusniel defaults.** Our existing `DirectionalLight.intensity`, [D7] global manual exposure, [D9] snow correction, atmosphere and HDR environment were tuned differently. Preserve their visible result through an explicit mapping and A/B calibration.

### 3.6 [P8] `BandMatrix.ts` and [P9] `look/SkyLook.ts`

Ponlai can adjust RGB-band transmittance chroma while retaining luminance, and its sky look tables hold authorial clear/overcast/night controls. These are examples of a *controlled artistic layer on physical calculations*, not permission to multiply an extra arbitrary blue tint across every receiver. Initially keep the band-push **neutral** unless data shows Drusniel's displayed RGB transmittance needs correction.

### 3.7 [P10] `VolumetricHaze.ts` — not a safe direct port for E

The upstream volumetric haze is a substantial 3D froxel system with atmospheric and local aerosol terms, rain, shadowing and temporal state in Ponlai's custom graph. Drusniel already has [D3] `scene.fogNode` and [D14] a separate volumetric god-rays path, plus valley fog and underwater optics. Porting the entire haze in this PR risks double scattering, duplicate histories and a new renderer-level scheduling problem.

**Use upstream to derive colour/phase/optical math and pass contracts.** Reuse current fog owner or explicitly require a small future bridge if an exact RGB composition is not compatible with the current Three.js material fog API.

## 4. Source-to-source integration matrix

| Requirement | Drusniel code/owner | Ponlai reference | Proposed action |
| --- | --- | --- | --- |
| Clear sky | [D1] `createSkyMaterial` | [P1] `skyRadiance`, [P6] `domeColour` | Replace only clear sky branch when enabled; preserve clouds, sun disk and night bodies |
| Atmosphere LUT | New leaf component owned by [D1] | [P1] `Atmosphere` / `updateSync` | Static vs dynamic LUT cache, GPU/format validation |
| Sun position | [D8] `dayNightCycle` → [D6] → [D1] | [P3] `trackSky` | Same sun vector; no second celestial clock |
| Sun irradiance | [D1] directional | [P1] `transmittanceToSun`, [P7] radiometry | Resolve one sun RGB/intensity through calibrated adapter |
| Hemisphere | [D16] `skyAmbientColor`; [D1] hemisphere | [P2, P4] irradiance/sky bake | Derive consistent ambient light; no duplicated light |
| Material reflection | [D4] `applySceneEnvironment` | [P4] `SkyBake`; [P5] PMREM | Replace static HDR only with **valid** dynamic IBL; retain fallback |
| Water/foam light | [D5] `skyLightUniforms`, ocean material | [P2, P6] reflection panorama | Preserve water uniform contract; optionally feed coherent sky/environment source |
| Snow | [D9] `snowCountryLook`, [D5] snow uniforms | [P9] authored sky/look | Keep snow style/exposure; calibrate relative physical sky |
| Aerial fog | [D3] `SunHazeFog`, [D11] far-terrain | [P1] transmittance/fog rows, [P10] haze | One optical path, not `FogExp2` plus second full clear-air layer |
| Weather | [D6, D7], [D17] cloud lighting | [P2, P3, P9] | Maintain authored controls and cloud details; atmo medium does not recompile each frame |
| Night/moon | [D1, D18] star/moon shader, [D10] grade | [P2] night sky, [P1] moon row | Keep art-directed night; physical moon scattering optional gated pilot |
| Floating origin | [D1] camera follow, [D12] wrap, [D11] macro | [P1] radial planet coordinates | Atmosphere uses **camera altitude** and direction only, never huge canonical GPU coords |
| Post output | [D19, D20], [D15] selection | [P6] scene-linear sky radiance | Radiance before exposure and curves; all active paths display same sky |
| QA / versions | [D21] look shots, [D22] perf QA, [D23] Three package | [P1] TSL and [P4] bake QA | Current Three version, A/A baseline, real GPU measurements |
| Ownership/legal | [D24] `AGENTS.md`, PR A ledger | [P1–P10], MIT headers | Pin origin, respect tidewater attribution, avoid importing unrelated assets |

## 5. Reference frame and coordinate model — essential for Azgaar's huge flat world

### 5.1 Do not turn a flat Azgaar world into a spherical planet

Ponlai's [P1] spherical atmosphere assumes a planet radius of 6360 km. Drusniel's canonical world is an extremely large **flat/planar** map with streaming tiles and floating origin. The physically based sphere is a **radiative approximation** for atmospheric optical path and horizon **only**.

Define the coordinate frame explicitly:

- World “up” = renderer Y axis.
- Sun direction is [D1] `directionFromAngles(elevation, azimuth)`: a normalized vector toward the incoming key.
- Sky view direction `viewDir` is camera-relative, never raw million-metre canonical position.
- Atmosphere optical altitude `hKm = max(cameraHeightMeters - seaLevelMeters, 0) / 1000`, clamped to the supported LUT domain.
- Planet radial coordinate for LUT math `rKm = R_ground + hKm`.
- Effective tangent/horizon uses the synthetic sphere only in LUT geometry; it never deforms terrain horizon, terrain sample height, coast lines, sun-shadow direction or gameplay.
- Fog distance and far-terrain coordinates stay **metres**; only convert to km at the atmosphere module boundary.
- High altitude/flying cameras beyond supported LUT range must use a documented extrapolation or fallback, not sample outside the texture.

**Sea-level / origin issue:** Do not assume `camera.position.y` always equals altitude above the atmosphere's datum. Investigate [D11] macro terrain/world sea-level mapping and camera-following. Scene height is a renderer-space Y; a floating-origin rebase currently affects X/Z, not necessarily vertical. Build one small altitude adapter using the existing world sea-level reference. Keep it pure, tested and independent of camera X/Z.

### 5.2 Precision

- No large canonical coordinate in the atmosphere shader. A shader needing view angle and height can use normalized direction and small altitude.
- Prefer high-precision CPU derivation of sun/camera state and bounded uniform floats.
- For atmospheric ray/sphere intersections near ground, compute `(|ro|-R)(|ro|+R)` rather than unstable subtracting `|ro|² - R²` in float32; [P1] does exactly this.
- Avoid negative sqrt due to roundoff: `sqrt(max(discriminant,0))` plus hit validity.
- Clamp `mu=dot(viewDir,up)` to [-1,1], guard horizon crossings.
- Do not let exact 0 optical depth trigger `0/0` in transmittance integrals.
- Rebase with same camera view should not change atmospheric output beyond the deterministic QA noise envelope.

### 5.3 Scale mismatch and visual horizon

A synthetic curvature horizon at a sea-level viewer lies extremely close to 0° below horizontal; Drusniel may draw far-terrain mountains tens of kilometres away at higher/lower apparent angles. The atmosphere's **visible sky** can use spherical optics, but the **terrain-vs-sky** boundary comes from actual geometry/depth. Do not carve a circular horizon mask in screen space, or push far macro geometry behind an artificial planet.

At distances beyond the existing far-terrain radius, use current sky/haze blending and consistent RGB transmittance. Test from coast, high mountain and editor fly camera, not merely one island beach.

## 6. Scattering model: precise math and engineering policy

### 6.1 Medium and extinction

For altitude `h` (km, above sea-level datum), let:

```text
rho_R(h) = exp(-h / H_R)
rho_M(h) = exp(-h / H_M)
rho_O(h) = max(0, 1 - abs(h - h_O) / w_O)

beta_R_scatter(h) = beta_R0 * rho_R(h)
beta_M_scatter(h) = beta_M0 * rho_M(h)
beta_extinction(h) =
    beta_R_scatter(h)
  + beta_M_scatter(h) * mieExtinctionToScatterRatio
  + beta_O_absorb * rho_O(h)

T(ray, distance) = exp( - ∫ beta_extinction(h(s)) ds )
```

All `beta` coefficients must be per **km**, not per metre. Start from the Ponlai/Rayleigh reference [P1] as a physics basis, then expose a small set of **bounded** aesthetic coefficients. The engine must validate that absorption and extinction never become negative. Don't tune the Sun to appear nice by multiplying atmosphere radiance after the fact while leaving transmittance and scene lighting unchanged; alter the medium or an explicit look gain consistently.

Reference [P1] uses:

- `H_R ≈ 8 km`;
- `H_M ≈ 1.2 km`;
- RGB `beta_R0` roughly `[5.802,13.558,33.1] × 10^-3 km^-1`;
- ozone as a peaked layer around 25 km;
- Mie anisotropy `g ≈ 0.76`;
- an **author-calibrated aerosol amount** above a base medium.

These are **upstream model parameters**, not preapproved Drusniel defaults.

### 6.2 Direct-beam transmittance and sunlight

For the sun direction `ω_s`, attenuate with `T_sun = T(r,ω_s)`. A direct key reference colour may be:

```text
sunRgb_raw = solarWhiteRgb * T_sun
sunLuma = dot(sunRgb_raw, rec709Luma)
keyIntensityDrusniel = authoredLook.directionalIntensity
                       * boundedRelativeKeyGain(sunLuma, authoredReferenceLuma)
keyColorDrusniel = normaliseLuminance(sunRgb_raw)
                    blendedWithAuthoredKeyColor(...)
```

This is **relative physical colour** under the existing art-directed intensity. A fully physical intensity would require calibrating material BRDFs, environmental radiance, HDR exposure and sun/hemisphere units; that is not feasible as a surprise change within E.

Design the calibration so the current clear noon capture remains close to the authored baseline (within reviewable tolerance), while sunrise/sunset colours change smoothly and convincingly. Physical reddening should not simply multiply the already warm `look.directionalColor` by another orange factor until grass, buildings and snow become oversaturated.

**Moon:** the current moon/sky lighting is artistically authored; the sun/sky LUT may optionally evaluate moonlight at the moon direction using the same optical medium, **only when night tests verify** that it does not over-light ground or desaturate stars. Avoid two luminous “suns” in the key lighting rig. [P1/P3] model separate solar/lunar rows, but reusing all of that in E is not mandatory for the daytime optical goal.

### 6.3 Single scattering and phase functions

For a camera ray from `x` along `ω`, radiance under a single directional source (conceptually):

```text
L_single(x, ω) =
  ∫[0,d]
    T_view(0,s)
    * ( beta_R(h(s)) * P_R(cosTheta)
      + beta_M(h(s)) * P_M(cosTheta) )
    * L_sun
    * T_sun(x+sω)
  ds
```

where `cosTheta = dot(ω, ω_s)` under the chosen direction convention; verify the sign in shader tests. Use the Rayleigh phase `P_R = (3/(16π))(1+cos²θ)` as an analytic baseline; [P1] applies optional artistic forward lean/polarizer on the **visible sky**. For Mie use a bounded Cornette–Shanks phase or equivalent; keep the energy term properly normalized. A broad warm aerosol halo should be smooth around the actual sun and not create a narrow bright stripe at the horizon.

**Do not compute a long ray march for every full-screen sky pixel at 4K.** Bake a suitably parameterized LUT, then sample it, applying directional phase at use where that architecture is adopted.

### 6.4 Multiple scattering

Single scattering makes some skies/dusk too dark and misses diffuse fill. [P1] precomputes an approximate multiple-scattering LUT over altitude and solar elevation. Its main benefit: physical diffuse sky needs enough non-directional light for cloud underside, shadowed material and the horizon to remain plausible.

Proposed pilot:

1. Build transmittance LUT for current medium (static until medium changes).
2. Build a small multiple-scattering LUT from that transmittance and fixed-count direction/sample integration, with deterministic sample positions and bounded energy.
3. Build a sky-view LUT for the current sun elevation and camera altitude, recomputed only at an **appropriate threshold/cadence** or using a sun-elevation axis so an animated clock does not trigger a full high-cost bake every frame.
4. Sample the sky-view LUT per direction in [D1] sky shader, add authored cloud/sun/moon layers as separate compositors.

If using Ponlai's richer in-scatter atlas, the expensive static table must not rebuild on the sun's motion; only the small sky/fog rows update. The implementation agent must choose and benchmark **one** coherent approach. Avoid maintaining a full alternative LUT architecture in production as a “backup” unless QA proves necessary.

### 6.5 Chosen LUT topology and resource budget — pilot proposals

**Recommended first design spike** (not verified on local hardware):

| Resource | Pilot dimensions | Lifetime | Notes |
| --- | --- | --- | --- |
| `transmittance` | 256×64 RGBA16F or supported RGB-compatible format | Rebuild on medium/coefficient changes | 2D optical attenuation, never sRGB |
| `multiScattering` | 32×32 or 64×32 RGBA16F | Rebuild on medium changes | Start cheaper than Ponlai's near-horizon 192×32; verify twilight errors |
| `skyView` | 192×108 or 256×128 RGBA16F | Rebuild on sun altitude/sky state; not full world render | Sky colour before clouds/sun disk |
| `aerialLight` (optional) | 64×32 RGB/rgba half-float proxy, or bounded analytic node | Rebuild only if clear-air haze can consume it correctly | No compulsory 3D froxel grid |
| `environmentSource` | 256×128 or 512×256 HDR equirect | When scheduled; not each frame | Dynamic reflection/IBL source |
| `filteredEnvironment` | Three.js-supported PMREM | When environment source ready | Do not copy private `PMREMGenerator` methods |

**All dimensions are proposals, not Ponlai's values or measured GPU costs.** With 256×64×8-byte RGBA16F, transmittance raw texel memory is 131,072 bytes. A 256×128×8-byte sky-view LUT is 262,144 bytes. These arithmetic figures exclude mipmaps, PMREM, alignment, intermediate scratch targets, cached graph variants and driver memory. Measure actual allocations.

The pilot should preserve **high precision around the sun and geometric horizon**, using nonlinear UV mapping if necessary, rather than simply doubling a uniform grid resolution to hide horizon artifacts. [P1] `muTexel` and `muSUnit` are detailed references. Beware filtering across “ground-hit” and “sky-hit” halves: clamp interpolation within each branch.

### 6.6 Transmittance LUT reference pseudo-algorithm

```js
// Conceptual GPU shader math; not verified drop-in Three.js TSL.
function transmittanceAt(radiusKm, mu, atmosphere) {
  const ray = rayFromRadiusAndCosZenith(radiusKm, mu);
  const distanceKm = nearestPositiveTopAtmosphereExit(ray);
  if (!Number.isFinite(distanceKm)) return [1, 1, 1];

  let opticalDepth = [0, 0, 0];
  for (let i = 0; i < STEPS_TRANSMITTANCE; i++) {
    const tKm = distanceKm * ((i + 0.5) / STEPS_TRANSMITTANCE);
    const altitudeKm = altitudeAlongRay(ray, tKm);
    opticalDepth += extinctionAt(altitudeKm) * (distanceKm / STEPS_TRANSMITTANCE);
  }
  return expRGB(-opticalDepth);
}
```

**Actual implementation:**

- Use explicit valid intersection (inside atmosphere; does not hit the planet before exiting), not a default “top atmosphere behind ground” path.
- For rays that hit ground, sample only up to the ground and handle their behaviour separately; do not let sky light leak through ground from the opposite hemisphere.
- Clamp `T` per channel to [0,1] for non-emissive attenuation.
- Separate testable LUT coordinate mapping/unmapping.
- GPU target must be `NoColorSpace` (linear data), with correct filtering and no implicit display transfer.
- Result at no atmosphere (zero density) = [1,1,1].
- Increasing aerosol extinction must **not increase** direct sun transmittance.
- Test sunset and tangent ray boundaries for continuity.
- Build one pure CPU reference for small synthetic ray sets; do **not** use CPU reference per rendered frame.

### 6.7 Sky sample and horizon treatment

A shader sample should conceptually:

```text
viewDir = normalize(rayFromCurrentCameraAndSkyMesh)
altitude = clampedWorldAltitudeKm(camera)
rawClearSky = samplePhysicalSky(viewDir, altitude, sunDir, mediumLuts)
lookedSky = applyBoundedSkyLook(rawClearSky, currentSkyLook)
skyWithSun = compositeOneExistingVisibleSunDisc(lookedSky, attenuatedSunDisc)
skyWithClouds = existingCloudComposer(skyWithSun, currentCloudState)
skyWithMoonStars = existingMoonAndStars(skyWithClouds, nightness)
skyFinal = applyOneSkyFogWhiteoutAndExposureCompensation(skyWithMoonStars)
```

**Important:** [D1] sky material currently uses `sunHazeColor` on the clear sky before clouds. With a physical sky containing aerosol glow, applying the **full** current sun-facing glaze again would double the aureole. In physical mode, disable only the duplicated clear-air directional haze, while preserving separate weather/whiteout and cloud effects. The current sky/horizon still needs to match [D3] far fog.

**Sun disc:** [P6] adds a visible disc separately to in-scattered sky. Drusniel already has one disc; preserve its existing authored angular size, softness and emission unless reviewed. Modulate its linear colour by atmospheric transmittance/relative calibration, **not** a second disc rendered on top.

**Clouds:** Current cloud coverage and derivative-based lighting remain unchanged in geometry/time; feed a physically informed sunlight colour and soft sky fill to their current inputs only after A/B review. Don't reimplement Ponlai's cloud ray-march or change wind/cloudWorldScale in E.

## 7. One resolved lighting state: physically informed, artistically bounded

### 7.1 A single immutable snapshot, not a second scene-light rig

Create a small pure resolver, conceptually:

```js
resolveAtmosphereLighting({
  authoredLook,
  configuredLook,
  atmospherePhysicalSample,
  calibration,
}) -> {
  sunDirection,
  directRgb,
  directIntensity,
  ambientSkyRgb,
  ambientGroundRgb,
  ambientIntensity,
  reflectionIntensity,
  waterSunRgb,
  waterSkyTint,
  fogAerialRgb,
  fogAerialTransmittance,
  referenceOpenLightProxy,
  source: "stylized" | "physical",
  valid: boolean,
}
```

The **implementer must keep this object minimal**; do not expose a massive per-material scene-light API. It is a *derived* state. [D1] remains the writer to `DirectionalLight`, `HemisphereLight`, sun uniforms and environment owner; a physical mode creates inputs for those existing writes.

Use current [D6] `SkyLookController.current` and [D7] look values as the authority; do not add an “atmosphere time” or separate cloud-weather profile. When the physically based LUT is pending, the resolver must be able to use the existing stylized values **without resetting light to black**.

### 7.2 Clear noon calibration / art preservation

Use existing `grassland-off-12`, `forest-off-12`, `coast-off-12` and `town-off-12` reference captures to find a bounded mapping for:

- Direct-light luminance relative to the configured look's `directionalIntensity`.
- Hemisphere-integrated sky tint relative to [D16] `skyAmbientColor`, which was specifically tuned to avoid over-blue shadows.
- `scene.environmentIntensity` relative to current [D4] `environmentLightScale`.
- Terrain snow exposure and shadow ratios relative to [D9].
- Water glint/sky tint relative to [D5], not a replacement scene-light double multiplier.

**No invisible auto brightness equalizer.** An atmosphere mode that computes a bright blue sky while multiplying sun/ambient until every screenshot matches the old average pixel value has not improved physical consistency. Compare spatial distribution, colour and day/night relationships.

**One practical pilot:** set physically based sky RGB *shape* via LUT, but take the existing authored `look.ambientIntensity` / `look.directionalIntensity` as energy anchors. Use normalized relative colour from the LUT to drive hue while keeping luminous value within a conservative, scene-specific band. Later PR F can replace diffuse approximation with directional SH, and later physically calibrated lighting may adopt actual radiometric magnitudes.

### 7.3 Hemisphere versus SH division of labour

PR E should **not implement chunk SH or relight**. For existing hemisphere:

```text
E_sky_proxy = ∫hemisphere L_sky(ω) * max(ω.y, 0) dω
E_ground_proxy = authoredGroundColor / look-dependent bound
```

Approximate the integral using deterministic fixed quadrature of the physical sky **at look update**, or derive a validated analytic/current-sky proxy if direct GPU LUT data isn't accessible without readback. Do not perform a synchronous GPU readback every frame. Avoid a high-cost CPU sky ray marcher on every frame. Cache by scene/light state and update once per meaningful look/key change.

**Keep the authored ground-colour component** (sky/ground `HemisphereLight`). When PR F/G adds SH probes, it can consume the physical environment source without adding a second sun or replacing current materials haphazardly.

### 7.4 PMREM / dynamic IBL publication strategy

Initial goal: give standard/metallic surfaces a coherent sky reflection while retaining reliable fallback.

**Strong recommendation:** start with a low-resolution equirect sky/environment product baked at explicit/meaningful light-state points. Use the public Three.js environment-generation path available in the **installed** version. If time-sliced PMREM filtering requires private methods, **do not** lift [P5] private hooks merely to reduce frame spikes; instead:

1. Prove a supported public PMREM path and its actual GPU cost.
2. Use a bounded update cadence and queue, not an update per animated clock tick.
3. Precompile and warm up all involved shader passes before the first publication.
4. Build into a *back* texture/environment target; leave the *front* displayed environment valid.
5. Publish **only** after all expected targets/filters are complete; mark a monotonically increasing generation ID.
6. Discard superseded generations when weather/sun changes while a bake is running.
7. Use a bounded cross-fade between **finished** reflection sources only if supported without exceeding shader texture limits, otherwise switch at a low-visibility/controlled transition after checking the visual pop.
8. Keep the old static HDR source ready until first valid dynamic product is published; on GPU failure revert.
9. Do not discard the HDR immediately because a physical sky LUT compiled successfully. Sky and IBL have different readiness and lifetime.

Ponlai [P4] found that per-material sampling two PMREMs could push past a 16-texture portable limit, so it **blends filtered environments into one atlas**. Adapt the bounded-sampler **principle** if necessary; do not duplicate per-material IBL sampler graphs.

**Reflection direction quality gate:** rotating sun azimuth by ~90° should rotate the bright direction in visible sky and environment reflections coherently. If the dynamic IBL only adjusts average tint while retaining the old HDR's sun hotspot, call it **static HDR fallback**, not coherent dynamic sky IBL.

### 7.5 Environment timing and render-loop stutter

The currently configured day cycle spans full day in ~10 minutes; weather and regional looks can change more frequently than an environment bake takes. Define separate invalidation classes:

| Change | Clear-medium LUT | Sky-view/fog LUT | Environment / PMREM | Existing lights/sky |
| --- | --- | --- | --- | --- |
| Sun azimuth only | **No** | Update orientation/uniform; bake only if required by LUT parameterization | Rate-limited | Immediate |
| Sun elevation | **No** | Update/reconstruct sky-view at bounded error/cadence | Rate-limited | Immediate |
| Moon position/phase | No (unless moon rows use same medium) | Optional tiny lunar slice | Only if materially visible | Immediate |
| Regional climate/overcast | No clear-medium rebuild by default | Look tint/overlay only | Weather-aware scheduled update | Immediate |
| Physical aerosol/ozone setting | **Yes** | Yes | Yes | Immediate only after safe product available |
| Snow-country transition | No | Authored look contribution | Scheduled if IBL needs it | Immediate |
| Fog weather density | No | Local fog overlay only | No physical clear LUT rebuild | Immediate |
| Window/DPR resize | No | Sky targets remain fixed; camera uniform/projection update | No (unless screen-dependent bake explicitly required) | Immediate |
| Camera X/Z / floating-origin snap | No | No | No | Existing uniforms only |
| Camera altitude change | No | Update altitude projection if above tolerance | Only if visible change justified | Immediate |
| New world/import | Keep medium if same; invalidate source generation | Re-evaluate altitude/look | Safe rebuild/publication | Immediate |
| GPU device loss | Discard all | Discard all | Keep static HDR source for reload if available | Recovery path |

Do not use an exact float-array string key that changes every frame and triggers all bakes. Parameter quantization/cadence must be chosen from perceptual error measured at the horizon/sunset, not arbitrary 5° jumps which will create twilight popping. The shader can interpolate between two valid sky rows or simply evaluate the physical LUT at continuous angles, depending on chosen topology.

## 8. Atmospheric perspective and fog: replace overlaps, don't stack them

### 8.1 Why the naive integration is wrong

[D3] currently uses:

```text
existingMaterialFog = max(
  FogExp2(density),
  exponentialHeightAerialFog(distance, rise, weather)
)

fogColor = sunHazeColor(
  scene.fog.color,
  sunDirection,
  look.sunGlowColor,
  directionalSettings
)
```

For [P1] physical air the correct radiance relationship is **per channel**:

```text
C_out = T_rgb(x→camera) * C_scene + L_inScatter_rgb(x→camera)
```

Simply placing a physical haze overlay on top of [D3] will **double attenuate** scenery and often produce a pale band around the distant mountain where fog/sky should join. It is also wrong to treat physically generated `T_rgb` as a scalar alpha without documenting the approximation.

### 8.2 Proposed medium layering contract

Model air as **two distinct media** conceptually:

- **Clear atmosphere**: Rayleigh/Mie/ozone, physically derived, near-transparent at typical walking distance and increasingly relevant at distant elevations.
- **Local weather fog/mist**: [D6, D10] storm, valley, snow whiteout, bog etc, still owned by existing scene fog and material effects.

A compositing order consistent with radiative transfer should be defined and unit-tested. Approximation:

```text
C_clear = T_clear * C_scene + S_clear
C_weather = T_weather * C_clear + (1 - T_weather) * weatherFogColor
```

If the current `scene.fogNode` contract only supports a **scalar** fog interpolation, the implementation may use a **single effective scalar optical factor and physically derived fog colour** in its existing `SunHazeFog` owner — but must label the result **RGB-scattering-inspired approximation** and prove it doesn't produce wrong spectral colours or double apply haze. **Do not claim full spectral/3-channel physical aerial compositing on such a branch**.

If exact per-channel aerial composition requires a depth-driven full-screen pass, integrate only after assessing [D15] the **two rendering paths** and water/refraction/depth contracts. This may justify a tightly scoped architectural prerequisite rather than a second screen pass only in the post-processing graph.

### 8.3 Practical PR E policy

Recommended first validated implementation:

1. Add a physical-mode branch in [D3] `SunHazeFog` under the same `scene.fogNode` owner.
2. Replace its **clear-air sun/away colour and far aerial factor** with LUT-informed (or analytically equivalent) aerosol/Rayleigh colour and optical depth; **don't** multiply a new second clear-air fog over the existing.
3. Leave weather/storm `FogExp2` and local mist as the current higher-priority weather layer, composed through the owner with measured semantics.
4. When underwater active fog differs from the sky fog, **disable physical clear-air fog** exactly as [D3] currently disables its sun/aerial effects. Underwater optical absorption remains [D13].
5. Use the same clear-sky reference radiance for the far-terrain fade/horizon. Audit [D11] macro-far shading, including active far-distance range and its fog option.
6. Confirm camera-following sky dome and distant land approach the same chromatic horizon at matching sight directions.
7. Verify that volumetric god-rays [D14] have not also inserted a full second aerosol extinction field. Its local height fog is a scattering effect; it can be retained if composition is physically/visually separated and evidenced.
8. The moon/overcast/night weather glow must stay plausible; air cannot become bright cyan because the clear noon atmosphere LUT is applied without night light energy.
9. Keep lightning impulse and cloud storms as short-lived light/medium changes; never rebake static scattering coefficients just because lightning flashed.

### 8.4 Distant terrain and depth composition tests

Use [D11] macro-far at **at least** 2 km, 15 km, 40 km and ~90 km perspective cases where geometry exists. View against sky facing sun and 180° away. Test from low coastline, hills and editor fly altitude, including white glaciers. Required:

- No single-pixel colour seam on horizon after tone mapping.
- No “white curtain” that hides mountains at 1–2 km when configured aerial distance is 2.2 km under previous look without explicit art approval.
- Weather visibility targets in [D25] `stormAirLook` still hold for rain/snow.
- Far-terrain update/rebase doesn't cause a haze jump due to world-origin error.
- No secondary horizon stripe from physically treating every negative view altitude as underground.
- Ocean sea horizon, foam/refraction and sky reflections remain aligned.
- No physically scattering the night stars into a bright false blue dome.

## 9. Night, weather, ocean and snow continuity

### 9.1 Day-to-night

At the current code [D8], day/night phase can animate smoothly and [D6] resolves `nightness` continuously. A physically-based **daylight** scattering LUT may become nearly black as sun goes below horizon; that does not mean the sky should “turn off” on one frame. Use a smooth physically-derived twilight signal **plus** existing authored moon/stars/ambient.

- Preserve day/night/dusk ratios from [D21] reference captures.
- Keep moon and stars at existing positions/deterministic seeds; no new star atlas.
- Avoid hard Boolean switching at `nightness=0.5`.
- The *sun's direct light* must fall with solar elevation; the *sky's twilight afterglow* can remain visible after the sun disk sets.
- Moonlit horizon cannot inadvertently inherit 11-unit daylight radiance simply because the same static LUT is sampled with moon direction.
- Do not add an arbitrary zero-luma clamp that changes PR C's exposure target at dusk.
- PR D's Purkinje input/reference proxy may be **improved** by the physical open-light adapter, but it cannot read prior auto exposure.

### 9.2 Weather and clouds

[D1/D17] already offer cloud density, shadows, rim light, silver lining, whiteout and lightning. [P2/P3] have different clouds and weather tables; **do not transplant them**.

Correct relationship:

```text
physicalClearSky + authoredCloudVisibility/light + authoredWeatherFog
  -> one visible sky
  -> matching direct/hemisphere/environment state
```

In an overcast sky, cloud deck radiance is not just clear sky multiplied by a low scalar; however E may initially retain the existing authored cloud-core/edge lights instead of inventing a physical cloud irradiance model. Track this as a known residual mismatch for PR H; don't deceptively call it physically accurate cloud multiple scattering.

When `look.whiteout` increases during snowstorm, stars/sun should vanish per current look even if physical clear sky behind remains bright.

### 9.3 Water and coast

Drusniel's water has complex surf, reflection, foam and wetness improvements. Its [D5] `skyLightUniforms` currently drive brightness/reflectionTint/sunColor **relative** to configured look; do not casually change these uniforms from ratios to absolute lux. Provide an adapter that reproduces the original values when physical mode disabled.

Ocean reflection QA must compare:

- clear noon sky and bright glint;
- low sun golden-hour shimmer;
- sunset with reddish sun and blue-pink cloud horizon;
- overcast blue-grey sea;
- moonlit dark water;
- shallow turquoise, white foam and underwater scene transitions.

A physically credible sky is not a licence to recolour the ocean body or alter existing coastal foam algorithms. No FFT ocean work in E.

### 9.4 Snow/alpine

[D9] intentionally stops snow-country exposure down to reveal texture and keeps cold powder highlights. Physical sky light may over-blue snow shadows if it is multiplied with existing `snowLightUniforms` tint and current `skyAmbientColor`. Test three independently:

1. White snowfield and dark tree in clear midday: retained texture/headroom.
2. Snow at sunset: warm sunlight, cool shadow, no unintended magenta/cyan.
3. Snowstorm/night: still dark/whiteout as authored, no exposure compensation cancellation.

Do **not** “repair” blown out snow by changing all post tone curves or adding local tone by default. Fix the atmosphere-unit mapping or double application at the source.

### 9.5 Regional sky diversity

The physical clear-air medium can be reused worldwide, but **look adaptation** must preserve regional character: humid rainforest, dry desert, windy coast, bog, taiga, glacier and imported Astalor backgrounds. A single global aerosol coefficient is physically plausible as a baseline but may flatten climate differences. Model an **authored bounded weather/region medium multiplier**, updated from [D6] regional climate. A physical aerosol **medium** change requires careful LUT invalidation and rate limiting; do not rebake for every metre traveled across a streaming boundary. Smooth/bucket the parameter with the existing `SkyLookController` transition times.

## 10. YAML configuration — one owner, no duplicate registry

PR E controls sky and environment **not** a post-processing effect; per PR A ownership, use existing `editor.config.yaml → stylizedSurface.sky`, with small normalized optional block. Do **not** put the same physical atmosphere settings in `config/render-enhancements.yaml` and don't create a second `SkySettingsStore`.

### 10.1 Proposed disabled-by-default authoring values

These are **starting proposals** to be calibrated, not measured successful settings:

```yaml
stylizedSurface:
  sky:
    atmosphere:
      mode: stylized          # stylized | physical
      quality: balanced        # balanced | high | ultra
      optical:
        rayleighScale: 1.0
        mieScale: 1.0
        mieAnisotropy: 0.76
        ozoneScale: 1.0
        atmosphereTopKm: 100
      lighting:
        preserveAuthoredEnergy: true
        skyInfluence: 0.65
        sunInfluence: 0.65
        environmentMode: dynamic-with-static-fallback
        environmentUpdateAngleDegrees: 2
        environmentMinIntervalSeconds: 2.0
        environmentTransitionSeconds: 1.5
      aerial:
        enabled: true
        strength: 0.7
        maxDistanceMeters: 90000
        preserveWeatherFog: true
```

**Do not ship these exact numbers as calibrated.** Some values intentionally overlap existing look controls only as a proposed mapping; the implementer should trim the schema to the few options with real product value and keep internal tunables in constants. For example, if the atmosphere radius is a code-level physical-model assumption and not a user-facing option, move it to `AtmosphereConstants.js` rather than expanding YAML.

**Important:** existing `sky.environment.url/intensity` must continue to define the static fallback, including its CC0 source and intensity. Don't silently rewrite or delete it.

### 10.2 Settings schema rules

- `mode` strict enum, defaults to `stylized`.
- `quality` controls compile-time LUT sizes and supported format/capability; topology change.
- Optical scales finite, positive and bounded; anisotropy must satisfy `|g|<1`.
- Height/radius parameters consistent, atmosphereTopKm > ground.
- Environment rebuild interval must be >0, angle ≥0, transitions bounded.
- Physical atmosphere unsupported on device → explicit stylized fallback, log once.
- Normalization follows existing `editor.config.yaml` + [D26] config-validation conventions; avoid a duplicate YAML parser.
- **Runtime** changes to sun direction, storm weight and current sky look do **not** mutate the YAML object.
- Invalid schema should produce context-rich validation error, not a NaN shader uniform.
- Mobile force/quality paths remain safe; do not precompile all ultra shaders on mobile.
- New world save loading with missing `sky.atmosphere` should take stylized default and match old pixels.
- Numeric authoring changes trigger the minimal necessary LUT invalidation; ordinary day/night key movement never triggers full static medium rebuild.

### 10.3 Compile-time constants

Create one small module for fixed assumptions/quality LUT sizes:

```js
export const PHYSICAL_ATMOSPHERE_GROUND_RADIUS_KM = 6360;
export const PHYSICAL_ATMOSPHERE_TOP_RADIUS_KM = 6460;
export const RAYLEIGH_SCALE_HEIGHT_KM = 8;
export const MIE_SCALE_HEIGHT_KM = 1.2;

export const ATMOSPHERE_LUT_PROFILES = Object.freeze({
  balanced: Object.freeze({ transmittance: [192, 48], multiScatter: [32, 32], skyView: [192, 108] }),
  high: Object.freeze({ transmittance: [256, 64], multiScatter: [64, 32], skyView: [256, 128] }),
  ultra: Object.freeze({ transmittance: [256, 64], multiScatter: [128, 32], skyView: [384, 192] }),
});
```

These are *proposed* code-level constants and not actual implementation. The atmospheric planet geometry and LUT dimensions should not float around as copied magic numbers across shaders/CPU tests. Keep common source truth, including wavelength coefficients and quality values. Reevaluate after native GPU comparison, especially low-sun accuracy where Ponlai uses 192 multiple-scattering sun samples.

## 11. Code architecture and exact file-level integration

### 11.1 Recommended minimal new modules

| New path (proposed) | Ownership | Notes |
| --- | --- | --- |
| `src/editor/stylized/sky/atmosphere/AtmosphereConstants.js` | Physical coefficients, radius and quality profiles | No runtime state |
| `src/editor/stylized/sky/atmosphere/AtmosphereMath.js` | Pure CPU ray/medium/transmittance references | Testable without Three |
| `src/editor/stylized/sky/atmosphere/AtmosphereLutNodes.js` | Compact TSL LUT shaders/samplers and UV mappings | No app/UI state |
| `src/editor/stylized/sky/atmosphere/AtmosphereLutController.js` | RenderTarget + cache + warmup + generation + disposal | One owner only |
| `src/editor/stylized/sky/atmosphere/AtmosphereLighting.js` | Pure authored-look/light calibration, bounded outputs | No extra scene light |
| `src/editor/stylized/sky/atmosphere/AtmosphereEnvironment.js` | Optional dynamic environment bake/readiness/handoff/fallback | Only if PMREM integration justified |
| `src/editor/stylized/sky/atmosphere/AtmosphereDiagnostics.js` | Small read-only status, if not naturally in existing diagnostics | No per-frame readback |
| `src/editor/stylized/sky/atmosphere/AtmosphereConfig.js` | Normalization/validation of new sky schema | Integrate with current config validator |
| `test/sky/atmosphere-math.test.js` | Numerical invariants / LUT coordinate tests | CPU |
| `test/sky/atmosphere-lighting.test.js` | Authored reference/energy tests | CPU |
| `test/sky/atmosphere-lifecycle.test.js` | Generation, publication, fallback/dispose | GPU mocks |
| `docs/rendering/atmosphere-and-environment.md` | Final state/colour/ownership docs | After code lands |

**Avoid unnecessary files:** if e.g. `AtmosphereDiagnostics` is <40 lines, keep it in the owner; if a controller becomes large, split resource bake scheduling from math. Do not add a new rendering services layer. Refuse huge generic “AtmosphereManager” dependency graphs.

### 11.2 Existing modules to modify, only as needed

| Existing path | Required change | Preserve |
| --- | --- | --- |
| [D1] `StylizedSkyView.js` | Own atmosphere optional resources; choose clear-sky provider; map resolved lighting into existing scene lights, cloud/sky uniforms, fallback and dispose | One hemisphere + one directional; one sky mesh |
| [D6] `SkyLookController.js` | Expose already resolved current look to physical mapping, no duplicate clock | Region/snow/storm/overcast blend |
| [D7] `SkyLook.js` | Only needed to carry a strictly normalized optional medium state; not new preset tables | Current authored colours and transitions |
| [D3] `sunHaze.js` | Add physical clear-air branch under same fog ownership, proven compositing | Weather, underwater identity, warm/cool sun direction |
| [D4] `sceneEnvironment.js` | Safe dynamic map swap/PMREM readiness with original HDR fallback | Loaded HDR owner, errors/cleanup, reflection continuity |
| [D5] `skyLight.js` | Adapt existing relative sky/sun info from resolved state | Current unlit water/snow consumers |
| [D16] `skyAmbient.js` | Optional physically informed sky fill for hemisphere | Existing neutral/less-saturated ambient colour by default |
| [D17] `cloudLighting.js` | Only if physically informed sun colour/radiance is needed to keep cloud light consistent | Existing cloud derivative shading/rim and source code |
| [D11] `MacroFarTerrainView.js` | Only if current aerial matching fails under physical mode | Chunk-independent macro geometry/streaming |
| [D14] `StylizedGodRaysPostProcess.js` | Only if new air appears twice or needs sky light tint in alternate pipelines | Volumetric shafts, FXAA, cinematic finish |
| [D13] underwater post owner | No change unless surface/underwater transition test proves overlap | Underwater fog/caustics stay canonical |
| [D19, D20] post/output | Ideally **unchanged**; sky/material source changes propagate to both | Existing exposure/AgX/ACES, single output conversion |
| [D27] config validation | Add one sky atmosphere normalized block + limits | Existing YAML schema ownership |
| [D28] `editor.config.yaml` | Add optional disabled-by-default sky block | Current look, static HDR and all prior tuning |
| [D22] QA scripts | A/B scene + active render path + source metadata | Existing tests/performance gates |

**Do not edit** every terrain/vegetation/water material just to “add scattering” if the existing lighting/fog uniforms already provide the intended result. Where a custom unlit material bypasses `scene.fogNode`, document its current treatment and insert only the smallest compatible adapter after visual evidence.

### 11.3 Implementation ownership diagram

```text
             existing DayNightCycle + SkyLookController
                             |
                     resolved SkyLook
                             |
                       StylizedSkyView
                          (owner)
                       /           \
          physical LUT controller   existing stylized sky
              (opt-in)             (fallback, default)
                       \           /
                       AtmosphereLighting
                       (derived colour / unit adapter)
                             |
       +-----------+----------+-----------+--------------+
       |           |          |           |              |
 visible sky    existing   existing   sceneEnvironment  clear-air
 dome+clouds    directional hemisphere + PMREM fallback  fog owner
       |          |          |           |              |
       +----------+----------+-----------+--------------+
                             |
                   already-selected world render path
              (post graph OR cinematic/volumetric god rays)
                             |
                   existing exposure / tone / output
```

No second sun; no second sky/clock; no full-scene framebuffer to “fix” physical sky colour.

## 12. Resource lifecycle: startup, versioned bakes, coalescing and fallback

### 12.1 Activation

1. Read new normalized config (default `stylized`).
2. Verify renderer/TSL/float RTT capability **after** the renderer initializes; do not assume because `WebGPURenderer` was constructed.
3. Keep original sky/lighting/environment drawing during GPU shader compilation.
4. Build static atmosphere tables and first sky row into owned targets.
5. Warm up actual compiled shaders and verify targets are populated/finite with **diagnostics**, not repeated CPU readback.
6. Publish a valid physical sky/lighting state **atomically**. For visible sky versus environment readiness, decide if a temporary visually coherent mixed mode is allowed; otherwise retain whole stylized state until dynamic IBL ready.
7. Update existing lights via [D1] once, with no abrupt daylight spike. If crossfade is approved, apply the **same** progress variable to sky luminance, scene direct/ambient reference and environment intensity, within safe limits.
8. Existing `scene.environment` must remain non-null/valid for standard materials if the dynamic map is not ready.
9. On unsupported or shader failure: log once, clean all owned GPU resources, restore exact current stylized sky, fog and environment state.

### 12.2 Asynchronous generation and cancellation

Model a monotonic generation number:

```js
// Conceptual scheduling pseudocode; no assumption of these methods in current Three.
async function requestAtmosphereBake(request) {
  const generation = ++this.generation;
  this.pendingRequest = request;
  if (this.baking) return; // coalesce to newest requested state

  this.baking = true;
  try {
    while (this.pendingRequest && !this.disposed) {
      const next = this.pendingRequest;
      this.pendingRequest = null;
      const product = await this.buildIntoBackBuffer(next);
      if (this.disposed || generationIsStale(product.generation, this.generation)) {
        product.dispose();
        continue;
      }
      this.publishValidProduct(product);
    }
  } catch (error) {
    this.failClosed(error);
  } finally {
    this.baking = false;
  }
}
```

Real code must handle generation IDs correctly (a single captured `generation` outside a coalescing loop is insufficient); allocate per-request IDs, compare on publish, avoid an infinite loop on repeated unsupported shader error. State transition must be deterministic under rapid day clock/region changes.

**Do not use wall-clock timers as a render dependency.** If the renderer needs per-frame pass budgeting, use the existing render loop's frame-state; timers are only a fallback for cancellation/resume if justified and tested. The `SkyBake` upstream timer pattern is a reference, not a design requirement.

### 12.3 Texture resource rules

- Bound 2D target dimensions and formats, mark linear data `NoColorSpace`.
- Explicitly clear/initialise targets; no sampling unallocated textures.
- Release material, quad, RTT, PMREM and loader resources idempotently.
- Track references to front/back valid products; do not dispose an environment still bound to `scene.environment`.
- If generation is superseded, release only its privately owned back buffers; leave displayed front data valid.
- On scene unload, device loss or renderer change, increment generation and ignore stale async completions.
- On cache reuse, check source medium/quality format and renderer/backend identity.
- Return a real failure status; don't hide a black LUT by substituting zero and reporting “physical active”.
- Never fetch untrusted assets or ship Ponlai's proprietary/unknown image textures just because the sky uses them.
- Disabled mode should load **none** of the physical LUT code eagerly into shader pipelines, if current module system allows lazy construction.

### 12.4 Shader compilation readiness

[P4] found that drawing into a bake target before asynchronous shader compilation completed resulted in a **valid-looking but empty** texture. Ensure this cannot happen:

- Before first bakes, wait for actual renderer/node pipeline warmup and required resources.
- Run a *small controlled shader-ready validation* on native WebGPU (e.g. check backend compilation error and finite output / debug sample once), not a gameplay per-frame GPU stall.
- Explicit scene jumps/QA captures must settle/finish the current requested bake before screenshot.
- If no frames advance (paused clock, screenshot harness), an explicit QA “settle atmosphere” action must complete deterministic generation without requiring a sleep that races with shader compile.
- Never claim deterministic image A/A while the environment bake generation is still pending.

## 13. Tests: numerical reference and shader parity

### 13.1 Pure math tests

Write unit tests for:

1. `radiusKm=R_ground+hKm`, including sea-level conversion, clamping, positive altitude and impossible negative heights.
2. Stability of sphere intersection using `(r-R)(r+R)` near planet ground in float32 reference.
3. Ray to top-atmosphere hit valid/invalid, tangent, up, down, horizon and exactly horizontal.
4. `rho_R(0)=1`, decreases with altitude; `rho_M` decreases faster.
5. Ozone triangular/layer profile finite and zero outside layer.
6. `T=1` for zero-extinction medium.
7. `0≤T≤1` per RGB channel for physically nonnegative medium and valid ray.
8. Optical depth increases with distance; transmittance never increases in a homogeneous forward ray.
9. More aerosols reduce direct solar transmission for a fixed view/path.
10. Mie phase is finite for `cosTheta=-1,0,1` and bounded `|g|<1`.
11. Normalization/integral of chosen phase function consistent with definition.
12. Rayleigh sky at clear noon trends blue-ish relative to horizon, at sunset direct transmittance tends to redden (qualitative/curve checks, not hardcoded screenshot colour).
13. LUT UV↔parameter round-trip, including texel centres and horizon branch.
14. Ground and sky halves never bilinearly leak across their boundary.
15. Temporal key interpolation finite/smooth across sun elevation zero and twilight.
16. Normalised RGB-to-authored key mapping doesn't create runaway energy or double exposure.
17. Sky look physical mode disabled yields exactly original values for [D16] `skyAmbientColor` and [D5] sky/unlit adapters.
18. Region/weather transitions keep `nightness` and snow exposure/art direction continuous.
19. No use of canonical X/Z world coords in atmosphere ray path.
20. Repeated same inputs produce same source-key and numerical output independent of wall clock.

### 13.2 GPU LUT validation

Build a dedicated, independent small synthetic GPU QA fixture:

- Compare transmittance output against CPU quadrature for a finite set of rays at 0 m, 1 km, 5 km and 20 km, and sun/view angles near horizon/tangent.
- Use numeric error bounds appropriate to float16/float32 and sample count, after reading **QA-only** small target values asynchronously.
- Test all emitted formats on native WebGPU: no WebGPU validation errors, storage/render usage supported, no uninitialized target.
- Check clear sky across 360° azimuth at 0°, 2°, 12°, noon and -6° twilight; look for discontinuous 2D slices.
- Test multi-scatter nonnegative, bounded and no extreme high-albedo feedback.
- LUT rebuild count: atmosphere medium unchanged + sun azimuth rotating = zero *static* rebuilds.
- Camera X/Z move and floating-origin rebase = zero atmosphere rebuilds; same visible result.
- Camera altitude moves within threshold = expected sky sample update, not full static rebuild.
- Device loss/dispose while bake pending = no stale GPU uses or target publication.
- No black reflection/sky flash on first frame, preset switch, paused screenshot and quick weather changes.

### 13.3 Lighting consistency synthetic tests

Create a controlled scene with:

- 18%-grey ground, 90%-white wall, neutral matte sphere.
- White rough sphere, black glossy metal, polished stone, water plane.
- One directional source and a hemisphere (same as current sky rig).
- A visible sky with no cloud, fixed sun angle.

Assertions:

- Directional sun hue follows physical attenuated sun trend as it lowers.
- Direct light and visible sun point in the **same** direction.
- Hemisphere sky is paler/less saturated than pure zenith when appropriate; no blue-black surfaces from saturated highColour.
- Grey surface remains nearly neutral under clear noon.
- Metal reflects **something** before and after dynamic IBL publication.
- Sun azimuth rotation changes environment specular peak in expected direction, if dynamic IBL is selected.
- No large sudden diffuse/specular jump on environment-source swap.
- When physical mode off, existing HDR and light values match pre-PR baseline.
- HDR pre-tone output remains finite, no NaNs reaching histogram/bloom/AgX.

## 14. Existing scene QA matrix and acceptance

Use [D21] `scripts/fixtures/environment-look-shots.json` **actual existing IDs**:

| Real fixture ID | Physical / artistic check |
| --- | --- |
| `grassland-off-12` | Clear noon sky shape, sun direction and light level |
| `forest-off-12` | Tree/understory ambient, no slate-blue shadows |
| `forest-air-off-12` | Horizon gradient, cloud edges, sky/main-geometry border |
| `coast-off-12` | Sea-horizon, glint colour, foam, sky reflection consistency |
| `core-rainforest-off-12` | Dense canopy and soft ambient, stable look |
| `wetland-rain-12` | Muddy-water/bog grey atmosphere under rain |
| `coast-storm-12` | Directional sky/overcast, far sea, storm visibility |
| `forest-off-18.6` | Sunset colour and visible atmospheric path |
| `forest-off-21` | Moonlit night remains dark, no false blue floor |
| `town-off-21` | Warm lamps/stone and reflection fallback |
| `town-rain-19` | Wet evening material reflections, sky and street coherence |
| `core-taiga-snow-12` | Sunlit snow and dark trunk shade, blue tint intact |
| `glacier-off-12` | Pale physical winter sky, bright snow texture headroom |
| `snow-eye-off-12` | Snow-country exposure/sky compensation preserved |
| `tundra-off-12` | Large cold skyline, clear sun vs cold fill |
| `desert-off-12` | Low aerosol/light warmth and shadow depth |
| `core-wetland-off-12` | Region-specific damp haze remains |
| `forest-storm-12` | Rain darkness survives rather than equalized |

Also add **synthetic fixed sun-angle cases** outside the existing screenshot IDs:

- **Noon** (elevation 60°), **high** (30°), **low** (12°), **sunset** (2°, 0°, -2°), **twilight** (-6°, -10°).
- Face **toward**, 90° across and **away** from sun.
- Clear/overcast/rain/snow weather.
- Ground/camera altitude 2 m, 100 m, 1 km and 5 km where test environment permits.
- Camera X/Z across >1 million canonical metres and at a floating-origin rebase.
- 16:9, 21:9 and DPR change.
- Both post-processing and cinematic/volumetric god-rays renderer routes.
- Direct/fallback / no atmosphere enabled.
- Pause/seek day clock; quick preset/region change and rapid return.

**Never silently change the source fixture or loosen existing thresholds** to make new atmosphere capture look “passed.”

### 14.1 A/B screenshot review protocol

1. Pin source SHA, seed/world, fixture ID, camera pose, biome, resolved look, sky hour, weather, active render path, hardware backend and viewport size.
2. Baseline **A:** stylized atmosphere (current main).
3. Candidate **B:** physically based atmosphere, same camera/time/weather and fixed manual or PR C exposure state.
4. Candidate submodes to isolate cause: physical sky only, physical sky + sun, + hemisphere, + dynamic IBL, + aerial fog, then complete.
5. Run **A/A** noise envelope first (PR B if implemented), then **A/B/A/B** identical runs.
6. Save full frame and crops: sky horizon/zenith, clouds, mountain edge, snow, shade, sea/reflection, polished metal.
7. Record distribution of HDR luminance, exposed value, sky/ground colour, direct/ambient energy, and environment generation/age.
8. Review time series at twilight, cloud transition, camera turn and origin rebase; still captures alone won't show popping.
9. Compare on at least one god-rays cinematic route and one post route. [D15] selects one before the other.
10. Record every unknown condition as **not tested**, never passed.

### 14.2 Perceptual-quality quantitative gates

The numbers must be **calibrated against A/A baseline and art review**, not invented as universal physical truth:

- **Horizon seam error:** maximum luminance/chroma discontinuity across far-terrain/sky boundary in stable matched directions.
- **Sky banding:** discrete gradient steps in monotonic clear sky / D65 slope; evaluate histogram/finite-difference stripes.
- **Sun-facing contrast:** toward-vs-away sky chroma/luminance trends across elevations.
- **Sun source consistency:** angular difference between visible disc and actual directional key at 0°/sunset.
- **Reflection direction:** visible environmental highlight vs sun heading.
- **Exposure stability:** EV target/current difference and over/underflow if PR C implemented; cannot “solve” sky by an uncontrolled exposure jump.
- **Detail retention:** snow, rock and textured cloud edges remain identifiable after atmosphere.
- **Fog visibility:** distant mountain profiles across 2/15/40/90 km; current rain/snow visibility targets retained.
- **World stability:** same sky output before/after rebase and at two canonical camera X/Z positions with equivalent altitude/time/weather.
- **Sunlight colour:** low sun reddening without green/magenta artifacts from an ill-conditioned RGB-band conversion.
- **Fallback lighting:** no frame with zero/black standard material environment due to missing published IBL.

## 15. Performance budget, shader scheduling and device tiers

### 15.1 No fake performance claims

Existing [D22] `docs/perf-qa.md` is authoritative. [D29] `GpuPassProfiler` samples native render-pass timestamps and may not include all compute or PMREM activity. Measure:

- Timestamp **off**: actual frame pacing, CPU submit, p95/p99 and hitches, chunk traversal.
- Timestamp **on**: actual supported GPU pass numbers; explain if a LUT, PMREM conversion or fragment fusion was not captured by a named pass.
- Shader precompile startup cost, first physical activation, first valid environment publication and worst horizon sunset update.
- Number of passes and pixel throughput for static LUT, sky-view LUT, environment source and PMREM filtering.
- Worst-case **burst** cost when changing atmosphere medium or opening a saved scene.
- Warm-up and disposed target memory, including cached quality tiers.
- Desktop and mobile/fallback device reporting, with a real WebGPU adapter ID/status.

**Suggested provisional targets** (design targets, not measured facts):

| Case | Objective | Gate |
| --- | --- | --- |
| Physical mode disabled | No new LUT allocations/passes | Hard requirement |
| Static medium, continuous time | Static transmittance/multiScatter **not** rebaked | Hard requirement |
| Sky pixel path | ≤0.5 ms p95 incremental desktop **if measured** | Aspirational; overall frame budget still authoritative |
| Sky-view LUT update | Prefer ≤1 ms amortized p95 when animating time | Aspirational, capture bursts separately |
| Medium/PMREM rebake | Spread/bound updates and avoid player hitches | Hard outcome; don't invent a pass cost |
| IBL publication | Zero blank/black frames and no invalid sampler | Hard requirement |
| Mobile | Stylized by default, no physical shader/PMREM eager work | Hard requirement |
| Native high-quality desktop | No deterioration in project's player p95/hitch/streaming recovery limits | Hard requirement |
| During travel/rebase | No LUT update purely from world X/Z | Hard requirement |
| Resource lifecycle | Bounded GPU allocations and no leaked retained environment | Hard requirement |

The user may accept higher GPU cost for demonstrably better images, but **performance needs measurement**. Compare balanced/high/ultra with matching captures and actual GPU timings before keeping extra quality tiers.

### 15.2 Bounded staging instead of new global scheduler

The atmosphere does not need a general-purpose task scheduler. Use one owner with small explicit transitions:

```text
idle
 -> compile/warm
 -> static-medium LUTs valid
 -> sky-view candidate valid
 -> environment candidate ready
 -> publish physical state
 -> idle / queued update / fallback
```

Static medium changes are rare; real-time sun changes should be uniform/LUT-slice updates rather than atmosphere rebuilds. If PMREM filtering spikes in the current Three.js version, decide between less frequent full bakes, lower resolution or a separately approved incremental implementation using **public supported API**. Do not introduce a dependency on private internals just because Ponlai uses [P5].

### 15.3 Rendering backend compatibility

- Verify actual installed Three.js package and current TSL exports rather than trusting version comments.
- Test renderer initialization before compiling GPU materials.
- If half-float colour render targets or PMREM operations are unsupported, fall back **explicitly** to stylized/stock HDR.
- Don't let device fallback allocate physical tables that can never render.
- Do not require a new MRT channel or per-material `material.mrtNode`; [D30] current post docs expressly warn about that pattern.
- Do not touch the cloud shadow system's canonical coordinate wrap just to adapt atmosphere to large-world scale.
- No per-frame CPU/GPU synchronization.
- No GitHub Actions.

## 16. Detailed implementation sequence

### E.0 — Reinspect latest source and preflight

- [ ] Read current `AGENTS.md`, branch head, last commits, changed sky/post/water/fog/config code.
- [ ] Confirm A/B QA implementation exists; verify C/D code if actually implemented, not merely their Markdown plans.
- [ ] Capture current same-source baseline for clear noon/sunset/forest/snow/coast/night on **actual selected player path**.
- [ ] Verify Three.js resolved revision/TSL features and GPU backend; no forced downgrade to Ponlai's r186.
- [ ] Create a one-page ownership map of scene sky, one sun, hemisphere, fog, HDR environment and active render path.
- [ ] Read [P1/P4/P5/P6/P10] upstream files and licence headers, log precise provenance.

**Stop:** If baseline renderer output or HDR environment is broken, don't attribute subsequent screenshots to atmosphere improvements.

### E.1 — Pure physical model, reference measurements and unit contract

- [ ] Add `AtmosphereConstants.js` and `AtmosphereMath.js` CPU reference.
- [ ] Implement stable ray/sphere and optical depth integrals with unit conversion and horizon tests.
- [ ] Define clear physical medium, normalized atmosphere radiance, sunlight colour and sky-hemisphere reference.
- [ ] Implement bounded `AtmosphereLighting` adapter anchored to current authored look; no new light.
- [ ] Add pure tests for daylight/twilight/night, altitude and no-physical mode.
- [ ] Establish a paper/reference comparison of transmittance and horizon colours at fixed synthetic poses.

**Stop:** If the model requires changing the canonical world geometry or produces nonfinite transmittance/horizon sample.

### E.2 — GPU transmittance/multiple-scattering/sky LUT

- [ ] Prototype on current Three TSL with selected fixed dimensions/formats; no upstream private FrameGraph.
- [ ] Build transmittance and multi-scatter targets only once per **medium** version.
- [ ] Build sky-view or horizon-aware cut rows per sun/altitude source version.
- [ ] Prove read/write ordering and shader compilation without extra world render.
- [ ] Use a debug LUT visualizer and small QA-only asynchronous readback to compare CPU reference.
- [ ] Verify no texture filtering across ground/sky horizon halves.
- [ ] Verify body azimuth orientation, cloud-free gradient and low-sun continuity.

**Stop:** On GPU validation errors, unproven render target format, horizon NaNs or rebuilding static tables every animation frame.

### E.3 — Controlled sky-dome integration

- [ ] Within [D1] preserve current cloud/mist/stars/moon mechanics.
- [ ] Replace authored **clear-sky base** with opt-in LUT in the same sky dome material or a tiny compatible provider.
- [ ] Apply only one visible sun disc and correct atmospheric transmission, preserving size/softness.
- [ ] Prevent current `sunHazeColor` and LUT from double-adding the sun aureole.
- [ ] Preserve `exposureCompensation` and [D9] snow-country relative look.
- [ ] Test sky from coast, forest, snow, sunset and dark night.
- [ ] Verify disabled mode original shader graph/pixels exactly.

**Stop:** If an environment/light renderer now draws two sky domes, sun discs or changes the active output conversion.

### E.4 — Sun, hemisphere, unlit and cloud lighting consistency

- [ ] Feed resolved light via [D1] existing `DirectionalLight` and `HemisphereLight`; never add a second key.
- [ ] Keep [D2] shadow direction anchored to the same visible sun vector.
- [ ] Adapt [D5] water/mist `skyLightUniforms` through existing relative contracts; don't change their consumer units.
- [ ] Refine [D16] hemisphere sky fill from physical sky but retain authored saturation limits.
- [ ] Do not double apply physical sunlight tint to [D17] cloud rims and current warm haze.
- [ ] Test standard stone/armour, terrain, grass, water, snow and cloud edges in one scene.

**Stop:** If metallic objects go black, shadow direction differs from disk, snow whites clip, or sunlight becomes strongly over-warm from two colour multipliers.

### E.5 — Dynamic reflection environment and fallback

- [ ] Prototype a publicly supported Three.js PMREM generation route at one small resolution.
- [ ] Warm up shaders; create a valid environment source and filtered product before publishing.
- [ ] Keep CC0 static HDR while the first candidate builds or errors.
- [ ] Add generation-guarded, coalesced rebake scheduling for sun/sky/weather and a bounded update cadence.
- [ ] Validate reflection direction, roughness levels, sampler resource count, material compatibility and fallback.
- [ ] Crossfade only finished IBL outputs if safe; otherwise controlled atomic swap with acceptable visual continuity.
- [ ] Verify quick preset seek and paused screenshot determinism.
- [ ] Dispose/invalidate stale targets on device loss, world unload or render-path replacement.

**Stop:** If PMREM requires unstable private APIs or repeated whole-frame hitches. Do not silently call it “dynamic IBL” when it remains the old HDR.

### E.6 — Clear-air aerial perspective and fog owner reconciliation

- [ ] Audit material fog support in terrain, foliage, sky, far terrain, water, particles and alternate god-rays pipelines.
- [ ] Add physical clear-air LUT/haze branch in [D3], **replacing** duplicate clear-air directional haze.
- [ ] Keep local storm/rain/snow/valley fog and underwater precedence intact.
- [ ] If only scalar fog is supported, label approximation and QA spectral/horizon difference.
- [ ] Match [D11] far-terrain sky colour and height profile without new chunk streamer work.
- [ ] Test world origin snaps, day/night, coast and waterline crossing.
- [ ] Capture explicit 2–90 km near-to-far panorama matrix.

**Stop:** If far terrain gets two fog applications, if water/underwater shifts abruptly, or if one active render route has a different whole-screen aerosol overlay.

### E.7 — Full optical/lighting regression and production hardening

- [ ] Add CPU math tests and GPU LUT fixture.
- [ ] Run existing look, post, far-terrain, water, snow and perf tests.
- [ ] Capture actual source-pinned A/A and A/B/A/B screenshots/contact sheet in daylight, dusk, night, coast, snow and storm.
- [ ] Run full day cycle/time seek with environment generation telemetry and no frame-time spikes.
- [ ] Profile the skyline and full camera frame on native hardware and record pass scope.
- [ ] Confirm no changes to Azgaar biome IDs, world save format, terrain mesh/LOD/streaming rules.
- [ ] Document the remaining physical approximations and link back to Ponlai code/PDF references.

### E.8 — Review, commit, rollback

- [ ] Re-read `main` before writing and patch only current owners; preserve newer commits.
- [ ] Small source files, no generic render framework, no duplicate configs, no new package unless justified.
- [ ] Record provenance at exact Ponlai commit and upstream file headers, including tidewater MIT where relevant.
- [ ] Commit implementation and tests to `main` only when enough validation exists, without GitHub Actions.
- [ ] Keep `atmosphere.mode: stylized` as the fast rollback. If shaders corrupt the graph, revert only E-specific code and leave earlier PRs intact.

Suggested **future code** commit title:

```text
feat(sky): add opt-in physical atmosphere and coherent environment lighting
```

This documentation commit is **not** that code implementation.

## 17. Expected validation commands and evidence

These are **existing command families** as of the inspected repo, not a claim of execution:

```bash
git status --short
git branch --show-current
git log -15 --oneline

npm test
npm run lint
npm run build
npm run verify

# Existing visual/renderer QA; check dev server and real hardware requirements:
npm run qa:postprocessing
npm run qa:postprocessing:browser -- --headed

# Authoritative player movement + streaming impact:
npm run qa:perf -- --headed --qa chunk-cross \
  --warmup 8 --duration 12 --settle --drain-seconds 15 \
  --gpuTimings 0 --out tmp/ponlai-pr-e/chunk-cross-pacing.json

npm run qa:perf -- --headed --qa chunk-cross \
  --warmup 8 --duration 12 --settle --drain-seconds 15 \
  --gpuTimings 1 --out tmp/ponlai-pr-e/chunk-cross-gpu.json
```

Use the project-specific `qa:look` command and current script flags for `scripts/fixtures/environment-look-shots.json`. If PR B installed a new deterministic screenshot CLI, run it; **don't claim the planned command exists without checking**.

Evidence to retain under `tmp/ponlai-pr-e/` or other non-committed report directory:

- `baseline.json`: SHA, adapter/backend/viewport, source fixture, sky/look/weather/quality, exposure, active route.
- `lut-math.json`: numeric CPU/GPU transmittance test table and tolerance decisions.
- `scene-a-b.json`: per-pose brightness, chroma, halo, environment generation, direct/ambient/fog stats.
- `timings.json`: timestamp-off pacing, timestamp-on sampled GPU, **separate** medium rebuild/PMREM burst duration.
- `screenshots/` and contact sheets: old/physical sky, light, dynamic env, fog, combined, plus close-up crops.
- `render-paths.json`: ordinary PP vs cinematic/volumetric god rays and fallback evidence.
- `known-approximations.md`: scalar fog vs RGB, uncalibrated physical units, cloud scattering limitations, any missing hardware case.
- Source provenance and licence notes.

Don't commit large screenshots/GPU binaries unless review explicitly requests them.

## 18. Definition of done — strict acceptance criteria

### Behaviour

- [ ] Real, unit-tested Rayleigh/Mie/ozone transmittance with multiple scattering approximation.
- [ ] Horizon and sun-azimuth/day-night behaviour continuous, no LUT slice seams.
- [ ] Physical clear sky behind existing clouds with **one** sun disk.
- [ ] Existing stars, moon, cloud shadow, weather, lightning, regional look and snow style preserved.
- [ ] Direct, hemisphere and environment reflect the same resolved sky colour/direction **without new scene lights**.
- [ ] Dynamic environment is actually dynamic and safe, or unsupported phase explicitly marked **pending** (not falsely complete).
- [ ] No metallic black frames during IBL rebuilds, no outdated HDR sun hotspot while claiming dynamic sky IBL.
- [ ] Aerial haze uses one owner; no double fog or failed underwater override.
- [ ] Far mountain/sea horizons meet physical sky naturally under every tested active render route.
- [ ] No screen-sRGB scattering, doubled exposure, additional tone curve or duplicated god-rays.
- [ ] Changing only world X/Z or rebasing origin cannot rebake the LUT or change appearance.
- [ ] Current stylized mode remains original output.

### Engineering

- [ ] Static medium LUT only updates when medium changes, not every time/camera frame.
- [ ] All GPU shaders compile on current resolved Three.js and native WebGPU with proper read/write order.
- [ ] No private PMREM internals without separately approved version-pinned decision.
- [ ] Bounded LUT/PMREM formats, allocations, timer-free update ownership and idempotent disposal.
- [ ] Async generation cannot publish a stale/broken/black candidate.
- [ ] No per-frame GPU readback/sync; QA-only readback opt-in and asynchronous.
- [ ] YAML schema validated, default stylized, mobile/fallback safe.
- [ ] No new terrain streaming, world data migration, per-material MRT override or generic renderer framework.
- [ ] No GitHub Actions, no force-push or branch/worktree divergence.

### Validation

- [ ] All pure numerical unit tests pass and GPU agrees within documented tolerances.
- [ ] Existing clear sky, forest, coast, snow, far terrain, night and storm semantics reviewed.
- [ ] Cross-path player screenshots and daylight/sunset/night timelines checked.
- [ ] A/A and A/B/A/B captures pinned to exact source and hardware; no fabricated proof.
- [ ] Actual GPU pass and rebuild bursts measured, including timestamp limitations.
- [ ] p95/hitch/streaming recovery remain within existing project gates or change is explicitly reviewed with evidence.
- [ ] No fog horizons, magenta/green sky, black metal, snow blow-out, sunset sudden jumps or unintended new nocturnal brightness.
- [ ] Provenance and MIT file-header notices verified and recorded.
- [ ] Code committed to `main` only after test and visual review; outstanding items named TODO.

**Automatic PR E failure:** only changing a sky gradient while leaving fake/static environment bright spots; stacking a second aerial fog over current sun haze; adding another scene sun/hemisphere; full static LUT rebake every sun frame; publishing uncompiled/black HDR; making far mountains or ocean appear detached from sky; changing world geometry to fit a spherical atmosphere; or claiming physically measured lux without a calibrated light-unit contract.

## 19. PR F/G handoff — atmosphere to SH and ground bounce

PR F/G should receive **read-only, source-versioned** sky/environment products, not a second sky sampler or weather clock:

- Valid, linear sky radiance environment texture and its source/scale units.
- A coherent sun key RGB/intensity/direction and current clear/cloud/weather state.
- Optional sky hemisphere irradiance proxy and current authored reference calibration.
- A generation ID so per-chunk probe lighting never consumes half-baked IBL.
- Correct reset/update notifications for time/sky/environment changes.
- Explicit distinction between diffuse incident irradiance and camera-exposed scene colour.
- No double diffuse term: when SH probes become active, their base lighting must replace or account for `HemisphereLight` rather than simply adding energy.
- No world-space float32 instability: chunk probes use canonical/relative cells, the atmosphere uses normalized view/altitude.
- PR H cloud shadows/weather integration may then refine sky/deck occlusion; don't fold its volumetrics into E.

## 20. Immutable Drusniel code references (D)

All links are pinned to `075834d7adcdba92547694385f135507b4e6f426`, the inspected `main` head; implementation must re-open newer code before edits.

- **[D1]** [`src/editor/stylized/StylizedSkyView.js`: material, clear sky, sun/cloud/night compose](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/StylizedSkyView.js#L105-L231), [`constructor`: sky mesh, lighting/fog/environment](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/StylizedSkyView.js#L259-L385), [`applyLook`/`update`: scene light authority, canonical camera, exposure](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/StylizedSkyView.js#L427-L521).
- **[D2]** [`src/render/shadows/CascadedSunShadows.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/render/shadows/CascadedSunShadows.js#L1-L26) — existing two cascades on the same directional key, no new light.
- **[D3]** [`src/editor/stylized/sky/sunHaze.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/sunHaze.js#L1-L157) — sun-facing aerosol, altitude-distance aerial factor, `scene.fogNode` and underwater synchronization.
- **[D4]** [`src/editor/stylized/sky/sceneEnvironment.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/sceneEnvironment.js#L1-L76) — static HDR fallback, relative light energy, async texture publication and disposal.
- **[D5]** [`src/editor/stylized/sky/skyLight.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/skyLight.js#L1-L82) — relative brightness, sun tint, reflection tint and snow light.
- **[D6]** [`src/editor/stylized/sky/SkyLookController.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/SkyLookController.js#L1-L217) — current look, time/weather/region/snow blending.
- **[D7]** [`src/editor/stylized/sky/SkyLook.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/SkyLook.js#L1-L172) — sky fields, `nightness` and authored cloud/weather/sun colour.
- **[D8]** [`src/editor/stylized/sky/dayNightCycle.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/dayNightCycle.js#L1-L343) — deterministic astronomical clock and current azimuth convention; **not** light writer.
- **[D9]** [`src/editor/stylized/sky/snowCountryLook.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/snowCountryLook.js#L1-L83) — winter light/haze, snow exposure compensation.
- **[D10]** [`src/editor/stylized/sky/lookGrade.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/lookGrade.js#L1-L46) — existing night/storm colour grade; keep one.
- **[D11]** [`src/editor/world/MacroFarTerrainView.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/world/MacroFarTerrainView.js) — far Azgaar macro terrain for very large imported maps, camera-relative geometry and distant haze.
- **[D12]** [`src/editor/stylized/CloudShadow.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/CloudShadow.js#L1-L129) — canonical wrapping and stable cloud shadows across huge coordinates.
- **[D13]** [`src/editor/water/UnderwaterCausticsPostProcess.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/water/UnderwaterCausticsPostProcess.js#L1-L65) and [`src/editor/water/UnderwaterOpticsNodes.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/water/UnderwaterOpticsNodes.js) — underwater attenuation/coastal optics independent from sky fog.
- **[D14]** [`src/editor/stylized/StylizedGodRaysPostProcess.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/StylizedGodRaysPostProcess.js#L1-L435) — screen/cinematic/volumetric renderer routes, height fog and same directional-light source.
- **[D15]** [`src/editor/InfiniteTerrainView.js`: active render path](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/InfiniteTerrainView.js#L540-L558) — god-rays priority, post-graph fallback.
- **[D16]** [`src/editor/stylized/sky/skyAmbient.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/skyAmbient.js#L1-L42) — integrated pale hemisphere light, avoid slate blue diffuse.
- **[D17]** [`src/editor/stylized/sky/cloudLighting.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/cloudLighting.js#L1-L119) — cloud sunward/away core, silver lining, lightning.
- **[D18]** [`src/editor/stylized/sky/starField.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/starField.js) — existing deterministic star and moon source.
- **[D19]** [`src/render/postprocessing/PostProcessingGraph.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/render/postprocessing/PostProcessingGraph.js#L1-L210) — scene HDR post pipeline/tone conversion.
- **[D20]** [`src/editor/stylized/pipelineOutput.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/pipelineOutput.js), [`src/editor/stylized/cinematicFinish.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/cinematicFinish.js) — alternate cinematic finish and FXAA/output transfer.
- **[D21]** [`scripts/fixtures/environment-look-shots.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/scripts/fixtures/environment-look-shots.json#L1-L94), [`scripts/run-environment-look-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/scripts/run-environment-look-qa.mjs) — existing real scene IDs and semantic visual gates.
- **[D22]** [`docs/perf-qa.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/docs/perf-qa.md) — accepted chunk traversal/performance/hitch QA.
- **[D23]** [`package.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/package.json), [`package-lock.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/package-lock.json) — Three.js declared and resolved version; inspect current prior to TSL edits.
- **[D24]** [`AGENTS.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/AGENTS.md) — work `main` only, performance guide, Azgaar terrain ID contract.
- **[D25]** [`src/editor/stylized/sky/stormAirLook.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/stylized/sky/stormAirLook.js) — weather-specific fog/whiteout/visibility.
- **[D26]** [`src/config/validateStylizedLodConfig.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/config/validateStylizedLodConfig.js) — current stylized config validator/cinematic finish validation; inspect current ownership before new schema.
- **[D27]** [`src/config/loadEditorConfig.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/config/loadEditorConfig.js) — editor YAML loading and overlay.
- **[D28]** [`editor.config.yaml`, lines 3025–3240](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/editor.config.yaml#L3025-L3240) — live sky/clock/cloud/ambient/direct/fog/HDR and aerial configuration.
- **[D29]** [`src/editor/performance/qa/GpuPassProfiler.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/src/editor/performance/qa/GpuPassProfiler.js) — existing timestamp scope limitations.
- **[D30]** [`docs/rendering/post-processing.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/075834d7adcdba92547694385f135507b4e6f426/docs/rendering/post-processing.md) — renderer graph, MRT and per-material `material.mrtNode` warning.

## 21. Immutable Ponlai implementation references (P)

All upstream links are pinned to `cca905649fe657458697a9e1b179113c97ce5e6e`; the named contracts are references for adaptation, not an invitation to copy the whole engine.

- **[P1]** [`packages/render/sky/Atmosphere.ts` — physical-medium and in-scattering design](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/Atmosphere.ts#L1-L230), [`Atmosphere` resources/scattering and LUT construction](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/Atmosphere.ts#L514-L850), [`skyRadiance`, earth-shadow, transmittance and LUT access](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/Atmosphere.ts#L850-L1150), [`updateSync` and `dispose`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/Atmosphere.ts#L1150-L1212).
- **[P2]** [`packages/render/sky/Sky.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/Sky.ts#L1-L145) — unified sky, atmosphere, clouds, night, environment, reference radiant scale and common sources.
- **[P3]** [`packages/render/sky/SkyTrack.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/SkyTrack.ts#L1-L230) — sun/moon/weather state, cached day/light keys and continuous updates.
- **[P4]** [`packages/render/sky/SkyBake.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/SkyBake.ts#L1-L110) — first valid bakes/warmup and irradiance readback, [`environmentSlices` and staged scheduling](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/SkyBake.ts#L230-L375), [`publishBake`/environment cross-fade](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/SkyBake.ts#L375-L450).
- **[P5]** [`packages/render/three/Environment.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/three/Environment.ts#L1-L59) — Three.js private PMREM steps, **avoid direct unverified copy**.
- **[P6]** [`packages/render/sky/SkyDome.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/SkyDome.ts#L1-L331) — sky irradiance/panorama and separate visible sun disc/cloud/night composition.
- **[P7]** [`packages/render/lighting/Radiometry.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/Radiometry.ts#L1-L56) — scene radiance scale, physically inspired sun solid angle and HDR handling.
- **[P8]** [`packages/render/sky/BandMatrix.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/BandMatrix.ts#L1-L47) — chroma-controlled RGB transmittance, default neutral.
- **[P9]** [`packages/render/look/SkyLook.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/look/SkyLook.ts#L1-L145) — sky light/look tables and authorable atmosphere-to-light mapping.
- **[P10]** [`packages/render/weather/VolumetricHaze.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/weather/VolumetricHaze.ts#L1-L125) — 3D atmospheric haze/frustum fog and separate aerosol/weather scattering; **reference only; no direct port**.
- **[P11]** [`packages/render/lighting/AmbientRelight.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientRelight.ts#L1-L175) — sky irradiance and SH relighting; reserved for PR F/G.
- **[P12]** [`packages/render/lighting/KeyLift.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/KeyLift.ts#L1-L159) — artistically lifting low sun's shading direction; **do not copy** without testing consistency of sun disk, shadows and geometry.
- **[P13]** [`packages/render/sky/SkyRetune.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/sky/SkyRetune.ts) — source-change invalidation/rebake, without importing its global registry.
- **[P14]** [`packages/render/post/PreExposure.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/PreExposure.ts) — radiometric scale and HDR precision caveats; already addressed by PR C, **not ported here**.

### Research and licence references

- **Hillaire (EGSR 2020):** [*A Scalable and Production Ready Sky and Atmosphere Rendering Technique*](https://diglib.eg.org/items/8a3e5350-18b3-46bd-9274-3add5af88c75) and [author-hosted paper](https://sebh.github.io/publications/egsr2020.pdf). Core independent reference for transmittance/multi-scatter and LUT-based sky/aerial-perspective design.
- **Original reference implementation:** [`sebh/UnrealEngineSkyAtmosphere`](https://github.com/sebh/UnrealEngineSkyAtmosphere). **Licence/attribution must be independently audited if any source is copied**; don't assume the research paper licenses all code.
- **Bruneton and Neyret precomputed atmosphere:** [`ebruneton/precomputed_atmospheric_scattering`](https://ebruneton.github.io/precomputed_atmospheric_scattering/) for horizon-aware LUT/optical modeling reference, not automatically compatible source.
- **Ponlai's own licences:** [MIT `LICENSE`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/LICENSE) and [credits](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/CREDITS.md). [P1], [P4], [P6] and [P10] contain explicit **tidewater-derived MIT attribution** in file headers; preserve required notices if closely translating the code.
- **Three.js WebGPU:** [official documentation](https://threejs.org/docs/#api/en/renderers/webgpu/WebGPURenderer) — verify code against exact installed version, not Ponlai's version or a README comment.

---

**Implementation handoff:** Keep one sky-look authority and the existing cloud/night/weather/lighting consumers. Adapt Ponlai's physics and resource publication discipline, implement atmospheric LUTs with stable bounded units, and only declare a coherent atmosphere when sun, sky, reflections and aerial perspective agree under real GPU screenshots. Default stylized/stock HDR fallback remains a first-class path. **PR E is not finished merely because the clear sky looks better in one screenshot.**
