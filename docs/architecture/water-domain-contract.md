# Water Domain Contract

## Status

Implemented domain contract. Runtime inventory updated October 17, 2026. Some later design sections retain proposed extensions; the current representation is described below.

This contract defines the shared water representation required by terrain generation, rendering, player movement, simulation, aquatic vegetation, and future boats. Water geography must be authoritative outside the shader. Rendering consumes the water domain; it must not infer geography from colours or visual masks.

## Current runtime

- `WaterTerrainModel`, `RiverChannel`, `RiverReachProfile` and `LakeBodies` resolve deterministic beds, local levels, kinds, body IDs, current direction, falls and plunge pools. Imported river courses remain source geography.
- `TerrainWaterQueries` adapts canonical world meters and render coordinates to generator cell coordinates. Player wading, swimming and submersion consume these queries. Marine surface queries share the render wave equations and bounded local exposure estimate.
- Worker-generated water fields belong to terrain pages. `StylizedWaterSlot` uploads them to a fixed resident slot pool and shares material graphs through `SharedWaterMaterials`. Dry chunks draw no water; only nearby water receives the refraction variant.
- `StylizedWaterMaterial` consumes depth, flow and explicit water-kind data. A lake at sea level remains inland water even when its current is zero. Depth optics remain enabled on low quality; expensive flow, reflection and refraction work can be omitted.
- `WaterAppearance` resolves continuous organic/cold priors from a coarse, world-aligned biome context. These are presentation values, not new terrain categories or replacements for the 13 Azgaar IDs.
- `WaterObstacleUpdates` derives local river disturbance from already resident rock manifests, under the shared scenery budget. Player ripple impulses use a bounded pooled batch and validate their body contact through CPU queries.
- `WaterVisualClock` synchronizes the water sheet, ground swash and CPU wave phase. The development visual QA adapter can freeze it while leaving the rest of the world active.

The [water appearance implementation record](../qa/water-aaa-implementation-2026-10-17/README.md) records visual and performance evidence. Rendered mesh interpolation and field quantization must be assessed separately from agreement between the shared CPU/shader equations.

## Design rules

1. One canonical query must describe water at any world position.
2. Terrain generation, rendering, physics, and simulation must consume the same values.
3. Water queries must use canonical world coordinates and remain stable across floating-origin rebases.
4. Water generation must be deterministic across chunk unload and reload.
5. Adjacent chunks must calculate matching water values at shared boundaries.
6. Normal runtime operation must not require GPU readbacks.
7. Visual quality features must be independently configurable and degradable.
8. Imported geography remains source data; generated bathymetry and channels are deterministic derived data.

## Canonical sample

```ts
export const WATER_KIND_NONE = 0;
export const WATER_KIND_OCEAN = 1;
export const WATER_KIND_LAKE = 2;
export const WATER_KIND_RIVER = 3;

export interface WaterSample {
  kind: number;
  bodyId: number;
  coverage: number;
  surfaceHeight: number;
  bedHeight: number;
  depth: number;
  shoreDistance: number;
  flowX: number;
  flowZ: number;
}
```

Required invariants:

- `coverage` is within `[0, 1]`.
- `depth = max(0, surfaceHeight - bedHeight)`.
- `kind === WATER_KIND_NONE` implies `coverage === 0` and `depth === 0`.
- `flowX` and `flowZ` form a normalised horizontal direction when flow is defined.
- `bodyId` is deterministic and stable for the same imported or generated body.
- `shoreDistance` is zero at the water boundary, positive in water, and may be clamped to a configured maximum range.

Body IDs and flow are implemented. Rendering appearance data does not replace or truncate the canonical CPU body ID.

## Runtime query API

The world generator exposes a query on canonical **cell axes**:

```ts
sampleWater(cellX: number, cellZ: number): WaterSample
```

The terrain view exposes canonical world-meter and render-space adapters:

```ts
getCanonicalWater(worldX: number, worldZ: number): WaterSample
getWorldWater(renderX: number, renderZ: number): WaterSample
```

`getWorldWater` converts render coordinates through `FloatingOrigin.toCanonical` and delegates to the world generator or a dedicated water-domain service.

Physics must use the CPU query. The shader uses worker-generated chunk textures containing equivalent values. Tests must verify that both paths agree within documented quantisation tolerances.

## Streamed water field

Do not overload `surfaceMaskTexture`. Its channels already represent path influence, grass classification, and binary water classification.

Each terrain slot receives a dedicated `waterFieldTexture` generated with the page data in the chunk worker.

Current primary layout: `RGBA16F`, with `(chunkSize + 1)` vertices on each axis.

| Channel | Meaning |
|---|---|
| R | Water coverage |
| G | Water surface height relative to the page's double-precision surface origin |
| B | Signed surface-minus-bed distance, including negative dry-side samples |
| A | Shore distance |

The signed render field retains the true zero crossing between wet and dry vertices. Shading clamps it to nonnegative depth for optics. Canonical CPU samples still obey the clamped `depth` invariant above.

The current flow texture is `RGBA8`, with normalized encoded direction and independent whitewater channels:

| Channel | Meaning |
|---|---|
| R | Flow X |
| G | Flow Z |
| B | Fall weight |
| A | Plunge weight |

An additional `RGBA8` appearance field carries nearest-sampled kind, organic response, cold response and marine exposure. Numeric context is filtered continuously; discrete kinds are decoded before any coverage filtering. No free channel in the flow texture is repurposed.

The optional local rock response uses a separate `RG8` field for downstream disturbance and upstream slowing. Its producer is resumable, works only near river water, and never requests additional rock residency. It has an explicit opt-out at `water.riverSurface.obstacles`.

The fixed slot set costs `(chunkSize + 1)^2 × 18` source bytes per slot: 8 primary, 4 flow, 4 appearance and 2 obstacle. At chunk size 64 and 49 slots this is 3,726,450 bytes (3.55 MiB), before CPU page storage, staging and driver overhead. The previous primary+flow set was 2.37 MiB at these dimensions. Textures and typed arrays are reused and disposed with their slots.

The sampling halo preserves shared-edge values. The owned `(chunkSize + 1)²` vertex field is uploaded; the coarse biome context is aligned to global cell coordinates so independently generated chunks resolve the same edge.

## Water-body rules

### Procedural ocean

- `surfaceHeight` uses the authoritative generator sea level.
- Existing generated terrain below sea level remains the seabed.
- A deterministic coastal shelf may reshape shallow bathymetry without moving the coastline.
- Broad seabed variation must remain lower frequency than playable terrain detail.
- Underwater slopes must be clamped where required for walkable shallows and stable collision.

### Imported Azgaar ocean

- Cells below Azgaar's land threshold remain ocean.
- The imported coastline remains unchanged.
- Bathymetry increases with distance from land rather than mapping all ocean heights through one shallow linear formula.
- The configured transition outside imported bounds continues toward deep ocean.
- Derived bathymetry is deterministic from source atlas data, coordinates, and generator seed.

### Imported Azgaar river

A river is not a global sea-level water tile. It requires a local channel model.

For every relevant river segment:

1. Calculate distance to the centre line.
2. Convert imported river width to world-space channel radius.
3. Calculate a smooth bank profile.
4. Derive channel depth from width and optional river metadata.
5. Carve the generated terrain bed.
6. Derive a local water surface elevation from nearby terrain and downstream progression.
7. Merge tributary and main-channel levels without steps.
8. Produce coverage, depth, shore distance, and flow direction.

The initial channel may use a deterministic analytic profile rather than hydraulic simulation.

```text
bedHeight = sourceTerrainHeight
  - channelDepth * smoothBankProfile(distance / channelRadius)
```

River surface elevation must be continuous across chunk boundaries and should maintain a small downstream gradient. It must never be derived independently by each rendered slot.

### Lake

Lakes require a stable `bodyId` and a per-body surface elevation. A single global sea-level plane cannot represent inland lakes correctly.

Lake support may follow oceans and rivers, but the domain contract reserves it now. The preferred model is connected-body identification during import or deterministic generation, followed by one resolved surface level per body.

## Terrain ownership

The canonical CPU heightfield remains authoritative for player collision. Water transformations that alter the seabed or river channel must therefore be applied during world chunk generation before page heights are returned.

The rendered terrain height texture, player grounding, editor picking, water depth, and persistence must all observe the same transformed height values.

Generated transformations are base terrain, not sparse user edits. Manual terrain edits remain overrides on top of the generated water-aware terrain.

## Rendering consumption

The water shader consumes:

- Water coverage.
- Water surface height.
- Water-column depth.
- Shore distance.
- Optional flow direction.
- Opaque scene colour.
- Opaque scene depth.
- Camera position relative to the local water surface.

The shader may add animated normals, highlights, foam, refraction, absorption, and caustics, but none of these may redefine whether water exists or how deep it is.

The current FBM and Voronoi pattern should be retained only as a stylised highlight or foam layer. It must no longer drive the semantic deep/shallow classification.

## Physics consumption

Player movement consumes the same `WaterSample` as rendering.

Required movement states:

```text
dry -> wading -> swimming -> submerged
```

State transitions use configured thresholds and hysteresis. Physics owns movement state; rendering owns only visual transition state.

Suggested status fields:

```ts
interface PlayerWaterStatus {
  waterState: 'dry' | 'wading' | 'swimming' | 'submerged';
  waterDepth: number;
  headSubmerged: boolean;
  bodyId: number;
}
```

Expected behaviour:

- Shallow water preserves ground walking with increasing drag.
- Water deeper than the standing threshold transitions to swimming.
- Swimming reduces effective gravity and applies buoyancy and drag.
- The player continues to collide with the authoritative CPU seabed.
- Normal jumping is disabled while swimming.
- Upward and downward swimming are explicit inputs.
- Surface thresholds use hysteresis to prevent rapid state flicker.

## Persistence

The save format should persist source inputs and authored overrides, not generated per-chunk water textures.

Persist when applicable:

- Water-domain schema version.
- Imported water-body identifiers and metadata.
- Imported river geometry and source width data.
- Per-body lake levels when sourced or authored.
- User-authored water changes.

Regenerate:

- Chunk water fields.
- Shore-distance fields.
- Procedural bathymetry.
- Deterministic river channel carving derived from stored river source data.

Any change that alters deterministic terrain or water output requires an explicit generator or water-domain version increase.

## Configuration boundary

Proposed configuration structure:

```yaml
waterDomain:
  version: 1
  shoreDistanceMeters: 48
  ocean:
    coastalShelfMeters: 32
    shelfDepth: 4
    maximumDepth: 24
    maximumBedSlope: 0.75
  river:
    minimumDepth: 0.8
    maximumDepth: 8
    widthDepthRatio: 0.18
    bankExponent: 1.8
    minimumGradient: 0.0002

player:
  water:
    wadeDepth: 0.7
    swimDepth: 1.35
    transitionHysteresis: 0.12
    wadeDrag: 0.35
    swimSpeed: 5
    verticalSwimSpeed: 3
    buoyancy: 18
    swimDrag: 4
```

Visual settings remain under `stylizedSurface.water` because they do not define geography or physics.

## Required tests

### Determinism

- The same canonical coordinate returns the same water sample after chunk eviction and regeneration.
- Worker and synchronous generation produce identical water fields.
- Floating-origin rebases do not change water values.

### Continuity

- Shared chunk edges have matching surface height, bed height, coverage, depth, and shore distance.
- River surface elevation and carved bed do not step at chunk boundaries.
- Tributaries join main rivers without exposed walls or elevated water shelves.

### Domain agreement

- CPU `sampleWater` agrees with uploaded water-field values within quantisation tolerance.
- Player water states match the rendered local surface and depth.
- Terrain collision bed height equals the bed used by the water shader.

### Persistence

- Save and reload preserve source water data and regenerate identical derived fields.
- Water-domain version mismatch fails explicitly or migrates through a tested path.

### Performance

- No GPU readbacks are introduced.
- Water-field generation reports worker timings.
- Upload bytes and allocation sizes are included in performance telemetry.
- Water-domain work remains bounded by terrain residency rather than total map size.
