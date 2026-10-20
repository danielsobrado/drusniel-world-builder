"""House wall modules: stone (ground floors, towers, church) and timber-framed plaster.

Contract: span local X 0..GRID, height 0..STORY, centred on y=0, exterior -Y,
interior +Y. Corner posts cover the joints where two walls meet.
"""
import math

from ..config import GRID, HALF_T as T, JETTY, JETTY_LEVELS, STORY, detailed
from ..mesh import MeshBuilder
from .carpentry import carved_relief_motif, iron_latch_and_ring, ornate_strap_hinge, recessed_panel_front

INTERIOR = {'+y': 'plaster'}
WINDOW = (0.65, 1.35, 1.0, 2.2)
TIMBER_WINDOW = (0.6, 1.4, 1.0, 2.2)
DOOR = (0.5, 1.5, 0.0, 2.2)


def panel(b, mat, y0, y1, hole=None, mats=None):
    """Solid wall panel with an optional rectangular opening (x0, x1, z0, z1)."""
    if hole is None:
        b.box((0, y0, 0), (GRID, y1, STORY), mat, mats=mats, skip=('-x', '+x', '-z'))
        return
    x0, x1, z0, z1 = hole
    b.box((0, y0, 0), (x0, y1, STORY), mat, mats=mats, skip=('-x', '-z'))
    b.box((x1, y0, 0), (GRID, y1, STORY), mat, mats=mats, skip=('+x', '-z'))
    if z0 > 0:
        b.box((x0, y0, 0), (x1, y1, z0), mat, mats=mats, skip=('-x', '+x', '-z'))
    b.box((x0, y0, z1), (x1, y1, STORY), mat, mats=mats, skip=('-x', '+x'))


def window_dressing(b, hole, stone):
    x0, x1, z0, z1 = hole
    f = 0.07
    # Outer chamfered casement surround
    for lo, hi in (((x0, -0.07, z0), (x0 + f, 0.06, z1)), ((x1 - f, -0.07, z0), (x1, 0.06, z1)),
                   ((x0 + f, -0.07, z0), (x1 - f, 0.06, z0 + f)),
                   ((x0 + f, -0.07, z1 - f), (x1 - f, 0.06, z1))):
        b.box(lo, hi, 'wood_trim')
    b.box((x0 + f, -0.02, z0 + f), (x1 - f, 0.02, z1 - f), 'glass', skip=('-x', '+x', '-z', '+z'))
    if detailed():
        xm = (x0 + x1) * 0.5
        zm = (z0 + z1) * 0.5
        # Central wooden mullion and transom bars + inner sash rebate + iron casement stay
        b.box((xm - 0.022, -0.045, z0 + f), (xm + 0.022, 0.038, z1 - f), 'wood_trim', bevel=0)
        b.box((x0 + f, -0.042, zm - 0.02), (x1 - f, 0.035, zm + 0.02), 'wood_trim', bevel=0)
        b.box((xm - 0.032, -0.052, zm - 0.032), (xm + 0.032, -0.042, zm + 0.032), 'iron', bevel=0)

    # Stepped molded window sill with under-sill corbel brackets
    sill_mat = 'stone_dressed' if stone else 'wood_trim'
    b.box((x0 - 0.12, -T - 0.14, z0 - 0.07), (x1 + 0.12, 0.0, z0 + 0.02), sill_mat)
    if detailed():
        b.box((x0 - 0.08, -T - 0.10, z0 - 0.12), (x1 + 0.08, -T + 0.02, z0 - 0.07), sill_mat)
        corbel_mat = 'stone_dressed' if stone else 'timber'
        for cx in (x0 - 0.02, x1 + 0.02):
            b.box((cx - 0.045, -T - 0.11, z0 - 0.22), (cx + 0.045, -T, z0 - 0.11), corbel_mat)
            b.box((cx - 0.035, -T - 0.07, z0 - 0.27), (cx + 0.035, -T, z0 - 0.22), corbel_mat)

    if stone and detailed():
        arched_head(b, (x0 + x1) / 2, z1, (x1 - x0) / 2)
    elif stone:
        b.box((x0 - 0.14, -T - 0.05, z1), (x1 + 0.14, -T + 0.04, z1 + 0.24), 'stone_dressed')
    elif detailed():
        # Projecting timber window hoodmould & drip cap
        b.box((x0 - 0.10, -T - 0.11, z1 + 0.08), (x1 + 0.10, -T, z1 + 0.15), 'wood_trim')

    # Carved exterior shutters with forged fleur-de-lis strap hinges and iron shutter dogs
    for sx0, sx1, sdir in ((x0 - 0.36, x0 - 0.04, -1), (x1 + 0.04, x1 + 0.36, 1)):
        b.box((sx0, -T - 0.07, z0 + 0.03), (sx1, -T - 0.03, z1 - 0.03), 'wood_trim')
        if detailed():
            zm = (z0 + z1) * 0.5
            recessed_panel_front(b, sx0 + 0.03, sx1 - 0.03, zm + 0.02, z1 - 0.06, -T - 0.072,
                                 depth=0.014, border=0.018, carved=True, style='knotwork')
            recessed_panel_front(b, sx0 + 0.03, sx1 - 0.03, z0 + 0.06, zm - 0.02, -T - 0.072,
                                 depth=0.014, border=0.018, carved=True, style='knotwork')
            hx = sx1 - 0.015 if sdir < 0 else sx0 + 0.015
            for hz in (z0 + 0.20, z1 - 0.20):
                ornate_strap_hinge(b, hx, hz, 0.22, -T - 0.07, dir_x=sdir)
            # Forged S-scroll shutter dog holdback at lower outer corner
            dx = sx0 + 0.05 if sdir < 0 else sx1 - 0.05
            b.box((dx - 0.014, -T - 0.082, z0 + 0.05), (dx + 0.014, -T - 0.068, z0 + 0.13), 'iron', bevel=0)


def arched_head(b, cx, z, r):
    """Round-headed window: a glazed lunette with radial tracery under a voussoir & hoodmould arch."""
    seg = 9
    arc = [(cx + r * math.cos(math.pi * i / seg), -T - 0.012, z + r * math.sin(math.pi * i / seg))
           for i in range(seg + 1)]
    b.poly(arc, 'glass', outward=(0, -1, 0))
    for i in range(seg):
        a0, a1 = math.pi * i / seg, math.pi * (i + 1) / seg
        pts = [(cx + r * math.cos(a), -T - 0.035, z + r * math.sin(a)) for a in (a0, a1)]
        pts += [(cx + (r + 0.06) * math.cos(a), -T - 0.035, z + (r + 0.06) * math.sin(a))
                for a in (a1, a0)]
        b.extrude(pts, (0, 0.035, 0), 'wood_trim')
    b.box((cx - r - 0.04, -T - 0.045, z - 0.04), (cx + r + 0.04, -T + 0.02, z + 0.03), 'wood_trim',
          bevel=0)
    if detailed():
        # Radial fan tracery mullion & spokes inside the arched lunette
        b.box((cx - 0.018, -T - 0.032, z), (cx + 0.018, -T + 0.005, z + r), 'wood_trim', bevel=0)
        for ang in (math.pi * 0.25, math.pi * 0.75):
            b.beam((cx, -T - 0.015, z + 0.02),
                   (cx + r * math.cos(ang), -T - 0.015, z + r * math.sin(ang)),
                   (0, 1, 0), (-0.016, 0.016), 0.028, 'wood_trim', bevel=0)
    voussoir_arch(b, cx, z, r + 0.06, r + 0.28, -T - 0.08, -T + 0.04, count=7)


def voussoir_arch(b, cx, base_z, r0, r1, y0, y1, count=7):
    """Dressed stones round a half circle over an opening; keystone stands proud,
    framed by a projecting dripstone hoodmould with carved label-stop corbels."""
    for i in range(count):
        a0, a1 = math.pi * i / count + 0.012, math.pi * (i + 1) / count - 0.012
        is_key = (i == count // 2)
        outer = r1 + (0.08 if is_key else 0.0)
        vy0 = y0 - (0.025 if is_key else 0.0)
        pts = [(cx + r0 * math.cos(a0), vy0, base_z + r0 * math.sin(a0)),
               (cx + outer * math.cos(a0), vy0, base_z + outer * math.sin(a0)),
               (cx + outer * math.cos(a1), vy0, base_z + outer * math.sin(a1)),
               (cx + r0 * math.cos(a1), vy0, base_z + r0 * math.sin(a1))]
        b.extrude(pts, (0, y1 - vy0, 0), 'stone_dressed')
    if detailed():
        # Projecting curved hoodmould / dripstone label ring + terminal label-stop bosses
        hm_r0, hm_r1 = r1 + 0.005, r1 + 0.065
        hy0 = y0 - 0.032
        for i in range(count):
            a0, a1 = math.pi * i / count, math.pi * (i + 1) / count
            pts = [(cx + hm_r0 * math.cos(a0), hy0, base_z + hm_r0 * math.sin(a0)),
                   (cx + hm_r1 * math.cos(a0), hy0, base_z + hm_r1 * math.sin(a0)),
                   (cx + hm_r1 * math.cos(a1), hy0, base_z + hm_r1 * math.sin(a1)),
                   (cx + hm_r0 * math.cos(a1), hy0, base_z + hm_r0 * math.sin(a1))]
            b.extrude(pts, (0, (y1 - hy0) * 0.55, 0), 'stone_dressed')
        for side in (-1, 1):
            lx = cx + side * (hm_r1 + 0.03)
            b.box((lx - 0.055, hy0 - 0.01, base_z - 0.06),
                  (lx + 0.055, y0 + 0.04, base_z + 0.05), 'stone_dressed')


def door_frame(b, stone):
    x0, x1, _, z1 = DOOR
    b.box((x0, -0.11, 0), (x0 + 0.085, 0.1, z1), 'wood_trim')
    b.box((x1 - 0.085, -0.11, 0), (x1, 0.1, z1), 'wood_trim')
    b.box((x0 + 0.085, -0.11, z1 - 0.09), (x1 - 0.085, 0.1, z1), 'wood_trim')
    # Two-tier dressed-stone threshold step
    b.box((x0 - 0.14, -T - 0.32, 0), (x1 + 0.14, -T + 0.02, 0.07), 'stone_dressed', skip=('-z',))
    b.box((x0 - 0.10, -T - 0.24, 0.07), (x1 + 0.10, -T + 0.04, 0.13), 'stone_dressed')
    if stone:
        voussoir_arch(b, (x0 + x1) / 2, z1 - 0.12, 0.52, 0.8, -T - 0.07, -T + 0.04)
        if detailed():
            # Alternating long-and-short dressed stone door jamb quoins
            for k in range(5):
                jz0 = 0.13 + k * 0.39 + 0.008
                jz1 = 0.13 + (k + 1) * 0.39 - 0.008
                w_jamb = 0.22 if k % 2 == 0 else 0.14
                b.box((x0 - w_jamb, -T - 0.06, jz0), (x0, -T + 0.03, jz1), 'stone_dressed')
                b.box((x1, -T - 0.06, jz0), (x1 + w_jamb, -T + 0.03, jz1), 'stone_dressed')
    elif detailed():
        # Carved lintel frieze beam over timber doors + capital corbels + projecting drip hood
        b.box((x0 - 0.05, -T - 0.075, z1), (x1 + 0.05, -T - 0.01, z1 + 0.14), 'wood_trim')
        carved_relief_motif(b, x0 + 0.04, x1 - 0.04, z1 + 0.02, z1 + 0.12, -T - 0.075, style='frieze')
        b.box((x0 - 0.10, -T - 0.115, z1 + 0.13), (x1 + 0.10, -T, z1 + 0.19), 'wood_trim')
        for jx in (x0 - 0.04, x1 + 0.04):
            b.box((jx - 0.04, -T - 0.095, z1 - 0.16), (jx + 0.04, -T - 0.01, z1), 'wood_trim')


def stone_wall(hole=None, door=False):
    b = MeshBuilder()
    panel(b, 'stone', -T, T, hole, INTERIOR)
    if detailed():
        # Dressed-stone string course / cornice belt at the top of the masonry story
        b.box((0, -T - 0.035, STORY - 0.14), (GRID, -T + 0.02, STORY), 'stone_dressed',
              skip=('-x', '+x'))
    if door:
        door_frame(b, stone=True)
    elif hole:
        window_dressing(b, hole, stone=True)
    return b


def _timber_beams(b, rails, posts, braces):
    for x0, x1, z0, z1 in rails + posts:
        b.box((x0, -T - 0.05, z0), (x1, 0.0, z1), 'timber')
    for (ax, az), (bx, bz) in braces:
        b.beam((ax, 0, az), (bx, 0, bz), (0, 1, 0), (-T - 0.035, -0.01), 0.13, 'timber')
        if detailed():
            # Oak mortise-and-tenon peg bosses (treenails) at brace ends
            for px, pz in ((ax + (bx - ax) * 0.12, az + (bz - az) * 0.12),
                           (ax + (bx - ax) * 0.88, az + (bz - az) * 0.88)):
                b.box((px - 0.016, -T - 0.062, pz - 0.016),
                      (px + 0.016, -T - 0.035, pz + 0.016), 'wood_trim', bevel=0)
    if detailed():
        # Molded drip lip under the top wall-plate & over the bottom sill plate
        b.box((0, -T - 0.068, STORY - 0.24), (GRID, -T - 0.04, STORY - 0.19), 'wood_trim',
              skip=('-x', '+x'))


def timber_wall(kind, level=0):
    """kind: 'plain' | 'window' | 'door'. level > 0 jetties the face out by level * JETTY
    over the story below, carried on joist ends and curved brackets."""
    b = MeshBuilder()
    out = level * JETTY
    top = (0, GRID, STORY - 0.22, STORY)
    ends = [(0, 0.1, 0.22, STORY - 0.22), (GRID - 0.1, GRID, 0.22, STORY - 0.22)]
    if kind == 'plain':
        panel(b, 'plaster', -0.1 - out, T, None, INTERIOR)
        start = b.mark()
        rails = [(0, GRID, 0, 0.22), top, (0.1, 1.9, 1.42, 1.58)]
        posts = ends + ([(0.94, 1.06, 0.22, 1.42), (0.94, 1.06, 1.58, STORY - 0.22)] if detailed() else [])
        braces = [((0.12, 0.22), (1.0, 1.42)), ((1.88, 0.22), (1.0, 1.42)),
                  ((0.12, 2.78), (1.0, 1.58)), ((1.88, 2.78), (1.0, 1.58))]
        _timber_beams(b, rails, posts, braces)
        if detailed():
            carved_relief_motif(b, 0.16, 1.84, 1.44, 1.56, -T - 0.05, style='frieze')
    elif kind == 'window':
        x0, x1, z0, z1 = TIMBER_WINDOW
        panel(b, 'plaster', -0.1 - out, T, TIMBER_WINDOW, INTERIOR)
        start = b.mark()
        rails = [(0, GRID, 0, 0.22), top, (x0, x1, z0 - 0.12, z0), (x0, x1, z1, z1 + 0.12),
                 (0.1, x0 - 0.1, 1.42, 1.58), (x1 + 0.1, 1.9, 1.42, 1.58)]
        posts = ends + [(x0 - 0.1, x0, 0.22, 2.78), (x1, x1 + 0.1, 0.22, 2.78)]
        braces = [((0.12, 0.22), (x0 - 0.1, 1.42)), ((1.88, 0.22), (x1 + 0.1, 1.42)),
                  ((0.12, 2.78), (x0 - 0.1, 1.58)), ((1.88, 2.78), (x1 + 0.1, 1.58))]
        _timber_beams(b, rails, posts, braces)
        window_dressing(b, TIMBER_WINDOW, stone=False)
    else:
        x0, x1, _, z1 = DOOR
        panel(b, 'plaster', -0.1 - out, T, DOOR, INTERIOR)
        start = b.mark()
        rails = [(0, x0 - 0.1, 0, 0.22), (x1 + 0.1, GRID, 0, 0.22), top,
                 (x0, x1, z1, z1 + 0.14)]
        posts = ends + [(x0 - 0.1, x0, 0, 2.78), (x1, x1 + 0.1, 0, 2.78)]
        braces = [((0.1, 0.22), (x0 - 0.1, 1.3)), ((1.9, 0.22), (x1 + 0.1, 1.3)),
                  ((0.1, 2.78), (x0 - 0.1, 2.36)), ((1.9, 2.78), (x1 + 0.1, 2.36))]
        _timber_beams(b, rails, posts, braces)
        door_frame(b, stone=False)
    if out:
        b.shift_from(start, (0, -out, 0))
        jetty_underside(b, level)
    return b


def jetty_underside(b, level, x0=0.0, x1=GRID):
    """Soffit, molded bressumer with carved frieze, joist ends and curved brackets under a jettied face."""
    out, below = level * JETTY, (level - 1) * JETTY
    face, under = -T - 0.05 - out, -T - below
    b.box((x0, face, -0.03), (x1, under, 0.0), 'planks', skip=('-x', '+x'))
    if not detailed():
        b.box((x0, face - 0.04, -0.2), (x1, face + 0.14, 0.0), 'timber', bevel=0)
        return
    # Stepped bressumer beam with carved frieze along the street fascia
    b.box((x0, face - 0.06, -0.2), (x1, face + 0.14, 0.02), 'timber')
    b.box((x0, face - 0.08, -0.04), (x1, face - 0.05, 0.025), 'wood_trim', skip=('-x', '+x'))
    b.box((x0, face - 0.075, -0.21), (x1, face - 0.05, -0.16), 'wood_trim', skip=('-x', '+x'))
    if x1 - x0 >= 0.6:
        carved_relief_motif(b, x0 + 0.14, x1 - 0.14, -0.155, -0.045, face - 0.06, style='frieze')
    for i in range(int((x1 - x0) / 0.4)):
        x = x0 + 0.2 + i * 0.4
        b.box((x - 0.06, face + 0.1, -0.17), (x + 0.06, under, -0.03), 'timber')
        b.box((x - 0.05, face + 0.06, -0.155), (x + 0.05, face + 0.11, -0.045), 'wood_trim')
    for x in (x0 + 0.16, x1 - 0.16):
        bracket(b, x, under, face + 0.1)


def bracket(b, x, wall_y, tip_y, drop=0.8):
    """Curved ogee timber bracket in the YZ plane from a wall face out to a jetty sill."""
    pts = []
    for i in range(6):
        t = i / 5
        y = wall_y + (tip_y - wall_y) * math.sin(t * math.pi / 2)
        z = -drop + drop * (1 - math.cos(t * math.pi / 2)) - 0.18
        pts.append((x, y, z))
    for p, q in zip(pts, pts[1:]):
        b.beam(p, q, (1, 0, 0), (-0.06, 0.06), 0.14, 'timber', bevel=0)
    b.box((x - 0.075, tip_y - 0.06, -0.24), (x + 0.075, tip_y + 0.08, -0.17), 'wood_trim')
    b.box((x - 0.08, wall_y - 0.1, -drop - 0.3), (x + 0.08, wall_y, -drop - 0.12), 'stone_dressed')


def jetty_corner(level, axis):
    """Corner post for a jettied front. axis 'y': the front is local -Y (front-left
    corner); axis 'x': the front is local -X (front-right corner, a quarter turn)."""
    out = level * JETTY
    b = MeshBuilder()
    h, reach = 0.17, -T - 0.07 - out
    lo, hi = ((-h, reach, 0), (h, h, STORY)) if axis == 'y' else ((reach, -h, 0), (h, h, STORY))
    b.box(lo, hi, 'timber')
    if detailed():
        side = MeshBuilder()
        bracket(side, -h + 0.02, -T - (level - 1) * JETTY, reach + 0.05)
        if axis == 'x':
            side.verts = [type(v)((v.y, v.x, v.z)) for v in side.verts]
            side.faces = [tuple(reversed(f)) for f in side.faces]
        _merge(b, side)
    return b


def _merge(b, other):
    base = len(b.verts)
    b.verts.extend(other.verts)
    b.uvs.extend(other.uvs)
    b.colors.extend(other.colors)
    for f, mi, sm in zip(other.faces, other.face_mats, other.face_smooth):
        b.faces.append(tuple(i + base for i in f))
        mat = other._mat_names[mi]
        if mat not in b._mat_names:
            b._mat_names.append(mat)
        b.face_mats.append(b._mat_names.index(mat))
        b.face_smooth.append(sm)


def door_leaf():
    """Hinged at local x=0; rotate around Z to open.
    AAA carved oak door with vertical stiles, horizontal rails, recessed Nordic/Celtic
    knotwork panels, wrought-iron fleur-de-lis strap hinges with rivets, and ring latch."""
    b = MeshBuilder()
    w, h = 0.84, 2.08
    # Core door slab and molded outer stiles/rails
    b.box((0.0, -0.036, 0.0), (w, 0.036, h), 'wood_trim', tone=0.90)
    stile = 0.085
    for sx0, sx1 in ((0.0, stile), (w - stile, w)):
        b.box((sx0, -0.044, 0.0), (sx1, 0.044, h), 'wood_trim', tone=0.96)
    for rz0, rz1 in ((0.0, 0.12), (0.88, 1.00), (1.72, 1.80), (h - 0.10, h)):
        b.box((stile, -0.042, rz0), (w - stile, 0.042, rz1), 'wood_trim', tone=0.94)

    # Top frieze panel + upper & lower carved knotwork square panels on exterior (-Y)
    px0, px1 = stile + 0.008, w - stile - 0.008
    recessed_panel_front(b, px0, px1, 1.80, h - 0.10, -0.044,
                         depth=0.018, border=0.018, carved=True, style='frieze')
    recessed_panel_front(b, px0, px1, 1.00, 1.72, -0.044,
                         depth=0.022, border=0.024, carved=True, style='knotwork')
    recessed_panel_front(b, px0, px1, 0.12, 0.88, -0.044,
                         depth=0.022, border=0.024, carved=True, style='knotwork')

    # Three ornate forged wrought-iron fleur-de-lis strap hinges and ring pull latch
    for hz in (0.34, 1.04, 1.74):
        ornate_strap_hinge(b, 0.025, hz, 0.56, -0.044, dir_x=1)
    iron_latch_and_ring(b, w - 0.11, 1.04, -0.044)
    return b


def corner(mat, half):
    b = MeshBuilder()
    b.box((-half, -half, 0), (half, half, STORY), mat, skip=('-z',))
    if detailed():
        if mat == 'timber':
            # Stone plinth shoe, mid-story collar, and capital necking on timber corner posts
            b.box((-half - 0.025, -half - 0.025, 0), (half + 0.025, half + 0.025, 0.24),
                  'stone_dressed', skip=('-z',))
            b.box((-half - 0.02, -half - 0.02, 1.42), (half + 0.02, half + 0.02, 1.58), 'wood_trim')
            b.box((-half - 0.025, -half - 0.025, STORY - 0.22),
                  (half + 0.025, half + 0.025, STORY), 'wood_trim')
        else:
            b.box((-half - 0.03, -half - 0.03, 0), (half + 0.03, half + 0.03, 0.32),
                  'stone_dressed', skip=('-z',))
            b.box((-half - 0.025, -half - 0.025, STORY - 0.16),
                  (half + 0.025, half + 0.025, STORY), 'stone_dressed')
    return b


def define(kit):
    kit.define('Wall_Stone', 'walls', stone_wall())
    kit.define('Wall_Stone_Window', 'walls', stone_wall(WINDOW))
    kit.define('Wall_Stone_Door', 'walls', stone_wall(DOOR, door=True))
    kit.define('Wall_Timber', 'walls', timber_wall('plain'))
    kit.define('Wall_Timber_Window', 'walls', timber_wall('window'))
    kit.define('Wall_Timber_Door', 'walls', timber_wall('door'))
    for level in JETTY_LEVELS:
        for kind, suffix in (('plain', ''), ('window', '_Window'), ('door', '_Door')):
            kit.define(f'Wall_Timber_J{level}{suffix}', 'walls', timber_wall(kind, level))
        kit.define(f'Corner_Timber_J{level}_L', 'walls', jetty_corner(level, 'y'))
        kit.define(f'Corner_Timber_J{level}_R', 'walls', jetty_corner(level, 'x'))
    kit.define('Corner_Stone', 'walls', corner('stone', 0.21))
    kit.define('Corner_Timber', 'walls', corner('timber', 0.17))
    kit.define('Door_Leaf', 'walls', door_leaf())
