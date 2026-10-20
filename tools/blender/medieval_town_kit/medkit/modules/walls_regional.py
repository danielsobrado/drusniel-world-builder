"""Regional wall families on the same 2 m x 3 m wall contract as walls.py.

- Plank (Nordic): weathered horizontal clapboard between carved stave posts, sill & frieze.
- Plaster (Mediterranean): smooth limewash render with dressed-stone dentil string course & plinth.
- Arcade (Mediterranean loggia): an open round arch with dressed voussoirs and impost capitals.
"""
from ..config import GRID, HALF_T as T, STORY, detailed
from ..mesh import MeshBuilder
from .carpentry import carved_relief_motif
from .terrain import arch_bridge
from .walls import (DOOR, INTERIOR, TIMBER_WINDOW, WINDOW, door_frame, panel,
                    voussoir_arch, window_dressing)

ARCADE = (0.4, 1.6, 0.0, 2.2)


def plank_wall(kind):
    b = MeshBuilder()
    hole = {'plain': None, 'window': TIMBER_WINDOW, 'door': DOOR}[kind]
    panel(b, 'clapboard', -0.1, T, hole, mats={'+y': 'clapboard'})
    # Top stave frieze beam & stepped moldings
    b.box((0, -T - 0.025, STORY - 0.24), (GRID, -0.02, STORY), 'wood_trim')
    if detailed():
        b.box((0, -T - 0.045, STORY - 0.26), (GRID, -T - 0.02, STORY - 0.22), 'wood_trim',
              skip=('-x', '+x'))
        b.box((0, -T - 0.045, STORY - 0.04), (GRID, -T - 0.02, STORY), 'wood_trim',
              skip=('-x', '+x'))
        carved_relief_motif(b, 0.14, GRID - 0.14, STORY - 0.21, STORY - 0.04, -T - 0.025, style='frieze')
    # Bottom sill beam (interrupted by door opening)
    if kind != 'door':
        b.box((0, -T - 0.025, 0), (GRID, -0.02, 0.18), 'wood_trim', skip=('-x', '+x', '-z'))
    else:
        x0, x1, _, _ = DOOR
        b.box((0, -T - 0.025, 0), (x0, -0.02, 0.18), 'wood_trim', skip=('-x', '-z'))
        b.box((x1, -T - 0.025, 0), (GRID, -0.02, 0.18), 'wood_trim', skip=('+x', '-z'))
    # Vertical stave posts with base & capital collars
    for x0 in (0.0, GRID - 0.12):
        b.box((x0, -T - 0.025, 0), (x0 + 0.12, -0.02, STORY - 0.24), 'wood_trim')
        if detailed():
            b.box((x0 - 0.01, -T - 0.042, 0.18), (x0 + 0.13, -T - 0.015, 0.28), 'wood_trim')
            b.box((x0 - 0.01, -T - 0.042, STORY - 0.36), (x0 + 0.13, -T - 0.015, STORY - 0.26), 'wood_trim')
    if kind == 'plain':
        b.box((0.94, -T - 0.025, 0.18), (1.06, -0.02, STORY - 0.24), 'wood_trim')
        b.box((0.12, -T - 0.02, 1.40), (GRID - 0.12, -0.02, 1.54), 'wood_trim')
        for xa, xb in ((0.12, 0.94), (1.88, 1.06)):
            b.beam((xa, 0, 1.95), (xb, 0, STORY - 0.24), (0, 1, 0), (-T - 0.015, -0.03), 0.12, 'wood_trim')
            if detailed():
                b.beam((xa, 0, 0.18), (xb, 0, 1.40), (0, 1, 0), (-T - 0.012, -0.03), 0.10, 'wood_trim')
        if detailed():
            carved_relief_motif(b, 0.16, GRID - 0.16, 1.42, 1.52, -T - 0.02, style='frieze')
    elif kind == 'window':
        x0, x1, z0, _ = TIMBER_WINDOW
        b.box((x0 - 0.04, -T - 0.025, z0 - 0.1), (x1 + 0.04, -0.02, z0), 'wood_trim')
        window_dressing(b, TIMBER_WINDOW, stone=False)
    else:
        door_frame(b, stone=False)
    return b


def _med_cornice(b):
    """Dressed-stone Mediterranean string course with stepped cornice lip and dentils."""
    b.box((0, -T - 0.055, STORY - 0.28), (GRID, -T + 0.02, STORY - 0.12), 'stone_dressed',
          skip=('-x', '+x'))
    if detailed():
        b.box((0, -T - 0.08, STORY - 0.16), (GRID, -T - 0.03, STORY - 0.10), 'stone_dressed',
              skip=('-x', '+x'))
        for i in range(8):
            dx = 0.06 + i * 0.25
            b.box((dx, -T - 0.07, STORY - 0.34), (dx + 0.12, -T - 0.02, STORY - 0.28), 'stone_dressed')


def plaster_wall(kind):
    b = MeshBuilder()
    hole = {'plain': None, 'window': WINDOW, 'door': DOOR}[kind]
    panel(b, 'plaster', -T, T, hole, INTERIOR)
    _med_cornice(b)
    if kind != 'door':
        b.box((0, -T - 0.04, 0), (GRID, -T + 0.02, 0.34), 'stone', skip=('-x', '+x', '-z'))
        b.box((0, -T - 0.06, 0.32), (GRID, -T + 0.02, 0.39), 'stone_dressed', skip=('-x', '+x'))
    else:
        x0, x1, _, _ = DOOR
        for sx0, sx1 in ((0.0, x0), (x1, GRID)):
            b.box((sx0, -T - 0.04, 0), (sx1, -T + 0.02, 0.34), 'stone', skip=('-z',))
            b.box((sx0, -T - 0.06, 0.32), (sx1, -T + 0.02, 0.39), 'stone_dressed')
    if kind == 'window':
        window_dressing(b, WINDOW, stone=True)
    elif kind == 'door':
        door_frame(b, stone=True)
    return b


def arcade_wall():
    """Open arch; exterior -Y, walk-through opening x 0.4..1.6 up to the 2.2 m crown."""
    b = arch_bridge(span=GRID, depth=2 * T, height=STORY, radius=0.6, spring=1.6, seg=10)
    b.translate((0, -T, 0))
    _med_cornice(b)
    # Dressed-stone pier bases, impost capitals at spring=1.6, and arch voussoirs
    for px0, px1 in ((0.0, 0.4), (1.6, GRID)):
        b.box((px0, -T - 0.04, 0.0), (px1, T + 0.04, 0.26), 'stone_dressed', skip=('-z',))
        b.box((px0 - 0.04, -T - 0.05, 1.50), (px1 + 0.04, T + 0.05, 1.60), 'stone_dressed')
    if detailed():
        voussoir_arch(b, 1.0, 1.6, 0.60, 0.84, -T - 0.06, -T + 0.04, count=9)
    return b


def define(kit):
    for kind in ('plain', 'window', 'door'):
        suffix = '' if kind == 'plain' else f'_{kind.title()}'
        kit.define(f'Wall_Plank{suffix}', 'walls', plank_wall(kind))
        kit.define(f'Wall_Plaster{suffix}', 'walls', plaster_wall(kind))
    kit.define('Wall_Arcade', 'walls', arcade_wall())
