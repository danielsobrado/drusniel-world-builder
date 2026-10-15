# Motion smoke rerun — October 15

**Failed:** requested scenery did not finish within two seconds at the
10–12 s stop, in either camera mode. [Raw report](report.json).
[Contact sheet](original-04-contact-sheet.png).

Frozen runtime `6f5f8985`, Windows headed Chromium, hardware NVIDIA Lovelace
WebGPU, fallback false, 1600×900, DPR 1. Both clips use the unchanged original-04
pose and the prescribed walk/sprint/turn sequence. Both record 20 simulation
seconds, with collision active, valid feet/terrain samples, prescribed movement
settings, correct FOV and input released. Browser errors: zero.

Third-person initial preparation now completes after the focus-generation fix.
This establishes that correction's observed preparation result; it does not
establish the two-second scenery gate. At 11 seconds, first-person near keys
are already published, but requested meadow work remains. At 11.9 seconds,
120 meadow items remain in first-person. The final 17–20 s stop settles in
0.028 s first-person and 0.396 s third-person.

Each video is verified as VP8, 1600×900, **25 FPS**. Maximum contact-frame
alignment error is 19.93 ms. The state JSON files contain the sampled simulation
frames and actual capture times; absolute JPEG paths refer to local recorder
frames. Review the committed sheet without those local files.

Full videos remain local, with hashes declared in the report, at:

- `tmp/world-visual-quality/after/motion-smoke-v2/original-04-first-person/capture.webm`
- `tmp/world-visual-quality/after/motion-smoke-v2/original-04-third-person/capture.webm`

These recordings are excluded from authoritative performance measurements.
The result blocks VQ-12/13 acceptance. Neither the timeout nor the requested
scenery definition was weakened to obtain a pass.
