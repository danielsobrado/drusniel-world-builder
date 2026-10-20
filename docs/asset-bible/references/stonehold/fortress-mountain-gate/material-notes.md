# Material & PBR Notes:  (`stonehold/fortress-mountain-gate`)

## Required PBR Maps (2048×2048 tileable, 1024×1024 trim/props)

- `basecolor`
- `normal`
- `roughness`
- `ao`
- `height`

## Material Prompts

### Slot: `wall_primary` (interlocking ashlar basalt and iron bands)
> Seamless tileable 2m×2m orthographic texture reference of interlocking ashlar basalt and iron bands for Mountain Kingdom of Stonehold. Even diffuse albedo lighting, no directional cast shadows, crisp mortar and timber grain detail suitable for 2K PBR basecolor/normal/roughness extraction.
- **Negative**: `directional sunlight, hard cast shadows, specular highlights, perspective tilt, seams, borders, frames, watermark, text`

### Slot: `roof_primary` (stepped stone corbel and slate)
> Seamless tileable 2m×2m orthographic texture reference of stepped stone corbel and slate for Mountain Kingdom of Stonehold. Even diffuse albedo lighting, no directional cast shadows, clear overlapping course geometry suitable for 2K PBR extraction.
- **Negative**: `directional sunlight, hard cast shadows, specular highlights, perspective tilt, seams, borders, frames, watermark, text`

