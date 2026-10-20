"""Goblin swamp-camp outdoor props, bayou trees, skiffs, and playable indoor furniture."""
import math

from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder
from .interior import _at, _candle


def cauldron_fire():
    """Large blackened iron cauldron bubbling over a stone-and-log firepit with stirring paddle."""
    b = MeshBuilder()
    # Stone hearth ring + charred firewood logs
    n_stones = 10 if detailed() else 7
    for i in range(n_stones):
        a = 2 * math.pi * i / n_stones
        sx, sy = math.cos(a) * 0.62, math.sin(a) * 0.62
        b.box((sx - 0.14, sy - 0.12, 0.0), (sx + 0.14, sy + 0.12, 0.16 + (i % 2) * 0.04), 'stone')
    for a in (0.2, 1.25, 2.3):
        c, s = math.cos(a) * 0.48, math.sin(a) * 0.48
        b.beam((-c, -s, 0.08), (c, s, 0.14), (0, 0, 1), (-0.06, 0.06), 0.11, 'bark')
    # Glowing fire & ember bed
    b.blob((0, 0, 0.08), 0.46, 'iron', subdiv=2, squash=(1.0, 1.0, 0.22), jitter=0.3, seed=9)
    if detailed():
        for fx, fy, fh in ((0.0, 0.0, 0.36), (-0.16, 0.12, 0.30), (0.18, -0.1, 0.32)):
            b.lathe([(0.0, 0.12), (0.14, 0.16), (0.06, fh), (0.0, fh + 0.06)], 6, 'glow', m=_at(fx, fy))
    # Iron support legs & pot-bellied cauldron
    for a in (0.4, 2.45, 4.55):
        lx, ly = math.cos(a) * 0.42, math.sin(a) * 0.42
        b.beam((lx, ly, 0.02), (lx * 0.72, ly * 0.72, 0.48), (0, 0, 1), (-0.04, 0.04), 0.08, 'iron')
    prof = [
        (0.0, 0.22), (0.34, 0.22), (0.54, 0.38), (0.58, 0.58),
        (0.50, 0.78), (0.57, 0.86), (0.52, 0.90), (0.46, 0.82), (0.0, 0.80),
    ]
    b.lathe(prof, 12 if detailed() else 8, 'iron')
    # Stew surface: dark broth, lit from below by the fire, not glowing itself
    b.lathe([(0.0, 0.81), (0.47, 0.81), (0.44, 0.84), (0.0, 0.85)], 10 if detailed() else 6, 'hide')
    # Wooden stirring paddle resting across the cauldron lip
    b.beam((-0.62, -0.18, 1.16), (0.22, 0.14, 0.62), (0, 0, 1), (-0.03, 0.03), 0.06, 'planks')
    if detailed():
        for sx in (-0.56, 0.56):
            b.box((sx - 0.04, -0.08, 0.68), (sx + 0.04, 0.08, 0.80), 'iron')
    return b


def drying_rack():
    """Crooked pole drying rack with slanted hide canopy and hanging smoked fish and meat."""
    b = MeshBuilder()
    # Four crooked upright poles
    posts = [
        ((-1.05, -0.42, 0.0), (-0.98, -0.36, 2.28)),
        ((1.05, -0.42, 0.0), (1.00, -0.38, 2.22)),
        ((-1.05, 0.42, 0.0), (-1.02, 0.38, 1.88)),
        ((1.05, 0.42, 0.0), (0.98, 0.36, 1.84)),
    ]
    for p0, p1 in posts:
        b.beam(p0, p1, (0, 1, 0), (-0.055, 0.055), 0.11, 'bark')
    # Horizontal drying poles & side braces
    b.beam((-1.15, -0.36, 2.20), (1.15, -0.38, 2.16), (0, 0, 1), (-0.045, 0.045), 0.09, 'bark')
    b.beam((-1.15, 0.38, 1.82), (1.15, 0.36, 1.78), (0, 0, 1), (-0.045, 0.045), 0.09, 'bark')
    b.beam((-1.10, -0.02, 1.62), (1.10, 0.02, 1.58), (0, 0, 1), (-0.04, 0.04), 0.08, 'bark')
    b.beam((-1.05, -0.22, 1.12), (1.05, -0.18, 1.15), (0, 0, 1), (-0.038, 0.038), 0.075, 'bark')
    for sx in (-1.02, 1.00):
        b.beam((sx, -0.44, 2.22), (sx, 0.46, 1.80), (1, 0, 0), (-0.04, 0.04), 0.08, 'bark')
        b.box((sx - 0.07, -0.44, 1.54), (sx + 0.07, -0.30, 1.68), 'rope')
    # Slanted tattered hide/thatch rooflet overhead
    b.extrude([(-1.22, -0.56, 2.30), (1.22, -0.56, 2.26), (1.22, 0.56, 1.82), (-1.22, 0.56, 1.86)],
              (0, 0, 0.09), 'thatch')
    b.extrude([(-0.85, -0.52, 2.38), (0.75, -0.52, 2.35), (0.68, 0.44, 1.94), (-0.78, 0.44, 1.96)],
              (0, 0, 0.04), 'rope')
    # Hanging smoked fish & cured meat haunches on upper & lower bars
    for fx in (-0.72, -0.36, 0.0, 0.38, 0.74):
        b.box((fx - 0.015, -0.02, 1.46), (fx + 0.015, 0.02, 1.62), 'rope')
        b.lathe([(0.0, 1.08), (0.04, 1.14), (0.09, 1.28), (0.07, 1.42), (0.0, 1.48)],
                6, 'cloth_red', m=_at(fx, 0.0))
        b.box((fx - 0.06, -0.015, 1.00), (fx + 0.06, 0.015, 1.10), 'plaster')
    if detailed():
        for mx in (-0.58, -0.12, 0.42):
            b.box((mx - 0.015, -0.22, 0.96), (mx + 0.015, -0.18, 1.14), 'rope')
            b.lathe([(0.0, 0.56), (0.11, 0.64), (0.13, 0.82), (0.06, 0.96), (0.0, 0.98)],
                    7, 'cloth_red', m=_at(mx, -0.20))
            b.box((mx - 0.025, -0.225, 0.44), (mx + 0.025, -0.175, 0.58), 'plaster')
    return b


def basket_cluster():
    """Cluster of woven reed fish baskets, stave bucket, and rope coil on boardwalk."""
    b = MeshBuilder()
    # Tall bulbous woven reed basket
    b.lathe([(0.0, 0.0), (0.24, 0.0), (0.32, 0.26), (0.28, 0.54), (0.22, 0.68),
             (0.25, 0.74), (0.19, 0.74), (0.0, 0.66)], 10 if detailed() else 7, 'thatch',
            m=_at(-0.28, 0.08))
    b.lathe([(0.29, 0.32), (0.33, 0.32), (0.33, 0.38), (0.29, 0.38)], 8, 'rope',
            m=_at(-0.28, 0.08))
    # Wide shallow catch basket filled with fish
    b.lathe([(0.0, 0.0), (0.30, 0.0), (0.36, 0.18), (0.34, 0.34), (0.28, 0.34), (0.0, 0.24)],
            10 if detailed() else 7, 'thatch', m=_at(0.28, -0.06))
    b.blob((0.28, -0.06, 0.28), 0.22, 'cloth_red', subdiv=1, squash=(1.1, 0.9, 0.45), jitter=0.1, seed=19)
    # Wooden stave bucket + coiled rope
    b.lathe([(0.0, 0.0), (0.16, 0.0), (0.19, 0.36), (0.15, 0.36), (0.0, 0.30)],
            8, 'planks', m=_at(-0.04, -0.34))
    b.lathe([(0.17, 0.24), (0.20, 0.24), (0.20, 0.29), (0.17, 0.29)],
            8, 'iron', m=_at(-0.04, -0.34))
    if detailed():
        b.lathe([(0.10, 0.0), (0.24, 0.0), (0.22, 0.12), (0.10, 0.12)],
                8, 'rope', m=_at(0.32, 0.34))
    return b


def torch_pole():
    """Tall bound-bark torch pole with iron cresset basket and blazing fire."""
    b = MeshBuilder()
    b.beam((0, 0, 0.0), (0.03, -0.02, 2.35), (0, 1, 0), (-0.065, 0.065), 0.13, 'bark')
    for z in (0.35, 1.35, 2.15):
        b.box((-0.08, -0.08, z), (0.08, 0.08, z + 0.10), 'rope')
    # Angled strut
    b.beam((0.0, 0.0, 1.85), (0.22, 0.0, 2.12), (0, 1, 0), (-0.035, 0.035), 0.07, 'bark')
    # Iron pitch basket & bright flame
    b.lathe([(0.0, 2.28), (0.08, 2.30), (0.19, 2.56), (0.15, 2.58), (0.0, 2.42)],
            8, 'iron')
    b.lathe([(0.0, 2.40), (0.15, 2.48), (0.11, 2.74), (0.0, 2.92)], 7, 'glow')
    return b


def goblin_totem():
    """Goblin clan totem pole with a carved mark block, red cloth streamers, and lantern."""
    b = MeshBuilder()
    b.beam((0, 0, 0.0), (-0.03, 0.02, 2.95), (0, 1, 0), (-0.09, 0.09), 0.18, 'bark')
    for z in (0.65, 1.65, 2.45):
        b.box((-0.11, -0.11, z), (0.11, 0.11, z + 0.12), 'rope')
    # Cross-beams & sharpened horn/tusk spikes
    b.beam((-0.58, 0.0, 2.15), (0.58, 0.0, 2.22), (0, 0, 1), (-0.05, 0.05), 0.10, 'bark')
    for sx in (-1, 1):
        b.beam((sx * 0.42, 0.0, 2.18), (sx * 0.62, -0.06, 2.40), (0, 1, 0), (-0.035, 0.035), 0.07, 'bark')
        # Hanging red war-cloth strips
        b.extrude([(sx * 0.48, -0.04, 2.16), (sx * 0.30, -0.04, 2.16),
                   (sx * 0.34, -0.06, 1.38), (sx * 0.44, -0.06, 1.48)], (0, 0.03, 0), 'cloth_red')
    # Carved clan-mark block at the crest: notched bands cut into a squared head
    b.box((-0.16, -0.16, 2.62), (0.16, 0.16, 3.02), 'planks')
    for z in (2.70, 2.84):
        b.box((-0.17, -0.17, z), (0.17, 0.17, z + 0.035), 'shadow', bevel=0)
    # Hanging lantern on side arm
    b.beam((0.0, 0.0, 1.72), (0.48, 0.0, 1.82), (0, 1, 0), (-0.04, 0.04), 0.08, 'bark')
    b.box((0.40, -0.08, 1.42), (0.54, 0.08, 1.66), 'iron')
    b.box((0.42, -0.06, 1.45), (0.52, 0.06, 1.62), 'glow')
    return b


def spike_barricade():
    """Lashed palisade barrier of angled sharpened stakes and a marker post."""
    b = MeshBuilder()
    # Heavy horizontal base & cross logs
    b.beam((-0.95, 0.12, 0.10), (0.95, 0.12, 0.10), (0, 0, 1), (-0.08, 0.08), 0.16, 'bark')
    b.beam((-0.92, -0.04, 0.62), (0.92, -0.04, 0.65), (0, 0, 1), (-0.06, 0.06), 0.12, 'bark')
    # Angled sharpened stakes facing -Y
    stakes = (-0.78, -0.46, -0.15, 0.16, 0.48, 0.78)
    for i, x in enumerate(stakes):
        top_z = 1.28 + (i % 2) * 0.14
        b.beam((x, 0.28, 0.02), (x + (i % 2 - 0.5) * 0.06, -0.38, top_z),
               (1, 0, 0), (-0.055, 0.055), 0.11, 'bark')
        b.box((x - 0.07, -0.12, 0.56), (x + 0.07, 0.04, 0.72), 'rope')
    # Tall central marker post
    b.beam((0.02, 0.10, 0.0), (-0.02, 0.04, 1.82), (0, 1, 0), (-0.045, 0.045), 0.09, 'bark')
    return b


def goblin_skiff():
    """Weathered wooden swamp skiff with plank thwarts, paddle, reed basket, and bow lantern."""
    b = MeshBuilder()
    # Flat-bottomed swamp hull (-1.55..1.55 along X, -0.48..0.48 along Y)
    b.extrude([(-1.25, -0.36, 0.02), (1.25, -0.36, 0.02),
               (1.52, 0.0, 0.06), (1.25, 0.36, 0.02),
               (-1.25, 0.36, 0.02), (-1.52, 0.0, 0.06)], (0, 0, 0.08), 'planks')
    # Flared side gunwales & bow/stern posts
    for sy in (-1, 1):
        b.beam((-1.25, sy * 0.40, 0.22), (1.25, sy * 0.40, 0.22), (0, 0, 1), (-0.04, 0.04), 0.28, 'planks')
        b.beam((-1.25, sy * 0.42, 0.34), (1.25, sy * 0.42, 0.34), (0, 0, 1), (-0.045, 0.045), 0.08, 'bark')
        b.beam((1.22, sy * 0.40, 0.24), (1.58, 0.0, 0.32), (0, 0, 1), (-0.04, 0.04), 0.26, 'bark')
        b.beam((-1.22, sy * 0.40, 0.24), (-1.58, 0.0, 0.32), (0, 0, 1), (-0.04, 0.04), 0.26, 'bark')
    # Plank thwarts (seats)
    for x in (-0.65, 0.05, 0.72):
        b.box((x - 0.14, -0.38, 0.22), (x + 0.14, 0.38, 0.28), 'planks')
    # Wooden oar/paddle resting across gunwale + fish basket + bow lantern pole
    b.beam((-0.85, -0.22, 0.32), (0.65, 0.52, 0.24), (0, 0, 1), (-0.025, 0.025), 0.05, 'planks')
    b.box((0.42, 0.36, 0.20), (0.76, 0.58, 0.28), 'planks')
    b.lathe([(0.0, 0.08), (0.18, 0.08), (0.22, 0.32), (0.16, 0.32), (0.0, 0.26)],
            8, 'thatch', m=_at(-0.28, 0.08))
    b.beam((1.36, 0.0, 0.10), (1.48, 0.0, 1.18), (0, 1, 0), (-0.035, 0.035), 0.07, 'bark')
    b.box((1.40, -0.07, 0.86), (1.54, 0.07, 1.06), 'iron')
    b.box((1.42, -0.05, 0.89), (1.52, 0.05, 1.03), 'glow')
    return b


def swamp_tree(seed=17):
    """Buttressed bald-cypress bayou tree with crooked limbs and hanging Spanish moss."""
    b = MeshBuilder()
    # Flared swamp root buttresses reaching into the water
    b.lathe([(0.52, -0.35), (0.42, 0.15), (0.26, 0.95), (0.20, 2.4), (0.14, 3.8)],
            8, 'bark')
    for i in range(4):
        a = i * math.pi / 2 + 0.35
        c, s = math.cos(a), math.sin(a)
        b.beam((c * 0.58, s * 0.58, -0.30), (c * 0.18, s * 0.18, 1.05),
               (-s, c, 0), (-0.08, 0.08), 0.18, 'bark')
    # Spreading crooked branches
    branches = [
        ((0, 0, 2.3), (1.15, 0.35, 3.25), (-0.85, -0.30, 3.45)),
        ((0, 0, 2.9), (-0.45, 0.95, 3.85), (0.55, -0.85, 3.95)),
    ]
    for p0, p1, p2 in branches:
        b.beam(p0, p1, (0, 0, 1), (-0.06, 0.06), 0.13, 'bark')
        b.beam(p0, p2, (0, 0, 1), (-0.06, 0.06), 0.13, 'bark')
    # Layered flat mossy cypress canopies
    canopies = [
        ((0.0, 0.0, 4.15), 1.35, (1.15, 1.15, 0.55)),
        ((1.10, 0.35, 3.45), 0.95, (1.1, 1.0, 0.50)),
        ((-0.85, -0.30, 3.60), 0.92, (1.0, 1.1, 0.50)),
        ((-0.45, 0.92, 4.00), 0.85, (1.05, 1.0, 0.48)),
        ((0.55, -0.82, 4.05), 0.82, (1.0, 1.05, 0.48)),
    ]
    for i, (c, r, sq) in enumerate(canopies):
        b.blob(c, r, 'foliage', subdiv=2 if detailed() else 1, squash=sq, jitter=0.16, seed=seed * 10 + i)
    # Hanging Spanish-moss drapes below the branches
    moss_pts = [
        (1.05, 0.32, 2.55, 0.75), (-0.82, -0.28, 2.70, 0.70),
        (-0.42, 0.88, 3.05, 0.68), (0.52, -0.78, 3.10, 0.65),
        (0.45, 0.25, 2.95, 0.60), (-0.35, -0.45, 2.85, 0.62),
    ]
    for i, (mx, my, mz, mh) in enumerate(moss_pts):
        b.blob((mx, my, mz), 0.26, 'foliage', subdiv=1, squash=(0.42, 0.42, mh / 0.26),
               jitter=0.14, seed=seed * 30 + i)
    return b


# ---------------------------------------------------------------------------
# Indoor Goblin Modules ('interior' category)
# ---------------------------------------------------------------------------

def goblin_firepit():
    """Indoor stone-ring hearth with bark tripod spit and hanging iron cookpot."""
    b = MeshBuilder()
    for i in range(8):
        a = 2 * math.pi * i / 8
        sx, sy = math.cos(a) * 0.44, math.sin(a) * 0.44
        b.box((sx - 0.11, sy - 0.10, 0.0), (sx + 0.11, sy + 0.10, 0.14), 'stone')
    # Ash and charred wood with a few live coals; the flame itself is the lit part.
    b.blob((0, 0, 0.06), 0.36, 'iron', subdiv=2, squash=(1.0, 1.0, 0.22), jitter=0.3, seed=7)
    for k, (dx, dy) in enumerate(((-0.1, 0.05), (0.08, -0.06), (0.02, 0.12), (-0.04, -0.1))):
        b.blob((dx, dy, 0.12), 0.06, 'glow', subdiv=1, jitter=0.35, seed=60 + k)
    b.lathe([(0.0, 0.10), (0.10, 0.14), (0.05, 0.30), (0.0, 0.36)], 6, 'glow')
    # Three-pole tripod lashed at apex
    for a in (0.3, 2.4, 4.5):
        b.beam((math.cos(a) * 0.48, math.sin(a) * 0.48, 0.0),
               (math.cos(a) * 0.05, math.sin(a) * 0.05, 1.38),
               (0, 0, 1), (-0.035, 0.035), 0.07, 'bark')
    b.box((-0.07, -0.07, 1.18), (0.07, 0.07, 1.30), 'rope')
    b.box((-0.015, -0.015, 0.68), (0.015, 0.015, 1.20), 'iron')
    b.lathe([(0.0, 0.34), (0.18, 0.36), (0.24, 0.52), (0.20, 0.66), (0.0, 0.64)], 8, 'iron')
    b.lathe([(0.0, 0.63), (0.18, 0.63), (0.0, 0.66)], 6, 'water')
    return b


def goblin_nest():
    """Piled swamp-reed and straw sleeping mat with patchwork hide blanket."""
    b = MeshBuilder()
    b.blob((0.0, 0.0, 0.10), 0.62, 'thatch', subdiv=1, squash=(0.78, 1.18, 0.22), jitter=0.10, seed=61)
    b.extrude([(-0.38, -0.56, 0.12), (0.38, -0.52, 0.12),
               (0.42, 0.36, 0.16), (-0.36, 0.40, 0.16)], (0, 0, 0.06), 'hide')
    b.extrude([(-0.30, -0.44, 0.17), (0.26, -0.38, 0.17),
               (0.22, 0.12, 0.19), (-0.32, 0.16, 0.19)], (0, 0, 0.04), 'cloth_red')
    b.beam((-0.34, 0.44, 0.18), (0.34, 0.42, 0.18), (0, 0, 1), (-0.09, 0.09), 0.16, 'hide')
    return b


def bone_throne():
    """Chieftain's lashed log seat of office with a hide cushion and carved crest rail."""
    b = MeshBuilder()
    # Heavy bark legs & armrests
    for sx in (-0.42, 0.42):
        b.beam((sx, -0.36, 0.0), (sx, -0.34, 0.78), (0, 1, 0), (-0.06, 0.06), 0.12, 'bark')
        b.beam((sx, 0.32, 0.0), (sx * 1.08, 0.38, 1.72), (0, 1, 0), (-0.065, 0.065), 0.13, 'bark')
        b.beam((sx, -0.38, 0.72), (sx, 0.36, 0.74), (1, 0, 0), (-0.05, 0.05), 0.10, 'bark')
    # Seat planks & red hide pelt
    b.box((-0.44, -0.38, 0.42), (0.44, 0.36, 0.50), 'planks')
    b.box((-0.38, -0.34, 0.50), (0.38, 0.32, 0.56), 'cloth_red')
    b.extrude([(-0.36, -0.38, 0.52), (0.36, -0.38, 0.52),
               (0.32, -0.40, 1.48), (-0.32, -0.40, 1.48)], (0, 0.05, 0), 'cloth_red',
              m=_at(0, 0.72, 0))
    # Crossbars on the high backrest
    for z in (0.85, 1.25, 1.58):
        b.beam((-0.48, 0.34, z), (0.48, 0.34, z), (0, 0, 1), (-0.045, 0.045), 0.09, 'bark')
    # Turned post caps and a carved crest rail instead of skull trophies
    for sx in (-0.45, 0.45):
        b.lathe([(0.0, 1.70), (0.08, 1.72), (0.09, 1.80), (0.05, 1.86), (0.0, 1.88)], 8, 'bark',
                m=_at(sx, 0.34), smooth=False)
    b.box((-0.30, 0.30, 1.66), (0.30, 0.40, 1.86), 'planks')
    return b


def shaman_altar():
    """Shamanic ritual slab table with horned skull fetish, glowing potion gourds, and candles."""
    b = MeshBuilder()
    for sx in (-0.58, 0.58):
        for sy in (-0.26, 0.26):
            b.beam((sx, sy, 0.0), (sx * 0.92, sy * 0.92, 0.80), (0, 1, 0), (-0.05, 0.05), 0.10, 'bark')
    b.box((-0.72, -0.38, 0.78), (0.72, 0.38, 0.88), 'planks')
    # Draped ritual cloth
    b.box((-0.46, -0.40, 0.42), (0.46, 0.40, 0.90), 'cloth_red')
    # Horned skull fetish on stone plinth
    b.box((-0.16, -0.10, 0.90), (0.16, 0.22, 0.98), 'stone')
    b.blob((0.0, 0.06, 1.12), 0.13, 'plaster', subdiv=1, squash=(0.85, 1.05, 1.1), jitter=0.05, seed=83)
    for sx in (-1, 1):
        b.beam((sx * 0.08, 0.06, 1.16), (sx * 0.28, 0.02, 1.36), (0, 1, 0), (-0.02, 0.02), 0.04, 'plaster')
    # Glowing potion gourds & candles
    for gx, gy in ((-0.42, -0.08), (0.38, -0.10)):
        b.lathe([(0.0, 0.90), (0.08, 0.92), (0.09, 1.04), (0.03, 1.12), (0.0, 1.12)],
                7, 'glow', m=_at(gx, gy))
    _candle(b, -0.54, 0.16, 0.90, h=0.16)
    _candle(b, 0.54, 0.16, 0.90, h=0.14)
    return b


def loot_pile():
    """Pilfered chest spilling gold coins, stacked ale cask, grain sack, and painted shield."""
    b = MeshBuilder()
    # Iron-bound chest + spilled gold mound
    b.box((-0.48, -0.18, 0.0), (0.08, 0.24, 0.38), 'planks')
    b.box((-0.50, -0.20, 0.34), (0.10, 0.26, 0.46), 'iron')
    b.blob((-0.18, -0.22, 0.12), 0.24, 'gold', subdiv=1, squash=(1.2, 0.9, 0.45), jitter=0.08, seed=91)
    # Upright stolen barrel + grain sack + round goblin shield
    b.lathe([(0.0, 0.0), (0.20, 0.0), (0.24, 0.28), (0.20, 0.56), (0.0, 0.56)],
            8, 'planks', m=_at(0.34, 0.12))
    b.blob((-0.38, 0.28, 0.22), 0.22, 'rope', subdiv=1, squash=(0.95, 0.85, 1.15), jitter=0.08, seed=92)
    if detailed():
        sh_m = _at(0.28, -0.20, 0.32) @ Matrix.Rotation(math.radians(68), 4, 'X')
        b.lathe([(0.0, 0.0), (0.28, 0.0), (0.28, 0.04), (0.0, 0.06)], 10, 'cloth_red', m=sh_m)
        b.lathe([(0.0, 0.04), (0.08, 0.04), (0.06, 0.10), (0.0, 0.11)], 8, 'iron', m=sh_m)
    return b


def meat_rack():
    """Indoor butcher A-frame pole rack with hanging meat cuts and log chopping block."""
    b = MeshBuilder()
    for sx in (-0.52, 0.52):
        b.beam((sx, -0.28, 0.0), (sx, 0.0, 1.56), (1, 0, 0), (-0.04, 0.04), 0.08, 'bark')
        b.beam((sx, 0.28, 0.0), (sx, 0.0, 1.56), (1, 0, 0), (-0.04, 0.04), 0.08, 'bark')
    b.beam((-0.62, 0.0, 1.48), (0.62, 0.0, 1.48), (0, 0, 1), (-0.04, 0.04), 0.08, 'bark')
    for mx in (-0.28, 0.08):
        b.lathe([(0.0, 0.78), (0.11, 0.86), (0.13, 1.16), (0.05, 1.36), (0.0, 1.44)],
                7, 'cloth_red', m=_at(mx, 0.0))
        b.box((mx - 0.025, -0.025, 0.62), (mx + 0.025, 0.025, 0.80), 'plaster')
    # Log chopping block & iron cleaver beside rack
    b.lathe([(0.0, 0.0), (0.24, 0.0), (0.22, 0.58), (0.0, 0.58)], 8, 'bark', m=_at(0.42, -0.18))
    b.box((0.36, -0.26, 0.58), (0.52, -0.08, 0.68), 'iron')
    return b


def mud_bank(seed=43):
    """Sloped muddy bayou bank with mossy clumps, river stones, mooring stakes, and swamp reeds."""
    b = MeshBuilder()
    # Low muddy earth bank mound + mossy grass patches
    b.blob((0.0, 0.0, 0.08), 1.05, 'cobble', subdiv=2 if detailed() else 1,
           squash=(1.25, 0.88, 0.24), jitter=0.14, seed=seed)
    b.blob((-0.25, 0.12, 0.20), 0.68, 'grass', subdiv=1,
           squash=(1.15, 0.85, 0.22), jitter=0.12, seed=seed + 3)
    # Half-submerged river boulders along the water edge
    for rx, ry, rr in ((-0.78, -0.35, 0.26), (0.65, -0.28, 0.22), (0.18, -0.48, 0.18)):
        b.blob((rx, ry, 0.10), rr, 'stone', subdiv=1, squash=(1.2, 1.0, 0.65), jitter=0.12, seed=seed + 7)
    # Crooked wooden mooring stakes with rope coil
    b.beam((-0.48, -0.22, -0.05), (-0.54, -0.28, 0.92), (0, 1, 0), (-0.055, 0.055), 0.11, 'bark')
    b.beam((0.42, -0.18, -0.05), (0.48, -0.12, 0.76), (0, 1, 0), (-0.05, 0.05), 0.10, 'bark')
    b.box((-0.60, -0.34, 0.56), (-0.44, -0.18, 0.70), 'rope')
    b.beam((-0.52, -0.25, 0.62), (0.45, -0.15, 0.52), (0, 0, 1), (-0.025, 0.025), 0.05, 'rope')
    # Tall marsh reed & cattail clusters
    reed_clusters = [(-0.62, 0.24), (-0.18, 0.36), (0.52, 0.22), (0.78, -0.05)]
    for cx, cy in reed_clusters:
        for dx, dy, h in ((-0.06, 0.0, 1.05), (0.05, 0.04, 1.24), (0.0, -0.05, 0.92)):
            b.beam((cx + dx, cy + dy, 0.05), (cx + dx * 1.6, cy + dy * 1.6, h),
                   (0, 1, 0), (-0.02, 0.02), 0.04, 'foliage')
        b.box((cx + 0.02, cy + 0.01, 0.96), (cx + 0.08, cy + 0.07, 1.18), 'bark')
    return b


def fishing_net_rack():
    """Crooked bark A-frame rack with draped swamp fishing net, wooden floats, and fish trap."""
    b = MeshBuilder()
    for sx in (-0.92, 0.92):
        b.beam((sx, -0.36, 0.0), (sx * 0.95, -0.04, 1.72), (1, 0, 0), (-0.045, 0.045), 0.09, 'bark')
        b.beam((sx, 0.36, 0.0), (sx * 0.95, 0.04, 1.72), (1, 0, 0), (-0.045, 0.045), 0.09, 'bark')
        b.box((sx * 0.95 - 0.07, -0.09, 1.48), (sx * 0.95 + 0.07, 0.09, 1.62), 'rope')
    b.beam((-1.08, 0.0, 1.64), (1.08, 0.0, 1.60), (0, 0, 1), (-0.045, 0.045), 0.09, 'bark')
    # Draped fishing net sheets & criss-cross cord ribs
    b.extrude([(-0.82, -0.03, 1.60), (0.82, -0.03, 1.56),
               (0.74, -0.22, 0.34), (-0.76, -0.18, 0.38)], (0, 0.03, 0), 'thatch')
    for x in (-0.64, -0.32, 0.0, 0.32, 0.64):
        b.beam((x, -0.04, 1.58), (x * 0.92, -0.22, 0.36), (1, 0, 0), (-0.015, 0.015), 0.03, 'rope')
        b.box((x - 0.04, -0.07, 1.52), (x + 0.04, 0.05, 1.64), 'planks')
    for z in (0.58, 0.92, 1.26):
        b.beam((-0.78, -0.14, z), (0.78, -0.14, z - 0.03), (0, 0, 1), (-0.015, 0.015), 0.03, 'rope')
    # Conical woven reed fish-trap basket at the foot of the rack
    trap_m = _at(0.45, 0.32, 0.22) @ Matrix.Rotation(math.radians(78), 4, 'Y')
    b.lathe([(0.0, 0.0), (0.24, 0.0), (0.18, 0.42), (0.08, 0.78), (0.0, 0.84)],
            8, 'thatch', m=trap_m)
    return b


def define(kit):
    kit.define('Cauldron_Fire', 'props', cauldron_fire())
    kit.define('Drying_Rack', 'props', drying_rack())
    kit.define('Fishing_Net_Rack', 'props', fishing_net_rack())
    kit.define('Basket_Cluster', 'props', basket_cluster())
    kit.define('Torch_Pole', 'props', torch_pole())
    kit.define('Goblin_Totem', 'props', goblin_totem())
    kit.define('Spike_Barricade', 'props', spike_barricade())
    kit.define('Goblin_Skiff', 'props', goblin_skiff())
    kit.define('Mud_Bank', 'nature', mud_bank())
    kit.define('Swamp_Tree', 'nature', swamp_tree())

    kit.define('Goblin_Firepit', 'interior', goblin_firepit())
    kit.define('Goblin_Nest', 'interior', goblin_nest())
    kit.define('Bone_Throne', 'interior', bone_throne())
    kit.define('Shaman_Altar', 'interior', shaman_altar())
    kit.define('Loot_Pile', 'interior', loot_pile())
    kit.define('Meat_Rack', 'interior', meat_rack())

