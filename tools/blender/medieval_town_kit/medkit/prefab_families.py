"""Regional building families: the base buildings and how each family dresses them.

Pure data (no bpy), shared by the game prefabs (prefabs.py) and the town generator.

Families:  Tudor  (stone + half-timber, 50 deg slate gables, dormers)
           Nordic (stone + clapboard, 60 deg gables, crossed finials, pent roofs)
           Med    (stone + ochre render, terracotta hip roofs, loggias, villa)
           Goblin (Grukmar marsh: stilts, shanty walls, shaggy reed roofs)
           Orc       (Grukmar uplands: low broad halls, dark stone socle, heavy timber,
                      low reed thatch, deep porches)
           Frostgard (horizontal hewn logs, sod roofs on homes, steep plain slate on
                      halls, ridge smoke vents, rugged granite plinths; no roof horns)
           Stonehold (granite with basalt dressings, squared shouldered openings,
                      flat parapeted roofs, chimney stacks, vaulted portals)
Regional briefs: docs/asset-bible/regions/<realm>.md and 05-differentiation-matrix.md.
"""
from dataclasses import dataclass, field, replace

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
    Base('Shop_Large', 4, 3, 2, {'furnish': 'shop', 'seed': 121}, shopfront=True),
    Base('Shop_Small', 3, 2, 2, {'furnish': 'shop', 'seed': 122}, shopfront=True),
    Base('Tavern', 4, 3, 3, {'dormers': True, 'sign': True, 'furnish': 'inn', 'seed': 131},
         shopfront=True),
    Base('Tavern_Large', 5, 3, 3, {'dormers': True, 'sign': True, 'furnish': 'inn', 'seed': 132}),
    Base('Smithy', 4, 2, 1, {'furnish': 'smithy', 'seed': 141}),
    Base('Bakery', 3, 2, 2, {'furnish': 'bakery', 'seed': 142}),
    Base('Warehouse', 4, 3, 2, {'furnish': 'store', 'seed': 143}),
    Base('Apothecary', 3, 2, 2, {'furnish': 'apothecary', 'seed': 144}, shopfront=True),
    Base('Chapel', 4, 3, 2, {'door': 1, 'floors': False, 'furnish': 'church', 'chimney': False,
                             'window_odds': 0.9, 'seed': 151}),
    Base('Farmhouse', 6, 2, 2, {'door': 2, 'seed': 161}),
    Base('Farmhouse_Small', 5, 2, 1, {'door': 2, 'seed': 162}),
    Base('Barn', 4, 3, 1, {'floors': False, 'furnish': 'store', 'chimney': False, 'seed': 163}),
    Base('Keep', 3, 3, 4, {'banner': True, 'chimney': False, 'furnish': 'keep', 'seed': 171},
         tower=True),
    Base('Manor', 6, 3, 3, {'door': 2, 'dormers': True, 'banner': True, 'furnish': 'keep', 'seed': 172}),
    Base('Tower', 2, 2, 3, {'banner': True, 'chimney': False, 'furnish': 'none', 'seed': 173},
          tower=True),
    Base('Guildhall', 5, 3, 3, {'door': 2, 'dormers': True, 'banner': True, 'furnish': 'library',
                                'seed': 174}, shopfront=True),
    Base('Guardhouse', 4, 2, 2, {'door': 1, 'banner': True, 'furnish': 'keep', 'seed': 175}),
    Base('Library', 4, 3, 2, {'door': 1, 'dormers': True, 'furnish': 'library', 'seed': 176}),
]


GABLE_FRONTED = {'House_Square', 'Townhouse_Narrow', 'Shop_Small', 'Bakery', 'Apothecary'}
TURRETED = {'Manor', 'Tavern_Large', 'Townhouse_Wide', 'Guildhall'}
TRADE_SIGNS = {
    'Shop_Large': 'Key',
    'Shop_Small': 'Boot',
    'Tavern_Large': 'Mug',
    'Smithy': 'Anvil',
    'Bakery': 'Loaf',
    'Apothecary': 'Potion',
    'Guardhouse': 'Shield',
    'Library': 'Book',
    'Guildhall': 'Key',
}
# Bases that also get a one-story-taller sibling (<Family>_<Base>_Tall) on the same
# footprint, so a street steps up and down instead of standing at one height.
TALLER = ('House_Small', 'House_Square', 'House_Long', 'Townhouse_Narrow', 'Townhouse_Tall',
          'Shop_Small', 'Bakery', 'Apothecary')
TALL_SUFFIX = '_Tall'
MAX_STORIES = 4


def taller(family, base):
    """The family's spec for `base` raised one story, named <Family>_<Base>_Tall."""
    spec = family(replace(base, stories=min(MAX_STORIES, base.stories + 1)))
    return replace(spec, name=spec.name + TALL_SUFFIX, seed=spec.seed + 7)


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


def goblin(base):
    extra = {k: v for k, v in base.extra.items() if k not in ('dormers', 'chimney')}
    if base.tower:
        if base.name == 'Tower':
            stories = ('goblin_frame',) * max(2, base.stories - 1)
        else:
            stories = ('goblin',) + ('goblin_frame',) * max(1, base.stories - 2)
        return BuildingSpec(f'Goblin_{base.name}', base.w, base.d, stories,
                            roof='goblin_hut', plinth='Stilts', chimney=False, **extra)
    n_stories = (1 if BASE_BY_NAME[base.name].stories <= 2 else 2) + _lift(base)
    stories = ('goblin',) * n_stories
    gable_front = base.w in (2, 3) and (base.name in GABLE_FRONTED or base.name == 'House_Small')
    has_awning = (base.shopfront or gable_front
                  or base.name in ('Manor', 'Tavern_Large', 'House_Large', 'Farmhouse'))
    has_banner = (extra.pop('banner', False) or gable_front
                  or base.name in ('Tavern', 'Tavern_Large', 'Chapel', 'Apothecary'))
    return BuildingSpec(f'Goblin_{base.name}', base.w, base.d, stories, roof='goblin',
                        plinth='Stilts', gable_front=gable_front, pent=has_awning,
                        arcade=base.shopfront, banner=has_banner, chimney=False, **extra)



def _without(extra, *keys):
    return {k: v for k, v in extra.items() if k not in keys}


# Bases that keep their timber and earth roofs rather than a porch: stores and the forge.
ORC_NO_PORCH = {'Barn', 'Warehouse', 'Smithy'}
ORC_LOFT = {'Manor', 'Tavern_Large'}
# Clan halls roof with red-stained hides: the one warm accent of an orc skyline.
ORC_HIDE = {'Manor', 'Tavern_Large', 'Tavern', 'Smithy', 'Guildhall'}
# Frostgard longhall governance and big stores take the steep slate roof; homes take sod.
FROST_HALLS = {'Tavern', 'Tavern_Large', 'Guildhall', 'Manor', 'Chapel', 'Library',
               'Warehouse', 'Barn', 'Guardhouse'}


def _lift(base):
    """1 for the one-story-taller sibling (taller()), else 0."""
    return base.stories - BASE_BY_NAME[base.name].stories


def orc(base):
    """Grukmar upland orc ridge-hold: one broad story; only big halls and the taller
    siblings get a boarded loft over the stone-socled ground floor. No banners: the
    kit's only banner is the Lumish fleur-de-lis."""
    extra = _without(base.extra, 'dormers', 'chimney', 'banner')
    if base.tower:
        stories = ('orc',) + ('orc_loft',) * (min(base.stories, 3) - 1)
        return BuildingSpec(f'Orc_{base.name}', base.w, base.d, stories,
                            roof='thatch_pyramid', plinth='Dark', chimney=False, **extra)
    lofts = min(1, _lift(base) + (base.name in ORC_LOFT))
    return BuildingSpec(f'Orc_{base.name}', base.w, base.d, ('orc',) + ('orc_loft',) * lofts,
                        roof='hide' if base.name in ORC_HIDE else 'thatch_low', plinth='Dark',
                        pent=base.name not in ORC_NO_PORCH,
                        chimney=False, shop_sign=TRADE_SIGNS.get(base.name, ''), **extra)


def frostgard(base):
    extra = _without(base.extra, 'dormers', 'chimney')
    if base.tower:
        return BuildingSpec(f'Frostgard_{base.name}', base.w, base.d, ('log',) * base.stories,
                            roof='pyramid', plinth='Rugged', chimney=False, **extra)
    roof = 'steep_log' if base.name in FROST_HALLS else 'sod'
    stories = min(BASE_BY_NAME[base.name].stories, 2) + _lift(base)
    return BuildingSpec(f'Frostgard_{base.name}', base.w, base.d, ('log',) * stories,
                        roof=roof, plinth='Rugged', vent=True, chimney=False,
                        gable_front=base.name in GABLE_FRONTED,
                        shop_sign=TRADE_SIGNS.get(base.name, ''), **extra)


# Stonehold's civic and defensive buildings keep the flat parapeted roof; homes, shops and
# workshops take the low stone-slab gable, so a hold's skyline steps instead of reading as blocks.
STONEHOLD_FLAT = {'Keep', 'Tower', 'Guildhall', 'Manor', 'Guardhouse', 'Library', 'Chapel', 'Townhouse_Wide'}


def stonehold(base):
    # No banners: the walls carry no cloth; the hold's mark is the gate (prefabs.py).
    extra = _without(base.extra, 'dormers', 'banner', 'window_odds')
    roof = 'flat' if base.tower or base.name in STONEHOLD_FLAT else 'slab'
    return BuildingSpec(f'Stonehold_{base.name}', base.w, base.d, ('granite',) * base.stories,
                        roof=roof, plinth='Basalt', arcade=base.shopfront and not base.tower,
                        gable_front=roof == 'slab' and base.name in GABLE_FRONTED,
                        window_odds=min(base.extra.get('window_odds', 0.6), 0.35),
                        shop_sign=TRADE_SIGNS.get(base.name, ''), **extra)


FAMILIES = (tudor, nordic, mediterranean, goblin, orc, frostgard, stonehold)
FAMILY_BY_NAME = {'Tudor': tudor, 'Nordic': nordic, 'Med': mediterranean, 'Goblin': goblin,
                  'Orc': orc, 'Frostgard': frostgard, 'Stonehold': stonehold}
BASE_BY_NAME = {base.name: base for base in BASES}
