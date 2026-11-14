"""3D BMesh builders for coastal, glacier/alpine, savanna, biome micro-structures,
and authored biome shrubs (`bushVariants`).
"""
import math
import random
import bmesh
from mathutils import Vector
from understory_common import arched_card, finish_mesh, leaf_spray_fan, mushroom_dome, rock_chunk, tube


# ---------------------------------------------------------------------------
# 1. COASTAL & SHORELINE KIT (Biome 0, 12)
# ---------------------------------------------------------------------------

def build_coastal_dune_oats(mat):
    """Wind-bent golden sea-oats & marram dune grass on a sand hummock with bleached driftwood."""
    rng = random.Random(301)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Half-buried sun-bleached driftwood log
    drift_pts = [Vector((-0.48, -0.14, 0.04)), Vector((0.02, 0.02, 0.14)), Vector((0.52, 0.16, 0.06))]
    tube(bm, uv, drift_pts, [0.11, 0.13, 0.08], sides=5, u_range=(0.04, 0.42), v_range=(0.05, 0.92), rough=0.07, rng=rng)

    # 12 wind-bent sea-oats & marram grass cards (arching gracefully along +X sea breeze)
    for k in range(12):
        yaw = k / 12 * 2 * math.pi + rng.uniform(-0.18, 0.18)
        r = rng.uniform(0.06, 0.34)
        base = Vector((math.cos(yaw) * r, math.sin(yaw) * r, 0.02))
        out = Vector((math.cos(yaw) * 0.65 + 0.48, math.sin(yaw) * 0.65, 0)).normalized()
        side = Vector((-out.y, out.x, 0))
        h = rng.uniform(0.68, 1.08)
        reach = rng.uniform(0.45, 0.78)
        p1 = base + out * (reach * 0.45) + Vector((0, 0, h * 0.68))
        p2 = base + out * reach + Vector((0, 0, h * 0.88))
        arched_card(bm, uv, base, p1, p2, 0.18, 0.34, 0.28, side, u_range=(0.45, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('coastal-dune-oats-01', bm, mat)


def build_coastal_tidepool_coral(mat):
    """Barnacle-encrusted coastal basalt tidepool rock with sea anemones, starfish, and fan coral."""
    rng = random.Random(302)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Two wet basalt tidepool rocks
    rock_chunk(bm, uv, Vector((-0.18, 0.08, 0.18)), (0.48, 0.40, 0.25), u_range=(0.02, 0.50), v_range=(0.04, 0.94), subdivisions=2, rng=rng)
    rock_chunk(bm, uv, Vector((0.28, -0.14, 0.12)), (0.36, 0.30, 0.18), u_range=(0.02, 0.50), v_range=(0.04, 0.94), subdivisions=1, rng=rng)

    # 4 crimson sea-anemone crowns in the tidepool hollow & rock ledges
    for pos, rad, h in (
        (Vector((0.04, -0.02, 0.26)), 0.14, 0.06),
        (Vector((-0.12, 0.18, 0.34)), 0.11, 0.05),
        (Vector((0.22, -0.08, 0.24)), 0.12, 0.05),
        (Vector((-0.32, -0.12, 0.20)), 0.10, 0.045),
    ):
        mushroom_dome(bm, uv, pos, rad, h, sides=6, u_range=(0.54, 0.98), v_range=(0.52, 0.98))

    # 3 orange starfish / coral fans clinging to the rock flanks
    for pos, tilt in (
        (Vector((-0.06, -0.26, 0.18)), Vector((0.1, -0.6, 0.8))),
        (Vector((0.36, 0.08, 0.16)), Vector((0.6, 0.2, 0.8))),
        (Vector((-0.38, 0.16, 0.22)), Vector((-0.5, 0.3, 0.8))),
    ):
        mushroom_dome(bm, uv, pos, 0.13, 0.025, sides=5, u_range=(0.54, 0.98), v_range=(0.02, 0.48), tilt=tilt)
    return finish_mesh('coastal-tidepool-coral-01', bm, mat)


def build_coastal_shipwreck_ribs(mat):
    """Weathered shipwreck keel timber and curved hull ribs half-buried in coastal sand."""
    rng = random.Random(303)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Sand & kelp wrack mound base
    rock_chunk(bm, uv, Vector((0.0, 0.0, 0.08)), (0.68, 0.48, 0.14), u_range=(0.56, 0.98), v_range=(0.04, 0.96), subdivisions=1, rng=rng, dome=True)

    # Heavy weathered keel beam along X
    keel = [Vector((-0.82, -0.04, 0.06)), Vector((0.0, 0.0, 0.14)), Vector((0.84, 0.05, 0.10))]
    tube(bm, uv, keel, [0.11, 0.13, 0.10], sides=5, u_range=(0.04, 0.52), v_range=(0.04, 0.94), rough=0.05, rng=rng)

    # 5 curved oak hull ribs rising from the keel on alternating sides
    for x_off, side_y, h_top in ((-0.52, 1, 0.72), (-0.24, -1, 0.84), (0.04, 1, 0.92), (0.32, -1, 0.78), (0.58, 1, 0.62)):
        p0 = Vector((x_off, side_y * 0.06, 0.10))
        p1 = Vector((x_off + 0.04, side_y * 0.42, h_top * 0.52))
        p2 = Vector((x_off + 0.08, side_y * 0.34, h_top))
        tube(bm, uv, [p0, p1, p2], [0.075, 0.062, 0.042], sides=4, u_range=(0.04, 0.52), v_range=(0.08, 0.92), rough=0.04, rng=rng)
    return finish_mesh('coastal-shipwreck-ribs-01', bm, mat)


# ---------------------------------------------------------------------------
# 2. GLACIER, ALPINE & COLD STEPPE KIT (Biomes 11, 2, 10)
# ---------------------------------------------------------------------------

def build_glacier_ice_spires(mat):
    """Translucent azure-and-white fractured glacial serac spires rising from a snowdrift."""
    rng = random.Random(304)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Sastrugi snow-drift base
    rock_chunk(bm, uv, Vector((0.0, 0.0, 0.10)), (0.58, 0.46, 0.16), u_range=(0.02, 0.42), v_range=(0.55, 0.98), subdivisions=1, rng=rng, dome=True)

    # 6 tilted hexagonal/faceted glacial ice spires
    spires = [
        (Vector((0.0, 0.0, 0.04)), Vector((0.12, 0.06, 1.32)), 0.24),
        (Vector((-0.24, 0.12, 0.04)), Vector((-0.42, 0.22, 1.02)), 0.19),
        (Vector((0.26, -0.10, 0.04)), Vector((0.46, -0.18, 0.94)), 0.18),
        (Vector((-0.14, -0.22, 0.04)), Vector((-0.26, -0.38, 0.78)), 0.16),
        (Vector((0.16, 0.24, 0.04)), Vector((0.28, 0.40, 0.72)), 0.15),
        (Vector((0.36, 0.10, 0.02)), Vector((0.56, 0.18, 0.54)), 0.13),
    ]
    for p0, p2, w in spires:
        p1 = p0.lerp(p2, 0.55)
        tube(bm, uv, [p0, p1, p2], [w, w * 0.74, 0.02], sides=5, u_range=(0.45, 0.98), v_range=(0.04, 0.96), cap_end=True)
    return finish_mesh('glacier-ice-spires-01', bm, mat)


def build_glacier_moraine_cairn(mat):
    """Frost-shattered dark moraine slate slabs with wind-packed snow caps and cairn stones."""
    rng = random.Random(305)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    slabs = [
        (Vector((-0.16, 0.04, 0.22)), (0.52, 0.38, 0.28), 2),
        (Vector((0.28, -0.14, 0.16)), (0.38, 0.30, 0.22), 1),
        (Vector((-0.08, 0.06, 0.50)), (0.28, 0.22, 0.16), 1),
        (Vector((-0.06, 0.06, 0.68)), (0.16, 0.14, 0.12), 1),
    ]
    for center, radii, subdiv in slabs:
        rock_chunk(bm, uv, center, radii, u_range=(0.02, 0.98), v_range=(0.04, 0.96), subdivisions=subdiv, rng=rng)
    return finish_mesh('glacier-moraine-cairn-01', bm, mat)


def build_steppe_feathergrass(mat):
    """Silvery-gold Eurasian/cold-steppe feathergrass (Stipa) plumes & wormwood tussock."""
    rng = random.Random(306)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # 14 graceful upright-arching feathergrass tussock cards
    for k in range(14):
        tier = 0 if k < 8 else 1
        yaw = (k / (8 if tier == 0 else 6)) * 2 * math.pi + rng.uniform(-0.22, 0.22)
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        reach = rng.uniform(0.32, 0.48) if tier == 0 else rng.uniform(0.18, 0.30)
        h_top = rng.uniform(0.52, 0.72) if tier == 0 else rng.uniform(0.68, 0.86)
        p0 = out * 0.06 + Vector((0, 0, -0.02))
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

    rock_chunk(bm, uv, Vector((-0.14, 0.06, 0.16)), (0.46, 0.36, 0.22), u_range=(0.02, 0.46), v_range=(0.04, 0.96), subdivisions=2, rng=rng)
    rock_chunk(bm, uv, Vector((0.24, -0.14, 0.10)), (0.30, 0.24, 0.14), u_range=(0.02, 0.46), v_range=(0.04, 0.96), subdivisions=1, rng=rng)

    # 9 Edelweiss & blue gentian flower cards nestled in the rock crevices
    for k in range(9):
        yaw = k / 9 * 2 * math.pi + rng.uniform(-0.2, 0.2)
        r = rng.uniform(0.10, 0.34)
        base = Vector((math.cos(yaw) * r, math.sin(yaw) * r, 0.12))
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        h = rng.uniform(0.32, 0.50)
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

    # Central cathedral spire + 4 buttress chimneys
    spires = [
        (Vector((0.0, 0.0, -0.05)), Vector((0.04, 0.02, 1.48)), (0.42, 0.30, 0.12), 7),
        (Vector((0.24, 0.10, -0.04)), Vector((0.28, 0.14, 0.96)), (0.22, 0.16, 0.07), 5),
        (Vector((-0.22, 0.14, -0.04)), Vector((-0.26, 0.18, 0.84)), (0.20, 0.15, 0.06), 5),
        (Vector((0.08, -0.24, -0.04)), Vector((0.12, -0.28, 0.76)), (0.19, 0.14, 0.06), 5),
        (Vector((-0.18, -0.18, -0.04)), Vector((-0.22, -0.22, 0.64)), (0.18, 0.13, 0.05), 5),
    ]
    for p0, p2, radii, sides in spires:
        p1 = p0.lerp(p2, 0.52)
        tube(bm, uv, [p0, p1, p2], radii, sides=sides, u_range=(0.02, 0.56), v_range=(0.04, 0.95), rough=0.10, rng=rng)

    # 8 golden elephant-grass tuft cards around the mound foot
    for k in range(8):
        yaw = k / 8 * 2 * math.pi + 0.2
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        p0 = out * 0.34 + Vector((0, 0, 0.02))
        p1 = out * 0.56 + Vector((0, 0, 0.38))
        p2 = out * 0.78 + Vector((0, 0, 0.58))
        arched_card(bm, uv, p0, p1, p2, 0.22, 0.34, 0.24, side, u_range=(0.60, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('savanna-termite-mound-01', bm, mat)


def build_savanna_desert_rose(mat):
    """Low grounded multi-stem Adenium obesum (Desert Rose) succulent cluster with coral-gold blossoms."""
    rng = random.Random(309)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Low gnarled caudex stems emerging from the earth
    for yaw, h_end in ((0.4, 0.34), (2.5, 0.30), (4.6, 0.28)):
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        b0 = out * 0.04 + Vector((0, 0, -0.02))
        b1 = b0 + out * 0.14 + Vector((0, 0, h_end * 0.55))
        b2 = b0 + out * 0.24 + Vector((0, 0, h_end))
        tube(bm, uv, [b0, b1, b2], [0.085, 0.065, 0.040], sides=5, u_range=(0.04, 0.44), v_range=(0.10, 0.90), rough=0.05, rng=rng)

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

    # Dusty earth & stone mound under the skeleton
    rock_chunk(bm, uv, Vector((0.0, 0.0, 0.06)), (0.64, 0.44, 0.12), u_range=(0.56, 0.98), v_range=(0.05, 0.95), subdivisions=1, rng=rng, dome=True)

    # Vertebral spine column along X
    spine = [Vector((-0.62, 0.0, 0.14)), Vector((-0.10, 0.02, 0.24)), Vector((0.42, 0.0, 0.18))]
    tube(bm, uv, spine, [0.055, 0.070, 0.060], sides=5, u_range=(0.04, 0.50), v_range=(0.05, 0.72), rough=0.06, rng=rng)

    # 4 pairs of curved ivory ribs arching over the sand
    for x_pos, rib_w, rib_h in ((-0.46, 0.34, 0.44), (-0.22, 0.44, 0.54), (0.02, 0.46, 0.56), (0.26, 0.38, 0.46)):
        for side_y in (-1, 1):
            r0 = Vector((x_pos, side_y * 0.04, 0.20))
            r1 = Vector((x_pos + 0.03, side_y * rib_w, rib_h))
            r2 = Vector((x_pos + 0.06, side_y * (rib_w * 0.78), 0.06))
            tube(bm, uv, [r0, r1, r2], [0.036, 0.032, 0.020], sides=4, u_range=(0.04, 0.50), v_range=(0.10, 0.75))

    # Horned skull at +X end with two sweeping dark-tipped horns
    skull_pts = [Vector((0.44, 0.0, 0.20)), Vector((0.64, 0.0, 0.24)), Vector((0.86, 0.0, 0.10))]
    tube(bm, uv, skull_pts, [0.11, 0.14, 0.055], sides=5, u_range=(0.04, 0.50), v_range=(0.15, 0.75), scale_y=0.68)
    for side_y in (-1, 1):
        h0 = Vector((0.56, side_y * 0.10, 0.24))
        h1 = Vector((0.50, side_y * 0.38, 0.42))
        h2 = Vector((0.64, side_y * 0.52, 0.62))
        tube(bm, uv, [h0, h1, h2], [0.052, 0.036, 0.014], sides=4, u_range=(0.04, 0.50), v_range=(0.55, 0.98))
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
    rng = random.Random(312)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Stepped octagonal/square plinth + tapered carved runic obelisk
    plinth = [Vector((0, 0, -0.04)), Vector((0, 0, 0.18)), Vector((0, 0, 0.34))]
    tube(bm, uv, plinth, [0.54, 0.48, 0.36], sides=4, u_range=(0.0, 1.0), v_range=(0.02, 0.28), cap_end=False)
    obelisk = [Vector((0, 0, 0.30)), Vector((0.02, 0.01, 0.95)), Vector((0.03, 0.01, 1.52)), Vector((0.03, 0.01, 1.74))]
    tube(bm, uv, obelisk, [0.28, 0.23, 0.18, 0.02], sides=4, u_range=(0.0, 1.0), v_range=(0.25, 0.96), cap_end=True)

    # Two mossy offering stones at the foot
    rock_chunk(bm, uv, Vector((0.42, -0.24, 0.10)), (0.24, 0.20, 0.14), u_range=(0.05, 0.45), v_range=(0.02, 0.32), subdivisions=1, rng=rng)
    rock_chunk(bm, uv, Vector((-0.38, 0.26, 0.08)), (0.20, 0.18, 0.12), u_range=(0.05, 0.45), v_range=(0.02, 0.32), subdivisions=1, rng=rng)
    return finish_mesh('structure-waystone-shrine-01', bm, mat)


def build_structure_ruined_column(mat):
    """Toppled fluted marble/limestone temple column drums overgrown with trailing ivy."""
    rng = random.Random(313)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Standing broken column base drum
    base_drum = [Vector((-0.32, 0.10, -0.04)), Vector((-0.32, 0.10, 0.12)), Vector((-0.30, 0.10, 0.46))]
    tube(bm, uv, base_drum, [0.34, 0.28, 0.26], sides=8, u_range=(0.0, 0.60), v_range=(0.04, 0.88), rough=0.03, rng=rng)

    # Fallen fluted column drum lying diagonally on the ground
    fallen = [Vector((0.02, -0.14, 0.16)), Vector((0.58, -0.04, 0.14))]
    tube(bm, uv, fallen, [0.24, 0.23], sides=8, u_range=(0.0, 0.60), v_range=(0.08, 0.90), rough=0.03, rng=rng)

    # 6 trailing ivy cards draped over the standing and fallen drums
    for k in range(6):
        yaw = k / 6 * 2 * math.pi + 0.3
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        center = Vector((-0.34, 0.12, 0.58)) if k < 3 else Vector((0.35, -0.10, 0.38))
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

    # Carved arched stone milestone
    mile_pts = [Vector((-0.18, 0.0, -0.04)), Vector((-0.18, 0.0, 0.68)), Vector((-0.18, 0.0, 0.88))]
    tube(bm, uv, mile_pts, [0.22, 0.20, 0.10], sides=6, u_range=(0.02, 0.46), v_range=(0.04, 0.94), scale_y=0.62)

    # Wooden signpost mast & two directional fingerboards
    post_pts = [Vector((0.22, 0.06, -0.04)), Vector((0.24, 0.06, 1.48))]
    tube(bm, uv, post_pts, [0.065, 0.052], sides=5, u_range=(0.50, 0.74), v_range=(0.04, 0.94))
    arm1 = [Vector((0.18, 0.06, 1.32)), Vector((0.76, 0.06, 1.32))]
    tube(bm, uv, arm1, [0.075, 0.045], sides=4, u_range=(0.50, 0.74), v_range=(0.20, 0.85), scale_y=0.25)
    arm2 = [Vector((0.24, 0.02, 1.16)), Vector((0.24, -0.52, 1.16))]
    tube(bm, uv, arm2, [0.075, 0.045], sides=4, u_range=(0.50, 0.74), v_range=(0.20, 0.85), scale_y=0.25)

    # 6 basal wildflower tufts around the milestone foot
    for k in range(6):
        yaw = k / 6 * 2 * math.pi + 0.4
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        p0 = out * 0.24 + Vector((0, 0, 0.02))
        p1 = out * 0.40 + Vector((0, 0, 0.26))
        p2 = out * 0.56 + Vector((0, 0, 0.40))
        arched_card(bm, uv, p0, p1, p2, 0.16, 0.26, 0.22, side, u_range=(0.78, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('structure-roadside-milestone-01', bm, mat)


def build_structure_dwarven_cairn(mat):
    """Vondari / Stonehold banded basalt & bronze boundary marker pillar with glowing brazier cap."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Stepped hexagonal basalt & bronze pillar crowned with a flared ember brazier
    pts = [
        Vector((0, 0, -0.04)),
        Vector((0, 0, 0.28)),
        Vector((0, 0, 0.34)),
        Vector((0, 0, 1.02)),
        Vector((0, 0, 1.16)),
        Vector((0, 0, 1.32)),
    ]
    radii = [0.44, 0.38, 0.26, 0.22, 0.38, 0.32]
    tube(bm, uv, pts, radii, sides=6, u_range=(0.56, 0.98), v_range=(0.04, 0.94), cap_end=True)

    # Two flanked carved basalt ward stones at the base
    for side_x in (-1, 1):
        w_pts = [Vector((side_x * 0.48, 0.0, -0.02)), Vector((side_x * 0.52, 0.0, 0.56)), Vector((side_x * 0.52, 0.0, 0.72))]
        tube(bm, uv, w_pts, [0.18, 0.15, 0.03], sides=4, u_range=(0.04, 0.52), v_range=(0.08, 0.88))
    return finish_mesh('structure-dwarven-cairn-01', bm, mat)


def build_structure_bog_fetish_totem(mat):
    """Grukmar wetland lashed driftwood & skull fetish totem with glowing bog-gourd lantern."""
    rng = random.Random(316)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Tripod of crooked driftwood stakes lashed together
    for k in range(3):
        yaw = k * 2 * math.pi / 3 + 0.2
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        pts = [out * 0.38 + Vector((0, 0, -0.04)), out * 0.08 + Vector((0, 0, 0.92)), -out * 0.16 + Vector((0, 0, 1.56))]
        tube(bm, uv, pts, [0.065, 0.052, 0.032], sides=5, u_range=(0.04, 0.46), v_range=(0.04, 0.92), rough=0.06, rng=rng)

    # Lashed crossbar
    cross = [Vector((-0.44, 0.0, 1.18)), Vector((0.48, 0.0, 1.24))]
    tube(bm, uv, cross, [0.045, 0.040], sides=4, u_range=(0.04, 0.46), v_range=(0.35, 0.65))

    # Horned beast skull mounted at the central lashing
    skull = [Vector((0.0, -0.08, 0.82)), Vector((0.0, -0.22, 0.96)), Vector((0.0, -0.34, 0.84))]
    tube(bm, uv, skull, [0.12, 0.15, 0.06], sides=5, u_range=(0.54, 0.96), v_range=(0.06, 0.52))

    # Hanging bioluminescent bog-gourd lantern on +X arm
    gourd = [Vector((0.38, 0.0, 1.18)), Vector((0.38, 0.0, 0.96)), Vector((0.38, 0.0, 0.78))]
    tube(bm, uv, gourd, [0.02, 0.12, 0.04], sides=6, u_range=(0.54, 0.96), v_range=(0.62, 0.96))
    return finish_mesh('structure-bog-fetish-totem-01', bm, mat)


def build_structure_rainforest_idol(mat):
    """Ancient moss-covered carved jungle monolith / stepped stone idol entwined with vines."""
    rng = random.Random(317)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Stepped carved jungle monolith with brow ridge & crown tier
    idol_pts = [
        Vector((0, 0, -0.04)),
        Vector((0, 0, 0.36)),
        Vector((0, 0, 0.88)),
        Vector((0, 0, 1.18)),
        Vector((0, 0, 1.48)),
    ]
    idol_radii = [0.46, 0.36, 0.34, 0.40, 0.28]
    tube(bm, uv, idol_pts, idol_radii, sides=6, u_range=(0.02, 0.56), v_range=(0.04, 0.96), scale_y=0.78, rough=0.05, rng=rng)

    # 8 jungle fern & monstera vine cards embracing the monolith base and shoulders
    for k in range(8):
        yaw = k / 8 * 2 * math.pi + 0.25
        out = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0))
        z0 = 0.08 if k < 5 else 0.72
        p0 = out * 0.26 + Vector((0, 0, z0))
        p1 = out * 0.52 + Vector((0, 0, z0 + 0.28))
        p2 = out * 0.74 + Vector((0, 0, z0 + 0.14))
        arched_card(bm, uv, p0, p1, p2, 0.18, 0.34, 0.24, side, u_range=(0.60, 1.0), v_range=(0.02, 0.98))
    return finish_mesh('structure-rainforest-idol-01', bm, mat)


# ---------------------------------------------------------------------------
# 5. AUTHORED BIOME SHRUBS (`bushVariants`, distinct multi-stem woody forms)
# ---------------------------------------------------------------------------

SHRUB_MAX_TRIANGLES = 520


def _add_branch_spray_pair(bm, uv, attach_pt, branch_dir, length, width, arch=0.14, roll_bias=0.0):
    """Attach two complementary 3D V-cupped twig sprays directly onto a branch node."""
    fwd = branch_dir.normalized()
    leaf_spray_fan(
        bm, uv, attach_pt, fwd, length, width,
        u_range=(0.30, 1.0), v_range=(0.02, 0.98),
        roll=roll_bias + 0.18, arch=arch, cup=0.18, tip_scale=0.38,
    )
    # Crossed/splayed secondary leaf fan at a distinct pitch/roll angle so silhouette reads from every view
    up = Vector((0.0, 0.0, 1.0)) if abs(fwd.z) < 0.90 else Vector((1.0, 0.0, 0.0))
    side = fwd.cross(up).normalized()
    fwd2 = (fwd * 0.86 + up * 0.32 + side * 0.24).normalized()
    leaf_spray_fan(
        bm, uv, attach_pt, fwd2, length * 0.88, width * 0.92,
        u_range=(0.30, 1.0), v_range=(0.02, 0.98),
        roll=roll_bias - 0.85, arch=arch * 0.7, cup=0.15, tip_scale=0.36,
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
        p0 = out * 0.07 + Vector((0.0, 0.0, -0.02))
        p1 = out * (splay * 0.46) + side * (bend * 0.5) + Vector((0.0, 0.0, h * 0.50))
        p2 = out * (splay * 0.92) + side * bend + Vector((0.0, 0.0, h))
        tube(bm, uv, [p0, p1, p2], [0.042, 0.028, 0.012], sides=4, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.05, rng=rng, cap_end=False)

        # Stem-hugging leaflet cuffs along mid cane + flowering crimson spike at tip
        mid_pt = p0.lerp(p1, 0.75)
        cane_dir = (p1 - p0).normalized()
        leaf_spray_fan(bm, uv, mid_pt, (cane_dir + side * 0.35).normalized(), 0.44, 0.38, u_range=(0.30, 1.0), v_range=(0.02, 0.74), roll=0.4 if idx % 2 else -0.4, arch=0.10)
        tip_dir = (p2 - p1 + Vector((0.0, 0.0, 0.18))).normalized()
        _add_branch_spray_pair(bm, uv, p1.lerp(p2, 0.65), tip_dir, 0.52, 0.40, arch=0.14, roll_bias=idx * 0.7)
    return finish_mesh('bush-arid-ocotillo-01', bm, mat, max_triangles=SHRUB_MAX_TRIANGLES)


def build_bush_savanna_thorn(mat):
    """Crooked multi-stemmed flat-topped Savanna thorn scrub (Vachellia/Acacia shrub) with open basal branches."""
    rng = random.Random(322)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    stems = (
        # (yaw, len_xy, z_fork, z_top, fork_spread)
        (0.15, 0.84, 0.44, 0.96, 0.38),
        (1.42, 0.92, 0.54, 1.12, 0.42),
        (2.70, 0.76, 0.38, 0.82, 0.35),
        (3.92, 0.88, 0.48, 1.02, 0.40),
        (5.15, 0.70, 0.34, 0.74, 0.32),
    )
    for idx, (yaw, r_xy, z_f, z_t, f_sp) in enumerate(stems):
        out = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        p0 = out * 0.08 + Vector((0.0, 0.0, -0.02))
        p1 = out * (r_xy * 0.42) + side * rng.uniform(-0.10, 0.10) + Vector((0.0, 0.0, z_f))
        p2 = out * r_xy + side * rng.uniform(-0.12, 0.12) + Vector((0.0, 0.0, z_t))
        tube(bm, uv, [p0, p1, p2], [0.052, 0.032, 0.015], sides=4, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.06, rng=rng, cap_end=False)

        # Horizontal flat-topped lateral branch forks creating tiered table acacia canopy
        s_sign = 1.0 if idx % 2 == 0 else -1.0
        fork_end = p1 + out * (f_sp * 0.80) + side * (s_sign * f_sp) + Vector((0.0, 0.0, z_t * 0.38))
        tube(bm, uv, [p1, fork_end], [0.025, 0.012], sides=3, u_range=(0.02, 0.27), v_range=(0.10, 0.90), cap_end=False)
        fork2 = p1.lerp(p2, 0.45) + side * (-s_sign * f_sp * 0.72) + out * 0.14 + Vector((0.0, 0.0, 0.16))
        tube(bm, uv, [p1.lerp(p2, 0.45), fork2], [0.020, 0.010], sides=3, u_range=(0.02, 0.27), v_range=(0.10, 0.90), cap_end=False)

        # Flat horizontal table-like acacia foliage pads perched at branch ends
        flat_dir = Vector((p2.x - p1.x, p2.y - p1.y, 0.14)).normalized()
        _add_branch_spray_pair(bm, uv, p2 - flat_dir * 0.14, flat_dir, 0.86, 0.92, arch=0.04, roll_bias=0.14)
        f_dir = Vector((fork_end.x - p1.x, fork_end.y - p1.y, 0.12)).normalized()
        _add_branch_spray_pair(bm, uv, fork_end - f_dir * 0.10, f_dir, 0.76, 0.82, arch=0.04, roll_bias=-0.18)
        f2_dir = Vector((fork2.x - p1.x, fork2.y - p1.y, 0.10)).normalized()
        _add_branch_spray_pair(bm, uv, fork2 - f2_dir * 0.08, f2_dir, 0.68, 0.74, arch=0.03, roll_bias=0.22)
    return finish_mesh('bush-savanna-thorn-01', bm, mat, max_triangles=SHRUB_MAX_TRIANGLES)


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
        p0 = out * 0.07 + Vector((0.0, 0.0, -0.02))
        p1 = out * (r_xy * 0.48) + side * rng.uniform(-0.08, 0.08) + Vector((0.0, 0.0, z_mid))
        p2 = out * r_xy + Vector((0.0, 0.0, z_top))
        tube(bm, uv, [p0, p1, p2], [0.050, 0.032, 0.015], sides=4, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.05, rng=rng, cap_end=False)

        fork_side = 1.0 if idx % 2 == 0 else -1.0
        twig_end = p1 + out * 0.26 + side * (fork_side * 0.30) + Vector((0.0, 0.0, 0.16 if idx % 3 else -0.04))
        tube(bm, uv, [p1, twig_end], [0.024, 0.012], sides=3, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        _add_branch_spray_pair(bm, uv, p2 - Vector((0, 0, 0.06)), (p2 - p1 + Vector((0, 0, 0.22))).normalized(), 0.58, 0.60, arch=0.14, roll_bias=idx * 0.4)
        _add_branch_spray_pair(bm, uv, twig_end - Vector((0, 0, 0.04)), (twig_end - p1).normalized(), 0.52, 0.54, arch=0.08, roll_bias=-0.5)
    return finish_mesh('bush-meadow-gorse-01', bm, mat, max_triangles=SHRUB_MAX_TRIANGLES)


def build_bush_boreal_juniper(mat):
    """Low wind-swept prostrate Boreal Krummholz Juniper with creeping twisted boughs and upturned conifer plumes."""
    rng = random.Random(324)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')

    # Offset multi-bough rootstock sprawling wider (+X/+Y windward/leeward asymmetry) than tall
    root_origin = Vector((-0.18, 0.06, -0.02))
    boughs = (
        (0.12, 0.96, 0.20, 0.58),
        (0.95, 0.84, 0.24, 0.68),
        (2.10, 0.72, 0.16, 0.42),
        (3.45, 0.78, 0.14, 0.36),
        (4.85, 0.88, 0.22, 0.54),
        (5.68, 0.68, 0.15, 0.40),
    )
    for idx, (yaw, r_xy, z_elbow, z_tip) in enumerate(boughs):
        out = Vector((math.cos(yaw) + 0.22, math.sin(yaw), 0.0)).normalized()
        side = Vector((-out.y, out.x, 0.0))
        p0 = root_origin + out * 0.06
        p1 = root_origin + out * (r_xy * 0.52) + side * rng.uniform(-0.12, 0.12) + Vector((0.0, 0.0, z_elbow))
        p2 = root_origin + out * r_xy + Vector((0.0, 0.0, z_tip))
        tube(bm, uv, [p0, p1, p2], [0.056, 0.036, 0.016], sides=4, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.06, rng=rng, cap_end=False)

        fork = p1 + out * 0.28 + side * (0.32 if idx % 2 == 0 else -0.32) + Vector((0.0, 0.0, 0.18))
        tube(bm, uv, [p1, fork], [0.026, 0.013], sides=3, u_range=(0.02, 0.27), v_range=(0.10, 0.90), cap_end=False)

        # Mid-bough and terminal conifer needle plumes sweeping outward and upward
        mid_dir = Vector((out.x * 0.92 + side.x * (-0.28 if idx % 2 == 0 else 0.28), out.y * 0.92 + side.y * (-0.28 if idx % 2 == 0 else 0.28), 0.34)).normalized()
        _add_branch_spray_pair(bm, uv, p1.lerp(p2, 0.28), mid_dir, 0.56, 0.60, arch=0.14, roll_bias=-0.22)
        tip_dir = Vector((out.x * 0.85, out.y * 0.85, 0.48)).normalized()
        _add_branch_spray_pair(bm, uv, p2 - out * 0.12, tip_dir, 0.64, 0.68, arch=0.18, roll_bias=0.25)
        f_dir = Vector((fork.x - p1.x, fork.y - p1.y, 0.36)).normalized()
        _add_branch_spray_pair(bm, uv, fork - f_dir * 0.10, f_dir, 0.56, 0.60, arch=0.15, roll_bias=-0.35)
    return finish_mesh('bush-boreal-juniper-01', bm, mat, max_triangles=SHRUB_MAX_TRIANGLES)


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
        p0 = out * 0.07 + Vector((0.0, 0.0, -0.02))
        p1 = out * (r_xy * 0.42) + Vector((0.0, 0.0, z_f))
        p2 = out * r_xy + Vector((0.0, 0.0, z_t))
        tube(bm, uv, [p0, p1, p2], [0.048, 0.030, 0.014], sides=4, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.04, rng=rng, cap_end=False)

        fork_pt = p1.lerp(p2, 0.25)
        twig_end = fork_pt + out * 0.30 + side * (0.34 if idx % 2 == 0 else -0.34) + Vector((0.0, 0.0, 0.14))
        tube(bm, uv, [fork_pt, twig_end], [0.024, 0.012], sides=3, u_range=(0.02, 0.27), v_range=(0.10, 0.90), cap_end=False)

        _add_branch_spray_pair(bm, uv, p2 - Vector((0, 0, 0.06)), (p2 - p1 + Vector((0, 0, 0.15))).normalized(), 0.62, 0.64, arch=-0.06, roll_bias=idx * 0.5)
        _add_branch_spray_pair(bm, uv, twig_end - Vector((0, 0, 0.04)), (twig_end - fork_pt).normalized(), 0.54, 0.56, arch=-0.08, roll_bias=-0.4)
    return finish_mesh('bush-tropical-hibiscus-01', bm, mat, max_triangles=SHRUB_MAX_TRIANGLES)


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
        p0 = out * 0.08 + Vector((0.0, 0.0, -0.02))
        p1 = out * (r_xy * 0.46) + side * rng.uniform(-0.14, 0.14) + Vector((0.0, 0.0, z_f))
        p2 = out * r_xy + side * rng.uniform(-0.10, 0.10) + Vector((0.0, 0.0, z_t))
        tube(bm, uv, [p0, p1, p2], [0.050, 0.032, 0.015], sides=4, u_range=(0.02, 0.27), v_range=(0.04, 0.94), rough=0.06, rng=rng, cap_end=False)

        twig_end = p1 + out * 0.28 + side * (-0.34 if idx % 2 else 0.34) + Vector((0.0, 0.0, 0.12))
        tube(bm, uv, [p1, twig_end], [0.024, 0.012], sides=3, u_range=(0.02, 0.27), v_range=(0.12, 0.90), cap_end=False)

        _add_branch_spray_pair(bm, uv, p2 - Vector((0, 0, 0.05)), (p2 - p1 + Vector((0, 0, 0.18))).normalized(), 0.58, 0.58, arch=0.10, roll_bias=idx * 0.45)
        _add_branch_spray_pair(bm, uv, twig_end - Vector((0, 0, 0.04)), (twig_end - p1).normalized(), 0.50, 0.52, arch=0.08, roll_bias=-0.4)
    return finish_mesh('bush-swamp-buttonbush-01', bm, mat, max_triangles=SHRUB_MAX_TRIANGLES)
