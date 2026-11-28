# Phase 0B code review follow-up

Reviewed main at 059100c64c0b687bbe2d9f5af6e7df86c3942d73 and the recovered evidence in docs/qa/lod-transitions/phase-0b/follow-up.md. The fixes below do not enable experimental renderer options or change the production LOD algorithm.

- Frame summary duration now sums retained positive RAF deltas. The previous calculation omitted the first measured interval, inflating reported average FPS (particularly short captures). Historical reports are unchanged; future comparisons should recompute old FPS from complete intervals when available or label the methodology difference. Live FPS continues to represent all recorded intervals.
- Restart refreshes the movement plan and public API, and phase entry updates the live phase immediately. Settle sampling reuses the readiness snapshot rather than querying every queue twice.
- The LOD sampler reuses per-layer maps instead of creating composite keys per chunk. It rejects nonadjacent callback attribution and does not substitute zero for missing handoff timing. This is an allocation reduction, not proof that the 19.1 ms sample spike is resolved.
- Runner timeout uses the final URL and actual route frame budgets (nominal 60 Hz conversion, not a wall-time guarantee); explicit timeout remains available. Video, profiles and in-frame resource probes are marked diagnostic-only. Empty/truncated frame histories and active collision readiness failures cannot pass the runner.
- Revisit probes track weak object references, exclude loading slots, preserve explicit missing checkpoints and distinguish renderer replacement, garbage collection, and accounting removal. None demonstrates physical GPU eviction by itself.
- Gallery rejects malformed RGBA buffers and eliminates redundant root-plane writes. The successful prior gallery is still valid for its measured SHA.
- Variant acquisition failures, including synchronous exceptions, unwind the in-flight slot and retire custom leases. Production cache release is idempotent; cancellation and disposal preserve the existing loading limits.

## Validation and outstanding work

Isolated logic checks against fetched FrameProfiler, LodBaselineDiagnostics, gallery layout and revisit observer passed using synthetic fixtures (stub clock for timing). This is not the full Node test suite or hardware acceptance.

Run `npm ci`, `npm run lint`, `npm test`, `npm run build`, `npm run validate:assets:production` and the relevant QA commands from 00b-remediation.md and 00b-gallery-follow-up.md. Focused tests: test/lod-baseline-diagnostics.test.js, test/lod-revisit-resources.test.js, test/vegetation-gallery-layout.test.js, test/perf-qa-timeout.test.js, test/perf-preparation-gates.test.js, tests/PerfQaHarness.test.js, tests/StylizedVariantResidency.test.js, test/perf-qa-revisit-origin.test.js.

Do not claim full remediation: the recovered matrix isolates a remaining 299–359 ms first reflection-face CPU stall and a 630 ms cold terrain draw; prior async precompile made main-draw stalls worse. Inspect cold pipeline/attribute creation with separate diagnostic profiles before changing production capture policy. Staged ground-detail, tree, fog and ambient-ground readiness, missing UV warnings, real reversal coverage, additional matrix repetitions and exact transition-only GPU costs remain open. Run comparable unprofiled hardware measurements on isolated native WebGPU. Commit new evidence under docs/qa/lod-transitions/phase-0b/ without altering historical reports. No GitHub Actions.
