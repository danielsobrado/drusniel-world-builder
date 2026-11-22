# 01 — Azgaar audit and NPC budget

PR1 of the standalone World Simulator. It reads the imported Azgaar world, checks
its facts, normalizes population, allocates a persistent-NPC budget and picks a
three-settlement pilot. Everything here is read-only: no simulation runs yet.

Source: `maps/Eldara Full 2026-07-23-20-37.json` (manifest id `eldara-2026`),
Azgaar 1.138.0, seed `550306385`, fingerprint
`sha256:128df10c17297db18f3de1f547d74697dc4279ba7f2e6809177af988c2cc2c0a`.

## Verified source findings

| Fact | Documented | Observed |
|---|---:|---:|
| Named settlements (valid, not removed) | 502 | **502** |
| Provinces | 131 | **131** |
| Active states | 8 | **8** |
| Culture records | 14 | **14** (12 hold named settlements) |
| Invalid / removed burgs | — | 0 / 0 |
| Capitals · ports | — | 8 · 120 |

The audit re-checks these on every run (`world.referenceCounts` in
`config/simulator.yaml`) and the dashboard shows the result.

### Population units

`settings.populationRate = 1000`, `settings.urbanization = 1`. Azgaar stores
population in points, and its own UI converts them as:

- named settlement: `burg.population × populationRate × urbanization`
- rural: `cell.pop × populationRate`

| Population | Inhabitants |
|---|---:|
| Named settlements | **3,592,734** |
| Rural | **18,752,987** |
| Total | **22,345,721** |

These equal the sums of the states' own `urban`/`rural` fields, which confirms the
reading. The audit's canonical unit is inhabitants.

The game reads the same numbers two other ways, left unchanged in PR1:

- `src/editor/world/settlements/SettlementProfile.js` treats `burg.population` as
  thousands. That matches inhabitants only while `populationRate × urbanization = 1000`,
  which holds for Eldara; another map with a different rate would render wrong sizes.
- `src/sim/import/projectAzgaarWorld.js` stores the raw points.

Also noted, not fixed: `projectAzgaarWorld` reads `burg.province`, but Azgaar burgs
carry no province field, so its settlement `provinceId` is always null. The audit
takes the province from the burg's cell (`pack.cells[burg.cell].province`).

### Settlement classes

| Class | Population | Settlements | Population |
|---|---:|---:|---:|
| Named village | < 1,000 | 21 | 16,629 |
| Small town | 1,000–2,999 | 169 | 313,782 |
| Town | 3,000–7,999 | 133 | 723,111 |
| Large town | 8,000–14,999 | 120 | 1,291,263 |
| City | 15,000–24,999 | 46 | 854,845 |
| Major city | 25,000+ | 13 | 393,104 |

Capital stays a separate political flag. The game's rendering classes
(hamlet…metropolis) are untouched.

### Roads and connectivity

Each Azgaar route point is `[x, y, cell]`, so a route passes through a settlement
exactly when it crosses the settlement's cell. Routes that meet at a shared
non-settlement cell form junctions, and the road network is built over those cells.
A coordinate tolerance (1.5 px) is only used for points with no cell id; Eldara has
none, so there are 0 coordinate matches. Proximity is listed separately and is never
counted as a connection.

| Measure | Value |
|---|---:|
| Land routes (4 roads, 310 trails) | 314 |
| Sea routes | 119 |
| Road components | 19 (largest 233 settlements) |
| Road-connected settlements | 460 |
| Settlements no land route reaches | 42 |
| Routes crossing fewer than two settlements | 255 (they join others at junctions) |

Distances use `settings.distanceScale` = 3 mi per map pixel.

## NPC allocation methodology

`backend/src/npc/NpcBudgetAllocator.js`, configured by `config/npc-population.yaml`:

1. Every settlement with population ≥ 1 gets its class minimum.
2. The remaining slots are shared by weight `sqrt(population) × importance`, with
   importance = capital 1.5 × port 1.15 × Azgaar market centre 1.25.
3. A share that would pass the class maximum is capped and the rest is re-shared.
4. Integer remainders go to the largest fractions, ties by ascending source id.
5. The sum is asserted. A target below the summed minimums or above the summed
   maximums is reported as infeasible, and the allocation stops at that bound.

| Target | Allocated | Feasible | Note |
|---:|---:|---|---|
| 5,000 | 8,571 | **no** | class minimums alone need 8,571 across 502 settlements |
| 10,040 | 10,040 | yes | no settlement at its minimum or cap |
| 20,000 | 17,204 | **no** | class maximums allow 17,204; 2,796 slots unassigned |

10,040 by class: villages 105, small towns 1,620, towns 2,351, large towns 3,343,
cities 1,863, major cities 758. By state: Lumeshire 2,248, Umbra'kor 1,335,
Contia 1,322, Wyrmreach 1,253, Elenoria 1,191, Frostgard 1,137, Grukmar 1,084,
Ironpeak 470.

## Pilot settlements

Pinned in `config/pilot-selection.yaml` as `pinnedSourceIds: [113, 60, 238]`. Clearing
the list re-runs the search, which returns the same three (a test checks this).

| Role (hypothesis) | Settlement | Stable id | Pop. | Class | NPCs | Evidence |
|---|---|---|---:|---|---:|---|
| Mining, mountain or craft | Falanenerwin | `settlement:azgaar-burg:113` | 6,256 | Town | 18 | crafts Arms, Tools |
| Agricultural / food | Sshanderi | `settlement:azgaar-burg:60` | 8,560 | Large town | 27 | extracts Grain |
| Trade / market | Vhaltha | `settlement:azgaar-burg:238` | 15,747 | City | 41 | Azgaar market 15 is centred here |

All three are in Umbra'kor (Darkhold culture) on road network `road-3`. Road
distances: Vhaltha–Falanenerwin 136.2 mi, Vhaltha–Sshanderi 125.5 mi,
Falanenerwin–Sshanderi 261.7 mi. Total **86 NPCs**, inside the 60–100 aim.

Azgaar does not label economic specialisation, so the roles are hypotheses from
what each burg extracts (production entries without a recipe), crafts (entries with
a recipe) and whether a market is centred there. The search keeps triples whose
every pair is road-connected within 150 map px, then prefers, in order: an NPC total
inside the aim, three different size classes, the strongest weakest-role evidence,
the shortest summed road distance, and source ids. "Preserved food" is excluded as
food evidence because almost every burg crafts it.

Falanenerwin and Sshanderi share no single route with another settlement: they reach
the network, and Vhaltha, through route junctions.

## Next phases (not implemented)

- **PR2 — Scenarios and baseline state:** deterministic clock, run/step, snapshots,
  canonical state for the pilot.
- **PR3 — Households, buildings, jobs** for the three pilot settlements.
- **PR4 — Economy and trade**, starting from Azgaar's recorded production and deals.
- **PR5 — Persistent NPC identities** from the allocation above.
- **PR6+ — History, knowledge, local LLM biographies, Dialogue Lab, game export.**
