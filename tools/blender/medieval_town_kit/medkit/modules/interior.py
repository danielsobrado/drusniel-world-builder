"""Interior furniture. Origins on the floor at the footprint centre; the "back"
of wall-hugging pieces (hearth, bed headboard, shelf, bookcase, wardrobe) is +Y.
"""
import math

from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder
from .carpentry import (
    iron_latch_and_ring,
    molded_cornice,
    ornate_strap_hinge,
    recessed_panel_front,
    recessed_panel_side,
    shaped_bracket_base,
)


def _at(x, y, z=0.0):
    return Matrix.Translation((x, y, z))


def _candle(b, x, y, z, h=0.14):
    """Iron drip dish, tallow candle, and warm flame tip."""
    b.lathe([(0.0, z), (0.045, z), (0.05, z + 0.018), (0.0, z + 0.018)], 8, 'iron', m=_at(x, y))
    b.lathe([(0.018, z + 0.018), (0.016, z + 0.018 + h), (0.0, z + 0.018 + h)], 6, 'cloth_cream',
            m=_at(x, y))
    b.blob((x, y, z + 0.035 + h), 0.022, 'glow', subdiv=1, squash=(0.7, 0.7, 1.6), jitter=0.05)


def table():
    """Carved oak trestle table: heavy chamfered plank top with breadboard ends and iron
    corner cleats over sculpted twin trestle pillars joined by a keyed tusk-tenon stretcher."""
    b = MeshBuilder()
    if not detailed():
        b.box((-0.9, -0.5, 0.72), (0.9, 0.5, 0.8), 'planks')
        for x in (-0.65, 0.57):
            b.box((x, -0.06, 0), (x + 0.08, 0.06, 0.72), 'timber')
        return b
    # Four thick walnut planks with chamfered seams + breadboard end rails
    for i in range(4):
        y0 = -0.48 + i * 0.24 + 0.005
        b.box((-0.84, y0, 0.74), (0.84, y0 + 0.23, 0.805), 'wood_trim', tone=0.93 + 0.06 * (i % 2))
    for sx in (-1, 1):
        x0, x1 = (-0.92, -0.84) if sx < 0 else (0.84, 0.92)
        b.box((x0, -0.50, 0.735), (x1, 0.50, 0.81), 'wood_trim', tone=0.90)
        for sy in (-1, 1):
            cy = sy * 0.45
            b.box((x0 - 0.008 if sx < 0 else x1 - 0.03, cy - 0.04, 0.73),
                  (x0 + 0.03 if sx < 0 else x1 + 0.008, cy + 0.04, 0.815), 'iron', bevel=0)
    # Carved apron frieze under the tabletop
    b.box((-0.78, -0.42, 0.65), (0.78, 0.42, 0.74), 'timber', tone=0.88)
    recessed_panel_front(b, -0.56, 0.56, 0.66, 0.735, -0.425, depth=0.014, border=0.015,
                         carved=True, style='frieze')
    # Sculpted trestle standards, arched feet, and pegged stretcher
    for x in (-0.66, 0.56):
        b.box((x - 0.02, -0.44, 0.0), (x + 0.12, 0.44, 0.085), 'wood_trim', tone=0.90)
        b.box((x, -0.09, 0.085), (x + 0.10, 0.09, 0.68), 'wood_trim', tone=0.94)
        b.box((x - 0.02, -0.45, 0.68), (x + 0.12, 0.45, 0.74), 'wood_trim', tone=0.92)
    b.box((-0.76, -0.04, 0.26), (0.76, 0.04, 0.33), 'wood_trim', tone=0.90)
    # Trenchers, tankards, bread loaf and candle on the tabletop (z = 0.805)
    for tx, ty in ((-0.48, -0.24), (0.42, -0.24), (-0.42, 0.24), (0.48, 0.24)):
        b.lathe([(0.0, 0.805), (0.11, 0.805), (0.12, 0.825), (0.09, 0.825), (0.0, 0.812)], 8,
                'wood_trim', m=_at(tx, ty))
    for mx, my in ((-0.26, -0.22), (0.62, 0.2)):
        b.lathe([(0.0, 0.805), (0.048, 0.805), (0.042, 0.925), (0.0, 0.925)], 8, 'iron', m=_at(mx, my))
    b.blob((-0.08, 0.05, 0.835), 0.09, 'cloth_cream', subdiv=1, squash=(1.4, 0.9, 0.65), jitter=0.08,
           seed=19)
    _candle(b, 0.16, -0.04, 0.805, h=0.13)
    return b


def bench(length=1.6):
    """Molded plank bench with carved apron rail and splayed mortised legs."""
    b = MeshBuilder()
    h = length / 2
    b.box((-h, -0.18, 0.42), (h, 0.18, 0.48), 'wood_trim')
    if detailed():
        b.box((-h + 0.08, -0.14, 0.35), (h - 0.08, 0.14, 0.42), 'timber', tone=0.88)
        b.box((-h + 0.12, -0.03, 0.14), (h - 0.12, 0.03, 0.19), 'wood_trim', tone=0.90)
    for x in (-h + 0.12, h - 0.18):
        if detailed():
            for y0, y1 in ((-0.17, -0.11), (0.11, 0.17)):
                b.beam((x + 0.03, y0 * 1.35, 0), (x + 0.03, (y0 + y1) / 2 * 0.6, 0.42), (1, 0, 0),
                       (-0.035, 0.035), 0.065, 'wood_trim')
        else:
            b.box((x, -0.15, 0), (x + 0.06, 0.15, 0.42), 'timber')
    return b


def pew(length=1.7):
    """High-backed guildhall/chapel pew with carved knotwork backrest panels and finials."""
    b = MeshBuilder()
    h = length / 2
    b.box((-h + 0.06, -0.22, 0.42), (h - 0.06, 0.18, 0.48), 'wood_trim')
    b.box((-h + 0.06, 0.12, 0.48), (h - 0.06, 0.18, 0.96), 'wood_trim')
    b.box((-h, 0.10, 0.95), (h, 0.20, 1.02), 'wood_trim', tone=1.04)
    for x in (-h, h - 0.08):
        b.box((x, -0.25, 0), (x + 0.08, 0.21, 0.58), 'wood_trim')
        b.box((x, 0.06, 0.58), (x + 0.08, 0.21, 1.08), 'wood_trim')
    if detailed():
        b.box((-h + 0.08, -0.18, 0.08), (h - 0.08, -0.06, 0.14), 'wood_trim')
        for px0, px1 in ((-h + 0.12, -0.04), (0.04, h - 0.12)):
            recessed_panel_front(b, px0, px1, 0.53, 0.92, 0.115, depth=0.018, border=0.024, carved=False)
    return b


def stool():
    b = MeshBuilder()
    b.box((-0.18, -0.18, 0.42), (0.18, 0.18, 0.47), 'wood_trim')
    for x, y in ((-0.12, -0.1), (0.08, -0.1), (-0.02, 0.1)):
        b.box((x - 0.028, y - 0.028, 0), (x + 0.028, y + 0.028, 0.42), 'wood_trim')
    return b


def bed():
    """Carved four-poster / high-headboard bedstead with recessed knotwork headboard
    and footboard panels, turned finials, linen bolster, and layered wool blankets."""
    b = MeshBuilder()
    if detailed():
        b.box((-0.46, -0.95, 0.16), (0.46, 0.95, 0.34), 'wood_trim')
        for x, y, h in ((-0.51, 0.90, 1.22), (0.41, 0.90, 1.22),
                        (-0.51, -1.0, 0.72), (0.41, -1.0, 0.72)):
            b.box((x, y, 0), (x + 0.10, y + 0.10, h), 'wood_trim')
            b.box((x - 0.018, y - 0.018, h), (x + 0.118, y + 0.118, h + 0.055), 'wood_trim', tone=1.04)
            b.lathe([(0.0, h + 0.055), (0.042, h + 0.08), (0.028, h + 0.14), (0.0, h + 0.16)],
                    8, 'wood_trim', m=_at(x + 0.05, y + 0.05))
        # Carved headboard (+Y, facing -Y) and footboard (-Y, facing -Y)
        b.box((-0.41, 0.92, 0.34), (0.41, 0.99, 1.12), 'wood_trim')
        molded_cornice(b, -0.44, 0.44, 0.90, 1.00, 1.12, h=0.065, overhang=0.035)
        for px0, px1 in ((-0.38, -0.02), (0.02, 0.38)):
            recessed_panel_front(b, px0, px1, 0.56, 1.06, 0.915, depth=0.02, border=0.025,
                                 carved=True, style='knotwork')
        b.box((-0.41, -0.99, 0.34), (0.41, -0.92, 0.64), 'wood_trim')
        recessed_panel_front(b, -0.36, 0.36, 0.38, 0.60, -0.995, depth=0.018, border=0.022,
                             carved=True, style='frieze')
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
    """Stone fireplace with hearthstone apron, jambs, carved timber overmantel frieze,
    iron andirons, split logs, glowing embers/flame, and a suspended iron cauldron."""
    b = MeshBuilder()
    b.box((-0.92, -0.55, 0), (0.92, 0.3, 0.12), 'stone_dressed', skip=('-z',))
    b.box((-0.85, -0.35, 0.12), (-0.5, 0.3, 1.25), 'stone')
    b.box((0.5, -0.35, 0.12), (0.85, 0.3, 1.25), 'stone')
    b.box((-0.5, 0.1, 0.12), (0.5, 0.3, 1.25), 'stone')
    b.box((-0.98, -0.46, 1.25), (0.98, 0.3, 1.44), 'wood_trim')
    b.box((-0.72, -0.3, 1.44), (0.72, 0.3, 2.65), 'stone')
    b.box((-0.78, -0.35, 2.55), (0.78, 0.3, 2.68), 'stone_dressed')
    b.blob((0, -0.08, 0.24), 0.24, 'glow', subdiv=1, squash=(1.35, 0.85, 0.75), jitter=0.22)
    if detailed():
        recessed_panel_front(b, -0.86, 0.86, 1.27, 1.42, -0.465, depth=0.018, border=0.02,
                             carved=True, style='frieze')
        for x in (-0.32, 0.32):
            b.box((x - 0.03, -0.32, 0.12), (x + 0.03, 0.05, 0.22), 'iron')
            b.box((x - 0.03, -0.32, 0.22), (x + 0.03, -0.26, 0.42), 'iron')
        for dx, dz, ang in ((-0.12, 0.2, 0.18), (0.12, 0.2, -0.2), (0.0, 0.28, 0.05)):
            m = _at(dx, -0.08, dz) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y')
            b.lathe([(0.0, -0.26), (0.06, -0.26), (0.06, 0.26), (0.0, 0.26)], 6, 'bark', m=m,
                    smooth=False)
        b.lathe([(0.0, 0.46), (0.14, 0.48), (0.2, 0.62), (0.17, 0.76), (0.19, 0.79), (0.0, 0.79)],
                10, 'iron', m=_at(0, -0.08))
        b.box((-0.015, -0.095, 0.79), (0.015, -0.065, 1.25), 'iron')
        _candle(b, -0.72, -0.22, 1.44, h=0.14)
        _candle(b, 0.72, -0.22, 1.44, h=0.14)
    return b


def shelf():
    """Tall carved hutch dresser with molded cornice, recessed lower cabinet doors,
    and open upper shelves stocked with flagons, terracotta jars, and folded linen."""
    b = MeshBuilder()
    for x in (-0.6, 0.53):
        b.box((x, -0.18, 0), (x + 0.07, 0.18, 1.85), 'wood_trim')
    b.box((-0.6, 0.12, 0.08), (0.6, 0.18, 1.85), 'planks')
    molded_cornice(b, -0.6, 0.6, -0.18, 0.18, 1.85, h=0.075, overhang=0.04)
    for z in (0.3, 0.85, 1.4, 1.82):
        b.box((-0.56, -0.18, z), (0.56, 0.16, z + 0.045), 'wood_trim')
    for x in (-0.34, 0.02, 0.34):
        b.lathe([(0.0, 0.895), (0.085, 0.895), (0.1, 1.08), (0.05, 1.16), (0.0, 1.16)], 8, 'iron',
                m=_at(x, -0.02))
    if detailed():
        recessed_panel_front(b, -0.52, 0.52, 1.71, 1.82, -0.182, depth=0.016, border=0.018,
                             carved=True, style='frieze')
        for x, mat in ((-0.32, 'roof_terracotta'), (0.0, 'roof_terracotta')):
            b.lathe([(0.0, 0.345), (0.09, 0.345), (0.12, 0.52), (0.07, 0.66), (0.09, 0.7), (0.0, 0.7)],
                    8, mat, m=_at(x, -0.01))
        b.box((0.18, -0.11, 0.345), (0.48, 0.1, 0.46), 'cloth_cream')
        b.box((0.2, -0.1, 0.46), (0.46, 0.09, 0.55), 'cloth_blue')
        for x, mat in ((-0.35, 'cloth_red'), (-0.28, 'cloth_blue'), (-0.2, 'timber')):
            b.box((x, -0.1, 1.445), (x + 0.06, 0.1, 1.72), mat)
        b.lathe([(0.0, 1.445), (0.11, 1.445), (0.13, 1.54), (0.0, 1.54)], 8, 'wood_trim', m=_at(0.25, 0))
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
    """Iron-bound carved oak coffer chest with bracket feet, recessed knotwork front
    panels, forged iron straps with rivets, and gilt lockplate."""
    b = MeshBuilder()
    shaped_bracket_base(b, -0.45, 0.45, -0.26, 0.26, h=0.08, foot_w=0.10)
    b.box((-0.45, -0.26, 0.08), (0.45, 0.26, 0.40), 'wood_trim')
    b.box((-0.47, -0.28, 0.40), (0.47, 0.28, 0.52), 'wood_trim', tone=1.04)
    if detailed():
        for px0, px1 in ((-0.39, -0.05), (0.05, 0.39)):
            recessed_panel_front(b, px0, px1, 0.11, 0.37, -0.265, depth=0.018, border=0.022,
                                 carved=True, style='knotwork')
    for x in (-0.45, -0.22, 0.22, 0.39):
        b.box((x, -0.29, 0.06), (x + 0.055, 0.29, 0.53), 'iron')
    b.box((-0.055, -0.30, 0.28), (0.055, -0.27, 0.45), 'gold')
    return b


def bookcase():
    """Tall architectural bookcase with stepped crown cornice, bracket base, carved
    frieze header, and shelves filled with leather-bound tomes and scrolls."""
    b = MeshBuilder()
    shaped_bracket_base(b, -0.66, 0.66, -0.19, 0.19, h=0.11, foot_w=0.13)
    b.box((-0.64, 0.12, 0.11), (0.64, 0.18, 1.90), 'planks')
    for x in (-0.66, 0.58):
        b.box((x, -0.18, 0.11), (x + 0.08, 0.18, 1.90), 'wood_trim')
    molded_cornice(b, -0.66, 0.66, -0.19, 0.19, 1.90, h=0.09, overhang=0.05)
    shelves = (0.14, 0.56, 1.0, 1.44)
    for z in shelves:
        b.box((-0.58, -0.17, z), (0.58, 0.15, z + 0.045), 'wood_trim')
    if detailed():
        recessed_panel_front(b, -0.58, 0.58, 1.78, 1.89, -0.182, depth=0.016, border=0.018,
                             carved=True, style='frieze')
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
    """Carved scholar's writing desk with recessed apron panels, turned legs,
    sloped gallery crest, parchment, inkwell and candle."""
    b = MeshBuilder()
    for x in (-0.54, 0.46):
        for y in (-0.28, 0.2):
            b.box((x, y, 0), (x + 0.08, y + 0.08, 0.74), 'wood_trim')
    b.box((-0.54, -0.24, 0.16), (0.54, 0.24, 0.22), 'wood_trim')
    b.box((-0.54, -0.26, 0.62), (0.54, 0.26, 0.72), 'wood_trim', tone=0.92)
    b.box((-0.60, -0.34, 0.72), (0.60, 0.32, 0.80), 'wood_trim', tone=1.02)
    b.box((-0.58, 0.10, 0.80), (0.58, 0.32, 0.96), 'wood_trim')
    if detailed():
        recessed_panel_front(b, -0.44, 0.44, 0.63, 0.71, -0.265, depth=0.016, border=0.016,
                             carved=True, style='frieze')
        recessed_panel_front(b, -0.48, 0.48, 0.82, 0.94, 0.095, depth=0.016, border=0.018,
                             carved=True, style='frieze')
        b.box((-0.24, -0.24, 0.80), (0.18, 0.06, 0.815), 'cloth_cream')
        b.lathe([(0.0, 0.80), (0.04, 0.80), (0.035, 0.87), (0.0, 0.87)], 6, 'iron', m=_at(-0.36, 0.0))
        _candle(b, 0.36, -0.06, 0.80, h=0.14)
    return b


def wardrobe():
    """Hero carved oak/walnut double-door armoire (back at +Y, front at -Y):
    - Three-tier overhanging crown cornice
    - Corner stiles & recessed upper/lower side panels separated by a mid-rail
    - Shaped bracket feet and scrolled lower apron cutout
    - Twin front doors, each with 4 recessed stepped-molding panels (top/bottom
      carved interlace friezes + upper/lower carved Nordic dragon-knotwork squares)
    - Four ornate fleur-de-lis wrought-iron strap hinges with domed rivets
    - Central wrought-iron sliding bolt latch, keepers, and hanging ring pull
    """
    b = MeshBuilder()
    x0, x1 = -0.62, 0.62
    y0, y1 = -0.26, 0.26
    base_h = 0.15
    top_z = 1.88

    # 1. Shaped bracket feet, scrolled apron cutout, and molded plinth rail
    shaped_bracket_base(b, x0, x1, y0, y1, h=base_h, foot_w=0.15, mat='wood_trim')

    # 2. Carcass corner stiles, rear backing, and side walls with recessed panels
    stile_w = 0.085
    b.box((x0 + 0.04, y1 - 0.05, base_h), (x1 - 0.04, y1, top_z), 'planks', tone=0.86)
    for sx, cx0, cx1 in ((-1, x0, x0 + stile_w), (1, x1 - stile_w, x1)):
        # Front and rear corner stiles (vertical grain)
        b.box((cx0, y0, base_h), (cx1, y0 + stile_w, top_z), 'wood_trim', tone=0.98)
        b.box((cx0, y1 - stile_w, base_h), (cx1, y1, top_z), 'wood_trim', tone=0.92)
        # Side top, middle, and bottom rails (horizontal grain)
        b.box((cx0 + 0.01, y0 + stile_w, base_h), (cx1 - 0.01, y1 - stile_w, base_h + 0.07),
              'wood_trim', tone=0.94)
        b.box((cx0 + 0.01, y0 + stile_w, 0.96), (cx1 - 0.01, y1 - stile_w, 1.04),
              'wood_trim', tone=0.95)
        b.box((cx0 + 0.01, y0 + stile_w, top_z - 0.08), (cx1 - 0.01, y1 - stile_w, top_z),
              'wood_trim', tone=0.94)
        # Recessed upper & lower side panels
        x_side = x0 if sx < 0 else x1
        recessed_panel_side(b, y0 + stile_w, y1 - stile_w, base_h + 0.07, 0.96, x_side, sx)
        recessed_panel_side(b, y0 + stile_w, y1 - stile_w, 1.04, top_z - 0.08, x_side, sx)

    # Front top header rail above the doors & bottom threshold rail
    b.box((x0 + stile_w, y0, top_z - 0.075), (x1 - stile_w, y0 + 0.06, top_z), 'wood_trim', tone=0.96)
    b.box((x0 + stile_w, y0, base_h), (x1 - stile_w, y0 + 0.06, base_h + 0.055), 'wood_trim', tone=0.92)

    # Dark recessed interior cavity behind the door split seam
    b.box((-0.54, y0 + 0.035, base_h + 0.05), (0.54, y0 + 0.08, top_z - 0.07), 'timber', tone=0.55, bevel=0)

    # 3. Three-tier overhanging crown cornice
    molded_cornice(b, x0, x1, y0, y1, top_z, h=0.095, overhang=0.055, mat='wood_trim')

    # 4. Twin carved front doors (left & right)
    door_z0 = base_h + 0.055
    door_z1 = top_z - 0.075
    y_door = y0 - 0.018
    for sx in (-1, 1):
        dx0, dx1 = (-0.532, -0.006) if sx < 0 else (0.006, 0.532)
        # Outer & inner door stiles
        s_w = 0.058
        b.box((dx0, y_door, door_z0), (dx0 + s_w, y0 + 0.035, door_z1), 'wood_trim', tone=0.97)
        b.box((dx1 - s_w, y_door, door_z0), (dx1, y0 + 0.035, door_z1), 'wood_trim', tone=0.97)

        px0, px1 = dx0 + s_w, dx1 - s_w
        # Five horizontal door rails defining the 4 panel bays:
        #   Bay 1 (bottom frieze): 0.255 .. 0.375
        #   Hinge rail (lower)   : 0.375 .. 0.475
        #   Bay 2 (lower knot)   : 0.475 .. 0.915
        #   Lock rail (middle)   : 0.915 .. 1.035
        #   Bay 3 (upper knot)   : 1.035 .. 1.475
        #   Hinge rail (upper)   : 1.475 .. 1.575
        #   Bay 4 (top frieze)   : 1.575 .. 1.695
        rails_z = (
            (door_z0, 0.255),
            (0.375, 0.475),
            (0.915, 1.035),
            (1.475, 1.575),
            (1.695, door_z1),
        )
        for rz0, rz1 in rails_z:
            b.box((px0, y_door, rz0), (px1, y0 + 0.035, rz1), 'wood_trim', tone=0.94)

        # Four recessed carved panels per door
        recessed_panel_front(b, px0, px1, 0.255, 0.375, y_door, depth=0.022, border=0.02,
                             carved=True, style='frieze')
        recessed_panel_front(b, px0, px1, 0.475, 0.915, y_door, depth=0.026, border=0.028,
                             carved=True, style='knotwork')
        recessed_panel_front(b, px0, px1, 1.035, 1.475, y_door, depth=0.026, border=0.028,
                             carved=True, style='knotwork')
        recessed_panel_front(b, px0, px1, 1.575, 1.695, y_door, depth=0.022, border=0.02,
                             carved=True, style='frieze')

        # Upper and lower ornate fleur-de-lis wrought-iron strap hinges
        hinge_x = dx0 + 0.012 if sx < 0 else dx1 - 0.012
        hinge_dir = 1 if sx < 0 else -1
        ornate_strap_hinge(b, hinge_x, 1.525, 0.44, y_door, dir_x=hinge_dir)
        ornate_strap_hinge(b, hinge_x, 0.425, 0.44, y_door, dir_x=hinge_dir)

    # 5. Central wrought-iron sliding bolt latch & hanging ring pull
    iron_latch_and_ring(b, 0.0, 0.975, y_door)
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
