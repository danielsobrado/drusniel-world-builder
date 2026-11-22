# PR I phase I.9 evidence

In-app shader inspection (`run-coastal-review.mjs --ocean-fft-inspect`) on a frozen snapshot of `8c1d30a2`, served by `scripts/serve-world-visual-snapshot.mjs 8c1d30a2 5218`. Poses: I.0 offshore calm (high and calm motion) and cove (high). Summarized in [Offshore FFT ocean §6](../../rendering/offshore-fft-ocean-2026-11-22.md).

| File | Water patch | Result |
| --- | --- | --- |
| `logs/inspect-on.json` | none (shipped: on) | 2 of 3 poses; the first timed out loading the app |
| `logs/inspect-enabled-off.json` | `enabled: false` | Rejected: all 3 loads timed out while other sessions held the GPU |
| `logs/inspect-enabled-off-2.json` | `enabled: false` | Re-run: 3 of 3, same hashes as both off |
| `logs/inspect-both-off.json` | `enabled: false`, `geometry.enabled: false` | 3 of 3 |
