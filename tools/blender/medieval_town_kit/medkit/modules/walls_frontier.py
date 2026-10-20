"""Frontier wall families on the 2 m x 3 m wall contract (exterior -Y), per the asset bible.

- Orc (Grukmar upland ridge-holds): a dark fieldstone socle to sill height, heavy
  horizontal split-log boarding above, massive posts and lintels, hide-screened windows.
  Low and broad; no skulls, no spikes (regions/grukmar.md "avoid").
- Log (Frostgard): horizontal heavy-hewn logs with moss chinking and crossed log ends
  at the corners, shuttered windows.
- Orc_Porch: the deep protected porch along an orc hall's front, one post per cell.
- Smoke_Vent: a tall louvred vent riding a Frostgard ridge in place of a chimney.
"""
from mathutils import Matrix

from ..config import GRID, HALF_T as T, STORY, detailed
from ..mesh import MeshBuilder
from .walls import DOOR, TIMBER_WINDOW, panel

SOCLE = 1.0          # orc fieldstone socle height (window sills sit on it)
LOG_H = 0.3          # Frostgard log course height
PORCH_DEPTH = 1.9
HOLES = {'plain': None, 'window': TIMBER_WINDOW, 'door': DOOR}


def _spans(x0, x1, hole, z0, z1, pad=0.0):
    """The parts of x0..x1 not blocked by `hole` within the height band z0..z1."""
    if hole is None or z1 <= hole[2] or z0 >= hole[3]:
        return [(x0, x1)]
    hx0, hx1 = hole[0] - pad, hole[1] + pad
    return [(a, b) for a, b in ((x0, min(x1, hx0)), (max(x0, hx1), x1)) if b - a > 0.04]


# -- orc ----------------------------------------------------------------------

def _orc_socle(b, hole):
    """Fieldstone to sill height and the heavy sill beam laid on it."""
    for x0, x1 in _spans(0.0, GRID, hole, 0.0, SOCLE, pad=0.16):
        b.box((x0, -T - 0.09, 0), (x1, -T + 0.04, SOCLE), 'stone_dark', skip=('-x', '+x', '-z'))
        if detailed():
            # A few big proud field stones break the socle's face.
            for k, (sx, sz, w, h) in enumerate(((0.18, 0.08, 0.5, 0.36), (0.95, 0.12, 0.62, 0.32),
                                                (0.55, 0.52, 0.48, 0.34), (1.42, 0.50, 0.46, 0.38))):
                if x0 <= sx and sx + w <= x1:
                    b.box((sx, -T - 0.13 - 0.012 * k, sz), (sx + w, -T - 0.07, sz + h), 'stone_dark')
    # Heavy sill beam laid on the stone.
    for x0, x1 in _spans(0.0, GRID, hole, SOCLE, SOCLE + 0.18, pad=0.16):
        b.box((x0, -T - 0.12, SOCLE), (x1, -T + 0.04, SOCLE + 0.18), 'timber_dark', skip=('-x', '+x'))


def _orc_boards(b, hole, z):
    """Horizontal split-log boards from z to the wall plate, each a little proud of the next."""
    k = 0
    while z < STORY - 0.24 - 0.05:
        z1 = min(z + 0.27, STORY - 0.24)
        for x0, x1 in _spans(0.0, GRID, hole, z, z1, pad=0.14):
            b.box((x0, -T - 0.07 - 0.015 * (k % 2), z + 0.008), (x1, -T + 0.02, z1 - 0.008),
                  'timber_dark', skip=('-x', '+x'))
        z, k = z1, k + 1


def _iron_plate(b, x, z):
    b.box((x - 0.07, -T - 0.165, z - 0.05), (x + 0.07, -T - 0.14, z + 0.05), 'iron', bevel=0)


def orc_wall(kind, socle=True):
    """Ground floors stand on the fieldstone socle; lofts (socle=False) are boarded from a sole plate."""
    b = MeshBuilder()
    hole = HOLES[kind]
    panel(b, 'timber_dark', -T, T, hole, mats={'+y': 'planks'})
    if socle:
        _orc_socle(b, hole)
        sill = SOCLE + 0.18
    else:
        for x0, x1 in _spans(0.0, GRID, hole, 0.0, 0.2, pad=0.16):
            b.box((x0, -T - 0.12, 0), (x1, -T + 0.04, 0.2), 'timber_dark', skip=('-x', '+x'))
        sill = 0.2
    _orc_boards(b, hole, sill)
    b.box((0, -T - 0.14, STORY - 0.24), (GRID, -T + 0.04, STORY), 'timber_dark', skip=('-x', '+x'))
    if kind == 'plain':
        b.box((0.9, -T - 0.14, sill), (1.1, -T + 0.02, STORY - 0.24), 'timber_dark')
        if detailed():
            _iron_plate(b, 1.0, STORY - 0.4)
    elif kind == 'window':
        x0, x1, z0, z1 = TIMBER_WINDOW
        # Hide screen stretched in a massive frame, two stout bars, a deep lintel.
        b.box((x0, -0.03, z0), (x1, 0.01, z1), 'hide', skip=('-x', '+x', '-z', '+z'))
        for jx0, jx1 in ((x0 - 0.14, x0), (x1, x1 + 0.14)):
            b.box((jx0, -T - 0.12, z0 - 0.06), (jx1, T, z1), 'timber_dark')
        b.box((x0 - 0.26, -T - 0.17, z1), (x1 + 0.26, T, z1 + 0.2), 'timber_dark')
        b.box((x0 - 0.16, -T - 0.16, z0 - 0.12), (x1 + 0.16, T, z0), 'timber_dark')
        for bx in (x0 + 0.26, x1 - 0.26):
            b.box((bx - 0.035, -T - 0.05, z0), (bx + 0.035, -T + 0.03, z1), 'timber_dark')
        if detailed():
            _iron_plate(b, x0 - 0.18, z1 + 0.1)
            _iron_plate(b, x1 + 0.18, z1 + 0.1)
    else:
        x0, x1, _, z1 = DOOR
        for jx0, jx1 in ((x0 - 0.2, x0), (x1, x1 + 0.2)):
            b.box((jx0, -T - 0.16, 0), (jx1, T + 0.02, z1), 'timber_dark')
        # A whole log for a lintel, running well past the jambs.
        lintel = Matrix.Translation((x0 - 0.42, -T - 0.08, z1 + 0.15)) @ Matrix.Rotation(1.5708, 4, 'Y')
        b.lathe([(0.0, 0.0), (0.17, 0.0), (0.18, x1 - x0 + 0.84), (0.0, x1 - x0 + 0.84)], 10,
                'timber_dark', m=lintel)
        b.box((x0 - 0.22, -T - 0.4, -0.08), (x1 + 0.22, -T + 0.02, 0.06), 'stone_dark', skip=('-z',))
        if detailed():
            for x in (x0 - 0.1, x1 + 0.1):
                _iron_plate(b, x, z1 - 0.3)
                _iron_plate(b, x, 0.5)
    return b


def orc_corner(socle=True):
    """Dark stone pier to sill height, then a round post as thick as a trunk (lofts: post only)."""
    b = MeshBuilder()
    foot = SOCLE + 0.06 if socle else 0.0
    if socle:
        b.box((-T - 0.13, -T - 0.13, 0), (T + 0.02, T + 0.02, foot), 'stone_dark', skip=('-z',))
    post = Matrix.Translation((-0.05, -0.05, 0))
    b.lathe([(0.0, foot), (0.23, foot), (0.21, STORY), (0.0, STORY)], 10, 'timber_dark', m=post)
    if detailed():
        b.lathe([(0.245, foot + 0.08), (0.245, foot + 0.2)], 10, 'iron', m=post, smooth=False)
    return b


PORCH_POSTS = {False: (1.0,), True: (0.15, GRID - 0.15)}


def orc_porch(door=False):
    """One cell of the deep front porch: a post on a stone pad, a plate beam, knee braces and a
    lean-to of reed thatch from the wall plate. Over the door two posts frame the way in.
    Origin at the wall base, exterior -Y."""
    b = MeshBuilder()
    py = -PORCH_DEPTH + 0.25
    for x in PORCH_POSTS[door]:
        b.box((x - 0.24, py - 0.24, -0.7), (x + 0.24, py + 0.24, 0.05), 'stone_dark', skip=('-z',))
        b.lathe([(0.0, 0.05), (0.17, 0.05), (0.15, 2.32), (0.0, 2.32)], 10, 'timber_dark',
                m=Matrix.Translation((x, py, 0)))
        for s in ((1,) if x < 0.5 else (-1,) if x > 1.5 else (-1, 1)):
            b.beam((x, py, 1.72), (x + s * 0.62, py, 2.32), (0, 1, 0), (-0.06, 0.06), 0.11, 'timber_dark')
    b.box((0, py - 0.13, 2.3), (GRID, py + 0.13, 2.54), 'timber_dark', skip=('-x', '+x'))
    eave, wall = (0, -PORCH_DEPTH - 0.45, 2.38), (0, -T, STORY - 0.18)
    b.beam(wall, eave, (1, 0, 0), (0, GRID), 0.3, 'timber_dark',
           mats={'+z': 'thatch_reed', '-z': 'planks'}, tone=1.0, bevel=0)
    for x in (0.35, 1.65):
        b.beam((x, -T, STORY - 0.42), (x, py - 0.1, 2.5), (1, 0, 0), (-0.05, 0.05), 0.12, 'timber_dark')
    return b


# -- Frostgard logs -------------------------------------------------------------

def log_wall(kind):
    b = MeshBuilder()
    hole = HOLES[kind]
    # Moss chinking behind the logs shows in the seams.
    panel(b, 'sod', -0.06, 0.06, hole)
    for k in range(int(STORY / LOG_H)):
        z0, z1 = k * LOG_H, (k + 1) * LOG_H
        for x0, x1 in _spans(0.0, GRID, hole, z0, z1):
            b.box((x0, -T - 0.04, z0 + 0.008), (x1, T + 0.04, z1 - 0.008), 'log')
    if kind == 'window':
        x0, x1, z0, z1 = TIMBER_WINDOW
        f = 0.1
        for lo, hi in (((x0, -T - 0.08, z0), (x0 + f, T, z1)), ((x1 - f, -T - 0.08, z0), (x1, T, z1)),
                       ((x0 - 0.06, -T - 0.12, z0 - 0.08), (x1 + 0.06, T, z0 + 0.04)),
                       ((x0 - 0.1, -T - 0.12, z1 - 0.04), (x1 + 0.1, T, z1 + 0.14))):
            b.box(lo, hi, 'timber')
        b.box((x0 + f, -0.02, z0 + 0.04), (x1 - f, 0.02, z1 - 0.04), 'glass_clear',
              skip=('-x', '+x', '-z', '+z'))
        b.box(((x0 + x1) / 2 - 0.025, -0.05, z0), ((x0 + x1) / 2 + 0.025, 0.0, z1), 'timber', bevel=0)
        # Plain board shutters folded back against the logs.
        w = (x1 - x0) / 2
        for sx0 in (x0 - w - 0.02, x1 + 0.02):
            b.box((sx0, -T - 0.1, z0 + 0.02), (sx0 + w, -T - 0.06, z1 - 0.02), 'planks')
            if detailed():
                b.beam((sx0 + 0.04, -T - 0.11, z0 + 0.2), (sx0 + w - 0.04, -T - 0.11, z1 - 0.2),
                       (0, 1, 0), (-0.02, 0.0), 0.07, 'planks')
    elif kind == 'door':
        x0, x1, _, z1 = DOOR
        for jx0, jx1 in ((x0 - 0.06, x0 + 0.1), (x1 - 0.1, x1 + 0.06)):
            b.box((jx0, -T - 0.1, 0), (jx1, T + 0.02, z1), 'timber')
        b.box((x0 - 0.3, -T - 0.12, z1), (x1 + 0.3, T + 0.04, z1 + 0.3), 'log')
        b.box((x0 - 0.2, -T - 0.42, -0.1), (x1 + 0.2, -T + 0.02, 0.08), 'stone_granite', skip=('-z',))
    return b


def log_corner():
    """Crossed log ends: each course runs one way past the corner by a hand's width."""
    b = MeshBuilder()
    reach = -T - 0.32
    for k in range(int(STORY / LOG_H)):
        z0, z1 = k * LOG_H + 0.008, (k + 1) * LOG_H - 0.008
        if k % 2 == 0:
            b.box((reach, -T - 0.05, z0), (0.0, T + 0.05, z1), 'log')
        else:
            b.box((-T - 0.05, reach, z0), (T + 0.05, 0.0, z1), 'log')
    return b


def smoke_vent():
    """Louvred vent box straddling a ridge: origin on the ridge line at the apex."""
    b = MeshBuilder()
    s = 0.42
    b.box((-s + 0.06, -s + 0.06, -1.0), (s - 0.06, s - 0.06, 1.35), 'shadow', skip=('-z',))
    for x in (-s, s - 0.12):
        for y in (-s, s - 0.12):
            b.box((x, y, -1.0), (x + 0.12, y + 0.12, 1.4), 'timber', skip=('-z',))
    for k in range(5):
        z = 0.12 + k * 0.24
        for lo, hi in (((-s, -s - 0.04, z), (s, -s + 0.06, z + 0.13)),
                       ((-s, s - 0.06, z), (s, s + 0.04, z + 0.13)),
                       ((-s - 0.04, -s + 0.12, z), (-s + 0.06, s - 0.12, z + 0.13)),
                       ((s - 0.06, -s + 0.12, z), (s + 0.04, s - 0.12, z + 0.13))):
            b.box(lo, hi, 'planks', bevel=0)
    b.box((-s - 0.04, -s - 0.04, -0.2), (s + 0.04, s + 0.04, 0.1), 'timber')
    for side in (-1, 1):
        b.beam((-s - 0.22, side * (s + 0.32), 1.32), (-s - 0.22, 0.0, 1.9), (1, 0, 0),
               (0, 2 * s + 0.44), 0.07, 'roof', tone=1.0, bevel=0)
    b.lathe([(0.0, 0.0), (0.07, 0.0), (0.07, 2 * s + 0.5), (0.0, 2 * s + 0.5)], 6, 'timber',
            m=Matrix.Translation((-s - 0.25, 0, 1.92)) @ Matrix.Rotation(1.5708, 4, 'Y'))
    return b


def define(kit):
    for kind in ('plain', 'window', 'door'):
        suffix = '' if kind == 'plain' else f'_{kind.title()}'
        kit.define(f'Wall_Orc{suffix}', 'walls', orc_wall(kind))
        kit.define(f'Wall_Orc_Loft{suffix}', 'walls', orc_wall(kind, socle=False))
        kit.define(f'Wall_Log{suffix}', 'walls', log_wall(kind))
    kit.define('Corner_Orc', 'walls', orc_corner())
    kit.define('Corner_Orc_Loft', 'walls', orc_corner(socle=False))
    kit.define('Corner_Log', 'walls', log_corner())
    kit.define('Orc_Porch', 'walls', orc_porch())
    kit.define('Orc_Porch_Door', 'walls', orc_porch(door=True))
    kit.define('Smoke_Vent', 'roofs', smoke_vent())
