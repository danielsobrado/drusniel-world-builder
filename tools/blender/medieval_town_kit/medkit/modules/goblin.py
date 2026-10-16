"""Goblin swamp-town architecture, stilt foundations, boardwalks and rope bridges.

Inspired by the murky bayou stilt-village reference: peeled bark pilings lashed
with rope, uneven plank boardwalks over dark water, shaggy reed-thatch roofs
with protruding ridge poles and hide patches, slanted porch awnings, skull clan
banners, high X-braced watchtowers, and sagging rope suspension bridges.
"""
import math

from mathutils import Matrix

from ..config import (GRID, HALF_T as T, ROOF_OVERHANG as OVERHANG, ROOF_THICK as THICK,
                      STORY, TERRACE, detailed)
from ..mesh import MeshBuilder
from .foundations import BURY
from .roofs import END_LEN, ridge_height

GOBLIN_PITCH = math.radians(48)


def _at(x, y, z=0.0):
    return Matrix.Translation((x, y, z))


def _lash(b, x, y, z, r=0.11, h=0.14):
    """Coiled rope lashing around a timber joint."""
    seg = 8 if detailed() else 5
    b.lathe([(r, z - h / 2), (r + 0.015, z), (r, z + h / 2)], seg, 'cloth_cream',
            m=_at(x, y), smooth=False)


# -- Shanty walls & corners ---------------------------------------------------

def wall_goblin(window=False, door=False, open_front=False):
    """Rough plank-and-log shanty wall (span X 0..GRID, centred on y=0, exterior -Y)."""
    b = MeshBuilder()
    # Heavy bark corner/mid posts and horizontal sill/top logs
    for x in (0.08, GRID - 0.08):
        b.beam((x, -0.02, 0.0), (x, 0.02, STORY), (0, 1, 0), (-0.09, 0.09), 0.18, 'bark', bevel=0)
    b.box((0.0, -T - 0.02, 0.0), (GRID, T + 0.02, 0.16), 'bark')
    b.box((0.0, -T - 0.03, STORY - 0.18), (GRID, T + 0.03, STORY), 'bark')

    if open_front:
        # Open cookhouse/market bay with diagonal braces and a tattered hide valance
        b.beam((0.1, -0.02, 2.15), (0.65, -0.02, STORY - 0.12), (0, 1, 0), (-0.06, 0.06), 0.12, 'bark', bevel=0)
        b.beam((GRID - 0.1, -0.02, 2.15), (GRID - 0.65, -0.02, STORY - 0.12), (0, 1, 0),
               (-0.06, 0.06), 0.12, 'bark', bevel=0)
        b.box((0.12, -T - 0.04, 2.35), (GRID - 0.12, -T + 0.04, STORY - 0.16), 'cloth_cream')
        return b

    if door:
        # Left and right plank panels around a 0.9 m doorway (0.55..1.45, z 0..2.12)
        b.box((0.0, -T, 0.16), (0.55, T, STORY - 0.18), 'planks', skip=('-z', '+z'))
        b.box((1.45, -T, 0.16), (GRID, T, STORY - 0.18), 'planks', skip=('-z', '+z'))
        b.box((0.55, -T, 2.12), (1.45, T, STORY - 0.18), 'planks', skip=('+z',))
        for x in (0.52, 1.48):
            b.beam((x, -0.02, 0.0), (x, 0.0, 2.22), (0, 1, 0), (-0.08, 0.08), 0.18, 'bark', bevel=0)
        b.beam((0.46, -0.03, 2.14), (1.54, 0.01, 2.20), (0, 0, 1), (-0.09, 0.09), 0.18, 'bark', bevel=0)
        if detailed():
            _lash(b, 0.52, -0.06, 2.15, 0.11, 0.14)
            _lash(b, 1.48, -0.06, 2.15, 0.11, 0.14)
        return b

    if window:
        # Crooked window opening (0.55..1.45, z 0.95..2.05) with warm glowing pane & lashed bars
        b.box((0.0, -T, 0.16), (0.55, T, STORY - 0.18), 'planks', skip=('-z', '+z'))
        b.box((1.45, -T, 0.16), (GRID, T, STORY - 0.18), 'planks', skip=('-z', '+z'))
        b.box((0.55, -T, 0.16), (1.45, T, 0.95), 'planks', skip=('-z',))
        b.box((0.55, -T, 2.05), (1.45, T, STORY - 0.18), 'planks', skip=('+z',))
        b.box((0.55, -0.02, 0.95), (1.45, 0.02, 2.05), 'glass', bevel=0)
        for x in (0.53, 1.47):
            b.beam((x, -0.02, 0.88), (x, 0.0, 2.12), (0, 1, 0), (-0.06, 0.06), 0.15, 'bark', bevel=0)
        for z in (0.92, 2.08):
            b.beam((0.48, -0.03, z), (1.52, 0.0, z + 0.03), (0, 0, 1), (-0.06, 0.06), 0.16, 'bark', bevel=0)
        b.beam((1.0, -0.04, 0.95), (1.02, -0.04, 2.05), (0, 1, 0), (-0.025, 0.025), 0.05, 'bark', bevel=0)
        b.beam((0.55, -0.04, 1.48), (1.45, -0.04, 1.52), (0, 0, 1), (-0.025, 0.025), 0.05, 'bark', bevel=0)
    else:
        b.box((0.0, -T, 0.16), (GRID, T, STORY - 0.18), 'planks', skip=('-z', '+z'))

    if detailed():
        # Diagonal rough pole braces and mismatched patch boards on the exterior face
        b.beam((0.12, -T - 0.02, 0.18), (0.98, -T - 0.02, 1.45), (0, 1, 0), (-0.05, 0.05), 0.08, 'bark', bevel=0)
        b.beam((GRID - 0.12, -T - 0.02, 0.18), (1.02, -T - 0.02, 1.45), (0, 1, 0),
               (-0.05, 0.05), 0.08, 'bark', bevel=0)
        b.box((0.0, -T - 0.03, 1.42), (GRID, -T + 0.01, 1.54), 'bark')
    return b


def corner_goblin():
    """Heavy peeled-bark corner post with rope lashings at base, mid and top."""
    b = MeshBuilder()
    seg = 8 if detailed() else 5
    b.lathe([(0.16, 0.0), (0.14, 1.5), (0.15, STORY)], seg, 'bark', smooth=False)
    if detailed():
        for z in (0.22, 1.48, STORY - 0.22):
            _lash(b, 0.0, 0.0, z, 0.16, 0.16)
    return b


# -- Stilt foundations & entry ramps ------------------------------------------

def plinth_stilts(height=0.6):
    """Peeled-bark stilt pilings driven into the mud under a 2 m wall segment."""
    b = MeshBuilder()
    seg = 7 if detailed() else 5
    for x in (0.45, 1.55):
        b.lathe([(0.11, -BURY), (0.10, height)], seg, 'bark', m=_at(x, -0.04), smooth=False)
        if detailed():
            _lash(b, x, -0.04, height - 0.14, 0.11, 0.12)
    # Top bearer log and diagonal cross-brace
    b.box((0.0, -T - 0.12, height - 0.14), (GRID, T + 0.06, height), 'bark')
    if detailed():
        b.beam((0.45, -0.05, -0.15), (1.55, -0.05, height - 0.14), (0, 1, 0),
               (-0.045, 0.045), 0.08, 'bark', bevel=0)
        b.beam((1.55, -0.05, -0.15), (0.45, -0.05, height - 0.14), (0, 1, 0),
               (-0.045, 0.045), 0.08, 'bark', bevel=0)
    return b


def plinth_stilts_corner(height=0.6):
    """Cluster of three lashed corner pilings."""
    b = MeshBuilder()
    seg = 7 if detailed() else 5
    for dx, dy, r in ((0.0, 0.0, 0.13), (-0.14, -0.12, 0.09), (0.12, -0.14, 0.09)):
        b.lathe([(r, -BURY), (r * 0.92, height)], seg, 'bark', m=_at(dx, dy), smooth=False)
    _lash(b, -0.02, -0.06, height - 0.16, 0.22, 0.16)
    return b


def entry_steps_stilts(height=0.6, width=1.45):
    """Rough log-and-plank ramp with half-log cleats descending from a goblin doorway."""
    b = MeshBuilder()
    run = 1.35
    x0, x1 = 1.0 - width / 2, 1.0 + width / 2
    face = -T - 0.10
    # Two inclined stringer logs
    for x in (x0 + 0.12, x1 - 0.12):
        b.beam((x, face, height - 0.06), (x, face - run, -0.04), (1, 0, 0),
               (-0.06, 0.06), 0.12, 'bark', bevel=0)
        b.lathe([(0.08, -BURY), (0.08, 0.15)], 6, 'bark', m=_at(x, face - run + 0.08), smooth=False)
    # Plank steps / log cleats along the ramp
    steps = 5
    for i in range(steps):
        t0, t1 = i / steps, (i + 0.92) / steps
        y_hi = face - t0 * run
        y_lo = face - t1 * run
        z_top = height * (1.0 - i / steps)
        b.box((x0, y_lo, z_top - 0.08), (x1, y_hi, z_top), 'planks')
    return b


# -- Shaggy thatched roofs & watchtower tops ----------------------------------

def roof_goblin_section(span, length=GRID, end=False):
    """Shaggy swamp-reed thatch roof section with protruding rafter poles and hide patches."""
    b = MeshBuilder()
    half = span / 2
    apex = ridge_height(span, GOBLIN_PITCH)
    drop = OVERHANG * math.tan(GOBLIN_PITCH)
    rise = THICK / math.cos(GOBLIN_PITCH)
    profile = [(0, -OVERHANG, -drop), (0, half, apex), (0, span + OVERHANG, -drop),
               (0, span + OVERHANG, -drop + rise), (0, half, apex + rise), (0, -OVERHANG, -drop + rise)]
    b.extrude(profile, (length, 0, 0), 'thatch')
    # Protruding peeled-bark ridge pole
    b.beam((-0.12 if end else 0.0, half, apex + rise - 0.02),
           (length + (0.12 if end else 0.0), half, apex + rise + 0.02),
           (0, 1, 0), (-0.09, 0.09), 0.18, 'bark', bevel=0)
    if detailed():
        # Crooked rafter poles poking past the eaves and a patched hide tarp on the slope
        poles = (0.2,) if end else (0.35, 1.35)
        for x in poles:
            b.beam((x, half, apex + rise), (x + 0.04, -OVERHANG - 0.22, -drop - 0.08),
                   (1, 0, 0), (-0.045, 0.045), 0.09, 'bark', bevel=0)
            b.beam((x, half, apex + rise), (x - 0.04, span + OVERHANG + 0.22, -drop - 0.08),
                   (1, 0, 0), (-0.045, 0.045), 0.09, 'bark', bevel=0)
        if not end:
            z0 = 0.25 * apex + rise + 0.01
            z1 = 0.72 * apex + rise + 0.01
            y0, y1 = 0.25 * half, 0.72 * half
            b.poly([(0.25, y0, z0), (1.65, y0, z0), (1.55, y1, z1), (0.35, y1, z1)],
                   'cloth_cream', outward=(0, -1, 1))
    return b


def gable_wall_goblin(span):
    """Plank-and-wattle gable triangle with rough vertical bark poles."""
    b = MeshBuilder()
    half = span / 2
    apex = ridge_height(span, GOBLIN_PITCH)
    b.extrude([(T, 0, 0), (T, span, 0), (T, half, apex)], (-2 * T, 0, 0), 'planks')
    b.beam((0, 0, 0), (0, span, 0), (0, 0, 1), (-T - 0.03, T + 0.03), 0.14, 'bark', bevel=0)
    b.beam((-0.02, half, 0.0), (-0.02, half, apex), (0, 1, 0), (-0.07, 0.07), 0.14, 'bark', bevel=0)
    if detailed():
        # Crossed horn/branch apex poles with a skull trophy at the peak
        b.beam((-0.08, half - 0.45, apex - 0.35), (-0.08, half + 0.35, apex + 0.48),
               (1, 0, 0), (-0.04, 0.04), 0.08, 'bark', bevel=0)
        b.beam((-0.08, half + 0.45, apex - 0.35), (-0.08, half - 0.35, apex + 0.48),
               (1, 0, 0), (-0.04, 0.04), 0.08, 'bark', bevel=0)
        b.blob((-0.14, half, apex + 0.05), 0.14, 'plaster', subdiv=1, squash=(0.8, 0.9, 1.1), seed=19)
    return b


def roof_goblin_hut(size):
    """Open-sided stilt watchtower crown: railed lookout deck, four corner poles,
    blazing corner torches, and a shaggy conical thatch roof above."""
    b = MeshBuilder()
    c = size / 2
    deck_h = 2.25
    # Four corner support poles and X-braced guardrail around the open lookout platform
    for x in (0.18, size - 0.18):
        for y in (0.18, size - 0.18):
            b.beam((x, y, 0.0), (x, y, deck_h + 0.15), (1, 0, 0), (-0.09, 0.09), 0.18, 'bark', bevel=0)
            if detailed():
                _lash(b, x, y, 0.95, 0.11, 0.12)
                _lash(b, x, y, deck_h - 0.1, 0.11, 0.12)
    # Guardrails on all 4 sides
    for y in (0.18, size - 0.18):
        b.beam((0.1, y, 0.95), (size - 0.1, y, 0.98), (0, 1, 0), (-0.05, 0.05), 0.1, 'bark', bevel=0)
        b.beam((0.1, y, 0.48), (size - 0.1, y, 0.45), (0, 1, 0), (-0.04, 0.04), 0.08, 'bark', bevel=0)
    for x in (0.18, size - 0.18):
        b.beam((x, 0.1, 0.95), (x, size - 0.1, 0.98), (1, 0, 0), (-0.05, 0.05), 0.1, 'bark', bevel=0)
        b.beam((x, 0.1, 0.48), (x, size - 0.1, 0.45), (1, 0, 0), (-0.04, 0.04), 0.08, 'bark', bevel=0)
    # Flaming corner torch poles on the two front corners
    for x in (-0.15, size + 0.15):
        b.beam((x, -0.15, 0.0), (x, -0.15, deck_h + 0.55), (1, 0, 0), (-0.05, 0.05), 0.1, 'bark', bevel=0)
        b.lathe([(0.05, deck_h + 0.45), (0.14, deck_h + 0.65), (0.11, deck_h + 0.68)], 6, 'iron',
                m=_at(x, -0.15), smooth=False)
        b.blob((x, -0.15, deck_h + 0.72), 0.13, 'glow', subdiv=1, squash=(0.9, 0.9, 1.5), jitter=0.15, seed=7)
    # Conical shaggy thatched roof above the lookout poles
    r_eave = size * 0.68
    apex = deck_h + 1.85 + size * 0.22
    seg = 10 if detailed() else 6
    b.lathe([(0.0, deck_h), (r_eave, deck_h), (0.16, apex), (0.0, apex + 0.35)], seg, 'thatch',
            m=_at(c, c), smooth=False)
    b.lathe([(0.09, deck_h), (0.05, apex + 0.75), (0.0, apex + 0.8)], 6, 'bark', m=_at(c, c), smooth=False)
    return b


def goblin_awning(width=2.0, depth=1.35):
    """Slanted tattered hide/cloth porch awning propped on crooked poles with hanging dried fish."""
    b = MeshBuilder()
    # Slanted canopy from wall (y=0, z=2.55) out to front pole (y=-depth, z=1.85)
    z_wall, z_front = 2.55, 1.85
    b.poly([(0.0, 0.0, z_wall), (width, 0.0, z_wall),
            (width, -depth, z_front), (0.0, -depth, z_front)],
           'cloth_cream', outward=(0, -1, 2))
    b.poly([(0.0, -depth, z_front), (width, -depth, z_front),
            (width, 0.0, z_wall - 0.03), (0.0, 0.0, z_wall - 0.03)],
           'cloth_cream', outward=(0, 1, -2))
    # Front cross-pole and angled prop struts back to the wall
    b.beam((-0.08, -depth + 0.05, z_front), (width + 0.08, -depth + 0.05, z_front + 0.03),
           (0, 0, 1), (-0.045, 0.045), 0.09, 'bark', bevel=0)
    for x in (0.12, width - 0.12):
        b.beam((x, 0.0, 1.05), (x, -depth + 0.08, z_front), (1, 0, 0),
               (-0.04, 0.04), 0.08, 'bark', bevel=0)
        b.beam((x, 0.0, z_wall), (x, -depth, z_front), (1, 0, 0),
               (-0.035, 0.035), 0.07, 'bark', bevel=0)
    if detailed():
        # Hanging dried fish / bone charms under the front eave
        for i, x in enumerate((0.45, 1.0, 1.55)):
            b.box((x - 0.01, -depth + 0.12, z_front - 0.35), (x + 0.01, -depth + 0.14, z_front), 'cloth_cream', bevel=0)
            b.blob((x, -depth + 0.13, z_front - 0.42), 0.10, 'cloth_red' if i == 1 else 'plaster',
                   subdiv=1, squash=(0.55, 0.35, 1.6), jitter=0.2, seed=41 + i)
    return b


def banner_goblin_skull():
    """Ragged crimson goblin clan banner with a bleached skull-and-crossbones emblem."""
    b = MeshBuilder()
    # Lashed horizontal crossbar pole
    b.beam((-0.55, -0.08, 0.0), (0.55, -0.08, 0.03), (0, 0, 1), (-0.035, 0.035), 0.07, 'bark', bevel=0)
    # Tattered twin-tail red cloth banner
    pts = [(-0.44, -0.08, 0.0), (0.44, -0.08, 0.0), (0.42, -0.10, -1.35),
           (0.18, -0.10, -1.08), (0.0, -0.10, -1.42), (-0.20, -0.10, -1.10), (-0.42, -0.10, -1.32)]
    b.extrude(pts, (0, -0.02, 0), 'cloth_red')
    # Bleached skull & crossed bones emblem on the front face
    y = -0.115
    # Cranium + jaw
    skull = [(-0.14, -0.32), (0.14, -0.32), (0.18, -0.46), (0.12, -0.60),
             (0.08, -0.72), (-0.08, -0.72), (-0.12, -0.60), (-0.18, -0.46)]
    b.extrude([(u, y, v) for u, v in skull], (0, -0.015, 0), 'plaster')
    # Dark eye sockets and nasal cavity
    for ex in (-0.065, 0.065):
        b.box((ex - 0.035, y - 0.02, -0.50), (ex + 0.035, y - 0.005, -0.42), 'iron', bevel=0)
    b.box((-0.02, y - 0.02, -0.58), (0.02, y - 0.005, -0.52), 'iron', bevel=0)
    # Crossed bones below skull
    b.beam((-0.24, y - 0.01, -0.92), (0.24, y - 0.01, -0.66), (0, 1, 0),
           (-0.022, 0.022), 0.02, 'plaster', bevel=0)
    b.beam((-0.24, y - 0.01, -0.66), (0.24, y - 0.01, -0.92), (0, 1, 0),
           (-0.022, 0.022), 0.02, 'plaster', bevel=0)
    return b


# -- Swamp terrain, stilt boardwalks & rope bridges ---------------------------

def tile_swamp():
    """2 x 2 m murky swamp water tile over dark mud with reed tufts and rotten stakes."""
    b = MeshBuilder()
    b.box((0, 0, -0.25), (GRID, GRID, -0.04), 'bark', bevel=0, skip=('-z',))
    b.box((0, 0, -0.04), (GRID, GRID, 0.0), 'water', bevel=0, skip=('-x', '+x', '-y', '+y', '-z'))
    if detailed():
        # Swamp reed clump and lily pads
        for rx, ry in ((0.32, 0.38), (0.42, 0.28), (1.65, 1.55)):
            b.beam((rx, ry, -0.05), (rx + 0.04, ry - 0.03, 0.55), (1, 0, 0),
                   (-0.015, 0.015), 0.03, 'grass', bevel=0)
        b.blob((1.35, 0.65, 0.005), 0.18, 'foliage', subdiv=1, squash=(1.2, 1.0, 0.08), jitter=0.1, seed=13)
    return b


def tile_boardwalk():
    """2 x 2 m goblin boardwalk deck: uneven weathered planks over heavy log bearers."""
    b = MeshBuilder()
    # Two cross-bearer logs
    for y in (0.35, 1.65):
        b.beam((0.0, y, -0.18), (GRID, y, -0.18), (0, 1, 0), (-0.08, 0.08), 0.14, 'bark', bevel=0)
    # 6 uneven deck planks running across Y
    plank_w = GRID / 6
    for i in range(6):
        x0 = i * plank_w + 0.015
        x1 = (i + 1) * plank_w - 0.015
        z_off = 0.01 if i % 2 == 0 else 0.0
        b.box((x0, 0.02, -0.08), (x1, GRID - 0.02, z_off), 'planks')
    return b


def stilt_wall(pillar=False):
    """Open timber stilt pilings supporting a terrace edge (span X 0..GRID, height TERRACE).
    When `pillar` is True, hangs a warm iron lantern under the boardwalk edge."""
    b = MeshBuilder()
    seg = 7 if detailed() else 5
    for x in (0.18, 1.82):
        b.lathe([(0.12, 0.0), (0.10, TERRACE)], seg, 'bark', m=_at(x, 0.16), smooth=False)
        if detailed():
            _lash(b, x, 0.16, TERRACE - 0.18, 0.12, 0.14)
    # Top ledger log and diagonal cross-bracing poles
    b.beam((0.0, 0.16, TERRACE - 0.14), (GRID, 0.16, TERRACE - 0.14), (0, 1, 0),
           (-0.08, 0.08), 0.14, 'bark', bevel=0)
    b.beam((0.18, 0.16, 0.1), (1.82, 0.16, TERRACE - 0.14), (0, 1, 0),
           (-0.05, 0.05), 0.09, 'bark', bevel=0)
    b.beam((1.82, 0.16, 0.1), (0.18, 0.16, TERRACE - 0.14), (0, 1, 0),
           (-0.05, 0.05), 0.09, 'bark', bevel=0)
    if pillar:
        # Protruding log arm with hanging swamp lantern (matches left foreground of reference!)
        b.beam((1.0, 0.25, TERRACE - 0.18), (1.0, -0.22, TERRACE - 0.22), (1, 0, 0),
               (-0.045, 0.045), 0.09, 'bark', bevel=0)
        b.box((0.99, -0.18, TERRACE - 0.48), (1.01, -0.16, TERRACE - 0.20), 'cloth_cream', bevel=0)
        b.lathe([(0.08, TERRACE - 0.78), (0.12, TERRACE - 0.62), (0.09, TERRACE - 0.48)],
                6, 'iron', m=_at(1.0, -0.17), smooth=False)
        b.blob((1.0, -0.17, TERRACE - 0.64), 0.075, 'glow', subdiv=1, jitter=0, seed=5)
    return b


def boardwalk_edge():
    """Lashed log curb along the edge of an elevated boardwalk platform."""
    b = MeshBuilder()
    b.beam((0.0, 0.12, 0.0), (GRID, 0.12, 0.02), (0, 1, 0), (-0.09, 0.09), 0.14, 'bark', bevel=0)
    if detailed():
        _lash(b, 0.22, 0.12, 0.05, 0.10, 0.12)
        _lash(b, GRID - 0.22, 0.12, 0.05, 0.10, 0.12)
    return b


def railing_goblin():
    """Crooked bark posts with lashed pole rail and sagging rope line."""
    b = MeshBuilder()
    for x, tilt in ((0.12, -0.03), (1.0, 0.02), (GRID - 0.12, -0.02)):
        b.beam((x, 0.18, 0.0), (x + tilt, 0.16, 1.02), (0, 1, 0), (-0.055, 0.055), 0.11, 'bark', bevel=0)
        if detailed():
            _lash(b, x + tilt * 0.8, 0.16, 0.86, 0.07, 0.10)
    # Top pole rail and sagging middle rope
    b.beam((0.0, 0.16, 0.86), (GRID, 0.16, 0.88), (0, 1, 0), (-0.04, 0.04), 0.08, 'bark', bevel=0)
    b.beam((0.0, 0.16, 0.48), (1.0, 0.16, 0.38), (0, 1, 0), (-0.02, 0.02), 0.04, 'cloth_cream', bevel=0)
    b.beam((1.0, 0.16, 0.38), (GRID, 0.16, 0.48), (0, 1, 0), (-0.02, 0.02), 0.04, 'cloth_cream', bevel=0)
    return b


def stairs_boardwalk(units):
    """Rough log-and-plank boardwalk stair ramp climbing `units` terrace levels (+Y)."""
    b = MeshBuilder()
    run = (units + 1) * GRID
    rise = units * TERRACE
    steps = units * 9
    # Two heavy inclined log stringers + support pilings
    for x in (0.14, GRID - 0.14):
        b.beam((x, 0.0, 0.0), (x, run, rise), (1, 0, 0), (-0.08, 0.08), 0.16, 'bark', bevel=0)
        b.beam((x, 0.1, 0.95), (x, run - 0.1, rise + 0.95), (1, 0, 0), (-0.04, 0.04), 0.08, 'bark', bevel=0)
        for p_y, p_z in ((0.15, 0.95), (run / 2, rise / 2 + 0.95), (run - 0.15, rise + 0.95)):
            b.beam((x, p_y, p_z - 0.98), (x, p_y, p_z + 0.06), (1, 0, 0),
                   (-0.045, 0.045), 0.09, 'bark', bevel=0)
    for i in range(steps):
        y0 = i * (run / steps)
        y1 = y0 + (run / steps) * 0.92
        z1 = (i + 1) * (rise / steps)
        b.box((0.10, y0, z1 - 0.10), (GRID - 0.10, y1, z1), 'planks')
    return b


def rope_bridge(cells=3):
    """Sagging rope-and-plank suspension bridge spanning `cells * GRID` m along +X,
    width GRID (2 m) along Y, with tall lashed anchor posts at both ends."""
    b = MeshBuilder()
    span = cells * GRID
    # End anchor posts with rope lashings and torches
    for x in (0.12, span - 0.12):
        for y in (0.16, GRID - 0.16):
            b.beam((x, y, -0.4), (x, y, 1.45), (1, 0, 0), (-0.08, 0.08), 0.16, 'bark', bevel=0)
            _lash(b, x, y, 1.15, 0.10, 0.14)
    # Catenary sag curve along X
    slats = cells * 7
    dx = span / slats
    def sag(x):
        u = (x / span) * 2.0 - 1.0
        return -0.32 * (1.0 - u * u)

    for i in range(slats):
        x0 = i * dx + 0.03
        x1 = (i + 1) * dx - 0.03
        xm = (x0 + x1) / 2
        z = sag(xm)
        # Plank slat
        b.box((x0, 0.18, z - 0.05), (x1, GRID - 0.18, z + 0.01), 'planks')
        # Twin bottom suspension ropes, handrail ropes, and vertical hangers
        if i + 1 < slats:
            xn = xm + dx
            zn = sag(xn)
            for y in (0.22, GRID - 0.22):
                b.beam((xm, y, z - 0.06), (xn, y, zn - 0.06), (0, 1, 0),
                       (-0.022, 0.022), 0.04, 'cloth_cream', bevel=0)
                b.beam((xm, y, z + 0.92), (xn, y, zn + 0.92), (0, 1, 0),
                       (-0.025, 0.025), 0.05, 'cloth_cream', bevel=0)
        if detailed() and i % 2 == 1:
            for y in (0.22, GRID - 0.22):
                b.box((xm - 0.012, y - 0.012, z - 0.04), (xm + 0.012, y + 0.012, z + 0.92),
                      'cloth_cream', bevel=0)
    return b


def define(kit):
    kit.define('Wall_Goblin', 'walls', wall_goblin())
    kit.define('Wall_Goblin_Window', 'walls', wall_goblin(window=True))
    kit.define('Wall_Goblin_Door', 'walls', wall_goblin(door=True))
    kit.define('Wall_Goblin_Arcade', 'walls', wall_goblin(open_front=True))
    kit.define('Corner_Goblin', 'walls', corner_goblin())
    kit.define('Plinth_Stilts', 'foundations', plinth_stilts(0.6))
    kit.define('Plinth_Stilts_Corner', 'foundations', plinth_stilts_corner(0.6))
    kit.define('Entry_Steps_Stilts', 'foundations', entry_steps_stilts(0.6))
    for span in (4, 6):
        kit.define(f'Roof_Goblin_S{span}', 'roofs', roof_goblin_section(span))
        kit.define(f'Roof_Goblin_End_S{span}', 'roofs', roof_goblin_section(span, END_LEN, end=True))
        kit.define(f'Gable_Wall_Goblin_S{span}', 'roofs', gable_wall_goblin(span))
        kit.define(f'Roof_Goblin_Hut_{span}', 'roofs', roof_goblin_hut(span))
    kit.define('Goblin_Awning', 'accents', goblin_awning())
    kit.define('Banner_Goblin_Skull', 'accents', banner_goblin_skull())
    kit.define('Tile_Swamp', 'terrain', tile_swamp())
    kit.define('Tile_Boardwalk', 'terrain', tile_boardwalk())
    kit.define('Stilt_Wall', 'terrain', stilt_wall(pillar=False))
    kit.define('Stilt_Wall_Pillar', 'terrain', stilt_wall(pillar=True))
    kit.define('Boardwalk_Edge', 'terrain', boardwalk_edge())
    kit.define('Railing_Goblin', 'terrain', railing_goblin())
    kit.define('Stairs_Boardwalk_1', 'terrain', stairs_boardwalk(1))
    kit.define('Stairs_Boardwalk_2', 'terrain', stairs_boardwalk(2))
    kit.define('Rope_Bridge', 'terrain', rope_bridge(3))
