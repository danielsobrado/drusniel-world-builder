"""Seeded terraced-town generator: a different town map for every seed.

Produces a plan with the same shape as village_plan (W, H, height(), GRASS,
STAIRS, BRIDGES, BUILDINGS, PROPS, LAMPS), so village.build assembles it
unchanged. Pure Python (no bpy), deterministic in (seed, family).

  terraces   three bands climbing +Y whose edges step per column block, plus a
             raised crown terrace for the chapel
  stairs     two flights over every band edge, one onto the crown, two from outside
  buildings  greedy plots, each with a reserved street strip in front of its door
  plaza      the most open plaza-level spot gets the well and market stalls
"""
import random
from dataclasses import replace

from .prefab_families import BASE_BY_NAME, FAMILY_BY_NAME

STAIR_CELLS = {'Stairs_Stone_1': 2, 'Stairs_Stone_2': 3}
TOWN_POOL = ('House_Small', 'House_Small', 'House_Large', 'House_Cottage', 'House_Square',
             'House_Long', 'Townhouse_Narrow', 'Townhouse_Tall', 'Shop_Small', 'Shop_Large',
             'Bakery', 'Smithy', 'Warehouse')
LANDMARKS = ('Tavern', 'Manor', 'Townhouse_Wide')
FACINGS = (0, 0, 0, 1, 3)        # mostly facing down the slope, some across it


class GeneratedVillage:
    STAIR_CELLS = STAIR_CELLS
    BRIDGES = ()

    def __init__(self, seed=1, family='Tudor'):
        if family not in FAMILY_BY_NAME:
            raise ValueError(f'Unknown family {family}; use one of {sorted(FAMILY_BY_NAME)}.')
        self.seed, self.family = seed, family
        self.rng = random.Random(seed)
        self.dress = FAMILY_BY_NAME[family]
        self._terraces()
        self.occupied, self.streets = set(), set()
        self.STAIRS, self.BUILDINGS, self.PROPS, self.LAMPS = [], [], [], []
        self._chapel()
        self._stairs()
        self._landmarks()
        self._houses()
        self._plaza()
        self._dressing()

    # -- terrain -------------------------------------------------------------
    def _terraces(self):
        rng = self.rng
        self.W, self.H = rng.randint(18, 26), rng.randint(16, 21)
        self.b1 = rng.randint(3, 5)
        self.b2 = min(self.b1 + rng.randint(5, 7), self.H - 7)
        blocks = range(0, self.W, 4)
        self.step1 = {b: rng.choice((-1, 0, 0, 1)) for b in blocks}
        self.step2 = {b: rng.choice((-1, 0, 0, 1)) for b in blocks}
        tw = rng.randint(6, 9)
        tx = rng.randint(2, self.W - tw - 2)
        ty = self.b2 + 3
        self.crown = (tx, tx + tw - 1, ty, self.H - 1)

    def height(self, x, y):
        if not (0 <= x < self.W and 0 <= y < self.H):
            return 0
        block = x - x % 4
        if y < self.b1 + self.step1[block]:
            return 1
        if y < self.b2 + self.step2[block]:
            return 2
        x0, x1, y0, y1 = self.crown
        return 4 if x0 <= x <= x1 and y0 <= y <= y1 else 3

    def _free(self, cells):
        return all(c not in self.occupied and c not in self.streets and 0 <= c[0] < self.W
                   and 0 <= c[1] < self.H for c in cells)

    # -- stairs -----------------------------------------------------------------
    def _stair_columns(self, level):
        """Columns with a two-cell run at `level` right below a `level + 1` cell."""
        found = []
        for x in range(1, self.W - 1):
            for y in range(0, self.H):
                if (self.height(x, y) == level + 1 and self.height(x, y - 1) == level
                        and self.height(x, y - 2) == level and y - 2 >= (0 if level else -2)):
                    found.append((x, y - 2))
                    break
        return found

    def _place_stairs(self, level, count):
        options = self._stair_columns(level)
        self.rng.shuffle(options)
        placed = []
        for x, y in options:
            if len(placed) >= count or any(abs(x - px) < 4 for px, _ in placed):
                continue
            run = {(x, y), (x, y + 1)}
            if level and any(c in self.occupied for c in run | {(x, y + 2)}):
                continue
            placed.append((x, y))
            self.STAIRS.append(('Stairs_Stone_1', x, y))
            self.occupied |= run
            self.streets |= {(x, y - 1), (x, y + 2), (x, y + 3)}
        return placed

    def _stairs(self):
        for x in self.rng.sample(range(2, self.W - 2), 2):
            self.STAIRS.append(('Stairs_Stone_1', x, -2))
            self.streets |= {(x, 0), (x, 1)}
        for level in (1, 2):
            self._place_stairs(level, 2)
        self._place_stairs(3, 1)

    # -- buildings ---------------------------------------------------------------
    @staticmethod
    def _footprint(cx, cy, w, d, rotq):
        fw, fd = (w, d) if rotq % 2 == 0 else (d, w)
        return {(cx + i, cy + j) for i in range(fw) for j in range(fd)}, fw, fd

    @staticmethod
    def _front(cx, cy, fw, fd, rotq):
        if rotq == 0:
            return {(cx + i, cy - 1) for i in range(fw)}
        if rotq == 1:
            return {(cx + fw, cy + j) for j in range(fd)}
        if rotq == 3:
            return {(cx - 1, cy + j) for j in range(fd)}
        return {(cx + i, cy + fd) for i in range(fw)}

    def _try_place(self, spec, cx, cy, rotq):
        cells, fw, fd = self._footprint(cx, cy, spec.w, spec.d, rotq)
        front = self._front(cx, cy, fw, fd, rotq)
        level = self.height(cx, cy)
        if not self._free(cells) or not all(self.height(*c) == level for c in cells | front):
            return False
        if any(c in self.occupied for c in front):
            return False
        index = len(self.BUILDINGS)
        named = replace(spec, name=f'{spec.name}_{index}', seed=spec.seed * 31 + index)
        self.BUILDINGS.append((named, cx, cy, rotq))
        self.occupied |= cells
        self.streets |= front
        return True

    def _spec(self, base_name):
        return self.dress(BASE_BY_NAME[base_name])

    def _scatter(self, spec, levels, attempts=400, facings=FACINGS):
        for _ in range(attempts):
            cx, cy = self.rng.randrange(self.W), self.rng.randrange(self.H)
            if self.height(cx, cy) in levels and self._try_place(spec, cx, cy, self.rng.choice(facings)):
                return True
        return False

    def _chapel(self):
        """The chapel crowns the top terrace, set back one row for its forecourt."""
        x0, x1, y0, _ = self.crown
        chapel = self._spec('Chapel')
        spots = [(cx, y0 + 1) for cx in range(x0, x1 + 1)]
        self.rng.shuffle(spots)
        next((spot for spot in spots if self._try_place(chapel, *spot, 0)), None)

    def _landmarks(self):
        self._scatter(self._spec('Tower'), {1, 3}, facings=(0,))
        for name in LANDMARKS:
            self._scatter(self._spec(name), {2, 3})

    def _houses(self):
        target = self.W * self.H // 14
        misses = 0
        while len(self.BUILDINGS) < target and misses < 12:
            name = self.rng.choice(TOWN_POOL)
            if not self._scatter(self._spec(name), {1, 2, 3}, attempts=120):
                misses += 1

    # -- open space ----------------------------------------------------------------
    def _open_cells(self, level=None):
        return [(x, y) for x in range(self.W) for y in range(self.H)
                if (x, y) not in self.occupied and (level is None or self.height(x, y) == level)]

    def _plaza(self):
        def openness(cell):
            x, y = cell
            return sum((x + dx, y + dy) not in self.occupied and self.height(x + dx, y + dy) == 2
                       for dx in (-1, 0, 1) for dy in (-1, 0, 1))
        cells = self._open_cells(2)
        if not cells:
            return
        wx, wy = max(cells, key=lambda c: (openness(c), -abs(c[0] - self.W / 2)))
        self.PROPS.append(('Well', wx + 0.5, wy + 0.5, 0))
        self.occupied.add((wx, wy))
        stalls = ('Market_Stall_Cream', 'Market_Stall_Blue', 'Market_Stall_Red')
        for i, (dx, dy) in enumerate(((-2, 0), (2, 0), (0, -2), (0, 2))):
            cell = (wx + dx, wy + dy)
            if i < 3 and self._free({cell}) and self.height(*cell) == 2:
                self.PROPS.append((stalls[i], cell[0] + 0.5, cell[1] + 0.5, 0))
                self.occupied.add(cell)
        bench = (wx + 1, wy + 1)
        if self._free({bench}):
            self.PROPS.append(('Bench', bench[0] + 0.5, bench[1] + 0.2, 0))

    def _dressing(self):
        rng = self.rng
        free = [c for c in self._open_cells() if c not in self.streets]
        rng.shuffle(free)
        self.GRASS = set()
        for x, y in free[: len(free) // 3]:
            self.GRASS.add((x, y))
        greenery = free[: len(free) // 6]
        for x, y in greenery:
            kind = rng.choice(('Tree_Oak', 'Tree_Cypress', 'Tree_Cypress', 'Bush', 'Bush'))
            self.PROPS.append((kind, x + rng.uniform(0.3, 0.7), y + rng.uniform(0.3, 0.7),
                               rng.uniform(0, 360)))
            self.occupied.add((x, y))
        streets = [c for c in self.streets if c not in self.occupied and 0 <= c[1] < self.H
                   and 0 <= c[0] < self.W]
        rng.shuffle(streets)
        for x, y in streets[: max(4, len(streets) // 6)]:
            self.LAMPS.append((x + 0.15, y + 0.15))
        for x, y in streets[len(streets) // 6: len(streets) // 6 + 8]:
            kind = rng.choice(('Barrel', 'Crate', 'Cart', 'Woodpile', 'Barrel'))
            self.PROPS.append((kind, x + 0.8, y + 0.5, rng.uniform(0, 360)))
