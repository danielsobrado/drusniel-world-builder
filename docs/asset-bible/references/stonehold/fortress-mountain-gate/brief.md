# Asset Production Brief:  (`stonehold/fortress-mountain-gate`)

- **Scope**: Mountain Kingdom of Stonehold (`stonehold`)
- **Asset Class**: `defense`
- **Priority**: `P0`
- **Lore Provenance**: `design-proposal`
- **Current Model Status**: `planned`
- **Target Footprint**: `14m W × 8m D × 9m H`
- **Runtime Fallback**: `gatehouse` (variant `0`, kit prefab `Gatehouse`)

## Required Reference Views

Place approved reference images in this directory before advancing `modelStatus` to `reference-approved`:

- [ ] `hero.png` — 3/4 isometric architectural concept sheet
- [ ] `front.png` — Orthographic `+Z` front elevation (doorway face)
- [ ] `left.png` — Orthographic `-X` left side profile
- [ ] `rear.png` — Orthographic `-Z` rear elevation
- [ ] `top.png` — Orthographic `+Y` top-down roof plan
- [ ] `detail.png` — Joinery, lintel, foundation, and eave callout sheet

## View Prompts

### Hero (`hero.png`)
> Isolated 3/4 isometric architectural concept sheet of a  (defense) for Mountain Kingdom of Stonehold in the world of Drusniel. Footprint 14m width × 8m depth × 9m height. Built with interlocking ashlar basalt and iron bands, stepped stone corbel and slate (buttressed gabled vault with flues), resting on a heavy cyclopean plinth foundation. Grounded, physically believable load-bearing construction, clear human door scale (2.1m doorway), neutral studio gray background (#808080), soft even overcast key light, crisp material separation for 3D modeling reference.
- **Negative**: `busy background, environment clutter, dramatic fog, lens flare, cropped edges, floating geometry, watermark, text`

### Front Orthographic (`front.png`)
> True orthographic front elevation (+Z facade) of a  (Mountain Kingdom of Stonehold), footprint 14m wide by 9m tall. Primary entrance clearly visible, interlocking ashlar basalt and iron bands, stepped stone corbel and slate, heavy cyclopean plinth base resting on a flat ground line. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Left Orthographic (`left.png`)
> True orthographic left side elevation (-X profile) of a  (Mountain Kingdom of Stonehold), 8m deep by 9m tall. Consistent roof ridge height, eave overhang, wall courses, and heavy cyclopean plinth plinth matching the front elevation. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Rear Orthographic (`rear.png`)
> True orthographic rear elevation (-Z back wall) of a  (Mountain Kingdom of Stonehold), 14m wide by 9m tall. Service doors, chimney flue or structural buttresses, interlocking ashlar basalt and iron bands and stepped stone corbel and slate matching the front elevation. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Top Orthographic (`top.png`)
> True orthographic top-down roof plan (+Y nadir view) of a  (Mountain Kingdom of Stonehold), 14m by 8m footprint. Shows stepped stone corbel and slate ridge lines, valleys, flue caps, and foundation perimeter. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Detail Sheet (`detail.png`)
> Architectural callout sheet for  (Mountain Kingdom of Stonehold): close-up orthographic details of doorway lintel, window frame, wall-to-foundation joint (heavy cyclopean plinth), and roof eave joinery (stepped stone corbel and slate). Neutral #808080 background, even studio lighting, clear construction joints.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

## Blender & GLB Export Checklist

- **Units & Axes**: `meters`, `+Z front, +Y up (glTF 2.0 standard)`
- **Pivot / Origin**: `bottom-center of foundation at ground plane (y=0)`
- **LOD Chain**: LOD0 (full detail), LOD1 (45% triangles), LOD2 (20% skyline proxy)
- **Collision**: oriented box or convex hull in moduleColliders/prefabs
