"""Art-review renders: single kit modules, single prefabs and the town, lit like the game.

    blender -b --factory-startup --python tools/blender/medieval_town_kit/review_shots.py -- OUT_DIR [shot,shot,...] [--res 960x720]

With no shot list every shot in SHOTS is rendered. `--list` prints the kit's module names.
`--cinematic` renders with haze, sun through the glass, shadowed fire light and a dimmer
sky fill indoors: the target the game's renderer should grow toward, not what it shows today.
Modules are shown alone on a plain earth ground from a front three-quarter view.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from medkit import catalog, config, game_look, materials, render, textures, village, village_plan  # noqa: E402
from medkit.prefabs import PrefabBuilder  # noqa: E402

# name -> modules laid side by side, or ('prefab', name), or ('row', [prefab, ...]) lined up
# left to right, or ('town', render.SHOTS key)
SHOTS = {
    'wall_timber': ['Wall_Timber_Window', 'Wall_Timber_Door'],
    'wall_stone': ['Wall_Stone_Window', 'Wall_Stone_Door'],
    'wall_plaster': ['Wall_Plaster_Window', 'Wall_Plaster_Door'],
    'wall_plank': ['Wall_Plank_Window'],
    'foundations': ['Plinth_Low', 'Corner_Quoins', 'Entry_Steps_Low', 'Chimney_Breast'],
    'roof_gable': ['Roof_Gable_S6', 'Roof_Gable_End_S6'],
    'roof_hip': ['Roof_Hip_S6_L8'],
    'battlements': ['Roof_Battlements_6'],
    'wardrobe': ['Wardrobe', 'Chest', 'Writing_Desk'],
    'nature': ['Tree_Oak', 'Tree_Cypress', 'Bush', 'Flower_Box', 'Lamp_Post'],
    'tudor_tavern': ('prefab', 'Tudor_Tavern'),
    'nordic_keep': ('prefab', 'Nordic_Keep'),
    'med_tavern': ('prefab', 'Med_Tavern'),
    'med_villa': ('prefab', 'Med_Villa'),
    'round_tower': ('prefab', 'RoundTower'),
    'wall_orc': ['Wall_Orc_Window', 'Wall_Orc_Door', 'Corner_Orc', 'Orc_Porch'],
    'wall_log': ['Wall_Log_Window', 'Wall_Log_Door', 'Corner_Log'],
    'wall_granite': ['Wall_Granite_Window', 'Wall_Granite_Door', 'Wall_Granite_Arcade', 'Corner_Granite'],
    'roof_thatch': ['Roof_Thatch_End_S6', 'Roof_Thatch_S6', 'Gable_Wall_Orc_S6'],
    'roof_sod': ['Roof_Sod_End_S6', 'Roof_Sod_S6', 'Gable_Wall_Log_S6', 'Smoke_Vent'],
    'orc_palisade': ['Palisade_Orc', 'Gate_Tower_Orc'],
    'watchtowers': ['Watchtower_Orc', 'Watchtower_Frost', 'Cliff_Granite', 'Boulder_Cluster'],
    'stonehold_gate': ['Gate_Stonehold', 'Chimney_Granite'],
    'orc_hall': ('prefab', 'Orc_Tavern_Large'),
    'orc_house': ('prefab', 'Orc_House_Large'),
    'orc_keep': ('prefab', 'Orc_Keep'),
    'orc_gatehouse': ('prefab', 'Orc_Gatehouse'),
    'frostgard_hall': ('prefab', 'Frostgard_Tavern_Large'),
    'frostgard_house': ('prefab', 'Frostgard_House_Long'),
    'frostgard_cottage': ('prefab', 'Frostgard_House_Square'),
    'frostgard_keep': ('prefab', 'Frostgard_Keep'),
    'stonehold_guildhall': ('prefab', 'Stonehold_Guildhall'),
    'stonehold_house': ('prefab', 'Stonehold_Townhouse_Tall'),
    'stonehold_keep': ('prefab', 'Stonehold_Keep'),
    'stonehold_gatehouse': ('prefab', 'Stonehold_Gatehouse'),
    'families_tavern': ('row', [f'{f}_Tavern' for f in ('Tudor', 'Nordic', 'Orc', 'Frostgard', 'Stonehold')]),
    'families_house': ('row', [f'{f}_House_Large' for f in ('Tudor', 'Nordic', 'Orc', 'Frostgard', 'Stonehold')]),
    'street': ('town', 'street'),
    'plaza': ('town', 'plaza'),
    'lane': ('town', 'lane'),
    'interior': ('town', 'interior'),
    'overview': ('town', 'overview'),
}


def _args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    res = (960, 720)
    if '--res' in argv:
        w, h = argv.pop(argv.index('--res') + 1).split('x')
        argv.remove('--res')
        res = (int(w), int(h))
    listing = '--list' in argv
    cinematic = '--cinematic' in argv
    argv = [a for a in argv if a not in ('--list', '--cinematic')]
    out = argv[0] if argv else os.path.join(config.PREVIEW_DIR, 'review_live')
    names = argv[1].split(',') if len(argv) > 1 else list(SHOTS)
    return out, names, res, listing, cinematic


def _bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def _ground():
    me = bpy.data.meshes.new('QA_Ground')
    me.from_pydata([(-3000, -3000, -0.001), (3000, -3000, -0.001), (3000, 3000, -0.001), (-3000, 3000, -0.001)], [],
                   [(0, 1, 2, 3)])
    obj = bpy.data.objects.new('QA_Ground', me)
    bpy.context.scene.collection.objects.link(obj)
    mat = bpy.data.materials.new('QA_Earth')
    mat.use_nodes = True
    next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (
        0.12, 0.10, 0.08, 1)
    me.materials.append(mat)
    return obj


def _frame(objs, out, res, view=(-0.55, -1.0, 0.32)):
    lo, hi = _bounds(objs)
    centre = (lo + hi) / 2
    reach = max((hi - lo).length, 1.0)
    loc = centre + Vector(view).normalized() * reach * 1.25
    cam = render._camera('CAM_review', loc, centre, lens=38)
    game_look.render(bpy.context.scene, cam, out, res)


FIRES = {'Hearth': (0, -0.15, 0.4), 'Forge_Hood': (-0.25, -0.2, 1.0), 'Bake_Oven': (0, -0.3, 0.9),
         'Goblin_Firepit': (0, 0, 0.4), 'Cauldron_Fire': (0, 0, 0.6), 'Brazier': (0, 0, 1.1)}


def _set(obj, attr, value):
    if hasattr(obj, attr):
        try:
            setattr(obj, attr, value)
        except (TypeError, ValueError):
            pass


def _cinematic():
    """Haze, transmissive glass, shadowed fire and candle light."""
    scene = bpy.context.scene
    eevee = scene.eevee
    for attr, value in (('use_volumetric_shadows', True), ('volumetric_tile_size', '4'),
                        ('volumetric_samples', 64), ('volumetric_end', 90.0), ('use_shadows', True),
                        ('shadow_ray_count', 3), ('shadow_step_count', 12), ('use_fast_gi', True),
                        ('fast_gi_distance', 4.0), ('ray_tracing_method', 'SCREEN'), ('shadow_pool_size', '1024')):
        _set(eevee, attr, value)
    nt = scene.world.node_tree
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = 0.012
    vol.inputs['Anisotropy'].default_value = 0.65
    vol.inputs['Color'].default_value = (1.0, 0.92, 0.82, 1)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
    nt.links.new(vol.outputs['Volume'], out.inputs['Volume'])
    sun = bpy.data.objects['Sun']
    sun.data.energy *= 1.5
    sun.data.angle = 0.03
    glass = bpy.data.materials.get('M_glass')
    if glass:
        bsdf = next(n for n in glass.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Alpha'].default_value = 0.35
        _set(glass, 'surface_render_method', 'DITHERED')
        _set(glass, 'use_transparent_shadow', True)
    for light in bpy.data.lights:
        if light.type == 'POINT':
            light.energy *= 0.7
    for obj in list(bpy.data.objects):
        offset = FIRES.get(obj.get('kit_module'))
        if offset is None:
            continue
        data = bpy.data.lights.new('Fire', 'POINT')
        data.energy, data.color, data.shadow_soft_size = 160.0, (1.0, 0.55, 0.24), 0.25
        fire = bpy.data.objects.new('Fire', data)
        bpy.context.scene.collection.objects.link(fire)
        fire.location = obj.matrix_world @ Vector(offset)


def _sky(scale, haze=0.0015):
    nodes = bpy.context.scene.world.node_tree.nodes
    vol = next((n for n in nodes if n.type == 'PRINCIPLED_VOLUME'), None)
    if vol is not None:
        vol.inputs['Density'].default_value = haze
    bg = next(n for n in nodes if n.type == 'BACKGROUND')
    if '_base' not in bg:
        bg['_base'] = bg.inputs['Strength'].default_value
    bg.inputs['Strength'].default_value = bg['_base'] * scale


def _row(names, gap=4.0, y=-2000.0):
    """Line prefabs up left to right on one baseline (moves their roots) and return their meshes."""
    objs, x = [], 0.0
    for name in names:
        root = bpy.data.objects.get(f'BLD_{name}')
        if root is None:
            print(f'[review] no prefab {name}')
            continue
        meshes = [o for o in root.children_recursive if o.type == 'MESH']
        lo, _ = _bounds(meshes)
        root.location = (root.location.x + x - lo.x, y, 0)
        bpy.context.view_layer.update()
        _, hi = _bounds(meshes)
        x = hi.x + gap
        objs.extend(meshes)
    return objs


def _hide_all():
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name != 'QA_Ground':
            o.hide_render = True


def main():
    out_dir, names, res, listing, cinematic = _args()
    t0 = time.time()
    config.LOD = 0
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials.build(textures.generate(config.TEXTURE_DIR))
    kit = catalog.build_kit()
    if listing:
        print('MODULES', ' '.join(sorted(kit.modules)))
        return
    need_town = any(isinstance(SHOTS[n], tuple) and SHOTS[n][0] == 'town' for n in names)
    need_prefabs = any(isinstance(SHOTS[n], tuple) and SHOTS[n][0] in ('prefab', 'row') for n in names)
    if need_town:
        village.build(kit, village_plan)
    prefabs = PrefabBuilder(kit).build_all() if need_prefabs else None
    render.setup_scene()
    if cinematic:
        _cinematic()
    ground = _ground()
    os.makedirs(out_dir, exist_ok=True)
    print(f'[review] built in {time.time() - t0:.1f}s')
    # EEVEE returns its first frame empty while shaders compile.
    game_look.render(bpy.context.scene, render._camera('CAM_warm', Vector((0, -50, 2)), Vector((0, 0, 2))),
                     os.path.join(out_dir, '_warm.png'), (64, 48))
    for name in names:
        shot = SHOTS[name]
        path = os.path.join(out_dir, f'{name}.png')
        if isinstance(shot, tuple) and shot[0] == 'town':
            ground.hide_render = True
            for o in bpy.data.objects:
                if o.type == 'MESH' and o.name != 'QA_Ground':
                    o.hide_render = False
            render._set_visible('Kit', False)
            render._set_visible('Prefabs', False)
            render._set_visible('Town', True)
            if cinematic:
                _sky(*((0.3, 0.008) if shot[1].startswith('interior') else (0.8, 0.0)))
            render.previews(out_dir, {shot[1]})
            os.replace(os.path.join(out_dir, f'{shot[1]}.png'), path)
            ground.hide_render = False
            continue
        render._set_visible('Kit', True)
        render._set_visible('Prefabs', True)
        render._set_visible('Town', False)
        _hide_all()
        if isinstance(shot, tuple) and shot[0] == 'row':
            objs = _row(shot[1])
        elif isinstance(shot, tuple):
            root = bpy.data.objects.get(f'BLD_{shot[1]}')
            if root is None:
                print(f'[review] no prefab {shot[1]}')
                continue
            objs = [o for o in root.children_recursive if o.type == 'MESH']
        else:
            objs, x = [], 0.0
            for module in shot:
                obj = kit.modules.get(module)
                if obj is None:
                    print(f'[review] no module {module}')
                    continue
                lo, hi = _bounds([obj])
                obj.location.x += x - lo.x
                obj.location.y -= hi.y
                obj.location.z -= lo.z
                bpy.context.view_layer.update()
                x += (hi.x - lo.x) + 0.8
                objs.append(obj)
        if not objs:
            continue
        if cinematic:
            _sky(0.8)
        for o in objs:
            o.hide_render = False
        bpy.context.view_layer.update()
        _frame(objs, path, res)
    print(f'[review] done in {time.time() - t0:.1f}s')


main()
