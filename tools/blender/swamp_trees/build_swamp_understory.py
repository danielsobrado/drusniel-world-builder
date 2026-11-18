"""Grukmar bog understory: fern, fallen mossy log, broken stump, cypress knees, bioluminescent fungi.

Run headless:
  "F:\\Blender 5.2\\blender.exe" -b --factory-startup --python tools/blender/swamp_trees/build_swamp_understory.py -- [--no-render]

Writes one GLB per prop to assets/runtime-sources/ground/swamp/ (>= 15k triangles, full PBR,
baked soil/neighbour contact skirts, and float16-snapped vertices).
"""
import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
UNDERSTORY_DIR = os.path.abspath(os.path.join(THIS_DIR, '..', 'biome_understory'))
if UNDERSTORY_DIR not in sys.path:
    sys.path.insert(0, UNDERSTORY_DIR)

from understory_common import (  # noqa: E402
    MAX_TRIANGLES,
    MIN_TRIANGLES,
    fbm,
    finish_mesh,
    height_to_normal,
    make_material,
    mushroom_dome,
    place_and_export,
    render_preview,
    save_image,
    setup_scene,
    tube,
)

ROOT = os.path.abspath(os.path.join(THIS_DIR, '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'runtime-sources', 'ground', 'swamp')
PREVIEW = os.path.join(ROOT, 'tmp', 'swamp', 'blender')
TEX = os.path.join(ROOT, 'tmp', 'swamp', 'textures')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER = '--no-render' not in argv


def wood_material():
    """Rotten mossy bog wood PBR material: BaseColor, Normal, and packed ORM."""
    rng = np.random.default_rng(31)
    w = h = 256
    grain = fbm(w, h, (3, 20), rng, 4).T
    fissure = np.clip((np.abs(grain - 0.5) * 2.0) ** 0.55, 0.0, 1.0)
    bark = np.array([0.04, 0.036, 0.026]) + np.array([0.16, 0.14, 0.10]) * fissure[..., None]
    moss_noise = fbm(w, h, (8, 8), rng, 4)
    u = np.linspace(0.0, 1.0, w)[None, :].repeat(h, 0)
    band = np.clip(1.0 - np.abs(u - 0.5) / 0.32, 0.0, 1.0)
    moss = np.clip(band * 1.4 + (moss_noise - 0.5) * 1.2 - 0.25, 0.0, 1.0)
    moss_col = np.array([0.16, 0.24, 0.08]) * (0.75 + 0.5 * moss_noise[..., None])
    col = bark * (1.0 - moss[..., None]) + moss_col * moss[..., None]
    rgba = np.concatenate([np.clip(col, 0.0, 1.0), np.ones((h, w, 1), dtype=np.float32)], axis=2)
    alb = save_image('swamp_wood_alb', rgba, os.path.join(TEX, 'swamp-wood.png'))
    nrm = save_image(
        'swamp_wood_nrm',
        height_to_normal(fissure * 0.7 + moss_noise * 0.3, strength=2.8),
        os.path.join(TEX, 'swamp-wood-nrm.png'),
        non_color=True,
    )
    return make_material('Swamp wood', alb, alpha=False, normal_image=nrm, roughness=0.88)


def fern_material():
    """Cutout swamp fern frond with midrib, pinnae, and crisp alpha edge."""
    w, h = 256, 512
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    t = 1.0 - ys / h
    cx = w / 2.0 + 9.0 * np.sin(t * 2.3)
    rib = np.abs(xs - cx) < 2.2 + (1.0 - t) * 3.0
    rgba[rib] = (0.12, 0.17, 0.06, 1.0)
    pinnae = 28
    for k in range(pinnae):
        tk = 0.08 + k / pinnae * 0.89
        y0 = h * (1.0 - tk)
        length = (w / 2.0 - 9.0) * math.sin(math.pi * min(1.0, tk * 1.38)) * ((1.0 - 0.88 * tk) ** 0.72)
        for side in (-1, 1):
            for s in np.linspace(0.0, 1.0, 64):
                px = w / 2.0 + 9.0 * math.sin(tk * 2.3) + side * s * length
                py = y0 - s * length * 0.38
                pinna_base_w = 8.4 * (1.0 - 0.55 * tk)
                half = pinna_base_w * (1.0 - s) ** 0.65 + 0.8
                yy0, yy1 = int(max(0, py - half)), int(min(h - 1, py + half))
                x = int(px)
                if 0 <= x < w:
                    shade = 0.74 + 0.36 * s
                    rgba[yy0:yy1 + 1, x] = (0.15 * shade, 0.25 * shade, 0.08 * shade, 1.0)
    alb = save_image('swamp_fern_alb', rgba, os.path.join(TEX, 'swamp-fern.png'))
    return make_material('Swamp fern', alb, alpha=True, roughness=0.68, subsurface=0.25)


def glow_materials():
    """Rotten stem and glowing cold-green bioluminescent cap PBR materials."""
    rng = np.random.default_rng(77)
    w = h = 256
    noise = fbm(w, h, (10, 10), rng, 4)
    stem_rgb = np.array([0.14, 0.12, 0.09]) * (0.72 + 0.52 * noise[..., None])
    stem_rgba = np.concatenate([np.clip(stem_rgb, 0.0, 1.0), np.ones((h, w, 1), dtype=np.float32)], axis=-1)
    stem_alb = save_image('swamp_fungi_stem_alb', stem_rgba, os.path.join(TEX, 'swamp-fungi-stem.png'))
    stem = make_material('Swamp fungus stem', stem_alb, alpha=False, roughness=0.86)

    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rad = np.hypot((u - 0.5) * 2.0, (v - 0.5) * 2.0)
    gills = 0.5 + 0.5 * np.cos(np.arctan2(v - 0.5, u - 0.5) * 18.0)
    cap_rgb = (
        np.array([0.22, 0.62, 0.46]) * (0.65 + 0.35 * (1.0 - np.clip(rad, 0.0, 1.0))[..., None])
        + np.array([0.08, 0.24, 0.18]) * gills[..., None]
    ) * (0.85 + 0.25 * noise[..., None])
    cap_rgba = np.concatenate([np.clip(cap_rgb, 0.0, 1.0), np.ones((h, w, 1), dtype=np.float32)], axis=-1)
    cap_alb = save_image('swamp_fungi_cap_alb', cap_rgba, os.path.join(TEX, 'swamp-fungi-cap.png'))
    cap = make_material(
        'Swamp fungus glow',
        cap_alb,
        alpha=False,
        roughness=0.45,
        subsurface=0.30,
        emissive_strength=2.2,
    )
    return stem, cap


def build_log(wood):
    rng = random.Random(5)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    length = 5.2
    pts, radii = [], []
    for i in range(9):
        t = i / 8.0
        pts.append(Vector((t * length - length / 2.0, 0.08 * math.sin(t * 5.0), 0.32 - 0.12 * t + 0.04 * math.sin(t * 7.0))))
        radii.append(0.38 * (1.0 - 0.3 * t))
    tube(bm, uv, pts, radii, 10, u_range=(0.0, 1.0), rough=0.08, rng=rng, flute_count=6, flute_depth=0.06)
    for t, ang in ((0.35, 1.0), (0.7, -1.2), (0.52, 0.4)):
        base = pts[0].lerp(pts[-1], t) + Vector((0, 0, 0.18))
        d = Vector((0.3, math.cos(ang), math.sin(ang) * 0.6 + 0.5)).normalized()
        tube(bm, uv, [base, base + d * 0.5, base + d * 0.9], [0.09, 0.07, 0.045], 6, rough=0.05, rng=rng)
    return finish_mesh('swamp-log-01', bm, wood)


def build_stump(wood):
    rng = random.Random(9)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    pts = [Vector((0, 0, -0.15)), Vector((0, 0, 0.35)), Vector((0.03, 0.02, 0.9)), Vector((0.05, 0.03, 1.35))]
    radii = [0.78, 0.55, 0.45, 0.42]
    rings = tube(bm, uv, pts, radii, 12, u_range=(0.0, 1.0), cap_end=False, rough=0.09, rng=rng, flute_count=7, flute_depth=0.10)
    top = rings[-1]
    for v, _ in top[:-1]:
        v.co.z += rng.uniform(-0.22, 0.38)
    centre = bm.verts.new(pts[-1] - Vector((0, 0, 0.15)))
    for s in range(len(top) - 1):
        f = bm.faces.new((top[s][0], top[s + 1][0], centre))
        for loop, coord in zip(f.loops, ((0.4, 0.93), (0.6, 0.93), (0.5, 0.99))):
            loop[uv].uv = coord
    for k in range(5):
        a = k * math.tau / 5.0 + rng.uniform(-0.25, 0.25)
        o = Vector((math.cos(a), math.sin(a), 0))
        tube(
            bm,
            uv,
            [o * 0.28 + Vector((0, 0, 0.52)), o * 0.78 + Vector((0, 0, 0.14)), o * 1.18 + Vector((0, 0, -0.10))],
            [0.24, 0.16, 0.08],
            6,
            rough=0.05,
            rng=rng,
        )
    return finish_mesh('swamp-stump-01', bm, wood)


def build_knees(wood):
    """Cypress knees: fluted blunt woody cones rising from flooded mud & root collars."""
    rng = random.Random(13)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    for k in range(7):
        a = k / 7.0 * math.tau + rng.uniform(-0.25, 0.25)
        r = rng.uniform(0.22, 1.45)
        base = Vector((math.cos(a) * r, math.sin(a) * r, -0.10))
        height = rng.uniform(0.38, 0.96)
        lean = Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 1)).normalized()
        w = rng.uniform(0.13, 0.22)
        tube(
            bm,
            uv,
            [base, base + lean * height * 0.55, base + lean * height],
            [w, w * 0.72, w * 0.34],
            8,
            rough=0.08,
            rng=rng,
            flute_count=5,
            flute_depth=0.08,
        )
    return finish_mesh('swamp-knees-01', bm, wood)


def build_fern(materials):
    """Multi-tiered naturally arching swamp fern fronds with V-cupped blades and mossy root collar."""
    fern_mat, wood_mat = materials
    rng = random.Random(17)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    tiers = ((0, 7, 0.18, 1.0), (1, 5, 0.45, 0.78))
    for tier, count, up_bias, scale in tiers:
        for k in range(count):
            yaw = (k + 0.4 * tier) / count * 2 * math.pi + rng.uniform(-0.22, 0.22)
            length = rng.uniform(0.82, 1.15) * scale
            width = length * 0.34
            out = Vector((math.cos(yaw), math.sin(yaw), 0))
            side = Vector((-math.sin(yaw), math.cos(yaw), 0))
            pts = (
                out * 0.04 + Vector((0, 0, 0.02)),
                out * (length * 0.28) + Vector((0, 0, length * (0.34 + up_bias * 0.28))),
                out * (length * 0.66) + Vector((0, 0, length * (0.44 + up_bias * 0.36))),
                out * (length * 0.98) + Vector((0, 0, length * (0.18 + up_bias * 0.30))),
            )
            rings = []
            profiles = (
                (0.12 * width, 0.00, 0.02),
                (0.50 * width, 0.028 * width, 0.34),
                (0.30 * width, 0.022 * width, 0.70),
                (0.05 * width, 0.006 * width, 0.99),
            )
            for p, (hw, cup, vc) in zip(pts, profiles):
                rings.append((
                    bm.verts.new(p - side * hw + Vector((0, 0, cup))),
                    bm.verts.new(p),
                    bm.verts.new(p + side * hw + Vector((0, 0, cup))),
                    vc,
                ))
            for a, b in zip(rings[:-1], rings[1:]):
                for u0, u1, i0, i1 in ((0.0, 0.5, 0, 1), (0.5, 1.0, 1, 2)):
                    f = bm.faces.new((a[i0], a[i1], b[i1], b[i0]))
                    f.material_index = 0
                    for loop, coord in zip(f.loops, ((u0, a[3]), (u1, a[3]), (u1, b[3]), (u0, b[3]))):
                        loop[uv].uv = coord
    return finish_mesh('swamp-fern-01', bm, [fern_mat, wood_mat], allow_extra_material=False)


def build_fungi(materials):
    """A cluster of glowing toadstools on a rotten mossy stub, with bracket shelves."""
    stem_mat, cap_mat = materials
    rng = random.Random(21)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    stub = [Vector((0, 0, -0.1)), Vector((0.02, 0, 0.25)), Vector((0.03, 0.01, 0.45))]
    tube(bm, uv, stub, [0.22, 0.18, 0.15], 8, rough=0.1, rng=rng, flute_count=5, flute_depth=0.07)
    for k in range(11):
        a = k / 11.0 * math.tau + rng.uniform(-0.25, 0.25)
        r = rng.uniform(0.18, 0.55)
        h = rng.uniform(0.08, 0.24)
        base = Vector((math.cos(a) * r, math.sin(a) * r, -0.02))
        tube(bm, uv, [base, base + Vector((0, 0, h * 0.5)), base + Vector((0, 0, h))], [0.015, 0.012, 0.010], 4, cap_end=False)
        cap_faces = mushroom_dome(bm, uv, base + Vector((0, 0, h)), rng.uniform(0.05, 0.09), rng.uniform(0.03, 0.055), sides=10)
        for cf in cap_faces:
            cf.material_index = 1
    for k in range(4):
        a = k * 1.55 + 0.3
        cap_faces = mushroom_dome(bm, uv, Vector((math.cos(a) * 0.17, math.sin(a) * 0.17, 0.14 + k * 0.08)), 0.10, 0.024, sides=10)
        for cf in cap_faces:
            cf.material_index = 1
    return finish_mesh('swamp-fungi-01', bm, [stem_mat, cap_mat], allow_extra_material=False)


def main():
    for d in (OUT, PREVIEW, TEX):
        os.makedirs(d, exist_ok=True)
    setup_scene()
    wood = wood_material()
    fern = fern_material()
    glow = glow_materials()
    for build, mat, distance in (
        (build_log, wood, 5.0),
        (build_stump, wood, 3.5),
        (build_knees, wood, 3.5),
        (build_fern, (fern, wood), 2.2),
        (build_fungi, glow, 1.6),
    ):
        mesh, tris = build(mat)
        name = mesh.name
        assert MIN_TRIANGLES <= tris <= MAX_TRIANGLES, (
            f'{name} has {tris} tris (expected [{MIN_TRIANGLES}, {MAX_TRIANGLES}])'
        )
        print(f'[swamp] {name}: {tris} tris', flush=True)
        root = place_and_export(name, mesh, os.path.join(OUT, f'{name}.glb'))
        if RENDER:
            render_preview(root, os.path.join(PREVIEW, f'{name}.png'), distance)


if __name__ == '__main__':
    main()
