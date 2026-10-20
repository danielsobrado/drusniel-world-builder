"""Goblin swamp-town Lego kit: modular stilt frames, boardwalks, open-frame watchtowers,
shanty walls, shaggy reed-thatch roofs, tarp canopies, and sagging rope suspension bridges.

Every module snaps to the 2 m grid (GRID = 2.0, STORY = 3.0, TERRACE = 1.5) so a
Goblin bayou town can be assembled like Lego from interchangeable components:
  - Foundations & Stilts : Plinth_Stilts, Plinth_Stilts_Corner, Entry_Steps_Stilts,
                           Stilt_Wall, Stilt_Wall_Pillar, Goblin_Stilt_Frame
  - Boardwalks & Ramps   : Tile_Swamp, Tile_Boardwalk, Boardwalk_Edge, Railing_Goblin,
                           Stairs_Boardwalk_1, Stairs_Boardwalk_2, Goblin_Ladder
  - Bridges & Catwalks   : Rope_Bridge (4 m), Rope_Bridge_Long (8 m), Goblin_Catwalk
  - Shanty Wall Panels   : Wall_Goblin, Wall_Goblin_Window, Wall_Goblin_Door,
                           Wall_Goblin_Arcade, Wall_Goblin_Frame, Corner_Goblin
  - Roofs & Canopies     : Roof_Goblin_S4/S6, Roof_Goblin_End_S4/S6,
                           Gable_Wall_Goblin_S4/S6, Roof_Goblin_Hut_4/6,
                           Goblin_Awning, Goblin_Tarp_Canopy, Banner_Goblin_Skull
"""
import math

from mathutils import Matrix

from ..config import (GRID, HALF_T as T, ROOF_OVERHANG as OVERHANG, ROOF_THICK as THICK,
                      STORY, TERRACE, detailed)
from ..mesh import MeshBuilder
from .foundations import BURY
from .roofs import END_LEN, ridge_height

GOBLIN_PITCH = math.radians(46)


def _at(x, y, z=0.0):
    return Matrix.Translation((x, y, z))


def _lash(b, x, y, z, r=0.11, h=0.14):
    """Coiled rope lashing around a timber joint."""
    seg = 8 if detailed() else 5
    b.lathe([(r, z - h / 2), (r + 0.015, z), (r, z + h / 2)], seg, 'rope',
            m=_at(x, y), smooth=False)


# ---------------------------------------------------------------------------
# Shanty Walls, Open Watchtower Scaffolding & Corners (span X 0..GRID, exterior -Y)
# ---------------------------------------------------------------------------

def wall_goblin(window=False, door=False, arcade=False):
    """Rough-hewn timber-and-plank shanty wall with crooked bark posts, diagonal
    cross-bracing, wattle patches, and firelit barred shutters."""
    b = MeshBuilder()
    if arcade:
        # Open post-and-brace porch bay so firelight and interior props are visible
        for px in (0.12, GRID - 0.12):
            b.beam((px, 0, 0), (px, 0, STORY), (0, 1, 0), (-T - 0.04, T + 0.04), 0.18, 'bark')
            _lash(b, px, -T, 0.25, r=0.11)
            _lash(b, px, -T, STORY - 0.28, r=0.11)
        b.box((0, -T - 0.04, STORY - 0.24), (GRID, T + 0.04, STORY), 'bark')
        b.beam((0.14, -T, 1.85), (0.68, -T, STORY - 0.18), (0, 1, 0), (-0.05, 0.05), 0.11, 'bark')
        b.beam((GRID - 0.14, -T, 1.85), (GRID - 0.68, -T, STORY - 0.18),
               (0, 1, 0), (-0.05, 0.05), 0.11, 'bark')
        if detailed():
            for hx in (0.65, 1.35):
                b.box((hx - 0.015, -T - 0.02, STORY - 0.56), (hx + 0.015, -T + 0.02, STORY - 0.22),
                      'rope')
                b.blob((hx, -T - 0.02, STORY - 0.62), 0.07, 'plaster', subdiv=1,
                       squash=(0.8, 0.8, 1.2), jitter=0.04, seed=int(hx * 10))
        return b

    # Base rough plank & wattle core
    if door:
        b.box((0, -T, 0), (0.55, T, STORY), 'planks', skip=('-x', '-z', '+z'))
        b.box((1.45, -T, 0), (GRID, T, STORY), 'planks', skip=('+x', '-z', '+z'))
        b.box((0.55, -T, 2.1), (1.45, T, STORY), 'planks', skip=('-z', '+z'))
    elif window:
        b.box((0, -T, 0), (0.58, T, STORY), 'planks', skip=('-x', '-z', '+z'))
        b.box((1.42, -T, 0), (GRID, T, STORY), 'planks', skip=('+x', '-z', '+z'))
        b.box((0.58, -T, 0), (1.42, T, 0.95), 'planks', skip=('-z',))
        b.box((0.58, -T, 1.95), (1.42, T, STORY), 'planks', skip=('+z',))
        # Warm fire-lit interior backing + crooked iron/bark bars (no white Tudor glass)
        b.box((0.60, -0.03, 0.97), (1.40, 0.03, 1.93), 'iron')
        b.box((0.64, -0.04, 1.02), (1.36, 0.02, 1.88), 'firelight')
        for bx in (0.82, 1.02, 1.20):
            b.beam((bx, -T - 0.01, 0.95), (bx + 0.02, -T - 0.01, 1.95),
                   (0, 1, 0), (-0.025, 0.025), 0.04, 'bark')
    else:
        b.box((0, -T, 0), (GRID, T, STORY), 'planks', skip=('-x', '+x', '-z', '+z'))

    # Heavy bark sill, mid-rail, and top plate
    out = -T - 0.04
    b.box((0, out, 0), (GRID, -T + 0.02, 0.16), 'bark', skip=('-x', '+x', '-z'))
    b.box((0, out, STORY - 0.18), (GRID, -T + 0.02, STORY), 'bark', skip=('-x', '+x', '+z'))
    if not door:
        b.box((0, out, 0.88), (GRID, -T + 0.02, 1.00), 'bark', skip=('-x', '+x'))

    # Diagonal X-bracing poles & crooked vertical battens
    if not door and not window:
        b.beam((0.08, out, 0.14), (0.98, out, 0.92), (0, 1, 0), (-0.03, 0.04), 0.09, 'bark')
        b.beam((1.92, out, 0.14), (1.02, out, 0.92), (0, 1, 0), (-0.03, 0.04), 0.09, 'bark')
        b.beam((0.10, out, 0.96), (0.96, out, STORY - 0.16), (0, 1, 0), (-0.03, 0.04), 0.09, 'bark')
        b.beam((1.90, out, 0.96), (1.04, out, STORY - 0.16), (0, 1, 0), (-0.03, 0.04), 0.09, 'bark')
        # Woven reed/thatch patch over planks
        if detailed():
            b.box((0.24, out - 0.01, 1.25), (0.86, -T + 0.01, 2.35), 'thatch')
    elif window:
        for x0, x1 in ((0.50, 0.62), (1.38, 1.50)):
            b.box((x0, out - 0.02, 0.88), (x1, T + 0.02, 2.02), 'bark')
        b.box((0.46, out - 0.04, 1.94), (1.54, T + 0.03, 2.08), 'bark')
        # Propped-open wooden plank shutter on the right side
        if detailed():
            b.beam((1.44, out - 0.02, 1.00), (1.82, out - 0.18, 1.04),
                   (0, 0, 1), (0.0, 0.88), 0.04, 'planks')
            _lash(b, 0.56, out, 1.98, r=0.08, h=0.10)
            _lash(b, 1.44, out, 1.98, r=0.08, h=0.10)
    elif door:
        b.beam((0.50, 0, 0), (0.54, 0, 2.22), (0, 1, 0), (out - 0.03, T + 0.03), 0.14, 'bark')
        b.beam((1.50, 0, 0), (1.46, 0, 2.22), (0, 1, 0), (out - 0.03, T + 0.03), 0.14, 'bark')
        b.beam((0.38, 0, 2.14), (1.62, 0, 2.20), (0, 1, 0), (out - 0.05, T + 0.04), 0.16, 'bark')
        _lash(b, 0.52, out, 2.16, r=0.10, h=0.14)
        _lash(b, 1.48, out, 2.16, r=0.10, h=0.14)
        if detailed():
            # Clan-mark board over the lintel: a trader's sign, not a trophy
            b.box((0.72, out - 0.06, 2.30), (1.28, out - 0.01, 2.62), 'planks')
            for mx in (0.86, 1.0, 1.14):
                b.box((mx - 0.018, out - 0.075, 2.36), (mx + 0.018, out - 0.055, 2.56), 'shadow', bevel=0)
            _lash(b, 0.78, out - 0.03, 2.62, r=0.035, h=0.06)
            _lash(b, 1.22, out - 0.03, 2.62, r=0.035, h=0.06)
    return b


def wall_goblin_frame():
    """Open X-braced log scaffolding panel (2 m wide x STORY tall). Used to build
    see-through stilt watchtower legs and elevated platform substructures."""
    b = MeshBuilder()
    for px in (0.10, GRID - 0.10):
        b.beam((px, 0, 0), (px, 0, STORY), (0, 1, 0), (-0.09, 0.09), 0.18, 'bark')
    # Horizontal ledger logs + heavy X-brace poles
    for z in (0.12, STORY / 2, STORY - 0.12):
        b.beam((0, 0, z), (GRID, 0, z), (0, 1, 0), (-0.07, 0.07), 0.14, 'bark')
        _lash(b, 0.12, 0, z, r=0.11, h=0.14)
        _lash(b, GRID - 0.12, 0, z, r=0.11, h=0.14)
    b.beam((0.12, -0.04, 0.12), (GRID - 0.12, -0.04, STORY / 2), (0, 1, 0), (-0.05, 0.05), 0.11, 'bark')
    b.beam((GRID - 0.12, 0.04, 0.12), (0.12, 0.04, STORY / 2), (0, 1, 0), (-0.05, 0.05), 0.11, 'bark')
    b.beam((0.12, -0.04, STORY / 2), (GRID - 0.12, -0.04, STORY - 0.12),
           (0, 1, 0), (-0.05, 0.05), 0.11, 'bark')
    b.beam((GRID - 0.12, 0.04, STORY / 2), (0.12, 0.04, STORY - 0.12),
           (0, 1, 0), (-0.05, 0.05), 0.11, 'bark')
    _lash(b, GRID / 2, 0, STORY * 0.26, r=0.09, h=0.12)
    _lash(b, GRID / 2, 0, STORY * 0.74, r=0.09, h=0.12)
    return b


def corner_goblin():
    """Heavy peeled-bark log corner post with triple rope lashings."""
    b = MeshBuilder()
    b.lathe([(0.13, 0.0), (0.12, STORY * 0.5), (0.13, STORY)], 7 if detailed() else 5,
            'bark', smooth=False)
    for z in (0.22, STORY * 0.5, STORY - 0.22):
        _lash(b, 0, 0, z, r=0.135, h=0.16)
    return b


# ---------------------------------------------------------------------------
# Stilt Foundations (Plinth_Stilts = 0.6 m high above deck/ground, buried -BURY)
# ---------------------------------------------------------------------------

STILT_H = 0.6


def plinth_stilts():
    """Open timber stilt foundation under a 2 m wall segment with cross-bracing and
    deck beam so buildings stand raised on wooden pilings."""
    b = MeshBuilder()
    b.box((0, -T - 0.16, STILT_H - 0.14), (GRID, T + 0.04, STILT_H), 'bark', skip=('-x', '+x'))
    b.box((0, -T - 0.22, STILT_H - 0.06), (GRID, -T - 0.14, STILT_H + 0.02), 'planks', skip=('-x', '+x'))
    for x in (0.35, 1.65):
        b.lathe([(0.11, -BURY), (0.10, STILT_H - 0.1)], 6, 'bark', m=_at(x, -T - 0.04), smooth=False)
        _lash(b, x, -T - 0.04, STILT_H - 0.18, r=0.115, h=0.12)
    b.beam((0.35, -T - 0.04, -0.15), (1.65, -T - 0.04, STILT_H - 0.16),
           (0, 1, 0), (-0.04, 0.04), 0.08, 'bark')
    b.beam((1.65, -T - 0.04, -0.15), (0.35, -T - 0.04, STILT_H - 0.16),
           (0, 1, 0), (-0.04, 0.04), 0.08, 'bark')
    return b


def plinth_stilts_corner():
    """Cluster of bound log pilings supporting a building corner."""
    b = MeshBuilder()
    b.box((-T - 0.18, -T - 0.18, STILT_H - 0.14), (T, T, STILT_H), 'bark')
    b.lathe([(0.14, -BURY), (0.13, STILT_H)], 7 if detailed() else 5,
            'bark', m=_at(-0.06, -0.06), smooth=False)
    _lash(b, -0.06, -0.06, STILT_H - 0.18, r=0.145, h=0.15)
    return b


def entry_steps_stilts(width=1.5):
    """Notched-log and plank gangway steps descending from a stilt-raised doorway."""
    b = MeshBuilder()
    x0, x1 = 1.0 - width / 2, 1.0 + width / 2
    face = -T - 0.16
    steps = 4
    run = 0.34
    for sy in (x0 + 0.08, x1 - 0.08):
        b.beam((sy, face, STILT_H - 0.06), (sy, face - steps * run, -0.05),
               (1, 0, 0), (-0.05, 0.05), 0.12, 'bark')
    for i in range(steps):
        z = STILT_H - (i + 0.5) * (STILT_H / steps)
        y = face - (i + 0.85) * run
        b.box((x0, y - 0.14, z - 0.04), (x1, y + 0.14, z + 0.03), 'planks')
    for sx in (x0 + 0.06, x1 - 0.06):
        b.beam((sx, face - steps * run, -BURY), (sx, face - steps * run, 0.65),
               (0, 1, 0), (-0.05, 0.05), 0.10, 'bark')
        _lash(b, sx, face - steps * run, 0.48, r=0.07, h=0.10)
    return b


# ---------------------------------------------------------------------------
# Shaggy Swamp-Reed Thatched Roofs & Open-Frame Watchtower Crow's Nests
# ---------------------------------------------------------------------------

def _shaggy_slope(b, x0, x1, span, pitch):
    """Thick layered swamp-reed thatch roof with exposed dark rafter poles."""
    half = span / 2
    apex = ridge_height(span, pitch)
    c, s = math.cos(pitch), math.sin(pitch)
    drop = OVERHANG * math.tan(pitch)
    for side, y_in, y_out, n_y in (
        ('front', half, -OVERHANG, -s),
        ('back', half, span + OVERHANG, s),
    ):
        pts = [
            (x0, y_out, -drop),
            (x1, y_out, -drop),
            (x1, y_in, apex),
            (x0, y_in, apex),
        ]
        b.extrude(pts, (0, n_y * THICK * 1.35, c * THICK * 1.35), 'thatch')
        # Stepped lower eave fringe bundle for a thick shaggy silhouette
        fringe_y = y_out + (0.45 if side == 'front' else -0.45)
        fringe_z = -drop + 0.45 * math.tan(pitch) + THICK * 1.15
        f_pts = [
            (x0, y_out, -drop + THICK * 0.4),
            (x1, y_out, -drop + THICK * 0.4),
            (x1, fringe_y, fringe_z),
            (x0, fringe_y, fringe_z),
        ]
        b.extrude(f_pts, (0, 0, 0.08), 'thatch')
        # Exposed crooked bark rafter poles running down the thatch
        if detailed():
            for rx in (x0 + 0.35, (x0 + x1) / 2, x1 - 0.35):
                b.beam((rx, y_in, apex + THICK * 1.25),
                       (rx, y_out + (-0.18 if side == 'front' else 0.18), -drop - 0.08),
                       (1, 0, 0), (-0.04, 0.04), 0.08, 'bark')


def roof_goblin_section(span):
    """2 m section of shaggy reed-thatch roof with bound ridge pole."""
    b = MeshBuilder()
    _shaggy_slope(b, 0.0, GRID, span, GOBLIN_PITCH)
    apex = ridge_height(span, GOBLIN_PITCH)
    b.beam((-0.05, span / 2, apex + THICK * 1.35),
           (GRID + 0.05, span / 2, apex + THICK * 1.35),
           (0, 1, 0), (-0.08, 0.08), 0.16, 'bark')
    for rx in (0.45, 1.55):
        _lash(b, rx, span / 2, apex + THICK * 1.35, r=0.09, h=0.12)
    return b


def roof_goblin_end(span):
    """Gable overhang eave with protruding ridge pole, crossed horn-poles, and skull."""
    b = MeshBuilder()
    _shaggy_slope(b, 0.0, END_LEN, span, GOBLIN_PITCH)
    apex = ridge_height(span, GOBLIN_PITCH)
    b.beam((-0.55, span / 2, apex + THICK * 1.35),
           (END_LEN + 0.1, span / 2, apex + THICK * 1.35),
           (0, 1, 0), (-0.09, 0.09), 0.18, 'bark')
    _lash(b, 0.0, span / 2, apex + THICK * 1.35, r=0.11, h=0.14)
    # Crossed gable horn-poles (X-horns at the roof peak, matching reference image)
    for sy in (-1, 1):
        b.beam((-0.18, span / 2 - sy * 0.45, apex - 0.25),
               (-0.18, span / 2 + sy * 0.38, apex + THICK * 1.35 + 0.52),
               (1, 0, 0), (-0.04, 0.04), 0.08, 'bark')
    return b


def gable_wall_goblin(span):
    """Rough vertical-plank gable triangle with bark king-post and struts."""
    b = MeshBuilder()
    apex = ridge_height(span, GOBLIN_PITCH)
    pts = [(0, 0, 0), (0, span, 0), (0, span / 2, apex)]
    b.extrude(pts, (2 * T, 0, 0), 'planks')
    b.beam((0.0, span / 2, 0), (0.0, span / 2, apex), (0, 1, 0), (-0.07, 0.07), 0.14, 'bark')
    b.beam((0.0, 0.15, 0.08), (0.0, span - 0.15, 0.08), (0, 0, 1), (-0.06, 0.06), 0.12, 'bark')
    for sy in (-1, 1):
        b.beam((0.0, span / 2, 0.15), (0.0, span / 2 + sy * (span * 0.26), apex * 0.52),
               (1, 0, 0), (-0.05, 0.05), 0.10, 'bark')
    return b


def roof_goblin_hut(size):
    """Watchtower Crow's Nest Module: cantilevered timber lookout platform with
    crooked railings, corner blazing torches, a central shuttered sentry cabin,
    and an overhanging conical reed-thatch roof."""
    b = MeshBuilder()
    cx = cy = size / 2
    out = 0.48
    # Cantilevered lookout platform deck & heavy support joists
    b.box((-out, -out, -0.14), (size + out, size + out, 0.08), 'planks')
    for d in (0.2, size / 2, size - 0.2):
        b.beam((-out - 0.12, d, -0.18), (size + out + 0.12, d, -0.18),
               (0, 1, 0), (-0.08, 0.08), 0.16, 'bark')
    # Perimeter lookout railing + 4 corner posts + blazing corner torches
    corners = [(-out + 0.12, -out + 0.12), (size + out - 0.12, -out + 0.12),
               (size + out - 0.12, size + out - 0.12), (-out + 0.12, size + out - 0.12)]
    for i, (px, py) in enumerate(corners):
        b.beam((px, py, 0.0), (px, py, 1.15), (0, 1, 0), (-0.06, 0.06), 0.12, 'bark')
        nx, ny = corners[(i + 1) % 4]
        b.beam((px, py, 0.88), (nx, ny, 0.88), (0, 0, 1), (-0.04, 0.04), 0.08, 'bark')
        b.beam((px, py, 0.44), (nx, ny, 0.44), (0, 0, 1), (-0.03, 0.03), 0.06, 'rope')
        # Tall corner torch pole with blazing fire basket
        if i < 2:
            tx = px + (-0.15 if px < cx else 0.15)
            ty = py - 0.15
            b.beam((px, py, 0.1), (tx, ty, 2.55), (0, 1, 0), (-0.05, 0.05), 0.10, 'bark')
            b.lathe([(0.0, 2.48), (0.14, 2.52), (0.18, 2.72), (0.0, 2.68)], 7, 'iron',
                    m=_at(tx, ty))
            b.lathe([(0.0, 2.64), (0.14, 2.72), (0.0, 3.05)], 6, 'glow', m=_at(tx, ty))

    # Compact central sentry cabin on the platform (inset so guards can walk around it)
    inset = 0.55
    hut_h = 2.05
    b.box((inset, inset, 0.08), (size - inset, size - inset, hut_h), 'planks')
    for hx in (inset, size - inset):
        for hy in (inset, size - inset):
            b.beam((hx, hy, 0.08), (hx, hy, hut_h + 0.15), (0, 1, 0), (-0.08, 0.08), 0.16, 'bark')
            _lash(b, hx, hy, hut_h - 0.15, r=0.10, h=0.14)
    # Warm fire-lit lookout slit windows on all 4 sides of the sentry cabin
    w_half = 0.34
    for side_y in (inset - 0.03, size - inset + 0.03):
        b.box((cx - w_half, side_y - 0.03, 0.92), (cx + w_half, side_y + 0.03, 1.58), 'glow')
        b.box((cx - w_half - 0.06, side_y - 0.05, 1.54),
              (cx + w_half + 0.06, side_y + 0.05, 1.66), 'bark')
    for side_x in (inset - 0.03, size - inset + 0.03):
        b.box((side_x - 0.03, cy - w_half, 0.92), (side_x + 0.03, cy + w_half, 1.58), 'glow')

    # Shaggy conical 8-sided reed-thatch roof overhanging the sentry cabin
    r_eave = size * 0.66
    r_mid = size * 0.36
    apex = hut_h + size * 0.52
    seg = 8
    for i in range(seg):
        a0 = 2 * math.pi * i / seg
        a1 = 2 * math.pi * (i + 1) / seg
        p0 = (cx + math.cos(a0) * r_eave, cy + math.sin(a0) * r_eave, hut_h - 0.22)
        p1 = (cx + math.cos(a1) * r_eave, cy + math.sin(a1) * r_eave, hut_h - 0.22)
        pm0 = (cx + math.cos(a0) * r_mid, cy + math.sin(a0) * r_mid, hut_h + (apex - hut_h) * 0.5)
        pm1 = (cx + math.cos(a1) * r_mid, cy + math.sin(a1) * r_mid, hut_h + (apex - hut_h) * 0.5)
        top = (cx, cy, apex)
        b.extrude([p0, p1, pm1, pm0], (0, 0, 0.22), 'thatch')
        b.extrude([pm0, pm1, top], (0, 0, 0.24), 'thatch')
        if detailed():
            b.beam(top, p0, (0, 0, 1), (-0.04, 0.04), 0.08, 'bark')
    # Central spiked finial pole
    b.lathe([(0.09, apex - 0.2), (0.06, apex + 0.65), (0.01, apex + 1.05)], 6,
            'bark', m=_at(cx, cy), smooth=False)
    _lash(b, cx, cy, apex + 0.25, r=0.09, h=0.14)
    return b


# ---------------------------------------------------------------------------
# Accents: Slanted Porch Awning, Open Tarp Canopy & Goblin Skull Clan Banner
# ---------------------------------------------------------------------------

def goblin_awning():
    """Slanted reed-thatch porch awning propped on angled bark struts with hanging cured meat."""
    b = MeshBuilder()
    b.extrude([(0.0, 0.0, 0.08), (GRID, 0.0, 0.08),
               (GRID, -0.95, -0.42), (0.0, -0.95, -0.42)], (0, 0, 0.11), 'thatch')
    for x in (0.12, 1.0, GRID - 0.12):
        b.beam((x, 0.02, 0.12), (x, -1.02, -0.46), (1, 0, 0), (-0.04, 0.04), 0.08, 'bark')
    for x in (0.14, GRID - 0.14):
        b.beam((x, 0.0, -0.92), (x, -0.78, -0.36), (1, 0, 0), (-0.035, 0.035), 0.07, 'bark')
    b.beam((-0.06, -0.92, -0.40), (GRID + 0.06, -0.92, -0.40),
           (0, 1, 0), (-0.04, 0.04), 0.08, 'bark')
    if detailed():
        for bx in (0.55, 1.45):
            b.lathe([(0.0, -0.78), (0.045, -0.68), (0.035, -0.50), (0.0, -0.42)],
                    6, 'cloth_red', m=_at(bx, -0.88))
    return b


def goblin_tarp_canopy():
    """Large 4 x 2.6 m sagging hide-and-thatch porch canopy stretched out on crooked
    bark poles in front of a longhouse or cooking deck (matches right-hand hut in reference)."""
    b = MeshBuilder()
    # Four crooked support poles (-2.0..2.0 along X, -1.2..1.2 along Y)
    poles = [
        ((-1.85, -1.15, 0.0), (-1.78, -1.10, 2.15)),
        ((1.85, -1.15, 0.0), (1.80, -1.08, 2.10)),
        ((-1.85, 1.10, 0.0), (-1.82, 1.05, 2.75)),
        ((1.85, 1.10, 0.0), (1.82, 1.05, 2.72)),
    ]
    for p0, p1 in poles:
        b.beam(p0, p1, (0, 1, 0), (-0.065, 0.065), 0.13, 'bark')
    # Perimeter cross-poles & diagonal braces
    b.beam((-1.95, -1.10, 2.10), (1.95, -1.08, 2.06), (0, 0, 1), (-0.05, 0.05), 0.10, 'bark')
    b.beam((-1.95, 1.05, 2.70), (1.95, 1.05, 2.68), (0, 0, 1), (-0.05, 0.05), 0.10, 'bark')
    for sx in (-1.80, 0.0, 1.80):
        b.beam((sx, 1.12, 2.72), (sx, -1.18, 2.06), (1, 0, 0), (-0.045, 0.045), 0.09, 'bark')
    # Sagging two-panel hide & reed-thatch canopy roof + hanging lantern
    b.extrude([(-1.98, 1.15, 2.74), (1.98, 1.15, 2.72),
               (1.98, -0.05, 2.32), (-1.98, -0.05, 2.34)], (0, 0, 0.08), 'thatch')
    b.extrude([(-1.92, 0.05, 2.36), (1.92, 0.05, 2.34),
               (1.92, -1.22, 2.08), (-1.92, -1.22, 2.10)], (0, 0, 0.06), 'hide')
    b.box((-0.08, -0.95, 1.68), (0.08, -0.79, 1.94), 'iron')
    b.box((-0.06, -0.93, 1.71), (0.06, -0.81, 1.90), 'glow')
    return b


def banner_goblin_skull():
    """Clan trade cloth on a lashed crossbar: an earth-dyed hanging with a woven lozenge
    mark (Grukmar brief: clan marks, never skull-and-bones everywhere)."""
    b = MeshBuilder()
    b.beam((-0.52, -0.06, 0.0), (0.52, -0.06, 0.0), (0, 1, 0), (-0.04, 0.04), 0.08, 'bark')
    _lash(b, -0.38, -0.06, 0.0, r=0.055, h=0.09)
    _lash(b, 0.38, -0.06, 0.0, r=0.055, h=0.09)
    pts = [
        (-0.42, -0.07, -0.02), (0.42, -0.07, -0.02),
        (0.40, -0.09, -1.18), (0.22, -0.08, -0.98),
        (0.0, -0.09, -1.32), (-0.22, -0.08, -0.98),
        (-0.40, -0.09, -1.18),
    ]
    b.extrude(pts, (0, -0.03, 0), 'cloth_red')
    # Woven lozenge between two bars
    b.extrude([(0.0, -0.105, -0.30), (0.16, -0.105, -0.52), (0.0, -0.105, -0.74), (-0.16, -0.105, -0.52)],
              (0, -0.012, 0), 'rope')
    for bz in (-0.18, -0.86):
        b.box((-0.30, -0.115, bz - 0.03), (0.30, -0.103, bz + 0.03), 'rope', bevel=0)
    return b


# ---------------------------------------------------------------------------
# Swamp Water, Stilt Boardwalks, Ramps, Ladders & Rope Suspension Bridges
# ---------------------------------------------------------------------------

def tile_swamp():
    """2x2 m murky swamp water tile with marsh reed clumps and floating lily pads."""
    b = MeshBuilder()
    b.poly([(0, 0, 0), (GRID, 0, 0), (GRID, GRID, 0), (0, GRID, 0)], 'water', outward=(0, 0, 1))
    reeds = [(0.32, 0.38, 0.55), (0.42, 0.30, 0.48), (1.62, 1.48, 0.62), (1.70, 1.36, 0.45)]
    for rx, ry, rh in reeds:
        b.beam((rx, ry, -0.05), (rx + 0.04, ry - 0.03, rh),
               (0, 1, 0), (-0.015, 0.015), 0.03, 'foliage')
    if detailed():
        for lx, ly, lr in ((0.85, 1.35, 0.16), (1.35, 0.55, 0.13)):
            b.lathe([(0.0, 0.01), (lr, 0.01), (lr, 0.025), (0.0, 0.025)], 7,
                    'grass', m=_at(lx, ly), smooth=False)
    return b


def tile_boardwalk():
    """2x2 m uneven weathered plank boardwalk deck laid over heavy log stringers."""
    b = MeshBuilder()
    for y in (0.28, 1.72):
        b.box((0, y - 0.08, -0.16), (GRID, y + 0.08, -0.02), 'bark', skip=('-x', '+x'))
    n_planks = 6
    step = GRID / n_planks
    for i in range(n_planks):
        x0 = i * step + 0.015
        x1 = (i + 1) * step - 0.015
        dy = (0.04 if i % 2 == 0 else -0.03)
        dz = (0.012 if i % 3 == 0 else 0.0)
        b.box((x0, max(0.0, dy), -0.04 + dz), (x1, min(GRID, GRID + dy), 0.02 + dz), 'planks')
    return b


def stilt_wall(pillar=False):
    """Open timber stilt pilings and diagonal cross-braces supporting a boardwalk terrace edge."""
    b = MeshBuilder()
    b.box((0, -0.08, TERRACE - 0.16), (GRID, 0.24, TERRACE), 'bark', skip=('-x', '+x'))
    for x in (0.25, 1.75):
        b.lathe([(0.11, -0.35), (0.10, TERRACE)], 6, 'bark', m=_at(x, 0.06), smooth=False)
        _lash(b, x, 0.06, TERRACE - 0.22, r=0.115, h=0.14)
    b.beam((0.25, 0.06, 0.05), (1.75, 0.06, TERRACE - 0.18), (0, 1, 0), (-0.04, 0.04), 0.09, 'bark')
    b.beam((1.75, 0.06, 0.05), (0.25, 0.06, TERRACE - 0.18), (0, 1, 0), (-0.04, 0.04), 0.09, 'bark')
    if pillar:
        b.lathe([(0.14, -0.35), (0.12, TERRACE + 0.85)], 7 if detailed() else 5,
                'bark', m=_at(1.0, -0.12), smooth=False)
        _lash(b, 1.0, -0.12, TERRACE - 0.10, r=0.135, h=0.16)
        b.beam((1.0, -0.12, TERRACE + 0.45), (1.0, -0.46, TERRACE + 0.35),
               (1, 0, 0), (-0.03, 0.03), 0.06, 'bark')
        b.lathe([(0.0, TERRACE + 0.02), (0.09, TERRACE + 0.06),
                 (0.11, TERRACE + 0.24), (0.0, TERRACE + 0.32)], 6,
                'iron', m=_at(1.0, -0.44))
        b.lathe([(0.0, TERRACE + 0.08), (0.07, TERRACE + 0.12),
                 (0.07, TERRACE + 0.22), (0.0, TERRACE + 0.25)], 6,
                'glow', m=_at(1.0, -0.44))
    return b


def boardwalk_edge():
    """Bound log curb along the outer edge of an elevated stilt boardwalk."""
    b = MeshBuilder()
    b.beam((0, 0.08, 0.04), (GRID, 0.08, 0.04), (0, 1, 0), (-0.09, 0.09), 0.14, 'bark')
    for x in (0.45, 1.55):
        _lash(b, x, 0.08, 0.04, r=0.095, h=0.12)
    return b


def railing_goblin():
    """Crooked peeled-bark stake and sagging rope railing along boardwalks."""
    b = MeshBuilder()
    for x, tilt in ((0.12, 0.04), (1.05, -0.05), (GRID - 0.12, 0.03)):
        b.beam((x, 0.16, -0.08), (x + tilt, 0.14, 0.96), (0, 1, 0), (-0.05, 0.05), 0.10, 'bark')
        _lash(b, x + tilt * 0.8, 0.15, 0.80, r=0.065, h=0.10)
    b.beam((0.0, 0.15, 0.80), (1.05, 0.14, 0.72), (0, 1, 0), (-0.025, 0.025), 0.05, 'rope')
    b.beam((1.05, 0.14, 0.72), (GRID, 0.15, 0.80), (0, 1, 0), (-0.025, 0.025), 0.05, 'rope')
    b.beam((0.0, 0.15, 0.42), (GRID, 0.15, 0.38), (0, 1, 0), (-0.02, 0.02), 0.04, 'rope')
    return b


def stairs_boardwalk(units):
    """Sloped log-and-plank boardwalk ramp climbing `units * TERRACE` over `(units + 1) * GRID`."""
    b = MeshBuilder()
    rise = units * TERRACE
    run = (units + 1) * GRID
    steps = units * 8
    for sx in (0.18, GRID - 0.18):
        b.beam((sx, 0.0, -0.05), (sx, run, rise - 0.05), (1, 0, 0), (-0.08, 0.08), 0.18, 'bark')
        b.beam((sx, run * 0.5, -0.35), (sx, run * 0.5, rise * 0.5),
               (0, 1, 0), (-0.07, 0.07), 0.14, 'bark')
        b.beam((sx, 0.08, 0.0), (sx, 0.08, 0.92), (0, 1, 0), (-0.05, 0.05), 0.10, 'bark')
        b.beam((sx, run - 0.08, rise), (sx, run - 0.08, rise + 0.92),
               (0, 1, 0), (-0.05, 0.05), 0.10, 'bark')
        b.beam((sx, 0.08, 0.78), (sx, run - 0.08, rise + 0.78),
               (1, 0, 0), (-0.025, 0.025), 0.05, 'rope')
    for i in range(steps):
        t0 = i / steps
        t1 = (i + 0.82) / steps
        y0, y1 = t0 * run, t1 * run
        z = (i + 0.5) / steps * rise
        b.box((0.06, y0, z - 0.04), (GRID - 0.06, y1, z + 0.04), 'planks')
    return b


def goblin_ladder():
    """3 m lashed bark-pole ladder for climbing stilt frames and watchtower decks."""
    b = MeshBuilder()
    for sx in (-0.28, 0.28):
        b.beam((sx, 0.0, 0.0), (sx, 0.0, STORY + 0.35), (0, 1, 0), (-0.04, 0.04), 0.08, 'bark')
    for i in range(9):
        z = 0.25 + i * 0.34
        b.beam((-0.32, -0.04, z), (0.32, -0.04, z + (i % 2 - 0.5) * 0.03),
               (0, 0, 1), (-0.025, 0.025), 0.05, 'bark')
    return b


def rope_bridge(span=4.0, depth=2.0, height=3.0):
    """Sagging rope-and-plank suspension bridge spanning `span` m along X at z=height."""
    b = MeshBuilder()
    sag_max = 0.28 if span <= 4.0 else 0.55

    def sag_z(x):
        u = (x / span) * 2.0 - 1.0
        return height - sag_max * (1.0 - u * u)

    for px in (0.14, span - 0.14):
        for py in (0.14, depth - 0.14):
            b.lathe([(0.13, -0.3), (0.11, height + 1.35)], 6, 'bark', m=_at(px, py), smooth=False)
            _lash(b, px, py, height + 0.92, r=0.12, h=0.16)
            if detailed():
                b.blob((px, py, height + 1.44), 0.10, 'plaster', subdiv=1,
                       squash=(0.85, 0.9, 1.15), jitter=0.04, seed=int(px * 10 + py))

    n_planks = int(span * 3.5)
    dx = span / n_planks
    for i in range(n_planks):
        xm = (i + 0.5) * dx
        z = sag_z(xm)
        b.box((xm - dx * 0.38, 0.16, z - 0.04), (xm + dx * 0.38, depth - 0.16, z + 0.03), 'planks')

    segs = 8 if span <= 4.0 else 14
    for k in range(segs):
        x0 = k * span / segs
        x1 = (k + 1) * span / segs
        z0, z1 = sag_z(x0), sag_z(x1)
        for py in (0.14, depth - 0.14):
            b.beam((x0, py, z0 - 0.04), (x1, py, z1 - 0.04),
                   (0, 1, 0), (-0.03, 0.03), 0.06, 'rope')
            b.beam((x0, py, z0 + 0.92), (x1, py, z1 + 0.92),
                   (0, 1, 0), (-0.025, 0.025), 0.05, 'rope')
            if k > 0:
                b.beam((x0, py, z0 - 0.02), (x0, py, z0 + 0.92),
                       (0, 1, 0), (-0.015, 0.015), 0.03, 'rope')
    return b


def define(kit):
    kit.define('Wall_Goblin', 'walls', wall_goblin())
    kit.define('Wall_Goblin_Window', 'walls', wall_goblin(window=True))
    kit.define('Wall_Goblin_Door', 'walls', wall_goblin(door=True))
    kit.define('Wall_Goblin_Arcade', 'walls', wall_goblin(arcade=True))
    kit.define('Wall_Goblin_Frame', 'walls', wall_goblin_frame())
    kit.define('Corner_Goblin', 'walls', corner_goblin())

    kit.define('Plinth_Stilts', 'foundations', plinth_stilts())
    kit.define('Plinth_Stilts_Corner', 'foundations', plinth_stilts_corner())
    kit.define('Entry_Steps_Stilts', 'foundations', entry_steps_stilts())

    for span in (4, 6):
        key = f'S{span}'
        kit.define(f'Roof_Goblin_{key}', 'roofs', roof_goblin_section(span))
        kit.define(f'Roof_Goblin_End_{key}', 'roofs', roof_goblin_end(span))
        kit.define(f'Gable_Wall_Goblin_{key}', 'roofs', gable_wall_goblin(span))
        kit.define(f'Roof_Goblin_Hut_{span}', 'roofs', roof_goblin_hut(span))

    kit.define('Goblin_Awning', 'accents', goblin_awning())
    kit.define('Goblin_Tarp_Canopy', 'accents', goblin_tarp_canopy())
    kit.define('Banner_Goblin_Skull', 'accents', banner_goblin_skull())

    kit.define('Tile_Swamp', 'terrain', tile_swamp())
    kit.define('Tile_Boardwalk', 'terrain', tile_boardwalk())
    kit.define('Stilt_Wall', 'terrain', stilt_wall(pillar=False))
    kit.define('Stilt_Wall_Pillar', 'terrain', stilt_wall(pillar=True))
    kit.define('Boardwalk_Edge', 'terrain', boardwalk_edge())
    kit.define('Railing_Goblin', 'terrain', railing_goblin())
    kit.define('Stairs_Boardwalk_1', 'terrain', stairs_boardwalk(1))
    kit.define('Stairs_Boardwalk_2', 'terrain', stairs_boardwalk(2))
    kit.define('Goblin_Ladder', 'terrain', goblin_ladder())
    kit.define('Rope_Bridge', 'terrain', rope_bridge(span=4.0))
    kit.define('Rope_Bridge_Long', 'terrain', rope_bridge(span=8.0))
