"""Shared geometry, procedural noise, material, and export helpers for biome understory."""
import math
import os
import bpy
import bmesh
import numpy as np
from mathutils import Vector

from understory_pbr import (
    add_soil_neighbour_skirt,
    build_pbr_material,
    fbm_2d,
    finalize_understory_mesh,
    height_to_normal_map,
    save_png_image,
    value_noise_2d,
)

MIN_TRIANGLES = 15000
MAX_TRIANGLES = 32000


def save_image(name, pixels, path, non_color=False):
    return save_png_image(name, pixels, path, non_color=non_color)


def value_noise(w, h, cells, rng):
    return value_noise_2d(w, h, cells, rng)


def fbm(w, h, cells, rng, octaves=4):
    return fbm_2d(w, h, cells, rng, octaves=octaves)


def height_to_normal(height_field, strength=2.4):
    return height_to_normal_map(height_field, strength=strength)


def make_material(
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
    return build_pbr_material(
        name,
        image,
        alpha=alpha,
        normal_image=normal_image,
        orm_image=orm_image,
        roughness=roughness,
        metallic=metallic,
        subsurface=subsurface,
        emissive_image=emissive_image,
        emissive_strength=emissive_strength,
    )


def _catmull_rom_chain(points, radii, subdiv=2):
    """Interpolate smooth organic intermediate stations along a 3D polyline."""
    if len(points) < 2 or subdiv <= 1:
        return list(points), list(radii)
    out_pts, out_rad = [], []
    n = len(points)
    for i in range(n - 1):
        p0 = points[max(0, i - 1)]
        p1 = points[i]
        p2 = points[i + 1]
        p3 = points[min(n - 1, i + 2)]
        r1 = radii[i]
        r2 = radii[i + 1]
        for s in range(subdiv):
            t = s / subdiv
            t2 = t * t
            t3 = t2 * t
            pt = 0.5 * (
                (2.0 * p1)
                + (-p0 + p2) * t
                + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
                + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
            )
            out_pts.append(pt)
            out_rad.append(r1 + (r2 - r1) * t)
    out_pts.append(points[-1])
    out_rad.append(radii[-1])
    return out_pts, out_rad


def tube(
    bm,
    uv,
    points,
    radii,
    sides,
    u_range=(0.0, 1.0),
    v_range=(0.0, 0.9),
    cap_end=True,
    rough=0.0,
    rng=None,
    scale_y=1.0,
    flute_count=0,
    flute_depth=0.0,
):
    points, radii = _catmull_rom_chain(points, radii, subdiv=3)
    sides = max(8, sides * 2)
    rings = []
    d0 = (points[1] - points[0]).normalized()
    normal = d0.orthogonal().normalized()
    length = 0.0
    total = sum((points[i] - points[i - 1]).length for i in range(1, len(points)))
    for i, p in enumerate(points):
        d = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        normal = (normal - d * normal.dot(d)).normalized()
        binormal = d.cross(normal)
        if i:
            length += (points[i] - points[i - 1]).length
        ring = []
        frac = length / max(total, 1e-6)
        v_coord = v_range[0] + (v_range[1] - v_range[0]) * frac
        for s in range(sides + 1):
            a = s / sides * 2 * math.pi
            flute = 1.0 + flute_depth * math.sin(a * flute_count + frac * 2.4) if flute_count > 0 else 1.0
            r = radii[i] * flute * (1 + (rng.uniform(-rough, rough) if rng and 0 < s < sides else 0))
            offset = normal * (math.cos(a) * r) + binormal * (math.sin(a) * r * scale_y)
            v = bm.verts.new(p + offset)
            u_coord = u_range[0] + (u_range[1] - u_range[0]) * (s / sides)
            ring.append((v, (u_coord, v_coord)))
        ring[-1] = (ring[0][0], ring[-1][1])
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for s in range(sides):
            verts = (a[s][0], a[s + 1][0], b[s + 1][0], b[s][0])
            if len(set(verts)) == 4:
                f = bm.faces.new(verts)
                for loop, (_, coord) in zip(f.loops, (a[s], a[s + 1], b[s + 1], b[s])):
                    loop[uv].uv = coord
    if cap_end and radii[-1] > 1e-3:
        tip = rings[-1]
        centre = bm.verts.new(points[-1])
        uc = 0.5 * (u_range[0] + u_range[1])
        vc = min(0.98, v_range[1] + 0.04)
        for s in range(sides):
            verts = (tip[s][0], tip[s + 1][0], centre)
            if len(set(verts)) == 3:
                f = bm.faces.new(verts)
                for loop, coord in zip(f.loops, ((uc - 0.08, vc - 0.02), (uc + 0.08, vc - 0.02), (uc, vc))):
                    loop[uv].uv = coord
    return rings


def _quad_bezier(p0, p1, p2, t):
    u = 1.0 - t
    return (u * u) * p0 + (2.0 * u * t) * p1 + (t * t) * p2


def arched_card(bm, uv, p0, p1, p2, w0, w1, w2, side_dir, u_range=(0.0, 1.0), v_range=(0.0, 1.0), v_mid=0.55):
    u0, u1 = u_range
    v0, v1 = v_range
    rows = 6
    cols = 4
    up_hint = Vector((0.0, 0.0, 1.0))
    grid = []
    for r in range(rows + 1):
        t = r / rows
        vc = v0 + (v1 - v0) * (t * (0.55 / max(v_mid, 0.1)) if t < 0.5 else v_mid + (1.0 - v_mid) * ((t - 0.5) * 2.0))
        vc = min(v1, max(v0, vc))
        center = _quad_bezier(p0, p1, p2, t)
        w = (1.0 - t) * ((1.0 - t) * w0 + t * w1) + t * ((1.0 - t) * w1 + t * w2)
        row = []
        for c in range(cols + 1):
            sc = (c / cols) * 2.0 - 1.0
            cup = 0.045 * w * (sc * sc) * math.sin(t * math.pi)
            pt = center + side_dir * (sc * w * 0.5) + up_hint * cup
            row.append((bm.verts.new(pt), (u0 + (u1 - u0) * (c / cols), vc)))
        grid.append(row)
    faces = []
    out_hint = Vector((p1.x, p1.y, max(0.6, abs(p2.z - p0.z) + 0.5)))
    for r in range(rows):
        for c in range(cols):
            v00, uv00 = grid[r][c]
            v10, uv10 = grid[r][c + 1]
            v11, uv11 = grid[r + 1][c + 1]
            v01, uv01 = grid[r + 1][c]
            vs = (v00, v10, v11, v01)
            uvs = (uv00, uv10, uv11, uv01)
            if len(set(vs)) == 4:
                n_est = (vs[1].co - vs[0].co).cross(vs[2].co - vs[1].co)
                if n_est.dot(out_hint) < 0:
                    vs = (vs[1], vs[0], vs[3], vs[2])
                    uvs = (uvs[1], uvs[0], uvs[3], uvs[2])
                f = bm.faces.new(vs)
                for loop, coord in zip(f.loops, uvs):
                    loop[uv].uv = coord
                faces.append(f)
    return faces


def leaf_spray_fan(
    bm,
    uv,
    attach_pt,
    forward_dir,
    length,
    width,
    u_range=(0.30, 1.0),
    v_range=(0.02, 0.98),
    roll=0.0,
    arch=0.14,
    cup=0.16,
    tip_scale=0.38,
):
    """3D V-cupped tapered leaf spray anchored directly to a branch node at `attach_pt`."""
    f = forward_dir.normalized()
    world_up = Vector((0.0, 0.0, 1.0)) if abs(f.z) < 0.92 else Vector((1.0, 0.0, 0.0))
    right = f.cross(world_up).normalized()
    up_perp = right.cross(f).normalized()
    side = (right * math.cos(roll) + up_perp * math.sin(roll)).normalized()
    cup_dir = (up_perp * math.cos(roll) - right * math.sin(roll)).normalized()

    p0 = attach_pt
    p1 = attach_pt + f * (length * 0.48) + cup_dir * (length * arch * 0.55)
    p2 = attach_pt + f * length + cup_dir * (length * arch)

    hw0 = width * 0.16
    hw1 = width * 0.50
    hw2 = width * (0.50 * tip_scale)

    u0, u1 = u_range
    v0, v1 = v_range
    rows = 5
    cols = 4
    grid = []
    for r in range(rows + 1):
        t = r / rows
        center = _quad_bezier(p0, p1, p2, t)
        hw = (1.0 - t) * ((1.0 - t) * hw0 + t * hw1) + t * ((1.0 - t) * hw1 + t * hw2)
        taper_u = 0.22 * (t ** 1.4)
        u_row0 = u0 + (u1 - u0) * taper_u
        u_row1 = u1 - (u1 - u0) * taper_u
        vc = v0 + (v1 - v0) * t
        row = []
        for c in range(cols + 1):
            sc = (c / cols) * 2.0 - 1.0
            cup_off = cup_dir * (width * cup * (abs(sc) ** 1.2) * math.sin(t * math.pi * 0.85))
            pt = center + side * (sc * hw) + cup_off
            uc = u_row0 + (u_row1 - u_row0) * (c / cols)
            row.append((bm.verts.new(pt), (uc, vc)))
        grid.append(row)

    faces = []
    for r in range(rows):
        for c in range(cols):
            v00, uv00 = grid[r][c]
            v10, uv10 = grid[r][c + 1]
            v11, uv11 = grid[r + 1][c + 1]
            v01, uv01 = grid[r + 1][c]
            vs = (v00, v10, v11, v01)
            if len(set(vs)) == 4:
                face = bm.faces.new(vs)
                for loop, coord in zip(face.loops, (uv00, uv10, uv11, uv01)):
                    loop[uv].uv = coord
                faces.append(face)
    return faces


def rock_chunk(bm, uv, center, radii, u_range=(0.0, 0.5), v_range=(0.0, 0.9), subdivisions=3, rng=None, dome=False):
    """Sculpted organic boulder or moss/cushion hummock with seam-free UV projection."""
    existing_verts = set(bm.verts)
    existing_faces = set(bm.faces)
    bmesh.ops.create_icosphere(bm, subdivisions=max(3, subdivisions + 1), radius=1.0)
    new_verts = [v for v in bm.verts if v not in existing_verts]
    new_faces = [f for f in bm.faces if f not in existing_faces]
    for f in new_faces:
        f.smooth = True
    rx, ry, rz = radii
    p1 = rng.uniform(0, 6.28) if rng else 0.7
    p2 = rng.uniform(0, 6.28) if rng else 1.9
    for v in new_verts:
        co = v.co.copy()
        warp = (
            0.14 * math.sin(co.x * 3.2 + p1) * math.cos(co.y * 2.8 + p2)
            + 0.10 * math.cos(co.z * 3.7 - p1)
            + 0.06 * math.sin(co.x * 6.4 - co.z * 5.2 + p2)
            + 0.035 * math.cos(co.y * 11.2 + co.z * 9.6 - p1)
        )
        if rng is not None:
            warp += rng.uniform(-0.025, 0.025)
        scale = 1.0 + (warp * 0.55 if dome else warp)
        co.x *= scale
        co.y *= scale
        co.z *= scale
        if co.z < -0.25:
            co.z = -0.25 + (co.z + 0.25) * 0.20
        v.co = Vector((center.x + co.x * rx, center.y + co.y * ry, center.z + co.z * rz))
    u0, u1 = u_range
    v0, v1 = v_range
    for f in new_faces:
        for loop in f.loops:
            rel = loop.vert.co - center
            nx = max(0.02, min(0.98, 0.5 + 0.42 * (rel.x / max(rx, 1e-4))))
            ny = max(0.02, min(0.98, 0.5 + 0.42 * (rel.y / max(ry, 1e-4)) * 0.6 + 0.35 * (rel.z / max(rz, 1e-4))))
            loop[uv].uv = (u0 + (u1 - u0) * nx, v0 + (v1 - v0) * ny)
    return new_faces


def mushroom_dome(bm, uv, center, radius, height, sides=14, u_range=(0.52, 0.98), v_range=(0.52, 0.98), tilt=Vector((0, 0, 1))):
    """Multi-ring 3D mushroom cap with flared rim and gill underside."""
    up = tilt.normalized()
    right = up.orthogonal().normalized()
    fwd = up.cross(right).normalized()
    sides = max(12, sides * 2)
    uc = 0.5 * (u_range[0] + u_range[1])
    vc = 0.5 * (v_range[0] + v_range[1])
    ru = 0.46 * (u_range[1] - u_range[0])
    rv = 0.46 * (v_range[1] - v_range[0])

    # 3 dome tiers + rim + gill underside
    tier_specs = ((0.98, 0.0), (0.76, 0.52), (0.42, 0.86))
    rings = []
    for r_mul, h_mul in tier_specs:
        row = []
        for k in range(sides):
            a = k * 2 * math.pi / sides
            rim_wave = 1.0 + 0.05 * math.sin(a * 5.0)
            pt = center + (right * math.cos(a) + fwd * math.sin(a)) * (radius * r_mul * rim_wave) + up * (height * h_mul)
            row.append((bm.verts.new(pt), a, r_mul))
        rings.append(row)
    top = bm.verts.new(center + up * height)
    under = bm.verts.new(center - up * (height * 0.24))
    faces = []
    for r_idx in range(len(rings) - 1):
        ra, rb = rings[r_idx], rings[r_idx + 1]
        for k in range(sides):
            kn = (k + 1) % sides
            f = bm.faces.new((ra[k][0], ra[kn][0], rb[kn][0], rb[k][0]))
            for loop, (vert, ang, rm) in zip(f.loops, (ra[k], ra[kn], rb[kn], rb[k])):
                loop[uv].uv = (uc + math.cos(ang) * ru * rm, vc + math.sin(ang) * rv * rm)
            faces.append(f)
    top_ring = rings[-1]
    rim_ring = rings[0]
    for k in range(sides):
        kn = (k + 1) % sides
        v_a, ang_a, rm_a = top_ring[k]
        v_b, ang_b, rm_b = top_ring[kn]
        f_top = bm.faces.new((v_a, v_b, top))
        for loop, coord in zip(f_top.loops, (
            (uc + math.cos(ang_a) * ru * rm_a, vc + math.sin(ang_a) * rv * rm_a),
            (uc + math.cos(ang_b) * ru * rm_b, vc + math.sin(ang_b) * rv * rm_b),
            (uc, vc),
        )):
            loop[uv].uv = coord
        f_bot = bm.faces.new((rim_ring[kn][0], rim_ring[k][0], under))
        for loop, coord in zip(f_bot.loops, (
            (uc + math.cos(ang_b) * ru * 0.5, v_range[0] * 0.5),
            (uc + math.cos(ang_a) * ru * 0.5, v_range[0] * 0.5),
            (uc, v_range[0] * 0.25),
        )):
            loop[uv].uv = coord
        faces.extend((f_top, f_bot))
    return faces


def finish_mesh(
    name,
    bm,
    materials,
    max_triangles=MAX_TRIANGLES,
    min_triangles=MIN_TRIANGLES,
    add_skirt=True,
    allow_extra_material=True,
):
    return finalize_understory_mesh(
        name,
        bm,
        materials,
        min_triangles=min_triangles,
        max_triangles=max_triangles,
        add_skirt=add_skirt,
        allow_extra_material=allow_extra_material,
    )


def place_and_export(name, mesh, out_path, tangents=True):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    obj = bpy.data.objects.new(f'{name}-mesh', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children:
        child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_tangents=tangents,
    )
    return root


def render_preview(root, path, distance, look_z=0.35):
    scene = bpy.context.scene
    for o in scene.objects:
        o.hide_render = not (o == root or o.parent == root or o.type in {'CAMERA', 'LIGHT'} or o.name == 'Ground')
    cam = scene.camera
    cam.location = Vector((distance, -distance, distance * 0.62))
    cam.rotation_euler = (Vector((0, 0, look_z)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def save_contact_sheet(preview_paths, out_path, cols=5):
    """Assemble rendered previews into a single contact sheet PNG."""
    imgs = []
    for p in preview_paths:
        if os.path.exists(p):
            img = bpy.data.images.load(p)
            w, h = img.size
            arr = np.array(img.pixels[:], dtype=np.float32).reshape((h, w, 4))
            imgs.append(np.flipud(arr))
            bpy.data.images.remove(img)
    if not imgs:
        return
    h, w, _ = imgs[0].shape
    rows = math.ceil(len(imgs) / cols)
    sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
    sheet[:, :, 3] = 1.0
    for idx, arr in enumerate(imgs):
        r, c = divmod(idx, cols)
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = arr
    save_image('understory_contact_sheet', sheet, out_path)


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 480, 360
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.36, 0.42, 0.46, 1.0)

    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.4
    sun.rotation_euler = (0.72, 0.22, 0.62)
    scene.collection.objects.link(sun)

    fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'SUN'))
    fill.data.energy = 1.1
    fill.rotation_euler = (0.95, -0.45, -2.1)
    scene.collection.objects.link(fill)

    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    scene.collection.objects.link(cam)
    scene.camera = cam

    ground = bpy.data.meshes.new('ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12)
    bm.to_mesh(ground)
    bm.free()
    g = bpy.data.objects.new('Ground', ground)
    gm = bpy.data.materials.new('ground_mat')
    gm.use_nodes = True
    bsdf = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.09, 0.085, 0.075, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.92
    ground.materials.append(gm)
    scene.collection.objects.link(g)
