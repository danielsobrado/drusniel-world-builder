"""What a building is, independent of how it is assembled (pure data, no bpy)."""
from dataclasses import dataclass


@dataclass
class BuildingSpec:
    name: str
    w: int                      # cells along the front (local X)
    d: int                      # cells deep (local Y); gable span = d * GRID
    stories: tuple = ('stone', 'timber')
    door: int = 1
    roof: str = 'gable'         # gable | steep | hip | pyramid | spire | battlements
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
    seed: int = 0


WALL_PREFIX = {'stone': 'Wall_Stone', 'timber': 'Wall_Timber', 'plank': 'Wall_Plank',
               'plaster': 'Wall_Plaster'}
CORNER = {'stone': 'Corner_Quoins', 'plaster': 'Corner_Quoins', 'timber': 'Corner_Timber',
          'plank': 'Corner_Timber'}


def jetty_level(spec, k):
    """How many JETTY steps story k's front stands out (0 = flush with the ground floor)."""
    if not spec.jetty or k == 0:
        return 0
    return min(sum(1 for kind in spec.stories[1:k + 1] if kind == 'timber'), 2)
