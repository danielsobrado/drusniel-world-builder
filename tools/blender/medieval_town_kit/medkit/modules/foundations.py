"""Raised stone plinths, entry steps and quoined corners.

Skyrim-style houses sit on a battered stone plinth with a few steps up to the
door. A plinth segment follows the wall contract (span X 0..GRID, exterior -Y)
and is placed at ground level under its wall; the building's stories stand on
top. Corner pieces take a quarter turn per corner so their arms run along the
two walls they join.
"""
from ..config import GRID, HALF_T as T, STORY, detailed
from ..mesh import MeshBuilder

PLINTHS = {'Low': 0.3, 'High': 0.6, 'Stilts': 0.6}
STEP_RISE = 0.15
STEP_RUN = 0.32
BURY = 0.4


def plinth(height):
    b = MeshBuilder()
    b.box((0, -T - 0.18, -BURY), (GRID, T, height - 0.08), 'stone', skip=('-x', '+x', '-z'))
    # Stepped water-table coping at top + battered footing course at ground level
    b.box((0, -T - 0.24, height - 0.08), (GRID, -T + 0.05, height), 'stone_dressed', skip=('-x', '+x'))
    if detailed():
        b.box((0, -T - 0.21, height - 0.13), (GRID, -T - 0.15, height - 0.08), 'stone_dressed',
              skip=('-x', '+x'))
        b.box((0, -T - 0.22, -BURY), (GRID, -T - 0.16, 0.08), 'stone_dressed',
              skip=('-x', '+x', '-z'))
        # 3D coursed ashlar/rubble foundation stones along the exterior plinth face
        z_top = height - 0.13
        if z_top > 0.10:
            for bx0, bx1, bmat, btone in ((0.02, 0.48, 'stone_dressed', 0.96), (0.51, 0.98, 'stone', 0.88),
                                          (1.01, 1.50, 'stone_dressed', 1.03), (1.53, 1.98, 'stone', 0.91)):
                b.box((bx0, -T - 0.205, 0.08), (bx1, -T - 0.17, min(z_top, 0.28)), bmat, tone=btone)
        if z_top > 0.30:
            for bx0, bx1, bmat, btone in ((0.02, 0.34, 'stone', 0.90), (0.37, 0.86, 'stone_dressed', 1.02),
                                          (0.89, 1.38, 'stone', 0.86), (1.41, 1.98, 'stone_dressed', 0.98)):
                b.box((bx0, -T - 0.205, 0.29), (bx1, -T - 0.17, z_top), bmat, tone=btone)
    return b


def plinth_corner(height):
    b = MeshBuilder()
    b.box((-T - 0.18, -T - 0.18, -BURY), (T, T, height - 0.08), 'stone', skip=('-z',))
    b.box((-T - 0.24, -T - 0.24, height - 0.08), (T, T, height), 'stone_dressed')
    if detailed():
        b.box((-T - 0.21, -T - 0.21, height - 0.13), (T, T, height - 0.08), 'stone_dressed')
        b.box((-T - 0.22, -T - 0.22, -BURY), (T, T, 0.08), 'stone_dressed', skip=('-z',))
        z_top = height - 0.13
        if z_top > 0.10:
            b.box((-T - 0.208, -T - 0.208, 0.08), (T - 0.02, T - 0.02, z_top), 'stone_dressed')
    return b


def entry_steps(height, width=1.5):
    """Steps descending outward (-Y) from a door centred at x = 1 on its wall,
    with overhanging bullnose treads and stepped cheek parapets with pier caps."""
    b = MeshBuilder()
    count = max(1, round(height / STEP_RISE))
    rise = height / count
    x0, x1 = 1.0 - width / 2, 1.0 + width / 2
    face = -T - 0.18
    for i in range(count):
        top = height - i * rise
        y_front = face - (i + 1) * STEP_RUN
        # Riser body + overhanging dressed-stone bullnose tread slab
        b.box((x0, y_front + 0.03, -BURY), (x1, face, top - 0.045), 'stone',
              skip=('-z',) if i else ())
        b.box((x0 - 0.02, y_front, top - 0.045), (x1 + 0.02, face, top), 'stone_dressed')
    # Stepped cheek walls with dressed-stone coping and terminal newel piers
    total_run = count * STEP_RUN
    for cx0, cx1 in ((x0 - 0.22, x0), (x1, x1 + 0.22)):
        b.box((cx0, face - total_run, -BURY), (cx1, face, height + 0.06), 'stone', skip=('-z',))
        b.box((cx0 - 0.025, face - total_run - 0.02, height + 0.05),
              (cx1 + 0.025, face + 0.02, height + 0.13), 'stone_dressed')
        if detailed():
            # Terminal newel pier block at the foot of the stair cheek
            b.box((cx0 - 0.035, face - total_run - 0.04, 0.0),
                  (cx1 + 0.035, face - total_run + 0.24, height + 0.20), 'stone_dressed')
    return b


def quoins(story=STORY, course=0.5):
    """Long-and-short dressed corner stones; arms run along +X and +Y walls, exterior on -X/-Y.
    Big and pale against the rubble, as the corners of a hold's stone houses are."""
    b = MeshBuilder()
    out = -T - 0.08
    b.box((out + 0.03, out + 0.03, 0), (T, T, story), 'stone', bevel=0, skip=('-z', '+z'))
    for k in range(int(story / course)):
        z0, z1 = k * course + 0.01, (k + 1) * course - 0.01
        lx = 0.50 if k % 2 == 0 else 0.28
        ly = 0.28 if k % 2 == 0 else 0.50
        b.box((out, out, z0), (lx, -T + 0.02, z1), 'stone_dressed')
        b.box((out, out, z0), (-T + 0.02, ly, z1), 'stone_dressed')
        if detailed():
            # Raised chisel-drafted inner boss faces on the -Y and -X quoin arms
            m = 0.035
            b.box((out + m, out - 0.018, z0 + m), (lx - m, out + 0.01, z1 - m), 'stone_dressed')
            b.box((out - 0.018, out + m, z0 + m), (out + 0.01, ly - m, z1 - m), 'stone_dressed')
    return b


def define(kit):
    for name, height in PLINTHS.items():
        if name == 'Stilts':
            continue
        kit.define(f'Plinth_{name}', 'foundations', plinth(height))
        kit.define(f'Plinth_{name}_Corner', 'foundations', plinth_corner(height))
        kit.define(f'Entry_Steps_{name}', 'foundations', entry_steps(height))
    kit.define('Corner_Quoins', 'foundations', quoins())
