"""Build 30 high-detail >=15k-tri PBR underground and glacial area props in headless Blender.

Produces 5 distinct hero props per area (mine, umbra_cavern, stonehold_hold,
frostgard_glacier_cave, frostgard_glacier_front, frostgard_hold), each with:
- Sculpted multi-part procedural Blender BMesh geometry refined to >= 15,000 tris
- Full 3-map PBR textures (BaseColor + Tangent-Space Normal + Packed ORM + Emissive/Subsurface)
- Multi-lobed soil/rubble/cobble/ice contact skirts + blended basal normals + baked Col AO
- Exports to assets/runtime-sources/underground/<area>/<name>.glb + manifest.json
"""
import argparse
import json
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector
import numpy as np

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
TOOLS_BLENDER_DIR = os.path.abspath(os.path.join(THIS_DIR, '..'))
BIOME_UNDERSTORY_DIR = os.path.join(TOOLS_BLENDER_DIR, 'biome_understory')
for p in (TOOLS_BLENDER_DIR, BIOME_UNDERSTORY_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from understory_common import setup_scene, tube, rock_chunk, mushroom_dome, place_and_export, MIN_TRIANGLES, MAX_TRIANGLES
from understory_pbr import build_pbr_material, finalize_understory_mesh

REPO_ROOT = os.path.abspath(os.path.join(THIS_DIR, '..', '..', '..'))
OUT_ROOT = os.path.join(REPO_ROOT, 'assets', 'runtime-sources', 'underground')
TEX_DIR = os.path.join(OUT_ROOT, '_textures')
MANIFEST_PATH = os.path.join(OUT_ROOT, 'manifest.json')


def _fbm2(w, h, freq, rng, octaves=4):
    acc = np.zeros((h, w), dtype=np.float32)
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        gx = max(2, int(freq[0] * (2 ** o)))
        gy = max(2, int(freq[1] * (2 ** o)))
        grid = rng.random((gy, gx), dtype=np.float32)
        ys = np.linspace(0, gy - 1e-4, h, endpoint=False)
        xs = np.linspace(0, gx - 1e-4, w, endpoint=False)
        yi = np.floor(ys).astype(np.int32)
        xi = np.floor(xs).astype(np.int32)
        yf = (ys - yi)[:, None]
        xf = (xs - xi)[None, :]
        yi1 = (yi + 1) % gy
        xi1 = (xi + 1) % gx
        c00 = grid[yi[:, None], xi[None, :]]
        c10 = grid[yi[:, None], xi1[None, :]]
        c01 = grid[yi1[:, None], xi[None, :]]
        c11 = grid[yi1[:, None], xi1[None, :]]
        top = c00 * (1.0 - xf) + c10 * xf
        bot = c01 * (1.0 - xf) + c11 * xf
        acc += amp * (top * (1.0 - yf) + bot * yf)
        norm += amp
        amp *= 0.5
    return acc / max(norm, 1e-6)


def _save_rgba(name, rgba):
    os.makedirs(TEX_DIR, exist_ok=True)
    path = os.path.join(TEX_DIR, f'{name}.png')
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.pixels.foreach_set(np.flipud(np.clip(rgba, 0.0, 1.0)).ravel().tolist())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def _make_zone_atlas(name, zones, seed=101, emissive_zone=False):
    """Build a 2x2 UV quadrant PBR atlas (albedo, normal, orm, optional emissive)."""
    w = h = 512
    hw = hh = 256
    rng = np.random.default_rng(seed)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    height = np.zeros((h, w), dtype=np.float32)
    rough = np.full((h, w), 0.78, dtype=np.float32)
    metal = np.zeros((h, w), dtype=np.float32)
    ao = np.ones((h, w), dtype=np.float32)
    emissive = np.zeros((h, w, 4), dtype=np.float32)
    emissive[..., 3] = 1.0

    # 4 quadrants in UV space -> bottom-left (0,0), bottom-right (1,0), top-left (0,1), top-right (1,1)
    boxes = ((hh, h, 0, hw), (hh, h, hw, w), (0, hh, 0, hw), (0, hh, hw, w))
    for idx, z in enumerate(zones[:4]):
        y0, y1, x0, x1 = boxes[idx]
        n1 = _fbm2(hw, hh, (6, 6), rng, 4)
        n2 = _fbm2(hw, hh, (18, 18), rng, 3)
        streak = _fbm2(hw, hh, (4, 24), rng, 3) if z.get('grain') else n2
        pat = 0.55 * n1 + 0.30 * n2 + 0.15 * streak
        c0 = np.array(z['col0'], dtype=np.float32)
        c1 = np.array(z['col1'], dtype=np.float32)
        col = c0[None, None, :] * (1.0 - pat[..., None]) + c1[None, None, :] * pat[..., None]
        rgba[y0:y1, x0:x1, :3] = col
        height[y0:y1, x0:x1] = pat * z.get('bump', 0.8)
        rough[y0:y1, x0:x1] = np.clip(z['rough'] + (0.5 - pat) * 0.14, 0.08, 0.98)
        metal[y0:y1, x0:x1] = z.get('metal', 0.0)
        ao[y0:y1, x0:x1] = np.clip(0.84 + 0.16 * pat, 0.65, 1.0)
        if z.get('emissive'):
            glow = np.array(z['emissive'], dtype=np.float32)
            emissive[y0:y1, x0:x1, :3] = glow[None, None, :] * (0.65 + 0.55 * pat[..., None])

    gy, gx = np.gradient(height * 4.5)
    nx, ny = -gx, -gy
    nz = np.ones_like(nx)
    nlen = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
    nrm = np.ones((h, w, 4), dtype=np.float32)
    nrm[..., 0] = (nx / nlen) * 0.5 + 0.5
    nrm[..., 1] = (-ny / nlen) * 0.5 + 0.5
    nrm[..., 2] = (nz / nlen) * 0.5 + 0.5

    orm = np.ones((h, w, 4), dtype=np.float32)
    orm[..., 0] = ao
    orm[..., 1] = rough
    orm[..., 2] = metal

    alb_img = _save_rgba(f'{name}_albedo', rgba)
    nrm_img = _save_rgba(f'{name}_normal', nrm)
    orm_img = _save_rgba(f'{name}_orm', orm)
    nrm_img.colorspace_settings.name = 'Non-Color'
    orm_img.colorspace_settings.name = 'Non-Color'
    emi_img = _save_rgba(f'{name}_emissive', emissive) if emissive_zone else None

    mat = build_pbr_material(
        name,
        alb_img,
        alpha=False,
        normal_image=nrm_img,
        orm_image=orm_img,
        roughness=0.72,
        metallic=0.0,
        subsurface=0.14 if any(z.get('sss') for z in zones) else 0.0,
        emissive_image=emi_img,
        emissive_strength=2.2 if emi_img is not None else 0.0,
    )
    mat['soil_uv_bounds'] = json.dumps([0.04, 0.44, 0.04, 0.44])
    return mat


def _zone_uv_bounds(quad):
    return ((0.06, 0.44, 0.06, 0.44), (0.56, 0.94, 0.06, 0.44), (0.06, 0.44, 0.56, 0.94), (0.56, 0.94, 0.56, 0.94))[quad % 4]


def _remap_new_faces_uv(bm, prev_face_count, quad):
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u1, v0, v1 = _zone_uv_bounds(quad)
    bm.faces.ensure_lookup_table()
    for f in bm.faces[prev_face_count:]:
        for loop in f.loops:
            lu, lv = loop[uv_layer].uv
            loop[uv_layer].uv = (u0 + (lu % 1.0) * (u1 - u0), v0 + (lv % 1.0) * (v1 - v0))


def _add_box(bm, center, size, quad=0, rx=0.0, ry=0.0, rz=0.0, bevel=0.015):
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    mat = Matrix.Translation(center) @ Euler((rx, ry, rz), 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    for v in tmp.verts:
        v.co = mat @ v.co
    if bevel > 0.001:
        bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=2, affect='EDGES', clamp_overlap=True)
    tmp.normal_update()
    u0, u1, v0, v1 = _zone_uv_bounds(quad)
    v_map = {v: bm.verts.new(v.co) for v in tmp.verts}
    for tf in tmp.faces:
        n = tf.normal
        ax = 0 if abs(n.x) > abs(n.y) and abs(n.x) > abs(n.z) else (1 if abs(n.y) > abs(n.z) else 2)
        nf = bm.faces.new(tuple(v_map[v] for v in tf.verts))
        nf.smooth = False
        for loop in nf.loops:
            p = loop.vert.co
            uu, vv = ((p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y))
            loop[uv_layer].uv = (u0 + ((uu * 0.65) % 1.0) * (u1 - u0), v0 + ((vv * 0.65) % 1.0) * (v1 - v0))
    tmp.free()


def _add_tube(bm, pts, r0, r1, sides=10, quad=0, flute_amp=0.04, flute_freq=4):
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    prev = len(bm.faces)
    vpts = [Vector(p) for p in pts]
    radii = [r0 + (r1 - r0) * (i / max(1, len(vpts) - 1)) for i in range(len(vpts))]
    tube(
        bm,
        uv_layer,
        vpts,
        radii,
        sides=sides,
        cap_end=True,
        flute_count=flute_freq,
        flute_depth=flute_amp,
    )
    _remap_new_faces_uv(bm, prev, quad)


def _add_rock(bm, center, scale, quad=0, subdiv=3, seed=1):
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    prev = len(bm.faces)
    rock_chunk(bm, uv_layer, Vector(center), scale, subdivisions=subdiv, rng=random.Random(seed))
    _remap_new_faces_uv(bm, prev, quad)


def _add_dome(bm, center, radius, height, quad=2, seed=1, sides=16, flare=0.18):
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    prev = len(bm.faces)
    mushroom_dome(bm, uv_layer, Vector(center), radius, height, sides=sides)
    _remap_new_faces_uv(bm, prev, quad)


def _add_prism_pillar(bm, base, radius, height, sides=6, quad=1, seed=1, twist=0.15, tilt=(0, 0)):
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    prev = len(bm.faces)
    pts = [
        Vector((base[0], base[1], base[2])),
        Vector((base[0] + tilt[0] * 0.5, base[1] + tilt[1] * 0.5, base[2] + height * 0.55)),
        Vector((base[0] + tilt[0], base[1] + tilt[1], base[2] + height)),
    ]
    tube(
        bm,
        uv_layer,
        pts,
        [radius, radius * 0.82, radius * 0.14],
        sides=sides,
        cap_end=True,
        flute_count=sides,
        flute_depth=0.05,
    )
    _remap_new_faces_uv(bm, prev, quad)


# ---------------------------------------------------------------------------
# 1. MINE (5 props)
# ---------------------------------------------------------------------------
def build_mine_ore_hopper_chute():
    bm = bmesh.new()
    for sx in (-0.65, 0.65):
        for sy in (-0.52, 0.52):
            _add_tube(bm, [(sx, sy, -0.05), (sx * 0.92, sy * 0.9, 1.52)], 0.11, 0.095, 10, quad=1)
        # Side X-braces and longitudinal sills
        _add_tube(bm, [(sx, -0.50, 0.18), (sx * 0.94, 0.48, 1.24)], 0.055, 0.055, 8, quad=1)
        _add_tube(bm, [(sx, 0.50, 0.18), (sx * 0.94, -0.48, 1.24)], 0.055, 0.055, 8, quad=1)
        _add_box(bm, (sx * 0.95, 0, 0.42), (0.11, 1.12, 0.11), quad=1, bevel=0.015)
    _add_box(bm, (0, 0.48, 0.55), (1.34, 0.11, 0.11), quad=1, bevel=0.015)
    # Upper hopper funnel collar & steel rim
    _add_box(bm, (0, 0, 1.56), (1.58, 1.32, 0.18), quad=1, bevel=0.025)
    for px, pry in ((-0.74, -0.42), (0.74, 0.42)):
        _add_box(bm, (px, 0, 1.84), (0.12, 1.36, 0.52), quad=2, ry=pry, bevel=0.02)
    for py, prx in ((-0.62, 0.42), (0.62, -0.42)):
        _add_box(bm, (0, py, 1.84), (1.56, 0.12, 0.52), quad=2, rx=prx, bevel=0.02)
    # Angled discharge chute, side cheek plates & iron gate lever
    _add_box(bm, (0, -0.22, 1.12), (1.28, 1.46, 0.14), quad=2, rx=0.42, bevel=0.02)
    for cx in (-0.62, 0.62):
        _add_box(bm, (cx, -0.26, 1.24), (0.10, 1.44, 0.24), quad=1, rx=0.42, bevel=0.015)
    _add_tube(bm, [(0.74, -0.24, 1.32), (0.98, -0.46, 1.72)], 0.032, 0.028, 8, quad=2)
    _add_box(bm, (0.98, -0.46, 1.74), (0.12, 0.16, 0.12), quad=3, bevel=0.015)
    for bx in (-0.34, 0.0, 0.32):
        _add_rock(bm, (bx, -0.58, 0.34), (0.34, 0.28, 0.24), quad=0, seed=11 + int(bx * 10))
    _add_rock(bm, (0.05, -0.05, 1.66), (0.56, 0.46, 0.28), quad=3, seed=21)
    _add_rock(bm, (-0.18, -0.55, 0.92), (0.28, 0.24, 0.18), quad=3, seed=22)
    return bm


def build_mine_dewatering_pump_rig():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.12), (1.36, 0.92, 0.24), quad=1, bevel=0.025)
    # A-frame fulcrum stanchions straddling walking beam & pivot axle
    for fy in (-0.28, 0.28):
        _add_tube(bm, [(-0.56, fy, 0.20), (-0.18, fy * 0.65, 1.94)], 0.075, 0.06, 8, quad=1)
        _add_tube(bm, [(0.24, fy, 0.20), (-0.18, fy * 0.65, 1.94)], 0.075, 0.06, 8, quad=1)
    _add_tube(bm, [(-0.18, -0.32, 1.94), (-0.18, 0.32, 1.94)], 0.055, 0.055, 10, quad=2)
    # Main pump barrel, iron collar bands & spout trough
    _add_tube(bm, [(-0.22, 0, 0.2), (-0.22, 0, 1.85)], 0.16, 0.14, 14, quad=2, flute_amp=0.02)
    for bz in (0.62, 1.18, 1.65):
        _add_tube(bm, [(-0.22, 0, bz), (-0.22, 0, bz + 0.08)], 0.185, 0.185, 14, quad=2)
    _add_tube(bm, [(-0.22, 0, 1.75), (0.45, 0.05, 1.58), (0.58, 0.15, 0.85)], 0.08, 0.075, 12, quad=2)
    # Walking beam & tail counterweight block
    _add_box(bm, (-0.18, 0, 1.98), (1.85, 0.14, 0.16), quad=1, ry=0.14, bevel=0.02)
    _add_box(bm, (-0.98, 0, 2.06), (0.28, 0.28, 0.30), quad=2, ry=0.14, bevel=0.025)
    _add_tube(bm, [(0.62, 0, 0.24), (0.62, 0, 1.75)], 0.04, 0.04, 10, quad=2)
    # Slatted drainage grate around sump splash apron
    for gx in range(-2, 3):
        _add_box(bm, (0.55 + gx * 0.12, 0.15, 0.26), (0.05, 0.68, 0.04), quad=1, bevel=0.008)
    _add_rock(bm, (0.55, 0.15, 0.22), (0.44, 0.42, 0.14), quad=0, seed=31)
    return bm


def build_mine_powder_magazine_locker():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.56), (1.18, 0.84, 1.05), quad=1, bevel=0.03)
    for hz in (0.28, 0.62, 0.95):
        _add_box(bm, (0, 0, hz), (1.24, 0.88, 0.07), quad=2, bevel=0.01)
    # Pitched protective roof planks + iron ridge flashing + corner straps
    _add_box(bm, (0, -0.24, 1.18), (1.36, 0.56, 0.08), quad=1, rx=0.28, bevel=0.015)
    _add_box(bm, (0, 0.24, 1.18), (1.36, 0.56, 0.08), quad=1, rx=-0.28, bevel=0.015)
    _add_box(bm, (0, 0, 1.28), (1.40, 0.16, 0.08), quad=2, bevel=0.015)
    _add_box(bm, (0, -0.44, 0.56), (0.22, 0.08, 0.28), quad=2, bevel=0.015)
    _add_box(bm, (0, -0.49, 0.50), (0.14, 0.06, 0.18), quad=3, bevel=0.015)
    for k, ox in enumerate((-0.44, 0.44)):
        _add_tube(bm, [(ox, 0.48, -0.02), (ox, 0.48, 0.72)], 0.2, 0.19, 12, quad=1)
        for sz in (0.14, 0.36, 0.58):
            _add_tube(bm, [(ox, 0.48, sz), (ox, 0.48, sz + 0.05)], 0.215, 0.215, 12, quad=2)
        _add_box(bm, (ox, 0.48, 0.35), (0.42, 0.42, 0.05), quad=2)
    _add_box(bm, (-0.28, -0.22, 1.24), (0.32, 0.24, 0.22), quad=3, rz=0.35, bevel=0.02)
    return bm


def build_mine_rail_turntable_switch():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.08), (1.68, 1.68, 0.14), quad=0, bevel=0.03)
    _add_tube(bm, [(0, 0, 0.06), (0, 0, 0.24)], 0.72, 0.68, 24, quad=2, flute_amp=0.01)
    # Radial spider brace ribs + rim locking dogs around rotating plate
    for sk in range(6):
        sa = sk * (math.pi / 3.0)
        _add_box(bm, (0.34 * math.cos(sa), 0.34 * math.sin(sa), 0.22), (0.66, 0.06, 0.06), quad=1, rz=sa, bevel=0.01)
        _add_box(bm, (0.74 * math.cos(sa), 0.74 * math.sin(sa), 0.20), (0.12, 0.12, 0.10), quad=2, rz=sa, bevel=0.01)
    for ry in (-0.42, 0.42):
        _add_box(bm, (0, ry, 0.27), (1.65, 0.08, 0.08), quad=2, bevel=0.01)
        _add_box(bm, (ry, 0, 0.27), (0.08, 1.65, 0.08), quad=2, bevel=0.01)
    # Braced throw-lever switch stand & weighted counterweight arm
    _add_box(bm, (0.86, 0.62, 0.16), (0.32, 0.32, 0.14), quad=2, bevel=0.02)
    _add_tube(bm, [(0.86, 0.62, 0.18), (0.86, 0.62, 1.25)], 0.05, 0.04, 10, quad=2)
    _add_tube(bm, [(0.86, 0.62, 0.34), (0.58, 0.42, 0.22)], 0.025, 0.025, 8, quad=2)
    _add_tube(bm, [(0.86, 0.62, 0.78), (1.16, 0.86, 1.06)], 0.028, 0.024, 8, quad=2)
    _add_rock(bm, (1.16, 0.86, 1.08), (0.10, 0.10, 0.10), quad=2, seed=39)
    _add_box(bm, (0.86, 0.62, 1.22), (0.22, 0.22, 0.26), quad=3, bevel=0.02)
    return bm


def build_mine_assaying_brazier_cart():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.56), (1.34, 0.78, 0.54), quad=1, bevel=0.025)
    # Steel corner trim, axles, wheel hubs & U-push handle bars
    _add_box(bm, (0, 0, 0.84), (1.38, 0.82, 0.06), quad=2, bevel=0.01)
    for wx in (-0.46, 0.46):
        _add_tube(bm, [(wx, -0.52, 0.22), (wx, 0.52, 0.22)], 0.045, 0.045, 8, quad=2)
        for wy in (-0.44, 0.44):
            _add_tube(bm, [(wx, wy - 0.04, 0.22), (wx, wy + 0.04, 0.22)], 0.22, 0.22, 16, quad=2)
            _add_tube(bm, [(wx, wy - 0.06, 0.22), (wx, wy + 0.06, 0.22)], 0.08, 0.08, 10, quad=1)
    for hy in (-0.32, 0.32):
        _add_tube(bm, [(0.62, hy, 0.72), (0.98, hy, 0.92)], 0.03, 0.028, 8, quad=2)
    _add_tube(bm, [(0.98, -0.32, 0.92), (0.98, 0.32, 0.92)], 0.03, 0.03, 8, quad=1)
    _add_tube(bm, [(-0.22, 0, 0.8), (-0.22, 0, 1.05)], 0.24, 0.34, 16, quad=2)
    # Cast ingot bars & crucible tongs on workbench deck
    for iz, ox, oy in ((0.88, 0.32, -0.18), (0.88, 0.34, 0.02), (0.94, 0.33, -0.08)):
        _add_box(bm, (ox, oy, iz), (0.24, 0.11, 0.07), quad=3, bevel=0.01)
    _add_tube(bm, [(0.10, 0.24, 0.86), (0.52, 0.28, 0.86)], 0.018, 0.015, 6, quad=2)
    _add_rock(bm, (-0.22, 0, 1.02), (0.26, 0.26, 0.16), quad=3, seed=41)
    _add_rock(bm, (0.34, 0.18, 0.92), (0.18, 0.16, 0.14), quad=0, seed=42)
    return bm


# ---------------------------------------------------------------------------
# 2. UMBRA CAVERN (5 props)
# ---------------------------------------------------------------------------
def build_umbra_veil_fungus_parasol():
    bm = bmesh.new()
    _add_tube(bm, [(0, 0, -0.05), (0.12, 0.08, 1.2), (-0.05, -0.06, 2.55)], 0.26, 0.14, 16, quad=1, flute_amp=0.05)
    _add_dome(bm, (-0.05, -0.06, 2.52), 1.35, 0.62, quad=2, seed=51, sides=24, flare=0.22)
    _add_dome(bm, (0.58, 0.42, 0.95), 0.48, 0.26, quad=2, seed=52, sides=16)
    _add_tube(bm, [(0.22, 0.18, 0.02), (0.58, 0.42, 0.94)], 0.12, 0.08, 10, quad=1)
    _add_rock(bm, (0, 0, 0.12), (0.85, 0.78, 0.22), quad=0, seed=53)
    return bm


def build_umbra_crystal_resonator_obelisk():
    bm = bmesh.new()
    _add_tube(bm, [(0, 0, -0.04), (0, 0, 0.38)], 0.68, 0.56, 8, quad=0)
    _add_prism_pillar(bm, (0, 0, 0.34), 0.34, 2.45, sides=6, quad=1, seed=61)
    for k in range(5):
        a = k * (2 * math.pi / 5) + 0.3
        _add_prism_pillar(bm, (0.34 * math.cos(a), 0.34 * math.sin(a), 0.24), 0.16, 1.15 + (k % 2) * 0.35,
                          sides=6, quad=3, tilt=(0.24 * math.cos(a), 0.24 * math.sin(a)))
    return bm


def build_umbra_hanging_censer_spire():
    bm = bmesh.new()
    _add_tube(bm, [(0, 0, -0.04), (0, 0, 0.42)], 0.42, 0.34, 8, quad=0)
    # 4 gothic buttress ribs bracing plinth to spire shaft
    for bi in range(4):
        ba = bi * (math.pi * 0.5)
        _add_tube(bm, [(0.36 * math.cos(ba), 0.36 * math.sin(ba), 0.16), (0.08 * math.cos(ba), 0.08 * math.sin(ba), 1.05)], 0.055, 0.04, 8, quad=1)
    _add_tube(bm, [(0, 0, 0.42), (0.04, 0, 2.48)], 0.09, 0.06, 10, quad=1)
    _add_tube(bm, [(0.04, 0, 2.2), (0.68, 0, 2.65)], 0.06, 0.045, 8, quad=1)
    # Curved cantilevered knee-brace under hook arm + filigree finial tip
    _add_tube(bm, [(0.04, 0, 1.72), (0.34, 0, 2.18), (0.52, 0, 2.48)], 0.042, 0.032, 8, quad=2)
    _add_prism_pillar(bm, (0.04, 0, 2.45), 0.065, 0.32, sides=6, quad=2, seed=69)
    # Chain link beads descending from hook
    for cz in (2.52, 2.38, 2.24, 2.10):
        _add_tube(bm, [(0.68, 0, cz), (0.68, 0, cz - 0.11)], 0.028, 0.028, 6, quad=2)
    _add_tube(bm, [(0.68, 0, 1.62), (0.68, 0, 2.05)], 0.2, 0.14, 12, quad=3)
    for ring_z, ring_r in ((1.72, 0.215), (1.92, 0.185)):
        _add_tube(bm, [(0.68, 0, ring_z), (0.68, 0, ring_z + 0.045)], ring_r, ring_r, 12, quad=2)
    _add_rock(bm, (0.68, 0, 1.98), (0.14, 0.14, 0.10), quad=3, seed=68)
    return bm


def build_umbra_spider_web_balustrade_shrine():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.18), (1.36, 1.36, 0.36), quad=0, bevel=0.04)
    for px, py in ((-0.46, -0.46), (0.46, -0.46), (-0.46, 0.46), (0.46, 0.46)):
        _add_tube(bm, [(px, py, 0.32), (px, py, 1.85)], 0.11, 0.09, 8, quad=1)
        _add_prism_pillar(bm, (px, py, 2.02), 0.09, 0.34, sides=6, quad=2, seed=72)
    # Low perimeter balustrade rail & webbed upper transom bars
    for side_y in (-0.46, 0.46):
        _add_box(bm, (0, side_y, 0.68), (0.94, 0.07, 0.08), quad=1, bevel=0.01)
        _add_box(bm, (side_y, 0, 0.68), (0.07, 0.94, 0.08), quad=1, bevel=0.01)
    for sx in (-0.28, 0.28):
        _add_tube(bm, [(sx, -0.46, 0.36), (sx, -0.46, 0.68)], 0.032, 0.032, 6, quad=1)
        _add_tube(bm, [(sx, 0.46, 0.36), (sx, 0.46, 0.68)], 0.032, 0.032, 6, quad=1)
    # Central pedestal altar + offering basin inside canopy
    _add_tube(bm, [(0, 0, 0.34), (0, 0, 0.88)], 0.22, 0.16, 8, quad=0)
    _add_tube(bm, [(0, 0, 0.86), (0, 0, 1.04)], 0.18, 0.28, 10, quad=2)
    _add_rock(bm, (0, 0, 1.04), (0.19, 0.19, 0.10), quad=3, seed=73)
    _add_box(bm, (0, 0, 1.92), (1.28, 1.28, 0.22), quad=0, bevel=0.03)
    _add_dome(bm, (0, 0, 2.04), 0.48, 0.35, quad=3, seed=71)
    return bm


def build_umbra_tide_gondola_skiff():
    bm = bmesh.new()
    pts = [(-1.6, 0, 0.42), (-0.95, 0, 0.14), (0, 0, 0.10), (0.95, 0, 0.14), (1.6, 0, 0.48)]
    _add_tube(bm, pts, 0.12, 0.14, 12, quad=1, flute_amp=0.03)
    _add_box(bm, (0, 0, 0.28), (2.25, 0.88, 0.24), quad=1, bevel=0.04)
    for sx in (-0.55, 0.0, 0.55):
        _add_box(bm, (sx, 0, 0.44), (0.24, 0.84, 0.06), quad=2, bevel=0.01)
    _add_tube(bm, [(1.35, 0, 0.45), (1.62, 0, 1.15)], 0.05, 0.03, 8, quad=2)
    _add_rock(bm, (1.62, 0, 1.16), (0.14, 0.14, 0.16), quad=3, seed=77)
    return bm


# ---------------------------------------------------------------------------
# 3. STONEHOLD HOLD (5 props)
# ---------------------------------------------------------------------------
def build_stonehold_drop_hammer_forge_press():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.24), (1.42, 1.18, 0.48), quad=0, bevel=0.04)
    for sx in (-0.52, 0.52):
        _add_box(bm, (sx, 0, 1.45), (0.26, 0.38, 2.15), quad=0, bevel=0.03)
    _add_box(bm, (0, 0, 2.52), (1.48, 0.52, 0.32), quad=2, bevel=0.03)
    _add_box(bm, (0, 0, 0.68), (0.58, 0.42, 0.42), quad=1, bevel=0.03)
    _add_box(bm, (0, 0, 1.62), (0.48, 0.44, 0.52), quad=2, bevel=0.03)
    _add_rock(bm, (-0.1, -0.35, 0.62), (0.26, 0.24, 0.18), quad=3, seed=81)
    return bm


def build_stonehold_runic_brazier_pedestal():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.22), (1.12, 1.12, 0.44), quad=0, bevel=0.04)
    _add_tube(bm, [(0, 0, 0.44), (0, 0, 1.18)], 0.34, 0.28, 8, quad=0)
    _add_tube(bm, [(0, 0, 1.18), (0, 0, 1.52)], 0.36, 0.54, 10, quad=2)
    _add_rock(bm, (0, 0, 1.56), (0.38, 0.38, 0.22), quad=3, seed=85)
    return bm


def build_stonehold_geared_capstan_winch():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.16), (1.28, 1.28, 0.32), quad=0, bevel=0.04)
    _add_tube(bm, [(0, 0, 0.32), (0, 0, 1.38)], 0.32, 0.28, 16, quad=1, flute_amp=0.02, flute_freq=8)
    _add_tube(bm, [(0, 0, 0.52), (0, 0, 0.64)], 0.56, 0.56, 18, quad=2, flute_amp=0.06, flute_freq=12)
    _add_box(bm, (0, 0, 1.22), (1.45, 0.12, 0.12), quad=1, bevel=0.015)
    _add_box(bm, (0, 0, 1.22), (0.12, 1.45, 0.12), quad=1, bevel=0.015)
    return bm


def build_stonehold_ancestor_relief_stele():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.2), (1.36, 0.88, 0.4), quad=0, bevel=0.04)
    _add_box(bm, (0, 0, 1.38), (0.98, 0.46, 1.98), quad=0, bevel=0.04)
    _add_box(bm, (0, -0.22, 1.42), (0.64, 0.12, 1.15), quad=3, bevel=0.02)
    _add_box(bm, (0, 0, 2.44), (1.12, 0.54, 0.24), quad=2, bevel=0.03)
    return bm


def build_stonehold_ingot_crane_trolley():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.18), (1.26, 0.96, 0.36), quad=0, bevel=0.04)
    _add_tube(bm, [(-0.26, 0, 0.34), (-0.26, 0, 2.28)], 0.14, 0.12, 12, quad=2)
    # Heavy diagonal knee brace + rolling trolley carriage + geared hand-wheel winch
    _add_tube(bm, [(-0.24, 0, 1.28), (0.52, 0, 2.15)], 0.075, 0.065, 8, quad=2)
    _add_box(bm, (0.36, 0, 2.18), (1.36, 0.16, 0.18), quad=2, bevel=0.02)
    _add_box(bm, (0.88, 0, 2.18), (0.28, 0.28, 0.26), quad=2, bevel=0.02)
    _add_tube(bm, [(-0.26, -0.22, 1.05), (-0.26, 0.22, 1.05)], 0.18, 0.18, 14, quad=2, flute_amp=0.04, flute_freq=10)
    _add_tube(bm, [(-0.18, -0.20, 1.18), (0.94, 0, 2.28)], 0.018, 0.018, 6, quad=1)
    # Dual sling chains carrying molten-topped crucible cauldron
    _add_tube(bm, [(0.88, 0, 2.10), (0.88, 0, 1.54)], 0.028, 0.028, 8, quad=2)
    for vy in (-0.18, 0.18):
        _add_tube(bm, [(0.88, 0, 1.54), (0.88, vy, 1.16)], 0.022, 0.020, 6, quad=2)
    _add_box(bm, (0.88, 0, 1.04), (0.48, 0.36, 0.24), quad=1, bevel=0.025)
    _add_rock(bm, (0.88, 0, 1.16), (0.18, 0.13, 0.06), quad=3, seed=89)
    return bm


# ---------------------------------------------------------------------------
# 4. FROSTGARD GLACIER CAVE (5 props)
# ---------------------------------------------------------------------------
def build_frostgard_organ_pipe_ice_formation():
    bm = bmesh.new()
    _add_rock(bm, (0, 0, 0.15), (1.15, 1.05, 0.32), quad=0, seed=91)
    pipes = [(0, 0, 3.2, 0.26), (-0.4, 0.22, 2.6, 0.19), (0.42, 0.18, 2.75, 0.2), (-0.28, -0.34, 2.25, 0.17), (0.3, -0.32, 2.4, 0.18)]
    for idx, (dx, dy, h, r) in enumerate(pipes):
        _add_prism_pillar(bm, (dx, dy, 0.12), r, h, sides=8, quad=1 if idx % 2 == 0 else 2, seed=92 + idx)
    return bm


def build_frostgard_hoarfrost_rose_cluster():
    bm = bmesh.new()
    _add_rock(bm, (0, 0, 0.14), (0.92, 0.88, 0.28), quad=0, seed=101)
    for i in range(9):
        a = (i / 9.0) * math.pi * 2
        tilt = (math.cos(a) * (0.45 + (i % 3) * 0.18), math.sin(a) * (0.45 + (i % 3) * 0.18))
        _add_prism_pillar(bm, (math.cos(a) * 0.18, math.sin(a) * 0.18, 0.12), 0.16, 1.05 + (i % 3) * 0.28,
                          sides=6, quad=1, seed=102 + i, tilt=tilt)
    return bm


def build_frostgard_frozen_melt_mushroom_column():
    bm = bmesh.new()
    _add_tube(bm, [(0, 0, -0.05), (0, 0, 1.28), (0, 0, 2.65)], 0.56, 0.26, 14, quad=1, flute_amp=0.05, flute_freq=6)
    _add_dome(bm, (0, 0, 2.55), 1.18, 0.45, quad=2, seed=111, sides=20, flare=0.16)
    _add_rock(bm, (0, 0, 0.08), (0.85, 0.85, 0.2), quad=0, seed=112)
    return bm


def build_frostgard_bone_mooring_anchor():
    bm = bmesh.new()
    for i in range(6):
        a = (i / 6.0) * math.pi * 2
        _add_rock(bm, (0.36 * math.cos(a), 0.36 * math.sin(a), 0.16), (0.36, 0.3, 0.26), quad=0, seed=120 + i)
    _add_tube(bm, [(-0.22, 0, 0), (0.24, 0, 1.24)], 0.09, 0.075, 10, quad=2)
    _add_tube(bm, [(0.26, 0, 0), (-0.2, 0, 1.14)], 0.085, 0.07, 10, quad=2)
    _add_tube(bm, [(0, -0.2, 0.56), (0, 0.22, 0.6)], 0.2, 0.18, 12, quad=1)
    return bm


def build_frostgard_runic_ice_lantern_shrine():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.2), (1.12, 1.12, 0.4), quad=0, bevel=0.04)
    for sx in (-0.36, 0.36):
        _add_box(bm, (sx, 0, 0.84), (0.22, 0.72, 0.84), quad=1, bevel=0.03)
    _add_box(bm, (0, 0, 1.4), (0.94, 0.86, 0.26), quad=1, bevel=0.03)
    _add_box(bm, (0, 0, 1.6), (1.04, 0.94, 0.14), quad=2, bevel=0.025)
    _add_rock(bm, (0, 0, 0.62), (0.2, 0.2, 0.2), quad=3, seed=131)
    return bm


# ---------------------------------------------------------------------------
# 5. FROSTGARD GLACIER FRONT (5 props)
# ---------------------------------------------------------------------------
def build_frostgard_serac_fin_monolith():
    bm = bmesh.new()
    _add_rock(bm, (0, 0, 0.18), (1.42, 1.12, 0.36), quad=2, seed=141)
    _add_prism_pillar(bm, (0, 0, 0.08), 0.78, 3.4, sides=6, quad=1, seed=142, tilt=(0.55, -0.18))
    _add_prism_pillar(bm, (-0.58, 0.18, 0.08), 0.46, 2.05, sides=6, quad=1, seed=143, tilt=(0.24, -0.08))
    return bm


def build_frostgard_glacial_wayfinder_cairn():
    bm = bmesh.new()
    _add_rock(bm, (0, 0, 0.24), (0.92, 0.86, 0.42), quad=0, seed=151)
    _add_rock(bm, (0, 0, 0.78), (0.68, 0.64, 0.38), quad=0, seed=152)
    _add_rock(bm, (0, 0, 1.24), (0.48, 0.46, 0.22), quad=2, seed=153)
    _add_tube(bm, [(0, 0, 1.2), (0.08, 0, 2.88)], 0.06, 0.045, 8, quad=1)
    _add_box(bm, (0.48, 0.08, 2.58), (0.76, 0.04, 0.36), quad=3, ry=0.14, bevel=0.01)
    return bm


def build_frostgard_ice_sawyer_trestle():
    bm = bmesh.new()
    for sx in (-0.68, 0.68):
        _add_tube(bm, [(sx, -0.42, -0.04), (sx, 0, 0.92)], 0.065, 0.055, 8, quad=1)
        _add_tube(bm, [(sx, 0.42, -0.04), (sx, 0, 0.92)], 0.065, 0.055, 8, quad=1)
    _add_tube(bm, [(-0.85, 0, 0.88), (0.85, 0, 0.88)], 0.075, 0.075, 10, quad=1)
    _add_box(bm, (0, 0, 1.18), (1.08, 0.64, 0.52), quad=2, bevel=0.04)
    _add_box(bm, (0, 0, 1.48), (1.42, 0.05, 0.09), quad=3, bevel=0.008)
    return bm


def build_frostgard_frost_banner_standards():
    bm = bmesh.new()
    _add_tube(bm, [(-0.48, 0, -0.05), (0.26, 0.1, 2.68)], 0.065, 0.045, 8, quad=1)
    _add_tube(bm, [(0.48, 0, -0.05), (-0.26, -0.1, 2.58)], 0.065, 0.045, 8, quad=1)
    _add_box(bm, (0, 0.02, 1.22), (0.92, 0.08, 0.3), quad=1, bevel=0.02)
    _add_box(bm, (0.62, 0.14, 2.34), (0.76, 0.04, 0.4), quad=3, bevel=0.01)
    _add_box(bm, (-0.58, -0.14, 2.28), (0.68, 0.04, 0.34), quad=2, bevel=0.01)
    return bm


def build_frostgard_moraine_erratic_anchor_post():
    bm = bmesh.new()
    _add_rock(bm, (0, 0, 0.34), (1.22, 1.08, 0.56), quad=0, seed=161)
    _add_tube(bm, [(0, 0, 0.64), (0, 0, 1.46)], 0.25, 0.22, 14, quad=2)
    _add_box(bm, (0, 0, 1.32), (1.34, 0.1, 0.1), quad=1, bevel=0.015)
    _add_box(bm, (0, 0, 1.32), (0.1, 1.34, 0.1), quad=1, bevel=0.015)
    return bm


# ---------------------------------------------------------------------------
# 6. FROSTGARD HOLD (5 props)
# ---------------------------------------------------------------------------
def build_frostgard_wolf_totem_palisade_post():
    bm = bmesh.new()
    _add_rock(bm, (0, 0, 0.12), (0.76, 0.72, 0.24), quad=0, seed=171)
    _add_tube(bm, [(0, 0, 0.2), (0, 0, 2.68)], 0.16, 0.13, 12, quad=1)
    # Iron binding bands, carved shield buckler & wolf head crest (snout + brow + fangs)
    for bz in (0.95, 1.98):
        _add_tube(bm, [(0, 0, bz), (0, 0, bz + 0.07)], 0.17, 0.17, 12, quad=2)
    _add_tube(bm, [(0, -0.14, 1.18), (0, -0.22, 1.18)], 0.28, 0.28, 14, quad=2)
    _add_box(bm, (0, 0.16, 2.48), (0.4, 0.58, 0.34), quad=2, bevel=0.03)
    _add_box(bm, (0, 0.42, 2.42), (0.24, 0.24, 0.20), quad=2, bevel=0.025)
    for sx in (-1, 1):
        _add_tube(bm, [(sx * 0.18, 0.06, 2.6), (sx * 0.44, -0.06, 3.04)], 0.055, 0.016, 8, quad=2)
        _add_tube(bm, [(sx * 0.09, 0.48, 2.34), (sx * 0.09, 0.48, 2.22)], 0.025, 0.006, 6, quad=3)
    # Wrought-iron sconce arm & brazier basket physically holding the ember stone
    _add_tube(bm, [(0, 0.04, 1.38), (0.20, 0.14, 1.50), (0.30, 0.22, 1.66)], 0.042, 0.032, 8, quad=2)
    _add_tube(bm, [(0.30, 0.22, 1.62), (0.30, 0.22, 1.78)], 0.12, 0.20, 10, quad=2)
    _add_rock(bm, (0.3, 0.22, 1.80), (0.18, 0.18, 0.16), quad=3, seed=172)
    return bm


def build_frostgard_cut_ice_block_hoist():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.08), (1.42, 1.32, 0.16), quad=0, bevel=0.03)
    pts_base = []
    for i in range(3):
        a = (i / 3.0) * math.pi * 2
        bp = (1.08 * math.cos(a), 1.08 * math.sin(a), -0.04)
        pts_base.append(bp)
        _add_tube(bm, [bp, (0, 0, 2.58)], 0.085, 0.065, 10, quad=1)
    # Tripod horizontal spreader rails + hand windlass winch drum
    for i in range(3):
        p_a = pts_base[i]
        p_b = pts_base[(i + 1) % 3]
        _add_tube(bm, [(p_a[0] * 0.58, p_a[1] * 0.58, 1.08), (p_b[0] * 0.58, p_b[1] * 0.58, 1.08)], 0.045, 0.045, 8, quad=1)
    _add_tube(bm, [(-0.45, 0.18, 1.58), (0.45, 0.18, 1.58)], 0.075, 0.075, 10, quad=2, flute_amp=0.015)
    _add_tube(bm, [(0.45, 0.18, 1.58), (0.58, 0.18, 1.40)], 0.025, 0.025, 6, quad=2)
    _add_tube(bm, [(0, 0, 1.28), (0, 0, 2.52)], 0.03, 0.03, 8, quad=3)
    # Iron ice-tongs gripping sides of lifted glacial block
    for sx in (-1, 1):
        _add_tube(bm, [(0, 0, 1.48), (sx * 0.40, 0, 1.18), (sx * 0.38, 0, 0.92)], 0.028, 0.024, 6, quad=1)
    _add_box(bm, (0, 0, 0.98), (0.74, 0.72, 0.56), quad=2, bevel=0.035)
    return bm


def build_frostgard_mead_hall_trophy_stand():
    bm = bmesh.new()
    for sx in (-0.68, 0.68):
        _add_box(bm, (sx, 0, 0.38), (0.16, 0.76, 0.76), quad=1, bevel=0.025)
    _add_box(bm, (0, 0, 0.32), (1.36, 0.16, 0.12), quad=1, bevel=0.02)
    _add_box(bm, (0, 0, 0.82), (1.82, 0.84, 0.12), quad=1, bevel=0.025)
    # Mounted trophy horn rack + bossed shield & carved crest plaques
    for tx in (-0.5, 0.0, 0.52):
        _add_tube(bm, [(tx, 0.12, 0.88), (tx, 0.12, 1.18)], 0.075, 0.065, 10, quad=2)
        for horn_s in (-1, 1):
            _add_tube(bm, [(tx, 0.12, 1.14), (tx + horn_s * 0.18, 0.06, 1.38), (tx + horn_s * 0.24, -0.02, 1.56)], 0.042, 0.012, 8, quad=3)
    _add_tube(bm, [(0.24, -0.14, 0.88), (0.24, -0.14, 1.24)], 0.2, 0.18, 12, quad=3)
    _add_tube(bm, [(-0.46, -0.44, 0.56), (-0.46, -0.52, 0.56)], 0.26, 0.24, 14, quad=2)
    _add_dome(bm, (-0.46, -0.52, 0.56), 0.10, 0.08, quad=3, seed=176, sides=10)
    return bm


def build_frostgard_salt_brine_cask_frame():
    bm = bmesh.new()
    for sx in (-0.72, 0.72):
        for sy in (-0.4, 0.4):
            _add_tube(bm, [(sx, sy, -0.04), (sx, sy, 1.65)], 0.09, 0.085, 10, quad=1)
        _add_tube(bm, [(sx, -0.42, 0.12), (sx, 0.42, 1.52)], 0.055, 0.055, 8, quad=1)
    # Bearer rails & cradle saddle chocks supporting every barrel
    for bz in (0.30, 0.88):
        _add_box(bm, (0, 0, bz), (1.62, 0.88, 0.09), quad=1, bevel=0.015)
        for cx in (-0.34, 0.34):
            for chock_dx in (-0.16, 0.16):
                _add_box(bm, (cx + chock_dx, 0, bz + 0.08), (0.08, 0.68, 0.10), quad=2, bevel=0.01)
    _add_box(bm, (0, 0, 1.7), (1.84, 1.12, 0.14), quad=2, bevel=0.03)
    _add_box(bm, (0, -0.52, 0.12), (1.36, 0.24, 0.08), quad=0, bevel=0.015)
    for cx in (-0.34, 0.34):
        for cz in (0.54, 1.12):
            _add_tube(bm, [(cx, -0.34, cz), (cx, 0.34, cz)], 0.235, 0.235, 14, quad=1)
            for hy in (-0.26, 0.0, 0.26):
                _add_tube(bm, [(cx, hy - 0.03, cz), (cx, hy + 0.03, cz)], 0.252, 0.252, 14, quad=2)
            _add_tube(bm, [(cx, -0.34, cz - 0.08), (cx, -0.46, cz - 0.08)], 0.035, 0.025, 8, quad=3)
    return bm


def build_frostgard_watchman_braziers_gate():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.18), (1.78, 0.72, 0.36), quad=0, bevel=0.04)
    _add_box(bm, (0, 0, 0.66), (1.06, 0.44, 0.68), quad=1, bevel=0.025)
    # Braced overhead gate beam + iron portcullis teeth + cross-bracing
    _add_box(bm, (0, 0, 1.50), (1.58, 0.26, 0.18), quad=1, bevel=0.025)
    for px in (-0.36, -0.12, 0.12, 0.36):
        _add_tube(bm, [(px, 0, 1.44), (px, 0, 1.02)], 0.028, 0.012, 6, quad=2)
    for sx in (-0.72, 0.72):
        _add_tube(bm, [(sx, 0, 0.32), (sx, 0, 1.54)], 0.06, 0.06, 10, quad=2)
        _add_tube(bm, [(sx * 0.74, 0, 0.32), (sx, 0, 1.24)], 0.045, 0.045, 8, quad=1)
        _add_tube(bm, [(sx, 0, 1.52), (sx, 0, 1.78)], 0.12, 0.25, 12, quad=2)
        for sp in range(6):
            sa = (sp / 6.0) * math.tau
            _add_tube(bm, [(sx + 0.22 * math.cos(sa), 0.22 * math.sin(sa), 1.72), (sx + 0.26 * math.cos(sa), 0.26 * math.sin(sa), 1.94)], 0.022, 0.008, 6, quad=2)
        _add_rock(bm, (sx, 0, 1.8), (0.2, 0.2, 0.16), quad=3, seed=181 + int(sx * 10))
    return bm


AREAS = {
    'mine': (
        ('mine_ore_hopper_chute', build_mine_ore_hopper_chute),
        ('mine_dewatering_pump_rig', build_mine_dewatering_pump_rig),
        ('mine_powder_magazine_locker', build_mine_powder_magazine_locker),
        ('mine_rail_turntable_switch', build_mine_rail_turntable_switch),
        ('mine_assaying_brazier_cart', build_mine_assaying_brazier_cart),
    ),
    'umbra_cavern': (
        ('umbra_veil_fungus_parasol', build_umbra_veil_fungus_parasol),
        ('umbra_crystal_resonator_obelisk', build_umbra_crystal_resonator_obelisk),
        ('umbra_hanging_censer_spire', build_umbra_hanging_censer_spire),
        ('umbra_spider_web_balustrade_shrine', build_umbra_spider_web_balustrade_shrine),
        ('umbra_tide_gondola_skiff', build_umbra_tide_gondola_skiff),
    ),
    'stonehold_hold': (
        ('stonehold_drop_hammer_forge_press', build_stonehold_drop_hammer_forge_press),
        ('stonehold_runic_brazier_pedestal', build_stonehold_runic_brazier_pedestal),
        ('stonehold_geared_capstan_winch', build_stonehold_geared_capstan_winch),
        ('stonehold_ancestor_relief_stele', build_stonehold_ancestor_relief_stele),
        ('stonehold_ingot_crane_trolley', build_stonehold_ingot_crane_trolley),
    ),
    'frostgard_glacier_cave': (
        ('frostgard_organ_pipe_ice_formation', build_frostgard_organ_pipe_ice_formation),
        ('frostgard_hoarfrost_rose_cluster', build_frostgard_hoarfrost_rose_cluster),
        ('frostgard_frozen_melt_mushroom_column', build_frostgard_frozen_melt_mushroom_column),
        ('frostgard_bone_mooring_anchor', build_frostgard_bone_mooring_anchor),
        ('frostgard_runic_ice_lantern_shrine', build_frostgard_runic_ice_lantern_shrine),
    ),
    'frostgard_glacier_front': (
        ('frostgard_serac_fin_monolith', build_frostgard_serac_fin_monolith),
        ('frostgard_glacial_wayfinder_cairn', build_frostgard_glacial_wayfinder_cairn),
        ('frostgard_ice_sawyer_trestle', build_frostgard_ice_sawyer_trestle),
        ('frostgard_frost_banner_standards', build_frostgard_frost_banner_standards),
        ('frostgard_moraine_erratic_anchor_post', build_frostgard_moraine_erratic_anchor_post),
    ),
    'frostgard_hold': (
        ('frostgard_wolf_totem_palisade_post', build_frostgard_wolf_totem_palisade_post),
        ('frostgard_cut_ice_block_hoist', build_frostgard_cut_ice_block_hoist),
        ('frostgard_mead_hall_trophy_stand', build_frostgard_mead_hall_trophy_stand),
        ('frostgard_salt_brine_cask_frame', build_frostgard_salt_brine_cask_frame),
        ('frostgard_watchman_braziers_gate', build_frostgard_watchman_braziers_gate),
    ),
}

AREA_ZONES = {
    'mine': [
        {'col0': (0.24, 0.22, 0.19), 'col1': (0.38, 0.34, 0.28), 'rough': 0.90, 'bump': 0.95},
        {'col0': (0.28, 0.19, 0.11), 'col1': (0.44, 0.31, 0.18), 'rough': 0.80, 'grain': True},
        {'col0': (0.20, 0.21, 0.23), 'col1': (0.36, 0.34, 0.32), 'rough': 0.44, 'metal': 0.85},
        {'col0': (0.58, 0.32, 0.12), 'col1': (0.98, 0.68, 0.28), 'rough': 0.48, 'emissive': (1.0, 0.52, 0.16)},
    ],
    'umbra_cavern': [
        {'col0': (0.12, 0.13, 0.17), 'col1': (0.22, 0.24, 0.30), 'rough': 0.88, 'bump': 0.95},
        {'col0': (0.20, 0.18, 0.22), 'col1': (0.36, 0.32, 0.38), 'rough': 0.72, 'sss': True},
        {'col0': (0.26, 0.38, 0.56), 'col1': (0.48, 0.76, 0.92), 'rough': 0.46, 'sss': True, 'emissive': (0.18, 0.55, 0.82)},
        {'col0': (0.24, 0.52, 0.68), 'col1': (0.52, 0.92, 1.00), 'rough': 0.35, 'sss': True, 'emissive': (0.24, 0.86, 0.96)},
    ],
    'stonehold_hold': [
        {'col0': (0.28, 0.29, 0.32), 'col1': (0.46, 0.48, 0.52), 'rough': 0.82, 'bump': 0.88},
        {'col0': (0.24, 0.20, 0.15), 'col1': (0.38, 0.32, 0.24), 'rough': 0.68, 'grain': True},
        {'col0': (0.42, 0.31, 0.16), 'col1': (0.68, 0.52, 0.26), 'rough': 0.38, 'metal': 0.88},
        {'col0': (0.72, 0.46, 0.18), 'col1': (1.00, 0.78, 0.36), 'rough': 0.32, 'emissive': (1.0, 0.58, 0.18)},
    ],
    'frostgard_glacier_cave': [
        {'col0': (0.28, 0.32, 0.36), 'col1': (0.44, 0.48, 0.54), 'rough': 0.86, 'bump': 0.90},
        {'col0': (0.42, 0.68, 0.88), 'col1': (0.74, 0.90, 0.98), 'rough': 0.18, 'sss': True},
        {'col0': (0.72, 0.84, 0.94), 'col1': (0.94, 0.97, 1.00), 'rough': 0.42, 'sss': True},
        {'col0': (0.68, 0.44, 0.20), 'col1': (1.00, 0.74, 0.34), 'rough': 0.46, 'emissive': (1.0, 0.56, 0.18)},
    ],
    'frostgard_glacier_front': [
        {'col0': (0.26, 0.30, 0.34), 'col1': (0.44, 0.48, 0.54), 'rough': 0.88, 'bump': 0.95},
        {'col0': (0.38, 0.62, 0.84), 'col1': (0.68, 0.86, 0.96), 'rough': 0.22, 'sss': True},
        {'col0': (0.74, 0.85, 0.94), 'col1': (0.95, 0.98, 1.00), 'rough': 0.55, 'sss': True},
        {'col0': (0.56, 0.20, 0.16), 'col1': (0.78, 0.32, 0.24), 'rough': 0.78},
    ],
    'frostgard_hold': [
        {'col0': (0.28, 0.31, 0.35), 'col1': (0.44, 0.47, 0.52), 'rough': 0.86, 'bump': 0.90},
        {'col0': (0.28, 0.22, 0.16), 'col1': (0.46, 0.37, 0.27), 'rough': 0.76, 'grain': True},
        {'col0': (0.48, 0.70, 0.88), 'col1': (0.86, 0.94, 0.99), 'rough': 0.28, 'sss': True},
        {'col0': (0.68, 0.42, 0.18), 'col1': (1.00, 0.72, 0.32), 'rough': 0.45, 'emissive': (1.0, 0.54, 0.16)},
    ],
}


def build_all():
    setup_scene()
    manifest = {'version': 1, 'minTriangles': MIN_TRIANGLES, 'areas': {}}
    for area, items in AREAS.items():
        area_dir = os.path.join(OUT_ROOT, area)
        os.makedirs(area_dir, exist_ok=True)
        has_emissive = any(z.get('emissive') for z in AREA_ZONES[area])
        mat = _make_zone_atlas(f'ug_{area}', AREA_ZONES[area], seed=sum(ord(c) for c in area), emissive_zone=has_emissive)
        manifest['areas'][area] = []
        for name, builder_fn in items:
            bm = builder_fn()
            mesh, tris = finalize_understory_mesh(
                name,
                bm,
                [mat],
                min_triangles=MIN_TRIANGLES,
                max_triangles=MAX_TRIANGLES,
                add_skirt=True,
                allow_extra_material=False,
            )
            if tris < MIN_TRIANGLES:
                raise RuntimeError(f'{area}/{name} below {MIN_TRIANGLES} tris: {tris}')
            out_path = os.path.join(area_dir, f'{name}.glb')
            place_and_export(name, mesh, out_path, tangents=True)
            manifest['areas'][area].append({'name': name, 'triangles': tris, 'file': f'{area}/{name}.glb'})
            print(f'[underground/{area}] {name}: {tris} tris -> {out_path}')
    os.makedirs(OUT_ROOT, exist_ok=True)
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f'[underground] exported 30 props (all >= {MIN_TRIANGLES} tris) -> {MANIFEST_PATH}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-render', action='store_true')
    parser.parse_known_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    build_all()
