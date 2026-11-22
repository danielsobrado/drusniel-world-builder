# Generated data

`npm run audit` writes these to `data/generated/`:

| File | Contents |
|---|---|
| `world-summary.json` | counts, reference check, population, class distribution, states, cultures |
| `settlements.json` | every valid settlement with normalized population, class and NPC budget |
| `connectivity.json` | routes, road components, per-settlement links, unresolved routes |
| `npc-budget-comparison.json` | the comparison scenarios with feasibility and distributions |
| `pilot-settlements.json` | the three pilot settlements and their evidence |

Each file is `{ meta, data }`. `meta` holds the schema version, world identity,
source fingerprint and a fingerprint of the configuration used. Keys are sorted and
there are no timestamps or local paths, so the same map and config produce
byte-identical files.

They are reproducible, so `data/generated/` is git-ignored. Commit one only on purpose,
as a fixture.
