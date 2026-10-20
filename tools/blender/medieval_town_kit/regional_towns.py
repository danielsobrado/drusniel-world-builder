"""Whole-town art review for one family: generate a town, render an overview and two hero views.

    blender -b --factory-startup --python tools/blender/medieval_town_kit/regional_towns.py -- OUT_DIR FAMILY [SEED] [--res 1600x900]

Writes <family>_<seed>_overview.png (isometric), _hero.png (elevated three-quarter, like a
concept painting of the town) and _street.png (eye level from the main entrance, uphill).
Lit and tone mapped like the game (game_look.py).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from medkit import catalog, config, game_look, materials, render, textures, village  # noqa: E402
from medkit.config import GRID, TERRACE  # noqa: E402
from medkit.mesh import MeshBuilder  # noqa: E402
from medkit.village_generator import GeneratedVillage  # noqa: E402

# The land round the town (the game has terrain there) and the preview's sky look.
GROUND = {'Orc': 'meadow', 'Frostgard': 'meadow_frost', 'Stonehold': 'meadow_earth'}
# Review sky: between the game's 'configured' noon and 'storybook' dusk; a warm sun at 32 deg
# with a strong sky fill, so values stay soft like a painted town view.
game_look.LOOKS['town_review'] = dict(elevation=32, azimuth=240, sun='#ffe2bd', sun_intensity=2.7,
                                      sky='#c4d4e8', ground='#7d7458', ambient=2.3)
HAZE = 0.0022      # aerial perspective: soft distance like a painted town view


def _landscape(mat, centre, reach=600.0):
    b = MeshBuilder()
    x, y = centre.x, centre.y
    b.poly([(x - reach, y - reach, -0.02), (x + reach, y - reach, -0.02), (x + reach, y + reach, -0.02),
            (x - reach, y + reach, -0.02)], mat, outward=(0, 0, 1))
    obj = bpy.data.objects.new('Landscape', b.to_mesh('Landscape'))
    bpy.context.scene.collection.objects.link(obj)


def _haze(scene, centre, density=HAZE, size=(260.0, 260.0, 70.0)):
    """A bounded volume box (a world volume would absorb all sky light in EEVEE)."""
    eevee = scene.eevee
    for attr, value in (('volumetric_end', 400.0), ('volumetric_tile_size', '8'), ('volumetric_samples', 32)):
        if hasattr(eevee, attr):
            try:
                setattr(eevee, attr, value)
            except (TypeError, ValueError):
                pass
    bpy.ops.mesh.primitive_cube_add(location=(centre.x, centre.y, size[2] / 2 - 2.0))
    box = bpy.context.active_object
    box.name = 'Haze'
    box.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    mat = bpy.data.materials.new('M_Haze')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.remove(next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'))
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = density
    vol.inputs['Anisotropy'].default_value = 0.3
    vol.inputs['Color'].default_value = (0.86, 0.9, 1.0, 1)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    nt.links.new(vol.outputs['Volume'], out.inputs['Volume'])
    box.data.materials.append(mat)


def _args():
    argv = sys.argv[sys.argv.index('--') + 1:]
    res = (1600, 900)
    if '--res' in argv:
        w, h = argv.pop(argv.index('--res') + 1).split('x')
        argv.remove('--res')
        res = (int(w), int(h))
    return argv[0], argv[1], int(argv[2]) if len(argv) > 2 else 7, res


def _town_bounds():
    pts = [o.matrix_world @ Vector(c) for o in bpy.data.collections['Town_Buildings'].all_objects
           if o.type == 'MESH' for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def main():
    out, family, seed, res = _args()
    os.makedirs(out, exist_ok=True)
    config.LOD = 0
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials.build(textures.generate(config.TEXTURE_DIR))
    kit = catalog.build_kit()
    plan = GeneratedVillage(seed, family)
    village.build(kit, plan)
    render.setup_scene(look='town_review')
    render._set_visible('Kit', False)
    bpy.context.view_layer.update()
    stem = os.path.join(out, f'{family.lower()}_{seed}')
    lo, hi = _town_bounds()
    centre = (lo + hi) / 2
    _landscape(GROUND.get(family, 'meadow'), centre)
    _haze(bpy.context.scene, centre)
    span = max(hi.x - lo.x, hi.y - lo.y)
    shot = render._collection_shot('Town')
    cam = render._camera('CAM_overview', shot['loc'], shot['target'], shot['ortho_scale'])
    render._render(cam, f'{stem}_overview.png', res)
    hero = centre + Vector((-0.55, -1.0, 0.62)).normalized() * span * 1.05
    cam = render._camera('CAM_hero', hero, centre - Vector((0, span * 0.05, span * 0.06)), lens=30)
    render._render(cam, f'{stem}_hero.png', res)
    gate_x = (plan.entrances[0] + 0.5) * GRID if plan.entrances else centre.x
    eye = Vector((gate_x + 0.6, -17.0, 2.3))
    look = Vector((gate_x + 0.6, centre.y * 0.7, TERRACE * 2 + 1.5))
    cam = render._camera('CAM_street', eye, look, lens=24)
    render._render(cam, f'{stem}_street.png', res)
    print(f'[towns] {family} {seed}: {len(plan.BUILDINGS)} buildings')


main()
