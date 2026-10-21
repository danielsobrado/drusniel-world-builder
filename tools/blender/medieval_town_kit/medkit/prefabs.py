"""Building prefabs for the game's settlement planner, in the regional families.

The game plans towns per Azgaar burg (src/editor/world/settlements) and asks
for buildings by kind and variant; the burg's culture picks the family. Each
prefab is assembled from kit modules by the same BuildingAssembler as the
sample town and sized to fit the plot the planner reserves. The game only
instances prefabs; it never re-implements the assembly.
Families are defined in prefab_families.py.
"""
from dataclasses import replace

import bpy

from .buildings import BuildingAssembler, BuildingSpec
from .config import GRID
from .modules.palisade import TOWER
from .modules.walls_stonehold import GATE_D, GATE_W
from .prefab_families import BASE_BY_NAME, BASES, FAMILIES, TALLER, taller



SPACING = 34.0
ORIGIN_Y = -400.0


class PrefabBuilder:
    """Builds every prefab into its own collection, away from the sample town."""

    def __init__(self, kit):
        self.kit = kit
        self.coll = kit.collection('Prefabs', under=bpy.context.scene.collection)
        self.coll.hide_render = True
        self.assembler = BuildingAssembler(kit, self.coll, self.coll)
        self.prefabs = []

    def _slot(self):
        i = len(self.prefabs)
        return ((i % 12) * SPACING, ORIGIN_Y - (i // 12) * SPACING, 0.0)

    def _add(self, name, root, size, centre, kind='building', stories=1):
        self.prefabs.append({'name': name, 'root': root, 'size': size, 'centre': centre,
                             'kind': kind, 'stories': stories})

    def building(self, spec):
        root = self.assembler.build(spec, self._slot(), 0)
        size = (spec.w * GRID, spec.d * GRID)
        self._add(spec.name, root, size, (size[0] / 2, size[1] / 2), stories=len(spec.stories))

    def city_wall(self, segments=6):
        root = self.kit.group('BLD_CityWall', self.coll, None, self._slot())
        for i in range(segments):
            self.kit.place('Wall_Curtain', self.coll, root, (i * GRID, 0, 0))
        length = segments * GRID
        self._add('CityWall', root, (length, 1.2), (length / 2, 0.0), kind='defence')

    def round_tower(self):
        root = self.kit.group('BLD_RoundTower', self.coll, None, self._slot())
        self.kit.place('Tower_Round', self.coll, root, (0, 0, 0))
        self._add('RoundTower', root, (5.0, 5.0), (0.0, 0.0), kind='defence', stories=3)

    def gatehouse(self):
        root = self.kit.group('BLD_Gatehouse', self.coll, None, self._slot())
        tower = BuildingSpec('Gatetower', 2, 2, ('stone', 'stone', 'stone'), roof='battlements',
                             banner=True, chimney=False, furnish='none', seed=181)
        self.assembler.build(tower, (0, 0, 0), 0, parent=root)
        self.assembler.build(replace(tower, name='Gatetower_R', seed=182), (4 * GRID, 0, 0), 0,
                             parent=root)
        for y in (0.0, GRID):
            self.kit.place('Arch_Bridge', self.coll, root, (2 * GRID, y, 0))
        for x in (2 * GRID, 3 * GRID):
            self.kit.place('Wall_Curtain', self.coll, root, (x, GRID, 3.0))
        self._add('Gatehouse', root, (6 * GRID, 2 * GRID), (3 * GRID, GRID), kind='defence',
                  stories=3)

    def villa(self):
        """Mediterranean courtyard house: three wings round a garden open to the street."""
        root = self.kit.group('BLD_Med_Villa', self.coll, None, self._slot())
        wing = BuildingSpec('Villa_Back', 6, 2, ('stone', 'plaster'), roof='hip', door=2,
                            arcade=True, seed=191)
        side = BuildingSpec('Villa_Side', 3, 2, ('stone', 'plaster'), roof='hip', door=1,
                            arcade=True, chimney=False, seed=192)
        self.assembler.build(wing, (0, 3 * GRID, 0), 0, parent=root)
        self.assembler.build(side, (2 * GRID, 0, 0), 1, parent=root)
        self.assembler.build(replace(side, name='Villa_Side_R', seed=193), (4 * GRID, 3 * GRID, 0),
                             3, parent=root)
        self.kit.place('Well', self.coll, root, (3 * GRID, 1.5 * GRID, 0))
        for x, y in ((2.4 * GRID, 0.6 * GRID), (3.6 * GRID, 0.6 * GRID), (2.4 * GRID, 2.5 * GRID),
                     (3.6 * GRID, 2.5 * GRID)):
            self.kit.place('Bush', self.coll, root, (x, y, 0))
        self._add('Med_Villa', root, (6 * GRID, 5 * GRID), (3 * GRID, 2.5 * GRID), stories=2)

    def orc_palisade(self, segments=6):
        """Grukmar ridge palisade run, named so the planner's CityWall resolves to it."""
        root = self.kit.group('BLD_Orc_CityWall', self.coll, None, self._slot())
        for i in range(segments):
            self.kit.place('Palisade_Orc', self.coll, root, (i * GRID, 0, 0))
        length = segments * GRID
        self._add('Orc_CityWall', root, (length, 1.0), (length / 2, 0.0), kind='defence')

    def orc_gatehouse(self, wings=2):
        """The single gate tower on its stone footing with palisade running off both sides."""
        root = self.kit.group('BLD_Orc_Gatehouse', self.coll, None, self._slot())
        x = wings * GRID
        self.kit.place('Gate_Tower_Orc', self.coll, root, (x, -TOWER / 2, 0))
        for i in range(wings):
            self.kit.place('Palisade_Orc', self.coll, root, (i * GRID, 0, 0))
            self.kit.place('Palisade_Orc', self.coll, root, (x + TOWER + i * GRID, 0, 0))
        length = 2 * x + TOWER
        self._add('Orc_Gatehouse', root, (length, TOWER), (length / 2, 0.0), kind='defence', stories=2)

    def stonehold_gatehouse(self):
        """Two granite towers flanking the vaulted gate block."""
        root = self.kit.group('BLD_Stonehold_Gatehouse', self.coll, None, self._slot())
        tower = BuildingSpec('Stonehold_Gatetower', 2, 2, ('granite',) * 3, roof='flat', plinth='Basalt',
                             chimney=False, furnish='none', seed=185)
        self.assembler.build(tower, (0, 0, 0), 0, parent=root)
        self.kit.place('Gate_Stonehold', self.coll, root, (2 * GRID, 0, 0))
        self.assembler.build(replace(tower, name='Stonehold_Gatetower_R', seed=186),
                             (2 * GRID + GATE_W, 0, 0), 0, parent=root)
        length = 4 * GRID + GATE_W
        self._add('Stonehold_Gatehouse', root, (length, GATE_D), (length / 2, GATE_D / 2), kind='defence',
                  stories=3)

    def regional_towers(self):
        """Each frontier family's RoundTower: the game's SettlementDefences towers resolve to
        <Family>_RoundTower (TownPrefabCatalog), so their walls get regional towers."""
        for name, module in (('Orc_RoundTower', 'Watchtower_Orc'), ('Frostgard_RoundTower', 'Watchtower_Frost')):
            root = self.kit.group(f'BLD_{name}', self.coll, None, self._slot())
            self.kit.place(module, self.coll, root, (0, 0, 0))
            self._add(name, root, (3.8, 3.8), (0.0, 0.0), kind='defence', stories=3)
        tower = BuildingSpec('Stonehold_RoundTower', 2, 2, ('granite',) * 4, roof='flat', plinth='Basalt',
                             chimney=False, furnish='none', seed=187)
        root = self.assembler.build(tower, self._slot(), 0)
        self._add('Stonehold_RoundTower', root, (2 * GRID, 2 * GRID), (GRID, GRID), kind='defence', stories=4)

    def build_all(self):
        for family in FAMILIES:
            for base in BASES:
                self.building(family(base))
            for name in TALLER:
                self.building(taller(family, BASE_BY_NAME[name]))
        self.city_wall()
        self.round_tower()
        self.gatehouse()
        self.villa()
        self.orc_palisade()
        self.orc_gatehouse()
        self.stonehold_gatehouse()
        self.regional_towers()
        print(f'[kit] {len(self.prefabs)} prefabs assembled')
        return self.prefabs
