"""Build the modular medieval town kit, the sample town, exports and previews.

    blender -b --factory-startup --python tools/blender/medieval_town_kit/build_kit.py -- [flags]

Flags: --no-render  --no-export  --shots overview,street,lane,interior,catalog,prefabs
       --seed 7 --family Nordic|Tudor|Med   (generate a new town map instead of the sample)
       --prefabs Nordic_Tavern,Med_Villa   (close-ups of named prefabs)
       --lod1   build the light far kit and export only medieval_kit_lod1.glb
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from medkit import catalog, config, export, materials, prefab_export, render, textures, village  # noqa: E402
from medkit import village_plan  # noqa: E402
from medkit.prefabs import PrefabBuilder  # noqa: E402
from medkit.village_generator import GeneratedVillage  # noqa: E402


def _args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    shots = None
    if '--shots' in argv:
        shots = set(argv[argv.index('--shots') + 1].split(','))
    closeups = argv[argv.index('--prefabs') + 1].split(',') if '--prefabs' in argv else []
    seed = int(argv[argv.index('--seed') + 1]) if '--seed' in argv else None
    family = argv[argv.index('--family') + 1] if '--family' in argv else 'Tudor'
    return '--no-render' not in argv, '--no-export' not in argv, shots, closeups, seed, family


def _reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def far_kit():
    """Same module names as the full kit, built without the close-up detail."""
    config.LOD = 1
    _reset()
    materials.build(textures.generate(config.TEXTURE_DIR))
    kit = catalog.build_kit()
    os.makedirs(config.EXPORT_DIR, exist_ok=True)
    export.kit_glb(kit, config.EXPORT_DIR, 'medieval_kit_lod1.glb', images=False)


def main():
    if '--lod1' in sys.argv:
        far_kit()
        return
    do_render, do_export, shots, closeups, seed, family = _args()
    plan = village_plan if seed is None else GeneratedVillage(seed, family)
    stem = 'medieval_town' if seed is None else f'medieval_town_{family.lower()}_{seed}'
    blend = config.BLEND_PATH if seed is None else config.BLEND_PATH.replace('.blend', f'_{family.lower()}_{seed}.blend')
    _reset()
    images = textures.generate(config.TEXTURE_DIR)
    materials.build(images)
    kit = catalog.build_kit()
    village.build(kit, plan)
    prefabs = PrefabBuilder(kit).build_all()
    render.setup_scene()
    os.makedirs(config.SOURCE_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend, relative_remap=True)
    if do_export:
        os.makedirs(config.EXPORT_DIR, exist_ok=True)
        export.kit_glb(kit, config.EXPORT_DIR)
        export.town_glb(kit, config.EXPORT_DIR, stem)
        export.layout_json(kit, config.EXPORT_DIR, stem)
        prefab_export.export(prefabs, kit.modules.keys(), config.EXPORT_DIR)
    if do_render and seed is not None:
        render.town_overview(config.PREVIEW_DIR, f'{family.lower()}_{seed}')
    elif do_render:
        render.previews(config.PREVIEW_DIR, shots)
    if closeups:
        render.prefab_closeups(config.PREVIEW_DIR, closeups)
    bpy.ops.wm.save_as_mainfile(filepath=blend, relative_remap=True)


main()
