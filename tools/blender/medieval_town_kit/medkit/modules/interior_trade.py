"""Trade, tavern, smithy, bakery, chapel and great-hall interior modules.

Origins follow interior.py: floor pieces sit on z=0 at their footprint centre
with their back at +Y; wall-mounted pieces (Wall_Sconce, Wall_Shield,
Wall_Tapestry) sit on their wall attachment point with the wall at +Y and the
room toward -Y.
"""
import math

from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder
from .carpentry import molded_cornice, recessed_panel_front, shaped_bracket_base
from .interior import _at, _candle


def counter(length=2.0):
    """Carved & panelled shop/tavern bar counter with bracket base, recessed knotwork
    front bays, and overhanging molded walnut bar top; customer side is -Y."""
    b = MeshBuilder()
    h = length / 2
    shaped_bracket_base(b, -h + 0.02, h - 0.02, -0.28, 0.24, h=0.10, foot_w=0.14)
    b.box((-h + 0.04, -0.26, 0.10), (h - 0.04, 0.24, 0.95), 'wood_trim')
    molded_cornice(b, -h, h, -0.32, 0.30, 0.95, h=0.09, overhang=0.04)
    for x in (-h + 0.02, -0.04, h - 0.1):
        b.box((x, -0.29, 0.10), (x + 0.08, -0.24, 0.95), 'wood_trim', tone=0.98)
    if detailed():
        for px0, px1 in ((-h + 0.11, -0.05), (0.05, h - 0.11)):
            # Wide bays take plain fielded panels: knotwork stretched this wide reads as sticks.
            recessed_panel_front(b, px0, px1, 0.16, 0.72, -0.265, depth=0.022, border=0.026, carved=False)
            recessed_panel_front(b, px0, px1, 0.76, 0.91, -0.265, depth=0.018, border=0.02,
                                 carved=True, style='frieze')
        b.box((-h + 0.08, -0.18, 0.46), (h - 0.08, 0.22, 0.51), 'planks')
        for x in (-0.55, -0.25):
            b.lathe([(0.0, 1.04), (0.05, 1.04), (0.045, 1.17), (0.0, 1.17)], 8, 'iron',
                    m=_at(x, -0.04))
        b.lathe([(0.0, 1.04), (0.08, 1.04), (0.1, 1.18), (0.04, 1.28), (0.0, 1.28)], 8,
                'roof_terracotta', m=_at(0.35, 0.04))
        _candle(b, 0.68, -0.02, 1.04, h=0.14)
    return b


def cask_rack():
    """Horizontal tapped ale cask on a timber cradle with brass spigot and drip bucket."""
    b = MeshBuilder()
    for y in (-0.28, 0.22):
        b.box((-0.38, y, 0), (0.38, y + 0.08, 0.42), 'timber')
    for x in (-0.36, 0.28):
        b.box((x, -0.28, 0.08), (x + 0.08, 0.3, 0.16), 'timber')
    cask_m = _at(0, 0, 0.62) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    prof = [(0.0, -0.44), (0.25, -0.44), (0.31, -0.2), (0.33, 0.0), (0.31, 0.2),
            (0.25, 0.44), (0.0, 0.44)]
    b.lathe(prof, 12, 'planks', m=cask_m)
    for y_off, r in ((-0.32, 0.29), (0.32, 0.29)):
        b.lathe([(r, y_off), (r, y_off + 0.05)], 12, 'iron', m=cask_m)
    b.box((-0.025, -0.54, 0.56), (0.025, -0.42, 0.64), 'gold')
    if detailed():
        b.lathe([(0.0, 0.0), (0.11, 0.0), (0.13, 0.22), (0.0, 0.22)], 8, 'planks',
                m=_at(0, -0.52, 0))
    return b


def chandelier():
    """Iron-bound timber wheel chandelier hung on chains from ceiling joists (z=2.85)
    down to z=1.95, carrying six tallow candles."""
    b = MeshBuilder()
    z = 1.98
    top = 2.82
    r = 0.52
    b.lathe([(r - 0.06, z), (r, z), (r, z + 0.08), (r - 0.06, z + 0.08), (r - 0.06, z)],
            12, 'timber', smooth=False)
    b.lathe([(r, z + 0.015), (r + 0.012, z + 0.015), (r + 0.012, z + 0.065), (r, z + 0.065)],
            12, 'iron', smooth=False)
    for a in (0, math.pi / 2):
        c, s = math.cos(a), math.sin(a)
        b.beam((-c * (r - 0.05), -s * (r - 0.05), z + 0.04),
               (c * (r - 0.05), s * (r - 0.05), z + 0.04), (-s, c, 0), (-0.03, 0.03), 0.06, 'timber')
    b.lathe([(0.0, z - 0.06), (0.09, z), (0.09, z + 0.14), (0.0, z + 0.18)], 8, 'iron')
    b.box((-0.018, -0.018, z + 0.16), (0.018, 0.018, top), 'iron')
    if detailed():
        for i in range(4):
            a = i * math.pi / 2 + math.pi / 4
            b.beam((math.cos(a) * (r - 0.04), math.sin(a) * (r - 0.04), z + 0.08),
                   (0, 0, top - 0.12), (-math.sin(a), math.cos(a), 0), (-0.01, 0.01), 0.02, 'iron',
                   bevel=0)
    candles = 6 if detailed() else 4
    for i in range(candles):
        a = 2 * math.pi * i / candles
        _candle(b, math.cos(a) * (r - 0.03), math.sin(a) * (r - 0.03), z + 0.08, h=0.14)
    return b


def wall_sconce():
    """Iron wall bracket holding a glowing candle/torch; backplate sits at y=0 (wall +Y)."""
    b = MeshBuilder()
    b.box((-0.045, -0.02, -0.14), (0.045, 0.01, 0.14), 'iron')
    b.beam((0, 0, 0.0), (0, -0.22, 0.04), (1, 0, 0), (-0.015, 0.015), 0.03, 'iron', bevel=0)
    b.beam((0, 0, -0.11), (0, -0.17, 0.02), (1, 0, 0), (-0.012, 0.012), 0.024, 'iron', bevel=0)
    _candle(b, 0, -0.22, 0.04, h=0.16)
    return b


def wall_shield():
    """Heraldic round shield with iron boss and crossed broadswords (wall at +Y, room -Y)."""
    b = MeshBuilder()
    for sign in (-1, 1):
        b.beam((-sign * 0.48, -0.015, -0.44), (sign * 0.48, -0.015, 0.44), (0, 1, 0),
               (-0.01, 0.01), 0.045, 'iron', bevel=0)
        b.beam((sign * 0.34, -0.02, 0.24), (sign * 0.24, -0.02, 0.34), (0, 1, 0),
               (-0.015, 0.015), 0.03, 'gold', bevel=0)
    m = _at(0, -0.04, 0) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    b.lathe([(0.0, 0.0), (0.36, 0.0), (0.36, 0.03), (0.0, 0.035)], 12, 'cloth_red', m=m)
    b.lathe([(0.32, -0.005), (0.37, -0.005), (0.37, 0.035), (0.32, 0.035)], 12, 'iron', m=m)
    b.lathe([(0.0, 0.03), (0.11, 0.03), (0.07, 0.08), (0.0, 0.09)], 8, 'gold', m=m)
    return b


def wall_tapestry():
    """Woven interior wall hanging on an iron & gilt rod (origin at top centre, wall +Y)."""
    b = MeshBuilder()
    b.beam((-0.52, -0.02, 0.0), (0.52, -0.02, 0.0), (0, 1, 0), (-0.02, 0.02), 0.04, 'iron')
    for x in (-0.54, 0.54):
        b.blob((x, -0.02, 0.0), 0.04, 'gold', subdiv=1, jitter=0)
    shape = [(-0.44, -0.02), (0.44, -0.02), (0.44, -1.35), (0.0, -1.62), (-0.44, -1.35)]
    b.extrude([(u, -0.025, v) for u, v in shape], (0, 0.016, 0), 'cloth_red')
    if detailed():
        inner = [(-0.34, -0.12), (0.34, -0.12), (0.34, -1.25), (0.0, -1.46), (-0.34, -1.25)]
        b.extrude([(u, -0.032, v) for u, v in inner], (0, 0.01, 0), 'cloth_blue')
        crest = [(0.0, -0.45), (0.18, -0.75), (0.0, -1.05), (-0.18, -0.75)]
        b.extrude([(u, -0.038, v) for u, v in crest], (0, 0.01, 0), 'gold')
    return b


def anvil_block():
    """Forged iron horned anvil on an iron-hooped oak stump with hammer and tongs."""
    b = MeshBuilder()
    b.lathe([(0.0, 0.0), (0.28, 0.0), (0.26, 0.48), (0.0, 0.48)], 10, 'bark', smooth=False)
    b.lathe([(0.265, 0.36), (0.275, 0.36), (0.275, 0.41), (0.265, 0.41)], 10, 'iron', smooth=False)
    b.box((-0.18, -0.13, 0.48), (0.18, 0.13, 0.56), 'iron')
    b.box((-0.12, -0.09, 0.56), (0.12, 0.09, 0.72), 'iron')
    b.box((-0.26, -0.11, 0.72), (0.2, 0.11, 0.84), 'iron')
    # Horn tapering to +X
    horn = [(0.2, -0.09, 0.74), (0.2, 0.09, 0.74), (0.42, 0.02, 0.8), (0.42, -0.02, 0.8)]
    b.extrude(horn, (0, 0, 0.09), 'iron')
    if detailed():
        b.box((-0.08, -0.18, 0.84), (0.14, 0.06, 0.87), 'timber')
        b.box((-0.12, -0.04, 0.84), (-0.02, 0.04, 0.91), 'iron')
    return b


def forge_hood():
    """Stone blacksmith's forge hearth with glowing coal bed, chimney hood, side
    bellows and water-quenching trough (back at +Y)."""
    b = MeshBuilder()
    b.box((-0.95, -0.45, 0), (0.45, 0.3, 0.78), 'stone', skip=('-z',))
    b.box((-1.0, -0.5, 0.72), (0.5, 0.3, 0.84), 'stone_dressed')
    b.box((-0.9, 0.12, 0.84), (0.4, 0.3, 1.65), 'stone')
    b.box((-0.98, -0.42, 1.55), (0.48, 0.3, 1.72), 'timber')
    b.box((-0.78, -0.28, 1.72), (0.28, 0.3, 2.75), 'stone')
    b.blob((-0.25, -0.08, 0.86), 0.32, 'glow', subdiv=1, squash=(1.3, 0.9, 0.45), jitter=0.2)
    # Quench trough on the right (+X)
    b.box((0.52, -0.42, 0), (1.02, 0.22, 0.56), 'stone')
    b.box((0.58, -0.36, 0.48), (0.96, 0.16, 0.52), 'water')
    if detailed():
        # Leather & timber bellows on the left (-X)
        b.box((-1.38, -0.28, 0.0), (-0.98, 0.18, 0.68), 'timber')
        b.box((-1.42, -0.25, 0.68), (-0.92, 0.15, 0.75), 'planks')
        b.box((-1.38, -0.22, 0.75), (-0.96, 0.12, 0.96), 'cloth_cream')
        b.box((-1.42, -0.25, 0.96), (-0.92, 0.15, 1.03), 'planks')
        b.box((-0.96, -0.08, 0.82), (-0.72, -0.02, 0.88), 'iron')
    return b


def bake_oven():
    """Domed stone and brick baker's oven with glowing arched firebox, wooden peel
    and fresh loaves on the hearth ledge (back at +Y)."""
    b = MeshBuilder()
    b.box((-0.95, -0.48, 0), (0.95, 0.3, 0.78), 'stone', skip=('-z',))
    b.box((-1.0, -0.54, 0.74), (1.0, 0.3, 0.84), 'stone_dressed')
    b.box((-0.88, -0.32, 0.84), (0.88, 0.3, 1.85), 'stone')
    b.box((-0.55, -0.18, 1.85), (0.55, 0.3, 2.75), 'stone')
    # Arched brick oven mouth and glowing interior
    b.box((-0.46, -0.36, 0.84), (0.46, -0.28, 1.48), 'roof_terracotta')
    b.box((-0.34, -0.38, 0.84), (0.34, -0.26, 1.34), 'glow')
    if detailed():
        for x, y in ((-0.68, -0.42), (-0.48, -0.44), (0.58, -0.42)):
            b.blob((x, y, 0.88), 0.095, 'cloth_cream', subdiv=1, squash=(1.3, 0.95, 0.65),
                   jitter=0.08, seed=int((x + 2) * 10))
        # Wooden baker's peel leaning on the right
        b.beam((0.82, -0.48, 0.0), (0.72, -0.25, 1.75), (1, 0, 0), (-0.02, 0.02), 0.035, 'timber')
        b.box((0.68, -0.52, 0.02), (0.92, -0.44, 0.36), 'planks')
    return b


def stone_altar():
    """Carved dressed-stone sanctuary altar with draped cloth frontal, gilt cross
    and twin candlesticks."""
    b = MeshBuilder()
    b.box((-0.92, -0.42, 0), (0.92, 0.42, 0.14), 'stone_dressed', skip=('-z',))
    b.box((-0.82, -0.34, 0.14), (0.82, 0.34, 0.92), 'stone_dressed')
    b.box((-0.96, -0.44, 0.92), (0.96, 0.44, 1.04), 'stone_dressed')
    # Draped cloth frontal & runner
    b.box((-0.48, -0.45, 0.24), (0.48, 0.45, 1.055), 'cloth_blue')
    b.box((-0.52, -0.455, 0.22), (0.52, -0.35, 0.28), 'gold')
    # Gilt altar cross & chalice
    b.box((-0.08, -0.06, 1.055), (0.08, 0.06, 1.12), 'gold')
    b.box((-0.025, -0.025, 1.12), (0.025, 0.025, 1.54), 'gold')
    b.box((-0.15, -0.025, 1.34), (0.15, 0.025, 1.4), 'gold')
    for x in (-0.62, 0.62):
        _candle(b, x, 0.0, 1.04, h=0.2)
    return b


def lectern():
    """Carved timber reading lectern with open illuminated tome."""
    b = MeshBuilder()
    b.box((-0.26, -0.26, 0), (0.26, 0.26, 0.1), 'timber', skip=('-z',))
    b.lathe([(0.12, 0.1), (0.07, 0.25), (0.06, 0.95), (0.11, 1.05), (0.0, 1.05)], 8, 'timber')
    desk = _at(0, 0, 1.12) @ Matrix.Rotation(math.radians(24), 4, 'X')
    b.box((-0.32, -0.22, 0), (0.32, 0.22, 0.045), 'planks', m=desk)
    b.box((-0.26, -0.16, 0.045), (0.26, 0.16, 0.085), 'cloth_cream', m=desk)
    if detailed():
        b.box((-0.02, -0.18, 0.05), (0.02, 0.18, 0.095), 'gold', m=desk)
    return b


def candelabra():
    """Tall free-standing wrought-iron tripod candelabrum with three glowing candles."""
    b = MeshBuilder()
    for i in range(3):
        a = 2 * math.pi * i / 3
        b.beam((0, 0, 0.18), (math.cos(a) * 0.26, math.sin(a) * 0.26, 0.0),
               (-math.sin(a), math.cos(a), 0), (-0.018, 0.018), 0.035, 'iron', bevel=0)
    b.lathe([(0.04, 0.12), (0.025, 1.28), (0.06, 1.32), (0.0, 1.32)], 6, 'iron')
    b.box((-0.28, -0.02, 1.28), (0.28, 0.02, 1.32), 'iron')
    for x, z in ((-0.24, 1.32), (0.0, 1.38), (0.24, 1.32)):
        _candle(b, x, 0.0, z, h=0.16)
    return b


def weapon_rack():
    """Timber A-frame armoury rack holding iron spears, broadswords and a shield."""
    b = MeshBuilder()
    b.box((-0.65, -0.22, 0), (0.65, 0.22, 0.08), 'timber', skip=('-z',))
    for x in (-0.58, 0.5):
        b.box((x, -0.06, 0.08), (x + 0.08, 0.06, 1.48), 'timber')
    for z in (0.48, 1.12):
        b.box((-0.62, -0.09, z), (0.62, 0.09, z + 0.07), 'timber')
    for x in (-0.42, -0.18, 0.08, 0.34):
        b.lathe([(0.018, 0.08), (0.016, 1.62), (0.0, 1.62)], 6, 'timber', m=_at(x, 0.02))
        b.extrude([(x - 0.04, 0.01, 1.62), (x + 0.04, 0.01, 1.62), (x, 0.01, 1.84)],
                  (0, 0.02, 0), 'iron')
    if detailed():
        for x in (-0.3, 0.22):
            b.box((x - 0.03, -0.12, 0.22), (x + 0.03, -0.09, 1.08), 'iron')
            b.box((x - 0.11, -0.13, 0.88), (x + 0.11, -0.08, 0.92), 'gold')
    return b


def flour_sacks():
    """Cluster of three plump tied linen grain sacks."""
    b = MeshBuilder()
    for x, y, r, h, seed in ((-0.22, 0.05, 0.24, 0.56, 41), (0.2, 0.08, 0.23, 0.52, 42),
                             (0.0, -0.18, 0.21, 0.44, 43)):
        b.blob((x, y, h * 0.48), r, 'cloth_cream', subdiv=1, squash=(1.0, 0.9, 1.15),
               jitter=0.14, seed=seed)
        if detailed():
            b.lathe([(0.0, h * 0.88), (0.07, h * 0.92), (0.09, h * 1.04), (0.0, h * 1.04)], 6,
                    'cloth_cream', m=_at(x, y))
    return b


def alchemist_table():
    """Apothecary and mage workbench with glass alembic flasks, copper still,
    open grimoire and glowing burner."""
    b = MeshBuilder()
    for x in (-0.78, 0.7):
        for y in (-0.36, 0.28):
            b.box((x, y, 0), (x + 0.08, y + 0.08, 0.76), 'timber')
    b.box((-0.78, -0.3, 0.2), (0.78, 0.3, 0.26), 'planks')
    b.box((-0.86, -0.42, 0.76), (0.86, 0.42, 0.83), 'planks')
    # Glass alembic vessels and gilt copper hood
    b.lathe([(0.0, 0.83), (0.11, 0.83), (0.14, 0.96), (0.05, 1.1), (0.06, 1.22), (0.0, 1.22)],
            8, 'glass', m=_at(-0.42, 0.06))
    b.lathe([(0.0, 0.83), (0.08, 0.83), (0.1, 0.94), (0.04, 1.05), (0.0, 1.05)],
            8, 'glass', m=_at(-0.14, -0.08))
    b.lathe([(0.0, 0.83), (0.09, 0.83), (0.09, 0.92), (0.0, 0.92)], 8, 'iron',
            m=_at(0.18, 0.12))
    b.blob((0.18, 0.12, 0.94), 0.045, 'glow', subdiv=1, jitter=0.1)
    b.lathe([(0.0, 0.98), (0.11, 1.0), (0.07, 1.16), (0.0, 1.18)], 8, 'gold',
            m=_at(0.18, 0.12))
    # Open grimoire and candle on the right
    b.box((0.36, -0.24, 0.83), (0.68, 0.06, 0.87), 'cloth_red')
    b.box((0.38, -0.22, 0.87), (0.66, 0.04, 0.89), 'cloth_cream')
    _candle(b, 0.64, 0.2, 0.83, h=0.15)
    return b


def define(kit):
    kit.define('Counter', 'interior', counter())
    kit.define('Cask_Rack', 'interior', cask_rack())
    kit.define('Chandelier', 'interior', chandelier())
    kit.define('Wall_Sconce', 'interior', wall_sconce())
    kit.define('Wall_Shield', 'interior', wall_shield())
    kit.define('Wall_Tapestry', 'interior', wall_tapestry())
    kit.define('Anvil_Block', 'interior', anvil_block())
    kit.define('Forge_Hood', 'interior', forge_hood())
    kit.define('Bake_Oven', 'interior', bake_oven())
    kit.define('Stone_Altar', 'interior', stone_altar())
    kit.define('Lectern', 'interior', lectern())
    kit.define('Candelabra', 'interior', candelabra())
    kit.define('Weapon_Rack', 'interior', weapon_rack())
    kit.define('Flour_Sacks', 'interior', flour_sacks())
    kit.define('Alchemist_Table', 'interior', alchemist_table())
