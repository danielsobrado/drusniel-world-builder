"""AAA natural formations: planar stylized rocks, crystals, ice, fungi & wood anatomy.

Replaces sphere-based rock_chunk blobs, simple cone crystals, glossy ice tubes,
and cylindrical logs with structured planes, organic cross-sections, splinters, and root flares.
"""
import math
import os
import sys

import bmesh
from mathutils import Vector

_TOOLS_BLENDER_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
if _TOOLS_BLENDER_DIR not in sys.path:
    sys.path.insert(0, _TOOLS_BLENDER_DIR)
from upgrade_config import load_upgrade_config
from understory_common import tube

_STONE_CFG = load_upgrade_config().get('stone_crystal_ice', {})
_WOOD_CFG = load_upgrade_config().get('wood_and_debris', {})


def _mark_flat_faces(faces, bm):
    flat_layer = bm.faces.layers.int.get('aaa_flat') or bm.faces.layers.int.new('aaa_flat')
    for f in faces:
        f[flat_layer] = 1


def _copy_tmp_into_bm(tmp, bm, uv_layer, offset, u_range, v_range, mark_flat=True):
    """Project local box/planar UVs onto a temporary BMesh and transfer cleanly to `bm`."""
    flat_layer = bm.faces.layers.int.get('aaa_flat') or bm.faces.layers.int.new('aaa_flat') if mark_flat else None
    u0, u1 = u_range
    v0, v1 = v_range
    v_map = {v: bm.verts.new(v.co + Vector(offset)) for v in tmp.verts}
    added_faces = []
    for tf in tmp.faces:
        verts = tuple(v_map[v] for v in tf.verts)
        if len(set(verts)) < 3:
            continue
        f = bm.faces.new(verts)
        f.smooth = True
        if flat_layer is not None:
            f[flat_layer] = 1
        fn = tf.normal
        for loop, tv in zip(f.loops, tf.verts):
            co = tv.co
            if abs(fn.z) >= max(abs(fn.x), abs(fn.y)):
                s = 0.5 + 0.35 * max(-1.2, min(1.2, co.x))
                t = 0.5 + 0.35 * max(-1.2, min(1.2, co.y))
            elif abs(fn.x) >= abs(fn.y):
                s = 0.5 + 0.35 * max(-1.2, min(1.2, co.y))
                t = 0.5 + 0.35 * max(-1.2, min(1.2, co.z))
            else:
                s = 0.5 + 0.35 * max(-1.2, min(1.2, co.x))
                t = 0.5 + 0.35 * max(-1.2, min(1.2, co.z))
            loop[uv_layer].uv = (u0 + (u1 - u0) * max(0.04, min(0.96, s)), v0 + (v1 - v0) * max(0.04, min(0.96, t)))
        added_faces.append(f)
    return added_faces


def planar_rock(
    bm,
    uv_layer,
    center,
    radii,
    style='crag',
    seed=1,
    u_range=(0.04, 0.34),
    v_range=(0.38, 0.94),
):
    """Generate a planar-faceted stylized rock using bisecting fracture planes."""
    c_vec = Vector(center)
    rx, ry, rz = radii
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=2 if style == 'river' else 1, radius=1.0)
    bmesh.ops.scale(tmp, vec=(rx, ry, rz), verts=tmp.verts)

    plane_specs = {
        'crag': 10,
        'sedimentary': 9,
        'volcanic': 8,
        'limestone': 10,
        'ore_matrix': 9,
        'river': 7,
    }.get(style, 9)

    for k in range(plane_specs):
        ang = k * 2.39996 + seed * 1.13
        elev = -0.35 + 1.45 * ((k % 5) / 4.0)
        if style == 'sedimentary' and k < 3:
            # Strong sub-horizontal stratified bedding planes
            n = Vector((0.18 * math.cos(ang), 0.18 * math.sin(ang), 1.0 if k != 1 else -0.8)).normalized()
            dist = 0.62 * rz if k != 1 else 0.72 * rz
        elif style == 'volcanic':
            # Steep columnar prism facets
            n = Vector((math.cos(ang), math.sin(ang), 0.14 * ((k % 3) - 1))).normalized()
            dist = 0.68 * max(abs(n.x) * rx, abs(n.y) * ry, abs(n.z) * rz, 0.1)
        else:
            n = Vector((math.cos(ang) * math.cos(elev), math.sin(ang) * math.cos(elev), math.sin(elev))).normalized()
            frac = 0.64 + 0.22 * math.sin(seed * 3.1 + k * 1.9)
            dist = frac / math.sqrt((n.x / max(rx, 1e-4)) ** 2 + (n.y / max(ry, 1e-4)) ** 2 + (n.z / max(rz, 1e-4)) ** 2)

        geom = list(tmp.verts) + list(tmp.edges) + list(tmp.faces)
        ret = bmesh.ops.bisect_plane(
            tmp,
            geom=geom,
            plane_co=n * dist,
            plane_no=n,
            clear_outer=True,
            clear_inner=False,
        )
        boundary = [e for e in tmp.edges if e.is_boundary]
        if boundary:
            bmesh.ops.holes_fill(tmp, edges=boundary)
        if len(tmp.faces) < 4:
            break

    # Ground bedding plane flattens underside cleanly so stone sits embedded rather than floating
    boundary = [e for e in tmp.edges if e.is_boundary]
    if boundary:
        bmesh.ops.holes_fill(tmp, edges=boundary)
    bmesh.ops.triangulate(tmp, faces=tmp.faces)
    faces = _copy_tmp_into_bm(tmp, bm, uv_layer, c_vec, u_range, v_range, mark_flat=(style != 'river'))
    tmp.free()
    return faces


def _hex_crystal_shard(bm, uv_layer, base, axis_dir, r0, r1, length, sides=6, chisel_skew=0.28, u_range=(0.74, 0.96), v_range=(0.06, 0.94)):
    """Build a crisp flat-faceted mineral/crystal prism with skewed chisel pyramid termination."""
    d = axis_dir.normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(d.z) < 0.92 else Vector((1.0, 0.0, 0.0))
    tx = d.cross(ref).normalized()
    ty = d.cross(tx).normalized()
    b_vec = Vector(base)
    u0, u1 = u_range
    v0, v1 = v_range
    mid_u = 0.5 * (u0 + u1)

    ring_b = []
    ring_m = []
    ring_t = []
    for s in range(sides):
        a = (s / sides) * math.tau
        rad_dir = tx * math.cos(a) + ty * math.sin(a)
        ang_wobble = 1.0 + 0.08 * math.sin(a * 2.0 + r0 * 11.0)
        v_base = b_vec + rad_dir * (r0 * ang_wobble)
        mid_off = d * (length * 0.56) + rad_dir * (r0 * 0.92 * ang_wobble)
        top_h = length * (0.86 + chisel_skew * math.cos(a - 0.5))
        v_top = b_vec + d * top_h + rad_dir * (r1 * ang_wobble)
        ring_b.append(bm.verts.new(v_base))
        ring_m.append(bm.verts.new(b_vec + mid_off))
        ring_t.append(bm.verts.new(v_top))

    apex = bm.verts.new(b_vec + d * (length * (1.02 + chisel_skew * 0.45)) + tx * (r1 * 0.22))
    added = []
    for s in range(sides):
        sn = (s + 1) % sides
        for ra, rb, va, vb in ((ring_b, ring_m, v0, 0.5 * (v0 + v1)), (ring_m, ring_t, 0.5 * (v0 + v1), v1)):
            f = bm.faces.new((ra[s], ra[sn], rb[sn], rb[s]))
            for loop, coord in zip(f.loops, ((u0, va), (u1, va), (u1, vb), (u0, vb))):
                loop[uv_layer].uv = coord
            added.append(f)
        ft = bm.faces.new((ring_t[s], ring_t[sn], apex))
        for loop, coord in zip(ft.loops, ((u0, v1 - 0.12), (u1, v1 - 0.12), (mid_u, v1))):
            loop[uv_layer].uv = coord
        added.append(ft)
    _mark_flat_faces(added, bm)
    return added


def crystal_cluster_formation(
    bm,
    uv_layer,
    center,
    height,
    radius,
    rng,
    u_crystal=(0.74, 0.96),
    v_crystal=(0.06, 0.94),
    u_rock=(0.04, 0.34),
    v_rock=(0.38, 0.94),
    matrix_style='ore_matrix',
):
    """Multi-generation asymmetric crystal composition: 1-2 dominant + secondary + tertiary basal shards."""
    c_vec = Vector(center)
    planar_rock(bm, uv_layer, c_vec + Vector((0.0, 0.0, radius * 0.30)), (radius * 1.05, radius * 0.92, radius * 0.48), style=matrix_style, seed=int(height * 100), u_range=u_rock, v_range=v_rock)
    # 1 dominant primary spire tilted naturally
    _hex_crystal_shard(
        bm,
        uv_layer,
        c_vec + Vector((0.0, 0.0, radius * 0.25)),
        Vector((rng.uniform(-0.14, 0.14), rng.uniform(-0.14, 0.14), 1.0)),
        radius * 0.34,
        radius * 0.26,
        height,
        sides=6,
        chisel_skew=0.22,
        u_range=u_crystal,
        v_range=v_crystal,
    )
    # 4 secondary tilted crystals + 5 tertiary basal fracture chips
    sec_n = int(_STONE_CFG.get('crystal_secondary_count', 4))
    ter_n = int(_STONE_CFG.get('crystal_tertiary_count', 5))
    for i in range(sec_n):
        a = (i / sec_n) * math.tau + rng.uniform(-0.35, 0.35)
        r_off = radius * rng.uniform(0.28, 0.56)
        axis = Vector((math.cos(a) * rng.uniform(0.24, 0.48), math.sin(a) * rng.uniform(0.24, 0.48), 1.0))
        _hex_crystal_shard(
            bm,
            uv_layer,
            c_vec + Vector((math.cos(a) * r_off, math.sin(a) * r_off, radius * 0.20)),
            axis,
            radius * rng.uniform(0.16, 0.24),
            radius * 0.12,
            height * rng.uniform(0.42, 0.68),
            sides=6 if i % 2 == 0 else 5,
            chisel_skew=rng.uniform(0.16, 0.34),
            u_range=u_crystal,
            v_range=v_crystal,
        )
    for k in range(ter_n):
        a = (k / ter_n) * math.tau + 0.5 + rng.uniform(-0.3, 0.3)
        r_off = radius * rng.uniform(0.55, 0.85)
        axis = Vector((math.cos(a) * 0.65, math.sin(a) * 0.65, 0.85))
        _hex_crystal_shard(
            bm,
            uv_layer,
            c_vec + Vector((math.cos(a) * r_off, math.sin(a) * r_off, radius * 0.08)),
            axis,
            radius * rng.uniform(0.08, 0.13),
            radius * 0.05,
            height * rng.uniform(0.18, 0.30),
            sides=5,
            chisel_skew=0.35,
            u_range=u_rock if k % 2 else u_crystal,
            v_range=v_rock if k % 2 else v_crystal,
        )


def ice_formation_mesh(
    bm,
    uv_layer,
    center,
    height,
    radius,
    style='serac',
    rng=None,
    u_inner=(0.40, 0.70),
    v_inner=(0.06, 0.94),
    u_frost=(0.74, 0.96),
    v_frost=(0.06, 0.94),
    u_base=(0.04, 0.34),
    v_base=(0.38, 0.94),
):
    """Build fractured glacial ice structures distinct from hexagonal gem crystals."""
    c_vec = Vector(center)
    planar_rock(bm, uv_layer, c_vec + Vector((0.0, 0.0, radius * 0.22)), (radius * 1.15, radius * 1.05, radius * 0.36), style='sedimentary', seed=int(height * 73), u_range=u_base, v_range=v_base)

    if style == 'penitentes':
        # Directional wind-carved thin leaning ice blades leaning toward afternoon sun
        sun_dir = Vector((0.42, -0.22, 0.90)).normalized()
        for i in range(9):
            off = Vector((rng.uniform(-radius * 0.55, radius * 0.55), rng.uniform(-radius * 0.45, radius * 0.45), radius * 0.12))
            bh = height * (1.05 if i == 0 else rng.uniform(0.46, 0.92))
            rw = radius * rng.uniform(0.14, 0.24)
            _hex_crystal_shard(bm, uv_layer, c_vec + off, sun_dir, rw, rw * 0.28, bh, sides=4, chisel_skew=0.45, u_range=u_frost if i % 2 else u_inner, v_range=v_frost if i % 2 else v_inner)
        return

    if style == 'frost_rose':
        # Low overlapping tabular hoarfrost diamond plates fanning from icy core
        for i in range(11):
            t = i / 10.0
            a = i * 2.39996 + rng.uniform(-0.15, 0.15)
            axis = Vector((math.cos(a) * (0.75 - 0.35 * t), math.sin(a) * (0.75 - 0.35 * t), 0.38 + 0.58 * t)).normalized()
            _hex_crystal_shard(bm, uv_layer, c_vec + Vector((0, 0, radius * 0.15)), axis, radius * (0.28 - 0.10 * t), radius * 0.08, height * (0.92 - 0.32 * t), sides=4, chisel_skew=0.38, u_range=u_frost if i % 3 else u_inner, v_range=v_frost if i % 3 else v_inner)
        return

    if style == 'pressure_ridge':
        # Upheaved fractured tabular ice sheets buckled at steep shear angles
        for i in range(6):
            a = (i / 6.0) * math.tau + rng.uniform(-0.22, 0.22)
            tilt = Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 1.0)).normalized()
            off = Vector((math.cos(a) * radius * 0.28, math.sin(a) * radius * 0.28, radius * 0.12))
            planar_rock(bm, uv_layer, c_vec + off + tilt * (height * (0.38 if i else 0.50)), (radius * rng.uniform(0.32, 0.56), radius * 0.16, height * (0.55 if i else 0.72)), style='sedimentary', seed=300 + i, u_range=u_inner if i % 2 else u_frost, v_range=v_inner if i % 2 else v_frost)
        return

    # 'serac' or 'organ_pipe': massive asymmetrical frozen fin / fluted ice column + stepped ledges + icicles
    n_fins = 5
    for i in range(n_fins):
        a = (i / n_fins) * math.tau + rng.uniform(-0.25, 0.25)
        fh = height * (1.0 if i == 0 else rng.uniform(0.42, 0.78))
        fr = radius * (0.46 if i == 0 else rng.uniform(0.22, 0.34))
        b = c_vec + Vector((0.0 if i == 0 else math.cos(a) * radius * 0.35, 0.0 if i == 0 else math.sin(a) * radius * 0.35, radius * 0.14))
        planar_rock(bm, uv_layer, b + Vector((0, 0, fh * 0.46)), (fr, fr * 0.72, fh * 0.52), style='volcanic', seed=400 + i, u_range=u_inner if i % 2 == 0 else u_frost, v_range=v_inner if i % 2 == 0 else v_frost)
        # Sharp frosted edge shards clinging to upper serac flanks
        _hex_crystal_shard(bm, uv_layer, b + Vector((math.cos(a) * fr * 0.45, math.sin(a) * fr * 0.45, fh * 0.42)), Vector((math.cos(a) * 0.28, math.sin(a) * 0.28, 1.0)), fr * 0.32, fr * 0.08, fh * 0.48, sides=5, chisel_skew=0.40, u_range=u_frost, v_range=v_frost)


def mushroom_cluster_mesh(
    bm,
    uv_layer,
    center,
    height,
    radius,
    rng,
    cap_u=(0.74, 0.96),
    cap_v=(0.06, 0.94),
    stipe_u=(0.04, 0.34),
    stipe_v=(0.38, 0.94),
    base_u=(0.40, 0.70),
    base_v=(0.06, 0.94),
):
    """Multi-stage mushroom cluster with curved stipes, thick sculpted asymmetrical caps & gill undersides."""
    c_vec = Vector(center)
    planar_rock(bm, uv_layer, c_vec + Vector((0, 0, radius * 0.14)), (radius * 0.65, radius * 0.58, radius * 0.22), style='crag', seed=88, u_range=base_u, v_range=base_v)
    stages = [
        (Vector((0.0, 0.0, 0.0)), height, radius, 0.2),
        (Vector((radius * 0.48, -radius * 0.26, 0.0)), height * 0.54, radius * 0.48, 1.8),
        (Vector((-radius * 0.36, radius * 0.32, 0.0)), height * 0.36, radius * 0.30, 3.6),
    ]
    for off, sh, cr, ang in stages:
        b = c_vec + off + Vector((0, 0, -0.02))
        lean = Vector((math.cos(ang), math.sin(ang), 0.0)) * (cr * 0.22)
        top = b + lean + Vector((0, 0, sh * 0.84))
        tube(bm, uv_layer, [b, b.lerp(top, 0.45) + lean * 0.6, top], [cr * 0.22, cr * 0.15, cr * 0.13], sides=8, u_range=stipe_u, v_range=stipe_v, cap_end=False)
        # Sculpted asymmetrical cap with thick rolled rim & recessed gill skirt
        sides = 14
        cap_rings = []
        for r_idx, (rf, zf) in enumerate(((1.0, -0.04), (0.94, 0.12), (0.62, 0.28), (0.28, 0.36))):
            row = []
            for s in range(sides):
                sa = (s / sides) * math.tau
                wob = 1.0 + 0.14 * math.sin(sa * 3.0 + ang) + 0.06 * math.cos(sa * 5.0 - ang)
                rr = cr * rf * wob
                zz = sh * (zf + 0.03 * math.sin(sa * 2.0 + ang))
                v = bm.verts.new(top + Vector((math.cos(sa) * rr, math.sin(sa) * rr, zz)))
                row.append((v, sa))
            cap_rings.append(row)
        # Inner gill cone collar
        gill_hub = bm.verts.new(top + Vector((0, 0, sh * 0.06)))
        top_hub = bm.verts.new(top + Vector((0, 0, sh * 0.39)))
        for r_idx in range(len(cap_rings) - 1):
            ra, rb = cap_rings[r_idx], cap_rings[r_idx + 1]
            for s in range(sides):
                sn = (s + 1) % sides
                f = bm.faces.new((ra[s][0], ra[sn][0], rb[sn][0], rb[s][0]))
                for loop, uu, vv in zip(f.loops, (cap_u[0], cap_u[1], cap_u[1], cap_u[0]), (cap_v[0], cap_v[0], cap_v[1], cap_v[1])):
                    loop[uv_layer].uv = (uu, vv)
        rim = cap_rings[0]
        crown = cap_rings[-1]
        for s in range(sides):
            sn = (s + 1) % sides
            ft = bm.faces.new((crown[s][0], crown[sn][0], top_hub))
            for loop, uv_c in zip(ft.loops, ((cap_u[0], cap_v[0]), (cap_u[1], cap_v[0]), (0.5 * (cap_u[0] + cap_u[1]), cap_v[1]))):
                loop[uv_layer].uv = uv_c
            fg = bm.faces.new((rim[sn][0], rim[s][0], gill_hub))
            for loop, uv_c in zip(fg.loops, ((stipe_u[0], stipe_v[0]), (stipe_u[1], stipe_v[0]), (0.5 * (stipe_u[0] + stipe_u[1]), stipe_v[1]))):
                loop[uv_layer].uv = uv_c


def organic_trunk_loft(
    bm,
    uv_layer,
    points,
    radii,
    rng,
    sides=14,
    oval_ratio=0.86,
    twist_rate=0.65,
    bark_ridges=7,
    ridge_depth=0.14,
    knot_frac=0.52,
    cap_start=False,
    cap_end=True,
    u_range=(0.04, 0.34),
    v_range=(0.38, 0.94),
):
    """Non-circular twisted trunk loft with directional bark ridges, cambium furrows & knot bulge."""
    pts = [Vector(p) for p in points]
    # Subdivide spline stations once for smooth organic curve
    fine_p = []
    fine_r = []
    for i in range(len(pts) - 1):
        for s in range(3):
            t = s / 3.0
            fine_p.append(pts[i].lerp(pts[i + 1], t))
            fine_r.append(radii[i] * (1.0 - t) + radii[i + 1] * t)
    fine_p.append(pts[-1])
    fine_r.append(radii[-1])

    rings = []
    d0 = (fine_p[1] - fine_p[0]).normalized()
    normal = d0.orthogonal().normalized()
    u0, u1 = u_range
    v0, v1 = v_range
    n_stations = len(fine_p)
    knot_ang = rng.uniform(0.0, math.tau)

    for i, p in enumerate(fine_p):
        frac = i / max(n_stations - 1, 1)
        d = (fine_p[min(i + 1, n_stations - 1)] - fine_p[max(i - 1, 0)]).normalized()
        normal = (normal - d * normal.dot(d)).normalized()
        binormal = d.cross(normal).normalized()
        ring = []
        v_coord = v0 + (v1 - v0) * frac
        for s in range(sides + 1):
            a = (s / sides) * math.tau
            twist_a = a + frac * twist_rate
            ell = 1.0 + (1.0 - oval_ratio) * 0.5 * math.cos(2.0 * twist_a)
            ridge = 1.0 + ridge_depth * math.sin(twist_a * bark_ridges + 0.4 * math.sin(frac * 5.0))
            knot = 0.18 * math.exp(-((frac - knot_frac) / 0.11) ** 2) * max(0.0, math.cos(a - knot_ang)) ** 3
            r = fine_r[i] * (ell * ridge + knot)
            offset = normal * (math.cos(a) * r) + binormal * (math.sin(a) * r)
            v = bm.verts.new(p + offset)
            u_coord = u0 + (u1 - u0) * (s / sides)
            ring.append((v, (u_coord, v_coord)))
        ring[-1] = (ring[0][0], ring[-1][1])
        rings.append(ring)

    for ra, rb in zip(rings[:-1], rings[1:]):
        for s in range(sides):
            verts = (ra[s][0], ra[s + 1][0], rb[s + 1][0], rb[s][0])
            if len(set(verts)) == 4:
                f = bm.faces.new(verts)
                for loop, (_, uv_c) in zip(f.loops, (ra[s], ra[s + 1], rb[s + 1], rb[s])):
                    loop[uv_layer].uv = uv_c

    if cap_start:
        c0 = bm.verts.new(fine_p[0])
        for s in range(sides):
            f = bm.faces.new((rings[0][s + 1][0], rings[0][s][0], c0))
            for loop in f.loops:
                loop[uv_layer].uv = (0.5 * (u0 + u1), v0)
    if cap_end and fine_r[-1] > 1e-3:
        c1 = bm.verts.new(fine_p[-1])
        for s in range(sides):
            f = bm.faces.new((rings[-1][s][0], rings[-1][s + 1][0], c1))
            for loop in f.loops:
                loop[uv_layer].uv = (0.5 * (u0 + u1), v1)
    return rings


def splintered_fracture_cap(bm, uv_layer, center, tangent, radius, rng, u_bark, v_bark, u_heart, v_heart, splinters=8):
    """Construct jagged splintered wood break blades emerging at varied depths around inner heartwood."""
    d = tangent.normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(d.z) < 0.92 else Vector((1.0, 0.0, 0.0))
    tx = d.cross(ref).normalized()
    ty = d.cross(tx).normalized()
    c_vec = Vector(center)
    for k in range(splinters):
        a = (k / max(splinters, 1)) * math.tau + rng.uniform(-0.22, 0.22)
        radial = (tx * math.cos(a) + ty * math.sin(a)).normalized()
        tang_side = d.cross(radial).normalized()
        r_ring = radius * rng.uniform(0.32, 0.82)
        base = c_vec + radial * r_ring - d * (radius * 0.14)
        slen = radius * rng.uniform(0.75, 1.85)
        sw = radius * rng.uniform(0.14, 0.26)
        tip = base + d * slen + radial * rng.uniform(-0.04, 0.06)
        v_bl = bm.verts.new(base - tang_side * sw - radial * 0.02)
        v_br = bm.verts.new(base + tang_side * sw - radial * 0.02)
        v_bi = bm.verts.new(base + radial * 0.04)
        v_tip = bm.verts.new(tip)
        is_heart = r_ring < radius * 0.65
        ur = u_heart if is_heart else u_bark
        vr = v_heart if is_heart else v_bark
        for vs in ((v_bl, v_br, v_tip), (v_br, v_bi, v_tip), (v_bi, v_bl, v_tip)):
            if len(set(vs)) == 3:
                f = bm.faces.new(vs)
                for loop, coord in zip(f.loops, ((ur[0], vr[0]), (ur[1], vr[0]), (0.5 * (ur[0] + ur[1]), vr[1]))):
                    loop[uv_layer].uv = coord


def buttress_root_system(bm, uv_layer, trunk_base, radius, attach_h, reach, count, rng, u_bark, v_bark, split=True):
    """Sweeping fin-flared buttress roots emerging continuously from trunk collar into terrain."""
    base_v = Vector(trunk_base)
    for k in range(count):
        a = (k / max(count, 1)) * math.tau + rng.uniform(-0.28, 0.28)
        r_reach = reach * rng.uniform(0.72, 1.32)
        h_a = attach_h * rng.uniform(0.70, 1.25)
        dir_r = Vector((math.cos(a), math.sin(a), 0.0))
        side_r = Vector((-math.sin(a), math.cos(a), 0.0))
        p0 = base_v + dir_r * (radius * 0.45) + Vector((0, 0, h_a))
        p1 = base_v + dir_r * (r_reach * 0.42) + side_r * rng.uniform(-0.08, 0.08) + Vector((0, 0, h_a * 0.36))
        p2 = base_v + dir_r * (r_reach * 0.78) + side_r * rng.uniform(-0.14, 0.14) + Vector((0, 0, 0.03))
        p3 = base_v + dir_r * r_reach + side_r * rng.uniform(-0.18, 0.18) + Vector((0, 0, -0.05))
        organic_trunk_loft(bm, uv_layer, [p0, p1, p2, p3], [radius * 0.44, radius * 0.28, radius * 0.15, radius * 0.05], rng, sides=7, oval_ratio=0.62, bark_ridges=3, ridge_depth=0.08, u_range=u_bark, v_range=v_bark)
        if split and k % 2 == 0:
            fork_a = a + rng.choice((-0.45, 0.45))
            fd = Vector((math.cos(fork_a), math.sin(fork_a), 0.0))
            organic_trunk_loft(bm, uv_layer, [p1, p1 + fd * (r_reach * 0.36) + Vector((0, 0, 0.02)), p1 + fd * (r_reach * 0.62) + Vector((0, 0, -0.05))], [radius * 0.22, radius * 0.11, radius * 0.03], rng, sides=6, oval_ratio=0.75, bark_ridges=3, u_range=u_bark, v_range=v_bark)
