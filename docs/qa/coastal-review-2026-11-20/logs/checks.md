# Verification summary

| Check | Observed result |
| --- | --- |
| Focused sea, water, coastal, device limit and worker tests | 267 passed, 0 failed. |
| Full `npm test` | 4,979 passed, 0 failed. Completed in 452.2 seconds. |
| Production build | Exit 0. Vite reported its dynamic-import and large-chunk warnings. |
| ESLint | Exit 0. |
| Original hardware water acceptance | All gates passed, 10.1 ms frame p95, native foreground held and zero WebGPU validation errors. |
| Candidate hardware water acceptance, headed | Two attempts exited 1 during discovery with `Water route discovery lost browser foreground focus.` No candidate acceptance pass or native pacing result was recorded. |
| Candidate hardware water acceptance, headless | The hardware adapter passed discovery. The runner timed out after 120 seconds waiting for the measured spawn to come within 2 m of the discovered start. The measured swim route did not run. |
| Candidate edited-world route | Terrain and scenery settled, 4 edits were applied, collision passed, and 0 browser errors were recorded. The runner exited 1 because native foreground switched to another Chrome process. Its pacing is diagnostic. |
| Image archive | 29 original canvas PNGs. Dimensions, SHA-256 hashes, required scene/tier coverage, hardware WebGPU and readiness flags verified. |

The first full-suite attempt ran 4,978 tests and found two coastal failures. The diffraction phase returned signed zero. The ocean refraction source assertion still expected a direct alpha assignment. The fixes and focused retests are recorded in the review. A later full-suite attempt encountered the shared browser lock while visual QA owned it. That attempt was stopped and excluded from the final suite result.

The first overhead headland run exposed foliage pipeline creation failures. The repeated overhead scene used the device limit negotiated with the NVIDIA adapter and rendered to the active game canvas. [Pipeline failure and retest](gpu-headland.json)

The capture batches had zero browser errors, uncaptured GPU validation errors or failed asset alerts. Chromium did report nonfatal WGSL unreachable-code warnings, a missing UV warning, zero-count draw warnings and Three.js deprecation messages. [Browser diagnostics](browser.json)
