"""Street props: lamps, barrels, crates, well, market stalls, cart, banner, sign,
flower boxes and woodpile. Origins sit on the ground at the prop's footprint
centre, except wall-mounted props whose origin is the wall attachment point.
"""
import math

import bpy
from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder
from .street_props import (banner, brazier, flower_box, lamp_post, market_stall, notice_board,
                           signpost, town_cross, wall_lantern, wayside_shrine)

R90Y = Matrix.Rotation(math.pi / 2, 4, 'Y')


def barrel():
    b = MeshBuilder()
    prof = [(0.0, 0.0), (0.26, 0.0), (0.31, 0.22), (0.33, 0.45), (0.31, 0.68), (0.26, 0.9),
            (0.0, 0.9)]
    b.lathe(prof, 12, 'planks')
    for z, r in ((0.1, 0.295), (0.78, 0.29)):
        b.lathe([(r, z), (r, z + 0.07)], 12, 'iron')
    return b


def crate(s=0.7):
    b = MeshBuilder()
    h = s / 2
    b.box((-h, -h, 0), (h, h, s), 'planks', skip=('-z',))
    e = 0.06
    for x in (-h - 0.01, h - e + 0.01):
        for y in (-h - 0.01, h - e + 0.01):
            b.box((x, y, 0), (x + e, y + e, s), 'timber')
    for z in (0.0, s - e):
        b.box((-h - 0.01, -h - 0.01, z), (h + 0.01, -h + 0.01, z + e), 'timber')
        b.box((-h - 0.01, h - 0.01, z), (h + 0.01, h + 0.01, z + e), 'timber')
    return b


def well():
    b = MeshBuilder()
    b.lathe([(1.0, 0.0), (1.0, 0.8), (0.75, 0.8), (0.75, 0.1)], 16, 'stone', smooth=False)
    b.lathe([(0.75, 0.45), (0.0, 0.45)], 16, 'water')
    for x in (-0.95, 0.85):
        b.box((x, -0.08, 0.8), (x + 0.1, 0.08, 2.35), 'timber')
    b.beam((-0.95, 0, 1.95), (0.95, 0, 1.95), (0, 1, 0), (-0.05, 0.05), 0.1, 'timber')
    mats = {'+z': 'roof', '-z': 'planks'}
    b.beam((-1.3, 0, 2.15), (0.05, 0, 3.0), (0, 1, 0), (-0.75, 0.75), 0.1, 'timber', mats=mats)
    b.beam((-0.05, 0, 3.0), (1.3, 0, 2.15), (0, 1, 0), (-0.75, 0.75), 0.1, 'timber', mats=mats)
    b.lathe([(0.0, 1.35), (0.14, 1.35), (0.16, 1.65), (0.0, 1.65)], 8, 'planks')
    return b


def cart():
    b = MeshBuilder()
    b.box((-0.6, -1.0, 0.5), (0.6, 0.8, 0.62), 'planks')
    for x0, x1 in ((-0.6, -0.54), (0.54, 0.6)):
        b.box((x0, -1.0, 0.62), (x1, 0.8, 0.95), 'planks')
    b.box((-0.6, 0.74, 0.62), (0.6, 0.8, 0.95), 'planks')
    wheel = [(0.0, -0.05), (0.45, -0.05), (0.45, 0.05), (0.0, 0.05)]
    for x in (-0.68, 0.68):
        b.lathe(wheel, 12, 'timber', m=Matrix.Translation((x, -0.1, 0.45)) @ R90Y, smooth=False)
    b.box((-0.66, -0.14, 0.41), (0.66, -0.06, 0.49), 'iron')
    for x in (-0.45, 0.35):
        b.beam((x, -1.0, 0.55), (x, -2.0, 0.4), (1, 0, 0), (0.0, 0.08), 0.08, 'timber')
    b.blob((0, -0.1, 0.95), 0.55, 'cloth_cream', subdiv=1, squash=(0.9, 1.4, 0.45), seed=3)
    return b


def woodpile():
    b = MeshBuilder()
    log = [(0.0, -0.6), (0.12, -0.6), (0.12, 0.6), (0.0, 0.6)]
    for row, count in enumerate((4, 3, 2)):
        for i in range(count):
            x = (i - (count - 1) / 2) * 0.25
            m = Matrix.Translation((x, 0, 0.12 + row * 0.21)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
            b.lathe(log, 7, 'bark', m=m, smooth=False)
    return b


def horse_trough():
    """Stone & timber water trough paired with a hitching rail for taverns and inns."""
    b = MeshBuilder()
    b.box((-0.82, -0.34, 0), (0.42, 0.34, 0.52), 'stone', skip=('-z',))
    b.box((-0.72, -0.24, 0.44), (0.32, 0.24, 0.48), 'water')
    # Hitching posts and tie rail on the right (+X / +Y)
    for x in (-0.75, 0.75):
        b.box((x - 0.05, 0.38, 0), (x + 0.05, 0.48, 1.08), 'timber')
    b.box((-0.82, 0.39, 0.92), (0.82, 0.47, 1.0), 'timber')
    if detailed():
        for x in (-0.35, 0.25):
            b.box((x - 0.02, 0.35, 0.88), (x + 0.02, 0.39, 0.94), 'iron')
    return b


def grindstone():
    """Blacksmith's timber-framed grindstone wheel over a water trough."""
    b = MeshBuilder()
    for x in (-0.48, 0.4):
        for y in (-0.28, 0.2):
            b.box((x, y, 0), (x + 0.08, y + 0.08, 0.78), 'timber')
    b.box((-0.52, -0.28, 0.58), (0.52, -0.2, 0.72), 'timber')
    b.box((-0.52, 0.2, 0.58), (0.52, 0.28, 0.72), 'timber')
    b.box((-0.38, -0.2, 0.42), (0.38, 0.2, 0.58), 'planks')
    # Dressed stone wheel rotating in XZ plane (axis along Y)
    wheel_m = Matrix.Translation((0, 0, 0.74)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    b.lathe([(0.0, -0.08), (0.34, -0.08), (0.34, 0.08), (0.0, 0.08)], 12, 'stone_dressed',
            m=wheel_m, smooth=False)
    b.box((-0.03, -0.34, 0.71), (0.03, 0.34, 0.77), 'iron')
    if detailed():
        b.box((-0.02, -0.36, 0.52), (0.02, -0.32, 0.74), 'iron')
    return b


def cargo_pile():
    """Dock & market pallet stacked with crates, a cask, and tied grain sacks."""
    b = MeshBuilder()
    b.box((-0.82, -0.68, 0), (0.82, 0.68, 0.08), 'planks', skip=('-z',))
    b.box((-0.76, -0.58, 0.08), (-0.12, 0.06, 0.72), 'planks')
    for x in (-0.77, -0.17):
        for y in (-0.59, 0.01):
            b.box((x, y, 0.08), (x + 0.05, y + 0.05, 0.73), 'timber')
    cask_m = Matrix.Translation((0.36, -0.22, 0.08))
    b.lathe([(0.0, 0.0), (0.23, 0.0), (0.28, 0.34), (0.23, 0.68), (0.0, 0.68)], 10, 'planks',
            m=cask_m)
    b.lathe([(0.26, 0.12), (0.26, 0.17)], 10, 'iron', m=cask_m)
    b.lathe([(0.26, 0.51), (0.26, 0.56)], 10, 'iron', m=cask_m)
    for x, y, r, s in ((-0.32, 0.35, 0.24, 51), (0.18, 0.34, 0.22, 52), (-0.44, -0.25, 0.2, 53)):
        z = 0.86 if y < 0 else 0.26
        b.blob((x, y, z), r, 'cloth_cream', subdiv=1, squash=(1.1, 0.9, 0.85), jitter=0.14, seed=s)
    return b


def bollards():
    """Pair of iron-capped timber street & quay bollards linked by a catenary rope."""
    b = MeshBuilder()
    for x in (-1.1, 1.1):
        m = Matrix.Translation((x, 0, 0))
        b.lathe([(0.16, 0.0), (0.15, 0.18), (0.12, 0.22), (0.12, 0.78), (0.14, 0.82),
                 (0.11, 0.92), (0.0, 0.95)], 8, 'timber', m=m)
        b.lathe([(0.125, 0.7), (0.132, 0.7), (0.132, 0.76), (0.125, 0.76)], 8, 'iron', m=m)
    # Catenary rope between the two bollards
    segs = 6 if detailed() else 3
    pts = [(-1.1 + 2.2 * i / segs, 0.0, 0.73 - 0.18 * math.sin(math.pi * i / segs))
           for i in range(segs + 1)]
    for p, q in zip(pts, pts[1:]):
        b.beam(p, q, (0, 1, 0), (-0.018, 0.018), 0.036, 'cloth_cream', bevel=0)
    return b


def sign_board():
    b = MeshBuilder()
    b.box((-0.04, -0.95, -0.03), (0.04, 0.0, 0.04), 'iron')
    b.box((-0.04, -0.88, -0.7), (0.04, -0.22, -0.12), 'planks')
    for y in (-0.82, -0.28):
        b.box((-0.01, y, -0.12), (0.01, y + 0.02, -0.03), 'iron')
    return b


def add_text(obj, text, size=0.2):
    """Joins extruded gold lettering onto both faces of a sign board."""
    from .. import materials
    curve = bpy.data.curves.new(f'{text}_text', 'FONT')
    curve.body, curve.size, curve.extrude = text, size, 0.008
    curve.align_x, curve.align_y = 'CENTER', 'CENTER'
    parts = []
    for side in (-1, 1):
        txt = bpy.data.objects.new(f'{text}_txt', curve)
        bpy.context.scene.collection.objects.link(txt)
        cols = ((0, side, 0), (0, 0, 1), (side, 0, 0))
        rot = Matrix((cols[0], cols[1], cols[2])).transposed().to_4x4()
        txt.matrix_world = Matrix.Translation((side * 0.05, -0.55, -0.41)) @ rot
        parts.append(txt)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    for txt in parts:
        mesh = bpy.data.meshes.new_from_object(txt.evaluated_get(dg))
        mesh.transform(txt.matrix_world)
        shade = mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        shade.data.foreach_set('color', [1.0] * (len(mesh.loops) * 4))
        mesh.materials.append(materials.get('gold'))
        bpy.data.objects.remove(txt)
        part = bpy.data.objects.new('txt_mesh', mesh)
        bpy.context.scene.collection.objects.link(part)
        with bpy.context.temp_override(active_object=obj, selected_editable_objects=[obj, part]):
            bpy.ops.object.join()
    bpy.data.curves.remove(curve)


def define(kit):
    kit.define('Lamp_Post', 'props', lamp_post())
    kit.define('Lamp_Post_Banner', 'props', lamp_post(arm=True))
    kit.define('Wall_Lantern', 'props', wall_lantern())
    kit.define('Barrel', 'props', barrel())
    kit.define('Crate', 'props', crate())
    kit.define('Well', 'props', well())
    for colour in ('cream', 'blue', 'red'):
        kit.define(f'Market_Stall_{colour.title()}', 'props', market_stall(f'cloth_{colour}'))
    kit.define('Cart', 'props', cart())
    kit.define('Banner_Blue', 'props', banner())
    kit.define('Flower_Box', 'props', flower_box())
    kit.define('Woodpile', 'props', woodpile())
    kit.define('Wayside_Shrine', 'props', wayside_shrine())
    kit.define('Town_Cross', 'props', town_cross())
    kit.define('Signpost', 'props', signpost())
    kit.define('Notice_Board', 'props', notice_board())
    kit.define('Brazier', 'props', brazier())
    kit.define('Horse_Trough', 'props', horse_trough())
    kit.define('Grindstone', 'props', grindstone())
    kit.define('Cargo_Pile', 'props', cargo_pile())
    kit.define('Bollards', 'props', bollards())
    sign = kit.define('Sign_Inn', 'props', sign_board())
    add_text(sign, 'INN')

