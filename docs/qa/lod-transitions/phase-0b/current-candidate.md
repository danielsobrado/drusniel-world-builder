# Phase 0B current candidate

Phase 1 is still on hold. The earlier gallery, replay and matrix evidence
applies to the source revisions identified in those reports. Main now includes
changes to ground publication, tree demand, auxiliary draw readiness and
draw diagnostics. That runtime needs its own isolated hardware comparison.

The candidate is `c0fdaef3cc9dbca350ae1f3911d5cc38d928b455`. The frozen
runtime and atlas snapshot hash is
`60f4a24faac895918aeee79344d3e768e037cf6bac3614e99a0b91d668bf3328`.

The first full-suite run at `a4aef84f` passed 5,708 of 5,710 tests. Both
failures were in `tests/sceneryScheduling.test.js` with
`TypeError: queue.now is not a function`. The production queue now provides
a clock. Commit `5da14da7` gives the test double the same interface and keeps
the scheduling assertions intact. The five scheduling and queue regressions
pass after the fix. The broader focused run passed all 76 tests.
The isolated full-suite rerun on the rebaked candidate passed 5,710/5,710.
Lint and the production build passed on the candidate.

Production validation detected a stale `StylizedTreeView.js` source hash.
`npm run bake:impostors -- --timeout 900` rendered 40 replacement atlases,
generated mipmaps, encoded six KTX2 levels per atlas and ran required asset
validation. All texture bytes matched the previous bake. The newly generated
manifest is the only asset diff in `c0fdaef3`. Production validation passes
with the regenerated output.

| Bake output | Value |
| --- | --- |
| Manifest SHA-256 | `05782610fa8cb8df3dd670c7b19cddc3bada53598e6f3763d9582633cb907b72` |
| Runtime signature | `tree-impostor-v10-37c40d28` |
| KTX2 files | 40 |
| Total KTX2 bytes | 1,956,437 |

Raw logs are in `tmp/lod-phase-0b/`. Current hardware reports go in
`tmp/lod-phase-0b/current/`. The new frame summarizer includes the first
measured RAF interval in its FPS denominator. An FPS comparison with legacy
reports must account for that change. The earlier frame-time percentiles and
stall attribution are preserved.
