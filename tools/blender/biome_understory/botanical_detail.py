"""High-detail 3D botanical geometry & PBR atlas helpers for biome understory assets.

Provides:
  - Continuous petiole-to-midrib 3D leaf construction (zero seam/detachment at leaf joints)
  - Flared tangential branch-to-trunk lofting (zero blunt pegs or sharp elbows)
  - Volumetric 3D multi-leaf rosettes, conifer needle plumes, and flower/berry clusters
  - Opaque PBR bark + veined foliage atlases (u < 0.28 bark, u >= 0.30 foliage, accent corner)
"""
import math
import os

import bmesh
import numpy as np
from mathutils import Vector

from understory_common import _catmull_rom_chain, fbm, height_to_normal, make_material, save_image


def build_wood_foliage_pbr_material(
    tex_dir,
    name,
    filename,
    seed,
    bark_rgb,
    leaf_rgb,
    vein_rgb,
    accent_rgb=None,
    roughness=0.68,
    subsurface=0.18,
):
    """Opaque PBR atlas for 3D woody shrubs: u < 0.28 fissured bark, u >= 0.30 veined leaf, u=[0.04..0.22] v=[0.78..0.96] accent."""
    rng = np.random.default_rng(seed)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h

    grain = fbm(w, h, (5, 22), rng, 4)
    noise = fbm(w, h, (12, 14), rng, 4)
    fine = fbm(w, h, (26, 26), rng, 3)

    rgba = np.ones((h, w, 4), dtype=np.float32)
    in_bark = u < 0.28
    furrow = 0.80 + 0.32 * np.sin(u * 130.0 + grain * 5.0)
    bark_col = np.array(bark_rgb) * (0.68 + 0.48 * grain[..., None]) * furrow[..., None]
    rgba[in_bark, :3] = np.clip(bark_col[in_bark], 0.0, 1.0)

    lu = np.clip((u - 0.28) / 0.72, 0.0, 1.0)
    du = np.abs(lu - 0.5) * 2.0
    midrib = np.exp(-((du / (0.065 * (1.0 - 0.45 * v) + 0.014)) ** 2))
    vein_wave = np.sin((v * 12.0 - du * 2.6) * math.pi)
    lat_veins = np.clip((vein_wave - 0.62) / 0.38, 0.0, 1.0) * (1.0 - 0.30 * du) * (v > 0.05) * (v < 0.95)
    lamina_shade = (0.74 + 0.38 * v + 0.16 * (noise - 0.5) + 0.10 * (fine - 0.5)) * (1.0 - 0.15 * du * du)
    leaf_col = np.array(leaf_rgb) * lamina_shade[..., None]
    vein_mix = np.clip(midrib * 0.78 + lat_veins * 0.38, 0.0, 1.0)[..., None]
    col = leaf_col * (1.0 - vein_mix) + np.array(vein_rgb) * vein_mix
    rgba[~in_bark, :3] = np.clip(col[~in_bark], 0.0, 1.0)

    if accent_rgb is not None:
        in_acc = (u >= 0.04) & (u <= 0.24) & (v >= 0.76) & (v <= 0.96)
        rgba[in_acc, :3] = np.clip(np.array(accent_rgb) * (0.82 + 0.32 * fine[in_acc, None]), 0.0, 1.0)

    height = np.where(in_bark, 0.6 * grain + 0.4 * (furrow * 0.5), 0.45 * noise + 0.38 * midrib + 0.17 * lat_veins)
    alb = save_image(f'{filename}_alb', rgba, os.path.join(tex_dir, f'{filename}-alb.png'))
    nrm = save_image(f'{filename}_nrm', height_to_normal(height, 2.2), os.path.join(tex_dir, f'{filename}-nrm.png'), non_color=True)
    return make_material(name, alb, alpha=False, normal_image=nrm, roughness=roughness, subsurface=subsurface)


def smooth_tube(
    bm,
    uv,
    points,
    radii,
    sides=6,
    subdiv=2,
    u_range=(0.02, 0.26),
    v_range=(0.04, 0.94),
    flute_count=0,
    flute_depth=0.0,
    cap_end=True,
    cap_start=False,
):
    """Catmull-Rom smooth tapered tube with parallel-transport framing, optional fluting, and domed end caps."""
    pts, rads = _catmull_rom_chain(points, radii, subdiv=subdiv) if subdiv > 1 else (list(points), list(radii))
    rings = []
    d0 = (pts[1] - pts[0]).normalized()
    normal = d0.orthogonal().normalized()
    total = sum((pts[i] - pts[i - 1]).length for i in range(1, len(pts)))
    acc = 0.0
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        normal = (normal - d * normal.dot(d)).normalized()
        binormal = d.cross(normal)
        if i > 0:
            acc += (pts[i] - pts[i - 1]).length
        frac = acc / max(total, 1e-6)
        vc = v_range[0] + (v_range[1] - v_range[0]) * frac
        ring = []
        for s in range(sides):
            ang = s / sides * math.tau
            r_eff = rads[i]
            if flute_count > 0 and flute_depth > 0.0:
                r_eff *= 1.0 + flute_depth * math.sin(ang * flute_count + frac * 3.0)
            offset = (normal * math.cos(ang) + binormal * math.sin(ang)) * r_eff
            uc = u_range[0] + (u_range[1] - u_range[0]) * (s / sides)
            ring.append((bm.verts.new(p + offset), (uc, vc)))
        rings.append(ring)

    for ra, rb in zip(rings[:-1], rings[1:]):
        for s in range(sides):
            sn = (s + 1) % sides
            verts = (ra[s][0], ra[sn][0], rb[sn][0], rb[s][0])
            if len(set(verts)) == 4:
                f = bm.faces.new(verts)
                f.smooth = True
                for loop, (_, coord) in zip(f.loops, (ra[s], ra[sn], rb[sn], rb[s])):
                    loop[uv].uv = coord

    uc_mid = 0.5 * (u_range[0] + u_range[1])
    if cap_end and rings and sides >= 3:
        top_ring = rings[-1]
        d_end = (pts[-1] - pts[-2]).normalized()
        tip_v = bm.verts.new(pts[-1] + d_end * (rads[-1] * 0.65))
        for s in range(sides):
            sn = (s + 1) % sides
            tri = (top_ring[s][0], top_ring[sn][0], tip_v)
            if len(set(tri)) == 3:
                f = bm.faces.new(tri)
                f.smooth = True
                for loop, coord in zip(f.loops, (top_ring[s][1], top_ring[sn][1], (uc_mid, v_range[1]))):
                    loop[uv].uv = coord
    if cap_start and rings and sides >= 3:
        bot_ring = rings[0]
        base_v = bm.verts.new(pts[0])
        for s in range(sides):
            sn = (s + 1) % sides
            tri = (bot_ring[sn][0], bot_ring[s][0], base_v)
            if len(set(tri)) == 3:
                f = bm.faces.new(tri)
                f.smooth = True
                for loop, coord in zip(f.loops, (bot_ring[sn][1], bot_ring[s][1], (uc_mid, v_range[0]))):
                    loop[uv].uv = coord


def flared_branch(
    bm,
    uv,
    parent_pt,
    parent_dir,
    target_pts,
    r_base,
    r_tip,
    sides=6,
    subdiv=2,
    u_range=(0.02, 0.26),
    v_range=(0.06, 0.72),
    flute_count=3,
    flute_depth=0.08,
):
    """Loft a branch that emerges smoothly from inside its parent trunk with a flared collar and tangential curve."""
    p_dir = parent_dir.normalized() if parent_dir.length_squared > 1e-8 else Vector((0.0, 0.0, 1.0))
    # Embed start slightly inside parent centerline and step along parent tangent for a clean organic crotch joint
    p_embed = parent_pt - p_dir * (r_base * 0.45)
    p_collar = parent_pt + p_dir * (r_base * 0.85) + (target_pts[0] - parent_pt).normalized() * (r_base * 0.55)
    pts = [p_embed, p_collar] + list(target_pts)
    n = len(pts)
    rads = [r_base * 1.32, r_base * 1.04]
    for i in range(len(target_pts)):
        t = (i + 1) / max(len(target_pts), 1)
        rads.append(r_base * ((1.0 - t) ** 0.85) + r_tip * (t ** 0.85))
    smooth_tube(
        bm, uv, pts, rads, sides=sides, subdiv=subdiv,
        u_range=u_range, v_range=v_range, flute_count=flute_count, flute_depth=flute_depth, cap_end=True,
    )
    return pts[-1], (pts[-1] - pts[-2]).normalized()


def _leaf_spine_frame(origin, f, side0, up0, length, arch, droop, twist, t):
    curve = length * (arch * math.sin(t * math.pi * 0.86) - droop * (t ** 2.05))
    spine = origin + f * (length * t) + up0 * curve
    tw = twist * t
    side = (side0 * math.cos(tw) + up0 * math.sin(tw)).normalized()
    up_v = (up0 * math.cos(tw) - side0 * math.sin(tw)).normalized()
    return spine, side, up_v


def cupped_leaf_with_midrib(
    bm,
    uv,
    origin,
    forward_dir,
    length,
    width,
    profile='cordate',
    arch=0.18,
    droop=0.22,
    cup_depth=0.24,
    roll=0.0,
    twist=0.0,
    wave_amp=0.0,
    wave_freq=2.5,
    vein_depth=0.0,
    rows=12,
    cols=8,
    u_range=(0.30, 0.98),
    v_range=(0.04, 0.96),
    split_phase=0.0,
    petiole_pts=None,
    petiole_radii=None,
    petiole_sides=7,
    petiole_u=(0.02, 0.24),
    petiole_v=(0.04, 0.72),
    midrib_reach=0.68,
    flute_count=2,
    flute_depth=0.06,
):
    """Build a sculpted 3D cupped leaf blade AND optionally a continuous petiole->underside-midrib tube."""
    f = forward_dir.normalized() if forward_dir.length_squared > 1e-8 else Vector((1.0, 0.0, 0.0))
    ref = Vector((0.0, 0.0, 1.0)) if abs(f.z) < 0.92 else Vector((1.0, 0.0, 0.0))
    r0 = f.cross(ref).normalized()
    u0_vec = r0.cross(f).normalized()
    side0 = (r0 * math.cos(roll) + u0_vec * math.sin(roll)).normalized()
    up0 = (u0_vec * math.cos(roll) - r0 * math.sin(roll)).normalized()

    u0, u1 = u_range
    v0, v1 = v_range
    grid = []
    for r in range(rows + 1):
        t = r / rows
        if profile == 'cordate_ear':
            ear = 0.58 * math.exp(-((t - 0.14) / 0.15) ** 2)
            wm = max(0.03, math.sin((t ** 0.54) * math.pi) * (1.06 - 0.28 * t) + ear)
        elif profile == 'cordate':
            ear = 0.28 * math.exp(-((t - 0.14) / 0.14) ** 2)
            wm = max(0.04, math.sin((t ** 0.52) * math.pi) * (1.10 - 0.30 * t) + ear)
        elif profile == 'banana_split':
            base_w = 0.20 + 0.80 * math.sin((t ** 0.62) * math.pi)
            wm = max(0.04, base_w)
        elif profile == 'lanceolate':
            wm = max(0.03, math.sin((t ** 0.70) * math.pi) * (0.90 + 0.18 * (1.0 - t)))
        else:
            wm = max(0.04, math.sin((t ** 0.60) * math.pi))

        spine, side, up_v = _leaf_spine_frame(origin, f, side0, up0, length, arch, droop, twist, t)
        hw_base = 0.5 * width * wm
        vc = v0 + (v1 - v0) * t
        row = []
        for c in range(cols + 1):
            sc = (c / cols) * 2.0 - 1.0
            asc = abs(sc)
            hw = hw_base
            if profile == 'banana_split' and asc > 0.22:
                # Smooth organic wind-split notches over high-res rows (no 1-segment stair-stepping)
                s_off = 0.0 if sc > 0.0 else 0.14
                n1 = 0.56 * math.exp(-((t - (0.30 + s_off + 0.04 * math.sin(split_phase))) / 0.048) ** 2)
                n2 = 0.52 * math.exp(-((t - (0.59 + s_off * 0.7 + 0.04 * math.cos(split_phase))) / 0.048) ** 2)
                n3 = 0.42 * math.exp(-((t - (0.80 - s_off * 0.4 + 0.03 * math.sin(split_phase * 1.7))) / 0.044) ** 2)
                notch = min(0.72, (n1 + n2 + n3) * ((asc - 0.22) / 0.78))
                hw *= (1.0 - notch)

            if profile == 'cordate_ear' and t < 0.28:
                lobe_env = (1.0 - t / 0.28) ** 1.65
                back_sweep = -f * (length * 0.20 * math.sin(asc * math.pi * 0.88) * lobe_env)
            elif profile == 'cordate' and t < 0.22:
                lobe_env = (1.0 - t / 0.22) ** 1.65
                back_sweep = -f * (length * 0.11 * math.sin(asc * math.pi * 0.85) * lobe_env)
            else:
                back_sweep = Vector((0.0, 0.0, 0.0))

            cup = width * cup_depth * (asc ** 1.20 - 0.16 * (asc ** 4)) * math.sin(max(0.06, t) * math.pi * 0.92)
            wave = 0.0
            if wave_amp > 0.0:
                wave += width * wave_amp * (asc ** 1.6) * math.sin(t * math.tau * wave_freq + split_phase + (0.9 if sc < 0 else 0.0))
            if vein_depth > 0.0:
                wave += width * vein_depth * math.sin((t * 8.0 - asc * 2.0) * math.pi) * (asc * (1.0 - 0.35 * asc)) * math.sin(t * math.pi)
            split_drop = 0.0
            if profile == 'banana_split' and asc > 0.42:
                split_drop = -width * 0.036 * (asc - 0.42) * math.sin(t * 10.0 + split_phase)

            pt = spine + side * (sc * hw) + up_v * (cup + wave + split_drop) + back_sweep
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
                face = bm.faces.new(vs)
                face.smooth = True
                for loop, coord in zip(face.loops, (uv00, uv10, uv11, uv01)):
                    loop[uv].uv = coord

    # Continuous petiole -> underside 3D midrib spine (physically fuses stem into leaf blade)
    if petiole_pts is not None and petiole_radii is not None and midrib_reach > 0.0:
        r_join = petiole_radii[-1]
        full_pts = list(petiole_pts)
        full_rads = list(petiole_radii)
        mid_steps = 5
        for m_i in range(1, mid_steps + 1):
            mt = (m_i / mid_steps) * midrib_reach
            sp, _, uv_m = _leaf_spine_frame(origin, f, side0, up0, length, arch, droop, twist, mt)
            mr = max(0.0018, r_join * ((1.0 - m_i / (mid_steps + 0.35)) ** 1.15))
            full_pts.append(sp - uv_m * (mr * 0.55))
            full_rads.append(mr)
        smooth_tube(
            bm, uv, full_pts, full_rads, sides=petiole_sides, subdiv=2,
            u_range=petiole_u, v_range=petiole_v, flute_count=flute_count, flute_depth=flute_depth, cap_end=True,
        )


def add_3d_leaf_cluster(
    bm,
    uv,
    node_pt,
    branch_dir,
    rng,
    count=7,
    leaf_len=0.18,
    leaf_w=0.09,
    profile='ovate',
    spread=0.55,
    flat_bias=0.35,
    cup_depth=0.22,
    rows=3,
    cols=2,
    u_range=(0.30, 0.98),
    v_range=(0.04, 0.96),
    stem_u=(0.02, 0.24),
    stem_v=(0.08, 0.68),
    add_petiole=True,
):
    """Volumetric 3D cluster of real cupped leaves physically rooted into `node_pt` (no flat detached cards)."""
    bdir = branch_dir.normalized() if branch_dir.length_squared > 1e-8 else Vector((0.0, 0.0, 1.0))
    ref = Vector((0.0, 0.0, 1.0)) if abs(bdir.z) < 0.92 else Vector((1.0, 0.0, 0.0))
    t1 = bdir.cross(ref).normalized()
    t2 = bdir.cross(t1).normalized()

    for i in range(count):
        az = (i / max(count, 1)) * math.tau + rng.uniform(-0.32, 0.32)
        radial = t1 * math.cos(az) + t2 * math.sin(az)
        # Layer leaves in 3D: mix of outward-flaring and slightly upward-domed angles for natural fluffiness
        elev = rng.uniform(-0.22, 0.55) if i < count - 1 else rng.uniform(0.35, 0.72)
        ldir = (bdir * (0.45 + 0.45 * (i / max(count, 1))) + radial * spread + Vector((0.0, 0.0, elev * (1.0 - flat_bias)))).normalized()
        ll = leaf_len * rng.uniform(0.76, 1.24)
        lw = leaf_w * rng.uniform(0.80, 1.22)
        # Start leaf slightly inside the branch node along a tiny stemlet so it is 100% attached
        pet_len = ll * 0.16 if add_petiole else 0.0
        l_origin = node_pt + ldir * pet_len
        if add_petiole:
            smooth_tube(
                bm, uv, [node_pt - bdir * 0.008, l_origin + ldir * 0.015], [0.0045, 0.0022],
                sides=4, subdiv=1, u_range=stem_u, v_range=stem_v, cap_end=False,
            )
        cupped_leaf_with_midrib(
            bm, uv, l_origin, ldir, ll, lw,
            profile=profile, arch=rng.uniform(0.10, 0.22), droop=rng.uniform(0.12, 0.28),
            cup_depth=cup_depth, roll=rng.uniform(-0.45, 0.45), twist=rng.uniform(-0.18, 0.18),
            rows=rows, cols=cols, u_range=u_range, v_range=v_range,
        )


def add_3d_berry_or_bloom_head(bm, uv, center, radius, u_range=(0.06, 0.22), v_range=(0.78, 0.94), subdivisions=1):
    """Add a compact sculpted 3D spherical berry or buttonbush flower head."""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdivisions, radius=radius)
    u0, u1 = u_range
    v0, v1 = v_range
    vmap = {v: bm.verts.new(v.co + center) for v in tmp.verts}
    for tf in tmp.faces:
        vs = tuple(vmap[v] for v in tf.verts)
        if len(set(vs)) < 3:
            continue
        f = bm.faces.new(vs)
        f.smooth = True
        for loop, tv in zip(f.loops, tf.verts):
            n = tv.co.normalized()
            loop[uv].uv = (
                u0 + (u1 - u0) * (0.5 + 0.4 * n.x),
                v0 + (v1 - v0) * (0.5 + 0.4 * n.z),
            )
    tmp.free()
