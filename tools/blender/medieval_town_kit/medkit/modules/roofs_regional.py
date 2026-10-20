"""Regional roof sets on the shared gable machinery (roofs.py), plus their gable walls.

- Thatch (Grukmar orc halls): low 35 deg pitch, thick reed thatch, deep eaves; the gable
  is vertical dark boarding with a smoke outlet under the apex (the shared hearth).
- Sod (Frostgard homes): 40 deg, a turf mat held by a log along each eave.
- Slate (Frostgard halls): the 60 deg pitch of the Nordic roof, without its carving.
Frostgard gables are horizontal logs like the walls under them.
"""
import math

from ..config import HALF_T as T, ROOF_SPANS, detailed
from ..mesh import MeshBuilder
from .roofs import STEEP_PITCH, Covering, gable_eave_end, gable_section, pyramid, ridge_height
from .walls_frontier import LOG_H

THATCH_PITCH = math.radians(35)
SOD_PITCH = math.radians(40)
THATCH = Covering('thatch_reed', thick=0.34, overhang=0.95, ornate=False, edge='thatch_reed')
SOD = Covering('sod', thick=0.22, overhang=0.5, ornate=False, eave_log=True, edge='sod')
SLATE_PLAIN = Covering(ornate=False)
# style -> (section, end, gable wall, pitch); RoofAssembler places them like the core sets.
REGIONAL_GABLES = {
    'thatch_low': ('Roof_Thatch', 'Roof_Thatch_End', 'Gable_Wall_Orc', THATCH_PITCH),
    'sod': ('Roof_Sod', 'Roof_Sod_End', 'Gable_Wall_Log', SOD_PITCH),
    'steep_log': ('Roof_Slate', 'Roof_Slate_End', 'Gable_Wall_Log_Steep', STEEP_PITCH),
}
PYRAMID_THATCH_PITCH = 40


def _triangle(b, span, h, mat, x0=-0.08):
    b.extrude([(x0, 0, 0), (x0, span, 0), (x0, span / 2, h)], (T - x0, 0, 0), mat)


def orc_gable(span, pitch=THATCH_PITCH):
    """Vertical dark boards closing the gable (exterior -X at x=0), a smoke outlet under the apex."""
    b = MeshBuilder()
    h = ridge_height(span, pitch) - 0.02
    tan = math.tan(pitch)
    _triangle(b, span, h, 'timber_dark')
    b.box((-0.2, 0, 0), (-0.06, span, 0.26), 'timber_dark')
    n = int(span / 0.32)
    w = span / n
    for i in range(n):
        y0, y1 = i * w + 0.01, (i + 1) * w - 0.01
        top = (span / 2 - max(abs(y0 - span / 2), abs(y1 - span / 2))) * tan - 0.04
        if top > 0.34:
            b.box((-0.13 - 0.012 * (i % 2), y0, 0.26), (-0.07, y1, top), 'timber_dark', bevel=0.012)
    # Smoke outlet: a dark opening under a little board hood.
    hz = h - 0.95
    if hz > 0.5:
        b.box((-0.16, span / 2 - 0.3, hz), (-0.12, span / 2 + 0.3, hz + 0.42), 'shadow', bevel=0)
        b.box((-0.36, span / 2 - 0.42, hz + 0.42), (-0.1, span / 2 + 0.42, hz + 0.5), 'timber_dark')
    return b


def log_gable(span, pitch):
    """Horizontal logs stepping in with the roof line, moss chinking behind."""
    b = MeshBuilder()
    h = ridge_height(span, pitch) - 0.02
    tan = math.tan(pitch)
    _triangle(b, span, h, 'sod', x0=-0.04)
    z = 0.0
    while True:
        half = span / 2 - (z + LOG_H) / tan - 0.05
        if half < 0.25:
            break
        b.box((-0.12, span / 2 - half, z + 0.008), (T, span / 2 + half, z + LOG_H - 0.008), 'log')
        z += LOG_H
    if detailed() and h > 2.4:
        # A small loft hatch for winter stores.
        b.box((-0.16, span / 2 - 0.32, 1.1), (-0.11, span / 2 + 0.32, 1.75), 'planks')
        b.box((-0.18, span / 2 - 0.4, 1.75), (-0.1, span / 2 + 0.4, 1.86), 'timber')
    return b


def define(kit):
    for span in ROOF_SPANS:
        kit.define(f'Roof_Thatch_S{span}', 'roofs', gable_section(span, THATCH_PITCH, THATCH))
        kit.define(f'Roof_Thatch_End_S{span}', 'roofs', gable_eave_end(span, THATCH_PITCH, THATCH))
        kit.define(f'Gable_Wall_Orc_S{span}', 'roofs', orc_gable(span))
        kit.define(f'Roof_Sod_S{span}', 'roofs', gable_section(span, SOD_PITCH, SOD))
        kit.define(f'Roof_Sod_End_S{span}', 'roofs', gable_eave_end(span, SOD_PITCH, SOD))
        kit.define(f'Gable_Wall_Log_S{span}', 'roofs', log_gable(span, SOD_PITCH))
        kit.define(f'Roof_Slate_S{span}', 'roofs', gable_section(span, STEEP_PITCH, SLATE_PLAIN))
        kit.define(f'Roof_Slate_End_S{span}', 'roofs', gable_eave_end(span, STEEP_PITCH, SLATE_PLAIN))
        kit.define(f'Gable_Wall_Log_Steep_S{span}', 'roofs', log_gable(span, STEEP_PITCH))
    for size in (4, 6):
        kit.define(f'Roof_Pyramid_Thatch_{size}', 'roofs',
                   pyramid(float(size), PYRAMID_THATCH_PITCH, mat='thatch_reed', finial=False))
