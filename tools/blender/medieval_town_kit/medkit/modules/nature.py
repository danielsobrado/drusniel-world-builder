"""Vegetation: oak, cypress, bush and wall ivy. Shared foliage/bark textures."""
import math
import random

from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder


def oak(seed=1):
    b = MeshBuilder()
    b.lathe([(0.24, 0.0), (0.17, 1.3), (0.12, 2.5)], 8, 'bark')
    b.beam((0, 0, 1.6), (0.75, 0.3, 2.5), (0, 0, 1), (-0.05, 0.05), 0.12, 'bark')
    b.beam((0, 0, 1.8), (-0.6, -0.35, 2.6), (0, 0, 1), (-0.05, 0.05), 0.12, 'bark')
    _canopy(b, (0, 0, 3.1), (1.45, 1.35, 1.0), 16, (0.42, 0.72), seed)
    return b


def _canopy(b, centre, radii, count, sizes, seed):
    """Many small leaf clumps scattered over an ellipsoid shell, so the crown breaks up
    into masses with gaps instead of reading as one faceted ball."""
    rng = random.Random(seed)
    for i in range(count):
        z = rng.uniform(-0.55, 1.0)
        a = rng.uniform(0, 2 * math.pi)
        rr = math.sqrt(max(0.0, 1 - z * z)) * rng.uniform(0.55, 1.0)
        c = (centre[0] + radii[0] * rr * math.cos(a), centre[1] + radii[1] * rr * math.sin(a),
             centre[2] + radii[2] * z)
        b.blob(c, rng.uniform(*sizes), 'foliage', subdiv=3 if detailed() else 1, squash=(1, 1, 0.8),
               jitter=0.12, seed=seed * 50 + i)


def cypress(seed=2):
    b = MeshBuilder()
    b.lathe([(0.12, 0.0), (0.08, 0.8)], 6, 'bark')
    b.blob((0, 0, 2.3), 1.0, 'foliage', subdiv=3 if detailed() else 2, squash=(0.55, 0.55, 1.75), jitter=0.08,
           seed=seed)
    b.blob((0, 0, 3.9), 0.45, 'foliage', subdiv=1, squash=(0.6, 0.6, 1.4), jitter=0.1, seed=seed + 1)
    return b


def bush(seed=3):
    b = MeshBuilder()
    _canopy(b, (0, 0, 0.38), (0.45, 0.42, 0.28), 7, (0.22, 0.34), seed)
    b.blob((0.3, -0.25, 0.42), 0.16, 'flowers', subdiv=1, squash=(1, 1, 0.8), jitter=0.35, seed=seed + 1)
    return b


def ivy(seed=4):
    """Flat clumps climbing a wall face; origin on the wall at ground level, wall at -Y."""
    b = MeshBuilder()
    rng = random.Random(seed)
    m = Matrix.Translation((0, -0.05, 0))
    for i in range(11):
        z = 0.2 + i * 0.25
        x = 0.25 * math.sin(i * 1.7) + rng.uniform(-0.12, 0.12)
        r = 0.34 - 0.018 * i + rng.uniform(-0.04, 0.04)
        b.blob((x, 0, z), r, 'foliage', m=m, subdiv=1, squash=(1.1, 0.22, 0.9), jitter=0.35, seed=seed * 7 + i)
    return b


def define(kit):
    kit.define('Tree_Oak', 'nature', oak())
    kit.define('Tree_Cypress', 'nature', cypress())
    kit.define('Bush', 'nature', bush())
    kit.define('Ivy_Patch', 'nature', ivy())
