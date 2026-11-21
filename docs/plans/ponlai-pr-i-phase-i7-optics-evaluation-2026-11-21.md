# PR I phase I.7 — Spectral optics evaluation, plus band and foam fixes

Part of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-21.md). It follows [I.6 long swell geometry](ponlai-pr-i-phase-i6-long-swell-geometry-2026-11-21.md). Evidence: [`docs/qa/ponlai-pr-i-phase-i7-2026-11-21/`](../qa/ponlai-pr-i-phase-i7-2026-11-21/).

**Status:** done.
- **Candidates:** I.7's candidates are all "consider … only after measured benefit". One was already delivered (P5), one was prototyped and measured (P7 cat's paws) and rejected under the stop rule, and the rest were declined with reasons.
- **Fixes during review:** the user flagged two problems, both fixed:
  - the **contour bands** on the sea (a reflection bug present since before PR I);
  - the **whitecap foam evolving too slowly**.

## 1. Candidate decisions

| Candidate | Decision | Evidence |
| --- | --- | --- |
| [P5] unresolved slope variance | **Already delivered** | I.3 table (`unresolvedSlopeVariance`), I.4 roughness integration |
| [P6] physical glint lobes | **Not built** | I.5 dawn, evening and night captures show glitter confined to the sun and moon path, with no blown sparkle. The plan builds this only when the current specular needs it, and it does not |
| Jacobian offshore foam | **Not built** | The FFT outputs slopes only. A Jacobian needs displacement derivatives, meaning more channels and compute. Whitecaps, storm streaks, surf and impact foam already exist, so it would duplicate foam (a stop rule) |
| [P7] cat's paws (gust patches) | **Prototyped, measured, rejected** (§2) | No measurable or visible patchiness at 0.35 or 0.7 strength |
| [P7] windrows | **Not built** | The only streak noise (meso B) has a fixed orientation and cannot follow the wind |
| [P9] FFT caustics | **Deferred** | The plan assigns it to a separate follow-on PR |
| 256²×4, motion vectors, SSR | **Not built** | Not required (plan) |

## 2. Cat's paws experiment

**Design.** The FFT chop was scaled by a gain `1 ± s` from the world-noise macro layer, at about 85 m, reusing a texture already bound in the water shader. The patches drifted downwind from a double-precision offset wrapped to one 512 m tile, and slope and variance scaled by g and g².
- Binding counts were unchanged (16 / 13 / 12), confirmed in-app.

**Measurement.** Local chop energy (high-pass magnitude, blurred) over the water region, offshore pose, off vs on:

| Pose | Off mean / spatial std | s = 0.35 | s = 0.7 |
| --- | --- | --- | --- |
| reference day | 2.76 / 2.04 | 2.87 / 2.09 | 2.94 / 2.26 |
| calm day | 1.71 / 1.67 | 1.82 / 1.59 | 2.02 / 1.86 |

Patches should raise the spatial variation of chop. It barely moved, and by eye the frames gained only scattered flecks of sparkle, not readable gust patches. The visible chop sits in a distance band where 85 m patches cover too few pixels.

**Decision.** The plan's stop rule applies ("no demonstrated improvement"), so the code was **removed** rather than shipped as an unused option. The sheets stay as evidence: `screenshots/gusts-*.png`.

## 3. Fix: contour bands on the sea

**Symptom** (user report): pale winding ribbons outlining dark pools over the open sea and coastal water. They looked like contour lines, and they were already in the I.0 baseline.

**Diagnosis.** Diagnostics on the offshore pose, `scripts/run-coastal-review.mjs --diagnostics`, `screenshots/bands-diagnostics.png`:
- **opacity** is 1 offshore, so the seabed never shows;
- **transmission** and **palette** are uniform, and the water field there is uniform: flat bed at −25.5 m, shore distance capped at 48 m;
- **swell-normal** still shows the ribbons;
- **flat-displacement** removes them.

So the cause was something reading the **displaced** surface position: the planar reflection gate.

```js
// WaterReflectionController.sample: planar weight
.mul(smoothstep(0.1, 0.3, abs(positionWorld.y.sub(this.planarHeight))).oneMinus())
```

The gate is meant to stop one water body showing another's reflection, for example a lake above the sea. But `positionWorld.y` includes the swell (± about 1 m), so the planar image (clouds, island) was used only along a thin band of wave heights near the mirror plane, and everywhere else fell back to the darker cube. The ribbons were the swell's height contours.

The mirror itself was also captured at `getCanonicalWater(centre).surfaceHeight`, which includes the instantaneous swell, so the plane, and with it the contours, jumped at every 500 ms capture.

**Fix.**
- The gate compares the fragment's **still** level (`waterField.g + waterSurfaceOrigin`, before waves) with the plane. Both the sea and the river reflections pass it.
- The plane is captured at the body's still level (`staticWaterAt`, the existing helper that excludes the animated swell).

Water bodies at different levels are still separated; waves no longer draw contours.

**Result** (`screenshots/bands-offshore-before-after.png`, `bands-coast-before-after.png`): the open sea and coastal water read as one continuous surface with wind chop and soft cloud reflections. The turquoise shallows and the shoreline are unchanged.

**QA tool fix.** `coastal-review-diagnostics.mjs` rewrote sources with LF anchors, which Windows CRLF checkouts never matched. It now normalizes line endings first.

## 4. Fix: whitecap foam shape changes faster

**Symptom** (user report): the small white foam patches should change shape a little faster.

**Cause.** The breakup field (`createSeaFoamNoise`) mostly translated at about 0.1 m/s. Its shape-changing warp cycled every 200–270 s (0.031 and 0.023 rad/s), so a whitecap kept its outline for minutes.

**Change.**
- The warp rates are 3× faster (0.093 and 0.069 rad/s, about 68–90 s cycles).
- The fine octave drifts against the coarse one at about 7.5 cm/s, so outlines reshape within roughly 15–20 s.
- The drift itself is unchanged, and every offset wraps by the noise's 512-cell period, keeping chunk seams exact.

This affects whitecap breakup, storm streaks and the shore-line lace, which all share the field.

**Verification.** Stills at 1.4 s spacing cannot show it: from frame to frame, whitecaps mostly appear and vanish as crests pass (`screenshots/foam-windy-sequence-before-after.png`). The change is by construction, and judging it needs a live view or a recording.

## 5. Files

| File | Change |
| --- | --- |
| `src/render/reflections/WaterReflectionController.js` | `sample(…, surfaceLevel)` gates the planar reflection on the still level; the capture uses `staticWaterAt` |
| `src/editor/stylized/StylizedWaterMaterial.js` | Passes `stillLevel` to both reflection samples |
| `src/editor/stylized/SeaSurfNodes.js` | Faster foam warp; fine-octave counter-drift |
| `scripts/lib/coastal-review-diagnostics.mjs` | CRLF normalization before anchored rewrites |
| `test/water-planar-reflection-level.test.js` (new) | Gate and capture use the still level; foam drifts wrap |

## 6. Checks

| Check | Result |
| --- | --- |
| `npm test` | 5,071 pass, 0 fail |
| `npm run lint` | No issues |
| `npm run build` | Exit 0; existing chunk-size warnings only |
| Coastal captures after the fixes (offshore calm and windy sequences, curved coast, headland) | 0 failures, 0 GPU or network alerts |

## 7. Not verified

- Foam evolution in motion: no recording was made.
- Rivers and lakes with planar reflections were not re-captured. Their surfaces have no swell, so the still level equals their surface, and the gate behaves as before.
- Single GPU (RTX 4080).
