"""Module registry: defines kit pieces once and places them as linked duplicates.

Every placed piece shares its mesh with the catalog module, so the town is a
pure instancing of the kit (one mesh per module in the glTF, any number of
nodes). Groups are empties, so a building, a story or a roof can be moved like
a lego brick together with everything parented to it.
"""
import math

import bpy
from mathutils import Vector

from . import mesh as kit_mesh
from .config import GRID


def _collection(name, parent):
    coll = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if coll.name not in parent.children:
        parent.children.link(coll)
    return coll


class Kit:
    def __init__(self):
        scene_root = bpy.context.scene.collection
        self.catalog = _collection('Kit', scene_root)
        self.town = _collection('Town', scene_root)
        self.modules = {}

    def collection(self, name, under=None):
        return _collection(name, under or self.town)

    # -- definition ---------------------------------------------------------
    def define(self, name, category, builder):
        coll = _collection(f'Kit_{category}', self.catalog)
        obj = bpy.data.objects.new(name, builder.to_mesh(name))
        coll.objects.link(obj)
        obj['kit_category'] = category
        self.modules[name] = obj
        return obj

    # -- placement ------------------------------------------------------------
    def group(self, name, coll, parent=None, loc=(0, 0, 0), rotq=0):
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_type = 'PLAIN_AXES'
        empty.empty_display_size = 0.5
        coll.objects.link(empty)
        empty.parent = parent
        empty.location = loc
        empty.rotation_euler.z = rotq * math.pi / 2
        return empty

    def place(self, name, coll, parent=None, loc=(0, 0, 0), rot=0.0):
        src = self.modules[name]
        obj = bpy.data.objects.new(name, src.data)
        coll.objects.link(obj)
        obj.parent = parent
        obj.location = loc
        obj.rotation_euler.z = rot
        obj['kit_module'] = name
        return obj

    def place_q(self, name, coll, parent, loc, rotq):
        return self.place(name, coll, parent, loc, rotq * math.pi / 2)


def footprint_origin(cx, cy, w, d, rotq):
    """Origin that puts a local w x d cell footprint (rotated rotq quarter turns)
    with its minimum corner on cell (cx, cy)."""
    m = kit_mesh.rot_z(rotq * math.pi / 2)
    corners = [m @ Vector((x, y, 0))
               for x in (0, w * GRID) for y in (0, d * GRID)]
    min_x = min(c.x for c in corners)
    min_y = min(c.y for c in corners)
    return cx * GRID - min_x, cy * GRID - min_y


def footprint_cells(cx, cy, w, d, rotq):
    fw, fd = (w, d) if rotq % 2 == 0 else (d, w)
    return {(cx + i, cy + j) for i in range(fw) for j in range(fd)}
