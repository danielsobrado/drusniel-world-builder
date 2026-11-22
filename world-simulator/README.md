# Drusniel World Simulator

A standalone, offline workbench for the Drusniel world. It reads the imported Azgaar
map straight from the parent repository and, in this first version, audits it:
settlements, population, roads, a persistent-NPC budget and a three-settlement pilot
for later simulation work. It runs without the game or its renderer.

Findings, method and pilot ids: [docs/01-azgaar-audit-and-npc-budget-2026-11-22.md](docs/01-azgaar-audit-and-npc-budget-2026-11-22.md).

![World overview](docs/screenshots/01-world-overview.png)

## Requirements

Node.js 22 or newer. Run every command from `world-simulator/`.

```bash
npm install
npm run dev        # backend + frontend; Ctrl+C stops both
```

| Command | What it does |
|---|---|
| `npm run dev` | backend (watch mode) on 127.0.0.1:3100 and Vite on 127.0.0.1:5180 |
| `npm run dev:backend` / `npm run dev:frontend` | one of the two |
| `npm run audit` | writes the JSON reports to `data/generated/` |
| `npm test` | backend tests (node:test) then frontend tests (Vitest + jsdom) |
| `npm run lint` | ESLint |
| `npm run build` | production frontend bundle in `frontend/dist/` |
| `npm start` | backend that also serves `frontend/dist/` on port 3100 |
| `node scripts/capture-screenshots.js` | 1600×900 + phone screenshots into `docs/screenshots/` (needs `npm run dev`; uses the parent repo's Playwright) |

Open http://127.0.0.1:5180 during development, or http://127.0.0.1:3100 after
`npm run build && npm start`.

The frontend port is 5180, not 5174, because 5174 is the main game's dev port.

## Architecture

```text
config/            simulator.yaml, npc-population.yaml, pilot-selection.yaml
backend/src/
  world/           AzgaarWorldLoader (manifest, path guard, validation, fingerprint)
                   WorldAudit, PopulationNormalizer, SettlementClassifier
                   WorldModel (builds everything once; shared by API and CLI)
  geography/       SettlementConnectivity (cell-based route graph, components, distances)
  npc/             NpcBudgetAllocator
  pilot/           PilotSelector
  reports/         ReportBuilder, ReportWriter (canonical JSON)
  api/             routes, settlementQuery, responses
  app.js server.js log.js cli/audit.js
frontend/src/
  shell/           app bar, workspace bar, icon rail, explorer, inspector, status bar
  components/      WorldSummary, PopulationChart, SettlementTable, SettlementDetails,
                   BudgetComparison, WorldMap, PilotSettlements
  api/worldApi.js  fetch wrapper and useApi hook
  styles/          tokens.css (theme variables), shell.css, components.css
scripts/           dev.js (process launcher), capture-screenshots.js
```

The backend has no browser or rendering dependencies. It reuses the main repo's pure
helpers `src/sim/model/ids.js` (stable ids) and
`src/sim/persistence/canonicalSerialize.js` (sorted JSON, config fingerprint). The
editor importers are not used: they pull in terrain and rendering code.

The world model is built once at startup and frozen, so concurrent requests all read
the same data.

## API

Read-only, loopback-only, JSON. Every response is
`{ apiVersion, world: { mapId, sourceFingerprint }, data, meta? }`; errors are
`{ apiVersion, error: { code, message, details? } }` with status 400, 404, 405 or 500.

| Endpoint | Returns |
|---|---|
| `GET /api/health` | `{ status: "ok" }` |
| `GET /api/world` | identity, config fingerprint, map size, a light marker per settlement |
| `GET /api/world/summary` | counts, reference check, population, classes, states, cultures, budget totals |
| `GET /api/world/settlements` | paged list (see below) |
| `GET /api/world/settlements/:id` | detail with connectivity and NPC allocation; `:id` is a stable id or Azgaar source id |
| `GET /api/world/connectivity` | summary, components, routes (with points), unresolved routes |
| `GET /api/world/npc-budget` | comparison scenarios with distributions |
| `GET /api/world/pilot` | pilot roles, evidence, road distances, settlement details |

`/api/world/settlements` parameters: `page`, `pageSize` (≤ 200), `q` (name search),
`class`, `state`, `culture` (comma-separated ids), `minPopulation`, `maxPopulation`,
`capital`, `pilot` (`true`/`false`), `sort` (`sourceId`, `name`, `population`, `npcs`,
`stateName`, `cultureName`, `class`), `order` (`asc`/`desc`). Unknown or invalid
parameters return 400 naming the parameter.

There are no endpoints that take a file path. Static files are served only from
`frontend/dist/`, and only with `npm start`.

## Configuration

- `config/simulator.yaml` — host and ports, map id, reference counts, settlement
  classes, connectivity tolerances, page sizes, output directory.
- `config/npc-population.yaml` — target, comparison scenarios, per-class ranges,
  importance weights.
- `config/pilot-selection.yaml` — role evidence rules, constraints, pinned ids.

Environment overrides: `WS_BACKEND_HOST`, `WS_BACKEND_PORT`, `WS_FRONTEND_PORT`,
`WS_MAP_ID`. Another Azgaar Full JSON is added by listing it in `../maps/manifest.json`
and setting `world.mapId`. Map files must resolve inside `../maps/`.

## Generated data

See [data/README.md](data/README.md). Reports are deterministic and git-ignored.

## The workbench

One shell for every future workspace: app bar (world, mode, source fingerprint, model
status), workspace tabs, icon rail, collapsible explorer with filters and a
State › Settlement tree, the central workspace, a resizable shared inspector, and a
status bar. Selecting a settlement anywhere (table, map, tree, pilot, inspector links)
updates the same inspector. Inspector fields are marked `src` (imported Azgaar fact)
or `calc` (computed from config).

Shortcuts: `1`–`5` switch workspace, `[` and `]` toggle the side panels, `/` focuses
search. Panel layout is remembered per browser.

## Relationship to the game

The simulator only reads `../maps/`. It does not import or change the game's
settlement rendering, terrain or NPC code, and never writes the map or game saves.
Settlement ids match the game's sim projection (`settlement:azgaar-burg:<i>`), so
later exports can join on them.

## Current limitations

- Read-only audit: no simulation clock, households, economy or NPC identities yet.
- Pilot roles are hypotheses from Azgaar production records, not specialisations.
- The atlas draws settlements and routes, not coastlines or terrain.
- The game's renderer and sim projection read population differently (documented in
  the audit doc); PR1 leaves them as they are.
- No authentication; the server binds to 127.0.0.1 and must stay local.
