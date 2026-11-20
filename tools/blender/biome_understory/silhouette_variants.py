"""Deterministic botanical silhouette builders for biome understory revisions.

Provides biome-distinct, high-detail 3D BMesh builders for:
  - Savanna: gnarled open-center thorn scrub with flared forks, volumetric 3D foliage pads & sparse side
  - Taiga: wind-sculpted krummholz juniper (offset spire + low runners + 3D conifer plumes + berries) & dwarf willow
  - Wetland: common-rooted sedge tussock & arching multi-cane buttonbush with 3D leaf clusters + cream bloom heads
  - Rainforest: arched-rachis ferns, continuous-midrib heart elephant ear, layered-sheath split-leaf banana, calathea & anthurium
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
from botanical_detail import (
    add_3d_berry_or_bloom_head,
    add_3d_leaf_cluster,
    build_wood_foliage_pbr_material,
    cupped_leaf_with_midrib,
    flared_branch,
    smooth_tube,
)
from understory_common import (
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
# SHARED BUDGET FINALIZER & RAINFOREST MATERIALS
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


def build_rainforest_fern_material(tex_dir, name='Scan forest-fern-02'):
    """Alpha-cutout pinnate rainforest fern frond texture with arched rachis and uneven gaps between leaflets."""
    rng = np.random.default_rng(701)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (12, 16), rng, 3)

    rachis_w = 0.022 * (1.0 - 0.62 * v)
    in_rachis = (np.abs(u - 0.5) <= rachis_w) & (v >= 0.01) & (v <= 0.96)
    rgba[in_rachis, :3] = np.array([0.22, 0.33, 0.14]) * (0.85 + 0.25 * noise[in_rachis, None])
    rgba[in_rachis, 3] = 1.0

    left_v = (0.11, 0.18, 0.28, 0.36, 0.48, 0.56, 0.66, 0.77, 0.85, 0.91)
    right_v = (0.14, 0.24, 0.32, 0.43, 0.52, 0.63, 0.72, 0.81, 0.89)
    for side_sign, v_list in ((-1.0, left_v), (1.0, right_v)):
        for idx, v_base in enumerate(v_list):
            env = math.sin(min(1.0, max(0.0, (v_base - 0.04) / 0.92)) * math.pi * 0.94)
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


def _add_overlapping_basal_sheaths(bm, uv, count, radius_base, height, rng, u_range=(0.02, 0.24), v_range=(0.04, 0.55)):
    """Wrap overlapping curved basal leaf-sheaths around a plant crown so stems emerge naturally."""
    for i in range(count):
        yaw = (i / count) * math.tau + rng.uniform(-0.18, 0.18)
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        origin = out * (radius_base * 0.65) + Vector((0.0, 0.0, -0.02))
        fdir = Vector((out.x * 0.22, out.y * 0.22, 0.97)).normalized()
        cupped_leaf_with_midrib(
            bm, uv, origin, fdir,
            length=height * rng.uniform(0.82, 1.18),
            width=radius_base * 1.55,
            profile='ovate', arch=-0.06, droop=0.14, cup_depth=-0.28,
            roll=0.0, rows=5, cols=4, u_range=u_range, v_range=v_range,
        )


# ---------------------------------------------------------------------------
# 1. SAVANNA: GNARLED OPEN-CENTER THORN SCRUB WITH VOLUMETRIC 3D FOLIAGE PADS
# ---------------------------------------------------------------------------

def build_savanna_thorn_scrub(mat, name='bush-savanna-thorn-01', seed=322, low_budget=False, max_triangles=16050):
    """Savanna thorn-scrub: flared gnarled branches, open center, 3D volumetric outer foliage pads, one sparse side."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Compact gnarled root burl tying the 5 crooked stems into the soil
    smooth_tube(
        bm, uv,
        [Vector((0, 0, -0.04)), Vector((0, 0, 0.02)), Vector((0, 0, 0.08))],
        [0.14, 0.11, 0.07], sides=8, subdiv=2, u_range=(0.02, 0.26), v_range=(0.02, 0.30),
        flute_count=5, flute_depth=0.14, cap_end=True,
    )

    # Vertically staggered forks, open central crown, stem 4 visibly sparser (-X/+Y quadrant)
    stems = (
        # (yaw, r_xy, z_elbow, z_top, fork_len, pad_count)
        (0.16, 0.86, 0.22, 0.76, 0.44, 3),
        (1.18, 0.72, 0.54, 1.24, 0.40, 3),
        (2.48, 0.94, 0.36, 0.94, 0.46, 3),
        (3.62, 0.78, 0.58, 1.12, 0.38, 2),
        (4.92, 0.82, 0.28, 0.58, 0.30, 1),  # visibly sparser side
    )
    leaf_rows, leaf_cols = (3, 2) if low_budget else (4, 2)
    base_cnt = 6 if low_budget else 11
    branch_sides = 6 if low_budget else 7

    for idx, (yaw, r_xy, z_elbow, z_top, fork_len, pad_count) in enumerate(stems):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        crook = rng.uniform(-0.16, 0.16)
        p0 = out * rng.uniform(0.06, 0.10) + Vector((0.0, 0.0, -0.03))
        p_low = out * (r_xy * 0.22) + side * (crook * 0.65) + Vector((0.0, 0.0, z_elbow * 0.52))
        p1 = out * (r_xy * 0.50) + side * crook + Vector((0.0, 0.0, z_elbow))
        p_hi = out * (r_xy * 0.78) + side * (crook * 0.75) + Vector((0.0, 0.0, z_elbow + (z_top - z_elbow) * 0.58))
        p2 = out * r_xy + side * (crook * 0.45 + rng.uniform(-0.10, 0.10)) + Vector((0.0, 0.0, z_top))

        smooth_tube(
            bm, uv, [p0, p_low, p1, p_hi, p2], [0.052, 0.039, 0.028, 0.017, 0.005],
            sides=branch_sides, subdiv=2, u_range=(0.02, 0.26), v_range=(0.04, 0.72),
            flute_count=4, flute_depth=0.12, cap_end=True,
        )

        s_sign = 1.0 if idx % 2 == 0 else -1.0
        # Flared secondary fork emerging tangentially from the elbow
        fork_start = p1.lerp(p_hi, rng.uniform(0.15, 0.45))
        parent_dir = (p_hi - p1).normalized()
        fork_mid = fork_start + out * (fork_len * 0.44) + side * (s_sign * fork_len * 0.48) + Vector((0.0, 0.0, rng.uniform(0.08, 0.18)))
        fork_end = fork_start + out * (fork_len * 0.78) + side * (s_sign * fork_len * 0.84) + Vector((0.0, 0.0, rng.uniform(0.15, 0.30)))
        f_tip, f_dir = flared_branch(
            bm, uv, fork_start, parent_dir, [fork_mid, fork_end],
            r_base=0.022, r_tip=0.004, sides=5, subdiv=2, u_range=(0.02, 0.26), v_range=(0.08, 0.70),
        )

        # Flared thorn spur on opposite side
        spur_start = p_hi.lerp(p2, 0.28)
        spur_mid = spur_start + out * 0.12 + side * (-s_sign * 0.14) + Vector((0.0, 0.0, 0.07))
        spur_end = spur_start + out * 0.24 + side * (-s_sign * 0.24) + Vector((0.0, 0.0, 0.14))
        s_tip, s_dir = flared_branch(
            bm, uv, spur_start, (p2 - p_hi).normalized(), [spur_mid, spur_end],
            r_base=0.014, r_tip=0.003, sides=4, subdiv=2, u_range=(0.02, 0.26), v_range=(0.12, 0.70),
        )

        # Fine twiglets radiating inside the primary tip pad so leaves are physically supported
        tip_dir = (p2 - p_hi).normalized()
        for t_i, t_sgn in enumerate((-1.0, 1.0)):
            tw_base = p_hi.lerp(p2, 0.65 + t_i * 0.12)
            tw_end = tw_base + tip_dir * 0.14 + side * (t_sgn * 0.13) + Vector((0.0, 0.0, 0.05))
            flared_branch(bm, uv, tw_base, tip_dir, [tw_end], r_base=0.009, r_tip=0.0028, sides=4, subdiv=1, u_range=(0.02, 0.26), v_range=(0.14, 0.68))
            add_3d_leaf_cluster(
                bm, uv, tw_end, (tw_end - tw_base).normalized(), rng,
                count=max(4, base_cnt - 2), leaf_len=0.22, leaf_w=0.11,
                profile='ovate', spread=0.72, flat_bias=0.45, cup_depth=0.20,
                rows=leaf_rows, cols=leaf_cols, add_petiole=True,
            )

        # Fluffy primary outer pad directly rooted around p2
        add_3d_leaf_cluster(
            bm, uv, p2, tip_dir, rng,
            count=base_cnt if pad_count > 1 else max(5, base_cnt - 2),
            leaf_len=0.24 if pad_count > 1 else 0.19, leaf_w=0.12 if pad_count > 1 else 0.095,
            profile='ovate', spread=0.78, flat_bias=0.48, cup_depth=0.22,
            rows=leaf_rows, cols=leaf_cols, add_petiole=True,
        )

        if pad_count >= 2:
            # Secondary uneven outer pad on the staggered fork
            add_3d_leaf_cluster(
                bm, uv, f_tip, f_dir, rng, count=base_cnt - 1, leaf_len=0.22, leaf_w=0.11,
                profile='ovate', spread=0.76, flat_bias=0.45, cup_depth=0.20,
                rows=leaf_rows, cols=leaf_cols, add_petiole=True,
            )
            add_3d_leaf_cluster(
                bm, uv, fork_mid.lerp(fork_end, 0.55), f_dir, rng, count=max(4, base_cnt - 3), leaf_len=0.19, leaf_w=0.095,
                profile='ovate', spread=0.70, flat_bias=0.42, cup_depth=0.20,
                rows=leaf_rows, cols=leaf_cols, add_petiole=True,
            )

        if pad_count >= 3:
            # Third staggered upper/outer pad on the thorn spur + occasional golden acacia blossom puff
            add_3d_leaf_cluster(
                bm, uv, s_tip, s_dir, rng, count=max(5, base_cnt - 2), leaf_len=0.20, leaf_w=0.10,
                profile='ovate', spread=0.74, flat_bias=0.46, cup_depth=0.20,
                rows=leaf_rows, cols=leaf_cols, add_petiole=True,
            )
            if not low_budget:
                add_3d_berry_or_bloom_head(bm, uv, s_tip + Vector((0, 0, 0.04)), 0.026, subdivisions=1)

    if low_budget:
        return finalize_budgeted_mesh(name, bm, mat, max_triangles=max_triangles)
    return finish_mesh(name, bm, mat, max_triangles=max_triangles, allow_extra_material=False)


# ---------------------------------------------------------------------------
# 2. TAIGA: WIND-SCULPTED KRUMMHOLZ JUNIPER & VARIED-HEIGHT DWARF WILLOW
# ---------------------------------------------------------------------------

def build_taiga_krummholz_juniper(mat, name='bush-boreal-juniper-01', seed=324, max_triangles=16050):
    """Wind-sculpted boreal krummholz juniper: gnarled boughs, offset spire, low runners, dense 3D conifer plumes & berries."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    root_origin = Vector((-0.12, 0.04, -0.03))
    smooth_tube(
        bm, uv,
        [root_origin + Vector((0, 0, -0.02)), root_origin + Vector((0, 0, 0.04)), root_origin + Vector((0, 0, 0.11))],
        [0.12, 0.095, 0.062], sides=8, subdiv=2, u_range=(0.02, 0.26), v_range=(0.02, 0.32),
        flute_count=5, flute_depth=0.14, cap_end=True,
    )

    # Offset wind-sculpted spire (bough 0), mid leaning shoulders (1, 2), and low creeping runners (3, 4, 5)
    boughs = (
        # (yaw, r_xy, z_elbow, z_tip, r0, plume_scale, cluster_stations)
        (0.22, 0.44, 0.56, 1.24, 0.046, 1.08, 4),  # offset spire
        (1.38, 0.76, 0.36, 0.84, 0.038, 1.00, 4),  # mid shoulder
        (4.55, 0.72, 0.32, 0.74, 0.036, 0.96, 3),  # mid shoulder
        (2.55, 0.90, 0.15, 0.40, 0.032, 0.92, 3),  # low creeping runner
        (3.60, 0.82, 0.12, 0.32, 0.030, 0.88, 3),  # low creeping runner
        (5.58, 0.86, 0.16, 0.44, 0.032, 0.90, 3),  # low creeping runner
    )
    for idx, (yaw, r_xy, z_elbow, z_tip, r0, p_scale, stations) in enumerate(boughs):
        out = Vector((math.cos(yaw) + 0.16, math.sin(yaw), 0.0)).normalized()
        side = Vector((-out.y, out.x, 0.0))
        sway = rng.uniform(-0.12, 0.12)
        p0 = root_origin + out * 0.04
        p_low = root_origin + out * (r_xy * 0.24) + side * (sway * 0.6) + Vector((0.0, 0.0, z_elbow * 0.45))
        p1 = root_origin + out * (r_xy * 0.52) + side * sway + Vector((0.0, 0.0, z_elbow))
        p_hi = root_origin + out * (r_xy * 0.78) + side * (sway * 0.5) + Vector((0.0, 0.0, z_elbow + (z_tip - z_elbow) * 0.58))
        p2 = root_origin + out * r_xy + side * rng.uniform(-0.08, 0.08) + Vector((0.0, 0.0, z_tip))

        smooth_tube(
            bm, uv, [p0, p_low, p1, p_hi, p2], [r0, r0 * 0.74, r0 * 0.52, r0 * 0.30, 0.004],
            sides=7, subdiv=2, u_range=(0.02, 0.26), v_range=(0.04, 0.72),
            flute_count=4, flute_depth=0.12, cap_end=True,
        )

        # Secondary curving lateral boughs with flared crotch joints + dense 3D feathery conifer needle tufts
        s_sign = 1.0 if idx % 2 == 0 else -1.0
        for b_i in range(2):
            sgn = s_sign if b_i == 0 else -s_sign
            attach = p1.lerp(p_hi, 0.15 + b_i * 0.48)
            p_dir = (p_hi - p1).normalized()
            f_mid = attach + out * 0.15 + side * (sgn * 0.18) + Vector((0.0, 0.0, 0.10 if idx < 3 else 0.06))
            f_end = attach + out * 0.28 + side * (sgn * 0.30) + Vector((0.0, 0.0, 0.20 if idx < 3 else 0.11))
            ftip, fdir = flared_branch(
                bm, uv, attach, p_dir, [f_mid, f_end],
                r_base=r0 * 0.44, r_tip=0.0035, sides=5, subdiv=2, u_range=(0.02, 0.26), v_range=(0.08, 0.70),
            )
            # Clothe the lateral branch in lush 3D needle plumes along its mid & tip
            for frac, cnt in ((0.55, 8), (1.0, 10)):
                pt = f_mid.lerp(ftip, frac)
                add_3d_leaf_cluster(
                    bm, uv, pt, (fdir + Vector((0, 0, 0.25))).normalized(), rng,
                    count=cnt, leaf_len=0.22 * p_scale, leaf_w=0.072 * p_scale,
                    profile='lanceolate', spread=0.82, flat_bias=0.22, cup_depth=0.18,
                    rows=3, cols=2, add_petiole=False,
                )
            add_3d_berry_or_bloom_head(bm, uv, ftip + Vector((0, 0, 0.025)), 0.018, subdivisions=1)

        # Clothe the main bough from mid-length to tip in overlapping feathery 3D juniper needle tufts
        spine_chain = [p1, p1.lerp(p_hi, 0.55), p_hi, p_hi.lerp(p2, 0.55), p2]
        for s_idx, pt in enumerate(spine_chain[max(0, 5 - stations):]):
            t_dir = (p2 - p1 + Vector((0, 0, 0.48 if idx == 0 else 0.26))).normalized()
            add_3d_leaf_cluster(
                bm, uv, pt, t_dir, rng,
                count=11 if s_idx == stations - 1 else 9,
                leaf_len=(0.24 - 0.02 * s_idx) * p_scale, leaf_w=0.076 * p_scale,
                profile='lanceolate', spread=0.85, flat_bias=0.18, cup_depth=0.20,
                rows=3, cols=2, add_petiole=False,
            )
            if s_idx >= stations - 2:
                add_3d_berry_or_bloom_head(bm, uv, pt + side * (s_sign * 0.03) + Vector((0, 0, 0.03)), 0.017, subdivisions=1)

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
# 3. WETLAND: COMMON-ROOTED SEDGE TUSSOCK & ARCHING MULTI-CANE BUTTONBUSH
# ---------------------------------------------------------------------------

def build_wetland_sedge_tussock(mat, name='coastal-dune-oats-01', seed=301, max_triangles=16050):
    """Wetland sedge tussock: visible basal root crown, upright inner blades, staggered mid, uneven drooping outer."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    crown_pts = [
        Vector((0.0, 0.0, -0.04)),
        Vector((0.0, 0.0, 0.02)),
        Vector((0.0, 0.0, 0.075)),
        Vector((0.0, 0.0, 0.115)),
    ]
    tube(bm, uv, crown_pts, [0.16, 0.135, 0.105, 0.065], sides=10, u_range=(0.04, 0.42), v_range=(0.04, 0.65), cap_end=True, rough=0.14, rng=rng)
    for r_i in range(5):
        ang = (r_i / 5.0) * math.tau + rng.uniform(-0.25, 0.25)
        out = Vector((math.cos(ang), math.sin(ang), 0.0))
        r0 = out * 0.06 + Vector((0.0, 0.0, 0.055))
        r1 = out * 0.14 + Vector((0.0, 0.0, 0.015))
        r2 = out * 0.21 + Vector((0.0, 0.0, -0.035))
        tube(bm, uv, [r0, r1, r2], [0.026, 0.018, 0.008], sides=5, u_range=(0.04, 0.42), v_range=(0.06, 0.55), cap_end=True)

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
            stagger = 0.78 + 0.44 * ((k * 37 % 11) / 10.0)
            pitch = rng.uniform(pitch_lo, pitch_hi)
            fdir = Vector((math.cos(yaw), math.sin(yaw), pitch)).normalized()
            blen = rng.uniform(len_lo, len_hi) * (0.86 + 0.24 * (k % 3) / 2.0)
            bw = width * rng.uniform(0.80, 1.20)
            shaped_leaf(
                bm, uv, origin, fdir, blen, bw,
                profile='lanceolate', asym=0.09, twist=rng.uniform(-0.28, 0.28),
                arch=arch, droop=droop * stagger, cup_depth=0.22, roll=rng.uniform(-0.24, 0.24),
                u_range=(0.46, 0.98), v_range=(0.02, 0.98),
            )

    for v in bm.verts:
        if math.hypot(v.co.x, v.co.y) > 0.24 and v.co.z < 0.005:
            v.co.z = 0.005

    return finish_mesh(name, bm, mat, max_triangles=max_triangles)


def build_wetland_buttonbush(mat, name='bush-swamp-buttonbush-01', seed=326, max_triangles=16050):
    """Sprawling wetland Buttonbush: slender arching bog canes, flared forks, fluffy 3D leaf clusters & cream bloom heads."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Rooted hummock collar tying the multi-cane bog shrub into wet soil
    smooth_tube(
        bm, uv,
        [Vector((0, 0, -0.04)), Vector((0, 0, 0.03)), Vector((0, 0, 0.09))],
        [0.13, 0.10, 0.065], sides=8, subdiv=2, u_range=(0.02, 0.26), v_range=(0.02, 0.30),
        flute_count=5, flute_depth=0.14, cap_end=True,
    )

    # 6 slender, arching bog canes forming a broken, multi-lobed airy crown
    canes = (
        (0.08, 0.84, 0.38, 0.84),
        (1.12, 0.68, 0.48, 1.12),
        (2.18, 0.88, 0.32, 0.70),
        (3.36, 0.64, 0.44, 0.98),
        (4.42, 0.80, 0.34, 0.76),
        (5.50, 0.58, 0.52, 1.16),
    )
    for idx, (yaw, r_xy, z_f, z_t) in enumerate(canes):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        sway = rng.uniform(-0.12, 0.12)
        p0 = out * 0.06 + Vector((0.0, 0.0, -0.03))
        p_low = out * (r_xy * 0.24) + side * (sway * 0.5) + Vector((0.0, 0.0, z_f * 0.50))
        p1 = out * (r_xy * 0.50) + side * sway + Vector((0.0, 0.0, z_f))
        p_hi = out * (r_xy * 0.78) + side * (sway * 0.6) + Vector((0.0, 0.0, z_f + (z_t - z_f) * 0.60))
        p2 = out * r_xy + side * rng.uniform(-0.08, 0.08) + Vector((0.0, 0.0, z_t))

        smooth_tube(
            bm, uv, [p0, p_low, p1, p_hi, p2], [0.034, 0.025, 0.018, 0.011, 0.004],
            sides=7, subdiv=2, u_range=(0.02, 0.26), v_range=(0.04, 0.72),
            flute_count=4, flute_depth=0.10, cap_end=True,
        )

        s_sign = -1.0 if idx % 2 else 1.0
        for b_i in range(2):
            sgn = s_sign if b_i == 0 else -s_sign
            attach = p1.lerp(p_hi, 0.12 + b_i * 0.52)
            p_dir = (p_hi - p1).normalized()
            f_mid = attach + out * 0.14 + side * (sgn * 0.18) + Vector((0.0, 0.0, 0.08))
            f_end = attach + out * 0.28 + side * (sgn * 0.30) + Vector((0.0, 0.0, 0.16))
            ftip, fdir = flared_branch(
                bm, uv, attach, p_dir, [f_mid, f_end],
                r_base=0.015, r_tip=0.0032, sides=5, subdiv=2, u_range=(0.02, 0.26), v_range=(0.08, 0.70),
            )
            add_3d_leaf_cluster(
                bm, uv, f_mid.lerp(ftip, 0.52), fdir, rng, count=7, leaf_len=0.22, leaf_w=0.10,
                profile='ovate', spread=0.76, flat_bias=0.35, cup_depth=0.20, rows=3, cols=2, add_petiole=True,
            )
            add_3d_leaf_cluster(
                bm, uv, ftip, fdir, rng, count=9, leaf_len=0.24, leaf_w=0.11,
                profile='ovate', spread=0.80, flat_bias=0.32, cup_depth=0.22, rows=3, cols=2, add_petiole=True,
            )
            # Signature spherical cream-white buttonbush flower head on thin pedicel
            bloom_pt = ftip + fdir * 0.06 + Vector((0, 0, 0.07))
            smooth_tube(bm, uv, [ftip, bloom_pt], [0.003, 0.002], sides=4, subdiv=1, u_range=(0.02, 0.24), v_range=(0.10, 0.65), cap_end=False)
            add_3d_berry_or_bloom_head(bm, uv, bloom_pt, 0.032, subdivisions=1)

        # Lush terminal cluster at cane tip
        tip_dir = (p2 - p_hi + Vector((0, 0, 0.22))).normalized()
        add_3d_leaf_cluster(
            bm, uv, p_hi.lerp(p2, 0.55), tip_dir, rng, count=7, leaf_len=0.22, leaf_w=0.10,
            profile='ovate', spread=0.75, flat_bias=0.32, cup_depth=0.20, rows=3, cols=2, add_petiole=True,
        )
        add_3d_leaf_cluster(
            bm, uv, p2, tip_dir, rng, count=10, leaf_len=0.25, leaf_w=0.115,
            profile='ovate', spread=0.82, flat_bias=0.30, cup_depth=0.22, rows=3, cols=2, add_petiole=True,
        )
        bloom_top = p2 + tip_dir * 0.07 + Vector((0, 0, 0.06))
        smooth_tube(bm, uv, [p2, bloom_top], [0.003, 0.002], sides=4, subdiv=1, u_range=(0.02, 0.24), v_range=(0.10, 0.65), cap_end=False)
        add_3d_berry_or_bloom_head(bm, uv, bloom_top, 0.034, subdivisions=1)

    return finish_mesh(name, bm, mat, max_triangles=max_triangles, allow_extra_material=False)


# ---------------------------------------------------------------------------
# 4. RAINFOREST: ARCHED-RACHIS FERNS, CONTINUOUS-MIDRIB BROADLEAVES & BANANA
# ---------------------------------------------------------------------------

def build_rainforest_layered_fern(mat, name='forest-fern-02', seed=701, max_triangles=3950):
    """3-tier rainforest fern with continuous arched stipe->rachis stems, pinnate fronds, and 3D spiraled croziers."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    smooth_tube(
        bm, uv,
        [Vector((0, 0, -0.02)), Vector((0, 0, 0.02)), Vector((0, 0, 0.065))],
        [0.095, 0.078, 0.048], sides=10, subdiv=2, u_range=(0.47, 0.53), v_range=(0.02, 0.22),
        flute_count=5, flute_depth=0.10, cap_end=True,
    )

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
            stipe_len = fl * 0.26
            stipe_mid = base + out * (stipe_len * 0.44) + Vector((0.0, 0.0, stipe_len * (0.72 + 0.14 * tier_idx)))
            stipe_tip = base + out * (stipe_len * 0.96) + Vector((0.0, 0.0, stipe_len * (1.08 + 0.22 * tier_idx)))
            blade_dir = (stipe_tip - stipe_mid).normalized()
            # Continuous stipe -> 3D rachis along the exact frond arch curve!
            cupped_leaf_with_midrib(
                bm, uv, stipe_tip, blade_dir, fl * 0.78, fw,
                profile='ovate', arch=arch, droop=droop, cup_depth=0.16,
                roll=rng.uniform(-0.22, 0.22), twist=rng.uniform(-0.18, 0.18),
                wave_amp=0.016, wave_freq=2.6, rows=8, cols=4,
                u_range=(0.02, 0.98), v_range=(0.02, 0.98), split_phase=k * 1.1,
                petiole_pts=[base, stipe_mid, stipe_tip], petiole_radii=[0.014, 0.0085, 0.0052],
                petiole_sides=4, petiole_u=(0.48, 0.52), petiole_v=(0.02, 0.34), midrib_reach=0.42,
                flute_count=0, flute_depth=0.0,
            )

    # 3 spiraled 3D fiddlehead croziers unfurling at the crown center
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
            pts.append(coil_center - out * (math.cos(theta) * coil_r) + Vector((0, 0, math.sin(theta) * coil_r)))
            rads.append(max(0.003, 0.0085 * (0.86 ** s_idx)))
        smooth_tube(bm, uv, pts, rads, sides=5, subdiv=1, u_range=(0.47, 0.53), v_range=(0.04, 0.60), cap_end=True)

    for v in bm.verts:
        if math.hypot(v.co.x, v.co.y) > 0.15 and v.co.z < 0.005:
            v.co.z = 0.005

    return finalize_budgeted_mesh(name, bm, mat, max_triangles=max_triangles)


def build_rainforest_cupped_broadleaf(mat, name, seed=710, style='elephant_ear', max_triangles=5400):
    """High-detail rainforest broadleaves with layered basal sheaths and continuous petiole->3D-midrib joints."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    if style == 'elephant_ear':
        smooth_tube(
            bm, uv,
            [Vector((0, 0, -0.025)), Vector((0, 0, 0.04)), Vector((0, 0, 0.11))],
            [0.115, 0.095, 0.068], sides=10, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.35),
            flute_count=6, flute_depth=0.10, cap_end=True,
        )
        _add_overlapping_basal_sheaths(bm, uv, 6, 0.095, 0.26, rng)

        # 7 canted heart-shaped leaves with continuous fleshy curved petioles flowing into 3D underside midribs
        leaves = (
            (0.25, 0.28, 0.98, 0.80, 0.66, -0.18, 0.40),
            (1.32, 0.36, 0.64, 0.84, 0.70, -0.26, -0.46),
            (2.38, 0.24, 1.10, 0.74, 0.60, -0.10, 0.36),
            (3.45, 0.38, 0.54, 0.78, 0.66, -0.30, -0.42),
            (4.48, 0.30, 0.86, 0.76, 0.64, -0.20, 0.48),
            (5.32, 0.22, 0.74, 0.62, 0.50, 0.06, -0.32),
            (5.98, 0.14, 0.56, 0.48, 0.40, 0.22, 0.24),
        )
        for idx, (yaw, sr, sh, bl, bw, pitch, roll) in enumerate(leaves):
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            p0 = out * 0.04 + Vector((0, 0, -0.015))
            p1 = out * (sr * 0.22) + Vector((0, 0, sh * 0.36))
            p2 = out * (sr * 0.58) + Vector((0, 0, sh * 0.76))
            p3 = out * sr + Vector((0, 0, sh))
            fdir = Vector((out.x, out.y, pitch)).normalized()
            cupped_leaf_with_midrib(
                bm, uv, p3, fdir, bl, bw,
                profile='cordate_ear', arch=0.14, droop=0.23, cup_depth=0.26, roll=roll,
                twist=rng.uniform(-0.10, 0.10), wave_amp=0.016, wave_freq=2.5, vein_depth=0.012,
                rows=18, cols=10, u_range=(0.28, 0.98), v_range=(0.04, 0.96), split_phase=idx * 1.2,
                petiole_pts=[p0, p1, p2, p3], petiole_radii=[0.044, 0.032, 0.023, 0.016],
                petiole_sides=8, petiole_u=(0.02, 0.24), petiole_v=(0.04, 0.94), midrib_reach=0.68,
            )
    elif style == 'banana':
        # Layered overlapping leaf-sheath pseudostem (no flat-cut cylinder top!)
        smooth_tube(
            bm, uv,
            [
                Vector((0.0, 0.0, -0.025)),
                Vector((0.01, -0.005, 0.24)),
                Vector((0.02, -0.01, 0.52)),
                Vector((0.032, -0.004, 0.78)),
                Vector((0.04, 0.0, 1.02)),
            ],
            [0.145, 0.120, 0.102, 0.084, 0.056],
            sides=14, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.94),
            flute_count=6, flute_depth=0.06, cap_end=True,
        )
        # Overlapping curved outer sheath wraps hugging the pseudostem from base up to crown
        for sh_i in range(6):
            syaw = (sh_i / 6.0) * math.tau + 0.35
            sout = Vector((math.cos(syaw), math.sin(syaw), 0.0))
            sh_z = 0.02 + (sh_i % 3) * 0.22
            sh_origin = sout * 0.085 + Vector((0.02, 0.0, sh_z))
            sh_dir = Vector((sout.x * 0.16, sout.y * 0.16, 0.985)).normalized()
            cupped_leaf_with_midrib(
                bm, uv, sh_origin, sh_dir, length=0.58, width=0.22,
                profile='ovate', arch=-0.04, droop=0.10, cup_depth=-0.30,
                rows=6, cols=4, u_range=(0.02, 0.24), v_range=(0.06, 0.75),
            )

        # Smooth spiraled upright rolled cigar/spear leaf emerging naturally from the crown (1.88 m tall)
        spear_pts = [
            Vector((0.038, 0.0, 0.86)),
            Vector((0.046, 0.006, 1.18)),
            Vector((0.058, 0.014, 1.48)),
            Vector((0.074, 0.022, 1.72)),
            Vector((0.092, 0.030, 1.88)),
        ]
        smooth_tube(
            bm, uv, spear_pts, [0.052, 0.042, 0.030, 0.017, 0.004],
            sides=10, subdiv=2, u_range=(0.40, 0.68), v_range=(0.06, 0.96),
            flute_count=1, flute_depth=0.16, cap_end=True,
        )

        # 7 buttery-smooth arching wind-split mature + young banana fronds with continuous 3D midrib spines
        leaves = (
            # (yaw, z_att, pet_l, blade_l, blade_w, pitch, roll, split_phase)
            (0.18, 0.68, 0.36, 1.62, 0.58, 0.34, 0.20, 0.4),
            (1.12, 0.86, 0.30, 1.44, 0.52, 0.58, -0.16, 1.4),
            (2.08, 0.58, 0.40, 1.68, 0.60, 0.14, 0.24, 2.5),
            (3.04, 0.78, 0.34, 1.54, 0.55, 0.42, -0.20, 3.6),
            (4.02, 0.64, 0.38, 1.60, 0.57, 0.22, 0.18, 4.7),
            (4.96, 0.84, 0.32, 1.48, 0.53, 0.50, -0.18, 5.6),
            (5.78, 0.94, 0.24, 1.18, 0.44, 0.76, 0.12, 6.4),  # young upright emerging frond
        )
        for yaw, z_att, pet_l, bl, bw, pitch, roll, sp in leaves:
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            # Start petiole embedded inside the pseudostem sheath and sweep upward tangentially before arcing out
            p0 = out * 0.03 + Vector((0.025, 0.0, z_att - 0.14))
            p1 = out * (0.06 + pet_l * 0.28) + Vector((0.03, 0.0, z_att + pet_l * 0.36))
            p2 = out * (0.06 + pet_l * 0.68) + Vector((0.03, 0.0, z_att + pet_l * 0.74))
            p3 = out * (0.06 + pet_l) + Vector((0.03, 0.0, z_att + pet_l * 0.96))
            fdir = Vector((out.x, out.y, pitch)).normalized()
            cupped_leaf_with_midrib(
                bm, uv, p3, fdir, bl, bw,
                profile='banana_split', arch=0.24, droop=0.44, cup_depth=0.22, roll=roll,
                twist=0.07 * math.sin(sp), wave_amp=0.012, wave_freq=2.4, vein_depth=0.010,
                rows=24, cols=10, u_range=(0.28, 0.98), v_range=(0.04, 0.96), split_phase=sp,
                petiole_pts=[p0, p1, p2, p3], petiole_radii=[0.044, 0.032, 0.023, 0.017],
                petiole_sides=8, petiole_u=(0.02, 0.24), petiole_v=(0.06, 0.92), midrib_reach=0.80,
            )
    elif style == 'calathea':
        smooth_tube(
            bm, uv, [Vector((0, 0, -0.02)), Vector((0, 0, 0.05))], [0.072, 0.044],
            sides=8, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.30), cap_end=True,
        )
        _add_overlapping_basal_sheaths(bm, uv, 6, 0.062, 0.18, rng)
        tiers = (
            (5, 0.18, 0.28, 0.38, 0.26, 0.16, 0.22),
            (4, 0.12, 0.44, 0.34, 0.24, 0.34, 0.26),
            (3, 0.07, 0.58, 0.28, 0.20, 0.58, 0.28),
        )
        for t_i, (cnt, sr, sh, bl, bw, pitch, cup) in enumerate(tiers):
            for k in range(cnt):
                yaw = ((k + t_i * 0.42) / cnt) * math.tau + rng.uniform(-0.20, 0.20)
                out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
                p0 = out * 0.025 + Vector((0, 0, -0.01))
                p1 = out * (sr * 0.28) + Vector((0, 0, sh * 0.42))
                p2 = out * (sr * 0.68) + Vector((0, 0, sh * 0.78))
                p3 = out * sr + Vector((0, 0, sh + rng.uniform(-0.04, 0.05)))
                fdir = Vector((out.x, out.y, pitch + rng.uniform(-0.08, 0.10))).normalized()
                cupped_leaf_with_midrib(
                    bm, uv, p3, fdir, bl * rng.uniform(0.88, 1.12), bw * rng.uniform(0.90, 1.12),
                    profile='ovate', arch=0.14, droop=0.22, cup_depth=cup, roll=rng.uniform(-0.26, 0.26),
                    twist=rng.uniform(-0.14, 0.14), wave_amp=0.016, wave_freq=2.5, vein_depth=0.010,
                    rows=10, cols=6, u_range=(0.28, 0.98), v_range=(0.04, 0.96), split_phase=k * 1.3 + t_i,
                    petiole_pts=[p0, p1, p2, p3], petiole_radii=[0.018, 0.013, 0.010, 0.008],
                    petiole_sides=5, petiole_u=(0.02, 0.24), petiole_v=(0.04, 0.94), midrib_reach=0.62,
                )
    else:
        smooth_tube(
            bm, uv, [Vector((0, 0, -0.02)), Vector((0, 0, 0.055))], [0.076, 0.048],
            sides=8, subdiv=2, u_range=(0.02, 0.24), v_range=(0.04, 0.30), cap_end=True,
        )
        _add_overlapping_basal_sheaths(bm, uv, 6, 0.068, 0.20, rng)
        tiers = (
            (5, 0.26, 0.34, 0.54, 0.38, 0.12, 0.28),
            (3, 0.18, 0.52, 0.46, 0.34, 0.30, 0.30),
            (2, 0.10, 0.66, 0.38, 0.28, 0.52, 0.26),
        )
        for t_i, (cnt, sr, sh, bl, bw, pitch, cup) in enumerate(tiers):
            for k in range(cnt):
                yaw = ((k + t_i * 0.38) / cnt) * math.tau + rng.uniform(-0.22, 0.22)
                out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
                p0 = out * 0.025 + Vector((0, 0, -0.01))
                p1 = out * (sr * 0.26) + Vector((0, 0, sh * 0.40))
                p2 = out * (sr * 0.66) + Vector((0, 0, sh * 0.76))
                p3 = out * sr + Vector((0, 0, sh + rng.uniform(-0.04, 0.06)))
                fdir = Vector((out.x, out.y, pitch + rng.uniform(-0.06, 0.08))).normalized()
                cupped_leaf_with_midrib(
                    bm, uv, p3, fdir, bl * rng.uniform(0.90, 1.12), bw * rng.uniform(0.90, 1.10),
                    profile='cordate', arch=0.16, droop=0.28, cup_depth=cup, roll=rng.uniform(-0.24, 0.24),
                    twist=rng.uniform(-0.12, 0.12), wave_amp=0.014, wave_freq=2.5, vein_depth=0.010,
                    rows=10, cols=6, u_range=(0.28, 0.98), v_range=(0.04, 0.96), split_phase=k * 1.1,
                    petiole_pts=[p0, p1, p2, p3], petiole_radii=[0.020, 0.014, 0.011, 0.0085],
                    petiole_sides=5, petiole_u=(0.02, 0.24), petiole_v=(0.04, 0.70), midrib_reach=0.64,
                )
        for s_i, yaw in enumerate((0.8, 3.9)):
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            p0 = out * 0.025 + Vector((0, 0, 0.0))
            p1 = out * 0.08 + Vector((0, 0, 0.32))
            p2 = out * 0.14 + Vector((0, 0, 0.58))
            p3 = out * 0.18 + Vector((0, 0, 0.74 - s_i * 0.08))
            spathe_dir = Vector((out.x, out.y, 0.35)).normalized()
            cupped_leaf_with_midrib(
                bm, uv, p3, spathe_dir, 0.17, 0.15,
                profile='cordate', arch=0.10, droop=0.06, cup_depth=0.34, roll=0.0,
                rows=8, cols=6, u_range=(0.04, 0.22), v_range=(0.74, 0.96),
                petiole_pts=[p0, p1, p2, p3], petiole_radii=[0.011, 0.0085, 0.007, 0.0055],
                petiole_sides=6, petiole_u=(0.02, 0.24), petiole_v=(0.04, 0.70), midrib_reach=0.45,
            )
            spadix_pts = [
                p3 + spathe_dir * 0.02 + Vector((0, 0, 0.008)),
                p3 + spathe_dir * 0.055 + Vector((0, 0, 0.055)),
                p3 + spathe_dir * 0.082 + Vector((0, 0, 0.115)),
            ]
            smooth_tube(bm, uv, spadix_pts, [0.011, 0.010, 0.006], sides=7, subdiv=2, u_range=(0.06, 0.18), v_range=(0.76, 0.94), cap_end=True)

    return finalize_budgeted_mesh(name, bm, mat, max_triangles=max_triangles)
