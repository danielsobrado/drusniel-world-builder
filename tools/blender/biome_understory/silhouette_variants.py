"""Deterministic botanical silhouette builders for biome understory revisions.

Provides biome-distinct, budget-respecting BMesh builders for:
  - Savanna: uneven-branching open-center thorn scrub (Vachellia/Acacia)
  - Taiga: tiered asymmetric krummholz juniper & varied-height dwarf willow
  - Wetland: common-root-base sedge tussocks with multi-height arching/drooping blades
  - Rainforest: 3-tier layered-frond ferns & cupped overlapping broadleaf plants with visible stems
"""
import math
import os
import random

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from aaa_geometry import fern_crosier_spiral, shaped_leaf
from aaa_natural_forms import organic_trunk_loft
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


def _low_poly_tube(bm, uv, points, radii, sides=4, u_range=(0.0, 0.25), v_range=(0.05, 0.95)):
    """Compact non-subdivided tapered tube for low-budget stems and petioles."""
    rings = []
    d0 = (points[1] - points[0]).normalized()
    normal = d0.orthogonal().normalized()
    total = sum((points[i] - points[i - 1]).length for i in range(1, len(points)))
    acc = 0.0
    for i, p in enumerate(points):
        d = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        normal = (normal - d * normal.dot(d)).normalized()
        binormal = d.cross(normal)
        if i > 0:
            acc += (points[i] - points[i - 1]).length
        vc = v_range[0] + (v_range[1] - v_range[0]) * (acc / max(total, 1e-6))
        ring = []
        for s in range(sides):
            ang = s / sides * math.tau
            offset = (normal * math.cos(ang) + binormal * math.sin(ang)) * radii[i]
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


def _low_poly_cupped_leaf(
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
    rows=3,
    cols=2,
    u_range=(0.30, 0.98),
    v_range=(0.04, 0.96),
):
    """Budget-efficient 3D cupped leaf blade (rows*cols*2 tris) with midrib furrow and overlap curvature."""
    f = forward_dir.normalized() if forward_dir.length_squared > 1e-8 else Vector((1.0, 0.0, 0.0))
    ref = Vector((0.0, 0.0, 1.0)) if abs(f.z) < 0.92 else Vector((1.0, 0.0, 0.0))
    r0 = f.cross(ref).normalized()
    u0_vec = r0.cross(f).normalized()
    side = (r0 * math.cos(roll) + u0_vec * math.sin(roll)).normalized()
    up_v = (u0_vec * math.cos(roll) - r0 * math.sin(roll)).normalized()

    u0, u1 = u_range
    v0, v1 = v_range
    grid = []
    for r in range(rows + 1):
        t = r / rows
        if profile == 'cordate':
            wm = max(0.08, math.sin((t ** 0.50) * math.pi) * (1.18 - 0.34 * t))
        elif profile == 'paddle':
            wm = max(0.10, (0.28 + 0.72 * math.sin((t ** 0.68) * math.pi)))
        else:
            wm = max(0.08, math.sin((t ** 0.60) * math.pi))
        curve = length * (arch * math.sin(t * math.pi * 0.85) - droop * (t ** 2.0))
        spine = origin + f * (length * t) + up_v * curve
        hw = 0.5 * width * wm
        vc = v0 + (v1 - v0) * t
        row = []
        for c in range(cols + 1):
            sc = (c / cols) * 2.0 - 1.0
            cup = width * cup_depth * (abs(sc) ** 1.15) * math.sin(max(0.12, t) * math.pi * 0.92)
            pt = spine + side * (sc * hw) + up_v * cup
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
    """Alpha-cutout pinnate rainforest fern frond texture with rachis and pinnae."""
    rng = np.random.default_rng(701)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (12, 16), rng, 3)

    # Central tapered rachis
    rachis_w = 0.024 * (1.0 - 0.65 * v)
    in_rachis = (np.abs(u - 0.5) <= rachis_w) & (v >= 0.01) & (v <= 0.96)
    rgba[in_rachis, :3] = np.array([0.22, 0.34, 0.14]) * (0.85 + 0.25 * noise[in_rachis, None])
    rgba[in_rachis, 3] = 1.0

    # 13 pairs of angled pinnate leaflets tapering smoothly to the frond tip
    du = np.abs(u - 0.5)
    for k in range(13):
        v_base = 0.10 + k * 0.064
        env = math.sin(min(1.0, max(0.0, (k + 1) / 14.0)) * math.pi * 0.92)
        p_len = 0.44 * env
        tilt = 0.055 * (du / max(p_len, 1e-4))
        dv = np.abs(v - (v_base + tilt))
        p_w = 0.026 * (1.0 - 0.55 * np.clip(du / max(p_len, 1e-4), 0.0, 1.0))
        serr = 0.85 + 0.15 * np.sin(du * 90.0)
        in_p = (du >= 0.014) & (du <= p_len) & (dv <= p_w * serr)
        shade = (0.72 + 0.36 * v + 0.18 * noise) * (0.85 + 0.20 * (du / max(p_len, 1e-4)))
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
    # Stem strip u < 0.26
    in_stem = u < 0.26
    rib = 0.86 + 0.18 * np.cos(u * 90.0)
    stem_col = np.array(stem_rgb) * (0.76 + 0.34 * noise[..., None]) * rib[..., None]
    rgba[in_stem, :3] = np.clip(stem_col[in_stem], 0.0, 1.0)

    # Broadleaf lamina u >= 0.26
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
        # Small glossy spathe accent patch in top-left of stem strip (u in [0.04, 0.22], v in [0.74, 0.96])
        in_acc = (u >= 0.04) & (u <= 0.22) & (v >= 0.74) & (v <= 0.96)
        rgba[in_acc, :3] = np.clip(np.array(accent_rgb) * (0.85 + 0.25 * noise[in_acc, None]), 0.0, 1.0)

    height = 0.5 * noise + 0.35 * midrib + 0.15 * lat_veins
    alb = save_image(f'{filename}_alb', rgba, os.path.join(tex_dir, f'{filename}-alb.png'))
    nrm = save_image(f'{filename}_nrm', height_to_normal(height, 2.2), os.path.join(tex_dir, f'{filename}-nrm.png'), non_color=True)
    return make_material(name, alb, alpha=False, normal_image=nrm, roughness=0.48, subsurface=0.22)


# ---------------------------------------------------------------------------
# 1. SAVANNA: UNEVEN-BRANCHING OPEN-CENTER THORN SCRUB
# ---------------------------------------------------------------------------

def build_savanna_thorn_scrub(mat, name='bush-savanna-thorn-01', seed=322, low_budget=False, max_triangles=16050):
    """Asymmetric multi-stem savanna thorn-scrub with uneven branching and an open airy center."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Uneven radial angles with deliberate open gaps and staggered heights (0.58 m to 1.26 m)
    # Branches lean outward from a low root crown, leaving the central core open so sky/grass reads through.
    stems = (
        (0.18, 0.88, 0.34, 0.86, 0.42),
        (1.15, 0.68, 0.50, 1.18, 0.36),
        (2.45, 0.96, 0.28, 0.66, 0.46),
        (3.52, 0.76, 0.44, 1.04, 0.38),
        (4.85, 0.84, 0.24, 0.58, 0.34),
    )
    for idx, (yaw, r_xy, z_elbow, z_top, fork_len) in enumerate(stems):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        crook = rng.uniform(-0.18, 0.18)
        p0 = out * rng.uniform(0.08, 0.15) + Vector((0.0, 0.0, -0.02))
        p1 = out * (r_xy * 0.48) + side * crook + Vector((0.0, 0.0, z_elbow))
        p2 = out * r_xy + side * (crook * 0.6 + rng.uniform(-0.14, 0.14)) + Vector((0.0, 0.0, z_top))

        if low_budget:
            _low_poly_tube(bm, uv, [p0, p1, p2], [0.048, 0.028, 0.012], sides=5, u_range=(0.02, 0.26), v_range=(0.04, 0.94))
        else:
            organic_trunk_loft(bm, uv, [p0, p1, p2], [0.056, 0.032, 0.014], rng, sides=6, bark_ridges=5, ridge_depth=0.14, cap_end=False, u_range=(0.02, 0.27), v_range=(0.04, 0.94))

        # Irregular outward secondary fork (never crossing back into the open center)
        s_sign = 1.0 if idx % 2 == 0 else -1.0
        fork_start = p1.lerp(p2, rng.uniform(0.15, 0.38))
        fork_end = fork_start + out * (fork_len * 0.78) + side * (s_sign * fork_len * 0.82) + Vector((0.0, 0.0, rng.uniform(0.14, 0.34)))
        if low_budget:
            _low_poly_tube(bm, uv, [fork_start, fork_end], [0.022, 0.009], sides=4, u_range=(0.02, 0.26), v_range=(0.12, 0.90))
        else:
            tube(bm, uv, [fork_start, fork_end], [0.024, 0.011], sides=4, u_range=(0.02, 0.27), v_range=(0.10, 0.90), cap_end=False)

        # Short bare thorn spur for broken dry-scrub silhouette
        spur_start = p1.lerp(p2, 0.62)
        spur_end = spur_start + out * 0.20 + side * (-s_sign * 0.22) + Vector((0.0, 0.0, 0.12))
        if low_budget:
            _low_poly_tube(bm, uv, [spur_start, spur_end], [0.014, 0.005], sides=3, u_range=(0.02, 0.26), v_range=(0.15, 0.85))
        else:
            tube(bm, uv, [spur_start, spur_end], [0.016, 0.006], sides=3, u_range=(0.02, 0.27), v_range=(0.15, 0.85), cap_end=False)

        # Flat-topped umbrella-like foliage pads ONLY at outer branch tips (leaving center & lower limbs open)
        tip_dir = Vector((p2.x - p1.x, p2.y - p1.y, 0.10)).normalized()
        f_dir = Vector((fork_end.x - fork_start.x, fork_end.y - fork_start.y, 0.08)).normalized()
        pad_len = rng.uniform(0.56, 0.76)
        pad_w = rng.uniform(0.62, 0.82)
        leaf_spray_fan(bm, uv, p2 - tip_dir * 0.10, tip_dir, pad_len, pad_w, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=rng.uniform(-0.22, 0.22), arch=0.04, cup=0.14, tip_scale=0.45)
        leaf_spray_fan(bm, uv, p2 - tip_dir * 0.04 + Vector((0, 0, 0.06)), (tip_dir * 0.75 + side * (s_sign * 0.45) + Vector((0, 0, 0.16))).normalized(), pad_len * 0.76, pad_w * 0.78, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=s_sign * 0.42, arch=0.05, cup=0.16, tip_scale=0.40)
        leaf_spray_fan(bm, uv, fork_end - f_dir * 0.08, f_dir, pad_len * 0.78, pad_w * 0.80, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=-s_sign * 0.30, arch=0.03, cup=0.14, tip_scale=0.42)

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
    # Strongly varied heights: 1 wind-bent dominant spire (1.22 m), 2 mid-tier boughs (0.72–0.88 m), 3 low basal runners (0.28–0.46 m)
    boughs = (
        (0.25, 0.42, 0.56, 1.22, 0.064, 0.64),   # tall asymmetric leader
        (1.38, 0.76, 0.38, 0.86, 0.054, 0.58),   # mid-upper bough
        (4.55, 0.72, 0.34, 0.74, 0.050, 0.56),   # mid-side bough
        (2.55, 0.88, 0.16, 0.44, 0.046, 0.52),   # low prostrate runner
        (3.60, 0.80, 0.14, 0.34, 0.044, 0.48),   # low creeping runner
        (5.58, 0.86, 0.18, 0.48, 0.046, 0.50),   # outer wind-bent runner
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

        # Upturned conifer needle plumes tiered along leader & outer elbows
        tip_dir = Vector((out.x * 0.65, out.y * 0.65, 0.72 if idx == 0 else 0.52)).normalized()
        leaf_spray_fan(bm, uv, p2 - tip_dir * 0.14, tip_dir, spray_s, spray_s * 1.04, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=s_sign * 0.26, arch=0.18, cup=0.20, tip_scale=0.34)
        leaf_spray_fan(bm, uv, p2 - tip_dir * 0.08, (tip_dir * 0.8 + side * (s_sign * 0.45)).normalized(), spray_s * 0.84, spray_s * 0.88, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=-s_sign * 0.62, arch=0.14, cup=0.18, tip_scale=0.32)

        f_dir = Vector((fork.x - p1.x, fork.y - p1.y, 0.38)).normalized()
        leaf_spray_fan(bm, uv, fork - f_dir * 0.10, f_dir, spray_s * 0.86, spray_s * 0.90, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=-s_sign * 0.30, arch=0.16, cup=0.18, tip_scale=0.34)
        if idx < 3:
            # Extra tiered lateral tuft on upper boughs for layered conifer silhouette
            mid_pt = p1.lerp(p2, 0.45)
            m_dir = (out * 0.75 - side * (s_sign * 0.55) + Vector((0, 0, 0.34))).normalized()
            leaf_spray_fan(bm, uv, mid_pt, m_dir, spray_s * 0.78, spray_s * 0.82, u_range=(0.30, 1.0), v_range=(0.02, 0.98), roll=s_sign * 0.48, arch=0.15, cup=0.18, tip_scale=0.36)

    return finish_mesh(name, bm, mat, max_triangles=max_triangles, allow_extra_material=False)


def build_taiga_dwarf_willow_shrub(mat, name='tundra-dwarf-willow-01', seed=219, max_triangles=16050):
    """Varied-height boreal dwarf willow/birch shrub (0.20–0.74 m) that reads clearly over moss and duff."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Break up the flat ground-hugging cross with staggered upright + leaning woody shoots
    shoots = (
        (0.22, 0.52, 0.28, 0.70, 0.036),   # tall wind-bent central-east shoot
        (1.48, 0.66, 0.22, 0.54, 0.032),   # mid-height arching shoot
        (2.65, 0.74, 0.14, 0.36, 0.028),   # low spreading bough
        (3.82, 0.58, 0.26, 0.64, 0.034),   # upright counter-shoot
        (4.95, 0.78, 0.12, 0.28, 0.028),   # low creeping basal bough
        (5.72, 0.44, 0.20, 0.48, 0.026),   # inner mid shoot
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

        # Layered cupped foliage fans pitched upward so individual shrubs catch light cleanly over moss
        f_tip = (p2 - p1 + Vector((0, 0, 0.22))).normalized()
        f_twig = (twig - p1 + Vector((0, 0, 0.18))).normalized()
        leaf_spray_fan(bm, uv, p2 - f_tip * 0.08, f_tip, 0.38, 0.42, u_range=(0.0, 1.0), v_range=(0.0, 0.98), roll=s_sign * 0.28, arch=0.12, cup=0.22, tip_scale=0.38)
        leaf_spray_fan(bm, uv, p2 - f_tip * 0.05, (f_tip * 0.75 - side * (s_sign * 0.52)).normalized(), 0.32, 0.36, u_range=(0.0, 1.0), v_range=(0.0, 0.98), roll=-s_sign * 0.55, arch=0.10, cup=0.20, tip_scale=0.36)
        leaf_spray_fan(bm, uv, twig - f_twig * 0.06, f_twig, 0.34, 0.38, u_range=(0.0, 1.0), v_range=(0.0, 0.98), roll=-s_sign * 0.35, arch=0.10, cup=0.20, tip_scale=0.38)

    return finish_mesh(name, bm, mat, max_triangles=max_triangles)


# ---------------------------------------------------------------------------
# 3. WETLAND: COMMON-ROOTED SEDGE TUSSOCK WITH MULTI-HEIGHT ARCHING/DROOPING LEAVES
# ---------------------------------------------------------------------------

def build_wetland_sedge_tussock(mat, name='coastal-dune-oats-01', seed=301, max_triangles=16050):
    """Wetland sedge tussock with a common rooted basal crown and 3D blades arching/drooping at 3 heights."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Compact rooted sedge crown / basal culm mound at (0, 0, -0.02..0.09)
    crown_pts = [
        Vector((0.0, 0.0, -0.04)),
        Vector((0.0, 0.0, 0.03)),
        Vector((0.0, 0.0, 0.09)),
    ]
    tube(bm, uv, crown_pts, [0.18, 0.14, 0.09], sides=8, u_range=(0.04, 0.42), v_range=(0.05, 0.60), cap_end=True, rough=0.12, rng=rng)

    # Small weathered bog-root accent tucked beside the common sedge base
    drift = [Vector((-0.34, -0.10, -0.03)), Vector((-0.14, -0.05, 0.06)), Vector((0.12, 0.02, 0.05)), Vector((0.36, 0.10, -0.01))]
    organic_trunk_loft(bm, uv, drift, [0.06, 0.08, 0.065, 0.035], rng, sides=6, bark_ridges=5, ridge_depth=0.12, cap_end=True, u_range=(0.04, 0.42), v_range=(0.05, 0.92))

    # 3 distinct tiers emerging from the SAME common rooted base (r <= 0.09 m)
    # Tier 0 (inner): tall upright blades (0.86–1.10 m) with gentle high arch
    # Tier 1 (middle): medium fountain blades (0.62–0.84 m) arching strongly outward
    # Tier 2 (outer): lower mature blades (0.42–0.64 m) drooping gracefully toward the bog floor
    tiers = (
        (10, 0.01, 0.045, 0.86, 1.10, 0.92, 1.32, 0.12, 0.18, 0.11),
        (14, 0.03, 0.070, 0.62, 0.86, 0.56, 0.86, 0.16, 0.34, 0.13),
        (14, 0.05, 0.095, 0.44, 0.66, 0.28, 0.54, 0.14, 0.52, 0.14),
    )
    for count, r_lo, r_hi, len_lo, len_hi, pitch_lo, pitch_hi, arch, droop, width in tiers:
        for k in range(count):
            yaw = (k / count) * math.tau + rng.uniform(-0.24, 0.24)
            r = rng.uniform(r_lo, r_hi)
            origin = Vector((math.cos(yaw) * r, math.sin(yaw) * r, 0.01))
            pitch = rng.uniform(pitch_lo, pitch_hi)
            fdir = Vector((math.cos(yaw), math.sin(yaw), pitch)).normalized()
            blen = rng.uniform(len_lo, len_hi)
            bw = width * rng.uniform(0.78, 1.22)
            shaped_leaf(
                bm,
                uv,
                origin,
                fdir,
                blen,
                bw,
                profile='lanceolate',
                asym=0.08,
                twist=rng.uniform(-0.26, 0.26),
                arch=arch,
                droop=droop * rng.uniform(0.82, 1.20),
                cup_depth=0.22,
                roll=rng.uniform(-0.22, 0.22),
                u_range=(0.46, 0.98),
                v_range=(0.02, 0.98),
            )

    return finish_mesh(name, bm, mat, max_triangles=max_triangles)


# ---------------------------------------------------------------------------
# 4. RAINFOREST: LAYERED-FROND FERNS & CUPPED BROADLEAF PLANTS WITH VISIBLE STEMS
# ---------------------------------------------------------------------------

def build_rainforest_layered_fern(mat, name='forest-fern-02', seed=701, max_triangles=1999):
    """3-tier layered rainforest fern with arching outer, mid, and upright inner fronds + fiddlehead croziers."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Compact basal rhizome crown
    _low_poly_tube(bm, uv, [Vector((0, 0, -0.02)), Vector((0, 0, 0.06))], [0.10, 0.06], sides=6, u_range=(0.47, 0.53), v_range=(0.02, 0.22))

    # 3 distinct frond tiers (outer low spreading, mid fountain, inner upright)
    # 19 fronds * (4 rows * 2 cols * 2 = 16 tris) + 19 petioles * (3*2*2=12) ~ 530 tris, plus 3 coiled croziers ~ 220 tris -> ~900–1400 tris!
    tiers = (
        (7, 0.05, 0.95, 1.28, 0.34, 0.20, 0.34, 0.24, 0.42),   # outer low arching fronds
        (7, 0.04, 0.80, 1.08, 0.30, 0.56, 0.78, 0.26, 0.32),   # mid fountain fronds
        (5, 0.02, 0.52, 0.74, 0.24, 1.05, 1.45, 0.22, 0.16),   # inner upright young fronds
    )
    for tier_idx, (count, r0, len_lo, len_hi, w_frac, pitch_lo, pitch_hi, arch, droop) in enumerate(tiers):
        for k in range(count):
            yaw = ((k + tier_idx * 0.37) / count) * math.tau + rng.uniform(-0.22, 0.22)
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            pitch = rng.uniform(pitch_lo, pitch_hi)
            fdir = Vector((out.x, out.y, pitch)).normalized()
            fl = rng.uniform(len_lo, len_hi)
            fw = fl * w_frac * rng.uniform(0.88, 1.14)
            base = out * r0 + Vector((0.0, 0.0, 0.02 + tier_idx * 0.02))
            petiole_tip = base + fdir * (fl * 0.16)
            _low_poly_tube(bm, uv, [base, petiole_tip], [0.014, 0.008], sides=4, u_range=(0.48, 0.52), v_range=(0.02, 0.28))
            _low_poly_cupped_leaf(
                bm,
                uv,
                petiole_tip,
                fdir,
                fl * 0.88,
                fw,
                profile='ovate',
                arch=arch,
                droop=droop,
                cup_depth=0.16,
                roll=rng.uniform(-0.20, 0.20),
                rows=5,
                cols=2,
                u_range=(0.02, 0.98),
                v_range=(0.02, 0.98),
            )

    # 3 central emerging fiddlehead croziers
    for c_i in range(3):
        ang = c_i * 2.1 + 0.4
        out = Vector((math.cos(ang), math.sin(ang), 0.0))
        h = 0.28 + c_i * 0.06
        pts = [
            out * 0.02 + Vector((0, 0, 0.02)),
            out * 0.05 + Vector((0, 0, h * 0.55)),
            out * 0.08 + Vector((0, 0, h)),
            out * 0.12 + Vector((0, 0, h * 0.92)),
        ]
        _low_poly_tube(bm, uv, pts, [0.012, 0.010, 0.008, 0.006], sides=4, u_range=(0.47, 0.53), v_range=(0.04, 0.60))

    return finalize_budgeted_mesh(name, bm, mat, max_triangles=max_triangles)


def build_rainforest_cupped_broadleaf(mat, name, seed=710, style='elephant_ear', max_triangles=306):
    """Cupped, overlapping tropical broadleaf plant with clearly visible curved petiole stems."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    if style == 'elephant_ear':
        # 8 large overlapping cordate Alocasia leaves on tall curved visible petioles (<= 306 tris)
        # Per leaf: 3-seg 3-sided stem (12 tris) + 3x2 cupped blade (12 tris) = 24 tris -> 8 * 24 = 192 tris!
        leaves = (
            # (yaw, stem_r, stem_h, blade_len, blade_w, pitch, roll)
            (0.15, 0.30, 0.78, 0.72, 0.56, 0.18, 0.14),
            (1.05, 0.22, 0.92, 0.66, 0.52, 0.28, -0.18),
            (1.92, 0.36, 0.60, 0.76, 0.60, 0.06, 0.20),
            (2.80, 0.28, 0.84, 0.70, 0.54, 0.22, -0.12),
            (3.68, 0.40, 0.52, 0.74, 0.58, 0.02, 0.16),
            (4.52, 0.24, 0.88, 0.64, 0.50, 0.30, -0.22),
            (5.38, 0.34, 0.66, 0.72, 0.56, 0.10, 0.12),
            (0.62, 0.14, 0.96, 0.52, 0.42, 0.42, 0.08),
        )
        for yaw, sr, sh, bl, bw, pitch, roll in leaves:
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            p0 = out * 0.04 + Vector((0, 0, -0.01))
            p1 = out * (sr * 0.42) + Vector((0, 0, sh * 0.56))
            p2 = out * sr + Vector((0, 0, sh))
            _low_poly_tube(bm, uv, [p0, p1, p2], [0.032, 0.022, 0.015], sides=4, u_range=(0.02, 0.24), v_range=(0.04, 0.94))
            fdir = Vector((out.x, out.y, pitch)).normalized()
            _low_poly_cupped_leaf(
                bm, uv, p2 - out * 0.06, fdir, bl, bw,
                profile='cordate', arch=0.16, droop=0.28, cup_depth=0.28, roll=roll,
                rows=3, cols=2, u_range=(0.28, 0.98), v_range=(0.04, 0.96),
            )
    elif style == 'banana':
        # Central pseudostem + 7 overlapping cupped paddle leaves with visible petioles (<= 340 tris)
        _low_poly_tube(bm, uv, [Vector((0, 0, -0.02)), Vector((0.02, -0.01, 0.52)), Vector((0.04, 0.0, 0.98))], [0.11, 0.09, 0.07], sides=6, u_range=(0.02, 0.24), v_range=(0.04, 0.94))
        leaves = (
            (0.20, 0.66, 0.32, 1.36, 0.56, 0.34, 0.18),
            (1.12, 0.84, 0.28, 1.28, 0.52, 0.56, -0.16),
            (2.05, 0.58, 0.36, 1.42, 0.58, 0.22, 0.22),
            (2.96, 0.78, 0.30, 1.32, 0.54, 0.48, -0.14),
            (3.88, 0.62, 0.34, 1.38, 0.56, 0.28, 0.16),
            (4.82, 0.88, 0.24, 1.18, 0.48, 0.68, -0.20),
            (5.65, 0.72, 0.32, 1.26, 0.52, 0.40, 0.12),
        )
        for yaw, z_att, pet_l, bl, bw, pitch, roll in leaves:
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            p0 = out * 0.05 + Vector((0.02, 0.0, z_att))
            p1 = p0 + out * (pet_l * 0.55) + Vector((0, 0, pet_l * 0.62))
            p2 = p0 + out * pet_l + Vector((0, 0, pet_l * 0.95))
            _low_poly_tube(bm, uv, [p0, p1, p2], [0.028, 0.020, 0.014], sides=4, u_range=(0.02, 0.24), v_range=(0.10, 0.92))
            fdir = Vector((out.x, out.y, pitch)).normalized()
            _low_poly_cupped_leaf(
                bm, uv, p2, fdir, bl, bw,
                profile='paddle', arch=0.22, droop=0.38, cup_depth=0.24, roll=roll,
                rows=4, cols=2, u_range=(0.28, 0.98), v_range=(0.04, 0.96),
            )
    elif style == 'calathea':
        # 12 cupped, overlapping oval Calathea leaves in 3 staggered tiers with visible curved stems (<= 1,500 tris)
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
                _low_poly_tube(bm, uv, [p0, p1, p2], [0.016, 0.011, 0.008], sides=5, u_range=(0.02, 0.24), v_range=(0.04, 0.94))
                fdir = Vector((out.x, out.y, pitch + rng.uniform(-0.08, 0.10))).normalized()
                _low_poly_cupped_leaf(
                    bm, uv, p2 - out * 0.02, fdir, bl * rng.uniform(0.88, 1.12), bw * rng.uniform(0.90, 1.12),
                    profile='ovate', arch=0.14, droop=0.22, cup_depth=cup, roll=rng.uniform(-0.26, 0.26),
                    rows=5, cols=4, u_range=(0.28, 0.98), v_range=(0.04, 0.96),
                )
    else:
        # Anthurium: 10 deeply cupped cordate leaves on slender visible petioles + 2 glossy spathe accents (<= 1,432 tris)
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
                _low_poly_tube(bm, uv, [p0, p1, p2], [0.018, 0.012, 0.009], sides=5, u_range=(0.02, 0.24), v_range=(0.04, 0.70))
                fdir = Vector((out.x, out.y, pitch + rng.uniform(-0.06, 0.08))).normalized()
                _low_poly_cupped_leaf(
                    bm, uv, p2 - out * 0.04, fdir, bl * rng.uniform(0.90, 1.12), bw * rng.uniform(0.90, 1.10),
                    profile='cordate', arch=0.16, droop=0.28, cup_depth=cup, roll=rng.uniform(-0.24, 0.24),
                    rows=5, cols=4, u_range=(0.28, 0.98), v_range=(0.04, 0.96),
                )
        for s_i, yaw in enumerate((0.8, 3.9)):
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            p0 = out * 0.03 + Vector((0, 0, 0.0))
            p1 = out * 0.12 + Vector((0, 0, 0.42))
            p2 = out * 0.18 + Vector((0, 0, 0.74 - s_i * 0.08))
            _low_poly_tube(bm, uv, [p0, p1, p2], [0.010, 0.008, 0.006], sides=4, u_range=(0.02, 0.24), v_range=(0.04, 0.70))
            _low_poly_cupped_leaf(
                bm, uv, p2, Vector((out.x, out.y, 0.35)).normalized(), 0.16, 0.14,
                profile='cordate', arch=0.10, droop=0.06, cup_depth=0.32, roll=0.0,
                rows=3, cols=2, u_range=(0.04, 0.22), v_range=(0.74, 0.96),
            )

    return finalize_budgeted_mesh(name, bm, mat, max_triangles=max_triangles)
