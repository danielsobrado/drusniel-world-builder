"""Regional ground: lane tiles, terrace walls, copings, edge railings and stairs per family.

Same contracts as terrain.py (edges span X 0..GRID, drop on -Y; stairs climb +Y), so the
TerrainBuilder places them by name from the town style (town_styles.py).

- Dark (Grukmar orcs): dark fieldstone walls, earth lanes, sharpened stake railings.
- Frost (Frostgard): rugged granite walls, earth lanes, frost grass, split-log railings.
- Granite (Stonehold): granite walls with basalt piers and copings, flagged lanes,
  a low granite parapet instead of a timber railing.
"""
from ..config import GRID, detailed
from ..mesh import MeshBuilder
from .terrain import coping, stone_stairs, terrace_wall, tile


def stake_railing():
    """Knee-high sharpened stakes lashed to a rail: an orc terrace edge."""
    b = MeshBuilder()
    for i in range(6):
        x = 0.17 + i * (GRID - 0.34) / 5
        h = 1.0 + 0.08 * ((i * 3) % 4)
        start = b.mark()
        b.lathe([(0.0, -0.05), (0.07, -0.05), (0.065, h - 0.2), (0.0, h)], 6, 'timber_dark')
        b.shift_from(start, (x, 0.2, 0))
    b.box((0, 0.12, 0.62), (GRID, 0.2, 0.72), 'timber_dark', skip=('-x', '+x'))
    return b


def log_railing():
    """Split-rail fence of hewn logs between two posts."""
    b = MeshBuilder()
    b.box((0, 0.11, 0), (0.16, 0.27, 1.05), 'log')
    for z in (0.38, 0.8):
        b.box((0, 0.14, z), (GRID, 0.26, z + 0.14), 'log', skip=('-x', '+x'))
    return b


def parapet_railing():
    """Low granite parapet with a basalt coping."""
    b = MeshBuilder()
    b.box((0, 0.08, 0), (GRID, 0.4, 0.62), 'stone_granite', skip=('-x', '+x', '-z'))
    b.box((0, 0.04, 0.62), (GRID, 0.44, 0.74), 'stone_basalt', skip=('-x', '+x'))
    return b


def flagstone_tile():
    """Big squared flags, one tone each, sunk joints: a hold's street."""
    b = MeshBuilder()
    b.poly([(0, 0, 0), (GRID, 0, 0), (GRID, GRID, 0), (0, GRID, 0)], 'stone_basalt', outward=(0, 0, 1))
    if detailed():
        for i, (x0, y0, x1, y1) in enumerate(((0, 0, 1.1, 0.9), (1.1, 0, 2, 0.9), (0, 0.9, 0.8, 2),
                                              (0.8, 0.9, 2, 2))):
            b.box((x0 + 0.02, y0 + 0.02, -0.04), (x1 - 0.02, y1 - 0.02, 0.025), 'stone_granite',
                  skip=('-z',), tone=0.86 + 0.06 * (i % 3))
    return b


def define(kit):
    kit.define('Tile_Earth', 'terrain', tile('earth'))
    kit.define('Tile_Grass_Frost', 'terrain', tile('grass_frost'))
    kit.define('Tile_Grass_Upland', 'terrain', tile('grass_upland'))
    kit.define('Tile_Snow', 'terrain', tile('snow'))
    kit.define('Tile_Snow_Path', 'terrain', tile('snow_path'))
    kit.define('Tile_Flagstone', 'terrain', flagstone_tile())
    for name, wall, pier in (('Dark', 'stone_dark', 'stone_dark'), ('Frost', 'stone_dark', 'rock'),
                             ('Granite', 'stone_granite', 'stone_basalt')):
        kit.define(f'Terrace_Wall_{name}', 'terrain', terrace_wall(mat=wall))
        kit.define(f'Terrace_Wall_{name}_Pillar', 'terrain', terrace_wall(True, wall, pier))
        kit.define(f'Terrace_Coping_{name}', 'terrain', coping(pier))
        for units in (1, 2):
            kit.define(f'Stairs_{name}_{units}', 'terrain', stone_stairs(units, wall))
    kit.define('Railing_Stakes', 'terrain', stake_railing())
    kit.define('Railing_Log', 'terrain', log_railing())
    kit.define('Railing_Parapet', 'terrain', parapet_railing())
