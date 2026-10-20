"""Raised stone plinths, entry steps and quoined corners.

Skyrim-style houses sit on a battered stone plinth with a few steps up to the
door. A plinth segment follows the wall contract (span X 0..GRID, exterior -Y)
and is placed at ground level under its wall; the building's stories stand on
top. Corner pieces take a quarter turn per corner so their arms run along the
two walls they join.
"""
from ..config import GRID, HALF_T as T, STORY, detailed
from ..mesh import MeshBuilder

PLINTHS = {'Low': 0.3, 'High': 0.6, 'Stilts': 0.6, 'Dark': 0.3, 'Rugged': 0.6, 'Basalt': 0.45}
# Regional plinths: (rubble body, coping) materials; the rest use warm rubble and dressed stone.
PLINTH_STONE = {'Dark': ('stone_dark', 'stone_dark'), 'Rugged': ('stone_granite', 'stone_dark'),
                'Basalt': ('stone_basalt', 'stone_basalt')}
STEP_RISE = 0.15
STEP_RUN = 0.32
BURY = 0.4


def plinth(height, rock='stone', cap='stone_dressed'):
    b = MeshBuilder()
    b.box((0, -T - 0.18, -BURY), (GRID, T, height - 0.08), rock, skip=('-x', '+x', '-z'))
    # Stepped water-table coping at top + battered footing course at ground level
    b.box((0, -T - 0.24, height - 0.08), (GRID, -T + 0.05, height), cap, skip=('-x', '+x'))
    if detailed():
        b.box((0, -T - 0.21, height - 0.13), (GRID, -T - 0.15, height - 0.08), cap,
              skip=('-x', '+x'))
        b.box((0, -T - 0.22, -BURY), (GRID, -T - 0.16, 0.08), rock,
              skip=('-x', '+x', '-z'))
        # Coursed dressed blocks along the exterior face, one tone each, with sunk joints
        z_top = height - 0.13
        rows = [(0.08, z_top)] if z_top <= 0.36 else [(0.08, (0.08 + z_top) / 2), ((0.08 + z_top) / 2, z_top)]
        for r, (rz0, rz1) in enumerate(rows):
            if rz1 - rz0 < 0.06:
                continue
            cuts = (0.0, 0.58, 1.22, GRID) if r % 2 == 0 else (0.0, 0.34, 0.96, 1.58, GRID)
            for bx0, bx1 in zip(cuts, cuts[1:]):
                proud = 0.012 * ((int(bx0 * 10) + r) % 3)
                b.box((bx0 + 0.008, -T - 0.205 - proud, rz0 + 0.006), (bx1 - 0.008, -T - 0.17, rz1 - 0.006),
                      cap)
    return b


def plinth_corner(height, rock='stone', cap='stone_dressed'):
    b = MeshBuilder()
    b.box((-T - 0.18, -T - 0.18, -BURY), (T, T, height - 0.08), rock, skip=('-z',))
    b.box((-T - 0.24, -T - 0.24, height - 0.08), (T, T, height), cap)
    if detailed():
        b.box((-T - 0.21, -T - 0.21, height - 0.13), (T, T, height - 0.08), cap)
        b.box((-T - 0.22, -T - 0.22, -BURY), (T, T, 0.08), cap, skip=('-z',))
        z_top = height - 0.13
        if z_top > 0.10:
            b.box((-T - 0.208, -T - 0.208, 0.08), (T - 0.02, T - 0.02, z_top), cap)
    return b


def entry_steps(height, width=1.5, rock='stone', cap='stone_dressed'):
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
        b.box((x0, y_front + 0.03, -BURY), (x1, face, top - 0.045), rock,
              skip=('-z',) if i else ())
        b.box((x0 - 0.02, y_front, top - 0.045), (x1 + 0.02, face, top), cap)
    # Stepped cheek walls with dressed-stone coping and terminal newel piers
    total_run = count * STEP_RUN
    for cx0, cx1 in ((x0 - 0.22, x0), (x1, x1 + 0.22)):
        b.box((cx0, face - total_run, -BURY), (cx1, face, height + 0.06), rock, skip=('-z',))
        b.box((cx0 - 0.025, face - total_run - 0.02, height + 0.05),
              (cx1 + 0.025, face + 0.02, height + 0.13), cap)
        if detailed():
            # Terminal newel pier block at the foot of the stair cheek
            b.box((cx0 - 0.035, face - total_run - 0.04, 0.0),
                  (cx1 + 0.035, face - total_run + 0.24, height + 0.20), cap)
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
    return b


def define(kit):
    for name, height in PLINTHS.items():
        if name == 'Stilts':
            continue
        rock, cap = PLINTH_STONE.get(name, ('stone', 'stone_dressed'))
        kit.define(f'Plinth_{name}', 'foundations', plinth(height, rock, cap))
        kit.define(f'Plinth_{name}_Corner', 'foundations', plinth_corner(height, rock, cap))
        kit.define(f'Entry_Steps_{name}', 'foundations', entry_steps(height, rock=rock, cap=cap))
    kit.define('Corner_Quoins', 'foundations', quoins())
