# Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Exit 0 |
| `npm test` | Exit 0 with 4,982 passes on the isolated run |
| `npm run build` | Exit 0. Vite reported the existing Azgaar dynamic-import and bundle-size warnings. |
| Coastal shader and water QA runner contracts | The seabed regression failed before the fix and passed afterward. The final five water runner contract cases passed after the Windows headless-channel selection. |
| `npm run qa:water:acceptance -- --headed` | Exit 0 on hardware WebGPU with native foreground focus. Every route gate passed. |
| `npm run qa:water:acceptance` in Windows full Chromium headless | Exit 0 against the frozen candidate on repeat. The first full Chromium run completed the route and exceeded the isolated projected-caustic CPU gate. |
| Coastal capture archive | 77 PNGs verified at 1600 × 900. SHA-256, renderer, readiness and paired camera, weather and clock metadata matched. |

The first `npm test` overlapped a hardware browser run, so the render-probe lock test encountered that live lock. The isolated suite passed it. The Windows headless-channel adjustment was checked separately with its updated runner contract after the full suite had loaded the original contract.
