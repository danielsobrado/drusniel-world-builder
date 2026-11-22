"""Authored mountain gate, vault, cliff and ventilation recipes."""
import math
import random

from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder
from .stonehold_parts import (
    STONE_BEVEL,
    cargo_cluster,
    cliff_portal_alcove,
    cliff_scaffolding_crane,
    crag_block,
    dwarven_brazier,
    dwarven_stair_flight,
    dwarven_terrace_deck,
    jagged_cliff_tier,
    mini_pine,
    moss_tuft,
    rock_spire,
    summit_beacon_fort,
    summit_citadel_hall,
    viaduct_bridge,
    vondari_cliff_banner,
    waterfall_cascade,
    work_tent,
)
from .stonehold_formation_base import _talus_skirt
from .stonehold_sculptures import (
    chamfered_octagonal_portal,
    gate_guardian_statue,
    half_open_fortress_doors,
    king_keystone_mask,
)


def _build_vent_stack_at(b, cx, cy, z0, scale=1.0, seed=900):
    """Helper to embed a Vondari Dwarven mine ventilation stack on ground or mountain peaks."""
    s = scale
    crag_block(b, cx, cy, z0 - 0.15 * s, z0 + 0.85 * s, 0.92 * s, 0.92 * s,
               seed=seed, sides=8, mat='stone_granite', cap_mat='stone_basalt',
               batter=0.92, chamfer=0.03 * s)
    b.box((cx - 0.64 * s, cy - 0.64 * s, z0 + 0.80 * s),
          (cx + 0.64 * s, cy + 0.64 * s, z0 + 2.85 * s), 'stone_granite', skip=('-z',), bevel=0)
    for bz in (1.35 * s, 2.05 * s, 2.82 * s):
        b.box((cx - 0.72 * s, cy - 0.72 * s, z0 + bz),
              (cx + 0.72 * s, cy + 0.72 * s, z0 + bz + 0.16 * s), 'stone_basalt', bevel=STONE_BEVEL)
    # Glowing forge-draft louver vents on all 4 sides
    b.box((cx - 0.48 * s, cy - 0.66 * s, z0 + 2.22 * s),
          (cx + 0.48 * s, cy + 0.66 * s, z0 + 2.76 * s), 'firelight', bevel=0)
    b.box((cx - 0.66 * s, cy - 0.48 * s, z0 + 2.22 * s),
          (cx + 0.66 * s, cy + 0.48 * s, z0 + 2.76 * s), 'firelight', bevel=0)
    if detailed():
        b.box((cx - 0.74 * s, cy - 0.74 * s, z0 + 2.08 * s),
              (cx + 0.74 * s, cy + 0.74 * s, z0 + 2.16 * s), 'hold_bronze', bevel=0)
        for lz in (2.32 * s, 2.50 * s, 2.68 * s):
            b.box((cx - 0.54 * s, cy - 0.70 * s, z0 + lz),
                  (cx + 0.54 * s, cy + 0.70 * s, z0 + lz + 0.05 * s), 'iron', bevel=0)
            b.box((cx - 0.70 * s, cy - 0.54 * s, z0 + lz),
                  (cx + 0.70 * s, cy + 0.54 * s, z0 + lz + 0.05 * s), 'iron', bevel=0)
        b.box((cx - 0.28 * s, cy - 0.68 * s, z0 + 1.58 * s),
              (cx + 0.28 * s, cy - 0.62 * s, z0 + 1.92 * s), 'hold_bronze', bevel=0)
        for lx in (-0.18 * s, 0.18 * s):
            b.box((cx + lx - 0.025 * s, cy - 0.74 * s, z0 + 0.85 * s),
                  (cx + lx + 0.025 * s, cy - 0.64 * s, z0 + 2.80 * s), 'iron', bevel=0)
        for rz in (1.05 * s, 1.30 * s, 1.55 * s, 1.80 * s, 2.05 * s):
            b.box((cx - 0.18 * s, cy - 0.75 * s, z0 + rz),
                  (cx + 0.18 * s, cy - 0.70 * s, z0 + rz + 0.035 * s), 'iron', bevel=0)
    # Twin basalt exhaust flues at top
    for fx in (-0.28 * s, 0.28 * s):
        b.box((cx + fx - 0.20 * s, cy - 0.22 * s, z0 + 2.98 * s),
              (cx + fx + 0.20 * s, cy + 0.22 * s, z0 + 3.48 * s), 'stone_basalt', bevel=STONE_BEVEL)
        b.box((cx + fx - 0.13 * s, cy - 0.15 * s, z0 + 3.42 * s),
              (cx + fx + 0.13 * s, cy + 0.15 * s, z0 + 3.52 * s), 'glow', bevel=0)


def mine_vent_stack():
    """Tall rugged Vondari Dwarven stone & basalt mine exhaust shaft with louver shutters,
    glowing forge-draft interior, gold rune bands, iron bracing, and maintenance ladder."""
    b = MeshBuilder()
    dwarven_terrace_deck(b, 0.0, 0.0, 0.0, 0.32, 1.28, 1.22, seed=901, sides=8, ribs=16)
    _build_vent_stack_at(b, 0.0, 0.0, 0.28, scale=1.0, seed=902)
    _talus_skirt(b, 0.0, 0.0, 0.0, 1.22, 1.16, 8, 0.14, 0.24, seed=905)
    return b


def mountain_cliff_wall():
    """8m-wide x 17.5m-tall stratified mountain crag cliff wall (`rock`) with carved Vondari
    Dwarven basalt & gold buttresses, hanging banners, and glowing rock-cut forge embrasures
    on BOTH exterior (-Y) and interior cavern (+Y) faces."""
    b = MeshBuilder()
    for idx, (cx, cy, z0, z1, rx, ry) in enumerate((
        (-2.8, 0.0, -0.4, 5.8, 1.85, 1.32),
        (0.0, 0.0, -0.4, 6.0, 1.95, 1.36),
        (2.8, 0.0, -0.4, 5.8, 1.85, 1.32),
        (-2.7, 0.0, 5.4, 11.2, 1.82, 1.30),
        (0.0, 0.0, 5.6, 11.5, 1.92, 1.34),
        (2.7, 0.0, 5.4, 11.2, 1.82, 1.30),
    )):
        jagged_cliff_tier(b, cx, cy, z0, z1, rx, ry, seed=910 + idx, ribs=16)

    # Carved Vondari Dwarven basalt & gold buttress piers & cornice bands on BOTH -Y and +Y faces
    for px in (-3.6, -1.2, 1.2, 3.6):
        b.box((px - 0.32, -1.42, -0.2), (px + 0.32, 1.42, 9.6), 'stone_basalt', skip=('-z',), bevel=0)
        b.box((px - 0.42, -1.52, -0.2), (px + 0.42, 1.52, 1.5), 'stone_basalt', skip=('-z',), bevel=0)
        if detailed():
            b.box((px - 0.10, -1.46, 1.6), (px + 0.10, 1.46, 8.8), 'hold_bronze', bevel=0)
    for cz in (4.6, 9.0):
        b.box((-4.15, -1.48, cz), (4.15, 1.48, cz + 0.40), 'stone_basalt', bevel=STONE_BEVEL)
        if detailed():
            b.box((-4.15, -1.52, cz + 0.12), (4.15, 1.52, cz + 0.24), 'hold_bronze', bevel=0)

    # Rock-cut subterranean hall embrasures with recessed shadowed reveals & forged grilles
    for wx in (-2.4, 0.0, 2.4):
        for wz in (1.8, 5.8):
            b.box((wx - 0.52, -1.42, wz), (wx + 0.52, 1.42, wz + 1.90), 'stone_granite', bevel=STONE_BEVEL)
            b.box((wx - 0.64, -1.54, wz + 1.78), (wx + 0.64, 1.54, wz + 2.18), 'stone_basalt', bevel=STONE_BEVEL)
            for side in (-1, 1):
                y0, y1 = (side * 1.44, side * 1.24) if side < 0 else (side * 1.24, side * 1.44)
                b.box((wx - 0.34, y0, wz + 0.16), (wx + 0.34, y1, wz + 1.72), 'shadow', bevel=0)
                ym0, ym1 = (side * 1.36, side * 1.26) if side < 0 else (side * 1.26, side * 1.36)
                b.box((wx - 0.22, ym0, wz + 0.28), (wx + 0.22, ym1, wz + 1.42), 'firelight', bevel=0)
                if detailed():
                    yi0, yi1 = (side * 1.47, side * 1.40) if side < 0 else (side * 1.40, side * 1.47)
                    b.box((wx - 0.03, yi0, wz + 0.16), (wx + 0.03, yi1, wz + 1.72), 'iron', bevel=0)
                    b.box((wx - 0.34, yi0, wz + 0.92), (wx + 0.34, yi1, wz + 0.98), 'iron', bevel=0)

    # Continuous dark-rock upper mountain crag crown & spires (Z = 10.6..17.6m)
    for idx, (cx, cy, z0, z1, rx, ry) in enumerate((
        (-2.7, 0.1, 10.6, 15.2, 1.82, 1.42),
        (0.0, 0.15, 10.8, 15.8, 1.95, 1.48),
        (2.7, 0.1, 10.6, 15.0, 1.82, 1.42),
    )):
        jagged_cliff_tier(b, cx, cy, z0, z1, rx, ry, seed=920 + idx, ribs=14)
    rock_spire(b, (-2.0, 0.2, 13.8), (-2.3, 0.0, 17.4), 1.05, 0.90,
               seed=925, mat='rock_cliff', cap_mat='rock_cliff', curve=(-0.15, -0.05, 0.2), sides=6, segs=4)
    rock_spire(b, (1.8, 0.2, 13.6), (2.1, 0.0, 17.8), 1.08, 0.92,
               seed=926, mat='rock_cliff', cap_mat='rock_cliff', curve=(0.15, -0.05, 0.2), sides=6, segs=4)
    return b


def mountain_gate_massif():
    """14m-wide x 20.5m-tall monumental Vondari Dwarven Fortress Mountain Gate carved directly
    into a towering dark-rock mountain massif: triple-stepped chamfered octagonal portal,
    stern Dwarf-King keystone mask, colossal flanking Gate Guardian warrior statues, half-open
    bronze fortress doors spilling forge firelight, crimson Vondari banners, stepped approach
    apron with braziers, and jagged alpine peak crown (Refs 4, 5, 6)."""
    b = MeshBuilder()
    for side, s_base in ((-1, 930), (1, 940)):
        jagged_cliff_tier(b, side * 5.0, 0.6, -0.4, 7.6, 2.45, 1.95, seed=s_base, ribs=18)
        jagged_cliff_tier(b, side * 4.8, 0.7, 7.2, 14.0, 2.35, 1.85, seed=s_base + 1, ribs=16)
        # Carved granite & basalt bastion wing flanking the guardian pedestals
        b.box((side * 4.65 - 1.05, -1.25, -0.2), (side * 4.65 + 1.05, 2.15, 7.6),
              'stone_granite', skip=('-z',), bevel=STONE_BEVEL)
        b.box((side * 5.45 - 0.36, -1.45, -0.2), (side * 5.45 + 0.36, 2.25, 8.2),
              'stone_basalt', skip=('-z',), bevel=STONE_BEVEL)
        for bz in (1.0, 4.0, 7.2):
            b.box((side * 4.65 - 1.18, -1.38, bz), (side * 4.65 + 1.18, 2.24, bz + 0.34), 'stone_basalt', bevel=STONE_BEVEL)
            if detailed():
                b.box((side * 4.65 - 1.20, -1.42, bz + 0.10), (side * 4.65 + 1.20, 2.26, bz + 0.22), 'hold_bronze', bevel=0)
        # Colossal armored Gate Guardian warrior statue flanking the portal (Refs 4, 5, 6!)
        gate_guardian_statue(b, side * 4.25, -1.65, 0.0, scale=1.08, handedness=side)
        # Crimson & gold Vondari banner framing the portal jamb + threshold brazier
        vondari_cliff_banner(b, side * 2.65, -1.85, 5.45, yaw=0.0, height=2.55, width=0.78)
        dwarven_brazier(b, side * 2.85, -2.55, 0.32, scale=3.6, tall=False)

    # Monumental chamfered octagonal Dwarven portal, Dwarf-King keystone & half-open forge doors
    chamfered_octagonal_portal(b, 0.0, 0.35, 0.0, opening_w=4.4, opening_h=6.3, depth=3.8, frame_w=1.35)
    king_keystone_mask(b, 0.0, -1.78, 7.55, scale=1.08)
    half_open_fortress_doors(b, 0.0, -0.85, 0.0, width=4.2, height=6.0)

    # Broad stepped basalt & flagstone approach landing in front of the gate
    b.box((-3.8, -2.95, -0.2), (3.8, -1.15, 0.32), 'stone_basalt', skip=('-z',), bevel=STONE_BEVEL)
    b.box((-3.4, -3.45, -0.2), (3.4, -2.85, 0.16), 'stone_dressed', skip=('-z',), bevel=STONE_BEVEL)

    # Towering central dark-rock mountain peak above the gate (Z = 8.0..20.6)
    jagged_cliff_tier(b, 0.0, 0.7, 8.0, 14.8, 4.15, 2.05, seed=950, ribs=18)
    jagged_cliff_tier(b, -3.9, 0.8, 11.4, 17.2, 2.75, 1.90, seed=951, ribs=14)
    jagged_cliff_tier(b, 3.9, 0.8, 11.4, 17.0, 2.75, 1.90, seed=952, ribs=14)
    jagged_cliff_tier(b, 0.0, 0.8, 14.0, 19.2, 2.60, 1.80, seed=953, ribs=14)
    rock_spire(b, (-3.2, 0.8, 15.0), (-3.9, 0.4, 20.4), 1.24, 1.00,
               seed=954, mat='rock_cliff', cap_mat='rock_cliff', curve=(-0.22, -0.08, 0.25), sides=6, segs=5)
    rock_spire(b, (3.2, 0.8, 15.0), (3.9, 0.4, 20.2), 1.24, 1.00,
               seed=955, mat='rock_cliff', cap_mat='rock_cliff', curve=(0.22, -0.08, 0.25), sides=6, segs=5)
    _build_vent_stack_at(b, 0.0, 0.8, 18.6, scale=0.92, seed=956)
    return b


def mountain_cavern_vault():
    """12m x 10m Hollow Mountain Peak & Subterranean Cavern Ceiling module with vaulted
    ribbed cavern ceiling & bronze chandeliers underneath and jagged dark-rock mountain
    crag peaks & smoking vent stacks above."""
    b = MeshBuilder()
    for sx in (-5.5, 5.5):
        for sy in (-4.5, 4.5):
            b.box((sx - 0.42, sy - 0.42, 7.2), (sx + 0.42, sy + 0.42, 8.2), 'stone_basalt', bevel=STONE_BEVEL)
            b.box((sx - 0.58, sy - 0.58, 8.1), (sx + 0.58, sy + 0.58, 9.4), 'stone_granite', bevel=STONE_BEVEL)
            b.box((sx - 0.78, sy - 0.78, 9.3), (sx + 0.78, sy + 0.78, 11.0), 'stone_basalt', bevel=STONE_BEVEL)

    b.box((-6.35, -5.35, 11.0), (6.35, 5.35, 12.8), 'rock_cliff', bevel=0)
    b.box((-6.35, -5.35, 9.6), (-4.2, 5.35, 11.1), 'stone_granite', bevel=STONE_BEVEL)
    b.box((4.2, -5.35, 9.6), (6.35, 5.35, 11.1), 'stone_granite', bevel=STONE_BEVEL)
    b.box((-4.2, -5.35, 9.8), (4.2, -3.6, 11.1), 'stone_granite', bevel=STONE_BEVEL)
    b.box((-4.2, 3.6, 9.8), (4.2, 5.35, 11.1), 'stone_granite', bevel=STONE_BEVEL)

    for ry in (-4.4, 0.0, 4.4):
        b.box((-5.9, ry - 0.38, 9.9), (5.9, ry + 0.38, 11.15), 'stone_basalt', bevel=STONE_BEVEL)
        b.box((-3.8, ry - 0.42, 10.3), (3.8, ry + 0.42, 11.25), 'stone_basalt', bevel=STONE_BEVEL)
    for rx in (-5.4, 0.0, 5.4):
        b.box((rx - 0.38, -4.9, 9.9), (rx + 0.38, 4.9, 11.15), 'stone_basalt', bevel=STONE_BEVEL)

    for cx, cz_base, sc in ((0.0, 6.9, 1.0), (-3.2, 7.6, 0.72), (3.2, 7.6, 0.72)):
        b.box((cx - 0.55 * sc, -0.55 * sc, 9.85), (cx + 0.55 * sc, 0.55 * sc, 10.65), 'hold_bronze', bevel=0)
        b.box((cx - 0.10 * sc, -0.10 * sc, cz_base + 0.55 * sc), (cx + 0.10 * sc, 0.10 * sc, 9.90), 'iron', bevel=0)
        b.box((cx - 0.88 * sc, -0.88 * sc, cz_base + 0.25 * sc), (cx + 0.88 * sc, 0.88 * sc, cz_base + 0.62 * sc), 'hold_bronze', bevel=0)
        b.box((cx - 0.70 * sc, -0.70 * sc, cz_base + 0.05 * sc), (cx + 0.70 * sc, 0.70 * sc, cz_base + 0.32 * sc), 'firelight', bevel=0)
        b.box((cx - 0.50 * sc, -0.50 * sc, cz_base - 0.08 * sc), (cx + 0.50 * sc, 0.50 * sc, cz_base + 0.12 * sc), 'glow', bevel=0)

    # Towering exterior dark-rock mountain peak massif above the cavern roof
    jagged_cliff_tier(b, 0.0, 0.0, 12.2, 15.2, 6.0, 5.0, seed=960, ribs=20)
    jagged_cliff_tier(b, -0.4, 0.3, 14.8, 17.8, 4.5, 3.7, seed=961, ribs=16)
    jagged_cliff_tier(b, 0.2, -0.2, 17.4, 20.0, 2.7, 2.2, seed=962, ribs=12)
    rock_spire(b, (-2.6, -1.2, 14.8), (-3.2, -1.6, 20.8), 1.35, 1.15,
               seed=963, mat='rock_cliff', cap_mat='rock_cliff', curve=(-0.20, -0.12, 0.25), sides=6, segs=4)
    rock_spire(b, (2.4, 1.4, 14.8), (3.0, 1.8, 21.4), 1.40, 1.18,
               seed=964, mat='rock_cliff', cap_mat='rock_cliff', curve=(0.20, 0.12, 0.25), sides=6, segs=4)
    _build_vent_stack_at(b, -0.6, 0.8, 19.6, scale=0.9, seed=965)
    return b


