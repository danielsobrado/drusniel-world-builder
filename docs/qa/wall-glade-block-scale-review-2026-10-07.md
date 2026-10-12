# Glade sandstone block scale review

Date: 2026-10-07. Part of the
[full fidelity scope](../plans/tiny-glade-wall-builder/full-fidelity-improvements-2026-10-02.md).

## Why

Comparing `docs/reference/tiny-glade/` with the October 2 garden captures, the
largest gap was the stone scale, not the remaining ledger items. The reference
builds a wall from about five courses of big blocks lying on their beds, with
wide flat chamfers, joints in shadow and saturated apricot stone. Ours had nine
to twelve courses of small tiles, narrow upright slivers, pale hairline seams,
a regular coping strip, paired-slab merlons and pastel colour.

## Implemented

- **Block scale.** `glade-sandstone` now uses 0.6 m courses and 0.95 m target
  width, with about 1.5 stones per square metre (previously about 7). The new
  `splitMinAspect` style field turns any vertical cut that would stand a stone
  upright into an uneven bed cut, so neighbouring stacks rarely share a seam.
  Other styles leave it null and are unchanged.
- **Curves.** Rounded stones are already bent to the arc, so the new
  `curveWidthTolerance` lets an arc-bent style keep wide blocks on tight
  curves. A narrowed cell still splits along the bed instead of standing
  upright.
- **Chamfers and joints.** Glade rounding uses flat chamfers of 10–15% of the
  stone size, capped at 6.5 cm, with a 1 cm floor so thin units cannot fold.
  Joints are 6–14 mm and the mortar core sits 11 cm deep in dark warm brown.
  Baked crevice, underside and downward-face occlusion are stronger.
- **Colour and light.** The palette is a deeper apricot and the pale patch
  stays warm. The Glade sky preset has less, warmer fill
  (ambient 1.9, saturation 0.25), so shaded faces read brown rather than grey.
- **Crown.** The coping is a 0.36 m course of the wall's own blocks with stepped
  wear (`crownVariation` 0.25) and no overhang.
- **Merlons.** New `merlonVariation` jitters each tooth's width, spacing and
  height (stacked second stone), keyed on its absolute cell so modules agree.
  `merlonMaxColumns: 1` lays one block per row.
- **Openings.** New `openingBlockScale` (1.7 for Glade) lengthens jamb rows and
  voussoirs. The band width shared with the void does not change.
- **Ivy.** Optional `zigzag`, `leafChance` and `stemRadius` growth fields give
  thick, angular climbing runs with sparser, larger leaves.
- **Ambient occlusion.** A new optional GTAO pass in the world post-processing
  graph (`postProcessing.ambientOcclusion`, off by default, topology-keyed) has
  settings-panel controls and survives quality presets. It reuses the scene
  MRT depth and normals, so it adds no geometry pass.

## Verification

- `npm test`: 3,034 pass. Production build, growth and colour config checks,
  and `git diff --check` pass. New tests are in
  `tests/ConstructionGladeBlockScale.test.js` and
  `test/postprocessing/ambient-occlusion-settings.test.js`.
- Hardware WebGPU captures of all 12 appearance scenes, warm and neutral:
  `tmp/glade-overhaul-final/`, with a before/after sheet at
  `tmp/glade-overhaul-final/before-after.jpg`. Baseline:
  `tmp/glade-overhaul-before/`.
- World AO with god rays off (`tmp/glade-world-nogr/`): mean darkening of
  about 8 levels, concentrated in joints and contact. No new console errors
  are attributable to the pass.

## Performance

Same session, sequential runs, headed:
`qa:perf --qa construction-ring --x 0 --z -100 --yaw 180 --warmup 40 --duration 12 --constructionStyle glade-sandstone`.

| Metric | HEAD | Candidate |
| --- | ---: | ---: |
| Average FPS | 51.42 | 58.25 |
| p95 frame time | 40.65 ms | 35.2 ms |
| Hitch rate | 8.67% | 7.09% |
| Construction stones | 31,720 | 9,072 |
| Construction build work | 1,460 ms | 652 ms |
| Resident modules | 96 | 96 |
| Coarse / shell modules | 45 / 51 | 43 / 53 |

Reports: `tmp/glade-perf-{before,after}.json`. Both runs fail the 33.3 ms p95
and 2% hitch gates on this run. The candidate improves both.

## Known issues

- Volumetric god rays (the default) bypass the post-processing graph, so AO only
  applies when god rays are off or using the screen technique.
- World depth of field renders a black frame. This reproduces on HEAD and is
  unrelated to this change; it is tracked as a separate task.
- Remaining ledger items are unchanged: shared corner and T-junction bonding,
  direct bend/trim/resize gestures, sound and presets.
