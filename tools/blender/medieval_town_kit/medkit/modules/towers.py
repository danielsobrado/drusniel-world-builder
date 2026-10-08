"""Round watchtower for town walls: a tapering stone drum with a crenellated crown."""
import math

from mathutils import Matrix

from ..mesh import MeshBuilder

RADIUS = 2.4
HEIGHT = 9.0


def round_tower(seg=16):
    b = MeshBuilder()
    b.lathe([(RADIUS + 0.25, 0.0), (RADIUS, 1.2), (RADIUS, HEIGHT)], seg, 'stone', smooth=False)
    b.lathe([(RADIUS, HEIGHT), (RADIUS + 0.3, HEIGHT + 0.25), (RADIUS + 0.3, HEIGHT + 0.7),
             (0.0, HEIGHT + 0.7)], seg, 'stone', smooth=False)
    merlons = 12
    for i in range(merlons):
        a = 2 * math.pi * i / merlons
        m = Matrix.Translation((math.cos(a) * (RADIUS + 0.12), math.sin(a) * (RADIUS + 0.12), 0)) \
            @ Matrix.Rotation(a, 4, 'Z')
        b.box((-0.18, -0.35, HEIGHT + 0.7), (0.18, 0.35, HEIGHT + 1.35), 'stone', m=m)
    for z in (3.5, 6.5):
        for a in (0.3, 2.4, 4.4):
            m = Matrix.Translation((math.cos(a) * RADIUS, math.sin(a) * RADIUS, 0)) \
                @ Matrix.Rotation(a, 4, 'Z')
            b.box((-0.02, -0.12, z), (0.06, 0.12, z + 0.7), 'glass', m=m)
    b.box((-0.55, -RADIUS - 0.06, 0), (0.55, -RADIUS + 0.3, 2.3), 'stone')
    b.box((-0.42, -RADIUS - 0.1, 0.05), (0.42, -RADIUS - 0.04, 2.1), 'planks')
    return b


def define(kit):
    kit.define('Tower_Round', 'defences', round_tower())
