"""Town defences: a 2 m curtain-wall length with a crenellated outer parapet.

Exterior faces -Y like every other wall module; the wall-walk is on top.
"""
from ..config import GRID
from ..mesh import MeshBuilder

HEIGHT = 5.4
THICK = 0.6


def curtain_wall():
    b = MeshBuilder()
    b.box((0, -THICK, 0), (GRID, THICK, HEIGHT), 'stone', mats={'+z': 'cobble'},
          skip=('-x', '+x', '-z'))
    b.box((0, -THICK - 0.12, 0), (GRID, -THICK, 0.6), 'stone', skip=('-x', '+x', '-z'))
    for x0 in (0.1, 1.15):
        b.box((x0, -THICK, HEIGHT), (x0 + 0.75, -THICK + 0.35, HEIGHT + 0.8), 'stone')
    b.box((0, -THICK, HEIGHT), (GRID, -THICK + 0.35, HEIGHT + 0.25), 'stone', skip=('-x', '+x'))
    b.box((0, THICK - 0.2, HEIGHT), (GRID, THICK, HEIGHT + 0.5), 'stone', skip=('-x', '+x'))
    return b


def define(kit):
    kit.define('Wall_Curtain', 'defences', curtain_wall())
