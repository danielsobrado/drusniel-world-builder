"""Regional wall families on the same 2 m x 3 m wall contract as walls.py.

- Plank (Nordic): weathered horizontal clapboard between dark posts and braces.
- Plaster (Mediterranean): smooth render with stone sills and a string course.
- Arcade (Mediterranean loggia): an open round arch you can walk through.
"""
from ..config import GRID, HALF_T as T, STORY
from ..mesh import MeshBuilder
from .terrain import arch_bridge
from .walls import DOOR, INTERIOR, TIMBER_WINDOW, WINDOW, door_frame, panel, window_dressing

ARCADE = (0.4, 1.6, 0.0, 2.2)


def plank_wall(kind):
    b = MeshBuilder()
    hole = {'plain': None, 'window': TIMBER_WINDOW, 'door': DOOR}[kind]
    panel(b, 'clapboard', -0.1, T, hole, mats={'+y': 'clapboard'})
    b.box((0, -T, STORY - 0.24), (GRID, -0.02, STORY), 'timber')
    for x0 in (0.0, GRID - 0.12):
        b.box((x0, -T, 0), (x0 + 0.12, -0.02, STORY - 0.24), 'timber')
    if kind == 'plain':
        b.box((0.94, -T, 0), (1.06, -0.02, STORY - 0.24), 'timber')
        for xa, xb in ((0.12, 0.94), (1.88, 1.06)):
            b.beam((xa, 0, 2.0), (xb, 0, STORY - 0.24), (0, 1, 0), (-T, -0.03), 0.12, 'timber')
    elif kind == 'window':
        x0, x1, z0, z1 = TIMBER_WINDOW
        b.box((x0 - 0.04, -T, z0 - 0.1), (x1 + 0.04, -0.02, z0), 'timber')
        window_dressing(b, TIMBER_WINDOW, stone=False)
    else:
        door_frame(b, stone=False)
    return b


def plaster_wall(kind):
    b = MeshBuilder()
    hole = {'plain': None, 'window': WINDOW, 'door': DOOR}[kind]
    panel(b, 'plaster', -T, T, hole, INTERIOR)
    b.box((0, -T - 0.05, STORY - 0.3), (GRID, -T + 0.02, STORY - 0.12), 'stone',
          skip=('-x', '+x'))
    b.box((0, -T - 0.04, 0), (GRID, -T + 0.02, 0.35), 'stone', skip=('-x', '+x', '-z'))
    if kind == 'window':
        window_dressing(b, WINDOW, stone=True)
    elif kind == 'door':
        door_frame(b, stone=True)
    return b


def arcade_wall():
    """Open arch; exterior -Y, walk-through opening x 0.4..1.6 up to the 2.2 m crown."""
    b = arch_bridge(span=GRID, depth=2 * T, height=STORY, radius=0.6, spring=1.6, seg=10)
    b.translate((0, -T, 0))
    b.box((0, -T - 0.05, STORY - 0.3), (GRID, -T + 0.02, STORY - 0.12), 'stone',
          skip=('-x', '+x'))
    return b


def define(kit):
    for kind in ('plain', 'window', 'door'):
        suffix = '' if kind == 'plain' else f'_{kind.title()}'
        kit.define(f'Wall_Plank{suffix}', 'walls', plank_wall(kind))
        kit.define(f'Wall_Plaster{suffix}', 'walls', plaster_wall(kind))
    kit.define('Wall_Arcade', 'walls', arcade_wall())
