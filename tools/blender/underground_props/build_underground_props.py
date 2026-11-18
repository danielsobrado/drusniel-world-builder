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
from aaa_natural_forms import (
    crystal_cluster_formation,
    ice_formation_mesh,
    mushroom_cluster_mesh,
    planar_rock,
)

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
    flat_layer = bm.faces.layers.int.get('aaa_flat') or bm.faces.layers.int.new('aaa_flat')
    v_map = {v: bm.verts.new(v.co) for v in tmp.verts}
    for tf in tmp.faces:
        n = tf.normal
        ax = 0 if abs(n.x) > abs(n.y) and abs(n.x) > abs(n.z) else (1 if abs(n.y) > abs(n.z) else 2)
        nf = bm.faces.new(tuple(v_map[v] for v in tf.verts))
        nf.smooth = False
        nf[flat_layer] = 1
        for loop in nf.loops:
            p = loop.vert.co
            uu, vv = ((p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y))
            loop[uv_layer].uv = (u0 + ((uu * 0.65) % 1.0) * (u1 - u0), v0 + ((vv * 0.65) % 1.0) * (v1 - v0))
    tmp.free()


def _add_hollow_box(bm, center, outer_size, wall_t=0.07, floor_t=0.07, quad=1, bevel=0.012, rim_flange=0.03):
    """Build a genuine open-top rectangular trough/bin with thick walls, bottom slab & rim flange."""
    cx, cy, cz = center
    sx, sy, sz = outer_size
    wt = min(wall_t, sx * 0.28, sy * 0.28)
    ft = min(floor_t, sz * 0.45)
    # Floor bottom slab
    _add_box(bm, (cx, cy, cz - sz * 0.5 + ft * 0.5), (sx, sy, ft), quad=quad, bevel=bevel)
    # 4 perimeter walls rising from floor
    wh = sz - ft
    wz = cz + ft * 0.5
    _add_box(bm, (cx - (sx - wt) * 0.5, cy, wz), (wt, sy, wh), quad=quad, bevel=bevel)
    _add_box(bm, (cx + (sx - wt) * 0.5, cy, wz), (wt, sy, wh), quad=quad, bevel=bevel)
    _add_box(bm, (cx, cy - (sy - wt) * 0.5, wz), (sx - 2 * wt, wt, wh), quad=quad, bevel=bevel)
    _add_box(bm, (cx, cy + (sy - wt) * 0.5, wz), (sx - 2 * wt, wt, wh), quad=quad, bevel=bevel)
    if rim_flange > 0.004:
        rt = wt + rim_flange
        rz = cz + sz * 0.5 + bevel * 0.5
        _add_box(bm, (cx - (sx - wt) * 0.5, cy, rz), (rt, sy + rim_flange * 2, bevel * 2.2), quad=2, bevel=bevel * 0.6)
        _add_box(bm, (cx + (sx - wt) * 0.5, cy, rz), (rt, sy + rim_flange * 2, bevel * 2.2), quad=2, bevel=bevel * 0.6)
        _add_box(bm, (cx, cy - (sy - wt) * 0.5, rz), (sx + rim_flange * 2, rt, bevel * 2.2), quad=2, bevel=bevel * 0.6)
        _add_box(bm, (cx, cy + (sy - wt) * 0.5, rz), (sx + rim_flange * 2, rt, bevel * 2.2), quad=2, bevel=bevel * 0.6)


def _add_timber_beam(bm, p0, p1, width=0.14, depth=0.14, quad=1, straps=False, strap_quad=2):
    """Chamfered rectangular heavy structural beam between endpoints with optional iron collars."""
    v0 = Vector(p0)
    v1 = Vector(p1)
    delta = v1 - v0
    length = delta.length
    if length < 1e-4:
        return
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    flat_layer = bm.faces.layers.int.get('aaa_flat') or bm.faces.layers.int.new('aaa_flat')
    z_ax = delta.normalized()
    ref = Vector((0, 0, 1)) if abs(z_ax.z) < 0.92 else Vector((1, 0, 0))
    x_ax = z_ax.cross(ref).normalized()
    y_ax = z_ax.cross(x_ax).normalized()
    rot_m = Matrix(((x_ax.x, y_ax.x, z_ax.x, 0.0), (x_ax.y, y_ax.y, z_ax.y, 0.0), (x_ax.z, y_ax.z, z_ax.z, 0.0), (0.0, 0.0, 0.0, 1.0)))
    mid = (v0 + v1) * 0.5
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    bmesh.ops.scale(tmp, vec=(width, depth, length), verts=tmp.verts)
    bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=min(width, depth) * 0.12, segments=1, affect='EDGES', clamp_overlap=True)
    xform = Matrix.Translation(mid) @ rot_m
    for v in tmp.verts:
        v.co = xform @ v.co
    tmp.normal_update()
    u0, u1, v0_uv, v1_uv = _zone_uv_bounds(quad)
    v_map = {v: bm.verts.new(v.co) for v in tmp.verts}
    for tf in tmp.faces:
        nf = bm.faces.new(tuple(v_map[v] for v in tf.verts))
        nf[flat_layer] = 1
        for loop in nf.loops:
            co = loop.vert.co
            loop[uv_layer].uv = (u0 + ((co.x + co.y) * 0.65 % 1.0) * (u1 - u0), v0_uv + ((co.z * 0.65) % 1.0) * (v1_uv - v0_uv))
    tmp.free()
    if straps and length > 0.25:
        for frac in (0.12, 0.88):
            c_pt = v0.lerp(v1, frac)
            _add_timber_beam(bm, c_pt - z_ax * 0.035, c_pt + z_ax * 0.035, width=width * 1.14, depth=depth * 1.14, quad=strap_quad, straps=False)


def _add_spoked_wheel(bm, center, radius=0.24, width=0.075, spokes=8, quad_wood=1, quad_iron=2):
    """Spoked wooden cart wheel with beveled iron rim tire, felloe, hub & iron end caps."""
    cx, cy, cz = center
    _add_tube(bm, [(cx, cy - width * 0.85, cz), (cx, cy + width * 0.85, cz)], radius * 0.26, radius * 0.26, 12, quad=quad_iron)
    # Build segmented rim ring (wooden felloe + iron tire collar)
    segs = max(12, spokes * 2)
    pts_outer = []
    for s in range(segs + 1):
        a = (s / segs) * math.tau
        pts_outer.append((cx + math.cos(a) * radius, cy, cz + math.sin(a) * radius))
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    prev = len(bm.faces)
    tube(bm, uv_layer, [Vector(p) for p in pts_outer], [width * 0.48] * len(pts_outer), sides=8, cap_end=False)
    _remap_new_faces_uv(bm, prev, quad_iron)
    for k in range(spokes):
        a = (k / spokes) * math.tau
        p_in = (cx + math.cos(a) * radius * 0.22, cy, cz + math.sin(a) * radius * 0.22)
        p_out = (cx + math.cos(a) * radius * 0.90, cy, cz + math.sin(a) * radius * 0.90)
        _add_timber_beam(bm, p_in, p_out, width=radius * 0.11, depth=width * 0.56, quad=quad_wood)


def _add_staved_barrel(bm, p0, p1, radius=0.24, quad_wood=1, quad_iron=2, tap_side=False):
    """Bilged oak cask between p0 and p1 with raised iron hoops & bronze tap spigot."""
    v0 = Vector(p0)
    v1 = Vector(p1)
    d = (v1 - v0).normalized()
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    pts = [v0.lerp(v1, t) for t in (0.0, 0.22, 0.50, 0.78, 1.0)]
    rads = [radius * 0.82, radius * 0.98, radius * 1.05, radius * 0.98, radius * 0.82]
    prev = len(bm.faces)
    tube(bm, uv_layer, pts, rads, sides=14, cap_end=True, flute_count=14, flute_depth=0.025)
    _remap_new_faces_uv(bm, prev, quad_wood)
    for frac, hr in ((0.12, radius * 0.92), (0.34, radius * 1.06), (0.66, radius * 1.06), (0.88, radius * 0.92)):
        hc = v0.lerp(v1, frac)
        _add_tube(bm, [hc - d * 0.025, hc + d * 0.025], hr, hr, 14, quad=quad_iron)
    if tap_side:
        _add_tube(bm, [v0 - d * 0.01 + Vector((0, 0, -radius * 0.35)), v0 - d * 0.14 + Vector((0, 0, -radius * 0.35))], 0.032, 0.022, 8, quad=3)


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


def _add_rock(bm, center, scale, quad=0, style='crag', seed=1):
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u1, v0, v1 = _zone_uv_bounds(quad)
    planar_rock(bm, uv_layer, Vector(center), scale, style=style, seed=seed, u_range=(u0, u1), v_range=(v0, v1))


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
    rng = random.Random(107)
    # Timber sole-plates anchored directly into cave floor + 4 mortised batter posts with iron collars
    for sy in (-0.52, 0.52):
        _add_timber_beam(bm, (-0.78, sy, 0.04), (0.78, sy, 0.04), width=0.14, depth=0.12, quad=1)
    for sx in (-0.64, 0.64):
        for sy in (-0.52, 0.52):
            _add_timber_beam(bm, (sx, sy, 0.02), (sx * 0.90, sy * 0.90, 1.54), width=0.16, depth=0.16, quad=1, straps=True, strap_quad=2)
        # Side diagonal knee/X-braces + forged gusset plates at joints
        _add_timber_beam(bm, (sx, -0.50, 0.16), (sx * 0.92, 0.48, 1.38), width=0.09, depth=0.09, quad=1)
        _add_timber_beam(bm, (sx, 0.50, 0.16), (sx * 0.92, -0.48, 1.38), width=0.09, depth=0.09, quad=1)
        _add_box(bm, (sx * 0.95, 0.0, 0.78), (0.12, 0.22, 0.22), quad=2, bevel=0.01)
    # Cross spreader beams supporting chute and rear bin
    _add_timber_beam(bm, (-0.62, 0.48, 0.58), (0.62, 0.48, 0.58), width=0.12, depth=0.12, quad=1)
    _add_timber_beam(bm, (-0.62, -0.48, 0.96), (0.62, -0.48, 0.96), width=0.12, depth=0.12, quad=1, straps=True)
    # True open-top hollow steel/timber ore bin with thick flared funnel walls & interior
    _add_hollow_box(bm, (0.0, 0.0, 1.72), (1.56, 1.28, 0.44), wall_t=0.09, floor_t=0.08, quad=1, bevel=0.014, rim_flange=0.04)
    # Angled discharge chute trough + tall cheek walls + pivoted gate damper lever
    _add_box(bm, (0.0, -0.26, 1.12), (1.24, 1.44, 0.10), quad=2, rx=0.42, bevel=0.014)
    for cx in (-0.58, 0.58):
        _add_box(bm, (cx, -0.28, 1.24), (0.08, 1.44, 0.28), quad=1, rx=0.42, bevel=0.012)
    _add_box(bm, (0.0, -0.56, 1.28), (1.12, 0.06, 0.28), quad=2, rx=0.42, bevel=0.01)
    _add_timber_beam(bm, (0.66, -0.34, 1.26), (0.98, -0.58, 1.66), width=0.06, depth=0.06, quad=2)
    _add_box(bm, (0.98, -0.58, 1.68), (0.10, 0.14, 0.10), quad=3, bevel=0.012)
    # Planar fractured ore boulders & spilled gold-bearing ore chunks
    for i, (bx, by, bz) in enumerate(((-0.36, -0.78, 0.16), (0.08, -0.84, 0.14), (0.38, -0.72, 0.18))):
        planar_rock(bm, bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap'), Vector((bx, by, bz)), (0.28, 0.24, 0.18), style='crag', seed=11 + i, u_range=_zone_uv_bounds(0)[:2], v_range=_zone_uv_bounds(0)[2:])
    u3, u3e, v3, v3e = _zone_uv_bounds(3)
    for j, (ox, oy, oz) in enumerate(((-0.18, 0.04, 1.66), (0.16, -0.04, 1.70), (0.0, 0.14, 1.68), (-0.12, -0.62, 0.94), (0.20, -0.68, 0.90))):
        planar_rock(bm, bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap'), Vector((ox, oy, oz)), (0.26, 0.22, 0.16), style='ore_matrix', seed=21 + j, u_range=(u3, u3e), v_range=(v3, v3e))
    return bm


def build_mine_dewatering_pump_rig():
    bm = bmesh.new()
    _add_hollow_box(bm, (0.55, 0.15, 0.14), (0.86, 0.72, 0.24), wall_t=0.07, floor_t=0.06, quad=0, bevel=0.015, rim_flange=0.025)
    _add_timber_beam(bm, (-0.72, 0.0, 0.12), (0.28, 0.0, 0.12), width=0.88, depth=0.20, quad=1)
    # Mortised timber A-frame fulcrum stanchions + forged iron collars
    for fy in (-0.28, 0.28):
        _add_timber_beam(bm, (-0.56, fy, 0.20), (-0.18, fy * 0.68, 1.94), width=0.13, depth=0.13, quad=1, straps=True)
        _add_timber_beam(bm, (0.24, fy, 0.20), (-0.18, fy * 0.68, 1.94), width=0.13, depth=0.13, quad=1)
    _add_tube(bm, [(-0.18, -0.34, 1.94), (-0.18, 0.34, 1.94)], 0.058, 0.058, 10, quad=2)
    # Main flanged cast-iron pump cylinder barrel & drainage sluice spout
    _add_tube(bm, [(-0.22, 0, 0.2), (-0.22, 0, 1.85)], 0.16, 0.14, 14, quad=2, flute_amp=0.02)
    for bz in (0.62, 1.18, 1.65):
        _add_tube(bm, [(-0.22, 0, bz), (-0.22, 0, bz + 0.08)], 0.19, 0.19, 14, quad=2)
    _add_timber_beam(bm, (-0.22, 0, 1.72), (0.52, 0.12, 0.92), width=0.16, depth=0.14, quad=2, straps=True)
    # Chamfered walking rocker beam + forged counterweight iron block
    _add_box(bm, (-0.18, 0, 1.98), (1.85, 0.14, 0.16), quad=1, ry=0.14, bevel=0.02)
    _add_box(bm, (-0.98, 0, 2.06), (0.30, 0.30, 0.32), quad=2, ry=0.14, bevel=0.025)
    _add_tube(bm, [(0.62, 0, 0.24), (0.62, 0, 1.75)], 0.042, 0.042, 10, quad=2)
    for gx in range(-2, 3):
        _add_box(bm, (0.55 + gx * 0.12, 0.15, 0.27), (0.045, 0.66, 0.035), quad=1, bevel=0.008)
    _add_rock(bm, (0.55, 0.15, 0.20), (0.36, 0.34, 0.12), quad=0, style='river', seed=31)
    return bm


def build_mine_powder_magazine_locker():
    bm = bmesh.new()
    # Timber skid frame + heavily strapped iron powder safe cabinet
    for sy in (-0.34, 0.34):
        _add_timber_beam(bm, (-0.64, sy, 0.04), (0.64, sy, 0.04), width=0.12, depth=0.10, quad=1)
    _add_box(bm, (0, 0, 0.58), (1.18, 0.84, 1.02), quad=1, bevel=0.03)
    for hz in (0.28, 0.62, 0.95):
        _add_box(bm, (0, 0, hz), (1.24, 0.88, 0.07), quad=2, bevel=0.01)
    for sx in (-0.58, 0.58):
        _add_timber_beam(bm, (sx, 0, 0.12), (sx, 0, 1.06), width=0.09, depth=0.88, quad=2)
    _add_box(bm, (0, -0.24, 1.20), (1.36, 0.56, 0.08), quad=1, rx=0.28, bevel=0.015)
    _add_box(bm, (0, 0.24, 1.20), (1.36, 0.56, 0.08), quad=1, rx=-0.28, bevel=0.015)
    _add_box(bm, (0, 0, 1.30), (1.40, 0.16, 0.08), quad=2, bevel=0.015)
    _add_box(bm, (0, -0.44, 0.58), (0.22, 0.08, 0.28), quad=2, bevel=0.015)
    _add_box(bm, (0, -0.49, 0.52), (0.14, 0.06, 0.18), quad=3, bevel=0.015)
    for ox in (-0.44, 0.44):
        _add_staved_barrel(bm, (ox, 0.50, 0.02), (ox, 0.50, 0.74), radius=0.21, quad_wood=1, quad_iron=2, tap_side=False)
    _add_box(bm, (-0.28, -0.22, 1.26), (0.32, 0.24, 0.22), quad=3, rz=0.35, bevel=0.02)
    return bm


def build_mine_rail_turntable_switch():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.08), (1.70, 1.70, 0.14), quad=0, bevel=0.03)
    _add_tube(bm, [(0, 0, 0.06), (0, 0, 0.24)], 0.72, 0.68, 24, quad=2, flute_amp=0.01)
    for sk in range(6):
        sa = sk * (math.pi / 3.0)
        _add_timber_beam(bm, (0, 0, 0.21), (0.68 * math.cos(sa), 0.68 * math.sin(sa), 0.21), width=0.07, depth=0.06, quad=1)
        _add_box(bm, (0.74 * math.cos(sa), 0.74 * math.sin(sa), 0.20), (0.12, 0.12, 0.10), quad=2, rz=sa, bevel=0.01)
    for ry in (-0.42, 0.42):
        _add_box(bm, (0, ry, 0.27), (1.65, 0.08, 0.08), quad=2, bevel=0.01)
        _add_box(bm, (ry, 0, 0.27), (0.08, 1.65, 0.08), quad=2, bevel=0.01)
    _add_box(bm, (0.86, 0.62, 0.16), (0.34, 0.34, 0.14), quad=2, bevel=0.02)
    _add_timber_beam(bm, (0.86, 0.62, 0.18), (0.86, 0.62, 1.24), width=0.09, depth=0.09, quad=2, straps=True)
    _add_timber_beam(bm, (0.86, 0.62, 0.34), (0.58, 0.42, 0.22), width=0.05, depth=0.05, quad=2)
    _add_timber_beam(bm, (0.86, 0.62, 0.78), (1.16, 0.86, 1.06), width=0.05, depth=0.05, quad=2)
    _add_rock(bm, (1.16, 0.86, 1.08), (0.12, 0.11, 0.11), quad=2, style='crag', seed=39)
    _add_box(bm, (0.86, 0.62, 1.24), (0.22, 0.22, 0.26), quad=3, bevel=0.02)
    return bm


def build_mine_assaying_brazier_cart():
    bm = bmesh.new()
    # Hollow assaying furnace & sorting bed on spoked wheels with iron tire rims
    _add_hollow_box(bm, (0, 0, 0.56), (1.36, 0.80, 0.52), wall_t=0.08, floor_t=0.07, quad=1, bevel=0.02, rim_flange=0.03)
    for wx in (-0.46, 0.46):
        _add_tube(bm, [(wx, -0.52, 0.22), (wx, 0.52, 0.22)], 0.045, 0.045, 8, quad=2)
        for wy in (-0.44, 0.44):
            _add_spoked_wheel(bm, (wx, wy, 0.22), radius=0.22, width=0.07, spokes=8, quad_wood=1, quad_iron=2)
    for hy in (-0.32, 0.32):
        _add_timber_beam(bm, (0.62, hy, 0.72), (0.98, hy, 0.92), width=0.055, depth=0.055, quad=2)
    _add_timber_beam(bm, (0.98, -0.34, 0.92), (0.98, 0.34, 0.92), width=0.06, depth=0.06, quad=1)
    # Assaying iron pot + glowing ore samples inside cart bed
    _add_hollow_box(bm, (-0.22, 0.0, 0.84), (0.48, 0.48, 0.24), wall_t=0.05, floor_t=0.05, quad=2, bevel=0.015, rim_flange=0.03)
    for iz, ox, oy in ((0.64, 0.32, -0.18), (0.64, 0.34, 0.02), (0.70, 0.33, -0.08)):
        _add_box(bm, (ox, oy, iz), (0.24, 0.11, 0.07), quad=3, bevel=0.01)
    _add_rock(bm, (-0.22, 0, 0.94), (0.22, 0.20, 0.12), quad=3, style='ore_matrix', seed=41)
    _add_rock(bm, (0.34, 0.18, 0.68), (0.18, 0.16, 0.14), quad=0, style='ore_matrix', seed=42)
    return bm


# ---------------------------------------------------------------------------
# 2. UMBRA CAVERN (5 props)
# ---------------------------------------------------------------------------
def build_umbra_veil_fungus_parasol():
    bm = bmesh.new()
    rng = random.Random(51)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u0e, v0, v0e = _zone_uv_bounds(0)
    u1, u1e, v1, v1e = _zone_uv_bounds(1)
    u2, u2e, v2, v2e = _zone_uv_bounds(2)
    mushroom_cluster_mesh(
        bm,
        uv_layer,
        Vector((0.0, 0.0, 0.0)),
        2.55,
        1.25,
        rng,
        cap_u=(u2, u2e),
        cap_v=(v2, v2e),
        stipe_u=(u1, u1e),
        stipe_v=(v1, v1e),
        base_u=(u0, u0e),
        base_v=(v0, v0e),
    )
    return bm


def build_umbra_crystal_resonator_obelisk():
    bm = bmesh.new()
    rng = random.Random(61)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u0e, v0, v0e = _zone_uv_bounds(0)
    u2, u2e, v2, v2e = _zone_uv_bounds(2)
    u3, u3e, v3, v3e = _zone_uv_bounds(3)
    # Faceted basalt resonator socket plinth + carved iron retaining claws around main crystal base
    _add_box(bm, (0, 0, 0.16), (1.28, 1.28, 0.32), quad=0, bevel=0.04)
    _add_box(bm, (0, 0, 0.42), (0.92, 0.92, 0.22), quad=1, bevel=0.03)
    for ci in range(4):
        ca = ci * (math.pi * 0.5) + math.pi * 0.25
        _add_timber_beam(bm, (0.52 * math.cos(ca), 0.52 * math.sin(ca), 0.44), (0.28 * math.cos(ca), 0.28 * math.sin(ca), 0.96), width=0.09, depth=0.08, quad=1)
    _add_box(bm, (0, 0, 0.78), (0.68, 0.68, 0.10), quad=1, rz=0.78, bevel=0.015)
    crystal_cluster_formation(
        bm,
        uv_layer,
        Vector((0.0, 0.0, 0.42)),
        2.65,
        0.72,
        rng,
        u_crystal=(u3, u3e),
        v_crystal=(v3, v3e),
        u_rock=(u0, u0e),
        v_rock=(v0, v0e),
        matrix_style='volcanic',
    )
    # Floating/socketed secondary crystal shards tilted off-axis inside outer base stones
    for j in range(3):
        a = j * (math.tau / 3.0) + 0.6
        _add_rock(bm, (0.64 * math.cos(a), 0.64 * math.sin(a), 0.14), (0.28, 0.24, 0.18), quad=0, style='crag', seed=64 + j)
    return bm


def build_umbra_hanging_censer_spire():
    bm = bmesh.new()
    rng = random.Random(69)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u0e, v0, v0e = _zone_uv_bounds(0)
    u3, u3e, v3, v3e = _zone_uv_bounds(3)
    _add_tube(bm, [(0, 0, -0.04), (0, 0, 0.42)], 0.44, 0.34, 8, quad=0)
    for bi in range(4):
        ba = bi * (math.pi * 0.5)
        _add_timber_beam(bm, (0.36 * math.cos(ba), 0.36 * math.sin(ba), 0.14), (0.08 * math.cos(ba), 0.08 * math.sin(ba), 1.05), width=0.09, depth=0.09, quad=1)
    _add_tube(bm, [(0, 0, 0.42), (0.04, 0, 2.48)], 0.09, 0.06, 10, quad=1)
    _add_timber_beam(bm, (0.04, 0, 2.2), (0.68, 0, 2.65), width=0.09, depth=0.08, quad=1, straps=True)
    _add_tube(bm, [(0.04, 0, 1.72), (0.34, 0, 2.18), (0.52, 0, 2.48)], 0.042, 0.032, 8, quad=2)
    crystal_cluster_formation(bm, uv_layer, Vector((0.04, 0, 2.42)), 0.42, 0.14, rng, u_crystal=(u3, u3e), v_crystal=(v3, v3e), u_rock=(u0, u0e), v_rock=(v0, v0e), matrix_style='volcanic')
    for cz in (2.52, 2.38, 2.24, 2.10):
        _add_tube(bm, [(0.68, 0, cz), (0.68, 0, cz - 0.11)], 0.028, 0.028, 6, quad=2)
    _add_hollow_box(bm, (0.68, 0, 1.82), (0.40, 0.40, 0.28), wall_t=0.045, floor_t=0.05, quad=2, bevel=0.015, rim_flange=0.03)
    crystal_cluster_formation(bm, uv_layer, Vector((0.68, 0, 1.86)), 0.34, 0.13, rng, u_crystal=(u3, u3e), v_crystal=(v3, v3e), u_rock=(u0, u0e), v_rock=(v0, v0e), matrix_style='volcanic')
    return bm


def build_umbra_spider_web_balustrade_shrine():
    bm = bmesh.new()
    rng = random.Random(71)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u0e, v0, v0e = _zone_uv_bounds(0)
    u3, u3e, v3, v3e = _zone_uv_bounds(3)
    _add_box(bm, (0, 0, 0.18), (1.38, 1.38, 0.36), quad=0, bevel=0.04)
    for px, py in ((-0.46, -0.46), (0.46, -0.46), (-0.46, 0.46), (0.46, 0.46)):
        _add_timber_beam(bm, (px, py, 0.30), (px, py, 1.88), width=0.16, depth=0.16, quad=1, straps=True)
        _add_prism_pillar(bm, (px, py, 2.02), 0.09, 0.34, sides=6, quad=2, seed=72)
    for side_y in (-0.46, 0.46):
        _add_box(bm, (0, side_y, 0.68), (0.94, 0.07, 0.08), quad=1, bevel=0.01)
        _add_box(bm, (side_y, 0, 0.68), (0.07, 0.94, 0.08), quad=1, bevel=0.01)
    for sx in (-0.28, 0.28):
        _add_tube(bm, [(sx, -0.46, 0.36), (sx, -0.46, 0.68)], 0.032, 0.032, 6, quad=1)
        _add_tube(bm, [(sx, 0.46, 0.36), (sx, 0.46, 0.68)], 0.032, 0.032, 6, quad=1)
    _add_tube(bm, [(0, 0, 0.34), (0, 0, 0.88)], 0.22, 0.16, 8, quad=0)
    _add_hollow_box(bm, (0, 0, 0.96), (0.46, 0.46, 0.18), wall_t=0.05, floor_t=0.05, quad=2, bevel=0.012, rim_flange=0.025)
    crystal_cluster_formation(bm, uv_layer, Vector((0, 0, 0.98)), 0.36, 0.16, rng, u_crystal=(u3, u3e), v_crystal=(v3, v3e), u_rock=(u0, u0e), v_rock=(v0, v0e), matrix_style='volcanic')
    _add_box(bm, (0, 0, 1.92), (1.30, 1.30, 0.20), quad=0, bevel=0.03)
    crystal_cluster_formation(bm, uv_layer, Vector((0, 0, 2.02)), 0.62, 0.28, rng, u_crystal=(u3, u3e), v_crystal=(v3, v3e), u_rock=(u0, u0e), v_rock=(v0, v0e), matrix_style='volcanic')
    return bm


def build_umbra_tide_gondola_skiff():
    bm = bmesh.new()
    rng = random.Random(77)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u0e, v0, v0e = _zone_uv_bounds(0)
    u3, u3e, v3, v3e = _zone_uv_bounds(3)
    # Keel timber arching at stem & stern
    pts = [(-1.62, 0, 0.50), (-0.98, 0, 0.14), (0, 0, 0.08), (0.98, 0, 0.14), (1.64, 0, 0.56)]
    _add_tube(bm, pts, 0.10, 0.12, 10, quad=1, flute_amp=0.02)
    # Hollowed rib-framed skiff hull (curved port/starboard gunwales + deck floor planks)
    _add_box(bm, (0, 0, 0.16), (2.15, 0.72, 0.08), quad=1, bevel=0.02)
    for side_y in (-1, 1):
        gunwale = [(-1.55, 0.02 * side_y, 0.52), (-0.82, 0.40 * side_y, 0.42), (0.0, 0.48 * side_y, 0.40), (0.82, 0.40 * side_y, 0.42), (1.58, 0.02 * side_y, 0.58)]
        _add_tube(bm, gunwale, 0.055, 0.055, 8, quad=1)
        chine = [(-1.40, 0.02 * side_y, 0.36), (-0.75, 0.34 * side_y, 0.22), (0.0, 0.40 * side_y, 0.20), (0.75, 0.34 * side_y, 0.22), (1.42, 0.02 * side_y, 0.40)]
        _add_tube(bm, chine, 0.048, 0.048, 6, quad=1)
    for sx in (-0.80, -0.40, 0.0, 0.40, 0.80):
        hw = 0.44 * (1.0 - 0.32 * (abs(sx) / 0.90))
        _add_timber_beam(bm, (sx, -hw, 0.20), (sx, hw, 0.20), width=0.07, depth=0.05, quad=1)
        _add_timber_beam(bm, (sx, -hw, 0.20), (sx, -hw * 1.06, 0.41), width=0.06, depth=0.05, quad=1)
        _add_timber_beam(bm, (sx, hw, 0.20), (sx, hw * 1.06, 0.41), width=0.06, depth=0.05, quad=1)
    for sx in (-0.55, 0.0, 0.55):
        _add_box(bm, (sx, 0, 0.40), (0.24, 0.82, 0.05), quad=2, bevel=0.01)
    _add_timber_beam(bm, (1.38, 0, 0.48), (1.64, 0, 1.15), width=0.07, depth=0.07, quad=2)
    crystal_cluster_formation(bm, uv_layer, Vector((1.64, 0, 1.10)), 0.32, 0.12, rng, u_crystal=(u3, u3e), v_crystal=(v3, v3e), u_rock=(u0, u0e), v_rock=(v0, v0e), matrix_style='volcanic')
    return bm


# ---------------------------------------------------------------------------
# 3. STONEHOLD HOLD (5 props)
# ---------------------------------------------------------------------------
def build_stonehold_drop_hammer_forge_press():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.22), (1.46, 1.20, 0.44), quad=0, bevel=0.04)
    for sx in (-0.52, 0.52):
        _add_timber_beam(bm, (sx, 0, 0.40), (sx, 0, 2.48), width=0.26, depth=0.38, quad=0, straps=True)
    _add_box(bm, (0, 0, 2.52), (1.50, 0.52, 0.32), quad=2, bevel=0.03)
    _add_box(bm, (0, 0, 0.68), (0.58, 0.44, 0.44), quad=1, bevel=0.03)
    _add_timber_beam(bm, (-0.36, 0, 0.72), (0.48, 0, 0.72), width=0.22, depth=0.14, quad=2)
    _add_box(bm, (0, 0, 1.62), (0.48, 0.44, 0.52), quad=2, bevel=0.03)
    _add_rock(bm, (-0.08, -0.32, 0.66), (0.24, 0.22, 0.16), quad=3, style='ore_matrix', seed=81)
    return bm


def build_stonehold_runic_brazier_pedestal():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.20), (1.16, 1.16, 0.40), quad=0, bevel=0.04)
    _add_tube(bm, [(0, 0, 0.38), (0, 0, 1.16)], 0.36, 0.28, 8, quad=0)
    for ca in (0.785, 2.356, 3.927, 5.498):
        _add_timber_beam(bm, (0.44 * math.cos(ca), 0.44 * math.sin(ca), 0.38), (0.24 * math.cos(ca), 0.24 * math.sin(ca), 1.05), width=0.08, depth=0.08, quad=2)
    _add_hollow_box(bm, (0, 0, 1.38), (1.02, 1.02, 0.34), wall_t=0.10, floor_t=0.09, quad=2, bevel=0.025, rim_flange=0.06)
    _add_rock(bm, (0, 0, 1.46), (0.38, 0.36, 0.22), quad=3, style='ore_matrix', seed=85)
    return bm


def build_stonehold_geared_capstan_winch():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.16), (1.32, 1.32, 0.32), quad=0, bevel=0.04)
    _add_tube(bm, [(0, 0, 0.30), (0, 0, 1.38)], 0.32, 0.28, 16, quad=1, flute_amp=0.025, flute_freq=8)
    _add_tube(bm, [(0, 0, 0.50), (0, 0, 0.64)], 0.56, 0.56, 20, quad=2, flute_amp=0.07, flute_freq=14)
    _add_timber_beam(bm, (-0.75, 0, 1.22), (0.75, 0, 1.22), width=0.12, depth=0.12, quad=1, straps=True)
    _add_timber_beam(bm, (0, -0.75, 1.22), (0, 0.75, 1.22), width=0.12, depth=0.12, quad=1, straps=True)
    _add_timber_beam(bm, (0.48, 0.48, 0.28), (0.38, 0.38, 0.66), width=0.09, depth=0.09, quad=2)
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
    _add_box(bm, (0, 0, 0.16), (1.30, 0.98, 0.32), quad=0, bevel=0.04)
    _add_timber_beam(bm, (-0.26, 0, 0.28), (-0.26, 0, 2.28), width=0.26, depth=0.26, quad=2, straps=True)
    _add_timber_beam(bm, (-0.24, 0, 1.28), (0.52, 0, 2.15), width=0.14, depth=0.14, quad=2)
    _add_box(bm, (0.36, 0, 2.18), (1.36, 0.16, 0.18), quad=2, bevel=0.02)
    _add_box(bm, (0.88, 0, 2.18), (0.28, 0.28, 0.26), quad=2, bevel=0.02)
    _add_tube(bm, [(-0.26, -0.22, 1.05), (-0.26, 0.22, 1.05)], 0.18, 0.18, 14, quad=2, flute_amp=0.04, flute_freq=10)
    _add_tube(bm, [(-0.18, -0.20, 1.18), (0.94, 0, 2.28)], 0.018, 0.018, 6, quad=1)
    _add_tube(bm, [(0.88, 0, 2.10), (0.88, 0, 1.54)], 0.028, 0.028, 8, quad=2)
    for vy in (-0.18, 0.18):
        _add_tube(bm, [(0.88, 0, 1.54), (0.88, vy, 1.16)], 0.022, 0.020, 6, quad=2)
    _add_hollow_box(bm, (0.88, 0, 1.04), (0.50, 0.38, 0.26), wall_t=0.05, floor_t=0.05, quad=1, bevel=0.02, rim_flange=0.025)
    _add_rock(bm, (0.88, 0, 1.10), (0.16, 0.12, 0.06), quad=3, style='ore_matrix', seed=89)
    return bm


# ---------------------------------------------------------------------------
# 4. FROSTGARD GLACIER CAVE (5 props)
# ---------------------------------------------------------------------------
def build_frostgard_organ_pipe_ice_formation():
    bm = bmesh.new()
    rng = random.Random(91)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u0e, v0, v0e = _zone_uv_bounds(0)
    u1, u1e, v1, v1e = _zone_uv_bounds(1)
    u2, u2e, v2, v2e = _zone_uv_bounds(2)
    ice_formation_mesh(
        bm,
        uv_layer,
        Vector((0.0, 0.0, 0.0)),
        3.2,
        1.15,
        style='organ_pipe',
        rng=rng,
        u_inner=(u1, u1e),
        v_inner=(v1, v1e),
        u_frost=(u2, u2e),
        v_frost=(v2, v2e),
        u_base=(u0, u0e),
        v_base=(v0, v0e),
    )
    return bm


def build_frostgard_hoarfrost_rose_cluster():
    bm = bmesh.new()
    rng = random.Random(101)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u0e, v0, v0e = _zone_uv_bounds(0)
    u1, u1e, v1, v1e = _zone_uv_bounds(1)
    u2, u2e, v2, v2e = _zone_uv_bounds(2)
    ice_formation_mesh(
        bm,
        uv_layer,
        Vector((0.0, 0.0, 0.0)),
        1.55,
        0.96,
        style='frost_rose',
        rng=rng,
        u_inner=(u1, u1e),
        v_inner=(v1, v1e),
        u_frost=(u2, u2e),
        v_frost=(v2, v2e),
        u_base=(u0, u0e),
        v_base=(v0, v0e),
    )
    return bm


def build_frostgard_frozen_melt_mushroom_column():
    bm = bmesh.new()
    rng = random.Random(111)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u0e, v0, v0e = _zone_uv_bounds(0)
    u1, u1e, v1, v1e = _zone_uv_bounds(1)
    u2, u2e, v2, v2e = _zone_uv_bounds(2)
    # Multi-tiered wind-scoured glacial pressure-ridge / melt mushroom formation + basalt floor
    ice_formation_mesh(
        bm,
        uv_layer,
        Vector((0.0, 0.0, 0.0)),
        2.65,
        1.12,
        style='pressure_ridge',
        rng=rng,
        u_inner=(u1, u1e),
        v_inner=(v1, v1e),
        u_frost=(u2, u2e),
        v_frost=(v2, v2e),
        u_base=(u0, u0e),
        v_base=(v0, v0e),
    )
    # Flanking basalt & frosty drip buttresses around base
    planar_rock(bm, uv_layer, Vector((0.0, 0.0, 0.06)), (0.95, 0.88, 0.24), style='sedimentary', seed=112, u_range=(u0, u0e), v_range=(v0, v0e))
    return bm


def build_frostgard_bone_mooring_anchor():
    bm = bmesh.new()
    for i in range(6):
        a = (i / 6.0) * math.pi * 2
        _add_rock(bm, (0.36 * math.cos(a), 0.36 * math.sin(a), 0.14), (0.38, 0.32, 0.26), quad=0, style='crag', seed=120 + i)
    # Massive lashed whale-rib bone tusks + collared hawser drum
    _add_tube(bm, [(-0.24, 0, -0.02), (-0.08, 0, 0.62), (0.26, 0, 1.28)], 0.10, 0.05, 10, quad=2, flute_amp=0.02)
    _add_tube(bm, [(0.28, 0, -0.02), (0.08, 0, 0.58), (-0.22, 0, 1.18)], 0.095, 0.045, 10, quad=2, flute_amp=0.02)
    _add_staved_barrel(bm, (0, -0.22, 0.58), (0, 0.22, 0.62), radius=0.20, quad_wood=1, quad_iron=2, tap_side=False)
    return bm


def build_frostgard_runic_ice_lantern_shrine():
    bm = bmesh.new()
    rng = random.Random(131)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u0e, v0, v0e = _zone_uv_bounds(0)
    u3, u3e, v3, v3e = _zone_uv_bounds(3)
    _add_box(bm, (0, 0, 0.20), (1.16, 1.16, 0.40), quad=0, bevel=0.04)
    for sx in (-0.36, 0.36):
        _add_timber_beam(bm, (sx, 0, 0.36), (sx, 0, 1.32), width=0.22, depth=0.72, quad=1, straps=True)
    _add_box(bm, (0, 0, 1.40), (0.96, 0.88, 0.24), quad=1, bevel=0.03)
    _add_box(bm, (0, -0.24, 1.62), (1.06, 0.56, 0.10), quad=2, rx=0.24, bevel=0.02)
    _add_box(bm, (0, 0.24, 1.62), (1.06, 0.56, 0.10), quad=2, rx=-0.24, bevel=0.02)
    crystal_cluster_formation(bm, uv_layer, Vector((0, 0, 0.42)), 0.68, 0.22, rng, u_crystal=(u3, u3e), v_crystal=(v3, v3e), u_rock=(u0, u0e), v_rock=(v0, v0e), matrix_style='volcanic')
    return bm


# ---------------------------------------------------------------------------
# 5. FROSTGARD GLACIER FRONT (5 props)
# ---------------------------------------------------------------------------
def build_frostgard_serac_fin_monolith():
    bm = bmesh.new()
    rng = random.Random(141)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u0e, v0, v0e = _zone_uv_bounds(0)
    u1, u1e, v1, v1e = _zone_uv_bounds(1)
    u2, u2e, v2, v2e = _zone_uv_bounds(2)
    ice_formation_mesh(
        bm,
        uv_layer,
        Vector((0.0, 0.0, 0.0)),
        3.4,
        1.25,
        style='serac',
        rng=rng,
        u_inner=(u1, u1e),
        v_inner=(v1, v1e),
        u_frost=(u2, u2e),
        v_frost=(v2, v2e),
        u_base=(u0, u0e),
        v_base=(v0, v0e),
    )
    return bm


def build_frostgard_glacial_wayfinder_cairn():
    bm = bmesh.new()
    # Flat-planed sedimentary slate stones stacked with iron guide pole & runic banner board
    _add_rock(bm, (0, 0, 0.18), (0.94, 0.86, 0.38), quad=0, style='sedimentary', seed=151)
    _add_rock(bm, (0, 0, 0.68), (0.70, 0.64, 0.34), quad=0, style='sedimentary', seed=152)
    _add_rock(bm, (0, 0, 1.12), (0.48, 0.44, 0.22), quad=2, style='sedimentary', seed=153)
    _add_timber_beam(bm, (0, 0, 1.05), (0.08, 0, 2.88), width=0.11, depth=0.11, quad=1, straps=True, strap_quad=2)
    _add_timber_beam(bm, (0.06, 0.0, 2.58), (0.88, 0.08, 2.66), width=0.38, depth=0.055, quad=3)
    _add_box(bm, (0.08, 0.02, 2.88), (0.14, 0.14, 0.12), quad=2, bevel=0.015)
    return bm


def build_frostgard_ice_sawyer_trestle():
    bm = bmesh.new()
    for sx in (-0.68, 0.68):
        _add_timber_beam(bm, (sx, -0.44, -0.04), (sx, 0, 0.92), width=0.12, depth=0.12, quad=1, straps=True)
        _add_timber_beam(bm, (sx, 0.44, -0.04), (sx, 0, 0.92), width=0.12, depth=0.12, quad=1)
        _add_timber_beam(bm, (sx, -0.26, 0.36), (sx, 0.26, 0.36), width=0.09, depth=0.09, quad=1)
    _add_timber_beam(bm, (-0.88, 0, 0.88), (0.88, 0, 0.88), width=0.15, depth=0.15, quad=1, straps=True)
    # Angular cleaved ice block + two-man pit saw blade on top
    _add_rock(bm, (0, 0, 1.18), (0.98, 0.58, 0.48), quad=2, style='limestone', seed=156)
    _add_box(bm, (0, 0, 1.48), (1.42, 0.04, 0.09), quad=3, bevel=0.008)
    for hx in (-0.72, 0.72):
        _add_timber_beam(bm, (hx, 0, 1.44), (hx, 0, 1.62), width=0.05, depth=0.05, quad=1)
    return bm


def build_frostgard_frost_banner_standards():
    bm = bmesh.new()
    _add_rock(bm, (0, 0, 0.08), (0.68, 0.42, 0.16), quad=0, style='crag', seed=158)
    _add_timber_beam(bm, (-0.48, 0, -0.05), (0.26, 0.1, 2.68), width=0.11, depth=0.11, quad=1, straps=True)
    _add_timber_beam(bm, (0.48, 0, -0.05), (-0.26, -0.1, 2.58), width=0.11, depth=0.11, quad=1, straps=True)
    _add_timber_beam(bm, (-0.44, -0.02, 1.22), (0.44, 0.04, 1.22), width=0.12, depth=0.22, quad=1, straps=True)
    _add_box(bm, (0.62, 0.14, 2.34), (0.76, 0.04, 0.42), quad=3, bevel=0.01)
    _add_box(bm, (-0.58, -0.14, 2.28), (0.68, 0.04, 0.36), quad=2, bevel=0.01)
    return bm


def build_frostgard_moraine_erratic_anchor_post():
    bm = bmesh.new()
    _add_rock(bm, (0, 0, 0.28), (1.22, 1.08, 0.56), quad=0, style='crag', seed=161)
    _add_timber_beam(bm, (0, 0, 0.52), (0, 0, 1.48), width=0.38, depth=0.38, quad=2, straps=True, strap_quad=0)
    _add_box(bm, (0, 0, 1.18), (0.52, 0.52, 0.09), quad=0, bevel=0.015)
    _add_timber_beam(bm, (-0.66, 0, 1.32), (0.66, 0, 1.32), width=0.10, depth=0.10, quad=1)
    _add_timber_beam(bm, (0, -0.66, 1.32), (0, 0.66, 1.32), width=0.10, depth=0.10, quad=1)
    return bm


# ---------------------------------------------------------------------------
# 6. FROSTGARD HOLD (5 props)
# ---------------------------------------------------------------------------
def build_frostgard_wolf_totem_palisade_post():
    bm = bmesh.new()
    _add_rock(bm, (0, 0, 0.10), (0.78, 0.72, 0.24), quad=0, style='crag', seed=171)
    _add_timber_beam(bm, (0, 0, 0.14), (0, 0, 2.68), width=0.28, depth=0.28, quad=1, straps=True, strap_quad=2)
    # Carved circular shield boss & snarling wolf totem crest
    _add_tube(bm, [(0, -0.14, 1.18), (0, -0.22, 1.18)], 0.28, 0.28, 14, quad=2)
    _add_box(bm, (0, 0.16, 2.48), (0.40, 0.58, 0.34), quad=2, bevel=0.03)
    _add_box(bm, (0, 0.42, 2.42), (0.24, 0.24, 0.20), quad=2, bevel=0.025)
    for sx in (-1, 1):
        _add_tube(bm, [(sx * 0.18, 0.06, 2.6), (sx * 0.44, -0.06, 3.04)], 0.055, 0.016, 8, quad=2)
        _add_tube(bm, [(sx * 0.09, 0.48, 2.34), (sx * 0.09, 0.48, 2.22)], 0.025, 0.006, 6, quad=3)
    _add_tube(bm, [(0, 0.04, 1.38), (0.20, 0.14, 1.50), (0.30, 0.22, 1.66)], 0.042, 0.032, 8, quad=2)
    _add_hollow_box(bm, (0.30, 0.22, 1.72), (0.38, 0.38, 0.22), wall_t=0.04, floor_t=0.04, quad=2, bevel=0.015, rim_flange=0.03)
    _add_rock(bm, (0.30, 0.22, 1.78), (0.16, 0.16, 0.12), quad=3, style='ore_matrix', seed=172)
    return bm


def build_frostgard_cut_ice_block_hoist():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.08), (1.44, 1.34, 0.16), quad=0, bevel=0.03)
    pts_base = []
    for i in range(3):
        a = (i / 3.0) * math.pi * 2
        bp = (1.08 * math.cos(a), 1.08 * math.sin(a), -0.04)
        pts_base.append(bp)
        _add_timber_beam(bm, bp, (0, 0, 2.58), width=0.14, depth=0.14, quad=1, straps=True)
    for i in range(3):
        p_a = pts_base[i]
        p_b = pts_base[(i + 1) % 3]
        _add_timber_beam(bm, (p_a[0] * 0.58, p_a[1] * 0.58, 1.08), (p_b[0] * 0.58, p_b[1] * 0.58, 1.08), width=0.08, depth=0.08, quad=1)
    _add_tube(bm, [(-0.45, 0.18, 1.58), (0.45, 0.18, 1.58)], 0.075, 0.075, 10, quad=2, flute_amp=0.015)
    _add_spoked_wheel(bm, (0.50, 0.18, 1.58), radius=0.22, width=0.05, spokes=6, quad_wood=1, quad_iron=2)
    _add_tube(bm, [(0, 0, 1.28), (0, 0, 2.52)], 0.03, 0.03, 8, quad=3)
    for sx in (-1, 1):
        _add_tube(bm, [(0, 0, 1.48), (sx * 0.40, 0, 1.18), (sx * 0.38, 0, 0.92)], 0.028, 0.024, 6, quad=1)
    _add_rock(bm, (0, 0, 0.96), (0.46, 0.44, 0.36), quad=2, style='limestone', seed=175)
    return bm


def build_frostgard_mead_hall_trophy_stand():
    bm = bmesh.new()
    for sx in (-0.68, 0.68):
        _add_box(bm, (sx, 0, 0.38), (0.16, 0.76, 0.76), quad=1, bevel=0.025)
    _add_timber_beam(bm, (-0.72, 0, 0.32), (0.72, 0, 0.32), width=0.14, depth=0.14, quad=1, straps=True)
    _add_box(bm, (0, 0, 0.82), (1.84, 0.86, 0.12), quad=1, bevel=0.025)
    for tx in (-0.5, 0.0, 0.52):
        _add_tube(bm, [(tx, 0.12, 0.88), (tx, 0.12, 1.18)], 0.075, 0.065, 10, quad=2)
        for horn_s in (-1, 1):
            _add_tube(bm, [(tx, 0.12, 1.14), (tx + horn_s * 0.18, 0.06, 1.38), (tx + horn_s * 0.24, -0.02, 1.56)], 0.042, 0.012, 8, quad=3)
    _add_staved_barrel(bm, (0.24, -0.14, 0.86), (0.24, -0.14, 1.24), radius=0.19, quad_wood=1, quad_iron=2, tap_side=True)
    _add_tube(bm, [(-0.46, -0.44, 0.56), (-0.46, -0.52, 0.56)], 0.26, 0.24, 14, quad=2)
    _add_tube(bm, [(-0.46, -0.52, 0.56), (-0.46, -0.58, 0.56)], 0.10, 0.04, 10, quad=3)
    return bm


def build_frostgard_salt_brine_cask_frame():
    bm = bmesh.new()
    for sx in (-0.72, 0.72):
        for sy in (-0.4, 0.4):
            _add_timber_beam(bm, (sx, sy, -0.04), (sx, sy, 1.68), width=0.16, depth=0.16, quad=1, straps=True)
        _add_timber_beam(bm, (sx, -0.42, 0.12), (sx, 0.42, 1.52), width=0.10, depth=0.10, quad=1)
    for bz in (0.30, 0.88):
        _add_box(bm, (0, 0, bz), (1.62, 0.88, 0.09), quad=1, bevel=0.015)
        for cx in (-0.34, 0.34):
            for chock_dx in (-0.16, 0.16):
                _add_box(bm, (cx + chock_dx, 0, bz + 0.08), (0.08, 0.68, 0.10), quad=2, bevel=0.01)
    _add_box(bm, (0, 0, 1.7), (1.84, 1.12, 0.14), quad=2, bevel=0.03)
    _add_box(bm, (0, -0.52, 0.12), (1.36, 0.24, 0.08), quad=0, bevel=0.015)
    for cx in (-0.34, 0.34):
        for cz in (0.54, 1.12):
            _add_staved_barrel(bm, (cx, -0.34, cz), (cx, 0.34, cz), radius=0.23, quad_wood=1, quad_iron=2, tap_side=True)
    return bm


def build_frostgard_watchman_braziers_gate():
    bm = bmesh.new()
    _add_box(bm, (0, 0, 0.18), (1.80, 0.74, 0.36), quad=0, bevel=0.04)
    _add_box(bm, (0, 0, 0.66), (1.06, 0.44, 0.68), quad=1, bevel=0.025)
    _add_timber_beam(bm, (-0.82, 0, 1.50), (0.82, 0, 1.50), width=0.26, depth=0.20, quad=1, straps=True)
    for px in (-0.36, -0.12, 0.12, 0.36):
        _add_tube(bm, [(px, 0, 1.44), (px, 0, 1.02)], 0.028, 0.012, 6, quad=2)
    for sx in (-0.72, 0.72):
        _add_timber_beam(bm, (sx, 0, 0.32), (sx, 0, 1.54), width=0.12, depth=0.12, quad=2)
        _add_timber_beam(bm, (sx * 0.74, 0, 0.32), (sx, 0, 1.24), width=0.09, depth=0.09, quad=1)
        _add_hollow_box(bm, (sx, 0, 1.66), (0.46, 0.46, 0.24), wall_t=0.05, floor_t=0.05, quad=2, bevel=0.015, rim_flange=0.04)
        for sp in range(6):
            sa = (sp / 6.0) * math.tau
            _add_tube(bm, [(sx + 0.22 * math.cos(sa), 0.22 * math.sin(sa), 1.72), (sx + 0.26 * math.cos(sa), 0.26 * math.sin(sa), 1.94)], 0.022, 0.008, 6, quad=2)
        _add_rock(bm, (sx, 0, 1.76), (0.19, 0.19, 0.14), quad=3, style='ore_matrix', seed=181 + int(sx * 10))
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
                add_skirt=False,
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
