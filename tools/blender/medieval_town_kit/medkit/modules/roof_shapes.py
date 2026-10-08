"""Regional roof shapes: Mediterranean hip roofs, Nordic gable finials and pent
roofs, battlemented tower crowns, and a material swatch.

Hip roofs cover a whole building (span x length) in one module: the hips are
45 degrees in plan, so every slope shares one pitch and the eaves stay level.
"""
import math

from ..config import GRID, HIP_LENGTHS, ROOF_OVERHANG as OV
from ..mesh import MeshBuilder

HIP_PITCH = math.radians(30)


def hip_roof(span, length, pitch=HIP_PITCH, mat='roof_terracotta'):
    """Local frame like the gable modules: walls' top at z=0, footprint x 0..length, y 0..span."""
    b = MeshBuilder()
    tan = math.tan(pitch)
    ze = -OV * tan
    h = span / 2 * tan
    e = [(-OV, -OV, ze), (length + OV, -OV, ze), (length + OV, span + OV, ze), (-OV, span + OV, ze)]
    r0, r1 = (span / 2, span / 2, h), (length - span / 2, span / 2, h)
    up = 1.0
    b.poly([e[0], e[1], r1, r0], mat, outward=(0, -1, up))
    b.poly([e[2], e[3], r0, r1], mat, outward=(0, 1, up))
    b.poly([e[1], e[2], r1], mat, outward=(1, 0, up))
    b.poly([e[3], e[0], r0], mat, outward=(-1, 0, up))
    b.poly(e, 'planks', outward=(0, 0, -1))
    fascia = 0.16
    b.box((-OV, -OV, ze - fascia), (length + OV, -OV + 0.06, ze), 'timber')
    b.box((-OV, span + OV - 0.06, ze - fascia), (length + OV, span + OV, ze), 'timber')
    b.box((-OV, -OV, ze - fascia), (-OV + 0.06, span + OV, ze), 'timber')
    b.box((length + OV - 0.06, -OV, ze - fascia), (length + OV, span + OV, ze), 'timber')
    if length > span:
        b.box((r0[0], span / 2 - 0.12, h - 0.02), (r1[0], span / 2 + 0.12, h + 0.14), mat)
    return b


def finial(height=1.3):
    """Crossed, outward-bending horn boards past a gable apex, ending in a carved head.

    Origin at the apex; the gable faces -X. Each horn rises along one rake, then
    bends out and up, the way Nordic longhouse gables end.
    """
    b = MeshBuilder()
    for side in (-1, 1):
        p0 = (0, side * -0.3, -0.4)
        p1 = (0, side * 0.32, height * 0.55)
        p2 = (0, side * 0.62, height * 0.95)
        b.beam(p0, p1, (1, 0, 0), (-0.06, 0.06), 0.15, 'timber')
        b.beam(p1, p2, (1, 0, 0), (-0.055, 0.055), 0.13, 'timber')
        tip = (0, side * 0.72, height * 1.08)
        b.beam(p2, tip, (1, 0, 0), (-0.07, 0.07), 0.2, 'timber')
    b.box((-0.08, -0.32, -0.9), (0.02, 0.32, -0.3), 'timber')
    return b


def pent_roof(depth=0.9, pitch=math.radians(28)):
    """Lean-to roof strip on a wall face (exterior -Y), origin at the wall top line."""
    b = MeshBuilder()
    drop = depth * math.tan(pitch)
    mats = {'+z': 'roof', '-z': 'planks'}
    b.beam((0, 0.05, 0.02), (0, -depth, -drop), (1, 0, 0), (0, GRID), 0.08, 'timber', mats=mats)
    for x in (0.1, GRID - 0.18):
        b.beam((x, -0.15, -0.65), (x, -depth + 0.15, -drop + 0.02), (1, 0, 0), (0, 0.08), 0.1,
               'timber')
    return b


def battlements(size):
    """Flat stone crown with merlons for a square tower of `size` metres."""
    b = MeshBuilder()
    t = 0.35
    b.box((-0.2, -0.2, 0), (size + 0.2, size + 0.2, 0.2), 'stone', mats={'+z': 'cobble'})
    sides = [((-0.2, -0.2), (size + 0.2, -0.2 + t)), ((-0.2, size + 0.2 - t), (size + 0.2, size + 0.2)),
             ((-0.2, -0.2), (-0.2 + t, size + 0.2)), ((size + 0.2 - t, -0.2), (size + 0.2, size + 0.2))]
    for (x0, y0), (x1, y1) in sides:
        b.box((x0, y0, 0.2), (x1, y1, 0.75), 'stone')
    full = size + 0.4
    for x0, y0, along_x in ((-0.2, -0.2, True), (-0.2, size + 0.2 - t, True),
                            (-0.2, -0.2, False), (size + 0.2 - t, -0.2, False)):
        count = max(2, int(full))
        step = full / count
        for i in range(count):
            a = i * step + step * 0.25
            if along_x:
                b.box((x0 + a, y0, 0.75), (x0 + a + step * 0.5, y0 + t, 1.3), 'stone')
            else:
                b.box((x0, y0 + a, 0.75), (x0 + t, y0 + a + step * 0.5, 1.3), 'stone')
    return b


def swatch():
    """Quads carrying materials the game swaps in per region (thatch, clapboard)."""
    b = MeshBuilder()
    for i, mat in enumerate(('thatch', 'clapboard', 'roof_terracotta', 'stone_ashlar')):
        x = i * 0.5
        b.poly([(x, 0, 0), (x + 0.4, 0, 0), (x + 0.4, 0.4, 0), (x, 0.4, 0)], mat, outward=(0, 0, 1))
    return b


def define(kit):
    for span in (4, 6):
        for length in HIP_LENGTHS:
            if length >= span:
                kit.define(f'Roof_Hip_S{span}_L{length}', 'roofs', hip_roof(span, length))
    kit.define('Gable_Finial', 'roofs', finial())
    kit.define('Pent_Roof', 'roofs', pent_roof())
    kit.define('Roof_Battlements_4', 'roofs', battlements(4.0))
    kit.define('Roof_Battlements_6', 'roofs', battlements(6.0))
    kit.define('Material_Swatch', 'roofs', swatch())
