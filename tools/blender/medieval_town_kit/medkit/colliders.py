"""Collision boxes per kit module, in the module's own (Blender, Z-up) space.

Boxes are axis-aligned in module space; a placement only ever yaws a module,
so every box stays an upright box with a rotation about the vertical axis —
exactly what the game's primitive box colliders take. Purely decorative pieces
(roofs, gables, chimneys, dormers, ivy) have none: nobody can reach them.
"""
from .config import GRID, HALF_T as T, JETTY_LEVELS, STORY
from .modules.floors import RAIL_X, STAIR_X, WELL_X
from .modules.walls import DOOR, TIMBER_WINDOW, WINDOW
from .modules.walls_regional import ARCADE
from .modules import foundations as F


def _panel(hole):
    if hole is None:
        return [((0, -T, 0), (GRID, T, STORY))]
    x0, x1, z0, z1 = hole
    boxes = [((0, -T, 0), (x0, T, STORY)), ((x1, -T, 0), (GRID, T, STORY)),
             ((x0, -T, z1), (x1, T, STORY))]
    if z0 > 0:
        boxes.append(((x0, -T, 0), (x1, T, z0)))
    return boxes


def _stairs(side, steps=15):
    x0, x1 = STAIR_X[side]
    y0, y1 = T, 2 * GRID
    run, rise = (y1 - y0) / steps, STORY / steps
    return [((x0, y0 + i * run, 0), (x1, y1, (i + 1) * rise)) for i in range(steps)]


def _stairwell(side):
    x0, x1 = WELL_X[side]
    rail = RAIL_X[side]
    return [((x0, 0, -0.2), (x1, GRID, 0)), ((rail - 0.04, 0.15, 0), (rail + 0.04, GRID, 1.0))]


def _stone_stairs(units):
    from .config import TERRACE
    run, rise, steps = (units + 1) * GRID, units * TERRACE, units * 10
    tread, step_h = run / steps, rise / steps
    return [((0, i * tread, 0), (GRID, run, (i + 1) * step_h)) for i in range(steps)]


def _centred(w, d, h, y0=None):
    lo_y = -d / 2 if y0 is None else y0
    return [((-w / 2, lo_y, 0), (w / 2, lo_y + d, h))]


COLLIDERS = {
    'Wall_Stone': _panel(None),
    'Wall_Stone_Window': _panel(WINDOW),
    'Wall_Stone_Door': _panel(DOOR),
    'Wall_Timber': _panel(None),
    'Wall_Timber_Window': _panel(TIMBER_WINDOW),
    'Wall_Timber_Door': _panel(DOOR),
    # Jettied fronts keep the plain wall's interior face, so they collide like it.
    **{f'Wall_Timber_J{level}{suffix}': _panel(hole) for level in JETTY_LEVELS
       for suffix, hole in (('', None), ('_Window', TIMBER_WINDOW), ('_Door', DOOR))},
    **{f'Corner_Timber_J{level}_{side}': [((-0.17, -0.17, 0), (0.17, 0.17, STORY))]
       for level in JETTY_LEVELS for side in 'LR'},
    'Wall_Plank': _panel(None),
    'Wall_Plank_Window': _panel(TIMBER_WINDOW),
    'Wall_Plank_Door': _panel(DOOR),
    'Wall_Plaster': _panel(None),
    'Wall_Plaster_Window': _panel(WINDOW),
    'Wall_Plaster_Door': _panel(DOOR),
    'Wall_Arcade': _panel(ARCADE),
    'Wall_Curtain': [((0, -0.6, 0), (GRID, 0.6, 6.2))],
    'Tower_Round': [((-2.2, -2.2, 0), (2.2, 2.2, 9.7))],
    'Corner_Stone': [((-0.21, -0.21, 0), (0.21, 0.21, STORY))],
    'Corner_Timber': [((-0.17, -0.17, 0), (0.17, 0.17, STORY))],
    'Door_Leaf': [((0, -0.05, 0), (0.84, 0.05, 2.08))],
    'Floor_Planks': [((0, 0, -0.2), (GRID, GRID, 0))],
    'Floor_Ground': [((0, 0, 0), (GRID, GRID, 0.06))],
    'Floor_Stairwell_L': _stairwell('L'),
    'Floor_Stairwell_R': _stairwell('R'),
    'Stairs_Interior_L': _stairs('L'),
    'Stairs_Interior_R': _stairs('R'),
    'Stairs_Stone_1': _stone_stairs(1),
    'Stairs_Stone_2': _stone_stairs(2),
    'Lamp_Post': _centred(0.4, 0.4, 2.6),
    'Lamp_Post_Banner': _centred(0.4, 0.4, 2.6),
    'Fountain': _centred(3.2, 3.2, 0.6) + _centred(0.6, 0.6, 1.5),
    'Barrel': _centred(0.62, 0.62, 0.9),
    'Crate': _centred(0.7, 0.7, 0.7),
    'Well': _centred(2.0, 2.0, 0.8) + [((-0.95, -0.08, 0), (-0.85, 0.08, 2.35)),
                                      ((0.85, -0.08, 0), (0.95, 0.08, 2.35))],
    'Market_Stall_Cream': [((-1.15, -0.8, 0), (1.15, -0.1, 0.84)), ((-1.15, 0.6, 0), (1.15, 0.7, 2.6))],
    'Market_Stall_Blue': [((-1.15, -0.8, 0), (1.15, -0.1, 0.84)), ((-1.15, 0.6, 0), (1.15, 0.7, 2.6))],
    'Market_Stall_Red': [((-1.15, -0.8, 0), (1.15, -0.1, 0.84)), ((-1.15, 0.6, 0), (1.15, 0.7, 2.6))],
    'Cart': [((-0.7, -1.0, 0), (0.7, 0.8, 0.95))],
    'Woodpile': [((-0.6, -0.55, 0), (0.6, 0.55, 0.65))],
    'Flower_Box': _centred(0.9, 0.24, 0.3),
    'Fence_Wood': [((0, 0.14, 0), (GRID, 0.24, 0.95))],
    'Railing_Wood': [((0, 0.12, 0), (GRID, 0.26, 1.0))],
    'Table': _centred(1.8, 1.0, 0.8),
    'Bench': _centred(1.6, 0.34, 0.48),
    'Bed': [((-0.52, -1.0, 0), (0.52, 1.05, 0.55))],
    'Hearth': [((-0.85, -0.45, 0), (0.85, 0.3, 1.42))],
    'Shelf': _centred(1.2, 0.3, 1.8),
    'Tree_Oak': _centred(0.5, 0.5, 2.5),
    'Tree_Cypress': _centred(0.6, 0.6, 3.0),
    'Arch_Bridge': [((0, 0, 0), (0.6, 2.0, 3.0)), ((3.4, 0, 0), (4.0, 2.0, 3.0)),
                    ((0, 0, 2.9), (4.0, 2.0, 3.0))],
}


def _foundations():
    out = {}
    for name, h in F.PLINTHS.items():
        out[f'Plinth_{name}'] = [((0, -T - 0.18, -F.BURY), (GRID, T, h))]
        out[f'Plinth_{name}_Corner'] = [((-T - 0.18, -T - 0.18, -F.BURY), (T, T, h))]
        count = max(1, round(h / F.STEP_RISE))
        face = -T - 0.18
        out[f'Entry_Steps_{name}'] = [((0.25, face - (i + 1) * F.STEP_RUN, -F.BURY),
                                       (1.75, face, h - i * h / count)) for i in range(count)]
    out['Corner_Quoins'] = [((-T - 0.08, -T - 0.08, 0), (T, T, STORY))]
    return out


COLLIDERS.update(_foundations())


def for_module(name):
    return COLLIDERS.get(name, [])
