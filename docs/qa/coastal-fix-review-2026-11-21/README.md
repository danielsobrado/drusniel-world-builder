# Coastal rendering regression review · 2026-11-21

The original pose uses seed `918273`, camera `(2176, 27.917181, -10604)`, yaw `-1.690905` rad, pitch `-0.52` rad, 65° FOV, noon, clear weather and water time `123.4 s`. It matches the November 20 curved-coast reference. The sky and wind retain their own live clocks, so clouds and individual leaves can differ between captures. [Original reference](../coastal-review-2026-11-20/screenshots/02-curved-coast/high.png) · [Before](screenshots/01-original-defect/before.png) · [After](screenshots/01-original-defect/after.png)

- [Original defect and fix](screenshots/01-original-defect/)
- [Depth and material diagnostics](screenshots/02-depth-diagnostics/)
- [Close shallow water and sand transition](screenshots/03-shallow-water-fixed/)
- [Curved coast in high and ultra](screenshots/04-curved-coast/)
- [Headland and sheltered cove](screenshots/05-headland-and-cove/)
- [Exposed and sheltered wave sequences](screenshots/06-surf-and-foam/)
- [Low, medium, high and ultra at one camera](screenshots/07-quality-comparison/)
- [Grass and foliage controls](screenshots/08-grass-and-foliage/)

The manifest records source revisions, adapter limits, scene readiness, clocks, resolved water settings and SHA-256 hashes for all 77 original 1600 × 900 application captures. [Manifest](manifest.json) · [Findings](findings.md) · [Performance review](performance.md)

## Reproduce

Serve the revision to review with `node scripts/serve-world-visual-snapshot.mjs <revision> 5217`. Then run the same capture tool against that server.

```sh
node scripts/run-coastal-review.mjs --url http://127.0.0.1:5217 --fixtures docs/qa/coastal-fix-review-2026-11-21/poses.json --out tmp/coastal-fix-review
node scripts/run-coastal-review.mjs --url http://127.0.0.1:5217 --fixtures docs/qa/coastal-fix-review-2026-11-21/poses.json --out tmp/coastal-fix-diagnostics --only depth-diagnostics --diagnostics
node scripts/run-coastal-review.mjs --url http://127.0.0.1:5217 --fixtures docs/qa/coastal-fix-review-2026-11-21/poses.json --out tmp/coastal-fix-foliage --only foliage-overhead --minimum-interstage-limit
node scripts/run-coastal-review.mjs --url http://127.0.0.1:5217 --fixtures docs/qa/coastal-fix-review-2026-11-21/poses.json --out tmp/coastal-fix-timings --only curved-coast,cove,exposed --perf
npm run qa:water:acceptance -- --headed --url http://127.0.0.1:5217
```

Diagnostic mode changes shader modules in the owned Playwright page only. Timing runs use the uninstrumented runtime. For the calm sequences, QA scales offshore amplitude and swash run-up height to 30% of normal. Normal uses the shipped clear-weather settings. Storm uses the application's storm preset. All sequences start from the same water clock and step it forward at 30 Hz.
