"""Interior structure: floor slabs, stairwells and interior stairs.

Slabs cover one 2x2 m cell with their top at local z=0, so a slab placed at a
story's base is that story's floor and the ceiling of the story below.
Stairs climb +Y over two cells (4 m) and one story (3 m).
"""
from ..config import GRID, HALF_T as T, STORY
from ..mesh import MeshBuilder

STAIR_X = {'L': (0.15, 1.35), 'R': (0.65, 1.85)}
WELL_X = {'L': (1.4, GRID), 'R': (0.0, 0.6)}
RAIL_X = {'L': 1.4, 'R': 0.6}


def floor_slab():
    b = MeshBuilder()
    b.box((0, 0, -0.2), (GRID, GRID, 0), 'timber', mats={'+z': 'planks', '-z': 'planks'})
    b.box((0, 0.92, -0.34), (GRID, 1.08, -0.2), 'timber', skip=('+z',))
    return b


def ground_floor():
    b = MeshBuilder()
    b.box((0, 0, 0), (GRID, GRID, 0.06), 'planks', skip=('-z',))
    return b


def _railing(b, x, y0, y1):
    b.box((x - 0.04, y0, 0.92), (x + 0.04, y1, 1.0), 'timber')
    y = y0
    while y < y1 - 0.01:
        b.box((x - 0.03, y, 0), (x + 0.03, y + 0.06, 0.92), 'timber')
        y += 0.4


def stairwell(side):
    b = MeshBuilder()
    x0, x1 = WELL_X[side]
    b.box((x0, 0, -0.2), (x1, GRID, 0), 'timber', mats={'+z': 'planks', '-z': 'planks'})
    _railing(b, RAIL_X[side], 0.15, GRID)
    return b


def stairs(side, steps=15):
    b = MeshBuilder()
    x0, x1 = STAIR_X[side]
    y0, y1 = T, 2 * GRID
    run, rise = (y1 - y0) / steps, STORY / steps
    for i in range(steps):
        top = (i + 1) * rise
        b.box((x0, y0 + i * run, top - 0.06), (x1, y0 + (i + 1) * run + 0.03, top), 'planks')
    for x in (x0 - 0.06, x1):
        b.beam((x, y0, -0.12), (x, y1, STORY - 0.12), (1, 0, 0), (0.0, 0.06), 0.3, 'timber')
    return b


def define(kit):
    kit.define('Floor_Planks', 'floors', floor_slab())
    kit.define('Floor_Ground', 'floors', ground_floor())
    for side in ('L', 'R'):
        kit.define(f'Floor_Stairwell_{side}', 'floors', stairwell(side))
        kit.define(f'Stairs_Interior_{side}', 'floors', stairs(side))
