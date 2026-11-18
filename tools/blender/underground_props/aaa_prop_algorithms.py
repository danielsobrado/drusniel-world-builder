"""AAA procedural prop geometry algorithms and silhouette constraints.

Implements the seven structured geometry and construction algorithms for
underground and glacial hero props:
1. profile_sweep: non-uniform cross-section sweep along 3D paths with twist & taper
2. structured_fracture: coherent planar cleavage, stepped stone/ice slabs & corner chips
3. crystal_growth_graph: parent prism/stone axes with epitaxial face-mounted daughters
4. timber_joinery: hand-hewn beams with grain bow, non-uniform bevels, pegs & brackets
5. layered_wear: material-specific exposure/structural deformation (wood/stone/metal/ice)
6. manufactured_assembly: axis-driven mechanical assemblies (bearings, pulleys, drums,
   gears, routed ropes, chains, revolved vessels, flared hoppers, draped banners)
7. semantic_silhouette_constraints: canonical reference bbox & grounding enforcement
"""
import math
import random

import bmesh
from mathutils import Euler, Matrix, Vector

REFERENCE_BBOXES = {
    'mine_ore_hopper_chute': {'mins': (-0.965, -0.960, -0.055), 'maxs': (1.040, 0.831, 2.094), 'tris_before': 16050},
    'mine_dewatering_pump_rig': {'mins': (-1.136, -0.539, -0.044), 'maxs': (1.155, 0.621, 2.225), 'tris_before': 16384},
    'mine_powder_magazine_locker': {'mins': (-0.700, -0.602, -0.044), 'maxs': (0.706, 0.695, 1.350), 'tris_before': 16050},
    'mine_rail_turntable_switch': {'mins': (-0.985, -0.907, -0.044), 'maxs': (1.287, 0.979, 1.350), 'tris_before': 16050},
    'mine_assaying_brazier_cart': {'mins': (-0.859, -0.546, -0.044), 'maxs': (1.010, 0.520, 1.201), 'tris_before': 22784},
    'umbra_veil_fungus_parasol': {'mins': (-1.360, -1.437, -0.090), 'maxs': (1.327, 1.250, 3.140), 'tris_before': 16050},
    'umbra_crystal_resonator_obelisk': {'mins': (-0.713, -0.687, -0.044), 'maxs': (0.680, 0.681, 2.790), 'tris_before': 24960},
    'umbra_hanging_censer_spire': {'mins': (-0.685, -0.420, -0.044), 'maxs': (0.895, 0.423, 2.770), 'tris_before': 16050},
    'umbra_spider_web_balustrade_shrine': {'mins': (-0.680, -0.685, -0.044), 'maxs': (0.709, 0.680, 2.390), 'tris_before': 16050},
    'umbra_tide_gondola_skiff': {'mins': (-1.765, -0.440, -0.044), 'maxs': (1.773, 0.442, 1.347), 'tris_before': 16050},
    'stonehold_drop_hammer_forge_press': {'mins': (-0.773, -0.619, -0.044), 'maxs': (0.740, 0.590, 2.680), 'tris_before': 16050},
    'stonehold_runic_brazier_pedestal': {'mins': (-0.560, -0.560, -0.044), 'maxs': (0.560, 0.560, 1.765), 'tris_before': 16050},
    'stonehold_geared_capstan_winch': {'mins': (-0.725, -0.725, -0.044), 'maxs': (0.725, 0.725, 1.380), 'tris_before': 18688},
    'stonehold_ancestor_relief_stele': {'mins': (-0.680, -0.440, -0.044), 'maxs': (0.680, 0.440, 2.560), 'tris_before': 16050},
    'stonehold_ingot_crane_trolley': {'mins': (-0.797, -0.480, -0.044), 'maxs': (1.120, 0.480, 2.310), 'tris_before': 16050},
    'frostgard_organ_pipe_ice_formation': {'mins': (-1.320, -1.206, -0.044), 'maxs': (1.303, 1.152, 3.320), 'tris_before': 16050},
    'frostgard_hoarfrost_rose_cluster': {'mins': (-1.022, -0.950, -0.044), 'maxs': (0.973, 0.994, 1.741), 'tris_before': 16050},
    'frostgard_frozen_melt_mushroom_column': {'mins': (-1.179, -1.199, -0.050), 'maxs': (1.199, 1.182, 3.000), 'tris_before': 16050},
    'frostgard_bone_mooring_anchor': {'mins': (-0.770, -0.657, -0.044), 'maxs': (0.780, 0.675, 1.266), 'tris_before': 16050},
    'frostgard_runic_ice_lantern_shrine': {'mins': (-0.564, -0.560, -0.044), 'maxs': (0.560, 0.583, 1.670), 'tris_before': 16050},
    'frostgard_serac_fin_monolith': {'mins': (-1.444, -1.169, -0.044), 'maxs': (1.470, 1.202, 3.502), 'tris_before': 16050},
    'frostgard_glacial_wayfinder_cairn': {'mins': (-1.102, -1.037, -0.044), 'maxs': (1.068, 0.971, 2.882), 'tris_before': 18096},
    'frostgard_ice_sawyer_trestle': {'mins': (-0.850, -0.498, -0.066), 'maxs': (0.856, 0.479, 1.525), 'tris_before': 19520},
    'frostgard_frost_banner_standards': {'mins': (-0.943, -0.298, -0.068), 'maxs': (1.000, 0.255, 2.692), 'tris_before': 16050},
    'frostgard_moraine_erratic_anchor_post': {'mins': (-1.161, -1.116, -0.044), 'maxs': (1.210, 1.134, 1.460), 'tris_before': 16050},
    'frostgard_wolf_totem_palisade_post': {'mins': (-0.767, -0.744, -0.044), 'maxs': (0.736, 0.701, 3.049), 'tris_before': 18528},
    'frostgard_cut_ice_block_hoist': {'mins': (-0.876, -1.016, -0.074), 'maxs': (1.159, 1.041, 2.606), 'tris_before': 16050},
    'frostgard_mead_hall_trophy_stand': {'mins': (-0.910, -0.622, -0.044), 'maxs': (0.951, 0.540, 1.566), 'tris_before': 16050},
    'frostgard_salt_brine_cask_frame': {'mins': (-0.920, -0.640, -0.044), 'maxs': (0.920, 0.560, 1.770), 'tris_before': 22400},
    'frostgard_watchman_braziers_gate': {'mins': (-0.988, -0.360, -0.044), 'maxs': (1.026, 0.376, 1.988), 'tris_before': 21744},
}


def zone_uv_bounds(quad):
    return (
        (0.06, 0.44, 0.06, 0.44),
        (0.56, 0.94, 0.06, 0.44),
        (0.06, 0.44, 0.56, 0.94),
        (0.56, 0.94, 0.56, 0.94),
    )[quad % 4]


def _ensure_layers(bm):
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    flat_layer = bm.faces.layers.int.get('aaa_flat') or bm.faces.layers.int.new('aaa_flat')
    return uv_layer, flat_layer


def _orthonormal_frame(axis_dir):
    d = Vector(axis_dir)
    if d.length_squared < 1e-10:
        d = Vector((0.0, 0.0, 1.0))
    else:
        d = d.normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(d.z) < 0.92 else Vector((1.0, 0.0, 0.0))
    tx = d.cross(ref).normalized()
    ty = d.cross(tx).normalized()
    return d, tx, ty


def _map_planar_uv(face, uv_layer, quad, scale=0.65):
    u0, u1, v0, v1 = zone_uv_bounds(quad)
    face.normal_update()
    n = face.normal
    ax = 0 if (abs(n.x) >= abs(n.y) and abs(n.x) >= abs(n.z)) else (1 if abs(n.y) >= abs(n.z) else 2)
    for loop in face.loops:
        p = loop.vert.co
        uu, vv = ((p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y))
        su = (uu * scale) % 1.0
        sv = (vv * scale) % 1.0
        loop[uv_layer].uv = (u0 + su * (u1 - u0), v0 + sv * (v1 - v0))


def add_chamfered_box(bm, center, size, quad=0, rx=0.0, ry=0.0, rz=0.0, bevel=0.015, mark_flat=True, wear=None, wear_seed=1):
    """Add an oriented beveled box with optional material-specific wear."""
    uv_layer, flat_layer = _ensure_layers(bm)
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    xform = Matrix.Translation(center) @ Euler((rx, ry, rz), 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    for v in tmp.verts:
        v.co = xform @ v.co
    max_b = min(abs(size[0]), abs(size[1]), abs(size[2])) * 0.34
    eff_bevel = min(bevel, max_b)
    if eff_bevel > 0.0012:
        bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=eff_bevel, segments=1, affect='EDGES', clamp_overlap=True)
    if wear:
        layered_wear(tmp, list(tmp.verts), material=wear, seed=wear_seed, intensity=1.0)
    tmp.normal_update()
    v_map = {v: bm.verts.new(v.co) for v in tmp.verts}
    added = []
    for tf in tmp.faces:
        vs = tuple(v_map[v] for v in tf.verts)
        if len(set(vs)) < 3:
            continue
        nf = bm.faces.new(vs)
        nf.smooth = not mark_flat
        if mark_flat:
            nf[flat_layer] = 1
        _map_planar_uv(nf, uv_layer, quad)
        added.append(nf)
    tmp.free()
    return added


# ---------------------------------------------------------------------------
# Algorithm 1: Profile Sweep
# ---------------------------------------------------------------------------
def _sample_cross_section(profile, sides, rx, ry, twist_ang, ridge_count=0, ridge_amp=0.0, phase=0.0):
    pts = []
    if profile == 'rect_chamfer':
        ch = 0.22
        raw = [
            (1.0, 1.0 - ch), (1.0 - ch, 1.0), (-1.0 + ch, 1.0), (-1.0, 1.0 - ch),
            (-1.0, -1.0 + ch), (-1.0 + ch, -1.0), (1.0 - ch, -1.0), (1.0, -1.0 + ch),
        ]
        for x0, y0 in raw:
            px, py = x0 * rx, y0 * ry
            ct, st = math.cos(twist_ang), math.sin(twist_ang)
            pts.append((px * ct - py * st, px * st + py * ct))
        return pts

    if profile == 't_rail':
        # Flanged I/T mine rail profile: wide foot, narrow web, bulb head
        raw = [
            (0.95, -1.0), (0.95, -0.68), (0.28, -0.58), (0.26, 0.42),
            (0.62, 0.56), (0.58, 1.0), (-0.58, 1.0), (-0.62, 0.56),
            (-0.26, 0.42), (-0.28, -0.58), (-0.95, -0.68), (-0.95, -1.0),
        ]
        for x0, y0 in raw:
            pts.append((x0 * rx, y0 * ry))
        return pts

    if profile == 'channel_u':
        raw = [
            (-1.0, 0.8), (-0.65, 0.8), (-0.65, -0.35), (0.65, -0.35),
            (0.65, 0.8), (1.0, 0.8), (1.0, -1.0), (-1.0, -1.0),
        ]
        for x0, y0 in raw:
            pts.append((x0 * rx, y0 * ry))
        return pts

    n = max(4, sides)
    for s in range(n):
        a = (s / n) * math.tau
        if profile == 'rope_strand':
            mod = 1.0 + 0.16 * math.cos(3.0 * (a + twist_ang))
        elif profile == 'horn_ribbed':
            mod = (1.0 + 0.08 * math.sin(a * 3.0)) * (1.0 + ridge_amp * math.sin(phase))
        else:
            mod = 1.0 + (ridge_amp * math.sin(a * ridge_count + twist_ang) if ridge_count > 0 else 0.0)
        x0 = math.cos(a) * rx * mod
        y0 = math.sin(a) * ry * mod
        ct, st = math.cos(twist_ang), math.sin(twist_ang)
        pts.append((x0 * ct - y0 * st, x0 * st + y0 * ct))
    return pts


def profile_sweep(
    bm,
    points,
    radii_xy,
    profile='oval',
    sides=10,
    twist_total=0.0,
    ridge_count=0,
    ridge_amp=0.0,
    quad=1,
    cap_ends=True,
    mark_flat=False,
    closed=False,
):
    """Sweep a non-uniform cross-section along a curved 3D path with twist and dual-axis taper."""
    vpts = [Vector(p) for p in points]
    if len(vpts) < 2:
        return []
    r_list = [(r, r) if isinstance(r, (int, float)) else (float(r[0]), float(r[1])) for r in radii_xy]
    uv_layer, flat_layer = _ensure_layers(bm)
    u0, u1, v0, v1 = zone_uv_bounds(quad)

    d0 = (vpts[1] - vpts[0]).normalized() if (vpts[1] - vpts[0]).length_squared > 1e-10 else Vector((0, 0, 1))
    normal = d0.orthogonal().normalized()
    rings = []
    n_pts = len(vpts)
    total_len = sum((vpts[i] - vpts[i - 1]).length for i in range(1, n_pts))
    acc_len = 0.0

    for i, p in enumerate(vpts):
        if closed:
            p_prev = vpts[(i - 1) % n_pts]
            p_next = vpts[(i + 1) % n_pts]
        else:
            p_prev = vpts[max(0, i - 1)]
            p_next = vpts[min(n_pts - 1, i + 1)]
        tangent = p_next - p_prev
        tangent = tangent.normalized() if tangent.length_squared > 1e-10 else d0
        proj = normal - tangent * normal.dot(tangent)
        if proj.length_squared < 1e-8:
            proj = tangent.orthogonal()
        normal = proj.normalized()
        binormal = tangent.cross(normal).normalized()

        if i > 0:
            acc_len += (vpts[i] - vpts[i - 1]).length
        frac = acc_len / max(total_len, 1e-6)
        rx, ry = r_list[i]
        sec = _sample_cross_section(
            profile,
            sides,
            rx,
            ry,
            twist_total * frac,
            ridge_count=ridge_count,
            ridge_amp=ridge_amp,
            phase=frac * math.tau * 4.0,
        )
        ring = []
        vc = v0 + (v1 - v0) * frac
        n_sec = len(sec)
        for s_idx, (sx, sy) in enumerate(sec):
            v = bm.verts.new(p + normal * sx + binormal * sy)
            uc = u0 + (u1 - u0) * (s_idx / max(n_sec, 1))
            ring.append((v, (uc, vc)))
        rings.append(ring)

    added = []
    n_sec = len(rings[0])
    pair_count = len(rings) if closed else len(rings) - 1
    for i in range(pair_count):
        ra = rings[i]
        rb = rings[(i + 1) % len(rings)]
        for s in range(n_sec):
            sn = (s + 1) % n_sec
            vs = (ra[s][0], ra[sn][0], rb[sn][0], rb[s][0])
            if len(set(vs)) == 4:
                f = bm.faces.new(vs)
                f.smooth = not mark_flat
                if mark_flat:
                    f[flat_layer] = 1
                uvs = (ra[s][1], ra[sn][1], rb[sn][1], rb[s][1])
                for loop, coord in zip(f.loops, uvs):
                    loop[uv_layer].uv = coord
                added.append(f)

    if cap_ends and not closed:
        uc = 0.5 * (u0 + u1)
        if r_list[0][0] > 1e-4 or r_list[0][1] > 1e-4:
            c0 = bm.verts.new(vpts[0])
            r0 = rings[0]
            for s in range(n_sec):
                sn = (s + 1) % n_sec
                f = bm.faces.new((r0[sn][0], r0[s][0], c0))
                f.smooth = False
                if mark_flat:
                    f[flat_layer] = 1
                for loop, uv_c in zip(f.loops, (r0[sn][1], r0[s][1], (uc, v0))):
                    loop[uv_layer].uv = uv_c
                added.append(f)
        if r_list[-1][0] > 1e-4 or r_list[-1][1] > 1e-4:
            c1 = bm.verts.new(vpts[-1])
            r1 = rings[-1]
            for s in range(n_sec):
                sn = (s + 1) % n_sec
                f = bm.faces.new((r1[s][0], r1[sn][0], c1))
                f.smooth = False
                if mark_flat:
                    f[flat_layer] = 1
                for loop, uv_c in zip(f.loops, (r1[s][1], r1[sn][1], (uc, v1))):
                    loop[uv_layer].uv = uv_c
                added.append(f)
    return added


# ---------------------------------------------------------------------------
# Algorithm 2: Structured Fracture & Layered Wear
# ---------------------------------------------------------------------------
def layered_wear(bm, verts, material='wood', seed=1, intensity=1.0):
    """Apply material-specific exposure and structural wear without uniform random noise."""
    if not verts:
        return
    xs = [v.co.x for v in verts]
    ys = [v.co.y for v in verts]
    zs = [v.co.z for v in verts]
    cx = 0.5 * (min(xs) + max(xs))
    cy = 0.5 * (min(ys) + max(ys))
    cz = 0.5 * (min(zs) + max(zs))
    span_z = max(max(zs) - min(zs), 0.05)

    for v in verts:
        p = v.co
        rel_z = (p.z - min(zs)) / span_z
        if material == 'wood':
            # Subtle directional grain camber + adze-worn exposed upper corners
            bow = 0.008 * intensity * math.sin(rel_z * math.pi + seed * 0.7)
            edge_wear = 0.005 * intensity * max(0.0, rel_z - 0.55) * math.cos(p.x * 6.0 + p.y * 5.0 + seed)
            v.co.x += bow
            v.co.y += bow * 0.45
            v.co.z -= abs(edge_wear)
        elif material == 'stone':
            # Broad cleavage facets with selective upper-corner chip relief
            chip = max(0.0, rel_z - 0.72) * (0.022 * intensity) * max(0.0, math.sin((p.x - cx) * 4.2 + (p.y - cy) * 3.7 + seed))
            v.co.x += (cx - p.x) * chip
            v.co.y += (cy - p.y) * chip
            v.co.z -= chip * 0.45
        elif material == 'metal':
            # Slight forged rim deflection only on upper edges
            flare = 0.004 * intensity * max(0.0, rel_z - 0.8) * math.sin(math.atan2(p.y - cy, p.x - cx) * 4.0 + seed)
            v.co.x += flare
            v.co.y += flare * 0.6
        elif material == 'ice':
            # Vertical melt-fluting + undercut ablation waist near lower third + windward drift
            ang = math.atan2(p.y - cy, p.x - cx)
            flute = 1.0 + 0.06 * intensity * math.sin(ang * 7.0 + seed * 1.1)
            ablation = 1.0 - 0.09 * intensity * math.exp(-((rel_z - 0.28) / 0.18) ** 2)
            v.co.x = cx + (p.x - cx) * flute * ablation
            v.co.y = cy + (p.y - cy) * flute * ablation


def structured_fracture(
    bm,
    center,
    size,
    style='stone_slab',
    quad=0,
    seed=1,
    chip_edges=True,
    strata_layers=1,
    tilt=(0.0, 0.0),
):
    """Construct cleaved rock, carved stone, or fractured glacial ice with sharp preserved edges."""
    uv_layer, flat_layer = _ensure_layers(bm)
    c_vec = Vector(center)
    sx, sy, sz = size
    layers = max(1, int(strata_layers))
    added = []

    for l_idx in range(layers):
        tmp = bmesh.new()
        if style in ('serac_fin', 'ice_block', 'stone_slab', 'carved_ashlar'):
            bmesh.ops.create_cube(tmp, size=1.0)
            bmesh.ops.subdivide_edges(tmp, edges=list(tmp.edges), cuts=1, use_grid_fill=True)
        else:
            bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=0.58)

        layer_h = sz / layers
        z_off = (l_idx - 0.5 * (layers - 1)) * (layer_h * 0.94)
        shift_x = (0.04 * sx * math.sin(seed * 1.7 + l_idx * 2.1)) if layers > 1 else 0.0
        shift_y = (0.04 * sy * math.cos(seed * 1.3 + l_idx * 1.9)) if layers > 1 else 0.0
        scale_mul = (1.0 - 0.05 * l_idx) if layers > 1 else 1.0
        bmesh.ops.scale(tmp, vec=(sx * scale_mul, sy * scale_mul, layer_h), verts=tmp.verts)

        if style == 'serac_fin':
            # Sweeping curved knife-edged fin tapering with altitude and leaning along tilt
            for v in tmp.verts:
                zf = (v.co.z / max(layer_h, 1e-4)) + 0.5
                taper_x = 1.0 - 0.72 * (zf ** 1.35)
                taper_y = 1.0 - 0.80 * (zf ** 1.20)
                v.co.x = v.co.x * taper_x + tilt[0] * zf + 0.06 * sx * math.sin(zf * math.pi)
                v.co.y = v.co.y * taper_y + tilt[1] * zf

        planes = []
        if style == 'carved_ashlar':
            if chip_edges:
                planes = [
                    (Vector((0.46 * sx, 0.44 * sy, 0.42 * layer_h)), Vector((0.7, 0.7, 0.5)).normalized()),
                    (Vector((-0.46 * sx, -0.45 * sy, 0.43 * layer_h)), Vector((-0.7, -0.6, 0.5)).normalized()),
                ]
        elif style in ('stone_slab', 'sedimentary'):
            for k in range(7):
                ang = k * 2.39996 + seed * 0.91 + l_idx * 1.4
                elev = 0.25 + 0.65 * ((k % 3) / 2.0)
                n = Vector((math.cos(ang) * math.cos(elev), math.sin(ang) * math.cos(elev), math.sin(elev))).normalized()
                frac = 0.48 + 0.06 * math.sin(seed * 2.3 + k)
                plane_co = Vector((n.x * sx * frac, n.y * sy * frac, n.z * layer_h * frac))
                plane_no = Vector((n.x / max(sx, 1e-4), n.y / max(sy, 1e-4), n.z / max(layer_h, 1e-4))).normalized()
                planes.append((plane_co, plane_no))
        elif style == 'ice_block':
            planes = [
                (Vector((0.47 * sx, 0.0, 0.44 * layer_h)), Vector((0.55, 0.12, 0.82)).normalized()),
                (Vector((-0.46 * sx, 0.42 * sy, 0.42 * layer_h)), Vector((-0.65, 0.65, 0.40)).normalized()),
                (Vector((0.44 * sx, -0.44 * sy, -0.42 * layer_h)), Vector((0.68, -0.62, -0.40)).normalized()),
            ]
        elif style == 'serac_fin':
            planes = [
                (Vector((0.28 * sx + tilt[0] * 0.5, 0.22 * sy + tilt[1] * 0.5, 0.40 * layer_h)), Vector((0.48, 0.58, 0.66)).normalized()),
                (Vector((-0.26 * sx + tilt[0] * 0.7, -0.20 * sy + tilt[1] * 0.7, 0.36 * layer_h)), Vector((-0.55, -0.52, 0.65)).normalized()),
                (Vector((tilt[0] * 0.9, 0.18 * sy + tilt[1] * 0.9, 0.46 * layer_h)), Vector((0.15, 0.72, 0.68)).normalized()),
            ]
        else:
            # crag / erratic / ore_matrix / frost_drift
            for k in range(9):
                ang = k * 2.39996 + seed * 1.13 + l_idx
                elev = -0.25 + 1.35 * ((k % 5) / 4.0)
                n = Vector((math.cos(ang) * math.cos(elev), math.sin(ang) * math.cos(elev), math.sin(elev))).normalized()
                frac = 0.44 + 0.10 * math.sin(seed * 3.1 + k * 1.9)
                plane_co = Vector((n.x * sx * frac, n.y * sy * frac, n.z * layer_h * frac))
                plane_no = Vector((n.x / max(sx, 1e-4), n.y / max(sy, 1e-4), n.z / max(layer_h, 1e-4))).normalized()
                planes.append((plane_co, plane_no))

        for p_co, p_no in planes:
            if len(tmp.faces) < 6:
                break
            bmesh.ops.bisect_plane(
                tmp,
                geom=list(tmp.verts) + list(tmp.edges) + list(tmp.faces),
                plane_co=p_co,
                plane_no=p_no,
                clear_outer=True,
                clear_inner=False,
            )
            boundary = [e for e in tmp.edges if e.is_boundary]
            if boundary:
                bmesh.ops.holes_fill(tmp, edges=boundary)

        wear_mat = 'ice' if style in ('ice_block', 'serac_fin', 'frost_drift') else 'stone'
        if style != 'ice_block':
            layered_wear(tmp, list(tmp.verts), material=wear_mat, seed=seed + l_idx, intensity=0.8)
        bmesh.ops.triangulate(tmp, faces=tmp.faces)
        tmp.normal_update()

        offset = c_vec + Vector((shift_x, shift_y, z_off))
        v_map = {v: bm.verts.new(v.co + offset) for v in tmp.verts}
        for tf in tmp.faces:
            vs = tuple(v_map[v] for v in tf.verts)
            if len(set(vs)) < 3:
                continue
            nf = bm.faces.new(vs)
            nf.smooth = False
            nf[flat_layer] = 1
            _map_planar_uv(nf, uv_layer, quad, scale=0.72)
            added.append(nf)
        tmp.free()
    return added


# ---------------------------------------------------------------------------
# Algorithm 3: Crystal Growth Graph
# ---------------------------------------------------------------------------
def _build_prism_crystal(
    bm,
    base,
    axis_dir,
    r0,
    r1,
    length,
    sides=6,
    chisel_skew=0.25,
    flatness=1.0,
    stepped=True,
    quad=3,
    tip_chip=True,
):
    """Build a faceted mineral prism with stepped growth ledge and chipped asymmetric tip."""
    uv_layer, flat_layer = _ensure_layers(bm)
    d, tx, ty = _orthonormal_frame(axis_dir)
    b_vec = Vector(base)
    u0, u1, v0, v1 = zone_uv_bounds(quad)
    mid_u = 0.5 * (u0 + u1)

    stations = [0.0, 0.48, 0.52, 0.86] if stepped else [0.0, 0.52, 0.88]
    r_factors = [1.0, 0.94, 0.84, 0.78] if stepped else [1.0, 0.90, 0.78]
    rings = []
    face_centers = []

    for st_idx, (frac, rf) in enumerate(zip(stations, r_factors)):
        ring = []
        for s in range(sides):
            a = (s / sides) * math.tau
            ang_wob = 1.0 + 0.09 * math.sin(a * 2.0 + r0 * 9.0)
            rad_x = (r0 + (r1 - r0) * frac) * rf * ang_wob
            rad_y = rad_x * flatness
            local_rad = tx * (math.cos(a) * rad_x) + ty * (math.sin(a) * rad_y)
            h_skew = (chisel_skew * 0.4 * length * math.cos(a - 0.5)) if st_idx == len(stations) - 1 else 0.0
            v = bm.verts.new(b_vec + d * (length * frac + h_skew) + local_rad)
            ring.append(v)
        rings.append(ring)
        if st_idx == 1:
            for s in range(sides):
                sn = (s + 1) % sides
                fc = (ring[s].co + ring[sn].co) * 0.5
                fn = ((fc - (b_vec + d * (length * frac)))).normalized()
                # Anchor socket near lower third / base collar of parent prism
                collar_frac = 0.12 + 0.16 * ((s % 3) / 2.0)
                fc_low = b_vec + d * (length * collar_frac) + fn * (r0 * 0.90)
                face_centers.append((fc_low, fn))

    apex_off = tx * (r1 * 0.25) if tip_chip else Vector((0, 0, 0))
    apex = bm.verts.new(b_vec + d * (length * (1.03 + chisel_skew * 0.3)) + apex_off)
    base_center = bm.verts.new(b_vec)
    added = []

    for r_idx in range(len(rings) - 1):
        ra, rb = rings[r_idx], rings[r_idx + 1]
        va = v0 + (v1 - v0) * (r_idx / len(rings))
        vb = v0 + (v1 - v0) * ((r_idx + 1) / len(rings))
        for s in range(sides):
            sn = (s + 1) % sides
            f = bm.faces.new((ra[s], ra[sn], rb[sn], rb[s]))
            f.smooth = False
            f[flat_layer] = 1
            for loop, coord in zip(f.loops, ((u0, va), (u1, va), (u1, vb), (u0, vb))):
                loop[uv_layer].uv = coord
            added.append(f)

    top_ring = rings[-1]
    bot_ring = rings[0]
    for s in range(sides):
        sn = (s + 1) % sides
        ft = bm.faces.new((top_ring[s], top_ring[sn], apex))
        ft.smooth = False
        ft[flat_layer] = 1
        for loop, coord in zip(ft.loops, ((u0, v1 - 0.12), (u1, v1 - 0.12), (mid_u, v1))):
            loop[uv_layer].uv = coord
        fb = bm.faces.new((bot_ring[sn], bot_ring[s], base_center))
        fb.smooth = False
        fb[flat_layer] = 1
        for loop in fb.loops:
            loop[uv_layer].uv = (mid_u, v0)
        added.extend((ft, fb))

    return face_centers, added


build_prism_crystal = _build_prism_crystal


def crystal_growth_graph(
    bm,
    center,
    height,
    radius,
    rng,
    parent_quad=1,
    child_quad=3,
    rock_quad=0,
    parent_sides=6,
    parent_count=1,
    daughter_count=6,
    basal_count=5,
    stepped=True,
    directional_tilt=(0.0, 0.0),
    with_rock_base=True,
):
    """Build parent crystal/stone axes with epitaxial daughter shards attached to parent faces."""
    c_vec = Vector(center)
    if with_rock_base:
        structured_fracture(
            bm,
            c_vec + Vector((0.0, 0.0, radius * 0.22)),
            (radius * 2.1, radius * 1.9, radius * 0.62),
            style='crag',
            quad=rock_quad,
            seed=int(height * 100) + 17,
        )

    parent_sockets = []
    for p_i in range(max(1, parent_count)):
        ang = (p_i / max(1, parent_count)) * math.tau + 0.25
        off = Vector((0, 0, 0)) if p_i == 0 else Vector((math.cos(ang) * radius * 0.38, math.sin(ang) * radius * 0.38, 0.0))
        tilt = Vector((
            directional_tilt[0] + rng.uniform(-0.14, 0.14),
            directional_tilt[1] + rng.uniform(-0.14, 0.14),
            1.0,
        )).normalized()
        p_h = height * (1.0 if p_i == 0 else rng.uniform(0.58, 0.82))
        p_r0 = radius * (0.44 if p_i == 0 else rng.uniform(0.24, 0.34))
        p_r1 = p_r0 * (0.76 if p_i == 0 else 0.56)
        sockets, _ = _build_prism_crystal(
            bm,
            c_vec + off + Vector((0.0, 0.0, radius * 0.14)),
            tilt,
            p_r0,
            p_r1,
            p_h,
            sides=parent_sides if p_i == 0 else rng.choice((5, 6, 8)),
            chisel_skew=0.20 + p_i * 0.06,
            flatness=1.0 if p_i == 0 else rng.uniform(0.75, 1.0),
            stepped=stepped,
            quad=parent_quad,
            tip_chip=(p_i % 2 == 1),
        )
        for idx_s, (fc, fn) in enumerate(sockets):
            parent_sockets.append((fc - tilt * (p_h * 0.04 * (idx_s % 2)), fn, p_r0))

    # Daughter crystals emerging around the lower third / base collar of parent prism faces
    for d_i in range(daughter_count):
        if parent_sockets:
            sock_pos, sock_n, p_rad = parent_sockets[d_i % len(parent_sockets)]
            s_base = sock_pos - sock_n * (p_rad * 0.28)
            s_axis = (sock_n * rng.uniform(0.36, 0.65) + Vector((directional_tilt[0], directional_tilt[1], 0.96))).normalized()
        else:
            a = (d_i / max(1, daughter_count)) * math.tau
            s_base = c_vec + Vector((math.cos(a) * radius * 0.32, math.sin(a) * radius * 0.32, radius * 0.18))
            s_axis = Vector((math.cos(a) * 0.42, math.sin(a) * 0.42, 0.95)).normalized()

        prism_sides = (5, 6, 8, 6)[d_i % 4]
        flat = 0.62 if d_i % 3 == 2 else 1.0
        _build_prism_crystal(
            bm,
            s_base,
            s_axis,
            radius * rng.uniform(0.20, 0.28),
            radius * rng.uniform(0.10, 0.16),
            height * rng.uniform(0.45, 0.68),
            sides=prism_sides,
            chisel_skew=rng.uniform(0.18, 0.38),
            flatness=flat,
            stepped=(d_i % 2 == 0),
            quad=child_quad,
            tip_chip=(d_i % 2 == 0),
        )

    # Tertiary basal crystal chips around the socket collar
    for b_i in range(basal_count):
        a = (b_i / max(1, basal_count)) * math.tau + rng.uniform(-0.25, 0.25)
        r_off = radius * rng.uniform(0.42, 0.78)
        s_base = c_vec + Vector((math.cos(a) * r_off, math.sin(a) * r_off, radius * 0.08))
        s_axis = Vector((math.cos(a) * 0.68 + directional_tilt[0], math.sin(a) * 0.68 + directional_tilt[1], 0.82)).normalized()
        _build_prism_crystal(
            bm,
            s_base,
            s_axis,
            radius * rng.uniform(0.09, 0.15),
            radius * rng.uniform(0.03, 0.07),
            height * rng.uniform(0.18, 0.32),
            sides=5 if b_i % 2 else 6,
            chisel_skew=0.35,
            flatness=0.72 if b_i % 2 else 1.0,
            stepped=False,
            quad=child_quad if b_i % 3 != 2 else parent_quad,
            tip_chip=True,
        )


# ---------------------------------------------------------------------------
# Algorithm 4: Timber Joinery
# ---------------------------------------------------------------------------
def timber_joinery(
    bm,
    p0,
    p1,
    width=0.14,
    depth=0.14,
    quad=1,
    bow=0.012,
    wear_seed=1,
    tenon_ends=False,
    pegs=False,
    iron_straps=False,
    bracket_ends=False,
    strap_quad=2,
):
    """Build a hand-hewn timber beam with grain bow, non-uniform bevels, pegs & iron hardware."""
    v0 = Vector(p0)
    v1 = Vector(p1)
    delta = v1 - v0
    length = delta.length
    if length < 1e-4:
        return
    d, x_ax, y_ax = _orthonormal_frame(delta)
    # 4-station sweep for subtle directional grain bow and corner wear
    pts = []
    rads = []
    hw = width * 0.5
    hd = depth * 0.5
    for s_i in range(4):
        t = s_i / 3.0
        camber = math.sin(t * math.pi) * bow
        pt = v0.lerp(v1, t) + x_ax * camber + y_ax * (camber * 0.45 * math.cos(wear_seed))
        # Subtle adze taper & chamfered cross-section
        w_var = 1.0 - 0.04 * abs(t - 0.5)
        pts.append(pt)
        rads.append((hw * w_var, hd * w_var))
    profile_sweep(bm, pts, rads, profile='rect_chamfer', sides=8, quad=quad, cap_ends=True, mark_flat=True)

    if tenon_ends and length > 0.25:
        for t_pt, t_dir in ((v0, -d), (v1, d)):
            add_chamfered_box(
                bm,
                t_pt + t_dir * (min(width, depth) * 0.22),
                (width * 0.62, depth * 0.62, min(width, depth) * 0.42),
                quad=quad,
                bevel=0.008,
            )

    if pegs and length > 0.28:
        for frac in (0.11, 0.89):
            peg_c = v0.lerp(v1, frac)
            peg_a = peg_c - x_ax * (hw + 0.022)
            peg_b = peg_c + x_ax * (hw + 0.022)
            profile_sweep(bm, [peg_a, peg_b], [min(width, depth) * 0.14] * 2, profile='oval', sides=6, quad=quad, mark_flat=True)

    if iron_straps and length > 0.25:
        for frac in (0.12, 0.88):
            c_pt = v0.lerp(v1, frac)
            camber = math.sin(frac * math.pi) * bow
            c_pt = c_pt + x_ax * camber + y_ax * (camber * 0.45 * math.cos(wear_seed))
            profile_sweep(
                bm,
                [c_pt - d * 0.032, c_pt + d * 0.032],
                [(hw * 1.13, hd * 1.13)] * 2,
                profile='rect_chamfer',
                sides=8,
                quad=strap_quad,
                mark_flat=True,
            )
            # Bolt rivet heads on opposite sides
            for sgn in (-1.0, 1.0):
                b_c = c_vec_bolt = c_pt + x_ax * (sgn * hw * 1.13)
                add_chamfered_box(bm, c_vec_bolt, (0.022, 0.026, 0.026), quad=strap_quad, bevel=0.004)

    if bracket_ends and length > 0.28:
        for frac, sgn in ((0.06, 1.0), (0.94, -1.0)):
            b_pt = v0.lerp(v1, frac)
            profile_sweep(
                bm,
                [b_pt - d * 0.02, b_pt + d * (0.08 * sgn)],
                [(hw * 1.18, hd * 1.18)] * 2,
                profile='rect_chamfer',
                sides=8,
                quad=strap_quad,
                mark_flat=True,
            )


# ---------------------------------------------------------------------------
# Algorithm 6: Manufactured Mechanical Assemblies
# ---------------------------------------------------------------------------
def add_pillow_block_bearing(bm, center, axis_dir, shaft_r=0.055, base_w=0.22, quad_metal=2, quad_wood=1):
    """Axis-aligned cast-iron pillow block bearing housing with bronze collar & anchor bolts."""
    d, tx, ty = _orthonormal_frame(axis_dir)
    c_vec = Vector(center)
    # Bearing barrel collar around shaft axis
    profile_sweep(bm, [c_vec - d * 0.06, c_vec + d * 0.06], [shaft_r * 1.65] * 2, profile='oval', sides=10, quad=quad_metal, mark_flat=True)
    # Saddle base pad + side bolt ears
    rot_m = Matrix(((tx.x, ty.x, d.x, 0), (tx.y, ty.y, d.y, 0), (tx.z, ty.z, d.z, 0), (0, 0, 0, 1)))
    rx, ry, rz = rot_m.to_euler('XYZ')
    add_chamfered_box(bm, c_vec - ty * (shaft_r * 1.15), (base_w, shaft_r * 1.1, 0.09), quad=quad_metal, rx=rx, ry=ry, rz=rz, bevel=0.01)
    for sgn in (-1.0, 1.0):
        bolt_p = c_vec + tx * (sgn * base_w * 0.36) - ty * (shaft_r * 0.52)
        profile_sweep(bm, [bolt_p, bolt_p + ty * 0.045], [0.018] * 2, profile='oval', sides=6, quad=quad_metal, mark_flat=True)


def add_pulley_sheave(bm, center, axis_dir, radius=0.16, width=0.08, quad_metal=2, clevis_dir=None):
    """Grooved pulley wheel with cheek flanges, axle pin & optional hanging clevis strap."""
    d, tx, ty = _orthonormal_frame(axis_dir)
    c_vec = Vector(center)
    # Left flange, narrow V-groove hub, right flange
    w_fl = width * 0.24
    pts = [
        c_vec - d * (width * 0.50),
        c_vec - d * (width * 0.22),
        c_vec,
        c_vec + d * (width * 0.22),
        c_vec + d * (width * 0.50),
    ]
    rads = [radius, radius * 0.72, radius * 0.68, radius * 0.72, radius]
    profile_sweep(bm, pts, rads, profile='oval', sides=14, quad=quad_metal, mark_flat=True)
    # Axle pin protruding through cheek plates
    profile_sweep(bm, [c_vec - d * (width * 0.95), c_vec + d * (width * 0.95)], [radius * 0.24] * 2, profile='oval', sides=8, quad=quad_metal, mark_flat=True)
    if clevis_dir is not None:
        cd = Vector(clevis_dir).normalized()
        for sgn in (-1.0, 1.0):
            side_p = c_vec + d * (sgn * width * 0.68)
            profile_sweep(bm, [side_p, side_p + cd * (radius * 1.25), c_vec + cd * (radius * 1.55)], [0.022, 0.022, 0.024], profile='rect_chamfer', sides=8, quad=quad_metal, mark_flat=True)
        add_chamfered_box(bm, c_vec + cd * (radius * 1.62), (0.08, 0.08, 0.08), quad=quad_metal, bevel=0.01)


def add_winding_drum(bm, p0, p1, drum_r=0.14, flange_r=0.22, wraps=6, rope_r=0.020, quad_wood=1, quad_metal=2, quad_rope=1):
    """Flanged winch/hoist barrel with individual helical rope coils wrapped cleanly around the drum."""
    v0, v1 = Vector(p0), Vector(p1)
    d, tx, ty = _orthonormal_frame(v1 - v0)
    span = (v1 - v0).length
    profile_sweep(bm, [v0, v1], [drum_r] * 2, profile='oval', sides=14, quad=quad_wood, mark_flat=True)
    for f_pt in (v0, v1):
        profile_sweep(bm, [f_pt - d * 0.025, f_pt + d * 0.025], [flange_r] * 2, profile='oval', sides=14, quad=quad_metal, mark_flat=True)
    profile_sweep(bm, [v0 - d * 0.12, v1 + d * 0.12], [drum_r * 0.36] * 2, profile='oval', sides=8, quad=quad_metal, mark_flat=True)

    # Helical rope coil path hugging barrel surface
    coil_pts = []
    steps = max(12, wraps * 8)
    usable = max(0.08, span - 0.08)
    for i in range(steps + 1):
        t = i / steps
        ang = t * wraps * math.tau
        pos = v0.lerp(v1, 0.5) + d * ((t - 0.5) * usable) + (tx * math.cos(ang) + ty * math.sin(ang)) * (drum_r + rope_r * 0.72)
        coil_pts.append(pos)
    profile_sweep(bm, coil_pts, [rope_r] * len(coil_pts), profile='rope_strand', sides=6, twist_total=wraps * math.tau, quad=quad_rope, mark_flat=False)


def add_gear_wheel_with_pawl(bm, center, axis_dir, pitch_r=0.34, thickness=0.10, teeth=14, quad_metal=2, with_pawl=True):
    """Mechanical spur/ratchet gear with sculpted trapezoidal teeth, hub & pivoted locking pawl."""
    d, tx, ty = _orthonormal_frame(axis_dir)
    c_vec = Vector(center)
    profile_sweep(bm, [c_vec - d * (thickness * 0.5), c_vec + d * (thickness * 0.5)], [pitch_r * 0.86] * 2, profile='oval', sides=max(14, teeth), quad=quad_metal, mark_flat=True)
    profile_sweep(bm, [c_vec - d * (thickness * 0.72), c_vec + d * (thickness * 0.72)], [pitch_r * 0.34] * 2, profile='oval', sides=10, quad=quad_metal, mark_flat=True)
    tooth_h = max(0.032, pitch_r * 0.18)
    tooth_w = (math.tau * pitch_r) / max(teeth * 2.1, 1)
    for t_i in range(teeth):
        a = (t_i / teeth) * math.tau
        rad = tx * math.cos(a) + ty * math.sin(a)
        p_in = c_vec + rad * (pitch_r * 0.82)
        p_out = c_vec + rad * (pitch_r * 0.82 + tooth_h)
        profile_sweep(
            bm,
            [p_in, p_out],
            [(tooth_w * 0.58, thickness * 0.46), (tooth_w * 0.36, thickness * 0.44)],
            profile='rect_chamfer',
            sides=8,
            quad=quad_metal,
            mark_flat=True,
        )
    if with_pawl:
        pawl_piv = c_vec + tx * (pitch_r * 1.18) + ty * (pitch_r * 0.42)
        pawl_tip = c_vec + tx * (pitch_r * 0.88) + ty * (pitch_r * 0.18)
        profile_sweep(bm, [pawl_piv, pawl_tip], [(0.04, thickness * 0.4), (0.022, thickness * 0.35)], profile='rect_chamfer', sides=8, quad=quad_metal, mark_flat=True)
        profile_sweep(bm, [pawl_piv - d * thickness, pawl_piv + d * thickness], [0.035] * 2, profile='oval', sides=8, quad=quad_metal, mark_flat=True)


def add_routed_rope_path(bm, waypoints, rope_r=0.022, sag=0.0, quad=1, sides=7):
    """Sweep a continuous stranded rope cleanly through mechanical waypoints with optional catenary sag."""
    pts = [Vector(p) for p in waypoints]
    if len(pts) < 2:
        return
    dense = []
    if sag > 1e-4:
        for i in range(len(pts) - 1):
            for s in range(4):
                t = s / 4.0
                p = pts[i].lerp(pts[i + 1], t)
                p.z -= sag * math.sin(t * math.pi)
                dense.append(p)
        dense.append(pts[-1])
    else:
        dense = pts
    profile_sweep(bm, dense, [rope_r] * len(dense), profile='rope_strand', sides=sides, twist_total=len(dense) * 2.5, quad=quad, mark_flat=False)


def add_chain_link_span(bm, p0, p1, link_len=0.09, link_w=0.052, wire_r=0.013, quad=2):
    """Build interlocking oval forged-iron chain links alternating 90 degrees along p0..p1."""
    v0, v1 = Vector(p0), Vector(p1)
    delta = v1 - v0
    span = delta.length
    if span < 0.04:
        return
    d, tx, ty = _orthonormal_frame(delta)
    step = link_len * 0.68
    count = max(2, min(14, int(round(span / max(step, 0.04)))))
    for i in range(count):
        frac = (i + 0.5) / count
        c = v0.lerp(v1, frac)
        side_ax = tx if (i % 2 == 0) else ty
        loop_pts = []
        hw = link_w * 0.5
        hl = link_len * 0.5
        for k in range(8):
            a = (k / 8.0) * math.tau
            loop_pts.append(c + d * (math.cos(a) * hl) + side_ax * (math.sin(a) * hw))
        profile_sweep(bm, loop_pts, [wire_r] * len(loop_pts), profile='oval', sides=5, quad=quad, cap_ends=False, mark_flat=True, closed=True)


def add_revolved_vessel(
    bm,
    base_center,
    profile_rz,
    sides=14,
    wall_t=0.055,
    quad_outer=2,
    quad_inner=0,
    ribs=6,
    rim_lip=True,
    handles=False,
):
    """Build a true thick-walled hollow circular/octagonal bowl or crucible via profile revolution."""
    uv_layer, flat_layer = _ensure_layers(bm)
    c_vec = Vector(base_center)
    u_o0, u_o1, v_o0, v_o1 = zone_uv_bounds(quad_outer)
    u_i0, u_i1, v_i0, v_i1 = zone_uv_bounds(quad_inner)

    # Construct closed cross-section loop: outer bottom -> outer rim -> inner rim -> inner bottom
    outer_pts = [(max(0.04, r), z) for r, z in profile_rz]
    inner_pts = [(max(0.02, r - wall_t), z + wall_t * 0.35 if idx == 0 else z) for idx, (r, z) in enumerate(reversed(outer_pts))]
    if rim_lip and len(outer_pts) >= 2:
        top_r, top_z = outer_pts[-1]
        outer_pts.append((top_r + wall_t * 0.45, top_z + wall_t * 0.25))
        inner_pts.insert(0, (max(0.02, top_r - wall_t * 0.85), top_z + wall_t * 0.25))

    ring_loops = []
    n_p = len(outer_pts)
    full_prof = [(r, z, False) for r, z in outer_pts] + [(r, z, True) for r, z in inner_pts]
    n_prof = len(full_prof)

    for s in range(sides):
        a = (s / sides) * math.tau
        ca, sa = math.cos(a), math.sin(a)
        col = []
        for idx_p, (rr, zz, is_in) in enumerate(full_prof):
            v = bm.verts.new(c_vec + Vector((ca * rr, sa * rr, zz)))
            col.append((v, is_in, idx_p))
        ring_loops.append(col)

    for s in range(sides):
        sn = (s + 1) % sides
        ca, cb = ring_loops[s], ring_loops[sn]
        for p_idx in range(n_prof):
            pn = (p_idx + 1) % n_prof
            v00, in0, _ = ca[p_idx]
            v10, _, _ = cb[p_idx]
            v11, in1, _ = cb[pn]
            v01, _, _ = ca[pn]
            vs = (v00, v10, v11, v01)
            if len(set(vs)) == 4:
                f = bm.faces.new(vs)
                f.smooth = sides >= 12
                if sides < 12:
                    f[flat_layer] = 1
                u0, u1, v0, v1 = (u_i0, u_i1, v_i0, v_i1) if (in0 and in1) else (u_o0, u_o1, v_o0, v_o1)
                ta = s / sides
                tb = (s + 1) / sides
                pa = p_idx / n_prof
                pb = (p_idx + 1) / n_prof
                for loop, (uu, vv) in zip(f.loops, ((ta, pa), (tb, pa), (tb, pb), (ta, pb))):
                    loop[uv_layer].uv = (u0 + uu * (u1 - u0), v0 + vv * (v1 - v0))

    # Cap solid bottom floor & inner basin center
    bot_c = bm.verts.new(c_vec + Vector((0, 0, outer_pts[0][1])))
    in_c = bm.verts.new(c_vec + Vector((0, 0, inner_pts[-1][1])))
    for s in range(sides):
        sn = (s + 1) % sides
        fb = bm.faces.new((ring_loops[sn][0][0], ring_loops[s][0][0], bot_c))
        fi = bm.faces.new((ring_loops[s][-1][0], ring_loops[sn][-1][0], in_c))
        for f_c, uv_b in ((fb, (u_o0, u_o1, v_o0, v_o1)), (fi, (u_i0, u_i1, v_i0, v_i1))):
            f_c.smooth = False
            f_c[flat_layer] = 1
            for loop in f_c.loops:
                loop[uv_layer].uv = (0.5 * (uv_b[0] + uv_b[1]), 0.5 * (uv_b[2] + uv_b[3]))

    # Exterior forged vertical stiffener ribs
    if ribs > 0 and len(outer_pts) >= 2:
        for r_i in range(ribs):
            a = (r_i / ribs) * math.tau
            rib_pts = [c_vec + Vector((math.cos(a) * (r + 0.015), math.sin(a) * (r + 0.015), z)) for r, z in profile_rz]
            profile_sweep(bm, rib_pts, [0.022] * len(rib_pts), profile='rect_chamfer', sides=8, quad=quad_outer, mark_flat=True)

    # Side cast ring handles
    if handles and len(profile_rz) >= 2:
        mid_r, mid_z = profile_rz[min(1, len(profile_rz) - 1)]
        for sgn in (-1.0, 1.0):
            hc = c_vec + Vector((sgn * (mid_r + 0.05), 0.0, mid_z + 0.04))
            add_chamfered_box(bm, hc, (0.06, 0.09, 0.06), quad=quad_outer, bevel=0.008)
            ring_pts = [hc + Vector((sgn * (0.04 + 0.05 * math.cos(k / 8 * math.tau)), 0.05 * math.sin(k / 8 * math.tau), -0.05)) for k in range(8)]
            profile_sweep(bm, ring_pts, [0.014] * len(ring_pts), profile='oval', sides=5, quad=quad_outer, cap_ends=False, mark_flat=True, closed=True)


def add_flared_hopper_box(
    bm,
    bottom_center,
    bottom_xy,
    top_xy,
    height,
    wall_t=0.075,
    quad_wood=1,
    quad_metal=2,
    wear_plates=True,
):
    """Build a true hollow tapered hopper funnel wider at top than bottom, with corner irons & bolts."""
    uv_layer, flat_layer = _ensure_layers(bm)
    c_vec = Vector(bottom_center)
    bx, by = bottom_xy[0] * 0.5, bottom_xy[1] * 0.5
    tx, ty = top_xy[0] * 0.5, top_xy[1] * 0.5

    # Build 4 slanted trapezoidal plank walls + thick bottom collar frame + top iron lip
    walls = (
        # (bot_mid_x, bot_mid_y, top_mid_x, top_mid_y, span_b, span_t, rot_axis)
        ((0, -by), (0, -ty), bottom_xy[0], top_xy[0], 'y', -1),
        ((0, by), (0, ty), bottom_xy[0], top_xy[0], 'y', 1),
        ((-bx, 0), (-tx, 0), bottom_xy[1], top_xy[1], 'x', -1),
        ((bx, 0), (tx, 0), bottom_xy[1], top_xy[1], 'x', 1),
    )
    for (bm_x, bm_y), (tm_x, tm_y), sb, st, axis, sgn in walls:
        p0 = c_vec + Vector((bm_x, bm_y, 0.0))
        p1 = c_vec + Vector((tm_x, tm_y, height))
        # Build tapered trapezoid panel swept vertically
        if axis == 'y':
            rads = [(sb * 0.5 + wall_t * 0.3, wall_t * 0.5), (st * 0.5 + wall_t * 0.5, wall_t * 0.5)]
        else:
            rads = [(wall_t * 0.5, sb * 0.5 + wall_t * 0.3), (wall_t * 0.5, st * 0.5 + wall_t * 0.5)]
        # Direct oriented trapezoid prism for exact X/Y width alignment
        d_vec = p1 - p0
        n_steps = 2
        pts = [p0, p0.lerp(p1, 0.5), p1]
        for seg_idx in range(2):
            f0, f1 = seg_idx * 0.5, (seg_idx + 1) * 0.5
            mid = p0.lerp(p1, 0.5 * (f0 + f1))
            w_cur = sb + (st - sb) * 0.5 * (f0 + f1) + wall_t * 0.4
            tilt_a = math.atan2((tm_y - bm_y) if axis == 'y' else (tm_x - bm_x), height)
            seg_len = d_vec.length * 0.52
            if axis == 'y':
                add_chamfered_box(bm, mid, (w_cur, wall_t, seg_len), quad=quad_wood, rx=-tilt_a, bevel=0.01, wear='wood', wear_seed=seg_idx + 3)
            else:
                add_chamfered_box(bm, mid, (wall_t, w_cur, seg_len), quad=quad_wood, ry=tilt_a, bevel=0.01, wear='wood', wear_seed=seg_idx + 7)
            if wear_plates and seg_idx == 1:
                in_off = Vector((0, -sgn * wall_t * 0.45, 0)) if axis == 'y' else Vector((-sgn * wall_t * 0.45, 0, 0))
                if axis == 'y':
                    add_chamfered_box(bm, mid + in_off, (w_cur * 0.72, 0.025, seg_len * 0.80), quad=quad_metal, rx=-tilt_a, bevel=0.005)
                else:
                    add_chamfered_box(bm, mid + in_off, (0.025, w_cur * 0.72, seg_len * 0.80), quad=quad_metal, ry=tilt_a, bevel=0.005)

    # 4 corner iron angle brackets & rivets binding the slanted walls
    for sx in (-1, 1):
        for sy in (-1, 1):
            c_bot = c_vec + Vector((sx * bx, sy * by, 0.0))
            c_top = c_vec + Vector((sx * tx, sy * ty, height))
            profile_sweep(bm, [c_bot, c_top], [(0.055, 0.055), (0.062, 0.062)], profile='rect_chamfer', sides=8, quad=quad_metal, mark_flat=True)
            for rf in (0.25, 0.55, 0.82):
                rp = c_bot.lerp(c_top, rf) + Vector((sx * 0.035, sy * 0.035, 0.0))
                add_chamfered_box(bm, rp, (0.03, 0.03, 0.03), quad=quad_metal, bevel=0.005)

    # Top metal rim flange collar
    rim_z = c_vec.z + height
    add_chamfered_box(bm, (c_vec.x, c_vec.y - ty, rim_z), (top_xy[0] + wall_t * 1.4, wall_t * 1.35, 0.065), quad=quad_metal, bevel=0.01)
    add_chamfered_box(bm, (c_vec.x, c_vec.y + ty, rim_z), (top_xy[0] + wall_t * 1.4, wall_t * 1.35, 0.065), quad=quad_metal, bevel=0.01)
    add_chamfered_box(bm, (c_vec.x - tx, c_vec.y, rim_z), (wall_t * 1.35, top_xy[1] + wall_t * 1.4, 0.065), quad=quad_metal, bevel=0.01)
    add_chamfered_box(bm, (c_vec.x + tx, c_vec.y, rim_z), (wall_t * 1.35, top_xy[1] + wall_t * 1.4, 0.065), quad=quad_metal, bevel=0.01)


def add_draped_banner_flag(
    bm,
    arm_start,
    arm_dir,
    width=0.72,
    height=0.38,
    sag=0.07,
    billow=0.08,
    swallowtail=True,
    quad_cloth=3,
    quad_trim=2,
):
    """Build a 3D hanging fabric banner with crossbar, suspension rings, catenary sag & wind ripple."""
    uv_layer, flat_layer = _ensure_layers(bm)
    p0 = Vector(arm_start)
    ad = Vector(arm_dir).normalized()
    # Crossbar arm + finial cap
    p1 = p0 + ad * (width + 0.08)
    profile_sweep(bm, [p0, p1], [0.024, 0.020], profile='oval', sides=8, quad=quad_trim, mark_flat=True)
    add_chamfered_box(bm, p1, (0.055, 0.055, 0.055), quad=quad_trim, bevel=0.008)

    # Suspension grommet collars hanging from crossbar
    for gf in (0.12, 0.38, 0.64, 0.90):
        gp = p0.lerp(p1, gf)
        profile_sweep(bm, [gp - Vector((0, 0, 0.01)), gp + Vector((0, 0, 0.03))], [0.032] * 2, profile='oval', sides=6, quad=quad_trim, mark_flat=True)

    # Thickened 2-sided 3D fabric cloth sheet hanging below arm
    cols, rows = 8, 5
    perp = Vector((-ad.y, ad.x, 0.0)).normalized() if math.hypot(ad.x, ad.y) > 1e-3 else Vector((0, 1, 0))
    u0, u1, v0, v1 = zone_uv_bounds(quad_cloth)
    thick = 0.014
    front_grid = []
    back_grid = []
    for r in range(rows + 1):
        vf = r / rows
        row_f, row_b = [], []
        for c in range(cols + 1):
            uf = c / cols
            # Catenary sag along top edge & fluttering wind ripple toward fly end
            cat_sag = sag * math.sin(uf * math.pi) * (1.0 - 0.55 * vf)
            wave = billow * math.sin(uf * math.pi * 1.85 + vf * 1.1) * (0.25 + 0.75 * vf)
            drop = height * vf
            if swallowtail and vf > 0.55:
                notch = 0.28 * height * (1.0 - abs(uf - 0.5) * 2.0) * ((vf - 0.55) / 0.45)
                drop = max(0.05, drop - notch)
            base_pt = p0 + ad * (0.04 + uf * width) + Vector((0.0, 0.0, -0.02 - cat_sag - drop)) + perp * wave
            uv_c = (u0 + uf * (u1 - u0), v0 + (1.0 - vf) * (v1 - v0))
            row_f.append((bm.verts.new(base_pt + perp * thick), uv_c))
            row_b.append((bm.verts.new(base_pt - perp * thick), uv_c))
        front_grid.append(row_f)
        back_grid.append(row_b)

    for r in range(rows):
        for c in range(cols):
            for g, rev in ((front_grid, False), (back_grid, True)):
                a0, uva = g[r][c]
                a1, uvb = g[r][c + 1]
                b1, uvc = g[r + 1][c + 1]
                b0, uvd = g[r + 1][c]
                vs = (a0, b0, b1, a1) if rev else (a0, a1, b1, b0)
                uvs = (uva, uvd, uvc, uvb) if rev else (uva, uvb, uvc, uvd)
                f = bm.faces.new(vs)
                f.smooth = True
                for loop, coord in zip(f.loops, uvs):
                    loop[uv_layer].uv = coord

    # Stitch fabric edges closed
    for c in range(cols):
        f_top = bm.faces.new((front_grid[0][c][0], back_grid[0][c][0], back_grid[0][c + 1][0], front_grid[0][c + 1][0]))
        f_bot = bm.faces.new((front_grid[-1][c + 1][0], back_grid[-1][c + 1][0], back_grid[-1][c][0], front_grid[-1][c][0]))
        for f_e in (f_top, f_bot):
            f_e.smooth = False
            for loop in f_e.loops:
                loop[uv_layer].uv = (0.5 * (u0 + u1), 0.5 * (v0 + v1))
    for r in range(rows):
        f_l = bm.faces.new((front_grid[r + 1][0][0], back_grid[r + 1][0][0], back_grid[r][0][0], front_grid[r][0][0]))
        f_r = bm.faces.new((front_grid[r][-1][0], back_grid[r][-1][0], back_grid[r + 1][-1][0], front_grid[r + 1][-1][0]))
        for f_e in (f_l, f_r):
            f_e.smooth = False
            for loop in f_e.loops:
                loop[uv_layer].uv = (0.5 * (u0 + u1), 0.5 * (v0 + v1))


# ---------------------------------------------------------------------------
# Algorithm 7: Semantic Silhouette Constraints
# ---------------------------------------------------------------------------
def semantic_silhouette_constraints(bm, name, max_drift=0.14):
    """Ground object cleanly and constrain bbox span within max_drift of REFERENCE_BBOXES."""
    if not bm.verts or name not in REFERENCE_BBOXES:
        return
    ref = REFERENCE_BBOXES[name]
    r_min = Vector(ref['mins'])
    r_max = Vector(ref['maxs'])
    r_span = r_max - r_min
    r_mid = 0.5 * (r_min + r_max)

    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    cur_min = Vector((min(xs), min(ys), min(zs)))
    cur_max = Vector((max(xs), max(ys), max(zs)))
    cur_span = cur_max - cur_min
    cur_mid = 0.5 * (cur_min + cur_max)

    # Compute per-axis gentle clamp scaling if span drifted past max_drift
    scales = []
    for ax in range(3):
        rs = max(r_span[ax], 0.1)
        cs = max(cur_span[ax], 1e-4)
        lo = rs * (1.0 - max_drift)
        hi = rs * (1.0 + max_drift)
        if cs < lo:
            scales.append(lo / cs)
        elif cs > hi:
            scales.append(hi / cs)
        else:
            scales.append(1.0)

    sx, sy, sz = scales
    # Ground anchor: preserve reference bottom grade (around -0.02..0.0)
    target_min_z = max(-0.045, min(0.0, r_min.z))
    for v in bm.verts:
        v.co.x = r_mid.x + (v.co.x - cur_mid.x) * sx
        v.co.y = r_mid.y + (v.co.y - cur_mid.y) * sy
        v.co.z = target_min_z + (v.co.z - cur_min.z) * sz
