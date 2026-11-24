# World Simulator residents

Where the World Simulator's export covers a town, the residents walking its streets are the
simulator's named people, not cosmetic stand-ins. They stand where their life is and walk
between the town's gathering places. When the player stands beside one, the walking HUD
shows who they are. The export itself is described in the simulator's
[doc 09](../world-simulator/docs/09-game-export-2026-11-24.md).

## How it works

| Piece | Role |
|---|---|
| `WorldSimRoster` | Loads `public/world-sim/index.json` the first time a town is in range, then the town's file on approach. Nothing loads at startup. It keeps only towns still in range, and ignores an export with another schema or version. |
| `NamedResidents` | Turns a town's document into resident records, with the same count rule as cosmetic residents. Each walker keeps the simulator's person id. |
| `SettlementGathering` | Spots now name their `kind`: stall, square, bench, the building kind at a door, or street. |
| `NpcSystem` | A record with a `route` walks to its next route point every third walk, and wanders around wherever it is in between. Paths are checked every 3 m, so a long leg cannot cross a house. |
| `ResidentNameplate` | Shows the nearest named resident within `nameplateMeters` (see below) in the walking HUD. |
| `ResidentMemory` | Remembers, in the browser, who the player has met and how often. |

**Where people stand:**
- caravan masters and traders: at the market stalls;
- innkeepers, smiths, bakers and clerics: at their door;
- other craftspeople: at a shop door;
- farmhands and miners: out along the main street;
- the retired: on a bench;
- people out of work: in the square.

When every fitting spot is taken, people share the least used one. Children are left out
until there is a child model. The first guard of a capital wears the radiant armour, as
before.

**The nameplate** shows the person's name, their trade and workplace, and one line: their
own introduction at a first meeting, and afterwards what is on their mind. It also shows how
many times the player has met them.

**Fallback.** Until a town's file arrives, and for any town the export does not cover, the
residents are the cosmetic ones, exactly as before.

## Settings

The `worldSim` section of `config/exploration.yaml`:
- `enabled`: turns named residents on or off.
- `path`: where the export lives, under `public/` (default `world-sim`).
- `nameplateMeters`: how close the player must stand to see who someone is.

## Cost

It adds no walkers, models or draw calls: the same resident slots, models and LODs. The
per-frame work is a scan of up to 32 walkers for the nameplate; the DOM changes only when
the nearest person changes. Each town file is fetched once on approach (11–25 KB for the
pilot).

## Not yet

- Meetings are not sent back to the simulator.
- There is no conversation in the game.
- Simulated homes are not matched to the game's houses.
- Residents do not follow a time of day.
