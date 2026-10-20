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
from .building_spec import CORNER, GROUND_PENT, WALL_PREFIX, BuildingSpec, jetty_level  # noqa: F401  (re-export)
from .building_spec import segments as _segments
from .config import GRID, JETTY, STORY
from .mesh import wall_point as _wall_point
from .modules.foundations import PLINTHS
from .roof_assembly import RoofAssembler




# Window boxes belong to the lowland families; frontier and mountain walls stay bare.
FLOWER_BOX_KINDS = {'stone', 'timber', 'plank', 'plaster'}


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
            if kind == 'goblin_frame':
                continue
            self.accents.story(spec, self.plan, k, story, top)
            self._floor(spec, k, story)
            if spec.floors and k + 1 < n and spec.stories[k + 1] != 'goblin_frame':
                side = stair_side(k)
                col = 0 if side == 'L' else spec.w - 1
                self.kit.place(f'Stairs_Interior_{side}', self.coll, story, (col * GRID, 0, 0))
            furnish.furnish_story(self.kit, self.coll, story, spec, k)
        for k in range(n if spec.floors else 1):
            if spec.stories[min(k, n - 1)] != 'goblin_frame':
                lights.interior(self.lights_coll, root,
                                (spec.w * GRID / 2, spec.d * GRID / 2, base + k * STORY + 2.3))
        wall_top = base + n * STORY
        if spec.roof == 'goblin_hut':
            lights.point(self.lights_coll, root,
                         (spec.w * GRID / 2, spec.d * GRID / 2, wall_top + 1.8), energy=150.0)
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
        mid = spec.w * GRID / 2
        if kind == 'goblin_frame':
            for _side, _i, loc, rotq in _segments(spec.w, spec.d):
                self.kit.place_q(plain, self.coll, story, (*loc, 0), rotq)
            self.kit.place('Goblin_Ladder', self.coll, story, (mid, -0.18, 0))
            if spec.banner and k == len(spec.stories) - 1:
                self.kit.place('Banner_Goblin_Skull', self.coll, story, (mid, -0.22, 2.75))
            return
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
                             _wall_point(loc, rotq, (0.2, -0.6, 2.0)), energy=45.0)
            elif spec.arcade and k == 0 and side == 'front':
                arc = f'{plain}_Arcade' if kind in ('goblin', 'granite') else 'Wall_Arcade'
                self.kit.place_q(arc, self.coll, story, (*loc, 0), rotq)
            elif (not self.accents.keeps_plain(self.plan, side, k, i)
                  and not (side == 'back' and spec.furnish != 'none'
                           and (spec.furnish != 'church' or (k == 0 and 0 < i < spec.w - 1)))
                  and rng.random() < odds):
                self.kit.place_q(f'{prefix}_Window', self.coll, story, (*loc, 0), rotq)
                accent = side == 'front' and self.accents.front_window(spec, k, story, loc, rotq, out)
                if kind in FLOWER_BOX_KINDS and side == 'front' and rng.random() < 0.25 and not accent:
                    self.kit.place_q('Flower_Box', self.coll, story,
                                     _wall_point(loc, rotq, (1.0, -0.36 - out, 1.02)), rotq)
            else:
                self.kit.place_q(prefix, self.coll, story, (*loc, 0), rotq)
                if kind == 'stone' and k == 0 and rng.random() < 0.3:
                    self.kit.place_q('Ivy_Patch', self.coll, story,
                                     _wall_point(loc, rotq, (1.0, -0.15, 0)), rotq)
            if side == 'front' and out:
                self.accents.under_jetty(spec, k, story, loc, rotq, level)
            if spec.pent and side == 'front' and (
                (k == 0 and not spec.gable_front) if kind in GROUND_PENT else upper
            ):
                pent_mod, (px, py, pz) = GROUND_PENT.get(kind, ('Pent_Roof', (0, -0.15, STORY - 0.12)))
                if k == 0 and i == spec.door and f'{pent_mod}_Door' in self.kit.modules:
                    pent_mod = f'{pent_mod}_Door'   # keeps the way to the door clear of posts
                self.kit.place_q(pent_mod, self.coll, story,
                                 _wall_point(loc, rotq, (px, py - out, pz)), rotq)
        if spec.pent and kind == 'goblin' and spec.gable_front and k == 0:
            self.kit.place('Goblin_Tarp_Canopy', self.coll, story, (mid, -1.25, 0))
            lights.point(self.lights_coll, story, (mid, -1.5, 2.0), energy=65.0)
        if spec.banner and k == len(spec.stories) - 1:
            banner_mod = 'Banner_Goblin_Skull' if kind == 'goblin' else 'Banner_Blue'
            bz = STORY + 0.85 if (kind == 'goblin' and spec.gable_front) else 2.7
            self.kit.place(banner_mod, self.coll, story, (mid, -0.21 - level * JETTY, bz))
        if spec.sign and k == 0 and kind != 'goblin':
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
            if side == 'front' and i == spec.door and spec.stories[0] != 'goblin_frame':
                self.kit.place_q(f'Entry_Steps_{spec.plinth}', self.coll, root, (*loc, 0), rotq)
        for rotq, (x, y) in enumerate(((0, 0), (spec.w, 0), (spec.w, spec.d), (0, spec.d))):
            self.kit.place_q(f'Plinth_{spec.plinth}_Corner', self.coll, root,
                             (x * GRID, y * GRID, 0), rotq)

    def _floor(self, spec, k, story):
        if k == 0:
            ground_floor = 'Floor_Planks' if spec.stories[0] == 'goblin' else 'Floor_Ground'
            module = lambda i, j: ground_floor  # noqa: E731
        elif not spec.floors:
            return
        else:
            side = stair_side(k - 1)
            col = 0 if side == 'L' else spec.w - 1

            def module(i, j):
                if i == col and j == 0:
                    return f'Floor_Stairwell_{side}'
                if i == col and j == 1:
                    return f'Floor_Landing_{side}'
                return 'Floor_Planks'
        for i in range(spec.w):
            for j in range(spec.d):
                self.kit.place(module(i, j), self.coll, story, (i * GRID, j * GRID, 0))
