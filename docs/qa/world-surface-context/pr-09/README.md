# WSC PR 9 — Lighting and spatial ground bounce (2026-11-27)

Captured with `node scripts/run-wsc-pr9-qa.mjs` (shared frozen-server harness; hardware WebGPU,
RTX 4080). Before = clean export of `0eb364df`; after = that plus this PR's changes only.
Grassland `B01-C01` and Stillmeadow's woodland approach `B14-C01` at sunrise, clear noon,
overcast, sunset (plus D16 direct-only and D17 indirect-only) and rain; trunk bases and
understory under the canopy (`B14-C03`, `B14-C04`) at noon in D00 and D17.

[pr9-contact-sheet.jpg](pr9-contact-sheet.jpg) rows: grassland, woodland; columns sunrise,
clear, overcast, sunset D00 / D16 / D17, rain.

## What changed

- **Spatial ambient for stones and bark** (`worldSurfaceContext/WorldSurfaceAmbient.js`). The
  sky fills on scattered stones and trunks were camera-global and unattenuated (`DEF-10`): a
  boulder under a closed canopy took the same sky fill as one in a meadow, and every receiver
  took one hemisphere ground colour. They now read the WSC under them once per vertex (one packed
  varying): canopy and contact occlusion scale the sky fill, and the ground bounce keeps the
  hemisphere's energy but takes the local ground's albedo and hue (sand, moss, snow), weaker
  where that ground lies under canopy. It rescales the existing fills, so nothing is lit twice;
  outside the WSC window it is exactly the old hemisphere. Far impostors opt out.
- **Cloud turns sun into sky light** (`SkyLook.overcastSkyLook`). Cover cut the sun to 15 %
  *and* trimmed the ambient, darkening open ground twice; the sky fill now rises with cover
  (×1.6 at full cover) while the storm ladder still darkens heavy weather, and the total light
  still falls with cover.

## Evidence (linear luma, lower half of frame)

| Condition | Grassland before → after | Woodland before → after |
|---|---|---|
| Sunrise | 0.0764 → 0.0750 | 0.0184 → 0.0190 |
| Clear | 0.1582 → 0.1536 | 0.0190 → 0.0210 |
| Overcast | 0.0706 → 0.0769 | 0.0549 → 0.0582 |
| Sunset | 0.0858 → 0.0844 | 0.0094 → 0.0097 |
| Rain | **0.0107 → 0.0140** | 0.0544 → 0.0562 |

- Rain on open ground is 31 % brighter and overcast 9 %; sunlit conditions are unchanged within
  noise. [weather-before-after.jpg](weather-before-after.jpg) (top rain, bottom overcast).
- `B14-C04` trunk under the canopy, D17 indirect-only: 0.0458 → 0.0424 (−7 %) while the floor
  beside it rose 0.0125 → 0.0137, so the trunk's glow over its floor fell from 3.7× to 3.1×.
  [trunks-before-after.jpg](trunks-before-after.jpg).
- Unit gate `tests/worldSurfaceContextPr9.test.js`: exact parity outside the WSC window, canopy
  and contact attenuation, local bounce hue and cap, one vertex-stage fetch per receiver, and the
  overcast energy rule.

## Not resolved

- **Woodland under rain is a flat grey wash** (woodland/grassland ratio 4.0 in rain, 0.76
  overcast). It is not the sky fog density: making overcast add rather than multiply regional
  haze changed it by 3 % and was reverted. It is most likely the valley mist pooling in
  Stillmeadow's low ground; tuning that is a separate atmospheric pass.
- **Bark still reads 3× its floor in indirect light.** The canopy attenuation is proportional
  to measured canopy; the remaining gap is `BARK_FILL` itself, which another session is
  retuning with the crown lighting in the same file.
- **No probe GI.** Ponlai PR-G (SH9 bounce probes) remains a specification; its PR F dependency
  does not exist. This PR is the WSC-scale stand-in it describes for stones and bark only;
  buildings keep their fill (owned by the settlement work).
- No `qa:perf` A/B: the GPU was shared with other sessions' captures throughout. The added cost
  is one WSC fetch per vertex on stones and trunks.
