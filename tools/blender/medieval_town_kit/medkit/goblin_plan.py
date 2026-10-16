"""Data for the Goblin Swamp Village: a 22 x 16 cell (44 x 32 m) bayou stilt-town diorama.

Modelled after the swamp-village concept:
  - Level 0 (0.0 m): murky bayou lagoon & central water channel with moored skiffs and cypresses
  - Level 1 (1.5 m): foreground left cooking/drying deck & foreground right Chieftain's Longhouse dock
  - Level 2 (3.0 m): twin X-braced stilt watchtowers flanking the channel + high rope suspension bridge,
                     Bog Tavern brew-house, and Shaman witch-doctor hut
  - Level 3 (4.5 m): upper Warboss hall & palisade terrace
"""
from .buildings import BuildingSpec

STYLE = 'goblin'
W, H = 22, 16


def height(x, y):
    if not (0 <= x < W and 0 <= y < H):
        return 0
    if y == 0 or y == 15 or x == 0 or x == 21:
        return 0
    # Foreground wide lagoon channel (x = 8..11) and mid-channel narrows (x = 9..10)
    if y <= 5 and 8 <= x <= 11:
        return 0
    if 6 <= y <= 10 and 9 <= x <= 10:
        return 0
    if y <= 5:
        return 1
    if 6 <= x <= 15 and 11 <= y <= 14:
        return 3
    return 2


def _rect(x0, x1, y0, y1):
    return {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}


# Mossy swamp-bank islands along the outer boardwalk edges
GRASS = _rect(1, 2, 1, 1) | _rect(19, 20, 1, 2) | _rect(1, 2, 13, 14) | _rect(19, 20, 13, 14)

STAIRS = [
    ('Stairs_Boardwalk_1', 6, -1), ('Stairs_Boardwalk_1', 13, -1),   # lagoon -> foreground decks
    ('Stairs_Boardwalk_1', 5, 4), ('Stairs_Boardwalk_1', 13, 4),     # foreground -> watchtower decks
    ('Stairs_Boardwalk_1', 8, 9), ('Stairs_Boardwalk_1', 11, 9),     # watchtower decks -> upper terrace
]
STAIR_CELLS = {'Stairs_Boardwalk_1': 2, 'Stairs_Boardwalk_2': 3}

# (cx, cy, z_level): lower boardwalk bridge (z_level=0 -> deck at 2*TERRACE = 3.0m)
# and high watchtower suspension bridge (z_level=4.4 -> deck at 9.6m between upper stories)
BRIDGES = [
    (9, 8, 0),
    (9, 6, 4.4),
]

BUILDINGS = [
    # Foreground Left: Fisherman / Cook Shanty behind the cauldron & drying rack
    (BuildingSpec('Cook_Shanty', 3, 2, ('goblin',), roof='goblin', plinth='Stilts',
                  pent=True, banner=True, furnish='house', door_open=1.25, seed=201), 1, 3, 0),
    # Foreground Right: Chieftain's Longhouse on stilts with awning & skull banner
    (BuildingSpec('Chieftain_Hall', 4, 3, ('goblin', 'goblin'), roof='goblin', plinth='Stilts',
                  pent=True, banner=True, furnish='keep', door_open=1.35, seed=202), 15, 2, 0),
    # Midground Channel: Twin X-braced Stilt Watchtowers connected by high rope bridge
    (BuildingSpec('West_Watchtower', 2, 2, ('goblin', 'goblin', 'goblin'), roof='goblin_hut',
                  plinth='Stilts', banner=True, chimney=False, furnish='none', seed=203), 7, 6, 0),
    (BuildingSpec('East_Watchtower', 2, 2, ('goblin', 'goblin', 'goblin'), roof='goblin_hut',
                  plinth='Stilts', banner=True, chimney=False, furnish='none', seed=204), 11, 6, 0),
    # Midground Left: Goblin Bog-Tavern / Brew-House
    (BuildingSpec('Bog_Tavern', 4, 3, ('goblin', 'goblin'), roof='goblin', plinth='Stilts',
                  pent=True, arcade=True, banner=True, furnish='inn', door_open=1.35, seed=205), 2, 7, 0),
    # Midground Right: Shaman Witch-Doctor Hut
    (BuildingSpec('Shaman_Hut', 4, 3, ('goblin', 'goblin'), roof='goblin', plinth='Stilts',
                  pent=True, banner=True, furnish='apothecary', door_open=1.35, seed=206), 15, 7, 0),
    # Upper Left: Scrap-Forge Smithy
    (BuildingSpec('Scrap_Smithy', 3, 2, ('goblin',), roof='goblin', plinth='Stilts',
                  pent=True, furnish='smithy', door_open=1.3, seed=207), 2, 12, 0),
    # Upper Centre: Warboss Great Hall on the high terrace
    (BuildingSpec('Warboss_Keep', 5, 3, ('goblin', 'goblin'), door=2, roof='goblin',
                  plinth='Stilts', pent=True, banner=True, furnish='keep', door_open=1.35, seed=208), 8, 12, 0),
    # Upper Right: Raider Store-Hut
    (BuildingSpec('Raider_Store', 3, 2, ('goblin', 'goblin'), roof='goblin', plinth='Stilts',
                  pent=True, banner=True, furnish='store', door_open=1.2, seed=209), 16, 12, 0),
]

PROPS = [
    # Foreground left cooking & drying deck (matches reference image foreground left)
    ('Cauldron_Fire', 5.2, 2.2, 0),
    ('Drying_Rack', 3.2, 2.0, 18),
    ('Basket_Cluster', 6.4, 1.8, -15),
    ('Basket_Cluster', 4.3, 1.4, 35),
    ('Barrel', 4.3, 3.2, 0), ('Barrel', 4.8, 3.4, 25),
    ('Crate', 6.4, 3.2, 15),
    ('Goblin_Totem', 7.3, 1.4, -20),
    # Foreground right Chieftain dock (matches reference image foreground right)
    ('Basket_Cluster', 14.2, 2.2, 20),
    ('Cauldron_Fire', 13.4, 3.4, 0),
    ('Goblin_Totem', 12.6, 1.5, 15),
    ('Barrel', 19.3, 2.2, 0), ('Crate', 19.4, 3.0, -20),
    # Moored swamp skiffs in the central bayou lagoon
    ('Goblin_Skiff', 11.2, 2.2, 72),
    ('Goblin_Skiff', 8.7, 3.8, -68),
    ('Goblin_Skiff', 10.6, 5.2, 85),
    # Midground boardwalk camp clutter, drying racks, totems & spike barricades
    ('Drying_Rack', 14.0, 8.8, -10),
    ('Cauldron_Fire', 6.4, 9.2, 0),
    ('Basket_Cluster', 6.4, 8.2, 0),
    ('Goblin_Totem', 8.5, 5.6, 0), ('Goblin_Totem', 11.5, 5.6, 0),
    ('Spike_Barricade', 3.0, 1.2, 0), ('Spike_Barricade', 17.5, 1.2, 0),
    ('Spike_Barricade', 7.2, 11.2, 0), ('Spike_Barricade', 13.8, 11.2, 0),
    ('Cargo_Pile', 15.2, 10.4, 15), ('Woodpile', 5.4, 12.2, 0),
    # Towering bald-cypress swamp trees with hanging Spanish moss framing the bayou
    ('Swamp_Tree', 0.8, 1.2, 0), ('Swamp_Tree', 0.7, 5.5, 45), ('Swamp_Tree', 0.8, 9.8, 110),
    ('Swamp_Tree', 1.2, 14.5, 25), ('Swamp_Tree', 5.2, 15.2, 80), ('Swamp_Tree', 10.0, 15.3, 140),
    ('Swamp_Tree', 15.0, 15.2, 15), ('Swamp_Tree', 20.5, 14.5, 65),
    ('Swamp_Tree', 21.2, 9.5, 190), ('Swamp_Tree', 21.0, 4.8, 30), ('Swamp_Tree', 20.6, 1.0, 120),
    ('Swamp_Tree', 2.2, 0.6, 40), ('Swamp_Tree', 10.5, 10.2, 95),
    ('Bush', 1.4, 1.4, 0), ('Bush', 19.6, 1.4, 40), ('Bush', 8.4, 2.0, 15), ('Bush', 11.6, 3.2, 70),
]

LAMPS = [
    (7.4, 2.6), (12.6, 2.6), (6.8, 5.6), (13.2, 5.6),
    (8.6, 8.2), (11.4, 8.2), (6.5, 11.4), (14.5, 11.4),
]
