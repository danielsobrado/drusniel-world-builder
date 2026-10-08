"""Interior furniture. Origins on the floor at the footprint centre; the "back"
of wall-hugging pieces (hearth, bed headboard, shelf) is +Y.
"""
from mathutils import Matrix

from ..mesh import MeshBuilder


def table():
    b = MeshBuilder()
    b.box((-0.9, -0.5, 0.72), (0.9, 0.5, 0.8), 'planks')
    for x in (-0.8, 0.72):
        for y in (-0.42, 0.34):
            b.box((x, y, 0), (x + 0.08, y + 0.08, 0.72), 'timber')
    return b


def bench(length=1.6):
    b = MeshBuilder()
    h = length / 2
    b.box((-h, -0.17, 0.42), (h, 0.17, 0.48), 'planks')
    for x in (-h + 0.1, h - 0.16):
        b.box((x, -0.15, 0), (x + 0.06, 0.15, 0.42), 'timber')
    return b


def bed():
    b = MeshBuilder()
    b.box((-0.5, -1.0, 0), (0.5, 1.0, 0.32), 'timber')
    b.box((-0.45, -0.95, 0.32), (0.45, 0.95, 0.48), 'cloth_cream')
    b.box((-0.47, -0.97, 0.48), (0.47, 0.35, 0.52), 'cloth_red')
    b.blob((0, 0.65, 0.56), 0.3, 'cloth_cream', subdiv=1, squash=(1.2, 0.6, 0.3), jitter=0.05)
    b.box((-0.52, 0.95, 0), (0.52, 1.05, 0.95), 'timber')
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
    kit.define('Bed', 'interior', bed())
    kit.define('Hearth', 'interior', hearth())
    kit.define('Shelf', 'interior', shelf())
    kit.define('Rug', 'interior', rug())
