"""Reusable Vondari Dwarven cliff-citadel architectural & environmental builders for Stonehold formations.

Provides high-detail, manifold 3D components matching the Stonehold concept art:
- Jagged, multi-ribbed dark fractured crag cliffs (`rock` — never masonry wall blocks)
- Sunlit polygonal flagstone terrace decks (`stone_dressed` / `stone_granite` slabs) with
  overhanging basalt & gold-inlaid cornices, sleek crenellated parapet curbs, and slender
  vertical corner pilaster buttresses
- Carved flights of stone stairs with stepped basalt & gold cheek-balustrades
- Arched stone viaduct bridges & saddle causeways
- Polygonal Vondari Dwarven summit citadel halls with radial roof ribs & octagonal roaring
  signal-beacon forts
- Recessed firelit cliff portals, navy-and-gold Vondari cliff banners, cliffside timber
  scaffolding & raking ore cranes with suspended buckets, canvas work tents, cargo clusters,
  cascading whitewater waterfalls, and miniature alpine conifers/moss.
"""
import math
import random

from mathutils import Matrix, Vector

from .. import materials
from ..config import detailed
from ..mesh import MeshBuilder


def ring_pts(cx, cy, z, rx, ry, angles, radii_mult, tilt_x=0.0, tilt_y=0.0, rot=0.0):
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


def _ring_u(pts, scale, u0):
    """Arc length round a ring in texture units, so a wrapped texture flows across edges."""
    us = [u0]
    for i in range(len(pts)):
        us.append(us[-1] + (pts[(i + 1) % len(pts)] - pts[i]).length / scale)
    return us


def loft_rings(b, bot_pts, top_pts, mat, cap_bot=False, cap_top=True, cap_mat=None, tone=1.0, us=None):
    n = len(bot_pts)
    centre = sum(bot_pts, Vector()) / n
    # Rock wraps its texture round the block (u = arc length, v = height); per-face planar UVs
    # restart at every edge and make the texture jump between facets. u is measured once (on the
    # block's foot ring) and shared by every ring, or a battered top shears the columns diagonal.
    wrap = mat == 'rock_cliff'
    if wrap:
        scale = materials.SPEC[mat].scale
        ub = ut = us or _ring_u(bot_pts, scale, 0.0)
    for i in range(n):
        p0, p1 = bot_pts[i], bot_pts[(i + 1) % n]
        q1, q0 = top_pts[(i + 1) % n], top_pts[i]
        mid = (p0 + p1 + q0 + q1) * 0.25
        out = Vector((mid.x - centre.x, mid.y - centre.y, 0.15))
        uvs = None
        if wrap:
            uvs = [(ub[i], p0.z / scale), (ub[i + 1], p1.z / scale),
                   (ut[i + 1], q1.z / scale), (ut[i], q0.z / scale)]
        b.poly([p0, p1, q1, q0], mat, outward=out, tone=tone, uvs=uvs)
    if cap_bot:
        b.poly(list(reversed(bot_pts)), mat, outward=(0, 0, -1), tone=tone * 0.75)
    if cap_top:
        b.poly(top_pts, cap_mat or mat, outward=(0, 0, 1), tone=tone * 0.98)


def _kinked_loft(b, bot, end, mat, rng, rx, tone, us, cap_top, cap_mat):
    """Loft bot -> end through jittered intermediate rings, so a rock face's long edges kink
    and bulge like fractured stone instead of running ruler-straight."""
    h = end[0].z - bot[0].z
    n_mid = 0 if not detailed() else min(2, int(h / 0.18))
    bulge = min(rx, 0.18)  # big massifs get the same few-cm kinks as ribs, not terraces
    centre = sum(bot, Vector()) / len(bot)
    rings = [bot]
    for k in range(1, n_mid + 1):
        t = k / (n_mid + 1) + rng.uniform(-0.08, 0.08) / (n_mid + 1)
        ring = []
        for p, q in zip(bot, end):
            v = p.lerp(q, t)
            radial = Vector((v.x - centre.x, v.y - centre.y, 0.0))
            if radial.length > 1e-6:
                v = v + radial.normalized() * bulge * rng.uniform(-0.05, 0.07)
            ring.append(v + Vector((0, 0, rng.uniform(-0.12, 0.12) * h / (n_mid + 1))))
        rings.append(ring)
    rings.append(end)
    for k in range(len(rings) - 1):
        last = k == len(rings) - 2
        loft_rings(b, rings[k], rings[k + 1], mat, cap_bot=False, cap_top=cap_top and last,
                   cap_mat=cap_mat, tone=tone, us=us)


def crag_block(b, cx, cy, z0, z1, rx, ry, seed=1, sides=7, mat='rock_cliff',
               cap_mat='rock_cliff', batter=0.88, chamfer=0.035,
               tilt_x=0.0, tilt_y=0.0, rot=0.0, tone=None):
    """Faceted natural crag rock block with battered cliff sides (never mortared masonry)."""
    rng = random.Random(seed)
    if not detailed():
        sides = max(5, sides - 2)
    angles = [2 * math.pi * i / sides + rng.uniform(-0.18, 0.18) / sides for i in range(sides)]
    rm_bot = [rng.uniform(0.84, 1.14) for _ in range(sides)]
    rm_mid = [r * batter * rng.uniform(0.95, 1.04) for r in rm_bot]
    tone_val = rng.uniform(0.70, 0.96) if tone is None else tone

    bot = ring_pts(cx, cy, z0, rx, ry, angles, rm_bot, rot=rot)
    us = _ring_u(bot, materials.SPEC[mat].scale, rng.uniform(0.0, 1.0)) if mat == 'rock_cliff' else None
    if detailed() and chamfer > 0.005 and (z1 - z0) > chamfer * 2.5 and min(rx, ry) > chamfer * 3.0:
        z_ch = z1 - chamfer
        mid = ring_pts(cx, cy, z_ch, rx, ry, angles, rm_mid, tilt_x=tilt_x, tilt_y=tilt_y, rot=rot)
        ch_scale = max(0.65, 1.0 - chamfer / max(0.20, min(rx, ry)))
        rm_top = [r * ch_scale for r in rm_mid]
        top = ring_pts(cx, cy, z1, rx, ry, angles, rm_top, tilt_x=tilt_x, tilt_y=tilt_y, rot=rot)
        _kinked_loft(b, bot, mid, mat, rng, min(rx, ry), tone_val, us, False, None)
        loft_rings(b, mid, top, cap_mat or mat, cap_bot=False, cap_top=True,
                   cap_mat=cap_mat or mat, tone=tone_val * 0.96,
                   us=us if (cap_mat or mat) == mat else None)
    else:
        top = ring_pts(cx, cy, z1, rx, ry, angles, rm_mid, tilt_x=tilt_x, tilt_y=tilt_y, rot=rot)
        _kinked_loft(b, bot, top, mat, rng, min(rx, ry), tone_val, us, True, cap_mat or mat)


def rock_spire(b, base_pt, tip_pt, rx, ry, seed=1, mat='rock_cliff',
               cap_mat='rock_cliff', curve=(0.0, 0.0, 0.0), sides=6, segs=5):
    """Curved, multi-segment faceted dark crag horn / monolith spire tapering to a sharp point."""
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
    ridge_shape = [1.18 if i % 2 == 0 else 0.82 for i in range(sides)]

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

    tone_val = rng.uniform(0.72, 0.94)
    for k in range(segs):
        use_mat = cap_mat if k >= segs - 1 else mat
        loft_rings(b, rings[k], rings[k + 1], use_mat,
                   cap_bot=(k == 0), cap_top=(k == segs - 1),
                   cap_mat=cap_mat, tone=tone_val * (0.88 + 0.04 * k))


def jagged_cliff_tier(b, cx, cy, z0, z1, rx, ry, seed=1, ribs=20,
                      under_terrace=False, open_angles=()):
    """Deeply fissured vertical mountain crag massif (`rock` material, zero brick joints)
    with sharp angular vertical dihedral ribs and stepped rocky ledges."""
    rng = random.Random(seed)
    top_trim = 0.055 if under_terrace else 0.02
    # Solid dark core massif
    crag_block(b, cx, cy, z0, z1 - top_trim, rx * 0.80, ry * 0.80,
               seed=seed + 50, sides=max(8, ribs // 2),
               mat='rock_cliff', cap_mat='rock_cliff',
               batter=0.92, chamfer=0.02, tone=0.68)

    n_ribs = ribs if detailed() else max(8, ribs // 2)
    for i in range(n_ribs):
        a = 2 * math.pi * i / n_ribs + rng.uniform(-0.06, 0.06)
        in_open = _angle_in_ranges(math.atan2(math.sin(a), math.cos(a)), open_angles)
        # Keep ribs recessed inside stair/portal open_angles so they never clip stairs
        if in_open:
            dist = rng.uniform(0.64, 0.72)
        elif under_terrace:
            dist = rng.uniform(0.74, 0.86)
        else:
            dist = rng.uniform(0.80, 0.98)
        bx = cx + rx * dist * math.cos(a)
        by = cy + ry * dist * math.sin(a)
        rib_w = (2 * math.pi * max(rx, ry) / n_ribs) * rng.uniform(0.48, 0.92)
        rib_d = rib_w * rng.uniform(0.72, 1.08)
        if under_terrace:
            rib_z1 = z1 - rng.uniform(0.060, 0.100)
        else:
            rib_z1 = z1 - rng.uniform(0.01, 0.14 * (z1 - z0))
        tone_choice = rng.uniform(0.80, 0.94)
        # Break each column into 1-3 stacked blocks, wider and further out toward the foot,
        # so the face reads as fractured crag with ledges rather than a palisade of posts.
        n_seg = 1 if in_open or not detailed() or (rib_z1 - z0) < 0.26 else rng.choice((2, 2, 3))
        cuts = sorted(rng.uniform(0.25, 0.8) for _ in range(n_seg - 1))
        bounds = [z0] + [z0 + (rib_z1 - z0) * c for c in cuts] + [rib_z1]
        for k in range(n_seg):
            below = n_seg - 1 - k
            seg_dist = dist + below * rng.uniform(0.02, 0.05)
            grow = 1.0 + below * rng.uniform(0.10, 0.28)
            top_seg = k == n_seg - 1
            tilt = 0.0 if (under_terrace and top_seg) else rng.uniform(-0.07, 0.07)
            crag_block(b, cx + rx * seg_dist * math.cos(a), cy + ry * seg_dist * math.sin(a),
                       bounds[k], bounds[k + 1], rib_w * grow, rib_d * grow,
                       seed=seed * 17 + i * 5 + k, sides=5 if (i + k) % 2 == 0 else 6,
                       mat='rock_cliff', cap_mat='rock_cliff',
                       batter=rng.uniform(0.82, 0.93), chamfer=0.0 if top_seg else 0.014,
                       tilt_x=tilt * math.cos(a), tilt_y=tilt * math.sin(a),
                       rot=a + rng.uniform(-0.3, 0.3), tone=tone_choice * rng.uniform(0.96, 1.03))
            if not top_seg and rng.random() < 0.22:
                moss_tuft(b, cx + rx * (seg_dist + 0.02) * math.cos(a),
                          cy + ry * (seg_dist + 0.02) * math.sin(a), bounds[k + 1],
                          radius=rib_w * 0.55, seed=seed * 7 + i)


def _angle_in_ranges(ang, open_angles):
    """Check if angle `ang` (radians) falls inside any `(a_start, a_end)` opening interval."""
    a = ang % (2 * math.pi)
    for a0, a1 in open_angles:
        s = a0 % (2 * math.pi)
        e = a1 % (2 * math.pi)
        if s <= e:
            if s <= a <= e:
                return True
        else:
            if a >= s or a <= e:
                return True
    return False


def dwarven_terrace_deck(b, cx, cy, z0, z_deck, rx, ry, seed=1, sides=8,
                         parapet=True, gold_trim=True, buttresses=True,
                         open_angles=(), ribs=20):
    """Build a complete Vondari Dwarven cliff tier matching `stonehold-3.jpg`:
    1) Jagged vertical dark-rock cliff ribs from z0 to z_deck - 0.060
    2) Overhanging moulded basalt rim cornice with inlaid gold frieze band
    3) Broad, sunlit polygonal flagstone terrace deck (`stone_dressed` slabs over dark joints)
    4) Sleek, low-profile crenellated stone parapet curbs (so the paved terrace stays visible!)
    5) Slender vertical corner pilaster buttresses with gold rune strips descending the cliff.
    """
    jagged_cliff_tier(b, cx, cy, z0, z_deck, rx, ry, seed=seed, ribs=ribs,
                      under_terrace=True, open_angles=open_angles)

    rng = random.Random(seed + 7)
    angles = [2 * math.pi * i / sides for i in range(sides)]
    radii = [rng.uniform(0.95, 1.03) for _ in range(sides)]

    # 1. Overhanging moulded basalt upper cliff cornice & continuous gold inlay frieze
    cornice_bot = ring_pts(cx, cy, z_deck - 0.065, rx * 0.98, ry * 0.98, angles, radii)
    cornice_top = ring_pts(cx, cy, z_deck, rx * 1.02, ry * 1.02, angles, radii)
    loft_rings(b, cornice_bot, cornice_top, 'stone_basalt',
               cap_bot=True, cap_top=True, cap_mat='stone_basalt', tone=0.82)

    if detailed() and gold_trim:
        g_bot = ring_pts(cx, cy, z_deck - 0.046, rx * 1.022, ry * 1.022, angles, radii)
        g_top = ring_pts(cx, cy, z_deck - 0.018, rx * 1.025, ry * 1.025, angles, radii)
        loft_rings(b, g_bot, g_top, 'gold', cap_bot=False, cap_top=False, tone=0.88)

    # 2. One flagstone paving course over the whole deck (the texture draws the slabs)
    pave_bot = ring_pts(cx, cy, z_deck - 0.005, rx * 0.96, ry * 0.96, angles, radii)
    pave_top = ring_pts(cx, cy, z_deck + 0.012, rx * 0.96, ry * 0.96, angles, radii)
    loft_rings(b, pave_bot, pave_top, 'stone_flag', cap_bot=False, cap_top=True,
               cap_mat='stone_flag', tone=0.96)

    # 3. Sleek perimeter crenellated parapet curbs & slender vertical cliff pilaster buttresses
    rim_pts = ring_pts(cx, cy, z_deck, rx * 0.97, ry * 0.97, angles, radii)
    for i in range(sides):
        j = (i + 1) % sides
        p0 = rim_pts[i]
        p1 = rim_pts[j]
        c0 = cornice_top[i]
        # Slender vertical corner pilaster buttress descending down the cliff face
        if buttresses and i % 2 == 0:
            ang_v = angles[i]
            vx, vy = c0.x, c0.y
            bw = 0.042
            z_butt_bot = max(0.0, z0)
            b.box((vx - bw, vy - bw, z_butt_bot), (vx + bw, vy + bw, z_deck + 0.085), 'stone_basalt', bevel=0)
            b.box((vx - bw * 1.15, vy - bw * 1.15, z_deck + 0.075),
                  (vx + bw * 1.15, vy + bw * 1.15, z_deck + 0.095), 'stone_basalt', bevel=0)
            if detailed() and gold_trim and (z_deck - z_butt_bot) > 0.22:
                gx = vx + math.cos(ang_v) * (bw * 0.55)
                gy = vy + math.sin(ang_v) * (bw * 0.55)
                b.box((gx - bw * 0.38, gy - bw * 0.38, z_butt_bot + 0.06),
                      (gx + bw * 0.38, gy + bw * 0.38, z_deck + 0.055), 'gold', bevel=0)

        if not parapet:
            continue
        mid_ang = math.atan2(0.5 * (p0.y + p1.y) - cy, 0.5 * (p0.x + p1.x) - cx)
        if _angle_in_ranges(mid_ang, open_angles):
            continue

        seg_vec = p1 - p0
        seg_len = seg_vec.length
        if seg_len < 0.14:
            continue
        # Note: in MeshBuilder.beam(p0, p1, (0,0,1), side_range, width, mat),
        # `side_range` is vertical height along Z and `width` is horizontal thickness!
        # Low dark balustrade (curb, slim posts, handrail) so the paving stays the bright read.
        b.beam((p0.x, p0.y, z_deck), (p1.x, p1.y, z_deck),
               (0, 0, 1), (0.0, 0.022), 0.040, 'stone_basalt', bevel=0)
        b.beam((p0.x, p0.y, z_deck), (p1.x, p1.y, z_deck),
               (0, 0, 1), (0.056, 0.066), 0.020, 'stone_basalt', bevel=0)
        if detailed():
            n_posts = max(2, int(seg_len / 0.16))
            for m_idx in range(1, n_posts):
                mp = p0.lerp(p1, m_idx / n_posts)
                b.box((mp.x - 0.009, mp.y - 0.009, z_deck + 0.02),
                      (mp.x + 0.009, mp.y + 0.009, z_deck + 0.058), 'iron', bevel=0)


def dwarven_brazier(b, cx, cy, z0, scale=1.0, tall=False):
    """Slender basalt-and-gold Dwarven brazier pedestal with iron bowl and sharp flickering fire tongues."""
    s = scale
    h_ped = (0.20 if tall else 0.11) * s
    z_base = max(0.0, z0 - 0.02 * s)
    r_ped = 0.048 * s
    b.box((cx - r_ped, cy - r_ped, z_base),
          (cx + r_ped, cy + r_ped, z0 + h_ped), 'stone_basalt', bevel=0)
    if detailed():
        b.box((cx - r_ped * 1.12, cy - r_ped * 1.12, z0 + h_ped - 0.024 * s),
              (cx + r_ped * 1.12, cy + r_ped * 1.12, z0 + h_ped + 0.005 * s), 'gold', bevel=0)
    r_bowl = 0.062 * s
    b.box((cx - r_bowl, cy - r_bowl, z0 + h_ped),
          (cx + r_bowl, cy + r_bowl, z0 + h_ped + 0.034 * s), 'iron', bevel=0)
    b.box((cx - r_ped, cy - r_ped, z0 + h_ped + 0.025 * s),
          (cx + r_ped, cy + r_ped, z0 + h_ped + 0.052 * s), 'firelight', bevel=0)
    b.blob((cx, cy, z0 + h_ped + 0.075 * s), 0.042 * s, 'glow',
           subdiv=1, squash=(0.75, 0.75, 1.85), jitter=0.25, seed=int(abs(cx * 100 + cy * 37)) + 11)
    if detailed():
        b.blob((cx + 0.018 * s, cy - 0.014 * s, z0 + h_ped + 0.065 * s), 0.028 * s, 'firelight',
               subdiv=1, squash=(0.7, 0.7, 1.6), jitter=0.2, seed=int(abs(cx * 73 + cy * 19)) + 17)


def dwarven_stair_flight(b, p_start, p_end, width=0.38, steps=8, cheek_walls=True,
                         braziers_bottom=False, braziers_top=False):
    """Carved stone flight of steps from `p_start = (x0, y0, z0)` to `p_end = (x1, y1, z1)`
    with grounded substructure, sunlit dressed-stone treads, and plumb basalt/gold cheek-walls."""
    p0 = Vector(p_start)
    p1 = Vector(p_end)
    horiz = Vector((p1.x - p0.x, p1.y - p0.y, 0.0))
    dist = horiz.length
    if dist < 0.05:
        return
    fwd = horiz.normalized()
    right = Vector((-fwd.y, fwd.x, 0.0))
    hw = width * 0.5

    n_steps = steps if detailed() else max(4, steps // 2)
    for i in range(n_steps):
        t0 = i / n_steps
        t1 = (i + 1.05) / n_steps
        z_step = p0.z + (p1.z - p0.z) * ((i + 1) / n_steps)
        z_bot = max(0.0, p0.z + (p1.z - p0.z) * (i / n_steps) - 0.10)
        c0 = p0 + horiz * t0
        c1 = p0 + horiz * t1
        pts_bot = [
            Vector((c0.x - right.x * hw, c0.y - right.y * hw, z_bot)),
            Vector((c0.x + right.x * hw, c0.y + right.y * hw, z_bot)),
            Vector((c1.x + right.x * hw, c1.y + right.y * hw, z_bot)),
            Vector((c1.x - right.x * hw, c1.y - right.y * hw, z_bot)),
        ]
        pts_top = [Vector((p.x, p.y, z_step)) for p in pts_bot]
        loft_rings(b, pts_bot, pts_top, 'stone_dressed',
                   cap_bot=True, cap_top=True, cap_mat='stone_dressed',
                   tone=0.92 + 0.04 * (i % 3))

    if cheek_walls:
        cw = 0.032
        for side in (-1, 1):
            off = right * (side * (hw + cw * 0.85))
            w0 = p0 + off
            w1 = p1 + off
            # Stepped horizontal basalt & dressed-stone cheek-balustrade blocks
            n_ch = max(3, n_steps // 2)
            for k in range(n_ch):
                t_a = k / n_ch
                t_b = (k + 1.02) / n_ch
                wa = w0.lerp(w1, t_a)
                wb = w0.lerp(w1, t_b)
                zb_blk = max(0.0, p0.z + (p1.z - p0.z) * t_a - 0.08)
                zt_blk = p0.z + (p1.z - p0.z) * ((k + 1) / n_ch) + 0.055
                b.beam((wa.x, wa.y, zb_blk), (wb.x, wb.y, zb_blk),
                       (0, 0, 1), (0.0, zt_blk - zb_blk), cw * 1.85, 'stone_basalt', bevel=0)
                b.beam((wa.x, wa.y, zt_blk), (wb.x, wb.y, zt_blk),
                       (0, 0, 1), (0.0, 0.018), cw * 2.05, 'stone_dressed', bevel=0)
            # Terminal newel piers at bottom and top
            b.box((w0.x - cw * 1.25, w0.y - cw * 1.25, max(0.0, p0.z - 0.05)),
                  (w0.x + cw * 1.25, w0.y + cw * 1.25, p0.z + 0.11), 'stone_basalt', bevel=0)
            b.box((w1.x - cw * 1.25, w1.y - cw * 1.25, max(0.0, p1.z - 0.05)),
                  (w1.x + cw * 1.25, w1.y + cw * 1.25, p1.z + 0.11), 'stone_basalt', bevel=0)
            if braziers_bottom:
                dwarven_brazier(b, w0.x, w0.y, p0.z + 0.11, scale=0.68)
            if braziers_top:
                dwarven_brazier(b, w1.x, w1.y, p1.z + 0.11, scale=0.68)


def viaduct_bridge(b, p0_xy, p1_xy, z_deck, z_ground=0.0, width=0.52,
                   arches=1, braziers=True):
    """Engineered Dwarven stone viaduct bridge with battered basalt piers, segmental arch
    openings underneath, sunlit paved roadway deck, gold frieze, and low crenellated parapets."""
    p0 = Vector((p0_xy[0], p0_xy[1], z_deck))
    p1 = Vector((p1_xy[0], p1_xy[1], z_deck))
    span_vec = p1 - p0
    length = span_vec.length
    if length < 0.1:
        return
    fwd = span_vec.normalized()
    right = Vector((-fwd.y, fwd.x, 0.0))
    hw = width * 0.5

    # Roadway deck slab, sunlit dressed-stone flagstone paving & gold cornice frieze
    b.beam((p0.x, p0.y, z_deck), (p1.x, p1.y, z_deck),
           (0, 0, 1), (-0.09, 0.0), width, 'stone_basalt', bevel=0)
    b.beam((p0.x, p0.y, z_deck), (p1.x, p1.y, z_deck),
           (0, 0, 1), (-0.002, 0.018), width * 0.88, 'stone_flag', bevel=0)
    if detailed():
        b.beam((p0.x, p0.y, z_deck), (p1.x, p1.y, z_deck),
               (0, 0, 1), (-0.052, -0.026), width * 1.04, 'gold', bevel=0)

    # Sleek side parapet curbs with low merlons
    pw = 0.056
    for side in (-1, 1):
        off = right * (side * (hw - pw * 0.45))
        s0, s1 = p0 + off, p1 + off
        b.beam((s0.x, s0.y, z_deck), (s1.x, s1.y, z_deck),
               (0, 0, 1), (0.0, 0.050), pw, 'stone_granite', bevel=0)
        b.beam((s0.x, s0.y, z_deck), (s1.x, s1.y, z_deck),
               (0, 0, 1), (0.048, 0.064), pw * 1.15, 'stone_dressed', bevel=0)
        if detailed():
            n_m = max(2, int(length / 0.26))
            for m_i in range(n_m):
                mt0 = (m_i + 0.18) / n_m
                mt1 = (m_i + 0.68) / n_m
                mp0 = s0.lerp(s1, mt0)
                mp1 = s0.lerp(s1, mt1)
                b.beam((mp0.x, mp0.y, z_deck), (mp1.x, mp1.y, z_deck),
                       (0, 0, 1), (0.062, 0.088), pw, 'stone_dressed', bevel=0)

    # Supporting piers & arch spandrels underneath
    n_arches = max(1, arches)
    pier_h = max(0.05, z_deck - z_ground)
    for k in range(n_arches + 1):
        t = k / n_arches
        pier_c = p0.lerp(p1, t)
        pw_x = 0.075
        b.beam((pier_c.x - fwd.x * pw_x, pier_c.y - fwd.y * pw_x, z_ground),
               (pier_c.x + fwd.x * pw_x, pier_c.y + fwd.y * pw_x, z_ground),
               (0, 0, 1), (0.0, pier_h), width * 0.94, 'stone_basalt', bevel=0)
        if detailed() and pier_h > 0.25:
            b.beam((pier_c.x - fwd.x * (pw_x * 0.42), pier_c.y - fwd.y * (pw_x * 0.42), z_ground),
                   (pier_c.x + fwd.x * (pw_x * 0.42), pier_c.y + fwd.y * (pw_x * 0.42), z_ground),
                   (0, 0, 1), (0.06, pier_h - 0.08), width * 0.99, 'gold', bevel=0)
        if braziers and (k == 0 or k == n_arches):
            for side in (-1, 1):
                bc = pier_c + right * (side * (hw - 0.035))
                dwarven_brazier(b, bc.x, bc.y, z_deck + 0.065, scale=0.72)

    # Corbelled arch shoulders under each span
    if detailed() and pier_h > 0.25:
        for k in range(n_arches):
            a_start = p0.lerp(p1, (k + 0.12) / n_arches)
            a_end = p0.lerp(p1, (k + 0.88) / n_arches)
            a_mid1 = a_start.lerp(a_end, 0.30)
            a_mid2 = a_start.lerp(a_end, 0.70)
            b.beam((a_start.x, a_start.y, z_deck - 0.24),
                   (a_mid1.x, a_mid1.y, z_deck - 0.10),
                   (0, 0, 1), (-0.045, 0.045), width * 0.86, 'stone_granite', bevel=0)
            b.beam((a_mid2.x, a_mid2.y, z_deck - 0.10),
                   (a_end.x, a_end.y, z_deck - 0.24),
                   (0, 0, 1), (-0.045, 0.045), width * 0.86, 'stone_granite', bevel=0)


def cliff_portal_alcove(b, cx, cy, z0, yaw=0.0, width=0.38, height=0.48):
    """Recessed firelit Vondari Dwarven cliff doorway/shrine alcove with basalt jambs,
    corbelled lintel, gold rune frame, and warm glowing hearth interior."""
    c_y, s_y = math.cos(yaw), math.sin(yaw)
    fwd = Vector((s_y, -c_y, 0.0))   # Outward normal (default yaw=0 faces -Y)
    right = Vector((c_y, s_y, 0.0))
    origin = Vector((cx, cy, z0))
    hw = width * 0.5

    # Basalt back housing & threshold
    p_L = origin - right * hw
    p_R = origin + right * hw
    b.beam((p_L.x, p_L.y, max(0.0, z0 - 0.03)), (p_R.x, p_R.y, max(0.0, z0 - 0.03)),
           (0, 0, 1), (0.0, height + 0.06), 0.18, 'stone_basalt', bevel=0)
    # Glowing interior firelight & core glow
    g_L = origin - right * (hw * 0.66) + fwd * 0.06
    g_R = origin + right * (hw * 0.66) + fwd * 0.06
    b.beam((g_L.x, g_L.y, z0 + 0.02), (g_R.x, g_R.y, z0 + 0.02),
           (0, 0, 1), (0.0, height * 0.80), 0.07, 'firelight', bevel=0)
    c_L = origin - right * (hw * 0.40) + fwd * 0.08
    c_R = origin + right * (hw * 0.40) + fwd * 0.08
    b.beam((c_L.x, c_L.y, z0 + 0.03), (c_R.x, c_R.y, z0 + 0.03),
           (0, 0, 1), (0.0, height * 0.64), 0.05, 'glow', bevel=0)

    # Flanking basalt & gold jamb pillars + lintel
    for side in (-1, 1):
        jp = origin + right * (side * (hw * 0.84)) + fwd * 0.06
        b.box((jp.x - 0.042, jp.y - 0.042, max(0.0, z0 - 0.02)),
              (jp.x + 0.042, jp.y + 0.042, z0 + height), 'stone_basalt', bevel=0)
        if detailed():
            gp = jp + fwd * 0.022
            b.box((gp.x - 0.018, gp.y - 0.018, z0 + 0.04),
                  (gp.x + 0.018, gp.y + 0.018, z0 + height - 0.04), 'gold', bevel=0)
    # Corbelled lintel cap
    l_L = origin - right * (hw * 1.10) + fwd * 0.06
    l_R = origin + right * (hw * 1.10) + fwd * 0.06
    b.beam((l_L.x, l_L.y, z0 + height - 0.045), (l_R.x, l_R.y, z0 + height - 0.045),
           (0, 0, 1), (0.0, 0.078), 0.124, 'stone_basalt', bevel=0)
    if detailed():
        b.beam((l_L.x, l_L.y, z0 + height - 0.015), (l_R.x, l_R.y, z0 + height - 0.015),
               (0, 0, 1), (0.0, 0.022), 0.136, 'gold', bevel=0)


def summit_citadel_hall(b, cx, cy, z0, height=0.62, rx=0.60, ry=0.54, seed=1,
                        door_yaws=(0.0, math.pi * 0.5)):
    """Polygonal Vondari Dwarven Summit Citadel Hall (as on the right peak of Stonehold_Twin_Outcrop):
    - Octagonal coursed granite & dressed-stone walls
    - 8 slender projecting basalt corner pilaster buttresses inlaid with vertical gold strips
    - Recessed glowing portals on `door_yaws`
    - Stepped octagonal stone roof deck with radial stone ribs, gold frieze, and crenellated parapet.
    """
    sides = 8
    angles = [2 * math.pi * i / sides + math.pi / sides for i in range(sides)]
    radii = [1.0] * sides

    # 1. Stepped octagonal plinth base
    p_bot = ring_pts(cx, cy, z0 - 0.03, rx * 1.06, ry * 1.06, angles, radii)
    p_top = ring_pts(cx, cy, z0 + 0.06, rx * 1.02, ry * 1.02, angles, radii)
    loft_rings(b, p_bot, p_top, 'stone_basalt', cap_bot=True, cap_top=True, cap_mat='stone_dressed', tone=0.86)

    # 2. Main octagonal granite citadel walls
    w_bot = ring_pts(cx, cy, z0 + 0.05, rx * 0.94, ry * 0.94, angles, radii)
    w_top = ring_pts(cx, cy, z0 + height * 0.78, rx * 0.90, ry * 0.90, angles, radii)
    loft_rings(b, w_bot, w_top, 'stone_granite', cap_bot=False, cap_top=True, cap_mat='stone_dressed', tone=0.96)

    # Upper cornice & gold band
    c_bot = ring_pts(cx, cy, z0 + height * 0.74, rx * 0.96, ry * 0.96, angles, radii)
    c_top = ring_pts(cx, cy, z0 + height * 0.83, rx * 0.98, ry * 0.98, angles, radii)
    loft_rings(b, c_bot, c_top, 'stone_basalt', cap_bot=False, cap_top=True, cap_mat='stone_dressed', tone=0.84)
    if detailed():
        g_bot = ring_pts(cx, cy, z0 + height * 0.77, rx * 0.985, ry * 0.985, angles, radii)
        g_top = ring_pts(cx, cy, z0 + height * 0.805, rx * 0.99, ry * 0.99, angles, radii)
        loft_rings(b, g_bot, g_top, 'gold', cap_bot=False, cap_top=False, tone=0.90)

    # 3. Eight corner pilaster buttresses with vertical gold inlays + roof parapet
    for i in range(sides):
        j = (i + 1) % sides
        v0 = w_bot[i]
        ang = angles[i]
        bw = 0.046
        b.box((v0.x - bw, v0.y - bw, z0),
              (v0.x + bw, v0.y + bw, z0 + height * 0.92), 'stone_basalt', bevel=0)
        if detailed():
            gx = v0.x + math.cos(ang) * (bw * 0.52)
            gy = v0.y + math.sin(ang) * (bw * 0.52)
            b.box((gx - bw * 0.36, gy - bw * 0.36, z0 + 0.06),
                  (gx + bw * 0.36, gy + bw * 0.36, z0 + height * 0.86), 'gold', bevel=0)
        # Roof parapet wall between corner buttresses
        rt0, rt1 = c_top[i], c_top[j]
        b.beam((rt0.x, rt0.y, z0 + height * 0.82), (rt1.x, rt1.y, z0 + height * 0.82),
               (0, 0, 1), (0.0, height * 0.09), 0.058, 'stone_granite', bevel=0)

    # 4. Stepped inner octagonal roof crown with radial stone ribs
    r2_bot = ring_pts(cx, cy, z0 + height * 0.82, rx * 0.72, ry * 0.72, angles, radii)
    r2_top = ring_pts(cx, cy, z0 + height * 0.94, rx * 0.66, ry * 0.66, angles, radii)
    loft_rings(b, r2_bot, r2_top, 'stone_basalt', cap_bot=False, cap_top=True, cap_mat='stone_dressed', tone=0.90)
    if detailed():
        for i in range(sides):
            p_in = Vector((cx + rx * 0.28 * math.cos(angles[i]), cy + ry * 0.28 * math.sin(angles[i]), z0 + height * 0.94))
            p_out = r2_top[i]
            b.beam((p_in.x, p_in.y, z0 + height * 0.93), (p_out.x, p_out.y, z0 + height * 0.93),
                   (0, 0, 1), (0.0, 0.032), 0.044, 'stone_basalt', bevel=0)
    r3_bot = ring_pts(cx, cy, z0 + height * 0.93, rx * 0.32, ry * 0.32, angles, radii)
    r3_top = ring_pts(cx, cy, z0 + height * 1.06, rx * 0.26, ry * 0.26, angles, radii)
    loft_rings(b, r3_bot, r3_top, 'stone_basalt', cap_bot=False, cap_top=True, cap_mat='stone_dressed', tone=0.88)

    # 5. Recessed glowing portals on specified door_yaws
    for dyaw in door_yaws:
        px = cx + math.sin(dyaw) * (rx * 0.92)
        py = cy - math.cos(dyaw) * (ry * 0.92)
        cliff_portal_alcove(b, px, py, z0 + 0.05, yaw=dyaw, width=0.26, height=height * 0.56)


def summit_beacon_fort(b, cx, cy, z0, height=0.34, radius=0.50, seed=1):
    """Octagonal fortified stone signal-beacon platform (as on the left peak of Stonehold_Twin_Outcrop):
    - Battered octagonal dressed-stone & granite bastion walls with slender gold-inlaid corner buttresses
    - Low crenellated stone parapet ring
    - Central raised circular stone fire-altar with crossed logs, embers, and multi-tongued signal fire!
    """
    sides = 8
    angles = [2 * math.pi * i / sides + math.pi / sides for i in range(sides)]
    radii = [1.0] * sides

    bot = ring_pts(cx, cy, z0 - 0.03, radius * 1.05, radius * 1.05, angles, radii)
    top = ring_pts(cx, cy, z0 + height, radius * 0.96, radius * 0.96, angles, radii)
    loft_rings(b, bot, top, 'stone_granite', cap_bot=True, cap_top=True, cap_mat='stone_dressed', tone=0.95)

    if detailed():
        g_bot = ring_pts(cx, cy, z0 + height - 0.042, radius * 0.975, radius * 0.975, angles, radii)
        g_top = ring_pts(cx, cy, z0 + height - 0.016, radius * 0.98, radius * 0.98, angles, radii)
        loft_rings(b, g_bot, g_top, 'gold', cap_bot=False, cap_top=False, tone=0.90)

    for i in range(sides):
        j = (i + 1) % sides
        p0, p1 = top[i], top[j]
        ang = angles[i]
        bw = 0.042
        b.box((p0.x - bw, p0.y - bw, z0),
              (p0.x + bw, p0.y + bw, z0 + height + 0.085), 'stone_basalt', bevel=0)
        if detailed():
            gx = p0.x + math.cos(ang) * (bw * 0.52)
            gy = p0.y + math.sin(ang) * (bw * 0.52)
            b.box((gx - bw * 0.36, gy - bw * 0.36, z0 + 0.05),
                  (gx + bw * 0.36, gy + bw * 0.36, z0 + height + 0.055), 'gold', bevel=0)
        # Low parapet curb (leave front facet open for summit steps)
        mid_a = math.atan2(0.5 * (p0.y + p1.y) - cy, 0.5 * (p0.x + p1.x) - cx)
        if abs(mid_a + math.pi * 0.5) > 0.42:
            b.beam((p0.x, p0.y, z0 + height), (p1.x, p1.y, z0 + height),
                   (0, 0, 1), (0.0, 0.050), 0.054, 'stone_granite', bevel=0)

    # Central circular stepped fire-ring & roaring signal fire
    z_deck = z0 + height
    r_pit = radius * 0.46
    pit_bot = ring_pts(cx, cy, z_deck - 0.01, r_pit * 1.12, r_pit * 1.12, angles, radii)
    pit_top = ring_pts(cx, cy, z_deck + 0.085, r_pit, r_pit, angles, radii)
    loft_rings(b, pit_bot, pit_top, 'stone_basalt', cap_bot=False, cap_top=True, cap_mat='firelight', tone=0.84)
    if detailed():
        for k in range(8):
            a = 2 * math.pi * k / 8
            mx = cx + r_pit * 0.96 * math.cos(a)
            my = cy + r_pit * 0.96 * math.sin(a)
            b.box((mx - 0.032, my - 0.032, z_deck + 0.07),
                  (mx + 0.032, my + 0.032, z_deck + 0.13), 'stone_dressed', bevel=0)
        # Crossed timber fire logs
        for k in range(3):
            a = math.pi * k / 3 + 0.2
            lx = r_pit * 0.62 * math.cos(a)
            ly = r_pit * 0.62 * math.sin(a)
            b.beam((cx - lx, cy - ly, z_deck + 0.06),
                   (cx + lx, cy + ly, z_deck + 0.14),
                   (0, 0, 1), (-0.024, 0.024), 0.048, 'bark', bevel=0)
    # Multi-tongued roaring signal fire (warm ember base + sharp flickering tongues)
    b.blob((cx, cy, z_deck + 0.14), r_pit * 0.48, 'firelight',
           subdiv=1, squash=(1.0, 1.0, 1.1), jitter=0.25, seed=seed + 300)
    b.blob((cx, cy, z_deck + 0.20), r_pit * 0.36, 'glow',
           subdiv=1, squash=(0.72, 0.72, 1.95), jitter=0.28, seed=seed + 301)
    if detailed():
        for k, (ox, oy, sc) in enumerate((
            (-0.045, -0.03, 0.28),
            (0.045, 0.025, 0.26),
            (0.0, 0.048, 0.25),
            (-0.02, 0.035, 0.22),
        )):
            b.blob((cx + ox, cy + oy, z_deck + 0.18), r_pit * sc, 'glow',
                   subdiv=1, squash=(0.68, 0.68, 2.0), jitter=0.25, seed=seed + 310 + k)


def vondari_cliff_banner(b, cx, cy, z_top, yaw=0.0, height=0.58, width=0.22):
    """Vertical navy-blue & gold Vondari Dwarven cliff banner with bronze crossbar,
    gold borders, swallowtail/chevron tip, and geometric gold diamond-mountain emblem."""
    c_y, s_y = math.cos(yaw), math.sin(yaw)
    fwd = Vector((s_y, -c_y, 0.0))   # Outward normal (yaw=0 faces -Y)
    right = Vector((c_y, s_y, 0.0))
    hw = width * 0.5
    top_c = Vector((cx, cy, z_top)) + fwd * 0.04

    # Bronze crossbar & gold finials
    bar_L = top_c - right * (hw * 1.18)
    bar_R = top_c + right * (hw * 1.18)
    b.beam((bar_L.x, bar_L.y, z_top), (bar_R.x, bar_R.y, z_top),
           (0, 0, 1), (-0.014, 0.014), 0.028, 'bronze', bevel=0)
    b.box((bar_L.x - 0.020, bar_L.y - 0.020, z_top - 0.008),
          (bar_L.x + 0.020, bar_L.y + 0.020, z_top + 0.032), 'gold', bevel=0)
    b.box((bar_R.x - 0.020, bar_R.y - 0.020, z_top - 0.008),
          (bar_R.x + 0.020, bar_R.y + 0.020, z_top + 0.032), 'gold', bevel=0)

    # Navy cloth body with pointed chevron bottom
    z_mid = z_top - height * 0.78
    z_tip = z_top - height
    p_tl = top_c - right * hw
    p_tr = top_c + right * hw
    p_bl = Vector((p_tl.x, p_tl.y, z_mid))
    p_br = Vector((p_tr.x, p_tr.y, z_mid))
    p_tip = Vector((top_c.x, top_c.y, z_tip))

    thick = fwd * 0.022
    b.extrude([p_tl, p_tr, p_br, p_tip, p_bl], thick, 'cloth_blue')

    if detailed():
        # Gold edge borders (use `fwd` as side_axis so steep lines in banner plane never become degenerate)
        bw = 0.013
        b.box((p_tl.x - bw, p_tl.y - bw, z_mid), (p_tl.x + bw, p_tl.y + bw, z_top), 'gold', bevel=0)
        b.box((p_tr.x - bw, p_tr.y - bw, z_mid), (p_tr.x + bw, p_tr.y + bw, z_top), 'gold', bevel=0)
        b.beam((p_bl.x, p_bl.y, z_mid), (p_tip.x, p_tip.y, z_tip),
               fwd, (-0.004, 0.026), 0.024, 'gold', bevel=0)
        b.beam((p_br.x, p_br.y, z_mid), (p_tip.x, p_tip.y, z_tip),
               fwd, (-0.004, 0.026), 0.024, 'gold', bevel=0)

        # Central geometric gold Vondari diamond & mountain chevron emblem
        emb_c = top_c + fwd * 0.016 + Vector((0, 0, -height * 0.44))
        dr = hw * 0.56
        dz = height * 0.17
        d_top = emb_c + Vector((0, 0, dz))
        d_bot = emb_c - Vector((0, 0, dz))
        d_L = emb_c - right * dr
        d_R = emb_c + right * dr
        for a_pt, b_pt in ((d_top, d_R), (d_R, d_bot), (d_bot, d_L), (d_L, d_top),
                           (d_L + Vector((0, 0, -dz * 0.3)), emb_c + Vector((0, 0, dz * 0.35))),
                           (emb_c + Vector((0, 0, dz * 0.35)), d_R + Vector((0, 0, -dz * 0.3)))):
            b.beam((a_pt.x, a_pt.y, a_pt.z), (b_pt.x, b_pt.y, b_pt.z),
                   fwd, (-0.004, 0.014), 0.018, 'gold', bevel=0)


def cliff_scaffolding_crane(b, cx, cy, z_base, z_deck, yaw=0.0, scale=1.0, has_crane=True):
    """Cliff-hugging timber scaffolding frame topped by a raking timber-and-iron ore crane
    with pulley wheel, rigging cables, and a suspended iron-bound ore bucket hanging in mid-air."""
    s = scale
    c_y, s_y = math.cos(yaw), math.sin(yaw)
    fwd = Vector((s_y, -c_y, 0.0))   # Outward over the cliff
    right = Vector((c_y, s_y, 0.0))
    origin = Vector((cx, cy, 0.0))

    hw = 0.22 * s
    hd = 0.18 * s
    z0 = max(0.0, z_base)
    corners = [
        origin - right * hw - fwd * hd,
        origin + right * hw - fwd * hd,
        origin + right * hw + fwd * hd,
        origin - right * hw + fwd * hd,
    ]
    for cp in corners:
        b.box((cp.x - 0.024 * s, cp.y - 0.024 * s, z0),
              (cp.x + 0.024 * s, cp.y + 0.024 * s, z_deck + 0.04 * s), 'timber_dark', bevel=0)

    n_tiers = max(1, int((z_deck - z0) / (0.28 * s)))
    for k in range(n_tiers + 1):
        zt = z0 + (z_deck - z0) * (k / max(1, n_tiers))
        for i in range(4):
            pA, pB = corners[i], corners[(i + 1) % 4]
            b.beam((pA.x, pA.y, zt), (pB.x, pB.y, zt),
                   (0, 0, 1), (-0.016 * s, 0.016 * s), 0.030 * s, 'timber_dark', bevel=0)
        if detailed() and k < n_tiers:
            zt_next = z0 + (z_deck - z0) * ((k + 1) / max(1, n_tiers))
            pF0, pF1 = corners[3], corners[2]
            b.beam((pF0.x, pF0.y, zt), (pF1.x, pF1.y, zt_next),
                   fwd, (-0.012 * s, 0.012 * s), 0.024 * s, 'timber_dark', bevel=0)
            b.beam((pF1.x, pF1.y, zt), (pF0.x, pF0.y, zt_next),
                   fwd, (-0.012 * s, 0.012 * s), 0.024 * s, 'timber_dark', bevel=0)

    # Top planked work deck
    b.box((cx - hw * 1.1, cy - hw * 1.1, z_deck - 0.018 * s),
          (cx + hw * 1.1, cy + hw * 1.1, z_deck + 0.028 * s), 'planks', bevel=0)

    if not has_crane:
        return

    # Crane mast & raking jib boom extending outward along `fwd`
    mast_h = 0.66 * s
    b.box((cx - 0.036 * s, cy - 0.036 * s, z_deck),
          (cx + 0.036 * s, cy + 0.036 * s, z_deck + mast_h), 'timber_dark', bevel=0)
    b.box((cx - 0.045 * s, cy - 0.045 * s, z_deck + mast_h * 0.88),
          (cx + 0.045 * s, cy + 0.045 * s, z_deck + mast_h * 0.96), 'iron', bevel=0)

    jib_tip = Vector((cx, cy, z_deck + mast_h * 0.92)) + fwd * (0.64 * s)
    b.beam((cx, cy, z_deck + mast_h * 0.32), (jib_tip.x, jib_tip.y, jib_tip.z),
           (0, 0, 1), (-0.024 * s, 0.024 * s), 0.044 * s, 'timber_dark', bevel=0)
    b.beam((cx, cy, z_deck + mast_h * 0.95), (jib_tip.x, jib_tip.y, jib_tip.z + 0.02 * s),
           (0, 0, 1), (-0.010 * s, 0.010 * s), 0.018 * s, 'rope', bevel=0)
    b.box((jib_tip.x - 0.038 * s, jib_tip.y - 0.038 * s, jib_tip.z - 0.045 * s),
          (jib_tip.x + 0.038 * s, jib_tip.y + 0.038 * s, jib_tip.z + 0.038 * s), 'iron', bevel=0)

    # Vertical hoist cable & suspended iron-bound ore bucket
    bucket_z = z_deck - 0.14 * s
    b.box((jib_tip.x - 0.008 * s, jib_tip.y - 0.008 * s, bucket_z + 0.12 * s),
          (jib_tip.x + 0.008 * s, jib_tip.y + 0.008 * s, jib_tip.z - 0.04 * s), 'rope', bevel=0)

    br = 0.072 * s
    bh = 0.125 * s
    b.box((jib_tip.x - br, jib_tip.y - br, bucket_z),
          (jib_tip.x + br, jib_tip.y + br, bucket_z + bh), 'timber_dark', bevel=0)
    b.box((jib_tip.x - br * 1.08, jib_tip.y - br * 1.08, bucket_z + bh * 0.15),
          (jib_tip.x + br * 1.08, jib_tip.y + br * 1.08, bucket_z + bh * 0.32), 'iron', bevel=0)
    b.box((jib_tip.x - br * 1.08, jib_tip.y - br * 1.08, bucket_z + bh * 0.72),
          (jib_tip.x + br * 1.08, jib_tip.y + br * 1.08, bucket_z + bh * 0.88), 'iron', bevel=0)
    if detailed():
        b.blob((jib_tip.x, jib_tip.y, bucket_z + bh * 0.95), br * 0.72, 'gold',
               subdiv=1, squash=(1.0, 1.0, 0.55), jitter=0.25, seed=91)


def work_tent(b, cx, cy, z0, yaw=0.0, w=0.36, d=0.28, h=0.25):
    """Pitched canvas work awning on 4 timber poles with a work table & crate underneath."""
    c_y, s_y = math.cos(yaw), math.sin(yaw)
    fwd = Vector((s_y, -c_y, 0.0))
    right = Vector((c_y, s_y, 0.0))
    origin = Vector((cx, cy, z0))
    hw, hd = w * 0.5, d * 0.5

    poles = [
        (origin - right * hw - fwd * hd, h * 1.08),
        (origin + right * hw - fwd * hd, h * 1.08),
        (origin + right * hw + fwd * hd, h * 0.80),
        (origin - right * hw + fwd * hd, h * 0.80),
    ]
    for pp, ph in poles:
        b.box((pp.x - 0.015, pp.y - 0.015, max(0.0, z0 - 0.01)),
              (pp.x + 0.015, pp.y + 0.015, z0 + ph), 'timber_dark', bevel=0)

    p0 = Vector((poles[0][0].x, poles[0][0].y, z0 + poles[0][1]))
    p1 = Vector((poles[1][0].x, poles[1][0].y, z0 + poles[1][1]))
    p2 = Vector((poles[2][0].x, poles[2][0].y, z0 + poles[2][1]))
    p3 = Vector((poles[3][0].x, poles[3][0].y, z0 + poles[3][1]))
    b.extrude([p0, p1, p2, p3], (0, 0, 0.020), 'cloth_cream')
    if detailed():
        c_pos = origin - right * (hw * 0.35)
        b.box((c_pos.x - 0.048, c_pos.y - 0.048, z0),
              (c_pos.x + 0.048, c_pos.y + 0.048, z0 + 0.085), 'timber', bevel=0)
        b_pos = origin + right * (hw * 0.38)
        b.box((b_pos.x - 0.040, b_pos.y - 0.040, z0),
              (b_pos.x + 0.040, b_pos.y + 0.040, z0 + 0.095), 'timber_dark', bevel=0)


def cargo_cluster(b, cx, cy, z0, yaw=0.0, seed=1, scale=1.0):
    """Cluster of miniature wooden crates, iron-bound barrels, and ore sacks on a terrace."""
    if not detailed():
        return
    s = scale
    c_y, s_y = math.cos(yaw), math.sin(yaw)
    right = Vector((c_y, s_y, 0.0))
    fwd = Vector((s_y, -c_y, 0.0))
    origin = Vector((cx, cy, z0))

    c1 = origin - right * (0.068 * s)
    b.box((c1.x - 0.052 * s, c1.y - 0.052 * s, z0),
          (c1.x + 0.052 * s, c1.y + 0.052 * s, z0 + 0.088 * s), 'timber', bevel=0)
    b.box((c1.x - 0.038 * s, c1.y - 0.038 * s, z0 + 0.086 * s),
          (c1.x + 0.038 * s, c1.y + 0.038 * s, z0 + 0.155 * s), 'timber_dark', bevel=0)
    for bx_off, by_off in ((0.062 * s, -0.018 * s), (0.032 * s, 0.062 * s)):
        bp = origin + right * bx_off + fwd * by_off
        b.box((bp.x - 0.040 * s, bp.y - 0.040 * s, z0),
              (bp.x + 0.040 * s, bp.y + 0.040 * s, z0 + 0.098 * s), 'timber_dark', bevel=0)
        b.box((bp.x - 0.043 * s, bp.y - 0.043 * s, z0 + 0.064 * s),
              (bp.x + 0.043 * s, bp.y + 0.043 * s, z0 + 0.078 * s), 'iron', bevel=0)


def waterfall_cascade(b, p_top, p_bot, width=0.26, seed=1):
    """Cascading mountain waterfall with stepped wet rock chute, continuous whitewater
    (`ice` & `snow`) foam ribbons, and a rocky splash pool at the base."""
    p0 = Vector(p_top)
    p1 = Vector(p_bot)

    segs = 5 if detailed() else 3
    # Interior points wander sideways so the fall follows the crag instead of a ruler line.
    wrng = random.Random(seed + 7)
    pts = [p0.lerp(p1, k / segs) + (Vector((wrng.uniform(-1, 1), wrng.uniform(-1, 1), 0.0)) * width * 0.08
                                    if 0 < k < segs else Vector()) for k in range(segs + 1)]
    for k in range(segs):
        c0, c1 = pts[k], pts[k + 1]
        # Note: in b.beam(..., (0,0,1), side_range, width, mat),
        # `side_range` is vertical thickness and `width` is horizontal chute width!
        b.beam((c0.x, c0.y, c0.z), (c1.x, c1.y, c1.z),
               (0, 0, 1), (-0.035, 0.0), width * 1.15, 'rock_cliff', bevel=0)
        b.beam((c0.x, c0.y, c0.z), (c1.x, c1.y, c1.z),
               (0, 0, 1), (0.0, 0.024), width * 0.88, 'ice', bevel=0)
        # Thin foam streaks over the sheet; stacked blobs read as snowmen, not water.
        for off in ((-0.24, 0.20) if detailed() else (0.0,)):
            sx, sy = c1.y - c0.y, c0.x - c1.x
            ln = math.hypot(sx, sy) or 1.0
            ox, oy = sx / ln * width * off, sy / ln * width * off
            b.beam((c0.x + ox, c0.y + oy, c0.z), (c1.x + ox, c1.y + oy, c1.z),
                   (0, 0, 1), (0.024, 0.030), width * 0.16, 'snow', bevel=0)

    # Splash pool & wet boulders at base
    crag_block(b, p1.x, p1.y, 0.0, 0.038, width * 1.45, width * 1.25,
               seed=seed + 80, sides=8, mat='rock_cliff', cap_mat='water',
               batter=0.95, chamfer=0.0, tone=0.72)
    if detailed():
        b.blob((p1.x, p1.y, 0.040), width * 0.50, 'snow',
               subdiv=1, squash=(1.4, 1.4, 0.18), jitter=0.25, seed=seed + 88)
        rng = random.Random(seed + 90)
        for i in range(4):
            a = math.pi * (0.9 + 0.42 * i)
            bx = p1.x + width * 1.20 * math.cos(a)
            by = p1.y + width * 1.10 * math.sin(a)
            crag_block(b, bx, by, 0.0, rng.uniform(0.06, 0.11),
                       rng.uniform(0.07, 0.11), rng.uniform(0.06, 0.10),
                       seed=seed + 100 + i, sides=5, mat='rock_cliff', cap_mat='rock_cliff',
                       batter=0.82, chamfer=0.0, tone=rng.uniform(0.68, 0.88))


def mini_pine(b, cx, cy, z0, height=0.38, seed=1):
    """Miniature gnarled alpine conifer (`foliage_pine` + `bark`) tucked into rock shelves."""
    rng = random.Random(seed)
    m_base = Matrix.Translation((cx, cy, max(0.0, z0 - 0.02)))
    b.lathe([(0.028, 0.0), (0.018, height * 0.55), (0.008, height * 0.92)], 5, 'bark', m=m_base)
    tiers = 3 if detailed() else 2
    for k in range(tiers):
        t = k / max(1, tiers - 1)
        z_t = height * (0.24 + 0.52 * t)
        r = height * 0.36 * (1.0 - 0.58 * t) * rng.uniform(0.9, 1.1)
        th = height * 0.38 * (1.0 - 0.3 * t)
        b.lathe([(0.0, z_t + th), (r * 0.85, z_t - 0.02), (r, z_t - 0.04), (0.0, z_t + 0.04)],
                7 if detailed() else 5, 'foliage_pine', m=m_base, smooth=False)


def moss_tuft(b, cx, cy, z0, radius=0.12, seed=1):
    """Alpine moss & lichen cushion tucked into crag crevices."""
    if not detailed():
        return
    b.blob((cx, cy, z0 + radius * 0.22), radius, 'grass_upland',
           subdiv=1, squash=(1.2, 1.0, 0.42), jitter=0.25, seed=seed)
    b.blob((cx + radius * 0.35, cy - radius * 0.2, z0 + radius * 0.25), radius * 0.68, 'foliage',
           subdiv=1, squash=(1.0, 1.1, 0.48), jitter=0.25, seed=seed + 1)
