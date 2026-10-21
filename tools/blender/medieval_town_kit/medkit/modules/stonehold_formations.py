"""Stonehold crag & geothermal stone formations: fractured stepped rock ledges,
bubbling caldera/vent basins, fang monolith shrine, glowing cavern maw, and
the horned crag sanctum with winding rock-cut stairs.
"""
import math
import random

from mathutils import Matrix, Vector

from ..config import detailed
from ..mesh import MeshBuilder


def _ring_pts(cx, cy, z, rx, ry, angles, radii_mult, tilt_x=0.0, tilt_y=0.0, rot=0.0):
    c_rot, s_rot = math.cos(rot), math.sin(rot)
    pts = []
    for a, rm in zip(angles, radii_mult):
        lx = rx * rm * math.cos(a)
        ly = ry * rm * math.sin(a)
        wx = cx + lx * c_rot - ly * s_rot
        wy = cy + lx * s_rot + ly * c_rot
        wz = z + lx * tilt_x + ly * tilt_y
        pts.append(Vector((wx, wy, wz)))
    return pts


def _loft_rings(b, bot_pts, top_pts, mat, cap_bot=False, cap_top=True, cap_mat=None, tone=1.0):
    n = len(bot_pts)
    centre = sum(bot_pts, Vector()) / n
    for i in range(n):
        p0, p1 = bot_pts[i], bot_pts[(i + 1) % n]
        q1, q0 = top_pts[(i + 1) % n], top_pts[i]
        mid = (p0 + p1 + q0 + q1) * 0.25
        out = Vector((mid.x - centre.x, mid.y - centre.y, 0.15))
        b.poly([p0, p1, q1, q0], mat, outward=out, tone=tone)
    if cap_bot:
        b.poly(list(reversed(bot_pts)), mat, outward=(0, 0, -1), tone=tone * 0.75)
    if cap_top:
        b.poly(top_pts, cap_mat or mat, outward=(0, 0, 1), tone=tone * 1.03)


def _crag_block(b, cx, cy, z0, z1, rx, ry, seed=1, sides=7, mat='stone_granite',
                cap_mat='stone_dressed', batter=0.88, chamfer=0.045,
                tilt_x=0.0, tilt_y=0.0, rot=0.0, tone=None):
    """Faceted polygonal rock slab with battered cliff sides and a crisp chamfered upper table."""
    rng = random.Random(seed)
    if not detailed():
        sides = max(5, sides - 2)
    angles = [2 * math.pi * i / sides + rng.uniform(-0.18, 0.18) / sides for i in range(sides)]
    rm_bot = [rng.uniform(0.84, 1.14) for _ in range(sides)]
    rm_mid = [r * batter * rng.uniform(0.95, 1.04) for r in rm_bot]
    tone_val = rng.uniform(0.88, 1.06) if tone is None else tone

    bot = _ring_pts(cx, cy, z0, rx, ry, angles, rm_bot, rot=rot)
    if detailed() and (z1 - z0) > chamfer * 2.2:
        z_ch = z1 - chamfer
        mid = _ring_pts(cx, cy, z_ch, rx, ry, angles, rm_mid, tilt_x=tilt_x, tilt_y=tilt_y, rot=rot)
        ch_scale = max(0.55, 1.0 - chamfer / max(0.15, min(rx, ry)))
        rm_top = [r * ch_scale for r in rm_mid]
        top = _ring_pts(cx, cy, z1, rx, ry, angles, rm_top, tilt_x=tilt_x, tilt_y=tilt_y, rot=rot)
        _loft_rings(b, bot, mid, mat, cap_bot=False, cap_top=False, tone=tone_val)
        _loft_rings(b, mid, top, cap_mat or mat, cap_bot=False, cap_top=True,
                    cap_mat=cap_mat or mat, tone=tone_val * 1.02)
    else:
        top = _ring_pts(cx, cy, z1, rx, ry, angles, rm_mid, tilt_x=tilt_x, tilt_y=tilt_y, rot=rot)
        _loft_rings(b, bot, top, mat, cap_bot=False, cap_top=True, cap_mat=cap_mat or mat, tone=tone_val)


def _wedge_block(b, pts_bot, pts_top, z0, z1, mat='stone_granite', cap_mat='stone_dressed',
                 chamfer=0.04, tone=1.0):
    """Polygonal rock plate from explicit 2D [(x, y), ...] bottom and top outlines."""
    n = len(pts_bot)
    bot = [Vector((x, y, z0)) for x, y in pts_bot]
    cx = sum(x for x, _ in pts_top) / n
    cy = sum(y for _, y in pts_top) / n
    if detailed() and (z1 - z0) > chamfer * 2.2:
        z_ch = z1 - chamfer
        mid = [Vector((x, y, z_ch)) for x, y in pts_top]
        top = [Vector((cx + (x - cx) * 0.88, cy + (y - cy) * 0.88, z1)) for x, y in pts_top]
        _loft_rings(b, bot, mid, mat, cap_bot=False, cap_top=False, tone=tone)
        _loft_rings(b, mid, top, cap_mat or mat, cap_bot=False, cap_top=True,
                    cap_mat=cap_mat or mat, tone=tone * 1.02)
    else:
        top = [Vector((x, y, z1)) for x, y in pts_top]
        _loft_rings(b, bot, top, mat, cap_bot=False, cap_top=True, cap_mat=cap_mat or mat, tone=tone)


def _fractured_terrace(b, cx, cy, z0, z1, rx, ry, seed=1, sectors=8,
                       mat='stone_granite', cap_mat='stone_dressed', gap=0.045):
    """A flat-topped rock stratum split by deep radial and ring fissures into fitted polygonal slabs."""
    rng = random.Random(seed)
    # Dark basalt inner core so deep fissure cracks show dark stone rather than void
    _crag_block(b, cx, cy, z0, max(z0 + 0.05, z1 - 0.09), rx * 0.84, ry * 0.84,
                seed=seed + 99, sides=sectors, mat='stone_basalt', cap_mat='stone_basalt',
                batter=0.92, chamfer=0.0, tone=0.72)

    if not detailed():
        _crag_block(b, cx, cy, z0, z1, rx, ry, seed=seed, sides=max(6, sectors - 2),
                    mat=mat, cap_mat=cap_mat, batter=0.88, chamfer=0.0)
        return

    # Central split cap plates (2 interlocking inner polygonal slabs)
    inner_rx, inner_ry = rx * 0.46, ry * 0.46
    for k in range(2):
        ang0 = k * math.pi + rng.uniform(-0.15, 0.15)
        ox = cx + math.cos(ang0 + math.pi * 0.5) * inner_rx * 0.36
        oy = cy + math.sin(ang0 + math.pi * 0.5) * inner_ry * 0.36
        _crag_block(b, ox, oy, z0 + 0.02, z1 + rng.uniform(-0.02, 0.04),
                    inner_rx * 0.72, inner_ry * 0.54, seed=seed + 10 + k, sides=6,
                    mat=mat, cap_mat=cap_mat, batter=0.94, chamfer=0.035,
                    rot=ang0, tone=rng.uniform(0.92, 1.06))

    # Perimeter ring of wedge-shaped fractured blocks separated by radial crevices
    angles = [2 * math.pi * i / sectors + rng.uniform(-0.09, 0.09) for i in range(sectors)]
    outer_r = [rng.uniform(0.88, 1.12) for _ in range(sectors)]
    mid_r = [rng.uniform(0.92, 1.08) for _ in range(sectors)]
    inner_r = [rng.uniform(0.44, 0.52) for _ in range(sectors)]

    for i in range(sectors):
        j = (i + 1) % sectors
        a0, a1 = angles[i], angles[j]
        if a1 < a0:
            a1 += 2 * math.pi
        a_in0 = a0 + gap / max(0.3, min(rx, ry))
        a_in1 = a1 - gap / max(0.3, min(rx, ry))
        a_mid = 0.5 * (a_in0 + a_in1)
        if a_in1 <= a_in0 + 0.05:
            continue

        r_in0, r_in1 = inner_r[i], inner_r[j]
        r_out0, r_out_m, r_out1 = outer_r[i], mid_r[i] * 0.5 * (outer_r[i] + outer_r[j]), outer_r[j]

        pts_bot = [
            (cx + rx * r_in0 * math.cos(a_in0), cy + ry * r_in0 * math.sin(a_in0)),
            (cx + rx * r_out0 * math.cos(a_in0), cy + ry * r_out0 * math.sin(a_in0)),
            (cx + rx * r_out_m * math.cos(a_mid), cy + ry * r_out_m * math.sin(a_mid)),
            (cx + rx * r_out1 * math.cos(a_in1), cy + ry * r_out1 * math.sin(a_in1)),
            (cx + rx * r_in1 * math.cos(a_in1), cy + ry * r_in1 * math.sin(a_in1)),
        ]
        batter = rng.uniform(0.86, 0.93)
        pts_top = [
            (cx + rx * (r_in0 + 0.02) * math.cos(a_in0), cy + ry * (r_in0 + 0.02) * math.sin(a_in0)),
            (cx + rx * r_out0 * batter * math.cos(a_in0), cy + ry * r_out0 * batter * math.sin(a_in0)),
            (cx + rx * r_out_m * batter * math.cos(a_mid), cy + ry * r_out_m * batter * math.sin(a_mid)),
            (cx + rx * r_out1 * batter * math.cos(a_in1), cy + ry * r_out1 * batter * math.sin(a_in1)),
            (cx + rx * (r_in1 + 0.02) * math.cos(a_in1), cy + ry * (r_in1 + 0.02) * math.sin(a_in1)),
        ]
        dz = rng.uniform(-0.045, 0.055)
        _wedge_block(b, pts_bot, pts_top, z0, z1 + dz, mat=mat, cap_mat=cap_mat,
                     chamfer=0.038, tone=rng.uniform(0.88, 1.06))


def _rock_spire(b, base_pt, tip_pt, rx, ry, seed=1, mat='stone_granite',
                cap_mat='stone_dressed', curve=(0.0, 0.0, 0.0), sides=6, segs=5):
    """Curved, multi-segment faceted rock horn / monolith spire tapering to a sharp point."""
    rng = random.Random(seed)
    p0 = Vector(base_pt)
    p2 = Vector(tip_pt)
    p1 = (p0 + p2) * 0.5 + Vector(curve)
    if not detailed():
        segs = max(2, segs // 2)
        sides = max(4, sides - 1)

    axis = (p2 - p0).normalized()
    up_ref = Vector((1, 0, 0)) if abs(axis.z) > 0.9 else Vector((0, 0, 1))
    u_vec = axis.cross(up_ref).normalized()
    v_vec = axis.cross(u_vec).normalized()

    base_angles = [2 * math.pi * i / sides + rng.uniform(-0.12, 0.12) for i in range(sides)]
    ridge_shape = [1.16 if i % 2 == 0 else 0.84 for i in range(sides)]

    rings = []
    for k in range(segs + 1):
        t = k / segs
        pos = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2
        scale = max(0.03, (1.0 - t) ** 0.82)
        twist = 0.18 * t
        ring = []
        for a, rs in zip(base_angles, ridge_shape):
            jit = 1.0 + (rng.uniform(-0.08, 0.08) if 0 < k < segs else 0.0)
            lx = rx * scale * rs * jit * math.cos(a + twist)
            ly = ry * scale * rs * jit * math.sin(a + twist)
            ring.append(pos + u_vec * lx + v_vec * ly)
        rings.append(ring)

    tone_val = rng.uniform(0.90, 1.05)
    for k in range(segs):
        use_mat = cap_mat if k >= segs - 2 else mat
        _loft_rings(b, rings[k], rings[k + 1], use_mat,
                    cap_bot=(k == 0), cap_top=(k == segs - 1),
                    cap_mat=cap_mat, tone=tone_val * (0.94 + 0.03 * k))


def _talus_skirt(b, cx, cy, z0, rx, ry, count, size_lo, size_hi, seed=1,
                 mat='stone_granite', cap_mat='stone_dressed', arc=(0.0, 2 * math.pi)):
    """Scatter angular fractured talus boulders around a perimeter arc."""
    rng = random.Random(seed)
    if not detailed():
        count = max(3, count // 2)
    for i in range(count):
        t = (i + rng.uniform(0.15, 0.85)) / count
        a = arc[0] + t * (arc[1] - arc[0])
        dist = rng.uniform(0.82, 1.08)
        bx = cx + rx * dist * math.cos(a)
        by = cy + ry * dist * math.sin(a)
        brx = rng.uniform(size_lo, size_hi)
        bry = brx * rng.uniform(0.72, 1.25)
        bh = brx * rng.uniform(0.55, 1.05)
        _crag_block(b, bx, by, z0, z0 + bh, brx, bry, seed=seed * 31 + i, sides=6,
                    mat=mat, cap_mat=cap_mat, batter=0.82, chamfer=0.028,
                    tilt_x=rng.uniform(-0.12, 0.12), tilt_y=rng.uniform(-0.12, 0.12),
                    rot=rng.uniform(0, math.pi))


def _pool_basin_surface(b, cx, cy, z_pool, rx, ry, bubbles, seed=1):
    """Sunken geothermal mineral pool with 3D concentric ripple waves and spherical bubble domes."""
    _crag_block(b, cx, cy, z_pool - 0.14, z_pool, rx, ry, seed=seed, sides=10,
                mat='stone_basalt', cap_mat='stone_dressed', batter=0.98, chamfer=0.01)

    for bx, by, br, n_rings in bubbles:
        m = Matrix.Translation((bx, by, z_pool))
        dome_profile = [
            (0.0, br * 0.82),
            (br * 0.42, br * 0.75),
            (br * 0.78, br * 0.52),
            (br * 0.98, br * 0.20),
            (br * 1.04, -0.01),
        ]
        b.lathe(list(reversed(dome_profile)), 14 if detailed() else 8, 'stone_dressed', m=m, smooth=True)

        if detailed():
            for r_idx in range(n_rings):
                r_inner = br * (1.28 + r_idx * 0.68)
                r_crest = r_inner + br * 0.22
                r_outer = r_inner + br * 0.46
                h_crest = max(0.018, 0.042 - r_idx * 0.008)
                ripple_prof = [
                    (r_outer, -0.005),
                    (r_crest, h_crest),
                    (r_inner, -0.005),
                ]
                b.lathe(ripple_prof, 16, 'stone_dressed', m=m, smooth=True)


def stonehold_ledge_small():
    b = MeshBuilder()
    _fractured_terrace(b, 0.0, 0.0, 0.0, 0.34, 1.32, 1.18, seed=101, sectors=8)
    _fractured_terrace(b, -0.08, 0.06, 0.30, 0.66, 0.98, 0.86, seed=102, sectors=7)
    _fractured_terrace(b, 0.12, -0.05, 0.62, 0.94, 0.62, 0.54, seed=103, sectors=6)
    _crag_block(b, 0.08, -0.04, 0.90, 1.04, 0.34, 0.30, seed=104, sides=7,
                mat='stone_dressed', cap_mat='stone_dressed', chamfer=0.025)
    _talus_skirt(b, 0.0, 0.0, 0.0, 1.26, 1.12, 9, 0.16, 0.28, seed=105)
    return b


def stonehold_ledge_large():
    b = MeshBuilder()
    _fractured_terrace(b, 0.0, 0.0, 0.0, 0.36, 1.75, 1.48, seed=201, sectors=10)
    _fractured_terrace(b, -0.14, 0.08, 0.32, 0.72, 1.38, 1.16, seed=202, sectors=9)
    _fractured_terrace(b, -0.22, 0.12, 0.68, 1.04, 0.92, 0.78, seed=203, sectors=7)
    _fractured_terrace(b, 0.58, -0.22, 0.64, 0.94, 0.66, 0.58, seed=204, sectors=6)
    _crag_block(b, -0.26, 0.14, 1.00, 1.24, 0.54, 0.44, seed=205, sides=7,
                mat='stone_dressed', cap_mat='stone_dressed', chamfer=0.035)
    _crag_block(b, 0.24, 0.05, 0.96, 1.14, 0.36, 0.32, seed=206, sides=6,
                mat='stone_dressed', cap_mat='stone_dressed', chamfer=0.03)
    _talus_skirt(b, 0.0, 0.0, 0.0, 1.68, 1.42, 14, 0.18, 0.34, seed=207)
    _talus_skirt(b, -0.10, 0.05, 0.32, 1.28, 1.06, 7, 0.14, 0.24, seed=208)
    return b


def stonehold_twin_outcrop():
    b = MeshBuilder()
    _fractured_terrace(b, -1.15, 0.0, 0.0, 0.42, 1.22, 1.12, seed=301, sectors=8)
    _fractured_terrace(b, -1.18, 0.06, 0.38, 0.84, 0.92, 0.84, seed=302, sectors=7)
    _fractured_terrace(b, -1.12, 0.04, 0.80, 1.18, 0.62, 0.55, seed=303, sectors=6)
    _crag_block(b, -1.10, 0.04, 1.14, 1.30, 0.34, 0.30, seed=304, sides=7,
                mat='stone_dressed', cap_mat='stone_dressed', chamfer=0.025)

    _fractured_terrace(b, 0.0, -0.08, 0.0, 0.32, 0.78, 0.68, seed=305, sectors=6)
    _crag_block(b, 0.0, -0.06, 0.28, 0.52, 0.52, 0.44, seed=306, sides=6)

    _fractured_terrace(b, 1.18, 0.05, 0.0, 0.38, 1.28, 1.16, seed=307, sectors=8)
    _fractured_terrace(b, 1.22, 0.08, 0.34, 0.76, 0.96, 0.88, seed=308, sectors=7)
    _fractured_terrace(b, 1.16, 0.10, 0.72, 1.08, 0.66, 0.58, seed=309, sectors=6)
    _crag_block(b, 1.20, 0.08, 1.04, 1.22, 0.36, 0.32, seed=310, sides=7,
                mat='stone_dressed', cap_mat='stone_dressed', chamfer=0.025)

    _talus_skirt(b, -1.15, 0.0, 0.0, 1.18, 1.08, 8, 0.15, 0.28, seed=311)
    _talus_skirt(b, 1.18, 0.05, 0.0, 1.22, 1.10, 8, 0.15, 0.28, seed=312)
    return b


def stonehold_vent_crater():
    b = MeshBuilder()
    _fractured_terrace(b, 0.0, 0.0, 0.0, 0.28, 1.36, 1.28, seed=401, sectors=9)
    _pool_basin_surface(b, 0.0, 0.0, 0.28, 0.96, 0.90,
                        bubbles=[(0.0, 0.04, 0.22, 2)], seed=402)
    rng = random.Random(403)
    n_rim = 14 if detailed() else 8
    for i in range(n_rim):
        a = 2 * math.pi * i / n_rim + rng.uniform(-0.08, 0.08)
        r_dist = rng.uniform(0.86, 1.04)
        rx_c = 1.08 * r_dist * math.cos(a)
        ry_c = 1.02 * r_dist * math.sin(a)
        h_top = rng.uniform(0.48, 0.78)
        w_b = rng.uniform(0.24, 0.38)
        _crag_block(b, rx_c, ry_c, 0.18, h_top, w_b, w_b * 0.85,
                    seed=410 + i, sides=6, mat='stone_granite', cap_mat='stone_dressed',
                    batter=0.80, chamfer=0.03,
                    tilt_x=-0.16 * math.cos(a), tilt_y=-0.16 * math.sin(a), rot=a)
    _talus_skirt(b, 0.0, 0.0, 0.0, 1.28, 1.20, 14, 0.14, 0.26, seed=430)
    return b


def stonehold_caldera_basin():
    b = MeshBuilder()
    _fractured_terrace(b, 0.0, 0.0, 0.0, 0.38, 1.85, 1.65, seed=501, sectors=10)
    _fractured_terrace(b, 0.0, 0.05, 0.34, 0.68, 1.52, 1.36, seed=502, sectors=9)

    _pool_basin_surface(
        b, 0.05, 0.02, 0.68, 1.18, 1.04,
        bubbles=[(-0.26, 0.18, 0.21, 2), (0.28, -0.18, 0.23, 2)],
        seed=503,
    )

    _fractured_terrace(b, -0.58, 0.78, 0.64, 1.16, 0.76, 0.58, seed=504, sectors=6)
    _crag_block(b, -0.56, 0.80, 1.12, 1.52, 0.52, 0.42, seed=505, sides=6,
                mat='stone_dressed', cap_mat='stone_dressed', chamfer=0.04)

    rng = random.Random(506)
    for i in range(12 if detailed() else 6):
        a = -math.pi * 0.85 + (math.pi * 1.75) * i / 11.0
        bx = 1.26 * math.cos(a)
        by = 1.12 * math.sin(a)
        bh = rng.uniform(0.88, 1.28)
        bw = rng.uniform(0.28, 0.44)
        _crag_block(b, bx, by, 0.32, bh, bw, bw * 0.84, seed=520 + i, sides=6,
                    mat='stone_granite', cap_mat='stone_dressed', batter=0.82, chamfer=0.035,
                    rot=a)

    _crag_block(b, -0.35, -1.32, 0.0, 0.24, 0.58, 0.38, seed=540, sides=6)
    _crag_block(b, 0.32, -1.26, 0.18, 0.46, 0.52, 0.36, seed=541, sides=6)
    _talus_skirt(b, 0.0, 0.0, 0.0, 1.78, 1.58, 14, 0.18, 0.34, seed=550)
    return b


def stonehold_fang_shrine():
    b = MeshBuilder()
    _fractured_terrace(b, 0.0, 0.0, 0.0, 0.28, 1.48, 1.38, seed=601, sectors=8)
    _fractured_terrace(b, 0.12, -0.10, 0.24, 0.46, 1.06, 0.98, seed=602, sectors=7)

    for k, (r_step, z_lo, z_hi) in enumerate(((0.58, 0.42, 0.58),
                                              (0.44, 0.56, 0.72),
                                              (0.32, 0.70, 0.86))):
        _crag_block(b, 0.18, -0.18, z_lo, z_hi, r_step, r_step, seed=610 + k, sides=8,
                    mat='stone_dressed', cap_mat='stone_dressed', batter=0.94, chamfer=0.025)

    if detailed():
        rng = random.Random(620)
        for i in range(9):
            a = 2 * math.pi * i / 9.0 + rng.uniform(-0.15, 0.15)
            dist = rng.uniform(0.56, 0.74)
            sx = 0.18 + dist * math.cos(a)
            sy = -0.18 + dist * math.sin(a)
            b.blob((sx, sy, 0.48), rng.uniform(0.085, 0.115), 'stone_dressed',
                   subdiv=1, squash=(0.88, 1.08, 0.95), jitter=0.14, seed=630 + i)

    _rock_spire(b, (-0.38, 0.42, 0.20), (-0.12, 0.62, 3.05), 0.56, 0.42,
                seed=640, mat='stone_granite', cap_mat='stone_dressed',
                curve=(-0.18, 0.08, 0.20), sides=6, segs=6)
    _rock_spire(b, (-0.82, 0.28, 0.20), (-0.96, 0.40, 1.72), 0.30, 0.24,
                seed=641, mat='stone_granite', cap_mat='stone_dressed',
                curve=(-0.08, 0.04, 0.10), sides=5, segs=4)
    _rock_spire(b, (0.08, 0.66, 0.20), (0.24, 0.78, 1.55), 0.28, 0.22,
                seed=642, mat='stone_granite', cap_mat='stone_dressed',
                curve=(0.06, 0.05, 0.08), sides=5, segs=4)

    _talus_skirt(b, 0.0, 0.0, 0.0, 1.42, 1.32, 10, 0.15, 0.28, seed=650)
    return b


def stonehold_cavern_maw():
    b = MeshBuilder()
    _fractured_terrace(b, 0.0, -0.55, 0.0, 0.24, 1.95, 1.65, seed=701, sectors=10)
    _fractured_terrace(b, 0.0, -0.35, 0.20, 0.42, 1.45, 1.18, seed=702, sectors=8)
    _crag_block(b, -0.32, -0.68, 0.38, 0.54, 0.46, 0.36, seed=703, sides=6,
                mat='stone_dressed', cap_mat='stone_dressed')
    _crag_block(b, 0.36, -0.58, 0.38, 0.52, 0.42, 0.34, seed=704, sides=6,
                mat='stone_dressed', cap_mat='stone_dressed')

    _crag_block(b, 0.0, 0.85, 0.0, 3.65, 1.55, 1.05, seed=710, sides=8,
                mat='stone_granite', cap_mat='stone_dressed', batter=0.76, chamfer=0.06)
    b.box((-0.52, -0.02, 0.38), (0.52, 0.75, 2.05), 'stone_basalt', skip=('-y', '-z'))
    b.extrude([(-0.42, 0.22, 0.38), (0.42, 0.22, 0.38), (0.0, 0.22, 1.88)],
              (0, 0.18, 0), 'glow')
    b.extrude([(-0.56, 0.06, 0.38), (-0.36, 0.06, 0.38), (-0.06, 0.06, 1.96), (-0.22, 0.06, 2.08)],
              (0, 0.16, 0), 'firelight')
    b.extrude([(0.36, 0.06, 0.38), (0.56, 0.06, 0.38), (0.22, 0.06, 2.08), (0.06, 0.06, 1.96)],
              (0, 0.16, 0), 'firelight')
    b.box((-0.44, -0.18, 0.36), (0.44, 0.35, 0.45), 'firelight')

    _rock_spire(b, (-0.75, 0.72, 2.10), (-0.95, 0.55, 4.55), 0.62, 0.52,
                seed=720, mat='stone_granite', cap_mat='stone_dressed',
                curve=(-0.18, -0.10, 0.25), sides=6, segs=5)
    _rock_spire(b, (0.75, 0.72, 2.10), (0.95, 0.55, 4.40), 0.62, 0.52,
                seed=721, mat='stone_granite', cap_mat='stone_dressed',
                curve=(0.18, -0.10, 0.25), sides=6, segs=5)
    _crag_block(b, 0.0, 0.78, 2.40, 4.05, 0.78, 0.62, seed=722, sides=7,
                mat='stone_dressed', cap_mat='stone_dressed', batter=0.72, chamfer=0.05)

    for side in (-1, 1):
        for k, (x_bot, y_bot, x_top, z_top, r_w) in enumerate((
            (0.58, -0.12, 0.14, 2.35, 0.22),
            (0.82, -0.04, 0.38, 2.85, 0.25),
            (1.08, 0.12, 0.68, 3.35, 0.28),
            (1.30, 0.32, 0.96, 3.60, 0.26),
        )):
            _rock_spire(
                b,
                (side * x_bot, y_bot, 0.32),
                (side * x_top, 0.28 + 0.08 * k, z_top),
                r_w, r_w * 0.82,
                seed=730 + (0 if side < 0 else 10) + k,
                mat='stone_dressed' if k % 2 == 0 else 'stone_granite',
                cap_mat='stone_dressed',
                curve=(side * 0.12, -0.16, 0.15),
                sides=5, segs=4,
            )

    _talus_skirt(b, 0.0, 0.2, 0.0, 1.85, 1.55, 14, 0.16, 0.32, seed=750)
    return b


def stonehold_horned_sanctum():
    b = MeshBuilder()
    _fractured_terrace(b, 0.0, 0.0, 0.0, 0.52, 2.45, 2.15, seed=801, sectors=10)
    _fractured_terrace(b, 0.15, 0.18, 0.48, 1.18, 2.05, 1.78, seed=802, sectors=9)
    _fractured_terrace(b, 0.20, 0.28, 1.12, 1.88, 1.68, 1.45, seed=803, sectors=8)

    _fractured_terrace(b, -1.65, 0.35, 1.05, 1.62, 1.15, 1.02, seed=804, sectors=7)
    _fractured_terrace(b, -1.72, 0.40, 1.58, 2.02, 0.88, 0.78, seed=805, sectors=6)
    _crag_block(b, -1.45, 0.32, 0.0, 1.12, 0.78, 0.72, seed=806, sides=6,
                mat='stone_granite', cap_mat='stone_dressed', batter=0.92)

    for bx, by, z0, z1, rx, ry, s in (
        (-1.18, -1.05, 0.35, 2.15, 0.48, 0.44, 810),
        (1.05, -0.78, 0.40, 2.35, 0.62, 0.54, 811),
        (1.42, 0.05, 0.40, 2.55, 0.68, 0.58, 812),
        (1.18, 0.88, 0.50, 2.85, 0.64, 0.56, 813),
        (-0.88, 1.08, 0.50, 2.75, 0.62, 0.54, 814),
    ):
        _crag_block(b, bx, by, z0, z1, rx, ry, seed=s, sides=6,
                    mat='stone_granite', cap_mat='stone_dressed', batter=0.86, chamfer=0.045)

    stair_path = [
        (0.28, -1.85, 0.18),
        (0.12, -1.62, 0.36),
        (-0.06, -1.40, 0.54),
        (-0.24, -1.18, 0.72),
        (-0.42, -0.96, 0.90),
        (-0.56, -0.74, 1.08),
        (-0.64, -0.52, 1.26),
        (-0.66, -0.28, 1.44),
        (-0.60, -0.05, 1.62),
        (-0.48, 0.16, 1.80),
        (-0.34, 0.34, 1.98),
        (-0.18, 0.48, 2.16),
    ]
    for idx, (sx, sy, sz) in enumerate(stair_path):
        yaw = math.atan2(
            stair_path[min(idx + 1, len(stair_path) - 1)][1] - stair_path[max(0, idx - 1)][1],
            stair_path[min(idx + 1, len(stair_path) - 1)][0] - stair_path[max(0, idx - 1)][0],
        )
        _crag_block(b, sx, sy, max(0.0, sz - 0.24), sz, 0.42, 0.24,
                    seed=820 + idx, sides=6, mat='stone_dressed', cap_mat='stone_dressed',
                    batter=0.95, chamfer=0.02, rot=yaw)

    _fractured_terrace(b, 0.12, 0.22, 1.82, 2.28, 1.18, 1.02, seed=840, sectors=7)
    _crag_block(b, 0.08, 0.12, 2.22, 3.28, 0.68, 0.54, seed=841, sides=7,
                mat='stone_dressed', cap_mat='stone_dressed', batter=0.88, chamfer=0.05)
    _rock_spire(b, (-0.48, 0.06, 2.25), (-0.82, -0.18, 3.92), 0.34, 0.28,
                seed=842, mat='stone_dressed', cap_mat='stone_dressed',
                curve=(-0.18, -0.08, 0.15), sides=5, segs=5)
    _rock_spire(b, (0.64, 0.06, 2.25), (0.98, -0.18, 3.92), 0.34, 0.28,
                seed=843, mat='stone_dressed', cap_mat='stone_dressed',
                curve=(0.18, -0.08, 0.15), sides=5, segs=5)

    _crag_block(b, 0.24, 0.92, 2.18, 3.75, 0.82, 0.64, seed=845, sides=6,
                mat='stone_granite', cap_mat='stone_dressed', batter=0.90, chamfer=0.05)
    _crag_block(b, 0.22, 0.94, 3.70, 4.25, 0.56, 0.44, seed=846, sides=6,
                mat='stone_dressed', cap_mat='stone_dressed', batter=0.92, chamfer=0.04)

    _talus_skirt(b, 0.0, 0.0, 0.0, 2.38, 2.08, 18, 0.20, 0.42, seed=860)
    _talus_skirt(b, 0.1, 0.1, 0.48, 1.92, 1.65, 12, 0.18, 0.34, seed=861)
    return b


STONEHOLD_MODULES = (
    ('Stonehold_Ledge_Small', stonehold_ledge_small),
    ('Stonehold_Ledge_Large', stonehold_ledge_large),
    ('Stonehold_Twin_Outcrop', stonehold_twin_outcrop),
    ('Stonehold_Vent_Crater', stonehold_vent_crater),
    ('Stonehold_Caldera_Basin', stonehold_caldera_basin),
    ('Stonehold_Fang_Shrine', stonehold_fang_shrine),
    ('Stonehold_Cavern_Maw', stonehold_cavern_maw),
    ('Stonehold_Horned_Sanctum', stonehold_horned_sanctum),
)


def define(kit):
    for name, fn in STONEHOLD_MODULES:
        kit.define(name, 'nature', fn())
