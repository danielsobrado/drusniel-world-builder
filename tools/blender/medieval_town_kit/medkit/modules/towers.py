"""Round watchtower for town walls: a tapering stone drum with a crenellated crown."""
import math

from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder
from .carpentry import iron_latch_and_ring, ornate_strap_hinge

RADIUS = 2.4
HEIGHT = 9.0


def round_tower(seg=16):
    b = MeshBuilder()
    b.lathe([(RADIUS + 0.28, 0.0), (RADIUS + 0.04, 1.18), (RADIUS, 1.25), (RADIUS, HEIGHT)],
            seg, 'stone', smooth=False)
    # Dressed stone cordon rings at battered plinth top, mid-height, and crown corbel
    b.lathe([(RADIUS + 0.08, 1.14), (RADIUS + 0.08, 1.28), (RADIUS, 1.32)], seg,
            'stone_dressed', smooth=False)
    b.lathe([(RADIUS + 0.05, 5.0), (RADIUS + 0.05, 5.14), (RADIUS, 5.16)], seg,
            'stone_dressed', smooth=False)
    b.lathe([(RADIUS, HEIGHT - 0.12), (RADIUS + 0.16, HEIGHT), (RADIUS + 0.32, HEIGHT + 0.25),
             (RADIUS + 0.32, HEIGHT + 0.7), (0.0, HEIGHT + 0.7)], seg, 'stone_dressed', smooth=False)
    merlons = 12
    for i in range(merlons):
        a = 2 * math.pi * i / merlons
        m = Matrix.Translation((math.cos(a) * (RADIUS + 0.12), math.sin(a) * (RADIUS + 0.12), 0)) \
            @ Matrix.Rotation(a, 4, 'Z')
        b.box((-0.18, -0.35, HEIGHT + 0.7), (0.18, 0.35, HEIGHT + 1.28), 'stone', m=m)
        b.box((-0.21, -0.38, HEIGHT + 1.26), (0.21, 0.38, HEIGHT + 1.36), 'stone_dressed', m=m)
        if detailed():
            b.box((-0.14, -0.10, HEIGHT - 0.36), (0.04, 0.10, HEIGHT), 'stone_dressed', m=m)
    for z in (3.5, 6.5):
        for a in (0.3, 2.4, 4.4):
            m = Matrix.Translation((math.cos(a) * RADIUS, math.sin(a) * RADIUS, 0)) \
                @ Matrix.Rotation(a, 4, 'Z')
            b.box((-0.04, -0.18, z - 0.08), (0.09, 0.18, z + 0.78), 'stone_dressed', m=m)
            b.box((-0.02, -0.12, z), (0.11, 0.12, z + 0.7), 'glass', m=m)
    # Dressed-stone postern portal surround & iron-bound oak door
    b.box((-0.62, -RADIUS - 0.10, 0), (0.62, -RADIUS + 0.3, 2.34), 'stone_dressed')
    b.box((-0.44, -RADIUS - 0.12, 0.05), (0.44, -RADIUS - 0.04, 2.15), 'wood_trim')
    if detailed():
        for hz in (0.45, 1.10, 1.75):
            ornate_strap_hinge(b, -0.40, hz, 0.58, -RADIUS - 0.12, dir_x=1)
        iron_latch_and_ring(b, 0.30, 1.10, -RADIUS - 0.12)
    return b


def define(kit):
    kit.define('Tower_Round', 'defences', round_tower())
