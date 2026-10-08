# Workshop visual polish

This pass develops the freeform workshop's stylized medieval finish: readable
silhouettes, dressed edges, restrained surface variation and architectural craft.
It builds on [the procedural shape feature](workshop-procedural-shapes-2026-10-08.md).
The local [before-and-after gallery](../tmp/workshop-shapes-qa/comparison.html)
contains all ten presets and three close-range captures. Its previous-version
toggle uses the preserved `tmp/workshop-polish-before` capture.

## Visible changes

- Masonry, opening trim, planks and timber framing receive shallow geometric
  bevels. Stone colors vary within a coherent warm palette, and the surfaces
  carry neutral micro-normal and roughness maps. Wall face UVs follow the host's
  distance/height coordinates when it moves or rotates.
- Slate tiles have clipped corners, overlapping lower edges and coherent tint
  variation. Gable roofs receive segmented curved ridge caps; cone, bell and
  spire roofs receive a small metal finial. Upward winding is maintained even
  when tiles fold around rounded gable ends.
- Door inserts have visible plank joints, iron straps, rivets and a ring pull.
  Glass has a quieter blue-gray tint and a restrained warm emissive contribution.
- Eligible gable/hip buildings receive an open-flue chimney. Window boxes have
  curved timber boards, soil, folded leaves and seeded cream/rose/red blossoms.
  Boards and planting use the same host surface, so boxes remain attached around
  curved corners. Covered windows and low windows omit the corresponding detail.
- The workshop stage has a calmer meadow palette, rounder background hills,
  more refined tree silhouettes, a warmer ground bounce and balanced key/fill
  lighting. Sky texture pixels are encoded correctly for their sRGB texture.

**Chimney & planted window boxes** in the selected building's controls enables or
disables that dressing. The preference participates in normal undo, redo and
bake persistence. Roof caps, finials and door hardware are part of the geometry
finish; flower planting, bevels, hardware and roof tiles use the detailed tier.

## Implementation and ownership

`ShapeCraftDetails` resolves deterministic decoration records with derivation
keys and `crafted-building-details` provenance. Canonical records store `craft`
and optional suppression keys, never generated decoration records or geometry.
Chimney placement is checked against the host outline; fully buried chimney tops
are masked by neighboring roofs. Existing sampled roof contact behavior remains.

The existing product domains own the new geometry. Toggling craft changes the
roof and facade products while preserving walls, ivy and neighboring buildings.
Roof edits preserve a plain facade's window-box product. All repeated craft,
foliage and hardware enter material buffers, without individual scene objects.
Metal areas are included in the published semantic material regions.

`ShapeSurfaceMaterials` caches at most 32 immutable CPU pixel buffers. Each
product owns independent GPU texture objects, and maps are created only for
materials retained by its requested domain. Normal/roughness maps use linear
color space, mipmaps and repeat wrapping. Explicit material presets continue to
override the generated finish. `disposeUnusedModelMaterials` releases orphaned
maps once while preserving maps still referenced by retained material clones.

## Validation

- `npm test`: **3,357 passed** in the shared workspace.
- `npm run qa:workshop:shapes`: **62 passed**, including eleven new craft,
  placement, UV, winding, domain-reuse and texture-ownership regressions.
- `npm run qa:workshop:shapes:browser`: **23 interaction checks passed**;
  ten preset captures and three detail captures; no page or console errors.
  The actual renderer used hardware WebGPU on NVIDIA Lovelace.
- `node scripts/run-workshop-qa.mjs --runs 1 --headed`: **27 assertions passed**
  across the existing planar/radial editing, assemblies, imported materials,
  skeleton roofs, bake and renderer disposal paths.
- `npm run lint`, `npm run build` and `git diff --check`: passed. The build
  retains the existing large-chunk advisory.

### Geometry cost

These are source vertices and editable preview batches at the captured detail
setting. Preview products remain separate by consumer domain. Baked products
remain material-batched; the shape tests check a maximum of eight material parts
for each single-building preset.

| Preset | Source vertices before | Source vertices after | Preview batches before / after |
| --- | ---: | ---: | ---: |
| Rounded cottage | 61,548 | 83,682 | 9 / 11 |
| Bell turret | 126,726 | 197,112 | 8 / 12 |
| Garden pavilion | 44,958 | 55,566 | 6 / 6 |
| Cottage and turret | 114,102 | 167,034 | 17 / 22 |
| Terraced cottage | 65,004 | 87,138 | 12 / 14 |
| Garden bridge | 4,968 | 4,968 | 1 / 1 |
| Curved courtyard | 57,252 | 89,724 | 6 / 6 |
| Timber cottage | 82,986 | 112,446 | 9 / 11 |
| Garden gateway | 51,648 | 80,520 | 4 / 4 |
| Timber pavilion | 62,601 | 79,548 | 11 / 13 |

The extra vertices buy actual bevels, tile lips and architectural dressing;
they do not establish a frame-time improvement. This pass changes workshop
presentation and shape products, with no terrain, streaming or residency edits.
The player movement matrix and GTAO A/B performance benchmark were not rerun.
The earlier GTAO relative-gate limitation remains documented in the feature
report, alongside the conservative player collision and navigation limitations.
The captures establish the visual result for these presets and viewpoints;
they are not a general release-quality certification for every possible shape.
