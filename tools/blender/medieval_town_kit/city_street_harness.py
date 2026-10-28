"""Fast Blender viewing & iteration harness for medieval-town-kit objects,
Stonehold Vondari Dwarven stone formations, D&D / Baldur's Gate street modules,
and regional city street views across all 7 city families.

Usage examples:
  blender --background --python tools/blender/medieval_town_kit/city_street_harness.py -- --mode all
  blender --background --python tools/blender/medieval_town_kit/city_street_harness.py -- --mode objects --objects Street_Arch_Stone,Smelter_Stack
  blender --background --python tools/blender/medieval_town_kit/city_street_harness.py -- --mode cities --families Tudor,Stonehold
"""
import argparse
import math
import os
import shutil
import sys
import bpy
from mathutils import Vector

KIT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(KIT_DIR, "..", "..", ".."))
if KIT_DIR not in sys.path:
    sys.path.insert(0, KIT_DIR)

from medkit import (catalog, config, export, game_look, goblin_plan, materials,
                    prefab_export, render, textures, village, village_plan)
from medkit.config import GRID, TERRACE
from medkit.prefabs import PrefabBuilder
from medkit.village_generator import GeneratedVillage

PREVIEW_DIR = os.path.join(REPO, "assets-src", "medieval-town-kit", "previews")
REVIEW_DIR = os.path.join(PREVIEW_DIR, "review")
DIR_MODULES = os.path.join(REVIEW_DIR, "01_individual_modules")
DIR_BUILDINGS = os.path.join(REVIEW_DIR, "02_individual_buildings")
DIR_SCENES = os.path.join(REVIEW_DIR, "03_scenes_together")
DIR_STONEHOLD = os.path.join(REVIEW_DIR, "04_stonehold_formations")
DIR_STREETS = os.path.join(REVIEW_DIR, "05_city_streets")

for d in (DIR_MODULES, DIR_BUILDINGS, DIR_SCENES, DIR_STONEHOLD, DIR_STREETS):
    os.makedirs(d, exist_ok=True)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Fast Blender harness for objects & city streets")
    parser.add_argument("--mode", default="all",
                        help="Comma-separated modes: all, objects, stonehold, street-modules, cities, export")
    parser.add_argument("--objects", default="", help="Comma-separated module or prefab names")
    parser.add_argument("--families", default="Tudor,Nordic,Med,Goblin,Orc,Frostgard,Stonehold",
                        help="Comma-separated city families to render")
    parser.add_argument("--samples", type=int, default=48, help="EEVEE TAA render samples")
    return parser.parse_args(argv)


def clear_town_collections():
    """Remove Town_* collections and their objects so the next city builds cleanly."""
    for cname in ('Town_Terrain', 'Town_Buildings', 'Town_Props', 'Town_Lights'):
        coll = bpy.data.collections.get(cname)
        if not coll:
            continue
        for ob in list(coll.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(coll)


def main():
    args = parse_args()
    modes = {m.strip() for m in args.mode.split(",") if m.strip()}
    if "all" in modes:
        modes |= {"stonehold", "street-modules", "cities", "export"}
    config.LOD = 0
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images = textures.generate(config.TEXTURE_DIR)
    materials.build(images)
    kit = catalog.build_kit()
    prefabs = PrefabBuilder(kit).build_all()

    if "export" in modes:
        os.makedirs(config.EXPORT_DIR, exist_ok=True)
        export.kit_glb(kit, config.EXPORT_DIR)
        prefab_export.export(prefabs, kit.modules.keys(), config.EXPORT_DIR)

    render.setup_scene(look='storybook')
    sc = bpy.context.scene
    sc.eevee.taa_render_samples = args.samples

    for c in ('Kit', 'Prefabs', 'Town'):
        coll = bpy.data.collections.get(c)
        if coll:
            coll.hide_render = True

    stage_coll = bpy.data.collections.new('HarnessStage')
    sc.collection.children.link(stage_coll)

    # Warm parchment-stone studio floor for individual object/formation inspection
    stage_floor_mesh = bpy.data.meshes.new('HarnessFloorMesh')
    stage_floor_mesh.from_pydata(
        [(-160, -160, -0.005), (160, -160, -0.005), (160, 160, -0.005), (-160, 160, -0.005)],
        [], [(0, 1, 2, 3)]
    )
    uv_layer = stage_floor_mesh.uv_layers.new(name='UVMap')
    for loop_idx, uv_pt in enumerate(((0.0, 0.0), (16.0, 0.0), (16.0, 16.0), (0.0, 16.0))):
        uv_layer.data[loop_idx].uv = uv_pt
    col_layer = stage_floor_mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for loop_idx in range(4):
        col_layer.data[loop_idx].color = (1.0, 1.0, 1.0, 1.0)
    stage_floor = bpy.data.objects.new('HarnessFloor', stage_floor_mesh)
    stage_coll.objects.link(stage_floor)

    ped_mat = bpy.data.materials.new('HarnessStageMat')
    ped_mat.use_nodes = True
    bsdf = next(n for n in ped_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.26, 0.23, 0.19, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.85
    stage_floor_mesh.materials.append(ped_mat)

    cam_data = bpy.data.cameras.new('HarnessCam')
    cam_data.clip_end = 600
    cam_ob = bpy.data.objects.new('HarnessCam', cam_data)
    stage_coll.objects.link(cam_ob)

    def add_point_light(name, loc, energy, color=(1.0, 0.48, 0.14), radius=0.35):
        ld = bpy.data.lights.new(name, type='POINT')
        ld.energy = energy
        ld.color = color
        ld.shadow_soft_size = radius
        ob = bpy.data.objects.new(name, ld)
        stage_coll.objects.link(ob)
        ob.location = loc
        return ob

    def place_kit_clone(mod_name, loc=(0, 0, 0), rot_z=0.0):
        src = bpy.data.objects.get(mod_name)
        if src is None:
            print(f"[harness] Warning: module {mod_name} not found")
            return None
        inst = bpy.data.objects.new(f"HR_{mod_name}", src.data)
        inst.location = loc
        inst.rotation_euler = (0.0, 0.0, rot_z)
        stage_coll.objects.link(inst)
        return inst

    def place_prefab_clone(prefab_name, loc=(0, 0, 0), rot_z=0.0):
        root = bpy.data.objects.get(f"BLD_{prefab_name}")
        if root is None:
            print(f"[harness] Warning: prefab BLD_{prefab_name} not found")
            return []
        bpy.context.view_layer.update()
        root_inv = root.matrix_world.inverted()
        child_meshes = [ch for ch in root.children_recursive if ch.type == 'MESH']
        local_pts = [root_inv @ (ch.matrix_world @ Vector(c)) for ch in child_meshes for c in ch.bound_box]
        if local_pts:
            cx = 0.5 * (min(p.x for p in local_pts) + max(p.x for p in local_pts))
            cy = 0.5 * (min(p.y for p in local_pts) + max(p.y for p in local_pts))
        else:
            cx, cy = 0.0, 0.0
        from mathutils import Matrix
        center_shift = Matrix.Translation((-cx, -cy, 0.0))
        created = []
        parent = bpy.data.objects.new(f"HR_BLD_{prefab_name}", None)
        parent.location = loc
        parent.rotation_euler = (0.0, 0.0, rot_z)
        stage_coll.objects.link(parent)
        created.append(parent)
        for child in child_meshes:
            rel = center_shift @ (root_inv @ child.matrix_world)
            dup = bpy.data.objects.new(f"HR_{child.name}", child.data)
            dup.parent = parent
            dup.matrix_local = rel
            stage_coll.objects.link(dup)
            created.append(dup)
        bpy.context.view_layer.update()
        return created

    def clear_stage(objs):
        for o in objs:
            if o is not None and o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)

    def get_bounds(objs):
        bpy.context.view_layer.update()
        pts = []
        for o in objs:
            if o is None:
                continue
            if o.type == 'MESH':
                pts.extend(o.matrix_world @ Vector(c) for c in o.bound_box)
            for ch in o.children_recursive:
                if ch.type == 'MESH':
                    pts.extend(ch.matrix_world @ Vector(c) for c in ch.bound_box)
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        return lo, hi

    def frame_and_render(objs, out_path, view_dir=(-0.32, -1.0, 0.42), lens=44,
                         dist_mult=1.08, res=(1440, 1080), z_bias=-0.02):
        lo, hi = get_bounds(objs)
        centre = (lo + hi) * 0.5
        size = hi - lo
        span = max(size.x, size.y, size.z * 1.32)
        target = Vector((centre.x, centre.y, centre.z + size.z * z_bias))
        v = Vector(view_dir).normalized()
        fov = 2.0 * math.atan(18.0 / lens)
        dist = (span * 0.55) / math.tan(fov * 0.5) * dist_mult
        cam_ob.location = target + v * dist
        cam_data.type = 'PERSP'
        cam_data.lens = lens
        cam_ob.rotation_euler = (target - cam_ob.location).to_track_quat('-Z', 'Y').to_euler()
        game_look.render(sc, cam_ob, out_path, res)
        print(f"[harness] rendered {out_path}")

    def render_camera_shot(cam_loc, target_loc, out_path, lens=32, res=(1600, 1000)):
        cam_ob.location = Vector(cam_loc)
        cam_data.type = 'PERSP'
        cam_data.lens = lens
        cam_ob.rotation_euler = (Vector(target_loc) - cam_ob.location).to_track_quat('-Z', 'Y').to_euler()
        game_look.render(sc, cam_ob, out_path, res)
        print(f"[harness] rendered {out_path}")

    def pick_clear_camera(candidates, target_loc, min_clear_dist=5.5):
        """Evaluate candidate camera locations using Blender scene raycasting and
        proximity checks so street shots never clip inside a building, roof, or tree."""
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        tgt = Vector(target_loc)
        best_loc = Vector(candidates[0])
        best_score = -1e9
        for cand in candidates:
            loc = Vector(cand)
            to_tgt = tgt - loc
            dist_to_tgt = to_tgt.length
            if dist_to_tgt < 1.0:
                continue
            fwd = to_tgt.normalized()
            right = fwd.cross(Vector((0.0, 0.0, 1.0))).normalized()
            up = right.cross(fwd).normalized()

            # Check a 9-ray frustum cone (centre + wide horizontal/vertical angular offsets) from camera toward target
            min_hit = dist_to_tgt
            blocked_near = False
            for sx, sz in (
                (0.0, 0.0),
                (-0.34, 0.0), (0.34, 0.0),
                (-0.18, -0.16), (0.18, -0.16),
                (0.0, -0.22), (0.0, 0.22),
                (-0.28, 0.14), (0.28, 0.14),
            ):
                ray_orig = loc + right * (sx * 0.6) + up * (sz * 0.6)
                ray_dir = (fwd + right * sx + up * sz).normalized()
                hit, hit_loc, _, _, hit_ob, _ = sc.ray_cast(depsgraph, ray_orig, ray_dir, distance=dist_to_tgt * 0.92)
                if hit and hit_ob != stage_floor:
                    d = (hit_loc - ray_orig).length
                    if d < min_hit:
                        min_hit = d
                    if d < min_clear_dist:
                        blocked_near = True

            # Also check that the camera isn't inside a building/roof by casting upward and backward
            up_hit, up_loc, _, _, up_ob, _ = sc.ray_cast(depsgraph, loc, Vector((0, 0, 1)), distance=3.5)
            inside_penalty = 0.0
            if up_hit and up_ob != stage_floor and (up_loc - loc).length < 1.5:
                inside_penalty = 50.0

            score = min(min_hit, 18.0) * 4.0 - (40.0 if blocked_near else 0.0) - inside_penalty
            if score > best_score:
                best_score = score
                best_loc = loc
        return best_loc

    # Warmup render
    cam_ob.location = (0, -10, 2)
    cam_ob.rotation_euler = (Vector((0, 0, 1)) - Vector(cam_ob.location)).to_track_quat('-Z', 'Y').to_euler()
    warmup_p = os.path.join(DIR_STREETS, "_warmup.png")
    game_look.render(sc, cam_ob, warmup_p, (64, 48))
    try:
        os.remove(warmup_p)
    except OSError:
        pass

    # ==========================================================================
    # MODE: OBJECTS (Fast ad-hoc object/prefab inspection)
    # ==========================================================================
    if args.mode == "objects" and args.objects:
        for idx, name in enumerate([n.strip() for n in args.objects.split(",") if n.strip()]):
            objs = []
            ob = place_kit_clone(name, loc=(0, 0, 0))
            if ob:
                objs.append(ob)
            else:
                objs.extend(place_prefab_clone(name, loc=(0, 0, 0)))
            if objs:
                out_p = os.path.join(DIR_MODULES, f"inspect_{idx:02d}_{name}.png")
                frame_and_render(objs, out_p, res=(1440, 1080))
                clear_stage(objs)
        return

    # ==========================================================================
    # PART 1: STONEHOLD STONE FORMATIONS (Dwarven Crags, Shrines & Dioramas)
    # ==========================================================================
    if "stonehold" in modes:
        stage_floor.hide_render = False
        stage_floor_mesh.materials[0] = ped_mat
        sh_shots = [
            ("01_Stonehold_Ledge_Small", "Stonehold_Ledge_Small", (-0.34, -1.0, 0.52), 46, 1.06, []),
            ("02_Stonehold_Ledge_Large", "Stonehold_Ledge_Large", (-0.30, -1.0, 0.52), 45, 1.06, []),
            ("03_Stonehold_Twin_Outcrop", "Stonehold_Twin_Outcrop", (-0.28, -1.0, 0.48), 44, 1.04, []),
            ("04_Stonehold_Vent_Crater", "Stonehold_Vent_Crater", (-0.26, -1.0, 0.62), 46, 1.06, [
                ((0.0, 0.0, 0.65), 35.0),
            ]),
            ("05_Stonehold_Caldera_Basin", "Stonehold_Caldera_Basin", (-0.28, -1.0, 0.54), 44, 1.05, [
                ((0.0, -0.2, 1.05), 55.0),
            ]),
            ("06_Stonehold_Fang_Shrine", "Stonehold_Fang_Shrine", (-0.36, -1.0, 0.36), 44, 1.06, [
                ((0.25, -0.35, 0.95), 45.0),
            ]),
            ("07_Stonehold_Cavern_Maw", "Stonehold_Cavern_Maw", (-0.24, -1.0, 0.34), 42, 1.08, [
                ((0.0, 0.05, 1.05), 140.0),
                ((0.0, -0.45, 0.75), 65.0),
            ]),
            ("08_Stonehold_Horned_Sanctum", "Stonehold_Horned_Sanctum", (-0.28, -1.0, 0.38), 42, 1.12, [
                ((-0.2, -0.9, 1.25), 85.0),
                ((0.1, 0.1, 2.75), 65.0),
            ]),
        ]
        for file_stem, mod_name, vdir, lens, dmult, light_specs in sh_shots:
            ob = place_kit_clone(mod_name, loc=(0, 0, 0))
            lights_created = [add_point_light(f"L_{file_stem}_{idx}", l_loc, l_en)
                              for idx, (l_loc, l_en) in enumerate(light_specs)]
            out_p = os.path.join(DIR_STONEHOLD, f"{file_stem}.png")
            frame_and_render([ob], out_p, view_dir=vdir, lens=lens, dist_mult=dmult, res=(1440, 1080))
            shutil.copy2(out_p, os.path.join(DIR_MODULES, f"16_{file_stem}.png"))
            clear_stage([ob] + lights_created)

        ensemble_specs = [
            ("Stonehold_Horned_Sanctum", (-2.2, 3.2, 0.0), 0.12),
            ("Stonehold_Ledge_Large", (-5.4, 4.4, 0.0), -0.25),
            ("Stonehold_Ledge_Small", (1.6, 4.6, 0.0), 0.15),
            ("Stonehold_Cavern_Maw", (5.2, 3.2, 0.0), -0.22),
            ("Stonehold_Fang_Shrine", (-5.6, -0.4, 0.0), 0.28),
            ("Stonehold_Caldera_Basin", (-1.1, -0.8, 0.0), 0.08),
            ("Stonehold_Twin_Outcrop", (4.6, -0.6, 0.0), -0.18),
            ("Stonehold_Vent_Crater", (-5.2, -4.1, 0.0), 0.0),
            ("Stonehold_Ledge_Large", (-1.2, -4.6, 0.0), 0.05),
            ("Stonehold_Vent_Crater", (2.4, -3.9, 0.0), 1.2),
            ("Stonehold_Ledge_Small", (5.8, -3.6, 0.0), -0.4),
        ]
        ens_objs = [place_kit_clone(m, loc, r) for m, loc, r in ensemble_specs]
        ens_lights = [
            add_point_light("L_Ens_Maw1", (5.0, 2.9, 1.15), 160.0),
            add_point_light("L_Ens_Maw2", (4.6, 2.1, 0.85), 80.0),
            add_point_light("L_Ens_Sanctum", (-2.0, 1.8, 1.35), 95.0),
            add_point_light("L_Ens_Caldera", (-1.1, -1.2, 1.10), 75.0),
            add_point_light("L_Ens_Fang", (-5.2, -0.6, 1.05), 65.0),
        ]
        ens_path = os.path.join(DIR_STONEHOLD, "09_scene_Stonehold_Formations_Ensemble.png")
        frame_and_render(ens_objs, ens_path, view_dir=(-0.08, -1.0, 0.56),
                         lens=38, dist_mult=0.94, res=(1920, 1440), z_bias=-0.02)
        shutil.copy2(ens_path, os.path.join(DIR_SCENES, "15_scene_Stonehold_Formations_Ensemble.png"))
        clear_stage(ens_objs + ens_lights)

        diorama_objs = []
        for bname, loc, rot in (
            ("Stonehold_Gatehouse", (0.0, 5.8, 0.0), 0.0),
            ("Stonehold_Guildhall", (-12.8, 3.6, 0.0), 0.22),
            ("Stonehold_Keep", (12.4, 3.8, 0.0), -0.22),
        ):
            diorama_objs.extend(place_prefab_clone(bname, loc=loc, rot_z=rot))
        for m, loc, r in (
            ("Stonehold_Horned_Sanctum", (-5.2, -2.2, 0.0), 0.35),
            ("Stonehold_Cavern_Maw", (5.6, -1.8, 0.0), -0.26),
            ("Stonehold_Caldera_Basin", (0.0, -2.8, 0.0), 0.0),
            ("Stonehold_Fang_Shrine", (-9.2, -3.5, 0.0), 0.45),
            ("Stonehold_Twin_Outcrop", (9.2, -3.6, 0.0), -0.30),
            ("Stonehold_Vent_Crater", (-3.2, -6.2, 0.0), 0.0),
            ("Stonehold_Ledge_Large", (3.2, -6.0, 0.0), 0.2),
            ("Smelter_Stack", (-4.2, 2.2, 0.0), 0.2),
            ("Mine_Cart_Track", (4.2, 2.0, 0.0), -0.2),
            ("Stonehold_Ward_Pillar", (-2.0, 3.6, 0.0), 0.0),
            ("Stonehold_Ward_Pillar", (2.0, 3.6, 0.0), 0.0),
        ):
            ob = place_kit_clone(m, loc, r)
            if ob:
                diorama_objs.append(ob)
        dio_lights = [
            add_point_light("L_Dio_Maw", (5.4, -2.0, 1.15), 160.0),
            add_point_light("L_Dio_Sanctum", (-5.0, -3.2, 1.35), 95.0),
            add_point_light("L_Dio_Caldera", (0.0, -3.0, 1.10), 80.0),
            add_point_light("L_Dio_Smelt", (-4.2, 1.6, 1.10), 90.0),
        ]
        dio_path = os.path.join(DIR_STONEHOLD, "10_scene_Stonehold_Citadel_and_Formations_Diorama.png")
        frame_and_render(diorama_objs, dio_path, view_dir=(-0.12, -1.0, 0.38),
                         lens=34, dist_mult=0.92, res=(1920, 1080), z_bias=-0.04)
        shutil.copy2(dio_path, os.path.join(DIR_SCENES, "16_scene_Stonehold_Citadel_and_Formations_Diorama.png"))
        clear_stage(diorama_objs + dio_lights)

    # ==========================================================================
    # PART 2: NEW D&D / BALDUR'S GATE & DWARVEN STREET MODULES
    # ==========================================================================
    if "street-modules" in modes:
        stage_floor.hide_render = False
        stage_floor_mesh.materials[0] = ped_mat
        street_groups = [
            ("17_Street_Arches_Stone_Timber_Granite", [
                ("Street_Arch_Stone", (-4.8, 0.0, 0.0), 0.0),
                ("Street_Arch_Timber", (0.0, 0.0, 0.0), 0.0),
                ("Street_Arch_Granite", (4.8, 0.0, 0.0), 0.0),
                ("Street_Bunting", (0.0, -1.8, 0.0), 0.0),
            ], (-0.22, -1.0, 0.32), 38, 1.02),
            ("18_Street_Commerce_Tavern_Alchemist_Bakery_Armorer", [
                ("Tavern_Table_Set", (-4.2, 0.0, 0.0), 0.0),
                ("Alchemist_Stall", (-1.4, 0.0, 0.0), 0.0),
                ("Armorer_Stand", (1.6, 0.0, 0.0), 0.0),
                ("Bake_Oven_Outdoor", (4.2, 0.0, 0.0), 0.0),
            ], (-0.18, -1.0, 0.36), 40, 1.02),
            ("19_Street_Civic_Statue_GuardPost_Stocks", [
                ("Guard_Post", (-3.2, 0.0, 0.0), 0.0),
                ("Statue_Plinth", (0.0, 0.0, 0.0), 0.0),
                ("Pillory_Stocks", (2.8, 0.0, 0.0), 0.0),
            ], (-0.22, -1.0, 0.34), 42, 1.04),
            ("20_Stonehold_Dwarven_and_Frostgard_Street_Props", [
                ("Smelter_Stack", (-3.8, 0.0, 0.0), 0.0),
                ("Mine_Cart_Track", (-1.2, 0.0, 0.0), 0.25),
                ("Stonehold_Ward_Pillar", (1.2, 0.0, 0.0), 0.0),
                ("Winter_Supply_Sled", (3.4, 0.0, 0.0), -0.25),
            ], (-0.22, -1.0, 0.36), 40, 1.04),
        ]
        for stem, placements, vdir, lens, dmult in street_groups:
            objs = [place_kit_clone(m, loc, r) for m, loc, r in placements]
            out_p = os.path.join(DIR_MODULES, f"{stem}.png")
            frame_and_render(objs, out_p, view_dir=vdir, lens=lens, dist_mult=dmult, res=(1600, 1000))
            shutil.copy2(out_p, os.path.join(DIR_STREETS, f"00_{stem}.png"))
            clear_stage(objs)

    # ==========================================================================
    # PART 3: STREET-LEVEL VIEWS FROM ALL 7 CITIES
    # ==========================================================================
    if "cities" in modes:
        stage_floor.hide_render = False
        stage_floor.location.z = -0.02
        town_coll = bpy.data.collections.get('Town')
        if town_coll:
            town_coll.hide_render = False
        all_families = ['Tudor', 'Nordic', 'Med', 'Goblin', 'Orc', 'Frostgard', 'Stonehold']
        requested_families = [f.strip() for f in args.families.split(",") if f.strip()]
        city_seeds = {
            'Tudor': 10,
            'Nordic': 22,
            'Med': 33,
            'Goblin': 44,
            'Orc': 55,
            'Frostgard': 66,
            'Stonehold': 77,
        }
        land_mats = {
            'Tudor': 'meadow',
            'Nordic': 'meadow',
            'Med': 'meadow',
            'Goblin': 'water',
            'Orc': 'meadow_earth',
            'Frostgard': 'snow_land',
            'Stonehold': 'rock_land',
        }
        for fam in requested_families:
            idx = (all_families.index(fam) + 1) if fam in all_families else 1
            clear_town_collections()
            stage_floor_mesh.materials[0] = materials.get(land_mats.get(fam, 'meadow'))
            seed = city_seeds.get(fam, 10 + idx * 7)
            plan = GeneratedVillage(seed=seed, family=fam)
            village.build(kit, plan)
            bpy.context.view_layer.update()

            # Compute street-level camera coordinates from the city's actual street & plaza plan
            px, py = getattr(plan, 'plaza_center', (plan.W // 2, plan.H // 2))
            spine2 = plan.spine_y.get(2, py)
            ent_x = plan.entrances[0] if plan.entrances else plan.W // 2
            cx0, cx1, cy0, _ = plan.crown
            crown_cx = 0.5 * (cx0 + cx1)
            if plan.BUILDINGS:
                cspec, ccx, ccy, _ = plan.BUILDINGS[0]
                crown_cx = ccx + cspec.w * 0.5
                cy0 = ccy

            # Shot 1: High Street Canyon & Market Plaza (looking along the Terrace 2 High Street toward the Plaza)
            tgt1 = ((px + 0.5) * GRID, (py + 0.5) * GRID, 2 * TERRACE + 1.8)
            cands1 = []
            # Search open street cells on terrace 2 west and east of the plaza
            for cx in range(2, plan.W - 2):
                if abs(cx - px) < 4 or abs(cx - px) > 9:
                    continue
                for cy in (spine2, spine2 + 1, py, py - 1, py + 1):
                    if 1 <= cy < plan.H - 1 and (cx, cy) in plan.streets and (cx, cy) not in plan.occupied:
                        if plan.height(cx, cy) == 2:
                            for z_off in (2.3, 3.0, 3.8):
                                cands1.append(((cx + 0.5) * GRID, (cy + 0.5) * GRID, 2 * TERRACE + z_off))
            # Also add elevated terrace-edge balcony viewpoints looking into the plaza
            for dx in (-6.5, -5.0, 5.0, 6.5):
                for dy in (-3.5, -2.5, -1.5, 0.5):
                    cands1.append(((px + dx) * GRID, (py + dy) * GRID, 2 * TERRACE + 3.6))
            cam1 = pick_clear_camera(cands1, tgt1, min_clear_dist=5.5)
            p1 = os.path.join(DIR_STREETS, f"{idx:02d}_{fam}_01_high_street_canyon.png")
            render_camera_shot(cam1, tgt1, p1, lens=30, res=(1600, 1000))

            # Shot 2: Gate & Lower Street Approach Vista (looking from entrance avenue up to Plaza & Crown)
            tgt2 = ((px + 0.5) * GRID, (py + 1.5) * GRID, 2 * TERRACE + 2.8)
            cands2 = [
                ((ent_x + dx) * GRID, y_grid * GRID, 1 * TERRACE + z_off)
                for y_grid in (-5.5, -6.8, -4.5, -8.0)
                for dx in (-3.2, -2.0, -0.8, 0.5, 1.8, 3.2, 4.5)
                for z_off in (3.0, 4.0, 5.2, 6.2)
            ]
            cam2 = pick_clear_camera(cands2, tgt2, min_clear_dist=9.5)
            p2 = os.path.join(DIR_STREETS, f"{idx:02d}_{fam}_02_gate_and_avenue_vista.png")
            render_camera_shot(cam2, tgt2, p2, lens=32, res=(1600, 1000))

            # Shot 3: Upper Ward & Crown Street View (looking across Terrace 2/3 toward the Crown Hall/Keep)
            tgt3 = (crown_cx * GRID, (cy0 + 1.5) * GRID, 4 * TERRACE + 2.6)
            cands3 = [
                ((crown_cx + dx) * GRID, (cy0 + dy) * GRID, 3 * TERRACE + z_off)
                for dy in (-4.8, -5.8, -3.8, -6.8)
                for dx in (-4.5, -3.0, -1.5, 1.5, 3.0, 4.5)
                for z_off in (2.6, 3.6, 4.6)
            ]
            cam3 = pick_clear_camera(cands3, tgt3, min_clear_dist=6.0)
            p3 = os.path.join(DIR_STREETS, f"{idx:02d}_{fam}_03_upper_ward_and_crown.png")
            render_camera_shot(cam3, tgt3, p3, lens=32, res=(1600, 1000))

            # Shot 4: Full City Architectural Overview
            cam4_x = (plan.W * 0.5 - 12.0) * GRID
            cam4_y = -11.5 * GRID
            cam4_z = 24.0
            tgt4_x = (plan.W * 0.5) * GRID
            tgt4_y = (plan.H * 0.48) * GRID
            tgt4_z = 2.2 * TERRACE
            p4 = os.path.join(DIR_STREETS, f"{idx:02d}_{fam}_04_city_overview.png")
            render_camera_shot((cam4_x, cam4_y, cam4_z), (tgt4_x, tgt4_y, tgt4_z), p4, lens=34, res=(1600, 1000))

        clear_town_collections()

    # ==========================================================================
    # PART 4: EXPORT SAMPLE TOWN & LOD1 KIT GLB WHEN IN 'all' OR 'export' MODE
    # ==========================================================================
    if "export" in modes:
        clear_town_collections()
        village.build(kit, village_plan)
        export.town_glb(kit, config.EXPORT_DIR)
        export.layout_json(kit, config.EXPORT_DIR)
        clear_town_collections()

        # Also build LOD1 kit
        config.LOD = 1
        bpy.ops.wm.read_factory_settings(use_empty=True)
        images_lod1 = textures.generate(config.TEXTURE_DIR)
        materials.build(images_lod1)
        kit_lod1 = catalog.build_kit()
        export.kit_glb(kit_lod1, config.EXPORT_DIR, filename='medieval_kit_lod1.glb', images=False)

    print("[harness] COMPLETED SUCCESSFULLY")


if __name__ == "__main__":
    main()
