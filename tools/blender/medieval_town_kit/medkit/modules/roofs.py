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
from .carpentry import carved_relief_motif, recessed_panel_front, recessed_panel_side

STEEP_PITCH = math.radians(60)
SLAB_MATS = {'+z': 'roof', '-z': 'planks'}
PYRAMID_PITCH = {4: 55, 6: 50}   # degrees per tower size for Roof_Pyramid_<size>
END_LEN = 0.35


def ridge_height(span, pitch=ROOF_PITCH):
    return span / 2 * math.tan(pitch)


def _ridge_saddle(b, x0, x1, span, pitch, mat='roof'):
    """Pitched V-saddle ridge cap with individual overlapping crested ridge tiles."""
    h = ridge_height(span, pitch)
    tan = math.tan(pitch)
    mid = span * 0.5
    hw = 0.17
    drop = hw * tan
    z_base = h + ROOF_THICK - 0.02
    profile = [
        (x0, mid - hw, z_base - drop),
        (x0, mid - hw, z_base - drop + 0.07),
        (x0, mid, z_base + 0.11),
        (x0, mid + hw, z_base - drop + 0.07),
        (x0, mid + hw, z_base - drop),
    ]
    b.extrude(profile, (x1 - x0, 0, 0), mat, tone=1.0)
    if detailed():
        span_x = x1 - x0
        count = max(1, round(span_x / 0.40))
        step = span_x / count
        for i in range(count):
            tx0 = x0 + i * step + 0.015
            tx1 = x0 + (i + 1) * step - 0.015
            if tx1 > tx0:
                # Overlapping crested ridge tile collar & finial nib
                b.box((tx0, mid - 0.11, z_base + 0.02), (tx1, mid + 0.11, z_base + 0.135), mat)
                cx = 0.5 * (tx0 + tx1)
                b.box((cx - 0.035, mid - 0.045, z_base + 0.13),
                      (cx + 0.035, mid + 0.045, z_base + 0.18), 'stone_dressed', bevel=0)


def _slopes(b, x0, x1, span, pitch, barge=False):
    tan, cos = math.tan(pitch), math.cos(pitch)
    front = Matrix.Translation((0, -OV, -OV * tan)) @ Matrix.Rotation(pitch, 4, 'X')
    back = Matrix.Translation((x0 + x1, span, 0)) @ Matrix.Rotation(math.pi, 4, 'Z') @ front
    length = (span / 2 + OV) / cos + 0.05
    seam_skip = () if barge else ('-x', '+x')
    for m in (front, back):
        # One tone and square ends: neighbouring sections must read as one roof, not
        # 2 m tiles with a chamfer groove and a shade step at every joint.
        b.box((x0, 0, 0), (x1, length, ROOF_THICK), 'timber', m=m, mats=SLAB_MATS, tone=1.0,
              bevel=0, skip=seam_skip)
        if detailed():
            # Dimensional starter eave slate course & molded double-stepped eave fascia board
            b.box((x0, -0.02, ROOF_THICK - 0.005), (x1, 0.18, ROOF_THICK + 0.018), 'roof', m=m,
                  tone=1.0, bevel=0, skip=seam_skip)
            b.box((x0, -0.07, -0.14), (x1, 0.03, ROOF_THICK + 0.03), 'timber', m=m, tone=1.0,
                  skip=seam_skip)
            b.box((x0, -0.085, -0.04), (x1, -0.055, ROOF_THICK + 0.045), 'wood_trim', m=m,
                  tone=1.0, bevel=0, skip=seam_skip)
    if barge:
        # Ornate double-stepped gable bargeboards (vergeboards) with eave corbel knees
        b.box((x0, -0.06, -0.15), (x0 + 0.065, length, ROOF_THICK + 0.06), 'timber', m=front)
        b.box((x1 - 0.065, -0.06, -0.15), (x1, length, ROOF_THICK + 0.06), 'timber', m=back)
        if detailed():
            b.box((x0 - 0.018, -0.08, -0.08), (x0 + 0.025, length, ROOF_THICK + 0.075),
                  'wood_trim', m=front)
            b.box((x1 - 0.025, -0.08, -0.08), (x1 + 0.018, length, ROOF_THICK + 0.075),
                  'wood_trim', m=back)
            # Scrolled eave knee corbels at the foot of the bargeboards
            b.box((x0 - 0.015, -0.12, -0.24), (x0 + 0.07, 0.18, -0.12), 'wood_trim', m=front)
            b.box((x1 - 0.07, -0.12, -0.24), (x1 + 0.015, 0.18, -0.12), 'wood_trim', m=back)
            # Turned oak pendant drop-finial at the gable apex
            h_apex = ridge_height(span, pitch)
            pend_m = Matrix.Translation((x0 + 0.04, span * 0.5, 0))
            b.lathe([(0.0, h_apex - 0.42), (0.045, h_apex - 0.32), (0.028, h_apex - 0.18),
                     (0.06, h_apex - 0.06), (0.05, h_apex + 0.16), (0.0, h_apex + 0.22)],
                    8, 'wood_trim', m=pend_m)
    if not barge:
        for m in (front, back):
            for i in range(int((x1 - x0) / 0.5)):
                x = x0 + 0.25 + i * 0.5
                b.box((x - 0.05, -0.12, -0.13), (x + 0.05, OV / cos + 0.35, 0.0), 'timber', m=m)
                if detailed():
                    # Chamfered rafter-tail corbel nose & oak peg
                    b.box((x - 0.042, -0.155, -0.105), (x + 0.042, -0.09, -0.015), 'wood_trim', m=m)
    h = ridge_height(span, pitch)
    if pitch >= STEEP_PITCH - 1e-6:
        log = Matrix.Translation((x0, span / 2, h + 0.2)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
        b.lathe([(0.0, 0.0), (0.17, 0.0), (0.17, x1 - x0), (0.0, x1 - x0)], 8, 'timber', m=log,
                smooth=True)
        if detailed():
            # Forged iron binding collars & carved dragon-comb ridge spine
            b.box((x0, span / 2 - 0.03, h + 0.34), (x1, span / 2 + 0.03, h + 0.44), 'wood_trim',
                  tone=1.0, skip=seam_skip)
            span_x = x1 - x0
            for k in range(max(1, int(span_x / 0.6))):
                ix = x0 + (k + 0.5) * (span_x / max(1, int(span_x / 0.6)))
                b.box((ix - 0.025, span / 2 - 0.185, h + 0.06),
                      (ix + 0.025, span / 2 + 0.185, h + 0.38), 'iron', bevel=0)
    else:
        _ridge_saddle(b, x0, x1, span, pitch, 'roof')


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
    tan = math.tan(pitch)
    b.extrude([(-0.1, 0, 0), (-0.1, span, 0), (-0.1, span / 2, h)], (0.1 + T, 0, 0), infill)
    # Molded tie-beam at the base of the gable
    b.box((-0.17, 0, 0), (-0.05, span, 0.22), 'timber')
    mid = span / 2
    # King post and raking principal rafters
    b.box((-0.16, mid - 0.075, 1.28), (-0.06, mid + 0.075, h - 0.16), 'timber')
    for y0, y1 in ((0.0, mid), (span, mid)):
        b.beam((0, y0, -0.1), (0, y1, h - 0.12), (1, 0, 0), (-0.165, -0.06), 0.18, 'timber')

    if detailed():
        # Stepped drip cap over tie-beam + under-tie corbel brackets
        b.box((-0.195, 0.04, 0.18), (-0.15, span - 0.04, 0.24), 'wood_trim')
        for cy in (0.24, span - 0.24):
            b.box((-0.18, cy - 0.05, -0.18), (-0.08, cy + 0.05, 0.0), 'wood_trim')
        # Collar beam at z=1.28 & queen posts / raking struts in the side bays
        collar_w = max(0.55, (h - 1.34) / tan)
        b.box((-0.16, mid - collar_w, 1.24), (-0.06, mid + collar_w, 1.36), 'timber')
        q_off = min(span * 0.24, mid - 0.45)
        for s in (-1, 1):
            qy = mid + s * q_off
            q_top = max(0.45, (mid - abs(s * q_off)) * tan - 0.14)
            if q_top > 0.32:
                b.box((-0.155, qy - 0.055, 0.22), (-0.06, qy + 0.055, q_top), 'timber')
                # Diagonal brace from tie-beam out toward principal rafter
                b.beam((0, qy, 0.24), (0, mid + s * (q_off + 0.55), min(q_top - 0.05, 1.05)),
                       (1, 0, 0), (-0.15, -0.07), 0.10, 'timber')
            # Upper curved/angled strut from king post to principal rafter
            if h > 2.1:
                b.beam((0, mid, 1.42), (0, mid + s * (collar_w * 0.62), 1.42 + collar_w * 0.38 * tan),
                       (1, 0, 0), (-0.15, -0.07), 0.095, 'timber')

    # Framed gable attic casement window with sill corbels, mullions & carved shutters
    wy0, wy1, wz0, wz1 = mid - 0.26, mid + 0.26, 0.48, 1.16
    wf = 0.055
    for lo, hi in (((-0.19, wy0 - wf, wz0), (-0.08, wy0, wz1)),
                   ((-0.19, wy1, wz0), (-0.08, wy1 + wf, wz1)),
                   ((-0.19, wy0 - wf, wz0 - wf), (-0.08, wy1 + wf, wz0)),
                   ((-0.19, wy0 - wf, wz1), (-0.08, wy1 + wf, wz1 + wf))):
        b.box(lo, hi, 'wood_trim')
    b.box((-0.24, wy0 - 0.12, wz0 - 0.11), (-0.08, wy1 + 0.12, wz0 - 0.04), 'wood_trim')
    b.box((-0.15, wy0, wz0), (-0.12, wy1, wz1), 'glass')
    if detailed():
        zm = 0.5 * (wz0 + wz1)
        b.box((-0.165, mid - 0.018, wz0), (-0.13, mid + 0.018, wz1), 'wood_trim', bevel=0)
        b.box((-0.165, wy0, zm - 0.016), (-0.13, wy1, zm + 0.016), 'wood_trim', bevel=0)
        for sy0, sy1 in ((wy0 - 0.26, wy0 - wf - 0.01), (wy1 + wf + 0.01, wy1 + 0.26)):
            b.box((-0.185, sy0, wz0 + 0.02), (-0.15, sy1, wz1 - 0.02), 'wood_trim')
            recessed_panel_side(b, sy0 + 0.02, sy1 - 0.02, wz0 + 0.05, wz1 - 0.05, -0.185,
                                sign_x=-1, depth=0.012, border=0.016, carved=True)
    return b


def pyramid(size, pitch_deg, spire=False):
    b = MeshBuilder()
    tan = math.tan(math.radians(pitch_deg))
    z_lift = 0.12
    ze = -OV * tan + z_lift
    apex = (size / 2, size / 2, size / 2 * tan + z_lift)
    c = [(-OV, -OV, ze), (size + OV, -OV, ze), (size + OV, size + OV, ze), (-OV, size + OV, ze)]
    centre = (size / 2, size / 2, ze)
    for i in range(4):
        a, d = c[i], c[(i + 1) % 4]
        mid = ((a[0] + d[0]) / 2 - centre[0], (a[1] + d[1]) / 2 - centre[1], 1.0)
        b.poly([a, d, apex], 'roof', outward=mid)
        if detailed():
            # Hip ridge cresting spine along each corner hip
            b.beam(a, apex, mid, (-0.05, 0.05), 0.11, 'roof')
    b.poly(c, 'planks', outward=(0, 0, -1))
    # Molded eave fascia & corbel frieze around the 4 sides
    e0, e1 = -OV, size + OV
    for lo, hi in (((e0, e0, ze - 0.14), (e1, e0 + 0.08, ze + 0.04)),
                   ((e0, e1 - 0.08, ze - 0.14), (e1, e1, ze + 0.04)),
                   ((e0, e0 + 0.08, ze - 0.14), (e0 + 0.08, e1 - 0.08, ze + 0.04)),
                   ((e1 - 0.08, e0 + 0.08, ze - 0.14), (e1, e1 - 0.08, ze + 0.04))):
        b.box(lo, hi, 'timber')
    top = apex[2]
    b.lathe([(0.09, top - 0.12), (0.11, top + 0.04), (0.055, top + 0.72)], 6, 'iron',
            m=Matrix.Translation((apex[0], apex[1], 0)))
    if spire:
        x, y = apex[0], apex[1]
        b.box((x - 0.04, y - 0.04, top + 0.7), (x + 0.04, y + 0.04, top + 1.55), 'gold')
        b.box((x - 0.26, y - 0.04, top + 1.12), (x + 0.26, y + 0.04, top + 1.20), 'gold')
        if detailed():
            b.blob((x, y, top + 0.72), 0.09, 'gold', subdiv=1, jitter=0)
            b.box((x - 0.04, y - 0.26, top + 1.12), (x + 0.04, y + 0.26, top + 1.20), 'gold')
    else:
        b.blob((apex[0], apex[1], top + 0.75), 0.11, 'gold', subdiv=1, jitter=0)
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
        b.box((x0, -0.11, 0), (x0 + 0.12, 0.1, h), 'timber')
    # Timber sill & lintel rails
    b.box((-w - 0.06, -0.10, 0.0), (w + 0.06, 0.06, 0.12), 'timber')
    b.box((-w - 0.06, -0.10, h - 0.12), (w + 0.06, 0.06, h), 'timber')
    # Hollow 4-sided window casement frame around glass (-0.25..0.25, 0.30..1.00) & projecting sill
    for lo, hi in (((-0.30, -0.10, 0.30), (-0.24, 0.04, 1.00)),
                   ((0.24, -0.10, 0.30), (0.30, 0.04, 1.00)),
                   ((-0.30, -0.10, 0.96), (0.30, 0.04, 1.02))):
        b.box(lo, hi, 'wood_trim')
    b.box((-0.25, -0.02, 0.3), (0.25, 0.02, 1.0), 'glass')
    b.box((-0.34, -0.20, 0.22), (0.34, -0.02, 0.31), 'wood_trim')
    for x in (-w, w - 0.1):
        b.box((x, 0.08, 0), (x + 0.1, depth, h), 'plaster')
        if detailed():
            # Timber cheek framing along dormer sides
            b.box((x - 0.01, 0.08, h - 0.12), (x + 0.11, depth, h), 'timber')
            b.beam((x + 0.05, 0.10, 0.12), (x + 0.05, depth * 0.65, h - 0.12),
                   (1, 0, 0), (-0.06, 0.06), 0.09, 'timber')
    b.extrude([(-w, 0, h), (w, 0, h), (0, 0, h + w)], (0, 0.1, 0), 'plaster')
    b.box((-0.05, -0.10, h), (0.05, 0.06, h + w - 0.06), 'timber')
    eave = 0.25
    b.beam((-w - eave, 0, h - eave), (0.05, 0, h + w + 0.05), (0, 1, 0), (-0.2, depth), 0.1,
           'timber', mats=SLAB_MATS)
    b.beam((-0.05, 0, h + w + 0.05), (w + eave, 0, h - eave), (0, 1, 0), (-0.2, depth), 0.1,
           'timber', mats=SLAB_MATS)
    # Dormer ridge saddle cap
    b.box((-0.08, -0.22, h + w - 0.02), (0.08, depth, h + w + 0.12), 'roof')
    if detailed():
        # Window mullion, transom, sill corbels, and carved shutters
        b.box((-0.018, -0.06, 0.30), (0.018, 0.02, 1.00), 'wood_trim', bevel=0)
        b.box((-0.25, -0.06, 0.63), (0.25, 0.02, 0.67), 'wood_trim', bevel=0)
        for cx in (-0.24, 0.24):
            b.box((cx - 0.03, -0.17, 0.13), (cx + 0.03, -0.06, 0.22), 'wood_trim')
        for sx0, sx1 in ((-0.50, -0.28), (0.28, 0.50)):
            b.box((sx0, -0.115, 0.31), (sx1, -0.075, 0.99), 'wood_trim')
            recessed_panel_front(b, sx0 + 0.02, sx1 - 0.02, 0.34, 0.96, -0.115,
                                 depth=0.012, border=0.015, carved=True, style='knotwork')
        # Molded bargeboards & turned apex finial on dormer
        for s in (-1, 1):
            b.beam((s * (w + eave), -0.22, h - eave - 0.04), (0.0, -0.22, h + w + 0.08),
                   (0, 1, 0), (-0.04, 0.04), 0.12, 'wood_trim')
        b.lathe([(0.0, h + w + 0.06), (0.045, h + w + 0.12), (0.03, h + w + 0.34), (0.0, h + w + 0.42)],
                6, 'wood_trim', m=Matrix.Translation((0, -0.20, 0)))
    return b


def chimney(height=6.2):
    """Tall rubble stack with dressed corner quoins, corbelled oversailing crown, and octagonal clay pots."""
    b = MeshBuilder()
    if not detailed():
        b.box((-0.42, -0.42, 0), (0.42, 0.42, height), 'stone', skip=('-z',))
        b.box((-0.5, -0.5, height - 0.15), (0.5, 0.5, height), 'stone')
        return b
    band = height - 0.82
    b.box((-0.42, -0.42, 0), (0.42, 0.42, band), 'stone', skip=('-z',))
    # Dressed stone corner quoins on the upper visible chimney shaft
    course_h = 0.36
    k_start = int(2.4 / course_h)
    k_end = int((band - 0.1) / course_h)
    for k in range(k_start, k_end):
        z0, z1 = k * course_h + 0.01, (k + 1) * course_h - 0.01
        long_arm, short_arm = (0.26, 0.16) if k % 2 == 0 else (0.16, 0.26)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cx, cy = sx * 0.435, sy * 0.435
                b.box((min(cx, cx - sx * long_arm), min(cy, cy - sy * short_arm), z0),
                      (max(cx, cx - sx * long_arm), max(cy, cy - sy * short_arm), z1), 'stone_dressed')
    # Stepped dressed-stone necking band & corbelled oversailing cap
    b.box((-0.48, -0.48, band - 0.08), (0.48, 0.48, band + 0.04), 'stone_dressed')
    b.box((-0.52, -0.52, band + 0.04), (0.52, 0.52, band + 0.16), 'stone_dressed')
    b.box((-0.44, -0.44, band + 0.16), (0.44, 0.44, height - 0.22), 'stone')
    b.box((-0.50, -0.50, height - 0.22), (0.50, 0.50, height - 0.12), 'stone_dressed')
    b.box((-0.56, -0.56, height - 0.12), (0.56, 0.56, height), 'stone_dressed')
    for x in (-0.21, 0.21):
        b.box((x - 0.16, -0.16, height), (x + 0.16, 0.16, height + 0.06), 'stone_dressed')
        b.lathe([(0.13, height + 0.06), (0.15, height + 0.16), (0.11, height + 0.42),
                 (0.14, height + 0.46), (0.14, height + 0.50), (0.09, height + 0.50)],
                8, 'roof_terracotta', m=Matrix.Translation((x, 0, 0)), smooth=True)
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
        if detailed():
            b.beam((side * (half + ov), -front - 0.04, -ov * tan - 0.03), (0, -front - 0.04, h + 0.12),
                   (0, 1, 0), (-0.04, 0.01), 0.12, 'wood_trim')
    # Pitched V-saddle ridge cap & crested tiles along Y
    b.box((-0.13, -front, h + 0.06), (0.13, back, h + 0.24), 'roof', bevel=0)
    if detailed():
        span_y = back + front
        count = max(1, round(span_y / 0.42))
        step = span_y / count
        for i in range(count):
            ty0 = -front + i * step + 0.02
            ty1 = -front + (i + 1) * step - 0.02
            b.box((-0.10, ty0, h + 0.16), (0.10, ty1, h + 0.28), 'roof')
            cy = 0.5 * (ty0 + ty1)
            b.box((-0.04, cy - 0.035, h + 0.27), (0.04, cy + 0.035, h + 0.32), 'stone_dressed', bevel=0)
    face = -0.1
    b.box((-half, face, -0.12), (half, -0.02, 0.1), 'timber')
    b.box((-0.06, face, 1.15), (0.06, -0.02, h - 0.1), 'timber')
    for side in (-1, 1):
        b.beam((side * half, -0.06, 0.0), (0, -0.06, h), (0, 1, 0), (-0.04, 0.04), 0.16, 'timber')
    x0, x1, z0, z1 = -0.36, 0.36, 0.2, 1.05
    b.box((x0 - 0.08, face - 0.01, z0 - 0.1), (x1 + 0.08, -0.02, z0), 'wood_trim')
    b.box((x0 - 0.08, face - 0.01, z1), (x1 + 0.08, -0.02, z1 + 0.08), 'wood_trim')
    for x in (x0 - 0.08, x1):
        b.box((x, face - 0.01, z0), (x + 0.08, -0.02, z1), 'wood_trim')
    b.box((x0, -0.07, z0), (x1, -0.05, z1), 'glass', skip=('-x', '+x', '-z', '+z'))
    if detailed():
        # Carved braid frieze along the cross-gable tie beam & corner corbel brackets
        carved_relief_motif(b, -half + 0.14, half - 0.14, -0.09, 0.07, face, style='frieze')
        for side in (-1, 1):
            b.beam((side * (half - 0.12), -0.06, 0.1), (side * 0.36, -0.06, 0.95), (0, 1, 0),
                   (-0.04, 0.04), 0.12, 'timber')
            b.box((side * (half - 0.16) - 0.05, face - 0.02, -sill),
                  (side * (half - 0.16) + 0.05, 0.02, -0.12), 'timber')
        # Window mullion, transom, and carved shutters
        zm = 0.5 * (z0 + z1)
        b.box((-0.02, -0.085, z0), (0.02, -0.04, z1), 'wood_trim', bevel=0)
        b.box((x0, -0.085, zm - 0.018), (x1, -0.04, zm + 0.018), 'wood_trim', bevel=0)
        for sx0, sx1 in ((x0 - 0.34, x0 - 0.08), (x1 + 0.08, x1 + 0.34)):
            b.box((sx0, face - 0.015, z0 + 0.02), (sx1, face + 0.02, z1 - 0.02), 'wood_trim')
            recessed_panel_front(b, sx0 + 0.025, sx1 - 0.025, z0 + 0.05, z1 - 0.05, face - 0.015,
                                 depth=0.014, border=0.016, carved=True, style='knotwork')
        # Apex finial spike & hanging drop pendant
        b.lathe([(0.0, h - 0.32), (0.05, h - 0.22), (0.03, h - 0.06), (0.07, h + 0.2),
                 (0.05, h + 0.6), (0.1, h + 0.72), (0.0, h + 0.92)],
                8, 'wood_trim', m=Matrix.Translation((0, -front - 0.02, 0)))
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
