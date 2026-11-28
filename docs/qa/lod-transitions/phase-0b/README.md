# Phase 0B — partial execution

**Status: BLOCKED. Phase 1 is not ready for hardware acceptance.** These
results do not establish a performance improvement over Phase 0. The required
isolated hardware matrix, motion routes, recordings and hitch investigation
remain outstanding.

Tested main: `ffc77ceca793107f6df1cceb268678555b27fdfd` (the remediation
commit `b541104f` is an ancestor).
The checkout had an unrelated modification to `.claude/launch.json`, which was
preserved. Node v22.21.1; Windows, NVIDIA RTX 4080, driver 617.14. No GitHub
Actions were used.

| Check | Result |
| --- | --- |
| `npm ci` | Pass; npm reported five dependency vulnerabilities. |
| Phase 0B targeted `node --test` command | Pass, 59/59. |
| `npm run lint` | Pass. |
| `npm test` | Pass, 5686/5686. Raw log: `tmp/lod-phase-0b-tests.log`. |
| `npm run build` | Pass; Vite reports large chunks and an ineffective dynamic import. |
| `npm run validate:assets:production` | Pass, including all 40 required impostors and resident LOD validation. |
| `npm run qa:vegetation:lod -- --headed --url http://localhost:5173 --out tmp/lod-phase-0b/gallery` | 215/215 checks, 40 configured tree and 26 configured bush prototypes, none missing, zero reported browser errors. This is a functional check, not a timing run. |

The impostors were already rebaked in `18122c36` after the original Phase 0
report. Current source integrity validation passes; no signature was changed or
validation bypassed in this execution. No new asset bake was performed.

The gallery's near and proxy images in `captures/` are **rejected as visual
acceptance evidence**: terrain obscures the view and the trees are too small to
judge silhouettes. The script's checks passing does not establish that its
screenshots are useful. The full gallery is in `tmp/lod-phase-0b/gallery/`;
the unedited report is in `runs/`. Vite also relayed Three.js warnings,
including missing `uv` attributes; the runner records errors but not warnings.

An existing Chrome session and Edge processes were present throughout the
non-timing work. They were not closed by this session. Consequently no native
foreground performance run was attempted or accepted, and there are no
rejected performance samples or measured improvements to report. The cause of
the 216–329 ms grassland stalls, settle delays, diagnostic spikes and the
gallery framing defect remains unresolved. Reversal, revisit, flight, rotation,
rebase, mountain, snow and coastal routes, videos, transition-specific telemetry
and the three-run-per-arm matrix remain outstanding. Exact incremental GPU
transition costs, pinned bytes and automated missing-pixel coverage remain
unmeasured. Experimental performance settings were not enabled by default.
