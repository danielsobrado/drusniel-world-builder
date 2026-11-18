"""PBR texture packing, 3D soil/neighbour skirts, adaptive >=15k refinement, and AO baking."""
import json
import math
import os
import random
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Vector


def _smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / max(edge1 - edge0, 1e-6)))
    return t * t * (3.0 - 2.0 * t)


def value_noise_2d(w, h, cells, rng):
    cx = max(1, int(cells[0]))
    cy = max(1, int(cells[1]))
    grid = rng.random((cy + 1, cx + 1))
    grid[:, -1] = grid[:, 0]
    grid[-1, :] = grid[0, :]
    ys, xs = np.mgrid[0:h, 0:w]
    gx, gy = xs / w * cx, ys / h * cy
    x0, y0 = np.floor(gx).astype(int), np.floor(gy).astype(int)
    fx, fy = gx - x0, gy - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = grid[y0, x0], grid[y0, x0 + 1]
    c, d = grid[y0 + 1, x0], grid[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm_2d(w, h, cells, rng, octaves=4):
    total, amp, norm = np.zeros((h, w)), 1.0, 0.0
    for o in range(octaves):
        total += amp * value_noise_2d(w, h, (cells[0] * 2 ** o, cells[1] * 2 ** o), rng)
        norm += amp
        amp *= 0.5
    return total / norm


def height_to_normal_map(height_field, strength=2.4):
    dx = (np.roll(height_field, -1, axis=1) - np.roll(height_field, 1, axis=1)) * strength
    dy = (np.roll(height_field, -1, axis=0) - np.roll(height_field, 1, axis=0)) * strength
    dz = np.ones_like(height_field)
    norm = np.sqrt(dx * dx + dy * dy + dz * dz) + 1e-8
    nx = (-dx / norm) * 0.5 + 0.5
    ny = (dy / norm) * 0.5 + 0.5
    nz = (dz / norm) * 0.5 + 0.5
    return np.stack([nx, ny, nz, np.ones_like(nz)], axis=-1)


def save_png_image(name, pixels, path, non_color=False):
    h, w, _ = pixels.shape
    out = np.clip(pixels.astype(np.float32), 0.0, 1.0)
    if not non_color:
        out[..., :3] = np.power(out[..., :3], 0.74)
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    image = bpy.data.images.new(name, w, h, alpha=True)
    image.pixels.foreach_set(np.flipud(out).ravel())
    image.filepath_raw = path
    image.file_format = 'PNG'
    if non_color:
        image.colorspace_settings.name = 'Non-Color'
    image.save()
    return image


def image_to_rgba(image):
    w, h = image.size
    if w <= 0 or h <= 0:
        return np.ones((64, 64, 4), dtype=np.float32)
    arr = np.array(image.pixels[:], dtype=np.float32).reshape((h, w, 4))
    return np.flipud(arr)


def find_opaque_soil_patch(rgba, min_box=12):
    """Find an opaque rectangular patch in UV coordinates (u0, u1, v0, v1) for soil/wood skirts."""
    h, w, _ = rgba.shape
    alpha = rgba[..., 3]
    if float(alpha.min()) >= 0.96:
        return (0.04, 0.28, 0.04, 0.30)
    mask = alpha >= 0.95
    for box in (min_box, max(4, min_box // 2)):
        step = max(2, box // 2)
        best = None
        best_score = -1e9
        for y0 in range(h - box, -1, -step):
            v_mid = 1.0 - (y0 + box * 0.5) / h
            for x0 in range(0, w - box + 1, step):
                if not bool(mask[y0:y0 + box, x0:x0 + box].all()):
                    continue
                patch = rgba[y0:y0 + box, x0:x0 + box, :3]
                mean_col = patch.mean(axis=(0, 1))
                luma = float(0.2126 * mean_col[0] + 0.7152 * mean_col[1] + 0.0722 * mean_col[2])
                u_mid = (x0 + box * 0.5) / w
                score = (1.0 - luma) * 2.0 + (1.0 - u_mid) * 1.4 + (1.0 - v_mid) * 1.2
                if score > best_score:
                    best_score = score
                    pad_u = 1.2 / w
                    pad_v = 1.2 / h
                    u0 = x0 / w + pad_u
                    u1 = (x0 + box) / w - pad_u
                    v1 = 1.0 - y0 / h - pad_v
                    v0 = 1.0 - (y0 + box) / h + pad_v
                    best = (u0, u1, v0, v1)
        if best is not None:
            return best
    ys, xs = np.where(alpha >= 0.85)
    if len(xs) > 0:
        idx = int(np.argmax(ys))
        cx = (float(xs[idx]) + 0.5) / w
        cy = 1.0 - (float(ys[idx]) + 0.5) / h
        eps_u = 0.5 / w
        eps_v = 0.5 / h
        return (max(0.0, cx - eps_u), min(1.0, cx + eps_u), max(0.0, cy - eps_v), min(1.0, cy + eps_v))
    return None


def _ensure_gltf_output_group():
    ng = bpy.data.node_groups.get('glTF Material Output')
    if ng is None:
        ng = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        ng.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return ng


def build_pbr_material(
    name,
    image,
    alpha=False,
    normal_image=None,
    orm_image=None,
    roughness=0.78,
    metallic=0.0,
    subsurface=0.0,
    emissive_image=None,
    emissive_strength=0.0,
):
    """Build a complete glTF-compliant PBR Principled BSDF material with BaseColor, Normal, ORM, and Col AO."""
    rgba = image_to_rgba(image)
    h, w, _ = rgba.shape
    luma = 0.2126 * rgba[..., 0] + 0.7152 * rgba[..., 1] + 0.0722 * rgba[..., 2]

    stem_path = os.path.splitext(image.filepath_raw)[0] if image.filepath_raw else os.path.join(
        tempfile.gettempdir(), f'{name}_tex',
    )
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(name))
    rng = np.random.default_rng(seed)
    micro = fbm_2d(w, h, (20, 20), rng, 3)

    if normal_image is None:
        height = luma * 0.84 + micro * 0.16
        normal_image = save_png_image(
            f'{name}_nrm',
            height_to_normal_map(height, strength=2.6),
            f'{stem_path}-nrm.png',
            non_color=True,
        )

    if orm_image is None:
        ys = np.mgrid[0:h, 0:w][0].astype(np.float32)
        v_coord = 1.0 - ys / max(1, h - 1)
        basal_ao = 0.48 + 0.52 * np.clip(v_coord / 0.40, 0.0, 1.0)
        crevice_ao = 0.56 + 0.44 * np.clip(luma * 1.45, 0.0, 1.0)
        ao = np.clip(0.36 + 0.64 * basal_ao * crevice_ao, 0.28, 1.0)
        rough_field = np.clip(
            roughness + (0.45 - luma) * 0.26 + (1.0 - np.clip(v_coord / 0.22, 0.0, 1.0)) * 0.08 + (micro - 0.5) * 0.10,
            0.12,
            0.98,
        )
        metal_field = np.full((h, w), float(metallic), dtype=np.float32)
        orm_pixels = np.stack([ao, rough_field, metal_field, np.ones((h, w), dtype=np.float32)], axis=-1)
        orm_image = save_png_image(f'{name}_orm', orm_pixels, f'{stem_path}-orm.png', non_color=True)

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')

    t_alb = nodes.new('ShaderNodeTexImage')
    t_alb.image = image
    vc = nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    mix_col = nodes.new('ShaderNodeMix')
    mix_col.data_type = 'RGBA'
    mix_col.blend_type = 'MULTIPLY'
    mix_col.inputs['Factor'].default_value = 1.0
    links.new(t_alb.outputs['Color'], mix_col.inputs['A'])
    links.new(vc.outputs['Color'], mix_col.inputs['B'])
    links.new(mix_col.outputs['Result'], bsdf.inputs['Base Color'])

    t_orm = nodes.new('ShaderNodeTexImage')
    t_orm.image = orm_image
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(t_orm.outputs['Color'], sep.inputs['Color'])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])

    g_out = nodes.new('ShaderNodeGroup')
    g_out.node_tree = _ensure_gltf_output_group()
    links.new(sep.outputs['Red'], g_out.inputs['Occlusion'])

    t_nrm = nodes.new('ShaderNodeTexImage')
    t_nrm.image = normal_image
    nmap = nodes.new('ShaderNodeNormalMap')
    nmap.inputs['Strength'].default_value = 0.90
    links.new(t_nrm.outputs['Color'], nmap.inputs['Color'])
    links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])

    if subsurface > 0 and 'Subsurface Weight' in bsdf.inputs:
        bsdf.inputs['Subsurface Weight'].default_value = subsurface
    if emissive_image is not None and 'Emission Color' in bsdf.inputs:
        t_em = nodes.new('ShaderNodeTexImage')
        t_em.image = emissive_image
        links.new(t_em.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = max(0.5, float(emissive_strength))
    elif emissive_strength > 0 and 'Emission Color' in bsdf.inputs:
        links.new(t_alb.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = float(emissive_strength)

    if alpha:
        compare = nodes.new('ShaderNodeMath')
        compare.operation = 'GREATER_THAN'
        compare.inputs[1].default_value = 0.4
        links.new(t_alb.outputs['Alpha'], compare.inputs[0])
        links.new(compare.outputs[0], bsdf.inputs['Alpha'])
        mat.use_backface_culling = False

    soil_patch = find_opaque_soil_patch(rgba)
    mat['soil_uv_bounds'] = json.dumps(soil_patch) if soil_patch else ''
    return mat


def get_soil_skirt_material():
    """Shared opaque organic humus/soil/moss PBR material for pure alpha-cutout flora bases."""
    existing = bpy.data.materials.get('UnderstorySoilSkirt')
    if existing is not None:
        return existing
    w = h = 256
    rng = np.random.default_rng(7711)
    coarse = fbm_2d(w, h, (8, 8), rng, 4)
    fine = fbm_2d(w, h, (24, 24), rng, 3)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    soil = np.array([0.24, 0.19, 0.14]) * (0.68 + 0.56 * coarse[..., None])
    moss = (fine > 0.54) & (coarse > 0.46)
    soil[moss] = np.array([0.16, 0.24, 0.10]) * (0.76 + 0.42 * fine[moss, None])
    pebble = (coarse < 0.34) & (fine > 0.62)
    soil[pebble] = np.array([0.38, 0.36, 0.33]) * (0.75 + 0.35 * fine[pebble, None])
    rgba = np.concatenate([np.clip(soil, 0.0, 1.0), np.ones((h, w, 1), dtype=np.float32)], axis=-1)
    tex_dir = os.path.join(tempfile.gettempdir(), 'drusniel_understory_shared')
    os.makedirs(tex_dir, exist_ok=True)
    alb = save_png_image('understory_soil_skirt_alb', rgba, os.path.join(tex_dir, 'soil-skirt-alb.png'))
    nrm = save_png_image(
        'understory_soil_skirt_nrm',
        height_to_normal_map(coarse * 0.6 + fine * 0.4, strength=2.6),
        os.path.join(tex_dir, 'soil-skirt-nrm.png'),
        non_color=True,
    )
    return build_pbr_material('UnderstorySoilSkirt', alb, alpha=False, normal_image=nrm, roughness=0.92)


def add_soil_neighbour_skirt(bm, uv_layer, soil_uv, mat_index=0, rx=0.38, ry=0.38, seed=1):
    """Build an undulating 3D basal soil/humus collar and peripheral neighbour mounds."""
    rng = random.Random(seed)
    u0, u1, v0, v1 = soil_uv
    rings_n = 4
    sides = 16
    ring_verts = []
    phase = rng.uniform(0.0, math.tau)
    for r_idx in range(rings_n):
        frac = r_idx / (rings_n - 1)
        row = []
        for s in range(sides):
            a = s / sides * math.tau
            lobe = 1.0 + 0.16 * math.sin(a * 5.0 + phase) + 0.08 * math.cos(a * 9.0 - phase)
            rr_x = rx * (0.14 + 0.92 * frac) * lobe
            rr_y = ry * (0.14 + 0.92 * frac) * lobe
            x = math.cos(a) * rr_x
            y = math.sin(a) * rr_y
            z = (
                0.048 * (1.0 - frac * 0.75)
                + 0.014 * math.sin(a * 4.0 + frac * 3.0)
                - (0.042 if frac > 0.72 else 0.0)
            )
            v = bm.verts.new((x, y, z))
            u_c = u0 + (u1 - u0) * (0.5 + 0.44 * frac * math.cos(a))
            v_c = v0 + (v1 - v0) * (0.5 + 0.44 * frac * math.sin(a))
            row.append((v, (u_c, v_c)))
        ring_verts.append(row)

    center_v = bm.verts.new((0.0, 0.0, 0.055))
    uc, vc = 0.5 * (u0 + u1), 0.5 * (v0 + v1)
    for s in range(sides):
        s_next = (s + 1) % sides
        f = bm.faces.new((center_v, ring_verts[0][s][0], ring_verts[0][s_next][0]))
        f.material_index = mat_index
        f.smooth = True
        for loop, coord in zip(f.loops, ((uc, vc), ring_verts[0][s][1], ring_verts[0][s_next][1])):
            loop[uv_layer].uv = coord
    for r_idx in range(rings_n - 1):
        ra, rb = ring_verts[r_idx], ring_verts[r_idx + 1]
        for s in range(sides):
            s_next = (s + 1) % sides
            f = bm.faces.new((ra[s][0], rb[s][0], rb[s_next][0], ra[s_next][0]))
            f.material_index = mat_index
            f.smooth = True
            for loop, coord in zip(f.loops, (ra[s][1], rb[s][1], rb[s_next][1], ra[s_next][1])):
                loop[uv_layer].uv = coord

    # Add 5 low-profile peripheral humus/pebble mounds around the outer collar for neighbour blending
    for k in range(5):
        a = k / 5.0 * math.tau + 0.35 + rng.uniform(-0.2, 0.2)
        cx = math.cos(a) * rx * rng.uniform(0.68, 0.96)
        cy = math.sin(a) * ry * rng.uniform(0.68, 0.96)
        rad = min(rx, ry) * rng.uniform(0.22, 0.32)
        h_mound = rng.uniform(0.032, 0.058)
        ex_v = set(bm.verts)
        ex_f = set(bm.faces)
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        new_vs = [v for v in bm.verts if v not in ex_v]
        new_fs = [f for f in bm.faces if f not in ex_f]
        for v in new_vs:
            co = v.co
            wobble = 1.0 + 0.16 * math.sin(co.x * 4.5 + k) * math.cos(co.y * 4.5 - k)
            vx = cx + co.x * rad * wobble
            vy = cy + co.y * rad * wobble
            vz = (max(-0.025, co.z * h_mound) + 0.008)
            v.co = Vector((vx, vy, vz))
        for f in new_fs:
            f.material_index = mat_index
            f.smooth = True
            for loop in f.loops:
                rel = loop.vert.co
                uu = u0 + (u1 - u0) * min(0.95, max(0.05, 0.5 + 0.35 * (rel.x - cx) / max(rad, 1e-4)))
                vv = v0 + (v1 - v0) * min(0.95, max(0.05, 0.5 + 0.35 * (rel.y - cy) / max(rad, 1e-4)))
                loop[uv_layer].uv = (uu, vv)


def _subdivide_to_target(bm, min_triangles, max_triangles, sculpt_amp=0.0045):
    bmesh.ops.triangulate(bm, faces=bm.faces)
    target = min(max_triangles - 400, min_triangles + 650)
    guard = 0
    while len(bm.faces) < target and guard < 10:
        guard += 1
        cur = len(bm.faces)
        if cur == 0:
            break
        need = target - cur
        if cur * 4 <= max_triangles and need >= cur * 0.85:
            bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1, use_grid_fill=True)
        else:
            edges = sorted(bm.edges, key=lambda e: e.calc_length(), reverse=True)
            k = max(1, min(len(edges), (need + 1) // 2))
            bmesh.ops.subdivide_edges(bm, edges=edges[:k], cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        if sculpt_amp > 0.0:
            bm.normal_update()
            boundary_verts = {v for e in bm.edges if e.is_boundary for v in e.verts}
            for v in bm.verts:
                if v in boundary_verts:
                    continue
                co = v.co
                if co.z < -0.02:
                    continue
                disp = sculpt_amp * (
                    0.6 * math.sin(co.x * 26.0 + co.y * 19.0 + co.z * 21.0)
                    + 0.4 * math.cos(co.x * 41.0 - co.y * 37.0 + co.z * 31.0)
                )
                v.co = co + v.normal * disp
            sculpt_amp *= 0.62


def _snap_and_clean(bm):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1.0e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    degen = []
    for f in bm.faces:
        area = f.calc_area()
        if area < 1.0e-8:
            degen.append(f)
            continue
        lengths = [e.calc_length() for e in f.edges]
        min_l = min(lengths)
        max_l = max(lengths)
        if min_l < 1.0e-5 or (2.0 * area / max(max_l, 1e-6)) < 5.0e-6:
            degen.append(f)
    if degen:
        bmesh.ops.delete(bm, geom=degen, context='FACES')
    loose_edges = [e for e in bm.edges if not e.link_faces]
    if loose_edges:
        bmesh.ops.delete(bm, geom=loose_edges, context='EDGES')
    loose_verts = [v for v in bm.verts if not v.link_faces]
    if loose_verts:
        bmesh.ops.delete(bm, geom=loose_verts, context='VERTS')


def bake_soil_and_neighbour_ao(mesh):
    """Bake soil contact AO, interior cluster AO, cavity curvature, and neighbour-fit shading into Col."""
    for attr in list(mesh.color_attributes):
        mesh.color_attributes.remove(attr)
    col = mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    mesh.color_attributes.active_color = col

    verts = mesh.vertices
    if not verts:
        return
    max_r = max((math.hypot(v.co.x, v.co.y) for v in verts), default=0.5)
    max_r = max(max_r, 0.25)

    # Approximate local cavity from vertex normal variance across polygons
    vert_ao = [1.0] * len(verts)
    for idx, v in enumerate(verts):
        co = v.co
        n = v.normal
        soil_ao = 0.44 + 0.56 * _smoothstep(-0.02, 0.24, co.z)
        radial = math.hypot(co.x, co.y) / max_r
        interior_ao = 0.68 + 0.32 * _smoothstep(0.0, 0.72, radial)
        neighbour_fit = 0.74 + 0.26 * (1.0 - _smoothstep(0.62, 1.02, radial) * (1.0 - _smoothstep(0.0, 0.14, co.z)))
        up_ao = 0.76 + 0.24 * (0.5 + 0.5 * n.z)
        micro_crevice = 0.92 + 0.08 * math.sin(co.x * 17.0 + co.y * 19.0 + co.z * 23.0)
        ao = max(0.28, min(1.0, soil_ao * interior_ao * neighbour_fit * up_ao * micro_crevice))
        vert_ao[idx] = ao

    loops = mesh.loops
    ao_data = [c for loop in loops for c in (vert_ao[loop.vertex_index],) * 3 + (1.0,)]
    col.data.foreach_set('color', ao_data)


def finalize_understory_mesh(
    name,
    bm,
    materials,
    min_triangles=15000,
    max_triangles=32000,
    add_skirt=True,
    allow_extra_material=False,
):
    """Attach soil/neighbour contact skirt, refine to >=15k tris, snap for float16, and bake AO."""
    if not isinstance(materials, (list, tuple)):
        materials = [materials]
    else:
        materials = list(materials)

    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')

    if add_skirt and bm.verts:
        xs = [v.co.x for v in bm.verts]
        ys = [v.co.y for v in bm.verts]
        span_x = max(xs) - min(xs)
        span_y = max(ys) - min(ys)
        rx = max(0.24, min(1.45, span_x * 0.42))
        ry = max(0.24, min(0.95, span_y * 0.42))

        primary = materials[0]
        raw_bounds = primary.get('soil_uv_bounds', '')
        soil_uv = tuple(json.loads(raw_bounds)) if raw_bounds else None
        mat_idx = 0
        if soil_uv is None:
            if len(materials) > 1:
                for idx, m in enumerate(materials[1:], start=1):
                    mb = m.get('soil_uv_bounds', '')
                    if mb:
                        soil_uv = tuple(json.loads(mb))
                        mat_idx = idx
                        break
            if soil_uv is None and allow_extra_material:
                soil_mat = get_soil_skirt_material()
                materials.append(soil_mat)
                mat_idx = len(materials) - 1
                soil_uv = tuple(json.loads(soil_mat['soil_uv_bounds']))
        if soil_uv is not None:
            seed = sum(ord(c) * (i + 1) for i, c in enumerate(name))
            add_soil_neighbour_skirt(bm, uv_layer, soil_uv, mat_index=mat_idx, rx=rx, ry=ry, seed=seed)

    _snap_and_clean(bm)
    _subdivide_to_target(bm, min_triangles + 400, max_triangles)
    _snap_and_clean(bm)
    guard = 0
    while len(bm.faces) < min_triangles and guard < 4:
        guard += 1
        _subdivide_to_target(bm, min_triangles + 500, max_triangles, sculpt_amp=0.0015)
        _snap_and_clean(bm)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in materials:
        mesh.materials.append(mat)
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.validate(verbose=False)
    mesh.update()

    up = Vector((0.0, 0.0, 1.0))
    custom_normals = []
    for v in mesh.vertices:
        radial = Vector((v.co.x, v.co.y, max(0.25, v.co.z + 0.25)))
        radial = radial.normalized() if radial.length > 1e-4 else up
        n = v.normal * 0.68 + radial * 0.18 + up * 0.14
        basal_blend = 0.78 * _smoothstep(0.08, -0.02, v.co.z)
        n = n.lerp(up, basal_blend)
        if n.z < 0.05:
            n.z = 0.05
        custom_normals.append(n.normalized())
    mesh.normals_split_custom_set_from_vertices(custom_normals)

    bake_soil_and_neighbour_ao(mesh)

    tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    assert min_triangles <= tris <= max_triangles, (
        f'{name} has {tris} triangles (expected [{min_triangles}, {max_triangles}])'
    )
    return mesh, tris
