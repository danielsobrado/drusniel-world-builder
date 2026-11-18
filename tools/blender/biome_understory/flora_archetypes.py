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

from aaa_geometry import (
    fern_crosier_spiral,
    fern_frond,
    flower_bell_corolla,
    flower_daisy_head,
    flower_spike_raceme,
    flower_tropical_bract,
    flower_umbel_corymb,
    grass_blade_clump,
    shaped_leaf,
    volumetric_succulent_blade,
)
from aaa_natural_forms import (
    buttress_root_system,
    crystal_cluster_formation,
    ice_formation_mesh,
    mushroom_cluster_mesh,
    organic_trunk_loft,
    planar_rock,
    splintered_fracture_cap,
)
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
    """Lightweight 3-segment tapered creased blade (12 tris) for fine spines, needles, or awns."""
    f = forward_dir.normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(f.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    right = f.cross(ref).normalized()
    up_perp = right.cross(f).normalized()
    u0, u1 = u_range
    v0, v1 = v_range
    uc = 0.5 * (u0 + u1)

    pts = []
    for t in (0.0, 0.42, 0.78):
        mid = origin + f * (length * t) + up_perp * (length * arch * math.sin(t * math.pi))
        hw = width * (0.24 + 0.76 * math.sin(max(0.14, t) * math.pi * 0.85))
        cup = up_perp * (width * 0.16)
        vl = bm.verts.new(mid - right * (hw * 0.95) + cup)
        vm = bm.verts.new(mid)
        vr = bm.verts.new(mid + right * (hw * 1.05) + cup * 0.9)
        vt = v0 + (v1 - v0) * t
        pts.append(((vl, (u0, vt)), (vm, (uc, vt)), (vr, (u1, vt))))
    tip = bm.verts.new(origin + f * length + up_perp * (length * arch * 0.30))
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


def _basal_foliage_ring(
    bm,
    uv,
    rng,
    count,
    radius,
    length,
    width,
    z=0.04,
    arch=0.14,
    profile='ovate',
    serration_amp=0.06,
    droop=0.14,
):
    """Layered phyllotaxis rosette of sculpted asymmetric leaves anchored near soil level."""
    base_z = min(z, -0.015) if z <= 0.05 else z
    for i in range(count):
        tier = 0 if i < (count * 0.55) else 1
        a = i * 2.39996 + rng.uniform(-0.18, 0.18)
        pitch = rng.uniform(0.18, 0.42) if tier == 0 else rng.uniform(0.45, 0.72)
        fdir = Vector((math.cos(a), math.sin(a), pitch)).normalized()
        rr = radius * rng.uniform(0.16, 0.38)
        attach = Vector((math.cos(a) * rr, math.sin(a) * rr, base_z + tier * 0.025))
        llen = length * rng.uniform(0.82, 1.18) * (1.04 if tier == 0 else 0.84)
        lwid = width * rng.uniform(0.86, 1.14)
        shaped_leaf(
            bm,
            uv,
            attach,
            fdir,
            llen,
            lwid,
            profile=profile,
            asym=rng.uniform(0.08, 0.20),
            twist=rng.uniform(-0.16, 0.16),
            arch=arch,
            droop=droop if tier == 0 else droop * 0.65,
            cup_depth=0.20,
            serration_amp=serration_amp,
            serration_freq=5,
            damaged=(i == 1),
            petiole=llen * 0.12,
            u_range=U_FOLIAGE,
            v_range=V_FOLIAGE,
            stem_u_range=U_BARK,
            stem_v_range=V_BARK,
        )


def _branching_wood_base(bm, uv, rng, stem_count, height, base_r=0.055, spread=0.35):
    """Build gnarled multi-stemmed woody base rising from soil-sunk root flares."""
    tips = []
    dom_yaw = rng.uniform(0.0, math.tau)
    for i in range(stem_count):
        a = (i / max(stem_count, 1)) * math.tau + rng.uniform(-0.32, 0.32)
        wind_bias = 0.78 + 0.36 * math.cos(a - dom_yaw)
        r_out = height * spread * rng.uniform(0.65, 1.25) * wind_bias
        h_s = height * rng.uniform(0.58, 1.05) * (1.06 if i % 2 == 0 else 0.88)
        p0 = Vector((math.cos(a) * base_r * 0.45, math.sin(a) * base_r * 0.45, -0.028))
        p1 = Vector((math.cos(a) * r_out * 0.35, math.sin(a) * r_out * 0.35, h_s * 0.38))
        p2 = Vector((math.cos(a + 0.18) * r_out * 0.72, math.sin(a + 0.18) * r_out * 0.72, h_s * 0.72))
        p3 = Vector((math.cos(a + 0.28) * r_out, math.sin(a + 0.28) * r_out, h_s))
        organic_trunk_loft(
            bm,
            uv,
            [p0, p1, p2, p3],
            [base_r * 0.96, base_r * 0.56, base_r * 0.34, base_r * 0.15],
            rng,
            sides=7,
            oval_ratio=0.86,
            twist_rate=0.45,
            bark_ridges=5,
            ridge_depth=0.12,
            knot_frac=0.48,
            cap_start=False,
            cap_end=True,
            u_range=U_BARK,
            v_range=V_BARK,
        )
        tips.append((p1, p2, p3, a))
    return tips


def _flower_head_ring(bm, uv, center, normal, radius, petal_count, rng, has_disc=True):
    """Handcrafted daisy-type blossom with cupped asymmetric ray petals and dome disc."""
    flower_daisy_head(
        bm,
        uv,
        center,
        normal,
        radius,
        petal_count,
        rng,
        U_ACCENT,
        V_ACCENT,
        U_BARK,
        V_BARK,
        U_FOLIAGE,
        V_FOLIAGE,
    )


def _match_any(aid, words):
    return any(w in aid for w in words)


def build_succulent_or_cactus(bm, uv, rng, h, aid):
    """Prickly pear cladodes, ribbed barrel cacti, rosette agave/aloe, or broom ephedra."""
    if 'prickly_pear' in aid:
        organic_trunk_loft(
            bm,
            uv,
            [Vector((0.0, 0.0, -0.03)), Vector((0.02, -0.01, h * 0.22))],
            [0.12, 0.075],
            rng,
            sides=9,
            bark_ridges=6,
            ridge_depth=0.16,
            u_range=U_BARK,
            v_range=V_BARK,
        )
        pads = [
            (Vector((0.0, 0.0, h * 0.15)), 0.17, h * 0.37, 0.0, 0.10),
            (Vector((-0.14, 0.04, h * 0.45)), 0.16, h * 0.35, 0.45, -0.24),
            (Vector((0.16, -0.05, h * 0.49)), 0.15, h * 0.33, -0.38, 0.25),
            (Vector((0.0, -0.14, h * 0.33)), 0.14, h * 0.29, -1.30, 0.22),
            (Vector((-0.24, -0.08, h * 0.75)), 0.12, h * 0.27, 0.80, -0.18),
            (Vector((0.26, 0.06, h * 0.79)), 0.12, h * 0.26, -0.72, 0.20),
            (Vector((0.02, 0.12, h * 0.43)), 0.13, h * 0.28, 1.35, 0.15),
            (Vector((-0.06, 0.18, h * 0.67)), 0.10, h * 0.22, 1.85, -0.14),
        ]
        for p_idx, (base, pw, ph, yaw, lean) in enumerate(pads):
            dir_u = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            side_u = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
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
                [pw * 0.44, pw, pw * 0.90, pw * 0.22],
                sides=10,
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
                scale_y=0.30,
            )
            # Paired spine tufts on upper pad face
            for s_frac in (0.42, 0.68):
                sp_mid = pts[1].lerp(pts[2], s_frac) + side_u * (pw * 0.28)
                for ang in (-0.35, 0.35):
                    _quad_blade(bm, uv, sp_mid, (side_u + Vector((0.0, 0.0, 0.35 + ang * 0.2))).normalized(), 0.055, 0.007, arch=0.0, u_range=U_BARK, v_range=V_BARK)
            crown = pts[-1]
            if p_idx < 5:
                for j in (-0.32, 0.05, 0.36):
                    fp = crown + dir_u * (j * pw)
                    flower_daisy_head(
                        bm,
                        uv,
                        fp + Vector((0.0, 0.0, 0.02)),
                        Vector((dir_u.x * 0.22, dir_u.y * 0.22, 0.97)).normalized(),
                        0.058,
                        7,
                        rng,
                        U_ACCENT,
                        V_ACCENT,
                        U_BARK,
                        V_BARK,
                        U_FOLIAGE,
                        V_FOLIAGE,
                    )
        return True

    if 'barrel_cactus' in aid:
        barrels = [
            (Vector((0.0, 0.0, -0.025)), h * 0.42, h * 0.94, 14),
            (Vector((h * 0.38, h * 0.14, -0.025)), h * 0.24, h * 0.58, 12),
            (Vector((-h * 0.34, -h * 0.18, -0.025)), h * 0.20, h * 0.48, 10),
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
                [br * 0.80, br * 1.05, br * 0.92, br * 0.44],
                sides=ribs,
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
                flute_count=ribs,
                flute_depth=0.16,
            )
            for k in range(6):
                a = (k / 6.0) * math.tau + rng.uniform(-0.15, 0.15)
                fp = bpos + Vector((math.cos(a) * br * 0.32, math.sin(a) * br * 0.32, bh * 0.95))
                f_n = Vector((math.cos(a) * 0.32, math.sin(a) * 0.32, 0.95)).normalized()
                flower_daisy_head(bm, uv, fp, f_n, br * 0.26, 7, rng, U_ACCENT, V_ACCENT, U_BARK, V_BARK, U_FOLIAGE, V_FOLIAGE)
            for r_idx in range(0, ribs, 2):
                a = (r_idx / ribs) * math.tau
                for zf in (0.34, 0.62, 0.82):
                    sp0 = bpos + Vector((math.cos(a) * br * 0.94, math.sin(a) * br * 0.94, bh * zf))
                    for s_ang in (-0.42, 0.0, 0.42):
                        sdir = Vector((math.cos(a + s_ang), math.sin(a + s_ang), 0.38)).normalized()
                        _quad_blade(bm, uv, sp0, sdir, br * 0.22, 0.008, arch=0.02, u_range=U_BARK, v_range=V_BARK)
        return True

    if _match_any(aid, ('agave', 'aloe')):
        is_aloe = 'aloe' in aid
        tube(bm, uv, [Vector((0.0, 0.0, -0.03)), Vector((0.0, 0.0, h * 0.16))], [0.15, 0.09], sides=8, u_range=U_BARK, v_range=V_BARK)
        count = 20 if not is_aloe else 17
        for i in range(count):
            t = i / max(count - 1, 1)
            a = i * 2.39996 + rng.uniform(-0.08, 0.08)
            pitch = 0.14 + 0.94 * t
            fdir = Vector((math.cos(a), math.sin(a), pitch)).normalized()
            blen = h * (0.82 - 0.20 * t) * rng.uniform(0.90, 1.12)
            bw = h * (0.21 if not is_aloe else 0.15) * (1.02 - 0.26 * t)
            thick = bw * (0.30 if not is_aloe else 0.38)
            volumetric_succulent_blade(
                bm,
                uv,
                Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.02 + t * 0.08)),
                fdir,
                blen,
                bw,
                thick,
                arch=-0.14 if not is_aloe else -0.22,
                droop=0.06,
                teeth=True,
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
                accent_u=U_BARK if not is_aloe else U_ACCENT,
                accent_v=V_BARK if not is_aloe else V_ACCENT,
            )
        if is_aloe:
            sp_base = Vector((0.0, 0.0, 0.08))
            sp_top = Vector((-0.03, 0.02, h * 1.16))
            flower_spike_raceme(
                bm,
                uv,
                sp_base,
                sp_top,
                0.085,
                16,
                rng,
                style='foxglove',
                u_accent=U_ACCENT,
                v_accent=V_ACCENT,
                u_foliage=U_FOLIAGE,
                v_foliage=V_FOLIAGE,
                u_bark=U_BARK,
                v_bark=V_BARK,
            )
        return True

    if 'ephedra' in aid:
        planar_rock(bm, uv, Vector((0.0, 0.0, 0.02)), Vector((0.20, 0.16, 0.10)), style='limestone', seed=rng.randint(1, 999), u_range=U_BARK, v_range=V_BARK)
        for i in range(15):
            a = (i / 15.0) * math.tau + rng.uniform(-0.22, 0.22)
            lean = rng.uniform(0.26, 0.82)
            h_stem = h * rng.uniform(0.65, 1.08)
            p0 = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.015))
            p1 = Vector((math.cos(a) * lean * 0.30, math.sin(a) * lean * 0.30, h_stem * 0.45))
            p2 = Vector((math.cos(a + 0.22) * lean * 0.56, math.sin(a + 0.22) * lean * 0.56, h_stem))
            tube(bm, uv, [p0, p1, p2], [0.020, 0.014, 0.006], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            f_dir = Vector((math.cos(a - 0.35) * 0.45, math.sin(a - 0.35) * 0.45, 0.85)).normalized()
            f_tip = p1 + f_dir * (h_stem * 0.44)
            tube(bm, uv, [p1, f_tip], [0.012, 0.005], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            if i % 2 == 0:
                cone_pt = p1 + f_dir * (h_stem * 0.24)
                flower_bell_corolla(bm, uv, cone_pt, Vector((0, 0, 1)), 0.048, 0.022, rng, U_ACCENT, V_ACCENT, U_FOLIAGE, V_FOLIAGE)
        return True

    return False


def build_tall_spire_or_stalk(bm, uv, rng, h, aid):
    """Bamboo culms, corn stalks, tropical heliconia/strelitzia, and flower spires."""
    if 'bamboo' in aid:
        culms = 7
        for i in range(culms):
            a = (i / culms) * math.tau + rng.uniform(-0.24, 0.24)
            rad = rng.uniform(0.05, 0.22)
            ch = h * rng.uniform(0.76, 1.08)
            lean = Vector((math.cos(a), math.sin(a), 0.0)) * (ch * rng.uniform(0.08, 0.22))
            b = Vector((math.cos(a) * rad, math.sin(a) * rad, -0.025))
            pts = [b, b + lean * 0.25 + Vector((0, 0, ch * 0.34)), b + lean * 0.65 + Vector((0, 0, ch * 0.72)), b + lean + Vector((0, 0, ch))]
            tube(bm, uv, pts, [0.044, 0.036, 0.028, 0.014], sides=8, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for nj in range(1, 5):
                t = nj * 0.21
                npos = b + lean * (t * t) + Vector((0.0, 0.0, ch * t))
                nr = 0.042 * (1.0 - 0.35 * t)
                tube(bm, uv, [npos - Vector((0, 0, 0.015)), npos, npos + Vector((0, 0, 0.016))], [nr, nr * 1.24, nr * 0.96], sides=8, u_range=U_BARK, v_range=V_BARK)
                if nj >= 2:
                    for side in (-1, 1):
                        ta = a + side * 0.78 + rng.uniform(-0.22, 0.22)
                        tdir = Vector((math.cos(ta), math.sin(ta), 0.42)).normalized()
                        tp1 = npos + tdir * (ch * 0.16)
                        tube(bm, uv, [npos, tp1], [0.012, 0.004], sides=4, u_range=U_BARK, v_range=V_BARK)
                        for k in (-1, 0, 1):
                            ldir = Vector((math.cos(ta + k * 0.46), math.sin(ta + k * 0.46), -0.14 + k * 0.10)).normalized()
                            shaped_leaf(bm, uv, tp1, ldir, 0.26, 0.068, profile='lanceolate', asym=0.14, twist=k * 0.12, arch=0.06, droop=0.20, cup_depth=0.14, petiole=0.025, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        return True

    if 'corn' in aid or 'maize' in aid:
        stalks = 3
        for s in range(stalks):
            a = (s / stalks) * math.tau + rng.uniform(-0.22, 0.22)
            b = Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, -0.025))
            sh = h * (1.0 if s == 0 else rng.uniform(0.76, 0.92))
            pts = [b, b + Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, sh * 0.48)), b + Vector((math.cos(a) * 0.07, math.sin(a) * 0.07, sh * 0.92))]
            tube(bm, uv, pts, [0.058, 0.040, 0.018], sides=8, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for k in range(5):
                pa = a + k * 1.25
                tube(bm, uv, [b + Vector((0, 0, 0.16)), b + Vector((math.cos(pa) * 0.19, math.sin(pa) * 0.19, -0.025))], [0.016, 0.010], sides=4, u_range=U_BARK, v_range=V_BARK)
            for lv in range(7):
                zt = 0.20 + 0.68 * (lv / 6.0)
                la = a + lv * 2.2
                attach = b + Vector((math.cos(a) * 0.04 * zt, math.sin(a) * 0.04 * zt, sh * zt))
                ldir = Vector((math.cos(la), math.sin(la), 0.26)).normalized()
                shaped_leaf(bm, uv, attach, ldir, sh * 0.42, 0.15, profile='lanceolate', asym=0.14, twist=0.22 * (1 if lv % 2 == 0 else -1), arch=-0.12, droop=0.32, cup_depth=0.22, serration_amp=0.04, serration_freq=7, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for cob_z, cob_a in ((sh * 0.48, a + 0.9), (sh * 0.62, a + 3.4)):
                c0 = b + Vector((math.cos(cob_a) * 0.03, math.sin(cob_a) * 0.03, cob_z))
                c1 = c0 + Vector((math.cos(cob_a) * 0.08, math.sin(cob_a) * 0.08, 0.16))
                tube(bm, uv, [c0, c1], [0.036, 0.016], sides=7, u_range=U_ACCENT, v_range=V_ACCENT)
                for h_ang in (-0.45, 0.45):
                    hdir = Vector((math.cos(cob_a + h_ang), math.sin(cob_a + h_ang), 0.72)).normalized()
                    shaped_leaf(bm, uv, c0, hdir, 0.18, 0.055, profile='lanceolate', cup_depth=0.24, arch=0.04, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            top = pts[-1]
            for ts in range(5):
                ta = ts * 1.25
                tdir = Vector((math.cos(ta) * 0.55, math.sin(ta) * 0.55, 0.85)).normalized()
                tube(bm, uv, [top, top + tdir * 0.22], [0.010, 0.003], sides=4, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if _match_any(aid, ('heliconia', 'bird_of_paradise')):
        is_bird = 'bird_of_paradise' in aid
        # Asymmetric clasped basal rhizome shoots grounded directly below z=0
        for i in range(9):
            frac = i / 8.0
            a = i * 2.39996 + rng.uniform(-0.22, 0.22)
            base_r = rng.uniform(0.03, 0.14)
            attach = Vector((math.cos(a) * base_r, math.sin(a) * base_r, -0.025))
            pet_h = h * rng.uniform(0.28, 0.54)
            pet_top = attach + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, pet_h))
            pet_mid = attach.lerp(pet_top, 0.5) + Vector((0, 0, 0.05))
            tube(bm, uv, [attach, pet_mid, pet_top], [0.026, 0.019, 0.013], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            ldir = Vector((math.cos(a), math.sin(a), rng.uniform(0.24, 0.62))).normalized()
            shaped_leaf(
                bm,
                uv,
                pet_top,
                ldir,
                h * rng.uniform(0.46, 0.62),
                h * rng.uniform(0.16, 0.22),
                profile='paddle',
                asym=0.16,
                twist=rng.uniform(-0.22, 0.22),
                arch=0.14,
                droop=rng.uniform(0.12, 0.28),
                cup_depth=0.22,
                damaged=(i in (2, 7)),
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
            )
        for sp in range(3):
            a = sp * 2.25 + 0.35 + rng.uniform(-0.18, 0.18)
            sb = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.02))
            sm = sb + Vector((math.cos(a) * 0.10, math.sin(a) * 0.10, h * 0.52))
            sh_top = h * (1.02 if sp == 0 else rng.uniform(0.68, 0.86))
            st = sb + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, sh_top))
            tube(bm, uv, [sb, sm, st], [0.024, 0.017, 0.011], sides=6, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            if is_bird:
                spathe = st + Vector((math.cos(a) * 0.24, math.sin(a) * 0.24, 0.04))
                tube(bm, uv, [st, spathe], [0.036, 0.008], sides=6, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                for cr in range(4):
                    cdir = Vector((math.cos(a) * (0.2 + 0.15 * cr), math.sin(a) * (0.2 + 0.15 * cr), 0.92)).normalized()
                    flower_tropical_bract(bm, uv, st.lerp(spathe, 0.25 + 0.15 * cr), cdir, 0.18, 0.11, rng, style='strelitzia', u_accent=U_ACCENT, v_accent=V_ACCENT, u_foliage=U_FOLIAGE, v_foliage=V_FOLIAGE)
            else:
                for br in range(5):
                    bt = 0.54 + 0.10 * br
                    u_bez = 1.0 - bt
                    bp = (u_bez * u_bez) * sb + (2.0 * u_bez * bt) * sm + (bt * bt) * st
                    side_s = 1.0 if br % 2 == 0 else -1.0
                    bdir = Vector((math.cos(a + side_s * 1.12), math.sin(a + side_s * 1.12), 0.34 - 0.04 * br)).normalized()
                    flower_tropical_bract(
                        bm,
                        uv,
                        bp,
                        bdir,
                        0.21 * (1.06 - 0.08 * br),
                        0.12 * (1.05 - 0.06 * br),
                        rng,
                        style='heliconia',
                        u_accent=U_ACCENT,
                        v_accent=V_ACCENT,
                        u_foliage=U_FOLIAGE,
                        v_foliage=V_FOLIAGE,
                    )
        return True

    if _match_any(aid, ('foxglove', 'mullein', 'lupine', 'chicory')):
        is_fox = 'foxglove' in aid
        is_lupine = 'lupine' in aid
        if is_lupine:
            for p_idx in range(7):
                a = (p_idx / 7.0) * math.tau + rng.uniform(-0.15, 0.15)
                pet0 = Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, -0.02))
                pet1 = pet0 + Vector((math.cos(a) * 0.22, math.sin(a) * 0.22, 0.18))
                tube(bm, uv, [pet0, pet1], [0.016, 0.009], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                for f_idx in range(7):
                    fa = a + (f_idx - 3) * 0.44
                    shaped_leaf(bm, uv, pet1, Vector((math.cos(fa), math.sin(fa), -0.10)).normalized(), 0.18, 0.062, profile='lanceolate', droop=0.14, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        else:
            for i in range(11):
                a = i * 2.39996 + rng.uniform(-0.18, 0.18)
                tier = 0 if i < 6 else 1
                fdir = Vector((math.cos(a), math.sin(a), 0.24 if tier == 0 else 0.56)).normalized()
                attach = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, -0.02 + tier * 0.04))
                shaped_leaf(
                    bm,
                    uv,
                    attach,
                    fdir,
                    h * rng.uniform(0.32, 0.44),
                    h * rng.uniform(0.13, 0.17),
                    profile='spatulate',
                    asym=0.14,
                    twist=rng.uniform(-0.14, 0.14),
                    arch=0.10,
                    droop=0.18 if tier == 0 else 0.10,
                    cup_depth=0.20,
                    serration_amp=0.10,
                    serration_freq=5,
                    u_range=U_FOLIAGE,
                    v_range=V_FOLIAGE,
                )

        stalks = 3 if 'mullein' not in aid else 2
        for s in range(stalks):
            a = s * 2.15 + 0.25 + rng.uniform(-0.2, 0.2)
            b = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, -0.02))
            sh = h * (1.04 if s == 0 else rng.uniform(0.68, 0.84))
            sw = sh * 0.09
            top = b + Vector((math.cos(a) * sw * 1.4, math.sin(a) * sw * 1.4, sh))
            if 'chicory' in aid:
                pts = [b, b + Vector((math.cos(a) * sw, math.sin(a) * sw, sh * 0.50)), top]
                tube(bm, uv, pts, [0.028, 0.020, 0.009], sides=6, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                for b_idx in range(6):
                    zt = 0.32 + 0.11 * b_idx
                    bp = b.lerp(top, zt)
                    ba = a + b_idx * 1.85
                    twig = bp + Vector((math.cos(ba) * 0.18, math.sin(ba) * 0.18, 0.12))
                    tube(bm, uv, [bp, twig], [0.010, 0.005], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                    shaped_leaf(bm, uv, bp, Vector((math.cos(ba), math.sin(ba), 0.15)).normalized(), 0.11, 0.042, profile='lanceolate', serration_amp=0.10, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                    flower_daisy_head(bm, uv, twig, (twig - bp), 0.092, 9, rng, U_ACCENT, V_ACCENT, U_BARK, V_BARK, U_FOLIAGE, V_FOLIAGE)
            else:
                flower_spike_raceme(
                    bm,
                    uv,
                    b,
                    top,
                    h * (0.14 if is_fox else 0.12),
                    14 if is_fox else 18,
                    rng,
                    style='foxglove' if is_fox else ('lupine' if is_lupine else 'mullein'),
                    u_accent=U_ACCENT,
                    v_accent=V_ACCENT,
                    u_foliage=U_FOLIAGE,
                    v_foliage=V_FOLIAGE,
                    u_bark=U_BARK,
                    v_bark=V_BARK,
                )
        return True

    return False


def build_cupped_blossom(bm, uv, rng, h, aid):
    """Sunflowers, cupped bowl poppies/anemones, tripartite trillium/oxalis, or cotton grass."""
    if 'sunflower' in aid:
        _basal_foliage_ring(bm, uv, rng, 8, 0.14, h * 0.42, h * 0.22, z=-0.015, arch=-0.08, profile='cordate', serration_amp=0.12, droop=0.18)
        for s in range(3):
            a = s * 2.2 + 0.3
            sh = h * (1.0 if s == 0 else rng.uniform(0.72, 0.85))
            b = Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, -0.025))
            top = b + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, sh))
            tube(bm, uv, [b, b.lerp(top, 0.5) + Vector((0, 0, 0.04)), top], [0.038, 0.026, 0.018], sides=7, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for l_z in (0.34, 0.56, 0.74):
                lp = b.lerp(top, l_z)
                la = a + l_z * 6.0
                shaped_leaf(bm, uv, lp, Vector((math.cos(la), math.sin(la), -0.10)).normalized(), h * 0.28, h * 0.18, profile='cordate', cup_depth=0.18, serration_amp=0.12, droop=0.22, petiole=0.04, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            head_n = Vector((math.cos(a), math.sin(a), 0.52)).normalized()
            flower_daisy_head(bm, uv, top, head_n, h * (0.26 if s == 0 else 0.18), 16, rng, U_ACCENT, V_ACCENT, U_BARK, V_BARK, U_FOLIAGE, V_FOLIAGE)
        return True

    if _match_any(aid, ('poppy', 'anemone')):
        _basal_foliage_ring(bm, uv, rng, 10, 0.14, h * 0.44, h * 0.16, z=-0.015, arch=0.14, profile='palmate_lobe', serration_amp=0.20, droop=0.16)
        for s in range(5):
            a = (s / 5.0) * math.tau + rng.uniform(-0.24, 0.24)
            b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.02))
            top = b + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, h * rng.uniform(0.75, 1.04)))
            tube(bm, uv, [b, b.lerp(top, 0.52) + Vector((0, 0, 0.06)), top], [0.016, 0.012, 0.008], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            if s == 4:
                flower_bell_corolla(bm, uv, top, Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, -0.85)).normalized(), 0.09, 0.042, rng, U_ACCENT, V_ACCENT, U_FOLIAGE, V_FOLIAGE)
            else:
                tube(bm, uv, [top - Vector((0, 0, 0.012)), top + Vector((0, 0, 0.025))], [0.024, 0.018], sides=8, u_range=U_BARK, v_range=V_BARK, flute_count=6, flute_depth=0.14)
                for p_idx in range(6):
                    pa = (p_idx / 6.0) * math.tau + s * 0.4 + rng.uniform(-0.1, 0.1)
                    pdir = Vector((math.cos(pa) * 0.68, math.sin(pa) * 0.68, 0.72)).normalized()
                    shaped_leaf(bm, uv, top, pdir, h * 0.23, h * 0.19, profile='paddle', asym=0.12, twist=0.16 * (1 if p_idx % 2 == 0 else -1), arch=-0.16, droop=0.04, cup_depth=0.32, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if _match_any(aid, ('trillium', 'oxalis')):
        is_tril = 'trillium' in aid
        stems = 4 if is_tril else 9
        for s in range(stems):
            a = (s / stems) * math.tau + rng.uniform(-0.20, 0.20)
            b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.02))
            whorl = b + Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, h * rng.uniform(0.60, 0.88)))
            tube(bm, uv, [b, whorl], [0.015, 0.010], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for k in range(3):
                la = a + (k / 3.0) * math.tau
                ldir = Vector((math.cos(la), math.sin(la), -0.08)).normalized()
                shaped_leaf(bm, uv, whorl, ldir, h * 0.34, h * (0.24 if is_tril else 0.20), profile='ovate' if is_tril else 'cordate', asym=0.10, arch=0.08, droop=0.14, cup_depth=0.22, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            flw = whorl + Vector((0.0, 0.0, h * 0.18))
            tube(bm, uv, [whorl, flw], [0.008, 0.006], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            flower_daisy_head(bm, uv, flw, Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, 1.0)), h * 0.15, 3 if is_tril else 5, rng, U_ACCENT, V_ACCENT, U_BARK, V_BARK, U_FOLIAGE, V_FOLIAGE)
        return True

    if 'cotton_grass' in aid:
        grass_blade_clump(bm, uv, rng, 20, h * 0.68, 0.22, family='tundra_sparse', u_foliage=U_FOLIAGE, v_foliage=V_FOLIAGE, u_accent=U_BARK, v_accent=V_BARK)
        for s in range(8):
            a = (s / 8.0) * math.tau + rng.uniform(-0.22, 0.22)
            b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.02))
            top = b + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, h * rng.uniform(0.72, 1.04)))
            tube(bm, uv, [b, b.lerp(top, 0.5) + Vector((0, 0, 0.04)), top], [0.012, 0.009, 0.006], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            # Silky nodding cotton-grass seed tuft: cupped calyx bracts + radiating feather plumes
            head_n = Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 0.92)).normalized()
            flower_bell_corolla(bm, uv, top, -head_n, 0.045, 0.024, rng, U_BARK, V_BARK, U_FOLIAGE, V_FOLIAGE)
            for k in range(9):
                ka = k * 2.39996
                kdir = (head_n * 0.72 + Vector((math.cos(ka) * 0.55, math.sin(ka) * 0.55, 0.25))).normalized()
                shaped_leaf(bm, uv, top + head_n * 0.012, kdir, 0.095, 0.036, profile='lanceolate', asym=0.14, cup_depth=0.20, droop=0.14, u_range=U_ACCENT, v_range=V_ACCENT)
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
            a = (i / 6.0) * math.tau + rng.uniform(-0.22, 0.22)
            cpos = Vector((math.cos(a) * 0.16, math.sin(a) * 0.16, 0.01))
            planar_rock(bm, uv, cpos, Vector((0.14, 0.12, 0.06)) * rng.uniform(0.8, 1.2), style='crag', seed=rng.randint(1, 999), u_range=U_SOIL, v_range=V_SOIL)
        for i in range(20):
            a = i * 2.39996 + rng.uniform(-0.22, 0.22)
            r = rng.uniform(0.03, 0.24)
            p0 = Vector((math.cos(a) * r, math.sin(a) * r, -0.015))
            sh = max(0.14, h * rng.uniform(0.75, 1.25))
            p1 = p0 + Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, sh * 0.45))
            tube(bm, uv, [p0, p1], [0.020, 0.013], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            for side in (-0.65, 0.65):
                fa = a + side
                p2 = p1 + Vector((math.cos(fa) * 0.08, math.sin(fa) * 0.08, sh * 0.40))
                tube(bm, uv, [p1, p2], [0.012, 0.008], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                cup_u = U_ACCENT if i % 2 == 0 else U_FOLIAGE
                cup_v = V_ACCENT if i % 2 == 0 else V_FOLIAGE
                tube(bm, uv, [p2, p2 + Vector((0, 0, 0.018))], [0.009, 0.022], sides=6, u_range=cup_u, v_range=cup_v, cap_end=False)
        return True

    if 'devils_club' in aid:
        cane_top = Vector((0.08, -0.05, h * 0.92))
        organic_trunk_loft(bm, uv, [Vector((0, 0, -0.025)), Vector((0.03, -0.02, h * 0.45)), cane_top], [0.072, 0.052, 0.035], rng, sides=8, bark_ridges=5, ridge_depth=0.14, u_range=U_BARK, v_range=V_BARK)
        for sp in range(14):
            sa = sp * 2.2
            sz = h * rng.uniform(0.12, 0.78)
            sp0 = Vector((math.cos(sa) * 0.04, math.sin(sa) * 0.04, sz))
            _quad_blade(bm, uv, sp0, Vector((math.cos(sa), math.sin(sa), 0.25)).normalized(), 0.065, 0.015, arch=0.05, u_range=U_ACCENT, v_range=V_ACCENT)
        for lv in range(8):
            a = lv * 2.39996 + rng.uniform(-0.18, 0.18)
            zt = 0.34 + 0.56 * (lv / 7.0)
            attach = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, h * zt))
            ldir = Vector((math.cos(a), math.sin(a), rng.uniform(-0.12, 0.24))).normalized()
            shaped_leaf(bm, uv, attach, ldir, h * 0.34, h * 0.28, profile='palmate_lobe', asym=0.12, twist=rng.uniform(-0.14, 0.14), arch=0.10, droop=0.22, cup_depth=0.18, serration_amp=0.18, serration_freq=6, petiole=h * 0.14, u_range=U_FOLIAGE, v_range=V_FOLIAGE, stem_u_range=U_BARK, stem_v_range=V_BARK)
        flower_umbel_corymb(bm, uv, cane_top + Vector((0, 0, 0.05)), Vector((0, 0, 1)), 0.10, 6, rng, U_ACCENT, V_ACCENT, U_FOLIAGE, V_FOLIAGE)
        return True

    # General woody shrublets, heathers, umbels, berries & thorny bushes
    spread = 0.78 if h < 0.45 else 0.48
    tips = _branching_wood_base(bm, uv, rng, 7, max(0.32, h * 0.85), base_r=0.048, spread=spread)
    is_umbel = _match_any(aid, ('yarrow', 'lantana', 'buckwheat', 'rabbitbrush'))
    is_spike = _match_any(aid, ('heather', 'lavender'))
    is_spiny = _match_any(aid, ('sea_holly', 'thistle', 'gorse', 'wait_a_bit'))
    is_clover = 'clover' in aid
    leaf_prof = 'cordate' if is_clover else ('lanceolate' if is_spike or 'rabbitbrush' in aid else ('palmate_lobe' if is_spiny or 'yarrow' in aid else 'ovate'))
    serr = 0.18 if (is_spiny or 'yarrow' in aid) else 0.04

    if h < 0.45:
        _basal_foliage_ring(bm, uv, rng, 10, 0.22, 0.24, 0.13, z=-0.015, arch=0.10, profile=leaf_prof, serration_amp=serr)

    for p1, p2, p3, a in tips:
        for pt in (p1, p2, p3):
            for side in (-0.58, 0.0, 0.58):
                fa = a + side + rng.uniform(-0.18, 0.18)
                fdir = Vector((math.cos(fa), math.sin(fa), rng.uniform(0.18, 0.65))).normalized()
                shaped_leaf(
                    bm,
                    uv,
                    pt,
                    fdir,
                    h * rng.uniform(0.28, 0.42),
                    h * (0.20 if is_clover else 0.15),
                    profile=leaf_prof,
                    asym=0.14,
                    twist=rng.uniform(-0.16, 0.16),
                    arch=0.12,
                    droop=0.12,
                    cup_depth=0.20,
                    serration_amp=serr,
                    serration_freq=5,
                    u_range=U_FOLIAGE,
                    v_range=V_FOLIAGE,
                )
        for tip_side in (-0.35, 0.35):
            fa = a + tip_side
            shaped_leaf(
                bm,
                uv,
                p3,
                Vector((math.cos(fa), math.sin(fa), rng.uniform(0.20, 0.55))).normalized(),
                h * rng.uniform(0.30, 0.44),
                h * (0.22 if is_clover else 0.16),
                profile=leaf_prof,
                cup_depth=0.20,
                serration_amp=serr,
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
            )
        if is_umbel:
            flower_umbel_corymb(bm, uv, p3 + Vector((0, 0, 0.03)), Vector((math.cos(a) * 0.25, math.sin(a) * 0.25, 0.96)).normalized(), 0.095, 5, rng, U_ACCENT, V_ACCENT, U_FOLIAGE, V_FOLIAGE)
        elif is_spike:
            top_sp = p3 + Vector((0.0, 0.0, h * 0.28))
            flower_spike_raceme(bm, uv, p3, top_sp, 0.045, 9, rng, style='lupine', u_accent=U_ACCENT, v_accent=V_ACCENT, u_foliage=U_FOLIAGE, v_foliage=V_FOLIAGE, u_bark=U_BARK, v_bark=V_BARK)
        elif is_spiny:
            head_c = p3 + Vector((0, 0, 0.025))
            tube(bm, uv, [p3, head_c + Vector((0, 0, 0.045))], [0.028, 0.012], sides=7, u_range=U_ACCENT, v_range=V_ACCENT)
            for k in range(8):
                sa = a + (k / 8.0) * math.tau
                sp0 = head_c + Vector((math.cos(sa) * 0.02, math.sin(sa) * 0.02, -0.005))
                shaped_leaf(bm, uv, sp0, Vector((math.cos(sa), math.sin(sa), 0.18)).normalized(), 0.095, 0.026, profile='lanceolate', serration_amp=0.18, serration_freq=4, u_range=U_ACCENT, v_range=V_ACCENT)
        else:
            for b_pt in (p2, p3):
                for bk in range(2):
                    ba = a + bk * 1.6
                    hang_dir = Vector((math.cos(ba) * 0.45, math.sin(ba) * 0.45, -0.88)).normalized()
                    flower_bell_corolla(bm, uv, b_pt + Vector((math.cos(ba) * 0.025, math.sin(ba) * 0.025, 0.0)), hang_dir, 0.055, 0.026, rng, U_ACCENT, V_ACCENT, U_FOLIAGE, V_FOLIAGE)
    return True


def build_fern_cycad_or_wetland(bm, uv, rng, h, aid):
    """Pinnate ferns, armored cycads, split monstera, pitchers, bromeliads, horsetail & oat."""
    if _match_any(aid, ('fern', 'cycad')):
        is_cycad = 'cycad' in aid
        z0 = -0.01
        if is_cycad:
            z0 = h * 0.34
            tube(
                bm,
                uv,
                [Vector((0, 0, -0.02)), Vector((0, 0, z0))],
                [h * 0.18, h * 0.14],
                sides=10,
                u_range=U_BARK,
                v_range=V_BARK,
                flute_count=8,
                flute_depth=0.14,
            )
            mushroom_dome(bm, uv, Vector((0, 0, z0)), h * 0.08, h * 0.20, sides=8, u_range=U_ACCENT, v_range=V_ACCENT)
        else:
            planar_rock(bm, uv, Vector((0, 0, 0.02)), (0.12, 0.11, 0.055), style='crag', seed=44, u_range=U_BARK, v_range=V_BARK)
            for k in range(3):
                fern_crosier_spiral(bm, uv, Vector((math.cos(k * 2.1) * 0.03, math.sin(k * 2.1) * 0.03, 0.02)), k * 2.1 + 0.3, h * rng.uniform(0.32, 0.44), rng, u_foliage=U_FOLIAGE, v_foliage=V_FOLIAGE)

        fronds = 13
        for i in range(fronds):
            a = (i / fronds) * math.tau + rng.uniform(-0.20, 0.20)
            fl = h * (0.74 + 0.32 * ((i % 3) / 2.0)) * rng.uniform(0.90, 1.08)
            pitch = 0.22 + 0.22 * (i % 3)
            fern_frond(
                bm,
                uv,
                Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, z0)),
                a,
                pitch,
                fl,
                h * (0.36 if is_cycad else 0.42),
                8 if is_cycad else 11,
                rng,
                droop=0.14 if is_cycad else rng.uniform(0.16, 0.28),
                damaged_idx=(5 if i % 5 == 2 else -1),
                u_foliage=U_FOLIAGE,
                v_foliage=V_FOLIAGE,
                u_bark=U_BARK,
                v_bark=V_BARK,
            )
        return True

    if 'monstera' in aid:
        organic_trunk_loft(bm, uv, [Vector((0, 0, -0.025)), Vector((0.06, 0.04, h * 0.44))], [0.065, 0.046], rng, sides=8, bark_ridges=5, ridge_depth=0.10, u_range=U_BARK, v_range=V_BARK)
        for ar in range(4):
            aa = ar * 1.55 + 0.4
            ap0 = Vector((0.03, 0.02, h * (0.14 + 0.06 * ar)))
            ap1 = Vector((math.cos(aa) * 0.22, math.sin(aa) * 0.22, -0.03))
            tube(bm, uv, [ap0, ap0.lerp(ap1, 0.5) + Vector((0, 0, 0.04)), ap1], [0.015, 0.011, 0.008], sides=5, u_range=U_BARK, v_range=V_BARK)
        for i in range(9):
            a = i * 2.39996 + rng.uniform(-0.18, 0.18)
            p0 = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, h * rng.uniform(0.08, 0.28)))
            p1 = p0 + Vector((math.cos(a) * h * 0.34, math.sin(a) * h * 0.34, h * rng.uniform(0.28, 0.56)))
            tube(bm, uv, [p0, p0.lerp(p1, 0.5) + Vector((0, 0, 0.06)), p1], [0.018, 0.014, 0.010], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            ldir = Vector((math.cos(a), math.sin(a), -0.18)).normalized()
            shaped_leaf(
                bm,
                uv,
                p1,
                ldir,
                h * rng.uniform(0.38, 0.50),
                h * rng.uniform(0.32, 0.42),
                profile='palmate_lobe',
                asym=0.12,
                twist=rng.uniform(-0.12, 0.12),
                arch=0.12,
                droop=0.22,
                cup_depth=0.18,
                serration_amp=0.26,
                serration_freq=7,
                damaged=(i == 2),
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
            )
        return True

    if 'bromeliad' in aid:
        for i in range(20):
            t = i / 19.0
            a = i * 2.39996 + rng.uniform(-0.08, 0.08)
            ldir = Vector((math.cos(a), math.sin(a), 0.16 + 0.78 * t)).normalized()
            blen = h * (0.78 - 0.20 * t)
            bw = h * (0.18 - 0.05 * t)
            volumetric_succulent_blade(
                bm,
                uv,
                Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, -0.015 + t * 0.05)),
                ldir,
                blen,
                bw,
                bw * 0.18,
                arch=-0.16,
                droop=0.10,
                teeth=False,
                u_range=U_FOLIAGE,
                v_range=V_FOLIAGE,
                accent_u=U_ACCENT if t > 0.65 else U_FOLIAGE,
                accent_v=V_ACCENT if t > 0.65 else V_FOLIAGE,
            )
        flower_tropical_bract(bm, uv, Vector((0, 0, h * 0.16)), Vector((0.10, -0.05, 1.0)), h * 0.78, h * 0.14, rng, style='heliconia', u_accent=U_ACCENT, v_accent=V_ACCENT, u_foliage=U_FOLIAGE, v_foliage=V_FOLIAGE)
        return True

    if 'pitcher' in aid:
        planar_rock(bm, uv, Vector((0, 0, 0.01)), Vector((0.22, 0.19, 0.06)), style='river', seed=rng.randint(1, 999), u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        for i in range(9):
            a = i * 2.39996 + rng.uniform(-0.18, 0.18)
            ph = h * rng.uniform(0.68, 1.05)
            b = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, -0.015))
            m = b + Vector((math.cos(a) * 0.13, math.sin(a) * 0.13, ph * 0.45))
            rim = b + Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, ph))
            tube(bm, uv, [b, m, rim], [0.014, 0.040, 0.058], sides=10, u_range=U_FOLIAGE, v_range=V_FOLIAGE, cap_end=False)
            # Flared peristome lip collar
            tube(bm, uv, [rim - Vector((0, 0, 0.014)), rim, rim + Vector((0, 0, 0.012))], [0.058, 0.072, 0.052], sides=10, u_range=U_ACCENT, v_range=V_ACCENT, cap_end=False)
            neck0 = rim + Vector((math.cos(a) * -0.046, math.sin(a) * -0.046, 0.004))
            lid_p = rim + Vector((math.cos(a) * 0.012, math.sin(a) * 0.012, 0.032))
            tube(bm, uv, [neck0, lid_p], [0.015, 0.012], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            shaped_leaf(bm, uv, lid_p - Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, 0.0)), Vector((math.cos(a) * 0.92, math.sin(a) * 0.92, 0.35)).normalized(), 0.11, 0.088, profile='cordate', cup_depth=0.28, arch=0.14, droop=0.18, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if 'plantain' in aid:
        _basal_foliage_ring(bm, uv, rng, 9, 0.14, max(0.28, h * 1.38), max(0.16, h * 0.68), z=-0.015, arch=0.08, profile='spatulate', serration_amp=0.06, droop=0.14)
        for sp in range(4):
            sa = (sp / 4.0) * math.tau + 0.3
            sb = Vector((math.cos(sa) * 0.03, math.sin(sa) * 0.03, -0.015))
            stop = sb + Vector((math.cos(sa) * 0.06, math.sin(sa) * 0.06, max(0.32, h * 1.55) * rng.uniform(0.82, 1.05)))
            flower_spike_raceme(bm, uv, sb, stop, 0.028, 7, rng, style='mullein', u_accent=U_ACCENT, v_accent=V_ACCENT, u_foliage=U_FOLIAGE, v_foliage=V_FOLIAGE, u_bark=U_BARK, v_bark=V_BARK)
        return True

    if 'cabbage' in aid:
        for i in range(9):
            a = i * 2.39996 + rng.uniform(-0.14, 0.14)
            ldir = Vector((math.cos(a), math.sin(a), rng.uniform(0.30, 0.68))).normalized()
            shaped_leaf(bm, uv, Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.015)), ldir, h * rng.uniform(0.68, 0.96), h * 0.44, profile='paddle', asym=0.14, arch=0.14, droop=0.10, cup_depth=0.34, serration_amp=0.06, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        spadix_top = Vector((0.03, 0.01, h * 0.56))
        tube(bm, uv, [Vector((0, 0, -0.01)), spadix_top], [0.052, 0.022], sides=8, u_range=U_BARK, v_range=V_BARK)
        for sp_idx in (-0.45, 0.45):
            shaped_leaf(bm, uv, Vector((math.cos(sp_idx) * 0.04, math.sin(sp_idx) * 0.04, 0.02)), Vector((0.25, sp_idx * 0.5, 0.92)).normalized(), h * 0.66, h * 0.34, profile='spatulate', cup_depth=0.40, arch=-0.12, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if 'sundew' in aid:
        planar_rock(bm, uv, Vector((0, 0, 0.005)), Vector((0.22, 0.22, 0.045)), style='river', seed=rng.randint(1, 999), u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        for i in range(16):
            t = i / 15.0
            a = i * 2.39996
            ldir = Vector((math.cos(a), math.sin(a), 0.16 + 0.52 * t)).normalized()
            shaped_leaf(bm, uv, Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, 0.01)), ldir, max(0.18, h * 0.78), max(0.065, h * 0.22), profile='spatulate', cup_depth=0.22, petiole=max(0.08, h * 0.35), u_range=U_ACCENT, v_range=V_ACCENT, stem_u_range=U_FOLIAGE, stem_v_range=V_FOLIAGE)
            st_end = Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, 0.01)) + ldir * max(0.16, h * 0.68)
            for c_idx in range(4):
                ca = a + (c_idx / 4.0) * math.tau
                cdir = (Vector((math.cos(ca) * 0.75, math.sin(ca) * 0.75, 0.45)) + ldir * 0.35).normalized()
                _quad_blade(bm, uv, st_end, cdir, 0.042, 0.007, arch=0.04, u_range=U_ACCENT, v_range=V_ACCENT)
        for s_idx in range(2):
            sa = s_idx * 2.6 + 0.5
            s_top = Vector((math.cos(sa) * 0.05, math.sin(sa) * 0.05, max(0.28, h * 1.15)))
            tube(bm, uv, [Vector((0, 0, 0.01)), s_top], [0.009, 0.005], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            flower_daisy_head(bm, uv, s_top, Vector((0, 0, 1)), 0.052, 5, rng, U_ACCENT, V_ACCENT, U_BARK, V_BARK, U_FOLIAGE, V_FOLIAGE)
        return True

    if 'horsetail' in aid:
        for i in range(11):
            a = i * 2.39996 + rng.uniform(-0.18, 0.18)
            r = rng.uniform(0.04, 0.22)
            ch = h * rng.uniform(0.65, 1.02)
            b = Vector((math.cos(a) * r, math.sin(a) * r, -0.02))
            top = b + Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, ch))
            tube(bm, uv, [b, b.lerp(top, 0.52) + Vector((0.02, 0.0, 0.0)), top], [0.018, 0.013, 0.008], sides=6, u_range=U_BARK, v_range=V_BARK)
            for tier in range(1, 5):
                np_pt = b.lerp(top, tier * 0.20)
                for n_idx in range(7):
                    na = n_idx * (math.tau / 7.0) + tier * 0.3
                    ndir = Vector((math.cos(na), math.sin(na), 0.38)).normalized()
                    _quad_blade(bm, uv, np_pt, ndir, ch * 0.24, 0.014, arch=0.08, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            tube(bm, uv, [top - Vector((0, 0, 0.01)), top + Vector((0, 0, 0.025)), top + Vector((0, 0, 0.055))], [0.009, 0.019, 0.005], sides=6, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    if _match_any(aid, ('oat', 'grass', 'sedge', 'reed')):
        fam = 'flowering_oat' if 'oat' in aid else ('wetland_reed' if _match_any(aid, ('reed', 'sedge')) else 'wild_tall')
        grass_blade_clump(bm, uv, rng, 26, h * 0.88, 0.24, family=fam, u_foliage=U_FOLIAGE, v_foliage=V_FOLIAGE, u_accent=U_ACCENT, v_accent=V_ACCENT)
        if 'reed' in aid:
            for s in range(6):
                a = s * 2.39996 + rng.uniform(-0.22, 0.22)
                b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.02))
                sh = h * rng.uniform(0.84, 1.08)
                top = b + Vector((math.cos(a) * 0.09, math.sin(a) * 0.09, sh))
                tube(bm, uv, [b, b.lerp(top, 0.5), top], [0.016, 0.011, 0.005], sides=6, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                cat_b = b.lerp(top, 0.72)
                cat_t = b.lerp(top, 0.90)
                tube(bm, uv, [cat_b, cat_b.lerp(cat_t, 0.5), cat_t], [0.022, 0.032, 0.018], sides=8, u_range=U_BARK, v_range=V_BARK)
        elif 'sedge' in aid:
            for s in range(7):
                a = s * 2.39996 + rng.uniform(-0.22, 0.22)
                b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.02))
                top = b + Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, h * rng.uniform(0.75, 1.02)))
                tube(bm, uv, [b, top], [0.012, 0.006], sides=4, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
                for k in range(5):
                    ka = a + (k / 5.0) * math.tau
                    shaped_leaf(bm, uv, top, Vector((math.cos(ka), math.sin(ka), -0.15)).normalized(), h * 0.16, 0.022, profile='lanceolate', arch=0.04, droop=0.18, u_range=U_ACCENT, v_range=V_ACCENT)
        return True

    return False


def build_trunk_rock_or_ice(bm, uv, rng, h, kind, aid):
    """Glacial ice spires, cypress knees, termite mounds, stone cairns/milestones, snags & saplings."""
    if kind == 'ice':
        style = (
            'frost_rose' if ('frost_crystal_rose' in aid or 'rose' in aid)
            else ('pressure_ridge' if ('pressure_ridge' in aid or 'heave' in aid)
                  else ('penitentes' if 'penitentes' in aid else 'serac'))
        )
        ice_formation_mesh(
            bm,
            uv,
            Vector((0.0, 0.0, 0.0)),
            h,
            h * 0.42,
            style=style,
            rng=rng,
            u_inner=U_ACCENT,
            v_inner=V_ACCENT,
            u_frost=U_FOLIAGE,
            v_frost=V_FOLIAGE,
            u_base=U_BARK,
            v_base=V_BARK,
        )
        return True

    if 'knees' in aid:
        planar_rock(bm, uv, Vector((0, 0, 0.02)), Vector((0.40, 0.35, 0.10)), style='river', seed=rng.randint(1, 999), u_range=U_FOLIAGE, v_range=V_FOLIAGE)
        for i in range(8):
            a = i * 2.39996 + rng.uniform(-0.2, 0.2)
            r = 0.0 if i == 0 else rng.uniform(0.14, 0.36)
            kh = h * (1.0 if i == 0 else rng.uniform(0.42, 0.84))
            kr = h * (0.18 if i == 0 else rng.uniform(0.08, 0.14))
            b = Vector((math.cos(a) * r, math.sin(a) * r, -0.025))
            pts = [b, b + Vector((0, 0, kh * 0.45)), b + Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, kh))]
            organic_trunk_loft(bm, uv, pts, [kr * 1.32, kr * 0.72, kr * 0.24], rng, sides=9, bark_ridges=6, ridge_depth=0.18, u_range=U_BARK, v_range=V_BARK)
        return True

    if 'termite' in aid:
        planar_rock(bm, uv, Vector((0, 0, 0.01)), Vector((h * 0.42, h * 0.38, h * 0.10)), style='crag', seed=rng.randint(1, 999), u_range=U_BARK, v_range=V_BARK)
        organic_trunk_loft(
            bm,
            uv,
            [Vector((0, 0, -0.03)), Vector((0.02, -0.02, h * 0.38)), Vector((0.04, 0.02, h * 0.80)), Vector((0.02, 0.0, h * 1.04))],
            [h * 0.36, h * 0.24, h * 0.11, h * 0.04],
            rng,
            sides=11,
            bark_ridges=8,
            ridge_depth=0.22,
            knot_frac=0.45,
            u_range=U_BARK,
            v_range=V_BARK,
        )
        for i in range(6):
            a = (i / 6.0) * math.tau + rng.uniform(-0.22, 0.22)
            ch = h * rng.uniform(0.45, 0.80)
            r = h * rng.uniform(0.18, 0.28)
            b = Vector((math.cos(a) * r, math.sin(a) * r, -0.025))
            organic_trunk_loft(bm, uv, [b, b * 0.72 + Vector((0, 0, ch * 0.5)), b * 0.45 + Vector((0, 0, ch))], [h * 0.13, h * 0.08, h * 0.028], rng, sides=7, bark_ridges=5, ridge_depth=0.16, u_range=U_BARK, v_range=V_BARK)
        return True

    if _match_any(aid, ('milestone', 'cairn', 'boulder', 'stone')):
        planar_rock(bm, uv, Vector((0, 0, h * 0.10)), Vector((h * 0.38, h * 0.32, h * 0.20)), style='crag', seed=rng.randint(1, 999), u_range=U_BARK, v_range=V_BARK)
        planar_rock(bm, uv, Vector((0.02, 0.01, h * 0.50)), Vector((h * 0.22, h * 0.15, h * 0.42)), style='limestone', seed=rng.randint(1000, 1999), u_range=U_BARK, v_range=V_BARK)
        for i in range(4):
            a = (i / 4.0) * math.tau + 0.4
            planar_rock(bm, uv, Vector((math.cos(a) * h * 0.24, math.sin(a) * h * 0.24, h * 0.08)), Vector((h * 0.15, h * 0.13, h * 0.12)), style='crag', seed=rng.randint(2000, 2999) + i, u_range=U_FOLIAGE if i == 0 else U_BARK, v_range=V_FOLIAGE if i == 0 else V_BARK)
        return True

    if 'stump' in aid:
        r0 = max(0.18, h * 0.26)
        pts = [Vector((0, 0, -0.03)), Vector((0.02, -0.01, h * 0.45)), Vector((-0.02, 0.03, h * 0.88))]
        organic_trunk_loft(bm, uv, pts, [r0 * 1.38, r0 * 0.88, r0 * 0.72], rng, sides=12, bark_ridges=8, ridge_depth=0.18, cap_end=False, u_range=U_BARK, v_range=V_BARK)
        splintered_fracture_cap(bm, uv, pts[-1], Vector((-0.02, 0.03, 1.0)).normalized(), r0 * 0.70, rng, U_BARK, V_BARK, U_SOIL, V_SOIL, splinters=8)
        buttress_root_system(bm, uv, pts[0], r0 * 1.1, h * 0.36, r0 * 2.3, 6, rng, U_BARK, V_BARK, split=True)
        mushroom_cluster_mesh(bm, uv, Vector((r0 * 0.75, 0.0, h * 0.36)), h * 0.20, r0 * 0.48, rng, cap_u=U_ACCENT, cap_v=V_ACCENT, stipe_u=U_BARK, stipe_v=V_BARK, base_u=U_FOLIAGE, base_v=V_FOLIAGE)
        return True

    if kind == 'trunk' or _match_any(aid, ('snag', 'sapling')):
        is_sapling = 'sapling' in aid
        r0 = max(0.08, h * (0.11 if is_sapling else 0.15))
        pts = [Vector((0, 0, -0.03)), Vector((0.04, -0.02, h * 0.36)), Vector((-0.03, 0.05, h * 0.74)), Vector((0.04, -0.02, h * 0.98))]
        organic_trunk_loft(bm, uv, pts, [r0 * 1.38, r0 * 0.82, r0 * 0.48, r0 * 0.18], rng, sides=10, bark_ridges=6, ridge_depth=0.14, cap_end=is_sapling, u_range=U_BARK, v_range=V_BARK)
        if not is_sapling:
            splintered_fracture_cap(bm, uv, pts[-1], Vector((0.04, -0.02, 0.6)).normalized(), r0 * 0.22, rng, U_BARK, V_BARK, U_SOIL, V_SOIL, splinters=6)
        buttress_root_system(bm, uv, pts[0], r0, h * 0.18, r0 * 2.4, 6, rng, U_BARK, V_BARK, split=True)
        for i in range(5):
            a = (i / 5.0) * math.tau + rng.uniform(-0.22, 0.22)
            bp = pts[1].lerp(pts[2], i / 4.0)
            mid = bp + Vector((math.cos(a) * h * 0.18, math.sin(a) * h * 0.18, h * 0.16))
            tip = bp + Vector((math.cos(a + 0.16) * h * 0.36, math.sin(a + 0.16) * h * 0.36, h * 0.26))
            organic_trunk_loft(bm, uv, [bp, mid, tip], [r0 * 0.38, r0 * 0.22, r0 * 0.10], rng, sides=6, bark_ridges=4, ridge_depth=0.10, u_range=U_BARK, v_range=V_BARK)
            if is_sapling:
                for k in range(5):
                    la = a + (k - 2) * 0.55
                    shaped_leaf(bm, uv, tip, Vector((math.cos(la), math.sin(la), 0.28)).normalized(), h * 0.28, h * 0.15, profile='ovate', asym=0.14, arch=0.12, droop=0.12, cup_depth=0.18, serration_amp=0.06, petiole=0.03, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
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
        _basal_foliage_ring(bm, uv, rng, 10, 0.14, h * 0.46, h * 0.17, z=-0.015, arch=0.12)
        for s in range(4):
            a = (s / 4.0) * math.tau + 0.35
            b = Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.02))
            top = b + Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, h * rng.uniform(0.75, 1.0)))
            tube(bm, uv, [b, b.lerp(top, 0.5) + Vector((0, 0, 0.04)), top], [0.015, 0.010, 0.007], sides=5, u_range=U_FOLIAGE, v_range=V_FOLIAGE)
            flower_daisy_head(bm, uv, top, Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 0.92)), h * 0.16, 7, rng, U_ACCENT, V_ACCENT, U_BARK, V_BARK, U_FOLIAGE, V_FOLIAGE)
    else:
        build_shrublet_or_cushion(bm, uv, rng, h, aid_l, force=True)
