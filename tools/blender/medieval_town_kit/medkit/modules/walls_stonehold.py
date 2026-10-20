"""Stonehold (Vondari mountain holds, regions/stonehold.md) masonry: massive granite courses
with charcoal basalt dressings, stout squared arches with shouldered lintels, flat parapeted
roofs with heavy chimney stacks, and a vaulted gate passage behind an iron portcullis.

Walls keep the 2 m x 3 m contract but thicken outward by 8 cm; the corner pilaster
covers the difference. Avoid (05-differentiation-matrix.md): no statue on every door,
no floating anvils, no golden steampunk; bronze stays dull and only on gates and drains.
"""
import math

from ..config import GRID, HALF_T as T, STORY, detailed
from ..mesh import MeshBuilder
from .walls import DOOR, INTERIOR, panel
from .walls_regional import ARCADE

GRANITE_WINDOW = (0.72, 1.28, 0.95, 2.15)
THICK = 0.08            # extra outward wall thickness
FACE = -T - THICK
GATE_W, GATE_D, GATE_H = 6.0, 4.0, 7.0
PASSAGE = (1.6, 4.4, 3.6)   # x0, x1, height of the squared opening


def _cut(x0, x1, gap):
    """x0..x1 minus the gap (g0, g1), as a list of spans."""
    if gap is None:
        return [(x0, x1)]
    return [(a, b) for a, b in ((x0, min(x1, gap[0])), (max(x0, gap[1]), x1)) if b - a > 0.04]


def arch_ring(b, cx, z, r0, r1, y0, y1, mat, count=9):
    """Half-ring of voussoirs in the XZ plane, centred on (cx, z), from y0 to y1."""
    for i in range(count):
        a0, a1 = math.pi * i / count + 0.01, math.pi * (i + 1) / count - 0.01
        pts = [(cx + r * math.cos(a), y0, z + r * math.sin(a)) for r, a in ((r0, a0), (r1, a0), (r1, a1), (r0, a1))]
        b.extrude(pts, (0, y1 - y0, 0), mat)


def _bands(b, gap):
    """Basalt base course and a storey band: the horizontal weight of a hold facade."""
    for x0, x1 in _cut(0.0, GRID, gap):
        b.box((x0, FACE - 0.08, 0), (x1, FACE + 0.06, 0.5), 'stone_basalt', skip=('-x', '+x', '-z'))
        b.box((x0, FACE - 0.1, 0.5), (x1, FACE + 0.06, 0.6), 'stone_basalt', skip=('-x', '+x'))
    b.box((0, FACE - 0.1, STORY - 0.2), (GRID, FACE + 0.06, STORY), 'stone_basalt', skip=('-x', '+x'))


def _squared_head(b, x0, x1, z1, reach, depth, shoulder):
    """Massive lintel over a squared opening with corbelled shoulders under its ends."""
    b.box((x0 - reach, FACE - depth, z1), (x1 + reach, FACE + 0.08, z1 + 0.44), 'stone_basalt')
    for sx0, sx1 in ((x0, x0 + shoulder), (x1 - shoulder, x1)):
        b.box((sx0, FACE - depth + 0.04, z1 - shoulder * 0.8), (sx1, FACE + 0.02, z1), 'stone_basalt')


def granite_wall(kind):
    b = MeshBuilder()
    hole = {'plain': None, 'window': GRANITE_WINDOW, 'door': DOOR}[kind]
    panel(b, 'stone_granite', FACE, T, hole, INTERIOR)
    _bands(b, (DOOR[0] - 0.22, DOOR[1] + 0.22) if kind == 'door' else None)
    if kind == 'window':
        x0, x1, z0, z1 = hole
        for jx0, jx1 in ((x0 - 0.16, x0), (x1, x1 + 0.16)):
            b.box((jx0, FACE - 0.08, z0), (jx1, FACE + 0.1, z1), 'stone_basalt')
        _squared_head(b, x0, x1, z1, 0.3, 0.14, 0.1)
        b.box((x0 - 0.22, FACE - 0.18, z0 - 0.14), (x1 + 0.22, FACE + 0.1, z0), 'stone_basalt')
        b.box((x0, 0.02, z0), (x1, 0.05, z1), 'glass', skip=('-x', '+x', '-z', '+z'))
        # Forged grille set in the reveal.
        for bx in (x0 + 0.18, x1 - 0.18):
            b.box((bx - 0.018, FACE + 0.02, z0), (bx + 0.018, FACE + 0.06, z1), 'iron', bevel=0)
        for bz in (z0 + 0.42, z1 - 0.42):
            b.box((x0, FACE + 0.02, bz - 0.018), (x1, FACE + 0.06, bz + 0.018), 'iron', bevel=0)
    elif kind == 'door':
        x0, x1, _, z1 = DOOR
        for jx0, jx1 in ((x0 - 0.22, x0), (x1, x1 + 0.22)):
            b.box((jx0, FACE - 0.12, 0), (jx1, FACE + 0.1, z1), 'stone_basalt')
        _squared_head(b, x0, x1, z1, 0.42, 0.18, 0.16)
        b.box((x0 - 0.3, FACE - 0.45, -0.1), (x1 + 0.3, FACE + 0.02, 0.1), 'stone_basalt', skip=('-z',))
        if detailed():
            b.box((x0, FACE - 0.3, 0.1), (x1, FACE - 0.02, 0.115), 'bronze', bevel=0)
    return b


def granite_arcade():
    """Walk-through squared portal (ARCADE opening) with a short vault behind the lintel."""
    b = MeshBuilder()
    x0, x1, _, z1 = ARCADE
    deep = FACE - 0.55
    for px0, px1 in ((0.0, x0), (x1, GRID)):
        b.box((px0, FACE, 0), (px1, T, STORY), 'stone_granite', mats=INTERIOR, skip=('-z',))
        b.box((px0, deep, 0), (px1, FACE + 0.02, z1 + 0.6), 'stone_basalt', skip=('-z',))
    b.box((x0, deep - 0.04, z1), (x1, deep + 0.22, z1 + 0.6), 'stone_basalt')
    b.box((-0.04, deep - 0.06, z1 + 0.6), (GRID + 0.04, FACE + 0.02, z1 + 0.76), 'stone_basalt')
    b.box((x0, deep + 0.22, z1 + 0.42), (x1, T, STORY), 'stone_granite', mats=INTERIOR)
    b.box((x0, T - 0.1, z1), (x1, T, z1 + 0.42), 'stone_granite', mats=INTERIOR)
    b.box((0, FACE - 0.1, STORY - 0.2), (GRID, FACE + 0.06, STORY), 'stone_basalt', skip=('-x', '+x'))
    # Segmental vault soffit between the piers, seen when walking through.
    cx, half, rise, seg = (x0 + x1) / 2, (x1 - x0) / 2, 0.36, 8
    r = (half ** 2 + rise ** 2) / (2 * rise)
    base = z1 + rise - r
    a_max = math.asin(half / r)
    pts = [(cx + r * math.sin(-a_max + 2 * a_max * i / seg), base + r * math.cos(-a_max + 2 * a_max * i / seg))
           for i in range(seg + 1)]
    for (xa, za), (xb, zb) in zip(pts, pts[1:]):
        b.poly([(xa, deep + 0.22, za), (xb, deep + 0.22, zb), (xb, T - 0.1, zb), (xa, T - 0.1, za)],
               'stone_basalt', outward=(cx - (xa + xb) / 2, 0, -1))
    return b


def granite_corner():
    """Basalt pilaster with a battered foot and a cap, bossed courses every half metre."""
    b = MeshBuilder()
    o = FACE - 0.16
    b.box((o, o, 0), (T + 0.02, T + 0.02, STORY), 'stone_basalt', skip=('-z',))
    b.box((o - 0.08, o - 0.08, 0), (T + 0.02, T + 0.02, 0.6), 'stone_basalt', skip=('-z',))
    b.box((o - 0.06, o - 0.06, STORY - 0.22), (T + 0.02, T + 0.02, STORY), 'stone_basalt')
    if detailed():
        for k in range(1, 5):
            z = 0.6 + k * 0.5 - 0.42
            b.box((o - 0.035, o - 0.035, z), (o + 0.42, o + 0.42, z + 0.36), 'stone_basalt')
    return b


def flat_roof():
    """One cell of flagged roof deck on the wall tops."""
    b = MeshBuilder()
    b.box((0, 0, -0.06), (GRID, GRID, 0.14), 'stone_granite', mats={'+z': 'stone_ashlar'},
          skip=('-x', '+x', '-y', '+y'))
    return b


def parapet():
    """Corbelled cornice and solid parapet over one wall cell (exterior -Y), bronze drain spout."""
    b = MeshBuilder()
    b.box((0, FACE - 0.16, 0), (GRID, T, 0.24), 'stone_basalt', skip=('-x', '+x'))
    b.box((0, FACE - 0.04, 0.24), (GRID, FACE + 0.42, 1.0), 'stone_granite', skip=('-x', '+x'))
    b.box((0, FACE - 0.1, 1.0), (GRID, FACE + 0.48, 1.14), 'stone_basalt', skip=('-x', '+x'))
    if detailed():
        for i in range(4):
            cx = 0.25 + i * 0.5
            b.box((cx - 0.09, FACE - 0.14, -0.3), (cx + 0.09, FACE + 0.02, 0.0), 'stone_basalt')
        b.box((0.93, FACE - 0.5, 0.26), (1.07, FACE - 0.04, 0.38), 'bronze')
    return b


def parapet_corner():
    b = MeshBuilder()
    o = FACE - 0.2
    b.box((o, o, 0), (T, T, 0.24), 'stone_basalt')
    b.box((o + 0.04, o + 0.04, 0.24), (FACE + 0.56, FACE + 0.56, 1.32), 'stone_granite')
    b.box((o - 0.02, o - 0.02, 1.32), (FACE + 0.62, FACE + 0.62, 1.48), 'stone_basalt')
    return b


def chimney_stack():
    """Broad stack of three flues with basalt banding; origin at the roof deck."""
    b = MeshBuilder()
    b.box((-0.72, -0.4, -0.1), (0.72, 0.4, 2.6), 'stone_granite', skip=('-z',))
    b.box((-0.78, -0.46, 1.2), (0.78, 0.46, 1.36), 'stone_basalt')
    b.box((-0.84, -0.52, 2.6), (0.84, 0.52, 2.78), 'stone_basalt')
    for x in (-0.46, 0.0, 0.46):
        b.box((x - 0.17, -0.17, 2.78), (x + 0.17, 0.17, 3.12), 'stone_basalt')
        b.box((x - 0.1, -0.1, 3.0), (x + 0.1, 0.1, 3.125), 'shadow', bevel=0, skip=('-z',))
    return b


def gate():
    """Hold gate: two granite piers, a squared opening with shouldered lintel, a barrel-vaulted
    passage with basalt ribs, a half-raised portcullis and bronze inner leaves folded back."""
    b = MeshBuilder()
    x0, x1, oh = PASSAGE
    cx, r, spring = (x0 + x1) / 2, (x1 - x0) / 2, 3.1
    front, back = 0.7, GATE_D - 0.6
    for px0, px1 in ((0.0, x0), (x1, GATE_W)):
        b.box((px0, 0, 0), (px1, GATE_D, GATE_H), 'stone_granite', skip=('-z',))
    b.box((x0, 0, oh), (x1, front, GATE_H), 'stone_granite', skip=('-x', '+x'))
    b.box((x0, back, oh), (x1, GATE_D, GATE_H), 'stone_granite', skip=('-x', '+x'))
    b.box((x0, front, spring + r + 0.1), (x1, back, GATE_H), 'stone_granite', skip=('-x', '+x', '+z'))
    seg = 12
    for i in range(seg):
        a0, a1 = math.pi * i / seg, math.pi * (i + 1) / seg
        p0 = (cx + r * math.cos(a0), spring + r * math.sin(a0))
        p1 = (cx + r * math.cos(a1), spring + r * math.sin(a1))
        mid = (a0 + a1) / 2
        b.poly([(p0[0], front, p0[1]), (p1[0], front, p1[1]), (p1[0], back, p1[1]), (p0[0], back, p0[1])],
               'stone_granite', outward=(-math.cos(mid), 0, -math.sin(mid)))
    for y in (front, (front + back) / 2 - 0.13, back - 0.26):
        arch_ring(b, cx, spring, r - 0.16, r, y, y + 0.26, 'stone_basalt')
    b.box((x0, 0, 0), (x1, GATE_D, 0.04), 'cobble', skip=('-z',))
    # Front dressings: proud jambs, shouldered lintel, base course, storey bands.
    for jx0, jx1 in ((x0 - 0.36, x0), (x1, x1 + 0.36)):
        b.box((jx0, -0.14, 0), (jx1, 0.04, oh), 'stone_basalt', skip=('-z',))
    b.box((x0 - 0.6, -0.2, oh), (x1 + 0.6, 0.04, oh + 0.8), 'stone_basalt')
    for sx0, sx1 in ((x0, x0 + 0.32), (x1 - 0.32, x1)):
        b.box((sx0, -0.12, oh - 0.32), (sx1, 0.04, oh), 'stone_basalt')
    for px0, px1 in ((0.0, x0 - 0.36), (x1 + 0.36, GATE_W)):
        b.box((px0, -0.18, 0), (px1, 0.02, 0.8), 'stone_basalt', skip=('-z',))
        b.box((px0, -0.1, 2.4), (px1, 0.02, 2.62), 'stone_basalt')
    b.box((0, -0.1, 5.3), (GATE_W, 0.02, 5.52), 'stone_basalt')
    # Corbel table and parapet along front and back.
    for y0, y1, out in ((-0.32, 0.0, -1), (GATE_D, GATE_D + 0.32, 1)):
        b.box((0, y0, GATE_H - 0.28), (GATE_W, y1, GATE_H), 'stone_basalt')
        lo, hi = (y0, y0 + 0.5) if out < 0 else (y1 - 0.5, y1)
        b.box((0, lo, GATE_H), (GATE_W, hi, GATE_H + 1.0), 'stone_granite')
        b.box((-0.04, lo - 0.05, GATE_H + 1.0), (GATE_W + 0.04, hi + 0.05, GATE_H + 1.14), 'stone_basalt')
        if detailed():
            for i in range(12):
                c = 0.25 + i * 0.5
                b.box((c - 0.09, y0 if out < 0 else y1 - 0.14, GATE_H - 0.58),
                      (c + 0.09, y0 + 0.14 if out < 0 else y1, GATE_H - 0.28), 'stone_basalt')
            for x in (1.0, 3.0, 5.0):
                face = lo - 0.002 if out < 0 else hi + 0.002
                b.box((x - 0.06, face - 0.01, GATE_H + 0.25), (x + 0.06, face + 0.01, GATE_H + 0.8),
                      'shadow', bevel=0)
    b.box((0, -0.32 + 0.5, GATE_H), (GATE_W, GATE_D + 0.32 - 0.5, GATE_H + 0.1), 'stone_ashlar',
          skip=('-z',))
    # Portcullis, half raised into its slot in the lintel.
    for i in range(11):
        x = x0 + 0.14 + i * (x1 - x0 - 0.28) / 10
        b.box((x - 0.035, 0.31, 2.5), (x + 0.035, 0.39, oh + 0.05), 'iron', bevel=0)
        if detailed():
            b.box((x - 0.02, 0.33, 2.32), (x + 0.02, 0.37, 2.5), 'iron', bevel=0)
    for z in (2.62, 3.1):
        b.box((x0, 0.3, z), (x1, 0.4, z + 0.08), 'iron', bevel=0)
    # Bronze-plated inner leaves folded back against the passage walls.
    for lx0, lx1, bx0, bx1 in ((x0, x0 + 0.14, x0 + 0.14, x0 + 0.18), (x1 - 0.14, x1, x1 - 0.18, x1 - 0.14)):
        b.box((lx0, back - 1.5, 0.04), (lx1, back - 0.04, 3.0), 'bronze')
        for z in (0.4, 1.5, 2.6):
            b.box((bx0, back - 1.5, z), (bx1, back - 0.04, z + 0.1), 'iron', bevel=0)
    return b


def define(kit):
    for kind in ('plain', 'window', 'door'):
        suffix = '' if kind == 'plain' else f'_{kind.title()}'
        kit.define(f'Wall_Granite{suffix}', 'walls', granite_wall(kind))
    kit.define('Wall_Granite_Arcade', 'walls', granite_arcade())
    kit.define('Corner_Granite', 'walls', granite_corner())
    kit.define('Roof_Flat_Granite', 'roofs', flat_roof())
    kit.define('Parapet_Granite', 'roofs', parapet())
    kit.define('Parapet_Granite_Corner', 'roofs', parapet_corner())
    kit.define('Chimney_Granite', 'roofs', chimney_stack())
    kit.define('Gate_Stonehold', 'defences', gate())
