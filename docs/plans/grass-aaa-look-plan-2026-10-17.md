# Grass AAA look and feel: random biome review and plan, October 17, 2026

Status: **review and implementation plan. This task makes no production changes.**

[Screenshot archive and capture notes](../qa/grass-audit-2026-10-17/README.md) ·
[Contact sheet](../qa/grass-audit-2026-10-17/contact-sheet.jpg)

The meadow already reads well at eye level in lush grassland. It falls short of a
AAA look in four ways:

- Seen up close, a blade looks like a flat paper strip.
- Under a dense stand the ground stays bright, so the grass seems to float on a
  green carpet.
- Between 15 and 60 m the field breaks into stepped, combed rows, and in sparse
  habitats the ground changes value in a ring around the player.
- Beyond the blade radius the grass stops existing as a material.

On top of that, most biomes look like the same lawn with a different tint.

The plan fixes the shading, depth and continuity of what is already drawn
(W1–W4) before it adds species or new layers (W5–W7). Every stage has to hold
the existing performance gates.

This plan complements two earlier ones. The
[sparse-grass plan](sparse-grass-look-and-feel-plan-2026-10-16.md) (G0–G4) owns
exposed ground in short, sparse habitats. Q1 of the
[AAA look plan](aaa-look-and-feel-plan-2026-10-16.md) owns the cross-band scale
rules. Where this plan touches those areas, it refers to them rather than
restating them.

---

## 1. Method and limits

**Runtime**
- Frozen snapshot of `main` at `68afbd1e`, served by
  `scripts/serve-world-visual-snapshot.mjs`.
- Headed Windows Chromium with hardware WebGPU, 1600 × 900, DPR 1.
- Highfield preset at paused noon, manual weather off, TRAA on (production
  defaults).

**Sampling**
- LCG seed `20261017`, using the procedural generator (seed 918273).
- One spot per land biome, IDs 1–12. A spot was accepted only if a 5 × 5 probe
  at 6 m spacing returned the same biome, which keeps shots off biome seams.
- 68,514 candidates were drawn. Each accepted spot also drew a random yaw.
- Three of those spots fell on dirt roads (IDs 6, 9 and 12), because roads share
  the biome tile. Seed `4242` added off-road supplements for IDs 4, 6, 9 and 12.

**Framings per spot**

| Tag | Camera | Purpose |
| --- | --- | --- |
| `eye` | Player, 1.7 m, pitch −0.08, FOV 68 | What a player sees |
| `eye-rev` | Same, yaw + π | The other lighting side; usually the backlit or frontlit pair |
| `down` | Player, pitch −0.62 | Coverage, the ground under blades, contact |
| `low` | Fly, 0.45 m, pitch +0.03, FOV 55 | Hero close-up: blade shape and material |
| `aerial` | Fly, 45 m, pitch −0.42, FOV 60 | Far field, band transitions, colour continuity |

**Results**
- 80 frames in total: 60 primary and 20 supplementary.
- Every frame matched its expected biome ID.
- Zero browser errors were recorded.

**Limits**
- These are stills. Wind, gust sheen, trample and temporal shimmer are inferred,
  not observed.
- Only one sun angle was used, a high noon sun. That understates transmission,
  which needs a low sun behind the grass.
- No performance numbers were taken. The cost notes come from
  `docs/grass-performance-results-2026-10-16.md` and the code.

## 2. What already works

- **Dense temperate stands read as grass at eye level.** In `b04-eye` and
  `b08-low` the tufts lean together, the tip gradient is visible, and the wind
  lean gives the field one direction.
- **The architecture has room to grow.**
  - Everything draws as one batch per band.
  - Per-biome looks are encoded as `shape + palette + growth` codes, with spare
    slots: 8 palettes and 16 growth profiles allowed, 7 and 13 in use.
  - Blade selection uses a stable R2 prefix across LOD bands.
  - Compaction runs in workers.

  None of the work below needs a new architecture.
- **Savanna has a believable straw and green mix** at eye level (`b03-eye-rev`).
- **The bend-angle wind keeps blade length**, so a strong gust does not stretch
  the blades.

## 3. Findings, ranked by visual impact

Each finding names the frames that show it. Paths are under
`docs/qa/grass-audit-2026-10-17/`.

### F1 — A blade reads as a flat, matte paper strip (high)
**Evidence:** `b03-low`, `b04-low`, `b05-low`, `b08-low`. The crop `zoom-savanna-low.jpg` shows it best.

- Each blade is close to a single flat tone across its width. There is no midrib,
  no edge darkening and no rounding.
- The only normal shaping is a ±0.18 sideways tilt applied toward the tip
  (`meadowBladeMaterial.js:56-65`). At the root a blade has the same normal as the
  ground.
- The material is Lambert, so there is no specular highlight and no sheen along
  the blade. AAA grass sells its form with a soft anisotropic highlight running
  down the leaf.
- Transmission is `pow(dot(-V,L), 2.2)` (`meadowBladeMaterial.js:69`), and
  `translucency.power` 6.4 in the config is ignored. At noon almost nothing glows.
  When it does glow, the broad 2.2 lobe flattens the field instead of rimming the
  blades.
- The root-to-tip gradient (`pow(h, 2.35)`) is there but weak at hero distance.
  The savanna close-up is one olive value from root to tip.

### F2 — The stand has no interior and the ground under it is bright (high)
**Evidence:** `b04-down`, `b05-down`, `b08-down`, `b03-down`, `zoom-grassland-down.jpg`.

- Seen from above, a dense meadow is mostly bright, flat green ground with short
  stubs on top. Real dense grass is dark between the blades and bright only on
  the upper, lit layer.
- Blades do not cast shadows (`MeadowBandBatch.js:53`). The only occlusion is the
  `rootBrightness` 0.6 gradient on each blade.
- The terrain under a stand is not darkened by how dense the stand is.
  `MeadowGroundShading` tints the ground with the root pigment but adds no
  occlusion.
- As a result, the low shots show a pale ground plane between the stems
  (`b03-low`), and grass seems to sit on a carpet rather than grow out of soil.
- This is the single largest cause of the "stylised lawn" look.

**Update, October 19, 2026: canopy integration** (`docs/qa/canopy-integration-2026-10-19/`).
Compared with Tiny Glade, our stems read as dark spikes stuck into a lighter
floor, worst in taiga. The fix looks at how the stand reads from a grazing
view, not top-down. That leaves this finding's top-down concern intact.

- **Canopy colour.** `meadow/meadowCanopy.js` defines one canopy colour per
  biome: root to tip at `canopyTipMix`. It is stored as row 4 of the ground
  palette map.
- **Ground under the stand.** It leans to the canopy colour by
  `canopyStrength × density × grazing`. From above it keeps the root, litter
  and occlusion value. The far bake uses the grazing value (`palette.far`).
- **Stem feet.** They fade to that same view-dependent value.
- **Melt.** From `meltStart` to `meltEnd` (12–35 m), tuft value, blade value,
  variation and contact shade melt to 1. The gradient flattens toward the
  canopy colour by `meltFlatten` (0.25; 0.5 lost the grassland's swept
  depth). Far cards are fully melted, so the handoff matches.
- **Coverage.** `lodWidenMax` goes from 1.35 to 2. Taiga, savanna and wetland
  widths go to 0.05, and taiga density to 0.8.
- **Not done.** Blade normals stay world-up, because stems carry no terrain
  normal and there is no vertex-buffer slot left to add one.
- **Performance.** Neutral on high-grass chunk-cross: 38.7 → 38.8 FPS, 78 → 74
  hitches, one run each.

### F3 — From 15 to 60 m the field breaks into stepped, combed rows (high)
**Evidence:** `b08-eye` (crop `zoom-temperate-rainforest-mid.jpg`), `b03-eye` (crop `zoom-savanna-far.jpg`), `b04-eye-rev`.

- Horizontal striations and staircase rows appear just where the blades thin
  out (the low and very-low bands, 14–50 m) and the card layer takes over.
- In savanna, pale blotches the colour of bleached soil show through in the same
  band. They read as snow or mottling, not as dry grass.
- Likely contributors, which G0-style isolation must confirm:
  1. Low-band survivors widening up to 2×. At grazing angles this produces wide,
     aligned wedges.
  2. Card strips facing mostly one way and sitting at a regular 1.3 cards/m.
  3. The ground-detail streaks running in two directions, and the
     `groundCover` strand texture, both reading as rows at grazing angles.
  4. TRAA resolving sub-pixel blades into horizontal smears.
- Q1 of the AAA plan names repeated directional rows. This review confirms them
  in three more biomes and at the mid-field distance.

### F3b — The ground under sparse grass changes value at 12–30 m (high)
**Evidence:** `b09s-eye`, `b09s-eye-rev`, `b09s-low`, `b07-eye`, `b10-eye`.

- In sparse habitats the ground near the camera is a dark brown-olive soil. At
  roughly 12–30 m it changes to a pale, near-white grey with a visible
  boundary.
- At eye level this reads as a ring around the player, or as a snow line that
  moves with the camera. It does not read as ecology.
- The band matches the ground-detail fade (14–34 m) and the near material blend
  that `meadowGroundDetail` and `terrainMaterial.js:189-300` apply. The
  near-only darkening (root pigment, soil pockets, moss) fades out before the
  far ground-cover tint has the same mean value.
- Dense stands hide the band. Sparse stands, which show the most ground, expose
  it.
- This is a continuity bug, so it comes before any sparse-ground content work
  (sparse-plan G1). Fix it in W3.6.

### F4 — Beyond the blade radius, grass stops existing (high)
**Evidence:** every `aerial` frame, `b04-eye` horizon, `zoom-grassland-far.jpg`.

- At 45 m altitude the whole field is flat terrain with brush-stroke texture.
  Nothing reads as a height field of grass: no value change with view angle, no
  wind waves, no soft edge where grass meets path or forest.
- At eye level, the far crest of a grassy hill is bald. No grass silhouette
  breaks the skyline.
- AAA open worlds handle this with three things:
  1. A grass-aware terrain BRDF that darkens and shifts hue at grazing angles,
     the way a real canopy shows tip colour edge-on and soil colour from above.
  2. Wind sheen that continues past the blades.
  3. Sparse horizon silhouette cards.

  The current far field has none of these.

### F5 — Dense stands are monotone in species, colour and height (medium-high)
**Evidence:** `b04-eye`, `b08-eye-rev`, `b05-eye`, supplement `b04`.

- Within one biome every blade is the same species. Variation comes only from
  value jitter and cool/warm patch tint.
- There are no:
  - seed heads or panicles, which give a meadow its fuzzy top line;
  - dead thatch stems mixed into green stands;
  - forbs or broadleaf herbs mixed with the grass.
- Flower cards are few and small, and they do not cluster.
- Height drifts exist (the tuft field), but they are too gentle to break the flat
  top plane of the stand.

### F6 — Biome identity is weak or wrong (medium-high)
**Evidence:** `b07-*`, `b09-eye-rev`, `b10-*`, `b12-*`, `b02-*`.

| Biome | What the frames show | What reads as right |
| --- | --- | --- |
| Hot desert (1) | Bare sand and cracked plates, no plants | Mostly bare is correct; a rare dry tuft or bush near drainage lines |
| Cold desert (2) | Bare sand, the same as hot desert | Sagebrush and bunchgrass steppe: grey-green and straw clumps 0.3–0.6 m tall with wide gaps |
| Savanna (3) | Tall straw grass; abrupt green and straw blocks | Seed-headed tall grass, green flush under tree canopies, burnt or short patches |
| Grassland (4) | Green lawn-like meadow | Mixed meadow: grass plus seed heads, forb clusters and occasional thatch |
| Tropical seasonal (5) | Short broadleaf lawn under trees | Taller mixed grass in clearings, leaf litter under canopies |
| Tropical rainforest (7) | A few long ribbon blades on dark bare soil | Not grass at all: ferns, broadleaf herbs, litter and roots; grass only in clearings |
| Temperate rainforest (8) | Dense green meadow | Moss, ferns, sorrel and shade grass, with a wetter, darker floor |
| Taiga (9) | A carpet of dark, uniform needle-like spikes | Moss carpet, heather and berry cushions, sparse sedge; this is sparse-plan territory |
| Tundra (10) | Strips of olive spikes on pink-white ground | Lichen, cushion plants, cotton grass, sedge tussocks; sparse-plan G3 |
| Wetland (12) | An ordinary tall lawn, beside a road (`b12`) and beside pools (`b12s`); grass runs straight to a sandy bank with no reeds | Reeds, rushes, sedges and cattails, wet dark ground, near-water zonation |

Tropical rainforest is the worst case. Its broadleaf silhouette curls into thick
ribbon arcs at close range (`b07-low`), which read as plastic strips.

### F7 — Edges are cut, not grown (medium)
**Evidence:** `b06-*`, `b09-eye`, `b09-down`, `b12-eye`, `b12-down`.

- Where grass meets a path, a full-height stand stops in a vertical wall at the
  path mask. Real verges:
  - shorten and flatten over 0.5–1.5 m;
  - turn straw-coloured where trampled;
  - mix in ruderal weeds;
  - leave a grassy centre strip between wheel ruts.
- The straw-tip verge tint exists (`meadowPigment`), but a height falloff does not.
- Tree bases, rock bases and shorelines show the same hard cut.

### F8 — Incidental defects seen while reviewing (not grass, file separately)

These are noted here so they are not mistaken for grass problems:

- **Black, unlit tree parts near the camera** (`b05-eye`, `b05-low`, `b06s-eye`).
  - In `b05` a thin black triangle floats beside an oak, a few metres off the
    ground.
  - In `b06s` the near trunk base is a large near-black cone.
  - Both look like untextured or unlit root and trunk geometry at close range.
- **A black, unlit boulder** in `b06s-eye-rev`.
- **Dark blurred blob in `down` views** (`b02-down`, `b12-down`). The player's
  contact shadow is drawn while the body is hidden in capture mode.
- **White low-poly shard objects** (`b09-down`, `b10-eye`, `b10-low`). An
  untextured or mis-skinned small prop, possibly a flower or pebble variant.
- **Bright white patch region** in `b06-aerial` and `b09-aerial`, beside water.
  Possibly salt or sand material weights, or snow. Its biome needs checking.
- **The audit sampler can land on roads.** The next capture should reject spots
  where the path mask is above zero.

## 4. Target look: principles, not references to copy

Grass in Ghost of Tsushima, Horizon Forbidden West and Breath of the Wild reads
well for a handful of shared reasons. The plan is built around these:

1. **Value structure.** Dense stands are dark inside and bright on top. The
   bright layer is a thin skin that moves with the wind.
2. **Light through and along the blade.** Backlight rims the tips. A soft
   anisotropic highlight runs down each blade. Grazing views are brighter and
   warmer than top-down views.
3. **Species mix and a broken top line.** Seed heads, thatch and forbs break the
   flat plane of the stand. Colour varies in clusters, not per-blade noise.
4. **Continuity to the horizon.** The same average colour, value and wind motion
   carry from blades to cards to terrain. Every distance band shows the same
   gust as it passes.
5. **Ecological edges.** Grass responds to paths, shade, water and rock with
   height, colour and species changes over metres, not at a mask line.
6. **Biome-first silhouettes.** A screenshot should name its biome from the
   ground layer alone.

## 5. Workstreams

### Summary

| ID | Workstream | Priority | Scope | Main files |
| --- | --- | --- | --- | --- |
| W0 | Capture and isolation harness | P0 | S | `scripts/`, `WorldVisualQa` |
| W1 | Blade material: form, sheen, transmission | P0 | M | `meadowBladeMaterial.js`, `meadowPigment.js` |
| W2 | Canopy depth and ground occlusion | P0 | M | `meadowPigment.js`, `MeadowGroundShading.js`, terrain material |
| W3 | Mid-field continuity, 14–60 m | P1 | M | `meadowBladeShape.js`, `meadowCardMaterial.js`, `meadowGroundDetail.js` |
| W4 | Far-field grass BRDF and horizon | P1 | M–L | `terrainMaterial.js`, `MeadowGroundShading.js`, card layer |
| W5 | Species mix inside the batch | P1 | L | growth profiles, `meadowGrassShapes.js`, card atlas |
| W6 | Biome ground-layer identity | P2 | L | config growth/palette tables, scatter, sparse-plan G3 |
| W7 | Edges and verges | P2 | M | `MeadowGroundSample.js`, `MeadowPathSampler.js`, growth nodes |
| W8 | Motion and lighting acceptance | P1, alongside | M | QA scripts, wind uniforms |

### W0 — Capture and isolation harness (P0, S)

1. Promote `tmp/capture-grass-audit-2026-10-17.mjs` into
   `scripts/run-grass-look-qa.mjs`. Add:
   - rejection of spots on paths (via `MeadowPathSampler` or the generator's path
     mask);
   - an `--only` biome list;
   - a manifest replay mode, so a later run uses exactly these poses.
2. Add lighting variants to every pose: `noon` (today), `low-back` (sun at 12–18°
   behind the camera's view axis), `low-front`, and `overcast`. F1 and W1 cannot
   be judged at noon alone.
3. Add isolation toggles through `__worldVisualQa` that never persist:
   - grass hidden
   - cards only
   - blades only
   - ground detail off
   - TRAA off
   - frozen wind
   - albedo-only
   - normal view

   These are the G0 diagnostics from the sparse plan, extended to dense stands.
4. Add a 3-second motion clip per pose: 30 frames to a PNG sequence, then a
   GIF/MP4 contact. W3 and W8 are motion problems.
5. Add simple metrics to the report, all computed on masked crops that exclude
   sky, trees and water:
   - luminance histogram of the near grass region (for F2, the dark-interior
     share);
   - row-energy metric: the horizontal-vs-vertical gradient ratio in the 15–60 m
     image band (for F3);
   - near/far mean-colour delta across the band seam (for F4).

**Exit:** the 80-frame review can be rerun from one command, both before and
after any later stage, with isolated passes.

### W1 — Blade material: form, sheen, transmission (P0, M)

All changes are ALU-only in the existing blade material. They add no samplers,
no vertex attributes (mind the 8-attribute ceiling) and at most one packed
`vec4` varying (mind the 16-varying limit).

1. **Rounded cross-section.** Replace the weak side tilt with a cylindrical fake
   normal that bends across the full width at every height. Use
   `side × curvature`, with curvature around 0.45–0.6, falling to around 0.25 at
   the tip as the blade thins. Keep the root normal blended toward terrain-up
   over the first 10% only, so roots still match the ground.
2. **Midrib and edges.** Use a cheap value profile across `bladeSide`: a slightly
   darker groove line at side 0 for broadleaf and reed shapes, and slightly
   lighter edges for slender shapes. Amplitude ±6–8% value. It fades with
   distance, ending by about 14 m.
3. **Anisotropic sheen.** Lambert has no specular, so add an emissive sheen term:
   a Kajiya-Kay-style highlight using the blade tangent (root→tip direction),
   `pow(1 − (T·H)², n)` with n around 24–48. Weight it by sun visibility and by
   height (≥ 0.3), keep it desaturated toward sky colour, and cap it near 0.12.
   This term gives the "silky meadow" look in a low sun.
   - Alternative if the emissive route fights tone mapping: move the meadow to
     `MeshStandardNodeMaterial` with roughness around 0.55 and an anisotropy node.
     Measure first; grass is fill-bound.
4. **Transmission.**
   - Use `translucency.power` from config (raise the default to about 4–6)
     instead of the hard-coded 2.2.
   - Add a wrap/forward-scatter term weighted by thinness (`1 − widthFactor`), so
     thin tips glow more than broad leaves.
   - Tint transmission toward a warmer, more saturated version of the tip colour.
     Real backlit grass shifts to yellow-green.
5. **Gradient and tip treatment.**
   - Make `gradientPower` biome-specific (savanna about 1.6, temperate 2.35).
   - Add a narrow dry tip burn in the top 8–12% of dry and savanna palettes.
   - Add per-tuft hue drift in a perceptual space (OKLab a/b ±0.015), not just a
     value change. This ties into W5's colour clusters.
6. **Broadleaf silhouette (rainforest and seasonal).** Clamp the forward arc and
   resting bend for broadleaf so it never curls past about 70°. Narrow the tip to
   0.35 width. That removes the ribbon arcs in `b07-low`.

**Acceptance:**
- At `low` and `eye` in noon and low-back lighting, blades show a readable light
  and dark side, a highlight under low sun, and rimmed tips under backlight.
- No blade is a single flat tone at hero distance.
- The p95 frame delta on the grassland route is ≤ 3% (W1 is per-fragment on a
  fill-bound pass, so measure the high band at 1600 × 900).

### W2 — Canopy depth and ground occlusion (P0, M)

This is the most visible single improvement. The goal is a stand that is dark
inside, sits in soil, and is bright only on its top skin.

1. **Canopy-relative height AO on blades.**
   - Compute a canopy depth term: `canopyTop` from the local growth profile
     (patch height × tuft height), and occlusion from how far below that top a
     fragment sits, scaled by local accepted density.
   - Isolated stems keep `rootLift`. Dense interiors fall to about 0.35–0.45 of
     the lit value near the root.
   - This replaces the single fixed `rootBrightness` gradient. It uses data the
     shader already has (density, tuft membership, height).
2. **Ground occlusion under stands.**
   - In `MeadowGroundShading`, darken and cool the terrain by the same expected
     coverage field the sampler uses to accept stems (growth density × patch
     cover × stand density).
   - Target roughly 0.45–0.6 of the lit value under full stands, and none on
     exposed soil.
   - This must match the near blades' root value at the seam, or the grass will
     ring at 50 m.
3. **Sun-direction self-shadow, approximated.**
   - Blades still do not cast shadows.
   - Shift the occlusion term by the sun direction: fragments whose sun ray
     travels through more canopy (low sun elevation × depth below top) darken
     more. This gives the "lit top skin" without shadow maps.
4. **Contact shadows from objects on grass.** Confirm that tree, rock and
   character shadows land on blade tips and ground the same way, since blades
   use `receivedShadowPositionNode`. Check `b05-eye`, where the dapple currently
   lands mainly on the ground.
5. **Experiment, measured, optional:** cast shadows from the high band only
   (≤ 6 m) into cascade 0. Keep it only if the p95 delta is ≤ 2% and it adds
   something W2.3 does not. The shadow cascades are vertex-heavy, which is why
   this is off today.

**Acceptance:**
- `down` frames show dark gaps between blades in dense biomes (W0 histogram:
  ≥ 35% of near-grass pixels below the field's median, up from today's
  baseline).
- No black dots on isolated stems; the sparse plan's G1 contact rule applies.
- The near/far seam delta at 40–55 m does not get worse.

### W3 — Mid-field continuity, 14–60 m (P1, M)

First isolate the cause with W0 toggles, then fix in this order:

1. **Widening.**
   - Cap `lodWidenMax` lower for the low and very-low bands (try 1.4).
   - Make survivors widen along the view-perpendicular axis only, so wedges stop
     aligning into rows at grazing angles.
   - Re-check the sparse plan's note on 2× widening in sparse stands.
2. **Card orientation and placement.**
   - Jitter card yaw across 0–180° per card, with a slight bias across the wind
     axis.
   - Jitter positions off the 1.3 cards/m lattice.
   - Vary card height by the same patch and tuft fields the blades use, so the
     top line continues.
3. **Ground-detail streaks.** Fade the anisotropic streaks by view grazing angle
   as well as distance, since streaks parallel to the view read as rows.
   Randomise the two streak directions per cushion cell.
4. **Fade dither.**
   - The hand-off dither (`meadowFade.js:17`) uses interleaved gradient noise on
     `screenCoordinate` with no frame offset, so its pattern is the same every
     frame.
   - IGN has a strong diagonal and row structure. TRAA cannot average a pattern
     that does not change, so the structure stays on screen.
   - Offset the noise by the TRAA jitter index (the standard `frame × 5.588238`
     IGN offset) and compare row energy with and without the offset.
5. **Band histogram match.** Use W0's crops to tune card value and saturation to
   the blade band average at 12–16 m (the hand-off), and the ground-cover strand
   tint at 30–50 m.
6. **Ground value continuity (F3b).**
   - Measure the mean ground value with grass hidden along a radial line from
     2 m to 80 m in the taiga, tundra and rainforest poses.
   - Make each near-only term (soil pockets, moss, root pigment darkening, litter)
     fade toward its own distance-averaged mean, not toward zero. The far
     ground-cover tint has to carry that same mean.
   - The usual pattern: compute each detail term as `mean + (detail − mean) ×
     fade`, so only the detail contrast fades and the value does not.

**Acceptance (W3.6):** no ring is visible in the radial value profile of the
taiga, tundra or rainforest poses. Along that profile the value changes by
≤ 5% between any two points 5 m apart beyond 8 m.

**Acceptance:**
- The row-energy metric in the 15–60 m band drops by at least 40% on the
  grassland, temperate rainforest and savanna poses.
- No visible seam at the card hand-off in a still or in a 3-second clip.
- Savanna's pale blotches are gone, or are clearly dry grass rather than
  bleached soil.

### W4 — Far-field grass BRDF and horizon (P1, M–L)

1. **Grass-aware terrain shading** (60 m to the fog limit) in the terrain
   material, for terrain where grass coverage is above zero:
   - **View-angle colour.** At grazing views, blend toward the biome's tip colour
     and brighten slightly. At steep views, blend toward root and soil colour and
     darken. Use `1 − |N·V|` with a smooth curve. This gives a far meadow the
     same sheen-and-depth read as the near field.
   - **Backlit lift.** Add a broad forward-scatter on grassy terrain, using the
     same tint as W1.4 but about 30–40% as strong.
   - **Wind sheen.** Run the `GrassGustSheen` wave on terrain over grassy cover,
     at its world frequency, so gusts travel past the blade radius. This is ALU
     only, using the same wind field.
   - **Budget.** This must add no samplers (the terrain is at 16/16). Use the
     existing coverage weights and palette uniforms.
2. **Horizon silhouette.** Continue the card layer, or add a very-low-cost
   silhouette strip, only where a grassy crest meets the sky within about
   300 m, using a depth or slope test against the camera. Start with a measured
   experiment: extend card fade-out from 180 m to 260 m on crests only.
3. **Aerial read.** At 30–60 m altitude the cards should still give the field
   visible texture and colour clusters, not brush strokes. Tune card coverage by
   view pitch, and check `aerial` frames.
4. **Colour continuity check.** The mean far-terrain colour on grass cover should
   be within ΔE ≈ 3 (OKLab) of the near blade band's mean, under the same light.

**Acceptance:**
- Aerial frames show a grassy material with clustered colour and a visible wind
  sheen in clips.
- Eye-level hill crests within 250 m show a soft grass silhouette.
- No added samplers; terrain p95 delta ≤ 2%.

### W5 — Species mix inside the batch (P1, L)

Add variety through the existing look-code system, not through new draws.

1. **Seed heads.** Give a share of stems (5–25% by biome) a panicle tip:
   - a short widened, brighter, desaturated top segment (oat or brome look);
   - or, in the high band only, a 3–4 vertex spray of short side-strands, as
     geometry already in the band mesh.

   Seed-head stems are 15–30% taller than their neighbours. That breaks the flat
   top line, which matters most for F5.
2. **Thatch.** In grassland, savanna and temperate stands, add 5–15% dead stems:
   straw colour, more bend (`baseBend` × 2–3), low stiffness, slightly shorter,
   and clustered by a 1–3 m noise. The `dryColor` field already exists.
3. **Forb clusters.** Lean on the flower system, but cluster the flowers in
   drifts of 1–4 m (meadowTuftField-scale noise) instead of spreading them
   uniformly. Add non-flowering broadleaf herbs (clover, plantain rosettes) as
   ground-level shapes; this is shared with sparse-plan G3.
4. **Colour clusters.** Use per-tuft hue drift (W1.5) plus 2–6 m patches that
   swap between two tip colours per biome, for example a green and a blue-green
   fescue in grassland. These are palette entries, not textures.
5. **Look-code budget.**
   - Today 7 of 8 palettes and 13 of 16 growth profiles are used. Seed head and
     thatch should be variant flags on the stem rank, not new profiles.
   - If they need encoding space, pack them into the existing look code's spare
     bits rather than adding an attribute.

**Acceptance:**
- In `eye` and `low` frames, the top of a grassland or savanna stand has a
  visible broken, fuzzy line.
- Thatch reads as dead grass, not as dirt.
- The draw count is unchanged. The triangle count rises ≤ 10% in the high band.

### W6 — Biome ground-layer identity (P2, L)

Implement the "what reads as right" column of the F6 table, one biome at a time.
Order by visibility (share of land area × how wrong the biome looks today):

1. **Tropical rainforest (7).**
   - Turn meadow density down to clearings only.
   - Add a fern and broadleaf-herb scatter, plus a litter material on the floor.
     The scatter goes through `StylizedVariantResidency` with `tileIds: [7]`;
     do not use `Promise.all`.
   - Check what authored assets already exist in
     `biome-vegetation-variety-plan.md` §2 and §4.2 before authoring anything.
2. **Wetland (12).**
   - Use the reed silhouette for real: taller (1–1.6 m) and more upright, in
     clustered zones near water.
   - Add a short sedge or rush layer elsewhere.
   - Use a wet, darker ground tint.
   - Rely on standing-water decals or the existing wet-surface lighting near
     water edges.
3. **Cold desert (2).** Add sparse bunchgrass clumps (meadow at low density with
   strong tufting) and a sagebrush-type shrub through residency.
4. **Taiga (9) and tundra (10).** Hand over to sparse-plan G1–G3: moss and lichen
   ground, cushions, sedge tussocks. This plan adds only the requirement that
   taiga stops reading as a lawn of uniform dark spikes (`b09-eye-rev`): lower
   density, mixed heights, and a moss ground colour.
5. **Savanna (3).** Add green flush rings under tree canopies; soften the
   green-to-straw patch boundary over 2–4 m.
6. **Temperate rainforest (8).** Add a moss tint, ferns, and a darker, wetter
   ground; lower the grass height under canopy.

**Acceptance:** a blind review of `eye` frames with the HUD hidden names the
biome correctly for at least 9 of the 12 land biomes, from the ground layer
alone.

### W7 — Edges and verges (P2, M)

1. **Path verge falloff.** In growth, scale height by
   `smoothstep(0, verge, distanceToPathEdge)`, with `verge` around 0.6–1.5 m by
   path class, and add extra bend toward the path.
   - The path sampler already exists; it is used today for straw tips.
   - Add a centre grass strip for cart tracks if the path data carries ruts.
2. **Rock and tree bases.**
   - Shorter, denser grass in a 0.3–0.8 m ring, which is where mowers miss and
     moisture collects.
   - Under trees, extend the canopy-shade band: shade-tolerant short grass plus
     litter.
3. **Shoreline.** Taller, more upright, greener stems in the 1–3 m above the
   waterline, then a wet dark band, then water.
4. **Forest margin.** Taller ruderal grass and forbs in a 2–5 m edge band where
   forest density drops.

**Acceptance:** no full-height grass wall at any path, rock or shore edge in the
`eye` and `down` frames. Edges read as gradients over metres.

### W8 — Motion and lighting acceptance (P1, alongside every stage)

- **Wind continuity.** One gust visibly crosses blades, then cards, then terrain
  sheen without changing speed or phase. Check this in W0 clips at a fixed seed.
- **Trample direction.** The fold direction is hashed per blade today
  (`meadowBladeShape.js:139-168`). Make it radial from the contact point, with a
  small hash, so a walked path parts the grass. Keep the `pressDisc` behaviour
  for spells.
- **Recovery.** At 0.94 per frame the recovery depends on frame rate. Convert it
  to a time constant (about 1.5–3 s to recover) before tuning the look.
- **Shimmer.** Under TRAA, sub-pixel blades beyond 25 m must not flicker. Measure
  per-pixel temporal variance on a still camera in W0 clips.
- **Lighting matrix.** Run noon, low-back, low-front, overcast and night for
  every accepted stage. The sparse plan's G4 matrix applies here too.

## 6. Order and milestones

| Milestone | Contents | Why this order |
| --- | --- | --- |
| M1 | W0, then W2.1–2.3, then W1.1–1.4 | Depth and form give the biggest jump with no new content, all in the shader |
| M2 | W3 (W3.6 first), then W4.1 and W4.4 | Remove the ground ring and mid-field rows, then carry the improved near look to the horizon |
| M3 | W5.1–5.2, W1.5–1.6, W7.1 | Break the top line and the verge walls |
| M4 | W6 (rainforest, wetland, cold desert first), W5.3–5.4, W4.2–4.3 | Biome identity and extras |
| M5 | W7.2–7.4, W8 trample and recovery polish | Edges and interaction |

Each milestone ends with:
1. a W0 rerun using manifest replay, with before and after contact sheets;
2. `qa:perf` A/B against unmodified code at the same `--warmup` on the grassland
   and chunk-cross routes, following `docs/perf-qa.md`;
3. an update to this document's status line.

## 7. Engineering constraints and risks

- **Performance.** Grass is fill-bound. Width is the strongest cost lever:
  broadleaf at widthScale 1.6 cost +44%. Keep per-fragment work small and push
  per-blade terms to the vertex stage or to varyings.
  - Gates: frame p95 ≤ 33.3 ms, hitch rate ≤ 2%, recovery ≤ 2 s.
  - Investigate any repeatable p95 rise above 5%.
  - No stage may add grass candidates, residency radius or draw distance without
    its own A/B.
- **WebGPU limits.**
  - 16 samplers on terrain, already all in use.
  - 8 vertex buffers: a ninth attribute makes the mesh vanish.
  - 16 varyings: pack scalars into `vec4`.
  - `select()` duplicates branch inputs: hoist with `.toVar()`.
- **No `viewport*Texture` nodes** for any grass effect (soft intersection,
  refraction and so on). Their cost is per scene, not per mesh.
- **Shared look.** Ground shading changes in `MeadowGroundShading` also affect
  how towns sit in fields. Check one SettlementView burg after W2.2 and W4.1.
- **Tone mapping.** The emissive sheen and transmission terms must survive
  tone mapping without blooming. Bloom threshold is 3.0; keep the grass emissive
  under about 1.0 after exposure.
- **Determinism.** All new variation keys off the stable stem rank and world
  hashes, so LOD prefixes and streaming do not pop. No `Math.random`.

## 8. Open questions

1. Is the target look closer to painterly (Breath of the Wild / Ghost of
   Tsushima) or to naturalistic (Horizon)? W1.3 sheen strength and W4.1 colour
   shift depend on that. This plan assumes stylised-naturalistic: physically
   motivated terms, kept soft.
2. Should rainforest floors carry any grass at all outside clearings?
3. Is a cast-shadow experiment for the near band (W2.5) worth its measurement
   time, given W2.3?
