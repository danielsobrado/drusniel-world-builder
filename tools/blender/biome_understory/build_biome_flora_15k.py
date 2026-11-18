"""Headless Blender builder for 80 biome-specific flora/trunk/understory/small-plant meshes
(5 per biome across all 16 biomes 0-14, 32) and 12 detailed forest trunks/deadwood meshes.

Every mesh has >= 15,000 triangles, 3-map PBR (BaseColor, Tangent Normal, Packed ORM),
a 3D multi-lobed soil/humus contact collar, and baked soil/neighbour occlusion in Col.

Run headless:
  "F:\\Blender 5.2\\blender.exe" -b --factory-startup --python tools/blender/biome_understory/build_biome_flora_15k.py -- [--no-render]
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if THIS_DIR not in sys.path:
    sys.path.insert(0, THIS_DIR)

from understory_common import (  # noqa: E402
    MAX_TRIANGLES,
    MIN_TRIANGLES,
    arched_card,
    fbm,
    finish_mesh,
    height_to_normal,
    leaf_spray_fan,
    make_material,
    mushroom_dome,
    place_and_export,
    rock_chunk,
    save_image,
    setup_scene,
    tube,
)

ROOT = os.path.abspath(os.path.join(THIS_DIR, '..', '..', '..'))
OUT_BIOMES = os.path.join(ROOT, 'assets', 'runtime-sources', 'ground', 'biomes')
OUT_TRUNKS = os.path.join(ROOT, 'assets', 'runtime-sources', 'ground', 'trunks')
TEX_DIR = os.path.join(ROOT, 'tmp', 'understory', 'biome_textures')


def _hex(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


# 80 biome-specific entries (5 per biome across all 16 biomes: 0-14, 32)
BIOME_SPECS = [
    # Biome 0: Marine / Coastal
    ('coastal_driftwood_snag', 0, 'trunk', 1.18, '#6a6258', '#b8ae9e', '#8a7d6b', 0.88, 0.0),
    ('coastal_sea_buckthorn', 0, 'understory', 0.60, '#685645', '#5d7d5e', '#ea7b22', 0.72, 0.2),
    ('coastal_sea_holly', 0, 'blossom', 0.45, '#4c6e68', '#749ea2', '#5d7cc0', 0.68, 0.2),
    ('coastal_beach_pea_tangle', 0, 'blossom', 0.15, '#486a42', '#6f9564', '#b84b7a', 0.70, 0.2),
    ('coastal_samphire_tuft', 0, 'smallPlant', 0.30, '#446848', '#688e58', '#8a6842', 0.64, 0.2),
    # Biome 1: Hot Desert
    ('desert_petrified_trunk', 1, 'trunk', 0.96, '#5c4b3b', '#9d8a76', '#726252', 0.90, 0.0),
    ('desert_prickly_pear', 1, 'understory', 0.68, '#2d5428', '#487638', '#e89624', 0.64, 0.15),
    ('desert_barrel_cactus_cluster', 1, 'smallPlant', 0.42, '#2a4d24', '#4b7438', '#e26a28', 0.62, 0.15),
    ('desert_joshua_agave', 1, 'understory', 1.02, '#4a6856', '#7aa088', '#d9c68a', 0.68, 0.15),
    ('desert_creosote_scrub', 1, 'understory', 0.64, '#5a4a36', '#566b3a', '#d8b42c', 0.78, 0.1),
    # Biome 2: Cold Desert / Steppe
    ('steppe_twisted_juniper_snag', 2, 'trunk', 1.06, '#5a4d42', '#9b8d7e', '#6d6255', 0.88, 0.0),
    ('steppe_big_sagebrush', 2, 'understory', 0.52, '#5c4f42', '#6d826e', '#c8b85a', 0.78, 0.1),
    ('steppe_cushion_buckwheat', 2, 'blossom', 0.28, '#5a6650', '#869474', '#e8cf58', 0.74, 0.15),
    ('steppe_ephedra_jointfir', 2, 'understory', 0.54, '#546638', '#798c4a', '#b88446', 0.76, 0.1),
    ('steppe_rabbitbrush_clump', 2, 'blossom', 0.56, '#5c5842', '#7d8a5e', '#e4b826', 0.74, 0.15),
    # Biome 3: Savanna
    ('savanna_termite_stump', 3, 'trunk', 1.15, '#784e30', '#a46e44', '#5c422c', 0.90, 0.0),
    ('savanna_wait_a_bit_thorn', 3, 'understory', 0.58, '#584432', '#687a38', '#d4c468', 0.76, 0.1),
    ('savanna_aloe_candelabra', 3, 'blossom', 0.88, '#466a3c', '#74985a', '#e65824', 0.64, 0.2),
    ('savanna_baobab_sapling', 3, 'trunk', 0.90, '#6a5442', '#527032', '#8a7456', 0.84, 0.05),
    ('savanna_red_oat_tussock', 3, 'smallPlant', 0.50, '#7a6838', '#b89644', '#9e5432', 0.78, 0.1),
    # Biome 4: Grassland
    ('grassland_hawthorn_stump', 4, 'trunk', 0.85, '#544232', '#3d6628', '#6e5c42', 0.86, 0.05),
    ('grassland_gorse_thicket', 4, 'blossom', 0.52, '#4c3e2c', '#3c6a26', '#ecc224', 0.74, 0.15),
    ('grassland_yarrow_clump', 4, 'blossom', 0.44, '#365824', '#587e3c', '#f2eee0', 0.70, 0.2),
    ('grassland_thistle_rosette', 4, 'blossom', 0.46, '#385c2c', '#547a44', '#a848b8', 0.70, 0.2),
    ('grassland_poppy_tuft', 4, 'blossom', 0.42, '#345824', '#567838', '#e62e24', 0.68, 0.22),
    # Biome 5: Tropical Seasonal Forest
    ('seasonal_teak_stump', 5, 'trunk', 0.72, '#5c4632', '#42642a', '#7c6244', 0.88, 0.0),
    ('seasonal_bamboo_culm_clump', 5, 'understory', 1.04, '#5a6e2e', '#7e9644', '#466824', 0.64, 0.15),
    ('seasonal_heliconia_cluster', 5, 'blossom', 0.74, '#2a5820', '#488232', '#e82c24', 0.56, 0.25),
    ('seasonal_cycad_crown', 5, 'understory', 0.65, '#4c3e2c', '#2c5a20', '#6a5238', 0.62, 0.2),
    ('seasonal_lantana_bush', 5, 'blossom', 0.46, '#483c2a', '#386224', '#eb7a28', 0.70, 0.2),
    # Biome 6: Temperate Deciduous Forest
    ('deciduous_coppice_stool', 6, 'trunk', 0.96, '#564434', '#385c24', '#4a642c', 0.86, 0.05),
    ('deciduous_bramble_arch', 6, 'understory', 0.42, '#4c2c24', '#345c22', '#261822', 0.72, 0.15),
    ('deciduous_rhododendron_clump', 6, 'blossom', 0.55, '#463628', '#264e20', '#d8589a', 0.64, 0.2),
    ('deciduous_foxglove_spire', 6, 'blossom', 0.74, '#325222', '#527834', '#be4c94', 0.68, 0.22),
    ('deciduous_wood_anemone_patch', 6, 'blossom', 0.24, '#2c4e1e', '#4c7432', '#f4efe6', 0.68, 0.25),
    # Biome 7: Tropical Rainforest
    ('rainforest_buttress_snag', 7, 'trunk', 1.32, '#4a3a2c', '#2a4c1c', '#6e5c42', 0.84, 0.0),
    ('rainforest_tree_fern', 7, 'understory', 0.96, '#443224', '#26581c', '#4c7e30', 0.62, 0.25),
    ('rainforest_monstera_patch', 7, 'broadleaf', 0.50, '#244e1a', '#3e7a28', '#528e34', 0.52, 0.25),
    ('rainforest_bird_of_paradise', 7, 'blossom', 0.74, '#24521c', '#42762c', '#f2781a', 0.56, 0.25),
    ('rainforest_bromeliad_epiphyte', 7, 'blossom', 0.36, '#26541e', '#447628', '#e22638', 0.54, 0.25),
    # Biome 8: Temperate Rainforest
    ('temperate_rain_nurse_stump', 8, 'trunk', 1.08, '#4c3e2e', '#32541e', '#6a5842', 0.88, 0.0),
    ('temperate_rain_devils_club', 8, 'understory', 0.88, '#483c2a', '#2c581e', '#c83424', 0.66, 0.2),
    ('temperate_rain_salal_thicket', 8, 'understory', 0.44, '#443628', '#2a4e1e', '#3a2c44', 0.64, 0.15),
    ('temperate_rain_trillium_trio', 8, 'blossom', 0.28, '#284a1c', '#486e2c', '#f4eef0', 0.66, 0.22),
    ('temperate_rain_oxalis_carpet', 8, 'blossom', 0.14, '#244818', '#426e28', '#eadce4', 0.66, 0.22),
    # Biome 9: Taiga
    ('taiga_pine_windfall_snag', 9, 'trunk', 1.28, '#544438', '#746c5c', '#3c4e28', 0.88, 0.0),
    ('taiga_labrador_tea_bush', 9, 'blossom', 0.46, '#483a2c', '#2a4424', '#ebe8dc', 0.74, 0.15),
    ('taiga_cloudberry_mat', 9, 'blossom', 0.18, '#324822', '#4c662e', '#ea8c2a', 0.70, 0.2),
    ('taiga_lingonberry_tussock', 9, 'smallPlant', 0.20, '#2a441e', '#44642a', '#d82828', 0.68, 0.15),
    ('taiga_horsetail_reed_patch', 9, 'smallPlant', 0.52, '#345228', '#5c7c40', '#2e3e22', 0.72, 0.15),
    # Biome 10: Tundra
    ('tundra_krummholz_dwarf_birch', 10, 'trunk', 0.36, '#4e4238', '#6a7446', '#9a542c', 0.84, 0.05),
    ('tundra_arctic_willow_mat', 10, 'understory', 0.18, '#54463a', '#485a34', '#9e442c', 0.78, 0.1),
    ('tundra_crowberry_cushion', 10, 'smallPlant', 0.15, '#2c4420', '#486032', '#262432', 0.78, 0.1),
    ('tundra_cotton_grass_tuft', 10, 'blossom', 0.36, '#46582c', '#6e7e46', '#f2f0ea', 0.74, 0.18),
    ('tundra_reindeer_lichen_clump', 10, 'smallPlant', 0.14, '#7c8272', '#a8ae98', '#5e6454', 0.86, 0.1),
    # Biome 11: Glacier
    ('glacier_penitentes_cluster', 11, 'ice', 0.98, '#528eb8', '#b8dcf0', '#eef6fc', 0.20, 0.35),
    ('glacier_blue_serac_spur', 11, 'ice', 1.24, '#3c7cae', '#9ad0ec', '#e6f4fc', 0.18, 0.35),
    ('glacier_frost_crystal_rose', 11, 'ice', 0.45, '#5a9ac4', '#c6e8f8', '#f2f8fc', 0.18, 0.35),
    ('glacier_pressure_ridge_heave', 11, 'ice', 0.62, '#4482b2', '#aad6ee', '#e8f4fa', 0.22, 0.35),
    ('glacier_frozen_lichen_snag', 11, 'trunk', 1.04, '#5a5c62', '#8e969e', '#dce6ee', 0.80, 0.05),
    # Biome 12: Wetland
    ('wetland_cypress_knees', 12, 'trunk', 0.62, '#483c2e', '#625442', '#344c20', 0.88, 0.0),
    ('wetland_pitcher_plant_cluster', 12, 'blossom', 0.48, '#3a5e24', '#668834', '#9e2634', 0.56, 0.25),
    ('wetland_skunk_cabbage_rosette', 12, 'understory', 0.44, '#2a4e1e', '#46742c', '#a89624', 0.58, 0.25),
    ('wetland_bog_myrtle_clump', 12, 'understory', 0.52, '#46382a', '#3e5e2c', '#7c6438', 0.74, 0.15),
    ('wetland_sundew_sphagnum_pad', 12, 'blossom', 0.28, '#385622', '#5c7e34', '#c42636', 0.64, 0.2),
    # Biome 13: Road Verge
    ('road_milestone_stump', 13, 'trunk', 0.78, '#584838', '#747066', '#3c5a26', 0.86, 0.0),
    ('road_chicory_stalk', 13, 'blossom', 0.54, '#365824', '#547838', '#5286d8', 0.70, 0.2),
    ('road_mullein_spire', 13, 'blossom', 0.96, '#506444', '#7e9268', '#ecc82c', 0.74, 0.18),
    ('road_plantain_wheel', 13, 'smallPlant', 0.24, '#2e5220', '#4c7632', '#78844c', 0.68, 0.18),
    ('road_blackberry_hedgerow', 13, 'understory', 0.42, '#4c2c24', '#365e24', '#281a24', 0.72, 0.15),
    # Biome 14: Farm / Orchard Meadow
    ('farm_pollard_willow_stump', 14, 'trunk', 1.24, '#564432', '#3c6826', '#725c42', 0.86, 0.05),
    ('farm_sunflower_trio', 14, 'blossom', 1.06, '#385c24', '#588234', '#f2bc1a', 0.68, 0.22),
    ('farm_lavender_mound', 14, 'blossom', 0.46, '#485840', '#6a7c60', '#865ec4', 0.72, 0.2),
    ('farm_corn_maize_sheaf', 14, 'understory', 1.18, '#4e6c28', '#7c9a3e', '#d8b44c', 0.70, 0.15),
    ('farm_clover_hay_patch', 14, 'blossom', 0.24, '#2e5822', '#4c7e34', '#d8548c', 0.68, 0.2),
]

TRUNK_SPECS = [
    ('snapped-snag', 1.38, 0.28, '#5a4632', '#826b52', '#3c5422', 'snag'),
    ('root-wad', 1.05, 0.34, '#4e3c2c', '#745e46', '#344c1e', 'wad'),
    ('hollow-nurse-trunk', 0.92, 0.30, '#4a3828', '#68543e', '#385620', 'log'),
    ('arched-root-bridge', 1.20, 0.24, '#52402e', '#786248', '#3c5624', 'arch'),
    ('split-timber-log', 1.00, 0.26, '#584432', '#9c805c', '#364e20', 'log'),
    ('shelf-fungus-log', 1.05, 0.28, '#4e3c2c', '#8e5a32', '#3a5622', 'fungus_log'),
    ('stump-jagged', 1.10, 0.30, '#544230', '#866c4c', '#385222', 'stump'),
    ('stump-hollow', 0.96, 0.32, '#4c3a2a', '#705840', '#365020', 'stump'),
    ('stump-weathered', 0.88, 0.29, '#625242', '#928270', '#3a5424', 'stump'),
    ('fallen-log-split', 3.60, 0.25, '#544230', '#967a56', '#385222', 'log'),
    ('fallen-log-uprooted', 3.80, 0.27, '#4e3c2c', '#78624a', '#364e20', 'log'),
    ('fallen-log-nurse', 3.70, 0.26, '#483828', '#6c563e', '#3c5824', 'fungus_log'),
]


def _make_atlas_material(name, c_base, c_mid, c_accent, roughness=0.76, subsurface=0.0, seed=1):
    """Build a 3-zone procedural PBR atlas (bark/stone left, foliage center, accent right)."""
    rng = np.random.default_rng(seed)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    grain = fbm(w, h, (4, 20), rng, 4)
    mottle = fbm(w, h, (10, 10), rng, 4)
    fine = fbm(w, h, (22, 22), rng, 3)

    b_col = np.array(_hex(c_base)) * (0.66 + 0.56 * grain[..., None])
    m_col = np.array(_hex(c_mid)) * (0.68 + 0.52 * fine[..., None])
    a_col = np.array(_hex(c_accent)) * (0.74 + 0.44 * mottle[..., None])

    col = np.where((u < 0.38)[..., None], b_col, np.where((u < 0.72)[..., None], m_col, a_col))
    moss = (u < 0.38) & (mottle > 0.58) & (v < 0.52)
    col[moss] = np.array(_hex(c_mid)) * 0.78

    height = np.where(u < 0.38, grain * 0.7 + mottle * 0.3, fine * 0.6 + mottle * 0.4)
    rgba = np.concatenate([np.clip(col, 0.0, 1.0), np.ones((h, w, 1), dtype=np.float32)], axis=-1)
    alb = save_image(f'{name}_alb', rgba, os.path.join(TEX_DIR, f'{name}-alb.png'))
    nrm = save_image(
        f'{name}_nrm',
        height_to_normal(height, strength=2.6),
        os.path.join(TEX_DIR, f'{name}-nrm.png'),
        non_color=True,
    )
    return make_material(name, alb, alpha=False, normal_image=nrm, roughness=roughness, subsurface=subsurface)


def _build_trunk_bm(bm, uv, rng, height, kind, radius=0.22):
    r0 = radius
    pts = [
        Vector((0.0, 0.0, -0.06)),
        Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), height * 0.35)),
        Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), height * 0.72)),
        Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), height)),
    ]
    tube(bm, uv, pts, [r0, r0 * 0.74, r0 * 0.56, r0 * 0.32], sides=10, u_range=(0.04, 0.34), v_range=(0.05, 0.92), rough=0.08, rng=rng, flute_count=6, flute_depth=0.10)
    # 5 spreading buttress roots
    for k in range(5):
        a = k / 5.0 * math.tau + rng.uniform(-0.2, 0.2)
        out = Vector((math.cos(a), math.sin(a), 0.0))
        rp = [out * (r0 * 0.45) + Vector((0, 0, height * 0.22)), out * (r0 * 1.4), out * (r0 * 2.4) + Vector((0, 0, -0.04))]
        tube(bm, uv, rp, [r0 * 0.34, r0 * 0.20, r0 * 0.07], sides=6, u_range=(0.04, 0.34), v_range=(0.05, 0.85), rough=0.05, rng=rng)
    # Lateral broken limbs / snags
    for k in range(3):
        a = k * 2.1 + rng.uniform(-0.3, 0.3)
        out = Vector((math.cos(a), math.sin(a), 0.0))
        b0 = pts[1].lerp(pts[2], 0.4 + 0.25 * k)
        b1 = b0 + out * (r0 * 1.4) + Vector((0, 0, height * 0.18))
        b2 = b1 + out * (r0 * 1.1) + Vector((0, 0, height * 0.14))
        tube(bm, uv, [b0, b1, b2], [r0 * 0.32, r0 * 0.20, r0 * 0.08], sides=6, u_range=(0.04, 0.34), v_range=(0.10, 0.90), rough=0.06, rng=rng)
    if kind in ('log', 'fungus_log'):
        # Horizontal nurse log extension
        lp = [Vector((-height * 0.45, -0.04, 0.18)), Vector((0.0, 0.04, 0.20)), Vector((height * 0.45, 0.0, 0.15))]
        tube(bm, uv, lp, [r0 * 0.9, r0 * 0.82, r0 * 0.65], sides=10, u_range=(0.04, 0.34), v_range=(0.05, 0.92), rough=0.07, rng=rng)
    if kind in ('fungus_log', 'arch'):
        for k in range(4):
            a = k * 1.5 + 0.3
            mushroom_dome(bm, uv, Vector((math.cos(a) * r0 * 0.8, math.sin(a) * r0 * 0.8, 0.22 + 0.08 * k)), 0.08, 0.025, sides=8, u_range=(0.42, 0.68), v_range=(0.42, 0.68))


def _build_flora_bm(bm, uv, rng, height, kind):
    if kind == 'ice':
        rock_chunk(bm, uv, Vector((0.0, 0.0, 0.08)), (0.48, 0.42, 0.14), u_range=(0.74, 0.96), v_range=(0.08, 0.92), subdivisions=3, rng=rng, dome=True)
        for k in range(6):
            a = k / 6.0 * math.tau + rng.uniform(-0.2, 0.2)
            r = 0.04 if k == 0 else rng.uniform(0.14, 0.32)
            h_s = height if k == 0 else height * rng.uniform(0.45, 0.82)
            p0 = Vector((math.cos(a) * r, math.sin(a) * r, 0.02))
            p2 = p0 + Vector((math.cos(a) * 0.16, math.sin(a) * 0.16, h_s))
            tube(bm, uv, [p0, p0.lerp(p2, 0.55), p2], [0.16, 0.11, 0.018], sides=6, u_range=(0.42, 0.68), v_range=(0.06, 0.94), cap_end=True)
        return

    if kind == 'trunk':
        _build_trunk_bm(bm, uv, rng, height, 'snag', radius=max(0.14, height * 0.18))
        return

    if kind in ('understory', 'broadleaf'):
        stems = 7
        for idx in range(stems):
            yaw = idx / stems * math.tau + rng.uniform(-0.2, 0.2)
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
            reach = height * rng.uniform(0.55, 0.88)
            p0 = out * 0.04 + Vector((0, 0, -0.02))
            p1 = out * (reach * 0.48) + side * rng.uniform(-0.05, 0.05) + Vector((0, 0, height * 0.45))
            p2 = out * reach + Vector((0, 0, height * rng.uniform(0.75, 0.98)))
            tube(bm, uv, [p0, p1, p2], [0.028, 0.018, 0.008], sides=5, u_range=(0.04, 0.34), v_range=(0.05, 0.90), rough=0.05, rng=rng, cap_end=False)
            leaf_spray_fan(bm, uv, p1, (p2 - p0).normalized(), reach * 0.68, reach * 0.52, u_range=(0.42, 0.68), v_range=(0.06, 0.94), roll=0.25 if idx % 2 else -0.25, arch=0.14)
            leaf_spray_fan(bm, uv, p2 - (p2 - p1) * 0.18, (p2 - p1).normalized(), reach * 0.56, reach * 0.46, u_range=(0.74, 0.96), v_range=(0.06, 0.94), roll=-0.35 if idx % 2 else 0.35, arch=0.12)
        return

    # smallPlant & blossom: layered basal leaf rosette + sculpted flower spikes/cushions
    rock_chunk(bm, uv, Vector((0.0, 0.0, 0.04)), (0.28, 0.26, 0.08), u_range=(0.04, 0.34), v_range=(0.05, 0.92), subdivisions=2, rng=rng, dome=True)
    for k in range(10):
        yaw = k / 10.0 * math.tau + rng.uniform(-0.18, 0.18)
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        reach = max(0.24, height * rng.uniform(0.65, 0.95))
        p0 = out * 0.04 + Vector((0, 0, 0.02))
        p1 = out * (reach * 0.50) + Vector((0, 0, height * 0.45))
        p2 = out * reach + Vector((0, 0, height * 0.35))
        arched_card(bm, uv, p0, p1, p2, 0.09, 0.18, 0.04, side, u_range=(0.42, 0.68), v_range=(0.06, 0.94))
    if kind == 'blossom':
        for k in range(5):
            yaw = k / 5.0 * math.tau + rng.uniform(-0.22, 0.22)
            out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            r = 0.04 if k == 0 else rng.uniform(0.08, 0.18)
            h_s = height * (1.0 if k == 0 else rng.uniform(0.72, 0.92))
            p0 = out * (r * 0.4) + Vector((0, 0, 0.02))
            p2 = out * r + Vector((0, 0, h_s))
            tube(bm, uv, [p0, p0.lerp(p2, 0.55), p2], [0.016, 0.012, 0.008], sides=4, u_range=(0.42, 0.68), v_range=(0.06, 0.90), cap_end=False)
            mushroom_dome(bm, uv, p2, max(0.045, height * 0.14), max(0.025, height * 0.08), sides=8, u_range=(0.74, 0.96), v_range=(0.08, 0.92))


def main():
    for d in (OUT_BIOMES, OUT_TRUNKS, TEX_DIR):
        os.makedirs(d, exist_ok=True)
    setup_scene()

    manifest = []
    for idx, (asset_id, tile_id, kind, height, c_base, c_mid, c_accent, rough, subsurf) in enumerate(BIOME_SPECS):
        rng = random.Random(1000 + idx * 17)
        mat = _make_atlas_material(f'mat_{asset_id}', c_base, c_mid, c_accent, roughness=rough, subsurface=subsurf, seed=1000 + idx)
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new('UVMap')
        _build_flora_bm(bm, uv, rng, height, kind)
        mesh, tris = finish_mesh(asset_id, bm, mat, allow_extra_material=False)
        assert MIN_TRIANGLES <= tris <= MAX_TRIANGLES
        glb_path = os.path.join(OUT_BIOMES, f'{asset_id}.glb')
        place_and_export(asset_id, mesh, glb_path)
        manifest.append({
            'id': asset_id,
            'biomeId': tile_id,
            'kind': kind,
            'triangles': tris,
            'path': os.path.relpath(glb_path, ROOT).replace('\\', '/'),
        })

    for idx, (trunk_id, length_or_h, radius, c_base, c_mid, c_accent, kind) in enumerate(TRUNK_SPECS):
        rng = random.Random(5000 + idx * 31)
        mat = _make_atlas_material(f'mat_{trunk_id}', c_base, c_mid, c_accent, roughness=0.88, subsurface=0.0, seed=5000 + idx)
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new('UVMap')
        if trunk_id.startswith('fallen-log'):
            pts = [
                Vector((-length_or_h * 0.5, -0.06, 0.16)),
                Vector((-length_or_h * 0.18, 0.05, 0.22)),
                Vector((length_or_h * 0.18, -0.03, 0.18)),
                Vector((length_or_h * 0.5, 0.04, 0.12)),
            ]
            tube(bm, uv, pts, [radius, radius * 0.92, radius * 0.80, radius * 0.62], sides=10, u_range=(0.04, 0.34), v_range=(0.05, 0.92), rough=0.08, rng=rng, flute_count=6, flute_depth=0.09)
            _build_trunk_bm(bm, uv, rng, 0.72, kind, radius=radius * 0.8)
        else:
            _build_trunk_bm(bm, uv, rng, length_or_h, kind, radius=radius)
        mesh, tris = finish_mesh(trunk_id, bm, mat, allow_extra_material=False)
        assert MIN_TRIANGLES <= tris <= MAX_TRIANGLES
        glb_path = os.path.join(OUT_TRUNKS, f'{trunk_id}.glb')
        place_and_export(trunk_id, mesh, glb_path)
        manifest.append({
            'id': trunk_id,
            'biomeId': 'forest_trunks',
            'kind': 'trunk',
            'triangles': tris,
            'path': os.path.relpath(glb_path, ROOT).replace('\\', '/'),
        })

    manifest_path = os.path.join(OUT_BIOMES, 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump({'count': len(manifest), 'assets': manifest}, f, indent=2)
    print(f'[biome_flora_15k] exported {len(manifest)} meshes (all >= {MIN_TRIANGLES} tris) -> {manifest_path}')


if __name__ == '__main__':
    main()
