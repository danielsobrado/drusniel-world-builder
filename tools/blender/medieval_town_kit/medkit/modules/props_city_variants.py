"""Distinct high-detail civic, craft, market, and cultural props per city family (5+ each)."""
import math

from mathutils import Matrix

from ..config import detailed
from ..mesh import MeshBuilder
from .props_city_helpers import enhance_city_ground_contact, finalize_city_prop


def _m(x=0.0, y=0.0, z=0.0, rz=0.0, rx=0.0, ry=0.0):
    m = Matrix.Translation((x, y, z))
    if rz:
        m = m @ Matrix.Rotation(rz, 4, 'Z')
    if ry:
        m = m @ Matrix.Rotation(ry, 4, 'Y')
    if rx:
        m = m @ Matrix.Rotation(rx, 4, 'X')
    return m


def _skirt(b, rx, ry, mat='cobble', apron_mat=None, blobs=4, seed=1):
    """Beveled below-grade plinth collar + surrounding scatter blobs for natural sloping ground contact."""
    b.box((-rx, -ry, -0.16), (rx, ry, 0.08), mat, skip=('-z',))
    if apron_mat:
        for i in range(blobs):
            a = 2 * math.pi * i / blobs + (seed % 5) * 0.2
            b.blob((rx * 0.92 * math.cos(a), ry * 0.92 * math.sin(a), 0.01),
                   0.18, apron_mat, subdiv=1, squash=(1.2, 1.0, 0.42), jitter=0.2, seed=seed + i)


# =========================================================================
# TUDOR / LUMESHIRE (5 detailed meshes)
# =========================================================================
def tudor_market_pavilion():
    b = MeshBuilder()
    _skirt(b, 1.12, 0.78, 'cobble', 'earth', 4, 11)
    for px in (-0.9, 0.9):
        for py in (-0.55, 0.55):
            b.box((px - 0.11, py - 0.11, 0.06), (px + 0.11, py + 0.11, 0.24), 'stone_dressed')
            b.box((px - 0.07, py - 0.07, 0.24), (px + 0.07, py + 0.07, 2.15), 'timber')
            b.beam((px, py, 1.55), (px * 0.68, py, 2.08), (0, 1, 0), (-0.04, 0.04), 0.07, 'timber')
            b.box((px - 0.08, py - 0.08, 1.98), (px + 0.08, py + 0.08, 2.08), 'iron')
    # Market counter, under-shelf, wine cask, hanging balance & stepped trays
    b.box((-0.82, -0.35, 0.72), (0.82, 0.35, 0.84), 'planks')
    b.box((-0.78, -0.3, 0.22), (0.78, 0.3, 0.3), 'planks')
    b.lathe([(0.0, -0.18), (0.16, -0.18), (0.2, 0.0), (0.16, 0.18), (0.0, 0.18)], 9, 'wood_trim', m=_m(-0.46, 0, 0.5, rx=math.pi / 2))
    for bx in (-0.52, 0.0, 0.52):
        b.box((bx - 0.22, -0.26, 0.84), (bx + 0.22, 0.22, 0.94), 'wood_trim')
        b.blob((bx, -0.02, 0.98), 0.14, 'flowers' if bx == 0.0 else 'foliage', subdiv=1, squash=(1.2, 0.9, 0.55), seed=int((bx + 2) * 17))
    # Hanging brass shop balance beam & fascia sign
    b.box((-0.44, -0.58, 1.88), (0.44, -0.52, 2.08), 'carved_wood')
    b.box((0.52, -0.02, 1.72), (0.84, 0.02, 1.76), 'hold_bronze')
    # Steep Tudor shingle gable canopy + ridge crest
    b.extrude([(-1.16, 0.0, 2.65), (-1.16, -0.82, 2.02), (-1.16, 0.82, 2.02)], (2.32, 0, 0), 'roof')
    b.box((-1.18, -0.06, 2.6), (1.18, 0.06, 2.74), 'wood_trim')
    b.lathe([(0.0, 2.72), (0.07, 2.82), (0.02, 2.98)], 8, 'hold_bronze', m=_m(x=-0.95))
    b.lathe([(0.0, 2.72), (0.07, 2.82), (0.02, 2.98)], 8, 'hold_bronze', m=_m(x=0.95))
    return b


def tudor_dovecote_post():
    b = MeshBuilder()
    b.box((-0.46, -0.46, -0.05), (0.46, 0.46, 0.16), 'stone_dressed', skip=('-z',))
    b.box((-0.34, -0.34, 0.16), (0.34, 0.34, 0.34), 'stone_dressed')
    b.box((-0.12, -0.12, 0.34), (0.12, 0.12, 2.05), 'timber')
    for hz in (0.62, 1.32, 1.88):
        b.box((-0.145, -0.145, hz), (0.145, 0.145, hz + 0.06), 'iron')
    for i in range(4):
        a = i * math.pi / 2
        cx, cy = math.cos(a), math.sin(a)
        b.beam((0.12 * cx, 0.12 * cy, 0.34), (0.30 * cx, 0.30 * cy, 0.18), (0, 0, 1), (-0.04, 0.04), 0.08, 'timber')
        b.beam((0, 0, 1.45), (0.46 * cx, 0.46 * cy, 1.98), (0, 0, 1), (-0.045, 0.045), 0.07, 'timber')
        b.beam((0, 0, 1.80), (0.50 * cx, 0.50 * cy, 1.98), (0, 0, 1), (-0.03, 0.03), 0.05, 'iron')
    # Octagonal plaster pigeon house with perch ledge, framed openings & weathered slate spire + vane finial
    b.lathe([(0.56, 1.98), (0.58, 2.06), (0.48, 2.08), (0.48, 2.82), (0.55, 2.84), (0.55, 2.9)], 8, 'plaster', smooth=False)
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        px, py = 0.46 * math.cos(a), 0.46 * math.sin(a)
        b.box((-0.07, -0.05, -0.06), (0.07, 0.05, 0.08), 'shadow', m=_m(px, py, 2.48, rz=a))
        b.box((-0.11, -0.09, -0.10), (0.11, 0.09, -0.05), 'wood_trim', m=_m(px * 1.08, py * 1.08, 2.48, rz=a))
        b.box((-0.09, -0.02, -0.07), (0.09, 0.02, 0.10), 'wood_trim', m=_m(px * 1.03, py * 1.03, 2.48, rz=a))
    b.lathe([(0.66, 2.9), (0.38, 3.36), (0.07, 3.74), (0.0, 3.88)], 8, 'roof', smooth=False)
    b.lathe([(0.0, 3.86), (0.06, 3.94), (0.02, 4.18)], 8, 'hold_bronze')
    b.box((0.0, -0.015, 4.02), (0.24, 0.015, 4.12), 'hold_bronze')
    return b


def tudor_flower_trellis_arch():
    b = MeshBuilder()
    for sx in (-0.92, 0.92):
        b.box((sx - 0.26, -0.28, -0.05), (sx + 0.26, 0.28, 0.42), 'stone_dressed', skip=('-z',))
        b.box((sx - 0.08, -0.22, 0.42), (sx + 0.08, -0.1, 2.3), 'timber')
        b.box((sx - 0.08, 0.1, 0.42), (sx + 0.08, 0.22, 2.3), 'timber')
        for h in (0.75, 1.25, 1.75):
            b.box((sx - 0.05, -0.22, h), (sx + 0.05, 0.22, h + 0.06), 'wood_trim')
    b.box((-1.15, -0.26, 2.3), (1.15, 0.26, 2.44), 'timber')
    b.beam((-0.92, 0, 1.82), (-0.42, 0, 2.3), (0, 1, 0), (-0.04, 0.04), 0.08, 'timber')
    b.beam((0.92, 0, 1.82), (0.42, 0, 2.3), (0, 1, 0), (-0.04, 0.04), 0.08, 'timber')
    for i, (fx, fz, r) in enumerate(((-0.88, 1.15, 0.28), (-0.9, 1.85, 0.32), (0.9, 1.2, 0.28), (0.88, 1.9, 0.32), (-0.35, 2.45, 0.3), (0.38, 2.46, 0.3))):
        b.blob((fx, 0.0, fz), r, 'foliage', subdiv=2 if detailed() else 1, squash=(1, 1.1, 0.8), seed=30 + i)
        b.blob((fx + 0.08, 0.12, fz + 0.08), r * 0.52, 'flowers', subdiv=1, seed=50 + i)
    return b


def tudor_watch_lantern_gallows():
    b = MeshBuilder()
    b.lathe([(0.42, -0.05), (0.38, 0.22), (0.30, 0.36), (0.24, 0.62), (0.21, 0.92)], 8, 'stone_dressed', smooth=False)
    b.box((-0.09, -0.09, 0.88), (0.09, 0.09, 2.75), 'timber')
    for cz in (0.94, 1.68, 2.44):
        b.box((-0.11, -0.11, cz), (0.11, 0.11, cz + 0.06), 'iron')
    for i in range(4):
        a = i * math.pi / 2
        b.beam((0.20 * math.cos(a), 0.20 * math.sin(a), 0.72), (0.08 * math.cos(a), 0.08 * math.sin(a), 1.16), (0, 0, 1), (-0.03, 0.03), 0.06, 'timber')
    b.box((-0.07, -0.07, 2.52), (0.78, 0.07, 2.66), 'timber')
    b.lathe([(0.0, 2.75), (0.05, 2.86), (0.015, 3.04)], 8, 'iron')
    b.beam((0.08, 0, 2.05), (0.58, 0, 2.54), (0, 1, 0), (-0.04, 0.04), 0.07, 'timber')
    # Wrought-iron S-scroll brace + corner lantern cage ribs & chain links
    b.beam((0.08, 0, 2.28), (0.36, 0, 2.52), (0, 1, 0), (-0.02, 0.02), 0.04, 'iron')
    b.beam((-0.08, 0, 2.24), (-0.24, 0, 2.60), (0, 1, 0), (-0.02, 0.02), 0.035, 'iron')
    b.box((0.62, -0.025, 2.36), (0.68, 0.025, 2.52), 'iron')
    # Hanging lantern cage + corner iron mullions + glow core
    b.lathe([(0.17, 2.28), (0.21, 2.24), (0.06, 2.38)], 6, 'iron', m=_m(x=0.65), smooth=False)
    b.lathe([(0.13, 1.96), (0.15, 2.24)], 6, 'glass_clear', m=_m(x=0.65), smooth=False)
    for k in range(4):
        ca = k * math.pi / 2 + 0.4
        cx, cy = 0.65 + 0.15 * math.cos(ca), 0.15 * math.sin(ca)
        b.box((cx - 0.015, cy - 0.015, 1.95), (cx + 0.015, cy + 0.015, 2.26), 'iron')
    b.blob((0.65, 0, 2.1), 0.08, 'glow', subdiv=1)
    b.lathe([(0.15, 1.92), (0.17, 1.96), (0.0, 1.88)], 6, 'iron', m=_m(x=0.65), smooth=False)
    return b


def tudor_guild_display_cart():
    b = MeshBuilder()
    b.box((-0.9, -0.48, 0.44), (0.9, 0.48, 0.86), 'planks')
    for sx in (-0.75, 0.0, 0.75):
        b.box((sx - 0.04, -0.52, 0.42), (sx + 0.04, 0.52, 0.92), 'timber')
    # Spoked spoked iron-rimmed wheels + shafts
    for wy in (-0.56, 0.56):
        b.lathe([(0.42, -0.04), (0.44, 0.0), (0.42, 0.04), (0.34, 0.04), (0.34, -0.04), (0.42, -0.04)], 12, 'iron', m=_m(y=wy, rx=math.pi / 2), smooth=False)
        for sp in range(4):
            a = sp * math.pi / 4
            b.box((-0.03, wy - 0.025, -0.36), (0.03, wy + 0.025, 0.36), 'timber', m=_m(z=0.44, ry=a))
    b.box((-1.55, -0.44, 0.42), (-0.88, -0.36, 0.5), 'timber')
    b.box((-1.55, 0.36, 0.42), (-0.88, 0.44, 0.5), 'timber')
    b.box((-0.96, -0.5, 0.86), (-0.86, -0.4, 1.85), 'timber')
    b.box((0.86, 0.4, 0.86), (0.96, 0.5, 1.85), 'timber')
    b.box((-0.96, 0.4, 0.86), (-0.86, 0.5, 1.85), 'timber')
    b.box((0.86, -0.5, 0.86), (0.96, -0.4, 1.85), 'timber')
    b.extrude([(-0.98, 0, 2.2), (-0.98, -0.58, 1.78), (-0.98, 0.58, 1.78)], (1.96, 0, 0), 'cloth_cream')
    return b


# =========================================================================
# NORDIC / ZURALDI (5 detailed meshes)
# =========================================================================
def nordic_dragon_totem_post():
    b = MeshBuilder()
    b.lathe([(0.52, -0.05), (0.46, 0.22), (0.32, 0.36)], 8, 'stone_granite', smooth=False)
    for i in range(6):
        a = i * math.pi / 3
        b.blob((0.40 * math.cos(a), 0.40 * math.sin(a), 0.14), 0.22, 'stone_granite', subdiv=1, squash=(1, 1, 0.65), seed=90 + i)
    b.lathe([(0.24, -0.05), (0.20, 0.6), (0.16, 2.4), (0.18, 2.7)], 8, 'log')
    for rz in (0.78, 1.38, 1.96):
        b.lathe([(0.21, rz - 0.05), (0.23, rz), (0.20, rz + 0.06)], 8, 'bronze')
    # Leaned carved buckler shield plaque anchored against lower post + twin dragon-prow horns & serrated jaws
    b.lathe([(0.0, -0.04), (0.28, -0.04), (0.30, 0.0), (0.0, 0.02)], 12, 'planks', m=_m(x=0.22, z=0.68, ry=1.36))
    b.lathe([(0.0, 0.02), (0.09, 0.02), (0.0, 0.08)], 10, 'bronze', m=_m(x=0.22, z=0.68, ry=1.36))
    b.beam((0, 0, 2.55), (0, -0.58, 3.08), (1, 0, 0), (-0.06, 0.06), 0.12, 'carved_wood')
    b.beam((0, 0, 2.55), (0, 0.58, 3.08), (1, 0, 0), (-0.06, 0.06), 0.12, 'carved_wood')
    b.beam((0, -0.14, 2.66), (-0.36, -0.42, 3.22), (0, 0, 1), (-0.04, 0.04), 0.09, 'bronze')
    b.beam((0, 0.14, 2.66), (-0.36, 0.42, 3.22), (0, 0, 1), (-0.04, 0.04), 0.09, 'bronze')
    b.box((-0.14, -0.18, 2.68), (0.14, 0.18, 3.22), 'carved_wood')
    b.box((-0.16, -0.08, 3.06), (0.52, 0.08, 3.34), 'carved_wood')
    b.box((-0.02, -0.06, 2.86), (0.44, 0.06, 2.98), 'carved_wood')
    b.lathe([(0.10, -0.03), (0.12, 0.0), (0.10, 0.03)], 10, 'bronze', m=_m(x=0.44, z=2.84, rx=math.pi / 2), smooth=False)
    return b


def nordic_brewery_cask_rack():
    b = MeshBuilder()
    for sx in (-0.65, 0.65):
        b.box((sx - 0.08, -0.55, -0.04), (sx + 0.08, 0.55, 0.16), 'log', skip=('-z',))
        b.beam((sx, -0.45, 0.14), (sx, -0.12, 0.85), (1, 0, 0), (-0.06, 0.06), 0.12, 'log')
        b.beam((sx, 0.45, 0.14), (sx, 0.12, 0.85), (1, 0, 0), (-0.06, 0.06), 0.12, 'log')
    b.box((-0.78, -0.28, 0.72), (0.78, 0.28, 0.86), 'timber')
    for cx in (-0.38, 0.38):
        b.lathe([(0.0, -0.34), (0.28, -0.34), (0.34, 0.0), (0.28, 0.34), (0.0, 0.34)], 10, 'planks', m=_m(x=cx, z=1.12, rx=math.pi / 2))
        for hz in (-0.22, 0.22):
            b.lathe([(0.32, hz - 0.025), (0.35, hz), (0.32, hz + 0.025)], 10, 'iron', m=_m(x=cx, z=1.12, rx=math.pi / 2), smooth=False)
        b.box((cx - 0.04, -0.44, 1.04), (cx + 0.04, -0.32, 1.12), 'bronze')
    return b


def nordic_mead_hall_brazier():
    b = MeshBuilder()
    b.lathe([(0.68, -0.05), (0.64, 0.28), (0.54, 0.34), (0.48, 0.65)], 8, 'stone_granite', smooth=False)
    for k in range(3):
        a = k * 2 * math.pi / 3
        b.beam((0.4 * math.cos(a), 0.4 * math.sin(a), 0.58), (0.62 * math.cos(a), 0.62 * math.sin(a), 1.12), (0, 0, 1), (-0.05, 0.05), 0.09, 'iron')
    b.lathe([(0.0, 0.78), (0.38, 0.82), (0.64, 1.14), (0.58, 1.22), (0.0, 0.98)], 10, 'iron')
    b.blob((0, 0, 1.16), 0.36, 'glow', subdiv=1, squash=(1.1, 1.1, 0.65), jitter=0.25, seed=77)
    return b


def nordic_furs_tanning_frame():
    b = MeshBuilder()
    b.beam((-0.82, -0.1, -0.04), (-0.12, 0.05, 2.05), (0, 1, 0), (-0.05, 0.05), 0.1, 'log')
    b.beam((0.82, -0.1, -0.04), (0.12, 0.05, 2.05), (0, 1, 0), (-0.05, 0.05), 0.1, 'log')
    b.box((-0.78, -0.12, 0.55), (0.78, -0.02, 0.66), 'log')
    b.box((-0.66, -0.02, 1.65), (0.66, 0.08, 1.76), 'log')
    # Stretched hide pelt & lashing cords
    b.extrude([(-0.48, 0.01, 0.66), (0.48, 0.01, 0.66), (0.38, 0.01, 1.64), (-0.38, 0.01, 1.64)], (0, 0.05, 0), 'hide')
    for cx in (-0.52, 0.52):
        for cz in (0.78, 1.18, 1.54):
            b.beam((cx, 0.03, cz), (cx * 0.74, 0.03, cz + 0.06), (0, 1, 0), (-0.02, 0.02), 0.03, 'rope')
    b.box((-0.44, 0.14, 0.0), (0.44, 0.42, 0.24), 'hide_red')
    return b


def nordic_skiff_drydock_hull():
    b = MeshBuilder()
    for sx in (-0.7, 0.7):
        b.box((sx - 0.1, -0.52, -0.04), (sx + 0.1, 0.52, 0.24), 'timber')
    hull = [(-1.35, 0.0, 0.68), (-0.95, -0.48, 0.24), (0.0, -0.62, 0.16), (0.95, -0.48, 0.24),
            (1.35, 0.0, 0.68), (0.95, 0.48, 0.24), (0.0, 0.62, 0.16), (-0.95, 0.48, 0.24)]
    b.extrude(hull, (0, 0, 0.46), 'planks')
    b.beam((-1.25, 0, 0.7), (-1.58, 0, 1.24), (0, 1, 0), (-0.05, 0.05), 0.1, 'carved_wood')
    b.beam((1.25, 0, 0.7), (1.58, 0, 1.24), (0, 1, 0), (-0.05, 0.05), 0.1, 'carved_wood')
    b.box((-0.65, -0.42, 0.7), (-0.52, 0.42, 0.78), 'timber')
    b.box((0.52, -0.42, 0.7), (0.65, 0.42, 0.78), 'timber')
    return b


# =========================================================================
# MED / CONTIAN & ELENORIA (5 detailed meshes)
# =========================================================================
def med_amphora_terrace_stand():
    b = MeshBuilder()
    b.box((-0.92, -0.44, -0.05), (0.92, 0.44, 0.52), 'stone_ashlar', skip=('-z',))
    b.box((-0.98, -0.5, 0.52), (0.98, 0.5, 0.64), 'stone_dressed')
    for i, ax in enumerate((-0.56, 0.0, 0.56)):
        sc = 1.0 if i == 1 else 0.84
        b.lathe(
            [(0.0, 0.64), (0.14 * sc, 0.64), (0.28 * sc, 0.96), (0.22 * sc, 1.24), (0.09 * sc, 1.38), (0.14 * sc, 1.48), (0.07 * sc, 1.48)],
            10, 'roof_terracotta', m=_m(x=ax),
        )
    return b


def med_cypress_urn_planter():
    b = MeshBuilder()
    b.box((-0.44, -0.44, -0.05), (0.44, 0.44, 0.36), 'stone_ashlar', skip=('-z',))
    b.lathe([(0.32, 0.36), (0.18, 0.52), (0.38, 0.88), (0.42, 0.98), (0.34, 0.98)], 10, 'stone_dressed')
    for i in range(4):
        z = 1.12 + i * 0.42
        r = 0.34 * (1 - i * 0.18)
        b.blob((0, 0, z), r, 'foliage', subdiv=2 if detailed() else 1, squash=(1, 1, 1.35), seed=120 + i)
    b.blob((0.22, 0.14, 1.18), 0.07, 'gold', subdiv=1)
    b.blob((-0.18, 0.2, 1.38), 0.065, 'gold', subdiv=1)
    return b


def med_sun_arbor_pergola():
    b = MeshBuilder()
    b.box((-1.08, -0.78, -0.05), (1.08, 0.78, 0.12), 'stone_flag', skip=('-z',))
    for cx in (-0.88, 0.88):
        for cy in (-0.6, 0.6):
            b.lathe([(0.16, 0.12), (0.14, 0.32), (0.12, 2.2), (0.17, 2.34)], 8, 'stone_dressed', m=_m(x=cx, y=cy))
    for cx in (-0.88, 0.88):
        b.box((cx - 0.1, -0.72, 2.34), (cx + 0.1, 0.72, 2.5), 'wood_trim')
    for ry in (-0.56, -0.18, 0.18, 0.56):
        b.box((-1.02, ry - 0.05, 2.48), (1.02, ry + 0.05, 2.58), 'timber')
    b.extrude([(-0.92, -0.58, 2.58), (0.92, -0.58, 2.58), (0.92, 0.58, 2.58), (-0.92, 0.58, 2.58)], (0, 0, 0.05), 'cloth_cream')
    b.box((-0.58, -0.24, 0.12), (0.58, 0.24, 0.52), 'stone_dressed')
    return b


def med_marble_lion_fountain():
    b = MeshBuilder()
    b.lathe([(0.96, -0.05), (0.94, 0.42), (0.8, 0.42), (0.76, 0.18), (0.0, 0.18)], 8, 'stone_dressed', smooth=False)
    b.lathe([(0.32, 0.18), (0.18, 0.48), (0.22, 1.15), (0.48, 1.28), (0.14, 1.48), (0.0, 1.72)], 10, 'stone_ashlar')
    b.lathe([(0.76, 0.28), (0.0, 0.28)], 8, 'water', smooth=False)
    for k in range(4):
        a = k * math.pi / 2
        b.box((-0.05, -0.05, -0.05), (0.05, 0.24, 0.05), 'bronze', m=_m(0.24 * math.cos(a), 0.24 * math.sin(a), 0.92, rz=a))
    return b


def med_merchant_scale_counter():
    b = MeshBuilder()
    b.box((-0.88, -0.44, -0.04), (0.88, 0.44, 0.88), 'wood_trim', skip=('-z',))
    b.box((-0.96, -0.5, 0.88), (0.96, 0.5, 0.96), 'stone_dressed')
    for sx in (-0.82, 0.82):
        b.box((sx - 0.06, 0.34, 0.96), (sx + 0.06, 0.46, 2.25), 'timber')
    b.extrude([(-1.02, -0.58, 2.02), (1.02, -0.58, 2.02), (1.02, 0.52, 2.42), (-1.02, 0.52, 2.42)], (0, 0, 0.08), 'roof_terracotta')
    b.box((-0.6, -0.22, 0.96), (-0.18, 0.22, 1.16), 'cloth_red')
    b.box((-0.6, -0.18, 1.16), (-0.22, 0.18, 1.32), 'cloth_blue')
    b.lathe([(0.04, 0.96), (0.025, 1.42)], 6, 'gold', m=_m(x=0.38))
    b.box((0.18, -0.02, 1.38), (0.58, 0.02, 1.42), 'gold')
    return b


# =========================================================================
# GOBLIN / GRUKMAR MARSH (5 detailed meshes)
# =========================================================================
def goblin_scrap_still_boiler():
    b = MeshBuilder()
    for sx, sy in ((-0.38, -0.28), (0.38, -0.28), (-0.38, 0.28), (0.38, 0.28)):
        b.blob((sx, sy, 0.18), 0.2, 'stone_dark', subdiv=1, seed=int((sx + 2) * 19 + (sy + 2) * 7))
    b.blob((0, 0, 0.28), 0.24, 'glow', subdiv=1, squash=(1, 1, 0.5))
    b.lathe([(0.0, 0.42), (0.46, 0.46), (0.48, 1.24), (0.36, 1.48), (0.0, 1.54)], 10, 'iron')
    b.box((-0.52, -0.52, 0.85), (0.52, 0.52, 0.93), 'iron')
    b.beam((0.26, 0.1, 1.38), (0.58, 0.22, 2.25), (0, 1, 0), (-0.08, 0.08), 0.16, 'iron')
    b.beam((0.58, 0.22, 2.25), (0.45, 0.26, 2.65), (0, 1, 0), (-0.07, 0.07), 0.14, 'iron')
    return b


def goblin_cage_spike_gibbet():
    b = MeshBuilder()
    b.beam((-0.52, -0.42, -0.05), (0.0, 0.0, 2.95), (0, 1, 0), (-0.06, 0.06), 0.11, 'timber_dark')
    b.beam((0.52, -0.42, -0.05), (0.0, 0.0, 2.95), (0, 1, 0), (-0.06, 0.06), 0.11, 'timber_dark')
    b.beam((0.0, 0.58, -0.05), (0.0, 0.0, 2.95), (1, 0, 0), (-0.06, 0.06), 0.11, 'timber_dark')
    b.beam((0.0, 0.0, 2.92), (0.62, 0.0, 3.12), (0, 1, 0), (-0.05, 0.05), 0.1, 'timber_dark')
    b.box((0.56, -0.02, 2.38), (0.6, 0.02, 3.08), 'iron')
    # Hanging iron bar cage + skull charm
    b.box((0.34, -0.24, 1.46), (0.82, 0.24, 1.54), 'iron')
    b.box((0.34, -0.24, 2.3), (0.82, 0.24, 2.38), 'iron')
    for bx in (0.36, 0.58, 0.8):
        for by in (-0.22, 0.22):
            b.box((bx - 0.02, by - 0.02, 1.54), (bx + 0.02, by + 0.02, 2.3), 'iron')
    b.blob((0.0, 0.0, 2.86), 0.16, 'rope', subdiv=1)
    b.blob((0.0, -0.18, 2.2), 0.12, 'bone', subdiv=1)
    return b


def goblin_salvage_trophy_totem():
    b = MeshBuilder()
    b.lathe([(0.16, -0.08), (0.12, 1.2), (0.08, 3.1)], 7, 'timber_dark')
    b.box((-0.54, -0.04, 1.98), (0.54, 0.04, 2.1), 'timber')
    b.lathe([(0.34, -0.04), (0.36, 0.04), (0.28, 0.04), (0.28, -0.04)], 10, 'timber', m=_m(y=-0.1, z=1.45, rx=math.pi / 2), smooth=False)
    b.extrude([(-0.48, 0.04, 1.98), (0.48, 0.04, 1.98), (0.34, 0.04, 1.15), (-0.42, 0.04, 1.28)], (0, 0.03, 0), 'cloth_red')
    for sx, sz in ((-0.46, 2.18), (0.46, 2.18), (0.0, 3.16)):
        b.blob((sx, 0.0, sz), 0.13, 'bone', subdiv=1, seed=int((sx + 3) * 17))
    return b


def goblin_bog_mushroom_coop():
    b = MeshBuilder()
    for sx in (-0.52, 0.52):
        for sy in (-0.42, 0.42):
            b.box((sx - 0.06, sy - 0.06, -0.05), (sx + 0.06, sy + 0.06, 0.65), 'timber_dark')
    b.box((-0.62, -0.52, 0.62), (0.62, 0.52, 0.72), 'planks')
    b.box((-0.56, -0.46, 0.72), (0.56, 0.46, 1.38), 'hide')
    b.extrude([(-0.74, -0.6, 1.36), (0.74, -0.6, 1.36), (0.0, -0.6, 1.96)], (0, 1.2, 0), 'thatch_reed')
    return b


def goblin_tinker_scrap_cart():
    b = MeshBuilder()
    b.box((-0.78, -0.46, 0.38), (0.78, 0.46, 0.84), 'planks')
    b.box((-0.82, -0.5, 0.74), (0.82, 0.5, 0.88), 'iron')
    b.lathe([(0.4, -0.04), (0.4, 0.04), (0.0, 0.04)], 9, 'timber', m=_m(y=-0.52, z=0.42, rx=math.pi / 2), smooth=False)
    b.lathe([(0.34, -0.04), (0.34, 0.04), (0.0, 0.04)], 9, 'iron', m=_m(y=0.52, z=0.38, rx=math.pi / 2), smooth=False)
    b.box((-0.55, -0.32, 0.86), (-0.1, 0.18, 1.26), 'timber')
    b.box((0.08, -0.22, 0.86), (0.62, 0.3, 1.18), 'iron')
    b.beam((-0.75, -0.35, 0.46), (-1.42, -0.38, 0.25), (0, 0, 1), (-0.04, 0.04), 0.08, 'timber_dark')
    b.beam((-0.75, 0.35, 0.46), (-1.42, 0.38, 0.25), (0, 0, 1), (-0.04, 0.04), 0.08, 'timber_dark')
    return b


# =========================================================================
# ORC / GRUKMAR UPLANDS (5 detailed meshes)
# =========================================================================
def orc_warchief_drum_pavilion():
    b = MeshBuilder()
    b.box((-0.88, -0.68, -0.05), (0.88, 0.68, 0.18), 'stone_dark', skip=('-z',))
    b.beam((-0.78, -0.58, 0.18), (-0.42, -0.28, 1.92), (0, 1, 0), (-0.07, 0.07), 0.14, 'timber_dark')
    b.beam((0.78, -0.58, 0.18), (0.42, -0.28, 1.92), (0, 1, 0), (-0.07, 0.07), 0.14, 'timber_dark')
    b.beam((-0.78, 0.58, 0.18), (-0.42, 0.28, 1.92), (0, 1, 0), (-0.07, 0.07), 0.14, 'timber_dark')
    b.beam((0.78, 0.58, 0.18), (0.42, 0.28, 1.92), (0, 1, 0), (-0.07, 0.07), 0.14, 'timber_dark')
    b.box((-0.62, -0.36, 1.88), (0.62, 0.36, 2.02), 'timber_dark')
    b.lathe([(0.0, 0.42), (0.58, 0.44), (0.64, 0.86), (0.56, 1.24), (0.0, 1.26)], 12, 'hide_red')
    b.lathe([(0.65, 0.54), (0.67, 0.58), (0.65, 0.62)], 12, 'iron', smooth=False)
    b.lathe([(0.65, 1.04), (0.67, 1.08), (0.65, 1.12)], 12, 'iron', smooth=False)
    return b


def orc_bone_spike_barricade():
    b = MeshBuilder()
    for sx in (-0.75, 0.0, 0.75):
        b.blob((sx, 0.15, 0.22), 0.42, 'stone_dark', subdiv=1, squash=(1.2, 0.9, 0.6), seed=int((sx + 2) * 31))
    b.box((-1.05, -0.14, 0.38), (1.05, 0.06, 0.54), 'timber_dark')
    for i, spx in enumerate((-0.82, -0.38, 0.0, 0.38, 0.82)):
        b.beam((spx, 0.32, 0.0), (spx, -0.58, 1.38 + (i % 2) * 0.24), (1, 0, 0), (-0.07, 0.07), 0.14, 'timber_dark')
        b.lathe([(0.0, 0.0), (0.06, 0.0), (0.0, 0.28)], 6, 'bone', m=_m(x=spx, y=-0.56, z=1.35 + (i % 2) * 0.24, rx=0.65), smooth=False)
    return b


def orc_forge_quench_anvil_rig():
    b = MeshBuilder()
    b.box((-0.52, -0.44, -0.05), (0.52, 0.44, 0.62), 'stone_dark', skip=('-z',))
    b.box((-0.44, -0.22, 0.62), (0.44, 0.22, 0.98), 'iron')
    b.box((-0.68, -0.14, 0.82), (0.68, 0.14, 0.98), 'iron')
    # Quench trough beside pedestal
    b.box((0.68, -0.42, -0.04), (1.34, 0.42, 0.52), 'timber_dark')
    b.extrude([(0.74, -0.36, 0.44), (1.28, -0.36, 0.44), (1.28, 0.36, 0.44), (0.74, 0.36, 0.44)], (0, 0, 0.04), 'water')
    b.blob((-0.78, 0.0, 0.42), 0.26, 'glow', subdiv=1)
    return b


def orc_hide_rack_trophy_frame():
    b = MeshBuilder()
    b.box((-0.86, -0.08, -0.05), (-0.72, 0.08, 2.25), 'timber_dark')
    b.box((0.72, -0.08, -0.05), (0.86, 0.08, 2.25), 'timber_dark')
    b.box((-1.02, -0.07, 2.02), (1.02, 0.07, 2.16), 'timber_dark')
    for hx in (-0.42, 0.0, 0.42):
        b.extrude([(hx - 0.18, -0.02, 0.68), (hx + 0.18, -0.02, 0.68), (hx + 0.14, -0.02, 2.0), (hx - 0.14, -0.02, 2.0)], (0, 0.04, 0), 'hide_red' if hx == 0 else 'hide')
    for bx in (-0.82, 0.82):
        b.blob((bx, 0.0, 2.34), 0.14, 'bone', subdiv=1)
    return b


def orc_charred_idol_pillar():
    b = MeshBuilder()
    b.lathe([(0.64, -0.05), (0.58, 0.34), (0.48, 0.4), (0.4, 2.05), (0.48, 2.22), (0.0, 2.35)], 7, 'stone_dark', smooth=False)
    for hz in (0.88, 1.45, 1.98):
        b.lathe([(0.44, hz - 0.04), (0.47, hz), (0.44, hz + 0.04)], 7, 'iron', smooth=False)
    b.beam((0.28, 0, 2.08), (0.64, 0, 2.65), (0, 1, 0), (-0.05, 0.05), 0.09, 'bone')
    b.beam((-0.28, 0, 2.08), (-0.64, 0, 2.65), (0, 1, 0), (-0.05, 0.05), 0.09, 'bone')
    b.blob((0, 0, 2.42), 0.24, 'glow', subdiv=1)
    return b


# =========================================================================
# FROSTGARD (5 detailed meshes)
# =========================================================================
def frostgard_ice_saw_rack():
    b = MeshBuilder()
    _skirt(b, 0.92, 0.56, 'stone_granite', 'snow', 4, 21)
    for sx in (-0.75, 0.75):
        b.beam((sx, -0.45, -0.04), (sx, 0.0, 1.32), (1, 0, 0), (-0.05, 0.05), 0.1, 'log')
        b.beam((sx, 0.45, -0.04), (sx, 0.0, 1.32), (1, 0, 0), (-0.05, 0.05), 0.1, 'log')
        b.box((sx - 0.08, -0.42, 0.45), (sx + 0.08, 0.42, 0.54), 'iron')
    b.box((-0.92, -0.06, 1.24), (0.92, 0.06, 1.38), 'log')
    b.box((-0.62, -0.42, 0.06), (0.62, 0.42, 0.18), 'planks')
    # Cut translucent blue glacier blocks strapped on sled tray + frosted sawyer bench
    b.box((-0.5, -0.3, 0.18), (-0.02, 0.28, 0.66), 'ice')
    b.box((0.04, -0.28, 0.18), (0.52, 0.3, 0.6), 'ice')
    b.box((-0.24, -0.24, 0.66), (0.28, 0.24, 1.02), 'ice')
    b.box((-0.26, -0.26, 0.98), (0.3, 0.26, 1.08), 'snow')
    b.box((-0.62, -0.09, 0.78), (0.62, -0.05, 0.92), 'iron')
    b.box((-0.72, -0.11, 0.74), (-0.58, -0.03, 0.96), 'wood_trim')
    b.box((0.58, -0.11, 0.74), (0.72, -0.03, 0.96), 'wood_trim')
    return b


def frostgard_hearth_kettle_shelter():
    b = MeshBuilder()
    for sx in (-0.78, 0.78):
        for sy in (-0.42, 0.42):
            b.box((sx - 0.07, sy - 0.07, -0.05), (sx + 0.07, sy + 0.07, 1.78), 'log')
    b.extrude([(-0.96, -0.58, 1.72), (0.96, -0.58, 1.72), (0.96, 0.58, 2.08), (-0.96, 0.58, 2.08)], (0, 0, 0.18), 'sod')
    b.extrude([(-0.98, -0.6, 1.9), (0.98, -0.6, 1.9), (0.98, 0.6, 2.26), (-0.98, 0.6, 2.26)], (0, 0, 0.1), 'snow')
    b.lathe([(0.44, 0.0), (0.4, 0.22), (0.0, 0.22)], 8, 'stone_granite', smooth=False)
    b.blob((0, 0, 0.26), 0.22, 'glow', subdiv=1)
    b.lathe([(0.0, 0.65), (0.28, 0.72), (0.34, 0.98), (0.26, 1.15), (0.0, 1.1)], 10, 'iron')
    return b


def frostgard_runic_lantern_post():
    b = MeshBuilder()
    b.box((-0.24, -0.24, -0.05), (0.24, 0.24, 0.45), 'stone_granite', skip=('-z',))
    b.box((-0.11, -0.11, 0.45), (0.11, 0.11, 2.75), 'log')
    b.box((-0.09, -0.09, 2.52), (0.76, 0.09, 2.66), 'log')
    b.box((0.0, -0.08, 2.66), (0.74, 0.08, 2.74), 'snow')
    b.lathe([(0.16, 1.98), (0.18, 2.34), (0.0, 2.48)], 6, 'ice', m=_m(x=0.62), smooth=False)
    b.blob((0.62, 0.0, 2.15), 0.09, 'glow', subdiv=1)
    return b


def frostgard_wolf_pelt_sled():
    b = MeshBuilder()
    for ry in (-0.38, 0.38):
        b.box((-0.95, ry - 0.04, 0.0), (0.95, ry + 0.04, 0.12), 'timber')
        b.beam((0.92, ry, 0.06), (1.28, ry, 0.44), (0, 1, 0), (-0.04, 0.04), 0.07, 'timber')
    b.box((-0.82, -0.44, 0.24), (0.88, 0.44, 0.34), 'planks')
    b.box((-0.72, -0.34, 0.34), (0.28, 0.34, 0.72), 'hide')
    b.box((-0.44, -0.26, 0.72), (0.18, 0.28, 0.96), 'hide_red')
    b.lathe([(0.2, 0.34), (0.22, 0.48), (0.16, 0.56), (0.0, 0.56)], 8, 'rope', m=_m(x=0.58))
    return b


def frostgard_rime_shrine_cairn():
    b = MeshBuilder()
    b.box((-0.68, -0.68, -0.05), (0.68, 0.68, 0.32), 'stone_granite', skip=('-z',))
    b.box((-0.52, -0.52, 0.32), (0.52, 0.52, 0.62), 'stone_basalt')
    b.box((-0.26, -0.18, 0.62), (0.26, 0.18, 2.15), 'ice')
    b.box((-0.34, -0.22, 1.56), (0.34, 0.22, 1.72), 'snow')
    b.lathe([(0.0, 0.62), (0.22, 0.66), (0.28, 0.86), (0.0, 0.78)], 8, 'iron', m=_m(x=0.0, y=-0.42))
    b.blob((0.0, -0.42, 0.86), 0.14, 'glow', subdiv=1)
    return b


# =========================================================================
# STONEHOLD (5 detailed meshes)
# =========================================================================
def stonehold_steam_exhaust_monument():
    b = MeshBuilder()
    _skirt(b, 0.78, 0.78, 'stone_flag', 'rock', 4, 31)
    b.box((-0.66, -0.66, 0.04), (0.66, 0.66, 0.48), 'stone_granite', skip=('-z',))
    b.box((-0.56, -0.56, 0.48), (0.56, 0.56, 0.64), 'stone_basalt')
    b.lathe([(0.42, 0.64), (0.4, 1.95), (0.5, 2.08), (0.36, 2.55), (0.44, 2.68), (0.28, 2.68)], 10, 'hold_bronze')
    for hz in (1.05, 1.55):
        b.lathe([(0.44, hz - 0.03), (0.47, hz), (0.44, hz + 0.03)], 10, 'iron', smooth=False)
    for i in range(4):
        a = i * math.pi / 2
        b.box((-0.07, -0.07, 0.7), (0.07, 0.07, 2.05), 'iron', m=_m(0.42 * math.cos(a), 0.42 * math.sin(a), 0.0))
        b.beam((0.46 * math.cos(a), 0.46 * math.sin(a), 0.64), (0.62 * math.cos(a), 0.62 * math.sin(a), 0.42), (0, 0, 1), (-0.05, 0.05), 0.1, 'stone_basalt')
    b.blob((0, 0, 2.68), 0.24, 'glow', subdiv=1, squash=(1, 1, 0.5))
    return b


def stonehold_rune_forge_pedestal():
    b = MeshBuilder()
    b.box((-0.68, -0.68, -0.05), (0.68, 0.68, 0.42), 'stone_granite', skip=('-z',))
    b.box((-0.52, -0.44, 0.42), (0.52, 0.44, 0.92), 'stone_basalt')
    b.box((-0.56, -0.48, 0.82), (0.56, 0.48, 0.94), 'hold_bronze')
    b.box((-0.38, -0.2, 0.94), (0.38, 0.2, 1.24), 'iron')
    b.box((-0.62, -0.12, 1.1), (0.62, 0.12, 1.24), 'iron')
    b.blob((0.0, -0.52, 0.64), 0.14, 'glow', subdiv=1)
    return b


def stonehold_aqueduct_spout():
    b = MeshBuilder()
    b.box((-0.78, -0.62, -0.05), (0.78, 0.62, 0.44), 'stone_granite', skip=('-z',))
    b.box((-0.68, -0.52, 0.44), (0.68, 0.52, 0.52), 'water')
    b.box((-0.38, 0.12, 0.44), (0.38, 0.62, 1.95), 'stone_basalt')
    b.box((-0.44, 0.06, 1.95), (0.44, 0.68, 2.15), 'stone_granite')
    b.box((-0.18, -0.24, 1.18), (0.18, 0.14, 1.52), 'hold_bronze')
    b.box((-0.09, -0.26, 0.52), (0.09, -0.14, 1.28), 'water')
    return b


def stonehold_ore_classifier_chute():
    b = MeshBuilder()
    for sx in (-0.64, 0.64):
        b.box((sx - 0.1, -0.58, -0.04), (sx + 0.1, 0.58, 1.68), 'stone_granite')
    b.extrude([(-0.62, 0.45, 1.58), (0.62, 0.45, 1.58), (0.62, -0.52, 0.68), (-0.62, -0.52, 0.68)], (0, 0, 0.12), 'iron')
    b.box((-0.56, -0.66, -0.04), (0.56, -0.12, 0.48), 'stone_basalt')
    b.blob((-0.24, -0.4, 0.56), 0.18, 'bronze', subdiv=1, seed=41)
    b.blob((0.22, -0.38, 0.54), 0.16, 'rock', subdiv=1, seed=42)
    return b


def stonehold_ancestral_stele():
    b = MeshBuilder()
    b.box((-0.72, -0.46, -0.05), (0.72, 0.46, 0.36), 'stone_granite', skip=('-z',))
    b.box((-0.52, -0.24, 0.36), (0.52, 0.24, 2.38), 'stone_basalt')
    b.box((-0.58, -0.28, 2.38), (0.58, 0.28, 2.62), 'hold_bronze')
    b.box((-0.34, -0.27, 0.85), (0.34, 0.27, 1.95), 'gold')
    for bx in (-0.54, 0.54):
        b.lathe([(0.0, 0.36), (0.14, 0.4), (0.18, 0.58), (0.0, 0.52)], 8, 'hold_bronze', m=_m(x=bx, y=-0.34))
        b.blob((bx, -0.34, 0.6), 0.11, 'glow', subdiv=1)
    return b


# =========================================================================
# UMBRA'KOR (5 detailed meshes)
# =========================================================================
def umbrakor_spider_silk_obelisk():
    b = MeshBuilder()
    _skirt(b, 0.66, 0.66, 'stone_basalt', 'stone_dark', 6, 41)
    b.lathe([(0.56, 0.04), (0.52, 0.34), (0.4, 0.42)], 6, 'stone_basalt', smooth=False)
    b.lathe([(0.28, 0.42), (0.18, 2.2), (0.0, 2.95)], 6, 'stone_dark', smooth=False)
    for hz in (0.95, 1.48, 2.02):
        b.lathe([(0.29, hz - 0.03), (0.31, hz), (0.29, hz + 0.03)], 6, 'cloth_cream', smooth=False)
    for k in range(3):
        a = k * 2 * math.pi / 3
        b.beam((0.36 * math.cos(a), 0.36 * math.sin(a), 0.42), (0.14 * math.cos(a + 0.8), 0.14 * math.sin(a + 0.8), 2.1), (0, 0, 1), (-0.025, 0.025), 0.05, 'iron')
        b.beam((0.28 * math.cos(a), 0.28 * math.sin(a), 1.48), (0.18 * math.cos(a - 0.9), 0.18 * math.sin(a - 0.9), 2.42), (0, 0, 1), (-0.02, 0.02), 0.035, 'iron')
    b.blob((0.0, 0.0, 2.58), 0.14, 'glow', subdiv=1)
    return b


def umbrakor_bioluminescent_cap_shrine():
    b = MeshBuilder()
    b.lathe([(0.58, -0.05), (0.54, 0.36), (0.42, 0.44)], 8, 'stone_basalt', smooth=False)
    b.lathe([(0.16, 0.44), (0.11, 1.25), (0.14, 1.85)], 8, 'plaster')
    b.lathe([(0.0, 2.38), (0.46, 2.24), (0.82, 1.86), (0.76, 1.76), (0.0, 1.92)], 12, 'cloth_blue')
    b.blob((0.0, 0.0, 1.78), 0.24, 'glow', subdiv=1, squash=(1.2, 1.2, 0.4))
    return b


def umbrakor_wrought_censer_gallows():
    b = MeshBuilder()
    b.lathe([(0.44, -0.05), (0.40, 0.24), (0.30, 0.42), (0.26, 0.56)], 8, 'stone_basalt', smooth=False)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        b.beam((0.30 * math.cos(a), 0.30 * math.sin(a), 0.38), (0.06 * math.cos(a), 0.06 * math.sin(a), 1.06), (0, 0, 1), (-0.025, 0.025), 0.055, 'iron')
    b.box((-0.07, -0.07, 0.54), (0.07, 0.07, 2.74), 'iron')
    for rz in (1.12, 1.88):
        b.box((-0.095, -0.095, rz), (0.095, 0.095, rz + 0.06), 'bronze')
    b.lathe([(0.0, 2.74), (0.055, 2.86), (0.015, 3.12)], 6, 'iron', smooth=False)
    b.beam((0.0, 0.0, 2.2), (0.72, 0.0, 2.75), (0, 1, 0), (-0.04, 0.04), 0.08, 'iron')
    b.beam((0.04, 0.0, 1.92), (0.46, 0.0, 2.52), (0, 1, 0), (-0.02, 0.02), 0.04, 'bronze')
    b.beam((0.04, 0.0, 2.48), (0.36, 0.0, 2.74), (0, 1, 0), (-0.02, 0.02), 0.035, 'iron')
    for cz in (2.22, 2.42, 2.62):
        b.box((0.675, -0.025, cz), (0.725, 0.025, cz + 0.12), 'iron')
    b.lathe([(0.0, 1.72), (0.18, 1.94), (0.14, 2.12), (0.0, 2.16)], 8, 'bronze', m=_m(x=0.7), smooth=False)
    for k in range(4):
        ca = k * math.pi / 2
        b.beam((0.7 + 0.14 * math.cos(ca), 0.14 * math.sin(ca), 1.80), (0.7 + 0.14 * math.cos(ca), 0.14 * math.sin(ca), 2.16), (0, 0, 1), (-0.015, 0.015), 0.03, 'iron')
    b.blob((0.7, 0.0, 1.96), 0.11, 'glow', subdiv=1)
    return b


def umbrakor_night_market_canopy():
    b = MeshBuilder()
    b.box((-0.92, -0.56, -0.05), (0.92, 0.56, 0.12), 'stone_basalt', skip=('-z',))
    for cx in (-0.78, 0.78):
        for cy in (-0.42, 0.42):
            b.box((cx - 0.05, cy - 0.05, 0.12), (cx + 0.05, cy + 0.05, 2.18), 'iron')
    b.box((-0.76, -0.34, 0.12), (0.76, 0.34, 0.88), 'timber_dark')
    b.extrude([(-0.96, 0.0, 2.58), (-0.96, -0.62, 2.12), (-0.96, 0.62, 2.12)], (1.92, 0, 0), 'cloth_blue')
    b.blob((-0.38, -0.04, 1.02), 0.12, 'glow', subdiv=1)
    b.blob((0.38, 0.06, 1.02), 0.12, 'glow', subdiv=1)
    return b


def umbrakor_abyssal_waystone():
    b = MeshBuilder()
    b.lathe([(0.68, -0.05), (0.64, 0.24), (0.48, 0.38)], 6, 'stone_dark', smooth=False)
    b.lathe([(0.34, 0.38), (0.28, 1.76), (0.12, 2.18), (0.0, 2.38)], 6, 'stone_basalt', smooth=False)
    b.box((-0.38, -0.04, 1.18), (0.38, 0.04, 1.32), 'iron')
    b.blob((0.0, 0.0, 1.48), 0.18, 'glow', subdiv=1, squash=(0.9, 0.9, 1.5))
    return b


CITY_MODULES = (
    ('Tudor_Market_Pavilion', tudor_market_pavilion),
    ('Tudor_Dovecote_Post', tudor_dovecote_post),
    ('Tudor_Flower_Trellis_Arch', tudor_flower_trellis_arch),
    ('Tudor_Watch_Lantern_Gallows', tudor_watch_lantern_gallows),
    ('Tudor_Guild_Display_Cart', tudor_guild_display_cart),
    ('Nordic_Dragon_Totem_Post', nordic_dragon_totem_post),
    ('Nordic_Brewery_Cask_Rack', nordic_brewery_cask_rack),
    ('Nordic_Mead_Hall_Brazier', nordic_mead_hall_brazier),
    ('Nordic_Furs_Tanning_Frame', nordic_furs_tanning_frame),
    ('Nordic_Skiff_Drydock_Hull', nordic_skiff_drydock_hull),
    ('Med_Amphora_Terrace_Stand', med_amphora_terrace_stand),
    ('Med_Cypress_Urn_Planter', med_cypress_urn_planter),
    ('Med_Sun_Arbor_Pergola', med_sun_arbor_pergola),
    ('Med_Marble_Lion_Fountain', med_marble_lion_fountain),
    ('Med_Merchant_Scale_Counter', med_merchant_scale_counter),
    ('Goblin_Scrap_Still_Boiler', goblin_scrap_still_boiler),
    ('Goblin_Cage_Spike_Gibbet', goblin_cage_spike_gibbet),
    ('Goblin_Salvage_Trophy_Totem', goblin_salvage_trophy_totem),
    ('Goblin_Bog_Mushroom_Coop', goblin_bog_mushroom_coop),
    ('Goblin_Tinker_Scrap_Cart', goblin_tinker_scrap_cart),
    ('Orc_Warchief_Drum_Pavilion', orc_warchief_drum_pavilion),
    ('Orc_Bone_Spike_Barricade', orc_bone_spike_barricade),
    ('Orc_Forge_Quench_Anvil_Rig', orc_forge_quench_anvil_rig),
    ('Orc_Hide_Rack_Trophy_Frame', orc_hide_rack_trophy_frame),
    ('Orc_Charred_Idol_Pillar', orc_charred_idol_pillar),
    ('Frostgard_Ice_Saw_Rack', frostgard_ice_saw_rack),
    ('Frostgard_Hearth_Kettle_Shelter', frostgard_hearth_kettle_shelter),
    ('Frostgard_Runic_Lantern_Post', frostgard_runic_lantern_post),
    ('Frostgard_Wolf_Pelt_Sled', frostgard_wolf_pelt_sled),
    ('Frostgard_Rime_Shrine_Cairn', frostgard_rime_shrine_cairn),
    ('Stonehold_Steam_Exhaust_Monument', stonehold_steam_exhaust_monument),
    ('Stonehold_Rune_Forge_Pedestal', stonehold_rune_forge_pedestal),
    ('Stonehold_Aqueduct_Spout', stonehold_aqueduct_spout),
    ('Stonehold_Ore_Classifier_Chute', stonehold_ore_classifier_chute),
    ('Stonehold_Ancestral_Stele', stonehold_ancestral_stele),
    ('Umbrakor_Spider_Silk_Obelisk', umbrakor_spider_silk_obelisk),
    ('Umbrakor_Bioluminescent_Cap_Shrine', umbrakor_bioluminescent_cap_shrine),
    ('Umbrakor_Wrought_Censer_Gallows', umbrakor_wrought_censer_gallows),
    ('Umbrakor_Night_Market_Canopy', umbrakor_night_market_canopy),
    ('Umbrakor_Abyssal_Waystone', umbrakor_abyssal_waystone),
)


_SKIRT_SPEC = {
    'Tudor_': ('cobble', 'earth'),
    'Nordic_': ('stone_granite', 'earth'),
    'Med_': ('stone_dressed', 'cobble'),
    'Goblin_': ('stone_dark', 'earth'),
    'Orc_': ('stone_dark', 'rock'),
    'Frostgard_': ('stone_granite', 'snow'),
    'Stonehold_': ('stone_flag', 'rock'),
    'Umbrakor_': ('stone_basalt', 'stone_dark'),
}
_HAS_EXPLICIT_SKIRT = {
    'Tudor_Market_Pavilion',
    'Frostgard_Ice_Saw_Rack',
    'Stonehold_Steam_Exhaust_Monument',
    'Umbrakor_Spider_Silk_Obelisk',
}


def _apply_grounding_skirt(name, b):
    enhance_city_ground_contact(name, b, _SKIRT_SPEC, _HAS_EXPLICIT_SKIRT)


def define(kit):
    for name, fn in CITY_MODULES:
        b = fn()
        _apply_grounding_skirt(name, b)
        finalize_city_prop(name, b)
        kit.define(name, 'props', b)
