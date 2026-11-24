# Grass LOD transition: cards that grow in — 2026-11-24

Commit `1c507d7c` against its parent `c94afa0b`, both served as frozen
snapshots (`scripts/serve-world-visual-snapshot.mjs`, `.claude/launch.json`
entries `grass-lod-base` / `grass-lod-change`).

## What popped

The meadow is three layers: blades to 50 m in four density bands, billboard
cards (one clump per card), and the terrain's grass volume past 90 m. The
visible boundary while walking was the **card layer**, not a blade band:

- cards reached full coverage at 14 m, the end of the first density drop
  (196 → 31 stems/m²), after dissolving in over only 9.2–14 m;
- each card stood at 1.125× the stand's height with its height swing
  compressed to 35% and **no tuft-gap cut**, while the near blades of a short
  stand are patchy, with ground between tufts.

So from ~12 m outward a taller, denser, slightly yellower carpet began, and the
edge travelled with the player. Isolating the layers at the same pose
(`u.cardFadeIn` / `u.handoff` overridden at runtime) shows it directly:
cards-only is a uniform tall carpet; blades-only is shorter and patchy.

## Change

All in the existing card path; no new layer, draw or texture.

| Piece | Before | After |
|---|---|---|
| Card incoming range (`meadowCardFadeRange`) | 9.2–14 m | 9.2–40 m: from the first density drop to where blades start their own dissolve |
| Card height while arriving (`meadowCardMaterial.js`) | full | 40% → 100% across that range (they rise out of the stand) |
| Card stature (`MEADOW_CARD_STATURE`) | 1.125 | 0.85 |
| Short-stand gap cut on cards (`meadowGrowthNodes.js`) | off | same as blades |

Blades keep full coverage until 40 m, so the handoff invariant (cards whole
before blades dissolve, no bare ring) still holds; `meadow-lod-handoff.test.js`
now checks that card coverage rises monotonically 14→38 m and is whole from
40 m.

A per-channel card tone match (×1.15/1.08/1.2) was tried and dropped: it
over-brightened one view and did not beat run-to-run noise on the other.

## Visual evidence

Captures: 1600×900 headed WebGPU, `?qaVisual=1`, settled poses at highfield
grassland (−8957, 7737), yaw 0 and 1.57. Score = mean |frame − blades-only
frame| per 40-px screen row band, horizon → near. Wind alone gives ~0.04.

| View | Base, ring rows | Change, ring rows | Base mean | Change mean |
|---|---|---|---|---|
| yaw 0 | 0.065 0.072 0.069 | 0.054 0.048 0.055 | 0.055 | 0.048 |
| yaw 1.57 | 0.088 0.089 0.099 | 0.063 0.068 0.073 | 0.062 | 0.048 |

Side-by-side sheets (before, after, blades-only reference, cards-only before
and after): [yaw 0](qa/grass-lod-transition-2026-11-24/grassland-y1.png),
[yaw 1.57](qa/grass-lod-transition-2026-11-24/grassland-y2.png).

## Performance

`qa:perf --qa chunk-cross --x -1869 --z -4003 --yaw 142.55359 --pitch -4.58366
--warmup 8 --duration 12 --settle --gpuTimings 1 --hitchMs 16.667 --headed`
(the grassland route of [grass-shadow-perf](grass-shadow-perf-2026-11-12.md)),
frozen snapshots, run base, change, base, change. All four kept native
foreground focus, settled and passed the collision gate.

| Run | Avg FPS | dt p95 ms | dt p99 ms | Frames > 16.7 ms | GPU avg ms | GPU p95 ms |
|---|---|---|---|---|---|---|
| base 1 | 91.6 | 14.7 | 32.8 | 45 | 4.77 | 6.00 |
| change 1 | 87.5 | 17.3 | 31.8 | 57 | 4.75 | 5.94 |
| base 2 | 91.9 | 15.3 | 31.5 | 43 | 4.80 | 6.11 |
| change 2 | 92.4 | 14.5 | 30.9 | 39 | 4.81 | 5.93 |

GPU time is unchanged, as expected: no geometry, draw or texture was added,
only a `smoothstep` per card vertex, and cards are shorter. Frame pacing
overlaps between arms (change 1 is the worst run, change 2 the best); the
>16.7 ms frames are the route's streaming hitches, present in every run.

Not covered: savanna, tundra and woodland floors were not captured; the
card → grass-volume edge at 81–90 m is unchanged.
