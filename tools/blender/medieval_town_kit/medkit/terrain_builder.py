"""Turns a terrace height map into ground tiles, retaining walls, coping and railings."""
from .config import GRID, TERRACE
from .modules.terrain import COPING_H

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
        for cx in range(p.W):
            for cy in range(p.H):
                h = p.height(cx, cy)
                z = h * TERRACE
                if (cx, cy) not in covered:
                    tile = 'Tile_Grass' if (cx, cy) in p.GRASS else 'Tile_Cobble'
                    self.kit.place(tile, self.coll, root, (cx * GRID, cy * GRID, z))
                for side, ((dx, dy), rotq) in SIDES.items():
                    nh = p.height(cx + dx, cy + dy)
                    if nh >= h:
                        continue
                    self._edge(root, cx, cy, side, rotq, nh, h,
                               bare=(cx, cy) in buildings or (cx, cy, side) in open_edges)
        return root

    def _edge(self, root, cx, cy, side, rotq, low, high, bare):
        x, y = edge_origin(cx, cy, side)
        for level in range(low, high):
            pillar = (cx + cy + level) % 3 == 0
            name = 'Terrace_Wall_Pillar' if pillar else 'Terrace_Wall'
            self.kit.place_q(name, self.coll, root, (x, y, level * TERRACE), rotq)
        if bare:
            return
        top = high * TERRACE
        self.kit.place_q('Terrace_Coping', self.coll, root, (x, y, top), rotq)
        self.kit.place_q('Railing_Wood', self.coll, root, (x, y, top + COPING_H), rotq)
