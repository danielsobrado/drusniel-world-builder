"""Turns a terrace height map into ground tiles, retaining walls, coping and railings."""
from .config import GRID, TERRACE
from .modules.terrain import COPING_H
from .town_styles import DEFAULT

# side -> (neighbour offset, quarter turns that point a wall module's -Y outward)
SIDES = {'S': ((0, -1), 0), 'E': ((1, 0), 1), 'N': ((0, 1), 2), 'W': ((-1, 0), 3)}


def edge_origin(cx, cy, side):
    x, y = cx * GRID, cy * GRID
    return {'S': (x, y), 'E': (x + GRID, y), 'N': (x + GRID, y + GRID), 'W': (x, y + GRID)}[side]


class TerrainBuilder:
    def __init__(self, kit, coll, plan):
        self.kit, self.coll, self.plan = kit, coll, plan

    def build(self, covered, buildings, open_edges):
        """covered: cells without a ground tile; buildings: cells whose edges get
        no coping/railing; open_edges: {(cx, cy, side)} kept clear for access."""
        root = self.kit.group('Terrain', self.coll)
        p = self.plan
        goblin = getattr(p, 'STYLE', '') == 'goblin'
        self.style = getattr(p, 'TOWN_STYLE', DEFAULT)
        for cx in range(p.W):
            for cy in range(p.H):
                h = p.height(cx, cy)
                z = h * TERRACE
                if goblin and h > 0:
                    # Murky bayou water continues beneath the open stilt boardwalks.
                    self.kit.place('Tile_Swamp', self.coll, root, (cx * GRID, cy * GRID, 0.0))
                if (cx, cy) not in covered:
                    if goblin:
                        tile = 'Tile_Swamp' if h == 0 else (
                            'Tile_Grass' if (cx, cy) in p.GRASS else 'Tile_Boardwalk'
                        )
                    else:
                        tile = self.style.grass if (cx, cy) in p.GRASS else self.style.street
                    self.kit.place(tile, self.coll, root, (cx * GRID, cy * GRID, z))
                for side, ((dx, dy), rotq) in SIDES.items():
                    nh = p.height(cx + dx, cy + dy)
                    if nh >= h:
                        continue
                    self._edge(root, cx, cy, side, rotq, nh, h,
                               bare=(cx, cy) in buildings or (cx, cy, side) in open_edges,
                               goblin=goblin)
        return root

    def _edge(self, root, cx, cy, side, rotq, low, high, bare, goblin=False):
        x, y = edge_origin(cx, cy, side)
        for level in range(low, high):
            # A pillar's cap rises above the terrace, so under a building it shows through the floor.
            pillar = (cx + cy + level) % 3 == 0 and not bare
            if goblin:
                name = 'Stilt_Wall_Pillar' if pillar else 'Stilt_Wall'
            else:
                name = self.style.pillar if pillar else self.style.wall
            self.kit.place_q(name, self.coll, root, (x, y, level * TERRACE), rotq)
        if bare:
            return
        top = high * TERRACE
        if goblin:
            self.kit.place_q('Boardwalk_Edge', self.coll, root, (x, y, top), rotq)
            self.kit.place_q('Railing_Goblin', self.coll, root, (x, y, top + 0.08), rotq)
        else:
            self.kit.place_q(self.style.coping, self.coll, root, (x, y, top), rotq)
            if low == 0 and self.style.rim and side in self.style.rim_sides and self._on_rim(cx, cy, side):
                self.kit.place_q(self.style.rim, self.coll, root, (x, y, top), rotq)
            else:
                self.kit.place_q(self.style.railing, self.coll, root, (x, y, top + COPING_H), rotq)

    def _on_rim(self, cx, cy, side):
        (dx, dy), _ = SIDES[side]
        nx, ny = cx + dx, cy + dy
        return not (0 <= nx < self.plan.W and 0 <= ny < self.plan.H)
