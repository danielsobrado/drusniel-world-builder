"""Town defences: a 2 m curtain-wall length with a crenellated outer parapet.

Exterior faces -Y like every other wall module; the wall-walk is on top.
"""
from ..config import GRID, detailed
from ..mesh import MeshBuilder

HEIGHT = 5.4
THICK = 0.6


def curtain_wall():
    b = MeshBuilder()
    b.box((0, -THICK, 0), (GRID, THICK, HEIGHT), 'stone', mats={'+z': 'cobble'},
          skip=('-x', '+x', '-z'))
    # Battered base plinth with dressed-stone water-table coping
    b.box((0, -THICK - 0.14, 0), (GRID, -THICK, 0.58), 'stone', skip=('-x', '+x', '-z'))
    b.box((0, -THICK - 0.16, 0.56), (GRID, -THICK + 0.02, 0.66), 'stone_dressed', skip=('-x', '+x'))
    # Parapet string course & machicolation corbels
    b.box((0, -THICK - 0.06, HEIGHT - 0.12), (GRID, -THICK + 0.04, HEIGHT), 'stone_dressed',
          skip=('-x', '+x'))
    if detailed():
        for i in range(4):
            cx = 0.25 + i * 0.5
            b.box((cx - 0.07, -THICK - 0.10, HEIGHT - 0.36), (cx + 0.07, -THICK, HEIGHT - 0.12),
                  'stone_dressed')
    for x0 in (0.1, 1.15):
        b.box((x0, -THICK, HEIGHT), (x0 + 0.75, -THICK + 0.35, HEIGHT + 0.74), 'stone')
        b.box((x0 - 0.03, -THICK - 0.03, HEIGHT + 0.72),
              (x0 + 0.78, -THICK + 0.38, HEIGHT + 0.82), 'stone_dressed')
    b.box((0, -THICK, HEIGHT), (GRID, -THICK + 0.35, HEIGHT + 0.25), 'stone', skip=('-x', '+x'))
    b.box((0, -THICK - 0.02, HEIGHT + 0.22), (GRID, -THICK + 0.37, HEIGHT + 0.28),
          'stone_dressed', skip=('-x', '+x'))
    b.box((0, THICK - 0.2, HEIGHT), (GRID, THICK, HEIGHT + 0.45), 'stone', skip=('-x', '+x'))
    b.box((0, THICK - 0.22, HEIGHT + 0.44), (GRID, THICK + 0.02, HEIGHT + 0.52),
          'stone_dressed', skip=('-x', '+x'))
    return b


def define(kit):
    kit.define('Wall_Curtain', 'defences', curtain_wall())
