"""Stilted watchtowers for the frontier families: the vertical accent of a hill fort (ref 3 in
assets-src/medieval-town-kit/references) that a town of low halls lacks.

A tower stands on a stone foot; four raked log legs carry a planked lookout with a railed
parapet under a hip roof whose eaves flare out. Centred on its origin, about 3.4 m square.

- Watchtower_Orc: dark timber, dark fieldstone foot, reed thatch.
- Watchtower_Frost: silvered logs, granite foot, plain slate.
"""
import math

from mathutils import Matrix, Vector

from ..config import detailed
from ..mesh import MeshBuilder
from .roofs import pyramid
from .walls import _merge

LEG_FOOT, LEG_TOP = 1.55, 1.15     # half-spread of the legs at the foot and under the deck
DECK = 6.2                         # lookout floor height
RAIL = 1.05
ROOF_EAVE = DECK + 2.35
ROOF_PITCH = 42


def _side(p0, p1):
    """A side axis perpendicular to the brace and horizontal, so beams lie in their wall plane."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    return (dy, -dx, 0) if abs(dx) + abs(dy) > 1e-6 else (1, 0, 0)


def watchtower(wood, foot, roof_mat):
    b = MeshBuilder()
    b.box((-1.9, -1.9, -0.5), (1.9, 1.9, 0.75), foot, skip=('-z',))
    corners = [(sx, sy) for sx in (-1, 1) for sy in (-1, 1)]
    for sx, sy in corners:
        b.beam((sx * LEG_FOOT, sy * LEG_FOOT, 0.7), (sx * LEG_TOP, sy * LEG_TOP, DECK + RAIL + 1.3),
               (sx, -sy, 0), (-0.13, 0.13), 0.26, wood)
    # Cross bracing on every side at two tiers, and ring beams where the tiers meet.
    for tier, (z0, z1) in enumerate(((0.9, 3.4), (3.4, DECK - 0.1))):
        def spread(z):
            t = (z - 0.7) / (DECK + RAIL + 0.6)
            return LEG_FOOT + (LEG_TOP - LEG_FOOT) * t
        s0, s1 = spread(z0), spread(z1)
        for axis in (0, 1):
            for side in (-1, 1):
                def pt(u, s, z):
                    return (u * s, side * s, z) if axis == 0 else (side * s, u * s, z)
                for u0, u1 in ((-1, 1), (1, -1)):
                    p0, p1 = pt(u0, s0, z0), pt(u1, s1, z1)
                    b.beam(p0, p1, _side(p0, p1), (-0.05, 0.05), 0.11, wood)
                b.beam(pt(-1, s1, z1), pt(1, s1, z1), (0, 0, 1), (-0.07, 0.07), 0.14, wood)
    # Lookout: deck, railed parapet of boards, corner posts up to the roof plate.
    d = LEG_TOP + 0.35
    b.box((-d, -d, DECK - 0.12), (d, d, DECK + 0.08), 'planks')
    for axis in (0, 1):
        for side in (-1, 1):
            lo = [-d, -d, DECK + 0.08]
            hi = [d, d, DECK + RAIL]
            lo[1 - axis], hi[1 - axis] = (side * d - 0.08, side * d) if side > 0 else (side * d, side * d + 0.08)
            b.box(tuple(lo), tuple(hi), wood)
    b.box((-d - 0.05, -d - 0.05, ROOF_EAVE - 0.3), (d + 0.05, d + 0.05, ROOF_EAVE), wood)
    # Hip roof with a flared skirt: a shallow kicked eave course under the main pyramid.
    size = 2 * d + 0.4
    roof = pyramid(size, ROOF_PITCH, mat=roof_mat, finial=False)
    roof.translate((-size / 2, -size / 2, ROOF_EAVE))
    _merge(b, roof)
    # The flare: a shallow frustum ring under the eave, its four sides meeting on the diagonals.
    flare, e0 = 0.75, size / 2 + 0.5
    zi, zo = ROOF_EAVE - 0.36, ROOF_EAVE - 0.7
    for k in range(4):
        rot = Matrix.Rotation(k * math.pi / 2, 4, 'Z')
        pts = [(-e0, -e0, zi), (e0, -e0, zi), (e0 + flare, -e0 - flare, zo), (-e0 - flare, -e0 - flare, zo)]
        pts = [tuple(rot @ Vector(p)) for p in pts]
        b.extrude(pts, (0, 0, 0.14), roof_mat)
    if detailed():
        # Ladder up the front leg pair.
        for x in (-0.28, 0.28):
            b.beam((x, -LEG_FOOT - 0.25, 0.75), (x, -LEG_TOP - 0.3, DECK), (1, 0, 0), (-0.04, 0.04), 0.08, wood)
        for k in range(14):
            t = (k + 0.5) / 14
            y = -LEG_FOOT - 0.25 + (LEG_FOOT - LEG_TOP + 0.05) * t
            z = 0.75 + (DECK - 0.75) * t
            b.box((-0.3, y - 0.03, z - 0.03), (0.3, y + 0.03, z + 0.03), wood, bevel=0)
    return b


def define(kit):
    kit.define('Watchtower_Orc', 'defences', watchtower('timber_dark', 'stone_dark', 'thatch_reed'))
    kit.define('Watchtower_Frost', 'defences', watchtower('log', 'stone_dark', 'snow'))
