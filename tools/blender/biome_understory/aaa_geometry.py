"""AAA procedural botanical geometry library (leaves, flowers, ferns, grass, succulents).

Reads shared parameters from tools/blender/mesh_upgrade_config.yaml and eliminates
symmetric cards, lollipop domes, and radial sphere-tuft construction.
"""
import math
import os
import sys

import bmesh
from mathutils import Vector

_TOOLS_BLENDER_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
if _TOOLS_BLENDER_DIR not in sys.path:
    sys.path.insert(0, _TOOLS_BLENDER_DIR)
from upgrade_config import load_upgrade_config
from understory_common import tube

_VEG_CFG = load_upgrade_config().get('vegetation', {})
DEFAULT_ASYM = float(_VEG_CFG.get('leaf_asymmetry', 0.14))
DEFAULT_TWIST = float(_VEG_CFG.get('leaf_twist_max', 0.24))
DEFAULT_CUP = float(_VEG_CFG.get('leaf_cup_depth', 0.18))
DEFAULT_SERR = float(_VEG_CFG.get('serration_default', 0.12))


def _orthonormal_frame(forward_dir, roll=0.0):
    f = forward_dir.normalized() if forward_dir.length_squared > 1e-8 else Vector((0.0, 1.0, 0.0))
    ref = Vector((0.0, 0.0, 1.0)) if abs(f.z) < 0.92 else Vector((1.0, 0.0, 0.0))
    right0 = f.cross(ref).normalized()
    up0 = right0.cross(f).normalized()
    side = (right0 * math.cos(roll) + up0 * math.sin(roll)).normalized()
    up_perp = (up0 * math.cos(roll) - right0 * math.sin(roll)).normalized()
    return f, side, up_perp


def _leaf_width_profile(t, profile):
    """Botanical half-width multiplier along normalized blade coordinate t in [0, 1]."""
    if profile == 'cordate':
        return math.sin((t ** 0.52) * math.pi) * (1.16 - 0.35 * t)
    if profile == 'lanceolate':
        return math.sin((t ** 0.72) * math.pi) * (0.88 + 0.18 * (1.0 - t))
    if profile == 'hastate':
        auricle = 0.45 * math.exp(-((t - 0.14) / 0.10) ** 2)
        return math.sin((t ** 0.65) * math.pi) * 0.85 + auricle
    if profile == 'spatulate':
        return math.sin((t ** 1.15) * math.pi * 0.94) * (0.72 + 0.48 * t)
    if profile == 'palmate_lobe':
        lobe = 0.78 + 0.34 * math.sin(t * math.pi * 2.5)
        return max(0.08, math.sin((t ** 0.62) * math.pi) * lobe)
    if profile == 'paddle':
        return (0.28 + 0.72 * math.sin((t ** 0.72) * math.pi)) * (0.95 + 0.05 * math.cos(t * 14.0))
    return math.sin((t ** 0.64) * math.pi)


def shaped_leaf(
    bm,
    uv,
    origin,
    forward_dir,
    length,
    width,
    profile='ovate',
    asym=DEFAULT_ASYM,
    twist=0.10,
    arch=0.16,
    droop=0.08,
    cup_depth=DEFAULT_CUP,
    serration_amp=0.0,
    serration_freq=6,
    roll=0.0,
    damaged=False,
    petiole=0.0,
    u_range=(0.40, 0.70),
    v_range=(0.06, 0.94),
    stem_u_range=(0.04, 0.34),
    stem_v_range=(0.38, 0.94),
):
    """Build a shaped asymmetric 3D leaf blade (7x5 grid) with midrib furrow, twist & optional serration."""
    f, side0, up0 = _orthonormal_frame(forward_dir, roll=roll)
    blade_start = origin
    if petiole > 1e-3:
        blade_start = origin + f * (length * petiole) + up0 * (length * petiole * 0.25)
        tube(bm, uv, [origin, blade_start], [max(0.005, width * 0.09), max(0.004, width * 0.06)], sides=5, u_range=stem_u_range, v_range=stem_v_range, cap_end=False)

    u0, u1 = u_range
    v0, v1 = v_range
    rows = 6
    cols = 4
    grid = []
    blade_len = length * (1.0 - min(0.45, petiole))
    max_t = 0.74 if damaged else 1.0

    for r in range(rows + 1):
        t = (r / rows) * max_t
        curve_z = length * (arch * math.sin(t * math.pi * 0.88) - droop * (t ** 2.1))
        spine_pt = blade_start + f * (blade_len * t) + up0 * curve_z
        tw = twist * t
        loc_side = (side0 * math.cos(tw) + up0 * math.sin(tw)).normalized()
        loc_up = (up0 * math.cos(tw) - side0 * math.sin(tw)).normalized()
        hw_base = 0.5 * width * max(0.04, _leaf_width_profile(t, profile))
        if serration_amp > 1e-4 and 0.10 < t < 0.94:
            tooth = abs(math.sin(t * math.pi * serration_freq))
            hw_base *= 1.0 + serration_amp * (tooth - 0.35)

        vc = v0 + (v1 - v0) * (r / rows)
        row = []
        for c in range(cols + 1):
            sc = (c / cols) * 2.0 - 1.0
            asym_mul = 1.0 + (asym * math.sin(t * math.pi + 0.4) if sc > 0 else -asym * 0.65 * math.sin(t * math.pi))
            hw = hw_base * asym_mul
            if damaged and r >= rows - 1 and sc > 0.2:
                hw *= 0.45
            # V-furrow midrib crease + gentle downward margin curl on edges
            crease = width * cup_depth * (abs(sc) ** 1.15 - 0.16 * (sc ** 4)) * math.sin(max(0.08, t) * math.pi * 0.9)
            pt = spine_pt + loc_side * (sc * hw) + loc_up * crease
            uc = u0 + (u1 - u0) * (c / cols)
            row.append((bm.verts.new(pt), (uc, vc)))
        grid.append(row)

    for r in range(rows):
        for c in range(cols):
            v00, uv00 = grid[r][c]
            v10, uv10 = grid[r][c + 1]
            v11, uv11 = grid[r + 1][c + 1]
            v01, uv01 = grid[r + 1][c]
            vs = (v00, v10, v11, v01)
            if len(set(vs)) == 4:
                f_new = bm.faces.new(vs)
                for loop, coord in zip(f_new.loops, (uv00, uv10, uv11, uv01)):
                    loop[uv].uv = coord


def volumetric_succulent_blade(
    bm,
    uv,
    origin,
    forward_dir,
    length,
    width,
    thickness,
    arch=-0.16,
    droop=0.08,
    teeth=True,
    u_range=(0.40, 0.70),
    v_range=(0.06, 0.94),
    accent_u=(0.74, 0.96),
    accent_v=(0.06, 0.94),
):
    """Closed 3D fleshy keeled succulent blade (channeled top, keeled belly, sharp tip & margin teeth)."""
    f, side, up = _orthonormal_frame(forward_dir)
    u0, u1 = u_range
    v0, v1 = v_range
    uc = 0.5 * (u0 + u1)
    segs = 5
    rings = []

    for i in range(segs):
        t = i / segs
        w_t = width * 0.5 * max(0.08, math.sin((1.0 - t * 0.85) * math.pi * 0.52) * (0.78 + 0.32 * math.sin(t * math.pi)))
        if teeth and i in (1, 2, 3):
            w_t *= 1.18
        th_t = thickness * (1.0 - 0.78 * (t ** 1.1))
        c_pt = origin + f * (length * t) + up * (length * (arch * math.sin(t * math.pi * 0.85) - droop * (t ** 2)))
        vt = v0 + (v1 - v0) * t
        pts = (
            (c_pt - side * w_t + up * (th_t * 0.18), (u0, vt)),
            (c_pt - up * (th_t * 0.24), (uc, vt)),
            (c_pt + side * w_t + up * (th_t * 0.18), (u1, vt)),
            (c_pt - up * (th_t * 0.95), (uc, vt)),
        )
        rings.append([(bm.verts.new(p), uv_c) for p, uv_c in pts])

    for i in range(segs - 1):
        ra, rb = rings[i], rings[i + 1]
        for k in range(4):
            kn = (k + 1) % 4
            face = bm.faces.new((ra[k][0], ra[kn][0], rb[kn][0], rb[k][0]))
            for loop, coord in zip(face.loops, (ra[k][1], ra[kn][1], rb[kn][1], rb[k][1])):
                loop[uv].uv = coord

    tip_pt = origin + f * (length * 1.06) + up * (length * (arch * 0.2 - droop))
    tip_v = bm.verts.new(tip_pt)
    tip_uv = (0.5 * (accent_u[0] + accent_u[1]), accent_v[1])
    last = rings[-1]
    for k in range(4):
        kn = (k + 1) % 4
        face = bm.faces.new((last[k][0], last[kn][0], tip_v))
        for loop, coord in zip(face.loops, ((accent_u[0], accent_v[0]), (accent_u[1], accent_v[0]), tip_uv)):
            loop[uv].uv = coord


def grass_blade_clump(
    bm,
    uv,
    rng,
    count,
    height,
    spread,
    family='meadow_short',
    u_foliage=(0.40, 0.70),
    v_foliage=(0.06, 0.94),
    u_accent=(0.74, 0.96),
    v_accent=(0.06, 0.94),
):
    """Generate an asymmetric grass/reed clump with family-specific profiles and open negative space."""
    sub_centers = []
    clump_n = 2 if family == 'tundra_sparse' else 3
    for c_idx in range(clump_n):
        a = (c_idx / clump_n) * math.tau + rng.uniform(-0.4, 0.4)
        r = rng.uniform(0.02, spread * 0.28)
        sub_centers.append(Vector((math.cos(a) * r, math.sin(a) * r, -0.02)))

    width_scale = {
        'meadow_short': 0.042,
        'wild_tall': 0.052,
        'dry_steppe': 0.036,
        'tropical_broad': 0.110,
        'wetland_reed': 0.064,
        'flowering_oat': 0.044,
        'tundra_sparse': 0.034,
    }.get(family, 0.045)

    for i in range(count):
        base = sub_centers[i % len(sub_centers)]
        ang = rng.uniform(0.0, math.tau)
        # Leave small asymmetric open gaps instead of mechanical uniformity
        if math.sin(ang * 2.0 + 0.7) > 0.84 and i % 3 == 0:
            ang += 0.42
        off = Vector((math.cos(ang) * rng.uniform(0.01, spread * 0.16), math.sin(ang) * rng.uniform(0.01, spread * 0.16), 0.0))
        origin = base + off
        is_outer = (i % 3 == 0)
        pitch = rng.uniform(0.28, 0.65) if is_outer else rng.uniform(0.82, 1.35)
        droop = rng.uniform(0.22, 0.42) if (is_outer or family in ('dry_steppe', 'flowering_oat')) else rng.uniform(0.06, 0.18)
        blen = height * rng.uniform(0.58 if is_outer else 0.78, 1.08)
        bw = width_scale * rng.uniform(0.75, 1.25)
        fdir = Vector((math.cos(ang), math.sin(ang), pitch)).normalized()
        shaped_leaf(
            bm,
            uv,
            origin,
            fdir,
            blen,
            bw,
            profile='lanceolate' if family != 'tropical_broad' else 'paddle',
            asym=0.10,
            twist=rng.uniform(-0.24, 0.24),
            arch=0.14 if family != 'wetland_reed' else 0.08,
            droop=droop,
            cup_depth=0.20,
            roll=rng.uniform(-0.25, 0.25),
            damaged=(i % 9 == 4),
            u_range=u_accent if (family == 'dry_steppe' and i % 4 == 0) else u_foliage,
            v_range=v_accent if (family == 'dry_steppe' and i % 4 == 0) else v_foliage,
        )


def flower_daisy_head(bm, uv, center, normal, radius, petal_count, rng, u_accent, v_accent, u_bark, v_bark, u_foliage, v_foliage):
    """Convex multi-ring disc head + calyx bracts + staggered overlapping shaped ray petals."""
    f_n, tx, ty = _orthonormal_frame(normal)
    # Green sepal calyx cup underneath head
    for s in range(5):
        sa = (s / 5.0) * math.tau + rng.uniform(-0.15, 0.15)
        sdir = ((tx * math.cos(sa) + ty * math.sin(sa)) * 0.85 - f_n * 0.35).normalized()
        shaped_leaf(bm, uv, center - f_n * (radius * 0.10), sdir, radius * 0.48, radius * 0.18, profile='lanceolate', arch=0.05, droop=0.10, u_range=u_foliage, v_range=v_foliage)

    # Convex dome disc center built cleanly without sphere lollipop distortion
    tube(
        bm,
        uv,
        [center - f_n * (radius * 0.08), center + f_n * (radius * 0.08), center + f_n * (radius * 0.16)],
        [radius * 0.34, radius * 0.30, radius * 0.08],
        sides=9,
        u_range=u_bark,
        v_range=v_bark,
    )
    # Two staggered overlapping tiers of shaped ray petals with varied droop
    for k in range(petal_count):
        tier = k % 2
        a = (k / petal_count) * math.tau + rng.uniform(-0.14, 0.14)
        rad = (tx * math.cos(a) + ty * math.sin(a)).normalized()
        openness = rng.uniform(0.08, 0.36) if tier == 0 else rng.uniform(-0.06, 0.20)
        pdir = (rad + f_n * openness).normalized()
        shaped_leaf(
            bm,
            uv,
            center + rad * (radius * 0.24) + f_n * (0.01 * tier),
            pdir,
            radius * rng.uniform(0.76, 0.98),
            radius * rng.uniform(0.24, 0.32),
            profile='spatulate',
            asym=0.10,
            twist=rng.uniform(-0.12, 0.12),
            arch=0.10,
            droop=rng.uniform(0.06, 0.22),
            cup_depth=0.12,
            u_range=u_accent,
            v_range=v_accent,
        )


def flower_bell_corolla(bm, uv, attach_pt, hang_dir, length, radius, rng, u_accent, v_accent, u_foliage, v_foliage):
    """Calyx bract base + flared 5-lobed tubular bell blossom."""
    hdir = hang_dir.normalized()
    calyx_tip = attach_pt + hdir * (length * 0.16)
    tube(bm, uv, [attach_pt, calyx_tip], [radius * 0.26, radius * 0.42], sides=5, u_range=u_foliage, v_range=v_foliage, cap_end=False)
    mid_pt = attach_pt + hdir * (length * 0.56)
    rim_pt = attach_pt + hdir * length
    tube(bm, uv, [calyx_tip, mid_pt, rim_pt], [radius * 0.38, radius * 0.78, radius * 1.05], sides=7, u_range=u_accent, v_range=v_accent, cap_end=False, flute_count=5, flute_depth=0.10)
    _, side, up = _orthonormal_frame(hdir)
    for k in range(5):
        a = (k / 5.0) * math.tau + rng.uniform(-0.12, 0.12)
        radial = (side * math.cos(a) + up * math.sin(a)).normalized()
        ldir = (hdir * 0.65 + radial * 0.75).normalized()
        shaped_leaf(bm, uv, rim_pt + radial * (radius * 0.85), ldir, radius * 0.55, radius * 0.46, profile='ovate', arch=0.05, droop=0.12, cup_depth=0.08, u_range=u_accent, v_range=v_accent)


def flower_spike_raceme(bm, uv, base_pt, top_pt, radius, count, rng, style='foxglove', u_accent=(0.74, 0.96), v_accent=(0.06, 0.94), u_foliage=(0.40, 0.70), v_foliage=(0.06, 0.94), u_bark=(0.04, 0.34), v_bark=(0.38, 0.94)):
    """Botanical raceme spire grading from open lower florets to compact apical buds."""
    mid = base_pt.lerp(top_pt, 0.52) + Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), 0.0))
    tube(bm, uv, [base_pt, mid, top_pt], [max(0.018, radius * 0.24), max(0.012, radius * 0.16), 0.006], sides=6, u_range=u_foliage, v_range=v_foliage)
    for i in range(count):
        frac = i / max(count - 1, 1)
        t = 0.28 + 0.68 * frac
        u_bez = 1.0 - t
        spine_pt = (u_bez * u_bez) * base_pt + (2.0 * u_bez * t) * mid + (t * t) * top_pt
        yaw = (0.35 * math.sin(i * 0.9) if style == 'foxglove' else i * 2.39996) + rng.uniform(-0.15, 0.15)
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        ped_len = radius * (0.35 - 0.18 * frac)
        ped_tip = spine_pt + out * ped_len + Vector((0, 0, ped_len * (0.2 if style != 'foxglove' else -0.1)))
        tube(bm, uv, [spine_pt, ped_tip], [0.006, 0.004], sides=4, u_range=u_foliage, v_range=v_foliage, cap_end=False)
        scale = 1.12 - 0.64 * frac
        if frac > 0.84:
            # Apical pointed floral bud
            shaped_leaf(bm, uv, ped_tip, (out * 0.55 + Vector((0, 0, 0.85))).normalized(), radius * 0.42 * scale, radius * 0.22 * scale, profile='ovate', cup_depth=0.35, u_range=u_foliage, v_range=v_foliage)
        elif style == 'foxglove':
            hang = (out * 0.72 + Vector((0, 0, -0.68))).normalized()
            flower_bell_corolla(bm, uv, ped_tip, hang, radius * 0.76 * scale, radius * 0.26 * scale, rng, u_accent, v_accent, u_foliage, v_foliage)
        elif style == 'lupine':
            # Banner upper petal + forward keel boat
            shaped_leaf(bm, uv, ped_tip, (out * 0.45 + Vector((0, 0, 0.88))).normalized(), radius * 0.55 * scale, radius * 0.34 * scale, profile='cordate', cup_depth=0.22, u_range=u_accent, v_range=v_accent)
            shaped_leaf(bm, uv, ped_tip, (out * 0.92 + Vector((0, 0, 0.15))).normalized(), radius * 0.52 * scale, radius * 0.24 * scale, profile='ovate', cup_depth=0.34, u_range=u_accent, v_range=v_accent)
        else:
            flower_daisy_head(bm, uv, ped_tip, (out + Vector((0, 0, 0.45))).normalized(), radius * 0.42 * scale, 5, rng, u_accent, v_accent, u_bark, v_bark, u_foliage, v_foliage)


def flower_umbel_corymb(bm, uv, stem_tip, normal, spread, clusters, rng, u_accent, v_accent, u_foliage, v_foliage):
    """Diverging pedicel umbrella bearing uneven miniature floret cups and peripheral buds."""
    n, tx, ty = _orthonormal_frame(normal)
    for k in range(clusters):
        a = (k / max(clusters, 1)) * math.tau + rng.uniform(-0.22, 0.22)
        radial = tx * math.cos(a) + ty * math.sin(a)
        r_dist = spread * (0.28 + 0.72 * ((k % 3) / 2.0))
        sub_tip = stem_tip + radial * r_dist + n * (spread * (0.26 - 0.14 * (r_dist / max(spread, 1e-4))))
        tube(bm, uv, [stem_tip, sub_tip], [0.008, 0.004], sides=4, u_range=u_foliage, v_range=v_foliage, cap_end=False)
        is_bud = (k % 5 == 0)
        f_normal = (n + radial * rng.uniform(0.15, 0.45)).normalized()
        if is_bud:
            shaped_leaf(bm, uv, sub_tip, f_normal, spread * 0.26, spread * 0.18, profile='ovate', cup_depth=0.45, u_range=u_foliage, v_range=v_foliage)
        else:
            for p_idx in range(4):
                pa = p_idx * (math.tau / 4.0) + rng.uniform(-0.15, 0.15)
                pdir = (f_normal * 0.55 + (tx * math.cos(pa) + ty * math.sin(pa)) * 0.82).normalized()
                shaped_leaf(bm, uv, sub_tip, pdir, spread * 0.28, spread * 0.18, profile='spatulate', cup_depth=0.14, u_range=u_accent, v_range=v_accent)


def flower_tropical_bract(bm, uv, attach_pt, forward_dir, length, height_cup, rng, style='heliconia', u_accent=(0.74, 0.96), v_accent=(0.06, 0.94), u_foliage=(0.40, 0.70), v_foliage=(0.06, 0.94)):
    """Boat-shaped folded V-carinate lobster-claw bract with emerged inner tubular florets."""
    f, side, up = _orthonormal_frame(forward_dir)
    # Two upward-folded keeled cheek walls meeting at bottom keel spine
    for sgn in (-1.0, 1.0):
        wall_dir = (f + up * 0.28 + side * (sgn * 0.24)).normalized()
        shaped_leaf(
            bm,
            uv,
            attach_pt,
            wall_dir,
            length,
            height_cup * 0.85,
            profile='hastate' if style == 'heliconia' else 'lanceolate',
            asym=0.18,
            arch=0.22,
            droop=-0.08,
            cup_depth=0.26,
            roll=sgn * 1.12,
            u_range=u_accent,
            v_range=v_accent,
        )
    # Emerging inner tubular flowers tucked inside bract cradle
    for k in range(2):
        f_p = attach_pt + f * (length * (0.28 + 0.18 * k)) + up * (height_cup * 0.22)
        tip_p = f_p + f * (length * 0.32) + up * (height_cup * (0.55 if style == 'strelitzia' else 0.26))
        tube(bm, uv, [f_p, tip_p], [0.014, 0.005], sides=5, u_range=u_foliage if k == 0 else u_accent, v_range=v_foliage if k == 0 else v_accent)


def fern_frond(
    bm,
    uv,
    origin,
    yaw,
    pitch,
    length,
    width,
    pinna_pairs,
    rng,
    droop=0.22,
    damaged_idx=-1,
    u_foliage=(0.40, 0.70),
    v_foliage=(0.06, 0.94),
    u_bark=(0.04, 0.34),
    v_bark=(0.38, 0.94),
):
    """Curved fern rachis carrying tapered asymmetric pinnae that diminish cleanly to an acuminate tip."""
    out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    up = Vector((0.0, 0.0, 1.0))
    side = out.cross(up).normalized()
    p0 = origin
    p1 = origin + out * (length * 0.48 * math.cos(pitch)) + up * (length * (0.48 * math.sin(pitch) + 0.14))
    p2 = origin + out * (length * 0.96) + up * (length * (0.36 * math.sin(pitch) - droop))

    def _bez(t):
        u = 1.0 - t
        return (u * u) * p0 + (2.0 * u * t) * p1 + (t * t) * p2

    # Sample rachis directly on the exact Bezier path so pinnae stay locked to the stem
    rachis_pts = [_bez(s / 5.0) for s in range(6)]
    r0 = max(0.011, width * 0.040)
    rachis_r = [r0 * (1.0 - 0.78 * (s / 5.0)) for s in range(6)]
    tube(bm, uv, rachis_pts, rachis_r, sides=5, u_range=u_bark, v_range=v_bark)

    for j in range(1, pinna_pairs + 1):
        if j == damaged_idx:
            continue
        t = 0.14 + 0.78 * (j / (pinna_pairs + 1))
        mid = _bez(t)
        u = 1.0 - t
        tang = (2.0 * u * (p1 - p0) + 2.0 * t * (p2 - p1)).normalized()
        t_blade = (j - 1) / max(pinna_pairs - 1, 1)
        envelope = math.sin((0.16 + 0.82 * t_blade) * math.pi)
        plen = 0.50 * width * max(0.16, envelope)
        pw = max(0.022, (length / max(pinna_pairs, 1)) * 0.78 * max(0.32, 1.0 - 0.56 * t_blade))
        for sgn in (-1.0, 1.0):
            pdir = (side * (sgn * 0.84) + tang * 0.46 + up * rng.uniform(0.04, 0.16)).normalized()
            shaped_leaf(
                bm,
                uv,
                mid,
                pdir,
                plen,
                pw,
                profile='lanceolate',
                asym=0.14,
                twist=sgn * 0.10,
                arch=0.06,
                droop=0.10 + 0.08 * t_blade,
                cup_depth=0.14,
                serration_amp=0.10,
                serration_freq=4,
                u_range=u_foliage,
                v_range=v_foliage,
            )
    # Terminal apical leaflet seamlessly capping rachis tip
    tip_tang = (p2 - p1).normalized()
    shaped_leaf(bm, uv, _bez(0.94), tip_tang, length * 0.12, width * 0.10, profile='lanceolate', droop=0.08, u_range=u_foliage, v_range=v_foliage)


def fern_crosier_spiral(bm, uv, origin, yaw, height, rng, u_foliage=(0.40, 0.70), v_foliage=(0.06, 0.94)):
    """Compact unfurling fiddlehead crosier nested inside fern crown."""
    out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    up = Vector((0.0, 0.0, 1.0))
    h = height * 0.72
    pts = [
        origin,
        origin + out * (h * 0.10) + up * (h * 0.45),
        origin + out * (h * 0.22) + up * (h * 0.85),
        origin + out * (h * 0.32) + up * (h * 0.92),
        origin + out * (h * 0.26) + up * (h * 0.76),
    ]
    tube(bm, uv, pts, [0.015, 0.012, 0.010, 0.008, 0.006], sides=5, u_range=u_foliage, v_range=v_foliage)
