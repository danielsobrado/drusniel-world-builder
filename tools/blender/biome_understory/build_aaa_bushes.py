"""Build all AAA shrub models (upgraded existing + new biome variants) into assets/runtime-sources/bushes/.

Uses real CC0 Poly Haven 2K leaf/needle/frond/bark scans via `shrub_atlases.py`
and 3-tier volumetric botanical architectures via `shrub_architecture.py`.
Also converts the two unused Poly Haven shrub scans (`shrub_04` and `didelta_spinosa`)
into game-ready bush GLBs.

Run headless:
  "F:\\Blender 5.2\\blender.exe" -b --factory-startup --python tools/blender/biome_understory/build_aaa_bushes.py -- [--no-render] [--only <name>]
"""
import json
import os
import struct
import sys

import bpy

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
SCANS_DIR = os.path.abspath(os.path.join(THIS_DIR, '..', 'understory_scans'))
for extra in (THIS_DIR, SCANS_DIR):
    if extra not in sys.path:
        sys.path.insert(0, extra)

from shrub_architecture import (  # noqa: E402
    build_bamboo_clump,
    build_coppice_shrub,
    build_dwarf_palm_shrub,
    build_krummholz_juniper,
    build_ocotillo_shrub,
    build_sapling_shrub,
    build_umbrella_thorn_scrub,
)
from shrub_atlases import build_scanned_shrub_material  # noqa: E402
from understory_common import place_and_export, render_preview, save_contact_sheet, setup_scene  # noqa: E402
from build_understory_scans import build as build_scan_asset  # noqa: E402

ROOT = os.path.abspath(os.path.join(THIS_DIR, '..', '..', '..'))
OUT_BUSHES = os.path.join(ROOT, 'assets', 'runtime-sources', 'bushes')
WORK_DIR = os.path.join(ROOT, 'tmp', 'understory', 'aaa-bushes')
TEX_DIR = os.path.join(WORK_DIR, 'textures')
PREVIEW_DIR = os.path.join(WORK_DIR, 'previews')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER = '--no-render' not in argv
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None


def patch_glb_mask_and_dielectric(glb_path, cutoff=0.45):
    """Guarantee alphaMode MASK and metallicFactor 0.0 in exported GLB JSON."""
    data = open(glb_path, 'rb').read()
    length = struct.unpack('<I', data[12:16])[0]
    doc = json.loads(data[20:20 + length])
    for mat in doc.get('materials', []):
        mat['alphaMode'] = 'MASK'
        mat['alphaCutoff'] = cutoff
        pbr = mat.setdefault('pbrMetallicRoughness', {})
        pbr['metallicFactor'] = 0.0
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


def _export_and_preview(name, mesh, preview_dist, look_z, previews):
    out_path = os.path.join(OUT_BUSHES, f'{name}.glb')
    root = place_and_export(name, mesh, out_path, tangents=True)
    patch_glb_mask_and_dielectric(out_path, cutoff=0.45)

    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    zs = [v.co.z for v in mesh.vertices]
    mesh.calc_loop_triangles()
    tris = len(mesh.loop_triangles)
    info = {
        'name': name,
        'triangles': tris,
        'size_xyz_m': [round(max(xs) - min(xs), 2), round(max(zs) - min(zs), 2), round(max(ys) - min(ys), 2)],
        'bytes': os.path.getsize(out_path),
    }
    if RENDER:
        png = os.path.join(PREVIEW_DIR, f'{name}.png')
        render_preview(root, png, preview_dist, look_z)
        previews.append(png)
    for child in list(root.children):
        bpy.data.objects.remove(child)
    bpy.data.objects.remove(root)
    return info


def shrub_specs():
    """All 18 procedural-skeleton + scanned-atlas AAA shrubs (plus 2 direct Poly Haven scans)."""
    return [
        # --- Core Temperate / Meadow / Hedgerow ---
        {
            'name': 'stylized_bush', 'mat_name': 'stylized_bush', 'seed': 501,
            'atlas': dict(bark_id='japanese_zelkova_bark', leaf_source='shrub_04', leaf_count=26, leaf_scale=1.08, width_ratio=1.05, roughness=0.72),
            'build': lambda m: build_coppice_shrub('stylized_bush', m, 501, height=1.22, radius=0.92, cane_count=7, spray_len=0.60, spray_w=0.48),
            'cam': (2.6, 0.55),
        },
        {
            'name': 'small_bush', 'mat_name': 'bush_leaf', 'seed': 502,
            'atlas': dict(bark_id='japanese_zelkova_bark', leaf_source='mixed', leaf_count=28, leaf_scale=0.92, width_ratio=1.0, roughness=0.74),
            'build': lambda m: build_coppice_shrub('small_bush', m, 502, height=0.68, radius=0.68, cane_count=6, cane_radius=0.018, spray_len=0.44, spray_w=0.38, droop=0.18),
            'cam': (1.9, 0.32),
        },
        {
            'name': 'bush2', 'mat_name': 'Leaves', 'seed': 503,
            'atlas': dict(bark_id='bark_brown_02', leaf_source='island', leaf_count=26, leaf_scale=1.05, width_ratio=0.92, roughness=0.70),
            'build': lambda m: build_coppice_shrub('bush2', m, 503, height=1.85, radius=1.18, cane_count=8, cane_radius=0.032, spray_len=0.72, spray_w=0.58, droop=0.12),
            'cam': (3.5, 0.85),
        },
        {
            'name': 'bush', 'mat_name': 'vetka_kusta', 'seed': 504,
            'atlas': dict(bark_id='japanese_zelkova_bark', leaf_source='island', leaf_count=24, leaf_scale=1.0, width_ratio=0.95, roughness=0.70),
            'build': lambda m: build_sapling_shrub('bush', m, 504, height=1.78, radius=0.82, conifer=False),
            'cam': (3.2, 0.88),
        },
        {
            'name': 'bush-meadow-gorse-01', 'mat_name': 'BushMeadowGorse', 'seed': 505,
            'atlas': dict(
                bark_id='bark_brown_02', leaf_source='jacaranda', leaf_count=24, leaf_scale=0.96, width_ratio=0.78,
                blossoms=((0.95, 0.78, 0.14), 0.048, 12, 5), roughness=0.74,
            ),
            'build': lambda m: build_coppice_shrub('bush-meadow-gorse-01', m, 505, height=1.08, radius=0.88, cane_count=7, cane_radius=0.022, spray_len=0.56, spray_w=0.44, droop=0.10),
            'cam': (2.5, 0.50),
        },
        {
            'name': 'bush-forest-rhododendron-01', 'mat_name': 'BushForestRhododendron', 'seed': 506,
            'atlas': dict(
                bark_id='bark_brown_02', leaf_source='island', leaf_count=26, leaf_scale=1.18, width_ratio=1.08,
                leaf_tint=(0.82, 0.94, 0.86), blossoms=((0.86, 0.56, 0.74), 0.052, 5, 5), roughness=0.58, target_luma=0.38,
            ),
            'build': lambda m: build_coppice_shrub('bush-forest-rhododendron-01', m, 506, height=1.32, radius=1.04, cane_count=7, cane_radius=0.028, spray_len=0.64, spray_w=0.54, droop=0.16),
            'cam': (2.8, 0.62),
        },
        # --- Boreal / Taiga / Tundra ---
        {
            'name': 'bush-boreal-juniper-01', 'mat_name': 'BushBorealJuniper', 'seed': 507,
            'atlas': dict(
                bark_id='knotted_pine_bark', style='conifer',
                blossoms=((0.34, 0.48, 0.64), 0.032, 10), roughness=0.74, target_luma=0.39,
            ),
            'build': lambda m: build_krummholz_juniper('bush-boreal-juniper-01', m, 507),
            'cam': (2.6, 0.50),
        },
        {
            'name': 'bush-taiga-sapling-01', 'mat_name': 'BushTaigaSapling', 'seed': 508,
            'atlas': dict(bark_id='pine_bark', style='conifer', roughness=0.74, target_luma=0.39),
            'build': lambda m: build_sapling_shrub('bush-taiga-sapling-01', m, 508, height=1.92, radius=0.76, conifer=True),
            'cam': (3.3, 0.90),
        },
        {
            'name': 'bush-boreal-bilberry-01', 'mat_name': 'BushBorealBilberry', 'seed': 509,
            'atlas': dict(
                bark_id='knotted_pine_bark', leaf_source='shrub_04', leaf_count=30, leaf_scale=0.82, width_ratio=1.05,
                blossoms=((0.24, 0.24, 0.42), 0.030, 12, 1), roughness=0.72,
            ),
            'build': lambda m: build_coppice_shrub('bush-boreal-bilberry-01', m, 509, height=0.58, radius=0.64, cane_count=6, cane_radius=0.015, spray_len=0.40, spray_w=0.36, droop=0.18),
            'cam': (1.8, 0.28),
        },
        # --- Wetland / Swamp / Riverbank ---
        {
            'name': 'bush-swamp-buttonbush-01', 'mat_name': 'BushSwampButtonbush', 'seed': 510,
            'atlas': dict(
                bark_id='bark_brown_02', leaf_source='shrub_04', leaf_count=26, leaf_scale=1.06, width_ratio=1.02,
                blossoms=((0.94, 0.90, 0.72), 0.046, 9, 1), roughness=0.66,
            ),
            'build': lambda m: build_coppice_shrub('bush-swamp-buttonbush-01', m, 510, height=1.38, radius=0.98, cane_count=7, cane_radius=0.026, spray_len=0.62, spray_w=0.50, droop=0.15),
            'cam': (2.8, 0.65),
        },
        {
            'name': 'bush-wetland-willow-01', 'mat_name': 'BushWetlandWillow', 'seed': 511,
            'atlas': dict(bark_id='bark_brown_02', leaf_source='shrub_04', leaf_count=28, leaf_scale=1.10, width_ratio=0.72, roughness=0.68),
            'build': lambda m: build_coppice_shrub('bush-wetland-willow-01', m, 511, height=1.68, radius=1.12, cane_count=8, cane_radius=0.026, spray_len=0.68, spray_w=0.48, droop=0.32),
            'cam': (3.2, 0.75),
        },
        # --- Tropical Rainforest & Seasonal Forest ---
        {
            'name': 'bush-tropical-hibiscus-01', 'mat_name': 'BushTropicalHibiscus', 'seed': 512,
            'atlas': dict(
                bark_id='bark_brown_02', leaf_source='island', leaf_count=26, leaf_scale=1.12, width_ratio=1.06,
                blossoms=((0.88, 0.20, 0.22), 0.060, 8, 5), roughness=0.60,
            ),
            'build': lambda m: build_coppice_shrub('bush-tropical-hibiscus-01', m, 512, height=1.42, radius=1.02, cane_count=7, cane_radius=0.026, spray_len=0.64, spray_w=0.54, droop=0.12),
            'cam': (2.9, 0.68),
        },
        {
            'name': 'bush-tropical-palm-shrub-01', 'mat_name': 'BushTropicalPalmShrub', 'seed': 513,
            'atlas': dict(bark_id='bark_brown_02', style='palm', roughness=0.56, target_luma=0.41),
            'build': lambda m: build_dwarf_palm_shrub('bush-tropical-palm-shrub-01', m, 513, height=1.55, radius=1.22),
            'cam': (3.1, 0.68),
        },
        {
            'name': 'bamboo_bush', 'mat_name': 'phong1SG', 'seed': 514,
            'atlas': dict(
                bark_id='japanese_zelkova_bark', leaf_source='island', leaf_count=28, leaf_scale=1.04, width_ratio=0.62,
                leaf_tint=(0.94, 1.05, 0.86), roughness=0.62,
            ),
            'build': lambda m: build_bamboo_clump('bamboo_bush', m, 514, height=2.35),
            'cam': (3.9, 1.15),
        },
        # --- Savanna / Arid / Steppe / Badlands ---
        {
            'name': 'bush-savanna-thorn-01', 'mat_name': 'BushSavannaThorn', 'seed': 515,
            'atlas': dict(
                bark_id='knotted_pine_bark', leaf_source='scrub_mixed', leaf_count=32, leaf_scale=0.98, width_ratio=0.90,
                blossoms=((0.94, 0.80, 0.24), 0.042, 10, 1), roughness=0.76,
            ),
            'build': lambda m: build_umbrella_thorn_scrub('bush-savanna-thorn-01', m, 515, height=1.28, radius=1.12),
            'cam': (3.0, 0.60),
        },
        {
            'name': 'bush-arid-rooibos-01', 'mat_name': 'BushAridRooibos', 'seed': 516,
            'atlas': dict(
                bark_id='knotted_pine_bark', leaf_source='scrub_mixed', leaf_count=32, leaf_scale=0.86, width_ratio=0.82,
                leaf_tint=(1.04, 0.96, 0.80), roughness=0.78,
            ),
            'build': lambda m: build_coppice_shrub('bush-arid-rooibos-01', m, 516, height=0.96, radius=0.84, cane_count=6, cane_radius=0.020, spray_len=0.50, spray_w=0.40, droop=0.14),
            'cam': (2.3, 0.45),
        },
        {
            'name': 'bush-arid-ocotillo-01', 'mat_name': 'BushAridOcotillo', 'seed': 517,
            'atlas': dict(
                bark_id='knotted_pine_bark', leaf_source='shrub_04', leaf_count=28, leaf_scale=0.86, width_ratio=0.78,
                blossoms=((0.96, 0.30, 0.12), 0.070, 11, 5), roughness=0.78,
            ),
            'build': lambda m: build_ocotillo_shrub('bush-arid-ocotillo-01', m, 517, height=1.82),
            'cam': (3.3, 0.90),
        },
        {
            'name': 'bush-steppe-sagebrush-01', 'mat_name': 'BushSteppeSagebrush', 'seed': 518,
            'atlas': dict(
                bark_id='knotted_pine_bark', leaf_source='scrub_mixed', leaf_count=32, leaf_scale=0.86, width_ratio=0.88,
                leaf_tint=(0.92, 0.98, 0.94), roughness=0.80, target_luma=0.44,
            ),
            'build': lambda m: build_coppice_shrub('bush-steppe-sagebrush-01', m, 518, height=0.86, radius=0.88, cane_count=6, cane_radius=0.026, spray_len=0.48, spray_w=0.44, droop=0.08),
            'cam': (2.3, 0.42),
        },
        # --- Additional Distinct Biome Variants built from Poly Haven shrub_04 & didelta_spinosa leaf scans ---
        {
            'name': 'bush-woodland-shrub-04', 'mat_name': 'BushWoodlandShrub04', 'seed': 519,
            'atlas': dict(
                bark_id='japanese_zelkova_bark', leaf_source='shrub_04', leaf_count=30, leaf_scale=0.96, width_ratio=1.08,
                leaf_tint=(0.94, 1.02, 0.90), roughness=0.72,
            ),
            'build': lambda m: build_coppice_shrub('bush-woodland-shrub-04', m, 519, height=1.02, radius=1.08, cane_count=8, cane_radius=0.022, spray_len=0.54, spray_w=0.48, droop=0.22, asymmetry=0.28),
            'cam': (2.7, 0.48),
        },
        {
            'name': 'bush-arid-didelta-01', 'mat_name': 'BushAridDidelta', 'seed': 520,
            'atlas': dict(
                bark_id='knotted_pine_bark', leaf_source='didelta', leaf_count=28, leaf_scale=0.96, width_ratio=1.08,
                blossoms=((0.96, 0.84, 0.16), 0.062, 10, 8), roughness=0.74,
            ),
            'build': lambda m: build_coppice_shrub('bush-arid-didelta-01', m, 520, height=0.92, radius=0.94, cane_count=6, cane_radius=0.022, spray_len=0.48, spray_w=0.44, droop=0.10, asymmetry=0.24),
            'cam': (2.4, 0.44),
        },
    ]


def scan_shrub_specs():
    """Keep direct scan conversion empty; shrub_04 & didelta_spinosa leaf scans are built cleanly above."""
    return []


def main():
    for d in (OUT_BUSHES, TEX_DIR, PREVIEW_DIR):
        os.makedirs(d, exist_ok=True)
    setup_scene()
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 512, 420

    report = []
    previews = []

    for spec in shrub_specs():
        if ONLY and spec['name'] != ONLY:
            continue
        mat = build_scanned_shrub_material(TEX_DIR, spec['mat_name'], spec['name'], spec['seed'], **spec['atlas'])
        mesh, _ = spec['build'](mat)
        info = _export_and_preview(spec['name'], mesh, spec['cam'][0], spec['cam'][1], previews)
        report.append(info)
        print(f"[aaa-bush] {info['name']:30s} {info['triangles']:5d} tris  size={info['size_xyz_m']}  {info['bytes'] // 1024}K", flush=True)

    for scan_asset in scan_shrub_specs():
        if ONLY and scan_asset['name'] != ONLY:
            continue
        r = build_scan_asset(scan_asset, RENDER)
        report.append({
            'name': r['name'],
            'triangles': r['finalTriangles'],
            'size_xyz_m': r['sizeMetres'],
            'bytes': r['bytes'],
            'coverage': r['coverage'],
        })
        if RENDER and r.get('preview') and os.path.exists(r['preview']):
            previews.append(r['preview'])
        print(f"[scan-bush] {r['name']:29s} {r['finalTriangles']:5d} tris  size={r['sizeMetres']}  cov={r['coverage']}  {r['bytes'] // 1024}K", flush=True)

    with open(os.path.join(WORK_DIR, 'report.json'), 'w') as fh:
        json.dump(report, fh, indent=2)
    if RENDER and previews:
        sheet = os.path.join(WORK_DIR, 'contact-sheet.png')
        save_contact_sheet(previews, sheet, cols=5)
        print(f'Saved contact sheet -> {sheet}', flush=True)


if __name__ == '__main__':
    main()
