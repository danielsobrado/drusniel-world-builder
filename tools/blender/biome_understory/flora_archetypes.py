"""Specialized botanical & geological archetypes for the 80 biome flora assets.

Each builder uses the canonical atlas UV bands produced by `_make_atlas_material`:
- U_BARK / V_BARK: woody bark, stems, boulders, crystalline spires (above soil band)
- U_SOIL / V_SOIL: dark earth, root collars, scree bases
- U_FOLIAGE / V_FOLIAGE: leaves, fronds, cactus ribs, moss, lichen
- U_ACCENT / V_ACCENT: petals, bracts, berries, spines, mushroom gills
"""
import math

import bmesh
from mathutils import Vector

from understory_common import (
    arched_card,
    leaf_spray_fan,
    mushroom_dome,
    rock_chunk,
    tube,
)

U_BARK = (0.04, 0.34)
V_BARK = (0.38, 0.94)
U_SOIL = (0.04, 0.30)
V_SOIL = (0.04, 0.30)
U_FOLIAGE = (0.40, 0.70)
V_FOLIAGE = (0.06, 0.94)
U_ACCENT = (0.74, 0.96)
V_ACCENT = (0.06, 0.94)


def _quad_blade(bm, uv, origin, forward_dir, length, width, arch=0.12, u_range=U_FOLIAGE, v_range=V_FOLIAGE):
    """Lightweight 3-segment tapered cupped blade (12 tris) for dense florets, pinnae, or grass."""
    f = forward_dir.normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(f.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    right = f.cross(ref).normalized()
    up_perp = right.cross(f).normalized()
    u0, u1 = u_range
    v0, v1 = v_range
    uc = 0.5 * (u0 + u1)

    pts = []
    for i, t in enumerate((0.0, 0.45, 0.82)):
        mid = origin + f * (length * t) + up_perp * (length * arch * math.sin(t * math.pi))
        hw = width * (0.28 + 0.72 * math.sin(max(0.15, t) * math.pi * 0.85))
        cup = up_perp * (width * 0.14)
        vl = bm.verts.new(mid - right * hw + cup)
        vm = bm.verts.new(mid)
        vr = bm.verts.new(mid + right * hw + cup)
        vt = v0 + (v1 - v0) * t
        pts.append(((vl, (u0, vt)), (vm, (uc, vt)), (vr, (u1, vt))))
    tip = bm.verts.new(origin + f * length + up_perp * (length * arch * 0.35))
    tip_uv = (uc, v1)

    for r in range(2):
        for c in range(2):
            v00, uv00 = pts[r][c]
            v10, uv10 = pts[r][c + 1]
            v11, uv11 = pts[r + 1][c + 1]
            v01, uv01 = pts[r + 1][c]
            f1 = bm.faces.new((v00, v10, v11, v01))
            for loop, coord in zip(f1.loops, (uv00, uv10, uv11, uv01)):
                loop[uv].uv = coord
    for c in range(2):
        va, uva = pts[2][c]
        vb, uvb = pts[2][c + 1]
        ft = bm.faces.new((va, vb, tip))
        for loop, coord in zip(ft.loops, (uva, uvb, tip_uv)):
            loop[uv].uv = coord


def _basal_foliage_ring(bm, uv, rng, count, radius, length, width, z=0.04, arch=0.14):
    """Low radiating collar of cupped basal leaves anchored near soil level."""
    for i in range(count):
        a = (i / max(count, 1)) * math.tau + rng.uniform(-0.18, 0.18)
        pitch = rng.uniform(0.22, 0.56)
        fdir = Vector((math.cos(a), math.sin(a), pitch)).normalized()
        attach = Vector((math.cos(a) * radius * 0.35, math.sin(a) * radius * 0.35, z))
        leaf_spray_fan(
            bm,
            uv,
            attach,
            fdir,
            length * rng.uniform(0.82, 1.18),
            width * rng.uniform(0.85, 1.15),
            u_range=U_FOLIAGE,
            v_range=V_FOLIAGE,
            roll=rng.uniform(-0.22, 0.22),
            arch=arch,
            cup=0.18,
            tip_scale=0.30,
        )


def _branching_wood_base(bm, uv, rng, stem_count, height, base_r=0.055, spread=0.35):
    """Build gnarled multi-stemmed woody base rising from root flares."""
    tips = []
    for i in range(stem_count):
        a = (i / max(stem_count, 1)) * math.tau + rng.uniform(-0.28, 0.28)
        r_out = height * spread * rng.uniform(0.65, 1.25)
        h_s = height * rng.uniform(0.55, 1.0)
        p0 = Vector((math.cos(a) * base_r * 0.45, math.sin(a) * base_r * 0.45, 0.0))
        p1 = Vector((math.cos(a) * r_out * 0.35, math.sin(a) * r_out * 0.35, h_s * 0.38))
        p2 = Vector((math.cos(a + 0.16) * r_out * 0.72, math.sin(a + 0.16) * r_out * 0.72, h_s * 0.72))
        p3 = Vector((math.cos(a + 0.24) * r_out, math.sin(a + 0.24) * r_out, h_s))
        tube(
            bm,
            uv,
            [p0, p1, p2, p3],
            [base_r * 0.85, base_r * 0.58, base_r * 0.36, base_r * 0.16],
            sides=6,
            u_range=U_BARK,
            v_range=V_BARK,
        )
        tips.append((p1, p2, p3, a))
    return tips


def _flower_head_ring(bm, uv, center, normal, radius, petal_count, rng, has_disc=True):
    """Sculpted ray-petal flower head (central textured disc + radially fanned accent petals)."""
    n = normal.normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(n.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    tx = n.cross(ref).normalized()
    ty = n.cross(tx).normalized()
    if has_disc:
        mushroom_dome(
            bm,
            uv,
            center - n * (radius * 0.08),
            radius * 0.36,
            radius * 0.22,
            sides=8,
            u_range=U_BARK,
            v_range=V_BARK,
            tilt=n,
        )
    for k in range(petal_count):
        a = (k / max(petal_count, 1)) * math.tau + rng.uniform(-0.08, 0.08)
        radial = (tx * math.cos(a) + ty * math.sin(a)).normalized()
        pdir = (radial + n * rng.uniform(0.18, 0.42)).normalized()
        _quad_blade(
            bm,
            uv,
            center + radial * (radius * 0.26),
            pdir,
            radius * rng.uniform(0.75, 0.98),
            radius * 0.34,
            arch=0.14,
            u_range=U_ACCENT,
            v_range=V_ACCENT,
        )


def _match_any(aid, words):
    return any(w in aid for w in words)


def build_succulent_or_cactus(bm, uv, rng, h, aid):
    """Prickly pear cladodes, ribbed barrel cacti, rosette agave/aloe, or broom ephedra."""
    if 'prickly_pear' in aid:
        tube(
            bm,
            uv,
            [Vector((0.0, 0.0, 0.0)), Vector((0.02, -0.01, h * 0.22))],
            [0.10, 0.075],
            sides=8,
            u_range=U_BARK,
            v_range=V_BARK,
            rough=0.12,
            rng=rng,
        )
        pads = [
            (Vector((0.0, 0.0, h * 0.16)), 0.16, h * 0.36, 0.0, 0.10),
            (Vector((-0.14, 0.04, h * 0.46)), 0.15, h * 0.34, 0.45, -0.24),
            (Vector((0.16, -0.05, h * 0.50)), 0.14, h * 0.32, -0.38, 0.25),
            (Vector((0.0, -0.14, h * 0.34)), 0.13, h * 0.28, -1.30, 0.22),
            (Vector((-0.24, -0.08, h * 0.76)), 0.11, h * 0.26, 0.80, -0.18),
            (Vector((0.26, 0.06, h * 0.80)), 0.11, h * 0.25, -0.72, 0.20),
            (Vector((0.02, 0.12, h * 0.44)), 0.12, h * 0.28, 1.35, 0.15),
            (Vector((-0.06, 0.18, h * 0.68)), 0.10, h * 0.22, 1.85, -0.14),
        ]
        for base, pw, ph, yaw, lean in pads:
            dir_u = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            pts = [
                base,
                base + dir_u * (lean * 0.25) + Vector((0.0, 0.0, ph * 0.32)),
                base + dir_u * (lean * 0.65) + Vector((0.0, 0.0, ph * 0.72)),
                base + dir_u * lean + Vector((0.0, 0.0, ph)),
            ]
            tube(
                bm,
                uv,
                pts,
                [pw * 0.42, pw, pw * 0.92, pw * 0.22],
                sides=10,
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
                scale_y=0.32,
            )
            crown = pts[-1]
            for j in (-0.35, 0.0, 0.35):
                fp = crown + dir_u * (j * pw)
                mushroom_dome(bm, uv, fp, 0.042, 0.055, sides=8, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if 'barrel_cactus' in aid:
        barrels = [
            (Vector((0.0, 0.0, 0.0)), h * 0.42, h * 0.92, 14),
            (Vector((h * 0.38, h * 0.14, 0.0)), h * 0.24, h * 0.56, 12),
            (Vector((-h * 0.34, -h * 0.18, 0.0)), h * 0.20, h * 0.46, 10),
        ]
        for bpos, br, bh, ribs in barrels:
            pts = [
                bpos,
                bpos + Vector((0.0, 0.0, bh * 0.28)),
                bpos + Vector((0.0, 0.0, bh * 0.68)),
                bpos + Vector((0.0, 0.0, bh * 0.96)),
            ]
            tube(
                bm,
                uv,
                pts,
                [br * 0.78, br * 1.04, br * 0.92, br * 0.48],
                sides=ribs,
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
                flute_count=ribs,
                flute_depth=0.14,
            )
            for k in range(6):
                a = (k / 6.0) * math.tau + rng.uniform(-0.15, 0.15)
                mushroom_dome(
                    bm,
                    uv,
                    bpos + Vector((math.cos(a) * br * 0.32, math.sin(a) * br * 0.32, bh * 0.95)),
                    br * 0.14,
                    br * 0.16,
                    sides=7,
                    u_range=U_ACCENT,
                    v_range=V_ACCENT,
                    tilt=Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, 1.0)),
                )
            for r_idx in range(0, ribs, 2):
                a = (r_idx / ribs) * math.tau
                for zf in (0.36, 0.68):
                    sp0 = bpos + Vector((math.cos(a) * br * 0.94, math.sin(a) * br * 0.94, bh * zf))
                    for s_ang in (-0.35, 0.35):
                        sdir = Vector((math.cos(a + s_ang), math.sin(a + s_ang), 0.42)).normalized()
                        _quad_blade(bm, uv, sp0, sdir, br * 0.20, 0.009, arch=0.02, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if _match_any(aid, ('agave', 'aloe')):
        is_aloe = 'aloe' in aid
        tube(bm, uv, [Vector((0.0, 0.0, 0.0)), Vector((0.0, 0.0, h * 0.18))], [0.14, 0.09], sides=6, u_range=U_BARK, v_range=V_BARK)
        count = 18 if not is_aloe else 16
        for i in range(count):
            t = i / max(count - 1, 1)
            a = i * 2.39996 + rng.uniform(-0.08, 0.08)
            pitch = 0.18 + 0.92 * t
            fdir = Vector((math.cos(a), math.sin(a), pitch)).normalized()
            blen = h * (0.78 - 0.18 * t) * rng.uniform(0.9, 1.1)
            bw = h * (0.22 if not is_aloe else 0.15) * (1.0 - 0.25 * t)
            leaf_spray_fan(
                bm,
                uv,
                Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.05 + t * 0.08)),
                fdir,
                blen,
                bw,
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
                arch=-0.16 if not is_aloe else -0.22,
                cup=0.30,
                tip_scale=0.05,
            )
        if is_aloe:
            tube(
                bm,
                uv,
                [Vector((0.0, 0.0, 0.10)), Vector((0.03, 0.0, h * 0.62)), Vector((-0.02, 0.01, h * 1.15))],
                [0.035, 0.024, 0.010],
                sides=6,
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
            )
            for k in range(14):
                z = h * (0.72 + 0.40 * (k / 13.0))
                a = k * 2.1
                bp = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, z))
                tube(
                    bm,
                    uv,
                    [bp, bp + Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.05))],
                    [0.022, 0.009],
                    sides=5,
                    u_range=U_ACCENT,
                    v_range=V_ACCENT,
                )
        return True

    if 'ephedra' in aid:
        rock_chunk(bm, uv, Vector((0.0, 0.0, 0.05)), Vector((0.18, 0.15, 0.09)), u_range=U_BARK, v_range=V_BARK, subdivisions=2, rng=rng)
        for i in range(14):
            a = (i / 14.0) * math.tau + rng.uniform(-0.2, 0.2)
            lean = rng.uniform(0.28, 0.85)
            h_stem = h * rng.uniform(0.65, 1.05)
            p0 = Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.06))
            p1 = Vector((math.cos(a) * lean * 0.32, math.sin(a) * lean * 0.32, h_stem * 0.45))
            p2 = Vector((math.cos(a + 0.2) * lean * 0.56, math.sin(a + 0.2) * lean * 0.56, h_stem))
            tube(bm, uv, [p0, p1, p2], [0.020, 0.014, 0.007], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            f_dir = Vector((math.cos(a - 0.35) * 0.45, math.sin(a - 0.35) * 0.45, 0.85)).normalized()
            tube(bm, uv, [p1, p1 + f_dir * (h_stem * 0.42)], [0.012, 0.005], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            if i % 2 == 0:
                mushroom_dome(bm, uv, p1 + f_dir * (h_stem * 0.25), 0.024, 0.028, sides=6, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    return False


def build_tall_spire_or_stalk(bm, uv, rng, h, aid):
    """Bamboo culms, corn stalks, tropical heliconia/strelitzia, and flower spires."""
    if 'bamboo' in aid:
        culms = 7
        for i in range(culms):
            a = (i / culms) * math.tau + rng.uniform(-0.22, 0.22)
            rad = rng.uniform(0.05, 0.22)
            ch = h * rng.uniform(0.76, 1.08)
            lean = Vector((math.cos(a), math.sin(a), 0.0)) * (ch * rng.uniform(0.08, 0.20))
            b = Vector((math.cos(a) * rad, math.sin(a) * rad, 0.0))
            pts = [b, b + lean * 0.25 + Vector((0, 0, ch * 0.34)), b + lean * 0.65 + Vector((0, 0, ch * 0.72)), b + lean + Vector((0, 0, ch))]
            tube(bm, uv, pts, [0.042, 0.036, 0.028, 0.016], sides=8, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for nj in range(1, 5):
                t = nj * 0.21
                npos = b + lean * (t * t) + Vector((0.0, 0.0, ch * t))
                mushroom_dome(bm, uv, npos - Vector((0, 0, 0.01)), 0.046 * (1.0 - 0.35 * t), 0.022, sides=8, u_range=U_BARK, v_range=V_BARK)
                if nj >= 3:
                    for side in (-1, 1):
                        ta = a + side * 0.75 + rng.uniform(-0.2, 0.2)
                        tdir = Vector((math.cos(ta), math.sin(ta), 0.42)).normalized()
                        tp1 = npos + tdir * (ch * 0.16)
                        tube(bm, uv, [npos, tp1], [0.012, 0.004], sides=4, u_range=U_BARK, v_range=V_BARK)
                        for k in (-1, 0, 1):
                            ldir = Vector((math.cos(ta + k * 0.45), math.sin(ta + k * 0.45), -0.18 + k * 0.12)).normalized()
                            _quad_blade(bm, uv, tp1, ldir, 0.24, 0.065, arch=0.14, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        return True

    if 'corn' in aid or 'maize' in aid:
        stalks = 3
        for s in range(stalks):
            a = (s / stalks) * math.tau + rng.uniform(-0.2, 0.2)
            b = Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 0.0))
            sh = h * (1.0 if s == 0 else rng.uniform(0.76, 0.90))
            pts = [b, b + Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, sh * 0.48)), b + Vector((math.cos(a) * 0.07, math.sin(a) * 0.07, sh * 0.92))]
            tube(bm, uv, pts, [0.055, 0.040, 0.018], sides=8, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for k in range(5):
                pa = a + k * 1.25
                tube(bm, uv, [b + Vector((0, 0, 0.14)), b + Vector((math.cos(pa) * 0.18, math.sin(pa) * 0.18, 0.0))], [0.016, 0.010], sides=4, u_range=U_BARK, v_range=V_BARK)
            for lv in range(7):
                zt = 0.20 + 0.68 * (lv / 6.0)
                la = a + lv * 2.2
                attach = b + Vector((math.cos(a) * 0.04 * zt, math.sin(a) * 0.04 * zt, sh * zt))
                ldir = Vector((math.cos(la), math.sin(la), 0.28)).normalized()
                leaf_spray_fan(bm, uv, attach, ldir, sh * 0.36, 0.14, u_range=U_FOLIAGE, v_range=V_FOLIAGE, arch=-0.26, cup=0.22, tip_scale=0.12)
            for cob_z, cob_a in ((sh * 0.48, a + 0.9), (sh * 0.62, a + 3.4)):
                c0 = b + Vector((math.cos(cob_a) * 0.03, math.sin(cob_a) * 0.03, cob_z))
                c1 = c0 + Vector((math.cos(cob_a) * 0.08, math.sin(cob_a) * 0.08, 0.16))
                tube(bm, uv, [c0, c1], [0.036, 0.016], sides=7, u_range=U_ACCENT, v_range=V_ACCENT)
            top = pts[-1]
            for ts in range(5):
                ta = ts * 1.25
                tdir = Vector((math.cos(ta) * 0.55, math.sin(ta) * 0.55, 0.85)).normalized()
                tube(bm, uv, [top, top + tdir * 0.22], [0.010, 0.003], sides=4, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if _match_any(aid, ('heliconia', 'bird_of_paradise')):
        is_bird = 'bird_of_paradise' in aid
        for i in range(9):
            a = (i / 9.0) * math.tau + rng.uniform(-0.18, 0.18)
            attach = Vector((math.cos(a) * 0.10, math.sin(a) * 0.10, 0.04))
            pet_top = attach + Vector((math.cos(a) * 0.22, math.sin(a) * 0.22, h * rng.uniform(0.32, 0.52)))
            tube(bm, uv, [attach, pet_top], [0.028, 0.018], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            ldir = Vector((math.cos(a), math.sin(a), 0.35)).normalized()
            leaf_spray_fan(bm, uv, pet_top, ldir, h * 0.52, h * 0.18, u_range=U_FOLIAGE, v_range=V_FOLIAGE, arch=-0.14, cup=0.20, tip_scale=0.35)
        for sp in range(3):
            a = sp * 2.1 + 0.4
            sb = Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.05))
            sm = sb + Vector((math.cos(a) * 0.10, math.sin(a) * 0.10, h * 0.55))
            st = sb + Vector((math.cos(a) * 0.16, math.sin(a) * 0.16, h * (0.94 if sp == 0 else 0.78)))
            tube(bm, uv, [sb, sm, st], [0.024, 0.018, 0.012], sides=6, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            if is_bird:
                spathe = st + Vector((math.cos(a) * 0.24, math.sin(a) * 0.24, 0.04))
                tube(bm, uv, [st, spathe], [0.036, 0.008], sides=6, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                for cr in range(4):
                    cdir = Vector((math.cos(a) * (0.2 + 0.15 * cr), math.sin(a) * (0.2 + 0.15 * cr), 0.92)).normalized()
                    _quad_blade(bm, uv, st.lerp(spathe, 0.25 + 0.15 * cr), cdir, 0.18, 0.05, arch=0.1, u_range=U_ACCENT, v_range=V_ACCENT)
            else:
                for br in range(5):
                    bt = 0.58 + 0.09 * br
                    bp = sb.lerp(st, bt)
                    side = 1.0 if br % 2 == 0 else -1.0
                    bdir = Vector((math.cos(a + side * 1.15), math.sin(a + side * 1.15), 0.45)).normalized()
                    _quad_blade(bm, uv, bp, bdir, 0.20, 0.09, arch=0.22, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if _match_any(aid, ('foxglove', 'mullein', 'lupine', 'chicory')):
        is_lupine = 'lupine' in aid
        if is_lupine:
            for p_idx in range(7):
                a = (p_idx / 7.0) * math.tau + rng.uniform(-0.15, 0.15)
                pet0 = Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.04))
                pet1 = pet0 + Vector((math.cos(a) * 0.22, math.sin(a) * 0.22, 0.18))
                tube(bm, uv, [pet0, pet1], [0.016, 0.009], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                for f_idx in range(7):
                    fa = a + (f_idx - 3) * 0.44
                    _quad_blade(bm, uv, pet1, Vector((math.cos(fa), math.sin(fa), -0.15)).normalized(), 0.18, 0.055, arch=0.12, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        else:
            _basal_foliage_ring(bm, uv, rng, 10, 0.16, h * 0.36, h * 0.14, z=0.04, arch=-0.12)

        stalks = 3 if 'mullein' not in aid else 2
        for s in range(stalks):
            a = s * 2.1 + 0.2
            b = Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.02))
            sh = h * (1.02 if s == 0 else 0.78)
            sw = sh * 0.10
            pts = [b, b + Vector((math.cos(a) * sw, math.sin(a) * sw, sh * 0.50)), b + Vector((math.cos(a) * sw * 1.4, math.sin(a) * sw * 1.4, sh))]
            tube(bm, uv, pts, [0.030, 0.022, 0.010], sides=6, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            if 'chicory' in aid:
                for b_idx in range(6):
                    zt = 0.35 + 0.10 * b_idx
                    bp = b.lerp(pts[-1], zt)
                    ba = a + b_idx * 1.85
                    twig = bp + Vector((math.cos(ba) * 0.18, math.sin(ba) * 0.18, 0.12))
                    tube(bm, uv, [bp, twig], [0.010, 0.005], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                    _flower_head_ring(bm, uv, twig, (twig - bp), 0.085, 8, rng, has_disc=True)
            else:
                floret_n = 20 if 'foxglove' in aid else 24
                for f_idx in range(floret_n):
                    ft = 0.44 + 0.52 * (f_idx / max(floret_n - 1, 1))
                    fp = b.lerp(pts[-1], ft)
                    fa = a if 'foxglove' in aid else f_idx * 2.4
                    f_off = Vector((math.cos(fa + rng.uniform(-0.35, 0.35)), math.sin(fa + rng.uniform(-0.35, 0.35)), -0.35 if 'foxglove' in aid else 0.25)).normalized()
                    mushroom_dome(
                        bm,
                        uv,
                        fp + f_off * 0.035,
                        0.038 * (1.15 - 0.5 * ft),
                        0.055 if 'foxglove' in aid else 0.036,
                        sides=6,
                        u_range=U_ACCENT,
                        v_range=V_ACCENT,
                        tilt=f_off,
                    )
        return True

    return False


def build_cupped_blossom(bm, uv, rng, h, aid):
    """Sunflowers, cupped bowl poppies/anemones, tripartite trillium/oxalis, or cotton grass."""
    if 'sunflower' in aid:
        _basal_foliage_ring(bm, uv, rng, 7, 0.14, h * 0.38, h * 0.18, z=0.06, arch=-0.10)
        for s in range(3):
            a = s * 2.2 + 0.3
            sh = h * (1.0 if s == 0 else rng.uniform(0.72, 0.85))
            b = Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.02))
            top = b + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, sh))
            tube(bm, uv, [b, b.lerp(top, 0.5) + Vector((0, 0, 0.04)), top], [0.036, 0.026, 0.018], sides=7, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            head_n = Vector((math.cos(a), math.sin(a), 0.55)).normalized()
            _flower_head_ring(bm, uv, top, head_n, h * (0.24 if s == 0 else 0.17), 16, rng, has_disc=True)
        return True

    if _match_any(aid, ('poppy', 'anemone')):
        _basal_foliage_ring(bm, uv, rng, 9, 0.14, h * 0.42, h * 0.12, z=0.04, arch=0.14)
        for s in range(5):
            a = (s / 5.0) * math.tau + rng.uniform(-0.22, 0.22)
            b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.03))
            top = b + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, h * rng.uniform(0.75, 1.02)))
            tube(bm, uv, [b, b.lerp(top, 0.52) + Vector((0, 0, 0.06)), top], [0.016, 0.012, 0.009], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            mushroom_dome(bm, uv, top, 0.030, 0.028, sides=7, u_range=U_BARK, v_range=V_BARK)
            for p_idx in range(6):
                pa = (p_idx / 6.0) * math.tau + s * 0.4
                pdir = Vector((math.cos(pa) * 0.72, math.sin(pa) * 0.72, 0.68)).normalized()
                leaf_spray_fan(bm, uv, top, pdir, h * 0.22, h * 0.16, u_range=U_ACCENT, v_range=V_ACCENT, arch=-0.18, cup=0.24, tip_scale=0.55)
        return True

    if _match_any(aid, ('trillium', 'oxalis')):
        stems = 4 if 'trillium' in aid else 9
        for s in range(stems):
            a = (s / stems) * math.tau + rng.uniform(-0.18, 0.18)
            b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.02))
            whorl = b + Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, h * rng.uniform(0.62, 0.88)))
            tube(bm, uv, [b, whorl], [0.015, 0.010], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for k in range(3):
                la = a + (k / 3.0) * math.tau
                ldir = Vector((math.cos(la), math.sin(la), -0.10)).normalized()
                leaf_spray_fan(bm, uv, whorl, ldir, h * 0.34, h * 0.24, u_range=U_FOLIAGE, v_range=V_FOLIAGE, arch=0.10, cup=0.14, tip_scale=0.22)
            flw = whorl + Vector((0.0, 0.0, h * 0.18))
            tube(bm, uv, [whorl, flw], [0.008, 0.006], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            _flower_head_ring(bm, uv, flw, Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, 1.0)), h * 0.14, 3 if 'trillium' in aid else 5, rng, has_disc=True)
        return True

    if 'cotton_grass' in aid:
        for i in range(22):
            a = (i / 22.0) * math.tau + rng.uniform(-0.15, 0.15)
            _quad_blade(bm, uv, Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.02)), Vector((math.cos(a), math.sin(a), rng.uniform(0.35, 0.85))).normalized(), h * rng.uniform(0.45, 0.72), 0.045, arch=-0.22, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        for s in range(9):
            a = (s / 9.0) * math.tau + rng.uniform(-0.2, 0.2)
            b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.03))
            top = b + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, h * rng.uniform(0.72, 1.04)))
            tube(bm, uv, [b, b.lerp(top, 0.5) + Vector((0, 0, 0.04)), top], [0.012, 0.009, 0.006], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            mushroom_dome(bm, uv, top - Vector((0, 0, 0.015)), 0.025, 0.018, sides=6, u_range=U_BARK, v_range=V_BARK)
            rock_chunk(bm, uv, top + Vector((0.0, 0.0, 0.028)), Vector((0.055, 0.055, 0.048)), u_range=U_ACCENT, v_range=V_ACCENT, subdivisions=2, rng=rng, dome=True)
        return True

    return False


SHRUBLET_WORDS = (
    'yarrow', 'heather', 'lantana', 'lavender', 'clover', 'buckwheat', 'rabbitbrush',
    'samphire', 'sea_holly', 'beach_pea', 'sea_buckthorn', 'creosote', 'sagebrush',
    'wait_a_bit', 'gorse', 'thistle', 'tea', 'cloudberry', 'lingonberry', 'crowberry',
    'lichen', 'bramble', 'rhododendron', 'salal', 'devils_club', 'bog_myrtle',
    'shrub', 'berry', 'bush', 'juniper', 'dwarf', 'birch', 'willow', 'scrub', 'broom',
)


def build_shrublet_or_cushion(bm, uv, rng, h, aid, force=False):
    """Woody dwarf shrubs, heathers, lichens, sea-buckthorn, yarrow, clover, devil's club."""
    if not force and not _match_any(aid, SHRUBLET_WORDS):
        return False
    if 'lichen' in aid:
        for i in range(6):
            a = (i / 6.0) * math.tau + rng.uniform(-0.2, 0.2)
            cpos = Vector((math.cos(a) * 0.16, math.sin(a) * 0.16, 0.035))
            rock_chunk(bm, uv, cpos, Vector((0.12, 0.11, 0.045)) * rng.uniform(0.8, 1.2), u_range=U_SOIL, v_range=V_SOIL, subdivisions=2, rng=rng, dome=True)
        for i in range(22):
            a = (i / 22.0) * math.tau + rng.uniform(-0.22, 0.22)
            r = rng.uniform(0.03, 0.24)
            p0 = Vector((math.cos(a) * r, math.sin(a) * r, 0.03))
            sh = max(0.14, h * rng.uniform(0.75, 1.25))
            p1 = p0 + Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, sh * 0.45))
            tube(bm, uv, [p0, p1], [0.020, 0.014], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for side in (-0.65, 0.65):
                fa = a + side
                p2 = p1 + Vector((math.cos(fa) * 0.08, math.sin(fa) * 0.08, sh * 0.40))
                tube(bm, uv, [p1, p2], [0.013, 0.008], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                mushroom_dome(bm, uv, p2, 0.018, 0.012, sides=6, u_range=U_ACCENT if i % 2 == 0 else U_FOLIAGE, v_range=V_ACCENT if i % 2 == 0 else V_FOLIAGE)
        return True

    if 'devils_club' in aid:
        cane_top = Vector((0.08, -0.05, h * 0.92))
        tube(bm, uv, [Vector((0, 0, 0)), Vector((0.03, -0.02, h * 0.45)), cane_top], [0.065, 0.052, 0.036], sides=7, u_range=U_BARK, v_range=V_BARK, rough=0.10, rng=rng)
        for sp in range(12):
            sa = sp * 2.2
            sz = h * rng.uniform(0.12, 0.78)
            sp0 = Vector((math.cos(sa) * 0.04, math.sin(sa) * 0.04, sz))
            _quad_blade(bm, uv, sp0, Vector((math.cos(sa), math.sin(sa), 0.25)).normalized(), 0.06, 0.018, arch=0.05, u_range=U_ACCENT, v_range=V_ACCENT)
        for lv in range(8):
            a = (lv / 8.0) * math.tau + 0.3
            zt = 0.34 + 0.56 * (lv / 7.0)
            attach = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, h * zt))
            hub = attach + Vector((math.cos(a) * rng.uniform(0.16, 0.28), math.sin(a) * rng.uniform(0.16, 0.28), rng.uniform(-0.04, 0.12)))
            tube(bm, uv, [attach, hub], [0.016, 0.010], sides=4, u_range=U_BARK, v_range=V_BARK)
            for lb in range(5):
                la = a + (lb - 2) * 0.52
                ldir = Vector((math.cos(la), math.sin(la), rng.uniform(-0.34, -0.08))).normalized()
                _quad_blade(bm, uv, hub, ldir, h * 0.24, h * 0.12, arch=0.12, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        for bk in range(10):
            bz = cane_top.z + 0.04 + 0.022 * bk
            ba = bk * 2.1
            mushroom_dome(bm, uv, Vector((cane_top.x + math.cos(ba) * 0.03, cane_top.y + math.sin(ba) * 0.03, bz)), 0.026, 0.026, sides=6, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    # General woody shrublets, heathers, umbels, berries & thorny bushes
    spread = 0.78 if h < 0.45 else 0.48
    tips = _branching_wood_base(bm, uv, rng, 7, max(0.32, h * 0.85), base_r=0.048, spread=spread)
    if h < 0.45:
        _basal_foliage_ring(bm, uv, rng, 10, 0.22, 0.24, 0.12, z=0.04, arch=0.10)
    is_umbel = _match_any(aid, ('yarrow', 'lantana', 'buckwheat', 'rabbitbrush'))
    is_spike = _match_any(aid, ('heather', 'lavender'))
    is_spiny = _match_any(aid, ('sea_holly', 'thistle', 'gorse', 'wait_a_bit'))
    is_clover = 'clover' in aid

    for p1, p2, p3, a in tips:
        # Inner + outer foliage sprays anchored cleanly on wood limbs
        for pt in (p1, p2, p3):
            for side in (-0.55, 0.0, 0.55):
                fa = a + side + rng.uniform(-0.18, 0.18)
                fdir = Vector((math.cos(fa), math.sin(fa), rng.uniform(0.18, 0.65))).normalized()
                _quad_blade(
                    bm,
                    uv,
                    pt,
                    fdir,
                    h * rng.uniform(0.26, 0.40),
                    h * (0.20 if is_clover else 0.14),
                    arch=0.14,
                    u_range=U_FOLIAGE,
                    v_range=V_FOLIAGE,
                )
        for tip_side in (-0.35, 0.35):
            fa = a + tip_side
            leaf_spray_fan(
                bm,
                uv,
                p3,
                Vector((math.cos(fa), math.sin(fa), rng.uniform(0.20, 0.55))).normalized(),
                h * rng.uniform(0.28, 0.42),
                h * (0.22 if is_clover else 0.15),
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
                arch=0.14,
                cup=0.18,
                tip_scale=0.35,
            )
        if is_umbel:
            for k in range(5):
                ua = (k / 5.0) * math.tau
                u_pos = p3 + Vector((math.cos(ua) * 0.045, math.sin(ua) * 0.045, 0.04))
                mushroom_dome(bm, uv, u_pos, 0.038, 0.028, sides=6, u_range=U_ACCENT, v_range=V_ACCENT)
        elif is_spike:
            top_sp = p3 + Vector((0.0, 0.0, h * 0.26))
            tube(bm, uv, [p3, top_sp], [0.012, 0.005], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for k in range(8):
                sp = p3.lerp(top_sp, k / 7.0)
                mushroom_dome(bm, uv, sp + Vector((math.cos(k * 2.2) * 0.02, math.sin(k * 2.2) * 0.02, 0.0)), 0.022, 0.024, sides=5, u_range=U_ACCENT, v_range=V_ACCENT)
        elif is_spiny:
            mushroom_dome(bm, uv, p3 + Vector((0, 0, 0.02)), 0.042, 0.048, sides=7, u_range=U_ACCENT, v_range=V_ACCENT)
            for k in range(6):
                sa = a + (k / 6.0) * math.tau
                sp0 = p3 + Vector((math.cos(sa) * 0.02, math.sin(sa) * 0.02, 0.01))
                _quad_blade(bm, uv, sp0, Vector((math.cos(sa), math.sin(sa), 0.24)).normalized(), 0.09, 0.022, arch=0.04, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        else:
            for b_pt in (p2, p3):
                for bk in range(2):
                    ba = a + bk * 1.4
                    mushroom_dome(bm, uv, b_pt + Vector((math.cos(ba) * 0.03, math.sin(ba) * 0.03, 0.02)), 0.028, 0.028, sides=6, u_range=U_ACCENT, v_range=V_ACCENT)
    return True


def build_fern_cycad_or_wetland(bm, uv, rng, h, aid):
    """Pinnate ferns, armored cycads, split monstera, pitchers, bromeliads, horsetail & oat."""
    if _match_any(aid, ('fern', 'cycad')):
        is_cycad = 'cycad' in aid
        z0 = 0.05
        if is_cycad:
            z0 = h * 0.34
            tube(
                bm,
                uv,
                [Vector((0, 0, 0)), Vector((0, 0, z0))],
                [h * 0.18, h * 0.14],
                sides=10,
                u_range=U_BARK,
                v_range=V_BARK,
                flute_count=8,
                flute_depth=0.14,
            )
            mushroom_dome(bm, uv, Vector((0, 0, z0)), h * 0.08, h * 0.20, sides=8, u_range=U_ACCENT, v_range=V_ACCENT)
        else:
            rock_chunk(bm, uv, Vector((0, 0, 0.05)), Vector((0.14, 0.14, 0.08)), u_range=U_BARK, v_range=V_BARK, subdivisions=2, rng=rng, dome=True)
            for k in range(3):
                fa = k * 2.1
                f0 = Vector((math.cos(fa) * 0.03, math.sin(fa) * 0.03, 0.06))
                f1 = f0 + Vector((math.cos(fa) * 0.04, math.sin(fa) * 0.04, h * 0.25))
                f2 = f1 + Vector((math.cos(fa) * -0.02, math.sin(fa) * -0.02, 0.05))
                tube(bm, uv, [f0, f1, f2], [0.016, 0.012, 0.008], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)

        fronds = 13
        for i in range(fronds):
            a = (i / fronds) * math.tau + rng.uniform(-0.14, 0.14)
            r_dir = Vector((math.cos(a), math.sin(a), 0.0))
            fl = h * rng.uniform(0.78, 1.12)
            p0 = r_dir * 0.05 + Vector((0, 0, z0))
            p1 = r_dir * (fl * 0.42) + Vector((0, 0, z0 + fl * 0.48))
            p2 = r_dir * (fl * 0.92) + Vector((0, 0, z0 + fl * (0.28 if is_cycad else 0.18)))
            tube(bm, uv, [p0, p1, p2], [0.016, 0.011, 0.004], sides=5, u_range=U_BARK, v_range=V_BARK)
            pairs = 8 if is_cycad else 10
            for j in range(1, pairs + 1):
                t = j / (pairs + 1)
                mid = (1 - t) * ((1 - t) * p0 + t * p1) + t * ((1 - t) * p1 + t * p2)
                llen = h * (0.22 if is_cycad else 0.26) * math.sin(t * math.pi * 0.92)
                lw = 0.026 if is_cycad else 0.042
                tang = (p2 - p0).normalized()
                side = tang.cross(Vector((0, 0, 1))).normalized()
                for sgn in (-1.0, 1.0):
                    pdir = (side * sgn + tang * 0.35 + Vector((0, 0, 0.16))).normalized()
                    _quad_blade(bm, uv, mid, pdir, llen, lw, arch=0.10, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        return True

    if 'monstera' in aid:
        tube(bm, uv, [Vector((0, 0, 0)), Vector((0.06, 0.04, h * 0.42))], [0.06, 0.045], sides=7, u_range=U_BARK, v_range=V_BARK)
        for i in range(8):
            a = (i / 8.0) * math.tau + rng.uniform(-0.18, 0.18)
            p0 = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, h * rng.uniform(0.08, 0.26)))
            p1 = p0 + Vector((math.cos(a) * h * 0.34, math.sin(a) * h * 0.34, h * rng.uniform(0.30, 0.56)))
            tube(bm, uv, [p0, p1], [0.018, 0.012], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for lb in (-0.52, -0.18, 0.18, 0.52):
                la = a + lb
                ldir = Vector((math.cos(la), math.sin(la), -0.15)).normalized()
                _quad_blade(bm, uv, p1, ldir, h * 0.34, h * 0.11, arch=0.14, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        return True

    if 'bromeliad' in aid:
        for i in range(20):
            t = i / 19.0
            a = i * 2.39996
            ldir = Vector((math.cos(a), math.sin(a), 0.22 + 0.72 * t)).normalized()
            leaf_spray_fan(bm, uv, Vector((0, 0, 0.04)), ldir, h * (0.76 - 0.18 * t), h * 0.16, u_range=U_FOLIAGE, v_range=V_FOLIAGE, arch=-0.16, cup=0.22, tip_scale=0.18)
        tube(bm, uv, [Vector((0, 0, 0.06)), Vector((0, 0, h * 0.94))], [0.032, 0.010], sides=6, u_range=U_ACCENT, v_range=V_ACCENT)
        for br in range(8):
            ba = br * 2.4
            bdir = Vector((math.cos(ba) * 0.55, math.sin(ba) * 0.55, 0.85)).normalized()
            _quad_blade(bm, uv, Vector((0, 0, h * (0.48 + 0.05 * br))), bdir, h * 0.20, h * 0.08, arch=0.16, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if 'pitcher' in aid:
        rock_chunk(bm, uv, Vector((0, 0, 0.05)), Vector((0.20, 0.18, 0.07)), u_range=U_FOLIAGE, v_range=V_FOLIAGE, subdivisions=2, rng=rng, dome=True)
        for i in range(9):
            a = (i / 9.0) * math.tau + rng.uniform(-0.18, 0.18)
            ph = h * rng.uniform(0.68, 1.05)
            b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.05))
            m = b + Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, ph * 0.45))
            rim = b + Vector((math.cos(a) * 0.16, math.sin(a) * 0.16, ph))
            tube(bm, uv, [b, m, rim], [0.014, 0.038, 0.058], sides=8, u_range=U_FOLIAGE, v_range=V_FOLIAGE, cap_end=False)
            mushroom_dome(bm, uv, rim + Vector((0, 0, 0.008)), 0.062, 0.018, sides=8, u_range=U_ACCENT, v_range=V_ACCENT)
            neck0 = rim + Vector((math.cos(a) * -0.042, math.sin(a) * -0.042, 0.004))
            lid_p = rim + Vector((math.cos(a) * 0.012, math.sin(a) * 0.012, 0.036))
            tube(bm, uv, [neck0, lid_p], [0.016, 0.014], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            mushroom_dome(bm, uv, lid_p, 0.056, 0.026, sides=8, u_range=U_ACCENT, v_range=V_ACCENT, tilt=Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, 1.0)))
        return True

    if 'plantain' in aid:
        for i in range(14):
            t = i / 13.0
            a = i * 2.39996 + rng.uniform(-0.10, 0.10)
            ldir = Vector((math.cos(a), math.sin(a), 0.14 + 0.24 * t)).normalized()
            leaf_spray_fan(
                bm,
                uv,
                Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, 0.03 + t * 0.03)),
                ldir,
                max(0.28, h * 1.45) * rng.uniform(0.85, 1.15),
                max(0.16, h * 0.72),
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
                arch=0.06,
                cup=0.14,
                tip_scale=0.32,
            )
        for sp in range(5):
            sa = (sp / 5.0) * math.tau + 0.3
            sb = Vector((math.cos(sa) * 0.03, math.sin(sa) * 0.03, 0.04))
            stop = sb + Vector((math.cos(sa) * 0.05, math.sin(sa) * 0.05, max(0.32, h * 1.55) * rng.uniform(0.82, 1.05)))
            tube(bm, uv, [sb, stop], [0.012, 0.008], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for k in range(7):
                bp = sb.lerp(stop, 0.48 + 0.50 * (k / 6.0))
                mushroom_dome(bm, uv, bp, 0.018, 0.024, sides=5, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if 'cabbage' in aid:
        for i in range(9):
            a = (i / 9.0) * math.tau + rng.uniform(-0.14, 0.14)
            ldir = Vector((math.cos(a), math.sin(a), rng.uniform(0.32, 0.72))).normalized()
            leaf_spray_fan(bm, uv, Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.04)), ldir, h * rng.uniform(0.65, 0.95), h * 0.42, u_range=U_FOLIAGE, v_range=V_FOLIAGE, arch=0.14, cup=0.34, tip_scale=0.45)
        mushroom_dome(bm, uv, Vector((0, 0, 0.08)), 0.10, h * 0.45, sides=8, u_range=U_ACCENT, v_range=V_ACCENT, tilt=Vector((0.25, 0.0, 1.0)))
        return True

    if 'sundew' in aid:
        rock_chunk(bm, uv, Vector((0, 0, 0.04)), Vector((0.22, 0.22, 0.055)), u_range=U_FOLIAGE, v_range=V_FOLIAGE, subdivisions=2, rng=rng, dome=True)
        for i in range(18):
            t = i / 17.0
            a = i * 2.39996
            ldir = Vector((math.cos(a), math.sin(a), 0.18 + 0.56 * t)).normalized()
            st_end = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, 0.04)) + ldir * max(0.18, h * 0.78)
            tube(bm, uv, [Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, 0.04)), st_end], [0.010, 0.006], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            mushroom_dome(bm, uv, st_end, 0.022, 0.010, sides=6, u_range=U_ACCENT, v_range=V_ACCENT, tilt=ldir)
            for c_idx in range(5):
                ca = a + (c_idx / 5.0) * math.tau
                cdir = (Vector((math.cos(ca) * 0.75, math.sin(ca) * 0.75, 0.45)) + ldir * 0.35).normalized()
                _quad_blade(bm, uv, st_end, cdir, 0.048, 0.008, arch=0.04, u_range=U_ACCENT, v_range=V_ACCENT)
        for s_idx in range(2):
            sa = s_idx * 2.6 + 0.5
            s_top = Vector((math.cos(sa) * 0.05, math.sin(sa) * 0.05, max(0.28, h * 1.15)))
            tube(bm, uv, [Vector((0, 0, 0.05)), s_top], [0.009, 0.005], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            _flower_head_ring(bm, uv, s_top, Vector((0, 0, 1)), 0.042, 5, rng, has_disc=True)
        return True

    if 'horsetail' in aid:
        for i in range(11):
            a = (i / 11.0) * math.tau + rng.uniform(-0.18, 0.18)
            r = rng.uniform(0.04, 0.22)
            ch = h * rng.uniform(0.65, 1.02)
            b = Vector((math.cos(a) * r, math.sin(a) * r, 0.0))
            top = b + Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, ch))
            tube(bm, uv, [b, top], [0.016, 0.009], sides=5, u_range=U_BARK, v_range=V_BARK)
            for tier in range(1, 5):
                np_pt = b.lerp(top, tier * 0.20)
                for n_idx in range(7):
                    na = n_idx * (math.tau / 7.0) + tier * 0.3
                    ndir = Vector((math.cos(na), math.sin(na), 0.42)).normalized()
                    _quad_blade(bm, uv, np_pt, ndir, ch * 0.22, 0.018, arch=0.06, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            mushroom_dome(bm, uv, top, 0.018, 0.045, sides=6, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if _match_any(aid, ('oat', 'grass', 'sedge', 'reed')):
        for i in range(28):
            a = (i / 28.0) * math.tau + rng.uniform(-0.16, 0.16)
            _quad_blade(bm, uv, Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.02)), Vector((math.cos(a), math.sin(a), rng.uniform(0.28, 0.78))).normalized(), h * rng.uniform(0.55, 0.92), 0.048, arch=-0.24, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        for s in range(9):
            a = (s / 9.0) * math.tau + rng.uniform(-0.2, 0.2)
            b = Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.02))
            p1 = b + Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, h * 0.62))
            p2 = p1 + Vector((math.cos(a) * 0.16, math.sin(a) * 0.16, h * 0.36))
            tube(bm, uv, [b, p1, p2], [0.012, 0.008, 0.004], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for g in range(5):
                gp = p1.lerp(p2, 0.35 + 0.15 * g)
                ga = a + g * 1.4
                mushroom_dome(bm, uv, gp + Vector((math.cos(ga) * 0.03, math.sin(ga) * 0.03, -0.02)), 0.018, 0.036, sides=5, u_range=U_ACCENT, v_range=V_ACCENT, tilt=Vector((0.2, 0.2, -1.0)))
        return True

    return False


def build_trunk_rock_or_ice(bm, uv, rng, h, kind, aid):
    """Glacial ice spires, cypress knees, termite mounds, stone cairns/milestones, snags & saplings."""
    if kind == 'ice':
        rock_chunk(bm, uv, Vector((0, 0, h * 0.08)), Vector((h * 0.42, h * 0.38, h * 0.15)), u_range=U_BARK, v_range=V_BARK, subdivisions=2, rng=rng, dome=True)
        if 'frost_crystal_rose' in aid or 'rose' in aid:
            for i in range(14):
                t = i / 13.0
                a = i * 2.39996
                fdir = Vector((math.cos(a), math.sin(a), 0.18 + 0.75 * t)).normalized()
                _quad_blade(bm, uv, Vector((0, 0, 0.08)), fdir, h * (0.95 - 0.35 * t), h * 0.28, arch=-0.08, u_range=U_ACCENT if i % 2 else U_FOLIAGE, v_range=V_ACCENT if i % 2 else V_FOLIAGE)
        elif 'pressure_ridge' in aid or 'heave' in aid:
            for i in range(6):
                a = (i / 6.0) * math.tau + rng.uniform(-0.2, 0.2)
                sw = h * rng.uniform(0.32, 0.52)
                sh = h * (0.95 if i == 0 else rng.uniform(0.45, 0.80))
                b = Vector((math.cos(a) * h * 0.18, math.sin(a) * h * 0.18, 0.04))
                top = b + Vector((math.cos(a) * h * 0.12, math.sin(a) * h * 0.12, sh))
                tube(bm, uv, [b, top], [sw, sw * 0.58], sides=4, u_range=U_FOLIAGE if i % 2 else U_BARK, v_range=V_FOLIAGE if i % 2 else V_BARK, scale_y=0.22)
        elif 'penitentes' in aid:
            for i in range(11):
                a = rng.uniform(-0.25, 0.25) + 0.55
                off = Vector((rng.uniform(-h * 0.28, h * 0.28), rng.uniform(-h * 0.22, h * 0.22), 0.03))
                sh = h * rng.uniform(0.55, 1.08)
                top = off + Vector((math.cos(a) * sh * 0.32, math.sin(a) * sh * 0.32, sh))
                tube(bm, uv, [off, off.lerp(top, 0.55), top], [h * 0.10, h * 0.075, 0.010], sides=5, u_range=U_ACCENT if i % 2 else U_FOLIAGE, v_range=V_ACCENT if i % 2 else V_FOLIAGE, scale_y=0.34)
        else:
            for i in range(7):
                a = (i / 7.0) * math.tau + rng.uniform(-0.22, 0.22)
                tilt = 0.06 if i == 0 else rng.uniform(0.16, 0.44)
                ih = h * (1.05 if i == 0 else rng.uniform(0.45, 0.86))
                ir = h * (0.20 if i == 0 else rng.uniform(0.10, 0.16))
                b = Vector((math.cos(a) * (0.0 if i == 0 else ir * 1.2), math.sin(a) * (0.0 if i == 0 else ir * 1.2), 0.04))
                m = b + Vector((math.cos(a) * ih * tilt * 0.5, math.sin(a) * ih * tilt * 0.5, ih * 0.65))
                tip = b + Vector((math.cos(a) * ih * tilt, math.sin(a) * ih * tilt, ih))
                tube(
                    bm,
                    uv,
                    [b, m, tip],
                    [ir, ir * 0.72, 0.014],
                    sides=6,
                    u_range=U_ACCENT if i % 2 else U_FOLIAGE,
                    v_range=V_ACCENT if i % 2 else V_FOLIAGE,
                )
        return True

    if 'knees' in aid:
        rock_chunk(bm, uv, Vector((0, 0, 0.06)), Vector((0.36, 0.32, 0.10)), u_range=U_FOLIAGE, v_range=V_FOLIAGE, subdivisions=2, rng=rng, dome=True)
        for i in range(8):
            a = (i / 8.0) * math.tau + rng.uniform(-0.2, 0.2)
            r = 0.0 if i == 0 else rng.uniform(0.14, 0.36)
            kh = h * (1.0 if i == 0 else rng.uniform(0.42, 0.82))
            kr = h * (0.18 if i == 0 else rng.uniform(0.08, 0.14))
            b = Vector((math.cos(a) * r, math.sin(a) * r, 0.0))
            pts = [b, b + Vector((0, 0, kh * 0.45)), b + Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, kh))]
            tube(bm, uv, pts, [kr * 1.25, kr * 0.72, kr * 0.28], sides=8, u_range=U_BARK, v_range=V_BARK, flute_count=6, flute_depth=0.14)
        return True

    if 'termite' in aid:
        tube(
            bm,
            uv,
            [Vector((0, 0, 0)), Vector((0.02, -0.02, h * 0.38)), Vector((0.04, 0.02, h * 0.80)), Vector((0.02, 0.0, h * 1.02))],
            [h * 0.34, h * 0.24, h * 0.12, h * 0.04],
            sides=10,
            u_range=U_BARK,
            v_range=V_BARK,
            flute_count=8,
            flute_depth=0.16,
            rough=0.12,
            rng=rng,
        )
        for i in range(6):
            a = (i / 6.0) * math.tau + rng.uniform(-0.2, 0.2)
            ch = h * rng.uniform(0.45, 0.78)
            r = h * rng.uniform(0.18, 0.28)
            b = Vector((math.cos(a) * r, math.sin(a) * r, 0.0))
            tube(bm, uv, [b, b * 0.7 + Vector((0, 0, ch * 0.5)), b * 0.45 + Vector((0, 0, ch))], [h * 0.12, h * 0.08, h * 0.03], sides=7, u_range=U_BARK, v_range=V_BARK, flute_count=5, flute_depth=0.12)
        return True

    if _match_any(aid, ('milestone', 'cairn', 'boulder', 'stone')):
        rock_chunk(bm, uv, Vector((0, 0, h * 0.14)), Vector((h * 0.36, h * 0.30, h * 0.20)), u_range=U_BARK, v_range=V_BARK, subdivisions=2, rng=rng)
        rock_chunk(bm, uv, Vector((0.02, 0.01, h * 0.56)), Vector((h * 0.22, h * 0.16, h * 0.42)), u_range=U_BARK, v_range=V_BARK, subdivisions=2, rng=rng)
        for i in range(4):
            a = (i / 4.0) * math.tau + 0.4
            rock_chunk(bm, uv, Vector((math.cos(a) * h * 0.24, math.sin(a) * h * 0.24, h * 0.12)), Vector((h * 0.14, h * 0.12, h * 0.12)), u_range=U_FOLIAGE if i == 0 else U_BARK, v_range=V_FOLIAGE if i == 0 else V_BARK, subdivisions=2, rng=rng)
        return True

    if 'stump' in aid:
        r0 = max(0.18, h * 0.26)
        tube(bm, uv, [Vector((0, 0, 0)), Vector((0.02, -0.01, h * 0.45)), Vector((-0.02, 0.03, h * 0.88))], [r0 * 1.4, r0 * 0.88, r0 * 0.72], sides=10, u_range=U_BARK, v_range=V_BARK, flute_count=8, flute_depth=0.16)
        for k in range(6):
            a = (k / 6.0) * math.tau + rng.uniform(-0.2, 0.2)
            tube(bm, uv, [Vector((math.cos(a) * r0 * 0.8, math.sin(a) * r0 * 0.8, h * 0.36)), Vector((math.cos(a) * r0 * 2.2, math.sin(a) * r0 * 2.2, 0.0))], [r0 * 0.36, r0 * 0.14], sides=6, u_range=U_BARK, v_range=V_BARK)
            if k % 2 == 0:
                mushroom_dome(bm, uv, Vector((math.cos(a) * r0 * 0.9, math.sin(a) * r0 * 0.9, h * 0.42)), 0.08, 0.026, sides=7, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if kind == 'trunk' or _match_any(aid, ('snag', 'sapling')):
        is_sapling = 'sapling' in aid
        r0 = max(0.08, h * (0.11 if is_sapling else 0.15))
        pts = [Vector((0, 0, 0)), Vector((0.04, -0.02, h * 0.36)), Vector((-0.03, 0.05, h * 0.74)), Vector((0.04, -0.02, h * 0.98))]
        tube(bm, uv, pts, [r0 * 1.35, r0 * 0.82, r0 * 0.48, r0 * 0.18], sides=9, u_range=U_BARK, v_range=V_BARK, flute_count=6, flute_depth=0.10, rough=0.06, rng=rng)
        for i in range(6):
            a = (i / 6.0) * math.tau + rng.uniform(-0.22, 0.22)
            tube(bm, uv, [Vector((math.cos(a) * r0 * 0.65, math.sin(a) * r0 * 0.65, h * 0.16)), Vector((math.cos(a) * r0 * 2.4, math.sin(a) * r0 * 2.4, 0.0))], [r0 * 0.42, r0 * 0.10], sides=5, u_range=U_BARK, v_range=V_BARK)
            if i < 5:
                bp = pts[1].lerp(pts[2], i / 4.0)
                tip = bp + Vector((math.cos(a) * h * 0.36, math.sin(a) * h * 0.36, h * 0.26))
                tube(bm, uv, [bp, tip], [r0 * 0.38, r0 * 0.12], sides=5, u_range=U_BARK, v_range=V_BARK)
                if is_sapling:
                    for k in range(5):
                        la = a + (k - 2) * 0.55
                        leaf_spray_fan(bm, uv, tip, Vector((math.cos(la), math.sin(la), 0.28)).normalized(), h * 0.26, h * 0.14, u_range=U_FOLIAGE, v_range=V_FOLIAGE, arch=0.12, cup=0.18)
        return True

    return False


def build_flora_archetype(bm, uv, rng, h, kind, aid=''):
    """Dispatch each biome specimen to its specialized botanical or mineral geometry builder."""
    aid_l = (aid or '').lower()
    if _match_any(aid_l, ('knees', 'stump', 'milestone', 'cairn', 'boulder', 'stone', 'termite', 'snag', 'sapling')) or kind in ('ice', 'trunk'):
        if build_trunk_rock_or_ice(bm, uv, rng, h, kind, aid_l):
            return
    if build_succulent_or_cactus(bm, uv, rng, h, aid_l):
        return
    if build_tall_spire_or_stalk(bm, uv, rng, h, aid_l):
        return
    if build_cupped_blossom(bm, uv, rng, h, aid_l):
        return
    if build_fern_cycad_or_wetland(bm, uv, rng, h, aid_l):
        return
    if build_shrublet_or_cushion(bm, uv, rng, h, aid_l, force=False):
        return

    # Species-independent botanical fallbacks so unmatched specs remain detailed
    if kind == 'smallPlant':
        _basal_foliage_ring(bm, uv, rng, 10, 0.14, h * 0.45, h * 0.15, z=0.04, arch=0.12)
        for s in range(4):
            a = (s / 4.0) * math.tau + 0.35
            b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.03))
            top = b + Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, h * rng.uniform(0.75, 1.0)))
            tube(bm, uv, [b, b.lerp(top, 0.5) + Vector((0, 0, 0.04)), top], [0.015, 0.010, 0.007], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            _flower_head_ring(bm, uv, top, Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 0.92)), h * 0.15, 7, rng, has_disc=True)
    else:
        build_shrublet_or_cushion(bm, uv, rng, h, aid_l, force=True)
