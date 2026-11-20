# Ponlai integration — PR F: streamed chunk sky-visibility probes and spherical-harmonic ambient lighting

**Status:** IMPLEMENTATION SPECIFICATION ONLY — no probe generator, GPU volume, material patches or tests are implemented by this commit  
**Date:** 2026-11-20  
**Target:** [Drusniel World Builder](https://github.com/danielsobrado/drusniel-world-builder), commit specification on shared `main`  
**Drusniel source inspected:** [`c990d37ee50d3991e8c6f6ccaf2435b31747fabe`](https://github.com/danielsobrado/drusniel-world-builder/tree/c990d37ee50d3991e8c6f6ccaf2435b31747fabe)  
**Ponlai source inspected:** [`cca905649fe657458697a9e1b179113c97ce5e6e`](https://github.com/HuberyLL/ponlai/tree/cca905649fe657458697a9e1b179113c97ce5e6e)  
**Position:** PR F of the Ponlai A–L programme; Phase 4, part 1  
**Previous specs:** [A rendering foundation](ponlai-pr-a-render-foundation-2026-11-20.md) · [B visual/performance QA](ponlai-pr-b-deterministic-render-qa-2026-11-20.md) · [C auto exposure](ponlai-pr-c-hdr-histogram-auto-exposure-2026-11-20.md) · [D local tone/Purkinje](ponlai-pr-d-local-tone-purkinje-2026-11-20.md) · [E atmosphere/IBL](ponlai-pr-e-atmosphere-environment-lighting-2026-11-20.md)  
**Next:** **PR G** — sky relighting refinements, ground/sea/foliage bounce, material occlusion and receiver expansion  
**Rules:** main only, preserve latest concurrent work, no branches/worktrees or GitHub Actions, KISS/YAGNI/SOLID, small modules, YAML config, no performance-budget exceptions without evidence, respect Azgaar ID rules

> **Baseline warning:** The A–E files are **specifications, not demonstrated implementations**. PR F must run against **actual current code**, not APIs proposed in earlier plans. In particular PR E's dynamic atmosphere panorama/sky harmonics may not yet exist. PR F can use existing `StylizedSkyView` authored light as a **fallback sky source** in that case, but must not pretend it has physically calibrated `skyRadiance` or a new `environmentSlabs()` API.

---

## 1. Goal, product outcomes and narrow PR F boundary

Produce an efficient **streamed world-space representation of directional sky visibility** around the player, projected to **nine real spherical-harmonic (SH) coefficients per probe**. Use those probes to inform an **optional** ambient-diffuse receiver on the **outdoor terrain** without creating extra scene lights, darkening everything twice or hurting chunk traversal.

### What it should look like

- A clear gap between trees receives more diffuse sky light than the floor behind a cliff or beneath a dense canopy.
- The **direction of open sky** matters: a shaded rock face pointed toward an open valley gets different ambient light from a face pointed into a hill.
- Changes in the authored sky from clear noon through overcast, sunset and moonlight relight probes **without retracing geometry**.
- The transition across a streaming chunk boundary is smooth; no 64 m square, horizontal stripe, tile-edge line or one-frame dark flash.
- Sky occlusion is **not** a new contact AO pass. Fine trunk/rock contact darkening remains in existing forest-floor/GTAO systems; probes represent low-frequency directional visibility.
- The world remains just as responsive to movement, terrain sculpting, edited biome tiles, imported Azgaar terrain and floating-origin rebases.
- Standard materials that cannot yet safely participate remain on existing hemisphere/environment lighting, rather than receiving guessed “GI” through emissive.

### PR F deliverable contract

1. **Canonical, deterministic probe lattice** with stable SH projection, world-relative coordinate handling and compact versioned binary layout.
2. **Bounded outdoor visibility trace** using available heightfield and **only validated, explicitly opted-in** coarse static occluder providers.
3. **Separate low-priority, cancellable probe preparation lane** or equivalent scheduled sidecar to the existing terrain worker stream; terrain publication stays first priority.
4. **Bounded CPU and GPU residency** around the camera with stable edge/halo rules, reliable invalidation and atomic publication.
5. **Debug inspection** of SH sky visibility, probe validity/relocation, seam weights, receiver coverage and fallback.
6. **At least one validated outdoor PBR ambient-diffuse receiver** (terrain pilot) that replaces its selected ambient component instead of adding a second one; otherwise report the receiver as **pending**, not “implemented”.
7. **Shared sky state** from existing sky authority or PR E if implemented; **one** radiance/exposure scale contract.
8. Existing QA, synthetic CPU/GPU reference tests, real hardware A/B scenes, movement and edit performance gates, and one-switch rollback.

### Strictly out of scope for F

- Ground/foliage/sea **multi-bounce** or coloured bounced irradiance (PR G).
- Replacing current world/cloud/sky atmosphere, sun shadows, GTAO, forest-floor micro-shadow or fog with a generic GI framework.
- Replacing the entire PBR lighting model of every tree, building, GLB hero, grass blade, stone, water material and underground location.
- Whole-world dense 3D textures over unlimited Azgaar coordinates or scanning *every* loaded settlement object on the main thread each frame.
- A generic physics/SDF voxel engine, scene-wide ray tracing or any N-ray-per-probe GPU raymarch every rendered frame.
- Treating moving players, dynamic spell lights, wind-bent foliage or weather as static probe blockers.
- A second world clock, lighting rig, exposure model, runtime world data format or duplicated YAML owner.
- Importing Ponlai's entire 80-float/probe format, 7-slab full relight target or 1-bounce tracer unmodified: those belong substantially to PR G.

**Non-negotiable:** if the shared Three.js lighting pipeline cannot safely replace only ambient diffuse on the pilot receiver, F may finish the **probe data foundation** but must truthfully leave production diffuse application unshipped. Do not fake ambient integration by multiplying baseColor/emissive or writing extra scene light.

---

## 2. Pinned source-to-source map and critical differences

| Area | Drusniel verified owner | Ponlai verified reference | PR F adaptation |
| --- | --- | --- | --- |
| World topology | [D1] `InfiniteWorldStore`, [D2] `WorldCoordinates` | [P1] island `AmbientProbes` | Deterministic **unbounded** canonical X/Z; no island box or finite map assumption |
| Chunk dimensions | [D3] `editor.config.yaml`: tile=2 m, chunk=32 cells → **64 m/chunk** | [P1] 16 m island tile, 2 m probe spacing | **Do not copy** 2 m island lattice; start ~8 m outdoor probe spacing, measure |
| Terrain residency | [D4] `InfiniteTerrainView.updateStreamingFrame`, [D5] `TerrainStreamingPlan` | [P2] `WorldChunks`, [P3] `ChunkMerge` | Match *current+predicted* resident selection, separate probe budget, not one merged island volume |
| Worker generation | [D6] `WorldChunkWorkerClient`, [D7] `worldChunk.worker`, [D8] `generateWorldChunk` | [P4] `chunkWorker`, [P1] `bakeProbes` | Low-priority sidecar; do **not** expand every mandatory terrain page with expensive ray work |
| Editor patches | [D1] change events, [D4] `onWorldChange` | [P2] deterministic chunk-version/cache keys | Invalidate probes within **trace support radius** around edits; generation guards |
| Material ownership | [D9] `TerrainSlotBindings`, [D10] `terrainMaterial` | [P5] `AmbientSample` | One terrain shader for 49 slots, per-object probe bindings only if proven and sampler-safe |
| Terrain surface | [D10] terrain height/displacement, existing forest-floor shade | [P1] ground/SDF visibility | Terrain height and canopy/settlement coarse visibility; avoid double baked shade |
| Forest shading | [D11] `forestFloorTexture` R canopy/G contact | [P1] grove transmittance | Low-frequency canopy occlusion only; benchmark against existing shade and reduce overlap |
| Sky owner | [D12] `StylizedSkyView`, [D13] `skyAmbient`, [D14] `sceneEnvironment` | [P6] `AmbientSky` in `AmbientRelight` | Project sky SH from existing look/IBL or PR E, with clear fallback and source units |
| PBR ambient injection | [D12] hemisphere + scene.environment, [D10] material | [P5] `ambientEnvironment`, [P7] `AmbientGrade` | Replace diffuse component only; specular IBL kept; preserve lighting energy |
| SH math | No current 9-band shared probe system identified in renderer | [P8] `ProbeFormat`, [P9] `Harmonics` | Nine real SH coefficients, exact y-up normalization and cosine-lobe factors |
| GPU residency | [D4] fixed slot pool + [D9] per-object textures | [P10] `AmbientVolume` 3D texture, shared storage | Bounded slot-aligned GPU pages/atlas, no unbounded 3D volume, no per-slot shader compilation |
| Per-frame relight | [D12] authored look; PR E optional | [P6] `AmbientRelight` relights whole island | Only **sky-only ambient** in F. PR G adds bounce/sea and full relight; avoid two separate GI stores |
| Other AO | [D15] GTAO, [D16] cinematic contact AO, [D11] forest floor | [P5/P7] per-material ambient grade | A/B all render paths and prevent darkening AO twice |
| Custom lighting locations | [D17] `LightBake` / `LocationShading` | [P5] receiver integration | **Do not** inject outdoor probes into closed dedicated locations / lamp bakes |
| Performance | [D18] `TerrainCommitQueue`, [D19] `docs/perf-qa.md` | [P2] worker budget / [P10] staged uploads | No new worker hot-path stall or asset-startup regression |
| Floating origin | [D20] `FloatingOrigin` | [P1] finite island coordinates | Canonical double-precision CPU, camera-relative small GPU coordinates; no huge float world positions |
| Azgaar compatibility | [D1/D21] import/world format, [D22] `AGENTS.md` | Not modeled in Ponlai | Keep biome IDs 0–12 and custom 32–254; no procedural biome remapping |

**Important actual-code discovery:** Drusniel [D4] creates one shared terrain material for its slot pool. [D9] documents that 49 separate material compilations cost ~0.6 s each and ~17 s on first player entry. Any F implementation that creates 49 materials or injects a new per-slot shader function **fails architecture review**.

**Another real mismatch:** [D11] `forestFloorTexture.js` comments describe an earlier 128 m chunk shape, but current [D3] config has 32 cells × 2 m = 64 m per chunk. Derive probe spacing/halo/texture dimensions **at runtime from current chunkSize and tileSize**, not stale comments or Ponlai's 16 m island tiles.

---

## 3. Ponlai design analysis: exactly what to adapt, exclude and defer

### 3.1 [P1] `packages/island/world/AmbientProbes.ts`

Ponlai's **finite island** CPU worker baker uses:

- Fixed **2 m** lattice across X/Y/Z; a 16 m chunk owns an 8×8 set of X/Z columns.
- Fixed vertical extent tied to the island's sea level, plateau and bamboo crown height.
- Fibonacci sphere rays (`RAYS=128`), fixed sample ordering and projection weights `4π/N`.
- Cached voxel occupancy from ground, cliffs, stones and bamboo growth; primary visibility bounded to 20 m horizontally and bounce to an additional 10 m.
- Sky visibility, sea visibility, one-bounce coloured sky light, grove in-scatter, and offset/valid flag per probe.
- Probe relocation out of solids within half a cell using deterministic 0.25 m candidate steps; deeper solids become invalid.
- Chunk-worker bake, merge in canonical chunk order, gap fill and open-sea fallback.
- **Each original probe is 80 floats** from [P8] (`PROBE_STRIDE=80`), including 9 vec4 sky+RGB bounce, 7 vec4 scatter, 3 vec4 sea, and 1 vec4 relocation/validity. Useful for Ponlai's full GI; *unnecessary for our F visibility-only phase*.

This is robust upstream math but **not an immediately applicable shader or cache** for Drusniel's streamed unbounded map.

### 3.2 [P8] `ProbeFormat.ts`: basis/ordering compatibility

Ponlai uses Three.js's real, orthonormal, **degree-2** spherical harmonics (SH), Y up, indices 0–8:

```text
Y0 = 0.282095
Y1 = 0.488603 * y
Y2 = 0.488603 * z
Y3 = 0.488603 * x
Y4 = 1.092548 * x*y
Y5 = 1.092548 * y*z
Y6 = 0.315392 * (3*z*z - 1)
Y7 = 1.092548 * x*z
Y8 = 0.546274 * (x*x - y*y)
```

**Do not accidentally use an engine's SH order in which the Z axis is “up” or flip Z because Drusniel's world cell Z is negated.** Geometry uses **render world Y up** and [D2] maps cell Z to **negative** render world Z. The SH directions and normals must use render convention consistently.

For a scalar visibility function `V(ω) ∈ [0,1]`:

```text
v_lm = ∫sphere V(ω) Y_lm(ω) dω
     ≈ (4π / N) * sum_(i=0..N-1) [ V(ω_i) * Y_lm(ω_i) ]
```

The integral is over **the full sphere**; below-ground rays are blocked by geometry rather than automatically treated as sky. This is the base of F.

### 3.3 [P9] `Harmonics.ts`: convolution and product

For **radiance coefficients** `a_i`, diffuse irradiance at normal `n` follows:

```text
E(n) = sum_(i=0..8) [ k_l(i) * a_i * Y_i(n) ]
k0 = π
k1 = 2π/3
k2 = π/4
```

**The cosine convolution is applied exactly once** to incident radiance, never to a projection that was already convolved. [P9] supplies `COSINE_LOBE` in that ordering.

To combine sky incident light with geometry visibility, **do not** simply multiply `SH_sky[i] * SH_visibility[i]` coefficient-by-coefficient: the projection of a product is a convolution through Gaunt triple integrals:

```text
L_local(ω) = L_sky(ω) * V_probe(ω)

c_k = sum_i sum_j [ sky_i * vis_j * G_ijk ]
G_ijk = ∫ Y_i Y_j Y_k dω

E_local(n) = sum_k k_l(k) * c_k * Y_k(n)
```

A **degree-2 truncation** is low-frequency; sharp windows/small gaps cannot remain pin-sharp. Do not promise light shafts or detailed sun shadows from this probe representation.

**Implementation decision for F:** either implement an efficient, tested sky×visibility SH product (GPU batch after sky-source update, or carefully bounded CPU batch) and sample the resulting irradiance, **or** label receiver output `uniform sky SH visibility approximation` and restrict it to debug/pilot. **No fake SH relighting** by scalar multiplication of arbitrary coefficients. PR G will extend from the same SH framework with bounced light.

### 3.4 [P10] `AmbientVolume.ts` and [P5] `AmbientSample.ts`

Upstream has one island-scale 3D lattice, per-probe GPU storage, a relit `Storage3DTexture` with **seven Y slabs** of RGBA16F to store RGB SH9 and sky view factor, and one sample per slab (filtered trilinearly). It retains old buffer/textures during a version swap and changes node value rather than shader graph to avoid recompiling materials.

Upstream receiver details:

- Trilinear volume sampling around a point.
- **Surface sampling bias** roughly 0.5 m along normal and 0.25 m toward eye, preventing thin walls from blending light from the wrong side.
- Hole/invalid-probe relocation and fill.
- An open-sea fallback beyond the finite island box.
- Ambient diffuse **replaces** the existing environment irradiance in the custom lighting model; specular IBL remains, with separate specular occlusion.
- Light is nonnegative/finite and an optional receiver weight allows blending to existing default diffuse.

**Adapt:** preserve the single shader graph, local sample bias, seam-safe volume filtering, atomic data swap and replacement semantics.

**Reject for F:** global island-width volume with a permanent “sea column”; 7-slab bounce texture if only sky visibility is computed; swapping undefined/black textures; global module `installed!` singleton in a shared renderer; per-fragment >16 sampler bindings.

### 3.5 [P6] `AmbientRelight.ts` — intentionally split F versus G

Ponlai's full relight multiplies probe sky visibility by **sky SH** and adds **sky bounced** and **sun/key/sea** terms, local cloud attenuation, controls and temporal-independent recalculation. F should implement only the *sky visibility* and a **simple validated first ambient relight**. PR G handles:

- coloured surface bounce from geometry and foliage,
- water/sea visibility and Fresnel-aware contribution,
- cloud shadow and sun/key bounce,
- deringing for combined bright key/direct lobe,
- specular environment occlusion,
- wider material receiver coverage.

Design F's storage version and output interface so G can append these channels via a **new format version**, rather than shipping 80 floats unused now.

### 3.6 [P2/P3/P4] worker and merge model

Ponlai's island bakes complete chunk sets and then merges them, possibly using idle-step iterators. Drusniel [D4] already **streams slots continuously**, cancels queued work, and commits one terrain page per frame while moving. It should **not** wait for all probes in an area before showing terrain, nor block terrain pages behind probe rays. The nearest accepted analogy is a **separate sidecar cache keyed by canonical chunk and source revision**, with optional uploaded per-slot patches.

---

## 4. Drusniel's streaming architecture: exact integration requirements

### 4.1 [D1/D2/D3/D5] canonical coordinate identity

The current config includes:

```yaml
world:
  tileSize: 2
  # other world settings
streaming:
  chunkSize: 64   # Example only; inspect precise indentation and actual value below
```

**Correction / authoritative observed fields** (not the illustrative structure above):

- The inspected `editor.config.yaml` top block has `tileSize: 2` and `chunkSize: 32`, while a **separate** streaming block has `chunkSize: 64`. The source of truth for terrain generation/slot dimensions is **`worldStore.chunkSize`**, not any single printed YAML key without tracing how config loaders merge it.
- [D4] explicitly uses `worldStore.chunkSize * worldStore.tileSize` for `chunkWorldSize`; [D4] `createSlot` allocates its `tileTexture`/`heightTexture` from `worldStore.chunkSize`.
- [D2] `chunkKey(chunkX,chunkZ)` joins signed safe integers with the project separator, not an ad-hoc string format.
- [D2] maps world X to cell X and world Z to **negative cell Z**. [D5] `createTerrainChunkDescriptor` centre: `worldZ = -(originCellZ + size/2)*tileSize`.

**Mandatory audit:** record the **actual runtime** `worldStore.chunkSize`, `worldStore.tileSize` and `terrainView.chunkWorldSize` in the QA manifest. A prose comment mentioning “128 m chunks” is not source-of-truth. Two simultaneous chunk-size notions must be resolved before calculating probe counts and cache keys.

### 4.2 [D4] slot pool, draw material and generation tokens

Verified current flow:

```text
player focus + velocity
 -> TerrainStreamingPlan.selectTerrainResidentDescriptors
 -> current+predicted load/unload radius, capped by slot pool
 -> createTerrainSlotPlan
 -> assignSlot(slot, descriptor)  [increments slot.token]
 -> worldStore.requestChunk(chunkX,chunkZ)
 -> commitQueue enqueue guarded by token/key
 -> commitPage(ready) [tile/mask/height memcpy; height bounds; texture flags]
 -> mesh visible
```

- [D4] `TerrainCommitQueue` is a **critical path**, currently [D18] at most **one terrain commit per moving frame** and a 2 ms budget.
- Probe bake must run *after* or parallel to terrain visibility, never hold terrain waiting for a ray trace.
- A probed slot is not identified by `slotIndex` alone: it needs current **chunk key, source version, slot token** and prepared **neighbour halo** version.
- Discard late probe output when the slot has already been reassigned. Never update a new chunk with an old chunk's sky visibility.
- Allow “terrain visible, probe still missing” indefinitely; fallback to existing scene ambient, with diagnostics of probe coverage.

### 4.3 [D9] shared material is the primary shader-architecture constraint

[D9] documents that the one shared terrain material is a deliberate fix for large compile-time startup hitches. Its `slotTexture` and `slotVector2` use `onObjectUpdate` bound to `mesh.userData[TERRAIN_SLOT_KEY]`.

**Required design:**

- Maintain **one** compiled terrain PBR material for all slots.
- A new probe data texture may use the same per-object dynamic binding pattern, **provided** the new texture target and shader footprint compile safely and per-object values update every draw (including post/cinematic paths).
- **Do not** add a new sampler casually. [D9] explicitly states WebGPU fragment stage **16 sampler** limit and that terrain already uses every one. Use **samplerless textureLoad** with explicit interpolation where feasible, or a single bound global texture atlas if tested better.
- DataTexture `.needsUpdate` uploads can still cause GPU/driver stalls. Commit probe bytes under an independent GPU upload budget, not in `commitPage`.
- Keep the probe texture format the **same** for all enabled slots so node identity/Shader program is shared.
- A slot with no probe data binds a valid neutral sentinel texture (same format); never leave null/uninitialized GPU texture on the material.
- Reassigned slot binds the neutral sentinel **before** its new terrain is visible so previous chunk's old lighting never appears.

### 4.4 [D10/D11] existing canopy and contact AO

Current `terrainMaterial` samples `forestFloorTexture`:

- R = canopy shading of forest floor.
- G = contact shade from trunks/rocks.
- B = litter/ground exposure.
- It also has `floorFill = foliageSkyFill(...)*forestFloor` injected into `emissiveNode`.
- [D15] world GTAO and [D16] cinematic/volumetric contact AO provide independent tight occlusion.
- Snow/ground wetness can have additional material-specific shading.

**Critical:** if F also attenuates the PBR ambient diffuse by low-frequency sky visibility, the existing **canopy R** term and `floorFill` may double darken or artificially re-light the same forest. An effective pilot must **measure** the pre/post ambient components and potentially narrow or rebalance existing canopy-fill effect **only when probe receiver is actually active**. Do not globally remove existing canopy/understory treatment or ambient AO because a debug sphere shows plausible SH.

The probe's job is **directional sky light** at metre-scale; it is not a replacement for G-channel contact at 2–3 m around a trunk. Probe resolution 8 m cannot represent a 0.2 m trunk contact correctly.

---

## 5. Canonical lattice geometry for a huge edited landscape

### 5.1 Probe column grid — proposed first tier

Given actual terrain chunk span `S = worldStore.chunkSize * worldStore.tileSize` (metres), define an integer global probe stride `P` satisfying `S/P` integer in the selected configuration.

For the **inspected typical 64 m runtime chunk** a proposed **8 m** spacing gives:

- `S/P = 8` ownership intervals per X/Z.
- Include **one shared boundary column** for interpolation: `9 × 9` columns per chunk (`(S/P+1)^2`).
- Use **4 relative-to-terrain vertical levels**, prototype at offsets `[0.6, 2.5, 8, 18]` m above local terrain; **NOT** Ponlai's global fixed `Y0=-2` to `22`.
- Total raw probes per chunk: `9×9×4 = 324`, including duplicated boundary samples.
- Visibility storage: **9 SH floats + 3 position-offset floats + validity/occupancy**. Prefer packed alignment as **16 floats per probe**, 64 bytes.
- Raw per-chunk CPU data: `324×64 = 20,736 bytes` ≈ **20.25 KiB**, before metadata, halo/worker buffers/cache overhead.
- For 49 resident slots: `49×20,736 = 1,016,064 bytes` ≈ **0.969 MiB** CPU raw, **plus** similarly sized GPU visibility storage and any computed RGB irradiance atlas.
- A 256-probe alternative with 8×8 columns without shared boundaries saves bytes but needs guaranteed cross-chunk seam access and makes streaming gaps more expensive to interpolate.

**These are PROPOSALS, not claims of current or Ponlai values.** Actual runtime chunk span may be 128 m if a different config block feeds `worldStore.chunkSize`. Calculate widths from the **resolved** store, assert divisibility, and choose a tier by physical metres, not tile-ID count.

**Memory estimation excludes:** temporary ray cache/voxel occupancy, triangle/heightfield acceleration, metadata, worker clones, GPU row padding/alignment and staging uploads. The probe grid is small; trace time and residency synchronization are likely harder than raw memory.

### 5.2 Terrain-following columns: why not one global fixed-height volume

Drusniel spans coast, canyon, 8 km mountain, imported Azgaar macro terrain, coastal cliff and forest. A uniform fixed Y grid covering all altitudes at 8 m intervals would be mostly empty and unbounded.

Use **2.5D terrain-following columns**:

```text
for global probe column (ix, iz):
  canonicalX = ix * P
  canonicalZ = iz * P
  h = authoritativeHeight(canonicalX, canonicalZ)
  for vertical level k:
    Pworld = (canonicalX, h + heightOffsets[k], canonicalZ)
    evaluate sky visibility at Pworld
```

- The height is from the **exact same source** and **edits** as the rendered terrain; do not use a different noise function.
- Global columns make the same boundary probe appear at **identical** canonical coordinates, independent of which chunk baked it or worker order.
- Compute vertical interpolation against a bilinearly interpolated local terrain reference height at the sample point, not against a single chunk-minimum altitude.
- A free point in a steep cliff may be inside an adjacent terrain bank; relocate along the gradient/shortest escape within a bounded search or mark invalid.
- This is **not** a full volumetric probe lattice for caves, towers or tall settlements. Those receivers are not supported by F until separate structural-volume support is designed and validated.
- Avoid a separate ground plane assumptions at sea level; water/underwater and sea bounce are PR G, not F.

**Important caveat:** bilinear interpolate from terrain-following columns only if the surrounding vertical levels sample corresponding physical regions. At a cliff, one column's 2 m above-ground may lie 30 m above another's; naive trilinear interpolation causes leaking. Use terrain-normal-aware weighting, a height-discontinuity gate and a neutral fallback. If a coarse 2.5D surface-following grid fails large cliff QA, support **per-region vertical slices** in a bounded pilot or defer cliff receiver; do not obscure the flaw.

### 5.3 Shared boundaries and halos

A probe ray may read terrain/geometry **outside its owner chunk**. If two jobs use different halo data or unavailable neighbour terrain, boundary coefficients disagree even if their positions are identical.

Define:

```text
OWNED_CELLS = [cx*S, (cx+1)*S) × [cz*S,(cz+1)*S)
TRACE_RADIUS_M = 20  // initial sky-visibility proposal, tune by QA
HEIGHT_HALO_M >= TRACE_RADIUS_M + interpolationSupport + safetyMargin
GEOMETRY_SNAPSHOT = deterministic region of all terrain/occluders inside halo
PROBE_REVISION = hash(generator, overrides, occluders, format, lattice, bounds)
```

- Include **both sides** of the boundary in read-only worker snapshots.
- For nearby tall cliffs/canopy occluders outside the trace radius, choose a documented horizon approximation (heightfield long-distance skyline or distance-capped) and measure visual bias.
- Never store a boundary probe from a neighbour that used a **different** terrain edit revision.
- Restrict each owner chunk's **core** to the half-open interval and store shared boundary copies for reads. Two owners may bake the same probe; hash exact bit values to detect disagreement.
- When neighbour chunk is missing, interpolation toward its boundary uses the most recent **valid globally equivalent** probe or neutral open-sky reference; never read random/uninitialized atlas bytes.
- Reupload only modified probes/slot data, not all 49 resident pages when one brush stroke changes one chunk.

### 5.4 Floating origin / high canonical coordinates

[D2] and [D20] make X/Z safe integer cell coordinates and camera-relative float renderer positions. Work in high-precision **canonical CPU metres/cells**, but pass to GPU:

- Position **relative to the current chunk origin or floating-origin render frame**, never raw canonical X/Z into shader float32.
- Per-slot lookup may use `terrainUv` and resolved per-object slot grid: **no need for absolute canonical X/Z in the probe sampler**.
- For height interpolation, use terrain shader's existing displacement/terrainHeight and per-object chunk buffer. Don't reconstruct height from a noisy independent function.
- If object/settlement receivers join later, convert their render position through the shared floating-origin transform once per draw and sample in camera-local window.
- Rebase must not force **any** re-bake; it changes only buffer origin uniforms / position transforms.
- The canonical probe identity `(floorDiv(cellX, spacingCells), floorDiv(cellZ, spacingCells), verticalLevel)` must handle negative cells and be independent of arrival path.

### 5.5 Lattice quality tiers

Proposed starting matrix, chosen by physical spacing and hardware:

| Tier | Columns for 64 m chunk | Vertical levels | Probe points | Expected role |
| --- | --- | --- | --- | --- |
| `off` | 0 | 0 | 0 | Default / mobile |
| `balanced` | 5×5 (16 m) | 3 | 75 | Coarse visibility/sky fill |
| `high` | 9×9 (8 m) | 4 | 324 | Preferred desktop pilot |
| `ultra` | 17×17 (4 m) | 5 | 1,445 | Only if clear quality gain and worker cost acceptable |

**Performance warning:** `ultra` has ~4.46× the high probe count and may require more ray work per point. At 128 rays/probe, **high** already proposes ~41,472 primary ray traces/chunk, ultra ~184,960. Ray-march **steps** compound that; do not silently bind all probes to mandatory terrain worker replies.

Use ≤3 quality tiers only if actual QA proves distinct benefits. “Ultra” is not mandatory to ship F.

---

## 6. Worker-side sky-visibility ray tracing

### 6.1 Pure inputs, no renderer/DOM

Proposed `createProbeScene(snapshot)` in worker receives only:

- Canonical chunk descriptor and halo bounds from [D5].
- Versioned authoritative terrain height sampling data already prepared or generated from the existing world generator + current edits.
- Explicit coarse static occluder **providers** (if available and deterministic) with bounds/revisions; do not use every Three.js mesh at runtime.
- Optional validated canopy attenuation field at the same canonical positions and deterministic source version.
- The chosen lattice/tier, ray count/reach, fixed seed and format version.

**No** imports from Three.js, window/document, GPU node modules, mutable UI, actual scene graph/geometry material creation or wall-clock timing in numerical result. “Time spent” diagnostics may use `performance.now` but must not affect coefficients.

### 6.2 The key architectural choice: sidecar vs `generateBaseWorldChunk`

[D8] currently produces tile/height/surfaceMask/water/scatter pages; [D7] transfers their typed arrays. The user has already optimized that pipeline to a capped, prioritized worker and critical-path commit queue.

**Preferred approach:** introduce a distinct, bounded `probe` worker job (or separate one-worker side lane) that **requests the same generator/edited terrain snapshot** and returns a *probe-only binary page*. Terrain job results must remain unchanged and may publish first. Reuse existing worker infrastructure where practical but ensure:

- Dedicated priority class below terrain base pages and collision/critical placement preparation.
- At most one or explicitly configured small number of probe jobs concurrently.
- No expensive top-level shared-generator duplication if it would cause worker memory spikes.
- Existing failure/backoff/restart path, with a **probe-only** error status.
- No silent fallback to synchronous 41k-ray work on the main UI thread when worker unavailable.
- Complete requests can be cached by deterministic `probeKey` separately from terrain page cache, with memory cap and eviction.
- The probe workload must not delay worker generation of visible terrain or change terrain page transfer shape when disabled.

**Alternative** (if measured faster and clean): add a **separate optional** second phase after `generateBaseWorldChunk` generated source data but **only** when it can execute outside the worker's terrain-critical lane. The implementer must prove source preparedness, queue isolation and unchanged first-visible-page latency; no “optional” callback inside the mandatory worker path that adds seconds.

### 6.3 Occlusion data: staged accuracy

Initial **F sky-only** trace:

1. **Heightfield blocker:** ray/terrain intersection from the canonical probe point, using a preprepared height grid / bounded patch with the same edited terrain source.
2. **Coarse static feature blocker** (optional): deterministic canopy volume or structure silhouette, only if existing prepared occluder fields can be safely read off-thread.
3. **Canopy transmittance** (if enabled): simple Beer–Lambert integration through estimated leaf density, driven by existing prepared forest/habitat field, calibrated to current [D11] R canopy shade (not simply multiplied twice).
4. Open sky if the ray exits the bounded trace window upward without hitting geometry; negative/downward rays may be obstructed by land/solid, or treated using explicit **sky visibility** rules; never count sea/ground as sky.
5. Missing structural occluder data: keep terrain/forest results, mark `coverage=terrainOnly`. Do **not** claim buildings/room occlusion is complete.
6. Terrain below water may be handled as land occluder but the water surface/underwater absorption is out of scope. Keep underwater receiver disabled.

**No dynamic vegetation sway in the baked blockers.** Use statistical canopy density at an epoch/forest edit revision; ignore individual moving leaf animation to avoid daily probe rebakes and shimmering light.

### 6.4 Ray directions, fixed order and trace step

Use deterministic spherical Fibonacci directions (Ponlai [P1]):

```js
function directionAt(index, count) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - 2 * (index + 0.5) / count;
  const r = Math.sqrt(Math.max(0, 1 - y*y));
  const phi = index * golden;
  return [r*Math.cos(phi), y, r*Math.sin(phi)];
}

function projectSkyVisibility(scene, probePoint, count) {
  const sh = new Float64Array(9);
  const weight = 4*Math.PI / count;
  for (let k = 0; k < count; k++) {
    const dir = directionAt(k, count);
    const visibility = traceSkyTransmittance(scene, probePoint, dir);
    const basis = shBasisYUp(dir);
    for (let j = 0; j < 9; j++) sh[j] += weight * visibility * basis[j];
  }
  return sh;  // project (unconvolved) visibility
}
```

- Use a globally fixed **sequence** for directions, no `Math.random` or worker-dependent seeds.
- Proposed first pilot: **64 primary rays** balanced / **96 high** / **128 ultra**. Ponlai uses 128 even for its small island; Drusniel's quantity and movement budgets differ.
- A ray carries scalar `visibility` in [0,1], allowing semitransparent foliage medium.
- Terrain intersection can use bounded adaptive stepping / interpolation. One large step over 20 m can tunnel through a thin ridge; test.
- A descending ray from a point near ground is normally blocked quickly; an upward ray may exit through open sky.
- For a sky ray that reaches trace cap while pointing toward a far mountain ridge, decide whether to use coarse distant horizon lookup or treat as open; document bounded-support approximation.
- Rays should be coalesced/early-out in dense canopy/solid.
- Don't build a dense voxel matrix per 64 m² chunk if heightfield intersection plus sparse occluder acceleration is sufficient.

### 6.5 Per-ray Beer–Lambert canopy term (optional)

If prepared canopy density `sigma_t(x)` exists in inverse metres:

```text
opticalDepth = Σ sigma_t(sample_i) * stepMeters
T = exp( -min(opticalDepth, MAX_OPTICAL_DEPTH) )
visibleSkyRay = (hitStaticSolid ? 0 : T)
```

This is a **mean canopy medium**, not accurate individual leaf ray tracing. Calibrate current thick forest against [D11] forest-floor canopy strength. A 0.2–0.4 density factor at every probe can darken whole forest too much; report relative to existing current sky look.

### 6.6 Probe relocation, invalidity, and fill policy

[P1] relocates a probe within half the cell if it is inside a solid. For an outdoor surface-following lattice use:

- Start offset above terrain: e.g. level0 at +0.6 m.
- Probe inside **a real coarse static solid** (arch/cave entry/rock): move to nearest valid candidate within configurable small radius.
- Fixed ordered candidates: normal/up first, then canonical spiral/axes (stable ties). No random relocation.
- If no valid location found, set `valid=0` and keep a safe neutral/nearest valid fallback.
- **Do not average through walls/cliffs** indiscriminately. An invalid one near a stone wall should not borrow bright light from the opposite wall side.
- Record relocation vector ≤half-cell, diagnostic depth/invalid reason, and a stable source revision.
- For terrain-following columns, interpolation of relocated probes must preserve their actual sampling positions; don't blindly sample coefficients as if offsets were zero on a steep slope.
- No NaN/Infinity coefficient may reach a GPU buffer; nonfinite ray inputs fail the page with actionable log, not silent black.

### 6.7 Determinism and cache version

Proposed cache entry identity:

```text
ProbePageKey = {
  chunkX, chunkZ,                 // canonical signed integers
  chunkSizeCells, tileSizeMeters,
  worldGeneratorIdOrStableHash,
  baseTerrainVersion,
  terrainEditHaloRevision,
  forestEditHaloRevision,
  staticOccluderSnapshotRevision,
  probeFormatVersion,
  latticeSpacingMeters,
  verticalOffsetProfile,
  rayCount,
  maxTraceDistanceMeters,
  tracerImplementationVersion,
}
```

- Version **read geometry and occluder inputs**; no `Date.now`, no global stream index and no renderer camera position in cache key.
- The **sky colour/time/weather** is *not* part of the baked visibility key. Relighting is separate.
- Neighbour chunks' edit revisions in trace range must invalidate a cached page even if its own chunk has no edit.
- A new world document/base terrain/reset invalidates all active slots; no old page may publish across world identity change.
- Content hash must include the exact physical data assumptions (tile/height sampling, canopy/structure blockers).
- If a user edits a building/forest without a revision channel that can be mapped to the trace halo, either **broaden invalidation conservatively** or leave that occluder source out of F; don't cache stale dark shadows forever.

---

## 7. GPU resource and streaming architecture options

### 7.1 First decision: per-slot packed texture or bounded global atlas

Because [D9] shares one terrain material and uses all samplers, prototype **both small arrangements with one test scene**, then commit **one**:

**A. Per-slot `DataTexture`, samplerless manual interpolation**

- One aligned 2D texture per slot, coefficients packed into texels (4 coefficients/texel and offset/validity metadata).
- Same texture format and dimensions for all slots of a tier.
- Bind via existing [D9] `perObjectTexture`, with `setSampler(false)` and an explicit `textureLoad` or equivalent proven TSL node.
- Read **trilinear** across neighbouring columns and terrain-relative levels by manual 8-corner coefficient fetches; be realistic about ×4 texels/corner.
- No new shader per slot; no new sampler; one data texture binding may still affect the **texture-binding** limit, which must be measured.
- Publish only on a slot's matching token/key and source revision.

**B. One bounded global atlas of resident probe blocks**

- Keep one shared GPU texture/buffer indexed by resident slot number with uniform mapping from slot to atlas region; avoid 49 texture bindings and per-object texture dispatch.
- Must avoid race on slot recycling, atlas subimage uploads and stale validity bits.
- Must support atomic update of one atlas page without blanking other slots.
- If output uses sampled texture, beware 3D array/atlas texel border sampling across chunks; manual cell-indexed texel loads are safer.

**Decision gates:** compile time, per-fragment sample cost, CPU upload cost, WebGPU texture/sampler limits, implementation complexity, and **no recompile on slot changes**. Do not implement both forever just because a prototype tested both.

### 7.2 Proposed F probe packing, version 1

Do **not** copy 80 floats/probe from [P8]. F requires 9 un-convolved scalar SH visibility coefficients plus metadata. Pack as:

| Data | Count | Semantics |
| --- | --- | --- |
| `visSH0..8` | 9 × Float32 CPU | Scalar projection of sky visibility, **unconvolved** |
| `relocateX/Y/Z` | 3 × Float32 CPU | Metres from canonical sample point |
| `valid` | 1 × Float32 or small integer | 1 valid, 0 invalid |
| `coverage` | 1 × integer flags | heightfield only / canopy / static structure |
| `reserved` | 2 words | Format expansion/alignment; not yet bounce light |

**Suggested packed CPU stride:** 16×Float32 = 64 bytes/probe for simple alignment. The GPU texture may use RGBA16F (small) or RGBA32F depending on error/availability; encoded range of SH coefficients includes negative values (must support signed). Choose after finite precision test. **Don't** store SH coefficients as normalized 8-bit or sRGB.

**CPU data to GPU:** use a tested packed layout with explicit format version and deterministic byte layout. If the GPU uses RGBA16F, keep CPU Float32 canonical reference and quantize only at upload; measure precision with cloud/dusk.

**Forward compatibility:** PR G defines a **new** version for RGB bounce/sea and key relight rather than assuming reserved fields can hold full 80-float data.

### 7.3 Boundary blending / no visible chunk squares

Independent per-slot GPU textures are difficult to interpolate seamlessly if a pixel on one chunk wants coefficients in a neighbour slot. Choose one:

- **Replicated border/halo columns**: each chunk page contains overlapping world-aligned columns outside its owned square, computed from the same canonical halo snapshot. Shader samples within one slot from shared probe values, yielding identical boundary result on both sides.
- **Global atlas and neighbour addressing**: use canonical global column keys to sample across slots, and fall back when missing.
- **Hybrid**: replicate one column and a small seam pad, blend to current ambient when source/neighbor invalid.

**Recommended simple first:** replicated 1-column border + deterministic boundary ownership. At a chunk seam, the four sampling corners on both sides must correspond to the same **global** probe coordinates/coefficients, not a separately fitted local interpolation with slightly different inputs.

**No black fallback:** missing halo or neighbour page must blend to `unoccluded authored sky ambient` (or last valid neutral), with a smooth spatial/time transition and a diagnostic. Do not blend to zero radiance.

### 7.4 Runtime source states and atomic publication

```text
disabled
 -> no probe workers/resources/shader
enabled
 -> neutral fallback bound (valid)
 -> request/prepare low-priority probes
 -> upload page(s) with token and budget
 -> swap ready page atomically
 -> blend receiver from neutral to sampled probe
 -> on edit/eviction/worker fail: invalidate generation
 -> retain valid last output only if geometry version remains valid
 -> otherwise neutral fallback; never stale solid occlusion
```

A **ready** shader is not the same as **ready probe page** or **ready sky projection**. Diagnostics should distinguish `shaderCompiled`, `visibilityReady`, `skyRelightReady` and `activeReceiver`.

If the current sky look changes during probe upload, visibility data stays valid; only sky-relight coefficients or uniforms update. Never re-request the world geometry merely because it became cloudy.

### 7.5 Sky source and radiometric contract

There are two valid sources:

1. **PR E implemented:** use its already published linear sky source/environment SH, in the same **scene radiance units** as current material diffuse. Read the **published generation** only; do not sample a half-baked panorama.
2. **PR E not implemented:** build a small deterministic **authored-sky approximation** from [D12] `StylizedSkyView.look` / [D13] `skyAmbientColor` and existing [D14] `scene.environment`. This is sky-visibility-guided **stylized** diffuse, not physically accurate directional sky irradiance. Do not try to read pixels from the GPU every frame.

For validation, the sky SH input is RGB radiance `sky_i = ∫ L_sky(ω) Y_i(ω) dω` (same SH basis, **not exposed/tone-mapped RGB**). For a constant directional-independent sky radiance, only coefficient 0 is nonzero: `sky_0 = constantRadiance * 4π*Y0`. For a sky hemisphere, represent below-horizon radiance as zero or a documented authored ground term; be precise.

**Avoid double-irradiance:**

- [D12] already has a directional and hemisphere light.
- [D14] already supplies specular IBL from CC0 HDR.
- F's probe **ambient diffuse** must replace an equivalent direct hemisphere/environment diffuse contribution for the **pilot receiver** (or be applied as a physically defensible occlusion factor inside that component).
- Do not simply add `E_probe` as emissive to terrain and leave original hemisphere/IBL diffuse unchanged.
- Do not subtract hemispherical light by changing scene-wide `HemisphereLight.intensity` while all **unmodified** objects still depend on it. Replacement must be **receiver-local** or deferred to G.
- Keep directional sun shadow/BRDF and specular IBL unchanged.
- If using a relative visibility ratio on the existing diffuse contribution, derive from matching **unoccluded sky irradiance** at the same normal and scene unit, guard near-zero denominator and clamp to a bounded range ≤1 initially. A ratio that exceeds 1 and brightens surfaces should be consciously designed, not a division artifact.

### 7.6 Relative-visibility pilot: safe partial alternative

If TSL PBR hooks are not stable, first build a **read-only** debug receiver that colours probe spheres and a tiny synthetic material from `E_probe`. This validates the core system without touching main terrain lighting.

A **limited relative occlusion** pilot, only if existing lighting model exposes a safe ambient-diffuse hook:

```text
E_open(n) = ∫ L_sky(ω) max(dot(n,ω),0) dω
E_probe(n) = ∫ L_sky(ω) V_probe(ω) max(dot(n,ω),0) dω
fraction(n) = clamp(luma(E_probe)/max(luma(E_open), eps), 0, 1)
E_existingAmbientSkyDiffuse *= mix(1, fraction, receiverStrength)
```

**Important:** this ratio suppresses diffuse **sky** ambient only. It should not suppress directional sun, local lamps, or unrelated ground/IBL specular. Where the rendering API cannot identify `E_existingAmbientSkyDiffuse` separately, leave this disabled; do not multiply the whole shaded `colorNode`.

This ratio approach may be a good **F** bridge while full colour relight and bounce are implemented in G. Document exact numerator/denominator and visual restrictions.

---

## 8. Shader sampling: exact coordinate and interpolation requirements

### 8.1 Local sample coordinates

For a given pixel on [D10] terrain, local `terrainUv` gives X/Z inside its own slot. The pixel's height comes from [D10] `terrainHeight` (world Y displacement), and the per-object slot has current chunk descriptor.

```text
P_render = positionWorld
N_geom = normalWorldGeometry (or actual terrain normal)
P_bias = P_render + N_geom * normalOffset + viewDir * viewOffset
world-probe-column coordinates = slotLatticeOrigin + (terrainUv + borderOffset)*spacing
relativeHeight = P_bias.y - sampledColumnHeight(P_bias.xz)
vertical fractional index = interpolate heightOffsets[]
```

**Coordinate warning:** do not mix:

- `terrainUv.y` increasing in plane mesh local axes,
- Drusniel cell Z increasing toward **negative** render Z,
- `worldXZ` shader noise coordinate wrapped periodically,
- renderer camera-origin-relative X/Z,
- global canonical X/Z in double precision.

The probe lookup must derive *global integer lattice index* on CPU, and **locally bounded** UV coordinates on GPU. `wrapNoiseOrigin` is a noise hash trick and **not a valid coordinate identity** for probes on an unbounded world.

### 8.2 Interpolation

For a 2.5D grid with adjacent global X/Z column indices and two vertical levels:

```text
sample(P,N) =
  Σ_(dx=0,1) Σ_(dz=0,1) Σ_(dy=0,1)
     wx(dx) * wz(dz) * wy(dy)
     * safeProbeSH(columnX+dx, columnZ+dz, levelY+dy)
```

- Use **same basis/units** for all coefficients.
- Weights must sum to one over usable valid cells; if some probes invalid, redistribute only among safe same-space neighbours, or fall back to open ambient.
- At geometry edges or missing halo, avoid clamping to a distant unrelated probe (can make the far side of a wall too bright).
- Normal/view bias must avoid crossing thin wall into wrong side; [P5] uses a nonzero offset, but specific distances must be calibrated to Drusniel's 8 m vs Ponlai's 2 m lattice.
- Use branchless cheap sampling if it avoids costly divergent fragment shader.
- When using manual 2D packed data sampling, derive exact texel addresses and **clamp to same probe cell**, preventing RGBA packing/filter bleed.
- For the sampled sky-only SH, negative lobes are expected; clamp final **irradiance** to nonnegative, not each raw SH coefficient.

### 8.3 Occupancy/validity

The source data must distinguish:

- `missing`: no page/halo available,
- `invalid`: a probe was entirely inside solid,
- `ready`: valid sky visibility,
- `stale`: source revision changed,
- `failed`: worker/GPU error.

These states have different QA and fallback semantics. A missing cell can use neutral sky; an invalid probe in a cliff should not be treated as fully open sky if nearby valid same-side data is available. Version mismatches must never silently combine.

### 8.4 Sampler and instruction budgets

[D9] says the terrain uses all 16 portable fragment **samplers**. Even when using samplerless `textureLoad`, complex manual interpolation can execute many loads.

**Required spike:**

- Compile a single terrain material with feature enabled, **all existing snow/water/reflection/mist layers** and both active render paths.
- Inspect backend sampler/texture binding totals; ensure **zero** WebGPU validation errors and no hidden viewport-copy/mip activation.
- Compare GPU cost per frame in dense forest versus open terrain, at 720p, 1080p, optional 4K.
- If a full SH9 per-pixel 8-corner probe decode costs too much, pre-relight to compact RGB irradiance in resident atlas or evaluate SH at vertex with interpolation; compare accuracy at hills/mesh LOD.
- **Do not** move probe ambient into baseColour/emissive simply because PBR shader hooks are difficult.

---

## 9. Static geometry revisions and world edit invalidation

### 9.1 Existing world change channels

[D1] `InfiniteWorldStore` emits revisioned events for tile/height/forest edits/reset; [D4] subscribes, finds affected chunks, refreshes or worker-reloads terrain slots. This is a proven invalidation source.

PR F should subscribe to the **same** stream without changing world document persistence. For event:

```js
onWorldChange(change) {
  if (change.kind === 'reset') invalidateAllProbePages();
  else {
    for (const cell of change.cells ?? change.vertices ?? []) {
      const canonical = cellToCanonicalMeters(cell, tileSize);
      invalidateProbePagesIntersecting(canonical, TRACE_RADIUS_M + HALO_MARGIN_M);
    }
  }
}
```

- Use a spatially bounded affected-set over **all probe chunks whose trace reaches the edit**; not just the edited tile's owner.
- If edits affect **forest canopy** but event supplies no cell list, use its edit bounds or invalidate the region's resident pages conservatively.
- For building/wall changes **outside** this world store, define a proper event/provider revision before baking them as probe blockers.
- On undo/redo, same geometry must produce same binary coefficient hash.
- After invalidation, don't leave stale closed-geometry occlusion in visible surfaces; fall back or bound stale usage by policy.

### 9.2 Source-of-truth height edits

[D1] `setHeight` can update neighbouring cached vertex rows around chunk borders. Any worker probe patch must use the current **complete** edited height snapshot and halo. The event's `revision` provides coarse version; hash the relevant subset/overrides rather than forcing all 49 active pages to retrace on unrelated distant edits.

Do not write raw probe data into saved world document; it's a rebuildable **derived cache**, not authored terrain state. This follows project `AGENTS.md` semantic source-of-truth rules.

### 9.3 Residency policy and cancellation

- Separate limits: e.g. `maxProbeResidentChunks` ≤ terrain `maxResidentChunks`, `maxProbeInFlight=1` initially, `probeUploadBudgetBytesPerFrame` bounded.
- Prioritize current camera chunk and near visible terrain; predictive prefetch after terrain prefetch is resolved.
- If moving rapidly, skip work for chunks likely to be evicted before results arrive.
- A probe page may be prepared but not yet GPU-resident; retain bounded LRU CPU cache if useful.
- Evict unneeded GPU pages safely when the slot changes; do not leak an atlas page per visited world chunk.
- Worker unavailable or crashes → probe effect may stay neutral while the terrain continues to load; do not run heavy fallback on main thread.
- Coalesce repeated edits; avoid queuing one bake for each brush sample while sculpting.
- Explicit retry/backoff with status instead of unbounded error logging.
- On renderer device loss / world change / disposal, increment generation IDs and cancel/ignore stale completions.

---

## 10. Sky projection, relighting and first receiver: detailed algorithms

### 10.1 Project sky radiance into SH9

For an available source sky radiance `L_sky(ω)`, make a deterministic hemispheric/sample projection:

```js
function projectSkyRadiance(directions, getRadiance) {
  const coeff = Array.from({ length: 9 }, () => [0, 0, 0]);
  const weight = 4 * Math.PI / directions.length;
  for (const direction of directions) {
    const color = getRadiance(direction); // linear, not exposed/sRGB
    const basis = shBasisYUp(direction);
    for (let j = 0; j < 9; j++) {
      for (let c = 0; c < 3; c++) coeff[j][c] += color[c] * basis[j] * weight;
    }
  }
  return coeff;
}
```

When PR E is implemented, its published sky/environment source may be projected once per **valid sky generation**. If the sky is an equirectangular panorama use solid-angle weights `dΩ = cos(latitude) dφ d(latitude)`; never average pixels equally over latitudes.

When PR E is **not** implemented, an authored approximation must be explicitly labelled and energy-normalized against current [D13] `skyAmbientColor` / [D14] environment intensity. Do not make screenshot captures pass by secretly changing `sceneExposure.scale`.

Sky SH projection excludes the **visible sun disc** if the directional sunlight already contributes separately. Otherwise direct sunlight may be added as ambient **and** direct key. [P6] similarly excludes sun-disc energy from environment-source diffuse projection.

### 10.2 Combine sky and visibility SH

CPU reference via quadrature:

```js
function referenceIrradiance(point, normal, skyRadiance, visibility, samples) {
  let rgb = [0, 0, 0];
  const w = 4 * Math.PI / samples.length;
  for (const dir of samples) {
    const cosine = Math.max(0, dot(normal, dir));
    const transmittance = visibility(point, dir); // 0..1
    const light = skyRadiance(dir);
    for (let c = 0; c < 3; c++) rgb[c] += light[c] * transmittance * cosine * w;
  }
  return rgb; // irradiance, not BRDF-divided diffuse radiance
}
```

GPU optimized approximation can use Gaunt product (`sky SH × visibility SH`) and one cosine convolution. CPU reference is an oracle on synthetic scenes; do **not** ray trace per output pixel. Test integrated energy and angular consistency.

### 10.3 Uniform-sky analytic sanity

With **isotropic** constant sky radiance `L0` over the full hemisphere and no blockers, an upward-facing Lambertian surface receives `E = π L0` if the lower hemisphere is black. For a sealed cavity it receives zero; for a half-open orientation, computed integrated irradiance falls accordingly. With an artificially constant sky across the **full sphere**, any normal receives `π L0`.

These cases are invaluable to catch accidental double cosine convolution, SH basis sign flips and wrong “visibility 1 under ground” assumptions.

### 10.4 Inject into terrain without corrupting PBR

**Mandatory architectural spike:** verify exact Three.js resolved implementation of `MeshStandardNodeMaterial` and how hemisphere/IBL diffuse enters its lighting model. The plan must first prove a **single receiver-local ambient replacement** works without breaking:

- metallic materials, rough specular and direct BRDF,
- SSR/GTAO/SSGI if present, bloom and shadows,
- shadow-only darkness from existing CSM,
- user-chosen AgX/ACES and alternate cinematic finish,
- both WebGPU and supported fallback,
- correct MRT data outputs (per `docs/rendering/post-processing.md`).

**Preferred F receiver:** terrain only (or a standalone synthetic test mesh first). Zero change to other receiver materials until PR G.

A conservative injection contract:

```text
existingPbr.direct = unchanged
existingPbr.ambientSpecular = unchanged
existingPbr.ambientDiffuseSky =
  mix(existingPbr.ambientDiffuseSky,
      convertedProbeSkyDiffuse,
      receiverWeight*probeReady)
existingPbr.emissive = unchanged (except existing forest-floor effects)
outputToneMap = unchanged
```

An **ambient visibility ratio** (section 7.6) may be more robust than a full diffuse replacement as an F pilot, but only if the shader can isolate ambient sky from other lighting.

**No magic custom material override** that samples the viewport colour texture and triggers whole-frame copy/mipmap work: [D19] documents catastrophic prior regression from viewport texture usage. No `material.mrtNode` custom override, which current post-processing docs warn can silently break scene MRT.

### 10.5 Calibrate existing AO and canopy effects

Test four independent switch combinations:

| Probe ambient | Forest-floor R/G | GTAO/contact | Question |
| --- | --- | --- | --- |
| off | on | on | Current authored baseline |
| on | off or reduced | on | How much directional probe visibility replaces broad canopy shade? |
| on | on | off | Is missing tight contact visually acceptable? (expected **no**) |
| on | tuned R | on | Approved combined look, avoiding double darkness |

Do not disable the contact AO in every render path simply to make one screenshot brighter. Distinguish **broad visibility** and **high-frequency contact**. Existing forest floor R is 64/128-sample style, not a replacement for full directional SH but overlaps its average darkness.

### 10.6 What happens in buildings, cave entrances and other locations?

- Outdoor buildings' **exteriors** are not initially a validated probe receiver unless their static geometry is included in occluder snapshots and PBR integration tested.
- Dedicated underground/unique locations [D17] use a **different baked vertex-light and virtual lamp** system; never apply outdoor sky probes as a global light. Keep their load-screen-specific lighting independent.
- Open roof/arch stone structures can later request a **local structural visibility provider** whose revision is keyed to construction semantic state, not mesh instance traversal each frame.
- Underwater receiver remains unchanged; sky irradiance undergoes water attenuation, handled in water optics, not by outdoor probe SH.

---

## 11. YAML, presets and public controls

### 11.1 One configuration owner

The probe system is a **lighting** feature tied to the sky; prefer `editor.config.yaml → stylizedSurface.sky.ambientProbes`, alongside existing `sky.environment` and other sky effects, instead of a new global YAML service. If current config validation organizes all low-level ambient under a separate already established owner, adapt to that after inspecting the live normalizer, but **only one** authoring source.

**Proposed config** — disabled until implementation verified:

```yaml
stylizedSurface:
  sky:
    ambientProbes:
      enabled: false
      quality: high
      receiver: debug-only          # debug-only | terrain
      spacingMeters: 8
      verticalOffsetsMeters: [0.6, 2.5, 8, 18]
      rayCount: 96
      traceDistanceMeters: 20
      includeCanopy: false
      includeStaticStructures: false
      maxResidentChunks: 32
      maxInFlight: 1
      maxUploadBytesPerFrame: 131072
      maxBakeMillisecondsPerIdleStep: 2
      receiverStrength: 0.65
      fallbackBlendSeconds: 0.35
      debug:
        mode: off                   # off | probes | sky-visibility | validity | seams
```

**Implementation requirement:** Settings above are *design candidates*; prune redundant fields in production. In particular, if quality picks a fixed spacing/offset/ray profile, don't simultaneously let ordinary users override all three, creating inconsistent grid dimensions and hard-to-reproduce QA. Prefer a small `enabled/quality/receiverStrength/debugMode` user-facing surface and static tier profiles as code constants. Keep `maxBakeMillisecondsPerIdleStep` only if the trace can actually yield cooperatively; heavy synchronous work on one dedicated worker is bounded by one worker at a time, **not** preempted by an arbitrary millisecond timer.

### 11.2 Validation

- `enabled` strict boolean; default false in all existing presets.
- `quality` strict tier enum, no rebuild if unchanged.
- `receiver` must be implemented; don't expose an unfinished “terrain” switch that actually changes pixels without a correct PBR hook.
- `spacingMeters` finite positive and commensurate with resolved chunk span; if not, fail config validation or choose a documented world-grid basis consistently.
- Fixed small count of vertical offsets, ascending and finite; values in world metres.
- Ray count bounded, deterministic.
- Trace reach/max time/budget finite and validated; no Infinity in shader side.
- Max in-flight/resident limited by terrain pool and device memory.
- GPU texture format selected from verified backend capability; unsupported → feature disabled, not partially working.
- Repeated app start and old save documents with no new YAML fields render exactly as today.

### 11.3 Low/mobile tiers

- **Mobile/fallback:** off by default; no hidden worker start, no GPU staging bytes.
- **Desktop balanced:** optional lower grid/ray count after evidence.
- **High/ultra:** do not automatically enable on quality tier change merely because quality is sufficient.
- Debug sphere overlay is **off** in production and constructed lazily.
- Report `effectiveReceiver`: `off`/`debug-only`/`terrain`, actual valid-probe coverage and current sky-source type.

---

## 12. Proposed small-source-file architecture

### 12.1 New files (conditional; keep only what the actual design needs)

| Proposed path | Primary responsibility |
| --- | --- |
| `src/editor/lighting/probes/ProbeConstants.js` | SH basis constants, grid profiles, source/format versions |
| `src/editor/lighting/probes/ProbeHarmonics.js` | Pure SH9 CPU basis, projection, convolution and reference tests |
| `src/editor/lighting/probes/ProbeLattice.js` | Canonical shared-column identities, heights and chunk bounds |
| `src/editor/lighting/probes/ProbeTrace.js` | Pure deterministic sky ray visibility, optional medium |
| `src/editor/lighting/probes/ProbeSceneSnapshot.js` | Immutable bounded terrain/occluder snapshot builder |
| `src/editor/lighting/probes/ProbePage.js` | Buffer packing, validation, source hash and format |
| `src/editor/lighting/probes/ProbeWorker.js` | Isolated low-priority worker, no renderer imports |
| `src/editor/lighting/probes/ProbeResidency.js` | Current/predicted chunk requests, version, retry/cancel/evict |
| `src/editor/lighting/probes/ProbeGpuPages.js` | GPU atlas or per-slot data textures, neutral sentinel, upload/dispose |
| `src/editor/lighting/probes/ProbeSamplerNode.js` | Tiny TSL lookup, interpolation/bias/invalid fallback |
| `src/editor/lighting/probes/ProbeSkyLighting.js` | One sky-source contract, SH radiance projection/relight |
| `src/editor/lighting/probes/ProbeDebugView.js` | Lazily built instanced spheres/validity/seam diagnostics |
| `src/editor/lighting/probes/ProbeConfig.js` | Only if existing YAML validator can't naturally normalize the block |
| `docs/rendering/ambient-probes.md` | Readiness/ownership/known limits and future PR G interface |

**KISS:** This is a *responsibility map*, not a mandate to create 13 files on day one. Start with pure SH math, ray tracer and one low-priority worker. Split modules where a class actually becomes too large. Do not add an event bus or new generic renderer base class.

### 12.2 Existing source edits

| Existing path | Minimal extension | Forbidden regression |
| --- | --- | --- |
| [D4] `InfiniteTerrainView.js` | Own probe-residency **reference** and bind slot identity/neutral page; subscribe edits, render-phase budgets, dispose | Do not modify mandatory commit budget or allocate 49 new materials |
| [D6] `WorldChunkWorkerClient.js` / [D7] worker | Only if measured clean to reuse job scheduling; else own separate sidecar worker | Terrain/settlement worker priorities and transfer buffers unchanged |
| [D9] `TerrainSlotBindings.js` | Optional per-object probe texture/atlas page binding as with existing slot fields | Preserve one shader program and 16-sampler budget |
| [D10] `terrainMaterial.js` | Conditional ambient receiver hook and debug options; no new output pass | Never multiply all final colour or add to emissive |
| [D12] `StylizedSkyView.js` | Supply existing resolved sky/look reference/updates; no second light rig | Preserve sun/hemisphere and scene.environment |
| [D13] `skyAmbient.js` | Optional sky-source normalization; no global tweak | Existing pale sky ambient default exact |
| [D14] `sceneEnvironment.js` | Read coherent physical sky if PR E exists, else existing HDR; no sampler rewrite | Metal specular/reflectance remains |
| [D18] `TerrainCommitQueue.js` | **Prefer unchanged**, use separate probe GPU upload budget | Existing ≤2 ms terrain copies unaffected |
| [D21] config/validator | New optional nested block, defaults off | Existing save/YAML formats unchanged |
| [D15/D16] AO paths | Only if precise overlap fix is required and independently tested | No global AO removal |
| [D17] location lighting | **No change** | Dedicated location baked light/lamps remain |
| QA scripts | Add optional probe readiness, metric states and fixtures | No global settle timeout or false pass |

---

## 13. Memory, throughput and cache budgets

### 13.1 Raw memory examples

For `9×9×4=324` probes and 16 Float32 values/probe:

```text
bytesPerProbe = 16 * 4 = 64
cpuRawChunk = 324 * 64 = 20,736 bytes
cpuRaw49Slots = 1,016,064 bytes ~= 0.969 MiB
gpuVis64BitChunk (if 4 RGBA16F texels/probe) = 324 * 4 * 8 = 10,368 bytes
gpuVis32BitChunk (if 4 RGBA32F texels/probe) = 324 * 4 * 16 = 20,736 bytes
```

This represents **visibility coefficient/source data** only. A relit RGB SH9 atlas is additional:

```text
RGB SH9 = 27 floats/probe
7 RGBA16F texels * 8 bytes = 56 bytes/probe
324 * 56 = 18,144 bytes/chunk
49 chunks * 18,144 = 889,056 bytes (~0.848 MiB)
```

The seven-slab format is **Ponlai-style full RGB SH**; PR F may choose a cheaper **scalar visibility + sky reference approximation** rather than allocate it until PR G. GPU resources include staging alignment, texture metadata, neutral textures, cache variants and memory from all resident chunks.

### 13.2 CPU cost estimate: don't underestimate the rays

At 324 probes and 96 rays/probe:

```text
primaryRays = 31,104 rays / chunk
primaryRaysFor49Chunks = 1,524,096 rays before cache/retries
```

With up to ~20 m reach and steps e.g. 0.5–1 m, the worst case is tens of millions of terrain/occluder tests, *not* a 20 KB memory-copy cost. Some downward rays early exit; still the worker job must be **bounded, low priority and cancellable**. The initial trace count is a **proposal**, not a measured guarantee.

**Mandatory optimization order:**

1. Bound trace radius/feature scope.
2. Precompute a small heightfield and optional coarse occupancy patch once per job.
3. Early-out at first terrain/solid hit or high canopy optical depth.
4. Avoid repeated worldGenerator fractal noise calls per ray step.
5. Cache global Fibonacci directions and SH basis in pure shared module.
6. Use Float64 accumulation and Float32 final, deterministic loop order.
7. Worker-only time slicing if needed for cancellation; never yield between accumulation terms in nondeterministic order.
8. Cache results by exact geometry-source hash, don't rebake on sky/weather change.
9. If still slow, reduce probes/rays or increase spacing **before** adding an unproven GPU compute tracer.
10. Only then benchmark advanced acceleration.

### 13.3 Performance acceptance targets (provisional)

These are engineering **targets to measure**, not claims of measured performance:

- **Disabled:** zero probe texture/buffer GPU allocations; zero probe worker startup/calls, zero shader variant or runtime costs.
- **Moving while enabled:** no measurable impact beyond existing [D19] p95/hitch/terrain-commit recovery limits; preserve terrain page priority.
- **Probe worker CPU**: prefer near-camera visible-chunk probe data available without a multi-second backlog in the steady state, but do **not block terrain readiness**.
- **GPU upload:** target ≤128 KiB/frame staging bytes under normal movement initially; if data resources are larger, lower/update budget. Measure upload/driver hitches.
- **Fragment probe sampler:** target ≤0.5 ms p95 incremental at 1600×900 desktop for pilot when enabled, but accept greater cost only with clear visual value and intact overall frame budget.
- **Rebases:** zero worker retraces and zero unnecessary full GPU reuploads from origin-only changes.
- **Sky updates:** no geometry ray retrace; small projected sky SH change/relight only.
- **Edits:** bounded affected chunks, no synchronous main-thread probe bake or 49-page upload.
- **Memory:** max CPU/GPU based on `maxProbeResidentChunks` and measured staging; LRU cap ensures unbounded travel does not accumulate textures.

**PR B profiling caveat:** [D23] GPU pass profiler reports sampled render-context timestamps, not complete GPU compute or texture-upload cost. Compare timestamp-off player frame pacing separately from named GPU pass numbers. A GPU dispatch time alone is not proof that stream upload has no hitch.

---

## 14. Tests: mathematics, worker determinism, GPU, seams and actual world scenes

### 14.1 Pure SH math tests

1. `shBasis([0,1,0])` matches y-up order.
2. `shBasis([0,0,1])` and [0,0,-1] distinguish +Z/-Z correctly.
3. Orthogonality of 9 basis functions under high-count deterministic spherical quadrature.
4. Constant full-sphere function projects to `c0=2√π` and others near zero.
5. Constant upward hemisphere visibility coefficients match a high-sample reference.
6. Visibility zero everywhere projects all zeros.
7. Sky visibility 1 upper sphere/0 lower gives expected upward/downward diffuse irradiance after cosine convolution.
8. Numerical SH response to a blocked wedge, slit, half-plane and hemispheric occluder.
9. Changing ray count converges toward higher-count reference without random seed noise.
10. All primary coefficient values finite with constant scene.
11. Cosine-lobe factors applied once and only once.
12. SH sky×visibility product uses Gaunt coupling, not per-index products.
13. CPU direct ray integral and SH9 approximation compare within calibrated low-frequency error.
14. Projection of equirectangular sky uses correct cosine latitude solid-angle weighting.
15. Negative SH coefficient allowed; final irradiance clamped nonnegative/finite.
16. No blue/red flip from SH basis and world cell Z sign.
17. Open/closed fully opaque scene produces neutral/full visibility and zero accordingly.
18. GPU float16/float32 packed reads match CPU reference within tolerance.

### 14.2 Worker trace/determinism tests

1. Identical seed + chunk + geometry + config → bit-identical probe page on repeat calls.
2. Different worker count/order → same output bitwise (not dependent on completion order).
3. Same shared boundary positions from two adjacent chunk jobs → exact equal coefficients/buffer hash.
4. Terrain height edit within trace halo changes exactly those pages; distant edit doesn't.
5. Negative chunk coordinate and huge canonical positions match equivalent local geometry.
6. Floating-origin rebase does not affect probe identity/bytes.
7. Ray grazing a cliff checks correct intersection, no tunnelling.
8. Below-ground or inside solid probe relocates deterministically or marks invalid.
9. A thin wall blocks as expected only if static-occluder provider is enabled and validated; otherwise status says terrain-only.
10. Canopy Beer–Lambert density 0 -> visibility 1 for otherwise open sky; strong density decays smoothly.
11. All occlusion values clamp [0,1] even with corrupted density input; invalid inputs reject.
12. Out-of-range world cells rejected consistent with [D2].
13. Worker failure/cancellation/timeout doesn't crash terrain worker pool.
14. Repeated request for current chunk after return hits bounded LRU cache if version same.
15. Every output page includes source hash, revision, format, chunk descriptor and correct typed-array length.

### 14.3 Streaming/lifecycle tests

- Enter/leave/re-enter same chunk while probe request in flight; no wrong-slot publication.
- Old page arrives after slot reassignment: dropped with counter, no stale lighting.
- Terrain visible before probe: default ambient with no black flash.
- Probe-ready after delay: fade smoothly into result; one shader program.
- Resident limit/long travel: bounded GPU memory, no stale resources after 1000 chunk switches.
- Rapid sculpt/paint/undo/redo: invalidation by trace halo, generation IDs prevent stale reappearance.
- World JSON import or reset while worker finishing: all old page results rejected.
- Change sky hour/cloud/weather repeatedly: **zero probe geometry retrace**, only bounded sky relight.
- Switch high/ultra/off: no invalid atlas reads, stale old config published, resource leak.
- Enter underwater/dedicated location: outdoor receiver disabled/isolated.
- Device loss/reinit, missing WebGPU feature, WebGL fallback: neutral ambient unchanged, documented status.
- Close/dispose while pending worker or GPU upload: no dangling event listeners/promise mutation.
- Active render path changes cinematic/post: same ambient material result, no extra shader compile per terrain slot.

### 14.4 Grounded visual cases from current project

Use valid existing fixture IDs [D24] (verify current fixture list before running):

| Scene | Required contrast / visibility |
| --- | --- |
| `forest-off-12` | Canopy R + probe visibility no double-dark floor |
| `core-rainforest-off-12` | Dense understory, open skylight gaps, realistic gradients |
| `core-temperate-rainforest-off-12` | Shade depth without flat charcoal ground |
| `forest-air-off-12` | Bright skyline vs shadowed trunks/ground |
| `grassland-off-12` | Open sky probe essentially neutral, no patchy over-brightness |
| `town-off-12` | Buildings not falsely “probe occluded” unless validated blockers |
| `town-off-21` | Moonlit scene dark and warm lamps preserved |
| `coast-off-12` | Cliff/shore open sky, sea/glint unchanged |
| `core-taiga-snow-12` | Snow under canopy, neutral white highlights and blue shade |
| `glacier-off-12` | Open glacier not artificially darkened |
| `wetland-rain-12` | Overcast change does not trigger geometry retrace |
| `forest-off-18.6` | Sunset directional sky changes smoothly |
| `forest-storm-12` | Weather fog/god rays unbroken |
| `tundra-off-12` | No square tile shadows on open terrain |

**Targeted synthetic geometry fixture also required:**

- A 90° cliff wall, half-sphere hill, narrow canyon, open plain, thin 0.2 m wall, closed room and one roof opening.
- For structure/room, do not expect correct blockage unless an explicit structural occluder provider is implemented; record status.
- Camera pans across exactly one chunk seam at x/z; compare pixel history and line profiles.
- Repeat with negative chunk indices and after forced origin rebase.
- Probe debug spheres visible at 4 vertical offsets at terrain follow, not buried 50 m underground.
- High sun, 0° sunset, moonlight; sky changes without visibility-page rebuild.

### 14.5 Quantitative A/B gates

- **Seam error:** luminosity difference of matching world positions just across chunk boundary, after accounting for expected underlying geometry; compare to identical A/A noise.
- **Readiness stability:** number of frames with black/NaN pixels while a page changes must be zero.
- **Halo consistency:** shared boundary probe coefficients hash equal under identical source revision.
- **Lighting directionality:** open-side wall orientation has expected higher incident diffuse than blocked side; hemisphere sky-open control near 1.
- **Canopy contrast:** shadowed floor remains readable, not twice as dark compared with baseline without intentional art approval.
- **Static scene temporal:** once settled, per-pixel variance within calibrated A/A envelope.
- **Movement/frame:** p95/p99/hitch counts and terrain frame-commit timings stay within [D19] acceptance; no added stall when probe pages publish.
- **Worker cost:** actual ray tests/chunk, cache hits/misses, enqueue-to-ready p50/p95 and cancellation outcomes.
- **GPU:** per-slot shader compile count remains ~one shared material graph per active route, not 49.
- **Sampler validation:** WebGPU backend reports legal sampler count; no viewport texture capture.
- **Source:** SHA, sky generation, probe format/source hash, active render path, backend, camera and world seed saved.

### 14.6 Commands and evidence

Commands below use existing script families; **no tests have been executed by this docs commit**:

```bash
git status --short
git branch --show-current
git log -12 --oneline

npm test
npm run lint
npm run build

npm run qa:perf -- --headed --qa chunk-cross \
  --warmup 8 --duration 12 --settle --drain-seconds 15 \
  --gpuTimings 0 --out tmp/ponlai-pr-f/chunk-cross-pacing.json

npm run qa:perf -- --headed --qa chunk-cross \
  --warmup 8 --duration 12 --settle --drain-seconds 15 \
  --gpuTimings 1 --out tmp/ponlai-pr-f/chunk-cross-gpu.json

npm run qa:perf -- --headed --qa edited-world \
  --warmup 8 --duration 12 --settle --gpuTimings 0 \
  --out tmp/ponlai-pr-f/edited-world.json

npm run qa:perf -- --headed --qa object-town \
  --warmup 8 --duration 12 --settle --gpuTimings 0 \
  --out tmp/ponlai-pr-f/object-town.json
```

Use [D19] `qa:perf:windows` with actual native NVIDIA WebGPU if running from WSL and the Linux browser cannot get a real GPU. The exact **probe-specific** new QA command is to be defined and added **during code implementation**, not falsely listed as existing. If existing scripts use different flags, inspect current `package.json`/CLI help and adapt.

Save outputs to ignored `tmp/ponlai-pr-f/`:

- `source-and-hardware.json` — commit, runtime worldStore.chunkSize/tileSize, shader route, WebGPU adapter.
- `probe-lattice.json` — tier, actual spacing, levels, source hash, probe count and memory.
- `probe-traces.json` — total ray count, occluder/terrain hits, worker time, cancellations/cache hit rate.
- `probe-gpu.json` — allocations, texture format, uploaded bytes, shader compile count, effective receiver.
- `probe-crossing.json` — chunk seam repeated trajectories/readiness/missing.
- `probe-edit.json` — sculpt/forest edit invalidation and stale token drops.
- `probe-qa/` screenshots/contact sheets of baseline, probe debug, original AO on/off and final combination.
- CPU/GPU reference math test reports.

Don't claim unrun commands, GPU measurements or screenshot evidence are already available.

---

## 15. Implementation phases with engineering stop gates

### F.0 — Latest-main and runtime geometry audit

- [ ] Read current `AGENTS.md` and `docs/perf-qa.md`, last 10–20 commits; preserve concurrent renderer/stream changes.
- [ ] Confirm resolved `worldStore.chunkSize` vs duplicate YAML blocks; record physical terrain chunk span and slot count from actual runtime.
- [ ] Re-open [D4, D6–D11] current shader/worker/forest-floor paths.
- [ ] Confirm PR E physical sky/SH source actually exists, else choose explicit authored fallback.
- [ ] Baseline A/A, reference look, town/forest/coast, hardware, render path, texture/sampler budget and startup compiles.

**Stop if:** runtime chunk geometry/owner differs from plan, shader hooks are guessed, or source test baseline invalid.

### F.1 — Pure SH, canonical lattice and binary page tests

- [ ] Implement SH basis exactly [P8], cosine convolution [P9], CPU sample references.
- [ ] Agree independent `probeFormatVersion` and metadata; signed float coefficients allowed.
- [ ] Implement canonical global grid and shared boundaries, floating-origin-independent identity.
- [ ] Prototype 2.5D terrain-following vertical samples; validate cliff and steep slope limits.
- [ ] Test negative chunks and large map coordinates.
- [ ] Use no Three.js/DOM in worker math.

**Stop if:** boundary identity differs between adjacent chunks or SH basis sign conventions wrong.

### F.2 — Bounded geometry snapshot and sky-ray visibility

- [ ] Build read-only edited terrain height halo from existing generator/worker source.
- [ ] Implement deterministic heightfield ray marching and early-out.
- [ ] Optional canopy transmittance only behind explicit flag/source version; calibrate against [D11].
- [ ] Fixed Fibonacci directions, Float64 SH accumulation, valid/invalid/relocated metadata.
- [ ] Test bounded trace support and near-slope tunnels; record convergence by rayCount.
- [ ] Keep 1 bounce, sea and coloured hit albedo **out** until PR G.

**Stop if:** ray count costs would delay terrain page generation or produce large coarse cliff leaks.

### F.3 — Low-priority worker sidecar and LRU cache

- [ ] Implement a separate `probe` job class/lane or isolated low-priority probe worker.
- [ ] Require terrain **never waits** for probes and disabled starts no probe worker.
- [ ] Generation IDs, source hashes, cancellation, retries, bounded memory, transferable buffers.
- [ ] Offload expensive geometry sampling; no main-thread synchronous fallback.
- [ ] Match current+predicted terrain streaming priority and skip soon-to-evict chunks.
- [ ] Validate edit halo invalidation and identical boundary probe hashes.

**Stop if:** worker pool change worsens terrain/collision queue latency.

### F.4 — GPU page/atlas and debug visualisation

- [ ] Prototype samplerless per-object texture or one global atlas using [D9] binding conventions.
- [ ] Choose one based on compile/binding cost, shader sample counts and upload hitches.
- [ ] Neutral sentinel texture bound for missing/stale pages; no null reads.
- [ ] Atomically publish only matching generation/token/page; clear on slot eviction.
- [ ] Implement debug spheres with SH sky visibility, invalid probes, relocation, seam blending; lazy construct.
- [ ] No extra environment-IBL sampler or MRT override.

**Stop if:** 49 shader recompiles, >16 samplers, black flashes or stale-recycled probes.

### F.5 — Sky SH projection and controlled diffuse pilot

- [ ] Reuse PR E published sky radiance if **implemented**, else explicit authored look fallback.
- [ ] Project sky RGB radiance to 9 SH coefficients, exclude direct sun disk where key light already exists.
- [ ] Implement tested sky×visibility product and cosine lobe **once**; test direct integral reference.
- [ ] First present as debug/probe visualizer, verify day-to-night and stable sky changes without ray retracing.
- [ ] Inspect current Three.js PBR lighting model and validate a receiver-local ambient sky contribution replacement.
- [ ] Pilot terrain only with controlled A/B versus existing forest-floor/GTAO; leave other receivers unchanged.
- [ ] If cannot replace ambient diffuse without adding emissive/double key or material hook is unstable, **do not enable** production receiver; record blocker and keep debug/data foundation.

**Stop if:** sun light added twice, existing PBR specular broken, or canopy darkness doubled.

### F.6 — Robustness/visual QA/performance

- [ ] Run pure and shader tests plus all existing QA gates.
- [ ] Test dense rainforest, town, coast, snow, canyon, negative coordinates, world rebase, long-run movement, edit/undo.
- [ ] Exercise both ordinary post and cinematic/volumetric render routes.
- [ ] Measure worker-side cost, terrain page first-visibility latency, GPU upload/fragment cost, active memory, per-slot compile counts.
- [ ] Separate GPU timestamp scopes from overall frame pacing and asynchronous uploads.
- [ ] Verify no memory growth after repeated chunk visits and quality switches.
- [ ] Save correct A/A/A/B traces and screenshots of local sky occlusion with AO on/off.

### F.7 — Final code review, cleanup, commit and rollback

- [ ] Ensure small, readable source files, proper logging and errors; no new unnecessary generic manager.
- [ ] Record upstream Ponlai file-level provenance, exactly pinned SHA, licensing/no assets.
- [ ] Document renderer limitations and which terrain/object materials are **actually** supported.
- [ ] Keep clear TODOs for **unfinished** structural blocker, coloured bounce, sea, metallic occlusion and future PR G where relevant.
- [ ] Use `main` only, check latest before staging, no force push and no GitHub Actions.
- [ ] Single configuration rollback `sky.ambientProbes.enabled: false` restores baseline and frees resources.
- [ ] Do not mark F implemented when only probe debug spheres exist if the release acceptance explicitly requires terrain receiver.

**Suggested future implementation commit title:**

```text
feat(lighting): stream deterministic sky-visibility SH probes for outdoor terrain
```

This PR F **document commit is not that implementation**.

---

## 16. Definition of done — acceptance checklist

### Data and math

- [ ] Compact versioned sky-only probe format exists, with SH9 ordering [P8], correct Y-up, no double convolution.
- [ ] Deterministic worker generation from an **edited canonical world** and bounded halo.
- [ ] Two adjacent chunks share identical boundary probe results/source version.
- [ ] Probe relocation/invalid sample handling tested against cliffs/solids, no light leaks across major geometry.
- [ ] Negative coordinates, huge world values and floating-origin rebases stable.
- [ ] Sky change relights existing probes; **no geometry recomputation**.
- [ ] No game time/exposure used in visibility cache key.

### Architecture and renderer

- [ ] One shared terrain shader, all slots share same graph even with probes enabled.
- [ ] No sampler-limit errors; neutral sentinel available, no undefined sampled textures.
- [ ] No per-frame viewport copy, new HDR full-scene draw, MRT hacks or extra scene sun.
- [ ] Terrain pages visible independently of probe readiness.
- [ ] No baked visibility added as emissive or multiplied across final shaded colour.
- [ ] Pilot receiver accurately replaces or weights **only** existing ambient sky diffuse; if not possible, production receiver explicitly **pending**, not claimed complete.
- [ ] Existing forest-floor shade, GTAO and cinematic contact AO do not double-darken understory.
- [ ] Metallic/environment reflections, direct shadows and night/lighting stable.
- [ ] Dedicated location/lightbake path untouched.

### Streaming and QA

- [ ] Current+predicted chunk priority, stale token rejection, edit invalidation and LRU eviction correct.
- [ ] No worker terrain/collision hot-path delay from probe ray computations.
- [ ] Disabled mode starts no probe job, allocates no GPU textures and exactly preserves old picture.
- [ ] Source/renderer/sky/geometry generation and memory counters visible in diagnostics.
- [ ] CPU SH reference tests, synthetic geometry and GPU buffer packing/sampling tests pass.
- [ ] Real scene QA forest/rainforest/town/rock/snow/coast/day/night and chunk-seam panoramas reviewed.
- [ ] Same sky before/after rebase and no probe square seams after long travel.
- [ ] Native WebGPU performance/hitch/terrain recovery gates pass and measured proof saved.
- [ ] Format/provenance documented, latest source integrated, tests actually executed.

**Automatic F failure:** unbounded global 3D volume, main-thread ray tracing, 49 shaders/material builds, worker slowing first terrain pages, sampling previous chunk's probe buffer, false sky illumination through a cliff, zero/black fallback, double AO, increased world save format, sun/sky/exposure feedback loops, or “PR F implemented” despite only a Markdown file.

---

## 17. PR G interface and handoff

F leaves these tested interfaces for G:

```text
ProbePage {
  geometryVersion,
  sourceKey,
  chunkKey,
  latticeOrigin/spacing/heightLevels,
  9 scalar skyVisibility SH coeffs per probe,
  valid / relocation / coverage metadata
}

ProbeResidency {
  getReadyPage(key),
  subscribeReady/Invalidation,
  invalidateWithinHalo(...),
  stageUpload(...),
  inspectStatus()
}

SkyLighting {
  currentSkySH: 9xRGB,
  skySourceVersion,
  exposureIndependentSceneUnits
}

ProbeSampler {
  sampleVisibilitySH(P, normal?), // source SH, unconvolved
  effectiveReceiver/ready,
  neutral fallback
}
```

**PR G** may:

- Extend buffer format with **RGB bounced sky SH**, secondary hit albedo and foliage scatter, sea visibility.
- Project the sun/key's reflection into appropriate bounce direction and relight without geometry retrace.
- Replace current diffuse/ambient once per participating material while preserving direct/specular IBL and location systems.
- Add proper SH deringing and directionality boost after measuring corner/gradient artifacts.
- Expand receivers to selected vegetation, buildings and GLB characters using explicit material adapters; avoid all-material hack.
- Add specular occlusion/IBL balancing grounded in sky visibility.
- Improve local canopy/settlement occluder snapshot providers and invalidate them via semantic edits.
- Still respect the bounded chunk/slot residency and no new dynamic world-sized GPU volume.

**No source API above exists at the time of writing.** They are proposed *interfaces* to align the next PR, not declarations to import.

---

## 18. Immutable Drusniel code references (D)

All URLs use the exact inspected Drusniel SHA `c990d37ee50d3991e8c6f6ccaf2435b31747fabe`.

- **[D1]** [`src/editor/world/InfiniteWorldStore.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/world/InfiniteWorldStore.js#L102-L177) — world-store constructor/cache/revisions; [editing/undo snapshot and world doc](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/world/InfiniteWorldStore.js#L590-L775).
- **[D2]** [`src/editor/world/WorldCoordinates.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/world/WorldCoordinates.js#L1-L153) — canonical chunk keys, safe cells, world Z sign, floor division and chunk centres.
- **[D3]** [`editor.config.yaml` current world/stream settings](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/editor.config.yaml#L1-L78), [`stylizedSurface` section](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/editor.config.yaml#L185-L270).
- **[D4]** [`src/editor/InfiniteTerrainView.js` slot sharing/creation](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/InfiniteTerrainView.js#L110-L256), [`updateStreamingFrame/assignSlot`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/InfiniteTerrainView.js#L615-L830), [`commitPage` and token checks](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/InfiniteTerrainView.js#L830-L960), [`onWorldChange`/edit/coordinate/dispose](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/InfiniteTerrainView.js#L965-L1201).
- **[D5]** [`src/editor/world/TerrainStreamingPlan.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/world/TerrainStreamingPlan.js#L1-L140) — selected current+predicted chunks and slot assignments.
- **[D6]** [`src/editor/world/WorldChunkWorkerClient.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/world/WorldChunkWorkerClient.js#L1-L472) — worker pool, queue, job request/priority/cancel/main-thread fallback.
- **[D7]** [`src/editor/world/worldChunk.worker.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/world/worldChunk.worker.js#L1-L152) — worker request types, generation and transfer lists.
- **[D8]** [`src/editor/world/generateWorldChunk.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/world/generateWorldChunk.js#L1-L128) — generation with edited source, tile/height/render masks/water and scatter; **critical path to protect**.
- **[D9]** [`src/editor/materials/TerrainSlotBindings.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/materials/TerrainSlotBindings.js#L1-L134) — per-object node bindings, samplerless loads, one shared material, historic shader rebuild bottleneck.
- **[D10]** [`src/editor/terrainMaterial.js` initial terrain inputs/world coordinates](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/terrainMaterial.js#L130-L225), [`PBR snow/wetness and final shading`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/terrainMaterial.js#L530-L688).
- **[D11]** [`src/editor/stylized/forestFloorTexture.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/stylized/forestFloorTexture.js#L1-L125) — R canopy, G contact, B litter; caution stale physical size comments.
- **[D12]** [`src/editor/stylized/StylizedSkyView.js` lighting authority](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/stylized/StylizedSkyView.js#L259-L455) — one hemisphere and directional light, update sky state.
- **[D13]** [`src/editor/stylized/sky/skyAmbient.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/stylized/sky/skyAmbient.js#L1-L42) — authored diffuse sky colour.
- **[D14]** [`src/editor/stylized/sky/sceneEnvironment.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/stylized/sky/sceneEnvironment.js#L1-L76) — static HDR environment/metallic specular fallback; PR E dynamic IBL optional.
- **[D15]** [`src/render/postprocessing/nodes/AmbientOcclusionNode.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/render/postprocessing/nodes/AmbientOcclusionNode.js) — GTAO ambient occlusion in main post pipeline.
- **[D16]** [`src/editor/stylized/GodRaysContactOcclusion.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/stylized/GodRaysContactOcclusion.js) — separate cinematic/volumetric contact AO.
- **[D17]** [`src/editor/locations/gen/LightBake.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/locations/gen/LightBake.js#L1-L203) and [`src/editor/locations/materials/LocationShading.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/locations/materials/LocationShading.js#L1-L188) — separate vertex baked cavern lighting and dynamic lamps, not outdoor.
- **[D18]** [`src/editor/world/TerrainCommitQueue.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/world/TerrainCommitQueue.js#L1-L144) — critical path frame-budgeted terrain memcpy commits.
- **[D19]** [`docs/perf-qa.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/docs/perf-qa.md#L1-L195), [`scripts/run-perf-qa.mjs`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/scripts/run-perf-qa.mjs) — native WebGPU, chunk-cross/edited-world, hitch and streaming gates.
- **[D20]** [`src/editor/world/FloatingOrigin.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/world/FloatingOrigin.js#L1-L93) — camera-local rendered X/Z, canonical coordinates.
- **[D21]** [`src/editor/import/AzgaarMacroWorldSource.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/import/AzgaarMacroWorldSource.js) — Azgaar import macro-world heights and canonical topology.
- **[D22]** [`AGENTS.md`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/AGENTS.md#L1-L50) — main-only, Azgaar IDs and performance requirements.
- **[D23]** [`src/editor/performance/qa/GpuPassProfiler.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/performance/qa/GpuPassProfiler.js) — GPU sampled render-pass timestamp limitation.
- **[D24]** [`scripts/fixtures/environment-look-shots.json`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/scripts/fixtures/environment-look-shots.json) — current visual look scenario IDs, same authored shots.
- **[D25]** [`src/editor/stylized/sky/SkyLookController.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/stylized/sky/SkyLookController.js) — resolved sky/weather/region light source.
- **[D26]** [`src/render/postprocessing/PostProcessingGraph.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/render/postprocessing/PostProcessingGraph.js) — main HDR graph and material MRT limitations.
- **[D27]** [`src/editor/InfiniteTerrainView.js` active render branch](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/InfiniteTerrainView.js#L540-L558) — cinematic/volumetric god rays may bypass main post graph.
- **[D28]** [`src/config/validateStylizedLodConfig.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/config/validateStylizedLodConfig.js) — validate new optional sky/probe config.
- **[D29]** [`src/editor/locations/gen/PropOcclusionGrid.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/locations/gen/PropOcclusionGrid.js) — scoped structural voxel occupancy for dedicated location light bake; reference, **not** drop-in outdoor grid.
- **[D30]** [`src/editor/stylized/forest/ScatterClusterField.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/stylized/forest/ScatterClusterField.js) — canonical deterministic forest placement; inspect if using as canopy source.
- **[D31]** [`src/editor/world/ChunkedHeightField.js`](https://github.com/danielsobrado/drusniel-world-builder/blob/c990d37ee50d3991e8c6f6ccaf2435b31747fabe/src/editor/world/ChunkedHeightField.js#L1-L35) — wrapper exposes authoritative world-store sample heights.

## 19. Immutable Ponlai source references (P)

All links use upstream commit `cca905649fe657458697a9e1b179113c97ce5e6e` and are inspected actual files.

- **[P1]** [`packages/island/world/AmbientProbes.ts` design and lattice/rays](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/AmbientProbes.ts#L1-L224), [`Tracer` occupancy/canopy](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/AmbientProbes.ts#L229-L490), [`probe`/`project`/`bakeProbes`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/AmbientProbes.ts#L490-L675), [`openSeaProbe`/`mergeProbes`/fill passes](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/AmbientProbes.ts#L675-L781).
- **[P2]** [`packages/island/world/WorldChunks.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/WorldChunks.ts#L1-L180) — parallel worker pool, per-chunk version and cache.
- **[P3]** [`packages/island/world/ChunkMerge.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/ChunkMerge.ts#L1-L180) — deterministic chunk-row merge and ambient lattice for bounded island.
- **[P4]** [`packages/island/world/chunkWorker.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/chunkWorker.ts#L1-L240) — pure worker work with transferable typed arrays and versioned cache.
- **[P5]** [`packages/render/lighting/AmbientSample.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientSample.ts#L1-L150), [`latticeAt`/`ambientField`/`ambientPoint` and replacement](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientSample.ts#L245-L457) — sample bias, SH reconstruction, sky IBL diffuse replacement and specular occlusion.
- **[P6]** [`packages/render/lighting/AmbientRelight.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientRelight.ts#L1-L185), [`AmbientSky` sky projection](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientRelight.ts#L423-L550), [`AmbientRelight.update`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientRelight.ts#L590-L925) — SH sky × probe visibility and later bounce relight; source idea not a drop-in.
- **[P7]** [`packages/render/lighting/AmbientGrade.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientGrade.ts#L1-L330) — authorial sky and ambient controls on physical probe terms, receiver PBR separation.
- **[P8]** [`packages/render/lighting/ProbeFormat.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/ProbeFormat.ts#L1-L40) — exact SH9 Y-up basis order and 80-float full upstream layout.
- **[P9]** [`packages/render/lighting/Harmonics.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/Harmonics.ts#L1-L235), [`deringing and boost`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/Harmonics.ts#L235-L368) — exact convolution and Gaunt product architecture.
- **[P10]** [`packages/render/lighting/AmbientVolume.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientVolume.ts#L1-L255) — one island volume, staged swaps, 3D irradiance slabs, diagnostic spheres.
- **[P11]** [`packages/render/lighting/GroundBounce.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/GroundBounce.ts#L1-L190) — surface bounce (PR G), avoid port in F.
- **[P12]** [`packages/island/world/SkyOcclusion.ts`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/island/world/SkyOcclusion.ts#L1-L155) — local SDF sky/contact rays and sparse spatial bounds, inspiration for optional static blockers.
- **[P13]** [`packages/render/lighting/AmbientVolume.ts` `probeBuffer`/`outputTexture`](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/packages/render/lighting/AmbientVolume.ts#L227-L255) — 7-slab RGBA16F resource, heavy design **not** required for sky-only F.

### Background references and provenance

- [Jasmin Patry, *Real-Time Samurai Cinema: Lighting, Atmosphere and Tonemapping in Ghost of Tsushima*, SIGGRAPH 2021](https://advances.realtimerendering.com/s2021/) — directional sky visibility probes and day/weather relighting.
- [Peter-Pike Sloan, *Stupid Spherical Harmonics (SH) Tricks*, GDC 2008](https://www.ppsloan.org/publications/StupidSH36.pdf) — harmonic projection/product/lighting technique.
- [Ramamoorthi & Hanrahan, *An Efficient Representation for Irradiance Environment Maps*, SIGGRAPH 2001](https://graphics.stanford.edu/papers/envmap/) — low-order SH diffuse irradiance.
- [Majercik et al., *Scaling Probe-Based Real-Time Dynamic Global Illumination for Production*, JCGT 2021](https://jcgt.org/published/0010/02/01/) — probe relocation/bias/visibility/leak reduction.
- [Ponlai root MIT licence](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/LICENSE) and [credits](https://github.com/HuberyLL/ponlai/blob/cca905649fe657458697a9e1b179113c97ce5e6e/CREDITS.md) — record exact translated source and retain required notices; assets and downstream dependency licences audited independently.

---

**Handoff summary:** The intended result is not a scenic fake darkening filter. It is deterministic, world-anchored **directional sky visibility**, projected to SH9 per probe, streamed and safely sampled by one shared outdoor terrain shader, then combined with the existing sky **without adding another ambient source**. Geometry version and sky version are separate; all chunk/lighting transitions are bounded. PR G extends that validated base with bounce and broader receivers — never by importing Ponlai's entire finite-island system or bypassing Drusniel's established shader and worker architecture.
