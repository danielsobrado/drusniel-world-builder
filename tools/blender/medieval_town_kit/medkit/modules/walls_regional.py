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


def _clapboard_lap_courses(b, kind):
    """3D horizontal overlapping weatherboard/clapboard lip strips & forged iron joint straps."""
    keepout = None
    if kind == 'window':
        keepout = (0.20, 1.80, 0.70, 2.40)
    elif kind == 'door':
        keepout = (0.38, 1.62, 0.0, 2.45)

    # Horizontal lap-board shadow ledges every 0.22m up the wall
    spans = ((0.12, 0.94), (1.06, 1.88)) if kind == 'plain' else ((0.12, 1.88),)
    for k in range(11):
        cz = 0.20 + k * 0.22
        if kind == 'plain' and 1.36 <= cz <= 1.58:
            continue
        for sx0, sx1 in spans:
            if keepout is not None:
                kx0, kx1, kz0, kz1 = keepout
                if cz >= kz0 and cz <= kz1:
                    for sub0, sub1 in ((sx0, min(sx1, kx0)), (max(sx0, kx1), sx1)):
                        if sub1 - sub0 > 0.08:
                            b.box((sub0, -0.114, cz), (sub1, -0.098, cz + 0.032),
                                  'clapboard', bevel=0, skip=('-x', '+x'))
                    continue
            b.box((sx0, -0.114, cz), (sx1, -0.098, cz + 0.032), 'clapboard', bevel=0, skip=('-x', '+x'))

    # Forged wrought-iron strap plates with rivets at stave post joints
    for px in (0.06, GRID - 0.06):
        for jz in (0.22, STORY - 0.28):
            b.box((px - 0.048, -T - 0.036, jz - 0.022),
                  (px + 0.048, -T - 0.022, jz + 0.022), 'iron', bevel=0)


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
        _clapboard_lap_courses(b, kind)
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
        if detailed():
            # Carved Nordic apron panel below the window sill
            b.box((x0 - 0.02, -T - 0.02, 0.18), (x0 + 0.06, -0.02, z0 - 0.1), 'wood_trim')
            b.box((x1 - 0.06, -T - 0.02, 0.18), (x1 + 0.02, -0.02, z0 - 0.1), 'wood_trim')
            carved_relief_motif(b, x0 + 0.08, x1 - 0.08, 0.42, z0 - 0.14, -0.10, style='frieze')
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
        b.box((0, -T - 0.035, STORY - 0.33), (GRID, -T + 0.02, STORY - 0.28), 'stone_dressed',
              skip=('-x', '+x'))


def _plaster_brick_patch(b, cx, cz):
    """Cluster of 3D proud medieval kilned clay bricks & mortar joints breaking through lime render."""
    # Backing brick pocket exposed where plaster has flaked off
    b.box((cx - 0.25, -T - 0.008, cz - 0.08), (cx + 0.20, -T + 0.004, cz + 0.16), 'brick', bevel=0)
    bricks = (
        (-0.18, -0.01, -0.07, -0.01, 'brick', 0.94),
        (0.01, 0.18, -0.07, -0.01, 'brick', 0.86),
        (-0.23, -0.06, 0.01, 0.07, 'brick', 1.02),
        (-0.04, 0.14, 0.01, 0.07, 'brick', 0.92),
        (-0.14, 0.06, 0.09, 0.15, 'brick', 0.90),
    )
    for dx0, dx1, dz0, dz1, mat, tone in bricks:
        b.box((cx + dx0, -T - 0.018, cz + dz0), (cx + dx1, -T - 0.004, cz + dz1), mat, tone=tone)


def plaster_wall(kind):
    b = MeshBuilder()
    hole = {'plain': None, 'window': WINDOW, 'door': DOOR}[kind]
    panel(b, 'plaster', -T, T, hole, INTERIOR)
    _med_cornice(b)
    if kind != 'door':
        b.box((0, -T - 0.04, 0), (GRID, -T + 0.02, 0.34), 'stone', skip=('-x', '+x', '-z'))
        b.box((0, -T - 0.06, 0.32), (GRID, -T + 0.02, 0.39), 'stone_dressed', skip=('-x', '+x'))
        if detailed():
            # Individual 3D chamfered rusticated ashlar base blocks
            for bx0, bx1 in ((0.0, 0.62), (0.62, 1.30), (1.30, GRID)):
                b.box((bx0 + 0.006, -T - 0.052, 0.0), (bx1 - 0.006, -T + 0.01, 0.16), 'stone_dressed', skip=('-z',))
            for bx0, bx1 in ((0.0, 0.34), (0.34, 0.96), (0.96, 1.58), (1.58, GRID)):
                b.box((bx0 + 0.006, -T - 0.052, 0.17), (bx1 - 0.006, -T + 0.01, 0.32), 'stone_dressed')
    else:
        x0, x1, _, _ = DOOR
        for sx0, sx1 in ((0.0, x0), (x1, GRID)):
            b.box((sx0, -T - 0.04, 0), (sx1, -T + 0.02, 0.34), 'stone', skip=('-z',))
            b.box((sx0, -T - 0.06, 0.32), (sx1, -T + 0.02, 0.39), 'stone_dressed')
            if detailed():
                b.box((sx0 + 0.02, -T - 0.052, 0.0), (sx1 - 0.02, -T + 0.01, 0.16), 'stone_dressed', skip=('-z',))
                b.box((sx0 + 0.02, -T - 0.052, 0.17), (sx1 - 0.02, -T + 0.01, 0.32), 'stone_dressed')
    if detailed():
        # One flaked patch low on the blank wall only, where damp rises; patches on every
        # module repeat along a facade and read as stickers.
        if kind == 'plain':
            _plaster_brick_patch(b, 1.55, 0.62)
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
            # Rusticated ashlar courses along arcade piers
            for k in range(4):
                qz0 = 0.27 + k * 0.30 + 0.008
                qz1 = 0.27 + (k + 1) * 0.30 - 0.008
                b.box((px0 + 0.01, -T - 0.028, qz0), (px1 - 0.01, T + 0.028, qz1), 'stone_dressed')
    if detailed():
        voussoir_arch(b, 1.0, 1.6, 0.60, 0.84, -T - 0.06, -T + 0.04, count=9)
    return b


def define(kit):
    for kind in ('plain', 'window', 'door'):
        suffix = '' if kind == 'plain' else f'_{kind.title()}'
        kit.define(f'Wall_Plank{suffix}', 'walls', plank_wall(kind))
        kit.define(f'Wall_Plaster{suffix}', 'walls', plaster_wall(kind))
    kit.define('Wall_Arcade', 'walls', arcade_wall())
