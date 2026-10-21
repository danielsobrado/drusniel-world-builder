"""Places a building's roof modules by roof style.

Styles: gable (Tudor 50 deg), steep (Nordic 60 deg, optional crossed finials),
hip (Mediterranean terracotta, needs length >= span), pyramid / spire / battlements
(square towers), the regional gables of roofs_regional.py (thatch_low, sod, steep_log),
thatch_pyramid (orc towers) and flat (Stonehold: flagged deck, parapets, chimney stacks).

A gable-fronted house turns its roof a quarter turn so the ridge runs from front
to back and a full gable faces the street (BuildingAssembler places the roof
group turned). Its span is then the house's width, its length the depth plus the
top story's jetty, which a short fill section closes.
"""
import math

from .building_spec import segments
from .config import GRID, HIP_LENGTHS, JETTY, ROOF_PITCH, jetty_key
from .modules.goblin import GOBLIN_PITCH
from .modules.roof_shapes import HIP_PITCH
from .modules.roofs import END_LEN, PYRAMID_PITCH, STEEP_PITCH, ridge_height
from .modules.roofs_regional import REGIONAL_GABLES

GABLE_SETS = {
    'gable': ('Roof_Gable', 'Roof_Gable_End', 'Gable_Wall', ROOF_PITCH),
    'steep': ('Roof_Steep', 'Roof_Steep_End', 'Gable_Wall_Steep', STEEP_PITCH),
    'goblin': ('Roof_Goblin', 'Roof_Goblin_End', 'Gable_Wall_Goblin', GOBLIN_PITCH),
    **REGIONAL_GABLES,
}
TOWER_TOPS = {
    'pyramid': 'Roof_Pyramid',
    'spire': 'Roof_Spire',
    'battlements': 'Roof_Battlements',
    'goblin_hut': 'Roof_Goblin_Hut',
    'thatch_pyramid': 'Roof_Pyramid_Thatch',
    'snow_pyramid': 'Roof_Pyramid_Snow',
}
CORNERS = ((0, 0), (1, 0), (1, 1), (0, 1))


class RoofAssembler:
    def __init__(self, kit, coll):
        self.kit, self.coll = kit, coll

    def place(self, spec, roof, level=0, rng=None, chimney=True):
        self.chimney = chimney and spec.chimney
        if spec.roof == 'flat':
            self._flat(spec, roof)
            return
        if spec.roof in TOWER_TOPS:
            self._tower_top(spec, roof)
            return
        if spec.gable_front:
            span = int(spec.w * GRID)
            fill = level * JETTY
            self._gable(spec, roof, span, spec.d * GRID + fill, f'S{span}', *GABLE_SETS[spec.roof],
                        cells=spec.d, fill=level)
            return
        span = int(spec.d * GRID)
        length = int(spec.w * GRID)
        if spec.roof == 'hip':
            if length < span or length not in HIP_LENGTHS:
                raise ValueError(f'{spec.name}: no hip roof for {length} x {span} m')
            self.kit.place(f'Roof_Hip_S{span}_L{length}', self.coll, roof, (0, 0, 0))
            self._chimney(spec, roof, span, HIP_PITCH)
            return
        key = jetty_key(span, level)
        # A jettied top story widens the roof forward: the roof group already stands
        # level * JETTY in front of the walls, so the span grows by the same amount.
        span = span + level * JETTY
        self._gable(spec, roof, span, length, key, *GABLE_SETS[spec.roof], cells=spec.w)
        if spec.cross_gable and rng is not None:
            self._cross_gable(spec, roof, rng)

    def _cross_gable(self, spec, roof, rng):
        """A gabled bay over the front: 4 m between two cells when the house is wide,
        else 3 m over the middle cell."""
        if spec.w >= 4:
            i = spec.w // 2 if spec.w % 2 == 0 else spec.w // 2 + rng.choice((0, 1))
            self.kit.place('Cross_Gable_4', self.coll, roof, (i * GRID, 0, 0))
            self.cross_cells = {i - 1, i}
        else:
            i = spec.w // 2
            self.kit.place('Cross_Gable_3', self.coll, roof, (i * GRID + GRID / 2, 0, 0))
            self.cross_cells = {i}

    def _flat(self, spec, roof):
        """Flagged deck per cell, a parapet over every wall cell, piers at the corners and
        a broad chimney stack near the back (two on long buildings)."""
        for i in range(spec.w):
            for j in range(spec.d):
                self.kit.place('Roof_Flat_Granite', self.coll, roof, (i * GRID, j * GRID, 0))
        for _side, _i, loc, rotq in segments(spec.w, spec.d):
            self.kit.place_q('Parapet_Granite', self.coll, roof, (*loc, 0), rotq)
        for rotq, (cx, cy) in enumerate(CORNERS):
            self.kit.place_q('Parapet_Granite_Corner', self.coll, roof,
                             (cx * spec.w * GRID, cy * spec.d * GRID, 0), rotq)
        if self.chimney:
            xs = (GRID,) if spec.w < 4 else (GRID, (spec.w - 1) * GRID)
            for x in xs:
                self.kit.place('Chimney_Granite', self.coll, roof, (x, spec.d * GRID - 1.0, 0.14))

    def _vents(self, roof, length, span, apex):
        """Louvred smoke vents on the ridge: one per two to three cells of hall."""
        count = 2 if length >= 5 * GRID else 1
        for k in range(count):
            self.kit.place('Smoke_Vent', self.coll, roof, ((k + 0.5) * length / count, span / 2, apex))

    def _tower_top(self, spec, roof):
        size = int(spec.w * GRID)
        self.kit.place(f'{TOWER_TOPS[spec.roof]}_{size}', self.coll, roof, (0, 0, 0))
        if spec.roof == 'pyramid':
            apex = size / 2 * math.tan(math.radians(PYRAMID_PITCH[size]))
            self.kit.place('Weathervane', self.coll, roof, (size / 2, size / 2, apex + 0.8))

    def _gable(self, spec, roof, span, length, key, section, end, wall, pitch, cells, fill=0):
        self.cross_cells = set()
        for i in range(cells):
            self.kit.place(f'{section}_{key}', self.coll, roof, (i * GRID, 0, 0))
        if fill:
            self.kit.place(f'Roof_Gable_Fill_J{fill}_{key}', self.coll, roof, (cells * GRID, 0, 0))
        self.kit.place(f'{end}_{key}', self.coll, roof, (-END_LEN, 0, 0))
        self.kit.place_q(f'{end}_{key}', self.coll, roof, (length + END_LEN, span, 0), 2)
        self.kit.place(f'{wall}_{key}', self.coll, roof, (0, 0, 0))
        self.kit.place_q(f'{wall}_{key}', self.coll, roof, (length, span, 0), 2)
        apex = ridge_height(span, pitch)
        if spec.finials:
            self.kit.place('Gable_Finial', self.coll, roof, (-END_LEN, span / 2, apex + 0.2))
            self.kit.place_q('Gable_Finial', self.coll, roof,
                             (length + END_LEN, span / 2, apex + 0.2), 2)
        elif section == 'Roof_Gable':
            self.kit.place('Gable_Spike', self.coll, roof, (-0.12, span / 2, apex + 0.25))
            self.kit.place('Gable_Spike', self.coll, roof, (length + 0.12, span / 2, apex + 0.25))
        if spec.furnish == 'church':
            self.kit.place('Weathervane', self.coll, roof, (length / 2, span / 2, apex + 0.3))
        if spec.vent:
            self._vents(roof, length, span, apex)
        self._chimney(spec, roof, span, pitch)
        if spec.dormers and not spec.cross_gable:
            tan = math.tan(pitch)
            dormer_cells = range(1, cells - 1) if cells > 2 else range(cells)
            for i in dormer_cells:
                self.kit.place('Dormer', self.coll, roof, (i * GRID + 1.0, 0.55, 0.55 * tan + 0.12))

    def _chimney(self, spec, roof, span, pitch):
        if self.chimney and spec.roof == 'slab':
            # A broad granite stack astride the ridge, one cell in from the gable.
            self.kit.place('Chimney_Granite', self.coll, roof, (GRID, span / 2, ridge_height(span, pitch) - 0.7))
        elif self.chimney and spec.roof != 'goblin':
            self.kit.place('Chimney', self.coll, roof,
                           (0.75, span / 2 + 0.75, ridge_height(span, pitch) - 3.6))
