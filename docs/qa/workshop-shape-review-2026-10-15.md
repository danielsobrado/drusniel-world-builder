# Workshop roof and shutter review — 2026-10-15

The oval pavilion now uses the bell roof surface, keeping its eave level around
the oval footprint. The rectangular hip surface previously lifted parts of that
edge. Open shutters also check the change in wall direction between hinge and
tip: the dormer fixture turns approximately 62 degrees while its tip is only
0.103 m away from the hinge tangent, so distance alone missed the tight return.
An unsafe open pair is omitted; explicitly ajar and closed poses remain available.
These corrections are included in `f83ba7f2`.

Regression coverage checks the entire pavilion perimeter after rotation and
elevation changes, plus both dormer shutters at two rotations, four poses and
near/coarse detail. The standard shape test command now includes the existing
masonry and bridge regression file.

Validation on the shared checkout:

- Repository test run: **3,655 passed**, zero failures.
- Final shape test run: **129 passed**, zero failures.
- Hardware browser QA: **38 interaction checks passed**, sixteen presets and
  nineteen detail views; no page or console errors.
- Art review: **64 near captures** (four angles for every preset), plus **12 coarse
  captures** for the pavilion, dormer cottage and rounded cottage. The affected
  roof and shutter views were inspected at both detail levels.
- Both browser runners used the actual **NVIDIA Lovelace WebGPU** renderer with
  `fallback: false`.
- Lint, production build and `git diff --check` passed. Vite still reports its
  existing chunk-size and ineffective dynamic-import advisories.

The gallery includes the shared checkout's concurrent stone bridge and carried
timber-frame improvements. This continuation adds regression coverage for the
pavilion and shutter corrections. No terrain, streaming or residency changes
were made, so movement performance was not remeasured.

Local artifacts (generated under ignored `tmp/`):

- [Comparison gallery](../../tmp/workshop-shapes-qa/comparison.html)
- [Interaction report](../../tmp/workshop-shapes-qa/report.json)
- [Near capture manifest](../../tmp/workshop-review-final/report.json)
- [Coarse capture manifest](../../tmp/workshop-review-final/report-coarse.json)
- [Final shape test log](../../tmp/workshop-review-final/shape-tests.log)

Reproduce the captures:

```powershell
rtk npm run qa:workshop:shapes:browser
rtk proxy node scripts/review-workshop-shapes.mjs --out=tmp/workshop-review-final
rtk proxy node scripts/review-workshop-shapes.mjs --only=courtyard-pavilion,dormer-cottage,rounded-cottage --coarse --out=tmp/workshop-review-final
```
