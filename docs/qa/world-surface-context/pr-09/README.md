# WSC PR 9 — Lighting and spatial ground bounce (2026-11-27)

Captured with `node scripts/run-wsc-pr9-qa.mjs` (shared frozen-server harness; hardware WebGPU,
RTX 4080). Before = clean export of `0eb364df`; after = that plus this PR's changes only.
Grassland `B01-C01` and Stillmeadow's woodland approach `B14-C01` at sunrise, clear noon,
overcast, sunset (plus D16 direct-only and D17 indirect-only) and rain; trunk bases and
understory under the canopy (`B14-C03`, `B14-C04`) at noon in D00, D01 albedo, D09 canopy and
D17. The frames in this folder are the follow-up's (below), one condition per run
(`--scenes … --hours …`): the shared GPU lost the device partway through full sweeps.

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

## Follow-up: storm air and bark (2026-11-27)

- **Woodland rain was a grey wash, from the storm fog.** `stormAirLook` closes the fog to a
  visibility target per storm level; the storm target was 150 m, so FogExp2 laid ~57 % fog at
  80 m and turned a wood into a flat grey sheet (scale 461 × the near-view base density; with the
  fog removed the same frame was 18× darker). Valley mist, weather rain and particles were each
  under 1 %. The ladder is now near real rain — light 4 km, moderate 1.5 km, heavy 700 m, storm
  400 m (~11 % fog at 80 m); the 140 m blizzard is unchanged.
- **That fog was hiding a black storm floor, so a daylight rainstorm now opens the exposure**
  ×1.8, as snow country stops it down; the sky follows a quarter of it, and snow and night storms
  are untouched.
- [storm-before-after.jpg](storm-before-after.jpg): woodland rain 0.0589 → 0.0097, woodland
  overcast 0.0627 → 0.013–0.027 (the near trunks and shrubs read, only the far wood fades),
  grassland rain 0.0149 → 0.0342 (overcast 0.0851 > rain, so storms still darken).
- **Bark under canopy.** A full canopy now takes 85 % of the sky fill (was 65 %): a trunk in a
  closed wood sees about a seventh of the sky. The D17 glow was mostly albedo, not light:
  [trunk-modes.jpg](trunk-modes.jpg) shows the bark is 2.05× its litter floor in D01, and lit
  (D00) the trunk is 3.1× its floor, leaving ~1.5× more light on a vertical face that sees the
  open sides of the wood than on a floor under the crowns.
- Run-to-run noise between single-condition captures is ±30 % on unchanged conditions (grassland
  clear 0.15–0.22 from grass growth and settle framing), so only the storm changes above are
  read as effects.

## Not resolved

- **No probe GI.** Ponlai PR-G (SH9 bounce probes) remains a specification; its PR F dependency
  does not exist. This PR is the WSC-scale stand-in it describes for stones and bark only;
  buildings keep their fill (owned by the settlement work).
- No `qa:perf` A/B: the GPU was shared with other sessions' captures throughout. The added cost
  is one WSC fetch per vertex on stones and trunks.
