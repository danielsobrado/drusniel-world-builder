# WSC contact gates owed by PR 5 and PR 6 (2026-11-26)

Captured with `node scripts/run-wsc-contact-gaps-qa.mjs` (shared frozen-server harness,
`scripts/lib/wsc-capture.mjs`; hardware WebGPU, RTX 4080) from a clean export of `main`,
so other sessions' uncommitted edits in the shared checkout could not leak into the frames.

| View | What it gates |
|---|---|
| `B02-top-notrees` | PR 6: canopy floor straight down from 34 m with trees hidden, so every trunk/bush footprint is visible in D08 contact and D10 litter |
| `B02-slope-rock`, `B15-slope-rock` | PR 5: the steepest-seated boulder within 90 m, seen along the contour, so a lifted downhill rim or an uphill gap would read in profile |

[contact-gaps-contact-sheet.jpg](contact-gaps-contact-sheet.jpg) rows: one per view; columns D00, D08, D10, D11.

## Defects found and fixed

1. **Every footprint was the same rounded triangle** (top-down D00 and D08). The shared outline
   was one 3rd harmonic, so all trunk/bush patches were a single polygon at different
   rotations: stamps, the `DEF-09` problem in another shape. The outline is now a per-placement
   mix of the 1st, 2nd, 3rd and 5th harmonics with hashed amplitudes and phases
   (`groundContact/ecologicalFootprint.js`, ±0.34 at most), still shared by the grass clearing.
   Before/after: [footprints-before-after.jpg](footprints-before-after.jpg).
2. **Black disc under stump-like flora** (B15). `addBlob` wound both cap fans inward; trunk-kind
   flora (coppice stool, hawthorn stump) use the FrontSide deadwood material, so the top cap was
   culled and the inverted bottom cap showed as a hard black polygon. Every root collar is a blob,
   so DoubleSide plants also had bent normals on their end rings. Fixed in
   `flora/floraMeshPrimitives.js`; `tests/floraMeshWinding.test.js` fails on the old winding.
3. **Ground-cover plants rendered near-black** (wood sorrel, B15). A 15 cm mat was shaded as a
   shrub crown: leaves near the bounding-box centre took the 0.45 interior visibility on colour,
   AO and fill, and the crown puff normal pointed its lower leaves at the ground. Both now scale
   with plant height (`crownInteriorFloor` in `AuthoredFoliageMaterial.js`): none below 15 cm, the
   old 0.45 floor from 50 cm, so shrubs are unchanged.
   Before/after: [flora-before-after.jpg](flora-before-after.jpg).

4. **Straight seams at every chunk edge in the forest floor** (top-down D00 and D10). The
   per-chunk forest-floor texture (canopy, contact shade, litter) stored texel centres half a
   texel in from the chunk edge and was sampled with clamp-to-edge, so the last half-metre on
   each side held its own edge texel and neighbours never met at a shared value: the ground
   stepped by a whole texel's gradient at every edge, sharp where the 1 m litter islands are.
   Proven with an analytic world-space field written into every chunk, which still rendered
   seamed. The texels are now edge-aligned (`forestFloorTexelMeters`, `forestFloorUv` in
   `forestFloorTexture.js`): texel 0 and 127 lie on the chunk edges, so neighbours hold the same
   border value; painters, the terrain material, the diagnostics and the CPU bake read follow.
   `tests/contactShade.test.js` now requires a straddling patch to paint equal values on both
   sides of the border (the old test only bounded the step by one texel's gradient, which is
   exactly the seam).

5. **The same step in the terrain's baked low-frequency surface** (D00 and unlit D01; the tile
   texture D03 was clean). The material bake also centred its texels and read only its own
   chunk's cells. Its texels are now edge-aligned too, and the bake source carries a two-cell
   border of the neighbouring pages' tiles, surface mask and snow cover, plus their heights
   (`TerrainMaterialBakeSourcePad.js`), so both sides bake identical values on a shared edge.
   The runtime already bakes only once the water halo's pages (4 cells) are resident, so the
   border always comes from real neighbours; a page captured without them clamps cells and
   continues heights quadratically. Padding costs 0.14 ms per bake capture (64-cell chunk).
   `test/terrain-material-bake-cpu.test.js` bakes two neighbouring pages and requires every
   channel to match texel for texel along their edge; the WSC CPU evaluator samples the bake
   with the same edge-aligned kernel (`bilinearTexelCoords(..., edgeAligned)`).

6. **And in the surface mask** (path, grass coverage, water; still there with every vegetation
   layer hidden, so in the terrain material itself). Its texels are cell centres, so a
   linear read clamped the last half cell at each edge. The GPU now reads a padded copy with
   one border cell per side, written by the mask builder from the tile halo it already
   evaluates, so it equals the neighbour's own edge cell exactly (`SurfaceMaskTexture.js`;
   terrain, water, grass, flowers and diagnostics remap through `surfaceMaskTextureUv`). At the
   probe columns the rows now run 104, 102, 99 across the edge instead of 97, 116.
   Before/after of the edge (top row before, bottom after): [seams-before-after.jpg](seams-before-after.jpg).

## Passed

- Boulders on the steepest nearby slopes (B02 river bank, B15 woodland edge) sit embedded with a
  soil collar and grass round the foot: no floating downhill rim and no uphill gap.

## Known residuals

- **Readiness never holds 60 consecutive ready frames** on this machine while other sessions'
  browsers share the GPU; the harness now cuts to the pose anyway and checks readiness and WSC
  validity itself (`settlePose`), which is what these captures used.
