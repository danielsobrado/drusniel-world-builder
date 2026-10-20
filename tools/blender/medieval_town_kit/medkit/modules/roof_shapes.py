"""Regional roof shapes: Mediterranean hip roofs, Nordic gable finials and pent
roofs, battlemented tower crowns, and a material swatch.

Hip roofs cover a whole building (span x length) in one module: the hips are
45 degrees in plan, so every slope shares one pitch and the eaves stay level.
"""
import math

from ..config import GRID, HIP_LENGTHS, ROOF_OVERHANG as OV, detailed
from ..mesh import MeshBuilder

HIP_PITCH = math.radians(30)


def hip_roof(span, length, pitch=HIP_PITCH, mat='roof_terracotta'):
    """Local frame like the gable modules: walls' top at z=0, footprint x 0..length, y 0..span."""
    b = MeshBuilder()
    tan = math.tan(pitch)
    z_lift = 0.14
    ze = -OV * tan + z_lift
    h = span / 2 * tan + z_lift
    e = [(-OV, -OV, ze), (length + OV, -OV, ze), (length + OV, span + OV, ze), (-OV, span + OV, ze)]
    r0, r1 = (span / 2, span / 2, h), (length - span / 2, span / 2, h)
    up = 1.0
    b.poly([e[0], e[1], r1, r0], mat, outward=(0, -1, up))
    b.poly([e[2], e[3], r0, r1], mat, outward=(0, 1, up))
    b.poly([e[1], e[2], r1], mat, outward=(1, 0, up))
    b.poly([e[3], e[0], r0], mat, outward=(-1, 0, up))
    b.poly(e, 'planks', outward=(0, 0, -1))
    fascia = 0.16
    b.box((-OV, -OV, ze - fascia), (length + OV, -OV + 0.07, ze + 0.02), 'timber')
    b.box((-OV, span + OV - 0.07, ze - fascia), (length + OV, span + OV, ze + 0.02), 'timber')
    b.box((-OV, -OV, ze - fascia), (-OV + 0.07, span + OV, ze + 0.02), 'timber')
    b.box((length + OV - 0.07, -OV, ze - fascia), (length + OV, span + OV, ze + 0.02), 'timber')

    # Four diagonal hip ridge spines with terracotta barrel hip tiles
    hips = ((e[0], r0, (-1, -1, 1)), (e[1], r1, (1, -1, 1)),
            (e[2], r1, (1, 1, 1)), (e[3], r0, (-1, 1, 1)))
    for p_eave, p_ridge, out_dir in hips:
        b.beam(p_eave, p_ridge, out_dir, (-0.02, 0.09), 0.16, mat)
        if detailed():
            segs = 6
            for k in range(segs):
                t0 = (k + 0.12) / segs
                t1 = (k + 0.88) / segs
                q0 = tuple(p_eave[j] + (p_ridge[j] - p_eave[j]) * t0 for j in range(3))
                q1 = tuple(p_eave[j] + (p_ridge[j] - p_eave[j]) * t1 for j in range(3))
                b.beam(q0, q1, out_dir, (0.01, 0.125), 0.19, mat)

    if length > span:
        b.box((r0[0] - 0.08, span / 2 - 0.14, h - 0.03), (r1[0] + 0.08, span / 2 + 0.14, h + 0.14), mat)
        if detailed():
            r_len = r1[0] - r0[0]
            count = max(1, round(r_len / 0.38))
            step = r_len / count
            for i in range(count):
                tx0 = r0[0] + i * step + 0.015
                tx1 = r0[0] + (i + 1) * step - 0.015
                b.box((tx0, span / 2 - 0.11, h + 0.04), (tx1, span / 2 + 0.11, h + 0.175), mat)
    if detailed():
        # Classical Mediterranean stone modillion/dentil eave corbels under the overhang
        for x_idx in range(int((length + 2 * OV) / 0.55)):
            mx = -OV + 0.28 + x_idx * 0.55
            for my in (-OV + 0.06, span + OV - 0.22):
                b.box((mx - 0.045, my, ze - fascia - 0.08), (mx + 0.045, my + 0.16, ze - fascia),
                      'stone_dressed')
        for y_idx in range(int((span + 2 * OV) / 0.55)):
            my = -OV + 0.28 + y_idx * 0.55
            for mx in (-OV + 0.06, length + OV - 0.22):
                b.box((mx, my - 0.045, ze - fascia - 0.08), (mx + 0.16, my + 0.045, ze - fascia),
                      'stone_dressed')
    return b


def finial(height=1.3):
    """Crossed, outward-bending Nordic dragon-head horn boards past a gable apex.

    Origin at the apex; the gable faces -X. Each horn rises along one rake, curves
    into a sculpted dragon neck with dorsal ridge fins, and ends in open jaws & scroll snout.
    """
    b = MeshBuilder()
    for side in (-1, 1):
        p0 = (0, side * -0.32, -0.42)
        p1 = (0, side * 0.30, height * 0.52)
        p2 = (0, side * 0.58, height * 0.92)
        tip = (0, side * 0.74, height * 1.06)
        b.beam(p0, p1, (1, 0, 0), (-0.06, 0.06), 0.15, 'timber')
        b.beam(p1, p2, (1, 0, 0), (-0.055, 0.055), 0.135, 'wood_trim')
        b.beam(p2, tip, (1, 0, 0), (-0.065, 0.065), 0.19, 'wood_trim')
        if detailed():
            # Dragon upper snout scroll, lower jaw & dorsal mane fins
            jaw = (0, side * 0.84, height * 0.96)
            crest = (0, side * 0.64, height * 1.20)
            b.beam(p2, jaw, (1, 0, 0), (-0.045, 0.045), 0.08, 'wood_trim')
            b.beam(p2, crest, (1, 0, 0), (-0.04, 0.04), 0.09, 'wood_trim')
            for k in range(3):
                ft = 0.25 + k * 0.28
                fy = side * (0.30 + 0.28 * ft)
                fz = height * (0.52 + 0.40 * ft) + 0.08
                b.box((-0.03, fy - 0.035, fz - 0.04), (0.03, fy + 0.035, fz + 0.06), 'wood_trim')
    # Central king-post boss & forged iron binding strap at the crossing
    b.box((-0.085, -0.32, -0.9), (0.025, 0.32, -0.28), 'timber')
    if detailed():
        b.box((-0.095, -0.14, -0.12), (0.035, 0.14, 0.14), 'iron')
        b.box((-0.09, -0.28, -0.68), (-0.075, 0.28, -0.34), 'carved_wood')
    return b


def pent_roof(depth=0.9, pitch=math.radians(28)):
    """Lean-to roof strip on a wall face (exterior -Y), origin at the wall top line."""
    b = MeshBuilder()
    drop = depth * math.tan(pitch)
    mats = {'+z': 'roof', '-z': 'planks'}
    b.beam((0, 0.05, 0.02), (0, -depth, -drop), (1, 0, 0), (0, GRID), 0.08, 'timber', mats=mats,
           tone=1.0, bevel=0)
    # Wall-ledger flashing beam & eave fascia rail
    b.box((0, -0.08, 0.0), (GRID, 0.04, 0.10), 'wood_trim', tone=1.0, skip=('-x', '+x'))
    b.box((0, -depth - 0.03, -drop - 0.07), (GRID, -depth + 0.05, -drop + 0.04), 'timber',
          tone=1.0, skip=('-x', '+x'))
    for x in (0.1, GRID - 0.18):
        b.beam((x, -0.15, -0.65), (x, -depth + 0.15, -drop + 0.02), (1, 0, 0), (0, 0.08), 0.1,
               'timber')
        if detailed():
            b.box((x - 0.01, -0.16, -0.72), (x + 0.09, -0.02, -0.56), 'wood_trim')
            b.box((x - 0.008, -0.17, -0.66), (x + 0.088, -0.12, -0.60), 'iron', bevel=0)
    if detailed():
        # Exposed rafter tails under the pent eave
        for i in range(4):
            rx = 0.25 + i * 0.5
            b.box((rx - 0.035, -depth - 0.08, -drop - 0.09),
                  (rx + 0.035, -depth + 0.12, -drop - 0.01), 'wood_trim')
    return b


def battlements(size):
    """Flat stone crown with corbelled machicolations and dressed-stone coped merlons."""
    b = MeshBuilder()
    t = 0.35
    b.box((-0.2, -0.2, 0), (size + 0.2, size + 0.2, 0.2), 'stone', mats={'+z': 'cobble'})
    b.box((-0.24, -0.24, 0.14), (size + 0.24, size + 0.24, 0.22), 'stone_dressed')
    sides = [((-0.2, -0.2), (size + 0.2, -0.2 + t)), ((-0.2, size + 0.2 - t), (size + 0.2, size + 0.2)),
             ((-0.2, -0.2), (-0.2 + t, size + 0.2)), ((size + 0.2 - t, -0.2), (size + 0.2, size + 0.2))]
    for (x0, y0), (x1, y1) in sides:
        b.box((x0, y0, 0.2), (x1, y1, 0.75), 'stone')
        b.box((x0 - 0.02, y0 - 0.02, 0.70), (x1 + 0.02, y1 + 0.02, 0.77), 'stone_dressed')
    full = size + 0.4
    for x0, y0, along_x in ((-0.2, -0.2, True), (-0.2, size + 0.2 - t, True),
                            (-0.2, -0.2, False), (size + 0.2 - t, -0.2, False)):
        count = max(2, int(full))
        step = full / count
        for i in range(count):
            a = i * step + step * 0.25
            if along_x:
                b.box((x0 + a, y0, 0.75), (x0 + a + step * 0.5, y0 + t, 1.26), 'stone')
                b.box((x0 + a - 0.03, y0 - 0.03, 1.24),
                      (x0 + a + step * 0.5 + 0.03, y0 + t + 0.03, 1.34), 'stone_dressed')
            else:
                b.box((x0, y0 + a, 0.75), (x0 + t, y0 + a + step * 0.5, 1.26), 'stone')
                b.box((x0 - 0.03, y0 + a - 0.03, 1.24),
                      (x0 + t + 0.03, y0 + a + step * 0.5 + 0.03, 1.34), 'stone_dressed')
        if detailed():
            # Machicolation corbel brackets beneath the overhanging parapet
            corbels = max(4, int(full * 1.5))
            c_step = full / corbels
            for c_idx in range(corbels):
                ca = (c_idx + 0.5) * c_step
                if along_x:
                    cy = y0 if y0 < 0 else y0 + t - 0.18
                    b.box((x0 + ca - 0.06, cy, -0.24), (x0 + ca + 0.06, cy + 0.18, 0.0), 'stone_dressed')
                else:
                    cx = x0 if x0 < 0 else x0 + t - 0.18
                    b.box((cx, y0 + ca - 0.06, -0.24), (cx + 0.18, y0 + ca + 0.06, 0.0), 'stone_dressed')
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
