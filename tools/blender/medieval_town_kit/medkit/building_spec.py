"""What a building is, independent of how it is assembled (pure data, no bpy)."""
from dataclasses import dataclass

from .config import GRID, STORY


@dataclass
class BuildingSpec:
    name: str
    w: int                      # cells along the front (local X)
    d: int                      # cells deep (local Y); gable span = d * GRID
    stories: tuple = ('stone', 'timber')
    door: int = 1
    roof: str = 'gable'         # gable | steep | hip | pyramid | spire | battlements | flat
                                # | thatch_low | sod | steep_log | thatch_pyramid
    dormers: bool = False
    chimney: bool = True
    floors: bool = True         # False = one tall hall (church)
    furnish: str = 'house'      # house | inn | church | store | none
    banner: bool = False
    sign: bool = False
    door_open: float = 0.0      # radians
    window_odds: float = 0.6
    finials: bool = False       # crossed horn boards on the gables (Nordic)
    pent: bool = False          # lean-to roofs over the front at each upper floor
    arcade: bool = False        # ground-floor front opens as a loggia
    plinth: str = ''            # '' | 'Low' (0.3 m) | 'High' (0.6 m) stone plinth with steps
    jetty: bool = False         # upper timber stories step out over the street front
    cross_gable: bool = False   # a gabled bay rises from the front wall through the eave
    gable_front: bool = False   # ridge runs front to back: a full gable faces the street
    turret: bool = False        # corbelled round turret on the top story's front-left corner
    shop_sign: str = ''         # trade emblem hung by the door: '' | Mug | Boot | Key
    oriel_odds: float = 0.0     # chance an upper front window becomes an oriel bay
    balcony_odds: float = 0.0   # chance an upper front window gets a balcony
    side_chimney_odds: float = 0.0  # chance the chimney climbs the left wall instead of the ridge
    vent: bool = False          # louvred smoke vents ride the ridge instead of a chimney
    seed: int = 0


WALL_PREFIX = {'stone': 'Wall_Stone', 'timber': 'Wall_Timber', 'plank': 'Wall_Plank',
               'plaster': 'Wall_Plaster', 'goblin': 'Wall_Goblin', 'goblin_frame': 'Wall_Goblin_Frame',
               'orc': 'Wall_Orc', 'orc_loft': 'Wall_Orc_Loft', 'log': 'Wall_Log', 'granite': 'Wall_Granite'}
CORNER = {'stone': 'Corner_Quoins', 'plaster': 'Corner_Quoins', 'timber': 'Corner_Timber',
          'plank': 'Corner_Timber', 'goblin': 'Corner_Goblin', 'goblin_frame': 'Corner_Goblin',
          'orc': 'Corner_Orc', 'orc_loft': 'Corner_Orc_Loft', 'log': 'Corner_Log',
          'granite': 'Corner_Granite'}
# Ground-floor lean-tos (module, offset from the wall base); other kinds hang Pent_Roof
# under each upper floor.
GROUND_PENT = {'goblin': ('Goblin_Awning', (0, -0.15, STORY - 0.12)), 'orc': ('Orc_Porch', (0, 0, 0))}


def segments(w, d):
    """(side, index, wall origin, quarter turns) for every wall cell, counter-clockwise."""
    for i in range(w):
        yield 'front', i, (i * GRID, 0), 0
    for j in range(d):
        yield 'right', j, (w * GRID, j * GRID), 1
    for i in range(w):
        yield 'back', i, ((w - i) * GRID, d * GRID), 2
    for j in range(d):
        yield 'left', j, (0, (d - j) * GRID), 3


def jetty_level(spec, k):
    """How many JETTY steps story k's front stands out (0 = flush with the ground floor)."""
    if not spec.jetty or k == 0:
        return 0
    return min(sum(1 for kind in spec.stories[1:k + 1] if kind == 'timber'), 2)
