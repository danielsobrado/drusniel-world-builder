"""Preview renders: isometric overview, street view, interior and kit catalog.

All of them are lit and tone mapped like the game (game_look.py), so a preview
shows what a town will look like in the world, not a Blender-only grade.
"""
import os

import bpy
from mathutils import Vector

from . import game_look


def setup_scene(look='storybook'):
    scene = bpy.context.scene
    for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    eevee = scene.eevee
    eevee.taa_render_samples = 48
    for attr, value in (('use_raytracing', True), ('use_shadows', True), ('use_gtao', True)):
        if hasattr(eevee, attr):
            setattr(eevee, attr, value)
    game_look.light_scene(scene, look)


def _camera(name, loc, target, ortho_scale=None, lens=32):
    data = bpy.data.cameras.new(name)
    if ortho_scale:
        data.type = 'ORTHO'
        data.ortho_scale = ortho_scale
    else:
        data.lens = lens
    data.clip_end = 500
    cam = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    direction = Vector(target) - Vector(loc)
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    return cam


def _render(cam, path, res=(1600, 1200)):
    game_look.render(bpy.context.scene, cam, path, res)


def _set_visible(coll_name, visible):
    coll = bpy.data.collections.get(coll_name)
    if coll:
        coll.hide_render = not visible


SHOTS = {
    'overview': dict(loc=(-24, -46, 64), target=(22, 18, 5), ortho_scale=62),
    'street': dict(loc=(10.5, 7.0, 5.4), target=(26, 16, 6.0), lens=26),
    'plaza': dict(loc=(15.2, 9.2, 5.0), target=(25.5, 13.8, 4.7), lens=24),
    'lane': dict(loc=(19.8, -4.0, 1.7), target=(20, 12, 2.6), lens=24),
    'interior': dict(loc=(24.1, 14.9, 4.65), target=(28.6, 19.2, 4.1), lens=18),
    'interior_upper': dict(building='BLD_Inn', loc=(2.3, 1.1, 4.55), target=(6.8, 5.2, 3.8), lens=18),
    'interior_smithy': dict(building='BLD_Smithy', loc=(2.15, 0.75, 1.75), target=(5.0, 3.4, 1.15), lens=18),
    'interior_apothecary': dict(building='BLD_Merchant', loc=(2.3, 0.9, 1.65), target=(5.8, 5.2, 1.05), lens=18),
    'interior_chapel': dict(building='BLD_Chapel', loc=(5.0, 0.75, 1.85), target=(5.0, 5.3, 1.25), lens=18),
    'catalog': 'Kit',      # framed from the collection's bounds
    'prefabs': 'Prefabs',
}

GOBLIN_SHOTS = {
    'goblin_overview': dict(loc=(-24, -46, 64), target=(22, 18, 5), ortho_scale=62),
    'goblin_hero': dict(loc=(5.4, -1.6, 3.65), target=(18.5, 12.5, 4.8), lens=22),
    'goblin_bridge': dict(loc=(19.2, 0.8, 1.95), target=(19.8, 15.0, 6.2), lens=24),
    'goblin_interior_hall': dict(building='BLD_Chieftain_Hall', loc=(2.2, 0.85, 2.35),
                                 target=(5.2, 5.2, 1.65), lens=18),
    'goblin_interior_shaman': dict(building='BLD_Shaman_Hut', loc=(2.2, 0.85, 2.35),
                                   target=(5.2, 5.2, 1.65), lens=18),
    'goblin_interior_tavern': dict(building='BLD_Bog_Tavern', loc=(2.2, 0.85, 2.35),
                                   target=(5.8, 5.2, 1.65), lens=18),
}


def _collection_shot(name):
    pts = [o.matrix_world @ Vector(c) for o in bpy.data.collections[name].all_objects
           if o.type == 'MESH' for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), 0))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), 0))
    centre = (lo + hi) / 2
    view = Vector((-0.35, -1.0, 0.9)).normalized()
    top = max(p.z for p in pts)
    centre.z = top * 0.35
    return dict(loc=centre + view * 150, target=centre, ortho_scale=max(hi - lo) * 1.05 + top * 0.6)


def town_overview(out_dir, name):
    """Isometric overview framed on whatever town was built (generated maps)."""
    os.makedirs(out_dir, exist_ok=True)
    for coll in ('Kit', 'Prefabs'):
        _set_visible(coll, False)
    _set_visible('Town', True)
    shot = _collection_shot('Town')
    cam = _camera(f'CAM_{name}', shot['loc'], shot['target'], shot['ortho_scale'])
    _render(cam, os.path.join(out_dir, f'overview_{name}.png'))
    _set_visible('Kit', True)


def prefab_closeups(out_dir, names):
    """Front three-quarter view of individual prefabs (Prefabs collection)."""
    os.makedirs(out_dir, exist_ok=True)
    for coll in ('Kit', 'Town'):
        _set_visible(coll, False)
    _set_visible('Prefabs', True)
    for name in names:
        root = bpy.data.objects.get(f'BLD_{name}')
        if root is None:
            print(f'[kit] no prefab {name}')
            continue
        pts = [o.matrix_world @ Vector(c) for o in root.children_recursive if o.type == 'MESH'
               for c in o.bound_box]
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        centre = (lo + hi) / 2
        reach = (hi - lo).length
        target = centre - Vector((0, 0, (hi.z - lo.z) * 0.12))
        loc = target + Vector((-0.5, -1.0, 0.22)).normalized() * reach * 0.95
        cam = _camera(f'CAM_{name}', loc, target, lens=35)
        _render(cam, os.path.join(out_dir, f'prefab_{name}.png'), res=(960, 720))
    _set_visible('Kit', True)
    _set_visible('Town', True)
    _set_visible('Prefabs', False)


def previews(out_dir, shots=None, shot_table=None):
    os.makedirs(out_dir, exist_ok=True)
    bpy.context.view_layer.update()
    table = shot_table or SHOTS
    for name, shot in table.items():
        if shots and name not in shots:
            continue
        framed = shot if isinstance(shot, str) else None
        for coll in ('Kit', 'Prefabs', 'Town'):
            _set_visible(coll, coll == framed if framed else coll == 'Town')
        bpy.context.view_layer.update()
        shot = _collection_shot(framed) if framed else shot
        loc, target = shot['loc'], shot['target']
        if isinstance(shot, dict) and 'building' in shot:
            bld = bpy.data.objects.get(shot['building'])
            if bld is not None:
                loc = bld.matrix_world @ Vector(loc)
                target = bld.matrix_world @ Vector(target)
        cam = _camera(f'CAM_{name}', loc, target, shot.get('ortho_scale'),
                      shot.get('lens', 32))
        _render(cam, os.path.join(out_dir, f'{name}.png'))
    _set_visible('Kit', True)
    _set_visible('Town', True)
    _set_visible('Prefabs', False)
