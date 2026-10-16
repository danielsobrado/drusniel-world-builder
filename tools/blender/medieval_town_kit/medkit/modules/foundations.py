"""Raised stone plinths, entry steps and quoined corners.

Skyrim-style houses sit on a battered stone plinth with a few steps up to the
door. A plinth segment follows the wall contract (span X 0..GRID, exterior -Y)
and is placed at ground level under its wall; the building's stories stand on
top. Corner pieces take a quarter turn per corner so their arms run along the
two walls they join.
"""
from ..config import GRID, HALF_T as T, STORY
from ..mesh import MeshBuilder

PLINTHS = {'Low': 0.3, 'High': 0.6, 'Stilts': 0.6}
STEP_RISE = 0.15
STEP_RUN = 0.32
BURY = 0.4


def plinth(height):
    b = MeshBuilder()
    b.box((0, -T - 0.18, -BURY), (GRID, T, height - 0.08), 'stone', skip=('-x', '+x', '-z'))
    b.box((0, -T - 0.24, height - 0.08), (GRID, -T + 0.05, height), 'stone_dressed', skip=('-x', '+x'))
    return b


def plinth_corner(height):
    b = MeshBuilder()
    b.box((-T - 0.18, -T - 0.18, -BURY), (T, T, height - 0.08), 'stone', skip=('-z',))
    b.box((-T - 0.24, -T - 0.24, height - 0.08), (T, T, height), 'stone_dressed', bevel=0)
    return b


def entry_steps(height, width=1.5):
    """Steps descending outward (-Y) from a door centred at x = 1 on its wall."""
    b = MeshBuilder()
    count = max(1, round(height / STEP_RISE))
    rise = height / count
    x0, x1 = 1.0 - width / 2, 1.0 + width / 2
    face = -T - 0.18
    for i in range(count):
        top = height - i * rise
        b.box((x0, face - (i + 1) * STEP_RUN, -BURY), (x1, face, top), 'stone_dressed',
              skip=('-z',) if i else ())
    for x in (x0 - 0.22, x1):
        b.box((x, face - count * STEP_RUN, -BURY), (x + 0.22, face, height + 0.1), 'stone_dressed',
              skip=('-z',))
    return b


def quoins(story=STORY, course=0.5):
    """Long-and-short dressed corner stones; arms run along +X and +Y walls, exterior on -X/-Y.
    Big and pale against the rubble, as the corners of a hold's stone houses are."""
    b = MeshBuilder()
    out = -T - 0.08
    b.box((out + 0.03, out + 0.03, 0), (T, T, story), 'stone', bevel=0, skip=('-z', '+z'))
    for k in range(int(story / course)):
        z0, z1 = k * course + 0.01, (k + 1) * course - 0.01
        if k % 2 == 0:
            b.box((out, out, z0), (0.5, -T + 0.02, z1), 'stone_dressed')
            b.box((out, out, z0), (-T + 0.02, 0.28, z1), 'stone_dressed')
        else:
            b.box((out, out, z0), (0.28, -T + 0.02, z1), 'stone_dressed')
            b.box((out, out, z0), (-T + 0.02, 0.5, z1), 'stone_dressed')
    return b


def define(kit):
    for name, height in PLINTHS.items():
        if name == 'Stilts':
            continue
        kit.define(f'Plinth_{name}', 'foundations', plinth(height))
        kit.define(f'Plinth_{name}_Corner', 'foundations', plinth_corner(height))
        kit.define(f'Entry_Steps_{name}', 'foundations', entry_steps(height))
    kit.define('Corner_Quoins', 'foundations', quoins())
