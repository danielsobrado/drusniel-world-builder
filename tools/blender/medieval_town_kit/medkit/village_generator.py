"""Seeded terraced-town generator: a different town map for every seed.

Produces a plan with the same shape as village_plan (W, H, height(), GRASS,
STAIRS, BRIDGES, BUILDINGS, PROPS, LAMPS), so village.build assembles it
unchanged. Pure Python (no bpy), deterministic in (seed, family).

  terraces   three bands climbing +Y whose edges step per column block, plus a
             raised crown terrace for the chapel
  stairs     two flights over every band edge, one onto the crown, two from outside
  buildings  greedy plots, each with a reserved street strip in front of its door
  plaza      the most open plaza-level spot gets the well and market stalls
  style      town_styles.py dresses each family: ground, edges, stairs, street fire,
             greenery, the square, the crown building, and the town rim / gate / backdrop
"""
import random
from dataclasses import replace

from .prefab_families import BASE_BY_NAME, FAMILY_BY_NAME
from .town_styles import style_for

# Every stair set climbs one terrace over two cells or two over three.
STAIR_CELLS = {f'{kind}_{units}': units + 1 for units in (1, 2)
               for kind in ('Stairs_Stone', 'Stairs_Boardwalk', 'Stairs_Dark', 'Stairs_Frost', 'Stairs_Granite')}
FACINGS = (0, 0, 0, 1, 3)        # mostly facing down the slope, some across it


class GeneratedVillage:
    STAIR_CELLS = STAIR_CELLS
    BRIDGES = ()

    def __init__(self, seed=1, family='Tudor'):
        if family not in FAMILY_BY_NAME:
            raise ValueError(f'Unknown family {family}; use one of {sorted(FAMILY_BY_NAME)}.')
        self.seed, self.family = seed, family
        self.STYLE = 'goblin' if family == 'Goblin' else 'medieval'
        self.TOWN_STYLE = style_for(family)
        self.stair_mod = 'Stairs_Boardwalk_1' if family == 'Goblin' else f'{self.TOWN_STYLE.stairs}_1'
        self.entrances = []
        self.rng = random.Random(seed)
        self.dress = FAMILY_BY_NAME[family]
        self._terraces()
        self.occupied, self.streets = set(), set()
        self.STAIRS, self.BUILDINGS, self.PROPS, self.LAMPS = [], [], [], []
        self._chapel()
        self._stairs()
        self._towers()      # before the houses, which would otherwise take every corner
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
        self.hill = self.TOWN_STYLE.terrain == 'hill'
        if self.hill:
            # Terrace edges wander smoothly across the town like contour lines on a hillside.
            self.edge1, self.edge2 = self._meander(rng, 1.6), self._meander(rng, 2.0)
        else:
            blocks = range(0, self.W, 4)
            self.step1 = {b: rng.choice((-1, 0, 0, 1)) for b in blocks}
            self.step2 = {b: rng.choice((-1, 0, 0, 1)) for b in blocks}
        tw = rng.randint(6, 9)
        tx = rng.randint(2, self.W - tw - 2)
        ty = self.b2 + 3
        self.crown = (tx, tx + tw - 1, ty, self.H - 1)

    def _meander(self, rng, amp, period=5):
        """Per-column offset (cells) that wanders smoothly within +-amp."""
        knots = [rng.uniform(-amp, amp) for _ in range(self.W // period + 3)]
        out = {}
        for x in range(self.W):
            t = x / period
            i, f = int(t), t - int(t)
            f = f * f * (3 - 2 * f)
            out[x] = round(knots[i] * (1 - f) + knots[i + 1] * f)
        return out

    def height(self, x, y):
        if not (0 <= x < self.W and 0 <= y < self.H):
            return 0
        x0, x1, y0, y1 = self.crown
        if self.hill:
            if y < self.b1 + self.edge1[x]:
                return 1
            if y < self.b2 + self.edge2[x]:
                return 2
            if x0 <= x <= x1 and y0 <= y <= y1:
                return 4
            # The upper terrace falls away at the hill's shoulders.
            return 2 if x < 2 or x >= self.W - 2 else 3
        block = x - x % 4
        if y < self.b1 + self.step1[block]:
            return 1
        if y < self.b2 + self.step2[block]:
            return 2
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
            self.STAIRS.append((self.stair_mod, x, y))
            self.occupied |= run
            self.streets |= {(x, y - 1), (x, y + 2), (x, y + 3)}
        return placed

    def _stairs(self):
        for x in self.rng.sample(range(2, self.W - 2), 2):
            self.STAIRS.append((self.stair_mod, x, -2))
            self.streets |= {(x, 0), (x, 1)}
            self.entrances.append(x)
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
        chapel = self._spec(self.TOWN_STYLE.crown)
        spots = [(cx, y0 + 1) for cx in range(x0, x1 + 1)]
        self.rng.shuffle(spots)
        next((spot for spot in spots if self._try_place(chapel, *spot, 0)), None)

    def _landmarks(self):
        self._scatter(self._spec(self.TOWN_STYLE.tower), {1, 3}, facings=(0,))
        for name in self.TOWN_STYLE.landmarks:
            self._scatter(self._spec(name), {2, 3})

    def _houses(self):
        target = self.W * self.H // self.TOWN_STYLE.density
        misses = 0
        while len(self.BUILDINGS) < target and misses < 12:
            name = self.rng.choice(self.TOWN_STYLE.pool)
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
        centerpiece = self.rng.choice(self.TOWN_STYLE.centerpieces)
        self.PROPS.append((centerpiece, wx + 0.5, wy + 0.5, 0))
        self.occupied.add((wx, wy))
        stalls = self.TOWN_STYLE.stalls
        for i, (dx, dy) in enumerate(((-2, 0), (2, 0), (0, -2), (0, 2))):
            cell = (wx + dx, wy + dy)
            if i < len(stalls) and self._free({cell}) and self.height(*cell) == 2:
                self.PROPS.append((stalls[i], cell[0] + 0.5, cell[1] + 0.5, 0))
                self.occupied.add(cell)
        bench = (wx + 1, wy + 1)
        if self._free({bench}):
            self.PROPS.append(('Bench', bench[0] + 0.5, bench[1] + 0.2, 0))

    def _dressing(self):
        rng, style = self.rng, self.TOWN_STYLE
        free = [c for c in self._open_cells() if c not in self.streets]
        rng.shuffle(free)
        self.GRASS = set()
        for x, y in free[: int(len(free) * style.grass_share)]:
            self.GRASS.add((x, y))
        greenery = free[: int(len(free) * style.tree_share)]
        for x, y in greenery:
            kind = rng.choice(style.trees)
            self.PROPS.append((kind, x + rng.uniform(0.3, 0.7), y + rng.uniform(0.3, 0.7),
                               rng.uniform(0, 360)))
            self.occupied.add((x, y))
        streets = [c for c in self.streets if c not in self.occupied and 0 <= c[1] < self.H
                   and 0 <= c[0] < self.W]
        rng.shuffle(streets)
        for x, y in streets[: max(4, len(streets) // 6)]:
            self.LAMPS.append((x + 0.15, y + 0.15))
        for x, y in streets[len(streets) // 6: len(streets) // 6 + 10]:
            kind = rng.choice(style.yard)
            self.PROPS.append((kind, x + 0.8, y + 0.5, rng.uniform(0, 360)))
        yards = [c for c in self._open_cells() if c not in self.streets]
        rng.shuffle(yards)
        for module, count in style.extras:
            for _ in range(count):
                if not yards:
                    break
                x, y = yards.pop()
                self.PROPS.append((module, x + 0.5, y + 0.5, rng.choice((0, 90, 180, 270))))
                self.occupied.add((x, y))
        self._surroundings()

    def _towers(self):
        """Watchtowers on the town's corners first, then along its rim: each stands on a grid
        point with the four cells round it free."""
        modules = [m for m, count in self.TOWN_STYLE.towers for _ in range(count)]
        if not modules:
            return
        corners = [(1, 1), (self.W - 1, 1), (1, self.H - 1), (self.W - 1, self.H - 1)]
        rim = [(x, 1) for x in range(3, self.W - 2, 3)] + [(x, self.H - 1) for x in range(3, self.W - 2, 3)]
        rim += [(1, y) for y in range(3, self.H - 2, 3)] + [(self.W - 1, y) for y in range(3, self.H - 2, 3)]
        self.rng.shuffle(rim)
        for gx, gy in corners + rim:
            if not modules:
                return
            cells = {(gx - 1, gy - 1), (gx, gy - 1), (gx - 1, gy), (gx, gy)}
            levels = {self.height(*c) for c in cells}
            if len(levels) != 1 or not self._free(cells):
                continue
            self.PROPS.append((modules.pop(0), gx, gy, self.rng.choice((0, 90, 180, 270))))
            self.occupied |= cells

    def _surroundings(self):
        """Outside the map: a gate tower before the first entrance stair, a rock backdrop."""
        style = self.TOWN_STYLE
        if style.gate and self.entrances:
            # Gate_Tower_Orc is 2 x 2 cells with its passage centred on its width.
            self.PROPS.append((style.gate, self.entrances[0] - 0.5, -4.0, 0))
        if style.backdrop:
            for x in range(-2, self.W + 2, 2):
                self.PROPS.append((style.backdrop, x, self.H + 0.1, 0))
            for y in range(self.H // 2, self.H, 2):
                self.PROPS.append((style.backdrop, -0.1, y, 90))
                self.PROPS.append((style.backdrop, self.W + 0.1, y + 2, 270))
