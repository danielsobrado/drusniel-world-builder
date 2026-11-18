"""High-detail city prop subdivision, micro-sculpting, soil skirts, and baked AO."""
import math
from collections import defaultdict

from mathutils import Vector

from ..config import detailed

CITY_PROP_MIN_TRIS = 15200
CITY_PROP_MAX_TRIS = 38000

_MAT_RELIEF = {
    'stone': 0.011,
    'stone_ashlar': 0.008,
    'stone_dressed': 0.007,
    'stone_dark': 0.013,
    'stone_granite': 0.012,
    'stone_basalt': 0.012,
    'stone_flag': 0.009,
    'brick': 0.006,
    'cobble': 0.012,
    'rock': 0.018,
    'earth': 0.016,
    'sod': 0.014,
    'snow': 0.014,
    'ice': 0.009,
    'timber': 0.006,
    'timber_dark': 0.007,
    'log': 0.009,
    'wood_trim': 0.004,
    'carved_wood': 0.005,
    'planks': 0.005,
    'bark': 0.010,
    'roof': 0.007,
    'roof_terracotta': 0.007,
    'thatch': 0.012,
    'thatch_reed': 0.013,
    'plaster': 0.005,
    'hide': 0.008,
    'hide_red': 0.008,
    'cloth_cream': 0.007,
    'cloth_blue': 0.007,
    'cloth_red': 0.007,
    'rope': 0.006,
    'bone': 0.007,
    'iron': 0.0025,
    'bronze': 0.0025,
    'hold_bronze': 0.0025,
    'gold': 0.002,
    'foliage': 0.014,
    'flowers': 0.012,
}


def _smoothstep(edge0, edge1, x):
    if edge1 == edge0:
        return 0.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def _pos_key(p):
    return (round(p.x * 10000.0), round(p.y * 10000.0), round(p.z * 10000.0))


def _edge_key(a, b):
    ka = _pos_key(a)
    kb = _pos_key(b)
    return (ka, kb) if ka <= kb else (kb, ka)


def _tri_area(a, b, c):
    return (b - a).cross(c - a).length * 0.5


def _noise3(x, y, z, seed):
    s = seed * 0.137
    v1 = math.sin(x * 11.3 + y * 7.1 + z * 5.7 + s) * math.cos(y * 13.7 - z * 9.3 + s * 0.7)
    v2 = math.sin(x * 23.9 - z * 19.1 + y * 15.3 + s * 1.9) * 0.5
    v3 = math.cos(y * 37.1 + x * 31.7 + z * 29.3 - s * 1.3) * 0.25
    return (v1 + v2 + v3) / 1.75


def enhance_city_ground_contact(name, b, skirt_spec, has_explicit):
    """Enrich city prop base with sculpted stepped plinths, cobble kerbs, and soil aprons."""
    if not b.verts:
        return
    plinth_mat, apron_mat = next(
        (v for prefix, v in skirt_spec.items() if name.startswith(prefix)),
        ('cobble', 'earth'),
    )
    xs = [v.x for v in b.verts]
    ys = [v.y for v in b.verts]
    cx = (min(xs) + max(xs)) * 0.5
    cy = (min(ys) + max(ys)) * 0.5
    rx = min(1.38, max(0.38, (max(xs) - min(xs)) * 0.46))
    ry = min(1.38, max(0.38, (max(ys) - min(ys)) * 0.46))
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(name))

    if name not in has_explicit:
        b.box((cx - rx, cy - ry, -0.16), (cx + rx, cy + ry, 0.06), plinth_mat, skip=('-z',))

    ring_count = 8 if detailed() else 4
    for i in range(ring_count):
        ang = 2.0 * math.pi * i / ring_count + (seed % 7) * 0.15
        jitter_r = 0.88 + 0.10 * math.sin(i * 2.3 + seed)
        px = cx + rx * jitter_r * math.cos(ang)
        py = cy + ry * jitter_r * math.sin(ang)
        mat = apron_mat if (i % 2 == 0 or not detailed()) else plinth_mat
        rad = 0.15 if (i % 2 == 0) else 0.11
        b.blob(
            (px, py, 0.0),
            rad,
            mat,
            subdiv=2 if detailed() else 1,
            squash=(1.22, 0.96, 0.40),
            jitter=0.22,
            seed=seed + i * 13,
        )

    if detailed():
        # Subtle recessed soil-transition kerb collar around the base for road/plaza blending
        for sx in (-1, 1):
            for sy in (-1, 1):
                kx = cx + sx * (rx * 0.84)
                ky = cy + sy * (ry * 0.84)
                b.box(
                    (kx - 0.10, ky - 0.10, -0.08),
                    (kx + 0.10, ky + 0.10, 0.07),
                    plinth_mat,
                    bevel=0.02,
                    skip=('-z',),
                )


def _triangulate_builder(b):
    new_faces = []
    new_uvs = []
    new_colors = []
    new_mats = []
    new_smooth = []
    corner = 0
    for f_idx, face in enumerate(b.faces):
        n = len(face)
        f_uvs = b.uvs[corner:corner + n]
        f_cols = b.colors[corner:corner + n]
        corner += n
        mat = b.face_mats[f_idx]
        sm = b.face_smooth[f_idx]
        if n == 3:
            new_faces.append(face)
            new_uvs.extend(f_uvs)
            new_colors.extend(f_cols)
            new_mats.append(mat)
            new_smooth.append(sm)
            continue
        v0, u0, c0 = face[0], f_uvs[0], f_cols[0]
        for k in range(1, n - 1):
            new_faces.append((v0, face[k], face[k + 1]))
            new_uvs.extend((u0, f_uvs[k], f_uvs[k + 1]))
            new_colors.extend((c0, f_cols[k], f_cols[k + 1]))
            new_mats.append(mat)
            new_smooth.append(sm)
    b.faces = new_faces
    b.uvs = new_uvs
    b.colors = new_colors
    b.face_mats = new_mats
    b.face_smooth = new_smooth


def _split_red_green(b, split_mask):
    """Conformal 1->4 / 1->2 / 1->3 subdivision with zero T-junctions."""
    verts = b.verts
    faces = b.faces
    uvs = b.uvs
    colors = b.colors

    marked_edges = set()
    for f_idx, flag in enumerate(split_mask):
        if not flag:
            continue
        v0, v1, v2 = faces[f_idx]
        marked_edges.add(_edge_key(verts[v0], verts[v1]))
        marked_edges.add(_edge_key(verts[v1], verts[v2]))
        marked_edges.add(_edge_key(verts[v2], verts[v0]))

    new_verts = list(verts)
    edge_pos_mid_idx = {}

    def get_pos_mid(va_idx, vb_idx):
        ek = _edge_key(verts[va_idx], verts[vb_idx])
        idx = edge_pos_mid_idx.get(ek)
        if idx is None:
            idx = len(new_verts)
            new_verts.append((verts[va_idx] + verts[vb_idx]) * 0.5)
            edge_pos_mid_idx[ek] = idx
        return idx

    out_faces = []
    out_uvs = []
    out_colors = []
    out_mats = []
    out_smooth = []

    def emit(va, vb, vc, ua, ub, uc, ca, cb, cc, mat, sm):
        out_faces.append((va, vb, vc))
        out_uvs.extend((ua, ub, uc))
        out_colors.extend((ca, cb, cc))
        out_mats.append(mat)
        out_smooth.append(sm)

    for f_idx, (v0, v1, v2) in enumerate(faces):
        base = f_idx * 3
        u0, u1, u2 = uvs[base], uvs[base + 1], uvs[base + 2]
        c0, c1, c2 = colors[base], colors[base + 1], colors[base + 2]
        mat = b.face_mats[f_idx]
        sm = b.face_smooth[f_idx]

        m01 = _edge_key(verts[v0], verts[v1]) in marked_edges
        m12 = _edge_key(verts[v1], verts[v2]) in marked_edges
        m20 = _edge_key(verts[v2], verts[v0]) in marked_edges
        count = int(m01) + int(m12) + int(m20)

        if count == 0:
            emit(v0, v1, v2, u0, u1, u2, c0, c1, c2, mat, sm)
        elif count == 3:
            v01 = get_pos_mid(v0, v1)
            v12 = get_pos_mid(v1, v2)
            v20 = get_pos_mid(v2, v0)
            u01 = ((u0[0] + u1[0]) * 0.5, (u0[1] + u1[1]) * 0.5)
            u12 = ((u1[0] + u2[0]) * 0.5, (u1[1] + u2[1]) * 0.5)
            u20 = ((u2[0] + u0[0]) * 0.5, (u2[1] + u0[1]) * 0.5)
            c01 = (c0 + c1) * 0.5
            c12 = (c1 + c2) * 0.5
            c20 = (c2 + c0) * 0.5
            emit(v0, v01, v20, u0, u01, u20, c0, c01, c20, mat, sm)
            emit(v01, v1, v12, u01, u1, u12, c01, c1, c12, mat, sm)
            emit(v20, v12, v2, u20, u12, u2, c20, c12, c2, mat, sm)
            emit(v01, v12, v20, u01, u12, u20, c01, c12, c20, mat, sm)
        elif count == 1:
            # Rotate so the split edge is (a, b) opposite c
            if m01:
                vs, us, cs = (v0, v1, v2), (u0, u1, u2), (c0, c1, c2)
            elif m12:
                vs, us, cs = (v1, v2, v0), (u1, u2, u0), (c1, c2, c0)
            else:
                vs, us, cs = (v2, v0, v1), (u2, u0, u1), (c2, c0, c1)
            va, vb, vc = vs
            ua, ub, uc = us
            ca, cb, cc = cs
            vm = get_pos_mid(va, vb)
            um = ((ua[0] + ub[0]) * 0.5, (ua[1] + ub[1]) * 0.5)
            cm = (ca + cb) * 0.5
            emit(va, vm, vc, ua, um, uc, ca, cm, cc, mat, sm)
            emit(vm, vb, vc, um, ub, uc, cm, cb, cc, mat, sm)
        else:
            # count == 2: rotate so the UNSPLIT edge is (b, c), split edges share a
            if not m12:
                vs, us, cs = (v0, v1, v2), (u0, u1, u2), (c0, c1, c2)
            elif not m20:
                vs, us, cs = (v1, v2, v0), (u1, u2, u0), (c1, c2, c0)
            else:
                vs, us, cs = (v2, v0, v1), (u2, u0, u1), (c2, c0, c1)
            va, vb, vc = vs
            ua, ub, uc = us
            ca, cb, cc = cs
            vm_ab = get_pos_mid(va, vb)
            vm_ac = get_pos_mid(va, vc)
            um_ab = ((ua[0] + ub[0]) * 0.5, (ua[1] + ub[1]) * 0.5)
            um_ac = ((ua[0] + uc[0]) * 0.5, (ua[1] + uc[1]) * 0.5)
            cm_ab = (ca + cb) * 0.5
            cm_ac = (ca + cc) * 0.5
            emit(va, vm_ab, vm_ac, ua, um_ab, um_ac, ca, cm_ab, cm_ac, mat, sm)
            if (verts[vb] - verts[vc]).length_squared > 0:
                emit(vm_ab, vb, vc, um_ab, ub, uc, cm_ab, cb, cc, mat, sm)
                emit(vm_ab, vc, vm_ac, um_ab, uc, um_ac, cm_ab, cc, cm_ac, mat, sm)

    b.verts = new_verts
    b.faces = out_faces
    b.uvs = out_uvs
    b.colors = out_colors
    b.face_mats = out_mats
    b.face_smooth = out_smooth


def _sculpt_builder_relief(b, seed):
    verts = b.verts
    if not verts or not b.faces:
        return
    key_norm = defaultdict(Vector)
    key_amp = defaultdict(list)

    for f_idx, (v0, v1, v2) in enumerate(b.faces):
        mat_name = b._mat_names[b.face_mats[f_idx]]
        amp = _MAT_RELIEF.get(mat_name, 0.0)
        p0, p1, p2 = verts[v0], verts[v1], verts[v2]
        fn = (p1 - p0).cross(p2 - p0)
        if fn.length_squared <= 1e-12:
            continue
        for vi in (v0, v1, v2):
            k = _pos_key(verts[vi])
            key_norm[k] += fn
            key_amp[k].append(amp)

    disp_by_key = {}
    for k, accum_n in key_norm.items():
        if accum_n.length_squared <= 1e-12:
            disp_by_key[k] = Vector((0.0, 0.0, 0.0))
            continue
        amps = key_amp[k]
        # Only displace where all coincident materials agree on relief (> 0)
        amp = min(amps) if amps else 0.0
        if amp <= 1e-5:
            disp_by_key[k] = Vector((0.0, 0.0, 0.0))
            continue
        n = accum_n.normalized()
        px, py, pz = k[0] * 1e-4, k[1] * 1e-4, k[2] * 1e-4
        # Damp relief below grade so footing contacts stay predictable
        grade_fade = _smoothstep(-0.08, 0.14, pz)
        val = _noise3(px, py, pz, seed)
        disp_by_key[k] = n * (amp * grade_fade * val)

    b.verts = [v + disp_by_key.get(_pos_key(v), Vector((0.0, 0.0, 0.0))) for v in verts]


def _bake_city_ao(b):
    verts = b.verts
    faces = b.faces
    if not verts or not faces:
        return
    xs = [v.x for v in verts]
    ys = [v.y for v in verts]
    cx = (min(xs) + max(xs)) * 0.5
    cy = (min(ys) + max(ys)) * 0.5
    rx = max(0.35, (max(xs) - min(xs)) * 0.5)
    ry = max(0.35, (max(ys) - min(ys)) * 0.5)

    # Accumulate vertex position normals & sample spatial grid
    pos_normals = defaultdict(Vector)
    face_normals = []
    for v0, v1, v2 in faces:
        fn = (verts[v1] - verts[v0]).cross(verts[v2] - verts[v0])
        if fn.length_squared > 1e-12:
            fn.normalize()
        else:
            fn = Vector((0.0, 0.0, 1.0))
        face_normals.append(fn)
        for vi in (v0, v1, v2):
            pos_normals[_pos_key(verts[vi])] += fn

    # Spatial hash at 0.16 m resolution using representative position samples
    cell = 0.16
    grid = defaultdict(list)
    seen_pos = set()
    for vi, p in enumerate(verts):
        k = _pos_key(p)
        if k in seen_pos:
            continue
        seen_pos.add(k)
        c = (int(math.floor(p.x / cell)), int(math.floor(p.y / cell)), int(math.floor(p.z / cell)))
        grid[c].append((p.x, p.y, p.z))

    pos_ao = {}
    for k, accum_n in pos_normals.items():
        px, py, pz = k[0] * 1e-4, k[1] * 1e-4, k[2] * 1e-4
        n = accum_n.normalized() if accum_n.length_squared > 1e-12 else Vector((0.0, 0.0, 1.0))

        # 1) Soil / ground contact AO
        soil_ao = 0.58 + 0.42 * _smoothstep(-0.04, 0.38, pz)

        # 2) Peripheral neighbour transition AO (outer basal margin feathers slightly)
        radial_u = math.hypot((px - cx) / rx, (py - cy) / ry)
        periph_ao = 1.0 - 0.12 * _smoothstep(0.75, 1.15, radial_u) * (1.0 - _smoothstep(0.0, 0.25, pz))

        # 3) Local crevice / inter-part occlusion via spatial hash
        cx_i = int(math.floor(px / cell))
        cy_i = int(math.floor(py / cell))
        cz_i = int(math.floor(pz / cell))
        occ = 0.0
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for qx, qy, qz in grid.get((cx_i + dx, cy_i + dy, cz_i + dz), ()):
                        vx, vy, vz = qx - px, qy - py, qz - pz
                        d2 = vx * vx + vy * vy + vz * vz
                        if d2 < 0.0012 or d2 > 0.12:
                            continue
                        dist = math.sqrt(d2)
                        dot = (vx * n.x + vy * n.y + vz * n.z) / dist
                        if dot > 0.12:
                            occ += dot * (1.0 - dist / 0.35)
        cavity_ao = max(0.64, 1.0 - min(0.36, occ * 0.032))
        sky_ao = 0.86 + 0.14 * max(-0.2, min(1.0, n.z))
        pos_ao[k] = soil_ao * periph_ao * cavity_ao * sky_ao

    out_colors = []
    for f_idx, (v0, v1, v2) in enumerate(faces):
        base = f_idx * 3
        for offset, vi in enumerate((v0, v1, v2)):
            orig = b.colors[base + offset]
            ao = pos_ao.get(_pos_key(verts[vi]), 1.0)
            # Blend existing piece_tone + material grime with new high-res AO
            val = max(0.28, min(1.0, orig * (0.35 + 0.65 * ao)))
            out_colors.append(val)
    b.colors = out_colors


def finalize_city_prop(name, b, min_tris=CITY_PROP_MIN_TRIS, max_tris=CITY_PROP_MAX_TRIS):
    """When detailed() is active, refine city prop to >=15k tris with micro-relief and soil AO."""
    if not detailed() or not b.faces or not b.verts:
        return b

    _triangulate_builder(b)
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(name))

    guard = 0
    while len(b.faces) < min_tris and guard < 6:
        guard += 1
        cur = len(b.faces)
        if cur * 4 <= max_tris:
            _split_red_green(b, [True] * cur)
        else:
            # Partial conformal split of largest triangles to stay well under max_tris
            areas = [
                (_tri_area(b.verts[v0], b.verts[v1], b.verts[v2]), idx)
                for idx, (v0, v1, v2) in enumerate(b.faces)
            ]
            areas.sort(reverse=True)
            need = min_tris - cur
            # Splitting ~1/2.4 of needed count handles red+green cascade
            pick_count = max(1, min(cur, int(need / 1.9) + 120))
            mask = [False] * cur
            for _, idx in areas[:pick_count]:
                mask[idx] = True
            _split_red_green(b, mask)
            if len(b.faces) <= cur:
                break

    _sculpt_builder_relief(b, seed)
    _bake_city_ao(b)
    return b
