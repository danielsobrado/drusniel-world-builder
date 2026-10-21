"""Grukmar swamp trees: gnarled, buttressed giants and dead snags.

Run headless:
  "F:\\Blender 5.2\\blender.exe" -b --factory-startup --python tools/blender/swamp_trees/build_swamp_trees.py -- [--no-render] [--only swamp-giant-01]

Writes one GLB per tree to assets/runtime-sources/trees/swamp/ (one bark mesh, one
leaf mesh, the two-material contract StylizedTreeView extracts) and preview
renders to tmp/swamp/blender/. Everything is seeded, so a rerun is identical.

The silhouette is the point (docs/plans/swamp-aaa-plan-2026-10-21.md §4): a fluted,
flaring bole on buttress roots, a twisting trunk that forks into a lattice of
bare branches, sparse dark leaf clusters at the tips and moss hanging off the
limbs.
"""
import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'runtime-sources', 'trees', 'swamp')
PREVIEW = os.path.join(ROOT, 'tmp', 'swamp', 'blender')
TEX = os.path.join(ROOT, 'tmp', 'swamp', 'textures')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER = '--no-render' not in argv
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None

# name, seed, kind, height, base radius, fork count, lean
TREES = [
    ('swamp-giant-01', 11, 'giant', 20.0, 1.45, 3, 0.10),
    ('swamp-giant-02', 23, 'giant', 23.0, 1.6, 2, 0.18),
    ('swamp-giant-03', 37, 'giant', 17.0, 1.2, 3, 0.28),
    ('swamp-snag-01', 53, 'snag', 11.0, 0.85, 2, 0.15),
]

# Leaf atlas regions (u ranges): leaves, bare twig sprays, hanging moss.
LEAF_U = (0.0, 0.4)
TWIG_U = (0.4, 0.7)
MOSS_U = (0.7, 1.0)


# ---------------------------------------------------------------- textures

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


def bark_texture():
    """Wet, stringy swamp bark: long vertical fissures, grey-brown plates and
    green-black algae streaks running down the grain. Tiles in both axes."""
    rng = np.random.default_rng(7)
    w = h = 512
    streak = fbm(w, h, (24, 2), rng, 4)  # long vertical grain
    plates = fbm(w, h, (10, 4), rng, 3)
    fissure = np.clip((np.abs(streak - 0.5) * 2) ** 0.6, 0, 1)
    algae = np.clip((fbm(w, h, (6, 3), rng, 4) - 0.45) * 3.5, 0, 1)
    base = np.stack([0.20, 0.17, 0.13])[None, None, :] * (0.65 + 0.5 * plates[..., None])
    deep = np.array([0.035, 0.032, 0.026])
    col = deep + (base - deep) * fissure[..., None]
    moss = np.array([0.12, 0.16, 0.07]) * (0.7 + 0.5 * plates[..., None])
    col = col * (1 - 0.65 * algae[..., None]) + moss * 0.65 * algae[..., None]
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], axis=2)
    return save_image('swamp_bark', rgba, os.path.join(TEX, 'swamp-bark.png'))


def leaf_atlas():
    """1024x512 RGBA in three regions (LEAF_U, TWIG_U, MOSS_U): a cluster of small
    dark olive leaves, a spray of bare forking twigs, and hanging moss strands."""
    rng = np.random.default_rng(19)
    w, h = 1024, 512
    rgba = np.zeros((h, w, 4))

    def region(u):
        return int(u[0] * w), int(u[1] * w)

    # Leaves
    x0, x1 = region(LEAF_U)
    rw = x1 - x0
    ys, xs = np.mgrid[0:h, 0:rw].astype(np.float32)
    sub = rgba[:, x0:x1]
    for _ in range(60):
        cx, cy = rng.uniform(40, rw - 40), rng.uniform(40, h - 40)
        if ((cx - rw / 2) / (rw / 2)) ** 2 + ((cy - h / 2) / (h / 2)) ** 2 > 0.8:
            continue
        ang = rng.uniform(0, math.pi)
        a, b = rng.uniform(24, 40), rng.uniform(9, 15)
        dx, dy = xs - cx, ys - cy
        u = dx * math.cos(ang) + dy * math.sin(ang)
        v = -dx * math.sin(ang) + dy * math.cos(ang)
        inside = (u / a) ** 2 + (v / (b * np.clip(1 - np.abs(u / a) ** 1.6, 0, 1) + 1e-3)) ** 2 < 1
        tone = np.array([0.27, 0.34, 0.13]) * rng.uniform(0.6, 1.05)
        shade = 0.85 + 0.25 * np.clip(u / a, -1, 1)
        sub[inside, :3] = tone[None, :] * shade[inside][:, None]
        sub[inside, 3] = 1

    def stroke(target, p0, p1, width, tone):
        n = int(max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1])) * 1.5) + 1
        for i in range(n + 1):
            t = i / n
            x, y = p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t
            half = width[0] + (width[1] - width[0]) * t
            for py in range(int(y - half - 1), int(y + half + 2)):
                for px in range(int(x - half - 1), int(x + half + 2)):
                    if 0 <= py < target.shape[0] and 0 <= px < target.shape[1]:
                        cover = min(1.0, max(0.0, half + 0.5 - math.hypot(px - x, py - y)))
                        if cover > target[py, px, 3]:
                            target[py, px, :3] = tone
                            target[py, px, 3] = cover

    # Twigs: a fan of forking dark sticks rising from the bottom centre.
    x0, x1 = region(TWIG_U)
    twigs = rgba[:, x0:x1]
    tw = x1 - x0

    def twig(p, ang, length, width, depth):
        end = (p[0] + math.cos(ang) * length, p[1] - math.sin(ang) * length)
        stroke(twigs, p, end, (width, width * 0.6), np.array([0.07, 0.06, 0.05]) * rng.uniform(0.8, 1.2))
        if depth < 4:
            for _ in range(2 if depth < 3 else 3):
                twig(end, ang + rng.uniform(-0.75, 0.75), length * rng.uniform(0.55, 0.75), max(0.6, width * 0.65), depth + 1)

    for _ in range(3):
        twig((tw / 2 + rng.uniform(-20, 20), h - 4), math.pi / 2 + rng.uniform(-0.45, 0.45), h * 0.32, 3.2, 0)

    # Moss: thin wavy strands tapering downward from the top edge.
    x0, x1 = region(MOSS_U)
    moss = rgba[:, x0:x1]
    mw = x1 - x0
    # Clumped, with clear gaps: at a distance the mip chain averages coverage, and
    # an even curtain of strands would cross the alpha cutoff as a solid sheet.
    clumps = [rng.uniform(14, mw / 2 - 14) for _ in range(3)] + [rng.uniform(mw / 2 + 14, mw - 14) for _ in range(3)]
    for k in range(48):
        xs0 = clumps[k % len(clumps)] + rng.normal(0, 4)
        length = rng.uniform(0.3, 0.95) * h
        phase, freq, amp = rng.uniform(0, 6.28), rng.uniform(0.01, 0.03), rng.uniform(2, 7)
        width = rng.uniform(1.2, 2.4)
        tone = np.array([0.47, 0.51, 0.37]) * rng.uniform(0.7, 1.1)
        for y in range(int(length)):
            t = y / length
            x = xs0 + amp * math.sin(phase + y * freq)
            half = width * (1 - 0.7 * t)
            for px in range(int(max(0, x - half - 1)), int(min(mw - 1, x + half + 1)) + 1):
                cover = min(1.0, max(0.0, half + 0.5 - abs(px - x)))
                if cover > moss[y, px, 3]:
                    moss[y, px, :3] = tone * (1 - t * 0.3)
                    moss[y, px, 3] = cover
    return save_image('swamp_leaves', rgba, os.path.join(TEX, 'swamp-leaves.png'))


# ---------------------------------------------------------------- skeleton

class Branch:
    def __init__(self, points, radii, depth):
        self.points, self.radii, self.depth = points, radii, depth


def jitter(rng, scale):
    return Vector((rng.gauss(0, scale), rng.gauss(0, scale), rng.gauss(0, scale)))


def perpendicular(direction):
    other = Vector((0, 0, 1)) if abs(direction.z) < 0.9 else Vector((1, 0, 0))
    return direction.cross(other).normalized()


def grow(rng, start, direction, length, radius, depth, spec, out, tip_radius=None):
    seg = max(0.35, min(1.4, length / 9))
    steps = max(3, int(length / seg))
    points, radii = [start.copy()], [radius]
    pos, d = start.copy(), direction.normalized()
    end_radius = tip_radius if tip_radius is not None else radius * spec['taper']
    for i in range(1, steps + 1):
        t = i / steps
        up = Vector((0, 0, 1)) * spec['phototropism'][min(depth, 4)]
        droop = Vector((0, 0, -1)) * spec['droop'] * t * (depth >= 2)
        d = (d + jitter(rng, spec['gnarl'][min(depth, 4)]) + up * seg * 0.1 + droop * 0.1).normalized()
        pos = pos + d * seg
        points.append(pos.copy())
        radii.append(radius + (end_radius - radius) * t ** 0.8)
    branch = Branch(points, radii, depth)
    out.append(branch)
    if depth >= spec['max_depth'] or radius < spec['min_radius']:
        return branch
    count = spec['children'][min(depth, 4)]
    golden = rng.uniform(0, 6.28)
    for k in range(count):
        t = rng.uniform(spec['child_start'][min(depth, 4)], 0.97)
        index = min(len(points) - 1, max(1, int(t * (len(points) - 1))))
        parent_dir = (points[index] - points[index - 1]).normalized()
        side = perpendicular(parent_dir)
        golden += 2.39996
        side.rotate(Matrix.Rotation(golden, 3, parent_dir))
        angle = math.radians(rng.uniform(*spec['angle'][min(depth, 4)]))
        child_dir = (parent_dir * math.cos(angle) + side * math.sin(angle)).normalized()
        child_len = length * rng.uniform(*spec['ratio']) * (1.15 - 0.4 * t)
        child_radius = radii[index] * rng.uniform(0.45, 0.7)
        if child_radius < spec['min_radius'] * 0.6:
            continue
        grow(rng, points[index], child_dir, child_len, child_radius, depth + 1, spec, out)
    return branch


def build_skeleton(seed, kind, height, base_radius, forks, lean):
    rng = random.Random(seed)
    spec = {
        'taper': 0.62, 'max_depth': 4 if kind == 'giant' else 3, 'min_radius': 0.035,
        'phototropism': [0.35, 0.25, 0.12, 0.05, 0.02],
        'gnarl': [0.05, 0.12, 0.18, 0.22, 0.25], 'droop': 0.35,
        'children': [0, 4, 3, 3, 0] if kind == 'giant' else [0, 2, 3, 2, 0],
        'child_start': [0.5, 0.25, 0.2, 0.15, 0.1],
        'angle': [(20, 35), (35, 60), (35, 70), (30, 70), (25, 60)],
        'ratio': (0.45, 0.72),
    }
    branches = []
    bole_height = height * (0.48 if kind == 'giant' else 0.75)
    heading = rng.uniform(0, 6.28)
    lean_dir = Vector((math.cos(heading), math.sin(heading), 0))
    # The bole: an S-bent, slowly twisting trunk.
    steps = 14
    points, radii = [], []
    bend_phase = rng.uniform(0, 6.28)
    for i in range(steps + 1):
        t = i / steps
        z = t * bole_height
        offset = lean_dir * (lean * z) + Vector((math.sin(bend_phase + t * 3.1), math.cos(bend_phase * 1.3 + t * 2.4), 0)) * 0.45 * t
        points.append(Vector((offset.x, offset.y, z)))
        radii.append(base_radius * (1 - 0.45 * t))
    branches.append(Branch(points, radii, 0))
    top = points[-1]
    top_dir = (points[-1] - points[-2]).normalized()
    if kind == 'snag':
        # Broken off: a jagged stub, a couple of dead limbs.
        for k in range(forks):
            ang = heading + k * math.pi + rng.uniform(-0.6, 0.6)
            d = (top_dir * 0.6 + Vector((math.cos(ang), math.sin(ang), 0)) * 0.8).normalized()
            grow(rng, points[int(steps * rng.uniform(0.55, 0.9))], d, height * rng.uniform(0.3, 0.45), radii[-1] * 0.5, 1, spec, branches)
    else:
        for k in range(forks):
            ang = heading + k * 6.28 / forks + rng.uniform(-0.4, 0.4)
            d = (top_dir * 1.0 + Vector((math.cos(ang), math.sin(ang), 0)) * rng.uniform(0.45, 0.8)).normalized()
            grow(rng, top, d, (height - bole_height) * rng.uniform(0.75, 0.95), radii[-1] * rng.uniform(0.62, 0.78), 1, spec, branches)
        # Low side limbs and dead stubs along the bole.
        for k in range(rng.randint(2, 4)):
            t = rng.uniform(0.45, 0.9)
            i = int(t * steps)
            ang = rng.uniform(0, 6.28)
            d = Vector((math.cos(ang), math.sin(ang), rng.uniform(0.1, 0.5))).normalized()
            grow(rng, points[i], d, height * rng.uniform(0.18, 0.32), radii[i] * rng.uniform(0.25, 0.4), 2, spec, branches)
    # Buttress roots: from the bole's foot outward and down into the mud.
    roots = []
    for k in range(rng.randint(5, 7)):
        ang = heading + k * 6.28 / 6 + rng.uniform(-0.3, 0.3)
        out_dir = Vector((math.cos(ang), math.sin(ang), 0))
        # Low, thick flanges that start inside the bole and sink into the mud:
        # a flared foot, not legs.
        reach = base_radius * rng.uniform(2.0, 2.9)
        start_h = base_radius * rng.uniform(1.0, 1.5)
        pts, rr = [], []
        for i in range(9):
            t = i / 8
            r_out = base_radius * 0.25 + reach * t
            z = start_h * (1 - t) ** 1.4 - 0.3 * t
            p = out_dir * r_out + Vector((0, 0, z)) + jitter(rng, 0.04) * t
            pts.append(p)
            rr.append(base_radius * 0.52 * (1 - 0.72 * t))
        roots.append(Branch(pts, rr, 0))
    return branches, roots


def fluted_radius(base_radius, z, theta, phase):
    """Wider at the foot (flare) and fluted into lobes low down."""
    flare = 1 + 0.75 * math.exp(-max(z, 0) / (0.9 * base_radius + 0.3))
    flute = 1 + 0.16 * math.exp(-max(z, 0) / 4.0) * math.sin(5 * theta + phase)
    return flare * flute


# ---------------------------------------------------------------- mesh

def tube_mesh(bm, uv_layer, branch, base_radius=None, phase=0.0, is_bole=False):
    pts, radii = branch.points, branch.radii
    r0 = radii[0]
    sides = 14 if r0 > 0.5 else 8 if r0 > 0.2 else 5 if r0 > 0.08 else 3
    rings = []
    normal = perpendicular((pts[1] - pts[0]).normalized())
    length_acc = 0.0
    circumference = 2 * math.pi * max(r0, 0.05)
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        normal = (normal - d * normal.dot(d)).normalized()
        binormal = d.cross(normal)
        if i > 0:
            length_acc += (pts[i] - pts[i - 1]).length
        ring = []
        for s in range(sides + 1):
            theta = s / sides * 2 * math.pi
            r = radii[i]
            if is_bole:
                r *= fluted_radius(base_radius, p.z, theta, phase)
            offset = normal * math.cos(theta) * r + binormal * math.sin(theta) * r
            ring.append((bm.verts.new(p + offset), (s / sides, length_acc / circumference)))
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for s in range(sides):
            face = bm.faces.new((a[s][0], a[s + 1][0], b[s + 1][0], b[s][0]))
            for loop, (_, uv) in zip(face.loops, (a[s], a[s + 1], b[s + 1], b[s])):
                loop[uv_layer].uv = uv
    # cap the tip so the end of a broken or fine branch is never open
    tip = rings[-1]
    centre = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1] * 0.5)
    for s in range(sides):
        face = bm.faces.new((tip[s][0], tip[s + 1][0], centre))
        for loop, uv in zip(face.loops, (tip[s][1], tip[s + 1][1], (tip[s][1][0], tip[s][1][1] + 0.1))):
            loop[uv_layer].uv = uv


def card(bm, uv_layer, corners, uvs):
    verts = [bm.verts.new(c) for c in corners]
    face = bm.faces.new(verts)
    for loop, uv in zip(face.loops, uvs):
        loop[uv_layer].uv = uv


def card_uv(u_range, v0=0.0, v1=1.0):
    return [(u_range[0], v0), (u_range[1], v0), (u_range[1], v1), (u_range[0], v1)]


def oriented_card(bm, uv_layer, base, direction, width, length, uvs, roll):
    """A quad rising from `base` along `direction`, turned `roll` about it."""
    side = perpendicular(direction)
    side.rotate(Matrix.Rotation(roll, 3, direction))
    side *= width / 2
    tip = base + direction * length
    card(bm, uv_layer, [base - side, base + side, tip + side, tip - side], uvs)


def foliage(bm, uv_layer, branches, seed, kind):
    rng = random.Random(seed * 7 + 1)
    for b in branches:
        tip, prev = b.points[-1], b.points[-2]
        d = (tip - prev).normalized()
        # Twig sprays carry the fine lattice the mesh cannot afford: a crossed
        # pair at the end of every fine branch, continuing its direction.
        if b.depth >= (2 if kind == 'snag' else 3):
            size = rng.uniform(1.6, 2.6) * (0.6 if kind == 'snag' else 1)
            roll = rng.uniform(0, 3.14)
            for twist in (0.0, math.pi / 2):
                oriented_card(bm, uv_layer, tip - d * 0.15, d, size, size * 1.1, card_uv(TWIG_U), roll + twist)
        # Sparse leaf clusters on the giants only: the crown stays see-through.
        if kind == 'giant' and b.depth >= 3 and rng.random() < 0.3:
            size = rng.uniform(0.8, 1.3)
            n = jitter(rng, 1).normalized()
            u = perpendicular(n) * size
            v = n.cross(u).normalized() * size * 1.25
            c = tip + d * 0.6 + jitter(rng, 0.3)
            card(bm, uv_layer, [c - u - v, c + u - v, c + u + v, c - u + v], card_uv(LEAF_U))
        # Hanging moss from the middle of near-horizontal limbs.
        if 1 <= b.depth <= 3 and abs(d.z) < 0.65 and rng.random() < (0.75 if kind == 'giant' else 0.9):
            for _ in range(rng.randint(1, 3)):
                p = b.points[rng.randint(len(b.points) // 3, len(b.points) - 1)]
                length = rng.uniform(1.2, 3.4)
                width = rng.uniform(0.35, 0.7)
                yaw = rng.uniform(0, 3.14)
                span = (MOSS_U[1] - MOSS_U[0]) / 2
                u0 = MOSS_U[0] + rng.choice([0.0, span])
                for twist in (0.0, math.pi / 2):
                    side = Vector((math.cos(yaw + twist), math.sin(yaw + twist), 0)) * width / 2
                    uvs = [(u0, 1.0), (u0 + span, 1.0), (u0 + span, 1 - length / 3.6), (u0, 1 - length / 3.6)]
                    top = p + Vector((0, 0, 0.05))
                    card(bm, uv_layer, [top - side, top + side, top + side - Vector((0, 0, length)),
                                        top - side - Vector((0, 0, length))], uvs)


def paint_cards(mesh, seed):
    """A per-card tint around white. The runtime keeps a vertex-coloured crown's
    own colours instead of re-grading it onto the shared green canopy ramp, so
    the moss stays grey-green and the leaves olive."""
    rng = random.Random(seed * 11 + 3)
    attribute = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly in mesh.polygons:
        shade = rng.uniform(0.82, 1.08)
        tint = (shade, shade * rng.uniform(0.97, 1.03), shade * rng.uniform(0.94, 1.0), 1.0)
        for loop in poly.loop_indices:
            attribute.data[loop].color = tint
    mesh.color_attributes.active_color = attribute


def material(name, image, alpha, color=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    if image is None:
        # The runtime synthesises the bark (barkProfile: swamp) and mixes it with
        # this flat base colour, so the GLB carries a colour, not a texture.
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        bsdf.inputs['Roughness'].default_value = 0.75
        return mat
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    if alpha:
        mat.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        try:
            mat.blend_method = 'CLIP'
        except Exception:
            pass
        mat.use_backface_culling = False
    return mat


def build_tree(name, seed, kind, height, base_radius, forks, lean, bark_mat, leaf_mat):
    branches, roots = build_skeleton(seed, kind, height, base_radius, forks, lean)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    phase = random.Random(seed).uniform(0, 6.28)
    for b in branches:
        tube_mesh(bm, uv, b, base_radius, phase, is_bole=(b.depth == 0))
    for r in roots:
        tube_mesh(bm, uv, r)
    trunk_mesh = bpy.data.meshes.new(f'{name}-bark')
    bm.to_mesh(trunk_mesh)
    bm.free()
    trunk_mesh.materials.append(bark_mat)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    foliage(bm, uv, branches, seed, kind)
    leaf_mesh = bpy.data.meshes.new(f'{name}-leaves')
    bm.to_mesh(leaf_mesh)
    bm.free()
    leaf_mesh.materials.append(leaf_mat)
    paint_cards(leaf_mesh, seed)
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for mesh, label in ((trunk_mesh, 'Bark'), (leaf_mesh, 'Leaves')):
        obj = bpy.data.objects.new(f'{name}-{label}', mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = root
        for poly in mesh.polygons:
            poly.use_smooth = label == 'Bark'
    tris = sum(len(p.vertices) - 2 for p in trunk_mesh.polygons) + sum(len(p.vertices) - 2 for p in leaf_mesh.polygons)
    print(f'{name}: bark {len(trunk_mesh.polygons)} faces, leaves {len(leaf_mesh.polygons)} cards, ~{tris} tris')
    return root


def export(root, path):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children:
        child.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_image_format='AUTO',
                              export_vertex_color='ACTIVE')


def render_preview(root, path):
    scene = bpy.context.scene
    for o in scene.objects:
        o.hide_render = not (o == root or o.parent == root or o.type in {'CAMERA', 'LIGHT'})
    cam = scene.camera
    height = max((child.matrix_world @ Vector(c)).z for child in root.children for c in child.bound_box)
    cam.location = Vector((height * 0.95, -height * 0.95, height * 0.4))
    direction = Vector((0, 0, height * 0.47)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 640, 800
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.4, 0.4, 1)
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3
    sun.rotation_euler = (0.7, 0.2, 0.6)
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    cam.data.lens = 35
    scene.collection.objects.link(cam)
    scene.camera = cam
    ground = bpy.data.meshes.new('ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
    bm.to_mesh(ground)
    bm.free()
    g = bpy.data.objects.new('Ground', ground)
    gm = bpy.data.materials.new('mud')
    gm.use_nodes = True
    next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.05, 0.06, 0.04, 1)
    ground.materials.append(gm)
    scene.collection.objects.link(g)


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TEX, exist_ok=True)
    os.makedirs(PREVIEW, exist_ok=True)
    setup_scene()
    bark = material('Swamp bark', None, alpha=False, color=(0.045, 0.047, 0.034))
    leaves = material('Swamp leaves', leaf_atlas(), alpha=True)
    for spec in TREES:
        if ONLY and spec[0] != ONLY:
            continue
        root = build_tree(*spec, bark, leaves)
        export(root, os.path.join(OUT, f'{spec[0]}.glb'))
        if RENDER:
            render_preview(root, os.path.join(PREVIEW, f'{spec[0]}.png'))
        for child in list(root.children):
            bpy.data.objects.remove(child)
        bpy.data.objects.remove(root)


main()
