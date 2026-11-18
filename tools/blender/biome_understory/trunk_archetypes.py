"""Specialized sculpted archetypes for the 12 forest trunks, stumps, rootwads & fallen logs."""
import math

from mathutils import Vector

from flora_archetypes import (
    U_ACCENT,
    U_BARK,
    U_FOLIAGE,
    U_SOIL,
    V_ACCENT,
    V_BARK,
    V_FOLIAGE,
    V_SOIL,
    _quad_blade,
)
from understory_common import leaf_spray_fan, mushroom_dome, rock_chunk, tube


def _root_flare_ring(bm, uv, rng, count, base_r, h_attach, reach, z_drop=0.0):
    """Radiate gnarled buttress root claws down into the surrounding forest soil."""
    for k in range(count):
        a = (k / max(count, 1)) * math.tau + rng.uniform(-0.22, 0.22)
        p0 = Vector((math.cos(a) * base_r * 0.55, math.sin(a) * base_r * 0.55, h_attach * rng.uniform(0.75, 1.15)))
        p1 = Vector((math.cos(a + 0.10) * reach * 0.58, math.sin(a + 0.10) * reach * 0.58, h_attach * 0.32))
        p2 = Vector((math.cos(a + 0.18) * reach, math.sin(a + 0.18) * reach, z_drop))
        tube(bm, uv, [p0, p1, p2], [base_r * 0.44, base_r * 0.24, base_r * 0.08], sides=6, u_range=U_BARK, v_range=V_BARK)


def _shelf_fungi_clusters(bm, uv, positions, rng, base_size=0.085):
    """Attach tiered turkey-tail / artist-conk bracket shelves onto rotting wood."""
    for pos, outward in positions:
        n = outward.normalized()
        for tier in range(2):
            off = n * (0.02 + 0.015 * tier) + Vector((0.0, 0.0, 0.032 * tier))
            mushroom_dome(
                bm,
                uv,
                pos + off,
                base_size * rng.uniform(0.85, 1.25) * (1.0 - 0.22 * tier),
                base_size * 0.28,
                sides=8,
                u_range=U_ACCENT,
                v_range=V_ACCENT,
            )


def _moss_cushions(bm, uv, positions, rng, scale=0.14):
    """Drape organic velvety moss bolsters across shaded bark and log ridges."""
    for pos, radii in positions:
        rock_chunk(
            bm,
            uv,
            pos,
            Vector(radii) * (scale * rng.uniform(0.85, 1.25)),
            u_range=U_FOLIAGE,
            v_range=V_FOLIAGE,
            subdivisions=2,
            rng=rng,
            dome=True,
        )


def build_forest_trunk_archetype(bm, uv, rng, trunk_id, length_or_h, kind, radius=0.22):
    """Build distinct hero silhouettes for every forest trunk, stump, rootwad, and fallen log."""
    tid = (trunk_id or '').lower()

    if tid == 'stump-jagged':
        h = max(0.68, length_or_h * 0.85)
        r = max(0.24, radius)
        tube(
            bm,
            uv,
            [Vector((0, 0, -0.02)), Vector((0.02, -0.01, h * 0.28)), Vector((-0.02, 0.02, h * 0.68))],
            [r * 1.65, r * 1.08, r * 0.88],
            sides=11,
            u_range=U_BARK,
            v_range=V_BARK,
            flute_count=9,
            flute_depth=0.18,
            rough=0.06,
            rng=rng,
        )
        rock_chunk(bm, uv, Vector((0, 0, h * 0.62)), Vector((r * 0.56, r * 0.52, h * 0.14)), u_range=U_ACCENT, v_range=V_ACCENT, subdivisions=2, rng=rng, dome=True)
        for s in range(7):
            a = (s / 7.0) * math.tau + rng.uniform(-0.18, 0.18)
            sp_h = h * rng.uniform(0.22, 0.54)
            p0 = Vector((math.cos(a) * r * 0.72, math.sin(a) * r * 0.72, h * 0.58))
            p1 = p0 + Vector((math.cos(a) * r * 0.18, math.sin(a) * r * 0.18, sp_h))
            tube(bm, uv, [p0, p1], [r * 0.24, r * 0.04], sides=5, u_range=U_ACCENT if s % 2 else U_BARK, v_range=V_ACCENT if s % 2 else V_BARK, scale_y=0.45)
        _root_flare_ring(bm, uv, rng, 6, r, h * 0.36, r * 2.55)
        _shelf_fungi_clusters(bm, uv, [(Vector((math.cos(i * 1.9) * r * 0.92, math.sin(i * 1.9) * r * 0.92, h * (0.28 + 0.10 * i))), Vector((math.cos(i * 1.9), math.sin(i * 1.9), 0))) for i in range(3)], rng)
        return

    if tid == 'stump-hollow':
        h = max(0.68, length_or_h * 0.85)
        r = max(0.26, radius)
        # C-shaped hollow bark rim wrapping dark rotted core pocket
        for arc0, arc1 in ((0.45, 3.05), (3.15, 5.75)):
            segs = 5
            pts = []
            rads = []
            for k in range(segs):
                t = k / (segs - 1)
                a = arc0 + (arc1 - arc0) * t
                pts.append(Vector((math.cos(a) * r * 0.82, math.sin(a) * r * 0.82, h * (0.04 + 0.16 * math.sin(t * math.pi)))))
                rads.append(r * 0.42)
            # Build upright bark wall columns around cavity perimeter
            for idx_p, pt in enumerate(pts):
                col_h = h * (0.72 + 0.26 * math.sin((idx_p / (segs - 1)) * math.pi))
                tube(
                    bm,
                    uv,
                    [Vector((pt.x, pt.y, -0.02)), Vector((pt.x * 0.96, pt.y * 0.96, col_h * 0.5)), Vector((pt.x * 0.88, pt.y * 0.88, col_h))],
                    [r * 0.42, r * 0.32, r * 0.18],
                    sides=7,
                    u_range=U_BARK,
                    v_range=V_BARK,
                    flute_count=5,
                    flute_depth=0.14,
                )
        rock_chunk(bm, uv, Vector((0, 0, 0.08)), Vector((r * 0.65, r * 0.65, 0.12)), u_range=U_SOIL, v_range=V_SOIL, subdivisions=2, rng=rng, dome=True)
        _root_flare_ring(bm, uv, rng, 6, r, h * 0.34, r * 2.50)
        _moss_cushions(bm, uv, [(Vector((0.0, r * 0.72, h * 0.76)), (1.1, 0.9, 0.55)), (Vector((-r * 0.75, 0.1, h * 0.32)), (1.0, 1.0, 0.7))], rng, scale=0.12)
        _shelf_fungi_clusters(bm, uv, [(Vector((-r * 0.95, 0.24, h * 0.48)), Vector((-1, 0.2, 0)))], rng)
        return

    if tid == 'stump-weathered':
        h = max(0.56, length_or_h * 0.72)
        r = max(0.27, radius)
        tube(
            bm,
            uv,
            [Vector((0, 0, -0.02)), Vector((0.0, 0.0, h * 0.36)), Vector((0.02, -0.01, h * 0.88))],
            [r * 1.62, r * 1.05, r * 0.92],
            sides=12,
            u_range=U_BARK,
            v_range=V_BARK,
            flute_count=10,
            flute_depth=0.19,
            rough=0.05,
            rng=rng,
        )
        mushroom_dome(bm, uv, Vector((0.02, -0.01, h * 0.86)), r * 0.86, h * 0.08, sides=10, u_range=U_ACCENT, v_range=V_ACCENT)
        _root_flare_ring(bm, uv, rng, 7, r, h * 0.40, r * 2.60)
        _moss_cushions(bm, uv, [(Vector((r * 0.62, r * 0.45, h * 0.55)), (1.1, 0.9, 0.6)), (Vector((-r * 0.68, -0.1, 0.18)), (1.2, 1.0, 0.6))], rng, scale=0.13)
        return

    if tid == 'root-wad':
        L = max(1.35, length_or_h * 0.88)
        r = max(0.22, radius)
        # Torn trunk resting on ground stretching to +x, broken ends splintered
        pts = [Vector((-0.18, 0.0, 0.32)), Vector((L * 0.25, 0.04, 0.22)), Vector((L * 0.65, -0.03, 0.16)), Vector((L * 0.96, 0.02, 0.14))]
        tube(bm, uv, pts, [r * 1.25, r * 0.95, r * 0.78, r * 0.52], sides=10, u_range=U_BARK, v_range=V_BARK, flute_count=7, flute_depth=0.14)
        for sp in range(4):
            ang = sp * 1.6
            b = pts[-1] + Vector((0, math.cos(ang) * r * 0.22, math.sin(ang) * r * 0.22))
            tube(bm, uv, [b, b + Vector((0.28, math.cos(ang) * 0.06, 0.06))], [r * 0.22, 0.02], sides=5, u_range=U_ACCENT, v_range=V_ACCENT)
        # Vertical torn rootwall disc at x = -0.20
        rock_chunk(bm, uv, Vector((-0.24, 0.0, 0.48)), Vector((0.24, r * 2.2, r * 2.1)), u_range=U_SOIL, v_range=V_SOIL, subdivisions=2, rng=rng)
        for i in range(12):
            a = (i / 12.0) * math.tau + rng.uniform(-0.14, 0.14)
            reach = rng.uniform(0.55, 1.05)
            p0 = Vector((-0.18, math.cos(a) * r * 0.7, 0.44 + math.sin(a) * r * 0.7))
            p1 = Vector((-0.34, math.cos(a) * reach * 0.58, max(0.06, 0.52 + math.sin(a) * reach * 0.58)))
            p2 = Vector((-0.46 + rng.uniform(-0.12, 0.12), math.cos(a) * reach, max(0.03, 0.56 + math.sin(a) * reach)))
            tube(bm, uv, [p0, p1, p2], [r * 0.36, r * 0.20, 0.03], sides=6, u_range=U_BARK, v_range=V_BARK)
        return

    if tid == 'arched-root-bridge':
        span = max(1.9, length_or_h)
        r = max(0.20, radius)
        arch_pts = [
            Vector((-span * 0.52, -0.05, 0.02)),
            Vector((-span * 0.26, 0.04, 0.46)),
            Vector((0.0, 0.02, 0.66)),
            Vector((span * 0.26, -0.03, 0.44)),
            Vector((span * 0.52, 0.05, 0.02)),
        ]
        tube(bm, uv, arch_pts, [r * 1.15, r * 0.88, r * 0.82, r * 0.88, r * 1.15], sides=10, u_range=U_BARK, v_range=V_BARK, flute_count=7, flute_depth=0.14)
        # Companion intertwined bridge root + bank anchor claws
        side_pts = [
            Vector((-span * 0.46, 0.24, 0.02)),
            Vector((-span * 0.18, 0.16, 0.42)),
            Vector((span * 0.12, -0.14, 0.52)),
            Vector((span * 0.46, -0.22, 0.02)),
        ]
        tube(bm, uv, side_pts, [r * 0.72, r * 0.54, r * 0.48, r * 0.68], sides=8, u_range=U_BARK, v_range=V_BARK, flute_count=5, flute_depth=0.12)
        for end_x in (-span * 0.48, span * 0.48):
            for k in (-1, 1):
                p0 = Vector((end_x * 0.82, 0.0, 0.18))
                p1 = Vector((end_x * 1.12, k * 0.36, 0.0))
                tube(bm, uv, [p0, p1], [r * 0.42, r * 0.12], sides=5, u_range=U_BARK, v_range=V_BARK)
        _moss_cushions(bm, uv, [(Vector((x, 0.04, z + 0.12)), (1.4, 0.9, 0.5)) for x, z in ((-0.35, 0.48), (0.0, 0.68), (0.35, 0.46))], rng, scale=0.13)
        for k in range(4):
            fx = -0.3 + 0.22 * k
            _quad_blade(bm, uv, Vector((fx, 0.05, 0.66)), Vector((math.cos(k * 1.5), math.sin(k * 1.5), 0.7)).normalized(), 0.24, 0.09, arch=0.14, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        return

    if tid in ('split-timber-log', 'fallen-log-split', 'shelf-fungus-log', 'fallen-log-uprooted', 'fallen-log-nurse'):
        L = max(2.1, length_or_h)
        r = max(0.22, radius)
        if 'split' in tid:
            for offset_y, scale_z in ((-0.10, 0.82), (0.11, 0.78)):
                pts = [
                    Vector((-L * 0.48, offset_y, 0.14)),
                    Vector((-L * 0.16, offset_y * 1.15, 0.18)),
                    Vector((L * 0.18, offset_y * 0.9, 0.16)),
                    Vector((L * 0.48, offset_y * 1.1, 0.12)),
                ]
                tube(bm, uv, pts, [r * 0.85, r * 0.76, r * 0.68, r * 0.50], sides=8, u_range=U_BARK, v_range=V_BARK, scale_y=scale_z, flute_count=5, flute_depth=0.10)
            for sx in (-L * 0.46, L * 0.46):
                sgn = 1.0 if sx > 0 else -1.0
                for k in range(3):
                    tube(bm, uv, [Vector((sx, (k - 1) * 0.08, 0.18)), Vector((sx + sgn * 0.28, (k - 1) * 0.10, 0.22))], [r * 0.22, 0.02], sides=5, u_range=U_ACCENT, v_range=V_ACCENT)
        else:
            pts = [
                Vector((-L * 0.50, -0.04, 0.20 if 'uprooted' in tid else 0.16)),
                Vector((-L * 0.16, 0.04, 0.20)),
                Vector((L * 0.18, -0.02, 0.17)),
                Vector((L * 0.50, 0.03, 0.14)),
            ]
            tube(bm, uv, pts, [r * 1.15, r * 0.96, r * 0.82, r * 0.60], sides=10, u_range=U_BARK, v_range=V_BARK, flute_count=7, flute_depth=0.12, rough=0.06, rng=rng)
            if 'uprooted' in tid:
                for k in range(8):
                    a = (k / 8.0) * math.tau + 0.2
                    rp0 = Vector((-L * 0.48, math.cos(a) * r * 0.6, 0.24 + math.sin(a) * r * 0.6))
                    rp1 = Vector((-L * 0.64, math.cos(a) * r * 2.2, max(0.02, 0.30 + math.sin(a) * r * 2.2)))
                    tube(bm, uv, [rp0, rp1], [r * 0.36, 0.04], sides=5, u_range=U_BARK, v_range=V_BARK)
                for b_idx in range(3):
                    bx = L * (0.14 + 0.14 * b_idx)
                    sgn = 1.0 if b_idx % 2 == 0 else -1.0
                    tube(bm, uv, [Vector((bx, sgn * r * 0.4, 0.20)), Vector((bx + 0.22, sgn * 0.44, 0.48))], [r * 0.28, r * 0.08], sides=5, u_range=U_BARK, v_range=V_BARK)
            elif 'nurse' in tid:
                for sp in range(5):
                    sx = -L * 0.34 + sp * (L * 0.17)
                    base_p = Vector((sx, rng.uniform(-0.06, 0.06), 0.28))
                    top_p = base_p + Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), rng.uniform(0.32, 0.52)))
                    tube(bm, uv, [base_p, top_p], [0.024, 0.008], sides=5, u_range=U_BARK, v_range=V_BARK)
                    for k in range(6):
                        la = k * (math.tau / 6.0)
                        leaf_spray_fan(bm, uv, top_p * 0.85 + base_p * 0.15, Vector((math.cos(la), math.sin(la), 0.35)).normalized(), 0.26, 0.14, u_range=U_FOLIAGE, v_range=V_FOLIAGE, arch=0.10)
            if 'shelf' in tid or 'nurse' in tid:
                sh_pos = [(Vector((-L * 0.34 + 0.16 * i, r * (0.82 if i % 2 else -0.82), 0.22)), Vector((0.0, 1.0 if i % 2 else -1.0, 0.1))) for i in range(7)]
                _shelf_fungi_clusters(bm, uv, sh_pos, rng, base_size=0.095)
        _moss_cushions(bm, uv, [(Vector((-L * 0.28 + 0.24 * i, 0.02, 0.28)), (1.3, 1.0, 0.55)) for i in range(4)], rng, scale=0.14)
        return

    # Upright gnarled snags & hollow-nurse-trunk
    h = max(1.5, length_or_h)
    r = max(0.20, radius)
    pts = [
        Vector((0.0, 0.0, -0.02)),
        Vector((0.06, -0.04, h * 0.34)),
        Vector((-0.05, 0.06, h * 0.72)),
        Vector((0.04, -0.02, h * 0.98)),
    ]
    tube(bm, uv, pts, [r * 1.48, r * 0.92, r * 0.62, r * 0.28], sides=10, u_range=U_BARK, v_range=V_BARK, flute_count=9, flute_depth=0.16, rough=0.06, rng=rng)
    _root_flare_ring(bm, uv, rng, 6, r, h * 0.22, r * 2.5)
    for b_idx in range(4):
        a = (b_idx / 4.0) * math.tau + 0.4
        bp = pts[1].lerp(pts[2], b_idx / 3.0)
        tip = bp + Vector((math.cos(a) * h * 0.30, math.sin(a) * h * 0.30, h * 0.22))
        tube(bm, uv, [bp, tip], [r * 0.40, r * 0.12], sides=5, u_range=U_BARK, v_range=V_BARK)
    if 'nurse' in tid:
        for s_idx in range(2):
            sa = s_idx * 2.4
            sp0 = pts[3] + Vector((math.cos(sa) * 0.04, math.sin(sa) * 0.04, -0.08))
            sp1 = sp0 + Vector((math.cos(sa) * 0.24, math.sin(sa) * 0.24, 0.42))
            tube(bm, uv, [sp0, sp1], [0.026, 0.010], sides=5, u_range=U_BARK, v_range=V_BARK)
            for k in range(5):
                la = sa + (k - 2) * 0.55
                leaf_spray_fan(bm, uv, sp1, Vector((math.cos(la), math.sin(la), 0.32)).normalized(), 0.28, 0.14, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        _shelf_fungi_clusters(bm, uv, [(Vector((r * 0.78, 0.0, h * (0.30 + 0.18 * i))), Vector((1, 0, 0))) for i in range(3)], rng)
    else:
        for sp in range(4):
            a = sp * 1.57
            sp0 = pts[-1] + Vector((math.cos(a) * r * 0.18, math.sin(a) * r * 0.18, -0.08))
            tube(bm, uv, [sp0, sp0 + Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.32))], [r * 0.18, 0.02], sides=5, u_range=U_ACCENT, v_range=V_ACCENT)
