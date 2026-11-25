# World Surface Context (WSC) — PR 0 Visual Baseline & Diagnostic Suite

- **Baseline commit:** `b7183e59` (`main`)
- **Viewport & backend:** `1920×1080`, Hardware WebGPU (`NVIDIA Lovelace`, `fallback: false`)
- **Total screenshots:** `215` (indexed in [`manifest.json`](manifest.json))
- **Full architectural audit:** [`docs/plans/world-surface-context-pr-00-baseline-2026-11-25.md`](../../../plans/world-surface-context-pr-00-baseline-2026-11-25.md)

## Review Galleries (Start Here)

| Gallery | File | Contents |
|---|---|---|
| **Gallery E — Overview** | [`galleries/overview.jpg`](galleries/overview.jpg) | All 16 biomes & transitions (`B01`–`B15`, `B18`) |
| **Gallery A — Grass & Ground** | [`galleries/grass-ground.jpg`](galleries/grass-ground.jpg) | Stillmeadow `B14-C02` & Grassland `B01-C02` (`D00`, `D01`, `D02`, `D05`, `D08`, `D11`, `D12`, `D18`, `D24`) |
| **Gallery B — Tree Root Contact** | [`galleries/tree-contact.jpg`](galleries/tree-contact.jpg) | Stillmeadow `B14-C03` (`D00`, `D01`, `D05`, `D08`, `D12`, `D13`), Deciduous `B02`, Taiga `B05` |
| **Gallery C — Understories** | [`galleries/understory-contact.jpg`](galleries/understory-contact.jpg) | Stillmeadow `C04`, Tropical Rainforest `B04`, Temp. Rainforest `B03`, Wetland `B06`, Fixture layer isolation |
| **Gallery D — Rocks & Structures** | [`galleries/rock-contact.jpg`](galleries/rock-contact.jpg) | Multi-substrate fixture boulders, Desert `B08`, Tundra `B10`, Alpine `B12`, `B16`/`B17` seams, `B14-C06`, `B18` |
| **Gallery F — Lighting & Weather** | [`galleries/lighting-comparison.jpg`](galleries/lighting-comparison.jpg) | Sunrise, Clear Noon, Overcast, Sunset, Night, Rain + `D16` Direct & `D17` Indirect isolation |
| **Gallery G — LOD Continuity** | [`galleries/lod-continuity.jpg`](galleries/lod-continuity.jpg) | `0 m → 12 m → 32 m → 58 m → 95 m → 145 m` sweep + `D20` LOD classification |
| **Stillmeadow & Settlement Contact** | [`galleries/settlement-contact.jpg`](galleries/settlement-contact.jpg) | Stillmeadow `C01`–`C06` + `D15` GC field validity + `D25` chunk/field boundaries |
| **Gallery H — Critical Defects** | [`galleries/critical-defects.jpg`](galleries/critical-defects.jpg) | Annotated copies highlighting `DEF-01`..`DEF-13` (original screenshots untouched) |

## Key Original Screenshots (Unmodified)

- **Stillmeadow Forest Approach (`B14-C01`):**
  - [`B14-C01-overcast-D00-normal.png`](stillmeadow/forest-approach/B14-C01-overcast-D00-normal.png) — Normal baseline reproducing dark grass over saturated forest floor
  - [`B14-C01-overcast-D01-albedo.png`](stillmeadow/forest-approach/B14-C01-overcast-D01-albedo.png) — Unlit albedo proving grass is **+50.0% brighter** than terrain before lighting flips it to **−37.1% darker**
  - [`B14-C01-overcast-D18-emissive.jpg`](stillmeadow/forest-approach/B14-C01-overcast-D18-emissive.jpg) — Isolates `FOREST_FLOOR_FILL = 0.8` terrain glow vs `0.025` grass fill
  - [`B14-C01-overcast-D12-substrate.png`](stillmeadow/forest-approach/B14-C01-overcast-D12-substrate.png) — Exposes flat uniform brown `GroundContactField.soilColor`
  - [`B14-C01-overcast-D11-vegetation-coverage.jpg`](stillmeadow/forest-approach/B14-C01-overcast-D11-vegetation-coverage.jpg) — Exposes `surfaceMask.g = 1.0` turf painted under sparse blades
- **Stillmeadow Grass & Trunk Base (`B14-C02`, `B14-C03`):**
  - [`B14-C02-overcast-D00-normal.png`](stillmeadow/grass-contact/B14-C02-overcast-D00-normal.png) / [`B14-C02-overcast-D01-albedo.png`](stillmeadow/grass-contact/B14-C02-overcast-D01-albedo.png) (`D12` vs `D01` `ΔE00 = 11.53`)
  - [`B14-C03-overcast-D00-normal.png`](stillmeadow/tree-roots/B14-C03-overcast-D00-normal.png) / [`B14-C03-overcast-D13-gc-height.jpg`](stillmeadow/tree-roots/B14-C03-overcast-D13-gc-height.jpg) / [`B14-C03-overcast-D06-roughness.jpg`](stillmeadow/tree-roots/B14-C03-overcast-D06-roughness.jpg)
- **Streaming, Teleportation & Floating Origin:**
  - [`STR-CB01-clear-D00-normal.png`](streaming/chunk-boundaries/STR-CB01-clear-D00-normal.png) & [`STR-CB01-clear-D25-chunk-boundaries.jpg`](streaming/chunk-boundaries/STR-CB01-clear-D25-chunk-boundaries.jpg)
  - [`STR-TP01-unsettled-D15-gc-validity.jpg`](streaming/teleportation/STR-TP01-unsettled-D15-gc-validity.jpg) vs [`STR-TP02-settled-D15-gc-validity.jpg`](streaming/teleportation/STR-TP02-settled-D15-gc-validity.jpg)
  - [`STR-FO01-before-rebase-D00-normal.png`](streaming/floating-origin/STR-FO01-before-rebase-D00-normal.png) vs [`STR-FO02-after-rebase-D00-normal.png`](streaming/floating-origin/STR-FO02-after-rebase-D00-normal.png)

## Metrics & Configuration

- [`cameras.yaml`](cameras.yaml) — Frozen reproducible camera manifest (`B01`–`B18`, lighting sweeps, LOD sweeps)
- [`environment.yaml`](environment.yaml) — Frozen world/renderer/hardware configuration
- [`metrics/color-measurements.json`](metrics/color-measurements.json) — 27 CIELAB/CIEDE2000 comparisons
- [`metrics/material-audit.csv`](metrics/material-audit.csv) — 17-family material pipeline matrix
- [`metrics/shader-contributions.json`](metrics/shader-contributions.json) — Emissive fill & double-shading audit (`DS-01`..`DS-04`)
- [`metrics/performance-baseline.json`](metrics/performance-baseline.json) — Frame time (`143.8 FPS` @ `FX-C02`), diagnostic overhead (`0.00 ms` when `D00`), resident resource telemetry, and `qa:perf` notes

## Diagnostic Mode Legend (`config/wsc-diagnostics.yaml`)

| Mode | Slug | Stage | Status |
|---|---|---|---|
| `D00` | `normal` | Final production render (default) | Supported |
| `D01` | `albedo` | Resolved unlit material `colorNode` | Supported |
| `D02` | `source-albedo` | Raw texture × base color × vertex color | Supported |
| `D03` | `biome-pigment` | Terrain `tileTexture` / `instanceBiomeLook` / GC soil | Supported |
| `D04` | `local-tint` | Canonical `meadowPatchColors` macro tint & dry field | Supported |
| `D05` | `normals` | World-space normals `(N*0.5+0.5)` | Supported |
| `D06` | `roughness` | Explicit scalar × `roughnessMap.g` | Supported |
| `D07` | `metalness` | Explicit scalar × `metalnessMap.b` (magenta alert >0.05) | Supported |
| `D08` | `contact-ao` | `GroundContactField.contact` heatmap | Supported |
| `D09` | `canopy` | `GroundContactField.canopy` coverage | Supported |
| `D10` | `forest-litter` | Terrain `forestFloorTexture.b` | Supported |
| `D11` | `vegetation-coverage` | Terrain `surfaceMask.g` vs cyan grass geometry | Supported |
| `D12` | `substrate` | `GroundContactField.soilColor` | Supported |
| `D13` | `gc-height` | Signed `positionWorld.y - gc.height` (blue/green/yellow/red) | Supported |
| `D14` | `gc-normal` | `GroundContactField.normal` | Supported |
| `D15` | `gc-validity` | Active window (green), border fade (yellow), outside (red), missing fallback (magenta) | Supported |
| `D16` | `direct-lighting` | Sun/moon + shadows only (hemi/IBL/emissive zeroed) | Supported |
| `D17` | `indirect-lighting` | Hemi + IBL + emissive only (sun zeroed) | Supported |
| `D18` | `emissive` | Material `emissiveNode` at `2×` gain | Supported |
| `D19` | `shadow` | White Lambert shadow receiver isolation | Supported |
| `D20` | `lod` | 13-class LOD representation palette | Supported |
| `D21` | `wetness` | `surfaceWetnessUniform` + shore mask | Supported |
| `D22` | `moss` | Approximate upward/canopy moss eligibility | Partial *(per-material masks vary)* |
| `D23` | `snow` | Storm + altitude snow cover | Supported |
| `D24` | `material-family` | 17-family categorical segmentation palette | Supported |
| `D25` | `chunk-boundaries` | Red 128 m chunk, yellow 8 m meadow tile, cyan 128 m GC field borders | Supported |
