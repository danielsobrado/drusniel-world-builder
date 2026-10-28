"""Assembles a town from the kit and a village plan (the fixed sample or a generated one)."""
import math

from . import lights, village_plan
from .buildings import BuildingAssembler
from .config import GRID, TERRACE
from .kit import footprint_cells, footprint_origin
from .terrain_builder import TerrainBuilder
from .town_styles import DEFAULT

# Preview-only fire light per prop: (height above its foot, energy). The game lights
# these virtually; scene lights here only make previews read like dusk in town.
FIRE_LIGHTS = {'Brazier': (1.15, 65.0), 'Lamp_Post_Banner': (2.8, 80.0), 'Cauldron_Fire': (1.1, 110.0),
               'Torch_Pole': (2.65, 90.0), 'Goblin_Totem': (1.65, 60.0), 'Goblin_Skiff': (1.05, 50.0),
               'Fire_Post': (2.55, 70.0), 'Brazier_Pillar': (1.5, 70.0), 'Clan_Hearth': (0.8, 140.0),
               'Street_Arch_Stone': (2.1, 75.0), 'Street_Arch_Timber': (2.0, 75.0),
               'Street_Arch_Granite': (2.0, 85.0), 'Bake_Oven_Outdoor': (1.0, 60.0),
               'Guard_Post': (0.95, 65.0), 'Smelter_Stack': (1.1, 110.0),
               'Stonehold_Ward_Pillar': (2.8, 80.0), 'Stonehold_Vent_Crater': (0.65, 55.0),
               'Stonehold_Caldera_Basin': (1.05, 75.0), 'Stonehold_Fang_Shrine': (0.95, 65.0),
               'Stonehold_Cavern_Maw': (1.15, 140.0), 'Stonehold_Horned_Sanctum': (1.35, 95.0),
               'Mine_Vent_Stack': (2.6, 110.0), 'Mountain_Cliff_Wall': (3.5, 160.0),
               'Mountain_Gate_Massif': (4.8, 360.0), 'Mountain_Cavern_Vault': (6.8, 560.0)}


def _z(plan, x, y):
    return plan.height(int(math.floor(x)), int(math.floor(y))) * TERRACE


def _stairs(kit, plan, coll, covered, open_edges):
    root = kit.group('Stairs', coll)
    for module, cx, cy in plan.STAIRS:
        cells = plan.STAIR_CELLS[module]
        kit.place(module, coll, root, (cx * GRID, cy * GRID, plan.height(cx, cy) * TERRACE))
        covered |= footprint_cells(cx, cy, 1, cells, 0)
        open_edges.add((cx, cy + cells, 'S'))


def _bridges(kit, plan, coll, open_edges):
    goblin = getattr(plan, 'STYLE', '') == 'goblin'
    for item in plan.BRIDGES:
        cx, cy = item[0], item[1]
        z_lvl = item[2] if len(item) > 2 else 0
        mod = item[3] if len(item) > 3 else ('Rope_Bridge' if goblin else 'Arch_Bridge')
        group = kit.group(f'Bridge_{cx}_{cy}_{z_lvl}', coll, loc=(cx * GRID, cy * GRID, z_lvl * TERRACE))
        if goblin:
            kit.place(mod, coll, group, (0, 0, 0))
        else:
            kit.place(mod, coll, group, (0, 0, 0))
            top = 2 * TERRACE
            for i in range(2):
                kit.place('Railing_Wood', coll, group, (i * GRID, 0, top))
                kit.place_q('Railing_Wood', coll, group, ((i + 1) * GRID, GRID, top), 2)
        if z_lvl == 0:
            open_edges.add((cx - 1, cy, 'E'))
            open_edges.add((cx + 2, cy, 'W'))


def _buildings(kit, plan, coll, lights_coll):
    assembler = BuildingAssembler(kit, coll, lights_coll)
    cells = set()
    for spec, cx, cy, rotq in plan.BUILDINGS:
        ox, oy = footprint_origin(cx, cy, spec.w, spec.d, rotq)
        assembler.build(spec, (ox, oy, plan.height(cx, cy) * TERRACE), rotq)
        cells |= footprint_cells(cx, cy, spec.w, spec.d, rotq)
    return cells


def _props(kit, plan, coll, lights_coll):
    goblin = getattr(plan, 'STYLE', '') == 'goblin'
    root = kit.group('Props', coll)
    for name, x, y, rot in plan.PROPS:
        z = _z(plan, x, y)
        kit.place(name, coll, root, (x * GRID, y * GRID, z), math.radians(rot))
        if name in FIRE_LIGHTS:
            height, energy = FIRE_LIGHTS[name]
            lights.point(lights_coll, root, (x * GRID, y * GRID, z + height), energy=energy)
    style = getattr(plan, 'TOWN_STYLE', DEFAULT)
    lamp_mod = 'Torch_Pole' if goblin else style.lamp
    for x, y in plan.LAMPS:
        z = _z(plan, x, y)
        kit.place(lamp_mod, coll, root, (x * GRID, y * GRID, z))
        lights.point(lights_coll, root, (x * GRID, y * GRID, z + style.lamp_light), energy=85.0)


def build(kit, plan=village_plan):
    terrain_coll = kit.collection('Town_Terrain')
    build_coll = kit.collection('Town_Buildings')
    props_coll = kit.collection('Town_Props')
    lights_coll = kit.collection('Town_Lights')
    covered, open_edges = set(), set()
    _stairs(kit, plan, terrain_coll, covered, open_edges)
    _bridges(kit, plan, terrain_coll, open_edges)
    building_cells = _buildings(kit, plan, build_coll, lights_coll)
    covered |= building_cells
    TerrainBuilder(kit, terrain_coll, plan).build(covered, building_cells, open_edges)
    _props(kit, plan, props_coll, lights_coll)
