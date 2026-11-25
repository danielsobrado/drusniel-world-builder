"""Botanical multi-tier shrub skeleton & volumetric curved-spray geometry builders.

Builds game-ready (~1,500–2,800 triangle) AAA shrubs with:
  - Tapered organic curved canes rooted slightly below z=0 (no hovering on slopes)
  - 3-tier foliage placement: inner-core/basal skirt + mid-canopy + irregular outer shoots
  - Crossed, gently arched & V-cupped multi-quad spray cards (zero flat billboard edge collapse)
  - Strictly clean triangulated topology (no degenerate triangles -> exact gltfpack parity)
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

SPRAY_A_U = (0.255, 0.615)
SPRAY_B_U = (0.635, 0.985)
BARK_U = (0.015, 0.215)


def _catmull_rom(points, radii, subdiv=2):
    if len(points) < 2 or subdiv <= 1:
        return list(points), list(radii)
    out_p, out_r = [], []
    n = len(points)
    for i in range(n - 1):
        p0 = points[max(0, i - 1)]
        p1 = points[i]
        p2 = points[i + 1]
        p3 = points[min(n - 1, i + 2)]
        r1, r2 = radii[i], radii[i + 1]
        for s in range(subdiv):
            t = s / subdiv
            t2, t3 = t * t, t * t * t
            pt = 0.5 * (
                (2.0 * p1)
                + (-p0 + p2) * t
                + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
                + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
            )
            out_p.append(pt)
            out_r.append(r1 + (r2 - r1) * t)
    out_p.append(points[-1])
    out_r.append(radii[-1])
    return out_p, out_r


def add_cane(bm, uv, points, radii, sides=5, subdiv=2, u_range=BARK_U, v_range=(0.02, 0.96), cap_end=False):
    """Smooth tapered woody branch/cane with parallel-transport framing."""
    pts, rads = _catmull_rom(points, radii, subdiv=subdiv)
    d0 = (pts[1] - pts[0]).normalized()
    normal = d0.orthogonal().normalized()
    total = sum((pts[i] - pts[i - 1]).length for i in range(1, len(pts)))
    acc = 0.0
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        normal = (normal - d * normal.dot(d)).normalized()
        binormal = d.cross(normal)
        if i > 0:
            acc += (pts[i] - pts[i - 1]).length
        vc = v_range[0] + (v_range[1] - v_range[0]) * (acc / max(total, 1e-5))
        ring = []
        for s in range(sides):
            ang = s / sides * math.tau
            offset = (normal * math.cos(ang) + binormal * math.sin(ang)) * rads[i]
            uc = u_range[0] + (u_range[1] - u_range[0]) * (s / sides)
            ring.append((bm.verts.new(p + offset), (uc, vc)))
        rings.append(ring)
    for ra, rb in zip(rings[:-1], rings[1:]):
        for s in range(sides):
            sn = (s + 1) % sides
            vs = (ra[s][0], ra[sn][0], rb[sn][0], rb[s][0])
            if len(set(vs)) == 4:
                f = bm.faces.new(vs)
                f.smooth = True
                for loop, (_, c) in zip(f.loops, (ra[s], ra[sn], rb[sn], rb[s])):
                    loop[uv].uv = c
    if cap_end and rings:
        top = rings[-1]
        d_end = (pts[-1] - pts[-2]).normalized()
        tip = bm.verts.new(pts[-1] + d_end * (rads[-1] * 0.8))
        umid = 0.5 * (u_range[0] + u_range[1])
        for s in range(sides):
            sn = (s + 1) % sides
            tri = (top[s][0], top[sn][0], tip)
            if len(set(tri)) == 3:
                f = bm.faces.new(tri)
                f.smooth = True
                for loop, c in zip(f.loops, (top[s][1], top[sn][1], (umid, v_range[1]))):
                    loop[uv].uv = c
    return pts, rads


def add_spray_card(
    bm,
    uv,
    origin,
    forward_dir,
    length,
    width,
    u_range=SPRAY_A_U,
    v_range=(0.02, 0.98),
    roll=0.0,
    arch=0.14,
    droop=0.10,
    cup=0.14,
    rows=3,
    cols=2,
):
    """Curved, V-cupped 3D foliage spray card (12 triangles default) with clean outward UVs."""
    f = forward_dir.normalized() if forward_dir.length_squared > 1e-8 else Vector((1.0, 0.0, 0.0))
    ref = Vector((0.0, 0.0, 1.0)) if abs(f.z) < 0.92 else Vector((1.0, 0.0, 0.0))
    right = f.cross(ref).normalized()
    up0 = right.cross(f).normalized()
    side = (right * math.cos(roll) + up0 * math.sin(roll)).normalized()
    up = (up0 * math.cos(roll) - right * math.sin(roll)).normalized()

    u0, u1 = u_range
    v0, v1 = v_range
    grid = []
    for r in range(rows + 1):
        t = r / rows
        bend = length * (arch * math.sin(t * math.pi * 0.9) - droop * (t * t))
        spine = origin + f * (length * t) + up * bend
        vc = v0 + (v1 - v0) * t
        row = []
        for c in range(cols + 1):
            sc = (c / cols) * 2.0 - 1.0
            cup_off = up * (width * cup * (abs(sc) ** 1.25) * math.sin(max(0.08, t) * math.pi * 0.92))
            pt = spine + side * (sc * width * 0.5) + cup_off
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
                f_new = bm.faces.new(vs)
                f_new.smooth = True
                for loop, coord in zip(f_new.loops, (uv00, uv10, uv11, uv01)):
                    loop[uv].uv = coord


def add_volumetric_cluster(
    bm,
    uv,
    anchor,
    direction,
    length,
    width,
    rng,
    cards=3,
    arch=0.14,
    droop=0.12,
    cup=0.14,
    spread=0.45,
    inset_frac=0.18,
    rows=3,
    cols=2,
):
    """Interlocking 3D cluster of curved spray cards that holds fullness from every view angle."""
    fwd = direction.normalized() if direction.length_squared > 1e-8 else Vector((0.0, 0.0, 1.0))
    ref = Vector((0.0, 0.0, 1.0)) if abs(fwd.z) < 0.90 else Vector((1.0, 0.0, 0.0))
    right = fwd.cross(ref).normalized()
    up = right.cross(fwd).normalized()

    base = anchor - fwd * (length * inset_frac)
    for k in range(cards):
        u_rng = SPRAY_A_U if (k % 2 == 0) else SPRAY_B_U
        az = (k / max(1, cards)) * math.tau + rng.uniform(-0.45, 0.45)
        radial = right * math.cos(az) + up * math.sin(az)
        dir_k = (fwd * rng.uniform(0.75, 1.05) + radial * (spread * rng.uniform(0.55, 1.15)) + Vector((0, 0, rng.uniform(-0.14, 0.28)))).normalized()
        roll_k = (k / max(1, cards)) * math.pi + rng.uniform(-0.45, 0.45)
        scale_k = rng.uniform(0.84, 1.16)
        add_spray_card(
            bm, uv,
            base + radial * (width * 0.08 * rng.uniform(0.2, 1.0)),
            dir_k,
            length * scale_k,
            width * scale_k,
            u_range=u_rng,
            roll=roll_k,
            arch=arch * rng.uniform(0.75, 1.25),
            droop=droop * rng.uniform(0.75, 1.25),
            cup=cup,
            rows=rows,
            cols=cols,
        )


def finalize_shrub_mesh(name, bm, material, max_triangles=3600):
    """Triangulate, remove degenerate geometry (exact gltfpack parity), and smooth normals."""
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_area() < 1e-8], context='FACES')
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context='EDGES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.validate(verbose=False)
    mesh.update()

    # Keep natural curved card normals with only a tiny 10% skyward soften so normal maps pop.
    up = Vector((0.0, 0.0, 1.0))
    normals = []
    for v in mesh.vertices:
        n = v.normal * 0.90 + up * 0.10
        normals.append(n.normalized() if n.length_squared > 1e-8 else up)
    mesh.normals_split_custom_set_from_vertices(normals)

    mesh.calc_loop_triangles()
    tris = len(mesh.loop_triangles)
    assert 120 <= tris <= max_triangles, f'{name} has {tris} triangles (budget [120, {max_triangles}])'
    return mesh, tris


# ---------------------------------------------------------------------------
# ARCHITECTURAL TEMPLATES (diverse botanical growth habits)
# ---------------------------------------------------------------------------

def build_coppice_shrub(
    name,
    mat,
    seed,
    height=1.25,
    radius=0.85,
    cane_count=7,
    cane_radius=0.026,
    spray_len=0.58,
    spray_w=0.46,
    cards_per_node=3,
    low_skirt=True,
    droop=0.14,
    asymmetry=0.22,
):
    """Full-bodied multi-stemmed woodland/hedgerow shrub with 3-tier volumetric foliage."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    for i in range(cane_count):
        yaw = (i / cane_count) * math.tau + rng.uniform(-0.32, 0.32)
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        # Vary cane heights organically so the crown silhouette is broken, never a dome.
        h_var = (0.68 + 0.44 * ((i * 37) % 5) / 4.0) * rng.uniform(1.0 - asymmetry, 1.0 + asymmetry)
        r_var = rng.uniform(0.75, 1.18)
        z_top = height * h_var
        r_top = radius * r_var
        gnarl = radius * 0.12

        p0 = out * rng.uniform(0.02, 0.08) + Vector((0.0, 0.0, -0.04))
        p1 = out * (r_top * 0.46) + side * rng.uniform(-gnarl, gnarl) + Vector((0.0, 0.0, z_top * 0.44))
        p2 = out * r_top + side * rng.uniform(-gnarl, gnarl) + Vector((0.0, 0.0, z_top))
        add_cane(bm, uv, [p0, p1, p2], [cane_radius, cane_radius * 0.56, cane_radius * 0.18], sides=5, subdiv=2)

        # Lateral fork off mid-cane
        sgn = 1.0 if i % 2 == 0 else -1.0
        f_end = p1 + out * (radius * 0.36) + side * (sgn * radius * 0.36) + Vector((0.0, 0.0, z_top * 0.28))
        add_cane(bm, uv, [p1, p1.lerp(f_end, 0.5) + Vector((0, 0, 0.06)), f_end], [cane_radius * 0.50, cane_radius * 0.28, cane_radius * 0.12], sides=4, subdiv=1)

        # Tier 1: Lower-skirt / inner-core fullness (eliminates bare V-stick look!)
        if low_skirt:
            low_pt = p0.lerp(p1, 0.62)
            low_dir = (out * 0.82 + side * (sgn * 0.24) + Vector((0, 0, 0.34))).normalized()
            add_volumetric_cluster(bm, uv, low_pt, low_dir, spray_len * 0.84, spray_w * 0.88, rng, cards=max(2, cards_per_node - 1), droop=droop * 1.15)

        # Tier 2: Mid-canopy lush volume around fork
        add_volumetric_cluster(bm, uv, f_end, (f_end - p1 + Vector((0, 0, 0.18))).normalized(), spray_len * 0.94, spray_w * 0.96, rng, cards=cards_per_node, droop=droop)
        add_volumetric_cluster(bm, uv, p1.lerp(p2, 0.45), (p2 - p1 + side * (-sgn * 0.35)).normalized(), spray_len * 0.88, spray_w * 0.92, rng, cards=max(2, cards_per_node - 1), droop=droop)

        # Tier 3: Irregular outer apical shoot
        add_volumetric_cluster(bm, uv, p2, (p2 - p1 + Vector((0, 0, 0.22))).normalized(), spray_len * 1.02, spray_w * 0.94, rng, cards=cards_per_node, droop=droop)

    # Central crown core cluster so aerial views see lush interior depth, not a hollow ring.
    add_volumetric_cluster(bm, uv, Vector((0, 0, height * 0.55)), Vector((0.08, -0.06, 1.0)).normalized(), spray_len * 0.95, spray_w * 1.0, rng, cards=4, spread=0.85, droop=droop)
    return finalize_shrub_mesh(name, bm, mat)


def build_sapling_shrub(name, mat, seed, height=1.75, radius=0.78, conifer=False):
    """Slender multi-tier young sapling (broadleaf or whorled boreal conifer) with real crown volume."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Main leader + subtle secondary stem
    trunk_pts = [
        Vector((0.0, 0.0, -0.05)),
        Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), height * 0.36)),
        Vector((rng.uniform(-0.07, 0.07), rng.uniform(-0.07, 0.07), height * 0.72)),
        Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), height)),
    ]
    r0 = 0.036 if conifer else 0.032
    add_cane(bm, uv, trunk_pts, [r0, r0 * 0.72, r0 * 0.42, 0.006], sides=6, subdiv=2, cap_end=True)

    tiers = 5 if conifer else 4
    for t_idx in range(tiers):
        h_frac = (0.20 if conifer else 0.26) + (t_idx / max(1, tiers - 1)) * 0.66
        z = height * h_frac
        tier_r = radius * (1.08 - 0.68 * ((h_frac - 0.18) / 0.78))
        n_boughs = (5 - min(2, t_idx // 2)) if conifer else (4 if t_idx < 3 else 3)
        for b in range(n_boughs):
            yaw = (b / n_boughs) * math.tau + t_idx * 0.95 + rng.uniform(-0.28, 0.28)
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            p_start = Vector((0, 0, z))
            lift = (0.04 + 0.22 * h_frac) if conifer else (0.18 + 0.16 * h_frac)
            p_mid = p_start + out * (tier_r * 0.55) + Vector((0, 0, tier_r * lift * 0.4))
            p_end = p_start + out * tier_r + Vector((0, 0, tier_r * lift))
            br = max(0.005, r0 * (0.46 - 0.24 * h_frac))
            add_cane(bm, uv, [p_start, p_mid, p_end], [br, br * 0.55, 0.004], sides=4, subdiv=1)

            sl = (0.46 if conifer else 0.52) * (1.12 - 0.35 * h_frac)
            sw = (0.36 if conifer else 0.44) * (1.12 - 0.35 * h_frac)
            add_volumetric_cluster(bm, uv, p_mid, (p_end - p_start).normalized(), sl * 0.85, sw * 0.85, rng, cards=2, droop=0.16 if conifer else 0.10)
            add_volumetric_cluster(bm, uv, p_end, (p_end - p_mid + Vector((0, 0, 0.10))).normalized(), sl, sw, rng, cards=3 if t_idx < 3 else 2, droop=0.14 if conifer else 0.10)

    # Apical crown leader foliage
    add_volumetric_cluster(bm, uv, trunk_pts[-1], Vector((0.0, 0.0, 1.0)), 0.42, 0.34, rng, cards=4, spread=0.52, droop=0.06)
    return finalize_shrub_mesh(name, bm, mat)


def build_krummholz_juniper(name, mat, seed):
    """Wind-sculpted boreal/tundra creeping juniper: offset spire + low sprawling runners."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    boughs = (
        # (yaw, r_xy, z_mid, z_top, r0, cards)
        (0.25, 0.46, 0.48, 1.12, 0.036, 3),  # offset wind-bent spire
        (1.42, 0.78, 0.32, 0.72, 0.030, 3),  # mid shoulder
        (4.52, 0.74, 0.28, 0.64, 0.028, 3),  # mid shoulder
        (2.45, 0.94, 0.14, 0.34, 0.025, 3),  # low creeping runner
        (3.52, 0.86, 0.12, 0.28, 0.024, 2),  # low creeping runner
        (5.55, 0.90, 0.15, 0.38, 0.025, 3),  # low creeping runner
    )
    for idx, (yaw, r_xy, z_mid, z_top, r0, cards) in enumerate(boughs):
        out = Vector((math.cos(yaw) + 0.14, math.sin(yaw), 0.0)).normalized()
        side = Vector((-out.y, out.x, 0.0))
        p0 = Vector((-0.08, 0.03, -0.03)) + out * 0.04
        p1 = p0 + out * (r_xy * 0.50) + side * rng.uniform(-0.10, 0.10) + Vector((0, 0, z_mid))
        p2 = p0 + out * r_xy + side * rng.uniform(-0.08, 0.08) + Vector((0, 0, z_top))
        add_cane(bm, uv, [p0, p1, p2], [r0, r0 * 0.54, 0.005], sides=5, subdiv=2)
        for frac, sc in ((0.42, 0.82), (0.74, 0.94), (1.0, 1.02)):
            pt = p0.lerp(p1, frac * 2.0) if frac < 0.5 else p1.lerp(p2, (frac - 0.5) * 2.0)
            bdir = (p2 - p1 + Vector((0, 0, 0.28 if idx == 0 else 0.18))).normalized()
            add_volumetric_cluster(bm, uv, pt, bdir, 0.48 * sc, 0.42 * sc, rng, cards=cards, arch=0.18, droop=0.06, spread=0.62)
    add_volumetric_cluster(bm, uv, Vector((-0.06, 0.02, 0.26)), Vector((0.1, 0.0, 1.0)).normalized(), 0.46, 0.42, rng, cards=3, spread=0.78)
    return finalize_shrub_mesh(name, bm, mat)


def build_umbrella_thorn_scrub(name, mat, seed, height=1.28, radius=1.12):
    """Gnarled flat-topped open-center savanna acacia/thorn scrub with staggered outer pads."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    stems = (
        (0.18, radius * 0.88, height * 0.34, height * 0.72),
        (1.24, radius * 0.74, height * 0.54, height * 1.04),
        (2.44, radius * 0.96, height * 0.42, height * 0.86),
        (3.66, radius * 0.80, height * 0.56, height * 0.96),
        (4.92, radius * 0.86, height * 0.30, height * 0.58),
    )
    for idx, (yaw, r_xy, z_elbow, z_top) in enumerate(stems):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        crook = rng.uniform(-0.14, 0.14)
        p0 = out * 0.05 + Vector((0, 0, -0.04))
        p1 = out * (r_xy * 0.48) + side * crook + Vector((0, 0, z_elbow))
        p2 = out * r_xy + side * (crook * 0.5) + Vector((0, 0, z_top))
        add_cane(bm, uv, [p0, p1, p2], [0.036, 0.022, 0.006], sides=5, subdiv=2)

        sgn = 1.0 if idx % 2 == 0 else -1.0
        f_end = p1 + out * (radius * 0.38) + side * (sgn * radius * 0.34) + Vector((0, 0, height * 0.24))
        add_cane(bm, uv, [p1, p1.lerp(f_end, 0.5) + Vector((0, 0, 0.05)), f_end], [0.018, 0.010, 0.004], sides=4, subdiv=1)

        # Wide, flat-topped feathery acacia pads
        flat_dir = (out * 0.88 + Vector((0, 0, 0.14))).normalized()
        add_volumetric_cluster(bm, uv, p2, flat_dir, 0.62, 0.66, rng, cards=3, arch=0.06, droop=0.08, spread=0.72)
        add_volumetric_cluster(bm, uv, f_end, (f_end - p1 + Vector((0, 0, 0.06))).normalized(), 0.56, 0.60, rng, cards=3 if idx < 4 else 2, arch=0.06, droop=0.08, spread=0.68)
        if idx < 3:
            add_volumetric_cluster(bm, uv, p1.lerp(p2, 0.55), (out * 0.7 + side * (-sgn * 0.5) + Vector((0, 0, 0.18))).normalized(), 0.48, 0.52, rng, cards=2, arch=0.08, droop=0.08)
    return finalize_shrub_mesh(name, bm, mat)


def build_ocotillo_shrub(name, mat, seed, height=1.85):
    """Multi-cane desert ocotillo: tall diverging thorny canes with fine leaves & scarlet tips."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    cane_count = 11
    for i in range(cane_count):
        yaw = (i / cane_count) * math.tau + rng.uniform(-0.20, 0.20)
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        h_c = height * rng.uniform(0.72, 1.12)
        spread = rng.uniform(0.42, 0.78)
        p0 = out * 0.04 + Vector((0, 0, -0.04))
        p1 = out * (spread * 0.42) + side * rng.uniform(-0.06, 0.06) + Vector((0, 0, h_c * 0.52))
        p2 = out * spread + side * rng.uniform(-0.08, 0.08) + Vector((0, 0, h_c))
        add_cane(bm, uv, [p0, p1, p2], [0.022, 0.015, 0.005], sides=5, subdiv=2, cap_end=True)

        # Clothe upper 70% of each cane with narrow feathery desert leaves + bright tip plumes
        for frac, sc in ((0.44, 0.62), (0.72, 0.72), (0.94, 0.82)):
            pt = p0.lerp(p1, frac * 2.0) if frac < 0.5 else p1.lerp(p2, (frac - 0.5) * 2.0)
            cdir = (p2 - p1 + Vector((0, 0, 0.25))).normalized()
            add_volumetric_cluster(bm, uv, pt, cdir, 0.34 * sc, 0.22 * sc, rng, cards=2, arch=0.10, droop=0.05, spread=0.55)
    return finalize_shrub_mesh(name, bm, mat)


def build_bamboo_clump(name, mat, seed, height=2.35):
    """Normalized metric (~2.35m) multi-culm bamboo clump with arching leafy top sprays."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    culm_count = 9
    for i in range(culm_count):
        yaw = (i / culm_count) * math.tau + rng.uniform(-0.24, 0.24)
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        r_base = rng.uniform(0.05, 0.24)
        h_c = height * rng.uniform(0.72, 1.08)
        lean = rng.uniform(0.28, 0.62)
        p0 = out * r_base + Vector((0, 0, -0.05))
        p1 = out * (r_base + lean * 0.32) + Vector((0, 0, h_c * 0.48))
        p2 = out * (r_base + lean * 0.78) + Vector((0, 0, h_c * 0.84))
        p3 = out * (r_base + lean * 1.15) + Vector((0, 0, h_c))
        add_cane(bm, uv, [p0, p1, p2, p3], [0.022, 0.019, 0.013, 0.005], sides=5, subdiv=2, cap_end=True)

        # Tiered feathery bamboo leaf clusters from mid-culm to arching tip
        for pt, d_vec, sc in (
            (p1.lerp(p2, 0.45), (out * 0.75 + Vector((0, 0, 0.25))).normalized(), 0.76),
            (p2, (out * 0.85 + Vector((0, 0, 0.15))).normalized(), 0.92),
            (p3, (out * 0.95 + Vector((0, 0, -0.08))).normalized(), 0.98),
        ):
            add_volumetric_cluster(bm, uv, pt, d_vec, 0.56 * sc, 0.46 * sc, rng, cards=2, arch=0.12, droop=0.22, spread=0.68)
    return finalize_shrub_mesh(name, bm, mat)


def build_dwarf_palm_shrub(name, mat, seed, height=1.55, radius=1.25):
    """Lush arching tropical understory dwarf feather-palm with basal fibrous trunk."""
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Short fibrous trunk crown
    add_cane(bm, uv, [Vector((0, 0, -0.05)), Vector((0.02, -0.01, 0.18)), Vector((0.03, -0.02, 0.36))], [0.11, 0.095, 0.075], sides=7, subdiv=2, cap_end=True)

    frond_count = 17
    for i in range(frond_count):
        tier = 0 if i < 6 else (1 if i < 12 else 2)
        yaw = i * 2.39996 + rng.uniform(-0.18, 0.18)
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        origin = Vector((0.02, -0.01, 0.22 + tier * 0.06)) + out * 0.05
        elev = (0.36 if tier == 0 else (0.64 if tier == 1 else 0.92)) + rng.uniform(-0.08, 0.08)
        fdir = (out * math.cos(elev) + Vector((0, 0, math.sin(elev)))).normalized()
        flen = radius * (1.06 if tier == 0 else (0.94 if tier == 1 else 0.76)) * rng.uniform(0.90, 1.12)
        fw = flen * 0.56
        # Slender curved petiole supporting the frond
        p_pet = origin + fdir * (flen * 0.26)
        add_cane(bm, uv, [origin, p_pet], [0.018, 0.008], sides=4, subdiv=1)
        add_spray_card(
            bm, uv,
            origin + fdir * (flen * 0.12),
            fdir,
            flen,
            fw,
            u_range=SPRAY_A_U if i % 2 == 0 else SPRAY_B_U,
            roll=rng.uniform(-0.22, 0.22),
            arch=0.22,
            droop=0.44 if tier == 0 else (0.32 if tier == 1 else 0.20),
            cup=-0.16,
            rows=5,
            cols=2,
        )
    return finalize_shrub_mesh(name, bm, mat)
