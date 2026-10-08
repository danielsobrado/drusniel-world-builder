"""Vegetation: oak, cypress, bush and wall ivy. Shared foliage/bark textures."""
from mathutils import Matrix

from ..mesh import MeshBuilder


def oak(seed=1):
    b = MeshBuilder()
    b.lathe([(0.24, 0.0), (0.17, 1.3), (0.12, 2.5)], 8, 'bark')
    b.beam((0, 0, 1.6), (0.75, 0.3, 2.5), (0, 0, 1), (-0.05, 0.05), 0.12, 'bark')
    b.beam((0, 0, 1.8), (-0.6, -0.35, 2.6), (0, 0, 1), (-0.05, 0.05), 0.12, 'bark')
    clumps = [((0, 0, 3.1), 1.15), ((0.75, 0.35, 2.7), 0.85), ((-0.65, -0.4, 2.8), 0.85),
              ((0.15, -0.65, 3.5), 0.75), ((-0.25, 0.55, 3.6), 0.8)]
    for i, (c, r) in enumerate(clumps):
        b.blob(c, r, 'foliage', subdiv=2, squash=(1, 1, 0.85), jitter=0.18, seed=seed * 10 + i)
    return b


def cypress(seed=2):
    b = MeshBuilder()
    b.lathe([(0.12, 0.0), (0.08, 0.8)], 6, 'bark')
    b.blob((0, 0, 2.3), 1.0, 'foliage', subdiv=2, squash=(0.55, 0.55, 1.75), jitter=0.12, seed=seed)
    b.blob((0, 0, 3.9), 0.45, 'foliage', subdiv=1, squash=(0.6, 0.6, 1.4), jitter=0.1, seed=seed + 1)
    return b


def bush(seed=3):
    b = MeshBuilder()
    b.blob((0, 0, 0.35), 0.55, 'foliage', subdiv=2, squash=(1, 1, 0.75), jitter=0.2, seed=seed)
    b.blob((0.35, 0.15, 0.3), 0.32, 'flowers', subdiv=1, squash=(1, 1, 0.8), seed=seed + 1)
    return b


def ivy(seed=4):
    """Flat clumps climbing a wall face; origin on the wall at ground level, wall at -Y."""
    b = MeshBuilder()
    clumps = [((0, 0, 0.4), 0.45), ((0.25, 0, 1.0), 0.4), ((-0.2, 0, 1.5), 0.42),
              ((0.15, 0, 2.1), 0.36), ((-0.1, 0, 2.6), 0.3)]
    m = Matrix.Translation((0, -0.05, 0))
    for i, (c, r) in enumerate(clumps):
        mat = 'flowers' if i == 1 else 'foliage'
        b.blob(c, r, mat, m=m, subdiv=1, squash=(1.1, 0.22, 1.0), jitter=0.2, seed=seed * 7 + i)
    return b


def define(kit):
    kit.define('Tree_Oak', 'nature', oak())
    kit.define('Tree_Cypress', 'nature', cypress())
    kit.define('Bush', 'nature', bush())
    kit.define('Ivy_Patch', 'nature', ivy())
