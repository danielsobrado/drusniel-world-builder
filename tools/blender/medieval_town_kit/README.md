# Medieval town kit (Blender generator)

Procedurally builds a modular, game-ready medieval town kit in Blender 5.2 and
assembles a sample terraced town from it.

```
"F:\Blender 5.2\blender.exe" -b --factory-startup --python tools/blender/medieval_town_kit/build_kit.py -- [--no-render] [--no-export] [--shots overview,street,lane,interior,catalog]
```

About 20 s end to end. Outputs:

| Path | What |
|---|---|
| `assets-src/medieval-town-kit/medieval_town_kit.blend` | Kit catalog (`Kit/*`) + assembled town (`Town/*`) |
| `assets-src/medieval-town-kit/textures/` | 13 shared tileable albedo+normal PNGs |
| `assets-src/medieval-town-kit/previews/` | Overview, street, lane, interior and catalog renders |
| `public/assets/environment/medieval-kit/medieval_kit.glb` | Every module once, at its origin, named by module |
| `public/assets/environment/medieval-kit/medieval_town.glb` | The town; ~2k nodes instancing 57 shared meshes |
| `public/assets/environment/medieval-kit/medieval_town_layout.json` | Group/placement tree to rebuild the town from the kit |

## Lego contract

- 2 m grid, 3 m stories, 1.5 m terrace steps (`medkit/config.py`).
- Walls span local X 0..2 m, centred on y=0, exterior −Y. Corner posts cover joints.
- Floor slabs cover one cell with their top at the story base.
- Stairs climb +Y over two cells (interior: one story; stone: one/two terraces).
- Placed pieces are linked duplicates parented to empties:
  `BLD_<name>` → `<name>_Story<k>` / `<name>_Roof`. Move a building, lift a story
  or swap a roof by moving its empty. `Door_Leaf` pivots on its hinge (`interactable: door`).

## Textures and UVs

All 18 materials sample 13 textures. UVs are planar in module space, scaled by
each material's tile size, so neighbouring modules tile seamlessly. Cloth
colours are tints (`baseColorFactor`) over one cloth texture.

## Layout

- `medkit/texture_patterns.py` — numpy texture generators
- `medkit/mesh.py` — geometry builder (box/beam/extrude/lathe/blob)
- `medkit/modules/*` — module families: walls, floors, roofs, terrain, props, nature, interior
- `medkit/buildings.py`, `furnish.py` — enterable buildings from specs
- `medkit/village_plan.py` — the sample town as data (height map, stairs, buildings, props)
- `medkit/terrain_builder.py`, `village.py` — assembly
- `medkit/render.py`, `export.py` — previews and glTF and layout export

## Regional families, prefabs and generated maps

- **Families** (`medkit/prefab_families.py`):
  - Tudor: half-timber with slate gables.
  - Nordic: clapboard, 60° gables, crossed finials and pent roofs.
  - Med: render over stone, terracotta hip roofs, loggias and a courtyard villa.
- **Prefabs** (`medkit/prefabs.py`, `prefab_export.py`): 70 buildings sized to
  the game planner's plots. They are exported as `medieval_kit_prefabs.json`,
  which holds parts, collision boxes, doors and lights. The game instances them
  per Azgaar burg (see `docs/towns.md`).
- **Generated towns** (`medkit/village_generator.py`): `-- --seed 11 --family Nordic`
  builds a new terraced town map. It writes `medieval_town_nordic_11.glb` and
  `previews/overview_nordic_11.png`.
- **Prefab close-ups:** `-- --no-export --no-render --prefabs Nordic_Tavern,Med_Villa`.

## Levels of detail

`-- --lod1` builds the kit again with `config.LOD = 1` and writes only
`medieval_kit_lod1.glb`, without images. The far kit has the same module names,
but no chamfers, brackets, voussoirs, lantern finials or flower detail, and its
lathes use half the segments. New detail goes behind `config.detailed()` so the
far kit stays light. The game swaps a whole town to the far kit past 100 m (see
`docs/towns.md`).

## Jetties and cross-gables

Tudor specs set `jetty` and `cross_gable` (`prefab_families.py`). Story k of a
jettied building uses `Wall_Timber_J<level>*` on its front and
`Corner_Timber_J<level>_L/_R` on its front corners, where the level comes from
`building_spec.jetty_level`. The roof group moves forward by the top story's
jetty and uses the widened `Roof_Gable_S<span>J<level>` set.

## Tuning live with Blender MCP

The MCP for Blender add-on (v1.8) listens on `localhost:9876` while Blender's
UI is open. Any client that speaks its JSON protocol can rebuild the kit from
source in the running Blender and render a QA street. For example, send
`{"type": "execute_code", "params": {"code": ...}}` with code that purges
`medkit.*` from `sys.modules` and re-imports it.

## Scans, accents and previews

- `medkit/scans.py` replaces procedural textures with CC0 Poly Haven scans. The
  scans live in `assets-src/medieval-town-kit/scans/<asset>/albedo.jpg` and
  `normal.jpg` (OpenGL convention). The tile size is the photograph's
  real-world size.
- `modules/accents.py` provides turrets, chimney breasts and stacks, oriels,
  balconies, trade signs, weathervanes, gable spikes, the fountain and hanging
  vines. `building_accents.AccentPlacer` places them from its own random
  stream, so tuning accents never reshuffles windows and doors.
- `BuildingSpec.gable_front` turns the roof group a quarter so the ridge runs
  front to back. `Roof_Gable_Fill_J*` closes the gap that a jettied front
  leaves.
- `medkit/game_look.py` lights previews with the game's sun and hemisphere
  values: the 'storybook' or 'configured' sky. It writes linear EXR and tone
  maps with three's ACESFilmic fit at exposure 1.12. Blender's sun follows the
  same 1/pi convention as three's directional light, so intensities carry over
  unchanged.
