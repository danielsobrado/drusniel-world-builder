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
    MAX_TRIANGLES,
    MIN_TRIANGLES,
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

TEMPERATE_BUSH_BUDGET = MAX_TRIANGLES


def _temperate_shrub_texture(tex_dir, mat_name, filename, seed, wood_rgb, leaf_rgb, style='hazel'):
    """High-contrast furrowed bark strip (u < 0.28) + open forked twig & discrete multi-leaflet clusters (u >= 0.30)."""
    rng = np.random.default_rng(seed)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (8, 12), rng, 4)
    leaf_grain = fbm(w, h, (24, 24), rng, 3)
    grain = fbm(w, h, (22, 4), rng, 3)

    # Furrowed rich-warm woody bark on left u < 0.28
    in_wood = u < 0.28
    furrows = 0.5 + 0.5 * np.cos(u * 92.0 + grain * 4.5)
    bark_shade = 0.42 + 0.54 * grain[..., None] + 0.24 * furrows[..., None] + 0.14 * (noise[..., None] - 0.5)
    rgba[in_wood, :3] = np.clip(np.array(wood_rgb) * bark_shade[in_wood], 0, 1)
    rgba[in_wood, 3] = 1.0

    fu = (u - 0.30) / 0.70
    in_spray = u >= 0.30
    twig_col = np.array(wood_rgb) * 0.92
    petiole_col = np.clip(np.array(wood_rgb) * 0.52 + np.array(leaf_rgb) * 0.56, 0, 1)
    midrib = np.clip(np.array(leaf_rgb) * 1.26, 0, 1)

    twig_segs = (
        (0.50, 0.00, 0.48, 0.36, 0.032, 0.020),
        (0.48, 0.36, 0.54, 0.78, 0.020, 0.010),
        (0.49, 0.24, 0.24, 0.54, 0.018, 0.008),
        (0.24, 0.54, 0.14, 0.70, 0.010, 0.005),
        (0.50, 0.40, 0.78, 0.66, 0.017, 0.008),
        (0.78, 0.66, 0.86, 0.80, 0.010, 0.005),
        (0.52, 0.58, 0.30, 0.86, 0.013, 0.006),
        (0.53, 0.64, 0.66, 0.88, 0.012, 0.006),
    )
    twig_mask = np.zeros_like(u, dtype=bool)
    for seg in twig_segs:
        twig_mask |= in_spray & _draw_segment(None, fu, v, *seg)
    stem_blend = np.clip((v - 0.22) / 0.55, 0.0, 1.0)[..., None]
    stem_rgb = twig_col * (1.0 - stem_blend) + petiole_col * stem_blend
    rgba[twig_mask, :3] = np.clip(stem_rgb[twig_mask] * (0.84 + 0.32 * grain[twig_mask, None]), 0, 1)
    rgba[twig_mask, 3] = 1.0

    if style == 'hazel':
        # Layered serrated hazel/hawthorn leaflet groupings along petiole forks
        leaves = (
            (0.28, 0.42, 0.095, 0.125, 0.78, 0.78),
            (0.72, 0.46, 0.095, 0.125, -0.74, 0.80),
            (0.20, 0.56, 0.092, 0.122, 0.86, 0.92),
            (0.34, 0.58, 0.088, 0.118, 0.42, 0.98),
            (0.16, 0.70, 0.084, 0.112, 0.66, 1.06),
            (0.28, 0.72, 0.082, 0.110, 0.28, 1.08),
            (0.78, 0.60, 0.092, 0.122, -0.78, 0.94),
            (0.64, 0.62, 0.088, 0.118, -0.38, 1.00),
            (0.84, 0.74, 0.084, 0.112, -0.60, 1.06),
            (0.70, 0.76, 0.082, 0.110, -0.26, 1.08),
            (0.36, 0.84, 0.086, 0.116, 0.44, 1.12),
            (0.62, 0.84, 0.086, 0.116, -0.36, 1.12),
            (0.50, 0.90, 0.084, 0.112, 0.06, 1.16),
            (0.48, 0.54, 0.082, 0.108, 0.14, 0.92),
        )
        serr = 0.18
    elif style == 'dogwood':
        # Opposing pointed dogwood/bramble compound leaflets with crisp air gaps
        leaves = (
            (0.30, 0.38, 0.074, 0.126, 0.86, 0.78),
            (0.70, 0.40, 0.074, 0.126, -0.84, 0.78),
            (0.20, 0.52, 0.072, 0.124, 0.82, 0.92),
            (0.80, 0.54, 0.072, 0.124, -0.80, 0.92),
            (0.32, 0.60, 0.070, 0.120, 0.44, 0.98),
            (0.68, 0.62, 0.070, 0.120, -0.42, 0.98),
            (0.18, 0.70, 0.064, 0.110, 0.68, 1.06),
            (0.82, 0.72, 0.064, 0.110, -0.66, 1.06),
            (0.30, 0.78, 0.068, 0.116, 0.46, 1.08),
            (0.70, 0.80, 0.068, 0.116, -0.44, 1.08),
            (0.42, 0.88, 0.064, 0.112, 0.24, 1.14),
            (0.58, 0.88, 0.064, 0.112, -0.22, 1.14),
            (0.50, 0.92, 0.060, 0.104, 0.02, 1.18),
            (0.49, 0.54, 0.062, 0.108, 0.08, 0.94),
        )
        serr = 0.10
    elif style == 'elder':
        # Fine pinnate compound elder/alder sprays (many narrow opposing leaflets)
        leaves = (
            (0.28, 0.38, 0.056, 0.118, 0.92, 0.78),
            (0.72, 0.40, 0.056, 0.118, -0.90, 0.78),
            (0.20, 0.50, 0.058, 0.120, 0.88, 0.90),
            (0.80, 0.52, 0.058, 0.120, -0.86, 0.90),
            (0.34, 0.56, 0.056, 0.116, 0.52, 0.96),
            (0.66, 0.58, 0.056, 0.116, -0.50, 0.96),
            (0.16, 0.66, 0.054, 0.112, 0.74, 1.04),
            (0.84, 0.68, 0.054, 0.112, -0.72, 1.04),
            (0.26, 0.72, 0.056, 0.114, 0.56, 1.06),
            (0.74, 0.74, 0.056, 0.114, -0.54, 1.06),
            (0.38, 0.82, 0.056, 0.114, 0.34, 1.12),
            (0.62, 0.82, 0.056, 0.114, -0.32, 1.12),
            (0.46, 0.90, 0.054, 0.108, 0.16, 1.16),
            (0.56, 0.90, 0.054, 0.108, -0.14, 1.16),
            (0.50, 0.66, 0.052, 0.106, 0.04, 0.98),
        )
        serr = 0.12
    else:
        # Broadleaf sapling spray: delicate alternate oak/ash/birch leaflet sprays
        leaves = (
            (0.30, 0.40, 0.068, 0.120, 0.82, 0.80),
            (0.70, 0.44, 0.068, 0.120, -0.78, 0.82),
            (0.20, 0.54, 0.066, 0.118, 0.78, 0.94),
            (0.80, 0.58, 0.066, 0.118, -0.74, 0.96),
            (0.34, 0.62, 0.064, 0.114, 0.42, 1.00),
            (0.66, 0.64, 0.064, 0.114, -0.40, 1.00),
            (0.22, 0.74, 0.062, 0.110, 0.58, 1.06),
            (0.78, 0.76, 0.062, 0.110, -0.54, 1.08),
            (0.36, 0.84, 0.064, 0.112, 0.38, 1.12),
            (0.64, 0.86, 0.064, 0.112, -0.34, 1.12),
            (0.50, 0.92, 0.060, 0.106, 0.04, 1.18),
            (0.49, 0.72, 0.058, 0.104, 0.10, 1.02),
        )
        serr = 0.14

    for cx, cy, rx, ry, ang, ao in leaves:
        _draw_leaf_cluster(rgba, fu, v, cx, cy, rx, ry, ang, leaf_rgb, midrib, serration=serr, noise=leaf_grain, ao=ao)

    base_stem = in_spray & _draw_segment(None, fu, v, 0.50, 0.00, 0.48, 0.36, 0.032, 0.020)
    rgba[base_stem, :3] = np.clip(twig_col * (0.88 + 0.28 * grain[base_stem, None]), 0, 1)
    rgba[base_stem, 3] = 1.0

    # Keep alpha strictly 0 along tile edges so cutout edges never box out
    border = (fu < 0.04) | (fu > 0.96) | (v > 0.97)
    rgba[in_spray & border, 3] = 0.0
    img = save_image(f'{mat_name}_alb', rgba, os.path.join(tex_dir, filename))
    return make_material(mat_name, img, alpha=True, roughness=0.74)


def _curved_cane(rng, p0, p1, p2, gnarl=0.05):
    """Subdivide a 3-point cane into 4 organically curved stations with slight lateral wander."""
    m01 = p0.lerp(p1, 0.52) + Vector((rng.uniform(-gnarl, gnarl), rng.uniform(-gnarl, gnarl), rng.uniform(0.0, gnarl * 0.6)))
    m12 = p1.lerp(p2, 0.50) + Vector((rng.uniform(-gnarl, gnarl), rng.uniform(-gnarl, gnarl), rng.uniform(-gnarl * 0.4, gnarl * 0.7)))
    return [p0, m01, p1, m12, p2]


def _curved_twig(rng, base, tip, arch_up=0.04, gnarl=0.025):
    """3-point curved lateral twig so branches avoid rigid straight-stick geometry."""
    mid = base.lerp(tip, 0.52) + Vector((
        rng.uniform(-gnarl, gnarl),
        rng.uniform(-gnarl, gnarl),
        arch_up + rng.uniform(-gnarl * 0.3, gnarl * 0.5),
    ))
    return [base, mid, tip]


def _add_spray_pair(bm, uv, tip_pt, branch_dir, length, width, arch=0.14, roll_bias=0.0, inset=None):
    fwd = branch_dir.normalized()
    # Bury the spray root back along the twig axis so the painted stem emerges seamlessly from the 3D wood
    anchor = tip_pt - fwd * (inset if inset is not None else length * 0.14)
    leaf_spray_fan(
        bm, uv, anchor, fwd, length, width,
        u_range=(0.30, 1.0), v_range=(0.00, 0.98),
        roll=roll_bias + 0.16, arch=arch, cup=0.18, tip_scale=0.38,
    )
    up = Vector((0.0, 0.0, 1.0)) if abs(fwd.z) < 0.90 else Vector((1.0, 0.0, 0.0))
    side = fwd.cross(up).normalized()
    fwd_skirt = (fwd * 0.64 - up * 0.26 - side * 0.52).normalized()
    leaf_spray_fan(
        bm, uv, anchor - fwd * (length * 0.12), fwd_skirt, length * 0.80, width * 0.86,
        u_range=(0.30, 1.0), v_range=(0.00, 0.98),
        roll=roll_bias + 1.02, arch=max(0.06, arch * 0.65), cup=0.15, tip_scale=0.34,
    )
    fwd2 = (fwd * 0.84 + up * 0.30 + side * 0.26).normalized()
    leaf_spray_fan(
        bm, uv, anchor, fwd2, length * 0.88, width * 0.90,
        u_range=(0.30, 1.0), v_range=(0.00, 0.98),
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
        p0 = out * rng.uniform(0.04, 0.09) + side * rng.uniform(-0.03, 0.03)
        p1 = out * (r_xy * rng.uniform(0.42, 0.52)) + side * rng.uniform(-0.12, 0.12) + Vector((0.0, 0.0, z_mid))
        p2 = out * (r_xy + rng.uniform(-0.06, 0.06)) + side * rng.uniform(-0.08, 0.08) + Vector((0.0, 0.0, z_top))
        cane_pts = _curved_cane(rng, p0, p1, p2, gnarl=0.055)
        tube(bm, uv, cane_pts, [0.050, 0.039, 0.029, 0.019, 0.008], sides=5, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.06, rng=rng, cap_end=False)

        fork_side = 1.0 if idx % 2 == 0 else -1.0
        twig_end = p1 + out * rng.uniform(0.20, 0.28) + side * (fork_side * rng.uniform(0.24, 0.34)) + Vector((0.0, 0.0, 0.18 if idx % 3 else 0.04))
        twig_pts = _curved_twig(rng, p1, twig_end, arch_up=0.05, gnarl=0.03)
        tube(bm, uv, twig_pts, [0.023, 0.015, 0.007], sides=4, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        mid_base = p1.lerp(p2, 0.48)
        twig_in_end = mid_base + side * (-fork_side * rng.uniform(0.20, 0.28)) + out * 0.14 + Vector((0.0, 0.0, 0.12))
        twig_in_pts = _curved_twig(rng, mid_base, twig_in_end, arch_up=0.04, gnarl=0.025)
        tube(bm, uv, twig_in_pts, [0.019, 0.012, 0.006], sides=4, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        s0 = rng.uniform(0.90, 1.12)
        _add_spray_pair(bm, uv, p2, (p2 - cane_pts[-2] + Vector((0, 0, 0.12))).normalized(), 0.68 * s0, 0.72 * s0, arch=0.14, roll_bias=idx * 0.55)
        _add_spray_pair(bm, uv, twig_end, (twig_end - twig_pts[1]).normalized(), 0.60 * s0, 0.64 * s0, arch=0.10, roll_bias=-0.45 + idx * 0.2)
        _add_spray_pair(bm, uv, twig_in_end, (twig_in_end - twig_in_pts[1]).normalized(), 0.54 * s0, 0.56 * s0, arch=0.08, roll_bias=0.32 - idx * 0.15)
    return finish_mesh('stylized_bush', bm, mat, max_triangles=TEMPERATE_BUSH_BUDGET, allow_extra_material=False)


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
        p0 = out * rng.uniform(0.03, 0.06) + side * rng.uniform(-0.02, 0.02)
        p1 = out * (r_xy * rng.uniform(0.45, 0.55)) + side * rng.uniform(-0.07, 0.07) + Vector((0.0, 0.0, z_mid))
        p2 = out * (r_xy + rng.uniform(-0.04, 0.04)) + side * rng.uniform(-0.05, 0.05) + Vector((0.0, 0.0, z_top))
        cane_pts = _curved_cane(rng, p0, p1, p2, gnarl=0.035)
        tube(bm, uv, cane_pts, [0.032, 0.025, 0.019, 0.012, 0.006], sides=5, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.06, rng=rng, cap_end=False)

        fork_side = 1.0 if idx % 2 == 0 else -1.0
        twig_end = p1 + out * rng.uniform(0.14, 0.19) + side * (fork_side * rng.uniform(0.15, 0.21)) + Vector((0.0, 0.0, 0.09))
        twig_pts = _curved_twig(rng, p1, twig_end, arch_up=0.03, gnarl=0.02)
        tube(bm, uv, twig_pts, [0.016, 0.010, 0.005], sides=4, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        low_base = p0.lerp(p1, 0.60)
        low_end = low_base + side * (-fork_side * rng.uniform(0.12, 0.17)) + out * 0.10 + Vector((0.0, 0.0, 0.12))
        low_pts = _curved_twig(rng, low_base, low_end, arch_up=0.03, gnarl=0.018)
        tube(bm, uv, low_pts, [0.014, 0.009, 0.005], sides=4, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        s0 = rng.uniform(0.90, 1.12)
        _add_spray_pair(bm, uv, p2, (p2 - cane_pts[-2] + Vector((0, 0, 0.06))).normalized(), 0.44 * s0, 0.46 * s0, arch=0.10, roll_bias=idx * 0.4)
        _add_spray_pair(bm, uv, twig_end, (twig_end - twig_pts[1]).normalized(), 0.38 * s0, 0.40 * s0, arch=0.06, roll_bias=-0.5 + idx * 0.2)
        _add_spray_pair(bm, uv, low_end, (low_end - low_pts[1]).normalized(), 0.34 * s0, 0.36 * s0, arch=0.06, roll_bias=0.3 - idx * 0.15)
    return finish_mesh('small_bush', bm, mat, max_triangles=TEMPERATE_BUSH_BUDGET, allow_extra_material=False)


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
        p0 = out * rng.uniform(0.10, 0.18) + side * rng.uniform(-0.06, 0.06)
        p1 = out * (r_xy * rng.uniform(0.42, 0.52)) + side * rng.uniform(-0.24, 0.24) + Vector((0.0, 0.0, z_mid))
        p2 = out * (r_xy + rng.uniform(-0.12, 0.12)) + side * rng.uniform(-0.16, 0.16) + Vector((0.0, 0.0, z_top))
        cane_pts = _curved_cane(rng, p0, p1, p2, gnarl=0.11)
        tube(bm, uv, cane_pts, [0.100, 0.078, 0.058, 0.036, 0.016], sides=5, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.07, rng=rng, cap_end=False)

        fork_side = 1.0 if idx % 2 == 0 else -1.0
        twig1_end = p1 + out * rng.uniform(0.42, 0.56) + side * (fork_side * rng.uniform(0.54, 0.70)) + Vector((0.0, 0.0, 0.36 if idx % 3 else 0.08))
        twig1_pts = _curved_twig(rng, p1, twig1_end, arch_up=0.10, gnarl=0.06)
        tube(bm, uv, twig1_pts, [0.046, 0.028, 0.012], sides=4, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        mid_node = p1.lerp(p2, 0.48)
        twig2_end = mid_node + side * (-fork_side * rng.uniform(0.46, 0.62)) + out * 0.28 + Vector((0.0, 0.0, 0.24))
        twig2_pts = _curved_twig(rng, mid_node, twig2_end, arch_up=0.08, gnarl=0.05)
        tube(bm, uv, twig2_pts, [0.038, 0.024, 0.010], sides=4, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        s0 = rng.uniform(0.90, 1.12)
        _add_spray_pair(bm, uv, p2, (p2 - cane_pts[-2] + Vector((0, 0, 0.24))).normalized(), 1.38 * s0, 1.44 * s0, arch=-0.04, roll_bias=idx * 0.5)
        _add_spray_pair(bm, uv, twig1_end, (twig1_end - twig1_pts[1]).normalized(), 1.22 * s0, 1.28 * s0, arch=-0.02, roll_bias=-0.4 + idx * 0.2)
        _add_spray_pair(bm, uv, twig2_end, (twig2_end - twig2_pts[1]).normalized(), 1.12 * s0, 1.18 * s0, arch=-0.02, roll_bias=0.3 - idx * 0.15)
    return finish_mesh('bush2', bm, mat, max_triangles=TEMPERATE_BUSH_BUDGET, allow_extra_material=False)


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
        cane_pts = _curved_cane(rng, p0, p1, p2, gnarl=0.03)
        tube(bm, uv, cane_pts, [r0, r0 * 0.80, r0 * 0.62, r0 * 0.42, r0 * 0.24], sides=5, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.04, rng=rng, cap_end=False)
        _add_spray_pair(bm, uv, p2, (p2 - cane_pts[-2] + Vector((0, 0, 0.22))).normalized(), 0.54, 0.52, arch=0.12, roll_bias=l_idx * 0.8)

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
        limb_pts = _curved_twig(rng, base, end, arch_up=0.04, gnarl=0.02)
        tube(bm, uv, limb_pts, [0.017, 0.011, 0.005], sides=4, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)
        _add_spray_pair(bm, uv, end, (end - limb_pts[1]).normalized(), 0.52, 0.50, arch=0.06, roll_bias=idx * 0.6)
    return finish_mesh('bush', bm, mat, max_triangles=TEMPERATE_BUSH_BUDGET, allow_extra_material=False)


def main():
    for d in (OUT_BUSHES, PREVIEW_DIR, TEX_DIR):
        os.makedirs(d, exist_ok=True)
    setup_scene()

    mats = {
        'stylized_bush': _temperate_shrub_texture(
            TEX_DIR, 'stylized_bush', 'stylized-bush-alb.png', 401,
            (0.32, 0.21, 0.12), (0.20, 0.38, 0.14), style='hazel',
        ),
        'small_bush': _temperate_shrub_texture(
            TEX_DIR, 'bush_leaf', 'small-bush-alb.png', 402,
            (0.31, 0.20, 0.12), (0.19, 0.36, 0.13), style='dogwood',
        ),
        'bush2': _temperate_shrub_texture(
            TEX_DIR, 'Leaves', 'bush2-alb.png', 403,
            (0.32, 0.21, 0.13), (0.18, 0.35, 0.13), style='elder',
        ),
        'bush': _temperate_shrub_texture(
            TEX_DIR, 'vetka_kusta', 'sapling-bush-alb.png', 404,
            (0.34, 0.22, 0.13), (0.22, 0.40, 0.15), style='sapling',
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
        assert MIN_TRIANGLES <= tris <= TEMPERATE_BUSH_BUDGET, (
            f'{key} has {tris} tris (expected [{MIN_TRIANGLES}, {TEMPERATE_BUSH_BUDGET}])'
        )
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
