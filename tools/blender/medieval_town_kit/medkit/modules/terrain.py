"""Ground modules: tiles, terrace retaining walls, coping, railings, fences,
external stone stairs and the arch bridge.

Edge modules (walls, coping, railings) span local X 0..GRID with the drop on
the -Y side; +Y is the higher terrace.
"""
import math

from ..config import GRID, TERRACE
from ..mesh import MeshBuilder

COPING_H = 0.18


def tile(mat):
    b = MeshBuilder()
    b.poly([(0, 0, 0), (GRID, 0, 0), (GRID, GRID, 0), (0, GRID, 0)], mat, outward=(0, 0, 1))
    return b


def paving():
    """2 m paving slab centred on its origin; its top sits 5 cm proud of the ground."""
    b = MeshBuilder()
    b.box((-1, -1, -0.3), (1, 1, 0.05), 'stone', mats={'+z': 'cobble'}, skip=('-z',))
    return b


def terrace_wall(pillar=False):
    b = MeshBuilder()
    b.box((0, 0, 0), (GRID, 0.5, TERRACE), 'stone', skip=('+y', '-z', '+z', '-x', '+x'))
    if pillar:
        b.box((0.72, -0.16, 0), (1.28, 0.0, TERRACE), 'stone', skip=('-z', '+y'))
    return b


def coping():
    b = MeshBuilder()
    b.box((0, -0.08, 0), (GRID, 0.45, COPING_H), 'stone', skip=('-z',))
    return b


def railing():
    b = MeshBuilder()
    y0, y1 = 0.12, 0.26
    b.box((0, y0 - 0.02, 0), (0.12, y1 + 0.02, 1.0), 'timber')
    b.box((0, y0, 0.88), (GRID, y1, 0.98), 'timber')
    b.box((0, y0 + 0.02, 0.12), (GRID, y1 - 0.02, 0.2), 'timber')
    for i in range(1, 6):
        x = i * GRID / 6
        b.box((x - 0.025, y0 + 0.03, 0.2), (x + 0.025, y1 - 0.03, 0.88), 'timber')
    return b


def fence():
    b = MeshBuilder()
    for x in (0.0, 1.0):
        b.box((x, 0.14, 0), (x + 0.1, 0.24, 0.95), 'timber')
    for z in (0.35, 0.72):
        b.box((0, 0.16, z), (GRID, 0.22, z + 0.08), 'planks')
    return b


def stone_stairs(units):
    """Climbs +Y; units terrace levels over (units + 1) cells."""
    b = MeshBuilder()
    rise = units * TERRACE
    run = (units + 1) * GRID
    steps = units * 10
    tread, step_h = run / steps, rise / steps
    for i in range(steps):
        b.box((0, i * tread, 0), (GRID, run, (i + 1) * step_h), 'stone',
              skip=('-z', '+y', '-x', '+x'))
    for x in (-0.25, GRID):
        b.extrude([(x, 0, 0), (x, run, 0), (x, run, rise + 0.3), (x, 0, 0.35)], (0.25, 0, 0),
                  'stone')
    return b


def arch_bridge(span=4.0, depth=2.0, height=3.0, radius=1.4, spring=1.5, seg=14):
    """Deck crosses along X on top (z=height); the arch passage runs along Y below it."""
    b = MeshBuilder()
    cx = span / 2
    corner = math.atan2(height - spring, cx)
    angles = sorted(set([math.pi * i / seg for i in range(seg + 1)] + [corner, math.pi - corner]))

    def ray(a):
        c, s = math.cos(a), math.sin(a)
        t = min(cx / abs(c) if abs(c) > 1e-6 else 1e9, (height - spring) / s if s > 1e-6 else 1e9)
        return c, s, t

    for y, out in ((0.0, (0, -1, 0)), (depth, (0, 1, 0))):
        for a0, a1 in zip(angles, angles[1:]):
            c0, s0, t0 = ray(a0)
            c1, s1, t1 = ray(a1)
            pts = [(cx + radius * c0, y, spring + radius * s0), (cx + radius * c1, y, spring + radius * s1),
                   (cx + t1 * c1, y, spring + t1 * s1), (cx + t0 * c0, y, spring + t0 * s0)]
            b.poly(pts, 'stone', outward=out)
        for x0, x1 in ((0, cx - radius), (cx + radius, span)):
            b.poly([(x0, y, 0), (x1, y, 0), (x1, y, spring), (x0, y, spring)], 'stone', outward=out)
    for a0, a1 in zip(angles, angles[1:]):
        am = (a0 + a1) / 2
        p0 = (cx + radius * math.cos(a0), spring + radius * math.sin(a0))
        p1 = (cx + radius * math.cos(a1), spring + radius * math.sin(a1))
        b.poly([(p0[0], 0, p0[1]), (p1[0], 0, p1[1]), (p1[0], depth, p1[1]), (p0[0], depth, p0[1])],
               'stone', outward=(-math.cos(am), 0, -math.sin(am)))
    for x, out in ((cx - radius, (1, 0, 0)), (cx + radius, (-1, 0, 0))):
        b.poly([(x, 0, 0), (x, depth, 0), (x, depth, spring), (x, 0, spring)], 'stone', outward=out)
    b.poly([(0, 0, height), (span, 0, height), (span, depth, height), (0, depth, height)], 'cobble',
           outward=(0, 0, 1))
    for y0, y1 in ((-0.08, 0.0), (depth, depth + 0.08)):
        b.box((cx - 0.2, y0, spring + radius - 0.08), (cx + 0.2, y1, spring + radius + 0.4), 'stone')
    return b


def define(kit):
    kit.define('Tile_Cobble', 'terrain', tile('cobble'))
    kit.define('Tile_Grass', 'terrain', tile('grass'))
    kit.define('Paving_Stone', 'terrain', paving())
    kit.define('Terrace_Wall', 'terrain', terrace_wall())
    kit.define('Terrace_Wall_Pillar', 'terrain', terrace_wall(pillar=True))
    kit.define('Terrace_Coping', 'terrain', coping())
    kit.define('Railing_Wood', 'terrain', railing())
    kit.define('Fence_Wood', 'terrain', fence())
    kit.define('Stairs_Stone_1', 'terrain', stone_stairs(1))
    kit.define('Stairs_Stone_2', 'terrain', stone_stairs(2))
    kit.define('Arch_Bridge', 'terrain', arch_bridge())
