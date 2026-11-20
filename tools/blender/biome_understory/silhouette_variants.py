"""Deterministic botanical silhouette builders for biome understory revisions.

Provides biome-distinct, budget-respecting BMesh builders for:
  - Savanna: uneven-branching open-center thorn scrub with staggered outer foliage pads & sparse side
  - Taiga: tiered asymmetric krummholz juniper & varied-height dwarf willow
  - Wetland: common-root-base sedge tussocks with upright inner, staggered mid, and drooping outer blades
  - Rainforest: arched-stem uneven-pinna ferns, canted heart-leaf elephant ear, and rolled-spear split-leaf banana
"""
import math
import os
import random

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from aaa_geometry import shaped_leaf
from aaa_natural_forms import organic_trunk_loft
from understory_common import (
    _catmull_rom_chain,
    fbm,
    finish_mesh,
    height_to_normal,
    leaf_spray_fan,
    make_material,
    save_image,
    tube,
)
from understory_pbr import _snap_and_clean, bake_soil_and_neighbour_ao


# ---------------------------------------------------------------------------
# SHARED LOW-BUDGET FINALIZER & PROCEDURAL TEXTURES
# ---------------------------------------------------------------------------

def finalize_budgeted_mesh(name, bm, material, max_triangles, min_triangles=12):
    """Triangulate, clean, shade, and bake AO without upsampling past `max_triangles`."""
    _snap_and_clean(bm)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.validate(verbose=False)
    mesh.update()

    up = Vector((0.0, 0.0, 1.0))
    custom_normals = []
    for vert in mesh.vertices:
        n = vert.normal * 0.86 + up * 0.14
        custom_normals.append(n.normalized() if n.length_squared > 1e-8 else up)
    mesh.normals_split_custom_set_from_vertices(custom_normals)
    bake_soil_and_neighbour_ao(mesh)

    tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    assert min_triangles <= tris <= max_triangles, (
        f'{name} has {tris} triangles (expected [{min_triangles}, {max_triangles}])'
    )
    return mesh, tris


def _smooth_tube(
    bm,
    uv,
    points,
    radii,
    sides=6,
    subdiv=2,
    u_range=(0.0, 0.25),
    v_range=(0.05, 0.95),
    flute_count=0,
    flute_depth=0.0,
    cap_end=False,
):
    """Smooth Catmull-Rom interpolated tapered tube with optional bark fluting and end cap."""
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
                r_eff *= 1.0 + flute_depth * math.sin(ang * flute_count + frac * 3.2)
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
    if cap_end and len(rings) >= 1 and sides >= 3:
        top_ring = rings[-1]
        center_v = bm.verts.new(pts[-1])
        uc_mid = 0.5 * (u_range[0] + u_range[1])
        vc_top = v_range[1]
        for s in range(sides):
            sn = (s + 1) % sides
            tri = (top_ring[s][0], top_ring[sn][0], center_v)
            if len(set(tri)) == 3:
                f = bm.faces.new(tri)
                f.smooth = True
                for loop, coord in zip(f.loops, (top_ring[s][1], top_ring[sn][1], (uc_mid, vc_top))):
                    loop[uv].uv = coord


def _cupped_leaf(
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
    wave_freq=5.0,
    vein_depth=0.0,
    rows=8,
    cols=6,
    u_range=(0.30, 0.98),
    v_range=(0.04, 0.96),
    split_phase=0.0,
):
    """Sculpted 3D cupped leaf blade with species-specific silhouette profiles, vein corrugation, and marginal waves."""
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
            # Pronounced elephant-ear heart silhouette: broad back-swept basal lobes around the petiole sinus
            ear = 0.56 * math.exp(-((t - 0.14) / 0.15) ** 2)
            wm = max(0.04, math.sin((t ** 0.54) * math.pi) * (1.06 - 0.28 * t) + ear)
        elif profile == 'cordate':
            ear = 0.26 * math.exp(-((t - 0.14) / 0.14) ** 2)
            wm = max(0.05, math.sin((t ** 0.52) * math.pi) * (1.10 - 0.30 * t) + ear)
        elif profile == 'banana_split':
            # Long mature banana paddle with crisp asymmetrical physical wind-split notches along margins
            base_w = 0.22 + 0.78 * math.sin((t ** 0.64) * math.pi)
            wm = max(0.06, base_w)
        elif profile == 'paddle':
            wm = max(0.08, (0.28 + 0.72 * math.sin((t ** 0.68) * math.pi)))
        else:
            wm = max(0.05, math.sin((t ** 0.60) * math.pi))

        curve = length * (arch * math.sin(t * math.pi * 0.85) - droop * (t ** 2.05))
        spine = origin + f * (length * t) + up0 * curve
        tw = twist * t
        side = (side0 * math.cos(tw) + up0 * math.sin(tw)).normalized()
        up_v = (up0 * math.cos(tw) - side0 * math.sin(tw)).normalized()
        hw_base = 0.5 * width * wm
        vc = v0 + (v1 - v0) * t
        row = []
        for c in range(cols + 1):
            sc = (c / cols) * 2.0 - 1.0
            asc = abs(sc)
            hw = hw_base
            # Asymmetrical wind-split notches on left vs right banana margins
            if profile == 'banana_split' and asc > 0.28:
                s_off = 0.0 if sc > 0.0 else 0.13
                n1 = 0.62 * math.exp(-((t - (0.31 + s_off + 0.04 * math.sin(split_phase))) / 0.036) ** 2)
                n2 = 0.58 * math.exp(-((t - (0.60 + s_off * 0.7 + 0.04 * math.cos(split_phase))) / 0.036) ** 2)
                n3 = 0.46 * math.exp(-((t - (0.80 - s_off * 0.4 + 0.03 * math.sin(split_phase * 1.7))) / 0.032) ** 2)
                notch = min(0.76, (n1 + n2 + n3) * ((asc - 0.28) / 0.72))
                hw *= (1.0 - notch)

            # Smooth sinusoidal back-sweep of basal ear lobes around petiole sinus
            if profile == 'cordate_ear' and t < 0.28:
                lobe_env = (1.0 - t / 0.28) ** 1.6
                back_sweep = -f * (length * 0.19 * (math.sin(asc * math.pi * 0.88)) * lobe_env)
            elif profile == 'cordate' and t < 0.22:
                lobe_env = (1.0 - t / 0.22) ** 1.6
                back_sweep = -f * (length * 0.10 * (math.sin(asc * math.pi * 0.85)) * lobe_env)
            else:
                back_sweep = Vector((0.0, 0.0, 0.0))

            # V-channel midrib furrow + gentle outward margin curl
            cup = width * cup_depth * (asc ** 1.18 - 0.16 * (asc ** 4)) * math.sin(max(0.08, t) * math.pi * 0.92)
            # Subtle secondary vein corrugation and marginal undulation
            wave = 0.0
            if wave_amp > 0.0:
                wave += width * wave_amp * (asc ** 1.6) * math.sin(t * math.tau * wave_freq + split_phase + (0.9 if sc < 0 else 0.0))
            if vein_depth > 0.0:
                wave += width * vein_depth * math.sin((t * 9.0 - asc * 2.2) * math.pi) * (asc * (1.0 - 0.35 * asc)) * math.sin(t * math.pi)
            # Slight downward flutter of banana split-leaf segments
            split_drop = 0.0
            if profile == 'banana_split' and asc > 0.45:
                split_drop = -width * 0.045 * (asc - 0.45) * math.sin(t * 14.0 + split_phase)

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


def build_rainforest_fern_material(tex_dir, name='Scan forest-fern-02'):
    """Alpha-cutout pinnate rainforest fern frond texture with arched rachis and uneven gaps between leaflets."""
    rng = np.random.default_rng(701)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (12, 16), rng, 3)

    # Central tapered rachis visible from base through gaps
    rachis_w = 0.022 * (1.0 - 0.62 * v)
    in_rachis = (np.abs(u - 0.5) <= rachis_w) & (v >= 0.01) & (v <= 0.96)
    rgba[in_rachis, :3] = np.array([0.22, 0.33, 0.14]) * (0.85 + 0.25 * noise[in_rachis, None])
    rgba[in_rachis, 3] = 1.0

    # Unevenly spaced pinnae on left and right sides with deliberate airy gaps between leaflets
    left_v = (0.11, 0.18, 0.28, 0.36, 0.48, 0.56, 0.66, 0.77, 0.85, 0.91)
    right_v = (0.14, 0.24, 0.32, 0.43, 0.52, 0.63, 0.72, 0.81, 0.89)
    for side_sign, v_list in ((-1.0, left_v), (1.0, right_v)):
        for idx, v_base in enumerate(v_list):
            env = math.sin(min(1.0, max(0.0, (v_base - 0.04) / 0.92)) * math.pi * 0.94)
            # Uneven leaflet lengths so silhouette breaks up naturally
            len_var = 0.78 if idx % 3 == 1 else (1.08 if idx % 4 == 0 else 0.95)
            p_len = 0.44 * env * len_var
            du = (u - 0.5) * side_sign
            tilt = (0.048 + 0.012 * (idx % 2)) * (np.clip(du, 0.0, 1.0) / max(p_len, 1e-4))
            dv = np.abs(v - (v_base + tilt))
            p_w = 0.020 * (1.0 - 0.58 * np.clip(du / max(p_len, 1e-4), 0.0, 1.0))
            serr = 0.82 + 0.18 * np.sin(du * 95.0)
            in_p = (du >= 0.014) & (du <= p_len) & (dv <= p_w * serr)
            shade = (0.70 + 0.38 * v + 0.18 * noise) * (0.86 + 0.20 * (np.clip(du, 0.0, 1.0) / max(p_len, 1e-4)))
            col = np.array([0.19, 0.41, 0.14]) * shade[..., None]
            rgba[in_p, :3] = np.clip(col[in_p], 0.0, 1.0)
            rgba[in_p, 3] = 1.0

    alb = save_image('rainforest_fern_alb', rgba, os.path.join(tex_dir, 'rainforest-fern-alb.png'))
    return make_material(name, alb, alpha=True, roughness=0.68, subsurface=0.18)


def build_rainforest_broadleaf_material(tex_dir, name, filename, seed, leaf_rgb, vein_rgb, stem_rgb, accent_rgb=None):
    """PBR broadleaf atlas: u < 0.26 = visible ribbed petiole/stem; u >= 0.28 = veined cupped tropical leaf."""
    rng = np.random.default_rng(seed)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    noise = fbm(w, h, (10, 14), rng, 4)
    fine = fbm(w, h, (24, 24), rng, 3)

    rgba = np.ones((h, w, 4), dtype=np.float32)
    in_stem = u < 0.26
    rib = 0.86 + 0.18 * np.cos(u * 90.0)
    stem_col = np.array(stem_rgb) * (0.76 + 0.34 * noise[..., None]) * rib[..., None]
    rgba[in_stem, :3] = np.clip(stem_col[in_stem], 0.0, 1.0)

    lu = np.clip((u - 0.26) / 0.74, 0.0, 1.0)
    du = np.abs(lu - 0.5) * 2.0
    midrib = np.exp(-((du / (0.06 * (1.0 - 0.5 * v) + 0.012)) ** 2))
    vein_wave = np.sin((v * 11.0 - du * 2.8) * math.pi)
    lat_veins = np.clip((vein_wave - 0.62) / 0.38, 0.0, 1.0) * (1.0 - 0.35 * du) * (v > 0.06) * (v < 0.94)
    lamina_shade = (0.72 + 0.36 * v + 0.16 * (noise - 0.5) + 0.08 * (fine - 0.5)) * (1.0 - 0.16 * du * du)
    leaf_col = np.array(leaf_rgb) * lamina_shade[..., None]
    vein_mix = np.clip(midrib * 0.85 + lat_veins * 0.45, 0.0, 1.0)[..., None]
    col = leaf_col * (1.0 - vein_mix) + np.array(vein_rgb) * vein_mix
    rgba[~in_stem, :3] = np.clip(col[~in_stem], 0.0, 1.0)

    if accent_rgb is not None:
        in_acc = (u >= 0.04) & (u <= 0.22) & (v >= 0.74) & (v <= 0.96)
        rgba[in_acc, :3] = np.clip(np.array(accent_rgb) * (0.85 + 0.25 * noise[in_acc, None]), 0.0, 1.0)

    height = 0.5 * noise + 0.35 * midrib + 0.15 * lat_veins
    alb = save_image(f'{filename}_alb', rgba, os.path.join(tex_dir, f'{filename}-alb.png'))
    nrm = save_image(f'{filename}_nrm', height_to_normal(height, 2.2), os.path.join(tex_dir, f'{filename}-nrm.png'), non_color=True)
    return make_material(name, alb, alpha=False, normal_image=nrm, roughness=0.48, subsurface=0.22)


# ---------------------------------------------------------------------------
# 1. SAVANNA: UNEVEN-BRANCHING OPEN-CENTER THORN SCRUB WITH STAGGERED OUTER PADS
# ---------------------------------------------------------------------------

def build_savanna_thorn_scrub(mat, name='bush-savanna-thorn-01', seed=322, low_budget=False, max_triangles=16050):
    """Savanna thorn-scrub: open center, vertically staggered forks, 2-3 outer foliage pads, one sparse side."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Vertically staggered forks (z_elbow 0.20..0.60 m, z_top 0.56..1.24 m), open central crown.
    # Stem 4 (-X/+Y quadrant) is intentionally sparse (bare thorn fork + single small outer tuft).
    stems = (
        # (yaw, r_xy, z_elbow, z_top, fork_len, pad_count)
        (0.16, 0.86, 0.22, 0.74, 0.42, 3),
        (1.18, 0.72, 0.54, 1.24, 0.38, 3),
        (2.48, 0.94, 0.36, 0.92, 0.46, 3),
        (3.62, 0.78, 0.60, 1.12, 0.36, 2),
        (4.92, 0.80, 0.28, 0.58, 0.30, 1),  # visibly sparser side
    )
    for idx, (yaw, r_xy, z_elbow, z_top, fork_len, pad_count) in enumerate(stems):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        crook = rng.uniform(-0.18, 0.18)
        p0 = out * rng.uniform(0.08, 0.14) + Vector((0.0, 0.0, -0.02))
        p_mid0 = out * (r_xy * 0.24) + side * (crook * 0.65) + Vector((0.0, 0.0, z_elbow * 0.52))
        p1 = out * (r_xy * 0.48) + side * crook + Vector((0.0, 0.0, z_elbow))
        p2 = out * r_xy + side * (crook * 0.55 + rng.uniform(-0.12, 0.12)) + Vector((0.0, 0.0, z_top))

        if low_budget:
            _smooth_tube(
                bm, uv, [p0, p_mid0, p1, p2], [0.056, 0.042, 0.030, 0.013],
                sides=8, subdiv=2, u_range=(0.02, 0.26), v_range=(0.04, 0.94),
                flute_count=4, flute_depth=0.14, cap_end=True,
            )
        else:
            organic_trunk_loft(bm, uv, [p0, p1, p2], [0.056, 0.032, 0.014], rng, sides=6, bark_ridges=5, ridge_depth=0.14, cap_end=False, u_range=(0.02, 0.27), v_range=(0.04, 0.94))

        s_sign = 1.0 if idx % 2 == 0 else -1.0
        fork_start = p1.lerp(p2, rng.uniform(0.18, 0.42))
        fork_mid = fork_start + out * (fork_len * 0.42) + side * (s_sign * fork_len * 0.46) + Vector((0.0, 0.0, rng.uniform(0.08, 0.18)))
        fork_end = fork_start + out * (fork_len * 0.76) + side * (s_sign * fork_len * 0.82) + Vector((0.0, 0.0, rng.uniform(0.14, 0.34)))
        if low_budget:
            _smooth_tube(
                bm, uv, [fork_start, fork_mid, fork_end], [0.025, 0.017, 0.008],
                sides=6, subdiv=2, u_range=(0.02, 0.26), v_range=(0.12, 0.90),
                flute_count=3, flute_depth=0.10, cap_end=True,
            )
        else:
            tube(bm, uv, [fork_start, fork_end], [0.024, 0.011], sides=4, u_range=(0.02, 0.27), v_range=(0.10, 0.90), cap_end=False)

        spur_start = p1.lerp(p2, 0.64)
        spur_mid = spur_start + out * 0.11 + side * (-s_sign * 0.13) + Vector((0.0, 0.0, 0.08))
        spur_end = spur_start + out * 0.22 + side * (-s_sign * 0.22) + Vector((0.0, 0.0, 0.14))
        if low_budget:
            _smooth_tube(
                bm, uv, [spur_start, spur_mid, spur_end], [0.015, 0.010, 0.004],
                sides=5, subdiv=2, u_range=(0.02, 0.26), v_range=(0.15, 0.85), cap_end=True,
            )
            # Fine crooked thorn twiglet off the fork for crisp close-up woody silhouette
            twig_base = fork_mid.lerp(fork_end, 0.35)
            twig_mid = twig_base + out * 0.09 + side * (-s_sign * 0.07) + Vector((0.0, 0.0, 0.08))
            twig_tip = twig_mid + out * 0.08 + side * (-s_sign * 0.04) + Vector((0.0, 0.0, 0.09))
            _smooth_tube(
                bm, uv, [twig_base, twig_mid, twig_tip], [0.010, 0.006, 0.003],
                sides=4, subdiv=2, u_range=(0.02, 0.26), v_range=(0.18, 0.84), cap_end=True,
            )
        else:
            tube(bm, uv, [spur_start, spur_end], [0.016, 0.006], sides=3, u_range=(0.02, 0.27), v_range=(0.15, 0.85), cap_end=False)

        # 2-3 small, uneven layered foliage pads on outer branch tips (pitched so they read at mid-distance)
        tip_dir = Vector((p2.x - p1.x, p2.y - p1.y, 0.22)).normalized()
        f_dir = Vector((fork_end.x - fork_start.x, fork_end.y - fork_start.y, 0.18)).normalized()

        # Primary outer tip pad (paired crossed-tilt cards so it reads from both ground and elevated mid-distance)
        pad_l = rng.uniform(0.50, 0.68) if pad_count > 1 else 0.42
        pad_w = rng.uniform(0.56, 0.74) if pad_count > 1 else 0.44
        if low_budget:
            _cupped_leaf(bm, uv, p2 - tip_dir * 0.10, tip_dir, pad_l, pad_w, profile='ovate', arch=0.10, droop=0.12, cup_depth=0.22, roll=s_sign * 0.24, twist=s_sign * 0.14, wave_amp=0.04, rows=7, cols=4, u_range=(0.30, 1.0), v_range=(0.02, 0.98))
            _cupped_leaf(bm, uv, p2 - tip_dir * 0.06 + Vector((0, 0, 0.05)), (tip_dir * 0.76 + side * (s_sign * 0.46) + Vector((0, 0, 0.28))).normalized(), pad_l * 0.82, pad_w * 0.84, profile='ovate', arch=0.12, droop=0.10, cup_depth=0.20, roll=-s_sign * 0.62, twist=-s_sign * 0.12, wave_amp=0.04, rows=7, cols=4, u_range=(0.30, 1.0), v_range=(0.02, 0.98))
            if pad_count >= 2:
                _cupped_leaf(bm, uv, fork_end - f_dir * 0.08, f_dir, pad_l * 0.86, pad_w * 0.88, profile='ovate', arch=0.09, droop=0.11, cup_depth=0.20, roll=-s_sign * 0.28, twist=s_sign * 0.12, wave_amp=0.04, rows=7, cols=4, u_range=(0.30, 1.0), v_range=(0.02, 0.98))
                _cupped_leaf(bm, uv, fork_end - f_dir * 0.04 + Vector((0, 0, 0.04)), (f_dir * 0.80 - side * (s_sign * 0.42) + Vector((0, 0, 0.30))).normalized(), pad_l * 0.72, pad_w * 0.74, profile='ovate', arch=0.11, droop=0.09, cup_depth=0.18, roll=s_sign * 0.58, twist=-s_sign * 0.12, wave_amp=0.035, rows=6, cols=4, u_range=(0.30, 1.0), v_range=(0.02, 0.98))
            if pad_count >= 3:
                s_dir = Vector((spur_end.x - spur_start.x, spur_end.y - spur_start.y, 0.26)).normalized()
                _cupped_leaf(bm, uv, spur_end - s_dir * 0.06, s_dir, pad_l * 0.68, pad_w * 0.72, profile='ovate', arch=0.10, droop=0.10, cup_depth=0.22, roll=s_sign * 0.40, twist=s_sign * 0.10, wave_amp=0.035, rows=6, cols=4, u_range=(0.30, 1.0), v_range=(0.02, 0.98))
        else:
            leaf_spray_fan(bm, uv, p2 - tip_dir * 0.10, tip_dir, pad_l, pad_w, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=s_sign * 0.24, arch=0.08, cup=0.22, tip_scale=0.46)
            leaf_spray_fan(bm, uv, p2 - tip_dir * 0.06 + Vector((0, 0, 0.05)), (tip_dir * 0.76 + side * (s_sign * 0.46) + Vector((0, 0, 0.28))).normalized(), pad_l * 0.82, pad_w * 0.84, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=-s_sign * 0.62, arch=0.10, cup=0.20, tip_scale=0.42)

            if pad_count >= 2:
                leaf_spray_fan(bm, uv, fork_end - f_dir * 0.08, f_dir, pad_l * 0.86, pad_w * 0.88, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=-s_sign * 0.28, arch=0.07, cup=0.20, tip_scale=0.44)
                leaf_spray_fan(bm, uv, fork_end - f_dir * 0.04 + Vector((0, 0, 0.04)), (f_dir * 0.80 - side * (s_sign * 0.42) + Vector((0, 0, 0.30))).normalized(), pad_l * 0.72, pad_w * 0.74, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=s_sign * 0.58, arch=0.09, cup=0.18, tip_scale=0.40)

            if pad_count >= 3:
                s_dir = Vector((spur_end.x - spur_start.x, spur_end.y - spur_start.y, 0.26)).normalized()
                leaf_spray_fan(bm, uv, spur_end - s_dir * 0.06, s_dir, pad_l * 0.68, pad_w * 0.72, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=s_sign * 0.40, arch=0.08, cup=0.22, tip_scale=0.42)

    if low_budget:
        return finalize_budgeted_mesh(name, bm, mat, max_triangles=max_triangles)
    return finish_mesh(name, bm, mat, max_triangles=max_triangles, allow_extra_material=False)


# ---------------------------------------------------------------------------
# 2. TAIGA: TIERED ASYMMETRIC JUNIPER & VARIED-HEIGHT DWARF WILLOW
# ---------------------------------------------------------------------------

def build_taiga_krummholz_juniper(mat, name='bush-boreal-juniper-01', seed=324, max_triangles=16050):
    """Tiered asymmetric boreal juniper with strong height variation (0.28–1.24 m) so plants read clearly over moss."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    root_origin = Vector((-0.12, 0.04, -0.028))
    boughs = (
        (0.25, 0.42, 0.56, 1.22, 0.064, 0.64),
        (1.38, 0.76, 0.38, 0.86, 0.054, 0.58),
        (4.55, 0.72, 0.34, 0.74, 0.050, 0.56),
        (2.55, 0.88, 0.16, 0.44, 0.046, 0.52),
        (3.60, 0.80, 0.14, 0.34, 0.044, 0.48),
        (5.58, 0.86, 0.18, 0.48, 0.046, 0.50),
    )
    for idx, (yaw, r_xy, z_elbow, z_tip, r0, spray_s) in enumerate(boughs):
        out = Vector((math.cos(yaw) + 0.16, math.sin(yaw), 0.0)).normalized()
        side = Vector((-out.y, out.x, 0.0))
        p0 = root_origin + out * 0.05
        p1 = root_origin + out * (r_xy * 0.50) + side * rng.uniform(-0.10, 0.10) + Vector((0.0, 0.0, z_elbow))
        p2 = root_origin + out * r_xy + side * rng.uniform(-0.08, 0.08) + Vector((0.0, 0.0, z_tip))
        organic_trunk_loft(bm, uv, [p0, p1, p2], [r0, r0 * 0.58, r0 * 0.24], rng, sides=6, bark_ridges=5, ridge_depth=0.14, cap_end=False, u_range=(0.02, 0.27), v_range=(0.04, 0.94))

        s_sign = 1.0 if idx % 2 == 0 else -1.0
        fork = p1 + out * 0.26 + side * (s_sign * 0.28) + Vector((0.0, 0.0, 0.22 if idx < 3 else 0.12))
        tube(bm, uv, [p1, fork], [r0 * 0.44, r0 * 0.20], sides=4, u_range=(0.02, 0.27), v_range=(0.10, 0.90), cap_end=False)

        tip_dir = Vector((out.x * 0.65, out.y * 0.65, 0.72 if idx == 0 else 0.52)).normalized()
        leaf_spray_fan(bm, uv, p2 - tip_dir * 0.14, tip_dir, spray_s, spray_s * 1.04, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=s_sign * 0.26, arch=0.18, cup=0.20, tip_scale=0.34)
        leaf_spray_fan(bm, uv, p2 - tip_dir * 0.08, (tip_dir * 0.8 + side * (s_sign * 0.45)).normalized(), spray_s * 0.84, spray_s * 0.88, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=-s_sign * 0.62, arch=0.14, cup=0.18, tip_scale=0.32)

        f_dir = Vector((fork.x - p1.x, fork.y - p1.y, 0.38)).normalized()
        leaf_spray_fan(bm, uv, fork - f_dir * 0.10, f_dir, spray_s * 0.86, spray_s * 0.90, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=-s_sign * 0.30, arch=0.16, cup=0.18, tip_scale=0.34)
        if idx < 3:
            mid_pt = p1.lerp(p2, 0.45)
            m_dir = (out * 0.75 - side * (s_sign * 0.55) + Vector((0, 0, 0.34))).normalized()
            leaf_spray_fan(bm, uv, mid_pt, m_dir, spray_s * 0.78, spray_s * 0.82, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=s_sign * 0.48, arch=0.15, cup=0.18, tip_scale=0.36)

    return finish_mesh(name, bm, mat, max_triangles=max_triangles, allow_extra_material=False)


def build_taiga_dwarf_willow_shrub(mat, name='tundra-dwarf-willow-01', seed=219, max_triangles=16050):
    """Varied-height boreal dwarf willow/birch shrub (0.20–0.74 m) that reads clearly over moss and duff."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    shoots = (
        (0.22, 0.52, 0.28, 0.70, 0.036),
        (1.48, 0.66, 0.22, 0.54, 0.032),
        (2.65, 0.74, 0.14, 0.36, 0.028),
        (3.82, 0.58, 0.26, 0.64, 0.034),
        (4.95, 0.78, 0.12, 0.28, 0.028),
        (5.72, 0.44, 0.20, 0.48, 0.026),
    )
    root = Vector((-0.08, 0.02, -0.025))
    for idx, (yaw, r_xy, z_mid, z_top, rad) in enumerate(shoots):
        out = Vector((math.cos(yaw) + 0.14, math.sin(yaw), 0.0)).normalized()
        side = Vector((-out.y, out.x, 0.0))
        p0 = root + out * 0.04
        p1 = root + out * (r_xy * 0.48) + side * rng.uniform(-0.08, 0.08) + Vector((0.0, 0.0, z_mid))
        p2 = root + out * r_xy + side * rng.uniform(-0.06, 0.06) + Vector((0.0, 0.0, z_top))
        organic_trunk_loft(bm, uv, [p0, p1, p2], [rad, rad * 0.58, rad * 0.26], rng, sides=6, bark_ridges=4, ridge_depth=0.12, cap_end=False, u_range=(0.47, 0.53), v_range=(0.05, 0.80))

        s_sign = 1.0 if idx % 2 == 0 else -1.0
        twig = p1 + out * 0.20 + side * (s_sign * 0.22) + Vector((0.0, 0.0, 0.18 if idx in (0, 1, 3) else 0.09))
        tube(bm, uv, [p1, twig], [rad * 0.46, rad * 0.22], sides=4, u_range=(0.47, 0.53), v_range=(0.10, 0.75), cap_end=False)

        f_tip = (p2 - p1 + Vector((0, 0, 0.22))).normalized()
        f_twig = (twig - p1 + Vector((0, 0, 0.18))).normalized()
        leaf_spray_fan(bm, uv, p2 - f_tip * 0.08, f_tip, 0.38, 0.42, u_range=(0.0, 1.0), v_range=(0.0, 0.98), roll=s_sign * 0.28, arch=0.12, cup=0.22, tip_scale=0.38)
        leaf_spray_fan(bm, uv, p2 - f_tip * 0.05, (f_tip * 0.75 - side * (s_sign * 0.52)).normalized(), 0.32, 0.36, u_range=(0.0, 1.0), v_range=(0.0, 0.98), roll=-s_sign * 0.55, arch=0.10, cup=0.20, tip_scale=0.36)
        leaf_spray_fan(bm, uv, twig - f_twig * 0.06, f_twig, 0.34, 0.38, u_range=(0.0, 1.0), v_range=(0.0, 0.98), roll=-s_sign * 0.35, arch=0.10, cup=0.20, tip_scale=0.38)

    return finish_mesh(name, bm, mat, max_triangles=max_triangles)


# ---------------------------------------------------------------------------
# 3. WETLAND: COMMON-ROOTED SEDGE TUSSOCK WITH UPRIGHT INNER, STAGGERED MID, DROOPING OUTER BLADES
# ---------------------------------------------------------------------------

def build_wetland_sedge_tussock(mat, name='coastal-dune-oats-01', seed=301, max_triangles=16050):
    """Wetland sedge tussock: visible basal root crown, upright inner blades, staggered mid, uneven drooping outer."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Distinct rooted basal tussock crown / fibrous culm sheath at (0, 0, -0.04..0.11)
    crown_pts = [
        Vector((0.0, 0.0, -0.04)),
        Vector((0.0, 0.0, 0.02)),
        Vector((0.0, 0.0, 0.075)),
        Vector((0.0, 0.0, 0.115)),
    ]
    tube(bm, uv, crown_pts, [0.16, 0.135, 0.105, 0.065], sides=10, u_range=(0.04, 0.42), v_range=(0.04, 0.65), cap_end=True, rough=0.14, rng=rng)
    # 5 short fibrous root buttresses anchoring the sedge crown into wet peat
    for r_i in range(5):
        ang = (r_i / 5.0) * math.tau + rng.uniform(-0.25, 0.25)
        out = Vector((math.cos(ang), math.sin(ang), 0.0))
        r0 = out * 0.06 + Vector((0.0, 0.0, 0.055))
        r1 = out * 0.14 + Vector((0.0, 0.0, 0.015))
        r2 = out * 0.21 + Vector((0.0, 0.0, -0.035))
        tube(bm, uv, [r0, r1, r2], [0.026, 0.018, 0.008], sides=5, u_range=(0.04, 0.42), v_range=(0.06, 0.55), cap_end=True)

    # 3 clearly separated blade tiers all rooted inside the single basal crown (r <= 0.085 m):
    # - Inner: 6 upright blades (0.88–1.10 m) rising cleanly from the crown center
    # - Middle: 12 leaves angled outward at staggered heights (0.58–0.92 m)
    # - Outer: 14 leaves drooping unevenly toward the bog floor (0.42–0.74 m, asymmetric droop)
    tiers = (
        (6, 0.010, 0.032, 0.88, 1.12, 1.15, 1.55, 0.09, 0.16, 0.095),
        (12, 0.028, 0.060, 0.58, 0.92, 0.48, 0.88, 0.16, 0.36, 0.115),
        (14, 0.048, 0.082, 0.42, 0.74, 0.20, 0.46, 0.14, 0.58, 0.125),
    )
    for tier_idx, (count, r_lo, r_hi, len_lo, len_hi, pitch_lo, pitch_hi, arch, droop, width) in enumerate(tiers):
        for k in range(count):
            yaw = ((k + tier_idx * 0.31) / count) * math.tau + rng.uniform(-0.26, 0.26)
            r = rng.uniform(r_lo, r_hi)
            origin = Vector((math.cos(yaw) * r, math.sin(yaw) * r, 0.045 - tier_idx * 0.012))
            # Stagger middle heights and outer droop unevenly around the tussock
            stagger = 0.78 + 0.44 * ((k * 37 % 11) / 10.0)
            pitch = rng.uniform(pitch_lo, pitch_hi)
            fdir = Vector((math.cos(yaw), math.sin(yaw), pitch)).normalized()
            blen = rng.uniform(len_lo, len_hi) * (0.86 + 0.24 * (k % 3) / 2.0)
            bw = width * rng.uniform(0.80, 1.20)
            shaped_leaf(
                bm,
                uv,
                origin,
                fdir,
                blen,
                bw,
                profile='lanceolate',
                asym=0.09,
                twist=rng.uniform(-0.28, 0.28),
                arch=arch,
                droop=droop * stagger,
                cup_depth=0.22,
                roll=rng.uniform(-0.24, 0.24),
                u_range=(0.46, 0.98),
                v_range=(0.02, 0.98),
            )

    # Keep drooping outer blade tips above ground plane so bottom-center pivot stays at the basal crown
    for v in bm.verts:
        if math.hypot(v.co.x, v.co.y) > 0.24 and v.co.z < 0.005:
            v.co.z = 0.005

    return finish_mesh(name, bm, mat, max_triangles=max_triangles)


# ---------------------------------------------------------------------------
# 4. RAINFOREST: ARCHED-STEM FERNS, CANTED HEART ELEPHANT EAR, SPEAR+SPLIT BANANA
# ---------------------------------------------------------------------------

def build_rainforest_layered_fern(mat, name='forest-fern-02', seed=701, max_triangles=3800):
    """3-tier rainforest fern with smooth arched basal stems, sculpted pinnate fronds, and spiraled croziers."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Fibrous rhizome crown collar
    _smooth_tube(
        bm, uv,
        [Vector((0, 0, -0.02)), Vector((0, 0, 0.02)), Vector((0, 0, 0.065))],
        [0.095, 0.078, 0.048],
        sides=10, subdiv=2, u_range=(0.47, 0.53), v_range=(0.02, 0.22),
        flute_count=5, flute_depth=0.10, cap_end=True,
    )

    # 3 frond tiers with visible arched stipes (~26% of frond length) before the pinnate blade
    tiers = (
        (6, 0.04, 1.00, 1.32, 0.34, 0.24, 0.38, 0.28, 0.44),
        (7, 0.03, 0.84, 1.12, 0.30, 0.62, 0.86, 0.26, 0.32),
        (5, 0.02, 0.54, 0.78, 0.24, 1.12, 1.52, 0.22, 0.16),
    )
    for tier_idx, (count, r0, len_lo, len_hi, w_frac, pitch_lo, pitch_hi, arch, droop) in enumerate(tiers):
        for k in range(count):
            yaw = ((k + tier_idx * 0.39) / count) * math.tau + rng.uniform(-0.24, 0.24)
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            fl = rng.uniform(len_lo, len_hi)
            fw = fl * w_frac * rng.uniform(0.86, 1.16)
            base = out * r0 + Vector((0.0, 0.0, 0.02 + tier_idx * 0.02))
            # Smoothly arched curved stipe tapering cleanly into the pinnate frond rachis
            stipe_len = fl * 0.26
            stipe_mid = base + out * (stipe_len * 0.42) + Vector((0.0, 0.0, stipe_len * (0.58 + 0.14 * tier_idx)))
            stipe_tip = base + out * (stipe_len * 0.95) + Vector((0.0, 0.0, stipe_len * (0.92 + 0.22 * tier_idx)))
            blade_dir = (stipe_tip - stipe_mid).normalized()
            _smooth_tube(
                bm, uv, [base, stipe_mid, stipe_tip], [0.014, 0.0085, 0.0028],
                sides=6, subdiv=2, u_range=(0.48, 0.52), v_range=(0.02, 0.30), cap_end=True,
            )
            _cupped_leaf(
                bm,
                uv,
                stipe_tip - blade_dir * 0.04,
                blade_dir,
                fl * 0.78,
                fw,
                profile='ovate',
                arch=arch,
                droop=droop,
                cup_depth=0.16,
                roll=rng.uniform(-0.22, 0.22),
                twist=rng.uniform(-0.18, 0.18),
                wave_amp=0.018,
                wave_freq=2.8,
                rows=10,
                cols=4,
                u_range=(0.02, 0.98),
                v_range=(0.02, 0.98),
                split_phase=k * 1.1,
            )

    # 3 true 3D spiraled fiddlehead croziers unfurling at the crown center
    for c_i in range(3):
        ang = c_i * 2.1 + 0.4
        out = Vector((math.cos(ang), math.sin(ang), 0.0))
        h = 0.28 + c_i * 0.06
        pts = [
            out * 0.02 + Vector((0, 0, 0.02)),
            out * 0.04 + Vector((0, 0, h * 0.42)),
            out * 0.06 + Vector((0, 0, h * 0.78)),
        ]
        rads = [0.013, 0.011, 0.009]
        coil_center = out * 0.095 + Vector((0, 0, h * 0.84))
        for s_idx in range(7):
            theta = s_idx * 0.85
            coil_r = 0.038 * (0.82 ** s_idx)
            pt = coil_center - out * (math.cos(theta) * coil_r) + Vector((0, 0, math.sin(theta) * coil_r))
            pts.append(pt)
            rads.append(max(0.003, 0.0085 * (0.86 ** s_idx)))
        _smooth_tube(bm, uv, pts, rads, sides=6, subdiv=1, u_range=(0.47, 0.53), v_range=(0.04, 0.60), cap_end=True)

    # Keep outer drooping frond tips above ground plane so pivot stays anchored at the rhizome crown
    for v in bm.verts:
        if math.hypot(v.co.x, v.co.y) > 0.15 and v.co.z < 0.005:
            v.co.z = 0.005

    return finalize_budgeted_mesh(name, bm, mat, max_triangles=max_triangles)


def build_rainforest_cupped_broadleaf(mat, name, seed=710, style='elephant_ear', max_triangles=1950):
    """Species-distinct high-detail rainforest broadleaves: heart-leaf elephant ear, spear+split banana, calathea, anthurium."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    if style == 'elephant_ear':
        # Compact basal corm/rhizome collar grounding the 6 flared petioles
        _smooth_tube(
            bm, uv,
            [Vector((0, 0, -0.02)), Vector((0, 0, 0.03)), Vector((0, 0, 0.09))],
            [0.105, 0.088, 0.062],
            sides=10, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.35),
            flute_count=6, flute_depth=0.10, cap_end=True,
        )
        # 6 canted heart-shaped leaves at varied heights with smooth curved fluted petioles
        leaves = (
            # (yaw, stem_r, stem_h, blade_len, blade_w, pitch, roll)
            (0.25, 0.28, 0.98, 0.78, 0.64, -0.18, 0.42),   # tall canted heart leaf
            (1.42, 0.36, 0.64, 0.82, 0.68, -0.26, -0.48),  # low broad canted leaf
            (2.58, 0.24, 1.08, 0.72, 0.58, -0.10, 0.38),   # highest canted leaf
            (3.65, 0.38, 0.54, 0.76, 0.64, -0.30, -0.44),  # side-facing low heart leaf
            (4.78, 0.30, 0.84, 0.74, 0.62, -0.20, 0.52),   # mid canted leaf
            (5.65, 0.18, 0.72, 0.56, 0.46, 0.12, -0.34),   # young inner tilted leaf
        )
        for idx, (yaw, sr, sh, bl, bw, pitch, roll) in enumerate(leaves):
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            p0 = out * 0.04 + Vector((0, 0, -0.015))
            p1 = out * (sr * 0.26) + Vector((0, 0, sh * 0.34))
            p2 = out * (sr * 0.62) + Vector((0, 0, sh * 0.72))
            p3 = out * sr + Vector((0, 0, sh))
            # Smooth stout curved petiole with flared basal sheath attaching cleanly into the underside sinus
            _smooth_tube(
                bm, uv, [p0, p1, p2, p3], [0.044, 0.031, 0.023, 0.016],
                sides=8, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.94),
                flute_count=3, flute_depth=0.06, cap_end=True,
            )
            fdir = Vector((out.x, out.y, pitch)).normalized()
            _cupped_leaf(
                bm, uv, p3 - out * 0.04 - Vector((0, 0, 0.012)), fdir, bl, bw,
                profile='cordate_ear', arch=0.13, droop=0.23, cup_depth=0.26, roll=roll,
                twist=rng.uniform(-0.10, 0.10), wave_amp=0.018, wave_freq=2.5, vein_depth=0.012,
                rows=12, cols=8, u_range=(0.28, 0.98), v_range=(0.04, 0.96), split_phase=idx * 1.2,
            )
    elif style == 'banana':
        # Sculpted fluted/layered leaf-sheath pseudostem with flared root collar
        _smooth_tube(
            bm, uv,
            [
                Vector((0.0, 0.0, -0.02)),
                Vector((0.01, -0.005, 0.22)),
                Vector((0.02, -0.01, 0.48)),
                Vector((0.032, -0.004, 0.72)),
                Vector((0.04, 0.0, 0.94)),
            ],
            [0.145, 0.118, 0.100, 0.086, 0.072],
            sides=12, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.94),
            flute_count=5, flute_depth=0.06, cap_end=True,
        )
        # Smooth spiraled upright rolled cigar/spear leaf emerging from the pseudostem crown (1.84 m tall!)
        spear_pts = [
            Vector((0.04, 0.0, 0.88)),
            Vector((0.046, 0.006, 1.16)),
            Vector((0.056, 0.014, 1.44)),
            Vector((0.072, 0.022, 1.68)),
            Vector((0.09, 0.03, 1.84)),
        ]
        _smooth_tube(
            bm, uv, spear_pts, [0.048, 0.041, 0.031, 0.018, 0.005],
            sides=8, subdiv=2, u_range=(0.40, 0.68), v_range=(0.06, 0.96),
            flute_count=1, flute_depth=0.14, cap_end=True,
        )

        # 5 longer, smoothly arching, wind-split mature banana fronds at staggered heights
        leaves = (
            # (yaw, z_att, pet_l, blade_l, blade_w, pitch, roll, split_phase)
            (0.22, 0.74, 0.34, 1.56, 0.56, 0.36, 0.22, 0.4),
            (1.48, 0.88, 0.30, 1.46, 0.52, 0.54, -0.18, 1.6),
            (2.74, 0.62, 0.38, 1.64, 0.58, 0.16, 0.26, 2.8),
            (3.96, 0.82, 0.32, 1.52, 0.54, 0.44, -0.20, 4.1),
            (5.22, 0.68, 0.36, 1.58, 0.56, 0.24, 0.18, 5.3),
        )
        for yaw, z_att, pet_l, bl, bw, pitch, roll, sp in leaves:
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            p0 = out * 0.05 + Vector((0.03, 0.0, z_att))
            p1 = p0 + out * (pet_l * 0.55) + Vector((0, 0, pet_l * 0.60))
            p2 = p0 + out * pet_l + Vector((0, 0, pet_l * 0.92))
            _smooth_tube(
                bm, uv, [p0, p1, p2], [0.034, 0.022, 0.015],
                sides=7, subdiv=2, u_range=(0.02, 0.24), v_range=(0.10, 0.92),
                flute_count=2, flute_depth=0.08,
            )
            fdir = Vector((out.x, out.y, pitch)).normalized()
            _cupped_leaf(
                bm, uv, p2 - out * 0.02, fdir, bl, bw,
                profile='banana_split', arch=0.22, droop=0.44, cup_depth=0.22, roll=roll,
                twist=0.08 * math.sin(sp), wave_amp=0.014, wave_freq=2.5, vein_depth=0.010,
                rows=16, cols=6, u_range=(0.28, 0.98), v_range=(0.04, 0.96), split_phase=sp,
            )
    elif style == 'calathea':
        _smooth_tube(
            bm, uv,
            [Vector((0, 0, -0.015)), Vector((0, 0, 0.045))],
            [0.068, 0.042],
            sides=8, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.30), cap_end=True,
        )
        tiers = (
            (5, 0.18, 0.28, 0.38, 0.26, 0.16, 0.22),
            (4, 0.12, 0.44, 0.34, 0.24, 0.34, 0.26),
            (3, 0.07, 0.58, 0.28, 0.20, 0.58, 0.28),
        )
        for t_i, (cnt, sr, sh, bl, bw, pitch, cup) in enumerate(tiers):
            for k in range(cnt):
                yaw = ((k + t_i * 0.42) / cnt) * math.tau + rng.uniform(-0.20, 0.20)
                out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
                p0 = out * 0.03 + Vector((0, 0, -0.01))
                p1 = out * (sr * 0.48) + Vector((0, 0, sh * 0.58))
                p2 = out * sr + Vector((0, 0, sh + rng.uniform(-0.04, 0.05)))
                _smooth_tube(bm, uv, [p0, p1, p2], [0.017, 0.011, 0.008], sides=6, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.94), cap_end=True)
                fdir = Vector((out.x, out.y, pitch + rng.uniform(-0.08, 0.10))).normalized()
                _cupped_leaf(
                    bm, uv, p2 - fdir * 0.025 - Vector((0, 0, 0.01)), fdir, bl * rng.uniform(0.88, 1.12), bw * rng.uniform(0.90, 1.12),
                    profile='ovate', arch=0.14, droop=0.22, cup_depth=cup, roll=rng.uniform(-0.26, 0.26),
                    twist=rng.uniform(-0.14, 0.14), wave_amp=0.018, wave_freq=2.5, vein_depth=0.010,
                    rows=12, cols=6, u_range=(0.28, 0.98), v_range=(0.04, 0.96), split_phase=k * 1.3 + t_i,
                )
    else:
        _smooth_tube(
            bm, uv,
            [Vector((0, 0, -0.015)), Vector((0, 0, 0.05))],
            [0.072, 0.045],
            sides=8, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.30), cap_end=True,
        )
        tiers = (
            (5, 0.26, 0.34, 0.54, 0.38, 0.12, 0.28),
            (3, 0.18, 0.52, 0.46, 0.34, 0.30, 0.30),
            (2, 0.10, 0.66, 0.38, 0.28, 0.52, 0.26),
        )
        for t_i, (cnt, sr, sh, bl, bw, pitch, cup) in enumerate(tiers):
            for k in range(cnt):
                yaw = ((k + t_i * 0.38) / cnt) * math.tau + rng.uniform(-0.22, 0.22)
                out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
                p0 = out * 0.03 + Vector((0, 0, -0.01))
                p1 = out * (sr * 0.46) + Vector((0, 0, sh * 0.56))
                p2 = out * sr + Vector((0, 0, sh + rng.uniform(-0.04, 0.06)))
                _smooth_tube(bm, uv, [p0, p1, p2], [0.019, 0.012, 0.009], sides=6, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.70), cap_end=True)
                fdir = Vector((out.x, out.y, pitch + rng.uniform(-0.06, 0.08))).normalized()
                _cupped_leaf(
                    bm, uv, p2 - fdir * 0.03 - Vector((0, 0, 0.012)), fdir, bl * rng.uniform(0.90, 1.12), bw * rng.uniform(0.90, 1.10),
                    profile='cordate', arch=0.16, droop=0.28, cup_depth=cup, roll=rng.uniform(-0.24, 0.24),
                    twist=rng.uniform(-0.12, 0.12), wave_amp=0.015, wave_freq=2.5, vein_depth=0.010,
                    rows=12, cols=6, u_range=(0.28, 0.98), v_range=(0.04, 0.96), split_phase=k * 1.1,
                )
        for s_i, yaw in enumerate((0.8, 3.9)):
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            p0 = out * 0.03 + Vector((0, 0, 0.0))
            p1 = out * 0.12 + Vector((0, 0, 0.42))
            p2 = out * 0.18 + Vector((0, 0, 0.74 - s_i * 0.08))
            _smooth_tube(bm, uv, [p0, p1, p2], [0.011, 0.008, 0.006], sides=6, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.70))
            spathe_dir = Vector((out.x, out.y, 0.35)).normalized()
            _cupped_leaf(
                bm, uv, p2, spathe_dir, 0.17, 0.15,
                profile='cordate', arch=0.10, droop=0.06, cup_depth=0.34, roll=0.0,
                rows=8, cols=6, u_range=(0.04, 0.22), v_range=(0.74, 0.96),
            )
            # Sculpted 3D spadix spike rising from the center of each glossy anthurium spathe
            spadix_pts = [
                p2 + spathe_dir * 0.02 + Vector((0, 0, 0.008)),
                p2 + spathe_dir * 0.055 + Vector((0, 0, 0.055)),
                p2 + spathe_dir * 0.082 + Vector((0, 0, 0.115)),
            ]
            _smooth_tube(bm, uv, spadix_pts, [0.011, 0.010, 0.006], sides=7, subdiv=2, u_range=(0.06, 0.18), v_range=(0.76, 0.94), cap_end=True)

    return finalize_budgeted_mesh(name, bm, mat, max_triangles=max_triangles)
