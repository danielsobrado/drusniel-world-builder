# Asset Production Brief:  (`grukmar/bog-stilt-dwelling`)

- **Scope**: Grukmar Confederacy & Bog Marches (`grukmar`)
- **Asset Class**: `residence`
- **Priority**: `P0`
- **Lore Provenance**: `design-proposal`
- **Current Model Status**: `planned`
- **Target Footprint**: `8m W × 7m D × 6m H`
- **Runtime Fallback**: `house` (variant `2`, kit prefab `Goblin_House_Small`)

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
> Isolated 3/4 isometric architectural concept sheet of a  (residence) for Grukmar Confederacy & Bog Marches in the world of Drusniel. Footprint 8m width × 7m depth × 6m height. Built with charred bog cypress lashings and upland rubble, layered marsh reed thatch and tarred plank (steep shed and pitched stilt canopy), resting on a bog stilt or earthfast foundation. Grounded, physically believable load-bearing construction, clear human door scale (2.1m doorway), neutral studio gray background (#808080), soft even overcast key light, crisp material separation for 3D modeling reference.
- **Negative**: `busy background, environment clutter, dramatic fog, lens flare, cropped edges, floating geometry, watermark, text`

### Front Orthographic (`front.png`)
> True orthographic front elevation (+Z facade) of a  (Grukmar Confederacy & Bog Marches), footprint 8m wide by 6m tall. Primary entrance clearly visible, charred bog cypress lashings and upland rubble, layered marsh reed thatch and tarred plank, bog stilt or earthfast base resting on a flat ground line. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Left Orthographic (`left.png`)
> True orthographic left side elevation (-X profile) of a  (Grukmar Confederacy & Bog Marches), 7m deep by 6m tall. Consistent roof ridge height, eave overhang, wall courses, and bog stilt or earthfast plinth matching the front elevation. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Rear Orthographic (`rear.png`)
> True orthographic rear elevation (-Z back wall) of a  (Grukmar Confederacy & Bog Marches), 8m wide by 6m tall. Service doors, chimney flue or structural buttresses, charred bog cypress lashings and upland rubble and layered marsh reed thatch and tarred plank matching the front elevation. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Top Orthographic (`top.png`)
> True orthographic top-down roof plan (+Y nadir view) of a  (Grukmar Confederacy & Bog Marches), 8m by 7m footprint. Shows layered marsh reed thatch and tarred plank ridge lines, valleys, flue caps, and foundation perimeter. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Detail Sheet (`detail.png`)
> Architectural callout sheet for  (Grukmar Confederacy & Bog Marches): close-up orthographic details of doorway lintel, window frame, wall-to-foundation joint (bog stilt or earthfast), and roof eave joinery (layered marsh reed thatch and tarred plank). Neutral #808080 background, even studio lighting, clear construction joints.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

## Blender & GLB Export Checklist

- **Units & Axes**: `meters`, `+Z front, +Y up (glTF 2.0 standard)`
- **Pivot / Origin**: `bottom-center of foundation at ground plane (y=0)`
- **LOD Chain**: LOD0 (full detail), LOD1 (45% triangles), LOD2 (20% skyline proxy)
- **Collision**: oriented box or convex hull in moduleColliders/prefabs
