"""Data for the sample town: a 22 x 16 cell (44 x 32 m) terraced diorama.

Terrace levels (x TERRACE m): 0 sunken lane, 1 front ring, 2 market plaza,
3 upper town, 4 chapel terrace. Cell (0, 0) is the front-left corner; +Y
climbs toward the chapel. rotq 0 = building front faces -Y / stairs climb +Y.
"""
from .buildings import BuildingSpec

W, H = 22, 16


def height(x, y):
    if not (0 <= x < W and 0 <= y < H):
        return 0
    if x in (9, 10) and y <= 8:
        return 0
    if y <= 3:
        return 1
    if y <= 9:
        return 2
    if 8 <= x <= 14 and y >= 12:
        return 4
    return 3


def _rect(x0, x1, y0, y1):
    return {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}


GRASS = _rect(0, 4, 0, 0) | _rect(11, 12, 0, 1) | _rect(21, 21, 2, 5) | _rect(2, 8, 15, 15) \
    | _rect(0, 1, 10, 13) | _rect(19, 21, 14, 15) | _rect(14, 14, 12, 13)

# (module, cx, cy) — every flight climbs +Y; cells cy .. cy + flight length - 1.
STAIRS = [
    ('Stairs_Stone_1', 5, -2), ('Stairs_Stone_1', 16, -2),   # outside -> front ring
    ('Stairs_Stone_1', 6, 2), ('Stairs_Stone_1', 13, 2),     # front ring -> plaza
    ('Stairs_Stone_2', 10, 6),                               # lane -> plaza
    ('Stairs_Stone_1', 4, 8), ('Stairs_Stone_1', 16, 8),     # plaza -> upper town
    ('Stairs_Stone_1', 11, 10),                              # upper town -> chapel
]
STAIR_CELLS = {'Stairs_Stone_1': 2, 'Stairs_Stone_2': 3}

# Arch bridge carrying the plaza across the lane: (cx, cy) of its west cell.
BRIDGES = [(9, 5)]

BUILDINGS = [
    (BuildingSpec('Cottage', 3, 2, seed=1), 1, 1, 0),
    (BuildingSpec('Bakery', 2, 2, seed=2), 7, 0, 0),
    (BuildingSpec('Smithy', 3, 2, furnish='store', seed=3), 15, 1, 0),
    (BuildingSpec('Gatetower', 2, 2, ('stone', 'stone', 'timber'), roof='pyramid', banner=True,
                  chimney=False, furnish='store', seed=4), 19, 0, 0),
    (BuildingSpec('Inn', 4, 3, ('stone', 'timber', 'timber'), dormers=True, sign=True,
                  furnish='inn', door_open=1.3, seed=5), 11, 7, 0),
    (BuildingSpec('Weaver', 3, 3, seed=6), 0, 6, 1),
    (BuildingSpec('Merchant', 4, 3, ('stone', 'timber', 'timber'), dormers=True, seed=7), 19, 6, 3),
    (BuildingSpec('Hillhouse', 3, 2, seed=8), 1, 11, 0),
    (BuildingSpec('Manor', 4, 3, ('stone', 'timber', 'timber'), dormers=True, banner=True,
                  seed=9), 16, 11, 0),
    (BuildingSpec('Cornerhouse', 3, 2, ('timber', 'timber'), seed=10), 20, 11, 3),
    (BuildingSpec('Backhouse', 3, 2, seed=11), 3, 14, 0),
    (BuildingSpec('Granary', 3, 2, furnish='store', seed=12), 16, 14, 0),
    (BuildingSpec('Watchtower', 2, 2, ('stone', 'stone', 'stone', 'timber'), roof='pyramid',
                  banner=True, chimney=False, furnish='store', seed=13), 0, 14, 0),
    (BuildingSpec('Chapel', 5, 3, ('stone', 'stone'), door=2, floors=False, furnish='church',
                  chimney=False, window_odds=0.9, seed=14), 8, 13, 0),
    (BuildingSpec('Belltower', 2, 2, ('stone', 'stone', 'stone'), door=0, roof='spire',
                  chimney=False, furnish='none', seed=15), 13, 14, 0),
]

# (module, x, y, rotation in degrees) in cell units; z follows the terrace.
PROPS = [
    ('Well', 6.5, 6.0, 0), ('Market_Stall_Cream', 4.0, 5.0, 0), ('Market_Stall_Blue', 7.6, 4.6, 0),
    ('Market_Stall_Red', 14.5, 5.0, 0), ('Market_Stall_Cream', 17.5, 4.8, 0),
    ('Bench', 6.5, 7.6, 0), ('Cart', 8.0, 8.0, 30), ('Cart', 12.2, 0.6, -20),
    ('Barrel', 14.6, 6.6, 0), ('Barrel', 15.3, 6.8, 40), ('Barrel', 8.7, 9.4, 0),
    ('Barrel', 18.6, 1.0, 0), ('Crate', 15.0, 6.2, 15), ('Crate', 4.6, 12.8, -10),
    ('Woodpile', 18.5, 0.45, 0), ('Woodpile', 5.5, 13.2, 90),
    ('Tree_Oak', 0.6, 4.5, 0), ('Tree_Oak', 21.0, 4.5, 60), ('Tree_Oak', 6.5, 12.5, 120),
    ('Tree_Oak', 20.5, 15.0, 30), ('Tree_Oak', 11.5, 1.0, 200), ('Tree_Oak', 2.0, 9.6, 90),
    ('Tree_Cypress', 7.6, 14.6, 0), ('Tree_Cypress', 14.7, 12.6, 0), ('Tree_Cypress', 8.4, 12.4, 0),
    ('Tree_Cypress', 15.4, 15.4, 0), ('Tree_Cypress', 0.5, 12.5, 0), ('Tree_Cypress', 4.6, 4.4, 0),
    ('Bush', 0.5, 0.5, 0), ('Bush', 2.5, 0.4, 50), ('Bush', 4.5, 0.5, 100), ('Bush', 12.5, 0.5, 0),
    ('Bush', 6.0, 15.5, 0), ('Bush', 13.5, 12.5, 0), ('Bush', 19.5, 10.5, 0),
]

LAMPS = [(5.5, 1.2), (13.5, 1.0), (18.5, 2.6), (5.2, 8.3), (8.4, 6.6), (12.0, 6.4),
         (17.6, 7.3), (5.0, 11.0), (14.6, 11.0), (10.4, 12.5)]
