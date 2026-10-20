# Asset Production Brief:  (`zuraldi/six-offices-council-hall`)

- **Scope**: Zuraldi Highland Autonomy (`zuraldi`)
- **Asset Class**: `civic`
- **Priority**: `P0`
- **Lore Provenance**: `design-proposal`
- **Current Model Status**: `planned`
- **Target Footprint**: `14m W × 10m D × 6.5m H`
- **Runtime Fallback**: `hall` (variant `0`, kit prefab `Nordic_Guildhall`)

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
> Isolated 3/4 isometric architectural concept sheet of a  (civic) for Zuraldi Highland Autonomy in the world of Drusniel. Footprint 14m width × 10m depth × 6.5m height. Built with dry laid mountain granite and larch beams, heavy split shale slabs (low wind resistant hipped gable), resting on a stepped dry stone terrace foundation. Grounded, physically believable load-bearing construction, clear human door scale (2.1m doorway), neutral studio gray background (#808080), soft even overcast key light, crisp material separation for 3D modeling reference.
- **Negative**: `busy background, environment clutter, dramatic fog, lens flare, cropped edges, floating geometry, watermark, text`

### Front Orthographic (`front.png`)
> True orthographic front elevation (+Z facade) of a  (Zuraldi Highland Autonomy), footprint 14m wide by 6.5m tall. Primary entrance clearly visible, dry laid mountain granite and larch beams, heavy split shale slabs, stepped dry stone terrace base resting on a flat ground line. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Left Orthographic (`left.png`)
> True orthographic left side elevation (-X profile) of a  (Zuraldi Highland Autonomy), 10m deep by 6.5m tall. Consistent roof ridge height, eave overhang, wall courses, and stepped dry stone terrace plinth matching the front elevation. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Rear Orthographic (`rear.png`)
> True orthographic rear elevation (-Z back wall) of a  (Zuraldi Highland Autonomy), 14m wide by 6.5m tall. Service doors, chimney flue or structural buttresses, dry laid mountain granite and larch beams and heavy split shale slabs matching the front elevation. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Top Orthographic (`top.png`)
> True orthographic top-down roof plan (+Y nadir view) of a  (Zuraldi Highland Autonomy), 14m by 10m footprint. Shows heavy split shale slabs ridge lines, valleys, flue caps, and foundation perimeter. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

### Detail Sheet (`detail.png`)
> Architectural callout sheet for  (Zuraldi Highland Autonomy): close-up orthographic details of doorway lintel, window frame, wall-to-foundation joint (stepped dry stone terrace), and roof eave joinery (heavy split shale slabs). Neutral #808080 background, even studio lighting, clear construction joints.
- **Negative**: `perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow`

## Blender & GLB Export Checklist

- **Units & Axes**: `meters`, `+Z front, +Y up (glTF 2.0 standard)`
- **Pivot / Origin**: `bottom-center of foundation at ground plane (y=0)`
- **LOD Chain**: LOD0 (full detail), LOD1 (45% triangles), LOD2 (20% skyline proxy)
- **Collision**: oriented box or convex hull in moduleColliders/prefabs
