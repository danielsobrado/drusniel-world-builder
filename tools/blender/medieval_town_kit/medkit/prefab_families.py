"""Regional building families: the base buildings and how each family dresses them.

Pure data (no bpy), shared by the game prefabs (prefabs.py) and the town generator.

Families:  Tudor  (stone + half-timber, 50 deg slate gables, dormers)
           Nordic (stone + clapboard, 60 deg gables, crossed finials, pent roofs)
           Med    (stone + ochre render, terracotta hip roofs, loggias, villa)
"""
from dataclasses import dataclass, field

from .building_spec import BuildingSpec
from .config import GRID, HIP_LENGTHS


@dataclass(frozen=True)
class Base:
    name: str
    w: int
    d: int
    stories: int
    extra: dict = field(default_factory=dict)
    shopfront: bool = False     # Med ground floor opens as an arcade
    tower: bool = False


BASES = [
    Base('House_Small', 3, 2, 2, {'seed': 101}),
    Base('House_Large', 4, 3, 2, {'dormers': True, 'seed': 102}),
    Base('House_Cottage', 3, 2, 1, {'seed': 103}),
    Base('House_Square', 3, 3, 2, {'seed': 104}),
    Base('House_Long', 4, 2, 2, {'dormers': True, 'seed': 105}),
    Base('Townhouse_Narrow', 2, 3, 3, {'seed': 111}),
    Base('Townhouse_Wide', 5, 3, 3, {'dormers': True, 'seed': 112}),
    Base('Townhouse_Tall', 4, 3, 3, {'seed': 113}),
    Base('Shop_Large', 4, 3, 2, {'furnish': 'store', 'seed': 121}, shopfront=True),
    Base('Shop_Small', 3, 2, 2, {'furnish': 'store', 'seed': 122}, shopfront=True),
    Base('Tavern', 4, 3, 3, {'dormers': True, 'sign': True, 'furnish': 'inn', 'seed': 131},
         shopfront=True),
    Base('Tavern_Large', 5, 3, 3, {'dormers': True, 'sign': True, 'furnish': 'inn', 'seed': 132}),
    Base('Smithy', 4, 2, 1, {'furnish': 'store', 'seed': 141}),
    Base('Bakery', 3, 2, 2, {'seed': 142}),
    Base('Warehouse', 4, 3, 2, {'furnish': 'store', 'seed': 143}),
    Base('Chapel', 4, 3, 2, {'door': 1, 'floors': False, 'furnish': 'church', 'chimney': False,
                             'window_odds': 0.9, 'seed': 151}),
    Base('Farmhouse', 6, 2, 2, {'door': 2, 'seed': 161}),
    Base('Farmhouse_Small', 5, 2, 1, {'door': 2, 'seed': 162}),
    Base('Barn', 4, 3, 1, {'floors': False, 'furnish': 'store', 'chimney': False, 'seed': 163}),
    Base('Keep', 3, 3, 4, {'banner': True, 'chimney': False, 'furnish': 'store', 'seed': 171},
         tower=True),
    Base('Manor', 6, 3, 3, {'door': 2, 'dormers': True, 'banner': True, 'seed': 172}),
    Base('Tower', 2, 2, 3, {'banner': True, 'chimney': False, 'furnish': 'none', 'seed': 173},
         tower=True),
]


GABLE_FRONTED = {'House_Square', 'Townhouse_Narrow', 'Shop_Small', 'Bakery'}
TURRETED = {'Manor', 'Tavern_Large', 'Townhouse_Wide'}
TRADE_SIGNS = {'Shop_Large': 'Key', 'Shop_Small': 'Boot', 'Tavern_Large': 'Mug'}


def _stories(ground, upper, count):
    return (ground,) + (upper,) * (count - 1)


def tudor(base):
    stories = ('stone',) * base.stories if base.tower else _stories('stone', 'timber', base.stories)
    roof = 'pyramid' if base.tower else 'gable'
    house = not base.tower
    gable_front = house and base.name in GABLE_FRONTED
    return BuildingSpec(f'Tudor_{base.name}', base.w, base.d, stories, roof=roof,
                        plinth='Low' if house else '', jetty=house, gable_front=gable_front,
                        cross_gable=house and not gable_front and base.w >= 3 and base.name != 'Barn',
                        turret=base.name in TURRETED, shop_sign=TRADE_SIGNS.get(base.name, ''),
                        oriel_odds=0.22, balcony_odds=0.08, side_chimney_odds=0.45, **base.extra)


def nordic(base):
    if base.tower:
        return BuildingSpec(f'Nordic_{base.name}', base.w, base.d, ('stone',) * base.stories,
                            roof='battlements', **base.extra)
    ground = 'plank' if base.stories == 1 and base.name != 'Smithy' else 'stone'
    stories = _stories(ground, 'plank', base.stories)
    return BuildingSpec(f'Nordic_{base.name}', base.w, base.d, stories, roof='steep',
                        finials=True, pent=base.stories > 1, plinth='High',
                        gable_front=base.name in GABLE_FRONTED, shop_sign=TRADE_SIGNS.get(base.name, ''),
                        side_chimney_odds=0.35, **base.extra)


def mediterranean(base):
    extra = {k: v for k, v in base.extra.items() if k != 'dormers'}
    if base.tower:
        return BuildingSpec(f'Med_{base.name}', base.w, base.d, ('stone',) * base.stories,
                            roof='battlements', **extra)
    d = min(base.d, base.w)
    roof = 'hip' if base.w * GRID in HIP_LENGTHS else 'gable'
    stories = _stories('stone', 'plaster', base.stories)
    return BuildingSpec(f'Med_{base.name}', base.w, d, stories, roof=roof,
                        arcade=base.shopfront, shop_sign=TRADE_SIGNS.get(base.name, ''),
                        balcony_odds=0.25, **extra)


FAMILIES = (tudor, nordic, mediterranean)
FAMILY_BY_NAME = {'Tudor': tudor, 'Nordic': nordic, 'Med': mediterranean}
BASE_BY_NAME = {base.name: base for base in BASES}
