"""Grukmar orc ridge palisade (regions/grukmar.md, 04 `orc-ridge-palisade`): upright log wall
segments on a dark stone pad with a wall-walk inside, and a single gate
tower on a stone footing. Sharpened log tops only; no skulls or trophies.

Palisade_Orc follows the wall contract: spans X 0..GRID, exterior -Y.
Gate_Tower_Orc stands on a TOWER x TOWER footprint from the origin; the gate passage runs
through it along Y and its sides meet palisade segments on the line y = TOWER / 2.
"""
from mathutils import Matrix

from ..config import GRID, detailed
from ..mesh import MeshBuilder
from .roofs import pyramid
from .roofs_regional import PYRAMID_THATCH_PITCH
from .walls import _merge

LOGS = 7
LOG_R = 0.145
PALISADE_H = 3.7
WALK_Z, WALK_Y = 2.4, 1.05   # wall-walk deck height and its inner edge
TOWER = 4.0
PAD_H = 1.2
CHAMBER = (4.0, 6.4)     # floor and wall top of the tower's fighting chamber
ROOF_Z = 7.1


def _log(b, x, y, z0, z1, r=LOG_R, point=0.42, mat='timber_dark'):
    b.lathe([(0.0, z0), (r, z0), (r * 0.94, z1), (0.0, z1 + point)], 8, mat,
            m=Matrix.Translation((x, y, 0)))


def _height(i, salt=0):
    """Deterministic ragged tops: no two neighbouring logs the same height."""
    return PALISADE_H + ((i * 37 + salt * 11) % 7 - 3) * 0.06


def palisade():
    b = MeshBuilder()
    b.box((0, -0.42, -0.4), (GRID, 0.42, 0.42), 'stone_dark', skip=('-x', '+x', '-z'))
    step = GRID / LOGS
    for i in range(LOGS):
        _log(b, (i + 0.5) * step, 0.0, 0.3, _height(i))
    for z in (1.25, 2.85):
        b.box((0, LOG_R, z), (GRID, LOG_R + 0.13, z + 0.17), 'timber_dark', skip=('-x', '+x'))
    # Wall-walk on the inside: a plank deck on joists into the wall and a post row,
    # low enough below the log tops to leave a breast-high parapet (the hill-fort reference).
    y0, y1 = LOG_R + 0.13, WALK_Y
    b.box((0, y0, WALK_Z - 0.1), (GRID, y1 + 0.1, WALK_Z), 'planks', skip=('-x', '+x'))
    b.box((0, y1 - 0.06, WALK_Z - 0.32), (GRID, y1 + 0.1, WALK_Z - 0.1), 'timber_dark', skip=('-x', '+x'))
    b.box((0.92, y1 - 0.08, -0.3), (1.08, y1 + 0.08, WALK_Z - 0.32), 'timber_dark', skip=('-z',))
    b.box((0.8, y1 - 0.2, -0.3), (1.2, y1 + 0.2, 0.12), 'stone_dark')
    for s in (-1, 1):
        b.beam((1.0, y1, WALK_Z - 1.0), (1.0 + s * 0.6, y1, WALK_Z - 0.33), (0, 1, 0), (-0.05, 0.05), 0.1,
               'timber_dark')
    if detailed():
        for x in (0.3, 1.7):
            b.box((x - 0.08, -LOG_R - 0.02, 2.2), (x + 0.08, LOG_R + 0.14, 2.3), 'iron', bevel=0)
    return b


def gate_tower():
    b = MeshBuilder()
    t = TOWER
    for x0, x1 in ((0.0, 0.85), (t - 0.85, t)):
        b.box((x0, 0, -0.4), (x1, t, PAD_H), 'stone_dark', skip=('-z',))
    posts = ((0.42, 0.42), (t - 0.42, 0.42), (0.42, t - 0.42), (t - 0.42, t - 0.42))
    for x, y in posts:
        b.lathe([(0.0, PAD_H), (0.24, PAD_H), (0.22, ROOF_Z), (0.0, ROOF_Z)], 10, 'timber_dark',
                m=Matrix.Translation((x, y, 0)))
    # Gate lintel log and the chamber floor beams.
    for y in (0.42, t - 0.42):
        b.lathe([(0.0, 0.0), (0.2, 0.0), (0.2, t), (0.0, t)], 10, 'timber_dark',
                m=Matrix.Translation((0, y, CHAMBER[0] - 0.3)) @ Matrix.Rotation(1.5708, 4, 'Y'))
    b.box((0.2, 0.2, CHAMBER[0] - 0.12), (t - 0.2, t - 0.2, CHAMBER[0]), 'planks')
    # Chamber walls: horizontal split logs on all four sides, slits left between some.
    z, k = CHAMBER[0], 0
    while z < CHAMBER[1] - 0.05:
        z1 = min(z + 0.3, CHAMBER[1])
        slit = k in (3, 4)
        for lo, hi in (((0.2, 0.08, z), (t - 0.2, 0.34, z1)), ((0.2, t - 0.34, z), (t - 0.2, t - 0.08, z1)),
                       ((0.08, 0.2, z), (0.34, t - 0.2, z1)), ((t - 0.34, 0.2, z), (t - 0.08, t - 0.2, z1))):
            if slit and abs(hi[0] - lo[0]) > 1.0:
                mid = (lo[0] + hi[0]) / 2
                b.box(lo, (mid - 0.09, hi[1], hi[2]), 'timber_dark')
                b.box((mid + 0.09, lo[1], lo[2]), hi, 'timber_dark')
            elif slit:
                mid = (lo[1] + hi[1]) / 2
                b.box(lo, (hi[0], mid - 0.09, hi[2]), 'timber_dark')
                b.box((lo[0], mid + 0.09, lo[2]), hi, 'timber_dark')
            else:
                b.box(lo, hi, 'timber_dark')
        z, k = z1, k + 1
    b.box((0.0, 0.0, CHAMBER[1]), (t, t, CHAMBER[1] + 0.16), 'timber_dark', skip=('-z',))
    # Knee braces under the roof plate, open lookout between.
    for x, y in posts:
        for dx, dy in ((0.0, 1.0 if y < 1 else -1.0), (1.0 if x < 1 else -1.0, 0.0)):
            b.beam((x, y, ROOF_Z - 0.75), (x + dx * 0.7, y + dy * 0.7, ROOF_Z - 0.1), (dy, dx, 0),
                   (-0.05, 0.05), 0.1, 'timber_dark')
    b.box((0.1, 0.1, ROOF_Z - 0.1), (t - 0.1, t - 0.1, ROOF_Z + 0.08), 'timber_dark')
    roof = pyramid(t, PYRAMID_THATCH_PITCH, mat='thatch_reed', finial=False)
    roof.translate((0, 0, ROOF_Z))
    _merge(b, roof)
    # Plank gate leaves standing open outward from the passage.
    for hx, s in ((0.85, 1), (t - 0.85, -1)):
        x0, x1 = (hx, hx + 0.12) if s > 0 else (hx - 0.12, hx)
        b.box((x0, -1.15, 0.0), (x1, 0.0, PAD_H + 2.1), 'planks')
        for zb in (0.45, 1.6, 2.75):
            b.box((x0 - 0.035, -1.1, zb), (x1 + 0.035, -0.05, zb + 0.16), 'timber_dark', bevel=0)
    if detailed():
        b.box((0.85, 0.2, -0.02), (t - 0.85, t - 0.2, 0.04), 'stone_dark', skip=('-z',))
    return b


def define(kit):
    kit.define('Palisade_Orc', 'defences', palisade())
    kit.define('Gate_Tower_Orc', 'defences', gate_tower())
