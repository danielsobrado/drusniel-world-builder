# Water visual follow-up — October 18, 2026

Reviewed the updated `main` after pulling to
`3e20d11595ee7a89d2c2fd785855afb3c4e716a5`. The earlier short inland-detail
repeat and repeated white crest stamps have already been addressed by the
incoming water work. This follow-up records remaining visual observations and
layer controls; it introduces no runtime material or geography changes.

The local [comparison gallery](../tmp/visual-followup-2026-10-18/comparison.html)
contains the native captures. Images and raw reports remain in the ignored
`tmp/visual-followup-2026-10-18/` directory.

## Findings, in priority order

1. **The imported river bank has fixed bright scallops and broad lighting
   bands.** They remain when the water-slot meshes are excluded from rendering
   and when water time advances from 123.4 to 137.4 seconds. Disabling water
   foam, water caustics, reflections, refraction or river detail normals does
   not remove them. The evidence places this particular defect in the bank
   terrain/shading rather than those water layers. The next discriminating
   controls are terrain roughness and terrain normals, followed by the baked
   substrate if necessary. The exact terrain term is **not yet established**.
   Changing water noise or lowering foam would not repair this observed band.
2. **Large mirrored clouds dominate parts of the sea and shallow coast.**
   The current surface retains much less repeated foam than the supplied
   screenshot, but the large reflected forms still compete with the finer
   ripples. Review roughness, reflection footprint and ripple hierarchy together
   at both grazing and elevated views. The river's separate broad central
   hotspot disappears in the glint-off control, identifying its sun-highlight
   contribution. This does not establish that sea reflections are erroneous.
3. **Shore composition is too uniform in the sampled views.** The river has a
   broad, nearly continuous pale bare-bank strip; the wetland coast shows rows
   of distant ground cover and little local variation in the bare shore.
   Existing shore plants, stones and substrate patches are candidates for
   habitat-aware clustering and quieter gaps. Preserve imported river courses,
   elevations, biome IDs and deliberate open areas. Population changes need
   separate movement and recovery measurements.

## Evidence and limits

The frozen source contains 1,814 files; snapshot SHA-256 is
`695667ed953dcdc257e186379c37c9fa66cbe012c901e51269eafdacfa79fe73`.
Captures use NVIDIA Lovelace hardware WebGPU, 1600 × 900, DPR 1, Highfield at
noon, weather off and water time 123.4 seconds unless explicitly labeled.

Three completed river control runs each report `captureValid: true`, fixed
source, full readiness, correct water/biome identity and zero browser errors:

| Run directory | Controls |
| --- | --- |
| `river-controls-retry/` | Foam, surface caustics, glint and reflections disabled individually |
| `river-refraction/` | Refraction and river detail normals disabled individually |
| `river-sheet/` | Water-slot layers hidden; water clock advanced independently |

The caustic, water-sheet and clock controls use clearly named diagnostic copies
of the existing capture runner under `tmp/`. Their reports retain script
hashes. The original runner supplies the refraction/normal controls. Ordinary
world stills and diagnostic images are separate in the gallery. Wind and
vegetation remain live, so these are not exact whole-image pixel A/B tests.

The initial four-view capture retained coast, open-sea and river images, then
stopped progressing at the lake pose. That interrupted attempt remains labeled
in `water/attempt-status.json`; it is not a passing four-view suite. The lake
was not reviewed successfully in this follow-up. A subsequent persistent-browser
terrain comparison also failed to complete, so no normal/roughness correction
is claimed. Owned diagnostic browsers and their shared lock were released.

These captures are visual evidence, not frame-time measurements. The current
[world implementation record](world-look-implementation-2026-10-18.md) retains
its separate release/movement acceptance status. Earlier performance figures
are not promoted to acceptance for this newer runtime.
