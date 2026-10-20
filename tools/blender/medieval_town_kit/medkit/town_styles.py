"""How a generated town of each family is dressed: ground, terrace edges, stairs, street fire,
greenery, yard props, the square, the crown building and the town edge (pure data, no bpy).

The lowland families share DEFAULT, which is what the generator always did. Goblin towns
keep their own swamp grammar (STYLE == 'goblin' in village_generator / terrain_builder).
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class TownStyle:
    street: str = 'Tile_Cobble'
    grass: str = 'Tile_Grass'
    wall: str = 'Terrace_Wall'
    pillar: str = 'Terrace_Wall_Pillar'
    coping: str = 'Terrace_Coping'
    railing: str = 'Railing_Wood'
    stairs: str = 'Stairs_Stone'            # + '_1' / '_2'
    lamp: str = 'Lamp_Post'
    lamp_light: float = 2.7                 # light height above the lamp's foot (preview only)
    trees: tuple = ('Tree_Oak', 'Tree_Cypress', 'Tree_Cypress', 'Bush', 'Bush')
    yard: tuple = ('Barrel', 'Crate', 'Cart', 'Woodpile', 'Horse_Trough', 'Brazier', 'Cargo_Pile',
                   'Signpost', 'Wayside_Shrine')
    centerpieces: tuple = ('Well', 'Fountain', 'Town_Cross')
    stalls: tuple = ('Market_Stall_Cream', 'Market_Stall_Blue', 'Market_Stall_Red', 'Notice_Board')
    crown: str = 'Chapel'
    tower: str = 'Tower'
    landmarks: tuple = ('Tavern', 'Manor', 'Guildhall', 'Townhouse_Wide')
    pool: tuple = ('House_Small', 'House_Small', 'House_Large', 'House_Cottage', 'House_Square',
                   'House_Long', 'Townhouse_Narrow', 'Townhouse_Tall', 'Shop_Small', 'Shop_Large',
                   'Bakery', 'Smithy', 'Apothecary', 'Guardhouse', 'Library', 'Warehouse')
    density: int = 14                       # one building per this many cells
    grass_share: float = 1 / 3              # of the open, non-street cells
    tree_share: float = 1 / 6
    # Map edge: the module that replaces the railing on the town's outer terrace edges,
    # and what stands outside the map ('' = nothing).
    rim: str = ''
    rim_sides: tuple = ('S', 'E', 'N', 'W')
    backdrop: str = ''
    gate: str = ''                          # stands in front of the first outside stair
    extras: tuple = field(default_factory=tuple)   # (module, count) set in open yards


DEFAULT = TownStyle()

STYLES = {
    # Grukmar upland ridge-hold: earth lanes, dark stone terraces, stake edges, a palisade
    # rim and a gate tower, the clan hearth with red banners for its square.
    'Orc': TownStyle(
        street='Tile_Earth', grass='Tile_Grass_Upland', wall='Terrace_Wall_Dark', pillar='Terrace_Wall_Dark_Pillar',
        coping='Terrace_Coping_Dark', railing='Railing_Stakes', stairs='Stairs_Dark',
        lamp='Fire_Post', lamp_light=2.55,
        trees=('Tree_Oak', 'Tree_Oak', 'Bush', 'Bush', 'Tree_Pine'),
        yard=('Barrel', 'Crate', 'Cart', 'Woodpile', 'Drying_Rack', 'Cargo_Pile', 'Woodpile', 'Grindstone'),
        centerpieces=('Clan_Hearth',), stalls=('War_Banner', 'War_Banner', 'Market_Stall_Red', 'War_Banner'),
        crown='Manor', landmarks=('Tavern_Large', 'Tavern', 'Smithy'),
        pool=('House_Small', 'House_Large', 'House_Long', 'House_Cottage', 'House_Square', 'House_Small',
              'Farmhouse_Small', 'Smithy', 'Warehouse', 'Shop_Small', 'Barn'),
        density=20, grass_share=0.45, tree_share=0.2, rim='Palisade_Orc', gate='Gate_Tower_Orc',
        extras=(('War_Banner', 5), ('Drying_Rack', 2))),
    # Frostgard: earth lanes and frost grass, rugged granite terraces, split-log edges, a
    # windbreak rim on the weather sides, conifers, an oath-stone square, the longhall crown.
    'Frostgard': TownStyle(
        street='Tile_Earth', grass='Tile_Grass_Frost', wall='Terrace_Wall_Frost',
        pillar='Terrace_Wall_Frost_Pillar', coping='Terrace_Coping_Frost', railing='Railing_Log',
        stairs='Stairs_Frost', lamp='Fire_Post', lamp_light=2.55,
        trees=('Tree_Pine', 'Tree_Pine', 'Tree_Pine_Tall', 'Boulder_Cluster'),
        yard=('Barrel', 'Woodpile', 'Woodpile', 'Cart', 'Drying_Rack', 'Crate', 'Boulder_Cluster'),
        centerpieces=('Rune_Stone',), stalls=('Rune_Stone', 'Rune_Stone', 'Rune_Stone', 'Rune_Stone'),
        crown='Tavern_Large', landmarks=('Guildhall', 'Tavern', 'Warehouse'),
        pool=('House_Small', 'House_Large', 'House_Long', 'House_Cottage', 'House_Square', 'House_Long',
              'Farmhouse_Small', 'Smithy', 'Warehouse', 'Barn', 'Bakery'),
        density=21, grass_share=0.5, tree_share=0.22, rim='Windbreak_Wall', rim_sides=('E', 'N', 'W'),
        extras=(('Boulder_Cluster', 4), ('Woodpile', 3))),
    # Stonehold: flagged lanes, granite terraces with basalt piers, parapet edges, a granite
    # cliff behind the town, braziers, ore cranes, the council hall for its crown.
    'Stonehold': TownStyle(
        street='Tile_Flagstone', grass='Tile_Earth', wall='Terrace_Wall_Granite',
        pillar='Terrace_Wall_Granite_Pillar', coping='Terrace_Coping_Granite', railing='Railing_Parapet',
        stairs='Stairs_Granite', lamp='Brazier_Pillar', lamp_light=1.5,
        trees=('Boulder_Cluster', 'Boulder_Cluster', 'Tree_Pine'),
        yard=('Cargo_Pile', 'Crate', 'Barrel', 'Cart', 'Grindstone', 'Cargo_Pile', 'Brazier_Pillar'),
        centerpieces=('Brazier_Pillar',), stalls=('Ore_Crane', 'Cargo_Pile', 'Market_Stall_Cream', 'Notice_Board'),
        crown='Guildhall', landmarks=('Keep', 'Guildhall', 'Townhouse_Wide', 'Smithy'),
        pool=('Townhouse_Narrow', 'Townhouse_Tall', 'House_Square', 'House_Large', 'Shop_Small', 'Shop_Large',
              'Smithy', 'Smithy', 'Warehouse', 'Guardhouse', 'Library'),
        density=13, grass_share=0.12, tree_share=0.08, backdrop='Cliff_Granite',
        extras=(('Ore_Crane', 2), ('Cargo_Pile', 3))),
}


def style_for(family):
    return STYLES.get(family, DEFAULT)
