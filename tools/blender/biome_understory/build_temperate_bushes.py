"""Procedural Blender builder for primary temperate bushes & woodland sapling.

Replaces the legacy branchless blob meshes in `assets/runtime-sources/bushes/`:
  - stylized_bush.glb : Irregular Hawthorn / Hazel coppice shrub
  - small_bush.glb    : Low sprawling Meadow Dogwood / Bramble scrub
  - bush2.glb         : Tall asymmetric Multi-Stem Elder / Alder thicket
  - bush.glb          : Slender upright Multi-Leader Broadleaf Sapling

Run headless:
  "F:\\Blender 5.2\\blender.exe" -b --factory-startup --python tools/blender/biome_understory/build_temperate_bushes.py -- [--no-render]
"""
import math
import os
import random
import sys

import numpy as np
import bmesh
from mathutils import Vector

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if THIS_DIR not in sys.path:
    sys.path.insert(0, THIS_DIR)

from understory_common import (
    fbm,
    finish_mesh,
    leaf_spray_fan,
    make_material,
    place_and_export,
    render_preview,
    save_contact_sheet,
    save_image,
    setup_scene,
    tube,
)
from textures_extra import _draw_leaf_cluster, _draw_segment

ROOT = os.path.abspath(os.path.join(THIS_DIR, '..', '..', '..'))
OUT_BUSHES = os.path.join(ROOT, 'assets', 'runtime-sources', 'bushes')
PREVIEW_DIR = os.path.join(ROOT, 'tmp', 'understory', 'blender')
TEX_DIR = os.path.join(ROOT, 'tmp', 'understory', 'textures')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER = '--no-render' not in argv

TEMPERATE_BUSH_BUDGET = 560


def _temperate_shrub_texture(tex_dir, mat_name, filename, seed, wood_rgb, leaf_rgb, style='hazel'):
    """High-contrast furrowed bark strip (u < 0.28) + open forked twig & discrete leaf clusters (u >= 0.30)."""
    rng = np.random.default_rng(seed)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (8, 12), rng, 4)
    grain = fbm(w, h, (22, 4), rng, 3)

    # Furrowed dark-warm woody bark on left u < 0.28
    in_wood = u < 0.28
    bark_shade = 0.62 + 0.50 * grain[..., None] + 0.14 * (noise[..., None] - 0.5)
    rgba[in_wood, :3] = np.clip(np.array(wood_rgb) * bark_shade[in_wood], 0, 1)
    rgba[in_wood, 3] = 1.0

    fu = (u - 0.30) / 0.70
    in_spray = u >= 0.30
    twig_col = np.array(wood_rgb) * 0.90
    midrib = np.clip(np.array(leaf_rgb) * 1.24, 0, 1)

    twig_segs = (
        (0.50, 0.00, 0.48, 0.36, 0.032, 0.020),
        (0.48, 0.36, 0.54, 0.74, 0.020, 0.010),
        (0.49, 0.24, 0.24, 0.54, 0.018, 0.009),
        (0.50, 0.40, 0.78, 0.66, 0.017, 0.009),
        (0.52, 0.58, 0.30, 0.84, 0.013, 0.007),
    )
    twig_mask = np.zeros_like(u, dtype=bool)
    for seg in twig_segs:
        twig_mask |= in_spray & _draw_segment(None, fu, v, *seg)
    rgba[twig_mask, :3] = np.clip(twig_col * (0.85 + 0.3 * grain[twig_mask, None]), 0, 1)
    rgba[twig_mask, 3] = 1.0

    if style == 'hazel':
        # Distinct serrated ovate hazel/hawthorn leaves arranged on petiole forks
        leaves = (
            (0.24, 0.54, 0.15, 0.19, 0.72),
            (0.78, 0.64, 0.15, 0.19, -0.66),
            (0.32, 0.84, 0.13, 0.17, 0.42),
            (0.62, 0.80, 0.14, 0.17, -0.34),
            (0.49, 0.48, 0.12, 0.15, 0.14),
            (0.44, 0.68, 0.11, 0.14, 0.28),
        )
        serr = 0.18
    elif style == 'dogwood':
        # Crisp pointed opposing dogwood/bramble leaflets leaving airy negative space
        leaves = (
            (0.22, 0.52, 0.12, 0.18, 0.82),
            (0.76, 0.56, 0.12, 0.18, -0.78),
            (0.28, 0.78, 0.11, 0.16, 0.48),
            (0.72, 0.78, 0.11, 0.16, -0.46),
            (0.51, 0.88, 0.10, 0.15, 0.04),
        )
        serr = 0.10
    elif style == 'elder':
        # Feathery pinnate compound elder/alder sprays
        leaves = (
            (0.20, 0.48, 0.09, 0.17, 0.90),
            (0.80, 0.52, 0.09, 0.17, -0.88),
            (0.24, 0.68, 0.09, 0.17, 0.62),
            (0.76, 0.72, 0.09, 0.17, -0.60),
            (0.38, 0.86, 0.09, 0.16, 0.30),
            (0.60, 0.86, 0.09, 0.16, -0.26),
            (0.50, 0.58, 0.08, 0.15, 0.06),
        )
        serr = 0.12
    else:
        # Broadleaf sapling spray: delicate alternate pointed oak/ash/birch leaves
        leaves = (
            (0.22, 0.54, 0.11, 0.18, 0.76),
            (0.78, 0.62, 0.11, 0.18, -0.72),
            (0.32, 0.82, 0.10, 0.16, 0.40),
            (0.64, 0.84, 0.10, 0.16, -0.36),
            (0.50, 0.92, 0.09, 0.14, 0.05),
        )
        serr = 0.14

    for cx, cy, rx, ry, ang in leaves:
        _draw_leaf_cluster(rgba, fu, v, cx, cy, rx, ry, ang, leaf_rgb, midrib, serration=serr)

    base_stem = in_spray & _draw_segment(None, fu, v, 0.50, 0.00, 0.48, 0.36, 0.032, 0.020)
    rgba[base_stem, :3] = twig_col
    rgba[base_stem, 3] = 1.0

    # Keep alpha strictly 0 along tile edges so cutout edges never box out
    border = (fu < 0.04) | (fu > 0.96) | (v > 0.97)
    rgba[in_spray & border, 3] = 0.0
    img = save_image(f'{mat_name}_alb', rgba, os.path.join(tex_dir, filename))
    return make_material(mat_name, img, alpha=True, roughness=0.74)


def _add_spray_pair(bm, uv, attach_pt, branch_dir, length, width, arch=0.14, roll_bias=0.0):
    fwd = branch_dir.normalized()
    leaf_spray_fan(
        bm, uv, attach_pt, fwd, length, width,
        u_range=(0.30, 1.0), v_range=(0.02, 0.98),
        roll=roll_bias + 0.16, arch=arch, cup=0.18, tip_scale=0.38,
    )
    up = Vector((0.0, 0.0, 1.0)) if abs(fwd.z) < 0.90 else Vector((1.0, 0.0, 0.0))
    side = fwd.cross(up).normalized()
    fwd2 = (fwd * 0.84 + up * 0.30 + side * 0.26).normalized()
    leaf_spray_fan(
        bm, uv, attach_pt, fwd2, length * 0.88, width * 0.90,
        u_range=(0.30, 1.0), v_range=(0.02, 0.98),
        roll=roll_bias - 0.82, arch=arch * 0.65, cup=0.16, tip_scale=0.36,
    )


def build_stylized_bush(mat):
    """Irregular Hawthorn / Hazel coppice shrub (~1.05m H x 1.72m W, matches scale: 0.9)."""
    rng = random.Random(401)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    canes = (
        (0.14, 0.72, 0.34, 0.68),
        (1.22, 0.58, 0.48, 1.04),
        (2.34, 0.78, 0.28, 0.56),
        (3.48, 0.62, 0.42, 0.90),
        (4.56, 0.74, 0.32, 0.64),
        (5.54, 0.52, 0.50, 1.08),
    )
    for idx, (yaw, r_xy, z_mid, z_top) in enumerate(canes):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        p0 = out * 0.06 + Vector((0.0, 0.0, 0.0))
        p1 = out * (r_xy * 0.46) + side * rng.uniform(-0.10, 0.10) + Vector((0.0, 0.0, z_mid))
        p2 = out * r_xy + Vector((0.0, 0.0, z_top))
        tube(bm, uv, [p0, p1, p2], [0.052, 0.032, 0.015], sides=4, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.05, rng=rng, cap_end=False)

        fork_side = 1.0 if idx % 2 == 0 else -1.0
        twig = p1 + out * 0.24 + side * (fork_side * 0.30) + Vector((0.0, 0.0, 0.16 if idx % 3 else -0.02))
        tube(bm, uv, [p1, twig], [0.024, 0.012], sides=3, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        mid_base = p1.lerp(p2, 0.45)
        twig_in = mid_base + side * (-fork_side * 0.26) + out * 0.14 + Vector((0.0, 0.0, 0.10))
        tube(bm, uv, [mid_base, twig_in], [0.020, 0.010], sides=3, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        _add_spray_pair(bm, uv, p2 - Vector((0, 0, 0.06)), (p2 - p1 + Vector((0, 0, 0.18))).normalized(), 0.68, 0.72, arch=0.14, roll_bias=idx * 0.5)
        _add_spray_pair(bm, uv, twig - Vector((0, 0, 0.04)), (twig - p1).normalized(), 0.60, 0.64, arch=0.10, roll_bias=-0.45)
        _add_spray_pair(bm, uv, twig_in - Vector((0, 0, 0.03)), (twig_in - mid_base).normalized(), 0.54, 0.56, arch=0.08, roll_bias=0.32)
    return finish_mesh('stylized_bush', bm, mat, max_triangles=TEMPERATE_BUSH_BUDGET)


def build_small_bush(mat):
    """Low sprawling Meadow Dogwood / Bramble scrub (~0.52m H x 0.96m W, matches scale: 1.35)."""
    rng = random.Random(402)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    canes = (
        (0.18, 0.40, 0.20, 0.42),
        (1.42, 0.34, 0.24, 0.48),
        (2.68, 0.44, 0.16, 0.32),
        (3.92, 0.36, 0.22, 0.44),
        (5.16, 0.42, 0.18, 0.36),
    )
    for idx, (yaw, r_xy, z_mid, z_top) in enumerate(canes):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        p0 = out * 0.04 + Vector((0.0, 0.0, 0.0))
        p1 = out * (r_xy * 0.50) + side * rng.uniform(-0.06, 0.06) + Vector((0.0, 0.0, z_mid))
        p2 = out * r_xy + Vector((0.0, 0.0, z_top))
        tube(bm, uv, [p0, p1, p2], [0.032, 0.020, 0.010], sides=4, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.05, rng=rng, cap_end=False)

        fork_side = 1.0 if idx % 2 == 0 else -1.0
        twig = p1 + out * 0.16 + side * (fork_side * 0.18) + Vector((0.0, 0.0, 0.08))
        tube(bm, uv, [p1, twig], [0.016, 0.008], sides=3, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        low_fork = p0.lerp(p1, 0.60) + side * (-fork_side * 0.14) + out * 0.10 + Vector((0.0, 0.0, 0.12))
        tube(bm, uv, [p0.lerp(p1, 0.60), low_fork], [0.014, 0.007], sides=3, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        _add_spray_pair(bm, uv, p2 - Vector((0, 0, 0.04)), (p2 - p1 + Vector((0, 0, 0.08))).normalized(), 0.44, 0.46, arch=0.10, roll_bias=idx * 0.4)
        _add_spray_pair(bm, uv, twig - Vector((0, 0, 0.03)), (twig - p1).normalized(), 0.38, 0.40, arch=0.06, roll_bias=-0.5)
        _add_spray_pair(bm, uv, low_fork - Vector((0, 0, 0.02)), (low_fork - p0).normalized(), 0.34, 0.36, arch=0.06, roll_bias=0.3)
    return finish_mesh('small_bush', bm, mat, max_triangles=TEMPERATE_BUSH_BUDGET)


def build_bush2(mat):
    """Tall asymmetric Elder / Alder-Carr thicket (~2.50m H x 3.1m W unscaled -> 1.25m H at scale: 0.5)."""
    rng = random.Random(403)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    canes = (
        (0.12, 1.42, 0.85, 1.85),
        (1.18, 1.18, 1.12, 2.48),
        (2.26, 1.52, 0.72, 1.48),
        (3.38, 1.24, 1.04, 2.26),
        (4.44, 1.46, 0.78, 1.62),
        (5.48, 1.08, 1.18, 2.54),
    )
    for idx, (yaw, r_xy, z_mid, z_top) in enumerate(canes):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        p0 = out * 0.14 + Vector((0.0, 0.0, 0.0))
        p1 = out * (r_xy * 0.46) + side * rng.uniform(-0.22, 0.22) + Vector((0.0, 0.0, z_mid))
        p2 = out * r_xy + Vector((0.0, 0.0, z_top))
        tube(bm, uv, [p0, p1, p2], [0.105, 0.065, 0.030], sides=4, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.06, rng=rng, cap_end=False)

        fork_side = 1.0 if idx % 2 == 0 else -1.0
        twig1 = p1 + out * 0.48 + side * (fork_side * 0.62) + Vector((0.0, 0.0, 0.34 if idx % 3 else -0.05))
        tube(bm, uv, [p1, twig1], [0.048, 0.022], sides=3, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        mid_node = p1.lerp(p2, 0.48)
        twig2 = mid_node + side * (-fork_side * 0.54) + out * 0.28 + Vector((0.0, 0.0, 0.22))
        tube(bm, uv, [mid_node, twig2], [0.040, 0.018], sides=3, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        _add_spray_pair(bm, uv, p2 - Vector((0, 0, 0.14)), (p2 - p1 + Vector((0, 0, 0.32))).normalized(), 1.38, 1.44, arch=-0.04, roll_bias=idx * 0.5)
        _add_spray_pair(bm, uv, twig1 - Vector((0, 0, 0.10)), (twig1 - p1).normalized(), 1.22, 1.28, arch=-0.02, roll_bias=-0.4)
        _add_spray_pair(bm, uv, twig2 - Vector((0, 0, 0.08)), (twig2 - mid_node).normalized(), 1.12, 1.18, arch=-0.02, roll_bias=0.3)
    return finish_mesh('bush2', bm, mat, max_triangles=TEMPERATE_BUSH_BUDGET)


def build_sapling_bush(mat):
    """Slender upright Multi-Leader Broadleaf Sapling (~1.26m H x 1.32m W -> 1.1m scrub at 0.88 or 2.15m sapling at 1.7)."""
    rng = random.Random(404)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Twin slender curved ascending whip leaders (young tree / sapling character, not a thick squat trunk)
    leaders = (
        (Vector((0.0, 0.0, 0.0)), Vector((0.06, 0.04, 0.58)), Vector((0.12, -0.05, 1.24)), 0.032),
        (Vector((-0.03, 0.02, 0.0)), Vector((-0.12, 0.09, 0.48)), Vector((-0.24, 0.16, 0.98)), 0.026),
    )
    for l_idx, (p0, p1, p2, r0) in enumerate(leaders):
        tube(bm, uv, [p0, p1, p2], [r0, r0 * 0.65, r0 * 0.32], sides=4, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.03, rng=rng, cap_end=False)
        _add_spray_pair(bm, uv, p2 - Vector((0, 0, 0.06)), (p2 - p1 + Vector((0, 0, 0.25))).normalized(), 0.54, 0.52, arch=0.12, roll_bias=l_idx * 0.8)

    # 8 alternate tiered slim lateral sapling limbs rising asymmetrically
    limb_specs = (
        (0.30, 0.30, 0.46, 0.54),
        (2.15, 0.40, 0.50, 0.68),
        (3.85, 0.50, 0.44, 0.76),
        (5.25, 0.60, 0.48, 0.88),
        (1.20, 0.70, 0.42, 0.98),
        (4.45, 0.78, 0.38, 1.06),
        (2.85, 0.85, 0.32, 1.12),
        (0.75, 0.90, 0.28, 1.16),
    )
    main_pts = leaders[0]
    for idx, (yaw, h_frac, reach, z_tip) in enumerate(limb_specs):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        base = main_pts[0].lerp(main_pts[1], h_frac * 2.0) if h_frac < 0.5 else main_pts[1].lerp(main_pts[2], (h_frac - 0.5) * 2.0)
        end = base + out * reach + side * rng.uniform(-0.08, 0.08) + Vector((0.0, 0.0, max(0.14, z_tip - base.z)))
        tube(bm, uv, [base, end], [0.018, 0.009], sides=3, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)
        _add_spray_pair(bm, uv, end - out * 0.05, (end - base).normalized(), 0.52, 0.50, arch=0.06, roll_bias=idx * 0.6)
    return finish_mesh('bush', bm, mat, max_triangles=TEMPERATE_BUSH_BUDGET)


def main():
    for d in (OUT_BUSHES, PREVIEW_DIR, TEX_DIR):
        os.makedirs(d, exist_ok=True)
    setup_scene()

    mats = {
        'stylized_bush': _temperate_shrub_texture(
            TEX_DIR, 'stylized_bush', 'stylized-bush-alb.png', 401,
            (0.36, 0.28, 0.20), (0.20, 0.38, 0.14), style='hazel',
        ),
        'small_bush': _temperate_shrub_texture(
            TEX_DIR, 'bush_leaf', 'small-bush-alb.png', 402,
            (0.34, 0.27, 0.19), (0.19, 0.36, 0.13), style='dogwood',
        ),
        'bush2': _temperate_shrub_texture(
            TEX_DIR, 'Leaves', 'bush2-alb.png', 403,
            (0.35, 0.28, 0.21), (0.18, 0.35, 0.13), style='elder',
        ),
        'bush': _temperate_shrub_texture(
            TEX_DIR, 'vetka_kusta', 'sapling-bush-alb.png', 404,
            (0.38, 0.30, 0.22), (0.22, 0.40, 0.15), style='sapling',
        ),
    }

    specs = (
        ('stylized_bush', build_stylized_bush, 2.8, 0.55),
        ('small_bush', build_small_bush, 1.8, 0.28),
        ('bush2', build_bush2, 4.8, 1.25),
        ('bush', build_sapling_bush, 2.6, 0.65),
    )

    previews = []
    for key, builder, cam_dist, look_z in specs:
        mesh, tris = builder(mats[key])
        assert tris <= TEMPERATE_BUSH_BUDGET, f'{key} has {tris} tris > {TEMPERATE_BUSH_BUDGET}'
        glb_path = os.path.join(OUT_BUSHES, f'{key}.glb')
        root = place_and_export(key, mesh, glb_path)
        print(f'[temperate] {key}: {tris} tris -> {glb_path}')
        if RENDER:
            png_path = os.path.join(PREVIEW_DIR, f'{key}.png')
            render_preview(root, png_path, cam_dist, look_z)
            previews.append(png_path)

    if RENDER and previews:
        sheet = os.path.join(PREVIEW_DIR, 'temperate-bushes-contact-sheet.png')
        save_contact_sheet(previews, sheet, cols=4)
        print(f'Saved temperate bushes contact sheet -> {sheet}')


if __name__ == '__main__':
    main()
