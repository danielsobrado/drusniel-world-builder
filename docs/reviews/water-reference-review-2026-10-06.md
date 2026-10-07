# River and waterfall comparison with grass-test

The reference is the user's `F:/Development/grass-test`. This review prioritizes
rivers, banks and waterfalls. It compares the local source and existing reference
captures, then renders this project's production material over a fixed channel.
The fixed scene isolates water appearance; it does not establish full landscape
parity with the reference.

## Changes implemented

| Gap | Result |
| --- | --- |
| River ripples drove reflections, while unrelated FBM drove refraction. | Refraction now uses the same ripple normal, projected into camera axes. The existing foreground-depth rejection still prevents refracting objects in front of water. |
| Displaced river sheets still shaded as level water. | The river basis follows the rendered surface slope, including waterfall faces. A defined direction handles still water without normalizing a zero vector. |
| Foam color was blended into translucent water and then made transparent again with the water. | Foam composites as its own surface layer within the existing draw. Bank foam remains readable in shallow water and medium quality. |
| Contact foam formed uniform white borders around rocks. | The existing river noise breaks up the contact band without another texture lookup. |
| Fall strands and broad sheets shared one scrolling sample. | Two layers move at different speeds. A varying veil replaces even face whitening; derivative filtering softens subpixel strand edges. |
| Plunge foam used the strand texture's broad coverage channel, producing large solid patches. | Two scales of the shared river noise create fine churn that dissipates downstream. Aerated water uses the reference's paler foam tint. |
| Local sea reflection directions ignored the existing wave normal. | Reflection lookup follows the same sea normal already used by Fresnel. |

The fall treatment adds two texture fetches to foam-enabled materials. It reuses
existing textures and geometry and introduces no scene capture, draw call,
per-frame CPU query, streaming field, or residency expansion. Low water quality
still omits these effects. Terrain generation, river geography, persistence,
Azgaar IDs and collision are unchanged.

## Highest-value remaining opportunities

1. **Wet riverbank rocks and splash zones.** `rockWeathering.js` still places its
   wet band against sea level. Grass-test also considers the local river surface.
   Carry the canonical local water height and bank/splash influence in prepared
   rock instance data, then darken and smooth the rock material near that height.
   Avoid querying water per rock every frame. This should be the next bank pass.
2. **Flow detail around bends and down tall falls.** Grass-test's ribbon carries
   across-course distance, along-surface distance and travel time. This project's
   field only carries local direction, fall and plunge weights. Add derived,
   seam-tested course coordinates if long continuous streaks and accelerating
   waterfall strands are needed. Rotating world coordinates around each local
   flow direction is not an equivalent replacement at bends or origin wraps.
3. **Narrow channels and steep lips.** The current water sheet shares the terrain
   grid. The reference has a course-shaped ribbon and surface normals. Evaluate
   bounded near-view refinement derived from the canonical river profile, with
   stitched chunk edges, before increasing terrain resolution or adding separate
   ad hoc fall meshes. Keep collision and water queries authoritative.
4. **Water interaction.** The reference disturbs its surface normals with footstep
   impulses. The current surface has rain rings but no equivalent player wake.
   A fixed-size impulse buffer driven by existing water events would add feedback
   without changing geography or rebuilding meshes.
5. **Lake reflection eligibility.** The inland reflection branch currently passes
   zero planar weight for lakes as well as rivers. Distinguish still inland water
   from flowing river faces before enabling the existing planar capture there.

The first three items affect river scenery more than another global color change.
The project already ports the reference's dark teal palette, detail texture,
Fresnel, sun glint, riverbank stones, waterfall mist and depth absorption.

## Visual and functional validation

`npm run qa:environment:parity` now includes a deterministic river fixture on
WebGPU and WebGL: medium/high quality, sloping water, shallow banks, protruding
rocks, a fall, animation and a 4096 m origin rebase. A separate eight-case render
compares the foam compositor with ordinary two-layer blending, including dry,
transparent and opaque limits.

- All 46 pixel checks passed on the NVIDIA hardware adapter.
- The foam comparison was pixel-identical on both backends.
- River rebase mean channel error was below 0.003/255 on both backends.
- 118 focused water/river tests passed.
- Lint and the production build passed.
- Full suite: 3197 passed, 20 failed. All 20 failures reproduced with the old
  water modules substituted into the same engine. They are construction test
  fixtures, meadow interaction defaults and a simulation migration regression;
  no failures were attributed to this water pass.
- The dry/swim/dive/surface/dry acceptance route passed all gates, with zero
  browser/GPU validation errors, frame p95 8.2 ms and three hitches in 8768 frames.
  That route discovers ocean water in the default world; it does not replace the
  dedicated river appearance fixture.

Local artifacts (under ignored `tmp/water-improvements/`):

- [Before waterfall](../../tmp/water-improvements/before/webgpu-river-fall.png)
- [After waterfall](../../tmp/water-improvements/after/webgpu-river-fall.png)
- [Before channel](../../tmp/water-improvements/before/webgpu-river-high.png)
- [After channel](../../tmp/water-improvements/after/webgpu-river-high.png)
- [Pixel-check report](../../tmp/water-improvements/after/report.json)
- [Water acceptance](../../tmp/water-improvements/acceptance.json)

## Movement comparison

The initial pair produced 146.24/115.36 FPS (before/after), p95 9.1/13.6 ms and
0/4 hitches. Those results prompted repeated measurements rather than a claim
of unchanged performance.

During the session, the water work was committed as `aff66f4`, followed by a
separate performance commit `c0d8435`. The repeated comparison therefore keeps
the current engine in both servers and substitutes only the four changed water
modules from `6be59a1`. No working files are rolled back. Both servers use the
same assets and configuration; browser measurements run sequentially under the
shared hardware QA lock.

| Isolated repeat | Baseline FPS / p95 | Updated FPS / p95 | Hitches, baseline / updated |
| --- | --- | --- | --- |
| 1 | 111.66 / 15.31 ms | 118.18 / 12.1 ms | 2 / 1 |
| 2 | 115.44 / 13.3 ms | 130.38 / 10.6 ms | 1 / 0 |

Every repeat settled and recorded zero browser errors. Water upload bytes
(354900), wet slots (14), refractive slots (4) and page commits (7) matched.
These repeats did not reproduce the initial slowdown; they do not establish
a statistically significant speed improvement.

The subsequent sea, beach and lake work is recorded in
[water-body-reference-review-2026-10-07.md](water-body-reference-review-2026-10-07.md).
