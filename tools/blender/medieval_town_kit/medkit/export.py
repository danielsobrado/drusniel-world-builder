"""glTF exports and the lego layout manifest.

- medieval_kit.glb   every module once, at the origin, named after the module
- medieval_kit_lod1.glb  the same modules from the light far kit (--lod1), no images
- medieval_town.glb  the assembled town; placed pieces share the kit meshes
- medieval_town_layout.json  hierarchy of groups and module placements, so the
  game can rebuild (or let players rearrange) the town from the kit alone.
"""
import json
import math
import os

import bpy


def _select_only(objs):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)


def _gltf(path, images=True):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_lights=True, export_extras=True, export_yup=True,
                              export_image_format='WEBP' if images else 'NONE',
                              export_image_quality=88)
    print(f'[kit] exported {path}')


def kit_glb(kit, out_dir, filename='medieval_kit.glb', images=True):
    """Every module once at the origin. The far kit is written without images: the
    game draws it with the near kit's materials, matched by name."""
    objs = list(kit.modules.values())
    saved = {o.name: tuple(o.location) for o in objs}
    for o in objs:
        o.location = (0, 0, 0)
    _select_only(objs)
    _gltf(os.path.join(out_dir, filename), images)
    for o in objs:
        o.location = saved[o.name]


def town_glb(kit, out_dir, stem='medieval_town'):
    _select_only(list(kit.town.all_objects))
    _gltf(os.path.join(out_dir, f'{stem}.glb'))


def _node(obj):
    node = {'name': obj.name, 'position': [round(v, 4) for v in obj.location],
            'rotationZDeg': round(math.degrees(obj.rotation_euler.z), 3)}
    if 'kit_module' in obj:
        node['module'] = obj['kit_module']
    if obj.type == 'LIGHT':
        node['light'] = {'energyW': obj.data.energy, 'color': list(obj.data.color)}
    for key in ('building', 'interactable'):
        if key in obj:
            node[key] = obj[key]
    kids = [_node(c) for c in obj.children]
    if kids:
        node['children'] = kids
    return node


def layout_json(kit, out_dir, stem='medieval_town'):
    roots = [o for o in kit.town.all_objects if o.parent is None]
    doc = {'units': 'metres', 'up': 'Z (Blender); the GLBs are Y-up', 'grid': 2.0,
           'modules': sorted(kit.modules), 'roots': [_node(o) for o in roots]}
    path = os.path.join(out_dir, f'{stem}_layout.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=1)
    print(f'[kit] wrote {path}')
