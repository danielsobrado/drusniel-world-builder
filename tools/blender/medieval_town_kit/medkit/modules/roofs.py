"""Roof modules: gable sections, gable-end walls, eave ends, pyramid/spire caps,
dormers and chimneys.

Gable roofs ride on the wall tops (local z=0) of a building `span` metres
deep; the ridge runs along X. A section covers one 2 m cell of length.
"""
import math

from mathutils import Matrix, Vector

from ..config import (GRID, HALF_T as T, JETTY, JETTY_LEVELS, ROOF_OVERHANG as OV, ROOF_PITCH,
                      ROOF_SPANS, ROOF_THICK, detailed, jetty_key)
from ..mesh import MeshBuilder, frame

STEEP_PITCH = math.radians(60)
SLAB_MATS = {'+z': 'roof', '-z': 'planks'}
PYRAMID_PITCH = {4: 55, 6: 50}   # degrees per tower size for Roof_Pyramid_<size>
END_LEN = 0.35


def ridge_height(span, pitch=ROOF_PITCH):
    return span / 2 * math.tan(pitch)


def _slopes(b, x0, x1, span, pitch, barge=False):
    tan, cos = math.tan(pitch), math.cos(pitch)
    front = Matrix.Translation((0, -OV, -OV * tan)) @ Matrix.Rotation(pitch, 4, 'X')
    back = Matrix.Translation((x0 + x1, span, 0)) @ Matrix.Rotation(math.pi, 4, 'Z') @ front
    length = (span / 2 + OV) / cos + 0.05
    for m in (front, back):
        b.box((x0, 0, 0), (x1, length, ROOF_THICK), 'timber', m=m, mats=SLAB_MATS)
    if barge:
        b.box((x0, 0, -0.12), (x0 + 0.06, length, ROOF_THICK + 0.05), 'timber', m=front)
        b.box((x1 - 0.06, 0, -0.12), (x1, length, ROOF_THICK + 0.05), 'timber', m=back)
    if not barge:
        for m in (front, back):
            for i in range(int((x1 - x0) / 0.5)):
                x = x0 + 0.25 + i * 0.5
                b.box((x - 0.05, -0.12, -0.13), (x + 0.05, OV / cos + 0.35, 0.0), 'timber', m=m)
    h = ridge_height(span, pitch)
    if pitch >= STEEP_PITCH - 1e-6:
        log = Matrix.Translation((x0, span / 2, h + 0.2)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
        b.lathe([(0.0, 0.0), (0.17, 0.0), (0.17, x1 - x0), (0.0, x1 - x0)], 8, 'timber', m=log,
                smooth=True)
    else:
        b.box((x0, span / 2 - 0.16, h + 0.08), (x1, span / 2 + 0.16, h + 0.32), 'roof')


def gable_section(span, pitch=ROOF_PITCH):
    b = MeshBuilder()
    _slopes(b, 0, GRID, span, pitch)
    return b


def gable_fill(span, length, pitch=ROOF_PITCH):
    """A short roof section `length` metres long: closes the gap a jettied gable front
    leaves when the ridge runs from front to back."""
    b = MeshBuilder()
    _slopes(b, 0, length, span, pitch)
    return b


def gable_eave_end(span, pitch=ROOF_PITCH):
    b = MeshBuilder()
    _slopes(b, 0, END_LEN, span, pitch, barge=True)
    return b


def gable_wall(span, pitch=ROOF_PITCH, infill='plaster'):
    """Timber-framed triangle closing a gable; exterior faces -X at x=0."""
    b = MeshBuilder()
    h = ridge_height(span, pitch) - 0.02
    b.extrude([(-0.1, 0, 0), (-0.1, span, 0), (-0.1, span / 2, h)], (0.1 + T, 0, 0), infill)
    b.box((-0.16, 0, 0), (-0.06, span, 0.2), 'timber')
    mid = span / 2
    b.box((-0.16, mid - 0.08, 1.3), (-0.06, mid + 0.08, h - 0.2), 'timber')
    for y0, y1 in ((0.0, mid), (span, mid)):
        b.beam((0, y0, -0.1), (0, y1, h - 0.12), (1, 0, 0), (-0.16, -0.06), 0.18, 'timber')
    b.box((-0.2, mid - 0.32, 0.42), (-0.1, mid + 0.32, 1.2), 'timber')
    b.box((-0.22, mid - 0.24, 0.5), (-0.19, mid + 0.24, 1.12), 'glass')
    return b


def pyramid(size, pitch_deg, spire=False):
    b = MeshBuilder()
    tan = math.tan(math.radians(pitch_deg))
    ze = -OV * tan
    apex = (size / 2, size / 2, size / 2 * tan)
    c = [(-OV, -OV, ze), (size + OV, -OV, ze), (size + OV, size + OV, ze), (-OV, size + OV, ze)]
    centre = (size / 2, size / 2, ze)
    for i in range(4):
        a, d = c[i], c[(i + 1) % 4]
        mid = ((a[0] + d[0]) / 2 - centre[0], (a[1] + d[1]) / 2 - centre[1], 1.0)
        b.poly([a, d, apex], 'roof', outward=mid)
    b.poly(c, 'planks', outward=(0, 0, -1))
    top = apex[2]
    b.lathe([(0.07, top - 0.1), (0.05, top + 0.7)], 6, 'iron', m=Matrix.Translation((apex[0], apex[1], 0)))
    if spire:
        x, y = apex[0], apex[1]
        b.box((x - 0.04, y - 0.04, top + 0.7), (x + 0.04, y + 0.04, top + 1.5), 'gold')
        b.box((x - 0.25, y - 0.04, top + 1.12), (x + 0.25, y + 0.04, top + 1.2), 'gold')
    else:
        b.blob((apex[0], apex[1], top + 0.75), 0.1, 'gold', subdiv=1, jitter=0)
    return b


def dormer():
    """Front wall at y=0 facing -Y; sits on a roof slope and buries itself into it."""
    b = MeshBuilder()
    w, h, depth = 0.6, 1.2, 1.9
    b.box((-w, -0.08, 0), (-0.25, 0.08, h), 'plaster')
    b.box((0.25, -0.08, 0), (w, 0.08, h), 'plaster')
    b.box((-0.25, -0.08, 0), (0.25, 0.08, 0.3), 'plaster')
    b.box((-0.25, -0.08, 1.0), (0.25, 0.08, h), 'plaster')
    for x0 in (-w - 0.06, w - 0.06):
        b.box((x0, -0.1, 0), (x0 + 0.12, 0.1, h), 'timber')
    b.box((-0.25, -0.02, 0.3), (0.25, 0.02, 1.0), 'glass')
    b.box((-0.3, -0.18, 0.24), (0.3, -0.04, 0.32), 'timber')
    for x in (-w, w - 0.1):
        b.box((x, 0.08, 0), (x + 0.1, depth, h), 'plaster')
    b.extrude([(-w, 0, h), (w, 0, h), (0, 0, h + w)], (0, 0.1, 0), 'plaster')
    eave = 0.25
    b.beam((-w - eave, 0, h - eave), (0.05, 0, h + w + 0.05), (0, 1, 0), (-0.2, depth), 0.1,
           'timber', mats=SLAB_MATS)
    b.beam((-0.05, 0, h + w + 0.05), (w + eave, 0, h - eave), (0, 1, 0), (-0.2, depth), 0.1,
           'timber', mats=SLAB_MATS)
    return b


def chimney(height=6.2):
    """Tall rubble stack: a corbelled band, a dressed cap and two clay pots."""
    b = MeshBuilder()
    if not detailed():
        b.box((-0.42, -0.42, 0), (0.42, 0.42, height), 'stone', skip=('-z',))
        b.box((-0.5, -0.5, height - 0.15), (0.5, 0.5, height), 'stone')
        return b
    band = height - 0.75
    b.box((-0.42, -0.42, 0), (0.42, 0.42, band), 'stone', skip=('-z',))
    b.box((-0.5, -0.5, band), (0.5, 0.5, band + 0.14), 'stone')
    b.box((-0.45, -0.45, band + 0.14), (0.45, 0.45, height - 0.16), 'stone')
    b.box((-0.53, -0.53, height - 0.16), (0.53, 0.53, height), 'stone')
    for x in (-0.2, 0.2):
        b.lathe([(0.13, height), (0.15, height + 0.12), (0.11, height + 0.38), (0.13, height + 0.42),
                 (0.09, height + 0.42)], 8, 'roof_terracotta', m=Matrix.Translation((x, 0, 0)),
                smooth=True)
    return b


def _slab(b, eave, rise_dir, along, length, width, thick, mats):
    """Roof board whose eave edge starts at `eave`, climbing `rise_dir` for `width`
    and running `along` for `length`; its +z face (the roof) points away from below."""
    x_dir = Vector(along)
    y_dir = Vector(rise_dir)
    m = frame(eave, x_dir, y_dir)
    if (m.to_3x3() @ Vector((0, 0, 1))).z < 0:
        m = frame(Vector(eave) + x_dir.normalized() * length, -x_dir, y_dir)
    b.box((0, 0, 0), (length, width, thick), 'timber', m=m, mats=mats)


def cross_gable(width, pitch=math.radians(55), front=0.45, sill=0.6):
    """A gabled bay rising from the front wall (y = 0, exterior -Y) through the main
    eave. Origin at the bay's centre on the wall top; its roof runs back until it
    buries itself in the main roof slope."""
    b = MeshBuilder()
    half, tan, cos, sin = width / 2, math.tan(pitch), math.cos(pitch), math.sin(pitch)
    h = half * tan
    back = h / math.tan(ROOF_PITCH) + 0.45
    b.extrude([(-half, -0.04, -sill), (half, -0.04, -sill), (half, -0.04, 0.0), (0, -0.04, h),
               (-half, -0.04, 0.0)], (0, 0.3, 0), 'plaster')
    ov = 0.35
    for side in (-1, 1):
        eave = (side * (half + ov), -front, -ov * tan)
        _slab(b, eave, (-side * cos, 0, sin), (0, 1, 0), back + front, (half + ov) / cos + 0.04,
              ROOF_THICK, SLAB_MATS)
        b.beam((side * (half + ov), -front - 0.02, -ov * tan - 0.06), (0, -front - 0.02, h + 0.1),
               (0, 1, 0), (-0.06, 0.0), 0.26, 'timber')
    b.box((-0.12, -front, h + 0.06), (0.12, back, h + 0.26), 'roof', bevel=0)
    face = -0.1
    b.box((-half, face, -0.12), (half, -0.02, 0.1), 'timber')
    b.box((-0.06, face, 1.15), (0.06, -0.02, h - 0.1), 'timber')
    for side in (-1, 1):
        b.beam((side * half, -0.06, 0.0), (0, -0.06, h), (0, 1, 0), (-0.04, 0.04), 0.16, 'timber')
    if detailed():
        for side in (-1, 1):
            b.beam((side * (half - 0.12), -0.06, 0.1), (side * 0.36, -0.06, 0.95), (0, 1, 0),
                   (-0.04, 0.04), 0.12, 'timber')
        b.lathe([(0.0, h + 0.2), (0.07, h + 0.2), (0.05, h + 0.6), (0.1, h + 0.72), (0.0, h + 0.9)],
                8, 'timber', m=Matrix.Translation((0, -front - 0.02, 0)))
    x0, x1, z0, z1 = -0.36, 0.36, 0.2, 1.05
    b.box((x0 - 0.08, face, z0 - 0.1), (x1 + 0.08, -0.02, z0), 'timber')
    b.box((x0 - 0.08, face, z1), (x1 + 0.08, -0.02, z1 + 0.08), 'timber')
    for x in (x0 - 0.08, x1):
        b.box((x, face, z0), (x + 0.08, -0.02, z1), 'timber')
    b.box((x0, -0.07, z0), (x1, -0.05, z1), 'glass', skip=('-x', '+x', '-z', '+z'))
    return b


def define(kit):
    for span in ROOF_SPANS:
        kit.define(f'Roof_Gable_S{span}', 'roofs', gable_section(span))
        kit.define(f'Roof_Gable_End_S{span}', 'roofs', gable_eave_end(span))
        kit.define(f'Gable_Wall_S{span}', 'roofs', gable_wall(span))
        kit.define(f'Roof_Steep_S{span}', 'roofs', gable_section(span, STEEP_PITCH))
        kit.define(f'Roof_Steep_End_S{span}', 'roofs', gable_eave_end(span, STEEP_PITCH))
        kit.define(f'Gable_Wall_Steep_S{span}', 'roofs',
                   gable_wall(span, STEEP_PITCH, infill='clapboard'))
    for size, pitch in PYRAMID_PITCH.items():
        kit.define(f'Roof_Pyramid_{size}', 'roofs', pyramid(float(size), pitch))
    kit.define('Roof_Spire_4', 'roofs', pyramid(4.0, 72, spire=True))
    for level in JETTY_LEVELS:
        for span in ROOF_SPANS:
            key, wide = jetty_key(span, level), span + level * JETTY
            kit.define(f'Roof_Gable_{key}', 'roofs', gable_section(wide))
            kit.define(f'Roof_Gable_End_{key}', 'roofs', gable_eave_end(wide))
            kit.define(f'Gable_Wall_{key}', 'roofs', gable_wall(wide))
    for level in JETTY_LEVELS:
        for span in ROOF_SPANS:
            kit.define(f'Roof_Gable_Fill_J{level}_S{span}', 'roofs', gable_fill(span, level * JETTY))
    kit.define('Cross_Gable_3', 'roofs', cross_gable(3.0))
    kit.define('Cross_Gable_4', 'roofs', cross_gable(4.0))
    kit.define('Dormer', 'roofs', dormer())
    kit.define('Chimney', 'roofs', chimney())
