"""Furniture layouts per building type and story (story-local coordinates).

Ground floors keep the front-left two cells clear for the stairs (side 'L').
"""
from .config import GRID, HALF_T as T

FLOOR_Z = 0.06


def _place(kit, coll, story, name, x, y, z=0.0, rot=0.0):
    kit.place(name, coll, story, (x, y, z), rot)


def _dining(kit, coll, story, x, y, z):
    _place(kit, coll, story, 'Table', x, y, z)
    _place(kit, coll, story, 'Bench', x, y - 0.75, z)
    _place(kit, coll, story, 'Bench', x, y + 0.75, z)


def furnish_story(kit, coll, story, spec, k):
    if spec.furnish == 'none':
        return
    width, depth = spec.w * GRID, spec.d * GRID
    back = depth - T
    z = FLOOR_Z if k == 0 else 0.0
    if spec.furnish == 'church':
        if k == 0:
            for y in (2.2, 3.4, 4.6):
                for x in (width / 2 - 2.0, width / 2 + 2.0):
                    _place(kit, coll, story, 'Bench', x, y, z)
            _place(kit, coll, story, 'Table', width / 2, back - 0.8, z)
            _place(kit, coll, story, 'Rug', width / 2, back - 2.0, z)
        return
    if spec.furnish == 'store':
        if k == 0:
            for x, y in ((width - 0.6, 0.6), (width - 0.6, 1.4), (width - 1.4, 0.6)):
                _place(kit, coll, story, 'Barrel', x, y, z)
            _place(kit, coll, story, 'Crate', width - 0.6, back - 0.5, z)
            _place(kit, coll, story, 'Crate', width - 0.6, back - 0.5, z + 0.7, 0.4)
        return
    if k == 0:
        _place(kit, coll, story, 'Hearth', width - 1.1, back - 0.3, z)
        _place(kit, coll, story, 'Rug', width - 1.1, back - 1.6, z)
        if spec.d >= 3:
            _place(kit, coll, story, 'Shelf', 1.0, back - 0.15, z)
        if spec.furnish == 'inn':
            for i in range(spec.w - 2):
                _dining(kit, coll, story, 3.0 + i * 2.2, 2.0, z)
            _place(kit, coll, story, 'Barrel', 0.6, back - 0.5, z)
            _place(kit, coll, story, 'Barrel', 1.25, back - 0.45, z)
        else:
            _dining(kit, coll, story, width / 2 + 0.5, depth / 2 - 0.2, z)
    elif spec.floors:
        # Upper floors: the outer columns may hold a stairwell (from below) or
        # the next flight up, so beds stay in the middle of the back wall.
        _place(kit, coll, story, 'Bed', width / 2, back - 1.05, z)
        if spec.w >= 3:
            _place(kit, coll, story, 'Crate', width / 2 + 1.0, back - 0.45, z)
        if spec.furnish == 'inn' and spec.w >= 4:
            _place(kit, coll, story, 'Bed', width / 2 - 1.3, back - 1.05, z)
