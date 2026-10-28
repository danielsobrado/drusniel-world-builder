"""D&D / Baldur's Gate city street architecture, commerce, civic monuments, and
regional street life (including Vondari Dwarven Stonehold & Frostgard street modules).

All modules have their origin at `(0, 0, 0)` on the ground at the footprint centre.
Street arches span local `X` across a 2-cell (`4.0 m`) street with the thoroughfare
running along local `Y`.
"""
import math

from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder
from .street_props import lantern

R90X = Matrix.Rotation(math.pi / 2, 4, 'X')
R90Y = Matrix.Rotation(math.pi / 2, 4, 'Y')


def street_arch_stone():
    """Baldur's Gate style stone street archway spanning 4 m across a street (`X` -2..+2),
    with dressed voussoirs, crenellated parapet walk, and a hanging keystone lantern."""
    b = MeshBuilder()
    # Left and right stone piers (clear passage X -1.30..+1.30)
    for sx in (-1, 1):
        x0, x1 = (sx * 1.30, sx * 2.00) if sx > 0 else (sx * 2.00, sx * 1.30)
        b.box((x0, -0.58, 0.0), (x1, 0.58, 0.42), 'stone_dressed', skip=('-z',))
        b.box((x0 + 0.04, -0.52, 0.42), (x1 - 0.04, 0.52, 3.35), 'stone')
        # Quoins / pilaster strips
        for z in (0.55, 1.15, 1.75, 2.35):
            b.box((x0 + 0.01, -0.55, z), (x1 - 0.01, 0.55, z + 0.32), 'stone_dressed')

    # Arch lintel & spandrel wall above z = 2.65..3.35
    b.box((-1.34, -0.50, 2.78), (1.34, 0.50, 3.35), 'stone')
    # Corbelled knee brackets & radial voussoir arch ring
    seg = 10
    r_in, r_out, spring = 1.30, 1.56, 1.65
    for i in range(seg):
        a0 = math.pi * (0.12 + 0.76 * i / seg)
        a1 = math.pi * (0.12 + 0.76 * (i + 1) / seg)
        pts = [
            (r_in * math.cos(a0), -0.54, spring + r_in * math.sin(a0)),
            (r_out * math.cos(a0), -0.54, spring + r_out * math.sin(a0)),
            (r_out * math.cos(a1), -0.54, spring + r_out * math.sin(a1)),
            (r_in * math.cos(a1), -0.54, spring + r_in * math.sin(a1)),
        ]
        b.extrude(pts, (0, 1.08, 0), 'stone_dressed')

    # Keystone on both faces
    for y0, y1 in ((-0.60, -0.48), (0.48, 0.60)):
        b.box((-0.18, y0, 2.82), (0.18, y1, 3.38), 'stone_dressed')

    # Stringcourse cornice and crenellated parapet walk on top
    b.box((-2.04, -0.60, 3.35), (2.04, 0.60, 3.50), 'stone_dressed')
    b.box((-1.96, -0.50, 3.50), (1.96, 0.50, 3.58), 'cobble')
    for y0, y1 in ((-0.58, -0.38), (0.38, 0.58)):
        b.box((-2.00, y0, 3.50), (2.00, y1, 3.82), 'stone')
        for cx in (-1.65, -0.82, 0.0, 0.82, 1.65):
            b.box((cx - 0.24, y0 - 0.02, 3.82), (cx + 0.24, y1 + 0.02, 4.08), 'stone_dressed')

    # Hanging street lantern under the keystone
    b.box((-0.03, -0.03, 2.62), (0.03, 0.03, 2.95), 'iron', bevel=0)
    lantern(b, 0.0, 0.0, 1.92)
    return b


def street_arch_timber():
    """Jettied half-timbered skybridge / covered overpass spanning a 4 m street (`X` -2..+2),
    supported by stone plinths and heavy oak knee braces with leaded windows and pitched roof."""
    b = MeshBuilder()
    # Ground-level support piers at the building kerbs (X = ±1.45..±1.98)
    for sx in (-1, 1):
        px = sx * 1.70
        b.box((px - 0.26, -0.68, 0.0), (px + 0.26, 0.68, 0.55), 'stone_dressed', skip=('-z',))
        for y in (-0.54, 0.54):
            b.box((px - 0.12, y - 0.12, 0.55), (px + 0.12, y + 0.12, 2.85), 'timber')
            # Diagonal oak knee braces supporting the overpass
            b.beam((px - sx * 0.08, y, 1.55), (px - sx * 0.85, y, 2.82), (0, 1, 0),
                   (-0.08, 0.08), 0.14, 'timber')

    # Overpass deck & underside ceiling beams at z = 2.80..3.00
    b.box((-2.02, -0.78, 2.82), (2.02, 0.78, 3.00), 'timber')
    for x in (-1.4, -0.7, 0.0, 0.7, 1.4):
        b.box((x - 0.07, -0.82, 2.70), (x + 0.07, 0.82, 2.84), 'timber')

    # Half-timbered gallery walls (z = 3.00..4.55)
    b.box((-1.96, -0.72, 3.00), (1.96, 0.72, 4.55), 'plaster')
    for y in (-0.75, 0.69):
        b.box((-2.00, y, 3.00), (2.00, y + 0.06, 3.14), 'timber')
        b.box((-2.00, y, 3.72), (2.00, y + 0.06, 3.84), 'timber')
        b.box((-2.00, y, 4.42), (2.00, y + 0.06, 4.56), 'timber')
        for x in (-1.92, -1.15, -0.38, 0.38, 1.15, 1.92):
            b.box((x - 0.05, y, 3.00), (x + 0.05, y + 0.06, 4.55), 'timber')
        # Leaded casement windows looking down the street
        for wx in (-0.76, 0.0, 0.76):
            b.box((wx - 0.24, y - 0.02, 3.84), (wx + 0.24, y + 0.08, 4.38), 'glass')
            b.box((wx - 0.28, y - 0.04, 3.80), (wx + 0.28, y + 0.09, 3.86), 'timber')

    # Pitched tile roof over the skybridge (ridge along X)
    mats = {'+z': 'roof', '-z': 'planks'}
    b.beam((0.0, -0.95, 4.48), (0.0, 0.03, 5.32), (1, 0, 0), (-2.08, 2.08), 0.10, 'timber', mats=mats)
    b.beam((0.0, -0.03, 5.32), (0.0, 0.95, 4.48), (1, 0, 0), (-2.08, 2.08), 0.10, 'timber', mats=mats)
    b.box((-2.10, -0.06, 5.26), (2.10, 0.06, 5.38), 'roof_terracotta')

    # Underside hanging lantern
    lantern(b, 0.0, 0.0, 1.88)
    b.box((-0.025, -0.025, 2.52), (0.025, 0.025, 2.74), 'iron', bevel=0)
    return b


def street_arch_granite():
    """Vondari Dwarven (`Stonehold`) squared-arch granite & basalt viaduct spanning a 4 m street,
    with shouldered basalt lintels, bronze drain spouts, and twin recessed brazier niches."""
    b = MeshBuilder()
    # Heavy battered basalt & granite piers at X = ±1.32..±2.00
    for sx in (-1, 1):
        x0, x1 = (1.32, 2.00) if sx > 0 else (-2.00, -1.32)
        b.box((x0 - 0.06, -0.72, 0.0), (x1 + 0.06, 0.72, 0.65), 'stone_basalt', skip=('-z',))
        b.box((x0, -0.66, 0.65), (x1, 0.66, 3.55), 'stone_granite')
        for z in (1.35, 2.35):
            b.box((x0 - 0.04, -0.70, z), (x1 + 0.04, 0.70, z + 0.22), 'stone_basalt')
        # Corbelled basalt shoulder brackets under the lintel
        sh_x0, sh_x1 = (x0 - 0.36, x0) if sx > 0 else (x1, x1 + 0.36)
        b.box((sh_x0, -0.62, 2.45), (sh_x1, 0.62, 2.92), 'stone_basalt')
        # Recessed dwarven brazier niche on the inner pier face
        nx = 1.66 * sx
        b.box((nx - 0.18, -0.74, 1.62), (nx + 0.18, 0.74, 1.72), 'stone_basalt')
        for ny in (-0.76, 0.76):
            b.lathe([(0.0, 1.72), (0.14, 1.74), (0.20, 1.92), (0.0, 1.88)], 6, 'bronze',
                    m=Matrix.Translation((nx, ny, 0.0)), smooth=False)
            b.blob((nx, ny, 1.94), 0.13, 'glow', subdiv=1, squash=(1.0, 1.0, 0.8), jitter=0.15, seed=19)

    # Massive squared basalt lintel & granite viaduct beam
    b.box((-1.42, -0.72, 2.92), (1.42, 0.72, 3.32), 'stone_basalt')
    b.box((-2.02, -0.66, 3.32), (2.02, 0.66, 3.72), 'stone_granite')
    b.box((-2.08, -0.74, 3.72), (2.08, 0.74, 3.88), 'stone_basalt')

    # Solid dwarven parapet walls with dull bronze drain spouts and central ward emblem
    b.box((-1.98, -0.56, 3.88), (1.98, 0.56, 3.96), 'stone_ashlar')
    for y0, y1, sy in ((-0.70, -0.46, -1), (0.46, 0.70, 1)):
        b.box((-2.02, y0, 3.88), (2.02, y1, 4.42), 'stone_granite')
        b.box((-2.06, y0 - 0.04, 4.42), (2.06, y1 + 0.04, 4.56), 'stone_basalt')
        # Bronze drain spouts and geometric keystone plate
        for dx in (-0.95, 0.95):
            b.box((dx - 0.06, y0 - 0.24 if sy < 0 else y1, 3.76),
                  (dx + 0.06, y0 if sy < 0 else y1 + 0.24, 3.86), 'bronze')
        b.box((-0.26, y0 - 0.04 if sy < 0 else y1, 3.00),
              (0.26, y0 + 0.02 if sy < 0 else y1 + 0.04, 3.52), 'bronze')
    return b


def street_bunting():
    """Festive overhead guild & market bunting spanning 4 m across a street (`X` -2..+2)."""
    b = MeshBuilder()
    segs = 8
    pts = [(-1.95 + 3.90 * i / segs, 0.0, 3.55 - 0.34 * math.sin(math.pi * i / segs))
           for i in range(segs + 1)]
    for p, q in zip(pts, pts[1:]):
        b.beam(p, q, (0, 1, 0), (-0.016, 0.016), 0.032, 'rope', bevel=0)
    mats = ('cloth_red', 'cloth_cream', 'cloth_blue', 'gold', 'cloth_red', 'cloth_blue', 'cloth_cream', 'cloth_red')
    for i in range(segs):
        xm = 0.5 * (pts[i][0] + pts[i + 1][0])
        zm = 0.5 * (pts[i][2] + pts[i + 1][2])
        w = 0.17
        h = 0.42 if i % 2 == 0 else 0.34
        tri = [(xm - w, -0.015, zm), (xm + w, -0.015, zm), (xm, -0.015, zm - h)]
        b.extrude(tri, (0, 0.03, 0), mats[i % len(mats)])
    return b


def tavern_table_set():
    """Outdoor tavern trestle table with two benches, foaming ale tankards, trencher, and candle lantern."""
    b = MeshBuilder()
    # Heavy oak plank table (X -0.82..+0.82, Y -0.38..+0.38, Z 0.76)
    b.box((-0.84, -0.40, 0.70), (0.84, 0.40, 0.78), 'planks')
    for x in (-0.64, 0.64):
        b.box((x - 0.06, -0.32, 0.0), (x + 0.06, 0.32, 0.70), 'timber', skip=('-z',))
    b.box((-0.70, -0.04, 0.22), (0.70, 0.04, 0.30), 'timber')

    # Two flanking plank benches at Y = ±0.64
    for sy in (-1, 1):
        yc = sy * 0.64
        b.box((-0.78, yc - 0.15, 0.42), (0.78, yc + 0.15, 0.48), 'planks')
        for x in (-0.58, 0.58):
            b.box((x - 0.05, yc - 0.12, 0.0), (x + 0.05, yc + 0.12, 0.42), 'timber', skip=('-z',))

    # Ale tankards, platter, loaf, and warm table lantern
    for tx, ty in ((-0.45, -0.16), (-0.18, 0.18), (0.48, -0.14), (0.32, 0.16)):
        m = Matrix.Translation((tx, ty, 0.78))
        b.lathe([(0.0, 0.0), (0.065, 0.0), (0.055, 0.15), (0.0, 0.15)], 8, 'iron', m=m)
        b.blob((tx, ty, 0.94), 0.05, 'cloth_cream', subdiv=1, squash=(1.1, 1.1, 0.6), jitter=0.1, seed=12)
    # Wooden platter & roast/bread
    b.box((-0.08, -0.22, 0.78), (0.22, 0.04, 0.81), 'timber')
    b.blob((0.07, -0.09, 0.85), 0.10, 'hide', subdiv=1, squash=(1.2, 0.85, 0.65), jitter=0.12, seed=41)
    # Candle lantern at table centre
    b.lathe([(0.0, 0.78), (0.07, 0.78), (0.06, 0.96), (0.09, 0.98), (0.0, 1.05)], 6, 'iron',
            m=Matrix.Translation((-0.05, 0.08, 0.0)), smooth=False)
    b.blob((-0.05, 0.08, 0.88), 0.045, 'glow', subdiv=1)
    return b


def alchemist_stall():
    """Apothecary & arcane street stall with canopy, glowing potion flasks, balance scales, and herb bundles."""
    b = MeshBuilder()
    for x in (-1.08, 0.98):
        b.box((x, -0.68, 0.0), (x + 0.10, -0.58, 2.15), 'timber', skip=('-z',))
        b.box((x, 0.52, 0.0), (x + 0.10, 0.62, 2.55), 'timber', skip=('-z',))
    b.box((-1.10, -0.72, 0.0), (1.10, -0.12, 0.76), 'planks', skip=('-z',))
    b.box((-1.16, -0.78, 0.76), (1.16, -0.06, 0.86), 'timber')
    # Stepped potion display shelf on back of counter
    b.box((-0.98, -0.32, 0.86), (0.98, -0.08, 1.06), 'planks')

    # Striped arcane canopy (blue & gold/cream)
    stripes = 6
    w = 2.52 / stripes
    for i in range(stripes):
        x0 = -1.26 + i * w
        mat = 'cloth_blue' if i % 2 == 0 else 'cloth_cream'
        b.beam((x0, -1.12, 2.02), (x0, 0.76, 2.64), (1, 0, 0), (0.0, w), 0.04, mat, bevel=0)

    # Potion bottles & glowing elixirs
    potions = (
        (-0.75, -0.20, 1.06, 'glow'),
        (-0.48, -0.20, 1.06, 'cloth_red'),
        (-0.22, -0.20, 1.06, 'glass'),
        (0.08, -0.20, 1.06, 'glow'),
        (0.36, -0.20, 1.06, 'foliage'),
        (-0.55, -0.48, 0.86, 'cloth_blue'),
        (-0.28, -0.48, 0.86, 'glow'),
    )
    for px, py, pz, pmat in potions:
        m = Matrix.Translation((px, py, pz))
        b.lathe([(0.0, 0.0), (0.065, 0.0), (0.08, 0.09), (0.03, 0.17), (0.04, 0.21), (0.0, 0.21)],
                8, pmat, m=m)

    # Brass balance scale & open grimoire on the counter
    b.box((0.48, -0.48, 0.86), (0.52, -0.44, 1.22), 'gold')
    b.box((0.32, -0.47, 1.18), (0.68, -0.45, 1.21), 'gold')
    b.box((0.62, -0.58, 0.86), (0.96, -0.28, 0.93), 'cloth_cream')
    # Hanging dried herb bundles under front beam
    for hx in (-0.82, -0.35, 0.25, 0.78):
        b.blob((hx, -0.62, 1.88), 0.11, 'foliage', subdiv=1, squash=(0.65, 0.65, 1.45), jitter=0.25, seed=31)
    return b


def armorer_stand():
    """Blacksmith & armorer street display: A-frame weapon rack, breastplate armor stand, and shields."""
    b = MeshBuilder()
    # Timber base platform
    b.box((-1.02, -0.52, 0.0), (1.02, 0.52, 0.10), 'planks', skip=('-z',))

    # Left: A-frame weapon rack (X -0.92..-0.08)
    for x in (-0.88, -0.14):
        b.beam((x, -0.36, 0.10), (x, -0.06, 1.48), (1, 0, 0), (-0.04, 0.04), 0.08, 'timber')
        b.beam((x, 0.36, 0.10), (x, 0.06, 1.48), (1, 0, 0), (-0.04, 0.04), 0.08, 'timber')
    for z in (0.48, 1.18):
        b.box((-0.94, -0.22, z), (-0.08, 0.22, z + 0.07), 'timber')
    # Upright broadswords & halberd on the rack
    for sx in (-0.74, -0.56, -0.38, -0.22):
        b.box((sx - 0.025, -0.12, 0.22), (sx + 0.025, -0.08, 1.38), 'iron')
        b.box((sx - 0.09, -0.14, 0.98), (sx + 0.09, -0.06, 1.02), 'bronze')
        b.box((sx - 0.02, -0.12, 1.02), (sx + 0.02, -0.08, 1.20), 'timber')

    # Right: Armor stand with steel cuirass, pauldrons, helm, and heater shield (X +0.48)
    ax, ay = 0.48, 0.04
    b.box((ax - 0.06, ay - 0.06, 0.10), (ax + 0.06, ay + 0.06, 1.72), 'timber')
    b.box((ax - 0.34, ay - 0.05, 1.32), (ax + 0.34, ay + 0.05, 1.40), 'timber')
    # Cuirass & pauldrons
    b.lathe([(0.0, 0.92), (0.20, 0.95), (0.24, 1.28), (0.18, 1.45), (0.0, 1.45)], 8, 'iron',
            m=Matrix.Translation((ax, ay, 0.0)), smooth=False)
    for sp in (-0.26, 0.26):
        b.blob((ax + sp, ay, 1.38), 0.12, 'iron', subdiv=1, squash=(1.1, 0.9, 0.8), jitter=0.05, seed=7)
    # Crested helm
    b.lathe([(0.0, 1.50), (0.13, 1.50), (0.14, 1.70), (0.08, 1.82), (0.0, 1.86)], 8, 'iron',
            m=Matrix.Translation((ax, ay, 0.0)), smooth=False)
    b.box((ax - 0.02, ay - 0.14, 1.74), (ax + 0.02, ay + 0.12, 1.94), 'cloth_red')
    # Heater shield leaning at the base
    b.box((0.18, -0.38, 0.14), (0.72, -0.28, 0.88), 'cloth_red')
    b.box((0.22, -0.40, 0.18), (0.68, -0.27, 0.84), 'iron')
    return b


def bake_oven_outdoor():
    """Communal outdoor brick-and-stone domed bake oven with glowing hearth, chimney, and bread table."""
    b = MeshBuilder()
    # Stone plinth base (X -0.88..+0.32, Y -0.72..+0.72)
    b.box((-0.88, -0.72, 0.0), (0.34, 0.72, 0.72), 'stone', skip=('-z',))
    b.box((-0.92, -0.76, 0.72), (0.38, 0.76, 0.82), 'stone_dressed')
    # Firewood storage arch under the base
    b.box((-0.62, -0.73, 0.06), (-0.08, -0.35, 0.56), 'shadow', bevel=0)
    for lx in (-0.48, -0.34, -0.20):
        b.box((lx - 0.05, -0.70, 0.08), (lx + 0.05, -0.28, 0.24), 'bark')

    # Domed brick oven vault & chimney flue
    b.blob((-0.26, 0.06, 0.98), 0.64, 'brick', subdiv=2, squash=(0.95, 1.05, 0.78), jitter=0.06, seed=14)
    # Front arched oven mouth facing -Y
    b.box((-0.56, -0.68, 0.82), (0.04, -0.32, 1.38), 'stone_dressed')
    b.box((-0.44, -0.70, 0.84), (-0.08, -0.42, 1.24), 'firelight', bevel=0)
    b.blob((-0.26, -0.48, 0.90), 0.16, 'glow', subdiv=1, squash=(1.2, 0.8, 0.5), jitter=0.1, seed=22)

    # Brick chimney stack at the rear (+Y)
    b.box((-0.46, 0.36, 1.15), (-0.06, 0.70, 2.45), 'brick')
    b.box((-0.50, 0.32, 2.45), (-0.02, 0.74, 2.56), 'stone_dressed')

    # Side baker's table (X +0.38..+0.92) with fresh golden loaves
    b.box((0.36, -0.58, 0.72), (0.94, 0.58, 0.78), 'planks')
    for y in (-0.50, 0.50):
        b.box((0.78, y - 0.05, 0.0), (0.88, y + 0.05, 0.72), 'timber', skip=('-z',))
    for ly in (-0.32, 0.0, 0.32):
        b.blob((0.65, ly, 0.84), 0.12, 'hide', subdiv=1, squash=(1.1, 0.85, 0.6), jitter=0.08, seed=60)
    return b


def guard_post():
    """City watch checkpoint: timber sentry shelter, heraldic shield, halberd rack, and glowing brazier."""
    b = MeshBuilder()
    # Timber sentry box on the left (X -0.95..+0.05, Y -0.55..+0.55)
    b.box((-0.98, -0.58, 0.0), (0.08, 0.58, 0.14), 'stone_dressed', skip=('-z',))
    b.box((-0.92, -0.52, 0.14), (-0.80, 0.52, 2.15), 'planks')
    b.box((-0.04, -0.52, 0.14), (0.06, 0.52, 2.15), 'planks')
    b.box((-0.92, 0.40, 0.14), (0.06, 0.52, 2.15), 'planks')
    # Pitched shingle roof over sentry box
    mats = {'+z': 'roof', '-z': 'planks'}
    b.beam((-0.98, 0.0, 2.08), (-0.43, 0.0, 2.56), (0, 1, 0), (-0.66, 0.66), 0.08, 'timber', mats=mats)
    b.beam((-0.43, 0.0, 2.56), (0.12, 0.0, 2.08), (0, 1, 0), (-0.66, 0.66), 0.08, 'timber', mats=mats)
    # Heraldic watch shield mounted on sentry box side
    b.box((0.06, -0.18, 1.15), (0.12, 0.18, 1.68), 'cloth_blue')
    b.box((0.08, -0.08, 1.28), (0.14, 0.08, 1.55), 'gold')

    # Right side: halberd/spear rack & watch brazier (X +0.25..+0.98)
    b.box((0.22, 0.18, 0.0), (0.88, 0.42, 0.92), 'timber', skip=('-z',))
    for hx in (0.34, 0.55, 0.76):
        b.box((hx - 0.02, 0.26, 0.10), (hx + 0.02, 0.30, 2.35), 'timber')
        b.box((hx - 0.08, 0.24, 2.15), (hx + 0.08, 0.32, 2.48), 'iron')
    # Watch brazier in front (+X, -Y)
    m = Matrix.Translation((0.62, -0.28, 0.0))
    b.lathe([(0.24, 0.0), (0.20, 0.45), (0.32, 0.82), (0.0, 0.72)], 8, 'iron', m=m, smooth=False)
    b.blob((0.62, -0.28, 0.84), 0.20, 'glow', subdiv=1, squash=(1.0, 1.0, 0.7), jitter=0.2, seed=18)
    return b


def pillory_stocks():
    """Medieval wooden stocks on a low stone-and-plank dais for town squares."""
    b = MeshBuilder()
    b.box((-0.78, -0.58, 0.0), (0.78, 0.58, 0.20), 'stone_dressed', skip=('-z',))
    b.box((-0.72, -0.52, 0.20), (0.72, 0.52, 0.26), 'planks')
    for x in (-0.56, 0.46):
        b.box((x, -0.08, 0.26), (x + 0.10, 0.08, 1.62), 'timber')
        b.box((x - 0.02, -0.10, 1.56), (x + 0.12, 0.10, 1.66), 'iron')
    # Lower and upper locking stocks boards with head & wrist cutouts
    b.box((-0.48, -0.05, 0.92), (0.48, 0.05, 1.16), 'planks')
    b.box((-0.48, -0.05, 1.18), (0.48, 0.05, 1.42), 'planks')
    for cx, r in ((-0.28, 0.06), (0.0, 0.11), (0.28, 0.06)):
        b.box((cx - r, -0.06, 1.10), (cx + r, 0.06, 1.24), 'shadow', bevel=0)
    b.box((-0.56, -0.07, 1.14), (0.56, 0.07, 1.20), 'iron')
    return b


def statue_plinth():
    """Stepped octagonal stone civic monument with a bronze hero statue & corner lanterns."""
    b = MeshBuilder()
    # Stepped octagonal dressed-stone base & moulded pedestal
    b.lathe([
        (1.08, 0.0), (1.08, 0.22), (0.86, 0.22), (0.86, 0.44),
        (0.64, 0.44), (0.64, 0.68), (0.52, 0.74), (0.52, 1.92),
        (0.62, 1.98), (0.62, 2.12), (0.0, 2.12)
    ], 8, 'stone_dressed', smooth=False, phase=math.pi / 8)
    # Bronze plaque on front & back of pedestal
    for y0, y1 in ((-0.54, -0.50), (0.50, 0.54)):
        b.box((-0.26, y0, 1.05), (0.26, y1, 1.62), 'bronze')

    # Heroic bronze founder figure atop the pedestal (z = 2.12..3.95)
    b.lathe([
        (0.0, 2.12), (0.28, 2.12), (0.24, 2.65), (0.28, 3.18),
        (0.34, 3.42), (0.14, 3.55), (0.16, 3.78), (0.0, 3.88)
    ], 8, 'bronze', smooth=False)
    # Flowing cloak & grounded greatsword
    b.box((-0.26, 0.06, 2.25), (0.26, 0.28, 3.40), 'bronze')
    b.box((-0.04, -0.32, 2.12), (0.04, -0.24, 3.25), 'gold')
    b.box((-0.18, -0.34, 3.02), (0.18, -0.22, 3.08), 'gold')
    return b


def mine_cart_track():
    """Vondari Dwarven (`Stonehold`) narrow-gauge iron rail track with an iron-bound ore cart
    heaped with dark crag rock and glowing mineral veins."""
    b = MeshBuilder()
    # Basalt ballast bed & heavy dark-timber sleepers along Y (-1.25..+1.25)
    b.box((-0.62, -1.28, 0.0), (0.62, 1.28, 0.08), 'stone_basalt', skip=('-z',))
    for i in range(6):
        y = -1.05 + i * 0.42
        b.box((-0.56, y - 0.08, 0.08), (0.56, y + 0.08, 0.15), 'timber_dark')
    # Forged iron rails
    for x in (-0.36, 0.36):
        b.box((x - 0.035, -1.26, 0.15), (x + 0.035, 1.26, 0.23), 'iron')

    # Flanged iron wheels
    wheel_prof = [(0.0, -0.04), (0.18, -0.04), (0.18, 0.04), (0.0, 0.04)]
    for x in (-0.38, 0.38):
        for y in (-0.42, 0.42):
            b.lathe(wheel_prof, 10, 'iron', m=Matrix.Translation((x, y, 0.34)) @ R90Y, smooth=False)
    for y in (-0.42, 0.42):
        b.box((-0.42, y - 0.03, 0.31), (0.42, y + 0.03, 0.37), 'iron')

    # Riveted iron & bronze dwarven ore tub
    b.box((-0.46, -0.68, 0.42), (0.46, 0.68, 0.98), 'iron')
    b.box((-0.50, -0.72, 0.92), (0.50, 0.72, 1.02), 'bronze')
    for y in (-0.68, 0.0, 0.64):
        b.box((-0.49, y - 0.03, 0.42), (0.49, y + 0.03, 0.96), 'bronze')

    # Heaped raw ore & glowing geothermal ember crystals inside the cart
    b.blob((0.0, -0.18, 1.04), 0.34, 'rock', subdiv=1, squash=(1.1, 1.2, 0.65), jitter=0.22, seed=81)
    b.blob((-0.14, 0.24, 1.06), 0.28, 'stone_basalt', subdiv=1, squash=(1.0, 1.1, 0.7), jitter=0.2, seed=82)
    b.blob((0.12, 0.05, 1.14), 0.16, 'glow', subdiv=1, squash=(1.1, 0.9, 0.65), jitter=0.18, seed=83)
    return b


def smelter_stack():
    """Vondari Dwarven (`Stonehold`) street-side industrial blast furnace & smelter stack
    with glowing hearth arch, molten slag trough, bronze tuyeres, and iron tension bands."""
    b = MeshBuilder()
    # Heavy battered basalt & granite furnace body
    b.box((-0.94, -0.82, 0.0), (0.94, 0.82, 0.58), 'stone_basalt', skip=('-z',))
    b.box((-0.82, -0.70, 0.58), (0.82, 0.70, 2.25), 'stone_granite')
    for z in (0.95, 1.65, 2.20):
        b.box((-0.86, -0.74, z), (0.86, 0.74, z + 0.12), 'iron')
    # Tapered upper stack & twin basalt flues
    b.box((-0.62, -0.52, 2.32), (0.62, 0.52, 3.45), 'stone_granite')
    b.box((-0.68, -0.58, 3.45), (0.68, 0.58, 3.62), 'stone_basalt')
    for fx in (-0.28, 0.28):
        b.box((fx - 0.18, -0.18, 3.62), (fx + 0.18, 0.18, 3.96), 'stone_basalt')
        b.blob((fx, 0.0, 3.96), 0.12, 'glow', subdiv=1, squash=(1.0, 1.0, 0.5), jitter=0.1, seed=91)

    # Front squared dwarven charging arch & molten slag trough (-Y)
    for jx0, jx1 in ((-0.52, -0.32), (0.32, 0.52)):
        b.box((jx0, -0.86, 0.58), (jx1, -0.66, 1.48), 'stone_basalt')
    b.box((-0.56, -0.88, 1.38), (0.56, -0.66, 1.58), 'stone_basalt')
    b.box((-0.32, -0.84, 0.62), (0.32, -0.68, 1.38), 'firelight', bevel=0)
    b.blob((0.0, -0.80, 0.82), 0.24, 'glow', subdiv=1, squash=(1.2, 0.7, 0.85), jitter=0.12, seed=92)
    # Molten metal trough & ingot mould in front
    b.box((-0.36, -1.16, 0.0), (0.36, -0.78, 0.44), 'stone_basalt', skip=('-z',))
    b.box((-0.22, -1.08, 0.40), (0.22, -0.76, 0.46), 'glow', bevel=0)
    # Dull bronze side tuyere pipes
    for sx in (-1, 1):
        b.box((sx * 0.82, -0.18, 0.72), (sx * 0.98, 0.18, 1.45), 'bronze')
    return b


def stonehold_ward_pillar():
    """Vondari Dwarven (`Stonehold`) carved granite & basalt civic ward obelisk with
    bronze collar bands and glowing geometric ward channels."""
    b = MeshBuilder()
    b.box((-0.68, -0.68, 0.0), (0.68, 0.68, 0.32), 'stone_basalt', skip=('-z',))
    b.box((-0.52, -0.52, 0.32), (0.52, 0.52, 0.68), 'stone_granite')
    b.box((-0.56, -0.56, 0.68), (0.56, 0.56, 0.82), 'bronze')
    # Carved granite shaft with basalt corner quoins
    b.box((-0.38, -0.38, 0.82), (0.38, 0.38, 2.58), 'stone_granite')
    for z in (1.35, 2.05):
        b.box((-0.42, -0.42, z), (0.42, 0.42, z + 0.14), 'stone_basalt')
    # Glowing vertical dwarven ward channels on all 4 faces
    b.box((-0.07, -0.40, 0.96), (0.07, 0.40, 2.42), 'glow', bevel=0)
    b.box((-0.40, -0.07, 0.96), (0.40, 0.07, 2.42), 'glow', bevel=0)
    # Stepped basalt & bronze crown with brazier flame
    b.box((-0.48, -0.48, 2.58), (0.48, 0.48, 2.76), 'stone_basalt')
    b.box((-0.36, -0.36, 2.76), (0.36, 0.36, 2.92), 'bronze')
    b.blob((0.0, 0.0, 2.98), 0.22, 'glow', subdiv=1, squash=(1.0, 1.0, 0.85), jitter=0.15, seed=44)
    return b


def winter_supply_sled():
    """Frostgard northern timber runner sled loaded with lashed grain sacks, casks, and furs."""
    b = MeshBuilder()
    # Twin curved iron-shod timber runners along Y (-1.05..+1.05)
    for x in (-0.48, 0.48):
        b.box((x - 0.05, -0.95, 0.0), (x + 0.05, 0.85, 0.12), 'timber_dark', skip=('-z',))
        b.beam((x, 0.80, 0.06), (x, 1.12, 0.36), (1, 0, 0), (-0.05, 0.05), 0.10, 'timber_dark')
        for y in (-0.72, -0.24, 0.24, 0.72):
            b.box((x - 0.04, y - 0.04, 0.12), (x + 0.04, y + 0.04, 0.32), 'timber_dark')
    # Plank sled deck & side rails
    b.box((-0.58, -0.92, 0.32), (0.58, 0.86, 0.39), 'planks')
    for x in (-0.56, 0.50):
        b.box((x, -0.90, 0.39), (x + 0.06, 0.82, 0.68), 'log')

    # Loaded cargo: cask, tied grain sacks, and snow/fur bundle
    cask_m = Matrix.Translation((0.0, -0.42, 0.39))
    b.lathe([(0.0, 0.0), (0.24, 0.0), (0.28, 0.30), (0.24, 0.60), (0.0, 0.60)], 10, 'planks', m=cask_m)
    b.blob((-0.20, 0.25, 0.56), 0.26, 'cloth_cream', subdiv=1, squash=(1.1, 1.2, 0.75), jitter=0.15, seed=71)
    b.blob((0.20, 0.28, 0.54), 0.24, 'bark', subdiv=1, squash=(1.0, 1.2, 0.7), jitter=0.18, seed=72)
    b.blob((0.0, 0.22, 0.82), 0.22, 'snow', subdiv=1, squash=(1.2, 1.1, 0.5), jitter=0.15, seed=73)
    return b


def define(kit):
    kit.define('Street_Arch_Stone', 'props', street_arch_stone())
    kit.define('Street_Arch_Timber', 'props', street_arch_timber())
    kit.define('Street_Arch_Granite', 'props', street_arch_granite())
    kit.define('Street_Bunting', 'props', street_bunting())
    kit.define('Tavern_Table_Set', 'props', tavern_table_set())
    kit.define('Alchemist_Stall', 'props', alchemist_stall())
    kit.define('Armorer_Stand', 'props', armorer_stand())
    kit.define('Bake_Oven_Outdoor', 'props', bake_oven_outdoor())
    kit.define('Guard_Post', 'props', guard_post())
    kit.define('Pillory_Stocks', 'props', pillory_stocks())
    kit.define('Statue_Plinth', 'props', statue_plinth())
    kit.define('Mine_Cart_Track', 'props', mine_cart_track())
    kit.define('Smelter_Stack', 'props', smelter_stack())
    kit.define('Stonehold_Ward_Pillar', 'props', stonehold_ward_pillar())
    kit.define('Winter_Supply_Sled', 'props', winter_supply_sled())
