"""Assembles a town from the kit and a village plan (the fixed sample or a generated one)."""
import math

from . import lights, village_plan
from .buildings import BuildingAssembler
from .config import GRID, TERRACE
from .kit import footprint_cells, footprint_origin
from .terrain_builder import TerrainBuilder


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
    for cx, cy in plan.BRIDGES:
        group = kit.group(f'Bridge_{cx}_{cy}', coll, loc=(cx * GRID, cy * GRID, 0))
        kit.place('Arch_Bridge', coll, group, (0, 0, 0))
        top = 2 * TERRACE
        for i in range(2):
            kit.place('Railing_Wood', coll, group, (i * GRID, 0, top))
            kit.place_q('Railing_Wood', coll, group, ((i + 1) * GRID, GRID, top), 2)
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
    root = kit.group('Props', coll)
    for name, x, y, rot in plan.PROPS:
        kit.place(name, coll, root, (x * GRID, y * GRID, _z(plan, x, y)), math.radians(rot))
    for x, y in plan.LAMPS:
        z = _z(plan, x, y)
        kit.place('Lamp_Post', coll, root, (x * GRID, y * GRID, z))
        lights.point(lights_coll, root, (x * GRID, y * GRID, z + 2.8), energy=80.0)


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
