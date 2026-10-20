"""Silhouette accents from the storybook-town reference: corbelled corner turrets,
gable-end chimney stacks, oriel windows, balconies, hanging shop signs,
weathervanes and gable spikes, plus a tiered fountain and hanging vines.

Wall-mounted accents follow the wall contract (exterior -Y, origin on the wall
face line unless noted); building-corner accents sit on the corner where the
front (-Y) and left (-X) walls meet.
"""
import math

from mathutils import Matrix, Vector

from ..config import (HALF_T as T, JETTY, JETTY_LEVELS, ROOF_PITCH, ROOF_SPANS, STORY, detailed,
                      jetty_key)
from ..mesh import MeshBuilder, frame
from .carpentry import carved_relief_motif
from .roofs import STEEP_PITCH, ridge_height

SEG = 12


def _at(x, y, z=0.0):
    return Matrix.Translation((x, y, z))


def turret(radius=0.8, height=STORY + 0.5):
    """Round bartizan corbelled out of a building corner; origin on the corner at
    the story floor. The body rises past the wall top into a slate cone."""
    b = MeshBuilder()
    c = _at(-0.3, -0.3)
    seg = SEG if detailed() else 8
    # Stepped concentric dressed-stone corbel courses at base of bartizan
    b.lathe([(0.0, -1.45), (0.22, -1.35), (0.42, -0.95), (0.46, -0.90),
             (0.64, -0.50), (0.68, -0.44), (radius + 0.04, -0.14),
             (radius + 0.08, -0.10), (radius + 0.08, 0.04)], seg,
            'stone_dressed', m=c, smooth=False)
    b.lathe([(radius, 0.04), (radius, height)], seg, 'plaster', m=c, smooth=False)
    b.lathe([(radius + 0.06, height - 0.04), (radius + 0.09, height + 0.18)], seg, 'timber', m=c, smooth=False)
    b.lathe([(0.0, height + 0.18), (radius + 0.32, height + 0.18)], seg, 'planks', m=c, smooth=False)
    apex = height + 0.18 + 2.7
    b.lathe([(radius + 0.34, height + 0.16), (radius + 0.32, height + 0.22), (0.0, apex)], seg,
            'roof', m=c, smooth=False)
    if detailed():
        b.lathe([(0.0, apex - 0.1), (0.055, apex - 0.04), (0.03, apex + 0.55), (0.0, apex + 0.62)], 6,
                'iron', m=c)
        b.blob((-0.3, -0.3, apex + 0.3), 0.08, 'gold', subdiv=1, jitter=0)
        for z in (0.04, 0.9, 2.0):
            b.lathe([(radius + 0.035, z), (radius + 0.035, z + 0.12)], seg, 'timber', m=c, smooth=False)
        # Vertical half-timber studs around the turret drum
        for i in range(8):
            ang = 2 * math.pi * i / 8
            sx = -0.3 + math.cos(ang) * (radius + 0.015)
            sy = -0.3 + math.sin(ang) * (radius + 0.015)
            b.box((sx - 0.035, sy - 0.035, 0.04), (sx + 0.035, sy + 0.035, height), 'timber', bevel=0)
    angle = math.radians(225)
    out = Vector((math.cos(angle), math.sin(angle), 0))
    centre = Vector((-0.3, -0.3, 1.45)) + out * (radius + 0.012)
    m = frame(centre, (-out.y, out.x, 0), (0, 0, 1))
    b.box((-0.24, -0.02, -0.6), (0.24, 0.0, 0.6), 'glass', m=m, bevel=0)
    for lo, hi in (((-0.3, -0.06, -0.66), (-0.24, 0.0, 0.66)), ((0.24, -0.06, -0.66), (0.3, 0.0, 0.66)),
                   ((-0.3, -0.06, 0.6), (0.3, 0.0, 0.68)), ((-0.34, -0.11, -0.74), (0.34, 0.0, -0.6)),
                   ((-0.025, -0.05, -0.6), (0.025, -0.01, 0.6)),
                   ((-0.24, -0.05, -0.02), (0.24, -0.01, 0.02))):
        b.box(lo, hi, 'wood_trim', m=m)
    return b


def chimney_breast(height=STORY, width=1.3, depth=0.6, bottom=0.0):
    """Stone breast against the outside of a left (-X) wall; origin on the wall's centre
    line at the breast's mid-width."""
    b = MeshBuilder()
    x0, x1 = -T - depth, -T + 0.02
    b.box((x0, -width / 2, bottom), (x1, width / 2, height), 'stone', skip=('-z', '+z'))
    if detailed() and height >= 1.5:
        # Dressed stone corner quoins on the outer corners of the chimney breast
        course = 0.42
        steps = int((height - bottom) / course)
        for k in range(steps):
            z0 = bottom + k * course + 0.01
            z1 = bottom + (k + 1) * course - 0.01
            dx = 0.26 if k % 2 == 0 else 0.16
            dy = 0.18 if k % 2 == 0 else 0.28
            for sy in (-1, 1):
                cy = sy * (width / 2 + 0.015)
                b.box((x0 - 0.015, min(cy, cy - sy * dy), z0),
                      (x0 + dx, max(cy, cy - sy * dy), z1), 'stone_dressed')
    return b


def chimney_stack(top):
    """The breast's free-standing upper part from the wall top to `top` metres above it,
    stepping in at a sloped weathering and ending in a corbelled cap and two pots."""
    b = MeshBuilder()
    x0, x1 = -T - 0.6, -T + 0.02
    b.box((x0, -0.65, 0.0), (x1, 0.65, 0.5), 'stone', skip=('-z', '+z'))
    b.poly([(x0, -0.65, 0.5), (x1, -0.65, 0.5), (x1, -0.4, 0.85), (x0, -0.4, 0.85)],
           'stone_dressed', outward=(0, -1, 1))
    b.poly([(x0, 0.65, 0.5), (x0, 0.4, 0.85), (x1, 0.4, 0.85), (x1, 0.65, 0.5)],
           'stone_dressed', outward=(0, 1, 1))
    b.box((x0, -0.4, 0.5), (x1, 0.4, top - 0.22), 'stone', skip=('-z',))
    # Stepped corbelled oversailing crown in dressed stone
    b.box((x0 - 0.05, -0.45, top - 0.26), (x1 + 0.05, 0.45, top - 0.16), 'stone_dressed')
    b.box((x0 - 0.10, -0.50, top - 0.16), (x1 + 0.10, 0.50, top), 'stone_dressed')
    if detailed():
        for y in (-0.19, 0.19):
            cx = (x0 + x1) / 2
            b.box((cx - 0.14, y - 0.14, top), (cx + 0.14, y + 0.14, top + 0.05), 'stone_dressed')
            b.lathe([(0.12, top + 0.05), (0.14, top + 0.15), (0.10, top + 0.38),
                     (0.13, top + 0.42), (0.13, top + 0.46), (0.08, top + 0.46)],
                    8, 'roof_terracotta', m=_at(cx, y), smooth=True)
    return b


def oriel(width=1.3, depth=0.45, height=1.55):
    """Three-faced timber bay window projecting from a wall; origin on the wall face at
    the bay's sill."""
    b = MeshBuilder()
    half, inset = width / 2, 0.25
    plan = [(-half, 0.0), (-half + inset, -depth), (half - inset, -depth), (half, 0.0)]
    # Molded apron base & stepped crown cornice
    b.extrude([(x, y, -0.34) for x, y in plan], (0, 0, 0.22), 'wood_trim')
    b.extrude([(x, y, -0.12) for x, y in plan], (0, 0, 0.12), 'timber')
    b.extrude([(x, y, height) for x, y in plan], (0, 0, 0.12), 'timber')
    roof_top = height + 0.52
    for (ax, ay), (bx, by) in zip(plan, plan[1:]):
        out_dir = (-(by - ay), bx - ax, 0.6)
        b.poly([(ax, ay, height + 0.12), (bx, by, height + 0.12), (bx * 0.4, 0.02, roof_top),
                (ax * 0.4, 0.02, roof_top)], 'roof', outward=out_dir)
        b.poly([(ax, ay, 0.0), (bx, by, 0.0), (bx, by, height), (ax, ay, height)], 'glass',
               outward=((by - ay), -(bx - ax), 0))
        if detailed():
            b.beam((ax, ay, height + 0.12), (ax * 0.4, 0.02, roof_top), out_dir, (-0.03, 0.03), 0.07, 'roof')
    for x, y in plan:
        b.box((x - 0.05, y - 0.05, -0.34), (x + 0.05, y + 0.05, height + 0.12), 'timber', bevel=0)
    for (ax, ay), (bx, by) in zip(plan, plan[1:]):
        mid = ((ax + bx) / 2, (ay + by) / 2)
        b.box((mid[0] - 0.03, mid[1] - 0.04, 0.0), (mid[0] + 0.03, mid[1] + 0.02, height), 'wood_trim',
              bevel=0)
        b.beam((ax, ay - 0.01, height * 0.62), (bx, by - 0.01, height * 0.62), (0, 0, 1),
               (-0.03, 0.03), 0.05, 'wood_trim', bevel=0)
    if detailed():
        # Carved relief frieze on the front apron facet of the oriel window
        carved_relief_motif(b, -half + inset + 0.06, half - inset - 0.06, -0.31, -0.15, -depth, style='frieze')
        for x in (-half + 0.18, half - 0.18):
            b.beam((x, 0.0, -0.82), (x, -depth + 0.10, -0.32), (1, 0, 0), (-0.05, 0.05), 0.12,
                   'timber', bevel=0)
            b.box((x - 0.06, -0.08, -0.90), (x + 0.06, 0.0, -0.74), 'stone_dressed')
    return b


def balcony(width=1.8, depth=0.75):
    """Timber balcony on brackets with a turned balustrade, carved bressumer frieze,
    and flower boxes; origin on the wall face at the story floor."""
    b = MeshBuilder()
    half = width / 2
    b.box((-half, -depth, -0.14), (half, 0.0, 0.0), 'timber')
    for x in (-half + 0.2, half - 0.2):
        b.beam((x, 0.0, -0.85), (x, -depth + 0.1, -0.14), (1, 0, 0), (-0.06, 0.06), 0.14, 'timber',
               bevel=0)
        if detailed():
            b.box((x - 0.07, -0.09, -0.92), (x + 0.07, 0.0, -0.76), 'stone_dressed')
    rail = 1.0
    posts = [(-half + 0.04, -depth + 0.04), (half - 0.04, -depth + 0.04), (-half + 0.04, -0.05),
             (half - 0.04, -0.05)]
    for x, y in posts:
        b.box((x - 0.055, y - 0.055, 0.0), (x + 0.055, y + 0.055, rail + 0.04), 'wood_trim')
    b.box((-half - 0.02, -depth - 0.02, rail - 0.06), (half + 0.02, -depth + 0.08, rail + 0.02), 'wood_trim')
    for side in (-1, 1):
        b.box((side * half - 0.04, -depth, rail - 0.06), (side * half + 0.04, 0.0, rail + 0.02), 'wood_trim')
    if detailed():
        carved_relief_motif(b, -half + 0.12, half - 0.12, -0.12, -0.02, -depth, style='frieze')
    step = 0.18 if detailed() else 0.36
    x = -half + 0.2
    while x < half - 0.15:
        if detailed():
            b.lathe([(0.026, 0.0), (0.032, 0.14), (0.020, 0.32), (0.034, 0.50),
                     (0.020, 0.72), (0.028, rail - 0.06)], 6, 'wood_trim',
                    m=_at(x, -depth + 0.035, 0.0))
        else:
            b.box((x - 0.022, -depth + 0.01, 0.0), (x + 0.022, -depth + 0.06, rail - 0.06), 'timber', bevel=0)
        x += step
    b.box((-half + 0.15, -depth - 0.14, rail - 0.3), (half - 0.15, -depth + 0.0, rail - 0.12), 'wood_trim')
    b.blob((0, -depth - 0.07, rail - 0.1), 0.6, 'flowers', subdiv=2 if detailed() else 1,
           squash=(1.2, 0.25, 0.25), jitter=0.25, seed=17)
    return b


SIGN_ICONS = {
    'Mug': [[(-0.12, 0.12), (0.1, 0.12), (0.1, -0.16), (-0.12, -0.16)],
            [(0.1, 0.06), (0.2, 0.06), (0.2, -0.1), (0.1, -0.1)]],
    'Boot': [[(-0.06, 0.18), (0.06, 0.18), (0.06, -0.06), (-0.06, -0.06)],
             [(-0.06, -0.06), (0.06, -0.06), (0.22, -0.1), (0.22, -0.18), (-0.06, -0.18)]],
    'Key': [[(-0.2, 0.06), (-0.12, 0.14), (-0.04, 0.06), (-0.12, -0.02)],
            [(-0.06, 0.04), (0.2, 0.04), (0.2, 0.0), (-0.06, 0.0)],
            [(0.12, 0.0), (0.16, 0.0), (0.16, -0.08), (0.12, -0.08)]],
    'Anvil': [[(-0.22, 0.10), (0.18, 0.10), (0.12, 0.02), (-0.12, 0.02)],
              [(-0.08, 0.02), (0.08, 0.02), (0.14, -0.14), (-0.14, -0.14)]],
    'Loaf': [[(-0.20, -0.04), (-0.16, 0.10), (0.0, 0.15), (0.16, 0.10), (0.20, -0.04),
              (0.18, -0.12), (-0.18, -0.12)]],
    'Potion': [[(-0.05, 0.18), (0.05, 0.18), (0.04, 0.06), (-0.04, 0.06)],
               [(-0.04, 0.06), (0.04, 0.06), (0.16, -0.06), (0.12, -0.16), (-0.12, -0.16),
                (-0.16, -0.06)]],
    'Shield': [[(-0.16, 0.16), (0.16, 0.16), (0.14, -0.02), (0.0, -0.18), (-0.14, -0.02)]],
    'Book': [[(-0.18, 0.12), (-0.02, 0.08), (-0.02, -0.14), (-0.18, -0.10)],
             [(0.02, 0.08), (0.18, 0.12), (0.18, -0.10), (0.02, -0.14)]],
}


def shop_sign(icon):
    """Board hung from a wrought-iron scrollwork arm, framed in carved oak with a gilt trade emblem."""
    b = MeshBuilder()
    b.box((-0.05, -0.04, -0.52), (0.05, 0.0, 0.12), 'iron')
    b.box((-0.04, -0.95, -0.03), (0.04, 0.0, 0.04), 'iron')
    b.beam((0, -0.04, -0.45), (0, -0.55, 0.0), (1, 0, 0), (-0.015, 0.015), 0.03, 'iron', bevel=0)
    # Framed oak signboard with molded outer stiles/rails
    b.box((-0.03, -0.88, -0.72), (0.03, -0.22, -0.12), 'carved_wood', tone=0.88)
    for y0, y1 in ((-0.89, -0.83), (-0.27, -0.21)):
        b.box((-0.042, y0, -0.73), (0.042, y1, -0.11), 'wood_trim')
    for z0, z1 in ((-0.73, -0.67), (-0.17, -0.11)):
        b.box((-0.04, -0.83, z0), (0.04, -0.27, z1), 'wood_trim')
    for y in (-0.82, -0.28):
        b.box((-0.015, y - 0.01, -0.12), (0.015, y + 0.03, -0.03), 'iron')
    if detailed():
        # Spear-tip finial on iron bracket & decorative scroll bars
        b.lathe([(0.0, -0.03), (0.04, 0.0), (0.0, 0.06)], 6, 'iron', m=_at(0, -0.98, 0.0))
        b.beam((0, -0.04, -0.24), (0, -0.28, -0.02), (1, 0, 0), (-0.012, 0.012), 0.024, 'iron', bevel=0)
    for side in (-1, 1):
        x = side * 0.032
        for shape in SIGN_ICONS[icon]:
            pts = [(x, -0.55 + u * side, -0.42 + v) for u, v in shape]
            b.extrude(pts, (side * 0.014, 0, 0), 'gold')
    return b


def weathervane(height=1.0):
    """Iron rod with compass arms and a cockerel pennant; origin at its foot."""
    b = MeshBuilder()
    b.lathe([(0.03, 0.0), (0.025, height)], 6, 'iron')
    arm = height * 0.55
    for dx, dy in ((0.3, 0), (0, 0.3)):
        b.beam((-dx, -dy, arm), (dx, dy, arm), (0, 0, 1), (-0.01, 0.01), 0.02, 'iron', bevel=0)
    bird = [(-0.28, 0.0), (-0.1, 0.02), (0.02, 0.16), (0.12, 0.1), (0.2, 0.18), (0.24, 0.06),
            (0.12, -0.08), (-0.18, -0.06)]
    b.extrude([(u, -0.01, height + v) for u, v in bird], (0, 0.02, 0), 'iron')
    return b


def gable_spike(height=0.9):
    """Turned oak finial standing on a gable apex with pendant drop (origin at the apex)."""
    b = MeshBuilder()
    b.lathe([(0.0, -0.42), (0.055, -0.32), (0.032, -0.18), (0.09, -0.05), (0.09, 0.02),
             (0.055, 0.14), (0.105, 0.30), (0.04, 0.50), (0.065, 0.64), (0.0, height)],
            8, 'wood_trim')
    return b


def fountain():
    """Tiered stone fountain: octagonal basin with dressed coping, fluted pedestal, upper bowl and spout."""
    b = MeshBuilder()
    b.lathe([(1.68, 0.0), (1.68, 0.14), (1.58, 0.14), (1.58, 0.56), (1.64, 0.56),
             (1.64, 0.64), (1.40, 0.64), (1.40, 0.12)], 8, 'stone_dressed', smooth=False,
            phase=math.pi / 8)
    b.lathe([(1.40, 0.46), (0.0, 0.46)], 8, 'water', phase=math.pi / 8)
    b.lathe([(0.36, 0.45), (0.28, 0.62), (0.21, 1.22), (0.32, 1.32)], 8, 'stone_dressed')
    b.lathe([(0.32, 1.32), (0.82, 1.42), (0.88, 1.56), (0.74, 1.56), (0.25, 1.46)], 12, 'stone_dressed')
    b.lathe([(0.74, 1.5), (0.0, 0.15 if False else 1.5)], 12, 'water')
    b.lathe([(0.14, 1.5), (0.09, 1.98), (0.17, 2.08), (0.10, 2.22), (0.0, 2.34)], 8, 'stone_dressed')
    if detailed():
        for i in range(4):
            ang = i * math.pi / 2
            b.box((math.cos(ang) * 0.24 - 0.04, math.sin(ang) * 0.24 - 0.04, 1.98),
                  (math.cos(ang) * 0.24 + 0.04, math.sin(ang) * 0.24 + 0.04, 2.06), 'gold')
    return b


def hanging_vine(length=1.5, seed=31):
    """Strands of trailing ivy hung from a ledge; origin on the ledge, wall at -Y."""
    b = MeshBuilder()
    strands = ((-0.55, 1.0), (-0.25, 0.75), (0.05, 1.0), (0.35, 0.6), (0.6, 0.85))
    for i, (x, scale) in enumerate(strands):
        drop = length * scale
        count = 4 if detailed() else 2
        for k in range(count):
            t = (k + 0.5) / count
            b.blob((x + 0.04 * math.sin(i + k), -0.08, -drop * t), 0.15 * (1.1 - 0.5 * t), 'foliage',
                   subdiv=1, squash=(0.9, 0.35, 1.5), jitter=0.3, seed=seed + i * 5 + k)
        if detailed() and i % 2 == 0:
            b.blob((x, -0.12, -drop * 0.4), 0.07, 'flowers', subdiv=1, seed=seed + 50 + i)
    return b


def stack_height(span, pitch):
    return ridge_height(span, pitch) + 1.4


def define(kit):
    kit.define('Turret_Corner', 'accents', turret())
    kit.define('Chimney_Breast', 'accents', chimney_breast())
    for name, height in (('Low', 0.3), ('High', 0.6)):
        kit.define(f'Chimney_Breast_Plinth_{name}', 'accents', chimney_breast(height, bottom=-0.4))
    for set_name, pitch in (('Gable', ROOF_PITCH), ('Steep', STEEP_PITCH)):
        levels = (0,) + JETTY_LEVELS if set_name == 'Gable' else (0,)
        for span in ROOF_SPANS:
            for level in levels:
                wide = span + level * JETTY
                kit.define(f'Chimney_Stack_{set_name}_{jetty_key(span, level)}', 'accents',
                           chimney_stack(stack_height(wide, pitch)))
    kit.define('Oriel_Window', 'accents', oriel())
    kit.define('Balcony', 'accents', balcony())
    for icon in SIGN_ICONS:
        kit.define(f'Sign_{icon}', 'accents', shop_sign(icon))
    kit.define('Gable_Spike', 'accents', gable_spike())
    kit.define('Weathervane', 'accents', weathervane())
    kit.define('Fountain', 'props', fountain())
    kit.define('Vine_Hanging', 'nature', hanging_vine())
