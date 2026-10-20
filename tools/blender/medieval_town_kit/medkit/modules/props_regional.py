"""Regional dressing for the frontier and mountain families (asset bible regions/*.md).

- Tree_Pine / Tree_Pine_Tall: tiered conifers for Frostgard and the high passes.
- Boulder_Cluster, Cliff_Granite: bare granite for Frostgard yards and Stonehold rock faces.
- Ore_Crane: Stonehold's integrated ore crane on a granite plinth.
- Windbreak_Wall: Frostgard windbreak (stone footing, hewn rails), edge contract X 0..GRID.
- Fire_Post, Brazier_Pillar: street fire for orc/Frostgard lanes and Stonehold squares
  (the game lights them virtually; no scene lights in the game).
- War_Banner: a Grukmar clan banner of weathered red cloth on a spear-tipped pole.
- Clan_Hearth: the orc square's stone-ringed fire; Rune_Stone: a Frostgard oath stone.
"""
import math
import random

from mathutils import Matrix

from ..config import GRID, detailed
from ..mesh import MeshBuilder


def _at(x, y, z=0.0):
    return Matrix.Translation((x, y, z))


def pine(height=6.0, seed=5):
    """Bark trunk under five drooping cone tiers that narrow toward a spire tip."""
    b = MeshBuilder()
    rng = random.Random(seed)
    b.lathe([(0.2, 0.0), (0.14, height * 0.4), (0.05, height * 0.85)], 7, 'bark')
    tiers = 5
    for k in range(tiers):
        t = k / (tiers - 1)
        base = height * (0.2 + 0.6 * t)
        r = 1.55 * (1 - 0.72 * t) * rng.uniform(0.92, 1.06)
        tall = height * 0.3 * (1 - 0.35 * t)
        b.lathe([(0.0, base + 0.25), (r * 0.82, base + 0.02), (r, base - 0.18), (r * 0.9, base - 0.26),
                 (0.0, base + tall)][::-1], 9 if detailed() else 6, 'foliage_pine',
                phase=rng.uniform(0, 1), smooth=False)
    return b


def boulders(seed=7):
    b = MeshBuilder()
    rng = random.Random(seed)
    for i, (x, y, r) in enumerate(((0, 0, 0.75), (0.85, 0.35, 0.48), (-0.7, 0.45, 0.4), (0.3, -0.7, 0.32))):
        b.blob((x, y, r * 0.45), r, 'stone_granite', subdiv=2, squash=(1.1, 0.95, 0.7),
               jitter=0.22, seed=seed * 7 + i + rng.randint(0, 9))
    return b


def cliff(width=4.0, height=9.0, seed=11):
    """Weathered granite crag: big rounded masses stacked and stepping back as they rise.
    Spans X 0..width, face toward -Y, footprint about 3 m deep."""
    b = MeshBuilder()
    rng = random.Random(seed)
    z, k = 0.0, 0
    while z < height:
        r = rng.uniform(1.7, 2.3) * max(0.5, 1 - 0.1 * k)
        for i in range(3):
            x = width * (0.1 + 0.4 * i) + rng.uniform(-0.3, 0.3)
            b.blob((x, 1.2 + 0.3 * k, z + r * 0.5), r, 'stone_granite', subdiv=2,
                   squash=(1.6, 1.1, 0.75), jitter=0.22, seed=seed * 31 + k * 7 + i)
        z += r * 1.05
        k += 1
    return b


def ore_crane():
    """Granite plinth, timber mast and raking jib, iron pulley, rope and an ore skip."""
    b = MeshBuilder()
    b.box((-0.85, -0.85, -0.3), (0.85, 0.85, 1.2), 'stone_granite', skip=('-z',))
    b.box((-0.95, -0.95, 1.2), (0.95, 0.95, 1.36), 'stone_basalt')
    b.box((-0.18, -0.18, 1.36), (0.18, 0.18, 6.6), 'timber_dark')
    for z in (2.2, 4.2, 6.1):
        b.box((-0.21, -0.21, z), (0.21, 0.21, z + 0.12), 'iron', bevel=0)
    tip = (0.0, -3.9, 5.4)
    b.beam((0.0, -0.1, 2.6), tip, (1, 0, 0), (-0.11, 0.11), 0.2, 'timber_dark')
    b.beam((0.0, -0.1, 6.5), tip, (1, 0, 0), (-0.05, 0.05), 0.07, 'iron')
    b.beam((0.0, 0.1, 6.5), (0.0, 1.6, 1.36), (1, 0, 0), (-0.04, 0.04), 0.06, 'rope')
    b.lathe([(0.0, -0.06), (0.24, -0.06), (0.24, 0.06), (0.0, 0.06)], 10, 'iron',
            m=_at(*tip) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    b.box((-0.02, tip[1] - 0.02, 2.25), (0.02, tip[1] + 0.02, tip[2] - 0.2), 'rope', bevel=0)
    b.lathe([(0.0, 1.5), (0.36, 1.5), (0.44, 2.22), (0.4, 2.25), (0.0, 2.1)], 10, 'iron',
            m=_at(0, tip[1]))
    if detailed():
        b.blob((0, tip[1], 2.18), 0.32, 'stone_dark', subdiv=1, squash=(1, 1, 0.45), jitter=0.3, seed=3)
    return b


def windbreak():
    """Rugged stone footing with hewn rails between posts; X 0..GRID, centred on y=0."""
    b = MeshBuilder()
    b.box((0, -0.32, -0.2), (GRID, 0.32, 0.6), 'stone_granite', skip=('-x', '+x', '-z'))
    b.box((0, -0.36, 0.6), (GRID, 0.36, 0.7), 'stone_dark', skip=('-x', '+x'))
    b.box((0.0, -0.13, 0.7), (0.24, 0.13, 2.05), 'log')
    for z in (0.78, 1.1, 1.42, 1.74):
        b.box((0.24, -0.1, z), (GRID, 0.1, z + 0.28), 'log', skip=('-x', '+x'))
    return b


def fire_post():
    b = MeshBuilder()
    b.box((-0.09, -0.09, -0.3), (0.09, 0.09, 2.3), 'timber_dark', skip=('-z',))
    b.beam((0.0, 0.0, 1.7), (0.0, -0.32, 2.2), (1, 0, 0), (-0.04, 0.04), 0.08, 'timber_dark')
    b.lathe([(0.0, 2.2), (0.08, 2.22), (0.2, 2.5), (0.16, 2.52), (0.0, 2.36)], 8, 'iron', m=_at(0, -0.36))
    b.blob((0, -0.36, 2.55), 0.16, 'glow', subdiv=1, squash=(1, 1, 1.3), jitter=0.25, seed=17)
    return b


def brazier_pillar():
    b = MeshBuilder()
    b.box((-0.3, -0.3, 0), (0.3, 0.3, 1.0), 'stone_granite', skip=('-z',))
    b.box((-0.36, -0.36, 1.0), (0.36, 0.36, 1.12), 'stone_basalt')
    b.lathe([(0.0, 1.12), (0.18, 1.14), (0.36, 1.38), (0.32, 1.42), (0.0, 1.28)], 10, 'iron')
    b.blob((0, 0, 1.42), 0.24, 'glow', subdiv=1, squash=(1.05, 1.05, 0.7), jitter=0.22, seed=29)
    return b


def war_banner(seed=3):
    """Clan banner: a long weathered red cloth on a crossbar, ragged notched tail, spear tip."""
    b = MeshBuilder()
    b.lathe([(0.07, -0.4), (0.06, 4.6)], 6, 'timber_dark')
    b.lathe([(0.0, 4.6), (0.06, 4.6), (0.0, 5.0)], 4, 'iron')
    b.box((-0.62, -0.05, 4.18), (0.62, 0.05, 4.28), 'timber_dark')
    tail = [(-0.56, -0.02, 4.2), (0.56, -0.02, 4.2), (0.5, -0.02, 2.1), (0.0, -0.02, 2.55), (-0.5, -0.02, 2.0)]
    b.extrude(tail[:3] + [tail[3]], (0, 0.03, 0), 'cloth_red')
    b.extrude([tail[0], tail[3], tail[4]], (0, 0.03, 0), 'cloth_red')
    b.box((-0.58, -0.04, 3.92), (0.58, 0.06, 4.0), 'rope', bevel=0)
    return b


def clan_hearth():
    """Ring of dark field stones round a log fire: the heart of an orc square."""
    b = MeshBuilder()
    for i in range(10):
        a = 2 * math.pi * i / 10
        b.blob((1.0 * math.cos(a), 1.0 * math.sin(a), 0.16), 0.28, 'stone_dark', subdiv=1,
               squash=(1, 0.9, 0.7), jitter=0.25, seed=40 + i)
    for i in range(4):
        a = math.pi * i / 4
        b.beam((-0.6 * math.cos(a), -0.6 * math.sin(a), 0.12), (0.6 * math.cos(a), 0.6 * math.sin(a), 0.4),
               (0, 0, 1), (-0.07, 0.07), 0.14, 'bark')
    b.blob((0, 0, 0.5), 0.42, 'glow', subdiv=1, squash=(1, 1, 1.2), jitter=0.3, seed=7)
    return b


def rune_stone(seed=9):
    """Tall unadorned granite oath stone, slightly leaning, set in a low cairn."""
    b = MeshBuilder()
    b.box((-0.38, -0.2, -0.4), (0.38, 0.2, 2.5), 'stone_granite', m=Matrix.Rotation(0.05, 4, 'Y'))
    for i in range(5):
        a = 2 * math.pi * i / 5
        b.blob((0.6 * math.cos(a), 0.45 * math.sin(a), 0.1), 0.22, 'stone_dark', subdiv=1, jitter=0.3,
               squash=(1, 1, 0.6), seed=seed + i)
    return b


def define(kit):
    kit.define('Tree_Pine', 'nature', pine())
    kit.define('Tree_Pine_Tall', 'nature', pine(8.5, seed=8))
    kit.define('Boulder_Cluster', 'nature', boulders())
    kit.define('Cliff_Granite', 'nature', cliff())
    kit.define('Ore_Crane', 'props', ore_crane())
    kit.define('Windbreak_Wall', 'props', windbreak())
    kit.define('Fire_Post', 'props', fire_post())
    kit.define('Brazier_Pillar', 'props', brazier_pillar())
    kit.define('War_Banner', 'props', war_banner())
    kit.define('Clan_Hearth', 'props', clan_hearth())
    kit.define('Rune_Stone', 'props', rune_stone())
