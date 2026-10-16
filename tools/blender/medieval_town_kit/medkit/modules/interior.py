"""Interior furniture. Origins on the floor at the footprint centre; the "back"
of wall-hugging pieces (hearth, bed headboard, shelf, bookcase, wardrobe) is +Y.
"""
import math

from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder


def _at(x, y, z=0.0):
    return Matrix.Translation((x, y, z))


def _candle(b, x, y, z, h=0.14):
    """Iron drip dish, tallow candle, and warm flame tip."""
    b.lathe([(0.0, z), (0.045, z), (0.05, z + 0.018), (0.0, z + 0.018)], 8, 'iron', m=_at(x, y))
    b.lathe([(0.018, z + 0.018), (0.016, z + 0.018 + h), (0.0, z + 0.018 + h)], 6, 'cloth_cream',
            m=_at(x, y))
    b.blob((x, y, z + 0.035 + h), 0.022, 'glow', subdiv=1, squash=(0.7, 0.7, 1.6), jitter=0.05)


def table():
    """Trestle table: four planks over two trestles joined by a stretcher, dressed
    with trencher plates, pewter tankards, a loaf and a table candle."""
    b = MeshBuilder()
    if not detailed():
        b.box((-0.9, -0.5, 0.72), (0.9, 0.5, 0.8), 'planks')
        for x in (-0.65, 0.57):
            b.box((x, -0.06, 0), (x + 0.08, 0.06, 0.72), 'timber')
        return b
    for i in range(4):
        y0 = -0.5 + i * 0.25 + 0.006
        b.box((-0.9, y0, 0.74), (0.9, y0 + 0.238, 0.8), 'planks', tone=0.92 + 0.08 * (i % 2))
    for x in (-0.65, 0.57):
        b.box((x, -0.06, 0.08), (x + 0.08, 0.06, 0.74), 'timber')
        b.box((x - 0.01, -0.42, 0), (x + 0.09, 0.42, 0.08), 'timber')
        b.box((x - 0.01, -0.44, 0.68), (x + 0.09, 0.44, 0.74), 'timber')
    b.box((-0.65, -0.03, 0.3), (0.65, 0.03, 0.36), 'timber')
    # Trenchers, tankards, bread loaf and candle on the tabletop (z = 0.8)
    for tx, ty in ((-0.48, -0.24), (0.42, -0.24), (-0.42, 0.24), (0.48, 0.24)):
        b.lathe([(0.0, 0.8), (0.11, 0.8), (0.12, 0.82), (0.09, 0.82), (0.0, 0.808)], 8, 'planks',
                m=_at(tx, ty))
    for mx, my in ((-0.26, -0.22), (0.62, 0.2)):
        b.lathe([(0.0, 0.8), (0.048, 0.8), (0.042, 0.92), (0.0, 0.92)], 8, 'iron', m=_at(mx, my))
    b.blob((-0.08, 0.05, 0.83), 0.09, 'cloth_cream', subdiv=1, squash=(1.4, 0.9, 0.65), jitter=0.08,
           seed=19)
    _candle(b, 0.16, -0.04, 0.8, h=0.13)
    return b


def bench(length=1.6):
    """A thick plank on two pairs of splayed legs."""
    b = MeshBuilder()
    h = length / 2
    b.box((-h, -0.17, 0.42), (h, 0.17, 0.48), 'planks')
    for x in (-h + 0.12, h - 0.18):
        if detailed():
            for y0, y1 in ((-0.17, -0.11), (0.11, 0.17)):
                b.beam((x + 0.03, y0 * 1.35, 0), (x + 0.03, (y0 + y1) / 2 * 0.6, 0.42), (1, 0, 0),
                       (-0.03, 0.03), 0.06, 'timber')
        else:
            b.box((x, -0.15, 0), (x + 0.06, 0.15, 0.42), 'timber')
    return b


def pew(length=1.7):
    """High-backed timber bench with shaped side cheeks for chapels and guildhalls."""
    b = MeshBuilder()
    h = length / 2
    b.box((-h + 0.06, -0.22, 0.42), (h - 0.06, 0.18, 0.48), 'planks')
    b.box((-h + 0.06, 0.12, 0.48), (h - 0.06, 0.18, 0.96), 'planks')
    b.box((-h, 0.11, 0.94), (h, 0.2, 1.01), 'timber')
    for x in (-h, h - 0.07):
        b.box((x, -0.24, 0), (x + 0.07, 0.21, 0.56), 'timber')
        b.box((x, 0.06, 0.56), (x + 0.07, 0.21, 1.04), 'timber')
    if detailed():
        b.box((-h + 0.07, -0.18, 0.08), (h - 0.07, -0.06, 0.13), 'timber')
    return b


def stool():
    b = MeshBuilder()
    b.box((-0.17, -0.17, 0.42), (0.17, 0.17, 0.46), 'planks')
    for x, y in ((-0.12, -0.1), (0.08, -0.1), (-0.02, 0.1)):
        b.box((x - 0.025, y - 0.025, 0), (x + 0.025, y + 0.025, 0.42), 'timber')
    return b


def bed():
    """Posted bed: rails and boards on four corner posts, tall at the head (+Y),
    a straw tick under linen, a bolster and a wool blanket turned back."""
    b = MeshBuilder()
    if detailed():
        b.box((-0.44, -0.94, 0.18), (0.44, 0.94, 0.34), 'timber')
        for x, y, h in ((-0.5, 0.91, 1.15), (0.41, 0.91, 1.15), (-0.5, -1.0, 0.65), (0.41, -1.0, 0.65)):
            b.box((x, y, 0), (x + 0.09, y + 0.09, h), 'timber')
            b.box((x - 0.015, y - 0.015, h), (x + 0.105, y + 0.105, h + 0.05), 'timber')
        b.box((-0.41, 0.93, 0.34), (0.41, 0.98, 1.02), 'planks')
        b.box((-0.46, 0.91, 1.02), (0.46, 1.0, 1.09), 'timber')
        b.box((-0.41, -0.98, 0.34), (0.41, -0.93, 0.58), 'planks')
    else:
        b.box((-0.5, -1.0, 0), (0.5, 1.0, 0.32), 'timber')
        b.box((-0.52, 0.95, 0), (0.52, 1.05, 0.95), 'timber')
    b.box((-0.43, -0.92, 0.34), (0.43, 0.92, 0.5), 'cloth_cream')
    b.box((-0.45, -0.93, 0.44), (0.45, 0.18, 0.56), 'cloth_red')
    b.box((-0.45, 0.12, 0.5), (0.45, 0.28, 0.58), 'cloth_cream')
    b.blob((0, 0.65, 0.58), 0.3, 'cloth_cream', subdiv=1, squash=(1.2, 0.6, 0.3), jitter=0.05)
    if detailed():
        b.box((-0.46, -0.94, 0.46), (0.46, -0.58, 0.59), 'cloth_blue')
    return b


def hearth():
    """Stone fireplace with hearthstone apron, jambs, heavy timber mantel, iron
    andirons, split logs, glowing embers/flame, and a suspended iron cauldron."""
    b = MeshBuilder()
    b.box((-0.92, -0.55, 0), (0.92, 0.3, 0.12), 'stone_dressed', skip=('-z',))
    b.box((-0.85, -0.35, 0.12), (-0.5, 0.3, 1.25), 'stone')
    b.box((0.5, -0.35, 0.12), (0.85, 0.3, 1.25), 'stone')
    b.box((-0.5, 0.1, 0.12), (0.5, 0.3, 1.25), 'stone')
    b.box((-0.98, -0.46, 1.25), (0.98, 0.3, 1.44), 'timber')
    b.box((-0.72, -0.3, 1.44), (0.72, 0.3, 2.65), 'stone')
    b.box((-0.78, -0.35, 2.55), (0.78, 0.3, 2.68), 'stone_dressed')
    b.blob((0, -0.08, 0.24), 0.24, 'glow', subdiv=1, squash=(1.35, 0.85, 0.75), jitter=0.22)
    if detailed():
        for x in (-0.32, 0.32):
            b.box((x - 0.03, -0.32, 0.12), (x + 0.03, 0.05, 0.22), 'iron')
            b.box((x - 0.03, -0.32, 0.22), (x + 0.03, -0.26, 0.42), 'iron')
        for dx, dz, ang in ((-0.12, 0.2, 0.18), (0.12, 0.2, -0.2), (0.0, 0.28, 0.05)):
            m = _at(dx, -0.08, dz) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y')
            b.lathe([(0.0, -0.26), (0.06, -0.26), (0.06, 0.26), (0.0, 0.26)], 6, 'bark', m=m,
                    smooth=False)
        # Hanging iron cauldron over the fire
        b.lathe([(0.0, 0.46), (0.14, 0.48), (0.2, 0.62), (0.17, 0.76), (0.19, 0.79), (0.0, 0.79)],
                10, 'iron', m=_at(0, -0.08))
        b.box((-0.015, -0.095, 0.79), (0.015, -0.065, 1.25), 'iron')
        _candle(b, -0.72, -0.22, 1.44, h=0.14)
        _candle(b, 0.72, -0.22, 1.44, h=0.14)
    return b


def shelf():
    """Tall timber dresser with three shelves stocked with flagons, terracotta jars
    and folded linen."""
    b = MeshBuilder()
    for x in (-0.6, 0.54):
        b.box((x, -0.16, 0), (x + 0.06, 0.16, 1.85), 'timber')
    b.box((-0.6, 0.12, 0.1), (0.6, 0.16, 1.82), 'planks')
    for z in (0.3, 0.85, 1.4, 1.82):
        b.box((-0.56, -0.16, z), (0.56, 0.16, z + 0.045), 'planks')
    for x in (-0.34, 0.02, 0.34):
        b.lathe([(0.0, 0.895), (0.085, 0.895), (0.1, 1.08), (0.05, 1.16), (0.0, 1.16)], 8, 'iron',
                m=_at(x, -0.02))
    if detailed():
        for x, mat in ((-0.32, 'roof_terracotta'), (0.0, 'roof_terracotta')):
            b.lathe([(0.0, 0.345), (0.09, 0.345), (0.12, 0.52), (0.07, 0.66), (0.09, 0.7), (0.0, 0.7)],
                    8, mat, m=_at(x, -0.01))
        b.box((0.18, -0.11, 0.345), (0.48, 0.1, 0.46), 'cloth_cream')
        b.box((0.2, -0.1, 0.46), (0.46, 0.09, 0.55), 'cloth_blue')
        for x, mat in ((-0.35, 'cloth_red'), (-0.28, 'cloth_blue'), (-0.2, 'timber')):
            b.box((x, -0.1, 1.445), (x + 0.06, 0.1, 1.72), mat)
        b.lathe([(0.0, 1.445), (0.11, 1.445), (0.13, 1.54), (0.0, 1.54)], 8, 'planks', m=_at(0.25, 0))
    return b


def rug():
    """Woven carpet with cream border, red field and central blue medallion."""
    b = MeshBuilder()
    b.box((-1.05, -0.75, 0), (1.05, 0.75, 0.016), 'cloth_cream', skip=('-z',))
    b.box((-0.92, -0.62, 0.004), (0.92, 0.62, 0.022), 'cloth_red', skip=('-z',))
    if detailed():
        b.box((-0.45, -0.28, 0.008), (0.45, 0.28, 0.026), 'cloth_blue', skip=('-z',))
    return b


def chest():
    """Iron-bound oak treasure/storage chest with arched lid and gilt lockplate."""
    b = MeshBuilder()
    b.box((-0.44, -0.26, 0), (0.44, 0.26, 0.38), 'planks')
    b.box((-0.46, -0.28, 0.38), (0.46, 0.28, 0.5), 'timber')
    for x in (-0.45, -0.22, 0.22, 0.39):
        b.box((x, -0.29, 0), (x + 0.06, 0.29, 0.51), 'iron')
    b.box((-0.06, -0.3, 0.28), (0.06, -0.27, 0.44), 'gold')
    return b


def bookcase():
    """Tall timber bookcase filled with leather-bound tomes and scrolls (back at +Y)."""
    b = MeshBuilder()
    b.box((-0.64, 0.12, 0), (0.64, 0.18, 1.92), 'planks')
    for x in (-0.66, 0.58):
        b.box((x, -0.18, 0), (x + 0.08, 0.18, 1.92), 'timber')
    b.box((-0.7, -0.22, 1.9), (0.7, 0.2, 2.0), 'timber')
    shelves = (0.12, 0.56, 1.0, 1.44)
    for z in shelves:
        b.box((-0.58, -0.17, z), (0.58, 0.15, z + 0.045), 'planks')
    if detailed():
        palette = ('cloth_red', 'cloth_blue', 'cloth_cream', 'timber', 'cloth_red', 'gold')
        for row, z in enumerate(shelves):
            top = z + 0.045
            x = -0.54
            idx = row * 3
            while x < 0.44:
                w = 0.055 + 0.02 * ((idx + row) % 3)
                h = 0.26 + 0.04 * ((idx * 5 + row) % 3)
                mat = palette[idx % len(palette)]
                b.box((x, -0.12, top), (x + w, 0.11, top + h), mat)
                x += w + 0.012
                idx += 1
    else:
        for z in shelves:
            b.box((-0.52, -0.11, z + 0.045), (0.52, 0.11, z + 0.34), 'cloth_red')
    return b


def writing_desk():
    """Sloped scholar's desk with parchment, inkwell and candle."""
    b = MeshBuilder()
    for x in (-0.52, 0.44):
        for y in (-0.28, 0.2):
            b.box((x, y, 0), (x + 0.08, y + 0.08, 0.74), 'timber')
    b.box((-0.52, -0.24, 0.18), (0.52, 0.24, 0.24), 'timber')
    b.box((-0.58, -0.34, 0.72), (0.58, 0.32, 0.8), 'planks')
    b.box((-0.56, 0.1, 0.8), (0.56, 0.32, 0.94), 'timber')
    if detailed():
        b.box((-0.24, -0.24, 0.8), (0.18, 0.06, 0.815), 'cloth_cream')
        b.lathe([(0.0, 0.8), (0.04, 0.8), (0.035, 0.87), (0.0, 0.87)], 6, 'iron', m=_at(-0.36, 0.0))
        _candle(b, 0.36, -0.06, 0.8, h=0.14)
    return b


def wardrobe():
    """Tall panelled double-door oak armoire (back at +Y)."""
    b = MeshBuilder()
    b.box((-0.62, -0.26, 0), (0.62, 0.26, 1.88), 'timber')
    b.box((-0.68, -0.31, 1.86), (0.68, 0.29, 1.98), 'timber')
    for sx in (-1, 1):
        x0, x1 = (0.02, 0.56) if sx > 0 else (-0.56, -0.02)
        b.box((x0, -0.29, 0.12), (x1, -0.25, 1.8), 'planks')
        if detailed():
            for y, z in ((-0.3, 0.35), (-0.3, 1.55)):
                hx = 0.54 * sx if sx > 0 else -0.54
                b.box((hx - 0.04, y, z), (hx + 0.04, y + 0.04, z + 0.06), 'iron')
            b.box((sx * 0.06 - 0.02, -0.31, 0.92), (sx * 0.06 + 0.02, -0.28, 1.04), 'iron')
    return b


def define(kit):
    kit.define('Table', 'interior', table())
    kit.define('Bench', 'interior', bench())
    kit.define('Pew', 'interior', pew())
    kit.define('Stool', 'interior', stool())
    kit.define('Bed', 'interior', bed())
    kit.define('Hearth', 'interior', hearth())
    kit.define('Shelf', 'interior', shelf())
    kit.define('Rug', 'interior', rug())
    kit.define('Chest', 'interior', chest())
    kit.define('Bookcase', 'interior', bookcase())
    kit.define('Writing_Desk', 'interior', writing_desk())
    kit.define('Wardrobe', 'interior', wardrobe())

