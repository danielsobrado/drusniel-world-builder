# Ponlai integration — PR D: edge-aware local tone mapping and Purkinje low-light colour

**Status:** **implementation specification only** — no renderer code has been implemented  
**Date:** 2026-11-20  
**Destination:** [Drusniel World Builder](https://github.com/danielsobrado/drusniel-world-builder), on shared `main` only  
**Drusniel baseline inspected:** [`f96a386775e0e237ddcddc0073a76af1d19b01d4`](https://github.com/danielsobrado/drusniel-world-builder/tree/f96a386775e0e237ddcddc0073a76af1d19b01d4)  
**Ponlai baseline inspected:** [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e)  
**Position:** PR D of the A–L series; completes Phase 2 of the rendering programme  
**Prerequisites:** [PR A specification](ponlai-pr-a-render-foundation-2026-11-20.md), [PR B specification](ponlai-pr-b-deterministic-render-qa-2026-11-20.md), [PR C specification](ponlai-pr-c-hdr-histogram-auto-exposure-2026-11-20.md)  
**Next:** PR E — physically based atmosphere/environment-light integration  
**Engineering principles:** KISS/YAGNI/SOLID, small source files, constants separate from algorithms, YAML as authoritative configuration, documented GPU lifecycles, defensive validation, meaningful logging, no GitHub Actions

> **Critical fact:** At this commit **A, B and C are specifications, not proven implementations**. Do not invent PR C's `effectiveExposureNode` or assume it already exists. Before implementing D, verify that all prerequisites actually landed and read current `AGENTS.md`, latest commits and `docs/perf-qa.md`. New files, settings, APIs and commands below are **proposals**, not claims that those features currently exist.

## 1. What PR D must achieve

Implement two **independently switchable**, well-calibrated additions to the game-camera display:

1. **Edge-aware local tone mapping.** Compress or lift large-scale regions of exposed HDR luminance, retaining fine texture contrast and respecting the border between very bright and dark regions. A beach can show detail in both clouds and shaded rock, a building can have a readable doorway without looking flat, and snow can retain its fine detail without broad dark rings.
2. **Purkinje-inspired night perception.** In sufficiently low authored scene illumination, add a subtle rod-influenced blue/cyan tendency to dark colours while keeping moonlit whites, lamps, skin, stone and warm firelight credible. The effect must be based on the **scene's current light reference** and pixel linear colour, **not** the previous frame's auto-exposure result.

These two effects must **not** replace the existing global exposure, AgX/ACES curves, authored sky looks, colour grading, weather, snow treatment, bloom or shaders. Their job is to improve the dynamic-range presentation and perceived low-light colour.

**Release posture:** Both effects are **off by default** in every existing preset, including high/ultra, until tested on the actual desktop GPU and reviewed visually. Disabled should preserve the current pixels and avoid allocating feature-specific textures/compute or extra draw calls.

### Visible success

- **Understory:** dark forest-floor features are easier to distinguish where art direction allows, but remain under the canopy's shade.
- **Skyline:** bright cloud against dark trees does not create a wide light or dark halo.
- **Mountain/snow:** white snow stays white; ice and compact snow surfaces retain texture; edges do not acquire artificial grey contours.
- **Architecture:** a lit stone wall facing a shaded doorway retains local texture, without bright bands around the arch.
- **Night town:** warm local lights remain warm and identifiable; dark ambient materials gain slightly different perceived colour, not universal blue paint.
- **Ocean:** bright reflection on dark water does not “pull” a broad local halo; water/foam temporal dynamics do not shimmer or pump the effect.
- **Temporal stability:** pan, teleport, floating-origin rebase, changing sky, TAA/TAAU render scale and post-processing fallback remain stable.
- **All active render paths:** effects must work on the player's actual selected output, not only in the post-processing route used for editor screenshots.

## 2. Major architecture issue discovered in the current Drusniel code: more than one final-display path

This is **the first mandatory implementation gate**, ahead of shader work.

At [D1] `InfiniteTerrainView.render(camera)`, the world uses the following selection:

```text
world render begins
  |
  +-- if god rays enabled AND technique == cinematic or volumetric:
  |      godRays.render(camera)
  |      return  [PostProcessingController is not reached]
  |
  +-- else if PostProcessingController.render(camera):
  |      return  [HDR MRT, optional AO/SSR/TAA/Bloom/AgX]
  |
  +-- else if godRays.render(camera):
  |      return  [screen-space god rays / own finish]
  |
  +-- else renderer.render(scene, camera)
```

This is **verified source**, not a theoretical concern:

- [D1] `src/editor/InfiniteTerrainView.js` lines 540–558: exact branch order and `activeRenderPath` strings.
- [D2] `src/editor/stylized/StylizedGodRaysPostProcess.js`: three independent `RenderPipeline` owners for screen, cinematic and volumetric techniques, all passed through `setPipelineOutput`.
- [D3] `src/editor/stylized/pipelineOutput.js`: god-rays pipelines supply their **own** finish/FXAA path and return before the conventional post-processing graph.
- [D4] `src/editor/stylized/cinematicFinish.js`: separate bloom/lens dirt, `gradeNode`, vignette and grain. Its `lookGrade` uniforms are **already sky-driven**.
- [D5] `src/main.js` lines 390–417: `PostProcessingController` is configured with a bypass provider for volumetric god rays; the cinematic path also wins earlier at [D1].

**Consequence:** Implementing D only inside `src/render/postprocessing/PostProcessingGraph.js` is an **incomplete feature**. A player with the cinematic or volumetric god-rays technique can bypass it entirely, even while post-processing appears configured.

**Required decision:** before implementation, make a **render-path capability matrix** from current code and runtime `activeRenderPath`. Establish a single *policy* and common pixel-operation core for local tone/Purkinje, then adapt it to each actual final-image owner **without drawing the scene twice**. Avoid installing a second `PostProcessingController` or blindly moving the entire scene renderer under a new graph. Shared *math* and *feature settings* are reasonable; shared GPU resource ownership across incompatible pipeline topologies is not automatically safe.

For paths that cannot initially support a feature, the UI must say `unsupported for active render path`, not “enabled.” However **PR D is not globally complete** until the desired player render paths are supported or a clearly documented, separately approved render-path-convergence prerequisite has landed.

### 2.1 Render-path adaptation plan

| Path at [D1] | Current output owner | Proposed D integration | Stop/QA gate |
| --- | --- | --- | --- |
| `post-processing` | [D6] `PostProcessingGraph` / [D7] `ToneMappingNode` | GPU local-base passes + shared local gain before grade/tone curve; Purkinje on exposed-source input before bloom | Same-frame input, no duplicate HDR scene draw, AgX/ACES compatibility |
| `cinematic-god-rays` | [D2], [D3], [D4] `setPipelineOutput`/`finishFrame` | Reuse shared pixel formulas but build compatible local-base targets as part of **that** pipeline; night shift before its bloom, local gain after its bloom before `gradeNode` | Actual `finishFrame` output tested; no second grade, no extra scene render |
| `volumetric-god-rays` | [D2], [D3], [D4], `godrays`/`bilateralBlur` | Same shared D math integrated after volumetric composite with pipeline-local resources | Volumetric ray colour, depth, blur and renderer output order unchanged |
| `screen-space god rays` | [D2], [D3], unless [D6] wins | Same adaptation if its pipeline is actually selected; otherwise only post path | Test both render path selection and effects |
| `direct` | [D1] base renderer | No automatic local-tone overlay on raw direct fallback. Feature reports bypass and source/quality status, never crashes | No raw render draw cost and fallback remains playable |
| `postprocessing off` | [D6] not available | Feature off; no hidden target allocations | Pixel-identical baseline |

**Caution:** [D3] invokes `renderOutput` with defaults in its FXAA path, while [D6] owns explicit output conversion and temporarily sets renderer tone mapping to neutral. The implementer must inspect the exact active build and **prove** whether a god-rays finish source is scene-linear or already exposed, and where tone mapping/output transfer occurs, **before** inserting any operation. Applying local tone in sRGB would be wrong. Do not assume the two pipelines have identical tone and exposure semantics.

## 3. Verifiable source-to-source mapping — Drusniel ↔ Ponlai

| Topic | Drusniel location / actual behavior | Ponlai implementation / actual behavior | What D should do |
| --- | --- | --- | --- |
| HDR world output | [D6] `PostProcessingGraph` `scenePass` MRT and `resolvedOutput` / `postDofOutput` | [P1] `LocalTone` accepts source texture plus exposure | Use a **scene-linear HDR** source at the correct stage, not output sRGB |
| Current grade | [D7] `ToneMappingNode` exposure → bloom add → contrast/saturation → AgX/ACES | [P2] `PipelineDisplay.ts` applies local tone between scene+bloom and grade | Insert local tone gain before existing grade/curve, do not invent another tone curve |
| Alternate grade | [D4] `cinematicFinish.finishFrame`, `gradeNode`, bloom/lens dirt | [P2] `PipelineDisplay.ts` grades `tSharp` through local tone | Add compatible local gain in alternate output, retaining lens dirt and FXAA |
| Local tone algorithm | No current feature found in source search; [D6] existing TSL/rtt patterns | [P1] `LocalTone.ts` ~64×32×64 3D bilateral grid via 2D atlas, blur and hyperbolic gain | Adapt fixed-grid edge-aware base and gain; **do not** copy custom FrameGraph |
| Local tone pass order | [D6] RenderPipeline TSL graph; [D4] separate finish pipeline | [P1] `localToneLuma`→`Grid`→`GridX`→`GridY` with typed resource dependencies | Verify actual Three.js ordering/RTT re-use in **both** pipelines |
| Local exposure | [D8] `sceneExposure.scale`; [D9] `StylizedSkyView.applyLook` and sky compensation | [P1] `lumaPass` measures **exposed** luminance, local gain multiplies exposed colour | Multiply scene by final effective exposure **once**; avoid repeated exposure on bloom |
| Auto exposure | PR C spec proposes `effectiveExposureNode`; **not in repo** | [P3] `Exposure.ts` and [P4] `Metering.ts` | Gate D on actual C implementation; manual mode remains supported |
| Low-light receptor model | No Purkinje source in Drusniel | [P5] `Purkinje.ts` receptor response and matrix, scene-reference white | Port math only after validating scene illumination and reference light |
| Purkinje input light | [D9], [D10] `SkyLook` nightness/directional/ambient, `lookGrade` | [P6] `PipelineDisplay.ts` `openLight` from key + sky fill; [P7] `DisplayLook.ts` retina/strength | Reuse authoritative authored sky state and explicit proxy; never derive from auto EV |
| Night/grade controls | [D10] `SkyLook`, [D11] `SkyLookController` smooth presets, [D12] `lookGrade` saturation/contrast | [P7] `DisplayLook` independent night tuning | Avoid “double night tint” with existing blue lift / desaturation |
| Night bloom | [D13] `BloomNode` prefilter exposed HDR; [D4] alternate bloom | [P6] Purkinje shift **before** composite / bloom/local tone | Shift resolved scene colour before bloom so bloom follows shift; do not recolour bloom separately |
| Local-tone temporal state | [D14] TAA/SSR history, [D15] frameState jitter and render scale | [P1] local grid is per-frame, reads **no previous frame** | No extra temporal history; let TAA/TAAU remain owner of temporal resolve |
| Topology/settings | [D16] `PostCommon`, [D17] `PostProcessingSettings`, [D18] `PostProcessingPresets` | [P1] `LOCAL_TONE` keyed uniforms, [P7] look tables | Enabled/tier in topology; strength/time/hinge parameters as uniforms |
| Live settings UI | [D19] `PostProcessingSettingsPanel`, [D20] `MobileProfile` | [P7] look tables / tune keys | Compact Local Tone and Night Perception toggles, default off; mobile safe |
| Resource lifecycle | [D21] `PostProcessingResources` active graph and cache | [P1] fixed passes and resource handles | Own all new RTT/atlas resources per graph; dispose on bypass/resize/device loss |
| A/B QA | [D22] environment-look fixtures; [D23] PP browser QA / [D24] GPU profiler | [P8] source-pinned visual parity; [P9] profiling | Use A/B/A/B against same source/camera/render path with honest GPU scopes |
| Legal provenance | [D25] PR A licence/provenance contract | [P1]/[P5] and [P6] (contains tidewater-adapted portions) | Record exact upstream file and third-party headers if closely adapted; no unreviewed assets |

## 4. Ordering: the real HDR operations, not an invented second colour pipeline

### 4.1 Current post graph

[D6, D7, D13]:

```text
scene MRT HDR
 -> ambient occlusion / shafts / SSR
 -> TAA or TAAU
 -> optional depth of field
 -> HDR scene * manual + authored scene exposure
 -> exposed bloom already prefiltered from resolved HDR
 -> grade contrast/saturation
 -> selected tone curve (AgX/ACES/Neutral/NoToneMapping)
 -> display-linear vignette
 -> one renderOutput colour conversion
 -> sharpening and grain
```

[D6] constructs bloom on `resolvedOutput`, not the DOF-blurred `postDofOutput`. Keep that important separation.

### 4.2 New local-tone placement (post path)

Preferred:

```text
resolved HDR
     |\
     | +-------------------------------------+
     |                                       |
   optional DOF                         existing bloom prefilter
     |                                (uses same effective exposure)
     +---------------------+-----------------+
                           |
              E = authored * manual * auto
                           |
                 C = (postDOF_HDR * E)
                     + (exposedBloom * intensity)
                           |
                  local tone luma/grid
                           |
            C_local = C * localGain(base(C), settings)
                           |
                  existing contrast/saturation
                           |
                  existing AgX/ACES tone curve
                           |
                  existing output conversion, vignette,
                  sharpen and grain unchanged
```

This placement aligns with [P2] where local tone is calculated on the *sharp scene plus bloom* and applied before grading. **It is essential that the luma pyramid reads exactly the exposed linear colour to which its gain applies.** Measuring pre-bloom scene HDR but applying the result to post-bloom colour can give incorrect highlight halos; measuring pre-DOF but applying after DOF can produce dark/bright rings around blurred object boundaries.

One extra full-resolution exposed composite RTT **might** be needed to ensure grid input and grade have identical resolved pixels and avoid multiple evaluations. The implementer must **measure** its memory/bandwidth cost and prove no duplicate scene pass. If a safe TSL shared expression can be resolved once without extra RTT, prefer it. Do **not** pretend the source can be sampled freely when it is only an unevaluated fragment expression.

### 4.3 New Purkinje placement

At [P6], Ponlai applies the rod shift to *scene-linear* composite **before** bloom, local tone, colour grade and tone curve. For Drusniel the ideal **post** path is:

```text
pre-DOF resolved HDR in scene units
     |
optional PurkinjeShift(C, authoredOpenLight, nightness)
     |
     +---- existing bloom source (shifted)
     |
optional DOF on shifted source
     |
     +---- exposure/bloom/localTone/grade
```

Applying the shift after TAA means TAA history remains in unshifted scene colour; a slowly changing sky/light uniform changes the final grade each frame without requiring a separate TAA history texture. Confirm no TAA reactive or history correctness issues during a fast day/night transition; if severe, move the shift to a pre-TAA stage **only** with a measured history-safe design.

For the god-rays pipelines the shift should be applied after their volumetric/screen composite is formed but before **their** bloom/`finishFrame`. This preserves warm flame and moon glow relationships and ensures local-tone luma sees the shifted result when night is enabled. Explicitly decide whether the sky dome and light shafts shift at all: Ponlai's aerial light is part of the composite, but a physical rod model is retinal and applies to all light perceived by the viewer. A special sky bypass needs actual art-direction evidence, not a hue check.

**No branch may apply the night shift twice** because the same colour passed through two render effects. Render-path ownership and clear input/output semantics are mandatory.

### 4.4 Interactions with PR C

If PR C is implemented and its `effectiveExposureNode` exists, local tone reads **the same EV generation** as bloom and tonemap. Purkinje derives its scale independently of that EV to prevent a feedback loop; the exposure meter may read the night-shifted scene depending on PR C's input selection. The combined system must be tested for stable exposure:

- If the meter sees a Purkinje-shifted input, its histogram/target might move with the shift; calibrate this explicitly.
- If the meter reads pre-shift HDR, it avoids that feedback but can disagree with post-shift highlight luminance. Choose one, document it, and prove stable.
- **Recommended initial D:** PR C meters original scene-linear HDR; Purkinje shifts resolved HDR for the display/bloom. The histogram never depends on *auto exposure* or local-tone output. Confirm the resulting highlight safety with A/B snapshots.

**Do not rewrite PR C's metering or add another HDR auto-exposure controller** as part of PR D. PR D must continue to operate with PR C manually disabled.

## 5. Exact local-tone mathematics (Ponlai [P1])

The objective is a gain computed from **large-scale local luminance**, not each pixel's own brightness. That preserves fine detail: a small spark within a shaded wall remains bright relative to its wall.

### 5.1 Input luminance and log stops

Use linear **exposed** RGB `C_e(p)` (scene radiance times effective exposure, with exposed bloom added at the correct point). Let:

```text
L(p) = dot(max(C_e(p), 0), vec3(0.2126, 0.7152, 0.0722))
V(p) = log2(max(L(p), epsilon)) - log2(0.18)
```

- `0.18` is the existing tone mapper's middle grey [D7].
- `epsilon` must be a finite small value with valid HDR16F behavior; Ponlai uses `2^-24`, but actual underflow/coverage must be verified on Drusniel's renderer.
- Use Rec.709 linear weights; never feed display-encoded RGB into a log-luma transform.
- Negative/nonfinite inputs are rejected or guarded to avoid NaNs and invalid GPU texture writes.
- Use a **fixed sample grid** so changing output resolution/TAAU render scale does not change the low-frequency base.

### 5.2 Ponlai's bilateral-grid implementation: what to adapt

[P1] `LocalTone.ts`:

- `GRID = {width: 64, height: 32, depth: 64}`; 64×32 spatial cells plus 64 **log-luminance slices**.
- `TILE = 8`, luma sample grid 512×256.
- `PACK = 2`: four luma samples stored in one RGBA16F texel; luma target 256×128.
- `RANGE = [-10, +6]` stops relative to middle grey; `SLICE = 16/63` stops per depth layer.
- `ATLAS = 64 × (32 × (64+1) + 1)`: the 64 luminance layers, one wide-luma layer, and one mean row stored as a **2D atlas**.
- Four passes: `localToneLuma`, `localToneGrid`, `localToneGridX`, `localToneGridY`.
- `grid` target holds homogeneous weighted sums `(ΣwV, Σw)` in RG16F; blur keeps numerator and denominator separate.
- Spatial kernel: tent weights to nearby cells; luminance axis: tent weights convolved with `[1,2,1]/4` to reduce slice aliasing.
- Blur: an edge-aware grid-slice Gaussian in X/Y, plus a wider Gaussian for broad component.
- Reconstruction: eight trilinear neighbour reads, empty-cell fallback and a cubic B-spline upsample of the wide component.
- Final base: `B = 0.4 * B_bilateral + 0.6 * B_wide`; weights are an **upstream example**, not a guaranteed optimal ratio for Drusniel.

The algorithm runs **entirely per frame** with no previous-frame local-tone buffer; it must not be misreported as a temporal filter.

### 5.3 Proposed tiered grid (compile-time, not arbitrary user input)

Start with a validated, fixed-size quality grid. These are **engineering proposals, not measured budgets**:

| Tier | Spatial grid | Luma samples | Log slices | Initial default |
| --- | --- | --- | --- | --- |
| `off` | none | none | none | All old presets |
| `balanced` (optional opt-in) | 32×18 | 256×144 | 32 | Validate |
| `high` | 48×27 | 384×216 | 48 | Preferred desktop pilot |
| `ultra` | 64×32 | 512×256 | 64 | Ponlai-like reference; only if cost justified |

Each tier uses 8×8 samples/cell, packed 2×2, plus an RG16F atlas of height `H*(D+1)+1` and two blur atlases. The tier/active enable are topology, not per-frame uniforms. The 2D aspect must remain pixel-isotropic; using a 16:9 grid on a 21:9 display requires correction using actual render dimensions when computing blur and sampling. The 64×32 aspect itself is not invariant under arbitrary aspect ratio.

### 5.4 Raw memory estimate (not GPU allocation measurement)

For each tier, with one packed RGBA16F luma target (8 bytes/pixel) and **three** RG16F atlas images (4 bytes/pixel each):

```text
atlasWidth = W
atlasHeight = H * (D + 1) + 1
lumaWidth = W * 8 / 2
lumaHeight = H * 8 / 2
rawBytes = (lumaWidth * lumaHeight * 8)
         + 3 * (atlasWidth * atlasHeight * 4)
```

Examples:

- Balanced (32×18×32): 73,728 + 3×76,160 = **302,208 bytes** (~0.288 MiB).
- High (48×27×48): 165,888 + 3×254,208 = **928,512 bytes** (~0.886 MiB).
- Ultra (64×32×64): 262,144 + 3×532,736 = **1,860,352 bytes** (~1.774 MiB).

These counts **exclude** alignment, texture padding, mipmaps, internal driver allocations, optional full-resolution composite RTT, depth, post-processing graph caching and multiple simultaneously retained quality topologies. The 64×2081 atlas is tall and cache-unfriendly on some GPUs; do not assume low raw memory implies low bandwidth/time.

Only allocate enabled tier resources. No hidden assets or atlas targets in a disabled graph.

### 5.5 Grid construction: exact algorithm

For sample `s` with normalised coordinates `u_s` and log value `V_s`:

1. Convert its location to spatial grid coordinates: `g = u_s * [W,H] - 0.5`.
2. Determine two neighbouring cells on each spatial axis.
3. Compute separable tent spatial weight `w_xy = max(1-|dx|,0) * max(1-|dy|,0)`.
4. Map log luminance to slice coordinate: `z = clamp((V_s - low)/(high-low)*(D-1), 0, D-1)`.
5. Distribute into neighbouring luminance slices with a smooth triangular weight. [P1] applies a small `[1,2,1]/4` convolution along the luminance axis to remove hard band transitions.
6. Accumulate numerator/denominator as homogeneous pairs `(w*V_s, w)`. Normalise the expected sample/cell scale to near unity so half-float accumulation does not lose too much precision.
7. Include a special **wide** spatial slice (no luminance gating).
8. Include a **mean** row so empty grid regions have a stable fallback.
9. Filter each layer spatially in X, then Y; never allow blur taps to leak between adjacent luminance slices or the wide/mean layers.
10. The grid is a **gather** in Ponlai's quad pass, not a compute shader scatter; its loops can be shader-expensive. Copy the *model*, then benchmark a TSL gather versus an explicit compute splat/reduction if necessary. Do not assume the web backend accepts giant nested loops.

**Implementation pseudocode (algorithmic only):**

```js
for each grid cell (x, y) and luminance slice z:
  weightedLog = 0
  weight = 0
  for sample within bounded 2x2 surrounding tiles:
    wxy = tent(dx / tileWidth) * tent(dy / tileHeight)
    wz = luminanceSliceWeight(sample.logLuma, z)
    w = wxy * wz
    weightedLog += sample.logLuma * w
    weight += w
  outputGrid[x, y, z] = [weightedLog / expectedSamples, weight / expectedSamples]

for every slice:
  blurHomogeneousX(grid)
  blurHomogeneousY(blurredX)
```

Do not calculate a naive blur of **normalised luma** and discard the denominator; doing so creates dark seams where some cells have no samples at that luminance.

### 5.6 Reconstruction: edge-aware base and wide base

At output pixel `p`:

- Compute `V(p)` and its luminance slice coordinate.
- Sample the grid at the four spatial corners × two adjacent luminance slices (8 values).
- For every cell, compute its average log-luma from numerator/denominator, with a bounded epsilon.
- If a cell is nearly empty, blend toward a weighted mean of **occupied neighbours**, falling back to whole-frame mean only when all neighbours are empty.
- Bilinearly interpolate across X/Y and linearly interpolate across log-luminance slices. Call this `B_bilateral(p)`.
- Reconstruct the wide slice with a cubic B-spline or verified equivalent; use four bilinear taps and normalized weights. Call this `B_wide(p)`.
- Blend `B = mix(B_wide, B_bilateral, bilateralShare)`.

**Essential invariant:** an isolated bright pixel on a dark background **must not set its own local base**. This preserves highlight contrast rather than compressing the isolated source into dull grey. The rule is explicit in [P1]'s `LocalTone.apply`.

**Numerical guards:**

- No empty-cell divide-by-zero; track occupancy and fallback.
- No NaN/Infinity in `log2`, B-spline weights, grid readbacks or `exp2`.
- Clamp slice access to [0,D−1]; atlas UVs must not sample across slice boundaries when using bilinear filtering.
- Empty/black frame maps to zero or neutral gain, not random colour.
- Upper/lower boundary slices retain finite numerator/denominator.
- Preserve all RGB channel signs/noise conventions of existing HDR scene data; do not create negative output.

### 5.7 The gain function: implement exactly, then tune

Ponlai [P1] applies a smooth hyperbolic hinge in **stops**, acting on the base `B`:

```text
b = B - hinge
knee = 0.5 * (b + sqrt(b*b + width*width))
G = lowSlope * b + (highSlope - lowSlope) * knee
gain = 2^G
C_local = C_exposed * gain
```

- `hinge` is a log2 luminance offset relative to exposed 0.18 grey.
- `lowSlope` and `highSlope` are stops of gain per stop of local base.
- `width` sets the knee smoothness in stops; must be greater than zero.
- A negative high slope compresses brighter regions. A **negative** low slope lifts dark regions (since `b<0`); a positive low slope deepens them.
- Set both slopes to zero to get a mathematically neutral gain of exactly one **if** computed without unstable intermediate values.
- The gain is based on the **base only**, not the pixel's own contrast or detail coefficient.

**Do not apply a second global tone curve**. Continue to use Drusniel's existing AgX/ACES/Neutral selection after this gain.

### 5.8 Proposed initial artistic parameters — not calibrated

```yaml
localTone:
  enabled: false
  quality: high
  strength: 0.6
  hingeEV: 0.0
  lowSlope: -0.08
  highSlope: -0.15
  kneeWidthEV: 0.65
  bilateralShare: 0.4
  maxAbsGainEV: 0.6
```

These values are *not* claimed best or source-derived defaults. The production effect should blend from neutral:

```text
effectiveGainEV = clamp(strength * G, -maxAbsGainEV, +maxAbsGainEV)
C_out = C_exposed * 2^effectiveGainEV
```

Clamping bounds runaway gain in very dark/wide-light scenes; it must be documented, and the clamp boundary should not cause an obvious band or halo. If it does, smooth the bound rather than merely loosening it. Remember Ponlai's own sunset/night keys differ: it sometimes deepens shadows intentionally instead of lifting them. Do not make the “night” look automatically bright.

### 5.9 Scene-aware parameter policy

Drusniel already has [D10, D11, D12] a sky-look controller providing continuous `sunElevation`, `nightness`, overcast and storm parameters. [P1] keys local tone by sun elevation and cloudy/night weights. Adapt this idea **in a small pure look-parameter resolver**, not in the renderer node:

```js
function resolveLocalToneLook(baseSettings, { sunElevation, nightness, overcastAmount, stormAmount }) {
  // Derive bounded uniforms from the existing authored sky look.
  // No new scene clock, world coordinate or sky preset registry.
  return {
    hinge: /* authored + measured policy */,
    lowSlope: /* smooth continuous transition */,
    highSlope: /* smooth continuous transition */,
    width: /* positive, bounded */,
    strength: baseSettings.strength,
  };
}
```

At first, prefer a neutral-by-night or very mild local-tone policy until genuine QA shows the effect improves the scene. The user's current authored look already has night desaturation/lift [D12], and snow [D9] has explicit brightness compensation. An automated “lift every shadow” rule will hurt both.

**Changes of sky look must update uniforms only.** No graph topology rebuild per weather/clock frame. Use [D11] current resolved look, not global `Date.now` or a duplicate night clock.

## 6. Purkinje / rod-colour shift: physically informed but honest about missing inputs

### 6.1 What Ponlai actually implements

[P5] `Purkinje.ts` is a receptor-response approximation derived from published rod/cone and opponent-space models. It operates on **linear Rec.709 scene RGB**, not gamma-encoded screenshot pixels. The shader has:

- fixed receptor vectors `GAIN_L`, `GAIN_M`, `GAIN_S` and `ROD`, derived offline;
- fixed `FROM_GAIN_R/G/B` rows to transform adjusted opponent response back to RGB;
- `scale = retina / max(referenceOpenLight, 1e-12)`;
- per-pixel `x = C * scale`;
- cone gains `inverseSqrt(vec3(dot(GAIN_*, x)) + 1)`;
- rod response `r = dot(ROD, x) / scale`;
- added colour `ΔC = vec3(dot(FROM_GAIN_R,gain), dot(FROM_GAIN_G,gain), dot(FROM_GAIN_B,gain)) * (r * amount)`;
- amount fades to zero by day and is tunable at night.

[P7] `DisplayLook.ts` exposes `retina` and `strength` (Ponlai look reference strength ranges up to 0.4). [P6] builds the reference illumination from the key and sky land irradiance **in scene light units**, once per frame, with an auxiliary constant texture. [P5]'s header explicitly warns that deriving it from the previous exposure creates a feedback loop.

**Do not substitute “make the image blue at night” and claim to have ported the same algorithm.** A neutral blue tint is an optional **clearly labelled stylistic fallback**, not a verified physiological Purkinje model.

### 6.2 The missing Drusniel signal

Drusniel [D9] tracks the actual stylized sky, directional and hemisphere light intensities, cloud/snow transitions and `nightness`; [D10] and [D11] resolve time/weather. This **does not provide** an exact white-card retinal illuminance in the same calibrated scene radiance units used by Ponlai's `openLight`. The material/shadow/sky response and terrain albedo pipeline are different.

Therefore PR D needs a deliberately documented **scene-reference white-light proxy** `L_ref` for the current authored sky:

- Derive it from existing resolved look/light state through one small adapter, evaluated once per light/look update.
- Approximate open level-ground white reflectance from a documented combination of ambient/hemisphere and the directional key, optionally including sun-elevation cosine and weather attenuation.
- Keep its **units and normalization explicit**. If there is no physically calibrated conversion to luminance, call it `referenceLightProxy`, not “lux” or “trolands”.
- Guard `L_ref > epsilon` and nonfinite input. Do not use the frame's histogram, current `effectiveExposure`, previous auto EV or output screenshot average as `L_ref`.
- Validate monotonicity: stronger authored open light → weaker rod shift on equally lit colour; daytime effect → zero.
- Derive `nightWeight` from the continuous `look.nightness`; do not switch at `look.night` Boolean midpoint, which could cause dusk popping.
- Model warm artificial lamps explicitly as lit pixels that should mostly retain their warm tone; test rather than hardcode RGB-hue exclusions.

**Mandatory design gate:** compare the GPU implementation against a CPU reference, and inspect high/low-light scenes. If the proxy produces large false blue shifts, cap and narrow the effect or defer the full receptor model; do not ship with uncalibrated biologically named parameters.

### 6.3 Reference-light proxy — a practical option to prototype

Proposed *conceptual* signal:

```text
sunHeight = max(sin(sunElevationRadians), 0)
key = max(directionalIntensity, 0) * sunHeight
fill = max(ambientIntensity, 0) * skyFillCalibration
L_ref_proxy = max(epsilon, key * keyCalibration + fill * fillCalibration)

nightWeight = smoothstep(0, 1, nightness)
referenceNormalized = L_ref_proxy / referenceCalibration
```

**Those calibration constants must come from scene measurements**, not guessed Ponlai values. [D9] actually has `directionalIntensity`, `ambientIntensity`, `nightness` and sky environment intensity. [D11] smooths sky and regional changes. Only read available fields and do not invent a `getIrradiance()` method.

This light proxy has limitations: it cannot represent local lamps, underwater attenuation, cloud-shadow occlusion per material or indirect SH probes not yet built (PR F/G). A per-pixel shift will still depend on the colour/luminance being displayed; tune with actual night architecture and moonlit trees. Reevaluate when later lighting PRs provide a better reference.

### 6.4 Full receptor variant — recommended if scene reference is defensible

Use [P5]'s exact matrix approach as a **small pure TSL function**, and a CPU reference test for all coefficients. Do not spread matrices across three modules.

Let `C` be scene-linear RGB (before the effective camera exposure), and `S = retina / max(L_ref, eps)`. Then:

```text
x = C * S
coneGain = rsqrt(1 + [
  dot(GAIN_L, x),
  dot(GAIN_M, x),
  dot(GAIN_S, x)
])
r = dot(ROD, x) / S
shiftRGB = [
  dot(FROM_GAIN_R, coneGain),
  dot(FROM_GAIN_G, coneGain),
  dot(FROM_GAIN_B, coneGain)
]
C_rod = C + amount * r * shiftRGB
```

**Use nonnegative/finite guards**, a strength cap and a carefully selected final gamut policy. The matrix rows contain negative coefficients and can yield negative channels on synthetic colours; do not permit them to poison bloom/log-luminance computations. If a simple `max(C_rod,0)` creates a hue discontinuity in extreme saturated colours, use a tested gamut-preserving method with documented cost and fidelity.

`retina` is a **model calibration parameter**, not a live retinal-illuminance measurement. The actual Ponlai night tuning (e.g. 250) was calibrated for that island, where moonlight was deliberately brighter than physically realistic. Do **not** transplant this value as a trusted Drusniel constant. Tune bounds from evidence.

### 6.5 Stylistic fallback — not called “physical Purkinje”

If calibrated `L_ref` cannot be established and the full model still creates uncontrolled colour, the implementation may expose a simpler **night shadow colour** model, clearly labelled accordingly. The feature must remain opt-in and its status must disclose the approximation.

Example **algorithmic** fallback:

```text
L = dot(C, [0.2126, 0.7152, 0.0722])
relative = log2(max(L, eps) / max(L_ref_proxy, eps))
shadowWeight = 1 - smoothstep(darkStartEV, darkEndEV, relative)
w = clamp(nightness * strength * shadowWeight, 0, wMax)
tint = normalizeLinearLuminance([0.90, 1.00, 1.13])
C_stylized = mix(C, C * tint, w)
```

This is a **subtle hue-preserving/luminance-normalized cyan/blue shadow bias**, not receptor physiology. It is valuable only if full receptor mode fails the validation gate and the alternative is explicitly approved. Do not silently switch from one to the other when a GPU extension is absent; prefer disabling unsupported optional features and reporting the status.

### 6.6 Do not let rods affect exposure feedback

The shift must be based on:

- original **scene-linear** colour,
- current sky/look `nightness`,
- current authored **open reference light**,
- a stable strength/calibration policy.

It must **not** be computed from:

- screen/output-sRGB,
- last frame auto exposure,
- local-tone adjusted output,
- histogram-trimmed mean that itself changes from the shift,
- previously tone-mapped pixels.

If PR C meter reads shifted HDR, a feedback path might be possible; review PR C's chosen source and test no feedback oscillation. Preferred: meter original HDR, shift after resolved source and before bloom. Future physically based atmosphere PR E and SH PR F/G may improve calibration but must not change the implementation's basic separation of concerns.

### 6.7 Keep warm light and material identity

Purkinje is a low-light perceptual model, not a global stylized colour grade. Hard requirements:

- Warm window/lantern/torch emissive pixels must not become monochrome blue.
- Greyscale stone should stay near neutral under a strong nearby light source.
- Blue moonlit foliage can look subtly cooler but must not glow unnaturally.
- Sunset, twilight and low-sun clouds should not abruptly change at nightness=0.5.
- A single bright spell/lightning impulse must not reset the night effect for seconds.
- Snow's existing cool shadow values `snowBlue` and `lookGrade` must not become unnaturally saturated or black.
- HDR bright values remain finite; bloom threshold should still make sense after the shift.
- When `nightWeight=0` or `strength=0`, the shader returns **exact input** within compiled floating-point semantics; no colour contamination.

## 7. Configuration design: YAML, presets, feature flags and mobile

### 7.1 One settings owner

Current [D17] `PostProcessingSettings.js` normalizes and freezes nested post settings. [D18] applies quality presets; [D19] builds the compact controls. Do not introduce a new global `NightPerceptionStore` or `LocalToneConfigLoader`. Keep the authoring hierarchy under the existing `editor.config.yaml` `stylizedSurface.postProcessing`.

Example **proposed**, subject to PR C state and acceptance:

```yaml
stylizedSurface:
  postProcessing:
    localTone:
      enabled: false
      quality: high
      strength: 0.6
      hingeEV: 0.0
      lowSlope: -0.08
      highSlope: -0.15
      kneeWidthEV: 0.65
      bilateralShare: 0.4
      maxAbsGainEV: 0.6
      lookAware: true

    nightPerception:
      enabled: false
      model: receptor
      strength: 0.10
      referenceCalibration: 1.0
      retinaCalibration: 100.0
      maxShift: 0.15
      minNightWeight: 0.05
      lookAware: true
```

This is **not an approved default tune** and the `nightPerception` calibration numbers are placeholders for design/testing; no copy of Ponlai's retinal 250 as a universal physical truth. If a required calibration is not known, fail closed; do not silently ship the above as physically measured settings.

### 7.2 Validation rules

- Feature switches are strict booleans; unknown keys warn consistently with [D17].
- `quality` must be one of explicitly defined tiers.
- All numbers must be finite, bounded and clamped/validated through existing normalizer.
- `kneeWidthEV > 0`, `maxAbsGainEV >= 0`, `bilateralShare`/`strength` within [0,1].
- Negative/positive slope bounds must be tight and validated.
- `nightPerception.model` only accepts implemented models. Do not expose an unimplemented fallback mode in ordinary UI.
- Directly missing fields in old user saves must take disabled defaults; no migration rewrite for nonexistent legacy features.
- Settings objects remain immutable/frozen.
- Numeric sliders and smoothly updated sky-look values do not trigger a graph rebuild. Enabled/quality and compile-time LUT/grid size **do** change topology.
- Ensure `off` preset and feature availability gates remove all GPU work.
- Presets `low`/mobile remain off unless measured acceptable. Higher tiers must not quietly turn on simply because resources exist.

### 7.3 Ownership across the two rendering paths

The global settings UI may remain the single user-facing owner; the active path adapter consumes **resolved** settings, not its own shadow copies. At [D5] runtime initialization, the god-rays finish is currently built from `stylizedSurface.cinematicFinish` and [D6] from `postProcessing`. This split means PR D must design an **explicit bridge** (read-only per-frame settings/provider or subscribed configuration) to both owners without renaming/removing existing cinematic finish settings.

- Prefer one normalized `localTone`/`nightPerception` configuration object.
- Each selected pipeline independently owns the GPU textures it creates.
- A settings update should invalidate/rebuild the **active** topology only when necessary.
- Never share an RTT created for one `RenderPipeline` instance with another without verified resource lifetime and sample semantics.
- On active path switch, dispose/park old resources according to the current renderer's cache policy.
- If the user selects a feature unsupported by the current technique, report status through diagnostics and keep the scene playable.

### 7.4 Minimal UI

Add under tone mapping/post-processing:

- **Local tone mapping** toggle, optional quality tier control and a single strength slider.
- **Night perception** toggle, single strength slider.
- Advanced read-only/debug: effective HDR source/active render path, current sky nightness, current reference-light proxy (with units marked `proxy`), local-tone tier and GPU pass status.
- Do not expose all bilateral kernel radii, matrix coefficients, retinal calibration constants or LUT geometry to ordinary users.
- Retain manually authored exposure, contrast and saturation controls. A style effect must not secretly modify those values.

## 8. Proposed code boundaries (small, SOLID, minimal duplication)

| Path | Responsibility | Nature |
| --- | --- | --- |
| `src/render/postprocessing/localTone/LocalToneConstants.js` | Compile-time tier grid, range/format definitions | New |
| `src/render/postprocessing/localTone/LocalToneMath.js` | Pure hinge gain, reference reconstruction and CPU tests | New |
| `src/render/postprocessing/localTone/LocalToneGrid.js` | Per-pipeline GPU quad/compute passes and owned RTTs | New |
| `src/render/postprocessing/localTone/LocalToneLook.js` | Small pure sky-look → bounded shader uniforms | New |
| `src/render/postprocessing/night/PurkinjeConstants.js` | Receptor matrices and conservative numeric guards | New |
| `src/render/postprocessing/night/PurkinjeMath.js` | Pure CPU receptor reference for validation | New |
| `src/render/postprocessing/night/PurkinjeNode.js` | One pure scene-linear TSL fragment function | New |
| `src/render/postprocessing/night/NightLightReference.js` | Authored sky/look → open-light proxy; no exposure feedback | New |
| `src/render/postprocessing/DisplayEnhancementConfig.js` | **Only if needed:** small common normalized value selectors used by both pipeline owners | Conditional new; do not duplicate settings parser |
| [D6] `src/render/postprocessing/PostProcessingGraph.js` | Local tone pass dependencies and per-frame uniforms; optional night shift before bloom | Minimal existing edit |
| [D7] `src/render/postprocessing/nodes/ToneMappingNode.js` | Optional pixel-local gain before current grade/curve | Minimal existing edit |
| [D2] `src/editor/stylized/StylizedGodRaysPostProcess.js` | Active-path adapter, life-cycle updates for cinematic/volumetric/screen pipelines | Minimal existing edit |
| [D3] `src/editor/stylized/pipelineOutput.js` | Pipeline-local shared pixel transform integration, only when feature is enabled | Minimal existing edit |
| [D4] `src/editor/stylized/cinematicFinish.js` | Use shared local gain after bloom before `gradeNode`; night shift before bloom | Minimal existing edit |
| [D5] `src/main.js` | Pass existing normalized settings/active sky look into correct owners; no global singleton | Minimal existing edit |
| [D17] `PostProcessingSettings.js` | Two new optional nested settings groups, default off | Existing edit |
| [D18] `PostProcessingPresets.js` | Explicit high/low/mobile treatment, no silent enable | Existing edit |
| [D19] `PostProcessingSettingsPanel.js` | Compact user controls/status | Existing edit |
| [D16] `nodes/PostCommon.js` | Effective enable/quality topology identity | Existing edit |
| [D21] `PostProcessingResources.js` | Existing owner handles graph create/retain/resize/dispose; only change if measured need | Prefer unchanged |
| [D20] `MobileProfile.js` | Confirm initial lower tier and hardware capabilities | Prefer unchanged if settings default off |
| `test/postprocessing/local-tone-math.test.js` | Reference math, smoothing, edge/window invariants | New |
| `test/postprocessing/purkinje-math.test.js` | Coefficient/reference-light, bounded outputs, neutrality | New |
| `test/postprocessing/display-enhancement-settings.test.js` | Defaults/presets/capabilities/topology | New |
| `scripts/fixtures/display-enhancements-qa.json` | **Only if existing fixtures cannot express needed cases** | Optional new |
| `docs/rendering/display-enhancements.md` | Final implementation instructions, GPU dataflow, diagnostics and QA | New |

**YAGNI rule:** avoid implementing multiple variants of the bilateral grid if one properly tested approach works on desktop. Avoid a giant central “effect framework” and avoid a full renderer convergence/rewrite under the pretence of one feature. Reuse pure math and normalized settings; allow small, path-specific *assembly* adapters for two genuinely different output pipelines.

## 9. GPU execution and memory safety

### 9.1 Preflight scheduling proof

Ponlai's [P1/P2] passes are registered in its custom `FrameGraph`. Drusniel [D6] uses Three.js `RenderPipeline` and TSL `rtt` nodes; god-rays [D2] is another chain. Before full implementation:

1. Verify **installed and resolved** Three.js version (not just `package.json` semver range); inspect Node/TSL APIs.
2. Compile a small local-tone proof with exactly **one** HDR world draw and one grid target sequence.
3. Prove sequential read-after-write: `luma → grid → blurX → blurY → apply`.
4. Prove a shader does not sample a texture it is simultaneously writing.
5. Prove the `gridY` atlas samples the current frame's `gridX`, not stale prior graph textures.
6. Run with `toneMapping` AgX/ACES, TAA/TAAU, DOF, bloom, FXAA where applicable and active god-rays paths.
7. Check extra RTT creation does not cause duplicate evaluation of an expensive source (SSR/DOF/volumetric shafts).
8. Check current WebGPU renderer passes **and** WebGL fallback behavior. If an effect depends on GPU features unavailable in fallback, disable and report.
9. Rebuild/resize/dispose graphs repeatedly; zero WebGPU validation errors and no leaked textures.
10. Avoid per-frame CPU↔GPU readbacks; only allow optional asynchronous QA diagnostic snapshots.

**Stop** if ordered passes cannot be expressed without a second world draw or uncertain read/write hazards. Ship neither “works on my GPU” nor a hidden fallback that actually changes the pipeline.

### 9.2 Aspect ratio, dynamic resolution and floating origin

- Local tone grid should be **fixed resolution** by tier, independent of 1280×720, 1600×900, 4K and TAAU 0.67/0.85.
- Sample `source` using correct normalized UV and actual buffer dimensions; no out-of-bounds GPU loads.
- An X/Y Gaussian intended to be isotropic in **pixels** must scale its Y sigma relative to the true aspect ratio.
- Do not rebuild grid targets on every tiny render-scale change. Display/scene resize may change source size and aspect uniforms without changing fixed atlas allocation.
- Floating-origin offset is **not** an input to per-pixel local luminance; retain same look under equivalent canonical camera scene.
- No motion-vector or TAA history resets are needed for per-frame local tone alone; the **existing** graph needs correct re-evaluation after any cut.
- Dynamic water/foliage continues to move; local gain should not pump because a few small bright pixels changed.

### 9.3 Approximate cost and tier policy

Ponlai's full source has four low-resolution RGBA/RG render passes **before** full-screen application; it is not “free” simply because the shader is procedural. The gather grid pass may do significant per-cell work (nested 2D tile traversal, luminance slice weights), and three tall atlas passes consume bandwidth.

**Suggested provisional targets** (not measured promises):

- **Purkinje:** target ≤0.20 ms additional p95 on user's desktop GPU with its actual camera scene; nearly all work is extra fragment ALU. Measure shader compilation and steady-state GPU separately.
- **Local tone high:** target ≤0.75 ms p95 additional GPU time at 1600×900 for grid + full-screen sampling; if measured >1.0 ms, inspect shader stalls/memory and reduce tier or reconsider the design.
- **Local tone ultra:** only allow if visual improvement vs high is clearly observable and extra cost fits the project's existing frame budget. Do **not** reject solely because it exceeds a small arbitrary number if it delivers a demonstrable visual improvement and overall performance remains acceptable.
- **Both on:** assess interaction/synergy, p95 frame/hitch gates and memory residency. “Each individually passes” does **not** imply the pair passes.
- **Both off:** zero feature passes and allocation; no measurable regression from new shared uniforms/modules.

The numerical thresholds are **aspirational engineering targets** to be recalibrated against PR B's GPU hardware evidence. Preserve original [D26] `docs/perf-qa.md` p95/hitch and streaming recovery limits as authoritative.

### 9.4 Required measurements

When GPU timestamps can separately identify local passes, capture their named costs: `localToneLuma`, `localToneGrid`, `localToneBlurX`, `localToneBlurY`, `localToneApply` and `PurkinjeShift` (the last may be fused into an existing composite fragment pass, **not a distinct pass**). Otherwise measure paired whole-frame A/B with timestamps off, and explicitly label the cost as an estimated feature delta.

Existing [D24] `GpuPassProfiler` reports sampled render passes only, **not complete GPU compute or whole-frame cost**. Follow PR B's split timestamp-on pass profiling vs timestamp-off player pacing; do not fake per-effect numbers.

## 10. Failure, rollback, capability and lifecycle contracts

### 10.1 Feature-state transitions

| Event | Local tone | Purkinje |
| --- | --- | --- |
| Initial load, feature off | No grid or passes | No shader effect active, exact input |
| Enable | Allocate fixed targets for selected active path, compile, warm up | Compile optional node/use existing look input; no new scene draw |
| Disable | Deactivate and dispose according to topology/resource policy | Factor exact zero; inactive topology eventually released |
| Quality change | Build/select distinct size topology | No change unless model variant actually changes shader |
| Numeric setting change | Uniform-only | Uniform-only |
| Sky hour/weather changes | Recompute bounded look uniforms; no atlas rebuild | Recompute reference light/night weight without reading exposure |
| Camera cut/rebase | Recompute current frame grid, no stale previous local-tone history | Current-frame look only, no residual rod history |
| TAA/TAAU/DPR resize | Source UV and blur aspect updated | Pixel input remains linear at correct stage |
| God-rays technique switch | New owner/adapter handles resources; never sample previous pipeline's RTT | Shift applied once to selected pipeline |
| Shader compile failure | Current post failure fallback; isolate bad feature topology | Preserve scene/base renderer; report once |
| Device lost/reinitialized | Discard GPU resources; mark unavailable until rebuilt | Reset capability/compiled-node generation |
| Streaming change | No expensive history reset; current frame naturally updates | Current sky reference only; no chunk-scoped cache |
| World unload / dispose | Idempotent graph/RTT disposal, listeners unsubscribed | No references retained to dead sky or GPU graph |

### 10.2 No incorrect implicit fallbacks

- No effect in the direct renderer fallback is acceptable **when the post path itself failed**. The UI must not report that the feature succeeded.
- A technique without sufficient GPU capability should be marked **unsupported/disabled** for the active path; old pixels remain.
- If `LocalToneGrid` shader compilation fails, release only owned resources and call the owning controller's documented failure path, rather than swallowing and drawing black.
- No async readback that remains outstanding after graph disposal may mutate another frame's QA state.
- If actual sky reference is invalid/zero, night shift falls back to zero (or explicitly documented conservative neutral) rather than infinite `scale`.
- No silent colour-space bypass that applies the shift in already tone-mapped/sRGB values.

### 10.3 Rollback

Set `localTone.enabled: false` and `nightPerception.enabled: false` to recover exact old presentation, ideally without requiring a full restart. If shader graph or extra RTT corrupts output, revert only PR D's owned changes and retain the previously working PR C/B/A implementations. No terrain/water/building material, world save, Azgaar biome mapping or gameplay logic requires migration. Existing draw paths, bloom and FXAA are left intact.

## 11. Comprehensive unit/visual/performance validation

### 11.1 Pure unit tests — local tone

Build `test/postprocessing/local-tone-math.test.js` with synthetic linear HDR buffers:

1. Constant 18% grey → B=0 stops, neutral settings gain=1.
2. Constant non-grey HDR → uniform gain consistent across all pixels.
3. Gradual sky gradient → no stair-stepping at grid cell/slice boundaries.
4. Synthetic black frame → finite/no NaN and no spurious white output.
5. Very bright HDR sun speckle → finite local gain and no large halo.
6. Two-region high-contrast image (bright sky over dark land) → edge-aware base stays on the correct side; compare against naive Gaussian halo.
7. Shadowed building doorway and lit wall → preserve small texture contrast in both regions.
8. One-pixel lamp in dark region → pixel remains a highlight relative to its neighbours.
9. Grid edge, corners, odd resolutions and 21:9 aspect → no atlas neighbour bleed.
10. Empty cell and empty entire slice → deterministic global/nearest-valid fallback.
11. Saturated red/blue/green and neutral grey surfaces → gain applies scalar to RGB, preserving hue for neutral operation.
12. Smooth hinge continuous and bounded for `b = -10..+6`.
13. Zero slopes / zero strength / disabled → mathematically exact input, even with nonzero hinge/knee.
14. Grid and wide blending smoothly interpolates [0,1]; no discontinuity at weight 0/1.
15. Upper/lower atlas slice clamp and filtering do not cross slice rows.
16. Output monotonic in gain where all colour components are nonnegative.
17. CPU reference and GPU synthetic fixture agree within explicitly chosen floating-point tolerance.
18. Settings defaults/normalization reject nonfinite, negative width, unknown quality and excessive gain.

### 11.2 Pure unit tests — night perception

Build `test/postprocessing/purkinje-math.test.js`:

1. Nightness 0 → exact input for arbitrary linear RGB.
2. Strength 0 → exact input at night, including very dark colours.
3. Positive current reference → finite calculated scale; zero/negative/nonfinite reference → safe disabled/guarded status.
4. Day→dusk→night transition continuous, no switch at `night=0.5`.
5. Test fixed grey, white, black, warm orange lamp, saturated red/blue/green, foliage green and deep navy.
6. Strong open light suppresses shift relative to weak open light for comparable scene colours under documented normalization.
7. Shift remains bounded and does not produce large negative channels or NaNs.
8. A single impulse in C has no persistent shift after the input returns.
9. Changing auto-exposure **alone** does not change receptor model's reference `L_ref`.
10. Same light/look and RGB produce same result regardless of prior camera history and world origin.
11. Full receptor CPU reference matches [P5] mathematical formulation and GPU output within tolerance.
12. Existing `resolveLookGrade` logic remains unchanged when D is disabled; new look blending respects nightness/overcast.
13. Validate explicit fallback naming; uncalibrated retina settings not accepted as measured physics.

### 11.3 Graph integration tests

Extend [D27] existing `test/postprocessing/post-processing-graph.test.js` and other focused graph tests:

- Features disabled → same topology signature as old baseline (or a documented stable extension), no added RTT.
- Each enabled toggle creates only the needed resources; both enabled share input data without double exposure.
- Quality tier changes signature, uniform parameters don't.
- Local tone source is **exposed post-bloom HDR**; output stage remains one tone curve and one colour-space conversion.
- Night shift feeds both main colour and bloom, but not twice.
- Post disabled/off bypasses effects and no per-frame work occurs.
- FXAA and lens dirt in god-rays finish remain once, not duplicated.
- Active path matrix accurate: cinematic, volumetric, screen-space, post-processing, raw fallback.
- Repeated camera/technique switches dispose correct pipeline-target owners.
- On forced shader failure base renderer still works and no stale post output ownership remains.
- No invalid five-component vec4 node construction (known previous Three.js issue [D7]).
- TAA/TAAU and DOF still compile, including disabled bloom and debug views.

### 11.4 Grounded visual scenes — use existing fixture IDs

[D22] has exactly these scene IDs at the inspected commit (not invented):

| Existing shot | Required visual check |
| --- | --- |
| `forest-off-12` | Shadow readability and natural tree silhouettes |
| `forest-air-off-12` | Bright skylines over canopy; horizon halos |
| `core-rainforest-off-12` | Dense leaf pattern, fine moss/understory texture |
| `core-temperate-rainforest-off-12` | Dark understory without “flat HDR” look |
| `coast-off-12` | Water glints, white foam, beach shadows |
| `coast-storm-12` | Cloud/wet darkness preserved; no light-grey ring at horizon |
| `wetland-rain-12` | Water reflections vs dark vegetation; preserve visibility metrics |
| `forest-off-18.6` | Gold-hour colour and brightness relationships |
| `forest-off-21` | Night trees remain genuinely dark; no oversaturated blue |
| `town-off-21` | Warm windows/torches, stone and dark alleys |
| `town-rain-19` | Wet evening reflections, lighting gradients |
| `glacier-off-12` | White glacier retains clean texture; no grey bands |
| `snow-eye-off-12` | Bright snow region with authored exposure compensation |
| `core-taiga-snow-12` | Snow canopy high/low luminance details |
| `grassland-off-12` | Bright day baseline/skin/grass colour |
| `tundra-off-12` | Low foliage and bright terrain/sky edge contrast |

**Use existing QA runner fixture naming and only valid IDs; the `<pose>-<weather>-<hour>` pattern above matches the inspected fixture.** Preserve all existing semantic look gates. If a scene is intended to animate (foam, rain, foliage), apply PR B's calibrated temporal/noise policy rather than a too-tight static pixel comparison.

### 11.5 Synthetic halo and material-detail metrics

Screenshots are not enough. Implement offline metrics for controlled test images:

- **Edge halo amplitude:** take an intensity cross-section perpendicular to a binary bright/dark border. Compare tone-mapped output to a target monotonic edge profile; detect unintended overshoot/undershoot outside a narrow boundary.
- **Halo width:** count how many pixels on either side have local luminance deviation beyond the calibrated baseline A/A envelope.
- **Detail retention:** use a repeated low-contrast checker/stone texture in each region. Compare local Michelson contrast or measured local standard deviation before/after, allowing the intended large-scale gain.
- **Gradient smoothness:** broad smooth sky gradient must not acquire grid/slice stripes; measure first/second finite differences.
- **Hue integrity:** for local tone only, scalar gain must preserve normalized linear RGB chromaticity where defined; compare before final global tone mapping.
- **Night hue:** record change in CIELAB/OKLab (if implemented and documented) and luminance ratio for moonlit shadows and warm lamp crops; do not invent thresholds without same-scene calibration.
- **Temporal shimmer:** repeat a gentle subpixel camera pan and local-tone gain should change smoothly, independent of TAA jitter. Record peak and p95 luminance variation in fixed world/landmark ROIs.

**The quantitative halo/detail pass thresholds must be set from a static synthetic “no effect” baseline and chosen acceptance examples, not Ponlai's island screenshots.**

### 11.6 Render-path QA is mandatory

For each supported path run:

```text
1. Force/select technique in existing UI/runtime.
2. Assert diagnostics.activeRenderPath == expected.
3. Capture source SHA, actual graph owner, viewport, quality, sky/time.
4. A: localTone=off, nightPerception=off.
5. B: localTone=on, nightPerception=off.
6. C: localTone=off, nightPerception=on.
7. D: both on.
8. Check at least one supported day/night case and one difficult sky/rock edge.
9. Record effective mode, pass/resource presence and no backend validation errors.
10. Return both off and verify A/A closeness.
```

For the cinematic path especially, check [D4] `finishFrame` has already graded the light before the renderer's output transform. If the chosen integration applies D **after** grade, that is a failure; fix stage order.

### 11.7 Hardware / startup / regression commands

Existing commands, subject to current `package.json` and dev-server instructions:

```bash
git status --short
git branch --show-current
git log -10 --oneline

npm test
npm run lint
npm run build
npm run qa:postprocessing

# Requires real WebGPU hardware and the app's development server:
npm run qa:postprocessing:browser -- --headed
npm run qa:perf -- --headed --qa chunk-cross \
  --warmup 8 --duration 12 --settle --drain-seconds 15 \
  --gpuTimings 0 --out tmp/ponlai-pr-d/chunk-cross-pacing.json
npm run qa:perf -- --headed --qa chunk-cross \
  --warmup 8 --duration 12 --settle --drain-seconds 15 \
  --gpuTimings 1 --out tmp/ponlai-pr-d/chunk-cross-gpu.json
```

Use PR B's capture manifest and A/A comparison **only if implemented**. Otherwise first complete its prerequisite evidence infrastructure; do not claim nonexistent `qa:render-regression` commands work. When running on WSL2 where Chromium has a software WebGPU adapter, use the documented Windows/native hardware path, not fake a hardware validation pass. Keep screenshots and reports under `tmp/`, not committed by default.

### 11.8 Performance acceptance and quality tiers

| Gate | Required |
| --- | --- |
| Gameplay p95/hitch/recovery | Preserve project's documented thresholds [D26]; no hidden relaxations |
| Pure disabled mode | No feature shader work/atlas allocations, pixel-equivalent output |
| Desktop high tier | Measure actual incremental GPU cost, including local grid/blur and any composite RTT |
| Ultra | Measurable **visual** improvement over high justifies incremental cost |
| Mobile | Both default off, zero extra GPU cost, graceful unsupported status |
| HDR / colour | Valid finite results, no doubled exposure, no unintended colour transfer |
| TAA/TAAU | Source resolution changes not rebuilding fixed grid; no new temporal ghosting |
| God-rays techniques | Applied to actual selected output or explicitly blocked/unavailable, never silently skipped |
| World scale | Canonical rebase unchanged perceptually; no local coordinate-dependent visuals |
| Resource/quality switches | No leaked RTT/QuadMesh/materials or stale references |
| QA integrity | Same source and fixture, real GPU adapter, timestamp limitations labelled |

## 12. PR D implementation sequence with explicit stop gates

### D.0 — Reinspect live main and dependencies

- [ ] Read current `AGENTS.md`, latest 10–20 commits and changed render-path code.
- [ ] Verify PRs A/B/C actually implemented and acceptable; **Markdown specs alone don't satisfy a prerequisite**.
- [ ] Read current `src/editor/InfiniteTerrainView.js` render selection, `src/main.js` bypass, `pipelineOutput.js`, `cinematicFinish.js` and `PostProcessingGraph`.
- [ ] Confirm actual Three.js resolved version and TSL/shader builder capabilities.
- [ ] Capture baseline screenshots/perf on post and cinematic/volumetric paths, recording active path.
- [ ] Create a short render-path capability report before writing shaders.

**Stop:** If PR C is not working and accepted, plan PR D but do not ship code that pretends `effectiveExposureNode` exists. If the active player path is bypassed, do not declare D complete after only extending the post graph.

### D.1 — Render-path stage contract and common input abstraction

- [ ] Document linear HDR versus exposed linear versus output/sRGB for every output owner.
- [ ] Identify bloom, DOF and grade insertion points for both post and god-rays finish.
- [ ] Define one shared pure TSL local-gain function and one Purkinje function, with no runtime global scene singleton.
- [ ] Test sample pipeline, debug converted/unconverted images and ensure exactly one output transfer.
- [ ] Confirm no second scene render or double grade.
- [ ] Confirm existing shader/RenderPipeline pass ordering supports an offline grid build before the final tone map.

**Stop:** If the current god-rays finish only exposes a display-space image at the integration point, refactor the smallest necessary pipeline stage and prove the resulting original image is unchanged when both effects are off. Do not colour-shift sRGB or store a broken composite.

### D.2 — Pure math and YAML/settings

- [ ] Implement `LocalToneMath` and `PurkinjeMath` CPU references with separate constants.
- [ ] Validate all finite/corner cases and unbiased/neutral settings first.
- [ ] Add nested `localTone` and `nightPerception` to existing post settings, default off.
- [ ] Add disabled YAML entries under one authoritative hierarchy, no duplicated renderer config.
- [ ] Extend quality presets, editor UI, active-path capability display and topology tests.
- [ ] Connect current resolved sky/look via minimal adapter, no duplicate sky clock.

### D.3 — Edge-aware grid in main post graph

- [ ] Create per-pipeline luma target, atlas and blur X/Y resources at high tier.
- [ ] Confirm correct source equals exposed scene+bloom at the point local gain applies.
- [ ] Implement homogeneous weighted grid/luma slice construction and guards.
- [ ] Prove exact pass order and no invalid draw/readback hazards.
- [ ] Implement eight-cell bilateral reconstruction, empty-cell fallback, wide B-spline and hyperbolic gain.
- [ ] Connect in `ToneMappingNode` before grade/curve, preserving AgX and the single output colour conversion.
- [ ] Validate A/A default disabled, synthetic edge halos and actual forest/shore/snow shots.
- [ ] Measure high tier GPU/perf/memory; only then enable optional ultra variant.

### D.4 — Purkinje model and scene-reference light

- [ ] Implement finite, neutral pure receptor reference using [P5] matrices.
- [ ] Derive current authored sky reference light once per look update; document units/calibration and absence of EV feedback.
- [ ] Add GPU `PurkinjeNode` on linear resolved scene source **before bloom**, with continuous nightness.
- [ ] Protect gamut, warm lights, saturation and strength; compare CPU/GPU synthetic colours.
- [ ] Test snow night, moonlit forest, town lamps, evening weather and sunset.
- [ ] If physical reference cannot be supported, restrict scope/status or use explicitly named/fail-closed stylistic alternative **with approval**, never falsely advertise full receptor simulation.

### D.5 — Alternate god-rays pipelines

- [ ] Adapt common D pure math to [D2/D3/D4] screen-space/cinematic/volumetric finish.
- [ ] Ensure no additional full scene render.
- [ ] Ensure effect sees the **same** linear composite the displayed pixel uses.
- [ ] Put Purkinje before god-rays bloom, local tone after composite/bloom and before `gradeNode`/output tone conversion.
- [ ] Preserve FXAA, volumetric blur, lens dirt, vignette and grain.
- [ ] Avoid duplicate settings/sky-look state; pipeline owner allocates and disposes its own targets.
- [ ] Test rapid technique switching, unsupported mode, mobile and direct fallback.
- [ ] Report effective status/activeRenderPath so users do not see an enabled toggle doing nothing.

### D.6 — Quality/performance/art review

- [ ] Run all CPU unit tests, build, lint and focused renderer tests.
- [ ] Run existing PP browser and look QA against both feature flags off.
- [ ] Run local-tone-only, Purkinje-only and combined scenes across every selected render path.
- [ ] Save screenshots/contact sheets/worst halo regions; include numeric gradient/texture/colour metrics.
- [ ] Measure actual GPU pass/workload delta with PR B's methods and no software adapter.
- [ ] Determine whether high vs ultra justifies its cost, adjusting tier policy if necessary.
- [ ] Check no unexpected post shader compilation/reflection/water/snow errors.
- [ ] Check long world travel, rebase, chunk transitions, TAAU changes and camera cuts.

### D.7 — Final review, commit, rollback

- [ ] Check one screen-space and one god-rays-path screenshot demonstrate each feature works.
- [ ] Update `docs/rendering/display-enhancements.md` with diagrams and exact input units.
- [ ] Add provenance references for any closely translated Ponlai code and file header/license notices.
- [ ] Ensure zero changes to Azgaar biome IDs, world saves, material MRT layout, terrain height generation or unrelated improvements.
- [ ] Stage only owned code/tests/docs and commit to shared `main` without force push, no branches/worktrees.
- [ ] Use no GitHub Actions; do local deterministic + hardware QA.

Suggested implementation commit message **when code and QA actually land**:

```text
feat(render): add optional edge-aware local tone and night perception
```

## 13. Explicit definition of done / acceptance checklist

### Architecture and correctness

- [ ] Verified **current** render-path selection and reached the actual player path.
- [ ] Common math, separate per-owner resources; no duplicate renderer or full-screen tone pipeline.
- [ ] One HDR world scene render per displayed frame in all supported effects paths.
- [ ] Local-tone base samples the correct **exposed, pre-grade** signal, including bloom as designed.
- [ ] Edge-aware atlas uses homogeneous weights, no luminance-slice bleed, finite guards, empty-cell fallback.
- [ ] Hinge smoothing and scalar gain preserve local detail/hue and avoid halos.
- [ ] Purkinje samples scene-linear signal and current authored light reference; no auto EV feedback.
- [ ] Existing sky/look grade, manual exposure and future PR C exposure combine without double multiplication.
- [ ] AgX/ACES, god-rays/FXAA/lens dirt and output conversion remain unchanged when disabled.
- [ ] No second tone mapper or extra post-processing controller.
- [ ] No allocations/extra passes when flags off; low/mobile remain safe.

### Robustness and QA

- [ ] All settings default disabled and old persisted scenes remain valid.
- [ ] Finite, bounded GPU outputs, with CPU/GPU reference tests.
- [ ] TAA, TAAU, SSR, DOF and bloom modes compile and render.
- [ ] Dark understory, shoreline/surf, glacier/snow, night town, sunset, storms and interior transitions reviewed.
- [ ] Halo width/amplitude and texture detail metrics meet calibrated gates.
- [ ] Warm artificial lights do not lose characteristic hue; midnight does not look like noon.
- [ ] No temporal shimmer on camera pan and TAA jitter.
- [ ] Rebase, resize, FOV/teleport, shader failure, device loss and technique switching safe.
- [ ] Real GPU p95/hitch/perf and memory costs measured; timestamps scopes correctly labelled.
- [ ] Existing A/B evidence pinned to source/camera/world/renderer path with no unknown calibration.
- [ ] Source provenance and third-party licences checked and documented.
- [ ] No GitHub Actions and no unrelated work overwritten.
- [ ] Code **actually implemented and tested**, not just specified, before marking this checklist complete.

**Automatic failure:** PR D is **not accepted** if it only affects the post-processing graph while the default cinematic/volumetric player path bypasses it; if local gain is computed from sRGB, creates big halos, blurs detail or repaints night globally blue; if bloom/exposure is doubled; if a second scene draw was added; or if unknown “troland” calibration is presented as measured physical illumination.

## 14. Handoff to PR E — physically based atmosphere and environment lighting

PR E can improve real sun/sky radiation, stable ambient response and open-reference illumination. Its integration must preserve:

- The authored sky look and weather/region blending until measured improvement is approved.
- PR C's exposure in scene-light units if implemented, with explicit optional metering constraints.
- PR D's **separate light proxy** so it can be replaced with a better open-reference irradiance signal when physically based sky irradiance becomes available.
- Edge-aware local tone's independence from world coordinates and sky shader implementation.
- No additional colour-space conversion and no duplicate grading.
- A/B captures over the same forest, coast, snow and town fixtures and **both** active render paths.

Do not retrofit PR E's physical sky into PR D, and do not use PR D to hide broken lighting.

---

## 15. Immutable Drusniel source references (D)

Every link points to the exact Drusniel revision inspected.

- **[D1]** [`src/editor/InfiniteTerrainView.js` — `render(camera)`, lines 540–558](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/InfiniteTerrainView.js#L540-L558) — **authoritative active render-path selection** and bypass issue.
- **[D2]** [`src/editor/stylized/StylizedGodRaysPostProcess.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/stylized/StylizedGodRaysPostProcess.js#L146-L203), [`ensureScenePass`, `ensureScreenPipeline`, `ensureCinematicPipeline`, `ensureVolumetricPipeline`, `render`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/stylized/StylizedGodRaysPostProcess.js#L215-L435) — three alternative render pipelines and HDR composite.
- **[D3]** [`src/editor/stylized/pipelineOutput.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/stylized/pipelineOutput.js#L1-L61) — `setPipelineOutput`, own finish, FXAA and output conversion.
- **[D4]** [`src/editor/stylized/cinematicFinish.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/stylized/cinematicFinish.js#L1-L175) — `finishFrame`, `gradeNode`, bloom, vignette, grain and lens dirt.
- **[D5]** [`src/main.js` — post-processing controller creation and bypass provider](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/main.js#L386-L417) — actual renderer/output ownership.
- **[D6]** [`src/render/postprocessing/PostProcessingGraph.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/PostProcessingGraph.js#L1-L210) — HDR MRT, AO/shafts/SSR/TAA/DOF/bloom, tone map and output conversion; [`updateUniforms`/`dispose`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/PostProcessingGraph.js#L211-L342).
- **[D7]** [`src/render/postprocessing/nodes/ToneMappingNode.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/nodes/ToneMappingNode.js#L1-L115) — scalar exposure, linear bloom addition, contrast/saturation and one selected tone curve.
- **[D8]** [`src/render/sceneExposure.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/sceneExposure.js#L1-L20) — authored scene exposure.
- **[D9]** [`src/editor/stylized/StylizedSkyView.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/stylized/StylizedSkyView.js#L415-L480) — actual `applyLook`, look nightness, sky compensation, directional/ambient lighting; [sky material](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/stylized/StylizedSkyView.js#L135-L240).
- **[D10]** [`src/editor/stylized/sky/SkyLook.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/stylized/sky/SkyLook.js#L1-L190) — sky key fields, continuous `nightness`, weather/storm blending.
- **[D11]** [`src/editor/stylized/sky/SkyLookController.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/stylized/sky/SkyLookController.js#L1-L200) — sky transition ownership and current look.
- **[D12]** [`src/editor/stylized/sky/lookGrade.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/stylized/sky/lookGrade.js#L1-L53) — existing night/storm saturation, contrast, lift and grade uniform updates.
- **[D13]** [`src/render/postprocessing/nodes/BloomNode.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/nodes/BloomNode.js#L85-L210) — bloom prefilter and existing exposed HDR pyramid.
- **[D14]** [`src/render/postprocessing/PostProcessingHistory.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/PostProcessingHistory.js#L1-L185) — TAA/SSR history ownership.
- **[D15]** [`src/render/postprocessing/PostProcessingFrameState.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/PostProcessingFrameState.js#L1-L170) — TAAU source dimensions, frame time and jitter.
- **[D16]** [`src/render/postprocessing/nodes/PostCommon.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/nodes/PostCommon.js#L1-L113) — compile-time graph signature.
- **[D17]** [`src/render/postprocessing/PostProcessingSettings.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/PostProcessingSettings.js#L1-L175) — defaults; [normalizer/store](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/PostProcessingSettings.js#L205-L510).
- **[D18]** [`src/render/postprocessing/PostProcessingPresets.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/PostProcessingPresets.js#L1-L215) — off/low/balanced/high/ultra, preserveArtistic and preset application.
- **[D19]** [`src/editor/settings/PostProcessingSettingsPanel.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/settings/PostProcessingSettingsPanel.js#L1-L250) — compact settings control lists and store.
- **[D20]** [`src/editor/exploration/MobileProfile.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/exploration/MobileProfile.js#L1-L45) — lower-quality startup preset path.
- **[D21]** [`src/render/postprocessing/PostProcessingResources.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/render/postprocessing/PostProcessingResources.js#L1-L153) — cached topology, active graph resize/retention, disposal.
- **[D22]** [`scripts/fixtures/environment-look-shots.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/scripts/fixtures/environment-look-shots.json#L1-L94), [`scripts/run-environment-look-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/scripts/run-environment-look-qa.mjs) — actual forest/coast/snow/town/night QA IDs and semantic gates.
- **[D23]** [`scripts/run-post-processing-browser-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/scripts/run-post-processing-browser-qa.mjs) — actual browser backend, presets, frame capture, errors and source checks.
- **[D24]** [`src/editor/performance/qa/GpuPassProfiler.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/src/editor/performance/qa/GpuPassProfiler.js#L1-L115) — sampled render-pass timestamps, limited scope.
- **[D25]** [`docs/rendering/post-processing.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/docs/rendering/post-processing.md#L1-L170) — current graph and MRT ownership, material override warning.
- **[D26]** [`docs/perf-qa.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/docs/perf-qa.md) — authoritative movement/streaming/hitch/gpu QA guidance.
- **[D27]** [`test/postprocessing/post-processing-graph.test.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/test/postprocessing/post-processing-graph.test.js) — graph signature and topology unit tests.
- **[D28]** [`editor.config.yaml`](https://github.com/danielsobrado/drusniel-world-builder/blob/f96a386775e0e237ddcddc0073a76af1d19b01d4/editor.config.yaml) — authoritative `stylizedSurface.postProcessing` and separate `cinematicFinish` blocks.

## 16. Immutable Ponlai source references (P)

These are actual working files inspected in the upstream repository, pinned to its current commit; adapt **techniques**, not entire infrastructure.

- **[P1]** [`packages/render/post/LocalTone.ts` — algorithm commentary and grid constants](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/LocalTone.ts#L1-L132); [`LocalTone` constructor, pass declarations, `apply`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/LocalTone.ts#L133-L270); [`lumaPass`, `gridPass`, `blurPass`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/LocalTone.ts#L270-L420).
- **[P2]** [`packages/render/post/PipelineDisplay.ts` — source composite, bloom, sharp image, local tone and grade](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/PipelineDisplay.ts#L235-L358) — crucial operation ordering. **Includes tidewater-adapted MIT portions in its file header**, so audit attribution if closely translating code.
- **[P3]** [`packages/render/post/Exposure.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Exposure.ts#L1-L160) — target/exposure filtering, not to be reimplemented by D.
- **[P4]** [`packages/render/post/Metering.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Metering.ts#L1-L310) — HDR histogram/reference source, not a dependency on a new meter.
- **[P5]** [`packages/render/post/Purkinje.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/Purkinje.ts#L1-L103) — perceptual model, receptor coefficients, `purkinjeScale` and `purkinjeShift`.
- **[P6]** [`packages/render/post/PipelineDisplay.ts` — `postConstants`, `purkinjeScale` from open light and pre-bloom integration](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/PipelineDisplay.ts#L195-L280) — why light proxy is not an exposure readback.
- **[P7]** [`packages/render/look/DisplayLook.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/look/DisplayLook.ts#L1-L120) — sky/day/night colour tables, `retina` and `strength`.
- **[P8]** [`tools/kit/parity/README.md`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/kit/parity/README.md#L1-L105) and [`tools/kit/diff-set.py`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/kit/diff-set.py#L1-L135) — A/A noise floor, spatial crops and synthetic diff discipline.
- **[P9]** [`docs/reference/profile-frame.md`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/docs/reference/profile-frame.md#L57-L92), [`tools/render/profile-frame.mjs`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/tools/render/profile-frame.mjs#L1-L155) — timestamps versus player-visible frame pacing.
- **[P10]** [`packages/render/post/DayKeys.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/DayKeys.ts) — how look parameters blend across time/weather, **not** a reason to copy Ponlai's scene look registry.
- **[P11]** [`packages/render/post/graph/FrameGraph.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/post/graph/FrameGraph.ts) — explicit graph-resource ordering, **not** a drop-in replacement for Three.js `RenderPipeline`.

### References and licensing background

- [Patry, *Real-Time Samurai Cinema: Lighting, Atmosphere and Tonemapping in Ghost of Tsushima* — SIGGRAPH 2021](https://advances.realtimerendering.com/s2021/) — source paper/talk for look/perception approach and cinematic tone.
- [Chen, Paris, Durand, *Real-time Edge-Aware Image Processing with the Bilateral Grid* — SIGGRAPH 2007](https://people.csail.mit.edu/sparis/publi/2007/siggraph/) — bilateral-grid image processing.
- [Ponlai MIT licence](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/LICENSE) and [third-party CREDITS](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/CREDITS.md) — verify notices on closely translated code.
- [Three.js official WebGPU documentation](https://threejs.org/docs/#api/en/renderers/webgpu/WebGPURenderer) — check APIs against **installed** Three.js, not copied upstream names.

---

**Implementation handoff:** PR D must preserve Drusniel's authored atmospheric and nighttime character while selectively improving large-scale contrast and low-light perceived colour. Adapt Ponlai's mathematics, fixed-grid edge-aware reconstruction and receptor model, but respect the critical split between Drusniel's main post-processing graph and its alternate god-rays/cinematic finish. **No successful acceptance without both render-path evidence and physically honest light-reference calibration.**
