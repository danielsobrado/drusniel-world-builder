"""Furniture layouts per building type and story (story-local coordinates).

Every layout respects three walkability invariants:
  1. The ground-floor doorway cell (`spec.door`) has an unobstructed entry zone.
  2. Active stair flights (`k + 1 < len(spec.stories)`) keep their full 2 m column clear.
  3. Upper-floor stairwell openings and top landings (`k > 0`) keep their 2 m column clear.
"""
import math

from .config import GRID, HALF_T as T, STORY

FLOOR_Z = 0.06
HIGH_DECOR = {'Chandelier', 'Wall_Sconce', 'Wall_Shield', 'Wall_Tapestry'}


def _room_span(spec, k):
    """Usable X interval (x0, x1) on story `k` outside any stair/landing columns."""
    n = len(spec.stories)
    x0, x1 = 0.0, spec.w * GRID
    if spec.floors and k + 1 < n:
        if k % 2 == 0:
            x0 = max(x0, GRID)
        else:
            x1 = min(x1, (spec.w - 1) * GRID)
    if spec.floors and k > 0:
        if (k - 1) % 2 == 0:
            x0 = max(x0, GRID)
        else:
            x1 = min(x1, (spec.w - 1) * GRID)
    return x0, x1


def _clear(spec, k, name, x, y):
    if name in HIGH_DECOR or name == 'Rug':
        return True
    width, depth = spec.w * GRID, spec.d * GRID
    if x < 0.35 or x > width - 0.35 or y < 0.32 or y > depth - 0.15:
        return False
    if k == 0:
        door_x = (spec.door + 0.5) * GRID
        if abs(x - door_x) < 0.92 and y < 1.55:
            return False
    x0, x1 = _room_span(spec, k)
    if x < x0 + 0.28 or x > x1 - 0.28:
        return False
    return True


def _place(kit, coll, story, spec, k, name, x, y, z=0.0, rot=0.0):
    if _clear(spec, k, name, x, y):
        kit.place(name, coll, story, (x, y, z), rot)


def _dining(kit, coll, story, spec, k, x, y, z):
    if not _clear(spec, k, 'Table', x, y):
        return
    _place(kit, coll, story, spec, k, 'Table', x, y, z)
    _place(kit, coll, story, spec, k, 'Bench', x, y - 0.72, z)
    _place(kit, coll, story, spec, k, 'Bench', x, y + 0.72, z)


def _wall_decor(kit, coll, story, spec, k, x0, x1, back):
    """Hang sconces, shields or tapestries on the back wall and a chandelier overhead."""
    span = x1 - x0
    if span < 1.8:
        return
    mid = (x0 + x1) / 2
    if k == 0 and spec.furnish in ('inn', 'church', 'keep', 'shop', 'apothecary', 'library'):
        _place(kit, coll, story, spec, k, 'Chandelier', mid, spec.d * GRID / 2, STORY - 0.22)
    if span >= 3.2:
        _place(kit, coll, story, spec, k, 'Wall_Sconce', x0 + 0.75, back - 0.02, 1.85)
        _place(kit, coll, story, spec, k, 'Wall_Sconce', x1 - 0.75, back - 0.02, 1.85)
    if spec.furnish in ('keep', 'inn') and span >= 3.6:
        _place(kit, coll, story, spec, k, 'Wall_Shield', mid, back - 0.02, 1.95)
    elif spec.furnish in ('church', 'house', 'shop', 'library') and span >= 3.6 and k > 0:
        _place(kit, coll, story, spec, k, 'Wall_Tapestry', mid, back - 0.02, 1.95)


def _furnish_church(kit, coll, story, spec, z, back):
    width = spec.w * GRID
    mid = width / 2
    _place(kit, coll, story, spec, 0, 'Stone_Altar', mid, back - 0.75, z)
    _place(kit, coll, story, spec, 0, 'Candelabra', mid - 1.25, back - 0.7, z)
    _place(kit, coll, story, spec, 0, 'Candelabra', mid + 1.25, back - 0.7, z)
    _place(kit, coll, story, spec, 0, 'Lectern', mid + 0.95, back - 1.65, z, math.pi)
    _place(kit, coll, story, spec, 0, 'Rug', mid, back - 2.1, z)
    _place(kit, coll, story, spec, 0, 'Wall_Tapestry', mid - 1.6, back - 0.02, 2.05)
    _place(kit, coll, story, spec, 0, 'Wall_Tapestry', mid + 1.6, back - 0.02, 2.05)
    for cx in (mid - 1.8, mid + 1.8):
        _place(kit, coll, story, spec, 0, 'Chandelier', cx, spec.d * GRID / 2, STORY * 1.45)
    rows = (2.1, 3.25) if spec.d >= 3 else (1.9,)
    for y in rows:
        for side in (-1, 1):
            px = mid + side * max(1.45, width * 0.24)
            _place(kit, coll, story, spec, 0, 'Pew', px, y, z)


def _furnish_smithy(kit, coll, story, spec, k, z, x0, x1, back):
    if k > 0:
        _furnish_upper_living(kit, coll, story, spec, k, z, x0, x1, back)
        return
    mid = (x0 + x1) / 2
    _place(kit, coll, story, spec, k, 'Forge_Hood', x1 - 1.1, back - 0.32, z)
    _place(kit, coll, story, spec, k, 'Anvil_Block', x1 - 1.2, max(1.65, back - 1.55), z, 0.35)
    _place(kit, coll, story, spec, k, 'Barrel', x1 - 2.1, back - 0.45, z)
    _place(kit, coll, story, spec, k, 'Weapon_Rack', x0 + 0.85, back - 0.26, z)
    _place(kit, coll, story, spec, k, 'Shelf', mid - 0.3, back - 0.18, z)
    _place(kit, coll, story, spec, k, 'Crate', x0 + 0.65, 1.35, z, 0.2)


def _furnish_bakery(kit, coll, story, spec, k, z, x0, x1, back):
    if k > 0:
        _furnish_upper_living(kit, coll, story, spec, k, z, x0, x1, back)
        return
    _place(kit, coll, story, spec, k, 'Bake_Oven', x1 - 1.0, back - 0.34, z)
    _place(kit, coll, story, spec, k, 'Flour_Sacks', x1 - 2.05, back - 0.42, z, 0.2)
    _place(kit, coll, story, spec, k, 'Counter', x0 + 1.15, max(1.65, back - 1.5), z)
    _place(kit, coll, story, spec, k, 'Shelf', x0 + 0.85, back - 0.18, z)
    _place(kit, coll, story, spec, k, 'Barrel', x1 - 0.55, 1.25, z)


def _furnish_apothecary(kit, coll, story, spec, k, z, x0, x1, back):
    if k > 0:
        _furnish_upper_study(kit, coll, story, spec, k, z, x0, x1, back)
        return
    mid = (x0 + x1) / 2
    _place(kit, coll, story, spec, k, 'Alchemist_Table', mid, max(1.75, back - 1.45), z)
    _place(kit, coll, story, spec, k, 'Bookcase', x0 + 0.85, back - 0.2, z)
    _place(kit, coll, story, spec, k, 'Shelf', x1 - 0.85, back - 0.18, z)
    _place(kit, coll, story, spec, k, 'Rug', mid, max(1.75, back - 1.45), z)
    if x1 - x0 >= 4.5:
        _place(kit, coll, story, spec, k, 'Counter', x1 - 1.2, 1.85, z)
        _place(kit, coll, story, spec, k, 'Chest', x0 + 0.65, 1.35, z)


def _furnish_shop(kit, coll, story, spec, k, z, x0, x1, back):
    if k > 0:
        _furnish_upper_living(kit, coll, story, spec, k, z, x0, x1, back)
        return
    mid = (x0 + x1) / 2
    _place(kit, coll, story, spec, k, 'Counter', mid + 0.2, max(1.75, back - 1.45), z)
    _place(kit, coll, story, spec, k, 'Shelf', x0 + 0.85, back - 0.18, z)
    _place(kit, coll, story, spec, k, 'Bookcase', x1 - 0.85, back - 0.2, z)
    _place(kit, coll, story, spec, k, 'Rug', mid, max(1.8, back - 1.6), z)
    _place(kit, coll, story, spec, k, 'Chest', x1 - 0.65, 1.25, z, -0.3)
    _place(kit, coll, story, spec, k, 'Barrel', x0 + 0.55, 1.35, z)


def _furnish_library(kit, coll, story, spec, k, z, x0, x1, back):
    if k > 0:
        _furnish_upper_study(kit, coll, story, spec, k, z, x0, x1, back)
        return
    mid = (x0 + x1) / 2
    _place(kit, coll, story, spec, k, 'Bookcase', x0 + 0.85, back - 0.2, z)
    _place(kit, coll, story, spec, k, 'Bookcase', x1 - 0.85, back - 0.2, z)
    if x1 - x0 >= 4.5:
        _place(kit, coll, story, spec, k, 'Bookcase', mid, back - 0.2, z)
    _place(kit, coll, story, spec, k, 'Writing_Desk', x0 + 1.15, max(1.8, back - 1.55), z)
    _place(kit, coll, story, spec, k, 'Stool', x0 + 1.15, max(1.25, back - 2.1), z)
    _place(kit, coll, story, spec, k, 'Lectern', x1 - 1.15, max(1.8, back - 1.55), z, math.pi)
    _place(kit, coll, story, spec, k, 'Candelabra', mid, max(1.8, back - 1.4), z)
    _place(kit, coll, story, spec, k, 'Rug', mid, spec.d * GRID / 2, z)


def _furnish_keep(kit, coll, story, spec, k, z, x0, x1, back):
    mid = (x0 + x1) / 2
    if k == 0:
        _place(kit, coll, story, spec, k, 'Hearth', x1 - 1.1, back - 0.3, z)
        _place(kit, coll, story, spec, k, 'Weapon_Rack', x0 + 0.85, back - 0.26, z)
        _place(kit, coll, story, spec, k, 'Rug', mid, spec.d * GRID / 2, z)
        _dining(kit, coll, story, spec, k, mid, spec.d * GRID / 2, z)
        _place(kit, coll, story, spec, k, 'Chest', x1 - 0.65, 1.25, z)
    elif k == 1:
        _place(kit, coll, story, spec, k, 'Weapon_Rack', x0 + 0.85, back - 0.26, z)
        _place(kit, coll, story, spec, k, 'Bed', x1 - 0.75, back - 1.05, z)
        _place(kit, coll, story, spec, k, 'Chest', mid, back - 0.42, z)
        _place(kit, coll, story, spec, k, 'Rug', mid, spec.d * GRID / 2, z)
    else:
        _furnish_upper_study(kit, coll, story, spec, k, z, x0, x1, back)


def _furnish_store(kit, coll, story, spec, k, z, x0, x1, back):
    if k > 0:
        _place(kit, coll, story, spec, k, 'Flour_Sacks', x0 + 0.75, back - 0.45, z)
        _place(kit, coll, story, spec, k, 'Crate', x1 - 0.65, back - 0.48, z)
        _place(kit, coll, story, spec, k, 'Barrel', (x0 + x1) / 2, back - 0.48, z)
        return
    _place(kit, coll, story, spec, k, 'Cask_Rack', x0 + 0.9, back - 0.38, z)
    _place(kit, coll, story, spec, k, 'Flour_Sacks', (x0 + x1) / 2, back - 0.42, z)
    _place(kit, coll, story, spec, k, 'Crate', x1 - 0.6, back - 0.5, z)
    _place(kit, coll, story, spec, k, 'Crate', x1 - 0.6, back - 0.5, z + 0.7, 0.4)
    for x, y in ((x1 - 0.6, 0.8), (x1 - 0.6, 1.55), (x1 - 1.35, 0.8)):
        _place(kit, coll, story, spec, k, 'Barrel', x, y, z)


def _furnish_inn(kit, coll, story, spec, k, z, x0, x1, back):
    mid = (x0 + x1) / 2
    if k == 0:
        _place(kit, coll, story, spec, k, 'Hearth', x1 - 1.1, back - 0.3, z)
        _place(kit, coll, story, spec, k, 'Stool', x1 - 2.0, back - 1.05, z)
        _place(kit, coll, story, spec, k, 'Rug', x1 - 1.1, back - 1.55, z)
        _place(kit, coll, story, spec, k, 'Cask_Rack', x0 + 0.9, back - 0.38, z)
        _place(kit, coll, story, spec, k, 'Counter', x0 + 1.25, max(1.85, back - 1.45), z)
        tables = max(1, int((x1 - x0 - 2.2) // 2.2))
        for i in range(tables):
            tx = x0 + 2.8 + i * 2.15
            _dining(kit, coll, story, spec, k, tx, 2.15, z)
        _place(kit, coll, story, spec, k, 'Barrel', x1 - 0.55, 1.15, z)
    else:
        _place(kit, coll, story, spec, k, 'Bed', x0 + 0.75, back - 1.05, z)
        _place(kit, coll, story, spec, k, 'Wardrobe', x1 - 0.75, back - 0.28, z)
        _place(kit, coll, story, spec, k, 'Rug', mid, spec.d * GRID / 2, z)
        if x1 - x0 >= 3.8:
            _place(kit, coll, story, spec, k, 'Bed', mid + 0.2, back - 1.05, z)
            _place(kit, coll, story, spec, k, 'Chest', x0 + 0.75, 1.25, z)
        if k >= 2 and x1 - x0 >= 3.5:
            _place(kit, coll, story, spec, k, 'Writing_Desk', x1 - 1.1, 1.55, z, math.pi)


def _furnish_upper_study(kit, coll, story, spec, k, z, x0, x1, back):
    mid = (x0 + x1) / 2
    _place(kit, coll, story, spec, k, 'Bookcase', x0 + 0.85, back - 0.2, z)
    _place(kit, coll, story, spec, k, 'Writing_Desk', mid, back - 0.45, z)
    _place(kit, coll, story, spec, k, 'Stool', mid, back - 1.0, z)
    _place(kit, coll, story, spec, k, 'Bed', x1 - 0.75, back - 1.05, z)
    _place(kit, coll, story, spec, k, 'Rug', mid, spec.d * GRID / 2, z)
    _place(kit, coll, story, spec, k, 'Chest', x0 + 0.75, 1.2, z)


def _furnish_upper_living(kit, coll, story, spec, k, z, x0, x1, back):
    mid = (x0 + x1) / 2
    _place(kit, coll, story, spec, k, 'Bed', mid, back - 1.05, z)
    _place(kit, coll, story, spec, k, 'Rug', mid, spec.d * GRID / 2, z)
    if x1 - x0 >= 3.2:
        _place(kit, coll, story, spec, k, 'Wardrobe', x1 - 0.75, back - 0.28, z)
        _place(kit, coll, story, spec, k, 'Chest', x0 + 0.75, back - 0.42, z)
    if x1 - x0 >= 4.8:
        _place(kit, coll, story, spec, k, 'Writing_Desk', x0 + 0.9, 1.45, z, math.pi)
        _place(kit, coll, story, spec, k, 'Bookcase', x1 - 1.85, back - 0.2, z)


def furnish_story(kit, coll, story, spec, k):
    if spec.furnish == 'none':
        return
    width, depth = spec.w * GRID, spec.d * GRID
    back = depth - T
    z = FLOOR_Z if k == 0 else 0.0
    if spec.furnish == 'church':
        if k == 0:
            _furnish_church(kit, coll, story, spec, z, back)
        return
    x0, x1 = _room_span(spec, k)
    if x1 - x0 < 1.5:
        return
    _wall_decor(kit, coll, story, spec, k, x0, x1, back)
    role = spec.furnish
    if role == 'smithy':
        _furnish_smithy(kit, coll, story, spec, k, z, x0, x1, back)
    elif role == 'bakery':
        _furnish_bakery(kit, coll, story, spec, k, z, x0, x1, back)
    elif role == 'apothecary':
        _furnish_apothecary(kit, coll, story, spec, k, z, x0, x1, back)
    elif role == 'shop':
        _furnish_shop(kit, coll, story, spec, k, z, x0, x1, back)
    elif role == 'library':
        _furnish_library(kit, coll, story, spec, k, z, x0, x1, back)
    elif role == 'keep':
        _furnish_keep(kit, coll, story, spec, k, z, x0, x1, back)
    elif role == 'store':
        _furnish_store(kit, coll, story, spec, k, z, x0, x1, back)
    elif role == 'inn':
        _furnish_inn(kit, coll, story, spec, k, z, x0, x1, back)
    elif k == 0:
        mid = (x0 + x1) / 2
        _place(kit, coll, story, spec, k, 'Hearth', x1 - 1.1, back - 0.3, z)
        _place(kit, coll, story, spec, k, 'Stool', x1 - 2.0, back - 1.05, z)
        _place(kit, coll, story, spec, k, 'Rug', x1 - 1.1, back - 1.55, z)
        if spec.d >= 3:
            _place(kit, coll, story, spec, k, 'Shelf', x0 + 0.85, back - 0.18, z)
            _place(kit, coll, story, spec, k, 'Chest', x0 + 0.75, 1.35, z)
        _dining(kit, coll, story, spec, k, mid, max(1.85, depth / 2 - 0.1), z)
    elif spec.floors:
        _furnish_upper_living(kit, coll, story, spec, k, z, x0, x1, back)
