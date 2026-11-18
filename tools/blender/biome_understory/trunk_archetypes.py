"""Specialized sculpted archetypes for the 12 forest trunks, stumps, rootwads & fallen logs."""
import math

from mathutils import Vector

from aaa_geometry import shaped_leaf
from aaa_natural_forms import (
    buttress_root_system,
    mushroom_cluster_mesh,
    organic_trunk_loft,
    planar_rock,
    splintered_fracture_cap,
)
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
    buttress_root_system(
        bm,
        uv,
        Vector((0.0, 0.0, z_drop - 0.03)),
        base_r,
        h_attach,
        reach,
        count,
        rng,
        U_BARK,
        V_BARK,
        split=True,
    )


def _shelf_fungi_clusters(bm, uv, positions, rng, base_size=0.085):
    """Attach tiered ruffled turkey-tail / artist-conk bracket plates onto rotting wood."""
    for pos, outward in positions:
        n = Vector((outward.x, outward.y, 0.0)).normalized() if outward.xy.length > 1e-4 else Vector((1.0, 0.0, 0.0))
        for tier in range(3):
            yaw_off = (tier - 1) * 0.42 + rng.uniform(-0.15, 0.15)
            nx = n.x * math.cos(yaw_off) - n.y * math.sin(yaw_off)
            ny = n.x * math.sin(yaw_off) + n.y * math.cos(yaw_off)
            fdir = Vector((nx, ny, 0.08 + 0.05 * tier)).normalized()
            off = Vector((0.0, 0.0, 0.038 * tier)) - n * 0.015
            sz = base_size * rng.uniform(0.95, 1.35) * (1.0 - 0.16 * tier)
            shaped_leaf(
                bm,
                uv,
                pos + off,
                fdir,
                sz * 1.45,
                sz * 1.65,
                profile='paddle',
                asym=0.14,
                arch=0.04,
                droop=0.02,
                cup_depth=-0.10,
                serration_amp=0.06,
                serration_freq=5,
                u_range=U_ACCENT,
                v_range=V_ACCENT,
            )


def _moss_cushions(bm, uv, positions, rng, scale=0.14):
    """Drape low sculpted forest-floor moss patches across shaded bark and log ridges."""
    for idx, (pos, radii) in enumerate(positions):
        r_vec = Vector((max(0.06, radii[0]), max(0.06, radii[1]), max(0.035, radii[2] * 0.72))) * (scale * rng.uniform(0.85, 1.25))
        planar_rock(
            bm,
            uv,
            pos - Vector((0.0, 0.0, r_vec.z * 0.25)),
            r_vec,
            style='river',
            seed=410 + idx + rng.randint(1, 500),
            u_range=U_FOLIAGE,
            v_range=V_FOLIAGE,
        )


def build_forest_trunk_archetype(bm, uv, rng, trunk_id, length_or_h, kind, radius=0.22):
    """Build distinct hero silhouettes for every forest trunk, stump, rootwad, and fallen log."""
    tid = (trunk_id or '').lower()

    if tid == 'stump-jagged':
        h = max(0.68, length_or_h * 0.85)
        r = max(0.24, radius)
        pts = [Vector((0, 0, -0.03)), Vector((0.02, -0.01, h * 0.28)), Vector((-0.02, 0.02, h * 0.68))]
        organic_trunk_loft(
            bm,
            uv,
            pts,
            [r * 1.65, r * 1.08, r * 0.88],
            rng,
            sides=11,
            oval_ratio=0.88,
            bark_ridges=8,
            ridge_depth=0.18,
            cap_end=False,
            u_range=U_BARK,
            v_range=V_BARK,
        )
        splintered_fracture_cap(
            bm,
            uv,
            pts[-1],
            Vector((-0.04, 0.03, 1.0)).normalized(),
            r * 0.86,
            rng,
            U_BARK,
            V_BARK,
            U_SOIL,
            V_SOIL,
            splinters=9,
        )
        _root_flare_ring(bm, uv, rng, 6, r, h * 0.36, r * 2.55)
        _shelf_fungi_clusters(bm, uv, [(Vector((math.cos(i * 1.9) * r * 0.92, math.sin(i * 1.9) * r * 0.92, h * (0.28 + 0.10 * i))), Vector((math.cos(i * 1.9), math.sin(i * 1.9), 0))) for i in range(3)], rng)
        return

    if tid == 'stump-hollow':
        h = max(0.72, length_or_h * 0.88)
        r = max(0.28, radius)
        # Continuous C-shaped fluted bark shell with real wall thickness & jagged decay breach
        arc_n = 18
        z_rings = 5
        arc_start, arc_end = 0.65, 5.62
        u0_b, u1_b = U_BARK
        v0_b, v1_b = V_BARK
        u0_h, u1_h = U_SOIL
        v0_h, v1_h = V_SOIL
        outer_grid = []
        inner_grid = []
        for zi in range(z_rings):
            zf = zi / (z_rings - 1)
            taper = 1.38 - 0.56 * zf + 0.08 * math.sin(zf * math.pi)
            o_row = []
            i_row = []
            for ai in range(arc_n):
                af = ai / (arc_n - 1)
                a = arc_start + (arc_end - arc_start) * af
                breach_h = h * (0.52 + 0.54 * math.sin(af * math.pi) + 0.14 * math.sin(af * math.tau * 3.0))
                z = -0.04 + breach_h * zf
                flute = 1.0 + 0.14 * math.sin(a * 9.0 + zf * 1.4)
                ro = r * taper * flute
                ri = max(r * 0.44, ro - r * (0.34 - 0.10 * zf))
                o_row.append(bm.verts.new((math.cos(a) * ro, math.sin(a) * ro, z)))
                i_row.append(bm.verts.new((math.cos(a) * ri, math.sin(a) * ri, z)))
            outer_grid.append(o_row)
            inner_grid.append(i_row)
        # Outer bark & inner decayed sapwood surfaces
        for zi in range(z_rings - 1):
            for ai in range(arc_n - 1):
                fo = bm.faces.new((outer_grid[zi][ai], outer_grid[zi][ai + 1], outer_grid[zi + 1][ai + 1], outer_grid[zi + 1][ai]))
                for loop, uv_c in zip(fo.loops, ((u0_b, v0_b), (u1_b, v0_b), (u1_b, v1_b), (u0_b, v1_b))):
                    loop[uv].uv = uv_c
                fi = bm.faces.new((inner_grid[zi][ai + 1], inner_grid[zi][ai], inner_grid[zi + 1][ai], inner_grid[zi + 1][ai + 1]))
                for loop, uv_c in zip(fi.loops, ((u0_h, v0_h), (u1_h, v0_h), (u1_h, v1_h), (u0_h, v1_h))):
                    loop[uv].uv = uv_c
        # Top fractured rim connecting outer bark to inner cavity wall + side breach walls
        for ai in range(arc_n - 1):
            fr = bm.faces.new((outer_grid[-1][ai], outer_grid[-1][ai + 1], inner_grid[-1][ai + 1], inner_grid[-1][ai]))
            for loop, uv_c in zip(fr.loops, ((u0_h, v0_h), (u1_h, v0_h), (u1_h, v1_h), (u0_h, v1_h))):
                loop[uv].uv = uv_c
        for zi in range(z_rings - 1):
            f_l = bm.faces.new((inner_grid[zi][0], outer_grid[zi][0], outer_grid[zi + 1][0], inner_grid[zi + 1][0]))
            f_r = bm.faces.new((outer_grid[zi][-1], inner_grid[zi][-1], inner_grid[zi + 1][-1], outer_grid[zi + 1][-1]))
            for f_side in (f_l, f_r):
                for loop, uv_c in zip(f_side.loops, ((u0_h, v0_h), (u1_h, v0_h), (u1_h, v1_h), (u0_h, v1_h))):
                    loop[uv].uv = uv_c
        for k_sp in (0.28, 0.52, 0.76):
            a_sp = arc_start + (arc_end - arc_start) * k_sp
            h_sp = h * (0.52 + 0.54 * math.sin(k_sp * math.pi))
            splintered_fracture_cap(bm, uv, Vector((math.cos(a_sp) * r * 0.78, math.sin(a_sp) * r * 0.78, h_sp * 0.92)), Vector((0, 0, 1)), r * 0.18, rng, U_BARK, V_BARK, U_ACCENT, V_ACCENT, splinters=3)

        planar_rock(bm, uv, Vector((0, 0, 0.04)), (r * 0.58, r * 0.55, 0.09), style='crag', seed=19, u_range=U_SOIL, v_range=V_SOIL)
        buttress_root_system(bm, uv, (0, 0, 0), r, h * 0.42, r * 2.85, 6, rng, U_BARK, V_BARK, split=True)
        mushroom_cluster_mesh(bm, uv, Vector((-r * 0.92, 0.18, h * 0.22)), 0.16, 0.09, rng, cap_u=U_ACCENT, cap_v=V_ACCENT, stipe_u=U_BARK, stipe_v=V_BARK, base_u=U_FOLIAGE, base_v=V_FOLIAGE)
        _moss_cushions(bm, uv, [(Vector((0.0, r * 0.72, h * 0.74)), (1.1, 0.85, 0.45)), (Vector((-r * 0.65, -0.15, 0.12)), (1.2, 0.95, 0.50))], rng, scale=0.11)
        return

    if tid == 'stump-weathered':
        h = max(0.56, length_or_h * 0.72)
        r = max(0.27, radius)
        pts = [Vector((0, 0, -0.03)), Vector((0.0, 0.0, h * 0.36)), Vector((0.02, -0.01, h * 0.88))]
        organic_trunk_loft(
            bm,
            uv,
            pts,
            [r * 1.62, r * 1.05, r * 0.92],
            rng,
            sides=12,
            oval_ratio=0.88,
            bark_ridges=9,
            ridge_depth=0.19,
            cap_end=False,
            u_range=U_BARK,
            v_range=V_BARK,
        )
        splintered_fracture_cap(
            bm,
            uv,
            pts[-1],
            Vector((0.03, -0.02, 1.0)).normalized(),
            r * 0.88,
            rng,
            U_BARK,
            V_BARK,
            U_SOIL,
            V_SOIL,
            splinters=6,
        )
        _root_flare_ring(bm, uv, rng, 7, r, h * 0.40, r * 2.60)
        _moss_cushions(bm, uv, [(Vector((r * 0.62, r * 0.45, h * 0.55)), (1.1, 0.9, 0.55)), (Vector((-r * 0.68, -0.1, 0.14)), (1.2, 1.0, 0.55))], rng, scale=0.14)
        mushroom_cluster_mesh(bm, uv, Vector((r * 0.82, -r * 0.35, 0.0)), h * 0.24, r * 0.52, rng, cap_u=U_ACCENT, cap_v=V_ACCENT, stipe_u=U_BARK, stipe_v=V_BARK, base_u=U_FOLIAGE, base_v=V_FOLIAGE)
        return

    if tid == 'root-wad':
        L = max(1.35, length_or_h * 0.88)
        r = max(0.22, radius)
        pts = [Vector((-0.18, 0.0, 0.32)), Vector((L * 0.25, 0.04, 0.22)), Vector((L * 0.65, -0.03, 0.16)), Vector((L * 0.96, 0.02, 0.14))]
        organic_trunk_loft(bm, uv, pts, [r * 1.25, r * 0.95, r * 0.78, r * 0.52], rng, sides=10, bark_ridges=7, ridge_depth=0.14, cap_end=False, u_range=U_BARK, v_range=V_BARK)
        splintered_fracture_cap(bm, uv, pts[-1], (pts[-1] - pts[-2]).normalized(), r * 0.52, rng, U_BARK, V_BARK, U_SOIL, V_SOIL, splinters=7)
        # Vertical faceted mud-and-clod root plate + twisted radiating claws
        planar_rock(bm, uv, Vector((-0.24, 0.0, 0.46)), Vector((0.26, r * 2.2, r * 2.1)), style='crag', seed=771, u_range=U_SOIL, v_range=V_SOIL)
        for i in range(12):
            a = (i / 12.0) * math.tau + rng.uniform(-0.16, 0.16)
            reach = rng.uniform(0.55, 1.05)
            p0 = Vector((-0.18, math.cos(a) * r * 0.7, 0.44 + math.sin(a) * r * 0.7))
            p1 = Vector((-0.34, math.cos(a) * reach * 0.58, max(0.06, 0.52 + math.sin(a) * reach * 0.58)))
            p2 = Vector((-0.46 + rng.uniform(-0.12, 0.12), math.cos(a) * reach, max(0.02, 0.56 + math.sin(a) * reach)))
            organic_trunk_loft(bm, uv, [p0, p1, p2], [r * 0.36, r * 0.20, 0.025], rng, sides=6, bark_ridges=4, ridge_depth=0.10, u_range=U_BARK, v_range=V_BARK)
        return

    if tid == 'arched-root-bridge':
        span = max(1.9, length_or_h)
        r = max(0.20, radius)
        arch_pts = [
            Vector((-span * 0.52, -0.05, -0.03)),
            Vector((-span * 0.26, 0.04, 0.46)),
            Vector((0.0, 0.02, 0.66)),
            Vector((span * 0.26, -0.03, 0.44)),
            Vector((span * 0.52, 0.05, -0.03)),
        ]
        organic_trunk_loft(bm, uv, arch_pts, [r * 1.18, r * 0.88, r * 0.82, r * 0.88, r * 1.18], rng, sides=11, bark_ridges=7, ridge_depth=0.16, u_range=U_BARK, v_range=V_BARK)
        side_pts = [
            Vector((-span * 0.46, 0.24, -0.03)),
            Vector((-span * 0.18, 0.16, 0.42)),
            Vector((span * 0.12, -0.14, 0.52)),
            Vector((span * 0.46, -0.22, -0.03)),
        ]
        organic_trunk_loft(bm, uv, side_pts, [r * 0.74, r * 0.54, r * 0.48, r * 0.70], rng, sides=8, bark_ridges=5, ridge_depth=0.14, u_range=U_BARK, v_range=V_BARK)
        for end_x in (-span * 0.48, span * 0.48):
            for k in (-1, 1):
                p0 = Vector((end_x * 0.82, 0.0, 0.18))
                p1 = Vector((end_x * 1.14, k * 0.36, -0.03))
                organic_trunk_loft(bm, uv, [p0, p0.lerp(p1, 0.5) + Vector((0, 0, 0.06)), p1], [r * 0.42, r * 0.24, r * 0.10], rng, sides=6, bark_ridges=4, ridge_depth=0.10, u_range=U_BARK, v_range=V_BARK)
        _moss_cushions(bm, uv, [(Vector((x, 0.04, z + 0.10)), (1.4, 0.9, 0.5)) for x, z in ((-0.35, 0.48), (0.0, 0.68), (0.35, 0.46))], rng, scale=0.13)
        for k in range(5):
            fx = -0.34 + 0.18 * k
            fa = k * 1.6 + 0.3
            shaped_leaf(bm, uv, Vector((fx, 0.04, 0.64)), Vector((math.cos(fa), math.sin(fa), 0.45)).normalized(), 0.28, 0.11, profile='lanceolate', asym=0.14, cup_depth=0.18, droop=0.16, serration_amp=0.12, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        return

    if tid in ('split-timber-log', 'fallen-log-split', 'shelf-fungus-log', 'fallen-log-uprooted', 'fallen-log-nurse'):
        L = max(2.1, length_or_h)
        r = max(0.22, radius)
        if 'split' in tid:
            for offset_y, scale_z in ((-0.10, 0.82), (0.11, 0.78)):
                pts = [
                    Vector((-L * 0.48, offset_y, 0.12)),
                    Vector((-L * 0.16, offset_y * 1.15, 0.17)),
                    Vector((L * 0.18, offset_y * 0.9, 0.15)),
                    Vector((L * 0.48, offset_y * 1.1, 0.10)),
                ]
                organic_trunk_loft(bm, uv, pts, [r * 0.85, r * 0.76, r * 0.68, r * 0.50], rng, sides=9, oval_ratio=scale_z, bark_ridges=5, ridge_depth=0.12, cap_end=False, u_range=U_BARK, v_range=V_BARK)
                splintered_fracture_cap(bm, uv, pts[0], (pts[0] - pts[1]).normalized(), r * 0.72, rng, U_BARK, V_BARK, U_SOIL, V_SOIL, splinters=6)
                splintered_fracture_cap(bm, uv, pts[-1], (pts[-1] - pts[-2]).normalized(), r * 0.46, rng, U_BARK, V_BARK, U_SOIL, V_SOIL, splinters=5)
        else:
            pts = [
                Vector((-L * 0.50, -0.04, 0.20 if 'uprooted' in tid else 0.14)),
                Vector((-L * 0.16, 0.04, 0.19)),
                Vector((L * 0.18, -0.02, 0.16)),
                Vector((L * 0.50, 0.03, 0.12)),
            ]
            organic_trunk_loft(bm, uv, pts, [r * 1.15, r * 0.96, r * 0.82, r * 0.60], rng, sides=11, bark_ridges=7, ridge_depth=0.14, cap_end=False, u_range=U_BARK, v_range=V_BARK)
            splintered_fracture_cap(bm, uv, pts[-1], (pts[-1] - pts[-2]).normalized(), r * 0.58, rng, U_BARK, V_BARK, U_SOIL, V_SOIL, splinters=7)
            if 'uprooted' in tid:
                planar_rock(bm, uv, Vector((-L * 0.50, -0.04, 0.22)), Vector((0.20, r * 1.5, r * 1.4)), style='crag', seed=781, u_range=U_SOIL, v_range=V_SOIL)
                for k in range(8):
                    a = (k / 8.0) * math.tau + 0.2
                    rp0 = Vector((-L * 0.48, math.cos(a) * r * 0.6, 0.24 + math.sin(a) * r * 0.6))
                    rp1 = Vector((-L * 0.66, math.cos(a) * r * 2.2, max(0.0, 0.28 + math.sin(a) * r * 2.2)))
                    organic_trunk_loft(bm, uv, [rp0, rp0.lerp(rp1, 0.55) + Vector((-0.04, 0, 0.04)), rp1], [r * 0.36, r * 0.20, 0.03], rng, sides=6, bark_ridges=4, ridge_depth=0.10, u_range=U_BARK, v_range=V_BARK)
                for b_idx in range(3):
                    bx = L * (0.14 + 0.14 * b_idx)
                    sgn = 1.0 if b_idx % 2 == 0 else -1.0
                    organic_trunk_loft(bm, uv, [Vector((bx, sgn * r * 0.4, 0.20)), Vector((bx + 0.22, sgn * 0.44, 0.48))], [r * 0.28, r * 0.08], rng, sides=6, bark_ridges=4, ridge_depth=0.10, u_range=U_BARK, v_range=V_BARK)
            elif 'nurse' in tid:
                splintered_fracture_cap(bm, uv, pts[0], (pts[0] - pts[1]).normalized(), r * 1.05, rng, U_BARK, V_BARK, U_SOIL, V_SOIL, splinters=7)
                for sp in range(5):
                    sx = -L * 0.34 + sp * (L * 0.17)
                    base_p = Vector((sx, rng.uniform(-0.06, 0.06), 0.26))
                    top_p = base_p + Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), rng.uniform(0.32, 0.54)))
                    organic_trunk_loft(bm, uv, [base_p, base_p.lerp(top_p, 0.5), top_p], [0.026, 0.016, 0.007], rng, sides=5, bark_ridges=3, ridge_depth=0.06, u_range=U_BARK, v_range=V_BARK)
                    for k in range(6):
                        la = k * (math.tau / 6.0) + sp * 0.3
                        shaped_leaf(bm, uv, top_p * 0.88 + base_p * 0.12, Vector((math.cos(la), math.sin(la), 0.32)).normalized(), 0.28, 0.14, profile='ovate', asym=0.14, arch=0.10, droop=0.14, cup_depth=0.18, serration_amp=0.06, petiole=0.03, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            else:
                splintered_fracture_cap(bm, uv, pts[0], (pts[0] - pts[1]).normalized(), r * 1.05, rng, U_BARK, V_BARK, U_SOIL, V_SOIL, splinters=7)
            if 'shelf' in tid or 'nurse' in tid:
                sh_pos = [(Vector((-L * 0.34 + 0.16 * i, r * (0.82 if i % 2 else -0.82), 0.22)), Vector((0.0, 1.0 if i % 2 else -1.0, 0.1))) for i in range(7)]
                _shelf_fungi_clusters(bm, uv, sh_pos, rng, base_size=0.095)
        _moss_cushions(bm, uv, [(Vector((-L * 0.28 + 0.24 * i, 0.02, 0.26)), (1.3, 1.0, 0.50)) for i in range(4)], rng, scale=0.14)
        return

    # Upright gnarled snags & hollow-nurse-trunk
    h = max(1.5, length_or_h)
    r = max(0.20, radius)
    pts = [
        Vector((0.0, 0.0, -0.03)),
        Vector((0.06, -0.04, h * 0.34)),
        Vector((-0.05, 0.06, h * 0.72)),
        Vector((0.04, -0.02, h * 0.98)),
    ]
    organic_trunk_loft(bm, uv, pts, [r * 1.48, r * 0.92, r * 0.62, r * 0.28], rng, sides=11, bark_ridges=8, ridge_depth=0.16, cap_end=False, u_range=U_BARK, v_range=V_BARK)
    splintered_fracture_cap(bm, uv, pts[-1], (pts[-1] - pts[-2]).normalized(), r * 0.28, rng, U_BARK, V_BARK, U_SOIL, V_SOIL, splinters=6)
    _root_flare_ring(bm, uv, rng, 6, r, h * 0.24, r * 2.5)
    for b_idx in range(4):
        a = (b_idx / 4.0) * math.tau + 0.4
        bp = pts[1].lerp(pts[2], b_idx / 3.0)
        mid_b = bp + Vector((math.cos(a) * h * 0.16, math.sin(a) * h * 0.16, h * 0.12))
        tip = bp + Vector((math.cos(a + 0.14) * h * 0.30, math.sin(a + 0.14) * h * 0.30, h * 0.22))
        organic_trunk_loft(bm, uv, [bp, mid_b, tip], [r * 0.40, r * 0.24, r * 0.11], rng, sides=6, bark_ridges=5, ridge_depth=0.12, cap_end=False, u_range=U_BARK, v_range=V_BARK)
        splintered_fracture_cap(bm, uv, tip, (tip - mid_b).normalized(), r * 0.11, rng, U_BARK, V_BARK, U_SOIL, V_SOIL, splinters=4)
    if 'nurse' in tid:
        for s_idx in range(2):
            sa = s_idx * 2.4
            sp0 = pts[3] + Vector((math.cos(sa) * 0.04, math.sin(sa) * 0.04, -0.08))
            sp1 = sp0 + Vector((math.cos(sa) * 0.24, math.sin(sa) * 0.24, 0.42))
            organic_trunk_loft(bm, uv, [sp0, sp0.lerp(sp1, 0.5), sp1], [0.028, 0.016, 0.008], rng, sides=5, bark_ridges=3, ridge_depth=0.06, u_range=U_BARK, v_range=V_BARK)
            for k in range(5):
                la = sa + (k - 2) * 0.55
                shaped_leaf(bm, uv, sp1, Vector((math.cos(la), math.sin(la), 0.32)).normalized(), 0.30, 0.15, profile='ovate', asym=0.14, arch=0.12, cup_depth=0.18, serration_amp=0.06, petiole=0.03, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        _shelf_fungi_clusters(bm, uv, [(Vector((r * 0.78, 0.0, h * (0.30 + 0.18 * i))), Vector((1, 0, 0))) for i in range(3)], rng)
        mushroom_cluster_mesh(bm, uv, Vector((-r * 0.72, r * 0.42, 0.0)), h * 0.16, r * 0.45, rng, cap_u=U_ACCENT, cap_v=V_ACCENT, stipe_u=U_BARK, stipe_v=V_BARK, base_u=U_FOLIAGE, base_v=V_FOLIAGE)
