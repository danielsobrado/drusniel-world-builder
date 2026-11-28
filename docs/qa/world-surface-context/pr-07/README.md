# WSC PR 7 — Settlements, foundations and roads

Captured with `node scripts/run-wsc-pr7-qa.mjs --url <frozen server>` on hardware WebGPU
(RTX 4080), served by `scripts/serve-frozen.mjs` from an exported snapshot of the PR 7 commit
plus the tuning in this commit (the checkout was being edited by other sessions; the
manifest's `commit` is the checkout's HEAD at capture time, not the served code).

[pr7-contact-sheet.jpg](pr7-contact-sheet.jpg) rows: B14-C05 terrain-to-road, B14-C06 the
approach lane, B18-C01 town edge; columns: D00 lit, D01 unlit. PR 0 baselines are under
`../pr-00/stillmeadow/{roads,foundations}` and `../pr-00/transitions/settlement-terrain`.

## What changed

- Town walls meet their ground through the WSC `foundation` profile
  (`render/materials/townGroundContact.js`): height from the terrain at the foot, colour
  a soil derived from the terrain albedo there. Only vertices within 2.5 m of the ground
  line fetch the WSC.
- Earth paving (lanes, gate approaches, building aprons) takes the same soil instead of
  one static `TOWN_GROUND` (`DEF-13`); `TOWN_GROUND` remains the fallback past the window.
- Apron rims swell and draw in with plan-space noise.

## Tuning found by the captures

[B18-wall-foot-before-after.png](B18-wall-foot-before-after.png) (top: before PR 7, bottom:
final). The first pass warmed the soil with its own earth hue on top of the earth
photograph's warmth and laid an orange strip along every wall foot; the soil now takes
`TOWN_GROUND`'s hue (a terrain as bright as the town ground gives the town ground back)
and keeps 12 % of the terrain's chroma. The `foundation` band was widened from 0.22 m to a
0.45 m splash zone with 0.2 m of edge noise after it read as a ruled line.

## Performance

`qa:perf --qa settlement-approach --warmup 8 --duration 14 --settle`, A (pre-PR 7 snapshot)
vs B (PR 7 snapshot), both frozen servers, while other sessions were running hardware QA:

| Run | FPS | Hitches | Valid |
|---|---|---|---|
| A4 | 71.5 | 8 | no (settle, focus) |
| B4 | 70.4 | 9 | no (settle, focus) |
| B5 | 73.3 | 5 | **yes** |
| A5 | 53.5 | 57 | no (settle, scenery, focus) |

Earlier runs had B low and A high in the same way A5 is low here; in every low run worker
CPU timings (tile pixels, grass scatter) rose too, which no shader change can cause. The
cost is vertex-only (fragment `textureLoad` count unchanged, `test/shader-node-build.test.js`).
A quiet-machine A/B is still worth repeating.

## B18 wall foot re-checked (2026-11-28)

[B18-wall-foot-2026-11-28.png](B18-wall-foot-2026-11-28.png) (top: PR 7, bottom: after the
under-wall tuck and shade ring, `69a93b01`). The dark brown strip along the foot is gone: lit
luma down a column runs wall 0.40 → foot 0.38 → earth apron 0.16–0.18 → grass 0.20–0.25,
with no step darker than the soil beside it. This capture drew the houses before their
per-settlement surface dressings streamed in (plain plaster, grey window stand-ins), so the
thin pale course at the very foot (luma equal to the wall's) could not be judged against
its stone dressing; re-look at it in a capture with the dressings loaded.
