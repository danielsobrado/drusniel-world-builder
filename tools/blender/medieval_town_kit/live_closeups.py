"""Rebuild the kit from source inside a running Blender and render street-level prefab close-ups.

For tuning through the Blender MCP add-on: execute this file in the live Blender with
the globals below set (about 8 s for a couple of prefabs), look at the PNGs, edit
medkit, run it again. Every medkit module is re-imported, so edits apply without
restarting Blender; the scene is purged rather than reset (read_factory_settings would
drop the add-on and its server).

    path = r'<repo>/tools/blender/medieval_town_kit/live_closeups.py'
    g = {'__file__': path, 'NAMES': ['Nordic_Shop_Large', 'Tudor_House_Large'],
         'OUT': 'C:/tmp/k', 'DIST': 9.0, 'RES': (1200, 800)}
    exec(open(path, encoding='utf-8').read(), g)

NAMES are <Tudor|Nordic|Med>_<base> (prefab_families.BASES). Each prefab gets an
eye-level shot from DIST metres and a three-quarter one, lit and tone mapped like
the game (game_look), written to <OUT>_<prefab>_<eye|q>.png.
"""
import os
import sys

import bpy
from mathutils import Vector

TOOL = os.path.dirname(os.path.abspath(__file__))
if TOOL not in sys.path:
    sys.path.insert(0, TOOL)
for module in [m for m in sys.modules if m == 'medkit' or m.startswith('medkit.')]:
    del sys.modules[module]

from medkit import catalog, config, game_look, materials, render, textures  # noqa: E402
from medkit.prefab_families import BASE_BY_NAME, FAMILY_BY_NAME  # noqa: E402
from medkit.prefabs import PrefabBuilder  # noqa: E402

config.LOD = 0
for data in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.cameras,
             bpy.data.lights, bpy.data.collections, bpy.data.worlds):
    for item in list(data):
        data.remove(item)
for image in list(bpy.data.images):
    if image.users == 0 or image.name.startswith('T_'):
        bpy.data.images.remove(image)

materials.build(textures.generate(config.TEXTURE_DIR))
kit = catalog.build_kit()
builder = PrefabBuilder(kit)
built = []
for full in NAMES:  # noqa: F821 (set by the caller)
    family, base = full.split('_', 1)
    spec = FAMILY_BY_NAME[family](BASE_BY_NAME[base])
    builder.building(spec)
    built.append(spec.name)
render.setup_scene()
bpy.data.collections['Kit'].hide_render = True
bpy.data.collections['Prefabs'].hide_render = False

# Trodden earth, so the foot of each wall reads.
ground = bpy.data.meshes.new('QA_Ground')
ground.from_pydata([(-300, -600, 0), (300, -600, 0), (300, 200, 0), (-300, 200, 0)], [], [(0, 1, 2, 3)])
ground_obj = bpy.data.objects.new('QA_Ground', ground)
bpy.context.scene.collection.objects.link(ground_obj)
earth = bpy.data.materials.new('QA_Earth')
earth.use_nodes = True
next(n for n in earth.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.2, 0.16, 0.11, 1)
ground.materials.append(earth)

# EEVEE in the UI compiles shaders on its first render and returns that frame empty.
warm = render._camera('CAM_warm', Vector((0, -420, 2)), Vector((0, -400, 2)))
game_look.render(bpy.context.scene, warm, f'{OUT}_warm.png', (64, 48))  # noqa: F821
for name in built:
    root = bpy.data.objects[f'BLD_{name}']
    points = [o.matrix_world @ Vector(c) for o in root.children_recursive if o.type == 'MESH' for c in o.bound_box]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    cx = (lo.x + hi.x) / 2
    for tag, dist, eye, lens, look_z, side in (('eye', DIST, 1.7, 28, 3.2, 0.0),  # noqa: F821
                                               ('q', DIST * 1.25, 2.2, 30, 3.6, -0.45)):  # noqa: F821
        cam = render._camera(f'CAM_{name}_{tag}', Vector((cx + side * dist, lo.y - dist, eye)),
                             Vector((cx, lo.y, look_z)), lens=lens)
        game_look.render(bpy.context.scene, cam, f'{OUT}_{name}_{tag}.png', RES)  # noqa: F821
