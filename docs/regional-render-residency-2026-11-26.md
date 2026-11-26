# Regional render residency — implementation and acceptance

Goal: only prepare/draw effects that the current area's content needs, without lowering authored density or changing gameplay/collision.

## Implemented

- Water: dry fields skip copies and use neutral shared terrain bindings. First wet use creates a shader variant keyed by ocean, inland, waterfall and ice feature bits and refraction. Mixed/unknown fields use their union or conservative full graph. Non-refractive and refractive variants are shared across slots.
- Terrain: dry page variant excludes water context, sand and swash graph; a wet or unknown page retains the full coastal graph. Slot switches wait for preparation; previous terrain remains visible. Do not classify snow by biome alone: altitude, weather, transitions and baked masks can produce snow.
- Meadow: reject tiles with no eligible own cells before scheduling compaction. Legacy clump grass rejects entirely ineligible pages. Missing page is not proof of absence.
- Startup: no unconditional icebergs/seracs/alpine geometry warmup, no dry water texture prewarm and no dry refraction warmup. Legacy clump resources pinned only for visible slots.
- Biome variants: use each layer's radius, exact resident page tile IDs as well as sparse predictive samples, and configured layer eligibility for generic variants. Tree startup assets remain intentionally unchanged.
- Towns: existing TownStreamer requests kits only when nearby settlements are pending and unloads distant instances. Caves and other instanced locations already create a separate scene on entry and dispose it on exit.

## Acceptance

Run [performance hitch testing](performance-hitch-testing-2026-11-26.md) on baseline and candidate. First run `node --test test/water-feature-profile.test.js`, followed by full npm tests/lint/build. Capture WebGPU at matched settings:

| Area | Required behavior |
| --- | --- |
| Dry desert / bare rock | No water draws/viewport copies from water, dry terrain graph, no grass jobs on ineligible cells |
| Grassland | Blades and cards only on eligible ground; no frozen/ocean/waterfall nodes on absent water |
| Inland river / lake | Inland variant; waterfall only when fall/plunge channels present; cold ice only when cold data permits |
| Ocean / beach | Ocean graph and shoreline retained; FFT only when ocean is visible; mixed estuary retains all relevant features |
| Snow mountains and cold sea | Geology created on first resolved placements; frozen water, snow and grounded rocks match baseline |
| City / village | No remote houses; local buildings and grass exclusions preserved, doors/collision unchanged |
| Cave entry / exit | Location scene owns cave assets; no surface rendering while inside; disposed on exit |
| Rapid teleport / edit | Wet-to-dry, dry-to-wet, grass-to-bare, mixed biome edges, pending shader cancellation; no stale water or missing terrain |

Record exact SHA, adapter, focus, viewport and route. Compare frame tails, active draw calls, texture bindings, GPU allocation, shader/pipeline count, `waterDryUploadsSkipped`, per-layer pending jobs, grass resident/missing tiles and startup resource counts. Check in GPU captures that absent water graphs have no associated nodes/bindings. Test rebase and revisions. No GitHub Actions.

## Remaining scope / limitations

This is demand-based activation, not a global VRAM cap. Previously loaded shared materials, texture atlases, installed scatter prototypes and town kit assets may remain cached for reuse. No global cross-layer density reduction, destructive cache eviction or per-biome terrain atlas repacking was added. Dry terrain still includes shared snow, rain, forest and biome material families because their inputs can change with altitude, weather and edits. Water graph creation and shader compilation are not guaranteed real-time. Full integration and hardware acceptance are pending.
