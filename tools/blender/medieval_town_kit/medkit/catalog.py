"""Defines every kit module and lays the catalog out in rows for browsing."""
from mathutils import Vector

from .kit import Kit
from .modules import (accents, defences, floors, foundations, interior, nature, props, roof_shapes, roofs,
                      terrain, towers, walls, walls_regional)

FAMILIES = (walls, walls_regional, foundations, floors, roofs, roof_shapes, terrain, defences, towers, props,
            nature, interior, accents)
CATALOG_ORIGIN = Vector((0.0, -24.0, 0.0))
# Modules only seen from inside a building; the game draws them only near the viewer.
INTERIOR = {'Floor_Ground', 'Floor_Planks', 'Floor_Stairwell_L', 'Floor_Stairwell_R',
            'Stairs_Interior_L', 'Stairs_Interior_R', 'Table', 'Bed', 'Hearth', 'Shelf', 'Rug'}


def _layout(kit):
    rows = {}
    for obj in kit.modules.values():
        rows.setdefault(obj['kit_category'], []).append(obj)
    y = CATALOG_ORIGIN.y
    for objs in rows.values():
        x, depth = CATALOG_ORIGIN.x, 0.0
        for obj in objs:
            xs = [v.co.x for v in obj.data.vertices]
            ys = [v.co.y for v in obj.data.vertices]
            obj.location = (x - min(xs), y - max(ys), 0)
            x += max(xs) - min(xs) + 1.0
            depth = max(depth, max(ys) - min(ys))
        y -= depth + 2.0


def build_kit():
    kit = Kit()
    for family in FAMILIES:
        family.define(kit)
    for name in INTERIOR & kit.modules.keys():
        kit.modules[name]['kit_interior'] = True
    _layout(kit)
    print(f'[kit] {len(kit.modules)} modules defined')
    return kit
