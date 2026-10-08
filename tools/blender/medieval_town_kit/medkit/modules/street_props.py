"""Street furniture with the storybook silhouette: iron lanterns with flared glass
and pointed caps, striped market awnings with scalloped valances, heraldic
banners and overflowing flower boxes.

Origins follow props.py: ground props stand on their footprint centre; wall
props hang from their wall attachment point with the wall facing -Y.
"""
import math

from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder

SQUARE = math.pi / 4      # lathe phase that squares a 4-segment lathe to the axes


def lantern(b, x, y, z):
    """Lantern standing on (x, y, z): cone foot, flared glass body, pointed cap."""
    at = Matrix.Translation((x, y, 0))
    b.lathe([(0.0, z), (0.1, z + 0.06), (0.15, z + 0.12)], 4, 'iron', m=at, smooth=False,
            phase=SQUARE)
    b.lathe([(0.15, z + 0.12), (0.2, z + 0.52)], 4, 'glass', m=at, smooth=False, phase=SQUARE)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.beam((x + sx * 0.105, y + sy * 0.105, z + 0.12), (x + sx * 0.14, y + sy * 0.14, z + 0.52),
                   (sx, -sy, 0), (-0.018, 0.018), 0.036, 'iron', bevel=0)
    b.lathe([(0.24, z + 0.52), (0.24, z + 0.57), (0.2, z + 0.57)], 4, 'iron', m=at, smooth=False,
            phase=SQUARE)
    b.lathe([(0.27, z + 0.57), (0.05, z + 0.86), (0.05, z + 0.92)], 4, 'iron', m=at, smooth=False,
            phase=SQUARE)
    if detailed():
        b.lathe([(0.0, z + 0.92), (0.05, z + 0.97), (0.0, z + 1.06)], 6, 'iron', m=at)


def lamp_post(arm=False):
    """Iron post on a stepped stone foot; `arm` adds a banner arm on the street side."""
    b = MeshBuilder()
    b.box((-0.26, -0.26, 0), (0.26, 0.26, 0.18), 'stone', skip=('-z',))
    b.box((-0.2, -0.2, 0.18), (0.2, 0.2, 0.36), 'stone')
    b.lathe([(0.13, 0.36), (0.1, 0.48), (0.07, 0.62), (0.055, 0.7), (0.05, 2.42), (0.08, 2.48),
             (0.08, 2.54), (0.13, 2.6), (0.13, 2.66), (0.0, 2.66)], 8, 'iron')
    if detailed():
        for a in range(4):
            c, s = math.cos(a * math.pi / 2), math.sin(a * math.pi / 2)
            b.beam((c * 0.05, s * 0.05, 2.3), (c * 0.17, s * 0.17, 2.6), (-s, c, 0), (-0.012, 0.012),
                   0.03, 'iron', bevel=0)
    lantern(b, 0, 0, 2.66)
    if arm:
        b.beam((0, 0, 2.25), (0, -0.85, 2.25), (1, 0, 0), (-0.025, 0.025), 0.05, 'iron', bevel=0)
        _banner_cloth(b, 0.0, -0.5, 2.22, width=0.5, drop=1.15, plane='yz')
    return b


def wall_lantern():
    b = MeshBuilder()
    b.box((-0.06, -0.04, -0.2), (0.06, 0.0, 0.12), 'iron')
    b.beam((0, -0.02, 0.0), (0, -0.52, 0.0), (1, 0, 0), (-0.02, 0.02), 0.05, 'iron', bevel=0)
    b.beam((0, -0.02, -0.18), (0, -0.4, 0.0), (1, 0, 0), (-0.015, 0.015), 0.03, 'iron', bevel=0)
    b.box((-0.01, -0.46, -0.16), (0.01, -0.44, 0.0), 'iron', bevel=0)
    lantern(b, 0, -0.45, -0.72)
    return b


FLEUR = (
    [(0.0, 1.25), (0.2, 0.75), (0.16, 0.1), (-0.16, 0.1), (-0.2, 0.75)],
    [(0.18, 0.15), (0.48, 0.45), (0.7, 0.4), (0.66, 0.05), (0.45, -0.1), (0.2, -0.05)],
    [(-0.18, 0.15), (-0.48, 0.45), (-0.7, 0.4), (-0.66, 0.05), (-0.45, -0.1), (-0.2, -0.05)],
    [(-0.42, -0.02), (0.42, -0.02), (0.42, -0.18), (-0.42, -0.18)],
    [(0.0, -0.18), (0.14, -0.5), (0.0, -0.8), (-0.14, -0.5)],
)


def _fleur(b, at, s, depth):
    """Gold fleur-de-lis, height ~2 s; at(u, v) maps the emblem plane to module space."""
    for piece in FLEUR:
        b.extrude([at(u * s, v * s) for u, v in piece], depth, 'gold')


def _banner_cloth(b, cx, cy, top, width=0.8, drop=1.8, plane='xz'):
    """Swallow-tailed banner hanging from `top`; plane 'xz' faces -Y, 'yz' faces both X."""
    half, mid, s = width / 2, top - drop * 0.45, width * 0.26
    shape = [(-half, -0.05), (half, -0.05), (half, -drop + 0.3), (0.0, -drop), (-half, -drop + 0.3)]
    if plane == 'xz':
        b.extrude([(cx + u, cy, top + v) for u, v in shape], (0, 0.025, 0), 'cloth_blue')
        _fleur(b, lambda u, v: (cx + u, cy - 0.012, mid + v), s, (0, 0.012, 0))
        return
    b.extrude([(cx - 0.012, cy + u, top + v) for u, v in shape], (0.025, 0, 0), 'cloth_blue')
    _fleur(b, lambda u, v: (cx - 0.024, cy + u, mid + v), s, (0.012, 0, 0))
    _fleur(b, lambda u, v: (cx + 0.013, cy - u, mid + v), s, (0.012, 0, 0))


def banner():
    """Hangs from local origin (top centre) against a wall facing -Y."""
    b = MeshBuilder()
    b.beam((-0.55, -0.08, 0.02), (0.55, -0.08, 0.02), (0, 1, 0), (-0.03, 0.03), 0.06, 'iron')
    for x in (-0.55, 0.55):
        b.lathe([(0.0, 0.0), (0.05, 0.02), (0.0, 0.07)], 6, 'gold',
                m=Matrix.Translation((x, -0.08, 0.0)))
    _banner_cloth(b, 0.0, -0.06, 0.0, width=0.8, drop=1.85)
    return b


def market_stall(cloth):
    """Counter stall under a striped awning with a scalloped front valance."""
    b = MeshBuilder()
    for x in (-1.15, 1.05):
        b.box((x, -0.75, 0), (x + 0.1, -0.65, 2.15), 'timber')
        b.box((x, 0.6, 0), (x + 0.1, 0.7, 2.6), 'timber')
    b.box((-1.15, -0.8, 0.7), (1.15, -0.1, 0.84), 'planks')
    b.box((-1.15, -0.8, 0.0), (1.15, -0.74, 0.7), 'planks')
    stripes = 6
    width = 2.7 / stripes
    for i in range(stripes):
        x0 = -1.35 + i * width
        mat = cloth if i % 2 == 0 else 'cloth_cream'
        b.beam((x0, -1.25, 2.02), (x0, 0.85, 2.72), (1, 0, 0), (0.0, width), 0.04, mat, bevel=0)
        cx, seg = x0 + width / 2, 6 if detailed() else 3
        flap = [(cx + width / 2 * math.cos(math.pi * k / seg), -1.27,
                 2.02 - 0.2 * math.sin(math.pi * k / seg)) for k in range(seg + 1)]
        b.extrude(flap, (0, 0.02, 0), mat)
    for x in (-0.75, 0.0, 0.75):
        b.box((x - 0.28, -0.7, 0.84), (x + 0.28, -0.25, 1.0), 'planks')
        if detailed():
            for k in range(3):
                b.blob((x - 0.14 + k * 0.14, -0.47, 1.04), 0.09, 'flowers', subdiv=1,
                       seed=int(x * 10) + k)
        else:
            b.box((x - 0.26, -0.68, 1.0), (x + 0.26, -0.27, 1.08), 'flowers')
    return b


def flower_box():
    """Planter on a sill, flowers mounded over the rim and trailing down the front."""
    b = MeshBuilder()
    b.box((-0.45, -0.12, 0), (0.45, 0.12, 0.2), 'planks')
    b.blob((0, 0, 0.22), 0.5, 'flowers', subdiv=2 if detailed() else 1,
           squash=(1.0, 0.34, 0.4), jitter=0.25, seed=5)
    if detailed():
        for k, x in enumerate((-0.3, 0.02, 0.32)):
            b.blob((x, -0.16, 0.06 - 0.05 * (k % 2)), 0.17, 'foliage', subdiv=1,
                   squash=(0.9, 0.45, 1.0), jitter=0.3, seed=11 + k)
            b.blob((x + 0.06, -0.2, 0.12), 0.1, 'flowers', subdiv=1, seed=21 + k)
    return b
