"""Monumental carved Dwarven sculptures and chamfered portal geometry for the Stonehold TownKit.

All pieces use beveled Dwarven-Cubist planar stonework so silhouettes read crisply at
overworld draw distance while staying well inside the 48k LOD0 / 12k LOD1 module budgets.
"""
import math

from mathutils import Vector

from ..config import detailed
from .stonehold_fire import flame
from .stonehold_rock import STONE_BEVEL


def chamfered_octagonal_portal(b, cx, cy, z0, opening_w=4.4, opening_h=6.2, depth=3.8, frame_w=1.35):
    """Triple-stepped 45-degree chamfered octagonal Dwarven portal (Refs 4, 5, 6), facing -Y."""
    hw = opening_w * 0.5
    chamfer = min(1.35, opening_w * 0.28)
    shoulder_z = z0 + opening_h - chamfer
    top_z = z0 + opening_h
    y_front = cy - depth * 0.5
    y_back = cy + depth * 0.5

    # Side basalt & granite jamb piers with stepped battered footings.
    for side in (-1, 1):
        px = cx + side * (hw + frame_w * 0.5)
        b.box((px - frame_w * 0.55, y_front - 0.18, z0 - 0.2),
              (px + frame_w * 0.55, y_back + 0.18, z0 + 1.05), 'stone_basalt', skip=('-z',), bevel=STONE_BEVEL)
        b.box((px - frame_w * 0.48, y_front - 0.10, z0 + 1.0),
              (px + frame_w * 0.48, y_back + 0.10, shoulder_z + 0.35), 'stone_granite', bevel=STONE_BEVEL)
        # Inner proud basalt reveal jamb.
        jx = cx + side * (hw + 0.24)
        b.box((jx - 0.24, y_front - 0.28, z0 - 0.1),
              (jx + 0.24, y_back + 0.28, shoulder_z + 0.15), 'stone_basalt', bevel=STONE_BEVEL)
        # 45-degree chamfered shoulder haunch block rising to the crown lintel.
        a = Vector((cx + side * (hw + 0.08), cy, shoulder_z - 0.08))
        c = Vector((cx + side * (hw - chamfer + 0.08), cy, top_z + 0.12))
        b.beam((a.x, a.y, a.z), (c.x, c.y, c.z), (0, 1, 0), (-depth * 0.54, depth * 0.54),
               frame_w * 0.92, 'stone_basalt', bevel=STONE_BEVEL)
        if detailed():
            b.box((px - 0.12, y_front - 0.16, z0 + 1.15),
                  (px + 0.12, y_front - 0.06, shoulder_z - 0.15), 'hold_bronze', bevel=0)

    # Massive monolithic crown lintel + overhanging stepped chevron entablature.
    outer_hw = hw + frame_w + 0.45
    b.box((cx - outer_hw, y_front - 0.26, top_z - 0.10),
          (cx + outer_hw, y_back + 0.26, top_z + 1.25), 'stone_basalt', bevel=STONE_BEVEL)
    b.box((cx - outer_hw - 0.42, y_front - 0.42, top_z + 1.20),
          (cx + outer_hw + 0.42, y_back + 0.36, top_z + 1.85), 'stone_granite', bevel=STONE_BEVEL)
    if detailed():
        # Recessed weathered bronze runic frieze across crown (metallic relief, zero neon glow).
        b.box((cx - outer_hw + 0.45, y_front - 0.32, top_z + 0.32),
              (cx + outer_hw - 0.45, y_front - 0.22, top_z + 0.82), 'hold_bronze', bevel=0)
        for rx in (-2.4, -1.6, -0.8, 0.8, 1.6, 2.4):
            b.box((cx + rx - 0.16, y_front - 0.36, top_z + 0.40),
                  (cx + rx + 0.16, y_front - 0.28, top_z + 0.74), 'stone_basalt', bevel=0)


def king_keystone_mask(b, cx, cy, z0, scale=1.0):
    """Stern sculpted Dwarf-King head & stepped geometric braided beard crowning the gate (Ref 5)."""
    s = scale
    # Back stepped keystone slab.
    b.box((cx - 0.88 * s, cy - 0.42 * s, z0 - 0.65 * s),
          (cx + 0.88 * s, cy + 0.35 * s, z0 + 1.25 * s), 'stone_granite', bevel=STONE_BEVEL)
    # Angular helmeted brow, crown diadem, nose bridge, and cheekbones.
    b.box((cx - 0.78 * s, cy - 0.65 * s, z0 + 0.42 * s),
          (cx + 0.78 * s, cy - 0.20 * s, z0 + 1.08 * s), 'stone_basalt', bevel=STONE_BEVEL)
    b.box((cx - 0.86 * s, cy - 0.72 * s, z0 + 0.82 * s),
          (cx + 0.86 * s, cy - 0.24 * s, z0 + 1.02 * s), 'hold_bronze', bevel=0)
    b.box((cx - 0.18 * s, cy - 0.80 * s, z0 + 0.08 * s),
          (cx + 0.18 * s, cy - 0.35 * s, z0 + 0.62 * s), 'stone_dressed', bevel=STONE_BEVEL)
    # Stepped braided bronze-and-stone beard cascading over the arch keystone.
    for bx, blen, bd in ((-0.42, 0.92, 0.62), (0.0, 1.32, 0.74), (0.42, 0.92, 0.62)):
        b.box((cx + (bx - 0.16) * s, cy - bd * s, z0 + (0.08 - blen) * s),
              (cx + (bx + 0.16) * s, cy - 0.28 * s, z0 + 0.12 * s), 'hold_bronze', bevel=STONE_BEVEL)


def gate_guardian_statue(b, cx, cy, z0, scale=1.0, handedness=-1):
    """Colossal armored Dwarven warrior statue (~6.8 m tall at scale=1) facing -Y (Refs 4, 5, 6)."""
    s = scale
    h = -1 if handedness < 0 else 1

    # 1. Stepped knotwork pedestal plinth (z0 .. z0 + 1.45s).
    b.box((cx - 1.15 * s, cy - 1.05 * s, z0 - 0.2),
          (cx + 1.15 * s, cy + 1.05 * s, z0 + 0.42 * s), 'stone_basalt', skip=('-z',), bevel=STONE_BEVEL)
    b.box((cx - 0.96 * s, cy - 0.90 * s, z0 + 0.40 * s),
          (cx + 0.96 * s, cy + 0.90 * s, z0 + 1.28 * s), 'stone_granite', bevel=STONE_BEVEL)
    b.box((cx - 1.06 * s, cy - 0.98 * s, z0 + 1.26 * s),
          (cx + 1.06 * s, cy + 0.98 * s, z0 + 1.46 * s), 'stone_basalt', bevel=STONE_BEVEL)
    if detailed():
        b.box((cx - 0.42 * s, cy - 0.95 * s, z0 + 0.62 * s),
              (cx + 0.42 * s, cy - 0.86 * s, z0 + 1.10 * s), 'hold_bronze', bevel=0)

    zb = z0 + 1.45 * s
    # 2. Planted armored boots, greaves, battle skirt, and barrel cuirass.
    for sx in (-0.38, 0.38):
        b.box((cx + (sx - 0.26) * s, cy - 0.48 * s, zb),
              (cx + (sx + 0.26) * s, cy + 0.38 * s, zb + 1.45 * s), 'stone_granite', bevel=STONE_BEVEL)
    b.box((cx - 0.78 * s, cy - 0.56 * s, zb + 1.35 * s),
          (cx + 0.78 * s, cy + 0.52 * s, zb + 2.35 * s), 'stone_basalt', bevel=STONE_BEVEL)
    b.box((cx - 0.86 * s, cy - 0.60 * s, zb + 2.30 * s),
          (cx + 0.86 * s, cy + 0.56 * s, zb + 3.85 * s), 'stone_granite', bevel=STONE_BEVEL)
    if detailed():
        b.box((cx - 0.82 * s, cy - 0.64 * s, zb + 2.22 * s),
              (cx + 0.82 * s, cy + 0.60 * s, zb + 2.44 * s), 'hold_bronze', bevel=0)

    # 3. Colossal stepped pauldrons, arms, helmeted head, and sweeping braided beard.
    for sx in (-1, 1):
        px = cx + sx * 1.02 * s
        b.box((px - 0.38 * s, cy - 0.52 * s, zb + 3.10 * s),
              (px + 0.38 * s, cy + 0.48 * s, zb + 3.92 * s), 'stone_basalt', bevel=STONE_BEVEL)
        b.box((px - 0.28 * s, cy - 0.40 * s, zb + 2.15 * s),
              (px + 0.28 * s, cy + 0.34 * s, zb + 3.15 * s), 'stone_granite', bevel=STONE_BEVEL)

    # Helmeted head & crested crown.
    hz = zb + 3.85 * s
    b.box((cx - 0.46 * s, cy - 0.50 * s, hz),
          (cx + 0.46 * s, cy + 0.42 * s, hz + 1.02 * s), 'stone_dressed', bevel=STONE_BEVEL)
    b.box((cx - 0.52 * s, cy - 0.56 * s, hz + 0.66 * s),
          (cx + 0.52 * s, cy + 0.46 * s, hz + 1.24 * s), 'stone_basalt', bevel=STONE_BEVEL)
    b.box((cx - 0.12 * s, cy - 0.60 * s, hz + 1.02 * s),
          (cx + 0.12 * s, cy + 0.46 * s, hz + 1.56 * s), 'stone_dressed', bevel=STONE_BEVEL)
    if detailed():
        b.box((cx - 0.54 * s, cy - 0.60 * s, hz + 0.72 * s),
              (cx + 0.54 * s, cy + 0.48 * s, hz + 0.86 * s), 'hold_bronze', bevel=0)
    # Tiered geometric beard cascading down over chest.
    b.box((cx - 0.48 * s, cy - 0.76 * s, hz - 0.85 * s),
          (cx + 0.48 * s, cy - 0.36 * s, hz + 0.34 * s), 'stone_dressed', bevel=STONE_BEVEL)
    b.box((cx - 0.30 * s, cy - 0.82 * s, hz - 1.22 * s),
          (cx + 0.30 * s, cy - 0.42 * s, hz - 0.62 * s), 'stone_dressed', bevel=STONE_BEVEL)

    # 4. Weapons: Great round bossed Dwarven shield on `h` side, grounded greatsword on `-h` side.
    sh_x = cx + h * 0.92 * s
    sh_y = cy - 0.66 * s
    sh_z = zb + 2.35 * s
    b.box((sh_x - 0.72 * s, sh_y - 0.14 * s, sh_z - 0.82 * s),
          (sh_x + 0.72 * s, sh_y + 0.14 * s, sh_z + 0.82 * s), 'stone_basalt', bevel=0.14 * s)
    b.box((sh_x - 0.58 * s, sh_y - 0.18 * s, sh_z - 0.66 * s),
          (sh_x + 0.58 * s, sh_y - 0.06 * s, sh_z + 0.66 * s), 'stone_granite', bevel=0.10 * s)
    if detailed():
        b.box((sh_x - 0.24 * s, sh_y - 0.26 * s, sh_z - 0.24 * s),
              (sh_x + 0.24 * s, sh_y - 0.12 * s, sh_z + 0.24 * s), 'hold_bronze', bevel=0.04 * s)

    sw_x = cx - h * 0.64 * s
    sw_y = cy - 0.68 * s
    b.box((sw_x - 0.16 * s, sw_y - 0.08 * s, zb),
          (sw_x + 0.16 * s, sw_y + 0.08 * s, zb + 2.25 * s), 'iron', bevel=0.02 * s)
    b.box((sw_x - 0.44 * s, sw_y - 0.14 * s, zb + 2.22 * s),
          (sw_x + 0.44 * s, sw_y + 0.14 * s, zb + 2.40 * s), 'hold_bronze', bevel=0)
    b.box((sw_x - 0.10 * s, sw_y - 0.10 * s, zb + 2.40 * s),
          (sw_x + 0.10 * s, sw_y + 0.10 * s, zb + 3.05 * s), 'iron', bevel=0)
    b.box((sw_x - 0.20 * s, sw_y - 0.20 * s, zb + 2.55 * s),
          (sw_x + 0.20 * s, sw_y + 0.20 * s, zb + 2.88 * s), 'stone_dressed', bevel=STONE_BEVEL)


def half_open_fortress_doors(b, cx, cy, z0, width=4.2, height=5.8):
    """Monumental twin bronze-and-iron doors cracked half-open over a warm shadowed hearth."""
    leaf_w = width * 0.46
    for side in (-1, 1):
        hx = cx + side * (width * 0.5)
        # Swing leaves slightly inward (+Y) leaving an inviting glowing forge cleft in the center.
        ang = -side * 0.42
        dx = -side * math.cos(ang) * leaf_w
        dy = math.sin(abs(ang)) * leaf_w
        p0 = (hx, cy, z0)
        p1 = (hx + dx, cy + dy, z0)
        b.beam(p0, p1, (0, 0, 1), (0.0, height), 0.28, 'hold_bronze', bevel=STONE_BEVEL)
        if detailed():
            for rz in (0.7, 2.2, 3.7, 5.1):
                b.beam(p0, p1, (0, 0, 1), (rz, rz + 0.20), 0.34, 'iron', bevel=0)
    # Recessed dark hearth throat + layered animated flame sheets (zero flat neon boxes!).
    b.box((cx - width * 0.44, cy + 1.35, z0), (cx + width * 0.44, cy + 1.65, z0 + height * 0.94), 'shadow', bevel=0)
    b.box((cx - width * 0.28, cy + 1.18, z0 + 0.15), (cx + width * 0.28, cy + 1.38, z0 + height * 0.72), 'firelight', bevel=0)
    flame(b, (cx, cy + 0.95, z0 + 0.25), 0.95, 2.85)
    if detailed():
        flame(b, (cx - 0.55, cy + 1.05, z0 + 0.20), 0.65, 2.15)
        flame(b, (cx + 0.55, cy + 1.05, z0 + 0.20), 0.65, 2.15)
