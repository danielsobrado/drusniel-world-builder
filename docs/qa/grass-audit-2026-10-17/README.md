# Grass look audit: random biome screenshots, October 17, 2026

[Improvement plan](../../plans/grass-aaa-look-plan-2026-10-17.md) ·
[Contact sheet](contact-sheet.jpg) (primary spots: eye, low and down framings)

This archive holds 80 frames, captured at 1600 × 900 and stored here as 1280 px
JPEGs. They were not retouched. No browser errors were recorded, and every
frame's biome ID matched its spot.

## Capture

- **Runtime.** A frozen snapshot of `main` at `68afbd1e`, served by
  `node scripts/serve-world-visual-snapshot.mjs HEAD 5191`. The browser was
  headed Windows Chromium on hardware WebGPU.
- **Conditions.**
  - Paused Highfield noon, manual weather off.
  - Production post-processing, including TRAA.
  - The `?qaVisual=1` camera-cut path (`prepareVisualPose`): 16 s minimum
    preparation for each spot's first frame, 4 s for the rest.
- **Spot selection.**
  - Primary spots `bNN` use seed `20261017`. Supplementary spots `bNNs` use seed
    `4242`, for IDs 4, 6, 9 and 12.
  - The script takes the first random cell for each land-biome ID whose 5 × 5
    neighbourhood at 6 m spacing is the same biome.
  - `b06`, `b09` and `b12` landed on dirt roads, which share the biome tile.
    The supplements give an off-road view of those biomes.
- **Framings.**

  | Tag | Camera |
  | --- | --- |
  | `eye` | Player eye height, pitch −0.08, FOV 68 |
  | `eye-rev` | Same as `eye`, turned 180° |
  | `down` | Player, pitch −0.62 |
  | `low` | Fly camera at 0.45 m, pitch +0.03, FOV 55 |
  | `aerial` | Fly camera at 45 m, pitch −0.42 |

- **Crops.** The `zoom-*.jpg` files are crops of the full-resolution PNGs.

| ID | Biome | Primary spot (x, z, metres) | Supplement (x, z, metres) |
| --- | --- | --- | --- |
| 01 | Hot desert | −5845, −71 | |
| 02 | Cold desert | 9589, −11521 | |
| 03 | Savanna | 15053, −2791 | |
| 04 | Grassland | −10233, 4237 | −4735, −6121 |
| 05 | Tropical seasonal forest | −829, 441 | |
| 06 | Temperate deciduous forest | 8025, −8293 (road) | −2839, −9691 |
| 07 | Tropical rainforest | 12951, −1421 | |
| 08 | Temperate rainforest | −11351, −11019 | |
| 09 | Taiga | 15727, 8687 (road) | 543, 12939 |
| 10 | Tundra | −9757, 14475 | |
| 11 | Glacier | 13703, −14213 | |
| 12 | Wetland | 2919, −12433 (road) | 1925, 2817 |

Exact coordinates and yaws are in [report.json](report.json) and
[report-supplement.json](report-supplement.json).

## Reproduce

Run from the repository root:

```bash
cp docs/qa/grass-audit-2026-10-17/capture-script.mjs tmp/capture-grass-audit-2026-10-17.mjs
```

```bash
node scripts/serve-world-visual-snapshot.mjs HEAD 5191
```

```bash
GRASS_AUDIT_URL=http://localhost:5191 node tmp/capture-grass-audit-2026-10-17.mjs
```

The supplement run uses the same command with
`GRASS_AUDIT_SEED=4242 GRASS_AUDIT_ONLY=4,6,9,12 GRASS_AUDIT_OUT=tmp/grass-audit-2026-10-17-supp`.
[build-sheets.cjs](build-sheets.cjs) builds the contact sheets.

Things to know when reproducing:

- The selection uses the generator in the current checkout. Compare the
  requested spots with the reports.
- Live wind and particles make the frames impossible to reproduce pixel for
  pixel.
- The script takes the shared hardware-browser lock.

## Limits

- **Stills only.** Motion, shimmer and trample are not judged.
- **One lighting condition.** All frames use a high noon sun.
- **No performance measurement.**
- **One spot per biome.** The archive samples each biome; it does not survey
  the world.
