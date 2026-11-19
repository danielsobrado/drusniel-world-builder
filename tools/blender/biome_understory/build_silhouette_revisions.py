"""Build all revised biome understory silhouette assets into assets/runtime-sources/.

Run headless:
  "F:\\Blender 5.2\\blender.exe" -b --factory-startup --python tools/blender/biome_understory/build_silhouette_revisions.py -- [--no-render]
"""
import json
import os
import struct
import sys

import bpy

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if THIS_DIR not in sys.path:
    sys.path.insert(0, THIS_DIR)

from build_biome_understory import build_taiga_berry_moss, build_tundra_dwarf_willow
from builders_extra import (
    build_bush_boreal_juniper,
    build_bush_savanna_thorn,
    build_bush_swamp_buttonbush,
    build_coastal_dune_oats,
)
from silhouette_variants import (
    build_rainforest_broadleaf_material,
    build_rainforest_cupped_broadleaf,
    build_rainforest_fern_material,
    build_rainforest_layered_fern,
    build_savanna_thorn_scrub,
)
from textures import build_all_materials
from textures_extra import build_extra_materials
from understory_common import place_and_export, setup_scene

ROOT = os.path.abspath(os.path.join(THIS_DIR, '..', '..', '..'))
SRC_GROUND = os.path.join(ROOT, 'assets', 'runtime-sources', 'ground')
SRC_BUSHES = os.path.join(ROOT, 'assets', 'runtime-sources', 'bushes')
TEX_DIR = os.path.join(ROOT, 'tmp', 'understory', 'textures')


def patch_alpha_mask(glb_path, cutoff=0.45):
    """Ensure alpha-cutout GLBs declare alphaMode MASK so gltfpack picks alphaCriticalScatter."""
    data = open(glb_path, 'rb').read()
    length = struct.unpack('<I', data[12:16])[0]
    doc = json.loads(data[20:20 + length])
    changed = False
    for mat in doc.get('materials', []):
        if mat.get('alphaMode') != 'MASK':
            mat['alphaMode'] = 'MASK'
            mat['alphaCutoff'] = cutoff
            changed = True
    if not changed:
        return
    body = json.dumps(doc, separators=(',', ':')).encode()
    body += b' ' * (-len(body) % 4)
    rest = data[20 + length:]
    out = (
        data[:8]
        + struct.pack('<I', 20 + len(body) + len(rest))
        + struct.pack('<I', len(body))
        + data[16:20]
        + body
        + rest
    )
    open(glb_path, 'wb').write(out)


def export_one(name, mesh, out_path, alpha_mask=False):
    root = place_and_export(name, mesh, out_path, tangents=True)
    if alpha_mask:
        patch_alpha_mask(out_path)
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    zs = [v.co.z for v in mesh.vertices]
    tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    info = {
        'name': name,
        'path': os.path.relpath(out_path, ROOT).replace('\\', '/'),
        'triangles': tris,
        'bounds_xyz_m': [
            round(max(xs) - min(xs), 3),
            round(max(zs) - min(zs), 3),  # glTF Y (height)
            round(max(ys) - min(ys), 3),
        ],
        'min_y': round(min(zs), 3),
    }
    for child in list(root.children):
        bpy.data.objects.remove(child)
    bpy.data.objects.remove(root)
    return info


def main():
    os.makedirs(TEX_DIR, exist_ok=True)
    setup_scene()

    mats = {}
    mats.update(build_all_materials(TEX_DIR))
    mats.update(build_extra_materials(TEX_DIR))

    # Dedicated rainforest PBR materials (single draw call per asset)
    mat_fern = build_rainforest_fern_material(TEX_DIR, name='Scan forest-fern-02')
    mat_elephant = build_rainforest_broadleaf_material(
        TEX_DIR, 'ElephantEarPBR', 'elephant-ear-pbr', 711,
        leaf_rgb=(0.14, 0.34, 0.12), vein_rgb=(0.30, 0.50, 0.22), stem_rgb=(0.32, 0.36, 0.20),
    )
    mat_banana = build_rainforest_broadleaf_material(
        TEX_DIR, 'BananaUnderstoryPBR', 'banana-understory-pbr', 712,
        leaf_rgb=(0.18, 0.42, 0.14), vein_rgb=(0.38, 0.58, 0.24), stem_rgb=(0.34, 0.38, 0.21),
    )
    mat_calathea = build_rainforest_broadleaf_material(
        TEX_DIR, 'Scan tropical-calathea-01', 'tropical-calathea-pbr', 713,
        leaf_rgb=(0.16, 0.38, 0.15), vein_rgb=(0.36, 0.56, 0.28), stem_rgb=(0.30, 0.32, 0.18),
    )
    mat_anthurium = build_rainforest_broadleaf_material(
        TEX_DIR, 'Scan tropical-anthurium-01', 'tropical-anthurium-pbr', 714,
        leaf_rgb=(0.15, 0.36, 0.13), vein_rgb=(0.32, 0.52, 0.22), stem_rgb=(0.30, 0.34, 0.19),
        accent_rgb=(0.76, 0.18, 0.20),
    )

    results = []

    # 1. Savanna: uneven-branching open-center thorn scrub
    mesh, _ = build_savanna_thorn_scrub(
        mats['bush_savanna'], name='bush-arid-rooibos-01', seed=328, low_budget=True, max_triangles=4000,
    )
    results.append(export_one('bush-arid-rooibos-01', mesh, os.path.join(SRC_BUSHES, 'bush-arid-rooibos-01.glb'), alpha_mask=True))

    mesh, _ = build_bush_savanna_thorn(mats['bush_savanna'])
    results.append(export_one('bush-savanna-thorn-01', mesh, os.path.join(SRC_BUSHES, 'bush-savanna-thorn-01.glb'), alpha_mask=True))

    # 2. Taiga: varied-height krummholz juniper, dwarf willow, and berry-moss
    mesh, _ = build_bush_boreal_juniper(mats['bush_juniper'])
    results.append(export_one('bush-boreal-juniper-01', mesh, os.path.join(SRC_BUSHES, 'bush-boreal-juniper-01.glb'), alpha_mask=True))

    mesh, _ = build_tundra_dwarf_willow(mats['tundra_willow'])
    results.append(export_one('tundra-dwarf-willow-01', mesh, os.path.join(SRC_GROUND, 'boreal', 'tundra-dwarf-willow-01.glb'), alpha_mask=True))

    mesh, _ = build_taiga_berry_moss(mats['taiga_berry_moss'])
    results.append(export_one('taiga-berry-moss-01', mesh, os.path.join(SRC_GROUND, 'boreal', 'taiga-berry-moss-01.glb'), alpha_mask=False))

    # 3. Wetland: common-rooted sedge tussock + wetland buttonbush
    mesh, _ = build_coastal_dune_oats(mats['coastal_oats'])
    results.append(export_one('coastal-dune-oats-01', mesh, os.path.join(SRC_GROUND, 'coastal', 'coastal-dune-oats-01.glb'), alpha_mask=True))

    mesh, _ = build_bush_swamp_buttonbush(mats['bush_buttonbush'])
    results.append(export_one('bush-swamp-buttonbush-01', mesh, os.path.join(SRC_BUSHES, 'bush-swamp-buttonbush-01.glb'), alpha_mask=True))

    # 4. Rainforest: layered-frond fern & cupped overlapping broadleaves with visible stems
    mesh, _ = build_rainforest_layered_fern(mat_fern, name='forest-fern-02', seed=701, max_triangles=1999)
    results.append(export_one('forest-fern-02', mesh, os.path.join(SRC_GROUND, 'scans', 'forest-fern-02.glb'), alpha_mask=True))

    mesh, _ = build_rainforest_cupped_broadleaf(mat_elephant, name='elephant_ear', seed=711, style='elephant_ear', max_triangles=306)
    results.append(export_one('elephant_ear', mesh, os.path.join(SRC_GROUND, 'tropical', 'elephant-ear.glb'), alpha_mask=False))

    mesh, _ = build_rainforest_cupped_broadleaf(mat_banana, name='banana_understory', seed=712, style='banana', max_triangles=340)
    results.append(export_one('banana_understory', mesh, os.path.join(SRC_GROUND, 'tropical', 'banana-understory.glb'), alpha_mask=False))

    mesh, _ = build_rainforest_cupped_broadleaf(mat_calathea, name='tropical-calathea-01', seed=713, style='calathea', max_triangles=1500)
    results.append(export_one('tropical-calathea-01', mesh, os.path.join(SRC_GROUND, 'scans', 'tropical-calathea-01.glb'), alpha_mask=False))

    mesh, _ = build_rainforest_cupped_broadleaf(mat_anthurium, name='tropical-anthurium-01', seed=714, style='anthurium', max_triangles=1432)
    results.append(export_one('tropical-anthurium-01', mesh, os.path.join(SRC_GROUND, 'scans', 'tropical-anthurium-01.glb'), alpha_mask=False))

    print('SILHOUETTE_REVISIONS_SUMMARY=' + json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
