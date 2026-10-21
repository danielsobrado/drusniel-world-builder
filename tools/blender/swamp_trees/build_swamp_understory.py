"""Grukmar bog understory: fern, fallen mossy log, broken stump, cypress knees.

Run headless:
  "F:\\Blender 5.2\\blender.exe" -b --factory-startup --python tools/blender/swamp_trees/build_swamp_understory.py -- [--no-render]

Writes one GLB per prop to assets/runtime-sources/ground/swamp/ for the
groundDetails layer (each under its 350-triangle budget, one root node named as
the prop for `prototypeGroups`) and previews to tmp/swamp/blender/. Seeded, so a
rerun is identical.
"""
import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'runtime-sources', 'ground', 'swamp')
PREVIEW = os.path.join(ROOT, 'tmp', 'swamp', 'blender')
TEX = os.path.join(ROOT, 'tmp', 'swamp', 'textures')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER = '--no-render' not in argv
MAX_TRIANGLES = 350


def save_image(name, pixels, path):
    h, w, _ = pixels.shape
    image = bpy.data.images.new(name, w, h, alpha=True)
    image.pixels.foreach_set(np.flipud(pixels).astype(np.float32).ravel())
    image.filepath_raw = path
    image.file_format = 'PNG'
    image.save()
    return image


def value_noise(w, h, cells, rng):
    grid = rng.random((cells[1] + 1, cells[0] + 1))
    grid[:, -1] = grid[:, 0]
    grid[-1, :] = grid[0, :]
    ys, xs = np.mgrid[0:h, 0:w]
    gx, gy = xs / w * cells[0], ys / h * cells[1]
    x0, y0 = np.floor(gx).astype(int), np.floor(gy).astype(int)
    fx, fy = gx - x0, gy - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = grid[y0, x0], grid[y0, x0 + 1]
    c, d = grid[y0 + 1, x0], grid[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(w, h, cells, rng, octaves=4):
    total, amp, norm = np.zeros((h, w)), 1.0, 0.0
    for o in range(octaves):
        total += amp * value_noise(w, h, (cells[0] * 2 ** o, cells[1] * 2 ** o), rng)
        norm += amp
        amp *= 0.5
    return total / norm


def wood_texture():
    """Rotten wood wrapping a log or stump: u runs around it, v along it. The
    band u in [0.2, 0.8] faces up on a fallen log and wears a thick moss coat;
    the rest is wet, dark, stringy bark. The cut rings sit at v > 0.9."""
    rng = np.random.default_rng(31)
    w = h = 256
    grain = fbm(w, h, (2, 18), rng, 4).T
    fissure = np.clip((np.abs(grain - 0.5) * 2) ** 0.55, 0, 1)
    bark = np.array([0.03, 0.03, 0.022]) + np.array([0.13, 0.115, 0.085]) * fissure[..., None]
    moss_noise = fbm(w, h, (6, 6), rng, 4)
    u = np.linspace(0, 1, w)[None, :].repeat(h, 0)
    band = np.clip(1 - np.abs(u - 0.5) / 0.32, 0, 1)
    moss = np.clip(band * 1.4 + (moss_noise - 0.5) * 1.2 - 0.25, 0, 1)
    moss_col = np.array([0.16, 0.22, 0.07]) * (0.75 + 0.5 * moss_noise[..., None])
    col = bark * (1 - moss[..., None]) + moss_col * moss[..., None]
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], axis=2)
    return save_image('swamp_wood', rgba, os.path.join(TEX, 'swamp-wood.png'))


def fern_texture():
    """A single fern frond, base at the bottom edge: a midrib with paired,
    tapering pinnae. Alpha-cut."""
    w, h = 128, 512
    rgba = np.zeros((h, w, 4))
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    t = 1 - ys / h  # 0 base .. 1 tip
    cx = w / 2 + 6 * np.sin(t * 2.4)
    rib = np.abs(xs - cx) < 1.6 + (1 - t) * 1.5
    rgba[rib] = (0.12, 0.17, 0.06, 1)
    pinnae = 34
    for k in range(pinnae):
        tk = 0.08 + k / pinnae * 0.9
        y0 = h * (1 - tk)
        length = (w / 2 - 6) * math.sin(math.pi * min(1, tk * 1.15)) * (1 - tk * 0.35)
        for side in (-1, 1):
            # each pinna: a slim leaf angled up toward the tip
            for s in np.linspace(0, 1, 40):
                px = w / 2 + 6 * math.sin(tk * 2.4) + side * s * length
                py = y0 - s * length * 0.35
                half = 4.5 * (1 - s) ** 0.6 + 0.6
                yy0, yy1 = int(max(0, py - half)), int(min(h - 1, py + half))
                x = int(px)
                if 0 <= x < w:
                    shade = 0.75 + 0.35 * s
                    rgba[yy0:yy1 + 1, x] = (0.15 * shade, 0.24 * shade, 0.08 * shade, 1)
    return save_image('swamp_fern', rgba, os.path.join(TEX, 'swamp-fern.png'))


def material(name, image, alpha=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8
    if alpha:
        # A greater-than node on alpha is what the glTF exporter reads as MASK.
        compare = nodes.new('ShaderNodeMath')
        compare.operation = 'GREATER_THAN'
        compare.inputs[1].default_value = 0.4
        mat.node_tree.links.new(tex.outputs['Alpha'], compare.inputs[0])
        mat.node_tree.links.new(compare.outputs[0], bsdf.inputs['Alpha'])
        mat.use_backface_culling = False
    return mat


def tube(bm, uv, points, radii, sides, u_range=(0.0, 1.0), cap_end=True, rough=0.0, rng=None):
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
        for s in range(sides + 1):
            a = s / sides * 2 * math.pi
            r = radii[i] * (1 + (rng.uniform(-rough, rough) if rng and s < sides else 0))
            v = bm.verts.new(p + normal * math.cos(a) * r + binormal * math.sin(a) * r)
            ring.append((v, (u_range[0] + (u_range[1] - u_range[0]) * s / sides, 0.9 * length / max(total, 1e-6))))
        if rough and rng:
            ring[-1] = (ring[0][0], ring[-1][1])
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for s in range(sides):
            f = bm.faces.new((a[s][0], a[s + 1][0], b[s + 1][0], b[s][0]))
            for loop, (_, coord) in zip(f.loops, (a[s], a[s + 1], b[s + 1], b[s])):
                loop[uv].uv = coord
    if cap_end:
        tip = rings[-1]
        centre = bm.verts.new(points[-1])
        for s in range(sides):
            f = bm.faces.new((tip[s][0], tip[s + 1][0], centre))
            # the cut face shows the ring texture region
            for loop, coord in zip(f.loops, ((0.5 + 0.4 * math.cos(s), 0.95), (0.5, 0.97), (0.5, 0.99))):
                loop[uv].uv = coord
    return rings


def finish(name, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    for p in mesh.polygons:
        p.use_smooth = True
    tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    return mesh, tris


def build_log(wood):
    rng = random.Random(5)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    length = 5.2
    pts, radii = [], []
    for i in range(7):
        t = i / 6
        pts.append(Vector((t * length - length / 2, 0.08 * math.sin(t * 5), 0.32 - 0.12 * t + 0.04 * math.sin(t * 7))))
        radii.append(0.38 * (1 - 0.3 * t))
    tube(bm, uv, pts, radii, 9, u_range=(0.0, 1.0), rough=0.08, rng=rng)
    # Two snapped branch stubs.
    for t, ang in ((0.35, 1.0), (0.7, -1.2)):
        base = pts[0].lerp(pts[-1], t) + Vector((0, 0, 0.18))
        d = Vector((0.3, math.cos(ang), math.sin(ang) * 0.6 + 0.5)).normalized()
        tube(bm, uv, [base, base + d * 0.5, base + d * 0.9], [0.09, 0.07, 0.05], 5, rough=0.05, rng=rng)
    return finish('swamp-log-01', bm, wood)


def build_stump(wood):
    rng = random.Random(9)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    pts = [Vector((0, 0, -0.15)), Vector((0, 0, 0.35)), Vector((0.03, 0.02, 0.9)), Vector((0.05, 0.03, 1.35))]
    radii = [0.78, 0.55, 0.45, 0.42]
    rings = tube(bm, uv, pts, radii, 11, u_range=(0.0, 1.0), cap_end=False, rough=0.1, rng=rng)
    # Jagged broken top: a fan to a low centre with the rim pulled up and down.
    top = rings[-1]
    for i, (v, _) in enumerate(top[:-1]):
        v.co.z += rng.uniform(-0.25, 0.45)
    centre = bm.verts.new(pts[-1] - Vector((0, 0, 0.15)))
    for s in range(len(top) - 1):
        f = bm.faces.new((top[s][0], top[s + 1][0], centre))
        for loop, coord in zip(f.loops, ((0.4, 0.93), (0.6, 0.93), (0.5, 0.99))):
            loop[uv].uv = coord
    # Short buttress flanges at the foot.
    for k in range(4):
        a = k * 1.57 + rng.uniform(-0.3, 0.3)
        o = Vector((math.cos(a), math.sin(a), 0))
        tube(bm, uv, [o * 0.3 + Vector((0, 0, 0.5)), o * 0.75 + Vector((0, 0, 0.15)), o * 1.15 + Vector((0, 0, -0.12))],
             [0.24, 0.16, 0.08], 5, rough=0.05, rng=rng)
    return finish('swamp-stump-01', bm, wood)


def build_knees(wood):
    """Cypress knees: blunt woody cones standing out of the mud and shallows."""
    rng = random.Random(13)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    for k in range(6):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(0.2, 1.6)
        base = Vector((math.cos(a) * r, math.sin(a) * r, -0.1))
        height = rng.uniform(0.35, 0.95)
        lean = Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 1)).normalized()
        w = rng.uniform(0.13, 0.22)
        tube(bm, uv, [base, base + lean * height * 0.55, base + lean * height],
             [w, w * 0.7, w * 0.35], 6, rough=0.08, rng=rng)
    return finish('swamp-knees-01', bm, wood)


def build_fern(fern):
    """Arching fronds as bent two-segment cards around a crown."""
    rng = random.Random(17)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    fronds = 9
    for k in range(fronds):
        yaw = k / fronds * 2 * math.pi + rng.uniform(-0.25, 0.25)
        length = rng.uniform(0.75, 1.1)
        width = length * 0.32
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0)) * width / 2
        # rise, then arch over: three spine points
        p0 = Vector((0, 0, 0.02))
        p1 = out * length * 0.45 + Vector((0, 0, length * 0.55))
        p2 = out * length * 0.95 + Vector((0, 0, length * 0.25))
        verts = [bm.verts.new(c) for c in (p0 - side * 0.3, p0 + side * 0.3, p1 + side, p1 - side, p2 + side * 0.4, p2 - side * 0.4)]
        for quad, vs in (((0.0, 0.0), (1.0, 0.0), (1.0, 0.55), (0.0, 0.55)), (verts[0], verts[1], verts[2], verts[3])), \
                         (((0.0, 0.55), (1.0, 0.55), (1.0, 1.0), (0.0, 1.0)), (verts[3], verts[2], verts[4], verts[5])):
            f = bm.faces.new(vs)
            for loop, coord in zip(f.loops, quad):
                loop[uv].uv = coord
    return finish('swamp-fern-01', bm, fern)


def place(name, mesh):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    obj = bpy.data.objects.new(f'{name}-mesh', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    return root


def export(root, path):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children:
        child.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)


def render(root, path, distance):
    scene = bpy.context.scene
    for o in scene.objects:
        o.hide_render = not (o == root or o.parent == root or o.type in {'CAMERA', 'LIGHT'} or o.name == 'Ground')
    cam = scene.camera
    cam.location = Vector((distance, -distance, distance * 0.6))
    cam.rotation_euler = (Vector((0, 0, 0.3)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


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
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.4, 0.4, 1)
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3
    sun.rotation_euler = (0.7, 0.2, 0.6)
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    ground = bpy.data.meshes.new('ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=10)
    bm.to_mesh(ground)
    bm.free()
    g = bpy.data.objects.new('Ground', ground)
    gm = bpy.data.materials.new('mud')
    gm.use_nodes = True
    next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.04, 0.045, 0.03, 1)
    ground.materials.append(gm)
    scene.collection.objects.link(g)


def main():
    for d in (OUT, PREVIEW, TEX):
        os.makedirs(d, exist_ok=True)
    setup_scene()
    wood = material('Swamp wood', wood_texture())
    fern = material('Swamp fern', fern_texture(), alpha=True)
    for build, mat, distance in ((build_log, wood, 5), (build_stump, wood, 3.5), (build_knees, wood, 3.5), (build_fern, fern, 2.2)):
        mesh, tris = build(mat)
        name = mesh.name
        assert tris <= MAX_TRIANGLES, f'{name} has {tris} triangles, over {MAX_TRIANGLES}'
        print(f'{name}: {tris} tris')
        root = place(name, mesh)
        export(root, os.path.join(OUT, f'{name}.glb'))
        if RENDER:
            render(root, os.path.join(PREVIEW, f'{name}.png'), distance)


main()
