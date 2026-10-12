"""Interior furniture. Origins on the floor at the footprint centre; the "back"
of wall-hugging pieces (hearth, bed headboard, shelf) is +Y.
"""
from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder


def table():
    """Trestle table: four planks over two trestles joined by a stretcher, as the
    game's SettlementView rooms build theirs (SettlementFurniture.js)."""
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
        for x, y, h in ((-0.5, 0.91, 1.05), (0.41, 0.91, 1.05), (-0.5, -1.0, 0.6), (0.41, -1.0, 0.6)):
            b.box((x, y, 0), (x + 0.09, y + 0.09, h), 'timber')
        b.box((-0.41, 0.93, 0.45), (0.41, 0.98, 0.95), 'planks')
        b.box((-0.41, -0.98, 0.34), (0.41, -0.93, 0.55), 'planks')
    else:
        b.box((-0.5, -1.0, 0), (0.5, 1.0, 0.32), 'timber')
        b.box((-0.52, 0.95, 0), (0.52, 1.05, 0.95), 'timber')
    b.box((-0.43, -0.92, 0.34), (0.43, 0.92, 0.5), 'cloth_cream')
    b.box((-0.45, -0.93, 0.44), (0.45, 0.15, 0.56), 'cloth_red')
    b.box((-0.45, 0.1, 0.5), (0.45, 0.25, 0.58), 'cloth_cream')
    b.blob((0, 0.65, 0.58), 0.3, 'cloth_cream', subdiv=1, squash=(1.2, 0.6, 0.3), jitter=0.05)
    return b


def hearth():
    b = MeshBuilder()
    b.box((-0.85, -0.45, 0), (0.85, 0.3, 0.15), 'stone', skip=('-z',))
    b.box((-0.85, -0.35, 0.15), (-0.5, 0.3, 1.25), 'stone')
    b.box((0.5, -0.35, 0.15), (0.85, 0.3, 1.25), 'stone')
    b.box((-0.5, 0.1, 0.15), (0.5, 0.3, 1.25), 'stone')
    b.box((-0.95, -0.45, 1.25), (0.95, 0.3, 1.42), 'timber')
    b.box((-0.7, -0.3, 1.42), (0.7, 0.3, 2.6), 'stone')
    b.blob((0, -0.08, 0.3), 0.22, 'glow', subdiv=1, squash=(1.2, 0.8, 0.9), jitter=0.25)
    return b


def shelf():
    b = MeshBuilder()
    for x in (-0.6, 0.54):
        b.box((x, -0.15, 0), (x + 0.06, 0.15, 1.8), 'timber')
    for z in (0.3, 0.9, 1.5):
        b.box((-0.54, -0.15, z), (0.54, 0.15, z + 0.04), 'planks')
    for x in (-0.3, 0.05, 0.3):
        b.lathe([(0.0, 0.94), (0.09, 0.94), (0.1, 1.12), (0.05, 1.2), (0.0, 1.2)], 8, 'iron',
                m=Matrix.Translation((x, 0, 0)))
    return b


def rug():
    b = MeshBuilder()
    b.box((-1.0, -0.7, 0), (1.0, 0.7, 0.02), 'cloth_red', skip=('-z',))
    return b


def define(kit):
    kit.define('Table', 'interior', table())
    kit.define('Bench', 'interior', bench())
    kit.define('Stool', 'interior', stool())
    kit.define('Bed', 'interior', bed())
    kit.define('Hearth', 'interior', hearth())
    kit.define('Shelf', 'interior', shelf())
    kit.define('Rug', 'interior', rug())
