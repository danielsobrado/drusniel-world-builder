"""Assembles enterable buildings from kit modules.

Hierarchy:  BLD_<name> (empty, the whole house)
              ├─ <name>_Story<k> (empty)  walls, corners, floor, stairs, furniture
              └─ <name>_Roof (empty)      roof sections, gables, chimney, dormers
Lift a story or the roof empty to rearrange the building like lego.
"""
import math
import random

from . import furnish, lights
from .building_accents import AccentPlacer
from .building_spec import CORNER, WALL_PREFIX, BuildingSpec, jetty_level  # noqa: F401  (re-export)
from .config import GRID, JETTY, STORY
from .mesh import wall_point as _wall_point
from .modules.foundations import PLINTHS
from .roof_assembly import RoofAssembler


def _segments(w, d):
    for i in range(w):
        yield 'front', i, (i * GRID, 0), 0
    for j in range(d):
        yield 'right', j, (w * GRID, j * GRID), 1
    for i in range(w):
        yield 'back', i, ((w - i) * GRID, d * GRID), 2
    for j in range(d):
        yield 'left', j, (0, (d - j) * GRID), 3


def stair_side(k):
    return 'L' if k % 2 == 0 else 'R'


class BuildingAssembler:
    def __init__(self, kit, coll, lights_coll):
        self.kit = kit
        self.coll = coll
        self.lights_coll = lights_coll
        self.roofs = RoofAssembler(kit, coll)
        self.accents = AccentPlacer(kit, coll)

    def build(self, spec, loc, rotq, parent=None):
        root = self.kit.group(f'BLD_{spec.name}', self.coll, parent, loc, rotq)
        root['building'] = spec.name
        rng = random.Random(spec.seed)
        n = len(spec.stories)
        top = jetty_level(spec, n - 1)
        self.plan = self.accents.plan(spec)
        base = PLINTHS.get(spec.plinth, 0.0)
        if base:
            self._plinth(spec, root)
            self.accents.plinth(spec, self.plan, root)
        for k, kind in enumerate(spec.stories):
            story = self.kit.group(f'{spec.name}_Story{k}', self.coll, root, (0, 0, base + k * STORY))
            level = jetty_level(spec, k)
            self._walls(spec, k, kind, story, rng, level)
            self._corners(spec, kind, story, level)
            self.accents.story(spec, self.plan, k, story, top)
            self._floor(spec, k, story)
            if spec.floors and k + 1 < n:
                side = stair_side(k)
                col = 0 if side == 'L' else spec.w - 1
                self.kit.place(f'Stairs_Interior_{side}', self.coll, story, (col * GRID, 0, 0))
            furnish.furnish_story(self.kit, self.coll, story, spec, k)
        lights.interior(self.lights_coll, root, (spec.w * GRID / 2, spec.d * GRID / 2, base + 2.3))
        wall_top = base + n * STORY
        if spec.gable_front:
            # Turned a quarter: the roof's ridge (its local +X) runs back from the front.
            roof = self.kit.group(f'{spec.name}_Roof', self.coll, root,
                                  (spec.w * GRID, -top * JETTY, wall_top), 1)
        else:
            roof = self.kit.group(f'{spec.name}_Roof', self.coll, root, (0, -top * JETTY, wall_top))
        self.roofs.place(spec, roof, top, rng, chimney=not self.plan.side_chimney)
        self.accents.stack(spec, self.plan, root, wall_top, top)
        return root

    def _walls(self, spec, k, kind, story, rng, level=0):
        plain = WALL_PREFIX[kind]
        jettied = f'{plain}_J{level}' if level and kind == 'timber' else plain
        upper = k + 1 < len(spec.stories)
        for side, i, loc, rotq in _segments(spec.w, spec.d):
            prefix = jettied if side == 'front' else plain
            out = level * JETTY if side == 'front' and prefix != plain else 0.0
            odds = spec.window_odds + (0.2 if side == 'front' else 0.0)
            if k == 0 and side == 'front' and i == spec.door:
                self.kit.place_q(f'{prefix}_Door', self.coll, story, (*loc, 0), rotq)
                leaf = self.kit.place('Door_Leaf', self.coll, story,
                                      _wall_point(loc, rotq, (0.58, 0, 0.02)),
                                      rotq * math.pi / 2 + spec.door_open)
                leaf['interactable'] = 'door'
                self.kit.place_q('Wall_Lantern', self.coll, story,
                                 _wall_point(loc, rotq, (0.2, -0.15, 2.35)), rotq)
                lights.point(self.lights_coll, story,
                             _wall_point(loc, rotq, (0.2, -0.6, 2.0)), energy=40.0)
            elif spec.arcade and k == 0 and side == 'front':
                self.kit.place_q('Wall_Arcade', self.coll, story, (*loc, 0), rotq)
            elif not self.accents.keeps_plain(self.plan, side, k, i) and rng.random() < odds:
                self.kit.place_q(f'{prefix}_Window', self.coll, story, (*loc, 0), rotq)
                accent = side == 'front' and self.accents.front_window(spec, k, story, loc, rotq, out)
                if side == 'front' and rng.random() < 0.45 and not accent:
                    self.kit.place_q('Flower_Box', self.coll, story,
                                     _wall_point(loc, rotq, (1.0, -0.36 - out, 1.02)), rotq)
            else:
                self.kit.place_q(prefix, self.coll, story, (*loc, 0), rotq)
                if kind == 'stone' and k == 0 and rng.random() < 0.3:
                    self.kit.place_q('Ivy_Patch', self.coll, story,
                                     _wall_point(loc, rotq, (1.0, -0.15, 0)), rotq)
            if side == 'front' and out:
                self.accents.under_jetty(spec, k, story, loc, rotq, level)
            if spec.pent and upper and side == 'front':
                self.kit.place_q('Pent_Roof', self.coll, story,
                                 _wall_point(loc, rotq, (0, -0.15 - out, STORY - 0.12)), rotq)
        mid = spec.w * GRID / 2
        if spec.banner and k == min(1, len(spec.stories) - 1):
            self.kit.place('Banner_Blue', self.coll, story, (mid, -0.21 - level * JETTY, 2.7))
        if spec.sign and k == 0:
            self.kit.place('Sign_Inn', self.coll, story, (spec.door * GRID - 0.2, -0.15, 2.75))

    def _corners(self, spec, kind, story, level=0):
        """Corner pieces turn a quarter per corner so quoin arms follow both walls.
        The two front corners of a jettied timber story reach out with its face."""
        name = CORNER[kind]
        jettied = level and kind == 'timber'
        for rotq, (x, y) in enumerate(((0, 0), (spec.w, 0), (spec.w, spec.d), (0, spec.d))):
            module = f'Corner_Timber_J{level}_{"LR"[rotq]}' if jettied and rotq < 2 else name
            self.kit.place_q(module, self.coll, story, (x * GRID, y * GRID, 0), rotq)

    def _plinth(self, spec, root):
        """Stone plinth under every wall, corner blocks, and steps up to the door."""
        for side, i, loc, rotq in _segments(spec.w, spec.d):
            self.kit.place_q(f'Plinth_{spec.plinth}', self.coll, root, (*loc, 0), rotq)
            if side == 'front' and i == spec.door:
                self.kit.place_q(f'Entry_Steps_{spec.plinth}', self.coll, root, (*loc, 0), rotq)
        for rotq, (x, y) in enumerate(((0, 0), (spec.w, 0), (spec.w, spec.d), (0, spec.d))):
            self.kit.place_q(f'Plinth_{spec.plinth}_Corner', self.coll, root,
                             (x * GRID, y * GRID, 0), rotq)

    def _floor(self, spec, k, story):
        if k == 0:
            module = lambda i, j: 'Floor_Ground'  # noqa: E731
        elif not spec.floors:
            return
        else:
            side = stair_side(k - 1)
            col = 0 if side == 'L' else spec.w - 1

            def module(i, j):
                return f'Floor_Stairwell_{side}' if i == col and j < 2 else 'Floor_Planks'
        for i in range(spec.w):
            for j in range(spec.d):
                self.kit.place(module(i, j), self.coll, story, (i * GRID, j * GRID, 0))
