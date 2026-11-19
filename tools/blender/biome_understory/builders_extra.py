"""3D BMesh builders for coastal, glacier/alpine, savanna, biome micro-structures,
and authored biome shrubs (`bushVariants`).
"""
import math
import random
import bmesh
from mathutils import Vector
from aaa_geometry import shaped_leaf
from aaa_natural_forms import (
    ice_formation_mesh,
    organic_trunk_loft,
    planar_rock,
    splintered_fracture_cap,
)
from understory_common import arched_card, finish_mesh, leaf_spray_fan, mushroom_dome, rock_chunk, tube
from silhouette_variants import (
    build_savanna_thorn_scrub,
    build_taiga_krummholz_juniper,
    build_wetland_sedge_tussock,
)


# ---------------------------------------------------------------------------
# 1. COASTAL & SHORELINE KIT (Biome 0, 12)
# ---------------------------------------------------------------------------

def build_coastal_dune_oats(mat):
    """Wetland sedge & sea-oats tussock with common rooted base and multi-height arching/drooping blades."""
    return build_wetland_sedge_tussock(mat, name='coastal-dune-oats-01', seed=301, max_triangles=16050)


def build_coastal_tidepool_coral(mat):
    """Barnacle-encrusted coastal basalt tidepool rock with sea anemones, starfish, and fan coral."""
    rng = random.Random(302)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Wet basalt tidepool rocks anchored below water/sand plane
    planar_rock(bm, uv, Vector((-0.18, 0.08, 0.14)), Vector((0.50, 0.42, 0.26)), style='crag', seed=3021, u_range=(0.02, 0.50), v_range=(0.04, 0.94))
    planar_rock(bm, uv, Vector((0.28, -0.14, 0.08)), Vector((0.36, 0.30, 0.18)), style='crag', seed=3022, u_range=(0.02, 0.50), v_range=(0.04, 0.94))

    # 4 crimson sea-anemone crowns (fleshy column + radiating undulating tentacles)
    for pos, rad, h in (
        (Vector((0.04, -0.02, 0.22)), 0.13, 0.075),
        (Vector((-0.12, 0.18, 0.30)), 0.10, 0.060),
        (Vector((0.22, -0.08, 0.20)), 0.11, 0.065),
        (Vector((-0.32, -0.12, 0.16)), 0.09, 0.055),
    ):
        tube(bm, uv, [pos - Vector((0, 0, 0.02)), pos + Vector((0, 0, h * 0.7))], [rad * 0.55, rad * 0.65], sides=8, u_range=(0.54, 0.98), v_range=(0.52, 0.98))
        top_p = pos + Vector((0, 0, h * 0.72))
        for t_idx in range(10):
            ta = (t_idx / 10.0) * math.tau + rng.uniform(-0.12, 0.12)
            tdir = Vector((math.cos(ta), math.sin(ta), rng.uniform(0.35, 0.75))).normalized()
            shaped_leaf(bm, uv, top_p + Vector((math.cos(ta) * rad * 0.3, math.sin(ta) * rad * 0.3, 0.0)), tdir, rad * 1.15, rad * 0.32, profile='lanceolate', arch=0.14, droop=0.16, u_range=(0.54, 0.98), v_range=(0.52, 0.98))

    # 3 five-armed orange starfish clinging naturally to the rock slopes
    for pos, tilt in (
        (Vector((-0.06, -0.26, 0.16)), Vector((0.1, -0.6, 0.8)).normalized()),
        (Vector((0.36, 0.08, 0.14)), Vector((0.6, 0.2, 0.8)).normalized()),
        (Vector((-0.38, 0.16, 0.18)), Vector((-0.5, 0.3, 0.8)).normalized()),
    ):
        ref = Vector((0, 0, 1)) if abs(tilt.z) < 0.9 else Vector((1, 0, 0))
        tx = tilt.cross(ref).normalized()
        ty = tilt.cross(tx).normalized()
        tube(bm, uv, [pos, pos + tilt * 0.025], [0.048, 0.022], sides=5, u_range=(0.54, 0.98), v_range=(0.02, 0.48))
        for arm in range(5):
            aa = (arm / 5.0) * math.tau + 0.2
            adir = (tx * math.cos(aa) + ty * math.sin(aa)).normalized()
            a_end = pos + adir * 0.13 + tilt * 0.008
            tube(bm, uv, [pos + adir * 0.02, pos + adir * 0.075 + tilt * 0.014, a_end], [0.028, 0.018, 0.004], sides=5, u_range=(0.54, 0.98), v_range=(0.02, 0.48))
    return finish_mesh('coastal-tidepool-coral-01', bm, mat)


def build_coastal_shipwreck_ribs(mat):
    """Weathered shipwreck keel timber and curved hull ribs half-buried in coastal sand."""
    rng = random.Random(303)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Sculpted wind-scoured coastal sand bar under hull
    planar_rock(bm, uv, Vector((0.0, 0.0, 0.02)), Vector((0.72, 0.50, 0.14)), style='river', seed=3031, u_range=(0.56, 0.98), v_range=(0.04, 0.96))

    # Heavy weathered keel timber along X with square beam chamfers
    keel = [Vector((-0.84, -0.04, 0.03)), Vector((0.0, 0.0, 0.12)), Vector((0.86, 0.05, 0.06))]
    organic_trunk_loft(bm, uv, keel, [0.11, 0.13, 0.095], rng, sides=6, bark_ridges=4, ridge_depth=0.06, cap_end=False, u_range=(0.04, 0.52), v_range=(0.04, 0.94))

    # Longitudinal oak plank stringer linking ribs
    tube(bm, uv, [Vector((-0.62, 0.28, 0.44)), Vector((-0.02, 0.34, 0.52)), Vector((0.58, 0.28, 0.40))], [0.038, 0.042, 0.034], sides=4, u_range=(0.04, 0.52), v_range=(0.08, 0.92), scale_y=0.45)

    # 5 curved oak hull ribs rising from the keel with splintered broken tops
    for x_off, side_y, h_top in ((-0.52, 1, 0.72), (-0.24, -1, 0.84), (0.04, 1, 0.92), (0.32, -1, 0.78), (0.58, 1, 0.62)):
        p0 = Vector((x_off, side_y * 0.05, 0.06))
        p1 = Vector((x_off + 0.04, side_y * 0.42, h_top * 0.52))
        p2 = Vector((x_off + 0.08, side_y * 0.34, h_top))
        organic_trunk_loft(bm, uv, [p0, p1, p2], [0.078, 0.062, 0.042], rng, sides=6, bark_ridges=4, ridge_depth=0.08, cap_end=False, u_range=(0.04, 0.52), v_range=(0.08, 0.92))
        splintered_fracture_cap(bm, uv, p2, (p2 - p1).normalized(), 0.044, rng, (0.04, 0.52), (0.08, 0.92), (0.04, 0.52), (0.08, 0.92), splinters=4)
    return finish_mesh('coastal-shipwreck-ribs-01', bm, mat)


# ---------------------------------------------------------------------------
# 2. GLACIER, ALPINE & COLD STEPPE KIT (Biomes 11, 2, 10)
# ---------------------------------------------------------------------------

def build_glacier_ice_spires(mat):
    """Translucent azure-and-white fractured glacial serac spires rising from a snowdrift."""
    rng = random.Random(304)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    ice_formation_mesh(
        bm,
        uv,
        Vector((0.0, 0.0, 0.0)),
        1.32,
        0.52,
        style='serac',
        rng=rng,
        u_inner=(0.45, 0.98),
        v_inner=(0.04, 0.96),
        u_frost=(0.45, 0.98),
        v_frost=(0.04, 0.96),
        u_base=(0.02, 0.42),
        v_base=(0.55, 0.98),
    )
    return finish_mesh('glacier-ice-spires-01', bm, mat)


def build_glacier_moraine_cairn(mat):
    """Frost-shattered dark moraine slate slabs with wind-packed snow caps and cairn stones."""
    rng = random.Random(305)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    slabs = [
        (Vector((-0.16, 0.04, 0.16)), Vector((0.54, 0.40, 0.28)), 'crag', 3051),
        (Vector((0.28, -0.14, 0.10)), Vector((0.38, 0.30, 0.22)), 'sedimentary', 3052),
        (Vector((-0.08, 0.06, 0.44)), Vector((0.30, 0.24, 0.16)), 'sedimentary', 3053),
        (Vector((-0.06, 0.06, 0.64)), Vector((0.18, 0.15, 0.13)), 'crag', 3054),
    ]
    for center, radii, style, seed in slabs:
        planar_rock(bm, uv, center, radii, style=style, seed=seed, u_range=(0.02, 0.98), v_range=(0.04, 0.96))
    return finish_mesh('glacier-moraine-cairn-01', bm, mat)


def build_steppe_feathergrass(mat):
    """Silvery-gold Eurasian/cold-steppe feathergrass (Stipa) plumes & wormwood tussock."""
    rng = random.Random(306)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # 15 graceful upright-arching feathergrass tussock cards grounded at z=-0.02
    for k in range(15):
        tier = 0 if k < 9 else 1
        yaw = (k / (9 if tier == 0 else 6)) * 2 * math.pi + rng.uniform(-0.22, 0.22)
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        reach = rng.uniform(0.32, 0.50) if tier == 0 else rng.uniform(0.18, 0.32)
        h_top = rng.uniform(0.52, 0.74) if tier == 0 else rng.uniform(0.68, 0.88)
        p0 = out * 0.05 + Vector((0, 0, -0.02))
        p1 = out * (reach * 0.56) + Vector((0, 0, h_top * 0.62))
        p2 = out * reach + Vector((0, 0, h_top))
        w = rng.uniform(0.28, 0.38)
        arched_card(bm, uv, p0, p1, p2, w * 0.55, w, w * 0.78, side, u_range=(0.0, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('steppe-feathergrass-01', bm, mat)


def build_alpine_edelweiss_stone(mat):
    """High-alpine frost-cracked limestone outcrop with woolly white Edelweiss & blue gentians."""
    rng = random.Random(307)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    planar_rock(bm, uv, Vector((-0.14, 0.06, 0.12)), Vector((0.48, 0.38, 0.22)), style='limestone', seed=3071, u_range=(0.02, 0.46), v_range=(0.04, 0.96))
    planar_rock(bm, uv, Vector((0.24, -0.14, 0.07)), Vector((0.32, 0.25, 0.15)), style='limestone', seed=3072, u_range=(0.02, 0.46), v_range=(0.04, 0.96))

    # 10 Edelweiss & blue gentian flower cards nestled into rock crevices
    for k in range(10):
        yaw = k / 10 * 2 * math.pi + rng.uniform(-0.2, 0.2)
        r = rng.uniform(0.09, 0.34)
        base = Vector((math.cos(yaw) * r, math.sin(yaw) * r, 0.08))
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        h = rng.uniform(0.32, 0.52)
        p1 = base + out * 0.10 + Vector((0, 0, h * 0.58))
        p2 = base + out * 0.20 + Vector((0, 0, h))
        arched_card(bm, uv, base, p1, p2, 0.18, 0.28, 0.26, side, u_range=(0.50, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('alpine-edelweiss-stone-01', bm, mat)


# ---------------------------------------------------------------------------
# 3. SAVANNA & FARMLAND KIT (Biomes 3, 5, 4, 14)
# ---------------------------------------------------------------------------

def build_savanna_termite_mound(mat):
    """Sculpted red-ochre cathedral termite mound with chimney buttresses and dry savanna grass."""
    rng = random.Random(308)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Eroded red-earth base skirt grounding the chimneys
    planar_rock(bm, uv, Vector((0.0, 0.0, 0.04)), Vector((0.52, 0.46, 0.14)), style='crag', seed=3081, u_range=(0.02, 0.56), v_range=(0.04, 0.95))

    # Fluted central cathedral spire + 4 eroded mud buttress chimneys
    spires = [
        (Vector((0.0, 0.0, -0.04)), Vector((0.04, 0.02, 1.50)), (0.42, 0.28, 0.10), 9),
        (Vector((0.24, 0.10, -0.04)), Vector((0.28, 0.14, 0.98)), (0.22, 0.15, 0.06), 7),
        (Vector((-0.22, 0.14, -0.04)), Vector((-0.26, 0.18, 0.86)), (0.20, 0.14, 0.05), 7),
        (Vector((0.08, -0.24, -0.04)), Vector((0.12, -0.28, 0.78)), (0.19, 0.13, 0.05), 7),
        (Vector((-0.18, -0.18, -0.04)), Vector((-0.22, -0.22, 0.66)), (0.18, 0.12, 0.045), 7),
    ]
    for p0, p2, radii, sides in spires:
        p1 = p0.lerp(p2, 0.52)
        organic_trunk_loft(bm, uv, [p0, p1, p2], radii, rng, sides=sides, bark_ridges=max(5, sides - 1), ridge_depth=0.20, u_range=(0.02, 0.56), v_range=(0.04, 0.95))

    # 9 golden elephant-grass tuft cards around the mound foot
    for k in range(9):
        yaw = k / 9 * 2 * math.pi + 0.2
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        p0 = out * 0.34 + Vector((0, 0, -0.015))
        p1 = out * 0.56 + Vector((0, 0, 0.38))
        p2 = out * 0.78 + Vector((0, 0, 0.58))
        arched_card(bm, uv, p0, p1, p2, 0.22, 0.34, 0.24, side, u_range=(0.60, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('savanna-termite-mound-01', bm, mat)


def build_savanna_desert_rose(mat):
    """Low grounded multi-stem Adenium obesum (Desert Rose) succulent cluster with coral-gold blossoms."""
    rng = random.Random(309)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Swollen gnarled caudex stems emerging cleanly from soil
    for yaw, h_end in ((0.4, 0.36), (2.5, 0.32), (4.6, 0.28)):
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        b0 = out * 0.04 + Vector((0, 0, -0.025))
        b1 = b0 + out * 0.14 + Vector((0, 0, h_end * 0.55))
        b2 = b0 + out * 0.24 + Vector((0, 0, h_end))
        organic_trunk_loft(bm, uv, [b0, b1, b2], [0.095, 0.068, 0.038], rng, sides=7, bark_ridges=5, ridge_depth=0.14, u_range=(0.04, 0.44), v_range=(0.10, 0.90))

    # 12 natural outward-splaying succulent & blossom sprig cards
    for k in range(12):
        yaw = k / 12 * 2 * math.pi + rng.uniform(-0.20, 0.20)
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        ring = 0.08 if k < 5 else 0.18
        reach = rng.uniform(0.34, 0.48) if k < 5 else rng.uniform(0.46, 0.62)
        h_top = rng.uniform(0.46, 0.60) if k < 5 else rng.uniform(0.32, 0.46)
        p0 = out * ring + Vector((0, 0, -0.02))
        p1 = out * ((ring + reach) * 0.55) + Vector((0, 0, h_top * 0.65))
        p2 = out * reach + Vector((0, 0, h_top))
        arched_card(bm, uv, p0, p1, p2, 0.22, 0.34, 0.26, side, u_range=(0.48, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('savanna-desert-rose-01', bm, mat)


def build_savanna_sunbleached_ribcage(mat):
    """Sun-bleached savanna beast ribcage, spine, and horned skull on dusty earth."""
    rng = random.Random(310)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Dusty windswept sand drift under the skeleton
    planar_rock(bm, uv, Vector((0.0, 0.0, 0.02)), Vector((0.68, 0.46, 0.11)), style='river', seed=3101, u_range=(0.56, 0.98), v_range=(0.05, 0.95))

    # Vertebral spine column along X with segmented dorsal spinous processes
    spine = [Vector((-0.62, 0.0, 0.12)), Vector((-0.10, 0.02, 0.24)), Vector((0.42, 0.0, 0.18))]
    organic_trunk_loft(bm, uv, spine, [0.055, 0.072, 0.058], rng, sides=7, bark_ridges=5, ridge_depth=0.14, u_range=(0.04, 0.50), v_range=(0.05, 0.72))

    # 5 pairs of curved ivory ribs + broken off tips for weather-worn realism
    for r_i, (x_pos, rib_w, rib_h) in enumerate(((-0.48, 0.32, 0.42), (-0.28, 0.42, 0.52), (-0.08, 0.46, 0.56), (0.12, 0.44, 0.52), (0.30, 0.36, 0.44))):
        for side_y in (-1, 1):
            r0 = Vector((x_pos, side_y * 0.04, 0.20))
            r1 = Vector((x_pos + 0.03, side_y * rib_w, rib_h))
            broken = (r_i == 1 and side_y == -1) or (r_i == 3 and side_y == 1)
            r2 = Vector((x_pos + 0.05, side_y * (rib_w * 0.85), rib_h * 0.55 if broken else 0.04))
            tube(bm, uv, [r0, r1, r2], [0.036, 0.030, 0.018], sides=5, u_range=(0.04, 0.50), v_range=(0.10, 0.75))

    # Sculpted skull with brow ridge + sweeping dark-tipped horns
    skull_pts = [Vector((0.44, 0.0, 0.18)), Vector((0.64, 0.0, 0.24)), Vector((0.88, 0.0, 0.08))]
    tube(bm, uv, skull_pts, [0.12, 0.15, 0.050], sides=6, u_range=(0.04, 0.50), v_range=(0.15, 0.75), scale_y=0.68)
    for side_y in (-1, 1):
        h0 = Vector((0.56, side_y * 0.10, 0.24))
        h1 = Vector((0.50, side_y * 0.38, 0.42))
        h2 = Vector((0.66, side_y * 0.54, 0.64))
        tube(bm, uv, [h0, h1, h2], [0.054, 0.036, 0.012], sides=6, u_range=(0.04, 0.50), v_range=(0.55, 0.98))
    return finish_mesh('savanna-sunbleached-ribcage-01', bm, mat)


def build_farmland_poppy_wheat(mat):
    """Golden wheat-ear verge clump with scarlet corn-poppies and blue cornflowers."""
    rng = random.Random(311)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # 9 tall golden wheat-ear cards + 7 scarlet poppy & cornflower cards
    for k in range(16):
        is_wheat = k < 9
        yaw = k / 16 * 2 * math.pi + rng.uniform(-0.2, 0.2)
        r = rng.uniform(0.05, 0.28)
        base = Vector((math.cos(yaw) * r, math.sin(yaw) * r, 0.02))
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        h = rng.uniform(0.78, 1.08) if is_wheat else rng.uniform(0.56, 0.82)
        reach = rng.uniform(0.28, 0.46) if is_wheat else rng.uniform(0.36, 0.58)
        p1 = base + out * (reach * 0.48) + Vector((0, 0, h * 0.58))
        p2 = base + out * reach + Vector((0, 0, h))
        u_rng = (0.0, 0.52) if is_wheat else (0.52, 1.0)
        w = 0.28 if is_wheat else 0.34
        arched_card(bm, uv, base, p1, p2, w * 0.5, w, w * 0.75, side, u_range=u_rng, v_range=(0.02, 0.98))
    return finish_mesh('farmland-poppy-wheat-01', bm, mat)


# ---------------------------------------------------------------------------
# 4. BIOME MICRO-STRUCTURES, SHRINES & RUINS KIT (`ground/structures/`)
# ---------------------------------------------------------------------------

def build_structure_waystone_shrine(mat):
    """Moss-draped carved runic waystone obelisk on a stepped stone plinth."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Stepped octagonal bevelled plinth + tapered chiselled waystone obelisk
    plinth = [Vector((0, 0, -0.04)), Vector((0, 0, 0.14)), Vector((0, 0, 0.20)), Vector((0, 0, 0.34)), Vector((0, 0, 0.38))]
    tube(bm, uv, plinth, [0.58, 0.54, 0.46, 0.42, 0.32], sides=8, u_range=(0.0, 1.0), v_range=(0.02, 0.28), cap_end=False)
    obelisk = [Vector((0, 0, 0.34)), Vector((0.02, 0.01, 0.96)), Vector((0.03, 0.01, 1.54)), Vector((0.03, 0.01, 1.78))]
    tube(bm, uv, obelisk, [0.28, 0.23, 0.17, 0.02], sides=4, u_range=(0.0, 1.0), v_range=(0.25, 0.96), cap_end=True, scale_y=0.72)

    # Flanked faceted offering boulders anchored into soil
    planar_rock(bm, uv, Vector((0.42, -0.24, 0.06)), Vector((0.25, 0.20, 0.15)), style='crag', seed=3121, u_range=(0.05, 0.45), v_range=(0.02, 0.32))
    planar_rock(bm, uv, Vector((-0.38, 0.26, 0.05)), Vector((0.22, 0.18, 0.13)), style='crag', seed=3122, u_range=(0.05, 0.45), v_range=(0.02, 0.32))
    return finish_mesh('structure-waystone-shrine-01', bm, mat)


def build_structure_ruined_column(mat):
    """Toppled fluted marble/limestone temple column drums overgrown with trailing ivy."""
    rng = random.Random(313)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Standing broken fluted column base drum with fractured top
    base_drum = [Vector((-0.32, 0.10, -0.04)), Vector((-0.32, 0.10, 0.12)), Vector((-0.30, 0.10, 0.48))]
    tube(bm, uv, base_drum, [0.36, 0.28, 0.26], sides=12, flute_count=12, flute_depth=0.08, u_range=(0.0, 0.60), v_range=(0.04, 0.88), cap_end=False)
    splintered_fracture_cap(bm, uv, base_drum[-1], Vector((0.06, -0.04, 1.0)).normalized(), 0.25, rng, (0.0, 0.60), (0.04, 0.88), (0.0, 0.60), (0.04, 0.88), splinters=7)

    # Fallen fluted column drum lying diagonally on the ground
    fallen = [Vector((0.02, -0.14, 0.16)), Vector((0.58, -0.04, 0.14))]
    tube(bm, uv, fallen, [0.24, 0.23], sides=12, flute_count=12, flute_depth=0.08, u_range=(0.0, 0.60), v_range=(0.08, 0.90), cap_end=False)
    splintered_fracture_cap(bm, uv, fallen[1], Vector((1.0, 0.18, -0.04)).normalized(), 0.22, rng, (0.0, 0.60), (0.08, 0.90), (0.0, 0.60), (0.08, 0.90), splinters=6)

    # 7 trailing ivy cards draped over the standing and fallen drums
    for k in range(7):
        yaw = k / 7 * 2 * math.pi + 0.3
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        center = Vector((-0.34, 0.12, 0.56)) if k < 4 else Vector((0.35, -0.10, 0.38))
        p0 = center + out * 0.12 + Vector((0, 0, 0.06))
        p1 = center + out * 0.34 - Vector((0, 0, 0.12))
        p2 = center + out * 0.48 - Vector((0, 0, 0.34))
        arched_card(bm, uv, p0, p1, p2, 0.18, 0.28, 0.20, side, u_range=(0.64, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('structure-ruined-column-01', bm, mat)


def build_structure_roadside_milestone(mat):
    """Weathered carved stone distance milestone & wooden signpost with basal wildflowers."""
    rng = random.Random(314)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Carved chamfered stone milestone
    mile_pts = [Vector((-0.18, 0.0, -0.04)), Vector((-0.18, 0.0, 0.14)), Vector((-0.18, 0.0, 0.72)), Vector((-0.18, 0.0, 0.90))]
    tube(bm, uv, mile_pts, [0.26, 0.22, 0.20, 0.10], sides=8, u_range=(0.02, 0.46), v_range=(0.04, 0.94), scale_y=0.64)

    # Wooden signpost mast with forged collar + two pointed directional fingerboards
    post_pts = [Vector((0.22, 0.06, -0.04)), Vector((0.23, 0.06, 0.85)), Vector((0.24, 0.06, 1.50))]
    organic_trunk_loft(bm, uv, post_pts, [0.072, 0.058, 0.050], rng, sides=6, bark_ridges=4, ridge_depth=0.06, u_range=(0.50, 0.74), v_range=(0.04, 0.94))
    arm1 = [Vector((0.18, 0.06, 1.32)), Vector((0.72, 0.06, 1.32)), Vector((0.82, 0.06, 1.32))]
    tube(bm, uv, arm1, [0.078, 0.074, 0.015], sides=4, u_range=(0.50, 0.74), v_range=(0.20, 0.85), scale_y=0.22)
    arm2 = [Vector((0.24, 0.02, 1.16)), Vector((0.24, -0.46, 1.16)), Vector((0.24, -0.56, 1.16))]
    tube(bm, uv, arm2, [0.078, 0.074, 0.015], sides=4, u_range=(0.50, 0.74), v_range=(0.20, 0.85), scale_y=0.22)

    # 7 basal wildflower tufts around the milestone foot
    for k in range(7):
        yaw = k / 7 * 2 * math.pi + 0.4
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        p0 = out * 0.24 + Vector((0, 0, -0.015))
        p1 = out * 0.40 + Vector((0, 0, 0.26))
        p2 = out * 0.56 + Vector((0, 0, 0.40))
        arched_card(bm, uv, p0, p1, p2, 0.16, 0.26, 0.22, side, u_range=(0.78, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('structure-roadside-milestone-01', bm, mat)


def build_structure_dwarven_cairn(mat):
    """Vondari / Stonehold banded basalt & bronze boundary marker pillar with glowing brazier cap."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Stepped hexagonal basalt & bronze pillar crowned with flared brazier collar
    pts = [
        Vector((0, 0, -0.04)),
        Vector((0, 0, 0.18)),
        Vector((0, 0, 0.30)),
        Vector((0, 0, 0.38)),
        Vector((0, 0, 1.00)),
        Vector((0, 0, 1.12)),
        Vector((0, 0, 1.24)),
        Vector((0, 0, 1.38)),
    ]
    radii = [0.46, 0.42, 0.36, 0.25, 0.22, 0.28, 0.40, 0.30]
    tube(bm, uv, pts, radii, sides=8, u_range=(0.56, 0.98), v_range=(0.04, 0.94), cap_end=True)

    # Flanked chiselled basalt ward stones at the base
    for side_x in (-1, 1):
        planar_rock(bm, uv, Vector((side_x * 0.50, 0.0, 0.26)), Vector((0.18, 0.15, 0.38)), style='crag', seed=3150 + side_x, u_range=(0.04, 0.52), v_range=(0.08, 0.88))
    return finish_mesh('structure-dwarven-cairn-01', bm, mat)


def build_structure_bog_fetish_totem(mat):
    """Grukmar wetland lashed driftwood & skull fetish totem with glowing bog-gourd lantern."""
    rng = random.Random(316)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Tripod of crooked driftwood stakes lashed together into mud
    for k in range(3):
        yaw = k * 2 * math.pi / 3 + 0.2
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        pts = [out * 0.40 + Vector((0, 0, -0.04)), out * 0.08 + Vector((0, 0, 0.92)), -out * 0.16 + Vector((0, 0, 1.56))]
        organic_trunk_loft(bm, uv, pts, [0.068, 0.052, 0.028], rng, sides=6, bark_ridges=5, ridge_depth=0.12, u_range=(0.04, 0.46), v_range=(0.04, 0.92))

    # Central rope lashing knot collar + crooked crossbar
    tube(bm, uv, [Vector((0, 0, 1.12)), Vector((0, 0, 1.28))], [0.095, 0.088], sides=8, u_range=(0.04, 0.46), v_range=(0.35, 0.65))
    cross = [Vector((-0.46, 0.0, 1.18)), Vector((0.50, 0.0, 1.24))]
    organic_trunk_loft(bm, uv, cross, [0.045, 0.038], rng, sides=6, bark_ridges=4, ridge_depth=0.10, u_range=(0.04, 0.46), v_range=(0.35, 0.65))

    # Horned beast skull mounted at lashing
    skull = [Vector((0.0, -0.08, 0.82)), Vector((0.0, -0.22, 0.96)), Vector((0.0, -0.34, 0.84))]
    tube(bm, uv, skull, [0.12, 0.15, 0.06], sides=6, u_range=(0.54, 0.96), v_range=(0.06, 0.52), scale_y=0.72)

    # Ribbed hanging bioluminescent bog-gourd lantern on +X arm
    gourd = [Vector((0.38, 0.0, 1.22)), Vector((0.38, 0.0, 1.06)), Vector((0.38, 0.0, 0.94)), Vector((0.38, 0.0, 0.78))]
    tube(bm, uv, gourd, [0.016, 0.030, 0.13, 0.035], sides=8, flute_count=8, flute_depth=0.12, u_range=(0.54, 0.96), v_range=(0.62, 0.96))
    return finish_mesh('structure-bog-fetish-totem-01', bm, mat)


def build_structure_rainforest_idol(mat):
    """Ancient moss-covered carved jungle monolith / stepped stone idol entwined with vines."""
    rng = random.Random(317)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Stepped carved basalt jungle monolith + flanking stone shoulders
    idol_pts = [
        Vector((0, 0, -0.04)),
        Vector((0, 0, 0.36)),
        Vector((0, 0, 0.88)),
        Vector((0, 0, 1.18)),
        Vector((0, 0, 1.48)),
    ]
    idol_radii = [0.46, 0.36, 0.34, 0.42, 0.26]
    tube(bm, uv, idol_pts, idol_radii, sides=6, u_range=(0.02, 0.56), v_range=(0.04, 0.96), scale_y=0.78, rough=0.05, rng=rng)
    planar_rock(bm, uv, Vector((-0.34, 0.14, 0.08)), Vector((0.26, 0.22, 0.16)), style='crag', seed=3171, u_range=(0.02, 0.56), v_range=(0.04, 0.96))
    planar_rock(bm, uv, Vector((0.32, -0.18, 0.07)), Vector((0.22, 0.20, 0.14)), style='crag', seed=3172, u_range=(0.02, 0.56), v_range=(0.04, 0.96))

    # 8 jungle fern & monstera vine cards embracing the monolith base and shoulders
    for k in range(8):
        yaw = k / 8 * 2 * math.pi + 0.25
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        z0 = 0.06 if k < 5 else 0.72
        p0 = out * 0.26 + Vector((0, 0, z0))
        p1 = out * 0.52 + Vector((0, 0, z0 + 0.28))
        p2 = out * 0.74 + Vector((0, 0, z0 + 0.14))
        arched_card(bm, uv, p0, p1, p2, 0.18, 0.34, 0.24, side, u_range=(0.60, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('structure-rainforest-idol-01', bm, mat)


# ---------------------------------------------------------------------------
# 5. AUTHORED BIOME SHRUBS (`bushVariants`, distinct multi-stem woody forms)
# ---------------------------------------------------------------------------

SHRUB_MAX_TRIANGLES = 32000


def _add_branch_spray_pair(bm, uv, attach_pt, branch_dir, length, width, arch=0.14, roll_bias=0.0):
    """Attach varied 3D V-cupped twig sprays + inner canopy skirt + outer bud fan onto a branch node."""
    fwd = branch_dir.normalized()
    leaf_spray_fan(
        bm, uv, attach_pt, fwd, length, width,
        u_range=(0.30, 1.0), v_range=(0.02, 0.98),
        roll=roll_bias + 0.18, arch=arch, cup=0.18, tip_scale=0.38,
    )
    up = Vector((0.0, 0.0, 1.0)) if abs(fwd.z) < 0.90 else Vector((1.0, 0.0, 0.0))
    side = fwd.cross(up).normalized()
    fwd2 = (fwd * 0.86 + up * 0.32 + side * 0.24).normalized()
    leaf_spray_fan(
        bm, uv, attach_pt, fwd2, length * 0.86, width * 0.90,
        u_range=(0.30, 1.0), v_range=(0.02, 0.98),
        roll=roll_bias - 0.85, arch=arch * 0.7, cup=0.16, tip_scale=0.36,
    )
    fwd_skirt = (fwd * 0.62 - up * 0.28 - side * 0.56).normalized()
    skirt_anchor = attach_pt - fwd * (length * 0.16)
    leaf_spray_fan(
        bm, uv, skirt_anchor, fwd_skirt, length * 0.78, width * 0.84,
        u_range=(0.30, 1.0), v_range=(0.02, 0.98),
        roll=roll_bias + 1.05, arch=max(0.06, arch * 0.65), cup=0.16, tip_scale=0.34,
    )
    # Smaller staggered outer bud shoot for broken natural silhouette
    fwd_bud = (fwd * 0.78 + up * 0.44 - side * 0.36).normalized()
    leaf_spray_fan(
        bm, uv, attach_pt + fwd * (length * 0.12), fwd_bud, length * 0.56, width * 0.62,
        u_range=(0.30, 1.0), v_range=(0.02, 0.98),
        roll=roll_bias - 0.42, arch=arch * 1.1, cup=0.20, tip_scale=0.32,
    )


def build_bush_arid_ocotillo(mat):
    """Sprawling multi-cane desert Ocotillo (Fouquieria splendens) whip fountain with stem leaves and scarlet tip spikes."""
    rng = random.Random(321)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    cane_specs = (
        (0.18, 0.56, 1.48), (0.94, 0.42, 1.66), (1.72, 0.72, 1.24), (2.48, 0.48, 1.56),
        (3.26, 0.68, 1.18), (4.05, 0.38, 1.72), (4.88, 0.60, 1.36), (5.58, 0.76, 1.06),
    )
    for idx, (yaw, splay, h) in enumerate(cane_specs):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        bend = rng.uniform(-0.14, 0.14)
        p0 = out * 0.07 + Vector((0.0, 0.0, -0.028))
        p1 = out * (splay * 0.46) + side * (bend * 0.5) + Vector((0.0, 0.0, h * 0.50))
        p2 = out * (splay * 0.92) + side * bend + Vector((0.0, 0.0, h))
        organic_trunk_loft(bm, uv, [p0, p1, p2], [0.048, 0.028, 0.012], rng, sides=6, bark_ridges=5, ridge_depth=0.14, cap_end=False, u_range=(0.02, 0.27), v_range=(0.04, 0.94))

        mid_pt = p0.lerp(p1, 0.75)
        cane_dir = (p1 - p0).normalized()
        leaf_spray_fan(bm, uv, mid_pt, (cane_dir + side * 0.35).normalized(), 0.44, 0.38, u_range=(0.30, 1.0), v_range=(0.02, 0.74), roll=0.4 if idx % 2 else -0.4, arch=0.10)
        tip_dir = (p2 - p1 + Vector((0.0, 0.0, 0.18))).normalized()
        _add_branch_spray_pair(bm, uv, p1.lerp(p2, 0.65), tip_dir, 0.50, 0.38, arch=0.14, roll_bias=idx * 0.7)
    return finish_mesh('bush-arid-ocotillo-01', bm, mat, max_triangles=SHRUB_MAX_TRIANGLES, allow_extra_material=False)


def build_bush_savanna_thorn(mat):
    """Crooked multi-stemmed Savanna thorn scrub (Vachellia/Acacia shrub) with uneven branching and open center."""
    return build_savanna_thorn_scrub(mat, name='bush-savanna-thorn-01', seed=322, low_budget=False, max_triangles=16050)


def build_bush_meadow_gorse(mat):
    """Irregular, billowy Meadow Gorse thicket with asymmetrical dark multi-stem canes and sunlit flower clusters."""
    rng = random.Random(323)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    canes = (
        (0.10, 0.68, 0.36, 0.74),
        (1.25, 0.56, 0.48, 1.06),
        (2.38, 0.74, 0.30, 0.62),
        (3.52, 0.60, 0.44, 0.96),
        (4.65, 0.72, 0.34, 0.68),
        (5.48, 0.48, 0.50, 1.12),
    )
    for idx, (yaw, r_xy, z_mid, z_top) in enumerate(canes):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        p0 = out * 0.07 + Vector((0.0, 0.0, -0.028))
        p1 = out * (r_xy * 0.48) + side * rng.uniform(-0.08, 0.08) + Vector((0.0, 0.0, z_mid))
        p2 = out * r_xy + Vector((0.0, 0.0, z_top))
        organic_trunk_loft(bm, uv, [p0, p1, p2], [0.056, 0.032, 0.015], rng, sides=6, bark_ridges=5, ridge_depth=0.14, cap_end=False, u_range=(0.02, 0.27), v_range=(0.04, 0.94))

        fork_side = 1.0 if idx % 2 == 0 else -1.0
        twig_end = p1 + out * 0.26 + side * (fork_side * 0.30) + Vector((0.0, 0.0, 0.16 if idx % 3 else -0.04))
        tube(bm, uv, [p1, twig_end], [0.024, 0.012], sides=4, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        _add_branch_spray_pair(bm, uv, p2 - Vector((0, 0, 0.06)), (p2 - p1 + Vector((0, 0, 0.22))).normalized(), 0.56, 0.58, arch=0.14, roll_bias=idx * 0.4)
        _add_branch_spray_pair(bm, uv, twig_end - Vector((0, 0, 0.04)), (twig_end - p1).normalized(), 0.50, 0.52, arch=0.08, roll_bias=-0.5)
    return finish_mesh('bush-meadow-gorse-01', bm, mat, max_triangles=SHRUB_MAX_TRIANGLES, allow_extra_material=False)


def build_bush_boreal_juniper(mat):
    """Tiered asymmetric Boreal Krummholz Juniper with varied heights so individual shrubs read over moss."""
    return build_taiga_krummholz_juniper(mat, name='bush-boreal-juniper-01', seed=324, max_triangles=16050)


def build_bush_tropical_hibiscus(mat):
    """Graceful arching Tropical Hibiscus multi-stem shrub with forked nodes and broad-leaved flower sprays."""
    rng = random.Random(325)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    stems = (
        (0.25, 0.64, 0.52, 1.18),
        (1.50, 0.72, 0.46, 0.98),
        (2.78, 0.58, 0.58, 1.28),
        (4.02, 0.76, 0.40, 0.84),
        (5.22, 0.62, 0.50, 1.10),
    )
    for idx, (yaw, r_xy, z_f, z_t) in enumerate(stems):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        p0 = out * 0.07 + Vector((0.0, 0.0, -0.028))
        p1 = out * (r_xy * 0.42) + Vector((0.0, 0.0, z_f))
        p2 = out * r_xy + Vector((0.0, 0.0, z_t))
        organic_trunk_loft(bm, uv, [p0, p1, p2], [0.054, 0.030, 0.014], rng, sides=6, bark_ridges=5, ridge_depth=0.12, cap_end=False, u_range=(0.02, 0.27), v_range=(0.04, 0.94))

        fork_pt = p1.lerp(p2, 0.25)
        twig_end = fork_pt + out * 0.30 + side * (0.34 if idx % 2 == 0 else -0.34) + Vector((0.0, 0.0, 0.14))
        tube(bm, uv, [fork_pt, twig_end], [0.024, 0.012], sides=4, u_range=(0.02, 0.27), v_range=(0.10, 0.90), cap_end=False)

        _add_branch_spray_pair(bm, uv, p2 - Vector((0, 0, 0.06)), (p2 - p1 + Vector((0, 0, 0.15))).normalized(), 0.58, 0.60, arch=-0.06, roll_bias=idx * 0.5)
        _add_branch_spray_pair(bm, uv, twig_end - Vector((0, 0, 0.04)), (twig_end - fork_pt).normalized(), 0.50, 0.52, arch=-0.08, roll_bias=-0.4)
    return finish_mesh('bush-tropical-hibiscus-01', bm, mat, max_triangles=SHRUB_MAX_TRIANGLES, allow_extra_material=False)


def build_bush_swamp_buttonbush(mat):
    """Sprawling crooked wetland Buttonbush with leaning forked bog canes and distinct airy leaf groupings."""
    rng = random.Random(326)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    canes = (
        (0.08, 0.82, 0.38, 0.82),
        (1.12, 0.68, 0.48, 1.08),
        (2.18, 0.86, 0.32, 0.68),
        (3.36, 0.64, 0.44, 0.96),
        (4.42, 0.78, 0.34, 0.74),
        (5.50, 0.58, 0.52, 1.12),
    )
    for idx, (yaw, r_xy, z_f, z_t) in enumerate(canes):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        p0 = out * 0.08 + Vector((0.0, 0.0, -0.028))
        p1 = out * (r_xy * 0.46) + side * rng.uniform(-0.14, 0.14) + Vector((0.0, 0.0, z_f))
        p2 = out * r_xy + side * rng.uniform(-0.10, 0.10) + Vector((0.0, 0.0, z_t))
        organic_trunk_loft(bm, uv, [p0, p1, p2], [0.056, 0.032, 0.015], rng, sides=6, bark_ridges=5, ridge_depth=0.14, cap_end=False, u_range=(0.02, 0.27), v_range=(0.04, 0.94))

        twig_end = p1 + out * 0.28 + side * (-0.34 if idx % 2 else 0.34) + Vector((0.0, 0.0, 0.12))
        tube(bm, uv, [p1, twig_end], [0.024, 0.012], sides=4, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        _add_branch_spray_pair(bm, uv, p2 - Vector((0, 0, 0.05)), (p2 - p1 + Vector((0, 0, 0.18))).normalized(), 0.54, 0.54, arch=0.10, roll_bias=idx * 0.45)
        _add_branch_spray_pair(bm, uv, twig_end - Vector((0, 0, 0.04)), (twig_end - p1).normalized(), 0.48, 0.50, arch=0.08, roll_bias=-0.4)
    return finish_mesh('bush-swamp-buttonbush-01', bm, mat, max_triangles=SHRUB_MAX_TRIANGLES, allow_extra_material=False)
