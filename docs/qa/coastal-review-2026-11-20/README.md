# Coastal rendering review

November 20, 2026. The archive contains 29 reviewed 1600 × 900 PNGs from the running game. The scenes use procedural world seed 918273. Quality comparisons use the same camera pose, weather, local noon, and water clock. The rocky-shore sequence follows the simulated impact clock.

| Scene | What to inspect | Captures |
| --- | --- | --- |
| Exposed beach | Incoming sets, foam breakup, wet sand and run-up | [Open beach](screenshots/01-open-beach/) |
| Curved shore | Crests following the shoreline and shallow shelf | [Curved coast](screenshots/02-curved-coast/) |
| Promontory | Windward and lee sides in one frame | [Headland](screenshots/03-headland/) |
| Cove | Reduced run-up and foam with surface motion still present | [Sheltered cove](screenshots/04-sheltered-cove/) |
| Rocky shore | Water contact and the effect of elapsed time on foam and spray | [Rocky shore](screenshots/05-rocky-shore/) |
| Storm | Exposed and sheltered views at high and ultra | [Storm](screenshots/06-storm/) |
| Controls | Diffraction and finite-depth refraction toggled at a fixed pose | [Comparisons](screenshots/07-comparisons/) |

The [manifest](manifest.json) gives canonical camera positions and quaternions, source hashes, resolved water and weather settings, actual graphics backend, readiness, and coastal probes. The [findings](findings.md) cover fixes and visual limitations. The [performance report](performance.md) gives the paired timing results and their scope.

Chromium reports the NVIDIA vendor and Lovelace architecture with an empty adapter description. The manifest records that field as null. The machine's RTX 4080 model comes from Windows.

## Reproduce

From the repository root, install the project's npm dependencies and Playwright Chromium. Serve the runtime fix commit listed in the manifest on a local port, then run the capture script. Use a hardware WebGPU adapter and leave the owned Chromium window in the foreground for timing.

```sh
npm run dev -- --host 127.0.0.1 --port 5220
node scripts/run-coastal-review.mjs --url http://127.0.0.1:5220 --out tmp/coastal-review
```

The script takes its poses and settings from [poses.json](poses.json). Use `--only` with comma-separated scene IDs, tiers, control labels or entries such as `01-open-beach/high` to repeat a subset. Use `--measure` to capture and time the beach/cove pairs, and `--perf` to run those timed poses alone. Quality and diffraction controls apply to the compiled YAML served to this browser before initialization. Runtime terrain, water, and scenery use the ordinary application paths.

For a fixed-source run, use `node scripts/serve-world-visual-snapshot.mjs 5dd5cbf5 5220`. The manifest preserves the original snapshot and runtime override hashes for each image. The first capture batch predates the upload optimization. The rock and storm sequences were recaptured on the optimized source.
