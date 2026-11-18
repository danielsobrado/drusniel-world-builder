"""Render organized PBR studio review screenshots & contact sheets for all >=15k meshes.

Outputs into docs/qa/mesh-review-15k/:
- biomes/<id>.png + biome_<biomeId>_sheet.png + contact_sheet_biomes.png (80 biome meshes)
- trunks_and_bushes/<name>.png + contact_sheet_trunks_bushes.png (trunks, swamp, understories, bushes)
- cities/<city>/<module>.png + city_<city>_sheet.png + contact_sheet_cities.png (40 city props)
- underground/<area>/<name>.png + area_<area>_sheet.png + contact_sheet_underground.png (30 area props)
- index.html + README.md review gallery
"""
import html
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector
import numpy as np

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(THIS_DIR, '..', '..'))
OUT_DIR = os.path.join(REPO_ROOT, 'docs', 'qa', 'mesh-review-15k')
MEDKIT_MODULES = os.path.join(THIS_DIR, 'medieval_town_kit')
if MEDKIT_MODULES not in sys.path:
    sys.path.insert(0, MEDKIT_MODULES)

RES_X = 512
RES_Y = 384

CITIES = (
    ('Tudor', ('Tudor_Market_Pavilion', 'Tudor_Dovecote_Post', 'Tudor_Flower_Trellis_Arch', 'Tudor_Watch_Lantern_Gallows', 'Tudor_Guild_Display_Cart')),
    ('Nordic', ('Nordic_Dragon_Totem_Post', 'Nordic_Brewery_Cask_Rack', 'Nordic_Mead_Hall_Brazier', 'Nordic_Furs_Tanning_Frame', 'Nordic_Skiff_Drydock_Hull')),
    ('Med', ('Med_Amphora_Terrace_Stand', 'Med_Cypress_Urn_Planter', 'Med_Sun_Arbor_Pergola', 'Med_Marble_Lion_Fountain', 'Med_Merchant_Scale_Counter')),
    ('Goblin', ('Goblin_Scrap_Still_Boiler', 'Goblin_Cage_Spike_Gibbet', 'Goblin_Salvage_Trophy_Totem', 'Goblin_Bog_Mushroom_Coop', 'Goblin_Tinker_Scrap_Cart')),
    ('Orc', ('Orc_Warchief_Drum_Pavilion', 'Orc_Bone_Spike_Barricade', 'Orc_Forge_Quench_Anvil_Rig', 'Orc_Hide_Rack_Trophy_Frame', 'Orc_Charred_Idol_Pillar')),
    ('Frostgard', ('Frostgard_Ice_Saw_Rack', 'Frostgard_Hearth_Kettle_Shelter', 'Frostgard_Runic_Lantern_Post', 'Frostgard_Wolf_Pelt_Sled', 'Frostgard_Rime_Shrine_Cairn')),
    ('Stonehold', ('Stonehold_Steam_Exhaust_Monument', 'Stonehold_Rune_Forge_Pedestal', 'Stonehold_Aqueduct_Spout', 'Stonehold_Ore_Classifier_Chute', 'Stonehold_Ancestral_Stele')),
    ('Umbrakor', ('Umbrakor_Spider_Silk_Obelisk', 'Umbrakor_Bioluminescent_Cap_Shrine', 'Umbrakor_Wrought_Censer_Gallows', 'Umbrakor_Night_Market_Canopy', 'Umbrakor_Abyssal_Waystone')),
)


def _setup_studio_scene(clear=True):
    if clear:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = RES_X
    scene.render.resolution_y = RES_Y
    scene.render.image_settings.file_format = 'PNG'
    if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'taa_render_samples'):
        scene.eevee.taa_render_samples = 16
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.exposure = 0.25

    world = bpy.data.worlds.get('ReviewWorld') or bpy.data.worlds.new('ReviewWorld')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0.34, 0.40, 0.48, 1.0)
        bg.inputs['Strength'].default_value = 0.9

    def add_sun(name, energy, rot, color=(1.0, 1.0, 1.0)):
        data = bpy.data.lights.new(name, 'SUN')
        data.energy = energy
        data.color = color
        obj = bpy.data.objects.new(name, data)
        obj.rotation_euler = rot
        scene.collection.objects.link(obj)
        return obj

    key = add_sun('ReviewKeySun', 3.4, (0.78, 0.18, 0.72), (1.0, 0.96, 0.90))
    fill = add_sun('ReviewFillSun', 1.35, (0.92, -0.35, -2.05), (0.78, 0.88, 1.0))
    rim = add_sun('ReviewRimSun', 1.25, (1.15, 0.0, 2.75), (0.95, 0.98, 1.0))

    cam_data = bpy.data.cameras.new('ReviewCam')
    cam_data.lens = 50.0
    cam = bpy.data.objects.new('ReviewCam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    ground_mesh = bpy.data.meshes.new('ReviewGroundMesh')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=14.0)
    bm.to_mesh(ground_mesh)
    bm.free()
    ground = bpy.data.objects.new('ReviewGround', ground_mesh)
    gm = bpy.data.materials.new('ReviewGroundMat')
    gm.use_nodes = True
    bsdf = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.14, 0.135, 0.125, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.88
    ground_mesh.materials.append(gm)
    scene.collection.objects.link(ground)

    return {'studio_objs': {key, fill, rim, cam, ground}, 'cam': cam, 'ground': ground}


def _world_bbox_and_tris(mesh_objs):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    tris = 0
    found = False
    for o in mesh_objs:
        if o.type != 'MESH' or not o.data:
            continue
        found = True
        tris += sum(max(1, len(p.vertices) - 2) for p in o.data.polygons)
        mat = o.matrix_world
        for corner in o.bound_box:
            wp = mat @ Vector(corner)
            mins.x = min(mins.x, wp.x)
            mins.y = min(mins.y, wp.y)
            mins.z = min(mins.z, wp.z)
            maxs.x = max(maxs.x, wp.x)
            maxs.y = max(maxs.y, wp.y)
            maxs.z = max(maxs.z, wp.z)
    if not found:
        return Vector((0, 0, 0)), Vector((0.5, 0.5, 0.5)), 0
    return mins, maxs, tris


def _frame_and_render(studio, target_objs, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    mins, maxs, tris = _world_bbox_and_tris(target_objs)
    cx = 0.5 * (mins.x + maxs.x)
    cy = 0.5 * (mins.y + maxs.y)
    # Lock receiver plane to z=0 when object rests at standard origin grade, else bottom.
    ground_z = 0.0 if (mins.z <= 0.10 and maxs.z >= 0.05) else mins.z
    studio['ground'].location = Vector((cx, cy, ground_z))
    studio['ground'].hide_render = False

    vis_min_z = max(mins.z, ground_z)
    span_x = max(0.15, maxs.x - mins.x)
    span_y = max(0.15, maxs.y - mins.y)
    span_z = max(0.20, maxs.z - vis_min_z)
    look_at = Vector((cx, cy, vis_min_z + span_z * 0.44))
    radius = max(math.hypot(span_x, span_y) * 0.52, span_z * 0.62, 0.22)
    dist = radius / math.tan(math.radians(12.8))

    view_dir = Vector((0.76, -0.82, 0.44)).normalized()
    cam_pos = look_at + view_dir * dist
    cam_pos.z = max(ground_z + 0.14, cam_pos.z)
    cam = studio['cam']
    cam.location = cam_pos
    cam.rotation_euler = (look_at - cam_pos).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = max(0.01, dist * 0.01)
    cam.data.clip_end = max(100.0, dist * 16.0)
    bpy.context.view_layer.update()

    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    return tris


def _assemble_contact_sheet(paths, out_path, cols=5, pad=6):
    imgs = []
    for p in paths:
        if not os.path.exists(p):
            continue
        img = bpy.data.images.load(p, check_existing=False)
        w, h = img.size
        arr = np.array(img.pixels[:], dtype=np.float32).reshape((h, w, 4))
        imgs.append(np.flipud(arr))
        bpy.data.images.remove(img)
    if not imgs:
        return
    cell_h, cell_w, _ = imgs[0].shape
    rows = math.ceil(len(imgs) / cols)
    total_w = cols * cell_w + (cols + 1) * pad
    total_h = rows * cell_h + (rows + 1) * pad
    canvas = np.zeros((total_h, total_w, 4), dtype=np.float32)
    canvas[..., :3] = (0.09, 0.10, 0.12)
    canvas[..., 3] = 1.0
    for idx, arr in enumerate(imgs):
        r, c = divmod(idx, cols)
        y0 = pad + r * (cell_h + pad)
        x0 = pad + c * (cell_w + pad)
        canvas[y0:y0 + cell_h, x0:x0 + cell_w] = arr
    out = bpy.data.images.new('_sheet_tmp', width=total_w, height=total_h, alpha=True)
    out.pixels.foreach_set(np.flipud(canvas).ravel().tolist())
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out.filepath_raw = out_path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)


def _render_glb_batch(studio, items, sub_dir, sheet_name=None):
    results = []
    paths = []
    for label, glb_path, group in items:
        if not os.path.exists(glb_path):
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        bpy.context.view_layer.update()
        imported = [o for o in bpy.data.objects if o not in before]
        mesh_objs = [o for o in imported if o.type == 'MESH']
        rel = os.path.join(sub_dir, f'{label}.png').replace('\\', '/')
        out_path = os.path.join(OUT_DIR, rel)
        tris = _frame_and_render(studio, mesh_objs, out_path)
        for o in imported:
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
        paths.append(out_path)
        results.append({'name': label, 'group': group, 'triangles': tris, 'image': rel, 'source': os.path.relpath(glb_path, REPO_ROOT).replace('\\', '/')})
    if sheet_name and paths:
        _assemble_contact_sheet(paths, os.path.join(OUT_DIR, sheet_name))
    return results


def _collect_trunks_and_bushes():
    items = []
    ground_root = os.path.join(REPO_ROOT, 'assets', 'runtime-sources', 'ground')
    for root, _, files in os.walk(ground_root):
        if os.path.basename(root) == 'biomes':
            continue
        rel_dir = os.path.relpath(root, ground_root)
        for fn in sorted(files):
            if not fn.endswith('.glb'):
                continue
            stem = os.path.splitext(fn)[0]
            group = 'trunks' if rel_dir == 'trunks' else rel_dir
            items.append((f'{group}__{stem}' if rel_dir not in ('trunks', '.') else stem, os.path.join(root, fn), group))
    bush_dir = os.path.join(REPO_ROOT, 'assets', 'runtime-sources', 'bushes')
    for fn in sorted(os.listdir(bush_dir)):
        if fn.endswith('.glb'):
            items.append((os.path.splitext(fn)[0], os.path.join(bush_dir, fn), 'bushes'))
    return items


def _render_cities():
    blend_path = os.path.join(REPO_ROOT, 'assets-src', 'medieval-town-kit', 'medieval_town_kit.blend')
    bpy.ops.wm.open_mainfile(filepath=blend_path)
    studio = _setup_studio_scene(clear=False)
    for o in bpy.data.objects:
        if o not in studio['studio_objs']:
            o.hide_render = True

    all_paths = []
    results = []
    for city, names in CITIES:
        city_paths = []
        for mod_name in names:
            obj = bpy.data.objects.get(mod_name)
            if not obj:
                continue
            targets = [obj] + [c for c in obj.children_recursive if c.type == 'MESH']
            for t in targets:
                t.hide_render = False
            rel = f'cities/{city.lower()}/{mod_name}.png'
            out_path = os.path.join(OUT_DIR, rel)
            tris = _frame_and_render(studio, [t for t in targets if t.type == 'MESH'], out_path)
            for t in targets:
                t.hide_render = True
            city_paths.append(out_path)
            all_paths.append(out_path)
            results.append({'name': mod_name, 'group': city, 'triangles': tris, 'image': rel, 'source': 'assets-src/medieval-town-kit/medieval_town_kit.blend'})
        _assemble_contact_sheet(city_paths, os.path.join(OUT_DIR, 'cities', f'city_{city.lower()}_sheet.png'), cols=5)
    _assemble_contact_sheet(all_paths, os.path.join(OUT_DIR, 'contact_sheet_cities.png'), cols=5)
    return results


def _write_reports(sections):
    html_parts = [
        '<!doctype html><html lang="en"><head><meta charset="utf-8">',
        '<title>Drusniel >=15k PBR Mesh Review</title>',
        '<style>body{font-family:system-ui,sans-serif;background:#14161a;color:#e6eaef;margin:24px;}',
        'h1,h2,h3{color:#fff;} .sheets{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px;margin-bottom:28px;}',
        '.sheet-card,.card{background:#1d2128;border:1px solid #2d333d;border-radius:8px;padding:10px;}',
        '.sheet-card img,.card img{width:100%;height:auto;border-radius:4px;display:block;background:#0e1014;}',
        '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:28px;}',
        '.meta{font-size:12px;color:#9aa6b8;margin-top:6px;} .title{font-weight:600;font-size:13px;color:#f3f6fa;word-break:break-word;}</style></head><body>',
        '<h1>Headless Blender >=15k PBR Mesh Review</h1>',
        '<div class="sheets">',
    ]
    for title, sheet in (
        ('80 Biome Flora Contact Sheet', 'contact_sheet_biomes.png'),
        ('Trunks, Understories & Bushes Contact Sheet', 'contact_sheet_trunks_bushes.png'),
        ('40 City Variant Props Contact Sheet', 'contact_sheet_cities.png'),
        ('30 Underground & Glacial Area Props Contact Sheet', 'contact_sheet_underground.png'),
    ):
        html_parts.append(f'<div class="sheet-card"><h3>{html.escape(title)}</h3><a href="{sheet}"><img src="{sheet}"></a></div>')
    html_parts.append('</div>')

    md_lines = [
        '# Headless Blender >=15k PBR Mesh Review Screenshots',
        '',
        'Contact sheets:',
        '- `contact_sheet_biomes.png` (80 meshes across 16 biomes)',
        '- `contact_sheet_trunks_bushes.png` (trunks, swamp, biome understories, bushes)',
        '- `contact_sheet_cities.png` (40 city props across 8 cities)',
        '- `contact_sheet_underground.png` (30 props across 6 underground & glacial areas)',
        '',
    ]
    for sec_title, items in sections:
        html_parts.append(f'<h2>{html.escape(sec_title)} ({len(items)})</h2><div class="grid">')
        md_lines.append(f'## {sec_title} ({len(items)})')
        for item in items:
            img = html.escape(item['image'])
            nm = html.escape(item['name'])
            grp = html.escape(str(item['group']))
            tris = item['triangles']
            html_parts.append(
                f'<div class="card"><a href="{img}"><img loading="lazy" src="{img}"></a>'
                f'<div class="title">{nm}</div><div class="meta">{grp} — {tris:,} tris</div></div>'
            )
            md_lines.append(f"- `{item['image']}` — {item['group']} / `{item['name']}` ({tris:,} tris)")
        html_parts.append('</div>')
        md_lines.append('')
    html_parts.append('</body></html>')

    with open(os.path.join(OUT_DIR, 'index.html'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(html_parts))
    with open(os.path.join(OUT_DIR, 'README.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(md_lines))


def main():
    only = None
    if '--' in sys.argv:
        argv = sys.argv[sys.argv.index('--') + 1:]
        if '--only' in argv:
            only = argv[argv.index('--only') + 1]

    os.makedirs(OUT_DIR, exist_ok=True)
    studio = _setup_studio_scene(clear=True)

    biome_results = []
    tb_results = []
    ug_results = []
    city_results = []

    if only in (None, 'biomes'):
        # 1. Biomes (80 biome flora meshes from biomes/manifest.json)
        biome_manifest = json.load(open(os.path.join(REPO_ROOT, 'assets', 'runtime-sources', 'ground', 'biomes', 'manifest.json'), encoding='utf-8'))
        biome_items = []
        by_biome = {}
        for entry in biome_manifest['assets']:
            if entry['kind'] == 'trunk':
                continue
            p = os.path.join(REPO_ROOT, entry['path'])
            bid = entry['biomeId']
            item = (entry['id'], p, f'biome_{bid}')
            biome_items.append(item)
            by_biome.setdefault(bid, []).append(item)
        biome_results = _render_glb_batch(studio, biome_items, 'biomes', 'contact_sheet_biomes.png')
        for bid, group_items in sorted(by_biome.items()):
            paths = [os.path.join(OUT_DIR, 'biomes', f'{name}.png') for name, _, _ in group_items]
            _assemble_contact_sheet(paths, os.path.join(OUT_DIR, 'biomes', f'biome_{bid}_sheet.png'), cols=5)

    if only in (None, 'trunks'):
        # 2. Trunks, Swamp, Understory & Bushes
        tb_items = _collect_trunks_and_bushes()
        tb_results = _render_glb_batch(studio, tb_items, 'trunks_and_bushes', 'contact_sheet_trunks_bushes.png')

    if only in (None, 'underground'):
        # 3. Underground & Glacial Areas (30 props)
        ug_manifest = json.load(open(os.path.join(REPO_ROOT, 'assets', 'runtime-sources', 'underground', 'manifest.json'), encoding='utf-8'))
        all_ug_paths = []
        for area, items in ug_manifest['areas'].items():
            area_items = [(it['name'], os.path.join(REPO_ROOT, 'assets', 'runtime-sources', 'underground', it['file']), area) for it in items]
            area_res = _render_glb_batch(studio, area_items, f'underground/{area}', f'underground/area_{area}_sheet.png')
            ug_results.extend(area_res)
            all_ug_paths.extend(os.path.join(OUT_DIR, r['image']) for r in area_res)
        _assemble_contact_sheet(all_ug_paths, os.path.join(OUT_DIR, 'contact_sheet_underground.png'), cols=5)

    if only in (None, 'cities'):
        # 4. 40 City Props from medieval_town_kit.blend
        city_results = _render_cities()

    if only is None:
        _write_reports([
            ('Biome Flora & Understory (16 Biomes x 5)', biome_results),
            ('Trunks, Swamp, Understories & Bushes', tb_results),
            ('City Props (8 Cities x 5)', city_results),
            ('Underground & Glacial Area Props (6 Areas x 5)', ug_results),
        ])
    total = len(biome_results) + len(tb_results) + len(city_results) + len(ug_results)
    print(f'[mesh-review] rendered {total} screenshots -> {OUT_DIR}')


if __name__ == '__main__':
    main()
