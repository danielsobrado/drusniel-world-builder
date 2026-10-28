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


def _crag_block(b, cx, cy, z0, z1, rx, ry, seed=1, sides=7, mat='rock',
                cap_mat='stone_dressed', batter=0.88, chamfer=0.045,
                tilt_x=0.0, tilt_y=0.0, rot=0.0, tone=None):
    """Faceted polygonal rock slab with battered cliff sides and a crisp chamfered upper table."""
    rng = random.Random(seed)
    if not detailed():
        sides = max(5, sides - 2)
    angles = [2 * math.pi * i / sides + rng.uniform(-0.18, 0.18) / sides for i in range(sides)]
    rm_bot = [rng.uniform(0.84, 1.14) for _ in range(sides)]
    rm_mid = [r * batter * rng.uniform(0.95, 1.04) for r in rm_bot]
    tone_val = rng.uniform(0.84, 1.04) if tone is None else tone

    bot = _ring_pts(cx, cy, z0, rx, ry, angles, rm_bot, rot=rot)
    if detailed() and (z1 - z0) > chamfer * 2.2:
        z_ch = z1 - chamfer
        mid = _ring_pts(cx, cy, z_ch, rx, ry, angles, rm_mid, tilt_x=tilt_x, tilt_y=tilt_y, rot=rot)
        ch_scale = max(0.55, 1.0 - chamfer / max(0.15, min(rx, ry)))
        rm_top = [r * ch_scale for r in rm_mid]
        top = _ring_pts(cx, cy, z1, rx, ry, angles, rm_top, tilt_x=tilt_x, tilt_y=tilt_y, rot=rot)
        _loft_rings(b, bot, mid, mat, cap_bot=False, cap_top=False, tone=tone_val)
        _loft_rings(b, mid, top, cap_mat or mat, cap_bot=False, cap_top=True,
                    cap_mat=cap_mat or mat, tone=tone_val * 1.03)
    else:
        top = _ring_pts(cx, cy, z1, rx, ry, angles, rm_mid, tilt_x=tilt_x, tilt_y=tilt_y, rot=rot)
        _loft_rings(b, bot, top, mat, cap_bot=False, cap_top=True, cap_mat=cap_mat or mat, tone=tone_val)


def _wedge_block(b, pts_bot, pts_top, z0, z1, mat='rock', cap_mat='stone_dressed',
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
                    cap_mat=cap_mat or mat, tone=tone * 1.03)
    else:
        top = [Vector((x, y, z1)) for x, y in pts_top]
        _loft_rings(b, bot, top, mat, cap_bot=False, cap_top=True, cap_mat=cap_mat or mat, tone=tone)


def _fractured_terrace(b, cx, cy, z0, z1, rx, ry, seed=1, sectors=8,
                       mat='rock', cap_mat='stone_dressed', gap=0.045):
    """A flat-topped rock stratum split by deep radial and ring fissures into fitted polygonal slabs."""
    rng = random.Random(seed)
    # Dark basalt inner core so deep fissure cracks show dark stone rather than void
    _crag_block(b, cx, cy, z0, max(z0 + 0.05, z1 - 0.09), rx * 0.84, ry * 0.84,
                seed=seed + 99, sides=sectors, mat='stone_basalt', cap_mat='stone_basalt',
                batter=0.92, chamfer=0.0, tone=0.68)

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
                    rot=ang0, tone=rng.uniform(0.90, 1.05))

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
                     chamfer=0.038, tone=rng.uniform(0.86, 1.05))


def _rock_spire(b, base_pt, tip_pt, rx, ry, seed=1, mat='rock',
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

    tone_val = rng.uniform(0.88, 1.04)
    for k in range(segs):
        use_mat = cap_mat if k >= segs - 1 else mat
        _loft_rings(b, rings[k], rings[k + 1], use_mat,
                    cap_bot=(k == 0), cap_top=(k == segs - 1),
                    cap_mat=cap_mat, tone=tone_val * (0.92 + 0.03 * k))


def _talus_skirt(b, cx, cy, z0, rx, ry, count, size_lo, size_hi, seed=1,
                 mat='rock', cap_mat='stone_dressed', arc=(0.0, 2 * math.pi)):
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
                    seed=410 + i, sides=6, mat='rock', cap_mat='stone_dressed',
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
                mat='rock', cap_mat='stone_dressed', chamfer=0.04)

    rng = random.Random(506)
    for i in range(12 if detailed() else 6):
        a = -math.pi * 0.85 + (math.pi * 1.75) * i / 11.0
        bx = 1.26 * math.cos(a)
        by = 1.12 * math.sin(a)
        bh = rng.uniform(0.88, 1.28)
        bw = rng.uniform(0.28, 0.44)
        _crag_block(b, bx, by, 0.32, bh, bw, bw * 0.84, seed=520 + i, sides=6,
                    mat='rock', cap_mat='stone_dressed', batter=0.82, chamfer=0.035,
                    rot=a)

    _crag_block(b, -0.35, -1.32, 0.0, 0.24, 0.58, 0.38, seed=540, sides=6)
    _crag_block(b, 0.32, -1.26, 0.18, 0.46, 0.52, 0.36, seed=541, sides=6)
    _talus_skirt(b, 0.0, 0.0, 0.0, 1.78, 1.58, 14, 0.18, 0.34, seed=550)
    return b


def stonehold_fang_shrine():
    b = MeshBuilder()
    _fractured_terrace(b, 0.0, 0.0, 0.0, 0.28, 1.48, 1.38, seed=601, sectors=8)
    _fractured_terrace(b, 0.12, -0.10, 0.24, 0.46, 1.06, 0.98, seed=602, sectors=7)

    # Vondari Dwarven carved octagonal ward dais with basalt & bronze trim
    for k, (r_step, z_lo, z_hi) in enumerate(((0.58, 0.42, 0.58),
                                              (0.44, 0.56, 0.72),
                                              (0.32, 0.70, 0.86))):
        _crag_block(b, 0.18, -0.18, z_lo, z_hi, r_step, r_step, seed=610 + k, sides=8,
                    mat='stone_basalt' if k == 1 else 'stone_granite',
                    cap_mat='stone_dressed', batter=0.96, chamfer=0.025)
    if detailed():
        b.box((0.02, -0.34, 0.85), (0.34, -0.02, 0.88), 'bronze')
        rng = random.Random(620)
        for i in range(9):
            a = 2 * math.pi * i / 9.0 + rng.uniform(-0.15, 0.15)
            dist = rng.uniform(0.56, 0.74)
            sx = 0.18 + dist * math.cos(a)
            sy = -0.18 + dist * math.sin(a)
            b.blob((sx, sy, 0.48), rng.uniform(0.085, 0.115), 'stone_dressed',
                   subdiv=1, squash=(0.88, 1.08, 0.95), jitter=0.14, seed=630 + i)

    _rock_spire(b, (-0.38, 0.42, 0.20), (-0.12, 0.62, 3.05), 0.56, 0.42,
                seed=640, mat='rock', cap_mat='stone_dressed',
                curve=(-0.18, 0.08, 0.20), sides=6, segs=6)
    _rock_spire(b, (-0.82, 0.28, 0.20), (-0.96, 0.40, 1.72), 0.30, 0.24,
                seed=641, mat='rock', cap_mat='stone_dressed',
                curve=(-0.08, 0.04, 0.10), sides=5, segs=4)
    _rock_spire(b, (0.08, 0.66, 0.20), (0.24, 0.78, 1.55), 0.28, 0.22,
                seed=642, mat='rock', cap_mat='stone_dressed',
                curve=(0.06, 0.05, 0.08), sides=5, segs=4)

    _talus_skirt(b, 0.0, 0.0, 0.0, 1.42, 1.32, 10, 0.15, 0.28, seed=650)
    return b


def stonehold_cavern_maw():
    """Twin-horned crag massif with an unobstructed glowing triangular cavern cleft & Dwarven basalt portal."""
    b = MeshBuilder()
    # Stepped flagstone forecourt approach
    _fractured_terrace(b, 0.0, -0.58, 0.0, 0.24, 1.95, 1.65, seed=701, sectors=10)
    _fractured_terrace(b, 0.0, -0.38, 0.20, 0.42, 1.48, 1.18, seed=702, sectors=8)
    _crag_block(b, -0.34, -0.78, 0.38, 0.54, 0.46, 0.34, seed=703, sides=6,
                mat='stone_granite', cap_mat='stone_dressed')
    _crag_block(b, 0.36, -0.68, 0.38, 0.52, 0.42, 0.32, seed=704, sides=6,
                mat='stone_granite', cap_mat='stone_dressed')

    # Flanking left & right cliff cheeks leaving the central portal cleft (x = -0.52..0.52) wide open!
    for side, s_idx in ((-1, 710), (1, 711)):
        _crag_block(b, side * 0.96, 0.62, 0.32, 1.45, 0.66, 0.78, seed=s_idx, sides=7,
                    mat='rock', cap_mat='stone_dressed', batter=0.88, chamfer=0.04)
        _crag_block(b, side * 0.88, 0.68, 1.38, 2.55, 0.58, 0.68, seed=s_idx + 2, sides=7,
                    mat='rock', cap_mat='stone_dressed', batter=0.84, chamfer=0.04)

    # Rear cliff massif behind the cavern throat (y >= 0.62) and upper bridge crown above z = 2.15
    _crag_block(b, 0.0, 1.18, 0.32, 3.65, 1.48, 0.68, seed=714, sides=8,
                mat='rock', cap_mat='stone_dressed', batter=0.78, chamfer=0.05)
    _crag_block(b, 0.0, 0.72, 2.12, 3.35, 1.18, 0.66, seed=715, sides=7,
                mat='rock', cap_mat='stone_dressed', batter=0.82, chamfer=0.05)
    _crag_block(b, 0.0, 0.78, 3.25, 4.02, 0.78, 0.58, seed=722, sides=7,
                mat='rock', cap_mat='stone_dressed', batter=0.78, chamfer=0.05)

    # Vondari Dwarven basalt jambs, threshold & corbelled lintel framing the triangular cavern maw
    for side in (-1, 1):
        b.box((side * 0.50 - 0.10, -0.02, 0.40), (side * 0.50 + 0.10, 0.42, 1.65), 'stone_basalt')
    b.box((-0.66, -0.06, 1.98), (0.66, 0.44, 2.20), 'stone_basalt')
    b.box((-0.52, -0.22, 0.38), (0.52, 0.48, 0.45), 'stone_basalt')
    if detailed():
        b.box((-0.44, -0.08, 2.04), (0.44, -0.04, 2.14), 'bronze')

    # Glowing triangular cavern portal & warm forge/magma throat inside the cleft (unobstructed!)
    b.box((-0.54, 0.32, 0.42), (0.54, 0.62, 2.12), 'stone_basalt', skip=('-y', '-z'))
    b.extrude([(-0.44, 0.24, 0.44), (0.44, 0.24, 0.44), (0.0, 0.24, 1.96)],
              (0, 0.10, 0), 'glow')
    b.extrude([(-0.56, 0.12, 0.44), (-0.38, 0.12, 0.44), (-0.04, 0.12, 2.02), (-0.22, 0.12, 2.10)],
              (0, 0.14, 0), 'firelight')
    b.extrude([(0.38, 0.12, 0.44), (0.56, 0.12, 0.44), (0.22, 0.12, 2.10), (0.04, 0.12, 2.02)],
              (0, 0.14, 0), 'firelight')
    b.box((-0.40, -0.14, 0.43), (0.40, 0.26, 0.48), 'glow')

    # Twin sweeping summit horns
    _rock_spire(b, (-0.75, 0.72, 2.25), (-0.95, 0.55, 4.48), 0.58, 0.48,
                seed=720, mat='rock', cap_mat='stone_dressed',
                curve=(-0.18, -0.10, 0.25), sides=6, segs=5)
    _rock_spire(b, (0.75, 0.72, 2.25), (0.95, 0.55, 4.36), 0.58, 0.48,
                seed=721, mat='rock', cap_mat='stone_dressed',
                curve=(0.18, -0.10, 0.25), sides=6, segs=5)

    # Framing fang ribs along both sides of the portal cleft (outside x = +-0.56 so they frame the glow)
    for side in (-1, 1):
        for k, (x_bot, y_bot, x_top, z_top, r_w) in enumerate((
            (0.64, -0.10, 0.34, 2.30, 0.20),
            (0.88, -0.02, 0.54, 2.82, 0.23),
            (1.12, 0.14, 0.78, 3.30, 0.26),
            (1.34, 0.32, 1.02, 3.58, 0.24),
        )):
            _rock_spire(
                b,
                (side * x_bot, y_bot, 0.36),
                (side * x_top, 0.26 + 0.08 * k, z_top),
                r_w, r_w * 0.82,
                seed=730 + (0 if side < 0 else 10) + k,
                mat='stone_dressed' if k % 2 == 0 else 'rock',
                cap_mat='stone_dressed',
                curve=(side * 0.10, -0.14, 0.15),
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
                mat='rock', cap_mat='stone_dressed', batter=0.92)

    for bx, by, z0, z1, rx, ry, s in (
        (-1.18, -1.05, 0.35, 2.15, 0.48, 0.44, 810),
        (1.05, -0.78, 0.40, 2.35, 0.62, 0.54, 811),
        (1.42, 0.05, 0.40, 2.55, 0.68, 0.58, 812),
        (1.18, 0.88, 0.50, 2.85, 0.64, 0.56, 813),
        (-0.88, 1.08, 0.50, 2.75, 0.62, 0.54, 814),
    ):
        _crag_block(b, bx, by, z0, z1, rx, ry, seed=s, sides=6,
                    mat='rock', cap_mat='stone_dressed', batter=0.86, chamfer=0.045)

    # Winding Vondari Dwarven rock-cut granite & basalt staircase
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
                    seed=820 + idx, sides=6, mat='stone_basalt', cap_mat='stone_dressed',
                    batter=0.95, chamfer=0.02, rot=yaw)

    _fractured_terrace(b, 0.12, 0.22, 1.82, 2.28, 1.18, 1.02, seed=840, sectors=7)
    _crag_block(b, 0.08, 0.12, 2.22, 3.28, 0.68, 0.54, seed=841, sides=7,
                mat='stone_dressed', cap_mat='stone_dressed', batter=0.88, chamfer=0.05)
    _rock_spire(b, (-0.48, 0.06, 2.25), (-0.82, -0.18, 3.92), 0.34, 0.28,
                seed=842, mat='rock', cap_mat='stone_dressed',
                curve=(-0.18, -0.08, 0.15), sides=5, segs=5)
    _rock_spire(b, (0.64, 0.06, 2.25), (0.98, -0.18, 3.92), 0.34, 0.28,
                seed=843, mat='rock', cap_mat='stone_dressed',
                curve=(0.18, -0.08, 0.15), sides=5, segs=5)

    _crag_block(b, 0.24, 0.92, 2.18, 3.75, 0.82, 0.64, seed=845, sides=6,
                mat='rock', cap_mat='stone_dressed', batter=0.90, chamfer=0.05)
    _crag_block(b, 0.22, 0.94, 3.70, 4.25, 0.56, 0.44, seed=846, sides=6,
                mat='stone_basalt', cap_mat='stone_dressed', batter=0.92, chamfer=0.04)

    _talus_skirt(b, 0.0, 0.0, 0.0, 2.38, 2.08, 18, 0.20, 0.42, seed=860)
    _talus_skirt(b, 0.1, 0.1, 0.48, 1.92, 1.65, 12, 0.18, 0.34, seed=861)
    return b


def _build_vent_stack_at(b, cx, cy, z0, scale=1.0, seed=900):
    """Helper to embed a Vondari Dwarven mine ventilation stack on ground or mountain peaks."""
    s = scale
    _crag_block(b, cx, cy, z0 - 0.15 * s, z0 + 0.85 * s, 0.92 * s, 0.92 * s,
                seed=seed, sides=8, mat='stone_granite', cap_mat='stone_basalt',
                batter=0.92, chamfer=0.03 * s)
    b.box((cx - 0.64 * s, cy - 0.64 * s, z0 + 0.80 * s),
          (cx + 0.64 * s, cy + 0.64 * s, z0 + 2.85 * s), 'stone_granite', skip=('-z',))
    for bz in (1.35 * s, 2.05 * s, 2.82 * s):
        b.box((cx - 0.72 * s, cy - 0.72 * s, z0 + bz),
              (cx + 0.72 * s, cy + 0.72 * s, z0 + bz + 0.16 * s), 'stone_basalt')
    # Glowing forge-draft louver vents on all 4 sides
    b.box((cx - 0.48 * s, cy - 0.66 * s, z0 + 2.22 * s),
          (cx + 0.48 * s, cy + 0.66 * s, z0 + 2.76 * s), 'firelight')
    b.box((cx - 0.66 * s, cy - 0.48 * s, z0 + 2.22 * s),
          (cx + 0.66 * s, cy + 0.48 * s, z0 + 2.76 * s), 'firelight')
    if detailed():
        for lz in (2.32 * s, 2.50 * s, 2.68 * s):
            b.box((cx - 0.54 * s, cy - 0.70 * s, z0 + lz),
                  (cx + 0.54 * s, cy + 0.70 * s, z0 + lz + 0.05 * s), 'iron', bevel=0)
            b.box((cx - 0.70 * s, cy - 0.54 * s, z0 + lz),
                  (cx + 0.70 * s, cy + 0.54 * s, z0 + lz + 0.05 * s), 'iron', bevel=0)
        # Bronze rune plaque & iron ladder on -Y face
        b.box((cx - 0.28 * s, cy - 0.68 * s, z0 + 1.58 * s),
              (cx + 0.28 * s, cy - 0.62 * s, z0 + 1.92 * s), 'bronze')
        for lx in (-0.18 * s, 0.18 * s):
            b.box((cx + lx - 0.025 * s, cy - 0.74 * s, z0 + 0.85 * s),
                  (cx + lx + 0.025 * s, cy - 0.64 * s, z0 + 2.80 * s), 'iron', bevel=0)
        for rz in (1.05 * s, 1.30 * s, 1.55 * s, 1.80 * s, 2.05 * s):
            b.box((cx - 0.18 * s, cy - 0.75 * s, z0 + rz),
                  (cx + 0.18 * s, cy - 0.70 * s, z0 + rz + 0.035 * s), 'iron', bevel=0)
    # Twin basalt exhaust flues at top
    for fx in (-0.28 * s, 0.28 * s):
        b.box((cx + fx - 0.20 * s, cy - 0.22 * s, z0 + 2.98 * s),
              (cx + fx + 0.20 * s, cy + 0.22 * s, z0 + 3.48 * s), 'stone_basalt')
        b.box((cx + fx - 0.13 * s, cy - 0.15 * s, z0 + 3.42 * s),
              (cx + fx + 0.13 * s, cy + 0.15 * s, z0 + 3.52 * s), 'glow')


def mine_vent_stack():
    """Tall rugged Vondari Dwarven stone & basalt mine exhaust shaft with louver shutters,
    glowing forge-draft interior, iron bracing, and maintenance ladder."""
    b = MeshBuilder()
    _fractured_terrace(b, 0.0, 0.0, 0.0, 0.26, 1.32, 1.26, seed=901, sectors=8)
    _build_vent_stack_at(b, 0.0, 0.0, 0.22, scale=1.0, seed=902)
    _talus_skirt(b, 0.0, 0.0, 0.0, 1.24, 1.18, 8, 0.14, 0.24, seed=905)
    return b


def mountain_cliff_wall():
    """8m-wide x 17.5m-tall stratified mountain cliff wall with carved Vondari Dwarven
    basalt buttresses and glowing rock-cut forge embrasures on BOTH exterior (-Y) and
    interior cavern (+Y) faces, topped by a continuous solid mountain crag wall and peaks."""
    b = MeshBuilder()
    # Lower & middle rock-cut cliff massif centered on Y = 0 (spans X -4.25..4.25, Y -1.35..1.35, Z -0.4..11.2)
    for idx, (cx, cy, z0, z1, rx, ry) in enumerate((
        (-2.8, 0.0, -0.4, 5.8, 1.85, 1.32),
        (0.0, 0.0, -0.4, 6.0, 1.95, 1.36),
        (2.8, 0.0, -0.4, 5.8, 1.85, 1.32),
        (-2.7, 0.0, 5.4, 11.2, 1.82, 1.30),
        (0.0, 0.0, 5.6, 11.5, 1.92, 1.34),
        (2.7, 0.0, 5.4, 11.2, 1.82, 1.30),
    )):
        _crag_block(b, cx, cy, z0, z1, rx, ry, seed=910 + idx, sides=8,
                    mat='rock', cap_mat='stone_dressed', batter=0.94, chamfer=0.05)

    # Carved Vondari Dwarven basalt buttress piers & cornice bands on BOTH exterior (-Y) and interior (+Y) faces
    for px in (-3.6, -1.2, 1.2, 3.6):
        b.box((px - 0.36, -1.42, -0.2), (px + 0.36, 1.42, 9.6), 'stone_basalt', skip=('-z',))
        b.box((px - 0.46, -1.52, -0.2), (px + 0.46, 1.52, 1.5), 'stone_basalt', skip=('-z',))
    for cz in (4.6, 9.0):
        b.box((-4.15, -1.48, cz), (4.15, 1.48, cz + 0.44), 'stone_basalt')

    # Rock-cut subterranean hall embrasures with shouldered lintels & glowing forge light on BOTH -Y and +Y faces
    for wx in (-2.4, 0.0, 2.4):
        for wz in (1.8, 5.8):
            b.box((wx - 0.48, -1.40, wz), (wx + 0.48, 1.40, wz + 1.85), 'stone_granite')
            b.box((wx - 0.58, -1.50, wz + 1.75), (wx + 0.58, 1.50, wz + 2.12), 'stone_basalt')
            for side in (-1, 1):
                y0, y1 = (side * 1.44, side * 1.30) if side < 0 else (side * 1.30, side * 1.44)
                b.box((wx - 0.32, y0, wz + 0.18), (wx + 0.32, y1, wz + 1.68), 'firelight')
                if detailed():
                    yi0, yi1 = (side * 1.47, side * 1.40) if side < 0 else (side * 1.40, side * 1.47)
                    b.box((wx - 0.03, yi0, wz + 0.18), (wx + 0.03, yi1, wz + 1.68), 'iron', bevel=0)
                    b.box((wx - 0.32, yi0, wz + 0.92), (wx + 0.32, yi1, wz + 0.98), 'iron', bevel=0)

    # Continuous upper mountain crag crown & spires (Z = 10.6..17.6m) covering full X width
    for idx, (cx, cy, z0, z1, rx, ry) in enumerate((
        (-2.7, 0.1, 10.6, 15.2, 1.82, 1.42),
        (0.0, 0.15, 10.8, 15.8, 1.95, 1.48),
        (2.7, 0.1, 10.6, 15.0, 1.82, 1.42),
    )):
        _crag_block(b, cx, cy, z0, z1, rx, ry, seed=920 + idx, sides=7,
                    mat='rock', cap_mat='stone_dressed', batter=0.84, chamfer=0.07)
    _rock_spire(b, (-2.0, 0.2, 13.8), (-2.3, 0.0, 17.4), 1.05, 0.90,
                seed=925, mat='rock', cap_mat='stone_dressed', curve=(-0.15, -0.05, 0.2), sides=6, segs=4)
    _rock_spire(b, (1.8, 0.2, 13.6), (2.1, 0.0, 17.8), 1.08, 0.92,
                seed=926, mat='rock', cap_mat='stone_dressed', curve=(0.15, -0.05, 0.2), sides=6, segs=4)
    return b


def mountain_gate_massif():
    """14m-wide x 20.0m-tall monumental Vondari Dwarven Fortress Mountain Gate carved directly
    into a towering mountain massif. Features a clear 4.6m-wide x 6.2m-high central vaulted
    tunnel (`X = -2.3..2.3m`) dressed on both exterior (-Y) and interior (+Y) faces."""
    b = MeshBuilder()
    # Flanking rock-cut cliff bastions on left (X = -7.1..-2.3) and right (X = 2.3..7.1)
    for side, s_base in ((-1, 930), (1, 940)):
        _crag_block(b, side * 4.7, 0.4, -0.4, 7.2, 2.45, 1.85, seed=s_base, sides=8,
                    mat='rock', cap_mat='stone_dressed', batter=0.92, chamfer=0.06)
        _crag_block(b, side * 4.6, 0.5, 6.8, 13.4, 2.35, 1.75, seed=s_base + 1, sides=7,
                    mat='rock', cap_mat='stone_dressed', batter=0.86, chamfer=0.06)
        # Carved granite & basalt bastion face flanking the portal on both -Y and +Y
        b.box((side * 3.55 - 1.15, -1.35, -0.2), (side * 3.55 + 1.15, 2.15, 6.8),
              'stone_granite', skip=('-z',))
        b.box((side * 2.55 - 0.35, -1.55, -0.2), (side * 2.55 + 0.35, 2.35, 7.2),
              'stone_basalt', skip=('-z',))
        b.box((side * 4.55 - 0.35, -1.45, -0.2), (side * 4.55 + 0.35, 2.25, 7.0),
              'stone_basalt', skip=('-z',))
        for bz in (0.9, 3.4, 6.4):
            b.box((side * 3.55 - 1.35, -1.50, bz), (side * 3.55 + 1.35, 2.30, bz + 0.36), 'stone_basalt')
        # Glowing bastion guard embrasure & bronze ward plate on both -Y and +Y
        b.box((side * 3.55 - 0.36, -1.42, 3.95), (side * 3.55 + 0.36, 2.22, 5.65), 'firelight')
        b.box((side * 3.55 - 0.48, -1.52, 5.60), (side * 3.55 + 0.48, 2.32, 5.92), 'stone_basalt')
        if detailed():
            for y_bronze, y_glow in ((-1.58, -1.60), (2.36, 2.38)):
                b.box((side * 2.55 - 0.14, y_bronze - 0.04, 1.4), (side * 2.55 + 0.14, y_bronze + 0.04, 5.4), 'bronze')
                b.box((side * 2.55 - 0.08, y_glow - 0.04, 1.8), (side * 2.55 + 0.08, y_glow + 0.04, 5.0), 'glow')

    # Monumental squared & corbelled basalt lintel spanning over the central tunnel (Z = 6.2..7.9)
    b.box((-3.2, -1.62, 6.2), (3.2, 2.42, 7.6), 'stone_basalt')
    b.box((-3.5, -1.72, 7.4), (3.5, 2.52, 7.95), 'stone_granite')
    # Corbel shoulders at top corners of the tunnel (Z = 5.3..6.2, X = +-1.75..+-2.35)
    for side in (-1, 1):
        b.box((side * 2.05 - 0.32, -1.50, 5.35), (side * 2.05 + 0.32, 2.30, 6.22), 'stone_basalt')
    if detailed():
        # Bronze frieze & glowing Vondari forge crest on both -Y and +Y gate lintels
        for y_frz, y_glw in ((-1.66, -1.70), (2.44, 2.48)):
            b.box((-2.2, y_frz - 0.06, 6.55), (2.2, y_frz + 0.06, 7.25), 'bronze')
            for rx in (-1.5, -0.75, 0.0, 0.75, 1.5):
                b.box((rx - 0.14, y_glw - 0.05, 6.72), (rx + 0.14, y_glw + 0.05, 7.08), 'glow')
        # Raised iron portcullis teeth at Z = 5.1..6.2 inside the portal
        for px in (-1.8, -1.2, -0.6, 0.0, 0.6, 1.2, 1.8):
            b.box((px - 0.05, -0.65, 5.05), (px + 0.05, -0.52, 6.25), 'iron', bevel=0)
        b.box((-2.2, -0.68, 5.35), (2.2, -0.50, 5.48), 'iron', bevel=0)
        # Overhead glowing tunnel lantern
        b.box((-0.40, 0.1, 5.85), (0.40, 0.9, 6.20), 'firelight')

    # Towering central mountain peak above the gate (Z = 7.5..20.2) spanning full 14.2m width
    _crag_block(b, 0.0, 0.5, 7.5, 14.2, 3.85, 1.95, seed=950, sides=8,
                mat='rock', cap_mat='stone_dressed', batter=0.86, chamfer=0.07)
    _crag_block(b, -3.8, 0.6, 11.0, 16.8, 2.65, 1.85, seed=951, sides=7,
                mat='rock', cap_mat='stone_dressed', batter=0.82, chamfer=0.07)
    _crag_block(b, 3.8, 0.6, 11.0, 16.6, 2.65, 1.85, seed=952, sides=7,
                mat='rock', cap_mat='stone_dressed', batter=0.82, chamfer=0.07)
    _crag_block(b, 0.0, 0.6, 13.6, 18.2, 2.45, 1.75, seed=953, sides=7,
                mat='rock', cap_mat='stone_dressed', batter=0.78, chamfer=0.07)
    _rock_spire(b, (-3.2, 0.6, 14.8), (-3.8, 0.3, 19.8), 1.20, 0.98,
                seed=954, mat='rock', cap_mat='stone_dressed', curve=(-0.22, -0.08, 0.25), sides=6, segs=5)
    _rock_spire(b, (3.2, 0.6, 14.8), (3.8, 0.3, 19.6), 1.20, 0.98,
                seed=955, mat='rock', cap_mat='stone_dressed', curve=(0.22, -0.08, 0.25), sides=6, segs=5)
    _build_vent_stack_at(b, 0.0, 0.6, 17.9, scale=0.95, seed=956)
    return b


def mountain_cavern_vault():
    """12m x 10m Hollow Mountain Peak & Subterranean Cavern Ceiling module.
    - Underside (Z = 6.8..12.2m): Vaulted dark rock cavern ceiling with heavy basalt rib
      arches, corbelled basalt vault springers, and three hanging bronze forge-brazier
      chandeliers so streets and buildings sit inside a dramatic subterranean Dwarven cavern.
    - Top (Z = 12.2..21.8m): Towering stratified mountain crag peaks and smoking forge
      ventilation stacks forming the mountain exterior above the city."""
    b = MeshBuilder()
    # 1. Four corbelled rock-cut basalt & granite vault springers (at X = +-5.5, Y = +-4.5, Z = 7.2..11.0m)
    for sx in (-5.5, 5.5):
        for sy in (-4.5, 4.5):
            b.box((sx - 0.42, sy - 0.42, 7.2), (sx + 0.42, sy + 0.42, 8.2), 'stone_basalt')
            b.box((sx - 0.58, sy - 0.58, 8.1), (sx + 0.58, sy + 0.58, 9.4), 'stone_granite')
            b.box((sx - 0.78, sy - 0.78, 9.3), (sx + 0.78, sy + 0.78, 11.0), 'stone_basalt')

    # 2. Subterranean cavern vault ceiling slab & stepped rock soffits (Z = 9.6..12.8m)
    b.box((-6.35, -5.35, 11.0), (6.35, 5.35, 12.8), 'rock')
    # Stepped rock-cut cavern coffers around the perimeter of the ceiling (Z = 9.6..11.1m)
    b.box((-6.35, -5.35, 9.6), (-4.2, 5.35, 11.1), 'stone_granite')
    b.box((4.2, -5.35, 9.6), (6.35, 5.35, 11.1), 'stone_granite')
    b.box((-4.2, -5.35, 9.8), (4.2, -3.6, 11.1), 'stone_granite')
    b.box((-4.2, 3.6, 9.8), (4.2, 5.35, 11.1), 'stone_granite')

    # 3. Massive arched basalt vault ribs spanning across the cavern ceiling (Z = 9.8..11.2m)
    for ry in (-4.4, 0.0, 4.4):
        b.box((-5.9, ry - 0.38, 9.9), (5.9, ry + 0.38, 11.15), 'stone_basalt')
        b.box((-3.8, ry - 0.42, 10.3), (3.8, ry + 0.42, 11.25), 'stone_basalt')
    for rx in (-5.4, 0.0, 5.4):
        b.box((rx - 0.38, -4.9, 9.9), (rx + 0.38, 4.9, 11.15), 'stone_basalt')

    # Central hanging Vondari Dwarven bronze forge-chandelier (Z = 6.9..10.4m) + two flanking chandeliers
    for cx, cz_base, sc in ((0.0, 6.9, 1.0), (-3.2, 7.6, 0.72), (3.2, 7.6, 0.72)):
        b.box((cx - 0.55 * sc, -0.55 * sc, 9.85), (cx + 0.55 * sc, 0.55 * sc, 10.65), 'bronze')
        b.box((cx - 0.10 * sc, -0.10 * sc, cz_base + 0.55 * sc), (cx + 0.10 * sc, 0.10 * sc, 9.90), 'iron', bevel=0)
        b.box((cx - 0.88 * sc, -0.88 * sc, cz_base + 0.25 * sc), (cx + 0.88 * sc, 0.88 * sc, cz_base + 0.62 * sc), 'bronze')
        b.box((cx - 0.70 * sc, -0.70 * sc, cz_base + 0.05 * sc), (cx + 0.70 * sc, 0.70 * sc, cz_base + 0.32 * sc), 'firelight')
        b.box((cx - 0.50 * sc, -0.50 * sc, cz_base - 0.08 * sc), (cx + 0.50 * sc, 0.50 * sc, cz_base + 0.12 * sc), 'glow')

    # 4. Towering exterior mountain peak massif above the cavern roof (Z = 12.2..21.6m)
    _fractured_terrace(b, 0.0, 0.0, 12.2, 15.0, 6.0, 5.0, seed=960, sectors=10,
                       mat='rock', cap_mat='stone_dressed')
    _fractured_terrace(b, -0.4, 0.3, 14.6, 17.6, 4.5, 3.7, seed=961, sectors=9,
                       mat='rock', cap_mat='stone_dressed')
    _crag_block(b, 0.2, -0.2, 17.2, 20.0, 2.7, 2.2, seed=962, sides=7,
                mat='rock', cap_mat='stone_dressed', batter=0.78, chamfer=0.07)
    _rock_spire(b, (-2.6, -1.2, 14.8), (-3.2, -1.6, 20.8), 1.35, 1.15,
                seed=963, mat='rock', cap_mat='stone_dressed', curve=(-0.20, -0.12, 0.25), sides=6, segs=4)
    _rock_spire(b, (2.4, 1.4, 14.8), (3.0, 1.8, 21.4), 1.40, 1.18,
                seed=964, mat='rock', cap_mat='stone_dressed', curve=(0.20, 0.12, 0.25), sides=6, segs=4)
    _build_vent_stack_at(b, -0.6, 0.8, 19.6, scale=0.9, seed=965)
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
    ('Mine_Vent_Stack', mine_vent_stack),
    ('Mountain_Cliff_Wall', mountain_cliff_wall),
    ('Mountain_Gate_Massif', mountain_gate_massif),
    ('Mountain_Cavern_Vault', mountain_cavern_vault),
)


def define(kit):
    for name, fn in STONEHOLD_MODULES:
        kit.define(name, 'nature', fn())
