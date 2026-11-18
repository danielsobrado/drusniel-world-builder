"""Build 30 high-detail >=15k-tri PBR underground and glacial area props in headless Blender.

Produces 5 distinct hero props per area (mine, umbra_cavern, stonehold_hold,
frostgard_glacier_cave, frostgard_glacier_front, frostgard_hold), each built using:
- Structural mechanical assemblies around defined movement axes
- Material-specific geometry algorithms (profile sweep, structured fracture,
  crystal growth graph, timber joinery, layered wear, semantic silhouette bounds)
- Full 3-map PBR textures (BaseColor + Tangent-Space Normal + Packed ORM + Emissive/Subsurface)
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
from mathutils import Vector

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
TOOLS_BLENDER_DIR = os.path.abspath(os.path.join(THIS_DIR, '..'))
BIOME_UNDERSTORY_DIR = os.path.join(TOOLS_BLENDER_DIR, 'biome_understory')
for p in (THIS_DIR, TOOLS_BLENDER_DIR, BIOME_UNDERSTORY_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from understory_common import setup_scene, tube, place_and_export, MIN_TRIANGLES
from understory_pbr import build_pbr_material, finalize_understory_mesh
from aaa_prop_algorithms import (
    add_chain_link_span,
    add_chamfered_box,
    add_draped_banner_flag,
    add_flared_hopper_box,
    add_gear_wheel_with_pawl,
    add_pillow_block_bearing,
    add_pulley_sheave,
    add_revolved_vessel,
    add_routed_rope_path,
    add_winding_drum,
    build_prism_crystal,
    crystal_growth_graph,
    layered_wear,
    profile_sweep,
    semantic_silhouette_constraints,
    structured_fracture,
    timber_joinery,
    zone_uv_bounds,
)

REPO_ROOT = os.path.abspath(os.path.join(THIS_DIR, '..', '..', '..'))
OUT_ROOT = os.path.join(REPO_ROOT, 'assets', 'runtime-sources', 'underground')
TEX_DIR = os.path.join(OUT_ROOT, '_textures')
MANIFEST_PATH = os.path.join(OUT_ROOT, 'manifest.json')
PROP_MAX_TRIANGLES = 24500


def _fbm2(w, h, freq, rng, octaves=4):
    acc = np.zeros((h, w), dtype=np.float32) if False else None
    import numpy as np
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
    import numpy as np
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
    import numpy as np
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


def _remap_new_faces_uv(bm, prev_face_count, quad):
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    u0, u1, v0, v1 = zone_uv_bounds(quad)
    bm.faces.ensure_lookup_table()
    for f in bm.faces[prev_face_count:]:
        for loop in f.loops:
            lu, lv = loop[uv_layer].uv
            loop[uv_layer].uv = (u0 + (lu % 1.0) * (u1 - u0), v0 + (lv % 1.0) * (v1 - v0))


def _add_tube(bm, pts, r0, r1, sides=10, quad=0, flute_amp=0.0, flute_freq=4, mark_flat=False):
    vpts = [Vector(p) for p in pts]
    rads = [r0 + (r1 - r0) * (i / max(1, len(vpts) - 1)) for i in range(len(vpts))]
    return profile_sweep(
        bm,
        vpts,
        rads,
        profile='oval',
        sides=sides,
        ridge_count=flute_freq if flute_amp > 1e-4 else 0,
        ridge_amp=flute_amp,
        quad=quad,
        cap_ends=True,
        mark_flat=mark_flat,
    )


def _add_staved_barrel(bm, p0, p1, radius=0.23, quad_wood=1, quad_iron=2, quad_accent=3, tap_side=False, central_bung=True):
    """Bilged 7-station oak cask with raised iron hoops, central bung hub & optional spigot."""
    v0, v1 = Vector(p0), Vector(p1)
    d = (v1 - v0).normalized()
    pts = [v0.lerp(v1, t) for t in (0.0, 0.14, 0.32, 0.50, 0.68, 0.86, 1.0)]
    rads = [radius * 0.78, radius * 0.90, radius * 1.00, radius * 1.06, radius * 1.00, radius * 0.90, radius * 0.78]
    profile_sweep(bm, pts, rads, profile='oval', sides=14, ridge_count=14, ridge_amp=0.025, quad=quad_wood, cap_ends=True, mark_flat=False)
    for frac, hr in ((0.10, radius * 0.89), (0.33, radius * 1.03), (0.67, radius * 1.03), (0.90, radius * 0.89)):
        hc = v0.lerp(v1, frac)
        profile_sweep(bm, [hc - d * 0.024, hc + d * 0.024], [hr] * 2, profile='oval', sides=14, quad=quad_iron, mark_flat=True)
    if central_bung:
        profile_sweep(bm, [v0 - d * 0.015, v0 + d * 0.015], [radius * 0.24] * 2, profile='oval', sides=8, quad=quad_iron, mark_flat=True)
        profile_sweep(bm, [v1 - d * 0.015, v1 + d * 0.015], [radius * 0.24] * 2, profile='oval', sides=8, quad=quad_iron, mark_flat=True)
    if tap_side:
        sp = v0 - Vector((0, 0, radius * 0.34))
        profile_sweep(bm, [sp + d * 0.01, sp - d * 0.13], [0.032, 0.020], profile='oval', sides=8, quad=quad_accent, mark_flat=True)
        profile_sweep(bm, [sp - d * 0.09, sp - d * 0.09 - Vector((0, 0, 0.06))], [0.016, 0.014], profile='oval', sides=6, quad=quad_accent, mark_flat=True)


def _add_spoked_wheel(bm, center, radius=0.22, width=0.075, spokes=8, quad_wood=1, quad_iron=2):
    """Spoked wooden cart wheel with beveled iron tire rim, felloe, protruding hub & linchpin."""
    cx, cy, cz = center
    # Hub barrel + outer cap + linchpin
    profile_sweep(bm, [(cx, cy - width * 0.95, cz), (cx, cy + width * 0.95, cz)], [radius * 0.28, radius * 0.25], profile='oval', sides=12, quad=quad_iron, mark_flat=True)
    add_chamfered_box(bm, (cx, cy + width * 0.98, cz), (0.024, 0.024, radius * 0.32), quad=quad_iron, bevel=0.004)
    # Wooden felloe + iron tire ring
    segs = max(12, spokes * 2)
    rim_pts = [(cx + math.cos(s / segs * math.tau) * radius, cy, cz + math.sin(s / segs * math.tau) * radius) for s in range(segs)]
    profile_sweep(bm, rim_pts, [(width * 0.48, radius * 0.13)] * segs, profile='rect_chamfer', sides=8, quad=quad_iron, cap_ends=False, mark_flat=True, closed=True)
    for k in range(spokes):
        a = (k / spokes) * math.tau
        p_in = (cx + math.cos(a) * radius * 0.22, cy, cz + math.sin(a) * radius * 0.22)
        p_out = (cx + math.cos(a) * radius * 0.92, cy, cz + math.sin(a) * radius * 0.92)
        timber_joinery(bm, p_in, p_out, width=radius * 0.11, depth=width * 0.54, quad=quad_wood, bow=0.0)


def _add_sculpted_mushroom_cap(
    bm,
    center,
    radius,
    height,
    cap_quad=2,
    gill_quad=3,
    seed=1,
    sides=18,
    gill_count=18,
):
    """Build a thick sculpted asymmetrical mushroom cap with irregular rim & 3D underside gills."""
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    flat_layer = bm.faces.layers.int.get('aaa_flat') or bm.faces.layers.int.new('aaa_flat')
    c_vec = Vector(center)
    u_c0, u_c1, v_c0, v_c1 = zone_uv_bounds(cap_quad)
    u_g0, u_g1, v_g0, v_g1 = zone_uv_bounds(gill_quad)

    # Outer dome profile (rim underside -> thick rolled margin -> mid shoulder -> crown -> apex)
    rings_spec = (
        (0.88, -0.10, True),   # recessed inner underside collar
        (1.00, -0.04, False),  # thick lower margin lip
        (1.03, 0.08, False),   # rolled outer rim thickness
        (0.82, 0.44, False),   # mid shoulder
        (0.46, 0.80, False),   # upper dome
        (0.18, 0.97, False),   # crown collar
    )
    rings = []
    rim_outer_pts = []
    for r_idx, (rf, zf, is_under) in enumerate(rings_spec):
        row = []
        for s in range(sides):
            a = (s / sides) * math.tau
            scallop = 1.0 + 0.12 * math.sin(a * 3.0 + seed * 0.9) + 0.06 * math.cos(a * 5.0 - seed * 1.4) + 0.03 * math.sin(a * 7.0 + seed)
            rr = radius * rf * scallop
            zz = height * (zf + 0.06 * math.sin(a * 2.0 + seed * 0.7) * rf)
            pt = c_vec + Vector((math.cos(a) * rr, math.sin(a) * rr, zz))
            v = bm.verts.new(pt)
            row.append((v, a, is_under, pt))
            if r_idx == 1:
                rim_outer_pts.append(pt)
        rings.append(row)

    top_apex = bm.verts.new(c_vec + Vector((0.02 * radius, -0.01 * radius, height * 1.03)))
    under_apex = bm.verts.new(c_vec + Vector((0.0, 0.0, height * 0.22)))

    for r_idx in range(len(rings) - 1):
        ra, rb = rings[r_idx], rings[r_idx + 1]
        is_gill = ra[0][2]
        u0, u1, v0, v1 = (u_g0, u_g1, v_g0, v_g1) if is_gill else (u_c0, u_c1, v_c0, v_c1)
        va = v0 + (v1 - v0) * (r_idx / len(rings))
        vb = v0 + (v1 - v0) * ((r_idx + 1) / len(rings))
        for s in range(sides):
            sn = (s + 1) % sides
            f = bm.faces.new((ra[s][0], ra[sn][0], rb[sn][0], rb[s][0]))
            f.smooth = True
            ua = u0 + (u1 - u0) * (s / sides)
            ub = u0 + (u1 - u0) * ((s + 1) / sides)
            for loop, uv_c in zip(f.loops, ((ua, va), (ub, va), (ub, vb), (ua, vb))):
                loop[uv_layer].uv = uv_c

    top_ring = rings[-1]
    bot_ring = rings[0]
    for s in range(sides):
        sn = (s + 1) % sides
        ft = bm.faces.new((top_ring[s][0], top_ring[sn][0], top_apex))
        ft.smooth = True
        for loop in ft.loops:
            loop[uv_layer].uv = (0.5 * (u_c0 + u_c1), v_c1 - 0.04)
        fb = bm.faces.new((bot_ring[sn][0], bot_ring[s][0], under_apex))
        fb.smooth = True
        for loop in fb.loops:
            loop[uv_layer].uv = (0.5 * (u_g0 + u_g1), v_g0 + 0.04)

    # 3D radial lamellae gill blades radiating underneath cap from stipe collar to rim
    for g in range(gill_count):
        a = (g / gill_count) * math.tau + 0.12 * seed
        scallop = 1.0 + 0.12 * math.sin(a * 3.0 + seed * 0.9) + 0.06 * math.cos(a * 5.0 - seed * 1.4)
        z_rim = height * (-0.02 + 0.05 * math.sin(a * 2.0 + seed * 0.7))
        p_in = c_vec + Vector((math.cos(a) * radius * 0.22, math.sin(a) * radius * 0.22, height * 0.12))
        p_mid = c_vec + Vector((math.cos(a) * radius * 0.62 * scallop, math.sin(a) * radius * 0.62 * scallop, height * 0.04))
        p_out = c_vec + Vector((math.cos(a) * radius * 0.94 * scallop, math.sin(a) * radius * 0.94 * scallop, z_rim))
        profile_sweep(
            bm,
            [p_in, p_mid, p_out],
            [(0.012, radius * 0.032), (0.014, radius * 0.045), (0.008, radius * 0.018)],
            profile='rect_chamfer',
            sides=6,
            quad=gill_quad,
            mark_flat=True,
        )


# ---------------------------------------------------------------------------
# 1. MINE (5 props)
# ---------------------------------------------------------------------------
def build_mine_ore_hopper_chute():
    bm = bmesh.new()
    # Floor sill sleepers + 4 uneven hand-hewn batter posts with iron collars & wooden pegs
    for sy in (-0.52, 0.52):
        timber_joinery(bm, (-0.78, sy, 0.04), (0.78, sy, 0.04), width=0.14, depth=0.12, quad=1, bow=0.01, pegs=True)
    for sx in (-0.64, 0.64):
        for sy in (-0.52, 0.52):
            timber_joinery(bm, (sx, sy, 0.02), (sx * 0.88, sy * 0.88, 1.48), width=0.16, depth=0.16, quad=1, bow=0.015, wear_seed=int(sx * 10 + sy * 5), tenon_ends=True, pegs=True, iron_straps=True, bracket_ends=True)
        # Side X-braces + bolted central iron gusset plate
        timber_joinery(bm, (sx, -0.50, 0.16), (sx * 0.90, 0.46, 1.32), width=0.09, depth=0.09, quad=1, bow=0.008, pegs=True)
        timber_joinery(bm, (sx, 0.50, 0.16), (sx * 0.90, -0.46, 1.32), width=0.09, depth=0.09, quad=1, bow=-0.008, pegs=True)
        add_chamfered_box(bm, (sx * 0.94, 0.0, 0.74), (0.12, 0.24, 0.24), quad=2, bevel=0.01)

    # Cross bearer beams under chute and hopper throat
    timber_joinery(bm, (-0.62, 0.48, 0.58), (0.62, 0.48, 0.58), width=0.12, depth=0.12, quad=1, pegs=True)
    timber_joinery(bm, (-0.62, -0.46, 0.98), (0.62, -0.46, 0.98), width=0.13, depth=0.13, quad=1, iron_straps=True)

    # True flared trapezoidal hopper funnel with interior metal wear plates & corner bolts
    add_flared_hopper_box(bm, (0.0, 0.0, 1.36), (0.94, 0.82), (1.56, 1.28), height=0.58, wall_t=0.08, quad_wood=1, quad_metal=2, wear_plates=True)

    # Slanted iron-lined discharge chute + cheek walls + pivoted sliding gate lever
    add_chamfered_box(bm, (0.0, -0.28, 1.12), (1.22, 1.46, 0.10), quad=2, rx=0.42, bevel=0.012)
    for cx in (-0.58, 0.58):
        add_chamfered_box(bm, (cx, -0.30, 1.24), (0.08, 1.44, 0.28), quad=1, rx=0.42, bevel=0.01, wear='wood')
    add_chamfered_box(bm, (0.0, -0.58, 1.28), (1.10, 0.06, 0.26), quad=2, rx=0.42, bevel=0.01)
    # Pivot bracket + quadrant lever arm
    add_chamfered_box(bm, (0.68, -0.34, 1.24), (0.12, 0.16, 0.14), quad=2, bevel=0.01)
    timber_joinery(bm, (0.70, -0.34, 1.26), (1.00, -0.56, 1.70), width=0.055, depth=0.055, quad=2, bow=0.0)
    add_chamfered_box(bm, (1.00, -0.56, 1.72), (0.10, 0.14, 0.10), quad=3, bevel=0.012)

    # Rich visible gold ore flow: heaped top hopper load + chute stream + base spill pile
    for j, (ox, oy, oz, sc) in enumerate((
        (-0.22, 0.06, 1.82, (0.48, 0.42, 0.30)),
        (0.20, -0.02, 1.86, (0.46, 0.40, 0.32)),
        (0.0, 0.16, 1.92, (0.44, 0.38, 0.28)),
        (0.02, -0.18, 1.76, (0.42, 0.36, 0.24)),
        (-0.16, -0.52, 1.04, (0.34, 0.30, 0.22)),
        (0.18, -0.64, 0.96, (0.36, 0.30, 0.22)),
        (-0.04, -0.78, 0.86, (0.32, 0.28, 0.20)),
    )):
        structured_fracture(bm, (ox, oy, oz), sc, style='ore_matrix', quad=3 if j % 3 != 2 else 0, seed=20 + j)
    for i, (bx, by, bz, sc) in enumerate((
        (-0.34, -0.76, 0.18, (0.52, 0.46, 0.34)),
        (0.08, -0.82, 0.16, (0.48, 0.42, 0.30)),
        (0.38, -0.70, 0.20, (0.44, 0.38, 0.32)),
    )):
        structured_fracture(bm, (bx, by, bz), sc, style='crag', quad=0 if i != 1 else 3, seed=11 + i)
    semantic_silhouette_constraints(bm, 'mine_ore_hopper_chute')
    return bm


def build_mine_dewatering_pump_rig():
    bm = bmesh.new()
    # Heavy skid frame + recessed sump box + iron bar grate
    timber_joinery(bm, (-0.74, -0.32, 0.06), (0.32, -0.32, 0.06), width=0.16, depth=0.14, quad=1, pegs=True)
    timber_joinery(bm, (-0.74, 0.32, 0.06), (0.32, 0.32, 0.06), width=0.16, depth=0.14, quad=1, pegs=True)
    add_chamfered_box(bm, (-0.22, 0.0, 0.14), (1.06, 0.72, 0.14), quad=1, bevel=0.015, wear='wood')
    add_flared_hopper_box(bm, (0.64, 0.10, 0.02), (0.78, 0.68), (0.86, 0.76), height=0.26, wall_t=0.07, quad_wood=0, quad_metal=2, wear_plates=False)
    for gx in range(-2, 3):
        add_chamfered_box(bm, (0.64 + gx * 0.12, 0.10, 0.27), (0.04, 0.68, 0.04), quad=2, bevel=0.006)
    structured_fracture(bm, (0.64, 0.10, 0.12), (0.58, 0.50, 0.16), style='crag', quad=0, seed=31)

    # Mortised A-frame hoist & fulcrum stanchions straddling Y = +-0.30
    for fy in (-0.30, 0.30):
        timber_joinery(bm, (-0.58, fy, 0.18), (-0.18, fy * 0.72, 1.94), width=0.13, depth=0.13, quad=1, bow=0.008, pegs=True, iron_straps=True, bracket_ends=True)
        timber_joinery(bm, (0.28, fy, 0.18), (-0.18, fy * 0.72, 1.94), width=0.13, depth=0.13, quad=1, bow=-0.008, pegs=True, iron_straps=True)
        # Cross tie brace between A-frame legs
        timber_joinery(bm, (-0.42, fy * 0.90, 0.86), (0.16, fy * 0.90, 0.86), width=0.11, depth=0.11, quad=1, pegs=True)
        add_pillow_block_bearing(bm, (-0.18, fy * 0.72, 1.94), (0, 1, 0), shaft_r=0.055, base_w=0.20, quad_metal=2)
        add_pillow_block_bearing(bm, (0.14, fy * 0.88, 0.86), (0, 1, 0), shaft_r=0.045, base_w=0.18, quad_metal=2)

    # Central fulcrum trunnion shaft + walking beam with arched horsehead & counterweight
    profile_sweep(bm, [(-0.18, -0.34, 1.94), (-0.18, 0.34, 1.94)], [0.052] * 2, profile='oval', sides=10, quad=2, mark_flat=True)
    timber_joinery(bm, (-1.04, 0.0, 2.08), (0.68, 0.0, 1.84), width=0.14, depth=0.16, quad=1, iron_straps=True, bracket_ends=True)
    # Bolted counterweight iron ballast box at -X end
    add_chamfered_box(bm, (-0.98, 0.0, 2.06), (0.30, 0.30, 0.32), quad=2, ry=0.14, bevel=0.02)
    # Curved horsehead arc sector at +X end + crown pulley sheave
    horse_pts = [(0.62, 0.0, 1.94), (0.74, 0.0, 1.84), (0.72, 0.0, 1.66)]
    profile_sweep(bm, horse_pts, [(0.05, 0.08)] * 3, profile='rect_chamfer', sides=8, quad=2, mark_flat=True)
    add_pulley_sheave(bm, (0.66, 0.0, 1.84), (0, 1, 0), radius=0.13, width=0.075, quad_metal=2, clevis_dir=(0, 0, 1))

    # Geared winding drum + ratchet brake wheel + crank handle between A-frame legs (x=0.14, z=0.86)
    add_winding_drum(bm, (0.14, -0.22, 0.86), (0.14, 0.22, 0.86), drum_r=0.12, flange_r=0.20, wraps=6, rope_r=0.018, quad_wood=1, quad_metal=2, quad_rope=1)
    add_gear_wheel_with_pawl(bm, (0.14, -0.34, 0.86), (0, 1, 0), pitch_r=0.22, thickness=0.07, teeth=12, quad_metal=2, with_pawl=True)
    _add_spoked_wheel(bm, (0.14, 0.34, 0.86), radius=0.22, width=0.05, spokes=6, quad_wood=1, quad_iron=2)

    # Flanged pump cylinder barrel + iron discharge sluice trough pouring into sump
    profile_sweep(bm, [(-0.28, 0.0, 0.18), (-0.28, 0.0, 1.82)], [0.16, 0.14], profile='oval', sides=14, quad=2, mark_flat=True)
    for bz in (0.58, 1.12, 1.62):
        profile_sweep(bm, [(-0.28, 0.0, bz), (-0.28, 0.0, bz + 0.07)], [0.19] * 2, profile='oval', sides=14, quad=2, mark_flat=True)
    profile_sweep(bm, [(-0.28, 0.0, 1.68), (0.18, 0.04, 1.44), (0.56, 0.10, 0.92)], [(0.06, 0.08)] * 3, profile='channel_u', sides=8, quad=2, mark_flat=True)

    # Continuous taut rope from drum -> over horsehead pulley -> vertical tensioned drop -> clevis & load bucket/plunger
    add_routed_rope_path(
        bm,
        [(0.14, 0.0, 0.98), (0.36, 0.0, 1.44), (0.64, 0.0, 1.96), (0.76, 0.0, 1.84), (0.70, 0.0, 0.94)],
        rope_r=0.020,
        quad=1,
    )
    add_chamfered_box(bm, (0.70, 0.0, 0.92), (0.09, 0.09, 0.12), quad=2, bevel=0.01)
    add_revolved_vessel(bm, (0.70, 0.0, 0.42), [(0.16, 0.0), (0.20, 0.16), (0.22, 0.34)], sides=12, wall_t=0.035, quad_outer=2, quad_inner=0, ribs=4)
    for sy in (-0.18, 0.18):
        profile_sweep(bm, [(0.70, 0.0, 0.88), (0.70, sy, 0.74)], [0.015] * 2, profile='oval', sides=6, quad=2, mark_flat=True)
    semantic_silhouette_constraints(bm, 'mine_dewatering_pump_rig')
    return bm


def build_mine_powder_magazine_locker():
    bm = bmesh.new()
    # Heavy timber skid runners anchored to ground
    for sy in (-0.34, 0.34):
        timber_joinery(bm, (-0.64, sy, 0.05), (0.64, sy, 0.05), width=0.12, depth=0.10, quad=1, pegs=True)

    # Individual horizontal planked walls (front/back & sides) with V-grooved seams & slight timber warp
    for pz in range(5):
        zc = 0.18 + pz * 0.185
        warp = 0.008 * math.sin(pz * 1.4)
        # Front and back planks
        for sy in (-0.38, 0.38):
            add_chamfered_box(bm, (0.0, sy, zc), (1.14, 0.08, 0.175), quad=1, rz=warp, bevel=0.010, wear='wood', wear_seed=pz + int(sy * 10))
        # Left and right end planks
        for sx in (-0.55, 0.55):
            add_chamfered_box(bm, (sx, 0.0, zc), (0.08, 0.78, 0.175), quad=1, rz=-warp, bevel=0.010, wear='wood', wear_seed=pz + int(sx * 10))

    # Corner timber posts & forged L-shaped iron corner brackets + horizontal reinforcement straps
    for sx in (-0.56, 0.56):
        for sy in (-0.39, 0.39):
            timber_joinery(bm, (sx, sy, 0.10), (sx, sy, 1.02), width=0.10, depth=0.10, quad=2, bow=0.0)
            for hz in (0.24, 0.62, 0.95):
                add_chamfered_box(bm, (sx, sy, hz), (0.14, 0.14, 0.08), quad=2, bevel=0.008)
    for hz in (0.24, 0.62, 0.95):
        add_chamfered_box(bm, (0.0, -0.41, hz), (1.18, 0.04, 0.065), quad=2, bevel=0.008)
        add_chamfered_box(bm, (0.0, 0.41, hz), (1.18, 0.04, 0.065), quad=2, bevel=0.008)

    # Pitched planked functional lid seated cleanly onto side gable filler boards + ridge flashing
    for sx in (-0.54, 0.54):
        add_chamfered_box(bm, (sx, 0.0, 1.06), (0.09, 0.72, 0.14), quad=1, bevel=0.008)
        add_chamfered_box(bm, (sx, 0.0, 1.13), (0.09, 0.34, 0.12), quad=1, bevel=0.008)
    for p_idx, (cy, crx) in enumerate(((-0.24, 0.28), (0.24, -0.28))):
        for plank_i in range(3):
            off_y = (plank_i - 1) * 0.18
            add_chamfered_box(bm, (0.0, cy + off_y * 0.35, 1.10 - abs(off_y) * 0.08), (1.34, 0.20, 0.075), quad=1, rx=crx, bevel=0.009, wear='wood', wear_seed=plank_i + p_idx)
    add_chamfered_box(bm, (0.0, 0.0, 1.21), (1.38, 0.15, 0.08), quad=2, bevel=0.012)
    for hx in (-0.42, 0.0, 0.42):
        add_chamfered_box(bm, (hx, 0.22, 1.14), (0.07, 0.48, 0.09), quad=2, rx=-0.28, bevel=0.008)
        add_chamfered_box(bm, (hx, -0.18, 1.14), (0.07, 0.36, 0.09), quad=2, rx=0.28, bevel=0.008)

    # Functional front hasp plate, staple & padlock assembly + top gold ingots/ore cache
    add_chamfered_box(bm, (0.0, -0.43, 0.66), (0.18, 0.06, 0.34), quad=2, bevel=0.01)
    add_chamfered_box(bm, (0.0, -0.47, 0.56), (0.13, 0.06, 0.16), quad=3, bevel=0.012)
    add_chamfered_box(bm, (-0.28, -0.22, 1.18), (0.34, 0.24, 0.18), quad=3, rz=0.32, bevel=0.015)

    # Coopered powder kegs wedged behind chest on skid rails
    for ox in (-0.44, 0.44):
        _add_staved_barrel(bm, (ox, 0.52, 0.02), (ox, 0.52, 0.74), radius=0.20, quad_wood=1, quad_iron=2, tap_side=False)
    semantic_silhouette_constraints(bm, 'mine_powder_magazine_locker')
    return bm


def build_mine_rail_turntable_switch():
    bm = bmesh.new()
    # Heavy chamfered stone/iron curb pit frame with 4 bolted corner anchor blocks
    add_chamfered_box(bm, (0.0, 0.0, 0.07), (1.72, 1.72, 0.14), quad=0, bevel=0.025, wear='stone', wear_seed=5)
    for cx in (-0.72, 0.72):
        for cy in (-0.72, 0.72):
            add_chamfered_box(bm, (cx, cy, 0.15), (0.28, 0.28, 0.10), quad=2, bevel=0.015)
            profile_sweep(bm, [(cx, cy, 0.18), (cx, cy, 0.23)], [0.03] * 2, profile='oval', sides=6, quad=2, mark_flat=True)

    # Rotating turntable rim collar + heavy beveled iron grate bars & central kingpin hub
    profile_sweep(bm, [(0, 0, 0.08), (0, 0, 0.22)], [0.74, 0.70], profile='oval', sides=24, quad=2, mark_flat=True)
    profile_sweep(bm, [(0, 0, 0.20), (0, 0, 0.28)], [0.16, 0.14], profile='oval', sides=12, quad=2, mark_flat=True)
    for sk in range(6):
        sa = sk * (math.pi / 3.0)
        timber_joinery(bm, (0, 0, 0.20), (0.68 * math.cos(sa), 0.68 * math.sin(sa), 0.20), width=0.09, depth=0.07, quad=1)
        add_chamfered_box(bm, (0.74 * math.cos(sa), 0.74 * math.sin(sa), 0.19), (0.14, 0.14, 0.11), quad=2, rz=sa, bevel=0.012)
    # Beveled steel grate bars spanning turntable bed
    for gb in (-0.54, -0.22, 0.0, 0.22, 0.54):
        add_chamfered_box(bm, (0.0, gb, 0.23), (1.28, 0.05, 0.055), quad=2, bevel=0.008)
        add_chamfered_box(bm, (gb, 0.0, 0.23), (0.05, 1.28, 0.055), quad=2, bevel=0.008)

    # Genuine T-profile flanged mine rails crossing at 90 deg
    for ry in (-0.42, 0.42):
        profile_sweep(bm, [(-0.84, ry, 0.28), (0.84, ry, 0.28)], [(0.045, 0.055)] * 2, profile='t_rail', sides=12, quad=2, mark_flat=True)
        profile_sweep(bm, [(ry, -0.84, 0.28), (ry, 0.84, 0.28)], [(0.045, 0.055)] * 2, profile='t_rail', sides=12, quad=2, mark_flat=True)

    # Grounded throw-switch stand, tie-rod linkage, quadrant sector, counterweight & lantern
    add_chamfered_box(bm, (0.88, 0.64, 0.14), (0.36, 0.36, 0.16), quad=2, bevel=0.02)
    profile_sweep(bm, [(0.88, 0.64, 0.22), (0.58, 0.42, 0.20)], [0.028] * 2, profile='oval', sides=8, quad=2, mark_flat=True)
    timber_joinery(bm, (0.88, 0.64, 0.18), (0.88, 0.64, 1.24), width=0.09, depth=0.09, quad=2, iron_straps=True)
    timber_joinery(bm, (0.88, 0.64, 0.78), (1.18, 0.88, 1.06), width=0.05, depth=0.05, quad=2)
    structured_fracture(bm, (1.18, 0.88, 1.08), (0.18, 0.16, 0.16), style='crag', quad=2, seed=39)
    add_chamfered_box(bm, (0.88, 0.64, 1.25), (0.24, 0.24, 0.26), quad=3, bevel=0.02)
    semantic_silhouette_constraints(bm, 'mine_rail_turntable_switch')
    return bm


def build_mine_assaying_brazier_cart():
    bm = bmesh.new()
    # Tapered trapezoidal planked cart body (wider at top rim than bottom bed)
    add_flared_hopper_box(bm, (0.0, 0.0, 0.34), (1.12, 0.62), (1.38, 0.82), height=0.48, wall_t=0.075, quad_wood=1, quad_metal=2, wear_plates=False)
    add_chamfered_box(bm, (0.0, 0.0, 0.37), (1.16, 0.66, 0.08), quad=1, bevel=0.012, wear='wood')
    # Vertical side stiffener ribs on cart exterior
    for rx_rib in (-0.36, 0.0, 0.36):
        add_chamfered_box(bm, (rx_rib, -0.38, 0.58), (0.07, 0.06, 0.44), quad=2, rx=-0.20, bevel=0.008)
        add_chamfered_box(bm, (rx_rib, 0.38, 0.58), (0.07, 0.06, 0.44), quad=2, rx=0.20, bevel=0.008)

    # Heavy chassis frame + bolted cast-iron axle journal mounts + real axles + spoked wheels
    for cy in (-0.30, 0.30):
        timber_joinery(bm, (-0.58, cy, 0.28), (0.58, cy, 0.28), width=0.11, depth=0.10, quad=1, pegs=True)
    for wx in (-0.44, 0.44):
        profile_sweep(bm, [(wx, -0.52, 0.22), (wx, 0.52, 0.22)], [0.042] * 2, profile='oval', sides=8, quad=2, mark_flat=True)
        for wy in (-0.30, 0.30):
            add_pillow_block_bearing(bm, (wx, wy, 0.22), (0, 1, 0), shaft_r=0.042, base_w=0.18, quad_metal=2)
        for wy in (-0.44, 0.44):
            _add_spoked_wheel(bm, (wx, wy, 0.22), radius=0.22, width=0.07, spokes=8, quad_wood=1, quad_iron=2)

    # Curved U-push handle bars with iron sockets
    for hy in (-0.32, 0.32):
        profile_sweep(bm, [(0.62, hy, 0.72), (0.84, hy, 0.84), (0.98, hy, 0.92)], [0.032, 0.030, 0.028], profile='oval', sides=8, quad=2, mark_flat=True)
    timber_joinery(bm, (0.98, -0.34, 0.92), (0.98, 0.34, 0.92), width=0.065, depth=0.065, quad=1)

    # Round thick-walled assaying crucible pot + prominent high-profile gold ore load & ingots
    add_revolved_vessel(bm, (-0.24, 0.0, 0.72), [(0.20, 0.0), (0.28, 0.14), (0.31, 0.28)], sides=14, wall_t=0.048, quad_outer=2, quad_inner=0, ribs=6)
    for ox, oy, oz, sc, sd in (
        (-0.24, 0.0, 1.00, (0.44, 0.42, 0.24), 41),
        (0.18, -0.10, 0.88, (0.42, 0.36, 0.26), 42),
        (0.24, 0.14, 0.86, (0.38, 0.34, 0.24), 43),
        (0.02, 0.02, 0.94, (0.40, 0.38, 0.24), 44),
    ):
        structured_fracture(bm, (ox, oy, oz), sc, style='ore_matrix', quad=3 if sd != 43 else 0, seed=sd)
    for iz, ox, oy in ((0.76, 0.38, -0.18), (0.76, 0.40, 0.02), (0.82, 0.39, -0.08)):
        add_chamfered_box(bm, (ox, oy, iz), (0.24, 0.11, 0.07), quad=3, bevel=0.01)
    semantic_silhouette_constraints(bm, 'mine_assaying_brazier_cart')
    return bm


# ---------------------------------------------------------------------------
# 2. UMBRA CAVERN (5 props)
# ---------------------------------------------------------------------------
def build_umbra_veil_fungus_parasol():
    bm = bmesh.new()
    # Fractured basalt root outcrop
    structured_fracture(bm, (0.0, 0.0, 0.12), (1.35, 1.24, 0.36), style='crag', quad=0, seed=53)

    # Stage 1: Mature tall parasol on curved fibrous stipe with annular veil ring & underside gills
    stipe_main = [(0.0, 0.0, -0.04), (0.14, 0.08, 0.85), (0.06, 0.02, 1.78), (-0.06, -0.05, 2.52)]
    profile_sweep(bm, stipe_main, [0.27, 0.19, 0.16, 0.15], profile='oval', sides=12, twist_total=0.5, ridge_count=8, ridge_amp=0.05, quad=1)
    # Draped membranous veil collar around upper stipe
    profile_sweep(bm, [(0.02, 0.0, 1.98), (0.04, 0.01, 1.82)], [0.16, 0.29], profile='oval', sides=12, ridge_count=9, ridge_amp=0.08, quad=2)
    _add_sculpted_mushroom_cap(bm, (-0.06, -0.05, 2.50), radius=1.32, height=0.58, cap_quad=2, gill_quad=3, seed=51, sides=20, gill_count=20)

    # Stage 2: Mid-maturity companion leaning out on separate stipe
    stipe_mid = [(0.22, 0.16, 0.02), (0.42, 0.30, 0.48), (0.58, 0.42, 0.96)]
    profile_sweep(bm, stipe_mid, [0.13, 0.095, 0.08], profile='oval', sides=10, ridge_count=6, ridge_amp=0.04, quad=1)
    _add_sculpted_mushroom_cap(bm, (0.58, 0.42, 0.95), radius=0.50, height=0.26, cap_quad=2, gill_quad=3, seed=52, sides=14, gill_count=12)

    # Stage 3: Two juvenile conical mushrooms at base
    for off_x, off_y, h_j, r_j, sd in ((-0.36, -0.28, 0.56, 0.24, 54), (0.28, -0.38, 0.40, 0.18, 55)):
        profile_sweep(bm, [(off_x * 0.4, off_y * 0.4, 0.02), (off_x * 0.8, off_y * 0.8, h_j * 0.52), (off_x, off_y, h_j)], [r_j * 0.28, r_j * 0.20, r_j * 0.18], profile='oval', sides=8, quad=1)
        _add_sculpted_mushroom_cap(bm, (off_x, off_y, h_j), radius=r_j, height=h_j * 0.42, cap_quad=2, gill_quad=3, seed=sd, sides=12, gill_count=8)

    semantic_silhouette_constraints(bm, 'umbra_veil_fungus_parasol')
    return bm


def build_umbra_crystal_resonator_obelisk():
    bm = bmesh.new()
    rng = random.Random(61)
    # Stepped basalt plinth & dark stone retaining brackets
    structured_fracture(bm, (0.0, 0.0, 0.18), (1.28, 1.24, 0.36), style='stone_slab', quad=0, seed=62)
    profile_sweep(bm, [(0, 0, 0.28), (0, 0, 0.50)], [0.54, 0.44], profile='oval', sides=8, quad=0, mark_flat=True)
    for ci in range(4):
        ca = ci * (math.pi * 0.5) + math.pi * 0.25
        timber_joinery(bm, (0.50 * math.cos(ca), 0.50 * math.sin(ca), 0.34), (0.28 * math.cos(ca), 0.28 * math.sin(ca), 0.82), width=0.08, depth=0.08, quad=1)

    # Preserve tall DARK CENTRAL STONE OBELISK (parent_quad=1) + intergrown glowing cyan secondary crystals (child_quad=3)
    crystal_growth_graph(
        bm,
        (0.0, 0.0, 0.34),
        height=2.45,
        radius=0.68,
        rng=rng,
        parent_quad=1,
        child_quad=3,
        rock_quad=0,
        parent_sides=6,
        parent_count=1,
        daughter_count=7,
        basal_count=6,
        stepped=True,
        directional_tilt=(0.03, -0.02),
        with_rock_base=False,
    )
    semantic_silhouette_constraints(bm, 'umbra_crystal_resonator_obelisk')
    return bm


def build_umbra_hanging_censer_spire():
    bm = bmesh.new()
    rng = random.Random(69)
    # Stepped octagonal basalt plinth + forged metal socket collar + 4 arched gothic buttress ribs
    structured_fracture(bm, (0.0, 0.0, 0.14), (0.84, 0.84, 0.28), style='stone_slab', quad=0, seed=68)
    profile_sweep(bm, [(0, 0, 0.22), (0, 0, 0.48)], [0.36, 0.22], profile='oval', sides=8, quad=1, mark_flat=True)
    for bi in range(4):
        ba = bi * (math.pi * 0.5)
        cx, cy = math.cos(ba), math.sin(ba)
        profile_sweep(bm, [(0.34 * cx, 0.34 * cy, 0.16), (0.20 * cx, 0.20 * cy, 0.62), (0.08 * cx, 0.08 * cy, 1.06)], [0.055, 0.045, 0.038], profile='rect_chamfer', sides=8, quad=1, mark_flat=True)

    # Tapered octagonal post shaft with forged socket collars
    profile_sweep(bm, [(0, 0, 0.42), (0.02, 0, 1.48), (0.04, 0, 2.48)], [0.095, 0.075, 0.062], profile='oval', sides=8, quad=1, mark_flat=True)
    for cz in (1.06, 1.72, 2.18, 2.44):
        profile_sweep(bm, [(0.02, 0, cz - 0.04), (0.02, 0, cz + 0.04)], [0.11] * 2, profile='oval', sides=8, quad=2, mark_flat=True)

    # Socketed crystal finial at spire peak
    crystal_growth_graph(bm, (0.04, 0, 2.46), height=0.32, radius=0.10, rng=rng, parent_quad=3, child_quad=2, parent_count=1, daughter_count=2, basal_count=0, with_rock_base=False)

    # Distinctive S-curved bent gooseneck supporting arm + scrolled under-brace
    arm_pts = [(0.04, 0, 2.18), (0.24, 0, 2.44), (0.48, 0, 2.66), (0.68, 0, 2.62), (0.72, 0, 2.50)]
    profile_sweep(bm, arm_pts, [(0.048, 0.045), (0.042, 0.040), (0.038, 0.036), (0.032, 0.032), (0.028, 0.028)], profile='rect_chamfer', sides=8, quad=1, mark_flat=True)
    profile_sweep(bm, [(0.04, 0, 1.74), (0.26, 0, 2.12), (0.50, 0, 2.46)], [0.036, 0.032, 0.026], profile='rect_chamfer', sides=8, quad=2, mark_flat=True)

    # Real 3D chain links suspending a hexagonal wrought-iron lantern cage around glowing crystal
    add_chain_link_span(bm, (0.72, 0, 2.48), (0.72, 0, 2.10), link_len=0.10, link_w=0.056, wire_r=0.012, quad=2)
    # Lantern cage top conical hood, top/bottom guard rings, 6 bowed ribs & spike finial
    profile_sweep(bm, [(0.72, 0, 2.10), (0.72, 0, 2.02), (0.72, 0, 1.96)], [0.04, 0.14, 0.21], profile='oval', sides=6, quad=1, mark_flat=True)
    profile_sweep(bm, [(0.72, 0, 1.66), (0.72, 0, 1.60), (0.72, 0, 1.50)], [0.17, 0.12, 0.02], profile='oval', sides=6, quad=1, mark_flat=True)
    for ri in range(6):
        a = (ri / 6.0) * math.tau
        ca, sa = math.cos(a), math.sin(a)
        profile_sweep(bm, [(0.72 + 0.19 * ca, 0.19 * sa, 1.96), (0.72 + 0.23 * ca, 0.23 * sa, 1.80), (0.72 + 0.16 * ca, 0.16 * sa, 1.66)], [0.016] * 3, profile='oval', sides=6, quad=2, mark_flat=True)
    crystal_growth_graph(bm, (0.72, 0, 1.66), height=0.34, radius=0.14, rng=rng, parent_quad=3, child_quad=3, parent_count=1, daughter_count=3, basal_count=0, with_rock_base=False)
    semantic_silhouette_constraints(bm, 'umbra_hanging_censer_spire')
    return bm


def build_umbra_spider_web_balustrade_shrine():
    bm = bmesh.new()
    rng = random.Random(71)
    # Stepped shrine plinth + 4 reinforced corner pillars with bases, collars, capitals & corner spires
    structured_fracture(bm, (0.0, 0.0, 0.18), (1.36, 1.36, 0.36), style='stone_slab', quad=0, seed=70)
    for px, py in ((-0.46, -0.46), (0.46, -0.46), (-0.46, 0.46), (0.46, 0.46)):
        add_chamfered_box(bm, (px, py, 0.39), (0.22, 0.22, 0.10), quad=0, bevel=0.015)
        timber_joinery(bm, (px, py, 0.40), (px, py, 1.84), width=0.16, depth=0.16, quad=1, iron_straps=True, strap_quad=2)
        add_chamfered_box(bm, (px, py, 1.84), (0.22, 0.22, 0.10), quad=0, bevel=0.015)
        crystal_growth_graph(bm, (px, py, 2.00), height=0.34, radius=0.09, rng=rng, parent_quad=2, child_quad=3, parent_count=1, daughter_count=2, basal_count=0, with_rock_base=False)

    # Lower balustrade rails, balusters & spider-webbed diagonal arch struts
    for side in (-0.46, 0.46):
        timber_joinery(bm, (-0.46, side, 0.68), (0.46, side, 0.68), width=0.08, depth=0.08, quad=1)
        timber_joinery(bm, (side, -0.46, 0.68), (side, 0.46, 0.68), width=0.08, depth=0.08, quad=1)
        for sx in (-0.28, 0.0, 0.28):
            profile_sweep(bm, [(sx, side, 0.36), (sx, side, 0.68)], [0.032] * 2, profile='oval', sides=6, quad=1, mark_flat=True)
            profile_sweep(bm, [(side, sx, 0.36), (side, sx, 0.68)], [0.032] * 2, profile='oval', sides=6, quad=1, mark_flat=True)
        # Upper canopy webbed diagonal corner braces
        for sgn in (-1, 1):
            timber_joinery(bm, (sgn * 0.46, side, 1.54), (sgn * 0.22, side, 1.86), width=0.055, depth=0.055, quad=2)
            timber_joinery(bm, (side, sgn * 0.46, 1.54), (side, sgn * 0.22, 1.86), width=0.055, depth=0.055, quad=2)

    # Central altar pedestal + round revolved offering chalice cradling glowing crystal
    profile_sweep(bm, [(0, 0, 0.34), (0, 0, 0.88)], [0.22, 0.16], profile='oval', sides=8, quad=0, mark_flat=True)
    add_revolved_vessel(bm, (0, 0, 0.86), [(0.15, 0.0), (0.24, 0.10), (0.28, 0.20)], sides=12, wall_t=0.04, quad_outer=2, quad_inner=0, ribs=6)
    crystal_growth_graph(bm, (0, 0, 0.98), height=0.38, radius=0.16, rng=rng, parent_quad=3, child_quad=2, parent_count=1, daughter_count=4, basal_count=0, with_rock_base=False)

    # Canopy entablature combining RIBBED SHRINE DOME + SHARP CRYSTAL CROWN erupting from oculus!
    add_chamfered_box(bm, (0, 0, 1.92), (1.30, 1.30, 0.20), quad=0, bevel=0.03, wear='stone')
    profile_sweep(bm, [(0, 0, 2.00), (0, 0, 2.18), (0, 0, 2.30), (0, 0, 2.36)], [0.48, 0.42, 0.28, 0.16], profile='oval', sides=14, ridge_count=8, ridge_amp=0.05, quad=3)
    profile_sweep(bm, [(0, 0, 2.00), (0, 0, 2.08)], [0.52, 0.50], profile='oval', sides=14, quad=2, mark_flat=True)
    crystal_growth_graph(bm, (0, 0, 2.12), height=0.46, radius=0.22, rng=rng, parent_quad=3, child_quad=2, parent_count=1, daughter_count=4, basal_count=0, with_rock_base=False)
    semantic_silhouette_constraints(bm, 'umbra_spider_web_balustrade_shrine')
    return bm


def build_umbra_tide_gondola_skiff():
    bm = bmesh.new()
    rng = random.Random(77)
    # Twin curved sled runners underneath with upturned iron prow shoes & mortised riser blocks
    for ry in (-0.30, 0.30):
        runner_pts = [(-1.42, ry, 0.26), (-1.10, ry, 0.04), (0.0, ry, 0.02), (1.10, ry, 0.04), (1.46, ry, 0.28)]
        profile_sweep(bm, runner_pts, [(0.045, 0.055)] * 5, profile='rect_chamfer', sides=8, quad=2, mark_flat=True)
        for rx_post in (-0.75, 0.0, 0.75):
            timber_joinery(bm, (rx_post, ry, 0.05), (rx_post, ry, 0.24), width=0.07, depth=0.07, quad=1)

    # Keel timber arching smoothly at stem & stern + flat floor planks
    keel_pts = [(-1.66, 0, 0.54), (-0.98, 0, 0.16), (0, 0, 0.10), (0.98, 0, 0.16), (1.68, 0, 0.58)]
    profile_sweep(bm, keel_pts, [0.09, 0.11, 0.11, 0.11, 0.09], profile='rect_chamfer', sides=8, quad=1, mark_flat=True)
    add_chamfered_box(bm, (0.0, 0.0, 0.18), (2.15, 0.68, 0.07), quad=1, bevel=0.015, wear='wood')

    # Sweeping curved gunwale & chine rails + steamed hull ribs
    for side_y in (-1, 1):
        gunwale = [(-1.58, 0.03 * side_y, 0.54), (-0.82, 0.40 * side_y, 0.42), (0.0, 0.46 * side_y, 0.40), (0.82, 0.40 * side_y, 0.42), (1.60, 0.03 * side_y, 0.60)]
        profile_sweep(bm, gunwale, [0.052] * 5, profile='rect_chamfer', sides=8, quad=1, mark_flat=True)
        chine = [(-1.42, 0.03 * side_y, 0.36), (-0.75, 0.34 * side_y, 0.22), (0.0, 0.39 * side_y, 0.20), (0.75, 0.34 * side_y, 0.22), (1.44, 0.03 * side_y, 0.40)]
        profile_sweep(bm, chine, [0.045] * 5, profile='rect_chamfer', sides=8, quad=1, mark_flat=True)
    for sx in (-0.80, -0.40, 0.0, 0.40, 0.80):
        hw = 0.42 * (1.0 - 0.32 * (abs(sx) / 0.90))
        timber_joinery(bm, (sx, -hw, 0.21), (sx, hw, 0.21), width=0.065, depth=0.05, quad=1)
        timber_joinery(bm, (sx, -hw, 0.21), (sx, -hw * 1.06, 0.41), width=0.055, depth=0.05, quad=1)
        timber_joinery(bm, (sx, hw, 0.21), (sx, hw * 1.06, 0.41), width=0.055, depth=0.05, quad=1)

    # Layered magical inlay thwarts (recessed channel bench + metallic border + faceted cyan inlay bar)
    for sx in (-0.56, 0.0, 0.56):
        add_chamfered_box(bm, (sx, 0, 0.40), (0.26, 0.80, 0.055), quad=1, bevel=0.01)
        add_chamfered_box(bm, (sx, 0, 0.43), (0.16, 0.68, 0.025), quad=2, bevel=0.006)
        add_chamfered_box(bm, (sx, 0, 0.445), (0.09, 0.56, 0.03), quad=3, bevel=0.008)

    # Prow stempost with forged socket claw & navigator crystal cluster
    timber_joinery(bm, (1.38, 0, 0.48), (1.66, 0, 1.12), width=0.075, depth=0.075, quad=2, iron_straps=True)
    crystal_growth_graph(bm, (1.66, 0, 1.08), height=0.34, radius=0.11, rng=rng, parent_quad=3, child_quad=2, parent_count=1, daughter_count=3, basal_count=0, with_rock_base=False)
    semantic_silhouette_constraints(bm, 'umbra_tide_gondola_skiff')
    return bm


# ---------------------------------------------------------------------------
# 3. STONEHOLD HOLD (5 props)
# ---------------------------------------------------------------------------
def build_stonehold_drop_hammer_forge_press():
    bm = bmesh.new()
    # Multi-tier carved granite foundation with recessed side panels & chipped stone edges
    structured_fracture(bm, (0, 0, 0.14), (1.46, 1.20, 0.28), style='carved_ashlar', quad=0, seed=80)
    add_chamfered_box(bm, (0, 0, 0.34), (1.28, 1.04, 0.16), quad=0, bevel=0.02, wear='stone', wear_seed=81)

    # Twin carved stone pillars with recessed panels, bolted bronze V-guide rails & stepped capitals
    for sx in (-0.52, 0.52):
        structured_fracture(bm, (sx, 0, 1.44), (0.28, 0.40, 2.08), style='carved_ashlar', quad=0, seed=82 + int(sx * 10), strata_layers=2)
        add_chamfered_box(bm, (sx, 0, 2.40), (0.34, 0.46, 0.14), quad=0, bevel=0.015)
        # Inner bronze guide rail bolted to pillar face
        in_x = sx - (0.14 if sx > 0 else -0.14)
        add_chamfered_box(bm, (in_x, 0, 1.46), (0.06, 0.14, 1.92), quad=2, bevel=0.008)

    # Overhead crosshead beam + mechanical drive gear housing & spoked hand-wheel
    add_chamfered_box(bm, (0, 0, 2.54), (1.50, 0.52, 0.28), quad=2, bevel=0.025)
    add_chamfered_box(bm, (0, 0, 2.68), (0.56, 0.42, 0.14), quad=0, bevel=0.02)
    profile_sweep(bm, [(-0.08, 0, 2.56), (0.86, 0, 2.56)], [0.045] * 2, profile='oval', sides=8, quad=2, mark_flat=True)
    _add_spoked_wheel(bm, (0.84, 0, 2.56), radius=0.22, width=0.06, spokes=6, quad_wood=2, quad_iron=0)
    # Note: wheel axis in _add_spoked_wheel is along Y; orient handwheel cleanly on front/side or add flywheel along X:
    add_gear_wheel_with_pawl(bm, (0.0, -0.26, 2.54), (0, 1, 0), pitch_r=0.20, thickness=0.08, teeth=10, quad_metal=2, with_pawl=False)

    # Credible mechanical moving tup: vertical acme screw shaft connecting crosshead to sliding hammer head
    profile_sweep(bm, [(0, 0, 1.84), (0, 0, 2.50)], [0.068] * 2, profile='oval', sides=10, ridge_count=6, ridge_amp=0.10, quad=2, mark_flat=True)
    add_chamfered_box(bm, (0, 0, 1.62), (0.54, 0.44, 0.48), quad=2, bevel=0.025)
    # Guide shoes clasping vertical pillar guide rails cleanly
    for sx in (-0.34, 0.34):
        add_chamfered_box(bm, (sx, 0, 1.62), (0.14, 0.24, 0.34), quad=2, bevel=0.01)

    # Anvil bolster, iron anvil + glowing golden ingot billet + side trip lever
    add_chamfered_box(bm, (0, 0, 0.54), (0.64, 0.48, 0.24), quad=1, bevel=0.02)
    add_chamfered_box(bm, (0, 0, 0.74), (0.52, 0.38, 0.18), quad=2, bevel=0.015)
    timber_joinery(bm, (-0.36, 0, 0.74), (0.48, 0, 0.74), width=0.20, depth=0.14, quad=2)
    structured_fracture(bm, (-0.06, -0.28, 0.88), (0.24, 0.22, 0.14), style='ore_matrix', quad=3, seed=81)
    semantic_silhouette_constraints(bm, 'stonehold_drop_hammer_forge_press')
    return bm


def build_stonehold_runic_brazier_pedestal():
    bm = bmesh.new()
    # Stepped carved stone base plinth + octagonal pedestal with recessed runic panels & flared capital
    structured_fracture(bm, (0, 0, 0.18), (1.12, 1.12, 0.36), style='carved_ashlar', quad=0, seed=84)
    profile_sweep(bm, [(0, 0, 0.34), (0, 0, 0.46), (0, 0, 1.06), (0, 0, 1.18)], [0.38, 0.34, 0.28, 0.40], profile='oval', sides=8, quad=0, mark_flat=True)
    for ca in (0.0, math.pi * 0.5, math.pi, math.pi * 1.5):
        # Recessed golden runic inlays on pedestal faces + 4 forged bronze scroll corbels cradling bowl
        rx, ry = math.cos(ca), math.sin(ca)
        add_chamfered_box(bm, (0.29 * rx, 0.29 * ry, 0.76), (0.05 if abs(rx) > 0.5 else 0.14, 0.05 if abs(ry) > 0.5 else 0.14, 0.44), quad=3, bevel=0.006)
        profile_sweep(bm, [(0.36 * rx, 0.36 * ry, 0.96), (0.46 * rx, 0.46 * ry, 1.14), (0.48 * rx, 0.48 * ry, 1.30)], [0.045, 0.040, 0.035], profile='rect_chamfer', sides=8, quad=2, mark_flat=True)

    # RESTORE CEREMONIAL ROUND/12-SIDED FLARED BRAZIER BOWL SILHOUETTE
    add_revolved_vessel(
        bm,
        (0.0, 0.0, 1.16),
        [(0.28, 0.0), (0.42, 0.12), (0.52, 0.26), (0.55, 0.38)],
        sides=12,
        wall_t=0.055,
        quad_outer=2,
        quad_inner=0,
        ribs=6,
        rim_lip=True,
        handles=True,
    )
    # Glowing golden ember mound inside the concave bowl interior
    for i, (ex, ey, ez, sc) in enumerate((
        (0.0, 0.0, 1.56, (0.68, 0.68, 0.36)),
        (-0.14, 0.10, 1.62, (0.36, 0.34, 0.24)),
        (0.14, -0.10, 1.60, (0.34, 0.34, 0.22)),
    )):
        structured_fracture(bm, (ex, ey, ez), sc, style='ore_matrix', quad=3, seed=85 + i)
    semantic_silhouette_constraints(bm, 'stonehold_runic_brazier_pedestal')
    return bm


def build_stonehold_geared_capstan_winch():
    bm = bmesh.new()
    # Stepped carved granite foundation bedplate + recessed gear pit collar
    structured_fracture(bm, (0, 0, 0.16), (1.30, 1.30, 0.32), style='carved_ashlar', quad=0, seed=86)
    profile_sweep(bm, [(0, 0, 0.28), (0, 0, 0.36)], [0.58, 0.56], profile='oval', sides=16, quad=0, mark_flat=True)

    # Central rotating capstan shaft + large meshed bronze crown gear wheel + coiled rope drum
    profile_sweep(bm, [(0, 0, 0.30), (0, 0, 1.38)], [0.14, 0.14], profile='oval', sides=12, quad=2, mark_flat=True)
    add_gear_wheel_with_pawl(bm, (0, 0, 0.52), (0, 0, 1), pitch_r=0.52, thickness=0.11, teeth=14, quad_metal=2, with_pawl=True)
    add_winding_drum(bm, (0, 0, 0.62), (0, 0, 1.08), drum_r=0.25, flange_r=0.33, wraps=5, rope_r=0.022, quad_wood=1, quad_metal=2, quad_rope=1)

    # Side pinion drive gear + shaft + bolted bearing pedestal meshing with main gear
    add_pillow_block_bearing(bm, (0.50, 0.44, 0.44), (0, 0, 1), shaft_r=0.045, base_w=0.22, quad_metal=2)
    profile_sweep(bm, [(0.50, 0.44, 0.30), (0.50, 0.44, 0.86)], [0.055] * 2, profile='oval', sides=10, quad=2, mark_flat=True)
    add_gear_wheel_with_pawl(bm, (0.50, 0.44, 0.54), (0, 0, 1), pitch_r=0.18, thickness=0.10, teeth=8, quad_metal=2, with_pawl=False)
    add_chamfered_box(bm, (0.50, 0.44, 0.88), (0.28, 0.08, 0.06), quad=2, bevel=0.008)

    # Upper iron-strapped capstan head + 4 tapered oak capstan bars with iron ferrules
    profile_sweep(bm, [(0, 0, 1.08), (0, 0, 1.36)], [0.34, 0.32], profile='oval', sides=12, quad=2, mark_flat=True)
    timber_joinery(bm, (-0.74, 0, 1.22), (0.74, 0, 1.22), width=0.11, depth=0.11, quad=1, iron_straps=True, strap_quad=2)
    timber_joinery(bm, (0, -0.74, 1.22), (0, 0.74, 1.22), width=0.11, depth=0.11, quad=1, iron_straps=True, strap_quad=2)
    semantic_silhouette_constraints(bm, 'stonehold_geared_capstan_winch')
    return bm


def build_stonehold_ancestor_relief_stele():
    bm = bmesh.new()
    # Multi-stepped granite base with corner buttresses
    structured_fracture(bm, (0, 0, 0.18), (1.36, 0.88, 0.36), style='carved_ashlar', quad=0, seed=87)
    add_chamfered_box(bm, (0, 0, 0.42), (1.14, 0.68, 0.14), quad=0, bevel=0.02, wear='stone')

    # Recessed central shrine architecture: back wall + flanking fluted pilasters + upper/lower sills
    add_chamfered_box(bm, (0, 0.06, 1.40), (0.94, 0.32, 1.88), quad=0, bevel=0.03, wear='stone', wear_seed=88)
    for sx in (-0.38, 0.38):
        structured_fracture(bm, (sx, -0.14, 1.40), (0.22, 0.18, 1.82), style='carved_ashlar', quad=0, seed=89 + int(sx * 10), strata_layers=2)
        add_chamfered_box(bm, (sx, -0.16, 2.24), (0.26, 0.22, 0.12), quad=2, bevel=0.015)

    # Illuminated runic recess panel + overlaid 3D bronze geometric dwarf fretwork & ancestral helm crest
    add_chamfered_box(bm, (0, -0.11, 1.42), (0.54, 0.06, 1.24), quad=3, bevel=0.01)
    for rz_bar in (0.96, 1.42, 1.88):
        add_chamfered_box(bm, (0, -0.15, rz_bar), (0.56, 0.05, 0.06), quad=2, bevel=0.008)
    for rx_bar in (-0.16, 0.16):
        add_chamfered_box(bm, (rx_bar, -0.15, 1.42), (0.05, 0.05, 1.18), quad=2, bevel=0.008)
    # Sculpted ancestral crown/beard crest inside niche
    add_chamfered_box(bm, (0, -0.18, 1.62), (0.26, 0.10, 0.28), quad=0, bevel=0.02)
    add_chamfered_box(bm, (0, -0.19, 1.76), (0.32, 0.09, 0.09), quad=2, bevel=0.012)

    # Corbelled bronze/stone cornice + stepped pediment crown
    add_chamfered_box(bm, (0, 0, 2.38), (1.14, 0.56, 0.18), quad=2, bevel=0.025)
    structured_fracture(bm, (0, 0, 2.52), (0.86, 0.44, 0.16), style='carved_ashlar', quad=0, seed=90)
    semantic_silhouette_constraints(bm, 'stonehold_ancestor_relief_stele')
    return bm


def build_stonehold_ingot_crane_trolley():
    bm = bmesh.new()
    # Stepped granite footing + bolted slewing pintle collar bearing
    structured_fracture(bm, (0, 0, 0.16), (1.30, 0.98, 0.32), style='carved_ashlar', quad=0, seed=91)
    add_pillow_block_bearing(bm, (-0.26, 0.0, 0.36), (0, 0, 1), shaft_r=0.14, base_w=0.46, quad_metal=2)

    # Heavy vertical mast + rear counterweight tail-boom with strapped stone ballast + front jib & knee brace
    timber_joinery(bm, (-0.26, 0, 0.30), (-0.26, 0, 2.28), width=0.24, depth=0.24, quad=2, iron_straps=True, strap_quad=0)
    timber_joinery(bm, (-0.24, 0, 1.24), (0.50, 0, 2.12), width=0.14, depth=0.14, quad=2, pegs=True)
    # Jib beam extending from counterweight tail (-0.72) to forward nose (+1.04)
    add_chamfered_box(bm, (0.18, 0, 2.18), (1.76, 0.16, 0.18), quad=2, bevel=0.02)
    # Counterweight ballast block slung at rear tail-boom
    structured_fracture(bm, (-0.64, 0, 1.94), (0.34, 0.34, 0.30), style='carved_ashlar', quad=0, seed=92)
    add_chamfered_box(bm, (-0.64, 0, 1.94), (0.38, 0.36, 0.06), quad=2, bevel=0.008)

    # Mast-mounted geared winding drum + spoked hand-crank wheel + masthead sheave
    add_winding_drum(bm, (-0.26, -0.22, 1.04), (-0.26, 0.22, 1.04), drum_r=0.14, flange_r=0.22, wraps=6, rope_r=0.018, quad_wood=1, quad_metal=2, quad_rope=1)
    _add_spoked_wheel(bm, (-0.26, -0.32, 1.04), radius=0.24, width=0.05, spokes=6, quad_wood=2, quad_iron=0)
    add_pulley_sheave(bm, (-0.26, 0.0, 2.28), (0, 1, 0), radius=0.12, width=0.07, quad_metal=2)

    # Wheeled overhead trolley carriage + grooved trolley sheave
    add_chamfered_box(bm, (0.86, 0, 2.18), (0.30, 0.28, 0.24), quad=2, bevel=0.015)
    for tx in (0.76, 0.96):
        profile_sweep(bm, [(tx, -0.16, 2.28), (tx, 0.16, 2.28)], [0.055] * 2, profile='oval', sides=8, quad=0, mark_flat=True)
    add_pulley_sheave(bm, (0.86, 0, 2.00), (0, 1, 0), radius=0.10, width=0.06, quad_metal=2)

    # Continuous aligned rope from winch drum -> masthead sheave -> along jib -> trolley sheave -> hook block
    add_routed_rope_path(
        bm,
        [(-0.18, 0.0, 1.12), (-0.22, 0.0, 2.38), (0.88, 0.0, 2.10), (0.86, 0.0, 1.54)],
        rope_r=0.018,
        quad=1,
    )
    # Hanging hook block + dual chain slings hooked to side trunnion lugs of round bronze crucible cauldron
    add_chamfered_box(bm, (0.86, 0, 1.52), (0.10, 0.10, 0.12), quad=2, bevel=0.01)
    for vy in (-0.22, 0.22):
        add_chain_link_span(bm, (0.86, 0, 1.46), (0.86, vy, 1.14), link_len=0.09, link_w=0.05, wire_r=0.011, quad=2)
        add_chamfered_box(bm, (0.86, vy, 1.12), (0.07, 0.07, 0.07), quad=2, bevel=0.008)
    add_revolved_vessel(bm, (0.86, 0, 0.88), [(0.17, 0.0), (0.23, 0.14), (0.25, 0.26)], sides=14, wall_t=0.042, quad_outer=2, quad_inner=0, ribs=6)
    structured_fracture(bm, (0.86, 0, 1.13), (0.34, 0.30, 0.12), style='ore_matrix', quad=3, seed=89)
    semantic_silhouette_constraints(bm, 'stonehold_ingot_crane_trolley')
    return bm


# ---------------------------------------------------------------------------
# 4. FROSTGARD GLACIER CAVE (5 props)
# ---------------------------------------------------------------------------
def build_frostgard_organ_pipe_ice_formation():
    bm = bmesh.new()
    structured_fracture(bm, (0, 0, 0.16), (2.25, 2.10, 0.36), style='stone_slab', quad=0, seed=91)
    structured_fracture(bm, (0.12, -0.10, 0.24), (1.75, 1.60, 0.26), style='frost_drift', quad=2, seed=92)
    # 7 fused vertical/near-vertical fluted organ-pipe columns preserving colonnade silhouette
    pipes = (
        (0.0, 0.0, 3.20, 0.27, (0.04, -0.02, 1.0)),
        (-0.40, 0.22, 2.65, 0.20, (-0.06, 0.04, 1.0)),
        (0.42, 0.18, 2.80, 0.21, (0.07, 0.03, 1.0)),
        (-0.28, -0.34, 2.28, 0.18, (-0.04, -0.06, 1.0)),
        (0.30, -0.32, 2.45, 0.19, (0.05, -0.05, 1.0)),
        (-0.14, 0.44, 1.85, 0.15, (-0.03, 0.08, 1.0)),
        (0.18, -0.46, 1.60, 0.14, (0.04, -0.08, 1.0)),
    )
    for idx, (dx, dy, h, r, axis) in enumerate(pipes):
        build_prism_crystal(
            bm,
            (dx, dy, 0.12),
            Vector(axis),
            r,
            r * 0.42,
            h,
            sides=8,
            chisel_skew=0.18 + (idx % 3) * 0.06,
            flatness=1.0,
            stepped=True,
            quad=1 if idx % 2 == 0 else 2,
            tip_chip=(idx % 2 == 1),
        )
    # 6 shorter angled basal ice shards around the collar
    for b_i in range(6):
        a = (b_i / 6.0) * math.tau + 0.35
        bx, by = math.cos(a) * 0.62, math.sin(a) * 0.62
        build_prism_crystal(
            bm,
            (bx, by, 0.10),
            Vector((math.cos(a) * 0.48, math.sin(a) * 0.48, 0.88)),
            0.11,
            0.03,
            0.78 + (b_i % 2) * 0.26,
            sides=6,
            chisel_skew=0.30,
            flatness=0.80,
            stepped=False,
            quad=2 if b_i % 2 else 1,
            tip_chip=True,
        )
    semantic_silhouette_constraints(bm, 'frostgard_organ_pipe_ice_formation')
    return bm


def build_frostgard_hoarfrost_rose_cluster():
    bm = bmesh.new()
    rng = random.Random(101)
    # Natural crag & frost drift base matching original 1.95m footprint
    structured_fracture(bm, (0, 0, 0.16), (1.84, 1.76, 0.34), style='crag', quad=0, seed=101)
    structured_fracture(bm, (-0.12, 0.08, 0.24), (1.42, 1.36, 0.24), style='frost_drift', quad=2, seed=102)
    # Radiating directional fan of 10 stout ice prism blades + 6 epitaxial branching plates
    for i in range(10):
        a = (i / 10.0) * math.tau + 0.18
        out_tilt = 0.38 + (i % 3) * 0.18
        axis = Vector((math.cos(a) * out_tilt + 0.18, math.sin(a) * out_tilt - 0.08, 1.0)).normalized()
        r_b = 0.16 + (i % 3) * 0.04
        h_b = 1.05 + (i % 3) * 0.28
        base_pt = Vector((math.cos(a) * 0.22, math.sin(a) * 0.22, 0.14))
        build_prism_crystal(
            bm,
            base_pt,
            axis,
            r_b,
            r_b * 0.38,
            h_b,
            sides=6 if i % 2 == 0 else 5,
            chisel_skew=0.28,
            flatness=0.72 if i % 2 else 0.90,
            stepped=(i % 2 == 0),
            quad=1 if i % 3 != 2 else 2,
            tip_chip=(i % 2 == 1),
        )
        if i < 6:
            # Epitaxial branching plate emerging from lower third of main blade
            branch_base = base_pt + axis * (h_b * 0.24)
            branch_axis = (axis + Vector((math.cos(a + 0.4) * 0.45, math.sin(a + 0.4) * 0.45, 0.40))).normalized()
            build_prism_crystal(
                bm,
                branch_base,
                branch_axis,
                r_b * 0.65,
                r_b * 0.22,
                h_b * rng.uniform(0.42, 0.58),
                sides=5,
                chisel_skew=0.32,
                flatness=0.62,
                stepped=False,
                quad=2,
                tip_chip=True,
            )
    semantic_silhouette_constraints(bm, 'frostgard_hoarfrost_rose_cluster')
    return bm


def build_frostgard_frozen_melt_mushroom_column():
    bm = bmesh.new()
    # RESTORE ICE MUSHROOM SILHOUETTE: basalt/frost footing + waisted fluted ice stalk + overhanging snow/ice cap + radial gills + icicles
    structured_fracture(bm, (0.0, 0.0, 0.12), (1.76, 1.72, 0.28), style='stone_slab', quad=0, seed=112)
    structured_fracture(bm, (0.14, -0.08, 0.20), (1.34, 1.28, 0.20), style='frost_drift', quad=2, seed=113)

    # Fluted waisted glacial ice stalk with undercut ablation neck and subtle organic lean
    stalk_pts = [(0.0, 0.0, -0.04), (0.03, 0.02, 0.88), (0.01, -0.02, 1.85), (0.0, 0.0, 2.58)]
    profile_sweep(bm, stalk_pts, [0.56, 0.36, 0.25, 0.34], profile='oval', sides=14, twist_total=0.35, ridge_count=9, ridge_amp=0.08, quad=1)
    # Freeze-thaw collar ring near stalk mid-section
    profile_sweep(bm, [(0.02, 0.01, 1.24), (0.02, 0.01, 1.34)], [0.39, 0.36], profile='oval', sides=14, ridge_count=9, ridge_amp=0.06, quad=2)

    # Sculpted overhanging snow-and-ice mushroom cap with thick irregular lip & radial underside ice gill ribs
    _add_sculpted_mushroom_cap(bm, (0.0, 0.0, 2.54), radius=1.18, height=0.48, cap_quad=2, gill_quad=1, seed=111, sides=20, gill_count=16)

    # Hanging icicle drip spurs around the cap eave margin
    for ic in range(10):
        a = (ic / 10.0) * math.tau + 0.2
        r_eave = 1.02 + 0.08 * math.sin(a * 3.0 + 1.1)
        p_top = (math.cos(a) * r_eave, math.sin(a) * r_eave, 2.54)
        p_bot = (math.cos(a) * r_eave, math.sin(a) * r_eave, 2.26 - (ic % 3) * 0.08)
        profile_sweep(bm, [p_top, p_bot], [0.048, 0.010], profile='oval', sides=5, quad=1, mark_flat=True)

    semantic_silhouette_constraints(bm, 'frostgard_frozen_melt_mushroom_column')
    return bm


def build_frostgard_bone_mooring_anchor():
    bm = bmesh.new()
    # Carved stone-and-ice socket ring embedding two sweeping whale-rib tusks
    for i in range(6):
        a = (i / 6.0) * math.tau
        structured_fracture(bm, (0.40 * math.cos(a), 0.40 * math.sin(a), 0.16), (0.68, 0.56, 0.38), style='crag', quad=0, seed=120 + i)
    profile_sweep(bm, [(0, 0, 0.04), (0, 0, 0.26)], [0.48, 0.42], profile='oval', sides=12, quad=1, mark_flat=True)

    # Curved ribbed bone tusks passing cleanly through bolted bronze/ice collar brackets
    profile_sweep(bm, [(-0.26, 0, 0.04), (-0.12, 0, 0.60), (0.14, 0, 1.02), (0.28, 0, 1.26)], [0.105, 0.085, 0.062, 0.042], profile='horn_ribbed', sides=10, ridge_amp=0.05, quad=2)
    profile_sweep(bm, [(0.28, 0, 0.04), (0.12, 0, 0.56), (-0.12, 0, 0.96), (-0.24, 0, 1.18)], [0.100, 0.080, 0.058, 0.038], profile='horn_ribbed', sides=10, ridge_amp=0.05, quad=2)

    # Rotational locking mooring drum + side gear & pawl + glowing runic lock keystone
    add_pillow_block_bearing(bm, (0, -0.24, 0.58), (0, 1, 0), shaft_r=0.05, base_w=0.22, quad_metal=0)
    add_pillow_block_bearing(bm, (0, 0.24, 0.58), (0, 1, 0), shaft_r=0.05, base_w=0.22, quad_metal=0)
    add_winding_drum(bm, (0, -0.20, 0.58), (0, 0.20, 0.58), drum_r=0.14, flange_r=0.22, wraps=5, rope_r=0.020, quad_wood=1, quad_metal=0, quad_rope=2)
    add_gear_wheel_with_pawl(bm, (0, -0.28, 0.58), (0, 1, 0), pitch_r=0.21, thickness=0.06, teeth=10, quad_metal=0, with_pawl=True)
    # Socketed glowing runic lock core at axle hub
    add_chamfered_box(bm, (0, 0.28, 0.58), (0.14, 0.10, 0.14), quad=3, bevel=0.015)
    semantic_silhouette_constraints(bm, 'frostgard_bone_mooring_anchor')
    return bm


def build_frostgard_runic_ice_lantern_shrine():
    bm = bmesh.new()
    rng = random.Random(131)
    # Stepped carved basalt base plinth
    structured_fracture(bm, (0, 0, 0.18), (1.12, 1.12, 0.36), style='carved_ashlar', quad=0, seed=130)
    # Multi-course carved ice jamb pillars (3 distinct ashlar courses with chipped corners)
    for sx in (-0.36, 0.36):
        structured_fracture(bm, (sx, 0, 0.84), (0.24, 0.72, 0.92), style='carved_ashlar', quad=1, seed=132 + int(sx * 10), strata_layers=3)
    # Overhanging layered ice cornice slab + asymmetrical windward frost/snow cap
    structured_fracture(bm, (0, 0, 1.38), (0.98, 0.88, 0.24), style='carved_ashlar', quad=1, seed=134)
    structured_fracture(bm, (-0.06, 0.04, 1.56), (1.08, 0.96, 0.16), style='frost_drift', quad=2, seed=135)
    for ic in (-0.38, 0.38):
        profile_sweep(bm, [(ic, -0.44, 1.48), (ic, -0.44, 1.24)], [0.036, 0.008], profile='oval', sides=5, quad=2, mark_flat=True)

    # Suspended dark-iron lantern frame + glowing golden amber crystal core clearly visible inside alcove
    add_chain_link_span(bm, (0, 0, 1.28), (0, 0, 1.02), link_len=0.08, link_w=0.046, wire_r=0.011, quad=0)
    add_chamfered_box(bm, (0, 0, 0.98), (0.34, 0.34, 0.05), quad=0, bevel=0.008)
    add_chamfered_box(bm, (0, 0, 0.62), (0.34, 0.34, 0.05), quad=0, bevel=0.008)
    for lx in (-0.14, 0.14):
        for ly in (-0.14, 0.14):
            profile_sweep(bm, [(lx, ly, 0.64), (lx, ly, 0.96)], [0.018] * 2, profile='oval', sides=6, quad=0, mark_flat=True)
    crystal_growth_graph(bm, (0, 0, 0.64), height=0.34, radius=0.14, rng=rng, parent_quad=3, child_quad=3, parent_count=1, daughter_count=3, basal_count=0, with_rock_base=False)
    semantic_silhouette_constraints(bm, 'frostgard_runic_ice_lantern_shrine')
    return bm


# ---------------------------------------------------------------------------
# 5. FROSTGARD GLACIER FRONT (5 props)
# ---------------------------------------------------------------------------
def build_frostgard_serac_fin_monolith():
    bm = bmesh.new()
    # RESTORE MONOLITHIC LEANING GLACIAL SERAC FIN SILHOUETTE
    structured_fracture(bm, (0.0, 0.0, 0.16), (2.40, 1.98, 0.36), style='frost_drift', quad=2, seed=141)
    structured_fracture(bm, (0.28, -0.16, 0.24), (1.76, 1.48, 0.28), style='frost_drift', quad=0, seed=140)
    # Massive sweeping curved & leaning primary glacial serac fin
    structured_fracture(bm, (0.05, 0.0, 1.72), (1.38, 0.98, 3.36), style='serac_fin', quad=1, seed=142, tilt=(0.56, -0.18))
    # Subordinate leaning calved serac fin + shattered basal ice slabs
    structured_fracture(bm, (-0.58, 0.18, 1.06), (0.82, 0.66, 2.02), style='serac_fin', quad=1, seed=143, tilt=(0.24, -0.08))
    for i, (sx, sy, sz, sc) in enumerate((
        (0.68, -0.44, 0.36, (0.68, 0.54, 0.56)),
        (-0.74, -0.36, 0.32, (0.58, 0.48, 0.48)),
        (0.32, 0.58, 0.34, (0.62, 0.52, 0.52)),
    )):
        structured_fracture(bm, (sx, sy, sz), sc, style='frost_drift', quad=2 if i != 1 else 1, seed=144 + i)
    semantic_silhouette_constraints(bm, 'frostgard_serac_fin_monolith')
    return bm


def build_frostgard_glacial_wayfinder_cairn():
    bm = bmesh.new()
    # 4 graduated dry-stone slate cairn boulders + snow crusts on upper ledges
    structured_fracture(bm, (0.0, 0.0, 0.20), (1.68, 1.56, 0.42), style='stone_slab', quad=0, seed=151)
    structured_fracture(bm, (0.02, -0.02, 0.62), (1.24, 1.14, 0.38), style='stone_slab', quad=0, seed=152)
    structured_fracture(bm, (-0.02, 0.02, 0.98), (0.86, 0.80, 0.30), style='stone_slab', quad=0, seed=153)
    structured_fracture(bm, (0.0, 0.0, 1.24), (0.56, 0.52, 0.20), style='frost_drift', quad=2, seed=154)

    # Carved stone socket collar + iron-strapped timber mast + diagonal guy brace
    profile_sweep(bm, [(0, 0, 1.24), (0, 0, 1.42)], [0.18, 0.14], profile='oval', sides=8, quad=0, mark_flat=True)
    timber_joinery(bm, (0.0, 0.0, 1.18), (0.08, 0.0, 2.86), width=0.10, depth=0.10, quad=1, bow=0.015, pegs=True, iron_straps=True, strap_quad=0)
    profile_sweep(bm, [(-0.28, -0.18, 1.26), (0.03, 0.0, 1.88)], [0.022] * 2, profile='rope_strand', sides=6, quad=0)
    add_chamfered_box(bm, (0.08, 0.0, 2.86), (0.14, 0.14, 0.12), quad=0, bevel=0.015)

    # Prominent 3D draped & wind-billowed red wayfinder flag as primary upper silhouette
    add_draped_banner_flag(bm, (0.08, 0.0, 2.68), (0.98, 0.12, 0.04), width=0.82, height=0.42, sag=0.07, billow=0.08, swallowtail=True, quad_cloth=3, quad_trim=0)
    semantic_silhouette_constraints(bm, 'frostgard_glacial_wayfinder_cairn')
    return bm


def build_frostgard_ice_sawyer_trestle():
    bm = bmesh.new()
    # Mortised A-frame timber trestles with notched saddle cradles & bolted crossbars
    for sx in (-0.64, 0.64):
        timber_joinery(bm, (sx, -0.44, -0.04), (sx, 0.0, 0.90), width=0.12, depth=0.12, quad=1, pegs=True, iron_straps=True, strap_quad=0)
        timber_joinery(bm, (sx, 0.44, -0.04), (sx, 0.0, 0.90), width=0.12, depth=0.12, quad=1, pegs=True)
        timber_joinery(bm, (sx, -0.28, 0.36), (sx, 0.28, 0.36), width=0.09, depth=0.09, quad=1, pegs=True)
        add_chamfered_box(bm, (sx, 0.0, 0.92), (0.18, 0.34, 0.12), quad=0, bevel=0.012)
    timber_joinery(bm, (-0.84, 0.0, 0.88), (0.84, 0.0, 0.88), width=0.14, depth=0.14, quad=1, iron_straps=True, strap_quad=0)

    # Cleaved rectangular ice block split around a central saw kerf slot
    structured_fracture(bm, (0.0, -0.18, 1.18), (1.06, 0.28, 0.48), style='ice_block', quad=2, seed=156)
    structured_fracture(bm, (0.0, 0.18, 1.18), (1.06, 0.28, 0.48), style='ice_block', quad=2, seed=157)
    structured_fracture(bm, (0.0, 0.0, 1.04), (1.06, 0.62, 0.20), style='ice_block', quad=1, seed=158)

    # Two-man pit-saw seated directly inside the saw kerf: steel spine, toothed blade & upright wooden handles
    add_chamfered_box(bm, (0.0, 0.0, 1.38), (1.44, 0.032, 0.11), quad=0, bevel=0.005)
    add_chamfered_box(bm, (0.0, 0.0, 1.44), (1.46, 0.048, 0.04), quad=3, bevel=0.006)
    for hx in (-0.72, 0.72):
        timber_joinery(bm, (hx, 0.0, 1.32), (hx, 0.0, 1.62), width=0.06, depth=0.06, quad=3)
    semantic_silhouette_constraints(bm, 'frostgard_ice_sawyer_trestle')
    return bm


def build_frostgard_frost_banner_standards():
    bm = bmesh.new()
    # Moraine stone footing + crossed X-frame timber standards + mortised transom & rope lashing
    structured_fracture(bm, (0, 0, 0.08), (1.10, 0.68, 0.20), style='crag', quad=0, seed=158)
    timber_joinery(bm, (-0.48, 0, -0.05), (0.26, 0.10, 2.68), width=0.10, depth=0.10, quad=1, bow=0.015, pegs=True, iron_straps=True, strap_quad=0)
    timber_joinery(bm, (0.48, 0, -0.05), (-0.26, -0.10, 2.58), width=0.10, depth=0.10, quad=1, bow=-0.015, pegs=True, iron_straps=True, strap_quad=0)
    timber_joinery(bm, (-0.44, -0.02, 1.22), (0.44, 0.04, 1.22), width=0.11, depth=0.18, quad=1, iron_straps=True, strap_quad=0)
    # Crossed rope lashing binding X-intersection
    for diag in (((-0.14, -0.08, 1.08), (0.14, 0.08, 1.36)), ((0.14, -0.08, 1.08), (-0.14, 0.08, 1.36))):
        profile_sweep(bm, list(diag), [0.028] * 2, profile='rope_strand', sides=6, quad=0)

    # Twin 3D draped & wind-billowed flags hanging from cantilevered crossbars at top tips
    add_draped_banner_flag(bm, (0.24, 0.10, 2.56), (0.96, 0.08, 0.0), width=0.72, height=0.40, sag=0.07, billow=0.08, swallowtail=True, quad_cloth=3, quad_trim=0)
    add_draped_banner_flag(bm, (-0.24, -0.10, 2.48), (-0.96, -0.08, 0.0), width=0.66, height=0.36, sag=0.06, billow=-0.07, swallowtail=True, quad_cloth=2, quad_trim=0)
    semantic_silhouette_constraints(bm, 'frostgard_frost_banner_standards')
    return bm


def build_frostgard_moraine_erratic_anchor_post():
    bm = bmesh.new()
    # Massive cleaved glacial erratic boulder + snow crust
    structured_fracture(bm, (0.0, 0.0, 0.30), (2.20, 1.98, 0.62), style='crag', quad=0, seed=161)
    structured_fracture(bm, (-0.24, 0.18, 0.48), (1.16, 1.04, 0.24), style='frost_drift', quad=2, seed=162)

    # Carved circular stone-and-ice bearing socket recessed in erratic crest + notched locking gear + turnstile
    profile_sweep(bm, [(0, 0, 0.50), (0, 0, 0.68)], [0.48, 0.42], profile='oval', sides=12, quad=2, mark_flat=True)
    add_gear_wheel_with_pawl(bm, (0, 0, 0.68), (0, 0, 1), pitch_r=0.38, thickness=0.09, teeth=10, quad_metal=0, with_pawl=True)
    timber_joinery(bm, (0, 0, 0.62), (0, 0, 1.44), width=0.36, depth=0.36, quad=1, iron_straps=True, strap_quad=0)
    add_chamfered_box(bm, (0, 0, 1.16), (0.52, 0.52, 0.09), quad=0, bevel=0.015)
    timber_joinery(bm, (-0.68, 0, 1.32), (0.68, 0, 1.32), width=0.10, depth=0.10, quad=1, pegs=True)
    timber_joinery(bm, (0, -0.68, 1.32), (0, 0.68, 1.32), width=0.10, depth=0.10, quad=1, pegs=True)
    semantic_silhouette_constraints(bm, 'frostgard_moraine_erratic_anchor_post')
    return bm


# ---------------------------------------------------------------------------
# 6. FROSTGARD HOLD (5 props)
# ---------------------------------------------------------------------------
def build_frostgard_wolf_totem_palisade_post():
    bm = bmesh.new()
    # Frost-rimmed stone socket plinth + anchor collar straps
    structured_fracture(bm, (0, 0, 0.12), (1.32, 1.24, 0.26), style='crag', quad=0, seed=171)
    structured_fracture(bm, (-0.16, 0.12, 0.20), (0.86, 0.80, 0.14), style='frost_drift', quad=2, seed=172)
    timber_joinery(bm, (0, 0, 0.14), (0, 0, 2.66), width=0.28, depth=0.28, quad=1, bow=0.012, iron_straps=True, strap_quad=0)

    # Carved circular bossed ward-shield bolted via iron bracket
    add_chamfered_box(bm, (0, -0.14, 1.18), (0.14, 0.10, 0.18), quad=0, bevel=0.01)
    profile_sweep(bm, [(0, -0.16, 1.18), (0, -0.22, 1.18)], [0.28, 0.27], profile='oval', sides=14, quad=2, mark_flat=True)
    profile_sweep(bm, [(0, -0.22, 1.18), (0, -0.27, 1.18)], [0.10, 0.05], profile='oval', sides=10, quad=3, mark_flat=True)

    # Sculpted wolf-head totem crest + lower jaw fangs + swept ribbed horns
    add_chamfered_box(bm, (0, 0.16, 2.48), (0.40, 0.56, 0.34), quad=2, bevel=0.025)
    add_chamfered_box(bm, (0, 0.42, 2.42), (0.24, 0.24, 0.20), quad=2, bevel=0.02)
    for sx in (-1, 1):
        profile_sweep(bm, [(sx * 0.16, 0.06, 2.60), (sx * 0.30, 0.0, 2.84), (sx * 0.44, -0.06, 3.04)], [0.055, 0.036, 0.014], profile='horn_ribbed', sides=8, ridge_amp=0.06, quad=2)
        profile_sweep(bm, [(sx * 0.09, 0.48, 2.34), (sx * 0.09, 0.48, 2.22)], [0.024, 0.006], profile='oval', sides=6, quad=3, mark_flat=True)

    # Wrought-iron cantilever sconce arm + chain link hanger + round hollow brazier basket & embers
    profile_sweep(bm, [(0, 0.04, 1.38), (0.20, 0.14, 1.56), (0.32, 0.24, 1.94)], [0.042, 0.034, 0.028], profile='rect_chamfer', sides=8, quad=0, mark_flat=True)
    add_chain_link_span(bm, (0.32, 0.24, 1.92), (0.32, 0.24, 1.74), link_len=0.075, link_w=0.042, wire_r=0.010, quad=0)
    add_revolved_vessel(bm, (0.32, 0.24, 1.54), [(0.11, 0.0), (0.17, 0.10), (0.20, 0.20)], sides=10, wall_t=0.03, quad_outer=0, quad_inner=0, ribs=4)
    structured_fracture(bm, (0.32, 0.24, 1.72), (0.28, 0.28, 0.22), style='ore_matrix', quad=3, seed=173)
    semantic_silhouette_constraints(bm, 'frostgard_wolf_totem_palisade_post')
    return bm


def build_frostgard_cut_ice_block_hoist():
    bm = bmesh.new()
    # Frost-dusted stone & timber platform base
    structured_fracture(bm, (0, 0, 0.08), (1.48, 1.38, 0.18), style='carved_ashlar', quad=0, seed=174)
    structured_fracture(bm, (-0.28, 0.24, 0.14), (0.86, 0.72, 0.12), style='frost_drift', quad=2, seed=179)

    # Coherent 3-legged shear-legs timber tripod converging at apex shackle bracket
    pts_base = []
    for i in range(3):
        a = (i / 3.0) * math.tau
        bp = (1.06 * math.cos(a), 1.06 * math.sin(a), -0.04)
        pts_base.append(bp)
        timber_joinery(bm, bp, (0, 0, 2.54), width=0.14, depth=0.14, quad=1, bow=0.012, pegs=True, iron_straps=True, strap_quad=0)
    for i in range(3):
        p_a, p_b = pts_base[i], pts_base[(i + 1) % 3]
        timber_joinery(bm, (p_a[0] * 0.58, p_a[1] * 0.58, 1.08), (p_b[0] * 0.58, p_b[1] * 0.58, 1.08), width=0.085, depth=0.085, quad=1, pegs=True)

    # Apex iron shackle collar & grooved crown pulley sheave
    add_chamfered_box(bm, (0, 0, 2.54), (0.24, 0.24, 0.18), quad=0, bevel=0.015)
    add_pulley_sheave(bm, (0, 0, 2.40), (0, 1, 0), radius=0.12, width=0.07, quad_metal=0, clevis_dir=(0, 0, 1))

    # Windlass drum mounted in pillow-block bearings across legs + ratchet gear & pawl + spoked hand-wheel
    drum_y = 0.22
    add_pillow_block_bearing(bm, (-0.40, drum_y, 1.56), (1, 0, 0), shaft_r=0.045, base_w=0.18, quad_metal=0)
    add_pillow_block_bearing(bm, (0.40, drum_y, 1.56), (1, 0, 0), shaft_r=0.045, base_w=0.18, quad_metal=0)
    add_winding_drum(bm, (-0.36, drum_y, 1.56), (0.36, drum_y, 1.56), drum_r=0.085, flange_r=0.16, wraps=6, rope_r=0.016, quad_wood=1, quad_metal=0, quad_rope=3)
    add_gear_wheel_with_pawl(bm, (-0.42, drum_y, 1.56), (1, 0, 0), pitch_r=0.16, thickness=0.05, teeth=10, quad_metal=0, with_pawl=True)
    # Spoked hand-crank wheel on +X end of windlass shaft (rotate around X)
    profile_sweep(bm, [(0.44, drum_y, 1.56), (0.50, drum_y, 1.56)], [0.22] * 2, profile='oval', sides=12, quad=0, mark_flat=True)
    add_chamfered_box(bm, (0.54, drum_y + 0.16, 1.56), (0.14, 0.04, 0.04), quad=3, bevel=0.006)

    # Continuous tensioned hoist rope: windlass drum -> apex pulley sheave -> straight down to ice-tongs pivot
    add_routed_rope_path(bm, [(0.0, drum_y + 0.08, 1.62), (0.04, 0.06, 2.48), (0.0, 0.0, 1.46)], rope_r=0.022, quad=3)

    # Pivoted scissor-action forged iron ice tongs biting cleanly into cleaved ice block flanks
    add_chamfered_box(bm, (0, 0, 1.44), (0.10, 0.10, 0.10), quad=0, bevel=0.01)
    for sx in (-1, 1):
        profile_sweep(bm, [(0, 0, 1.44), (sx * 0.42, 0, 1.18), (sx * 0.36, 0, 0.90)], [0.028, 0.026, 0.020], profile='rect_chamfer', sides=8, quad=0, mark_flat=True)
    structured_fracture(bm, (0, 0, 0.96), (0.74, 0.72, 0.56), style='ice_block', quad=2, seed=175)
    semantic_silhouette_constraints(bm, 'frostgard_cut_ice_block_hoist')
    return bm


def build_frostgard_mead_hall_trophy_stand():
    bm = bmesh.new()
    # Heavy trestle slab legs + under-table stretcher beam + apron rails + diagonal knee braces + iron tool holder
    for sx in (-0.68, 0.68):
        add_chamfered_box(bm, (sx, 0, 0.38), (0.16, 0.76, 0.76), quad=1, bevel=0.02, wear='wood', wear_seed=177)
        timber_joinery(bm, (sx * 0.88, 0, 0.34), (sx * 0.46, 0, 0.76), width=0.09, depth=0.09, quad=1, pegs=True)
    timber_joinery(bm, (-0.76, 0, 0.32), (0.76, 0, 0.32), width=0.14, depth=0.14, quad=1, tenon_ends=True, iron_straps=True, strap_quad=0)
    timber_joinery(bm, (-0.64, -0.26, 0.70), (0.64, -0.26, 0.70), width=0.09, depth=0.09, quad=1)
    timber_joinery(bm, (-0.64, 0.26, 0.70), (0.64, 0.26, 0.70), width=0.09, depth=0.09, quad=1)
    # Right-side iron tool holder bracket + hanging chisel/hammer tools
    add_chamfered_box(bm, (0.82, 0, 0.74), (0.14, 0.44, 0.05), quad=0, bevel=0.008)
    for ty in (-0.12, 0.12):
        timber_joinery(bm, (0.84, ty, 0.42), (0.84, ty, 0.78), width=0.035, depth=0.035, quad=1)
        add_chamfered_box(bm, (0.84, ty, 0.42), (0.09, 0.05, 0.05), quad=0, bevel=0.006)

    # Planked tabletop + recessed magical runic inlay channel & raised border rim
    add_chamfered_box(bm, (0, 0, 0.82), (1.82, 0.84, 0.12), quad=1, bevel=0.022, wear='wood')
    add_chamfered_box(bm, (0, -0.08, 0.885), (1.42, 0.46, 0.02), quad=0, bevel=0.005)
    add_chamfered_box(bm, (0, -0.08, 0.892), (1.28, 0.32, 0.022), quad=2, bevel=0.005)
    add_chamfered_box(bm, (-0.28, -0.14, 0.898), (0.58, 0.18, 0.022), quad=3, bevel=0.005)

    # 3 collared stone/iron horn sockets + ribbed curved horns + chocked mead cask + front ward shield
    for tx in (-0.50, 0.0, 0.52):
        add_chamfered_box(bm, (tx, 0.14, 0.90), (0.20, 0.20, 0.06), quad=0, bevel=0.01)
        profile_sweep(bm, [(tx, 0.14, 0.90), (tx, 0.14, 1.18)], [0.085, 0.072], profile='oval', sides=10, quad=2, mark_flat=True)
        for horn_s in (-1, 1):
            profile_sweep(bm, [(tx, 0.14, 1.14), (tx + horn_s * 0.18, 0.06, 1.38), (tx + horn_s * 0.24, -0.02, 1.56)], [0.044, 0.028, 0.012], profile='horn_ribbed', sides=8, ridge_amp=0.06, quad=3)
    _add_staved_barrel(bm, (0.24, -0.16, 0.88), (0.24, -0.16, 1.24), radius=0.18, quad_wood=1, quad_iron=0, quad_accent=3, tap_side=True)
    # Front bossed shield on forged display cradle
    add_chamfered_box(bm, (-0.46, -0.41, 0.56), (0.14, 0.08, 0.18), quad=0, bevel=0.01)
    profile_sweep(bm, [(-0.46, -0.44, 0.56), (-0.46, -0.52, 0.56)], [0.26, 0.24], profile='oval', sides=14, quad=2, mark_flat=True)
    profile_sweep(bm, [(-0.46, -0.52, 0.56), (-0.46, -0.58, 0.56)], [0.10, 0.04], profile='oval', sides=10, quad=3, mark_flat=True)
    semantic_silhouette_constraints(bm, 'frostgard_mead_hall_trophy_stand')
    return bm


def build_frostgard_salt_brine_cask_frame():
    bm = bmesh.new()
    # Heavy 4-post timber rack with X-braces, bolted gussets, scalloped saddle cradles & snow-laden roof
    for sx in (-0.72, 0.72):
        for sy in (-0.40, 0.40):
            timber_joinery(bm, (sx, sy, -0.04), (sx, sy, 1.66), width=0.15, depth=0.15, quad=1, bow=0.01, pegs=True, iron_straps=True, strap_quad=0)
        timber_joinery(bm, (sx, -0.42, 0.12), (sx, 0.42, 1.52), width=0.095, depth=0.095, quad=1, pegs=True)
        add_chamfered_box(bm, (sx, 0.0, 0.82), (0.12, 0.18, 0.18), quad=0, bevel=0.01)
    for bz in (0.30, 0.88):
        add_chamfered_box(bm, (0, 0, bz), (1.62, 0.88, 0.09), quad=1, bevel=0.014, wear='wood')
        for cx in (-0.34, 0.34):
            for chock_dx in (-0.17, 0.17):
                add_chamfered_box(bm, (cx + chock_dx, 0, bz + 0.08), (0.09, 0.68, 0.10), quad=0, ry=-0.35 if chock_dx < 0 else 0.35, bevel=0.01)

    # Planked roof with broad uneven snow crust + lower brine drip trough
    add_chamfered_box(bm, (0, 0, 1.66), (1.84, 1.12, 0.09), quad=1, bevel=0.02, wear='wood')
    structured_fracture(bm, (-0.04, 0.02, 1.74), (1.84, 1.12, 0.09), style='stone_slab', quad=2, seed=178)
    add_flared_hopper_box(bm, (0, -0.52, 0.06), (1.28, 0.22), (1.40, 0.28), height=0.12, wall_t=0.04, quad_wood=0, quad_metal=0, wear_plates=False)

    # 4 bilged 7-station brine casks with iron hoops, central bungs & draw-off spigots
    for cx in (-0.34, 0.34):
        for cz in (0.54, 1.12):
            _add_staved_barrel(bm, (cx, -0.34, cz), (cx, 0.34, cz), radius=0.23, quad_wood=1, quad_iron=0, quad_accent=3, tap_side=True, central_bung=True)
    semantic_silhouette_constraints(bm, 'frostgard_salt_brine_cask_frame')
    return bm


def build_frostgard_watchman_braziers_gate():
    bm = bmesh.new()
    # RESTORE ROUND REVOLVED VESSELS & ARCHITECTURAL GATE ALTAR COHERENCE
    structured_fracture(bm, (0, 0, 0.18), (1.78, 0.72, 0.36), style='carved_ashlar', quad=0, seed=180)
    add_chamfered_box(bm, (0, 0, 0.66), (1.06, 0.44, 0.68), quad=1, bevel=0.025, wear='wood')
    # Carved relief shrine frame on front/back of central altar base
    add_chamfered_box(bm, (0, -0.22, 0.68), (0.68, 0.06, 0.42), quad=0, bevel=0.01)
    add_chamfered_box(bm, (0, -0.24, 0.68), (0.44, 0.05, 0.24), quad=2, bevel=0.008)

    # Iron-strapped overhead lintel beam + forged portcullis teeth
    timber_joinery(bm, (-0.82, 0, 1.50), (0.82, 0, 1.50), width=0.26, depth=0.20, quad=1, iron_straps=True, strap_quad=0)
    for px in (-0.36, -0.12, 0.12, 0.36):
        profile_sweep(bm, [(px, 0, 1.44), (px, 0, 1.02)], [0.028, 0.010], profile='oval', sides=6, quad=0, mark_flat=True)

    # Left & right collared side columns + knee struts + scroll brackets + ROUND BRAZIER BOWLS
    for sx in (-0.72, 0.72):
        timber_joinery(bm, (sx, 0, 0.32), (sx, 0, 1.54), width=0.13, depth=0.13, quad=2, iron_straps=True, strap_quad=0)
        timber_joinery(bm, (sx * 0.74, 0, 0.32), (sx, 0, 1.24), width=0.09, depth=0.09, quad=1, pegs=True)
        for ca in (0.0, math.pi * 0.5, math.pi, math.pi * 1.5):
            rx, ry = math.cos(ca), math.sin(ca)
            profile_sweep(bm, [(sx + 0.10 * rx, 0.10 * ry, 1.38), (sx + 0.21 * rx, 0.21 * ry, 1.58)], [0.024] * 2, profile='rect_chamfer', sides=8, quad=0, mark_flat=True)

        # True hollow circular flared brazier bowl with forged vertical ribs & 6 crown prongs
        add_revolved_vessel(
            bm,
            (sx, 0, 1.52),
            [(0.12, 0.0), (0.20, 0.12), (0.26, 0.26)],
            sides=12,
            wall_t=0.038,
            quad_outer=2,
            quad_inner=0,
            ribs=6,
            rim_lip=True,
        )
        for sp in range(6):
            sa = (sp / 6.0) * math.tau
            profile_sweep(
                bm,
                [(sx + 0.23 * math.cos(sa), 0.23 * math.sin(sa), 1.72), (sx + 0.27 * math.cos(sa), 0.27 * math.sin(sa), 1.94)],
                [0.022, 0.008],
                profile='oval',
                sides=6,
                quad=0,
                mark_flat=True,
            )
        structured_fracture(bm, (sx, 0, 1.80), (0.34, 0.34, 0.24), style='ore_matrix', quad=3, seed=181 + int(sx * 10))
    semantic_silhouette_constraints(bm, 'frostgard_watchman_braziers_gate')
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
                min_triangles=15200,
                max_triangles=PROP_MAX_TRIANGLES,
                add_skirt=False,
                allow_extra_material=False,
            )
            if tris < MIN_TRIANGLES or tris > PROP_MAX_TRIANGLES:
                raise RuntimeError(f'{area}/{name} outside [{MIN_TRIANGLES}, {PROP_MAX_TRIANGLES}] tris: {tris}')
            out_path = os.path.join(area_dir, f'{name}.glb')
            place_and_export(name, mesh, out_path, tangents=True)
            manifest['areas'][area].append({'name': name, 'triangles': tris, 'file': f'{area}/{name}.glb'})
            print(f'[underground/{area}] {name}: {tris} tris -> {out_path}')
    os.makedirs(OUT_ROOT, exist_ok=True)
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f'[underground] exported 30 props (all in [{MIN_TRIANGLES}, {PROP_MAX_TRIANGLES}] tris) -> {MANIFEST_PATH}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-render', action='store_true')
    parser.parse_known_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    build_all()
